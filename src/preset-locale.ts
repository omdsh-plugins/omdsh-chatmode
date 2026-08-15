/**
 * Which language the preset picker's copy is written in.
 *
 * The web client persists its language choice into the Host settings document
 * (`locale.preference`, owned by `@deepseek-ai/dsh-client-locale`), so the
 * host half can read it — which is the only way this plugin can follow the
 * reader's language at all, the picker being a surface it cannot reach.
 *
 * An absent preference means "delegate to the browser", which a host cannot
 * observe. The operating system's own language is the closest thing it has,
 * so that is the fallback, and English the fallback's fallback.
 * @module @omdsh-plugins/omdsh-justchat/src/preset-locale
 */

import { settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type { PresetLocale } from './preset-copy.ts'

/**
 * Settings namespace the browser client stores its language choice under.
 * Branded through the owner's own factory, which is also the validation:
 * a name this settings service would refuse throws here rather than at the
 * read.
 */
export const UI_LOCALE_NAMESPACE: SettingsNamespace = settingsNamespace('locale')

/** Field carrying an explicit selection; absence delegates to the browser. */
const PREFERENCE_FIELD = 'preference'

/**
 * Resolve the language to write the picker copy in.
 * @param settings - the `locale` settings namespace's resolved value, if any.
 * @param env - environment mapping used for the no-preference fallback.
 * @returns the language to render.
 */
export function resolvePresetLocale(
  settings: unknown,
  env: Record<string, string | undefined> = process.env,
): PresetLocale {
  const preference = readPreference(settings)
  if (preference !== undefined) return preference
  const system = env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? ''
  return system.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * Read an explicit selection out of the settings value.
 * @param settings - the namespace's resolved value, of unknown shape.
 * @returns the selection, or undefined when there is none this module speaks.
 */
function readPreference(settings: unknown): PresetLocale | undefined {
  if (typeof settings !== 'object' || settings === null) return undefined
  const value = (settings as Record<string, unknown>)[PREFERENCE_FIELD]
  return value === 'zh' || value === 'en' ? value : undefined
}
