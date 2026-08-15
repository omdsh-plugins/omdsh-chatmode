// @vitest-environment jsdom
// The preset chip: a menu in Work, a statement in Chat, and never the other
// mode's presets.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { PresetSeatProps } from '../src/client/contract.ts'
import type { PresetSeatState } from '../src/client/preset-seat.ts'
import { CHAT_PRESET_ID } from '../src/client/chat-mode.ts'
import { PresetSeat } from '../src/client/PresetSeat.tsx'
import { presetDisplayText } from '../src/client/preset-display.ts'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

/** English translate over this package's own dictionary. */
const t = ((key: string) => en[key as keyof typeof en] ?? key) as never

const WORK_OPTIONS = [
  { id: 'standard', trust: 'system' as const, name: '标准模式', description: '功能完整的编码 Agent。' },
  { id: 'minimal', trust: 'system' as const, name: '极简模式' },
]

/**
 * Render the chip over one snapshot. The props are cast once, here: a
 * component spec feeds the shares it reads and stubs the rest.
 */
function mount(state: Partial<PresetSeatState>) {
  const snapshot: PresetSeatState = {
    options: WORK_OPTIONS, current: 'standard', fixed: false, busy: false, error: null, ...state,
  }
  const select = vi.fn(async () => {})
  const load = vi.fn(async () => {})
  const props = {
    usePresetSeat: (pick: (value: PresetSeatState) => unknown) => pick(snapshot),
    load,
    select,
    // No agent-preset dictionary here, so every shipped name falls back to
    // the preset's own metadata — the deployment-without-ui-agent-preset case.
    describe: (option: (typeof WORK_OPTIONS)[number]) => presetDisplayText(option, key => key),
    t,
  } as unknown as PresetSeatProps
  const view = render(<PresetSeat {...props} />)
  return { view, select, load }
}

describe('PresetSeat', () => {
  it('reads the roster once it is on screen', () => {
    const b = mount({})
    expect(b.load).toHaveBeenCalledOnce()
  })

  it('opens a menu over the presets this mode offers and hands a pick back', () => {
    const b = mount({})
    const chip = b.view.getByRole('button')
    expect(chip.textContent).toContain('标准模式')
    fireEvent.click(chip)
    // The description rides the row: the id alone never said what a preset does.
    expect(b.view.getByText('功能完整的编码 Agent。')).toBeTruthy()
    expect(b.view.getByText(en['seat.noDescription'])).toBeTruthy()
    fireEvent.click(b.view.getByText('极简模式'))
    expect(b.select).toHaveBeenCalledWith('minimal')
  })

  it('states the composition instead of offering one in Chat mode', () => {
    const b = mount({
      options: [{ id: CHAT_PRESET_ID, trust: 'user', name: 'Chat Mode', description: 'No tools.' }],
      current: CHAT_PRESET_ID,
      fixed: true,
    })
    expect(b.view.getByText('Chat Mode')).toBeTruthy()
    // Nothing to press: the mode already decided which composition this is.
    expect(b.view.queryByRole('button')).toBeNull()
  })

  it('is inert while a switch is in flight, and says why one failed', () => {
    const b = mount({ busy: true, error: 'agent-preset-locked' })
    const chip = b.view.getByRole('button') as HTMLButtonElement
    expect(chip.disabled).toBe(true)
    expect(chip.title).toBe('agent-preset-locked')
  })

  it('renders nothing before the roster answers', () => {
    const b = mount({ options: [], current: '' })
    expect(b.view.container.textContent).toBe('')
  })
})
