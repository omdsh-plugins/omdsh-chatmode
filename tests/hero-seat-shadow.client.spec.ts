// @vitest-environment jsdom
// The one harness rule this plugin's preset chip rests on: a single-kind slot
// cell goes to the LOWEST priority, and giving the registration up hands the
// cell straight back to whoever else holds it.
//
// Driven against ui-slots' real SlotCore, because the whole claim is about its
// behaviour — a double would only restate what this package believes.
import { describe, expect, it } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'

/** The registrant names the two entries carry, as the registry reports them. */
const SHIPPED = 'ui-agent-preset'
const OURS = 'omdsh-justchat'

const KEY = 'conversation.hero.agentPreset'

/** A registry with the hero chip's cell declared the way ui-conversation does. */
function registry(): SlotCore {
  const core = new SlotCore()
  // The declaration arrives as a parent entry's children table; 'root' is the
  // one slot a registry starts with.
  core.register({ name: 'root', children: { [KEY]: { kind: 'single', scope: 'root' } } } as never, () => null)
  return core
}

/** Which entry currently renders in the cell. */
function occupant(core: SlotCore): string | undefined {
  return core.entriesOfSlot(KEY)[0]?.registrant
}

describe('the hero preset seat', () => {
  it('is taken by the lower priority, whichever registered first', () => {
    const core = registry()
    core.register({ name: KEY, registrant: SHIPPED } as never, () => null)
    core.register({ name: KEY, priority: -1, registrant: OURS } as never, () => null)
    expect(occupant(core)).toBe(OURS)

    // …and the same the other way round: order of composition is not what
    // decides the cell.
    const reversed = registry()
    reversed.register({ name: KEY, priority: -1, registrant: OURS } as never, () => null)
    reversed.register({ name: KEY, registrant: SHIPPED } as never, () => null)
    expect(occupant(reversed)).toBe(OURS)
  })

  it('goes back to the shipped chip when this plugin withdraws', () => {
    const core = registry()
    core.register({ name: KEY, registrant: SHIPPED } as never, () => null)
    const dispose = core.register({ name: KEY, priority: -1, registrant: OURS } as never, () => null)
    expect(occupant(core)).toBe(OURS)
    dispose()
    // Nothing was unregistered on the way in, so removing this plugin's row
    // restores the deployment's own chip rather than emptying the seat.
    expect(occupant(core)).toBe(SHIPPED)
  })

  it('would collide at the shipped chip\'s own priority', () => {
    const core = registry()
    core.register({ name: KEY, registrant: SHIPPED } as never, () => null)
    // Why the registration carries `priority: -1` at all: a single cell refuses
    // a second occupant at the same rank, and the throw would take the whole
    // plugin down at compose time.
    expect(() => core.register({ name: KEY, registrant: OURS } as never, () => null))
      .toThrow(/already has a registration/u)
  })
})
