// What Chat mode keeps on disk: the directory it makes, and the preset it
// takes back.
//
// `fixtures/` holds the files this package actually released — the composition
// it shipped, and the picker metadata the host half wrote beside it, under both
// names this plugin has had. They are the point of these specs rather than
// scaffolding for them: the removal recognizes its own work by content hash,
// so a fixture that drifted from a release would be a home nobody can clean up.
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  CHAT_PRESET_ID, COMPOSITION_FILE, METADATA_FILE, USER_PRESET_DIR,
  ensureChatDirectory, removeChatPreset,
} from '../src/chat-home.ts'

const homes: string[] = []

/** The released files, read once. */
const released: Record<string, string> = {}

beforeAll(async () => {
  for (const name of ['agent.cordis.yml', 'preset.chatmode.en.yml', 'preset.justchat.zh.yml']) {
    released[name] = await readFile(join(import.meta.dirname, 'fixtures', name), 'utf8')
  }
})

/** A scratch harness home. */
async function scratchHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'omdsh-chatmode-'))
  homes.push(home)
  return home
}

/** The preset directory inside one scratch home. */
function presetDir(home: string): string {
  return join(home, USER_PRESET_DIR, CHAT_PRESET_ID)
}

/**
 * Install one copy of the retired preset.
 * @param home - the scratch home.
 * @param files - the files to write into the preset directory.
 */
async function install(home: string, files: Readonly<Record<string, string>>): Promise<void> {
  await mkdir(presetDir(home), { recursive: true })
  for (const [name, text] of Object.entries(files)) await writeFile(join(presetDir(home), name), text)
}

afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true })
})

describe('ensureChatDirectory', () => {
  it('creates the chat directory under sessions/ and accepts an existing one', async () => {
    const home = await scratchHome()
    const first = await ensureChatDirectory(home)
    // Under `sessions/`, where the harness keeps what belongs to a
    // conversation rather than to a project — and created even when that
    // parent does not exist yet, which is a fresh home's state.
    expect(first).toBe(join(home, 'sessions', 'chat'))
    // Idempotent: a second boot must not fail on the directory it made.
    await expect(ensureChatDirectory(home)).resolves.toBe(first)
  })
})

describe('removeChatPreset', () => {
  it('reports absent on a home that never had it', async () => {
    // The steady state after the first removal, and the state of every fresh
    // install: one failed readdir and nothing else.
    const home = await scratchHome()
    await expect(removeChatPreset(home)).resolves.toBe('absent')
  })

  it('takes back an untouched install, both files', async () => {
    const home = await scratchHome()
    await install(home, {
      [COMPOSITION_FILE]: released['agent.cordis.yml'] ?? '',
      [METADATA_FILE]: released['preset.chatmode.en.yml'] ?? '',
    })
    expect(await removeChatPreset(home)).toBe('removed')
    // Gone from the writable root, which is what stops every other surface —
    // the settings panel, the terminal's `/mode` — from going on listing a
    // mode this product no longer has.
    await expect(readdir(presetDir(home))).rejects.toThrow()
    // The root itself stays: it is the harness's, not this plugin's.
    await expect(readdir(join(home, USER_PRESET_DIR))).resolves.toEqual([])
  })

  it('takes back a home set up before the rename', async () => {
    // `omdsh-justchat` stamped its own name into the metadata's header, so
    // that copy hashes differently — and those are the oldest installs, the
    // ones most likely to still be carrying the preset.
    const home = await scratchHome()
    await install(home, {
      [COMPOSITION_FILE]: released['agent.cordis.yml'] ?? '',
      [METADATA_FILE]: released['preset.justchat.zh.yml'] ?? '',
    })
    expect(await removeChatPreset(home)).toBe('removed')
  })

  it('takes back an install carrying only the composition', async () => {
    // A home whose metadata was never written — the language setting arrived
    // after the copy, or that write failed.
    const home = await scratchHome()
    await install(home, { [COMPOSITION_FILE]: released['agent.cordis.yml'] ?? '' })
    expect(await removeChatPreset(home)).toBe('removed')
  })

  it('keeps a composition a person edited', async () => {
    const home = await scratchHome()
    const mine = `${released['agent.cordis.yml'] ?? ''}\n# mine\n`
    await install(home, {
      [COMPOSITION_FILE]: mine,
      [METADATA_FILE]: released['preset.chatmode.en.yml'] ?? '',
    })
    expect(await removeChatPreset(home)).toBe('kept-user-copy')
    // Whole, not partly deleted: the guard is asked before anything is
    // removed, so a directory this plugin does not recognize is untouched.
    expect(await readFile(join(presetDir(home), COMPOSITION_FILE), 'utf8')).toBe(mine)
    expect(await readFile(join(presetDir(home), METADATA_FILE), 'utf8'))
      .toBe(released['preset.chatmode.en.yml'])
  })

  it('keeps a preset carrying a file this package never wrote', async () => {
    // A skill, a prompt fragment, anything: the directory became someone's own
    // the moment they put something of theirs in it.
    const home = await scratchHome()
    await install(home, {
      [COMPOSITION_FILE]: released['agent.cordis.yml'] ?? '',
      'notes.md': '# why I keep this\n',
    })
    expect(await removeChatPreset(home)).toBe('kept-user-copy')
  })

  it('keeps a preset whose metadata a person rewrote', async () => {
    const home = await scratchHome()
    await install(home, {
      [COMPOSITION_FILE]: released['agent.cordis.yml'] ?? '',
      [METADATA_FILE]: 'name: mine\n',
    })
    expect(await removeChatPreset(home)).toBe('kept-user-copy')
  })

  it('keeps a directory wearing one of those two names', async () => {
    const home = await scratchHome()
    await mkdir(join(presetDir(home), COMPOSITION_FILE), { recursive: true })
    expect(await removeChatPreset(home)).toBe('kept-user-copy')
  })
})
