import { Mail, Phone, MapPin, ShieldCheck, Globe, Briefcase } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer style={{
      background: 'var(--plum-deep)',
      color: '#EFE8DD',
      padding: '70px 0 30px',
      fontSize: '13px',
      borderTop: '1px solid var(--plum-border)'
    }}>
      <div className="container">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '40px',
          marginBottom: '50px'
        }}>
          {/* Col 1: Lyka Logo & Description */}
          <div style={{ maxWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '18px' }}>
              <img
                src="/logo.png"
                alt="Lyka Realty"
                style={{
                  height: '42px',
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'block'
                }}
              />
            </div>
            <p style={{ color: '#C7B8C4', lineHeight: 1.6, marginBottom: '20px' }}>
              Lyka Realty is a licensed Dubai real estate consultancy providing bespoke property acquisition, portfolio management, and investment advisory for discerning international clients.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FBF8F3', fontSize: '12px' }}>
              <ShieldCheck size={16} color="var(--gold-primary)" />
              <span>RERA Registered Office #28941</span>
            </div>
          </div>

          {/* Col 2: Explore */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold-hover)', marginBottom: '16px', letterSpacing: '0.04em' }}>
              Explore
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', padding: 0 }}>
              <li><a href="#properties" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Featured Properties</a></li>
              <li><a href="#properties" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Luxury Villas for Sale</a></li>
              <li><a href="#properties" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Downtown Penthouses</a></li>
              <li><a href="#properties" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Waterfront Apartments</a></li>
              <li><a href="#calculator" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Mortgage Calculator</a></li>
            </ul>
          </div>

          {/* Col 3: Services */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold-hover)', marginBottom: '16px', letterSpacing: '0.04em' }}>
              Services
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', padding: 0 }}>
              <li><a href="#services" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Buy Property</a></li>
              <li><a href="#services" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Rent Property</a></li>
              <li><a href="#services" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Sell Your Property</a></li>
              <li><a href="#investment" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Investment Advisory</a></li>
              <li><a href="#investment" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Golden Visa Assistance</a></li>
            </ul>
          </div>

          {/* Col 4: Communities */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold-hover)', marginBottom: '16px', letterSpacing: '0.04em' }}>
              Communities
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', padding: 0 }}>
              <li><a href="#communities" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Downtown Dubai</a></li>
              <li><a href="#communities" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Dubai Marina</a></li>
              <li><a href="#communities" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Palm Jumeirah</a></li>
              <li><a href="#communities" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Dubai Hills Estate</a></li>
              <li><a href="#communities" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')}>Business Bay</a></li>
            </ul>
          </div>

          {/* Col 5: Dubai Office Information & Socials */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold-hover)', marginBottom: '16px', letterSpacing: '0.04em' }}>
              Contact Office
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: '#BDB0BA' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <MapPin size={15} color="var(--gold-primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span>Level 32, Boulevard Plaza 1, Downtown Dubai</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Phone size={15} color="var(--gold-primary)" style={{ flexShrink: 0 }} />
                <span>+971 4 800 LYKA (5952)</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Mail size={15} color="var(--gold-primary)" style={{ flexShrink: 0 }} />
                <span>concierge@lykarealty.ae</span>
              </div>

              {/* Social Media Icons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <a href="#" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')} aria-label="LinkedIn">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                </a>
                <a href="#" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')} aria-label="Instagram">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                </a>
                <a href="#" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')} aria-label="Facebook">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                </a>
                <a href="#" style={{ color: '#BDB0BA', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')} onMouseOut={(e) => (e.currentTarget.style.color = '#BDB0BA')} aria-label="Website">
                  <Globe size={18} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div style={{
          borderTop: '1px solid var(--plum-border)',
          paddingTop: '24px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          fontSize: '12px',
          color: '#8A7B85'
        }}>
          <div>
            &copy; 2026 Lyka Realty Real Estate LLC. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <a href="#" style={{ color: '#8A7B85', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')} onMouseOut={(e) => (e.currentTarget.style.color = '#8A7B85')}>Privacy Policy</a>
            <a href="#" style={{ color: '#8A7B85', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')} onMouseOut={(e) => (e.currentTarget.style.color = '#8A7B85')}>Terms of Use</a>
            <a href="#" style={{ color: '#8A7B85', transition: 'color 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')} onMouseOut={(e) => (e.currentTarget.style.color = '#8A7B85')}>DLD Regulatory Statement</a>
            <Link to="/crm" style={{ color: '#8A7B85', transition: 'color 0.2s', display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }} onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')} onMouseOut={(e) => (e.currentTarget.style.color = '#8A7B85')} title="Staff sign-in for the LYKA team (roles verified by the server)">
              <Briefcase size={12} /> Employee Login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
