/**
 * Saved-properties (favorites) helpers — the single shared source of truth
 * for every favorites count and list in the app.
 *
 * Rule: every surface (header badge, profile-menu count, Saved Properties
 * panel, Account favorites, chat hearts) derives from the SAME resolved
 * list — unique, genuinely saved property IDs mapped to real catalogue
 * records. Viewed properties, recommendation impressions, duplicate IDs,
 * and unrelated interactions are never counted.
 *
 * Missing or unavailable records are EXCLUDED from counts and lists but
 * are never deleted here: the stored ID list is left intact so the save
 * reappears if the listing returns. Callers persist the sanitized
 * (deduped, string-only) ID list, which preserves the saved set exactly.
 */
import type { Property } from '../types/property'

/**
 * Sanitizes a stored ID list: keeps only non-empty trimmed strings,
 * deduplicated with first-seen order preserved. Returns [] for anything
 * that is not an array. Never throws.
 */
export function sanitizeFavoriteIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Resolves sanitized IDs to real catalogue records via `lookup`, dropping
 * IDs with no record (kept in storage by the caller, excluded here).
 * Order follows the ID list; each property appears at most once.
 */
export function resolveFavoriteProperties(
  ids: readonly string[],
  lookup: (id: string) => Property | undefined
): Property[] {
  const out: Property[] = []
  const seen = new Set<string>()
  for (const id of sanitizeFavoriteIds(ids)) {
    if (seen.has(id)) continue
    seen.add(id)
    const prop = lookup(id)
    if (prop) out.push(prop)
  }
  return out
}

/**
 * Adds or removes one ID, returning the new sanitized list. Blank IDs are
 * ignored (list returned unchanged). Never introduces duplicates.
 */
export function toggleFavoriteId(ids: readonly string[], id: string): string[] {
  const clean = typeof id === 'string' ? id.trim() : ''
  if (!clean) return sanitizeFavoriteIds(ids)
  const current = sanitizeFavoriteIds(ids)
  return current.includes(clean)
    ? current.filter((item) => item !== clean)
    : [...current, clean]
}

/** ID set of a resolved favorites list, for heart-state checks. */
export function favoriteIdSet(resolved: readonly Property[]): Set<string> {
  return new Set(resolved.map((p) => p.property_id))
}
