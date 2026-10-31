import { useState } from 'react'
import { Mail, Lock, User, Phone, MapPin, ShieldCheck, ArrowLeft, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authFailureMessage, validateAuthForm } from '../../services/authErrors'
import { saveLocalUser, ownerKeyFor } from '../../services/chatStore'
import { saveCustomerProfile } from '../../services/api'
import { collectLeadSource, normalizeDiscoverySource } from '../../utils/leadSource'
import { DiscoverySourceSelect } from '../DiscoverySourceSelect'
import { fetchStaffMe, clearStaffMeCache, type StaffRole } from '../../crm/services/staffApi'

interface LykaAuthPanelProps {
  initialMode?: 'login' | 'register'
  onSuccess: (user: { name: string; email: string }) => void
  onBackToChat: () => void
  onGoOnboarding: () => void
  /**
   * Staff-portal mode: shows an OPTIONAL expected-role confirmation
   * (Admin / Manager / Sales Manager / Salesperson). The selection NEVER
   * grants anything — after Firebase sign-in it is checked against the
   * backend-verified role, and a mismatch blocks entry with a clear
   * message. Customers always use the default customer flow.
   */
  staffPortal?: boolean
}

type PanelMode = 'login' | 'register' | 'forgot-password'

/**
 * LYKA AI chatbot — login / registration / password reset, backed by real
 * Firebase Authentication (shared AuthContext — the single login system).
 * A local profile copy is kept for chat personalization.
 */
export function LykaAuthPanel({ initialMode = 'login', onSuccess, onBackToChat, onGoOnboarding, staffPortal = false }: LykaAuthPanelProps) {
  const { signUp, signIn, signInWithGoogle, resetPassword, logout } = useAuth()
  const [mode, setMode] = useState<PanelMode>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [discoverySource, setDiscoverySource] = useState('')
  const [expectedRole, setExpectedRole] = useState<StaffRole | ''>('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

  const switchMode = (m: PanelMode) => {
    setMode(m)
    setError(null)
    setResetSent(false)
  }

  const finish = (displayName: string, emailAddr: string, uid: string, cityValue?: string) => {
    // Namespaced to this Firebase UID: a later user on the same browser
    // gets their own profile, never this one.
    const discovery = normalizeDiscoverySource(discoverySource)
    saveLocalUser(
      {
        name: displayName,
        email: emailAddr,
        phone: phone.trim() || undefined,
        city: (cityValue ?? city).trim() || undefined,
        ...(discovery ? { discovery_source: discovery } : {}),
      },
      ownerKeyFor(uid)
    )
    // Register-mode only: create the UID-owned backend profile immediately
    // (self-reported source + automatic UTM stay in separate columns;
    // first-touch-wins server-side). Fire-and-forget so browsing/chat never
    // blocks when the backend is unreachable.
    if (mode === 'register') {
      const source = collectLeadSource()
      void saveCustomerProfile({
        name: displayName.trim(),
        phone: phone.trim() || undefined,
        city: (cityValue ?? city).trim() || undefined,
        ...(discovery ? { discovery_source: discovery } : {}),
        utm_source: source.utm_source,
        utm_medium: source.utm_medium,
        utm_campaign: source.utm_campaign,
        referrer: source.referrer,
      }).catch(() => {})
    }
    onSuccess({ name: displayName, email: emailAddr })
  }

  /**
   * Staff-portal role confirmation. Compares an optional expected role
   * against the BACKEND-verified role for the just-signed-in account.
   * Returns an error message on mismatch (entry blocked), null when the
   * account may proceed. Never grants — only checks.
   */
  const checkStaffRole = async (): Promise<string | null> => {
    if (!staffPortal || !expectedRole) return null
    try {
      // Bypass the 60s cache: this must reflect the account that JUST
      // signed in, never a previously cached user.
      clearStaffMeCache()
      const me = await fetchStaffMe()
      if (me.role !== expectedRole) {
        const label = (r: string) => r.replace(/_/g, ' ')
        return `Role mismatch: this account holds the ${label(me.role)} role, not ${label(expectedRole)}. Please choose the matching role or contact your Admin.`
      }
      return null
    } catch {
      return 'No staff record found for this account with the selected role. Customers use the Client Portal sign-in; staff access requires an Admin-provisioned account.'
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validateAuthForm({
      mode: mode === 'register' ? 'signup' : mode,
      name,
      email,
      password
    })
    if (validationError) {
      setError(validationError)
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (mode === 'forgot-password') {
        await resetPassword(email)
        setResetSent(true)
      } else if (mode === 'register') {
        const u = await signUp(name, email, password)
        const roleErr = await checkStaffRole()
        if (roleErr) {
          await logout().catch(() => {})
          clearStaffMeCache()
          setError(roleErr)
          return
        }
        finish(u.name, u.email, u.uid)
      } else {
        const u = await signIn(email, password)
        const roleErr = await checkStaffRole()
        if (roleErr) {
          await logout().catch(() => {})
          clearStaffMeCache()
          setError(roleErr)
          return
        }
        finish(u.name, u.email, u.uid)
      }
    } catch (err: unknown) {
      setError(authFailureMessage(err, 'LykaAuthPanel'))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    try {
      const u = await signInWithGoogle()
      const roleErr = await checkStaffRole()
      if (roleErr) {
        await logout().catch(() => {})
        clearStaffMeCache()
        setError(roleErr)
        return
      }
      finish(u.name, u.email, u.uid)
    } catch (err: unknown) {
      setError(authFailureMessage(err, 'LykaAuthPanel'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="lyka-chat-auth">
      <button type="button" className="lyka-chat-link-btn" onClick={onBackToChat}>
        <ArrowLeft size={13} /> Back to chat
      </button>
      <div className="lyka-chat-auth-card">
        <div className="lyka-chat-auth-orb" aria-hidden="true">LYKA</div>
        <h4>
          {mode === 'login' && (staffPortal ? 'Staff sign in' : 'Welcome back')}
          {mode === 'register' && 'Create your LYKA profile'}
          {mode === 'forgot-password' && 'Reset your password'}
        </h4>
        <p className="lyka-chat-auth-sub">
          {mode === 'login' && (staffPortal
            ? 'Employee login for the LYKA team. Roles are verified against your assigned account.'
            : 'Sign in to personalize your Dubai search.')}
          {mode === 'register' && 'One secure account for picks, chats and alerts.'}
          {mode === 'forgot-password' && 'We will email you a secure reset link.'}
        </p>

        {staffPortal && mode !== 'forgot-password' && (
          <label className="lyka-chat-field">
            <span>Expected role (optional check)</span>
            <div className="lyka-chat-field-input">
              <ShieldCheck size={14} />
              <select
                value={expectedRole}
                onChange={(e) => setExpectedRole(e.target.value as StaffRole | '')}
                aria-label="Expected staff role (optional)"
                style={{
                  flex: 1, background: 'none', border: 'none', fontSize: '14px',
                  color: 'var(--text-main)', outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="">Just sign me in</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="sales_manager">Sales Manager</option>
                <option value="salesperson">Salesperson</option>
              </select>
            </div>
            <small style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
              Optional: checked against the role already assigned to this account. It never grants access by itself.
            </small>
          </label>
        )}

        <div className="lyka-chat-auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            <LogIn size={13} /> Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            <UserPlus size={13} /> Register
          </button>
        </div>

        {resetSent ? (
          <p className="lyka-chat-auth-sub" style={{ textAlign: 'center' }} role="status">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox and spam folder.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="lyka-chat-auth-form">
            {mode === 'register' && (
              <label className="lyka-chat-field">
                <span>Full name</span>
                <div className="lyka-chat-field-input">
                  <User size={14} />
                  <input
                    type="text"
                    placeholder="e.g. Sara Ahmed"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </label>
            )}
            <label className="lyka-chat-field">
              <span>Email</span>
              <div className="lyka-chat-field-input">
                <Mail size={14} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </label>
            {mode === 'register' && (
              <label className="lyka-chat-field">
                <span>Phone / WhatsApp (optional)</span>
                <div className="lyka-chat-field-input">
                  <Phone size={14} />
                  <input
                    type="tel"
                    placeholder="+971 50 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
              </label>
            )}
            {mode === 'register' && (
              <label className="lyka-chat-field">
                <span>City / Community (optional)</span>
                <div className="lyka-chat-field-input">
                  <MapPin size={14} />
                  <input
                    type="text"
                    placeholder="e.g. Dubai Marina"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    autoComplete="address-level2"
                  />
                </div>
              </label>
            )}
            {mode === 'register' && (
              <DiscoverySourceSelect
                id="lyka-register-discovery-source"
                value={discoverySource}
                onChange={setDiscoverySource}
                variant="chat"
              />
            )}
            {mode !== 'forgot-password' && (
              <label className="lyka-chat-field">
                <span>Password</span>
                <div className="lyka-chat-field-input">
                  <Lock size={14} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    style={{ paddingRight: '4px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A7B85', display: 'flex', padding: '2px' }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </label>
            )}

            {mode === 'login' && (
              <button type="button" className="lyka-chat-link-btn" onClick={() => switchMode('forgot-password')}>
                Forgot password?
              </button>
            )}

            {error && <div className="lyka-chat-form-error" role="alert">{error}</div>}

            <button type="submit" className="lyka-chat-primary-btn" disabled={loading} style={{ opacity: loading ? 0.65 : 1 }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create profile' : 'Send reset link'}
            </button>

            {mode !== 'forgot-password' && (
              <button
                type="button"
                className="lyka-chat-ghost-rose-btn"
                onClick={handleGoogle}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z" />
                  <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.5 24 12 24z" />
                  <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8H1.4C.5 8.5 0 10.2 0 12s.5 3.5 1.4 5.1l3.8-2.7z" />
                  <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.4 6.7l3.8 2.9c.9-2.9 3.6-4.9 6.8-4.9z" />
                </svg>
                Continue with Google
              </button>
            )}
          </form>
        )}

        <p className="lyka-chat-auth-note">
          Secured by Firebase Authentication. We never see or store your password.
        </p>
        {mode === 'forgot-password' && (
          <button type="button" className="lyka-chat-link-btn center" onClick={() => switchMode('login')}>
            Back to sign in
          </button>
        )}
        {mode !== 'forgot-password' && (
          <button type="button" className="lyka-chat-link-btn center" onClick={onGoOnboarding}>
            Continue to preferences →
          </button>
        )}
      </div>
    </div>
  )
}
