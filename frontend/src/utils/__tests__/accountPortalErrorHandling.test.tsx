import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { AccountPage, PortalErrorBoundary } from '../../pages/AccountPage'
import { classifyLeadChannel } from '../leadSource'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'customer-test-uid-456',
      name: 'Amira Al Mansoori',
      email: 'amira@example.ae',
      photoURL: null,
      providers: ['password', 'google.com'],
    },
    authLoading: false,
    linkPassword: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../../crm/services/staffApi', () => ({
  useStaffRole: () => ({ role: null, loading: false }),
  clearStaffMeCache: vi.fn(),
  listAssignments: vi.fn().mockResolvedValue([]),
  listFollowUps: vi.fn().mockResolvedValue([]),
  listViewings: vi.fn().mockResolvedValue([]),
  listCalls: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../services/api', () => ({
  BACKEND_URL: 'http://localhost:8000',
  getCustomerProfile: vi.fn().mockResolvedValue({ profile: null, role: 'Customer' }),
  saveCustomerProfile: vi.fn(),
  getCustomerTrackingConsent: vi.fn().mockResolvedValue(true),
  saveCustomerTrackingConsent: vi.fn(),
  getCustomerFavorites: vi.fn().mockResolvedValue([]),
  saveCustomerFavorites: vi.fn(),
  getCustomerInquiries: vi.fn().mockResolvedValue([]),
  patchCustomerInquiry: vi.fn(),
  getCustomerLatestChat: vi.fn().mockResolvedValue({ session_id: null, turns: [] }),
  createCustomerChatTurn: vi.fn(),
  sendChatMessage: vi.fn(),
  getCustomerInteractions: vi.fn().mockResolvedValue([]),
  getMyAppointments: vi.fn().mockResolvedValue([]),
  fetchPropertiesFromApi: vi.fn().mockResolvedValue({ top_properties: [], total_count: 0 }),
}))

describe('PortalErrorBoundary Resilience & Recovery', () => {
  it('catches runtime child errors and renders the luxury unavailable message', () => {
    const derived = PortalErrorBoundary.getDerivedStateFromError(new Error('Simulated failure'))
    expect(derived.hasError).toBe(true)
    expect(derived.error?.message).toBe('Simulated failure')

    const boundary = new PortalErrorBoundary({ children: <div>child</div> })
    boundary.state = { hasError: true, error: new Error('Simulated failure'), retryCount: 0 }

    const rendered = boundary.render()
    const html = renderToString(rendered as React.ReactElement)

    expect(html).toContain('Account View Temporarily Unavailable')
    expect(html).toContain('We encountered an issue displaying this page')
    expect(html).toContain('Try Again')
    expect(html).toContain('Return to Site')
    expect(html).toContain('gold-btn')
    expect(html).toContain('outline-navy-btn')
  })

  it('handleRetry resets state and executes onRetry callback', () => {
    const onRetry = vi.fn()
    const boundary = new PortalErrorBoundary({ children: <div>child</div>, onRetry })
    boundary.state = { hasError: true, error: new Error('test crash'), retryCount: 0 }

    boundary.handleRetry()
    expect(boundary.state.hasError).toBe(false)
    expect(boundary.state.error).toBe(null)
    expect(boundary.state.retryCount).toBe(1)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('handleReturnToSite executes onNavigateHome callback', () => {
    const onNavigateHome = vi.fn()
    const boundary = new PortalErrorBoundary({ children: <div>child</div>, onNavigateHome })

    boundary.handleReturnToSite()
    expect(onNavigateHome).toHaveBeenCalledTimes(1)
  })
})

describe('Null-safe helpers', () => {
  it('classifyLeadChannel safely defaults to Direct when source is null or undefined', () => {
    expect(classifyLeadChannel(null)).toBe('Direct')
    expect(classifyLeadChannel(undefined)).toBe('Direct')
    expect(classifyLeadChannel({})).toBe('Direct')
  })
})

describe('AccountPage views rendering under customer auth', () => {
  const views = [
    'dashboard',
    'account',
    'favorites',
    'saved-searches',
    'recent',
    'inquiries',
    'appointments',
    'compare',
    'messages',
    'settings',
  ]

  for (const view of views) {
    it(`renders ${view} view without crashing`, () => {
      const html = renderToString(
        <MemoryRouter initialEntries={[`/account?view=${view}`]}>
          <AccountPage />
        </MemoryRouter>
      )
      expect(html).toContain('portal-layout')
      expect(html).toContain('Amira Al Mansoori')
    })
  }
})
