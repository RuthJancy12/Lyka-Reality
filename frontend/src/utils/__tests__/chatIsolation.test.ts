import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ownerKeyFor,
  getTabId,
  turnsKeyFor,
  lastSessionKeyFor,
  inquiriesKeyFor,
  favoritesKeyFor,
  profileKeyFor,
  ownerSessionIds,
  quarantineLegacyChatData,
  logTurn,
  getSessionTurns,
  getLastChatSessionId,
  getInquiries,
  logInquiry,
  hasInquiryForProperty,
  markInquiryContacted,
  saveLocalUser,
  getLocalUser,
  _resetMemoryStoreForTesting,
} from '../../services/chatStore'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v))
    },
    removeItem: (k: string) => {
      m.delete(k)
    },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as unknown as Storage
}

function freshStores() {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
}

beforeEach(() => {
  freshStores()
  vi.unstubAllGlobals()
  freshStores()
  _resetMemoryStoreForTesting()
})

const OWNER_A = 'uid:user-a'
const OWNER_B = 'uid:user-b'

describe('owner namespaces', () => {
  it('scopes signed-in users by Firebase UID', () => {
    expect(ownerKeyFor('user-a')).toBe('uid:user-a')
  })

  it('scopes guests per tab (stable reload, separate tabs)', () => {
    const g1 = ownerKeyFor(null)
    const g2 = ownerKeyFor(undefined)
    expect(g1).toBe(g2)
    expect(g1.startsWith('guest:')).toBe(true)
    // A new tab (fresh in-memory session) gets a different owner.
    _resetMemoryStoreForTesting()
    expect(ownerKeyFor(null)).not.toBe(g1)
  })

  it('derives distinct keys per owner', () => {
    expect(turnsKeyFor(OWNER_A, 's')).not.toBe(turnsKeyFor(OWNER_B, 's'))
    expect(lastSessionKeyFor(OWNER_A)).not.toBe(lastSessionKeyFor(OWNER_B))
    expect(inquiriesKeyFor(OWNER_A)).not.toBe(inquiriesKeyFor(OWNER_B))
    expect(favoritesKeyFor(OWNER_A)).not.toBe(favoritesKeyFor(OWNER_B))
    expect(profileKeyFor(OWNER_A)).not.toBe(profileKeyFor(OWNER_B))
  })

  it('getTabId is stable within a tab', () => {
    expect(getTabId()).toBe(getTabId())
  })
})

describe('chat history isolation', () => {
  it("never shows user A's turns to user B", () => {
    logTurn('sess-a', 'user', 'my secret budget', [], OWNER_A)
    expect(getSessionTurns('sess-a', OWNER_A).map((t) => t.text)).toEqual([
      'my secret budget',
    ])
    expect(getSessionTurns('sess-a', OWNER_B)).toEqual([])
    expect(getLastChatSessionId(OWNER_B)).toBeNull()
    expect(getLastChatSessionId(OWNER_A)).toBe('sess-a')
  })

  it('separates guest tabs from each other and from accounts', () => {
    const guestOwner = ownerKeyFor(null)
    logTurn('sess-g', 'user', 'guest question', [], guestOwner)
    expect(getSessionTurns('sess-g', OWNER_A)).toEqual([])
    expect(getLastChatSessionId(OWNER_A)).toBeNull()
    _resetMemoryStoreForTesting()
    const otherTab = ownerKeyFor(null)
    expect(getSessionTurns('sess-g', otherTab)).toEqual([])
  })

  it('enumerates only the requesting owner sessions', () => {
    logTurn('s1', 'user', 'a', [], OWNER_A)
    logTurn('s2', 'user', 'b', [], OWNER_B)
    expect(ownerSessionIds(OWNER_A)).toEqual(['s1'])
    expect(ownerSessionIds(OWNER_B)).toEqual(['s2'])
  })
})

describe('legacy-data quarantine (preserve, never misattribute)', () => {
  it('moves pre-isolation keys aside with values intact', () => {
    localStorage.setItem('lyka_chat_turns_oldsess', JSON.stringify([{ _id: 'm1' }]))
    localStorage.setItem('lyka_last_chat_session', JSON.stringify('oldsess'))
    localStorage.setItem('lyka_inquiries', JSON.stringify([{ _id: 'q1' }]))
    localStorage.setItem('lyka_favorites', JSON.stringify(['LYK-1']))
    localStorage.setItem('lyka_profile_user', JSON.stringify({ _id: 'u1' }))

    const moved = quarantineLegacyChatData()
    expect(moved.length).toBe(5)
    // Originals gone, quarantined copies byte-identical.
    expect(localStorage.getItem('lyka_chat_turns_oldsess')).toBeNull()
    expect(localStorage.getItem('lyka_last_chat_session')).toBeNull()
    expect(JSON.parse(localStorage.getItem('lyka_legacy_lyka_chat_turns_oldsess')!)).toEqual([
      { _id: 'm1' },
    ])
    expect(JSON.parse(localStorage.getItem('lyka_legacy_lyka_inquiries')!)).toEqual([
      { _id: 'q1' },
    ])
    // Second run is a no-op (flag set).
    expect(quarantineLegacyChatData()).toEqual([])
  })

  it('never displays legacy rows to any owner', () => {
    localStorage.setItem('lyka_inquiries', JSON.stringify([{ _id: 'legacy-q' }]))
    expect(getInquiries(OWNER_A)).toEqual([])
    expect(hasInquiryForProperty('LYK-9', OWNER_A)).toBe(false)
  })
})

describe('inquiry isolation', () => {
  const input = {
    sessionId: 's',
    propertyId: 'LYK-1',
    propertyTitle: 'T',
    propertyLocation: 'Marina',
    propertyType: 'Apartment',
    listingType: 'Sale',
    priceAed: 100,
    bedrooms: 1,
    sizeSqft: 500,
    availability: 'Ready',
  }

  it('keeps inquiries per owner', () => {
    logInquiry({ ...input }, OWNER_A)
    expect(getInquiries(OWNER_A)).toHaveLength(1)
    expect(getInquiries(OWNER_B)).toEqual([])
    expect(hasInquiryForProperty('LYK-1', OWNER_A)).toBe(true)
    expect(hasInquiryForProperty('LYK-1', OWNER_B)).toBe(false)
  })

  it('marks contacted within the owner list only', () => {
    const doc = logInquiry({ ...input }, OWNER_A)!
    logInquiry({ ...input, propertyId: 'LYK-2' }, OWNER_B)
    markInquiryContacted(doc._id, OWNER_A)
    expect(getInquiries(OWNER_A)[0].status).toBe('Contacted')
    expect(getInquiries(OWNER_B)[0].status).toBe('Submitted')
  })
})

describe('customer profile ownership (name/email/phone/city)', () => {
  it('round-trips city per owner without crossover', () => {
    saveLocalUser(
      { name: 'Ann', email: 'ann@x.co', phone: '+1', city: 'Dubai Marina' },
      OWNER_A
    )
    saveLocalUser({ name: 'Ben', email: 'ben@x.co' }, OWNER_B)
    expect(getLocalUser(OWNER_A)).toMatchObject({
      name: 'Ann',
      phone: '+1',
      city: 'Dubai Marina',
    })
    expect(getLocalUser(OWNER_B)).toMatchObject({ name: 'Ben' })
    expect(getLocalUser(OWNER_B)?.city).toBeUndefined()
  })
})
