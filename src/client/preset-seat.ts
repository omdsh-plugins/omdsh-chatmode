/**
 * Which agent preset the next session runs — offered per MODE.
 *
 * The deployment's preset roster is one list, the same in every workspace, so
 * a picker built straight on it offers `chat` while the user is in a project
 * and offers four coding compositions while the user is in the Chat workspace.
 * Neither is choosable in any useful sense: Chat mode's whole definition is
 * the tool-free composition, and a project session put on it could not touch
 * the project.
 *
 * So the mode filters the roster. In Work the chip offers everything EXCEPT
 * `chat`; in Chat there is nothing to offer — the mode already decided — and
 * the chip states the composition instead of pretending to a choice.
 *
 * The rest is the ordinary hero-chip contract: the new-session screen has no
 * session, so a pick is staged and reaches a session when one becomes current
 * and is still blank. What it adds is re-deriving the shown preset whenever
 * the current session changes, which is what keeps the chip from reporting the
 * preset of the session the user just left.
 * @module @omdsh-plugins/omdsh-chatmode/src/client/preset-seat
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ObservableSnapshot, SessionId, SessionListState, SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatModeState } from './contract.ts'
import { CHAT_PRESET_ID } from './chat-mode.ts'
import type { PresetOption } from './preset-display.ts'

/** One roster row, as the host's `agentPresets.list` reports it. */
export interface RosterPreset extends PresetOption {
  /** Whether a session naming no preset gets this one. */
  readonly isDefault: boolean
  /** Why the preset cannot compose a session, absent when it can. */
  readonly broken?: string
}

/** What the chip renders from. */
export interface PresetSeatState {
  /** The presets this mode offers, already filtered. */
  readonly options: readonly PresetOption[]
  /** The offered preset currently shown, empty until the roster loads. */
  readonly current: string
  /**
   * True while the mode decides the composition (Chat): the chip states it
   * rather than offering a menu, because there is no second answer.
   */
  readonly fixed: boolean
  /** A switch is in flight; the chip is inert until it settles. */
  readonly busy: boolean
  /** A rejected read or switch, cleared by the next attempt. */
  readonly error: string | null
}

const INITIAL: PresetSeatState = {
  options: [], current: '', fixed: false, busy: false, error: null,
}

/** Everything the controller reaches outside itself, so a spec can drive it whole. */
export interface PresetSeatDeps {
  /** The live session list — which session a pick would land on. */
  readonly sessions: ObservableSnapshot<SessionListState>
  /** The derived mode, which decides what the roster is filtered to. */
  readonly mode: ObservableSnapshot<ChatModeState>
  /**
   * Read the deployment's roster.
   * @returns every preset the host currently supplies.
   */
  roster(): Promise<readonly RosterPreset[]>
  /**
   * Recompose one still-blank session.
   * @param sessionId - the session to switch.
   * @param preset - the preset to compose it from.
   * @returns the preset the host actually composed.
   */
  select(sessionId: SessionId, preset: string): Promise<string>
  /**
   * Publish an applied switch into the session list, so the header label moves
   * with the composition instead of waiting for the next full refresh.
   * @param sessionId - the switched session.
   * @param preset - the preset it now runs.
   */
  noteApplied(sessionId: SessionId, preset: string): void
}

/** Human text for a rejected call; a host may reject with anything. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether two option lists name the same presets in the same order. */
function sameOptions(a: readonly PresetOption[], b: readonly PresetOption[]): boolean {
  return a.length === b.length && a.every((option, index) => option === b[index])
}

/** Offers the mode's presets, and hands a pick to the session it lands on. */
export class PresetSeatController {
  /** The snapshot the chip renders from. */
  readonly store: SnapshotStore<PresetSeatState> = createSnapshotStore(INITIAL)

  /** The whole roster as last read; the mode filters it per render. */
  private roster: readonly RosterPreset[] = []

  /** The deployment default, so a consumed stage falls back without a re-read. */
  private fallback = ''

  /** Set while a pick is waiting for a session; cleared once applied. */
  private staged: string | undefined

  /** @param deps - see {@link PresetSeatDeps}. */
  constructor(private readonly deps: PresetSeatDeps) {}

  /**
   * Begin following the session list and the mode.
   * @returns the disposer, unsubscribing from both.
   */
  start(): () => void {
    const settle = (): void => { this.settle() }
    const stops = [this.deps.sessions.subscribe(settle), this.deps.mode.subscribe(settle)]
    settle()
    return () => {
      for (const stop of stops) stop()
    }
  }

  /**
   * Read the roster and settle the chip on it.
   * @returns once the snapshot reflects the host.
   */
  async load(): Promise<void> {
    let presets: readonly RosterPreset[]
    try {
      presets = await this.deps.roster()
    } catch (error) {
      this.set({ error: messageOf(error) })
      return
    }
    // A broken preset stays on the host's roster so a management surface can
    // show and delete it; offering it here would only defer its reason to a
    // failed session start.
    this.roster = presets.filter(preset => preset.broken === undefined)
    this.fallback = this.roster.find(preset => preset.isDefault)?.id ?? this.roster[0]?.id ?? ''
    this.set({ error: null })
    this.settle()
  }

  /**
   * Stage one preset for the session about to start, applying it immediately
   * when a blank session is already current.
   * @param id - the preset to stage.
   * @returns once the stage settled, and the apply too when one happened.
   */
  async select(id: string): Promise<void> {
    if (this.store.getSnapshot().busy) return
    this.staged = id
    this.set({ current: id, error: null })
    await this.apply()
  }

  /** Re-derive what this mode offers and what of it is shown. */
  private settle(): void {
    const chat = this.deps.mode.getSnapshot().mode === 'chat'
    // Chat mode composes its own sessions (chat-mode.ts owns that call), so a
    // stage carried into it would be a second writer of the same fact.
    if (chat) this.staged = undefined
    const options = this.roster.filter(preset => (preset.id === CHAT_PRESET_ID) === chat)
    const current = chat ? options[0]?.id ?? '' : this.shown(options)
    const snapshot = this.store.getSnapshot()
    if (snapshot.current !== current || snapshot.fixed !== chat || !sameOptions(snapshot.options, options)) {
      this.set({ options, current, fixed: chat })
    }
    void this.apply()
  }

  /**
   * Which offered preset the chip shows: the staged pick, then whatever the
   * current session already runs, then the deployment default. The middle term
   * is what makes the chip follow navigation — moving to another workspace
   * shows THAT session's composition rather than the one left behind.
   * @param options - the presets this mode offers.
   * @returns the id to show, empty when the mode offers nothing.
   */
  private shown(options: readonly PresetOption[]): string {
    const wanted = this.staged ?? this.currentSession()?.agentPreset ?? this.fallback
    if (options.some(option => option.id === wanted)) return wanted
    // The session runs a preset this mode does not offer, or one that has
    // since been deleted; the default is the honest thing to show instead.
    if (options.some(option => option.id === this.fallback)) return this.fallback
    return options[0]?.id ?? ''
  }

  /** Hand the staged pick to the session it was meant for, if one is there. */
  private async apply(): Promise<void> {
    const staged = this.staged
    if (staged === undefined) return
    const session = this.currentSession()
    if (session === undefined) return
    // A started session's history was produced under its own composition; the
    // host refuses the swap, so the stage is no longer meaningful.
    if (!session.blank || session.agentPreset === staged) {
      this.staged = undefined
      return
    }
    this.set({ busy: true, error: null })
    try {
      const applied = await this.deps.select(session.id, staged)
      this.staged = undefined
      this.set({ busy: false, current: applied })
      this.deps.noteApplied(session.id, applied)
    } catch (error) {
      this.staged = undefined
      this.set({ busy: false, error: messageOf(error) })
      // Nothing was composed, so the chip goes back to reporting the session.
      this.settle()
    }
  }

  /** The session a pick would land on, when one is current. */
  private currentSession(): SessionListState['byId'][SessionId] | undefined {
    const state = this.deps.sessions.getSnapshot()
    return state.current === undefined ? undefined : state.byId[state.current]
  }

  /** Patch the snapshot. */
  private set(patch: Partial<PresetSeatState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }
}
