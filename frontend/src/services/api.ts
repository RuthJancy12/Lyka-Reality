/**
 * Lyka Realty API Service
 * Secure communication helper for FastAPI backend & OpenAI Realtime AI
 */
import type { Property } from '../types/property'
import type { UserRequirements } from '../types/agent'
import { auth } from './firebase'

export const BACKEND_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'

/**
 * Best-effort Firebase ID token for backend verification. Uses the cached
 * token or refreshes if expired, ensuring backend calls never receive stale auth;
 * returns empty object when signed out or unavailable, in which case the request
 * proceeds anonymously.
 */
async function getIdTokenHeader(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(forceRefresh)
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export interface HealthResponse {
  status: string
  provider?: string
  model?: string
  database?: {
    status: string
    detail?: string
  }
  ollama?: {
    status: string
    target_model?: string
    model_available?: boolean
    available_models?: string[]
    detail?: string
  }
  message: string
}

export interface OllamaStatusResponse {
  status: 'online' | 'offline' | 'error'
  base_url: string
  target_model: string
  model_available: boolean
  available_models?: string[]
  detail?: string
}

export interface CommunityInfo {
  location: string
  listings: number
}

/** Fallback chips when the communities endpoint is unreachable. Real
 * dataset names, so nothing invented — live counts simply unavailable. */
export const FALLBACK_COMMUNITIES = [
  'Dubai Marina',
  'Downtown Dubai',
  'Palm Jumeirah',
  'Business Bay',
]

let communitiesCache: string[] | null = null
let communitiesInflight: Promise<string[]> | null = null

/**
 * Real dataset communities for location chips/dropdowns (most stocked
 * first). Public endpoint, cached process-wide, single inflight request —
 * guests and repeated opens never refetch. Falls back to a short real
 * list when the backend is unreachable.
 */
export function fetchAvailableLocations(): Promise<string[]> {
  if (communitiesCache) return Promise.resolve(communitiesCache)
  if (communitiesInflight) return communitiesInflight
  communitiesInflight = fetch(`${BACKEND_URL}/api/communities`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((data: { communities?: CommunityInfo[] }) => {
      const names = (data.communities || [])
        .map((c) => (c.location || '').trim())
        .filter(Boolean)
      communitiesCache = names.length > 0 ? names : [...FALLBACK_COMMUNITIES]
      communitiesInflight = null
      return communitiesCache
    })
    .catch(() => {
      communitiesInflight = null
      communitiesCache = [...FALLBACK_COMMUNITIES]
      return communitiesCache
    })
  return communitiesInflight
}

/** Test hook: resets the communities cache. */
export function __resetCommunitiesCacheForTests(): void {
  communitiesCache = null
  communitiesInflight = null
}

export interface ChatHistoryTurn {
  role: 'user' | 'model'
  text: string
}

export interface ChatApiResponse {
  reply: string
  matched_properties: Property[]
  requirements: UserRequirements
  session_id: string
  provider?: string
  model?: string
  /** Clarification gate from the backend: which question is being asked. */
  need?: 'purpose' | 'property_type' | 'location' | 'bhk' | 'budget' | 'timeline' | 'metro' | 'beach' | 'no_results' | null
  /** Clickable choices for the clarification question. */
  options?: string[]
}

/**
 * Formats a backend error body into a human-readable message.
 *
 * FastAPI validation failures (HTTP 422) arrive as
 * `{ detail: [{ loc, msg, type, ... }] }` — passing that object straight
 * into `new Error(...)` stringifies to "[object Object]", which is what the
 * "Unable to Load Properties" banner displayed. This extractor flattens
 * string, array, and object shapes into plain text.
 */
export function formatApiErrorMessage(errorData: unknown, fallback: string): string {
  try {
    if (typeof errorData === 'string') {
      const t = errorData.trim()
      if (t && t !== '[object Object]') return t
    }
    if (errorData && typeof errorData === 'object') {
      const detail = (errorData as Record<string, unknown>).detail ?? errorData
      if (typeof detail === 'string') {
        const t = detail.trim()
        if (t) return t
      } else if (Array.isArray(detail)) {
        const parts = detail
          .map((d) => {
            if (typeof d === 'string') return d
            if (d && typeof d === 'object') {
              const rec = d as Record<string, unknown>
              const loc = Array.isArray(rec.loc) ? rec.loc.join('.') : ''
              const msg = typeof rec.msg === 'string' ? rec.msg : JSON.stringify(d)
              return loc ? `${loc}: ${msg}` : msg
            }
            return null
          })
          .filter((p): p is string => Boolean(p))
        if (parts.length > 0) return parts.join('; ')
      } else if (detail && typeof detail === 'object') {
        const rec = detail as Record<string, unknown>
        if (typeof rec.message === 'string' && rec.message.trim()) return rec.message
        const s = JSON.stringify(detail)
        if (s && s !== '{}') return s
      }
    }
  } catch {
    // Fall through to the fallback message below.
  }
  return fallback
}

/**
 * Calls GET /api/health on the FastAPI backend.
 */
export async function getBackendHealth(): Promise<HealthResponse> {
  let response: Response
  try {
    response = await fetch(`${BACKEND_URL}/api/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Network connection failed (${rawMsg}). Verify that the backend is running at ${BACKEND_URL}.`
    )
  }

  if (!response.ok) {
    throw new Error(`Backend health check failed with HTTP ${response.status}`)
  }

  const data: HealthResponse = await response.json()
  return data
}

/**
 * Calls GET /api/ollama/status on the FastAPI backend.
 */
export async function getOllamaStatus(): Promise<OllamaStatusResponse> {
  let response: Response
  try {
    response = await fetch(`${BACKEND_URL}/api/ollama/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Network connection failed (${rawMsg}). Verify that the backend is running at ${BACKEND_URL}.`
    )
  }

  if (!response.ok) {
    throw new Error(`Ollama status check failed with HTTP ${response.status}`)
  }

  const data: OllamaStatusResponse = await response.json()
  return data
}

/**
 * Sends a natural language chat message to OpenAI assistant via the FastAPI backend.
 * Passes the complete conversation history and receives real properties & requirements.
 */
export async function sendChatMessage(
  message: string,
  sessionId = 'default',
  history?: ChatHistoryTurn[],
  messageRef?: string
): Promise<ChatApiResponse> {
  const controller = new AbortController()
  // Must exceed the backend Ollama budget (OLLAMA_TIMEOUT default 90s for up
  // to two sequential model calls). Genuine timeouts still surface as errors.
  const timeoutId = setTimeout(() => controller.abort(), 120000)

  try {
    const authHeader = await getIdTokenHeader()
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeader
      },
      body: JSON.stringify({
        message,
        session_id: sessionId,
        history: history || [],
        ...(messageRef ? { message_ref: messageRef } : {})
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        formatApiErrorMessage(errorData, `Chat request failed with HTTP ${response.status}`)
      )
    }

    const data: ChatApiResponse = await response.json()
    return data
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Chat request timed out. The local AI model is taking longer than expected.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export interface ChatStreamMeta {
  matched_properties: Property[]
  requirements: UserRequirements
  session_id: string
  need?: ChatApiResponse['need']
  options?: string[]
}

export interface ChatStreamEvents {
  /** First event (<10ms): cards, requirements, gate options — render now. */
  onMeta?: (meta: ChatStreamMeta) => void
  /** Each generated token chunk: append to the pending bubble. */
  onToken?: (token: string) => void
  /** Optional cancellation signal to stop stream generation early. */
  signal?: AbortSignal
}

/**
 * Streams a chat turn from POST /api/chat/stream (SSE: meta → tokens →
 * done). Meta arrives in milliseconds so property cards, requirements,
 * and gate options render while the local model still generates text.
 * Resolves with the final assembled turn. History is intentionally NOT
 * sent: the backend keeps the session server-side and ignores client
 * history, so transmitting it only wastes bytes every turn.
 */
export async function sendChatMessageStream(
  message: string,
  sessionId = 'default',
  events: ChatStreamEvents = {},
  messageRef?: string
): Promise<ChatApiResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000)
  if (events.signal) {
    if (events.signal.aborted) {
      controller.abort()
    } else {
      events.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  try {
    const authHeader = await getIdTokenHeader()
    const response = await fetch(`${BACKEND_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...authHeader
      },
      body: JSON.stringify({
        message,
        session_id: sessionId,
        ...(messageRef ? { message_ref: messageRef } : {})
      }),
      signal: controller.signal
    })

    if (!response.ok || !response.body) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        formatApiErrorMessage(errorData, `Chat request failed with HTTP ${response.status}`)
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let done: ChatApiResponse | null = null

    for (;;) {
      const { value, done: readerDone } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !readerDone })
      while (true) {
        const lfIndex = buffer.indexOf('\n\n')
        const crlfIndex = buffer.indexOf('\r\n\r\n')
        let boundary = -1
        let boundaryLen = 2
        if (lfIndex !== -1 && (crlfIndex === -1 || lfIndex < crlfIndex)) {
          boundary = lfIndex
          boundaryLen = 2
        } else if (crlfIndex !== -1) {
          boundary = crlfIndex
          boundaryLen = 4
        }
        if (boundary === -1) break

        const chunk = buffer.slice(0, boundary).trim()
        buffer = buffer.slice(boundary + boundaryLen)
        if (chunk.startsWith('data:')) {
          try {
            const evt = JSON.parse(chunk.slice(5).trim())
            if (evt.type === 'meta') {
              events.onMeta?.({
                matched_properties: evt.matched_properties || [],
                requirements: evt.requirements,
                session_id: evt.session_id,
                need: evt.need ?? null,
                options: evt.options,
              })
            } else if (evt.type === 'token') {
              events.onToken?.(evt.token || '')
            } else if (evt.type === 'done') {
              done = {
                reply: evt.reply || '',
                matched_properties: evt.matched_properties || [],
                requirements: evt.requirements,
                session_id: evt.session_id,
                provider: evt.provider,
                model: evt.model,
                need: evt.need ?? null,
                options: evt.options,
              }
            }
          } catch {
            // Ignore malformed SSE frames; later frames still apply.
          }
        }
      }
      if (readerDone) break
    }

    if (!done) throw new Error('Chat stream ended without a response.')
    return done
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Chat request timed out. The local AI model is taking longer than expected.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export interface CustomerRequirement {
  id: string
  label?: string | null
  locations: string[]
  propertyType?: string | null
  bedrooms?: number | null
  budgetMin?: number | null
  budgetMax?: number | null
  purpose?: string | null
  timeline_days?: number | null
}

export interface CustomerPreferences {
  locations: string[]
  propertyType: string | null
  bedrooms: number | null
  bathrooms?: number | null
  budgetMin: number | null
  budgetMax: number | null
  purpose: string | null
  /** Expected buying/renting timeline in days (null = not stated). */
  timeline_days: number | null
  timeline?: string | null
  amenities?: string[]
  petFriendly?: boolean | null
  furnishing?: string | null
  theme?: 'light' | 'dark' | null
  /** Multiple named briefs stored in the same profile JSON column. */
  requirements?: CustomerRequirement[]
}

export interface CustomerProfile {
  firebase_uid: string
  email: string | null
  name: string | null
  phone: string | null
  city: string | null
  country: string | null
  preferences: CustomerPreferences
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  referrer: string | null
  /** Self-reported "How did you hear about LYKA Realty?" (separate from UTM). */
  discovery_source: string | null
  role: string
  created_at: string
  updated_at: string
}

export interface CustomerProfileResponse {
  profile: CustomerProfile | null
  role: string
}

export interface CustomerAppointment {
  id: number
  lead_id: number
  kind: 'call' | 'viewing'
  scheduled_at: string
  status: string
  property_ref: string | null
}

export class RateLimitError extends Error {
  readonly status = 429
  readonly retryAfter: number

  constructor(message: string, retryAfter = 5) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

let rateLimitedUntil = 0
let lastRetryAfterSeconds = 5

export function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil
}

export function getRateLimitRemainingSeconds(): number {
  return Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1000))
}

export function getLastRetryAfterSeconds(): number {
  return lastRetryAfterSeconds
}

function noteRateLimit(retrySeconds: number) {
  const safe = Math.max(1, retrySeconds || 5)
  rateLimitedUntil = Date.now() + safe * 1000
  lastRetryAfterSeconds = safe
}

interface CacheRecord<T> {
  data: T
  savedAt: number
  expiresAt: number
}

const customerGetCache = new Map<string, CacheRecord<unknown>>()
const customerInFlight = new Map<string, Promise<unknown>>()
const DEFAULT_CUSTOMER_CACHE_TTL_MS = 5000 // 5 seconds

const propertySearchCache = new Map<string, CacheRecord<PropertySearchResponse>>()
const propertySearchInFlight = new Map<string, Promise<PropertySearchResponse>>()
const PROPERTY_SEARCH_TTL_MS = 10000 // 10 seconds

export function invalidateCustomerCache(endpointPrefix?: string): void {
  if (!endpointPrefix) {
    customerGetCache.clear()
    return
  }
  for (const key of customerGetCache.keys()) {
    if (key.includes(endpointPrefix)) {
      customerGetCache.delete(key)
    }
  }
}

/** Test hook: resets all API client caches and rate limit trackers. */
export function __resetApiCacheForTests(): void {
  communitiesCache = null
  communitiesInflight = null
  customerGetCache.clear()
  customerInFlight.clear()
  propertySearchCache.clear()
  propertySearchInFlight.clear()
  rateLimitedUntil = 0
  lastRetryAfterSeconds = 5
}

/**
 * Shared customer authenticated fetch with in-flight deduplication,
 * short-term GET response caching, 429 graceful handling, and one-time
 * 401 token refresh retry.
 */
async function customerApiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase()
  const isGet = method === 'GET'
  const userUid = auth.currentUser?.uid || 'guest'
  const cacheKey = `${userUid}:${path}`

  // If rate limited, guard against pounding the server
  if (isRateLimited()) {
    const remaining = getRateLimitRemainingSeconds()
    if (isGet && customerGetCache.has(cacheKey)) {
      return customerGetCache.get(cacheKey)!.data as T
    }
    throw new RateLimitError(`Server is temporarily busy. Please retry in ${remaining}s.`, remaining)
  }

  if (isGet) {
    // Check valid in-memory cache
    if (customerGetCache.has(cacheKey)) {
      const entry = customerGetCache.get(cacheKey)!
      if (Date.now() < entry.expiresAt) {
        return entry.data as T
      }
    }
    // Check in-flight deduplication
    if (customerInFlight.has(cacheKey)) {
      return customerInFlight.get(cacheKey) as Promise<T>
    }
  } else {
    // Invalidate related customer cache for mutating operations
    if (path.startsWith('/api/customer/profile')) invalidateCustomerCache('/api/customer/profile')
    else if (path.startsWith('/api/customer/favorites')) invalidateCustomerCache('/api/customer/favorites')
    else if (path.startsWith('/api/customer/inquiries')) invalidateCustomerCache('/api/customer/inquiries')
    else if (path.startsWith('/api/customer/chat')) invalidateCustomerCache('/api/customer/chat')
    else if (path.startsWith('/api/customer/interactions')) invalidateCustomerCache('/api/customer/interactions')
    else if (path.startsWith('/api/customer/tracking-consent')) invalidateCustomerCache('/api/customer/tracking-consent')
    else if (path.startsWith('/api/customer/appointments')) invalidateCustomerCache('/api/customer/appointments')
  }

  const exec = async (): Promise<T> => {
    let authHeader = await getIdTokenHeader(false)
    let response: Response
    try {
      response = await fetch(`${BACKEND_URL}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
          ...authHeader,
          ...((options?.headers as Record<string, string>) ?? {}),
        },
      })
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Network connection failed (${rawMsg}). Verify that the backend is running at ${BACKEND_URL}.`
      )
    }

    // If 401 and Firebase user is logged in, attempt a one-time token refresh and retry
    if (response.status === 401 && auth.currentUser) {
      const refreshed = await getIdTokenHeader(true)
      if (refreshed.Authorization) {
        try {
          response = await fetch(`${BACKEND_URL}${path}`, {
            ...options,
            headers: {
              Accept: 'application/json',
              ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
              ...refreshed,
              ...((options?.headers as Record<string, string>) ?? {}),
            },
          })
        } catch (err: unknown) {
          const rawMsg = err instanceof Error ? err.message : String(err)
          throw new Error(
            `Network connection failed on token refresh (${rawMsg}). Backend at ${BACKEND_URL} is unreachable.`
          )
        }
      }
    }

    if (response.status === 429) {
      const retryHeader = response.headers.get('Retry-After')
      const retrySec = retryHeader ? parseInt(retryHeader, 10) : 5
      const safeSec = isNaN(retrySec) ? 5 : retrySec
      noteRateLimit(safeSec)

      // Gracefully return stale cached data for GET if available
      if (isGet && customerGetCache.has(cacheKey)) {
        return customerGetCache.get(cacheKey)!.data as T
      }

      const errorData = await response.json().catch(() => ({}))
      const msg = formatApiErrorMessage(
        errorData,
        `Too many requests. Server busy, please retry in ${safeSec} seconds.`
      )
      throw new RateLimitError(msg, safeSec)
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        formatApiErrorMessage(errorData, `Request to ${path} failed with HTTP ${response.status}`)
      )
    }

    const data = (await response.json()) as T
    if (isGet) {
      customerGetCache.set(cacheKey, {
        data,
        savedAt: Date.now(),
        expiresAt: Date.now() + DEFAULT_CUSTOMER_CACHE_TTL_MS,
      })
    }
    return data
  }

  if (isGet) {
    const promise = exec()
    customerInFlight.set(cacheKey, promise)
    try {
      return await promise
    } finally {
      customerInFlight.delete(cacheKey)
    }
  }

  return await exec()
}

/** Read-only appointment status for the caller's own linked enquiries. */
export async function getMyAppointments(): Promise<CustomerAppointment[]> {
  const data = await customerApiFetch<{ appointments?: CustomerAppointment[] }>('/api/customer/appointments')
  return data.appointments ?? []
}

/**
 * Reads my backend customer profile (UID-owned; 401 when signed out).
 * Never throws for missing rows — returns {profile: null}.
 */
export async function getCustomerProfile(): Promise<CustomerProfileResponse> {
  return await customerApiFetch<CustomerProfileResponse>('/api/customer/profile')
}

export interface CustomerProfileInput {
  name: string
  phone?: string
  city?: string
  country?: string
  preferences?: CustomerPreferences
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  referrer?: string | null
  discovery_source?: string | null
}

/**
 * Saves my backend customer profile. Resolves only on HTTP 200 so the UI
 * shows success strictly after the backend confirms the save.
 */
export async function saveCustomerProfile(
  input: CustomerProfileInput
): Promise<CustomerProfileResponse> {
  return await customerApiFetch<CustomerProfileResponse>('/api/customer/profile', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/**
 * Reads my backend customer preferences (UID-owned; 401 when signed out).
 */
export async function getCustomerPreferences(): Promise<CustomerPreferences> {
  return await customerApiFetch<CustomerPreferences>('/api/customer/preferences')
}

/**
 * Saves my backend customer preferences without altering profile name/contact.
 */
export async function saveCustomerPreferences(
  preferences: CustomerPreferences
): Promise<CustomerPreferences> {
  return await customerApiFetch<CustomerPreferences>('/api/customer/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  })
}

/**
 * Sets the active app appearance (light or dark) without touching browser storage.
 */
export function applyAppTheme(_theme?: 'light' | 'dark'): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.classList.remove('dark')
    document.body?.setAttribute('data-theme', 'light')
  }
}

export interface PublicEnquiryPayload {
  customer_name: string
  contact_email: string
  contact_phone?: string
  property_ref?: string
  property_title?: string
  location?: string
  lead_type?: 'buyer' | 'renter'
  property_type?: string
  message?: string
  preferred_date?: string
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  referrer?: string | null
  discovery_source?: string | null
}

export interface PublicEnquiryResponse {
  id: number
  status: string
  [key: string]: unknown
}

/**
 * Submits an anonymous customer website enquiry to POST /api/leads/public.
 * Resolves only when the backend confirms the save (HTTP 201); throws a
 * human-readable error otherwise so callers show success ONLY on confirm.
 */
export async function submitPublicEnquiry(
  payload: PublicEnquiryPayload
): Promise<PublicEnquiryResponse> {
  let response: Response
  try {
    response = await fetch(`${BACKEND_URL}/api/leads/public`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Network connection failed (${rawMsg}). Verify that the backend is running at ${BACKEND_URL}.`
    )
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      formatApiErrorMessage(errorData, `Enquiry submission failed with HTTP ${response.status}`)
    )
  }

  const data: PublicEnquiryResponse = await response.json()
  return data
}

export interface PropertySearchParams {
  location?: string
  property_type?: string
  bedrooms?: number
  bathrooms?: number
  min_budget?: number
  max_budget?: number
  purpose?: string
  near_metro?: boolean
  near_beach?: boolean
  main_road_access?: boolean
  availability?: string
  view?: string
  sort_by?: string
  limit?: number
  page?: number
  min_parking?: number
  amenities?: string[]
  amenity?: string[]
  furnishing?: string
}

export interface PropertySearchResponse {
  total_found: number
  page?: number
  limit?: number
  total_pages?: number
  exact_match: boolean
  top_properties: Property[]
  ai_summary: any[]
  criteria: Record<string, any>
  fallback?: {
    used: boolean
    requested_location?: string | null
    nearby_locations?: string[]
  }
}

/**
 * Searches real Dubai properties from the FastAPI backend GET /api/properties/search.
 */
export async function fetchPropertiesFromApi(
  params: PropertySearchParams = {}
): Promise<PropertySearchResponse> {
  const query = new URLSearchParams()
  if (params.location) query.append('location', params.location)
  if (params.property_type) query.append('property_type', params.property_type)
  if (params.bedrooms !== undefined && params.bedrooms !== null) {
    query.append('bedrooms', String(params.bedrooms))
  }
  if (params.bathrooms !== undefined && params.bathrooms !== null) {
    query.append('bathrooms', String(params.bathrooms))
  }
  if (params.min_budget !== undefined && params.min_budget > 0) {
    query.append('min_budget', String(params.min_budget))
  }
  if (params.max_budget !== undefined && params.max_budget > 0) {
    query.append('max_budget', String(params.max_budget))
  }
  if (params.purpose && params.purpose !== 'All') {
    query.append('purpose', params.purpose)
  }
  if (params.furnishing) {
    query.append('furnishing', params.furnishing)
  }
  const amList = params.amenity || params.amenities || []
  for (const am of amList) {
    query.append('amenity', am)
  }
  if (params.near_metro !== undefined) {
    query.append('near_metro', String(params.near_metro))
  }
  if (params.near_beach !== undefined) {
    query.append('near_beach', String(params.near_beach))
  }
  if (params.main_road_access !== undefined) {
    query.append('main_road_access', String(params.main_road_access))
  }
  if (params.availability) query.append('availability', params.availability)
  if (params.view) query.append('view', params.view)
  if (params.sort_by) query.append('sort_by', params.sort_by)
  if (params.limit !== undefined) query.append('limit', String(params.limit))
  if (params.page !== undefined && params.page > 0) query.append('page', String(params.page))
  if (params.min_parking !== undefined && params.min_parking !== null) {
    query.append('min_parking', String(params.min_parking))
  }
  for (const am of params.amenities || []) {
    if (am && am.trim()) query.append('amenity', am.trim())
  }

  const qs = query.toString()
  const cacheKey = qs || '__all__'

  if (isRateLimited()) {
    const remaining = getRateLimitRemainingSeconds()
    if (propertySearchCache.has(cacheKey)) {
      return propertySearchCache.get(cacheKey)!.data
    }
    throw new RateLimitError(`Property search is temporarily paused. Please retry in ${remaining}s.`, remaining)
  }

  if (propertySearchCache.has(cacheKey)) {
    const entry = propertySearchCache.get(cacheKey)!
    if (Date.now() < entry.expiresAt) {
      return entry.data
    }
  }

  if (propertySearchInFlight.has(cacheKey)) {
    return propertySearchInFlight.get(cacheKey)!
  }

  const url = `${BACKEND_URL}/api/properties/search${qs ? `?${qs}` : ''}`
  const exec = async (): Promise<PropertySearchResponse> => {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      })
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Network connection failed (${rawMsg}). Verify that the backend is running at ${BACKEND_URL}.`
      )
    }

    if (response.status === 429) {
      const retryHeader = response.headers.get('Retry-After')
      const retrySec = retryHeader ? parseInt(retryHeader, 10) : 5
      const safeSec = isNaN(retrySec) ? 5 : retrySec
      noteRateLimit(safeSec)

      if (propertySearchCache.has(cacheKey)) {
        return propertySearchCache.get(cacheKey)!.data
      }

      const errorData = await response.json().catch(() => ({}))
      const msg = formatApiErrorMessage(
        errorData,
        `Too many requests. Server busy, please retry in ${safeSec} seconds.`
      )
      throw new RateLimitError(msg, safeSec)
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(formatApiErrorMessage(errorData, `Property search failed with HTTP ${response.status}`))
    }

    const data: PropertySearchResponse = await response.json()
    propertySearchCache.set(cacheKey, {
      data,
      savedAt: Date.now(),
      expiresAt: Date.now() + PROPERTY_SEARCH_TTL_MS,
    })
    return data
  }

  const promise = exec()
  propertySearchInFlight.set(cacheKey, promise)
  try {
    return await promise
  } finally {
    propertySearchInFlight.delete(cacheKey)
  }
}

/* ==========================================================================
   Customer Self-Service Backend API Functions (Firebase Auth Token)
   ========================================================================== */

export interface CustomerInquiryOut {
  id: string
  lead_id: number | null
  session_id: string | null
  property_id: string
  property_title: string
  property_location: string | null
  property_type: string | null
  listing_type: string | null
  price_aed: number
  bedrooms: number
  size_sqft: number
  availability: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface CustomerChatTurnOut {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'model'
  text: string
  property_ids: string[]
  created_at: string
}

export interface CustomerInteractionOut {
  id: string
  kind: 'view' | 'search' | 'contact' | 'share' | 'favorite' | 'filter'
  property_id: string | null
  location: string | null
  property_type: string | null
  bedrooms: number | null
  query: string | null
  created_at: string
}

/**
 * Loads the authenticated customer's saved property IDs directly from the database.
 */
export async function getCustomerFavorites(): Promise<string[]> {
  const data = await customerApiFetch<{ favorites?: string[] }>('/api/customer/favorites')
  return data.favorites ?? []
}

/**
 * Replaces the authenticated customer's saved property IDs in the backend database.
 */
export async function saveCustomerFavorites(favorites: string[]): Promise<string[]> {
  const data = await customerApiFetch<{ favorites?: string[] }>('/api/customer/favorites', {
    method: 'PUT',
    body: JSON.stringify({ favorites }),
  })
  return data.favorites ?? []
}

/**
 * Loads the customer's inquiries submitted to the backend database.
 */
export async function getCustomerInquiries(): Promise<CustomerInquiryOut[]> {
  const data = await customerApiFetch<{ inquiries?: CustomerInquiryOut[] }>('/api/customer/inquiries')
  return data.inquiries ?? []
}

export interface CustomerInquiryInput {
  property_id: string
  property_title: string
  record_ref?: string
  session_id?: string
  lead_id?: number
  property_location?: string
  property_type?: string
  listing_type?: string
  price_aed?: number
  bedrooms?: number
  size_sqft?: number
  availability?: string
}

/**
 * Creates an inquiry on the backend Supabase PostgreSQL database.
 */
export async function createCustomerInquiry(
  payload: CustomerInquiryInput
): Promise<CustomerInquiryOut> {
  return await customerApiFetch<CustomerInquiryOut>('/api/customer/inquiries', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Updates an inquiry status (e.g. 'Withdrawn') on the backend database.
 */
export async function patchCustomerInquiry(inquiryId: string, status: string): Promise<CustomerInquiryOut> {
  return await customerApiFetch<CustomerInquiryOut>(`/api/customer/inquiries/${encodeURIComponent(inquiryId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

/**
 * Loads the customer's most recent authenticated chat conversation from the backend database.
 */
export async function getCustomerLatestChat(): Promise<{ session_id: string | null; turns: CustomerChatTurnOut[] }> {
  return await customerApiFetch<{ session_id: string | null; turns: CustomerChatTurnOut[] }>('/api/customer/chat/latest')
}

export interface CustomerChatSessionSummary {
  session_id: string
  title: string | null
  created_at: string
  updated_at: string
  turn_count: number
  has_recommendations: boolean
  recommended_property_ids: string[]
  preview?: string | null
  last_message_at?: string | null
}

export interface CustomerChatSessionsPage {
  sessions: CustomerChatSessionSummary[]
  has_more: boolean
  next_cursor: string | null
  total: number
}

export interface CustomerChatSessionDetail {
  session_id: string
  title: string | null
  created_at: string
  updated_at: string
  turns: CustomerChatTurnOut[]
  recommended_properties: any[]
  has_more?: boolean
  next_cursor?: string | null
  requirements?: Record<string, unknown>
}

function chatQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      q.set(key, String(value))
    }
  })
  const text = q.toString()
  return text ? `?${text}` : ''
}

/**
 * Lists previous chat sessions belonging to the authenticated customer.
 * Newest first, paginated with an opaque `before` cursor.
 */
export async function getCustomerChatSessions(
  limit = 30,
  before?: string | null
): Promise<CustomerChatSessionsPage> {
  const data = await customerApiFetch<{
    sessions?: CustomerChatSessionSummary[]
    has_more?: boolean
    next_cursor?: string | null
    total?: number
  }>(`/api/customer/chat/sessions${chatQuery({ limit, before })}`)
  return {
    sessions: data.sessions ?? [],
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
    total: data.total ?? (data.sessions ?? []).length,
  }
}

/**
 * Retrieves details, turns and recommended properties for a specific customer chat session.
 * `before` is the oldest loaded message id, enabling stable older-message paging.
 */
export async function getCustomerChatSessionDetail(
  sessionId: string,
  opts: { limit?: number; before?: string | null } = {}
): Promise<CustomerChatSessionDetail> {
  return await customerApiFetch<CustomerChatSessionDetail>(
    `/api/customer/chat/sessions/${encodeURIComponent(sessionId)}${chatQuery({
      limit: opts.limit,
      before: opts.before,
    })}`
  )
}

/** Renames one owned conversation; the backend enforces UID ownership. */
export async function renameCustomerChatSession(
  sessionId: string,
  title: string
): Promise<{ session_id: string; title: string; updated_at: string }> {
  return await customerApiFetch(`/api/customer/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

/**
 * Appends one turn to the customer's authenticated chat history on the backend database.
 */
export async function createCustomerChatTurn(payload: {
  session_id: string
  role: 'user' | 'assistant'
  text: string
  property_ids?: string[]
  record_ref?: string
}): Promise<CustomerChatTurnOut> {
  return await customerApiFetch<CustomerChatTurnOut>('/api/customer/chat/turns', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Loads the customer's activity logs (views, searches, etc.) from the backend database.
 */
export async function getCustomerInteractions(): Promise<CustomerInteractionOut[]> {
  const data = await customerApiFetch<{ interactions?: CustomerInteractionOut[] }>('/api/customer/interactions')
  return data.interactions ?? []
}

export interface CustomerInteractionCreatePayload {
  record_ref?: string
  kind: 'view' | 'search' | 'filter' | 'enquiry'
  property_id?: string
  location?: string | null
  property_type?: string | null
  bedrooms?: number | null
  query?: string | null
}

/**
 * Persists a consent-gated activity interaction event to the customer's backend account.
 */
export async function createCustomerInteraction(
  payload: CustomerInteractionCreatePayload
): Promise<CustomerInteractionOut> {
  return await customerApiFetch<CustomerInteractionOut>('/api/customer/interactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Loads the customer's activity tracking consent preference from the backend database.
 */
export async function getCustomerTrackingConsent(): Promise<boolean | null> {
  const data = await customerApiFetch<{ tracking_consent: boolean | null }>('/api/customer/tracking-consent')
  return data.tracking_consent
}

/**
 * Saves the customer's activity tracking consent preference to the backend database.
 */
export async function saveCustomerTrackingConsent(allow: boolean): Promise<boolean> {
  const data = await customerApiFetch<{ tracking_consent: boolean }>('/api/customer/tracking-consent', {
    method: 'PUT',
    body: JSON.stringify({ allow }),
  })
  return data.tracking_consent
}



export interface InventoryStatsResponse {
  total_inventory: number
  available_ready: number
  reserved_off_plan: number
  listing_types: Record<string, number>
  property_types: Array<{ type: string; count: number }>
  top_locations: Array<{ location: string; count: number }>
  price_distribution: {
    under_1m: number
    '1m_to_2m': number
    '2m_to_5m': number
    above_5m: number
  }
  averages: {
    avg_sale_price_aed: number
    avg_rent_price_aed: number
    total_portfolio_sqft: number
  }
}

/**
 * Loads the company-wide inventory analytics from GET /api/properties/inventory-stats
 * (verified 3,000 property dataset, never fake counts).
 */
export async function fetchInventoryStats(): Promise<InventoryStatsResponse> {
  const res = await fetch(`${BACKEND_URL}/api/properties/inventory-stats`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error('Failed to fetch inventory statistics')
  return await res.json()
}

export interface LegacyMigrationPayload {
  favorites?: string[]
  inquiries?: any[]
  sessions?: Array<{
    session_id: string
    title?: string | null
    created_at?: string | null
  }>
  turns?: any[]
  interactions?: any[]
  profile?: {
    name?: string | null
    phone?: string | null
    city?: string | null
    country?: string | null
    discovery_source?: string | null
  }
  preferences?: CustomerPreferences
  tracking_consent?: boolean | null
}

export interface LegacyMigrationResponse {
  migrated: boolean
  favorites?: number
  inquiries?: number
  sessions?: number
  turns?: number
  interactions?: number
}

/**
 * Imports any un-synced local data to the backend database via POST /api/customer/migrate/legacy.
 * Safe and non-destructive.
 */
export async function migrateLegacyCustomerData(
  payload: LegacyMigrationPayload
): Promise<LegacyMigrationResponse> {
  return await customerApiFetch<LegacyMigrationResponse>('/api/customer/migrate/legacy', {
    method: 'POST',
    body: JSON.stringify({
      favorites: payload.favorites || [],
      inquiries: payload.inquiries || [],
      sessions: payload.sessions || [],
      turns: payload.turns || [],
      interactions: payload.interactions || [],
      profile: payload.profile,
      preferences: payload.preferences,
      tracking_consent: payload.tracking_consent,
    }),
  })
}
