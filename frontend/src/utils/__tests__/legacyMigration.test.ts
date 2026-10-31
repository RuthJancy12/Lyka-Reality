import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  collectLegacyBrowserData,
  purgeTransientBrowserStorage,
  executeCustomerBrowserMigration,
} from '../../services/legacyMigration'
import * as api from '../../services/api'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  } as unknown as Storage
}

describe('Legacy Browser Storage Migration', () => {
  const uid = 'usr_test_mig_123'
  const owner = `uid:${uid}`

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.stubGlobal('sessionStorage', createMemoryStorage())
    vi.restoreAllMocks()
  })

  it('collects all categories of trapped customer data from browser storage', () => {
    // Seed localStorage with legacy keys
    localStorage.setItem(`lyka_favorites_${owner}`, JSON.stringify(['LYK-00001', 'LYK-00002']))
    localStorage.setItem(
      `lyka_inquiries_${owner}`,
      JSON.stringify([
        {
          _id: 'inq_01',
          sessionId: 'sess_1',
          propertyId: 'LYK-00001',
          propertyTitle: 'Marina Heights',
          priceAed: 1800000,
          status: 'Submitted',
        },
      ])
    )
    localStorage.setItem(
      `lyka_profile_user_${owner}`,
      JSON.stringify({
        name: 'Rashid Khan',
        phone: '+971500000001',
        city: 'Dubai',
      })
    )
    localStorage.setItem(
      `lyka_profile_prefs_${owner}`,
      JSON.stringify({
        locations: ['Dubai Marina'],
        bedrooms: 2,
        purpose: 'Buy',
        theme: 'dark',
      })
    )
    localStorage.setItem(`lyka_tracking_consent_${owner}`, '1')
    localStorage.setItem(
      `lyka_interactions_${owner}`,
      JSON.stringify([
        {
          _id: 'evt_01',
          kind: 'view',
          propertyId: 'LYK-00001',
        },
      ])
    )
    localStorage.setItem(
      `lyka_chat_v2_${owner}_sess_1`,
      JSON.stringify([
        {
          _id: 'msg_01',
          role: 'user',
          text: 'Looking for 2BHK in Marina',
          propertyIds: [],
        },
      ])
    )

    const { payload, keysToPurge } = collectLegacyBrowserData(uid)

    expect(payload.favorites).toEqual(['LYK-00001', 'LYK-00002'])
    expect(payload.inquiries).toHaveLength(1)
    expect(payload.inquiries![0].property_id).toBe('LYK-00001')
    expect(payload.profile?.name).toBe('Rashid Khan')
    expect(payload.preferences?.theme).toBe('dark')
    expect(payload.preferences?.locations).toEqual(['Dubai Marina'])
    expect(payload.tracking_consent).toBe(true)
    expect(payload.interactions).toHaveLength(1)
    expect(payload.sessions).toHaveLength(1)
    expect(payload.sessions![0].session_id).toBe('sess_1')
    expect(payload.turns).toHaveLength(1)
    expect(payload.turns![0].record_ref).toBe('msg_01')

    expect(keysToPurge.length).toBeGreaterThanOrEqual(6)
  })

  it('purges transient non-business storage flags', () => {
    localStorage.setItem('lyka_welcomed', '1')
    localStorage.setItem('lyka_theme', 'dark')
    localStorage.setItem('lyka_theme_mode', 'dark')
    localStorage.setItem('lyka_ads_sent_v1:impression:LYK-01:2026-10-31', '1')
    localStorage.setItem('lyka_ads_visitor_v1', 'vis-123')
    localStorage.setItem('lyka_legacy_quarantined_v1', '2026-10-31')
    sessionStorage.setItem('lyka_tab_id', 'tab-123')

    purgeTransientBrowserStorage()

    expect(localStorage.getItem('lyka_welcomed')).toBeNull()
    expect(localStorage.getItem('lyka_theme')).toBeNull()
    expect(localStorage.getItem('lyka_theme_mode')).toBeNull()
    expect(localStorage.getItem('lyka_ads_sent_v1:impression:LYK-01:2026-10-31')).toBeNull()
    expect(localStorage.getItem('lyka_ads_visitor_v1')).toBeNull()
    expect(localStorage.getItem('lyka_legacy_quarantined_v1')).toBeNull()
    expect(sessionStorage.getItem('lyka_tab_id')).toBeNull()
  })

  it('safely purges browser data ONLY AFTER successful backend verification', async () => {
    localStorage.setItem(`lyka_favorites_${owner}`, JSON.stringify(['LYK-00001']))

    vi.spyOn(api, 'migrateLegacyCustomerData').mockResolvedValue({
      migrated: true,
      favorites: 1,
      inquiries: 0,
      sessions: 0,
      turns: 0,
      interactions: 0,
    })

    const result = await executeCustomerBrowserMigration(uid)

    expect(result.migrated).toBe(true)
    expect(result.purged).toBe(true)
    // Storage must now be cleaned
    expect(localStorage.getItem(`lyka_favorites_${owner}`)).toBeNull()
  })

  it('preserves browser data and reports error if backend migration fails (no data loss)', async () => {
    localStorage.setItem(`lyka_favorites_${owner}`, JSON.stringify(['LYK-00001']))

    vi.spyOn(api, 'migrateLegacyCustomerData').mockRejectedValue(new Error('Network error (HTTP 500)'))

    const result = await executeCustomerBrowserMigration(uid)

    expect(result.migrated).toBe(false)
    expect(result.purged).toBe(false)
    expect(result.error).toContain('Network error')
    // Crucial: original browser data is kept intact for retry
    expect(localStorage.getItem(`lyka_favorites_${owner}`)).not.toBeNull()
  })
})

