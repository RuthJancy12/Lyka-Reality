// Contact Center & Call Monitoring API client
// Connects to /api/staff/contact-center/* with staff authentication

import { staffFetch } from './staffApi'
import { auth } from '../../services/firebase'
import { BACKEND_URL } from '../../services/api'

export interface ContactCenterSummary {
  total_leads: number
  contacted_leads: number
  not_contacted_leads: number
  connected_leads: number
  not_connected_leads: number
  pending_followups: number
  calls_today: number
  connected_today: number
  connection_rate: number
  avg_duration_minutes: number
  sla_breaches_count: number
  sla_threshold_hours: number
}

export interface ContactItem {
  lead_id: number
  customer_name: string
  contact_email: string
  contact_phone: string
  location: string
  property_type: string
  property_ref?: string
  budget_min?: number | null
  budget_max?: number | null
  purpose?: string
  lead_temperature: string
  status: string
  lead_source?: string
  created_at: string | null
  assigned_to?: { email: string | null; name: string } | null
  total_call_attempts: number
  first_call_status?: string | null
  first_call_date?: string | null
  last_contacted_date?: string | null
  is_connected: boolean
  last_call?: {
    id: number
    status: string
    attempted_at: string | null
    duration_minutes: number | null
    notes: string | null
  } | null
  next_follow_up_at?: string | null
  sla_hours_elapsed: number
  sla_breached: boolean
}

export interface ContactsListResponse {
  total: number
  page: number
  limit: number
  total_pages: number
  contacts: ContactItem[]
}

export interface DailyCallItem {
  id: number
  lead_id: number
  customer_name: string
  contact_phone: string
  contact_email?: string
  staff_email: string
  staff_name: string
  status: string
  attempt_number: number
  is_first_call: boolean
  duration_minutes: number | null
  attempted_at: string | null
  notes: string | null
  customer_response: string | null
  recommended_action: string | null
  next_follow_up_at?: string | null
  is_connected: boolean
}

export interface DailyHistoryResponse {
  total_calls: number
  calls: DailyCallItem[]
}

export interface PerformanceItem {
  staff_email: string
  staff_name: string
  role: string
  total_assigned: number
  calls_attempted: number
  calls_connected: number
  connection_rate: number
  follow_ups_completed: number
  avg_duration_minutes: number
  sla_breaches: number
  sla_compliance_rate: number
}

export interface PerformanceResponse {
  results: PerformanceItem[]
}

export interface LeadDetailsResponse {
  lead: {
    id: number
    customer_name: string
    contact_email: string
    contact_phone: string
    location: string
    property_type: string
    property_ref?: string
    purpose?: string
    budget_min?: number | null
    budget_max?: number | null
    bedrooms?: number | null
    bathrooms?: number | null
    amenities?: string[]
    lead_temperature?: string
    status?: string
    lead_source?: string
    raw_enquiry_text?: string | null
    discovery_source?: string | null
    created_at?: string | null
    assigned_to?: { email: string | null; name: string } | null
  }
  stats: {
    total_calls: number
    connected_calls: number
    open_followups: number
    viewings_count: number
  }
  first_call?: {
    date: string | null
    status: string | null
    outcome: string | null
    notes: string | null
    duration_minutes?: number | null
  } | null
  latest_call?: {
    date: string | null
    status: string | null
    outcome: string | null
    notes: string | null
    customer_response: string | null
    recommended_action: string | null
    duration_minutes?: number | null
  } | null
  next_recommended_action?: string
  timeline: Array<{
    type: 'call' | 'follow_up' | 'viewing' | 'activity'
    time: string | null
    title: string
    is_connected?: boolean
    details: Record<string, any>
  }>
}

export interface SlaConfig {
  threshold_hours: number
}

export interface ListContactsParams {
  tab?: 'all' | 'connected' | 'not_connected' | 'not_contacted' | 'follow_up'
  search?: string
  temperature?: string
  staff_email?: string
  sla_breached_only?: boolean
  page?: number
  limit?: number
  sort_by?: string
}

export interface DailyHistoryParams {
  staffEmail?: string
  limit?: number
  page?: number
  date_preset?: 'today' | 'yesterday' | 'this_week' | 'this_month'
  start_date?: string
  end_date?: string
  status?: string
}

export interface LogCallParams {
  lead_id: number
  status: string
  attempted_at?: string
  duration_minutes?: number | null
  notes?: string | null
  customer_response?: string | null
  recommended_action?: string | null
  next_follow_up_at?: string | null
  lead_temperature?: string | null
  lead_status?: string | null
}

export async function getContactCenterSummary(): Promise<ContactCenterSummary> {
  return staffFetch<ContactCenterSummary>('/api/staff/contact-center/summary')
}

export async function listContacts(params: ListContactsParams = {}): Promise<ContactsListResponse> {
  const q = new URLSearchParams()
  if (params.tab) q.set('tab', params.tab)
  if (params.search) q.set('search', params.search)
  if (params.temperature) q.set('temperature', params.temperature)
  if (params.staff_email) q.set('staff_email', params.staff_email)
  if (params.sla_breached_only) q.set('sla_breached_only', 'true')
  if (params.page) q.set('page', String(params.page))
  if (params.limit) q.set('limit', String(params.limit))
  if (params.sort_by) q.set('sort_by', params.sort_by)

  const qs = q.toString()
  return staffFetch<ContactsListResponse>(`/api/staff/contact-center/contacts${qs ? `?${qs}` : ''}`)
}

export async function getDailyCallHistory(
  paramsOrEmail?: DailyHistoryParams | string,
  limitArg = 50,
): Promise<DailyHistoryResponse> {
  const q = new URLSearchParams()

  if (typeof paramsOrEmail === 'string') {
    if (paramsOrEmail) q.set('staff_email', paramsOrEmail)
    if (limitArg) q.set('limit', String(limitArg))
  } else if (typeof paramsOrEmail === 'object' && paramsOrEmail !== null) {
    if (paramsOrEmail.staffEmail) q.set('staff_email', paramsOrEmail.staffEmail)
    if (paramsOrEmail.limit) q.set('limit', String(paramsOrEmail.limit))
    if (paramsOrEmail.page) q.set('page', String(paramsOrEmail.page))
    if (paramsOrEmail.date_preset) q.set('date_preset', paramsOrEmail.date_preset)
    if (paramsOrEmail.start_date) q.set('start_date', paramsOrEmail.start_date)
    if (paramsOrEmail.end_date) q.set('end_date', paramsOrEmail.end_date)
    if (paramsOrEmail.status) q.set('status', paramsOrEmail.status)
  } else {
    q.set('limit', String(limitArg))
  }

  const qs = q.toString()
  return staffFetch<DailyHistoryResponse>(`/api/staff/contact-center/daily-history${qs ? `?${qs}` : ''}`)
}

export async function getPerformanceComparison(): Promise<PerformanceResponse> {
  return staffFetch<PerformanceResponse>('/api/staff/contact-center/performance')
}

export async function getLeadDetails(leadId: number): Promise<LeadDetailsResponse> {
  return staffFetch<LeadDetailsResponse>(`/api/staff/contact-center/lead/${leadId}/details`)
}

export async function getSlaConfig(): Promise<SlaConfig> {
  return staffFetch<SlaConfig>('/api/staff/contact-center/sla')
}

export async function updateSlaConfig(thresholdHours: number): Promise<SlaConfig> {
  return staffFetch<SlaConfig>('/api/staff/contact-center/sla', {
    method: 'PUT',
    body: JSON.stringify({ threshold_hours: thresholdHours }),
  })
}

export async function logContactCall(payload: LogCallParams): Promise<any> {
  return staffFetch('/api/staff/calls', {
    method: 'POST',
    body: JSON.stringify({
      lead_id: payload.lead_id,
      attempted_at: payload.attempted_at || new Date().toISOString(),
      status: payload.status,
      duration_minutes: payload.duration_minutes ?? null,
      notes: payload.notes || null,
      customer_response: payload.customer_response || null,
      recommended_action: payload.recommended_action || null,
      next_follow_up_at: payload.next_follow_up_at || null,
      lead_temperature: payload.lead_temperature || null,
      lead_status: payload.lead_status || null,
    }),
  })
}

export async function downloadContactsCsv(params: ListContactsParams = {}): Promise<void> {
  const q = new URLSearchParams()
  if (params.tab) q.set('tab', params.tab)
  if (params.search) q.set('search', params.search)
  if (params.temperature) q.set('temperature', params.temperature)
  if (params.staff_email) q.set('staff_email', params.staff_email)
  if (params.sla_breached_only) q.set('sla_breached_only', 'true')

  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(`${BACKEND_URL}/api/staff/contact-center/export?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    throw new Error(`Export failed with HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lyka-contacts-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
