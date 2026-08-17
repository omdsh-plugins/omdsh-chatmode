/**
 * Chat mode, browser half. Two segments into a switch this package does not
 * own, over one derived fact: a session is a chat exactly when it lives in the
 * managed Chat workspace.
 *
 * - `sessionModes` (`@omdsh-plugins/omdsh-base`) — the Chat and Work segments,
 *   registered into the switch that package renders. Two postures among
 *   however many the profile composed, reaching the control the same way Code
 *   mode does.
 *
 * That is the whole surface. It used to be more: a dock note stating that a
 * chat session had no tools, and a preset chip shadowing the harness's own so
 * the mode could decide the composition. Both went with the composition
 * itself — a chat now runs the deployment's default preset, the shipped chip
 * offers every preset the deployment supplies, and the mode is once again only
 * a statement about where the conversation lives.
 *
 * Nothing here is a harness change, and nothing here is required: the segments
 * ride a restricted fiber waiting on `sessionModes`, so a profile composed
 * without `@omdsh-plugins/omdsh-base` loses two pills rather than a page.
 * @module @omdsh-plugins/omdsh-chatmode/client
 */

import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { IconFolderOpenOutline16, IconNewChatOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only, and deliberately: the registry is bound by NAME at runtime, so
// nothing of omdsh-base reaches this bundle. A value import would be a
// client-bundle purity error.
import type { SessionModes } from '@omdsh-plugins/omdsh-base/client'
import { ChatModeController } from './chat-mode.ts'
import { ChatPinController } from './pin.ts'
import { resolveServices } from './services.ts'
import { MODE_COMMANDS, SHORTCUT_SERVICE, withChord, type IShortcutClient } from './shortcut.ts'
import { en, zh, type ChatModeKey } from './locales.ts'

export type { ChatModeState, SessionMode } from './contract.ts'
export type { ChatModeKey } from './locales.ts'
export { ChatPinController, pinMove } from './pin.ts'
export type { ChatPinDeps, PinMove } from './pin.ts'

/**
 * Service name the segment registry is published under, by
 * `@omdsh-plugins/omdsh-base`.
 *
 * A literal rather than an import, for the reason `shortcut.ts` mirrors its
 * own: cordis binds services by name at runtime, and a cross-plugin value
 * import is a client-bundle purity error. The name is a wire word shared with
 * another package, not a symbol shared with it.
 */
export const SESSION_MODES = 'sessionModes'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The two segments' copy. */
    chatmode: ChatModeKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'chatmode'

/**
 * The colours the two shipped modes are drawn in — the switch's glyphs, and
 * their conversations' dots in the sidebar.
 *
 * Design tokens rather than literals, so both follow the reader's theme, and
 * these two specifically because they are already the palette's answer to
 * "settled" and "at work": the green a finished session's dot uses, and the
 * product blue a running one does. A person reading the sidebar is told what
 * kind of conversation a row is in the vocabulary the rows already speak.
 */
export const CHAT_TONE = 'var(--dsw-alias-state-success-primary)'

/** See {@link CHAT_TONE}. */
export const WORK_TONE = 'var(--dsw-static-deepseek-450)'

/**
 * The switch's glyphs, built once.
 *
 * Module scope on purpose: the registry compares icons by identity, so an
 * element rebuilt per publish would re-render the switch on every unrelated
 * segment update.
 */
const ICONS = {
  chat: createElement(IconNewChatOutline16, { size: 14 }),
  work: createElement(IconFolderOpenOutline16, { size: 14 }),
}

/** Required services (cordis fiber inject). */
export const inject = ['sessions', 'workspaces', 'locale']

/**
 * Mount the Chat-mode surfaces.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omdsh-chatmode: dictionaries')

  const { sessions, workspaces } = resolveServices(ctx)

  const controller = new ChatModeController({
    sessions: sessions.list,
    workspaces: workspaces.list,
    open: (id) => { sessions.open(id) },
    clear: () => { sessions.clear() },
    startSession: (workspaceId) => { workspaces.startSession(workspaceId) },
  })

  ctx.effect(() => controller.start(), 'omdsh-chatmode: derived session mode')

  // The host half puts the Chat workspace first at boot; this holds it there
  // afterwards, because opening a project prepends a workspace and would push
  // it down. Every conversation this plugin and `omdsh-sidechat` start is
  // accounted under that one group, so this is the whole of pinning both.
  const pin = new ChatPinController({
    workspaces: workspaces.list,
    move: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
  })
  ctx.effect(() => pin.start(), 'omdsh-chatmode: the Chat workspace stays on top')

  // This package's two postures, on a RESTRICTED fiber: a profile composed
  // without `@omdsh-plugins/omdsh-base` has no switch for a segment to appear
  // in, while the derived mode above goes on being derived for whoever reads
  // it. Off is two missing pills, not a dead page — see rule 9 of the
  // conventions for why this is not an `inject`.
  ctx.inject([SESSION_MODES], (mctx: ClientContext) => {
    const modes = mctx.get(SESSION_MODES) as unknown as SessionModes | undefined
    // Reachable when the name is provided by a fiber that is not active.
    if (modes === undefined) return
    mountSegments(mctx, modes, controller, sessions)
  })
}

/**
 * Register Chat and Work into the switch, and keep them reporting.
 * @param ctx - the restricted context the registry resolved in. Every effect
 * below rides it, so a mode system that unloads at runtime takes both segments
 * with it and leaves the derived mode standing.
 * @param modes - the resolved segment registry.
 * @param controller - the derived-mode controller both segments report from.
 * @param sessions - the session service, for the conversation a press lands on.
 */
function mountSegments(
  ctx: ClientContext,
  modes: SessionModes,
  controller: ChatModeController,
  sessions: ReturnType<typeof resolveServices>['sessions'],
): void {
  const segments = modes
  const t = ctx.locale.bind(NS)
  /**
   * The chord each of this package's segments teaches.
   *
   * Empty unless a keybinding layer is composed AND its document has arrived —
   * which is why it is a mutable fact re-applied through {@link applyCopy}
   * rather than something `copy()` could read once at registration.
   */
  let chords: Readonly<Record<string, string | undefined>> = {}
  /** This package's own two segments, in the reader's current language. */
  const copy = () => ({
    chat: {
      label: t('mode.chat'),
      // The chord rides the HINT, not the label: the pill is three short words
      // side by side and has no room for a key, while the tooltip is already
      // the place this control explains itself.
      hint: withChord(t('mode.chat.hint'), chords.chat),
      unavailableHint: t('mode.chat.unavailable'),
    },
    work: { label: t('mode.work'), hint: withChord(t('mode.work.hint'), chords.work) },
  })
  /**
   * Re-apply this package's copy to both its segments.
   *
   * The single writer of their text, so the two things that can change it — the
   * reader's language and the document's chords — cannot disagree about what
   * the other one said.
   */
  const applyCopy = (): void => {
    const next = copy()
    segments.update('chat', next.chat)
    segments.update('work', next.work)
  }
  /**
   * Push the derived mode onto the two segments. Chat and Work are reported,
   * not remembered, so this is the only writer of their active flags — and
   * marking one active is what takes the column back from another plugin's
   * posture, since the registry allows exactly one.
   *
   * With one exception: a conversation ANOTHER mode owns is that mode's to
   * report. Taking the column on its navigation would only have it taken back
   * a microtask later, once the owner answers the same event — a flicker of
   * the wrong column, and a terminal torn down and rebuilt for nothing. A
   * PRESS is never that: the user pressing Work on a Code conversation is
   * asking to read it in the web view, which is a change of column with no
   * change of conversation, and the only thing that could tell us so is the
   * press itself.
   * @param pressed - whether this is a segment's own press.
   */
  const syncDerived = (pressed = false): void => {
    const { mode, ready } = controller.store.getSnapshot()
    segments.update('chat', { available: ready })
    const current = sessions.list.getSnapshot().current
    const owner = current === undefined ? undefined : segments.modeOf(current)
    if (!pressed && owner !== undefined && owner.id !== 'chat' && owner.id !== 'work') return
    segments.update('chat', { active: mode === 'chat' })
    segments.update('work', { active: mode === 'work' })
  }

  ctx.effect(() => segments.register({
    id: 'chat',
    order: 0,
    ...copy().chat,
    tone: CHAT_TONE,
    icon: ICONS.chat,
    // The same rule the switch is derived from, asked per conversation: what
    // makes a session a chat is living in the managed Chat workspace.
    owns: (sessionId: string) => controller.owns(sessionId),
    // Chat needs the host's managed workspace before it can put a
    // conversation anywhere; the derived sync fills this in immediately.
    available: false,
    enter: () => { controller.enterChat(); syncDerived(true) },
  }), 'omdsh-chatmode: chat segment')

  ctx.effect(() => segments.register({
    id: 'work',
    order: 10,
    ...copy().work,
    tone: WORK_TONE,
    icon: ICONS.work,
    // Work is what a conversation is when no other mode claims it, which is
    // the honest reading of "a session in a project": every posture is a way
    // of working in one, and this is the one with no further condition.
    fallback: true,
    // Work needs nothing from this plugin — the shipped workspace picker is
    // already the screen it lands on.
    enter: () => { controller.enterWork(); syncDerived(true) },
  }), 'omdsh-chatmode: work segment')

  // A New Session that reached the frame, which the switch's owner announces
  // because that gesture is the one navigation with nothing to derive from —
  // `startSession` reuses a workspace's blank conversation, so the request can
  // move no selection and publish no store. Asking is the whole fact.
  ctx.effect(() => modes.onNewSession(() => { controller.requestedNewSession() }),
    'omdsh-chatmode: a New Session the frame answered')

  syncDerived()
  // Wrapped rather than passed: a listener called with the snapshot would
  // arrive here as a truthy `pressed`, and every derived update would claim to
  // be a press.
  ctx.effect(() => controller.store.subscribe(() => { syncDerived() }), 'omdsh-chatmode: segment mode sync')
  ctx.effect(() => ctx.on('locale/change', () => { applyCopy() }), 'omdsh-chatmode: segment copy')

  // The chords the two segments teach. A RESTRICTED fiber: a composition with
  // no keybinding layer has no chord to name, and the switch is still the whole
  // way into a mode — so its absence costs a tooltip suffix and nothing else.
  ctx.inject([SHORTCUT_SERVICE], (sctx) => {
    const shortcut = sctx.get(SHORTCUT_SERVICE) as unknown as IShortcutClient | undefined
    if (shortcut === undefined) return
    const followChords = (): void => {
      const next: Record<string, string | undefined> = {}
      for (const [mode, command] of Object.entries(MODE_COMMANDS)) next[mode] = shortcut.chordLabel(command)
      if (next.chat === chords.chat && next.work === chords.work) return
      chords = next
      applyCopy()
    }
    sctx.effect(() => {
      const off = shortcut.onBindings(followChords)
      // The document usually lands after this fiber does, so the first read is
      // typically empty and the subscription is what fills it in.
      followChords()
      // Back to naming no key when the layer unloads, rather than teaching one
      // that no longer exists.
      return () => { off(); chords = {}; applyCopy() }
    }, 'omdsh-chatmode: follow the mode chords')
  })
}
