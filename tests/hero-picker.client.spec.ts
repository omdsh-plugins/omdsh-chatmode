// @vitest-environment jsdom
// The workspace chip on the new-session row: which button is marked, which
// is left alone, and what happens to the mark when the mode or the row
// changes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HIDE_ATTRIBUTE, paintHeroPicker, watchHeroPicker,
} from '../src/client/hero-picker.ts'

afterEach(() => { document.body.innerHTML = '' })

/** A menu button like the two chips on the new-session row. */
function chip(label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-haspopup', 'menu')
  button.setAttribute('aria-expanded', 'false')
  button.textContent = label
  return button
}

/**
 * The shipped new-session row: workspace chip, picker slot, agent-preset
 * chip inside its own slot. `display: contents` is the renderer's own
 * wrapping, and is what keeps the two chips as visual siblings.
 */
function heroRow(workspace = chip('Chat'), preset = chip('Standard mode')): {
  row: HTMLElement
  workspace: HTMLButtonElement
  preset: HTMLButtonElement
  slot: HTMLElement
} {
  const row = document.createElement('div')
  const slot = document.createElement('div')
  slot.setAttribute('data-slot', 'conversation.hero.workspace')
  const presetSlot = document.createElement('div')
  presetSlot.setAttribute('data-slot', 'conversation.hero.agentPreset')
  presetSlot.append(preset)
  row.append(workspace, slot, presetSlot)
  document.body.append(row)
  return { row, workspace, preset, slot }
}

describe('paintHeroPicker', () => {
  it('hides the workspace chip while Chat is showing, and leaves the preset chip', () => {
    const { workspace, preset } = heroRow()
    expect(paintHeroPicker({ root: document, hidden: () => true })).toBe(1)
    expect(workspace.hasAttribute(HIDE_ATTRIBUTE)).toBe(true)
    expect(preset.hasAttribute(HIDE_ATTRIBUTE)).toBe(false)
  })

  it('leaves both chips alone while Work is showing', () => {
    const { workspace, preset } = heroRow()
    expect(paintHeroPicker({ root: document, hidden: () => false })).toBe(0)
    expect(workspace.hasAttribute(HIDE_ATTRIBUTE)).toBe(false)
    expect(preset.hasAttribute(HIDE_ATTRIBUTE)).toBe(false)
  })

  it('puts the chip back when Chat is left', () => {
    const { workspace } = heroRow()
    paintHeroPicker({ root: document, hidden: () => true })
    paintHeroPicker({ root: document, hidden: () => false })
    expect(workspace.hasAttribute(HIDE_ATTRIBUTE)).toBe(false)
  })

  it('touches nothing when the row is not the shipped shape', () => {
    const stray = chip('Chat')
    document.body.append(stray)
    expect(paintHeroPicker({ root: document, hidden: () => true })).toBe(0)
    expect(stray.hasAttribute(HIDE_ATTRIBUTE)).toBe(false)
  })

  it('leaves a non-menu sibling of the picker slot alone', () => {
    const label = document.createElement('span')
    const slot = document.createElement('div')
    slot.setAttribute('data-slot', 'conversation.hero.workspace')
    document.body.append(label, slot)
    expect(paintHeroPicker({ root: document, hidden: () => true })).toBe(0)
    expect(label.hasAttribute(HIDE_ATTRIBUTE)).toBe(false)
  })

  it('clears a mark that survived a chip that is no longer the chip', () => {
    const stale = chip('Chat')
    stale.setAttribute(HIDE_ATTRIBUTE, '')
    document.body.append(stale)
    paintHeroPicker({ root: document, hidden: () => true })
    expect(stale.hasAttribute(HIDE_ATTRIBUTE)).toBe(false)
  })

  it('closes an open picker before taking the chip off the row', () => {
    const { workspace } = heroRow()
    workspace.setAttribute('aria-expanded', 'true')
    const onClick = vi.fn(() => { workspace.setAttribute('aria-expanded', 'false') })
    workspace.addEventListener('click', onClick)
    paintHeroPicker({ root: document, hidden: () => true })
    expect(onClick).toHaveBeenCalledOnce()
    expect(workspace.hasAttribute(HIDE_ATTRIBUTE)).toBe(true)
  })

  it('is idempotent, so a live observer can paint on every mutation', () => {
    const { workspace } = heroRow()
    paintHeroPicker({ root: document, hidden: () => true })
    const setAttribute = vi.spyOn(workspace, 'setAttribute')
    const click = vi.spyOn(workspace, 'click')
    paintHeroPicker({ root: document, hidden: () => true })
    expect(setAttribute).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })
})

describe('watchHeroPicker', () => {
  it('paints on start and again when the caller asks', () => {
    const { workspace } = heroRow()
    let hidden = false
    let onChange = (): void => {}
    const picker = watchHeroPicker({ root: document, hidden: () => hidden }, (fn) => {
      onChange = fn
      return () => {}
    })
    expect(workspace.hasAttribute(HIDE_ATTRIBUTE)).toBe(false)

    hidden = true
    onChange()
    expect(workspace.hasAttribute(HIDE_ATTRIBUTE)).toBe(true)
    picker.dispose()
  })

  it('leaves no trace when the plugin unloads', () => {
    const { workspace } = heroRow()
    const stop = vi.fn()
    const picker = watchHeroPicker(
      { root: document, hidden: () => true },
      () => stop,
    )
    expect(workspace.hasAttribute(HIDE_ATTRIBUTE)).toBe(true)
    picker.dispose()
    expect(stop).toHaveBeenCalledOnce()
    expect(workspace.hasAttribute(HIDE_ATTRIBUTE)).toBe(false)
  })

  it('watches the document, because the hero itself is re-rendered', async () => {
    const picker = watchHeroPicker({ root: document, hidden: () => true })
    const { workspace } = heroRow()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(workspace.hasAttribute(HIDE_ATTRIBUTE)).toBe(true)
    picker.dispose()
  })
})
