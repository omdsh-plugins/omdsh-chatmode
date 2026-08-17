/**
 * Keep the managed Chat workspace at the top of the sidebar, for as long as
 * the page is open.
 *
 * The host half already puts it there — and that is enough right up to the
 * moment somebody opens a project. `workspaceRegistry.create` PREPENDS a new
 * workspace, so the group a person keeps every conversation in slides down one
 * place for each directory they add, and it slides while the app is running.
 * A boot-time assertion cannot answer a thing that happens after boot.
 *
 * The registry publishes no event to hook, so this is a RECONCILER rather than
 * an interception: the browser is already told about every workspace the
 * sidebar draws, because it draws them from this very list, and the sidebar's
 * group order IS the registry order. So read the order that is about to be
 * rendered, and when Chat is not the first row, ask the host to move it back —
 * through the same `insertBefore` the drag-to-reorder gesture calls, which is
 * what makes the correction durable rather than one tab's private appearance.
 *
 * Two facts make it settle instead of oscillate:
 *
 * - the move is issued only when the snapshot disagrees, and the runtime
 *   installs the new order OPTIMISTICALLY on its way to the host, so the
 *   re-entrant publish that lands during the write already reads as correct;
 * - a refused move rolls the order back, and an order already attempted is not
 *   attempted again until it really changes. A host that keeps saying no costs
 *   one request, not a spin.
 *
 * This one workspace is where both this plugin's conversations and
 * `omdsh-sidechat`'s standalone side conversations are accounted, so pinning it
 * is what pins them both, and sidechat needs to know nothing about it.
 *
 * It is a pin, which means it outranks a drag: moving the Chat group down the
 * sidebar puts it back. That is the same trade the title makes — the host half
 * re-asserts `Chat` over a rename — and for the same reason. Both are facts
 * this plugin manages, not the user's arrangement of their own projects.
 * @module @omdsh-plugins/omdsh-chatmode/src/client/pin
 */

import type {
  ObservableSnapshot, WorkspaceId, WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import { CHAT_WORKSPACE_TITLE } from './chat-mode.ts'

/** One reorder: `workspaceId` goes immediately before `beforeWorkspaceId`. */
export interface PinMove {
  /** The workspace to move — always the Chat one. */
  readonly workspaceId: WorkspaceId
  /** The row it must land above, which is whatever is first right now. */
  readonly beforeWorkspaceId: WorkspaceId
}

/**
 * The move that would put Chat back on top, or undefined when nothing is owed.
 *
 * Nothing is owed before the baselines land (the list is empty then, and an
 * empty list is not evidence of an order), when no workspace carries the Chat
 * title (a profile whose host half has not created it yet, or a deployment
 * that never composed one), or when it is already the first row.
 *
 * The workspace is matched by TITLE, the same product fact `ChatModeController`
 * derives the mode from and `omdsh-sidechat` finds its home with. Should a user
 * name a second workspace `Chat`, the first one in host order is the one this
 * reads — which is the one already at the top of their sidebar, so the answer
 * is "nothing owed" rather than a fight between two rows.
 * @param state - the live workspace list.
 * @returns the move, or undefined when the order is already right.
 */
export function pinMove(state: WorkspaceListState): PinMove | undefined {
  if (!state.baselinesReady) return undefined
  const [first] = state.items
  if (first === undefined) return undefined
  const chat = state.items.find(item => item.title === CHAT_WORKSPACE_TITLE)
  if (chat === undefined || chat.workspaceId === first.workspaceId) return undefined
  return { workspaceId: chat.workspaceId, beforeWorkspaceId: first.workspaceId }
}

/** Everything the pin reaches outside itself, so a spec can drive it whole. */
export interface ChatPinDeps {
  /** The live workspace list, in the order the sidebar groups render. */
  readonly workspaces: ObservableSnapshot<WorkspaceListState>
  /**
   * Move a workspace within the registry display order.
   * @param workspaceId - the workspace to move.
   * @param beforeWorkspaceId - the row it lands above.
   * @returns completion; a rejection leaves the order as the host has it.
   */
  move(workspaceId: WorkspaceId, beforeWorkspaceId: WorkspaceId): Promise<void>
}

/** Holds the Chat workspace first in the registry order while it is started. */
export class ChatPinController {
  /** A move is in flight; the publish it causes is not a reason for another. */
  private settling = false

  /**
   * The order a move was last issued against, so a refused one is not repeated
   * until the order really changes. Undefined before the first attempt.
   */
  private attempted: string | undefined

  /** @param deps - see {@link ChatPinDeps}. */
  constructor(private readonly deps: ChatPinDeps) {}

  /**
   * Watch the workspace order and correct it.
   * @returns the disposer that stops watching.
   */
  start(): () => void {
    const settle = (): void => { void this.settle() }
    const stop = this.deps.workspaces.subscribe(settle)
    settle()
    return stop
  }

  /**
   * Read the order once and issue at most one move.
   * @returns once the move the current order owes has been answered.
   */
  async settle(): Promise<void> {
    if (this.settling) return
    const state = this.deps.workspaces.getSnapshot()
    const move = pinMove(state)
    if (move === undefined) return
    const order = state.items.map(item => item.workspaceId).join(' ')
    if (order === this.attempted) return
    this.attempted = order
    this.settling = true
    try {
      await this.deps.move(move.workspaceId, move.beforeWorkspaceId)
    } catch {
      // The order is the host's to keep, and it has already rolled its own
      // optimistic edit back. A sidebar whose groups are in the wrong order is
      // not worth an error on a page that is otherwise working, and the next
      // real change to the order tries again.
    } finally {
      this.settling = false
    }
  }
}
