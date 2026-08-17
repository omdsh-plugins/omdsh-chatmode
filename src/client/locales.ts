/** `chatmode` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.chat': '聊天',
  'mode.work': '工作',
  'mode.chat.hint': '直接开聊，不用选项目目录',
  'mode.work.hint': '在一个项目目录里干活',
  'note.chat': '纯聊天模式：不读写文件，也不执行命令',
  'mode.chat.unavailable': 'Chat 工作区尚未就绪',
  'seat.hint': '即将开始的这个会话所用的 Agent 预设',
  'seat.fixed': '本次会话的 Agent 预设，由当前模式决定',
  'seat.noDescription': '暂无描述。',
} satisfies Record<string, string>

/** The chatmode namespace key union. */
export type ChatModeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.chat': 'Chat',
  'mode.work': 'Work',
  'mode.chat.hint': 'Just talk — no project directory needed',
  'mode.work.hint': 'Work inside a project directory',
  'note.chat': 'Chat only: no files are read or written, and nothing is run',
  'mode.chat.unavailable': 'The Chat workspace is not ready yet',
  'seat.hint': 'Agent preset for the session you are about to start',
  'seat.fixed': 'The agent preset for this session, set by the current mode',
  'seat.noDescription': 'No description.',
} satisfies Record<ChatModeKey, string>
