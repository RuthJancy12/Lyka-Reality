// Lead Details: premium LYKA-styled two-column layout (main left, rail right)
// plus secure lead assignment. Assignment writes reuse the existing
// /api/staff/* endpoints; the backend enforces manager+/team permissions.

import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Edit3, Save, X, RefreshCw, Building2,
  AlertCircle, Loader2, MapPin, User, AlertTriangle,
  UserCheck, History, Send, Phone,
} from 'lucide-react'
import { getLead, updateLead, updateLeadStatus, refreshRecommendations } from '../services/crmApi'
import { classifyLeadChannel } from '../../utils/leadSource'
import {
  listAssignments, updateAssignment, createAssignment, listStaff,
  useStaffRole, type Assignment, type StaffListItem,
} from '../services/staffApi'
import { CallPanel } from '../components/CallPanel'
import { CallModal } from '../components/CallModal'
import type { Lead, LeadStatus } from '../types/crm'

const PLUM = 'var(--plum-main)'
const GOLD = 'var(--gold-dark)'
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--champagne-border)',
  borderRadius: '14px',
  boxShadow: '0 2px 10px rgba(26, 13, 24, 0.05)',
  padding: '22px',
}

const H2: React.CSSProperties = {
  fontSize: '15px', fontWeight: 800, color: PLUM, margin: '0 0 14px',
  display: 'flex', alignItems: 'center', gap: '8px',
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '8px',
  border: '1px solid var(--champagne-border)', fontSize: '13.5px',
  background: '#fff', color: 'var(--text-main)', boxSizing: 'border-box',
}

const PRIORITY_BADGE: Record<string, React.CSSProperties> = {
  High: { background: '#6E2233', color: '#FBF6EC', border: '1px solid #6E2233' },
  Medium: { background: '#F7ECD4', color: '#8A6E30', border: '1px solid #E5D3AC' },
  Low: { background: '#EAF3EC', color: '#2E7D4F', border: '1px solid #CBE3D2' },
}

const STATUS_PILL: Record<string, React.CSSProperties> = {
  new: { background: '#EAF0FA', color: '#2F4B8A' },
  contacted: { background: '#F1EAF6', color: '#6C3FA3' },
  qualified: { background: '#EAF3EC', color: '#2E7D4F' },
  closed: { background: '#F1EDE4', color: '#6B6257' },
  lost: { background: '#F7E8E4', color: '#9C4A3C' },
}

const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'qualified', 'closed', 'lost']

function formatAED(n: number | null | undefined) {
  if (n == null) return '—'
  return `AED ${n.toLocaleString('en-US')}`
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '3px' }}>
        {label}
      </div>
      {value ? (
        <div style={{ fontSize: '14px', fontWeight: 600, color: PLUM, overflowWrap: 'anywhere' }}>{value}</div>
      ) : (
        <div style={{ fontSize: '13px', color: '#B9B0A6', fontStyle: 'italic' }}>Not provided</div>
      )}
    </div>
  )
}

export function LeadAnalysis() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useStaffRole()
  const canAssign = role === 'admin' || role === 'manager' || role === 'sales_manager'

  const [lead, setLead] = useState<Lead | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [staffList, setStaffList] = useState<StaffListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [assignEmail, setAssignEmail] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignMsg, setAssignMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [callModalOpen, setCallModalOpen] = useState(false)

  const [editForm, setEditForm] = useState({
    customer_name: '',
    contact_email: '',
    contact_phone: '',
    agent_notes: '',
    location: '',
    budget_min: '',
    budget_max: '',
    bedrooms: '',
    timeline_days: '',
  })

  const leadId = Number(id)

  const load = useCallback(async () => {
    if (!id || Number.isNaN(leadId)) {
      setError('Invalid lead reference.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [data, allAssignments] = await Promise.all([
        getLead(leadId),
        listAssignments().catch(() => [] as Assignment[]),
      ])
      setLead(data)
      setAssignments(allAssignments.filter((a) => a.lead_id === data.id))
      setEditForm({
        customer_name: data.customer_name || '',
        contact_email: data.contact_email || '',
        contact_phone: data.contact_phone || '',
        agent_notes: data.agent_notes || '',
        location: data.location || '',
        budget_min: data.budget_min != null ? String(data.budget_min) : '',
        budget_max: data.budget_max != null ? String(data.budget_max) : '',
        bedrooms: data.bedrooms != null ? String(data.bedrooms) : '',
        timeline_days: data.timeline_days != null ? String(data.timeline_days) : '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load lead')
    } finally {
      setLoading(false)
    }
  }, [id, leadId])

  useEffect(() => { void load() }, [load])

  // Salesperson roster for the Assign-To dropdown (backend-scoped team for SMs).
  useEffect(() => {
    if (!canAssign) return
    let cancelled = false
    listStaff()
      .then((rows) => {
        if (!cancelled) setStaffList(rows.filter((s) => s.is_active && s.role === 'salesperson'))
      })
      .catch(() => {
        if (!cancelled) setStaffList([])
      })
    return () => { cancelled = true }
  }, [canAssign])

  const openAssignment = assignments.find((a) => a.status !== 'closed') ?? null
  const history = assignments.filter((a) => a.status === 'closed')
  const staffName = (email: string) =>
    staffList.find((s) => s.email.toLowerCase() === email.toLowerCase())?.name ?? email

  const handleSave = async () => {
    if (!lead) return
    setSaving(true)
    try {
      await updateLead(lead.id, {
        customer_name: editForm.customer_name || null,
        contact_email: editForm.contact_email || null,
        contact_phone: editForm.contact_phone || null,
        agent_notes: editForm.agent_notes || null,
        location: editForm.location || null,
        budget_min: editForm.budget_min ? Number(editForm.budget_min) : null,
        budget_max: editForm.budget_max ? Number(editForm.budget_max) : null,
        bedrooms: editForm.bedrooms ? Number(editForm.bedrooms) : null,
        timeline_days: editForm.timeline_days ? Number(editForm.timeline_days) : null,
      } as Partial<Lead>)
      setEditing(false)
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (status: LeadStatus) => {
    if (!lead) return
    try {
      await updateLeadStatus(lead.id, status)
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    }
  }

  const handleRefreshRecs = async () => {
    if (!lead) return
    setRefreshing(true)
    try {
      await refreshRecommendations(lead.id)
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh recommendations')
    } finally {
      setRefreshing(false)
    }
  }

  const handleAssign = async () => {
    if (!lead || !assignEmail) {
      setAssignMsg({ kind: 'err', text: 'Choose a salesperson first.' })
      return
    }
    setAssigning(true)
    setAssignMsg(null)
    try {
      // Reassignment closes the open assignment first (history preserved),
      // then creates the new one. Backend re-checks team scope on both.
      if (openAssignment) {
        await updateAssignment(openAssignment.id, 'closed')
      }
      try {
        await createAssignment(lead.id, assignEmail)
      } catch (e) {
        // A concurrent open assignment (409): reload and report honestly.
        if (e instanceof Error && /already has an open assignment/i.test(e.message)) {
          await load()
          setAssignMsg({ kind: 'err', text: 'This lead already has an open assignment. Reloaded the latest state — please review and retry.' })
          return
        }
        throw e
      }
      setAssignEmail('')
      await load()
      setAssignMsg({ kind: 'ok', text: 'Lead assigned. It now appears in the salesperson’s My Work and Leads views.' })
    } catch (e) {
      setAssignMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not assign lead.' })
    } finally {
      setAssigning(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--text-secondary)', fontSize: '14px' }}>
        <Loader2 size={20} className="animate-spin" style={{ marginRight: '8px' }} /> Loading lead details…
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '40px', textAlign: 'center', maxWidth: '520px', margin: '40px auto' }}>
        <AlertCircle size={32} color="#9C4A3C" style={{ margin: '0 auto 12px' }} />
        <p style={{ color: PLUM, fontWeight: 700, marginBottom: '16px' }}>{error || 'Lead not found'}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button type="button" className="gold-btn" onClick={() => void load()} style={{ padding: '9px 20px', fontSize: '13px' }}>
            <RefreshCw size={13} /> Retry
          </button>
          <Link to="/crm/leads" className="outline-navy-btn" style={{ padding: '9px 20px', fontSize: '13px', textDecoration: 'none' }}>
            Back to Leads
          </Link>
        </div>
      </div>
    )
  }

  const score = lead.score_breakdown
  const scoreBars: Array<[string, number, number]> = score ? [
    ['Budget', score.budget, 20],
    ['Location', score.location, 20],
    ['Type / Beds', score.property_type_bedrooms, 15],
    ['Intent', score.intent, 15],
    ['Timeline', score.timeline, 20],
    ['Preferences', score.preferences, 10],
  ] : []

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <button type="button" onClick={() => navigate('/crm/leads')} className="lyka-chat-ghost-btn" aria-label="Back to leads">
            <ArrowLeft size={15} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 className="luxury-serif" style={{ fontSize: '22px', color: PLUM, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lead.customer_name || 'Unknown Customer'} <span style={{ color: GOLD, fontSize: '15px' }}>· Lead #{lead.id}</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12.5px', margin: '2px 0 0' }}>
              Created {new Date(lead.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button type="button" onClick={handleSave} disabled={saving} className="gold-btn" style={{ padding: '9px 18px', fontSize: '13px', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="lyka-chat-ghost-btn" aria-label="Cancel editing">
                <X size={15} />
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="outline-navy-btn" style={{ padding: '9px 18px', fontSize: '13px' }}>
              <Edit3 size={14} /> Edit
            </button>
          )}
          <button type="button" onClick={handleRefreshRecs} disabled={refreshing} className="gold-btn" style={{ padding: '9px 18px', fontSize: '13px', opacity: refreshing ? 0.7 : 1 }}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Matching…' : 'Find Properties'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '18px' }} className="lead-details-grid">
        <style>{`@media (min-width: 1024px) { .lead-details-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) !important; } }`}</style>

        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
          {/* Priority score */}
          <section style={{ ...CARD, background: 'linear-gradient(135deg, #2A1420 0%, #4A1F2E 100%)', borderColor: '#4A1F2E', color: '#FBF6EC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#D8BD80' }}>
                  Priority Score
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '46px', fontWeight: 800, lineHeight: 1 }}>{lead.priority_score}</span>
                  <span style={{ color: '#C9A86A', fontSize: '15px' }}>/100</span>
                </div>
                <span style={{ ...PRIORITY_BADGE[lead.priority_label], display: 'inline-block', marginTop: '10px', padding: '4px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 800 }}>
                  {lead.priority_label} Priority
                </span>
              </div>
              <div style={{ minWidth: '210px', flex: 1, maxWidth: '300px' }}>
                {scoreBars.map(([k, v, max]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
                    <span style={{ width: '86px', textAlign: 'right', fontSize: '11.5px', color: '#D8BD80', flexShrink: 0 }}>{k}</span>
                    <div style={{ flex: 1, height: '7px', background: 'rgba(216,189,128,0.22)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#D8BD80', borderRadius: '999px', width: `${max > 0 ? Math.min(100, (v / max) * 100) : 0}%` }} />
                    </div>
                    <span style={{ width: '22px', fontSize: '12.5px', fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            {score?.reasoning && score.reasoning.length > 0 && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(216,189,128,0.25)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {score.reasoning.map((r, i) => (
                  <p key={i} style={{ fontSize: '12.5px', color: '#EAD9B8', margin: 0 }}>{r}</p>
                ))}
              </div>
            )}
          </section>

          {/* Customer information */}
          <section style={CARD}>
            <h2 style={H2}><User size={15} color={GOLD} /> Customer Information</h2>
            {editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {[
                  { label: 'Full Name', key: 'customer_name', type: 'text' },
                  { label: 'Email', key: 'contact_email', type: 'email' },
                  { label: 'Phone', key: 'contact_phone', type: 'tel' },
                  { label: 'Location', key: 'location', type: 'text' },
                  { label: 'Budget Min (AED)', key: 'budget_min', type: 'number' },
                  { label: 'Budget Max (AED)', key: 'budget_max', type: 'number' },
                  { label: 'Bedrooms', key: 'bedrooms', type: 'number' },
                  { label: 'Timeline (days)', key: 'timeline_days', type: 'number' },
                ].map(({ label, key, type }) => (
                  <div key={key} style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      {label}
                    </label>
                    <input
                      type={type}
                      value={editForm[key as keyof typeof editForm]}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      style={INPUT}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px 18px' }}>
                <Field label="Name" value={lead.customer_name} />
                <Field label="Email" value={lead.contact_email} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                    Phone
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {lead.contact_phone ? (
                      <>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: PLUM }}>{lead.contact_phone}</span>
                        <button
                          type="button"
                          onClick={() => setCallModalOpen(true)}
                          className="lyka-chat-chip"
                          style={{
                            fontSize: '11.5px',
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#8A6E30',
                            borderColor: '#E5D3AC',
                            background: '#FAF3E3',
                            cursor: 'pointer',
                          }}
                          title="Call customer manually"
                        >
                          <Phone size={11} /> Call
                        </button>
                      </>
                    ) : (
                      <div style={{ fontSize: '13px', color: '#B9B0A6', fontStyle: 'italic' }}>Not provided</div>
                    )}
                  </div>
                </div>
                <Field label="Intent" value={lead.lead_type ? (lead.lead_type === 'buyer' ? 'Buy' : 'Rent') : null} />
                <Field label="Property Type" value={lead.property_type} />
                <Field label="Location" value={lead.location} />
                <Field label="Bedrooms" value={lead.bedrooms != null ? String(lead.bedrooms) : null} />
                <Field
                  label="Budget"
                  value={lead.budget_max ? `${formatAED(lead.budget_min)} – ${formatAED(lead.budget_max)}` : formatAED(lead.budget_max)}
                />
                <Field label="Timeline" value={lead.timeline_days != null ? `${lead.timeline_days} days` : null} />
                <Field label="Purpose" value={lead.purpose} />
                <Field
                  label="Source"
                  value={(() => {
                    const channel = classifyLeadChannel(lead)
                    const details = [lead.utm_source, lead.utm_medium, lead.utm_campaign]
                      .filter(Boolean)
                      .join(' · ')
                    if (details) return `${channel} · ${details}`
                    if (lead.referrer) return `${channel} · ${lead.referrer}`
                    return channel
                  })()}
                />
                <Field label="Heard via" value={lead.discovery_source} />
              </div>
            )}

            {lead.amenities?.length > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--champagne-border)' }}>
                <p style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 8px' }}>AMENITIES</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {lead.amenities.map((a) => (
                    <span key={a} style={{ padding: '4px 12px', background: '#FAF5EA', color: PLUM, fontSize: '12px', fontWeight: 600, borderRadius: '999px', border: '1px solid var(--champagne-border)', textTransform: 'capitalize' }}>{a}</span>
                  ))}
                </div>
              </div>
            )}

            {lead.missing_fields?.length > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--champagne-border)' }}>
                <p style={{ fontSize: '11.5px', fontWeight: 700, color: '#8A6E30', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={12} /> MISSING INFORMATION
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {lead.missing_fields.map((f) => (
                    <span key={f} style={{ padding: '4px 12px', background: '#FBF3E3', color: '#8A6E30', fontSize: '12px', fontWeight: 600, borderRadius: '999px', border: '1px solid #E5D3AC' }}>
                      {f.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Property recommendations */}
          <section style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
              <h2 style={{ ...H2, margin: 0 }}><Building2 size={15} color={GOLD} /> Property Recommendations</h2>
              <button type="button" onClick={handleRefreshRecs} disabled={refreshing} className="lyka-chat-link-btn" style={{ fontSize: '12.5px' }}>
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {lead.recommendations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '34px 16px', background: '#FAF7F0', borderRadius: '10px', border: '1px dashed var(--champagne-border)' }}>
                <Building2 size={30} color="#C9BFAE" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: '14px', fontWeight: 700, color: PLUM, margin: '0 0 4px' }}>
                  {lead.location
                    ? `No matching properties found for ${lead.location}`
                    : 'No matching properties found'}
                </p>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
                  {lead.lead_type
                    ? 'Add more criteria or click "Find Properties" to search again.'
                    : 'Specify buy/rent intent to enable property matching.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {lead.recommendations.map((rec, idx) => (
                  <article key={rec.id} style={{ display: 'flex', gap: '14px', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px', background: '#fff' }}>
                    {rec.property.image_url ? (
                      <img
                        src={rec.property.image_url}
                        alt={rec.property.title}
                        loading="lazy"
                        style={{ width: '118px', height: '118px', objectFit: 'cover', borderRadius: '10px', flexShrink: 0, background: '#F4EEE1' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div style={{ width: '118px', height: '118px', borderRadius: '10px', flexShrink: 0, background: 'linear-gradient(135deg, #F4EEE1, #EADFC8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, fontWeight: 800, fontSize: '20px' }}>
                        #{idx + 1}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ fontSize: '14.5px', fontWeight: 800, color: PLUM, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {rec.property.title}
                          </h3>
                          {rec.is_nearby && (
                            <span style={{ display: 'inline-block', marginTop: '5px', padding: '3px 10px', background: '#FBF3E3', color: '#8A6E30', fontSize: '11px', fontWeight: 800, borderRadius: '999px', border: '1px solid #E5D3AC', letterSpacing: '0.02em' }}>
                              Nearby alternative · {rec.property.location}
                            </span>
                          )}
                          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                            <MapPin size={12} /> {rec.property.location} · {rec.property.bedrooms === 0 ? 'Studio' : `${rec.property.bedrooms} BR`} {rec.property.property_type}
                          </p>
                          <p style={{ fontSize: '15px', fontWeight: 800, color: PLUM, margin: '5px 0 0' }}>
                            {rec.property.listing_type === 'Sale'
                              ? formatAED(rec.property.price_sale)
                              : `${formatAED(rec.property.price_rent_monthly)}/mo`}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '22px', fontWeight: 800, color: PLUM }}>{rec.match_score.toFixed(0)}%</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>match</div>
                          <div style={{ marginTop: '5px', width: '72px', height: '7px', background: '#F1EAD9', borderRadius: '999px', overflow: 'hidden', marginLeft: 'auto' }}>
                            <div style={{ height: '100%', background: GOLD, borderRadius: '999px', width: `${Math.min(100, rec.match_score)}%` }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: '9px', fontSize: '12.5px', color: '#3E5C43', background: '#EFF5F0', borderRadius: '8px', padding: '8px 10px', lineHeight: 1.5 }}>
                        {rec.match_explanation}
                      </div>
                      {rec.mismatches.length > 0 && (
                        <div style={{ marginTop: '7px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {rec.mismatches.map((m, i) => (
                            <div key={i} style={{ fontSize: '12px', color: '#8A6E30', background: '#FBF3E3', borderRadius: '7px', padding: '5px 9px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <AlertTriangle size={11} style={{ flexShrink: 0 }} /> <span>{m}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Raw enquiry */}
          <section style={CARD}>
            <h2 style={H2}>Original Enquiry Text</h2>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#FAF7F0', borderRadius: '10px', padding: '14px 16px', margin: 0, overflowWrap: 'anywhere' }}>
              {lead.raw_enquiry_text}
            </p>
          </section>
        </div>

        {/* Right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
          {/* Assignment */}
          <section style={{ ...CARD, borderColor: 'var(--gold-border, rgba(197,168,105,0.4))' }}>
            <h2 style={H2}><UserCheck size={15} color={GOLD} /> Assignment</h2>
            {/* Customer Enquiry Response Ownership & Continuity */}
            <div style={{ background: '#FAF7F0', border: '1px solid var(--champagne-border)', borderRadius: '8px', padding: '12px', marginBottom: '14px', fontSize: '12.5px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Original Agent</div>
                  <div style={{ fontWeight: 700, color: PLUM }}>
                    {lead.original_assigned_email ? staffName(lead.original_assigned_email) : (openAssignment?.staff_email ? staffName(openAssignment.staff_email) : 'None')}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{lead.original_assigned_email || openAssignment?.staff_email || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Responsible Agent</div>
                  <div style={{ fontWeight: 700, color: '#16A34A' }}>
                    {lead.current_responsible_email ? staffName(lead.current_responsible_email) : (openAssignment?.staff_email ? staffName(openAssignment.staff_email) : 'Unassigned')}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{lead.current_responsible_email || openAssignment?.staff_email || '—'}</div>
                </div>

                {lead.covering_agent_email && (
                  <div>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#B45309', textTransform: 'uppercase' }}>Covering Agent</div>
                    <div style={{ fontWeight: 700, color: '#B45309' }}>
                      {staffName(lead.covering_agent_email)}
                    </div>
                    <span style={{ background: '#FEF3C7', color: '#B45309', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                      TEMPORARY COVERAGE
                    </span>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--champagne-border)', paddingTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                <div><strong>Follow-up:</strong> {lead.next_followup_at ? new Date(lead.next_followup_at).toLocaleDateString() : 'None'}</div>
                <div><strong>Last Contact:</strong> {lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString() : 'None'}</div>
                <div><strong>Call Outcome:</strong> {lead.last_call_outcome || 'None'}</div>
                <div><strong>Coverage Status:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 700, color: lead.coverage_status === 'covered' ? '#16A34A' : '#746875' }}>{lead.coverage_status || 'normal'}</span></div>
              </div>
            </div>

            {openAssignment ? (
              <div style={{ fontSize: '13.5px', marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, color: PLUM }}>{staffName(openAssignment.staff_email)}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12.5px', overflowWrap: 'anywhere' }}>{openAssignment.staff_email}</div>
                <div style={{ marginTop: '6px', display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ ...STATUS_PILL.new, fontSize: '11.5px', fontWeight: 800, borderRadius: '999px', padding: '3px 11px' }}>
                    {openAssignment.status.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>by {openAssignment.assigned_by}</span>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                Unassigned — distribute this lead to a salesperson.
              </p>
            )}

            {canAssign ? (
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '5px' }} htmlFor="lead-assign-to">
                  {openAssignment ? 'Reassign To' : 'Assign To'}
                </label>
                <select
                  id="lead-assign-to"
                  value={assignEmail}
                  onChange={(e) => setAssignEmail(e.target.value)}
                  style={{ ...INPUT, marginBottom: '10px' }}
                >
                  <option value="">Select salesperson…</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.email}>{s.name} — {s.email}</option>
                  ))}
                </select>
                {staffList.length === 0 && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                    No active salespeople available{role === 'sales_manager' ? ' in your team' : ''}. Add them via Team Management first.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={assigning || !assignEmail}
                  className="gold-btn"
                  style={{ width: '100%', padding: '10px', fontSize: '13px', opacity: assigning || !assignEmail ? 0.65 : 1 }}
                >
                  {assigning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {openAssignment ? 'Reassign Lead' : 'Assign Lead'}
                </button>
                {assignMsg && (
                  <p role={assignMsg.kind === 'err' ? 'alert' : 'status'} style={{ fontSize: '12.5px', margin: '9px 0 0', color: assignMsg.kind === 'err' ? '#9C4A3C' : '#2E7D4F' }}>
                    {assignMsg.text}
                  </p>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                Only managers can assign leads. Contact your manager to change assignment.
              </p>
            )}

            {history.length > 0 && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--champagne-border)' }}>
                <p style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={12} /> ASSIGNMENT HISTORY
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {history.map((h) => (
                    <div key={h.id} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: PLUM }}>{staffName(h.staff_email)}</strong> · closed · by {h.assigned_by}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Calls: schedule first, record actual outcome separately */}
          <CallPanel
            leadId={lead.id}
            customerName={lead.customer_name}
            customerPhone={lead.contact_phone}
            currentLeadTemperature={lead.lead_score_band}
            onChanged={load}
          />

          {/* Status */}
          <section style={CARD}>
            <h2 style={H2}>Lead Status</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {STATUS_OPTIONS.map((s) => {
                const active = lead.status === s
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(s)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: '9px',
                      fontSize: '13.5px', fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer',
                      border: active ? `1.5px solid ${GOLD}` : '1.5px solid transparent',
                      ...(active ? STATUS_PILL[s] : { color: 'var(--text-secondary)', background: 'transparent' }),
                    }}
                    onMouseEnter={(e) => { if (!active) (e.target as HTMLButtonElement).style.background = '#FAF7F0' }}
                    onMouseLeave={(e) => { if (!active) (e.target as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    {active && '✓ '}{s}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Agent notes */}
          <section style={CARD}>
            <h2 style={H2}>Agent Notes</h2>
            {editing ? (
              <textarea
                value={editForm.agent_notes}
                onChange={(e) => setEditForm((prev) => ({ ...prev, agent_notes: e.target.value }))}
                rows={5}
                placeholder="Add notes about this lead…"
                style={{ ...INPUT, resize: 'vertical', minHeight: '110px', lineHeight: 1.6 }}
              />
            ) : (
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, overflowWrap: 'anywhere' }}>
                {lead.agent_notes || <span style={{ color: '#B9B0A6', fontStyle: 'italic' }}>No notes yet. Click Edit to add.</span>}
              </p>
            )}
          </section>

          {/* Activity */}
          <section style={CARD}>
            <h2 style={H2}>Activity Timeline</h2>
            {lead.activities.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#B9B0A6', fontStyle: 'italic', margin: 0 }}>No activity yet.</p>
            ) : (
              <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {lead.activities.map((act) => (
                  <div key={act.id} style={{ display: 'flex', gap: '10px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--champagne-border)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: GOLD, marginTop: '5px', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '12.5px', fontWeight: 700, color: PLUM, margin: 0, textTransform: 'capitalize' }}>
                        {act.activity_type.replace(/_/g, ' ')}
                      </p>
                      {act.notes && <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '3px 0 0', overflowWrap: 'anywhere' }}>{act.notes}</p>}
                      <p style={{ fontSize: '11.5px', color: '#B9B0A6', margin: '3px 0 0' }}>
                        {new Date(act.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      {/* Manual call modal */}
      {lead && (
        <CallModal
          isOpen={callModalOpen}
          onClose={() => setCallModalOpen(false)}
          leadId={lead.id}
          customerName={lead.customer_name}
          customerPhone={lead.contact_phone}
          currentLeadTemperature={lead.lead_score_band}
          onSuccess={() => void load()}
        />
      )}
    </div>
  )
}
