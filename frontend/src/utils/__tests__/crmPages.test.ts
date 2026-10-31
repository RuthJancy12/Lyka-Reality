import { describe, it, expect } from 'vitest'
// Raw sources for UI-contract guards (vite ?raw — no node APIs).
import leadMgmtSrc from '../../crm/pages/LeadManagement.tsx?raw'
import newEnquirySrc from '../../crm/pages/NewEnquiry.tsx?raw'
import propertyMgmtSrc from '../../crm/pages/PropertyManagement.tsx?raw'

const leadMgmt: string = leadMgmtSrc
const newEnquiry: string = newEnquirySrc
const propertyMgmt: string = propertyMgmtSrc

const PAGES: Array<readonly [string, string]> = [
  ['LeadManagement', leadMgmt],
  ['NewEnquiry', newEnquiry],
  ['PropertyManagement', propertyMgmt],
]

/** Bright Tailwind accents banned by the luxury restyle. */
const BANNED = [
  'bg-rose-600', 'bg-rose-700', 'bg-blue-600', 'bg-blue-700',
  'bg-purple-600', 'bg-purple-700', 'bg-emerald-600', 'bg-emerald-700',
  'bg-red-400', 'bg-red-500', 'bg-amber-400', 'bg-green-400',
  'text-rose-600', 'text-rose-700', 'text-blue-600', 'text-blue-700',
  'text-purple-600', 'text-purple-700', 'text-emerald-600', 'text-green-700',
  'border-rose-', 'ring-rose-', 'from-rose-', 'to-rose-',
  'bg-blue-50', 'bg-blue-100', 'bg-purple-50', 'bg-purple-100',
  'bg-emerald-50', 'bg-emerald-100', 'bg-amber-50', 'bg-amber-100',
  'bg-green-50', 'bg-green-100', 'bg-red-50', 'bg-red-100',
  'bg-gray-50', 'bg-gray-100', 'border-gray-100', 'border-gray-200',
  'text-gray-900', 'text-gray-800', 'text-gray-700', 'text-gray-600',
  'text-gray-500', 'text-gray-400', 'text-gray-300',
]

describe('luxury branding (no bright colors)', () => {
  it.each(PAGES)('%s uses no banned bright classes', (_name, src) => {
    for (const token of BANNED) {
      expect(src, token).not.toContain(token)
    }
  })

  it.each(PAGES)('%s uses LYKA luxury tokens', (_name, src) => {
    expect(src).toContain('var(--plum-main)')
    expect(src).toContain('var(--champagne-border)')
  })

  it('all form controls use the shared field class (gold focus ring)', () => {
    const count = (src: string) =>
      (src.match(/className="lyka-field"/g) || []).length
    // LeadManagement: search + 3 filter selects; PropertyManagement: 2
    // filter selects + price inputs; NewEnquiry: enquiry textarea.
    expect(count(leadMgmt)).toBeGreaterThanOrEqual(4)
    expect(count(propertyMgmt)).toBeGreaterThanOrEqual(4)
    expect(count(newEnquiry)).toBeGreaterThanOrEqual(1)
  })
})

describe('LeadManagement behavior preserved', () => {
  it('keeps header, actions, filters, table, and pagination', () => {
    for (const token of [
      'Lead Management', 'total leads', '/crm/enquiry', 'New Enquiry', 'Refresh',
      'listLeads', 'updateLeadStatus', 'STATUS_OPTIONS',
      'All Statuses', 'All Priorities', 'All Types', 'Clear filters',
      '/crm/leads/${lead.id}', 'Page {page} of {totalPages}',
      'No leads found', 'Try adjusting your filters',
    ]) {
      expect(leadMgmt, token).toContain(token)
    }
  })

  it('keeps status editing and priority display', () => {
    expect(leadMgmt).toContain('handleStatusChange')
    expect(leadMgmt).toContain('priority_label')
    expect(leadMgmt).toContain('priority_score')
  })

  it('View action is always visible (touch accessible)', () => {
    expect(leadMgmt).not.toContain('opacity-0')
    expect(leadMgmt).toContain('View')
  })
})

describe('NewEnquiry behavior preserved', () => {
  it('keeps analyse, save, samples, and guards', () => {
    for (const token of [
      'New Customer Enquiry', 'analyseEnquiry', 'createLead',
      'Analyse with AI', 'Save Lead & Find Properties', 'Start Over',
      'Try a sample enquiry', 'SAMPLE_ENQUIRIES',
      'at least 10 characters', 'characters',
      '/crm/leads/${lead.id}',
    ]) {
      expect(newEnquiry, token).toContain(token)
    }
  })

  it('keeps score, requirements, amenities, and missing-fields sections', () => {
    for (const token of [
      'AI Lead Score', 'Score Breakdown', 'Extracted Requirements',
      'Amenities', 'Missing Information', 'Agent Suggestions',
    ]) {
      expect(newEnquiry, token).toContain(token)
    }
  })
})

describe('PropertyManagement behavior preserved', () => {
  it('keeps filters, cards, prices, amenities, and edit flow', () => {
    for (const token of [
      'Property Management', 'Fictional Demo Properties',
      'listProperties', 'updateProperty', 'available_only',
      'All Locations', 'Sale & Rent', 'For Sale', 'For Rent',
      'Edit Price / Availability', 'Monthly Rent', 'Sale Price (AED)',
      'Available for matching', 'ref_code', 'amenities',
    ]) {
      expect(propertyMgmt, token).toContain(token)
    }
  })

  it('keeps the fictional-vs-real dataset notice separate', () => {
    expect(propertyMgmt).toContain('fictional')
    expect(propertyMgmt).toContain('real Dubai')
    expect(propertyMgmt).toContain('separate from the real Dubai')
  })
})
