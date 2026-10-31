import { staffFetch, type StaffListItem, type StaffMe } from './staffApi'

export interface HRMSOverviewStats {
  total_employees: number
  active_employees: number
  present_today: number
  absent_today: number
  pending_leaves: number
  approved_leaves: number
  new_job_applications: number
  open_hr_requests: number
}

export interface AttendanceRecord {
  id: number
  staff_user_id: number
  staff_email: string
  staff_name?: string | null
  date: string
  check_in_time?: string | null
  check_out_time?: string | null
  total_hours: number
  status: 'present' | 'late' | 'half_day' | 'absent' | 'on_leave'
  notes?: string | null
  is_manually_corrected: boolean
  corrected_by?: string | null
  correction_reason?: string | null
  created_at: string
  updated_at: string
}

export interface LeaveBalance {
  id: number
  staff_user_id: number
  staff_email: string
  year: number
  annual_total: number
  annual_used: number
  annual_remaining: number
  sick_total: number
  sick_used: number
  sick_remaining: number
  casual_total: number
  casual_used: number
  casual_remaining: number
  unpaid_used: number
  updated_at?: string | null
}

export interface LeaveRequest {
  id: number
  staff_user_id: number
  staff_email: string
  staff_name: string
  leave_type: 'annual' | 'sick' | 'casual' | 'unpaid' | 'maternity' | 'paternity'
  start_date: string
  end_date: string
  days_count: number
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reviewer_email?: string | null
  reviewer_comments?: string | null
  reviewed_at?: string | null
  created_at: string
}

export interface PayrollRecord {
  id: number
  month: number
  year: number
  title: string
  total_employees: number
  total_gross_aed: number
  total_deductions_aed: number
  total_net_aed: number
  status: 'draft' | 'approved' | 'published'
  processed_by?: string | null
  created_at: string
  updated_at: string
}

export interface Payslip {
  id: number
  payroll_record_id: number
  staff_user_id: number
  staff_email: string
  staff_name: string
  month: number
  year: number
  basic_salary_aed: number
  allowances_aed: number
  commission_aed: number
  deductions_aed: number
  net_salary_aed: number
  status: 'draft' | 'published' | 'paid'
  payment_date?: string | null
  notes?: string | null
  created_at: string
}

export interface EmployeeDocument {
  id: number
  staff_user_id: number
  staff_email: string
  title: string
  document_type: 'passport' | 'visa' | 'emirates_id' | 'contract' | 'certificate' | 'other'
  file_url: string
  file_size_bytes: number
  expiry_date?: string | null
  is_verified: boolean
  uploaded_by?: string | null
  created_at: string
}

export interface InterviewSchedule {
  id: number
  application_id: number
  job_id: number
  applicant_name: string
  interviewer_email: string
  interviewer_name: string
  interview_date: string
  round: string
  meeting_link?: string | null
  location?: string | null
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'
  feedback?: string | null
  rating?: number | null
  created_at: string
  updated_at: string
}

export interface PerformanceReview {
  id: number
  staff_user_id: number
  staff_email: string
  reviewer_email: string
  review_period: string
  deals_closed_count: number
  revenue_generated_aed: number
  attendance_score_pct: number
  overall_rating: number
  strengths?: string | null
  areas_for_improvement?: string | null
  goals?: string | null
  status: 'draft' | 'submitted' | 'acknowledged'
  created_at: string
  updated_at: string
}

export interface HRRequestMessage {
  id: number
  request_id: number
  sender_email: string
  sender_name: string
  sender_role: string
  message: string
  attachment_url?: string | null
  created_at: string
}

export interface HRRequest {
  id: number
  ticket_number: string
  staff_user_id: number
  staff_email: string
  staff_name: string
  category: 'salary_inquiry' | 'certificate_request' | 'grievance' | 'benefits' | 'general_query'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  subject: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  assigned_to?: string | null
  created_at: string
  updated_at: string
  resolved_at?: string | null
  messages: HRRequestMessage[]
}

export interface HRNotification {
  id: number
  recipient_email: string
  recipient_role?: string | null
  title: string
  message: string
  notification_type: string
  link_url?: string | null
  is_read: boolean
  created_at: string
}

export interface HRAuditLog {
  id: number
  actor_email: string
  actor_role: string
  action: string
  entity_type: string
  entity_id?: string | null
  details: Record<string, any>
  ip_address?: string | null
  created_at: string
}

// ─── API Methods ─────────────────────────────────────────────────────────────

export const fetchHrmsOverview = (): Promise<HRMSOverviewStats> =>
  staffFetch<HRMSOverviewStats>('/api/hrms/overview')

export const fetchHrmsEmployees = (params?: {
  department?: string
  role?: string
  status?: string
  q?: string
  include_inactive?: boolean
}): Promise<StaffListItem[]> => {
  const q = new URLSearchParams()
  if (params?.department) q.set('department', params.department)
  if (params?.role) q.set('role', params.role)
  if (params?.status) q.set('status', params.status)
  if (params?.q) q.set('q', params.q)
  if (params?.include_inactive) q.set('include_inactive', 'true')
  return staffFetch<StaffListItem[]>(`/api/hrms/employees?${q.toString()}`)
}

export const fetchHrmsEmployee = (staffId: number): Promise<StaffListItem> =>
  staffFetch<StaffListItem>(`/api/hrms/employees/${staffId}`)

export const updateHrmsEmployee = (
  staffId: number,
  data: Partial<StaffListItem>
): Promise<StaffListItem> =>
  staffFetch<StaffListItem>(`/api/hrms/employees/${staffId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const fetchMyHrmsProfile = (): Promise<StaffMe> =>
  staffFetch<StaffMe>('/api/hrms/me/profile')

export const fetchTodayAttendance = (): Promise<AttendanceRecord | null> =>
  staffFetch<AttendanceRecord | null>('/api/hrms/attendance/today')

export const checkInAttendance = (notes?: string): Promise<AttendanceRecord> =>
  staffFetch<AttendanceRecord>('/api/hrms/attendance/check-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })

export const checkOutAttendance = (notes?: string): Promise<AttendanceRecord> =>
  staffFetch<AttendanceRecord>('/api/hrms/attendance/check-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })

export const fetchMyAttendanceHistory = (
  month?: number,
  year?: number
): Promise<AttendanceRecord[]> => {
  const q = new URLSearchParams()
  if (month) q.set('month', month.toString())
  if (year) q.set('year', year.toString())
  return staffFetch<AttendanceRecord[]>(`/api/hrms/attendance/my-history?${q.toString()}`)
}

export const fetchAllAttendance = (params?: {
  date?: string
  month?: number
  year?: number
  department?: string
  staff_email?: string
}): Promise<AttendanceRecord[]> => {
  const q = new URLSearchParams()
  if (params?.date) q.set('date', params.date)
  if (params?.month) q.set('month', params.month.toString())
  if (params?.year) q.set('year', params.year.toString())
  if (params?.department) q.set('department', params.department)
  if (params?.staff_email) q.set('staff_email', params.staff_email)
  return staffFetch<AttendanceRecord[]>(`/api/hrms/attendance/all?${q.toString()}`)
}

export const manualAttendanceCorrection = (data: {
  staff_email: string
  date: string
  check_in_time?: string | null
  check_out_time?: string | null
  status: string
  notes?: string | null
  correction_reason: string
}): Promise<AttendanceRecord> =>
  staffFetch<AttendanceRecord>('/api/hrms/attendance/manual-correction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const fetchMyLeaveBalance = (year = 2026): Promise<LeaveBalance> =>
  staffFetch<LeaveBalance>(`/api/hrms/leaves/balance?year=${year}`)

export const fetchMyLeaveRequests = (): Promise<LeaveRequest[]> =>
  staffFetch<LeaveRequest[]>('/api/hrms/leaves/my-requests')

export const applyForLeave = (data: {
  leave_type: string
  start_date: string
  end_date: string
  reason: string
}): Promise<LeaveRequest> =>
  staffFetch<LeaveRequest>('/api/hrms/leaves/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const fetchAllLeaves = (params?: {
  status?: string
  leave_type?: string
  year?: number
}): Promise<LeaveRequest[]> => {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.leave_type) q.set('leave_type', params.leave_type)
  if (params?.year) q.set('year', params.year.toString())
  return staffFetch<LeaveRequest[]>(`/api/hrms/leaves/all?${q.toString()}`)
}

export const actionLeaveRequest = (
  leaveId: number,
  action: 'approve' | 'reject',
  reviewerComments?: string
): Promise<LeaveRequest> =>
  staffFetch<LeaveRequest>(`/api/hrms/leaves/${leaveId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reviewer_comments: reviewerComments }),
  })

export const fetchLeavesCalendar = (
  month?: number,
  year?: number
): Promise<LeaveRequest[]> => {
  const q = new URLSearchParams()
  if (month) q.set('month', month.toString())
  if (year) q.set('year', year.toString())
  return staffFetch<LeaveRequest[]>(`/api/hrms/leaves/calendar?${q.toString()}`)
}

export const fetchPayrollRecords = (year?: number): Promise<PayrollRecord[]> => {
  const q = new URLSearchParams()
  if (year) q.set('year', year.toString())
  return staffFetch<PayrollRecord[]>(`/api/hrms/payroll/records?${q.toString()}`)
}

export const generatePayrollRun = (
  month: number,
  year: number,
  title?: string
): Promise<PayrollRecord> =>
  staffFetch<PayrollRecord>('/api/hrms/payroll/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, year, title }),
  })

export const publishPayrollRun = (recordId: number): Promise<PayrollRecord> =>
  staffFetch<PayrollRecord>(`/api/hrms/payroll/${recordId}/publish`, {
    method: 'POST',
  })

export const fetchPayrollPayslips = (recordId: number): Promise<Payslip[]> =>
  staffFetch<Payslip[]>(`/api/hrms/payroll/records/${recordId}/payslips`)

export const fetchMyPayslips = (): Promise<Payslip[]> =>
  staffFetch<Payslip[]>('/api/hrms/payroll/my-payslips')

export const fetchInterviewSchedules = (
  status?: string
): Promise<InterviewSchedule[]> => {
  const q = new URLSearchParams()
  if (status) q.set('status', status)
  return staffFetch<InterviewSchedule[]>(`/api/hrms/recruitment/interviews?${q.toString()}`)
}

export const scheduleInterview = (data: {
  application_id: number
  interview_date: string
  round: string
  meeting_link?: string
  location?: string
  interviewer_email?: string
  interviewer_name?: string
}): Promise<InterviewSchedule> =>
  staffFetch<InterviewSchedule>('/api/hrms/recruitment/interviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const updateInterviewSchedule = (
  interviewId: number,
  data: Partial<InterviewSchedule>
): Promise<InterviewSchedule> =>
  staffFetch<InterviewSchedule>(`/api/hrms/recruitment/interviews/${interviewId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const fetchPerformanceReviews = (params?: {
  period?: string
  staff_email?: string
}): Promise<PerformanceReview[]> => {
  const q = new URLSearchParams()
  if (params?.period) q.set('period', params.period)
  if (params?.staff_email) q.set('staff_email', params.staff_email)
  return staffFetch<PerformanceReview[]>(`/api/hrms/performance/reviews?${q.toString()}`)
}

export const createPerformanceReview = (data: {
  staff_email: string
  review_period: string
  deals_closed_count?: number
  revenue_generated_aed?: number
  attendance_score_pct?: number
  overall_rating: number
  strengths?: string
  areas_for_improvement?: string
  goals?: string
}): Promise<PerformanceReview> =>
  staffFetch<PerformanceReview>('/api/hrms/performance/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const fetchMyPerformanceReviews = (): Promise<PerformanceReview[]> =>
  staffFetch<PerformanceReview[]>('/api/hrms/performance/my-reviews')

export const createHRRequest = (data: {
  category: string
  priority: string
  subject: string
  message: string
}): Promise<HRRequest> =>
  staffFetch<HRRequest>('/api/hrms/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const fetchMyHRRequests = (): Promise<HRRequest[]> =>
  staffFetch<HRRequest[]>('/api/hrms/requests/my-requests')

export const fetchAllHRRequests = (params?: {
  status?: string
  priority?: string
  category?: string
}): Promise<HRRequest[]> => {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.priority) q.set('priority', params.priority)
  if (params?.category) q.set('category', params.category)
  return staffFetch<HRRequest[]>(`/api/hrms/requests/all?${q.toString()}`)
}

export const fetchHRRequestDetail = (requestId: number): Promise<HRRequest> =>
  staffFetch<HRRequest>(`/api/hrms/requests/${requestId}`)

export const replyHRRequest = (
  requestId: number,
  message: string,
  attachmentUrl?: string
): Promise<HRRequestMessage> =>
  staffFetch<HRRequestMessage>(`/api/hrms/requests/${requestId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, attachment_url: attachmentUrl }),
  })

export const updateHRRequestStatus = (
  requestId: number,
  status: string,
  assignedTo?: string
): Promise<HRRequest> =>
  staffFetch<HRRequest>(`/api/hrms/requests/${requestId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, assigned_to: assignedTo }),
  })

export const fetchMyDocuments = (): Promise<EmployeeDocument[]> =>
  staffFetch<EmployeeDocument[]>('/api/hrms/documents/my-documents')

export const uploadEmployeeDocument = (data: {
  staff_email: string
  title: string
  document_type: string
  file_url: string
  file_size_bytes?: number
  expiry_date?: string
}): Promise<EmployeeDocument> =>
  staffFetch<EmployeeDocument>('/api/hrms/documents/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const fetchAllDocuments = (params?: {
  staff_email?: string
  document_type?: string
}): Promise<EmployeeDocument[]> => {
  const q = new URLSearchParams()
  if (params?.staff_email) q.set('staff_email', params.staff_email)
  if (params?.document_type) q.set('document_type', params.document_type)
  return staffFetch<EmployeeDocument[]>(`/api/hrms/documents/all?${q.toString()}`)
}

export const fetchHRNotifications = (
  unreadOnly = false,
  limit = 50
): Promise<HRNotification[]> =>
  staffFetch<HRNotification[]>(
    `/api/hrms/notifications?unread_only=${unreadOnly ? 'true' : 'false'}&limit=${limit}`
  )

export const markHRNotificationRead = (
  notificationId: number
): Promise<HRNotification> =>
  staffFetch<HRNotification>(`/api/hrms/notifications/${notificationId}/read`, {
    method: 'POST',
  })

export const markAllHRNotificationsRead = (): Promise<{ status: string; message: string }> =>
  staffFetch<{ status: string; message: string }>('/api/hrms/notifications/read-all', {
    method: 'POST',
  })

export const fetchHRAuditLogs = (params?: {
  limit?: number
  entity_type?: string
  action?: string
}): Promise<HRAuditLog[]> => {
  const q = new URLSearchParams()
  if (params?.limit) q.set('limit', params.limit.toString())
  if (params?.entity_type) q.set('entity_type', params.entity_type)
  if (params?.action) q.set('action', params.action)
  return staffFetch<HRAuditLog[]>(`/api/hrms/audit-logs?${q.toString()}`)
}



export const cancelLeaveRequest = (leaveId: number): Promise<LeaveRequest> =>
  staffFetch<LeaveRequest>(`/api/hrms/leaves/${leaveId}/cancel`, {
    method: 'POST',
  })
