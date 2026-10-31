import { useCallback, useEffect, useState } from 'react'
import {
  LifeBuoy, Search, AlertCircle, RefreshCw, Send, CheckCircle2, X,
} from 'lucide-react'
import {
  listStaffTickets, updateStaffTicket, replyStaffTicket,
  type SupportTicket,
} from '../services/enterpriseApi'
import { listStaff, useStaffRole, type StaffListItem } from '../services/staffApi'
import { ErrorBoundary } from '../components/ErrorBoundary'

const PLUM = 'var(--plum-main, #1F101C)'
const GOLD = 'var(--gold-dark, #A37E2C)'
const BORDER = 'var(--champagne-border, #E8DCC8)'
const SURFACE = 'var(--champagne-surface, #F9F5EF)'

const CARD: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: '12px',
  boxShadow: '0 2px 10px rgba(26, 13, 24, 0.04)',
  padding: '20px',
}

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  background: '#fff',
  color: PLUM,
  fontSize: '13px',
}

export function SupportDesk() {
  const { role } = useStaffRole()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [staffList, setStaffList] = useState<StaffListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Selected Ticket for Thread Modal
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const isLead = role === 'admin' || role === 'sales_manager' || role === 'manager'
      const [tList, sList] = await Promise.all([
        listStaffTickets({
          status: statusFilter === 'all' ? undefined : statusFilter,
          priority: priorityFilter === 'all' ? undefined : priorityFilter,
          category: categoryFilter === 'all' ? undefined : categoryFilter,
          search: search.trim() || undefined,
        }),
        isLead ? listStaff().catch(() => []) : Promise.resolve([]),
      ])
      setTickets(tList)
      setStaffList(sList)
      // Keep selected ticket in sync if open
      if (selectedTicket) {
        const updated = tList.find((t) => t.id === selectedTicket.id)
        if (updated) setSelectedTicket(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support tickets.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [statusFilter, priorityFilter, categoryFilter, search, selectedTicket])

  useEffect(() => {
    void loadData()
  }, [statusFilter, priorityFilter, categoryFilter])

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return
    setSendingReply(true)
    try {
      await replyStaffTicket(selectedTicket.id, replyText.trim())
      setReplyText('')
      await loadData(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply.')
    } finally {
      setSendingReply(false)
    }
  }

  const handleStatusChange = async (ticketId: number, newStatus: string) => {
    try {
      await updateStaffTicket(ticketId, { status: newStatus })
      await loadData(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.')
    }
  }

  const handleAssigneeChange = async (ticketId: number, staffEmail: string) => {
    try {
      await updateStaffTicket(ticketId, { assigned_staff_email: staffEmail })
      await loadData(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign staff.')
    }
  }

  // Counts
  const totalCount = tickets.length
  const openCount = tickets.filter((t) => t.status === 'open').length
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length
  const resolvedCount = tickets.filter((t) => t.status === 'resolved').length

  return (
    <ErrorBoundary fallbackTitle="Support Desk">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header */}
        <div style={{ ...CARD, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', padding: '24px 26px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: SURFACE, borderRadius: '20px', border: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              <LifeBuoy size={13} /> Customer Service &amp; Help Desk
            </div>
            <h1 className="luxury-serif" style={{ fontSize: '26px', color: PLUM, margin: 0, fontWeight: 700 }}>
              Support Ticket Management
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', margin: '6px 0 0', maxWidth: '680px' }}>
              Real-time customer service tickets with persistent conversation threads, SLA priorities, and agent assignments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 15px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: PLUM, cursor: 'pointer' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Updating…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#991B1B', fontSize: '13px' }}>
            <AlertCircle size={17} /> {error}
          </div>
        )}

        {/* Top KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div style={{ ...CARD, padding: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Tickets</span>
            <div style={{ fontSize: '26px', fontWeight: 800, color: PLUM, margin: '4px 0 0' }}>{totalCount}</div>
          </div>
          <div style={{ ...CARD, padding: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#DC2626', textTransform: 'uppercase' }}>Open / Unassigned</span>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#DC2626', margin: '4px 0 0' }}>{openCount}</div>
          </div>
          <div style={{ ...CARD, padding: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#D97706', textTransform: 'uppercase' }}>In Progress</span>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#D97706', margin: '4px 0 0' }}>{inProgressCount}</div>
          </div>
          <div style={{ ...CARD, padding: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase' }}>Resolved</span>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#16A34A', margin: '4px 0 0' }}>{resolvedCount}</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ ...CARD, padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={14} color="var(--text-secondary)" style={{ position: 'absolute', left: '10px', top: '11px' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void loadData(true) }}
              placeholder="Search by ticket #, customer, or subject…"
              style={{ ...INPUT, paddingLeft: '32px' }}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...INPUT, width: 'auto' }}>
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ ...INPUT, width: 'auto' }}>
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ ...INPUT, width: 'auto' }}>
            <option value="all">All Categories</option>
            <option value="general">General</option>
            <option value="inquiry">Property Inquiry</option>
            <option value="viewing">Site Viewing</option>
            <option value="payment">Payment &amp; Contracts</option>
            <option value="maintenance">Maintenance</option>
            <option value="complaint">Complaint</option>
          </select>
        </div>

        {/* Tickets Table */}
        <div style={CARD}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} color={GOLD} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
              <div>Loading support tickets…</div>
            </div>
          ) : tickets.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No support tickets found matching the filter criteria.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '850px', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: SURFACE, textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>
                    <th style={{ padding: '12px' }}>Ticket #</th>
                    <th style={{ padding: '12px' }}>Subject</th>
                    <th style={{ padding: '12px' }}>Customer</th>
                    <th style={{ padding: '12px' }}>Category</th>
                    <th style={{ padding: '12px' }}>Priority</th>
                    <th style={{ padding: '12px' }}>Status</th>
                    <th style={{ padding: '12px' }}>Assignee</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }} onClick={() => setSelectedTicket(t)}>
                      <td style={{ padding: '12px', fontWeight: 700, color: PLUM }}>{t.ticket_number}</td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 600, color: PLUM, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.subject}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {t.messages?.length || 1} message(s)
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{t.customer_name || t.customer_email.split('@')[0]}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t.customer_email}</div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ textTransform: 'capitalize', padding: '3px 8px', borderRadius: '4px', background: SURFACE, fontSize: '11.5px', fontWeight: 600 }}>
                          {t.category}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                          background: t.priority === 'urgent' ? '#FEE2E2' : t.priority === 'high' ? '#FEF3C7' : '#F1F5F9',
                          color: t.priority === 'urgent' ? '#B91C1C' : t.priority === 'high' ? '#B45309' : '#475569',
                        }}>
                          {t.priority}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, textTransform: 'capitalize',
                          background: t.status === 'open' ? '#FEF2F2' : t.status === 'in_progress' ? '#FEF3C7' : '#F0FDF4',
                          color: t.status === 'open' ? '#DC2626' : t.status === 'in_progress' ? '#D97706' : '#16A34A',
                        }}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '12px' }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={t.assigned_staff_email || ''}
                          onChange={(e) => void handleAssigneeChange(t.id, e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${BORDER}`, fontSize: '12px' }}
                        >
                          <option value="">Unassigned</option>
                          {staffList.map((s) => (
                            <option key={s.id} value={s.email}>{s.name} ({s.role})</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedTicket(t)}
                          style={{ padding: '6px 12px', borderRadius: '6px', background: PLUM, color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          View Thread
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ticket Thread Modal */}
        {selectedTicket && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '750px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              {/* Modal Header */}
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: GOLD }}>{selectedTicket.ticket_number}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700,
                      background: selectedTicket.status === 'open' ? '#FEF2F2' : selectedTicket.status === 'in_progress' ? '#FEF3C7' : '#F0FDF4',
                      color: selectedTicket.status === 'open' ? '#DC2626' : selectedTicket.status === 'in_progress' ? '#D97706' : '#16A34A',
                    }}>
                      {selectedTicket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: PLUM, margin: 0 }}>
                    {selectedTicket.subject}
                  </h2>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    From: <strong>{selectedTicket.customer_name}</strong> ({selectedTicket.customer_email})
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {selectedTicket.status !== 'resolved' ? (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(selectedTicket.id, 'resolved')}
                      style={{ padding: '6px 12px', borderRadius: '6px', background: '#16A34A', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <CheckCircle2 size={13} /> Mark Resolved
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(selectedTicket.id, 'in_progress')}
                      style={{ padding: '6px 12px', borderRadius: '6px', background: '#D97706', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Reopen
                    </button>
                  )}
                  <button type="button" onClick={() => setSelectedTicket(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                    <X size={20} color="var(--text-secondary)" />
                  </button>
                </div>
              </div>

              {/* Message List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {selectedTicket.messages?.map((m) => {
                  const isStaff = m.sender_type === 'staff'
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isStaff ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        padding: '14px 18px',
                        borderRadius: '12px',
                        background: isStaff ? PLUM : SURFACE,
                        color: isStaff ? '#fff' : PLUM,
                        border: isStaff ? 'none' : `1px solid ${BORDER}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px', fontSize: '11px', color: isStaff ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>
                        <strong>{m.sender_name || (isStaff ? 'LYKA Agent' : 'Customer')}</strong>
                        <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div style={{ fontSize: '13.5px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {m.message}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reply Box */}
              <div style={{ padding: '16px 20px', borderTop: `1px solid ${BORDER}`, background: '#FAFAFA' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type an official response to the customer…"
                    rows={3}
                    style={{ ...INPUT, resize: 'vertical' }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendReply()}
                    disabled={sendingReply || !replyText.trim()}
                    style={{
                      padding: '0 20px',
                      background: 'var(--gold-primary, #C5A869)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: sendingReply || !replyText.trim() ? 0.6 : 1,
                    }}
                  >
                    <Send size={15} /> Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
