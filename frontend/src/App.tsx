import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Property, PropertyFilters } from './types/property'
import type { AgentStatus } from './types/agent'
import { formatProperty } from './utils/propertyData'
import { fetchPropertiesFromApi, formatApiErrorMessage, createCustomerInteraction, getCustomerFavorites, saveCustomerFavorites } from './services/api'
import { Navbar } from './components/Navbar'
import { Hero } from './components/Hero'
import { StatsRibbon } from './components/StatsRibbon'
import { Developers } from './components/Developers'
import { Services } from './components/Services'
import { PropertyFilter } from './components/PropertyFilter'
import { PropertyCard } from './components/PropertyCard'
import { Neighborhoods } from './components/Neighborhoods'
import { WhyLyka } from './components/WhyLyka'
import { DubaiInvestment } from './components/DubaiInvestment'
import { WhoWeHelp } from './components/WhoWeHelp'
import { PropertyJourney } from './components/PropertyJourney'
import { MortgageCalculator } from './components/MortgageCalculator'
import { Testimonials } from './components/Testimonials'
import { FAQ } from './components/FAQ'
import { ContactConsultation } from './components/ContactConsultation'
import { Footer } from './components/Footer'
import { PropertyModal } from './components/PropertyModal'
import { FavoritesDrawer } from './components/FavoritesDrawer'
import { UIAgentModal } from './components/agent/UIAgentModal'
import { VoiceAgentControl } from './components/agent/VoiceAgentControl'
import { WelcomePage } from './components/WelcomePage'
import { AuthModal, type AuthMode } from './components/AuthModal'
import { PortalSelect } from './components/PortalSelect'
import { EmployeeLogin } from './components/EmployeeLogin'
import { useAuth } from './context/AuthContext'
import { AUTH_GATE_ENABLED } from './services/firebase'
import { executeCustomerBrowserMigration, purgeTransientBrowserStorage } from './services/legacyMigration'
import {
  setChatCloudUid, clearLocalUser, ownerKeyFor,
  logInteraction, getTrackingConsent,
} from './services/chatStore'
import {
  sanitizeFavoriteIds, resolveFavoriteProperties, toggleFavoriteId,
  favoriteIdSet,
} from './utils/favorites'
import { cloudSaveFavoritesAll } from './services/rtdb'
import { BackendStatusIndicator } from './components/BackendStatusIndicator'
import { ViewportPreview } from './components/dev/ViewportPreview'
import { StaffArea } from './crm/pages/StaffArea'
import { AccountPage } from './pages/AccountPage'
import { CustomerHomeSection } from './components/CustomerHomeSection'
import { fetchStaffMe, clearStaffMeCache, useStaffRole } from './crm/services/staffApi'
import { ChevronDown, Building2, AlertCircle, Sparkles, X } from 'lucide-react'

const DEFAULT_FILTERS: PropertyFilters = {
  searchQuery: '',
  listingType: 'All',
  propertyType: '',
  location: '',
  minPrice: 0,
  maxPrice: 0,
  bhk: '',
  nearMetroOnly: false,
  beachfrontOnly: false,
  sortBy: 'recommended'
}

export function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [properties, setProperties] = useState<Property[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [propertiesCache, setPropertiesCache] = useState<Record<string, Property>>({})
  const [filters, setFilters] = useState<PropertyFilters>(DEFAULT_FILTERS)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [visibleCount, setVisibleCount] = useState(12)

  // Favorites state — namespaced per owner (signed-in UID or guest tab),
  // so one browser never shows User A's saved homes to User B.
  // First run seeds demo bookmarks; afterwards the owner's own list wins.
  // Stored lists are sanitized (unique string IDs); the DISPLAYED list and
  // every count derive from the same resolved records (see
  // favoriteProperties below), so the badge, menu, and panel always agree.
  const [favoriteIds, setFavoriteIds] = useState<string[]>(['LYK-00002', 'LYK-00015'])
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false)

  // UI Agent state
  const [isAgentOpen, setIsAgentOpen] = useState(false)
  const [agentInitialQuery, setAgentInitialQuery] = useState('')
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('ready')

  // First-visit welcome screen (in-memory state, zero browser-storage persistence)
  const [showWelcome, setShowWelcome] = useState<boolean>(true)

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false)
  }, [])

  // Auth state — Firebase is the single source of truth. The Firebase SDK
  // persists the session and refreshes ID tokens automatically, so sign-in
  // survives page refreshes; expired/invalid sessions resolve to null.
  const { user: fbUser, authLoading, logout } = useAuth()
  const { role: staffRole } = useStaffRole()
  const isStaff = staffRole !== null && ['admin', 'manager', 'hrms_admin', 'sales_agent', 'salesperson'].includes(staffRole)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  // Portal-selection flow: the navbar Sign In button opens the portal
  // chooser first; customers continue to the AuthModal, employees to the
  // dedicated EmployeeLogin. Direct AuthModal opens (favorites gate, chat
  // gate) still target the customer login.
  const [isPortalOpen, setIsPortalOpen] = useState(false)
  const [isEmployeeOpen, setIsEmployeeOpen] = useState(false)
  const [pendingChatAfterLogin, setPendingChatAfterLogin] = useState(false)
  const [customerWelcomeToast, setCustomerWelcomeToast] = useState<{
    name?: string
    isNewUser?: boolean
  } | null>(null)
  const [loginRedirectToast, setLoginRedirectToast] = useState(false)

  useEffect(() => {
    if (!customerWelcomeToast) return
    const timer = setTimeout(() => {
      setCustomerWelcomeToast(null)
    }, 6000)
    return () => clearTimeout(timer)
  }, [customerWelcomeToast])

  useEffect(() => {
    if (!loginRedirectToast) return
    const timer = setTimeout(() => {
      setLoginRedirectToast(false)
    }, 4000)
    return () => clearTimeout(timer)
  }, [loginRedirectToast])

  const currentUser = fbUser ? { name: fbUser.name, email: fbUser.email } : null
  /** Owner namespace for this render's cache reads/writes. */
  const owner = ownerKeyFor(fbUser?.uid)

  // Fetch properties from backend API on port 8000
  // Latest-wins guard: overlapping fetches (filter edits, dev StrictMode
  // remount) must not overwrite newer results with stale responses.
  // Stale-while-revalidate: the full loading skeleton shows only on the
  // very first load. Later refetches (filter typing, sort changes) update
  // silently so the grid never blinks or flashes back to a spinner.
  const fetchSeqRef = useRef(0)
  const hasLoadedRef = useRef(false)
  const fetchProperties = useCallback(async () => {
    // Staff/account routes have their own data needs — don't fire the
    // public grid fetch there.
    if (location.pathname !== '/') return
    const seq = ++fetchSeqRef.current
    const firstLoad = !hasLoadedRef.current
    if (firstLoad) {
      setIsLoading(true)
      setApiError(null)
    }
    try {
      let backendSort: string | undefined
      if (filters.sortBy === 'price-asc') backendSort = 'cheapest'
      else if (filters.sortBy === 'price-desc') backendSort = 'expensive'
      else if (filters.sortBy === 'sqft-desc') backendSort = 'size'

      const loc = filters.location || (filters.searchQuery.trim() ? filters.searchQuery.trim() : undefined)

      let bedrooms: number | undefined
      if (filters.bhk !== '') {
        const parsed = parseInt(filters.bhk, 10)
        if (!isNaN(parsed)) bedrooms = parsed
      }

      const res = await fetchPropertiesFromApi({
        location: loc,
        property_type: filters.propertyType || undefined,
        bedrooms,
        min_budget: filters.minPrice > 0 ? filters.minPrice : undefined,
        max_budget: filters.maxPrice > 0 ? filters.maxPrice : undefined,
        purpose: filters.listingType !== 'All' ? filters.listingType : undefined,
        near_metro: filters.nearMetroOnly ? true : undefined,
        near_beach: filters.beachfrontOnly ? true : undefined,
        sort_by: backendSort,
        limit: 500
      })

      const formatted = (res.top_properties || []).map(formatProperty)
      if (seq !== fetchSeqRef.current) return // stale response — a newer fetch is in flight
      setProperties(formatted)
      setTotalCount(res.total_found ?? formatted.length)

      // Cache properties for favorites lookup
      setPropertiesCache((prev) => {
        const next = { ...prev }
        formatted.forEach((p) => {
          next[p.property_id] = p
        })
        return next
      })
    } catch (err) {
      console.error('Failed to fetch properties from backend:', err)
      if (seq !== fetchSeqRef.current) return // stale failure — ignore
      // After the first successful paint, a refetch failure keeps the old
      // list on screen (logged above) instead of flashing an error page.
      if (!hasLoadedRef.current) {
        const msg = err instanceof Error
          ? err.message
          : formatApiErrorMessage(err, 'Unable to connect to property API on port 8000')
        setApiError(msg)
        setProperties([])
        setTotalCount(0)
      }
    } finally {
      hasLoadedRef.current = true
      if (seq === fetchSeqRef.current) setIsLoading(false)
    }
  }, [filters, location.pathname])

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  // Sync favorites: owner-namespaced local cache first, RTDB mirror when
  // signed in. Never touches another owner's list. On identity switches
  // this effect skips one run so the loader below (not stale state) owns
  // the newly namespaced key — otherwise the previous owner's list would
  // be written into the new owner's slot.
  const favOwnerRef = useRef<string | null>(null)
  useEffect(() => {
    if (favOwnerRef.current !== owner) {
      favOwnerRef.current = owner
      return
    }
    if (fbUser) {
      cloudSaveFavoritesAll(fbUser.uid, favoriteIds).catch(() => {})
      saveCustomerFavorites(favoriteIds).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteIds, fbUser?.uid])

  // Strict zero-browser-persistence: purge any transient storage flags on startup
  useEffect(() => {
    purgeTransientBrowserStorage()
  }, [])

  // Cloud identity + two-way sync on sign-in/out.
  const fbUid = fbUser?.uid ?? null
  useEffect(() => {
    setChatCloudUid(fbUid)
    if (!fbUid) return
    let cancelled = false

    // Safely migrate any trapped browser records to Supabase PostgreSQL, then verify & purge
    executeCustomerBrowserMigration(fbUid)
      .then(() => {
        if (cancelled) return
        return getCustomerFavorites()
      })
      .then((favs) => {
        if (!cancelled && favs && favs.length > 0) {
          setFavoriteIds(sanitizeFavoriteIds(favs))
        }
      })
      .catch((err) => {
        console.error('[LYKA Migration]', err)
      })

    return () => {
      cancelled = true
    }
  }, [fbUid])

  // Reload this owner's saved list from Supabase PostgreSQL when identity changes
  useEffect(() => {
    if (fbUser) {
      getCustomerFavorites()
        .then((favs) => {
          if (favs && favs.length > 0) {
            setFavoriteIds(sanitizeFavoriteIds(favs))
          }
        })
        .catch(() => {})
    } else {
      setFavoriteIds(['LYK-00002', 'LYK-00015'])
    }
  }, [owner, fbUser])

  const handleToggleFavorite = (id: string) => {
    // Saving favorites requires sign-in; guests are asked to log in first.
    if (!fbUser) {
      setAuthMode('login')
      setIsAuthOpen(true)
      return
    }
    setFavoriteIds((prev) => toggleFavoriteId(prev, id))
  }

  const handleUpdateFilters = (newFilters: Partial<PropertyFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
    setVisibleCount(12)
  }

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setVisibleCount(12)
  }

  const handleSelectNeighborhood = (location: string) => {
    handleUpdateFilters({ location })
    const el = document.getElementById('properties')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleSearchSubmit = () => {
    // Explicit search action: logged for personalization only with consent.
    if (getTrackingConsent(owner) === true) {
      logInteraction(owner, {
        kind: 'search',
        location: filters.location || filters.searchQuery.trim() || null,
        propertyType: filters.propertyType || null,
        bedrooms: filters.bhk !== '' ? parseInt(filters.bhk, 10) || null : null,
        query: filters.searchQuery.trim() || null,
      })
      if (fbUser) {
        createCustomerInteraction({
          kind: 'search',
          location: filters.location || filters.searchQuery.trim() || null,
          property_type: filters.propertyType || null,
          bedrooms: filters.bhk !== '' ? parseInt(filters.bhk, 10) || null : null,
          query: filters.searchQuery.trim() || null,
        }).catch(() => {})
      }
    }
    const el = document.getElementById('properties')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Property detail views feed personalization only with consent.
  const handleSelectProperty = (property: Property | null) => {
    setSelectedProperty(property)
    if (property && getTrackingConsent(owner) === true) {
      logInteraction(owner, {
        kind: 'view',
        propertyId: property.property_id,
        location: property.location,
        propertyType: property.property_type,
        bedrooms: property.bhk,
      })
      if (fbUser) {
        createCustomerInteraction({
          kind: 'view',
          property_id: property.property_id,
          location: property.location,
          property_type: property.property_type,
          bedrooms: property.bhk,
        }).catch(() => {})
      }
    }
  }

  // Shared-listing deep link (/?property=ID): opens the detail modal once
  // the catalogue has loaded, then strips the param so refresh stays clean.
  const propertyLinkHandledRef = useRef(false)
  useEffect(() => {
    if (propertyLinkHandledRef.current || properties.length === 0) return
    try {
      const id = new URLSearchParams(window.location.search).get('property')
      if (!id) return
      propertyLinkHandledRef.current = true
      const match = properties.find((p) => p.property_id === id)
      if (match) {
        setSelectedProperty(match)
        navigate(location.pathname, { replace: true })
      }
    } catch {
      // Ignore malformed query strings.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties])

  const handleOpenAgent = (query?: string) => {
    // Guest access is currently allowed (AUTH_GATE_ENABLED=false): auth stays
    // fully enabled, but browsing and chatting don't require sign-in. Flip the
    // flag to restore hard sign-in gating for the chatbot.
    if (AUTH_GATE_ENABLED && !fbUser) {
      // Protected route: the chatbot requires sign-in. Remember the request
      // so a successful login continues straight into the chat.
      setPendingChatAfterLogin(true)
      setAgentInitialQuery(query || '')
      setAuthMode('login')
      setIsAuthOpen(true)
      return
    }
    setAgentInitialQuery(query || '')
    setIsAgentOpen(true)
  }

  const handleLogout = () => {
    logout().catch(() => {})
    // Clear role + session state immediately so the next sign-in resolves
    // fresh permissions instead of the previous user's.
    clearStaffMeCache()
    setChatCloudUid(null)
    clearLocalUser()
    setIsAgentOpen(false)
    setPendingChatAfterLogin(false)
    setShowWelcome(false) // setShowWelcome(true) reset
    navigate('/')
  }

  // Deep link from the account page's explicit "Continue in chatbot"
  // button (/?chat=1). The param is consumed and stripped immediately so a
  // later page refresh does NOT reopen the chatbot on its own.
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search)
      if (params.get('chat') === '1') {
        handleOpenAgent()
        navigate(location.pathname, { replace: true })
      }
    } catch {
      // Ignore malformed query strings.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  const handleVoiceMessage = (text: string) => {
    setAgentStatus('thinking')
    handleOpenAgent(text)
  }

  const handleScrollToContact = () => {
    const el = document.getElementById('contact')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Refined filter & sort
  const filteredProperties = useMemo(() => {
    return properties
      .filter((prop) => {
        if (filters.bhk === '4' && prop.bhk < 4) return false
        if (filters.searchQuery.trim()) {
          const query = filters.searchQuery.toLowerCase()
          const matchTitle = prop.title.toLowerCase().includes(query)
          const matchLocation = prop.location.toLowerCase().includes(query)
          const matchStreet = prop.street.toLowerCase().includes(query)
          const matchView = prop.view.toLowerCase().includes(query)
          const matchId = prop.property_id.toLowerCase().includes(query)
          if (!matchTitle && !matchLocation && !matchStreet && !matchView && !matchId) {
            return false
          }
        }
        return true
      })
      .sort((a, b) => {
        if (filters.sortBy === 'price-asc') return a.price_aed - b.price_aed
        if (filters.sortBy === 'price-desc') return b.price_aed - a.price_aed
        if (filters.sortBy === 'sqft-desc') return b.property_size_sqft - a.property_size_sqft
        if (filters.sortBy === 'newest') return a.listed_days_ago - b.listed_days_ago
        return b.price_aed - a.price_aed
      })
  }, [properties, filters.bhk, filters.searchQuery, filters.sortBy])

  const visibleProperties = useMemo(() => {
    return filteredProperties.slice(0, visibleCount)
  }, [filteredProperties, visibleCount])

  // Single source of truth: unique saved IDs resolved to real catalogue
  // records. Unresolvable IDs stay stored (never deleted) but are excluded
  // here, so the header badge, profile-menu count, and Saved Properties
  // panel always show exactly what is displayed.
  const favoriteProperties = useMemo(() => {
    return resolveFavoriteProperties(favoriteIds, (id) => propertiesCache[id] || properties.find((p) => p.property_id === id))
  }, [favoriteIds, propertiesCache, properties])

  // Resolved-ID set for heart states (a saved-but-unlisted ID has no card).
  const savedIdSet = useMemo(() => favoriteIdSet(favoriteProperties), [favoriteProperties])

  // Deep links: /crm/* staff area, /account customer dashboard.
  // Hooks above still run (harmless); the grid fetch self-skips off-site.
  const loginToastNode = loginRedirectToast ? (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 10000,
        maxWidth: '380px',
        background: 'linear-gradient(135deg, #1A0B2E 0%, #2A1245 100%)',
        border: '1px solid var(--gold-dark)',
        borderRadius: '12px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        color: 'var(--champagne-light)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span style={{ fontSize: '14px', fontWeight: 600 }}>Login successful! Redirecting to your dashboard...</span>
    </div>
  ) : null

  if (location.pathname.startsWith('/crm')) {
    return <>{loginToastNode}<StaffArea /></>
  }
  if (location.pathname.startsWith('/account')) {
    return <>{loginToastNode}<AccountPage /></>
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--champagne-light)' }}>
      {/* 1. HEADER */}
      <Navbar
        favoritesCount={favoriteProperties.length}
        onOpenFavorites={() => setIsFavoritesOpen(true)}
        onOpenAgent={() => handleOpenAgent()}
        onOpenAuth={() => {
          setIsPortalOpen(true)
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
        onBookCallClick={handleScrollToContact}
      />

      {/* 2. HERO SECTION */}
      <Hero
        filters={filters}
        onFilterChange={handleUpdateFilters}
        onSearchSubmit={handleSearchSubmit}
        totalCount={totalCount || filteredProperties.length}
      />

      {/* 2b. ROLE-BASED HOMEPAGE EXPERIENCE (Staff route directly to dashboard) */}
      {currentUser && !isStaff && (
        <CustomerHomeSection
          currentUser={currentUser}
          onOpenFavorites={() => setIsFavoritesOpen(true)}
          onSelectProperty={(p) => setSelectedProperty(p)}
          onToggleFavorite={handleToggleFavorite}
          isFavorite={(id) => favoriteIdSet(favoriteProperties).has(id)}
        />
      )}

      {/* 3. TRUST / STATS SECTION */}
      <StatsRibbon />

      {/* 4. DEVELOPERS SECTION */}
      <Developers />

      {/* 5. SERVICES SECTION */}
      <Services onServiceClick={() => handleScrollToContact()} />

      {/* 6. FEATURED PROPERTIES */}
      <section id="properties" style={{ padding: '90px 0', background: 'var(--champagne-light)', borderBottom: '1px solid var(--champagne-border)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '44px' }}>
            <span style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              fontWeight: 700,
              color: 'var(--rose-primary)'
            }}>
              Exclusive Dubai Portfolio
            </span>
            <h2 className="luxury-serif" style={{ fontSize: '34px', color: 'var(--plum-main)', margin: '8px 0 10px', fontWeight: 600 }}>
              Featured Properties in Dubai
            </h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto', fontSize: '15px' }}>
              Handpicked freehold residences with verified title deeds, direct master-developer pricing, and high yield potential.
            </p>
          </div>

          {/* Filter Bar */}
          <PropertyFilter
            filters={filters}
            onFilterChange={handleUpdateFilters}
            onReset={handleResetFilters}
            totalCount={totalCount || filteredProperties.length}
            showingCount={filteredProperties.length}
          />

          {/* Properties Grid */}
          {isLoading ? (
            <div style={{
              padding: '70px 20px',
              textAlign: 'center',
              borderRadius: '8px',
              border: '1px solid var(--champagne-border)',
              background: 'var(--champagne-surface)',
              margin: '20px 0'
            }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  margin: '0 auto 16px',
                  border: '3px solid var(--champagne-border)',
                  borderTopColor: 'var(--gold-primary)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
              <h3 className="luxury-serif" style={{ fontSize: '20px', color: 'var(--plum-main)', marginBottom: '6px' }}>
                Loading Verified Dubai Properties...
              </h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto', fontSize: '14px' }}>
                Fetching live property records from the backend API on port 8000.
              </p>
            </div>
          ) : apiError ? (
            <div style={{
              padding: '60px 20px',
              textAlign: 'center',
              borderRadius: '8px',
              border: '1px solid #FECACA',
              background: '#FEF2F2',
              margin: '20px 0'
            }}>
              <AlertCircle size={38} color="#DC2626" style={{ margin: '0 auto 14px' }} />
              <h3 className="luxury-serif" style={{ fontSize: '20px', color: '#991B1B', marginBottom: '8px' }}>
                Unable to Load Properties
              </h3>
              <p style={{ color: '#7F1D1D', maxWidth: '480px', margin: '0 auto 20px', fontSize: '14px' }}>
                {apiError}
              </p>
              <button onClick={() => fetchProperties()} className="gold-btn">
                Retry Connection
              </button>
            </div>
          ) : (filteredProperties.length === 0 && (totalCount ?? 0) === 0) ? (
            <div style={{
              padding: '60px 20px',
              textAlign: 'center',
              borderRadius: '8px',
              border: '1px solid var(--champagne-border)',
              background: 'var(--champagne-surface)',
              margin: '20px 0'
            }}>
              <Building2 size={36} color="var(--gold-dark)" style={{ margin: '0 auto 14px' }} />
              <h3 className="luxury-serif" style={{ fontSize: '20px', color: 'var(--plum-main)', marginBottom: '8px' }}>
                No Properties Found
              </h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 20px', fontSize: '14px' }}>
                No listings matched your active filter parameters. Reset your search criteria to explore our full Dubai portfolio.
              </p>
              <button onClick={handleResetFilters} className="gold-btn">
                Clear Filters
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))',
              gap: '28px'
            }}>
              {visibleProperties.map((property, idx) => (
                <PropertyCard
                  key={property.property_id}
                  property={property}
                  isFavorite={savedIdSet.has(property.property_id)}
                  onToggleFavorite={handleToggleFavorite}
                  onSelectProperty={handleSelectProperty}
                  priority={idx < 3}
                />
              ))}
            </div>
          )}

          {/* Load More Button */}
          {!isLoading && !apiError && visibleCount < filteredProperties.length && (
            <div style={{ textAlign: 'center', marginTop: '48px' }}>
              <button
                onClick={() => setVisibleCount((prev) => prev + 12)}
                className="outline-navy-btn"
                style={{ padding: '12px 32px', fontSize: '14px' }}
              >
                <span>Load More Properties ({filteredProperties.length - visibleCount} remaining)</span>
                <ChevronDown size={16} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 7. DUBAI COMMUNITIES */}
      <Neighborhoods onSelectNeighborhood={handleSelectNeighborhood} />

      {/* 8. WHY LYKA REALTY */}
      <WhyLyka />

      {/* 9. DUBAI INVESTMENT SECTION */}
      <DubaiInvestment onExploreInvestment={handleScrollToContact} />

      {/* 10. WHO WE HELP */}
      <WhoWeHelp onCategoryClick={handleScrollToContact} />

      {/* 11. PROPERTY JOURNEY */}
      <PropertyJourney />

      {/* 12. MORTGAGE CALCULATOR */}
      <MortgageCalculator />

      {/* 13. TESTIMONIALS */}
      <Testimonials />

      {/* 14. FAQ */}
      <FAQ />

      {/* 15. CONTACT / CTA */}
      <ContactConsultation />

      {/* 16. FOOTER */}
      <Footer />

      {/* Property Details Modal */}
      <PropertyModal
        property={selectedProperty}
        isOpen={selectedProperty !== null}
        onClose={() => setSelectedProperty(null)}
        isFavorite={selectedProperty ? savedIdSet.has(selectedProperty.property_id) : false}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* Saved Properties Drawer */}
      <FavoritesDrawer
        isOpen={isFavoritesOpen}
        onClose={() => setIsFavoritesOpen(false)}
        favoriteProperties={favoriteProperties}
        onRemoveFavorite={handleToggleFavorite}
        onSelectProperty={handleSelectProperty}
      />

      {/* Conversational UI Agent Modal (Customers Only) */}
      {!isStaff && (
        <UIAgentModal
          isOpen={isAgentOpen}
          onClose={() => setIsAgentOpen(false)}
          properties={properties}
          onSelectProperty={handleSelectProperty}
          initialQuery={agentInitialQuery}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      {/* First-visit welcome screen (also shown after logout).
          Get Started dismisses to the home page ONLY — the chatbot stays
          closed until the floating AI Assistant button is clicked. */}
      {!authLoading && showWelcome && (
        <WelcomePage
          signedIn={!!fbUser}
          onGetStarted={dismissWelcome}
          onExplore={dismissWelcome}
        />
      )}

      {/* Voice UI Assistant Control (Customers Only) */}
      {!isStaff && (
        <VoiceAgentControl
          status={agentStatus}
          onSendMessage={handleVoiceMessage}
          onOpenAgent={() => handleOpenAgent()}
        />
      )}

      {/* Portal selection (Sign In entry point) */}
      {isPortalOpen && (
        <PortalSelect
          onSelectCustomer={() => {
            setIsPortalOpen(false)
            setAuthMode('login')
            setIsAuthOpen(true)
          }}
          onSelectEmployee={() => {
            setIsPortalOpen(false)
            setIsEmployeeOpen(true)
          }}
          onClose={() => setIsPortalOpen(false)}
        />
      )}

      {/* Dedicated employee login (verified role → authorized dashboard) */}
      {isEmployeeOpen && (
        <EmployeeLogin
          onClose={() => setIsEmployeeOpen(false)}
          onSuccess={(role) => {
            setIsEmployeeOpen(false)
            if (role === 'hrms_admin') {
              navigate('/crm/hrms')
            } else if (role === 'sales_agent' || role === 'salesperson') {
              navigate('/crm/my')
            } else if (role === 'admin' || role === 'manager') {
              navigate('/crm')
            } else {
              navigate('/')
            }
          }}
        />
      )}

      {/* Authentication Modal (customer login / registration) */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          setIsAuthOpen(false)
          if (pendingChatAfterLogin) {
            setPendingChatAfterLogin(false)
            setIsAgentOpen(true)
            return
          }
          fetchStaffMe()
            .then(() => {
              navigate('/')
            })
            .catch(() => {
              // Customer authenticated: redirect to the Customer Dashboard
              // (not the public homepage) and show a success toast.
              setLoginRedirectToast(true)
              setCustomerWelcomeToast({
                name: user?.name?.trim() || undefined,
                isNewUser: user?.isNewUser,
              })
              navigate('/account')
            })
        }}
      />

      {/* Customer Login Welcome Toast Notification */}
      {customerWelcomeToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 10000,
            maxWidth: '380px',
            background: 'linear-gradient(135deg, #1A0B2E 0%, #2A1245 100%)',
            border: '1px solid var(--gold-dark)',
            borderRadius: '12px',
            padding: '16px 20px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
            color: 'var(--champagne-light)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(212, 175, 55, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} color="var(--gold-primary)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4
              className="luxury-serif"
              style={{
                margin: '0 0 4px',
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--champagne-light)',
              }}
            >
              {customerWelcomeToast.isNewUser
                ? customerWelcomeToast.name
                  ? `Welcome to LYKA Realty, ${customerWelcomeToast.name}!`
                  : 'Welcome to LYKA Realty!'
                : customerWelcomeToast.name
                  ? `Welcome back, ${customerWelcomeToast.name}!`
                  : 'Welcome back!'}
            </h4>
            <p
              style={{
                margin: 0,
                fontSize: '12.5px',
                color: 'var(--champagne-muted)',
                lineHeight: '1.4',
              }}
            >
              {customerWelcomeToast.isNewUser
                ? 'Your account is ready. Explore exclusive Dubai residences or consult our AI advisor.'
                : 'Glad to see you again. Explore our latest Dubai portfolio and saved properties.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCustomerWelcomeToast(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--champagne-muted)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close welcome message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Backend Status Indicator (Step 2 Dev Connection) */}
      <BackendStatusIndicator />

      {/* Dev-only responsive preview (DEV-gated: never rendered in production) */}
      {import.meta.env.DEV ? <ViewportPreview /> : null}
    </div>
  )
}

export default App
