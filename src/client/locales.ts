/** `chatmode` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.chat': '聊天',
  'mode.work': '工作',
  'mode.chat.hint': '直接开聊，不用选项目目录',
  'mode.work.hint': '在一个项目目录里干活',
  'mode.chat.unavailable': 'Chat 工作区尚未就绪',
} satisfies Record<string, string>

/** The chatmode namespace key union. */
export type ChatModeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.chat': 'Chat',
  'mode.work': 'Work',
  'mode.chat.hint': 'Just talk — no project directory needed',
  'mode.work.hint': 'Work inside a project directory',
  'mode.chat.unavailable': 'The Chat workspace is not ready yet',
} satisfies Record<ChatModeKey, string>
