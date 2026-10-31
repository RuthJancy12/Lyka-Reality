import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DISCOVERY_SOURCES,
  normalizeDiscoverySource,
  isValidDiscoverySource,
  validateDiscoverySource,
  parseLeadSource,
} from '../leadSource'
import { validateCustomerProfile } from '../customerProfile'
import { submitPublicEnquiry, saveCustomerProfile } from '../../services/api'

describe('discovery source options ("How did you hear about LYKA Realty?")', () => {
  it('offers exactly the six listed options', () => {
    expect([...DISCOVERY_SOURCES]).toEqual([
      'Google',
      'Instagram',
      'Facebook',
      'Friend/Referral',
      'Direct Website',
      'Other/Unknown',
    ])
  })
})

describe('normalizeDiscoverySource (self-reported, never guessed)', () => {
  it('passes listed values through unchanged', () => {
    for (const s of DISCOVERY_SOURCES) {
      expect(normalizeDiscoverySource(s)).toBe(s)
    }
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeDiscoverySource('  Google  ')).toBe('Google')
  })

  it('returns null for missing answers (stays NULL server-side)', () => {
    expect(normalizeDiscoverySource('')).toBeNull()
    expect(normalizeDiscoverySource('   ')).toBeNull()
    expect(normalizeDiscoverySource(null)).toBeNull()
    expect(normalizeDiscoverySource(undefined)).toBeNull()
  })

  it('returns null for unlisted values instead of guessing', () => {
    expect(normalizeDiscoverySource('TikTok')).toBeNull()
    expect(normalizeDiscoverySource('google')).toBeNull()
    expect(normalizeDiscoverySource(42)).toBeNull()
  })
})

describe('validateDiscoverySource', () => {
  it('accepts missing and listed values', () => {
    expect(validateDiscoverySource(null)).toBeNull()
    expect(validateDiscoverySource('')).toBeNull()
    expect(validateDiscoverySource('Friend/Referral')).toBeNull()
  })

  it('rejects unlisted values', () => {
    expect(validateDiscoverySource('TikTok')).toMatch(/list/i)
    expect(isValidDiscoverySource('TikTok')).toBe(false)
    expect(isValidDiscoverySource('Instagram')).toBe(true)
    expect(isValidDiscoverySource(null)).toBe(true)
  })
})

describe('validateCustomerProfile with discovery source', () => {
  it('accepts a valid self-reported source', () => {
    expect(
      validateCustomerProfile({ name: 'Sara', discovery_source: 'Instagram' })
    ).toBeNull()
  })

  it('accepts missing sources (old records stay compatible)', () => {
    expect(validateCustomerProfile({ name: 'Sara' })).toBeNull()
    expect(
      validateCustomerProfile({ name: 'Sara', discovery_source: null })
    ).toBeNull()
    expect(validateCustomerProfile({ name: 'Sara', discovery_source: '' })).toBeNull()
  })

  it('rejects invalid values without touching other fields', () => {
    expect(
      validateCustomerProfile({ name: 'Sara', discovery_source: 'TikTok' })
    ).toMatch(/heard about/i)
    // Existing validations still fire independently.
    expect(
      validateCustomerProfile({ name: '   ', discovery_source: 'Google' })
    ).toMatch(/name/i)
  })
})

describe('self-reported source stays separate from automatic attribution', () => {
  it('parseLeadSource never carries a discovery_source key', () => {
    const auto = parseLeadSource('?utm_source=google', 'https://x.example/')
    expect('discovery_source' in auto).toBe(false)
    expect(auto.utm_source).toBe('google')
  })
})

describe('API submission carries discovery_source', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('submitPublicEnquiry sends the selected value (anonymous, no login)', async () => {
    let sentBody = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, opts: RequestInit) => {
        sentBody = String(opts.body)
        return { ok: true, json: async () => ({ id: 1, status: 'new' }) }
      })
    )
    await submitPublicEnquiry({
      customer_name: 'Elena Rostova',
      contact_email: 'elena@t.ae',
      discovery_source: 'Friend/Referral',
      utm_source: 'google',
    })
    const body = JSON.parse(sentBody) as Record<string, unknown>
    expect(body.discovery_source).toBe('Friend/Referral')
    // Automatic attribution travels alongside, untouched.
    expect(body.utm_source).toBe('google')
  })

  it('submitPublicEnquiry sends null when unanswered (never invented)', async () => {
    let sentBody = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, opts: RequestInit) => {
        sentBody = String(opts.body)
        return { ok: true, json: async () => ({ id: 2, status: 'new' }) }
      })
    )
    await submitPublicEnquiry({
      customer_name: 'No Src',
      contact_email: 'nosrc@t.ae',
      discovery_source: null,
    })
    const body = JSON.parse(sentBody) as Record<string, unknown>
    expect(body.discovery_source).toBeNull()
  })

  it('saveCustomerProfile sends the permitted discovery_source field', async () => {
    let sentBody = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, opts: RequestInit) => {
        sentBody = String(opts.body)
        return {
          ok: true,
          json: async () => ({ profile: { discovery_source: 'Google' }, role: 'customer' }),
        }
      })
    )
    const res = await saveCustomerProfile({
      name: 'Sara Ahmed',
      discovery_source: 'Google',
    })
    const body = JSON.parse(sentBody) as Record<string, unknown>
    expect(body.discovery_source).toBe('Google')
    expect(res.profile?.discovery_source).toBe('Google')
  })
})
