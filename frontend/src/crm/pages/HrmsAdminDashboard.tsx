import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Users, UserCheck, CalendarCheck, CalendarX, Clock, CheckCircle2,
  AlertCircle, Briefcase, DollarSign, MessageSquare, ShieldCheck,
  Search, Plus, RefreshCw, Check, X, Edit3,
  Calendar, Award, Send
} from 'lucide-react'
import {
  fetchHrmsOverview, fetchHrmsEmployees, updateHrmsEmployee,
  fetchAllAttendance, manualAttendanceCorrection, fetchAllLeaves,
  actionLeaveRequest, fetchPayrollRecords,
  generatePayrollRun, publishPayrollRun, fetchPayrollPayslips,
  fetchInterviewSchedules, fetchPerformanceReviews,
  fetchAllHRRequests, fetchHRRequestDetail,
  replyHRRequest, updateHRRequestStatus, fetchHRAuditLogs,
  type HRMSOverviewStats, type AttendanceRecord, type LeaveRequest,
  type PayrollRecord, type Payslip, type InterviewSchedule,
  type PerformanceReview, type HRRequest, type HRAuditLog
} from '../services/hrmsApi'
import { createStaff, type StaffListItem } from '../services/staffApi'
import { NotificationCenter } from '../../components/NotificationCenter'

type HrmsTab = 'directory' | 'attendance' | 'leaves' | 'payroll' | 'recruitment' | 'performance' | 'requests' | 'audit'

const TAB_TO_PATH: Record<HrmsTab, string> = {
  directory: '/crm/employees',
  attendance: '/crm/attendance',
  leaves: '/crm/leaves',
  payroll: '/crm/payroll',
  recruitment: '/crm/recruitment',
  performance: '/crm/performance',
  requests: '/crm/hr-requests',
  audit: '/crm/hr-reports',
}

function resolveTabFromPathname(pathname: string): HrmsTab {
  if (pathname.includes('/attendance')) return 'attendance'
  if (pathname.includes('/leaves')) return 'leaves'
  if (pathname.includes('/payroll')) return 'payroll'
  if (pathname.includes('/recruitment') || pathname.includes('/careers')) return 'recruitment'
  if (pathname.includes('/performance')) return 'performance'
  if (pathname.includes('/documents') || pathname.includes('/hr-reports')) return 'audit'
  if (pathname.includes('/hr-requests')) return 'requests'
  return 'directory'
}

export function HrmsAdminDashboard() {
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<HrmsTab>(() => resolveTabFromPathname(location.pathname))

  useEffect(() => {
    const matched = resolveTabFromPathname(location.pathname)
    setActiveTab(matched)
  }, [location.pathname])

  const handleTabChange = (tab: HrmsTab) => {
    setActiveTab(tab)
    const targetPath = TAB_TO_PATH[tab]
    if (targetPath && location.pathname !== targetPath) {
      navigate(targetPath)
    }
  }

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<HRMSOverviewStats | null>(null)
  const [employees, setEmployees] = useState<StaffListItem[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [payrollRuns, setPayrollRuns] = useState<PayrollRecord[]>([])
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([])
  const [reviews, setReviews] = useState<PerformanceReview[]>([])
  const [hrRequests, setHrRequests] = useState<HRRequest[]>([])
  const [auditLogs, setAuditLogs] = useState<HRAuditLog[]>([])

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDept, setSelectedDept] = useState<string>('all')

  // Modals state
  const [showAddStaffModal, setShowAddStaffModal] = useState(false)
  const [showEditStaffModal, setShowEditStaffModal] = useState<StaffListItem | null>(null)
  const [showCorrectionModal, setShowCorrectionModal] = useState(false)
  const [showPayrollModal, setShowPayrollModal] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<HRRequest | null>(null)
  const [ticketReply, setTicketReply] = useState('')
  const [selectedPayrollRun, setSelectedPayrollRun] = useState<PayrollRecord | null>(null)
  const [runPayslips, setRunPayslips] = useState<Payslip[]>([])

  // Notification banners / alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(null), 5000)
    } else {
      setSuccessMsg(msg)
      setTimeout(() => setSuccessMsg(null), 5000)
    }
  }

  const loadAllData = async () => {
    setLoading(true)
    try {
      const [
        overviewRes,
        empRes,
        attRes,
        leavesRes,
        payRes,
        intRes,
        revRes,
        reqRes,
        auditRes
      ] = await Promise.all([
        fetchHrmsOverview().catch(() => null),
        fetchHrmsEmployees({ include_inactive: true }).catch(() => []),
        fetchAllAttendance().catch(() => []),
        fetchAllLeaves().catch(() => []),
        fetchPayrollRecords().catch(() => []),
        fetchInterviewSchedules().catch(() => []),
        fetchPerformanceReviews().catch(() => []),
        fetchAllHRRequests().catch(() => []),
        fetchHRAuditLogs({ limit: 100 }).catch(() => []),
      ])

      if (overviewRes) setStats(overviewRes)
      setEmployees(empRes)
      setAttendance(attRes)
      setLeaves(leavesRes)
      setPayrollRuns(payRes)
      setInterviews(intRes)
      setReviews(revRes)
      setHrRequests(reqRes)
      setAuditLogs(auditRes)
    } catch (err: any) {
      showNotification('Failed to load HRMS records. Please verify connection.', true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAllData()
  }, [])

  // Action handlers
  const handleLeaveAction = async (leaveId: number, action: 'approve' | 'reject') => {
    try {
      await actionLeaveRequest(leaveId, action, `Actioned by HRMS Director via portal`)
      showNotification(`Leave application #${leaveId} successfully ${action}d.`)
      const updated = await fetchAllLeaves()
      setLeaves(updated)
      const newStats = await fetchHrmsOverview().catch(() => null)
      if (newStats) setStats(newStats)
    } catch (err: any) {
      showNotification(err.message || 'Failed to action leave request.', true)
    }
  }

  const handlePublishPayroll = async (recordId: number) => {
    try {
      await publishPayrollRun(recordId)
      showNotification(`Payroll run published! Employees notified of payslips.`)
      const updated = await fetchPayrollRecords()
      setPayrollRuns(updated)
      if (selectedPayrollRun?.id === recordId) {
        setSelectedPayrollRun(prev => prev ? { ...prev, status: 'published' } : null)
      }
    } catch (err: any) {
      showNotification(err.message || 'Failed to publish payroll run.', true)
    }
  }

  const handleViewPayslips = async (run: PayrollRecord) => {
    setSelectedPayrollRun(run)
    try {
      const slips = await fetchPayrollPayslips(run.id)
      setRunPayslips(slips)
    } catch {
      setRunPayslips([])
    }
  }

  const handleReplyTicket = async () => {
    if (!selectedTicket || !ticketReply.trim()) return
    try {
      await replyHRRequest(selectedTicket.id, ticketReply.trim())
      const fresh = await fetchHRRequestDetail(selectedTicket.id)
      setSelectedTicket(fresh)
      setTicketReply('')
      showNotification('Reply sent successfully.')
      const allReqs = await fetchAllHRRequests()
      setHrRequests(allReqs)
    } catch (err: any) {
      showNotification(err.message || 'Failed to send reply.', true)
    }
  }

  const handleUpdateTicketStatus = async (status: string) => {
    if (!selectedTicket) return
    try {
      const updated = await updateHRRequestStatus(selectedTicket.id, status)
      setSelectedTicket(updated)
      showNotification(`Ticket status updated to ${status}.`)
      const allReqs = await fetchAllHRRequests()
      setHrRequests(allReqs)
      const newStats = await fetchHrmsOverview().catch(() => null)
      if (newStats) setStats(newStats)
    } catch (err: any) {
      showNotification(err.message || 'Failed to update ticket status.', true)
    }
  }

  // Filtered employees
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.employee_id && emp.employee_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (emp.designation && emp.designation.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesDept = selectedDept === 'all' || (emp.department && emp.department.toLowerCase() === selectedDept.toLowerCase())
    return matchesSearch && matchesDept
  })

  return (
    <div className="hrms-dashboard" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', color: '#26232B' }}>
      {/* Toast Notifications */}
      {successMsg && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          background: 'linear-gradient(135deg, #1C0A1E 0%, #3B2348 100%)',
          border: '1px solid #C6A15B', color: '#FAF7F0', padding: '12px 20px',
          borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px'
        }}>
          <CheckCircle2 size={18} color="#C6A15B" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          background: '#B91C1C', color: '#FFFFFF', padding: '12px 20px',
          borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px'
        }}>
          <AlertCircle size={18} color="#FFFFFF" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #2A0822 0%, #48132F 50%, #20081C 100%)',
        borderRadius: '16px',
        padding: '28px 32px',
        color: '#FAF7F0',
        marginBottom: '28px',
        border: '1px solid rgba(198, 161, 91, 0.3)',
        boxShadow: '0 12px 36px rgba(42, 8, 34, 0.25)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{
              background: 'rgba(198, 161, 91, 0.2)',
              color: '#E9C16E',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              border: '1px solid rgba(198, 161, 91, 0.3)'
            }}>
              Executive HRMS Portal
            </span>
            <span style={{ fontSize: '12px', color: 'rgba(250, 247, 240, 0.7)' }}>
              Dubai HQ • Downtown
            </span>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, letterSpacing: '0.02em', color: '#FAF7F0' }}>
            People & Human Capital Management
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'rgba(250, 247, 240, 0.8)' }}>
            Corporate workforce oversight, attendance tracking, leave governance, UAE payroll, and talent acquisition.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <NotificationCenter theme="dark" />
          <button
            onClick={loadAllData}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(198, 161, 91, 0.4)',
              color: '#FAF7F0',
              padding: '9px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={15} color="#E9C16E" />
            Refresh
          </button>

          <button
            onClick={() => setShowAddStaffModal(true)}
            style={{
              background: 'linear-gradient(135deg, #C6A15B 0%, #B8924B 100%)',
              border: 'none',
              color: '#1C0A1E',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(198, 161, 91, 0.3)'
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            Add Employee
          </button>
        </div>
      </div>

      {/* 8 Executive KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        {[
          { label: 'Total Employees', val: stats?.total_employees ?? employees.length, icon: Users, color: '#48132F', bg: '#F8F1F5' },
          { label: 'Active Workforce', val: stats?.active_employees ?? employees.filter(e => e.is_active).length, icon: UserCheck, color: '#15803D', bg: '#F0FDF4' },
          { label: 'Present Today', val: stats?.present_today ?? 0, icon: CalendarCheck, color: '#C6A15B', bg: '#FDFBF7' },
          { label: 'Absent Today', val: stats?.absent_today ?? 0, icon: CalendarX, color: '#DC2626', bg: '#FEF2F2' },
          { label: 'Pending Leaves', val: stats?.pending_leaves ?? leaves.filter(l => l.status === 'pending').length, icon: Clock, color: '#D97706', bg: '#FFFBEB', badge: true },
          { label: 'Approved Leaves', val: stats?.approved_leaves ?? leaves.filter(l => l.status === 'approved').length, icon: CheckCircle2, color: '#059669', bg: '#ECFDF5' },
          { label: 'New Applications', val: stats?.new_job_applications ?? 0, icon: Briefcase, color: '#7C3AED', bg: '#F5F3FF' },
          { label: 'Open HR Requests', val: stats?.open_hr_requests ?? hrRequests.filter(r => r.status !== 'closed' && r.status !== 'resolved').length, icon: MessageSquare, color: '#9333EA', bg: '#FAF5FF', badge: true },
        ].map((kpi, idx) => {
          const Icon = kpi.icon
          return (
            <div
              key={idx}
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                padding: '18px 20px',
                border: '1px solid #EAE2D5',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                background: kpi.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon size={22} color={kpi.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#746875', marginBottom: '2px' }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#26232B' }}>
                  {loading ? '—' : kpi.val}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '6px',
        borderBottom: '2px solid #EAE2D5',
        marginBottom: '24px',
        overflowX: 'auto',
        paddingBottom: '2px'
      }}>
        {[
          { id: 'directory', label: 'Employee Directory', icon: Users, count: employees.length },
          { id: 'attendance', label: 'Attendance Management', icon: Clock },
          { id: 'leaves', label: 'Leave Approvals', icon: Calendar, badge: leaves.filter(l => l.status === 'pending').length },
          { id: 'payroll', label: 'Payroll & Compensation', icon: DollarSign },
          { id: 'recruitment', label: 'Recruitment & Interviews', icon: Briefcase, count: interviews.length },
          { id: 'performance', label: 'Performance Reviews', icon: Award },
          { id: 'requests', label: 'HR Helpdesk', icon: MessageSquare, badge: hrRequests.filter(r => r.status === 'open' || r.status === 'in_progress').length },
          { id: 'audit', label: 'HR Audit Logs', icon: ShieldCheck },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 18px',
                background: isActive ? '#48132F' : 'transparent',
                color: isActive ? '#FAF7F0' : '#53345F',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                fontWeight: isActive ? 700 : 600,
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} color={isActive ? '#E9C16E' : '#53345F'} />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span style={{
                  background: isActive ? 'rgba(255,255,255,0.2)' : '#ECE5DB',
                  color: isActive ? '#FFFFFF' : '#53345F',
                  padding: '1px 7px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  {tab.count}
                </span>
              )}
              {Boolean(tab.badge) && tab.badge! > 0 && (
                <span style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  padding: '1px 7px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 800
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* TAB 1: EMPLOYEE DIRECTORY */}
      {activeTab === 'directory' && (
        <div>
          {/* Filter Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '20px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '300px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} color="#746875" style={{ position: 'absolute', left: '12px', top: '11px' }} />
                <input
                  type="text"
                  placeholder="Search by name, employee ID, email, designation..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    borderRadius: '8px',
                    border: '1px solid #D8CCB8',
                    fontSize: '13px',
                    outlineColor: '#C6A15B',
                    background: '#FFFFFF'
                  }}
                />
              </div>

              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #D8CCB8',
                  fontSize: '13px',
                  background: '#FFFFFF',
                  color: '#26232B',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Departments</option>
                <option value="Executive">Executive</option>
                <option value="Human Resources">Human Resources</option>
                <option value="Sales">Sales</option>
                <option value="Operations">Operations</option>
                <option value="Marketing">Marketing</option>
                <option value="Finance">Finance</option>
              </select>
            </div>
          </div>

          {/* Employee Directory Table */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAE2D5',
            overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.03)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5', color: '#53345F' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Emp ID</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Department</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Designation & Role</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Compensation</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No employees match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map(emp => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #F2ECE1', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #48132F 0%, #2A0822 100%)',
                            color: '#E9C16E',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '14px'
                          }}>
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#26232B' }}>{emp.name}</div>
                            <div style={{ fontSize: '12px', color: '#746875' }}>{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 700, color: '#48132F' }}>
                        {emp.employee_id || `EMP-${emp.id.toString().padStart(3, '0')}`}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          background: '#F0EAF2',
                          color: '#48132F',
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '12px'
                        }}>
                          {emp.department || 'Sales'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 600 }}>{emp.designation || 'Consultant'}</div>
                        <div style={{ fontSize: '11px', color: '#746875', textTransform: 'capitalize' }}>
                          Role: {emp.role.replace('_', ' ')}
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 700, color: '#15803D' }}>
                          AED {(emp.salary_basic_aed || 12000).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#746875' }}>
                          + Allowances: AED {(emp.salary_allowances_aed || 3000).toLocaleString()}
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: emp.is_active ? '#DCFCE7' : '#FEE2E2',
                          color: emp.is_active ? '#15803D' : '#B91C1C'
                        }}>
                          {emp.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <button
                          onClick={() => setShowEditStaffModal(emp)}
                          style={{
                            padding: '6px 12px',
                            background: '#FAF7F0',
                            border: '1px solid #D8CCB8',
                            borderRadius: '6px',
                            color: '#48132F',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Edit3 size={13} />
                          Edit Profile
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE MANAGEMENT */}
      {activeTab === 'attendance' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
                Corporate Attendance & Time Tracking
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
                Live daily log, working hours computation, and compliance auditing.
              </p>
            </div>
            <button
              onClick={() => setShowCorrectionModal(true)}
              style={{
                background: '#48132F',
                color: '#FAF7F0',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Plus size={16} />
              Manual Correction
            </button>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAE2D5',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5', color: '#53345F' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Check In</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Check Out</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Working Hours</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Notes / Audit</th>
                </tr>
              </thead>
              <tbody>
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No attendance records logged yet.
                    </td>
                  </tr>
                ) : (
                  attendance.map(att => (
                    <tr key={att.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>{att.staff_email}</td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>{att.date}</td>
                      <td style={{ padding: '14px 18px' }}>
                        {att.check_in_time ? new Date(att.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {att.check_out_time ? new Date(att.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>{att.total_hours} hrs</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: att.status === 'present' ? '#DCFCE7' : att.status === 'late' ? '#FEF3C7' : '#FEE2E2',
                          color: att.status === 'present' ? '#15803D' : att.status === 'late' ? '#B45309' : '#B91C1C'
                        }}>
                          {att.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', color: '#746875' }}>
                        {att.is_manually_corrected ? (
                          <span style={{ color: '#D97706', fontWeight: 600 }}>
                            [Corrected by {att.corrected_by}]: {att.correction_reason}
                          </span>
                        ) : (
                          att.notes || 'Normal clock-in'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LEAVE APPROVALS */}
      {activeTab === 'leaves' && (
        <div>
          <div style={{ marginBottom: '18px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
              Employee Leave Requests & Balances
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
              Review annual, sick, and casual leave applications. Balance is automatically deducted on approval.
            </p>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAE2D5',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5', color: '#53345F' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Leave Type</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Dates</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Days</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Reason</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No leave requests submitted yet.
                    </td>
                  </tr>
                ) : (
                  leaves.map(req => (
                    <tr key={req.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 700 }}>{req.staff_name}</div>
                        <div style={{ fontSize: '11px', color: '#746875' }}>{req.staff_email}</div>
                      </td>
                      <td style={{ padding: '14px 18px', textTransform: 'capitalize', fontWeight: 600 }}>
                        {req.leave_type} Leave
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>
                        {req.start_date} to {req.end_date}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>
                        {req.days_count} days
                      </td>
                      <td style={{ padding: '14px 18px', maxWidth: '240px', color: '#53345F' }}>
                        {req.reason}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: req.status === 'approved' ? '#DCFCE7' : req.status === 'pending' ? '#FEF3C7' : '#FEE2E2',
                          color: req.status === 'approved' ? '#15803D' : req.status === 'pending' ? '#B45309' : '#B91C1C'
                        }}>
                          {req.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        {req.status === 'pending' ? (
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button
                              onClick={() => handleLeaveAction(req.id, 'approve')}
                              style={{
                                background: '#15803D',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Check size={14} />
                              Approve
                            </button>
                            <button
                              onClick={() => handleLeaveAction(req.id, 'reject')}
                              style={{
                                background: '#B91C1C',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <X size={14} />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#746875' }}>
                            Reviewer: {req.reviewer_email || 'HR'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PAYROLL MANAGEMENT */}
      {activeTab === 'payroll' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
                Monthly Payroll Governance & Payslips
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
                Batch salary processing with automatic commission roll-up from closed sales deals.
              </p>
            </div>
            <button
              onClick={() => setShowPayrollModal(true)}
              style={{
                background: 'linear-gradient(135deg, #C6A15B 0%, #B8924B 100%)',
                color: '#1C0A1E',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Plus size={16} />
              Generate Monthly Run
            </button>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAE2D5',
            overflow: 'hidden',
            marginBottom: '24px'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5', color: '#53345F' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Payroll Run Title</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Period</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Employees</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Gross Total</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Net Disbursed</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payrollRuns.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No payroll runs generated yet. Click "Generate Monthly Run" to initialize.
                    </td>
                  </tr>
                ) : (
                  payrollRuns.map(run => (
                    <tr key={run.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#48132F' }}>
                        {run.title}
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>
                        {run.year}-{run.month.toString().padStart(2, '0')}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600 }}>
                        {run.total_employees} staff
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        AED {run.total_gross_aed.toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#15803D' }}>
                        AED {run.total_net_aed.toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: run.status === 'published' ? '#DCFCE7' : '#FEF3C7',
                          color: run.status === 'published' ? '#15803D' : '#B45309'
                        }}>
                          {run.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            onClick={() => handleViewPayslips(run)}
                            style={{
                              background: '#FAF7F0',
                              border: '1px solid #D8CCB8',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            View Payslips
                          </button>
                          {run.status !== 'published' && (
                            <button
                              onClick={() => handlePublishPayroll(run.id)}
                              style={{
                                background: '#15803D',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Publish Run
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Payslip details subview */}
          {selectedPayrollRun && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '2px solid #C6A15B',
              padding: '24px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#48132F' }}>
                    Payslips for {selectedPayrollRun.title}
                  </h4>
                  <div style={{ fontSize: '12px', color: '#746875' }}>
                    {runPayslips.length} employee payslips generated
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPayrollRun(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <X size={18} color="#746875" />
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Employee</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Basic</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Allowances</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Deal Commission</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Deductions</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Net Disbursed</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runPayslips.map(ps => (
                      <tr key={ps.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>
                          {ps.staff_name} <span style={{ color: '#746875', fontWeight: 400 }}>({ps.staff_email})</span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>AED {ps.basic_salary_aed.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px' }}>AED {ps.allowances_aed.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', color: '#C6A15B', fontWeight: 700 }}>AED {ps.commission_aed.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', color: '#DC2626' }}>AED {ps.deductions_aed.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', color: '#15803D', fontWeight: 800 }}>AED {ps.net_salary_aed.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 700,
                            background: ps.status === 'published' ? '#DCFCE7' : '#FEF3C7',
                            color: ps.status === 'published' ? '#15803D' : '#B45309'
                          }}>
                            {ps.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: RECRUITMENT & INTERVIEWS */}
      {activeTab === 'recruitment' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
                Hiring Pipeline & Candidate Interviews
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
                Scheduled candidate interviews, evaluation scoring, and hiring status updates.
              </p>
            </div>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAE2D5',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5', color: '#53345F' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Candidate</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Interview Date</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Round</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Interviewer</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Meeting Location</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {interviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No interviews currently scheduled.
                    </td>
                  </tr>
                ) : (
                  interviews.map(inv => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#26232B' }}>
                        {inv.applicant_name}
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>
                        {new Date(inv.interview_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '14px 18px', textTransform: 'capitalize', fontWeight: 600 }}>
                        {inv.round.replace('_', ' ')}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div>{inv.interviewer_name}</div>
                        <div style={{ fontSize: '11px', color: '#746875' }}>{inv.interviewer_email}</div>
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px' }}>
                        {inv.meeting_link ? (
                          <a href={inv.meeting_link} target="_blank" rel="noreferrer" style={{ color: '#48132F', fontWeight: 700 }}>
                            Join Google Meet
                          </a>
                        ) : (
                          inv.location || 'LYKA Downtown HQ'
                        )}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: inv.status === 'completed' ? '#DCFCE7' : inv.status === 'scheduled' ? '#EFF6FF' : '#FEE2E2',
                          color: inv.status === 'completed' ? '#15803D' : inv.status === 'scheduled' ? '#1D4ED8' : '#B91C1C'
                        }}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: PERFORMANCE REVIEWS */}
      {activeTab === 'performance' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
                Employee Performance Evaluations & Scorecards
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
                Quarterly sales quota attainment, revenue closed, and attendance scoring.
              </p>
            </div>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAE2D5',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5', color: '#53345F' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Period</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Deals Closed</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Revenue Generated</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Attendance Score</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Overall Rating</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Key Strengths</th>
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No performance reviews recorded yet.
                    </td>
                  </tr>
                ) : (
                  reviews.map(rev => (
                    <tr key={rev.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>{rev.staff_email}</td>
                      <td style={{ padding: '14px 18px', fontWeight: 600 }}>{rev.review_period}</td>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>{rev.deals_closed_count} deals</td>
                      <td style={{ padding: '14px 18px', color: '#15803D', fontWeight: 700 }}>
                        AED {rev.revenue_generated_aed.toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>
                        {rev.attendance_score_pct}%
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          background: '#FEF3C7',
                          color: '#B45309',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 800,
                          fontSize: '12px'
                        }}>
                          ★ {rev.overall_rating.toFixed(1)} / 5.0
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#53345F', fontSize: '12px', maxWidth: '200px' }}>
                        {rev.strengths || 'Strong client relations'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: HR HELPDESK & REQUESTS */}
      {activeTab === 'requests' && (
        <div>
          <div style={{ marginBottom: '18px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
              Employee Helpdesk & Personnel Inquiries
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
              Salary certificate requests, grievances, benefits questions, and HR resolution threads.
            </p>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAE2D5',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5', color: '#53345F' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Ticket #</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Category</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Subject</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Priority</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {hrRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No HR tickets currently open.
                    </td>
                  </tr>
                ) : (
                  hrRequests.map(req => (
                    <tr key={req.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 700, color: '#48132F' }}>
                        {req.ticket_number}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 700 }}>{req.staff_name}</div>
                        <div style={{ fontSize: '11px', color: '#746875' }}>{req.staff_email}</div>
                      </td>
                      <td style={{ padding: '14px 18px', textTransform: 'capitalize' }}>
                        {req.category.replace('_', ' ')}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600, color: '#26232B' }}>
                        {req.subject}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: req.priority === 'urgent' ? '#FEE2E2' : req.priority === 'high' ? '#FFEDD5' : '#F3F4F6',
                          color: req.priority === 'urgent' ? '#B91C1C' : req.priority === 'high' ? '#C2410C' : '#4B5563'
                        }}>
                          {req.priority}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: req.status === 'resolved' ? '#DCFCE7' : req.status === 'open' ? '#EFF6FF' : '#FEF3C7',
                          color: req.status === 'resolved' ? '#15803D' : req.status === 'open' ? '#1D4ED8' : '#B45309'
                        }}>
                          {req.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <button
                          onClick={async () => {
                            const fresh = await fetchHRRequestDetail(req.id)
                            setSelectedTicket(fresh)
                          }}
                          style={{
                            background: '#48132F',
                            color: '#FAF7F0',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          View Thread
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Ticket detail & Reply Modal */}
          {selectedTicket && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(28, 10, 30, 0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '650px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                border: '1px solid #C6A15B'
              }}>
                {/* Header */}
                <div style={{
                  background: 'linear-gradient(135deg, #48132F 0%, #2A0822 100%)',
                  padding: '18px 24px',
                  color: '#FAF7F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#E9C16E', textTransform: 'uppercase', fontWeight: 700 }}>
                      Ticket #{selectedTicket.ticket_number} • {selectedTicket.category.replace('_', ' ')}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, marginTop: '2px' }}>
                      {selectedTicket.subject}
                    </div>
                  </div>
                  <button onClick={() => setSelectedTicket(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#FAF7F0' }}>
                    <X size={20} />
                  </button>
                </div>

                {/* Status Controls */}
                <div style={{
                  padding: '12px 24px',
                  background: '#FAF7F0',
                  borderBottom: '1px solid #EAE2D5',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ fontSize: '12px', color: '#746875' }}>
                    Initiated by <strong>{selectedTicket.staff_name}</strong> ({selectedTicket.staff_email})
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {selectedTicket.status !== 'resolved' && (
                      <button
                        onClick={() => handleUpdateTicketStatus('resolved')}
                        style={{
                          background: '#15803D', color: '#FFFFFF', border: 'none',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        Mark Resolved
                      </button>
                    )}
                    {selectedTicket.status !== 'in_progress' && selectedTicket.status !== 'resolved' && (
                      <button
                        onClick={() => handleUpdateTicketStatus('in_progress')}
                        style={{
                          background: '#D97706', color: '#FFFFFF', border: 'none',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        Set In Progress
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages Thread */}
                <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {selectedTicket.messages.map(msg => (
                    <div
                      key={msg.id}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        background: msg.sender_role === 'hrms_admin' || msg.sender_role === 'admin' ? '#F4EFF7' : '#FAF7F0',
                        border: '1px solid #EAE2D5',
                        alignSelf: msg.sender_role === 'hrms_admin' || msg.sender_role === 'admin' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '12px', color: '#48132F' }}>
                          {msg.sender_name} ({msg.sender_role.replace('_', ' ')})
                        </span>
                        <span style={{ fontSize: '10px', color: '#746875' }}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#26232B', whiteSpace: 'pre-wrap' }}>
                        {msg.message}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply Form */}
                <div style={{ padding: '16px 20px', borderTop: '1px solid #EAE2D5', display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    placeholder="Type official HR reply..."
                    value={ticketReply}
                    onChange={e => setTicketReply(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleReplyTicket()}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #D8CCB8',
                      fontSize: '13px',
                      outlineColor: '#C6A15B'
                    }}
                  />
                  <button
                    onClick={handleReplyTicket}
                    style={{
                      background: '#48132F',
                      color: '#FAF7F0',
                      border: 'none',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Send size={14} color="#E9C16E" />
                    Reply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 8: HR AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div>
          <div style={{ marginBottom: '18px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
              HR Operational Audit Trail
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
              Immutable compliance activity log tracking salary changes, leave approvals, and employee profile updates.
            </p>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAE2D5',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5', color: '#53345F' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Actor</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Action</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Entity</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No audit records logged yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontSize: '12px', color: '#746875' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ fontWeight: 700 }}>{log.actor_email}</span>
                        <span style={{ fontSize: '11px', color: '#746875', display: 'block' }}>Role: {log.actor_role}</span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          background: '#F0EAF2',
                          color: '#48132F',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '11px',
                          textTransform: 'uppercase'
                        }}>
                          {log.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600 }}>
                        {log.entity_type} #{log.entity_id || '—'}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', color: '#53345F', maxWidth: '300px' }}>
                        {JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL ATTENDANCE CORRECTION */}
      {showCorrectionModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(28, 10, 30, 0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              try {
                await manualAttendanceCorrection({
                  staff_email: String(fd.get('staff_email')),
                  date: String(fd.get('date')),
                  status: String(fd.get('status')),
                  correction_reason: String(fd.get('correction_reason')),
                })
                showNotification('Attendance corrected successfully!')
                setShowCorrectionModal(false)
                const freshAtt = await fetchAllAttendance()
                setAttendance(freshAtt)
              } catch (err: any) {
                showNotification(err.message || 'Failed to correct attendance.', true)
              }
            }}
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              border: '1px solid #C6A15B'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#48132F' }}>
                Manual Attendance Correction
              </h3>
              <button type="button" onClick={() => setShowCorrectionModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Employee</label>
                <select name="staff_email" required style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                  {employees.map(e => (
                    <option key={e.id} value={e.email}>{e.name} ({e.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Date</label>
                <input type="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Status</label>
                <select name="status" required style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                  <option value="present">Present (Full Day)</option>
                  <option value="late">Late Arrival</option>
                  <option value="half_day">Half Day</option>
                  <option value="absent">Absent</option>
                  <option value="on_leave">On Approved Leave</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Correction Reason (Mandatory Audit)</label>
                <textarea name="correction_reason" required minLength={3} placeholder="Provide official justification for audit..." rows={3} style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8', fontSize: '13px' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowCorrectionModal(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #D8CCB8', background: '#FAF7F0', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: '#48132F', color: '#FAF7F0', fontWeight: 700, cursor: 'pointer' }}>Apply Correction</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: GENERATE MONTHLY PAYROLL RUN */}
      {showPayrollModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(28, 10, 30, 0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const month = parseInt(String(fd.get('month')), 10)
              const year = parseInt(String(fd.get('year')), 10)
              const title = String(fd.get('title'))
              try {
                await generatePayrollRun(month, year, title)
                showNotification(`Payroll run for ${year}-${month} generated in Draft status!`)
                setShowPayrollModal(false)
                const freshRuns = await fetchPayrollRecords()
                setPayrollRuns(freshRuns)
              } catch (err: any) {
                showNotification(err.message || 'Failed to generate payroll run.', true)
              }
            }}
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              border: '1px solid #C6A15B'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#48132F' }}>
                Generate Monthly Payroll Run
              </h3>
              <button type="button" onClick={() => setShowPayrollModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Month</label>
                  <select name="month" defaultValue={new Date().getMonth() + 1} style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2026, i, 1).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Year</label>
                  <input type="number" name="year" defaultValue={2026} min={2024} max={2035} style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Payroll Title</label>
                <input type="text" name="title" defaultValue={`LYKA Corporate Payroll — ${new Date().toLocaleString('default', { month: 'short' })} 2026`} style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowPayrollModal(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #D8CCB8', background: '#FAF7F0', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #C6A15B 0%, #B8924B 100%)', color: '#1C0A1E', fontWeight: 700, cursor: 'pointer' }}>Generate Run</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EDIT EMPLOYEE PROFILE */}
      {showEditStaffModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(28, 10, 30, 0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              try {
                await updateHrmsEmployee(showEditStaffModal.id, {
                  name: String(fd.get('name')),
                  department: String(fd.get('department')),
                  designation: String(fd.get('designation')),
                  phone: String(fd.get('phone')),
                  salary_basic_aed: parseFloat(String(fd.get('salary_basic_aed'))) || 12000,
                  salary_allowances_aed: parseFloat(String(fd.get('salary_allowances_aed'))) || 3000,
                  is_active: fd.get('is_active') === 'true',
                })
                showNotification('Employee record updated successfully!')
                setShowEditStaffModal(null)
                const fresh = await fetchHrmsEmployees({ include_inactive: true })
                setEmployees(fresh)
              } catch (err: any) {
                showNotification(err.message || 'Failed to update employee.', true)
              }
            }}
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '500px',
              padding: '24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              border: '1px solid #C6A15B'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#48132F' }}>
                  Edit Employee Record
                </h3>
                <div style={{ fontSize: '12px', color: '#746875' }}>
                  {showEditStaffModal.email}
                </div>
              </div>
              <button type="button" onClick={() => setShowEditStaffModal(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Full Name</label>
                <input type="text" name="name" defaultValue={showEditStaffModal.name} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Department</label>
                  <select name="department" defaultValue={showEditStaffModal.department || 'Sales'} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                    <option value="Executive">Executive</option>
                    <option value="Human Resources">Human Resources</option>
                    <option value="Sales">Sales</option>
                    <option value="Operations">Operations</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Designation</label>
                  <input type="text" name="designation" defaultValue={showEditStaffModal.designation || 'Consultant'} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Phone Number</label>
                <input type="text" name="phone" defaultValue={showEditStaffModal.phone || ''} placeholder="+971 50 123 4567" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Basic Salary (AED)</label>
                  <input type="number" name="salary_basic_aed" defaultValue={showEditStaffModal.salary_basic_aed || 12000} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Allowances (AED)</label>
                  <input type="number" name="salary_allowances_aed" defaultValue={showEditStaffModal.salary_allowances_aed || 3000} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Account Status</label>
                <select name="is_active" defaultValue={showEditStaffModal.is_active ? 'true' : 'false'} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                  <option value="true">Active Staff</option>
                  <option value="false">Deactivated (Archived)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowEditStaffModal(null)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #D8CCB8', background: '#FAF7F0', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: '#48132F', color: '#FAF7F0', fontWeight: 700, cursor: 'pointer' }}>Save Changes</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD NEW EMPLOYEE */}
      {showAddStaffModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(28, 10, 30, 0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              try {
                await createStaff({
                  name: String(fd.get('name')),
                  email: String(fd.get('email')),
                  role: String(fd.get('role')) as any,
                  department: String(fd.get('department')),
                  designation: String(fd.get('designation')),
                  phone: String(fd.get('phone')),
                  salary_basic_aed: parseFloat(String(fd.get('salary_basic_aed'))) || 12000,
                  salary_allowances_aed: parseFloat(String(fd.get('salary_allowances_aed'))) || 3000,
                })
                showNotification('New employee created and leave balance initialized!')
                setShowAddStaffModal(false)
                const fresh = await fetchHrmsEmployees({ include_inactive: true })
                setEmployees(fresh)
              } catch (err: any) {
                showNotification(err.message || 'Failed to create employee.', true)
              }
            }}
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '500px',
              padding: '24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              border: '1px solid #C6A15B'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#48132F' }}>
                Add New Employee
              </h3>
              <button type="button" onClick={() => setShowAddStaffModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Full Name</label>
                <input type="text" name="name" required placeholder="e.g. Layla Al-Mansoor" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Corporate Email</label>
                <input type="email" name="email" required placeholder="layla@lyka.ae" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Role</label>
                  <select name="role" defaultValue="sales_agent" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                    <option value="sales_agent">Sales Agent</option>
                    <option value="hrms_admin">HRMS Admin</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Department</label>
                  <select name="department" defaultValue="Sales" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                    <option value="Sales">Sales</option>
                    <option value="Human Resources">Human Resources</option>
                    <option value="Executive">Executive</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Operations">Operations</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Designation</label>
                <input type="text" name="designation" defaultValue="Luxury Property Consultant" required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Phone Number</label>
                <input type="text" name="phone" placeholder="+971 50 123 4567" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Basic Salary (AED)</label>
                  <input type="number" name="salary_basic_aed" defaultValue={12000} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Allowances (AED)</label>
                  <input type="number" name="salary_allowances_aed" defaultValue={3000} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowAddStaffModal(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #D8CCB8', background: '#FAF7F0', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #C6A15B 0%, #B8924B 100%)', color: '#1C0A1E', fontWeight: 700, cursor: 'pointer' }}>Create Employee</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
