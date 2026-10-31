// Gate for the /crm staff area. Roles come only from useStaffRole
// (backend-verified). Shows loading, sign-in, and forbidden states —
///never renders staff UI to customers or guests.

import { Link } from 'react-router-dom'
import { ShieldAlert, Loader2, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { LykaAuthPanel } from '../../components/agent/LykaAuthPanel'
import { useStaffRole, type StaffRole } from '../services/staffApi'

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--champagne-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '460px' }}>{children}</div>
    </div>
  )
}

export function RequireStaff({ roles, children }: { roles: StaffRole[]; children: React.ReactNode }) {
  const { user } = useAuth()
  const { me, role, loading, error, refresh } = useStaffRole()

  if (loading) {
    return (
      <GateShell>
        <div style={{ background: '#fff', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '36px', textAlign: 'center' }}>
          <Loader2 size={28} color="var(--gold-dark)" style={{ animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Verifying staff access…</p>
        </div>
      </GateShell>
    )
  }

  if (!user) {
    return (
      <GateShell>
        <LykaAuthPanel
          initialMode="login"
          staffPortal
          onSuccess={() => {}}
          onBackToChat={() => { window.location.href = '/' }}
          onGoOnboarding={() => { window.location.href = '/' }}
        />
      </GateShell>
    )
  }

  if (error) {
    return (
      <GateShell>
        <div style={{ background: '#fff', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '36px', textAlign: 'center' }}>
          <ShieldAlert size={34} color="#DC2626" style={{ margin: '0 auto 12px' }} />
          <h3 className="luxury-serif" style={{ fontSize: '20px', color: 'var(--plum-main)', marginBottom: '8px' }}>
            Unable to verify staff access
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
            The staff service could not be reached. Check that the backend is running and that
            <code style={{ margin: '0 4px' }}>VITE_API_URL</code> points to it, then retry.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '20px', wordBreak: 'break-word' }}>
            {error}
          </p>
          <button type="button" onClick={refresh} className="gold-btn" style={{ padding: '10px 22px', fontSize: '13px', marginRight: '10px' }}>
            Retry
          </button>
          <Link to="/" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Back to site
          </Link>
        </div>
      </GateShell>
    )
  }

  if (!me || !role || !roles.includes(role)) {
    const who = role ? `Signed in as ${user.email} (${role.replace('_', ' ')}).` : `Signed in as ${user.email} (customer).`
    return (
      <GateShell>
        <div style={{ background: '#fff', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '36px', textAlign: 'center' }}>
          <ShieldAlert size={34} color="#DC2626" style={{ margin: '0 auto 12px' }} />
          <h3 className="luxury-serif" style={{ fontSize: '20px', color: 'var(--plum-main)', marginBottom: '8px' }}>
            Staff access required
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
            {who} This section is not part of your role — please use your dashboard navigation instead.
          </p>
          <Link to="/" className="gold-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 22px', textDecoration: 'none' }}>
            <ArrowLeft size={14} /> Back to site
          </Link>
        </div>
      </GateShell>
    )
  }

  return <>{children}</>
}
