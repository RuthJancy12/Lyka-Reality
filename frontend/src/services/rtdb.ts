/**
 * LYKA AI — Firebase Realtime Database persistence.
 *
 * Live instance: https://real-estimate-6b291-default-rtdb.firebaseio.com
 * (verified reachable; anonymous reads denied per secure rules.)
 *
 * Layout (all under the signed-in user's own node — see database.rules.json):
 *   users/{uid}/profile
 *   users/{uid}/prefs
 *   users/{uid}/favorites/{propertyId} = true
 *   users/{uid}/inquiries/{inquiryId}  = InquiryDoc
 *   users/{uid}/conversations/{sessionId} = ConversationDoc-ish meta
 *   users/{uid}/turns/{sessionId}/{messageId} = MessageDoc
 *
 * Rules: guests (signed out) use in-memory state only; signed-in users
 * read/write their own node. No passwords, tokens, or private keys are ever
 * written here — only profile display data, prefs, favorites, inquiries, and
 * chat turns. RTDB keys never contain '.', '$', '#', '[', ']' (our ids use
 * prefixes + uuid/date safe chars).
 */
import { ref, set, update, get, goOffline, goOnline } from 'firebase/database'
import { db } from './firebase'

/**
 * Safely disconnects the RTDB WebSocket to prevent hanging sockets and allow clean bfcache entry.
 */
export function disconnectRtdb(): void {
  try {
    goOffline(db)
  } catch {
    // Ignore offline errors
  }
}

/**
 * Reconnects the RTDB WebSocket when the page becomes visible again.
 */
export function reconnectRtdb(): void {
  try {
    goOnline(db)
  } catch {
    // Ignore online errors
  }
}

// Browser lifecycle integration for Back-Forward Cache (bfcache) and tab visibility
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    disconnectRtdb()
  })

  window.addEventListener('pageshow', () => {
    reconnectRtdb()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      reconnectRtdb()
    }
  })
}
import type {
  UserDoc, PreferencesDoc, InquiryDoc, MessageDoc, ConversationDoc
} from './chatStore'
import {
  SCHEMA_VERSION,
  favoritesKeyFor,
  inquiriesKeyFor,
  profileKeyFor,
  prefsKeyFor,
  turnsKeyFor,
  ownerSessionIds,
  quarantineLegacyChatData,
} from './chatStore'

/* Legacy global cache keys (pre-isolation). Never read or written here
 * anymore — one-time quarantine in syncOnLogin() moves them aside.
 * Kept only so the quarantine step can name them. */
export const LOCAL_KEYS = {
  user: 'lyka_profile_user',
  prefs: 'lyka_profile_prefs',
  inquiries: 'lyka_inquiries',
  favorites: 'lyka_favorites',
  turnsPrefix: 'lyka_chat_turns_'
} as const

function nowIso(): string {
  return new Date().toISOString()
}

function userNode(uid: string): string {
  return `users/${uid}`
}

function logDbError(op: string, err: unknown): void {
  try {
    console.error(`[LYKA rtdb] ${op} failed:`, err instanceof Error ? err.message : err)
  } catch {
    // Never break the app for logging.
  }
}

const inMemoryCache = new Map<string, unknown>()

function readLocal<T>(key: string): T | null {
  const val = inMemoryCache.get(key)
  return val !== undefined ? (val as T) : null
}

function writeLocal(key: string, value: unknown): void {
  inMemoryCache.set(key, value)
}

/* ---------------- pure merge helpers (unit-testable) ---------------- */

function createdAtOf(d: { createdAt?: string }): number {
  const t = Date.parse(d.createdAt ?? '')
  return Number.isNaN(t) ? 0 : t
}

function updatedAtOf(d: { updatedAt?: string; createdAt?: string }): number {
  const t = Date.parse(d.updatedAt ?? d.createdAt ?? '')
  return Number.isNaN(t) ? 0 : t
}

/** Union by _id; on conflict the newer updatedAt/createdAt wins. */
export function mergeDocs<T extends { _id: string; createdAt: string; updatedAt?: string }>(
  localList: T[],
  cloudMap: Record<string, T> | null | undefined
): T[] {
  const byId = new Map<string, T>()
  for (const d of localList) {
    if (d && d._id) byId.set(d._id, d)
  }
  if (cloudMap) {
    for (const d of Object.values(cloudMap)) {
      if (!d || !d._id) continue
      const prev = byId.get(d._id)
      if (!prev || updatedAtOf(d) >= updatedAtOf(prev)) byId.set(d._id, d)
    }
  }
  return [...byId.values()].sort((a, b) => createdAtOf(a) - createdAtOf(b))
}

/** Union of favorite ids, stable sorted. Keeps only non-empty string IDs
 * (anything else in storage is ignored, never counted, never written). */
export function mergeFavorites(localIds: string[], cloudMap: Record<string, boolean> | null | undefined): string[] {
  const set = new Set<string>()
  for (const id of localIds ?? []) {
    if (typeof id === 'string' && id.trim()) set.add(id.trim())
  }
  if (cloudMap) {
    for (const [id, v] of Object.entries(cloudMap)) {
      if (v && id && typeof id === 'string' && id.trim()) set.add(id.trim())
    }
  }
  return [...set].sort()
}

/**
 * Merge turn lists across sessions: { sessionId: MessageDoc[] }.
 * Dedupes by message _id, keeps newest 100 per session, sorted oldest-first.
 */
export function mergeTurnSessions(
  local: Record<string, MessageDoc[]>,
  cloud: Record<string, Record<string, MessageDoc>> | null | undefined
): Record<string, MessageDoc[]> {
  const out: Record<string, MessageDoc[]> = {}
  const sessions = new Set<string>([...Object.keys(local), ...Object.keys(cloud ?? {})])
  for (const s of sessions) {
    const byId = new Map<string, MessageDoc>()
    for (const m of local[s] ?? []) {
      if (m && m._id) byId.set(m._id, m)
    }
    const cloudMsgs = cloud?.[s]
    if (cloudMsgs) {
      for (const m of Object.values(cloudMsgs)) {
        if (m && m._id && !byId.has(m._id)) byId.set(m._id, m)
      }
    }
    out[s] = [...byId.values()]
      .sort((a, b) => createdAtOf(a) - createdAtOf(b))
      .slice(-100)
  }
  return out
}

/** Newer of two dated docs (null-safe). */
export function newerDoc<T extends { updatedAt?: string; createdAt?: string }>(
  a: T | null | undefined,
  b: T | null | undefined
): T | null {
  if (!a) return b ?? null
  if (!b) return a
  return updatedAtOf(b) >= updatedAtOf(a) ? b : a
}

/* ---------------- cloud writes (fire-and-forget safe) ---------------- */

/**
 * Recursively removes properties with undefined values so Firebase Realtime
 * Database set() and update() operations never reject with:
 * "set argument contains undefined in property users...".
 */
export function stripUndefined<T>(val: T): T {
  if (val === undefined || val === null || typeof val !== 'object') {
    return val
  }
  if (Array.isArray(val)) {
    return val.map((item) => stripUndefined(item)) as unknown as T
  }
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      clean[k] = stripUndefined(v)
    }
  }
  return clean as T
}

export async function cloudSaveProfile(uid: string, doc: UserDoc): Promise<boolean> {
  try {
    await set(ref(db, `${userNode(uid)}/profile`), stripUndefined(doc))
    return true
  } catch (err) {
    logDbError('saveProfile', err)
    return false
  }
}

export async function cloudSavePrefs(uid: string, doc: PreferencesDoc): Promise<boolean> {
  try {
    await set(ref(db, `${userNode(uid)}/prefs`), stripUndefined(doc))
    return true
  } catch (err) {
    logDbError('savePrefs', err)
    return false
  }
}

export async function cloudSaveFavoritesAll(uid: string, ids: string[]): Promise<boolean> {
  try {
    const map: Record<string, boolean> = {}
    for (const id of ids) {
      if (id) map[id] = true
    }
    await set(ref(db, `${userNode(uid)}/favorites`), map)
    return true
  } catch (err) {
    logDbError('saveFavorites', err)
    return false
  }
}

export async function cloudSaveInquiry(uid: string, doc: InquiryDoc): Promise<boolean> {
  try {
    await set(ref(db, `${userNode(uid)}/inquiries/${doc._id}`), stripUndefined(doc))
    return true
  } catch (err) {
    logDbError('saveInquiry', err)
    return false
  }
}

export async function cloudUpdateInquiry(
  uid: string,
  inquiryId: string,
  patch: Partial<Pick<InquiryDoc, 'status' | 'updatedAt'>>
): Promise<boolean> {
  try {
    await update(ref(db, `${userNode(uid)}/inquiries/${inquiryId}`), stripUndefined({
      ...patch,
      updatedAt: nowIso()
    }))
    return true
  } catch (err) {
    logDbError('updateInquiry', err)
    return false
  }
}

export async function cloudLogTurn(
  uid: string,
  sessionId: string,
  msg: MessageDoc,
  userTextForTitle?: string
): Promise<boolean> {
  try {
    await set(ref(db, `${userNode(uid)}/turns/${sessionId}/${msg._id}`), stripUndefined(msg))
    const convoRef = ref(db, `${userNode(uid)}/conversations/${sessionId}`)
    const existing = await get(convoRef)
    if (!existing.exists()) {
      const convo: ConversationDoc = {
        _id: `convo_${sessionId}`,
        schemaVersion: SCHEMA_VERSION,
        userId: uid,
        sessionId,
        title: (userTextForTitle || 'LYKA chat').slice(0, 60),
        createdAt: msg.createdAt,
        updatedAt: msg.createdAt
      }
      await set(convoRef, stripUndefined(convo))
    } else {
      await update(convoRef, { updatedAt: msg.createdAt })
    }
    return true
  } catch (err) {
    logDbError('logTurn', err)
    return false
  }
}

/* ---------------- reads ---------------- */

export interface CloudSnapshot {
  profile: UserDoc | null
  prefs: PreferencesDoc | null
  favorites: Record<string, boolean>
  inquiries: Record<string, InquiryDoc>
  turns: Record<string, Record<string, MessageDoc>>
}

export async function cloudReadUser(uid: string): Promise<CloudSnapshot | null> {
  try {
    const snap = await get(ref(db, userNode(uid)))
    if (!snap.exists()) return { profile: null, prefs: null, favorites: {}, inquiries: {}, turns: {} }
    const v = snap.val() as Partial<CloudSnapshot>
    return {
      profile: v.profile ?? null,
      prefs: v.prefs ?? null,
      favorites: v.favorites ?? {},
      inquiries: v.inquiries ?? {},
      turns: v.turns ?? {}
    }
  } catch (err) {
    logDbError('readUser', err)
    return null
  }
}

/* ---------------- login sync: merge cloud <-> local cache ---------------- */

export interface LoginSyncResult {
  favorites: string[]
  inquiries: InquiryDoc[]
  turnsSessions: string[]
  cloudOk: boolean
}

/**
 * Two-way sync on sign-in. Cloud and cache are unioned (nothing deleted);
 * merged results are written back to BOTH sides so this device and other
 * devices converge. Never throws.
 *
 * OWNER-SCOPED: only the signing-in user's namespaced cache
 * (`*_uid:{uid}`) is read or uploaded. Legacy pre-isolation keys are
 * quarantined first (moved aside, never read, never uploaded), and other
 * owners' data — including guest/tab sessions on a shared browser — is
 * never touched. This is what stops one person's chat from landing in
 * another person's account.
 */
export async function syncOnLogin(uid: string): Promise<LoginSyncResult> {
  const empty: LoginSyncResult = { favorites: [], inquiries: [], turnsSessions: [], cloudOk: false }
  try {
    quarantineLegacyChatData()
    const owner = `uid:${uid}`
    const cloud = await cloudReadUser(uid)
    if (!cloud) return empty

    // Favorites: union, write back everywhere.
    const localFavs = readLocal<string[]>(favoritesKeyFor(owner)) ?? []
    const mergedFavs = mergeFavorites(localFavs, cloud.favorites)
    writeLocal(favoritesKeyFor(owner), mergedFavs)
    await cloudSaveFavoritesAll(uid, mergedFavs).catch(() => false)

    // Inquiries: union by _id, newest wins; write back missing sides.
    const localInqs = readLocal<InquiryDoc[]>(inquiriesKeyFor(owner)) ?? []
    const mergedInqs = mergeDocs(localInqs, cloud.inquiries).slice(-200)
    writeLocal(inquiriesKeyFor(owner), mergedInqs)
    const cloudIds = new Set(Object.keys(cloud.inquiries))
    await Promise.all(
      mergedInqs
        .filter((q) => !cloudIds.has(q._id))
        .map((q) => cloudSaveInquiry(uid, q).catch(() => false))
    ).catch(() => [])

    // Profile / prefs: newest wins; missing side filled in.
    const localProfile = readLocal<UserDoc>(profileKeyFor(owner))
    const mergedProfile = newerDoc(localProfile, cloud.profile)
    if (mergedProfile) {
      writeLocal(profileKeyFor(owner), mergedProfile)
      if (!cloud.profile || updatedAtOf(mergedProfile) > updatedAtOf(cloud.profile)) {
        await cloudSaveProfile(uid, mergedProfile).catch(() => false)
      }
    }
    const localPrefs = readLocal<PreferencesDoc>(prefsKeyFor(owner))
    const mergedPrefs = newerDoc(localPrefs, cloud.prefs)
    if (mergedPrefs) {
      writeLocal(prefsKeyFor(owner), mergedPrefs)
      if (!cloud.prefs || updatedAtOf(mergedPrefs) > updatedAtOf(cloud.prefs)) {
        await cloudSavePrefs(uid, mergedPrefs).catch(() => false)
      }
    }

    // Turns: union per session into local cache (cap 100/session).
    // Only this owner's sessions are enumerated — never another owner's.
    const localSessions: Record<string, MessageDoc[]> = {}
    for (const sessionId of ownerSessionIds(owner)) {
      localSessions[sessionId] = readLocal<MessageDoc[]>(turnsKeyFor(owner, sessionId)) ?? []
    }
    const mergedSessions = mergeTurnSessions(localSessions, cloud.turns)
    const sessionIds = Object.keys(mergedSessions)
    for (const s of sessionIds) {
      writeLocal(turnsKeyFor(owner, s), mergedSessions[s])
    }
    // Upload local-only messages to cloud (best-effort, newest 25/session).
    for (const s of sessionIds) {
      const cloudMsgs = cloud.turns[s] ?? {}
      const missing = (mergedSessions[s] ?? [])
        .filter((m) => !cloudMsgs[m._id])
        .slice(-25)
      for (const m of missing) {
        await cloudLogTurn(uid, s, m).catch(() => false)
      }
    }

    return {
      favorites: mergedFavs,
      inquiries: [...mergedInqs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      turnsSessions: sessionIds,
      cloudOk: true
    }
  } catch (err) {
    logDbError('syncOnLogin', err)
    return empty
  }
}

/** Pull latest cloud inquiries into the local cache (used by records UI). */
export async function refreshInquiriesFromCloud(uid: string): Promise<InquiryDoc[]> {
  const key = inquiriesKeyFor(`uid:${uid}`)
  try {
    const cloud = await cloudReadUser(uid)
    if (!cloud) return readLocal<InquiryDoc[]>(key) ?? []
    const localInqs = readLocal<InquiryDoc[]>(key) ?? []
    const merged = mergeDocs(localInqs, cloud.inquiries).slice(-200)
    writeLocal(key, merged)
    return [...merged].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  } catch (err) {
    logDbError('refreshInquiries', err)
    return readLocal<InquiryDoc[]>(key) ?? []
  }
}
