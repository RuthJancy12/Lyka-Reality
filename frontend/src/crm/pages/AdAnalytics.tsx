import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Building2, CalendarCheck, ChevronLeft, ChevronRight,
  Eye, Handshake, Megaphone, MessageSquare, MousePointerClick, Pause,
  PhoneCall, Play, RefreshCw, Search, Target as TargetIcon,
  TrendingUp, Users, Clock, BarChart3,
} from 'lucide-react'
import { useStaffRole, getAnalytics, type StaffAnalytics, type Target } from '../services/staffApi'
import {
  getAdFilterOptions, getAdsOverview, listAds, setAdActive,
  type AdFilterOptions, type AdList, type AdQuery, type AdRangeKey,
  type AdRow, type AdsOverview,
} from '../services/adsApi'
import { ErrorBoundary } from '../components/ErrorBoundary'

const PLUM = 'var(--plum-main, #1F101C)'
const GOLD = 'var(--gold-dark, #A37E2C)'
const BORDER = 'var(--champagne-border, #E8DCC8)'
const SURFACE = 'var(--champagne-surface, #F9F5EF)'

const CARD: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: '14px',
  boxShadow: '0 2px 10px rgba(26, 13, 24, 0.04)',
  padding: '20px',
}

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  background: '#fff',
  color: PLUM,
  fontSize: '13px',
  outlineColor: GOLD,
}

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '10.5px',
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: '5px',
}

const RANGE_TABS: Array<{ key: AdRangeKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest published' },
  { value: 'oldest', label: 'Oldest published' },
  { value: 'views_desc', label: 'Most views' },
  { value: 'enquiries_desc', label: 'Most enquiries' },
  { value: 'price_desc', label: 'Price high → low' },
  { value: 'price_asc', label: 'Price low → high' },
  { value: 'title_asc', label: 'Title A → Z' },
]

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const TODAY = ymd(new Date())
const MONTH_START = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

function num(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('en-US')
}

function aed(n: number | null | undefined): string {
  return `AED ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function displayDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function rangeCaption(start?: string | null, end?: string | null): string {
  if (!start && !end) return '—'
  if (!end) return displayDate(start)
  const d = new Date(end)
  const endTime = d.getTime()
  if (Number.isNaN(endTime)) return displayDate(start)
  const endDisplay = new Date(endTime - 1)
  if (Number.isNaN(endDisplay.getTime())) return displayDate(start)
  return `${displayDate(start)} – ${displayDate(endDisplay.toISOString())}`
}

const th: React.CSSProperties = {
  padding: '11px 14px',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: `1px solid ${BORDER}`,
}

const thRight: React.CSSProperties = {
  ...th,
  textAlign: 'right',
}

const td: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'middle',
}

const tdNum: React.CSSProperties = {
  ...td,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 600,
}

interface KpiProps {
  label: string
  value: string
  hint: string
  icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>
  accent?: string
}

function Kpi({ label, value, hint, icon: Icon, accent = GOLD }: KpiProps) {
  return (
    <div style={{ ...CARD, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '10.5px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
          {label}
        </span>
        <Icon size={16} color={accent} />
      </div>
      <div style={{ fontSize: '24px', fontWeight: 800, color: PLUM, margin: '6px 0 2px' }}>{value}</div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{hint}</div>
    </div>
  )
}

function SalespersonAnalyticsView() {
  const [analytics, setAnalytics] = useState<StaffAnalytics | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [an, tg] = await Promise.all([
        getAnalytics(),
        Promise.resolve([] as Target[]),
      ])
      setAnalytics(an)
      setTargets(tg)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load performance analytics.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const calls = analytics?.calls
  const totals = analytics?.totals
  const conv = analytics?.conversion
  const sources = analytics?.source_performance ?? []

  const connectRate = calls?.connect_rate != null ? `${calls.connect_rate.toFixed(1)}%` : '—'
  const contactRate = conv?.enquiry_to_contact_rate != null ? `${conv.enquiry_to_contact_rate.toFixed(1)}%` : '—'
  const dealRate = conv?.site_visit_to_deal_rate != null ? `${conv.site_visit_to_deal_rate.toFixed(1)}%` : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ ...CARD, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', padding: '24px 26px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: SURFACE, borderRadius: '20px', border: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            <BarChart3 size={13} /> Personal Sales &amp; Lead Source Analytics
          </div>
          <h1 className="luxury-serif" style={{ fontSize: '26px', color: PLUM, margin: 0, fontWeight: 700 }}>
            Sales Performance &amp; Lead Analytics
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', margin: '6px 0 0', maxWidth: '680px' }}>
            Real metrics scoped to your assigned leads, client calls, site visits, and deal conversions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData(true)}
          disabled={refreshing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 15px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: PLUM, cursor: 'pointer' }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Updating…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#991B1B', fontSize: '13px' }}>
          <AlertCircle size={17} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} color={GOLD} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
          <div>Loading your sales performance records…</div>
        </div>
      ) : (
        <>
          {/* Top KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
            <Kpi label="Assigned Leads" value={num(totals?.leads)} hint={`${num(totals?.contacted_leads)} contacted (${contactRate})`} icon={Users} />
            <Kpi label="Calls Attempted" value={num(calls?.attempted)} hint={`${num(calls?.connected)} connected (${connectRate})`} icon={PhoneCall} accent={GOLD} />
            <Kpi label="Site Visits" value={num(totals?.site_visits_completed)} hint="Completed viewings" icon={CalendarCheck} accent="var(--plum-rich, #53345F)" />
            <Kpi label="Deals Won" value={num(totals?.deals_closed)} hint={`Visit → Deal: ${dealRate}`} icon={Handshake} accent="#2E7D4F" />
            <Kpi label="Follow-ups" value={num(analytics?.followups?.completed)} hint={`${num(analytics?.followups?.overdue)} overdue`} icon={Clock} accent={analytics?.followups?.overdue ? '#DC2626' : GOLD} />
          </div>

          {/* Targets Section */}
          {targets.length > 0 && (
            <div style={CARD}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: PLUM, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TargetIcon size={17} color={GOLD} /> Monthly Target Progress
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                {targets.map((t) => {
                  let current = 0
                  if (t.metric === 'calls_attempted') current = calls?.attempted ?? 0
                  else if (t.metric === 'calls_connected') current = calls?.connected ?? 0
                  else if (t.metric === 'site_visits_completed') current = totals?.site_visits_completed ?? 0
                  else if (t.metric === 'deals_closed') current = totals?.deals_closed ?? 0
                  else if (t.metric === 'leads') current = totals?.leads ?? 0
                  const pct = t.target_value > 0 ? Math.min(100, Math.round((current / t.target_value) * 100)) : 0
                  const label = t.metric.replace(/_/g, ' ')
                  return (
                    <div key={t.id} style={{ padding: '14px', borderRadius: '10px', background: SURFACE, border: `1px solid ${BORDER}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: PLUM, marginBottom: '6px' }}>
                        <span style={{ textTransform: 'capitalize' }}>{label}</span>
                        <span>{current} / {t.target_value}</span>
                      </div>
                      <div style={{ height: '8px', background: '#E5E7EB', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#2E7D4F' : 'var(--gold-primary, #C5A869)', borderRadius: '4px', transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'right' }}>
                        {pct}% achieved
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Lead Source Performance */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: PLUM, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={17} color={GOLD} /> Lead Source &amp; Acquisition Performance
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Based on your assigned leads
              </span>
            </div>

            {sources.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No lead source data available yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: SURFACE, color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={th}>Acquisition Channel</th>
                      <th style={thRight}>Leads</th>
                      <th style={thRight}>Contacted</th>
                      <th style={thRight}>Site Visits</th>
                      <th style={thRight}>Deals</th>
                      <th style={thRight}>Conversion %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => (
                      <tr key={s.channel} style={{ borderTop: `1px solid ${BORDER}` }}>
                        <td style={{ ...td, fontWeight: 700, color: PLUM }}>
                          {s.channel}
                        </td>
                        <td style={tdNum}>{num(s.leads)}</td>
                        <td style={tdNum}>{num(s.contacted)}</td>
                        <td style={tdNum}>{num(s.site_visits)}</td>
                        <td style={{ ...tdNum, color: s.deals > 0 ? '#2E7D4F' : PLUM }}>{num(s.deals)}</td>
                        <td style={tdNum}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: s.conversion_rate && s.conversion_rate > 0 ? '#EAF3EC' : SURFACE,
                            color: s.conversion_rate && s.conversion_rate > 0 ? '#2E7D4F' : 'var(--text-secondary)',
                          }}>
                            {s.conversion_rate != null ? `${s.conversion_rate.toFixed(1)}%` : '0.0%'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AdInventoryView() {
  const { role } = useStaffRole()
  const canPause = role === 'admin' || role === 'manager'

  const [overview, setOverview] = useState<AdsOverview | null>(null)
  const [data, setData] = useState<AdList | null>(null)
  const [options, setOptions] = useState<AdFilterOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const [rangeKey, setRangeKey] = useState<AdRangeKey>('month')
  const [customStart, setCustomStart] = useState(MONTH_START)
  const [customEnd, setCustomEnd] = useState(TODAY)
  const [appliedCustom, setAppliedCustom] = useState({ start: MONTH_START, end: TODAY })

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('')
  const [project, setProject] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [listingType, setListingType] = useState('')
  const [availability, setAvailability] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [sort, setSort] = useState('newest')

  const [page, setPage] = useState(1)
  const perPage = 25

  useEffect(() => {
    getAdFilterOptions().then(setOptions).catch(() => setOptions(null))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const baseQuery = useMemo<AdQuery>(() => {
    const q: AdQuery = {
      range: rangeKey,
      start: rangeKey === 'custom' ? appliedCustom.start : undefined,
      end: rangeKey === 'custom' ? appliedCustom.end : undefined,
      search,
      location: location || undefined,
      project: project || undefined,
      property_type: propertyType || undefined,
      listing_type: listingType || undefined,
      availability: availability || undefined,
      min_price: minPrice ? Number(minPrice) : undefined,
      max_price: maxPrice ? Number(maxPrice) : undefined,
      is_active: activeFilter === '' ? undefined : activeFilter === 'true',
      sort,
    }
    return q
  }, [rangeKey, appliedCustom, search, location, project, propertyType, listingType, availability, minPrice, maxPrice, activeFilter, sort])

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [o, list] = await Promise.all([
        getAdsOverview(baseQuery),
        listAds({ ...baseQuery, page, per_page: perPage }),
      ])
      setOverview(o)
      setData(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load advertising analytics.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [baseQuery, page, perPage])

  useEffect(() => {
    void load()
  }, [load])

  const resetFilters = () => {
    setSearchInput('')
    setSearch('')
    setLocation('')
    setProject('')
    setPropertyType('')
    setListingType('')
    setAvailability('')
    setMinPrice('')
    setMaxPrice('')
    setActiveFilter('')
    setSort('newest')
    setPage(1)
  }

  const applyRange = (key: AdRangeKey) => {
    if (key === 'custom') {
      setRangeKey('custom')
      setAppliedCustom({ start: customStart, end: customEnd })
    } else {
      setRangeKey(key)
    }
    setPage(1)
  }

  const toggleAd = async (row: AdRow) => {
    setToggling(row.property_ref)
    setError(null)
    try {
      await setAdActive(row.property_ref, !row.is_active)
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the advertisement.')
    } finally {
      setToggling(null)
    }
  }

  const conversion = overview?.enquiry_conversion_rate == null
    ? '—'
    : `${overview.enquiry_conversion_rate.toFixed(1)}%`

  const rangeInfo = overview?.range ?? data?.range

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ ...CARD, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', padding: '24px 26px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: SURFACE, borderRadius: '20px', border: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            <Megaphone size={13} /> Verified advertising performance
          </div>
          <h1 className="luxury-serif" style={{ fontSize: '26px', color: PLUM, margin: 0, fontWeight: 700 }}>
            Property Ads &amp; Analytics
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', margin: '6px 0 0', maxWidth: '680px' }}>
            Real catalogue inventory with deduplicated impressions, views, enquiries, WhatsApp clicks,
            scheduled site visits and closed bookings. Every figure below is read from the database.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {rangeInfo && (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {rangeCaption(rangeInfo.start, rangeInfo.end)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 15px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: PLUM, cursor: 'pointer' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Updating…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#991B1B', fontSize: '13px' }}>
          <AlertCircle size={17} /> {error}
        </div>
      )}

      <div style={{ ...CARD, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '6px' }}>
            Period
          </span>
          {RANGE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => applyRange(tab.key)}
              style={{
                padding: '7px 13px', borderRadius: '7px', fontSize: '12.5px', fontWeight: 700,
                cursor: 'pointer', border: `1px solid ${rangeKey === tab.key ? PLUM : BORDER}`,
                background: rangeKey === tab.key ? PLUM : '#fff',
                color: rangeKey === tab.key ? '#fff' : PLUM,
              }}
            >
              {tab.label}
            </button>
          ))}
          {rangeKey === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px', flexWrap: 'wrap' }}>
              <input type="date" aria-label="Custom range start" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} style={{ ...INPUT, width: '150px', padding: '7px 9px' }} />
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>to</span>
              <input type="date" aria-label="Custom range end" value={customEnd} min={customStart} max={TODAY} onChange={(e) => setCustomEnd(e.target.value)} style={{ ...INPUT, width: '150px', padding: '7px 9px' }} />
              <button
                type="button"
                onClick={() => { setAppliedCustom({ start: customStart, end: customEnd }); setPage(1) }}
                disabled={!customStart || !customEnd || customEnd < customStart}
                style={{ padding: '7px 13px', borderRadius: '7px', fontSize: '12px', fontWeight: 700, border: 'none', background: GOLD, color: '#fff', cursor: 'pointer' }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(188px, 1fr))', gap: '14px' }}>
        <Kpi label="Active Listings" value={num(overview?.active_listings)} hint="Current advertising inventory" icon={Building2} />
        <Kpi label="New This Month" value={num(overview?.new_listings_this_month)} hint="Published since month start" icon={TrendingUp} />
        <Kpi label="Impressions" value={num(overview?.impressions)} hint="Visibility on cards, deduplicated" icon={Users} />
        <Kpi label="Views" value={num(overview?.views)} hint={`${num(overview?.unique_views)} unique visitors`} icon={Eye} />
        <Kpi label="Enquiries" value={num(overview?.enquiries)} hint="Saved public/staff enquiries" icon={MessageSquare} />
        <Kpi label="WhatsApp Clicks" value={num(overview?.whatsapp_clicks)} hint="Consultant hand-offs" icon={MousePointerClick} accent="#2E7D4F" />
        <Kpi label="Site Visits" value={num(overview?.site_visits)} hint="Viewings scheduled" icon={CalendarCheck} />
        <Kpi label="Bookings" value={num(overview?.bookings)} hint={`${conversion} enquiry → booking`} icon={Handshake} accent="#2E7D4F" />
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, color: PLUM, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Megaphone size={17} color={GOLD} /> Advertisement Inventory
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {data ? `${num(data.total)} matching listings` : 'Loading…'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <div style={{ position: 'relative', gridColumn: 'span 2' }}>
            <Search size={14} color="var(--text-secondary)" style={{ position: 'absolute', left: '10px', top: '11px' }} />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title, ref, location or project…"
              aria-label="Search advertisements"
              style={{ ...INPUT, paddingLeft: '31px' }}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="ads-location">Location</label>
            <select id="ads-location" value={location} onChange={(e) => { setLocation(e.target.value); setPage(1) }} style={INPUT}>
              <option value="">All locations</option>
              {(options?.locations ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL} htmlFor="ads-project">Project</label>
            <select id="ads-project" value={project} onChange={(e) => { setProject(e.target.value); setPage(1) }} style={INPUT}>
              <option value="">All projects</option>
              {(options?.projects ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL} htmlFor="ads-type">Property type</label>
            <select id="ads-type" value={propertyType} onChange={(e) => { setPropertyType(e.target.value); setPage(1) }} style={INPUT}>
              <option value="">All types</option>
              {(options?.property_types ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL} htmlFor="ads-listing">Listing type</label>
            <select id="ads-listing" value={listingType} onChange={(e) => { setListingType(e.target.value); setPage(1) }} style={INPUT}>
              <option value="">Sale &amp; rent</option>
              {(options?.listing_types ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL} htmlFor="ads-availability">Availability</label>
            <select id="ads-availability" value={availability} onChange={(e) => { setAvailability(e.target.value); setPage(1) }} style={INPUT}>
              <option value="">All availability</option>
              {(options?.availabilities ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL} htmlFor="ads-status">Ad status</label>
            <select id="ads-status" value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value); setPage(1) }} style={INPUT}>
              <option value="">All ads</option>
              <option value="true">Active</option>
              <option value="false">Paused</option>
            </select>
          </div>
          <div>
            <label style={LABEL} htmlFor="ads-min">Min price (AED)</label>
            <input id="ads-min" type="number" min="0" value={minPrice} onChange={(e) => { setMinPrice(e.target.value); setPage(1) }} placeholder="0" style={INPUT} />
          </div>
          <div>
            <label style={LABEL} htmlFor="ads-max">Max price (AED)</label>
            <input id="ads-max" type="number" min="0" value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value); setPage(1) }} placeholder="Any" style={INPUT} />
          </div>
          <div>
            <label style={LABEL} htmlFor="ads-sort">Sort</label>
            <select id="ads-sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} style={INPUT}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" onClick={resetFilters} style={{ ...INPUT, cursor: 'pointer', fontWeight: 700, textAlign: 'center' }}>
              Reset filters
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <RefreshCw size={22} color={GOLD} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
            <div>Loading real advertising records…</div>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div style={{ padding: '42px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No advertisements match the current filters. Try clearing them or selecting a wider period.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1080px', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: SURFACE, color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={th}>Property</th>
                  <th style={th}>Type / Price</th>
                  <th style={th}>Published</th>
                  <th style={thRight}>Impressions</th>
                  <th style={thRight}>Views</th>
                  <th style={thRight}>Enquiries</th>
                  <th style={thRight}>WhatsApp</th>
                  <th style={thRight}>Visits</th>
                  <th style={thRight}>Bookings</th>
                  <th style={th}>Status</th>
                  {canPause && <th style={th}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.property_ref} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: PLUM, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.title}>
                        {row.title}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px', marginTop: '2px' }}>
                        {row.property_ref} · {row.location}{row.project && row.project !== row.location ? ` · ${row.project}` : ''}
                      </div>
                    </td>
                    <td style={td}>
                      <div style={{ color: PLUM }}>{row.property_type} · {row.listing_type}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px', marginTop: '2px' }}>
                        {aed(row.price_aed)}{row.availability ? ` · ${row.availability}` : ''}
                      </div>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{displayDate(row.published_at)}</td>
                    <td style={tdNum}>{num(row.metrics?.impressions ?? 0)}</td>
                    <td style={tdNum}>
                      <div style={{ fontWeight: 700, color: PLUM }}>{num(row.metrics?.views ?? 0)}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>{num(row.metrics?.unique_views ?? 0)} unique</div>
                    </td>
                    <td style={tdNum}>{num(row.metrics?.enquiries ?? 0)}</td>
                    <td style={tdNum}>{num(row.metrics?.whatsapp_clicks ?? 0)}</td>
                    <td style={tdNum}>{num(row.metrics?.site_visits ?? 0)}</td>
                    <td style={tdNum}>{num(row.metrics?.bookings ?? 0)}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '3px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 800,
                        background: row.is_active ? '#EAF3EC' : '#F3F0EA',
                        color: row.is_active ? '#2E7D4F' : '#7A6E5D',
                        border: `1px solid ${row.is_active ? '#CDE2D3' : BORDER}`,
                      }}>
                        {row.is_active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    {canPause && (
                      <td style={td}>
                        <button
                          type="button"
                          disabled={toggling === row.property_ref}
                          onClick={() => void toggleAd(row)}
                          title={row.is_active ? 'Pause advertisement' : 'Resume advertisement'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 9px', borderRadius: '6px', border: `1px solid ${BORDER}`, background: '#fff', color: PLUM, fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', opacity: toggling === row.property_ref ? 0.55 : 1 }}
                        >
                          {row.is_active ? <Pause size={12} /> : <Play size={12} />}
                          {row.is_active ? 'Pause' : 'Resume'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            <div>
              Page {data.page} of {data.pages} ({num(data.total)} total listings)
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '6px', border: `1px solid ${BORDER}`, background: '#fff', color: PLUM, fontSize: '12px', fontWeight: 600, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                type="button"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '6px', border: `1px solid ${BORDER}`, background: '#fff', color: PLUM, fontSize: '12px', fontWeight: 600, cursor: page >= data.pages ? 'not-allowed' : 'pointer', opacity: page >= data.pages ? 0.5 : 1 }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function AdAnalytics() {
  const { role } = useStaffRole()
  // Salesperson defaults to personal sales performance; admin/manager defaults to ad inventory
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory'>(
    role === 'salesperson' ? 'sales' : 'inventory'
  )

  return (
    <ErrorBoundary fallbackTitle="Performance & Analytics">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Navigation tabs for all roles */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: `1px solid ${BORDER}`, paddingBottom: '12px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              border: `1px solid ${activeTab === 'sales' ? PLUM : BORDER}`,
              background: activeTab === 'sales' ? PLUM : '#fff',
              color: activeTab === 'sales' ? '#fff' : PLUM,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <BarChart3 size={15} /> {role === 'salesperson' ? 'My Sales Performance' : 'Sales & Channel Performance'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              border: `1px solid ${activeTab === 'inventory' ? PLUM : BORDER}`,
              background: activeTab === 'inventory' ? PLUM : '#fff',
              color: activeTab === 'inventory' ? '#fff' : PLUM,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Megaphone size={15} /> Property Ad Campaigns
          </button>
        </div>

        {activeTab === 'sales' ? <SalespersonAnalyticsView /> : <AdInventoryView />}
      </div>
    </ErrorBoundary>
  )
}
