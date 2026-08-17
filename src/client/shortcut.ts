/**
 * The keybinding switchboard, as the mode switch reads it — for one purpose:
 * teaching the chord in the segment's tooltip.
 *
 * This plugin binds no key and registers no command. Entering a mode already
 * has a published seam (`sessionModes.enter`), and `omdsh-shortcuts` calls it
 * from its own built-in handlers — so there is nothing for this package to
 * hand over. What it does own is the tooltip, and a switch that can be reached
 * by `⌥⌘1` should say so.
 *
 * Structural mirror rather than an import, for the reason `SESSION_MODES` is a
 * literal in `client/index.ts`: cordis binds services by name at runtime, and a
 * cross-plugin value import is a client-bundle purity error. The command ids
 * are literals for the same reason — an id is a wire name shared with a
 * document, not a symbol shared with a package.
 * @module @omdsh-plugins/omdsh-chatmode/src/client/shortcut
 */

/** Service name the switchboard is published under in the browser. */
export const SHORTCUT_SERVICE = 'shortcut'

/** Command id that enters each mode this package contributes. */
export const MODE_COMMANDS: Readonly<Record<string, string>> = {
  chat: 'mode.chat',
  work: 'mode.work',
}

/** As much of the browser-side switchboard as a tooltip needs. */
export interface IShortcutClient {
  /**
   * How one command's chord is spelled for a reader here, or undefined when no
   * chord reaches it on this surface.
   * @param command - the item id.
   * @returns the chord as the platform writes it.
   */
  chordLabel: (command: string) => string | undefined
  /**
   * Watch for the document changing.
   * @param listener - called after each revision.
   * @returns unsubscribe.
   */
  onBindings: (listener: () => void) => () => void
}

/**
 * A hint with its chord after it, in the separator this deployment already
 * uses between a name and its key.
 *
 * Absent chord returns the hint unchanged rather than a trailing separator: a
 * segment with no key still has to read as a finished sentence, and "no key
 * here" is the ordinary state on a tab whose chord the browser kept.
 * @param hint - the localized tooltip text.
 * @param chord - the chord, when one reaches this command here.
 * @returns what the tooltip shows.
 */
export function withChord(hint: string, chord: string | undefined): string {
  return chord === undefined ? hint : `${hint} · ${chord}`
}
