import { useState } from 'react'
import { CheckCircle2, Sparkles, Sliders, ArrowRight, Save, X } from 'lucide-react'
import type { UserRequirements } from '../../types/agent'
import { DUBAI_LOCATIONS } from '../../utils/agentEngine'

interface SummaryCardProps {
  requirements: UserRequirements
  onConfirm: () => void
  onUpdateRequirements: (updated: UserRequirements) => void
  /** Real dataset communities (most stocked first). Falls back to the
   * built-in list when the backend is unreachable. */
  locations?: string[]
}

export function SummaryCard({ requirements, onConfirm, onUpdateRequirements, locations }: SummaryCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<UserRequirements>({ ...requirements })
  const locationOptions = locations && locations.length > 0 ? locations : DUBAI_LOCATIONS

  const handleSaveEdit = () => {
    onUpdateRequirements(draft)
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setDraft({ ...requirements })
    setIsEditing(false)
  }

  return (
    <div style={{
      background: 'var(--champagne-surface)',
      border: '1px solid var(--champagne-border)',
      borderRadius: '8px',
      padding: '22px',
      boxShadow: 'var(--shadow-sm)',
      marginTop: '12px',
      marginBottom: '16px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '4px',
            background: 'var(--plum-deep)',
            border: '1px solid var(--gold-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Sparkles size={14} color="var(--gold-primary)" />
          </div>
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-deep)', margin: 0 }}>
              Search Criteria
            </h4>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Verify criteria or edit parameters inline
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (isEditing) {
              handleCancelEdit()
            } else {
              setDraft({ ...requirements })
              setIsEditing(true)
            }
          }}
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--champagne-border)',
            color: 'var(--plum-deep)',
            borderRadius: '4px',
            padding: '5px 10px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {isEditing ? <><X size={12} /> Cancel</> : <><Sliders size={12} /> Edit Requirements</>}
        </button>
      </div>

      {isEditing ? (
        /* Inline Editing Form */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            {/* Purpose */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '3px' }}>
                Purpose
              </label>
              <select
                value={draft.purpose || ''}
                onChange={(e) => setDraft({ ...draft, purpose: (e.target.value as 'Buy' | 'Rent') || null })}
                style={{
                  width: '100%',
                  padding: '7px 9px',
                  borderRadius: '4px',
                  border: '1px solid var(--champagne-border)',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  outlineColor: 'var(--gold-primary)'
                }}
              >
                <option value="">Select Purpose</option>
                <option value="Buy">Buy (Own / Investment)</option>
                <option value="Rent">Rent (Annual Lease)</option>
              </select>
            </div>

            {/* Location */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '3px' }}>
                Location
              </label>
              <select
                value={draft.location || ''}
                onChange={(e) => setDraft({ ...draft, location: e.target.value || null })}
                style={{
                  width: '100%',
                  padding: '7px 9px',
                  borderRadius: '4px',
                  border: '1px solid var(--champagne-border)',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  outlineColor: 'var(--gold-primary)'
                }}
              >
                <option value="">All Dubai Communities</option>
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            {/* Property Type */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '3px' }}>
                Property Type
              </label>
              <select
                value={draft.propertyType || ''}
                onChange={(e) => setDraft({ ...draft, propertyType: (e.target.value as 'Apartment' | 'Villa' | 'Townhouse' | 'Penthouse') || null })}
                style={{
                  width: '100%',
                  padding: '7px 9px',
                  borderRadius: '4px',
                  border: '1px solid var(--champagne-border)',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  outlineColor: 'var(--gold-primary)'
                }}
              >
                <option value="">Any Type</option>
                <option value="Apartment">Apartment</option>
                <option value="Villa">Villa</option>
                <option value="Penthouse">Penthouse</option>
                <option value="Townhouse">Townhouse</option>
              </select>
            </div>

            {/* Bedrooms */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '3px' }}>
                Bedrooms
              </label>
              <select
                value={draft.bhk !== null ? draft.bhk : ''}
                onChange={(e) => setDraft({ ...draft, bhk: e.target.value !== '' ? parseInt(e.target.value, 10) : null })}
                style={{
                  width: '100%',
                  padding: '7px 9px',
                  borderRadius: '4px',
                  border: '1px solid var(--champagne-border)',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  outlineColor: 'var(--gold-primary)'
                }}
              >
                <option value="">Any Bedrooms</option>
                <option value="0">Studio</option>
                <option value="1">1 Bedroom</option>
                <option value="2">2 Bedrooms</option>
                <option value="3">3 Bedrooms</option>
                <option value="4">4+ Bedrooms</option>
              </select>
            </div>

            {/* Budget */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '3px' }}>
                Budget Ceiling (AED)
              </label>
              <input
                type="number"
                step="50000"
                placeholder="e.g. 2500000"
                value={draft.budget || ''}
                disabled={draft.budgetFlexible === true}
                onChange={(e) => setDraft({ ...draft, budget: e.target.value ? parseFloat(e.target.value) : null, budgetFlexible: null })}
                style={{
                  width: '100%',
                  padding: '7px 9px',
                  borderRadius: '4px',
                  border: '1px solid var(--champagne-border)',
                  background: draft.budgetFlexible === true ? 'var(--champagne-surface)' : '#FFFFFF',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  outlineColor: 'var(--gold-primary)'
                }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer', marginTop: '6px' }}>
                <input
                  type="checkbox"
                  checked={draft.budgetFlexible === true}
                  onChange={(e) => setDraft({ ...draft, budgetFlexible: e.target.checked ? true : null, budget: e.target.checked ? null : draft.budget })}
                  style={{ accentColor: 'var(--gold-dark)' }}
                />
                Not sure — show all budgets
              </label>
            </div>

            {/* Timeline */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '3px' }}>
                Timeline
              </label>
              <select
                value={draft.timeline || ''}
                onChange={(e) => setDraft({ ...draft, timeline: e.target.value || null })}
                style={{
                  width: '100%',
                  padding: '7px 9px',
                  borderRadius: '4px',
                  border: '1px solid var(--champagne-border)',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  outlineColor: 'var(--gold-primary)'
                }}
              >
                <option value="">Flexible</option>
                <option value="Immediate">Immediate</option>
                <option value="Within 3 months">Within 3 months</option>
                <option value="3–6 months">3–6 months</option>
                <option value="Flexible">Flexible — no fixed date</option>
                <option value="Just browsing">Just browsing</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draft.nearMetro === true}
                onChange={(e) => setDraft({ ...draft, nearMetro: e.target.checked ? true : null })}
                style={{ accentColor: 'var(--gold-dark)' }}
              />
              Near Metro (&lt;1 km)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draft.beachfront === true}
                onChange={(e) => setDraft({ ...draft, beachfront: e.target.checked ? true : null })}
                style={{ accentColor: 'var(--gold-dark)' }}
              />
              Beachfront
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draft.parking === true}
                onChange={(e) => setDraft({ ...draft, parking: e.target.checked ? true : null })}
                style={{ accentColor: 'var(--gold-dark)' }}
              />
              Parking
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="gold-btn"
              style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '4px' }}
            >
              <Save size={13} /> Save Changes
            </button>
          </div>
        </div>
      ) : (
        /* Summary Grid View */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '10px',
          background: '#FFFFFF',
          borderRadius: '6px',
          border: '1px solid var(--champagne-border)',
          padding: '14px',
          marginBottom: '16px'
        }}>
          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Purpose
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--plum-deep)' }}>
              {requirements.purpose ? (requirements.purpose === 'Buy' ? 'Buy / Invest' : 'Rent (Annual)') : 'Flexible'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Location
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--plum-deep)' }}>
              {requirements.location || 'All Prime Dubai Districts'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Property Type
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--plum-deep)' }}>
              {requirements.propertyType || 'Any Property Type'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Bedrooms
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--plum-deep)' }}>
              {requirements.bhk !== null ? (requirements.bhk === 0 ? 'Studio' : `${requirements.bhk} BHK`) : 'Any'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Budget Ceiling
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--plum-deep)' }}>
              {requirements.budget ? `AED ${requirements.budget.toLocaleString('en-US')}` : requirements.budgetFlexible ? 'Flexible' : 'Not specified'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Timeline
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--plum-deep)' }}>
              {requirements.timeline || 'Flexible'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Preferences
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {[
                requirements.nearMetro && 'Near Metro',
                requirements.beachfront && 'Beachfront',
                requirements.parking && 'Parking'
              ].filter(Boolean).join(' • ') || 'Standard Luxury'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rose-primary)', fontWeight: 700, display: 'block' }}>
              Amenities
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {requirements.amenities.length > 0 ? requirements.amenities.join(' • ') : 'Not specified'}
            </span>
          </div>
        </div>
      )}

      {/* Primary Confirm Action Button */}
      {!isEditing && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onConfirm}
            className="gold-btn"
            style={{
              padding: '10px 22px',
              fontSize: '13px',
              borderRadius: '4px'
            }}
          >
            <CheckCircle2 size={16} /> Confirm &amp; Find Properties <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
