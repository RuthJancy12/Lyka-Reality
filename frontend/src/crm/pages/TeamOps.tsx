// Team operations for admin / manager / sales manager: lead distribution,
// team-wide follow-up monitoring, and viewing coordination. All writes are
// re-checked by the backend; 403s surface as readable messages.

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import {
  listAssignments, createAssignment, updateAssignment,
  listFollowUps, completeFollowUp,
  listViewings, updateViewing, listStaff,
  listCalls, updateCall, CALL_OUTCOMES, CALL_STATUS_LABELS,
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

export function TeamOps() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [calls, setCalls] = useState<CallLog[]>([])
  const [staffEmails, setStaffEmails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [aLead, setALead] = useState('')
  const [aStaff, setAStaff] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingClose, setPendingClose] = useState<number | null>(null)
  // Stable render-time clock for overdue badges; refreshed with the data.
  const [nowMs, setNowMs] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [a, f, v, c] = await Promise.all([listAssignments(), listFollowUps(), listViewings(), listCalls()])
      setAssignments(a)
      setFollowUps(f)
      setViewings(v)
      setCalls(c)
      setNowMs(Date.now())
      try {
        const staff = await listStaff()
        setStaffEmails(staff.filter((s) => s.is_active).map((s) => s.email))
      } catch {
        setStaffEmails([]) // sales managers cannot list staff — free-text email still works
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const assign = async () => {
    const leadId = parseInt(aLead, 10)
    if (!leadId || !aStaff.trim()) {
      setFormError('Lead ID and staff email are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createAssignment(leadId, aStaff.trim())
      setALead('')
      setAStaff('')
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not assign lead.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="luxury-serif" style={{ fontSize: '24px', color: 'var(--plum-main)', marginBottom: '4px' }}>Operations</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '18px' }}>Lead distribution, follow-up monitoring, and viewing coordination across the team.</p>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}><Loader2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Loading…</p>}
      {error && <p role="alert" style={{ fontSize: '13px', color: '#991B1B' }}><AlertCircle size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {error} <button type="button" className="lyka-chat-chip" onClick={refresh}>Retry</button></p>}

      <section style={card}>
        <h3 style={h3}>Distribute a lead</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input style={{ ...input, width: '120px' }} placeholder="Lead ID" value={aLead} onChange={(e) => setALead(e.target.value)} inputMode="numeric" />
          <input
            style={{ ...input, flex: 1, minWidth: '220px' }}
            placeholder="Staff email"
            value={aStaff}
            onChange={(e) => setAStaff(e.target.value)}
            list="lyka-staff-emails"
          />
          <datalist id="lyka-staff-emails">
            {staffEmails.map((e) => <option key={e} value={e} />)}
          </datalist>
          <button type="button" className="gold-btn" disabled={saving} onClick={assign} style={{ padding: '8px 16px', fontSize: '12px' }}>
            Assign
          </button>
        </div>
        {formError && <p role="alert" style={{ color: '#991B1B', fontSize: '13px', marginTop: '8px' }}>{formError}</p>}
      </section>

      <section style={card}>
        <h3 style={h3}>Assignments ({assignments.length})</h3>
        {assignments.length === 0 && !loading && <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No assignments yet.</p>}
        {assignments.map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--champagne-border)', fontSize: '13px', flexWrap: 'wrap' }}>
            <strong>Lead #{a.lead_id}</strong>
            <span>→ {a.staff_email}</span>
            <span style={{ color: 'var(--text-secondary)' }}>by {a.assigned_by}</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--gold-dark)', fontWeight: 700 }}>{a.status}</span>
              {a.status !== 'closed' && (
                pendingClose === a.id ? (
                  <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11.5px', color: '#9C4A3C', fontWeight: 700 }}>Close assignment?</span>
                    <button type="button" className="lyka-chat-chip" onClick={() => {
                      updateAssignment(a.id, 'closed')
                        .then(() => { setPendingClose(null); return refresh() })
                        .catch((e: unknown) => setFormError(e instanceof Error ? e.message : 'Update failed.'))
                    }}>Confirm</button>
                    <button type="button" className="lyka-chat-chip" onClick={() => setPendingClose(null)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className="lyka-chat-chip" onClick={() => setPendingClose(a.id)}>
                    Close
                  </button>
                )
              )}
            </span>
          </div>
        ))}
      </section>

      <section style={card}>
        <h3 style={h3}>Follow-ups ({followUps.length})</h3>
        {followUps.length === 0 && !loading && <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No follow-up notes yet.</p>}
        {followUps.slice(0, 50).map((f) => {
          const overdue = !f.completed_at && f.next_action_at != null && new Date(f.next_action_at).getTime() < nowMs
          return (
            <div key={f.id} style={{ padding: '8px 0', borderTop: '1px solid var(--champagne-border)', fontSize: '13px' }}>
              <strong>Lead #{f.lead_id}</strong> <span style={{ color: 'var(--text-secondary)' }}>· {f.staff_email} · {new Date(f.created_at).toLocaleString()}</span>
              <div style={{ marginTop: '2px' }}>{f.note}</div>
              <div style={{ marginTop: '5px', display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
                {f.completed_at ? (
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#2E7D4F' }}>✓ Completed {new Date(f.completed_at).toLocaleString()}</span>
                ) : (
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: overdue ? '#9C4A3C' : '#8A6E30' }}>
                    {overdue ? 'Overdue' : 'Open'}{f.next_action_at ? ` · due ${new Date(f.next_action_at).toLocaleDateString()}` : ''}
                  </span>
                )}
                <button
                  type="button"
                  className="lyka-chat-chip"
                  onClick={() => completeFollowUp(f.id, !f.completed_at).then(refresh).catch((e: unknown) => setFormError(e instanceof Error ? e.message : 'Update failed.'))}
                >
                  {f.completed_at ? 'Reopen' : 'Mark complete'}
                </button>
              </div>
            </div>
          )
        })}
      </section>

      <section style={card}>
        <h3 style={h3}>Calls ({calls.length})</h3>
        {calls.length === 0 && !loading && <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No calls scheduled.</p>}
        {calls.slice(0, 50).map((c) => (
          <div key={c.id} style={{ padding: '9px 0', borderTop: '1px solid var(--champagne-border)', fontSize: '13px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>Lead #{c.lead_id}</strong>
              <span>{c.staff_email}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{new Date(c.scheduled_at).toLocaleString()}</span>
              <span style={{ marginLeft: 'auto', fontSize: '11.5px', fontWeight: 800, color: c.attempted_at ? '#2E7D4F' : '#8A6E30' }}>
                {CALL_STATUS_LABELS[c.status] || c.status}
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '3px 0 5px' }}>
              {c.attempted_at ? `Attempted ${new Date(c.attempted_at).toLocaleString()}` : 'Not attempted — scheduled calls are not counted as attempts.'}
            </div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '3px' }} htmlFor={`ops-call-${c.id}`}>
              Actual outcome
            </label>
            <select
              id={`ops-call-${c.id}`}
              value={c.status}
              onChange={(e) => updateCall(c.id, { status: e.target.value }).then(refresh).catch((err: unknown) => setFormError(err instanceof Error ? err.message : 'Update failed.'))}
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
        {viewings.length === 0 && !loading && <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No viewings scheduled.</p>}
        {viewings.map((v) => (
          <div key={v.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--champagne-border)', fontSize: '13px', flexWrap: 'wrap' }}>
            <strong>Lead #{v.lead_id}</strong>
            <span>{v.property_ref}</span>
            <span>{v.staff_email}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{new Date(v.scheduled_at).toLocaleString()}</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--gold-dark)', fontWeight: 700 }}>{v.status}</span>
              {v.status === 'scheduled' && (
                <>
                  <button type="button" className="lyka-chat-chip" onClick={() => updateViewing(v.id, { status: 'completed' }).then(refresh).catch((e: unknown) => setFormError(e instanceof Error ? e.message : 'Update failed.'))}>Complete</button>
                  <button type="button" className="lyka-chat-chip" onClick={() => updateViewing(v.id, { status: 'no_show' }).then(refresh).catch((e: unknown) => setFormError(e instanceof Error ? e.message : 'Update failed.'))}>No-show</button>
                </>
              )}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}
