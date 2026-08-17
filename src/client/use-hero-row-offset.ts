/**
 * How far down the hero stack the row carrying the workspace picker sits.
 *
 * The note belongs ON that row, at its right end, for two reasons that are
 * really one: it reads as a property of the session being started rather than
 * as a banner, and — because it is then out of flow — switching modes stops
 * changing the stack's height. In flow it added a row, the centred stack grew
 * by it, and the composer moved: the chips rose 18px and the input card fell
 * 18px every time the user pressed Chat or Work.
 *
 * The row is found through the published slot anchor
 * `[data-slot="conversation.hero.workspace"]` and one hop to its parent — the
 * row that hosts the hero workspace picker. That hop is the whole coupling,
 * and it is why the offset is optional: a composition that arranges the hero
 * differently reports nothing, and the note falls back to a row of its own.
 *
 * The offset is measured against the note's own positioning ancestor (the
 * hero stack, which the conversation skeleton positions), so it is exactly
 * the `top` an absolutely positioned note needs.
 * @module @omdsh-plugins/omdsh-chatmode/src/client/use-hero-row-offset
 */

import { useLayoutEffect, useState } from 'react'

/** The published anchor of the hero's workspace-picker seat. */
export const HERO_WORKSPACE_SLOT = 'conversation.hero.workspace'

/**
 * Track the top of the hero's workspace row, relative to the note's
 * positioning ancestor.
 * @param host - the note's own element (a callback-ref value, so the lookup
 * re-runs when the note mounts, remounts, or is not rendered yet).
 * @returns the offset in px, or undefined while no such row is found.
 */
export function useHeroRowOffset(host: HTMLElement | null): number | undefined {
  const [top, setTop] = useState<number | undefined>(undefined)

  // Layout effect, not effect: the offset has to be known before the browser
  // paints, or the note shows for one frame in the flow position it is about
  // to leave — which is the very shift this placement exists to remove.
  useLayoutEffect(() => {
    if (host === null) return
    let row: Element | null = null
    let handle: number | null = null
    let pending = false

    const measure = (): void => {
      // A detached row reports its last box forever, so drop it first.
      if (row !== null && !row.isConnected) {
        sizes.unobserve(row)
        row = null
      }
      if (row === null) {
        row = document.querySelector(`[data-slot="${HERO_WORKSPACE_SLOT}"]`)?.parentElement ?? null
        if (row !== null) sizes.observe(row)
      }
      // `offsetParent` is the box an absolute `top` is resolved against, so
      // measuring against it needs no assumption about which ancestor that is.
      const base = host.offsetParent
      if (row === null || base === null) {
        setTop(undefined)
        return
      }
      const rowBox = row.getBoundingClientRect()
      if (rowBox.height <= 0) return
      setTop(rowBox.top - base.getBoundingClientRect().top)
    }

    // The pending flag is raised BEFORE the frame is requested, so coalescing
    // holds however the callback is scheduled.
    const schedule = (): void => {
      if (pending) return
      pending = true
      handle = requestAnimationFrame(() => {
        pending = false
        measure()
      })
    }
    const sizes = new ResizeObserver(schedule)
    // The stack re-centres as the composer grows, which moves the row without
    // resizing it — so the positioning ancestor is watched too.
    if (host.offsetParent !== null) sizes.observe(host.offsetParent)
    const tree = new MutationObserver(() => {
      if (row === null || !row.isConnected) schedule()
    })
    tree.observe(document.body, { childList: true, subtree: true })
    measure()

    return () => {
      tree.disconnect()
      sizes.disconnect()
      if (handle !== null) cancelAnimationFrame(handle)
    }
  }, [host])

  return top
}
