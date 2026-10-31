import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Send, AlertCircle, Loader2, ChevronRight, Lightbulb } from 'lucide-react'
import { analyseEnquiry, createLead } from '../services/crmApi'
import type { AnalyseResponse } from '../types/crm'

const PLUM = 'var(--plum-main)'
const GOLD = 'var(--gold-dark)'
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--champagne-border)',
  borderRadius: '14px',
  boxShadow: '0 2px 10px rgba(26, 13, 24, 0.05)',
  padding: '22px',
}
const H2: React.CSSProperties = {
  fontSize: '15px', fontWeight: 800, color: PLUM, margin: '0 0 14px',
  display: 'flex', alignItems: 'center', gap: '8px',
}

const SAMPLE_ENQUIRIES = [
  "Hi, I'm Ahmed Al-Rashid, my email is ahmed@gmail.com. I'm looking to buy a 2-bedroom apartment in Dubai Marina with a sea view. My budget is around AED 2 million. I need a pool and gym. I want to move in within the next 2 months.",
  "My name is Sarah Johnson (sarah.j@email.com, +971 50 123 4567). Looking to rent a 3-bedroom villa in Dubai Hills Estate for my family. Budget AED 25,000-35,000/month. Need a private garden and maid's room. We'd like to move in next month.",
  "Looking for an apartment to buy in Business Bay or Downtown. Budget flexible, around 1-3 million AED. Investment purpose. Need something with good rental yield.",
  "I want to rent a studio in JVC. Budget is max 6000 per month. Need parking.",
]

const SCORE_TINT: Record<string, { bg: string; fg: string; border: string }> = {
  High: { bg: '#F7E8E4', fg: '#9C4A3C', border: '#EBCDC4' },
  Medium: { bg: '#FBF3E3', fg: '#8A6E30', border: '#E5D3AC' },
  Low: { bg: '#EAF3EC', fg: '#2E7D4F', border: '#CBE3D2' },
}

const ScoreBadge = ({ label, score, band, confidence }: { label: string; score: number; band?: string; confidence?: number | null }) => {
  const tint = SCORE_TINT[label] ?? SCORE_TINT.Low
  const bandText = band || (label === 'High' ? 'Hot' : label === 'Medium' ? 'Warm' : 'Cold')
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 14px', borderRadius: '999px',
      fontSize: '13px', fontWeight: 800,
      background: tint.bg, color: tint.fg, border: `1px solid ${tint.border}`,
    }}>
      {label} ({bandText}) · {score}/100{confidence != null ? ` · ${Math.round(confidence * 100)}% conf` : ''}
    </span>
  )
}

const REQ_LABEL: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--text-secondary)',
  minWidth: '110px', flexShrink: 0,
}

export function NewEnquiry() {
  const navigate = useNavigate()
  const [enquiry, setEnquiry] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyseResponse | null>(null)

  const handleAnalyse = async () => {
    if (enquiry.trim().length < 10) {
      setError('Please enter at least 10 characters describing the customer requirement.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await analyseEnquiry(enquiry)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI analysis failed. Check backend connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveLead = async () => {
    if (!result) return
    setSaving(true)
    setError(null)
    try {
      const lead = await createLead({
        raw_enquiry_text: enquiry,
        customer_name: result.requirements.customer_name ?? undefined,
        contact_email: result.requirements.contact_email ?? undefined,
        contact_phone: result.requirements.contact_phone ?? undefined,
        lead_type: result.requirements.lead_type ?? undefined,
        property_type: result.requirements.property_type ?? undefined,
        location: result.requirements.location ?? undefined,
        bedrooms: result.requirements.bedrooms ?? undefined,
        budget_min: result.requirements.budget_min ?? undefined,
        budget_max: result.requirements.budget_max ?? undefined,
        purpose: result.requirements.purpose ?? undefined,
        amenities: result.requirements.amenities,
        timeline_days: result.requirements.timeline_days ?? undefined,
        missing_fields: result.requirements.missing_fields,
        priority_score: result.score.total,
        priority_label: result.score.label,
        score_breakdown: result.score as unknown as Record<string, unknown>,
      })
      navigate(`/crm/leads/${lead.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save lead.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
        <div style={{
          width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
          background: 'linear-gradient(135deg, #2A1420 0%, #4A1F2E 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={20} color="#D8BD80" />
        </div>
        <div>
          <h1 className="luxury-serif" style={{ fontSize: '22px', color: PLUM, margin: 0 }}>
            New Customer Enquiry
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12.5px', margin: '2px 0 0' }}>
            Paste the customer&apos;s message — AI will extract requirements and score the lead
          </p>
        </div>
      </div>

      {/* Enquiry Form */}
      <section style={{ ...CARD, marginBottom: '14px' }}>
        <label htmlFor="lyka-enquiry-text" style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: PLUM, marginBottom: '4px' }}>
          Customer Enquiry Text
        </label>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Email, WhatsApp, phone note, or form submission — any format works.
        </p>
        <textarea
          id="lyka-enquiry-text"
          value={enquiry}
          onChange={e => setEnquiry(e.target.value)}
          placeholder="Paste or type the customer's enquiry here…"
          rows={6}
          className="lyka-field"
          style={{ resize: 'vertical', minHeight: '130px', lineHeight: 1.6 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {enquiry.length} characters · minimum 10 to analyse
          </span>
          <button
            type="button"
            onClick={handleAnalyse}
            disabled={loading || enquiry.trim().length < 10}
            className="gold-btn"
            style={{ padding: '10px 22px', fontSize: '13px', opacity: loading || enquiry.trim().length < 10 ? 0.55 : 1 }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? 'Analysing…' : 'Analyse with AI'}
          </button>
        </div>
      </section>

      {/* Sample enquiries */}
      {!result && !loading && (
        <section style={{ ...CARD, background: '#FAF7F0', marginBottom: '14px' }}>
          <p style={{ fontSize: '13.5px', fontWeight: 800, color: PLUM, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Lightbulb size={15} color={GOLD} /> Try a sample enquiry
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            {SAMPLE_ENQUIRIES.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setEnquiry(s)}
                style={{
                  textAlign: 'left', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--text-secondary)',
                  background: '#fff', border: '1px solid var(--champagne-border)', borderRadius: '10px',
                  padding: '12px 14px', cursor: 'pointer',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                {s.slice(0, 100)}…
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#FDF1F1', border: '1px solid #E8A0A0', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px' }} role="alert">
          <AlertCircle size={18} color="#9C4A3C" style={{ flexShrink: 0, marginTop: '1px' }} />
          <p style={{ fontSize: '13.5px', color: '#8C2F2F', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Analysis Results */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Score banner */}
          <section style={{
            borderRadius: '14px', padding: '24px', color: '#FBF6EC',
            background: 'linear-gradient(135deg, #2A1420 0%, #4A1F2E 100%)',
            border: '1px solid #4A1F2E',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#D8BD80', margin: '0 0 6px' }}>
                AI Lead Score
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '46px', fontWeight: 800, lineHeight: 1 }}>{result.score.total}</span>
                <span style={{ color: '#C9A86A', fontSize: '15px' }}>/100</span>
              </div>
              <div style={{ marginTop: '10px' }}>
                <ScoreBadge
                  label={result.score.label}
                  score={result.score.total}
                  band={result.score.band}
                  confidence={result.score.confidence}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(70px, 1fr))', gap: '14px 20px', textAlign: 'center' }}>
              {[
                { k: 'Budget', v: result.score.budget },
                { k: 'Location', v: result.score.location },
                { k: 'Intent', v: result.score.intent },
                { k: 'Type/Beds', v: result.score.property_type_bedrooms },
                { k: 'Timeline', v: result.score.timeline },
                { k: 'Prefs', v: result.score.preferences },
              ].map(({ k, v }) => (
                <div key={k}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>{v}</div>
                  <div style={{ fontSize: '11px', color: '#D8BD80' }}>{k}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Score Breakdown */}
          <section style={CARD}>
            <h2 style={H2}>Score Breakdown & Reasoning</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {result.score.reasoning.map((r, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '13px', borderRadius: '8px', padding: '8px 12px', lineHeight: 1.5,
                    ...(r.startsWith('✅')
                      ? { background: '#EFF5F0', color: '#2E7D4F' }
                      : r.startsWith('⚠️')
                        ? { background: '#FBF3E3', color: '#8A6E30' }
                        : { background: '#FDF1F1', color: '#9C4A3C' }),
                  }}
                >
                  {r}
                </div>
              ))}
            </div>
          </section>

          {/* Extracted Requirements */}
          <section style={CARD}>
            <h2 style={H2}>Extracted Requirements</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px 20px' }}>
              {[
                { label: 'Customer Name', value: result.requirements.customer_name },
                { label: 'Email', value: result.requirements.contact_email },
                { label: 'Phone', value: result.requirements.contact_phone },
                { label: 'Intent', value: result.requirements.lead_type ? (result.requirements.lead_type === 'buyer' ? 'Buy' : 'Rent') : null },
                { label: 'Property Type', value: result.requirements.property_type },
                { label: 'Location', value: result.requirements.location },
                { label: 'Bedrooms', value: result.requirements.bedrooms !== null ? `${result.requirements.bedrooms} bed${result.requirements.bedrooms !== 1 ? 's' : ''}` : null },
                { label: 'Budget Min', value: result.requirements.budget_min ? `AED ${result.requirements.budget_min.toLocaleString('en-US')}` : null },
                { label: 'Budget Max', value: result.requirements.budget_max ? `AED ${result.requirements.budget_max.toLocaleString('en-US')}` : null },
                { label: 'Purpose', value: result.requirements.purpose },
                { label: 'Timeline', value: result.requirements.timeline_days ? `${result.requirements.timeline_days} days` : null },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
                  <span style={REQ_LABEL}>{label}</span>
                  {value ? (
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: PLUM, overflowWrap: 'anywhere' }}>{value}</span>
                  ) : (
                    <span style={{ fontSize: '12.5px', color: '#B9B0A6', fontStyle: 'italic' }}>Not provided</span>
                  )}
                </div>
              ))}
            </div>
            {result.requirements.amenities.length > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--champagne-border)' }}>
                <span style={{ ...REQ_LABEL, display: 'block', marginBottom: '8px' }}>Amenities</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {result.requirements.amenities.map(a => (
                    <span key={a} style={{ padding: '4px 12px', background: '#FAF5EA', color: PLUM, fontSize: '12px', fontWeight: 600, borderRadius: '999px', border: '1px solid var(--champagne-border)', textTransform: 'capitalize' }}>{a}</span>
                  ))}
                </div>
              </div>
            )}
            {result.requirements.missing_fields.length > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--champagne-border)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A6E30', display: 'block', marginBottom: '8px' }}>
                  Missing Information
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {result.requirements.missing_fields.map(f => (
                    <span key={f} style={{ padding: '4px 12px', background: '#FBF3E3', color: '#8A6E30', fontSize: '12px', fontWeight: 600, borderRadius: '999px', border: '1px solid #E5D3AC' }}>
                      {f.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* AI Recommended Next Action & Suggestions */}
          {(result.recommended_next_action || result.suggestions.length > 0) && (
            <section style={{ ...CARD, background: '#FAF7F0' }}>
              {result.recommended_next_action && (
                <div style={{ marginBottom: result.suggestions.length > 0 ? '12px' : '0', padding: '10px 14px', background: '#F4EFE6', borderRadius: '8px', border: '1px solid var(--champagne-border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                    Recommended Next Action
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: PLUM }}>
                    {result.recommended_next_action}
                  </div>
                </div>
              )}
              {result.suggestions.length > 0 && (
                <>
                  <p style={{ fontSize: '13.5px', fontWeight: 800, color: PLUM, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Lightbulb size={15} color={GOLD} /> Agent Suggestions to Improve Score
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {result.suggestions.map((s, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                        <ChevronRight size={14} color={GOLD} style={{ marginTop: '3px', flexShrink: 0 }} /> {s}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {/* Save / Reset */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleSaveLead}
              disabled={saving}
              className="gold-btn"
              style={{ padding: '11px 24px', fontSize: '13.5px', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {saving ? 'Saving…' : 'Save Lead & Find Properties'}
            </button>
            <button
              type="button"
              onClick={() => { setResult(null); setEnquiry('') }}
              className="outline-navy-btn"
              style={{ padding: '11px 24px', fontSize: '13.5px' }}
            >
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
