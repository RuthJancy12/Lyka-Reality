import { useState, useEffect, useCallback } from 'react'
import {
  Phone,
  PhoneCall,
  Search,
  RefreshCw,
  Eye,
  AlertTriangle,
} from 'lucide-react'
import {
  getDailyCallHistory,
  type DailyCallItem,
} from '../services/contactCenterApi'
import { CustomerDetailsModal } from '../components/CustomerDetailsModal'
import { LogCallModal } from '../components/LogCallModal'

function formatOutcome(status?: string | null) {
  if (!status) return 'None'
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function getOutcomeBadge(status: string, isConnected: boolean) {
  const label = formatOutcome(status)
  if (isConnected) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 9px',
          borderRadius: '12px',
          fontSize: '11.5px',
          fontWeight: 700,
          background: 'rgba(22, 163, 74, 0.12)',
          color: '#16A34A',
          border: '1px solid rgba(22, 163, 74, 0.3)',
        }}
      >
        ✓ {label}
      </span>
    )
  }
  const isNegative = ['wrong_number', 'not_interested'].includes(status)
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: '12px',
        fontSize: '11.5px',
        fontWeight: 600,
        background: isNegative ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.12)',
        color: isNegative ? '#DC2626' : '#D97706',
        border: `1px solid ${isNegative ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.3)'}`,
      }}
    >
      {label}
    </span>
  )
}

export function CallHistory() {
  const [calls, setCalls] = useState<DailyCallItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [viewLeadId, setViewLeadId] = useState<number | null>(null)
  const [activeCallLead, setActiveCallLead] = useState<{
    id: number
    name?: string | null
    phone?: string | null
    totalAttempts?: number
  } | null>(null)

  const loadCalls = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getDailyCallHistory({
        date_preset: datePreset === 'all' || datePreset === 'custom' ? undefined : datePreset,
        start_date: datePreset === 'custom' && startDate ? new Date(startDate).toISOString() : undefined,
        end_date: datePreset === 'custom' && endDate ? new Date(endDate).toISOString() : undefined,
        status: statusFilter || undefined,
        page,
        limit,
      })
      setCalls(res.calls)
      setTotal(res.total_calls)
    } catch (err: any) {
      setError(err.message || 'Failed to load call history')
    } finally {
      setLoading(false)
    }
  }, [datePreset, startDate, endDate, statusFilter, page, limit])

  useEffect(() => {
    loadCalls()
  }, [loadCalls])

  // Filter in-memory for search query
  const displayedCalls = calls.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      c.customer_name?.toLowerCase().includes(q) ||
      c.contact_phone?.toLowerCase().includes(q) ||
      c.contact_email?.toLowerCase().includes(q) ||
      c.notes?.toLowerCase().includes(q) ||
      c.customer_response?.toLowerCase().includes(q) ||
      c.recommended_action?.toLowerCase().includes(q)
    )
  })

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1440px', margin: '0 auto', color: '#26232B' }}>
      {/* Header */}
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
              <Phone size={22} />
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
                Call History &amp; Attempt Records
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: '#6B7280' }}>
                Chronological log of every customer call attempt, outcome, notes, and follow-up from PostgreSQL
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={loadCalls}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '9px 16px',
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
          Refresh History
        </button>
      </div>

      {/* Date Filter Pills */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        {[
          { key: 'all', label: 'All Time' },
          { key: 'today', label: 'Today' },
          { key: 'yesterday', label: 'Yesterday' },
          { key: 'this_week', label: 'This Week' },
          { key: 'this_month', label: 'This Month' },
          { key: 'custom', label: 'Custom Date Range' },
        ].map((pill) => {
          const isActive = datePreset === pill.key
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => {
                setDatePreset(pill.key as any)
                setPage(1)
              }}
              style={{
                padding: '7px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: isActive ? 700 : 500,
                background: isActive ? '#3B2348' : '#FAF8F4',
                color: isActive ? '#C6A15B' : '#4B5563',
                border: `1px solid ${isActive ? '#3B2348' : '#E5E7EB'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {pill.label}
            </button>
          )
        })}
      </div>

      {/* Custom Date Inputs if custom selected */}
      {datePreset === 'custom' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            background: '#FAF8F4',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: '#4B5563', fontWeight: 600 }}>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12.5px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: '#4B5563', fontWeight: 600 }}>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12.5px' }}
            />
          </div>
          <button
            type="button"
            onClick={loadCalls}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: '#3B2348',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Apply Range
          </button>
        </div>
      )}

      {/* Search & Status Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '20px',
          background: '#FFFFFF',
          padding: '14px 18px',
          borderRadius: '10px',
          border: '1px solid #E5E7EB',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', position: 'relative' }}>
          <Search size={16} color="#9CA3AF" style={{ position: 'absolute', left: '10px' }} />
          <input
            type="text"
            placeholder="Search customer, phone, notes, next action…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              borderRadius: '6px',
              border: '1px solid #D1D5DB',
              fontSize: '13px',
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
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
          <option value="">All Call Outcomes</option>
          <option value="connected">Connected / Spoke with Client</option>
          <option value="site_visit_scheduled">Site Visit Scheduled</option>
          <option value="callback_requested">Callback Requested</option>
          <option value="follow_up_required">Follow-up Required</option>
          <option value="no_answer">No Answer</option>
          <option value="busy">Line Busy</option>
          <option value="switched_off">Switched Off / Unreachable</option>
          <option value="wrong_number">Wrong Number</option>
          <option value="not_interested">Not Interested</option>
        </select>
      </div>

      {/* Call History Table */}
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
            <RefreshCw
              size={24}
              style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block', color: '#C6A15B' }}
            />
            Loading call records from PostgreSQL…
          </div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#DC2626' }}>
            <AlertTriangle size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
            {error}
          </div>
        ) : displayedCalls.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#6B7280' }}>
            <Phone size={32} style={{ margin: '0 auto 12px', display: 'block', color: '#D1D5DB' }} />
            <div style={{ fontWeight: 600, fontSize: '16px', color: '#374151' }}>No call records found</div>
            <p style={{ fontSize: '13.5px', marginTop: '4px' }}>
              No calls match the selected date or outcome filters.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr
                  style={{
                    background: '#FAF8F4',
                    borderBottom: '1px solid #E5E7EB',
                    color: '#4B5563',
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <th style={{ padding: '12px 16px' }}>Date &amp; Time</th>
                  <th style={{ padding: '12px 16px' }}>Customer &amp; Phone</th>
                  <th style={{ padding: '12px 16px' }}>Staff Agent</th>
                  <th style={{ padding: '12px 16px' }}>Outcome</th>
                  <th style={{ padding: '12px 16px' }}>Attempt #</th>
                  <th style={{ padding: '12px 16px' }}>Customer Response</th>
                  <th style={{ padding: '12px 16px' }}>Next Recommended Action</th>
                  <th style={{ padding: '12px 16px' }}>Follow-up Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedCalls.map((call) => (
                  <tr key={call.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    {/* Timestamp */}
                    <td style={{ padding: '12px 16px', color: '#4B5563', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>
                        {call.attempted_at ? new Date(call.attempted_at).toLocaleDateString() : '—'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                        {call.attempted_at
                          ? new Date(call.attempted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </div>
                    </td>

                    {/* Customer & Phone */}
                    <td style={{ padding: '12px 16px' }}>
                      <div
                        onClick={() => setViewLeadId(call.lead_id)}
                        style={{
                          fontWeight: 700,
                          color: '#3B2348',
                          cursor: 'pointer',
                        }}
                      >
                        {call.customer_name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#4B5563', marginTop: '2px' }}>
                        {call.contact_phone && call.contact_phone.trim()
                          ? call.contact_phone
                          : 'Phone number not provided'}
                      </div>
                    </td>

                    {/* Staff Agent */}
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      <div style={{ fontWeight: 500 }}>{call.staff_name || call.staff_email}</div>
                    </td>

                    {/* Outcome */}
                    <td style={{ padding: '12px 16px' }}>
                      {getOutcomeBadge(call.status, call.is_connected)}
                      {call.duration_minutes ? (
                        <span style={{ fontSize: '11.5px', color: '#6B7280', marginLeft: '6px' }}>
                          ({call.duration_minutes}m)
                        </span>
                      ) : null}
                    </td>

                    {/* Attempt # */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontWeight: 700, color: '#3B2348' }}>#{call.attempt_number}</span>
                      {call.is_first_call && (
                        <span
                          style={{
                            marginLeft: '6px',
                            fontSize: '10.5px',
                            background: 'rgba(198, 161, 91, 0.2)',
                            color: '#9E782F',
                            padding: '2px 6px',
                            borderRadius: '8px',
                            fontWeight: 700,
                          }}
                        >
                          ★ First
                        </span>
                      )}
                    </td>

                    {/* Customer Response */}
                    <td style={{ padding: '12px 16px', color: '#374151', maxWidth: '240px' }}>
                      {call.customer_response || call.notes || '—'}
                    </td>

                    {/* Recommended Next Action */}
                    <td style={{ padding: '12px 16px', color: '#4C1D95', maxWidth: '200px' }}>
                      {call.recommended_action || '—'}
                    </td>

                    {/* Follow-up Date */}
                    <td style={{ padding: '12px 16px', color: '#7C3AED', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {call.next_follow_up_at ? new Date(call.next_follow_up_at).toLocaleDateString() : '—'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setViewLeadId(call.lead_id)}
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
                          <Eye size={13} /> View
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveCallLead({
                              id: call.lead_id,
                              name: call.customer_name,
                              phone: call.contact_phone,
                              totalAttempts: call.attempt_number,
                            })
                          }}
                          style={{
                            padding: '6px 10px',
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
                          }}
                        >
                          <PhoneCall size={13} color="#C6A15B" /> Next Call
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
              Showing {displayedCalls.length} of {total} call records (Page {page} of {totalPages})
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

      {/* Modals */}
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
          onClose={() => setActiveCallLead(null)}
          onSuccess={loadCalls}
        />
      )}
    </div>
  )
}

