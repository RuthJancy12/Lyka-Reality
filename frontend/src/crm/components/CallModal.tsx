// LYKA REALTY - Manual Phone Call Modal & Call Activity Logger
// Provides device dialing (tel: link), desktop browser dialer guidance,
// explicit attempt confirmation, outcome recording, and next follow-up scheduling.

import { useState } from 'react'
import {
  Phone, PhoneCall, Calendar, AlertCircle,
  CheckCircle2, X, Loader2, AlertTriangle
} from 'lucide-react'
import {
  createCall,
  type CallLog
} from '../services/staffApi'

const PLUM = 'var(--plum-main, #1F101C)'
const GOLD = 'var(--gold-dark, #A37E2C)'
const BORDER = 'var(--champagne-border, #E8DCC8)'

interface CallModalProps {
  isOpen: boolean
  onClose: () => void
  leadId: number
  customerName?: string | null
  customerPhone?: string | null
  currentLeadTemperature?: string | null
  onSuccess?: (call: CallLog) => void
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function addTime(base: Date, days: number, months: number = 0): string {
  const d = new Date(base.getTime())
  if (months > 0) {
    d.setMonth(d.getMonth() + months)
  }
  if (days > 0) {
    d.setDate(d.getDate() + days)
  }
  // Default reminder time: 10:00 AM
  d.setHours(10, 0, 0, 0)
  return toLocalDatetimeString(d)
}

export function CallModal({
  isOpen,
  onClose,
  leadId,
  customerName,
  customerPhone,
  currentLeadTemperature,
  onSuccess,
}: CallModalProps) {
  const hasPhone = Boolean(customerPhone && customerPhone.trim().length > 3)
  const cleanPhone = customerPhone ? customerPhone.replace(/[^\d+]/g, '') : ''
  const telHref = cleanPhone ? `tel:${cleanPhone}` : '#'

  // Form state
  const [attemptedAt, setAttemptedAt] = useState<string>(() => toLocalDatetimeString(new Date()))
  const [outcome, setOutcome] = useState<string>('connected')
  const [notes, setNotes] = useState<string>('')
  const [nextFollowUp, setNextFollowUp] = useState<string>('')
  const [leadTemperature, setLeadTemperature] = useState<string>(currentLeadTemperature || '')
  const [markAsLost, setMarkAsLost] = useState<boolean>(false)
  const [durationMinutes, setDurationMinutes] = useState<string>('')

  // UI state
  const [dialerOpened, setDialerOpened] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleDialClick = () => {
    setDialerOpened(true)
    setError(null)
  }

  const handleApplyPreset = (days: number, months: number = 0) => {
    const base = new Date()
    setNextFollowUp(addTime(base, days, months))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (!outcome) {
      setError('Please select a call outcome.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = {
        status: outcome,
        scheduled_at: attemptedAt ? new Date(attemptedAt).toISOString() : new Date().toISOString(),
        notes: notes.trim() || undefined,
        next_follow_up_at: (outcome !== 'not_interested' && nextFollowUp) ? new Date(nextFollowUp).toISOString() : undefined,
        duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : undefined,
        lead_temperature: (outcome === 'connected' && leadTemperature) ? leadTemperature : undefined,
        lead_status: (outcome === 'not_interested' && markAsLost) ? 'lost' : undefined,
      }

      const savedCall = await createCall(leadId, payload)
      onSuccess?.(savedCall)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record call attempt.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const isConnected = outcome === 'connected' || outcome === 'follow_up_required' || outcome === 'site_visit_scheduled'
  const isNotInterested = outcome === 'not_interested'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-call-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(26, 13, 24, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          maxWidth: '560px',
          width: '100%',
          boxShadow: '0 20px 45px rgba(26, 13, 24, 0.22)',
          border: `1px solid ${BORDER}`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${BORDER}`,
            background: '#FAF7F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: '#FAF0DB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: GOLD,
              }}
            >
              <Phone size={18} />
            </div>
            <div>
              <h2
                id="manual-call-modal-title"
                style={{
                  margin: 0,
                  fontSize: '17px',
                  fontWeight: 800,
                  color: PLUM,
                }}
              >
                Manual Customer Call
              </h2>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '12px',
                  color: 'var(--text-secondary, #756D63)',
                }}
              >
                Lead #{leadId} {customerName ? `· ${customerName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close call modal"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary, #756D63)',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px' }}>
          {/* Customer & Phone Verification Card */}
          <div
            style={{
              background: '#FAF8F5',
              border: `1px solid ${BORDER}`,
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-secondary, #756D63)',
                  }}
                >
                  Customer Phone
                </span>
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: hasPhone ? PLUM : '#9C4A3C',
                    marginTop: '2px',
                  }}
                >
                  {customerPhone || 'No phone number on record'}
                </div>
              </div>

              {hasPhone ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <a
                    href={telHref}
                    onClick={handleDialClick}
                    className="gold-btn"
                    style={{
                      textDecoration: 'none',
                      padding: '8px 16px',
                      fontSize: '13px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                    }}
                  >
                    <PhoneCall size={14} /> Open Device Dialer
                  </a>
                  {dialerOpened && (
                    <span style={{ fontSize: '11px', color: '#2E7D4F', fontWeight: 700 }}>
                      ✓ Dialer opened
                    </span>
                  )}
                </div>
              ) : (
                <span
                  style={{
                    fontSize: '12px',
                    color: '#9C4A3C',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <AlertTriangle size={14} /> Phone Missing
                </span>
              )}
            </div>

            {/* Desktop / Manual dialing explanation */}
            {hasPhone && (
              <div
                style={{
                  marginTop: '10px',
                  paddingTop: '10px',
                  borderTop: '1px solid rgba(232, 220, 200, 0.6)',
                  fontSize: '11.5px',
                  color: 'var(--text-secondary, #756D63)',
                  lineHeight: 1.45,
                }}
              >
                <span>
                  <strong>Calling advice:</strong> On desktop browsers, clicking opens your system phone handler (e.g. FaceTime, Phone Link, Skype). You can also dial manually on your mobile device.
                </span>
              </div>
            )}

            {/* Explicit attempt guidance */}
            <div
              style={{
                marginTop: '8px',
                fontSize: '11px',
                color: '#8A6E30',
                background: '#FBF5E8',
                borderRadius: '6px',
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
              }}
            >
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>
                <strong>CRM Rule:</strong> Opening the dialer does <em>not</em> claim a call connected. Only saving the actual outcome below logs your attempt to the CRM history.
              </span>
            </div>
          </div>

          {/* Form Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Call Outcome */}
            <div>
              <label
                htmlFor="call-outcome-select"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: PLUM,
                  marginBottom: '5px',
                }}
              >
                Call Outcome <span style={{ color: '#9C4A3C' }}>*</span>
              </label>
              <select
                id="call-outcome-select"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '13.5px',
                  background: '#fff',
                  color: PLUM,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                <option value="connected">Connected (Spoke with customer)</option>
                <option value="attempted_no_answer">No Answer (Customer did not answer)</option>
                <option value="busy_unreachable">Busy (Line busy or unreachable)</option>
                <option value="follow_up_required">Callback Requested (Follow-up requested)</option>
                <option value="wrong_number">Wrong Number (Invalid phone number)</option>
                <option value="not_interested">Not Interested (Customer explicitly declined)</option>
              </select>
            </div>

            {/* Date and Time of Attempt */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div>
                <label
                  htmlFor="call-attempt-time"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: PLUM,
                    marginBottom: '5px',
                  }}
                >
                  Call Attempt Date & Time
                </label>
                <input
                  id="call-attempt-time"
                  type="datetime-local"
                  value={attemptedAt}
                  onChange={(e) => setAttemptedAt(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${BORDER}`,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Optional Call Duration if Connected */}
              {isConnected && (
                <div>
                  <label
                    htmlFor="call-duration"
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: PLUM,
                      marginBottom: '5px',
                    }}
                  >
                    Duration (Minutes, optional)
                  </label>
                  <input
                    id="call-duration"
                    type="number"
                    min="0"
                    max="300"
                    placeholder="e.g. 5"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${BORDER}`,
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Optional Lead Temperature when Connected */}
            {isConnected && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: PLUM,
                    marginBottom: '5px',
                  }}
                >
                  Customer Interest / Temperature (Optional)
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { value: '', label: 'Unchanged' },
                    { value: 'Hot', label: '🔥 Hot (Immediate buyer/tenant)' },
                    { value: 'Warm', label: '☀️ Warm (Interested, exploring)' },
                    { value: 'Cold', label: '❄️ Cold (Long-term / low interest)' },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setLeadTemperature(t.value)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: leadTemperature === t.value ? `1.5px solid ${GOLD}` : `1px solid ${BORDER}`,
                        background: leadTemperature === t.value ? '#FAF3E3' : '#fff',
                        color: leadTemperature === t.value ? '#8A6E30' : 'var(--text-secondary, #756D63)',
                        cursor: 'pointer',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* If Not Interested: Option to close lead */}
            {isNotInterested && (
              <div
                style={{
                  background: '#FDF2F2',
                  border: '1px solid #F0C4C4',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <input
                  id="mark-lost-check"
                  type="checkbox"
                  checked={markAsLost}
                  onChange={(e) => setMarkAsLost(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="mark-lost-check" style={{ fontSize: '12.5px', color: '#9C4A3C', cursor: 'pointer', fontWeight: 600 }}>
                  Update Lead Stage to &quot;Lost&quot; based on customer request
                </label>
              </div>
            )}

            {/* Notes / Comments */}
            <div>
              <label
                htmlFor="call-notes"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: PLUM,
                  marginBottom: '5px',
                }}
              >
                Call Notes / Comments
              </label>
              <textarea
                id="call-notes"
                rows={3}
                placeholder={
                  outcome === 'attempted_no_answer'
                    ? 'e.g. Rang 5 times, customer did not answer. Sent follow-up WhatsApp/SMS.'
                    : outcome === 'not_interested'
                    ? 'e.g. Customer purchased another property in Downtown / not looking anymore.'
                    : 'e.g. Discussed 2-bedroom in Dubai Marina, budget 2.2M AED. Requested follow-up call.'
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                }}
              />
            </div>

            {/* Next Follow-Up Date & Quick Presets */}
            {!isNotInterested && (
              <div
                style={{
                  background: '#FAF7F0',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '10px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label
                    htmlFor="call-follow-up-date"
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: PLUM,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Calendar size={13} color={GOLD} /> Next Follow-Up Date (Optional)
                  </label>
                  {nextFollowUp && (
                    <button
                      type="button"
                      onClick={() => setNextFollowUp('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '11px',
                        color: '#9C4A3C',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <input
                  id="call-follow-up-date"
                  type="datetime-local"
                  value={nextFollowUp}
                  onChange={(e) => setNextFollowUp(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${BORDER}`,
                    fontSize: '13px',
                    background: '#fff',
                    boxSizing: 'border-box',
                    marginBottom: '8px',
                  }}
                />

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary, #756D63)', marginRight: '2px' }}>
                    Quick presets:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(1)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: `1px solid ${BORDER}`,
                      background: '#fff',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    +1 Day
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(3)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: `1px solid ${BORDER}`,
                      background: '#fff',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    +3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(7)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: `1px solid ${BORDER}`,
                      background: '#fff',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    +1 Week
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(0, 1)}
                    title="Customer requested call in 1 month"
                    style={{
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: `1px solid ${BORDER}`,
                      background: '#FAF0DB',
                      color: '#8A6E30',
                      fontWeight: 700,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    +1 Month
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                style={{
                  background: '#FDF1F1',
                  border: '1px solid #E8A0A0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                  color: '#8C2F2F',
                  fontSize: '12.5px',
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div
            style={{
              marginTop: '22px',
              paddingTop: '16px',
              borderTop: `1px solid ${BORDER}`,
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                border: `1px solid ${BORDER}`,
                background: '#fff',
                color: 'var(--text-secondary, #756D63)',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="gold-btn"
              style={{
                padding: '9px 20px',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                opacity: saving ? 0.7 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} /> Save Call Record
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
