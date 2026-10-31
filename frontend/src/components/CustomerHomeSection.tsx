import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, CalendarCheck, User,
  ArrowRight, Building2, RefreshCw, FileText,
  SlidersHorizontal, Mic, MicOff, Send, MessageSquareText,
  Check, X, AlertCircle, Info
} from 'lucide-react'
import type { Property } from '../types/property'
import {
  getCustomerInquiries, getMyAppointments,
  getCustomerProfile, fetchPropertiesFromApi,
  saveCustomerPreferences,
  type CustomerInquiryOut, type CustomerAppointment, type CustomerProfileResponse,
  type CustomerPreferences
} from '../services/api'
import { PropertyCard } from './PropertyCard'

import { formatProperty } from '../utils/propertyData'
import { VoiceInputSession, isVoiceInputSupported } from '../services/voiceInput'
import type { UserRequirements } from '../types/agent'
import {
  parseUserInput, getNextQuestion, generateMatchExplanation,
  INITIAL_REQUIREMENTS
} from '../utils/agentEngine'
import {
  PURPOSE_OPTIONS, PROPERTY_TYPE_OPTIONS, BEDROOM_OPTIONS,
  BATHROOM_OPTIONS, FURNISHING_OPTIONS, SUPPORTED_AMENITIES, TIMELINE_OPTIONS,
  emptyPreferencesForm, validatePreferencesForm, buildPreferencesPayload, preferencesToForm,
  type PreferencesFormState
} from '../utils/customerPreferences'

// Official LYKA Realty Luxury Plum & Champagne Gold Design System
const PLUM_DEEP = '#3B2348'
const PLUM_RICH = '#53345F'
const GOLD_CHAMPAGNE = '#C6A15B'
const GOLD_SOFT = '#E2C98D'
const IVORY_WARM = '#FAF7F0'
const IVORY_SURFACE = '#FFFFFF'
const CHARCOAL = '#26232B'
const LAVENDER_MUTED = '#EEE7F2'
const BORDER = '#E8DCC8'
const BORDER_GOLD = '#D8C28E'
const TEXT_MUTED = '#7A6B78'

// Luxury palette aliases
const NAVY = PLUM_DEEP
const TEAL = GOLD_CHAMPAGNE
const IVORY_BG = IVORY_WARM

const PRIME_COMMUNITIES = [
  'Dubai Marina',
  'Downtown Dubai',
  'Palm Jumeirah',
  'Business Bay',
  'Dubai Hills Estate',
  'Jumeirah Beach Residence',
  'Jumeirah Village Circle',
  'Arabian Ranches',
] as const

const BUDGET_PRESETS = [
  { label: 'Under 1.5M', min: '', max: '1500000' },
  { label: '1.5M – 3M', min: '1500000', max: '3000000' },
  { label: '3M – 6M', min: '3000000', max: '6000000' },
  { label: '6M – 12M', min: '6000000', max: '12000000' },
  { label: '12M+ Luxury', min: '12000000', max: '' },
]

const QUICK_MESSAGE_CHIPS = [
  'Hi, I need a 2-bedroom apartment.',
  "I'm looking to buy a villa.",
  'I want to rent in Dubai Marina.',
  'My budget is AED 1–2 million.',
  'I need a swimming pool and parking.',
  'Show me properties available now.',
]

interface CustomerHomeSectionProps {
  currentUser: { name: string; email: string; uid?: string }
  onOpenFavorites: () => void
  onSelectProperty: (property: Property) => void
  onToggleFavorite: (propertyId: string) => void
  isFavorite: (propertyId: string) => boolean
}

type TabKey = 'recommendations' | 'inquiries' | 'appointments' | 'preferences' | 'assistant'

interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: string
}

export function CustomerHomeSection({
  currentUser,
  onOpenFavorites: _onOpenFavorites,
  onSelectProperty,
  onToggleFavorite,
  isFavorite,
}: CustomerHomeSectionProps) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('recommendations')

  const [loading, setLoading] = useState(true)
  const [profileData, setProfileData] = useState<CustomerProfileResponse | null>(null)
  const [inquiries, setInquiries] = useState<CustomerInquiryOut[]>([])
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([])
  const [recommendedProps, setRecommendedProps] = useState<Property[]>([])
  const [matchExplanations, setMatchExplanations] = useState<Record<string, string>>({})
  const [partialMatchIds, setPartialMatchIds] = useState<Set<string>>(new Set())

  // Modal State for "Your Preferences"
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false)
  const [prefsForm, setPrefsForm] = useState<PreferencesFormState>(emptyPreferencesForm())
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [isSavingPrefs, setIsSavingPrefs] = useState(false)

  // WhatsApp-style Assistant & Voice Input State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: 'Hello! I am your LYKA Dubai Property Advisor. You can speak with me using the microphone or type below. What kind of property are you looking for?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [composerText, setComposerText] = useState('')
  const [activeRequirements, setActiveRequirements] = useState<UserRequirements>(INITIAL_REQUIREMENTS)
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'results' | 'denied' | 'unsupported' | 'error'>('idle')
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)
  const voiceSessionRef = useRef<VoiceInputSession | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  // Load customer data & initial recommendations
  useEffect(() => {
    let isMounted = true

    const loadCustomerData = async () => {
      setLoading(true)
      try {
        const [prof, inq, appt] = await Promise.all([
          getCustomerProfile().catch(() => null),
          getCustomerInquiries().catch(() => []),
          getMyAppointments().catch(() => []),
        ])

        if (!isMounted) return

        if (prof) {
          setProfileData(prof)
          if (prof.profile?.preferences) {
            setPrefsForm(preferencesToForm(prof.profile.preferences))
            // Pre-seed assistant requirements from saved preferences
            const sp = prof.profile.preferences
            const pPurpose = sp.purpose === 'Buy' || sp.purpose === 'Rent' ? sp.purpose : null
            const pType = ['Apartment', 'Villa', 'Townhouse', 'Penthouse'].includes(sp.propertyType || '')
              ? (sp.propertyType as 'Apartment' | 'Villa' | 'Townhouse' | 'Penthouse')
              : null
            setActiveRequirements((prev: UserRequirements) => ({
              ...prev,
              location: sp.locations?.[0] || prev.location,
              propertyType: pType || prev.propertyType,
              bhk: sp.bedrooms ?? prev.bhk,
              budget: sp.budgetMax ?? prev.budget,
              purpose: pPurpose || prev.purpose,
            }))
          }
        }
        setInquiries(inq)
        setAppointments(appt)

        await executePropertySearch(prof?.profile?.preferences)
      } catch {
        // Safe graceful degradation
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadCustomerData()

    return () => {
      isMounted = false
    }
  }, [currentUser.email])

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages, voiceState])

  // Real Property Search & Explanation Engine
  const executePropertySearch = async (prefs?: CustomerPreferences | null) => {
    const prefLocations = prefs?.locations || []
    const prefType = prefs?.propertyType || undefined
    const prefBedrooms = prefs?.bedrooms ?? undefined
    const prefBathrooms = prefs?.bathrooms ?? undefined
    const prefBudgetMin = prefs?.budgetMin ?? undefined
    const prefBudgetMax = prefs?.budgetMax ?? undefined
    const prefPurpose = prefs?.purpose || undefined
    const prefFurnishing = prefs?.furnishing || undefined
    const prefAmenities = prefs?.amenities && prefs.amenities.length > 0 ? prefs.amenities : undefined

    try {
      const recSearch = await fetchPropertiesFromApi({
        limit: 8,
        location: prefLocations.length > 0 ? prefLocations[0] : 'Dubai Marina',
        property_type: prefType,
        bedrooms: prefBedrooms,
        bathrooms: prefBathrooms,
        min_budget: prefBudgetMin,
        max_budget: prefBudgetMax,
        purpose: prefPurpose,
        furnishing: prefFurnishing,
        amenity: prefAmenities,
      }).catch(() => null)

      if (recSearch?.top_properties) {
        const rawProps = recSearch.top_properties
        const seenIds = new Set<string>()
        const uniqueProps = rawProps.filter((p: any) => {
          const pid = p.property_id || ''
          if (!pid || seenIds.has(pid)) return false
          seenIds.add(pid)
          return true
        })
        const props = uniqueProps.map(formatProperty)
        setRecommendedProps(props)

        // Build explanations and flag partial matches
        const explanations: Record<string, string> = {}
        const partials = new Set<string>()

        props.forEach((prop) => {
          const validPurpose = prefPurpose === 'Buy' || prefPurpose === 'Rent' ? prefPurpose : null
          const validPt = ['Apartment', 'Villa', 'Townhouse', 'Penthouse'].includes(prefType || '')
            ? (prefType as 'Apartment' | 'Villa' | 'Townhouse' | 'Penthouse')
            : null
          const req: UserRequirements = {
            purpose: validPurpose,
            location: prefLocations[0] || null,
            propertyType: validPt,
            bhk: prefBedrooms ?? null,
            budget: prefBudgetMax ?? null,
            timeline: null,
            nearMetro: null,
            beachfront: null,
            amenities: prefAmenities || [],
          }
          explanations[prop.property_id] = generateMatchExplanation(prop, req)

          // Determine if partial match
          const locMatch = !prefLocations[0] || prop.location.toLowerCase().includes(prefLocations[0].toLowerCase())
          const bhkMatch = prefBedrooms === undefined || prop.bhk === prefBedrooms
          const budgetMatch = !prefBudgetMax || prop.price_aed <= prefBudgetMax

          if (!locMatch || !bhkMatch || !budgetMatch) {
            partials.add(prop.property_id)
          }
        })

        setMatchExplanations(explanations)
        setPartialMatchIds(partials)
      }
    } catch {
      // Safe fallback
    }
  }

  // Handle Save Preferences from Modal
  const handleSavePreferences = async (andFind = false) => {
    const err = validatePreferencesForm(prefsForm)
    if (err) {
      setPrefsError(err)
      return
    }

    setPrefsError(null)
    setIsSavingPrefs(true)

    try {
      const payload = buildPreferencesPayload(prefsForm)
      const sanitized: CustomerPreferences = payload || {
        locations: [],
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        budgetMin: null,
        budgetMax: null,
        purpose: null,
        timeline_days: null,
        timeline: null,
        amenities: [],
        petFriendly: false,
        furnishing: null,
      }

      await saveCustomerPreferences(sanitized)

      // Update local profile data
      setProfileData((prev) => {
        if (!prev) return null
        return {
          ...prev,
          profile: prev.profile ? { ...prev.profile, preferences: sanitized } : null,
        }
      })

      // Re-run recommendation search with new criteria
      await executePropertySearch(sanitized)

      setIsPrefsModalOpen(false)
      if (andFind) {
        setActiveTab('recommendations')
      }
    } catch (saveErr: unknown) {
      setPrefsError(saveErr instanceof Error ? saveErr.message : 'Could not save preferences to server.')
    } finally {
      setIsSavingPrefs(false)
    }
  }

  // Voice Input Handlers
  const toggleVoiceInput = () => {
    if (!isVoiceInputSupported()) {
      setVoiceState('unsupported')
      setVoiceNotice('Voice input is not supported in this browser. Please use Chrome or Edge, or continue typing.')
      return
    }

    if (voiceSessionRef.current && voiceSessionRef.current.isListening()) {
      voiceSessionRef.current.stop()
      setVoiceState('idle')
      return
    }

    const session = new VoiceInputSession({
      onStateChange: (st) => {
        if (st === 'listening') setVoiceState('listening')
        else if (st === 'denied') {
          setVoiceState('denied')
          setVoiceNotice('Microphone permission denied. Typing still works — allow microphone access in your browser bar.')
        } else if (st === 'unsupported') {
          setVoiceState('unsupported')
          setVoiceNotice('Voice input is not supported in this browser. Typing still works.')
        } else if (st === 'idle') {
          setVoiceState('idle')
        }
      },
      onInterimText: (txt) => {
        setComposerText(txt)
      },
      onFinalText: (txt) => {
        setComposerText(txt)
        setVoiceState('results')
        setVoiceNotice('Speech converted to editable text. Edit or send when ready.')
      },
      onError: (msg) => {
        setVoiceNotice(msg)
      },
    })

    voiceSessionRef.current = session
    session.setBaseText(composerText)
    session.start()
  }

  // Submit User Message in Assistant
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || composerText).trim()
    if (!textToSend) return

    setVoiceNotice(null)
    setComposerText('')
    setVoiceState('processing')

    // Append user message
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setChatMessages((prev) => [...prev, userMsg])

    // Extract property requirements using existing agent engine
    const { updated: newReqs } = parseUserInput(textToSend, activeRequirements)
    setActiveRequirements(newReqs)

    // Check next logical question based strictly on missing info
    const nextQ = getNextQuestion(newReqs)

    let replyText = ''
    if (nextQ) {
      replyText = `Noted! ${nextQ.question}`
    } else {
      replyText = `I have captured your requirements (${newReqs.purpose || 'Any'}, ${newReqs.bhk ? `${newReqs.bhk} BHK` : 'Any BHK'} in ${newReqs.location || 'Dubai'}, budget up to AED ${newReqs.budget ? newReqs.budget.toLocaleString() : 'flexible'}). Click "Find My Properties" below to inspect curated matches.`
    }

    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setChatMessages((prev) => [...prev, assistantMsg])
      setVoiceState('idle')
    }, 400)
  }

  // Handle Find My Properties from Assistant
  const handleFindFromAssistant = async () => {
    const mappedPrefs: CustomerPreferences = {
      locations: activeRequirements.location ? [activeRequirements.location] : [],
      propertyType: activeRequirements.propertyType || null,
      bedrooms: activeRequirements.bhk ?? null,
      budgetMin: null,
      budgetMax: activeRequirements.budget ?? null,
      purpose: activeRequirements.purpose || null,
      timeline_days: null,
      amenities: activeRequirements.amenities || [],
    }

    setLoading(true)
    setActiveTab('recommendations')
    await executePropertySearch(mappedPrefs)
    setLoading(false)
  }

  const firstName = currentUser.name?.split(' ')[0] || 'Investor'
  const userPrefs = profileData?.profile?.preferences

  return (
    <section
      id="customer-portal-section"
      style={{
        background: IVORY_BG,
        borderBottom: `1px solid ${BORDER}`,
        padding: '48px 0 60px',
      }}
    >
      <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        {/* Welcome Banner */}
        <div
          style={{
            background: IVORY_SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: '16px',
            padding: '24px 30px',
            boxShadow: '0 4px 14px rgba(59, 35, 72, 0.05)',
            marginBottom: '28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: LAVENDER_MUTED,
                borderRadius: '20px',
                border: '1px solid #D8CCD5',
                fontSize: '11px',
                fontWeight: 700,
                color: PLUM_RICH,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
              }}
            >
              <Sparkles size={13} /> Verified Client Portal
            </div>
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 800,
                color: NAVY,
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Welcome back, {firstName}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: TEXT_MUTED }}>
              Here is your personalized Dubai property feed, saved homes, and inquiry status.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

            {/* Prominent "Your Preferences" Button */}
            <button
              type="button"
              onClick={() => {
                if (userPrefs) {
                  setPrefsForm(preferencesToForm(userPrefs))
                }
                setPrefsError(null)
                setIsPrefsModalOpen(true)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 18px',
                background: 'linear-gradient(135deg, #E2C98D 0%, #C6A15B 100%)',
                color: PLUM_DEEP,
                borderRadius: '8px',
                border: '1px solid #A68748',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(198, 161, 91, 0.28)',
              }}
            >
              <SlidersHorizontal size={14} /> Your Preferences
            </button>

            {/* Property Assistant Button */}
            <button
              type="button"
              onClick={() => setActiveTab('assistant')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                background: activeTab === 'assistant' ? PLUM_DEEP : 'rgba(59, 35, 72, 0.06)',
                color: activeTab === 'assistant' ? '#fff' : NAVY,
                borderRadius: '8px',
                border: `1px solid ${BORDER}`,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <MessageSquareText size={14} /> Property Assistant
            </button>

            {/* My Account Navigation */}
            <button
              type="button"
              onClick={() => navigate('/account')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 18px',
                background: PLUM_DEEP,
                color: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #A68748',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(59, 35, 72, 0.2)',
              }}
            >
              <User size={14} /> My Account <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: `1px solid ${BORDER}`,
            paddingBottom: '12px',
            marginBottom: '24px',
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('recommendations')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'recommendations' ? NAVY : 'transparent',
              color: activeTab === 'recommendations' ? '#fff' : TEXT_MUTED,
              fontSize: '13px',
              fontWeight: activeTab === 'recommendations' ? 700 : 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <Sparkles size={14} color={activeTab === 'recommendations' ? TEAL : undefined} />
            AI Recommendations ({recommendedProps.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('assistant')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'assistant' ? NAVY : 'transparent',
              color: activeTab === 'assistant' ? '#fff' : TEXT_MUTED,
              fontSize: '13px',
              fontWeight: activeTab === 'assistant' ? 700 : 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <MessageSquareText size={14} color={activeTab === 'assistant' ? TEAL : undefined} />
            Property Assistant (Voice &amp; Chat)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inquiries')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'inquiries' ? NAVY : 'transparent',
              color: activeTab === 'inquiries' ? '#fff' : TEXT_MUTED,
              fontSize: '13px',
              fontWeight: activeTab === 'inquiries' ? 700 : 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <FileText size={14} />
            My Inquiries ({inquiries.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('appointments')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'appointments' ? NAVY : 'transparent',
              color: activeTab === 'appointments' ? '#fff' : TEXT_MUTED,
              fontSize: '13px',
              fontWeight: activeTab === 'appointments' ? 700 : 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <CalendarCheck size={14} />
            Appointments ({appointments.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'preferences' ? NAVY : 'transparent',
              color: activeTab === 'preferences' ? '#fff' : TEXT_MUTED,
              fontSize: '13px',
              fontWeight: activeTab === 'preferences' ? 700 : 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <Building2 size={14} />
            My Preferences
          </button>
        </div>

        {/* Tab 1: AI Recommended Properties with Explanations */}
        {activeTab === 'recommendations' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: 0 }}>
                  Curated Dubai Matches
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: TEXT_MUTED }}>
                  Live verified listings from our 3,000 property dataset matched against your preferences.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setIsPrefsModalOpen(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${BORDER}`,
                    background: '#fff',
                    color: NAVY,
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <SlidersHorizontal size={13} /> Adjust Filters
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('properties')
                    if (el) el.scrollIntoView({ behavior: 'smooth' })
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: TEAL,
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  Browse All 3,000 Listings <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: TEXT_MUTED }}>
                <RefreshCw size={24} color={TEAL} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
                <div>Selecting personalized Dubai residences…</div>
              </div>
            ) : recommendedProps.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '20px' }}>
                {recommendedProps.map((prop) => {
                  const isPartial = partialMatchIds.has(prop.property_id)
                  const explanation = matchExplanations[prop.property_id]
                  return (
                    <div key={prop.property_id} style={{ display: 'flex', flexDirection: 'column' }}>
                      <PropertyCard
                        property={prop}
                        onSelectProperty={onSelectProperty}
                        onToggleFavorite={onToggleFavorite}
                        isFavorite={isFavorite(prop.property_id)}
                      />
                      {/* Match Explanation & Partial Match Banner */}
                      <div
                        style={{
                          marginTop: '-8px',
                          background: isPartial ? '#FEF3C7' : LAVENDER_MUTED,
                          border: `1px solid ${isPartial ? '#FDE68A' : '#D8CCD5'}`,
                          borderRadius: '0 0 10px 10px',
                          padding: '8px 12px',
                          fontSize: '11.5px',
                          color: isPartial ? '#92400E' : NAVY,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, marginBottom: '2px' }}>
                          {isPartial ? (
                            <>
                              <Info size={12} color="#D97706" /> Partial Match
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} color={TEAL} /> Top Recommendation
                            </>
                          )}
                        </div>
                        <div style={{ lineHeight: 1.4, fontSize: '11px', color: isPartial ? '#78350F' : '#334155' }}>
                          {explanation || 'Matches your community and criteria.'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 24px',
                  background: IVORY_SURFACE,
                  borderRadius: '12px',
                  border: `1px solid ${BORDER}`,
                  color: TEXT_MUTED,
                }}
              >
                <AlertCircle size={32} color={TEAL} style={{ margin: '0 auto 12px' }} />
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>
                  No exact properties found matching these strict criteria
                </h4>
                <p style={{ fontSize: '13.5px', maxWidth: '500px', margin: '0 auto 16px' }}>
                  Try widening your budget range, considering adjacent prime communities, or adjusting required bedroom counts.
                </p>
                <button
                  type="button"
                  onClick={() => setIsPrefsModalOpen(true)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: NAVY,
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Adjust Your Preferences
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab: WhatsApp-Style Property Assistant */}
        {activeTab === 'assistant' && (
          <div
            style={{
              background: IVORY_SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(23, 42, 70, 0.05)',
            }}
          >
            {/* WhatsApp / Luxury Chat Header */}
            <div
              style={{
                background: PLUM_DEEP, // Luxury Plum header
                padding: '14px 20px',
                color: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #E2C98D 0%, #C6A15B 100%)', color: PLUM_DEEP,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  🏛️
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14.5px' }}>LYKA Property Assistant</div>
                  <div style={{ fontSize: '11px', opacity: 0.85, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16A34A' }} /> Online | Voice &amp; Text enabled
                  </div>
                </div>
              </div>

              {/* Action: Find My Properties */}
              <button
                type="button"
                onClick={handleFindFromAssistant}
                style={{
                  padding: '7px 14px',
                  borderRadius: '20px',
                  background: '#16A34A',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}
              >
                <Sparkles size={13} /> Find My Properties
              </button>
            </div>

            {/* Active Requirements Bar */}
            <div
              style={{
                background: '#FAF7F0',
                borderBottom: `1px solid ${BORDER}`,
                padding: '8px 16px',
                fontSize: '12px',
                color: PLUM_DEEP,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontWeight: 700 }}>Active Requirements:</span>
              <span style={{ background: LAVENDER_MUTED, border: '1px solid #D8CCD5', padding: '2px 8px', borderRadius: '4px' }}>
                {activeRequirements.purpose || 'Buy/Rent'}
              </span>
              <span style={{ background: LAVENDER_MUTED, border: '1px solid #D8CCD5', padding: '2px 8px', borderRadius: '4px' }}>
                {activeRequirements.location || 'Any Community'}
              </span>
              <span style={{ background: LAVENDER_MUTED, border: '1px solid #D8CCD5', padding: '2px 8px', borderRadius: '4px' }}>
                {activeRequirements.propertyType || 'Any Type'}
              </span>
              <span style={{ background: LAVENDER_MUTED, border: '1px solid #D8CCD5', padding: '2px 8px', borderRadius: '4px' }}>
                {activeRequirements.bhk !== null ? (activeRequirements.bhk === 0 ? 'Studio' : `${activeRequirements.bhk} BHK`) : 'Any BHK'}
              </span>
              {activeRequirements.budget && (
                <span style={{ background: LAVENDER_MUTED, border: '1px solid #D8CCD5', padding: '2px 8px', borderRadius: '4px' }}>
                  AED {activeRequirements.budget.toLocaleString()} max
                </span>
              )}
            </div>

            {/* Chat Messages Stream */}
            <div
              ref={chatScrollRef}
              style={{
                height: '320px',
                overflowY: 'auto',
                padding: '16px 20px',
                background: '#FAF7F0', // Warm Luxury Ivory
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {chatMessages.map((msg) => {
                const isUser = msg.sender === 'user'
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      background: isUser ? '#EEE7F2' : '#FFFFFF', border: `1px solid ${BORDER}`,
                      borderRadius: isUser ? '10px 10px 0 10px' : '10px 10px 10px 0',
                      padding: '10px 14px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                      fontSize: '13.5px',
                      color: CHARCOAL,
                      position: 'relative',
                    }}
                  >
                    <div>{msg.text}</div>
                    <div style={{ fontSize: '10px', color: '#9CA3AF', textAlign: 'right', marginTop: '4px' }}>
                      {msg.timestamp}
                    </div>
                  </div>
                )
              })}

              {voiceState === 'listening' && (
                <div
                  style={{
                    alignSelf: 'flex-start',
                    background: '#FEF3C7',
                    border: '1px solid #FDE68A',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    color: '#92400E',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', animation: 'pulse 1s infinite' }} />
                  Listening to your speech... speak clearly into the microphone.
                </div>
              )}
            </div>

            {/* Suggested Message Chips */}
            <div style={{ padding: '10px 16px', background: '#F8FAFC', borderTop: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: TEXT_MUTED, marginBottom: '6px', textTransform: 'uppercase' }}>
                Suggested Quick Messages
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {QUICK_MESSAGE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSendMessage(chip)}
                    style={{
                      fontSize: '12px',
                      padding: '5px 11px',
                      borderRadius: '16px',
                      background: '#fff',
                      border: `1px solid ${BORDER}`,
                      color: NAVY,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = GOLD_CHAMPAGNE
                      e.currentTarget.style.background = LAVENDER_MUTED
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = BORDER
                      e.currentTarget.style.background = '#fff'
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Notice (Permission / Unsupported / Success) */}
            {voiceNotice && (
              <div
                style={{
                  padding: '8px 16px',
                  background: voiceState === 'denied' || voiceState === 'error' ? '#FEE2E2' : '#EFF6FF',
                  borderTop: `1px solid ${BORDER}`,
                  fontSize: '12px',
                  color: voiceState === 'denied' || voiceState === 'error' ? '#991B1B' : '#1E40AF',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{voiceNotice}</span>
                <button
                  type="button"
                  onClick={() => setVoiceNotice(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Input Composer & Mic Controls */}
            <div
              style={{
                padding: '12px 16px',
                background: '#FFFFFF',
                borderTop: `1px solid ${BORDER}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {/* Mic Dictation Button */}
              <button
                type="button"
                onClick={toggleVoiceInput}
                title={voiceState === 'listening' ? 'Stop Recording' : 'Voice Input (Click to speak)'}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: voiceState === 'listening' ? '#EF4444' : LAVENDER_MUTED,
                  color: voiceState === 'listening' ? '#fff' : PLUM_DEEP,
                  border: `1px solid ${voiceState === 'listening' ? '#DC2626' : '#D8CCD5'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                }}
              >
                {voiceState === 'listening' ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              {/* Editable Text Input */}
              <input
                type="text"
                placeholder={voiceState === 'listening' ? 'Listening... words will appear here' : 'Type your Dubai property requirements or click mic...'}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '24px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '13.5px',
                  outline: 'none',
                  background: '#F8FAFC',
                }}
              />

              {/* Send Button */}
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!composerText.trim()}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: composerText.trim() ? PLUM_DEEP : '#E2E8F0',
                  color: composerText.trim() ? GOLD_SOFT : '#94A3B8',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: composerText.trim() ? 'pointer' : 'default',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: My Inquiries */}
        {activeTab === 'inquiries' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: 0 }}>
                My Submitted Inquiries
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: TEXT_MUTED }}>
                Direct consultation requests and property viewing inquiries tracked by our sales advisors.
              </p>
            </div>

            {inquiries.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {inquiries.map((inq) => (
                  <div
                    key={inq.id}
                    style={{
                      background: IVORY_SURFACE,
                      border: `1px solid ${BORDER}`,
                      borderRadius: '10px',
                      padding: '16px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: NAVY }}>
                        {inq.property_title || inq.property_id}
                      </div>
                      <div style={{ fontSize: '12px', color: TEXT_MUTED, marginTop: '2px' }}>
                        {inq.property_location ? `${inq.property_location} • ` : ''}
                        AED {inq.price_aed.toLocaleString()} • Submitted {new Date(inq.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: inq.status === 'Contacted' ? '#DCFCE7' : '#FEF3C7',
                          color: inq.status === 'Contacted' ? '#166534' : '#92400E',
                        }}
                      >
                        {inq.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate('/account')}
                        style={{
                          background: 'none',
                          border: `1px solid ${BORDER}`,
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          color: NAVY,
                          cursor: 'pointer',
                        }}
                      >
                        View in Account
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px',
                  background: IVORY_SURFACE,
                  borderRadius: '12px',
                  border: `1px solid ${BORDER}`,
                  color: TEXT_MUTED,
                  fontSize: '13.5px',
                }}
              >
                You haven&apos;t submitted any property inquiries yet. Browse our verified listings to contact an advisor.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Appointments */}
        {activeTab === 'appointments' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: 0 }}>
                Scheduled Appointments &amp; Consultations
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: TEXT_MUTED }}>
                Upcoming phone consultations and private property site viewings.
              </p>
            </div>

            {appointments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {appointments.map((appt) => (
                  <div
                    key={appt.id}
                    style={{
                      background: IVORY_SURFACE,
                      border: `1px solid ${BORDER}`,
                      borderRadius: '10px',
                      padding: '16px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: NAVY }}>
                        {appt.kind === 'viewing' ? 'Property Site Viewing' : 'Phone Consultation'}
                      </div>
                      <div style={{ fontSize: '12px', color: TEXT_MUTED, marginTop: '2px' }}>
                        Date &amp; Time: {new Date(appt.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: '#DCFCE7',
                        color: '#166534',
                      }}
                    >
                      Confirmed
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px',
                  background: IVORY_SURFACE,
                  borderRadius: '12px',
                  border: `1px solid ${BORDER}`,
                  color: TEXT_MUTED,
                  fontSize: '13.5px',
                }}
              >
                No upcoming consultations scheduled. Book a call anytime with our certified Dubai advisors.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Preferences Overview */}
        {activeTab === 'preferences' && (
          <div
            style={{
              background: IVORY_SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>
                  Current Property Criteria
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: TEXT_MUTED }}>
                  Your search preferences automatically power our recommendations and advisor outreach.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsPrefsModalOpen(true)}
                  style={{
                    padding: '8px 14px',
                    background: 'linear-gradient(135deg, #E2C98D 0%, #C6A15B 100%)',
                    border: '1px solid #A68748',
                    color: PLUM_DEEP,
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <SlidersHorizontal size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                  Edit Preferences
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/account')}
                  style={{
                    padding: '8px 14px',
                    background: PLUM_DEEP,
                    border: '1px solid #A68748',
                    color: '#FFFFFF',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View in My Account
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '13px' }}>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT_MUTED, fontSize: '11px', fontWeight: 600 }}>Purpose</div>
                <div style={{ fontWeight: 700, color: NAVY, marginTop: '3px' }}>
                  {userPrefs?.purpose || 'Buy or Rent'}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT_MUTED, fontSize: '11px', fontWeight: 600 }}>Preferred Locations</div>
                <div style={{ fontWeight: 700, color: NAVY, marginTop: '3px' }}>
                  {userPrefs?.locations && userPrefs.locations.length > 0 ? userPrefs.locations.join(', ') : 'Any Prime Dubai Area'}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT_MUTED, fontSize: '11px', fontWeight: 600 }}>Property Type</div>
                <div style={{ fontWeight: 700, color: NAVY, marginTop: '3px' }}>
                  {userPrefs?.propertyType || 'Any Residence'}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT_MUTED, fontSize: '11px', fontWeight: 600 }}>Bedrooms &amp; Bathrooms</div>
                <div style={{ fontWeight: 700, color: NAVY, marginTop: '3px' }}>
                  {userPrefs?.bedrooms !== null && userPrefs?.bedrooms !== undefined ? (userPrefs.bedrooms === 0 ? 'Studio' : `${userPrefs.bedrooms} BR`) : 'Flexible'}
                  {userPrefs?.bathrooms ? ` • ${userPrefs.bathrooms} Baths` : ''}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT_MUTED, fontSize: '11px', fontWeight: 600 }}>Budget Range</div>
                <div style={{ fontWeight: 700, color: NAVY, marginTop: '3px' }}>
                  {userPrefs?.budgetMax ? `Up to AED ${userPrefs.budgetMax.toLocaleString()}` : 'Flexible'}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT_MUTED, fontSize: '11px', fontWeight: 600 }}>Furnishing &amp; Amenities</div>
                <div style={{ fontWeight: 700, color: NAVY, marginTop: '3px' }}>
                  {userPrefs?.furnishing || 'Any'}
                  {userPrefs?.amenities && userPrefs.amenities.length > 0 ? ` (${userPrefs.amenities.length} amenities)` : ''}
                  {userPrefs?.petFriendly ? ' • 🐾 Pets' : ''}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* EASY-TO-USE "YOUR PREFERENCES" MODAL FORM */}
      {isPrefsModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(38, 35, 43, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: `1px solid ${BORDER}`,
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: `1px solid ${BORDER}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                background: '#FFFFFF',
                zIndex: 1,
              }}
            >
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: NAVY, margin: 0 }}>
                  Your Property Preferences
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: TEXT_MUTED }}>
                  Select your criteria below to power instant AI recommendations and tailored search results.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPrefsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUTED }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {prefsError && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: '#FEE2E2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    fontSize: '13px',
                  }}
                >
                  {prefsError}
                </div>
              )}

              {/* 1. Buy or Rent */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                  Intent / Purpose
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {PURPOSE_OPTIONS.map((p) => {
                    const isSelected = prefsForm.purpose === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPrefsForm((f) => ({ ...f, purpose: isSelected ? '' : p }))}
                        style={{
                          flex: 1,
                          padding: '10px',
                          borderRadius: '8px',
                          border: `1.5px solid ${isSelected ? TEAL : BORDER}`,
                          background: isSelected ? 'rgba(198, 161, 91, 0.08)' : '#FFFFFF',
                          color: isSelected ? TEAL : NAVY,
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 2. Location / Community */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                  Location / Community
                </label>
                <input
                  type="text"
                  placeholder="Type or pick a prime community below"
                  value={prefsForm.community}
                  onChange={(e) => setPrefsForm((f) => ({ ...f, community: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `1px solid ${BORDER}`,
                    fontSize: '13.5px',
                    boxSizing: 'border-box',
                    marginBottom: '8px',
                  }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {PRIME_COMMUNITIES.map((comm) => {
                    const isSelected = prefsForm.community === comm
                    return (
                      <button
                        key={comm}
                        type="button"
                        onClick={() => setPrefsForm((f) => ({ ...f, community: isSelected ? '' : comm }))}
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: '20px',
                          border: `1px solid ${isSelected ? TEAL : BORDER}`,
                          background: isSelected ? 'rgba(198, 161, 91, 0.1)' : '#F8FAFC',
                          color: isSelected ? TEAL : NAVY,
                          cursor: 'pointer',
                        }}
                      >
                        {comm}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 3. Property Type */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                  Property Type
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {PROPERTY_TYPE_OPTIONS.map((pt) => {
                    const isSelected = prefsForm.propertyType === pt
                    return (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => setPrefsForm((f) => ({ ...f, propertyType: isSelected ? '' : pt }))}
                        style={{
                          flex: '1 1 120px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: `1.5px solid ${isSelected ? TEAL : BORDER}`,
                          background: isSelected ? 'rgba(198, 161, 91, 0.08)' : '#FFFFFF',
                          color: isSelected ? TEAL : NAVY,
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        {pt}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 4. Bedrooms & Bathrooms */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                    Bedrooms
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {BEDROOM_OPTIONS.map((b) => {
                      const isSelected = prefsForm.bedrooms === String(b.value)
                      return (
                        <button
                          key={b.value}
                          type="button"
                          onClick={() => setPrefsForm((f) => ({ ...f, bedrooms: isSelected ? '' : String(b.value) }))}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${isSelected ? TEAL : BORDER}`,
                            background: isSelected ? 'rgba(198, 161, 91, 0.12)' : '#FFFFFF',
                            color: isSelected ? TEAL : NAVY,
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          {b.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                    Bathrooms
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {BATHROOM_OPTIONS.map((b) => {
                      const isSelected = prefsForm.bathrooms === String(b.value)
                      return (
                        <button
                          key={b.value}
                          type="button"
                          onClick={() => setPrefsForm((f) => ({ ...f, bathrooms: isSelected ? '' : String(b.value) }))}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${isSelected ? TEAL : BORDER}`,
                            background: isSelected ? 'rgba(198, 161, 91, 0.12)' : '#FFFFFF',
                            color: isSelected ? TEAL : NAVY,
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          {b.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* 5. Budget Range & Quick Presets */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                  Budget Range (AED)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                  <input
                    type="number"
                    placeholder="Min Budget (AED)"
                    value={prefsForm.budgetMin}
                    onChange={(e) => setPrefsForm((f) => ({ ...f, budgetMin: e.target.value }))}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                  />
                  <input
                    type="number"
                    placeholder="Max Budget (AED)"
                    value={prefsForm.budgetMax}
                    onChange={(e) => setPrefsForm((f) => ({ ...f, budgetMax: e.target.value }))}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {BUDGET_PRESETS.map((bp) => (
                    <button
                      key={bp.label}
                      type="button"
                      onClick={() => setPrefsForm((f) => ({ ...f, budgetMin: bp.min, budgetMax: bp.max }))}
                      style={{
                        fontSize: '11px',
                        padding: '4px 9px',
                        borderRadius: '4px',
                        border: `1px solid ${BORDER}`,
                        background: '#F8FAFC',
                        color: NAVY,
                        cursor: 'pointer',
                      }}
                    >
                      {bp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Supported Amenities */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                  Supported Amenities
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {SUPPORTED_AMENITIES.map((am) => {
                    const isSelected = (prefsForm.amenities || []).includes(am)
                    return (
                      <button
                        key={am}
                        type="button"
                        onClick={() => {
                          setPrefsForm((f) => {
                            const cur = f.amenities || []
                            return {
                              ...f,
                              amenities: isSelected ? cur.filter((x) => x !== am) : [...cur, am],
                            }
                          })
                        }}
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 600,
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${isSelected ? TEAL : BORDER}`,
                          background: isSelected ? 'rgba(198, 161, 91, 0.12)' : '#FFFFFF',
                          color: isSelected ? TEAL : NAVY,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {isSelected && <Check size={12} />} {am}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 7. Pet-Friendly & Furnishing */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                    Pet-Friendly Preference
                  </label>
                  <button
                    type="button"
                    onClick={() => setPrefsForm((f) => ({ ...f, petFriendly: !f.petFriendly }))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: `1.5px solid ${prefsForm.petFriendly ? TEAL : BORDER}`,
                      background: prefsForm.petFriendly ? 'rgba(198, 161, 91, 0.08)' : '#FFFFFF',
                      color: prefsForm.petFriendly ? TEAL : NAVY,
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    🐾 {prefsForm.petFriendly ? 'Pet-Friendly Only' : 'Any Policy'}
                  </button>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                    Furnishing Preference
                  </label>
                  <select
                    value={prefsForm.furnishing || ''}
                    onChange={(e) => setPrefsForm((f) => ({ ...f, furnishing: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${BORDER}`,
                      fontSize: '13px',
                      background: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    {FURNISHING_OPTIONS.map((fo) => (
                      <option key={fo.label} value={fo.value}>
                        {fo.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 8. Move-in / Purchase Timeline */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                  Expected Move-in / Purchase Timeline
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {TIMELINE_OPTIONS.map((t) => {
                    const isSelected = prefsForm.timelineDays === (t.days ? String(t.days) : '')
                    return (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() =>
                          setPrefsForm((f) => ({
                            ...f,
                            timelineDays: isSelected ? '' : t.days ? String(t.days) : '',
                            timeline: t.label,
                          }))
                        }
                        style={{
                          fontSize: '12px',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${isSelected ? TEAL : BORDER}`,
                          background: isSelected ? 'rgba(198, 161, 91, 0.12)' : '#FFFFFF',
                          color: isSelected ? TEAL : NAVY,
                          cursor: 'pointer',
                        }}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Modal Actions: Edit, Save, Find My Properties, Cancel */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: `1px solid ${BORDER}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#F8FAFC',
                borderRadius: '0 0 16px 16px',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <button
                type="button"
                onClick={() => setIsPrefsModalOpen(false)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  background: '#FFFFFF',
                  color: NAVY,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  disabled={isSavingPrefs}
                  onClick={() => handleSavePreferences(false)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: `1.5px solid ${BORDER_GOLD}`,
                    background: '#FFFFFF',
                    color: PLUM_DEEP,
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isSavingPrefs ? 'Saving…' : 'Save Preferences'}
                </button>

                <button
                  type="button"
                  disabled={isSavingPrefs}
                  onClick={() => handleSavePreferences(true)}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: '1px solid #A68748',
                    background: 'linear-gradient(135deg, #E2C98D 0%, #C6A15B 100%)',
                    color: PLUM_DEEP,
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(198, 161, 91, 0.28)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Sparkles size={14} /> Find My Properties
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
