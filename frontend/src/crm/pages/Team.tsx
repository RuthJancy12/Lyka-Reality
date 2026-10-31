import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle, Loader2, CheckCircle2, Copy, Check, Eye, EyeOff,
  Search, UserPlus, Users, Briefcase, Building2,
  Edit3, X, UserX, UserCheck, RefreshCw, BadgeCheck, ShieldCheck
} from 'lucide-react'
import {
  listStaff, createStaff, updateStaff,
  fetchLeadCoverageOverview, assignLeadCoverage, returnLeadCoverage,
  type LeadCoverageOverview,
  useStaffRole, type StaffListItem, type StaffRole,
} from '../services/staffApi'

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--champagne-border, #E8DCC8)',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '20px',
  boxShadow: '0 2px 10px rgba(59, 35, 72, 0.04)',
}

const input: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: '6px',
  border: '1px solid var(--champagne-border, #E8DCC8)',
  fontSize: '13px',
  background: '#fff',
  color: 'var(--text-main, #26232B)',
  outline: 'none',
  transition: 'border-color 0.15s ease',
}

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Admin',
  hrms_admin: 'HRMS Admin',
  sales_agent: 'Sales Agent',
  salesperson: 'Sales Agent',
  manager: 'Admin',
  sales_manager: 'Historical Manager (Archived)',
}

/**
 * Active employee roles offerable in the UI.
 * Exactly 3 active roles in LYKA Realty: Admin, HRMS Admin, Sales Agent.
 * Sales Manager role has been completely removed from active selection.
 */
const ASSIGNABLE_ROLES: StaffRole[] = ['hrms_admin', 'sales_agent', 'salesperson']

/**
 * Canonical 3 active roles for LYKA Realty administration.
 */
const ACTIVE_ROLES: { value: StaffRole; label: string; desc: string }[] = [
  { value: 'admin', label: 'Admin', desc: 'Full company governance, employee management, financial oversight' },
  { value: 'hrms_admin', label: 'HRMS Admin', desc: 'HR operations, employee directory, payroll, recruitment' },
  { value: 'sales_agent', label: 'Sales Agent', desc: 'Client advisory, property viewings, deal execution' },
]
void ASSIGNABLE_ROLES

export function Team() {
  const { role } = useStaffRole()
  const isAdmin = role === 'admin'
  const [staff, setStaff] = useState<StaffListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const activeMainTab = searchParams.get('tab') === 'coverage' ? 'coverage' : 'directory'

  // Lead Coverage State
  const [coverageOverview, setCoverageOverview] = useState<LeadCoverageOverview | null>(null)
  const [loadingCoverage, setLoadingCoverage] = useState(false)
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([])
  const [targetCoveringAgent, setTargetCoveringAgent] = useState('')
  const [coverageReason, setCoverageReason] = useState('Sales Agent On Approved Leave')
  const [coverageEndDate, setCoverageEndDate] = useState('')
  const [actionInProgress, setActionInProgress] = useState(false)
  const [coverageSuccessMsg, setCoverageSuccessMsg] = useState<string | null>(null)

  const loadCoverage = useCallback(async () => {
    setLoadingCoverage(true)
    setCoverageError(null)
    try {
      const data = await fetchLeadCoverageOverview()
      setCoverageOverview(data)
      if (data.available_covering_agents.length > 0 && !targetCoveringAgent) {
        setTargetCoveringAgent(data.available_covering_agents[0].email)
      }
    } catch (err) {
      setCoverageError(err instanceof Error ? err.message : 'Failed to load lead coverage overview.')
    } finally {
      setLoadingCoverage(false)
    }
  }, [targetCoveringAgent])

  useEffect(() => {
    if (activeMainTab === 'coverage') {
      void loadCoverage()
    }
  }, [activeMainTab, loadCoverage])

  const handleAssignCoverage = async (leadIdsToAssign?: number[]) => {
    const ids = leadIdsToAssign && leadIdsToAssign.length > 0 ? leadIdsToAssign : selectedLeadIds
    if (ids.length === 0) {
      alert('Please select at least one lead to assign coverage.')
      return
    }
    if (!targetCoveringAgent) {
      alert('Please select a covering sales agent.')
      return
    }
    setActionInProgress(true)
    try {
      await assignLeadCoverage({
        lead_ids: ids,
        covering_agent_email: targetCoveringAgent,
        coverage_reason: coverageReason,
        coverage_end: coverageEndDate || undefined,
      })
      setCoverageSuccessMsg(`Successfully assigned ${ids.length} lead(s) to ${targetCoveringAgent}.`)
      setSelectedLeadIds([])
      setTimeout(() => setCoverageSuccessMsg(null), 4000)
      await loadCoverage()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Coverage assignment failed.')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleReturnCoverage = async (returnToOriginal: boolean, leadIdsToProcess?: number[]) => {
    const ids = leadIdsToProcess && leadIdsToProcess.length > 0 ? leadIdsToProcess : selectedLeadIds
    if (ids.length === 0) {
      alert('Please select at least one lead.')
      return
    }
    const actionLabel = returnToOriginal ? 'return to original agent' : 'keep permanently with covering agent'
    if (!confirm(`Are you sure you want to ${actionLabel} for ${ids.length} selected lead(s)?`)) return

    setActionInProgress(true)
    try {
      await returnLeadCoverage({
        lead_ids: ids,
        return_to_original: returnToOriginal,
        notes: returnToOriginal ? 'Sales agent resumed active duty' : 'Permanently retained by covering agent',
      })
      setCoverageSuccessMsg(`Successfully processed ${ids.length} lead(s).`)
      setSelectedLeadIds([])
      setTimeout(() => setCoverageSuccessMsg(null), 4000)
      await loadCoverage()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Return action failed.')
    } finally {
      setActionInProgress(false)
    }
  }

  const toggleLeadSelection = (id: number) => {
    setSelectedLeadIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Add Member State
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [nEmail, setNEmail] = useState('')
  const [nName, setNName] = useState('')
  const [nRole, setNRole] = useState<StaffRole>('sales_agent')
  const [nDepartment, setNDepartment] = useState('Sales')
  const [nDesignation, setNDesignation] = useState('Sales Consultant')
  const [nManager, setNManager] = useState('')
  const [nPassword, setNPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creationSuccess, setCreationSuccess] = useState<{ message: string; invitationLink?: string | null } | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  // Edit Member Modal State
  const [editingStaff, setEditingStaff] = useState<StaffListItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<StaffRole>('sales_agent')
  const [editDepartment, setEditDepartment] = useState('')
  const [editDesignation, setEditDesignation] = useState('')
  const [editManager, setEditManager] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null)

  const managerOptions = staff.filter(
    (s) => s.is_active && (s.role === 'admin' || s.role === 'hrms_admin' || s.role === 'manager' || s.role === 'sales_manager')
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStaff(await listStaff(showInactive))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team.')
    } finally {
      setLoading(false)
    }
  }, [showInactive])

  useEffect(() => { void refresh() }, [refresh])

  // Automatically adjust default department and designation when role changes in Add form
  const handleRoleChange = (selectedRole: StaffRole) => {
    setNRole(selectedRole)
    if (selectedRole === 'hrms_admin') {
      if (nDepartment === 'Sales' || !nDepartment) setNDepartment('Human Resources')
      if (nDesignation === 'Sales Consultant' || !nDesignation) setNDesignation('HR Manager')
    } else if (selectedRole === 'admin') {
      if (nDepartment === 'Sales' || !nDepartment) setNDepartment('Executive Leadership')
      if (nDesignation === 'Sales Consultant' || !nDesignation) setNDesignation('Managing Director')
    } else {
      if (nDepartment === 'Human Resources' || nDepartment === 'Executive Leadership' || !nDepartment) setNDepartment('Sales')
      if (nDesignation === 'HR Manager' || nDesignation === 'Managing Director' || !nDesignation) setNDesignation('Sales Consultant')
    }
  }

  const add = async () => {
    if (!nEmail.trim() || !nName.trim()) {
      setFormError('Email and name are required.')
      return
    }
    if (nPassword.trim() && nPassword.trim().length < 6) {
      setFormError('Initial password must be at least 6 characters.')
      return
    }
    setSaving(true)
    setFormError(null)
    setCreationSuccess(null)
    setCopiedLink(false)
    try {
      const res = await createStaff({
        email: nEmail.trim(),
        name: nName.trim(),
        role: nRole,
        manager_email: nManager.trim() || null,
        password: nPassword.trim() || null,
        department: nDepartment.trim() || null,
        designation: nDesignation.trim() || null,
      })
      setNEmail('')
      setNName('')
      setNRole('sales_agent')
      setNDepartment('Sales')
      setNDesignation('Sales Consultant')
      setNManager('')
      setNPassword('')
      setCreationSuccess({
        message: res.message || 'Staff member created successfully.',
        invitationLink: res.invitation_link || null,
      })
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add staff.'
      const existingInList = staff.find(s => s.email.toLowerCase() === nEmail.trim().toLowerCase())
      if (existingInList) {
        setFormError(
          `${existingInList.name} (${existingInList.email}) is already registered with role ${ROLE_LABELS[existingInList.role as StaffRole] || existingInList.role} (Status: ${existingInList.is_active ? 'Active' : 'Inactive'}). Click below to edit or manage this account.`
        )
      } else {
        setFormError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 3000)
    } catch {
      // Fallback
    }
  }

  // Edit employee modal handlers
  const handleStartEdit = (s: StaffListItem) => {
    setEditingStaff(s)
    setEditName(s.name || '')
    setEditRole(s.role as StaffRole)
    setEditDepartment(s.department || (s.role === 'hrms_admin' ? 'Human Resources' : s.role === 'admin' ? 'Executive Leadership' : 'Sales'))
    setEditDesignation(s.designation || (s.role === 'hrms_admin' ? 'HR Manager' : s.role === 'admin' ? 'Managing Director' : 'Sales Consultant'))
    setEditManager(s.manager_email || '')
    setEditError(null)
    setEditSuccessMsg(null)
  }

  const handleSaveEdit = async () => {
    if (!editingStaff) return
    if (!editName.trim()) {
      setEditError('Employee name cannot be blank.')
      return
    }
    setEditSaving(true)
    setEditError(null)
    try {
      await updateStaff(editingStaff.id, {
        name: editName.trim(),
        role: editRole,
        department: editDepartment.trim() || null,
        designation: editDesignation.trim() || null,
        manager_email: editManager.trim() || null,
      })
      setEditSuccessMsg('Employee details updated successfully.')
      setTimeout(() => {
        setEditingStaff(null)
        setEditSuccessMsg(null)
      }, 1200)
      await refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update employee details.')
    } finally {
      setEditSaving(false)
    }
  }

  const toggleActive = async (s: StaffListItem) => {
    setFormError(null)
    try {
      await updateStaff(s.id, { is_active: !s.is_active })
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update staff status.'
      alert(`Status update failed: ${msg}`)
    }
  }

  // Filter staff by search query
  const filteredStaff = staff.filter((s) => {
    if (!searchQuery.trim()) return true
    const term = searchQuery.toLowerCase().trim()
    return (
      (s.name || '').toLowerCase().includes(term) ||
      (s.email || '').toLowerCase().includes(term) ||
      (s.department || '').toLowerCase().includes(term) ||
      (s.designation || '').toLowerCase().includes(term) ||
      (s.employee_id || '').toLowerCase().includes(term) ||
      (ROLE_LABELS[s.role as StaffRole] || '').toLowerCase().includes(term)
    )
  })

  // Quick statistics
  const activeCount = staff.filter((s) => s.is_active).length
  const inactiveCount = staff.filter((s) => !s.is_active).length
  const adminCount = staff.filter((s) => s.role === 'admin' || s.role === 'manager').length
  const hrmsCount = staff.filter((s) => s.role === 'hrms_admin').length
  const salesCount = staff.filter((s) => s.role === 'sales_agent' || s.role === 'salesperson').length

  const getRoleBadgeStyle = (r: StaffRole) => {
    if (r === 'admin' || r === 'manager') {
      return { background: '#3B2348', color: '#FAF7F0', border: '1px solid #3B2348' }
    }
    if (r === 'hrms_admin') {
      return { background: '#EEE7F2', color: '#53345F', border: '1px solid #D8CCB8' }
    }
    return { background: '#FAF3E0', color: '#8C6B28', border: '1px solid #E2C98D' }
  }

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 className="luxury-serif" style={{ fontSize: '26px', color: 'var(--plum-main, #3B2348)', margin: 0, fontWeight: 700 }}>
              Team Management
            </h2>
            <span style={{
              background: 'var(--champagne-light, #FAF8F4)',
              border: '1px solid var(--gold-primary, #C6A15B)',
              color: 'var(--plum-main, #3B2348)',
              fontWeight: 700,
              fontSize: '12px',
              padding: '2px 10px',
              borderRadius: '20px',
            }}>
              {staff.length} Total {staff.length === 1 ? 'Employee' : 'Employees'}
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary, #746875)', fontSize: '13px', margin: '6px 0 0' }}>
            Comprehensive directory of LYKA Realty personnel, account security, organizational hierarchy, and platform role governance.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            className="gold-btn"
            onClick={() => setIsAddOpen((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: '6px',
            }}
          >
            {isAddOpen ? <X size={15} /> : <UserPlus size={15} />}
            {isAddOpen ? 'Close Form' : 'Add New Employee'}
          </button>
        )}
      </div>

      {/* ─── Navigation Tabs: Directory vs Lead Coverage ─── */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--champagne-border, #E8DCC8)', marginBottom: '22px' }}>
        <button
          type="button"
          onClick={() => setSearchParams({})}
          style={{
            padding: '10px 20px',
            background: activeMainTab === 'directory' ? 'var(--plum-main, #3B2348)' : 'transparent',
            color: activeMainTab === 'directory' ? '#FAF7F0' : 'var(--plum-main, #3B2348)',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            fontWeight: 700,
            fontSize: '13.5px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Users size={16} /> Personnel Directory &amp; Governance
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'coverage' })}
          style={{
            padding: '10px 20px',
            background: activeMainTab === 'coverage' ? 'var(--plum-main, #3B2348)' : 'transparent',
            color: activeMainTab === 'coverage' ? '#FAF7F0' : 'var(--plum-main, #3B2348)',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            fontWeight: 700,
            fontSize: '13.5px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ShieldCheck size={16} /> Sales Continuity &amp; Lead Coverage
          {coverageOverview && (coverageOverview.absent_agents.length > 0 || coverageOverview.unassigned_queue.length > 0) && (
            <span style={{
              background: '#DC2626',
              color: '#FFF',
              fontSize: '10.5px',
              fontWeight: 800,
              padding: '1px 7px',
              borderRadius: '999px',
            }}>
              {coverageOverview.unassigned_queue.length || coverageOverview.absent_agents.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── Sales Continuity & Lead Coverage Tab View ─── */}
      {activeMainTab === 'coverage' ? (
        <div>
          {coverageSuccessMsg && (
            <div style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0', padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px', fontWeight: 600 }}>
              <CheckCircle2 size={18} />
              <span>{coverageSuccessMsg}</span>
            </div>
          )}

          {coverageError && (
            <div style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px', fontWeight: 600 }}>
              <AlertCircle size={18} />
              <span>{coverageError}</span>
            </div>
          )}

          {/* Coverage KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '22px' }}>
            <div style={{ ...card, padding: '16px 20px', margin: 0 }}>
              <div style={{ fontSize: '11px', color: '#746875', fontWeight: 700, textTransform: 'uppercase' }}>Agents on Leave</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#DC2626', margin: '4px 0 2px' }}>
                {coverageOverview?.absent_agents.length ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: '#746875' }}>Currently active approved leaves</div>
            </div>

            <div style={{ ...card, padding: '16px 20px', margin: 0 }}>
              <div style={{ fontSize: '11px', color: '#746875', fontWeight: 700, textTransform: 'uppercase' }}>Coverage Queue</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#D97706', margin: '4px 0 2px' }}>
                {coverageOverview?.unassigned_queue.length ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: '#746875' }}>Leads requiring covering agent</div>
            </div>

            <div style={{ ...card, padding: '16px 20px', margin: 0 }}>
              <div style={{ fontSize: '11px', color: '#746875', fontWeight: 700, textTransform: 'uppercase' }}>Available Covering Agents</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#16A34A', margin: '4px 0 2px' }}>
                {coverageOverview?.available_covering_agents.length ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: '#746875' }}>Sales agents ready for assignment</div>
            </div>
          </div>

          {/* Coverage Assignment Toolbar */}
          <div style={{ ...card, padding: '20px', background: '#FFFDF9', border: '1px solid #C6A15B', marginBottom: '22px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '15px', color: '#3B2348', fontWeight: 700 }}>
              Temporary Lead Coverage Assignment Controls
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#746875', display: 'block', marginBottom: '4px' }}>
                  Covering Sales Agent
                </label>
                <select
                  value={targetCoveringAgent}
                  onChange={(e) => setTargetCoveringAgent(e.target.value)}
                  style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                >
                  <option value="">Select covering agent...</option>
                  {coverageOverview?.available_covering_agents.map((ca) => (
                    <option key={ca.id} value={ca.email}>
                      {ca.name} ({ca.email})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '1 1 220px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#746875', display: 'block', marginBottom: '4px' }}>
                  Coverage Reason
                </label>
                <input
                  type="text"
                  value={coverageReason}
                  onChange={(e) => setCoverageReason(e.target.value)}
                  placeholder="Reason for coverage"
                  style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ flex: '1 1 150px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#746875', display: 'block', marginBottom: '4px' }}>
                  Expected Coverage End
                </label>
                <input
                  type="date"
                  value={coverageEndDate}
                  onChange={(e) => setCoverageEndDate(e.target.value)}
                  style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleAssignCoverage()}
                  disabled={actionInProgress || selectedLeadIds.length === 0}
                  className="gold-btn"
                  style={{ padding: '9px 18px', fontSize: '13px' }}
                >
                  {actionInProgress ? 'Processing...' : `Assign Coverage (${selectedLeadIds.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => handleReturnCoverage(true)}
                  disabled={actionInProgress || selectedLeadIds.length === 0}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '6px',
                    border: '1px solid #16A34A',
                    background: '#DCFCE7',
                    color: '#15803D',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Restore to Original Owner
                </button>
                <button
                  type="button"
                  onClick={() => handleReturnCoverage(false)}
                  disabled={actionInProgress || selectedLeadIds.length === 0}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '6px',
                    border: '1px solid #E8DCC8',
                    background: '#FFFFFF',
                    color: '#3B2348',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Keep with Covering Agent
                </button>
              </div>
            </div>
          </div>

          {/* Absent Agents & Leads */}
          {loadingCoverage ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#746875' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
              Loading sales coverage metrics...
            </div>
          ) : coverageOverview?.absent_agents.length === 0 && coverageOverview?.unassigned_queue.length === 0 ? (
            <div style={{ ...card, padding: '40px', textAlign: 'center', color: '#746875' }}>
              <BadgeCheck size={36} color="#16A34A" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '18px', color: '#3B2348', margin: '0 0 6px' }}>All Sales Agents Available</h3>
              <p style={{ margin: 0, fontSize: '13.5px' }}>
                No sales agents are currently on approved leave. All customer leads have direct assigned ownership.
              </p>
            </div>
          ) : (
            <div>
              {/* Absent Agents Cards */}
              {coverageOverview?.absent_agents.map((agent) => (
                <div key={agent.staff_id} style={{ ...card, padding: '20px', marginBottom: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', borderBottom: '1px solid #E8DCC8', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '16px', color: '#3B2348' }}>{agent.name}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#746875' }}>[{agent.employee_id}]</span>
                          <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                            ON LEAVE
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#746875' }}>
                          {agent.email} &bull; {agent.leave_type ? `${agent.leave_type.toUpperCase()} Leave` : 'Leave'} ({agent.leave_start ? new Date(agent.leave_start).toLocaleDateString() : ''} to {agent.leave_end ? new Date(agent.leave_end).toLocaleDateString() : ''})
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#3B2348' }}>
                      {agent.leads.length} Active {agent.leads.length === 1 ? 'Lead' : 'Leads'}
                    </div>
                  </div>

                  {/* Leads Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#FAF7F0', borderBottom: '1px solid #E8DCC8', color: '#53345F' }}>
                          <th style={{ padding: '10px 12px', width: '30px' }}>
                            <input
                              type="checkbox"
                              checked={agent.leads.length > 0 && agent.leads.every((l) => selectedLeadIds.includes(l.lead_id))}
                              onChange={(e) => {
                                const leadIds = agent.leads.map((l) => l.lead_id)
                                if (e.target.checked) {
                                  setSelectedLeadIds((prev) => Array.from(new Set([...prev, ...leadIds])))
                                } else {
                                  setSelectedLeadIds((prev) => prev.filter((id) => !leadIds.includes(id)))
                                }
                              }}
                            />
                          </th>
                          <th style={{ padding: '10px 12px' }}>Priority</th>
                          <th style={{ padding: '10px 12px' }}>Customer Name</th>
                          <th style={{ padding: '10px 12px' }}>Stage</th>
                          <th style={{ padding: '10px 12px' }}>Follow-up Due</th>
                          <th style={{ padding: '10px 12px' }}>Callback</th>
                          <th style={{ padding: '10px 12px' }}>Responsible Agent</th>
                          <th style={{ padding: '10px 12px' }}>Coverage Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agent.leads.map((lead) => {
                          const isSelected = selectedLeadIds.includes(lead.lead_id)
                          const isOverdue = lead.next_followup_at && new Date(lead.next_followup_at) < new Date()
                          return (
                            <tr key={lead.lead_id} style={{ borderBottom: '1px solid #F5EFE6', background: isSelected ? '#FEFBF4' : '#FFF' }}>
                              <td style={{ padding: '10px 12px' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleLeadSelection(lead.lead_id)}
                                />
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    background: lead.coverage_priority_rank === 1 ? '#FEE2E2' : lead.coverage_priority_rank === 2 ? '#FEF3C7' : '#EFF6FF',
                                    color: lead.coverage_priority_rank === 1 ? '#DC2626' : lead.coverage_priority_rank === 2 ? '#D97706' : '#2563EB',
                                    border: `1px solid ${lead.coverage_priority_rank === 1 ? '#FECACA' : lead.coverage_priority_rank === 2 ? '#FDE68A' : '#BFDBFE'}`,
                                  }}
                                >
                                  {lead.coverage_priority_rank === 1 ? 'HOT / URGENT' : lead.coverage_priority_rank === 2 ? 'WARM' : 'COLD'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: 700, color: '#3B2348' }}>
                                {lead.customer_name}
                                {lead.customer_phone && <div style={{ fontSize: '11.5px', color: '#746875', fontWeight: 400 }}>{lead.customer_phone}</div>}
                              </td>
                              <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>{lead.stage}</td>
                              <td style={{ padding: '10px 12px', color: isOverdue ? '#DC2626' : '#26232B', fontWeight: isOverdue ? 700 : 400 }}>
                                {lead.next_followup_at ? new Date(lead.next_followup_at).toLocaleDateString() : '—'}
                                {isOverdue && <span style={{ marginLeft: '4px', fontSize: '10px', background: '#FEE2E2', padding: '1px 4px', borderRadius: '3px' }}>OVERDUE</span>}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {lead.callback_requested ? (
                                  <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    YES
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                                {lead.current_responsible_email}
                                {lead.covering_agent_email && (
                                  <div style={{ color: '#C6A15B', fontWeight: 700 }}>Covering: {lead.covering_agent_email}</div>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    background: lead.coverage_status === 'covered' ? '#DCFCE7' : lead.coverage_status === 'coverage_required' ? '#FEE2E2' : '#F3F4F6',
                                    color: lead.coverage_status === 'covered' ? '#15803D' : lead.coverage_status === 'coverage_required' ? '#DC2626' : '#4B5563',
                                  }}
                                >
                                  {lead.coverage_status || 'normal'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>

{/* ── Key Metrics Overview ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '22px' }}>
        <div style={{ ...card, padding: '14px 18px', margin: 0, display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59, 35, 72, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={20} color="#3B2348" />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #746875)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Staff</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--plum-main, #3B2348)' }}>{staff.length}</div>
          </div>
        </div>

        <div style={{ ...card, padding: '14px 18px', margin: 0, display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(22, 163, 74, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={20} color="#16A34A" />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #746875)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Active Logins</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#16A34A' }}>{activeCount}</div>
          </div>
        </div>

        <div style={{ ...card, padding: '14px 18px', margin: 0, display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(220, 38, 38, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserX size={20} color="#DC2626" />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #746875)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Inactive Accounts</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#DC2626' }}>{inactiveCount}</div>
          </div>
        </div>

        <div style={{ ...card, padding: '14px 18px', margin: 0, display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(198, 161, 91, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Briefcase size={20} color="#C6A15B" />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #746875)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Role Distribution</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main, #26232B)' }}>
              {adminCount} Admin &bull; {hrmsCount} HRMS &bull; {salesCount} Sales
            </div>
          </div>
        </div>
      </div>

      {/* ── Add Team Member Section ───────────────────────────────── */}
      {isAdmin && isAddOpen && (
        <section style={{ ...card, border: '1px solid var(--gold-primary, #C6A15B)', background: '#FDFBF7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--plum-main, #3B2348)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={18} color="#C6A15B" /> Add New Employee Account
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary, #746875)' }}>* Required fields</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--plum-main, #3B2348)' }}>
                Full Name *
              </label>
              <input
                style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                placeholder="e.g. Layla Al-Mansoor"
                value={nName}
                onChange={(e) => setNName(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--plum-main, #3B2348)' }}>
                Corporate Email *
              </label>
              <input
                style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                placeholder="e.g. layla@lyka.ae"
                value={nEmail}
                onChange={(e) => setNEmail(e.target.value)}
                type="email"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--plum-main, #3B2348)' }}>
                System Role *
              </label>
              <select
                style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                value={nRole}
                onChange={(e) => handleRoleChange(e.target.value as StaffRole)}
                aria-label="Role"
              >
                {ACTIVE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--plum-main, #3B2348)' }}>
                Department
              </label>
              <input
                style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                placeholder="e.g. Sales, Human Resources"
                value={nDepartment}
                onChange={(e) => setNDepartment(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--plum-main, #3B2348)' }}>
                Designation / Job Title
              </label>
              <input
                style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                placeholder="e.g. Senior Property Advisor"
                value={nDesignation}
                onChange={(e) => setNDesignation(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--plum-main, #3B2348)' }}>
                Reports To (Manager)
              </label>
              <select
                style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                value={nManager}
                onChange={(e) => setNManager(e.target.value)}
                aria-label="Reports to (manager)"
              >
                <option value="">No manager (top level)</option>
                {managerOptions.map((m) => (
                  <option key={m.id} value={m.email}>{m.name} ({ROLE_LABELS[m.role as StaffRole] ?? m.role})</option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--plum-main, #3B2348)' }}>
                Initial password (optional)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...input, width: '100%', boxSizing: 'border-box', paddingRight: '34px' }}
                  placeholder="Leave blank to generate setup link"
                  value={nPassword}
                  onChange={(e) => setNPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #746875)',
                    padding: 0, display: 'flex', alignItems: 'center'
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #E8DCC8' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary, #746875)', margin: 0, maxWidth: '650px' }}>
              Leave password blank to generate an invitation link, or enter an initial password. The new employee will be created in Firebase Authentication and linked immediately.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                style={{ padding: '8px 16px', fontSize: '13px', background: 'transparent', border: '1px solid #D8CCB8', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-main, #26232B)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gold-btn"
                disabled={saving}
                onClick={add}
                style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {saving ? <Loader2 size={14} className="crm-spin" /> : <UserPlus size={14} />}
                {saving ? 'Creating Account…' : 'Add Member'}
              </button>
            </div>
          </div>

          {formError && (
            <div role="alert" style={{ color: '#991B1B', fontSize: '13px', marginTop: '12px', padding: '12px 14px', background: '#FEE2E2', borderRadius: '6px', border: '1px solid #FCA5A5' }}>
              <div>{formError}</div>
              {(() => {
                const found = staff.find(s => s.email.toLowerCase() === nEmail.trim().toLowerCase())
                if (found) {
                  return (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(found)}
                      style={{
                        marginTop: '8px',
                        padding: '6px 14px',
                        background: '#991B1B',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Edit3 size={13} /> Edit {found.name}'s Account
                    </button>
                  )
                }
                return null
              })()}
            </div>
          )}

          {creationSuccess && (
            <div style={{
              marginTop: '14px',
              padding: '16px',
              borderRadius: '8px',
              background: '#F0FDF4',
              border: '1px solid #86EFAC',
              color: '#166534',
              fontSize: '13px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
                <CheckCircle2 size={16} color="#16A34A" />
                <span>{creationSuccess.message}</span>
              </div>
              {creationSuccess.invitationLink && (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#14532D' }}>
                    <strong>Password setup link:</strong> (Share this link with the employee so they can set their password)
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      readOnly
                      value={creationSuccess.invitationLink}
                      style={{
                        flex: 1,
                        padding: '7px 12px',
                        fontSize: '12px',
                        borderRadius: '4px',
                        border: '1px solid #86EFAC',
                        background: '#fff',
                        color: 'var(--text-main, #26232B)',
                      }}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(creationSuccess.invitationLink!)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: '4px',
                        border: '1px solid #16A34A',
                        background: copiedLink ? '#16A34A' : '#fff',
                        color: copiedLink ? '#fff' : '#16A34A',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                      {copiedLink ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#15803D' }}>
                    Note: An external email provider is not configured in backend settings, so the link was not sent by email.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Employee Directory & Management Section ──────────────── */}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: '260px', maxWidth: '420px' }}>
            <Search size={15} color="var(--text-secondary, #746875)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              style={{ ...input, width: '100%', paddingLeft: '34px', boxSizing: 'border-box' }}
              placeholder="Search employees by name, email, department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#746875' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ fontSize: '12.5px', color: 'var(--text-secondary, #746875)', display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Include inactive accounts
            </label>

            <button
              type="button"
              onClick={refresh}
              title="Refresh employee directory"
              style={{ background: 'none', border: '1px solid var(--champagne-border, #E8DCC8)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-main, #26232B)' }}
            >
              <RefreshCw size={13} className={loading ? 'crm-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-secondary, #746875)' }}>
            <Loader2 size={20} className="crm-spin" style={{ display: 'inline-block', marginBottom: '8px' }} />
            <div>Loading LYKA Realty team directory…</div>
          </div>
        )}

        {error && (
          <div role="alert" style={{ padding: '14px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '8px', color: '#991B1B', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            <button type="button" className="lyka-chat-chip" onClick={refresh}>Retry</button>
          </div>
        )}

        {!loading && !error && filteredStaff.length === 0 && (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-secondary, #746875)' }}>
            <Users size={32} color="#C6A15B" style={{ margin: '0 auto 12px' }} />
            <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: 'var(--plum-main, #3B2348)' }}>
              {searchQuery ? `No employees found matching "${searchQuery}"` : 'No team members found.'}
            </h4>
            <p style={{ margin: 0, fontSize: '12px' }}>
              {searchQuery ? 'Try adjusting your search keywords or toggle "Include inactive accounts".' : 'The primary Admin account is initialized via python create_admin.py.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                className="lyka-chat-chip"
                onClick={() => setSearchQuery('')}
                style={{ marginTop: '12px' }}
              >
                Clear Search Filter
              </button>
            )}
          </div>
        )}

        {/* ── Employee Records Table / List ──────────────────────── */}
        {!loading && !error && filteredStaff.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 6px', fontSize: '12px', color: 'var(--text-secondary, #746875)' }}>
              <span>Showing <strong>{filteredStaff.length}</strong> of <strong>{staff.length}</strong> employees</span>
            </div>

            {filteredStaff.map((s) => {
              const roleBadge = getRoleBadgeStyle(s.role as StaffRole)
              const initials = (s.name || s.email)
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()

              return (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--champagne-border, #E8DCC8)',
                    background: s.is_active ? '#FFFFFF' : '#FAF8F5',
                    opacity: s.is_active ? 1 : 0.78,
                    gap: '14px',
                    flexWrap: 'wrap',
                    transition: 'box-shadow 0.15s ease',
                  }}
                >
                  {/* Avatar & Employee Identity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '240px', flex: '1 1 240px' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                      border: '2px solid #C6A15B',
                      color: '#FAF7F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '14px',
                      flexShrink: 0,
                    }}>
                      {initials}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-main, #3B2348)' }}>
                          {s.name}
                        </span>
                        {s.employee_id && (
                          <span style={{ fontSize: '10.5px', background: '#F4EFE6', padding: '1px 6px', borderRadius: '4px', color: '#746875', fontWeight: 600 }}>
                            {s.employee_id}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #746875)' }}>
                        {s.email}
                      </div>
                    </div>
                  </div>

                  {/* Department & Designation */}
                  <div style={{ minWidth: '180px', flex: '1 1 180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main, #26232B)' }}>
                      <Briefcase size={13} color="#C6A15B" />
                      <span>{s.designation || 'Specialist'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: 'var(--text-secondary, #746875)' }}>
                      <Building2 size={12} color="#746875" />
                      <span>{s.department || 'General Operations'}</span>
                    </div>
                  </div>

                  {/* Role & Manager */}
                  <div style={{ minWidth: '160px', flex: '1 1 160px' }}>
                    <span style={{
                      display: 'inline-block',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '3px 9px',
                      borderRadius: '6px',
                      ...roleBadge,
                      marginBottom: '4px',
                    }}>
                      {ROLE_LABELS[s.role as StaffRole] ?? s.role}
                    </span>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #746875)' }}>
                      {s.manager_email ? `Reports to ${s.manager_email}` : 'Top level leadership'}
                    </div>
                  </div>

                  {/* Status & Last Login */}
                  <div style={{ minWidth: '150px', flex: '1 1 150px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: s.is_active ? '#16A34A' : '#DC2626',
                        display: 'inline-block',
                      }} />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: s.is_active ? '#16A34A' : '#DC2626' }}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary, #746875)' }}>
                      {s.last_login_at ? `Last login ${new Date(s.last_login_at).toLocaleDateString()}` : 'Never logged in'}
                    </div>
                  </div>

                  {/* Admin Actions */}
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(s)}
                        title="Edit employee details"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: '#FFFFFF',
                          border: '1px solid var(--champagne-border, #E8DCC8)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: 'var(--plum-main, #3B2348)',
                        }}
                      >
                        <Edit3 size={13} /> Edit
                      </button>

                      <button
                        type="button"
                        className="lyka-chat-chip"
                        onClick={() => toggleActive(s)}
                        style={{
                          fontSize: '11.5px',
                          padding: '5px 11px',
                          color: s.is_active ? '#991B1B' : '#166534',
                          borderColor: s.is_active ? '#FCA5A5' : '#86EFAC',
                        }}
                      >
                        {s.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      </>
      )}

      {/* ── Edit Employee Modal ───────────────────────────────────── */}
      {editingStaff && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(28, 10, 30, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 9999,
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid var(--champagne-border, #E8DCC8)',
            maxWidth: '540px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 45px rgba(28, 10, 30, 0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 className="luxury-serif" style={{ margin: 0, fontSize: '18px', color: 'var(--plum-main, #3B2348)' }}>
                  Edit Employee Details
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary, #746875)' }}>
                  {editingStaff.email} {editingStaff.employee_id ? `(${editingStaff.employee_id})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#746875', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px', color: 'var(--plum-main, #3B2348)' }}>
                  Full Name *
                </label>
                <input
                  style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px', color: 'var(--plum-main, #3B2348)' }}>
                    Department
                  </label>
                  <input
                    style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px', color: 'var(--plum-main, #3B2348)' }}>
                    Designation
                  </label>
                  <input
                    style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                    value={editDesignation}
                    onChange={(e) => setEditDesignation(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px', color: 'var(--plum-main, #3B2348)' }}>
                  Assigned Role *
                </label>
                <select
                  style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as StaffRole)}
                >
                  {ACTIVE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} — {r.desc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px', color: 'var(--plum-main, #3B2348)' }}>
                  Reports To (Manager)
                </label>
                <select
                  style={{ ...input, width: '100%', boxSizing: 'border-box' }}
                  value={editManager}
                  onChange={(e) => setEditManager(e.target.value)}
                >
                  <option value="">No manager (top level leadership)</option>
                  {managerOptions
                    .filter((m) => m.id !== editingStaff.id)
                    .map((m) => (
                      <option key={m.id} value={m.email}>
                        {m.name} ({ROLE_LABELS[m.role as StaffRole] ?? m.role})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {editError && (
              <p role="alert" style={{ color: '#991B1B', fontSize: '12.5px', marginTop: '14px', padding: '8px 12px', background: '#FEE2E2', borderRadius: '6px' }}>
                {editError}
              </p>
            )}

            {editSuccessMsg && (
              <p role="status" style={{ color: '#166534', fontSize: '12.5px', marginTop: '14px', padding: '8px 12px', background: '#F0FDF4', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} color="#16A34A" /> {editSuccessMsg}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #E8DCC8' }}>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                style={{ padding: '8px 16px', fontSize: '13px', background: 'transparent', border: '1px solid #D8CCB8', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-main, #26232B)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gold-btn"
                disabled={editSaving}
                onClick={handleSaveEdit}
                style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {editSaving ? <Loader2 size={14} className="crm-spin" /> : <BadgeCheck size={14} />}
                {editSaving ? 'Saving Changes…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
