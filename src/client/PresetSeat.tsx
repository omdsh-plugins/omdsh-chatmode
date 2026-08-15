/**
 * The agent-preset chip on the new-session screen, offering what the current
 * mode can actually use.
 *
 * It takes the seat `ui-agent-preset` registers, by registering into the same
 * single slot at a lower priority — the slot system's own shadowing rule
 * (lowest renders). Taking it is the point rather than a side effect: the chip
 * shows which composition the next session runs, and in this deployment that
 * is decided by the Chat / Work switch, so the two have to be one answer.
 *
 * Two shapes, one control:
 *
 * - **Work** — a menu over every preset except `chat`, which is what the
 *   shipped chip is, minus the one entry a project session cannot use.
 * - **Chat** — a plain label. The mode already fixed the composition; a menu
 *   with one row is a control that does nothing.
 * @module @omdsh-plugins/omdsh-justchat/src/client/PresetSeat
 */

import { useEffect, useState } from 'react'
import { IconAgentPresetOutline16, IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PresetSeatProps } from './contract.ts'
import css from './PresetSeat.module.css'

/**
 * Render the mode's agent-preset chip.
 * @param props - composed slot props (contract.ts).
 * @returns the chip, or null before the roster answers.
 */
export function PresetSeat({ usePresetSeat, load, select, describe, t }: PresetSeatProps) {
  const state = usePresetSeat(snapshot => snapshot)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  const chosen = state.options.find(option => option.id === state.current)
  // Nothing to show: the roster has not answered yet, or this deployment
  // composes no presets at all and every session shares the host composition.
  if (chosen === undefined) return null
  const text = describe(chosen)

  // One offer is a statement, not a choice — in Chat mode always, and in any
  // deployment whose roster holds a single usable preset.
  if (state.fixed || state.options.length === 1) {
    return (
      <span className={css.fixed} title={text.description ?? t('seat.fixed')}>
        <IconAgentPresetOutline16 className={css.icon} />
        {text.name}
      </span>
    )
  }

  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={state.options.map((option) => {
        const item = describe(option)
        return {
          id: option.id,
          // Name over description: the id alone never says what a preset does,
          // which is the reason the metadata exists.
          label: (
            <span className={css.item}>
              <span className={css.itemName}>{item.name}</span>
              <span className={css.itemDesc}>{item.description ?? t('seat.noDescription')}</span>
            </span>
          ),
        }
      })}
      selectedId={state.current}
      onSelect={(id) => {
        setOpen(false)
        void select(id)
      }}
      align="start"
      portal
      anchor={(
        <button
          type="button"
          className={css.seat}
          aria-haspopup="menu"
          aria-expanded={open}
          title={state.error ?? t('seat.hint')}
          disabled={state.busy}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconAgentPresetOutline16 className={css.icon} />
          {text.name}
          <IconChevronDownOutline14 className={css.chevron} />
        </button>
      )}
    />
  )
}
