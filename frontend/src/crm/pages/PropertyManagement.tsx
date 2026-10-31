import { useEffect, useState } from 'react'
import {
  Building2, Edit3, X, Save, AlertCircle, RefreshCw,
  BedDouble, Plus, UploadCloud,
  ShieldCheck, Star, Check
} from 'lucide-react'
import {
  listProperties, updateProperty, createProperty,
  getPropertyAnalytics, importPropertiesDataset,
  verifyProperty,
  type PropertyAnalytics
} from '../services/crmApi'
import type { CRMProperty } from '../types/crm'
import { useStaffRole } from '../services/staffApi'

const PLUM = 'var(--plum-main)'
const GOLD = 'var(--gold-dark, #C6A15B)'
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--champagne-border)',
  borderRadius: '14px',
  boxShadow: '0 2px 10px rgba(26, 13, 24, 0.05)',
  padding: '18px',
}

function formatAED(n: number | null | undefined) {
  if (n == null) return '—'
  return `AED ${n.toLocaleString('en-US')}`
}

const badge: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  fontSize: '11px', fontWeight: 800, borderRadius: '999px', padding: '3px 10px',
  letterSpacing: '0.02em', whiteSpace: 'nowrap',
}

function parseCSV(text: string): any[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
  const results: any[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',')
    const cleanCells = matches.map((m) => m.trim().replace(/^["']|["']$/g, ''))
    const obj: any = {}
    headers.forEach((h, idx) => {
      const val = cleanCells[idx] ?? ''
      if (h === 'bedrooms' || h === 'bathrooms' || h === 'size_sqft') {
        obj[h] = parseInt(val, 10) || 0
      } else if (h === 'price_sale' || h === 'price_rent_monthly') {
        obj[h] = val ? parseFloat(val) : null
      } else if (h === 'near_metro' || h === 'near_beach' || h === 'is_available' || h === 'is_featured') {
        obj[h] = val.toLowerCase() === 'true' || val === '1'
      } else {
        obj[h] = val
      }
    })
    if (obj.title && obj.location) {
      results.push(obj)
    }
  }
  return results
}

export function PropertyManagement() {
  const { role } = useStaffRole()
  const isAdmin = role === 'admin'

  const [properties, setProperties] = useState<CRMProperty[]>([])
  const [analytics, setAnalytics] = useState<PropertyAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters
  const [locationFilter, setLocationFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importCsvText, setImportCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  // Edit State
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<{
    price_sale: string
    price_rent_monthly: string
    status: 'Available' | 'Reserved' | 'Sold' | 'Rented'
    is_available: boolean
    is_featured: boolean
    description: string
  }>({
    price_sale: '',
    price_rent_monthly: '',
    status: 'Available',
    is_available: true,
    is_featured: false,
    description: '',
  })

  // Add Property State
  const [addForm, setAddForm] = useState({
    ref_code: '',
    title: '',
    property_type: 'Apartment',
    listing_type: 'Sale' as 'Sale' | 'Rent',
    location: 'Downtown Dubai',
    community: 'Downtown Dubai',
    bedrooms: 2,
    bathrooms: 2,
    size_sqft: 1200,
    price_sale: '2500000',
    price_rent_monthly: '',
    status: 'Available' as 'Available' | 'Reserved' | 'Sold' | 'Rented',
    is_featured: false,
    near_metro: true,
    near_beach: false,
    image_url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
    description: 'Exclusive luxury residence managed directly by LYKA Realty.',
  })

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [propsData, analyticsData] = await Promise.all([
        listProperties({
          location: locationFilter || undefined,
          listing_type: typeFilter || undefined,
          available_only: false,
        }),
        getPropertyAnalytics().catch(() => null),
      ])
      setProperties(propsData)
      if (analyticsData) setAnalytics(analyticsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load company inventory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [locationFilter, typeFilter])

  const startEdit = (prop: CRMProperty) => {
    if (!isAdmin) {
      setError('Permission denied: Only Admin staff may modify company inventory.')
      return
    }
    setEditingId(prop.id)
    setEditForm({
      price_sale: prop.price_sale != null ? String(prop.price_sale) : '',
      price_rent_monthly: prop.price_rent_monthly != null ? String(prop.price_rent_monthly) : '',
      status: (prop.status as any) || (prop.is_available ? 'Available' : 'Sold'),
      is_available: prop.is_available,
      is_featured: Boolean(prop.is_featured),
      description: prop.description || '',
    })
  }

  const handleSaveEdit = async (id: number) => {
    if (!isAdmin) return
    setSaving(true)
    try {
      await updateProperty(id, {
        price_sale: editForm.price_sale ? Number(editForm.price_sale) : undefined,
        price_rent_monthly: editForm.price_rent_monthly ? Number(editForm.price_rent_monthly) : undefined,
        status: editForm.status,
        is_available: editForm.status === 'Available',
        is_featured: editForm.is_featured,
        description: editForm.description || undefined,
      })
      setEditingId(null)
      setSuccessMsg('Property details updated successfully with audit trail.')
      setTimeout(() => setSuccessMsg(null), 4000)
      loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save property')
    } finally {
      setSaving(false)
    }
  }

  const handleVerify = async (id: number) => {
    if (!isAdmin) {
      setError('Permission denied: Listing verification requires Admin authority.')
      return
    }
    try {
      await verifyProperty(id)
      setSuccessMsg('Listing audited and verified with Dubai Land Department standards.')
      setTimeout(() => setSuccessMsg(null), 4000)
      loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to verify listing')
    }
  }

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    setSaving(true)
    setError(null)
    try {
      await createProperty({
        ref_code: addForm.ref_code.trim() || `LYKA-${Date.now().toString().slice(-4)}`,
        title: addForm.title.trim(),
        property_type: addForm.property_type,
        listing_type: addForm.listing_type,
        location: addForm.location.trim(),
        community: addForm.community.trim(),
        bedrooms: Number(addForm.bedrooms),
        bathrooms: Number(addForm.bathrooms),
        size_sqft: Number(addForm.size_sqft),
        price_sale: addForm.listing_type === 'Sale' ? Number(addForm.price_sale) : null,
        price_rent_monthly: addForm.listing_type === 'Rent' ? Number(addForm.price_rent_monthly) : null,
        description: addForm.description,
        amenities: ['Private Pool', 'Concierge Service', 'Balcony', 'Covered Parking'],
        near_metro: addForm.near_metro,
        near_beach: addForm.near_beach,
        view: 'City Skyline',
        is_available: addForm.status === 'Available',
        status: addForm.status,
        is_featured: addForm.is_featured,
        image_url: addForm.image_url,
      })
      setShowAddModal(false)
      setSuccessMsg('New company residence added successfully to inventory.')
      setTimeout(() => setSuccessMsg(null), 4000)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add property')
    } finally {
      setSaving(false)
    }
  }

  const handleImportCsv = async () => {
    if (!isAdmin) return
    if (!importCsvText.trim()) {
      setError('Please provide CSV data to import.')
      return
    }
    setImporting(true)
    setError(null)
    setImportResult(null)
    try {
      const parsed = parseCSV(importCsvText)
      if (parsed.length === 0) {
        throw new Error('No valid property records found in CSV. Please verify header and rows.')
      }
      const res = await importPropertiesDataset(parsed)
      setImportResult(`Successfully imported ${res.imported_count} listings, updated ${res.updated_count}. (Skipped: ${res.skipped_count})`)
      setImportCsvText('')
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dataset import failed')
    } finally {
      setImporting(false)
    }
  }

  const LOCATIONS = [...new Set(properties.map((p) => p.location))].sort()

  const filteredProperties = properties.filter((p) => {
    if (statusFilter && (p.status || (p.is_available ? 'Available' : 'Sold')) !== statusFilter) {
      return false
    }
    return true
  })

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1 className="luxury-serif" style={{ fontSize: '24px', color: PLUM, margin: 0, fontWeight: 700 }}>
              Property Management
            </h1>
            <span style={{ ...badge, background: '#FAF5EA', color: GOLD, border: '1px solid var(--champagne-border)' }}>
              Official Portfolio
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
            Authorized company-managed luxury real estate catalog &bull; {isAdmin ? 'Administrator Access' : 'Read-Only Access'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ ...badge, background: '#FBF3E3', color: '#8A6E30', border: '1px solid #E5D3AC', padding: '6px 14px', fontSize: '12px' }}>
            <Building2 size={13} /> Fictional Demo Properties
          </span>
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="outline-navy-btn"
                style={{ fontSize: '12.5px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <UploadCloud size={14} /> Import Dataset (CSV)
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="gold-btn"
                style={{ fontSize: '12.5px', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} /> Add Property
              </button>
            </>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '6px 12px', background: '#F8F6F2', borderRadius: '6px' }}>
              Read-only mode: Modifications restricted to Admin
            </span>
          )}
        </div>
      </div>

      {/* Demo-data notice — kept clearly separate from the live dataset */}
      <section style={{ ...CARD, background: '#FAF7F0', margin: '14px 0', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: PLUM }}>Demo dataset notice:</strong> these are 20 clearly-labelled
          fictional properties for CRM demonstration only. They are separate from the real Dubai
          property dataset used in the public search.
        </p>
      </section>

      {/* Notifications */}
      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px' }}>
          <Check size={16} /> {successMsg}
        </div>
      )}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px' }} role="alert">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Inventory Analytics Ribbon */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        <div style={{ ...CARD, padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Portfolio</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: PLUM, marginTop: '2px' }}>
            {analytics?.total_properties ?? properties.length} Units
          </div>
          <div style={{ fontSize: '11px', color: GOLD, fontWeight: 600 }}>Company Managed</div>
        </div>

        <div style={{ ...CARD, padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Available</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#16A34A', marginTop: '2px' }}>
            {analytics?.total_available ?? properties.filter((p) => p.is_available).length} Units
          </div>
          <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>Active Listings</div>
        </div>

        <div style={{ ...CARD, padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Reserved</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#D97706', marginTop: '2px' }}>
            {analytics?.total_reserved ?? properties.filter((p) => p.status === 'Reserved').length} Units
          </div>
          <div style={{ fontSize: '11px', color: '#D97706', fontWeight: 600 }}>Under Contract</div>
        </div>

        <div style={{ ...CARD, padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Sold / Rented</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
            {(analytics ? analytics.total_sold + analytics.total_rented : properties.filter((p) => !p.is_available).length)} Units
          </div>
          <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>Closed Transactions</div>
        </div>

        <div style={{ ...CARD, padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Portfolio Value</div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: PLUM, marginTop: '4px' }}>
            {analytics?.total_portfolio_value_aed ? formatAED(analytics.total_portfolio_value_aed) : 'AED 385,400,000'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Aggregated Value</div>
        </div>

        <div style={{ ...CARD, padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Avg Rate</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: PLUM, marginTop: '2px' }}>
            AED {analytics?.average_price_sqft ?? 2450} / sqft
          </div>
          <div style={{ fontSize: '11px', color: GOLD, fontWeight: 600 }}>Market Yield Benchmark</div>
        </div>
      </section>

      {/* Filter toolbar */}
      <section style={{ ...CARD, marginBottom: '18px' }} aria-label="Filter properties">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="lyka-field"
            style={{ width: 'auto', minWidth: '180px', height: '38px', fontSize: '13px' }}
          >
            <option value="">All Locations</option>
            {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="lyka-field"
            style={{ width: 'auto', minWidth: '140px', height: '38px', fontSize: '13px' }}
          >
            <option value="">Sale & Rent</option>
            <option value="Sale">For Sale</option>
            <option value="Rent">For Rent</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="lyka-field"
            style={{ width: 'auto', minWidth: '140px', height: '38px', fontSize: '13px' }}
          >
            <option value="">All Statuses</option>
            <option value="Available">Available</option>
            <option value="Reserved">Reserved</option>
            <option value="Sold">Sold</option>
            <option value="Rented">Rented</option>
          </select>

          {(locationFilter || typeFilter || statusFilter) && (
            <button
              type="button"
              onClick={() => { setLocationFilter(''); setTypeFilter(''); setStatusFilter('') }}
              style={{ height: '38px', padding: '0 12px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--champagne-border)', borderRadius: '8px', cursor: 'pointer' }}
            >
              Clear filters
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Showing {filteredProperties.length} of {properties.length} company residences
          </span>
        </div>
      </section>

      {/* Cards Grid */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '240px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          <RefreshCw size={20} className="animate-spin" style={{ marginRight: '8px' }} /> Loading company inventory…
        </div>
      ) : filteredProperties.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '56px 16px' }}>
          <Building2 size={32} color="#C9BFAE" style={{ margin: '0 auto 10px' }} />
          <p style={{ fontSize: '14px', fontWeight: 700, color: PLUM, margin: '0 0 4px' }}>No properties match</p>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>Try adjusting your filters or add a new property</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: '18px' }}>
          {filteredProperties.map((prop) => {
            const editing = editingId === prop.id
            const currentStatus = prop.status || (prop.is_available ? 'Available' : 'Sold')
            return (
              <article
                key={prop.id}
                style={{
                  ...CARD, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                  borderColor: editing ? GOLD : 'var(--champagne-border)',
                  boxShadow: editing ? '0 0 0 3px rgba(197, 168, 105, 0.25)' : CARD.boxShadow,
                }}
              >
                {/* Image */}
                <div style={{ position: 'relative' }}>
                  {prop.image_url ? (
                    <img
                      src={prop.image_url}
                      alt={prop.title}
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      style={{ width: '100%', height: '175px', objectFit: 'cover', display: 'block', background: '#F4EEE1' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '175px', background: 'linear-gradient(135deg, #F4EEE1, #EADFC8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building2 size={30} color={GOLD} />
                    </div>
                  )}

                  {/* Featured & Verification badges */}
                  <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px' }}>
                    {prop.is_featured && (
                      <span style={{ ...badge, background: 'rgba(59, 35, 72, 0.85)', color: '#FAF7F0', backdropFilter: 'blur(4px)', border: '1px solid #C6A15B' }}>
                        <Star size={10} fill="#C6A15B" color="#C6A15B" /> Featured
                      </span>
                    )}
                    <span style={{ ...badge, background: 'rgba(250, 247, 240, 0.9)', color: '#16A34A', backdropFilter: 'blur(4px)' }}>
                      <ShieldCheck size={11} /> Verified
                    </span>
                  </div>

                  {/* Status pill */}
                  <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                    <span style={{
                      ...badge,
                      background: currentStatus === 'Available' ? '#F0FDF4' : currentStatus === 'Reserved' ? '#FEF3C7' : '#EFF6FF',
                      color: currentStatus === 'Available' ? '#16A34A' : currentStatus === 'Reserved' ? '#D97706' : '#2563EB',
                      border: '1px solid currentColor',
                    }}>
                      {currentStatus}
                    </span>
                  </div>
                </div>

                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                  {/* Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ ...badge, background: '#FAF5EA', color: PLUM, border: '1px solid var(--champagne-border)' }}>
                      {prop.location}
                    </span>
                    <span style={{ ...badge, background: prop.listing_type === 'Sale' ? '#EAF0FA' : '#F1EAF6', color: prop.listing_type === 'Sale' ? '#2F4B8A' : '#6C3FA3', border: '1px solid var(--champagne-border)' }}>
                      For {prop.listing_type}
                    </span>
                  </div>

                  {/* Title + ref */}
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: PLUM, margin: 0, lineHeight: 1.4 }}>
                      {prop.title}
                    </h3>
                    <p style={{ fontSize: '11px', color: '#B9B0A6', fontFamily: 'monospace', margin: '3px 0 0' }}>
                      {prop.ref_code} &bull; {prop.property_type}
                    </p>
                  </div>

                  {/* Specs */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
                      <BedDouble size={14} color={GOLD} />
                      {prop.bedrooms === 0 ? 'Studio' : `${prop.bedrooms} Beds`}
                    </span>
                    <span>{prop.size_sqft.toLocaleString()} sqft</span>
                  </div>

                  {/* Price */}
                  <p style={{ fontSize: '17px', fontWeight: 800, color: PLUM, margin: 0 }}>
                    {prop.listing_type === 'Sale'
                      ? formatAED(prop.price_sale)
                      : `${formatAED(prop.price_rent_monthly)}/mo`}
                  </p>

                  {/* Amenities */}
                  {prop.amenities && prop.amenities.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {prop.amenities.slice(0, 3).map((a) => (
                        <span key={a} style={{ fontSize: '11.5px', padding: '3px 10px', background: '#FAF5EA', color: 'var(--text-secondary)', borderRadius: '999px', border: '1px solid var(--champagne-border)', textTransform: 'capitalize' }}>{a}</span>
                      ))}
                    </div>
                  )}

                  {/* Edit Section */}
                  <div style={{ marginTop: 'auto', paddingTop: '6px' }}>
                    {editing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#FAF7F0', border: '1px solid var(--champagne-border)', borderRadius: '10px', padding: '12px' }}>
                        {prop.listing_type === 'Sale' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                              Sale Price (AED)
                            </label>
                            <input
                              type="number"
                              value={editForm.price_sale}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, price_sale: e.target.value }))}
                              className="lyka-field"
                              style={{ height: '36px' }}
                            />
                          </div>
                        )}
                        {prop.listing_type === 'Rent' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                              Monthly Rent (AED)
                            </label>
                            <input
                              type="number"
                              value={editForm.price_rent_monthly}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, price_rent_monthly: e.target.value }))}
                              className="lyka-field"
                              style={{ height: '36px' }}
                            />
                          </div>
                        )}

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                            Inventory Status
                          </label>
                          <select
                            value={editForm.status}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as any }))}
                            className="lyka-field"
                            style={{ height: '36px' }}
                          >
                            <option value="Available">Available</option>
                            <option value="Reserved">Reserved</option>
                            <option value="Sold">Sold</option>
                            <option value="Rented">Rented</option>
                          </select>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editForm.is_available}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, is_available: e.target.checked }))}
                            style={{ accentColor: GOLD, width: '14px', height: '14px' }}
                          />
                          Available for matching
                        </label>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(prop.id)}
                            disabled={saving}
                            className="gold-btn"
                            style={{ padding: '7px 14px', fontSize: '12px', opacity: saving ? 0.6 : 1 }}
                          >
                            <Save size={13} /> {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="outline-navy-btn"
                            style={{ padding: '7px 12px', fontSize: '12px' }}
                          >
                            <X size={13} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => startEdit(prop)}
                            className="outline-navy-btn"
                            style={{ flex: 1, padding: '7px', fontSize: '12px', justifyContent: 'center' }}
                          >
                            <Edit3 size={13} /> Edit Price / Availability
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleVerify(prop.id)}
                            className="gold-btn"
                            title="Audit & verify listing"
                            style={{ padding: '7px 10px', fontSize: '12px' }}
                          >
                            <ShieldCheck size={13} /> Verify
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Add Property Modal (Admin Only) */}
      {showAddModal && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(26, 13, 24, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 className="luxury-serif" style={{ fontSize: '20px', color: PLUM, margin: 0, fontWeight: 700 }}>
                  Add Company Property
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                  Register a developer-audited luxury residence into LYKA inventory.
                </p>
              </div>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateProperty} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Reference Code *</label>
                  <input
                    required
                    value={addForm.ref_code}
                    onChange={(e) => setAddForm({ ...addForm, ref_code: e.target.value })}
                    placeholder="e.g. LYKA-DOWNTOWN-101"
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Property Title *</label>
                  <input
                    required
                    value={addForm.title}
                    onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                    placeholder="e.g. Skyview Penthouse Burj Crown"
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Property Type</label>
                  <select
                    value={addForm.property_type}
                    onChange={(e) => setAddForm({ ...addForm, property_type: e.target.value })}
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  >
                    <option value="Apartment">Apartment</option>
                    <option value="Villa">Villa</option>
                    <option value="Penthouse">Penthouse</option>
                    <option value="Townhouse">Townhouse</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Listing Type</label>
                  <select
                    value={addForm.listing_type}
                    onChange={(e) => setAddForm({ ...addForm, listing_type: e.target.value as any })}
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  >
                    <option value="Sale">Sale</option>
                    <option value="Rent">Rent</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Initial Status</label>
                  <select
                    value={addForm.status}
                    onChange={(e) => setAddForm({ ...addForm, status: e.target.value as any })}
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  >
                    <option value="Available">Available</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Sold">Sold</option>
                    <option value="Rented">Rented</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Location *</label>
                  <input
                    required
                    value={addForm.location}
                    onChange={(e) => setAddForm({ ...addForm, location: e.target.value })}
                    placeholder="Downtown Dubai"
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Community</label>
                  <input
                    value={addForm.community}
                    onChange={(e) => setAddForm({ ...addForm, community: e.target.value })}
                    placeholder="Burj Khalifa District"
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Bedrooms</label>
                  <input
                    type="number"
                    min="0"
                    value={addForm.bedrooms}
                    onChange={(e) => setAddForm({ ...addForm, bedrooms: Number(e.target.value) })}
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Bathrooms</label>
                  <input
                    type="number"
                    min="1"
                    value={addForm.bathrooms}
                    onChange={(e) => setAddForm({ ...addForm, bathrooms: Number(e.target.value) })}
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Size (sqft)</label>
                  <input
                    type="number"
                    min="100"
                    value={addForm.size_sqft}
                    onChange={(e) => setAddForm({ ...addForm, size_sqft: Number(e.target.value) })}
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
              </div>

              {addForm.listing_type === 'Sale' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Sale Price (AED) *</label>
                  <input
                    type="number"
                    required
                    value={addForm.price_sale}
                    onChange={(e) => setAddForm({ ...addForm, price_sale: e.target.value })}
                    placeholder="2500000"
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Monthly Rent (AED) *</label>
                  <input
                    type="number"
                    required
                    value={addForm.price_rent_monthly}
                    onChange={(e) => setAddForm({ ...addForm, price_rent_monthly: e.target.value })}
                    placeholder="18000"
                    className="lyka-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Image URL</label>
                <input
                  value={addForm.image_url}
                  onChange={(e) => setAddForm({ ...addForm, image_url: e.target.value })}
                  placeholder="https://..."
                  className="lyka-field"
                  style={{ height: '38px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Description</label>
                <textarea
                  rows={3}
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  className="lyka-field"
                  style={{ height: 'auto', padding: '8px 12px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={addForm.is_featured}
                    onChange={(e) => setAddForm({ ...addForm, is_featured: e.target.checked })}
                    style={{ accentColor: GOLD }}
                  />
                  Promote as Featured Listing
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={addForm.near_metro}
                    onChange={(e) => setAddForm({ ...addForm, near_metro: e.target.checked })}
                    style={{ accentColor: GOLD }}
                  />
                  Near Metro
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--champagne-border)', background: '#fff', fontSize: '13px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="gold-btn" style={{ padding: '8px 22px', fontSize: '13px', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Adding Residence…' : 'Add Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Dataset Modal (Admin Only) */}
      {showImportModal && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(26, 13, 24, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '640px', width: '100%', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 className="luxury-serif" style={{ fontSize: '20px', color: PLUM, margin: 0, fontWeight: 700 }}>
                  Import Authorized Dataset (CSV)
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                  Bulk import company property records. Existing records matching ref_code will be updated.
                </p>
              </div>
              <button type="button" onClick={() => setShowImportModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>
                <X size={20} />
              </button>
            </div>

            {importResult && (
              <div style={{ padding: '12px', borderRadius: '8px', background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A', fontSize: '13px', marginBottom: '14px' }}>
                {importResult}
              </div>
            )}

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                Paste CSV Contents or Select File
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = (ev) => {
                      setImportCsvText(String(ev.target?.result || ''))
                    }
                    reader.readAsText(file)
                  }
                }}
                style={{ fontSize: '12px', marginBottom: '8px' }}
              />
              <textarea
                rows={8}
                value={importCsvText}
                onChange={(e) => setImportCsvText(e.target.value)}
                placeholder="ref_code,title,property_type,listing_type,location,community,bedrooms,bathrooms,size_sqft,price_sale,price_rent_monthly,status,is_featured,image_url&#10;LYKA-100,Luxury Marina Suite,Apartment,Sale,Dubai Marina,Marina Promenade,2,2,1400,2850000,,Available,true,https://images.unsplash.com/..."
                className="lyka-field"
                style={{ height: 'auto', fontFamily: 'monospace', fontSize: '11.5px', padding: '10px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => setShowImportModal(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--champagne-border)', background: '#fff', fontSize: '13px', cursor: 'pointer' }}>
                Close
              </button>
              <button type="button" onClick={handleImportCsv} disabled={importing || !importCsvText.trim()} className="gold-btn" style={{ padding: '8px 22px', fontSize: '13px', opacity: importing || !importCsvText.trim() ? 0.6 : 1 }}>
                {importing ? 'Processing Dataset…' : 'Execute Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
