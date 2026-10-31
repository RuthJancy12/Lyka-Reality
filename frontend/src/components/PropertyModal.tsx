import { useEffect, useState } from 'react'
import {
  X, Heart, Bed, Bath, Maximize2, Car, Compass,
  ShieldCheck, Share2, CheckCircle2, MessageSquare, Calendar, AlertCircle
} from 'lucide-react'
import type { Property } from '../types/property'
import { submitPublicEnquiry, formatApiErrorMessage } from '../services/api'
import { trackPropertyEvent } from '../services/propertyAnalytics'
import { collectLeadSource, normalizeDiscoverySource } from '../utils/leadSource'
import { DiscoverySourceSelect } from './DiscoverySourceSelect'
import { SmartPropertyIntelligence } from './SmartPropertyIntelligence'
import { VirtualPropertyTour } from './VirtualPropertyTour'

interface PropertyModalProps {
  property: Property | null
  isOpen: boolean
  onClose: () => void
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
}

export function PropertyModal({ property, isOpen, onClose, isFavorite, onToggleFavorite }: PropertyModalProps) {
  const [activeImageIdx, setActiveImageIdx] = useState(0)
  const [formSubmitted, setFormSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', preferredDate: '', discoverySource: '' })
  const [modalTab, setModalTab] = useState<'overview' | 'intelligence' | 'virtual_tour'>('overview')

  // A view is recorded when the detail modal is actually opened for a real
  // listing. Server-side dedupe is per visitor/property/hour.
  useEffect(() => {
    if (isOpen && property) {
      trackPropertyEvent(property.property_id, 'view', 'modal')
    }
  }, [isOpen, property])

  if (!isOpen || !property) return null

  const formattedPrice = new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0
  }).format(property.price_aed)

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || !property) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitPublicEnquiry({
        customer_name: formData.name.trim(),
        contact_email: formData.email.trim(),
        contact_phone: formData.phone.trim() || undefined,
        property_ref: property.property_id,
        property_title: property.title,
        location: property.location,
        lead_type: property.listing_type === 'Rent' ? 'renter' : 'buyer',
        property_type: property.property_type,
        preferred_date: formData.preferredDate || undefined,
        discovery_source: normalizeDiscoverySource(formData.discoverySource),
        ...collectLeadSource(),
      })
      // Success is shown ONLY after the backend confirms the save (HTTP 201).
      setFormSubmitted(true)
      setTimeout(() => {
        setFormSubmitted(false)
      }, 4000)
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : formatApiErrorMessage(err, 'Failed to send enquiry. Please try again.')
      )
    } finally {
      setSubmitting(false)
    }
  }

  const galleryImages = property.image_gallery && property.image_gallery.length > 0
    ? property.image_gallery
    : [property.image_url]

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: property.title,
        text: `Check out ${property.title} on Lyka Realty Dubai!`,
        url: window.location.href
      }).catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
      alert('Property link copied to clipboard!')
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1100,
      background: 'rgba(26, 13, 24, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div
        className="propmodal-outer"
        style={{
          width: '100%',
          maxWidth: '960px',
          maxHeight: '90vh',
          borderRadius: '10px',
          overflowY: 'auto',
          position: 'relative',
          border: '1px solid var(--champagne-border)',
          boxShadow: '0 20px 50px rgba(26, 13, 24, 0.5)',
          background: '#FFFFFF'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header (Deep Plum luxury header) */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--plum-deep)',
          padding: '16px 24px',
          borderBottom: '1px solid var(--gold-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--gold-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
              Ref: {property.property_id} &bull; Verified Freehold &bull; {property.listing_type}
            </span>
            <h2 className="luxury-serif" style={{ fontSize: '20px', color: '#FFFFFF', margin: '2px 0 0', fontWeight: 600 }}>
              {property.title}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => onToggleFavorite(property.property_id)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--gold-border)',
                borderRadius: '4px',
                padding: '7px',
                cursor: 'pointer',
                color: isFavorite ? 'var(--rose-primary)' : 'var(--gold-primary)'
              }}
              title="Bookmark Property"
            >
              <Heart size={18} fill={isFavorite ? 'var(--rose-primary)' : 'none'} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--gold-border)',
                borderRadius: '4px',
                padding: '7px',
                cursor: 'pointer',
                color: 'var(--gold-primary)'
              }}
              title="Share Listing"
            >
              <Share2 size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--gold-border)',
                borderRadius: '4px',
                padding: '7px',
                cursor: 'pointer',
                color: '#FFFFFF'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs: Overview, Smart Intelligence, Virtual Tour */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 24px',
            background: 'var(--theme-surface-elevated, #FAF7F0)',
            borderBottom: '1px solid var(--theme-border, #E8DCC8)',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => setModalTab('overview')}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: modalTab === 'overview' ? '1px solid var(--theme-primary, #3B2348)' : '1px solid transparent',
              background: modalTab === 'overview' ? 'var(--theme-primary, #3B2348)' : 'transparent',
              color: modalTab === 'overview' ? '#FFFFFF' : 'var(--theme-text, #26232B)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
            }}
          >
            📋 Listing Overview
          </button>
          <button
            type="button"
            onClick={() => setModalTab('intelligence')}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: modalTab === 'intelligence' ? '1px solid var(--theme-primary, #3B2348)' : '1px solid transparent',
              background: modalTab === 'intelligence' ? 'var(--theme-primary, #3B2348)' : 'transparent',
              color: modalTab === 'intelligence' ? '#FFFFFF' : 'var(--theme-text, #26232B)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
            }}
          >
            🧠 Smart Property Intelligence
          </button>
          <button
            type="button"
            onClick={() => setModalTab('virtual_tour')}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: modalTab === 'virtual_tour' ? '1px solid var(--theme-primary, #3B2348)' : '1px solid transparent',
              background: modalTab === 'virtual_tour' ? 'var(--theme-primary, #3B2348)' : 'transparent',
              color: modalTab === 'virtual_tour' ? '#FFFFFF' : 'var(--theme-text, #26232B)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
            }}
          >
            🔄 360° Virtual Tour &amp; Walkthrough
          </button>
        </div>

        <div className="propmodal-body" style={{ padding: '24px' }}>
          {modalTab === 'intelligence' ? (
            <SmartPropertyIntelligence property={property} />
          ) : modalTab === 'virtual_tour' ? (
            <VirtualPropertyTour property={property} onRequestViewing={() => setModalTab('overview')} />
          ) : (
            <>
          {/* Gallery View */}
          <div style={{ marginBottom: '24px' }}>
            <div className="propmodal-gallery" style={{
              width: '100%',
              height: '400px',
              borderRadius: '8px',
              overflow: 'hidden',
              position: 'relative',
              background: 'var(--champagne-surface)',
              border: '1px solid var(--champagne-border)'
            }}>
              <img
                src={galleryImages[activeImageIdx] || property.image_url}
                alt={property.title}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                width="800"
                height="400"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute',
                bottom: '16px',
                left: '16px',
                background: 'rgba(26, 13, 24, 0.88)',
                border: '1px solid var(--gold-border)',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                color: 'var(--champagne-light)'
              }}>
                {property.view} &bull; Image {activeImageIdx + 1} of {galleryImages.length}
              </div>
            </div>

            {/* Thumbnail selector */}
            {galleryImages.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                {galleryImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIdx(idx)}
                    style={{
                      width: '76px',
                      height: '56px',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: activeImageIdx === idx ? '2px solid var(--gold-primary)' : '1px solid var(--champagne-border)',
                      opacity: activeImageIdx === idx ? 1 : 0.65,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    <img src={img} alt={`thumb-${idx}`} loading="lazy" decoding="async" width="76" height="56" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pricing & Key specs row */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            padding: '20px',
            background: 'var(--champagne-surface)',
            borderRadius: '8px',
            border: '1px solid var(--champagne-border)',
            marginBottom: '24px'
          }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--rose-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Listing Price ({property.listing_type})
              </span>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--plum-deep)' }}>
                {formattedPrice} {property.listing_type === 'Rent' && <span style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>/ year</span>}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                AED {property.price_per_sqft_aed.toLocaleString('en-US')} / sqft
                {property.rent_cheques && ` &bull; Payable in ${property.rent_cheques} Cheques`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--gold-dark)', display: 'flex', justifyContent: 'center', marginBottom: '2px' }}><Bed size={20} /></div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--plum-deep)' }}>{property.bhk === 0 ? 'Studio' : `${property.bhk} Beds`}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Bedrooms</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--gold-dark)', display: 'flex', justifyContent: 'center', marginBottom: '2px' }}><Bath size={20} /></div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--plum-deep)' }}>{property.bathrooms}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Bathrooms</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--gold-dark)', display: 'flex', justifyContent: 'center', marginBottom: '2px' }}><Maximize2 size={20} /></div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--plum-deep)' }}>{property.property_size_sqft.toLocaleString()}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Sq. Ft</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--gold-dark)', display: 'flex', justifyContent: 'center', marginBottom: '2px' }}><Car size={20} /></div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--plum-deep)' }}>{property.parking_spaces}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Parking</div>
              </div>
            </div>
          </div>

          {/* Details & Inquiry Two-Column Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '24px', marginBottom: '24px' }}>
            {/* Left: Property Specifications */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--plum-deep)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Compass size={17} color="var(--gold-dark)" /> Specifications
              </h3>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '6px',
                border: '1px solid var(--champagne-border)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--champagne-border)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Community / Location</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{property.location}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--champagne-border)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Street</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{property.street}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--champagne-border)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Furnishing</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{property.furnishing}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--champagne-border)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Facing Direction</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{property.facing_direction} (Entrance: {property.entrance_direction})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--champagne-border)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Nearest Metro</span>
                  <span style={{ fontWeight: 600, color: 'var(--plum-deep)' }}>{property.nearest_metro} ({property.metro_distance_km} km)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--champagne-border)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Highway Access</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{property.nearest_main_road} ({property.main_road_distance_km} km)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Coastline Proximity</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{property.beach_distance_km} km ({property.near_seashore ? 'Waterfront' : 'Inland'})</span>
                </div>
              </div>

              {/* Amenities */}
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--plum-deep)', marginTop: '20px', marginBottom: '10px' }}>
                Amenities &amp; Features
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {property.amenities.map((amenity, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: 'var(--champagne-light)',
                      border: '1px solid var(--champagne-border)',
                      color: 'var(--plum-deep)',
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <CheckCircle2 size={13} color="var(--rose-primary)" /> {amenity}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Consultation Form */}
            <div style={{
              background: 'var(--champagne-surface)',
              border: '1px solid var(--champagne-border)',
              borderRadius: '8px',
              padding: '24px'
            }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--plum-deep)', marginBottom: '4px' }}>
                Enquire About This Property
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Speak directly with an accredited Lyka consultant regarding floor plans and conveyance.
              </p>

              {formSubmitted ? (
                <div style={{
                  padding: '16px',
                  background: '#FFFFFF',
                  border: '1px solid var(--champagne-border)',
                  borderRadius: '6px',
                  textAlign: 'center',
                  color: 'var(--plum-deep)'
                }}>
                  <CheckCircle2 size={28} color="var(--gold-primary)" style={{ margin: '0 auto 6px' }} />
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>Enquiry Dispatched</div>
                  <p style={{ fontSize: '12px', marginTop: '2px', color: 'var(--text-secondary)' }}>
                    A Lyka advisor will contact you within 30 minutes.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleInquirySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {submitError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '10px 12px',
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#991B1B'
                    }} role="alert">
                      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                      <span>{submitError}</span>
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '3px' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Elena Rostova"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={{
                        width: '100%',
                        background: '#FFFFFF',
                        border: '1px solid var(--champagne-border)',
                        borderRadius: '4px',
                        padding: '9px 10px',
                        color: 'var(--text-main)',
                        fontSize: '13px',
                        outlineColor: 'var(--gold-primary)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '3px' }}>
                      Phone (WhatsApp) *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+971 50 000 0000"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      style={{
                        width: '100%',
                        background: '#FFFFFF',
                        border: '1px solid var(--champagne-border)',
                        borderRadius: '4px',
                        padding: '9px 10px',
                        color: 'var(--text-main)',
                        fontSize: '13px',
                        outlineColor: 'var(--gold-primary)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '3px' }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="elena@investor.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      style={{
                        width: '100%',
                        background: '#FFFFFF',
                        border: '1px solid var(--champagne-border)',
                        borderRadius: '4px',
                        padding: '9px 10px',
                        color: 'var(--text-main)',
                        fontSize: '13px',
                        outlineColor: 'var(--gold-primary)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '3px' }}>
                      Preferred Viewing Date
                    </label>
                    <input
                      type="date"
                      value={formData.preferredDate}
                      onChange={(e) => setFormData({ ...formData, preferredDate: e.target.value })}
                      style={{
                        width: '100%',
                        background: '#FFFFFF',
                        border: '1px solid var(--champagne-border)',
                        borderRadius: '4px',
                        padding: '9px 10px',
                        color: 'var(--text-main)',
                        fontSize: '13px',
                        outlineColor: 'var(--gold-primary)'
                      }}
                    />
                  </div>

                  <DiscoverySourceSelect
                    id="lyka-enquiry-discovery-source"
                    value={formData.discoverySource}
                    onChange={(v) => setFormData({ ...formData, discoverySource: v })}
                    variant="form"
                    labelStyle={{ fontSize: '11px', marginBottom: '3px' }}
                    selectStyle={{ padding: '9px 10px' }}
                  />

                  <button type="submit" disabled={submitting} className="gold-btn" style={{ width: '100%', marginTop: '4px', padding: '10px', opacity: submitting ? 0.6 : 1 }}>
                    <Calendar size={15} /> {submitting ? 'Sending…' : 'Book Viewing'}
                  </button>

                  <a
                    href={`https://wa.me/97148005952?text=Hello%20Lyka%20Realty,%20I%20am%20interested%20in%20${encodeURIComponent(property.title)}%20(Ref:%20${property.property_id})`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackPropertyEvent(property.property_id, 'whatsapp_click', 'whatsapp')}
                    className="outline-navy-btn"
                    style={{ width: '100%', padding: '9px' }}
                  >
                    <MessageSquare size={15} /> WhatsApp Consultant
                  </a>
                </form>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <ShieldCheck size={14} color="var(--rose-primary)" />
                Strict confidentiality. Your data is protected by UAE privacy law.
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
