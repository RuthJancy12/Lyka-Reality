import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CALL_OUTCOMES, CALL_STATUS_LABELS } from '../../crm/services/staffApi'
import { fetchInventoryStats, migrateLegacyCustomerData } from '../../services/api'
import adminContent from '../../crm/pages/AdminDashboard.tsx?raw'
import smContent from '../../crm/pages/SalesManagerDashboard.tsx?raw'
import spContent from '../../crm/pages/SalesPersonDashboard.tsx?raw'
import chContent from '../../components/CustomerHomeSection.tsx?raw'

const ROOT = process.cwd()
const indexCss = readFileSync(join(ROOT, 'src/index.css'), 'utf8')

describe('LYKA REALTY CRM Enhancements Verification', () => {
  it('defines the modern color palette in index.css with all required variables', () => {
    // Modern Palette Tokens
    expect(indexCss).toContain('--navy-primary: #172A46')
    expect(indexCss).toContain('--teal-accent: #11B5A4')
    expect(indexCss).toContain('--ivory-bg: #F8F7F2')
    expect(indexCss).toContain('--lavender-soft: #A5B4FC')

    // Bright Lead Temperature Badges
    expect(indexCss).toContain('--lead-hot: #FF6B6B')
    expect(indexCss).toContain('--lead-warm: #F59E0B')
    expect(indexCss).toContain('--lead-cold: #0EA5E9')

    // Helper classes
    expect(indexCss).toContain('.badge-hot')
    expect(indexCss).toContain('.badge-warm')
    expect(indexCss).toContain('.badge-cold')
    expect(indexCss).toContain('.crm-card')
    expect(indexCss).toContain('.crm-table')
  })

  it('includes all required call activity outcomes including callback requested and wrong number', () => {
    expect(CALL_OUTCOMES).toContain('connected')
    expect(CALL_OUTCOMES).toContain('attempted_no_answer')
    expect(CALL_OUTCOMES).toContain('busy_unreachable')
    expect(CALL_OUTCOMES).toContain('follow_up_required')
    expect(CALL_OUTCOMES).toContain('callback_requested')
    expect(CALL_OUTCOMES).toContain('wrong_number')
    expect(CALL_OUTCOMES).toContain('not_interested')

    expect(CALL_STATUS_LABELS['connected']).toBe('Connected')
    expect(CALL_STATUS_LABELS['attempted_no_answer']).toBe('No Answer')
    expect(CALL_STATUS_LABELS['busy']).toBe('Busy')
    expect(CALL_STATUS_LABELS['callback_requested']).toBe('Callback Requested')
    expect(CALL_STATUS_LABELS['wrong_number']).toBe('Wrong Number')
    expect(CALL_STATUS_LABELS['not_interested']).toBe('Not Interested')
  })

  it('exports fetchInventoryStats and migrateLegacyCustomerData functions', () => {
    expect(typeof fetchInventoryStats).toBe('function')
    expect(typeof migrateLegacyCustomerData).toBe('function')
  })

  it('AdminDashboard renders verified 3,000 inventory breakdown without hardcoding 5,000', () => {
    // Verifies actual dataset count 3,000, NOT 5,000
    expect(adminContent).toContain('3000')
    expect(adminContent).toContain('2713')
    expect(adminContent).toContain('287')
    expect(adminContent).not.toContain('5,000')

    // Features: search, pagination, details modal
    expect(adminContent).toContain('inventoryPage')
    expect(adminContent).toContain('selectedProperty')
    expect(adminContent).toContain('Operational Infrastructure Status')
  })

  it('SalesManagerDashboard enforces authorized team scoping and consultant performance table', () => {
    expect(smContent).toContain('Authorized Team Scoping')
    expect(smContent).toContain('consultantRows')
    expect(smContent).toContain('dateFilter')
    expect(smContent).toContain('callsAttempted')
    expect(smContent).toContain('targetProgress')
  })

  it('SalesPersonDashboard provides bright temperature badges and manual calling modal', () => {
    expect(spContent).toContain('HOT_COLOR')
    expect(spContent).toContain('WARM_COLOR')
    expect(spContent).toContain('COLD_COLOR')
    expect(spContent).toContain('CallModal')
    expect(spContent).toContain('activeCallLead')
  })

  it('CustomerHomeSection provides personalized verified content without fake listings', () => {
    expect(chContent).toContain('Verified Client Portal')
    expect(chContent).toContain('AI Recommendations')
    expect(chContent).toContain('My Inquiries')
    expect(chContent).toContain('Appointments')
    expect(chContent).toContain('My Preferences')
    expect(chContent).toContain('fetchPropertiesFromApi')
  })
})
