/**
 * Customer-profile validation (pure, unit-testable). Only permitted
 * self-service fields are validated here — name, phone, city/community,
 * and the self-reported discovery source. Email comes from Firebase
 * Authentication and role comes from trusted backend logic; neither is
 * ever accepted from user input.
 */
import { validateDiscoverySource } from './leadSource'

export interface CustomerProfileInput {
  name: string
  phone?: string
  city?: string
  country?: string
  /** Self-reported "How did you hear about LYKA Realty?" — optional, allowlisted. */
  discovery_source?: string | null
}

/** Returns an error message, or null when the profile is valid. */
export function validateCustomerProfile(input: CustomerProfileInput): string | null {
  if (!input.name || !input.name.trim()) {
    return 'Please enter your name.'
  }
  if (input.name.trim().length > 200) {
    return 'Name is too long (maximum 200 characters).'
  }
  const phone = (input.phone || '').trim()
  if (phone && !/^\+?[0-9\s\-()]{7,25}$/.test(phone)) {
    return 'That phone number looks invalid. Please check it and try again.'
  }
  const city = (input.city || '').trim()
  if (city.length > 100) {
    return 'City/community is too long (maximum 100 characters).'
  }
  const country = (input.country || '').trim()
  if (country.length > 100) {
    return 'Country is too long (maximum 100 characters).'
  }
  const discoveryErr = validateDiscoverySource(input.discovery_source)
  if (discoveryErr) {
    return discoveryErr
  }
  return null
}
