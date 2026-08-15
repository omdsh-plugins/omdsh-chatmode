/**
 * The one line Chat mode adds to the conversation: what this session can and
 * cannot do, at the right end of the row the workspace chip sits on.
 *
 * It rides `conversation.input.dock` — the harness's own seat for content
 * needing a line of its own above the composer card — but it does not take
 * that line. It is absolutely positioned onto the row above, which is what
 * keeps pressing Chat or Work from resizing anything: a note in flow grows
 * the centred hero stack, and the composer moves under the user's cursor. Out
 * of flow, both modes lay out identically and only the note appears.
 *
 * The note is for the blank phase only: once the conversation is under way,
 * its answers are the evidence of what the agent can do, and a standing
 * banner would just be chrome. In Work mode the entry renders nothing at all.
 * @module @omdsh-plugins/omdsh-justchat/src/client/ChatModeNote
 */

import { useState } from 'react'
import clsx from 'clsx'
import { IconSparkle16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatModeNoteProps } from './contract.ts'
import { useHeroRowOffset } from './use-hero-row-offset.ts'
import css from './ChatModeNote.module.css'

/**
 * Render the chat-mode note.
 * @param props - composed slot props (contract.ts).
 * @returns the note, or null outside a blank chat session.
 */
export function ChatModeNote({ session, useChatMode, t }: ChatModeNoteProps) {
  const mode = useChatMode(state => state.mode)
  // A callback ref in state, not useRef: the note is not rendered at all in
  // Work mode, so the measurement has to start when the element appears.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const top = useHeroRowOffset(host)
  const pinned = top !== undefined

  if (mode !== 'chat' || session.composerPhase !== 'blank') return null
  return (
    <div
      ref={setHost}
      // Hidden rather than in-flow for the frame before the row is measured:
      // showing it in flow first would move the composer once and then again.
      className={clsx(css.root, pinned ? css.pinned : css.unmeasured)}
      style={pinned ? { top } : undefined}
    >
      <IconSparkle16 className={css.mark} size={14} />
      <span>{t('note.chat')}</span>
    </div>
  )
}
