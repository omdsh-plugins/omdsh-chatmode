/**
 * The services this plugin uses, named explicitly instead of read off the
 * ambient cordis `Context`.
 *
 * Why: the harness deliberately typechecks its browser and host halves as two
 * separate programs, "because both sides merge cordis Context under the same
 * keys (sessions, loader) with different services" (`tsconfig.client.json`).
 * A plugin compiled OUTSIDE that repository has no such split — one program
 * reaches both packages' `.d.ts` through the same `@deepseek-ai/cordis`, both
 * `Context.sessions` declarations merge, and with `skipLibCheck` the winner is
 * whichever the compiler saw first. That makes `ctx.sessions` unreliable HERE
 * and nowhere else: at runtime cordis resolves exactly one service per name,
 * and it is the browser one, because only the browser one is ever provided in
 * this process.
 *
 * So the plugin states the faces it uses and resolves them by name, the way
 * `connection` is already resolved everywhere in the harness's own client
 * packages. Every use downstream is fully typed against the real contract.
 * @module @omdsh-plugins/omdsh-justchat/src/client/services
 */

import type { ClientContext, ISessions, IWorkspaces } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'

/** The three faces Chat mode reaches outside its own package. */
export interface JustChatServices {
  /** Session selection and the live list the mode is derived from. */
  readonly sessions: ISessions
  /** The workspace list, and the New Session flow that connects one. */
  readonly workspaces: IWorkspaces
  /** The wire handle, for the agent-preset selection RPC. */
  readonly connection: ConnectionHandle
}

/**
 * Resolve this plugin's services from the client root context.
 *
 * Every name here is in the plugin's `inject` list, so cordis has published
 * all three before `apply` runs and a missing one is a composition error
 * rather than a case to handle.
 * @param ctx - client root context.
 * @returns the three service faces (see {@link JustChatServices}).
 */
export function resolveServices(ctx: ClientContext): JustChatServices {
  return {
    sessions: ctx.get('sessions') as unknown as ISessions,
    workspaces: ctx.get('workspaces') as unknown as IWorkspaces,
    connection: ctx.get('connection') as unknown as ConnectionHandle,
  }
}
