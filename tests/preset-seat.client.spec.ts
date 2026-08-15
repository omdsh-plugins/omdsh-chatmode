// @vitest-environment jsdom
// The preset chip's controller: which presets a mode offers, which one it
// reports, and how a pick reaches the session it was made for.
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatModeState } from '../src/client/contract.ts'
import { CHAT_PRESET_ID } from '../src/client/chat-mode.ts'
import { PresetSeatController, type RosterPreset } from '../src/client/preset-seat.ts'

const ROSTER: readonly RosterPreset[] = [
  { id: 'standard', trust: 'system', name: '标准模式', isDefault: true },
  { id: 'minimal', trust: 'system', name: '极简模式', isDefault: false },
  { id: CHAT_PRESET_ID, trust: 'user', name: 'Chat Mode', isDefault: false },
]

/** One session row, reduced to what the chip reads. */
function session(id: string, blank: boolean, agentPreset?: string) {
  return {
    id: id as SessionId,
    displayTitle: id,
    running: false,
    blank,
    updatedAt: 1,
    ...agentPreset === undefined ? {} : { agentPreset },
  }
}

/** A controller over stores a spec can drive, plus the calls it makes. */
function bench(options: {
  roster?: () => Promise<readonly RosterPreset[]>
  select?: (sessionId: SessionId, preset: string) => Promise<string>
} = {}) {
  const sessions = createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready',
    subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  } as SessionListState)
  const mode = createSnapshotStore<ChatModeState>({ mode: 'work', ready: true })
  const roster = vi.fn(options.roster ?? (async () => ROSTER))
  const select = vi.fn(options.select ?? (async (_id: SessionId, preset: string) => preset))
  const noteApplied = vi.fn()
  const controller = new PresetSeatController({ sessions, mode, roster, select, noteApplied })
  const stop = controller.start()
  /** Make one session current, creating its row. */
  const open = (id: string, blank: boolean, agentPreset?: string): void => {
    sessions.set({
      ...sessions.getSnapshot(),
      ids: [id as SessionId],
      byId: { [id as SessionId]: session(id, blank, agentPreset) },
      current: id as SessionId,
    })
  }
  return { controller, sessions, mode, roster, select, noteApplied, stop, open }
}

describe('PresetSeatController', () => {
  it('offers everything but the chat preset while the column is in Work', async () => {
    const b = bench()
    await b.controller.load()
    const state = b.controller.store.getSnapshot()
    expect(state.options.map(option => option.id)).toEqual(['standard', 'minimal'])
    expect(state.current).toBe('standard')
    expect(state.fixed).toBe(false)
  })

  it('offers only the chat preset, as a statement, while the column is in Chat', async () => {
    const b = bench()
    await b.controller.load()
    b.mode.set({ mode: 'chat', ready: true })
    const state = b.controller.store.getSnapshot()
    expect(state.options.map(option => option.id)).toEqual([CHAT_PRESET_ID])
    expect(state.current).toBe(CHAT_PRESET_ID)
    // The mode already decided; a menu here would be a control that does nothing.
    expect(state.fixed).toBe(true)
  })

  it('reports the current session rather than the one the user left', async () => {
    const b = bench()
    await b.controller.load()
    b.mode.set({ mode: 'chat', ready: true })
    b.open('c1', true, CHAT_PRESET_ID)
    expect(b.controller.store.getSnapshot().current).toBe(CHAT_PRESET_ID)

    // Moving to a project session: the chip must not keep announcing the chat
    // composition, which is exactly what a chip that only reads its roster on
    // mount would do.
    b.mode.set({ mode: 'work', ready: true })
    b.open('w1', true, 'minimal')
    expect(b.controller.store.getSnapshot().current).toBe('minimal')
  })

  it('falls back to the deployment default when the session runs a preset this mode hides', async () => {
    const b = bench()
    await b.controller.load()
    // A chat session read from the work column — reachable by opening a chat
    // conversation from the sidebar before the mode has settled.
    b.open('c1', true, CHAT_PRESET_ID)
    expect(b.controller.store.getSnapshot().current).toBe('standard')
  })

  it('hands a pick to the blank session it was made for', async () => {
    const b = bench()
    await b.controller.load()
    b.open('w1', true, 'standard')
    await b.controller.select('minimal')
    expect(b.select).toHaveBeenCalledWith('w1', 'minimal')
    expect(b.noteApplied).toHaveBeenCalledWith('w1', 'minimal')
    expect(b.controller.store.getSnapshot().current).toBe('minimal')
  })

  it('stages a pick made before any session exists, and applies it when one arrives', async () => {
    const b = bench()
    await b.controller.load()
    await b.controller.select('minimal')
    expect(b.select).not.toHaveBeenCalled()
    expect(b.controller.store.getSnapshot().current).toBe('minimal')

    b.open('w1', true, 'standard')
    await vi.waitFor(() => { expect(b.select).toHaveBeenCalledWith('w1', 'minimal') })
  })

  it('refuses a session whose conversation has started', async () => {
    const b = bench()
    await b.controller.load()
    b.open('w1', false, 'standard')
    await b.controller.select('minimal')
    // The host would refuse the swap: that history was produced under the
    // preset the session began with.
    expect(b.select).not.toHaveBeenCalled()
  })

  it('drops a pending pick on the way into Chat, where the mode composes', async () => {
    const b = bench()
    await b.controller.load()
    await b.controller.select('minimal')
    b.mode.set({ mode: 'chat', ready: true })
    b.open('c1', true, undefined)
    // chat-mode.ts owns the chat composition; a stage carried in would be a
    // second writer of the same fact.
    expect(b.select).not.toHaveBeenCalled()
  })

  it('does not offer a preset the host reported broken', async () => {
    const b = bench({
      roster: async () => [
        ...ROSTER,
        { id: 'wrecked', trust: 'user', name: 'Wrecked', isDefault: false, broken: 'the composition is not valid YAML' },
      ],
    })
    await b.controller.load()
    expect(b.controller.store.getSnapshot().options.map(option => option.id)).toEqual(['standard', 'minimal'])
  })

  it('reports a rejected roster read and offers nothing', async () => {
    const b = bench({ roster: async () => { throw new Error('connection lost') } })
    await b.controller.load()
    const state = b.controller.store.getSnapshot()
    expect(state.error).toBe('connection lost')
    expect(state.options).toEqual([])
  })

  it('goes back to reporting the session when the host refuses a switch', async () => {
    const b = bench({ select: async () => { throw new Error('agent-preset-locked') } })
    await b.controller.load()
    b.open('w1', true, 'standard')
    await b.controller.select('minimal')
    const state = b.controller.store.getSnapshot()
    expect(state.error).toBe('agent-preset-locked')
    expect(state.busy).toBe(false)
    expect(state.current).toBe('standard')
    expect(b.noteApplied).not.toHaveBeenCalled()
  })

  it('stops following the lists once disposed', async () => {
    const b = bench()
    await b.controller.load()
    b.stop()
    b.mode.set({ mode: 'chat', ready: true })
    expect(b.controller.store.getSnapshot().fixed).toBe(false)
  })
})
