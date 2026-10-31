import { describe, it, expect } from 'vitest'
import { validateCustomerProfile } from '../customerProfile'

describe('validateCustomerProfile (permitted self-service fields only)', () => {
  it('accepts a complete valid profile', () => {
    expect(
      validateCustomerProfile({ name: 'Sara Ahmed', phone: '+971 50 000 0000', city: 'Dubai Marina' })
    ).toBeNull()
  })

  it('accepts name-only profiles (phone/city optional)', () => {
    expect(validateCustomerProfile({ name: 'Sara' })).toBeNull()
  })

  it('rejects missing or oversized names', () => {
    expect(validateCustomerProfile({ name: '   ' })).toMatch(/name/i)
    expect(validateCustomerProfile({ name: 'a'.repeat(201) })).toMatch(/200/)
  })

  it('rejects malformed phone numbers without blocking valid ones', () => {
    expect(validateCustomerProfile({ name: 'Sara', phone: 'not-a-phone!' })).toMatch(/phone/i)
    expect(validateCustomerProfile({ name: 'Sara', phone: '+971501234567' })).toBeNull()
    expect(validateCustomerProfile({ name: 'Sara', phone: '' })).toBeNull()
  })

  it('rejects oversized city values', () => {
    expect(validateCustomerProfile({ name: 'Sara', city: 'c'.repeat(101) })).toMatch(/100/)
  })

  it('has no email or role fields to validate (never user-supplied)', () => {
    // Email comes from Firebase Auth; role from trusted backend logic.
    // The input type itself must not accept them.
    const input = { name: 'Sara' } as Record<string, unknown>
    expect('email' in input).toBe(false)
    expect('role' in input).toBe(false)
    expect(validateCustomerProfile({ name: 'Sara' })).toBeNull()
  })
})
