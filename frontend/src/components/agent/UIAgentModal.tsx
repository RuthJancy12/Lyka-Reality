import { useState, useEffect, useRef, Component, type ReactNode, type ErrorInfo } from 'react'
import {
  X, Send, Sparkles,
  Phone, MessageSquare, Maximize2, AlertCircle, Mic, Volume2, VolumeX,
  MapPin, Building2, Eye, Heart, RotateCcw, Home, KeyRound, TrendingUp, TrainFront, Waves, User, Tag, CheckCircle2,
  Copy, Check, Square, Trash2
} from 'lucide-react'
import type { Property } from '../../types/property'
import { INITIAL_GREETING_MESSAGE, type UserRequirements, type ChatMessage, type AgentStatus, type TrackedFieldKey } from '../../types/agent'
import {
  sendChatMessage,
  sendChatMessageStream,
  fetchPropertiesFromApi,
  submitPublicEnquiry,
  fetchAvailableLocations,
  getCustomerChatSessions,
  getCustomerChatSessionDetail,
  renameCustomerChatSession,
  createCustomerChatTurn,
  createCustomerInquiry,
  type ChatApiResponse,
  type CustomerChatSessionSummary,
  type CustomerChatSessionDetail,
} from '../../services/api'
import { formatProperty } from '../../utils/propertyData'
import { collectLeadSource } from '../../utils/leadSource'
import { nextChatMsgId } from '../../utils/chatIds'
import { isReviewReady, firstUnanswered } from '../../utils/reviewReadiness'
import { formatMessageTime, dayLabel, shouldShowDateSeparator } from '../../utils/chatTime'
import { VoiceReplySession, isVoiceReplySupported } from '../../services/voiceReply'
import { resolveChatDisplayName } from '../../utils/chatIdentity'
import { detectChatIntent } from '../../utils/chatIntent'
import { VoiceInputSession, isVoiceInputSupported, type VoiceInputState } from '../../services/voiceInput'
import { RequirementPanel } from './RequirementPanel'
import { SummaryCard } from './SummaryCard'
import { ConversationSidebar } from './ConversationSidebar'
import { useAuth } from '../../context/AuthContext'
import { LykaAuthPanel } from './LykaAuthPanel'
import { LykaOnboardingPanel, type OnboardingResult } from './LykaOnboardingPanel'
import { LykaRecordsPanel, type RecordsTab } from './LykaRecordsPanel'
import { getLocalUser, getLocalPreferences, clearLocalUser, logTurn,
  getInquiries, logInquiry, hasInquiryForProperty, logInteraction,
  getSessionTurns, getLastChatSessionId, ownerKeyFor
} from '../../services/chatStore'
import { clearStaffMeCache } from '../../crm/services/staffApi'
import { sanitizeFavoriteIds, toggleFavoriteId } from '../../utils/favorites'
import './UIAgentModal.css'

interface UIAgentModalProps {
  isOpen: boolean
  onClose: () => void
  properties: Property[]
  onSelectProperty: (property: Property) => void
  initialQuery?: string
  favoriteIds?: string[]
  onToggleFavorite?: (id: string) => void
}

type ChatView = 'chat' | 'auth' | 'onboarding' | 'records'

/**
 * Status shown on chatbot property cards. Derived ONLY from the real
 * `availability` dataset field: "Ready" listings are available now,
 * quarter codes (e.g. "Q3 2028") are available off-plan. Sold / Rented /
 * Reserved are never displayed unless confirmed by actual transaction records
 * (the current dataset contains none).
 */
function availabilityLabel(availability: string): string {
  const t = (availability || '').trim()
  if (!t) return 'Available'
  if (t.toLowerCase() === 'ready') return 'Available · Ready now'
  return `Available · Off-plan ${t}`
}

const INITIAL_REQUIREMENTS: UserRequirements = {
  purpose: null,
  location: null,
  propertyType: null,
  bhk: null,
  budget: null,
  timeline: null,
  nearMetro: null,
  beachfront: null,
  parking: null,
  budgetFlexible: null,
  amenities: []
}

/** Fresh greeting bubble with its own stable creation timestamp. */
function freshGreetingMessage(): ChatMessage {
  const now = Date.now()
  return {
    ...INITIAL_GREETING_MESSAGE,
    createdAt: now,
    timestamp: formatMessageTime(now),
  }
}

const EMPTY_STATE_SUGGESTIONS: Array<{ title: string; subtitle: string; query: string; icon: typeof Home }> = [
  { title: 'Marina 2BHK under AED 2M', subtitle: 'Apartments · For sale', query: 'Show me 2BHK apartments in Dubai Marina under 2000000 AED', icon: Home },
  { title: 'Villas on Palm Jumeirah', subtitle: 'Villas · Beachfront', query: 'Show me villas on Palm Jumeirah', icon: Waves },
  { title: 'Rent near a metro', subtitle: 'Near metro · Ready', query: 'Show me apartments for rent near metro', icon: TrainFront },
  { title: 'Invest under AED 1.5M', subtitle: 'Investment picks', query: 'Show me investment properties under 1500000 AED', icon: TrendingUp },
]

function getContextualSuggestions(
  msg: ChatMessage,
  isLatestAgentMsg: boolean,
  locationOptions: string[] = []
): string[] {
  if (msg.quickActions && msg.quickActions.length > 0) {
    return msg.quickActions
  }
  if (msg.sender !== 'agent' || !isLatestAgentMsg) {
    return []
  }

  const textLower = msg.text.toLowerCase()

  if (
    (textLower.includes('buy') || textLower.includes('purchase')) &&
    (textLower.includes('rent') || textLower.includes('lease'))
  ) {
    return ['Buy', 'Rent', 'Invest']
  }

  if (
    textLower.includes('property type') ||
    textLower.includes('kind of property') ||
    textLower.includes('apartment') ||
    textLower.includes('villa') ||
    textLower.includes('townhouse') ||
    textLower.includes('penthouse')
  ) {
    return ['Apartment', 'Villa', 'Townhouse', 'Penthouse']
  }

  if (
    textLower.includes('bedroom') ||
    textLower.includes('bhk') ||
    textLower.includes('how many bed')
  ) {
    return ['Studio', '1 BHK', '2 BHK', '3 BHK', '4+ BHK']
  }

  if (
    textLower.includes('budget') ||
    textLower.includes('price range') ||
    textLower.includes('how much')
  ) {
    return ['Under 1.5M AED', '1.5M - 3M AED', '3M - 5M AED', '5M+ AED']
  }

  if (
    textLower.includes('balcon')
  ) {
    return ['Must have balcony', 'No balcony needed']
  }

  if (
    textLower.includes('metro') ||
    textLower.includes('beach') ||
    textLower.includes('sea view') ||
    textLower.includes('waterfront')
  ) {
    return ['Near metro', 'Beachfront / sea view', 'No preference']
  }

  if (
    textLower.includes('when are you planning') ||
    textLower.includes('timeline') ||
    textLower.includes('move')
  ) {
    return ['Immediate', 'Within 3 months', '3–6 months', 'Just browsing']
  }

  if (
    textLower.includes('community') ||
    textLower.includes('neighborhood') ||
    textLower.includes('preferred location') ||
    textLower.includes('available locations') ||
    textLower.includes('where in dubai')
  ) {
    // Real dataset communities loaded from /api/communities; never invented.
    return locationOptions.length > 0
      ? locationOptions
      : ['Dubai Marina', 'Downtown Dubai', 'Palm Jumeirah', 'Dubai Hills Estate']
  }

  return []
}

function getStatusLabel(status: AgentStatus, voiceState: VoiceInputState): string {
  if (voiceState === 'listening') return 'Listening'
  if (status === 'thinking') return 'Thinking'
  if (status === 'listening') return 'Listening'
  if (status === 'recommending') return 'Recommending'
  return 'Online'
}

function requirementsHaveContext(req: UserRequirements | null | undefined): boolean {
  if (!req) return false
  return Boolean(
    req.purpose || req.location || req.propertyType ||
    req.bhk !== null || req.budget !== null || req.timeline ||
    req.nearMetro !== null || req.beachfront !== null
  )
}

/**
 * Rehydrates the visible chat from the most recent stored session
 * (in-memory state + PostgreSQL turns). Texts always restore;
 * property cards re-attach when the referenced IDs exist in the loaded
 * portfolio. Display-only: new turns log under a fresh session id.
 */
function loadRestoredMessages(allProperties: Property[], owner: string): ChatMessage[] {
  try {
    const lastId = getLastChatSessionId(owner)
    if (!lastId) return []
    const turns = getSessionTurns(lastId, owner).slice(-20)
    if (turns.length === 0) return []
    const byId = new Map(allProperties.map((p) => [p.property_id, p]))
    return turns.map((t) => {
      const cards = t.role === 'assistant' && t.propertyIds.length > 0
        ? t.propertyIds
            .map((id) => byId.get(id))
            .filter((p): p is Property => Boolean(p))
        : []
      // Preserve the original instant (stored ISO); fall back to now only
      // for legacy turns without a parseable date.
      const parsed = Date.parse(t.createdAt)
      const createdAt = Number.isFinite(parsed) ? parsed : Date.now()
      const msg: ChatMessage = {
        id: `restored-${t._id}`,
        sender: t.role === 'assistant' ? 'agent' : 'user',
        text: t.text,
        timestamp: formatMessageTime(createdAt),
        createdAt,
        matchedProperties: cards.length > 0 ? cards : undefined
      }
      return msg
    })
  } catch {
    return []
  }
}

/**
 * Drops poisoned string values ("null"/"none") the model backend may echo
 * back as requirements. Prevents zero-result searches and panel glitches.
 */
function sanitizeRequirements(req: UserRequirements): UserRequirements {
  const clean = (v: unknown): string | null => {
    if (typeof v !== 'string') return (v as string | null) ?? null
    const t = v.trim()
    return (!t || ['null', 'none', 'nil', 'n/a', 'na', 'undefined', 'unknown'].includes(t.toLowerCase()))
      ? null
      : t
  }
  return {
    ...req,
    location: req.location ? clean(req.location) : null,
    propertyType: req.propertyType ? (clean(req.propertyType) as UserRequirements['propertyType']) : null,
    purpose: req.purpose ? (clean(req.purpose) as UserRequirements['purpose']) : null,
    timeline: req.timeline ? clean(req.timeline) : null
  }
}

/** Maps backend requirements (Sale/Rent vocabulary) into UI requirements. */
function serverRequirements(raw: Record<string, unknown> | null | undefined): UserRequirements {
  const source = raw || {}
  const rawPurpose = typeof source.purpose === 'string' ? source.purpose : null
  const purpose: UserRequirements['purpose'] =
    rawPurpose === 'Rent' ? 'Rent'
    : rawPurpose === 'Sale' || rawPurpose === 'Buy' ? 'Buy'
    : null
  const rawType = typeof source.propertyType === 'string' ? source.propertyType : null
  const propertyType = rawType && ['Apartment', 'Villa', 'Townhouse', 'Penthouse'].includes(rawType)
    ? (rawType as UserRequirements['propertyType'])
    : null
  const boolOrNull = (value: unknown): boolean | null =>
    typeof value === 'boolean' ? value : null
  return {
    purpose,
    location: typeof source.location === 'string' && source.location.trim() ? source.location : null,
    propertyType,
    bhk: typeof source.bhk === 'number' ? source.bhk : null,
    budget: typeof source.budget === 'number' ? source.budget : null,
    timeline: typeof source.timeline === 'string' && source.timeline.trim() ? source.timeline : null,
    nearMetro: boolOrNull(source.nearMetro),
    beachfront: boolOrNull(source.beachfront),
    parking: boolOrNull(source.parking),
    budgetFlexible: boolOrNull(source.budgetFlexible),
    amenities: Array.isArray(source.amenities) ? source.amenities.filter((a): a is string => typeof a === 'string') : [],
  }
}

/** Converts one persisted backend turn into a visible chat bubble. */
function chatMessageFromTurn(
  turn: { id: string; role: string; text: string; property_ids: string[]; created_at: string },
  byId: Map<string, Property>
): ChatMessage {
  const isModel = turn.role === 'assistant' || turn.role === 'model'
  const cards = isModel && Array.isArray(turn.property_ids) && turn.property_ids.length > 0
    ? turn.property_ids.map((id) => byId.get(id)).filter((p): p is Property => Boolean(p))
    : []
  const parsed = Date.parse(turn.created_at)
  const createdAt = Number.isFinite(parsed) ? parsed : Date.now()
  return {
    id: `server-${turn.id}`,
    sender: isModel ? 'agent' : 'user',
    text: turn.text,
    timestamp: formatMessageTime(createdAt),
    createdAt,
    messageRef: turn.id,
    // Restored history is already durable; only live turns show a badge.
    matchedProperties: cards.length > 0 ? cards : undefined,
  }
}

/** One stable creation timestamp per bubble (streaming appends keep it). */
function nowStamp(): Pick<ChatMessage, 'createdAt' | 'timestamp'> {
  const createdAt = Date.now()
  return { createdAt, timestamp: formatMessageTime(createdAt) }
}

interface AgentErrorBoundaryProps {
  children: ReactNode
  onClose?: () => void
}

interface AgentErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class AgentErrorBoundary extends Component<AgentErrorBoundaryProps, AgentErrorBoundaryState> {
  constructor(props: AgentErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): AgentErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('UIAgentModal caught error in AgentErrorBoundary:', error, errorInfo)
  }

  handleDismiss = () => {
    this.setState({ hasError: false, error: null })
    this.props.onClose?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="lyka-chat-overlay" role="dialog" aria-modal="true" style={{ zIndex: 9999 }}>
          <div className="lyka-chat-modal" style={{ maxWidth: '440px', padding: '32px 24px', textAlign: 'center', background: '#FFFFFF', borderRadius: '16px', margin: 'auto' }}>
            <div style={{ color: 'var(--plum-main)', fontWeight: 800, fontSize: '17px', marginBottom: '8px' }}>
              AI Assistant Temporarily Unavailable
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
              We encountered an issue with the AI Assistant. Your saved properties and account information remain safe.
            </p>
            <button
              type="button"
              className="gold-btn"
              onClick={this.handleDismiss}
              style={{ padding: '8px 20px', fontSize: '13px' }}
            >
              Close Assistant
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export function UIAgentModal(props: UIAgentModalProps) {
  if (!props.isOpen) return null
  return (
    <AgentErrorBoundary onClose={props.onClose}>
      <UIAgentModalContent {...props} />
    </AgentErrorBoundary>
  )
}

function UIAgentModalContent({
  isOpen,
  onClose,
  properties: allProperties = [],
  onSelectProperty,
  initialQuery,
  favoriteIds = [],
  onToggleFavorite
}: UIAgentModalProps) {
  /** Firebase user — saving favorites/inquiries requires sign-in; chatting does not. */
  const { user: fbUser, logout } = useAuth()
  /**
   * Owner namespace for every cache read/write in this mount. Signed-in
   * users are scoped by Firebase UID; guests by per-tab id — so neither a
   * previous user nor another tab can leak into this conversation.
   */
  const owner = ownerKeyFor(fbUser?.uid)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const restored = loadRestoredMessages(allProperties, owner)
    return restored.length > 0 ? restored : [freshGreetingMessage()]
  })
  const [inputText, setInputText] = useState('')
  const [requirements, setRequirements] = useState<UserRequirements>(INITIAL_REQUIREMENTS)
  const [activeDiscussingField, setActiveDiscussingField] = useState<TrackedFieldKey | null>('location')
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('ready')
  const [isTyping, setIsTyping] = useState(false)
  const [showRequirementPanelMobile, setShowRequirementPanelMobile] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [view, setView] = useState<ChatView>('chat')
  /**
   * Display name for personalization. Firebase Auth is the ONLY source:
   * guests (signed out) are always null, even if a previous user left a
   * cached local profile on this device. This is what keeps an
   * unauthenticated visitor from ever being greeted as a former user.
   */
  const [profileName, setProfileName] = useState<string | null>(null)
  const [inquiryCount, setInquiryCount] = useState<number>(() => getInquiries(owner).length)
  const [recordsRefreshKey, setRecordsRefreshKey] = useState(0)
  const [recordsTab, setRecordsTab] = useState<RecordsTab>('inquiries')
  /** Real dataset communities for location chips (loaded once per open). */
  const [availableLocations, setAvailableLocations] = useState<string[]>([])

  // Conversation-history rail (signed-in customers only). Closed by
  // default on phones so the chat pane stays usable.
  const [historyOpen, setHistoryOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth > 960
  )
  const [conversations, setConversations] = useState<CustomerChatSessionSummary[]>([])
  const [conversationsTotal, setConversationsTotal] = useState(0)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationError, setConversationError] = useState<string | null>(null)
  const [conversationHasMore, setConversationHasMore] = useState(false)
  const [conversationCursor, setConversationCursor] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailHasMore, setDetailHasMore] = useState(false)
  const [detailCursor, setDetailCursor] = useState<string | null>(null)

  useEffect(() => {
    setProfileName(resolveChatDisplayName(fbUser?.name))
  }, [fbUser?.uid])

  /**
   * Saving is a signed-in action. Guests are routed to the auth panel with
   * an explanation; nothing is stored for them and nothing is lost.
   */
  const requireSignInForSave = (action: string): boolean => {
    if (fbUser) return true
    setView('auth')
    pushAgentMessage(
      `Please sign in to ${action} — it only takes a moment, and your chat is preserved. ` +
      `Browsing and chatting always work without an account.`
    )
    return false
  }

  const refreshInquiryCount = () => {
    try {
      setInquiryCount(getInquiries(owner).length)
    } catch {
      // Ignore — badge is non-essential.
    }
  }

  /** Applies one backend conversation payload to the live chat view. */
  const applyConversationDetail = (sessionId: string, detail: CustomerChatSessionDetail) => {
    const byId = new Map(allProperties.map((p) => [p.property_id, p]))
  // Retrieve the latest property details from the backend's recommended_properties
  // (which re-fetches each property by its saved ID) so historical cards render
  // with real images/prices/locations instead of being dropped.
  for (const raw of (detail.recommended_properties || [])) {
    try {
      const p = formatProperty(raw)
      if (p?.property_id && !byId.has(p.property_id)) byId.set(p.property_id, p)
    } catch {
      // Ignore malformed entries — never break the conversation restore.
    }
  }
    const loaded = (detail.turns || []).map((turn) => chatMessageFromTurn(turn, byId))
    setMessages(loaded.length > 0 ? loaded : [freshGreetingMessage()])
    sessionIdRef.current = sessionId
    setActiveSessionId(sessionId)
    setDetailHasMore(Boolean(detail.has_more))
    setDetailCursor(detail.next_cursor || null)
    const restored = serverRequirements(detail.requirements)
    setRequirements(restored)
    setActiveDiscussingField(firstUnanswered(restored) as TrackedFieldKey | null)
    setApiError(null)
    lastFailedQueryRef.current = null
    setView('chat')
    if (typeof window !== 'undefined' && window.innerWidth <= 960) setHistoryOpen(false)
  }

  /** Loads one page of the owner's conversation list. */
  const loadConversationPage = async (before: string | null, replace: boolean) => {
    if (!fbUser?.uid) return null
    setConversationLoading(true)
    setConversationError(null)
    try {
      const page = await getCustomerChatSessions(30, before || undefined)
      setConversations((prev) => {
        if (replace) return page.sessions
        const seen = new Set(prev.map((s) => s.session_id))
        return [...prev, ...page.sessions.filter((s) => !seen.has(s.session_id))]
      })
      setConversationsTotal(page.total)
      setConversationHasMore(page.has_more)
      setConversationCursor(page.next_cursor)
      return page
    } catch (err) {
      setConversationError(err instanceof Error ? err.message : 'Could not load conversations.')
      return null
    } finally {
      setConversationLoading(false)
    }
  }

  /** Reopens an old conversation with its original session id + context. */
  const openConversationById = async (id: string) => {
    if (!id || detailLoading) return
    setDetailLoading(true)
    setConversationError(null)
    try {
      const detail = await getCustomerChatSessionDetail(id)
      applyConversationDetail(id, detail)
    } catch (err) {
      setConversationError(err instanceof Error ? err.message : 'Could not open that conversation.')
    } finally {
      setDetailLoading(false)
    }
  }

  /** Loads the previous page of messages for the open conversation. */
  const handleLoadOlderMessages = async () => {
    if (!activeSessionId || !detailCursor || detailLoading) return
    setDetailLoading(true)
    try {
      const detail = await getCustomerChatSessionDetail(activeSessionId, {
        limit: 100,
        before: detailCursor,
      })
      const byId = new Map(allProperties.map((p) => [p.property_id, p]))
      for (const raw of (detail.recommended_properties || [])) {
        try {
          const p = formatProperty(raw)
          if (p?.property_id && !byId.has(p.property_id)) byId.set(p.property_id, p)
        } catch {
          // Ignore malformed entries.
        }
      }
      const older = (detail.turns || []).map((turn) => chatMessageFromTurn(turn, byId))
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id))
        return [...older.filter((m) => !existing.has(m.id)), ...prev]
      })
      setDetailHasMore(Boolean(detail.has_more))
      setDetailCursor(detail.next_cursor || null)
    } catch (err) {
      setConversationError(err instanceof Error ? err.message : 'Could not load older messages.')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleRenameConversation = async (id: string, title: string) => {
    setConversations((prev) => prev.map((s) =>
      s.session_id === id ? { ...s, title } : s
    ))
    try {
      await renameCustomerChatSession(id, title)
    } catch (err) {
      setConversationError(err instanceof Error ? err.message : 'Could not rename that conversation.')
      void loadConversationPage(null, true)
    }
  }

  useEffect(() => {
    if (isOpen) refreshInquiryCount()
  }, [isOpen, view, recordsRefreshKey])

  // When the signed-in identity changes mid-mount (sign-in, sign-out,
  // account switch), reload ONLY the new owner's visible history. The
  // previous owner's turns stay preserved under their own namespace —
  // visible to nobody else.
  const ownerRef = useRef(owner)
  useEffect(() => {
    if (ownerRef.current === owner) return
    ownerRef.current = owner
    const restored = loadRestoredMessages(allProperties, owner)
    setMessages(restored.length > 0 ? restored : [freshGreetingMessage()])
    try {
      setInquiryCount(getInquiries(owner).length)
    } catch {
      // Ignore — badge is non-essential.
    }
    setLocalSavedIds(sanitizeFavoriteIds(favoriteIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner])

  // When a verified customer is signed in, load the authoritative
  // conversation list and reopen the most recent saved conversation.
  // Everything here is server-owned and UID-scoped.
  useEffect(() => {
    if (!isOpen || !fbUser?.uid) {
      setConversations([])
      setConversationsTotal(0)
      setConversationHasMore(false)
      setConversationCursor(null)
      setActiveSessionId(null)
      return
    }
    let active = true
    ;(async () => {
      setConversationLoading(true)
      setConversationError(null)
      try {
        const page = await getCustomerChatSessions(30)
        if (!active) return
        setConversations(page.sessions)
        setConversationsTotal(page.total)
        setConversationHasMore(page.has_more)
        setConversationCursor(page.next_cursor)
        const latest = page.sessions[0]
        if (latest) {
          const detail = await getCustomerChatSessionDetail(latest.session_id)
          if (!active) return
          applyConversationDetail(latest.session_id, detail)
        }
      } catch (err) {
        if (active) {
          setConversationError(err instanceof Error ? err.message : 'Could not load conversations.')
        }
      } finally {
        if (active) setConversationLoading(false)
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fbUser?.uid, allProperties])

  // Load real dataset communities once per open for location chips.
  // Cached process-wide: repeated opens never refetch.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    fetchAvailableLocations()
      .then((locs) => {
        if (!cancelled && locs.length > 0) setAvailableLocations(locs)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen])

  // One-time: prefill search criteria from saved onboarding preferences.
  const prefsAppliedRef = useRef(false)
  useEffect(() => {
    if (prefsAppliedRef.current) return
    prefsAppliedRef.current = true
    try {
      const prefs = getLocalPreferences(owner)
      if (prefs && !prefs.skipped) {
        setRequirements((prev) => {
          const base = prev ?? INITIAL_REQUIREMENTS
          if (requirementsHaveContext(base)) return base
          const primaryLocation = Array.isArray(prefs?.locations)
            ? (prefs.locations[0] ?? null)
            : (typeof (prefs as any)?.locations === 'string' && (prefs as any).locations.trim()
                ? (prefs as any).locations.trim()
                : (typeof (prefs as any)?.location === 'string' && (prefs as any).location.trim()
                    ? (prefs as any).location.trim()
                    : null))
          return {
            ...base,
            location: primaryLocation,
            budget: typeof prefs?.budgetMax === 'number' ? prefs.budgetMax : (base.budget ?? null),
            propertyType: typeof prefs?.propertyType === 'string' ? prefs.propertyType : (base.propertyType ?? null),
            bhk: typeof prefs?.bedrooms === 'number' ? prefs.bedrooms : (base.bhk ?? null),
            // Chat search only understands Buy/Rent; Invest stays a profile
            // preference and never leaks in as a fake search intent.
            purpose: prefs?.purpose === 'Buy' || prefs?.purpose === 'Rent' ? prefs.purpose : null,
          }
        })
      }
    } catch (err) {
      console.error('UIAgentModal: Failed to apply initial preferences from store:', err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [localSavedIds, setLocalSavedIds] = useState<string[]>(() => sanitizeFavoriteIds(favoriteIds))

  // Authoritative sync: chat hearts mirror the app's favorites state, so a
  // removal from the Saved Properties panel (or another tab) immediately
  // clears the chat heart too. Union-only merging would keep stale hearts.
  useEffect(() => {
    setLocalSavedIds(sanitizeFavoriteIds(favoriteIds))
  }, [favoriteIds])

  const handleSaveProperty = (propId: string) => {
    if (!requireSignInForSave('save homes to your favorites')) return
    if (typeof propId !== 'string' || !propId.trim()) return
    const updated = toggleFavoriteId(localSavedIds, propId)

    setLocalSavedIds(updated)

    if (onToggleFavorite) {
      onToggleFavorite(propId)
    }
  }

  const [enquiringId, setEnquiringId] = useState<string | null>(null)

  /**
   * Chat-property enquiry: persists to the backend public endpoint
   * (POST /api/leads/public) so the enquiry appears in Admin/Manager
   * Leads under existing assignment rules. Success is announced ONLY
   * after HTTP 201; failures surface the backend message with a retry
   * path. Sign-in is required here (login gate lives at this decision
   * point only — browsing and chatting stay guest-friendly).
   */
  const handleEnquire = async (prop: Property) => {
    if (!requireSignInForSave('submit an inquiry')) return
    // Never duplicate: one inquiry per property (owner-scoped fast-path).
    if (hasInquiryForProperty(prop.property_id, owner)) {
      setRecordsRefreshKey((k) => k + 1)
      setView('records')
      return
    }
    if (enquiringId) return
    setEnquiringId(prop.property_id)
    setApiError(null)
    try {
      const localUser = getLocalUser(owner)
      const contactEmail = (fbUser?.email || localUser?.email || '').trim()
      const contactName = (profileName || localUser?.name || fbUser?.name || '').trim()
      const contactPhone = localUser?.phone?.trim() || undefined
      if (!contactEmail || !contactName) {
        setView('auth')
        pushAgentMessage(
          'Please complete your profile (name and email) so I can attach your inquiry to the right record — then tap Enquire again. Your chat is preserved.'
        )
        return
      }
      await submitPublicEnquiry({
        customer_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        property_ref: prop.property_id,
        property_title: prop.title,
        location: prop.location,
        lead_type: prop.listing_type === 'Rent' ? 'renter' : 'buyer',
        property_type: prop.property_type,
        message: `Chatbot enquiry from session ${sessionIdRef.current}`,
        ...collectLeadSource(),
      })
      const doc = logInquiry({
        sessionId: sessionIdRef.current,
        propertyId: prop.property_id,
        propertyTitle: prop.title,
        propertyLocation: prop.location,
        propertyType: prop.property_type,
        listingType: prop.listing_type,
        priceAed: prop.price_aed,
        bedrooms: prop.bhk,
        sizeSqft: prop.property_size_sqft,
        availability: prop.availability
      }, owner)
      if (fbUser?.uid) {
        void createCustomerInquiry({
          property_id: prop.property_id,
          property_title: prop.title,
          session_id: sessionIdRef.current,
          property_location: prop.location,
          property_type: prop.property_type,
          listing_type: prop.listing_type,
          price_aed: prop.price_aed,
          bedrooms: prop.bhk,
          size_sqft: prop.property_size_sqft,
          availability: prop.availability,
        }).catch(() => {})
      }
      // Explicit enquiry action: always recorded for the feed (same rule
      // as favorites — only passive views/searches need consent).
      logInteraction(owner, {
        kind: 'enquiry',
        propertyId: prop.property_id,
        location: prop.location,
        propertyType: prop.property_type,
        bedrooms: prop.bhk,
      })
      setRecordsRefreshKey((k) => k + 1)
      refreshInquiryCount()
      if (doc) {
        pushAgentMessage(
          `Done — your inquiry for "${prop.title}" (Ref ${prop.property_id}, AED ${prop.price_aed.toLocaleString('en-US')}) is saved with our team. ` +
          `It's now in My Inquiries and will appear in the staff CRM. Anything else you'd like to explore?`
        )
      } else {
        pushAgentMessage(
          `Your inquiry for "${prop.title}" (Ref ${prop.property_id}) is saved with our team, though this device couldn't cache a local copy. ` +
          `You can still reach the team instantly on WhatsApp or +971 4 800 LYKA.`
        )
      }
    } catch (err) {
      pushAgentMessage(
        `I couldn't save your inquiry for "${prop.title}" (Ref ${prop.property_id}): ` +
        `${err instanceof Error ? err.message : 'connection error'}. ` +
        `Nothing was lost — tap Enquire again to retry.`
      )
    } finally {
      setEnquiringId(null)
    }
  }

  const handleViewPropertyById = (propertyId: string) => {
    for (const m of messages) {
      const found = m.matchedProperties?.find((p) => p.property_id === propertyId)
      if (found) {
        onSelectProperty(found)
        onClose()
        return
      }
    }
    setView('chat')
    pushAgentMessage(
      `That listing (Ref ${propertyId}) isn't in our current chat results anymore. Ask me to search again — for example "2-bedroom apartment for rent with main-road access" — and I'll pull fresh matches.`
    )
  }

  /**
   * Voice-to-text input only: the mic dictates into the composer textbox.
   * Transcripts are NEVER auto-sent and the assistant NEVER speaks back
   * (text-only replies; no TTS, no WebRTC, no voice agent).
   */
  const [voiceState, setVoiceState] = useState<VoiceInputState>('idle')
  const [isVoiceMode, setIsVoiceMode] = useState<boolean>(false)

  /**
   * Optional AI voice replies (browser SpeechSynthesis, OFF by default).
   * Only final assistant bubbles speak, tracked by message id so streamed
   * tokens and re-renders never double-speak. Stops on toggle-off, close,
   * unmount, and every new user submission.
   */
  const [voiceReplyOn, setVoiceReplyOn] = useState(false)
  const voiceReplyOnRef = useRef(false)
  const chatLanguage = 'en'
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const voiceReplySupported = isVoiceReplySupported()
  const voiceReplyRef = useRef<VoiceReplySession | null>(null)
  if (!voiceReplyRef.current) {
    voiceReplyRef.current = new VoiceReplySession()
  }

  const maybeSpeak = (id: string, text: string) => {
    // Read the authoritative ref (not just state) so async reply flows
    // committed after an await always honour the latest toggle value.
    if (!voiceReplyOnRef.current) {
      voiceSessionRef.current?.resumeAfterAI()
      return
    }
    voiceReplyRef.current?.speakOnce(id, text, () => {
      voiceSessionRef.current?.resumeAfterAI()
    })
  }

  const handleVoiceReplyToggle = () => {
    if (voiceReplyOn) {
      voiceReplyRef.current?.stop()
      voiceReplyOnRef.current = false
      setVoiceReplyOn(false)
    } else {
      voiceReplyOnRef.current = true
      setVoiceReplyOn(true)
    }
  }

  // Keep the authoritative ref in sync with the toggle state.
  useEffect(() => {
    voiceReplyOnRef.current = voiceReplyOn
  }, [voiceReplyOn])

  const voiceSessionRef = useRef<VoiceInputSession | null>(null)
  const activeUserMsgIdRef = useRef<string | null>(null)
  const activeModelMsgIdRef = useRef<string | null>(null)

  const sessionIdRef = useRef<string>(`session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const lastFailedQueryRef = useRef<string | null>(null)
  /** Stable ref of the failed turn, reused on retry so the DB never duplicates. */
  const lastFailedRef = useRef<string | null>(null)

  const isSubmittingRef = useRef(false)
  const initialQueryHandledRef = useRef(false)

/** One stable creation timestamp per bubble (streaming appends keep it). */
  const pushAgentMessage = (
    text: string,
    matchedProps?: Property[],
    messageRef?: string,
    saveStatus?: ChatMessage['saveStatus']
  ) => {
    const agentMsg: ChatMessage = {
      id: nextChatMsgId('agent'),
      sender: 'agent',
      text,
      ...nowStamp(),
      messageRef,
      saveStatus: saveStatus ?? (messageRef ? 'saved' : undefined),
      matchedProperties: matchedProps && matchedProps.length > 0 ? matchedProps : undefined
    }
    setMessages((prev) => [...prev, agentMsg])
    logTurn(sessionIdRef.current, 'assistant', text, (matchedProps ?? []).map((p) => p.property_id), owner)
    maybeSpeak(agentMsg.id, text)
  }

  /**
   * Sends the composer's text as exactly one chat message. Called by explicit
   * user action or voice assistant auto-submit.
   */
  const markMessageSaveStatus = (ref: string, status: ChatMessage['saveStatus']) => {
    if (!ref) return
    setMessages((prev) => prev.map((m) => (m.messageRef === ref ? { ...m, saveStatus: status } : m)))
  }

  /** Deterministic assistant ref; keeps room for the ":a" suffix (max 64). */
  const assistantRefFor = (ref: string) => `${ref.slice(0, 62)}:a`

  const handleUserSubmit = async (
    rawText: string,
    opts?: { messageRef?: string; retry?: boolean }
  ) => {
    const text = rawText.trim()
    if (!text || isSubmittingRef.current) return
    isSubmittingRef.current = true
    voiceSessionRef.current?.pauseForAI()
    // A new question cuts off any in-progress voice reply (no overlap).
    voiceReplyRef.current?.stop()

    setApiError(null)
    setView('chat')
    lastFailedQueryRef.current = text
    setInputText('')
    voiceSessionRef.current?.clearBaseText()

    const userRef = opts?.messageRef || nextChatMsgId('msg')
    const canPersist = Boolean(fbUser?.uid)

    if (opts?.retry) {
      // Reuse the existing bubble and its ref: the backend dedupes the user
      // turn and the deterministic assistant ref, so no row is duplicated.
      setMessages((prev) => {
        const cleaned = prev.filter((m) => !m.id.startsWith('agent-error'))
        return cleaned.map((m, index) => (
          index === cleaned.length - 1 && m.sender === 'user' && m.text === text
            ? {
                ...m,
                messageRef: m.messageRef || userRef,
                saveStatus: canPersist ? 'saving' : undefined,
              }
            : m
        ))
      })
    } else {
      const userMsg: ChatMessage = {
        id: nextChatMsgId('user'),
        sender: 'user',
        text,
        ...nowStamp(),
        messageRef: userRef,
        saveStatus: canPersist ? 'saving' : undefined,
      }
      setMessages((prev) => [...prev, userMsg])
    }
    logTurn(sessionIdRef.current, 'user', text, [], owner)

    /** Persists a turn that never reaches POST /api/chat (instant/nav). */
    const persistLocalUserTurn = () => {
      if (!canPersist) return Promise.resolve()
      return createCustomerChatTurn({
        session_id: sessionIdRef.current,
        role: 'user',
        text,
        record_ref: userRef,
      })
        .then(() => {
          markMessageSaveStatus(userRef, 'saved')
          setActiveSessionId(sessionIdRef.current)
        })
        .catch((e) => {
          console.warn('Failed to persist user chat turn:', e)
          markMessageSaveStatus(userRef, 'failed')
        })
    }

    // Input is cleared only after a successful submission (see success paths).
    setAgentStatus('thinking')
    setIsTyping(true)

    let turnHasSpoken = false
    try {
      // Records navigation: "show my inquiries" / "market history" open the
      // records panel directly — no backend request needed.
      const navLower = text.toLowerCase()
      if (/\binquir/.test(navLower)) {
        setAgentStatus('ready')
        setRecordsTab('inquiries')
        setRecordsRefreshKey((k) => k + 1)
        setView('records')
        lastFailedQueryRef.current = null
        void persistLocalUserTurn()
        return
      }
      if (/market history|transaction history|sales history|sold propert|rented propert|sales records?/.test(navLower)) {
        setAgentStatus('ready')
        setRecordsTab('history')
        setView('records')
        lastFailedQueryRef.current = null
        void persistLocalUserTurn()
        return
      }

      // Fast path: greetings, small talk, motivation, emotional support and
      // help are answered instantly on-device — no Ollama request needed.
      const hasPropertyContext =
        requirementsHaveContext(requirements) ||
        messages.some((m) => m.matchedProperties && m.matchedProperties.length > 0)
      const intent = detectChatIntent(text, {
        hasPropertyContext,
        turnCount: messages.length,
        userName: profileName
      })

      if (intent.route === 'instant' && intent.reply) {
        // Brief human-like pause only; keeps the feel natural without loading.
        // Text-only reply: never spoken aloud.
        await new Promise((resolve) => setTimeout(resolve, 200))
        setAgentStatus('ready')
        const assistantRef = assistantRefFor(userRef)
        if (canPersist) {
          void persistLocalUserTurn().then(() => loadConversationPage(null, true))
          createCustomerChatTurn({
            session_id: sessionIdRef.current,
            role: 'assistant',
            text: intent.reply,
            record_ref: assistantRef,
          })
            .then(() => markMessageSaveStatus(assistantRef, 'saved'))
            .catch((e) => {
              console.warn('Failed to persist instant reply:', e)
              markMessageSaveStatus(assistantRef, 'failed')
            })
        }
        pushAgentMessage(
          intent.reply,
          undefined,
          canPersist ? assistantRef : undefined,
          canPersist ? 'saving' : undefined
        )
        setActiveSessionId(sessionIdRef.current)
        setInputText('')
        lastFailedQueryRef.current = null
        lastFailedRef.current = null
        turnHasSpoken = true
        return
      }

      // Applies backend requirements to the live panel/tracking state.
      const applyTurnRequirements = (reqs: UserRequirements) => {
        const prevTimeline = requirements.timeline
        const clean = sanitizeRequirements(reqs)
        // Keep a timeline the user already gave (typed or edited) until the
        // backend learns it — the session only stores what the text stated.
        if (!clean.timeline && prevTimeline) {
          clean.timeline = prevTimeline
        }
        setRequirements(clean)
        // Highlight the oldest unanswered criterion in the live panel,
        // mirroring the backend ask order (never re-asks answered ones).
        setActiveDiscussingField(firstUnanswered(clean) as TrackedFieldKey | null)
        return clean
      }

      // Commits exactly one assistant bubble for this turn — either appended
      // fresh (non-stream path) or finalized in place over the streaming
      // placeholder. One user message always yields at most one reply.
      const commitAssistantTurn = (
        reply: string,
        matchedRaw: Property[],
        reqs: UserRequirements | null,
        need: ChatApiResponse['need'],
        options: string[] | undefined,
        replaceId: string | null
      ) => {
        const nextReqs = reqs || requirements
        const matchedProps: Property[] = matchedRaw.length > 0
          ? matchedRaw.map(formatProperty)
          : []
        // No second search here: the backend already ran the deterministic
        // dataset filter for this turn. A duplicate request would only add
        // latency; empty results are reported honestly with a follow-up.
        const hasMatches = matchedProps.length > 0
        setAgentStatus(hasMatches ? 'recommending' : 'ready')
        lastFailedQueryRef.current = null

        // Final review section ("Search Criteria" card): only after all
        // eight criteria are explicitly answered and no cards matched.
        // Early turns stay in one-at-a-time conversation with chips; the
        // live right-side criteria panel already tracks partial answers.
        const safeReply = (reply || '').trim() || (hasMatches
          ? 'Here are the matching properties found in our verified Dubai portfolio:'
          : 'I have checked our Dubai portfolio with your criteria. Let me know if you would like to adjust location, bedrooms, or budget.')

        const assistantRef = assistantRefFor(userRef)
        const agentMsg: ChatMessage = {
          id: replaceId ?? nextChatMsgId('agent'),
          sender: 'agent',
          text: safeReply,
          ...nowStamp(),
          messageRef: canPersist ? assistantRef : undefined,
          // The server persisted both turns before returning this response.
          saveStatus: canPersist ? 'saved' : undefined,
          matchedProperties: hasMatches ? matchedProps : undefined,
          showSummary: !hasMatches && isReviewReady(nextReqs) ? true : undefined,
        }
        // Backend clarification gate → clickable options, no invented defaults.
        // Any gate (purpose, type, location, bedrooms, budget, timeline,
        // metro, coastline) arrives with real options from the backend.
        if (!hasMatches && need) {
          agentMsg.quickActions = options && options.length > 0
            ? options
            : availableLocations
        }

        if (replaceId) {
          // Streaming finalize: keep the placeholder's creation timestamp —
          // one stable time per bubble, never re-stamped per token.
          setMessages((prev) => prev.map((m) => (m.id === replaceId
            ? { ...agentMsg, createdAt: m.createdAt, timestamp: m.timestamp }
            : m)))
        } else {
          setMessages((prev) => [...prev, agentMsg])
        }
        logTurn(sessionIdRef.current, 'assistant', safeReply, matchedProps.map((p) => p.property_id), owner)
        // Backend persistence already happened inside POST /api/chat(.stream)
        // with the same message_ref — a client-side write here would duplicate.
        markMessageSaveStatus(userRef, 'saved')
        setInputText('')
        setActiveSessionId(sessionIdRef.current)
        void loadConversationPage(null, true)
        turnHasSpoken = true
        maybeSpeak(agentMsg.id, safeReply)
      }

      // Property questions, follow-ups and general knowledge → backend over
      // SSE streaming: meta (cards/requirements/options) renders in
      // milliseconds while tokens fill the bubble progressively. Falls back
      // to the plain endpoint if streaming cannot start.
      let streamPlaceholderId: string | null = null
      let streamStarted = false
      try {
        const curAbort = new AbortController()
        abortControllerRef.current = curAbort
        const final = await sendChatMessageStream(text, sessionIdRef.current, {
          signal: curAbort.signal,
          onMeta: (meta) => {
            streamStarted = true
            if (meta.requirements) applyTurnRequirements(meta.requirements)
            streamPlaceholderId = nextChatMsgId('agent')
            const placeholder: ChatMessage = {
              id: streamPlaceholderId,
              sender: 'agent',
              text: '',
              ...nowStamp(),
              messageRef: canPersist ? assistantRefFor(userRef) : undefined,
              saveStatus: canPersist ? 'saving' : undefined,
            }
            setMessages((prev) => [...prev, placeholder])
          },
          onToken: (token) => {
            if (!streamPlaceholderId || !token) return
            const id = streamPlaceholderId
            setMessages((prev) => prev.map((m) =>
              m.id === id ? { ...m, text: `${m.text}${token}` } : m
            ))
          },
        }, canPersist ? userRef : undefined)
        commitAssistantTurn(
          final.reply, final.matched_properties || [],
          final.requirements || null, final.need ?? null, final.options,
          streamPlaceholderId
        )
      } catch (streamErr) {
        if (!streamStarted) {
          // Streaming never started (network/down backend): single plain
          // retry over the non-stream endpoint, same exactly-once contract.
          const response = await sendChatMessage(
            text,
            sessionIdRef.current,
            undefined,
            canPersist ? userRef : undefined
          )
          if (response.requirements) applyTurnRequirements(response.requirements)
          commitAssistantTurn(
            response.reply, response.matched_properties || [],
            response.requirements || null, response.need ?? null, response.options,
            null
          )
        } else {
          if (streamPlaceholderId) {
            setMessages((prev) => prev.filter((m) => m.id !== streamPlaceholderId))
          }
          throw streamErr
        }
      }
    } catch (err) {
      console.error('Error communicating with backend:', err)
      const errMsg = err instanceof Error ? err.message : 'Connection error'
      setApiError(errMsg)
      // The composer was already cleared on accepted submission; retrying is
      // lossless via the Retry button (lastFailedQueryRef + lastFailedRef).
      // Persist the user turn directly too, so it survives even when the chat
      // request never reached the server. Same ref → idempotent on retry.
      lastFailedRef.current = userRef
      if (canPersist) {
        void persistLocalUserTurn()
      }

      setMessages((prev) => [
        ...prev,
        {
          id: nextChatMsgId('agent-error'),
          sender: 'agent',
          text: `I couldn't reach the advisory backend: ${errMsg}. Please make sure the backend is running at http://localhost:8000, then retry.`,
          ...nowStamp()
        }
      ])
      // The composer was already cleared on accepted submission; retrying is
      // lossless via the Retry button (lastFailedQueryRef). Typing always
      // stays available, even after a voice error.
    } finally {
      setIsTyping(false)
      isSubmittingRef.current = false
      setAgentStatus((prevStatus) => (prevStatus === 'thinking' ? 'ready' : prevStatus))
      if (!voiceReplyOnRef.current || !turnHasSpoken) {
        voiceSessionRef.current?.resumeAfterAI()
      }
    }
  }

  /** Summary-card Confirm: searches the REAL dataset with the currently
   * verified requirements and attaches the resulting cards to the message.
   * Nothing is invented — empty results are reported honestly.
   * Exactly-once per card: concurrent double-clicks share one flight.
   */
  const confirmingIdsRef = useRef<Set<string>>(new Set())
  const handleSummaryConfirm = async (msgId: string) => {
    if (confirmingIdsRef.current.has(msgId)) return
    confirmingIdsRef.current.add(msgId)
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, showSummary: false } : m)))
    setAgentStatus('thinking')
    setIsTyping(true)
    try {
      // Snapshot live requirements: one confirmation searches exactly what
      // the customer confirmed, even if state updates mid-flight.
      const req = requirements
      const apiRes = await fetchPropertiesFromApi({
        location: req.location || undefined,
        property_type: req.propertyType || undefined,
        bedrooms: req.bhk ?? undefined,
        purpose: req.purpose || undefined,
        max_budget: req.budget || undefined,
        near_metro: req.nearMetro ? true : undefined,
        near_beach: req.beachfront ? true : undefined,
        min_parking: req.parking ? 1 : undefined,
        amenities: req.amenities.length > 0 ? req.amenities : undefined,
        limit: 3
      })
      const found = (apiRes.top_properties || []).map(formatProperty)
      if (found.length > 0) {
        setAgentStatus('recommending')
        setMessages((prev) => prev.map((m) =>
          (m.id === msgId ? { ...m, matchedProperties: found } : m)
        ))
        logTurn(
          sessionIdRef.current,
          'assistant',
          `Confirmed search: ${found.length} verified matching properties.`,
          found.map((p) => p.property_id),
          owner
        )
        if (fbUser?.uid) {
          createCustomerChatTurn({
            session_id: sessionIdRef.current,
            role: 'assistant',
            text: `Confirmed search: ${found.length} verified matching properties.`,
            property_ids: found.map((p) => p.property_id),
            record_ref: nextChatMsgId('msg'),
          }).catch((e) => console.warn('Failed to sync summary turn to backend:', e))
        }
      } else {
        const fb = apiRes.fallback
        const scope = fb?.used
          ? `${fb.requested_location ?? req.location ?? 'the area'} and nearby ${((fb.nearby_locations || []).slice(0, 3).join(', ') || 'areas')}`
          : (req.location ?? 'the area')
        pushAgentMessage(
          `I searched ${scope} with all your confirmed filters and found no suitable properties. ` +
          'Try widening the budget or pick another available community — or edit the criteria and confirm again.'
        )
      }
    } catch (err) {
      pushAgentMessage(
        `Search failed: ${err instanceof Error ? err.message : 'connection error'}. Please try again.`
      )
    } finally {
      confirmingIdsRef.current.delete(msgId)
      setIsTyping(false)
      setAgentStatus((prevStatus) => (prevStatus === 'thinking' ? 'ready' : prevStatus))
    }
  }

  /** Summary-card Edit: applies the user's inline corrections to requirements. */
  const handleSummaryUpdate = (updated: UserRequirements) => {
    setRequirements(sanitizeRequirements(updated))
  }

  const handleUserSubmitRef = useRef(handleUserSubmit)
  useEffect(() => {
    handleUserSubmitRef.current = handleUserSubmit
  })

  // Voice assistant session: continuous speech across turns.
  const voiceDrivenRef = useRef(false)
  useEffect(() => {
    const session = new VoiceInputSession({
      onStateChange: (newState) => {
        setVoiceState(newState)
        setIsVoiceMode(session.isVoiceMode())
        if (newState === 'listening') {
          setAgentStatus('listening')
        } else if (newState === 'idle') {
          setAgentStatus((prev) => (prev === 'listening' ? 'ready' : prev))
        }
      },
      onInterimText: (interimText) => {
        // Customer started speaking: immediately cut off any in-progress voice reply (natural interruption)
        voiceReplyRef.current?.stop()
        voiceDrivenRef.current = true
        setInputText(interimText)
      },
      onFinalText: (finalText) => {
        voiceDrivenRef.current = true
        setInputText(finalText)
      },
      onAutoSubmit: (submittedText) => {
        const textToSubmit = submittedText.trim()
        if (textToSubmit && !isSubmittingRef.current) {
          handleUserSubmitRef.current(textToSubmit)
        }
      },
      onError: (err) => {
        setApiError(err)
      }
    })

    voiceSessionRef.current = session

    return () => {
      session.stop()
      voiceSessionRef.current = null
      voiceReplyRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the dictation base in sync with manual edits so dictated words
  // append after typed text instead of overwriting it. Voice-driven updates
  // are skipped (they already include the base) to prevent doubling.
  useEffect(() => {
    if (voiceDrivenRef.current) {
      voiceDrivenRef.current = false
      return
    }
    voiceSessionRef.current?.setBaseText(inputText)
  }, [inputText])

  useEffect(() => {
    if (!isOpen) {
      voiceSessionRef.current?.stop()
      setIsVoiceMode(false)
      // Never speak to a closed chat: stop any in-progress voice reply.
      voiceReplyRef.current?.stop()
    }
  }, [isOpen])

  const handleToggleVoice = () => {
    const session = voiceSessionRef.current
    if (!session) return
    if (session.isVoiceMode()) {
      session.stop()
      setIsVoiceMode(false)
      return
    }
    if (!isVoiceInputSupported()) {
      setApiError('Voice input is not supported in this browser. Please use Chrome or Edge, or continue typing.')
      return
    }
    setApiError(null)
    session.setBaseText(inputText)
    session.start(chatLanguage)
    setIsVoiceMode(true)
  }

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isTyping, isOpen, view])

  useEffect(() => {
    if (isOpen && initialQuery && initialQuery.trim() && !initialQueryHandledRef.current) {
      initialQueryHandledRef.current = true
      handleUserSubmit(initialQuery.trim())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialQuery])

  const handleRetry = () => {
    if (lastFailedQueryRef.current && !isSubmittingRef.current && !isTyping) {
      // Reuse the original ref: the backend dedupes the user turn and the
      // deterministic assistant ref, so retrying never adds duplicate rows.
      const retryRef = lastFailedRef.current || undefined
      handleUserSubmit(lastFailedQueryRef.current, { messageRef: retryRef, retry: true })
    }
  }

  const handleResetConversation = () => {
    voiceSessionRef.current?.stop()
    setIsVoiceMode(false)
    voiceReplyRef.current?.stop()
    activeModelMsgIdRef.current = null
    activeUserMsgIdRef.current = null
    sessionIdRef.current = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    lastFailedQueryRef.current = null
    lastFailedRef.current = null
    setActiveSessionId(null)
    setDetailHasMore(false)
    setDetailCursor(null)
    setRequirements(INITIAL_REQUIREMENTS)
    setActiveDiscussingField('location')
    setMessages([freshGreetingMessage()])
    setAgentStatus('ready')
    setApiError(null)
    setView('chat')
  }

  const handleEditField = (field: TrackedFieldKey) => {
    setActiveDiscussingField(field)
    const promptMap: Record<TrackedFieldKey, string> = {
      purpose: 'Would you prefer to Buy or Rent?',
      location: 'Which Dubai community should we focus on?',
      propertyType: 'What property type do you prefer (Apartment, Villa, Townhouse, Penthouse)?',
      bhk: 'How many bedrooms would you prefer?',
      budget: 'What is your maximum budget in AED?',
      timeline: 'When are you planning to move? (Immediate, within 3 months, 3–6 months, or just browsing)',
      nearMetro: 'Should the property be close to a Metro station?',
      beachfront: 'Are you looking for direct beach access or sea views?',
      amenities: 'What amenities are most important to you?'
    }
    setMessages((prev) => [
      ...prev,
      {
        id: nextChatMsgId('agent'),
        sender: 'agent',
        text: promptMap[field],
        ...nowStamp(),
        quickActions: field === 'purpose' ? ['Buy a Property', 'Rent a Property'] : undefined
      }
    ])
    // Keep the assistant's clarifying prompt in the same conversation so a
    // restored history keeps the question next to the customer's answer.
    if (fbUser?.uid) {
      createCustomerChatTurn({
        session_id: sessionIdRef.current,
        role: 'assistant',
        text: promptMap[field],
        record_ref: nextChatMsgId('msg'),
      })
        .then(() => setActiveSessionId(sessionIdRef.current))
        .catch((e) => console.warn('Failed to persist criteria prompt:', e))
    }
  }

  const handleAuthSuccess = (user: { name: string; email: string }) => {
    setProfileName(user.name)
    setView('onboarding')
  }

  const handleOnboardingComplete = (result: OnboardingResult) => {
    setRequirements((prev) => {
      if (requirementsHaveContext(prev)) return prev
      return {
        ...prev,
        location: result.requirements.location ?? prev.location,
        budget: result.requirements.budget ?? prev.budget,
        propertyType: result.requirements.propertyType ?? prev.propertyType,
        bhk: result.requirements.bhk ?? prev.bhk,
        purpose: result.requirements.purpose ?? prev.purpose
      }
    })
    setView('chat')
    if (!result.skipped) {
      pushAgentMessage(
        `Lovely — I've noted your preferences${result.requirements.location ? ` around ${result.requirements.location}` : ''}. Just tell me what to search first, or tap a suggestion below.`
      )
    }
  }

  const handleSignOut = () => {
    // Full sign-out: Firebase session + local profile + cached staff role,
    // so the next sign-in (possibly a different user/role) starts clean.
    logout().catch(() => {})
    clearStaffMeCache()
    clearLocalUser()
    setProfileName(null)
    setView('chat')
  }

  if (!isOpen) return null

  const showEmptyState = messages.length <= 1 && !isTyping
  const statusLabel = getStatusLabel(agentStatus, voiceState)
  const canSend = inputText.trim().length > 0 && !isTyping && !isSubmittingRef.current

  return (
    <div className="lyka-chat-overlay" role="dialog" aria-modal="true" aria-label="LYKA AI property assistant">
      <div className="lyka-chat-modal">
        {/* Header */}
        <div className="lyka-chat-header">
          <div className="lyka-chat-header-left">
            <div className="lyka-chat-orb" aria-hidden="true">
              <div className="lyka-chat-orb-core" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 className="lyka-chat-title">
                LYKA <span className="lyka-chat-title-gradient">AI</span> · Dubai Property Consultant
              </h3>
              <p className="lyka-chat-subtitle">
                {agentStatus === 'thinking' || isTyping
                  ? 'Finding the perfect answer for you…'
                  : 'Friendly chat · Live Dubai listings'}
              </p>
              <span className="lyka-chat-status-pill">
                <span
                  className="lyka-chat-status-dot"
                  style={{
                    background:
                      agentStatus === 'thinking' || isTyping ? '#C5A869'
                      : voiceState === 'listening' ? '#B06B80'
                      : '#2E9E6B',
                  }}
                />
                {statusLabel} · Ollama Llama 3.2
              </span>
            </div>
          </div>

          <div className="lyka-chat-header-actions">
            {profileName ? (
              <span className="lyka-chat-user-chip" title={profileName}>
                <User size={13} /> {String(profileName || '').split(' ')[0] || 'Client'}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setView('auth')}
                className="lyka-chat-ghost-btn"
                title="Sign in to personalize your search"
              >
                <User size={13} /> Sign in
              </button>
            )}
            {fbUser?.uid && (
              <button
                type="button"
                onClick={() => setHistoryOpen((prev) => !prev)}
                className="lyka-chat-ghost-btn"
                title={historyOpen ? 'Hide conversation history' : 'Show conversation history'}
                aria-pressed={historyOpen}
                style={historyOpen ? { borderColor: 'var(--gold-primary)', color: 'var(--gold-dark)' } : undefined}
              >
                <MessageSquare size={13} /> Chats{conversationsTotal > 0 ? ` (${conversationsTotal})` : ''}
              </button>
            )}
            <button
              type="button"
              onClick={() => { refreshInquiryCount(); setRecordsTab('inquiries'); setRecordsRefreshKey((k) => k + 1); setView('records') }}
              className="lyka-chat-ghost-btn"
              title="View inquiries submitted through the chatbot"
            >
              <Tag size={13} /> Inquiries{inquiryCount > 0 ? ` (${inquiryCount})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setShowRequirementPanelMobile((prev) => !prev)}
              className="lyka-chat-ghost-btn mobile-panel-btn"
              title="Toggle requirements panel"
            >
              Requirements
            </button>
            {voiceReplySupported && (
              <button
                type="button"
                onClick={handleVoiceReplyToggle}
                className="lyka-chat-ghost-btn"
                title={voiceReplyOn ? 'Voice replies ON — tap to mute' : 'Voice replies OFF — tap to hear responses aloud'}
                aria-label={voiceReplyOn ? 'Mute voice replies' : 'Enable voice replies'}
                aria-pressed={voiceReplyOn}
                style={voiceReplyOn ? { borderColor: 'var(--gold-primary)', color: 'var(--gold-dark)' } : undefined}
              >
                {voiceReplyOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
                {voiceReplyOn ? 'Voice on' : 'Voice off'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="lyka-chat-ghost-btn"
              title="Clear conversation history"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Trash2 size={13} /> Clear Chat
            </button>
            <a href="tel:+97148005952" className="lyka-chat-call-btn">
              <Phone size={13} /> <span className="call-text">+971 4 800 LYKA</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="lyka-chat-close-btn"
              title="Close assistant"
              aria-label="Close assistant"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="lyka-chat-body">
          {fbUser?.uid && view === 'chat' && (
            <ConversationSidebar
              open={historyOpen}
              sessions={conversations}
              activeSessionId={activeSessionId}
              loading={conversationLoading}
              error={conversationError}
              hasMore={conversationHasMore}
              total={conversationsTotal}
              onNewChat={() => {
                handleResetConversation()
                if (typeof window !== 'undefined' && window.innerWidth <= 960) setHistoryOpen(false)
              }}
              onSelect={openConversationById}
              onRename={handleRenameConversation}
              onLoadMore={() => { void loadConversationPage(conversationCursor, false) }}
              onClose={() => setHistoryOpen(false)}
            />
          )}
          <div className="lyka-chat-main">
            {view === 'auth' ? (
              <LykaAuthPanel
                onSuccess={handleAuthSuccess}
                onBackToChat={() => setView('chat')}
                onGoOnboarding={() => setView('onboarding')}
              />
            ) : view === 'onboarding' ? (
              <LykaOnboardingPanel
                initialName={profileName ?? undefined}
                onComplete={handleOnboardingComplete}
                onSkip={() => setView('chat')}
                onBack={() => setView(profileName ? 'chat' : 'auth')}
                ownerUid={fbUser?.uid ?? null}
              />
            ) : view === 'records' ? (
              <LykaRecordsPanel
                key={`${recordsTab}-${recordsRefreshKey}`}
                initialTab={recordsTab}
                onBackToChat={() => setView('chat')}
                onViewPropertyById={handleViewPropertyById}
                refreshKey={recordsRefreshKey}
                ownerUid={fbUser?.uid ?? null}
              />
            ) : (
              <>
            <div className="lyka-chat-scroll">
              {detailHasMore && (
                <div className="lyka-chat-load-older">
                  <button
                    type="button"
                    onClick={handleLoadOlderMessages}
                    disabled={detailLoading}
                  >
                    {detailLoading ? 'Loading earlier messages…' : 'Load earlier messages'}
                  </button>
                </div>
              )}
              {apiError && (
                <div className="lyka-chat-error-banner" role="alert">
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{apiError}</span>
                  {lastFailedQueryRef.current && (
                    <button type="button" className="lyka-chat-retry-btn" onClick={handleRetry} disabled={isTyping}>
                      <RotateCcw size={12} /> Retry
                    </button>
                  )}
                </div>
              )}

              {messages.map((msg, index) => {
                const isLatestAgentMsg =
                  msg.sender === 'agent' &&
                  (index === messages.length - 1 ||
                    messages.slice(index + 1).every((m) => m.sender !== 'agent'))
                const suggestions = getContextualSuggestions(msg, isLatestAgentMsg, availableLocations)
                const isErrorMsg = msg.id.startsWith('agent-error')
                const prev = index > 0 ? messages[index - 1] : null
                const showDaySeparator = shouldShowDateSeparator(
                  prev ? prev.createdAt : null,
                  msg.createdAt
                )

                return (
                  <div key={msg.id}>
                  {showDaySeparator && (
                    <div
                      style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 6px' }}
                      aria-label={dayLabel(msg.createdAt)}
                    >
                      <span
                        style={{
                          fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                          color: 'var(--text-secondary)', background: '#FAF5EA',
                          border: '1px solid var(--champagne-border)',
                          borderRadius: '999px', padding: '3px 14px',
                        }}
                      >
                        {dayLabel(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div className="lyka-chat-msg-row">
                    <div className={`lyka-chat-bubble-wrap ${msg.sender}`}>
                      <div className={`lyka-chat-bubble ${msg.sender}${isErrorMsg ? ' error-bubble' : ''}`}>
                        {msg.text}
                        {isErrorMsg && lastFailedQueryRef.current && (
                          <div style={{ marginTop: '10px' }}>
                            <button type="button" className="lyka-chat-retry-btn" onClick={handleRetry} disabled={isTyping}>
                              <RotateCcw size={12} /> Retry last message
                            </button>
                          </div>
                        )}
                        {msg.sender === 'agent' && !isErrorMsg && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(msg.text)
                                setCopiedMsgId(msg.id)
                                setTimeout(() => setCopiedMsgId(null), 2000)
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: copiedMsgId === msg.id ? '#16A34A' : 'var(--text-secondary, #7A6B78)',
                                cursor: 'pointer',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                opacity: 0.85
                              }}
                              title="Copy response to clipboard"
                            >
                              {copiedMsgId === msg.id ? <Check size={11} color="#16A34A" /> : <Copy size={11} />}
                              <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <span className="lyka-chat-meta-row">
                        <span className="lyka-chat-time">{msg.timestamp}</span>
                        {msg.saveStatus && (
                          <span
                            className={`lyka-chat-save-status ${msg.saveStatus}`}
                            title={
                              msg.saveStatus === 'saved' ? 'Saved to your conversation history'
                              : msg.saveStatus === 'saving' ? 'Saving to your conversation history…'
                              : 'Not saved — retry sending'
                            }
                          >
                            {msg.saveStatus === 'saved' ? 'Saved'
                              : msg.saveStatus === 'saving' ? 'Saving…'
                              : 'Not saved'}
                          </span>
                        )}
                      </span>

                      {msg.matchedProperties && msg.matchedProperties.length > 0 && (
                        <div className="lyka-chat-prop-grid">
                          {msg.matchedProperties.map((prop) => {
                            const isSaved = localSavedIds.includes(prop.property_id)
                            return (
                              <div key={prop.property_id} className="lyka-chat-prop-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div className="lyka-chat-prop-badge">
                                      {prop.property_type} · For {prop.listing_type}
                                    </div>
                                    {prop.isNearbyAlternative && (
                                      <div
                                        title={prop.nearbyRequestedLocation ? `No exact match in ${prop.nearbyRequestedLocation} — showing nearby ${prop.actualLocation || prop.location}` : `Nearby alternative in ${prop.actualLocation || prop.location}`}
                                        style={{ display: 'inline-block', marginTop: '4px', padding: '2px 9px', background: '#FBF3E3', color: '#8A6E30', fontSize: '10.5px', fontWeight: 800, borderRadius: '999px', border: '1px solid #E5D3AC', letterSpacing: '0.02em' }}
                                      >
                                        Nearby alternative · {prop.actualLocation || prop.location}
                                      </div>
                                    )}
                                    <h5 className="lyka-chat-prop-title">{prop.title}</h5>
                                    <div className="lyka-chat-prop-availability">
                                      <span className="lyka-chat-avail-dot" aria-hidden="true" />
                                      {availabilityLabel(prop.availability)}
                                    </div>
                                    {typeof prop.match_score === 'number' && (
                                      <div
                                        title={(prop.match_reasons || []).join(' • ')}
                                        style={{ fontSize: '11px', fontWeight: 700, color: '#2E9E6B', marginTop: '2px' }}
                                      >
                                        {prop.match_score}% match{(prop.mismatches || []).length === 0 ? ' · full match' : ` · ${(prop.mismatches || []).length} mismatch(es)`}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div className="lyka-chat-prop-price">
                                      AED {prop.price_aed.toLocaleString('en-US')}
                                    </div>
                                    {prop.listing_type === 'Rent' && (
                                      <span className="lyka-chat-prop-price-sub">/ year</span>
                                    )}
                                  </div>
                                </div>

                                <div className="lyka-chat-prop-specs">
                                  <span><MapPin size={13} color="#B06B80" />{prop.location}</span>
                                  <span><Building2 size={13} color="#B06B80" />{prop.bhk === 0 ? 'Studio' : `${prop.bhk} BHK`}</span>
                                  <span><Maximize2 size={13} color="#B06B80" />{prop.property_size_sqft.toLocaleString()} sqft</span>
                                </div>

                                <div className="lyka-chat-prop-actions">
                                  <button
                                    type="button"
                                    className="lyka-chat-prop-btn primary"
                                    onClick={() => {
                                      onSelectProperty(prop)
                                      onClose()
                                    }}
                                  >
                                    <Eye size={13} /> View Details
                                  </button>
                                  <button
                                    type="button"
                                    className={`lyka-chat-prop-btn ghost${isSaved ? ' saved' : ''}`}
                                    onClick={() => handleSaveProperty(prop.property_id)}
                                    title={isSaved ? 'Saved to favorites' : 'Save this property'}
                                  >
                                    <Heart size={13} fill={isSaved ? 'currentColor' : 'none'} />
                                    {isSaved ? 'Saved' : 'Interested'}
                                  </button>
                                  <button
                                    type="button"
                                    className="lyka-chat-prop-btn ghost"
                                    onClick={() => handleEnquire(prop)}
                                    disabled={enquiringId === prop.property_id}
                                    title="Submit an inquiry for this property"
                                  >
                                    {enquiringId === prop.property_id
                                      ? <>Saving…</>
                                      : hasInquiryForProperty(prop.property_id, owner)
                                      ? <><CheckCircle2 size={13} /> Enquired</>
                                      : <><Tag size={13} /> Enquire</>}
                                  </button>
                                  <a
                                    href={`https://wa.me/97148005952?text=Hello%20Lyka%20Realty,%20I%20am%20interested%20in%20${encodeURIComponent(prop.title)}%20(Ref:%20${prop.property_id})`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="lyka-chat-prop-btn ghost"
                                    title="Inquire on WhatsApp"
                                  >
                                    <MessageSquare size={13} /> WhatsApp
                                  </a>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {suggestions.length > 0 && (
                      <div className="lyka-chat-chips">
                        {suggestions.map((action, actionIdx) => (
                          <button
                            key={actionIdx}
                            type="button"
                            className="lyka-chat-chip"
                            onClick={() => handleUserSubmit(action)}
                            disabled={isTyping}
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    )}

                    {msg.sender === 'agent' && msg.showSummary && isLatestAgentMsg && (
                      <SummaryCard
                        requirements={requirements}
                        locations={availableLocations}
                        onConfirm={() => handleSummaryConfirm(msg.id)}
                        onUpdateRequirements={handleSummaryUpdate}
                      />
                    )}
                  </div>
                  </div>
                )
              })}

              {/* Welcome screen */}
              {showEmptyState && (
                <div className="lyka-chat-empty">
                  <div className="lyka-chat-empty-orb">
                    <Sparkles size={24} color="#fff" />
                  </div>
                  <h4>{profileName ? `Welcome back, ${String(profileName || '').split(' ')[0] || 'Client'}! ` : ''}How can I help you today?</h4>
                  <p>
                    Chat with me about anything — or tap a suggestion and I'll
                    search live Dubai listings with real prices for you.
                  </p>
                  <div className="lyka-chat-empty-grid">
                    {EMPTY_STATE_SUGGESTIONS.map((s) => (
                      <button
                        key={s.title}
                        type="button"
                        className="lyka-chat-empty-card"
                        onClick={() => handleUserSubmit(s.query)}
                        disabled={isTyping}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px', color: '#944D62' }}>
                          <s.icon size={14} />
                          <strong style={{ margin: 0 }}>{s.title}</strong>
                        </span>
                        <span>{s.subtitle} — tap to search</span>
                      </button>
                    ))}
                  </div>
                  <div className="lyka-chat-chips" style={{ justifyContent: 'center', marginTop: '12px' }}>
                    <button type="button" className="lyka-chat-chip" onClick={() => handleUserSubmit('Buy')} disabled={isTyping}>
                      <KeyRound size={12} /> I want to buy
                    </button>
                    <button type="button" className="lyka-chat-chip" onClick={() => handleUserSubmit('Rent')} disabled={isTyping}>
                      <Home size={12} /> I want to rent
                    </button>
                    {!profileName && (
                      <button type="button" className="lyka-chat-chip" onClick={() => setView('auth')} disabled={isTyping}>
                        <User size={12} /> Personalize my search
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isTyping && (
                <div className="lyka-chat-typing" aria-live="polite">
                  <div className="lyka-chat-typing-dots" aria-hidden="true">
                    <span /><span /><span />
                  </div>
                  <span className="lyka-chat-typing-text">
                    LYKA AI is thinking…
                  </span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Composer */}
            <div className="lyka-chat-composer-zone">
              {isVoiceMode && (
                <div className="lyka-chat-voice-pill">
                  <span className="pulse" />
                  <span>
                    {voiceState === 'listening'
                      ? 'Voice Mode Active · Listening… speak naturally and pause when done.'
                      : isTyping || agentStatus === 'thinking'
                      ? 'Voice Mode Active · AI is replying… (mic will resume automatically)'
                      : 'Voice Mode Active · Hands-free'}
                  </span>
                  <button
                    type="button"
                    className="lyka-chat-voice-stop"
                    onClick={handleToggleVoice}
                    title="Stop voice mode"
                    aria-label="Stop voice mode"
                  >
                    Turn off
                  </button>
                </div>
              )}

              <div className={`lyka-chat-composer${isVoiceMode ? ' voice-active' : ''}`}>
                <input
                  type="text"
                  className="lyka-chat-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    isVoiceMode
                      ? voiceState === 'listening'
                        ? 'Listening… speak naturally (mic stays on across turns)…'
                        : 'Voice mode active…'
                      : 'Type here, or tap the mic for hands-free voice…'
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (canSend) {
                        handleUserSubmit(inputText)
                      }
                    }
                  }}
                  aria-label="Type your message"
                />

                <button
                  type="button"
                  id="chat-mic-btn"
                  onClick={handleToggleVoice}
                  title={isVoiceMode ? 'Voice Mode Active: Click to turn off microphone' : 'Voice Assistant: Hands-free conversation'}
                  className={`lyka-chat-mic-btn${isVoiceMode ? ' active' : ''}`}
                  aria-label={isVoiceMode ? 'Turn off voice mode' : 'Start voice mode'}
                >
                  <Mic size={16} />
                </button>

                {isTyping && (
                  <button
                    type="button"
                    onClick={() => {
                      abortControllerRef.current?.abort()
                      setIsTyping(false)
                    }}
                    style={{
                      background: '#DC2626',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '7px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                    title="Stop response generation"
                  >
                    <Square size={11} fill="#FFFFFF" /> Stop
                  </button>
                )}

                <button
                  type="button"
                  id="chat-send-btn"
                  onClick={() => {
                    if (canSend) {
                      handleUserSubmit(inputText)
                    }
                  }}
                  disabled={!canSend}
                  className="lyka-chat-send-btn"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send size={15} />
                </button>
              </div>
              <div className="lyka-chat-hint">
                Press Enter to send · {profileName ? (
                  <>Signed in as {String(profileName || '').split(' ')[0] || 'Client'} · <button type="button" className="lyka-chat-link-btn" style={{ display: 'inline-flex', alignSelf: 'auto' }} onClick={handleSignOut}>Sign out</button> · </>
                ) : (
                  <><button type="button" className="lyka-chat-link-btn" style={{ display: 'inline-flex', alignSelf: 'auto' }} onClick={() => setView('auth')}>Personalize my search</button> · </>
                )}
                Real listings from the Dubai dataset
              </div>
            </div>
              </>
            )}
          </div>

          {/* Requirement tracking panel (chatbot-exclusive) */}
          <div
            className={`lyka-chat-side desktop-req-panel${showRequirementPanelMobile ? ' mobile-panel-open' : ''}`}
          >
            <RequirementPanel
              requirements={requirements}
              activeField={activeDiscussingField}
              onEditField={handleEditField}
            />
          </div>
        </div>
      </div>
      {/* Clear Conversation Confirmation Dialog */}
      {showClearConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(26, 13, 24, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
            border: '1px solid var(--champagne-border)'
          }}>
            <h3 className="luxury-serif" style={{ fontSize: '18px', color: 'var(--plum-main)', marginBottom: '8px' }}>
              Clear Conversation?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              This will clear the current chat history on this screen and start a fresh session. Saved properties and inquiries will not be affected.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--champagne-border)', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowClearConfirm(false)
                  handleResetConversation()
                }}
                className="gold-btn"
                style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '13px' }}
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
