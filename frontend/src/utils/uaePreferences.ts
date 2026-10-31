/**
 * UAE Luxury Real Estate Preferences & Amenity Definitions
 * Predefined options for high-end Dubai communities, luxury amenities,
 * furnishing options, and priority classifications.
 */

export const UAE_PRIME_COMMUNITIES = [
  'Dubai Marina',
  'Palm Jumeirah',
  'Downtown Dubai',
  'Dubai Hills Estate',
  'Business Bay',
  'Jumeirah Village Circle (JVC)',
  'Arabian Ranches',
  'DIFC',
  'Bluewaters Island',
  'Dubai Creek Harbour',
  'Emirates Hills',
  'DAMAC Hills',
  'City Walk',
  'Jumeirah Beach Residence (JBR)',
  'Al Barari',
  'Sobha Hartland',
  'Jumeirah Golf Estates',
  'Meydan',
] as const

export const BATHROOM_OPTIONS = [
  { label: 'Any Bathrooms', value: null },
  { label: '1 Bath', value: 1 },
  { label: '2 Baths', value: 2 },
  { label: '3 Baths', value: 3 },
  { label: '4 Baths', value: 4 },
  { label: '5+ Baths', value: 5 },
] as const

export const FURNISHING_OPTIONS = [
  { label: 'Any Furnishing', value: '' },
  { label: 'Furnished', value: 'Furnished' },
  { label: 'Unfurnished', value: 'Unfurnished' },
  { label: 'Semi-Furnished', value: 'Semi-Furnished' },
] as const

export interface AmenityOption {
  id: string
  label: string
  icon?: string
}

export const UAE_LUXURY_AMENITIES: AmenityOption[] = [
  { id: 'swimming_pool', label: 'Swimming Pool' },
  { id: 'gym', label: 'Gym / Fitness Center' },
  { id: 'parking', label: 'Dedicated Parking' },
  { id: 'balcony', label: 'Balcony / Terrace' },
  { id: 'garden', label: 'Private Garden' },
  { id: 'security', label: '24/7 Concierge & Security' },
  { id: 'play_area', label: "Children's Play Area" },
  { id: 'pet_friendly', label: 'Pet-Friendly' },
  { id: 'sea_view', label: 'Sea View / Waterfront' },
  { id: 'smart_home', label: 'Smart Home Automation' },
]

export const LUXURY_BUDGET_PRESETS = [
  { label: 'Under 2M', min: '', max: '2000000' },
  { label: '2M – 5M', min: '2000000', max: '5000000' },
  { label: '5M – 10M', min: '5000000', max: '10000000' },
  { label: '10M – 20M', min: '10000000', max: '20000000' },
  { label: '20M+', min: '20000000', max: '' },
]
