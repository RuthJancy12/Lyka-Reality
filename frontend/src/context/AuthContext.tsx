import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  onAuthStateChanged,
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithPopup,
  type User
} from 'firebase/auth'
import { auth, authPersistenceReady, googleProvider } from '../services/firebase'
import { logAuthError } from '../services/authErrors'

function checkOnline(): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const err = { code: 'auth/network-request-failed', message: 'offline precheck' }
      logAuthError('offline-precheck', err)
      throw err
    }
  } catch (e) {
    // Re-throw our own offline error; swallow only unexpected introspection bugs.
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'auth/network-request-failed') {
      throw e
    }
  }
}

export interface AuthUser {
  uid: string
  name: string
  email: string
  photoURL: string | null
  /** Linked provider IDs, e.g. ['google.com'] or ['google.com', 'password']. */
  providers: string[]
}

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    name: user.displayName?.trim() || user.email?.split('@')[0] || 'Investor',
    email: user.email || '',
    photoURL: user.photoURL,
    providers: (user.providerData || []).map((p) => p?.providerId).filter((id): id is string => Boolean(id))
  }
}

interface AuthContextValue {
  /** Null while unknown (initial load), then Firebase user or null. */
  user: AuthUser | null
  authLoading: boolean
  signUp: (name: string, email: string, password: string) => Promise<AuthUser>
  signIn: (email: string, password: string) => Promise<AuthUser>
  signInWithGoogle: () => Promise<AuthUser>
  resetPassword: (email: string) => Promise<void>
  /**
   * Links an email/password credential to the CURRENT signed-in user
   * (e.g. a Google-created account with no password yet). Same UID, no
   * duplicate, no data loss. Re-verifies identity via Google when Firebase
   * demands a recent login.
   */
  linkPassword: (password: string) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // ZERO BROWSER PERSISTENCE: Firebase runs with inMemoryPersistence.
  // Sessions reside purely in JS memory heap (never written to IndexedDB/localStorage).
  // Refreshing the page reinitializes memory and requires re-login. Expired or
  // revoked sessions resolve to null here, which re-locks protected UI.
  useEffect(() => {
    let unsub = () => {}
    let active = true
    authPersistenceReady
      .then(() => {
        if (!active) return
        unsub = onAuthStateChanged(auth, (fbUser) => {
          setUser(fbUser ? toAuthUser(fbUser) : null)
          setAuthLoading(false)
        })
      })
      .catch((err) => {
        if (!active) return
        console.error('[LYKA Auth] Auth persistence initialization failed. Locking UI safely.', err)
        setUser(null)
        setAuthLoading(false)
      })
    return () => {
      active = false
      unsub()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    authLoading,
    async signUp(name: string, email: string, password: string) {
      checkOnline()
      await authPersistenceReady
      let cred
      try {
        cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      } catch (err) {
        logAuthError('signUp', err)
        throw err
      }
      const displayName = name.trim()
      // Display-name update is cosmetic: never fail registration because of it.
      if (displayName && cred.user.displayName !== displayName) {
        try {
          await updateProfile(cred.user, { displayName })
        } catch (err) {
          logAuthError('signUp-updateProfile-nonfatal', err)
        }
      }
      const u = toAuthUser({ ...cred.user, displayName: displayName || cred.user.displayName } as User)
      setUser(u)
      return u
    },
    async signIn(email: string, password: string) {
      checkOnline()
      await authPersistenceReady
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
        const u = toAuthUser(cred.user)
        setUser(u)
        return u
      } catch (err) {
        logAuthError('signIn', err)
        throw err
      }
    },
    async signInWithGoogle() {
      checkOnline()
      await authPersistenceReady
      try {
        const cred = await signInWithPopup(auth, googleProvider)
        const u = toAuthUser(cred.user)
        setUser(u)
        return u
      } catch (err) {
        logAuthError('signInWithGoogle', err)
        throw err
      }
    },
    async resetPassword(email: string) {
      checkOnline()
      await authPersistenceReady
      try {
        await sendPasswordResetEmail(auth, email.trim().toLowerCase())
      } catch (err) {
        // NOTE: with email-enumeration protection, Firebase resolves success
        // even for unregistered addresses (no email is sent). A rejection here
        // is a real failure (disabled provider, bad config, network, ...).
        logAuthError('resetPassword', err)
        throw err
      }
    },
    async linkPassword(password: string) {
      checkOnline()
      await authPersistenceReady
      const current = auth.currentUser
      if (!current) {
        const err = new Error('Please sign in with Google first, then set a password.')
        ;(err as { code?: string }).code = 'auth/requires-recent-login'
        throw err
      }
      if (!current.email) {
        const err = new Error('Your Google account has no email address to link a password to.')
        ;(err as { code?: string }).code = 'auth/missing-email'
        throw err
      }
      if ((current.providerData || []).some((p) => p.providerId === 'password')) {
        const err = new Error('This account already has a password. Use sign-in or reset it instead.')
        ;(err as { code?: string }).code = 'auth/provider-already-linked'
        throw err
      }
      const credential = EmailAuthProvider.credential(current.email, password)
      const finish = (linked: User): AuthUser => {
        const u = toAuthUser(linked)
        setUser(u)
        return u
      }
      try {
        const res = await linkWithCredential(current, credential)
        return finish(res.user)
      } catch (err) {
        const code = (err as { code?: string } | null)?.code
        if (code !== 'auth/requires-recent-login') {
          logAuthError('linkPassword', err)
          throw err
        }
        // Session is too old for a sensitive change: re-verify identity with
        // the already-linked Google provider, then retry the link once.
        // UID, chats, favorites, and roles are untouched throughout.
        try {
          await reauthenticateWithPopup(current, googleProvider)
          const retry = await linkWithCredential(auth.currentUser ?? current, credential)
          return finish(retry.user)
        } catch (retryErr) {
          logAuthError('linkPassword-reauth', retryErr)
          throw retryErr
        }
      }
    },
    async logout() {
      await authPersistenceReady.catch(() => {})
      await signOut(auth)
      setUser(null)
    }
  }), [user, authLoading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
