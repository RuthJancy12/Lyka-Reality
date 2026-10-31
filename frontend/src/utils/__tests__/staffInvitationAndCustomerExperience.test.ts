import { describe, it, expect } from 'vitest'
import appSrc from '../../App.tsx?raw'
import navbarSrc from '../../components/Navbar.tsx?raw'
import staffAreaSrc from '../../crm/pages/StaffArea.tsx?raw'
import teamSrc from '../../crm/pages/Team.tsx?raw'
import staffApiSrc from '../../crm/services/staffApi.ts?raw'

describe('Task 1: Staff invitation & creation frontend workflow', () => {
  it('staffApi supports password parameter and returns invitation_link and message', () => {
    expect(staffApiSrc).toContain('password?: string')
    expect(staffApiSrc).toContain('invitation_link?: string | null')
    expect(staffApiSrc).toContain('message?: string | null')
  })

  it('Team page provides password input with show/hide toggle and invitation link copy', () => {
    expect(teamSrc).toContain('Initial password (optional)')
    expect(teamSrc).toContain('creationSuccess')
    expect(teamSrc).toContain('invitationLink')
    expect(teamSrc).toContain('copyToClipboard')
    expect(teamSrc).toContain('Copy Link')
  })

  it('Team page explains that absence of SMTP provider means setup link must be shared directly', () => {
    expect(teamSrc).toMatch(/An external email provider is not configured/i)
  })
})

describe('Task 3: Customer login welcome message', () => {
  it('App.tsx maintains customerWelcomeToast state with auto-dismiss timer', () => {
    expect(appSrc).toContain('customerWelcomeToast')
    expect(appSrc).toContain('setCustomerWelcomeToast')
    expect(appSrc).toContain('setTimeout')
    expect(appSrc).toContain('6000')
  })

  it('App.tsx triggers customer welcome toast on AuthModal success for non-staff logins', () => {
    expect(appSrc).toMatch(/fetchStaffMe\(\)\s*\.then\(\(\)\s*=>\s*\{\s*navigate\('\/'\)\s*\}\)\s*\.catch\(\(\)\s*=>\s*\{\s*\/\/\s*Customer authenticated:[\s\S]*?setCustomerWelcomeToast\(/)
  })

  it('Toast personalizes with customer name safely and supports first-time vs returning customer messaging', () => {
    expect(appSrc).toContain('Welcome to LYKA Realty, ${customerWelcomeToast.name}!')
    expect(appSrc).toContain('Welcome to LYKA Realty!')
    expect(appSrc).toContain('Welcome back, ${customerWelcomeToast.name}!')
    expect(appSrc).toContain('Welcome back!')
  })

  it('Employee login does NOT display the customer welcome toast', () => {
    // EmployeeLogin success directly navigates to / and never calls setCustomerWelcomeToast
    const start = appSrc.indexOf('<EmployeeLogin')
    const end = appSrc.indexOf('/>', start)
    const employeeLoginBlock = appSrc.slice(start, end)
    expect(employeeLoginBlock).not.toContain('setCustomerWelcomeToast')
    expect(employeeLoginBlock).toContain("navigate('/')")
  })

  it('Toast is dismissible with accessible close button', () => {
    expect(appSrc).toContain('aria-label="Close welcome message"')
    expect(appSrc).toContain('role="status"')
    expect(appSrc).toContain('aria-live="polite"')
  })
})

describe('Task 4: Customer exclusion from Staff CRM', () => {
  it('Navbar only displays Staff CRM link for verified staff roles', () => {
    expect(navbarSrc).toContain('useStaffRole')
    expect(navbarSrc).toContain('isStaff')
    expect(navbarSrc).toMatch(/\{isStaff\s*&&\s*\(\s*<Link\s+to="\/crm"/)
  })

  it('StaffArea gates customers at top-level before rendering the CRM shell or sidebar', () => {
    // StaffArea checks useStaffRole and renders customer access gate directly if !role
    expect(staffAreaSrc).toMatch(/if\s*\(!role\)\s*\{\s*return\s*\(/)
    expect(staffAreaSrc).toContain('Staff CRM Access Required')
    expect(staffAreaSrc).toContain('Go to Customer Portal')
    expect(staffAreaSrc).toContain('to="/account"')
  })
})
