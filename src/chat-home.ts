/**
 * What Chat mode keeps on disk: the directory its conversations run in, and
 * the agent composition it used to put them on.
 *
 * The directory is created on every boot, idempotently. The composition is
 * REMOVED on every boot, because the mode no longer has one — a chat session
 * runs whatever preset the deployment defaults to, and the chip above the
 * composer offers the rest. That removal is not tidiness: the harness's
 * writable preset root is shared by every surface, so a `chat` preset left
 * behind goes on being listed in the settings panel and in the terminal
 * surface's `/mode` as a mode this product no longer has.
 *
 * It is guarded by CONTENT rather than by a marker file. That root is where a
 * person authors their own compositions, and this package put a directory
 * there uninvited; so it takes back exactly what it wrote — every file
 * byte-identical to a copy this package installed — and leaves anything else
 * exactly as it is. Editing the composition is how a person keeps it.
 *
 * Node-only: this module is the plugin's host half and never reaches the
 * browser bundle.
 * @module @omdsh-plugins/omdsh-chatmode/src/chat-home
 */

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'

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

/** Directory name of the preset this package used to install. */
export const CHAT_PRESET_ID = 'chat'

/** Harness-home directory holding locally authored presets (dsh-agent-presets' writable root). */
export const USER_PRESET_DIR = '.agent-presets'

/** The composition file inside a preset directory. */
export const COMPOSITION_FILE = 'agent.cordis.yml'

/** The display-metadata file beside it. */
export const METADATA_FILE = 'preset.yml'

/**
 * SHA-256 of every file this package has ever put in that directory.
 *
 * One flat set, because the question asked of each file is the same one: did
 * we write this? It covers the single composition ever shipped and the picker
 * metadata written beside it — in both languages, and under both names this
 * plugin has had. The rename matters: `omdsh-justchat` stamped its own name
 * into the metadata's header comment, so a home set up before it still carries
 * that copy, and a set naming only the current renderings would refuse to take
 * back the very installs that most need it.
 */
const INSTALLED_BY_US: ReadonlySet<string> = new Set([
  // agent.cordis.yml — the tool-free composition, unchanged across the rename.
  '135ea9ace5102170a161e3e0ecef7db3eaba8a0055df03ba3fb90a41a1e66e2e',
  // preset.yml as omdsh-chatmode wrote it, zh then en.
  '013e27cbcb6725a11baf3dd2ecfa6e9bbc692b5aff79c989732938f55e306fcb',
  'e970a1df7ee5f647f8c5dd4b9c322b45154148ca35e77570f88ae6a1726d4d8c',
  // preset.yml as omdsh-justchat wrote it, zh then en.
  '97a9fbcd84d181cd75662a891e943ae98dca658f5bbc64f07d12f294887ac53b',
  'b9d61c9a44e4906bd982a61471c8c399c961f7644632751fd46f8b3cd8c5960b',
])

/** What {@link removeChatPreset} did. */
export type PresetRemoval = 'removed' | 'absent' | 'kept-user-copy'

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
 * Take back the `chat` preset this package used to install.
 *
 * Absent is the steady state and costs one failed `readdir`; a directory
 * carrying anything this package did not write is left whole, and says so.
 * @param home - resolved harness home directory.
 * @returns what the call did (see {@link PresetRemoval}).
 */
export async function removeChatPreset(home: string): Promise<PresetRemoval> {
  const target = `${home}/${USER_PRESET_DIR}/${CHAT_PRESET_ID}`
  let entries: readonly string[]
  try {
    entries = await readdir(target)
  } catch {
    // Never installed, or already taken back.
    return 'absent'
  }
  if (!await installedByUs(target, entries)) return 'kept-user-copy'
  await rm(target, { recursive: true, force: true })
  return 'removed'
}

/**
 * Whether every file in the preset directory is one this package wrote.
 * @param target - the preset directory.
 * @param entries - its entries, as `readdir` reported them.
 * @returns true only when there is nothing of a person's in there.
 */
async function installedByUs(target: string, entries: readonly string[]): Promise<boolean> {
  // A file under any other name was added by someone; so was a nested
  // directory, which the read below would fail on anyway.
  if (entries.some(entry => entry !== COMPOSITION_FILE && entry !== METADATA_FILE)) return false
  for (const entry of entries) {
    let text: string
    try {
      text = await readFile(`${target}/${entry}`, 'utf8')
    } catch {
      // Unreadable, or a directory wearing one of those two names: not ours.
      return false
    }
    if (!INSTALLED_BY_US.has(createHash('sha256').update(text).digest('hex'))) return false
  }
  return true
}
