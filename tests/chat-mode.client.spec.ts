// @vitest-environment jsdom
// The derived mode and the two navigations. Nothing about compositions: the
// mode decides where a conversation lives and stopped deciding what it runs.
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  SessionId, SessionListState, WorkspaceId, WorkspaceListState, WorkspaceView,
} from '@deepseek-ai/dsh-client-runtime/client'
import { CHAT_WORKSPACE_TITLE, ChatModeController } from '../src/client/chat-mode.ts'

const sid = (id: string): SessionId => id as SessionId
const wid = (id: string): WorkspaceId => id as WorkspaceId

/** One workspace row. */
function workspace(id: string, title: string, sessionIds: SessionId[] = []): WorkspaceView {
  return {
    workspaceId: wid(id),
    path: `/w/${id}`,
    title,
    sessionIds,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** One session summary row. */
function row(id: string, extra: { blank?: boolean; updatedAt?: number } = {}) {
  return {
    id: sid(id),
    displayTitle: id,
    running: false,
    blank: extra.blank ?? false,
    updatedAt: extra.updatedAt ?? 1,
  }
}

/** A driven controller over two live stores. */
function bench(options: {
  workspaces?: WorkspaceView[]
  sessions?: ReturnType<typeof row>[]
  current?: string
  /** What the column is SHOWING, when a mode system reports a directory. */
  columnCwd?: string
  /** Conversations another posture claims, which Work may not land on. */
  claimed?: string[]
} = {}) {
  const rows = options.sessions ?? []
  const sessions = createSnapshotStore<SessionListState>({
    ids: rows.map(entry => entry.id),
    byId: Object.fromEntries(rows.map(entry => [entry.id, entry])),
    ...(options.current === undefined ? {} : { current: sid(options.current) }),
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as SessionListState)
  const workspaces = createSnapshotStore<WorkspaceListState>({
    items: options.workspaces ?? [],
    archivedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
    baselinesReady: true,
    recentWorkspaceId: undefined,
  })
  const open = vi.fn()
  const clear = vi.fn()
  const startSession = vi.fn()
  let columnCwd = options.columnCwd
  const controller = new ChatModeController({
    sessions,
    workspaces,
    open,
    clear,
    startSession,
    columnCwd: () => columnCwd,
    claimedElsewhere: (sessionId: SessionId) => (options.claimed ?? []).includes(sessionId),
  })
  const stop = controller.start()
  return {
    controller, sessions, workspaces, open, clear, startSession, stop,
    /** Move the column to another project, the way pressing a mode does. */
    showColumn: (cwd: string | undefined) => { columnCwd = cwd },
  }
}

/** Publish a new current session into the list store. */
function select(store: ReturnType<typeof bench>['sessions'], current: string | undefined): void {
  store.set({ ...store.getSnapshot(), ...(current === undefined ? { current: undefined } : { current: sid(current) }) })
}

describe('ChatModeController: the derived mode', () => {
  it('reports work, and not ready, until the managed Chat workspace lands', () => {
    const b = bench()
    expect(b.controller.store.getSnapshot()).toEqual({ mode: 'work', ready: false })
    b.workspaces.set({
      ...b.workspaces.getSnapshot(),
      items: [workspace('chat', CHAT_WORKSPACE_TITLE)],
    })
    expect(b.controller.store.getSnapshot()).toEqual({ mode: 'work', ready: true })
    b.stop()
  })

  it('follows the current session into and out of the Chat workspace', () => {
    const b = bench({
      workspaces: [workspace('chat', CHAT_WORKSPACE_TITLE, [sid('c1')]), workspace('proj', 'proj', [sid('w1')])],
      sessions: [row('c1'), row('w1')],
      current: 'w1',
    })
    expect(b.controller.store.getSnapshot().mode).toBe('work')

    // Opening a chat from the sidebar moves the switch: the switch reports
    // where the session lives, it does not decide it.
    select(b.sessions, 'c1')
    expect(b.controller.store.getSnapshot().mode).toBe('chat')

    select(b.sessions, 'w1')
    expect(b.controller.store.getSnapshot().mode).toBe('work')
    b.stop()
  })

  it('republishes on a navigation even when the mode is unchanged', () => {
    // This is how the column comes back from a contributed posture. Another
    // mode may be holding it, and only a segment marking itself active clears
    // the rest — so work-to-work has to be an event rather than a no-op, or
    // opening a second working conversation (New Session is exactly that)
    // would leave that posture on top of a conversation it is not showing.
    const b = bench({
      workspaces: [workspace('proj', 'proj', [sid('w1'), sid('w2')])],
      sessions: [row('w1'), row('w2')],
      current: 'w1',
    })
    const published = vi.fn()
    b.controller.store.subscribe(published)
    select(b.sessions, 'w2')
    expect(b.controller.store.getSnapshot().mode).toBe('work')
    expect(published).toHaveBeenCalled()
    b.stop()
  })

  it('republishes for a New Session request that moves nothing', () => {
    // The runtime reuses a workspace's blank conversation, so pressing New
    // Session while already on it opens the id that is already open: no
    // selection moves and no list changes. Without this the switch would keep
    // reporting a posture that is covering the very screen being asked for.
    const b = bench({
      workspaces: [workspace('proj', 'proj', [sid('w1')])],
      sessions: [row('w1')],
      current: 'w1',
    })
    const published = vi.fn()
    b.controller.store.subscribe(published)
    b.controller.requestedNewSession()
    expect(published).toHaveBeenCalledOnce()
    expect(b.controller.store.getSnapshot()).toEqual({ mode: 'work', ready: false })
    b.stop()
  })

  it('says nothing when the list churns under an unchanged selection', () => {
    // The other half of the same rule: a running flag or a token count moving
    // is not a navigation, and re-asserting there would pull the column out
    // from under a posture the user just chose.
    const b = bench({
      workspaces: [workspace('proj', 'proj', [sid('w1')])],
      sessions: [row('w1')],
      current: 'w1',
    })
    const published = vi.fn()
    b.controller.store.subscribe(published)
    b.sessions.set({ ...b.sessions.getSnapshot() })
    expect(published).not.toHaveBeenCalled()
    b.stop()
  })
})

describe('ChatModeController: entering a mode', () => {
  it('starts a chat in the managed workspace, then returns to the one it left', () => {
    const b = bench({ workspaces: [workspace('chat', CHAT_WORKSPACE_TITLE)] })
    b.controller.enterChat()
    expect(b.startSession).toHaveBeenCalledWith(wid('chat'))

    // The session the flow produced becomes the remembered chat.
    b.sessions.set({ ...b.sessions.getSnapshot(), ids: [sid('c1')], byId: { [sid('c1')]: row('c1') }, current: sid('c1') })
    b.workspaces.set({
      ...b.workspaces.getSnapshot(),
      items: [workspace('chat', CHAT_WORKSPACE_TITLE, [sid('c1')])],
    })
    select(b.sessions, undefined)

    b.controller.enterChat()
    expect(b.open).toHaveBeenCalledWith(sid('c1'))
    // Remembered, so no second blank session was started.
    expect(b.startSession).toHaveBeenCalledTimes(1)
    b.stop()
  })

  it('refuses to enter chat while the workspace is missing', () => {
    const b = bench()
    b.controller.enterChat()
    // Starting a chat in some arbitrary directory is worse than doing nothing;
    // the switch renders the segment disabled for the same reason.
    expect(b.startSession).not.toHaveBeenCalled()
    expect(b.open).not.toHaveBeenCalled()
    b.stop()
  })

  it('enters work at the first project workspace, and at the picker with none', () => {
    const withProject = bench({
      workspaces: [workspace('chat', CHAT_WORKSPACE_TITLE), workspace('proj', 'proj')],
    })
    withProject.controller.enterWork()
    expect(withProject.startSession).toHaveBeenCalledWith(wid('proj'))
    withProject.stop()

    const chatOnly = bench({ workspaces: [workspace('chat', CHAT_WORKSPACE_TITLE)] })
    chatOnly.controller.enterWork()
    // Nothing to work in yet: the no-session posture is the screen whose whole
    // job is asking for a directory.
    expect(chatOnly.clear).toHaveBeenCalledTimes(1)
    expect(chatOnly.startSession).not.toHaveBeenCalled()
    chatOnly.stop()
  })

  it('enters work in the project the COLUMN is in, not the one last selected', () => {
    // The bug this ordering exists for: a posture whose column is a terminal
    // shows project B without selecting anything in it, so the selection is
    // still project A's conversation — and pressing Work walked the user back
    // to A.
    const b = bench({
      workspaces: [
        workspace('chat', CHAT_WORKSPACE_TITLE),
        workspace('a', 'a', [sid('a1')]),
        workspace('b', 'b', [sid('b1')]),
      ],
      sessions: [row('a1'), row('b1')],
      current: 'a1',
    })
    // Code mode took the column for project B; the selection never moved.
    b.showColumn('/w/b')
    b.controller.enterWork()
    expect(b.open).toHaveBeenCalledWith(sid('b1'))
    b.stop()
  })

  it('returns to the conversation it left in THIS project', () => {
    const b = bench({
      workspaces: [
        workspace('chat', CHAT_WORKSPACE_TITLE),
        workspace('b', 'b', [sid('b1'), sid('b2')]),
      ],
      sessions: [row('b1', { updatedAt: 9 }), row('b2', { updatedAt: 1 })],
      current: 'b1',
    })
    // Read the older one, then go somewhere else entirely.
    select(b.sessions, 'b2')
    b.showColumn('/w/b')
    b.controller.enterWork()
    // Not b1, which is the project's most recent: the memory of this project
    // outranks its recency, which is what "the conversation you left" means.
    expect(b.open).toHaveBeenCalledWith(sid('b2'))
    b.stop()
  })

  it('never lands on a conversation another posture claims', () => {
    // Opening a Code conversation shows a terminal, which would put the column
    // straight back into the mode this press is leaving.
    const b = bench({
      workspaces: [workspace('chat', CHAT_WORKSPACE_TITLE), workspace('b', 'b', [sid('code-1'), sid('b1')])],
      sessions: [row('code-1', { updatedAt: 9 }), row('b1', { updatedAt: 1 })],
      claimed: ['code-1'],
      columnCwd: '/w/b',
    })
    b.controller.enterWork()
    expect(b.open).toHaveBeenCalledWith(sid('b1'))
    b.stop()
  })

  it('comes back to what was said, not to a blank left behind beside it', () => {
    // A project collects blank conversations, one per New Session pressed and
    // walked away from, and each is "recent" because it was created recently.
    // Landing on an empty prompt while the project holds real work is wrong.
    const b = bench({
      workspaces: [workspace('chat', CHAT_WORKSPACE_TITLE), workspace('b', 'b', [sid('b1'), sid('blank')])],
      sessions: [row('b1', { updatedAt: 1 }), row('blank', { blank: true, updatedAt: 9 })],
      columnCwd: '/w/b',
    })
    b.controller.enterWork()
    expect(b.open).toHaveBeenCalledWith(sid('b1'))
    b.stop()
  })

  it('opens the blank when a blank is all the project has', () => {
    // That row IS the project's New Session; opening it beats starting a
    // further conversation beside it.
    const b = bench({
      workspaces: [workspace('chat', CHAT_WORKSPACE_TITLE), workspace('b', 'b', [sid('blank')])],
      sessions: [row('blank', { blank: true })],
      columnCwd: '/w/b',
    })
    b.controller.enterWork()
    expect(b.open).toHaveBeenCalledWith(sid('blank'))
    expect(b.startSession).not.toHaveBeenCalled()
    b.stop()
  })

  it('starts one in this project rather than leaving for a project that has one', () => {
    const b = bench({
      workspaces: [
        workspace('chat', CHAT_WORKSPACE_TITLE),
        workspace('a', 'a', [sid('a1')]),
        workspace('b', 'b', []),
      ],
      sessions: [row('a1')],
      current: 'a1',
      columnCwd: '/w/b',
    })
    b.controller.enterWork()
    expect(b.open).not.toHaveBeenCalled()
    expect(b.startSession).toHaveBeenCalledWith(wid('b'))
    b.stop()
  })

  it('falls back to the memory that spans projects when the column is a chat', () => {
    // Pressing Work from a chat is asking to LEAVE Chat, and the directory
    // chats are stored in is not a project to work in — so "take me back to
    // work" is the honest answer there.
    const b = bench({
      workspaces: [
        workspace('chat', CHAT_WORKSPACE_TITLE, [sid('c1')]),
        workspace('a', 'a', [sid('a1')]),
      ],
      sessions: [row('c1'), row('a1')],
      current: 'a1',
    })
    select(b.sessions, 'c1')
    b.showColumn('/w/chat')
    b.controller.enterWork()
    expect(b.open).toHaveBeenCalledWith(sid('a1'))
    b.stop()
  })

  it('forgets a remembered session the list no longer carries', () => {
    const b = bench({
      workspaces: [workspace('chat', CHAT_WORKSPACE_TITLE, [sid('c1')])],
      sessions: [row('c1')],
      current: 'c1',
    })
    // Archived from the sidebar, in this tab or another one.
    b.sessions.set({ ...b.sessions.getSnapshot(), ids: [], byId: {}, current: undefined })
    b.controller.enterChat()
    expect(b.open).not.toHaveBeenCalled()
    expect(b.startSession).toHaveBeenCalledWith(wid('chat'))
    b.stop()
  })
})
