import { useState, useMemo } from 'react'
import {
  X, Scale, Bus, GraduationCap,
  Building, Trees, Clock, ShieldCheck, Check,
  ChevronRight
} from 'lucide-react'

export interface CommunityLifestyleData {
  id: string
  name: string
  tagline: string
  overallScore: number
  transitScore: number
  transitDetails: string
  schoolsScore: number
  topSchools: string
  healthcareScore: number
  topHospitals: string
  shoppingScore: number
  keyMalls: string
  parksScore: number
  recreation: string
  familyScore: number
  commuteAirportMins: number
  commuteDowntownMins: number
  commuteMarinaMins: number
  priceIndexSqft: number
}

export const DUBAI_COMMUNITIES_LIFESTYLE: CommunityLifestyleData[] = [
  {
    id: 'downtown',
    name: 'Downtown Dubai',
    tagline: 'The iconic urban center anchored by Burj Khalifa and Dubai Mall',
    overallScore: 9.4,
    transitScore: 9.6,
    transitDetails: 'Direct Dubai Metro Red Line (Burj Khalifa/Dubai Mall), RTA feeder buses, on-demand taxis',
    schoolsScore: 8.2,
    topSchools: 'Hartland International School, Jumeirah English Speaking School (JESS) nearby',
    healthcareScore: 9.2,
    topHospitals: 'Mediclinic The Dubai Mall, Emirates Hospital Clinic Business Bay',
    shoppingScore: 9.9,
    keyMalls: 'The Dubai Mall (1,200+ luxury stores, gourmet dining, cinema)',
    parksScore: 8.8,
    recreation: 'Burj Park, Dubai Opera gardens, waterfront promenade',
    familyScore: 8.5,
    commuteAirportMins: 15,
    commuteDowntownMins: 0,
    commuteMarinaMins: 22,
    priceIndexSqft: 2450,
  },
  {
    id: 'marina',
    name: 'Dubai Marina',
    tagline: 'High-energy waterfront luxury with Riviera-style promenade',
    overallScore: 9.2,
    transitScore: 9.5,
    transitDetails: 'Dubai Metro (Sobha Realty / DMCC), Dubai Tram connecting to JBR, RTA Water Buses',
    schoolsScore: 8.0,
    topSchools: 'Regent International School, Emirates International School Meadows',
    healthcareScore: 8.9,
    topHospitals: 'Medcare Medical Centre Marina, King&apos;s College Hospital Marina Clinic',
    shoppingScore: 9.4,
    keyMalls: 'Dubai Marina Mall, Marina Walk retail pavilions',
    parksScore: 8.4,
    recreation: '7km Marina Walk, JBR beach proximity, yacht club charters',
    familyScore: 8.3,
    commuteAirportMins: 28,
    commuteDowntownMins: 20,
    commuteMarinaMins: 0,
    priceIndexSqft: 1850,
  },
  {
    id: 'palm',
    name: 'Palm Jumeirah',
    tagline: 'World-renowned private archipelago with beachfront mansions and resorts',
    overallScore: 9.6,
    transitScore: 8.2,
    transitDetails: 'Palm Monorail connecting Gateway to Atlantis The Royal, taxi fleet',
    schoolsScore: 7.9,
    topSchools: 'GEMS Wellington International School (Al Sufouh), Regent International',
    healthcareScore: 8.8,
    topHospitals: 'Al Das Medical Clinic Shoreline, Fakeeh University Hospital Clinic',
    shoppingScore: 9.5,
    keyMalls: 'Nakheel Mall (140+ retail & cinema), The Pointe, Golden Mile Galleria',
    parksScore: 9.2,
    recreation: 'Al Ittihad Park jogging track, private beachfronts, beach clubs',
    familyScore: 8.9,
    commuteAirportMins: 32,
    commuteDowntownMins: 24,
    commuteMarinaMins: 10,
    priceIndexSqft: 3250,
  },
  {
    id: 'hills',
    name: 'Dubai Hills Estate',
    tagline: 'Master-planned green haven with championship 18-hole golf and vast parks',
    overallScore: 9.5,
    transitScore: 8.0,
    transitDetails: 'Direct Al Khail Road & Umm Suqeim connectivity; planned future Metro Blue Line branch',
    schoolsScore: 9.6,
    topSchools: 'GEMS Wellington Academy Al Khail, GEMS International School, King&apos;s School Al Barsha',
    healthcareScore: 9.5,
    topHospitals: 'King&apos;s College Hospital London (Full general hospital inside the estate)',
    shoppingScore: 9.3,
    keyMalls: 'Dubai Hills Mall (650+ shops, indoor roller coaster, Roxy Cinema)',
    parksScore: 9.8,
    recreation: 'Dubai Hills Central Park (180,000 sqm), championship golf course, dog park, splash park',
    familyScore: 9.8,
    commuteAirportMins: 22,
    commuteDowntownMins: 14,
    commuteMarinaMins: 16,
    priceIndexSqft: 2150,
  },
  {
    id: 'business_bay',
    name: 'Business Bay',
    tagline: 'Canal-front corporate and luxury residential district bordering Downtown',
    overallScore: 8.9,
    transitScore: 9.1,
    transitDetails: 'Business Bay Metro station, RTA Dubai Water Canal Ferries, Sheikh Zayed Rd',
    schoolsScore: 7.8,
    topSchools: 'Hartland International School, North London Collegiate School',
    healthcareScore: 8.7,
    topHospitals: 'Emirates Hospital Clinics, Aster Clinic Business Bay',
    shoppingScore: 8.8,
    keyMalls: 'Bay Avenue Mall, Dubai Mall (5 mins drive)',
    parksScore: 8.6,
    recreation: '12km Dubai Water Canal boardwalk, running tracks, cycling path',
    familyScore: 8.1,
    commuteAirportMins: 16,
    commuteDowntownMins: 4,
    commuteMarinaMins: 20,
    priceIndexSqft: 1780,
  },
  {
    id: 'jvc',
    name: 'Jumeirah Village Circle',
    tagline: 'High-growth urban community with attractive yields and community parks',
    overallScore: 8.7,
    transitScore: 7.9,
    transitDetails: 'RTA Feeder buses to Mall of the Emirates Metro, quick Hessa St & Al Khail Rd access',
    schoolsScore: 9.1,
    topSchools: 'JSS International School, Sunmarke School JVT, Nord Anglia Dubai',
    healthcareScore: 8.6,
    topHospitals: 'Right Health Karama Clinic JVC, Mediclinic Parkview Hospital (10 mins)',
    shoppingScore: 8.9,
    keyMalls: 'Circle Mall (Nesto, boutiques, rooftop sports hub)',
    parksScore: 9.1,
    recreation: '30+ landscaped community parks, kids play zones, jogging tracks',
    familyScore: 9.2,
    commuteAirportMins: 30,
    commuteDowntownMins: 20,
    commuteMarinaMins: 15,
    priceIndexSqft: 1150,
  },
]

interface NeighborhoodComparisonModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectCommunity?: (communityName: string) => void
}

export function NeighborhoodComparisonModal({
  isOpen,
  onClose,
  onSelectCommunity,
}: NeighborhoodComparisonModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(['downtown', 'hills', 'marina'])

  const selectedCommunities = useMemo(() => {
    return DUBAI_COMMUNITIES_LIFESTYLE.filter((c) => selectedIds.includes(c.id))
  }, [selectedIds])

  if (!isOpen) return null

  const toggleCommunity = (id: string) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length > 1) {
        setSelectedIds((prev) => prev.filter((i) => i !== id))
      }
    } else {
      if (selectedIds.length < 3) {
        setSelectedIds((prev) => [...prev, id])
      } else {
        // Swap last
        setSelectedIds((prev) => [prev[1], prev[2], id])
      }
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(38, 35, 43, 0.7)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--theme-bg, #FAF7F0)',
          borderRadius: '16px',
          border: '1px solid var(--theme-border, #E8DCC8)',
          width: '100%',
          maxWidth: '1050px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
            padding: '20px 24px',
            color: '#FFFFFF',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--theme-accent, #C6A15B)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '4px',
              }}
            >
              <Scale size={14} /> Dubai Community Lifestyle Benchmark
            </div>
            <h2
              className="luxury-serif"
              style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#FAF7F0' }}
            >
              Interactive Neighborhood Comparison
            </h2>
            <div style={{ fontSize: '12px', color: '#EEE7F2', marginTop: '2px' }}>
              Compare schools, healthcare, transit, commute times, and family scores across Dubai prime communities.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Community Selection Chips */}
        <div
          style={{
            background: 'var(--theme-surface-elevated, #FAF7F0)',
            padding: '12px 24px',
            borderBottom: '1px solid var(--theme-border, #E8DCC8)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--theme-primary, #3B2348)', marginRight: '4px' }}>
            Select up to 3 communities:
          </span>
          {DUBAI_COMMUNITIES_LIFESTYLE.map((c) => {
            const isSelected = selectedIds.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCommunity(c.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  border: isSelected ? '1px solid var(--theme-accent, #C6A15B)' : '1px solid var(--theme-border, #E8DCC8)',
                  background: isSelected ? 'rgba(198, 161, 91, 0.15)' : 'var(--theme-surface, #FFFFFF)',
                  color: isSelected ? 'var(--theme-primary, #3B2348)' : 'var(--theme-muted, #746875)',
                  fontSize: '12px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {isSelected && <Check size={12} color="var(--theme-accent, #C6A15B)" />}
                {c.name}
              </button>
            )
          })}
        </div>

        {/* Comparison Matrix Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${selectedCommunities.length}, 1fr)`,
              gap: '16px',
            }}
          >
            {selectedCommunities.map((c) => (
              <div
                key={c.id}
                style={{
                  background: 'var(--theme-surface, #FFFFFF)',
                  border: '1px solid var(--theme-border, #E8DCC8)',
                  borderRadius: '12px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                {/* Header Card */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>
                      {c.name}
                    </h3>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: 'rgba(22, 163, 74, 0.12)',
                        color: '#16A34A',
                        fontWeight: 800,
                        fontSize: '12px',
                      }}
                    >
                      ★ {c.overallScore}/10
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--theme-muted, #746875)', lineHeight: 1.4 }}>
                    {c.tagline}
                  </p>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--theme-accent, #C6A15B)', marginTop: '6px' }}>
                    Avg. Rate: AED {c.priceIndexSqft.toLocaleString()} / sq ft
                  </div>
                </div>

                {/* Scores Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Public Transit */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--theme-primary, #3B2348)' }}>
                        <Bus size={13} color="var(--theme-accent, #C6A15B)" /> Transit &amp; Metro Access
                      </span>
                      <span style={{ color: 'var(--theme-primary, #3B2348)' }}>{c.transitScore}/10</span>
                    </div>
                    <div style={{ height: '5px', background: 'var(--theme-border, #E8DCC8)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.transitScore * 10}%`, background: 'var(--theme-accent, #C6A15B)' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--theme-muted, #746875)', marginTop: '3px' }}>
                      {c.transitDetails}
                    </div>
                  </div>

                  {/* Schools & Education */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--theme-primary, #3B2348)' }}>
                        <GraduationCap size={13} color="#2563EB" /> Schools &amp; Nurseries
                      </span>
                      <span style={{ color: 'var(--theme-primary, #3B2348)' }}>{c.schoolsScore}/10</span>
                    </div>
                    <div style={{ height: '5px', background: 'var(--theme-border, #E8DCC8)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.schoolsScore * 10}%`, background: '#2563EB' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--theme-muted, #746875)', marginTop: '3px' }}>
                      {c.topSchools}
                    </div>
                  </div>

                  {/* Healthcare */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--theme-primary, #3B2348)' }}>
                        <Building size={13} color="#DC2626" /> Hospitals &amp; Clinics
                      </span>
                      <span style={{ color: 'var(--theme-primary, #3B2348)' }}>{c.healthcareScore}/10</span>
                    </div>
                    <div style={{ height: '5px', background: 'var(--theme-border, #E8DCC8)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.healthcareScore * 10}%`, background: '#DC2626' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--theme-muted, #746875)', marginTop: '3px' }}>
                      {c.topHospitals}
                    </div>
                  </div>

                  {/* Parks & Recreation */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--theme-primary, #3B2348)' }}>
                        <Trees size={13} color="#16A34A" /> Parks, Greenery &amp; Beach
                      </span>
                      <span style={{ color: 'var(--theme-primary, #3B2348)' }}>{c.parksScore}/10</span>
                    </div>
                    <div style={{ height: '5px', background: 'var(--theme-border, #E8DCC8)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.parksScore * 10}%`, background: '#16A34A' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--theme-muted, #746875)', marginTop: '3px' }}>
                      {c.recreation}
                    </div>
                  </div>
                </div>

                {/* Commute Estimates */}
                <div
                  style={{
                    background: 'var(--theme-surface-elevated, #FAF7F0)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--theme-border, #E8DCC8)',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--theme-primary, #3B2348)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} color="var(--theme-accent, #C6A15B)" /> Commute Estimates (Car/Taxi)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', textAlign: 'center', fontSize: '11px' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>{c.commuteAirportMins} min</div>
                      <div style={{ color: 'var(--theme-muted, #746875)', fontSize: '10px' }}>DXB Airport</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>{c.commuteDowntownMins} min</div>
                      <div style={{ color: 'var(--theme-muted, #746875)', fontSize: '10px' }}>Downtown</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>{c.commuteMarinaMins} min</div>
                      <div style={{ color: 'var(--theme-muted, #746875)', fontSize: '10px' }}>Dubai Marina</div>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectCommunity?.(c.name)
                    onClose()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    borderRadius: '8px',
                    background: 'var(--theme-surface-elevated, #FAF7F0)',
                    border: '1px solid var(--theme-border, #E8DCC8)',
                    color: 'var(--theme-primary, #3B2348)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: 'auto',
                  }}
                >
                  Browse {c.name} Listings <ChevronRight size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Data Source & Authenticity Footer */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'var(--theme-surface, #FFFFFF)',
              border: '1px solid var(--theme-border, #E8DCC8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              fontSize: '11.5px',
              color: 'var(--theme-muted, #746875)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={15} color="#16A34A" />
              <span>
                <strong>Data Source Attribution:</strong> RTA Open Data, Dubai Land Department Quarterly Price Index, and KHDA School Ratings.
              </span>
            </div>
            <span>Last Verified: October 2026</span>
          </div>
        </div>
      </div>
    </div>
  )
}
