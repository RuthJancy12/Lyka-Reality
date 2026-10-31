import { describe, it, expect } from 'vitest'
import {
  dayLabel,
  shouldShowDateSeparator,
  CONVERSATION_TIMEZONE,
} from '../chatTime'

describe('Conversation Date Grouping and Timezone Validation (Asia/Dubai)', () => {
  it('correctly identifies today and yesterday in Asia/Dubai', () => {
    // 2026-10-31 14:00 UTC = 2026-10-31 18:00 GST (Dubai)
    const nowUtc = Date.parse('2026-10-31T14:00:00Z')
    // 2026-10-30 10:00 UTC = 2026-10-30 14:00 GST (Dubai yesterday)
    const yesterdayUtc = Date.parse('2026-10-30T10:00:00Z')

    expect(dayLabel(yesterdayUtc, nowUtc, CONVERSATION_TIMEZONE)).toBe('Yesterday')
    expect(dayLabel(nowUtc, nowUtc, CONVERSATION_TIMEZONE)).toBe('Today')
  })

  it('shows date separator across day boundary in Dubai timezone', () => {
    const yesterdayUtc = Date.parse('2026-10-30T22:00:00Z') // 2026-10-31 02:00 GST
    const twoDaysAgoUtc = Date.parse('2026-10-29T12:00:00Z') // 2026-10-29 16:00 GST

    expect(shouldShowDateSeparator(twoDaysAgoUtc, yesterdayUtc, CONVERSATION_TIMEZONE)).toBe(true)
    expect(shouldShowDateSeparator(yesterdayUtc, yesterdayUtc + 3600000, CONVERSATION_TIMEZONE)).toBe(false)
  })

  it('labels 3 days ago with exact formatted date', () => {
    const nowUtc = Date.parse('2026-10-31T14:00:00Z')
    const olderUtc = Date.parse('2026-10-27T10:00:00Z')

    const label = dayLabel(olderUtc, nowUtc, CONVERSATION_TIMEZONE)
    expect(label).not.toBe('Today')
    expect(label).not.toBe('Yesterday')
    expect(label).toContain('2026')
    expect(label).toMatch(/Oct/)
  })

  it('preserves chronological order of restored conversation without inserting today label above older turns', () => {
    const yesterdayMsgTime = Date.parse('2026-10-30T10:00:00Z')
    const todayMsgTime = Date.parse('2026-10-31T09:00:00Z')

    const messages = [
      { id: '1', sender: 'user', text: 'I want a 2 BHK apartment in Dubai Sports City', createdAt: yesterdayMsgTime },
      { id: '2', sender: 'agent', text: 'I found 3 matching properties in Dubai Sports City', createdAt: yesterdayMsgTime + 5000 },
      { id: '3', sender: 'user', text: 'Yesterday it recommended some properties', createdAt: todayMsgTime },
    ]

    // Message 1 is first: show separator
    expect(shouldShowDateSeparator(null, messages[0].createdAt, CONVERSATION_TIMEZONE)).toBe(true)
    expect(dayLabel(messages[0].createdAt, todayMsgTime, CONVERSATION_TIMEZONE)).toBe('Yesterday')

    // Message 2 is same day as message 1: no separator
    expect(shouldShowDateSeparator(messages[0].createdAt, messages[1].createdAt, CONVERSATION_TIMEZONE)).toBe(false)

    // Message 3 is today: show separator
    expect(shouldShowDateSeparator(messages[1].createdAt, messages[2].createdAt, CONVERSATION_TIMEZONE)).toBe(true)
    expect(dayLabel(messages[2].createdAt, todayMsgTime, CONVERSATION_TIMEZONE)).toBe('Today')
  })
})

