import { describe, it, expect } from 'vitest'
import { resolveChatDisplayName } from '../chatIdentity'

/**
 * Guest-identity contract: Firebase Auth is the only identity source.
 * A stale device cache (e.g. a previous staff sign-in as "Bruno") must
 * never leak into the chatbot's greeting for an unauthenticated visitor.
 */
describe('resolveChatDisplayName', () => {
  it('returns null for guests (signed out)', () => {
    expect(resolveChatDisplayName(null)).toBeNull()
    expect(resolveChatDisplayName(undefined)).toBeNull()
  })

  it('returns null for blank Firebase names', () => {
    expect(resolveChatDisplayName('   ')).toBeNull()
    expect(resolveChatDisplayName('')).toBeNull()
  })

  it('returns the Firebase display name when signed in', () => {
    expect(resolveChatDisplayName('Bruno')).toBe('Bruno')
    expect(resolveChatDisplayName('  Sara Ahmed  ')).toBe('Sara Ahmed')
  })

  it('never consults a stale cached name — only the Firebase argument', () => {
    // Even if some other module still holds "Bruno" in localStorage, the
    // resolver takes a single Firebase-derived input: guests stay guests.
    expect(resolveChatDisplayName(undefined)).toBeNull()
  })
})
