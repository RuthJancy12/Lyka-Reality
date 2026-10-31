import React, { useState, useMemo } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { logContactCall } from '../services/contactCenterApi'

const CONNECTED_OPTIONS = [
  { value: 'connected', label: 'Answered / Connected with Client' },
  { value: 'interested', label: 'Interested in Property' },
  { value: 'site_visit_scheduled', label: 'Site Visit / Viewing Scheduled' },
  { value: 'callback_requested', label: 'Call Back Requested' },
  { value: 'follow_up_tomorrow', label: 'Follow Up Tomorrow' },
  { value: 'follow_up_month', label: 'Follow Up in One Month' },
  { value: 'follow_up_3months', label: 'Follow Up in Three Months' },
  { value: 'follow_up_required', label: 'Custom Follow-Up Date' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'dnd', label: 'Do Not Disturb (DND)' },
]

const NOT_CONNECTED_OPTIONS = [
  { value: 'no_answer', label: 'No Answer' },
  { value: 'missed', label: 'Missed Call' },
  { value: 'busy', label: 'Line Busy' },
  { value: 'switched_off', label: 'Switched Off / Unreachable' },
  { value: 'wrong_number', label: 'Wrong Number' },
]

interface LogCallModalProps {
  leadId: number
  customerName?: string | null
  phone?: string | null
  totalAttempts?: number
  currentTemperature?: string | null
  onClose: () => void
  onSuccess: () => void
}

export function LogCallModal({
  leadId,
  customerName,
  phone,
  totalAttempts = 0,
  currentTemperature = 'Warm',
  onClose,
  onSuccess,
}: LogCallModalProps) {
  const [callStatus, setCallStatus] = useState('connected')

  const handleStatusSelect = (val: string) => {
    setCallStatus(val)
    const now = new Date()
    if (val === 'follow_up_tomorrow') {
      const tmr = new Date(now.getTime() + 24 * 3600 * 1000)
      tmr.setHours(10, 0, 0, 0)
      setNextFollowUp(tmr.toISOString().slice(0, 16))
    } else if (val === 'follow_up_month') {
      const nextM = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
      nextM.setHours(10, 0, 0, 0)
      setNextFollowUp(nextM.toISOString().slice(0, 16))
    } else if (val === 'follow_up_3months') {
      const next3M = new Date(now.getTime() + 90 * 24 * 3600 * 1000)
      next3M.setHours(10, 0, 0, 0)
      setNextFollowUp(next3M.toISOString().slice(0, 16))
    } else if (val === 'dnd' || val === 'not_interested') {
      setNextFollowUp('')
    }
  }
  const [durationMins, setDurationMins] = useState<number | ''>(5)
  const [customerResponse, setCustomerResponse] = useState('')
  const [recommendedAction, setRecommendedAction] = useState('')
  const [callNotes, setCallNotes] = useState('')
  const [nextFollowUp, setNextFollowUp] = useState('')
  const [leadTempUpdate, setLeadTempUpdate] = useState(currentTemperature || 'Warm')
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const isConnected = useMemo(() => {
    return CONNECTED_OPTIONS.some((o) => o.value === callStatus)
  }, [callStatus])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSuccessMsg('')
    try {
      await logContactCall({
        lead_id: leadId,
        status: callStatus,
        duration_minutes: durationMins === '' ? null : Number(durationMins),
        notes: callNotes.trim() || null,
        customer_response: customerResponse.trim() || null,
        recommended_action: recommendedAction.trim() || null,
        next_follow_up_at: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
        lead_temperature: leadTempUpdate || null,
      })

      setSuccessMsg('Call logged successfully!')
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 700)
    } catch (err: any) {
      alert(`Failed to log call: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const isFirstCall = totalAttempts === 0

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
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          border: '1px solid #C6A15B',
        }}
      >
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 className="luxury-serif" style={{ margin: 0, fontSize: '18px', color: '#3B2348' }}>
                Log Call with {customerName || 'Customer'}
              </h3>
              {isFirstCall ? (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: 'rgba(198, 161, 91, 0.2)',
                    color: '#9E782F',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  ★ First Call Attempt
                </span>
              ) : (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: '#EEE7F2',
                    color: '#3B2348',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  Attempt #{totalAttempts + 1}
                </span>
              )}
            </div>
            <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
              Phone: <strong>{phone && phone.trim() ? phone : 'Phone number not provided'}</strong>
            </div>
          </div>

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

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {successMsg && (
            <div
              style={{
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#065F46',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={16} />
              {successMsg}
            </div>
          )}

          {/* Call Outcome Grouped Selection */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
              Call Outcome *
            </label>
            <select
              value={callStatus}
              onChange={(e) => handleStatusSelect(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '13.5px',
                background: '#fff',
              }}
            >
              <optgroup label="✓ Connected Outcomes">
                {CONNECTED_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="✗ Not Connected Outcomes">
                {NOT_CONNECTED_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Duration (if connected) */}
          {isConnected && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
                Call Duration (Minutes)
              </label>
              <input
                type="number"
                min={1}
                max={240}
                value={durationMins}
                onChange={(e) => setDurationMins(e.target.value === '' ? '' : Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #D1D5DB',
                  fontSize: '13.5px',
                }}
              />
            </div>
          )}

          {/* Customer Response */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
              Customer Response &amp; Feedback
            </label>
            <textarea
              rows={2}
              placeholder="What did the customer state? (e.g. interested in 2BHK in Marina, ready to view next Tuesday)"
              value={customerResponse}
              onChange={(e) => setCustomerResponse(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '13px',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Recommended Next Action */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
              Recommended Next Action
            </label>
            <input
              type="text"
              placeholder="e.g. Share 3 off-plan brochures on WhatsApp, confirm viewing"
              value={recommendedAction}
              onChange={(e) => setRecommendedAction(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '13px',
              }}
            />
          </div>

          {/* Next Follow-up Schedule & Lead Temperature */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
                Next Follow-up Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={nextFollowUp}
                onChange={(e) => setNextFollowUp(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #D1D5DB',
                  fontSize: '12.5px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
                Lead Temperature
              </label>
              <select
                value={leadTempUpdate}
                onChange={(e) => setLeadTempUpdate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #D1D5DB',
                  fontSize: '12.5px',
                  background: '#fff',
                }}
              >
                <option value="Hot">🔥 Hot</option>
                <option value="Warm">⚡ Warm</option>
                <option value="Cold">❄️ Cold</option>
              </select>
            </div>
          </div>

          {/* Internal Notes */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
              Internal Call Notes
            </label>
            <textarea
              rows={2}
              placeholder="Private notes for team and CRM record…"
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '13px',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                background: '#F3F4F6',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                color: '#4B5563',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '9px 22px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                border: 'none',
                fontSize: '13.5px',
                fontWeight: 700,
                color: '#FFFFFF',
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(59, 35, 72, 0.25)',
              }}
            >
              {submitting ? 'Saving Call…' : 'Save Call Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

