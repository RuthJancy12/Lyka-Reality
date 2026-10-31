/**
 * Personalized property feed: deterministic affinity ranking over the REAL
 * dataset. No model calls, no invented listings — every candidate is an
 * actual property; scoring only orders them.
 *
 * Signals (all owner-scoped, all real): saved preferences, favorited and
 * viewed properties, submitted enquiries, and consented interaction history.
 * Already-saved or already-enquired listings are excluded (the customer
 * knows them); zero-signal customers get an empty feed, never filler.
 */
import type { Property } from '../types/property'

export interface FeedSignals {
  preferredLocations: string[]
  preferredTypes: string[]
  preferredListing?: string | null
  preferredBedrooms?: number | null
  budgetMax?: number | null
  favoriteIds: string[]
  enquiredIds: string[]
  viewedIds: string[]
}

function normLoc(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

/**
 * Affinity score breakdown (transparent, integer weights):
 * location 3 · property type 2 · listing intent 2 · bedrooms 1 · budget 1.
 */
export function scorePropertyForFeed(
  prop: Property,
  signals: FeedSignals
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  const locs = signals.preferredLocations.map(normLoc).filter(Boolean)

  if (locs.length > 0 && locs.includes(normLoc(prop.location))) {
    score += 3
    reasons.push(`In ${prop.location}`)
  }
  if (signals.preferredTypes.length > 0 && signals.preferredTypes.includes(prop.property_type)) {
    score += 2
    reasons.push(`${prop.property_type} type match`)
  }
  if (signals.preferredListing && prop.listing_type === signals.preferredListing) {
    score += 2
    reasons.push(`For ${prop.listing_type}`)
  }
  if (signals.preferredBedrooms !== null && signals.preferredBedrooms !== undefined &&
      prop.bhk === signals.preferredBedrooms) {
    score += 1
    reasons.push(prop.bhk === 0 ? 'Studio match' : `${prop.bhk} BHK match`)
  }
  if (signals.budgetMax !== null && signals.budgetMax !== undefined &&
      signals.budgetMax > 0 && prop.price_aed <= signals.budgetMax) {
    score += 1
    reasons.push('Within budget')
  }
  return { score, reasons }
}

/** Top-N relevant picks, stable-sorted (score desc, then reference id). */
export function personalizedPicks(
  all: Property[],
  signals: FeedSignals,
  limit = 6
): Array<{ property: Property; score: number; reasons: string[] }> {
  const skip = new Set([...signals.favoriteIds, ...signals.enquiredIds])
  return all
    .filter((p) => p && p.property_id && !skip.has(p.property_id))
    .map((property) => ({ property, ...scorePropertyForFeed(property, signals) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.property.property_id < b.property.property_id ? -1 : 1))
    .slice(0, Math.max(0, limit))
}
