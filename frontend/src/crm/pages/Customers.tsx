// Customer directory for authorized employees (admin/manager only —
// enforced by GET /api/staff/customers). Permitted fields only; UIDs and
// internal identifiers are never exposed by the backend.

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2, Users, RefreshCw } from 'lucide-react'
import { listCustomers, type StaffCustomer } from '../services/staffApi'
import { classifyLeadChannel } from '../../utils/leadSource'

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--champagne-border)',
  borderRadius: '12px', padding: '18px',
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '9px 12px', fontSize: '11px', fontWeight: 800,
  letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--champagne-border)', whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: '13px', color: 'var(--text-main)',
  borderBottom: '1px solid #F4EEE1', verticalAlign: 'top', minWidth: 0,
}

function channelOf(c: StaffCustomer): string {
  return classifyLeadChannel({
    utm_source: c.utm_source, utm_medium: c.utm_medium,
    utm_campaign: c.utm_campaign, referrer: c.referrer,
  })
}

export function Customers() {
  const [rows, setRows] = useState<StaffCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listCustomers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
        <div>
          <h2 className="luxury-serif" style={{ fontSize: '24px', color: 'var(--plum-main)', margin: 0 }}>Customers</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0' }}>
            Registered customer profiles with first-touch acquisition source. Staff accounts are excluded.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} className="lyka-chat-ghost-btn" title="Reload customers">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <section style={card}>
        {loading && <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}><Loader2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Loading…</p>}
        {error && (
          <p role="alert" style={{ fontSize: '13px', color: '#991B1B' }}>
            <AlertCircle size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {error}{' '}
            <button type="button" className="lyka-chat-chip" onClick={() => void refresh()}>Retry</button>
          </p>
        )}
        {!loading && !error && rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '34px 12px', color: 'var(--text-secondary)' }}>
            <Users size={30} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
            <p style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--plum-main)' }}>No customer profiles yet</p>
            <p style={{ fontSize: '12.5px' }}>Profiles appear here after customers save them on the account page.</p>
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Email</th>
                  <th style={th}>Phone</th>
                  <th style={th}>City</th>
                  <th style={th}>Role</th>
                  <th style={th}>Source</th>
                  <th style={th}>Heard via</th>
                  <th style={th}>Campaign / Referrer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={`${c.email ?? 'no-email'}-${i}`}>
                    <td style={td}><strong>{c.name || <span style={{ color: '#B9B0A6' }}>—</span>}</strong></td>
                    <td style={{ ...td, overflowWrap: 'anywhere' }}>{c.email || '—'}</td>
                    <td style={td}>{c.phone || '—'}</td>
                    <td style={td}>{[c.city, c.country].filter(Boolean).join(', ') || '—'}</td>
                    <td style={td}><span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-dark)' }}>{c.role}</span></td>
                    <td style={td}>{channelOf(c)}</td>
                    <td style={td}>{c.discovery_source || '—'}</td>
                    <td style={{ ...td, overflowWrap: 'anywhere' }}>
                      {[c.utm_campaign, c.referrer].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
