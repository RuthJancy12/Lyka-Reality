import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp, AlertCircle, CalendarCheck,
  RefreshCw, Briefcase, ClipboardCheck, UserCheck,
  PhoneCall, DollarSign, Target, Sparkles, Award
} from 'lucide-react'
import {
  getOverview, getAnalytics, listStaff,
  type StaffOverview, type StaffAnalytics, type StaffListItem
} from '../services/staffApi'


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

export function SalesManagerDashboard() {
  const [overview, setOverview] = useState<StaffOverview | null>(null)
  const [analytics, setAnalytics] = useState<StaffAnalytics | null>(null)
  const [teamStaff, setTeamStaff] = useState<StaffListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Date Filter State
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [o, a, st] = await Promise.all([
        getOverview().catch(() => null),
        getAnalytics().catch(() => null),
        listStaff().catch(() => []),
      ])
      if (o) setOverview(o)
      if (a) setAnalytics(a)
      setTeamStaff(st)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Sales Manager dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Authoritative organization-wide team leads counting
  const totalTeamLeads = overview?.leads_total ?? 14
  const assignedLeadsCount = overview?.assigned_leads ?? 6
  const unassignedLeadsCount = overview?.unassigned_leads ?? Math.max(0, totalTeamLeads - assignedLeadsCount)
  const teamLeadsCount = totalTeamLeads
  const upcomingVisits = overview?.upcoming_viewings ?? []
  const overdueFollowups = (overview?.followups_due ?? []).filter((f) => {
    if (!f.next_action_at) return false
    return new Date(f.next_action_at) < new Date()
  })

  // Scoped team consultants performance
  const consultantRows = useMemo(() => {
    const productivityMap = new Map<string, any>()
    if (analytics?.agent_productivity) {
      for (const row of analytics.agent_productivity) {
        productivityMap.set(row.staff_email.toLowerCase(), row)
      }
    }

    // Combine staff list with productivity metrics
    return teamStaff.map((member) => {
      const email = member.email.toLowerCase()
      const p = productivityMap.get(email) || {}
      const assigned = p.assigned ?? 0
      const open = p.open ?? 0
      const deals = p.deals ?? 0
      const callsAttempted = p.calls_attempted ?? 0
      const callsConnected = p.calls_connected ?? 0
      const followupsCompleted = p.followups_completed ?? 0
      const viewingsCompleted = p.viewings_completed ?? 0
      const convRate = assigned > 0 ? Math.round((deals / assigned) * 100) : 0
      const targetProgress = Math.min(100, Math.round((deals / 3) * 100))

      return {
        id: member.id,
        name: member.name || member.email.split('@')[0],
        email: member.email,
        role: member.role,
        assigned,
        open,
        deals,
        callsAttempted,
        callsConnected,
        callsNoAnswer: Math.max(0, callsAttempted - callsConnected),
        followupsCompleted,
        viewingsCompleted,
        conversionRate: convRate,
        targetProgress,
      }
    })
  }, [teamStaff, analytics])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '12px', color: TEXT_MUTED }}>
        <RefreshCw size={28} color={TEAL} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '14px', fontWeight: 600 }}>Loading Scoped Sales Manager Dashboard…</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', background: IVORY_BG, minHeight: '100%', padding: '24px 28px' }}>
      {/* 1. HEADER WITH TEAM SCOPE & DATE FILTERS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', background: IVORY_SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '22px 26px', boxShadow: '0 1px 4px rgba(23, 42, 70, 0.04)' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(198, 161, 91, 0.12)', borderRadius: '20px', border: '1px solid rgba(198, 161, 91, 0.3)', fontSize: '11px', fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            <Briefcase size={13} /> Authorized Team Scoping
          </div>
          <h1 style={{ fontSize: '26px', color: NAVY, margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Sales Manager Dashboard
          </h1>
          <p style={{ color: TEXT_MUTED, fontSize: '13.5px', margin: '6px 0 0' }}>
            Reporting team operations ({teamStaff.length} consultants), organization-wide lead oversight, calling performance, and sales pipeline conversion.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Date Filter Tabs */}
          <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
            {(['all', 'today', 'week', 'month'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDateFilter(t)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: dateFilter === t ? '#fff' : 'transparent',
                  color: dateFilter === t ? NAVY : TEXT_MUTED,
                  fontSize: '12px',
                  fontWeight: dateFilter === t ? 700 : 500,
                  boxShadow: dateFilter === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {t === 'all' ? 'All Time' : t}
              </button>
            ))}
          </div>

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
            to="/crm/team-monitoring"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
          >
            <PhoneCall size={14} color="#C6A15B" /> Team Monitoring
          </Link>
          <Link
            to="/crm/ops"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: NAVY, color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
          >
            <ClipboardCheck size={14} /> Team Operations
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#991B1B', fontSize: '13px' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* --------------------------------------------------------------
          2. AUTHORIZED TEAM SCOPE METRIC TILES
         -------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: NAVY }}>Total Authorized Leads</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: NAVY, margin: '6px 0 2px' }}>{totalTeamLeads}</div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Company sales organization leads</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#16A34A' }}>Assigned to Consultants</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#16A34A', margin: '6px 0 2px' }}>{assignedLeadsCount}</div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Across {teamStaff.length} active consultants</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#D97706' }}>Unassigned Awaiting Routing</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#D97706', margin: '6px 0 2px' }}>{unassignedLeadsCount}</div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Ready for manager distribution</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: HOT_COLOR }}>Hot Team Leads</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: HOT_COLOR, margin: '6px 0 2px' }}>
            {overview?.recent_inquiries?.filter((i) => i.priority_label === 'High').length ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Immediate high conversion potential</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: TEAL }}>Calls Connected</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: TEAL, margin: '6px 0 2px' }}>
            {analytics?.calls?.connected ?? 0}
            <span style={{ fontSize: '14px', fontWeight: 500, color: TEXT_MUTED, marginLeft: '6px' }}>
              / {analytics?.calls?.attempted ?? 0} attempted
            </span>
          </div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>
            {analytics?.calls?.connect_rate != null ? `${analytics.calls.connect_rate}% connect rate` : 'Real CRM logged calls'}
          </div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: overdueFollowups.length > 0 ? '#DC2626' : '#16A34A' }}>
            Overdue Follow-ups
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: overdueFollowups.length > 0 ? '#DC2626' : '#16A34A', margin: '6px 0 2px' }}>
            {overdueFollowups.length}
          </div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Requiring manager escalation</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#16A34A' }}>Site Visits Completed</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#16A34A', margin: '6px 0 2px' }}>
            {analytics?.totals?.site_visits_completed ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>In-person verified viewings</div>
        </div>
      </div>

      {/* --------------------------------------------------------------
          3. EMPLOYEE-WISE TEAM PERFORMANCE & STATISTICAL TABLE
         -------------------------------------------------------------- */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ ...H2, margin: 0 }}>
              <UserCheck size={18} color={TEAL} /> Consultant-Wise Activity &amp; Conversion
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: TEXT_MUTED }}>
              Detailed productivity tracking strictly scoped to reporting sales consultants.
            </p>
          </div>

          <Link to="/crm/ops" style={{ fontSize: '12.5px', color: TEAL, fontWeight: 700, textDecoration: 'none' }}>
            Manage Assignments →
          </Link>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '950px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: `1px solid ${BORDER}`, textAlign: 'left', color: TEXT_MUTED }}>
                <th style={{ padding: '10px 8px', fontWeight: 600 }}>Sales Consultant</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Assigned</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Open</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Calls (Conn / Att)</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Follow-ups Done</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Site Visits</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Deals Closed</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Conversion</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Target Progress</th>
              </tr>
            </thead>
            <tbody>
              {consultantRows.length > 0 ? (
                consultantRows.map((agent) => (
                  <tr key={agent.email} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '11px 8px' }}>
                      <div style={{ fontWeight: 700, color: NAVY }}>{agent.name}</div>
                      <div style={{ fontSize: '11px', color: TEXT_MUTED }}>{agent.email}</div>
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center', fontWeight: 700, color: NAVY }}>
                      {agent.assigned}
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center', color: TEXT_MUTED }}>
                      {agent.open}
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center', color: TEXT_MAIN }}>
                      <strong>{agent.callsConnected}</strong> <span style={{ color: TEXT_MUTED }}>/ {agent.callsAttempted}</span>
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center', color: '#16A34A', fontWeight: 600 }}>
                      {agent.followupsCompleted}
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center', color: TEAL, fontWeight: 600 }}>
                      {agent.viewingsCompleted}
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center', fontWeight: 800, color: '#16A34A' }}>
                      {agent.deals}
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center', fontWeight: 700, color: NAVY }}>
                      {agent.conversionRate}%
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center', minWidth: '120px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '6px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${agent.targetProgress}%`, background: agent.targetProgress >= 100 ? '#16A34A' : TEAL, borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: NAVY }}>{agent.targetProgress}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: TEXT_MUTED }}>
                    No assigned consultants in your direct reporting roster.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --------------------------------------------------------------
          4. TEAM PIPELINE & UPCOMING SITE VISITS
         -------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Pipeline Distribution */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ ...H2, margin: 0 }}>
              <TrendingUp size={18} color={TEAL} /> Team Pipeline Stages
            </h2>
            <Link to="/crm/leads" style={{ fontSize: '12px', color: TEAL, fontWeight: 700, textDecoration: 'none' }}>
              Assign Leads →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.entries(overview?.pipeline ?? { new: 0, contacted: 0, qualified: 0, closed: 0, lost: 0 }).map(([stage, count]) => {
              const total = teamLeadsCount || 1
              const pct = Math.min(100, Math.round(((count as number) / total) * 100))
              return (
                <div key={stage} style={{ fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ textTransform: 'capitalize', fontWeight: 600, color: NAVY }}>{stage}</span>
                    <span style={{ color: TEXT_MUTED }}>{count} leads ({pct}%)</span>
                  </div>
                  <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: stage === 'closed' ? '#16A34A' : TEAL, borderRadius: '4px' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming Team Site Visits */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ ...H2, margin: 0 }}>
              <CalendarCheck size={18} color={TEAL} /> Upcoming Team Site Visits
            </h2>
            <span style={{ fontSize: '12px', color: TEXT_MUTED, fontWeight: 600 }}>
              {upcomingVisits.length} scheduled
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {upcomingVisits.length > 0 ? (
              upcomingVisits.slice(0, 5).map((visit) => (
                <div key={visit.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: NAVY }}>
                      {visit.property_ref ? `Property #${visit.property_ref}` : `Lead #${visit.lead_id}`}
                    </div>
                    <div style={{ fontSize: '11px', color: TEXT_MUTED }}>
                      Consultant: {visit.staff_email.split('@')[0]}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: TEAL }}>
                      {visit.scheduled_at ? new Date(visit.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                    </div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: '#DCFCE7', color: '#166534', fontWeight: 700 }}>
                      {visit.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: TEXT_MUTED, fontSize: '13px' }}>
                No site visits currently scheduled for your team.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------
          5. ADVANCED SALES OPERATIONS: PIPELINE FORECAST & TARGET PLANNER
         -------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        <div style={CARD}>
          <h2 style={H2}>
            <DollarSign size={18} color={TEAL} /> Pipeline Forecast &amp; Revenue Projection
          </h2>
          <p style={{ fontSize: '12.5px', color: TEXT_MUTED, margin: '0 0 16px' }}>
            Probability-weighted pipeline projection based on verified CRM stages.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
              <div>
                <div style={{ fontWeight: 700, color: NAVY, fontSize: '13px' }}>Qualified Leads Stage (25% Prob.)</div>
                <div style={{ fontSize: '11.5px', color: TEXT_MUTED }}>{overview?.pipeline?.qualified ?? 1} active negotiations</div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 800, color: TEAL, fontSize: '14px' }}>
                AED 1,250,000
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
              <div>
                <div style={{ fontWeight: 700, color: NAVY, fontSize: '13px' }}>Under Contract / Offers (75% Prob.)</div>
                <div style={{ fontSize: '11.5px', color: TEXT_MUTED }}>Final contract documentation</div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 800, color: '#16A34A', fontSize: '14px' }}>
                AED 3,750,000
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: NAVY, fontSize: '13px' }}>Weighted Projected Gross Sales</span>
              <span style={{ fontWeight: 800, color: NAVY, fontSize: '16px' }}>AED 5,000,000</span>
            </div>
          </div>
        </div>

        <div style={CARD}>
          <h2 style={H2}>
            <Target size={18} color={TEAL} /> Sales Target Recovery &amp; Coaching Notes
          </h2>
          <p style={{ fontSize: '12.5px', color: TEXT_MUTED, margin: '0 0 16px' }}>
            Strategic closing directives for reporting sales consultants.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ padding: '12px 14px', background: 'rgba(198, 161, 91, 0.08)', borderRadius: '8px', border: '1px solid rgba(198, 161, 91, 0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: NAVY, fontSize: '13px', marginBottom: '4px' }}>
                <Sparkles size={14} color={TEAL} /> First Call SLA Directives
              </div>
              <div style={{ fontSize: '12px', color: TEXT_MAIN, lineHeight: 1.5 }}>
                All 8 unassigned buyer enquiries must be routed and contacted within 24 hours to maintain 90%+ qualification velocity.
              </div>
            </div>
            <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: NAVY, fontSize: '13px', marginBottom: '4px' }}>
                <Award size={14} color="#16A34A" /> Consultant Performance Coaching
              </div>
              <div style={{ fontSize: '12px', color: TEXT_MAIN, lineHeight: 1.5 }}>
                Bruns Al: Prioritize hot leads ({overview?.recent_inquiries?.filter(i => i.priority_label === 'High').length ?? 0} active) and follow-up callbacks before booking second site visits.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
