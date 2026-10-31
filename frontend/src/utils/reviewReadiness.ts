import type { UserRequirements } from '../types/agent'

/**
 * Whether the conversation has collected ALL EIGHT mandatory search
 * criteria, so the final review section ("Search Criteria" card with Edit
 * + Confirm & Find Properties) may be shown.
 *
 * The eight, in collection order: (1) purpose — Buy/Rent, (2) location —
 * a real community, (3) property type, (4) bedrooms (Studio counts),
 * (5) budget ceiling OR an explicit flexible mark, (6) timeline
 * (including an explicit "Flexible"), (7) metro proximity Yes/No,
 * (8) coastline/view Yes/No.
 *
 * The review form must NEVER appear while any of the eight is still
 * unanswered. A default, empty, or never-asked value never counts;
 * only an explicitly provided or selected value — or an intentional
 * "Not sure"/"Flexible" choice recorded as such — completes a criterion.
 */
export function isReviewReady(req: UserRequirements): boolean {
  if (!req.purpose) return false
  if (!req.location) return false
  if (!req.propertyType) return false
  if (req.bhk === null || req.bhk === undefined) return false
  if ((req.budget === null || req.budget === undefined) && !req.budgetFlexible) return false
  if (!req.timeline) return false
  if (req.nearMetro === null || req.nearMetro === undefined) return false
  if (req.beachfront === null || req.beachfront === undefined) return false
  return true
}

/**
 * Oldest unanswered criterion, mirroring the backend ask order. Used to
 * highlight the current question in the live criteria panel.
 */
export function firstUnanswered(
  req: UserRequirements
):
  | 'purpose'
  | 'location'
  | 'propertyType'
  | 'bhk'
  | 'budget'
  | 'timeline'
  | 'nearMetro'
  | 'beachfront'
  | null {
  if (!req.purpose) return 'purpose'
  if (!req.location) return 'location'
  if (!req.propertyType) return 'propertyType'
  if (req.bhk === null || req.bhk === undefined) return 'bhk'
  if ((req.budget === null || req.budget === undefined) && !req.budgetFlexible) return 'budget'
  if (!req.timeline) return 'timeline'
  if (req.nearMetro === null || req.nearMetro === undefined) return 'nearMetro'
  if (req.beachfront === null || req.beachfront === undefined) return 'beachfront'
  return null
}
