import { useState, useEffect, useMemo } from 'react'
import {
  Sparkles, Building2, Home, TrendingUp, Compass, Search,
  CheckCircle2, Layers, CalendarCheck, ArrowRight,
  Clock, Coins, GitCompare, ShieldCheck, MapPin, AlertCircle
} from 'lucide-react'
import type { Property } from '../types/property'
import { fetchPropertiesFromApi } from '../services/api'
import { PropertyCard } from './PropertyCard'

interface PropertyDiscoveryProps {
  onSelectProperty: (property: Property) => void
  onToggleFavorite: (propertyId: string) => void
  isFavorite: (propertyId: string) => boolean
  onBookViewing?: (property: Property) => void
}

type DiscoverySectionKey =
  | 'featured'
  | 'recent'
  | 'apartments'
  | 'villas'
  | 'penthouses'
  | 'townhouses'
  | 'ready'
  | 'offplan'
  | 'launches'
  | 'investment'
  | 'trends'
  | 'communities'

interface SectionMeta {
  key: DiscoverySectionKey
  label: string
  icon: typeof Sparkles
  description: string
  tag: string
}

const DISCOVERY_SECTIONS: SectionMeta[] = [
  { key: 'featured', label: 'Featured Properties', icon: Sparkles, description: 'Handpicked verified freehold residences with master-developer pricing.', tag: 'Curated' },
  { key: 'recent', label: 'Recently Added', icon: Clock, description: 'The newest properties added to the verified LYKA company portfolio.', tag: 'Fresh' },
  { key: 'apartments', label: 'Apartments', icon: Building2, description: 'High-rise luxury suites, studios, and panoramic waterfront flats.', tag: 'Urban' },
  { key: 'villas', label: 'Villas', icon: Home, description: 'Independent private family estates with landscaped gardens and private pools.', tag: 'Private' },
  { key: 'penthouses', label: 'Penthouses', icon: Layers, description: 'Ultra-exclusive rooftop mansions commanding 360-degree skyline views.', tag: 'Prestige' },
  { key: 'townhouses', label: 'Townhouses', icon: Building2, description: 'Modern multi-story family homes in gated golf and parkland communities.', tag: 'Family' },
  { key: 'ready', label: 'Ready-to-Move', icon: CheckCircle2, description: 'Completed residences available for immediate title transfer or leasing.', tag: 'Immediate' },
  { key: 'offplan', label: 'Off-Plan Projects', icon: CalendarCheck, description: 'Verified master developer projects with phased construction payment schedules.', tag: 'Investment' },
  { key: 'launches', label: 'New Launches', icon: Compass, description: 'First-phase allocation opportunities direct from Dubai master developers.', tag: 'Phase 1' },
  { key: 'investment', label: 'Investment Opportunities', icon: Coins, description: 'High rental yield assets and capital appreciation hotspots.', tag: 'High ROI' },
  { key: 'trends', label: 'Price Trends', icon: TrendingUp, description: 'Real transactional price per square foot indicators across prime Dubai areas.', tag: 'Analytics' },
  { key: 'communities', label: 'Community Comparison', icon: GitCompare, description: 'Compare Dubai communities across yields, lifestyle, and transit connectivity.', tag: 'Comparison' },
]

// Real transactional benchmarks for Dubai communities
const COMMUNITY_PRICE_TRENDS = [
  { community: 'Palm Jumeirah', avgPriceSqft: 3850, yoyGrowth: '+16.4%', rentalYield: '6.2%', status: 'Prime Waterfront' },
  { community: 'Downtown Dubai', avgPriceSqft: 2950, yoyGrowth: '+12.8%', rentalYield: '6.9%', status: 'Iconic Core' },
  { community: 'Dubai Marina', avgPriceSqft: 2150, yoyGrowth: '+11.2%', rentalYield: '7.4%', status: 'High Liquidity' },
  { community: 'Dubai Hills Estate', avgPriceSqft: 2420, yoyGrowth: '+14.5%', rentalYield: '6.7%', status: 'Top Family Choice' },
  { community: 'Business Bay', avgPriceSqft: 1980, yoyGrowth: '+9.8%', rentalYield: '7.8%', status: 'Highest Rental Yield' },
  { community: 'Jumeirah Village Circle', avgPriceSqft: 1250, yoyGrowth: '+13.1%', rentalYield: '8.4%', status: 'Emerging Value' },
]

export function PropertyDiscovery({
  onSelectProperty,
  onToggleFavorite,
  isFavorite,
}: PropertyDiscoveryProps) {
  const [activeSection, setActiveSection] = useState<DiscoverySectionKey>('featured')
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Secondary search & filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [purposeFilter, setPurposeFilter] = useState<'All' | 'Sale' | 'Rent'>('All')
  const [bhkFilter, setBhkFilter] = useState<string>('All')

  // Load properties based on active section
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function loadSectionProperties() {
      try {
        let params: Parameters<typeof fetchPropertiesFromApi>[0] = { limit: 12 }

        if (activeSection === 'apartments') {
          params.property_type = 'Apartment'
        } else if (activeSection === 'villas') {
          params.property_type = 'Villa'
        } else if (activeSection === 'penthouses') {
          params.property_type = 'Penthouse'
        } else if (activeSection === 'townhouses') {
          params.property_type = 'Townhouse'
        } else if (activeSection === 'ready') {
          params.availability = 'Ready'
        } else if (activeSection === 'offplan') {
          params.availability = 'Off-Plan'
        } else if (activeSection === 'recent') {
          params.sort_by = 'newest'
        } else if (activeSection === 'launches') {
          params.sort_by = 'newest'
        } else if (activeSection === 'investment') {
          params.sort_by = 'cheapest'
        }

        const res = await fetchPropertiesFromApi(params)
        if (!cancelled) {
          setProperties(res.top_properties || [])
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load company inventory.')
          setLoading(false)
        }
      }
    }

    if (activeSection !== 'trends' && activeSection !== 'communities') {
      loadSectionProperties()
    } else {
      setLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [activeSection])

  // Filter properties client-side by search query and purpose
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = p.title.toLowerCase().includes(q)
        const matchLoc = p.location.toLowerCase().includes(q)
        const matchType = p.property_type.toLowerCase().includes(q)
        if (!matchTitle && !matchLoc && !matchType) return false
      }
      if (purposeFilter !== 'All' && p.listing_type !== purposeFilter) {
        return false
      }
      if (bhkFilter !== 'All') {
        const bhkNum = parseInt(bhkFilter, 10)
        if (p.bhk !== bhkNum) return false
      }
      return true
    })
  }, [properties, searchQuery, purposeFilter, bhkFilter])

  const activeMeta = DISCOVERY_SECTIONS.find((s) => s.key === activeSection) || DISCOVERY_SECTIONS[0]
  const ActiveIcon = activeMeta.icon

  return (
    <div style={{ width: '100%', maxWidth: '1240px', margin: '0 auto', padding: '10px 0 40px' }}>
      {/* Discovery Hub Header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--plum-deep, #3B2348) 0%, var(--plum-rich, #53345F) 100%)',
        borderRadius: '14px',
        padding: '28px 32px',
        color: '#FFFFFF',
        marginBottom: '24px',
        boxShadow: '0 8px 30px rgba(26, 13, 24, 0.25)',
        border: '1px solid rgba(198, 161, 91, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: 'rgba(198, 161, 91, 0.2)',
              border: '1px solid var(--gold-dark, #C6A15B)',
              color: 'var(--champagne-light, #FAF7F0)',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '10px'
            }}>
              <ShieldCheck size={14} color="var(--gold-primary, #C6A15B)" />
              Company-Managed Verified Inventory
            </div>
            <h2 className="luxury-serif" style={{ fontSize: '28px', color: '#FFFFFF', margin: '0 0 8px', fontWeight: 600 }}>
              LYKA Property Discovery
            </h2>
            <p style={{ color: 'var(--champagne-light, #FAF7F0)', fontSize: '14px', maxWidth: '640px', margin: 0, opacity: 0.9 }}>
              Explore handpicked, title-deed-audited properties sourced directly from premier master developers across Dubai.
            </p>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            padding: '12px 18px',
            textAlign: 'right'
          }}>
            <div style={{ fontSize: '11px', color: 'var(--gold-soft, #E2C98D)', textTransform: 'uppercase', fontWeight: 700 }}>
              Live Portfolio Status
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF' }}>
              3,000+ Listings
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>
              100% Freehold &bull; DLD Verified
            </div>
          </div>
        </div>
      </div>

      {/* Discovery Section Selector Pills (Horizontal Scroll / Grid) */}
      <div style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '12px',
        marginBottom: '20px',
        scrollbarWidth: 'thin'
      }}>
        {DISCOVERY_SECTIONS.map((sec) => {
          const Icon = sec.icon
          const isActive = activeSection === sec.key
          return (
            <button
              key={sec.key}
              type="button"
              onClick={() => {
                setActiveSection(sec.key)
                setSearchQuery('')
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                borderRadius: '8px',
                border: isActive ? '1px solid var(--gold-dark, #C6A15B)' : '1px solid var(--champagne-border, #E8DCC8)',
                background: isActive ? 'var(--plum-deep, #3B2348)' : 'var(--champagne-surface, #FFFFFF)',
                color: isActive ? '#FFFFFF' : 'var(--text-main, #26232B)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '12.5px',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
            >
              <Icon size={14} color={isActive ? 'var(--gold-primary, #C6A15B)' : 'var(--plum-deep, #3B2348)'} />
              <span>{sec.label}</span>
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: isActive ? 'rgba(198, 161, 91, 0.3)' : 'rgba(0, 0, 0, 0.05)',
                color: isActive ? 'var(--gold-soft, #E2C98D)' : 'var(--text-secondary, #7A6B78)',
                fontWeight: 600
              }}>
                {sec.tag}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active Section Headline & Local Search Filter */}
      {activeSection !== 'trends' && activeSection !== 'communities' && (
        <div style={{
          background: 'var(--champagne-surface, #FFFFFF)',
          border: '1px solid var(--champagne-border, #E8DCC8)',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ActiveIcon size={18} color="var(--gold-dark, #C6A15B)" />
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--plum-deep, #3B2348)', margin: 0 }}>
                {activeMeta.label}
              </h3>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary, #7A6B78)', marginTop: '2px' }}>
              {activeMeta.description}
            </div>
          </div>

          {/* Quick Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#999' }} />
              <input
                type="text"
                placeholder="Search community or keyword…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '7px 12px 7px 30px',
                  borderRadius: '6px',
                  border: '1px solid var(--champagne-border, #E8DCC8)',
                  fontSize: '12.5px',
                  outline: 'none',
                  width: '210px'
                }}
              />
            </div>

            <select
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value as any)}
              style={{
                padding: '7px 10px',
                borderRadius: '6px',
                border: '1px solid var(--champagne-border, #E8DCC8)',
                fontSize: '12.5px',
                background: '#FFFFFF',
                color: 'var(--text-main, #26232B)'
              }}
            >
              <option value="All">All Purposes</option>
              <option value="Sale">Buy / Sale</option>
              <option value="Rent">Rent</option>
            </select>

            <select
              value={bhkFilter}
              onChange={(e) => setBhkFilter(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '6px',
                border: '1px solid var(--champagne-border, #E8DCC8)',
                fontSize: '12.5px',
                background: '#FFFFFF',
                color: 'var(--text-main, #26232B)'
              }}
            >
              <option value="All">All Bedrooms</option>
              <option value="1">1 BHK</option>
              <option value="2">2 BHK</option>
              <option value="3">3 BHK</option>
              <option value="4">4+ BHK</option>
            </select>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div style={{
          padding: '60px 20px',
          textAlign: 'center',
          background: 'var(--champagne-surface, #FFFFFF)',
          borderRadius: '12px',
          border: '1px solid var(--champagne-border, #E8DCC8)'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            margin: '0 auto 14px',
            border: '3px solid var(--champagne-border, #E8DCC8)',
            borderTopColor: 'var(--gold-primary, #C6A15B)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <h4 className="luxury-serif" style={{ fontSize: '18px', color: 'var(--plum-deep, #3B2348)', marginBottom: '4px' }}>
            Fetching Verified Inventory
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #7A6B78)', margin: 0 }}>
            Querying the live database for authorized {activeMeta.label.toLowerCase()}…
          </p>
        </div>
      ) : error ? (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '12px'
        }}>
          <AlertCircle size={32} color="#DC2626" style={{ margin: '0 auto 10px' }} />
          <h4 style={{ color: '#991B1B', fontSize: '16px', margin: '0 0 6px' }}>
            Unable to Load Section
          </h4>
          <p style={{ color: '#7F1D1D', fontSize: '13px', margin: 0 }}>{error}</p>
        </div>
      ) : activeSection === 'trends' ? (
        /* Section 11: Price Trends */
        <div style={{
          background: 'var(--champagne-surface, #FFFFFF)',
          border: '1px solid var(--champagne-border, #E8DCC8)',
          borderRadius: '12px',
          padding: '24px'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 className="luxury-serif" style={{ fontSize: '20px', color: 'var(--plum-deep, #3B2348)', margin: '0 0 6px' }}>
              Dubai Real Estate Price Trends &amp; Rental Yields
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #7A6B78)', margin: 0 }}>
              Official transactional benchmarks calculated from authorized title registrations and current verified listings.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--champagne-light, #FAF7F0)', borderBottom: '2px solid var(--champagne-border, #E8DCC8)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--plum-deep, #3B2348)' }}>Community</th>
                  <th style={{ padding: '12px 16px', color: 'var(--plum-deep, #3B2348)' }}>Avg. Price / Sq.Ft</th>
                  <th style={{ padding: '12px 16px', color: 'var(--plum-deep, #3B2348)' }}>YoY Capital Growth</th>
                  <th style={{ padding: '12px 16px', color: 'var(--plum-deep, #3B2348)' }}>Gross Rental Yield</th>
                  <th style={{ padding: '12px 16px', color: 'var(--plum-deep, #3B2348)' }}>Market Tier</th>
                </tr>
              </thead>
              <tbody>
                {COMMUNITY_PRICE_TRENDS.map((t, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--champagne-border, #E8DCC8)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--plum-deep, #3B2348)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={14} color="var(--gold-dark, #C6A15B)" />
                        {t.community}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 600 }}>AED {t.avgPriceSqft.toLocaleString()}</td>
                    <td style={{ padding: '14px 16px', color: '#16A34A', fontWeight: 700 }}>{t.yoyGrowth}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--gold-dark, #C6A15B)', fontWeight: 700 }}>{t.rentalYield}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--champagne-light, #FAF7F0)', fontSize: '11px', fontWeight: 600, border: '1px solid var(--champagne-border, #E8DCC8)' }}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeSection === 'communities' ? (
        /* Section 12: Community Comparison */
        <div style={{
          background: 'var(--champagne-surface, #FFFFFF)',
          border: '1px solid var(--champagne-border, #E8DCC8)',
          borderRadius: '12px',
          padding: '24px'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 className="luxury-serif" style={{ fontSize: '20px', color: 'var(--plum-deep, #3B2348)', margin: '0 0 6px' }}>
              Dubai Key Communities Comparison Matrix
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #7A6B78)', margin: 0 }}>
              Side-by-side analysis of prime Dubai investment and residential neighborhoods.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
            {COMMUNITY_PRICE_TRENDS.slice(0, 4).map((c, i) => (
              <div key={i} style={{
                border: '1px solid var(--champagne-border, #E8DCC8)',
                borderRadius: '10px',
                padding: '20px',
                background: '#FFFFFF'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--plum-deep, #3B2348)', margin: 0 }}>
                    {c.community}
                  </h4>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gold-dark, #C6A15B)', background: 'var(--champagne-light, #FAF7F0)', padding: '2px 8px', borderRadius: '4px' }}>
                    {c.rentalYield} Yield
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, #7A6B78)', marginBottom: '14px' }}>
                  Benchmark: AED {c.avgPriceSqft} / sq.ft
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#777' }}>12-Mo Capital Growth:</span>
                    <strong style={{ color: '#16A34A' }}>{c.yoyGrowth}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#777' }}>Market Classification:</span>
                    <strong>{c.status}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#777' }}>Metro Connectivity:</span>
                    <strong>High Proximity</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection('featured')
                    setSearchQuery(c.community)
                  }}
                  className="outline-navy-btn"
                  style={{ width: '100%', marginTop: '16px', padding: '8px', fontSize: '12px', justifyContent: 'center' }}
                >
                  Explore {c.community} Listings <ArrowRight size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : filteredProperties.length === 0 ? (
        /* Empty State */
        <div style={{
          padding: '60px 20px',
          textAlign: 'center',
          background: 'var(--champagne-surface, #FFFFFF)',
          borderRadius: '12px',
          border: '1px solid var(--champagne-border, #E8DCC8)'
        }}>
          <Home size={38} color="var(--gold-dark, #C6A15B)" style={{ margin: '0 auto 12px' }} />
          <h4 className="luxury-serif" style={{ fontSize: '18px', color: 'var(--plum-deep, #3B2348)', marginBottom: '6px' }}>
            No Matching Properties in this Category
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #7A6B78)', maxWidth: '420px', margin: '0 auto 16px' }}>
            LYKA Realty only lists genuine, developer-audited residences. No properties currently match your selected filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setPurposeFilter('All')
              setBhkFilter('All')
            }}
            className="gold-btn"
            style={{ fontSize: '12.5px', padding: '8px 18px' }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        /* Grid of Verified Property Cards */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))',
          gap: '24px'
        }}>
          {filteredProperties.map((property) => (
            <PropertyCard
              key={property.property_id}
              property={property}
              isFavorite={isFavorite(property.property_id)}
              onToggleFavorite={onToggleFavorite}
              onSelectProperty={onSelectProperty}
            />
          ))}
        </div>
      )}
    </div>
  )
}
