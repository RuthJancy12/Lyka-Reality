import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Users, AlertCircle, ChevronLeft, ChevronRight,
  Eye, RefreshCw, Plus, Phone, Calendar, UserCheck
} from 'lucide-react'
import { listLeads, updateLeadStatus } from '../services/crmApi'
import type { LeadListItem, LeadStatus } from '../types/crm'
import { classifyLeadChannel, type LeadChannel } from '../../utils/leadSource'

const CHANNELS: LeadChannel[] = ['Google', 'Instagram', 'Facebook', 'Referral', 'Direct', 'Unknown']

const PLUM = 'var(--plum-main)'
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--champagne-border)',
  borderRadius: '14px',
  boxShadow: '0 2px 10px rgba(26, 13, 24, 0.05)',
  padding: '18px',
}

// Restrained priority / temperature palette
const PRIORITY_BADGE: Record<string, React.CSSProperties> = {
  High: { background: '#F7E8E4', color: '#9C4A3C', border: '1px solid #EBCDC4' },
  Medium: { background: '#FBF3E3', color: '#8A6E30', border: '1px solid #E5D3AC' },
  Low: { background: '#EAF3EC', color: '#2E7D4F', border: '1px solid #CBE3D2' },
}

const TEMP_BADGE: Record<string, { bg: string; color: string; border: string; icon: string }> = {
  Hot: { bg: '#FEE2E2', color: '#B91C1C', border: '#FCA5A5', icon: '🔥' },
  Warm: { bg: '#FEF3C7', color: '#B45309', border: '#FCD34D', icon: '⚡' },
  Cold: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', icon: '❄️' },
}

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  new: { background: '#EAF0FA', color: '#2F4B8A', border: '1px solid #CBD9EE' },
  contacted: { background: '#F1EAF6', color: '#6C3FA3', border: '1px solid #D9CBEA' },
  qualified: { background: '#EAF3EC', color: '#2E7D4F', border: '1px solid #CBE3D2' },
  closed: { background: '#F1EDE4', color: '#6B6257', border: '1px solid #DED5C4' },
  lost: { background: '#F7E8E4', color: '#9C4A3C', border: '1px solid #EBCDC4' },
}

const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'qualified', 'closed', 'lost']

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 800,
  color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'middle' }

export function LeadManagement() {
  const [leads, setLeads] = useState<LeadListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState<LeadChannel | ''>('')

  const PER_PAGE = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listLeads({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        lead_type: typeFilter || undefined,
        channel: channelFilter || undefined,
        page,
        per_page: PER_PAGE,
      })
      setLeads(res.leads)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, priorityFilter, typeFilter, channelFilter, page])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async (id: number, status: LeadStatus) => {
    try {
      await updateLeadStatus(id, status)
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    } catch {/* ignore, load will refresh */}
  }

  const clearAll = () => {
    setSearch('')
    setStatusFilter('')
    setPriorityFilter('')
    setTypeFilter('')
    setChannelFilter('')
    setPage(1)
  }
  const hasFilters = Boolean(search || statusFilter || priorityFilter || typeFilter || channelFilter)
  const totalPages = Math.ceil(total / PER_PAGE)

  const formatFollowUp = (dtStr?: string | null) => {
    if (!dtStr) return null
    try {
      const d = new Date(dtStr)
      if (isNaN(d.getTime())) return null
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return null
    }
  }

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h1 className="luxury-serif" style={{ fontSize: '22px', color: PLUM, margin: 0 }}>
            Lead Management
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12.5px', margin: '2px 0 0' }}>
            {error ? 'Unable to load leads' : `${total.toLocaleString()} total leads`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={load} className="outline-navy-btn" style={{ padding: '9px 18px', fontSize: '13px' }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <Link to="/crm/enquiry" className="gold-btn" style={{ padding: '9px 18px', fontSize: '13px', textDecoration: 'none' }}>
            <Plus size={14} /> New Enquiry
          </Link>
        </div>
      </div>

      {/* Search + filter toolbar */}
      <section style={{ ...CARD, marginBottom: '14px' }} aria-label="Search and filter leads">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
            <Search size={15} color="#8A7B85" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search name, email, phone, location…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="lyka-field"
              style={{ paddingLeft: '36px', height: '40px' }}
              aria-label="Search leads"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="lyka-field"
            style={{ width: 'auto', minWidth: '140px', height: '40px', fontSize: '13px' }}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
          </select>
          <select
            value={priorityFilter}
            onChange={e => { setPriorityFilter(e.target.value); setPage(1) }}
            className="lyka-field"
            style={{ width: 'auto', minWidth: '140px', height: '40px', fontSize: '13px' }}
            aria-label="Filter by priority"
          >
            <option value="">All Priorities</option>
            <option value="High">High Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="Low">Low Priority</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
            className="lyka-field"
            style={{ width: 'auto', minWidth: '130px', height: '40px', fontSize: '13px' }}
            aria-label="Filter by type"
          >
            <option value="">All Types</option>
            <option value="buyer">Buyers</option>
            <option value="renter">Renters</option>
          </select>
          <select
            value={channelFilter}
            onChange={e => { setChannelFilter(e.target.value as LeadChannel | ''); setPage(1) }}
            className="lyka-field"
            style={{ width: 'auto', minWidth: '140px', height: '40px', fontSize: '13px' }}
            aria-label="Filter by acquisition channel"
          >
            <option value="">All Channels</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              style={{ height: '40px', padding: '0 14px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--champagne-border)', borderRadius: '8px', cursor: 'pointer' }}
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {/* Error banner */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: '#FDF1F1', border: '1px solid #E8A0A0', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px' }} role="alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={18} color="#9C4A3C" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '13.5px', color: '#8C2F2F', margin: 0 }}>{error}</p>
          </div>
          <button type="button" onClick={load} className="outline-navy-btn" style={{ padding: '6px 14px', fontSize: '12px', background: '#fff' }}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Leads table */}
      <section style={{ ...CARD, padding: 0, overflow: 'hidden' }} aria-label="Leads">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '220px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            <RefreshCw size={20} className="animate-spin" style={{ marginRight: '8px' }} /> Loading leads…
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '56px 16px' }}>
            <AlertCircle size={34} color="#9C4A3C" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#8C2F2F', margin: '0 0 6px' }}>Unable to retrieve leads</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 auto 16px', maxWidth: '440px' }}>{error}</p>
            <button type="button" onClick={load} className="gold-btn" style={{ padding: '9px 22px', fontSize: '13px' }}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : leads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 16px' }}>
            <Users size={34} color="#C9BFAE" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: '14px', fontWeight: 700, color: PLUM, margin: '0 0 4px' }}>No leads found</p>
            {hasFilters && (
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>Try adjusting your filters</p>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', minWidth: '1060px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--champagne-border)', background: '#FAF7F0' }}>
                  <th style={TH}>#</th>
                  <th style={TH}>Customer</th>
                  <th style={TH}>Preferences & Budget</th>
                  <th style={TH}>Assigned Agent</th>
                  <th style={TH}>Temperature</th>
                  <th style={TH}>Contact & Follow-Up</th>
                  <th style={TH}>Channel</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Created</th>
                  <th style={{ ...TH, textAlign: 'right', paddingRight: '16px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, idx) => {
                  const tempBand = lead.lead_score_band || (lead.priority_label === 'High' ? 'Hot' : lead.priority_label === 'Medium' ? 'Warm' : 'Cold')
                  const tempConfig = TEMP_BADGE[tempBand] || TEMP_BADGE.Cold
                  const followUpFormatted = formatFollowUp(lead.next_followup_at)
                  const hasContactInfo = Boolean(lead.last_call_outcome || lead.last_contacted_at)

                  return (
                    <tr
                      key={lead.id}
                      style={{
                        borderBottom: idx < leads.length - 1 ? '1px solid var(--champagne-border)' : 'none',
                        background: '#fff',
                      }}
                    >
                      <td style={{ ...TD, color: '#B9B0A6', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        #{lead.id}
                      </td>

                      {/* Customer */}
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: PLUM, overflowWrap: 'anywhere' }}>
                            {lead.customer_name || <span style={{ color: '#B9B0A6', fontStyle: 'italic', fontWeight: 400 }}>Unknown</span>}
                          </span>
                          {lead.do_not_disturb && (
                            <span style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #F87171', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px' }}>
                              ⛔ DND
                            </span>
                          )}
                        </div>
                        {lead.contact_email && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                            {lead.contact_email}
                          </div>
                        )}
                        {lead.contact_phone && (
                          <div style={{ fontSize: '11.5px', color: '#6B6257', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                            <Phone size={10} color="#8A7B85" />
                            <span>{lead.contact_phone}</span>
                          </div>
                        )}
                      </td>

                      {/* Preferences & Budget */}
                      <td style={TD}>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#1F101C' }}>
                          {lead.property_type || 'Property'} {lead.bedrooms ? `• ${lead.bedrooms} BHK` : ''}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                          {lead.location || 'Dubai'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                          {(lead.budget_max || lead.budget_min) && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#8A6E30', background: '#FDF8EC', padding: '1px 5px', borderRadius: '3px', border: '1px solid #E5D3AC' }}>
                              {lead.budget_max ? `AED ${Number(lead.budget_max).toLocaleString()}` : `From AED ${Number(lead.budget_min).toLocaleString()}`}
                            </span>
                          )}
                          {(lead.purpose || lead.lead_type) && (
                            <span style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'capitalize', color: '#2F4B8A', background: '#EAF0FA', padding: '1px 5px', borderRadius: '3px', border: '1px solid #CBD9EE' }}>
                              {lead.purpose || lead.lead_type}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Assigned Agent */}
                      <td style={TD}>
                        {lead.current_responsible_email || lead.original_assigned_email ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <UserCheck size={13} color="#2E7D4F" />
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#1F101C', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lead.current_responsible_email || lead.original_assigned_email}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11.5px', color: '#9C4A3C', background: '#F7E8E4', padding: '2px 6px', borderRadius: '4px', border: '1px solid #EBCDC4', fontWeight: 600 }}>
                            Unassigned
                          </span>
                        )}
                        {lead.coverage_status === 'covered' && lead.covering_agent_email && (
                          <div style={{ marginTop: '3px' }}>
                            <span style={{ background: '#FEF3C7', color: '#B45309', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                              Covering: {lead.covering_agent_email}
                            </span>
                          </div>
                        )}
                        {lead.coverage_status === 'coverage_required' && (
                          <div style={{ marginTop: '3px' }}>
                            <span style={{ background: '#FEE2E2', color: '#DC2626', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                              Coverage Required
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Temperature & Score */}
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ background: tempConfig.bg, color: tempConfig.color, border: `1px solid ${tempConfig.border}`, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 }}>
                            {tempConfig.icon} {tempBand}
                          </span>
                          <span style={{ ...PRIORITY_BADGE[lead.priority_label] || PRIORITY_BADGE.Low, padding: '2px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 }}>
                            {lead.priority_label}
                          </span>
                          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {lead.priority_score}
                          </span>
                        </div>
                      </td>

                      {/* Contact & Follow-Up */}
                      <td style={TD}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: hasContactInfo ? '#2E7D4F' : '#8A7B85' }}>
                          {lead.last_call_outcome || (lead.last_contacted_at ? 'Contacted' : 'Not Contacted')}
                        </div>
                        {followUpFormatted ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#8A6E30', marginTop: '2px' }}>
                            <Calendar size={11} color="#8A6E30" />
                            <span>{followUpFormatted}</span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#B9B0A6', marginTop: '2px' }}>
                            No follow-up set
                          </div>
                        )}
                        {lead.callback_requested && (
                          <span style={{ display: 'inline-block', marginTop: '2px', background: '#F1EAF6', color: '#6C3FA3', fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px' }}>
                            Callback Requested
                          </span>
                        )}
                      </td>

                      {/* Channel */}
                      <td style={{ ...TD, whiteSpace: 'nowrap', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        {classifyLeadChannel(lead)}
                      </td>

                      {/* Status */}
                      <td style={TD}>
                        <select
                          value={lead.status}
                          onChange={e => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                          onClick={e => e.stopPropagation()}
                          aria-label={`Status for lead ${lead.id}`}
                          style={{
                            ...(STATUS_BADGE[lead.status] ?? {}),
                            fontSize: '12px', fontWeight: 700, borderRadius: '8px',
                            padding: '6px 8px', cursor: 'pointer', textTransform: 'capitalize',
                          }}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s} style={{ background: '#fff', color: '#1F101C', textTransform: 'capitalize' }}>{s}</option>
                          ))}
                        </select>
                      </td>

                      {/* Created */}
                      <td style={{ ...TD, fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link
                          to={`/crm/leads/${lead.id}`}
                          className="outline-navy-btn"
                          style={{ padding: '7px 14px', fontSize: '12px', textDecoration: 'none' }}
                        >
                          <Eye size={12} /> View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Showing {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, total)} of {total}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              aria-label="Previous page"
              style={{ padding: '8px', border: '1px solid var(--champagne-border)', borderRadius: '8px', background: '#fff', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1, display: 'flex' }}
            >
              <ChevronLeft size={16} color={PLUM} />
            </button>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              aria-label="Next page"
              style={{ padding: '8px', border: '1px solid var(--champagne-border)', borderRadius: '8px', background: '#fff', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1, display: 'flex' }}
            >
              <ChevronRight size={16} color={PLUM} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
