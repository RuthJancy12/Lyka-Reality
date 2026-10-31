import { describe, it, expect } from 'vitest'
import {
  formatMessageTime,
  dayLabel,
  shouldShowDateSeparator,
} from '../chatTime'

/** Local-component dates keep every assertion timezone-independent. */
function localMs(
  year: number, month1: number, day: number, hour = 12, minute = 0
): number {
  return new Date(year, month1 - 1, day, hour, minute, 0, 0).getTime()
}

describe('formatMessageTime (readable 12-hour local time)', () => {
  it('formats afternoon times like 4:10 PM', () => {
    expect(formatMessageTime(localMs(2026, 10, 4, 16, 10))).toBe('4:10 PM')
  })

  it('formats midnight and noon without 24-hour artifacts', () => {
    expect(formatMessageTime(localMs(2026, 10, 4, 0, 5))).toBe('12:05 AM')
    expect(formatMessageTime(localMs(2026, 10, 4, 12, 0))).toBe('12:00 PM')
  })

  it('never emits 24-hour hours', () => {
    expect(formatMessageTime(localMs(2026, 10, 4, 23, 59))).toBe('11:59 PM')
  })
})

describe('dayLabel (Today / Yesterday / actual date)', () => {
  it('labels the same instant Today', () => {
    const now = localMs(2026, 10, 11, 9, 30)
    expect(dayLabel(now, now)).toBe('Today')
  })

  it('labels the previous local day Yesterday', () => {
    const now = new Date(2026, 9, 11, 9, 30)
    const prev = new Date(2026, 9, 11, 9, 30)
    prev.setDate(prev.getDate() - 1)
    expect(dayLabel(prev.getTime(), now.getTime())).toBe('Yesterday')
  })

  it('labels older conversations with the actual date', () => {
    const now = localMs(2026, 10, 11, 9, 30)
    const label = dayLabel(localMs(2026, 9, 28, 18, 45), now)
    expect(label).not.toBe('Today')
    expect(label).not.toBe('Yesterday')
    expect(label).toContain('2026')
    expect(label).toMatch(/Sep/)
  })

  it('treats future instants as Today (clock skew safety)', () => {
    const now = localMs(2026, 10, 11, 9, 30)
    expect(dayLabel(now + 60_000, now)).toBe('Today')
  })
})

describe('shouldShowDateSeparator (one label per day)', () => {
  it('shows a separator above the first message', () => {
    expect(shouldShowDateSeparator(null, localMs(2026, 10, 11, 9, 30))).toBe(true)
  })

  it('hides separators within the same local day', () => {
    expect(
      shouldShowDateSeparator(
        localMs(2026, 10, 11, 9, 30),
        localMs(2026, 10, 11, 16, 10)
      )
    ).toBe(false)
  })

  it('shows a separator across a midnight boundary', () => {
    expect(
      shouldShowDateSeparator(
        localMs(2026, 10, 11, 23, 55),
        localMs(2026, 10, 12, 0, 5)
      )
    ).toBe(true)
  })
})
