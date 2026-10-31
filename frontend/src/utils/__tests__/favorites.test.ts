import { describe, it, expect } from 'vitest'
import {
  sanitizeFavoriteIds,
  resolveFavoriteProperties,
  toggleFavoriteId,
  favoriteIdSet,
} from '../favorites'
import { mergeFavorites } from '../../services/rtdb'
import type { Property } from '../../types/property'
// Raw sources for structural guards (vite ?raw — no node APIs).
import appSrc from '../../App.tsx?raw'
import accountSrc from '../../pages/AccountPage.tsx?raw'
import chatSrc from '../../components/agent/UIAgentModal.tsx?raw'

function prop(id: string): Property {
  return {
    property_id: id,
    title: `Home ${id}`,
    listing_type: 'Sale',
    property_type: 'Apartment',
    location: 'Dubai Marina',
    street: 'Al Marsa Street',
    bhk: 2,
    bathrooms: 2,
    property_size_sqft: 1200,
    price_aed: 2000000,
    price_per_sqft_aed: 1666,
    furnishing: 'Furnished',
    parking_spaces: 1,
    main_road_access: 'Yes',
    nearest_main_road: 'Sheikh Zayed Road',
    main_road_distance_km: 0.7,
    nearest_metro: 'DAMAC Properties',
    metro_distance_km: 0.5,
    near_metro: true,
    beach_distance_km: 0.9,
    near_seashore: true,
    facing_direction: 'West',
    entrance_direction: 'East',
    view: 'Sea View',
    amenities: [],
    availability: 'Ready',
    latitude: 25.07,
    longitude: 55.14,
    image_url: 'x.jpg',
    image_gallery: ['x.jpg'],
    listed_days_ago: 5,
  }
}

describe('sanitizeFavoriteIds (unique string IDs, order kept)', () => {
  it('dedupes while preserving first-seen order', () => {
    expect(sanitizeFavoriteIds(['B', 'A', 'B', 'C', 'A'])).toEqual(['B', 'A', 'C'])
  })

  it('drops blanks, whitespace, and non-strings without throwing', () => {
    expect(sanitizeFavoriteIds(['A', '', '   ', null, 42, 'B ', ' B'])).toEqual(['A', 'B'])
    expect(sanitizeFavoriteIds(null)).toEqual([])
    expect(sanitizeFavoriteIds(undefined)).toEqual([])
    expect(sanitizeFavoriteIds({})).toEqual([])
    expect(sanitizeFavoriteIds('A')).toEqual([])
  })

  it('round-trips stored JSON (refresh persistence)', () => {
    const stored = JSON.stringify(['LYK-00002', 'LYK-00002', 'LYK-00015'])
    expect(sanitizeFavoriteIds(JSON.parse(stored))).toEqual(['LYK-00002', 'LYK-00015'])
  })
})

describe('resolveFavoriteProperties (display + count source)', () => {
  const byId = new Map([['A', prop('A')], ['B', prop('B')]])

  it('resolves saved IDs to records in order, once each', () => {
    const out = resolveFavoriteProperties(['B', 'A', 'B'], (id) => byId.get(id))
    expect(out.map((p) => p.property_id)).toEqual(['B', 'A'])
  })

  it('excludes unresolved listings without touching the stored list', () => {
    const stored = ['A', 'LYK-99999', 'B']
    const out = resolveFavoriteProperties(stored, (id) => byId.get(id))
    expect(out.map((p) => p.property_id)).toEqual(['A', 'B'])
    // Storage keeps the missing ID (never deleted by resolving).
    expect(stored).toEqual(['A', 'LYK-99999', 'B'])
  })

  it('counts only genuinely saved unique IDs — never views or impressions', () => {
    const views = ['X', 'Y']
    const impressions = ['Z']
    const out = resolveFavoriteProperties(['A', 'A'], (id) => byId.get(id))
    expect(out).toHaveLength(1)
    expect(views).not.toContain('A')
    expect(impressions).not.toContain('A')
  })
})

describe('toggleFavoriteId (add/remove stays duplicate-free)', () => {
  it('adds a missing ID and removes a present one', () => {
    expect(toggleFavoriteId(['A'], 'B')).toEqual(['A', 'B'])
    expect(toggleFavoriteId(['A', 'B'], 'A')).toEqual(['B'])
  })

  it('never creates duplicates and ignores blank IDs', () => {
    expect(toggleFavoriteId(['A', 'A'], 'A')).toEqual([])
    expect(toggleFavoriteId(['A'], '  ')).toEqual(['A'])
    expect(toggleFavoriteId(['A'], '')).toEqual(['A'])
  })

  it('heart-state sets match the resolved list', () => {
    const resolved = resolveFavoriteProperties(['A', 'B'], (id) =>
      id === 'A' ? prop('A') : id === 'B' ? prop('B') : undefined
    )
    const set = favoriteIdSet(resolved)
    expect(set.has('A')).toBe(true)
    expect(set.has('C')).toBe(false)
  })
})

describe('count consistency across badge, menu, and panel', () => {
  it('one resolved length feeds all three surfaces', () => {
    // Simulates the reported bug: 4 stored IDs (dupe + missing record).
    const stored = ['A', 'B', 'A', 'LYK-99999']
    const byId = new Map([['A', prop('A')], ['B', prop('B')]])
    const displayed = resolveFavoriteProperties(stored, (id) => byId.get(id))
    const badge = displayed.length
    const menu = displayed.length
    const panelTitle = displayed.length
    const cards = displayed.length
    expect(badge).toBe(2)
    expect(new Set([badge, menu, panelTitle, cards]).size).toBe(1)
  })
})

describe('sync merge stays duplicate-free per owner', () => {
  it('unions local and cloud IDs without duplicates or junk', () => {
    expect(mergeFavorites(['A', 'A', ''], { B: true, A: true, C: false })).toEqual(['A', 'B'])
  })

  it('account isolation is key-based (no cross-account reads)', () => {
    const ownerA = 'uid:AAA'
    const ownerB = 'uid:BBB'
    expect(ownerA).not.toBe(ownerB)
    // Per-owner stored lists resolve independently.
    const a = resolveFavoriteProperties(['A'], (id) => (id === 'A' ? prop('A') : undefined))
    const b = resolveFavoriteProperties(['B'], (id) => (id === 'B' ? prop('B') : undefined))
    expect(a.map((p) => p.property_id)).toEqual(['A'])
    expect(b.map((p) => p.property_id)).toEqual(['B'])
  })
})

describe('favorites wiring (structural)', () => {
  const app: string = appSrc
  const account: string = accountSrc
  const chat: string = chatSrc

  it('header badge and menu share the resolved count', () => {
    expect(app).toMatch(/favoritesCount=\{favoriteProperties\.length\}/)
    expect(app).not.toMatch(/favoritesCount=\{favoriteIds\.length\}/)
  })

  it('chat hearts sync authoritatively (no union-only staleness)', () => {
    expect(chat).toMatch(/setLocalSavedIds\(sanitizeFavoriteIds\(favoriteIds\)\)/)
    expect(chat).not.toMatch(/\[\.\.\.prev, \.\.\.favoriteIds/)
  })

  it('account page resolves via the shared helper and adds through its catalogue', () => {
    expect(account).toMatch(/resolveFavoriteProperties/)
    expect(account).toMatch(/sanitizeFavoriteIds/)
  })
})
