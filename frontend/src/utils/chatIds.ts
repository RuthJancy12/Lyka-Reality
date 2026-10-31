/**
 * Unique chat message ids. Date.now() alone collides when two messages are
 * created within the same millisecond, which React then treats as one row —
 * dropping or duplicating visible messages. Counter + random suffix makes
 * every id unique within and across sessions.
 */
let chatMsgSeq = 0

export function nextChatMsgId(prefix: string): string {
  chatMsgSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${chatMsgSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
