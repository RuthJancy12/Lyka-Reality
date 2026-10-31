import { Star } from 'lucide-react'

export function Testimonials() {
  const reviews = [
    {
      name: 'Tariq Al-Mansoor',
      category: 'Overseas Investor • London, UK',
      stars: 5,
      quote: 'Lyka Realty advised me on two off-plan townhouses in Dubai Hills Estate. Their analysis of handover dates and rental yields was remarkably accurate. Highly professional team.'
    },
    {
      name: 'Ananya & Rohit Sharma',
      category: 'NRI Buyers • Mumbai, India',
      stars: 5,
      quote: 'Purchasing our waterfront apartment in Dubai Marina was completely stress-free. The team handled the developer paperwork and remote registration without requiring multiple trips.'
    },
    {
      name: 'Marcus Lindholm',
      category: 'Luxury Villa Buyer • Stockholm, Sweden',
      stars: 5,
      quote: 'Exceptional discretion and access to genuine off-market inventory in Emirates Hills. They secured our family villa on Montgomerie Drive with impeccable transparency.'
    }
  ]

  return (
    <section style={{
      background: 'var(--champagne-light)',
      borderBottom: '1px solid var(--champagne-border)',
      padding: '90px 0'
    }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <span style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontWeight: 700,
            color: 'var(--rose-primary)'
          }}>
            Client Experiences
          </span>
          <h2 className="luxury-serif" style={{
            fontSize: '34px',
            fontWeight: 600,
            color: 'var(--plum-deep)',
            marginTop: '8px',
            marginBottom: '12px'
          }}>
            Trusted by Global Property Owners
          </h2>
          <p style={{
            color: 'var(--text-secondary)',
            maxWidth: '560px',
            margin: '0 auto',
            fontSize: '15px'
          }}>
            Read verified feedback from expatriates, international wealth managers, and local Dubai residents.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: '24px'
        }}>
          {reviews.map((r, idx) => (
            <div
              key={idx}
              style={{
                background: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid var(--champagne-border)',
                padding: '30px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.25s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold-primary)'
                e.currentTarget.style.transform = 'translateY(-3px)'
                e.currentTarget.style.boxShadow = '0 10px 25px rgba(26, 13, 24, 0.08)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--champagne-border)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div>
                {/* 5 Star Rating */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
                  {[...Array(r.stars)].map((_, i) => (
                    <Star key={i} size={16} fill="var(--gold-primary)" color="var(--gold-primary)" />
                  ))}
                </div>

                <p style={{
                  fontSize: '14px',
                  color: 'var(--text-main)',
                  lineHeight: 1.6,
                  fontStyle: 'italic',
                  marginBottom: '20px'
                }}>
                  &ldquo;{r.quote}&rdquo;
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--champagne-border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--plum-deep)', marginBottom: '2px' }}>
                  {r.name}
                </h4>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {r.category}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
