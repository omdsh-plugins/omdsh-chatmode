// The host half: the Chat workspace and the preset, both idempotent.
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import { CHAT_PRESET_ID, CHAT_WORKSPACE_TITLE, USER_PRESET_DIR } from '../src/chat-home.ts'

const homes: string[] = []

afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true })
})

/** A scratch harness home plus a workspace-registry double over it. */
async function bench(title = CHAT_WORKSPACE_TITLE, order: readonly string[] = ['w1']) {
  const home = await mkdtemp(join(tmpdir(), 'omdsh-chatmode-host-'))
  homes.push(home)
  const setTitle = vi.fn(async () => {})
  const create = vi.fn(async (path: string) => ({ id: 'w1', path, title, setTitle }))
  // The registry's display order as the plugin sees it; ids only, because the
  // apply half reads nothing else off the list.
  const list = vi.fn(() => order.map(id => ({ id })))
  const insertBefore = vi.fn(async (_id: string, _beforeId?: string) => {})
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const ctx = {
    workspaceRegistry: { create, list, insertBefore },
    // The web UI's language lives in the host settings document; the preset's
    // picker copy follows it, because the harness will not localize it.
    settings: { get: () => ({ preference: 'en' }) },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener)
      return () => listeners.delete(event)
    },
  } as unknown as Context
  return { home, ctx, create, setTitle, list, insertBefore, listeners }
}

describe('omdsh-chatmode host half', () => {
  it('creates the chat directory, registers it, and installs the preset', async () => {
    const b = await bench()
    await apply(b.ctx, { home: b.home })

    const chatDir = join(b.home, 'sessions', 'chat')
    expect((await stat(chatDir)).isDirectory()).toBe(true)
    expect(b.create).toHaveBeenCalledWith(chatDir, CHAT_WORKSPACE_TITLE)
    expect((await stat(join(b.home, USER_PRESET_DIR, CHAT_PRESET_ID))).isDirectory()).toBe(true)
    // Written in the UI's language, not both at once.
    const metadata = await readFile(join(b.home, USER_PRESET_DIR, CHAT_PRESET_ID, 'preset.yml'), 'utf8')
    expect(/[一-鿿]/u.test(metadata)).toBe(false)
    // The registry already gave it the right title; nothing to correct.
    expect(b.setTitle).not.toHaveBeenCalled()
  })

  it('re-asserts the title of a workspace someone renamed', async () => {
    // The browser half finds this workspace BY that title, and it is also the
    // group heading the product shows for it — a managed workspace has to stay
    // findable under the name the product uses.
    const b = await bench('随便改的名字')
    await apply(b.ctx, { home: b.home })
    expect(b.setTitle).toHaveBeenCalledWith(CHAT_WORKSPACE_TITLE)
  })

  it('moves Chat to the top of the workspace order when another workspace precedes it', async () => {
    // `create` prepends every NEW workspace, so a project directory opened
    // after the first boot pushes Chat down; the next boot must pull it back.
    const b = await bench(CHAT_WORKSPACE_TITLE, ['w2', 'w1'])
    await apply(b.ctx, { home: b.home })
    expect(b.insertBefore).toHaveBeenCalledWith('w1', 'w2')
  })

  it('leaves the workspace order alone when Chat is already first', async () => {
    const b = await bench(CHAT_WORKSPACE_TITLE, ['w1', 'w2'])
    await apply(b.ctx, { home: b.home })
    expect(b.insertBefore).not.toHaveBeenCalled()
  })

  it('rewrites the picker copy when the UI language changes', async () => {
    const b = await bench()
    await apply(b.ctx, { home: b.home })
    const path = join(b.home, USER_PRESET_DIR, CHAT_PRESET_ID, 'preset.yml')
    expect(/[一-鿿]/u.test(await readFile(path, 'utf8'))).toBe(false)

    b.listeners.get('settings/updated')?.('locale', { preference: 'zh' })
    await vi.waitFor(async () => {
      expect(/[一-鿿]/u.test(await readFile(path, 'utf8'))).toBe(true)
    })

    // Another namespace committing is not this plugin's business.
    b.listeners.get('settings/updated')?.('ui-theme', { theme: 'dark' })
    expect(/[一-鿿]/u.test(await readFile(path, 'utf8'))).toBe(true)
  })

  it('is safe to run again', async () => {
    const b = await bench()
    await apply(b.ctx, { home: b.home })
    await expect(apply(b.ctx, { home: b.home })).resolves.toBeUndefined()
    expect(b.create).toHaveBeenCalledTimes(2)
  })
})
