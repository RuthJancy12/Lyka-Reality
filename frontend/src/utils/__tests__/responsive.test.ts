import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// node:fs / node:path / process come from the adjacent node-shims.d.ts
// (test-only ambient declarations; tsconfig bundles vite/client only).
// CSS is read from disk: vite ?raw inlines TSX sources but empties
// stylesheets in this pipeline, so filesystem reads keep these guards real.
const ROOT = process.cwd()
const readCss = (rel: string): string =>
  readFileSync(join(ROOT, rel), 'utf8')
// Raw sources for structural guards (vite ?raw — no node APIs).
import indexHtml from '../../../index.html?raw'
import mainSrc from '../../main.tsx?raw'
import appSrc from '../../App.tsx?raw'
import heroSrc from '../../components/Hero.tsx?raw'
import navbarSrc from '../../components/Navbar.tsx?raw'
import staffAreaSrc from '../../crm/pages/StaffArea.tsx?raw'
import previewSrc from '../../components/dev/ViewportPreview.tsx?raw'

const css: string = readCss('src/responsive.css')
const chatCss: string = readCss('src/components/agent/UIAgentModal.css')

describe('responsive foundation', () => {
  it('declares a mobile viewport and loads the responsive layer', () => {
    expect(indexHtml).toMatch(/width=device-width/)
    expect(mainSrc).toMatch(/responsive\.css/)
  })

  it('defines phone, tablet, and small-laptop breakpoints', () => {
    expect(css).toMatch(/max-width:\s*480px/)
    expect(css).toMatch(/max-width:\s*(640|768)px/)
    expect(css).toMatch(/max-width:\s*(900|1024px)/)
  })

  it('guards against horizontal overflow globally', () => {
    expect(css).toMatch(/overflow-x:\s*clip/)
  })

  it('uses real layouts (no transform-scale page shrinking)', () => {
    expect(css).not.toMatch(/transform:\s*scale\(/)
  })
})

describe('homepage, navigation, and listings', () => {
  it('hero search collapses to one column on phones', () => {
    expect(heroSrc).toContain('hero-search-form')
    expect(css).toMatch(/\.hero-search-form/)
  })

  it('navbar parks crowded actions on small phones', () => {
    expect(navbarSrc).toContain('navbar-actions')
    expect(navbarSrc).toContain('navbar-book-btn')
    expect(navbarSrc).toContain('navbar-ai-label')
    expect(css).toMatch(/\.navbar-book-btn/)
  })

  it('property grids cannot overflow narrow screens', () => {
    expect(appSrc).toMatch(/minmax\(min\(100%, 330px\), 1fr\)/)
  })

  it('property modal gallery and padding adapt', () => {
    expect(css).toMatch(/\.propmodal-gallery/)
    expect(css).toMatch(/\.propmodal-body/)
  })
})

describe('chatbot, drawer, and auth surfaces', () => {
  it('chat goes full-screen with safe-area + no iOS zoom on phones', () => {
    expect(css).toMatch(/100dvh/)
    expect(css).toMatch(/safe-area-inset-bottom/)
    expect(css).toMatch(/\.lyka-chat-input/)
  })

  it('existing chat tablet rules are preserved', () => {
    expect(chatCss).toMatch(/max-width:\s*960px/)
  })

  it('auth, portal, employee, and drawer cards adapt', () => {
    for (const cls of ['.auth-card', '.portal-card', '.employee-card', '.favorites-drawer']) {
      expect(css).toContain(cls)
    }
  })
})

describe('CRM dashboards', () => {
  it('staff shell stacks below small-laptop widths', () => {
    expect(staffAreaSrc).toContain('crm-shell')
    expect(staffAreaSrc).toContain('crm-aside')
    expect(staffAreaSrc).toContain('crm-main')
    expect(css).toMatch(/\.crm-shell/)
    expect(css).toMatch(/\.crm-aside/)
  })

  it('crm tables scroll inside their cards instead of the page', () => {
    expect(css).toMatch(/\.crm-main table/)
    expect(css).toMatch(/overflow-x:\s*auto/)
  })
})

describe('dev-only viewport preview', () => {
  it('renders real iframe viewports for device presets', () => {
    expect(previewSrc).toContain('<iframe')
    expect(previewSrc).toContain('390')
    expect(previewSrc).toContain('768')
    expect(previewSrc).toContain('1024')
    expect(previewSrc).toContain('1280')
    expect(previewSrc).not.toMatch(/transform:\s*scale/)
  })

  it('is DEV-gated and never mounted in production', () => {
    expect(previewSrc).toMatch(/import\.meta\.env\.DEV/)
    expect(previewSrc).toMatch(/if \(!import\.meta\.env\.DEV\) return null/)
    expect(appSrc).toMatch(/import\.meta\.env\.DEV \? <ViewportPreview/)
  })
})
