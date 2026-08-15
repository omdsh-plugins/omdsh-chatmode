/**
 * The preset picker's display copy, in each language this plugin speaks.
 *
 * It lives here rather than in a checked-in `preset.yml` because the harness
 * will not localize it for us. `ui-agent-preset` resolves a locale key only
 * for shipped presets whose id is in its built-in table (`presetDisplayText`,
 * gated on `trust === 'system'`), explicitly "without making user-authored
 * metadata translatable" — a preset in the harness home's writable root
 * reaches the picker verbatim, whatever the reader's language.
 *
 * So the host half writes the file in ONE language: the one the UI is set to.
 * That is what keeps an English reader from being shown a Chinese sentence
 * they did not ask for, and vice versa.
 * @module @omdsh-plugins/omdsh-justchat/src/preset-copy
 */

/** Languages the harness's browser client ships, and this copy covers. */
export type PresetLocale = 'zh' | 'en'

/** One language's picker copy. */
interface PresetCopy {
  readonly name: string
  readonly description: string
}

/**
 * Display copy per language — name included. The picker lists it beside
 * 标准模式 / 极简模式 / 创造模式, so an English name there reads as an
 * untranslated string rather than as a proper noun.
 */
const COPY: Readonly<Record<PresetLocale, PresetCopy>> = {
  zh: {
    name: '纯聊天模式',
    description: '纯对话 Agent，不挂任何工具：不读写文件、不执行命令、不派生子代理，'
      + '因此不会碰到你机器上的任何东西；需要动仓库时切到 Work 模式。',
  },
  en: {
    name: 'Chat Mode',
    description: 'A conversation-only agent with no tools — no file access, no commands, '
      + 'no subagents, so nothing on your machine is touched; switch to Work mode when a '
      + 'task needs your repository.',
  },
}

/**
 * Every rendering this module can produce, so the writer can tell its own
 * output from a file a person edited.
 * @returns the full set of renderings.
 */
export function everyPresetMetadata(): readonly string[] {
  return Object.keys(COPY).map(locale => renderPresetMetadata(locale as PresetLocale))
}

/**
 * Render the picker metadata file for one language.
 *
 * Both values are quoted, and quoted with SINGLE quotes: a plain YAML scalar
 * containing ": " is a mapping, and `readPresetMetadata` answers a parse
 * failure with empty metadata — the picker then shows the bare preset id and
 * "No description." with nothing anywhere saying why.
 * @param locale - the language to render.
 * @returns the `preset.yml` contents.
 */
export function renderPresetMetadata(locale: PresetLocale): string {
  const copy = COPY[locale]
  return [
    '# Written by @omdsh-plugins/omdsh-justchat in the language the web UI is set',
    '# to; the harness does not localize a user-authored preset\'s copy. Edit',
    '# this file and it becomes yours — the plugin then leaves it alone.',
    `name: ${quote(copy.name)}`,
    `description: ${quote(copy.description)}`,
    'order: 0',
    '',
  ].join('\n')
}

/**
 * Quote one scalar for YAML.
 * @param value - the text to quote; this module's copy carries no single quotes.
 * @returns the quoted scalar.
 */
function quote(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`
}
