// @vitest-environment jsdom
// The browser plugin body: two segments into another package's switch, over
// one derived fact, and no seat of its own anywhere in the conversation view.
import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionListState, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { ModeSegmentRegistry } from '@omdsh-plugins/omdsh-basemode/src/client/mode-segments.ts'
import { apply, inject, SESSION_MODES } from '../src/client/index.ts'
import { CHAT_WORKSPACE_TITLE } from '../src/client/chat-mode.ts'
import { en } from '../src/client/locales.ts'

/** A fake client root plus the service doubles the plugin resolves by name. */
function bench(options: {
  /** Compose without the mode system, the way a profile with no omdsh-basemode does. */
  modes?: false
} = {}) {
  const sessions = createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready',
    subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  } as SessionListState)
  const workspaces = createSnapshotStore<WorkspaceListState>({
    items: [{
      workspaceId: 'w-chat' as never,
      path: '/home/.dsh/chat',
      title: CHAT_WORKSPACE_TITLE,
      sessionIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  const open = vi.fn()
  const clear = vi.fn()
  const startSession = vi.fn()
  // The REAL registry, imported from the package that publishes it: a spec
  // driving this plugin through a hand-written double would keep passing after
  // the contract moved out from under it.
  const modes = new ModeSegmentRegistry()
  // What this plugin HANDS the registry, recorded before it goes in: a field
  // the published registry is too old to store is still this package's to
  // declare, and nothing else would notice it going missing.
  const registered: Record<string, unknown>[] = []
  const passThrough = modes.register.bind(modes)
  modes.register = (segment) => {
    registered.push(segment as unknown as Record<string, unknown>)
    return passThrough(segment)
  }
  const services: Record<string, unknown> = {
    sessions: { list: sessions, open, clear },
    workspaces: { list: workspaces, startSession },
    ...options.modes === false ? {} : { sessionModes: modes },
  }
  const registrations: string[] = []
  const disposers: (() => void)[] = []
  const ctx = {
    effect: (factory: () => (() => void) | void) => {
      const disposer = factory()
      if (disposer !== undefined) disposers.push(disposer)
    },
    // Real copy, so a segment's label is what a reader would see.
    locale: {
      register: () => () => {},
      bind: () => (key: string) => en[key as keyof typeof en] ?? key,
    },
    on: () => () => {},
    provide: (name: string, value: unknown) => { services[name] = value },
    // Present and recording: the point of the assertion below is that this
    // package asks it for nothing.
    slots: {
      inject: (_name: string, register: () => void) => { register() },
      register: (opts: { name: string }) => {
        registrations.push(opts.name)
        return () => {}
      },
    },
    get: (name: string) => services[name],
    // The real restricted fiber waits for every named service and never runs
    // without them; the double answers the same question the specs ask.
    inject: (names: string[], callback: (sctx: unknown) => void) => {
      if (names.every(name => services[name] !== undefined)) callback(ctx)
    },
  } as unknown as ClientContext

  apply(ctx)
  return { ctx, modes, registered, registrations, open, clear, startSession, sessions, workspaces, disposers }
}

/**
 * Open a conversation, as the sidebar does — a navigation the derived mode
 * sees.
 * @param b - the bench.
 * @param sessionId - the conversation now current.
 */
function openSession(b: ReturnType<typeof bench>, sessionId: string): void {
  b.sessions.set({
    ...b.sessions.getSnapshot(),
    ids: [sessionId as never],
    byId: {
      [sessionId as never]: {
        id: sessionId as never, displayTitle: sessionId, running: false, blank: false, updatedAt: 1,
      },
    },
    current: sessionId as never,
  } as SessionListState)
}

describe('omdsh-chatmode browser half', () => {
  it('declares the services it resolves by name', () => {
    // No `connection`: the agent-preset RPC went with the composition this
    // mode used to impose. No `slots` either — see below.
    expect(inject).toEqual(['sessions', 'workspaces', 'locale'])
  })

  it('takes no seat in the conversation view', () => {
    // It used to hold two — a dock note and a shadow of ui-agent-preset's own
    // chip — and both belonged to a mode that decided the composition. The
    // shipped chip is back in its seat, offering every preset the deployment
    // supplies, which is the whole of "the mode no longer decides".
    const b = bench()
    expect(b.registrations).toEqual([])
  })

  it('registers its own two segments and reports the derived mode through them', () => {
    const b = bench()
    expect(b.modes.store.getSnapshot().map(segment => ({
      id: segment.id, label: segment.label, active: segment.active, available: segment.available,
    }))).toEqual([
      { id: 'chat', label: 'Chat', active: false, available: true },
      { id: 'work', label: 'Work', active: true, available: true },
    ])
  })

  it('declares that a chat is in no project, and a working conversation is', () => {
    // The declaration a surface deriving a DIRECTORY from the conversation on
    // screen reads — Code mode, which used to open a terminal inside the
    // folder chats are filed in. It rides a spread so an older registry drops
    // it rather than refusing to compile, which is exactly the shape a spec
    // has to hold: nothing else would notice it going missing.
    const b = bench()
    expect(b.registered.find(segment => segment.id === 'chat')?.inProject).toBe(false)
    // Work says nothing, which is the default and the honest answer: a working
    // conversation lives in the project directory it is grouped under.
    expect(b.registered.find(segment => segment.id === 'work')?.inProject).toBeUndefined()
  })

  it('wires each segment press to the session and workspace services', () => {
    const b = bench()
    b.modes.enter('chat')
    expect(b.startSession).toHaveBeenCalledWith('w-chat')
    b.modes.enter('work')
    // Only the Chat workspace is registered, so Work lands on the picker.
    expect(b.clear).toHaveBeenCalledOnce()
  })

  it('shares the switch with any other plugin\'s posture', () => {
    const b = bench()
    const modes = b.modes
    const dispose = modes.register({ id: 'code', order: 20, label: 'Code', enter: () => {} })
    expect(modes.store.getSnapshot().map(segment => segment.id)).toEqual(['chat', 'work', 'code'])

    // Exactly one segment is on: taking the column clears Work's flag, which
    // is how Work learns it lost the screen.
    modes.update('code', { active: true })
    expect(modes.store.getSnapshot().find(segment => segment.id === 'work')?.active).toBe(false)
    expect(modes.store.getSnapshot().find(segment => segment.id === 'code')?.active).toBe(true)

    // Pressing Work takes it back, without waiting for a session change.
    modes.enter('work')
    expect(modes.store.getSnapshot().find(segment => segment.id === 'code')?.active).toBe(false)
    expect(modes.store.getSnapshot().find(segment => segment.id === 'work')?.active).toBe(true)

    dispose()
    expect(modes.store.getSnapshot().map(segment => segment.id)).toEqual(['chat', 'work'])
  })

  it('takes the column back on a New Session the frame answered', () => {
    // Routing the request to the active posture is omdsh-basemode's job; hearing
    // that no posture took it is this package's, because that gesture leaves
    // nothing else to derive from — the runtime reuses a workspace's blank
    // session and opens the id that was already open, so nothing moves and a
    // posture would hold the column through a request for the conversation it
    // is covering.
    const b = bench()
    const modes = b.modes
    modes.register({ id: 'code', order: 20, label: 'Code', enter: () => {} })
    modes.update('code', { active: true })

    modes.announceNewSession('w-chat')
    expect(modes.store.getSnapshot().find(segment => segment.id === 'code')?.active).toBe(false)
    expect(modes.store.getSnapshot().find(segment => segment.id === 'work')?.active).toBe(true)
  })

  it('stops listening for that when the plugin goes away', () => {
    const b = bench()
    const modes = b.modes
    modes.register({ id: 'code', order: 20, label: 'Code', enter: () => {} })
    modes.update('code', { active: true })
    for (const dispose of b.disposers) dispose()

    modes.announceNewSession('w-chat')
    expect(modes.store.getSnapshot().find(segment => segment.id === 'code')?.active).toBe(true)
  })

  it('mounts without a mode system, and contributes nothing at all', () => {
    // The off state, and the reason the segments ride a restricted fiber: a
    // profile with no omdsh-basemode gets two missing pills rather than a dead
    // page.
    const b = bench({ modes: false })
    expect(b.registrations).toEqual([])
    expect(b.modes.store.getSnapshot()).toEqual([])
  })

  it('names the registry by the wire word omdsh-basemode publishes it under', () => {
    // A literal on both sides rather than a shared symbol: cordis binds
    // services by name, and a cross-plugin value import is a purity error.
    expect(SESSION_MODES).toBe('sessionModes')
  })

  it('leaves a contributed posture\'s own conversation to it', () => {
    // Opening a Code conversation is a navigation, and the derived modes answer
    // it too. Taking the column here would only have it taken back a microtask
    // later, once its owner answers the same event — a flicker of the wrong
    // column, and a terminal torn down and rebuilt for nothing.
    const b = bench()
    const modes = b.modes
    modes.register({
      id: 'code',
      order: 20,
      label: 'Code',
      owns: (sessionId: string) => sessionId.startsWith('code-session-'),
      enter: () => {},
    })
    modes.update('code', { active: true })
    openSession(b, 'code-session-1')
    expect(modes.store.getSnapshot().find(segment => segment.id === 'code')?.active).toBe(true)
    expect(modes.store.getSnapshot().find(segment => segment.id === 'work')?.active).toBe(false)
  })

  it('still hands the column over when the reader presses Work on one', () => {
    // The one gesture that means "show me this conversation in the web view",
    // and the only thing that could say so is the press itself.
    const b = bench()
    const modes = b.modes
    modes.register({
      id: 'code',
      order: 20,
      label: 'Code',
      owns: (sessionId: string) => sessionId.startsWith('code-session-'),
      enter: () => {},
    })
    modes.update('code', { active: true })
    openSession(b, 'code-session-1')

    modes.enter('work')
    expect(b.open).toHaveBeenCalledWith('code-session-1')
    expect(modes.store.getSnapshot().find(segment => segment.id === 'code')?.active).toBe(false)
    expect(modes.store.getSnapshot().find(segment => segment.id === 'work')?.active).toBe(true)
  })

  it('stops deriving when the plugin fiber goes away', () => {
    const b = bench()
    for (const dispose of b.disposers) dispose()
    b.sessions.set({ ...b.sessions.getSnapshot(), current: 'c1' as never })
    // No throw, and nothing was navigated on the way out.
    expect(b.open).not.toHaveBeenCalled()
  })
})
