// Admin console: real database totals, role-scoped analytics, audit trail,
// property demand, team productivity, and integration health. Admin-only
// navigation is enforced again by the backend on every API call.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, Building2, CheckCircle2, Download,
  RefreshCw, ShieldCheck, Target as TargetIcon, Users,
} from 'lucide-react'
import {
  getAnalytics, getOverview, getSecurityAlerts, getTargets, listAudit, setTarget,
  TARGET_METRICS,
  type AuditEvent, type SecurityAlertsSummary, type StaffAnalytics, type StaffOverview,
  type Target,
} from '../services/staffApi'
import { getBackendHealth, getOllamaStatus } from '../../services/api'

const PLUM = 'var(--plum-main)'
const GOLD = 'var(--gold-dark)'
const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--champagne-border)',
  borderRadius: '14px', boxShadow: '0 2px 10px rgba(26, 13, 24, 0.05)',
  padding: '20px',
}
const H2: React.CSSProperties = {
  fontSize: '15px', fontWeight: 800, color: PLUM, margin: '0 0 13px',
  display: 'flex', alignItems: 'center', gap: '8px',
}
const SUB: React.CSSProperties = { fontSize: '12.5px', color: 'var(--text-secondary)' }
const TH: React.CSSProperties = {
  padding: '8px 10px 8px 0', fontSize: '10.5px', textTransform: 'uppercase',
  letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 700,
  textAlign: 'left', borderBottom: '1px solid var(--champagne-border)',
}
const TD: React.CSSProperties = {
  padding: '9px 10px 9px 0', fontSize: '12.5px',
  borderBottom: '1px solid var(--champagne-border)', color: 'var(--text-main)',
}

function pct(value: number | null): string {
  return value == null ? '—' : `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
}

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function AuditDetails({ raw }: { raw: string | null }) {
  const text = useMemo(() => {
    if (!raw) return '—'
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return Object.entries(parsed)
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join(' · ')
    } catch {
      return raw.slice(0, 240)
    }
  }, [raw])
  return <span style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{text}</span>
}

export function AdminConsole() {
  const [analytics, setAnalytics] = useState<StaffAnalytics | null>(null)
  const [overview, setOverview] = useState<StaffOverview | null>(null)
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entityFilter, setEntityFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [health, setHealth] = useState<{ ok: boolean; text: string } | null>(null)
  const [ollama, setOllama] = useState<{ ok: boolean; text: string } | null>(null)
  const [security, setSecurity] = useState<SecurityAlertsSummary | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [targetPeriod, setTargetPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [targetDraft, setTargetDraft] = useState<Record<string, string>>({})
  const [savingTarget, setSavingTarget] = useState<string | null>(null)

  const loadAudit = useCallback(async () => {
    const res = await listAudit({
      entity_type: entityFilter || undefined,
      action: actionFilter || undefined,
      limit: 200,
    })
    setAudit(res.events)
    setAuditTotal(res.total)
  }, [entityFilter, actionFilter])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [a, o] = await Promise.all([getAnalytics(), getOverview()])
      setAnalytics(a)
      setOverview(o)
      await loadAudit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin console.')
    } finally {
      setLoading(false)
    }
  }, [loadAudit])

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getBackendHealth()
      .then((h) => setHealth({ ok: h.status === 'ok', text: `${h.status} · ${h.provider ?? 'backend'}` }))
      .catch((err: unknown) => setHealth({ ok: false, text: err instanceof Error ? err.message : 'Unreachable' }))
    getOllamaStatus()
      .then((s) => setOllama({
        ok: s.status === 'online',
        text: s.status === 'online' ? 'Online' : s.status === 'offline' ? 'Offline' : 'Error',
      }))
      .catch(() => setOllama({ ok: false, text: 'Unavailable' }))
    getSecurityAlerts()
      .then(setSecurity)
      .catch(() => setSecurity(null))
  }, [])

  useEffect(() => {
    getTargets(targetPeriod)
      .then((rows) => {
        setTargets(rows)
        setTargetDraft(Object.fromEntries(rows.map((t) => [t.metric, String(t.target_value)])))
      })
      .catch(() => {
        setTargets([])
        setTargetDraft({})
      })
  }, [targetPeriod])

  const saveTarget = async (metric: Target['metric']) => {
    const raw = targetDraft[metric]
    const value = raw === '' || raw == null ? NaN : Number(raw)
    if (!Number.isFinite(value) || value < 0) return
    setSavingTarget(metric)
    try {
      const saved = await setTarget(metric, targetPeriod, value)
      setTargets((prev) => [...prev.filter((t) => t.metric !== metric), saved])
      setTargetDraft((prev) => ({ ...prev, [metric]: String(saved.target_value) }))
      await loadAudit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save target.')
    } finally {
      setSavingTarget(null)
    }
  }

  const exportAnalytics = () => {
    if (!analytics) return
    const rows: Array<Array<unknown>> = [
      ['Metric', 'Value'],
      ['Visible leads', analytics.totals.leads],
      ['Contacted leads', analytics.totals.contacted_leads],
      ['Site visits completed', analytics.totals.site_visits_completed],
      ['Deals closed', analytics.totals.deals_closed],
      ['Leads lost', analytics.totals.leads_lost],
      ['Enquiry to contact rate', pct(analytics.conversion.enquiry_to_contact_rate)],
      ['Contact to site visit rate', pct(analytics.conversion.contact_to_site_visit_rate)],
      ['Site visit to deal rate', pct(analytics.conversion.site_visit_to_deal_rate)],
      ['Follow-up completion rate', pct(analytics.conversion.follow_up_completion_rate)],
      ['Average response minutes', analytics.conversion.average_lead_response_minutes ?? 'No data'],
      ['Calls scheduled', analytics.calls.scheduled],
      ['Calls attempted', analytics.calls.attempted],
      ['Calls connected', analytics.calls.connected],
      [],
      ['Channel', 'Leads', 'Contacted', 'Site visits', 'Deals', 'Conversion %'],
      ...analytics.source_performance.map((s) => [s.channel, s.leads, s.contacted, s.site_visits, s.deals, s.conversion_rate ?? '']),
      [],
      ['Staff', 'Assigned', 'Calls attempted', 'Connected', 'Follow-ups completed', 'Viewings completed', 'Deals'],
      ...analytics.agent_productivity.map((a) => [a.staff_email, a.assigned, a.calls_attempted, a.calls_connected, a.followups_completed, a.viewings_completed, a.deals]),
    ]
    downloadCsv(`lyka-analytics-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const exportAudit = () => {
    downloadCsv(`lyka-audit-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Entity ID', 'Lead ID', 'Details'],
      ...audit.map((e) => [e.created_at, e.actor_email ?? '', e.actor_role ?? '', e.action, e.entity_type, e.entity_id ?? '', e.lead_id ?? '', e.details ?? '']),
    ])
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading admin console" style={{ maxWidth: '1180px', margin: '0 auto' }}>
        <div className="lyka-skeleton" style={{ height: '26px', width: '240px', marginBottom: '10px' }} />
        <div className="lyka-skeleton" style={{ height: '14px', width: '420px', marginBottom: '22px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="lyka-skeleton-card" style={{ height: '92px' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: '14px' }}>
          {[0, 1, 2].map((i) => <div key={i} className="lyka-skeleton-card" style={{ height: '250px' }} />)}
        </div>
      </div>
    )
  }

  if (error || !analytics) {
    return (
      <div style={{ ...CARD, maxWidth: '540px', margin: '36px auto', textAlign: 'center' }}>
        <AlertCircle size={30} color="#9C4A3C" style={{ margin: '0 auto 10px' }} />
        <p style={{ color: PLUM, fontWeight: 700 }}>{error || 'Admin analytics unavailable.'}</p>
        <button type="button" className="gold-btn" onClick={load} style={{ padding: '9px 18px', fontSize: '13px' }}>
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h1 className="luxury-serif" style={{ fontSize: '23px', color: PLUM, margin: 0 }}>Admin Console</h1>
          <p style={{ ...SUB, margin: '3px 0 0' }}>Live database totals, team performance, and the business audit trail.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="outline-navy-btn" onClick={load} style={{ padding: '9px 16px', fontSize: '12.5px' }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button type="button" className="gold-btn" onClick={exportAnalytics} style={{ padding: '9px 16px', fontSize: '12.5px' }}>
            <Download size={13} /> Export analytics CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Leads', value: analytics.totals.leads, icon: <Users size={16} /> },
          { label: 'Customers', value: analytics.totals.customers_total, icon: <Users size={16} /> },
          { label: 'Staff', value: overview?.staff_total ?? 0, icon: <ShieldCheck size={16} /> },
          { label: 'Properties', value: analytics.totals.properties_total, icon: <Building2 size={16} /> },
          { label: 'Site visits', value: analytics.totals.site_visits_completed, icon: <Activity size={16} /> },
        ].map((item) => (
          <div key={item.label} style={{ ...CARD, padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {item.label} <span style={{ color: GOLD }}>{item.icon}</span>
            </div>
            <div style={{ fontSize: '27px', fontWeight: 800, color: PLUM, marginTop: '5px' }}>{item.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: '14px', marginBottom: '16px' }}>
        <section style={CARD}>
          <h2 style={H2}><Activity size={15} color={GOLD} /> Conversion Funnel</h2>
          {[
            { label: 'Enquiry → Contact', value: analytics.conversion.enquiry_to_contact_rate },
            { label: 'Contact → Site visit', value: analytics.conversion.contact_to_site_visit_rate },
            { label: 'Site visit → Deal', value: analytics.conversion.site_visit_to_deal_rate },
            { label: 'Follow-up completion', value: analytics.conversion.follow_up_completion_rate },
          ].map((m) => (
            <div key={m.label} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                <strong style={{ color: PLUM }}>{pct(m.value)}</strong>
              </div>
              <div style={{ height: '7px', background: '#F1EAD9', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${m.value ?? 0}%`, height: '100%', background: GOLD, borderRadius: '999px' }} />
              </div>
            </div>
          ))}
          <p style={{ ...SUB, margin: '10px 0 0' }}>
            Avg. response: <strong style={{ color: PLUM }}>{analytics.conversion.average_lead_response_minutes == null ? 'No data' : `${analytics.conversion.average_lead_response_minutes} min`}</strong>
            {' · '}{analytics.conversion.response_time_sample} measured
          </p>
        </section>

        <section style={CARD}>
          <h2 style={H2}><CheckCircle2 size={15} color={GOLD} /> Calls & Follow-ups</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
            {[
              ['Scheduled', analytics.calls.scheduled],
              ['Attempted', analytics.calls.attempted],
              ['Connected', analytics.calls.connected],
              ['No answer', analytics.calls.no_answer],
              ['Follow-ups', analytics.followups.total],
              ['Overdue', analytics.followups.overdue],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ background: '#FAF7F0', border: '1px solid var(--champagne-border)', borderRadius: '9px', padding: '9px 10px' }}>
                <div style={{ ...SUB, fontSize: '10.5px', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: PLUM }}>{value}</div>
              </div>
            ))}
          </div>
          <p style={{ ...SUB, margin: '10px 0 0' }}>Connect rate: <strong style={{ color: PLUM }}>{pct(analytics.calls.connect_rate)}</strong>. Scheduled-only calls are excluded from attempts.</p>
        </section>

        <section style={CARD}>
          <h2 style={H2}><ShieldCheck size={15} color={GOLD} /> Integration Health</h2>
          {[
            { label: 'Backend API', state: health },
            { label: 'Local AI (Ollama)', state: ollama },
            {
              label: 'Open security alerts',
              state: {
                ok: (security?.total ?? 0) === 0,
                text: security ? String(security.total) : 'Unavailable',
              },
            },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--champagne-border)' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{row.label}</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: row.state?.ok ? '#2E7D4F' : '#9C4A3C' }}>
                {row.state ? row.state.text : 'Checking…'}
              </span>
            </div>
          ))}
          <p style={{ ...SUB, margin: '10px 0 0' }}>
            Health checks are read-only. No API keys or customer records are displayed here.
          </p>
        </section>
      </div>

      <section style={{ ...CARD, marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <h2 style={{ ...H2, margin: 0 }}><TargetIcon size={15} color={GOLD} /> Monthly Targets</h2>
          <label style={{ ...SUB, display: 'flex', alignItems: 'center', gap: '6px' }}>
            Month
            <input
              type="month"
              value={targetPeriod}
              onChange={(e) => setTargetPeriod(e.target.value)}
              className="lyka-field"
              style={{ width: 'auto', padding: '6px 8px', fontSize: '12px' }}
            />
          </label>
        </div>
        <p style={{ ...SUB, margin: '0 0 12px' }}>
          Actuals are calculated from records dated in the selected month. Progress is actual ÷ target; targets never change business data.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '10px' }}>
          {TARGET_METRICS.map((metric) => {
            const current = targets.find((t) => t.metric === metric.key)
            const progress = current?.progress_pct
            return (
              <div key={metric.key} style={{ border: '1px solid var(--champagne-border)', borderRadius: '10px', padding: '11px', background: '#FAF7F0' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: PLUM }}>{metric.label}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '2px 0 7px' }}>
                  {current ? `${current.actual_value.toLocaleString()} of ${current.target_value.toLocaleString()}` : 'No target set'}
                </div>
                <div style={{ height: '6px', background: '#E8DFC9', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%`, height: '100%', background: GOLD }} />
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={targetDraft[metric.key] ?? ''}
                    onChange={(e) => setTargetDraft((prev) => ({ ...prev, [metric.key]: e.target.value }))}
                    placeholder="Target"
                    aria-label={`${metric.label} target`}
                    className="lyka-field"
                    style={{ padding: '6px 8px', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    className="lyka-chat-chip"
                    disabled={savingTarget === metric.key || !targetDraft[metric.key]}
                    onClick={() => void saveTarget(metric.key)}
                  >
                    {savingTarget === metric.key ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <div style={{ ...SUB, fontSize: '11px', marginTop: '4px' }}>
                  {progress == null ? '—' : `${progress}% of target`}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '14px', marginBottom: '16px' }}>
        <section style={{ ...CARD, overflowX: 'auto' }}>
          <h2 style={H2}><TrendingIcon /> Source Performance</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={TH}>Channel</th><th style={TH}>Leads</th><th style={TH}>Contacted</th><th style={TH}>Visits</th><th style={TH}>Deals</th><th style={TH}>Conversion</th></tr></thead>
            <tbody>
              {analytics.source_performance.map((s) => (
                <tr key={s.channel}>
                  <td style={{ ...TD, fontWeight: 700, color: PLUM }}>{s.channel}</td>
                  <td style={TD}>{s.leads}</td><td style={TD}>{s.contacted}</td>
                  <td style={TD}>{s.site_visits}</td><td style={TD}>{s.deals}</td>
                  <td style={TD}>{pct(s.conversion_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ ...CARD, overflowX: 'auto' }}>
          <h2 style={H2}><Users size={15} color={GOLD} /> Team Productivity</h2>
          {analytics.agent_productivity.length === 0 ? <p style={{ ...SUB, margin: 0 }}>No assignments in scope yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Staff</th><th style={TH}>Assigned</th><th style={TH}>Attempted</th><th style={TH}>Connected</th><th style={TH}>Visits</th><th style={TH}>Deals</th></tr></thead>
              <tbody>
                {analytics.agent_productivity.map((a) => (
                  <tr key={a.staff_email}>
                    <td style={{ ...TD, color: PLUM, fontWeight: 600, overflowWrap: 'anywhere' }}>{a.staff_email}</td>
                    <td style={TD}>{a.assigned}</td><td style={TD}>{a.calls_attempted}</td>
                    <td style={TD}>{a.calls_connected}</td><td style={TD}>{a.viewings_completed}</td>
                    <td style={{ ...TD, fontWeight: 800 }}>{a.deals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: '14px', marginBottom: '16px' }}>
        <section style={CARD}>
          <h2 style={H2}><Building2 size={15} color={GOLD} /> Property Demand</h2>
          <DemandList title="Top locations" rows={analytics.property_demand.locations.map((l) => [l.location, l.count])} />
          <DemandList title="Property types" rows={analytics.property_demand.property_types.map((p) => [p.property_type, p.count])} />
          <DemandList title="Budget bands" rows={analytics.property_demand.budget_buckets.map((b) => [b.bucket, b.count])} />
        </section>
        <section style={CARD}>
          <h2 style={H2}><AlertCircle size={15} color={GOLD} /> Lost-Lead Reasons</h2>
          {analytics.lost_reasons.length === 0 ? <p style={{ ...SUB, margin: 0 }}>No lost leads recorded.</p> : (
            analytics.lost_reasons.map((r) => (
              <div key={r.reason} style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--champagne-border)', fontSize: '12.5px' }}>
                <span style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{r.reason}</span>
                <strong style={{ color: PLUM, flexShrink: 0 }}>{r.count}</strong>
              </div>
            ))
          )}
          <p style={{ ...SUB, margin: '10px 0 0' }}>Reasons come from the lead's persisted agent notes; blank values are shown as “Not recorded”.</p>
        </section>
      </div>

      <section style={{ ...CARD, overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '13px' }}>
          <h2 style={{ ...H2, margin: 0 }}><ShieldCheck size={15} color={GOLD} /> Audit Trail ({auditTotal})</h2>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="lyka-field" aria-label="Filter audit by entity">
              <option value="">All entities</option>
              {['lead', 'assignment', 'follow_up', 'call', 'viewing', 'staff', 'property'].map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
            </select>
            <input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} placeholder="Action contains…" className="lyka-field" aria-label="Filter audit by action" />
            <button type="button" className="outline-navy-btn" onClick={() => void loadAudit().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Audit filter failed.'))} style={{ padding: '8px 13px', fontSize: '12px' }}>
              Apply
            </button>
            <button type="button" className="gold-btn" onClick={exportAudit} style={{ padding: '8px 13px', fontSize: '12px' }}>
              <Download size={12} /> CSV
            </button>
          </div>
        </div>
        {audit.length === 0 ? <p style={{ ...SUB, margin: 0 }}>No audit events match these filters.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead><tr><th style={TH}>When</th><th style={TH}>Actor</th><th style={TH}>Action</th><th style={TH}>Record</th><th style={TH}>Details</th></tr></thead>
            <tbody>
              {audit.map((event) => (
                <tr key={event.id}>
                  <td style={TD}>{new Date(event.created_at).toLocaleString()}</td>
                  <td style={{ ...TD, overflowWrap: 'anywhere' }}>{event.actor_email || 'Public / system'}<div style={SUB}>{event.actor_role || ''}</div></td>
                  <td style={{ ...TD, fontWeight: 700, color: PLUM }}>{event.action.replace(/_/g, ' ')}</td>
                  <td style={TD}>{event.entity_type}{event.entity_id ? ` #${event.entity_id}` : ''}{event.lead_id ? ` · lead #${event.lead_id}` : ''}</td>
                  <td style={TD}><AuditDetails raw={event.details} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function DemandList({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  if (rows.length === 0) return null
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ ...SUB, fontWeight: 700, marginBottom: '5px' }}>{title}</div>
      {rows.map(([label, count]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12.5px', padding: '3px 0' }}>
          <span style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{label}</span>
          <strong style={{ color: PLUM }}>{count}</strong>
        </div>
      ))}
    </div>
  )
}

function TrendingIcon() {
  return <Activity size={15} color={GOLD} />
}
