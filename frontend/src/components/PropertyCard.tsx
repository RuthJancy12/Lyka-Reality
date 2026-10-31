import React, { useEffect, useRef, useState } from 'react'
import { Heart, Bed, Bath, Maximize2, MapPin, ArrowRight, EllipsisVertical, Eye, Share2, Check } from 'lucide-react'
import type { Property } from '../types/property'
import { shareProperty } from '../utils/share'
import { trackPropertyEvent } from '../services/propertyAnalytics'
import { getPropertyImages } from '../utils/propertyData'

interface PropertyCardProps {
  property: Property
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  onSelectProperty: (property: Property) => void
  matchExplanation?: string
  priority?: boolean
}

export function PropertyCard({
  property,
  isFavorite,
  onToggleFavorite,
  onSelectProperty,
  matchExplanation,
  priority = false
}: PropertyCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  // Count one real card impression when at least 35% of the card is visible.
  // The service deduplicates per visitor/property/day; the observer prevents
  // scroll jitter from firing repeatedly.
  useEffect(() => {
    const node = cardRef.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      trackPropertyEvent(property.property_id, 'impression', 'card')
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35)) {
        trackPropertyEvent(property.property_id, 'impression', 'card')
        observer.disconnect()
      }
    }, { threshold: [0.35] })
    observer.observe(node)
    return () => observer.disconnect()
  }, [property.property_id])

  const formattedPrice = new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0
  }).format(property.price_aed)

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite(property.property_id)
  }

  // Card overflow menu (View / Share / Save). No such menu existed before;
  // this is the working implementation (closes on select, backdrop, Escape).
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)

  const closeMenu = () => setMenuOpen(false)

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setShareFeedback(null)
    try {
      const method = await shareProperty(property, {
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      })
      setShareFeedback(method === 'native' ? 'Shared' : 'Link copied')
    } catch {
      setShareFeedback('Sharing unavailable')
    }
    closeMenu()
  }

  const menuItem: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    textAlign: 'left',
    padding: '9px 12px',
    fontSize: '13px',
    color: 'var(--text-main)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '6px',
  }

  return (
    <div
      ref={cardRef}
      onClick={() => onSelectProperty(property)}
      style={{
        background: '#FFFFFF',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--champagne-border)',
        boxShadow: 'var(--shadow-card)',
        transition: 'all 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.borderColor = 'var(--gold-primary)'
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = 'var(--champagne-border)'
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
      }}
    >
      {/* Large Property Image */}
      <div style={{ position: 'relative', width: '100%', height: '240px', overflow: 'hidden', background: 'var(--champagne-surface)' }}>
        <img
          src={property.image_url}
          alt={property.title}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          width="400"
          height="240"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.4s ease'
          }}
          onError={(e) => {
            const fallback = getPropertyImages(property.property_type, property.property_id).primary
            if (e.currentTarget.src !== fallback) {
              e.currentTarget.src = fallback
            }
          }}
        />

        {/* Status Tag */}
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          display: 'flex',
          gap: '6px'
        }}>
          <span style={{
            background: 'var(--plum-main)',
            color: 'var(--gold-hover)',
            border: '1px solid var(--gold-border)',
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '4px',
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}>
            For {property.listing_type}
          </span>
          <span style={{
            background: '#FFFFFF',
            color: 'var(--plum-main)',
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid var(--champagne-border)'
          }}>
            {property.property_type}
          </span>
        </div>

        {/* Favorite Button */}
        <button
          type="button"
          onClick={handleFavoriteClick}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: '#FFFFFF',
            border: '1px solid var(--champagne-border)',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isFavorite ? 'var(--rose-primary)' : 'var(--text-secondary)'
          }}
        >
          <Heart size={16} fill={isFavorite ? 'var(--rose-primary)' : 'none'} />
        </button>

        {/* Card menu: View Details / Share / Save (no menu existed before) */}
        <div style={{ position: 'absolute', top: '12px', right: '52px' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
              setShareFeedback(null)
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Property actions"
            title="More actions"
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--champagne-border)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <EllipsisVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeMenu()
                }}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'default',
                  zIndex: 40
                }}
              />
              <div
                role="menu"
                aria-label="Property actions"
                style={{
                  position: 'absolute',
                  top: '38px',
                  right: 0,
                  minWidth: '168px',
                  background: '#FFFFFF',
                  border: '1px solid var(--champagne-border)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 28px rgba(26, 13, 24, 0.16)',
                  padding: '5px',
                  zIndex: 41
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeMenu()
                    onSelectProperty(property)
                  }}
                  style={menuItem}
                >
                  <Eye size={13} /> View Details
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleShare}
                  style={menuItem}
                >
                  <Share2 size={13} /> Share
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleFavoriteClick(e)
                    closeMenu()
                  }}
                  style={menuItem}
                >
                  <Heart size={13} fill={isFavorite ? 'var(--rose-primary)' : 'none'} />
                  {isFavorite ? 'Unsave' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
        {shareFeedback && (
          <div
            role="status"
            style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              background: 'rgba(26, 13, 24, 0.92)',
              color: '#FFFFFF',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '5px 11px',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Check size={12} /> {shareFeedback}
          </div>
        )}
      </div>

      {/* Property Details Body */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
        <div>
          {/* Price Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--plum-main)' }}>
              {formattedPrice}
              {property.listing_type === 'Rent' && (
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}> / yr</span>
              )}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              AED {property.price_per_sqft_aed.toLocaleString('en-US')}/sqft
            </span>
          </div>

          {/* Property Name */}
          <h3 style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-main)',
            lineHeight: 1.4,
            marginBottom: '6px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: '42px'
          }}>
            {property.title}
          </h3>

          {/* Location */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: property.isNearbyAlternative ? '6px' : '14px' }}>
            <MapPin size={14} color="var(--rose-primary)" style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {property.location} &bull; {property.street}
            </span>
          </div>
          {property.isNearbyAlternative && (
            <div style={{ marginBottom: '10px' }}>
              <span
                title={property.nearbyRequestedLocation ? `No exact match in ${property.nearbyRequestedLocation} — nearby alternative` : 'Nearby alternative'}
                style={{ display: 'inline-block', padding: '2px 9px', background: '#FBF3E3', color: '#8A6E30', fontSize: '10.5px', fontWeight: 800, borderRadius: '999px', border: '1px solid #E5D3AC', letterSpacing: '0.02em' }}
              >
                Nearby alternative · {property.actualLocation || property.location}
              </span>
            </div>
          )}

          {/* Specs: Bedrooms | Bathrooms | Area */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            padding: '10px 0',
            borderTop: '1px solid var(--champagne-border)',
            borderBottom: '1px solid var(--champagne-border)',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <Bed size={15} color="var(--gold-dark)" />
              <span>{property.bhk === 0 ? 'Studio' : `${property.bhk} Beds`}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <Bath size={15} color="var(--gold-dark)" />
              <span>{property.bathrooms} Baths</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <Maximize2 size={15} color="var(--gold-dark)" />
              <span>{property.property_size_sqft.toLocaleString()} sqft</span>
            </div>
          </div>

          {matchExplanation && (
            <div style={{
              background: 'var(--champagne-surface)',
              border: '1px solid var(--champagne-border)',
              borderRadius: '6px',
              padding: '8px 10px',
              fontSize: '11px',
              color: 'var(--plum-main)',
              marginBottom: '14px',
              lineHeight: 1.4
            }}>
              <strong>Consultancy Note:</strong> {matchExplanation}
            </div>
          )}
        </div>

        {/* View Property Button */}
        <button
          type="button"
          onClick={() => onSelectProperty(property)}
          className="navy-btn"
          style={{
            width: '100%',
            padding: '10px 16px',
            fontSize: '13px',
            borderRadius: '4px'
          }}
        >
          <span>View Property</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
