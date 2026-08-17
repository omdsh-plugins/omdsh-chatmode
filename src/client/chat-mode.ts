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
 *
 * The mode decides WHERE a conversation lives and nothing else. It used to
 * decide the agent composition too — every chat session was recomposed onto a
 * tool-free preset — and no longer does: a chat runs the deployment's default
 * preset like any other session, and the harness's own chip above the composer
 * is where a reader picks a different one.
 * @module @omdsh-plugins/omdsh-chatmode/src/client/chat-mode
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
   * The directory the conversation column is SHOWING, when a mode system is
   * composed and its column is in one.
   *
   * Not the selected conversation's directory, and that is the whole reason it
   * is asked for: a posture whose column is not the web conversation shows a
   * project without selecting anything in it — Code mode's terminal is the
   * case — so the selection can be a conversation in another project entirely
   * while the user is plainly looking at this one.
   *
   * Undefined is a profile with no mode system, or a column whose conversation
   * has no directory. Switching then falls back to the memory that spans
   * projects, which is what this gesture did before the question could be
   * asked at all.
   * @returns the directory, or undefined.
   */
  columnCwd(): string | undefined
  /**
   * Whether another posture claims one conversation.
   *
   * Work is the everything-else posture, so "the project's most recent
   * conversation" has to exclude the ones that are not its: opening a Code
   * conversation shows a terminal, which would put the column straight back
   * into the mode this gesture is leaving.
   * @param sessionId - the conversation being considered.
   * @returns true when some other segment owns it.
   */
  claimedElsewhere(sessionId: SessionId): boolean
}

/** Derives the mode and drives the two gestures. */
export class ChatModeController {
  /** The snapshot the switch renders from. */
  readonly store: SnapshotStore<ChatModeState> = createSnapshotStore(INITIAL)

  /**
   * The last session the user had open in each mode, wherever it was, so
   * switching back returns to the conversation they left rather than a blank
   * one. Read when the column is in no project of its own — from a chat, or
   * with no mode system composed.
   */
  private readonly lastSession: Partial<Record<SessionMode, SessionId>> = {}

  /**
   * The same memory, per project.
   *
   * One memory per mode is what made switching walk between projects: a mode
   * whose column is not the web conversation never moves the selection, so
   * after opening a terminal in one project the remembered "last working
   * conversation" is still the one from wherever the user was before — and
   * pressing Work took them back there instead of to the project on screen.
   * Keyed `mode` and workspace both; see {@link ChatModeController.memoryKey}.
   */
  private readonly lastInProject = new Map<string, SessionId>()

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

  /**
   * Enter Work: the working conversation of the project the user is IN.
   *
   * Switching postures is a move between ways of looking at one project, not a
   * move between projects. So the project on screen answers first — the one
   * the column is showing, which is the terminal's project while Code holds it
   * — and every answer below stays inside it: the conversation last left there,
   * else its most recent one, else a new one started there. Reaching for
   * another project's conversation because it happens to be the one most
   * recently selected is the bug this ordering exists to prevent.
   *
   * Only a column in no project of its own falls through to the memory that
   * spans them: a chat, or a page with no mode system at all, where "the
   * project the user is in" has no answer and "take me back to work" does.
   */
  enterWork(): void {
    const project = this.columnProject()
    if (project !== undefined) {
      const landing = this.rememberedIn('work', project.workspaceId)
        ?? this.recentIn(project.workspaceId)
      if (landing !== undefined) {
        this.deps.open(landing)
        return
      }
      // A project with nothing of Work's in it yet: start one there rather
      // than leaving for a project that has one.
      this.deps.startSession(project.workspaceId)
      return
    }
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

    if (current !== undefined && sessions.byId[current] !== undefined) {
      this.lastSession[mode] = current
      // And where it was, so entering this mode again from that project comes
      // back here rather than to whatever was open last anywhere.
      const workspaceId = this.workspaceOf(current)
      if (workspaceId !== undefined) this.lastInProject.set(memoryKey(mode, workspaceId), current)
    }

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
  }

  /** The managed Chat workspace, when the list already carries it. */
  private chatWorkspace(): WorkspaceListState['items'][number] | undefined {
    return this.deps.workspaces.getSnapshot().items.find(item => item.title === CHAT_WORKSPACE_TITLE)
  }

  /**
   * The remembered session for one mode, dropped once the list no longer has
   * it (archived elsewhere, or removed in another tab).
   * @param mode - the mode being entered.
   * @param workspaceId - the project it is being entered IN, when the column
   * is in one; absent asks the memory that spans projects.
   * @returns a still-listed session id, or undefined.
   */
  private rememberedIn(mode: SessionMode, workspaceId?: WorkspaceId): SessionId | undefined {
    if (workspaceId === undefined) {
      const remembered = this.lastSession[mode]
      if (remembered === undefined) return undefined
      if (this.deps.sessions.getSnapshot().byId[remembered] !== undefined) return remembered
      delete this.lastSession[mode]
      return undefined
    }
    const key = memoryKey(mode, workspaceId)
    const remembered = this.lastInProject.get(key)
    if (remembered === undefined) return undefined
    if (this.deps.sessions.getSnapshot().byId[remembered] !== undefined) return remembered
    this.lastInProject.delete(key)
    return undefined
  }

  /**
   * The project the column is showing, when that is a project to work in.
   *
   * The managed Chat workspace is not one, and the exclusion is what pressing
   * Work from a chat means: leaving Chat, not opening a working conversation
   * in the directory chats happen to be stored in.
   * @returns the workspace, or undefined.
   */
  private columnProject(): WorkspaceListState['items'][number] | undefined {
    const cwd = this.deps.columnCwd()
    if (cwd === undefined || cwd === '') return undefined
    const workspace = this.deps.workspaces.getSnapshot().items.find(item => item.path === cwd)
    if (workspace === undefined || workspace.title === CHAT_WORKSPACE_TITLE) return undefined
    return workspace
  }

  /**
   * The project's most recent conversation of Work's own — what entering Work
   * there means before this session has left one to remember.
   *
   * Recency is the session list's own `updatedAt`, which is what the sidebar
   * orders by, so this is the row a person would have clicked at the top of
   * that project's group. Two exclusions, and both are about landing somewhere
   * worth landing:
   *
   * - **Conversations another posture claims.** Opening one shows that
   *   posture's column instead, which would undo the press.
   * - **Blank ones, unless they are all there is.** A blank conversation is
   *   recent because it was CREATED recently, not because anything happened in
   *   it — and a project collects them, one per New Session that was pressed
   *   and walked away from. Coming back to an empty prompt while the project
   *   holds real work is the wrong answer. When a project has nothing else,
   *   one of them IS the answer: it is the New Session row, and opening it
   *   beats starting a further conversation beside it.
   * @param workspaceId - the project being entered.
   * @returns the conversation, or undefined when the project has none at all.
   */
  private recentIn(workspaceId: WorkspaceId): SessionId | undefined {
    const workspace = this.deps.workspaces.getSnapshot().items
      .find(item => item.workspaceId === workspaceId)
    if (workspace === undefined) return undefined
    const sessions = this.deps.sessions.getSnapshot()
    let said: { id: SessionId; at: number } | undefined
    let blank: { id: SessionId; at: number } | undefined
    for (const id of workspace.sessionIds) {
      const summary = sessions.byId[id]
      if (summary === undefined || this.deps.claimedElsewhere(id)) continue
      const best = summary.blank ? blank : said
      if (best !== undefined && summary.updatedAt <= best.at) continue
      if (summary.blank) blank = { id, at: summary.updatedAt }
      else said = { id, at: summary.updatedAt }
    }
    return (said ?? blank)?.id
  }

  /**
   * The project one conversation is accounted under.
   * @param sessionId - the conversation.
   * @returns its workspace, or undefined while it is grouped nowhere.
   */
  private workspaceOf(sessionId: SessionId): WorkspaceId | undefined {
    return this.deps.workspaces.getSnapshot().items
      .find(item => item.sessionIds.includes(sessionId))?.workspaceId
  }
}

/**
 * The key one mode's memory of one project is held under.
 * @param mode - the posture.
 * @param workspaceId - the project.
 * @returns the map key; the separator is a character no id carries.
 */
function memoryKey(mode: SessionMode, workspaceId: WorkspaceId): string {
  return `${mode} ${workspaceId}`
}
