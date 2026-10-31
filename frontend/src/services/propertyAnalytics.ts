// Public advertising interaction tracking. Sends only anonymous events to
// the backend, which validates the listing and deduplicates at the database
// level. No names, emails, phones or raw IPs are sent.
// Zero browser storage persistence: in-memory throttling only. Supabase PostgreSQL
// via FastAPI (/api/property-analytics/events) is the permanent source of truth.

import { BACKEND_URL } from './api'

export type PublicAdEventType = 'impression' | 'view' | 'whatsapp_click'

const SENT_PREFIX = 'lyka_ads_sent_v1:'
const memorySent = new Set<string>()
let memoryVisitorId: string | null = null

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to a non-cryptographic id below.
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function visitorId(): string {
  if (!memoryVisitorId) {
    memoryVisitorId = randomId()
  }
  return memoryVisitorId
}

function bucketKey(eventType: PublicAdEventType, now: Date): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const h = String(now.getUTCHours()).padStart(2, '0')
  const min = String(now.getUTCMinutes()).padStart(2, '0')
  if (eventType === 'impression') return `${y}-${m}-${d}`
  if (eventType === 'view') return `${y}-${m}-${d}-${h}`
  return `${y}-${m}-${d}-${h}-${min}`
}

function alreadySent(key: string): boolean {
  return memorySent.has(key)
}

function markSent(key: string): void {
  memorySent.add(key)
}

function unmarkSent(key: string): void {
  memorySent.delete(key)
}

/**
 * Fire-and-forget interaction tracking. Duplicate events in the same session
 * bucket are suppressed in-memory before the request (the backend also enforces the
 * same buckets with a UNIQUE dedupe key in Supabase PostgreSQL).
 */
export function trackPropertyEvent(
  propertyRef: string | null | undefined,
  eventType: PublicAdEventType,
  context: 'card' | 'modal' | 'whatsapp' | 'listing',
): void {
  const ref = (propertyRef || '').trim()
  if (!ref) return
  const now = new Date()
  const key = `${SENT_PREFIX}${eventType}:${ref}:${bucketKey(eventType, now)}`
  if (alreadySent(key)) return
  markSent(key)

  void fetch(`${BACKEND_URL}/api/property-analytics/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      property_ref: ref,
      event_type: eventType,
      visitor_id: visitorId(),
      context,
    }),
    keepalive: true,
  }).then((res) => {
    // A rejected/unknown event should not occupy the local dedupe slot.
    if (!res.ok && res.status !== 404 && res.status !== 422) unmarkSent(key)
  }).catch(() => {
    unmarkSent(key)
  })
}
