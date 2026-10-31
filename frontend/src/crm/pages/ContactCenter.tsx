import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  PhoneCall,
  Phone,
  PhoneMissed,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  Search,
  Download,
  RefreshCw,
  Sliders,
  Eye,
  BarChart2,
  ShieldAlert,
  Flame,
  X,
} from 'lucide-react'
import { useStaffRole } from '../services/staffApi'
import {
  getContactCenterSummary,
  listContacts,
  getDailyCallHistory,
  getPerformanceComparison,
  getSlaConfig,
  updateSlaConfig,
  downloadContactsCsv,
  type ContactCenterSummary,
  type ContactItem,
  type DailyCallItem,
  type PerformanceItem,
} from '../services/contactCenterApi'
import { CustomerDetailsModal } from '../components/CustomerDetailsModal'
import { LogCallModal } from '../components/LogCallModal'

function getTemperatureBadge(temp?: string | null) {
  const t = (temp || 'warm').toLowerCase()
  if (t === 'hot') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          background: 'rgba(239, 68, 68, 0.12)',
          color: '#DC2626',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        }}
      >
        <Flame size={12} /> HOT
      </span>
    )
  }
  if (t === 'cold') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 600,
          background: 'rgba(59, 130, 246, 0.1)',
          color: '#2563EB',
          border: '1px solid rgba(59, 130, 246, 0.25)',
        }}
      >
        COLD
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        background: 'rgba(245, 158, 11, 0.12)',
        color: '#D97706',
        border: '1px solid rgba(245, 158, 11, 0.3)',
      }}
    >
      WARM
    </span>
  )
}

function formatOutcome(status?: string | null) {
  if (!status) return 'None'
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ContactCenter() {
  const { role } = useStaffRole()
  const isPrivileged = role === 'admin' || role === 'sales_manager' || role === 'manager'
  const isAdmin = role === 'admin'
  const isSalesperson = role === 'salesperson'

  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as any

  // Tabs
  const [activeTab, setActiveTab] = useState<
    'overview' | 'all' | 'connected' | 'not_connected' | 'not_contacted' | 'follow_up' | 'daily_history' | 'performance'
  >(
    tabParam && ['overview', 'all', 'connected', 'not_connected', 'not_contacted', 'follow_up', 'daily_history', 'performance'].includes(tabParam)
      ? tabParam
      : 'overview'
  )

  // Data states
  const [summary, setSummary] = useState<ContactCenterSummary | null>(null)
  const [contacts, setContacts] = useState<ContactItem[]>([])
  const [totalContacts, setTotalContacts] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [dailyCalls, setDailyCalls] = useState<DailyCallItem[]>([])
  const [performance, setPerformance] = useState<PerformanceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [temperature, setTemperature] = useState('')
  const [slaOnly, setSlaOnly] = useState(false)
  const [sortBy, setSortBy] = useState('newest')

  // Modals
  const [activeCallContact, setActiveCallContact] = useState<ContactItem | null>(null)
  const [detailLeadId, setDetailLeadId] = useState<number | null>(null)
  const [showSlaModal, setShowSlaModal] = useState(false)
  const [slaThresholdHours, setSlaThresholdHours] = useState(24)
  const [updatingSla, setUpdatingSla] = useState(false)

  // Tab switcher sync with URL
  const switchTab = (tab: typeof activeTab) => {
    setActiveTab(tab)
    setSearchParams({ tab })
    setPage(1)
  }

  // 1. Load Summary & SLA Config
  const loadSummaryAndSla = useCallback(async () => {
    try {
      const [sum, sla] = await Promise.all([
        getContactCenterSummary(),
        getSlaConfig().catch(() => ({ threshold_hours: 24 })),
      ])
      setSummary(sum)
      setSlaThresholdHours(sla.threshold_hours)
    } catch (e: any) {
      console.error('Failed to load summary', e)
    }
  }, [])

  // 2. Load Contacts List based on activeTab & filters
  const loadContacts = useCallback(async () => {
    if (['overview', 'daily_history', 'performance'].includes(activeTab)) return
    setLoading(true)
    setError(null)
    try {
      const mappedTab = activeTab === 'all' ? 'all' : (activeTab as any)
      const res = await listContacts({
        tab: mappedTab,
        search: search.trim() || undefined,
        temperature: temperature || undefined,
        sla_breached_only: slaOnly,
        page,
        limit: 20,
        sort_by: sortBy,
      })
      setContacts(res.contacts)
      setTotalContacts(res.total)
      setTotalPages(res.total_pages)
    } catch (e: any) {
      setError(e.message || 'Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }, [activeTab, search, temperature, slaOnly, page, sortBy])

  // 3. Load Daily Call History
  const loadDailyHistory = useCallback(async () => {
    if (activeTab !== 'daily_history') return
    setLoading(true)
    try {
      const res = await getDailyCallHistory(undefined, 50)
      setDailyCalls(res.calls)
    } catch (e: any) {
      setError(e.message || 'Failed to load call history')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  // 4. Load Performance
  const loadPerformance = useCallback(async () => {
    if (activeTab !== 'performance' || !isPrivileged) return
    setLoading(true)
    try {
      const res = await getPerformanceComparison()
      setPerformance(res.results)
    } catch (e: any) {
      setError(e.message || 'Failed to load performance metrics')
    } finally {
      setLoading(false)
    }
  }, [activeTab, isPrivileged])

  // Initial load & Tab changes
  useEffect(() => {
    loadSummaryAndSla()
  }, [loadSummaryAndSla])

  useEffect(() => {
    if (['all', 'connected', 'not_connected', 'not_contacted', 'follow_up'].includes(activeTab)) {
      loadContacts()
    } else if (activeTab === 'daily_history') {
      loadDailyHistory()
    } else if (activeTab === 'performance') {
      loadPerformance()
    }
  }, [activeTab, loadContacts, loadDailyHistory, loadPerformance])

  // Save SLA threshold
  const handleSaveSla = async () => {
    setUpdatingSla(true)
    try {
      await updateSlaConfig(slaThresholdHours)
      setShowSlaModal(false)
      loadSummaryAndSla()
      if (['all', 'not_contacted'].includes(activeTab)) {
        loadContacts()
      }
    } catch (e: any) {
      alert(`Failed to update SLA: ${e.message}`)
    } finally {
      setUpdatingSla(false)
    }
  }

  // CSV Export Trigger
  const handleExportCsv = async () => {
    try {
      const mappedTab = ['overview', 'daily_history', 'performance'].includes(activeTab) ? 'all' : activeTab
      await downloadContactsCsv({
        tab: mappedTab as any,
        search: search.trim() || undefined,
        temperature: temperature || undefined,
        sla_breached_only: slaOnly,
      })
    } catch (e: any) {
      alert(`Failed to export CSV: ${e.message}`)
    }
  }

  const pageTitle = isAdmin
    ? 'Customer Contact Monitoring'
    : role === 'sales_manager' || role === 'manager'
    ? 'Team Contact Monitoring'
    : 'Customer Contact Center'

  const pageSubtitle = isAdmin
    ? 'Company-wide customer contact oversight, connection rates, and real-time SLA breach monitoring'
    : role === 'sales_manager' || role === 'manager'
    ? 'Team-wide lead follow-through, agent call monitoring, and overdue follow-up management'
    : 'My assigned customer contacts, structured call attempt logging, and follow-up scheduler'

  const myContactsLabel = isSalesperson
    ? 'My Customer Contacts'
    : role === 'sales_manager' || role === 'manager'
    ? 'Team Contacts'
    : 'All Customer Contacts'

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1440px', margin: '0 auto', color: '#26232B' }}>
      {/* ─── Top Brand Header ─── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
          borderBottom: '1px solid rgba(198, 161, 91, 0.25)',
          paddingBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#C6A15B',
                boxShadow: '0 4px 14px rgba(59, 35, 72, 0.25)',
              }}
            >
              <PhoneCall size={22} />
            </div>
            <div>
              <h1
                className="luxury-serif"
                style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  color: '#3B2348',
                  margin: 0,
                  letterSpacing: '0.02em',
                }}
              >
                {pageTitle}
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: '#6B7280' }}>
                {pageSubtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowSlaModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 15px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                background: '#FAF7F0',
                border: '1px solid #C6A15B',
                color: '#3B2348',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Sliders size={15} color="#C6A15B" />
              SLA Settings ({summary?.sla_threshold_hours || slaThresholdHours}h)
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 15px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              background: '#FAF7F0',
              border: '1px solid #D1D5DB',
              color: '#374151',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Download size={15} />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => {
              loadSummaryAndSla()
              if (['all', 'connected', 'not_connected', 'not_contacted', 'follow_up'].includes(activeTab)) {
                loadContacts()
              } else if (activeTab === 'daily_history') {
                loadDailyHistory()
              } else if (activeTab === 'performance') {
                loadPerformance()
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(59, 35, 72, 0.2)',
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* ─── SLA Breach Alert Banner ─── */}
      {summary && summary.sla_breaches_count > 0 && (
        <div
          style={{
            background: 'linear-gradient(90deg, #FEF2F2 0%, #FEE2E2 100%)',
            border: '1px solid #FCA5A5',
            borderRadius: '10px',
            padding: '14px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#EF4444',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#991B1B' }}>
                {summary.sla_breaches_count} Lead{summary.sla_breaches_count > 1 ? 's' : ''} Exceeded SLA
                Threshold ({summary.sla_threshold_hours}h)
              </div>
              <div style={{ fontSize: '12.5px', color: '#B91C1C' }}>
                These customer inquiries have received 0 call attempts. Immediate action required to maintain service standards.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              switchTab('not_contacted')
              setSlaOnly(true)
            }}
            style={{
              padding: '7px 14px',
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Review SLA Breaches
          </button>
        </div>
      )}

      {/* ─── Navigation Tabs ─── */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          borderBottom: '2px solid #E5E7EB',
          marginBottom: '20px',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            switchTab('overview')
            setSlaOnly(false)
          }}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: activeTab === 'overview' ? 700 : 500,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'overview' ? '#3B2348' : '#6B7280',
            borderBottom: activeTab === 'overview' ? '3px solid #C6A15B' : '3px solid transparent',
            marginBottom: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <BarChart2 size={16} />
          Overview
        </button>

        <button
          type="button"
          onClick={() => {
            switchTab('all')
            setSlaOnly(false)
          }}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: activeTab === 'all' ? 700 : 500,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'all' ? '#3B2348' : '#6B7280',
            borderBottom: activeTab === 'all' ? '3px solid #C6A15B' : '3px solid transparent',
            marginBottom: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <User size={16} />
          {myContactsLabel}
          {summary && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: '#EEE7F2',
                color: '#3B2348',
                fontWeight: 700,
              }}
            >
              {summary.total_leads}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            switchTab('connected')
            setSlaOnly(false)
          }}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: activeTab === 'connected' ? 700 : 500,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'connected' ? '#3B2348' : '#6B7280',
            borderBottom: activeTab === 'connected' ? '3px solid #C6A15B' : '3px solid transparent',
            marginBottom: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} color="#16A34A" />
          Connected Calls
          {summary && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: 'rgba(22, 163, 74, 0.12)',
                color: '#16A34A',
                fontWeight: 700,
              }}
            >
              {summary.connected_leads}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            switchTab('not_connected')
            setSlaOnly(false)
          }}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: activeTab === 'not_connected' ? 700 : 500,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'not_connected' ? '#3B2348' : '#6B7280',
            borderBottom: activeTab === 'not_connected' ? '3px solid #C6A15B' : '3px solid transparent',
            marginBottom: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <PhoneMissed size={16} color="#D97706" />
          Not Connected
          {summary && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: 'rgba(217, 119, 6, 0.12)',
                color: '#D97706',
                fontWeight: 700,
              }}
            >
              {summary.not_connected_leads}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            switchTab('not_contacted')
          }}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: activeTab === 'not_contacted' ? 700 : 500,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'not_contacted' ? '#3B2348' : '#6B7280',
            borderBottom: activeTab === 'not_contacted' ? '3px solid #C6A15B' : '3px solid transparent',
            marginBottom: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Clock size={16} color="#DC2626" />
          Not Contacted
          {summary && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: summary.not_contacted_leads > 0 ? 'rgba(220, 38, 38, 0.12)' : '#EEE7F2',
                color: summary.not_contacted_leads > 0 ? '#DC2626' : '#3B2348',
                fontWeight: 700,
              }}
            >
              {summary.not_contacted_leads}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            switchTab('follow_up')
            setSlaOnly(false)
          }}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: activeTab === 'follow_up' ? 700 : 500,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'follow_up' ? '#3B2348' : '#6B7280',
            borderBottom: activeTab === 'follow_up' ? '3px solid #C6A15B' : '3px solid transparent',
            marginBottom: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Calendar size={16} color="#7C3AED" />
          Follow-ups
          {summary && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: 'rgba(124, 58, 237, 0.12)',
                color: '#7C3AED',
                fontWeight: 700,
              }}
            >
              {summary.pending_followups}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => switchTab('daily_history')}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: activeTab === 'daily_history' ? 700 : 500,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'daily_history' ? '#3B2348' : '#6B7280',
            borderBottom: activeTab === 'daily_history' ? '3px solid #C6A15B' : '3px solid transparent',
            marginBottom: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Phone size={16} />
          Daily Call History
        </button>

        {isPrivileged && (
          <button
            type="button"
            onClick={() => switchTab('performance')}
            style={{
              padding: '10px 18px',
              fontSize: '13.5px',
              fontWeight: activeTab === 'performance' ? 700 : 500,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: activeTab === 'performance' ? '#3B2348' : '#6B7280',
              borderBottom: activeTab === 'performance' ? '3px solid #C6A15B' : '3px solid transparent',
              marginBottom: '-2px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <ShieldAlert size={16} color="#C6A15B" />
            {isAdmin ? 'Agent Performance' : 'Team Performance'}
          </button>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. OVERVIEW TAB */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && summary && (
        <div>
          {/* Key Metric Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '28px',
            }}
          >
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '12.5px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Total Inquiries
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#3B2348', marginTop: '6px' }}>
                {summary.total_leads}
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
                {summary.contacted_leads} contacted ({Math.round((summary.contacted_leads / (summary.total_leads || 1)) * 100)}%)
              </div>
            </div>

            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '12.5px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Connection Rate
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: summary.connection_rate >= 50 ? '#16A34A' : '#D97706',
                  marginTop: '6px',
                }}
              >
                {summary.connection_rate}%
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
                {summary.connected_leads} connected of {summary.contacted_leads} contacted
              </div>
            </div>

            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '12.5px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Calls Today
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#3B2348', marginTop: '6px' }}>
                {summary.calls_today}
              </div>
              <div style={{ fontSize: '12px', color: '#16A34A', marginTop: '4px', fontWeight: 600 }}>
                {summary.connected_today} connected today
              </div>
            </div>

            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '12.5px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Avg Call Duration
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#3B2348', marginTop: '6px' }}>
                {summary.avg_duration_minutes}m
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>Across connected calls</div>
            </div>

            <div
              style={{
                background: summary.sla_breaches_count > 0 ? '#FEF2F2' : '#FFFFFF',
                borderRadius: '12px',
                border: summary.sla_breaches_count > 0 ? '1px solid #FCA5A5' : '1px solid #E5E7EB',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}
            >
              <div
                style={{
                  fontSize: '12.5px',
                  color: summary.sla_breaches_count > 0 ? '#DC2626' : '#6B7280',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                SLA Breaches (&gt;{summary.sla_threshold_hours}h)
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: summary.sla_breaches_count > 0 ? '#DC2626' : '#16A34A',
                  marginTop: '6px',
                }}
              >
                {summary.sla_breaches_count}
              </div>
              <div style={{ fontSize: '12px', color: summary.sla_breaches_count > 0 ? '#B91C1C' : '#9CA3AF', marginTop: '4px' }}>
                {summary.not_contacted_leads} total uncontacted
              </div>
            </div>
          </div>

          {/* Quick Action Navigation Grid */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
              padding: '24px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
            }}
          >
            <h2 className="luxury-serif" style={{ fontSize: '18px', color: '#3B2348', margin: '0 0 16px' }}>
              Quick Contact Queues
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div
                onClick={() => switchTab('not_contacted')}
                style={{
                  border: '1px solid #FCA5A5',
                  background: '#FFF5F5',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#991B1B' }}>Uncontacted Leads</div>
                  <span style={{ background: '#DC2626', color: '#fff', padding: '3px 9px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                    {summary.not_contacted_leads}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#7F1D1D', margin: '8px 0 0' }}>
                  Fresh incoming inquiries that haven't been called yet. Start calling now to prevent SLA breaches.
                </p>
              </div>

              <div
                onClick={() => switchTab('follow_up')}
                style={{
                  border: '1px solid #DDD6FE',
                  background: '#F5F3FF',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#5B21B6' }}>Pending Follow-ups</div>
                  <span style={{ background: '#7C3AED', color: '#fff', padding: '3px 9px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                    {summary.pending_followups}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#4C1D95', margin: '8px 0 0' }}>
                  Scheduled follow-ups and requested callbacks waiting for action.
                </p>
              </div>

              <div
                onClick={() => switchTab('not_connected')}
                style={{
                  border: '1px solid #FDE68A',
                  background: '#FFFBEB',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#92400E' }}>Retry Not Connected</div>
                  <span style={{ background: '#D97706', color: '#fff', padding: '3px 9px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                    {summary.not_connected_leads}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#78350F', margin: '8px 0 0' }}>
                  Called but unanswered, busy, or unreachable. Ready for attempt #2 or #3.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. CONTACTS LIST TABS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {['all', 'connected', 'not_connected', 'not_contacted', 'follow_up'].includes(activeTab) && (
        <div>
          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '16px',
              background: '#FFFFFF',
              padding: '14px 18px',
              borderRadius: '10px',
              border: '1px solid #E5E7EB',
            }}
          >
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', position: 'relative' }}>
              <Search size={16} color="#9CA3AF" style={{ position: 'absolute', left: '10px' }} />
              <input
                type="text"
                placeholder="Search name, phone, email, location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadContacts()}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 32px',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Temperature Filter */}
            <select
              value={temperature}
              onChange={(e) => {
                setTemperature(e.target.value)
                setPage(1)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                fontSize: '13px',
                background: '#fff',
              }}
            >
              <option value="">All Temperatures</option>
              <option value="Hot">Hot Leads Only</option>
              <option value="Warm">Warm Leads Only</option>
              <option value="Cold">Cold Leads Only</option>
            </select>

            {/* Sort By */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                fontSize: '13px',
                background: '#fff',
              }}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="last_called">Recently Called</option>
              <option value="temperature">Lead Temperature</option>
              <option value="sla">SLA Urgency</option>
            </select>

            {/* SLA Breached Only Pill */}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                color: slaOnly ? '#DC2626' : '#4B5563',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={slaOnly}
                onChange={(e) => {
                  setSlaOnly(e.target.checked)
                  setPage(1)
                }}
                style={{ cursor: 'pointer' }}
              />
              SLA Breaches Only
            </label>

            <button
              type="button"
              onClick={loadContacts}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                background: '#FAF7F0',
                border: '1px solid #C6A15B',
                color: '#3B2348',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
          </div>

          {/* Contacts Table */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
              overflow: 'hidden',
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
            }}
          >
            {loading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block', color: '#C6A15B' }} />
                Loading contacts...
              </div>
            ) : error ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#DC2626' }}>
                <AlertTriangle size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                {error}
              </div>
            ) : contacts.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#6B7280' }}>
                <User size={32} style={{ margin: '0 auto 12px', display: 'block', color: '#D1D5DB' }} />
                <div style={{ fontWeight: 600, fontSize: '16px', color: '#374151' }}>No contacts found</div>
                <p style={{ fontSize: '13.5px', marginTop: '4px' }}>
                  No leads match the selected filter criteria for this queue.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', minWidth: '1000px' }}>
                  <thead>
                    <tr style={{ background: '#FAF8F4', borderBottom: '1px solid #E5E7EB', color: '#4B5563', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '12px 16px' }}>Customer Name</th>
                      <th style={{ padding: '12px 16px' }}>Phone Number</th>
                      <th style={{ padding: '12px 16px' }}>Location &amp; Type</th>
                      <th style={{ padding: '12px 16px' }}>Budget</th>
                      <th style={{ padding: '12px 16px' }}>Source</th>
                      <th style={{ padding: '12px 16px' }}>Temperature</th>
                      <th style={{ padding: '12px 16px' }}>Stage</th>
                      <th style={{ padding: '12px 16px' }}>First Call Status</th>
                      <th style={{ padding: '12px 16px' }}>Latest Outcome</th>
                      <th style={{ padding: '12px 16px' }}>Attempts</th>
                      <th style={{ padding: '12px 16px' }}>Last Contacted</th>
                      <th style={{ padding: '12px 16px' }}>Next Follow-up</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c) => {
                      const phoneDisplay = c.contact_phone && c.contact_phone.trim() ? c.contact_phone : 'Phone number not provided'
                      const budgetDisplay = c.budget_max
                        ? c.budget_min
                          ? `AED ${c.budget_min.toLocaleString()} - ${c.budget_max.toLocaleString()}`
                          : `Up to AED ${c.budget_max.toLocaleString()}`
                        : 'Not specified'

                      return (
                        <tr
                          key={c.lead_id}
                          style={{
                            borderBottom: '1px solid #F3F4F6',
                            background: c.sla_breached ? '#FFF8F8' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          {/* Customer Name */}
                          <td style={{ padding: '12px 16px' }}>
                            <div
                              onClick={() => setDetailLeadId(c.lead_id)}
                              style={{
                                fontWeight: 700,
                                color: '#3B2348',
                                cursor: 'pointer',
                              }}
                            >
                              {c.customer_name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{c.contact_email}</div>
                          </td>

                          {/* Phone Number */}
                          <td style={{ padding: '12px 16px', color: c.contact_phone ? '#1F2937' : '#9CA3AF', whiteSpace: 'nowrap' }}>
                            {phoneDisplay}
                          </td>

                          {/* Location & Type */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#1F2937' }}>{c.location}</div>
                            <div style={{ fontSize: '11.5px', color: '#6B7280' }}>{c.property_type} • {c.purpose || 'Buy'}</div>
                          </td>

                          {/* Budget */}
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: '#374151', whiteSpace: 'nowrap' }}>
                            {budgetDisplay}
                          </td>

                          {/* Lead Source */}
                          <td style={{ padding: '12px 16px', color: '#4B5563', fontSize: '12px' }}>
                            {c.lead_source || 'Website'}
                          </td>

                          {/* Temperature */}
                          <td style={{ padding: '12px 16px' }}>{getTemperatureBadge(c.lead_temperature)}</td>

                          {/* Lead Stage */}
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                textTransform: 'uppercase',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                background: '#F1F5F9',
                                color: '#3B2348',
                                fontWeight: 700,
                              }}
                            >
                              {c.status}
                            </span>
                          </td>

                          {/* First Call Status */}
                          <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                            {c.total_call_attempts === 0 ? (
                              <span style={{ color: '#9CA3AF' }}>Pending</span>
                            ) : c.first_call_status ? (
                              <span style={{ fontWeight: 600, color: '#16A34A' }}>
                                {formatOutcome(c.first_call_status)}
                              </span>
                            ) : (
                              <span style={{ color: '#6B7280' }}>Recorded</span>
                            )}
                          </td>

                          {/* Latest Outcome */}
                          <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                            {c.last_call?.status ? (
                              <span style={{ fontWeight: 600, color: '#3B2348' }}>
                                {formatOutcome(c.last_call.status)}
                              </span>
                            ) : (
                              <span style={{ color: '#9CA3AF' }}>Never called</span>
                            )}
                          </td>

                          {/* Total Call Attempts */}
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                fontSize: '11.5px',
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: '6px',
                                background: c.is_connected
                                  ? 'rgba(22, 163, 74, 0.12)'
                                  : c.total_call_attempts > 0
                                  ? 'rgba(217, 119, 6, 0.12)'
                                  : '#EEE7F2',
                                color: c.is_connected
                                  ? '#16A34A'
                                  : c.total_call_attempts > 0
                                  ? '#D97706'
                                  : '#3B2348',
                              }}
                            >
                              {c.total_call_attempts}
                            </span>
                          </td>

                          {/* Last Contacted */}
                          <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {c.last_contacted_date ? new Date(c.last_contacted_date).toLocaleDateString() : 'Never'}
                          </td>

                          {/* Next Follow-up */}
                          <td style={{ padding: '12px 16px', color: '#7C3AED', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {c.next_follow_up_at ? new Date(c.next_follow_up_at).toLocaleDateString() : 'None'}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setActiveCallContact(c)}
                                style={{
                                  padding: '6px 11px',
                                  borderRadius: '6px',
                                  background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 2px 6px rgba(59, 35, 72, 0.2)',
                                }}
                              >
                                <PhoneCall size={12} color="#C6A15B" />
                                Log Call
                              </button>

                              <button
                                type="button"
                                onClick={() => setDetailLeadId(c.lead_id)}
                                style={{
                                  padding: '6px 9px',
                                  borderRadius: '6px',
                                  background: '#FAF7F0',
                                  color: '#3B2348',
                                  border: '1px solid #D1D5DB',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <Eye size={12} />
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Bar */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 20px',
                  background: '#FAF8F4',
                  borderTop: '1px solid #E5E7EB',
                  fontSize: '13px',
                  color: '#6B7280',
                }}
              >
                <div>
                  Showing {contacts.length} of {totalContacts} contacts (Page {page} of {totalPages})
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: '1px solid #D1D5DB',
                      background: page <= 1 ? '#F3F4F6' : '#FFFFFF',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '12.5px',
                    }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: '1px solid #D1D5DB',
                      background: page >= totalPages ? '#F3F4F6' : '#FFFFFF',
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                      fontSize: '12.5px',
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. DAILY CALL HISTORY TAB */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'daily_history' && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E5E7EB',
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', background: '#FAF8F4' }}>
            <h3 className="luxury-serif" style={{ margin: 0, fontSize: '16px', color: '#3B2348' }}>
              Real-time Chronological Call Activity
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#6B7280' }}>
              Showing the latest {dailyCalls.length} call logs across the sales team
            </p>
          </div>

          {loading ? (
            <div style={{ padding: '50px', textAlign: 'center', color: '#6B7280' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block', color: '#C6A15B' }} />
              Loading call logs...
            </div>
          ) : dailyCalls.length === 0 ? (
            <div style={{ padding: '50px', textAlign: 'center', color: '#6B7280' }}>
              No calls have been logged yet today.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#FAF8F4', borderBottom: '1px solid #E5E7EB', color: '#4B5563', fontSize: '12px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 16px' }}>Time</th>
                    <th style={{ padding: '12px 16px' }}>Customer &amp; Phone</th>
                    <th style={{ padding: '12px 16px' }}>Agent</th>
                    <th style={{ padding: '12px 16px' }}>Outcome</th>
                    <th style={{ padding: '12px 16px' }}>Attempt #</th>
                    <th style={{ padding: '12px 16px' }}>Customer Response</th>
                    <th style={{ padding: '12px 16px' }}>Recommended Action</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyCalls.map((call) => (
                    <tr key={call.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '12px 16px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {call.attempted_at ? new Date(call.attempted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#3B2348' }}>{call.customer_name}</div>
                        <div style={{ fontSize: '11px', color: '#6B7280' }}>
                          {call.contact_phone && call.contact_phone.trim() ? call.contact_phone : 'Phone number not provided'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#374151' }}>
                        {call.staff_name || call.staff_email}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            background: call.is_connected ? 'rgba(22, 163, 74, 0.12)' : 'rgba(217, 119, 6, 0.12)',
                            color: call.is_connected ? '#16A34A' : '#D97706',
                          }}
                        >
                          {formatOutcome(call.status)}
                          {call.duration_minutes ? ` (${call.duration_minutes}m)` : ''}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontWeight: 700, color: '#3B2348' }}>#{call.attempt_number}</span>
                        {call.is_first_call && (
                          <span style={{ marginLeft: '6px', fontSize: '10.5px', color: '#C6A15B', fontWeight: 700 }}>
                            ★ First
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#4B5563', maxWidth: '240px' }}>
                        {call.customer_response || call.notes || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#6B7280', maxWidth: '200px' }}>
                        {call.recommended_action || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setDetailLeadId(call.lead_id)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: '#FAF7F0',
                            color: '#3B2348',
                            border: '1px solid #D1D5DB',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Eye size={12} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. AGENT PERFORMANCE COMPARISON TAB */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'performance' && isPrivileged && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E5E7EB',
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', background: '#FAF8F4' }}>
            <h3 className="luxury-serif" style={{ margin: 0, fontSize: '16px', color: '#3B2348' }}>
              Salesperson Calling Activity &amp; SLA Compliance
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#6B7280' }}>
              Comparison of assigned lead follow-through, connection rates, and SLA adherence across team members
            </p>
          </div>

          {loading ? (
            <div style={{ padding: '50px', textAlign: 'center', color: '#6B7280' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block', color: '#C6A15B' }} />
              Loading performance metrics...
            </div>
          ) : performance.length === 0 ? (
            <div style={{ padding: '50px', textAlign: 'center', color: '#6B7280' }}>
              No staff performance data available.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
                <thead>
                  <tr style={{ background: '#FAF8F4', borderBottom: '1px solid #E5E7EB', color: '#4B5563', fontSize: '12px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 16px' }}>Agent Name</th>
                    <th style={{ padding: '12px 16px' }}>Assigned Leads</th>
                    <th style={{ padding: '12px 16px' }}>Calls Attempted</th>
                    <th style={{ padding: '12px 16px' }}>Connected</th>
                    <th style={{ padding: '12px 16px' }}>Connection Rate</th>
                    <th style={{ padding: '12px 16px' }}>Follow-ups Done</th>
                    <th style={{ padding: '12px 16px' }}>Avg Duration</th>
                    <th style={{ padding: '12px 16px' }}>SLA Breaches</th>
                    <th style={{ padding: '12px 16px' }}>SLA Compliance</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map((p) => {
                    const slaColor = p.sla_compliance_rate >= 90 ? '#16A34A' : p.sla_compliance_rate >= 70 ? '#D97706' : '#DC2626'
                    return (
                      <tr key={p.staff_email} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 700, color: '#3B2348' }}>{p.staff_name}</div>
                          <div style={{ fontSize: '11.5px', color: '#9CA3AF' }}>{p.staff_email}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>{p.total_assigned}</td>
                        <td style={{ padding: '14px 16px' }}>{p.calls_attempted}</td>
                        <td style={{ padding: '14px 16px', color: '#16A34A', fontWeight: 600 }}>
                          {p.calls_connected}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontWeight: 700, color: p.connection_rate >= 50 ? '#16A34A' : '#D97706' }}>
                              {p.connection_rate}%
                            </div>
                            <div style={{ width: '60px', height: '6px', background: '#E5E7EB', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, p.connection_rate)}%`, height: '100%', background: p.connection_rate >= 50 ? '#16A34A' : '#D97706' }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#7C3AED', fontWeight: 600 }}>
                          {p.follow_ups_completed}
                        </td>
                        <td style={{ padding: '14px 16px' }}>{p.avg_duration_minutes}m</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontWeight: 700, color: p.sla_breaches > 0 ? '#DC2626' : '#16A34A' }}>
                            {p.sla_breaches}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: slaColor,
                              background: `${slaColor}18`,
                            }}
                          >
                            {p.sla_compliance_rate}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Modals */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeCallContact && (
        <LogCallModal
          leadId={activeCallContact.lead_id}
          customerName={activeCallContact.customer_name}
          phone={activeCallContact.contact_phone}
          totalAttempts={activeCallContact.total_call_attempts}
          currentTemperature={activeCallContact.lead_temperature}
          onClose={() => setActiveCallContact(null)}
          onSuccess={() => {
            loadSummaryAndSla()
            if (['all', 'connected', 'not_connected', 'not_contacted', 'follow_up'].includes(activeTab)) {
              loadContacts()
            }
          }}
        />
      )}

      {detailLeadId !== null && (
        <CustomerDetailsModal
          leadId={detailLeadId}
          onClose={() => setDetailLeadId(null)}
          onLogCall={(leadId, name, phone) => {
            setDetailLeadId(null)
            setActiveCallContact({
              lead_id: leadId,
              customer_name: name || '',
              contact_phone: phone || '',
              contact_email: '',
              location: '',
              property_type: '',
              lead_temperature: 'Warm',
              status: 'new',
              created_at: null,
              total_call_attempts: 0,
              is_connected: false,
              sla_hours_elapsed: 0,
              sla_breached: false,
            })
          }}
        />
      )}

      {/* SLA Threshold Config Modal (Admin only) */}
      {showSlaModal && isAdmin && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28, 10, 30, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSlaModal(false)
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '14px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              border: '1px solid #C6A15B',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 className="luxury-serif" style={{ margin: 0, fontSize: '18px', color: '#3B2348' }}>
                Configure Contact SLA Threshold
              </h3>
              <button
                type="button"
                onClick={() => setShowSlaModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.5, margin: '0 0 20px' }}>
              New customer inquiries that remain uncalled for longer than this duration will be marked as{' '}
              <strong style={{ color: '#DC2626' }}>SLA Breaches</strong> and surfaced prominently on all manager and
              admin dashboards.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
                Threshold (Hours)
              </label>
              <input
                type="number"
                min={1}
                max={168}
                value={slaThresholdHours}
                onChange={(e) => setSlaThresholdHours(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #D1D5DB',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowSlaModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#F3F4F6',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#4B5563',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSla}
                disabled={updatingSla}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  cursor: updatingSla ? 'not-allowed' : 'pointer',
                }}
              >
                {updatingSla ? 'Updating...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
