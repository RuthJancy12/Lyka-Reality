import { useState } from 'react'
import { CheckCircle2, Phone, Mail, MapPin, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react'
import { submitPublicEnquiry } from '../services/api'
import { collectLeadSource, normalizeDiscoverySource } from '../utils/leadSource'
import { DiscoverySourceSelect } from './DiscoverySourceSelect'

export function ContactConsultation() {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    requirement: 'Buy Luxury Property',
    message: '',
    discoverySource: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const requirement = formData.requirement
      const isRent = /rental|rent/i.test(requirement)
      const isSell = /sell/i.test(requirement)
      await submitPublicEnquiry({
        customer_name: formData.name.trim(),
        contact_email: formData.email.trim(),
        contact_phone: formData.phone.trim() || undefined,
        message: `Requirement: ${requirement}${formData.message.trim() ? ` — ${formData.message.trim()}` : ''}`,
        lead_type: isSell ? undefined : isRent ? 'renter' : 'buyer',
        discovery_source: normalizeDiscoverySource(formData.discoverySource),
        ...collectLeadSource(),
      })
      // Success is shown ONLY after the backend confirms the save (HTTP 201).
      setSubmitted(true)
      setTimeout(() => {
        setSubmitted(false)
        setFormData({ name: '', phone: '', email: '', requirement: 'Buy Luxury Property', message: '', discoverySource: '' })
      }, 4500)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to send enquiry. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section id="contact" style={{
      background: 'var(--champagne-light)',
      borderBottom: '1px solid var(--champagne-border)',
      padding: '90px 0'
    }}>
      <div className="container">
        <div className="contact-card" style={{
          maxWidth: '1080px',
          margin: '0 auto',
          background: 'var(--champagne-surface)',
          borderRadius: '12px',
          border: '1px solid var(--champagne-border)',
          padding: '48px',
          boxShadow: '0 10px 30px rgba(26, 13, 24, 0.05)'
        }}>
          <div className="contact-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: '48px',
            alignItems: 'start'
          }}>
            {/* Left: Heading & Direct Contacts */}
            <div>
              <span style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                fontWeight: 700,
                color: 'var(--rose-primary)'
              }}>
                Private Advisory
              </span>
              <h2 className="luxury-serif" style={{
                fontSize: '34px',
                fontWeight: 600,
                color: 'var(--plum-deep)',
                marginTop: '8px',
                marginBottom: '12px',
                lineHeight: 1.2
              }}>
                Let&apos;s Find Your Dubai Property
              </h2>
              <p style={{
                color: 'var(--text-secondary)',
                fontSize: '15px',
                lineHeight: 1.6,
                marginBottom: '32px'
              }}>
                Tell us what you&apos;re looking for and our team will help you find the right opportunity.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '32px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <MapPin size={18} color="var(--gold-dark)" style={{ flexShrink: 0, marginTop: '3px' }} />
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--plum-deep)', display: 'block' }}>Headquarters</strong>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Level 32, Boulevard Plaza Tower 1, Downtown Dubai, UAE</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Phone size={18} color="var(--gold-dark)" style={{ flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--plum-deep)', display: 'block' }}>Advisory Desk</strong>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>+971 4 800 LYKA (5952)</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Mail size={18} color="var(--gold-dark)" style={{ flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--plum-deep)', display: 'block' }}>Client Enquiries</strong>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>concierge@lykarealty.ae</span>
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--rose-primary)',
                paddingTop: '16px',
                borderTop: '1px solid var(--champagne-border)'
              }}>
                <ShieldCheck size={16} />
                <span>RERA Registered &bull; Licensed Dubai Real Estate Brokers</span>
              </div>
            </div>

            {/* Right: Clean Enquiry Form */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '8px',
              padding: '32px',
              border: '1px solid var(--champagne-border)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              {submitted ? (
                <div style={{ textAlign: 'center', padding: '36px 12px' }}>
                  <CheckCircle2 size={40} color="var(--gold-primary)" style={{ margin: '0 auto 12px' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--plum-deep)', marginBottom: '8px' }}>
                    Consultation Request Received
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Thank you, {formData.name || 'Valued Client'}. A Senior Lyka Property Advisor will contact you within 30 minutes.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
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
                        padding: '10px 12px',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                        outlineColor: 'var(--gold-primary)'
                      }}
                    />
                  </div>

                  <div className="contact-duo" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                        Phone / WhatsApp *
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
                          padding: '10px 12px',
                          fontSize: '13px',
                          color: 'var(--text-main)',
                          outlineColor: 'var(--gold-primary)'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
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
                          padding: '10px 12px',
                          fontSize: '13px',
                          color: 'var(--text-main)',
                          outlineColor: 'var(--gold-primary)'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                      Property Requirement
                    </label>
                    <select
                      value={formData.requirement}
                      onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
                      style={{
                        width: '100%',
                        background: '#FFFFFF',
                        border: '1px solid var(--champagne-border)',
                        borderRadius: '4px',
                        padding: '10px 12px',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                        outlineColor: 'var(--gold-primary)'
                      }}
                    >
                      <option value="Buy Luxury Property">Buy Luxury Property</option>
                      <option value="Off-Plan Investment (High ROI)">Off-Plan Investment (High ROI)</option>
                      <option value="Prime Rental Residence">Prime Rental Residence</option>
                      <option value="Sell / List My Property">Sell / List My Property</option>
                      <option value="UAE Golden Visa Guidance">UAE Golden Visa Guidance</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                      Message
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Share your preferred community, bedroom count, or budget parameters..."
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      style={{
                        width: '100%',
                        background: '#FFFFFF',
                        border: '1px solid var(--champagne-border)',
                        borderRadius: '4px',
                        padding: '10px 12px',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                        resize: 'none',
                        fontFamily: 'inherit',
                        outlineColor: 'var(--gold-primary)'
                      }}
                    />
                  </div>

                  <DiscoverySourceSelect
                    id="lyka-contact-discovery-source"
                    value={formData.discoverySource}
                    onChange={(v) => setFormData({ ...formData, discoverySource: v })}
                    variant="form"
                  />

                  {/* Button: "Book a Consultation" (Gold Luxury CTA) */}
                  {submitError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '10px 12px',
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: '#991B1B'
                    }} role="alert">
                      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                      <span>{submitError}</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="gold-btn"
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '14px',
                      borderRadius: '4px',
                      marginTop: '4px',
                      opacity: submitting ? 0.6 : 1
                    }}
                  >
                    <span>{submitting ? 'Sending…' : 'Book a Consultation'}</span>
                    <ArrowRight size={15} />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
