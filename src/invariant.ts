/**
 * Package-owned invariant companion for `@omdsh-plugins/omdsh-chatmode`.
 * @module @omdsh-plugins/omdsh-chatmode/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@omdsh-plugins/omdsh-chatmode'

/** Cordis companion plugin name. */
export const name = 'omdsh-chatmode-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant. The host half performs one idempotent directory
 * create, one guarded removal, and one idempotent registry create, all
 * asserted directly by this package's own specs; the browser half owns one
 * mode value and emits no cordis events, so there is no cross-plugin state
 * whose consistency an invariant could watch.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
