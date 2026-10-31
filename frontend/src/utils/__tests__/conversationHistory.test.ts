import { describe, it, expect } from 'vitest'
import type { CustomerChatSessionSummary } from '../../services/api'
import {
  conversationPreview,
  conversationTimeLabel,
  conversationTitle,
  groupConversationsByDate,
} from '../conversationHistory'

const NOW = Date.parse('2026-10-31T12:00:00Z') // 16:00 Dubai

function session(
  sessionId: string,
  iso: string,
  overrides: Partial<CustomerChatSessionSummary> = {}
): CustomerChatSessionSummary {
  return {
    session_id: sessionId,
    title: `Chat ${sessionId}`,
    created_at: iso,
    updated_at: iso,
    turn_count: 2,
    has_recommendations: false,
    recommended_property_ids: [],
    preview: `Preview ${sessionId}`,
    last_message_at: iso,
    ...overrides,
  }
}

describe('conversationHistory', () => {
  it('groups newest-first sessions into Dubai-calendar buckets', () => {
    const groups = groupConversationsByDate(
      [
        session('today', '2026-10-31T06:00:00Z'),
        session('yesterday', '2026-10-30T06:00:00Z'),
        session('week', '2026-10-27T06:00:00Z'),
        session('month', '2026-10-10T06:00:00Z'),
        session('older', '2026-08-01T06:00:00Z'),
      ],
      NOW
    )

    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'week', 'month', 'older'])
    expect(groups.map((g) => g.label)).toEqual([
      'Today',
      'Yesterday',
      'Previous 7 days',
      'Previous 30 days',
      'Older',
    ])
    expect(groups.flatMap((g) => g.sessions.map((s) => s.session_id))).toEqual([
      'today',
      'yesterday',
      'week',
      'month',
      'older',
    ])
  })

  it('skips empty buckets and tolerates a missing timestamp', () => {
    const groups = groupConversationsByDate(
      [session('broken', '', { last_message_at: null, updated_at: '', created_at: '' })],
      NOW
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('older')
  })

  it('produces compact, non-empty labels', () => {
    expect(conversationTimeLabel('2026-10-31T06:00:00Z', NOW)).toMatch(/AM|PM/i)
    expect(conversationTimeLabel('2026-10-30T06:00:00Z', NOW)).toBe('Yesterday')
    expect(conversationTimeLabel('2026-10-27T06:00:00Z', NOW)).toMatch(/^[A-Za-z]{3}$/)
    expect(conversationTimeLabel('2026-09-10T06:00:00Z', NOW)).toMatch(/^10 Sep/)
    expect(conversationTimeLabel('', NOW)).toBe('')
  })

  it('never renders a blank title or preview', () => {
    const blank = session('blank', '2026-10-31T06:00:00Z', {
      title: '   ',
      preview: '  line one\n\n line two  ',
    })
    expect(conversationTitle(blank)).toBe('Untitled conversation')
    expect(conversationPreview(blank)).toBe('line one line two')
    expect(conversationPreview(session('empty', '', { preview: null }))).toBe('No messages yet')
  })
})
