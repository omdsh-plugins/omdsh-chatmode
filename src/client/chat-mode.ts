/**
 * What mode the conversation column is in, and the two gestures that change
 * it.
 *
 * The mode is DERIVED, never stored: a session is a chat exactly when it is
 * accounted under the managed Chat workspace. That is what keeps the switch
 * honest when the user reaches a conversation some other way — clicking a row
 * in the sidebar moves the switch, because the switch is only reporting where
 * the current session lives. A stored flag would sooner or later disagree
 * with the screen.
 *
 * Switching, then, is not a state write but a navigation: enter the mode's
 * most recent conversation, or start a new one where that mode keeps them.
 * @module @omdsh-plugins/omdsh-justchat/src/client/chat-mode
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ObservableSnapshot, SessionId, SessionListState, SnapshotStore, WorkspaceId, WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatModeState, SessionMode } from './contract.ts'

/**
 * Display title of the host-managed Chat workspace. The host half owns this
 * name and re-asserts it every boot; it is also the group heading the user
 * reads in the sidebar, which is what makes looking the workspace up by it
 * a product fact rather than a hidden coupling.
 */
export const CHAT_WORKSPACE_TITLE = 'Chat'

/** Preset id every chat session is put on: the tool-free composition. */
export const CHAT_PRESET_ID = 'chat'

const INITIAL: ChatModeState = { mode: 'work', ready: false }

/** Everything the controller reaches outside itself, so a spec can drive it whole. */
export interface ChatModeDeps {
  /** The live session list (current selection, blank flag, preset). */
  readonly sessions: ObservableSnapshot<SessionListState>
  /** The live workspace list — where the Chat workspace is found. */
  readonly workspaces: ObservableSnapshot<WorkspaceListState>
  /**
   * Select an existing session.
   * @param id - the session to make current.
   */
  open(id: SessionId): void
  /** Drop the selection into the no-session view state (the workspace picker). */
  clear(): void
  /**
   * Connect a workspace and open its reusable or new blank session.
   * @param workspaceId - the workspace to start in.
   */
  startSession(workspaceId: WorkspaceId): void
  /**
   * Put one still-blank session on the tool-free chat composition.
   * @param sessionId - the blank session to switch.
   * @returns completion; a rejection leaves the session on its default preset.
   */
  applyChatPreset(sessionId: SessionId): Promise<void>
}

/** Derives the mode, drives the two gestures, and keeps chat sessions tool-free. */
export class ChatModeController {
  /** The snapshot the switch renders from. */
  readonly store: SnapshotStore<ChatModeState> = createSnapshotStore(INITIAL)

  /**
   * The last session the user had open in each mode, so switching back
   * returns to the conversation they left rather than a blank one.
   */
  private readonly lastSession: Partial<Record<SessionMode, SessionId>> = {}

  /**
   * Sessions this controller already asked the host to compose as chats.
   * Remembered so a user who deliberately picks another preset for a chat
   * session is not overruled on the next list update.
   */
  private readonly presetApplied = new Set<SessionId>()

  /** The selection the last derivation saw, so a navigation can be told from a refresh. */
  private lastCurrent: SessionId | undefined

  /** @param deps - see {@link ChatModeDeps}. */
  constructor(private readonly deps: ChatModeDeps) {}

  /**
   * Begin deriving the mode from the live lists.
   * @returns the disposer, unsubscribing from both.
   */
  start(): () => void {
    const recompute = (): void => { this.recompute() }
    const stops = [this.deps.sessions.subscribe(recompute), this.deps.workspaces.subscribe(recompute)]
    recompute()
    return () => {
      for (const stop of stops) stop()
    }
  }

  /**
   * A New Session was requested — from the sidebar, a workspace row, or this
   * controller itself.
   *
   * It exists because that gesture is the one navigation with nothing to
   * derive from. `startSession` REUSES the workspace's existing blank
   * conversation when there is one, so pressing New Session while already on
   * it moves no selection, changes no list, and publishes no store — and a
   * posture holding the conversation column would go on holding it while the
   * user asks, again, for the conversation it is covering. Asking is the
   * whole fact; this is where it is recorded.
   */
  requestedNewSession(): void {
    // Forcing a publish rather than recomputing: the derived mode is already
    // right, and what the switch's listeners have to do is re-assert it so the
    // registry's one-active-segment rule hands the column back.
    this.store.set({ ...this.store.getSnapshot() })
  }

  /** Enter Chat: the most recent chat conversation, else a new one. */
  enterChat(): void {
    const chat = this.chatWorkspace()
    // Nowhere to put the conversation yet (the host half has not registered
    // the workspace, or the list has not caught up) — refuse rather than
    // start a chat somewhere arbitrary.
    if (chat === undefined) return
    const remembered = this.rememberedIn('chat')
    if (remembered !== undefined) {
      this.deps.open(remembered)
      return
    }
    this.deps.startSession(chat.workspaceId)
  }

  /** Enter Work: the most recent working conversation, else the workspace picker. */
  enterWork(): void {
    const remembered = this.rememberedIn('work')
    if (remembered !== undefined) {
      this.deps.open(remembered)
      return
    }
    const workspaces = this.deps.workspaces.getSnapshot()
    // The first non-chat workspace is the sidebar's own top group, so
    // starting there lands where the user would have clicked anyway.
    const target = workspaces.items.find(item => item.title !== CHAT_WORKSPACE_TITLE)
    if (target !== undefined) {
      this.deps.startSession(target.workspaceId)
      return
    }
    // No project workspace registered at all: the cold-start posture, whose
    // whole job is asking for one.
    this.deps.clear()
  }

  /**
   * Whether one conversation is a chat — the same rule the switch is derived
   * from, asked about any session rather than the current one, which is what
   * a surface marking a whole list (the sidebar's dots) needs.
   * @param sessionId - the conversation being classified.
   * @returns true when the managed Chat workspace accounts for it.
   */
  owns(sessionId: string): boolean {
    return this.chatWorkspace()?.sessionIds.includes(sessionId as SessionId) === true
  }

  /** Re-derive the mode and settle everything that follows from it. */
  private recompute(): void {
    const chat = this.chatWorkspace()
    const sessions = this.deps.sessions.getSnapshot()
    const current = sessions.current
    const mode: SessionMode = current !== undefined && chat?.sessionIds.includes(current) === true
      ? 'chat'
      : 'work'

    if (current !== undefined && sessions.byId[current] !== undefined) this.lastSession[mode] = current

    // A NAVIGATION republishes even when the derived mode is unchanged, and
    // that is what puts the column back after another posture took it. The
    // switch reports where the user is; opening a conversation is the user
    // saying where they are. Without this, going from a working conversation
    // to another one — New Session is exactly that — leaves whatever mode a
    // contributed segment had taken sitting on top of the column, because
    // work-to-work looked like nothing happening.
    const navigated = current !== this.lastCurrent
    this.lastCurrent = current

    const next: ChatModeState = { mode, ready: chat !== undefined }
    const snapshot = this.store.getSnapshot()
    if (navigated || snapshot.mode !== next.mode || snapshot.ready !== next.ready) this.store.set(next)

    if (mode !== 'chat' || current === undefined) return
    const summary = sessions.byId[current]
    // Only a session that has not run yet can be recomposed, and only once:
    // the host refuses the swap afterwards, and a user who chose another
    // preset for this chat keeps it.
    if (summary === undefined || !summary.blank) return
    if (summary.agentPreset === CHAT_PRESET_ID || this.presetApplied.has(current)) return
    this.presetApplied.add(current)
    void this.deps.applyChatPreset(current).catch(() => {
      // The session stays on the deployment default — a chat with tools,
      // which is worse than intended but far better than a dead screen.
    })
  }

  /** The managed Chat workspace, when the list already carries it. */
  private chatWorkspace(): WorkspaceListState['items'][number] | undefined {
    return this.deps.workspaces.getSnapshot().items.find(item => item.title === CHAT_WORKSPACE_TITLE)
  }

  /**
   * The remembered session for one mode, dropped once the list no longer has
   * it (archived elsewhere, or removed in another tab).
   * @param mode - the mode being entered.
   * @returns a still-listed session id, or undefined.
   */
  private rememberedIn(mode: SessionMode): SessionId | undefined {
    const remembered = this.lastSession[mode]
    if (remembered === undefined) return undefined
    if (this.deps.sessions.getSnapshot().byId[remembered] !== undefined) return remembered
    delete this.lastSession[mode]
    return undefined
  }
}
