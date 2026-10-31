import { useState, useEffect, useMemo } from 'react'
import { X, Copy, Check, MessageSquare, Mail, Sparkles } from 'lucide-react'
import { listProperties } from '../services/crmApi'
import { createFollowUp } from '../services/staffApi'
import type { CRMProperty } from '../types/crm'

const NAVY = '#3B2348'
const GOLD = '#C6A15B'
const BORDER = '#E8DCC8'
const TEXT_MAIN = '#26232B'
const TEXT_MUTED = '#7A6B78'

interface ProposalShareModalProps {
  leadId: number
  customerName?: string | null
  phone?: string | null
  email?: string | null
  preferredLocation?: string | null
  budget?: string | null
  onClose: () => void
  onSuccess?: () => void
}

export function ProposalShareModal({
  leadId,
  customerName,
  phone,
  email,
  preferredLocation,
  budget,
  onClose,
  onSuccess,
}: ProposalShareModalProps) {
  const [properties, setProperties] = useState<CRMProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [customIntro, setCustomIntro] = useState('')
  const [copied, setCopied] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listProperties()
      .then((res) => {
        if (active) {
          setProperties(res || [])
          // Pre-select matching properties if location matches
          if (preferredLocation && res && res.length > 0) {
            const locLower = preferredLocation.toLowerCase()
            const match = res.filter((p) => p.location.toLowerCase().includes(locLower) || (p.community && p.community.toLowerCase().includes(locLower)))
            if (match.length > 0) {
              setSelectedIds(match.slice(0, 2).map((p) => p.id))
            } else {
              setSelectedIds([res[0].id])
            }
          } else if (res && res.length > 0) {
            setSelectedIds([res[0].id])
          }
        }
      })
      .catch(() => {
        if (active) setProperties([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [preferredLocation])

  const filteredProperties = useMemo(() => {
    if (!searchTerm.trim()) return properties
    const q = searchTerm.toLowerCase()
    return properties.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.ref_code.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.property_type.toLowerCase().includes(q)
    )
  }, [properties, searchTerm])

  const selectedProperties = useMemo(() => {
    return properties.filter((p) => selectedIds.includes(p.id))
  }, [properties, selectedIds])

  const toggleProperty = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const generatedProposalText = useMemo(() => {
    const greeting = customerName ? `Dear ${customerName},` : 'Dear Valued Client,'
    const intro = customIntro.trim()
      ? customIntro.trim()
      : `Following our consultation regarding luxury residences in Dubai, here are exclusive property recommendations curated specifically for your requirements:`

    let propBullets = ''
    if (selectedProperties.length > 0) {
      propBullets = selectedProperties
        .map((p, idx) => {
          const price = p.price_sale
            ? `AED ${p.price_sale.toLocaleString()}`
            : p.price_rent_monthly
            ? `AED ${p.price_rent_monthly.toLocaleString()}/month`
            : 'Price on Application'
          const specs = `${p.bedrooms} Beds • ${p.bathrooms} Baths • ${p.size_sqft ? p.size_sqft.toLocaleString() + ' sq ft' : ''}`
          return `${idx + 1}. *${p.title}* (${p.property_type})\n   📍 Location: ${p.location}${p.community ? ` (${p.community})` : ''}\n   📐 ${specs}\n   💰 Price: ${price}\n   ✨ Key Highlights: ${p.amenities?.slice(0, 3).join(', ') || 'Prime luxury finish'}`
        })
        .join('\n\n')
    } else {
      propBullets = '(Please select properties from the list below to populate recommendations)'
    }

    return `🏛️ *LYKA REALTY — EXCLUSIVE PROPERTY PROPOSAL*\n\n${greeting}\n\n${intro}\n\n${propBullets}\n\nWould you like to schedule a private viewing or review detailed floor plans for these residences this week?\n\nWarm regards,\nLYKA Realty Luxury Advisory\nDubai, UAE`
  }, [customerName, customIntro, selectedProperties])

  const logActivityRecord = async (actionDesc: string) => {
    try {
      await createFollowUp(
        leadId,
        `[Property Proposal] ${actionDesc} (${selectedProperties.length} properties selected: ${selectedProperties.map((p) => p.ref_code).join(', ')})`
      )
      setActionNotice('Activity recorded in lead history!')
      setTimeout(() => setActionNotice(null), 3000)
      onSuccess?.()
    } catch {
      // silent
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedProposalText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      logActivityRecord('Proposal copied to clipboard')
    } catch {
      // fallback
    }
  }

  const handleWhatsApp = () => {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '')
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(generatedProposalText)}`
      : `https://wa.me/?text=${encodeURIComponent(generatedProposalText)}`
    window.open(url, '_blank')
    logActivityRecord(`Proposal dispatched via WhatsApp to ${phone || 'client'}`)
  }

  const handleEmail = () => {
    const subject = encodeURIComponent(`Exclusive LYKA Realty Curated Property Portfolio for ${customerName || 'You'}`)
    const body = encodeURIComponent(generatedProposalText)
    const url = `mailto:${email || ''}?subject=${subject}&body=${body}`
    window.open(url, '_blank')
    logActivityRecord(`Proposal dispatched via Email to ${email || 'client'}`)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(38, 35, 43, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#FAF7F0',
          borderRadius: '16px',
          border: `1px solid ${BORDER}`,
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
            padding: '20px 24px',
            color: '#FFFFFF',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 700,
                color: GOLD,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '4px',
              }}
            >
              <Sparkles size={14} /> Luxury Property Proposal Generator
            </div>
            <h2
              className="luxury-serif"
              style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#FAF7F0' }}
            >
              Curate Portfolio for {customerName || `Lead #${leadId}`}
            </h2>
            <div style={{ fontSize: '12px', color: '#EEE7F2', marginTop: '2px' }}>
              Target: {preferredLocation || 'Dubai'} • Budget: {budget || 'Flexible'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {actionNotice && (
            <div
              style={{
                padding: '10px 14px',
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: '8px',
                color: '#065F46',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Check size={16} /> {actionNotice}
            </div>
          )}

          {/* Step 1: Select Properties */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>
                1. Select Properties to Include ({selectedIds.length} selected)
              </label>
              <input
                type="text"
                placeholder="Search inventory…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '12px',
                  width: '180px',
                  background: '#FFFFFF',
                }}
              />
            </div>

            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: TEXT_MUTED, fontSize: '13px' }}>
                Loading property catalogue…
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '10px',
                  maxHeight: '190px',
                  overflowY: 'auto',
                  padding: '4px',
                  background: '#FFFFFF',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '8px',
                }}
              >
                {filteredProperties.slice(0, 20).map((prop) => {
                  const isSelected = selectedIds.includes(prop.id)
                  const price = prop.price_sale
                    ? `AED ${(prop.price_sale / 1000000).toFixed(1)}M`
                    : prop.price_rent_monthly
                    ? `AED ${prop.price_rent_monthly.toLocaleString()}/mo`
                    : 'POA'
                  return (
                    <div
                      key={prop.id}
                      onClick={() => toggleProperty(prop.id)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: `1.5px solid ${isSelected ? GOLD : BORDER}`,
                        background: isSelected ? '#FAF5EA' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: GOLD }}>
                          {prop.ref_code}
                        </span>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ accentColor: GOLD }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 700,
                          color: NAVY,
                          margin: '3px 0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {prop.title}
                      </div>
                      <div style={{ fontSize: '11px', color: TEXT_MUTED }}>
                        {prop.property_type} • {prop.bedrooms} Bed • {prop.location}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, marginTop: '4px' }}>
                        {price}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Step 2: Custom Intro / Message Preview */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>
                2. Proposal Message Preview
              </label>
              <input
                type="text"
                placeholder="Optional customized intro note…"
                value={customIntro}
                onChange={(e) => setCustomIntro(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '5px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '11.5px',
                  width: '260px',
                }}
              />
            </div>
            <textarea
              readOnly
              value={generatedProposalText}
              rows={8}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${BORDER}`,
                fontSize: '12.5px',
                lineHeight: '1.5',
                fontFamily: 'monospace',
                background: '#FFFFFF',
                color: TEXT_MAIN,
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Action Footer */}
        <div
          style={{
            background: '#FFFFFF',
            borderTop: `1px solid ${BORDER}`,
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>
            {phone ? `WhatsApp ready: ${phone}` : 'No phone registered (Copy proposal manually)'}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 15px',
                background: '#FAF7F0',
                border: `1px solid ${BORDER}`,
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                color: NAVY,
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
              {copied ? 'Copied to Clipboard!' : 'Copy Text'}
            </button>

            {email && (
              <button
                type="button"
                onClick={handleEmail}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 15px',
                  background: '#FAF7F0',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: NAVY,
                  cursor: 'pointer',
                }}
              >
                <Mail size={14} color={GOLD} /> Email Proposal
              </button>
            )}

            <button
              type="button"
              onClick={handleWhatsApp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
              }}
            >
              <MessageSquare size={14} /> Send via WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
