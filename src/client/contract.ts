/**
 * What the two Chat-mode surfaces are handed, and the vocabulary they share.
 *
 * Both live in slots the harness already declares — `conversation.input.dock`
 * (the full-width row above the composer card) and
 * `conversation.hero.agentPreset` (the chip beside the new-session workspace
 * picker), both from ui-conversation — so no SlotMap merge belongs here: this
 * package contributes entries and declares nothing.
 *
 * The switch itself is not here and not this package's: it rides
 * `shell.overlay` for `@omdsh-plugins/omdsh-base`, which renders whatever
 * postures are registered. Chat and Work are two of them.
 * @module @omdsh-plugins/omdsh-justchat/src/client/contract
 */

import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { PresetDisplayText, PresetOption } from './preset-display.ts'
import type { PresetSeatState } from './preset-seat.ts'
// Type-only: pulls ui-conversation's SlotMap merge (both target slots) into
// this program. A value import would be a purity error.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/**
 * The two kinds of session this deployment offers. Derived, never stored: a
 * session is a chat when it lives in the managed Chat workspace, so the mode
 * follows whatever the user opened rather than a flag that can disagree with
 * the screen.
 */
export type SessionMode = 'chat' | 'work'

/** What the switch renders from. */
export interface ChatModeState {
  /** The mode the conversation column is showing right now. */
  mode: SessionMode
  /**
   * False until the host's managed Chat workspace appears in the workspace
   * list — the switch stays visible but cannot enter a mode that has nowhere
   * to put the conversation.
   */
  ready: boolean
}

/** Injected face of the dock note: the derived mode it renders for. */
export interface ChatModeNoteInjected {
  /** Framework-bound sources: the same derived mode the switch mirrors. */
  hooks: { chatMode: ObservableSnapshot<ChatModeState> }
}

/**
 * Full dock-note props: the input-region owner share (`session`/`input`
 * snapshots), the injected mode, and copy.
 */
export type ChatModeNoteProps =
  PropsRuntime<'conversation.input.dock'>
  & InjectFace<ChatModeNoteInjected>
  & PropsLocale<'justchat'>

/**
 * Injected face of the preset chip: what this mode offers, how to pick, and
 * how a preset is named on screen.
 *
 * `describe` is a function rather than resolved copy because the roster is
 * language-independent and the names are not: it reads the active locale at
 * call time, out of the dictionary `ui-agent-preset` registers.
 */
export interface PresetSeatInjected {
  /** Framework-bound sources: the mode-filtered roster and what is shown. */
  hooks: { presetSeat: ObservableSnapshot<PresetSeatState> }
  /**
   * Read the roster when the chip first renders.
   * @returns once the snapshot reflects the host.
   */
  load: () => Promise<void>
  /**
   * Pick one preset for the session about to start.
   * @param id - the chosen preset.
   * @returns once the pick settled.
   */
  select: (id: string) => Promise<void>
  /**
   * Name one preset for the reader.
   * @param option - the roster row being rendered.
   * @returns its copy in the active language.
   */
  describe: (option: PresetOption) => PresetDisplayText
}

/** Full preset-chip props: the hero seat's owner share, the face, and copy. */
export type PresetSeatProps =
  PropsRuntime<'conversation.hero.agentPreset'>
  & InjectFace<PresetSeatInjected>
  & PropsLocale<'justchat'>
