/**
 * The vocabulary Chat mode's pieces share.
 *
 * There is no slot contract here any more, and that is the point: this package
 * contributes no seat to the conversation view. It used to hold two — a dock
 * note and a shadow of the harness's preset chip — and both belonged to a mode
 * that decided the agent composition. It no longer does, so the shipped chip is
 * back in its own seat and this file is down to the derived fact everything
 * else reads.
 *
 * The switch itself is not here and not this package's: it rides
 * `shell.overlay` for `@omdsh-plugins/omdsh-basemode`, which renders whatever
 * postures are registered. Chat and Work are two of them.
 * @module @omdsh-plugins/omdsh-chatmode/src/client/contract
 */

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
