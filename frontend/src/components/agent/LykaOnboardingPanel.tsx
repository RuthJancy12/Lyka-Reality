import { useState } from 'react'
import { ArrowLeft, Check, MapPin, Wallet, Home, BedDouble, KeyRound, Sparkles } from 'lucide-react'
import { DUBAI_LOCATIONS } from '../../utils/agentEngine'
import { saveLocalPreferences, ownerKeyFor } from '../../services/chatStore'
import { saveCustomerPreferences } from '../../services/api'
import type { UserRequirements } from '../../types/agent'

export interface OnboardingResult {
  requirements: Partial<UserRequirements>
  skipped: boolean
}

interface LykaOnboardingPanelProps {
  initialName?: string
  onComplete: (result: OnboardingResult) => void
  onSkip: () => void
  onBack: () => void
  /** Firebase UID of the viewer (null for guests): preferences are stored
   * under this owner's namespace only. */
  ownerUid: string | null
}

const POPULAR_LOCATIONS = [
  'Dubai Marina',
  'Downtown Dubai',
  'Palm Jumeirah',
  'Business Bay',
  'Dubai Hills Estate',
  'Jumeirah Village Circle',
  'Dubai Creek Harbour',
  'Arabian Ranches'
]

const BUDGET_OPTIONS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: 'Under 1.5M', min: null, max: 1500000 },
  { label: '1.5M – 3M', min: 1500000, max: 3000000 },
  { label: '3M – 5M', min: 3000000, max: 5000000 },
  { label: '5M – 10M', min: 5000000, max: 10000000 },
  { label: '10M+', min: 10000000, max: null }
]

/**
 * LYKA AI chatbot — first-time onboarding to collect search preferences.
 * UI ONLY (local preview). Every section is optional; "Skip for now" leaves
 * the chat fully usable. Saved shape matches the future MongoDB
 * `preferences` collection (see services/chatStore.ts).
 */
export function LykaOnboardingPanel({ initialName, onComplete, onSkip, onBack, ownerUid }: LykaOnboardingPanelProps) {
  const [locations, setLocations] = useState<string[]>([])
  const [budgetIdx, setBudgetIdx] = useState<number | null>(null)
  const [propertyType, setPropertyType] = useState<UserRequirements['propertyType']>(null)
  const [bedrooms, setBedrooms] = useState<number | null>(null)
  const [purpose, setPurpose] = useState<UserRequirements['purpose']>(null)

  const toggleLocation = (loc: string) => {
    setLocations((prev) => (prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc].slice(0, 3)))
  }

  const handleSave = () => {
    const budget = budgetIdx !== null ? BUDGET_OPTIONS[budgetIdx] : null
    saveLocalPreferences({
      userId: null,
      locations,
      budgetMin: budget?.min ?? null,
      budgetMax: budget?.max ?? null,
      propertyType,
      bedrooms,
      purpose,
      timelineDays: null,
      skipped: false
    }, ownerKeyFor(ownerUid))
    if (ownerUid) {
      void saveCustomerPreferences({
        locations,
        budgetMin: budget?.min ?? null,
        budgetMax: budget?.max ?? null,
        propertyType: propertyType ?? null,
        bedrooms: bedrooms ?? null,
        bathrooms: null,
        purpose: purpose ?? null,
        timeline_days: null,
      }).catch(() => {})
    }
    onComplete({
      requirements: {
        location: locations[0] ?? null,
        budget: budget?.max ?? null,
        propertyType,
        bhk: bedrooms,
        purpose
      },
      skipped: false
    })
  }

  const handleSkip = () => {
    saveLocalPreferences({
      userId: null,
      locations: [],
      budgetMin: null,
      budgetMax: null,
      propertyType: null,
      bedrooms: null,
      purpose: null,
      timelineDays: null,
      skipped: true
    }, ownerKeyFor(ownerUid))
    if (ownerUid) {
      void saveCustomerPreferences({
        locations: [],
        budgetMin: null,
        budgetMax: null,
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        purpose: null,
        timeline_days: null,
      }).catch(() => {})
    }
    onSkip()
  }

  return (
    <div className="lyka-chat-onboard">
      <div className="lyka-chat-onboard-top">
        <button type="button" className="lyka-chat-link-btn" onClick={onBack}>
          <ArrowLeft size={13} /> Back
        </button>
        <button type="button" className="lyka-chat-link-btn" onClick={handleSkip}>
          Skip for now
        </button>
      </div>

      <div className="lyka-chat-onboard-card">
        <div className="lyka-chat-onboard-hero">
          <Sparkles size={18} />
          <div>
            <h4>{initialName ? `Welcome, ${initialName.split(' ')[0]}! ` : ''}Tell us your dream home</h4>
            <p>Everything is optional — skip anything, and LYKA AI will still help you beautifully.</p>
          </div>
        </div>

        <div className="lyka-chat-onboard-section">
          <div className="lyka-chat-onboard-label"><MapPin size={13} /> Preferred locations (up to 3)</div>
          <div className="lyka-chat-pill-row">
            {POPULAR_LOCATIONS.map((loc) => (
              <button
                key={loc}
                type="button"
                className={`lyka-chat-pill${locations.includes(loc) ? ' active' : ''}`}
                onClick={() => toggleLocation(loc)}
              >
                {locations.includes(loc) && <Check size={12} />} {loc}
              </button>
            ))}
          </div>
        </div>

        <div className="lyka-chat-onboard-section">
          <div className="lyka-chat-onboard-label"><Wallet size={13} /> Budget (AED)</div>
          <div className="lyka-chat-pill-row">
            {BUDGET_OPTIONS.map((b, i) => (
              <button
                key={b.label}
                type="button"
                className={`lyka-chat-pill${budgetIdx === i ? ' active' : ''}`}
                onClick={() => setBudgetIdx(budgetIdx === i ? null : i)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lyka-chat-onboard-grid">
          <div className="lyka-chat-onboard-section">
            <div className="lyka-chat-onboard-label"><Home size={13} /> Property type</div>
            <div className="lyka-chat-pill-row">
              {(['Apartment', 'Villa', 'Townhouse', 'Penthouse'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`lyka-chat-pill${propertyType === t ? ' active' : ''}`}
                  onClick={() => setPropertyType(propertyType === t ? null : t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="lyka-chat-onboard-section">
            <div className="lyka-chat-onboard-label"><BedDouble size={13} /> Bedrooms</div>
            <div className="lyka-chat-pill-row">
              {[{ l: 'Studio', v: 0 }, { l: '1', v: 1 }, { l: '2', v: 2 }, { l: '3', v: 3 }, { l: '4+', v: 4 }].map((b) => (
                <button
                  key={b.l}
                  type="button"
                  className={`lyka-chat-pill${bedrooms === b.v ? ' active' : ''}`}
                  onClick={() => setBedrooms(bedrooms === b.v ? null : b.v)}
                >
                  {b.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lyka-chat-onboard-section">
          <div className="lyka-chat-onboard-label"><KeyRound size={13} /> I want to</div>
          <div className="lyka-chat-pill-row">
            {(['Buy', 'Rent'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`lyka-chat-pill${purpose === p ? ' active' : ''}`}
                onClick={() => setPurpose(purpose === p ? null : p)}
              >
                {p === 'Buy' ? 'Buy a home' : 'Rent a home'}
              </button>
            ))}
          </div>
        </div>

        <div className="lyka-chat-onboard-actions">
          <button type="button" className="lyka-chat-ghost-rose-btn" onClick={handleSkip}>
            Skip for now
          </button>
          <button type="button" className="lyka-chat-primary-btn inline" onClick={handleSave}>
            <Check size={14} /> Save & start chatting
          </button>
        </div>
        <p className="lyka-chat-auth-note">
          Persisted to Supabase PostgreSQL · {DUBAI_LOCATIONS.length} communities supported.
        </p>
      </div>
    </div>
  )
}
