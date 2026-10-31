/**
 * Lead-source tracking: UTM parameters + referrer captured at enquiry time.
 *
 * Pure core (`parseLeadSource`) takes explicit inputs so it is unit-testable
 * anywhere; `collectLeadSource()` reads the live browser location/referrer
 * defensively (SSR-safe, never throws). All fields are optional — absent
 * data stays null and is never invented.
 */

export interface LeadSource {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  referrer: string | null
}

const MAX_LEN = 255

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim().slice(0, MAX_LEN)
  return t ? t : null
}

export function parseLeadSource(
  search: string | null | undefined,
  referrer: string | null | undefined
): LeadSource {
  let params: URLSearchParams | null = null
  try {
    params = new URLSearchParams(search || '')
  } catch {
    params = null
  }
  const pick = (key: string): string | null =>
    clean(params?.get(key));
  return {
    utm_source: pick('utm_source'),
    utm_medium: pick('utm_medium'),
    utm_campaign: pick('utm_campaign'),
    referrer: clean(referrer),
  }
}

/** Reads the live page URL + referrer. Safe to call during submit handlers. */
export function collectLeadSource(): LeadSource {
  let search: string | null = null
  let referrer: string | null = null
  try {
    search = typeof window !== 'undefined' ? window.location.search : null
  } catch {
    search = null
  }
  try {
    const ref = typeof document !== 'undefined' ? document.referrer : ''
    referrer = ref ? ref : null
  } catch {
    referrer = null
  }
  return parseLeadSource(search, referrer)
}

export type LeadChannel =
  | 'Google'
  | 'Instagram'
  | 'Facebook'
  | 'Referral'
  | 'Direct'
  | 'Unknown'

/**
 * Self-reported acquisition source ("How did you hear about LYKA
 * Realty?"). Deliberately separate from automatic UTM/referrer
 * attribution above: this is what the customer tells us, never what we
 * detect. Absent stays null — never guessed, never defaulted.
 */
export const DISCOVERY_SOURCES = [
  'Google',
  'Instagram',
  'Facebook',
  'Friend/Referral',
  'Direct Website',
  'Other/Unknown',
] as const

export type DiscoverySource = (typeof DISCOVERY_SOURCES)[number]

/** Canonical value when the input names a listed source, else null (missing or unlisted — never guessed). */
export function normalizeDiscoverySource(value: unknown): DiscoverySource | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!t) return null
  return (DISCOVERY_SOURCES as readonly string[]).includes(t) ? (t as DiscoverySource) : null
}

/** True for missing (optional) or listed values; false for anything else. */
export function isValidDiscoverySource(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'string') return false
  if (!value.trim()) return true
  return (DISCOVERY_SOURCES as readonly string[]).includes(value.trim())
}

/** Error message for an invalid self-reported source, or null when OK/missing. */
export function validateDiscoverySource(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !value.trim()) return null
  if ((DISCOVERY_SOURCES as readonly string[]).includes(value.trim())) return null
  return 'Please choose how you heard about us from the list.'
}

/**
 * Classifies a lead into a canonical acquisition channel from recorded
 * attribution only. Deterministic and honest:
 * - recognised utm_source wins (Google / Instagram / Facebook);
 * - otherwise a recorded external referrer means Referral;
 * - a bare direct visit (no UTM, no referrer) means Direct;
 * - anything else (e.g. an unrecognised utm_source) is Unknown —
 *   never guessed, never defaulted to a network.
 */
export function classifyLeadChannel(source?: {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  referrer?: string | null
} | null): LeadChannel {
  if (!source) return 'Direct'
  const src = (source.utm_source || '').trim().toLowerCase()
  if (src) {
    if (src.includes('google')) return 'Google'
    if (src.includes('instagram')) return 'Instagram'
    if (src.includes('facebook') || src === 'fb' || src.includes(' meta')) return 'Facebook'
    return 'Unknown'
  }
  if ((source.referrer || '').trim()) return 'Referral'
  if ((source.utm_medium || '').trim() || (source.utm_campaign || '').trim()) {
    return 'Unknown'
  }
  return 'Direct'
}
