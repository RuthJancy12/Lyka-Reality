/**
 * WhatsApp-style conversation history helpers.
 *
 * Pure and deterministic: grouping uses the Dubai calendar day (the
 * business timezone) and never mutates the input. Timestamps come from
 * the backend; the UI clock is only used for relative labels.
 */
import type { CustomerChatSessionSummary } from '../services/api'
import { getCalendarDay, formatMessageTime } from './chatTime'

export const CONVERSATION_TZ = 'Asia/Dubai'
const DAY_MS = 24 * 60 * 60 * 1000

export type ConversationGroupKey = 'today' | 'yesterday' | 'week' | 'month' | 'older'

export interface ConversationGroup {
  key: ConversationGroupKey
  label: string
  sessions: CustomerChatSessionSummary[]
}

const GROUP_ORDER: Array<{ key: ConversationGroupKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Previous 7 days' },
  { key: 'month', label: 'Previous 30 days' },
  { key: 'older', label: 'Older' },
]

function sessionInstant(session: CustomerChatSessionSummary): number {
  const raw = session.last_message_at || session.updated_at || session.created_at
  const parsed = Date.parse(raw || '')
  return Number.isFinite(parsed) ? parsed : 0
}

/** Calendar-day distance in Dubai, independent of the browser timezone. */
export function conversationDayDiff(epochMs: number, nowMs = Date.now()): number {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return Number.POSITIVE_INFINITY
  const nowKey = getCalendarDay(nowMs, CONVERSATION_TZ)
  const thenKey = getCalendarDay(epochMs, CONVERSATION_TZ)
  const nowDay = Date.parse(`${nowKey}T00:00:00Z`)
  const thenDay = Date.parse(`${thenKey}T00:00:00Z`)
  if (!Number.isFinite(nowDay) || !Number.isFinite(thenDay)) return Number.POSITIVE_INFINITY
  return Math.round((nowDay - thenDay) / DAY_MS)
}

/** Groups an already newest-first list into Today / Yesterday / … buckets. */
export function groupConversationsByDate(
  sessions: CustomerChatSessionSummary[],
  nowMs = Date.now()
): ConversationGroup[] {
  const buckets = new Map<ConversationGroupKey, CustomerChatSessionSummary[]>(
    GROUP_ORDER.map(({ key }) => [key, []])
  )

  for (const session of sessions || []) {
    const diff = conversationDayDiff(sessionInstant(session), nowMs)
    const key: ConversationGroupKey =
      diff <= 0 ? 'today'
      : diff === 1 ? 'yesterday'
      : diff <= 7 ? 'week'
      : diff <= 30 ? 'month'
      : 'older'
    buckets.get(key)?.push(session)
  }

  return GROUP_ORDER
    .map(({ key, label }) => ({ key, label, sessions: buckets.get(key) || [] }))
    .filter((group) => group.sessions.length > 0)
}

/** Compact timestamp shown on each conversation row. */
export function conversationTimeLabel(iso: string, nowMs = Date.now()): string {
  const parsed = Date.parse(iso || '')
  if (!Number.isFinite(parsed)) return ''
  const diff = conversationDayDiff(parsed, nowMs)
  if (diff <= 0) return formatMessageTime(parsed, CONVERSATION_TZ)
  if (diff === 1) return 'Yesterday'
  if (diff <= 7) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        timeZone: CONVERSATION_TZ,
      }).format(new Date(parsed))
    } catch {
      return ''
    }
  }
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: CONVERSATION_TZ,
    }).format(new Date(parsed))
  } catch {
    return ''
  }
}

/** Meaningful sidebar title; never blank. */
export function conversationTitle(session: CustomerChatSessionSummary): string {
  const title = (session.title || '').trim()
  return title || 'Untitled conversation'
}

/** Two-line preview, whitespace collapsed. */
export function conversationPreview(session: CustomerChatSessionSummary): string {
  const preview = (session.preview || '').replace(/\s+/g, ' ').trim()
  return preview || 'No messages yet'
}
