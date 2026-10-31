// Advertising analytics client. All figures come from the authenticated
// /api/property-analytics/* endpoints (SQL aggregates over real events) —
// there are deliberately no client-side estimates or demo fallbacks here.

import { staffFetch } from './staffApi'

export type AdRangeKey = 'today' | 'week' | 'month' | 'custom'

export interface AdRangeInfo {
  key: AdRangeKey
  start: string
  end: string
}

export interface AdMetrics {
  impressions: number
  views: number
  unique_views: number
  enquiries: number
  whatsapp_clicks: number
  site_visits: number
  bookings: number
}

export interface AdsOverview {
  active_listings: number
  new_listings_this_month: number
  listings_published_in_range: number
  impressions: number
  views: number
  unique_views: number
  enquiries: number
  whatsapp_clicks: number
  site_visits: number
  bookings: number
  enquiry_conversion_rate: number | null
  range: AdRangeInfo
}

export interface AdRow {
  property_ref: string
  source: 'dataset' | 'crm'
  title: string
  location: string
  project: string | null
  property_type: string
  listing_type: string
  bedrooms: number | null
  bathrooms: number | null
  size_sqft: number | null
  price_aed: number
  availability: string | null
  image_url: string | null
  is_active: boolean
  published_at: string
  metrics: AdMetrics
}

export interface AdList {
  total: number
  page: number
  per_page: number
  pages: number
  sort: string
  range: AdRangeInfo
  items: AdRow[]
}

export interface AdFilterOptions {
  locations: string[]
  projects: string[]
  property_types: string[]
  availabilities: string[]
  listing_types: string[]
}

export interface AdQuery {
  range: AdRangeKey
  start?: string
  end?: string
  page?: number
  per_page?: number
  search?: string
  location?: string
  project?: string
  property_type?: string
  listing_type?: string
  availability?: string
  min_price?: number
  max_price?: number
  is_active?: boolean
  sort?: string
}

function toQueryString(params: AdQuery): string {
  const qs = new URLSearchParams()
  qs.set('range', params.range)
  if (params.range === 'custom') {
    if (params.start) qs.set('start', params.start)
    if (params.end) qs.set('end', params.end)
  }
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  if (params.search?.trim()) qs.set('search', params.search.trim())
  if (params.location) qs.set('location', params.location)
  if (params.project) qs.set('project', params.project)
  if (params.property_type) qs.set('property_type', params.property_type)
  if (params.listing_type) qs.set('listing_type', params.listing_type)
  if (params.availability) qs.set('availability', params.availability)
  if (params.min_price != null) qs.set('min_price', String(params.min_price))
  if (params.max_price != null) qs.set('max_price', String(params.max_price))
  if (params.is_active != null) qs.set('is_active', String(params.is_active))
  if (params.sort) qs.set('sort', params.sort)
  return qs.toString()
}

export const getAdsOverview = (params: AdQuery): Promise<AdsOverview> =>
  staffFetch<AdsOverview>(`/api/property-analytics/overview?${toQueryString(params)}`)

export const listAds = (params: AdQuery): Promise<AdList> =>
  staffFetch<AdList>(`/api/property-analytics/ads?${toQueryString(params)}`)

export const getAdFilterOptions = (): Promise<AdFilterOptions> =>
  staffFetch<AdFilterOptions>('/api/property-analytics/filters')

export const setAdActive = (propertyRef: string, isActive: boolean): Promise<{ property_ref: string; is_active: boolean }> =>
  staffFetch(`/api/property-analytics/ads/${encodeURIComponent(propertyRef)}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  })
