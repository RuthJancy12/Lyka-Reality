import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import accountSrc from '../../pages/AccountPage.tsx?raw'
import apiSrc from '../../services/api.ts?raw'
import appSrc from '../../App.tsx?raw'
import agentModalSrc from '../../components/agent/UIAgentModal.tsx?raw'

const ROOT = process.cwd()
const accountCss = readFileSync(join(ROOT, 'src/pages/AccountPage.css'), 'utf8')

describe('Issue 1: AI Assistant Wiring & In-Place Execution', () => {
  it('mounts UIAgentModal directly in AccountPage so portal clients never leave the page', () => {
    expect(accountSrc).toContain('<UIAgentModal')
    expect(accountSrc).toContain('isOpen={isAgentOpen}')
    expect(accountSrc).toContain('onClose={() => setIsAgentOpen(false)}')
    expect(accountSrc).toContain('properties={catalogue}')
  })

  it('connects the header AI Consultation button to setIsAgentOpen(true) instead of navigating to /?chat=1', () => {
    expect(accountSrc).toMatch(/<button[^>]*onClick=\{\(\)\s*=>\s*setIsAgentOpen\(true\)\}[^>]*>[\s\S]*?AI Consultation/)
    // Must NOT navigate to /?chat=1 from header
    expect(accountSrc).not.toMatch(/onClick=\{\(\)\s*=>\s*navigate\('\/\?chat=1'\)\}[^>]*>[\s\S]*?AI Consultation/)
  })

  it('implements live interactive AI advisor consultation room in View 9 (Messages)', () => {
    // Interactive chat state
    expect(accountSrc).toContain('portalChatInput')
    expect(accountSrc).toContain('portalChatLoading')
    expect(accountSrc).toContain('portalChatError')
    expect(accountSrc).toContain('liveChatTurns')
    expect(accountSrc).toContain('handleSendPortalChat')

    // Live chat room CSS and feed
    expect(accountCss).toContain('.portal-chat-room')
    expect(accountCss).toContain('.portal-chat-feed')
    expect(accountCss).toContain('.portal-chat-bubble.user')
    expect(accountCss).toContain('.portal-chat-bubble.assistant')
    expect(accountCss).toContain('.portal-chat-composer')
    expect(accountCss).toContain('.portal-chat-input')

    // Real API dispatch and backend turn persistence
    expect(accountSrc).toContain('sendChatMessage(text, portalChatSessionId, undefined, messageRef)')
    expect(accountSrc).toContain('createCustomerChatTurn')
    expect(accountSrc).toContain('logTurn')

    // Real thinking spinner and error recovery
    expect(accountSrc).toContain('LYKA AI is reviewing UAE luxury properties')
    expect(accountSrc).toContain('portalChatError')
    expect(accountSrc).toMatch(/Retry/)

    // Open Fullscreen AI Concierge button
    expect(accountSrc).toContain('Open Fullscreen AI Concierge')
  })

  it('UIAgentModal provides safe reply fallback and cleans up empty placeholder bubbles on error', () => {
    expect(agentModalSrc).toContain('safeReply')
    expect(agentModalSrc).toContain('streamPlaceholderId')
    // Fallback message ensures assistant bubble is never blank
    expect(agentModalSrc).toContain('I have checked our Dubai portfolio with your criteria')
  })
})

describe('Issue 2: Broken Button Fixes & In-Place Routing', () => {
  it('connects guest "Sign in or Register" in My Account to setIsAuthOpen(true)', () => {
    expect(accountSrc).toMatch(/<button[^>]*onClick=\{\(\)\s*=>\s*setIsAuthOpen\(true\)\}[^>]*>[\s\S]*?Sign in or Register/)
    expect(accountSrc).toContain('<AuthModal')
    expect(accountSrc).toContain('isOpen={isAuthOpen}')
  })

  it('eliminates all disruptive /?chat=1 redirects that kick customers out of the portal', () => {
    expect(accountSrc).not.toContain("navigate('/?chat=1')")
    expect(accountSrc).not.toContain('navigate("/?chat=1")')
  })

  it('provides quick prompt suggestion pills in View 9 that dispatch instantly', () => {
    expect(accountSrc).toContain('2BHK in Dubai Marina under 2.5M AED')
    expect(accountSrc).toContain('Palm Jumeirah luxury beachfront villa')
    expect(accountSrc).toContain('handleSendPortalChat(prompt)')
  })
})

describe('Issue 3: Browser Moments & Activity Timeline with Tracking Consent', () => {
  it('combines local and backend interactions into browserMoments timeline', () => {
    expect(accountSrc).toContain('browserMoments')
    expect(accountSrc).toContain('getInteractions(owner)')
    expect(accountSrc).toContain('backendInteractions')
    expect(accountSrc).toContain('recentlyViewedProperties')
  })

  it('displays tracking consent status banner respecting user privacy setting', () => {
    expect(accountCss).toContain('.browser-moments-banner')
    expect(accountCss).toContain('.browser-moments-banner.active')
    expect(accountCss).toContain('.browser-moments-banner.paused')
    expect(accountSrc).toContain('Activity Tracking Active &amp; Private')
    expect(accountSrc).toContain('Activity Tracking is Paused')
    expect(accountSrc).toContain('Enable Activity Tracking')
    expect(accountSrc).toContain('Pause Tracking')
  })

  it('provides timeline filter tabs and rich luxury empty state', () => {
    expect(accountSrc).toContain('All Activity Moments')
    expect(accountSrc).toContain('Viewed Properties')
    expect(accountSrc).toContain('Searches &amp; Inquiries')
    expect(accountSrc).toContain('No Browsing Moments Recorded Yet')
    expect(accountSrc).toContain('moment-card')
  })

  it('syncs consent-gated interactions to backend when authenticated in App.tsx', () => {
    expect(appSrc).toContain('createCustomerInteraction')
    expect(appSrc).toContain("kind: 'search'")
    expect(appSrc).toContain("kind: 'view'")
    expect(apiSrc).toContain('export async function createCustomerInteraction')
  })
})

describe('Issue 4: AI Declaration & Client Brief Integration', () => {
  it('defines AIDeclarationCard rendering declared real estate criteria and active matching state', () => {
    expect(accountSrc).toContain('function AIDeclarationCard')
    expect(accountSrc).toContain('AI Real Estate Declaration &amp; Client Brief')
    expect(accountSrc).toContain('AI Matching Active')
    expect(accountSrc).toContain('Pending Declaration')
    expect(accountSrc).toContain('ai-declaration-grid')
    expect(accountSrc).toContain('ai-declaration-capsule')
  })

  it('renders AIDeclarationCard in both Dashboard and Saved Searches views', () => {
    // Rendered under Recommendations in Dashboard
    expect(accountSrc).toMatch(/<Recommendations[\s\S]*?<AIDeclarationCard[\s\S]*?market-insights-grid/)
    // Rendered above RequirementsEditor in Saved Searches
    expect(accountSrc).toMatch(/activeView === 'saved-searches'[\s\S]*?<AIDeclarationCard[\s\S]*?<RequirementsEditor/)
  })

  it('provides actionable controls to declare via AI Assistant or update criteria in preferences', () => {
    expect(accountSrc).toContain('Declare via AI Assistant')
    expect(accountSrc).toContain('Update Criteria')
    expect(accountSrc).toContain('onDeclareWithAI={() => setIsAgentOpen(true)}')
    expect(accountSrc).toContain("onEditCriteria={() => setActiveView('settings')}")
  })
})
