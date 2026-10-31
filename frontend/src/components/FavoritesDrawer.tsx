import { X, Trash2, ArrowRight, MessageSquare } from 'lucide-react'
import type { Property } from '../types/property'

interface FavoritesDrawerProps {
  isOpen: boolean
  onClose: () => void
  favoriteProperties: Property[]
  onRemoveFavorite: (id: string) => void
  onSelectProperty: (property: Property) => void
}

export function FavoritesDrawer({
  isOpen,
  onClose,
  favoriteProperties,
  onRemoveFavorite,
  onSelectProperty
}: FavoritesDrawerProps) {
  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1100,
      background: 'rgba(26, 13, 24, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      justifyContent: 'flex-end'
    }}>
      <div
        className="favorites-drawer"
        style={{
          width: '100%',
          maxWidth: '440px',
          height: '100%',
          background: '#FFFFFF',
          borderLeft: '1px solid var(--champagne-border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(26, 13, 24, 0.5)',
          animation: 'slideIn 0.25s ease'
        }}
      >
        {/* Header (Deep Plum luxury header) */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--gold-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--plum-deep)'
        }}>
          <div>
            <h3 className="luxury-serif" style={{ fontSize: '18px', color: '#FFFFFF', margin: 0, fontWeight: 600 }}>
              Saved Properties ({favoriteProperties.length})
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--champagne-muted)' }}>
              Curated shortlist for comparison &amp; inquiry
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--gold-border)',
              borderRadius: '4px',
              padding: '6px',
              color: 'var(--gold-primary)',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--champagne-light)' }}>
          {favoriteProperties.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '15px', marginBottom: '6px', color: 'var(--plum-deep)', fontWeight: 600 }}>
                No properties saved yet
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Click the heart icon on any property card to save it to your personal shortlist.
              </p>
            </div>
          ) : (
            favoriteProperties.map((prop) => (
              <div
                key={prop.property_id}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px',
                  background: '#FFFFFF',
                  borderRadius: '6px',
                  border: '1px solid var(--champagne-border)',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'border-color 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gold-primary)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--champagne-border)'
                }}
                onClick={() => {
                  onSelectProperty(prop)
                  onClose()
                }}
              >
                <img
                  src={prop.image_url}
                  alt={prop.title}
                  style={{ width: '76px', height: '68px', borderRadius: '4px', objectFit: 'cover' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-deep)' }}>
                    AED {prop.price_aed.toLocaleString('en-US')}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {prop.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {prop.location} &bull; {prop.bhk} Bed &bull; {prop.property_size_sqft.toLocaleString()} sqft
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveFavorite(prop.property_id)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--rose-primary)',
                    cursor: 'pointer',
                    padding: '4px',
                    alignSelf: 'flex-start'
                  }}
                  title="Remove from shortlist"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        {favoriteProperties.length > 0 && (
          <div style={{ padding: '20px 24px', borderTop: '1px solid var(--champagne-border)', background: 'var(--champagne-surface)' }}>
            <a
              href={`https://wa.me/97148005952?text=Hello%20Lyka%20Realty,%20I%20have%20shortlisted%20${favoriteProperties.length}%20properties:%20${favoriteProperties.map(p => p.property_id).join(',%20')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="gold-btn"
              style={{ width: '100%', marginBottom: '10px', fontSize: '13px' }}
            >
              <MessageSquare size={15} /> Enquire on Shortlist via WhatsApp
            </a>
            <button
              type="button"
              onClick={onClose}
              className="outline-navy-btn"
              style={{ width: '100%', fontSize: '13px' }}
            >
              Continue Browsing <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
