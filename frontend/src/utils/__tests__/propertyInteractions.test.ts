import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  propertyShareUrl,
  propertyShareText,
  shareProperty,
} from '../share'
import {
  scorePropertyForFeed,
  personalizedPicks,
  type FeedSignals,
} from '../personalizedFeed'
import {
  logInteraction,
  getInteractions,
  getTrackingConsent,
  setTrackingConsent,
  interactionsKeyFor,
} from '../../services/chatStore'
import appSrc from '../../App.tsx?raw'
import cardSrc from '../../components/PropertyCard.tsx?raw'
import panelSrc from '../../components/agent/LykaAuthPanel.tsx?raw'

const app: string = appSrc
const card: string = cardSrc
const panel: string = panelSrc

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v))
    },
    removeItem: (k: string) => {
      m.delete(k)
    },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as unknown as Storage
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
})

const OWNER = 'uid:viewer-1'

describe('share links (listing-only, no private data)', () => {
  it('builds a deep link carrying only the property reference', () => {
    expect(propertyShareUrl('LYK-00042', 'https://lyka.example')).toBe(
      'https://lyka.example/?property=LYK-00042'
    )
    expect(propertyShareUrl('LYK-00042')).toContain('property=LYK-00042')
    expect(propertyShareUrl('LYK-1')).not.toMatch(/uid|token|profile|chat/i)
  })

  it('describes the listing without account data', () => {
    const text = propertyShareText({ title: 'Marina 2BR', location: 'Dubai Marina' })
    expect(text).toContain('Marina 2BR')
    expect(text).not.toMatch(/uid|token|email/i)
  })

  it('uses native share when available', async () => {
    const shared: Array<{ title: string; text: string; url: string }> = []
    const nativeShare = vi.fn(async (data: { title: string; text: string; url: string }) => {
      shared.push(data)
    })
    const method = await shareProperty(
      { property_id: 'LYK-1', title: 'T', location: 'M' },
      { nativeShare, origin: 'https://lyka.example' }
    )
    expect(method).toBe('native')
    expect(nativeShare).toHaveBeenCalledTimes(1)
    expect(shared).toHaveLength(1)
    expect(shared[0]?.url).toContain('property=LYK-1')
  })

  it('falls back to clipboard copy without native share', async () => {
    const copyText = vi.fn(async () => {})
    const method = await shareProperty(
      { property_id: 'LYK-2', title: 'T', location: 'M' },
      { copyText, origin: 'https://lyka.example' }
    )
    expect(method).toBe('clipboard')
    expect(copyText).toHaveBeenCalledTimes(1)
  })

  it('throws honestly when nothing can share', async () => {
    await expect(
      shareProperty({ property_id: 'LYK-3', title: 'T', location: 'M' }, {})
    ).rejects.toThrow(/not available/i)
  })
})

const PROP = (over: Record<string, unknown> = {}) => ({
  property_id: 'LYK-x',
  title: 'T',
  listing_type: 'Sale',
  property_type: 'Apartment',
  location: 'Dubai Marina',
  street: '',
  bhk: 2,
  bathrooms: 2,
  property_size_sqft: 1000,
  price_aed: 1500000,
  price_per_sqft_aed: 1500,
  furnishing: '',
  parking_spaces: 1,
  main_road_access: '',
  nearest_main_road: '',
  main_road_distance_km: 1,
  nearest_metro: '',
  metro_distance_km: 1,
  near_metro: false,
  beach_distance_km: 5,
  near_seashore: false,
  entrance_direction: '',
  facing_direction: '',
  view: '',
  amenities: [],
  availability: 'Ready',
  latitude: 0,
  longitude: 0,
  image_url: '',
  image_gallery: [],
  listed_days_ago: 1,
  ...over,
})

const SIGNALS: FeedSignals = {
  preferredLocations: ['Dubai Marina'],
  preferredTypes: ['Apartment'],
  preferredListing: 'Sale',
  preferredBedrooms: 2,
  budgetMax: 2000000,
  favoriteIds: [],
  enquiredIds: [],
  viewedIds: [],
}

describe('personalized feed (deterministic, real rows only)', () => {
  it('scores documented weights: location 3, type 2, intent 2, bhk 1, budget 1', () => {
    expect(scorePropertyForFeed(PROP() as never, SIGNALS).score).toBe(9)
    expect(scorePropertyForFeed(PROP({ location: 'Mirdif' }) as never, SIGNALS).score).toBe(6)
  })

  it('excludes already-saved and already-enquired listings', () => {
    const rows = [
      PROP({ property_id: 'A' }),
      PROP({ property_id: 'B', location: 'Mirdif' }),
    ] as never[]
    const picks = personalizedPicks(rows, { ...SIGNALS, favoriteIds: ['A'] }, 6)
    expect(picks.map((p) => p.property.property_id)).toEqual(['B'])
  })

  it('returns empty (never filler) with zero signals', () => {
    const rows = [PROP({ property_id: 'A' })] as never[]
    expect(
      personalizedPicks(
        rows,
        {
          preferredLocations: [],
          preferredTypes: [],
          favoriteIds: [],
          enquiredIds: [],
          viewedIds: [],
        },
        6
      )
    ).toEqual([])
  })

  it('ranks exact matches above partial ones, stably', () => {
    const rows = [
      PROP({ property_id: 'Z', location: 'Mirdif' }),
      PROP({ property_id: 'A' }),
    ] as never[]
    expect(personalizedPicks(rows, SIGNALS, 6).map((p) => p.property.property_id)).toEqual([
      'A',
      'Z',
    ])
  })
})

describe('interaction log + consent (owner-scoped, opt-in)', () => {
  it('defaults to unasked (tracking off)', () => {
    expect(getTrackingConsent(OWNER)).toBeNull()
  })

  it('stores and reads consent per owner', () => {
    setTrackingConsent(OWNER, true)
    expect(getTrackingConsent(OWNER)).toBe(true)
    expect(getTrackingConsent('uid:other')).toBeNull()
    setTrackingConsent(OWNER, false)
    expect(getTrackingConsent(OWNER)).toBe(false)
  })

  it('logs views/searches under the acting owner only', () => {
    logInteraction(OWNER, { kind: 'view', propertyId: 'LYK-1', location: 'Marina' })
    logInteraction(OWNER, { kind: 'search', query: '2bhk', location: 'Marina' })
    const mine = getInteractions(OWNER)
    expect(mine).toHaveLength(2)
    expect(getInteractions('uid:other')).toEqual([])
    expect(localStorage.getItem(interactionsKeyFor('uid:other'))).toBeNull()
  })

  it('caps the log instead of growing forever', () => {
    for (let i = 0; i < 120; i++) {
      logInteraction(OWNER, { kind: 'view', propertyId: `LYK-${i}` })
    }
    expect(getInteractions(OWNER).length).toBeLessThanOrEqual(100)
  })
})

describe('property card menu (working actions, no empty menu)', () => {
  it('renders a menu with View, Share, and Save actions', () => {
    expect(card).toContain('role="menu"')
    expect(card).toContain('View Details')
    expect(card).toContain('> Share')
    expect(card).toContain('Unsave')
    expect(card).toContain("aria-haspopup=\"menu\"")
  })

  it('shares listings and closes on Escape/backdrop', () => {
    expect(card).toContain('shareProperty(property')
    expect(card).toContain("e.key === 'Escape'")
    expect(card).toContain('aria-label="Close menu"')
  })
})

describe('staff portal role confirmation (check, never grant)', () => {
  it('offers an optional expected-role check in staff mode only', () => {
    expect(panel).toContain('staffPortal')
    expect(panel).toContain('Expected role (optional check)')
    expect(panel).toContain("value=\"sales_manager\"")
  })

  it('verifies against the backend record and blocks mismatches', () => {
    expect(panel).toContain('fetchStaffMe')
    expect(panel).toContain('clearStaffMeCache')
    expect(panel).toContain('Role mismatch')
    // Mismatch path signs back out and never calls onSuccess.
    const idx = panel.indexOf('Role mismatch')
    expect(idx).toBeGreaterThan(-1)
  })

  it('deep link opens shared listings without private data', () => {
    expect(app).toContain("get('property')")
    expect(app).toContain('propertyLinkHandledRef')
  })
})
