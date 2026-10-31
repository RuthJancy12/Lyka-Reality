import { CheckCircle2, Award, ArrowRight } from 'lucide-react'

interface DubaiInvestmentProps {
  onExploreInvestment?: () => void
}

export function DubaiInvestment({ onExploreInvestment }: DubaiInvestmentProps) {
  const points = [
    {
      title: 'Tax-Friendly Environment',
      desc: '0% personal income tax, 0% capital gains tax, and 0% property tax for individual real estate investors.'
    },
    {
      title: 'Strong Rental Demand',
      desc: 'Consistently higher yields (7% - 10%) compared to major global metropolises such as London, New York, or Singapore.'
    },
    {
      title: 'Consistent Capital Appreciation',
      desc: 'Sustained economic growth, high population inflows, and strategic foreign direct investment frameworks.'
    },
    {
      title: '10-Year UAE Golden Visa Opportunities',
      desc: 'Property purchases of AED 2M or more qualify international buyers and their immediate families for long-term residency.'
    },
    {
      title: 'World-Class Infrastructure & Safety',
      desc: 'Globally ranked among the safest cities with advanced smart transport, airport connectivity, and international healthcare.'
    }
  ]

  return (
    <section id="investment" style={{
      background: 'var(--champagne-light)',
      borderBottom: '1px solid var(--champagne-border)',
      padding: '90px 0'
    }}>
      <div className="container">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: '50px',
          alignItems: 'center'
        }}>
          {/* Left: Large Dubai Architectural Image */}
          <div style={{ position: 'relative' }}>
            <div style={{
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-lg)',
              height: '520px',
              border: '1px solid var(--champagne-border)'
            }}>
              <img
                src="https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1200&q=80"
                alt="Dubai Marina Investment Skyline"
                loading="lazy"
                decoding="async"
                width="600"
                height="520"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            {/* Subtle Overlay Stat Box */}
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '24px',
              background: 'var(--plum-deep)',
              borderRadius: '8px',
              padding: '16px 20px',
              boxShadow: '0 10px 25px rgba(26, 13, 24, 0.4)',
              border: '1px solid var(--gold-border)',
              maxWidth: '260px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Award size={18} color="var(--gold-primary)" />
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gold-primary)', letterSpacing: '0.05em' }}>
                  Market Performance
                </span>
              </div>
              <div className="luxury-serif" style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF' }}>
                8.4% Avg Yield
              </div>
              <div style={{ fontSize: '11px', color: 'var(--champagne-muted)' }}>
                Top performing global tier-1 real estate hub
              </div>
            </div>
          </div>

          {/* Right: Investment Strategic Advantages */}
          <div>
            <span style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              fontWeight: 700,
              color: 'var(--rose-primary)'
            }}>
              Why Invest in Dubai
            </span>
            <h2 className="luxury-serif" style={{
              fontSize: '36px',
              fontWeight: 600,
              color: 'var(--plum-deep)',
              marginTop: '8px',
              marginBottom: '16px',
              lineHeight: 1.2
            }}>
              A World-Leading Hub for Real Estate Wealth
            </h2>
            <p style={{
              color: 'var(--text-secondary)',
              fontSize: '15px',
              lineHeight: 1.6,
              marginBottom: '28px'
            }}>
              Dubai combines economic security, sovereign governance, and strategic international location to offer exceptional capital protection and reliable cash yields.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '32px' }}>
              {points.map((pt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: 'var(--rose-light)',
                    border: '1px solid var(--rose-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    <CheckCircle2 size={15} color="var(--rose-primary)" />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--plum-deep)', marginBottom: '3px' }}>
                      {pt.title}
                    </h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                      {pt.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={onExploreInvestment}
              className="gold-btn"
              style={{ padding: '12px 28px', fontSize: '14px' }}
            >
              <span>Download Investment Guide</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
