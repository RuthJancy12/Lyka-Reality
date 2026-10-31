import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CalendarClock, Loader2, Phone, PhoneCall, Plus } from 'lucide-react'
import {
  CALL_OUTCOMES, CALL_STATUS_LABELS,
  createCall, listCalls, updateCall,
  type CallLog,
} from '../services/staffApi'
import { CallModal } from './CallModal'

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--champagne-border)',
  borderRadius: '14px',
  boxShadow: '0 2px 10px rgba(26, 13, 24, 0.05)',
  padding: '22px',
}
const H2: React.CSSProperties = {
  fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)',
  margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '8px',
  border: '1px solid var(--champagne-border)', fontSize: '13px',
  background: '#fff', color: 'var(--text-main)', boxSizing: 'border-box',
}

function when(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function CallPanel({
  leadId,
  customerName,
  customerPhone,
  currentLeadTemperature,
  onChanged,
}: {
  leadId: number
  customerName?: string | null
  customerPhone?: string | null
  currentLeadTemperature?: string | null
  onChanged?: () => void
}) {
  const [calls, setCalls] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [callModalOpen, setCallModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCalls(await listCalls(leadId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load calls.')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => { void load() }, [load])

  const schedule = async () => {
    if (!scheduledAt) {
      setError('Choose a date and time for the call.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createCall(leadId, new Date(scheduledAt).toISOString(), notes.trim() || undefined)
      setScheduledAt('')
      setNotes('')
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule the call.')
    } finally {
      setSaving(false)
    }
  }

  const recordOutcome = async (id: number, status: string) => {
    setBusyId(id)
    setError(null)
    try {
      await updateCall(id, { status })
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the outcome.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section style={CARD} aria-labelledby="call-panel-heading">
      <h2 id="call-panel-heading" style={H2}>
        <Phone size={15} color="var(--gold-dark)" /> Calls
        <span style={{ marginLeft: 'auto', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {calls.filter((c) => c.status === 'scheduled').length} scheduled
        </span>
      </h2>

      {/* Manual call action */}
      <button
        type="button"
        className="gold-btn"
        onClick={() => setCallModalOpen(true)}
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: '13px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '16px',
        }}
      >
        <PhoneCall size={14} /> Call Customer Now
      </button>

      <div style={{ display: 'grid', gap: '8px', marginBottom: '14px', paddingTop: '10px', borderTop: '1px solid var(--champagne-border)' }}>
        <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)' }} htmlFor="call-when">
          Or schedule a future call
        </label>
        <input
          id="call-when"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          style={INPUT}
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional agenda / note"
          aria-label="Call note"
          style={INPUT}
        />
        <button
          type="button"
          className="outline-navy-btn"
          onClick={schedule}
          disabled={saving || !scheduledAt}
          style={{ padding: '8px 14px', fontSize: '12.5px', opacity: saving || !scheduledAt ? 0.65 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Schedule future call
        </button>
      </div>

      <CallModal
        isOpen={callModalOpen}
        onClose={() => setCallModalOpen(false)}
        leadId={leadId}
        customerName={customerName}
        customerPhone={customerPhone}
        currentLeadTemperature={currentLeadTemperature}
        onSuccess={() => {
          void load()
          onChanged?.()
        }}
      />


      {error && (
        <p role="alert" style={{ color: '#991B1B', fontSize: '12.5px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '2px' }} /> {error}
        </p>
      )}
      {loading && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          <Loader2 size={14} className="animate-spin" style={{ display: 'inline', verticalAlign: '-2px' }} /> Loading calls…
        </p>
      )}
      {!loading && calls.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
          No calls yet. Scheduling one does not count as an attempt.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {calls.map((call) => {
          const attempted = Boolean(call.attempted_at)
          return (
            <article key={call.id} style={{ borderTop: '1px solid var(--champagne-border)', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                <CalendarClock size={13} color="var(--gold-dark)" />
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--plum-main)' }}>
                  {when(call.scheduled_at)}
                </span>
                <span style={{
                  marginLeft: 'auto', fontSize: '11px', fontWeight: 800, padding: '3px 9px',
                  borderRadius: '999px', border: '1px solid var(--champagne-border)',
                  background: attempted ? '#EAF3EC' : '#FAF5EA',
                  color: attempted ? '#2E7D4F' : '#8A6E30',
                }}>
                  {CALL_STATUS_LABELS[call.status] || call.status}
                </span>
              </div>
              {call.notes && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>{call.notes}</p>}
              <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '3px 0 4px' }}>
                {attempted ? `Attempted ${when(call.attempted_at)}` : 'Not attempted yet'}
                {call.connected_at ? ` · Connected ${when(call.connected_at)}` : ''}
                {call.duration_minutes ? ` · ${call.duration_minutes} min` : ''}
              </p>
              {call.next_follow_up_at && (
                <p style={{ fontSize: '11.5px', color: 'var(--gold-dark)', margin: '0 0 6px', fontWeight: 700 }}>
                  Follow-up: {when(call.next_follow_up_at)}
                </p>
              )}
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '3px' }} htmlFor={`call-outcome-${call.id}`}>
                Record actual outcome
              </label>
              <select
                id={`call-outcome-${call.id}`}
                value={call.status}
                disabled={busyId === call.id}
                onChange={(e) => void recordOutcome(call.id, e.target.value)}
                style={{ ...INPUT, cursor: 'pointer' }}
              >
                {call.status === 'scheduled' && <option value="scheduled">Scheduled</option>}
                {CALL_OUTCOMES.map((status) => (
                  <option key={status} value={status}>{CALL_STATUS_LABELS[status]}</option>
                ))}
              </select>
              {busyId === call.id && (
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  <Loader2 size={12} className="animate-spin" style={{ display: 'inline', verticalAlign: '-2px' }} /> Saving…
                </span>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
