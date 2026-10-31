// CRM API client — staff-only backend routes on port 8000.
// Authenticates with the signed-in staff member's Firebase ID token
// (never a hardcoded secret). Unauthenticated calls receive HTTP 401.

import { auth } from '../../services/firebase'
import { BACKEND_URL, formatApiErrorMessage } from '../../services/api'
import type {
  AnalyseResponse,
  DashboardStats,
  Lead,
  LeadCreate,
  LeadListResponse,
  CRMProperty,
} from '../types/crm'

async function staffAuthHeader(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(forceRefresh)
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

/** Error carrying the HTTP status so callers can distinguish 401/403 from
 *  an unavailable backend (404/5xx/network). */
export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

/** Shared staff-authenticated fetch (reused by staffApi for /api/staff/*). */
const inFlightGets = new Map<string, Promise<unknown>>()

export function clearInFlightGets(): void {
  inFlightGets.clear()
}

export async function crmFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase()
  if (method === 'GET') {
    const existing = inFlightGets.get(path)
    if (existing) {
      return existing as Promise<T>
    }
    const promise = apiFetch<T>(path, options)
    inFlightGets.set(path, promise)
    try {
      return await promise
    } finally {
      inFlightGets.delete(path)
    }
  }
  return apiFetch<T>(path, options)
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // NOTE: options are spread FIRST so the merged headers below (default
  // Content-Type + Firebase token + per-call overrides) are never clobbered
  // by a partial headers object. Reversing this order silently drops
  // Content-Type on every staffFetch write, and FastAPI then rejects the
  // JSON body with 422 "Input should be a valid dictionary or object".
  const callerHeaders = (options?.headers as Record<string, string>) ?? {}
  let authHeaders = await staffAuthHeader(false)
  let res: Response
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12000)
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      signal: options?.signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...callerHeaders,
        ...authHeaders,
      },
    })
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const rawMsg = err instanceof Error ? err.message : String(err)
    throw new ApiRequestError(
      `Network connection failed (${rawMsg}). Verify that the backend is running at ${BACKEND_URL}.`,
      0,
    )
  } finally {
    clearTimeout(timeoutId)
  }

  // If 401 and a Firebase user is logged in, attempt a one-time token refresh and retry
  if (res.status === 401 && auth.currentUser) {
    const refreshed = await staffAuthHeader(true)
    if (refreshed.Authorization) {
      const retryController = new AbortController()
      const retryTimeoutId = setTimeout(() => retryController.abort(), 12000)
      try {
        res = await fetch(`${BACKEND_URL}${path}`, {
          ...options,
          signal: options?.signal || retryController.signal,
          headers: {
            'Content-Type': 'application/json',
            ...callerHeaders,
            ...refreshed,
          },
        })
      } catch (err: unknown) {
        clearTimeout(retryTimeoutId)
        const rawMsg = err instanceof Error ? err.message : String(err)
        throw new ApiRequestError(
          `Network connection failed on token refresh (${rawMsg}). Backend at ${BACKEND_URL} is unreachable.`,
          0,
        )
      } finally {
        clearTimeout(retryTimeoutId)
      }
    }
  }

  if (!res.ok) {
    let detail: unknown = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body.detail ?? body
    } catch {/* ignore */}

    let msg = formatApiErrorMessage(detail, `Request failed with HTTP ${res.status}`)
    if (res.status === 401) {
      msg = 'Authentication session expired or invalid. Please sign in again.'
    } else if (res.status === 403) {
      msg = typeof detail === 'string' && detail !== 'HTTP 403'
        ? detail
        : 'Access denied: You do not have permission for this resource.'
    } else if (res.status === 404) {
      msg = typeof detail === 'string' && detail !== 'HTTP 404'
        ? detail
        : 'The requested resource was not found.'
    } else if (res.status === 429) {
      const retryHeader = res.headers.get('Retry-After')
      const retrySec = retryHeader ? parseInt(retryHeader, 10) : 5
      msg = `Too many requests. Server busy, please retry in ${isNaN(retrySec) ? 5 : retrySec} seconds.`
    } else if (res.status === 422) {
      msg = `Validation error: ${msg}`
    } else if (res.status >= 500) {
      msg = `Server error (HTTP ${res.status}): ${typeof detail === 'string' && detail !== `HTTP ${res.status}` ? detail : 'Internal server error. Please retry.'}`
    }

    throw new ApiRequestError(msg, res.status)
  }

  return res.json() as Promise<T>
}

// ── Analyse ──────────────────────────────────────────────────────────────────

export const analyseEnquiry = (text: string): Promise<AnalyseResponse> =>
  apiFetch('/api/leads/analyze', {
    method: 'POST',
    body: JSON.stringify({ enquiry_text: text }),
  })

// ── Leads ─────────────────────────────────────────────────────────────────────

export const createLead = (payload: LeadCreate): Promise<Lead> =>
  apiFetch('/api/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const listLeads = (params?: {
  search?: string
  status?: string
  priority?: string
  lead_type?: string
  channel?: string
  page?: number
  per_page?: number
}): Promise<LeadListResponse> => {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.status) qs.set('status', params.status)
  if (params?.priority) qs.set('priority', params.priority)
  if (params?.lead_type) qs.set('lead_type', params.lead_type)
  if (params?.channel) qs.set('channel', params.channel)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.per_page) qs.set('per_page', String(params.per_page))
  return apiFetch(`/api/leads?${qs}`)
}

export const getLead = (id: number): Promise<Lead> =>
  apiFetch(`/api/leads/${id}`)

export const updateLead = (id: number, data: Partial<Lead>): Promise<Lead> =>
  apiFetch(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const updateLeadStatus = (
  id: number,
  status: string,
  notes?: string
): Promise<Lead> =>
  apiFetch(`/api/leads/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  })

export const refreshRecommendations = (id: number): Promise<Lead> =>
  apiFetch(`/api/leads/${id}/recommendations`, { method: 'POST' })

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardStats = (): Promise<DashboardStats> =>
  apiFetch('/api/leads/stats/dashboard')

// ── Properties ────────────────────────────────────────────────────────────────

export const listProperties = (params?: {
  location?: string
  listing_type?: string
  bedrooms?: number
  available_only?: boolean
}): Promise<CRMProperty[]> => {
  const qs = new URLSearchParams()
  if (params?.location) qs.set('location', params.location)
  if (params?.listing_type) qs.set('listing_type', params.listing_type)
  if (params?.bedrooms !== undefined) qs.set('bedrooms', String(params.bedrooms))
  if (params?.available_only !== undefined) qs.set('available_only', String(params.available_only))
  return apiFetch(`/api/properties?${qs}`)
}

export const createProperty = (data: Omit<CRMProperty, 'id' | 'created_at' | 'updated_at'>): Promise<CRMProperty> =>
  apiFetch('/api/properties', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateProperty = (id: number, data: Partial<CRMProperty>): Promise<CRMProperty> =>
  apiFetch(`/api/properties/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export interface PropertyAnalytics {
  total_properties: number
  total_available: number
  total_reserved: number
  total_sold: number
  total_rented: number
  total_portfolio_value_aed: number
  average_price_sqft: number
  breakdown_by_type: Record<string, number>
  breakdown_by_location: Record<string, number>
}

export const getPropertyAnalytics = (): Promise<PropertyAnalytics> =>
  apiFetch('/api/properties/analytics')

export const importPropertiesDataset = (properties: any[]): Promise<{ imported_count: number; updated_count: number; skipped_count: number; errors: string[] }> =>
  apiFetch('/api/properties/import', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  })

export const verifyProperty = (id: number): Promise<CRMProperty> =>
  apiFetch(`/api/properties/${id}/verify`, {
    method: 'PATCH',
  })

export const updatePropertyStatus = (id: number, status: string): Promise<CRMProperty> =>
  apiFetch(`/api/properties/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })

