/**
 * What a preset is CALLED on screen.
 *
 * The harness ships its four presets with Chinese metadata on disk and
 * localizes them in the browser instead, from the `settings.agentPreset`
 * dictionary that `ui-agent-preset` registers. Any surface listing those
 * presets has to do the same or an English reader gets 标准模式 back.
 *
 * So this resolves display copy the way that package's own `presetDisplayText`
 * does — shipped ids through the dictionary, everything else from the preset's
 * own file — while reading the dictionary at RUNTIME rather than copying it.
 * The keys are the coupling, and a missing one is survivable: the locale
 * service answers an unknown key with the key itself, which is the signal that
 * `ui-agent-preset` is not composed and the file's own metadata is the better
 * answer.
 * @module @omdsh-plugins/omdsh-chatmode/src/client/preset-display
 */

/**
 * The dictionary namespace `ui-agent-preset` registers its copy under.
 *
 * Typed as `string` on purpose: `ctx.locale.bind` has a narrow overload for
 * namespaces merged into `LocaleNamespaceMap`, and this one is another
 * plugin's — reaching it through the dynamic overload is what says so.
 */
export const AGENT_PRESET_LOCALE_NS: string = 'settings.agentPreset'

/** One preset as the roster reports it, narrowed to what a picker renders. */
export interface PresetOption {
  /** Stable id, also the directory name and the last-resort label. */
  readonly id: string
  /** Whether the deployment ships the preset or a person authored it. */
  readonly trust: 'system' | 'user'
  /** Unlocalized name the preset's own metadata published. */
  readonly name?: string
  /** Unlocalized one-liner the preset's own metadata published. */
  readonly description?: string
}

/** Display copy resolved for the reader's current language. */
export interface PresetDisplayText {
  /** Localized shipped name, else the preset's own, else its id. */
  readonly name: string
  /** Localized shipped description, else the preset's own, when there is one. */
  readonly description?: string
}

/** The dictionary keys carrying each shipped preset's copy. */
const BUILT_IN: Readonly<Record<string, { readonly name: string; readonly description: string }>> = {
  standard: { name: 'presetStandardName', description: 'presetStandardDescription' },
  code: { name: 'presetCodeName', description: 'presetCodeDescription' },
  minimal: { name: 'presetMinimalName', description: 'presetMinimalDescription' },
  cordis: { name: 'presetCordisName', description: 'presetCordisDescription' },
}

/**
 * Resolve one preset's display copy, without making user-authored metadata
 * translatable — a locally authored preset carries exactly the text its file
 * carries, in whatever language its author wrote.
 * @param preset - the roster row being rendered.
 * @param t - the `settings.agentPreset` translate function.
 * @returns the copy to show.
 */
export function presetDisplayText(
  preset: PresetOption,
  t: (key: string) => string,
): PresetDisplayText {
  const keys = preset.trust === 'system' ? BUILT_IN[preset.id] : undefined
  const name = keys === undefined ? undefined : t(keys.name)
  // An echoed key means no dictionary answered — the surface is composed
  // without `ui-agent-preset`, so the file's own metadata is all there is.
  if (keys !== undefined && name !== undefined && name !== keys.name) {
    const description = t(keys.description)
    return {
      name,
      ...description === keys.description ? {} : { description },
    }
  }
  return {
    name: preset.name ?? preset.id,
    ...preset.description === undefined ? {} : { description: preset.description },
  }
}
