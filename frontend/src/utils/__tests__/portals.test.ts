import { describe, it, expect } from 'vitest'
import navbarSrc from '../../components/Navbar.tsx?raw'
import lykaAuthPanelSrc from '../../components/agent/LykaAuthPanel.tsx?raw'
import requireStaffSrc from '../../crm/components/RequireStaff.tsx?raw'
import staffApiSrc from '../../crm/services/staffApi.ts?raw'

const navbar: string = navbarSrc
const authPanel: string = lykaAuthPanelSrc

describe('separate customer and staff entry points', () => {
  it('navbar exposes a customer account entry and a staff CRM entry', () => {
    expect(navbar).toContain('to="/account"')
    expect(navbar).toContain('My Account')
    expect(navbar).toContain('to="/crm"')
    expect(navbar).toContain('Staff CRM')
  })

  it('registration collects identity only — staff check never grants', () => {
    // Customer (default) flow has no role control at all.
    expect(authPanel).toContain('staffPortal &&')
    // The staff-portal select is an optional confirmation only: it is
    // verified against the backend record and blocks on mismatch.
    expect(authPanel).toContain('Expected role (optional check)')
    expect(authPanel).toContain('fetchStaffMe')
    expect(authPanel).toContain('Role mismatch')
    expect(authPanel).toContain('It never grants access by itself')
  })
})

describe('staff gate resolves roles backend-side only', () => {
  it('RequireStaff depends on the server-verified role hook', () => {
    expect(requireStaffSrc).toContain('useStaffRole')
    expect(requireStaffSrc).not.toMatch(/localStorage\.getItem\(['"]lyka.*role/i)
  })

  it('staffApi documents backend-only role resolution', () => {
    expect(staffApiSrc).toMatch(/backend.*verified|verified.*backend/i)
  })
})
