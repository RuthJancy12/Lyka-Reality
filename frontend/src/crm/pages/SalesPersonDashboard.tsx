import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmployeeSelfService } from '../components/EmployeeSelfService'
import {
  Users, CalendarCheck,
  AlertCircle, RefreshCw, Plus,
  Flame, UserCheck, Search, Phone,
  Clock, Eye, PhoneCall, Zap,
  RotateCcw, Share2,
} from 'lucide-react'
import {
  listAssignments, listFollowUps, listViewings,
  type Assignment, type FollowUp, type Viewing
} from '../services/staffApi'
import {
  listContacts,
  type ContactItem,
} from '../services/contactCenterApi'
import { CustomerDetailsModal } from '../components/CustomerDetailsModal'
import { LogCallModal } from '../components/LogCallModal'
import { ProposalShareModal } from '../components/ProposalShareModal'
import { ReengageLeadModal } from '../components/ReengageLeadModal'


// Official LYKA Realty Luxury Plum & Champagne Gold Color System Tokens
const NAVY = '#3B2348'
const TEAL = '#C6A15B'
const IVORY_BG = '#FAF7F0'
const IVORY_SURFACE = '#FFFFFF'
const BORDER = '#E8DCC8'
const TEXT_MAIN = '#26232B'
const TEXT_MUTED = '#7A6B78'

// Lead Temperature Badges
const HOT_COLOR = '#FF6B6B'
const WARM_COLOR = '#F59E0B'
const COLD_COLOR = '#0EA5E9'

const CARD: React.CSSProperties = {
  background: IVORY_SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(23, 42, 70, 0.05)',
  padding: '20px',
}

const H2: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 700,
  color: NAVY,
  margin: '0 0 14px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

function formatOutcome(status?: string | null) {
  if (!status) return 'None'
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function SalesPersonDashboard() {
  const [, setAssignments] = useState<Assignment[]>([])
  const [contacts, setContacts] = useState<ContactItem[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchParams] = useSearchParams()
  const sectionParam = searchParams.get('section')
  const hrmsTabParam = (searchParams.get('tab') as any) || 'profile'

  const [dashboardMode, setDashboardMode] = useState<'sales_crm' | 'self_service'>(
    sectionParam === 'hrms' ? 'self_service' : 'sales_crm'
  )

  useEffect(() => {
    if (sectionParam === 'hrms') {
      setDashboardMode('self_service')
    }
  }, [sectionParam])

  // View Mode: 'all' | 'priority_queue' | 'lost_recovery'
  const [viewMode, setViewMode] = useState<'all' | 'priority_queue' | 'lost_recovery'>('all')

  // Search & filter for salesperson's leads
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [temperatureFilter, setTemperatureFilter] = useState('all')
  const [page, setPage] = useState(1)
  const limit = 10

  // Modals state
  const [viewLeadId, setViewLeadId] = useState<number | null>(null)
  const [activeCallLead, setActiveCallLead] = useState<{
    id: number
    name?: string | null
    phone?: string | null
    totalAttempts?: number
    temperature?: string | null
  } | null>(null)

  const [proposalLead, setProposalLead] = useState<ContactItem | null>(null)
  const [reengageLead, setReengageLead] = useState<ContactItem | null>(null)

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [a, cRes, f, v] = await Promise.all([
        listAssignments().catch(() => []),
        listContacts({ tab: 'all', limit: 100 }).catch(() => ({ total: 0, page: 1, limit: 100, total_pages: 1, contacts: [] })),
        listFollowUps().catch(() => []),
        listViewings().catch(() => []),
      ])
      setAssignments(a)
      setContacts(cRes.contacts || [])
      setFollowUps(f)
      setViewings(v)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personal salesperson dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const hotLeads = useMemo(
    () => contacts.filter((c) => (c.lead_temperature || '').toLowerCase() === 'hot'),
    [contacts]
  )

  const todayFollowups = useMemo(() => {
    const today = new Date().toDateString()
    return followUps.filter((f) => {
      if (f.completed_at) return false
      if (!f.next_action_at) return true
      return new Date(f.next_action_at).toDateString() === today || new Date(f.next_action_at) < new Date()
    })
  }, [followUps])

  const upcomingViewings = useMemo(() => {
    return viewings.filter((v) => v.status !== 'cancelled' && v.status !== 'completed')
  }, [viewings])

  // Priority Queue Computation & Scoring
  const priorityQueueLeads = useMemo(() => {
    const activeLeads = contacts.filter((c) => c.status !== 'lost' && c.status !== 'closed_lost' && c.status !== 'closed')
    
    return activeLeads.map((c) => {
      const isNew = c.total_call_attempts === 0 || c.status === 'new'
      const isHot = (c.lead_temperature || '').toLowerCase() === 'hot'
      const hasFollowupDue = Boolean(
        c.next_follow_up_at &&
        new Date(c.next_follow_up_at).toDateString() === new Date().toDateString()
      )
      const hasOverdue = Boolean(
        c.next_follow_up_at &&
        new Date(c.next_follow_up_at) < new Date()
      )
      const hasViewing = upcomingViewings.some((v) => v.lead_id === c.lead_id)

      let rank = 5
      let reason = 'Active Follow-up'

      if (isNew) {
        rank = 1
        reason = 'New Lead: SLA First Contact Required'
      } else if (isHot) {
        rank = 2
        reason = 'High-Value Hot Prospect'
      } else if (hasFollowupDue || hasOverdue) {
        rank = 3
        reason = hasOverdue ? 'Overdue Callback' : 'Scheduled Follow-up Today'
      } else if (hasViewing) {
        rank = 4
        reason = 'Upcoming Site Tour Scheduled'
      }

      return { ...c, queueRank: rank, queueReason: reason }
    }).sort((a, b) => a.queueRank - b.queueRank)
  }, [contacts, upcomingViewings])

  // Lost Leads for Recovery
  const lostLeads = useMemo(() => {
    return contacts.filter(
      (c) =>
        c.status === 'lost' ||
        c.status === 'closed_lost' ||
        c.last_call?.status === 'not_interested'
    )
  }, [contacts])

  // Active pool based on selected view mode
  const activeModeContacts = useMemo(() => {
    if (viewMode === 'priority_queue') {
      return priorityQueueLeads
    }
    if (viewMode === 'lost_recovery') {
      return lostLeads
    }
    return contacts
  }, [viewMode, contacts, priorityQueueLeads, lostLeads])

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    return activeModeContacts.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (temperatureFilter !== 'all' && (c.lead_temperature || '').toLowerCase() !== temperatureFilter.toLowerCase()) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesName = c.customer_name?.toLowerCase().includes(q)
        const matchesEmail = c.contact_email?.toLowerCase().includes(q)
        const matchesPhone = c.contact_phone?.toLowerCase().includes(q)
        const matchesLoc = c.location?.toLowerCase().includes(q)
        return matchesName || matchesEmail || matchesPhone || matchesLoc
      }
      return true
    })
  }, [activeModeContacts, statusFilter, temperatureFilter, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / limit))
  const paginatedContacts = useMemo(() => {
    const start = (page - 1) * limit
    return filteredContacts.slice(start, start + limit)
  }, [filteredContacts, page, limit])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '12px', color: TEXT_MUTED }}>
        <RefreshCw size={28} color={TEAL} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '14px', fontWeight: 600 }}>Loading Sales Consultant Dashboard…</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', background: IVORY_BG, minHeight: '100%', padding: '24px 28px' }}>
      {/* 1. HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', background: IVORY_SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '22px 26px', boxShadow: '0 1px 4px rgba(23, 42, 70, 0.04)' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(198, 161, 91, 0.12)', borderRadius: '20px', border: '1px solid rgba(198, 161, 91, 0.3)', fontSize: '11px', fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            <UserCheck size={13} /> Sales Consultant Workspace
          </div>
          <h1 className="luxury-serif" style={{ fontSize: '26px', color: NAVY, margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Sales Consultant Dashboard
          </h1>
          <p style={{ color: TEXT_MUTED, fontSize: '13.5px', margin: '6px 0 0' }}>
            Assigned customer leads, phone numbers, call monitoring history, and structured contact workflows.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: IVORY_SURFACE, border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: NAVY, cursor: 'pointer' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Updating…' : 'Refresh'}
          </button>
          <Link
            to="/crm/contact-center"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
          >
            <PhoneCall size={14} color="#C6A15B" /> Customer Contact Center
          </Link>
          <Link
            to="/crm/call-history"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: IVORY_SURFACE, border: `1px solid ${BORDER}`, color: NAVY, borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
          >
            <Phone size={14} /> Call History
          </Link>
          <Link
            to="/crm/enquiry"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: NAVY, color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
          >
            <Plus size={14} /> New Enquiry
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#991B1B', fontSize: '13px' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Mode Switcher */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: `2px solid ${BORDER}`, paddingBottom: '4px' }}>
        <button
          onClick={() => setDashboardMode('sales_crm')}
          style={{
            padding: '10px 20px',
            background: dashboardMode === 'sales_crm' ? NAVY : 'transparent',
            color: dashboardMode === 'sales_crm' ? '#FFFFFF' : NAVY,
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '13.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Zap size={16} color={dashboardMode === 'sales_crm' ? TEAL : NAVY} />
          Sales CRM & Priority Leads
        </button>

        <button
          onClick={() => setDashboardMode('self_service')}
          style={{
            padding: '10px 20px',
            background: dashboardMode === 'self_service' ? NAVY : 'transparent',
            color: dashboardMode === 'self_service' ? '#FFFFFF' : NAVY,
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '13.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <UserCheck size={16} color={dashboardMode === 'self_service' ? TEAL : NAVY} />
          Employee Self-Service (Attendance, Leaves, Payslips)
        </button>
      </div>

      {dashboardMode === 'self_service' ? (
        <EmployeeSelfService initialTab={hrmsTabParam} />
      ) : (
        <>

      {/* --------------------------------------------------------------
          2. PERSONAL KPI TILES
         -------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: TEXT_MUTED }}>My Assigned Leads</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: NAVY, margin: '6px 0 2px' }}>{contacts.length}</div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Active client engagements</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: HOT_COLOR }}>Hot Priority Leads</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: HOT_COLOR, margin: '6px 0 2px' }}>{hotLeads.length}</div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Ready for immediate close</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: todayFollowups.length > 0 ? '#DC2626' : '#16A34A' }}>
            Today&apos;s Follow-ups Due
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: todayFollowups.length > 0 ? '#DC2626' : '#16A34A', margin: '6px 0 2px' }}>
            {todayFollowups.length}
          </div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Scheduled calls &amp; client tasks</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: TEAL }}>Upcoming Site Visits</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: TEAL, margin: '6px 0 2px' }}>{upcomingViewings.length}</div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Scheduled property tours</div>
        </div>
      </div>

      {/* --------------------------------------------------------------
          3. PRODUCTIVITY WORKSPACE TABS & ASSIGNED LEADS TABLE
         -------------------------------------------------------------- */}
      <div style={{ ...CARD, padding: '24px' }}>
        {/* Productivity Workspace Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER}`, paddingBottom: '16px', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setViewMode('all')
                setPage(1)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: viewMode === 'all' ? `1px solid ${NAVY}` : `1px solid ${BORDER}`,
                background: viewMode === 'all' ? NAVY : '#FFFFFF',
                color: viewMode === 'all' ? '#FFFFFF' : TEXT_MAIN,
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Users size={14} color={viewMode === 'all' ? TEAL : undefined} />
              All Assigned Leads ({contacts.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('priority_queue')
                setPage(1)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: viewMode === 'priority_queue' ? '1px solid #D97706' : `1px solid ${BORDER}`,
                background: viewMode === 'priority_queue' ? '#FEF3C7' : '#FFFFFF',
                color: viewMode === 'priority_queue' ? '#92400E' : TEXT_MAIN,
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Zap size={14} color="#D97706" />
              ⚡ Daily Priority Queue ({priorityQueueLeads.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('lost_recovery')
                setPage(1)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: viewMode === 'lost_recovery' ? '1px solid #991B1B' : `1px solid ${BORDER}`,
                background: viewMode === 'lost_recovery' ? '#FEE2E2' : '#FFFFFF',
                color: viewMode === 'lost_recovery' ? '#991B1B' : TEXT_MAIN,
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <RotateCcw size={14} color="#991B1B" />
              🔄 Lost Lead Recovery ({lostLeads.length})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '180px' }}>
              <Search size={14} color={TEXT_MUTED} style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Search leads, phone, location…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                style={{ padding: '7px 10px 7px 30px', borderRadius: '6px', border: `1px solid ${BORDER}`, fontSize: '12.5px', background: '#fff', width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Temperature Filter */}
            <select
              value={temperatureFilter}
              onChange={(e) => {
                setTemperatureFilter(e.target.value)
                setPage(1)
              }}
              style={{ padding: '7px 10px', borderRadius: '6px', border: `1px solid ${BORDER}`, fontSize: '12.5px', background: '#fff' }}
            >
              <option value="all">All Temperatures</option>
              <option value="hot">Hot Only</option>
              <option value="warm">Warm Only</option>
              <option value="cold">Cold Only</option>
            </select>

            {/* Status Filter */}
            {viewMode === 'all' && (
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
                style={{ padding: '7px 10px', borderRadius: '6px', border: `1px solid ${BORDER}`, fontSize: '12.5px', background: '#fff' }}
              >
                <option value="all">All Stages</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="closed">Closed</option>
                <option value="lost">Lost</option>
              </select>
            )}
          </div>
        </div>

        {/* Informational Sub-banner for Priority Queue or Lost Recovery */}
        {viewMode === 'priority_queue' && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '12.5px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Zap size={16} color="#D97706" />
            <div>
              <strong>Daily Priority Queue Algorithm:</strong> Sorted automatically by action urgency — 1. New Uncontacted Leads (SLA) &bull; 2. High-Intent Hot Prospects &bull; 3. Overdue &amp; Due Today Callbacks &bull; 4. Upcoming Site Visits.
            </div>
          </div>
        )}

        {viewMode === 'lost_recovery' && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '12.5px', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RotateCcw size={16} color="#991B1B" />
            <div>
              <strong>Lost Lead Recovery Hub:</strong> Leads marked as lost or disqualified. Click &quot;Re-engage Lead&quot; to apply price updates, new inventory launches, or schedule a fresh advisory outreach.
            </div>
          </div>
        )}

        {paginatedContacts.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1200px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: `1px solid ${BORDER}`, textAlign: 'left', color: TEXT_MUTED, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {viewMode === 'priority_queue' && (
                    <th style={{ padding: '12px 10px', fontWeight: 700, color: '#D97706' }}>Queue Priority</th>
                  )}
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Customer Name</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Phone Number</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Email</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Location</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Budget</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Lead Source</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Temperature</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Stage</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>First Call Status</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Latest Outcome</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Attempts</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Last Contacted</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600 }}>Next Follow-up</th>
                  <th style={{ padding: '12px 10px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedContacts.map((c) => {
                  const isHot = (c.lead_temperature || '').toLowerCase() === 'hot'
                  const isWarm = (c.lead_temperature || '').toLowerCase() === 'warm'

                  const phoneDisplay = c.contact_phone && c.contact_phone.trim() ? c.contact_phone : 'Phone number not provided'
                  const budgetDisplay = c.budget_max
                    ? c.budget_min
                      ? `AED ${c.budget_min.toLocaleString()} - ${c.budget_max.toLocaleString()}`
                      : `Up to AED ${c.budget_max.toLocaleString()}`
                    : 'Not specified'

                  const queueItem = c as ContactItem & { queueRank?: number; queueReason?: string }

                  return (
                    <tr key={c.lead_id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      {/* Priority Queue Rank Tag */}
                      {viewMode === 'priority_queue' && (
                        <td style={{ padding: '12px 10px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: queueItem.queueRank === 1 ? '#FEF2F2' : queueItem.queueRank === 2 ? '#FEF3C7' : '#EFF6FF',
                              color: queueItem.queueRank === 1 ? '#DC2626' : queueItem.queueRank === 2 ? '#D97706' : '#2563EB',
                              border: `1px solid ${queueItem.queueRank === 1 ? '#FECACA' : queueItem.queueRank === 2 ? '#FDE68A' : '#BFDBFE'}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            P{queueItem.queueRank}: {queueItem.queueRank === 1 ? 'New Lead' : queueItem.queueRank === 2 ? 'Hot Lead' : queueItem.queueRank === 3 ? 'Callback' : 'Active'}
                          </span>
                        </td>
                      )}

                      {/* 1. Customer Name */}
                      <td style={{ padding: '12px 10px' }}>
                        <div
                          onClick={() => setViewLeadId(c.lead_id)}
                          style={{ fontWeight: 700, color: NAVY, cursor: 'pointer' }}
                        >
                          {c.customer_name || 'Client Lead'}
                        </div>
                        {((c as any).is_temporary_coverage || (c as any).coverage_status === 'covered') && (
                          <div style={{ marginTop: '2px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                background: '#FEF3C7',
                                color: '#B45309',
                                border: '1px solid #FDE68A',
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '3px',
                              }}
                            >
                              Temporary Coverage
                            </span>
                            {(c as any).original_staff_email && (
                              <div style={{ fontSize: '10px', color: TEXT_MUTED }}>
                                Original: {(c as any).original_staff_email}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 2. Phone Number */}
                      <td style={{ padding: '12px 10px', color: c.contact_phone ? TEXT_MAIN : '#9CA3AF', whiteSpace: 'nowrap' }}>
                        {phoneDisplay}
                      </td>

                      {/* 3. Email */}
                      <td style={{ padding: '12px 10px', color: TEXT_MUTED, fontSize: '12px' }}>
                        {c.contact_email || '—'}
                      </td>

                      {/* 4. Location */}
                      <td style={{ padding: '12px 10px', color: TEXT_MAIN }}>
                        <div style={{ fontWeight: 600 }}>{c.location || 'Dubai'}</div>
                        <div style={{ fontSize: '11px', color: TEXT_MUTED }}>{c.property_type || 'Apartment'}</div>
                      </td>

                      {/* 5. Budget */}
                      <td style={{ padding: '12px 10px', fontSize: '12px', color: TEXT_MAIN, whiteSpace: 'nowrap' }}>
                        {budgetDisplay}
                      </td>

                      {/* 6. Lead Source */}
                      <td style={{ padding: '12px 10px', color: TEXT_MUTED, fontSize: '12px' }}>
                        {c.lead_source || 'Website'}
                      </td>

                      {/* 7. Temperature */}
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: isHot ? '#FEF2F2' : isWarm ? '#FEF3C7' : '#E0F2FE',
                          color: isHot ? HOT_COLOR : isWarm ? WARM_COLOR : COLD_COLOR,
                          border: `1px solid ${isHot ? '#FECACA' : isWarm ? '#FDE68A' : '#BAE6FD'}`,
                        }}>
                          <Flame size={12} /> {isHot ? 'HOT' : isWarm ? 'WARM' : 'COLD'}
                        </span>
                      </td>

                      {/* 8. Lead Stage */}
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ fontSize: '11.5px', textTransform: 'capitalize', fontWeight: 600, color: NAVY, background: '#F1F5F9', padding: '3px 8px', borderRadius: '4px' }}>
                          {c.status}
                        </span>
                      </td>

                      {/* 9. First Call Status */}
                      <td style={{ padding: '12px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {c.total_call_attempts === 0 ? (
                          <span style={{ color: '#9CA3AF' }}>Pending</span>
                        ) : c.first_call_status ? (
                          <span style={{ fontWeight: 600, color: '#16A34A' }}>
                            {formatOutcome(c.first_call_status)}
                          </span>
                        ) : (
                          <span style={{ color: TEXT_MUTED }}>Recorded</span>
                        )}
                      </td>

                      {/* 10. Latest Call Outcome */}
                      <td style={{ padding: '12px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {c.last_call?.status ? (
                          <span style={{ fontWeight: 600, color: NAVY }}>
                            {formatOutcome(c.last_call.status)}
                          </span>
                        ) : (
                          <span style={{ color: '#9CA3AF' }}>No call yet</span>
                        )}
                      </td>

                      {/* 11. Total Call Attempts */}
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: c.is_connected ? 'rgba(22, 163, 74, 0.12)' : c.total_call_attempts > 0 ? 'rgba(217, 119, 6, 0.12)' : '#EEE7F2',
                          color: c.is_connected ? '#16A34A' : c.total_call_attempts > 0 ? '#D97706' : '#3B2348',
                        }}>
                          {c.total_call_attempts}
                        </span>
                      </td>

                      {/* 12. Last Contacted Date */}
                      <td style={{ padding: '12px 10px', color: TEXT_MUTED, fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {c.last_contacted_date ? new Date(c.last_contacted_date).toLocaleDateString() : 'Never'}
                      </td>

                      {/* 13. Next Follow-up */}
                      <td style={{ padding: '12px 10px', color: '#7C3AED', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {c.next_follow_up_at ? new Date(c.next_follow_up_at).toLocaleDateString() : 'None'}
                      </td>

                      {/* 14. Actions */}
                      <td style={{ padding: '12px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {viewMode === 'lost_recovery' ? (
                            <button
                              type="button"
                              onClick={() => setReengageLead(c)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 11px',
                                background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              <RotateCcw size={11} color={TEAL} /> Re-engage Lead
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActiveCallLead({
                                id: c.lead_id,
                                name: c.customer_name,
                                phone: c.contact_phone,
                                totalAttempts: c.total_call_attempts,
                                temperature: c.lead_temperature,
                              })}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 11px',
                                background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              <Phone size={11} color="#C6A15B" /> Log Call
                            </button>
                          )}

                          {/* Share Proposal Button */}
                          <button
                            type="button"
                            onClick={() => setProposalLead(c)}
                            title="Share Luxury Property Proposal via WhatsApp or Email"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 9px',
                              background: '#FAF7F0',
                              color: NAVY,
                              border: `1px solid ${BORDER}`,
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <Share2 size={11} color={TEAL} /> Proposal
                          </button>

                          {/* View Lead Button */}
                          <button
                            type="button"
                            onClick={() => setViewLeadId(c.lead_id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 9px',
                              background: '#F8FAFC',
                              color: NAVY,
                              border: `1px solid ${BORDER}`,
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <Eye size={12} /> View
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: TEXT_MUTED }}>
            <Users size={32} color={BORDER} style={{ margin: '0 auto 10px', display: 'block' }} />
            <div style={{ fontWeight: 600, color: NAVY }}>No leads match the selected criteria</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Try adjusting your search terms or temperature filter</div>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${BORDER}`, fontSize: '12.5px', color: TEXT_MUTED }}>
            <div>
              Showing page {page} of {totalPages} ({filteredContacts.length} leads)
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '4px 10px', borderRadius: '5px', border: `1px solid ${BORDER}`, background: page <= 1 ? '#F3F4F6' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '4px 10px', borderRadius: '5px', border: `1px solid ${BORDER}`, background: page >= totalPages ? '#F3F4F6' : '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------
          4. FOLLOW-UPS & VIEWINGS ROW
         -------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Today's Follow-up Tasks */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ ...H2, margin: 0 }}>
              <Clock size={18} color={TEAL} /> Today&apos;s Follow-up Tasks
            </h2>
            <Link to="/crm/contact-center?tab=follow_up" style={{ fontSize: '12px', color: TEAL, fontWeight: 700, textDecoration: 'none' }}>
              View All →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {todayFollowups.length > 0 ? (
              todayFollowups.slice(0, 5).map((f) => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '12px' }}>
                  <div style={{ flex: 1, marginRight: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>Lead #{f.lead_id}</div>
                    <div style={{ color: TEXT_MAIN, marginTop: '2px' }}>{f.note}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewLeadId(f.lead_id)}
                    style={{ fontSize: '11px', color: TEAL, background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                  >
                    View Lead →
                  </button>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: TEXT_MUTED, fontSize: '13px' }}>
                All today&apos;s follow-up tasks are completed.
              </div>
            )}
          </div>
        </div>

        {/* Scheduled In-Person Viewings */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ ...H2, margin: 0 }}>
              <CalendarCheck size={18} color={TEAL} /> Upcoming Site Visits &amp; Appointments
            </h2>
            <Link to="/crm/my" style={{ fontSize: '12px', color: TEAL, fontWeight: 700, textDecoration: 'none' }}>
              My Calendar →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {upcomingViewings.length > 0 ? (
              upcomingViewings.slice(0, 5).map((v) => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>
                      Lead #{v.lead_id} — Property {v.property_ref}
                    </div>
                    <div style={{ fontSize: '11.5px', color: TEXT_MUTED }}>
                      Scheduled: {new Date(v.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: TEAL, background: 'rgba(198, 161, 91, 0.15)', border: '1px solid rgba(198, 161, 91, 0.3)', padding: '3px 8px', borderRadius: '4px', textTransform: 'capitalize' }}>
                    {v.status}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: TEXT_MUTED, fontSize: '13px' }}>
                No site visits currently scheduled on your calendar.
              </div>
            )}
          </div>
        </div>
      </div>
        </>
      )}

      {/* --------------------------------------------------------------
          MODALS: COMPLETE CUSTOMER DETAILS, CALL LOGGING, PROPOSAL, RE-ENGAGE
         -------------------------------------------------------------- */}
      {viewLeadId !== null && (
        <CustomerDetailsModal
          leadId={viewLeadId}
          onClose={() => setViewLeadId(null)}
          onLogCall={(leadId, name, phone) => {
            setViewLeadId(null)
            setActiveCallLead({ id: leadId, name, phone })
          }}
        />
      )}

      {activeCallLead && (
        <LogCallModal
          leadId={activeCallLead.id}
          customerName={activeCallLead.name}
          phone={activeCallLead.phone}
          totalAttempts={activeCallLead.totalAttempts || 0}
          currentTemperature={activeCallLead.temperature}
          onClose={() => setActiveCallLead(null)}
          onSuccess={() => {
            setActiveCallLead(null)
            loadData(true)
          }}
        />
      )}

      {proposalLead && (
        <ProposalShareModal
          leadId={proposalLead.lead_id}
          customerName={proposalLead.customer_name}
          phone={proposalLead.contact_phone}
          email={proposalLead.contact_email}
          preferredLocation={proposalLead.location}
          budget={
            proposalLead.budget_max
              ? `AED ${proposalLead.budget_max.toLocaleString()}`
              : null
          }
          onClose={() => setProposalLead(null)}
          onSuccess={() => {
            loadData(true)
          }}
        />
      )}

      {reengageLead && (
        <ReengageLeadModal
          leadId={reengageLead.lead_id}
          customerName={reengageLead.customer_name}
          phone={reengageLead.contact_phone}
          currentStatus={reengageLead.status}
          onClose={() => setReengageLead(null)}
          onSuccess={() => {
            loadData(true)
          }}
        />
      )}
    </div>
  )
}
