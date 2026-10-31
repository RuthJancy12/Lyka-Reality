import React, { useState, useEffect, useCallback } from 'react'
import {
  X, User, Clock, Calendar, Bell, ShieldCheck, LogOut, CheckCircle2,
  AlertCircle, Edit2, Check, Heart, CalendarDays, Loader2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useStaffRole, fetchStaffMe, updateStaffMeProfile, type StaffMe, clearStaffMeCache } from '../crm/services/staffApi'
import {
  fetchTodayAttendance, checkInAttendance, checkOutAttendance,
  fetchMyAttendanceHistory, fetchMyLeaveBalance, fetchMyLeaveRequests,
  applyForLeave, cancelLeaveRequest, fetchHRNotifications,
  markHRNotificationRead, markAllHRNotificationsRead,
  type AttendanceRecord, type LeaveBalance, type LeaveRequest, type HRNotification
} from '../crm/services/hrmsApi'
import { getCustomerFavorites, getMyAppointments, getCustomerInquiries } from '../services/api'
import { auth } from '../services/firebase'
import { sendPasswordResetEmail } from 'firebase/auth'

interface RoleMyAccountModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: string
  favoritesCount?: number
  onOpenFavorites?: () => void
}

export function RoleMyAccountModal({
  isOpen,
  onClose,
  initialTab,
  favoritesCount = 0,
  onOpenFavorites,
}: RoleMyAccountModalProps) {
  const { user, logout } = useAuth()
  const { role: staffRole } = useStaffRole()
  const isStaff = staffRole !== null && ['admin', 'manager', 'hrms_admin', 'sales_agent', 'salesperson'].includes(staffRole)

  // Employee state
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'profile')
  const [staffProfile, setStaffProfile] = useState<StaffMe | null>(null)
  const [phoneEditing, setPhoneEditing] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneSaving, setPhoneSaving] = useState(false)

  // Attendance
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null)
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([])
  const [clocking, setClocking] = useState(false)

  // Leaves
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null)
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [leaveType, setLeaveType] = useState<'annual' | 'sick' | 'casual' | 'unpaid'>('annual')
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [submittingLeave, setSubmittingLeave] = useState(false)

  // Notifications
  const [notifications, setNotifications] = useState<HRNotification[]>([])

  // Customer state
  const [favIds, setFavIds] = useState<string[]>([])
  const [custAppointments, setCustAppointments] = useState<any[]>([])
  const [custInquiries, setCustInquiries] = useState<any[]>([])

  // Feedback message
  const [toastMsg, setToastMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const showToast = (text: string, kind: 'ok' | 'err' = 'ok') => {
    setToastMsg({ kind, text })
    setTimeout(() => setToastMsg(null), 4000)
  }

  // Load employee profile & data
  const loadStaffData = useCallback(async () => {
    if (!isStaff) return
    try {
      const me = await fetchStaffMe()
      setStaffProfile(me)
      setPhoneInput(me.phone || '')

      const [todayAtt, attHist, bal, reqs, notifs] = await Promise.all([
        fetchTodayAttendance().catch(() => null),
        fetchMyAttendanceHistory().catch(() => []),
        fetchMyLeaveBalance().catch(() => null),
        fetchMyLeaveRequests().catch(() => []),
        fetchHRNotifications().catch(() => []),
      ])

      setTodayAttendance(todayAtt)
      setAttendanceHistory(attHist)
      setLeaveBalance(bal)
      setLeaveRequests(reqs)
      setNotifications(notifs)
    } catch {
      // Failed to load
    }
  }, [isStaff])

  // Load customer data
  const loadCustomerData = useCallback(async () => {
    if (isStaff || !user) return
    try {
      const [favs, appts, inqs] = await Promise.all([
        getCustomerFavorites().catch(() => []),
        getMyAppointments().catch(() => []),
        getCustomerInquiries().catch(() => []),
      ])
      setFavIds(favs || [])
      setCustAppointments(appts || [])
      setCustInquiries(inqs || [])
    } catch {
      // Failed
    }
  }, [isStaff, user])

  useEffect(() => {
    if (isOpen) {
      if (isStaff) {
        loadStaffData()
        setActiveTab(initialTab || 'profile')
      } else {
        loadCustomerData()
        setActiveTab(initialTab || 'profile')
      }
    }
  }, [isOpen, isStaff, initialTab, loadStaffData, loadCustomerData])

  if (!isOpen) return null

  // Save phone number handler
  const handleSavePhone = async () => {
    if (!phoneInput.trim()) return
    setPhoneSaving(true)
    try {
      const updated = await updateStaffMeProfile(phoneInput.trim())
      setStaffProfile(updated)
      setPhoneEditing(false)
      showToast('Contact phone number updated successfully.')
    } catch (e: any) {
      showToast(e.message || 'Failed to update phone number.', 'err')
    } finally {
      setPhoneSaving(false)
    }
  }

  // Attendance Punch
  const handlePunch = async (type: 'in' | 'out') => {
    setClocking(true)
    try {
      if (type === 'in') {
        const res = await checkInAttendance()
        setTodayAttendance(res)
        showToast('Successfully clocked in for today.')
      } else {
        const res = await checkOutAttendance()
        setTodayAttendance(res)
        showToast('Successfully clocked out.')
      }
      const hist = await fetchMyAttendanceHistory().catch(() => [])
      setAttendanceHistory(hist)
    } catch (e: any) {
      showToast(e.message || 'Attendance action failed.', 'err')
    } finally {
      setClocking(false)
    }
  }

  // Submit Leave
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leaveStart || !leaveEnd || !leaveReason.trim()) {
      showToast('Please fill all leave application fields.', 'err')
      return
    }
    setSubmittingLeave(true)
    try {
      await applyForLeave({
        leave_type: leaveType,
        start_date: leaveStart,
        end_date: leaveEnd,
        reason: leaveReason.trim(),
      })
      showToast('Leave application submitted for approval.')
      setShowApplyModal(false)
      setLeaveReason('')
      setLeaveStart('')
      setLeaveEnd('')
      const [bal, reqs] = await Promise.all([
        fetchMyLeaveBalance().catch(() => null),
        fetchMyLeaveRequests().catch(() => []),
      ])
      setLeaveBalance(bal)
      setLeaveRequests(reqs)
    } catch (e: any) {
      showToast(e.message || 'Failed to submit leave request.', 'err')
    } finally {
      setSubmittingLeave(false)
    }
  }

  // Cancel Leave
  const handleCancelLeave = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this pending leave request?')) return
    try {
      await cancelLeaveRequest(id)
      showToast('Leave request cancelled.')
      const [bal, reqs] = await Promise.all([
        fetchMyLeaveBalance().catch(() => null),
        fetchMyLeaveRequests().catch(() => []),
      ])
      setLeaveBalance(bal)
      setLeaveRequests(reqs)
    } catch (e: any) {
      showToast(e.message || 'Failed to cancel leave request.', 'err')
    }
  }

  // Password reset email
  const handlePasswordReset = async () => {
    const email = user?.email || staffProfile?.email
    if (!email) return
    try {
      await sendPasswordResetEmail(auth, email)
      showToast(`Password reset link sent to ${email}.`)
    } catch (e: any) {
      showToast(e.message || 'Could not send password reset link.', 'err')
    }
  }

  const roleBadge = (r?: string | null) => {
    switch (r) {
      case 'admin':
      case 'manager':
        return { label: 'Admin', bg: '#3B2348', color: '#FAF7F0' }
      case 'hrms_admin':
        return { label: 'HRMS Admin', bg: '#53345F', color: '#FAF7F0' }
      case 'sales_agent':
      case 'salesperson':
        return { label: 'Sales Agent', bg: '#E2C98D', color: '#3B2348' }
      default:
        return { label: 'Client', bg: '#E8DCC8', color: '#26232B' }
    }
  }

  const badge = roleBadge(staffProfile?.role || staffRole)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        background: 'rgba(26, 14, 31, 0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FAF7F0',
          borderRadius: '14px',
          border: '1px solid #E8DCC8',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(26, 14, 31, 0.35)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #3B2348 0%, #25172C 100%)',
            padding: '20px 24px',
            color: '#FBF8F3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(198, 161, 91, 0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #C6A15B 0%, #E2C98D 100%)',
                color: '#26232B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '18px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              }}
            >
              {(staffProfile?.name || user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 className="luxury-serif" style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: '#FAF7F0' }}>
                  {staffProfile?.name || user?.name || user?.email}
                </h3>
                <span
                  style={{
                    background: badge.bg,
                    color: badge.color,
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 9px',
                    borderRadius: '4px',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {badge.label}
                </span>
                {staffProfile?.employee_id && (
                  <span style={{ fontSize: '12px', color: '#E2C98D', fontFamily: 'monospace', fontWeight: 700 }}>
                    [{staffProfile.employee_id}]
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#D4C3AC', marginTop: '2px' }}>
                {staffProfile?.email || user?.email} &bull; {isStaff ? (staffProfile?.designation || 'Staff Member') : 'Customer Account'}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FAF7F0',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div
            style={{
              padding: '10px 24px',
              background: toastMsg.kind === 'ok' ? '#DCFCE7' : '#FEE2E2',
              color: toastMsg.kind === 'ok' ? '#15803D' : '#991B1B',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {toastMsg.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toastMsg.text}</span>
          </div>
        )}

        {/* Modal Body with Sidebar Tabs */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Navigation Sidebar */}
          <div
            style={{
              width: '210px',
              flexShrink: 0,
              background: '#FFFFFF',
              borderRight: '1px solid #E8DCC8',
              padding: '16px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {isStaff ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'profile' ? 'var(--gold-gradient, #E2C98D)' : 'transparent',
                    color: activeTab === 'profile' ? '#3B2348' : '#26232B',
                    fontWeight: activeTab === 'profile' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <User size={15} /> My Profile
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'attendance' ? 'var(--gold-gradient, #E2C98D)' : 'transparent',
                    color: activeTab === 'attendance' ? '#3B2348' : '#26232B',
                    fontWeight: activeTab === 'attendance' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Clock size={15} /> My Attendance
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('leaves')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'leaves' ? 'var(--gold-gradient, #E2C98D)' : 'transparent',
                    color: activeTab === 'leaves' ? '#3B2348' : '#26232B',
                    fontWeight: activeTab === 'leaves' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Calendar size={15} /> My Leave Requests
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('notifications')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'notifications' ? 'var(--gold-gradient, #E2C98D)' : 'transparent',
                    color: activeTab === 'notifications' ? '#3B2348' : '#26232B',
                    fontWeight: activeTab === 'notifications' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Bell size={15} /> My Notifications
                  {notifications.filter((n) => !n.is_read).length > 0 && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        background: '#DC2626',
                        color: '#FFF',
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        fontWeight: 700,
                      }}
                    >
                      {notifications.filter((n) => !n.is_read).length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('security')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'security' ? 'var(--gold-gradient, #E2C98D)' : 'transparent',
                    color: activeTab === 'security' ? '#3B2348' : '#26232B',
                    fontWeight: activeTab === 'security' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <ShieldCheck size={15} /> Security &amp; Access
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'profile' ? 'var(--gold-gradient, #E2C98D)' : 'transparent',
                    color: activeTab === 'profile' ? '#3B2348' : '#26232B',
                    fontWeight: activeTab === 'profile' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <User size={15} /> My Profile
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('saved')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'saved' ? 'var(--gold-gradient, #E2C98D)' : 'transparent',
                    color: activeTab === 'saved' ? '#3B2348' : '#26232B',
                    fontWeight: activeTab === 'saved' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Heart size={15} color="#DC2626" /> Saved Properties ({favoritesCount})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('enquiries')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'enquiries' ? 'var(--gold-gradient, #E2C98D)' : 'transparent',
                    color: activeTab === 'enquiries' ? '#3B2348' : '#26232B',
                    fontWeight: activeTab === 'enquiries' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <CalendarDays size={15} /> Enquiries &amp; Tours
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('security')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'security' ? 'var(--gold-gradient, #E2C98D)' : 'transparent',
                    color: activeTab === 'security' ? '#3B2348' : '#26232B',
                    fontWeight: activeTab === 'security' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <ShieldCheck size={15} /> Settings &amp; Security
                </button>
              </>
            )}

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #E8DCC8' }}>
              <button
                type="button"
                onClick={() => {
                  clearStaffMeCache()
                  logout()
                  onClose()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'none',
                  color: '#DC2626',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          </div>

          {/* Tab Content Area */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: '#FAF7F0' }}>
            {/* 1. EMPLOYEE PROFILE TAB */}
            {isStaff && activeTab === 'profile' && (
              <div>
                <h4 style={{ margin: '0 0 16px', fontSize: '16px', color: '#3B2348', fontWeight: 700 }}>
                  Personal Information &amp; Corporate Identity
                </h4>

                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '10px',
                    border: '1px solid #E8DCC8',
                    padding: '20px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      Full Name
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#26232B', marginTop: '2px' }}>
                      {staffProfile?.name || user?.name || 'Staff Member'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      Employee ID
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#3B2348', fontFamily: 'monospace', marginTop: '2px' }}>
                      {staffProfile?.employee_id || 'EMP-001'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      Corporate Email
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#26232B', marginTop: '2px' }}>
                      {staffProfile?.email || user?.email}
                    </div>
                  </div>

                  {/* Permitted editable field: Contact Phone */}
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      Contact Phone
                    </div>
                    {phoneEditing ? (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <input
                          type="text"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          placeholder="+971 50 123 4567"
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #C6A15B',
                            fontSize: '13px',
                            width: '140px',
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleSavePhone}
                          disabled={phoneSaving}
                          style={{
                            background: '#3B2348',
                            color: '#FFF',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                          }}
                        >
                          {phoneSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPhoneEditing(false)}
                          style={{
                            background: '#E8DCC8',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#26232B' }}>
                          {staffProfile?.phone || 'Not provided'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPhoneEditing(true)}
                          title="Edit Phone"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C6A15B', padding: '2px' }}
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      Department
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#26232B', marginTop: '2px' }}>
                      {staffProfile?.department || 'Operations'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      Designation
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#26232B', marginTop: '2px' }}>
                      {staffProfile?.designation || 'Consultant'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      System Role
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#3B2348', textTransform: 'uppercase', marginTop: '2px' }}>
                      {staffProfile?.role?.replace('_', ' ') || staffRole}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      Reporting Manager
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#26232B', marginTop: '2px' }}>
                      {staffProfile?.manager_email || 'Executive Board'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      Availability Status
                    </div>
                    <div style={{ marginTop: '3px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: staffProfile?.availability_status === 'on_leave' ? '#FEF2F2' : '#DCFCE7',
                          color: staffProfile?.availability_status === 'on_leave' ? '#DC2626' : '#15803D',
                        }}
                      >
                        {staffProfile?.availability_status === 'on_leave' ? 'On Leave' : 'Available'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#746875', fontWeight: 700 }}>
                      Employment Status
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#16A34A', marginTop: '2px' }}>
                      {staffProfile?.employment_status?.replace('_', ' ').toUpperCase() || 'ACTIVE FULL TIME'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. EMPLOYEE ATTENDANCE TAB */}
            {isStaff && activeTab === 'attendance' && (
              <div>
                <h4 style={{ margin: '0 0 16px', fontSize: '16px', color: '#3B2348', fontWeight: 700 }}>
                  Daily Attendance &amp; Punch Management
                </h4>

                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '10px',
                    border: '1px solid #E8DCC8',
                    padding: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', color: '#746875' }}>Today&apos;s Status</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#3B2348', textTransform: 'capitalize' }}>
                      {todayAttendance ? todayAttendance.status : 'Not Clocked In'}
                    </div>
                    {todayAttendance?.check_in_time && (
                      <div style={{ fontSize: '12px', color: '#746875', marginTop: '2px' }}>
                        Clock In: {new Date(todayAttendance.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {todayAttendance.check_out_time && ` | Clock Out: ${new Date(todayAttendance.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    {!todayAttendance?.check_in_time ? (
                      <button
                        type="button"
                        onClick={() => handlePunch('in')}
                        disabled={clocking}
                        className="gold-btn"
                        style={{ padding: '9px 18px', fontSize: '13px' }}
                      >
                        {clocking ? 'Clocking in...' : 'Clock In for Today'}
                      </button>
                    ) : !todayAttendance.check_out_time ? (
                      <button
                        type="button"
                        onClick={() => handlePunch('out')}
                        disabled={clocking}
                        style={{
                          background: '#DC2626',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '9px 18px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {clocking ? 'Clocking out...' : 'Clock Out (End Day)'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '12.5px', color: '#16A34A', fontWeight: 700 }}>
                        &check; Completed for today ({todayAttendance.total_hours} hrs)
                      </span>
                    )}
                  </div>
                </div>

                <h5 style={{ margin: '0 0 10px', fontSize: '14px', color: '#3B2348', fontWeight: 700 }}>
                  Recent Attendance Records
                </h5>
                <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E8DCC8', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #E8DCC8', color: '#53345F' }}>
                        <th style={{ padding: '10px 14px' }}>Date</th>
                        <th style={{ padding: '10px 14px' }}>Check In</th>
                        <th style={{ padding: '10px 14px' }}>Check Out</th>
                        <th style={{ padding: '10px 14px' }}>Total Hours</th>
                        <th style={{ padding: '10px 14px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#746875' }}>
                            No prior attendance records found.
                          </td>
                        </tr>
                      ) : (
                        attendanceHistory.slice(0, 10).map((a) => (
                          <tr key={a.id} style={{ borderBottom: '1px solid #F5EFE6' }}>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>{a.date}</td>
                            <td style={{ padding: '10px 14px' }}>
                              {a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 700 }}>{a.total_hours} hrs</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  background: a.status === 'present' ? '#DCFCE7' : '#FEF3C7',
                                  color: a.status === 'present' ? '#15803D' : '#D97706',
                                }}
                              >
                                {a.status}
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

            {/* 3. EMPLOYEE LEAVES TAB */}
            {isStaff && activeTab === 'leaves' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '16px', color: '#3B2348', fontWeight: 700 }}>
                    Leave Balances &amp; Applications
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowApplyModal(true)}
                    className="gold-btn"
                    style={{ padding: '8px 14px', fontSize: '12.5px' }}
                  >
                    + Apply for Leave
                  </button>
                </div>

                {/* Balances Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '10px', border: '1px solid #E8DCC8' }}>
                    <div style={{ fontSize: '11px', color: '#746875', fontWeight: 700, textTransform: 'uppercase' }}>Annual Leave</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#3B2348', margin: '4px 0 2px' }}>
                      {leaveBalance?.annual_remaining ?? 30} days
                    </div>
                    <div style={{ fontSize: '11px', color: '#746875' }}>Used: {leaveBalance?.annual_used ?? 0} / 30</div>
                  </div>

                  <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '10px', border: '1px solid #E8DCC8' }}>
                    <div style={{ fontSize: '11px', color: '#746875', fontWeight: 700, textTransform: 'uppercase' }}>Sick Leave</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#16A34A', margin: '4px 0 2px' }}>
                      {leaveBalance?.sick_remaining ?? 15} days
                    </div>
                    <div style={{ fontSize: '11px', color: '#746875' }}>Used: {leaveBalance?.sick_used ?? 0} / 15</div>
                  </div>

                  <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '10px', border: '1px solid #E8DCC8' }}>
                    <div style={{ fontSize: '11px', color: '#746875', fontWeight: 700, textTransform: 'uppercase' }}>Casual Leave</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#C6A15B', margin: '4px 0 2px' }}>
                      {leaveBalance?.casual_remaining ?? 7} days
                    </div>
                    <div style={{ fontSize: '11px', color: '#746875' }}>Used: {leaveBalance?.casual_used ?? 0} / 7</div>
                  </div>
                </div>

                {/* Apply Leave Modal */}
                {showApplyModal && (
                  <div
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '10px',
                      border: '2px solid #C6A15B',
                      padding: '18px',
                      marginBottom: '20px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h5 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#3B2348' }}>Submit Leave Application</h5>
                      <button type="button" onClick={() => setShowApplyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={15} />
                      </button>
                    </div>

                    <form onSubmit={handleApplyLeave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#746875', display: 'block', marginBottom: '4px' }}>Leave Type</label>
                        <select
                          value={leaveType}
                          onChange={(e: any) => setLeaveType(e.target.value)}
                          style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #E8DCC8', fontSize: '12.5px' }}
                        >
                          <option value="annual">Annual Leave</option>
                          <option value="sick">Sick Leave</option>
                          <option value="casual">Casual Leave</option>
                          <option value="unpaid">Unpaid Leave</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#746875', display: 'block', marginBottom: '4px' }}>Start Date</label>
                        <input
                          type="date"
                          value={leaveStart}
                          onChange={(e) => setLeaveStart(e.target.value)}
                          required
                          style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #E8DCC8', fontSize: '12.5px' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#746875', display: 'block', marginBottom: '4px' }}>End Date</label>
                        <input
                          type="date"
                          value={leaveEnd}
                          onChange={(e) => setLeaveEnd(e.target.value)}
                          required
                          style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #E8DCC8', fontSize: '12.5px' }}
                        />
                      </div>

                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#746875', display: 'block', marginBottom: '4px' }}>Reason</label>
                        <input
                          type="text"
                          value={leaveReason}
                          onChange={(e) => setLeaveReason(e.target.value)}
                          placeholder="Brief reason for leave request"
                          required
                          style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #E8DCC8', fontSize: '12.5px' }}
                        />
                      </div>

                      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button type="button" onClick={() => setShowApplyModal(false)} style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #E8DCC8', background: '#FFF', fontSize: '12px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                        <button type="submit" disabled={submittingLeave} className="gold-btn" style={{ padding: '7px 18px', fontSize: '12px' }}>
                          {submittingLeave ? 'Submitting...' : 'Submit Request'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Leave Requests Table */}
                <h5 style={{ margin: '0 0 10px', fontSize: '14px', color: '#3B2348', fontWeight: 700 }}>
                  Leave Request History
                </h5>
                <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E8DCC8', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #E8DCC8', color: '#53345F' }}>
                        <th style={{ padding: '10px 14px' }}>Type</th>
                        <th style={{ padding: '10px 14px' }}>Dates</th>
                        <th style={{ padding: '10px 14px' }}>Days</th>
                        <th style={{ padding: '10px 14px' }}>Reason</th>
                        <th style={{ padding: '10px 14px' }}>Status</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveRequests.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#746875' }}>
                            No leave applications on record.
                          </td>
                        </tr>
                      ) : (
                        leaveRequests.map((r) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #F5EFE6' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, textTransform: 'capitalize' }}>{r.leave_type}</td>
                            <td style={{ padding: '10px 14px', fontSize: '12px' }}>
                              {r.start_date} to {r.end_date}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.days_count}</td>
                            <td style={{ padding: '10px 14px', color: '#746875', fontSize: '12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.reason}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  background: r.status === 'approved' ? '#DCFCE7' : r.status === 'pending' ? '#FEF3C7' : '#FEE2E2',
                                  color: r.status === 'approved' ? '#15803D' : r.status === 'pending' ? '#D97706' : '#DC2626',
                                }}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              {r.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelLeave(r.id)}
                                  style={{
                                    background: '#FEE2E2',
                                    color: '#DC2626',
                                    border: '1px solid #FECACA',
                                    borderRadius: '4px',
                                    padding: '3px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
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

            {/* 4. EMPLOYEE NOTIFICATIONS TAB */}
            {isStaff && activeTab === 'notifications' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '16px', color: '#3B2348', fontWeight: 700 }}>
                    My Notifications &amp; Alerts
                  </h4>
                  {notifications.some((n) => !n.is_read) && (
                    <button
                      type="button"
                      onClick={async () => {
                        await markAllHRNotificationsRead()
                        const notifs = await fetchHRNotifications().catch(() => [])
                        setNotifications(notifs)
                        showToast('All notifications marked as read.')
                      }}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E8DCC8',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: '#3B2348',
                      }}
                    >
                      Mark All as Read
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {notifications.length === 0 ? (
                    <div style={{ background: '#FFFFFF', padding: '30px', borderRadius: '10px', textAlign: 'center', color: '#746875' }}>
                      No notifications at this time.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          background: n.is_read ? '#FFFFFF' : '#FEFDF9',
                          border: `1px solid ${n.is_read ? '#E8DCC8' : '#C6A15B'}`,
                          borderRadius: '8px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#3B2348' }}>{n.title}</span>
                            {!n.is_read && (
                              <span style={{ background: '#C6A15B', color: '#FFF', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                                NEW
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '4px 0 6px', fontSize: '12.5px', color: '#26232B' }}>{n.message}</p>
                          <div style={{ fontSize: '11px', color: '#746875' }}>
                            {new Date(n.created_at).toLocaleString()}
                          </div>
                        </div>

                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={async () => {
                              await markHRNotificationRead(n.id)
                              setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
                            }}
                            style={{
                              background: 'none',
                              border: '1px solid #E8DCC8',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              color: '#746875',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 5. SECURITY TAB (EMPLOYEE & CUSTOMER) */}
            {activeTab === 'security' && (
              <div>
                <h4 style={{ margin: '0 0 16px', fontSize: '16px', color: '#3B2348', fontWeight: 700 }}>
                  Security, Password &amp; Session Controls
                </h4>

                <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '10px', border: '1px solid #E8DCC8', marginBottom: '16px' }}>
                  <h5 style={{ margin: '0 0 8px', fontSize: '14px', color: '#26232B', fontWeight: 700 }}>
                    Change Account Password
                  </h5>
                  <p style={{ fontSize: '12.5px', color: '#746875', margin: '0 0 14px' }}>
                    Send a verified password reset email link to your registered work or customer email ({staffProfile?.email || user?.email}).
                  </p>
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    className="gold-btn"
                    style={{ padding: '8px 16px', fontSize: '12.5px' }}
                  >
                    Send Password Reset Link
                  </button>
                </div>

                <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '10px', border: '1px solid #E8DCC8' }}>
                  <h5 style={{ margin: '0 0 8px', fontSize: '14px', color: '#26232B', fontWeight: 700 }}>
                    Active Session Authentication
                  </h5>
                  <div style={{ fontSize: '12.5px', color: '#746875' }}>
                    Signed in via Firebase Authentication. Platform role: <strong>{staffProfile?.role || staffRole || 'Customer'}</strong>.
                  </div>
                </div>
              </div>
            )}

            {/* 6. CUSTOMER PROFILE TAB */}
            {!isStaff && activeTab === 'profile' && (
              <div>
                <h4 style={{ margin: '0 0 16px', fontSize: '16px', color: '#3B2348', fontWeight: 700 }}>
                  Customer Profile &amp; Preferences
                </h4>
                <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '10px', border: '1px solid #E8DCC8' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#746875', fontWeight: 700, textTransform: 'uppercase' }}>Name</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#26232B' }}>{user?.name || 'Customer'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#746875', fontWeight: 700, textTransform: 'uppercase' }}>Email</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#26232B' }}>{user?.email}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 7. CUSTOMER SAVED PROPERTIES (RESTRICTED TO CUSTOMERS ONLY!) */}
            {!isStaff && activeTab === 'saved' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '16px', color: '#3B2348', fontWeight: 700 }}>
                    Saved Favorite Properties ({favIds.length || favoritesCount})
                  </h4>
                  {onOpenFavorites && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        onOpenFavorites()
                      }}
                      className="gold-btn"
                      style={{ padding: '6px 14px', fontSize: '12px' }}
                    >
                      View All Saved Properties
                    </button>
                  )}
                </div>

                {favIds.length === 0 && favoritesCount === 0 ? (
                  <div style={{ background: '#FFFFFF', padding: '36px', borderRadius: '10px', textAlign: 'center', color: '#746875' }}>
                    <Heart size={32} color="#DC2626" style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '13px' }}>You have not saved any properties yet.</p>
                  </div>
                ) : (
                  <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '10px', border: '1px solid #E8DCC8' }}>
                    <p style={{ fontSize: '13.5px', color: '#26232B', margin: '0 0 10px' }}>
                      You have <strong>{favIds.length || favoritesCount}</strong> luxury properties saved in your portfolio.
                    </p>
                    {onOpenFavorites && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose()
                          onOpenFavorites()
                        }}
                        className="gold-btn"
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        Open Saved Properties Drawer
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 8. CUSTOMER ENQUIRIES TAB */}
            {!isStaff && activeTab === 'enquiries' && (
              <div>
                <h4 style={{ margin: '0 0 16px', fontSize: '16px', color: '#3B2348', fontWeight: 700 }}>
                  Property Enquiries &amp; Scheduled Tours
                </h4>

                <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '10px', border: '1px solid #E8DCC8' }}>
                  {custInquiries.length === 0 && custAppointments.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#746875', fontSize: '13px' }}>
                      No active property inquiries or scheduled tours.
                    </div>
                  ) : (
                    <div>
                      {custInquiries.map((iq: any, idx: number) => (
                        <div key={idx} style={{ padding: '10px 0', borderBottom: '1px solid #F5EFE6', fontSize: '13px' }}>
                          <strong>{iq.property_title || 'General Enquiry'}</strong> &bull; Status: {iq.status || 'Active'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
