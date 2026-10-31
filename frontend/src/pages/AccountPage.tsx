// LYKA REALTY — UAE LUXURY REAL ESTATE CUSTOMER PORTAL
// Dark plum sidebar, champagne gold accents, warm cream backgrounds,
// blush pink highlights, elegant typography, property imagery, and rounded cards.
// Customer's OWN records only (local cache first, Firebase mirror when signed in).

import { useEffect, useMemo, useState, useRef, Component, useCallback, type ErrorInfo, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, LifeBuoy, Heart, MessageSquareText, Tag, User, Loader2, AlertCircle,
  Trash2, ShieldCheck, KeyRound, CheckCircle2, Sparkles, CalendarDays,
  Plus, X, Clock, ChevronRight, SlidersHorizontal, Compass,
  Home, HelpCircle, LayoutDashboard, Search, Scale, Menu,
  Eye, Check, ExternalLink, Bot, Send, Sun, Moon
} from 'lucide-react'
import { PropertyDiscovery } from '../components/PropertyDiscovery'
import { useAuth } from '../context/AuthContext'
import { useStaffRole } from '../crm/services/staffApi'
import { authFailureMessage } from '../services/authErrors'
import type { Property } from '../types/property'
import { formatProperty } from '../utils/propertyData'
import { validateCustomerProfile } from '../utils/customerProfile'
import {
  fetchPropertiesFromApi, getCustomerProfile, getMyAppointments,
  isRateLimited,
  saveCustomerProfile, saveCustomerPreferences, applyAppTheme, getCustomerFavorites, saveCustomerFavorites,
  getCustomerInquiries, patchCustomerInquiry, getCustomerLatestChat,
  getCustomerInteractions, getCustomerTrackingConsent, saveCustomerTrackingConsent,
  sendChatMessage, createCustomerChatTurn,
  type CustomerAppointment, type CustomerProfile,
  type CustomerRequirement, type CustomerPreferences,
  type CustomerInquiryOut, type CustomerChatTurnOut, type CustomerInteractionOut
} from '../services/api'
import { collectLeadSource, normalizeDiscoverySource, classifyLeadChannel } from '../utils/leadSource'
import { DiscoverySourceSelect } from '../components/DiscoverySourceSelect'
import { PropertyCard } from '../components/PropertyCard'
import { PropertyModal } from '../components/PropertyModal'
import { AuthModal } from '../components/AuthModal'
import { UIAgentModal } from '../components/agent/UIAgentModal'
import {
  getLocalUser, getLocalPreferences, saveLocalUser, saveLocalPreferences,
  type PreferencesDoc,
  getInquiries, getLastChatSessionId, getSessionTurns,
  getInteractions, getTrackingConsent, setTrackingConsent,
  withdrawInquiry, logTurn,
  ownerKeyFor,
} from '../services/chatStore'
import {
  PURPOSE_OPTIONS, PROPERTY_TYPE_OPTIONS, BEDROOM_OPTIONS, TIMELINE_OPTIONS,
  preferencesToForm, validatePreferencesForm, buildPreferencesPayload,
} from '../utils/customerPreferences'
import {
  UAE_PRIME_COMMUNITIES, BATHROOM_OPTIONS, FURNISHING_OPTIONS,
  UAE_LUXURY_AMENITIES, LUXURY_BUDGET_PRESETS,
} from '../utils/uaePreferences'
import {
  personalizedPicks, type FeedSignals,
} from '../utils/personalizedFeed'
import {
  sanitizeFavoriteIds, resolveFavoriteProperties, toggleFavoriteId,
} from '../utils/favorites'
import { cloudSaveFavoritesAll } from '../services/rtdb'
import './AccountPage.css'
import { NotificationCenter } from '../components/NotificationCenter'
import { listCustomerTickets, createCustomerTicket, replyCustomerTicket, type SupportTicket } from '../crm/services/enterpriseApi'

/** Local prefs → server payload. Undefined when nothing meaningful is set. */
function toServerPrefs(
  doc: PreferencesDoc | null,
  requirements: CustomerRequirement[] = [],
): CustomerPreferences | undefined {
  const reqs = (Array.isArray(requirements) ? requirements : []).slice(0, 20)
  if (!doc || doc.skipped) {
    return reqs.length ? {
      locations: [], propertyType: null, bedrooms: null,
      budgetMin: null, budgetMax: null, purpose: null,
      timeline_days: null, requirements: reqs,
    } : undefined
  }
  const locs = doc.locations ?? []
  if (locs.length === 0 && !doc.propertyType && doc.bedrooms == null &&
      doc.budgetMin == null && doc.budgetMax == null && !doc.purpose &&
      doc.timelineDays == null && reqs.length === 0) {
    return undefined
  }
  const TYPES = ['Apartment', 'Villa', 'Townhouse', 'Penthouse'] as const
  const PURPOSES = ['Buy', 'Rent', 'Invest'] as const
  const propertyType = TYPES.includes(doc.propertyType as (typeof TYPES)[number])
    ? (doc.propertyType as (typeof TYPES)[number])
    : null
  const purpose = PURPOSES.includes(doc.purpose as (typeof PURPOSES)[number])
    ? (doc.purpose as (typeof PURPOSES)[number])
    : null
  return {
    locations: [...locs],
    propertyType,
    bedrooms: doc.bedrooms ?? null,
    budgetMin: doc.budgetMin ?? null,
    budgetMax: doc.budgetMax ?? null,
    purpose,
    timeline_days: doc.timelineDays ?? null,
    requirements: reqs,
  }
}

function prefsEmpty(p: {
  locations?: string[] | null
  propertyType?: string | null
  bedrooms?: number | null
  budgetMin?: number | null
  budgetMax?: number | null
  purpose?: string | null
  timeline_days?: number | null
  timelineDays?: number | null
} | null | undefined): boolean {
  if (!p) return true
  const tl = p.timeline_days ?? (p as any).timelineDays
  return (p.locations ?? []).length === 0 && !p.propertyType && p.bedrooms == null &&
    p.budgetMin == null && p.budgetMax == null && !p.purpose && tl == null
}

/** Personalized picks from the viewer's own signals. */
function Recommendations({
  catalogue, prefs, favorites, inquiries, owner, loading, allowViews,
  onSelectProperty, onToggleFavorite, onExploreMore,
}: {
  catalogue: Property[]
  prefs: ReturnType<typeof getLocalPreferences>
  favorites: Property[]
  inquiries: Array<{ propertyId: string }>
  owner: string
  loading: boolean
  allowViews: boolean
  onSelectProperty: (p: Property) => void
  onToggleFavorite: (id: string) => void
  onExploreMore?: () => void
}) {
  const picks = useMemo(() => {
    const favIds = favorites.map((p) => p.property_id)
    const favLocs = [...new Set(favorites.map((p) => p.location))]
    const favTypes = [...new Set(favorites.map((p) => p.property_type))]
    const enqIds = inquiries.map((q) => q.propertyId)
    const views = allowViews
      ? getInteractions(owner).filter((e) => e.kind === 'view')
      : []
    const viewedIds = views.map((v) => v.propertyId).filter((id): id is string => Boolean(id))
    const viewedLocs = [...new Set(views.map((v) => v.location).filter((l): l is string => Boolean(l)))]
    const signals: FeedSignals = {
      preferredLocations: [...(prefs?.locations ?? []), ...favLocs, ...viewedLocs],
      preferredTypes: [...(prefs?.propertyType ? [prefs.propertyType] : []), ...favTypes],
      preferredListing: prefs?.purpose ?? null,
      preferredBedrooms: prefs?.bedrooms ?? null,
      budgetMax: prefs?.budgetMax ?? null,
      favoriteIds: favIds,
      enquiredIds: enqIds,
      viewedIds,
    }
    return personalizedPicks(catalogue, signals, 6)
  }, [catalogue, prefs, favorites, inquiries, owner, allowViews])

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
        {[1, 2, 3].map((n) => (
          <div key={n} className="lyka-skeleton-card" style={{ height: '320px', borderRadius: '16px' }} />
        ))}
      </div>
    )
  }

  if (picks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--champagne-light)', borderRadius: '16px', border: '1px dashed var(--champagne-border)' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
          <Sparkles size={22} />
        </div>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>Curating Your Personalized Collection</div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 16px', lineHeight: 1.55 }}>
          Nothing picked yet. Save homes, chat with our AI advisor about what you like, or set property preferences — tailored listings will appear here.
        </p>
        {onExploreMore && (
          <button type="button" onClick={onExploreMore} className="gold-btn" style={{ fontSize: '13px', padding: '9px 20px' }}>
            <Home size={14} /> Browse Luxury Portfolio
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
      {picks.map(({ property, reasons }) => (
        <PropertyCard
          key={property.property_id}
          property={property}
          isFavorite={favorites.some((p) => p.property_id === property.property_id)}
          onToggleFavorite={onToggleFavorite}
          onSelectProperty={onSelectProperty}
          matchExplanation={reasons.length > 0 ? `Picked for you: ${reasons.join(' · ')}` : undefined}
        />
      ))}
    </div>
  )
}

/** Privacy tracking consent. */
function PrivacyControls({ checked, onToggle }: { checked: boolean; onToggle: (allow: boolean) => void }) {
  return (
    <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
      <p style={{ margin: '0 0 14px', lineHeight: 1.6 }}>
        Browsing views and searches personalize your recommendations only after you
        opt in. Saved homes, favorites, and submitted enquiries are functional
        records tied to this account. Everything stays namespaced to your
        Firebase identity — never shared with other accounts on this device.
      </p>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', background: 'var(--champagne-light)',
        border: '1px solid var(--champagne-border)', borderRadius: '12px',
        gap: '12px', flexWrap: 'wrap'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggle(e.target.checked)}
            style={{ accentColor: 'var(--gold-dark)', width: '18px', height: '18px', cursor: 'pointer' }}
          />
          Allow activity-based recommendations (views & searches)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Status:</span>
          <span style={{
            fontSize: '11.5px', fontWeight: 800, padding: '2px 10px', borderRadius: '9999px',
            background: checked ? 'rgba(46, 125, 79, 0.15)' : 'var(--champagne-muted)',
            color: checked ? '#1F6B3E' : 'var(--text-muted)',
            border: `1px solid ${checked ? 'rgba(46, 125, 79, 0.3)' : 'var(--champagne-border)'}`,
          }}>
            {checked ? 'On' : 'Off'}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Real-Estate AI Declaration & Client Brief Card.
 * Renders the customer's declared criteria provided to the AI concierge,
 * powering personalized property recommendations and automated matching.
 */
function AIDeclarationCard({
  prefs,
  serverProfile,
  requirements = [],
  onDeclareWithAI,
  onEditCriteria,
}: {
  prefs: ReturnType<typeof getLocalPreferences>
  serverProfile?: CustomerProfile | null
  requirements?: CustomerRequirement[]
  onDeclareWithAI: () => void
  onEditCriteria: () => void
}) {
  const reqList = Array.isArray(requirements) ? requirements : []
  const purpose = prefs?.purpose || serverProfile?.preferences?.purpose || null
  const locations = (prefs?.locations && Array.isArray(prefs.locations) && prefs.locations.length > 0)
    ? prefs.locations
    : (Array.isArray(serverProfile?.preferences?.locations) ? serverProfile!.preferences!.locations! : [])
  const propertyType = prefs?.propertyType || serverProfile?.preferences?.propertyType || null
  const bedrooms = prefs?.bedrooms ?? serverProfile?.preferences?.bedrooms ?? null
  const budgetMin = prefs?.budgetMin ?? serverProfile?.preferences?.budgetMin ?? null
  const budgetMax = prefs?.budgetMax ?? serverProfile?.preferences?.budgetMax ?? null
  const timelineDays = prefs?.timelineDays ?? serverProfile?.preferences?.timeline_days ?? null
  const amenities = (Array.isArray((prefs as { amenities?: string[] } | null)?.amenities) ? (prefs as { amenities?: string[] }).amenities : []) || []

  const isDeclared = Boolean(
    purpose || locations.length > 0 || propertyType ||
    bedrooms != null || budgetMin != null || budgetMax != null ||
    timelineDays != null || reqList.length > 0
  )

  const budgetDisplay = useMemo(() => {
    if (budgetMin != null && budgetMax != null) {
      return `AED ${Number(budgetMin).toLocaleString('en-US')} – ${Number(budgetMax).toLocaleString('en-US')}`
    }
    if (budgetMax != null) {
      return `Up to AED ${Number(budgetMax).toLocaleString('en-US')}`
    }
    if (budgetMin != null) {
      return `From AED ${Number(budgetMin).toLocaleString('en-US')}`
    }
    return 'Open / Unrestricted'
  }, [budgetMin, budgetMax])

  return (
    <section className="uae-card" style={{ position: 'relative' }}>
      <div className="uae-card-header">
        <div className="uae-card-title-group">
          <div className="uae-card-icon" style={{ background: 'var(--plum-main)', color: 'var(--gold-hover)', borderColor: 'var(--gold-border)' }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 className="uae-card-title">AI Real Estate Declaration &amp; Client Brief</h3>
              <span className={`uae-badge ${isDeclared ? 'active' : 'neutral'}`}>
                {isDeclared ? <><CheckCircle2 size={12} /> AI Matching Active</> : <><AlertCircle size={12} /> Pending Declaration</>}
              </span>
            </div>
            <div className="uae-card-sub">
              Your verified property brief declared to our conversational AI concierge for live portfolio matching.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="outline-navy-btn"
            onClick={onDeclareWithAI}
            style={{ fontSize: '12.5px', padding: '8px 16px', borderRadius: '8px' }}
          >
            <MessageSquareText size={13} /> Declare via AI Assistant
          </button>
          <button
            type="button"
            className="gold-btn"
            onClick={onEditCriteria}
            style={{ fontSize: '12.5px', padding: '8px 18px', borderRadius: '8px' }}
          >
            <SlidersHorizontal size={13} /> Update Criteria
          </button>
        </div>
      </div>

      {!isDeclared ? (
        <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--champagne-light)', borderRadius: '16px', border: '1px dashed var(--champagne-border)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Sparkles size={22} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>
            No Real Estate Brief Declared Yet
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '460px', margin: '0 auto 16px', lineHeight: 1.55 }}>
            You haven't declared your luxury property requirements to our AI concierge. Declare your preferred Dubai communities, budget, and lifestyle amenities to unlock precision matching.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={onDeclareWithAI} className="gold-btn" style={{ fontSize: '13px', padding: '9px 20px' }}>
              <MessageSquareText size={14} /> Declare Criteria with AI Assistant
            </button>
            <button type="button" onClick={onEditCriteria} className="outline-navy-btn" style={{ fontSize: '13px', padding: '9px 18px' }}>
              <SlidersHorizontal size={14} /> Set in Preferences
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="ai-declaration-grid">
            <div className="ai-declaration-capsule">
              <span className="ai-declaration-label">Intent / Purpose</span>
              <span className="ai-declaration-value">{purpose ? `For ${purpose}` : 'Flexible'}</span>
            </div>

            <div className="ai-declaration-capsule">
              <span className="ai-declaration-label">Target Communities</span>
              <span className="ai-declaration-value">
                {locations.length > 0 ? locations.join(', ') : 'All Prime Dubai Districts'}
              </span>
            </div>

            <div className="ai-declaration-capsule">
              <span className="ai-declaration-label">Property Type</span>
              <span className="ai-declaration-value">{propertyType || 'Apartment / Villa / Penthouse'}</span>
            </div>

            <div className="ai-declaration-capsule">
              <span className="ai-declaration-label">Bedrooms (BHK)</span>
              <span className="ai-declaration-value">{bedrooms != null ? (bedrooms === 0 ? 'Studio' : `${bedrooms} BHK`) : 'Any Configuration'}</span>
            </div>

            <div className="ai-declaration-capsule">
              <span className="ai-declaration-label">Declared Budget</span>
              <span className="ai-declaration-value">{budgetDisplay}</span>
            </div>

            <div className="ai-declaration-capsule">
              <span className="ai-declaration-label">Move-in Horizon</span>
              <span className="ai-declaration-value">{timelineDays != null ? `Within ${timelineDays} Days` : 'Flexible Timeline'}</span>
            </div>
          </div>

          {amenities.length > 0 && (
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--champagne-border)' }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                Declared Luxury Amenities
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {amenities.map((am: string) => (
                  <span key={am} className="uae-badge neutral" style={{ textTransform: 'capitalize' }}>
                    <Check size={11} color="var(--gold-dark)" /> {String(am || '').replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {requirements.length > 0 && (
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--champagne-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                <strong>{requirements.length}</strong> additional named investment brief(s) active on this account.
              </span>
              <button
                type="button"
                className="lyka-chat-link-btn"
                onClick={onEditCriteria}
                style={{ fontSize: '12px' }}
              >
                View all briefs <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** Profile editor with name/phone/city/country/discovery. */
function ProfileEditor({
  owner, initialName, initialPhone, initialCity, initialCountry, initialDiscoverySource,
  requirements = [], onSaved,
}: {
  owner: string
  initialName: string
  initialPhone: string
  initialCity: string
  initialCountry: string
  initialDiscoverySource: string
  requirements?: CustomerRequirement[]
  onSaved: (status: 'saved' | 'pending', detail?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [city, setCity] = useState(initialCity)
  const [country, setCountry] = useState(initialCountry)
  const [discoverySource, setDiscoverySource] = useState(initialDiscoverySource)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(initialName)
          setPhone(initialPhone)
          setCity(initialCity)
          setCountry(initialCountry)
          setDiscoverySource(initialDiscoverySource)
          setMsg(null)
          setOpen(true)
        }}
        className="outline-navy-btn"
        style={{ fontSize: '13px', padding: '8px 18px', borderRadius: '8px' }}
      >
        <User size={13} /> Edit profile
      </button>
    )
  }

  return (
    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '14px', padding: '20px', marginTop: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <strong style={{ fontSize: '14px', color: 'var(--plum-main)' }}>Edit Customer Profile</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          aria-label="Close edit profile"
        >
          <X size={16} />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const discovery = normalizeDiscoverySource(discoverySource)
          const err = validateCustomerProfile({ name, phone, city, country, discovery_source: discoverySource })
          if (err) {
            setMsg(err)
            return
          }
          setSaving(true)
          setMsg(null)
          const trimmed = {
            name: name.trim(),
            phone: phone.trim() || undefined,
            city: city.trim() || undefined,
            country: country.trim() || undefined,
            discovery_source: discovery || undefined,
          }
          const source = collectLeadSource()
          saveCustomerProfile({
            name: trimmed.name,
            phone: trimmed.phone,
            city: trimmed.city,
            country: trimmed.country,
            discovery_source: trimmed.discovery_source ?? null,
            preferences: toServerPrefs(getLocalPreferences(owner), requirements),
            utm_source: source.utm_source,
            utm_medium: source.utm_medium,
            utm_campaign: source.utm_campaign,
            referrer: source.referrer,
          }).then((res) => {
            const saved = res.profile
            const existing = getLocalUser(owner)
            saveLocalUser(
              {
                name: saved?.name || trimmed.name,
                email: saved?.email || existing?.email || '',
                phone: saved?.phone || trimmed.phone,
                city: saved?.city || trimmed.city,
                country: saved?.country || trimmed.country,
                discovery_source: saved?.discovery_source || trimmed.discovery_source,
              },
              owner
            )
            setMsg(null)
            setOpen(false)
            onSaved('saved')
          }).catch((saveErr: unknown) => {
            const existing = getLocalUser(owner)
            saveLocalUser(
              {
                name: trimmed.name,
                email: existing?.email || '',
                phone: trimmed.phone,
                city: trimmed.city,
                country: trimmed.country || existing?.country,
                discovery_source: trimmed.discovery_source || existing?.discovery_source,
              },
              owner
            )
            setOpen(false)
            onSaved('pending', saveErr instanceof Error ? saveErr.message : 'Could not reach the server.')
          }).finally(() => {
            setSaving(false)
          })
        }}
        style={{ maxWidth: '480px' }}
      >
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '5px', color: 'var(--plum-main)' }} htmlFor="lyka-profile-name">
            Full name
          </label>
          <input
            id="lyka-profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '5px', color: 'var(--plum-main)' }} htmlFor="lyka-profile-phone">
            Phone / WhatsApp
          </label>
          <input
            id="lyka-profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="e.g. +971 50 123 4567"
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '5px', color: 'var(--plum-main)' }} htmlFor="lyka-profile-city">
              City / Community
            </label>
            <input
              id="lyka-profile-city"
              type="text"
              placeholder="e.g. Dubai Marina"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '5px', color: 'var(--plum-main)' }} htmlFor="lyka-profile-country">
              Country
            </label>
            <input
              id="lyka-profile-country"
              type="text"
              placeholder="e.g. United Arab Emirates"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              autoComplete="country-name"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <DiscoverySourceSelect
            id="lyka-profile-discovery-source"
            value={discoverySource}
            onChange={setDiscoverySource}
            variant="form"
            labelStyle={{ fontWeight: 700, marginBottom: '5px', fontSize: '12px', color: 'var(--plum-main)' }}
            selectStyle={{ borderRadius: '8px', padding: '9px 12px', fontSize: '13.5px' }}
          />
        </div>

        {msg && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#991B1B', marginBottom: '12px' }}>
            <AlertCircle size={14} /> {msg}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button type="submit" className="gold-btn" disabled={saving} style={{ padding: '9px 20px', fontSize: '13px', opacity: saving ? 0.65 : 1 }}>
            {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Save profile'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="outline-navy-btn" style={{ padding: '9px 18px', fontSize: '13px' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

/** Comprehensive Property-Preferences Editor with searchable dropdowns & amenities. */
function PreferencesEditor({
  owner, identity, initialPrefs, requirements = [], onSaved,
}: {
  owner: string
  identity: { name: string; phone?: string; city?: string; country?: string }
  initialPrefs: PreferencesDoc | null
  requirements?: CustomerRequirement[]
  onSaved: (status: 'saved' | 'pending', detail?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => preferencesToForm(initialPrefs))
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([])
  const [mustHaveAmenities, setMustHaveAmenities] = useState<string[]>([])
  const [bathrooms, setBathrooms] = useState<number | null>(null)
  const [furnishing, setFurnishing] = useState<string>('')
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const toggleAmenity = (id: string) => {
    if (selectedAmenities.includes(id)) {
      setSelectedAmenities((prev) => prev.filter((a) => a !== id))
      setMustHaveAmenities((prev) => prev.filter((a) => a !== id))
    } else {
      setSelectedAmenities((prev) => [...prev, id])
    }
  }

  const toggleMustHave = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedAmenities.includes(id)) {
      setSelectedAmenities((prev) => [...prev, id])
    }
    setMustHaveAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setForm(preferencesToForm(getLocalPreferences(owner) ?? initialPrefs))
          setMsg(null)
          setOpen(true)
        }}
        className="outline-navy-btn"
        style={{ fontSize: '13px', padding: '8px 18px', borderRadius: '8px' }}
      >
        <SlidersHorizontal size={13} /> Edit preferences
      </button>
    )
  }

  return (
    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '16px', padding: '24px', marginTop: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <strong style={{ fontSize: '15px', color: 'var(--plum-main)' }}>Customize Property Criteria</strong>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            Replace manual typing with predefined UAE luxury communities and amenity selections.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          aria-label="Close edit preferences"
        >
          <X size={18} />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const err = validatePreferencesForm(form)
          if (err) {
            setMsg(err)
            return
          }
          setSaving(true)
          setMsg(null)
          const payload = buildPreferencesPayload(form)
          const withRequirements: CustomerPreferences | undefined = payload
            ? { ...payload, requirements }
            : requirements.length > 0
              ? {
                  locations: [], propertyType: null, bedrooms: null,
                  budgetMin: null, budgetMax: null, purpose: null,
                  timeline_days: null, requirements,
                }
              : undefined
          saveCustomerProfile({
            name: identity.name,
            phone: identity.phone,
            city: identity.city,
            country: identity.country,
            preferences: withRequirements,
          }).then((res) => {
            const saved = res.profile
            const sp = saved?.preferences
            saveLocalPreferences({
              userId: null,
              locations: payload ? [...payload.locations] : [...(sp?.locations ?? [])],
              propertyType: (payload?.propertyType ?? sp?.propertyType ?? null) as PreferencesDoc['propertyType'],
              bedrooms: payload?.bedrooms ?? sp?.bedrooms ?? null,
              budgetMin: payload?.budgetMin ?? sp?.budgetMin ?? null,
              budgetMax: payload?.budgetMax ?? sp?.budgetMax ?? null,
              purpose: (payload?.purpose ?? sp?.purpose ?? null) as PreferencesDoc['purpose'],
              timelineDays: payload?.timeline_days ?? sp?.timeline_days ?? null,
              skipped: false,
            }, owner)
            setMsg(null)
            setOpen(false)
            onSaved('saved')
          }).catch((saveErr: unknown) => {
            setOpen(false)
            onSaved('pending', saveErr instanceof Error ? saveErr.message : 'Could not reach the server.')
          }).finally(() => {
            setSaving(false)
          })
        }}
        style={{ maxWidth: '640px' }}
      >
        {/* Purpose selection */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--plum-main)', marginBottom: '6px' }}>
            Intent / Purpose
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {PURPOSE_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set({ purpose: form.purpose === p ? '' : p })}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer',
                  background: form.purpose === p ? 'var(--gold-light)' : '#FFFFFF',
                  color: form.purpose === p ? 'var(--plum-main)' : 'var(--text-secondary)',
                  border: `1.5px solid ${form.purpose === p ? 'var(--gold-primary)' : 'var(--champagne-border)'}`,
                  boxShadow: form.purpose === p ? '0 2px 8px rgba(197, 168, 105, 0.22)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Predefined Community Selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--plum-main)', marginBottom: '6px' }} htmlFor="lyka-prefs-community">
            Location / Community
          </label>
          <input
            id="lyka-prefs-community"
            type="text"
            placeholder="Type or pick a prime community below"
            value={form.community}
            onChange={(e) => set({ community: e.target.value })}
            autoComplete="address-level2"
            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', boxSizing: 'border-box' }}
          />
          {/* Quick UAE Prime Communities Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
            {UAE_PRIME_COMMUNITIES.slice(0, 8).map((comm) => (
              <button
                key={comm}
                type="button"
                onClick={() => set({ community: comm })}
                style={{
                  fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px',
                  background: form.community === comm ? 'var(--gold-light)' : '#FFFFFF',
                  color: form.community === comm ? 'var(--plum-main)' : 'var(--text-secondary)',
                  border: `1px solid ${form.community === comm ? 'var(--gold-primary)' : 'var(--champagne-border)'}`,
                  boxShadow: form.community === comm ? '0 1px 4px rgba(197, 168, 105, 0.2)' : 'none',
                  cursor: 'pointer', transition: 'all 0.15s ease'
                }}
              >
                {comm}
              </button>
            ))}
          </div>
        </div>

        {/* Property Type & Bedrooms */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--plum-main)', marginBottom: '6px' }} htmlFor="lyka-prefs-type">
              Property Type
            </label>
            <select
              id="lyka-prefs-type"
              value={form.propertyType}
              onChange={(e) => set({ propertyType: e.target.value })}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', background: '#FFFFFF', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              <option value="">No preference</option>
              {PROPERTY_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--plum-main)', marginBottom: '6px' }} htmlFor="lyka-prefs-beds">
              Bedrooms
            </label>
            <select
              id="lyka-prefs-beds"
              value={form.bedrooms}
              onChange={(e) => set({ bedrooms: e.target.value })}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', background: '#FFFFFF', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              <option value="">No preference</option>
              {BEDROOM_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bathrooms & Furnishing */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--plum-main)', marginBottom: '6px' }}>
              Bathrooms
            </label>
            <select
              value={bathrooms ?? ''}
              onChange={(e) => setBathrooms(e.target.value ? Number(e.target.value) : null)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', background: '#FFFFFF', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              {BATHROOM_OPTIONS.map((b) => (
                <option key={b.label} value={b.value ?? ''}>{b.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--plum-main)', marginBottom: '6px' }}>
              Furnishing
            </label>
            <select
              value={furnishing}
              onChange={(e) => setFurnishing(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', background: '#FFFFFF', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              {FURNISHING_OPTIONS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Luxury Budget Presets & Inputs */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--plum-main)', marginBottom: '6px' }}>
            Budget in AED
          </span>
          <div className="budget-preset-bar">
            {LUXURY_BUDGET_PRESETS.map((bp) => (
              <button
                key={bp.label}
                type="button"
                className={`budget-preset-btn ${form.budgetMin === bp.min && form.budgetMax === bp.max ? 'active' : ''}`}
                onClick={() => set({ budgetMin: bp.min, budgetMax: bp.max })}
              >
                {bp.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }} htmlFor="lyka-prefs-bmin">
                Min Budget (AED)
              </label>
              <input
                id="lyka-prefs-bmin"
                type="number"
                min={0}
                placeholder="e.g. 1,500,000"
                value={form.budgetMin}
                onChange={(e) => set({ budgetMin: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }} htmlFor="lyka-prefs-bmax">
                Max Budget (AED)
              </label>
              <input
                id="lyka-prefs-bmax"
                type="number"
                min={0}
                placeholder="e.g. 5,000,000"
                value={form.budgetMax}
                onChange={(e) => set({ budgetMax: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        {/* Move-in Timeline */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--plum-main)', marginBottom: '6px' }} htmlFor="lyka-prefs-timeline">
            Move-in Timeline
          </label>
          <select
            id="lyka-prefs-timeline"
            value={form.timelineDays}
            onChange={(e) => set({ timelineDays: e.target.value })}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13.5px', background: '#FFFFFF', cursor: 'pointer', boxSizing: 'border-box' }}
          >
            <option value="">No preference</option>
            {TIMELINE_OPTIONS.map((t) => (
              <option key={t.label} value={t.days === null ? '' : t.days}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* UAE Luxury Amenities Chips */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--plum-main)' }}>
              Desired Amenities (Must-Have vs Nice-to-Have)
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Click to select · click badge for Must-Have
            </span>
          </div>
          <div className="amenity-chip-grid">
            {UAE_LUXURY_AMENITIES.map((am) => {
              const isSelected = selectedAmenities.includes(am.id)
              const isMustHave = mustHaveAmenities.includes(am.id)
              return (
                <button
                  key={am.id}
                  type="button"
                  onClick={() => toggleAmenity(am.id)}
                  className={`amenity-chip ${isSelected ? (isMustHave ? 'must-have' : 'selected') : ''}`}
                >
                  {isSelected && <Check size={12} />}
                  {am.label}
                  {isSelected && (
                    <span
                      onClick={(e) => toggleMustHave(am.id, e)}
                      className="priority-toggle-btn"
                      title="Toggle Must-Have priority"
                    >
                      {isMustHave ? 'Must-Have' : 'Nice-to-Have'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {msg && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#991B1B', marginBottom: '14px' }}>
            <AlertCircle size={14} /> {msg}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" className="gold-btn" disabled={saving} style={{ padding: '10px 24px', fontSize: '13px', opacity: saving ? 0.65 : 1 }}>
            {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Save preferences'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="outline-navy-btn" style={{ padding: '10px 20px', fontSize: '13px' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

/** Multiple named property briefs / saved searches manager. */
function RequirementsEditor({
  identity, initialPrefs, requirements, onSaved,
}: {
  identity: { name: string; phone?: string; city?: string; country?: string }
  initialPrefs?: CustomerPreferences
  requirements?: CustomerRequirement[]
  onSaved: (status: 'saved' | 'pending', detail?: string) => void
}) {
  const [items, setItems] = useState<CustomerRequirement[]>(() => Array.isArray(requirements) ? requirements : [])
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [location, setLocation] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [purpose, setPurpose] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { setItems(Array.isArray(requirements) ? requirements : []) }, [requirements])

  const base: CustomerPreferences = initialPrefs ?? {
    locations: [], propertyType: null, bedrooms: null,
    budgetMin: null, budgetMax: null, purpose: null, timeline_days: null,
  }

  const persist = async (next: CustomerRequirement[]) => {
    setSaving(true)
    setMsg(null)
    try {
      await saveCustomerProfile({
        name: identity.name,
        phone: identity.phone,
        city: identity.city,
        country: identity.country,
        preferences: { ...base, requirements: next },
      })
      setItems(next)
      onSaved('saved')
      return true
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save this requirement.')
      onSaved('pending', err instanceof Error ? err.message : 'Could not reach the server.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const add = async () => {
    const loc = location.trim()
    const min = budgetMin.trim() ? Number(budgetMin) : null
    const max = budgetMax.trim() ? Number(budgetMax) : null
    const beds = bedrooms === '' ? null : Number(bedrooms)
    if (!loc && !propertyType && !purpose && beds == null && min == null && max == null) {
      setMsg('Add at least one criterion: a community, property type, budget, bedrooms, or purpose.')
      return
    }
    if (min != null && max != null && min > max) {
      setMsg('Minimum budget cannot be greater than maximum budget.')
      return
    }
    if (items.length >= 20) {
      setMsg('You can keep up to 20 requirements.')
      return
    }
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const next: CustomerRequirement[] = [...items, {
      id,
      label: label.trim() || `Requirement ${items.length + 1}`,
      locations: loc ? [loc] : [],
      propertyType: propertyType || null,
      bedrooms: beds,
      budgetMin: min,
      budgetMax: max,
      purpose: purpose || null,
      timeline_days: null,
    }]
    if (await persist(next)) {
      setLabel(''); setLocation(''); setPropertyType(''); setBedrooms('')
      setBudgetMin(''); setBudgetMax(''); setPurpose(''); setOpen(false)
    }
  }

  const remove = async (id: string) => {
    if (await persist(items.filter((i) => i.id !== id))) setPendingDelete(null)
  }

  return (
    <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--champagne-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)' }}>
            Saved Requirements &amp; Searches ({items.length})
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '3px 0 0' }}>
            Keep separate briefs, for example a Dubai Marina rental and a Palm Jumeirah investment.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            className="outline-navy-btn"
            onClick={() => { setOpen(true); setMsg(null) }}
            style={{ padding: '8px 16px', fontSize: '12.5px', borderRadius: '8px' }}
            disabled={items.length >= 20}
          >
            <Plus size={13} /> Add requirement
          </button>
        )}
      </div>

      {items.length === 0 && !open && (
        <div style={{ padding: '16px 20px', background: 'var(--champagne-light)', borderRadius: '12px', border: '1px dashed var(--champagne-border)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            No additional search briefs saved. Your primary preferences above are active.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: '12px' }}>
        {items.map((item) => (
          <article key={item.id} style={{ border: '1px solid var(--champagne-border)', borderRadius: '14px', padding: '16px 18px', background: '#FFFFFF', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--plum-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Search size={14} style={{ color: 'var(--gold-dark)' }} />
                  {item.label || 'Search Brief'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {[
                    item.locations?.join(', '),
                    item.propertyType,
                    item.bedrooms != null ? `${item.bedrooms} BHK` : '',
                    item.budgetMin != null || item.budgetMax != null
                      ? `AED ${item.budgetMin?.toLocaleString('en-US') ?? '—'}–${item.budgetMax?.toLocaleString('en-US') ?? '—'}`
                      : '',
                    item.purpose,
                  ].filter(Boolean).join(' · ') || 'No details specified'}
                </div>
              </div>
              {pendingDelete === item.id ? (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#9C4A3C', fontWeight: 700 }}>Remove?</span>
                  <button type="button" className="gold-btn" disabled={saving} onClick={() => void remove(item.id)} style={{ padding: '5px 12px', fontSize: '12px' }}>Confirm</button>
                  <button type="button" className="outline-navy-btn" onClick={() => setPendingDelete(null)} style={{ padding: '5px 12px', fontSize: '12px' }}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="lyka-chat-link-btn" onClick={() => setPendingDelete(item.id)} style={{ fontSize: '12px', color: '#9C4A3C', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {open && (
        <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '14px', padding: '20px', marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <strong style={{ fontSize: '14px', color: 'var(--plum-main)' }}>New Search Brief / Requirement</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close requirement form" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }} htmlFor="req-label">Brief Name</label>
              <input id="req-label" placeholder="e.g. Marina rental" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }} htmlFor="req-location">Community</label>
              <input id="req-location" placeholder="e.g. Dubai Marina" value={location} onChange={(e) => setLocation(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }} htmlFor="req-type">Property type</label>
              <select id="req-type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', background: '#FFFFFF', cursor: 'pointer', boxSizing: 'border-box' }}>
                <option value="">No preference</option>
                {PROPERTY_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }} htmlFor="req-beds">Bedrooms</label>
              <select id="req-beds" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', background: '#FFFFFF', cursor: 'pointer', boxSizing: 'border-box' }}>
                <option value="">No preference</option>
                {BEDROOM_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }} htmlFor="req-min">Min budget (AED)</label>
              <input id="req-min" type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }} htmlFor="req-max">Max budget (AED)</label>
              <input id="req-max" type="number" min={0} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }} htmlFor="req-purpose">Purpose</label>
              <select id="req-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', background: '#FFFFFF', cursor: 'pointer', boxSizing: 'border-box' }}>
                <option value="">No preference</option>
                {PURPOSE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {msg && <p role="alert" style={{ fontSize: '12.5px', color: '#991B1B', margin: '0 0 12px' }}>{msg}</p>}
          <button type="button" className="gold-btn" disabled={saving} onClick={() => void add()} style={{ padding: '9px 20px', fontSize: '13px' }}>
            {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Plus size={13} /> Save requirement</>}
          </button>
        </div>
      )}
      {msg && !open && <p role="alert" style={{ fontSize: '12.5px', color: '#991B1B', marginTop: '10px' }}>{msg}</p>}
    </div>
  )
}

/** Nav tabs corresponding to the 10 customer portal views. */
type PortalView =
  | 'dashboard'
  | 'account'
  | 'favorites'
  | 'saved-searches'
  | 'recent'
  | 'inquiries'
  | 'appointments'
  | 'compare'
  | 'messages'
  | 'settings'
  | 'support'
  | 'discovery'

interface ErrorBoundaryProps {
  children: ReactNode
  onRetry?: () => void
  onNavigateHome?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  retryCount: number
}

export class PortalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, retryCount: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Customer Portal ErrorBoundary caught error:', error, errorInfo)
  }

  handleRetry = () => {
    const nextCount = (this.state?.retryCount ?? 0) + 1
    this.state = { hasError: false, error: null, retryCount: nextCount }
    try {
      this.setState({ hasError: false, error: null, retryCount: nextCount })
    } catch {
      // Safe fallback for unmounted/testing environments
    }
    if (this.props.onRetry) {
      try {
        this.props.onRetry()
      } catch (e) {
        console.error('PortalErrorBoundary onRetry error:', e)
        if (typeof window !== 'undefined') {
          window.location.reload()
        }
      }
    } else if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  handleReturnToSite = () => {
    if (this.props.onNavigateHome) {
      try {
        this.props.onNavigateHome()
        return
      } catch (e) {
        console.error('PortalErrorBoundary onNavigateHome error:', e)
      }
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="portal-layout" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--champagne-light)', padding: '24px' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid var(--champagne-border)', borderRadius: '14px', padding: '40px 32px', textAlign: 'center', maxWidth: '520px', width: '100%', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(153, 27, 27, 0.1)', color: '#991B1B', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertCircle size={24} />
            </div>
            <h2 className="luxury-serif" style={{ fontSize: '22px', color: 'var(--plum-main)', marginBottom: '8px' }}>
              Account View Temporarily Unavailable
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              We encountered an issue displaying this page. Your saved properties, inquiries, and preferences are safe.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="gold-btn"
                onClick={this.handleRetry}
                style={{ padding: '10px 22px', fontSize: '13px', cursor: 'pointer' }}
              >
                Try Again
              </button>
              <button
                type="button"
                className="outline-navy-btn"
                onClick={this.handleReturnToSite}
                style={{ padding: '10px 22px', fontSize: '13px', cursor: 'pointer' }}
              >
                Return to Site
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function AccountPageContent({ onRetry }: { onRetry?: () => void }) {
  const { user, authLoading, linkPassword, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { role: staffRole } = useStaffRole()
  const trustedRole = staffRole ?? (user ? 'Customer' : null)
  // Redirect staff away from customer account portal (Saved Properties isolation)
  useEffect(() => {
    if (staffRole) {
      navigate('/crm', { replace: true })
    }
  }, [staffRole, navigate])
  const owner = ownerKeyFor(user?.uid)

  const queryView = useMemo<PortalView | null>(() => {
    try {
      const p = new URLSearchParams(location.search).get('view') || new URLSearchParams(location.search).get('tab')
      if (p === 'account' || p === 'profile') return 'account'
      if (p === 'dashboard') return 'dashboard'
      if (p === 'favorites' || p === 'saved') return 'favorites'
      if (p === 'saved-searches' || p === 'briefs') return 'saved-searches'
      if (p === 'recent' || p === 'activity') return 'recent'
      if (p === 'inquiries') return 'inquiries'
      if (p === 'appointments') return 'appointments'
      if (p === 'compare') return 'compare'
      if (p === 'messages') return 'messages'
      if (p === 'settings') return 'settings'
      if (p === 'support' || p === 'tickets' || p === 'help') return 'support'
      if (p === 'owner-hub' || p === 'owner' || p === 'landlord' || p === 'discovery') return 'discovery'
    } catch {
      // ignore
    }
    return null
  }, [location.search])

  const [activeView, setActiveView] = useState<PortalView>(() => queryView || 'account')

  useEffect(() => {
    if (queryView) {
      setActiveView(queryView)
    }
  }, [queryView])

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [favorites, setFavorites] = useState<Property[]>([])
  const [catalogue, setCatalogue] = useState<Property[]>([])
  const [trackingOn, setTrackingOn] = useState<boolean>(() => getTrackingConsent(owner) === true)
  const [isAgentOpen, setIsAgentOpen] = useState(false)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [momentTab, setMomentTab] = useState<'all' | 'views' | 'searches'>('all')

  // Compare properties selection (up to 4 property IDs)
  const [compareIds, setCompareIds] = useState<string[]>([])
  // Customer Support Tickets state


  const [customerTickets, setCustomerTickets] = useState<SupportTicket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [selectedCustTicket, setSelectedCustTicket] = useState<SupportTicket | null>(null)
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketCategory, setTicketCategory] = useState<SupportTicket['category']>('general')
  const [ticketMessage, setTicketMessage] = useState('')
  const [submittingTicket, setSubmittingTicket] = useState(false)
  const [ticketError, setTicketError] = useState<string | null>(null)
  const [custReplyText, setCustReplyText] = useState('')
  const [sendingCustReply, setSendingCustReply] = useState(false)

  const loadCustomerTickets = useCallback(async () => {
    if (!user) return
    setLoadingTickets(true)
    try {
      const list = await listCustomerTickets()
      setCustomerTickets(list)
    } catch {
      // ignore
    } finally {
      setLoadingTickets(false)
    }
  }, [user])

  useEffect(() => {
    if (activeView === 'support' || user) {
      void loadCustomerTickets()
    }
  }, [activeView, user, loadCustomerTickets])

  const handleCreateCustomerTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticketSubject.trim() || !ticketMessage.trim()) return
    setSubmittingTicket(true)
    setTicketError(null)
    try {
      await createCustomerTicket({
        subject: ticketSubject.trim(),
        category: ticketCategory,
        message: ticketMessage.trim(),
        customer_name: user?.name || user?.email?.split('@')[0],
      })
      setShowTicketModal(false)
      setTicketSubject('')
      setTicketMessage('')
      await loadCustomerTickets()
    } catch (err) {
      setTicketError(err instanceof Error ? err.message : 'Failed to submit support ticket.')
    } finally {
      setSubmittingTicket(false)
    }
  }

  const handleSendCustReply = async () => {
    if (!selectedCustTicket || !custReplyText.trim()) return
    setSendingCustReply(true)
    try {
      await replyCustomerTicket(selectedCustTicket.id, custReplyText.trim())
      setCustReplyText('')
      const updated = await listCustomerTickets()
      setCustomerTickets(updated)
      const found = updated.find((t) => t.id === selectedCustTicket.id)
      if (found) setSelectedCustTicket(found)
    } catch {
      // ignore
    } finally {
      setSendingCustReply(false)
    }
  }


  useEffect(() => {
    setTrackingOn(getTrackingConsent(owner) === true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner])

  // Sync tracking consent with backend database when authenticated
  useEffect(() => {
    if (!user) return
    getCustomerTrackingConsent().then((consent) => {
      if (consent !== null) {
        setTrackingOn(consent)
        setTrackingConsent(owner, consent)
      }
    }).catch(() => {})
  }, [user?.uid, owner])

  const [profile, setProfile] = useState(() => getLocalUser(owner))
  const [prefsTick, setPrefsTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prefs = useMemo(() => getLocalPreferences(owner), [owner, prefsTick])

  useEffect(() => {
    setProfile(getLocalUser(owner))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner])

  const [serverProfile, setServerProfile] = useState<CustomerProfile | null>(null)
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const prefTheme = (serverProfile?.preferences as any)?.theme
    if (prefTheme === 'dark' || prefTheme === 'light') {
      setCurrentTheme(prefTheme)
      applyAppTheme(prefTheme)
    }
  }, [serverProfile])

  const handleThemeChange = async (newTheme: 'light' | 'dark') => {
    setCurrentTheme(newTheme)
    applyAppTheme(newTheme)
    // In-memory state and Supabase PostgreSQL only
    if (user) {
      try {
        const curPrefs = (serverProfile?.preferences as any) || {}
        await saveCustomerPreferences({
          ...curPrefs,
          locations: curPrefs.locations || [],
          propertyType: curPrefs.propertyType || null,
          bedrooms: curPrefs.bedrooms ?? null,
          bathrooms: curPrefs.bathrooms ?? null,
          budgetMin: curPrefs.budgetMin ?? null,
          budgetMax: curPrefs.budgetMax ?? null,
          purpose: curPrefs.purpose || null,
          timeline_days: curPrefs.timeline_days ?? null,
          theme: newTheme,
        })
      } catch {
        // Safe degrade
      }
    }
  }
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<'idle' | 'loading' | 'saved' | 'pending' | 'offline'>('idle')
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([])
  const [apptLoading, setApptLoading] = useState(false)
  const [inqTick, setInqTick] = useState(0)
  const [withdrawId, setWithdrawId] = useState<string | null>(null)
  const [inqMsg, setInqMsg] = useState<string | null>(null)
  const [profileFetchTick, setProfileFetchTick] = useState(0)
  const appointmentUid = user?.uid

  useEffect(() => {
    if (!user) {
      setServerProfile(null)
      setProfileLoading(false)
      setProfileError(null)
      setSyncState('idle')
      setSyncMsg(null)
      return
    }
    let cancelled = false
    setProfileLoading(true)
    setProfileError(null)
    setSyncState('loading')
    getCustomerProfile().then((res) => {
      if (cancelled) return
      setProfileLoading(false)
      if (res.profile) {
        const cur = getLocalUser(owner)
        const mergedName = res.profile.name || cur?.name || user?.name || ''
        saveLocalUser({
          name: mergedName,
          email: res.profile.email || cur?.email || user?.email || '',
          phone: res.profile.phone || cur?.phone,
          city: res.profile.city || cur?.city,
          country: res.profile.country || cur?.country,
          discovery_source: res.profile.discovery_source || cur?.discovery_source,
        }, owner)
        setProfile(getLocalUser(owner))
        setServerProfile(res.profile)
        const localPrefs = getLocalPreferences(owner)
        if (prefsEmpty(localPrefs) && !prefsEmpty(res.profile.preferences)) {
          const sp = res.profile.preferences
          const adoptType = ['Apartment', 'Villa', 'Townhouse', 'Penthouse'].includes(sp.propertyType ?? '')
            ? (sp.propertyType as 'Apartment' | 'Villa' | 'Townhouse' | 'Penthouse')
            : null
          const adoptPurpose = ['Buy', 'Rent', 'Invest'].includes(sp.purpose ?? '')
            ? (sp.purpose as 'Buy' | 'Rent' | 'Invest')
            : null
          saveLocalPreferences({
            userId: null,
            locations: [...(sp.locations ?? [])],
            propertyType: adoptType,
            bedrooms: sp.bedrooms ?? null,
            budgetMin: sp.budgetMin ?? null,
            budgetMax: sp.budgetMax ?? null,
            purpose: adoptPurpose,
            timelineDays: sp.timeline_days ?? null,
            skipped: false,
          }, owner)
          setPrefsTick((t) => t + 1)
        } else if (!prefsEmpty(localPrefs) && prefsEmpty(res.profile.preferences)) {
          const up = toServerPrefs(localPrefs, res.profile.preferences?.requirements ?? [])
          if (up) {
            saveCustomerProfile({
              name: mergedName,
              phone: res.profile.phone || cur?.phone || undefined,
              city: res.profile.city || cur?.city || undefined,
              country: res.profile.country || cur?.country || undefined,
              preferences: up,
            }).then((r2) => {
              if (!cancelled && r2.profile) setServerProfile(r2.profile)
            }).catch(() => {})
          }
        }
      } else {
        setServerProfile(null)
      }
      setSyncState('saved')
      setSyncMsg(null)
    }).catch((err: unknown) => {
      if (!cancelled) {
        setProfileLoading(false)
        setProfileError(err instanceof Error ? err.message : 'Could not reach customer profile service.')
        setSyncState('offline')
        setSyncMsg(null)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profileFetchTick])


  const handlePrefsSaved = (status: 'saved' | 'pending', detail?: string) => {
    setPrefsTick((t) => t + 1)
    if (status === 'saved') {
      setSyncState('saved')
      setSyncMsg(null)
      getCustomerProfile()
        .then((res) => { if (res.profile) setServerProfile(res.profile) })
        .catch(() => {})
    } else {
      setSyncState('pending')
      setSyncMsg(detail || 'Could not reach the server.')
    }
  }

  const handleProfileSaved = (status: 'saved' | 'pending', detail?: string) => {
    setProfile(getLocalUser(owner))
    if (status === 'saved') {
      setSyncState('saved')
      setSyncMsg(null)
      setProfileFetchTick((t) => t + 1)
    } else {
      setSyncState('pending')
      setSyncMsg(detail || 'Could not reach the server.')
    }
  }

  useEffect(() => {
    if (!appointmentUid) {
      setAppointments([])
      setApptLoading(false)
      return
    }
    let cancelled = false
    setApptLoading(true)
    getMyAppointments()
      .then((rows) => { if (!cancelled) setAppointments(rows) })
      .catch(() => { if (!cancelled) setAppointments([]) })
      .finally(() => { if (!cancelled) setApptLoading(false) })
    return () => { cancelled = true }
  }, [appointmentUid])

  const [favLoading, setFavLoading] = useState(true)
  const [favError, setFavError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Property | null>(null)

  // Set-password state
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const hasPasswordProvider = Array.isArray(user?.providers) ? user.providers.includes('password') : false
  const hasGoogleProvider = Array.isArray(user?.providers) ? user.providers.includes('google.com') : false

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (pw.length < 6) {
      setPwMsg({ kind: 'err', text: 'Password is too weak — please use at least 6 characters.' })
      return
    }
    if (pw !== pw2) {
      setPwMsg({ kind: 'err', text: 'Passwords do not match. Please re-enter them.' })
      return
    }
    setPwSaving(true)
    try {
      await linkPassword(pw)
      setPw('')
      setPw2('')
      setPwMsg({ kind: 'ok', text: 'Password added to this same account — sign in next time with email + password or Google. Nothing else changed.' })
    } catch (err: unknown) {
      setPwMsg({ kind: 'err', text: authFailureMessage(err, 'AccountPage-linkPassword') })
    } finally {
      setPwSaving(false)
    }
  }

  // Authenticated backend data states
  const [backendInquiries, setBackendInquiries] = useState<CustomerInquiryOut[]>([])
  const [backendChat, setBackendChat] = useState<{ session_id: string | null; turns: CustomerChatTurnOut[] }>({
    session_id: null,
    turns: [],
  })
  const [backendInteractions, setBackendInteractions] = useState<CustomerInteractionOut[]>([])

  // Load backend inquiries when authenticated
  useEffect(() => {
    if (!user) {
      setBackendInquiries([])
      return
    }
    let cancelled = false
    getCustomerInquiries().then((rows) => {
      if (!cancelled) setBackendInquiries(rows)
    }).catch(() => {
      if (!cancelled) setBackendInquiries([])
    })
    return () => { cancelled = true }
  }, [user?.uid, inqTick])

  // Load backend latest chat when authenticated
  useEffect(() => {
    if (!user) {
      setBackendChat({ session_id: null, turns: [] })
      return
    }
    let cancelled = false
    getCustomerLatestChat().then((res) => {
      if (!cancelled && res.turns) setBackendChat(res)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [user?.uid])

  // Load backend interactions when authenticated
  useEffect(() => {
    if (!user) {
      setBackendInteractions([])
      return
    }
    let cancelled = false
    getCustomerInteractions().then((rows) => {
      if (!cancelled) setBackendInteractions(rows)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [user?.uid])

  const inquiries = useMemo(() => {
    void inqTick
    const rawLocal = getInquiries(owner)
    const local = Array.isArray(rawLocal) ? rawLocal : []
    const serverInquiries = Array.isArray(backendInquiries) ? backendInquiries : []
    const map = new Map<string, {
      _id: string
      propertyId: string
      propertyTitle: string
      propertyLocation: string
      propertyType: string
      bedrooms: number
      priceAed: number
      status: string
      createdAt: string
    }>()
    for (const l of local) {
      if (l && l._id) map.set(l._id, l)
    }
    for (const b of serverInquiries) {
      if (b && b.id) {
        map.set(b.id, {
          _id: b.id,
          propertyId: b.property_id,
          propertyTitle: b.property_title || 'Dubai Luxury Property',
          propertyLocation: b.property_location || '',
          propertyType: b.property_type || '',
          bedrooms: b.bedrooms,
          priceAed: typeof b.price_aed === 'number' ? b.price_aed : (b.price_aed ? Number(b.price_aed) : 0),
          status: b.status,
          createdAt: b.created_at,
        })
      }
    }
    return Array.from(map.values())
  }, [owner, inqTick, backendInquiries])

  const handleWithdrawInquiry = async (inquiryId: string) => {
    if (user) {
      try {
        await patchCustomerInquiry(inquiryId, 'Withdrawn')
      } catch {
        // Fallback to local withdrawal if backend call errors
      }
    }
    const ok = withdrawInquiry(inquiryId, owner)
    if (ok) {
      setInqTick((t) => t + 1)
      setWithdrawId(null)
      setInqMsg(null)
    } else {
      setInqMsg('Could not withdraw that inquiry on this device.')
    }
  }

  const convo = useMemo(() => {
    const lastId = getLastChatSessionId(owner)
    const rawLocal = lastId ? getSessionTurns(lastId, owner) : []
    const localTurns = Array.isArray(rawLocal) ? rawLocal : []
    const serverTurns = Array.isArray(backendChat?.turns) ? backendChat.turns : []
    const turnsToUse = serverTurns.length > 0
      ? serverTurns.map((t) => ({
          role: t.role,
          text: t.text,
          createdAt: t.created_at,
        }))
      : localTurns
    return {
      count: turnsToUse.length,
      lastAt: turnsToUse.length > 0 ? (turnsToUse[turnsToUse.length - 1]?.createdAt ?? null) : null,
      turns: turnsToUse.slice(-6)
    }
  }, [owner, backendChat])

  // Recently viewed properties (real interactions from local cache + backend)
  const recentlyViewedProperties = useMemo(() => {
    const rawLocal = getInteractions(owner)
    const localViews = (Array.isArray(rawLocal) ? rawLocal : []).filter((e) => e && e.kind === 'view')
    const serverInteractions = Array.isArray(backendInteractions) ? backendInteractions : []
    const serverViews = serverInteractions
      .filter((e) => e && e.kind === 'view' && e.property_id)
      .map((e) => ({
        propertyId: e.property_id!,
        location: e.location,
        createdAt: e.created_at,
      }))
    const allViews = [...localViews, ...serverViews]
    const byId = new Map(catalogue.map((p) => [p.property_id, p]))
    const seen = new Set<string>()
    const items: Array<{ property: Property; viewedAt: string }> = []
    // Latest views first
    for (const v of [...allViews].reverse()) {
      if (v?.propertyId && !seen.has(v.propertyId)) {
        const found = byId.get(v.propertyId)
        if (found) {
          seen.add(v.propertyId)
          items.push({ property: found, viewedAt: v.createdAt })
        }
      }
    }
    return items
  }, [catalogue, owner, backendInteractions])

  // Full Browser Moments timeline (views, searches, inquiries) from local cache + backend
  const browserMoments = useMemo(() => {
    const rawLocal = getInteractions(owner)
    const localEvents = Array.isArray(rawLocal) ? rawLocal : []
    const serverInteractions = Array.isArray(backendInteractions) ? backendInteractions : []
    const serverEvents = serverInteractions.map((e) => ({
      _id: e.id,
      schemaVersion: 2,
      kind: e.kind as 'view' | 'search' | 'filter' | 'enquiry',
      propertyId: e.property_id ?? undefined,
      location: e.location ?? null,
      propertyType: e.property_type ?? null,
      bedrooms: e.bedrooms ?? null,
      query: e.query ?? null,
      createdAt: e.created_at,
    }))

    const byId = new Map(catalogue.map((p) => [p.property_id, p]))
    const combined = [...localEvents, ...serverEvents]

    return combined
      .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
      .map((m) => ({
        ...m,
        property: m.propertyId ? byId.get(m.propertyId) : undefined,
      }))
  }, [owner, backendInteractions, catalogue])

  // Interactive Live Chat in Customer Messages View
  const [portalChatInput, setPortalChatInput] = useState('')
  const [portalChatLoading, setPortalChatLoading] = useState(false)
  const [portalChatError, setPortalChatError] = useState<string | null>(null)
  const [portalChatSessionId] = useState<string>(() => getLastChatSessionId(owner) || `portal-${Date.now()}`)
  const [liveChatTurns, setLiveChatTurns] = useState<Array<{ role: 'user' | 'assistant'; text: string; createdAt: string }>>([])
  const chatFeedEndRef = useRef<HTMLDivElement | null>(null)

  const handleSendPortalChat = async (promptText?: string) => {
    const text = (promptText ?? portalChatInput).trim()
    if (!text || portalChatLoading) return
    setPortalChatInput('')
    setPortalChatError(null)

    const userTurn = { role: 'user' as const, text, createdAt: new Date().toISOString() }
    setLiveChatTurns((prev) => [...prev, userTurn])
    logTurn(portalChatSessionId, userTurn.role, userTurn.text, [], owner)
    // Stable id for this turn: the backend persists both turns under it and
    // dedupes on retry, so no client-side duplicate write is needed.
    const messageRef = `portal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    setPortalChatLoading(true)
    try {
      const reply = await sendChatMessage(text, portalChatSessionId, undefined, messageRef)
      const assistantText = reply?.reply?.trim() || "I've reviewed our luxury Dubai portfolio according to your criteria. Explore the matched listings below or ask for specific communities."
      const matchedIds = (reply?.matched_properties || []).map((p) => p.property_id)
      const assistantTurn = { role: 'assistant' as const, text: assistantText, createdAt: new Date().toISOString() }
      setLiveChatTurns((prev) => [...prev, assistantTurn])
      logTurn(portalChatSessionId, assistantTurn.role, assistantTurn.text, matchedIds, owner)
    } catch (err: unknown) {
      // The AI call failed: make sure the customer's own message is still
      // saved (same ref, so a successful server-side write isn't duplicated).
      if (user) {
        createCustomerChatTurn({
          session_id: portalChatSessionId,
          role: 'user',
          text,
          record_ref: messageRef,
        }).catch(() => {})
      }
      setPortalChatError(err instanceof Error ? err.message : 'Unable to connect to AI Assistant. Please retry.')
    } finally {
      setPortalChatLoading(false)
      setTimeout(() => {
        chatFeedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }

  useEffect(() => {
    let cancelled = false
    setFavLoading(true)
    setFavError(null)
    const loadBackendFavs = user
      ? getCustomerFavorites().catch(() => [] as string[])
      : Promise.resolve([] as string[])

    Promise.all([fetchPropertiesFromApi({ limit: 250 }), loadBackendFavs])
      .then(([res, serverIds]) => {
        if (cancelled) return
        const all = (res.top_properties || []).map(formatProperty)
        setCatalogue(all)
        const cleanIds = sanitizeFavoriteIds(serverIds)
        const byId = new Map(all.map((p) => [p.property_id, p]))
        setFavorites(resolveFavoriteProperties(cleanIds, (id) => byId.get(id)))
        // Automatically default first 2 saved homes to compare
        if (cleanIds.length >= 2) {
          setCompareIds(cleanIds.slice(0, 2))
        } else if (cleanIds.length === 1) {
          setCompareIds(cleanIds.slice(0, 1))
        }
        setFavLoading(false)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFavError(err instanceof Error ? err.message : 'Could not load favorites.')
          setFavLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [owner, user?.uid])

  const toggleFavorite = (id: string) => {
    const clean = typeof id === 'string' ? id.trim() : ''
    if (!clean) return
    const known = new Map(catalogue.map((p) => [p.property_id, p]))
    const currentIds = favorites.map((f) => f.property_id)
    const nextIds = toggleFavoriteId(currentIds, clean)
    if (user) {
      if (user?.uid) cloudSaveFavoritesAll(user.uid, nextIds).catch(() => {})
      saveCustomerFavorites(nextIds).catch(() => {})
    }
    setFavorites(resolveFavoriteProperties(nextIds, (favId) => known.get(favId)))
  }

  const toggleCompare = (id: string) => {
    if (compareIds.includes(id)) {
      setCompareIds((prev) => prev.filter((i) => i !== id))
    } else {
      if (compareIds.length >= 4) {
        setCompareIds((prev) => [...prev.slice(1), id])
      } else {
        setCompareIds((prev) => [...prev, id])
      }
    }
  }

  const comparedProperties = useMemo(() => {
    const byId = new Map(catalogue.map((p) => [p.property_id, p]))
    return compareIds.map((id) => byId.get(id)).filter((p): p is Property => Boolean(p))
  }, [catalogue, compareIds])

  const initials = useMemo(() => {
    const name = (profile?.name || user?.name || '').trim()
    if (!name) return 'L'
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return ((parts[0][0] || '') + (parts[1][0] || '')).toUpperCase() || 'L'
    }
    return (parts[0] || 'L').slice(0, 2).toUpperCase() || 'L'
  }, [profile?.name, user?.name])

  const effectivePrefsDoc: PreferencesDoc | null = useMemo(() => {
    if (prefs && !prefsEmpty(prefs)) return prefs
    if (serverProfile?.preferences && !prefsEmpty(serverProfile.preferences)) {
      const sp = serverProfile.preferences
      return {
        _id: 'db-prefs',
        schemaVersion: 2,
        userId: null,
        locations: sp.locations ?? [],
        propertyType: (sp.propertyType as any) ?? null,
        bedrooms: sp.bedrooms ?? null,
        budgetMin: sp.budgetMin ?? null,
        budgetMax: sp.budgetMax ?? null,
        purpose: (sp.purpose as any) ?? null,
        timelineDays: sp.timeline_days ?? null,
        skipped: false,
        updatedAt: serverProfile.updated_at || '',
      }
    }
    return prefs
  }, [prefs, serverProfile])

  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#FAF7F4',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        fontFamily: "'Playfair Display', Georgia, serif"
      }}>
        <div style={{
          width: '44px',
          height: '44px',
          border: '3px solid rgba(212, 175, 55, 0.2)',
          borderTopColor: '#C5A059',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          color: '#2B1220',
          fontSize: '18px',
          fontWeight: 600,
          letterSpacing: '0.05em'
        }}>
          LYKA REALTY
        </div>
        <div style={{
          color: '#7A6B74',
          fontSize: '13px',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          Securing Client Portal…
        </div>
      </div>
    )
  }

  // Get active requirements
  const savedRequirements = serverProfile?.preferences?.requirements ?? []

  return (
    <div className="portal-layout">
      {/* Mobile Backdrop Overlay */}
      <div
        className={`portal-sidebar-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* --------------------------------------------------------------
          1. DARK PLUM SIDEBAR NAVIGATION
         -------------------------------------------------------------- */}
      <aside className={`portal-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="portal-sidebar-brand">
          <div className="portal-logo-wrap">
            <div className="portal-logo-box">
              <img src="/logo.png" alt="LYKA Realty" style={{ height: '24px', width: 'auto' }} />
            </div>
            <div className="portal-brand-text">
              <span className="portal-brand-title">LYKA REALTY</span>
              <span className="portal-brand-subtitle">Client Portal</span>
            </div>
          </div>
          <button
            type="button"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            style={{ background: 'none', border: 'none', color: '#D8CCD5', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Customer Identity Capsule */}
        <div className="portal-user-capsule">
          <div className="portal-user-avatar">
            {initials}
          </div>
          <div className="portal-user-info">
            <div className="portal-user-name">
              {user ? (profile?.name || user?.name || user?.email || 'Valued Client') : 'Guest Client'}
            </div>
            <div className="portal-user-badge">
              <ShieldCheck size={11} color="var(--gold-primary)" />
              Role: {trustedRole === 'Customer' ? 'Customer' : trustedRole?.replace(/_/g, ' ') ?? 'Client'}
            </div>
          </div>
        </div>

        {/* Sidebar Navigation Items */}
        <nav className="portal-nav-menu">
          {/* Main Navigation */}
          <div>
            <div className="portal-nav-group-title">Main Portfolio</div>
            <div className="portal-nav-group">
              <button
                type="button"
                className={`portal-nav-link ${activeView === 'dashboard' ? 'active' : ''}`}
                onClick={() => { setActiveView('dashboard'); setMobileMenuOpen(false) }}
              >
                <LayoutDashboard size={16} />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                className={`portal-nav-link ${activeView === 'account' ? 'active' : ''}`}
                onClick={() => { setActiveView('account'); setMobileMenuOpen(false) }}
              >
                <User size={16} />
                <span>My Account</span>
              </button>

              <button
                type="button"
                className={`portal-nav-link ${activeView === 'favorites' ? 'active' : ''}`}
                onClick={() => { setActiveView('favorites'); setMobileMenuOpen(false) }}
              >
                <Heart size={16} />
                <span>Saved Homes</span>
                <span className="portal-nav-counter">{favorites.length}</span>
              </button>

              <button
                type="button"
                className={`portal-nav-link ${activeView === 'saved-searches' ? 'active' : ''}`}
                onClick={() => { setActiveView('saved-searches'); setMobileMenuOpen(false) }}
              >
                <Search size={16} />
                <span>Saved Searches</span>
                <span className="portal-nav-counter">{savedRequirements.length}</span>
              </button>

              <button
                type="button"
                className={`portal-nav-link ${activeView === 'recent' ? 'active' : ''}`}
                onClick={() => { setActiveView('recent'); setMobileMenuOpen(false) }}
              >
                <Clock size={16} />
                <span>Recently Viewed</span>
                <span className="portal-nav-counter">{recentlyViewedProperties.length}</span>
              </button>
            </div>
          </div>

          {/* Inquiries & Communication */}
          <div>
            <div className="portal-nav-group-title">Advisory &amp; Bookings</div>
            <div className="portal-nav-group">
              <button
                type="button"
                className={`portal-nav-link ${activeView === 'inquiries' ? 'active' : ''}`}
                onClick={() => { setActiveView('inquiries'); setMobileMenuOpen(false) }}
              >
                <Tag size={16} />
                <span>My Inquiries</span>
                <span className="portal-nav-counter">{inquiries.length}</span>
              </button>

              <button
                type="button"
                className={`portal-nav-link ${activeView === 'appointments' ? 'active' : ''}`}
                onClick={() => { setActiveView('appointments'); setMobileMenuOpen(false) }}
              >
                <CalendarDays size={16} />
                <span>Appointments</span>
                <span className="portal-nav-counter">{appointments.length}</span>
              </button>

              <button
                type="button"
                className={`portal-nav-link ${activeView === 'messages' ? 'active' : ''}`}
                onClick={() => { setActiveView('messages'); setMobileMenuOpen(false) }}
              >
                <MessageSquareText size={16} />
                <span>Messages</span>
                <span className="portal-nav-counter">{convo.count}</span>
              </button>
            </div>
          </div>

          {/* Tools & Settings */}
          <div>
            <div className="portal-nav-group-title">Tools &amp; Settings</div>
            <div className="portal-nav-group">
              <button
                type="button"
                className={`portal-nav-link ${activeView === 'compare' ? 'active' : ''}`}
                onClick={() => { setActiveView('compare'); setMobileMenuOpen(false) }}
              >
                <Scale size={16} />
                <span>Compare Properties</span>
                {compareIds.length > 0 && <span className="portal-nav-counter">{compareIds.length}</span>}
              </button>

              <button
                type="button"
                className={`portal-nav-link ${activeView === 'settings' ? 'active' : ''}`}
                onClick={() => { setActiveView('settings'); setMobileMenuOpen(false) }}
              >
                <SlidersHorizontal size={16} />
                <span>Settings</span>
              </button>
            </div>
          </div>

          <div>
            <div className="portal-nav-group-title">Discovery &amp; Support</div>
            <div className="portal-nav-group">
              <button
                type="button"
                className={`portal-nav-link ${activeView === 'discovery' ? 'active' : ''}`}
                onClick={() => { setActiveView('discovery'); setMobileMenuOpen(false) }}
              >
                <Compass size={16} />
                <span>Property Discovery</span>
                <span className="portal-nav-counter" style={{ background: '#C6A15B', color: '#1A0E1F', fontWeight: 800 }}>12</span>
              </button>

              <button
                type="button"
                className={`portal-nav-link ${activeView === 'support' ? 'active' : ''}`}
                onClick={() => { setActiveView('support'); setMobileMenuOpen(false) }}
              >
                <LifeBuoy size={16} />
                <span>Customer Support Desk</span>
                {customerTickets.length > 0 && <span className="portal-nav-counter">{customerTickets.length}</span>}
              </button>
            </div>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="portal-sidebar-footer">
          <button
            type="button"
            className="portal-footer-btn"
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={15} />
            <span>Back to Website</span>
          </button>
          {user && (
            <button
              type="button"
              className="portal-footer-btn"
              onClick={() => { void logout(); navigate('/') }}
              style={{ color: '#E8A0A0' }}
            >
              <ExternalLink size={14} />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </aside>

      {/* --------------------------------------------------------------
          2. MAIN CONTENT AREA
         -------------------------------------------------------------- */}
      <main className="portal-main">
        {/* Mobile Header Bar */}
        <header className="portal-mobile-topbar">
          <button
            type="button"
            className="portal-menu-trigger"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="portal-topbar-title">
            {activeView === 'dashboard' && 'Dashboard'}
            {activeView === 'account' && 'My Account'}
            {activeView === 'favorites' && 'Saved Homes'}
            {activeView === 'saved-searches' && 'Saved Searches'}
            {activeView === 'recent' && 'Recently Viewed'}
            {activeView === 'inquiries' && 'My Inquiries'}
            {activeView === 'appointments' && 'Appointments'}
            {activeView === 'compare' && 'Compare Properties'}
            {activeView === 'messages' && 'Messages'}
            {activeView === 'settings' && 'Settings'}
            {activeView === 'support' && 'Customer Support & Help Desk'}
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: '13px' }}
          >
            Site
          </button>
        </header>

        {/* Content Body */}
        <div className="portal-content-body">
          {/* Breadcrumb Header */}
          <div className="portal-header-bar">
            <div className="portal-breadcrumb">
              <span>Client Portal</span>
              <ChevronRight size={13} />
              <span className="portal-breadcrumb-active">
                {activeView === 'dashboard' && 'Executive Dashboard'}
                {activeView === 'account' && 'Account & Identity'}
                {activeView === 'favorites' && 'Saved Homes'}
                {activeView === 'saved-searches' && 'Saved Searches & Briefs'}
                {activeView === 'recent' && 'Recently Viewed Properties'}
                {activeView === 'inquiries' && 'My Inquiries'}
                {activeView === 'appointments' && 'Scheduled Appointments'}
                {activeView === 'compare' && 'Property Comparison Matrix'}
                {activeView === 'messages' && 'Advisor Chat & Consultations'}
                {activeView === 'settings' && 'Preferences & Settings'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <NotificationCenter theme="light" />
              <button
                type="button"
                className="outline-navy-btn"
                onClick={() => setIsAgentOpen(true)}
                style={{ fontSize: '12.5px', padding: '8px 16px', borderRadius: '8px' }}
              >
                <MessageSquareText size={13} /> AI Consultation
              </button>
              <button
                type="button"
                className="gold-btn"
                onClick={() => navigate('/')}
                style={{ fontSize: '12.5px', padding: '8px 18px', borderRadius: '8px' }}
              >
                <Home size={13} /> Browse Homes
              </button>
            </div>
          </div>

          {/* ------------------------------------------------------------
              VIEW 1: DASHBOARD
             ------------------------------------------------------------ */}
          {activeView === 'dashboard' && (
            <>
              {/* UAE Executive Welcome Hero */}
              <section className="uae-dashboard-hero">
                <div className="uae-hero-content">
                  <div>
                    <h1 className="uae-hero-heading">
                      Welcome, {user ? (profile?.name || user?.name || user?.email?.split('@')[0] || 'Valued Client') : 'Valued Client'}
                    </h1>
                    <p className="uae-hero-sub">
                      Your personalized UAE luxury real-estate client dashboard. Access curated Dubai listings, monitor your registered inquiries, and track private appointments.
                    </p>
                    <div className="uae-hero-chips">
                      <span className="uae-hero-chip gold">
                        <ShieldCheck size={12} /> Role: {trustedRole === 'Customer' ? 'Customer' : trustedRole?.replace(/_/g, ' ') ?? 'Client'}
                      </span>
                      {user && syncState !== 'idle' && (
                        <span className="uae-hero-chip green">
                          <CheckCircle2 size={12} /> Profile Synced
                        </span>
                      )}
                      {serverProfile?.discovery_source && (
                        <span className="uae-hero-chip">
                          Found via {serverProfile.discovery_source}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px' }}>
                    <button
                      type="button"
                      className="gold-btn"
                      onClick={() => setActiveView('settings')}
                      style={{ fontSize: '13px', padding: '10px 20px', borderRadius: '10px', width: '100%' }}
                    >
                      <SlidersHorizontal size={14} /> Property Criteria
                    </button>
                    <button
                      type="button"
                      className="outline-navy-btn"
                      onClick={() => setActiveView('favorites')}
                      style={{ fontSize: '13px', padding: '10px 20px', borderRadius: '10px', width: '100%', background: 'rgba(255,255,255,0.9)' }}
                    >
                      <Heart size={14} /> View Saved ({favorites.length})
                    </button>
                  </div>
                </div>
              </section>

              {/* Executive Metric Strip (4 Cards) */}
              <div className="uae-stats-grid">
                <div className="uae-stat-box" onClick={() => setActiveView('favorites')}>
                  <div className="uae-stat-icon-wrap">
                    <Heart size={20} />
                  </div>
                  <div>
                    <div className="uae-stat-num">{favorites.length}</div>
                    <div className="uae-stat-title">Saved Homes</div>
                  </div>
                </div>

                <div className="uae-stat-box" onClick={() => setActiveView('inquiries')}>
                  <div className="uae-stat-icon-wrap">
                    <Tag size={20} />
                  </div>
                  <div>
                    <div className="uae-stat-num">{inquiries.length}</div>
                    <div className="uae-stat-title">My Inquiries</div>
                  </div>
                </div>

                <div className="uae-stat-box" onClick={() => setActiveView('appointments')}>
                  <div className="uae-stat-icon-wrap">
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <div className="uae-stat-num">{appointments.length}</div>
                    <div className="uae-stat-title">Appointments</div>
                  </div>
                </div>

                <div className="uae-stat-box" onClick={() => setActiveView('messages')}>
                  <div className="uae-stat-icon-wrap">
                    <MessageSquareText size={20} />
                  </div>
                  <div>
                    <div className="uae-stat-num">{convo.count}</div>
                    <div className="uae-stat-title">Advisor Messages</div>
                  </div>
                </div>
              </div>

              {/* Recommended For You Section */}
              <section className="uae-card">
                <div className="uae-card-header">
                  <div className="uae-card-title-group">
                    <div className="uae-card-icon">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h3 className="uae-card-title">Curated Recommendations</h3>
                      <div className="uae-card-sub">
                        Handpicked properties based on your location preferences, bedroom criteria, and saved properties.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="lyka-chat-link-btn"
                    onClick={() => setActiveView('settings')}
                    style={{ fontSize: '13px' }}
                  >
                    Update preferences <ChevronRight size={13} />
                  </button>
                </div>

                <Recommendations
                  catalogue={catalogue}
                  prefs={prefs}
                  favorites={favorites}
                  inquiries={inquiries}
                  owner={owner}
                  loading={favLoading}
                  allowViews={trackingOn}
                  onSelectProperty={setSelected}
                  onToggleFavorite={toggleFavorite}
                  onExploreMore={() => navigate('/')}
                />
              </section>

              {/* Real-Estate AI Declaration & Client Brief */}
              <AIDeclarationCard
                prefs={prefs}
                serverProfile={serverProfile}
                requirements={savedRequirements}
                onDeclareWithAI={() => setIsAgentOpen(true)}
                onEditCriteria={() => setActiveView('settings')}
              />

              {/* UAE Real Estate Market Highlights */}
              <div className="market-insights-grid">
                <div className="market-insight-card">
                  <div className="market-insight-label">UAE Prime Yields</div>
                  <div className="market-insight-value">6.8% – 9.2%</div>
                  <div className="market-insight-desc">
                    Dubai prime residential rental yields continue to outperform major global luxury hubs (London, New York, Singapore).
                  </div>
                </div>
                <div className="market-insight-card">
                  <div className="market-insight-label">Golden Visa Qualified</div>
                  <div className="market-insight-value">AED 2,000,000+</div>
                  <div className="market-insight-desc">
                    Properties valued at AED 2M or higher qualify purchasers and immediate family for the renewable 10-year UAE Golden Residency.
                  </div>
                </div>
                <div className="market-insight-card">
                  <div className="market-insight-label">Capital Appreciation</div>
                  <div className="market-insight-value">+14.4% YoY</div>
                  <div className="market-insight-desc">
                    Prime waterfront districts (Palm Jumeirah, Dubai Marina, Bluewaters) lead high-net-worth investor demand.
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ------------------------------------------------------------
              VIEW 2: MY ACCOUNT (PROFILE, PREFERENCES, SAVED HOMES, INQUIRIES)
             ------------------------------------------------------------ */}
          {activeView === 'account' && (
            <>
            <section className="uae-card">
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <User size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">Customer Profile &amp; Verification</h3>
                    <div className="uae-card-sub">
                      Client identity, contact coordinates, and private account sync status.
                    </div>
                  </div>
                </div>
                {user && (
                  <ProfileEditor
                    owner={owner}
                    initialName={profile?.name || user?.name || ''}
                    initialPhone={profile?.phone ?? ''}
                    initialCity={profile?.city ?? ''}
                    initialCountry={serverProfile?.country || profile?.country || ''}
                    initialDiscoverySource={serverProfile?.discovery_source || profile?.discovery_source || ''}
                    requirements={savedRequirements}
                    onSaved={handleProfileSaved}
                  />
                )}
              </div>

              {user ? (
                <div>
                  {profileLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#F8F4EE', border: '1px solid #E6DCCD', borderRadius: '10px', fontSize: '13px', color: '#6A5862', marginBottom: '14px' }}>
                      <Loader2 size={14} className="animate-spin" /> Synchronizing verified profile details from cloud vault…
                    </div>
                  )}

                  {(() => {
                    if (!profileError) return null
                    const isAuthExpired = Boolean(
                      profileError.includes('401') ||
                      profileError.toLowerCase().includes('sign-in required') ||
                      profileError.toLowerCase().includes('token') ||
                      profileError.toLowerCase().includes('unauthorized') ||
                      profileError.toLowerCase().includes('expired')
                    )
                    if (isAuthExpired) {
                      return (
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 18px', background: '#FFFBEB', border: '1px solid #FCD34D',
                          borderRadius: '12px', marginBottom: '16px', gap: '12px', flexWrap: 'wrap'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <AlertCircle size={18} color="#D97706" />
                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#92400E' }}>
                                Sign-in Session Expired
                              </div>
                              <div style={{ fontSize: '12.5px', color: '#B45309' }}>
                                Your authentication session has expired. Sign in again to view and edit your private profile.
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="gold-btn"
                              onClick={() => setIsAuthOpen(true)}
                              style={{ fontSize: '12.5px', padding: '7px 16px', borderRadius: '8px', cursor: 'pointer' }}
                            >
                              Sign In Again
                            </button>
                            <button
                              type="button"
                              className="outline-navy-btn"
                              onClick={() => { setProfileFetchTick((t) => t + 1); onRetry?.() }}
                              style={{ fontSize: '12.5px', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer' }}
                            >
                              Retry
                            </button>
                          </div>
                        </div>
                      )
                    }
                    const isRateLimit = Boolean(
                      profileError.includes('429') ||
                      profileError.toLowerCase().includes('busy') ||
                      profileError.toLowerCase().includes('too many requests')
                    )
                    if (isRateLimit) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 14px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--gold-primary)', borderRadius: '10px', fontSize: '13px', color: 'var(--plum-main)', marginBottom: '14px' }}>
                          <span>{profileError} (Your data is safely cached in this session.)</span>
                          <button
                            type="button"
                            disabled={isRateLimited()}
                            onClick={() => { if (!isRateLimited()) { setProfileFetchTick((t) => t + 1); onRetry?.() } }}
                            style={{ background: isRateLimited() ? 'var(--text-muted)' : 'var(--plum-main)', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: isRateLimited() ? 'not-allowed' : 'pointer' }}
                          >
                            {isRateLimited() ? 'Cooling down...' : 'Retry'}
                          </button>
                        </div>
                      )
                    }
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', fontSize: '13px', color: '#991B1B', marginBottom: '14px' }}>
                        <span>{profileError}</span>
                        <button
                          type="button"
                          onClick={() => { setProfileFetchTick((t) => t + 1); onRetry?.() }}
                          style={{ background: '#991B1B', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
                        >
                          Retry
                        </button>
                      </div>
                    )
                  })()}

                  {!serverProfile && !profileLoading && (
                    <div style={{ padding: '12px 16px', background: 'rgba(197, 160, 89, 0.1)', border: '1px solid var(--champagne-border)', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: 'var(--plum-main)' }}>
                      <strong>Welcome to LYKA Realty!</strong> Your client profile has been established with your account credentials. You can update your phone, location, and discovery preference at any time using <em>Edit Profile</em>.
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Client Name</div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)', marginTop: '4px' }}>{profile?.name || user?.name || 'Valued Client'}</div>
                    </div>

                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Email Address</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginTop: '4px' }}>{user?.email || 'No email registered'}</div>
                    </div>

                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Phone / WhatsApp</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginTop: '4px' }}>{profile?.phone || 'Not specified'}</div>
                    </div>

                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Location</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginTop: '4px' }}>
                        {[profile?.city, serverProfile?.country || profile?.country].filter(Boolean).join(', ') || 'Dubai, UAE'}
                      </div>
                    </div>
                  </div>

                  {/* Sync & Attribution row */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '14px 18px', background: 'var(--champagne-light)', borderRadius: '12px', border: '1px solid var(--champagne-border)' }}>
                    <span className="uae-badge active">
                      <ShieldCheck size={12} /> Verified Customer
                    </span>
                    {syncState === 'saved' && (
                      <span className="uae-badge active">
                        <CheckCircle2 size={12} /> Profile Synced
                      </span>
                    )}
                    {syncState === 'pending' && (
                      <span className="uae-badge pending">
                        <Clock size={12} /> Pending sync: {syncMsg || 'local cache'}
                      </span>
                    )}
                    {serverProfile?.discovery_source && (
                      <span className="uae-badge neutral">
                        Discovered via: {serverProfile.discovery_source}
                      </span>
                    )}
                    {serverProfile && (serverProfile.utm_source || serverProfile.utm_campaign) && (
                      <span className="uae-badge neutral">
                        Channel: {classifyLeadChannel(serverProfile)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--champagne-light)', borderRadius: '14px', border: '1px dashed var(--champagne-border)' }}>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                    Browsing as a guest client. Sign in to sync your profile, save requirements, and access your appointments across devices.
                  </p>
                  <button type="button" className="gold-btn" onClick={() => setIsAuthOpen(true)} style={{ fontSize: '13px' }}>
                    Sign in or Register
                  </button>
                </div>
              )}
            </section>

            {/* View 2 - Section B: Property Preferences */}
            <section className="uae-card" style={{ marginTop: '20px' }}>
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <SlidersHorizontal size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">Property Preferences</h3>
                    <div className="uae-card-sub">
                      Saved luxury real estate criteria powering your personalized feed and listing alerts.
                    </div>
                  </div>
                </div>
                {user && (
                  <PreferencesEditor
                    owner={owner}
                    identity={{
                      name: serverProfile?.name || profile?.name || user?.name || '',
                      phone: serverProfile?.phone || profile?.phone || undefined,
                      city: serverProfile?.city || profile?.city || undefined,
                      country: serverProfile?.country || profile?.country || undefined,
                    }}
                    initialPrefs={effectivePrefsDoc}
                    requirements={savedRequirements}
                    onSaved={handlePrefsSaved}
                  />
                )}
              </div>

              {/* Preferences Summary Grid */}
              {(() => {
                const displayLocations = (prefs?.locations && prefs.locations.length > 0)
                  ? prefs.locations
                  : (serverProfile?.preferences?.locations && serverProfile.preferences.locations.length > 0 ? serverProfile.preferences.locations : [])
                const displayPropertyType = prefs?.propertyType || serverProfile?.preferences?.propertyType || 'Any Luxury Property'
                const displayBedrooms = prefs?.bedrooms != null ? `${prefs.bedrooms} BHK` : (serverProfile?.preferences?.bedrooms != null ? `${serverProfile.preferences.bedrooms} BHK` : 'Any Bedrooms')
                const displayBudgetMin = prefs?.budgetMin ?? serverProfile?.preferences?.budgetMin ?? null
                const displayBudgetMax = prefs?.budgetMax ?? serverProfile?.preferences?.budgetMax ?? null
                const displayPurpose = prefs?.purpose || serverProfile?.preferences?.purpose || 'Buy / Invest'
                const displayTimeline = prefs?.timelineDays != null
                  ? `Within ${prefs.timelineDays} days`
                  : (serverProfile?.preferences?.timeline_days != null
                      ? `Within ${serverProfile.preferences.timeline_days} days`
                      : 'Flexible')

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px', marginTop: '16px' }}>
                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Locations</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-main)', marginTop: '4px' }}>
                        {displayLocations.length > 0 ? displayLocations.join(', ') : 'All Prime UAE Locations'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Property Type</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-main)', marginTop: '4px' }}>
                        {displayPropertyType}
                      </div>
                    </div>

                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Bedrooms</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-main)', marginTop: '4px' }}>
                        {displayBedrooms}
                      </div>
                    </div>

                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Budget Range</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-main)', marginTop: '4px' }}>
                        {displayBudgetMin || displayBudgetMax
                          ? `AED ${(displayBudgetMin ?? 0).toLocaleString('en-US')} - ${displayBudgetMax ? 'AED ' + displayBudgetMax.toLocaleString('en-US') : 'Any'}`
                          : 'Any Budget'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Purpose</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-main)', marginTop: '4px' }}>
                        {displayPurpose}
                      </div>
                    </div>

                    <div style={{ background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>Timeline</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-main)', marginTop: '4px' }}>
                        {displayTimeline}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </section>

            {/* View 2 - Section C: Saved Properties */}
            <section className="uae-card" style={{ marginTop: '20px' }}>
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <Heart size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">Saved Properties ({favorites.length})</h3>
                    <div className="uae-card-sub">
                      Your curated portfolio of saved luxury listings.
                    </div>
                  </div>
                </div>
                {favorites.length >= 2 && (
                  <button
                    type="button"
                    className="gold-btn"
                    onClick={() => setActiveView('compare')}
                    style={{ fontSize: '12.5px', padding: '8px 18px', borderRadius: '8px' }}
                  >
                    <Scale size={13} /> Compare Saved ({compareIds.length})
                  </button>
                )}
              </div>

              {favLoading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
                  {[1, 2].map((n) => (
                    <div key={n} className="lyka-skeleton-card" style={{ height: '320px', borderRadius: '16px' }} />
                  ))}
                </div>
              )}

              {favError && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 18px', background: 'rgba(153, 27, 27, 0.08)', borderRadius: '12px', color: '#991B1B', fontSize: '13.5px' }}>
                  <AlertCircle size={16} /> {favError}
                </div>
              )}

              {!favLoading && !favError && favorites.length === 0 && (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--champagne-light)', borderRadius: '14px', border: '1px dashed var(--champagne-border)' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    <Heart size={20} />
                  </div>
                  <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>No Saved Homes Yet</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 14px', lineHeight: 1.5 }}>
                    Click the heart icon on any luxury listing to save properties to your private account portfolio.
                  </p>
                  <button type="button" onClick={() => navigate('/')} className="gold-btn" style={{ fontSize: '12.5px', padding: '8px 18px' }}>
                    <Home size={13} /> Explore Dubai Properties
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
                {favorites.map((p) => (
                  <PropertyCard
                    key={p.property_id}
                    property={p}
                    isFavorite
                    onToggleFavorite={() => toggleFavorite(p.property_id)}
                    onSelectProperty={setSelected}
                  />
                ))}
              </div>
            </section>

            {/* View 2 - Section D: My Inquiries */}
            <section className="uae-card" style={{ marginTop: '20px' }}>
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <Tag size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">My Inquiries ({inquiries.length})</h3>
                    <div className="uae-card-sub">
                      Expressions of interest submitted via property cards or our AI concierge.
                    </div>
                  </div>
                </div>
              </div>

              {inquiries.length === 0 && (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--champagne-light)', borderRadius: '14px', border: '1px dashed var(--champagne-border)' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    <Tag size={20} />
                  </div>
                  <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>No Inquiries Submitted</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.5 }}>
                    When you request brochures, floor plans, or direct agent contact for any property, your submitted inquiries will appear here.
                  </p>
                </div>
              )}

              {inqMsg && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#991B1B', marginBottom: '14px' }}>
                  <AlertCircle size={14} /> {inqMsg}
                </div>
              )}

              <div style={{ display: 'grid', gap: '12px' }}>
                {inquiries.map((q) => (
                  <div key={q._id} style={{ border: '1px solid var(--champagne-border)', borderRadius: '14px', padding: '16px 18px', background: '#FFFFFF', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)' }}>{q.propertyTitle}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {q.propertyLocation ? q.propertyLocation + " · " : ""}{q.bedrooms ? q.bedrooms + " BHK · " : ""}AED {(q.priceAed ?? 0).toLocaleString("en-US")}
                        </div>
                      </div>
                      <span className={`uae-badge ${q.status === 'Contacted' ? 'active' : q.status === 'Submitted' ? 'pending' : 'neutral'}`}>
                        {q.status}
                      </span>
                    </div>

                    {q.status !== 'Withdrawn' && (
                      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--champagne-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {withdrawId === q._id ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', color: '#9C4A3C', fontWeight: 700 }}>Withdraw this inquiry?</span>
                            <button
                              type="button"
                              className="gold-btn"
                              style={{ padding: '5px 12px', fontSize: '11.5px' }}
                              onClick={() => {
                                void handleWithdrawInquiry(q._id)
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="outline-navy-btn"
                              style={{ padding: '5px 12px', fontSize: '11.5px' }}
                              onClick={() => setWithdrawId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="lyka-chat-link-btn"
                            onClick={() => setWithdrawId(q._id)}
                            style={{ fontSize: '12px', color: '#9C4A3C' }}
                          >
                            <Trash2 size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Withdraw inquiry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

          {/* ------------------------------------------------------------
              VIEW 3: SAVED HOMES (FAVORITES)
             ------------------------------------------------------------ */}
          {activeView === 'favorites' && (
            <section className="uae-card">
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <Heart size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">Saved Homes ({favorites.length})</h3>
                    <div className="uae-card-sub">
                      Your curated portfolio of saved luxury listings. Tap 'Compare' to evaluate them side by side.
                    </div>
                  </div>
                </div>
                {favorites.length >= 2 && (
                  <button
                    type="button"
                    className="gold-btn"
                    onClick={() => setActiveView('compare')}
                    style={{ fontSize: '12.5px', padding: '8px 18px', borderRadius: '8px' }}
                  >
                    <Scale size={13} /> Compare Saved ({compareIds.length})
                  </button>
                )}
              </div>

              {favLoading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '20px' }}>
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="lyka-skeleton-card" style={{ height: '340px', borderRadius: '16px' }} />
                  ))}
                </div>
              )}

              {favError && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 18px', background: 'rgba(153, 27, 27, 0.08)', borderRadius: '12px', color: '#991B1B', fontSize: '13.5px' }}>
                  <AlertCircle size={16} /> {favError}
                </div>
              )}

              {!favLoading && !favError && favorites.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--champagne-light)', borderRadius: '16px', border: '1px dashed var(--champagne-border)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                    <Heart size={22} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>No Saved Homes Yet</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 16px', lineHeight: 1.55 }}>
                    Browse our collection of luxury penthouses, villas, and apartments. Click the heart icon on any listing to save it here.
                  </p>
                  <button type="button" onClick={() => navigate('/')} className="gold-btn" style={{ fontSize: '13px', padding: '9px 20px' }}>
                    <Home size={14} /> Explore Listings
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '20px' }}>
                {favorites.map((p) => {
                  const isCompared = compareIds.includes(p.property_id)
                  return (
                    <div key={p.property_id} style={{ position: 'relative' }}>
                      <PropertyCard
                        property={p}
                        isFavorite
                        onToggleFavorite={() => toggleFavorite(p.property_id)}
                        onSelectProperty={setSelected}
                      />
                      <button
                        type="button"
                        onClick={() => toggleCompare(p.property_id)}
                        style={{
                          marginTop: '8px', width: '100%', padding: '7px 12px', borderRadius: '8px',
                          fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          background: isCompared ? 'var(--plum-main)' : 'var(--champagne-surface)',
                          color: isCompared ? 'var(--gold-hover)' : 'var(--plum-main)',
                          border: `1px solid ${isCompared ? 'var(--gold-primary)' : 'var(--champagne-border)'}`,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Scale size={13} /> {isCompared ? 'Selected for Comparison' : '+ Add to Comparison'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ------------------------------------------------------------
              VIEW 4: SAVED SEARCHES & MULTI-REQUIREMENTS
             ------------------------------------------------------------ */}
          {activeView === 'saved-searches' && (
            <>
              {/* Real-Estate AI Declaration & Client Brief */}
              <AIDeclarationCard
                prefs={prefs}
                serverProfile={serverProfile}
                requirements={savedRequirements}
                onDeclareWithAI={() => setIsAgentOpen(true)}
                onEditCriteria={() => setActiveView('settings')}
              />

              <section className="uae-card">
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <Search size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">Saved Searches &amp; Investment Briefs</h3>
                    <div className="uae-card-sub">
                      Manage named criteria sets (e.g. Marina rental, Palm investment). Each brief tracks matching listings in real time.
                    </div>
                  </div>
                </div>
              </div>

              {user ? (
                <RequirementsEditor
                  identity={{
                    name: serverProfile?.name || profile?.name || user?.name || '',
                    phone: serverProfile?.phone || profile?.phone || undefined,
                    city: serverProfile?.city || profile?.city || undefined,
                    country: serverProfile?.country || profile?.country || undefined,
                  }}
                  initialPrefs={serverProfile?.preferences}
                  requirements={savedRequirements}
                  onSaved={handlePrefsSaved}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--champagne-light)', borderRadius: '14px', border: '1px dashed var(--champagne-border)' }}>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>Sign in to save search briefs and get matched alerts.</p>
                </div>
              )}
            </section>
          </>
        )}

          {/* ------------------------------------------------------------
              VIEW 5: BROWSER MOMENTS & ACTIVITY TIMELINE
             ------------------------------------------------------------ */}
          {activeView === 'recent' && (
            <section className="uae-card">
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <Clock size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">Browser Moments &amp; Activity Timeline ({browserMoments.length})</h3>
                    <div className="uae-card-sub">
                      Your browsing journey across LYKA Realty — property inspections, searches, and inquiries. Private to your identity and governed strictly by tracking consent.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="outline-navy-btn"
                    onClick={() => setIsAgentOpen(true)}
                    style={{ fontSize: '12.5px', padding: '8px 16px', borderRadius: '8px' }}
                  >
                    <MessageSquareText size={13} /> Ask AI Assistant
                  </button>
                  <button
                    type="button"
                    className="gold-btn"
                    onClick={() => navigate('/')}
                    style={{ fontSize: '12.5px', padding: '8px 18px', borderRadius: '8px' }}
                  >
                    <Home size={13} /> Explore Portfolio
                  </button>
                </div>
              </div>

              {/* Tracking Consent Status Banner */}
              {trackingOn ? (
                <div className="browser-moments-banner active">
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#1F6B3E', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <CheckCircle2 size={16} />
                      Activity Tracking Active &amp; Private
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      Your browsing views and search queries personalize your UAE real-estate feed in real time. Private to your account.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="outline-navy-btn"
                    onClick={() => {
                      setTrackingConsent(owner, false)
                      setTrackingOn(false)
                      if (user) saveCustomerTrackingConsent(false).catch(() => {})
                    }}
                    style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px' }}
                  >
                    Pause Tracking
                  </button>
                </div>
              ) : (
                <div className="browser-moments-banner paused">
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--plum-main)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <AlertCircle size={16} color="var(--gold-dark)" />
                      Activity Tracking is Paused
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      Browsing views and searches are not currently logged for recommendation matching. Enable anytime to resume tailored picks.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="gold-btn"
                    onClick={() => {
                      setTrackingConsent(owner, true)
                      setTrackingOn(true)
                      if (user) saveCustomerTrackingConsent(true).catch(() => {})
                    }}
                    style={{ fontSize: '12px', padding: '7px 16px', borderRadius: '8px' }}
                  >
                    <Check size={13} /> Enable Activity Tracking
                  </button>
                </div>
              )}

              {/* Timeline Filter Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--champagne-border)', paddingBottom: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setMomentTab('all')}
                  style={{
                    padding: '6px 14px', borderRadius: '9999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                    background: momentTab === 'all' ? 'var(--plum-main)' : 'var(--champagne-light)',
                    color: momentTab === 'all' ? '#FFFFFF' : 'var(--text-main)',
                    border: `1px solid ${momentTab === 'all' ? 'var(--gold-primary)' : 'var(--champagne-border)'}`,
                  }}
                >
                  All Activity Moments ({browserMoments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMomentTab('views')}
                  style={{
                    padding: '6px 14px', borderRadius: '9999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                    background: momentTab === 'views' ? 'var(--plum-main)' : 'var(--champagne-light)',
                    color: momentTab === 'views' ? '#FFFFFF' : 'var(--text-main)',
                    border: `1px solid ${momentTab === 'views' ? 'var(--gold-primary)' : 'var(--champagne-border)'}`,
                  }}
                >
                  Viewed Properties ({recentlyViewedProperties.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMomentTab('searches')}
                  style={{
                    padding: '6px 14px', borderRadius: '9999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                    background: momentTab === 'searches' ? 'var(--plum-main)' : 'var(--champagne-light)',
                    color: momentTab === 'searches' ? '#FFFFFF' : 'var(--text-main)',
                    border: `1px solid ${momentTab === 'searches' ? 'var(--gold-primary)' : 'var(--champagne-border)'}`,
                  }}
                >
                  Searches &amp; Inquiries ({browserMoments.filter((m) => m.kind === 'search' || m.kind === 'enquiry').length})
                </button>
              </div>

              {/* Empty State */}
              {browserMoments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--champagne-light)', borderRadius: '16px', border: '1px dashed var(--champagne-border)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                    <Eye size={22} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>
                    No Browsing Moments Recorded Yet
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 16px', lineHeight: 1.55 }}>
                    As you inspect luxury listings and search UAE communities, your interactions will appear here in chronological order to help you resume where you left off.
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => navigate('/')} className="gold-btn" style={{ fontSize: '13px', padding: '9px 20px' }}>
                      <Home size={14} /> Browse Properties
                    </button>
                    <button type="button" onClick={() => setIsAgentOpen(true)} className="outline-navy-btn" style={{ fontSize: '13px', padding: '9px 18px' }}>
                      <MessageSquareText size={14} /> Consult AI Advisor
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Viewed Properties Grid */}
                  {(momentTab === 'views' || momentTab === 'all') && recentlyViewedProperties.length > 0 && (
                    <div style={{ marginBottom: momentTab === 'all' ? '28px' : '0' }}>
                      {momentTab === 'all' && (
                        <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Clock size={14} color="var(--gold-dark)" /> Recently Inspected Properties
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '20px' }}>
                        {recentlyViewedProperties.map(({ property, viewedAt }) => (
                          <div key={property.property_id}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={11} /> Inspected {new Date(viewedAt).toLocaleDateString()}
                            </div>
                            <PropertyCard
                              property={property}
                              isFavorite={favorites.some((f) => f.property_id === property.property_id)}
                              onToggleFavorite={toggleFavorite}
                              onSelectProperty={setSelected}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Searches & Interaction Moments List */}
                  {(momentTab === 'searches' || momentTab === 'all') && (
                    <div>
                      {momentTab === 'all' && (
                        <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Search size={14} color="var(--gold-dark)" /> Search &amp; Inquiry Moments
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {browserMoments
                          .filter((m) => momentTab === 'all' ? (m.kind === 'search' || m.kind === 'enquiry') : (m.kind === 'search' || m.kind === 'enquiry'))
                          .map((m, idx) => (
                            <div key={m._id || idx} className="moment-card">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                  width: '38px', height: '38px', borderRadius: '10px',
                                  background: m.kind === 'search' ? 'var(--champagne-light)' : 'rgba(46, 125, 79, 0.1)',
                                  border: `1px solid ${m.kind === 'search' ? 'var(--champagne-border)' : 'rgba(46, 125, 79, 0.25)'}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: m.kind === 'search' ? 'var(--gold-dark)' : '#1F6B3E',
                                  flexShrink: 0
                                }}>
                                  {m.kind === 'search' ? <Search size={16} /> : <Tag size={16} />}
                                </div>
                                <div>
                                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--plum-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{m.kind === 'search' ? 'Search Query' : 'Property Inquiry'}</span>
                                    {m.location && (
                                      <span className="uae-badge neutral" style={{ fontSize: '10.5px', padding: '1px 8px' }}>
                                        {m.location}
                                      </span>
                                    )}
                                    {m.propertyType && (
                                      <span className="uae-badge neutral" style={{ fontSize: '10.5px', padding: '1px 8px' }}>
                                        {m.propertyType}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    {m.query ? `"${m.query}"` : m.property?.title ? m.property.title : 'General luxury portfolio filter'}
                                    <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>·</span>
                                    <span>{new Date(m.createdAt).toLocaleDateString()} {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                </div>
                              </div>

                              <div>
                                {m.kind === 'search' ? (
                                  <button
                                    type="button"
                                    className="outline-navy-btn"
                                    onClick={() => navigate(m.location ? `/?community=${encodeURIComponent(m.location)}` : '/')}
                                    style={{ fontSize: '11.5px', padding: '6px 12px', borderRadius: '6px' }}
                                  >
                                    View Results
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="outline-navy-btn"
                                    onClick={() => setActiveView('inquiries')}
                                    style={{ fontSize: '11.5px', padding: '6px 12px', borderRadius: '6px' }}
                                  >
                                    View Inquiries
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ------------------------------------------------------------
              VIEW 6: MY INQUIRIES
             ------------------------------------------------------------ */}
          {activeView === 'inquiries' && (
            <section className="uae-card">
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <Tag size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">My Inquiries ({inquiries.length})</h3>
                    <div className="uae-card-sub">
                      Expressions of interest submitted via property cards or our AI concierge.
                    </div>
                  </div>
                </div>
              </div>

              {inquiries.length === 0 && (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--champagne-light)', borderRadius: '14px', border: '1px dashed var(--champagne-border)' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    <Tag size={20} />
                  </div>
                  <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>No Inquiries Submitted</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.5 }}>
                    When you request brochures, floor plans, or direct agent contact from any property, it will appear here.
                  </p>
                </div>
              )}

              {inqMsg && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#991B1B', marginBottom: '14px' }}>
                  <AlertCircle size={14} /> {inqMsg}
                </div>
              )}

              <div style={{ display: 'grid', gap: '12px' }}>
                {inquiries.map((q) => (
                  <div key={q._id} style={{ border: '1px solid var(--champagne-border)', borderRadius: '14px', padding: '16px 18px', background: '#FFFFFF', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)' }}>{q.propertyTitle}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {q.propertyLocation ? q.propertyLocation + " · " : ""}{q.bedrooms ? q.bedrooms + " BHK · " : ""}AED {(q.priceAed ?? 0).toLocaleString("en-US")}
                        </div>
                      </div>
                      <span className={`uae-badge ${q.status === 'Contacted' ? 'active' : q.status === 'Submitted' ? 'pending' : 'neutral'}`}>
                        {q.status}
                      </span>
                    </div>

                    {q.status !== 'Withdrawn' && (
                      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--champagne-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {withdrawId === q._id ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', color: '#9C4A3C', fontWeight: 700 }}>Withdraw this inquiry?</span>
                            <button
                              type="button"
                              className="gold-btn"
                              style={{ padding: '5px 12px', fontSize: '11.5px' }}
                              onClick={() => {
                                void handleWithdrawInquiry(q._id)
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="outline-navy-btn"
                              style={{ padding: '5px 12px', fontSize: '11.5px' }}
                              onClick={() => setWithdrawId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="lyka-chat-link-btn"
                            onClick={() => setWithdrawId(q._id)}
                            style={{ fontSize: '12px', color: '#9C4A3C' }}
                          >
                            <Trash2 size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Withdraw inquiry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ------------------------------------------------------------
              VIEW 7: APPOINTMENTS (CALLS & SITE VISITS)
             ------------------------------------------------------------ */}
          {activeView === 'appointments' && (
            <section className="uae-card">
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">Calls &amp; Site Visits ({appointments.length})</h3>
                    <div className="uae-card-sub">
                      Scheduled phone consultations and private property walkthroughs arranged with your LYKA agent.
                    </div>
                  </div>
                </div>
              </div>

              {!user ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--champagne-light)', borderRadius: '14px', border: '1px dashed var(--champagne-border)' }}>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>Sign in to view your scheduled viewings and appointments.</p>
                </div>
              ) : apptLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: 'var(--text-secondary)', padding: '20px 0' }}>
                  <Loader2 size={16} className="animate-spin" /> Loading appointment records…
                </div>
              ) : appointments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--champagne-light)', borderRadius: '14px', border: '1px dashed var(--champagne-border)' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    <CalendarDays size={20} />
                  </div>
                  <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>No Appointments Booked</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto', lineHeight: 1.5 }}>
                    Your assigned LYKA real-estate advisor will schedule private viewings and callback slots here.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {appointments.map((a) => (
                    <div key={`${a.kind}-${a.id}`} style={{ border: '1px solid var(--champagne-border)', borderRadius: '14px', padding: '16px 18px', background: 'var(--champagne-light)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--plum-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CalendarDays size={14} style={{ color: 'var(--gold-dark)' }} />
                          {a.kind === 'call' ? 'Advisory Phone Consultation' : 'Private Property Viewing'}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                          {a.scheduled_at ? new Date(a.scheduled_at).toLocaleString() : 'Date Pending'}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                          Reference: Enquiry #{a.lead_id}{a.property_ref ? ` · Property ${a.property_ref}` : ''}
                        </div>
                      </div>
                      <span className="uae-badge neutral" style={{ textTransform: 'capitalize' }}>
                        {String(a.status || 'scheduled').replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '14px 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpCircle size={13} /> Appointment records are read-only. Contact your assigned advisor to reschedule or cancel.
              </p>
            </section>
          )}

          {/* ------------------------------------------------------------
              VIEW 8: COMPARE PROPERTIES
             ------------------------------------------------------------ */}
          {activeView === 'compare' && (
            <section className="uae-card">
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon">
                    <Scale size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">Property Comparison Matrix</h3>
                    <div className="uae-card-sub">
                      Side-by-side evaluation of selected properties (select 2 to 4 homes from your Saved collection).
                    </div>
                  </div>
                </div>
                {favorites.length > 0 && (
                  <button
                    type="button"
                    className="outline-navy-btn"
                    onClick={() => setActiveView('favorites')}
                    style={{ fontSize: '12.5px', padding: '8px 16px', borderRadius: '8px' }}
                  >
                    Select more homes ({favorites.length})
                  </button>
                )}
              </div>

              {comparedProperties.length < 2 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--champagne-light)', borderRadius: '16px', border: '1px dashed var(--champagne-border)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                    <Scale size={22} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>
                    Select at least 2 properties to compare
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 16px', lineHeight: 1.55 }}>
                    You currently have {compareIds.length} property selected. Browse your Saved Homes to pick properties for side-by-side comparison.
                  </p>
                  <button type="button" onClick={() => setActiveView('favorites')} className="gold-btn" style={{ fontSize: '13px', padding: '9px 20px' }}>
                    <Heart size={14} /> Go to Saved Homes
                  </button>
                </div>
              ) : (
                <div className="compare-container">
                  <table className="compare-table">
                    <thead>
                      <tr>
                        <th className="compare-th compare-row-header">Feature</th>
                        {comparedProperties.map((p) => (
                          <th key={p.property_id} className="compare-th" style={{ width: `${100 / (comparedProperties.length + 1)}%` }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <img
                                src={p.image_url}
                                alt={p.title}
                                style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px' }}
                              />
                              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--plum-main)' }}>{p.title}</div>
                              <button
                                type="button"
                                onClick={() => toggleCompare(p.property_id)}
                                style={{ background: 'none', border: 'none', color: '#9C4A3C', fontSize: '11px', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                              >
                                Remove from compare
                              </button>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="compare-td compare-row-header">Price (AED)</td>
                        {comparedProperties.map((p) => (
                          <td key={p.property_id} className="compare-td" style={{ fontWeight: 800, color: 'var(--plum-main)' }}>
                            AED {(p.price_aed ?? 0).toLocaleString('en-US')}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="compare-td compare-row-header">Price / Sqft</td>
                        {comparedProperties.map((p) => (
                          <td key={p.property_id} className="compare-td">
                            AED {(p.price_per_sqft_aed ?? 0).toLocaleString('en-US')} / sqft
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="compare-td compare-row-header">Type &amp; Purpose</td>
                        {comparedProperties.map((p) => (
                          <td key={p.property_id} className="compare-td">
                            {p.property_type} · For {p.listing_type}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="compare-td compare-row-header">Bedrooms &amp; Baths</td>
                        {comparedProperties.map((p) => (
                          <td key={p.property_id} className="compare-td">
                            {p.bhk} BHK · {p.bathrooms} Baths
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="compare-td compare-row-header">Built-up Area</td>
                        {comparedProperties.map((p) => (
                          <td key={p.property_id} className="compare-td">
                            {(p.property_size_sqft ?? 0).toLocaleString('en-US')} sqft
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="compare-td compare-row-header">Community</td>
                        {comparedProperties.map((p) => (
                          <td key={p.property_id} className="compare-td">
                            {p.location}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="compare-td compare-row-header">View</td>
                        {comparedProperties.map((p) => (
                          <td key={p.property_id} className="compare-td">
                            {p.view || 'Standard City View'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="compare-td compare-row-header">Furnishing</td>
                        {comparedProperties.map((p) => (
                          <td key={p.property_id} className="compare-td">
                            {p.furnishing || 'Unfurnished'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="compare-td compare-row-header">Metro Access</td>
                        {comparedProperties.map((p) => (
                          <td key={p.property_id} className="compare-td">
                            {p.near_metro ? `Yes (${p.metro_distance_km ?? 0} km to ${p.nearest_metro || 'Station'})` : 'No direct metro'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          
          {/* ------------------------------------------------------------
              VIEW 11: CUSTOMER SUPPORT & CONCIERGE HELP DESK
             ------------------------------------------------------------ */}
          {activeView === 'support' && (
            <section className="uae-card">
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon" style={{ background: 'var(--plum-main)', color: 'var(--gold-hover)', borderColor: 'var(--gold-border)' }}>
                    <LifeBuoy size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">Customer Support &amp; Concierge Desk</h3>
                    <div className="uae-card-sub">
                      Submit inquiries, request documentation, or resolve questions with our dedicated client concierge.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="gold-btn"
                  onClick={() => setShowTicketModal(true)}
                  style={{ fontSize: '12.5px', padding: '8px 18px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={14} /> New Support Request
                </button>
              </div>



              {loadingTickets ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                  <div>Loading your support tickets…</div>
                </div>
              ) : customerTickets.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <LifeBuoy size={32} color="var(--gold-primary)" style={{ marginBottom: '12px' }} />
                  <div style={{ fontWeight: 700, color: 'var(--plum-main)', fontSize: '15px', marginBottom: '6px' }}>No Support Requests Yet</div>
                  <div style={{ fontSize: '13px', maxWidth: '440px', margin: '0 auto 16px', lineHeight: 1.5 }}>
                    Need assistance with a property, payment schedule, or site viewing? Click "New Support Request" to message our team.
                  </div>
                  <button
                    type="button"
                    className="gold-btn"
                    onClick={() => setShowTicketModal(true)}
                    style={{ fontSize: '12.5px', padding: '8px 18px', borderRadius: '8px' }}
                  >
                    Open Support Request
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {customerTickets.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedCustTicket(t)}
                      style={{
                        padding: '16px 20px',
                        borderRadius: '12px',
                        border: '1px solid var(--champagne-border)',
                        background: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '14px',
                        flexWrap: 'wrap',
                        transition: 'border-color 0.18s ease',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--gold-dark)' }}>{t.ticket_number}</span>
                          <span style={{
                            padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700, textTransform: 'capitalize',
                            background: t.status === 'open' ? '#FEF2F2' : t.status === 'in_progress' ? '#FEF3C7' : '#F0FDF4',
                            color: t.status === 'open' ? '#DC2626' : t.status === 'in_progress' ? '#D97706' : '#16A34A',
                          }}>
                            {t.status.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '11px', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                            · {t.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--plum-main)' }}>
                          {t.subject}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {t.messages?.length || 1} message(s) · Last updated {new Date(t.updated_at).toLocaleDateString()}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedCustTicket(t) }}
                        style={{ padding: '6px 14px', borderRadius: '6px', background: 'var(--champagne-surface)', border: '1px solid var(--champagne-border)', color: 'var(--plum-main)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        View Thread
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Create Ticket Modal */}
              {showTicketModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
                  <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--plum-main)', margin: 0 }}>New Support Request</h3>
                      <button type="button" onClick={() => setShowTicketModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={20} color="var(--text-secondary)" />
                      </button>
                    </div>

                    {ticketError && (
                      <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '12.5px', marginBottom: '14px' }}>
                        {ticketError}
                      </div>
                    )}

                    <form onSubmit={handleCreateCustomerTicket} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }}>Category</label>
                        <select
                          value={ticketCategory}
                          onChange={(e) => setTicketCategory(e.target.value as SupportTicket['category'])}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px' }}
                        >
                          <option value="general">General Support</option>
                          <option value="inquiry">Property Inquiry &amp; Availability</option>
                          <option value="viewing">Site Viewing &amp; Booking</option>
                          <option value="payment">Payment Plans &amp; Escrow Advisory</option>
                          <option value="complaint">Feedback &amp; Service Review</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }}>Subject *</label>
                        <input
                          required
                          value={ticketSubject}
                          onChange={(e) => setTicketSubject(e.target.value)}
                          placeholder="e.g. Schedule weekend viewing for Palm Villa"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px', color: 'var(--plum-main)' }}>Detailed Message *</label>
                        <textarea
                          required
                          rows={4}
                          value={ticketMessage}
                          onChange={(e) => setTicketMessage(e.target.value)}
                          placeholder="Please provide details about your inquiry or request…"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', resize: 'vertical' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                        <button
                          type="button"
                          onClick={() => setShowTicketModal(false)}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--champagne-border)', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingTicket}
                          className="gold-btn"
                          style={{ padding: '8px 20px', borderRadius: '8px', fontSize: '13px' }}
                        >
                          {submittingTicket ? 'Submitting…' : 'Submit Ticket'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* View Customer Ticket Thread Modal */}
              {selectedCustTicket && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
                  <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '650px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                    <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--champagne-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--gold-dark)' }}>{selectedCustTicket.ticket_number}</span>
                          <span style={{
                            padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700, textTransform: 'capitalize',
                            background: selectedCustTicket.status === 'open' ? '#FEF2F2' : selectedCustTicket.status === 'in_progress' ? '#FEF3C7' : '#F0FDF4',
                            color: selectedCustTicket.status === 'open' ? '#DC2626' : selectedCustTicket.status === 'in_progress' ? '#D97706' : '#16A34A',
                          }}>
                            {selectedCustTicket.status.replace('_', ' ')}
                          </span>
                        </div>
                        <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--plum-main)', margin: 0 }}>{selectedCustTicket.subject}</h4>
                      </div>
                      <button type="button" onClick={() => setSelectedCustTicket(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={18} color="var(--text-secondary)" />
                      </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {selectedCustTicket.messages?.map((m) => {
                        const isMine = m.sender_type === 'customer'
                        return (
                          <div
                            key={m.id}
                            style={{
                              alignSelf: isMine ? 'flex-end' : 'flex-start',
                              maxWidth: '85%',
                              padding: '12px 16px',
                              borderRadius: '12px',
                              background: isMine ? 'var(--plum-main)' : 'var(--champagne-surface)',
                              color: isMine ? '#fff' : 'var(--plum-main)',
                              border: isMine ? 'none' : '1px solid var(--champagne-border)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px', fontSize: '11px', color: isMine ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>
                              <strong>{isMine ? 'You' : (m.sender_name || 'LYKA Support')}</strong>
                              <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div style={{ fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                              {m.message}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div style={{ padding: '14px 18px', borderTop: '1px solid var(--champagne-border)', background: '#FAFAFA' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          value={custReplyText}
                          onChange={(e) => setCustReplyText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleSendCustReply() }}
                          placeholder="Type your response to the support team…"
                          style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px' }}
                        />
                        <button
                          type="button"
                          onClick={() => void handleSendCustReply()}
                          disabled={sendingCustReply || !custReplyText.trim()}
                          className="gold-btn"
                          style={{ padding: '0 16px', borderRadius: '8px', fontSize: '13px' }}
                        >
                          <Send size={14} /> Send
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

{/* ------------------------------------------------------------
              VIEW 9: MESSAGES & AI CONSULTATIONS
             ------------------------------------------------------------ */}
                    {/* ------------------------------------------------------------
              VIEW 12: COMPANY-MANAGED PROPERTY DISCOVERY
             ------------------------------------------------------------ */}
          {activeView === 'discovery' && (
            <section className="uae-card" style={{ padding: '24px' }}>
              <PropertyDiscovery
                onSelectProperty={(p) => setSelected(p)}
                onToggleFavorite={toggleFavorite}
                isFavorite={(id) => favorites.some((f) => f.property_id === id)}
              />
            </section>
          )}

          {activeView === 'messages' && (
            <section className="uae-card">
              <div className="uae-card-header">
                <div className="uae-card-title-group">
                  <div className="uae-card-icon" style={{ background: 'var(--plum-main)', color: 'var(--gold-hover)', borderColor: 'var(--gold-border)' }}>
                    <Bot size={18} />
                  </div>
                  <div>
                    <h3 className="uae-card-title">AI Real Estate Advisor Consultation</h3>
                    <div className="uae-card-sub">
                      Live conversational advisor for luxury UAE properties, market yields, and payment plans. Real responses powered by local AI.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="gold-btn"
                  onClick={() => setIsAgentOpen(true)}
                  style={{ fontSize: '12.5px', padding: '8px 18px', borderRadius: '8px' }}
                >
                  <Sparkles size={13} /> Open Fullscreen AI Concierge
                </button>
              </div>

              {/* Quick Prompt Pills */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Try asking:</span>
                {[
                  '2BHK in Dubai Marina under 2.5M AED',
                  'Palm Jumeirah luxury beachfront villa',
                  'High rental yield investment in Business Bay',
                  'UAE Golden Visa qualified penthouses',
                ].map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => void handleSendPortalChat(prompt)}
                    disabled={portalChatLoading}
                    style={{
                      fontSize: '11.5px', padding: '5px 12px', borderRadius: '9999px',
                      background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)',
                      color: 'var(--plum-main)', cursor: 'pointer', fontWeight: 600,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    + {prompt}
                  </button>
                ))}
              </div>

              {/* Interactive Live Chat Room */}
              <div className="portal-chat-room">
                {/* Chat Feed */}
                <div className="portal-chat-feed">
                  {convo.turns.length === 0 && liveChatTurns.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--text-secondary)' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--champagne-light)', border: '1px solid var(--champagne-border)', color: 'var(--gold-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                        <MessageSquareText size={20} />
                      </div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--plum-main)', marginBottom: '4px' }}>
                        Start Your Real-Estate Consultation
                      </div>
                      <p style={{ fontSize: '13px', margin: 0, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                        Ask our AI advisor about communities, prices, floor plans, or investment opportunities across Dubai.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Past Recorded Turns */}
                      {convo.turns.map((t, idx) => (
                        <div
                          key={`past-${idx}`}
                          className={`portal-chat-bubble ${t.role === 'user' ? 'user' : 'assistant'}`}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.8, marginBottom: '3px' }}>
                            {t.role === 'user' ? 'You' : 'LYKA AI Advisor'}
                          </div>
                          <div>{t.text}</div>
                        </div>
                      ))}

                      {/* Live Session Turns */}
                      {liveChatTurns.map((t, idx) => (
                        <div
                          key={`live-${idx}`}
                          className={`portal-chat-bubble ${t.role === 'user' ? 'user' : 'assistant'}`}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.8, marginBottom: '3px' }}>
                            {t.role === 'user' ? 'You' : 'LYKA AI Advisor'}
                          </div>
                          <div>{t.text}</div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Thinking / Loading State */}
                  {portalChatLoading && (
                    <div className="portal-chat-bubble assistant" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Loader2 size={16} className="animate-spin" color="var(--gold-dark)" />
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        LYKA AI is reviewing UAE luxury properties &amp; formulating advice...
                      </span>
                    </div>
                  )}

                  {/* Error State Banner */}
                  {portalChatError && (
                    <div style={{
                      padding: '12px 16px', borderRadius: '12px',
                      background: '#FDF2F2', border: '1px solid #F8B4B4',
                      color: '#9B1C1C', fontSize: '12.5px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={15} />
                        <span>{portalChatError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSendPortalChat()}
                        style={{
                          background: 'none', border: 'none', color: '#9B1C1C',
                          textDecoration: 'underline', cursor: 'pointer', fontWeight: 700, fontSize: '12px'
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <div ref={chatFeedEndRef} />
                </div>

                {/* Composer Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void handleSendPortalChat()
                  }}
                  className="portal-chat-composer"
                >
                  <input
                    type="text"
                    className="portal-chat-input"
                    placeholder="Ask about Dubai communities, budgets, villas, or Golden Visa..."
                    value={portalChatInput}
                    onChange={(e) => setPortalChatInput(e.target.value)}
                    disabled={portalChatLoading}
                  />
                  <button
                    type="submit"
                    className="gold-btn"
                    disabled={!portalChatInput.trim() || portalChatLoading}
                    style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {portalChatLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </section>
          )}

          {/* ------------------------------------------------------------
              VIEW 10: SETTINGS, PREFERENCES & SECURITY
             ------------------------------------------------------------ */}
          {activeView === 'settings' && (
            <>
              {/* Appearance Setting: Light & Dark Mode */}
              <section className="uae-card" style={{ marginBottom: '24px' }}>
                <div className="uae-card-header">
                  <div className="uae-card-title-group">
                    <div className="uae-card-icon">
                      {currentTheme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                    </div>
                    <div>
                      <h3 className="uae-card-title">Appearance</h3>
                      <div className="uae-card-sub">
                        Switch between Light Mode and Dark Mode for your luxury LYKA portal experience.
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', maxWidth: '540px' }}>
                    {/* Light Mode Card */}
                    <button
                      type="button"
                      onClick={() => handleThemeChange('light')}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '16px',
                        borderRadius: '12px',
                        background: currentTheme === 'light' ? 'var(--gold-light)' : '#FFFFFF',
                        border: `2px solid ${currentTheme === 'light' ? 'var(--gold-primary)' : 'var(--champagne-border)'}`,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: currentTheme === 'light' ? '0 4px 14px rgba(197, 168, 105, 0.25)' : 'none',
                      }}
                    >
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C5A869', border: '1px solid var(--champagne-border)' }}>
                        <Sun size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--plum-main)' }}>Light Mode</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Warm cream &amp; champagne gold</div>
                      </div>
                      {currentTheme === 'light' && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          ✓ Active
                        </span>
                      )}
                    </button>

                    {/* Dark Mode Card */}
                    <button
                      type="button"
                      onClick={() => handleThemeChange('dark')}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '16px',
                        borderRadius: '12px',
                        background: currentTheme === 'dark' ? '#251424' : '#1A0D18',
                        border: `2px solid ${currentTheme === 'dark' ? 'var(--gold-primary)' : '#3E243A'}`,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: currentTheme === 'dark' ? '0 4px 14px rgba(197, 168, 105, 0.25)' : 'none',
                      }}
                    >
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#2A1426', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D8BD80', border: '1px solid #4A2844' }}>
                        <Moon size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#FBF8F3' }}>Dark Mode</div>
                        <div style={{ fontSize: '12px', color: '#D4C3AC', marginTop: '2px' }}>Deep plum &amp; dark luxury shades</div>
                      </div>
                      {currentTheme === 'dark' && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#D8BD80', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          ✓ Active
                        </span>
                      )}
                    </button>
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
                    Appearance preferences are persisted securely to your authenticated database profile.
                  </p>
                </div>
              </section>
              {/* Property Preferences */}
              <section className="uae-card">
                <div className="uae-card-header">
                  <div className="uae-card-title-group">
                    <div className="uae-card-icon">
                      <SlidersHorizontal size={18} />
                    </div>
                    <div>
                      <h3 className="uae-card-title">Property Preferences</h3>
                      <div className="uae-card-sub">
                        Saved criteria powering your personalized feed and new listing alerts.
                      </div>
                    </div>
                  </div>
                </div>

                {user ? (
                  <div>
                    <PreferencesEditor
                      owner={owner}
                      identity={{
                        name: serverProfile?.name || profile?.name || user?.name || '',
                        phone: serverProfile?.phone || profile?.phone || undefined,
                        city: serverProfile?.city || profile?.city || undefined,
                        country: serverProfile?.country || profile?.country || undefined,
                      }}
                      initialPrefs={effectivePrefsDoc}
                      requirements={savedRequirements}
                      onSaved={handlePrefsSaved}
                    />
                  </div>
                ) : (
                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>Sign in to save property preferences.</p>
                )}
              </section>

              {/* Sign-in & Security */}
              <section className="uae-card">
                <div className="uae-card-header">
                  <div className="uae-card-title-group">
                    <div className="uae-card-icon">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <h3 className="uae-card-title">Sign-in &amp; Security</h3>
                      <div className="uae-card-sub">
                        Manage authentication credentials and password settings.
                      </div>
                    </div>
                  </div>
                </div>

                {!user ? (
                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>Sign in to manage security settings.</p>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                      <span className="uae-badge active">
                        <CheckCircle2 size={12} /> {user?.email}
                      </span>
                      {hasGoogleProvider && (
                        <span className="uae-badge active">
                          <CheckCircle2 size={12} /> Google linked
                        </span>
                      )}
                      {hasPasswordProvider && (
                        <span className="uae-badge active">
                          <CheckCircle2 size={12} /> Email + password linked
                        </span>
                      )}
                    </div>

                    {hasPasswordProvider ? (
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        You can sign in with email + password or Google. To change a forgotten password, use “Forgot password?” on the sign-in modal.
                      </p>
                    ) : (
                      <form onSubmit={handleSetPassword} style={{ maxWidth: '440px', marginTop: '14px' }}>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                          <KeyRound size={13} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
                          This account signs in with Google. Set a password below to enable email + password sign-in as well.
                        </p>
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }} htmlFor="lyka-new-password">
                            New password (min. 6 characters)
                          </label>
                          <input
                            id="lyka-new-password"
                            type="password"
                            autoComplete="new-password"
                            value={pw}
                            onChange={(e) => setPw(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }} htmlFor="lyka-new-password-2">
                            Confirm password
                          </label>
                          <input
                            id="lyka-new-password-2"
                            type="password"
                            autoComplete="new-password"
                            value={pw2}
                            onChange={(e) => setPw2(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--champagne-border)', fontSize: '13px', boxSizing: 'border-box' }}
                          />
                        </div>
                        {pwMsg && (
                          <div role={pwMsg.kind === 'err' ? 'alert' : 'status'} style={{ fontSize: '13px', color: pwMsg.kind === 'err' ? '#991B1B' : '#2E9E6B', marginBottom: '12px' }}>
                            {pwMsg.text}
                          </div>
                        )}
                        <button type="submit" className="gold-btn" disabled={pwSaving} style={{ padding: '9px 20px', fontSize: '13px' }}>
                          {pwSaving ? 'Linking…' : 'Set password'}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </section>

              {/* Privacy & Tracking */}
              <section className="uae-card">
                <div className="uae-card-header">
                  <div className="uae-card-title-group">
                    <div className="uae-card-icon">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <h3 className="uae-card-title">Privacy &amp; Data Control</h3>
                      <div className="uae-card-sub">
                        Consent options for activity-based recommendation algorithms.
                      </div>
                    </div>
                  </div>
                </div>

                <PrivacyControls
                  checked={trackingOn}
                  onToggle={(allow) => {
                    setTrackingConsent(owner, allow)
                    setTrackingOn(allow)
                    if (user) {
                      saveCustomerTrackingConsent(allow).catch(() => {})
                    }
                  }}
                />

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '18px 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Trash2 size={12} />
                  Your records live on this device{user ? ' and in private Firebase database storage' : ''}. When signing out on shared computers, clear browser cache afterwards.
                </p>
              </section>
            </>
          )}
        </div>
      </main>

      {/* Property Details Modal */}
      <PropertyModal
        property={selected}
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        isFavorite={selected ? favorites.some((p) => p.property_id === selected.property_id) : false}
        onToggleFavorite={toggleFavorite}
      />

      {/* Fullscreen AI Concierge Modal */}
      <UIAgentModal
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        properties={catalogue}
        onSelectProperty={setSelected}
        favoriteIds={favorites.map((p) => p.property_id)}
        onToggleFavorite={toggleFavorite}
      />

      {/* Customer Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => {
          setIsAuthOpen(false)
          setSyncState('loading')
          setProfileFetchTick((t) => t + 1)
          navigate('/')
        }}
      />
    </div>
  )
}

export function AccountPage() {
  const navigate = useNavigate()
  const [retryKey, setRetryKey] = useState(0)

  const handleRetry = useCallback(() => {
    setRetryKey((k) => k + 1)
  }, [])

  const handleReturnHome = useCallback(() => {
    navigate('/')
  }, [navigate])

  return (
    <PortalErrorBoundary onRetry={handleRetry} onNavigateHome={handleReturnHome} key={retryKey}>
      <AccountPageContent onRetry={handleRetry} />
    </PortalErrorBoundary>
  )
}
