import type { Property } from '../types/property'

// Curated high-resolution imagery for Dubai luxury real estate
const LUXURY_IMAGES: Record<string, string[]> = {
  Villa: [
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80',
  ],
  Penthouse: [
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
  ],
  Apartment: [
    'https://images.unsplash.com/photo-1546412414-e1885259563a?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80',
  ],
  Townhouse: [
    'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1512915922686-57c11dde9b6b?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600607687644-c7171b42498f?auto=format&fit=crop&w=1200&q=80',
  ],
}

export function getPropertyImages(type: string, id: string): { primary: string; gallery: string[] } {
  const list = LUXURY_IMAGES[type] || LUXURY_IMAGES.Apartment
  const numId = parseInt(id.replace(/\D/g, '') || '1', 10)
  const primaryIdx = numId % list.length
  const primary = list[primaryIdx]

  // Pick 3-4 images for gallery
  const gallery = [
    primary,
    list[(primaryIdx + 1) % list.length],
    list[(primaryIdx + 2) % list.length],
    list[(primaryIdx + 3) % list.length],
  ]

  return { primary, gallery }
}

export function formatProperty(raw: any): Property {
  const propType = (raw.property_type || 'Apartment') as Property['property_type']
  const id = raw.property_id || `LYK-${Math.floor(Math.random() * 10000)}`
  const { primary, gallery } = getPropertyImages(propType, id)

  const amenities = Array.isArray(raw.amenities)
    ? raw.amenities
    : typeof raw.amenities === 'string' && raw.amenities
    ? raw.amenities.split('|').map((s: string) => s.trim()).filter(Boolean)
    : []

  const galleryList = Array.isArray(raw.image_gallery) && raw.image_gallery.length > 0 && raw.image_gallery[0].startsWith('http')
    ? raw.image_gallery
    : gallery

  return {
    property_id: id,
    title: raw.title || 'Luxury Dubai Property',
    listing_type: (raw.listing_type || 'Sale') as 'Sale' | 'Rent',
    property_type: propType,
    location: raw.location || 'Dubai',
    street: raw.street || '',
    bhk: Number(raw.bhk ?? 1),
    bathrooms: Number(raw.bathrooms ?? 1),
    property_size_sqft: Number(raw.property_size_sqft ?? 1000),
    price_aed: Number(raw.price_aed ?? 1000000),
    price_per_sqft_aed: Number(raw.price_per_sqft_aed ?? 1000),
    furnishing: raw.furnishing || 'Furnished',
    parking_spaces: Number(raw.parking_spaces ?? 1),
    main_road_access: raw.main_road_access || 'No',
    nearest_main_road: raw.nearest_main_road || '',
    main_road_distance_km: Number(raw.main_road_distance_km ?? 1),
    nearest_metro: raw.nearest_metro || '',
    metro_distance_km: Number(raw.metro_distance_km ?? 2),
    near_metro: Boolean(raw.near_metro),
    beach_distance_km: Number(raw.beach_distance_km ?? 5),
    near_seashore: Boolean(raw.near_seashore),
    entrance_direction: raw.entrance_direction || 'East',
    facing_direction: raw.facing_direction || 'East',
    view: raw.view || 'City View',
    amenities: amenities.length > 0 ? amenities : ['Security 24/7', 'Covered Parking', 'Swimming Pool'],
    availability: raw.availability || 'Ready',
    rent_cheques: raw.rent_cheques,
    latitude: Number(raw.latitude ?? 25.2048),
    longitude: Number(raw.longitude ?? 55.2708),
    image_url: raw.image_url && raw.image_url.startsWith('http') ? raw.image_url : primary,
    image_gallery: galleryList,
    listed_days_ago: Number(raw.listed_days_ago ?? 10),
    image_caption: raw.image_caption,
    ...(typeof raw.match_score === 'number' ? { match_score: raw.match_score } : {}),
    ...(Array.isArray(raw.match_reasons) ? { match_reasons: raw.match_reasons } : {}),
    ...(Array.isArray(raw.mismatches) ? { mismatches: raw.mismatches } : {}),
    ...((raw.is_nearby_alternative === true || raw.isNearbyAlternative === true) ? { isNearbyAlternative: true } : {}),
    ...(typeof (raw.requested_location ?? raw.nearbyRequestedLocation) === 'string' ? { nearbyRequestedLocation: (raw.requested_location ?? raw.nearbyRequestedLocation) as string } : {}),
    ...(typeof (raw.actual_location ?? raw.actualLocation) === 'string' ? { actualLocation: (raw.actual_location ?? raw.actualLocation) as string } : {})
  }
}

// Initial pre-loaded seed from the official LYKA dataset for instant zero-lag render
export const INITIAL_PROPERTIES: Property[] = [
  {
    property_id: 'LYK-00002',
    title: '3 BHK Villa on Montgomerie Drive, Emirates Hills',
    listing_type: 'Sale',
    property_type: 'Villa',
    location: 'Emirates Hills',
    street: 'Montgomerie Drive',
    bhk: 3,
    bathrooms: 4,
    property_size_sqft: 3104,
    price_aed: 12510000,
    price_per_sqft_aed: 4030,
    furnishing: 'Furnished',
    parking_spaces: 2,
    main_road_access: 'No',
    nearest_main_road: 'Sheikh Zayed Road',
    main_road_distance_km: 1.2,
    nearest_metro: 'Dubai Internet City',
    metro_distance_km: 3.6,
    near_metro: false,
    beach_distance_km: 4.6,
    near_seashore: false,
    entrance_direction: 'East',
    facing_direction: 'East',
    view: 'Golf Course View',
    amenities: ['Gym', 'BBQ Area', 'Shared Spa', 'Balcony', 'Swimming Pool', 'Beach Access', 'Covered Parking', 'Security 24/7', 'Private Garden'],
    availability: 'Q1 2029',
    latitude: 25.077266,
    longitude: 55.166453,
    image_url: LUXURY_IMAGES.Villa[0],
    image_gallery: LUXURY_IMAGES.Villa,
    listed_days_ago: 64,
    image_caption: '3 BHK villa, 3,104 sqft, 2 parking space(s), Golf Course View'
  },
  {
    property_id: 'LYK-00005',
    title: '3 BHK Luxury Waterfront Apartment, Dubai Marina',
    listing_type: 'Rent',
    property_type: 'Apartment',
    location: 'Dubai Marina',
    street: 'Al Marsa Street',
    bhk: 3,
    bathrooms: 4,
    property_size_sqft: 1902,
    price_aed: 208000,
    price_per_sqft_aed: 109,
    furnishing: 'Furnished',
    parking_spaces: 2,
    main_road_access: 'Yes',
    nearest_main_road: 'Sheikh Zayed Road',
    main_road_distance_km: 0.7,
    nearest_metro: 'DAMAC Properties',
    metro_distance_km: 0.5,
    near_metro: true,
    beach_distance_km: 0.9,
    near_seashore: true,
    entrance_direction: 'North',
    facing_direction: 'West',
    view: 'City Skyline View',
    amenities: ['Walk-in Closet', 'Study Room', 'Covered Parking', "Children's Pool", 'Gym', 'Security 24/7', 'Beach Access'],
    availability: 'Ready',
    rent_cheques: '4',
    latitude: 25.073275,
    longitude: 55.149072,
    image_url: LUXURY_IMAGES.Apartment[0],
    image_gallery: LUXURY_IMAGES.Apartment,
    listed_days_ago: 5,
    image_caption: '3 BHK apartment, 1,902 sqft, close to beach and metro'
  },
  {
    property_id: 'LYK-00015',
    title: '4 BHK Sky Penthouse, Dubai Creek Harbour',
    listing_type: 'Sale',
    property_type: 'Penthouse',
    location: 'Dubai Creek Harbour',
    street: 'Ras Al Khor Road',
    bhk: 4,
    bathrooms: 5,
    property_size_sqft: 4084,
    price_aed: 13000000,
    price_per_sqft_aed: 3183,
    furnishing: 'Furnished',
    parking_spaces: 3,
    main_road_access: 'No',
    nearest_main_road: 'Al Khail Road',
    main_road_distance_km: 1.5,
    nearest_metro: 'Creek',
    metro_distance_km: 2.9,
    near_metro: false,
    beach_distance_km: 10.5,
    near_seashore: false,
    entrance_direction: 'East',
    facing_direction: 'North-West',
    view: 'Sea View',
    amenities: ['Covered Parking', "Kids Play Area", 'Central AC', 'Shared Spa', 'Swimming Pool', 'Study Room', 'Concierge'],
    availability: 'Ready',
    latitude: 25.186343,
    longitude: 55.340523,
    image_url: LUXURY_IMAGES.Penthouse[0],
    image_gallery: LUXURY_IMAGES.Penthouse,
    listed_days_ago: 55,
    image_caption: '4 BHK penthouse, 4,084 sqft, Sea View'
  },
  {
    property_id: 'LYK-00022',
    title: '5 BHK Grand Penthouse, Downtown Dubai',
    listing_type: 'Sale',
    property_type: 'Penthouse',
    location: 'Downtown Dubai',
    street: 'Mohammed Bin Rashid Boulevard',
    bhk: 5,
    bathrooms: 6,
    property_size_sqft: 6898,
    price_aed: 23190000,
    price_per_sqft_aed: 3362,
    furnishing: 'Semi-Furnished',
    parking_spaces: 4,
    main_road_access: 'Yes',
    nearest_main_road: 'Sheikh Zayed Road',
    main_road_distance_km: 0.6,
    nearest_metro: 'Burj Khalifa/Dubai Mall',
    metro_distance_km: 1.0,
    near_metro: true,
    beach_distance_km: 10.5,
    near_seashore: false,
    entrance_direction: 'South',
    facing_direction: 'North-East',
    view: 'Burj Khalifa View',
    amenities: ['Central AC', 'Covered Parking', 'Balcony', 'Study Room', 'BBQ Area', 'Walk-in Closet', 'Smart Home'],
    availability: 'Ready',
    latitude: 25.196646,
    longitude: 55.277748,
    image_url: LUXURY_IMAGES.Penthouse[1],
    image_gallery: LUXURY_IMAGES.Penthouse,
    listed_days_ago: 45,
    image_caption: '5 BHK penthouse, 6,898 sqft, Burj Khalifa View, near Metro'
  },
  {
    property_id: 'LYK-00012',
    title: '2 BHK Premium Residence, Downtown Dubai',
    listing_type: 'Sale',
    property_type: 'Apartment',
    location: 'Downtown Dubai',
    street: 'Al Asayel Street',
    bhk: 2,
    bathrooms: 3,
    property_size_sqft: 1270,
    price_aed: 3640000,
    price_per_sqft_aed: 2866,
    furnishing: 'Semi-Furnished',
    parking_spaces: 2,
    main_road_access: 'Yes',
    nearest_main_road: 'Sheikh Zayed Road',
    main_road_distance_km: 0.5,
    nearest_metro: 'Burj Khalifa/Dubai Mall',
    metro_distance_km: 1.0,
    near_metro: true,
    beach_distance_km: 5.5,
    near_seashore: false,
    entrance_direction: 'South-East',
    facing_direction: 'South-East',
    view: 'Park View',
    amenities: ['Covered Parking', 'Beach Access', 'Sauna & Steam', 'Study Room', 'Shared Spa', 'Kids Play Area'],
    availability: 'Ready',
    latitude: 25.193158,
    longitude: 55.274065,
    image_url: LUXURY_IMAGES.Apartment[1],
    image_gallery: LUXURY_IMAGES.Apartment,
    listed_days_ago: 16,
    image_caption: '2 BHK apartment, 1,270 sqft, walkable to Metro'
  },
  {
    property_id: 'LYK-00014',
    title: '1 BHK Beachfront Retreat, Jumeirah Beach Residence',
    listing_type: 'Sale',
    property_type: 'Apartment',
    location: 'Jumeirah Beach Residence',
    street: 'Al Sufouh Road',
    bhk: 1,
    bathrooms: 1,
    property_size_sqft: 842,
    price_aed: 1780000,
    price_per_sqft_aed: 2114,
    furnishing: 'Unfurnished',
    parking_spaces: 1,
    main_road_access: 'No',
    nearest_main_road: 'Al Sufouh Road',
    main_road_distance_km: 1.1,
    nearest_metro: 'Jumeirah Lakes Towers',
    metro_distance_km: 0.8,
    near_metro: true,
    beach_distance_km: 0.1,
    near_seashore: true,
    entrance_direction: 'South-East',
    facing_direction: 'West',
    view: 'Marina View',
    amenities: ['Swimming Pool', 'Walk-in Closet', 'Sauna & Steam', 'BBQ Area', 'Smart Home', 'Gym', "Children's Pool", 'Beach Access'],
    availability: 'Ready',
    latitude: 25.088306,
    longitude: 55.130251,
    image_url: LUXURY_IMAGES.Apartment[2],
    image_gallery: LUXURY_IMAGES.Apartment,
    listed_days_ago: 65,
    image_caption: '1 BHK apartment, 842 sqft, 100m to the beach'
  },
  {
    property_id: 'LYK-00018',
    title: '6 BHK Royal Estate Villa, Mirdif',
    listing_type: 'Sale',
    property_type: 'Villa',
    location: 'Mirdif',
    street: 'Mirdif Boulevard',
    bhk: 6,
    bathrooms: 7,
    property_size_sqft: 8648,
    price_aed: 9980000,
    price_per_sqft_aed: 1154,
    furnishing: 'Furnished',
    parking_spaces: 3,
    main_road_access: 'Yes',
    nearest_main_road: 'Sheikh Mohammed Bin Zayed Road',
    main_road_distance_km: 0.8,
    nearest_metro: 'Rashidiya',
    metro_distance_km: 7.6,
    near_metro: false,
    beach_distance_km: 11.1,
    near_seashore: false,
    entrance_direction: 'South',
    facing_direction: 'North-East',
    view: 'Community View',
    amenities: ['Balcony', 'Gym', 'Smart Home', 'Walk-in Closet', 'Beach Access', "Children's Pool", 'BBQ Area', "Maid's Room", 'Private Garden', 'Covered Parking'],
    availability: 'Q1 2027',
    latitude: 25.216298,
    longitude: 55.417826,
    image_url: LUXURY_IMAGES.Villa[1],
    image_gallery: LUXURY_IMAGES.Villa,
    listed_days_ago: 68,
    image_caption: '6 BHK villa, 8,648 sqft, 3 parking spaces'
  },
  {
    property_id: 'LYK-00028',
    title: '3 BHK Contemporary Townhouse, DAMAC Hills',
    listing_type: 'Rent',
    property_type: 'Townhouse',
    location: 'DAMAC Hills',
    street: 'Golf Gate Street',
    bhk: 3,
    bathrooms: 4,
    property_size_sqft: 2429,
    price_aed: 193000,
    price_per_sqft_aed: 79,
    furnishing: 'Semi-Furnished',
    parking_spaces: 2,
    main_road_access: 'Yes',
    nearest_main_road: 'Al Qudra Road',
    main_road_distance_km: 1.0,
    nearest_metro: 'None nearby',
    metro_distance_km: 21.2,
    near_metro: false,
    beach_distance_km: 19.0,
    near_seashore: false,
    entrance_direction: 'South-West',
    facing_direction: 'South-West',
    view: 'Community View',
    amenities: ['Kids Play Area', 'Shared Spa', 'Beach Access', "Maid's Room", 'Swimming Pool', 'Security 24/7', 'Central AC', 'Private Garden', 'Covered Parking'],
    availability: 'Ready',
    rent_cheques: '1',
    latitude: 25.018177,
    longitude: 55.248099,
    image_url: LUXURY_IMAGES.Townhouse[0],
    image_gallery: LUXURY_IMAGES.Townhouse,
    listed_days_ago: 51,
    image_caption: '3 BHK townhouse, 2,429 sqft, private garden'
  }
]

// Fast CSV line parser handling quotes
function parseCSVLine(text: string): string[] {
  const result: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  result.push(cell.trim())
  return result
}

// Asynchronously load the full dataset from /lyka_dubai_properties.csv
export async function loadDubaiProperties(): Promise<Property[]> {
  try {
    const res = await fetch('/lyka_dubai_properties.csv')
    if (!res.ok) {
      return INITIAL_PROPERTIES
    }
    const text = await res.text()
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
    if (lines.length < 2) return INITIAL_PROPERTIES

    const headers = parseCSVLine(lines[0])
    const headerMap: Record<string, number> = {}
    headers.forEach((h, idx) => {
      headerMap[h.trim()] = idx
    })

    const properties: Property[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i])
      if (cols.length < 10) continue

      const id = cols[headerMap['property_id']] || `LYK-${i}`
      const propType = (cols[headerMap['property_type']] || 'Apartment') as Property['property_type']
      const { primary, gallery } = getPropertyImages(propType, id)

      const amenitiesRaw = cols[headerMap['amenities']] || ''
      const amenitiesList = amenitiesRaw ? amenitiesRaw.split('|').map(s => s.trim()).filter(Boolean) : []

      const prop: Property = {
        property_id: id,
        title: cols[headerMap['title']] || 'Luxury Dubai Property',
        listing_type: (cols[headerMap['listing_type']] || 'Sale') as 'Sale' | 'Rent',
        property_type: propType,
        location: cols[headerMap['location']] || 'Dubai',
        street: cols[headerMap['street']] || '',
        bhk: parseInt(cols[headerMap['bhk']] || '1', 10) || 0,
        bathrooms: parseInt(cols[headerMap['bathrooms']] || '1', 10) || 1,
        property_size_sqft: parseFloat(cols[headerMap['property_size_sqft']] || '1000') || 1000,
        price_aed: parseFloat(cols[headerMap['price_aed']] || '1500000') || 1500000,
        price_per_sqft_aed: parseFloat(cols[headerMap['price_per_sqft_aed']] || '1500') || 1500,
        furnishing: cols[headerMap['furnishing']] || 'Furnished',
        parking_spaces: parseInt(cols[headerMap['parking_spaces']] || '1', 10) || 1,
        main_road_access: cols[headerMap['main_road_access']] || 'Yes',
        nearest_main_road: cols[headerMap['nearest_main_road']] || '',
        main_road_distance_km: parseFloat(cols[headerMap['main_road_distance_km']] || '1.0') || 1,
        nearest_metro: cols[headerMap['nearest_metro']] || '',
        metro_distance_km: parseFloat(cols[headerMap['metro_distance_km']] || '2.0') || 2,
        near_metro: cols[headerMap['near_metro']]?.toLowerCase() === 'yes',
        beach_distance_km: parseFloat(cols[headerMap['beach_distance_km']] || '5.0') || 5,
        near_seashore: cols[headerMap['near_seashore']]?.toLowerCase() === 'yes',
        entrance_direction: cols[headerMap['entrance_direction']] || 'North',
        facing_direction: cols[headerMap['facing_direction']] || 'North',
        view: cols[headerMap['view']] || 'City View',
        amenities: amenitiesList.length > 0 ? amenitiesList : ['Security 24/7', 'Covered Parking', 'Swimming Pool', 'Central AC'],
        availability: cols[headerMap['availability']] || 'Ready',
        rent_cheques: cols[headerMap['rent_cheques']] || undefined,
        latitude: parseFloat(cols[headerMap['latitude']] || '25.2048') || 25.2048,
        longitude: parseFloat(cols[headerMap['longitude']] || '55.2708') || 55.2708,
        image_url: primary,
        image_gallery: gallery,
        listed_days_ago: parseInt(cols[headerMap['listed_days_ago']] || '10', 10) || 10,
        image_caption: cols[headerMap['image_caption']] || undefined,
      }

      properties.push(prop)
    }

    return properties.length > 0 ? properties : INITIAL_PROPERTIES
  } catch {
    return INITIAL_PROPERTIES
  }
}
