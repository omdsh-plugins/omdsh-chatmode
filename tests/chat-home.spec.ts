// The two on-disk setups Chat mode needs, and their idempotence.
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load as loadYaml } from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHAT_PRESET_ID, METADATA_FILE, USER_PRESET_DIR,
  ensureChatDirectory, ensureChatPreset, shippedPresetRoot, writePresetMetadata,
} from '../src/chat-home.ts'
import { renderPresetMetadata } from '../src/preset-copy.ts'

const homes: string[] = []

/** A scratch harness home. */
async function scratchHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'omdsh-justchat-'))
  homes.push(home)
  return home
}

afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true })
})

describe('ensureChatDirectory', () => {
  it('creates the chat directory and accepts an existing one', async () => {
    const home = await scratchHome()
    const first = await ensureChatDirectory(home)
    expect(first).toBe(join(home, 'chat'))
    // Idempotent: a second boot must not fail on the directory it made.
    await expect(ensureChatDirectory(home)).resolves.toBe(first)
  })
})

describe('ensureChatPreset', () => {
  it('installs the shipped composition once', async () => {
    const home = await scratchHome()
    expect(await ensureChatPreset(home)).toBe('installed')
    const composition = await readFile(
      join(home, USER_PRESET_DIR, CHAT_PRESET_ID, 'agent.cordis.yml'), 'utf8')
    // The point of the preset is which rows it MOUNTS — asserted on the
    // `name:` lines, because the prose above them names the tools it leaves
    // out and a substring check would read those as rows.
    const mounted = [...composition.matchAll(/^\s*name: '([^']+)'/gm)].map(match => match[1] ?? '')
    expect(mounted).toContain('@deepseek-ai/dsh-persona')
    expect(mounted.some(name => name.includes('tool-bash') || name.includes('tool-fs')
      || name.includes('tool-skill') || name.includes('tool-subagent')
      || name.includes('str-replace-editor'))).toBe(false)
  })

  it('leaves an existing preset directory untouched', async () => {
    const home = await scratchHome()
    const target = join(home, USER_PRESET_DIR, CHAT_PRESET_ID)
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'agent.cordis.yml'), '# mine\n')

    expect(await ensureChatPreset(home)).toBe('present')
    // That root is where a person authors their own compositions; a boot that
    // overwrote it would silently discard their edits.
    expect(await readFile(join(target, 'agent.cordis.yml'), 'utf8')).toBe('# mine\n')
  })
})

describe('shippedPresetRoot', () => {
  it('resolves the packaged composition beside the package root', async () => {
    const root = shippedPresetRoot()
    expect(root.endsWith(`agent-presets/${CHAT_PRESET_ID}/`)).toBe(true)
    await expect(readFile(join(root, 'agent.cordis.yml'), 'utf8')).resolves.toContain('persona')
  })
})

describe('writePresetMetadata', () => {
  /** The metadata file's path inside one scratch home. */
  const metadataPath = (home: string): string =>
    join(home, USER_PRESET_DIR, CHAT_PRESET_ID, METADATA_FILE)

  it('writes one language, and only that language', async () => {
    // The picker localizes SHIPPED presets only, so a file carrying both
    // languages shows both to every reader — which is what this replaces.
    const home = await scratchHome()
    await ensureChatPreset(home)
    expect(await writePresetMetadata(home, 'en')).toBe('written')

    const parsed = loadYaml(await readFile(metadataPath(home), 'utf8')) as Record<string, unknown>
    const cjk = /[一-鿿]/u
    // Name included: the picker lists it beside 标准模式 / 极简模式, where an
    // English name reads as an untranslated string.
    expect(cjk.test(parsed.name as string)).toBe(false)
    expect(cjk.test(parsed.description as string)).toBe(false)
    expect(/[A-Za-z]{3,}/u.test(parsed.description as string)).toBe(true)
  })

  it('rewrites its own file when the language changes', async () => {
    const home = await scratchHome()
    await ensureChatPreset(home)
    await writePresetMetadata(home, 'en')
    expect(await writePresetMetadata(home, 'zh')).toBe('written')

    const parsed = loadYaml(await readFile(metadataPath(home), 'utf8')) as Record<string, unknown>
    expect(/[一-鿿]/u.test(parsed.name as string)).toBe(true)
    expect(/[一-鿿]/u.test(parsed.description as string)).toBe(true)
    // Re-running the same language is a no-op, not a rewrite.
    expect(await writePresetMetadata(home, 'zh')).toBe('unchanged')
  })

  it('leaves a file a person edited alone', async () => {
    // Following the UI language must not cost someone their own copy: the
    // writable preset root is where a person authors their own text.
    const home = await scratchHome()
    await ensureChatPreset(home)
    await writeFile(metadataPath(home), 'name: mine\n')
    expect(await writePresetMetadata(home, 'en')).toBe('kept-user-copy')
    expect(await readFile(metadataPath(home), 'utf8')).toBe('name: mine\n')
  })

  it('renders metadata YAML that actually parses', async () => {
    // A plain scalar containing ": " is a mapping, and `readPresetMetadata`
    // answers a parse failure with EMPTY metadata — the picker then shows the
    // bare preset id and "No description." with nothing saying why.
    for (const locale of ['zh', 'en'] as const) {
      const parsed = loadYaml(renderPresetMetadata(locale)) as Record<string, unknown>
      expect(typeof parsed.name).toBe('string')
      expect(typeof parsed.description).toBe('string')
      expect(parsed.order).toBe(0)
    }
  })
})
