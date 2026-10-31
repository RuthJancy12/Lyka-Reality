export interface Property {
  property_id: string
  title: string
  listing_type: 'Sale' | 'Rent'
  property_type: 'Apartment' | 'Villa' | 'Townhouse' | 'Penthouse'
  location: string
  street: string
  bhk: number
  bathrooms: number
  property_size_sqft: number
  price_aed: number
  price_per_sqft_aed: number
  furnishing: string
  parking_spaces: number
  main_road_access: string
  nearest_main_road: string
  main_road_distance_km: number
  nearest_metro: string
  metro_distance_km: number
  near_metro: boolean
  beach_distance_km: number
  near_seashore: boolean
  entrance_direction: string
  facing_direction: string
  view: string
  amenities: string[]
  availability: string
  rent_cheques?: string
  latitude: number
  longitude: number
  image_url: string
  image_gallery: string[]
  listed_days_ago: number
  image_caption?: string
  /** Backend-calculated match assessment (chat search only). Absent on grid data. */
  match_score?: number
  match_reasons?: string[]
  mismatches?: string[]
  /** Nearby-community fallback (dataset search / CRM matcher). Flags an
   * alternative from a neighbouring community, never the requested one. */
  isNearbyAlternative?: boolean
  nearbyRequestedLocation?: string
  actualLocation?: string
}

export interface PropertyFilters {
  searchQuery: string
  listingType: 'All' | 'Sale' | 'Rent'
  propertyType: string
  location: string
  minPrice: number
  maxPrice: number
  bhk: string
  nearMetroOnly: boolean
  beachfrontOnly: boolean
  sortBy: 'recommended' | 'price-asc' | 'price-desc' | 'sqft-desc' | 'newest'
}
