/**
 * The workspace chip on the new-session row, taken off while Chat is showing.
 *
 * Chat is a conversation with no project to pick. The harness still draws the
 * chip — ConversationRoot owns it, and the published seat beside it
 * (`conversation.hero.workspace`) is the MENU, not the button — so replacing
 * that slot would hide the picker without hiding the control that opens it.
 * The agent-preset chip is a real seat of its own
 * (`conversation.hero.agentPreset`) and stays; this is the one that does not
 * belong on the row.
 *
 * Why the chip is marked rather than rendered. The conversation skeleton is a
 * SINGLE seat this package does not occupy, and the chip is not a child of any
 * slot we could take. So the skeleton keeps its tree and this writes one
 * attribute on the button, the same move [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode)
 * makes on the sidebar: `[data-slot="conversation.hero.workspace"]` is the
 * slot renderer's own published anchor, the chip is the menu-button before it,
 * and a stylesheet this package injects takes it off the row. Uninstalling
 * takes the stylesheet with it and the attributes stop being written.
 *
 * Work still shows the chip. Work is a conversation in a project, and that is
 * the control that names which one.
 * @module @omdsh-plugins/omdsh-chatmode/src/client/hero-picker
 */

import './HeroPicker.module.css'

/** The picker slot's published anchor — where the chip sits beside it. */
export const PICKER_SLOT = '[data-slot="conversation.hero.workspace"]'

/** Attribute written on the workspace chip while Chat is showing. */
export const HIDE_ATTRIBUTE = 'data-omdsh-chatmode-hide'

/** What the painter reaches outside itself, so a spec can drive it whole. */
export interface HeroPickerDeps {
  /** The document to decorate. */
  readonly root: ParentNode
  /**
   * Whether the workspace chip should be off the row.
   *
   * Read on every paint rather than held, so a mode change the caller already
   * heard about is the only thing this needs to be told.
   * @returns true while the conversation column is in Chat.
   */
  hidden(): boolean
}

/**
 * Mark (or unmark) the workspace chip beside every picker slot.
 *
 * Idempotent: a chip whose mark is already right is skipped. A button that
 * used to be the chip and no longer is has the mark REMOVED rather than left
 * stale — a hidden control that survived what it described would be worse
 * than none at all.
 * @param deps - see {@link HeroPickerDeps}.
 * @returns how many chips are currently hidden.
 */
export function paintHeroPicker(deps: HeroPickerDeps): number {
  const hide = deps.hidden()
  const chips = new Set<HTMLElement>()
  for (const slot of deps.root.querySelectorAll(PICKER_SLOT)) {
    const chip = chipBeside(slot)
    if (chip === undefined) continue
    chips.add(chip)
    paintChip(chip, hide)
  }
  for (const leftover of deps.root.querySelectorAll(`[${HIDE_ATTRIBUTE}]`)) {
    if (!(leftover instanceof HTMLElement) || chips.has(leftover)) continue
    leftover.removeAttribute(HIDE_ATTRIBUTE)
  }
  return hide ? chips.size : 0
}

/**
 * Watch the new-session row and keep the chip marked.
 *
 * Two triggers, because the row changes for two unrelated reasons: the DOM
 * one (the hero appearing, a session flipping blank, the skeleton
 * re-rendering its slot wrappers) and the data one (the derived mode moving
 * between Chat and Work). The observer covers the first; the caller re-paints
 * for the second.
 * @param deps - see {@link HeroPickerDeps}.
 * @param observe - how to watch for DOM changes; defaults to a MutationObserver.
 * @returns a disposer that stops watching and unmarks every chip it marked.
 */
export function watchHeroPicker(
  deps: HeroPickerDeps,
  observe: (onChange: () => void) => () => void = observeDom(deps.root),
): { repaint: () => void; dispose: () => void } {
  const repaint = (): void => { paintHeroPicker(deps) }
  const stop = observe(repaint)
  repaint()
  return {
    repaint,
    dispose: () => {
      stop()
      // The stylesheet goes with the plugin, so a left-behind attribute would
      // be inert — but an unloaded plugin should leave no trace it was here.
      for (const chip of deps.root.querySelectorAll(`[${HIDE_ATTRIBUTE}]`)) {
        chip.removeAttribute(HIDE_ATTRIBUTE)
      }
    },
  }
}

/**
 * The default watcher: one subtree observer over the whole document.
 *
 * Over the document rather than the chip, because the hero itself comes and
 * goes — the skeleton re-renders the row as the session flips blank, and an
 * observer bound to the button that existed at mount would go quiet the first
 * time the frame replaced it.
 * @param root - the document or fragment to watch.
 * @returns an observe function for {@link watchHeroPicker}.
 */
function observeDom(root: ParentNode): (onChange: () => void) => () => void {
  return (onChange) => {
    const target = (root as Document).body ?? (root as unknown as Node)
    const observer = new MutationObserver(onChange)
    observer.observe(target, { childList: true, subtree: true })
    return () => { observer.disconnect() }
  }
}

/**
 * The workspace chip, as ConversationRoot lays the row out: a menu button
 * immediately before the picker slot.
 *
 * The agent-preset chip is also a menu button, and lives AFTER the picker
 * slot (inside `conversation.hero.agentPreset`). Selecting on "the button
 * before the picker" is what keeps that one on the row.
 * @param slot - the picker slot's anchor.
 * @returns the chip, or undefined when the row is not the shipped shape.
 */
function chipBeside(slot: Element): HTMLElement | undefined {
  const previous = slot.previousElementSibling
  if (!(previous instanceof HTMLElement)) return undefined
  if (previous.tagName !== 'BUTTON') return undefined
  if (previous.getAttribute('aria-haspopup') !== 'menu') return undefined
  return previous
}

/**
 * Write (or clear) one chip's hide mark.
 * @param chip - the workspace button.
 * @param hide - whether Chat is showing.
 */
function paintChip(chip: HTMLElement, hide: boolean): void {
  const marked = chip.hasAttribute(HIDE_ATTRIBUTE)
  if (hide === marked) return
  if (hide) {
    chip.setAttribute(HIDE_ATTRIBUTE, '')
    // The menu is owned by ConversationRoot's `pickerOpen`, not by this
    // attribute. A programmatic click still fires after the mark is on
    // (`display: none` does not swallow it), and is what stops a picker
    // that was open in Work from hanging over a Chat that has no project
    // to pick.
    if (chip.getAttribute('aria-expanded') === 'true') chip.click()
  } else {
    chip.removeAttribute(HIDE_ATTRIBUTE)
  }
}
