import { describe, it, expect } from 'vitest'
import {
  STAFF_ROLE_OPTIONS,
  checkEmployeeRole,
  roleLabel,
} from '../staffRoleCheck'
import { validateAuthForm } from '../../services/authErrors'
// Raw sources for structural guards (vite ?raw — no node APIs).
import portalSrc from '../../components/PortalSelect.tsx?raw'
import employeeSrc from '../../components/EmployeeLogin.tsx?raw'
import staffRoleSrc from '../staffRoleCheck.ts?raw'
import appSrc from '../../App.tsx?raw'
import authModalSrc from '../../components/AuthModal.tsx?raw'

describe('staff role options (Pick Your Role)', () => {
  it('offers exactly Admin, HRMS Admin, Sales Agent', () => {
    expect(STAFF_ROLE_OPTIONS.map((o) => o.value)).toEqual([
      'admin',
      'hrms_admin',
      'sales_agent',
    ])
    expect(STAFF_ROLE_OPTIONS.map((o) => o.label)).toEqual([
      'Admin',
      'HRMS Admin',
      'Sales Agent',
    ])
  })

  it('labels roles human-readably', () => {
    expect(roleLabel('sales_manager')).toBe('Sales Manager')
    expect(roleLabel('admin')).toBe('Admin')
  })
})

describe('checkEmployeeRole (confirm intent, never grant)', () => {
  it('passes when the picked role matches the verified role', () => {
    expect(checkEmployeeRole('sales_manager', 'sales_manager')).toBeNull()
    expect(checkEmployeeRole('admin', 'admin')).toBeNull()
  })

  it('rejects mismatches and names both roles', () => {
    const msg = checkEmployeeRole('sales_agent', 'admin')
    expect(msg).toMatch(/mismatch/i)
    expect(msg).toContain('Sales Agent')
    expect(msg).toContain('Admin')
  })

  it('passes any verified staff when no role was picked', () => {
    expect(checkEmployeeRole('manager', '')).toBeNull()
  })

  it('denies customers and unknown accounts, pointing at Customer Login', () => {
    for (const v of [null, undefined, '']) {
      const msg = checkEmployeeRole(v, 'admin')
      expect(msg).toMatch(/no employee access/i)
      expect(msg).toMatch(/Customer Login/)
    }
    // Even without a picked role, a non-staff account is refused.
    expect(checkEmployeeRole(null, '')).toMatch(/no employee access/i)
  })
})

describe('validateAuthForm for employee login', () => {
  it('rejects bad emails and missing passwords', () => {
    expect(
      validateAuthForm({ mode: 'login', name: '', email: 'not-an-email', password: 'secret1' })
    ).toMatch(/invalid/i)
    expect(
      validateAuthForm({ mode: 'login', name: '', email: 'me@lykarealty.ae', password: '' })
    ).toMatch(/password/i)
  })

  it('accepts a well-formed work-email login', () => {
    expect(
      validateAuthForm({ mode: 'login', name: '', email: 'me@lykarealty.ae', password: 'secret1' })
    ).toBeNull()
  })
})

describe('portal-selection page (structural)', () => {
  it('shows separate Customer Login and Employee Portal cards', () => {
    expect(portalSrc).toMatch(/Customer Login/)
    expect(portalSrc).toMatch(/Continue as Customer/)
    expect(portalSrc).toMatch(/Employee Portal/)
    expect(portalSrc).toMatch(/Continue as Employee/)
  })

  it('keeps the luxury burgundy/gold tokens with rose accents', () => {
    expect(portalSrc).toMatch(/plum-deep/)
    expect(portalSrc).toMatch(/gold-btn|gold-border/)
    expect(portalSrc).toMatch(/rose-/)
  })
})

describe('employee login page (structural)', () => {
  it('has work email, password, Google, and the Pick Your Role dropdown', () => {
    expect(employeeSrc).toMatch(/Work Email/)
    expect(employeeSrc).toMatch(/Pick Your Role/)
    expect(employeeSrc).toMatch(/Continue with Google/)
    // Options render from the shared allowlist (single source of truth).
    expect(employeeSrc).toMatch(/STAFF_ROLE_OPTIONS\.map/)
    for (const label of ['Admin', 'HRMS Admin', 'Sales Agent']) {
      expect(staffRoleSrc).toContain(label)
    }
  })

  it('offers password visibility control and loading feedback', () => {
    expect(employeeSrc).toMatch(/Show password|Hide password/)
    expect(employeeSrc).toMatch(/Verifying/)
  })

  it('authenticates with Firebase, verifies via /api/staff/me, never grants', () => {
    expect(employeeSrc).toMatch(/signIn\(email, password\)|signInWithEmailAndPassword/)
    expect(employeeSrc).toMatch(/signInWithGoogle/)
    expect(employeeSrc).toMatch(/fetchStaffMe/)
    expect(employeeSrc).toMatch(/checkEmployeeRole/)
    // Refusals sign the account back out; success surfaces the verified role.
    expect(employeeSrc).toMatch(/logout\(\)/)
    expect(employeeSrc).toMatch(/Verified role/)
    expect(employeeSrc).toMatch(/onSuccess\(verifiedRole\)/)
    expect(employeeSrc).not.toMatch(/password\s*=\s*["'][^"']+["']/)
  })
})

describe('app wiring (structural)', () => {
  it('opens the portal chooser from Sign In and routes each portal', () => {
    expect(appSrc).toMatch(/PortalSelect/)
    expect(appSrc).toMatch(/EmployeeLogin/)
    expect(appSrc).toMatch(/setIsPortalOpen\(true\)/)
    expect(appSrc).toMatch(/setIsEmployeeOpen\(true\)/)
    expect(appSrc).toMatch(/navigate\('\/crm'\)/)
  })
})

describe('customer modal stays role-free with profile fields (structural)', () => {
  it('has no role selector and no hardcoded credentials', () => {
    expect(authModalSrc).not.toMatch(/select[^>]*role|role[^>]*select/i)
    expect(authModalSrc).not.toMatch(/password\s*=\s*["'][^"']+["']/)
  })

  it('collects city/community and discovery source on signup', () => {
    expect(authModalSrc).toMatch(/City \/ Community/)
    expect(authModalSrc).toMatch(/DiscoverySourceSelect|How did you hear about/)
  })

  it('persists the customer profile after registration (never on login)', () => {
    expect(authModalSrc).toMatch(/saveCustomerProfile/)
    expect(authModalSrc).toMatch(/collectLeadSource/)
  })
})
