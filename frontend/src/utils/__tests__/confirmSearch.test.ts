import { describe, it, expect } from 'vitest'
import modalSrc from '../../components/agent/UIAgentModal.tsx?raw'
import summarySrc from '../../components/agent/SummaryCard.tsx?raw'
import panelSrc from '../../components/agent/RequirementPanel.tsx?raw'
import propCardSrc from '../../components/PropertyCard.tsx?raw'
import propModalSrc from '../../components/PropertyModal.tsx?raw'
import favSrc from '../../components/FavoritesDrawer.tsx?raw'
import mortgageSrc from '../../components/MortgageCalculator.tsx?raw'
import accountSrc from '../../pages/AccountPage.tsx?raw'
import recordsSrc from '../../components/agent/LykaRecordsPanel.tsx?raw'
import leadAnalysisSrc from '../../crm/pages/LeadAnalysis.tsx?raw'
import propertyMgmtSrc from '../../crm/pages/PropertyManagement.tsx?raw'
import newEnquirySrc from '../../crm/pages/NewEnquiry.tsx?raw'
import engineSrc from '../../utils/agentEngine.ts?raw'
import apiSrc from '../../services/api.ts?raw'

const modal: string = modalSrc

/** Every file that renders an AED money amount. */
const AED_FILES: Array<readonly [string, string]> = [
  ['UIAgentModal', modal],
  ['SummaryCard', summarySrc],
  ['RequirementPanel', panelSrc],
  ['PropertyCard', propCardSrc],
  ['PropertyModal', propModalSrc],
  ['FavoritesDrawer', favSrc],
  ['MortgageCalculator', mortgageSrc],
  ['AccountPage', accountSrc],
  ['LykaRecordsPanel', recordsSrc],
  ['LeadAnalysis', leadAnalysisSrc],
  ['PropertyManagement', propertyMgmtSrc],
  ['NewEnquiry', newEnquirySrc],
  ['agentEngine', engineSrc],
]

describe('AED display is locale-independent (never 30,00,000)', () => {
  it.each(AED_FILES)('%s has no bare toLocaleString() on AED amounts', (_name, src) => {
    // Template/interpolation sites rendering "AED ..." must pin en-US so
    // browsers with Indian-style grouping cannot render 30,00,000.
    const bareAed = src.match(/AED [^`\n]*?\.toLocaleString\(\)/g) || []
    expect(bareAed, _name).toEqual([])
  })

  it.each(AED_FILES)('%s pins money formatting to en-US', (_name, src) => {
    // Files without any AED rendering are exempt (NewEnquiry renders AED
    // only via backend values it formats explicitly below).
    if (!/AED/.test(src)) return
    expect(src, _name).toContain("toLocaleString('en-US')")
  })
})

describe('Confirm & Find Properties single outcome', () => {
  it('guards concurrent confirms per card (no duplicate replies)', () => {
    expect(modal).toContain('confirmingIdsRef')
    expect(modal).toContain('confirmingIdsRef.current.has(msgId)')
    expect(modal).toContain('confirmingIdsRef.current.delete(msgId)')
  })

  it('empty confirm reports the checked scope (exact + nearby)', () => {
    expect(modal).toContain('apiRes.fallback')
    expect(modal).toContain('with all your confirmed filters')
  })

  it('API surfaces fallback info and the no_results gate', () => {
    expect(apiSrc).toContain('fallback?:')
    expect(apiSrc).toContain("'no_results'")
  })
})
