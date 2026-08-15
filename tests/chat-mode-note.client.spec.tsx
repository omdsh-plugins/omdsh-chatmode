// @vitest-environment jsdom
// The dock note appears on a blank chat, nowhere else, and takes no row of
// its own when there is a hero workspace row to sit on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatModeNoteProps, ChatModeState, SessionMode } from '../src/client/contract.ts'
import { ChatModeNote } from '../src/client/ChatModeNote.tsx'
import { HERO_WORKSPACE_SLOT } from '../src/client/use-hero-row-offset.ts'
import { en } from '../src/client/locales.ts'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** jsdom implements no layout, so `offsetParent` is always null there. */
let offsetParentDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  offsetParentDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) { return this.closest('[data-hero-stack]') },
  })
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  if (offsetParentDescriptor === undefined) delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent
  else Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParentDescriptor)
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

/** English translate over this package's own dictionary. */
const t = ((key: string) => en[key as keyof typeof en] ?? key) as never

const NOTE = en['note.chat']

/**
 * Build the hero stack the note is rendered into: a positioned stack holding
 * the workspace row (when asked for) and the note's own seat.
 * @param withRow - whether the hero carries a workspace row to align to.
 * @returns the seat the note renders into.
 */
function hero(withRow: boolean): HTMLElement {
  const stack = document.createElement('div')
  stack.setAttribute('data-hero-stack', '')
  // The conversation skeleton positions the hero stack; jsdom needs the boxes
  // spelled out, since it lays nothing out on its own.
  stack.getBoundingClientRect = () => rect(100, 300)
  document.body.append(stack)
  if (withRow) {
    const row = document.createElement('div')
    row.getBoundingClientRect = () => rect(300, 28)
    const anchor = document.createElement('div')
    anchor.setAttribute('data-slot', HERO_WORKSPACE_SLOT)
    row.append(anchor)
    stack.append(row)
  }
  const seat = document.createElement('div')
  stack.append(seat)
  return seat
}

/** A fixed box at one vertical offset. */
function rect(top: number, height: number): DOMRect {
  return { top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect
}

/**
 * Render the note for one mode and composer phase. The props are cast once,
 * here: a component spec feeds the shares it reads and stubs the rest, rather
 * than reconstructing the framework's whole standard kit.
 */
function mount(mode: SessionMode, composerPhase: 'blank' | 'active', withRow = true) {
  const state: ChatModeState = { mode, ready: true }
  const props = {
    session: { composerPhase } as ConversationSnapshot,
    useChatMode: (select: (value: ChatModeState) => unknown) => select(state),
    t,
  } as unknown as ChatModeNoteProps
  const container = hero(withRow)
  const view = render(<ChatModeNote {...props} />, { container })
  return { view, container }
}

describe('ChatModeNote', () => {
  it('states what a chat session will not do, before it starts', () => {
    expect(mount('chat', 'blank').view.getByText(NOTE)).toBeTruthy()
  })

  it('steps aside once the conversation is under way', () => {
    // The agent's own answers are the evidence of what it can do from then on;
    // a standing banner would just be chrome.
    expect(mount('chat', 'active').view.queryByText(NOTE)).toBeNull()
  })

  it('renders nothing in work mode', () => {
    expect(mount('work', 'blank').view.queryByText(NOTE)).toBeNull()
    expect(mount('work', 'active').view.queryByText(NOTE)).toBeNull()
  })

  it('sits on the hero workspace row instead of taking a row of its own', () => {
    // Out of flow is the whole point: in flow the note grows the centred hero
    // stack, so pressing Chat or Work moves the composer under the cursor.
    const b = mount('chat', 'blank')
    const note = b.view.getByText(NOTE).parentElement!
    // The row sits 200px down the stack (300 − 100).
    expect(note.style.top).toBe('200px')
    expect(note.className).toContain('pinned')
  })

  it('keeps a row of its own when the hero has no workspace row', () => {
    // A composition that arranges the hero differently: disappearing would be
    // worse than costing it the row.
    const b = mount('chat', 'blank', false)
    const note = b.view.getByText(NOTE).parentElement!
    expect(note.style.top).toBe('')
    expect(note.className).toContain('unmeasured')
  })
})
