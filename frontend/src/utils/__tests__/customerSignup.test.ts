import { describe, it, expect } from 'vitest'
import { validateCustomerProfile } from '../customerProfile'
import {
  PURPOSE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  TIMELINE_OPTIONS,
  emptyPreferencesForm,
  validatePreferencesForm,
  buildPreferencesPayload,
  preferencesToForm,
} from '../customerPreferences'
import { DISCOVERY_SOURCES } from '../leadSource'
import { requestDeviceLocation } from '../deviceLocation'
// Raw sources for structural guards (vite ?raw — no node APIs).
import authModalSrc from '../../components/AuthModal.tsx?raw'
import accountSrc from '../../pages/AccountPage.tsx?raw'
import discoverySelectSrc from '../../components/DiscoverySourceSelect.tsx?raw'

const modal: string = authModalSrc
const account: string = accountSrc

describe('signup profile validation (country)', () => {
  it('accepts missing or valid country values', () => {
    expect(validateCustomerProfile({ name: 'Sara' })).toBeNull()
    expect(
      validateCustomerProfile({ name: 'Sara', country: 'United Arab Emirates' })
    ).toBeNull()
  })

  it('rejects oversized country values', () => {
    expect(
      validateCustomerProfile({ name: 'Sara', country: 'c'.repeat(101) })
    ).toMatch(/country/i)
  })
})

describe('preferences validation (all optional, never invented)', () => {
  it('accepts an untouched form', () => {
    expect(validatePreferencesForm(emptyPreferencesForm())).toBeNull()
  })

  it('accepts a complete valid form including Invest + timeline', () => {
    expect(
      validatePreferencesForm({
        purpose: 'Invest',
        propertyType: 'Apartment',
        bedrooms: '2',
        budgetMin: '1500000',
        budgetMax: '3000000',
        community: 'Dubai Marina',
        timelineDays: '90',
      })
    ).toBeNull()
  })

  it('rejects unlisted purpose / property type', () => {
    expect(
      validatePreferencesForm({ ...emptyPreferencesForm(), purpose: 'Flip' })
    ).toMatch(/purpose/i)
    expect(
      validatePreferencesForm({ ...emptyPreferencesForm(), propertyType: 'Castle' })
    ).toMatch(/property type/i)
    expect(PURPOSE_OPTIONS).toContain('Invest')
    expect(PROPERTY_TYPE_OPTIONS).toContain('Villa')
  })

  it('rejects bad bedrooms, budgets, community, and timeline', () => {
    expect(
      validatePreferencesForm({ ...emptyPreferencesForm(), bedrooms: 'two' })
    ).toMatch(/bedroom/i)
    expect(
      validatePreferencesForm({ ...emptyPreferencesForm(), budgetMin: '-5' })
    ).toMatch(/budget/i)
    expect(
      validatePreferencesForm({
        ...emptyPreferencesForm(),
        budgetMin: '5000000',
        budgetMax: '1000000',
      })
    ).toMatch(/minimum budget cannot be higher/i)
    expect(
      validatePreferencesForm({ ...emptyPreferencesForm(), community: 'x'.repeat(101) })
    ).toMatch(/community/i)
    expect(
      validatePreferencesForm({ ...emptyPreferencesForm(), timelineDays: 'soon' })
    ).toMatch(/timeline/i)
  })

  it('offers honest timeline labels (null stays null)', () => {
    const exploring = TIMELINE_OPTIONS.find((t) => t.label === 'Just exploring')
    expect(exploring?.days).toBeNull()
    expect(TIMELINE_OPTIONS.length).toBeGreaterThanOrEqual(4)
  })
})

describe('buildPreferencesPayload (undefined when nothing stated)', () => {
  it('returns undefined for an untouched form (backend keeps SQL row)', () => {
    expect(buildPreferencesPayload(emptyPreferencesForm())).toBeUndefined()
  })

  it('maps stated values including community, Invest, and timeline days', () => {
    const payload = buildPreferencesPayload({
      purpose: 'Invest',
      propertyType: 'Villa',
      bedrooms: '3',
      budgetMin: '',
      budgetMax: '5000000',
      community: 'Palm Jumeirah',
      timelineDays: '180',
    })
    expect(payload).toEqual({
      locations: ['Palm Jumeirah'],
      propertyType: 'Villa',
      bedrooms: 3,
      budgetMin: null,
      budgetMax: 5000000,
      purpose: 'Invest',
      timeline_days: 180,
    })
  })

  it('restores server prefs into the editor without inventing', () => {
    expect(preferencesToForm(null)).toEqual(emptyPreferencesForm())
    const form = preferencesToForm({
      locations: ['JVC'],
      propertyType: 'Apartment',
      bedrooms: 1,
      budgetMin: null,
      budgetMax: 2000000,
      purpose: 'Rent',
      timeline_days: 90,
    })
    expect(form).toEqual({
      purpose: 'Rent',
      propertyType: 'Apartment',
      bedrooms: '1',
      budgetMin: '',
      budgetMax: '2000000',
      community: 'JVC',
      timelineDays: '90',
    })
  })
})

describe('device location (permission-gated, never in SQL payloads)', () => {
  it('resolves honestly without throwing when unsupported', async () => {
    const res = await requestDeviceLocation(50)
    expect(['unsupported', 'unavailable', 'timeout', 'denied', 'granted']).toContain(res.status)
    if (res.status !== 'granted') {
      expect('latitude' in res).toBe(false)
    }
  })

  it('profile payloads carry no coordinates', () => {
    const payload = buildPreferencesPayload({
      ...emptyPreferencesForm(),
      community: 'Dubai Marina',
    })
    expect(JSON.stringify(payload)).not.toMatch(/latitude|longitude/i)
  })
})

describe('signup modal: awaited, backend-confirmed profile save (structural)', () => {
  it('collects country plus the full account set', () => {
    expect(modal).toMatch(/Country \(optional\)/)
    expect(modal).toMatch(/City \/ Community/)
    expect(modal).toMatch(/DiscoverySourceSelect/)
    // The shared dropdown carries the exact label and renders the six
    // allowlisted options from DISCOVERY_SOURCES.
    expect(discoverySelectSrc).toMatch(/How did you hear about LYKA Realty\?/)
    expect(discoverySelectSrc).toMatch(/DISCOVERY_SOURCES\.map/)
    expect(DISCOVERY_SOURCES).toEqual([
      'Google',
      'Instagram',
      'Facebook',
      'Friend/Referral',
      'Direct Website',
      'Other/Unknown',
    ])
    expect(modal).toMatch(/Phone \/ WhatsApp/)
  })

  it('runs an optional preferences step before saving', () => {
    expect(modal).toMatch(/Save &amp; Continue|Save & Continue/)
    expect(modal).toMatch(/Skip for now/)
    expect(modal).toMatch(/TIMELINE_OPTIONS|Timeline \(optional\)/)
  })

  it('shows loading, success, and retry states — never silent success', () => {
    expect(modal).toMatch(/Saving your profile/)
    expect(modal).toMatch(/profile saved/i)
    expect(modal).toMatch(/Retry saving profile/)
    expect(modal).toMatch(/Continue anyway/)
    expect(modal).toMatch(/Nothing was silently saved/)
  })

  it('awaits the backend save and never sends the password to SQL', () => {
    expect(modal).toMatch(/saveProfileOrThrow/)
    expect(modal).toMatch(/await saveCustomerProfile/)
    const start = modal.indexOf('const saveProfileOrThrow')
    const end = modal.indexOf('const runProfileSave')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(modal.slice(start, end)).not.toMatch(/password/i)
  })

  it('collects no role and requests location only via permission gate', () => {
    expect(modal).not.toMatch(/select[^>]*role|role[^>]*select/i)
    expect(modal).toMatch(/Use my current location/)
    expect(modal).toMatch(/requestDeviceLocation/)
  })
})

describe('account page: editable profile + preferences (structural)', () => {
  it('edits country alongside identity fields', () => {
    expect(account).toMatch(/lyka-profile-country/)
  })

  it('has an awaited preferences editor feeding recommendations', () => {
    expect(account).toMatch(/PreferencesEditor/)
    expect(account).toMatch(/Edit preferences/)
    expect(account).toMatch(/Save preferences/)
    expect(account).toMatch(/setPrefsTick/)
  })
})
