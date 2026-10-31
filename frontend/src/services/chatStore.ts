/**
 * LYKA AI — conversation & profile store (Firebase Realtime Database + cache).
 *
 * ---------------------------------------------------------------------------
 * STATUS: Firebase RTDB connected (see services/rtdb.ts + database.rules.json).
 * Every write below is kept in memory (instant UI, zero browser-storage persistence)
 * and mirrors to RTDB when a signed-in uid is set via setChatCloudUid().
 * Signed-out guests use the on-device cache only. On sign-in, rtdb.syncOnLogin
 * unions cloud and cache both ways so nothing is lost.
 * ---------------------------------------------------------------------------
 *
 * RTDB layout (users/{uid}/...): profile, prefs, favorites, inquiries,
 * conversations, turns. Shapes stay { _id, schemaVersion, ISO dates }.
 */

import {
  cloudSaveProfile, cloudSavePrefs, cloudSaveInquiry, cloudUpdateInquiry,
  cloudLogTurn
} from './rtdb'
export const MONGO_READY = false
export const FIREBASE_DB_READY = true
export const SCHEMA_VERSION = 1

/** Firebase uid to mirror writes to, or null for local-only (guest) mode. */
let cloudUid: string | null = null

export function setChatCloudUid(uid: string | null): void {
  cloudUid = uid || null
}

function mirror(promise: Promise<unknown> | undefined): void {
  try {
    void Promise.resolve(promise).catch(() => {})
  } catch {
    // Ignore — cloud failures must never break local flows.
  }
}

function newId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}_${crypto.randomUUID()}`
    }
  } catch {
    // fall through
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

/* ---------------- MongoDB-compatible document shapes ---------------- */

export interface UserDoc {
  _id: string
  schemaVersion: number
  name: string
  email: string
  phone?: string
  /** Customer city/community (optional, editable in Account). */
  city?: string
  /** Customer country (optional, self-reported, editable in Account). */
  country?: string
  /** Self-reported "How did you hear about LYKA Realty?" (optional). */
  discovery_source?: string
  createdAt: string
  updatedAt: string
}

export interface PreferencesDoc {
  _id: string
  schemaVersion: number
  /** MongoDB ObjectId string of the owning user (once backend exists). */
  userId: string | null
  locations: string[]
  budgetMin: number | null
  budgetMax: number | null
  propertyType: 'Apartment' | 'Villa' | 'Townhouse' | 'Penthouse' | null
  bedrooms: number | null
  purpose: 'Buy' | 'Rent' | 'Invest' | null
  /** Expected buying/renting timeline in days (null = not stated). */
  timelineDays: number | null
  /** True when the user pressed "Skip for now". */
  skipped: boolean
  updatedAt: string
}

export interface ConversationDoc {
  _id: string
  schemaVersion: number
  userId: string | null
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface MessageDoc {
  _id: string
  schemaVersion: number
  conversationId: string
  role: 'user' | 'assistant'
  text: string
  /** Property IDs shown with this turn (no fabricated details stored). */
  propertyIds: string[]
  createdAt: string
}

export type InquiryStatus = 'Submitted' | 'Contacted' | 'Withdrawn'

export interface InquiryDoc {
  _id: string
  schemaVersion: number
  /** MongoDB ObjectId string of the owning user (once backend exists). */
  userId: string | null
  sessionId: string
  /** Snapshot of real property fields at inquiry time — never fabricated. */
  propertyId: string
  propertyTitle: string
  propertyLocation: string
  propertyType: string
  listingType: string
  priceAed: number
  bedrooms: number
  sizeSqft: number
  availability: string
  status: InquiryStatus
  createdAt: string
  updatedAt: string
}

/* ---------------- In-memory preview adapter (zero browser storage) ---------------- */

/* ---------------------------------------------------------------------------
 * OWNER ISOLATION (chat-privacy hardening).
 *
 * Every cache key below is namespaced by owner so one browser can never
 * show User A's conversation to User B:
 *   owner = `uid:{firebaseUid}` for signed-in users,
 *           `guest:{per-tab id}` for signed-out guests.
 * Guest ids live in memory: scoped per tab/session with zero browser persistence
 * across reloads, but a new tab — or another person — starts clean.
 * Reads/writes ALWAYS take the owner; there is no global fallback.
 *
 * Legacy pre-isolation keys (`lyka_chat_turns_*`, `lyka_last_chat_session`,
 * `lyka_inquiries`, `lyka_favorites`, `lyka_profile_user`,
 * `lyka_profile_prefs`) are NEVER read by the code below. The one-time
 * `quarantineLegacyChatData()` move renames them under `lyka_legacy_*`
 * (values intact, never deleted, never uploaded, never displayed).
 * ------------------------------------------------------------------------- */

const KEYS = {
  user: 'lyka_profile_user',
  prefs: 'lyka_profile_prefs',
  inquiries: 'lyka_inquiries',
  favorites: 'lyka_favorites',
  lastSession: 'lyka_last_chat_session',
  turnsPrefix: 'lyka_chat_turns_'
} as const

const V2_TURNS_PREFIX = 'lyka_chat_v2_'
const V2_LAST_PREFIX = 'lyka_last_chat_v2_'
const QUARANTINE_FLAG = 'lyka_legacy_quarantined_v1'
const LEGACY_PREFIX = 'lyka_legacy_'

/** In-memory store for fast UI responses during the session (zero browser-storage persistence). */
const memoryStore = new Map<string, string>()
let memoryTabId: string | null = null

/** Reset in-memory store (used for test isolation). */
export function _resetMemoryStoreForTesting(): void {
  memoryStore.clear()
  memoryTabId = null
}

/** Stable in-memory tab id for guests (session-scoped, zero browser-storage persistence). */
export function getTabId(): string {
  if (memoryTabId) return memoryTabId
  memoryTabId = newId('tab')
  return memoryTabId
}

/**
 * Owner namespace for all cache reads/writes. Pass the Firebase UID when
 * signed in, null/undefined for guests. Guests are scoped to the current
 * tab so two people (or two tabs) never share a conversation.
 */
export function ownerKeyFor(firebaseUid: string | null | undefined): string {
  if (firebaseUid && String(firebaseUid).trim()) {
    return `uid:${String(firebaseUid).trim()}`
  }
  return `guest:${getTabId()}`
}

export function turnsKeyFor(owner: string, sessionId: string): string {
  return `${V2_TURNS_PREFIX}${owner}_${sessionId}`
}

export function lastSessionKeyFor(owner: string): string {
  return `${V2_LAST_PREFIX}${owner}`
}

export function inquiriesKeyFor(owner: string): string {
  return `${KEYS.inquiries}_${owner}`
}

export function favoritesKeyFor(owner: string): string {
  return `${KEYS.favorites}_${owner}`
}

export function profileKeyFor(owner: string): string {
  return `${KEYS.user}_${owner}`
}

export function prefsKeyFor(owner: string): string {
  return `${KEYS.prefs}_${owner}`
}

/** v2 turn-session ids currently stored for exactly this owner. */
export function ownerSessionIds(owner: string): string[] {
  const ids: string[] = []
  try {
    const prefix = `${V2_TURNS_PREFIX}${owner}_`
    for (const k of memoryStore.keys()) {
      if (k && k.startsWith(prefix)) ids.push(k.slice(prefix.length))
    }
  } catch {
    // Ignore
  }
  return ids
}

/**
 * One-time quarantine of pre-isolation records. Moves legacy keys under
 * `lyka_legacy_*` with values byte-identical (never deleted, never shown,
 * never uploaded). Safe to call repeatedly — runs once via flag.
 */
export function quarantineLegacyChatData(): string[] {
  const moved: string[] = []
  try {
    if (localStorage.getItem(QUARANTINE_FLAG)) return moved
    const renames: Array<[string, string]> = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || k.startsWith(LEGACY_PREFIX) || k === QUARANTINE_FLAG) continue
      if (
        k === KEYS.user || k === KEYS.prefs || k === KEYS.inquiries ||
        k === KEYS.favorites || k === KEYS.lastSession ||
        k.startsWith(KEYS.turnsPrefix)
      ) {
        renames.push([k, `${LEGACY_PREFIX}${k}`])
      }
    }
    for (const [from, to] of renames) {
      const raw = localStorage.getItem(from)
      if (raw !== null && localStorage.getItem(to) === null) {
        localStorage.setItem(to, raw)
      }
      localStorage.removeItem(from)
      moved.push(from)
    }
    localStorage.setItem(QUARANTINE_FLAG, new Date().toISOString())
  } catch {
    // Best-effort only — quarantine must never break the app.
  }
  return moved
}

const MAX_TURNS_PER_SESSION = 100
const MAX_INQUIRIES = 200

function readJson<T>(key: string): T | null {
  try {
    const raw = memoryStore.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    memoryStore.set(key, JSON.stringify(value))
  } catch {
    // In-memory set safety
  }
}

export function getLocalUser(owner: string): UserDoc | null {
  return readJson<UserDoc>(profileKeyFor(owner))
}

export function saveLocalUser(
  input: { name: string; email: string; phone?: string; city?: string; country?: string; discovery_source?: string },
  owner: string
): UserDoc {
  const existing = getLocalUser(owner)
  const doc: UserDoc = {
    _id: existing?._id ?? newId('user'),
    schemaVersion: SCHEMA_VERSION,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim() || undefined,
    city: input.city?.trim() || undefined,
    country: input.country?.trim() || existing?.country,
    discovery_source: input.discovery_source?.trim() || existing?.discovery_source,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso()
  }
  // Drop emptied optional fields instead of storing "".
  if (!doc.country) delete doc.country
  if (!doc.discovery_source) delete doc.discovery_source
  writeJson(profileKeyFor(owner), doc)
  if (cloudUid) mirror(cloudSaveProfile(cloudUid, doc))
  return doc
}

export function clearLocalUser(): void {
  // Identity is Firebase-driven; per-owner caches stay namespaced (safe for
  // the next user) and legacy globals are handled by quarantine, so there
  // is nothing global left to clear. Kept for backward compatibility.
}

export function getLocalPreferences(owner: string): PreferencesDoc | null {
  return readJson<PreferencesDoc>(prefsKeyFor(owner))
}

export function saveLocalPreferences(
  input: Omit<PreferencesDoc, '_id' | 'schemaVersion' | 'updatedAt'>,
  owner: string
): PreferencesDoc {
  const existing = getLocalPreferences(owner)
  const doc: PreferencesDoc = {
    _id: existing?._id ?? newId('prefs'),
    schemaVersion: SCHEMA_VERSION,
    ...input,
    updatedAt: nowIso()
  }
  writeJson(prefsKeyFor(owner), doc)
  if (cloudUid) mirror(cloudSavePrefs(cloudUid, doc))
  return doc
}

/**
 * Fire-and-forget turn logger. Never throws — chat must work even if the
 * store fails. Writes the OWNER's cache first, mirrors to RTDB when signed
 * in. Turns are never visible to, or uploaded for, any other owner.
 */
export function logTurn(
  sessionId: string,
  role: 'user' | 'assistant',
  text: string,
  propertyIds: string[] = [],
  owner: string
): void {
  try {
    writeJson(lastSessionKeyFor(owner), sessionId)
    const key = turnsKeyFor(owner, sessionId)
    const turns = readJson<MessageDoc[]>(key) ?? []
    const doc: MessageDoc = {
      _id: newId('msg'),
      schemaVersion: SCHEMA_VERSION,
      conversationId: sessionId,
      role,
      text: text.slice(0, 4000),
      propertyIds,
      createdAt: nowIso()
    }
    turns.push(doc)
    writeJson(key, turns.slice(-MAX_TURNS_PER_SESSION))
    if (cloudUid) mirror(cloudLogTurn(cloudUid, sessionId, doc, role === 'user' ? text : undefined))
  } catch {
    // Ignore — logging must never break the chat.
  }
}

export function getSessionTurns(sessionId: string, owner: string): MessageDoc[] {
  const raw = readJson<MessageDoc[]>(turnsKeyFor(owner, sessionId))
  return Array.isArray(raw) ? raw : []
}

/** Most recent chat session id FOR THIS OWNER (for visible history restore). */
export function getLastChatSessionId(owner: string): string | null {
  try {
    const v = memoryStore.get(lastSessionKeyFor(owner))
    return v ? (JSON.parse(v) as string) : null
  } catch {
    return null
  }
}

/* ---------------- Inquiries (submitted through the chatbot) ----------------
 * An inquiry is recorded when the user taps "Enquire" on a real property
 * card: local cache first, RTDB mirror when signed in. Status stays honest:
 * "Submitted" until the user confirms they contacted the agency
 * (WhatsApp/call), which flips it to "Contacted". No agent-side statuses
 * are invented.
 */

export function getInquiries(owner: string): InquiryDoc[] {
  const raw = readJson<InquiryDoc[]>(inquiriesKeyFor(owner))
  const list = Array.isArray(raw) ? [...raw] : []
  return list.sort((a, b) => ((a?.createdAt ?? '') < (b?.createdAt ?? '') ? 1 : -1))
}

export function logInquiry(input: {
  sessionId: string
  userId?: string | null
  propertyId: string
  propertyTitle: string
  propertyLocation: string
  propertyType: string
  listingType: string
  priceAed: number
  bedrooms: number
  sizeSqft: number
  availability: string
}, owner: string): InquiryDoc | null {
  try {
    const existing = readJson<InquiryDoc[]>(inquiriesKeyFor(owner)) ?? []
    const doc: InquiryDoc = {
      _id: newId('inq'),
      schemaVersion: SCHEMA_VERSION,
      userId: input.userId ?? getLocalUser(owner)?._id ?? null,
      sessionId: input.sessionId,
      propertyId: input.propertyId,
      propertyTitle: input.propertyTitle,
      propertyLocation: input.propertyLocation,
      propertyType: input.propertyType,
      listingType: input.listingType,
      priceAed: input.priceAed,
      bedrooms: input.bedrooms,
      sizeSqft: input.sizeSqft,
      availability: input.availability,
      status: 'Submitted',
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    writeJson(inquiriesKeyFor(owner), [doc, ...existing].slice(0, MAX_INQUIRIES))
    if (cloudUid) mirror(cloudSaveInquiry(cloudUid, doc))
    return doc
  } catch {
    return null
  }
}

export function markInquiryContacted(inquiryId: string, owner: string): void {
  try {
    const key = inquiriesKeyFor(owner)
    const list = readJson<InquiryDoc[]>(key) ?? []
    writeJson(
      key,
      list.map((q) =>
        q._id === inquiryId ? { ...q, status: 'Contacted' as InquiryStatus, updatedAt: nowIso() } : q
      )
    )
    if (cloudUid) mirror(cloudUpdateInquiry(cloudUid, inquiryId, { status: 'Contacted' }))
  } catch {
    // Ignore — status update must never break the chat.
  }
}

/** Withdraw one of the viewer's own inquiries. Returns false when the id
 * is not in this owner's list; never touches another account's cache. */
export function withdrawInquiry(inquiryId: string, owner: string): boolean {
  try {
    const key = inquiriesKeyFor(owner)
    const list = readJson<InquiryDoc[]>(key) ?? []
    if (!list.some((q) => q._id === inquiryId)) return false
    writeJson(
      key,
      list.map((q) =>
        q._id === inquiryId ? { ...q, status: 'Withdrawn' as InquiryStatus, updatedAt: nowIso() } : q
      )
    )
    if (cloudUid) mirror(cloudUpdateInquiry(cloudUid, inquiryId, { status: 'Withdrawn' }))
    return true
  } catch {
    return false
  }
}

export function hasInquiryForProperty(propertyId: string, owner: string): boolean {
  try {
    const list = readJson<InquiryDoc[]>(inquiriesKeyFor(owner)) ?? []
    return list.some((q) => q.propertyId === propertyId)
  } catch {
    return false
  }
}

/* ---------------- Behavioral interactions (personalized feed) --------------
 * Optional, consent-gated activity log: property views, searches, and
 * filters. Explicit actions (likes/saves via favorites, submitted
 * enquiries) are functional records and always stored; passive
 * views/searches are only logged after the owner opts in (see
 * getTrackingConsent / Account → Privacy). Keys are owner-namespaced;
 * legacy data is never read here.
 * ------------------------------------------------------------------------- */

export type InteractionKind = 'view' | 'search' | 'filter' | 'enquiry'

export interface InteractionEvent {
  _id: string
  schemaVersion: number
  kind: InteractionKind
  propertyId?: string
  location?: string | null
  propertyType?: string | null
  bedrooms?: number | null
  query?: string | null
  createdAt: string
}

const MAX_INTERACTIONS = 100

export function interactionsKeyFor(owner: string): string {
  return `lyka_interactions_${owner}`
}

export function trackingConsentKeyFor(owner: string): string {
  return `lyka_tracking_consent_${owner}`
}

/** true = opted in, false = declined, null = never asked. */
export function getTrackingConsent(owner: string): boolean | null {
  try {
    const v = memoryStore.get(trackingConsentKeyFor(owner))
    if (v === '1') return true
    if (v === '0') return false
    return null
  } catch {
    return null
  }
}

export function setTrackingConsent(owner: string, allow: boolean): void {
  try {
    memoryStore.set(trackingConsentKeyFor(owner), allow ? '1' : '0')
  } catch {
    // Ignore
  }
}

export function logInteraction(
  owner: string,
  event: {
    kind: InteractionKind
    propertyId?: string
    location?: string | null
    propertyType?: string | null
    bedrooms?: number | null
    query?: string | null
  }
): void {
  try {
    const key = interactionsKeyFor(owner)
    const list = readJson<InteractionEvent[]>(key) ?? []
    list.push({
      _id: newId('evt'),
      schemaVersion: SCHEMA_VERSION,
      kind: event.kind,
      propertyId: event.propertyId,
      location: event.location ?? null,
      propertyType: event.propertyType ?? null,
      bedrooms: event.bedrooms ?? null,
      query: event.query ?? null,
      createdAt: nowIso(),
    })
    writeJson(key, list.slice(-MAX_INTERACTIONS))
  } catch {
    // Ignore — tracking must never break the app.
  }
}

export function getInteractions(owner: string): InteractionEvent[] {
  const raw = readJson<InteractionEvent[]>(interactionsKeyFor(owner))
  return Array.isArray(raw) ? raw : []
}
