import { describe, it, expect } from 'vitest'
// Raw sources for behavior guards (vite ?raw — no node APIs).
import appSrc from '../../App.tsx?raw'
import orbSrc from '../../components/agent/VoiceAgentControl.tsx?raw'
import modalSrc from '../../components/agent/UIAgentModal.tsx?raw'
import authModalSrc from '../../components/AuthModal.tsx?raw'
import staffAreaSrc from '../../crm/pages/StaffArea.tsx?raw'
import requireStaffSrc from '../../crm/components/RequireStaff.tsx?raw'

const app: string = appSrc
const orb: string = orbSrc
const modal: string = modalSrc
const authModal: string = authModalSrc
const staffArea: string = staffAreaSrc
const requireStaff: string = requireStaffSrc

describe('welcome navigation never auto-opens the chatbot', () => {
  it('Get Started only dismisses to the home page', () => {
    const start = app.indexOf('onGetStarted')
    const end = app.indexOf('onExplore', start)
    expect(start).toBeGreaterThan(-1)
    const handler = app.slice(start, end)
    expect(handler).toContain('dismissWelcome')
    expect(handler).not.toContain('handleOpenAgent')
    expect(handler).not.toContain('setIsAgentOpen')
  })

  it('the ?chat=1 deep link is consumed so refresh cannot reopen chat', () => {
    expect(app).toContain("params.get('chat') === '1'")
    expect(app).toContain('navigate(location.pathname, { replace: true })')
  })

  it('the floating button has no auto-open effects or timers', () => {
    expect(orb).not.toContain('useEffect')
    expect(orb).not.toContain('setInterval')
    expect(orb).not.toContain('setTimeout')
    expect(orb).toContain('onOpenAgent')
  })

  it('the chat modal never renders itself open', () => {
    expect(modal).toContain('if (!isOpen) return null')
  })

  it('only explicit user actions open the chat', () => {
    const openers = (app.match(/setIsAgentOpen\(true\)/g) || []).length
    // handleOpenAgent + post-login continuation of an explicit chat request.
    expect(openers).toBe(2)
    expect(app).toContain('pendingChatAfterLogin')
  })
})

describe('authentication methods and role integrity', () => {
  it('login offers email/password, Google, and password reset', () => {
    expect(authModal).toContain('signIn(email, password)')
    expect(authModal).toContain('Continue with Google')
    expect(authModal).toContain('resetPassword')
    expect(authModal).toContain('forgot-password')
  })

  it('sign-up collects no role (customers never self-assign staff roles)', () => {
    // Preference dropdowns (property type, bedrooms, timeline) are fine;
    // what is forbidden is any role picker or staff-role literal.
    expect(authModal).not.toMatch(/select[^>]*role|role[^>]*select/i)
    expect(authModal).not.toMatch(/useState<StaffRole>|role.*StaffRole|as StaffRole/)
    expect(authModal).not.toMatch(/>Admin<|>Manager<|>Salesperson</)
    expect(authModal).toContain('signUp(name, email, password)')
  })

  it('CRM gates resolve roles backend-side, never from UI state', () => {
    expect(requireStaff).toContain('useStaffRole')
    expect(staffArea).toContain('RequireStaff')
    for (const route of ['/crm', '/crm/leads', '/crm/enquiry', '/crm/team', '/crm/progress']) {
      expect(staffArea, route).toContain(route)
    }
    expect(staffArea).toContain('RequireStaff roles=')
  })

  it('sign-out and account switching clear all identity state', () => {
    const idx = app.indexOf('const handleLogout')
    const block = app.slice(idx, app.indexOf('}', app.indexOf('setShowWelcome(true)', idx)) + 1)
    for (const token of ['logout()', 'clearStaffMeCache()', 'setChatCloudUid(null)', 'clearLocalUser()', 'setIsAgentOpen(false)', 'setPendingChatAfterLogin(false)']) {
      expect(block, token).toContain(token)
    }
  })
})
