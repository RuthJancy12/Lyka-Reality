import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getBackendHealth,
  getOllamaStatus,
  fetchPropertiesFromApi,
  submitPublicEnquiry,
  __resetApiCacheForTests,
} from '../../services/api'
import { crmFetch, ApiRequestError } from '../../crm/services/crmApi'

describe('Network Error Handling & Failed to Fetch Resilience', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    __resetApiCacheForTests()
  })

  afterEach(() => {
    __resetApiCacheForTests()
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('Scenario A: Backend is STOPPED / Offline', () => {
    beforeEach(() => {
      // Browsers throw TypeError: Failed to fetch when port is closed / backend stopped
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    })

    it('getBackendHealth handles connection failure with actionable message', async () => {
      await expect(getBackendHealth()).rejects.toThrow(
        /Network connection failed \(Failed to fetch\)\. Verify that the backend is running/
      )
    })

    it('getOllamaStatus handles connection failure with actionable message', async () => {
      await expect(getOllamaStatus()).rejects.toThrow(
        /Network connection failed \(Failed to fetch\)\. Verify that the backend is running/
      )
    })

    it('fetchPropertiesFromApi catches network failure and advises checking port 8000', async () => {
      await expect(fetchPropertiesFromApi()).rejects.toThrow(
        /Network connection failed \(Failed to fetch\)\. Verify that the backend is running/
      )
    })

    it('submitPublicEnquiry catches network failure and informs the user', async () => {
      await expect(
        submitPublicEnquiry({
          customer_name: 'Test',
          contact_email: 'test@example.com',
          message: 'Looking for a 2BHK in Dubai Marina',
        })
      ).rejects.toThrow(
        /Network connection failed \(Failed to fetch\)\. Verify that the backend is running/
      )
    })

    it('crmFetch raises ApiRequestError with status 0 on network refusal', async () => {
      try {
        await crmFetch('/api/staff/overview')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError)
        const apiErr = err as ApiRequestError
        expect(apiErr.status).toBe(0)
        expect(apiErr.message).toContain('Network connection failed (Failed to fetch)')
        expect(apiErr.message).toContain('Verify that the backend is running')
      }
    })
  })

  describe('Scenario B: Backend is RUNNING / Online', () => {
    it('getBackendHealth parses 200 JSON correctly', async () => {
      const mockHealth = { status: 'healthy', provider: 'ollama', model: 'llama3.2:3b', message: 'All systems operational' }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHealth,
      } as unknown as Response)

      const result = await getBackendHealth()
      expect(result.status).toBe('healthy')
      expect(result.message).toBe('All systems operational')
    })

    it('fetchPropertiesFromApi returns properties on success', async () => {
      const mockResponse = {
        total_found: 10,
        exact_match: true,
        top_properties: [{ property_id: 'LYK-001', title: 'Marina Gate', price_aed: 2500000 }],
        ai_summary: [],
        criteria: {},
      }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as unknown as Response)

      const result = await fetchPropertiesFromApi({ location: 'Dubai Marina' })
      expect(result.total_found).toBe(10)
      expect(result.top_properties).toHaveLength(1)
      expect(result.top_properties[0].property_id).toBe('LYK-001')
    })
  })
})
