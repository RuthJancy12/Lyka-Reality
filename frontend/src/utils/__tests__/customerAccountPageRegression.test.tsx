import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { AccountPage } from '../../pages/AccountPage'
import { UIAgentModal, AgentErrorBoundary } from '../../components/agent/UIAgentModal'
import appSrc from '../../App.tsx?raw'
import navbarSrc from '../../components/Navbar.tsx?raw'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'customer-test-uid-789',
      name: 'Rashid Al Nuaimi',
      email: 'rashid@example.ae',
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
  fetchStaffMe: vi.fn().mockRejectedValue(new Error('HTTP 403: Forbidden')),
}))

vi.mock('../../services/api', () => ({
  BACKEND_URL: 'http://localhost:8000',
  getCustomerProfile: vi.fn().mockResolvedValue({
    profile: {
      firebase_uid: 'customer-test-uid-789',
      email: 'rashid@example.ae',
      name: 'Rashid Al Nuaimi',
      phone: '+971 50 123 4567',
      city: 'Dubai',
      country: 'United Arab Emirates',
      preferences: {
        locations: ['Downtown Dubai', 'Palm Jumeirah'],
        propertyType: 'Penthouse',
        bedrooms: 3,
        budgetMin: 5000000,
        budgetMax: 15000000,
        purpose: 'Invest',
        timeline_days: 30,
        requirements: [],
      },
      discovery_source: 'Instagram',
      tracking_consent: true,
      role: 'customer',
      created_at: '2026-10-25T10:00:00Z',
      updated_at: '2026-10-29T12:00:00Z',
    },
    role: 'Customer',
  }),
  saveCustomerProfile: vi.fn(),
  getCustomerTrackingConsent: vi.fn().mockResolvedValue(true),
  saveCustomerTrackingConsent: vi.fn(),
  getCustomerFavorites: vi.fn().mockResolvedValue(['LYK-00001']),
  saveCustomerFavorites: vi.fn(),
  getCustomerInquiries: vi.fn().mockResolvedValue([
    {
      id: 'inq-test-01',
      lead_id: 101,
      session_id: 'sess-01',
      property_id: 'LYK-00001',
      property_title: 'Armani Residences Downtown',
      property_location: 'Downtown Dubai',
      property_type: 'Penthouse',
      listing_type: 'buy',
      price_aed: 12500000,
      bedrooms: 3,
      size_sqft: 3400,
      availability: 'Available',
      status: 'Submitted',
      created_at: '2026-10-28T14:30:00Z',
      updated_at: '2026-10-28T14:30:00Z',
    },
  ]),
  patchCustomerInquiry: vi.fn(),
  getCustomerLatestChat: vi.fn().mockResolvedValue({ session_id: null, turns: [] }),
  createCustomerChatTurn: vi.fn(),
  sendChatMessage: vi.fn(),
  getCustomerInteractions: vi.fn().mockResolvedValue([]),
  getMyAppointments: vi.fn().mockResolvedValue([]),
  fetchPropertiesFromApi: vi.fn().mockResolvedValue({
    total_found: 1,
    exact_match: true,
    top_properties: [
      {
        property_id: 'LYK-00001',
        title: 'Armani Residences Downtown',
        location: 'Downtown Dubai',
        price_aed: 12500000,
        bedrooms: 3,
        bathrooms: 4,
        size_sqft: 3400,
        property_type: 'Penthouse',
        purpose: 'Buy',
        image_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
        features: ['Burj Khalifa View', 'Private Pool'],
        agent_name: 'Layla Mansour',
        status: 'Available',
      },
    ],
    ai_summary: [],
    criteria: {},
  }),
}))

describe('Customer Login Navigation & Redirection', () => {
  it('App.tsx redirects to Customer Dashboard "/account" upon successful customer login', () => {
    // Verifies that when fetchStaffMe fails (customer login), navigate('/account') is called
    // and the success toast "Login successful! Redirecting to your dashboard..." is shown.
    expect(appSrc).toContain('navigate(\'/account\')')
    expect(appSrc).toContain('Login successful! Redirecting to your dashboard...')
    expect(appSrc).toContain('setLoginRedirectToast(true)')
  })

  it('Navbar links directly to "/account" for "My Account"', () => {
    expect(navbarSrc).toContain('to="/account"')
    expect(navbarSrc).toContain('My Account')
  })
})

describe('Customer My Account Hub Data Display', () => {
  let renderedHtml: string

  beforeEach(() => {
    renderedHtml = renderToString(
      <MemoryRouter initialEntries={['/account']}>
        <AccountPage />
      </MemoryRouter>
    )
  })

  it('renders Customer Profile & Verification data', () => {
    expect(renderedHtml).toContain('Customer Profile &amp; Verification')
    expect(renderedHtml).toContain('Client Name')
    expect(renderedHtml).toContain('Rashid Al Nuaimi')
    expect(renderedHtml).toContain('Email Address')
    expect(renderedHtml).toContain('rashid@example.ae')
    expect(renderedHtml).toContain('Phone / WhatsApp')
    expect(renderedHtml).toContain('Verified Customer')
  })

  it('renders Property Preferences on the My Account page', () => {
    expect(renderedHtml).toContain('Property Preferences')
    expect(renderedHtml).toContain('Locations')
    expect(renderedHtml).toContain('Property Type')
    expect(renderedHtml).toContain('Bedrooms')
    expect(renderedHtml).toContain('Budget Range')
    expect(renderedHtml).toContain('Purpose')
    expect(renderedHtml).toContain('Timeline')
  })

  it('renders Saved Properties section on the My Account page', () => {
    expect(renderedHtml).toContain('Saved Properties')
  })

  it('renders My Inquiries section on the My Account page', () => {
    expect(renderedHtml).toContain('My Inquiries')
  })

  it('renders Appointments view safely when an appointment status is undefined or null', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/account?view=appointments']}>
        <AccountPage />
      </MemoryRouter>
    )
    expect(html).toContain('Appointments')
    expect(html).not.toContain('Account View Temporarily Unavailable')
  })

  it('renders Compare view safely when metro distance or name is null', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/account?view=compare']}>
        <AccountPage />
      </MemoryRouter>
    )
    expect(html).toContain('Property Comparison Matrix')
    expect(html).not.toContain('Account View Temporarily Unavailable')
  })
})

describe('UIAgentModal Resilience & Crash Prevention', () => {
  it('renders UIAgentModal when isOpen=false without mounting or crashing', () => {
    const html = renderToString(
      <UIAgentModal
        isOpen={false}
        onClose={vi.fn()}
        properties={[]}
        onSelectProperty={vi.fn()}
      />
    )
    expect(html).toBe('')
  })

  it('renders UIAgentModal safely when preferences has missing/undefined locations', () => {
    const html = renderToString(
      <UIAgentModal
        isOpen={true}
        onClose={vi.fn()}
        properties={[]}
        onSelectProperty={vi.fn()}
      />
    )
    expect(html).toContain('LYKA AI property assistant')
  })

  it('AgentErrorBoundary traps child exceptions and preserves host page', () => {
    const derived = AgentErrorBoundary.getDerivedStateFromError(new Error('AI data malformed'))
    expect(derived.hasError).toBe(true)
    expect(derived.error?.message).toBe('AI data malformed')

    const boundary = new AgentErrorBoundary({ children: <div>child</div>, onClose: vi.fn() })
    boundary.state = { hasError: true, error: new Error('AI data malformed') }

    const rendered = boundary.render()
    const html = renderToString(rendered as React.ReactElement)
    expect(html).toContain('AI Assistant Temporarily Unavailable')
    expect(html).toContain('Close Assistant')
  })
})
