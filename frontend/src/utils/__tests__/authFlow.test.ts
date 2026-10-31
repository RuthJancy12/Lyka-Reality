import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  friendlyAuthError,
  validateAuthForm,
  authFailureMessage,
  authHttpStatus,
  isNetworkAuthError,
} from '../../services/authErrors'
import {
  fetchStaffMe,
  clearStaffMeCache,
  ASSIGNABLE_ROLES,
} from '../../crm/services/staffApi'
import { crmFetch } from '../../crm/services/crmApi'
// Raw sources for structural guards (vite ?raw — no node APIs).
import authModalSrc from '../../components/AuthModal.tsx?raw'
import teamSrc from '../../crm/pages/Team.tsx?raw'

const modal: string = authModalSrc
const team: string = teamSrc

describe('auth error messages (user-friendly, actionable)', () => {
  it('maps invalid credentials with Google guidance', () => {
    for (const code of ['auth/invalid-credential', 'auth/wrong-password']) {
      const msg = friendlyAuthError(code)
      expect(msg).toMatch(/incorrect email or password/i)
      expect(msg).toMatch(/google/i)
    }
  })

  it('maps account/permission states distinctly', () => {
    expect(friendlyAuthError('auth/user-not-found')).toMatch(/no account found/i)
    expect(friendlyAuthError('auth/user-disabled')).toMatch(/disabled/i)
    expect(friendlyAuthError('auth/operation-not-allowed')).toMatch(/not enabled/i)
    expect(friendlyAuthError('auth/too-many-requests')).toMatch(/too many attempts/i)
    expect(friendlyAuthError('auth/network-request-failed')).toMatch(/network/i)
    expect(friendlyAuthError('auth/account-exists-with-different-credential')).toMatch(
      /different sign-in method/i
    )
    expect(friendlyAuthError('auth/requires-recent-login')).toMatch(/sign in again/i)
  })

  it('surfaces unknown server messages instead of swallowing them', () => {
    const msg = authFailureMessage(
      { code: 'auth/made-up-future-code', message: 'Future provider wobble' },
      'test'
    )
    expect(msg).toContain('Future provider wobble')
  })

  it('falls back generically only when there is truly nothing to show', () => {
    expect(authFailureMessage({}, 'test')).toMatch(/something went wrong/i)
  })
})

describe('backend vs credential failures', () => {
  it('reads an HTTP status from API errors and ignores invalid values', () => {
    expect(authHttpStatus({ status: 404 })).toBe(404)
    expect(authHttpStatus({ status: 503 })).toBe(503)
    expect(authHttpStatus({ status: 0 })).toBeNull()
    expect(authHttpStatus({ status: '403' })).toBeNull()
    expect(authHttpStatus(new Error('offline'))).toBeNull()
    expect(authHttpStatus(null)).toBeNull()
  })

  it('recognises browser/network failures', () => {
    expect(isNetworkAuthError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkAuthError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isNetworkAuthError(new Error('Request failed with HTTP 404'))).toBe(false)
  })
})

describe('validateAuthForm', () => {
  it('requires a valid email in every mode', () => {
    expect(validateAuthForm({ mode: 'login', name: '', email: '', password: 'x' })).toMatch(
      /email/i
    )
    expect(validateAuthForm({ mode: 'login', name: '', email: 'not-an-email', password: 'x' })).toMatch(
      /invalid/i
    )
  })

  it('requires a password for login/signup but not reset', () => {
    expect(
      validateAuthForm({ mode: 'login', name: '', email: 'a@b.co', password: '' })
    ).toMatch(/password/i)
    expect(
      validateAuthForm({ mode: 'forgot-password', name: '', email: 'a@b.co', password: '' })
    ).toBeNull()
  })

  it('requires name + 6-char password on signup', () => {
    expect(
      validateAuthForm({ mode: 'signup', name: '', email: 'a@b.co', password: '123456' })
    ).toMatch(/name/i)
    expect(
      validateAuthForm({ mode: 'signup', name: 'Ann', email: 'a@b.co', password: '123' })
    ).toMatch(/6 characters/i)
    expect(
      validateAuthForm({ mode: 'signup', name: 'Ann', email: 'a@b.co', password: '123456' })
    ).toBeNull()
  })
})

describe('staff role cache (sign-out / account switching)', () => {
  const me = {
    id: 1, email: 'admin@t.ae', name: 'AD', role: 'admin', is_active: true,
    manager_email: null, last_login_at: null,
  }

  beforeEach(() => {
    clearStaffMeCache()
    vi.unstubAllGlobals()
  })

  function stubMe() {
    return vi.fn(async () => ({ ok: true, json: async () => ({ ...me }) }))
  }

  it('caches /api/staff/me and refetches after cache clear', async () => {
    const spy = stubMe()
    vi.stubGlobal('fetch', spy)
    const first = await fetchStaffMe()
    const second = await fetchStaffMe()
    expect(first.email).toBe('admin@t.ae')
    expect(second.email).toBe('admin@t.ae')
    expect(spy).toHaveBeenCalledTimes(1)
    // Account switch / sign-out path: cache cleared -> next user refetched.
    clearStaffMeCache()
    await fetchStaffMe()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('preserves the HTTP status so a 404 is not mistaken for a customer account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not Found' }),
    })))
    await expect(crmFetch('/api/staff/me')).rejects.toMatchObject({ status: 404 })
  })
})

describe('auth structural guards (never bypass, never hardcode)', () => {
  it('AuthModal has no role selector and no hardcoded credentials', () => {
    expect(modal).not.toMatch(/select[^>]*role|role[^>]*select/i)
    expect(modal).not.toMatch(/password\s*=\s*["'][^"']+["']/i)
    expect(modal).toMatch(/signInWithEmailAndPassword|signIn\(email, password\)/)
    expect(modal).toMatch(/signInWithGoogle|Continue with Google/)
  })

  it('Team UI cannot offer Admin (backend stays the single enforcer)', () => {
    expect(team).toContain('ASSIGNABLE_ROLES')
    expect(ASSIGNABLE_ROLES.length).toBeGreaterThan(0)
    expect(ASSIGNABLE_ROLES).not.toContain('admin')
    expect(ASSIGNABLE_ROLES).toContain('salesperson')
  })
})
