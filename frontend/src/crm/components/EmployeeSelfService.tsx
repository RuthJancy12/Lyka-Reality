import { useState, useEffect } from 'react'
import {
  User, Clock, Calendar, DollarSign, Award, MessageSquare,
  FileText, CheckCircle2, AlertCircle, Plus, Send, X
} from 'lucide-react'
import {
  fetchMyHrmsProfile, fetchTodayAttendance, checkInAttendance,
  checkOutAttendance, fetchMyAttendanceHistory, fetchMyLeaveBalance,
  fetchMyLeaveRequests, applyForLeave, fetchMyPayslips,
  fetchMyPerformanceReviews, createHRRequest, fetchMyHRRequests,
  fetchHRRequestDetail, replyHRRequest, fetchMyDocuments,
  type AttendanceRecord, type LeaveBalance,
  type LeaveRequest, type Payslip, type PerformanceReview,
  type HRRequest, type EmployeeDocument
} from '../services/hrmsApi'
import type { StaffMe } from '../services/staffApi'

interface EmployeeSelfServiceProps {
  initialTab?: 'profile' | 'attendance' | 'leaves' | 'payslips' | 'performance' | 'requests' | 'documents'
}

function formatWorkingHours(inTime?: string | null, outTime?: string | null): string {
  if (!inTime || !outTime) return ''
  const diffMs = new Date(outTime).getTime() - new Date(inTime).getTime()
  if (diffMs <= 0) return '0h 0m'
  const totalMins = Math.floor(diffMs / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${h}h ${m}m`
}

export function EmployeeSelfService({ initialTab = 'profile' }: EmployeeSelfServiceProps) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [profile, setProfile] = useState<StaffMe | null>(null)
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null)
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([])
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null)
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [reviews, setReviews] = useState<PerformanceReview[]>([])
  const [hrRequests, setHrRequests] = useState<HRRequest[]>([])
  const [documents, setDocuments] = useState<EmployeeDocument[]>([])
  const [, setLoading] = useState(true)

  // Modals state
  const [showApplyLeaveModal, setShowApplyLeaveModal] = useState(false)
  const [showNewRequestModal, setShowNewRequestModal] = useState(false)
    const [selectedTicket, setSelectedTicket] = useState<HRRequest | null>(null)
  const [ticketReply, setTicketReply] = useState('')
  const [checkInNotes, setCheckInNotes] = useState('')

  // Notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const notify = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(null), 5000)
    } else {
      setSuccessMsg(msg)
      setTimeout(() => setSuccessMsg(null), 5000)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [
        profRes,
        todayAttRes,
        attHistRes,
        balRes,
        reqsRes,
        slipsRes,
        revsRes,
        hrRes,
        docsRes
      ] = await Promise.all([
        fetchMyHrmsProfile().catch(() => null),
        fetchTodayAttendance().catch(() => null),
        fetchMyAttendanceHistory().catch(() => []),
        fetchMyLeaveBalance().catch(() => null),
        fetchMyLeaveRequests().catch(() => []),
        fetchMyPayslips().catch(() => []),
        fetchMyPerformanceReviews().catch(() => []),
        fetchMyHRRequests().catch(() => []),
        fetchMyDocuments().catch(() => []),
      ])

      setProfile(profRes)
      setTodayAttendance(todayAttRes)
      setAttendanceHistory(attHistRes)
      setLeaveBalance(balRes)
      setLeaveRequests(reqsRes)
      setPayslips(slipsRes)
      setReviews(revsRes)
      setHrRequests(hrRes)
      setDocuments(docsRes)
    } catch {
      notify('Could not load all employee self-service records.', true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Attendance Clock-in / Clock-out
  const handleClockIn = async () => {
    try {
      const rec = await checkInAttendance(checkInNotes || undefined)
      setTodayAttendance(rec)
      notify('Clocked in successfully!')
      const hist = await fetchMyAttendanceHistory()
      setAttendanceHistory(hist)
      setCheckInNotes('')
    } catch (err: any) {
      notify(err.message || 'Clock in failed.', true)
    }
  }

  const handleClockOut = async () => {
    try {
      const rec = await checkOutAttendance()
      setTodayAttendance(rec)
      notify(`Clocked out! Total hours: ${rec.total_hours} hrs.`)
      const hist = await fetchMyAttendanceHistory()
      setAttendanceHistory(hist)
    } catch (err: any) {
      notify(err.message || 'Clock out failed.', true)
    }
  }

  // Reply to HR ticket
  const handleReplyTicket = async () => {
    if (!selectedTicket || !ticketReply.trim()) return
    try {
      await replyHRRequest(selectedTicket.id, ticketReply.trim())
      const fresh = await fetchHRRequestDetail(selectedTicket.id)
      setSelectedTicket(fresh)
      setTicketReply('')
      notify('Reply sent to HR.')
      const allReqs = await fetchMyHRRequests()
      setHrRequests(allReqs)
    } catch (err: any) {
      notify(err.message || 'Failed to send message.', true)
    }
  }

  return (
    <div className="employee-self-service" style={{ color: '#26232B' }}>
      {/* Toast Alerts */}
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

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '6px',
        borderBottom: '2px solid #EAE2D5',
        marginBottom: '20px',
        overflowX: 'auto',
        paddingBottom: '2px'
      }}>
        {[
          { id: 'profile', label: 'My Profile', icon: User },
          { id: 'attendance', label: 'My Attendance', icon: Clock },
          { id: 'leaves', label: 'Leave Applications', icon: Calendar },
          { id: 'payslips', label: 'My Payslips', icon: DollarSign },
          { id: 'performance', label: 'My Performance', icon: Award },
          { id: 'requests', label: 'My HR Requests', icon: MessageSquare, badge: hrRequests.filter(r => r.status === 'open' || r.status === 'in_progress').length },
          { id: 'documents', label: 'My Documents', icon: FileText },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: isActive ? '#48132F' : 'transparent',
                color: isActive ? '#FAF7F0' : '#53345F',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                fontWeight: isActive ? 700 : 600,
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={15} color={isActive ? '#E9C16E' : '#53345F'} />
              <span>{tab.label}</span>
              {Boolean(tab.badge) && tab.badge! > 0 && (
                <span style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 800
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* TAB 1: PROFILE */}
      {activeTab === 'profile' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #EAE2D5',
          padding: '28px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #48132F 0%, #2A0822 100%)',
              color: '#E9C16E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '24px',
              border: '2px solid #C6A15B'
            }}>
              {profile?.name?.charAt(0).toUpperCase() || 'S'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#26232B' }}>
                  {profile?.name || 'Sales Agent'}
                </h3>
                <span style={{
                  background: '#F0EAF2',
                  color: '#48132F',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase'
                }}>
                  {profile?.role?.replace('_', ' ') || 'Sales Agent'}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: '#746875', marginTop: '4px' }}>
                {profile?.designation || 'Luxury Property Consultant'} • {profile?.department || 'Sales Department'}
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            background: '#FAF7F0',
            padding: '20px',
            borderRadius: '10px',
            border: '1px solid #EAE2D5'
          }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#746875', textTransform: 'uppercase' }}>Employee ID</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#48132F', fontFamily: 'monospace', marginTop: '2px' }}>
                {profile?.employee_id || 'EMP-003'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#746875', textTransform: 'uppercase' }}>Corporate Email</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#26232B', marginTop: '2px' }}>
                {profile?.email}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#746875', textTransform: 'uppercase' }}>Contact Phone</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#26232B', marginTop: '2px' }}>
                {profile?.phone || '+971 50 123 4567'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#746875', textTransform: 'uppercase' }}>Employment Status</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#15803D', marginTop: '2px' }}>
                {profile?.employment_status?.replace('_', ' ').toUpperCase() || 'FULL TIME'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#746875', textTransform: 'uppercase' }}>Base Salary</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#15803D', marginTop: '2px' }}>
                AED {(profile?.salary_basic_aed || 12000).toLocaleString()}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#746875', textTransform: 'uppercase' }}>Housing & Transport Allowances</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#C6A15B', marginTop: '2px' }}>
                AED {(profile?.salary_allowances_aed || 3000).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div>
          {/* Clock-in / Clock-out card */}
          <div style={{
            background: 'linear-gradient(135deg, #2A0822 0%, #48132F 100%)',
            borderRadius: '14px',
            padding: '24px 28px',
            color: '#FAF7F0',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '20px',
            border: '1px solid rgba(198, 161, 91, 0.3)'
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#E9C16E', textTransform: 'uppercase', fontWeight: 700 }}>
                Today's Attendance Status
              </div>
              <h3 style={{ margin: '4px 0 6px', fontSize: '22px', fontWeight: 800 }}>
                {!todayAttendance?.check_in_time
                  ? 'Not Clocked In'
                  : todayAttendance.check_out_time
                  ? `Completed Day — ${formatWorkingHours(todayAttendance.check_in_time, todayAttendance.check_out_time)} worked`
                  : `Clocked In at ${new Date(todayAttendance.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </h3>
              <div style={{ fontSize: '13px', color: 'rgba(250, 247, 240, 0.8)' }}>
                {todayAttendance?.check_in_time && `Check In: ${new Date(todayAttendance.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                {todayAttendance?.check_out_time && ` • Check Out: ${new Date(todayAttendance.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                {todayAttendance?.total_hours ? ` • Total: ${todayAttendance.total_hours} hrs` : ''}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {!todayAttendance?.check_in_time && (
                <button
                  onClick={handleClockIn}
                  style={{
                    background: 'linear-gradient(135deg, #C6A15B 0%, #B8924B 100%)',
                    color: '#1C0A1E',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(198, 161, 91, 0.3)'
                  }}
                >
                  Clock In Now
                </button>
              )}

              {todayAttendance?.check_in_time && !todayAttendance?.check_out_time && (
                <button
                  onClick={handleClockOut}
                  style={{
                    background: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)'
                  }}
                >
                  Clock Out (End Day)
                </button>
              )}
            </div>
          </div>

          {/* Attendance History */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAE2D5',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #EAE2D5', fontWeight: 700, fontSize: '15px' }}>
              Attendance History (Past 30 Days)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #EAE2D5', color: '#53345F' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Check In</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Check Out</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Working Hours</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {attendanceHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: '#746875' }}>
                      No prior attendance history recorded.
                    </td>
                  </tr>
                ) : (
                  attendanceHistory.map(att => (
                    <tr key={att.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '12px 18px', fontFamily: 'monospace', fontWeight: 600 }}>{att.date}</td>
                      <td style={{ padding: '12px 18px' }}>
                        {att.check_in_time ? new Date(att.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        {att.check_out_time ? new Date(att.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '12px 18px', fontWeight: 700 }}>{formatWorkingHours(att.check_in_time, att.check_out_time) || `${att.total_hours} hrs`}</td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: att.status === 'present' ? '#DCFCE7' : att.status === 'late' ? '#FEF3C7' : '#FEE2E2',
                          color: att.status === 'present' ? '#15803D' : att.status === 'late' ? '#B45309' : '#B91C1C'
                        }}>
                          {att.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px', fontSize: '12px', color: '#746875' }}>
                        {att.is_manually_corrected ? `[Corrected]: ${att.correction_reason}` : (att.notes || '—')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LEAVES */}
      {activeTab === 'leaves' && (
        <div>
          {/* Leave Balances Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #EAE2D5' }}>
              <div style={{ fontSize: '12px', color: '#746875', fontWeight: 600 }}>Annual Leave Balance</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#48132F', margin: '4px 0' }}>
                {leaveBalance?.annual_remaining ?? 30} days
              </div>
              <div style={{ fontSize: '11px', color: '#746875' }}>
                Used: {leaveBalance?.annual_used ?? 0} / Total: {leaveBalance?.annual_total ?? 30} days
              </div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #EAE2D5' }}>
              <div style={{ fontSize: '12px', color: '#746875', fontWeight: 600 }}>Sick Leave Balance</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#15803D', margin: '4px 0' }}>
                {leaveBalance?.sick_remaining ?? 15} days
              </div>
              <div style={{ fontSize: '11px', color: '#746875' }}>
                Used: {leaveBalance?.sick_used ?? 0} / Total: {leaveBalance?.sick_total ?? 15} days
              </div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #EAE2D5' }}>
              <div style={{ fontSize: '12px', color: '#746875', fontWeight: 600 }}>Casual Leave Balance</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#C6A15B', margin: '4px 0' }}>
                {leaveBalance?.casual_remaining ?? 7} days
              </div>
              <div style={{ fontSize: '11px', color: '#746875' }}>
                Used: {leaveBalance?.casual_used ?? 0} / Total: {leaveBalance?.casual_total ?? 7} days
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#48132F' }}>
              My Leave Requests
            </h4>
            <button
              onClick={() => setShowApplyLeaveModal(true)}
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
                gap: '6px'
              }}
            >
              <Plus size={16} />
              Apply for Leave
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
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Dates</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Days</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Reason</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Reviewer Remarks</th>
                </tr>
              </thead>
              <tbody>
                {leaveRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: '#746875' }}>
                      No leave applications submitted.
                    </td>
                  </tr>
                ) : (
                  leaveRequests.map(req => (
                    <tr key={req.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '12px 18px', fontWeight: 700, textTransform: 'capitalize' }}>
                        {req.leave_type} Leave
                      </td>
                      <td style={{ padding: '12px 18px', fontFamily: 'monospace' }}>
                        {req.start_date} to {req.end_date}
                      </td>
                      <td style={{ padding: '12px 18px', fontWeight: 700 }}>{req.days_count} days</td>
                      <td style={{ padding: '12px 18px', color: '#53345F' }}>{req.reason}</td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: req.status === 'approved' ? '#DCFCE7' : req.status === 'pending' ? '#FEF3C7' : '#FEE2E2',
                          color: req.status === 'approved' ? '#15803D' : req.status === 'pending' ? '#B45309' : '#B91C1C'
                        }}>
                          {req.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px', fontSize: '12px', color: '#746875' }}>
                        {req.reviewer_comments || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PAYSLIPS */}
      {activeTab === 'payslips' && (
        <div>
          <div style={{ marginBottom: '18px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
              My Compensation & Payslips
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
              Official monthly salary breakdowns including base pay, allowances, and earned sales deal commissions.
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
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Period</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Basic Salary</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Allowances</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Deal Commission</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Deductions</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Net Disbursed</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Payment Date</th>
                </tr>
              </thead>
              <tbody>
                {payslips.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No published payslips available yet. Payslips are published on the 28th of each month.
                    </td>
                  </tr>
                ) : (
                  payslips.map(ps => (
                    <tr key={ps.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#48132F' }}>
                        {ps.year}-{ps.month.toString().padStart(2, '0')}
                      </td>
                      <td style={{ padding: '14px 18px' }}>AED {ps.basic_salary_aed.toLocaleString()}</td>
                      <td style={{ padding: '14px 18px' }}>AED {ps.allowances_aed.toLocaleString()}</td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#C6A15B' }}>AED {ps.commission_aed.toLocaleString()}</td>
                      <td style={{ padding: '14px 18px', color: '#DC2626' }}>AED {ps.deductions_aed.toLocaleString()}</td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#15803D' }}>AED {ps.net_salary_aed.toLocaleString()}</td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', color: '#746875' }}>
                        {ps.payment_date ? new Date(ps.payment_date).toLocaleDateString() : 'Disbursed'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: PERFORMANCE */}
      {activeTab === 'performance' && (
        <div>
          <div style={{ marginBottom: '18px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
              My Performance Reviews & Scorecards
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
              Quarterly performance evaluations submitted by HR and Sales Leadership.
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
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Period</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Deals Closed</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Revenue Closed</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Attendance Score</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Overall Rating</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Feedback & Goals</th>
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No quarterly reviews recorded yet.
                    </td>
                  </tr>
                ) : (
                  reviews.map(rev => (
                    <tr key={rev.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>{rev.review_period}</td>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>{rev.deals_closed_count} deals</td>
                      <td style={{ padding: '14px 18px', color: '#15803D', fontWeight: 700 }}>AED {rev.revenue_generated_aed.toLocaleString()}</td>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>{rev.attendance_score_pct}%</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          background: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: '6px', fontWeight: 800
                        }}>
                          ★ {rev.overall_rating.toFixed(1)} / 5.0
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', color: '#53345F', maxWidth: '240px' }}>
                        {rev.goals || rev.strengths || 'Exceeding sales targets.'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: HR REQUESTS */}
      {activeTab === 'requests' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
                My HR Helpdesk Tickets
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
                Salary certificate requests, bank NOCs, medical insurance queries, and HR assistance.
              </p>
            </div>
            <button
              onClick={() => setShowNewRequestModal(true)}
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
                gap: '6px'
              }}
            >
              <Plus size={16} />
              Open New Query
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
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Ticket #</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Category</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Subject</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Priority</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hrRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No active HR tickets found.
                    </td>
                  </tr>
                ) : (
                  hrRequests.map(req => (
                    <tr key={req.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 700, color: '#48132F' }}>
                        {req.ticket_number}
                      </td>
                      <td style={{ padding: '14px 18px', textTransform: 'capitalize' }}>
                        {req.category.replace('_', ' ')}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600 }}>{req.subject}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                          background: req.priority === 'urgent' ? '#FEE2E2' : '#F3F4F6',
                          color: req.priority === 'urgent' ? '#B91C1C' : '#4B5563'
                        }}>
                          {req.priority}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                          background: req.status === 'resolved' ? '#DCFCE7' : req.status === 'open' ? '#EFF6FF' : '#FEF3C7',
                          color: req.status === 'resolved' ? '#15803D' : req.status === 'open' ? '#1D4ED8' : '#B45309'
                        }}>
                          {req.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <button
                          onClick={async () => {
                            const fresh = await fetchHRRequestDetail(req.id)
                            setSelectedTicket(fresh)
                          }}
                          style={{
                            background: '#FAF7F0', border: '1px solid #D8CCB8', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
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

          {/* Ticket Messages Thread Modal */}
          {selectedTicket && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(28, 10, 30, 0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div style={{
                background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '80vh',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid #C6A15B'
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, #48132F 0%, #2A0822 100%)',
                  padding: '16px 20px', color: '#FAF7F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#E9C16E', textTransform: 'uppercase', fontWeight: 700 }}>
                      Ticket #{selectedTicket.ticket_number}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 800 }}>{selectedTicket.subject}</div>
                  </div>
                  <button onClick={() => setSelectedTicket(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#FAF7F0' }}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ flex: 1, padding: '18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedTicket.messages.map(msg => (
                    <div
                      key={msg.id}
                      style={{
                        padding: '12px', borderRadius: '8px',
                        background: msg.sender_role === 'hrms_admin' || msg.sender_role === 'admin' ? '#F4EFF7' : '#FAF7F0',
                        border: '1px solid #EAE2D5',
                        alignSelf: msg.sender_role === 'hrms_admin' || msg.sender_role === 'admin' ? 'flex-start' : 'flex-end',
                        maxWidth: '85%'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '11px', color: '#48132F' }}>
                          {msg.sender_name} ({msg.sender_role.replace('_', ' ')})
                        </span>
                        <span style={{ fontSize: '10px', color: '#746875' }}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#26232B' }}>{msg.message}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '14px 18px', borderTop: '1px solid #EAE2D5', display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Type message to HR..."
                    value={ticketReply}
                    onChange={e => setTicketReply(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleReplyTicket()}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #D8CCB8', fontSize: '13px' }}
                  />
                  <button
                    onClick={handleReplyTicket}
                    style={{
                      background: '#48132F', color: '#FAF7F0', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                  >
                    <Send size={13} color="#E9C16E" />
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 7: DOCUMENTS */}
      {activeTab === 'documents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#48132F' }}>
                My Personnel Documents
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#746875' }}>
                Passport copies, UAE residence visas, Emirates ID, and employment contracts.
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
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Document Title</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Verification</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700 }}>Expiry Date</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: '#746875' }}>
                      No personnel documents uploaded yet. Contact HR to submit credentials.
                    </td>
                  </tr>
                ) : (
                  documents.map(doc => (
                    <tr key={doc.id} style={{ borderBottom: '1px solid #F2ECE1' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#48132F' }}>{doc.title}</td>
                      <td style={{ padding: '14px 18px', textTransform: 'capitalize' }}>{doc.document_type.replace('_', ' ')}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                          background: doc.is_verified ? '#DCFCE7' : '#FEF3C7',
                          color: doc.is_verified ? '#15803D' : '#B45309'
                        }}>
                          {doc.is_verified ? 'Verified by HR' : 'Pending Verification'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>
                        {doc.expiry_date || 'N/A'}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: '#FAF7F0', border: '1px solid #D8CCB8', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', color: '#48132F'
                          }}
                        >
                          View Document
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: APPLY FOR LEAVE */}
      {showApplyLeaveModal && (
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
                await applyForLeave({
                  leave_type: String(fd.get('leave_type')),
                  start_date: String(fd.get('start_date')),
                  end_date: String(fd.get('end_date')),
                  reason: String(fd.get('reason')),
                })
                notify('Leave application submitted to HR!')
                setShowApplyLeaveModal(false)
                const freshReqs = await fetchMyLeaveRequests()
                setLeaveRequests(freshReqs)
                const freshBal = await fetchMyLeaveBalance()
                setLeaveBalance(freshBal)
              } catch (err: any) {
                notify(err.message || 'Failed to submit leave request.', true)
              }
            }}
            style={{
              background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '460px', padding: '24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid #C6A15B'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#48132F' }}>
                Apply for Leave
              </h3>
              <button type="button" onClick={() => setShowApplyLeaveModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Leave Type</label>
                <select name="leave_type" required style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                  <option value="annual">Annual Leave (Remaining: {leaveBalance?.annual_remaining ?? 30} days)</option>
                  <option value="sick">Sick Leave (Remaining: {leaveBalance?.sick_remaining ?? 15} days)</option>
                  <option value="casual">Casual Leave (Remaining: {leaveBalance?.casual_remaining ?? 7} days)</option>
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Start Date</label>
                  <input type="date" name="start_date" required defaultValue={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>End Date</label>
                  <input type="date" name="end_date" required defaultValue={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Reason</label>
                <textarea name="reason" required minLength={3} rows={3} placeholder="State reason for leave application..." style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8', fontSize: '13px' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowApplyLeaveModal(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #D8CCB8', background: '#FAF7F0', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #C6A15B 0%, #B8924B 100%)', color: '#1C0A1E', fontWeight: 700, cursor: 'pointer' }}>Submit Request</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: SUBMIT NEW HR QUERY */}
      {showNewRequestModal && (
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
                await createHRRequest({
                  category: String(fd.get('category')),
                  priority: String(fd.get('priority')),
                  subject: String(fd.get('subject')),
                  message: String(fd.get('message')),
                })
                notify('HR ticket opened successfully!')
                setShowNewRequestModal(false)
                const freshReqs = await fetchMyHRRequests()
                setHrRequests(freshReqs)
              } catch (err: any) {
                notify(err.message || 'Failed to open HR ticket.', true)
              }
            }}
            style={{
              background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '480px', padding: '24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid #C6A15B'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#48132F' }}>
                Open New HR Ticket
              </h3>
              <button type="button" onClick={() => setShowNewRequestModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Category</label>
                <select name="category" required style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                  <option value="salary_inquiry">Salary / Compensation Inquiry</option>
                  <option value="certificate_request">Official Salary Certificate / NOC</option>
                  <option value="benefits">Health Insurance / Benefits</option>
                  <option value="grievance">Workplace Grievance</option>
                  <option value="general_query">General HR Query</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Priority</label>
                <select name="priority" defaultValue="medium" style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Subject</label>
                <input type="text" name="subject" required placeholder="Brief title of request..." style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Detailed Message</label>
                <textarea name="message" required minLength={3} rows={4} placeholder="Describe your inquiry with relevant context..." style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D8CCB8', fontSize: '13px' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowNewRequestModal(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #D8CCB8', background: '#FAF7F0', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: '#48132F', color: '#FAF7F0', fontWeight: 700, cursor: 'pointer' }}>Submit Ticket</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
