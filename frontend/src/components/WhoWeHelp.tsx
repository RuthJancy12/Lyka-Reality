interface WhoWeHelpProps {
  onCategoryClick?: (category: string) => void
}

export function WhoWeHelp({ onCategoryClick }: WhoWeHelpProps) {
  const groups = [
    {
      title: 'First-Time Buyers',
      tagline: 'Step-by-step clarity',
      desc: 'Expert guidance on DLD fees, mortgage pre-approval, escrow safeguards, and choosing the right starting home in Dubai.',
      image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=600&q=80'
    },
    {
      title: 'NRI & Overseas Buyers',
      tagline: 'Remote transaction ease',
      desc: 'Seamless cross-border currency conveyancing, power of attorney setups, and remote handovers with verified digital security.',
      image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80'
    },
    {
      title: 'Property Investors',
      tagline: 'High yield & capital growth',
      desc: 'Data-driven identification of off-plan launches with 1% monthly payment plans, bulk discounts, and optimal exit horizons.',
      image: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=600&q=80'
    },
    {
      title: 'Luxury Buyers',
      tagline: 'Prime estates & penthouses',
      desc: 'Discreet access to off-market branded residences, beachfront mansions on Palm Jumeirah, and golf estates in Emirates Hills.',
      image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=600&q=80'
    },
    {
      title: 'Families',
      tagline: 'Community & lifestyle',
      desc: 'Sanctuaries with top British & IB academies nearby, gated parks, pedestrian-friendly boulevards, and community health centers.',
      image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80'
    }
  ]

  return (
    <section style={{
      background: 'var(--champagne-surface)',
      borderBottom: '1px solid var(--champagne-border)',
      padding: '90px 0'
    }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontWeight: 700,
            color: 'var(--rose-primary)'
          }}>
            Client Segments
          </span>
          <h2 className="luxury-serif" style={{
            fontSize: '34px',
            fontWeight: 600,
            color: 'var(--plum-deep)',
            marginTop: '8px',
            marginBottom: '12px'
          }}>
            Who We Help
          </h2>
          <p style={{
            color: 'var(--text-secondary)',
            maxWidth: '560px',
            margin: '0 auto',
            fontSize: '15px'
          }}>
            Tailored property discovery paths designed around your citizenship status, life stage, and financial goals.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '20px'
        }}>
          {groups.map((g, idx) => (
            <div
              key={idx}
              onClick={() => onCategoryClick && onCategoryClick(g.title)}
              style={{
                background: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid var(--champagne-border)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-card)',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                display: 'flex',
                flexDirection: 'column'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold-primary)'
                e.currentTarget.style.transform = 'translateY(-3px)'
                e.currentTarget.style.boxShadow = '0 10px 25px rgba(26, 13, 24, 0.08)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--champagne-border)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'var(--shadow-card)'
              }}
            >
              <div style={{ height: '160px', overflow: 'hidden' }}>
                <img
                  src={g.image}
                  alt={g.title}
                  loading="lazy"
                  decoding="async"
                  width="360"
                  height="160"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                <div>
                  <span style={{
                    fontSize: '11px',
                    color: 'var(--rose-primary)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'block',
                    marginBottom: '4px'
                  }}>
                    {g.tagline}
                  </span>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--plum-deep)',
                    marginBottom: '8px'
                  }}>
                    {g.title}
                  </h3>
                  <p style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    margin: 0
                  }}>
                    {g.desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
