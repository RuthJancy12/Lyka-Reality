/**
 * Firebase Auth error mapping + form validation.
 * Pure functions (no Firebase dependency) so they are unit-testable.
 */

export function friendlyAuthError(codeOrMessage: string): string {
  const code = codeOrMessage || ''
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid. Please check it and try again.'
    case 'auth/missing-email':
      return 'Please enter your email address first.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact LYKA support.'
    case 'auth/user-not-found':
      return 'No account found with this email. Try signing up instead.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. If you registered with Google, use “Continue with Google” — or reset your password to enable email sign-in.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.'
    case 'auth/weak-password':
      return 'Password is too weak — please use at least 6 characters.'
    case 'auth/missing-password':
      return 'Please enter your password.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and retry.'
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before finishing. Please try again.'
    case 'auth/cancelled-popup-request':
      return 'Another sign-in window is already open. Please finish it first.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Please allow popups and retry.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled yet. Please contact LYKA support.'
    case 'auth/account-exists-with-different-credential':
      return 'This email is already registered with a different sign-in method. Try that method instead.'
    case 'auth/requires-recent-login':
      return 'For security, please sign in again to continue.'
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return 'This reset link is invalid or has expired. Please request a new one.'
    case 'auth/internal-error':
      return 'The sign-in service returned an internal error. This usually means Email/Password sign-in is not enabled in the Firebase console, or the API key is restricted. Please contact LYKA support.'
    case 'auth/invalid-api-key':
      return 'The app configuration is invalid (API key rejected). Please contact LYKA support.'
    case 'auth/app-not-authorized':
      return 'This app is not authorized for sign-in. The domain may be missing from Firebase authorized domains. Please contact LYKA support.'
    case 'auth/timeout':
      return 'The request timed out. Please check your connection and try again.'
    case 'auth/user-token-expired':
      return 'Your session has expired. Please sign in again.'
    case 'auth/web-storage-unsupported':
      return 'Your browser is blocking the storage sign-in needs (cookies/site data). Please allow it and retry.'
    case 'auth/provider-already-linked':
      return 'This sign-in method is already linked to your account.'
    case 'auth/credential-already-in-use':
      return 'These credentials belong to another account. Try signing in with them directly.'
    case 'auth/rejected-credential':
      return 'The sign-in attempt was rejected. Please try again.'
    default:
      return 'Something went wrong. Please try again in a moment.'
  }
}

/**
 * HTTP status attached by the CRM API client, or null for Firebase/network
 * errors. Kept separate from Firebase error codes so an unavailable backend
 * (404/5xx) is never mistaken for a customer who lacks a staff record.
 */
export function authHttpStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null
  const status = (err as { status?: unknown }).status
  return typeof status === 'number' && status >= 100 && status <= 599 ? status : null
}

/** True for browser/network failures where no HTTP response was received. */
export function isNetworkAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return /failed to fetch|networkerror|network error|load failed|fetch failed|timed? ?out/i.test(message)
}

/**
 * Full error detail for development. Returns a short technical string
 * (code + server message) without secrets, or null when there is nothing
 * extra to show.
 */
export function authErrorDetails(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const rec = err as Record<string, unknown>
  const code = typeof rec.code === 'string' ? rec.code : ''
  const message = typeof rec.message === 'string' ? rec.message : ''
  const extra = message && message !== code ? ` — ${message.slice(0, 220)}` : ''
  return code ? `${code}${extra}` : null
}

/** True when the URL carries ?authdebug=1 (shows raw Firebase codes in UI). */
export function isAuthDebug(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('authdebug') === '1'
  } catch {
    return false
  }
}

const GENERIC_FALLBACK = 'Something went wrong. Please try again in a moment.'

/**
 * Single entry point for auth UI failure handling: logs the complete error,
 * maps it to a friendly message, and — with ?authdebug=1 in the URL —
 * appends the raw Firebase code so the real error is never hidden in dev.
 * Unknown auth/* errors surface Firebase's own message text (which carries
 * no secrets) instead of the generic fallback.
 */
export function authFailureMessage(err: unknown, context: string): string {
  logAuthError(context, err)
  const rec = (err && typeof err === 'object' ? err : {}) as Record<string, unknown>
  const code = typeof rec.code === 'string' ? rec.code : ''
  const tokenMsg = String((rec.customData as any)?._tokenResponse?.error?.message || rec.message || '')

  if (tokenMsg.includes('EMAIL_NOT_FOUND')) {
    return 'No account found with this email. If you are an employee, contact your Admin to create your account; otherwise please sign up.'
  }
  if (tokenMsg.includes('INVALID_PASSWORD')) {
    return 'Incorrect password. If you were recently invited, please check your invitation email to complete password setup, or use "Forgot Password".'
  }
  if (tokenMsg.includes('USER_DISABLED')) {
    return 'This account has been disabled. Please contact LYKA support or your HR administrator.'
  }
  if (tokenMsg.includes('TOO_MANY_ATTEMPTS')) {
    return 'Too many attempts. Access is temporarily disabled. Please reset your password or try again later.'
  }

  const friendly = friendlyAuthError(code)
  if (friendly !== GENERIC_FALLBACK) {
    if (isAuthDebug()) {
      const details = authErrorDetails(err)
      if (details && details !== code) return `${friendly} [${details}]`
      if (code) return `${friendly} [${code}]`
    }
    return friendly
  }
  const raw = typeof rec.message === 'string' ? rec.message.trim() : ''
  if (raw && raw !== code) return raw.slice(0, 300)
  if (isAuthDebug() && code) return `${friendly} [${code}]`
  return friendly
}

/**
 * Logs the complete Firebase error for diagnosis. Never includes passwords
 * or tokens — only code, message, and name.
 */
export function logAuthError(context: string, err: unknown): void {
  try {
    if (err && typeof err === 'object') {
      const rec = err as Record<string, unknown>
      console.error(`[LYKA auth] ${context}:`, {
        code: rec.code ?? '(no code)',
        message: typeof rec.message === 'string' ? rec.message.slice(0, 500) : rec.message,
        name: rec.name ?? '(no name)'
      })
    } else {
      console.error(`[LYKA auth] ${context}:`, err)
    }
  } catch {
    // Logging must never break auth flows.
  }
}

export function validateAuthForm(input: {
  mode: 'login' | 'signup' | 'forgot-password'
  name: string
  email: string
  password: string
}): string | null {
  const email = input.email.trim()
  if (!email) return 'Please enter your email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'That email address looks invalid. Please check it and try again.'
  }
  if (input.mode === 'forgot-password') return null
  if (!input.password) return 'Please enter your password.'
  if (input.mode === 'signup') {
    if (!input.name.trim()) return 'Please tell us your name.'
    if (input.password.length < 6) return 'Password is too weak — please use at least 6 characters.'
  }
  return null
}
