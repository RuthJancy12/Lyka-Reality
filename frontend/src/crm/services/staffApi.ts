// Staff role resolution + /api/staff/* client. Role comes ONLY from the
// backend (verified Firebase token -> staff_users row); the frontend never
// assigns or trusts a client-side role.

import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { auth } from '../../services/firebase'
import { authHttpStatus } from '../../services/authErrors'
import { crmFetch, clearInFlightGets } from './crmApi'

export type StaffRole = 'admin' | 'hrms_admin' | 'sales_agent' | 'salesperson' | 'sales_manager' | 'manager'

/**
 * Active employee roles offerable in the UI.
 * Exactly 3 active roles in LYKA Realty: Admin, HRMS Admin, Sales Agent.
 * Sales Manager role has been completely removed from active selection.
 */
export const ASSIGNABLE_ROLES: StaffRole[] = ['hrms_admin', 'sales_agent', 'salesperson']

export interface StaffMe {
  id: number
  email: string
  name: string
  role: StaffRole
  is_active: boolean
  manager_email: string | null
  last_login_at: string | null
  employee_id?: string | null
  department?: string | null
  designation?: string | null
  phone?: string | null
  joining_date?: string | null
  employment_status?: string | null
  salary_basic_aed?: number | null
  salary_allowances_aed?: number | null
  salary_deductions_aed?: number | null
  availability_status?: string | null
}

async function staffTokenHeader(): Promise<Record<string, string>> {
  try {
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export async function staffFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return crmFetch<T>(path, {
    ...options,
    headers: {
      ...(await staffTokenHeader()),
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
}

export interface StaffRoleState {
  me: StaffMe | null
  role: StaffRole | null
  loading: boolean
  error: string | null
  refresh: () => void
}

// Dedupe + short cache: layout, gates, and pages all resolve the role on
// mount; without this each instance fires its own GET /api/staff/me.
let meCache: { at: number; data: StaffMe } | null = null
let meInflight: Promise<StaffMe> | null = null
let refusalCache: { at: number; error: unknown } | null = null

export function clearStaffMeCache(): void {
  meCache = null
  refusalCache = null
  meInflight = null
  clearInFlightGets()
}

export function fetchStaffMe(): Promise<StaffMe> {
  const now = Date.now()
  if (meCache && now - meCache.at < 60000) return Promise.resolve(meCache.data)
  if (refusalCache && now - refusalCache.at < 300000) return Promise.reject(refusalCache.error)
  if (meInflight) return meInflight
  meInflight = staffFetch<StaffMe>('/api/staff/me').then((d) => {
    meCache = { at: Date.now(), data: d }
    refusalCache = null
    meInflight = null
    return d
  }).catch((e: unknown) => {
    meInflight = null
    if (authHttpStatus(e) === 403) {
      refusalCache = { at: Date.now(), error: e }
    }
    throw e
  })
  return meInflight
}

export interface Assignment {
  id: number
  lead_id: number
  staff_email: string
  assigned_by: string
  status: string
  created_at: string
  updated_at: string
}

export interface FollowUp {
  id: number
  lead_id: number
  staff_email: string
  note: string
  next_action_at: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
}

export interface Viewing {
  id: number
  lead_id: number
  property_ref: string
  staff_email: string
  scheduled_at: string
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CallLog {
  id: number
  lead_id: number
  staff_email: string
  staff_uid: string | null
  scheduled_at: string
  attempted_at: string | null
  connected_at: string | null
  status: string
  duration_minutes: number | null
  notes: string | null
  next_follow_up_at: string | null
  created_at: string
  updated_at: string
}

export const CALL_OUTCOMES = [
  'attempted_no_answer',
  'busy_unreachable',
  'busy',
  'connected',
  'follow_up_required',
  'callback_requested',
  'wrong_number',
  'not_interested',
  'site_visit_scheduled',
  'completed',
  'lost',
] as const

export const CALL_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Not Attempted / Scheduled',
  attempted_no_answer: 'No Answer',
  busy_unreachable: 'Busy / Unreachable',
  busy: 'Busy',
  connected: 'Connected',
  follow_up_required: 'Follow-up Required',
  callback_requested: 'Callback Requested',
  wrong_number: 'Wrong Number',
  not_interested: 'Not Interested',
  site_visit_scheduled: 'Site Visit Scheduled',
  completed: 'Completed',
  lost: 'Lost',
}

export interface SourcePerformance {
  channel: string
  leads: number
  contacted: number
  site_visits: number
  deals: number
  conversion_rate: number | null
}

export interface AgentProductivity {
  staff_email: string
  assigned: number
  open: number
  closed_assignments: number
  calls_attempted: number
  calls_connected: number
  followups: number
  followups_completed: number
  viewings_completed: number
  deals: number
}

export interface StaffAnalytics {
  role: StaffRole
  scope: { leads_visible: number; salespeople_visible: number }
  pipeline: Record<string, number>
  totals: {
    leads: number
    contacted_leads: number
    site_visits_completed: number
    deals_closed: number
    leads_lost: number
    unassigned_leads: number
    customers_total: number
    properties_total: number
  }
  conversion: {
    enquiry_to_contact_rate: number | null
    contact_to_site_visit_rate: number | null
    site_visit_to_deal_rate: number | null
    follow_up_completion_rate: number | null
    average_lead_response_minutes: number | null
    response_time_sample: number
  }
  calls: {
    scheduled: number
    attempted: number
    connected: number
    no_answer: number
    follow_up_required: number
    site_visit_scheduled: number
    completed: number
    lost: number
    connect_rate: number | null
  }
  followups: { total: number; completed: number; overdue: number }
  source_performance: SourcePerformance[]
  agent_productivity: AgentProductivity[]
  property_demand: {
    locations: Array<{ location: string; count: number }>
    property_types: Array<{ property_type: string; count: number }>
    budget_buckets: Array<{ bucket: string; count: number }>
  }
  lost_reasons: Array<{ reason: string; count: number }>
  definitions: Record<string, string>
}

export interface AuditEvent {
  id: number
  actor_email: string | null
  actor_uid: string | null
  actor_role: string | null
  action: string
  entity_type: string
  entity_id: string | null
  lead_id: number | null
  details: string | null
  created_at: string
}

export interface AuditList {
  events: AuditEvent[]
  total: number
}

export const listAssignments = (): Promise<Assignment[]> =>
  staffFetch('/api/staff/assignments')

export const createAssignment = (lead_id: number, staff_email: string, reassign?: boolean): Promise<Assignment> =>
  staffFetch('/api/staff/assignments', {
    method: 'POST',
    body: JSON.stringify({ lead_id, staff_email, reassign: !!reassign }),
  })

export const reassignLead = (lead_id: number, staff_email: string): Promise<Assignment> =>
  createAssignment(lead_id, staff_email, true)

export const updateAssignment = (id: number, status: string): Promise<Assignment> =>
  staffFetch(`/api/staff/assignments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })

export const listCalls = (lead_id?: number): Promise<CallLog[]> =>
  staffFetch(`/api/staff/calls${lead_id !== undefined ? `?lead_id=${lead_id}` : ''}`)

export interface CreateCallPayload {
  lead_id: number
  scheduled_at?: string
  status?: string
  duration_minutes?: number | null
  notes?: string | null
  next_follow_up_at?: string | null
  lead_temperature?: string | null
  lead_status?: string | null
  attempted_at?: string
  customer_response?: string | null
  recommended_action?: string | null
}

export const createCall = (
  lead_id: number,
  scheduled_at_or_payload?: string | Omit<CreateCallPayload, 'lead_id'>,
  notes?: string,
): Promise<CallLog> => {
  let body: Record<string, unknown>
  if (typeof scheduled_at_or_payload === 'object' && scheduled_at_or_payload !== null) {
    body = { ...scheduled_at_or_payload, lead_id }
  } else {
    body = {
      lead_id,
      scheduled_at: scheduled_at_or_payload || undefined,
      notes: notes || null,
    }
  }
  return staffFetch('/api/staff/calls', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export const updateCall = (
  id: number,
  data: {
    status?: string
    scheduled_at?: string
    duration_minutes?: number | null
    notes?: string | null
    next_follow_up_at?: string | null
    lead_temperature?: string | null
    lead_status?: string | null
  },
): Promise<CallLog> =>
  staffFetch(`/api/staff/calls/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const listFollowUps = (lead_id?: number): Promise<FollowUp[]> =>
  staffFetch(`/api/staff/followups${lead_id ? `?lead_id=${lead_id}` : ''}`)

export const createFollowUp = (lead_id: number, note: string, next_action_at?: string): Promise<FollowUp> =>
  staffFetch('/api/staff/followups', {
    method: 'POST',
    body: JSON.stringify({ lead_id, note, next_action_at: next_action_at || null }),
  })

export const completeFollowUp = (id: number, completed = true): Promise<FollowUp> =>
  staffFetch(`/api/staff/followups/${id}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({ completed }),
  })

export const listViewings = (): Promise<Viewing[]> =>
  staffFetch('/api/staff/viewings')

export const createViewing = (lead_id: number, property_ref: string, scheduled_at: string): Promise<Viewing> =>
  staffFetch('/api/staff/viewings', {
    method: 'POST',
    body: JSON.stringify({ lead_id, property_ref, scheduled_at }),
  })

export const updateViewing = (id: number, data: { status?: string; notes?: string; scheduled_at?: string }): Promise<Viewing> =>
  staffFetch(`/api/staff/viewings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export interface StaffListItem extends StaffMe {
  firebase_uid: string | null
  created_at: string
  updated_at: string
  invitation_link?: string | null
  message?: string | null
}

export const listStaff = (includeInactive = false, query?: string): Promise<StaffListItem[]> => {
  const params = new URLSearchParams()
  if (includeInactive) params.set('include_inactive', 'true')
  if (query) params.set('q', query)
  const qs = params.toString()
  return staffFetch(`/api/staff${qs ? `?${qs}` : ''}`)
}

export interface CreateStaffParams {
  email: string
  name: string
  role: StaffRole
  manager_email?: string | null
  password?: string | null
  department?: string | null
  designation?: string | null
  phone?: string | null
  salary_basic_aed?: number | null
  salary_allowances_aed?: number | null
}

export function createStaff(params: CreateStaffParams): Promise<StaffListItem>
export function createStaff(
  email: string,
  name: string,
  role: StaffRole,
  manager_email?: string,
  password?: string,
  department?: string,
  designation?: string
): Promise<StaffListItem>
export function createStaff(
  firstOrParams: string | CreateStaffParams,
  name?: string,
  role?: StaffRole,
  manager_email?: string,
  password?: string,
  department?: string,
  designation?: string
): Promise<StaffListItem> {
  const body =
    typeof firstOrParams === 'string'
      ? {
          email: firstOrParams,
          name,
          role,
          manager_email: manager_email || null,
          password: password || null,
          department: department || null,
          designation: designation || null,
        }
      : firstOrParams

  return staffFetch('/api/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface UpdateStaffParams {
  name?: string
  role?: StaffRole
  is_active?: boolean
  manager_email?: string | null
  department?: string | null
  designation?: string | null
  phone?: string | null
  employment_status?: string | null
  salary_basic_aed?: number | null
  salary_allowances_aed?: number | null
  salary_deductions_aed?: number | null
  availability_status?: string | null
}

export const updateStaff = (id: number, data: UpdateStaffParams): Promise<StaffListItem> =>
  staffFetch(`/api/staff/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export interface OverviewFollowUp {
  id: number
  lead_id: number
  staff_email: string
  note: string
  next_action_at: string | null
  created_at: string | null
}

export interface OverviewViewing {
  id: number
  lead_id: number
  property_ref: string
  staff_email: string
  scheduled_at: string | null
  status: string
}

export interface OverviewInquiry {
  id: number
  customer_name: string | null
  contact_email: string | null
  location: string | null
  status: string
  priority_label: string
  created_at: string | null
}

export interface OverviewPerf {
  staff_email: string
  open: number
  in_progress: number
  closed: number
  total: number
}

export interface StaffOverview {
  role: StaffRole
  leads_total: number
  assigned_leads: number
  unassigned_leads: number
  pipeline: Record<string, number>
  channel_breakdown: Record<string, number>
  followups_due_count: number
  followups_due: OverviewFollowUp[]
  upcoming_viewings: OverviewViewing[]
  recent_inquiries: OverviewInquiry[]
  team_performance: OverviewPerf[]
  staff_total?: number
  active_staff?: number
  team_members?: string[]
  team_size?: number
}

export interface StaffCustomer {
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  role: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  referrer: string | null
  discovery_source: string | null
  created_at: string | null
  updated_at: string | null
}

export const listCustomers = (): Promise<StaffCustomer[]> =>
  staffFetch('/api/staff/customers')

export const getOverview = (): Promise<StaffOverview> =>
  staffFetch('/api/staff/overview')

export const getAnalytics = (): Promise<StaffAnalytics> =>
  staffFetch('/api/staff/analytics')

export const listAudit = (params?: {
  entity_type?: string
  action?: string
  limit?: number
}): Promise<AuditList> => {
  const qs = new URLSearchParams()
  if (params?.entity_type) qs.set('entity_type', params.entity_type)
  if (params?.action) qs.set('action', params.action)
  if (params?.limit) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs}` : ''
  return staffFetch(`/api/staff/audit${suffix}`)
}

export interface SecurityAlertsSummary {
  alerts: unknown[]
  total: number
  threshold: number
}

export const getSecurityAlerts = (): Promise<SecurityAlertsSummary> =>
  staffFetch('/api/security/alerts')

export type TargetMetric =
  | 'leads'
  | 'deals_closed'
  | 'site_visits_completed'
  | 'calls_connected'
  | 'calls_attempted'

export const TARGET_METRICS: Array<{ key: TargetMetric; label: string }> = [
  { key: 'leads', label: 'New leads' },
  { key: 'deals_closed', label: 'Deals closed' },
  { key: 'site_visits_completed', label: 'Site visits completed' },
  { key: 'calls_connected', label: 'Calls connected' },
  { key: 'calls_attempted', label: 'Calls attempted' },
]

export interface Target {
  id: number
  metric: TargetMetric
  period: string
  target_value: number
  actual_value: number
  progress_pct: number | null
  updated_by: string | null
  updated_at: string
}

export const getTargets = (period?: string): Promise<Target[]> =>
  staffFetch(`/api/staff/targets${period ? `?period=${encodeURIComponent(period)}` : ''}`)

export const setTarget = (
  metric: TargetMetric, period: string, target_value: number,
): Promise<Target> =>
  staffFetch('/api/staff/targets', {
    method: 'PUT',
    body: JSON.stringify({ metric, period, target_value }),
  })

/** Resolves the signed-in user's staff role via GET /api/staff/me. Null = customer/guest. */
export function useStaffRole(): StaffRoleState {
  const { user } = useAuth()
  const [me, setMe] = useState<StaffMe | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!user) {
      clearStaffMeCache()
      setMe(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchStaffMe()
      .then((data) => {
        if (!cancelled) {
          setMe(data)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // Only 403 means "signed in, but this account is not staff".
          // 401/404/5xx/network failures must surface as an error, otherwise
          // an unavailable backend looks like a customer account and the UI
          // incorrectly tells a valid employee they have no access.
          const status = authHttpStatus(err)
          setMe(null)
          if (status === 403) {
            setError(null)
          } else {
            setError(err instanceof Error ? err.message : 'Unable to verify staff access.')
          }
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid, nonce])

  return {
    me,
    role: me?.role ?? null,
    loading,
    error,
    refresh: () => {
      clearStaffMeCache()
      setNonce((n) => n + 1)
    },
  }
}

// ─── Admin Careers & Recruitment Management ──────────────────────────────────

export interface CareerJob {
  id: number
  title: string
  department: string
  location: string
  employment_type: string
  experience_level: string
  salary_range: string | null
  description: string
  requirements: string[]
  responsibilities: string[]
  benefits: string[]
  status: 'active' | 'paused' | 'closed'
  posted_by: string | null
  applications_count: number
  created_at: string
  updated_at: string
}

export interface JobApplication {
  id: number
  job_id: number
  job_title?: string | null
  job_department?: string | null
  applicant_name: string
  applicant_email: string
  applicant_phone: string
  resume_url?: string | null
  cover_letter?: string | null
  linkedin_url?: string | null
  years_experience?: number | null
  current_company?: string | null
  status: 'received' | 'under_review' | 'shortlisted' | 'interview_scheduled' | 'selected' | 'rejected'
  notes?: string | null
  reviewed_by?: string | null
  created_at: string
  updated_at: string
}

export interface CareerStats {
  total_jobs: number
  active_jobs: number
  paused_jobs: number
  closed_jobs: number
  total_applications: number
  applications_by_status: Record<string, number>
  departments: Array<{ department: string; job_count: number }>
}

export const listCareerJobs = (params?: { status?: string; department?: string; q?: string }): Promise<CareerJob[]> => {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.department) qs.set('department', params.department)
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs}` : ''
  return staffFetch(`/api/admin/careers/jobs${suffix}`)
}

export const createCareerJob = (payload: {
  title: string
  department: string
  location?: string
  employment_type?: string
  experience_level?: string
  salary_range?: string | null
  description: string
  requirements?: string[]
  responsibilities?: string[]
  benefits?: string[]
  status: 'active' | 'paused' | 'closed'
}): Promise<CareerJob> =>
  staffFetch('/api/admin/careers/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const updateCareerJob = (
  id: number,
  payload: Partial<{
    title: string
    department: string
    location: string
    employment_type: string
    experience_level: string
    salary_range: string | null
    description: string
    requirements: string[]
    responsibilities: string[]
    benefits: string[]
    status: 'active' | 'paused' | 'closed'
  }>,
): Promise<CareerJob> =>
  staffFetch(`/api/admin/careers/jobs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })

export const updateCareerJobStatus = (id: number, status: 'active' | 'paused' | 'closed'): Promise<CareerJob> =>
  staffFetch(`/api/admin/careers/jobs/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })

export const deleteCareerJob = (id: number): Promise<void> =>
  staffFetch(`/api/admin/careers/jobs/${id}`, {
    method: 'DELETE',
  })

export const listJobApplications = (params?: { job_id?: number; status?: string; q?: string }): Promise<JobApplication[]> => {
  const qs = new URLSearchParams()
  if (params?.job_id !== undefined) qs.set('job_id', String(params.job_id))
  if (params?.status) qs.set('status', params.status)
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs}` : ''
  return staffFetch(`/api/admin/careers/applications${suffix}`)
}

export const updateJobApplicationStatus = (
  id: number,
  status: JobApplication['status'],
  notes?: string,
): Promise<JobApplication> =>
  staffFetch(`/api/admin/careers/applications/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes: notes !== undefined ? notes : null }),
  })

export const getCareerStats = (): Promise<CareerStats> =>
  staffFetch('/api/admin/careers/stats')

export const askAiAssistant = (prompt: string): Promise<{ query: string; response: string; source: string }> =>
  staffFetch('/api/staff/ai/assistant', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })


export const updateStaffMeProfile = (phone: string): Promise<StaffMe> =>
  staffFetch<StaffMe>('/api/staff/me', {
    method: 'PATCH',
    body: JSON.stringify({ phone }),
  })

export interface LeadCoverageItem {
  lead_id: number
  customer_name: string
  customer_email?: string | null
  customer_phone?: string | null
  priority_label?: string | null
  stage?: string | null
  callback_requested?: boolean
  next_followup_at?: string | null
  last_contacted_at?: string | null
  last_call_outcome?: string | null
  original_assigned_email?: string | null
  current_responsible_email?: string | null
  covering_agent_email?: string | null
  coverage_status?: string | null
  coverage_priority_rank: number
}

export interface AbsentAgentCoverage {
  staff_id: number
  email: string
  name: string
  employee_id?: string | null
  availability_status: string
  leave_start?: string | null
  leave_end?: string | null
  leave_type?: string | null
  leads: LeadCoverageItem[]
}

export interface LeadCoverageOverview {
  absent_agents: AbsentAgentCoverage[]
  unassigned_queue: LeadCoverageItem[]
  available_covering_agents: StaffListItem[]
}

export const fetchLeadCoverageOverview = (): Promise<LeadCoverageOverview> =>
  staffFetch<LeadCoverageOverview>('/api/staff/leave-coverage')

export const assignLeadCoverage = (data: {
  lead_ids: number[]
  covering_agent_email: string
  coverage_reason?: string
  coverage_end?: string
}): Promise<{ status: string; assigned_count: number; covering_agent: string }> =>
  staffFetch('/api/staff/leave-coverage/assign', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const returnLeadCoverage = (data: {
  lead_ids: number[]
  return_to_original: boolean
  notes?: string
}): Promise<{ status: string; processed_count: number; returned_to_original: boolean }> =>
  staffFetch('/api/staff/leave-coverage/return', {
    method: 'POST',
    body: JSON.stringify(data),
  })
