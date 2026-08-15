// @vitest-environment jsdom
// The browser plugin body: two registrations into published slots, two
// segments into another package's switch, and the faces they hand.
import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionListState, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { ModeSegmentRegistry } from '@omdsh-plugins/omdsh-base/src/client/mode-segments.ts'
import { apply, inject, SESSION_MODES } from '../src/client/index.ts'
import type { ChatModeNoteInjected, PresetSeatInjected } from '../src/client/contract.ts'
import { CHAT_PRESET_ID, CHAT_WORKSPACE_TITLE } from '../src/client/chat-mode.ts'
import { AGENT_PRESET_LOCALE_NS } from '../src/client/preset-display.ts'
import { en } from '../src/client/locales.ts'

/** One recorded slot registration. */
interface Registration {
  options: {
    name: string
    id?: string
    order?: number
    priority?: number
    locale?: string
    inject?: () => unknown
  }
  component: unknown
}

/** The slice of ui-agent-preset's English dictionary this plugin reads. */
const AGENT_PRESET_COPY: Readonly<Record<string, string>> = {
  presetStandardName: 'Standard mode',
  presetStandardDescription: 'Full coding agent with file editing, shell, and more.',
}

/** The roster a deployment running this plugin actually reports. */
const ROSTER = [
  { id: 'standard', trust: 'system' as const, name: '标准模式', isDefault: true },
  { id: 'minimal', trust: 'system' as const, name: '极简模式', isDefault: false },
  { id: CHAT_PRESET_ID, trust: 'user' as const, name: 'Chat Mode', isDefault: false },
]

/** A fake client root plus the service doubles the plugin resolves by name. */
function bench(options: {
  select?: () => Promise<unknown>
  /** Compose without the mode system, the way a profile with no omdsh-base does. */
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
  const noteAgentPreset = vi.fn()
  const select = options.select ?? vi.fn(async () => ({ result: { ok: true, value: {} } }))
  const list = vi.fn(async () => ({
    result: { ok: true, value: { presets: ROSTER, authorable: true, hasDocument: false } },
  }))
  // The REAL registry, imported from the package that publishes it: a spec
  // driving this plugin through a hand-written double would keep passing after
  // the contract moved out from under it.
  const modes = new ModeSegmentRegistry()
  const services: Record<string, unknown> = {
    sessions: { list: sessions, open, clear, noteAgentPreset },
    workspaces: { list: workspaces, startSession },
    connection: { api: { agentPresets: { select, list } } },
    ...options.modes === false ? {} : { sessionModes: modes },
  }
  const registrations: Registration[] = []
  const disposers: (() => void)[] = []
  const ctx = {
    effect: (factory: () => (() => void) | void) => {
      const disposer = factory()
      if (disposer !== undefined) disposers.push(disposer)
    },
    // Real copy, so a segment's label is what a reader would see; the
    // agent-preset namespace is another plugin's, and the locale service
    // answers an unknown key with the key itself.
    locale: {
      register: () => () => {},
      bind: (ns: string) => (key: string) =>
        (ns === AGENT_PRESET_LOCALE_NS ? AGENT_PRESET_COPY[key] : en[key as keyof typeof en]) ?? key,
    },
    on: () => () => {},
    provide: (name: string, value: unknown) => { services[name] = value },
    slots: {
      // The real inject waits for the declaration; the doubles here run the
      // registration straight away, which is the case this spec is about.
      inject: (_name: string, register: () => void) => { register() },
      register: (opts: Registration['options'], component: unknown) => {
        registrations.push({ options: opts, component })
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
  return {
    ctx, modes, registrations, open, clear, startSession, noteAgentPreset, select, list,
    sessions, workspaces, disposers,
  }
}

/** The recorded registration for one slot. */
function entry(b: ReturnType<typeof bench>, name: string): Registration {
  const found = b.registrations.find(registration => registration.options.name === name)
  if (found === undefined) throw new Error(`no registration for ${name}`)
  return found
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

describe('omdsh-justchat browser half', () => {
  it('declares the services it resolves by name', () => {
    expect(inject).toEqual(['slots', 'sessions', 'workspaces', 'locale', 'connection'])
  })

  it('registers the dock note and the preset chip; the switch is not its seat', () => {
    const b = bench()
    // `shell.overlay` is omdsh-base's, and this package reaches it the same
    // way Code mode does — by registering a segment, not by taking a seat.
    expect(b.registrations.map(registration => registration.options.name).sort())
      .toEqual(['conversation.hero.agentPreset', 'conversation.input.dock'])
    // Ahead of the todo/goal/queue rows: what the session IS precedes what it
    // is currently doing.
    expect(entry(b, 'conversation.input.dock').options.order).toBe(-10)
    // The hero chip is a shadow of ui-agent-preset's own, and a single-kind
    // cell goes to the LOWEST priority — a default-0 registration would throw
    // as a duplicate occupant instead.
    expect(entry(b, 'conversation.hero.agentPreset').options.priority).toBe(-1)
  })

  it('offers the roster without the chat preset while the column is in Work', async () => {
    const b = bench()
    const face = entry(b, 'conversation.hero.agentPreset').options.inject?.() as PresetSeatInjected
    await face.load()
    const state = face.hooks.presetSeat.getSnapshot()
    expect(state.options.map(option => option.id)).toEqual(['standard', 'minimal'])
    expect(state.fixed).toBe(false)
    // The deployment default is what the next session gets.
    expect(state.current).toBe('standard')
  })

  it('states the chat preset, and only it, once the column is in Chat', async () => {
    const b = bench()
    const face = entry(b, 'conversation.hero.agentPreset').options.inject?.() as PresetSeatInjected
    await face.load()
    b.sessions.set({
      ...b.sessions.getSnapshot(),
      ids: ['c1' as never],
      byId: { ['c1' as never]: { id: 'c1' as never, displayTitle: 'c1', running: false, blank: true, updatedAt: 1 } },
      current: 'c1' as never,
    })
    b.workspaces.set({
      ...b.workspaces.getSnapshot(),
      items: [{ ...b.workspaces.getSnapshot().items[0]!, sessionIds: ['c1' as never] }],
    })
    const state = face.hooks.presetSeat.getSnapshot()
    expect(state.options.map(option => option.id)).toEqual([CHAT_PRESET_ID])
    // Nothing to choose between: the mode already decided the composition.
    expect(state.fixed).toBe(true)
    expect(state.current).toBe(CHAT_PRESET_ID)
  })

  it('names a shipped preset out of the dictionary the harness localizes it in', () => {
    const b = bench()
    const face = entry(b, 'conversation.hero.agentPreset').options.inject?.() as PresetSeatInjected
    // The file on disk says 标准模式; an English reader must not be shown it.
    expect(face.describe({ id: 'standard', trust: 'system', name: '标准模式' })).toEqual({
      name: 'Standard mode',
      description: AGENT_PRESET_COPY.presetStandardDescription,
    })
    // A locally authored preset is never translated: its file is its copy.
    expect(face.describe({ id: CHAT_PRESET_ID, trust: 'user', name: 'Chat Mode' }).name).toBe('Chat Mode')
  })

  it('registers its own two segments and reports the derived mode through them', () => {
    const b = bench()
    const dock = entry(b, 'conversation.input.dock').options.inject?.() as ChatModeNoteInjected
    // The dock note still reads the raw derived state; the switch reads the
    // registry, which is the door every posture arrives through.
    expect(dock.hooks.chatMode.getSnapshot()).toEqual({ mode: 'work', ready: true })
    expect(b.modes.store.getSnapshot().map(segment => ({
      id: segment.id, label: segment.label, active: segment.active, available: segment.available,
    }))).toEqual([
      { id: 'chat', label: 'Chat', active: false, available: true },
      { id: 'work', label: 'Work', active: true, available: true },
    ])
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
    // Routing the request to the active posture is omdsh-base's job; hearing
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

  it('leaves both segments behind when no mode system is composed', () => {
    // The off state, and the reason the segments ride a restricted fiber: the
    // surfaces that read the derived mode keep working, and the two pills are
    // simply not there.
    const b = bench({ modes: false })
    expect(b.registrations.map(registration => registration.options.name).sort())
      .toEqual(['conversation.hero.agentPreset', 'conversation.input.dock'])
    const dock = entry(b, 'conversation.input.dock').options.inject?.() as ChatModeNoteInjected
    expect(dock.hooks.chatMode.getSnapshot()).toEqual({ mode: 'work', ready: true })
  })

  it('names the registry by the wire word omdsh-base publishes it under', () => {
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

  it('composes a blank chat session through the agent-preset RPC', async () => {
    const b = bench()
    b.sessions.set({
      ...b.sessions.getSnapshot(),
      ids: ['c1' as never],
      byId: { ['c1' as never]: { id: 'c1' as never, displayTitle: 'c1', running: false, blank: true, updatedAt: 1 } },
      current: 'c1' as never,
    })
    b.workspaces.set({
      ...b.workspaces.getSnapshot(),
      items: [{ ...b.workspaces.getSnapshot().items[0]!, sessionIds: ['c1' as never] }],
    })
    await vi.waitFor(() => { expect(b.select).toHaveBeenCalled() })
    expect(b.select).toHaveBeenCalledWith({ sessionId: 'c1', agentPreset: CHAT_PRESET_ID })
    await vi.waitFor(() => { expect(b.noteAgentPreset).toHaveBeenCalledWith('c1', CHAT_PRESET_ID) })
  })

  it('leaves the session alone when the host refuses the composition', async () => {
    const refuse = vi.fn(async () => ({
      result: { ok: false, error: { message: 'unknown preset "chat"' } },
    }))
    const b = bench({ select: refuse })
    b.sessions.set({
      ...b.sessions.getSnapshot(),
      ids: ['c1' as never],
      byId: { ['c1' as never]: { id: 'c1' as never, displayTitle: 'c1', running: false, blank: true, updatedAt: 1 } },
      current: 'c1' as never,
    })
    b.workspaces.set({
      ...b.workspaces.getSnapshot(),
      items: [{ ...b.workspaces.getSnapshot().items[0]!, sessionIds: ['c1' as never] }],
    })
    await vi.waitFor(() => { expect(refuse).toHaveBeenCalled() })
    // A rejected swap must not be recorded as one, and must not throw past
    // the controller: the session simply keeps the deployment default.
    expect(b.noteAgentPreset).not.toHaveBeenCalled()
  })

  it('stops deriving when the plugin fiber goes away', () => {
    const b = bench()
    for (const dispose of b.disposers) dispose()
    b.sessions.set({ ...b.sessions.getSnapshot(), current: 'c1' as never })
    // No throw, and nothing was navigated on the way out.
    expect(b.open).not.toHaveBeenCalled()
  })
})
