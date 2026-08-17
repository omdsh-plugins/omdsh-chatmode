// The host half: the Chat workspace it manages, and the preset it retires.
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, inject } from '../src/index.ts'
import { CHAT_PRESET_ID, CHAT_WORKSPACE_TITLE, COMPOSITION_FILE, USER_PRESET_DIR } from '../src/chat-home.ts'

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
  const ctx = { workspaceRegistry: { create, list, insertBefore } } as unknown as Context
  return { home, ctx, create, setTitle, list, insertBefore }
}

/** Put one copy of the retired preset in a home, as an older version did. */
async function installPreset(home: string, composition: string): Promise<string> {
  const target = join(home, USER_PRESET_DIR, CHAT_PRESET_ID)
  await mkdir(target, { recursive: true })
  await writeFile(join(target, COMPOSITION_FILE), composition)
  return target
}

describe('omdsh-chatmode host half', () => {
  it('needs the workspace registry, and nothing else', () => {
    // The settings service went with the preset: nothing on disk follows the
    // UI language any more, so there is no document to read.
    expect(inject).toEqual(['workspaceRegistry'])
  })

  it('creates the chat directory and registers it', async () => {
    const b = await bench()
    await apply(b.ctx, { home: b.home })

    const chatDir = join(b.home, 'sessions', 'chat')
    expect((await stat(chatDir)).isDirectory()).toBe(true)
    expect(b.create).toHaveBeenCalledWith(chatDir, CHAT_WORKSPACE_TITLE)
    // Nothing is installed into the writable preset root any more.
    await expect(readdir(join(b.home, USER_PRESET_DIR))).rejects.toThrow()
    // The registry already gave it the right title; nothing to correct.
    expect(b.setTitle).not.toHaveBeenCalled()
  })

  it('takes back the preset an earlier version installed', async () => {
    const b = await bench()
    const released = await readFile(join(import.meta.dirname, 'fixtures', 'agent.cordis.yml'), 'utf8')
    const target = await installPreset(b.home, released)
    await apply(b.ctx, { home: b.home })
    // Every surface reads that root, so a preset left there goes on offering
    // a mode this product no longer has.
    await expect(readdir(target)).rejects.toThrow()
  })

  it('leaves a composition someone made their own', async () => {
    const b = await bench()
    const target = await installPreset(b.home, '# mine\n')
    await apply(b.ctx, { home: b.home })
    expect(await readdir(target)).toEqual([COMPOSITION_FILE])
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

  it('is safe to run again', async () => {
    const b = await bench()
    await apply(b.ctx, { home: b.home })
    await expect(apply(b.ctx, { home: b.home })).resolves.toBeUndefined()
    expect(b.create).toHaveBeenCalledTimes(2)
  })
})
