// Which language the picker copy is written in.
import { describe, expect, it } from 'vitest'
import { resolvePresetLocale, UI_LOCALE_NAMESPACE } from '../src/preset-locale.ts'

describe('resolvePresetLocale', () => {
  it('follows an explicit web-UI language choice', () => {
    expect(resolvePresetLocale({ preference: 'zh' }, {})).toBe('zh')
    expect(resolvePresetLocale({ preference: 'en' }, {})).toBe('en')
  })

  it('falls back to the operating system when the UI delegates to the browser', () => {
    // An absent preference means "follow the browser", which a host cannot
    // observe; its own language is the closest thing it has.
    expect(resolvePresetLocale({}, { LANG: 'zh_CN.UTF-8' })).toBe('zh')
    expect(resolvePresetLocale(undefined, { LC_ALL: 'zh_TW.UTF-8' })).toBe('zh')
    expect(resolvePresetLocale({}, { LANG: 'en_US.UTF-8' })).toBe('en')
    expect(resolvePresetLocale({}, {})).toBe('en')
  })

  it('ignores a value it does not speak', () => {
    expect(resolvePresetLocale({ preference: 'fr' }, { LANG: 'zh_CN.UTF-8' })).toBe('zh')
    expect(resolvePresetLocale('not an object', {})).toBe('en')
  })

  it('names the namespace the web client stores the choice under', () => {
    expect(String(UI_LOCALE_NAMESPACE)).toBe('locale')
  })
})
