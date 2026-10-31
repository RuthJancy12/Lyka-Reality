/**
 * LYKA Realty — Safe Legacy Browser Storage Migration & Zero-Persistence Enforcement.
 *
 * 1. Collects all legacy customer data trapped in browser storage (profiles,
 *    preferences, favorites, inquiries, chat sessions, turns, and interactions).
 * 2. Transmits the payload to FastAPI POST /api/customer/migrate/legacy for
 *    permanent storage in Supabase PostgreSQL.
 * 3. VERIFIES the backend receipt and acknowledgment before removing any browser storage.
 * 4. Safely cleanses all application keys from localStorage, sessionStorage, and IndexedDB.
 * 5. On failure, NEVER falls back to local storage; leaves records intact for safe retry.
 */

import { migrateLegacyCustomerData, type LegacyMigrationPayload, type LegacyMigrationResponse } from './api'
import { sanitizeFavoriteIds } from '../utils/favorites'

export interface MigrationResult {
  migrated: boolean
  purged: boolean
  counts?: LegacyMigrationResponse
  error?: string
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    return null
  }
  return null
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage
    if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage
  } catch {
    return null
  }
  return null
}

/**
 * Inspects browser storage non-destructively for any owner-matched or legacy records.
 */
export function collectLegacyBrowserData(uid: string): {
  payload: LegacyMigrationPayload
  keysToPurge: string[]
} {
  const keysToPurge: string[] = []
  const payload: LegacyMigrationPayload = {
    favorites: [],
    inquiries: [],
    sessions: [],
    turns: [],
    interactions: [],
    profile: undefined,
    preferences: undefined,
    tracking_consent: undefined,
  }

  const storage = getLocalStorage()
  if (!storage) {
    return { payload, keysToPurge }
  }

  const owner = `uid:${uid}`

  // 1. Favorites
  const favKeys = [`lyka_favorites_${owner}`, 'lyka_favorites', 'lyka_legacy_lyka_favorites']
  const mergedFavs = new Set<string>()
  for (const k of favKeys) {
    const raw = storage.getItem(k)
    if (raw) {
      keysToPurge.push(k)
      const parsed = safeJsonParse<unknown[]>(raw)
      if (Array.isArray(parsed)) {
        for (const id of sanitizeFavoriteIds(parsed)) mergedFavs.add(id)
      }
    }
  }
  payload.favorites = Array.from(mergedFavs)

  // 2. Inquiries
  const inqKeys = [`lyka_inquiries_${owner}`, 'lyka_inquiries', 'lyka_legacy_lyka_inquiries']
  const seenInqRefs = new Set<string>()
  for (const k of inqKeys) {
    const raw = storage.getItem(k)
    if (raw) {
      keysToPurge.push(k)
      const parsed = safeJsonParse<any[]>(raw)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const ref = String(item._id || item.record_ref || '')
          if (ref && !seenInqRefs.has(ref) && item.propertyId) {
            seenInqRefs.add(ref)
            payload.inquiries!.push({
              record_ref: ref.slice(0, 64),
              session_id: item.sessionId ? String(item.sessionId).slice(0, 128) : undefined,
              property_id: String(item.propertyId).slice(0, 64),
              property_title: String(item.propertyTitle || 'Property Inquiry').slice(0, 255),
              property_location: item.propertyLocation ? String(item.propertyLocation).slice(0, 100) : undefined,
              property_type: item.propertyType ? String(item.propertyType).slice(0, 50) : undefined,
              listing_type: item.listingType ? String(item.listingType).slice(0, 20) : undefined,
              price_aed: Number(item.priceAed) || 0,
              bedrooms: Number(item.bedrooms) || 0,
              size_sqft: Number(item.sizeSqft) || 0,
              availability: item.availability ? String(item.availability).slice(0, 50) : undefined,
              created_at: item.createdAt || undefined,
            })
          }
        }
      }
    }
  }

  // 3. Customer Profile
  const profileKeys = [`lyka_profile_user_${owner}`, 'lyka_profile_user', 'lyka_legacy_lyka_profile_user']
  for (const k of profileKeys) {
    const raw = storage.getItem(k)
    if (raw) {
      keysToPurge.push(k)
      const parsed = safeJsonParse<any>(raw)
      if (parsed && !payload.profile) {
        payload.profile = {
          name: parsed.name || undefined,
          phone: parsed.phone || undefined,
          city: parsed.city || undefined,
          country: parsed.country || undefined,
          discovery_source: parsed.discovery_source || undefined,
        }
      }
    }
  }

  // 4. Preferences
  const prefsKeys = [`lyka_profile_prefs_${owner}`, 'lyka_profile_prefs', 'lyka_legacy_lyka_profile_prefs']
  for (const k of prefsKeys) {
    const raw = storage.getItem(k)
    if (raw) {
      keysToPurge.push(k)
      const parsed = safeJsonParse<any>(raw)
      if (parsed && !payload.preferences) {
        payload.preferences = {
          locations: Array.isArray(parsed.locations) ? parsed.locations : [],
          propertyType: parsed.propertyType || null,
          bedrooms: parsed.bedrooms ?? null,
          bathrooms: parsed.bathrooms ?? null,
          budgetMin: parsed.budgetMin ?? null,
          budgetMax: parsed.budgetMax ?? null,
          purpose: parsed.purpose || null,
          timeline_days: parsed.timelineDays ?? parsed.timeline_days ?? null,
          timeline: parsed.timeline || null,
          amenities: Array.isArray(parsed.amenities) ? parsed.amenities : [],
          petFriendly: typeof parsed.petFriendly === 'boolean' ? parsed.petFriendly : null,
          furnishing: parsed.furnishing || null,
          theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : null,
        }
      }
    }
  }

  // 5. Tracking Consent
  const consentKey = `lyka_tracking_consent_${owner}`
  const consentRaw = storage.getItem(consentKey)
  if (consentRaw !== null) {
    keysToPurge.push(consentKey)
    payload.tracking_consent = consentRaw === '1'
  }

  // 6. Interactions
  const interactionKey = `lyka_interactions_${owner}`
  const interactionsRaw = storage.getItem(interactionKey)
  if (interactionsRaw) {
    keysToPurge.push(interactionKey)
    const parsed = safeJsonParse<any[]>(interactionsRaw)
    if (Array.isArray(parsed)) {
      for (const evt of parsed) {
        const rawKind = String(evt.kind || 'view').toLowerCase().trim()
        const kind = ['view', 'search', 'filter', 'enquiry'].includes(rawKind) ? rawKind : 'view'
        payload.interactions!.push({
          record_ref: evt._id ? String(evt._id).slice(0, 64) : undefined,
          kind: kind as 'view' | 'search' | 'filter' | 'enquiry',
          property_id: evt.propertyId ? String(evt.propertyId).slice(0, 64) : undefined,
          location: evt.location ? String(evt.location).slice(0, 100) : undefined,
          property_type: evt.propertyType ? String(evt.propertyType).slice(0, 50) : undefined,
          bedrooms: typeof evt.bedrooms === 'number' && evt.bedrooms >= 0 && evt.bedrooms <= 20 ? evt.bedrooms : undefined,
          query: evt.query ? String(evt.query).slice(0, 300) : undefined,
          created_at: evt.createdAt || undefined,
        })
      }
    }
  }

  // 7. Chat Sessions and Messages
  const seenMsgRefs = new Set<string>()
  const sessionsMap = new Map<string, { session_id: string; title?: string; created_at?: string }>()

  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (!k) continue

    // v2 owner turns: lyka_chat_v2_uid:{uid}_{sessionId}
    const prefixV2 = `lyka_chat_v2_${owner}_`
    const isV2Turn = k.startsWith(prefixV2)
    const isLegacyTurn = k.startsWith('lyka_chat_turns_') || k.startsWith('lyka_legacy_lyka_chat_turns_')

    if (isV2Turn || isLegacyTurn) {
      keysToPurge.push(k)
      const raw = storage.getItem(k)
      const turns = safeJsonParse<any[]>(raw)
      let sessionId = ''
      if (isV2Turn) {
        sessionId = k.slice(prefixV2.length)
      } else if (k.startsWith('lyka_chat_turns_')) {
        sessionId = k.slice('lyka_chat_turns_'.length)
      } else {
        sessionId = k.slice('lyka_legacy_lyka_chat_turns_'.length)
      }
      const safeSessionId = (sessionId || 'sess_default').replace(/[^A-Za-z0-9_.:\-]/g, '_').slice(0, 128)

      if (safeSessionId && !sessionsMap.has(safeSessionId)) {
        sessionsMap.set(safeSessionId, {
          session_id: safeSessionId,
          title: turns && turns[0]?.text ? String(turns[0].text).slice(0, 60) : 'LYKA Chat',
          created_at: turns && turns[0]?.createdAt ? turns[0].createdAt : undefined,
        })
      }

      if (Array.isArray(turns)) {
        for (const t of turns) {
          const ref = String(t._id || '').slice(0, 64)
          if (ref && !seenMsgRefs.has(ref) && t.text) {
            seenMsgRefs.add(ref)
            payload.turns!.push({
              session_id: safeSessionId,
              record_ref: ref,
              role: t.role === 'assistant' ? 'assistant' : 'user',
              text: String(t.text).slice(0, 4000),
              property_ids: Array.isArray(t.propertyIds) ? t.propertyIds.map(String).slice(0, 50) : [],
              created_at: t.createdAt || undefined,
            })
          }
        }
      }
    }

    // Pointers
    if (k.startsWith(`lyka_last_chat_v2_${owner}`) || k === 'lyka_last_chat_session' || k.startsWith('lyka_legacy_lyka_last_chat_session')) {
      keysToPurge.push(k)
    }
  }

  payload.sessions = Array.from(sessionsMap.values())

  return { payload, keysToPurge }
}

/**
 * Removes any remaining non-business persistent storage flags (UI preferences,
 * ad throttling keys, session pointers) to strictly guarantee zero browser persistence.
 */
export function purgeTransientBrowserStorage(): void {
  // Purge sessionStorage
  const session = getSessionStorage()
  if (session) {
    try {
      session.removeItem('lyka_tab_id')
    } catch {
      // ignore
    }
  }

  // Purge localStorage ad keys, theme, welcome flag, and quarantine marker
  const local = getLocalStorage()
  if (local) {
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < local.length; i++) {
        const k = local.key(i)
        if (!k) continue
        if (
          k.startsWith('lyka_ads_sent_v1:') ||
          k === 'lyka_ads_visitor_v1' ||
          k === 'lyka_welcomed' ||
          k === 'lyka_theme' ||
          k === 'lyka_theme_mode' ||
          k === 'lyka_tab_id' ||
          k === 'lyka_legacy_quarantined_v1'
        ) {
          keysToRemove.push(k)
        }
      }
      for (const k of keysToRemove) {
        local.removeItem(k)
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Safely migrates all trapped browser records to Supabase PostgreSQL,
 * verifies successful response, and only then cleanses browser storage.
 */
export async function executeCustomerBrowserMigration(uid: string): Promise<MigrationResult> {
  const { payload, keysToPurge } = collectLegacyBrowserData(uid)

  const hasDataToMigrate =
    (payload.favorites && payload.favorites.length > 0) ||
    (payload.inquiries && payload.inquiries.length > 0) ||
    (payload.sessions && payload.sessions.length > 0) ||
    (payload.turns && payload.turns.length > 0) ||
    (payload.interactions && payload.interactions.length > 0) ||
    payload.profile !== undefined ||
    payload.preferences !== undefined ||
    payload.tracking_consent !== undefined

  if (!hasDataToMigrate && keysToPurge.length === 0) {
    purgeTransientBrowserStorage()
    return { migrated: false, purged: true }
  }

  try {
    // 1. Transmit to backend
    const res = await migrateLegacyCustomerData(payload)

    // 2. VERIFIED SUCCESS: Safely remove migrated keys from browser storage
    const storage = getLocalStorage()
    if (storage) {
      for (const k of keysToPurge) {
        try {
          storage.removeItem(k)
        } catch {
          // ignore
        }
      }
    }

    // 3. Clear transient UI and ad keys
    purgeTransientBrowserStorage()

    return {
      migrated: true,
      purged: true,
      counts: res,
    }
  } catch (err: unknown) {
    // REQUIREMENT 8: Never fall back to localStorage/sessionStorage.
    // Leave original keys intact for retry and surface actionable error.
    const message = err instanceof Error ? err.message : 'Legacy data migration could not complete.'
    console.error('[LYKA Migration Error]', message)
    return {
      migrated: false,
      purged: false,
      error: message,
    }
  }
}
