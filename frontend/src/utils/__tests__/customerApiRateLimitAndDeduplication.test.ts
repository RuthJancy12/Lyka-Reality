import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCustomerProfile,
  getCustomerFavorites,
  saveCustomerFavorites,
  getCustomerInquiries,
  getCustomerLatestChat,
  getCustomerInteractions,
  getCustomerTrackingConsent,
  getMyAppointments,
  fetchPropertiesFromApi,
  isRateLimited,
  getRateLimitRemainingSeconds,
  getLastRetryAfterSeconds,
  RateLimitError,
  __resetApiCacheForTests,
} from '../../services/api'

describe('Customer API In-Flight Deduplication & 429 Rate-Limit Handling', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    __resetApiCacheForTests()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    __resetApiCacheForTests()
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('1. In-Flight Request Deduplication', () => {
    it('deduplicates concurrent in-flight GET requests to getCustomerProfile', async () => {
      const mockProfile = {
        profile: {
          firebase_uid: 'uid-123',
          email: 'investor@example.com',
          name: 'Investor Name',
          phone: '+971500000000',
          city: 'Dubai',
          country: 'UAE',
          preferences: { locations: ['Downtown Dubai'], propertyType: null, bedrooms: null, budgetMin: null, budgetMax: null, purpose: 'Buy', timeline_days: null },
          utm_source: null, utm_medium: null, utm_campaign: null, referrer: null, discovery_source: null,
          role: 'Customer', created_at: '', updated_at: ''
        },
        role: 'Customer'
      }

      let fetchCallCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++
        // Simulate real network delay
        await new Promise((r) => setTimeout(r, 20))
        return {
          ok: true,
          status: 200,
          json: async () => mockProfile,
        } as unknown as Response
      })

      // Fire 5 simultaneous requests from concurrent components
      const [res1, res2, res3, res4, res5] = await Promise.all([
        getCustomerProfile(),
        getCustomerProfile(),
        getCustomerProfile(),
        getCustomerProfile(),
        getCustomerProfile(),
      ])

      // Only 1 real HTTP fetch request was sent over the network
      expect(fetchCallCount).toBe(1)
      expect(res1.profile?.name).toBe('Investor Name')
      expect(res2).toEqual(res1)
      expect(res3).toEqual(res1)
      expect(res4).toEqual(res1)
      expect(res5).toEqual(res1)
    })

    it('deduplicates concurrent in-flight calls to getCustomerFavorites and getMyAppointments', async () => {
      let favsFetchCount = 0
      let apptsFetchCount = 0

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        await new Promise((r) => setTimeout(r, 15))
        if (url.includes('/api/customer/favorites')) {
          favsFetchCount++
          return {
            ok: true,
            status: 200,
            json: async () => ({ favorites: ['LYK-001', 'LYK-002'] }),
          } as unknown as Response
        }
        if (url.includes('/api/customer/appointments')) {
          apptsFetchCount++
          return {
            ok: true,
            status: 200,
            json: async () => ({ appointments: [{ id: 1, kind: 'viewing', scheduled_at: '2026-11-01' }] }),
          } as unknown as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
      })

      const [favs1, favs2, favs3, appts1, appts2] = await Promise.all([
        getCustomerFavorites(),
        getCustomerFavorites(),
        getCustomerFavorites(),
        getMyAppointments(),
        getMyAppointments(),
      ])

      expect(favsFetchCount).toBe(1)
      expect(apptsFetchCount).toBe(1)
      expect(favs1).toEqual(['LYK-001', 'LYK-002'])
      expect(favs2).toEqual(favs1)
      expect(favs3).toEqual(favs1)
      expect(appts1).toHaveLength(1)
      expect(appts2).toEqual(appts1)
    })
  })

  describe('2. Short Response Caching & Invalidation', () => {
    it('serves sequential calls within 5s from cache without re-fetching', async () => {
      let fetchCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++
        return {
          ok: true,
          status: 200,
          json: async () => ({ tracking_consent: true }),
        } as unknown as Response
      })

      const first = await getCustomerTrackingConsent()
      expect(first).toBe(true)
      expect(fetchCount).toBe(1)

      // Immediate second call
      const second = await getCustomerTrackingConsent()
      expect(second).toBe(true)
      expect(fetchCount).toBe(1) // No second fetch
    })

    it('invalidates cache when saving customer data', async () => {
      let getCount = 0
      let putCount = 0

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
        if (opts?.method === 'PUT') {
          putCount++
          return {
            ok: true,
            status: 200,
            json: async () => ({ favorites: ['LYK-999'] }),
          } as unknown as Response
        }
        getCount++
        return {
          ok: true,
          status: 200,
          json: async () => ({ favorites: getCount === 1 ? ['LYK-001'] : ['LYK-999'] }),
        } as unknown as Response
      })

      // Initial read
      const initial = await getCustomerFavorites()
      expect(initial).toEqual(['LYK-001'])
      expect(getCount).toBe(1)

      // Mutating save invalidates cache
      await saveCustomerFavorites(['LYK-999'])
      expect(putCount).toBe(1)

      // Subsequent read fetches fresh data
      const afterSave = await getCustomerFavorites()
      expect(afterSave).toEqual(['LYK-999'])
      expect(getCount).toBe(2)
    })
  })

  describe('3. HTTP 429 ("Too Many Requests") Graceful Handling & Circuit Breaker', () => {
    it('enters rate-limited backoff and throws RateLimitError with retryAfter', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '4' }),
        json: async () => ({ detail: 'Too many requests. Please retry shortly.' }),
      } as unknown as Response)

      expect(isRateLimited()).toBe(false)

      await expect(getCustomerProfile()).rejects.toThrow(RateLimitError)
      expect(isRateLimited()).toBe(true)
      expect(getLastRetryAfterSeconds()).toBe(4)
      expect(getRateLimitRemainingSeconds()).toBeGreaterThan(0)
      expect(getRateLimitRemainingSeconds()).toBeLessThanOrEqual(4)
    })

    it('blocks subsequent network calls during the rate-limit window', async () => {
      let networkCalls = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        networkCalls++
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '10' }),
          json: async () => ({ detail: 'Rate limit exceeded' }),
        } as unknown as Response
      })

      // First call hits 429
      await expect(getCustomerInquiries()).rejects.toThrow(RateLimitError)
      expect(networkCalls).toBe(1)

      // Second call during backoff window: immediately rejected without hitting the network!
      await expect(getCustomerInquiries()).rejects.toThrow(/Server is temporarily busy/)
      expect(networkCalls).toBe(1) // Still 1! Network was NOT touched!
    })

    it('gracefully degrades by serving stale cached data when 429 occurs on subsequent read', async () => {
      let callCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          // Initial successful response
          return {
            ok: true,
            status: 200,
            json: async () => ({
              interactions: [
                { id: '1', kind: 'view', property_id: 'LYK-100', location: 'Dubai Marina', property_type: 'Apartment', bedrooms: 2, query: null, created_at: '' }
              ]
            }),
          } as unknown as Response
        }
        // Subsequent call returns 429
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '15' }),
          json: async () => ({ detail: 'Too many requests' }),
        } as unknown as Response
      })

      const first = await getCustomerInteractions()
      expect(first).toHaveLength(1)
      expect(first[0].property_id).toBe('LYK-100')

      // Trigger rate limit on another endpoint
      await expect(getCustomerLatestChat()).rejects.toThrow(RateLimitError)
      expect(isRateLimited()).toBe(true)

      // Reading interactions while rate-limited gracefully serves stale cache without throwing or hitting network!
      const stale = await getCustomerInteractions()
      expect(stale).toHaveLength(1)
      expect(stale[0].property_id).toBe('LYK-100')
    })
  })

  describe('4. Property Search In-Flight Deduplication & Caching', () => {
    it('deduplicates simultaneous identical property searches', async () => {
      let searchFetchCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        searchFetchCount++
        await new Promise((r) => setTimeout(r, 20))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            total_found: 25,
            exact_match: true,
            top_properties: [{ property_id: 'LYK-001', title: 'Luxury Villa' }],
            ai_summary: [],
            criteria: {}
          }),
        } as unknown as Response
      })

      const [s1, s2, s3] = await Promise.all([
        fetchPropertiesFromApi({ location: 'Dubai Marina', limit: 250 }),
        fetchPropertiesFromApi({ location: 'Dubai Marina', limit: 250 }),
        fetchPropertiesFromApi({ location: 'Dubai Marina', limit: 250 }),
      ])

      expect(searchFetchCount).toBe(1)
      expect(s1.total_found).toBe(25)
      expect(s2).toEqual(s1)
      expect(s3).toEqual(s1)
    })

    it('returns cached property search within TTL window', async () => {
      let count = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        count++
        return {
          ok: true,
          status: 200,
          json: async () => ({
            total_found: 5,
            exact_match: true,
            top_properties: [],
            ai_summary: [],
            criteria: {}
          }),
        } as unknown as Response
      })

      const r1 = await fetchPropertiesFromApi({ bedrooms: 3 })
      expect(count).toBe(1)
      expect(r1.total_found).toBe(5)

      // Immediate second call uses cache
      const r2 = await fetchPropertiesFromApi({ bedrooms: 3 })
      expect(count).toBe(1)
      expect(r2.total_found).toBe(5)
    })
  })
})
