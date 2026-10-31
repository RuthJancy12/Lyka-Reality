/**
 * Employee-portal role confirmation (pure, unit-testable).
 *
 * The "Pick Your Role" dropdown only states the employee's INTENDED role.
 * Permissions always come from the backend-verified role (GET
 * /api/staff/me); this helper merely compares the two and produces the
 * user-facing message. It never grants anything.
 */
import type { StaffRole } from '../crm/services/staffApi'

export const STAFF_ROLE_OPTIONS: Array<{ value: StaffRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'hrms_admin', label: 'HRMS Admin' },
  { value: 'sales_agent', label: 'Sales Agent' },
]

/** 'hrms_admin' -> 'HRMS Admin', 'sales_agent' -> 'Sales Agent' (for messages). */
export function roleLabel(role: string): string {
  if (role === 'hrms_admin') return 'HRMS Admin'
  if (role === 'sales_agent' || role === 'salesperson') return 'Sales Agent'
  if (role === 'admin') return 'Admin'
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Compares the BACKEND-verified role against the employee's picked role.
 * Returns an error message when entry must be refused, or null when the
 * account may proceed to its verified dashboard.
 *
 * - verified null/empty: no staff record (customer or unauthorized).
 * - expected empty: no confirmation requested — any verified staff passes.
 * - otherwise the two must match.
 */
export function checkEmployeeRole(
  verifiedRole: string | null | undefined,
  expectedRole: string
): string | null {
  if (!verifiedRole) {
    return 'This account has no employee access. Customers should use Customer Login; staff access needs an account created by your Admin.'
  }
  let normalizedVerified = verifiedRole
  if (normalizedVerified === 'manager') normalizedVerified = 'admin'
  if (normalizedVerified === 'salesperson') normalizedVerified = 'sales_agent'

  const expected = (expectedRole || '').trim()
  if (!expected) return null

  let normalizedExpected = expected
  if (normalizedExpected === 'salesperson') normalizedExpected = 'sales_agent'

  if (normalizedVerified !== normalizedExpected) {
    return `Role mismatch: this account is verified as ${roleLabel(normalizedVerified)}, not ${roleLabel(normalizedExpected)}. Please pick the matching role or contact your Admin.`
  }
  return null
}
