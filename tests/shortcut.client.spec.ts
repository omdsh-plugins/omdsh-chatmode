/**
 * The chord suffix on a mode segment's tooltip.
 *
 * Small on purpose: the interesting case is the ABSENT chord, which has three
 * causes that must all read the same to the person hovering — no keybinding
 * layer composed, a layer whose document has not arrived, and a chord this
 * surface is never handed. All three arrive here as `undefined`, and none of
 * them may produce a trailing separator.
 */

import { describe, expect, it } from 'vitest'
import { MODE_COMMANDS, withChord } from '../src/client/shortcut.ts'

describe('the tooltip text', () => {
  it('puts the chord after the hint, in the separator this deployment uses', () => {
    expect(withChord('随手问，不动项目', '⌥⌘1')).toBe('随手问，不动项目 · ⌥⌘1')
  })

  it('is the hint alone when no chord reaches this surface', () => {
    // Not "hint · " and not "hint · undefined": a segment with no key still has
    // to read as a finished sentence.
    expect(withChord('Ask without touching the project', undefined))
      .toBe('Ask without touching the project')
  })
})

describe('the commands the two segments answer to', () => {
  it('names the ids the shortcut document declares for them', () => {
    // Literals rather than an import: an id is a wire name shared with a
    // document, and a cross-plugin value import is a bundle purity error.
    expect(MODE_COMMANDS).toEqual({ chat: 'mode.chat', work: 'mode.work' })
  })
})
