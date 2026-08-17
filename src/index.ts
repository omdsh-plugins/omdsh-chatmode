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
 * 2. **The `chat` agent preset exists.** Its composition ships in this
 *    package and is installed once into the harness home's writable preset
 *    root; a person's later edits there are theirs to keep.
 *
 * Everything else — the switch, the intent surface, which preset a chat
 * session lands on — is the browser half, and reaches the host only through
 * APIs the harness already serves.
 * @module @omdsh-plugins/omdsh-chatmode
 */

import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
// The `ctx.workspaceRegistry` Context merge; the value below comes from the
// service, never from an import of the registry implementation.
import type {} from '@deepseek-ai/dsh-workspace'
// Type-only: the ctx.settings Context merge and its `settings/updated` event.
import type {} from '@deepseek-ai/dsh-settings'
import { resolvePresetLocale, UI_LOCALE_NAMESPACE } from './preset-locale.ts'
import {
  CHAT_WORKSPACE_TITLE, ensureChatDirectory, ensureChatPreset, writePresetMetadata,
} from './chat-home.ts'

export {
  CHAT_DIR_PATH, CHAT_PRESET_ID, CHAT_WORKSPACE_TITLE, ensureChatDirectory, ensureChatPreset,
  writePresetMetadata,
} from './chat-home.ts'
export { renderPresetMetadata, type PresetLocale } from './preset-copy.ts'
export { resolvePresetLocale, UI_LOCALE_NAMESPACE } from './preset-locale.ts'

/** Cordis plugin name. */
export const name = 'omdsh-chatmode'

/**
 * `workspaceRegistry` is what makes the Chat directory a workspace; `settings`
 * is where the web UI's language preference lives, and the preset's picker
 * copy follows it because the harness will not localize it for us.
 */
export const inject = ['workspaceRegistry', 'settings']

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
 * @returns completion once the workspace and the preset are both in place.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const home = resolveDshHome(config.home)
  const path = await ensureChatDirectory(home)
  await ensureChatPreset(home)
  await writePresetMetadata(home, resolvePresetLocale(ctx.settings.get(UI_LOCALE_NAMESPACE)))

  // The picker reads `preset.yml` on every roster load and this plugin cannot
  // reach into that surface, so following the language means rewriting the
  // file when the setting commits. It takes effect on the next roster load.
  ctx.on('settings/updated', (namespace: string, next: unknown) => {
    if (namespace !== UI_LOCALE_NAMESPACE) return
    void writePresetMetadata(home, resolvePresetLocale(next)).catch(() => {
      // A preset whose copy is one language behind is worth no more than a
      // silent skip; the composition it names is unaffected.
    })
  })

  // `create` is idempotent per canonical path: the first boot registers the
  // workspace (prepended into the display order), and every later one resolves
  // the same record without touching the order.
  const workspace = await ctx.workspaceRegistry.create(path, CHAT_WORKSPACE_TITLE)
  if (workspace.title !== CHAT_WORKSPACE_TITLE) await workspace.setTitle(CHAT_WORKSPACE_TITLE)

  // Pin the Chat workspace above every other workspace. `create` prepends any
  // NEW workspace, so every project directory opened after the first boot
  // pushes Chat down the list; re-asserting first place here is what keeps it
  // pinned, and it matches the title re-assertion above — both are facts this
  // plugin manages rather than the user's arrangement of its own workspaces.
  const [first] = ctx.workspaceRegistry.list()
  if (first !== undefined && first.id !== workspace.id) {
    await ctx.workspaceRegistry.insertBefore(workspace.id, first.id)
  }
}
