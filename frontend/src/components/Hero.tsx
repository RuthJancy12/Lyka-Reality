import { useState } from 'react'
import { Search, MapPin, Building, Key, DollarSign } from 'lucide-react'
import type { PropertyFilters } from '../types/property'
import { DUBAI_LOCATIONS } from '../utils/agentEngine'

interface HeroProps {
  filters: PropertyFilters
  onFilterChange: (newFilters: Partial<PropertyFilters>) => void
  onSearchSubmit: () => void
  totalCount: number
}

const PROPERTY_TYPES = ['All Types', 'Apartment', 'Villa', 'Penthouse', 'Townhouse']

export function Hero({ filters, onFilterChange, onSearchSubmit }: HeroProps) {
  const [selectedPurpose, setSelectedPurpose] = useState<'All' | 'Sale' | 'Rent'>(filters.listingType)

  const handlePurposeChange = (p: 'All' | 'Sale' | 'Rent') => {
    setSelectedPurpose(p)
    onFilterChange({ listingType: p })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearchSubmit()
  }

  return (
    <section style={{
      position: 'relative',
      minHeight: '82vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 0 90px',
      overflow: 'hidden',
      background: 'linear-gradient(180deg, #F8F8F6 0%, #FFFFFF 100%)'
    }}>
      {/* High-quality Dubai real-estate architectural visual */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `linear-gradient(180deg, rgba(26, 13, 24, 0.55) 0%, rgba(26, 13, 24, 0.85) 100%), url('https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=2200&q=85')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center 40%',
        zIndex: 0
      }} />

      <div className="container" style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
        {/* Subtle Luxury Sub-Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 18px',
          borderRadius: '4px',
          background: 'rgba(197, 168, 105, 0.16)',
          border: '1px solid var(--gold-border)',
          marginBottom: '20px',
          backdropFilter: 'blur(8px)'
        }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gold-hover)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Premier Dubai Real Estate Consultancy
          </span>
        </div>

        {/* Elegant & Large Headline */}
        <h1 className="luxury-serif" style={{
          fontSize: 'clamp(40px, 6vw, 68px)',
          fontWeight: 600,
          color: '#FFFFFF',
          lineHeight: 1.15,
          marginBottom: '18px',
          maxWidth: '900px',
          marginInline: 'auto',
          textShadow: '0 2px 14px rgba(0, 0, 0, 0.35)'
        }}>
          Find Your Place in Dubai
        </h1>

        {/* Supporting text */}
        <p style={{
          fontSize: 'clamp(16px, 2vw, 19px)',
          color: '#FBF8F3',
          maxWidth: '680px',
          margin: '0 auto 40px',
          lineHeight: 1.6,
          fontWeight: 400
        }}>
          Explore premium homes, investment opportunities and communities across Dubai with trusted expert guidance.
        </p>

        {/* Modern Property Search Component */}
        <div className="hero-search-card" style={{
          maxWidth: '1040px',
          margin: '0 auto',
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '24px 28px',
          border: '1px solid var(--champagne-border)',
          boxShadow: '0 20px 48px rgba(26, 13, 24, 0.22)',
          textAlign: 'left'
        }}>
          {/* Buy / Rent Switch */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
            {(['All', 'Sale', 'Rent'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handlePurposeChange(tab)}
                style={{
                  padding: '7px 18px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  background: selectedPurpose === tab ? 'var(--plum-main)' : 'var(--champagne-surface)',
                  color: selectedPurpose === tab ? 'var(--gold-hover)' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: selectedPurpose === tab ? 'var(--gold-primary)' : 'var(--champagne-border)'
                }}
              >
                {tab === 'All' ? 'All Properties' : tab === 'Sale' ? 'Buy Property' : 'Rent Property'}
              </button>
            ))}
          </div>

          {/* Search Form Fields: Location | Property Type | Budget | Action */}
          <form onSubmit={handleSubmit} className="hero-search-form" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) 180px',
            gap: '14px',
            alignItems: 'center'
          }}>
            {/* Location / Community */}
            <div style={{
              background: 'var(--champagne-light)',
              border: '1px solid var(--champagne-border)',
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <MapPin size={17} color="var(--gold-dark)" style={{ flexShrink: 0 }} />
              <div style={{ width: '100%' }}>
                <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, lineHeight: 1 }}>
                  Location / Community
                </label>
                <select
                  value={filters.location}
                  onChange={(e) => onFilterChange({ location: e.target.value })}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main)',
                    width: '100%',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    marginTop: '2px'
                  }}
                >
                  <option value="">All Dubai Communities</option>
                  {DUBAI_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Property Type */}
            <div style={{
              background: 'var(--champagne-light)',
              border: '1px solid var(--champagne-border)',
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Building size={17} color="var(--gold-dark)" style={{ flexShrink: 0 }} />
              <div style={{ width: '100%' }}>
                <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, lineHeight: 1 }}>
                  Property Type
                </label>
                <select
                  value={filters.propertyType}
                  onChange={(e) => onFilterChange({ propertyType: e.target.value })}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main)',
                    width: '100%',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    marginTop: '2px'
                  }}
                >
                  {PROPERTY_TYPES.map((pt) => (
                    <option key={pt} value={pt === 'All Types' ? '' : pt}>{pt}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Bedrooms (BHK) */}
            <div style={{
              background: 'var(--champagne-light)',
              border: '1px solid var(--champagne-border)',
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Key size={17} color="var(--gold-dark)" style={{ flexShrink: 0 }} />
              <div style={{ width: '100%' }}>
                <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, lineHeight: 1 }}>
                  Bedrooms
                </label>
                <select
                  value={filters.bhk}
                  onChange={(e) => onFilterChange({ bhk: e.target.value })}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main)',
                    width: '100%',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    marginTop: '2px'
                  }}
                >
                  <option value="">Any Bedrooms</option>
                  <option value="0">Studio</option>
                  <option value="1">1 Bedroom</option>
                  <option value="2">2 Bedrooms</option>
                  <option value="3">3 Bedrooms</option>
                  <option value="4">4+ Bedrooms</option>
                </select>
              </div>
            </div>

            {/* Budget */}
            <div style={{
              background: 'var(--champagne-light)',
              border: '1px solid var(--champagne-border)',
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <DollarSign size={17} color="var(--gold-dark)" style={{ flexShrink: 0 }} />
              <div style={{ width: '100%' }}>
                <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, lineHeight: 1 }}>
                  Max Budget (AED)
                </label>
                <select
                  value={filters.maxPrice || ''}
                  onChange={(e) => onFilterChange({ maxPrice: Number(e.target.value) || 0 })}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main)',
                    width: '100%',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    marginTop: '2px'
                  }}
                >
                  <option value="">Any Budget</option>
                  <option value="1500000">Up to AED 1.5M</option>
                  <option value="3000000">Up to AED 3.0M</option>
                  <option value="6000000">Up to AED 6.0M</option>
                  <option value="15000000">Up to AED 15M</option>
                  <option value="30000000">Up to AED 30M+</option>
                </select>
              </div>
            </div>

            {/* Primary Action Button: "Search Properties" (Gold Luxury CTA) */}
            <button
              type="submit"
              className="gold-btn"
              style={{
                height: '48px',
                width: '100%',
                fontSize: '14px',
                borderRadius: '6px'
              }}
            >
              <Search size={16} />
              <span>Search Properties</span>
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
