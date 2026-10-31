import { describe, it, expect } from 'vitest'
import accountSrc from '../../pages/AccountPage.tsx?raw'
import authModalSrc from '../../components/AuthModal.tsx?raw'
import {
  UAE_PRIME_COMMUNITIES,
  BATHROOM_OPTIONS,
  FURNISHING_OPTIONS,
  UAE_LUXURY_AMENITIES,
  LUXURY_BUDGET_PRESETS,
} from '../uaePreferences'

describe('Customer Portal Dashboard & Navigation', () => {
  it('contains dark plum sidebar with all 10 required navigation items', () => {
    expect(accountSrc).toContain('portal-sidebar')
    // 1. Dashboard
    expect(accountSrc).toMatch(/<span>Dashboard<\/span>/)
    // 2. My Account
    expect(accountSrc).toMatch(/<span>My Account<\/span>/)
    // 3. Saved Homes
    expect(accountSrc).toMatch(/<span>Saved Homes<\/span>/)
    // 4. Saved Searches
    expect(accountSrc).toMatch(/<span>Saved Searches<\/span>/)
    // 5. Recently Viewed
    expect(accountSrc).toMatch(/<span>Recently Viewed<\/span>/)
    // 6. My Inquiries
    expect(accountSrc).toMatch(/<span>My Inquiries<\/span>/)
    // 7. Appointments
    expect(accountSrc).toMatch(/<span>Appointments<\/span>/)
    // 8. Compare Properties
    expect(accountSrc).toMatch(/<span>Compare Properties<\/span>/)
    // 9. Messages
    expect(accountSrc).toMatch(/<span>Messages<\/span>/)
    // 10. Settings
    expect(accountSrc).toMatch(/<span>Settings<\/span>/)
  })

  it('renders executive UAE dashboard hero banner and 4 top metric cards', () => {
    expect(accountSrc).toContain('uae-dashboard-hero')
    expect(accountSrc).toContain('uae-stats-grid')
    expect(accountSrc).toContain('Saved Homes')
    expect(accountSrc).toContain('My Inquiries')
    expect(accountSrc).toContain('Appointments')
    expect(accountSrc).toContain('Advisor Messages')
  })
})

describe('Property Preferences & UAE Options', () => {
  it('defines comprehensive UAE prime communities', () => {
    expect(UAE_PRIME_COMMUNITIES).toContain('Dubai Marina')
    expect(UAE_PRIME_COMMUNITIES).toContain('Palm Jumeirah')
    expect(UAE_PRIME_COMMUNITIES).toContain('Downtown Dubai')
    expect(UAE_PRIME_COMMUNITIES).toContain('Dubai Hills Estate')
    expect(UAE_PRIME_COMMUNITIES).toContain('Business Bay')
  })

  it('defines luxury amenities with priority support', () => {
    const ids = UAE_LUXURY_AMENITIES.map((a) => a.id)
    expect(ids).toContain('swimming_pool')
    expect(ids).toContain('gym')
    expect(ids).toContain('parking')
    expect(ids).toContain('balcony')
    expect(ids).toContain('garden')
    expect(ids).toContain('security')
    expect(ids).toContain('play_area')
    expect(ids).toContain('pet_friendly')
    expect(ids).toContain('sea_view')
    expect(ids).toContain('smart_home')
  })

  it('AccountPage includes Must-Have and Nice-to-Have priority toggle', () => {
    expect(accountSrc).toContain('Must-Have')
    expect(accountSrc).toContain('Nice-to-Have')
    expect(accountSrc).toContain('priority-toggle-btn')
  })

  it('AccountPage includes luxury budget presets', () => {
    expect(LUXURY_BUDGET_PRESETS.length).toBeGreaterThanOrEqual(4)
    expect(accountSrc).toContain('budget-preset-btn')
  })

  it('AccountPage includes bathrooms and furnishing selectors', () => {
    expect(BATHROOM_OPTIONS.length).toBeGreaterThanOrEqual(5)
    expect(FURNISHING_OPTIONS.length).toBeGreaterThanOrEqual(3)
    expect(accountSrc).toContain('Bathrooms')
    expect(accountSrc).toContain('Furnishing')
  })
})

describe('Property Comparison Matrix', () => {
  it('includes compare-table side-by-side matrix structure', () => {
    expect(accountSrc).toContain('compare-table')
    expect(accountSrc).toContain('Price (AED)')
    expect(accountSrc).toContain('Price / Sqft')
    expect(accountSrc).toContain('Type &amp; Purpose')
    expect(accountSrc).toContain('Bedrooms &amp; Baths')
    expect(accountSrc).toContain('Built-up Area')
    expect(accountSrc).toContain('Metro Access')
  })
})

describe('New Customer Registration Flow', () => {
  it('AuthModal includes quick community selection chips', () => {
    expect(authModalSrc).toContain('Dubai Marina')
    expect(authModalSrc).toContain('Palm Jumeirah')
    expect(authModalSrc).toContain('Downtown Dubai')
    expect(authModalSrc).toContain('Dubai Hills Estate')
  })
})
