import { useEffect, useState } from 'react'
import { X, Lock, Mail, User, Phone, MapPin, CheckCircle2, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { authFailureMessage, validateAuthForm } from '../services/authErrors'
import { saveCustomerProfile, type CustomerPreferences } from '../services/api'
import { collectLeadSource, normalizeDiscoverySource } from '../utils/leadSource'
import { validateCustomerProfile } from '../utils/customerProfile'
import {
  PURPOSE_OPTIONS, PROPERTY_TYPE_OPTIONS, BEDROOM_OPTIONS, TIMELINE_OPTIONS,
  emptyPreferencesForm, validatePreferencesForm, buildPreferencesPayload,
  type PreferencesFormState,
} from '../utils/customerPreferences'
import { requestDeviceLocation } from '../utils/deviceLocation'
import { DiscoverySourceSelect } from './DiscoverySourceSelect'

export type AuthMode = 'login' | 'signup' | 'forgot-password'

/** Post-Firebase steps for a new customer: optional preferences, then an
 * awaited, backend-confirmed profile save (never silently claimed). */
type SignupStep = 'account' | 'preferences' | 'saving' | 'done' | 'profile-error'

interface AuthModalProps {
  isOpen: boolean
  initialMode?: AuthMode
  onClose: () => void
  onSuccess: (user: { name: string; email: string; isNewUser?: boolean }) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 38px 9px 36px',
  borderRadius: '4px',
  border: '1px solid var(--champagne-border)',
  fontSize: '13px',
  color: 'var(--text-main)',
  outlineColor: 'var(--gold-primary)'
}

export function AuthModal({ isOpen, initialMode = 'login', onClose, onSuccess }: AuthModalProps) {
  const { signUp, signIn, signInWithGoogle, resetPassword } = useAuth()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [discoverySource, setDiscoverySource] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  // Post-signup profile flow (signup mode only).
  const [signupStep, setSignupStep] = useState<SignupStep>('account')
  const [createdName, setCreatedName] = useState('')
  const [prefsForm, setPrefsForm] = useState<PreferencesFormState>(emptyPreferencesForm)
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locNote, setLocNote] = useState<string | null>(null)

  // The modal stays mounted while closed (early return below preserves
  // state), so resync the mode every time it opens — otherwise a previous
  // visit's mode (e.g. signup) would wrongly persist for a login-first open.
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode)
      setError(null)
      setResetSent(false)
      setCity('')
      setCountry('')
      setDiscoverySource('')
      setSignupStep('account')
      setPrefsForm(emptyPreferencesForm())
      setPrefsMsg(null)
      setProfileError(null)
      setLocNote(null)
    }
  }, [isOpen, initialMode])

  if (!isOpen) return null

  const switchMode = (m: AuthMode) => {
    setMode(m)
    setError(null)
    setResetSent(false)
    setSignupStep('account')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validateAuthForm({ mode, name, email, password })
    if (validationError) {
      setError(validationError)
      return
    }
    // Contact/profile fields are validated up front so Firebase never
    // creates an account the profile form would then reject.
    if (mode === 'signup') {
      const profileErr = validateCustomerProfile({
        name, phone, city, country, discovery_source: discoverySource,
      })
      if (profileErr) {
        setError(profileErr)
        return
      }
    }
    setLoading(true)
    setError(null)
    try {
      if (mode === 'forgot-password') {
        await resetPassword(email)
        setResetSent(true)
      } else if (mode === 'signup') {
        // Step 1: Firebase creates the credential account. The SQL profile
        // is saved in a later, explicitly awaited step — never claimed early.
        const u = await signUp(name, email, password)
        setCreatedName(u.name)
        setSignupStep('preferences')
      } else {
        const u = await signIn(email, password)
        onSuccess({ name: u.name, email: u.email, isNewUser: false })
        onClose()
      }
    } catch (err: unknown) {
      setError(authFailureMessage(err, 'AuthModal'))
    } finally {
      setLoading(false)
    }
  }

  /**
   * Awaited SQL profile creation for the just-registered UID. Resolves only
   * when the backend confirms (HTTP 200); callers translate failures into
   * an explicit retry state instead of claiming success. Credentials are
   * Firebase-only — no password ever travels in this payload.
   */
  const saveProfileOrThrow = async (prefs: CustomerPreferences | undefined): Promise<void> => {
    const discovery = normalizeDiscoverySource(discoverySource)
    const source = collectLeadSource()
    await saveCustomerProfile({
      name: createdName.trim(),
      phone: phone.trim() || undefined,
      city: city.trim() || undefined,
      country: country.trim() || undefined,
      ...(discovery ? { discovery_source: discovery } : {}),
      preferences: prefs,
      utm_source: source.utm_source,
      utm_medium: source.utm_medium,
      utm_campaign: source.utm_campaign,
      referrer: source.referrer,
    })
  }

  const runProfileSave = async (prefs: CustomerPreferences | undefined) => {
    setSignupStep('saving')
    setProfileError(null)
    try {
      await saveProfileOrThrow(prefs)
      setSignupStep('done')
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Could not reach the server.')
      setSignupStep('profile-error')
    }
  }

  const handlePrefsContinue = () => {
    const err = validatePreferencesForm(prefsForm)
    if (err) {
      setPrefsMsg(err)
      return
    }
    setPrefsMsg(null)
    void runProfileSave(buildPreferencesPayload(prefsForm))
  }

  const handlePrefsSkip = () => {
    setPrefsMsg(null)
    void runProfileSave(undefined)
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    try {
      const u = await signInWithGoogle()
      if (mode === 'signup') {
        // Same awaited profile flow as email registration.
        setCreatedName(u.name)
        setSignupStep('preferences')
      } else {
        onSuccess({ name: u.name, email: u.email, isNewUser: false })
        onClose()
      }
    } catch (err: unknown) {
      setError(authFailureMessage(err, 'AuthModal'))
    } finally {
      setLoading(false)
    }
  }

  const finishSignup = () => {
    onSuccess({ name: createdName, email: email.trim(), isNewUser: true })
    onClose()
  }

  /** Optional, permission-gated precise location. The browser prompts first;
   * coordinates stay on this device and are never sent to the SQL profile —
   * the typed community remains the source of truth. */
  const handleUseMyLocation = async () => {
    setLocating(true)
    setLocNote(null)
    const res = await requestDeviceLocation()
    setLocating(false)
    if (res.status === 'granted') {
      setLocNote(
        'Precise location is available on this device — your profile still uses the community you type below.'
      )
    } else {
      setLocNote(res.message)
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
      padding: '16px'
    }}>
      <div className="auth-card" style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid var(--champagne-border)',
        boxShadow: '0 20px 50px rgba(26, 13, 24, 0.5)',
        width: '100%',
        maxWidth: '440px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '32px',
        position: 'relative'
      }}>
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
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
            color: 'var(--plum-deep)'
          }}
        >
          <X size={16} />
        </button>

        {/* Existing Project Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{
            background: 'var(--plum-deep)',
            border: '1px solid var(--gold-border)',
            padding: '6px 14px',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center'
          }}>
            <img
              src="/logo.png"
              alt="Lyka Realty"
              style={{
                height: '26px',
                width: 'auto',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </div>
          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Client Portal
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Dubai Real Estate
            </span>
          </div>
        </div>

        {/* Modal Title */}
        <h3 className="luxury-serif" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--plum-deep)', marginBottom: '4px' }}>
          {mode === 'login' && 'Sign in to your account'}
          {mode === 'signup' && signupStep === 'account' && 'Create your investor profile'}
          {mode === 'signup' && signupStep === 'preferences' && 'Complete your profile'}
          {mode === 'signup' && signupStep === 'saving' && 'Saving your profile…'}
          {mode === 'signup' && signupStep === 'done' && 'Welcome to LYKA Realty'}
          {mode === 'signup' && signupStep === 'profile-error' && 'Almost done'}
          {mode === 'forgot-password' && 'Reset your password'}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '22px' }}>
          {mode === 'login' && 'Access your saved properties, shortlisted brochures, and advisory requests.'}
          {mode === 'signup' && signupStep === 'account' && 'Unlock off-plan early access, floor plans, and direct broker contact.'}
          {mode === 'signup' && signupStep === 'preferences' && 'Tell us what you are looking for — everything is optional and can be changed later.'}
          {mode === 'signup' && signupStep === 'saving' && 'Confirming your details with your account…'}
          {mode === 'signup' && signupStep === 'done' && 'Your account and profile are saved.'}
          {mode === 'signup' && signupStep === 'profile-error' && 'Your account is created — one step still needs attention.'}
          {mode === 'forgot-password' && 'Enter your email address and we will dispatch a secure reset link.'}
        </p>

        {/* Post-signup steps: optional preferences, then an awaited,
            backend-confirmed profile save with honest states. */}
        {mode === 'signup' && signupStep !== 'account' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {signupStep === 'preferences' && (
              <>
                <div>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                    I want to (optional)
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {PURPOSE_OPTIONS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPrefsForm((f) => ({ ...f, purpose: f.purpose === p ? '' : p }))}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: '4px', fontSize: '13px', fontWeight: 600,
                          cursor: 'pointer',
                          background: prefsForm.purpose === p ? 'var(--plum-main)' : '#fff',
                          color: prefsForm.purpose === p ? 'var(--gold-hover)' : 'var(--text-secondary)',
                          border: `1px solid ${prefsForm.purpose === p ? 'var(--gold-primary)' : 'var(--champagne-border)'}`,
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }} htmlFor="lyka-signup-proptype">
                    Property type (optional)
                  </label>
                  <select
                    id="lyka-signup-proptype"
                    value={prefsForm.propertyType}
                    onChange={(e) => setPrefsForm((f) => ({ ...f, propertyType: e.target.value }))}
                    style={{ ...inputStyle, padding: '9px 12px', cursor: 'pointer', background: '#fff' }}
                  >
                    <option value="">No preference</option>
                    {PROPERTY_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }} htmlFor="lyka-signup-beds">
                    Bedrooms (optional)
                  </label>
                  <select
                    id="lyka-signup-beds"
                    value={prefsForm.bedrooms}
                    onChange={(e) => setPrefsForm((f) => ({ ...f, bedrooms: e.target.value }))}
                    style={{ ...inputStyle, padding: '9px 12px', cursor: 'pointer', background: '#fff' }}
                  >
                    <option value="">No preference</option>
                    {BEDROOM_OPTIONS.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }} htmlFor="lyka-signup-bmin">
                      Min budget (AED)
                    </label>
                    <input
                      id="lyka-signup-bmin"
                      type="number"
                      min={0}
                      placeholder="e.g. 1500000"
                      value={prefsForm.budgetMin}
                      onChange={(e) => setPrefsForm((f) => ({ ...f, budgetMin: e.target.value }))}
                      style={{ ...inputStyle, padding: '9px 12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }} htmlFor="lyka-signup-bmax">
                      Max budget (AED)
                    </label>
                    <input
                      id="lyka-signup-bmax"
                      type="number"
                      min={0}
                      placeholder="e.g. 3000000"
                      value={prefsForm.budgetMax}
                      onChange={(e) => setPrefsForm((f) => ({ ...f, budgetMax: e.target.value }))}
                      style={{ ...inputStyle, padding: '9px 12px' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }} htmlFor="lyka-signup-community">
                    Preferred community (optional)
                  </label>
                  <input
                    id="lyka-signup-community"
                    type="text"
                    placeholder="e.g. Dubai Marina"
                    value={prefsForm.community}
                    onChange={(e) => setPrefsForm((f) => ({ ...f, community: e.target.value }))}
                    autoComplete="address-level2"
                    style={{ ...inputStyle, padding: '9px 12px' }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {['Dubai Marina', 'Palm Jumeirah', 'Downtown Dubai', 'Dubai Hills Estate'].map((comm) => (
                      <button
                        key={comm}
                        type="button"
                        onClick={() => setPrefsForm((f) => ({ ...f, community: comm }))}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: `1px solid ${prefsForm.community === comm ? 'var(--gold-primary)' : 'var(--champagne-border)'}`,
                          background: prefsForm.community === comm ? 'var(--gold-light)' : 'var(--champagne-surface)',
                          color: prefsForm.community === comm ? 'var(--plum-deep)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {comm}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }} htmlFor="lyka-signup-timeline">
                    Timeline (optional)
                  </label>
                  <select
                    id="lyka-signup-timeline"
                    value={prefsForm.timelineDays}
                    onChange={(e) => setPrefsForm((f) => ({ ...f, timelineDays: e.target.value }))}
                    style={{ ...inputStyle, padding: '9px 12px', cursor: 'pointer', background: '#fff' }}
                  >
                    <option value="">No preference</option>
                    {TIMELINE_OPTIONS.map((t) => (
                      <option key={t.label} value={t.days === null ? '' : t.days}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {prefsMsg && (
                  <div role="alert" style={{
                    background: '#FDF1F1', border: '1px solid #E8A0A0', color: '#8C2F2F',
                    fontSize: '12px', borderRadius: '4px', padding: '8px 12px',
                  }}>
                    {prefsMsg}
                  </div>
                )}
                <button type="button" onClick={handlePrefsContinue} className="gold-btn" style={{ padding: '11px', fontSize: '13px', borderRadius: '4px' }}>
                  Save &amp; Continue
                </button>
                <button type="button" onClick={handlePrefsSkip} className="outline-navy-btn" style={{ padding: '10px', fontSize: '13px' }}>
                  Skip for now
                </button>
              </>
            )}
            {signupStep === 'saving' && (
              <div style={{ textAlign: 'center', padding: '28px 12px' }} role="status">
                <Loader2 size={32} color="var(--gold-dark)" style={{ margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--plum-deep)' }}>
                  Saving your profile…
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Confirming your details with your account. This takes a moment.
                </p>
              </div>
            )}
            {signupStep === 'done' && (
              <div style={{ textAlign: 'center', padding: '20px 12px' }} role="status">
                <CheckCircle2 size={40} color="var(--gold-primary)" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--plum-deep)', marginBottom: '6px' }}>
                  Account created — profile saved
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.6 }}>
                  Welcome{createdName ? `, ${createdName.split(' ')[0]}` : ''}! Your details are confirmed
                  on your account and will restore on any device after sign-in.
                </p>
                <button type="button" onClick={finishSignup} className="gold-btn" style={{ width: '100%', padding: '11px', fontSize: '13px', borderRadius: '4px' }}>
                  Continue
                </button>
              </div>
            )}
            {signupStep === 'profile-error' && (
              <div style={{ padding: '4px 0' }}>
                <div role="alert" style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  background: '#FDF1F1', border: '1px solid #E8A0A0', color: '#8C2F2F',
                  fontSize: '13px', borderRadius: '4px', padding: '12px', marginBottom: '14px', lineHeight: 1.6,
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    <strong>Account created, but your profile details could not be saved.</strong>
                    <br />
                    {profileError || 'Could not reach the server.'} Nothing was silently saved —
                    retry below or continue and update them later from My Account.
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => void runProfileSave(buildPreferencesPayload(prefsForm))}
                    className="gold-btn"
                    style={{ padding: '11px', fontSize: '13px', borderRadius: '4px' }}
                  >
                    Retry saving profile
                  </button>
                  <button
                    type="button"
                    onClick={finishSignup}
                    className="outline-navy-btn"
                    style={{ padding: '10px', fontSize: '13px' }}
                  >
                    Continue anyway
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : resetSent ? (
          <div style={{
            padding: '24px',
            background: 'var(--champagne-surface)',
            border: '1px solid var(--champagne-border)',
            borderRadius: '6px',
            textAlign: 'center',
            color: 'var(--plum-deep)'
          }}>
            <CheckCircle2 size={36} color="var(--gold-primary)" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 700, fontSize: '15px' }}>
              Reset Link Dispatched
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              If an account exists for {email}, a reset link is on its way. Check your inbox and spam folder.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={15} color="var(--text-muted)" style={{ position: 'absolute', top: '11px', left: '12px' }} />
                  <input
                    type="text"
                    placeholder="e.g. Elena Rostova"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} color="var(--text-muted)" style={{ position: 'absolute', top: '11px', left: '12px' }} />
                <input
                  type="email"
                  placeholder="name@investor.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  style={inputStyle}
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  Phone / WhatsApp
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={15} color="var(--text-muted)" style={{ position: 'absolute', top: '11px', left: '12px' }} />
                  <input
                    type="tel"
                    placeholder="+971 50 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  City / Community (optional)
                </label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={15} color="var(--text-muted)" style={{ position: 'absolute', top: '11px', left: '12px' }} />
                  <input
                    type="text"
                    placeholder="e.g. Dubai Marina"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    autoComplete="address-level2"
                    style={inputStyle}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleUseMyLocation()}
                  disabled={locating}
                  style={{ background: 'none', border: 'none', fontSize: '11px', color: 'var(--plum-deep)', cursor: 'pointer', fontWeight: 600, padding: '4px 0 0', opacity: locating ? 0.6 : 1 }}
                >
                  {locating ? 'Requesting location…' : 'Use my current location'}
                </button>
                {locNote && (
                  <p role="status" style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.5 }}>{locNote}</p>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  Country (optional)
                </label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={15} color="var(--text-muted)" style={{ position: 'absolute', top: '11px', left: '12px' }} />
                  <input
                    type="text"
                    placeholder="e.g. United Arab Emirates"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    autoComplete="country-name"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {mode === 'signup' && (
              <DiscoverySourceSelect
                id="lyka-auth-discovery-source"
                value={discoverySource}
                onChange={setDiscoverySource}
                variant="form"
                labelStyle={{ fontSize: '11px', marginBottom: '4px' }}
              />
            )}

            {mode !== 'forgot-password' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot-password')}
                      style={{ background: 'none', border: 'none', fontSize: '11px', color: 'var(--plum-deep)', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} color="var(--text-muted)" style={{ position: 'absolute', top: '11px', left: '12px' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute', top: '8px', right: '8px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', display: 'flex', padding: '2px'
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div role="alert" style={{
                background: '#FDF1F1',
                border: '1px solid #E8A0A0',
                color: '#8C2F2F',
                fontSize: '12px',
                borderRadius: '4px',
                padding: '8px 12px'
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="gold-btn"
              disabled={loading}
              style={{
                marginTop: '6px',
                padding: '11px',
                fontSize: '13px',
                borderRadius: '4px',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading
                ? 'Please wait…'
                : mode === 'login' ? 'Sign In'
                : mode === 'signup' ? 'Create Account'
                : 'Send Reset Link'}
            </button>

            {mode !== 'forgot-password' && (
              <>
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
              </>
            )}
          </form>
        )}

        {/* Footer switch tabs (hidden once the account exists — the
            profile steps finish or dismiss the modal explicitly). */}
        {(mode !== 'signup' || signupStep === 'account') && (
        <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--champagne-border)', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
          {mode === 'login' && (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                style={{ background: 'none', border: 'none', color: 'var(--plum-deep)', fontWeight: 700, cursor: 'pointer' }}
              >
                Sign up
              </button>
            </>
          )}

          {mode === 'signup' && (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{ background: 'none', border: 'none', color: 'var(--plum-deep)', fontWeight: 700, cursor: 'pointer' }}
              >
                Sign in
              </button>
            </>
          )}

          {mode === 'forgot-password' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              style={{ background: 'none', border: 'none', color: 'var(--plum-deep)', fontWeight: 700, cursor: 'pointer' }}
            >
              Back to Sign in
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
