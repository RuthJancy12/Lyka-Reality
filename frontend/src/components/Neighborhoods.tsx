import { useState } from 'react'
import { ArrowRight, Scale } from 'lucide-react'
import { NeighborhoodComparisonModal } from './NeighborhoodComparisonModal'

interface NeighborhoodsProps {
  onSelectNeighborhood: (location: string) => void
}

const COMMUNITIES = [
  {
    name: 'Downtown Dubai',
    description: 'The city center featuring Burj Khalifa, Dubai Mall, and luxury skyline living.',
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Dubai Marina',
    description: 'Premier waterfront district with lively yacht marinas and beachfront dining.',
    image: 'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Palm Jumeirah',
    description: 'World-renowned archipelago with signature beach villas and private resorts.',
    image: 'https://images.unsplash.com/photo-1580674684081-7617fbf3d745?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Business Bay',
    description: 'Dynamic commercial & canal-front residential hub bordering Downtown.',
    image: 'https://images.unsplash.com/photo-1546412414-e1885259563a?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Dubai Hills Estate',
    description: 'Master-planned golf community with vast green parks and family villas.',
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Jumeirah Village Circle',
    description: 'High-growth urban community with attractive rental returns and modern apartments.',
    image: 'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Dubai Creek Harbour',
    description: 'Historic creek waterfront featuring futuristic architecture and marina views.',
    image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Jumeirah Lake Towers',
    description: 'Lakeside high-rise living with direct metro stations and pedestrian plazas.',
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80'
  }
]

export function Neighborhoods({ onSelectNeighborhood }: NeighborhoodsProps) {
  const [showCompareModal, setShowCompareModal] = useState(false)
  return (
    <section id="communities" style={{ padding: '90px 0', background: 'var(--champagne-light)', borderBottom: '1px solid var(--champagne-border)' }}>
      <div className="container">
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '44px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <span style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              fontWeight: 700,
              color: 'var(--rose-primary)'
            }}>
              Prime Enclaves
            </span>
            <h2 className="luxury-serif" style={{
              fontSize: '34px',
              fontWeight: 600,
              color: 'var(--plum-main)',
              marginTop: '6px'
            }}>
              Explore Dubai Communities
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
            <p style={{
              color: 'var(--text-secondary)',
              maxWidth: '460px',
              fontSize: '14px',
              margin: 0,
              lineHeight: 1.5
            }}>
              Discover Dubai&apos;s most sought-after residential and investment neighborhoods with curated community insights.
            </p>
            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'var(--theme-primary, #3B2348)',
                color: '#FFFFFF',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid var(--theme-border, #E8DCC8)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              }}
            >
              <Scale size={14} color="var(--theme-accent, #C6A15B)" /> Compare Neighborhood Lifestyle Scores
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: '24px'
        }}>
          {COMMUNITIES.map((c, idx) => (
            <div
              key={idx}
              onClick={() => onSelectNeighborhood(c.name)}
              style={{
                borderRadius: '8px',
                overflow: 'hidden',
                position: 'relative',
                height: '300px',
                cursor: 'pointer',
                border: '1px solid var(--champagne-border)',
                boxShadow: 'var(--shadow-card)',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)'
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(26, 13, 24, 0.22)'
                e.currentTarget.style.borderColor = 'var(--gold-primary)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'var(--shadow-card)'
                e.currentTarget.style.borderColor = 'var(--champagne-border)'
              }}
            >
              {/* Large Image with minimal calm overlay */}
              <img
                src={c.image}
                alt={c.name}
                loading="lazy"
                decoding="async"
                width="400"
                height="280"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />

              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(26, 13, 24, 0.15) 0%, rgba(26, 13, 24, 0.82) 100%)'
              }} />

              {/* Card content */}
              <div style={{
                position: 'absolute',
                inset: 0,
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                color: '#FFFFFF'
              }}>
                <h3 className="luxury-serif" style={{
                  fontSize: '22px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  marginBottom: '6px'
                }}>
                  {c.name}
                </h3>
                <p style={{
                  fontSize: '13px',
                  color: '#FBF8F3',
                  lineHeight: 1.4,
                  marginBottom: '16px'
                }}>
                  {c.description}
                </p>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--gold-hover)'
                }}>
                  <span>Explore</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <NeighborhoodComparisonModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        onSelectCommunity={onSelectNeighborhood}
      />
    </section>
  )
}
