import { useState } from 'react'
import {
  X, ShieldCheck, Check
} from 'lucide-react'
import { updateDeal, type Deal } from '../services/enterpriseApi'

const NAVY = '#3B2348'
const GOLD = '#C6A15B'
const BORDER = '#E8DCC8'
const TEXT_MAIN = '#26232B'
const TEXT_MUTED = '#7A6B78'

interface DigitalDealRoomModalProps {
  deal: Deal
  canApprove?: boolean
  onClose: () => void
  onSuccess: () => void
}

const MILESTONES: Array<{
  stage: Deal['deal_stage']
  title: string
  desc: string
}> = [
  { stage: 'offer', title: '1. Offer & Deposit', desc: 'Buyer offer submitted with 10% security deposit cheque' },
  { stage: 'contract_signed', title: '2. Unified Form F / MOU', desc: 'Bilingual Form F signed by buyer & seller' },
  { stage: 'payment_pending', title: '3. Developer NOC & Escrow', desc: 'Developer NOC obtained, escrow clearance ready' },
  { stage: 'closed_won', title: '4. Title Deed Transfer', desc: 'Trustee office title transfer executed & deal closed' },
]

export function DigitalDealRoomModal({
  deal,
  canApprove = false,
  onClose,
  onSuccess,
}: DigitalDealRoomModalProps) {
  const [activeStage, setActiveStage] = useState<Deal['deal_stage']>(deal.deal_stage)
  const [newNote, setNewNote] = useState('')
  const [updating, setUpdating] = useState(false)
  const [checklist, setChecklist] = useState({
    passport: true,
    proofOfFunds: true,
    formFSigned: deal.deal_stage !== 'offer',
    developerNoc: deal.deal_stage === 'payment_pending' || deal.deal_stage === 'closed_won',
    managerApproval: deal.deal_stage === 'closed_won',
  })
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

  const handleStageAdvance = async (newStage: Deal['deal_stage']) => {
    setUpdating(true)
    try {
      await updateDeal(deal.id, { deal_stage: newStage })
      setActiveStage(newStage)
      setSavedNotice(`Transaction stage updated to "${newStage.replace(/_/g, ' ').toUpperCase()}"`)
      setTimeout(() => setSavedNotice(null), 3000)
      onSuccess()
    } catch {
      // safe degrade
    } finally {
      setUpdating(false)
    }
  }

  const handleAddDealNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNote.trim()) return
    setUpdating(true)
    try {
      const timestamp = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      const updatedNotes = deal.notes
        ? `${deal.notes}\n\n[${timestamp}] ${newNote.trim()}`
        : `[${timestamp}] ${newNote.trim()}`
      await updateDeal(deal.id, { notes: updatedNotes })
      setNewNote('')
      setSavedNotice('Deal activity note recorded successfully!')
      setTimeout(() => setSavedNotice(null), 3000)
      onSuccess()
    } catch {
      // safe degrade
    } finally {
      setUpdating(false)
    }
  }

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }))
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
          maxWidth: '920px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Deal Room Header */}
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
                color: GOLD,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '4px',
              }}
            >
              <ShieldCheck size={14} /> LYKA Digital Deal Room &bull; Deal #{deal.id}
            </div>
            <h2
              className="luxury-serif"
              style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#FAF7F0' }}
            >
              {deal.customer_name} &bull; Property {deal.property_ref || 'Off-Plan'}
            </h2>
            <div style={{ fontSize: '12px', color: '#EEE7F2', marginTop: '2px' }}>
              Lead Consultant: {deal.salesperson_email} &bull; Deal Value: AED {deal.deal_value_aed.toLocaleString()}
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

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {savedNotice && (
            <div
              style={{
                padding: '10px 14px',
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: '8px',
                color: '#065F46',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Check size={16} /> {savedNotice}
            </div>
          )}

          {/* 1. Transaction Milestone Progress Tracker */}
          <div
            style={{
              background: 'var(--theme-surface, #FFFFFF)',
              border: '1px solid var(--theme-border, #E8DCC8)',
              borderRadius: '12px',
              padding: '18px 20px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY, marginBottom: '14px' }}>
              Transaction Milestones &amp; Dubai Conveyancing Workflow
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {MILESTONES.map((m, idx) => {
                const isCurrent = activeStage === m.stage
                const isPassed =
                  (m.stage === 'offer') ||
                  (m.stage === 'contract_signed' && activeStage !== 'offer') ||
                  (m.stage === 'payment_pending' && (activeStage === 'payment_pending' || activeStage === 'closed_won')) ||
                  (m.stage === 'closed_won' && activeStage === 'closed_won')

                return (
                  <div
                    key={m.stage}
                    onClick={() => handleStageAdvance(m.stage)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: isCurrent ? `2px solid ${GOLD}` : `1px solid ${BORDER}`,
                      background: isCurrent ? 'rgba(198, 161, 91, 0.12)' : isPassed ? '#F8FAFC' : '#FAF7F0',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: isCurrent ? GOLD : NAVY }}>
                        Stage {idx + 1}
                      </span>
                      {isPassed && <Check size={13} color="#16A34A" />}
                    </div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: NAVY, margin: '4px 0 2px' }}>
                      {m.title}
                    </div>
                    <div style={{ fontSize: '10.5px', color: TEXT_MUTED, lineHeight: 1.3 }}>
                      {m.desc}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 2. Two-Column Layout: Documents Checklist & Deal Communication */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
            {/* Document Compliance Checklist */}
            <div
              style={{
                background: 'var(--theme-surface, #FFFFFF)',
                border: '1px solid var(--theme-border, #E8DCC8)',
                borderRadius: '12px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>
                Contract &amp; Document Checklist
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checklist.passport}
                    onChange={() => toggleCheck('passport')}
                    style={{ accentColor: GOLD }}
                  />
                  <span>Buyer Passport / Emirates ID</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checklist.proofOfFunds}
                    onChange={() => toggleCheck('proofOfFunds')}
                    style={{ accentColor: GOLD }}
                  />
                  <span>Proof of Funds / Bank Pre-Approval</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checklist.formFSigned}
                    onChange={() => toggleCheck('formFSigned')}
                    style={{ accentColor: GOLD }}
                  />
                  <span>Signed Form F (Unified Sales Contract)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checklist.developerNoc}
                    onChange={() => toggleCheck('developerNoc')}
                    style={{ accentColor: GOLD }}
                  />
                  <span>Developer NOC Certificate</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checklist.managerApproval}
                    disabled={!canApprove}
                    onChange={() => toggleCheck('managerApproval')}
                    style={{ accentColor: GOLD }}
                  />
                  <span>Sales Manager Deal Approval Sign-Off {canApprove ? '(Authorized)' : '(Requires Manager)'}</span>
                </label>
              </div>

              {/* Commission Summary */}
              <div
                style={{
                  marginTop: 'auto',
                  padding: '12px',
                  background: '#FAF7F0',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', color: TEXT_MUTED }}>
                  <span>Brokerage Commission ({deal.commission_rate_pct}%):</span>
                  <strong style={{ color: NAVY }}>AED {deal.commission_amount_aed.toLocaleString('en-US')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: TEXT_MUTED, marginTop: '4px' }}>
                  <span>Current Stage:</span>
                  <strong style={{ color: '#16A34A', textTransform: 'capitalize' }}>
                    {deal.deal_stage.replace(/_/g, ' ')}
                  </strong>
                </div>
              </div>
            </div>

            {/* Deal Activity Log & Communication */}
            <div
              style={{
                background: 'var(--theme-surface, #FFFFFF)',
                border: '1px solid var(--theme-border, #E8DCC8)',
                borderRadius: '12px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>
                Deal Communication &amp; Audit Trail
              </div>

              <div
                style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  background: '#FAF7F0',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '12px',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: TEXT_MAIN,
                }}
              >
                {deal.notes ? deal.notes : 'No previous deal activity notes recorded.'}
              </div>

              <form onSubmit={handleAddDealNote} style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                <input
                  type="text"
                  placeholder="Record deal update or buyer communication…"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${BORDER}`,
                    fontSize: '12.5px',
                    background: '#FFFFFF',
                  }}
                />
                <button
                  type="submit"
                  disabled={updating || !newNote.trim()}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: NAVY,
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Add Note
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            background: 'var(--theme-surface, #FFFFFF)',
            borderTop: '1px solid var(--theme-border, #E8DCC8)',
            padding: '14px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '11.5px', color: TEXT_MUTED }}>
            Created: {new Date(deal.created_at).toLocaleDateString()} &bull; Last Audit: {new Date(deal.updated_at).toLocaleDateString()}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: `1px solid ${BORDER}`,
              background: '#FFFFFF',
              color: NAVY,
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Close Deal Room
          </button>
        </div>
      </div>
    </div>
  )
}
