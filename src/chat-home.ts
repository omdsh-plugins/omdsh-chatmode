/**
 * The two things on disk that Chat mode needs before a browser can use it:
 * the directory its conversations run in, and the agent composition they run
 * under. Both are idempotent and both are safe to re-run on every boot.
 *
 * Node-only: this module is the plugin's host half and never reaches the
 * browser bundle.
 * @module @omdsh-plugins/omdsh-chatmode/src/chat-home
 */

import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { everyPresetMetadata, renderPresetMetadata, type PresetLocale } from './preset-copy.ts'

/**
 * Path under the harness home that Chat sessions run in, relative to it. A
 * real directory, because a workspace IS one — the registry canonicalizes
 * through `fs.realpath` and refuses a path that does not exist.
 *
 * It sits under `sessions/` because that is where the harness already keeps
 * everything belonging to a conversation rather than to a project: a chat has
 * no project directory of its own, so its working directory is harness data,
 * and putting it at the home's top level would have claimed the name `chat`
 * next to `profiles/` and `settings.yaml` for one plugin's workspace.
 */
export const CHAT_DIR_PATH = 'sessions/chat'

/**
 * Display title of the managed Chat workspace, and the name the browser half
 * looks the workspace up by. Product-visible: it is the group heading the
 * user reads in the sidebar, which is what makes matching on it honest
 * rather than a hidden coupling.
 */
export const CHAT_WORKSPACE_TITLE = 'Chat'

/** Preset id (its directory name) composing the tool-free chat agent. */
export const CHAT_PRESET_ID = 'chat'

/** Harness-home directory holding locally authored presets (dsh-agent-presets' writable root). */
export const USER_PRESET_DIR = '.agent-presets'

/** The display-metadata file beside a preset's composition. */
export const METADATA_FILE = 'preset.yml'

/**
 * Create the Chat directory if it is missing.
 * @param home - resolved harness home directory.
 * @returns the absolute chat directory path.
 */
export async function ensureChatDirectory(home: string): Promise<string> {
  const path = `${home}/${CHAT_DIR_PATH}`
  await mkdir(path, { recursive: true })
  return path
}

/**
 * Install this package's shipped `chat` composition into the harness home's
 * writable preset root, ONCE. An existing directory is left exactly as it is:
 * that root is where a person authors and edits their own compositions, so
 * overwriting it every boot would silently discard their edits. Deleting the
 * directory is therefore how a user asks for the shipped copy back.
 * @param home - resolved harness home directory.
 * @returns 'installed' when this call wrote it, 'present' when it already was.
 */
export async function ensureChatPreset(home: string): Promise<'installed' | 'present'> {
  const target = `${home}/${USER_PRESET_DIR}/${CHAT_PRESET_ID}`
  if (await isDirectory(target)) return 'present'
  await mkdir(`${home}/${USER_PRESET_DIR}`, { recursive: true })
  await cp(shippedPresetRoot(), target, { recursive: true })
  return 'installed'
}

/**
 * Write the preset's picker copy in one language.
 *
 * The harness will not localize a user-authored preset's `name` and
 * `description` (see preset-copy.ts), so the file itself carries one
 * language, and this rewrites it when the UI's language changes.
 *
 * A file this module did not write is left alone. That is the same promise
 * the composition gets: the writable preset root is where a person authors
 * their own text, and following the UI language must not cost them an edit.
 * @param home - resolved harness home directory.
 * @param locale - the language to write.
 * @returns what the call did.
 */
export async function writePresetMetadata(
  home: string,
  locale: PresetLocale,
): Promise<'written' | 'unchanged' | 'kept-user-copy'> {
  const path = `${home}/${USER_PRESET_DIR}/${CHAT_PRESET_ID}/${METADATA_FILE}`
  const next = renderPresetMetadata(locale)
  let current: string | undefined
  try {
    current = await readFile(path, 'utf8')
  } catch {
    // Absent is the first-install case, and the one this call exists for.
    current = undefined
  }
  if (current === next) return 'unchanged'
  if (current !== undefined && !everyPresetMetadata().includes(current)) return 'kept-user-copy'
  await mkdir(`${home}/${USER_PRESET_DIR}/${CHAT_PRESET_ID}`, { recursive: true })
  await writeFile(path, next)
  return 'written'
}

/**
 * The shipped preset directory, resolved from this module's own location so
 * it works from `src/` in tests and from the bundled `lib/index.js` alike
 * (both sit one level under the package root).
 * @returns absolute path of the packaged `chat` preset.
 */
export function shippedPresetRoot(): string {
  return fileURLToPath(new URL(`../agent-presets/${CHAT_PRESET_ID}/`, import.meta.url))
}

/**
 * Whether a path exists and is a directory.
 * @param path - candidate path.
 * @returns true only for an existing directory.
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
