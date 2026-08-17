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
function row(id: string, extra: { blank?: boolean } = {}) {
  return {
    id: sid(id),
    displayTitle: id,
    running: false,
    blank: extra.blank ?? false,
    updatedAt: 1,
  }
}

/** A driven controller over two live stores. */
function bench(options: {
  workspaces?: WorkspaceView[]
  sessions?: ReturnType<typeof row>[]
  current?: string
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
  const controller = new ChatModeController({ sessions, workspaces, open, clear, startSession })
  const stop = controller.start()
  return { controller, sessions, workspaces, open, clear, startSession, stop }
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
