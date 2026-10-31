import { useEffect, useState } from 'react'
import {
  X,
  PhoneCall,
  Calendar,
  Sparkles,
  RefreshCw,
  Flame,
  Clock,
  Eye,
  AlertTriangle,
} from 'lucide-react'
import { getLeadDetails, type LeadDetailsResponse } from '../services/contactCenterApi'

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

interface CustomerDetailsModalProps {
  leadId: number
  onClose: () => void
  onLogCall?: (leadId: number, name?: string | null, phone?: string | null) => void
}

export function CustomerDetailsModal({ leadId, onClose, onLogCall }: CustomerDetailsModalProps) {
  const [data, setData] = useState<LeadDetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getLeadDetails(leadId)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load details')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [leadId])

  return (
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
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          maxWidth: '740px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          border: '1px solid #C6A15B',
        }}
      >
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#6B7280' }}>
            <RefreshCw
              size={28}
              style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block', color: '#C6A15B' }}
            />
            Loading customer contact details & activity history…
          </div>
        ) : error || !data ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#DC2626' }}>
            <AlertTriangle size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
            {error || 'Lead not found or access denied.'}
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '6px 16px', borderRadius: '6px', background: '#F3F4F6', border: 'none', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                background: '#FAF8F4',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 className="luxury-serif" style={{ margin: 0, fontSize: '20px', color: '#3B2348' }}>
                    {data.lead.customer_name || 'Anonymous Customer'}
                  </h3>
                  {getTemperatureBadge(data.lead.lead_temperature)}
                  <span
                    style={{
                      fontSize: '11.5px',
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: '#EEE7F2',
                      color: '#3B2348',
                      fontWeight: 700,
                    }}
                  >
                    {data.lead.status || 'New'}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#4B5563', marginTop: '6px' }}>
                  Phone:{' '}
                  <strong>
                    {data.lead.contact_phone && data.lead.contact_phone.trim()
                      ? data.lead.contact_phone
                      : 'Phone number not provided'}
                  </strong>{' '}
                  • Email: <strong>{data.lead.contact_email || 'Not provided'}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                  Lead Source: <strong>{data.lead.lead_source || data.lead.discovery_source || 'Website'}</strong> • Assigned
                  Agent: <strong>{data.lead.assigned_to?.name || 'Unassigned'}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {onLogCall && (
                  <button
                    type="button"
                    onClick={() => {
                      onLogCall(data.lead.id, data.lead.customer_name, data.lead.contact_phone)
                    }}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 2px 6px rgba(59, 35, 72, 0.2)',
                    }}
                  >
                    <PhoneCall size={13} color="#C6A15B" />
                    Log Call
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6B7280',
                    padding: '4px',
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ padding: '24px' }}>
              {/* Next Recommended Action Banner */}
              {data.next_recommended_action && (
                <div
                  style={{
                    background: '#F5F3FF',
                    border: '1px solid #DDD6FE',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <Clock size={16} color="#7C3AED" style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '13px', color: '#4C1D95' }}>
                    <strong>Next Recommended Action:</strong> {data.next_recommended_action}
                  </div>
                </div>
              )}

              {/* Property Requirements Card */}
              <div
                style={{
                  background: '#FAF8F4',
                  borderRadius: '10px',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  padding: '16px 20px',
                  marginBottom: '20px',
                }}
              >
                <h4 className="luxury-serif" style={{ margin: '0 0 10px', fontSize: '15px', color: '#3B2348' }}>
                  Property Preferences &amp; Requirements
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '10px',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <span style={{ color: '#6B7280' }}>Location:</span>{' '}
                    <strong>{data.lead.location || 'Dubai'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Property Type:</span>{' '}
                    <strong>{data.lead.property_type || 'Apartment'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Purpose:</span>{' '}
                    <strong>{data.lead.purpose || 'Buy'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Budget Range:</span>{' '}
                    <strong>
                      {data.lead.budget_max
                        ? data.lead.budget_min
                          ? `AED ${data.lead.budget_min.toLocaleString()} - ${data.lead.budget_max.toLocaleString()}`
                          : `Up to AED ${data.lead.budget_max.toLocaleString()}`
                        : 'Not specified'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Bedrooms:</span>{' '}
                    <strong>{data.lead.bedrooms ? `${data.lead.bedrooms} BHK` : 'Any'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Listing Ref:</span>{' '}
                    <strong>{data.lead.property_ref || 'General inquiry'}</strong>
                  </div>
                </div>
                {data.lead.amenities && data.lead.amenities.length > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {data.lead.amenities.map((am) => (
                      <span
                        key={am}
                        style={{
                          fontSize: '11px',
                          background: '#FFFFFF',
                          border: '1px solid #D1D5DB',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          color: '#4B5563',
                        }}
                      >
                        ✓ {am}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Calling Stats & First Call Information */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Total Attempts</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#3B2348', marginTop: '2px' }}>
                    {data.stats.total_calls}
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>First Call Status</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: data.first_call ? '#16A34A' : '#6B7280', marginTop: '4px' }}>
                    {data.first_call ? formatOutcome(data.first_call.outcome || data.first_call.status) : 'Pending'}
                  </div>
                  {data.first_call?.date && (
                    <div style={{ fontSize: '10.5px', color: '#9CA3AF', marginTop: '2px' }}>
                      {new Date(data.first_call.date).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Latest Outcome</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: data.latest_call ? '#3B2348' : '#9CA3AF', marginTop: '4px' }}>
                    {data.latest_call ? formatOutcome(data.latest_call.outcome || data.latest_call.status) : 'None'}
                  </div>
                  {data.latest_call?.date && (
                    <div style={{ fontSize: '10.5px', color: '#9CA3AF', marginTop: '2px' }}>
                      {new Date(data.latest_call.date).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Connected Calls</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#16A34A', marginTop: '2px' }}>
                    {data.stats.connected_calls}
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Appointments</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#C6A15B', marginTop: '2px' }}>
                    {data.stats.viewings_count}
                  </div>
                </div>
              </div>

              {/* Complete Chronological Activity History */}
              <h4 className="luxury-serif" style={{ margin: '0 0 14px', fontSize: '16px', color: '#3B2348' }}>
                Complete Chronological History &amp; Call Records ({data.timeline.length})
              </h4>

              {data.timeline.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#9CA3AF', fontSize: '13.5px', background: '#FAF8F4', borderRadius: '8px' }}>
                  No call or activity records logged for this customer yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.timeline.map((item, idx) => {
                    const isCall = item.type === 'call'
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'flex-start',
                        }}
                      >
                        {/* Icon */}
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: isCall
                              ? item.is_connected
                                ? 'rgba(22, 163, 74, 0.15)'
                                : 'rgba(217, 119, 6, 0.15)'
                              : item.type === 'follow_up'
                              ? 'rgba(124, 58, 237, 0.15)'
                              : item.type === 'viewing'
                              ? 'rgba(198, 161, 91, 0.2)'
                              : '#EEE7F2',
                            color: isCall
                              ? item.is_connected
                                ? '#16A34A'
                                : '#D97706'
                              : item.type === 'follow_up'
                              ? '#7C3AED'
                              : item.type === 'viewing'
                              ? '#9E782F'
                              : '#3B2348',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {isCall ? (
                            <PhoneCall size={15} />
                          ) : item.type === 'follow_up' ? (
                            <Calendar size={15} />
                          ) : item.type === 'viewing' ? (
                            <Eye size={15} />
                          ) : (
                            <Sparkles size={15} />
                          )}
                        </div>

                        {/* Record Details */}
                        <div
                          style={{
                            flex: 1,
                            background: '#FFFFFF',
                            border: '1px solid #E5E7EB',
                            borderRadius: '8px',
                            padding: '12px 14px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F2937' }}>{item.title}</div>
                            <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                              {item.time ? new Date(item.time).toLocaleString() : ''}
                            </div>
                          </div>

                          {item.details?.staff_email && (
                            <div style={{ fontSize: '11.5px', color: '#6B7280', marginTop: '2px' }}>
                              Agent: {item.details.staff_email}
                              {item.details.duration_minutes ? ` • Duration: ${item.details.duration_minutes} min` : ''}
                            </div>
                          )}

                          {item.details?.customer_response && (
                            <div style={{ fontSize: '12px', color: '#374151', marginTop: '6px' }}>
                              <strong>Customer Feedback:</strong> {item.details.customer_response}
                            </div>
                          )}

                          {item.details?.recommended_action && (
                            <div style={{ fontSize: '12px', color: '#4C1D95', marginTop: '4px' }}>
                              <strong>Recommended Next Step:</strong> {item.details.recommended_action}
                            </div>
                          )}

                          {item.details?.notes && (
                            <div style={{ fontSize: '12px', color: '#4B5563', marginTop: '4px' }}>
                              {item.details.notes}
                            </div>
                          )}

                          {item.details?.feedback && (
                            <div style={{ fontSize: '12px', color: '#1F2937', marginTop: '4px' }}>
                              Viewing Feedback: {item.details.feedback} ({item.details.interest_level || 'Normal'})
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
