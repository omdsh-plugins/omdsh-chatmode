/**
 * Chat mode, host half. It owns the two facts the browser half cannot create
 * for itself and must be able to assume:
 *
 * 1. **The Chat workspace exists, and stays where it belongs.** Chat mode's
 *    whole point is starting a conversation without picking a project
 *    directory, and a session still runs somewhere — so this plugin creates
 *    `<dshHome>/sessions/chat`, registers it, keeps its title `Chat`, and
 *    re-asserts first place in the workspace order every boot. The title is
 *    the group heading in the sidebar AND the name the browser half looks the
 *    workspace up by; the pin is why `create` prepending every new workspace
 *    does not push Chat down the list. Re-asserting both every boot is a
 *    feature rather than a liberty taken with a user's data: a workspace this
 *    plugin manages must stay findable under the name the product shows for
 *    it, and pinned where the product puts it.
 * 2. **The `chat` agent preset does NOT exist.** Earlier versions installed a
 *    tool-free composition and put every chat session on it; the mode no
 *    longer decides a composition at all, so the preset is taken back from the
 *    harness home's writable root — untouched copies only, a person's edits
 *    being theirs to keep. Until it is gone it goes on being listed wherever
 *    the harness lists presets, this deployment's terminal surface included.
 *
 * Everything else — the switch, and which preset a chat session lands on
 * (the deployment's default, and whatever the reader picks instead) — is the
 * browser half and the harness's own chip, and reaches the host only through
 * APIs the harness already serves.
 * @module @omdsh-plugins/omdsh-chatmode
 */

import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
// The `ctx.workspaceRegistry` Context merge; the value below comes from the
// service, never from an import of the registry implementation.
import type {} from '@deepseek-ai/dsh-workspace'
import {
  CHAT_WORKSPACE_TITLE, ensureChatDirectory, removeChatPreset,
} from './chat-home.ts'

export {
  CHAT_DIR_PATH, CHAT_PRESET_ID, CHAT_WORKSPACE_TITLE, COMPOSITION_FILE, METADATA_FILE,
  USER_PRESET_DIR, ensureChatDirectory, removeChatPreset,
} from './chat-home.ts'
export type { PresetRemoval } from './chat-home.ts'

/** Cordis plugin name. */
export const name = 'omdsh-chatmode'

/** `workspaceRegistry` is what makes the Chat directory a workspace. */
export const inject = ['workspaceRegistry']

/** Host-half configuration. */
export interface Config {
  /**
   * Harness home override; absent resolves the deployment's own
   * (`$DSH_HOME`, else `~/.dsh`). Present mainly so a test can point the
   * whole surface at a scratch directory.
   */
  home?: string
}

/**
 * Bring up Chat mode's host side.
 * @param ctx - host context carrying the workspace registry.
 * @param config - see {@link Config}.
 * @returns completion once the workspace is in place and the retired preset
 * is gone.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const home = resolveDshHome(config.home)
  const path = await ensureChatDirectory(home)
  await removeChatPreset(home)

  // `create` is idempotent per canonical path: the first boot registers the
  // workspace (prepended into the display order), and every later one resolves
  // the same record without touching the order.
  const workspace = await ctx.workspaceRegistry.create(path, CHAT_WORKSPACE_TITLE)
  if (workspace.title !== CHAT_WORKSPACE_TITLE) await workspace.setTitle(CHAT_WORKSPACE_TITLE)

  // Pin the Chat workspace above every other workspace. `create` prepends any
  // NEW workspace, so every project directory opened after the first boot
  // pushes Chat down the list; re-asserting first place here is what the very
  // first render is owed, and it matches the title re-assertion above — both
  // are facts this plugin manages rather than the user's arrangement of its own
  // workspaces.
  //
  // It is HALF the pin, and deliberately so: a directory opened while the app
  // is running prepends a workspace after this has run, and the registry
  // publishes no event to hear it on. The browser half holds the order from
  // there (`src/client/pin.ts`), off the workspace list it is already given.
  const [first] = ctx.workspaceRegistry.list()
  if (first !== undefined && first.id !== workspace.id) {
    await ctx.workspaceRegistry.insertBefore(workspace.id, first.id)
  }
}
