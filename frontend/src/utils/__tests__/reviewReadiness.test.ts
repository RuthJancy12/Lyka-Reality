import { describe, it, expect } from 'vitest'
import type { UserRequirements } from '../../types/agent'
import { isReviewReady, firstUnanswered } from '../reviewReadiness'
// Raw source snapshots for the rename guard (vite ?raw — no node APIs).
import summaryCardSrc from '../../components/agent/SummaryCard.tsx?raw'
import modalSrc from '../../components/agent/UIAgentModal.tsx?raw'
import panelSrc from '../../components/agent/RequirementPanel.tsx?raw'

const summaryCard: string = summaryCardSrc
const modal: string = modalSrc
const panel: string = panelSrc

function blank(): UserRequirements {
  return {
    purpose: null,
    location: null,
    propertyType: null,
    bhk: null,
    budget: null,
    timeline: null,
    nearMetro: null,
    beachfront: null,
    parking: null,
    budgetFlexible: null,
    amenities: [],
  }
}

function complete(): UserRequirements {
  return {
    ...blank(),
    purpose: 'Buy',
    location: 'Dubai Marina',
    propertyType: 'Apartment',
    bhk: 2,
    budget: 2000000,
    timeline: 'Within 3 months',
    nearMetro: true,
    beachfront: false,
  }
}

/**
 * The final review form ("Search Criteria" card with Edit + Confirm &
 * Find Properties) must appear ONLY after ALL EIGHT mandatory criteria
 * are explicitly answered — never at conversation start or after any
 * partial combination such as "I want to buy a house".
 */
describe('isReviewReady (all eight mandatory criteria)', () => {
  it('is false with nothing collected (conversation start)', () => {
    expect(isReviewReady(blank())).toBe(false)
  })

  it('is false for "I want to buy a house" (purpose only)', () => {
    expect(isReviewReady({ ...blank(), purpose: 'Buy' })).toBe(false)
  })

  it('is false for purpose + location + one constraint (old rule)', () => {
    expect(
      isReviewReady({
        ...blank(),
        purpose: 'Rent',
        location: 'Dubai Marina',
        propertyType: 'Apartment',
      })
    ).toBe(false)
  })

  const keys = [
    'purpose',
    'location',
    'propertyType',
    'bhk',
    'budget',
    'timeline',
    'nearMetro',
    'beachfront',
  ] as const

  it.each(keys)('stays hidden when only %s is missing', (missing) => {
    const req = complete()
    if (missing === 'bhk') req.bhk = null
    else if (missing === 'budget') {
      req.budget = null
      req.budgetFlexible = null
    } else if (missing === 'nearMetro') req.nearMetro = null
    else if (missing === 'beachfront') req.beachfront = null
    else if (missing === 'purpose') req.purpose = null
    else if (missing === 'location') req.location = null
    else if (missing === 'propertyType') req.propertyType = null
    else if (missing === 'timeline') req.timeline = null
    expect(isReviewReady(req)).toBe(false)
  })

  it('appears when all eight are explicitly answered', () => {
    expect(isReviewReady(complete())).toBe(true)
  })

  it('counts Studio (0 BHK) as an answered bedroom choice', () => {
    expect(isReviewReady({ ...complete(), bhk: 0 })).toBe(true)
  })

  it('counts an explicit Not-sure budget as intentionally answered', () => {
    expect(
      isReviewReady({ ...complete(), budget: null, budgetFlexible: true })
    ).toBe(true)
  })

  it('counts an explicit Flexible timeline as intentionally answered', () => {
    expect(isReviewReady({ ...complete(), timeline: 'Flexible' })).toBe(true)
  })

  it('never treats defaults or unasked questions as answered', () => {
    // Optional extras (parking, amenities) must not unlock the review.
    expect(isReviewReady({ ...blank(), parking: true, amenities: ['pool'] })).toBe(false)
  })
})

describe('firstUnanswered (one question at a time)', () => {
  it('walks the collection order without repeating answered ones', () => {
    let req = blank()
    const order: Array<string | null> = []
    for (let i = 0; i < 8; i++) {
      const next = firstUnanswered(req)
      order.push(next)
      if (next === 'bhk') req = { ...req, bhk: 2 }
      else if (next === 'budget') req = { ...req, budget: 2000000 }
      else if (next === 'nearMetro') req = { ...req, nearMetro: true }
      else if (next === 'beachfront') req = { ...req, beachfront: false }
      else if (next === 'purpose') req = { ...req, purpose: 'Buy' }
      else if (next === 'location') req = { ...req, location: 'Mirdif' }
      else if (next === 'propertyType') req = { ...req, propertyType: 'Villa' }
      else if (next === 'timeline') req = { ...req, timeline: 'Flexible' }
    }
    expect(order).toEqual([
      'purpose',
      'location',
      'propertyType',
      'bhk',
      'budget',
      'timeline',
      'nearMetro',
      'beachfront',
    ])
    expect(firstUnanswered(req)).toBeNull()
    expect(isReviewReady(req)).toBe(true)
  })
})

describe('chatbot review naming', () => {
  it('shows no "Search Summary" text anywhere in the chatbot UI', () => {
    for (const [name, text] of [
      ['SummaryCard', summaryCard],
      ['UIAgentModal', modal],
      ['RequirementPanel', panel],
    ] as const) {
      expect(text, name).not.toContain('Search Summary')
    }
  })

  it('titles the final review section "Search Criteria"', () => {
    expect(summaryCard).toContain('Search Criteria')
  })

  it('keeps the live right-side Search Criteria panel intact', () => {
    expect(panel).toContain('Search Criteria')
    expect(panel).toContain('Not specified')
    expect(panel).toContain('Current')
  })

  it('keeps the Confirm & Find Properties action', () => {
    expect(summaryCard).toContain('Confirm &')
    expect(summaryCard).toContain('Find Properties')
  })
})
