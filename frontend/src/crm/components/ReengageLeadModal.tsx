import { useState } from 'react'
import type { FormEvent } from 'react'
import { X, RefreshCw, CheckCircle2, AlertCircle, ArrowRight, Sparkles } from 'lucide-react'
import { updateLeadStatus } from '../services/crmApi'
import { createFollowUp } from '../services/staffApi'

const NAVY = '#3B2348'
const GOLD = '#C6A15B'
const BORDER = '#E8DCC8'
const TEXT_MAIN = '#26232B'
const TEXT_MUTED = '#7A6B78'

interface ReengageLeadModalProps {
  leadId: number
  customerName?: string | null
  phone?: string | null
  currentStatus?: string | null
  onClose: () => void
  onSuccess: () => void
}

const REENGAGEMENT_REASONS = [
  'Price reduction on matching luxury development',
  'Exclusive off-plan phase release in preferred community',
  'Client initiated renewed inquiry / website interaction',
  'Quarterly high-net-worth portfolio review',
  'Fresh inventory matching specific layout/budget requirements',
  'Other custom outreach campaign',
]

export function ReengageLeadModal({
  leadId,
  customerName,
  phone,
  currentStatus = 'lost',
  onClose,
  onSuccess,
}: ReengageLeadModalProps) {
  const [selectedReason, setSelectedReason] = useState(REENGAGEMENT_REASONS[0])
  const [targetStage, setTargetStage] = useState<'contacted' | 'qualified'>('contacted')
  const [notes, setNotes] = useState('')
  const [scheduleFollowUp, setScheduleFollowUp] = useState(true)
  const [followUpDate, setFollowUpDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      // 1. Update lead stage to targetStage
      await updateLeadStatus(leadId, targetStage)

      // 2. Create follow-up note with re-engagement justification
      const fullNote = `[Lost Lead Recovery] Re-engaged from "${currentStatus}" to "${targetStage}". Reason: ${selectedReason}.${notes.trim() ? ` Notes: ${notes.trim()}` : ''}`

      const nextActionIso = scheduleFollowUp && followUpDate ? new Date(`${followUpDate}T10:00:00`).toISOString() : undefined
      await createFollowUp(leadId, fullNote, nextActionIso)

      setSuccess(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-engage lead')
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(38, 35, 43, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#FAF7F0',
          borderRadius: '16px',
          border: `1px solid ${BORDER}`,
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
            padding: '20px 24px',
            color: '#FFFFFF',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 700,
                color: GOLD,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '4px',
              }}
            >
              <Sparkles size={14} /> Lead Reactivation Protocol
            </div>
            <h2
              className="luxury-serif"
              style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#FAF7F0' }}
            >
              Re-engage {customerName || `Lead #${leadId}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                color: '#991B1B',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {success && (
            <div
              style={{
                padding: '12px 14px',
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: '8px',
                color: '#065F46',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={18} /> Lead successfully restored and reactivated!
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
              Re-engagement Catalyst / Campaign
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: `1px solid ${BORDER}`,
                fontSize: '13px',
                background: '#FFFFFF',
                color: TEXT_MAIN,
              }}
            >
              {REENGAGEMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                New Pipeline Stage
              </label>
              <select
                value={targetStage}
                onChange={(e) => setTargetStage(e.target.value as 'contacted' | 'qualified')}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '13px',
                  background: '#FFFFFF',
                  color: TEXT_MAIN,
                }}
              >
                <option value="contacted">Contacted (In Outreach)</option>
                <option value="qualified">Qualified (Active Buying)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                Customer Phone
              </label>
              <input
                type="text"
                readOnly
                value={phone || 'No phone registered'}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '13px',
                  background: '#F3F4F6',
                  color: TEXT_MUTED,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
              Strategy Notes / Customer Context
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Sent brochure for Palm Jumeirah penthouse. Client requested callback on Saturday."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${BORDER}`,
                fontSize: '13px',
                background: '#FFFFFF',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          <div
            style={{
              padding: '12px',
              background: '#FFFFFF',
              border: `1px solid ${BORDER}`,
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scheduleFollowUp}
                onChange={(e) => setScheduleFollowUp(e.target.checked)}
                style={{ accentColor: GOLD }}
              />
              Schedule follow-up task on calendar
            </label>
            {scheduleFollowUp && (
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '13px',
                  width: '180px',
                }}
              />
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: `1px solid ${BORDER}`,
                background: '#FFFFFF',
                color: NAVY,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || success}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                cursor: submitting ? 'wait' : 'pointer',
                boxShadow: '0 2px 4px rgba(59, 35, 72, 0.25)',
              }}
            >
              {submitting ? (
                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <ArrowRight size={14} color={GOLD} />
              )}
              {submitting ? 'Reactivating…' : 'Confirm Reactivation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
