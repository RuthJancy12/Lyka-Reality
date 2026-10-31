import { RoleMyAccountModal } from './RoleMyAccountModal'
import { NotificationCenter } from './NotificationCenter'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Heart, User, Menu, X, Phone, LogOut, ChevronDown, Sparkles, LayoutDashboard, CircleUserRound } from 'lucide-react'
import { useStaffRole } from '../crm/services/staffApi'


interface NavbarProps {
  favoritesCount: number
  onOpenFavorites: () => void
  onOpenAgent: () => void
  onOpenAuth: () => void
  currentUser: { name: string; email: string } | null
  onLogout: () => void
  onBookCallClick: () => void
}

export function Navbar({
  favoritesCount,
  onOpenFavorites,
  onOpenAgent,
  onOpenAuth,
  currentUser,
  onLogout,
  onBookCallClick
}: NavbarProps) {
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [accountModalTab, setAccountModalTab] = useState('profile')
  const { role: staffRole } = useStaffRole()
  const isStaff = staffRole !== null && ['admin', 'manager', 'hrms_admin', 'sales_agent', 'salesperson'].includes(staffRole)

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
    setMobileMenuOpen(false)
  }

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'var(--plum-deep)',
      borderBottom: '1px solid var(--plum-border)',
      boxShadow: '0 4px 20px rgba(26, 13, 24, 0.35)'
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '78px' }}>
        {/* Lyka Logo on the left */}
        <a href="#" style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src="/logo.png"
            alt="Lyka Realty"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            width="140"
            height="42"
            style={{
              height: '42px',
              width: 'auto',
              objectFit: 'contain',
              display: 'block'
            }}
          />
        </a>

        {/* Clean Navigation Links: Communities | Services | Guides | Mortgage | About | Contact */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '30px' }} className="desktop-nav">
          <button
            onClick={() => scrollTo('communities')}
            style={{ background: 'none', color: 'var(--champagne-light)', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--champagne-light)')}
          >
            Communities
          </button>
          <button
            onClick={() => scrollTo('services')}
            style={{ background: 'none', color: 'var(--champagne-light)', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--champagne-light)')}
          >
            Services
          </button>
          <button
            onClick={() => scrollTo('investment')}
            style={{ background: 'none', color: 'var(--champagne-light)', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--champagne-light)')}
          >
            Guides
          </button>
          <button
            onClick={() => scrollTo('calculator')}
            style={{ background: 'none', color: 'var(--champagne-light)', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--champagne-light)')}
          >
            Mortgage
          </button>
          <button
            onClick={() => scrollTo('about')}
            style={{ background: 'none', color: 'var(--champagne-light)', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--champagne-light)')}
          >
            About
          </button>
          <button
            onClick={() => scrollTo('contact')}
            style={{ background: 'none', color: 'var(--champagne-light)', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--champagne-light)')}
          >
            Contact
          </button>
        </nav>

        {/* Right Actions: Favorites, User Profile, and Gold "Book a Call" CTA */}
        <div className="navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

          {/* Favorites Button (Restricted: Customers Only, Hidden for Staff) */}
          {!isStaff && (
          <button
            onClick={onOpenFavorites}
            style={{
              position: 'relative',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--gold-border)',
              padding: '9px',
              borderRadius: '6px',
              color: favoritesCount > 0 ? 'var(--gold-primary)' : '#D4C3AC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            title="Saved Properties"
          >
            <Heart size={18} fill={favoritesCount > 0 ? 'var(--gold-primary)' : 'none'} color={favoritesCount > 0 ? 'var(--gold-primary)' : '#D4C3AC'} />
            {favoritesCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: 'var(--gold-gradient)',
                color: 'var(--plum-deep)',
                fontSize: '10px',
                fontWeight: 800,
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
              }}>
                {favoritesCount}
              </span>
            )}
          </button>
          )}

                    {currentUser && <NotificationCenter theme="dark" />}

          {/* User Profile */}
          <div style={{ position: 'relative' }}>
            {currentUser ? (
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--gold-border)',
                  borderRadius: '6px',
                  padding: '6px 12px 6px 8px',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'var(--gold-gradient)',
                  color: 'var(--plum-deep)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '12px'
                }}>
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--champagne-light)' }}>
                  {currentUser.name}
                </span>
                {staffRole === 'admin' ? (
                  <span style={{ fontSize: '10px', background: 'rgba(198, 161, 91, 0.3)', color: 'var(--gold-soft, #E2C98D)', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>ADMIN</span>
                ) : staffRole === 'hrms_admin' ? (
                  <span style={{ fontSize: '10px', background: 'rgba(198, 161, 91, 0.3)', color: 'var(--gold-soft, #E2C98D)', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>HRMS</span>
                ) : staffRole === 'sales_agent' || staffRole === 'salesperson' ? (
                  <span style={{ fontSize: '10px', background: 'rgba(198, 161, 91, 0.3)', color: 'var(--gold-soft, #E2C98D)', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>AGENT</span>
                ) : (
                  <span style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.15)', color: 'var(--champagne-light, #FAF7F0)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>CLIENT</span>
                )}
                <ChevronDown size={14} color="var(--gold-hover)" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--champagne-light)',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'color 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--gold-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--champagne-light)')}
              >
                <User size={15} color="var(--gold-hover)" />
                <span>Sign In</span>
              </button>
            )}

            {/* Profile Dropdown */}
            {currentUser && userDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '44px',
                right: 0,
                background: '#FFFFFF',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--champagne-border)',
                width: '190px',
                padding: '6px',
                zIndex: 200
              }}>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--champagne-border)', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--plum-main)' }}>{currentUser.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{currentUser.email}</div>
                </div>
                {!isStaff ? (
                  <>
                    <button
                      onClick={() => {
                        onOpenFavorites()
                        setUserDropdownOpen(false)
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: '4px',
                        background: 'none',
                        border: 'none',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = 'var(--champagne-surface)')}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <Heart size={14} color="var(--gold-dark)" /> Saved Properties ({favoritesCount})
                    </button>
                    <Link
                      to="/account"
                      onClick={() => setUserDropdownOpen(false)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: '4px',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        textDecoration: 'none',
                        boxSizing: 'border-box'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = 'var(--champagne-surface)')}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <CircleUserRound size={14} color="var(--gold-dark)" /> My Account
                    </Link>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setAccountModalTab('profile')
                        setAccountModalOpen(true)
                        setUserDropdownOpen(false)
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: '4px',
                        background: 'none',
                        border: 'none',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = 'var(--champagne-surface)')}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <CircleUserRound size={14} color="var(--gold-dark)" /> My Account
                    </button>
                  </>
                )}
                {isStaff && (
                  <Link
                    to="/crm"
                    onClick={(e) => {
                      if (staffRole === 'hrms_admin') {
                        e.preventDefault()
                        navigate('/crm/hrms')
                      } else if (staffRole === 'sales_agent' || staffRole === 'salesperson') {
                        e.preventDefault()
                        navigate('/crm/my')
                      }
                      setUserDropdownOpen(false)
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      fontSize: '13px',
                      color: 'var(--text-main)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      boxSizing: 'border-box'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'var(--champagne-surface)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <LayoutDashboard size={14} color="var(--gold-dark)" /> My Dashboard (Staff CRM)
                  </Link>
                )}
                <button
                  onClick={() => {
                    onLogout()
                    setUserDropdownOpen(false)
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    background: 'none',
                    border: 'none',
                    fontSize: '13px',
                    color: '#DC2626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#FEF2F2')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            )}
          </div>

          {/* AI Property Assistant CTA (Customers Only) */}
          {!isStaff && (
            <button
              type="button"
              id="navbar-ai-assistant-btn"
              onClick={onOpenAgent}
            style={{
              background: 'rgba(197, 168, 105, 0.12)',
              border: '1px solid var(--gold-border)',
              padding: '8px 16px',
              borderRadius: '6px',
              color: 'var(--gold-hover)',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(197, 168, 105, 0.22)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(197, 168, 105, 0.12)'
            }}
          >
            <Sparkles size={14} color="var(--gold-primary)" />
            <span className="navbar-ai-label">AI Assistant</span>
          </button>
          )}

          {/* ELEGANT CTA BUTTON: "Book a Call" (Radiant Gold Accent) */}
          <button
            type="button"
            onClick={onBookCallClick}
            className="gold-btn navbar-book-btn"
            style={{ padding: '9px 20px', fontSize: '13px' }}
          >
            <Phone size={14} />
            <span>Book a Call</span>
          </button>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--gold-border)',
              padding: '8px',
              borderRadius: '6px',
              color: 'var(--gold-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="mobile-menu-btn"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div style={{
          background: 'var(--plum-deep)',
          borderBottom: '1px solid var(--plum-border)',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <button
            onClick={() => scrollTo('communities')}
            style={{ textAlign: 'left', background: 'none', color: 'var(--champagne-light)', fontSize: '15px', fontWeight: 600, padding: '6px 0' }}
          >
            Communities
          </button>
          <button
            onClick={() => scrollTo('services')}
            style={{ textAlign: 'left', background: 'none', color: 'var(--champagne-light)', fontSize: '15px', fontWeight: 600, padding: '6px 0' }}
          >
            Services
          </button>
          <button
            onClick={() => scrollTo('investment')}
            style={{ textAlign: 'left', background: 'none', color: 'var(--champagne-light)', fontSize: '15px', fontWeight: 600, padding: '6px 0' }}
          >
            Guides
          </button>
          <button
            onClick={() => scrollTo('calculator')}
            style={{ textAlign: 'left', background: 'none', color: 'var(--champagne-light)', fontSize: '15px', fontWeight: 600, padding: '6px 0' }}
          >
            Mortgage
          </button>
          <button
            onClick={() => scrollTo('about')}
            style={{ textAlign: 'left', background: 'none', color: 'var(--champagne-light)', fontSize: '15px', fontWeight: 600, padding: '6px 0' }}
          >
            About
          </button>
          <button
            onClick={() => scrollTo('contact')}
            style={{ textAlign: 'left', background: 'none', color: 'var(--champagne-light)', fontSize: '15px', fontWeight: 600, padding: '6px 0' }}
          >
            Contact
          </button>
        </div>
      )}
          <RoleMyAccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        initialTab={accountModalTab}
        favoritesCount={favoritesCount}
        onOpenFavorites={onOpenFavorites}
      />
    </header>
  )
}
