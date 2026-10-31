import { describe, it, expect } from 'vitest'
import { formatProperty } from '../propertyData'

const BASE_RAW = {
  property_id: 'LYK-09999',
  title: 'Test Residence',
  listing_type: 'Rent',
  property_type: 'Apartment',
  location: 'Mirdif',
  street: 'Test Street',
  bhk: 1,
  bathrooms: 1,
  property_size_sqft: 800,
  price_aed: 45000,
  price_per_sqft_aed: 56,
  furnishing: 'Furnished',
  parking_spaces: 1,
  main_road_access: 'Yes',
  nearest_main_road: 'Test Road',
  main_road_distance_km: 1,
  nearest_metro: 'Test Metro',
  metro_distance_km: 2,
  near_metro: false,
  beach_distance_km: 9,
  near_seashore: false,
  entrance_direction: 'East',
  facing_direction: 'East',
  view: 'Community View',
  amenities: ['Gym'],
  availability: 'Ready',
  latitude: 25.2,
  longitude: 55.4,
  image_url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
  image_gallery: [],
  listed_days_ago: 3,
}

describe('formatProperty nearby-alternative passthrough', () => {
  it('flags backend nearby alternatives so cards render the label', () => {
    const p = formatProperty({
      ...BASE_RAW,
      is_nearby_alternative: true,
      requested_location: 'Dubai Silicon Oasis',
      actual_location: 'Mirdif',
    })
    expect(p.isNearbyAlternative).toBe(true)
    expect(p.nearbyRequestedLocation).toBe('Dubai Silicon Oasis')
    expect(p.actualLocation).toBe('Mirdif')
    // Real data untouched.
    expect(p.location).toBe('Mirdif')
    expect(p.price_aed).toBe(45000)
  })

  it('leaves exact matches unflagged', () => {
    const p = formatProperty({ ...BASE_RAW, match_score: 95, match_reasons: ['Located in Mirdif'] })
    expect(p.isNearbyAlternative).toBeUndefined()
    expect(p.match_score).toBe(95)
  })
})
