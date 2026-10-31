import { describe, it, expect } from 'vitest'
import { parseLeadSource, collectLeadSource, classifyLeadChannel } from '../leadSource'

describe('parseLeadSource (UTM + referrer, never invented)', () => {
  it('parses UTM params and referrer', () => {
    expect(
      parseLeadSource(
        '?utm_source=google&utm_medium=cpc&utm_campaign=marina-launch&x=1',
        'https://www.google.com/search?q=dubai'
      )
    ).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'marina-launch',
      referrer: 'https://www.google.com/search?q=dubai',
    })
  })

  it('returns nulls when nothing is available', () => {
    expect(parseLeadSource('', '')).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      referrer: null,
    })
    expect(parseLeadSource(null, null)).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      referrer: null,
    })
  })

  it('ignores unrelated params and trims values', () => {
    const out = parseLeadSource('?utm_source=+Meta++&foo=bar', '   ')
    expect(out.utm_source).toBe('Meta')
    expect(out.utm_medium).toBeNull()
    expect(out.referrer).toBeNull()
  })

  it('caps overlong values instead of failing', () => {
    const out = parseLeadSource(`?utm_source=${'a'.repeat(400)}`, null)
    expect(out.utm_source?.length).toBeLessThanOrEqual(255)
  })
})

describe('collectLeadSource (browser-safe)', () => {
  it('never throws and returns the LeadSource shape', () => {
    const out = collectLeadSource()
    expect(out).toHaveProperty('utm_source')
    expect(out).toHaveProperty('utm_medium')
    expect(out).toHaveProperty('utm_campaign')
    expect(out).toHaveProperty('referrer')
  })
})

describe('classifyLeadChannel (Google/Instagram/Facebook/Referral/Direct/Unknown)', () => {
  it('recognises paid-network sources', () => {
    expect(classifyLeadChannel({ utm_source: 'google' })).toBe('Google')
    expect(classifyLeadChannel({ utm_source: 'Google Ads' })).toBe('Google')
    expect(classifyLeadChannel({ utm_source: 'instagram' })).toBe('Instagram')
    expect(classifyLeadChannel({ utm_source: 'facebook' })).toBe('Facebook')
    expect(classifyLeadChannel({ utm_source: 'fb' })).toBe('Facebook')
  })

  it('falls back honestly without guessing', () => {
    expect(
      classifyLeadChannel({ utm_source: null, referrer: 'https://lumen_arcade.example/x' })
    ).toBe('Referral')
    expect(
      classifyLeadChannel({ utm_source: null, utm_medium: null, utm_campaign: null, referrer: null })
    ).toBe('Direct')
    expect(classifyLeadChannel({ utm_source: 'some-new-network' })).toBe('Unknown')
    expect(classifyLeadChannel({ utm_medium: 'cpc' })).toBe('Unknown')
  })
})
