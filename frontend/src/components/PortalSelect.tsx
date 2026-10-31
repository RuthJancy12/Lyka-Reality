import { X, User, Briefcase } from 'lucide-react'

interface PortalSelectProps {
  onSelectCustomer: () => void
  onSelectEmployee: () => void
  onClose: () => void
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid var(--champagne-border)',
  borderRadius: '10px',
  padding: '26px 22px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '10px',
  boxShadow: '0 10px 30px rgba(26, 13, 24, 0.08)',
}

const iconChip: React.CSSProperties = {
  width: '52px',
  height: '52px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--rose-light)',
  border: '1px solid var(--rose-border)',
  color: 'var(--rose-primary)',
}

/**
 * Portal-selection page: clean choice between the customer login and the
 * employee portal. Luxury dark burgundy/gold shell with rose-pink accents.
 * Selects nothing by itself — it only routes to the right interface.
 */
export function PortalSelect({ onSelectCustomer, onSelectEmployee, onClose }: PortalSelectProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1200,
      background: 'rgba(26, 13, 24, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      overflowY: 'auto',
    }}>
      <div className="portal-card" style={{
        background: 'var(--plum-deep)',
        borderRadius: '12px',
        border: '1px solid var(--gold-border)',
        boxShadow: '0 20px 50px rgba(26, 13, 24, 0.5)',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '36px 32px',
        position: 'relative',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign-in"
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--gold-border)',
            borderRadius: '4px',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#FFFFFF',
          }}
        >
          <X size={16} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <img src="/logo.png" alt="Lyka Realty" style={{ height: '30px', width: 'auto', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--rose-accent)', fontWeight: 700 }}>
            Welcome to Lyka Realty
          </span>
          <h3 className="luxury-serif" style={{ fontSize: '24px', fontWeight: 600, color: '#FFFFFF', margin: '6px 0 4px' }}>
            Sign In
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--champagne-dark)', margin: 0 }}>
            Choose the portal that fits you — browsing stays open to everyone.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <div style={cardStyle}>
            <div style={iconChip}><User size={24} /></div>
            <h4 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--plum-deep)', margin: 0 }}>
              Customer Login
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
              Buyers, renters, and investors — saved homes, chats, and your account live here.
            </p>
            <button type="button" onClick={onSelectCustomer} className="gold-btn" style={{ width: '100%', padding: '11px', fontSize: '13px', marginTop: '6px' }}>
              Continue as Customer
            </button>
          </div>

          <div style={cardStyle}>
            <div style={iconChip}><Briefcase size={24} /></div>
            <h4 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--plum-deep)', margin: 0 }}>
              Employee Portal
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
              LYKA team only — verified staff roles open the authorized CRM dashboard.
            </p>
            <button
              type="button"
              onClick={onSelectEmployee}
              className="outline-navy-btn"
              style={{ width: '100%', padding: '11px', fontSize: '13px', marginTop: '6px' }}
            >
              Continue as Employee
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
