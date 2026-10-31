import { useState, useEffect } from 'react'
import {
  ArrowLeft, Phone, MessageSquare, MapPin, Clock, Check,
  Tag, History, Building2, AlertCircle, RefreshCw, Eye
} from 'lucide-react'
import {
  getInquiries, markInquiryContacted, ownerKeyFor, type InquiryDoc
} from '../../services/chatStore'
import { refreshInquiriesFromCloud } from '../../services/rtdb'
import { fetchPropertiesFromApi } from '../../services/api'

interface LykaRecordsPanelProps {
  onBackToChat: () => void
  onViewPropertyById: (propertyId: string) => void
  /** Bump to reload the inquiry list after a new enquiry is logged. */
  refreshKey: number
  /** Which tab to show when the panel mounts. */
  initialTab?: RecordsTab
  /**
   * Owner namespace for inquiries. The panel shows ONLY this owner's
   * inquiries — never another user's, never legacy anonymous rows.
   */
  ownerUid: string | null
}

export type RecordsTab = 'inquiries' | 'history'

export const LYKA_PHONE_DISPLAY = '+971 4 800 LYKA'
export const LYKA_PHONE_TEL = 'tel:+97148005952'
export const LYKA_WHATSAPP = 'https://wa.me/97148005952'

function inquiryWhatsAppLink(q: InquiryDoc): string {
  const msg = `Hello Lyka Realty, I submitted an inquiry via LYKA AI chat and would like to discuss ${q.propertyTitle} (Ref: ${q.propertyId}).`
  return `${LYKA_WHATSAPP}?text=${encodeURIComponent(msg)}`
}

interface MarketCounts {
  total: number
  ready: number
  offPlan: number
}

/**
 * LYKA AI chatbot — inquiries submitted through the chat + honest market
 * history. Every figure comes from real records:
 * - Inquiries: logged locally when the user taps "Enquire" on a property card.
 * - Market counts: fetched live from /api/properties/search.
 * - Sold / Rented / Reserved are shown ONLY when confirmed by actual records.
 *   The current dataset carries no transaction records, so those stay at zero
 *   with the missing fields listed instead of invented.
 */
export function LykaRecordsPanel({ onBackToChat, onViewPropertyById, refreshKey, initialTab = 'inquiries', ownerUid }: LykaRecordsPanelProps) {
  const [tab, setTab] = useState<RecordsTab>(initialTab)
  const owner = ownerKeyFor(ownerUid)
  const [inquiries, setInquiries] = useState<InquiryDoc[]>(() => getInquiries(owner))
  const [counts, setCounts] = useState<MarketCounts | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)
  const [countsError, setCountsError] = useState<string | null>(null)

  useEffect(() => {
    setInquiries(getInquiries(owner))
  }, [refreshKey, owner])

  // When signed in, pull the latest cloud inquiries into the local cache.
  // Re-runs when the viewing owner changes so a new account never sees
  // the previous account's list.
  useEffect(() => {
    const uid = ownerUid
    if (!uid) {
      setInquiries(getInquiries(owner))
      return
    }
    let cancelled = false
    refreshInquiriesFromCloud(uid)
      .then((merged) => {
        if (!cancelled) setInquiries(merged)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshKey, owner, ownerUid])

  const loadCounts = async () => {
    setCountsLoading(true)
    setCountsError(null)
    try {
      const [totalRes, readyRes, offPlanRes] = await Promise.all([
        fetchPropertiesFromApi({ limit: 1 }),
        fetchPropertiesFromApi({ availability: 'Ready', limit: 1 }),
        fetchPropertiesFromApi({ availability: 'off-plan', limit: 1 })
      ])
      setCounts({
        total: totalRes.total_found ?? 0,
        ready: readyRes.total_found ?? 0,
        offPlan: offPlanRes.total_found ?? 0
      })
    } catch (err) {
      setCountsError(err instanceof Error ? err.message : 'Could not load market figures.')
    } finally {
      setCountsLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'history' && counts === null && !countsLoading && !countsError) {
      loadCounts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleContacted = (id: string) => {
    markInquiryContacted(id, owner)
    setInquiries(getInquiries(owner))
  }

  return (
    <div className="lyka-chat-records">
      <button type="button" className="lyka-chat-link-btn" onClick={onBackToChat}>
        <ArrowLeft size={13} /> Back to chat
      </button>

      <div className="lyka-chat-records-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'inquiries'}
          className={tab === 'inquiries' ? 'active' : ''}
          onClick={() => setTab('inquiries')}
        >
          <Tag size={13} /> My Inquiries{inquiries.length > 0 ? ` (${inquiries.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={tab === 'history' ? 'active' : ''}
          onClick={() => setTab('history')}
        >
          <History size={13} /> Market History
        </button>
      </div>

      {tab === 'inquiries' ? (
        inquiries.length === 0 ? (
          <div className="lyka-chat-records-empty">
            <Tag size={26} color="#B06B80" style={{ margin: '0 auto 8px' }} />
            <h4>No inquiries yet</h4>
            <p>
              When you tap <strong>Enquire</strong> on any property card in the chat,
              it will appear here with its status and direct contact options.
            </p>
            <button type="button" className="lyka-chat-primary-btn inline" onClick={onBackToChat}>
              Browse properties in chat
            </button>
          </div>
        ) : (
          <div className="lyka-chat-inquiry-list">
            {inquiries.map((q) => (
              <div key={q._id} className="lyka-chat-inquiry-card">
                <div className="lyka-chat-inquiry-top">
                  <span className={`lyka-chat-status-chip ${q.status === 'Contacted' ? 'done' : 'new'}`}>
                    {q.status === 'Contacted' ? <Check size={11} /> : <Clock size={11} />}
                    {q.status}
                  </span>
                  <span className="lyka-chat-inquiry-date">
                    {new Date(q.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <h5>{q.propertyTitle}</h5>
                <div className="lyka-chat-inquiry-meta">
                  <span><MapPin size={12} /> {q.propertyLocation}</span>
                  <span><Building2 size={12} /> {q.bedrooms === 0 ? 'Studio' : `${q.bedrooms} BHK`} · {q.propertyType}</span>
                </div>
                <div className="lyka-chat-inquiry-price">
                  AED {q.priceAed.toLocaleString('en-US')}
                  <span> · For {q.listingType} · Ref {q.propertyId}</span>
                </div>
                <div className="lyka-chat-prop-actions">
                  <button
                    type="button"
                    className="lyka-chat-prop-btn ghost"
                    onClick={() => onViewPropertyById(q.propertyId)}
                  >
                    <Eye size={13} /> Details
                  </button>
                  <a
                    href={inquiryWhatsAppLink(q)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lyka-chat-prop-btn ghost"
                    onClick={() => handleContacted(q._id)}
                  >
                    <MessageSquare size={13} /> WhatsApp
                  </a>
                  <a
                    href={LYKA_PHONE_TEL}
                    className="lyka-chat-prop-btn primary"
                    onClick={() => handleContacted(q._id)}
                  >
                    <Phone size={13} /> {LYKA_PHONE_DISPLAY}
                  </a>
                </div>
              </div>
            ))}
            <p className="lyka-chat-auth-note">
              Stored on this device until the agency backend is connected. Tapping WhatsApp or Call marks the inquiry as Contacted.
            </p>
          </div>
        )
      ) : (
        <div className="lyka-chat-history-wrap">
          {countsLoading ? (
            <div className="lyka-chat-records-empty">
              <RefreshCw size={22} color="#C5A869" className="lyka-chat-spin" />
              <p>Loading live market figures from the dataset…</p>
            </div>
          ) : countsError ? (
            <div className="lyka-chat-error-banner" role="alert">
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{countsError}</span>
              <button type="button" className="lyka-chat-retry-btn" onClick={loadCounts}>
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          ) : counts ? (
            <>
              <div className="lyka-chat-history-grid">
                <div className="lyka-chat-history-stat">
                  <span className="num">{counts.total.toLocaleString()}</span>
                  <span className="lbl">Active listings</span>
                </div>
                <div className="lyka-chat-history-stat">
                  <span className="num">{counts.ready.toLocaleString()}</span>
                  <span className="lbl">Available · Ready</span>
                </div>
                <div className="lyka-chat-history-stat">
                  <span className="num">{counts.offPlan.toLocaleString()}</span>
                  <span className="lbl">Available · Off-plan</span>
                </div>
              </div>

              <div className="lyka-chat-history-card">
                <h5>Confirmed transactions</h5>
                <div className="lyka-chat-history-txn">
                  <span><strong>0</strong> Sold</span>
                  <span><strong>0</strong> Rented</span>
                  <span><strong>0</strong> Reserved</span>
                </div>
                <p>
                  “SOLD” and “RENTED” badges appear only when confirmed by actual
                  transaction records. The current dataset contains active listings
                  only — no sold, rented, or reserved records — so nothing is shown
                  as sold here.
                </p>
              </div>

              <div className="lyka-chat-history-card">
                <h5>To enable full history, the dataset needs</h5>
                <ul>
                  <li><code>status</code> — Available / Reserved / Sold / Rented per property</li>
                  <li><code>transaction_date</code> — when the deal closed</li>
                  <li><code>transaction_price_aed</code> — final agreed price</li>
                  <li><code>transaction_type</code> — sale handover or lease start</li>
                </ul>
                <p>
                  Your own chatbot inquiries above are real and always visible —
                  company-wide history will unlock once these fields exist.
                </p>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
