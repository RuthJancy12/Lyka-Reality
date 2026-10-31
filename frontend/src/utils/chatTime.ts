/**
 * Chat message time helpers (pure, deterministic, timezone-correct).
 *
 * Every message carries `createdAt` (epoch ms, local clock) assigned once
 * at creation. Streaming token appends never touch it, so each bubble —
 * including streamed replies — keeps exactly one stable timestamp.
 * History restores parse the stored ISO dates back to the same instants.
 */

export const CONVERSATION_TIMEZONE = 'Asia/Dubai'

/** Formats an instant in standard YYYY-MM-DD calendar day. */
export function getCalendarDay(epochMs: number, timeZone?: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(new Date(epochMs))
  } catch {
    const d = new Date(epochMs)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}

/** Local wall-clock time in 12-hour form, e.g. "4:10 PM". */
export function formatMessageTime(epochMs: number, timeZone?: string): string {
  return new Date(epochMs).toLocaleTimeString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function startOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Day-group label for a date separator: "Today", "Yesterday", or the
 * actual date (e.g. "Oct 4, 2026") for older conversations. `nowMs` is
 * injectable so tests never depend on the real clock.
 */
export function dayLabel(epochMs: number, nowMs: number = Date.now(), timeZone?: string): string {
  let diffDays: number
  if (timeZone) {
    const nowDay = getCalendarDay(nowMs, timeZone)
    const thenDay = getCalendarDay(epochMs, timeZone)
    diffDays = Math.round((Date.parse(nowDay) - Date.parse(thenDay)) / 86400000)
  } else {
    diffDays = Math.round((startOfLocalDay(nowMs) - startOfLocalDay(epochMs)) / 86400000)
  }
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Date(epochMs).toLocaleDateString('en-US', {
    timeZone: timeZone || undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * True when a date-separator row belongs above `currentMs` — i.e. it is
 * the first message or its day differs from the previous message's.
 * Pure day comparison (not time), so DST transitions group correctly.
 */
export function shouldShowDateSeparator(prevMs: number | null, currentMs: number, timeZone?: string): boolean {
  if (prevMs === null || prevMs === undefined) return true
  if (timeZone) {
    return getCalendarDay(prevMs, timeZone) !== getCalendarDay(currentMs, timeZone)
  }
  return startOfLocalDay(prevMs) !== startOfLocalDay(currentMs)
}
