import { crmFetch } from './crmApi'
import { auth } from '../../services/firebase'
import { BACKEND_URL } from '../../services/api'

export interface SupportTicketMessage {
  id: number
  ticket_id: number
  sender_type: 'customer' | 'staff' | 'ai'
  sender_email: string
  sender_name: string | null
  message: string
  created_at: string
}

export interface SupportTicket {
  id: number
  ticket_number: string
  customer_email: string
  customer_name: string | null
  subject: string
  category: 'general' | 'inquiry' | 'viewing' | 'payment' | 'maintenance' | 'complaint' | 'moving_relocation' | 'property_management' | 'utility_setup' | 'partner_referral'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assigned_staff_email: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  messages: SupportTicketMessage[]
}

export interface CommissionRecord {
  id: number
  deal_id: number
  staff_email: string
  role: string
  amount_aed: number
  status: 'pending' | 'approved' | 'paid'
  approved_by: string | null
  paid_at: string | null
  created_at: string
}

export interface Deal {
  id: number
  lead_id: number | null
  property_ref: string | null
  salesperson_email: string
  customer_name: string
  customer_email: string | null
  deal_value_aed: number
  commission_rate_pct: number
  commission_amount_aed: number
  deal_stage: 'offer' | 'contract_signed' | 'payment_pending' | 'closed_won' | 'closed_lost'
  expected_close_date: string | null
  actual_close_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
  commissions: CommissionRecord[]
}

export interface LeaderboardEntry {
  staff_email: string
  staff_name: string
  deals_count: number
  total_sales_aed: number
  total_commission_aed: number
  calls_connected: number
  viewings_completed: number
  rank: number
}

export interface AppNotification {
  id: number
  recipient_email?: string | null
  recipient_user_id?: string | null
  recipient_role?: string | null
  title: string
  message: string
  category: string
  notification_type?: string | null
  related_entity_type?: string | null
  related_entity_id?: string | null
  link_url?: string | null
  action_url?: string | null
  is_read: boolean
  created_at: string
  read_at?: string | null
}

export interface NotificationPreferences {
  id?: number
  user_email: string
  user_role: string
  recommendations: boolean
  appointments: boolean
  inquiries: boolean
  followups: boolean
  announcements: boolean
  browser_push: boolean
  updated_at?: string | null
}

export interface SavedSearch {
  id: number
  customer_email: string
  title: string
  search_criteria: Record<string, unknown>
  created_at: string
}

export interface PropertyAlert {
  id: number
  customer_email: string
  alert_type: string
  criteria: Record<string, unknown>
  frequency: string
  is_active: boolean
  created_at: string
}

async function userTokenHeader(): Promise<Record<string, string>> {
  try {
    let user = auth.currentUser
    if (!user && typeof (auth as any).authStateReady === 'function') {
      try {
        await (auth as any).authStateReady()
        user = auth.currentUser
      } catch {
        // Fall back to immediate currentUser check
      }
    }
    if (!user) return {}
    const token = await user.getIdToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

// ── Support Tickets ──────────────────────────────────────────────────────────

export const listStaffTickets = (params?: {
  status?: string
  priority?: string
  category?: string
  search?: string
}): Promise<SupportTicket[]> => {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.priority) qs.set('priority', params.priority)
  if (params?.category) qs.set('category', params.category)
  if (params?.search) qs.set('search', params.search)
  return crmFetch<SupportTicket[]>(`/api/staff/tickets?${qs}`)
}

export const getStaffTicket = (id: number): Promise<SupportTicket> =>
  crmFetch<SupportTicket>(`/api/staff/tickets/${id}`)

export const updateStaffTicket = (
  id: number,
  data: { status?: string; priority?: string; assigned_staff_email?: string }
): Promise<SupportTicket> =>
  crmFetch<SupportTicket>(`/api/staff/tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const replyStaffTicket = (id: number, message: string): Promise<SupportTicketMessage> =>
  crmFetch<SupportTicketMessage>(`/api/staff/tickets/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })

export const createCustomerTicket = async (data: {
  subject: string
  category: string
  message: string
  customer_name?: string
}): Promise<SupportTicket> => {
  const headers = await userTokenHeader()
  const res = await fetch(`${BACKEND_URL}/api/customer/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to submit support ticket`)
  return res.json()
}

export const listCustomerTickets = async (): Promise<SupportTicket[]> => {
  const headers = await userTokenHeader()
  const res = await fetch(`${BACKEND_URL}/api/customer/tickets`, {
    headers: { ...headers },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load tickets`)
  return res.json()
}

export const replyCustomerTicket = async (
  id: number,
  message: string
): Promise<SupportTicketMessage> => {
  const headers = await userTokenHeader()
  const res = await fetch(`${BACKEND_URL}/api/customer/tickets/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to send message`)
  return res.json()
}

// ── Deals & Revenue ──────────────────────────────────────────────────────────

export const listDeals = (params?: { stage?: string; salesperson?: string }): Promise<Deal[]> => {
  const qs = new URLSearchParams()
  if (params?.stage) qs.set('stage', params.stage)
  if (params?.salesperson) qs.set('salesperson', params.salesperson)
  const qsStr = qs.toString()
  return crmFetch<Deal[]>(`/api/staff/deals${qsStr ? `?${qsStr}` : ''}`)
}

export const createDeal = (data: {
  lead_id?: number
  property_ref?: string
  salesperson_email?: string
  customer_name: string
  customer_email?: string
  deal_value_aed: number
  commission_rate_pct?: number
  deal_stage?: string
  expected_close_date?: string
  notes?: string
}): Promise<Deal> =>
  crmFetch<Deal>('/api/staff/deals', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateDeal = (id: number, data: Partial<Deal>): Promise<Deal> =>
  crmFetch<Deal>(`/api/staff/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const getLeaderboard = (): Promise<LeaderboardEntry[]> =>
  crmFetch<LeaderboardEntry[]>('/api/staff/deals/leaderboard')

export const updateCommissionStatus = (
  id: number,
  status: 'pending' | 'approved' | 'paid'
): Promise<CommissionRecord> =>
  crmFetch<CommissionRecord>(`/api/staff/commissions/${id}/status?status=${status}`, {
    method: 'PATCH',
  })

// ── Notifications ────────────────────────────────────────────────────────────

export const listNotifications = async (unreadOnly = false, limit = 50): Promise<AppNotification[]> => {
  const headers = await userTokenHeader()
  if (!headers.Authorization) return []
  try {
    const params = new URLSearchParams()
    if (unreadOnly) params.set('unread_only', 'true')
    if (limit) params.set('limit', String(limit))
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`${BACKEND_URL}/api/notifications${qs}`, {
      headers: { ...headers },
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export const getUnreadNotificationCount = async (): Promise<number> => {
  const headers = await userTokenHeader()
  if (!headers.Authorization) return 0
  try {
    const res = await fetch(`${BACKEND_URL}/api/notifications/unread-count`, {
      headers: { ...headers },
    })
    if (!res.ok) return 0
    const data = await res.json()
    return typeof data.unread_count === 'number' ? data.unread_count : 0
  } catch {
    return 0
  }
}

export const markNotificationRead = async (id: number): Promise<void> => {
  const headers = await userTokenHeader()
  if (!headers.Authorization) return
  try {
    await fetch(`${BACKEND_URL}/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { ...headers },
    })
  } catch {
    // ignore
  }
}

export const markAllNotificationsRead = async (): Promise<void> => {
  const headers = await userTokenHeader()
  if (!headers.Authorization) return
  try {
    await fetch(`${BACKEND_URL}/api/notifications/read-all`, {
      method: 'POST',
      headers: { ...headers },
    })
  } catch {
    // ignore
  }
}

export const getNotificationPreferences = async (): Promise<NotificationPreferences | null> => {
  const headers = await userTokenHeader()
  if (!headers.Authorization) return null
  try {
    const res = await fetch(`${BACKEND_URL}/api/notifications/preferences`, {
      headers: { ...headers },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export const updateNotificationPreferences = async (
  prefs: Partial<NotificationPreferences>
): Promise<NotificationPreferences | null> => {
  const headers = await userTokenHeader()
  if (!headers.Authorization) return null
  try {
    const res = await fetch(`${BACKEND_URL}/api/notifications/preferences`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
