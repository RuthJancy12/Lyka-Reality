import { describe, it, expect, vi, beforeEach } from 'vitest'
import { INITIAL_GREETING_MESSAGE } from '../../types/agent'
import {
  fetchAvailableLocations,
  __resetCommunitiesCacheForTests,
  FALLBACK_COMMUNITIES,
} from '../../services/api'

describe('chat greeting', () => {
  it('welcomes guests with the friendly natural greeting', () => {
    expect(INITIAL_GREETING_MESSAGE.sender).toBe('agent')
    expect(INITIAL_GREETING_MESSAGE.text).toBe(
      'Hi! Welcome to LYKA Realty. How can I help you find your dream home today?'
    )
  })

  it('never greets with a previous username', () => {
    expect(INITIAL_GREETING_MESSAGE.text).not.toMatch(/bruno/i)
    expect(INITIAL_GREETING_MESSAGE.text).not.toMatch(/welcome back/i)
  })
})

describe('fetchAvailableLocations (dataset-driven chips)', () => {
  beforeEach(() => {
    __resetCommunitiesCacheForTests()
    vi.unstubAllGlobals()
  })

  it('returns real communities from the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          communities: [
            { location: 'Dubai Marina', listings: 132 },
            { location: 'Dubai Silicon Oasis', listings: 154 },
          ],
        }),
      }))
    )
    const locs = await fetchAvailableLocations()
    expect(locs).toEqual(['Dubai Marina', 'Dubai Silicon Oasis'])
  })

  it('fetches once for repeated opens (cached, single inflight)', async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ communities: [{ location: 'Mirdif', listings: 151 }] }),
    }))
    vi.stubGlobal('fetch', spy)
    const [a, b] = await Promise.all([fetchAvailableLocations(), fetchAvailableLocations()])
    expect(a).toEqual(['Mirdif'])
    expect(b).toEqual(['Mirdif'])
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('falls back to real names when the backend is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )
    const locs = await fetchAvailableLocations()
    expect(locs).toEqual(FALLBACK_COMMUNITIES)
    expect(locs).toContain('Dubai Marina')
  })
})
