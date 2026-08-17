// The Chat workspace stays the first sidebar group: what the order owes, and
// the reconciler that pays it once per real change.
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceId, WorkspaceListState, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import { CHAT_WORKSPACE_TITLE } from '../src/client/chat-mode.ts'
import { ChatPinController, pinMove } from '../src/client/pin.ts'

const wid = (id: string): WorkspaceId => id as WorkspaceId

/** One workspace row. */
function workspace(id: string, title: string): WorkspaceView {
  return {
    workspaceId: wid(id),
    path: `/w/${id}`,
    title,
    sessionIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** A workspace list state around one order. */
function state(items: WorkspaceView[], baselinesReady = true): WorkspaceListState {
  return {
    items,
    archivedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
    baselinesReady,
    recentWorkspaceId: undefined,
  }
}

/**
 * A started controller over a live store, with a `move` that reorders the
 * store the way the runtime's optimistic install does.
 */
function bench(items: WorkspaceView[], options: { fail?: boolean } = {}) {
  const store = createSnapshotStore<WorkspaceListState>(state(items))
  const move = vi.fn(async (workspaceId: WorkspaceId, beforeWorkspaceId: WorkspaceId) => {
    if (options.fail === true) throw new Error('refused')
    const current = store.getSnapshot().items
    const without = current.filter(item => item.workspaceId !== workspaceId)
    const at = without.findIndex(item => item.workspaceId === beforeWorkspaceId)
    const moved = current.find(item => item.workspaceId === workspaceId)
    if (moved === undefined) return
    store.set({ ...store.getSnapshot(), items: [...without.slice(0, at), moved, ...without.slice(at)] })
  })
  const controller = new ChatPinController({ workspaces: store, move })
  const stop = controller.start()
  /** Publish a new order, the way a host frame does. */
  const publish = (next: WorkspaceView[]): void => {
    store.set({ ...store.getSnapshot(), items: next })
  }
  const order = (): string[] => store.getSnapshot().items.map(item => item.workspaceId)
  return { controller, store, move, stop, publish, order }
}

describe('pinMove: what the order owes', () => {
  it('owes nothing while the baselines have not landed', () => {
    expect(pinMove(state([workspace('p', 'proj'), workspace('c', CHAT_WORKSPACE_TITLE)], false)))
      .toBeUndefined()
  })

  it('owes nothing on an empty list', () => {
    expect(pinMove(state([]))).toBeUndefined()
  })

  it('owes nothing where no workspace carries the Chat title', () => {
    expect(pinMove(state([workspace('p', 'proj')]))).toBeUndefined()
  })

  it('owes nothing when Chat is already first', () => {
    expect(pinMove(state([workspace('c', CHAT_WORKSPACE_TITLE), workspace('p', 'proj')])))
      .toBeUndefined()
  })

  it('moves Chat above whatever is first', () => {
    const move = pinMove(state([
      workspace('p', 'proj'), workspace('q', 'other'), workspace('c', CHAT_WORKSPACE_TITLE),
    ]))
    expect(move).toEqual({ workspaceId: 'c', beforeWorkspaceId: 'p' })
  })

  // A user may name a second workspace Chat. The first one in host order is
  // the group already at the top of their sidebar, so nothing is owed rather
  // than two rows trading places.
  it('reads the first Chat-titled row, so a second one starts no fight', () => {
    expect(pinMove(state([workspace('c', CHAT_WORKSPACE_TITLE), workspace('d', CHAT_WORKSPACE_TITLE)])))
      .toBeUndefined()
  })
})

describe('ChatPinController: holding the order', () => {
  it('corrects an order that starts wrong, on start', async () => {
    const b = bench([workspace('p', 'proj'), workspace('c', CHAT_WORKSPACE_TITLE)])
    await vi.waitFor(() => { expect(b.order()).toEqual(['c', 'p']) })
    b.stop()
  })

  it('leaves a correct order alone', async () => {
    const b = bench([workspace('c', CHAT_WORKSPACE_TITLE), workspace('p', 'proj')])
    await Promise.resolve()
    expect(b.move).not.toHaveBeenCalled()
    b.stop()
  })

  // The case this exists for: opening a project prepends a workspace while the
  // page is running, which is exactly what the boot-time pin cannot answer.
  it('puts Chat back after a new project is prepended', async () => {
    const b = bench([workspace('c', CHAT_WORKSPACE_TITLE)])
    b.publish([workspace('n', 'new'), workspace('c', CHAT_WORKSPACE_TITLE)])
    await vi.waitFor(() => { expect(b.order()).toEqual(['c', 'n']) })
    expect(b.move).toHaveBeenCalledTimes(1)
    b.stop()
  })

  it('settles after one move rather than answering its own publish', async () => {
    const b = bench([workspace('p', 'proj'), workspace('c', CHAT_WORKSPACE_TITLE)])
    await vi.waitFor(() => { expect(b.order()).toEqual(['c', 'p']) })
    await Promise.resolve()
    expect(b.move).toHaveBeenCalledTimes(1)
    b.stop()
  })

  it('does not repeat a refused move until the order really changes', async () => {
    const b = bench([workspace('p', 'proj'), workspace('c', CHAT_WORKSPACE_TITLE)], { fail: true })
    await vi.waitFor(() => { expect(b.move).toHaveBeenCalledTimes(1) })
    b.publish([workspace('p', 'proj'), workspace('c', CHAT_WORKSPACE_TITLE)])
    await Promise.resolve()
    expect(b.move).toHaveBeenCalledTimes(1)
    b.publish([workspace('p', 'proj'), workspace('q', 'other'), workspace('c', CHAT_WORKSPACE_TITLE)])
    await vi.waitFor(() => { expect(b.move).toHaveBeenCalledTimes(2) })
    b.stop()
  })

  it('stops watching when disposed', async () => {
    const b = bench([workspace('c', CHAT_WORKSPACE_TITLE)])
    b.stop()
    b.publish([workspace('n', 'new'), workspace('c', CHAT_WORKSPACE_TITLE)])
    await Promise.resolve()
    expect(b.move).not.toHaveBeenCalled()
  })
})
