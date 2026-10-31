import { describe, it, expect } from 'vitest'
import {
  buildPreferencesPayload,
  preferencesToForm,
  SUPPORTED_AMENITIES,
  type PreferencesFormState,
} from '../customerPreferences'
import type { UserRequirements } from '../../types/agent'
import {
  parseUserInput,
  getNextQuestion,
  generateMatchExplanation,
  INITIAL_REQUIREMENTS,
} from '../agentEngine'
import { applyAppTheme } from '../../services/api'
import type { Property } from '../../types/property'

describe('Customer Preferences Form and Payload', () => {
  it('builds full payload including bathrooms, amenities, petFriendly, furnishing, timeline, and theme', () => {
    const form: PreferencesFormState = {
      purpose: 'Buy',
      propertyType: 'Apartment',
      bedrooms: '2',
      bathrooms: '2',
      budgetMin: '1000000',
      budgetMax: '2000000',
      community: 'Dubai Marina',
      timelineDays: '90',
      timeline: 'Within 3 months',
      amenities: ['Swimming Pool', 'Gym', 'Covered Parking'],
      petFriendly: true,
      furnishing: 'Furnished',
      theme: 'dark',
    }

    const payload = buildPreferencesPayload(form)
    expect(payload).toBeDefined()
    expect(payload?.purpose).toBe('Buy')
    expect(payload?.propertyType).toBe('Apartment')
    expect(payload?.bedrooms).toBe(2)
    expect(payload?.bathrooms).toBe(2)
    expect(payload?.budgetMin).toBe(1000000)
    expect(payload?.budgetMax).toBe(2000000)
    expect(payload?.locations).toEqual(['Dubai Marina'])
    expect(payload?.timeline_days).toBe(90)
    expect(payload?.timeline).toBe('Within 3 months')
    expect(payload?.amenities).toEqual(['Swimming Pool', 'Gym', 'Covered Parking'])
    expect(payload?.petFriendly).toBe(true)
    expect(payload?.furnishing).toBe('Furnished')
    expect(payload?.theme).toBe('dark')
  })

  it('restores extended server preferences into editable form', () => {
    const form = preferencesToForm({
      locations: ['Palm Jumeirah'],
      propertyType: 'Villa',
      bedrooms: 4,
      bathrooms: 5,
      budgetMin: 5000000,
      budgetMax: 10000000,
      purpose: 'Buy',
      timeline_days: 30,
      timeline: 'As soon as possible',
      amenities: ['Private Garden', 'Swimming Pool'],
      petFriendly: true,
      furnishing: 'Furnished',
      theme: 'dark',
    })

    expect(form.community).toBe('Palm Jumeirah')
    expect(form.propertyType).toBe('Villa')
    expect(form.bedrooms).toBe('4')
    expect(form.bathrooms).toBe('5')
    expect(form.amenities).toEqual(['Private Garden', 'Swimming Pool'])
    expect(form.petFriendly).toBe(true)
    expect(form.furnishing).toBe('Furnished')
    expect(form.theme).toBe('dark')
  })

  it('validates supported amenities list exists and contains luxury amenities', () => {
    expect(SUPPORTED_AMENITIES).toContain('Swimming Pool')
    expect(SUPPORTED_AMENITIES).toContain('Gym')
    expect(SUPPORTED_AMENITIES).toContain('Covered Parking')
    expect(SUPPORTED_AMENITIES).toContain('Balcony')
    expect(SUPPORTED_AMENITIES).toContain('Private Garden')
    expect(SUPPORTED_AMENITIES).toContain('Beach Access')
    expect(SUPPORTED_AMENITIES).toContain('Security 24/7')
  })
})

describe('WhatsApp-Style Assistant & Natural Language Requirement Extraction', () => {
  it('parses suggested message chips accurately', () => {
    // 1. "Hi, I need a 2-bedroom apartment."
    const res1 = parseUserInput('Hi, I need a 2-bedroom apartment.', INITIAL_REQUIREMENTS)
    expect(res1.updated.bhk).toBe(2)
    expect(res1.updated.propertyType).toBe('Apartment')

    // 2. "I'm looking to buy a villa."
    const res2 = parseUserInput("I'm looking to buy a villa.", INITIAL_REQUIREMENTS)
    expect(res2.updated.purpose).toBe('Buy')
    expect(res2.updated.propertyType).toBe('Villa')

    // 3. "I want to rent in Dubai Marina."
    const res3 = parseUserInput('I want to rent in Dubai Marina.', INITIAL_REQUIREMENTS)
    expect(res3.updated.purpose).toBe('Rent')
    expect(res3.updated.location).toBe('Dubai Marina')

    // 4. "My budget is AED 1–2 million."
    const res4 = parseUserInput('My budget is AED 1–2 million.', INITIAL_REQUIREMENTS)
    expect(res4.updated.budget).toBe(2000000)

    // 5. "I need a swimming pool and parking."
    const res5 = parseUserInput('I need a swimming pool and parking.', INITIAL_REQUIREMENTS)
    expect(res5.updated.amenities).toContain('Swimming Pool')
    expect(res5.updated.amenities).toContain('Covered Parking')
  })

  it('remembers already answered questions within conversation context', () => {
    // User already supplied purpose: Buy, location: Dubai Marina, propertyType: Apartment
    const current: UserRequirements = {
      ...INITIAL_REQUIREMENTS,
      purpose: 'Buy',
      location: 'Dubai Marina',
      propertyType: 'Apartment',
      bhk: null,
      budget: null,
      timeline: null,
    }

    // Next question should ask for BHK (not purpose or location!)
    const q1 = getNextQuestion(current)
    expect(q1?.field).toBe('bhk')
    expect(q1?.question).toContain('bedrooms')

    // Now user supplies BHK: 2
    const afterBhk: UserRequirements = { ...current, bhk: 2 }
    const q2 = getNextQuestion(afterBhk)
    expect(q2?.field).toBe('budget')
    expect(q2?.question).toContain('budget')

    // Now user supplies budget: 2000000
    const afterBudget: UserRequirements = { ...afterBhk, budget: 2000000, nearMetro: true }
    const q3 = getNextQuestion(afterBudget)
    // No more mandatory questions!
    expect(q3).toBeNull()
  })

  it('generates dynamic personalized match explanation for real property listings', () => {
    const mockProperty = {
      property_id: 'PROP-1234',
      title: 'Luxury 2BR Waterfront Residence',
      listing_type: 'Sale',
      property_type: 'Apartment',
      location: 'Dubai Marina',
      street: 'Marina Walk',
      bhk: 2,
      bathrooms: 2,
      property_size_sqft: 1450,
      price_aed: 1850000,
      price_per_sqft_aed: 1275,
      furnishing: 'Furnished',
      parking_spaces: 1,
      main_road_access: 'Yes',
      nearest_main_road: 'Sheikh Zayed Road',
      nearest_metro: 'DMCC',
      metro_distance_km: 0.5,
      near_metro: true,
      beach_distance_km: 0.8,
      near_seashore: true,
      view: 'Marina & Sea View',
      amenities: ['Swimming Pool', 'Gym', 'Covered Parking'],
      availability: 'Ready',
      image_url: 'https://images.example.com/prop1.jpg',
      image_gallery: [],
      image_caption: 'Balcony over Marina',
    } as unknown as Property

    const req: UserRequirements = {
      purpose: 'Buy',
      location: 'Dubai Marina',
      propertyType: 'Apartment',
      bhk: 2,
      budget: 2000000,
      timeline: 'Immediate',
      nearMetro: true,
      beachfront: true,
      amenities: ['Swimming Pool'],
    }

    const explanation = generateMatchExplanation(mockProperty, req)
    expect(explanation).toContain('Exact 2 BHK configuration')
    expect(explanation).toContain('Dubai Marina')
    expect(explanation).toContain('budget')
    expect(explanation).toContain('Metro')
  })
})

describe('Appearance and Theme Setting', () => {
  it('applies dark theme attribute and class without localStorage', () => {
    const attributes: Record<string, string> = {}
    const classes = new Set<string>()

    const origDoc = (globalThis as unknown as { document?: unknown }).document
    ;(globalThis as unknown as { document: unknown }).document = {
      documentElement: {
        setAttribute(k: string, v: string) {
          attributes[k] = v
        },
        getAttribute(k: string) {
          return attributes[k]
        },
        classList: {
          contains: (cls: string) => classes.has(cls),
          add: (cls: string) => classes.add(cls),
          remove: (cls: string) => classes.delete(cls),
        },
      },
    }

    try {
      // Dark mode is removed: applying any theme keeps Light Mode only.
      applyAppTheme('dark')
      expect(attributes['data-theme']).toBe('light')
      expect(classes.has('dark')).toBe(false)

      applyAppTheme('light')
      expect(attributes['data-theme']).toBe('light')
      expect(classes.has('dark')).toBe(false)
    } finally {
      if (origDoc !== undefined) {
        ;(globalThis as unknown as { document: unknown }).document = origDoc
      } else {
        delete (globalThis as unknown as { document?: unknown }).document
      }
    }
  })
})
