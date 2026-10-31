/**
 * LYKA Realty API Client
 * Centralized HTTP request client with base URL configuration and authentication headers.
 */
import { BACKEND_URL } from '../services/api'
import { auth } from '../services/firebase'

export { BACKEND_URL }

/**
 * Retrieves the current Firebase ID token for Authorization headers.
 */
export async function getAuthHeader(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(forceRefresh)
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

/**
 * Standard HTTP fetch wrapper with automatic Authorization header injection and JSON parsing.
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeader()
  const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errorJson = await response.json()
      errorDetail = errorJson.detail || errorJson.message || JSON.stringify(errorJson)
    } catch {
      // ignore json decode failure
    }
    throw new Error(`API Error (${response.status}): ${errorDetail}`)
  }

  return response.json() as Promise<T>
}

