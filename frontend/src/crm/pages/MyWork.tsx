// Personal workspace: my assignments, follow-up notes, and viewings.
// Data is scoped by the backend (salespeople see only their own rows).

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2, Plus } from 'lucide-react'
import {
  listAssignments, updateAssignment,
  listFollowUps, createFollowUp, completeFollowUp,
  listViewings, createViewing, updateViewing,
  listCalls, createCall, updateCall,
  CALL_OUTCOMES, CALL_STATUS_LABELS,
  type Assignment, type FollowUp, type Viewing, type CallLog,
} from '../services/staffApi'

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--champagne-border)',
  borderRadius: '12px', padding: '18px', marginBottom: '18px',
}

const h3: React.CSSProperties = {
  fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)', margin: '0 0 12px',
}

const input: React.CSSProperties = {
  padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--champagne-border)',
  fontSize: '13px', background: '#fff', color: 'var(--text-main)',
}

function StateNote({ loading, error, empty, emptyText, onRetry }: { loading: boolean; error: string | null; empty: boolean; emptyText: string; onRetry?: () => void }) {
  if (loading) return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}><Loader2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Loading…</p>
  if (error) return <p role="alert" style={{ color: '#991B1B', fontSize: '13px' }}><AlertCircle size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {error}{onRetry && <> <button type="button" className="lyka-chat-chip" onClick={onRetry}>Retry</button></>}</p>
  if (empty) return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{emptyText}</p>
  return null
}

export function MyWork() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [calls, setCalls] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fuLead, setFuLead] = useState('')
  const [fuNote, setFuNote] = useState('')
  const [fuNext, setFuNext] = useState('')
  const [vLead, setVLead] = useState('')
  const [vRef, setVRef] = useState('')
  const [vWhen, setVWhen] = useState('')
  const [cLead, setCLead] = useState('')
  const [cWhen, setCWhen] = useState('')
  const [cNote, setCNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [a, f, v, c] = await Promise.all([
        listAssignments(), listFollowUps(), listViewings(), listCalls(),
      ])
      setAssignments(a)
      setFollowUps(f)
      setViewings(v)
      setCalls(c)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const addFollowUp = async () => {
    const leadId = parseInt(fuLead, 10)
    if (!leadId || !fuNote.trim()) {
      setFormError('Lead ID and note are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createFollowUp(leadId, fuNote.trim(), fuNext || undefined)
      setFuLead('')
      setFuNote('')
      setFuNext('')
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save note.')
    } finally {
      setSaving(false)
    }
  }

  const scheduleViewing = async () => {
    const leadId = parseInt(vLead, 10)
    if (!leadId || !vRef.trim() || !vWhen) {
      setFormError('Lead ID, property ref, and date/time are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createViewing(leadId, vRef.trim(), new Date(vWhen).toISOString())
      setVLead('')
      setVRef('')
      setVWhen('')
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not schedule viewing.')
    } finally {
      setSaving(false)
    }
  }

  const scheduleCall = async () => {
    const leadId = parseInt(cLead, 10)
    if (!leadId || !cWhen) {
      setFormError('Lead ID and call date/time are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createCall(leadId, new Date(cWhen).toISOString(), cNote.trim() || undefined)
      setCLead('')
      setCWhen('')
      setCNote('')
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not schedule call.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="luxury-serif" style={{ fontSize: '24px', color: 'var(--plum-main)', marginBottom: '4px' }}>My Work</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '18px' }}>Assignments, follow-up notes, and viewings — scoped to you by the backend.</p>

      <section style={card}>
        <h3 style={h3}>Assignments ({assignments.length})</h3>
        <StateNote loading={loading} error={error} onRetry={refresh} empty={!loading && !error && assignments.length === 0} emptyText="No assignments yet." />
        {assignments.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: '1px solid var(--champagne-border)', fontSize: '13px' }}>
            <strong>Lead #{a.lead_id}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>assigned by {a.assigned_by}</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--gold-dark)', fontWeight: 700 }}>{a.status}</span>
              {a.status !== 'closed' && (
                <button
                  type="button"
                  className="lyka-chat-chip"
                  onClick={() => updateAssignment(a.id, a.status === 'open' ? 'in_progress' : 'closed').then(refresh).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Update failed.'))}
                >
                  {a.status === 'open' ? 'Start' : 'Close'}
                </button>
              )}
            </span>
          </div>
        ))}
      </section>

      <section style={card}>
        <h3 style={h3}>Follow-up notes ({followUps.length})</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <input style={{ ...input, width: '110px' }} placeholder="Lead ID" value={fuLead} onChange={(e) => setFuLead(e.target.value)} inputMode="numeric" />
          <input style={{ ...input, flex: 1, minWidth: '200px' }} placeholder="Note…" value={fuNote} onChange={(e) => setFuNote(e.target.value)} />
          <input style={input} type="date" value={fuNext} onChange={(e) => setFuNext(e.target.value)} aria-label="Next action date" />
          <button type="button" className="gold-btn" disabled={saving} onClick={addFollowUp} style={{ padding: '8px 16px', fontSize: '12px' }}>
            <Plus size={13} /> Add note
          </button>
        </div>
        {formError && <p role="alert" style={{ color: '#991B1B', fontSize: '13px' }}>{formError}</p>}
        <StateNote loading={loading} error={error} onRetry={refresh} empty={!loading && !error && followUps.length === 0} emptyText="No follow-up notes yet." />
        {followUps.map((f) => (
          <div key={f.id} style={{ padding: '8px 0', borderTop: '1px solid var(--champagne-border)', fontSize: '13px' }}>
            <strong>Lead #{f.lead_id}</strong> <span style={{ color: 'var(--text-secondary)' }}>· {f.staff_email} · {new Date(f.created_at).toLocaleString()}</span>
            <div style={{ marginTop: '2px' }}>{f.note}</div>
            {f.next_action_at && <div style={{ fontSize: '12px', color: 'var(--gold-dark)' }}>Next action: {new Date(f.next_action_at).toLocaleDateString()}</div>}
            <div style={{ marginTop: '5px', display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
              {f.completed_at ? (
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#2E7D4F' }}>
                  ✓ Completed {new Date(f.completed_at).toLocaleString()}
                </span>
              ) : (
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#8A6E30' }}>Open</span>
              )}
              <button
                type="button"
                className="lyka-chat-chip"
                onClick={() => completeFollowUp(f.id, !f.completed_at).then(refresh).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Update failed.'))}
              >
                {f.completed_at ? 'Reopen' : 'Mark complete'}
              </button>
            </div>
          </div>
        ))}
      </section>

      <section style={card}>
        <h3 style={h3}>Calls ({calls.length})</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <input style={{ ...input, width: '110px' }} placeholder="Lead ID" value={cLead} onChange={(e) => setCLead(e.target.value)} inputMode="numeric" />
          <input style={{ ...input, flex: 1, minWidth: '190px' }} placeholder="Agenda / note" value={cNote} onChange={(e) => setCNote(e.target.value)} />
          <input style={input} type="datetime-local" value={cWhen} onChange={(e) => setCWhen(e.target.value)} aria-label="Call date and time" />
          <button type="button" className="gold-btn" disabled={saving} onClick={scheduleCall} style={{ padding: '8px 16px', fontSize: '12px' }}>
            <Plus size={13} /> Schedule call
          </button>
        </div>
        <StateNote loading={loading} error={error} onRetry={refresh} empty={!loading && !error && calls.length === 0} emptyText="No calls scheduled yet." />
        {calls.map((c) => (
          <div key={c.id} style={{ padding: '9px 0', borderTop: '1px solid var(--champagne-border)', fontSize: '13px' }}>
            <div style={{ display: 'flex', gap: '9px', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>Lead #{c.lead_id}</strong>
              <span style={{ color: 'var(--text-secondary)' }}>{new Date(c.scheduled_at).toLocaleString()}</span>
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: c.attempted_at ? '#2E7D4F' : '#8A6E30' }}>
                {CALL_STATUS_LABELS[c.status] || c.status}
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '3px 0 5px' }}>
              {c.attempted_at ? `Attempted ${new Date(c.attempted_at).toLocaleString()}` : 'Not attempted yet — scheduling is not an attempt.'}
            </div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '3px' }} htmlFor={`my-call-${c.id}`}>
              Actual outcome
            </label>
            <select
              id={`my-call-${c.id}`}
              value={c.status}
              onChange={(e) => updateCall(c.id, { status: e.target.value }).then(refresh).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Update failed.'))}
              style={{ ...input, width: '100%', cursor: 'pointer' }}
            >
              {c.status === 'scheduled' && <option value="scheduled">Scheduled</option>}
              {CALL_OUTCOMES.map((status) => <option key={status} value={status}>{CALL_STATUS_LABELS[status]}</option>)}
            </select>
          </div>
        ))}
      </section>

      <section style={card}>
        <h3 style={h3}>Viewings ({viewings.length})</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <input style={{ ...input, width: '110px' }} placeholder="Lead ID" value={vLead} onChange={(e) => setVLead(e.target.value)} inputMode="numeric" />
          <input style={{ ...input, width: '130px' }} placeholder="Property ref" value={vRef} onChange={(e) => setVRef(e.target.value)} />
          <input style={input} type="datetime-local" value={vWhen} onChange={(e) => setVWhen(e.target.value)} aria-label="Viewing date and time" />
          <button type="button" className="gold-btn" disabled={saving} onClick={scheduleViewing} style={{ padding: '8px 16px', fontSize: '12px' }}>
            <Plus size={13} /> Schedule
          </button>
        </div>
        <StateNote loading={loading} error={error} onRetry={refresh} empty={!loading && !error && viewings.length === 0} emptyText="No viewings scheduled." />
        {viewings.map((v) => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: '1px solid var(--champagne-border)', fontSize: '13px', flexWrap: 'wrap' }}>
            <strong>Lead #{v.lead_id}</strong>
            <span>{v.property_ref}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{new Date(v.scheduled_at).toLocaleString()}</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--gold-dark)', fontWeight: 700 }}>{v.status}</span>
              {v.status === 'scheduled' && (
                <>
                  <button type="button" className="lyka-chat-chip" onClick={() => updateViewing(v.id, { status: 'completed' }).then(refresh).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Update failed.'))}>Complete</button>
                  <button type="button" className="lyka-chat-chip" onClick={() => updateViewing(v.id, { status: 'cancelled' }).then(refresh).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Update failed.'))}>Cancel</button>
                </>
              )}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}
