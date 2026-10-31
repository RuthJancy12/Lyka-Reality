import type { Property } from '../types/property'
import type { UserRequirements, TrackedFieldKey } from '../types/agent'

export const DUBAI_LOCATIONS = [
  'Dubai Marina',
  'Downtown Dubai',
  'Palm Jumeirah',
  'Emirates Hills',
  'Business Bay',
  'Jumeirah Beach Residence',
  'Jumeirah Lake Towers',
  'Jumeirah Village Circle',
  'Dubai Hills Estate',
  'Mohammed Bin Rashid City',
  'Dubai Creek Harbour',
  'DAMAC Hills',
  'Arabian Ranches',
  'Mirdif',
  'Meydan',
  'Dubai South',
  'Al Barsha'
]

export const INITIAL_REQUIREMENTS: UserRequirements = {
  purpose: null,
  location: null,
  propertyType: null,
  bhk: null,
  budget: null,
  timeline: null,
  nearMetro: null,
  beachfront: null,
  amenities: []
}

// Parses natural language input and updates requirement fields
export function parseUserInput(text: string, current: UserRequirements): {
  updated: UserRequirements
  changedFields: TrackedFieldKey[]
} {
  const lower = text.toLowerCase()
  const updated: UserRequirements = { ...current, amenities: [...current.amenities] }
  const changedFields: TrackedFieldKey[] = []

  // 1. Purpose: Buy vs Rent
  if (/\b(buy|purchase|invest|for sale|buying|sale)\b/.test(lower)) {
    if (updated.purpose !== 'Buy') {
      updated.purpose = 'Buy'
      changedFields.push('purpose')
    }
  } else if (/\b(rent|rental|lease|renting|annual lease)\b/.test(lower)) {
    if (updated.purpose !== 'Rent') {
      updated.purpose = 'Rent'
      changedFields.push('purpose')
    }
  }

  // 2. Property Type
  if (/\b(penthouse|sky penthouse)\b/.test(lower)) {
    if (updated.propertyType !== 'Penthouse') {
      updated.propertyType = 'Penthouse'
      changedFields.push('propertyType')
    }
  } else if (/\b(villa|mansion|estate)\b/.test(lower)) {
    if (updated.propertyType !== 'Villa') {
      updated.propertyType = 'Villa'
      changedFields.push('propertyType')
    }
  } else if (/\b(townhouse|town house)\b/.test(lower)) {
    if (updated.propertyType !== 'Townhouse') {
      updated.propertyType = 'Townhouse'
      changedFields.push('propertyType')
    }
  } else if (/\b(apartment|flat|residence|unit)\b/.test(lower)) {
    if (updated.propertyType !== 'Apartment') {
      updated.propertyType = 'Apartment'
      changedFields.push('propertyType')
    }
  }

  // 3. Location matching
  for (const loc of DUBAI_LOCATIONS) {
    const locLower = loc.toLowerCase()
    if (lower.includes(locLower)) {
      if (updated.location !== loc) {
        updated.location = loc
        changedFields.push('location')
      }
      break
    }
  }
  // Short acronym matches
  if (!updated.location) {
    if (/\b(jbr)\b/.test(lower)) {
      updated.location = 'Jumeirah Beach Residence'
      changedFields.push('location')
    } else if (/\b(jlt)\b/.test(lower)) {
      updated.location = 'Jumeirah Lake Towers'
      changedFields.push('location')
    } else if (/\b(jvc)\b/.test(lower)) {
      updated.location = 'Jumeirah Village Circle'
      changedFields.push('location')
    } else if (/\b(downtown)\b/.test(lower)) {
      updated.location = 'Downtown Dubai'
      changedFields.push('location')
    } else if (/\b(marina)\b/.test(lower)) {
      updated.location = 'Dubai Marina'
      changedFields.push('location')
    }
  }

  // 4. BHK / Bedrooms
  if (/\b(studio)\b/.test(lower)) {
    if (updated.bhk !== 0) {
      updated.bhk = 0
      changedFields.push('bhk')
    }
  } else {
    const bhkMatch = lower.match(/(\d+)[\s-]*(?:bhk|bed|bedroom|br)/)
    if (bhkMatch) {
      const num = parseInt(bhkMatch[1], 10)
      if (!isNaN(num) && updated.bhk !== num) {
        updated.bhk = num
        changedFields.push('bhk')
      }
    } else if (/\b(one|1)\s*(?:bedroom|bed)\b/.test(lower)) {
      updated.bhk = 1
      changedFields.push('bhk')
    } else if (/\b(two|2)\s*(?:bedrooms|beds)\b/.test(lower)) {
      updated.bhk = 2
      changedFields.push('bhk')
    } else if (/\b(three|3)\s*(?:bedrooms|beds)\b/.test(lower)) {
      updated.bhk = 3
      changedFields.push('bhk')
    } else if (/\b(four|4)\s*(?:bedrooms|beds)\b/.test(lower)) {
      updated.bhk = 4
      changedFields.push('bhk')
    }
  }

  // 5. Budget parsing
  if (/\b(cheaper|lower price|less expensive)\b/.test(lower) && updated.budget) {
    updated.budget = Math.round(updated.budget * 0.75)
    changedFields.push('budget')
  } else {
    // Check for millions: e.g. "2.5m", "2m", "3 million", "under 10m"
    const millionMatch = lower.match(/(?:under|below|around|max|budget of)?\s*(\d+(?:\.\d+)?)\s*(?:m|million|millions|mil)\b/)
    if (millionMatch) {
      const val = parseFloat(millionMatch[1]) * 1_000_000
      if (!isNaN(val) && updated.budget !== val) {
        updated.budget = val
        changedFields.push('budget')
      }
    } else {
      // Check for thousands: e.g. "500k", "800 k", "250,000"
      const kMatch = lower.match(/(?:under|below|around|max|budget of)?\s*(\d+(?:\.\d+)?)\s*(?:k|thousand)\b/)
      if (kMatch) {
        const val = parseFloat(kMatch[1]) * 1_000
        if (!isNaN(val) && updated.budget !== val) {
          updated.budget = val
          changedFields.push('budget')
        }
      } else {
        const directNumMatch = lower.match(/(?:under|below|around|aed|budget)\s*(\d{5,8})\b/)
        if (directNumMatch) {
          const val = parseInt(directNumMatch[1], 10)
          if (!isNaN(val) && updated.budget !== val) {
            updated.budget = val
            changedFields.push('budget')
          }
        }
      }
    }
  }

  // 6. Metro Proximity
  if (/\b(near metro|close to metro|walk to metro|metro proximity|metro accessible)\b/.test(lower)) {
    if (updated.nearMetro !== true) {
      updated.nearMetro = true
      changedFields.push('nearMetro')
    }
  }

  // 7. Beachfront / Seashore
  if (/\b(beach|beachfront|seashore|sea view|waterfront)\b/.test(lower)) {
    if (updated.beachfront !== true) {
      updated.beachfront = true
      changedFields.push('beachfront')
    }
  }

  // 8. Amenities
  const amenityMap: Record<string, string> = {
    pool: 'Swimming Pool',
    gym: 'Gym',
    balcony: 'Balcony',
    garden: 'Private Garden',
    spa: 'Shared Spa',
    parking: 'Covered Parking',
    security: 'Security 24/7',
    maid: "Maid's Room",
    view: 'Burj Khalifa View'
  }
  for (const [key, label] of Object.entries(amenityMap)) {
    if (lower.includes(key) && !updated.amenities.includes(label)) {
      updated.amenities.push(label)
      if (!changedFields.includes('amenities')) {
        changedFields.push('amenities')
      }
    }
  }

  // 9. Timeline (move-in urgency — collected for context, not a search filter)
  const timelineBuckets: Array<[RegExp, string]> = [
    [/\b(immediately|immediate|asap|as soon as possible|urgently|urgent|right away|this week|this month)\b/, 'Immediate'],
    [/within\s*(1|2|3)\s*months?|in\s*(a|1|2|3)\s*months?|(1|2|3)[\s-]*months?\b/, 'Within 3 months'],
    [/within\s*(4|5|6)\s*months?|(4|5|6)[\s-]*months?|half a year/, '3–6 months'],
    [/\b(just browsing|browsing|researching|exploring|no rush|not urgent|whenever)\b/, 'Just browsing'],
  ]
  if (updated.timeline === null) {
    for (const [re, bucket] of timelineBuckets) {
      if (re.test(lower)) {
        updated.timeline = bucket
        changedFields.push('timeline')
        break
      }
    }
  }

  return { updated, changedFields }
}

// Determines the next logical question to ask based on missing requirements
export function getNextQuestion(req: UserRequirements): {
  question: string
  field: TrackedFieldKey
  quickActions: string[]
} | null {
  // Priority 1: Purpose
  if (req.purpose === null) {
    return {
      field: 'purpose',
      question: 'Are you looking to purchase a property to own/invest, or looking to rent annually in Dubai?',
      quickActions: ['Buy a Property', 'Rent a Property', 'Investment Portfolio']
    }
  }

  // Priority 2: Location
  if (req.location === null) {
    return {
      field: 'location',
      question: 'Which Dubai community or neighborhood do you prefer?',
      quickActions: ['Dubai Marina', 'Downtown Dubai', 'Palm Jumeirah', 'Emirates Hills', 'Business Bay']
    }
  }

  // Priority 3: Property Type
  if (req.propertyType === null) {
    return {
      field: 'propertyType',
      question: 'What type of residence are you envisioning?',
      quickActions: ['Apartment', 'Villa', 'Sky Penthouse', 'Townhouse']
    }
  }

  // Priority 4: Bedrooms
  if (req.bhk === null) {
    return {
      field: 'bhk',
      question: 'How many bedrooms (BHK) will fit your lifestyle?',
      quickActions: ['Studio', '1 BHK', '2 BHK', '3 BHK', '4+ BHK']
    }
  }

  // Priority 5: Budget
  if (req.budget === null) {
    const defaultOptions = req.purpose === 'Rent'
      ? ['Under 150K AED', 'Around 250K AED', '350K+ AED', 'Flexible Budget']
      : ['Under 2M AED', '2M - 5M AED', '5M - 15M AED', 'Ultra-Luxury 15M+']
    return {
      field: 'budget',
      question: 'What is your preferred budget or investment ceiling for this property?',
      quickActions: defaultOptions
    }
  }

  // Priority 6: Metro or Beachfront preference if not specified
  if (req.nearMetro === null && req.beachfront === null) {
    return {
      field: 'nearMetro',
      question: 'Do you have a preference for walking distance to Dubai Metro or beachfront living?',
      quickActions: ['Must be near Metro (<1 km)', 'Beachfront / Sea View', 'No specific preference']
    }
  }

  return null // Sufficient info collected!
}

// Generates dynamic personalized match explanation
export function generateMatchExplanation(property: Property, req: UserRequirements): string {
  const reasons: string[] = []

  // Type & BHK match
  if (req.bhk !== null && property.bhk === req.bhk) {
    reasons.push(`Exact ${req.bhk === 0 ? 'Studio' : `${req.bhk} BHK`} configuration`)
  }
  if (req.propertyType && property.property_type === req.propertyType) {
    reasons.push(`prestigious ${property.property_type} classification`)
  }

  // Location match
  if (req.location && property.location.toLowerCase().includes(req.location.toLowerCase())) {
    reasons.push(`located in your requested enclave of ${property.location}`)
  }

  // Budget match
  if (req.budget !== null && property.price_aed <= req.budget) {
    const diff = req.budget - property.price_aed
    if (diff > 50000) {
      reasons.push(`comfortably within your budget (AED ${Math.round(diff).toLocaleString('en-US')} under ceiling)`)
    } else {
      reasons.push(`matches your exact budget ceiling`)
    }
  }

  // Metro proximity
  if (req.nearMetro && property.near_metro) {
    reasons.push(`only ${property.metro_distance_km} km to ${property.nearest_metro} Metro`)
  }

  // Beachfront
  if (req.beachfront && property.near_seashore) {
    reasons.push(`direct waterfront access (${property.beach_distance_km} km to coastline)`)
  }

  if (reasons.length === 0) {
    return `Strong match: Premium ${property.property_type} in ${property.location} with high rental yield and verified title deed.`
  }

  return `Excellent match: ${reasons.join(', ')}.`
}

// Searches the real dataset and ranks matching properties
export function findMatchingProperties(
  properties: Property[],
  req: UserRequirements
): { matches: Property[]; explanations: Record<string, string> } {
  const scored = properties.map((prop) => {
    let score = 0

    // Purpose match (Sale vs Rent)
    if (req.purpose) {
      if (req.purpose === 'Buy' && prop.listing_type === 'Sale') score += 20
      else if (req.purpose === 'Rent' && prop.listing_type === 'Rent') score += 20
      else score -= 30 // mismatch
    }

    // Location match
    if (req.location) {
      if (prop.location.toLowerCase().includes(req.location.toLowerCase())) {
        score += 35
      }
    }

    // Property Type match
    if (req.propertyType) {
      if (prop.property_type.toLowerCase() === req.propertyType.toLowerCase()) {
        score += 25
      }
    }

    // BHK match
    if (req.bhk !== null) {
      if (prop.bhk === req.bhk) {
        score += 20
      } else if (Math.abs(prop.bhk - req.bhk) === 1) {
        score += 5
      }
    }

    // Budget match
    if (req.budget !== null) {
      if (prop.price_aed <= req.budget) {
        score += 25
      } else if (prop.price_aed <= req.budget * 1.15) {
        score += 10
      } else {
        score -= 20
      }
    }

    // Metro proximity
    if (req.nearMetro && prop.near_metro) {
      score += 15
    }

    // Beachfront
    if (req.beachfront && prop.near_seashore) {
      score += 15
    }

    return { property: prop, score }
  })

  // Sort by highest score
  scored.sort((a, b) => b.score - a.score)

  // Pick top 8 matches
  const topList = scored.filter((item) => item.score > 0).slice(0, 8).map((item) => item.property)

  const explanations: Record<string, string> = {}
  topList.forEach((prop) => {
    explanations[prop.property_id] = generateMatchExplanation(prop, req)
  })

  return { matches: topList, explanations }
}
