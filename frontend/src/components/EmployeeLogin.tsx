import { useState } from 'react'
import { X, Lock, Mail, Briefcase, Eye, EyeOff, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { authFailureMessage, authHttpStatus, isNetworkAuthError, validateAuthForm } from '../services/authErrors'
import { fetchStaffMe, clearStaffMeCache, type StaffRole } from '../crm/services/staffApi'
import { STAFF_ROLE_OPTIONS, checkEmployeeRole, roleLabel } from '../utils/staffRoleCheck'

interface EmployeeLoginProps {
  onClose: () => void
  /** Called with the BACKEND-verified role after a successful check. */
  onSuccess: (role: StaffRole) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 38px 9px 36px',
  borderRadius: '4px',
  border: '1px solid var(--champagne-border)',
  fontSize: '13px',
  color: 'var(--text-main)',
  outlineColor: 'var(--gold-primary)',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '9px 12px 9px 36px',
  cursor: 'pointer',
  background: '#FFFFFF',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-main)',
  marginBottom: '4px',
}

/**
 * Dedicated employee login page. Authenticates with the existing Firebase
 * email/password and Google flows, then verifies the ACTUAL role through
 * GET /api/staff/me (existing trusted endpoint). The "Pick Your Role"
 * dropdown only confirms intent — it never grants permissions. Mismatches,
 * customers, and unauthorized accounts are signed straight back out with a
 * clear message; the verified role is shown before routing to the dashboard.
 */
export function EmployeeLogin({ onClose, onSuccess }: EmployeeLoginProps) {
  const { signIn, signInWithGoogle, logout } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [expectedRole, setExpectedRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifiedRole, setVerifiedRole] = useState<StaffRole | null>(null)

  /** Verifies the just-signed-in account against the trusted backend role. */
  const verifyAndEnter = async (): Promise<void> => {
    try {
      // Bypass the 60s cache: this must reflect the account that JUST
      // signed in, never a previously cached user.
      clearStaffMeCache()
      const me = await fetchStaffMe()
      const refusal = checkEmployeeRole(me.role, expectedRole)
      if (refusal) {
        await logout().catch(() => {})
        clearStaffMeCache()
        setError(refusal)
        return
      }
      setVerifiedRole(me.role)
    } catch (err: unknown) {
      // No staff record (customer), inactive, or unreachable backend:
      // never leave the account half-signed-in to the employee portal.
      await logout().catch(() => {})
      clearStaffMeCache()
      const status = authHttpStatus(err)
      const msg = err instanceof Error ? err.message : String(err || '')
      // 401/403 are the only responses that actually mean "not signed in"
      // or "no staff access". A 404/5xx/network failure means the backend
      // itself is unavailable and must not be reported as a customer account.
      const backendUnavailable =
        isNetworkAuthError(err) ||
        status === 404 ||
        status === 405 ||
        status === 408 ||
        (status !== null && status >= 500) ||
        (
          status === null &&
          (
            msg.includes('Failed to fetch') ||
            msg.includes('NetworkError') ||
            msg.includes('Failed to load') ||
            msg.includes('network')
          )
        )
      if (backendUnavailable) {
        setError(
          `Unable to reach the staff service${status ? ` (HTTP ${status})` : ''}. ` +
          'Please ensure the backend is running and VITE_API_URL points to it, then retry.'
        )
      } else if (status === 401) {
        setError(
          'Authentication verification failed on the server. Please try signing in again or contact your administrator.'
        )
      } else if (status === 429) {
        setError('Too many attempts. Please wait a moment and try again.')
      } else if (status === 403) {
        setError(
          'This account has no employee access. Customers should use Customer Login; staff access needs an account created by your Admin.'
        )
      } else {
        setError(
          `Unable to verify staff access${status ? ` (HTTP ${status})` : ''}. ` +
          'Please try again; if the problem continues, contact your administrator.'
        )
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validateAuthForm({ mode: 'login', name: '', email, password })
    if (validationError) {
      setError(validationError)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await signIn(email, password)
      await verifyAndEnter()
    } catch (err: unknown) {
      setError(authFailureMessage(err, 'EmployeeLogin'))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
      await verifyAndEnter()
    } catch (err: unknown) {
      setError(authFailureMessage(err, 'EmployeeLogin-google'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1200,
      background: 'rgba(26, 13, 24, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      overflowY: 'auto',
    }}>
      <div className="employee-card" style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid var(--champagne-border)',
        boxShadow: '0 20px 50px rgba(26, 13, 24, 0.5)',
        width: '100%',
        maxWidth: '440px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '32px',
        position: 'relative',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close employee login"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'var(--champagne-surface)',
            border: '1px solid var(--champagne-border)',
            borderRadius: '4px',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--plum-deep)',
          }}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{
            background: 'var(--plum-deep)',
            border: '1px solid var(--gold-border)',
            padding: '6px 14px',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
          }}>
            <img src="/logo.png" alt="Lyka Realty" style={{ height: '26px', width: 'auto', objectFit: 'contain', display: 'block' }} />
          </div>
          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Employee Portal
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              LYKA team sign-in
            </span>
          </div>
        </div>

        {verifiedRole ? (
          <div style={{ textAlign: 'center', padding: '12px 0 4px' }} role="status">
            <CheckCircle2 size={40} color="var(--gold-primary)" style={{ margin: '0 auto 12px' }} />
            <h3 className="luxury-serif" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--plum-deep)', marginBottom: '6px' }}>
              Welcome back
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Signed in as {email || 'your work account'}.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '20px' }}>
              <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
              Verified role: <strong>{roleLabel(verifiedRole)}</strong>
            </p>
            <button
              type="button"
              onClick={() => onSuccess(verifiedRole)}
              className="gold-btn"
              style={{ width: '100%', padding: '11px', fontSize: '13px' }}
            >
              Continue to dashboard
            </button>
          </div>
        ) : (
          <>
            <h3 className="luxury-serif" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--plum-deep)', marginBottom: '4px' }}>
              Employee sign in
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '22px' }}>
              Use your LYKA work account. Your role is verified against your assigned record.
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label htmlFor="lyka-employee-email" style={labelStyle}>
                  Work Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} color="var(--text-muted)" style={{ position: 'absolute', top: '11px', left: '12px' }} />
                  <input
                    id="lyka-employee-email"
                    type="email"
                    placeholder="you@lykarealty.ae"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lyka-employee-password" style={labelStyle}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} color="var(--text-muted)" style={{ position: 'absolute', top: '11px', left: '12px' }} />
                  <input
                    id="lyka-employee-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute', top: '8px', right: '8px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', display: 'flex', padding: '2px',
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="lyka-employee-role" style={labelStyle}>
                  Pick Your Role
                </label>
                <div style={{ position: 'relative' }}>
                  <Briefcase size={15} color="var(--text-muted)" style={{ position: 'absolute', top: '11px', left: '12px' }} />
                  <select
                    id="lyka-employee-role"
                    value={expectedRole}
                    onChange={(e) => setExpectedRole(e.target.value)}
                    aria-label="Pick Your Role"
                    style={selectStyle}
                  >
                    <option value="">Select your role… (optional check)</option>
                    {STAFF_ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  For confirmation only — permissions always come from your assigned record.
                </p>
              </div>

              {error && (
                <div role="alert" style={{
                  background: '#FDF1F1',
                  border: '1px solid #E8A0A0',
                  color: '#8C2F2F',
                  fontSize: '12px',
                  borderRadius: '4px',
                  padding: '8px 12px',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="gold-btn"
                disabled={loading}
                style={{ marginTop: '6px', padding: '11px', fontSize: '13px', borderRadius: '4px', opacity: loading ? 0.6 : 1 }}
              >
                {loading ? 'Verifying…' : 'Sign In'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '11px' }}>
                <span style={{ flex: 1, height: '1px', background: 'var(--champagne-border)' }} />
                or
                <span style={{ flex: 1, height: '1px', background: 'var(--champagne-border)' }} />
              </div>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="outline-navy-btn"
                style={{ padding: '10px', fontSize: '13px', opacity: loading ? 0.6 : 1 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z" />
                  <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.5 24 12 24z" />
                  <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8H1.4C.5 8.5 0 10.2 0 12s.5 3.5 1.4 5.1l3.8-2.7z" />
                  <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.4 6.7l3.8 2.9c.9-2.9 3.6-4.9 6.8-4.9z" />
                </svg>
                Continue with Google
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
