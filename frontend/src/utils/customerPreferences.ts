/**
 * Customer property-preferences form helpers (pure, unit-testable).
 *
 * Every preference is optional: an untouched form builds `undefined` so the
 * backend keeps whatever the SQL row already holds. Nothing is invented —
 * missing stays missing on both sides.
 */
import type { CustomerPreferences } from '../services/api'

export const PURPOSE_OPTIONS = ['Buy', 'Rent', 'Invest'] as const
export type PurposeOption = (typeof PURPOSE_OPTIONS)[number]

export const PROPERTY_TYPE_OPTIONS = ['Apartment', 'Villa', 'Townhouse', 'Penthouse'] as const
export type PropertyTypeOption = (typeof PROPERTY_TYPE_OPTIONS)[number]

/** Bedroom choices shown in selects (0 = Studio). */
export const BEDROOM_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'Studio', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 5 },
]

/**
 * Expected buying/renting timeline. The customer picks a plain-language
 * label; only the chosen day count is stored (null = not stated).
 */
export const TIMELINE_OPTIONS: Array<{ label: string; days: number | null }> = [
  { label: 'As soon as possible', days: 30 },
  { label: 'Within 3 months', days: 90 },
  { label: '3–6 months', days: 180 },
  { label: '6–12 months', days: 365 },
  { label: 'Just exploring', days: null },
]

export const BATHROOM_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 5 },
]

export const FURNISHING_OPTIONS = [
  { label: 'Any', value: '' },
  { label: 'Furnished', value: 'Furnished' },
  { label: 'Unfurnished', value: 'Unfurnished' },
  { label: 'Semi-Furnished', value: 'Semi-Furnished' },
] as const

export const SUPPORTED_AMENITIES = [
  'Swimming Pool',
  'Gym',
  'Covered Parking',
  'Balcony',
  'Private Garden',
  'Beach Access',
  'Security 24/7',
  'Shared Spa',
] as const

/** Controlled state for the preferences step/editor. All fields optional. */
export interface PreferencesFormState {
  purpose: string
  propertyType: string
  bedrooms: string
  budgetMin: string
  budgetMax: string
  community: string
  timelineDays: string
  bathrooms?: string
  timeline?: string
  amenities?: string[]
  petFriendly?: boolean
  furnishing?: string
  theme?: 'light' | 'dark'
}

export function emptyPreferencesForm(): PreferencesFormState {
  return {
    purpose: '',
    propertyType: '',
    bedrooms: '',
    budgetMin: '',
    budgetMax: '',
    community: '',
    timelineDays: '',
  }
}

function toNumberOrNull(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Returns an error message, or null when the preferences are valid. */
export function validatePreferencesForm(state: PreferencesFormState): string | null {
  if (state.purpose && !(PURPOSE_OPTIONS as readonly string[]).includes(state.purpose)) {
    return 'Please choose a valid purpose (Buy, Rent, or Invest).'
  }
  if (state.propertyType && !(PROPERTY_TYPE_OPTIONS as readonly string[]).includes(state.propertyType)) {
    return 'Please choose a valid property type.'
  }
  if (state.bedrooms) {
    const b = toNumberOrNull(state.bedrooms)
    if (b === null || !Number.isInteger(b) || b < 0 || b > 20) {
      return 'Bedrooms must be a whole number between 0 and 20.'
    }
  }
  const min = toNumberOrNull(state.budgetMin)
  const max = toNumberOrNull(state.budgetMax)
  if (state.budgetMin.trim() && (min === null || min < 0)) {
    return 'Minimum budget must be a positive amount.'
  }
  if (state.budgetMax.trim() && (max === null || max < 0)) {
    return 'Maximum budget must be a positive amount.'
  }
  if (min !== null && max !== null && min > max) {
    return 'Minimum budget cannot be higher than maximum budget.'
  }
  if (state.community.trim().length > 100) {
    return 'Preferred community is too long (maximum 100 characters).'
  }
  if (state.timelineDays.trim()) {
    const t = toNumberOrNull(state.timelineDays)
    if (t === null || !Number.isInteger(t) || t < 0 || t > 3650) {
      return 'Please choose a valid timeline.'
    }
  }
  return null
}

/**
 * Builds the API payload, or `undefined` when the customer stated nothing
 * (so JSON omits it and the backend keeps existing SQL preferences).
 */
export function buildPreferencesPayload(
  state: PreferencesFormState
): CustomerPreferences | undefined {
  const community = (state.community || '').trim()
  const bathroomsStr = (state.bathrooms || '').trim()
  const timelineStr = (state.timeline || '').trim()
  const furnishingStr = (state.furnishing || '').trim()

  const payload: CustomerPreferences = {
    locations: community ? [community] : [],
    propertyType: (PROPERTY_TYPE_OPTIONS as readonly string[]).includes(state.propertyType)
      ? state.propertyType
      : null,
    bedrooms: (state.bedrooms || '').trim() ? toNumberOrNull(state.bedrooms) : null,
    budgetMin: (state.budgetMin || '').trim() ? toNumberOrNull(state.budgetMin) : null,
    budgetMax: (state.budgetMax || '').trim() ? toNumberOrNull(state.budgetMax) : null,
    purpose: (PURPOSE_OPTIONS as readonly string[]).includes(state.purpose)
      ? state.purpose
      : null,
    timeline_days: (state.timelineDays || '').trim() ? toNumberOrNull(state.timelineDays) : null,
  }

  if (bathroomsStr) {
    payload.bathrooms = toNumberOrNull(bathroomsStr)
  }
  if (timelineStr) {
    payload.timeline = timelineStr
  }
  if (state.amenities && state.amenities.length > 0) {
    payload.amenities = state.amenities
  }
  if (state.petFriendly !== undefined) {
    payload.petFriendly = state.petFriendly
  }
  if (furnishingStr) {
    payload.furnishing = furnishingStr
  }
  if (state.theme) {
    payload.theme = state.theme
  }

  const empty =
    payload.locations.length === 0 &&
    payload.propertyType === null &&
    payload.bedrooms === null &&
    (!payload.bathrooms || payload.bathrooms === null) &&
    payload.budgetMin === null &&
    payload.budgetMax === null &&
    payload.purpose === null &&
    payload.timeline_days === null &&
    (!payload.amenities || payload.amenities.length === 0) &&
    !payload.petFriendly &&
    !payload.furnishing
  return empty ? undefined : payload
}

/** Server/local preferences → editable form state (for the Account editor). */
export function preferencesToForm(p: {
  locations?: string[] | null
  propertyType?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  budgetMin?: number | null
  budgetMax?: number | null
  purpose?: string | null
  timeline_days?: number | null
  timeline?: string | null
  amenities?: string[] | null
  petFriendly?: boolean | null
  furnishing?: string | null
  theme?: 'light' | 'dark' | null
} | null | undefined): PreferencesFormState {
  if (!p) return emptyPreferencesForm()
  const form: PreferencesFormState = {
    purpose: p.purpose ?? '',
    propertyType: p.propertyType ?? '',
    bedrooms: p.bedrooms !== null && p.bedrooms !== undefined ? String(p.bedrooms) : '',
    budgetMin: p.budgetMin !== null && p.budgetMin !== undefined ? String(p.budgetMin) : '',
    budgetMax: p.budgetMax !== null && p.budgetMax !== undefined ? String(p.budgetMax) : '',
    community: (p.locations ?? [])[0] ?? '',
    timelineDays: p.timeline_days !== null && p.timeline_days !== undefined ? String(p.timeline_days) : '',
  }
  if (p.bathrooms !== undefined && p.bathrooms !== null) {
    form.bathrooms = String(p.bathrooms)
  }
  if (p.timeline) {
    form.timeline = p.timeline
  }
  if (p.amenities && p.amenities.length > 0) {
    form.amenities = p.amenities
  }
  if (p.petFriendly !== undefined) {
    form.petFriendly = Boolean(p.petFriendly)
  }
  if (p.furnishing) {
    form.furnishing = p.furnishing
  }
  if (p.theme) {
    form.theme = p.theme === 'dark' ? 'dark' : 'light'
  }
  return form
}
