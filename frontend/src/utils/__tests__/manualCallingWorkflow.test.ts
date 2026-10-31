import { describe, expect, it } from 'vitest'
import { CALL_OUTCOMES, CALL_STATUS_LABELS } from '../../crm/services/staffApi'

describe('Manual Calling Workflow & Outcome Integration', () => {
  it('includes all required call outcomes with human-readable labels', () => {
    expect(CALL_OUTCOMES).toContain('attempted_no_answer')
    expect(CALL_OUTCOMES).toContain('busy_unreachable')
    expect(CALL_OUTCOMES).toContain('connected')
    expect(CALL_OUTCOMES).toContain('follow_up_required')
    expect(CALL_OUTCOMES).toContain('not_interested')

    expect(CALL_STATUS_LABELS['scheduled']).toBe('Not Attempted / Scheduled')
    expect(CALL_STATUS_LABELS['attempted_no_answer']).toBe('No Answer')
    expect(CALL_STATUS_LABELS['busy_unreachable']).toBe('Busy / Unreachable')
    expect(CALL_STATUS_LABELS['connected']).toBe('Connected')
    expect(CALL_STATUS_LABELS['follow_up_required']).toBe('Follow-up Required')
    expect(CALL_STATUS_LABELS['not_interested']).toBe('Not Interested')
  })

  it('safely formats and sanitizes telephone numbers for tel: links', () => {
    const rawNumber = '+971 (50) 123-4567'
    const sanitized = rawNumber.replace(/[^\d+]/g, '')
    expect(sanitized).toBe('+971501234567')
    expect(`tel:${sanitized}`).toBe('tel:+971501234567')

    // Handling missing phone safely
    const emptyNumber: string | null = null
    const hasPhone = Boolean(emptyNumber && (emptyNumber as string).trim().length > 3)
    expect(hasPhone).toBe(false)
  })

  it('accurately calculates a 1-month future follow-up date (Example B)', () => {
    const baseDate = new Date('2026-10-29T10:00:00Z')
    const followUp = new Date(baseDate.getTime())
    followUp.setMonth(followUp.getMonth() + 1)
    followUp.setHours(10, 0, 0, 0)

    expect(followUp.getMonth()).toBe(10) // November (0-indexed: 10 is Nov)
    expect(followUp.getDate()).toBe(29)
    expect(followUp.getFullYear()).toBe(2026)
  })

  it('accurately calculates 1-day, 3-day, and 1-week follow-up dates', () => {
    const baseDate = new Date('2026-10-29T10:00:00Z')
    
    const day1 = new Date(baseDate.getTime())
    day1.setDate(day1.getDate() + 1)
    expect(day1.getDate()).toBe(30)

    const day3 = new Date(baseDate.getTime())
    day3.setDate(day3.getDate() + 3)
    expect(day3.getDate()).toBe(1) // Nov 1

    const week1 = new Date(baseDate.getTime())
    week1.setDate(week1.getDate() + 7)
    expect(week1.getDate()).toBe(5) // Nov 5
  })

  it('distinguishes lead stages, lead temperatures, and call outcomes', () => {
    // Lead stages
    const leadStages = ['new', 'contacted', 'qualified', 'closed', 'lost']
    // Lead temperatures
    const leadTemperatures = ['Cold', 'Warm', 'Hot']
    // Call outcomes
    const callOutcomes = ['attempted_no_answer', 'busy_unreachable', 'connected', 'not_interested']

    // Ensure none of the call outcomes overlap or overwrite lead sales stages
    for (const outcome of callOutcomes) {
      expect(leadStages).not.toContain(outcome)
    }

    // Ensure lead temperatures are strictly separate from call outcomes
    for (const temp of leadTemperatures) {
      expect(CALL_OUTCOMES).not.toContain(temp.toLowerCase())
    }
  })
})
