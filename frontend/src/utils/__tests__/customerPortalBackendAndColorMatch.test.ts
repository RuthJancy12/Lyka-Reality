import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import accountSrc from '../../pages/AccountPage.tsx?raw'
import apiSrc from '../../services/api.ts?raw'

const ROOT = process.cwd()
const accountCss = readFileSync(join(ROOT, 'src/pages/AccountPage.css'), 'utf8')

describe('Customer Portal Colour Match & Design System', () => {
  it('lightens the dashboard hero banner with warm cream, white, and subtle gold borders', () => {
    expect(accountCss).toContain('.uae-dashboard-hero')
    // Uses light warm cream and surface gradient instead of dark plum fill
    expect(accountCss).toMatch(/background:\s*linear-gradient\(135deg,\s*#FFFFFF\s*0%,\s*var\(--champagne-light\)/)
    expect(accountCss).toContain('var(--gold-border-solid)')
    // Heading uses dark plum Playfair Display text
    expect(accountCss).toMatch(/\.uae-hero-heading[\s\S]*?color:\s*var\(--plum-main\)/)
  })

  it('uses the dark plum sidebar foundation with gold navigation accents', () => {
    expect(accountCss).toContain('.portal-sidebar')
    // Dark plum foundation (light text remains readable)
    expect(accountCss).toMatch(/background:\s*linear-gradient\(180deg,\s*var\(--plum-deep\)\s*0%,\s*var\(--plum-main\)\s*60%,\s*var\(--plum-surface\)/)
    expect(accountCss).toContain('.portal-nav-link.active')
    expect(accountCss).toMatch(/color:\s*var\(--gold-hover\)/)
  })

  it('styles selected amenity chips and active budget presets with light champagne gold', () => {
    expect(accountCss).toMatch(/\.amenity-chip\.selected[\s\S]*?background:\s*var\(--gold-light\)/)
    expect(accountCss).toMatch(/\.amenity-chip\.selected[\s\S]*?border-color:\s*var\(--gold-primary\)/)
    expect(accountCss).toMatch(/\.budget-preset-btn\.active[\s\S]*?background:\s*var\(--gold-light\)/)
    expect(accountCss).toMatch(/\.budget-preset-btn\.active[\s\S]*?border-color:\s*var\(--gold-primary\)/)
  })

  it('keeps luxury cards and metric boxes clean white with subtle champagne borders', () => {
    expect(accountCss).toMatch(/\.uae-card\s*\{[\s\S]*?background:\s*#FFFFFF/)
    expect(accountCss).toMatch(/\.uae-card\s*\{[\s\S]*?border:\s*1px solid var\(--champagne-border\)/)
    expect(accountCss).toMatch(/\.uae-stat-box\s*\{[\s\S]*?background:\s*#FFFFFF/)
  })
})

describe('Customer Portal Backend Data Integration', () => {
  it('api.ts exports all 8 customer self-service backend endpoints', () => {
    expect(apiSrc).toContain('export async function getCustomerFavorites')
    expect(apiSrc).toContain('export async function saveCustomerFavorites')
    expect(apiSrc).toContain('export async function getCustomerInquiries')
    expect(apiSrc).toContain('export async function patchCustomerInquiry')
    expect(apiSrc).toContain('export async function getCustomerLatestChat')
    expect(apiSrc).toContain('export async function getCustomerInteractions')
    expect(apiSrc).toContain('export async function getCustomerTrackingConsent')
    expect(apiSrc).toContain('export async function saveCustomerTrackingConsent')
  })

  it('AccountPage connects all 10 customer portal views to backend data', () => {
    // 1. Dashboard: pulls real counts from favorites, inquiries, appointments, convo
    expect(accountSrc).toContain('favorites.length')
    expect(accountSrc).toContain('inquiries.length')
    expect(accountSrc).toContain('appointments.length')
    expect(accountSrc).toContain('convo.count')

    // 2. My Account: loads and saves customer profile & trusted role
    expect(accountSrc).toContain('getCustomerProfile')
    expect(accountSrc).toContain('saveCustomerProfile')

    // 3. Saved Homes: synchronizes favorites with backend
    expect(accountSrc).toContain('getCustomerFavorites')
    expect(accountSrc).toContain('saveCustomerFavorites')

    // 4. Saved Searches: persists multi-requirement briefs to backend preferences
    expect(accountSrc).toContain('RequirementsEditor')
    expect(accountSrc).toContain('savedRequirements')

    // 5. Recently Viewed: synchronizes interaction views with backend
    expect(accountSrc).toContain('getCustomerInteractions')
    expect(accountSrc).toContain('backendInteractions')

    // 6. My Inquiries: queries backend inquiries and allows withdrawal via patchCustomerInquiry
    expect(accountSrc).toContain('getCustomerInquiries')
    expect(accountSrc).toContain('patchCustomerInquiry')
    expect(accountSrc).toContain('handleWithdrawInquiry')

    // 7. Appointments: queries private viewings & consultations
    expect(accountSrc).toContain('getMyAppointments')

    // 8. Compare Properties: side-by-side comparison matrix of selected properties
    expect(accountSrc).toContain('compare-table')
    expect(accountSrc).toContain('comparedProperties')

    // 9. Messages: loads latest authenticated AI concierge conversation turns
    expect(accountSrc).toContain('getCustomerLatestChat')
    expect(accountSrc).toContain('backendChat')

    // 10. Settings: persists tracking consent preference to backend
    expect(accountSrc).toContain('getCustomerTrackingConsent')
    expect(accountSrc).toContain('saveCustomerTrackingConsent')
  })
})
