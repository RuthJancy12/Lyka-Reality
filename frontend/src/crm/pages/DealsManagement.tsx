import { useCallback, useEffect, useState } from 'react'
import {
  DollarSign, Trophy, Plus, RefreshCw, AlertCircle, X, ShieldCheck
} from 'lucide-react'
import { DigitalDealRoomModal } from '../components/DigitalDealRoomModal'
import {
  listDeals, createDeal, updateDeal, getLeaderboard, updateCommissionStatus,
  type Deal, type LeaderboardEntry,
} from '../services/enterpriseApi'
import { useStaffRole } from '../services/staffApi'
import { ErrorBoundary } from '../components/ErrorBoundary'

const PLUM = 'var(--plum-main, #1F101C)'
const GOLD = 'var(--gold-dark, #A37E2C)'
const BORDER = 'var(--champagne-border, #E8DCC8)'
const SURFACE = 'var(--champagne-surface, #F9F5EF)'

const CARD: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: '12px',
  boxShadow: '0 2px 10px rgba(26, 13, 24, 0.04)',
  padding: '20px',
}

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  background: '#fff',
  color: PLUM,
  fontSize: '13px',
}

function aed(n: number | null | undefined): string {
  return `AED ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function DealsManagement() {
  const { role } = useStaffRole()
  const canApprove = role === 'admin' || role === 'manager'

  const [activeTab, setActiveTab] = useState<'pipeline' | 'leaderboard'>('pipeline')
  const [deals, setDeals] = useState<Deal[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Deal stage filter
  const [stageFilter, setStageFilter] = useState('all')
  const [activeDealRoom, setActiveDealRoom] = useState<Deal | null>(null)

  // Create deal modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [newPropertyRef, setNewPropertyRef] = useState('')
  const [newDealValue, setNewDealValue] = useState('')
  const [newCommissionRate, setNewCommissionRate] = useState('2.0')
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      setLoading(false)
      setRefreshing(false)
    }, 10000)
    try {
      const [dealList, lBoard] = await Promise.all([
        listDeals({ stage: stageFilter === 'all' ? undefined : stageFilter }),
        getLeaderboard().catch(() => []),
      ])
      setDeals(dealList)
      setLeaderboard(lBoard)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deals & leaderboard.')
    } finally {
      clearTimeout(timer)
      setLoading(false)
      setRefreshing(false)
    }
  }, [stageFilter])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustomerName.trim() || !newDealValue) return
    setCreating(true)
    try {
      await createDeal({
        customer_name: newCustomerName.trim(),
        customer_email: newCustomerEmail.trim() || undefined,
        property_ref: newPropertyRef.trim() || undefined,
        deal_value_aed: Number(newDealValue),
        commission_rate_pct: Number(newCommissionRate) || 2.0,
        deal_stage: 'offer',
        notes: newNotes.trim() || undefined,
      })
      setShowCreateModal(false)
      setNewCustomerName('')
      setNewCustomerEmail('')
      setNewPropertyRef('')
      setNewDealValue('')
      setNewNotes('')
      await loadData(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deal.')
    } finally {
      setCreating(false)
    }
  }

  const handleStageChange = async (dealId: number, newStage: string) => {
    try {
      await updateDeal(dealId, { deal_stage: newStage as Deal['deal_stage'] })
      await loadData(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update deal stage.')
    }
  }

  const handleApproveCommission = async (commId: number) => {
    try {
      await updateCommissionStatus(commId, 'approved')
      await loadData(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve commission.')
    }
  }

  // Summary Metrics
  const wonDeals = deals.filter((d) => d.deal_stage === 'closed_won')
  const totalWonValue = wonDeals.reduce((sum, d) => sum + (d.deal_value_aed || 0), 0)
  const totalCommission = wonDeals.reduce((sum, d) => sum + (d.commission_amount_aed || 0), 0)
  const pipelineCount = deals.filter((d) => d.deal_stage !== 'closed_won' && d.deal_stage !== 'closed_lost').length

  return (
    <ErrorBoundary fallbackTitle="Deals & Commissions">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header */}
        <div style={{ ...CARD, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', padding: '24px 26px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: SURFACE, borderRadius: '20px', border: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              <DollarSign size={13} /> Transactions &amp; Sales Management
            </div>
            <h1 className="luxury-serif" style={{ fontSize: '26px', color: PLUM, margin: 0, fontWeight: 700 }}>
              Deals, Revenue &amp; Commissions
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', margin: '6px 0 0', maxWidth: '680px' }}>
              Track property purchase offers, contracts, closed transactions, and sales agent commission payouts.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', background: 'var(--gold-primary, #C5A869)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer' }}
            >
              <Plus size={15} /> Log New Deal
            </button>
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
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#991B1B', fontSize: '13px' }}>
            <AlertCircle size={17} /> {error}
          </div>
        )}

        {/* Top KPI Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div style={{ ...CARD, padding: '16px 18px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase' }}>Closed Won Revenue</span>
            <div style={{ fontSize: '24px', fontWeight: 800, color: PLUM, margin: '4px 0 0' }}>{aed(totalWonValue)}</div>
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{wonDeals.length} completed transactions</span>
          </div>
          <div style={{ ...CARD, padding: '16px 18px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: GOLD, textTransform: 'uppercase' }}>Earned Commissions</span>
            <div style={{ fontSize: '24px', fontWeight: 800, color: PLUM, margin: '4px 0 0' }}>{aed(totalCommission)}</div>
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Standard 2.0% brokerage</span>
          </div>
          <div style={{ ...CARD, padding: '16px 18px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>Active Pipeline Deals</span>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563EB', margin: '4px 0 0' }}>{pipelineCount}</div>
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Offers &amp; contracts pending</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '10px', borderBottom: `1px solid ${BORDER}`, paddingBottom: '12px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${activeTab === 'pipeline' ? PLUM : BORDER}`,
              background: activeTab === 'pipeline' ? PLUM : '#fff',
              color: activeTab === 'pipeline' ? '#fff' : PLUM,
              display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
          >
            <DollarSign size={15} /> Deals Pipeline ({deals.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${activeTab === 'leaderboard' ? PLUM : BORDER}`,
              background: activeTab === 'leaderboard' ? PLUM : '#fff',
              color: activeTab === 'leaderboard' ? '#fff' : PLUM,
              display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Trophy size={15} /> Sales Leaderboard
          </button>
        </div>

        {/* Tab 1: Deals Pipeline */}
        {activeTab === 'pipeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ ...CARD, padding: '14px 18px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Stage:</span>
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ ...INPUT, width: 'auto' }}>
                <option value="all">All Deal Stages</option>
                <option value="offer">Offer Submitted</option>
                <option value="under_contract">Under Contract</option>
                <option value="closed_won">Closed Won</option>
                <option value="closed_lost">Closed Lost</option>
              </select>
            </div>

            <div style={CARD}>
              {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={24} color={GOLD} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                  <div>Loading deals pipeline…</div>
                </div>
              ) : error ? (
                <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <AlertCircle size={32} color="#DC2626" style={{ margin: '0 auto 10px', display: 'block' }} />
                  <div style={{ fontWeight: 700, color: '#991B1B', fontSize: '15px', marginBottom: '6px' }}>{error}</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>Unable to retrieve deals pipeline records from the server.</p>
                  <button
                    type="button"
                    onClick={() => void loadData(true)}
                    style={{ padding: '8px 18px', background: PLUM, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Retry Loading Deals
                  </button>
                </div>
              ) : deals.length === 0 ? (
                <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <DollarSign size={36} color={BORDER} style={{ margin: '0 auto 12px', display: 'block' }} />
                  <div style={{ fontWeight: 700, color: PLUM, fontSize: '15px', marginBottom: '4px' }}>
                    {stageFilter === 'all' ? 'No Deals Registered Yet' : `No Deals in "${stageFilter.replace('_', ' ')}" Stage`}
                  </div>
                  <p style={{ fontSize: '13px', margin: '0 0 16px', color: 'var(--text-secondary)' }}>
                    Start tracking your property sales transactions, commissions, and buyer offers.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: 'var(--gold-primary, #C5A869)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Plus size={15} /> Log New Deal
                  </button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: SURFACE, textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>
                        <th style={{ padding: '12px' }}>Client / Buyer</th>
                        <th style={{ padding: '12px' }}>Property Ref</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Deal Value (AED)</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Commission</th>
                        <th style={{ padding: '12px' }}>Stage</th>
                        <th style={{ padding: '12px' }}>Agent</th>
                        <th style={{ padding: '12px' }}>Commission Payout</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>Deal Room</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deals.map((d) => {
                        const comm = d.commissions?.[0]
                        return (
                          <tr key={d.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                            <td style={{ padding: '12px' }}>
                              <div style={{ fontWeight: 700, color: PLUM }}>{d.customer_name}</div>
                              {d.customer_email && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{d.customer_email}</div>}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ fontWeight: 600, color: GOLD }}>{d.property_ref || 'Off-plan / Direct'}</span>
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: PLUM }}>
                              {aed(d.deal_value_aed)}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>
                              {aed(d.commission_amount_aed)} ({d.commission_rate_pct}%)
                            </td>
                            <td style={{ padding: '12px' }}>
                              <select
                                value={d.deal_stage}
                                onChange={(e) => void handleStageChange(d.id, e.target.value)}
                                style={{
                                  padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                                  background: d.deal_stage === 'closed_won' ? '#F0FDF4' : d.deal_stage === 'closed_lost' ? '#FEF2F2' : SURFACE,
                                  color: d.deal_stage === 'closed_won' ? '#16A34A' : d.deal_stage === 'closed_lost' ? '#DC2626' : PLUM,
                                  border: `1px solid ${BORDER}`,
                                }}
                              >
                                <option value="offer">Offer</option>
                                <option value="contract_signed">Contract Signed</option>
                                <option value="payment_pending">Payment Pending</option>
                                <option value="closed_won">Closed Won</option>
                                <option value="closed_lost">Closed Lost</option>
                              </select>
                            </td>
                            <td style={{ padding: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {d.salesperson_email.split('@')[0]}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {comm ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, textTransform: 'capitalize',
                                    background: comm.status === 'paid' ? '#F0FDF4' : comm.status === 'approved' ? '#EFF6FF' : '#FEF3C7',
                                    color: comm.status === 'paid' ? '#16A34A' : comm.status === 'approved' ? '#2563EB' : '#D97706',
                                  }}>
                                    {comm.status}
                                  </span>
                                  {canApprove && comm.status === 'pending' && (
                                    <button
                                      type="button"
                                      onClick={() => void handleApproveCommission(comm.id)}
                                      style={{ padding: '3px 8px', borderRadius: '4px', background: '#16A34A', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      Approve
                                    </button>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setActiveDealRoom(d)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '5px 11px',
                                  borderRadius: '6px',
                                  background: 'linear-gradient(135deg, #3B2348 0%, #53345F 100%)',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                }}
                              >
                                <ShieldCheck size={12} color="#C6A15B" /> Deal Room
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Sales Leaderboard */}
        {activeTab === 'leaderboard' && (
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: PLUM, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={18} color={GOLD} /> Top Performing Sales Consultants
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ranked by total sales value (AED)</span>
            </div>

            {leaderboard.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No consultant activity recorded yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '750px', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: SURFACE, textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>
                      <th style={{ padding: '12px' }}>Rank</th>
                      <th style={{ padding: '12px' }}>Consultant</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Deals Won</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Total Sales (AED)</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Commissions</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Connected Calls</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Site Visits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((agent) => (
                      <tr key={agent.staff_email} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: '26px', height: '26px', borderRadius: '50%', fontWeight: 800, fontSize: '12px',
                            background: agent.rank === 1 ? '#FEF3C7' : agent.rank === 2 ? '#E2E8F0' : agent.rank === 3 ? '#FFEDD5' : SURFACE,
                            color: agent.rank === 1 ? '#B45309' : agent.rank === 2 ? '#475569' : agent.rank === 3 ? '#9A3412' : 'var(--text-secondary)',
                          }}>
                            #{agent.rank}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 700, color: PLUM }}>{agent.staff_name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{agent.staff_email}</div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>
                          {agent.deals_count}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: PLUM }}>
                          {aed(agent.total_sales_aed)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>
                          {aed(agent.total_commission_aed)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {agent.calls_connected}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {agent.viewings_completed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Create Deal Modal */}
        {showCreateModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '520px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: PLUM, margin: 0 }}>Log New Real Estate Deal</h2>
                <button type="button" onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={20} color="var(--text-secondary)" />
                </button>
              </div>

              <form onSubmit={handleCreateDeal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Buyer / Customer Name *</label>
                  <input required value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="e.g. Sheikh Ahmed Al Maktoum" style={INPUT} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Customer Email</label>
                  <input type="email" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} placeholder="customer@example.com" style={INPUT} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Property Reference</label>
                  <input value={newPropertyRef} onChange={(e) => setNewPropertyRef(e.target.value)} placeholder="e.g. CRM-101 or LYK-202" style={INPUT} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Deal Value (AED) *</label>
                    <input required type="number" min="0" value={newDealValue} onChange={(e) => setNewDealValue(e.target.value)} placeholder="e.g. 5000000" style={INPUT} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Commission Rate (%)</label>
                    <input type="number" step="0.1" min="0" max="100" value={newCommissionRate} onChange={(e) => setNewCommissionRate(e.target.value)} placeholder="2.0" style={INPUT} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Notes</label>
                  <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Special terms, payment schedule, etc." rows={2} style={{ ...INPUT, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={() => setShowCreateModal(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${BORDER}`, background: '#fff', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={creating} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: 'var(--gold-primary, #C5A869)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
                    {creating ? 'Saving…' : 'Save Deal'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Digital Deal Room Modal */}
        {activeDealRoom && (
          <DigitalDealRoomModal
            deal={activeDealRoom}
            canApprove={canApprove}
            onClose={() => setActiveDealRoom(null)}
            onSuccess={() => {
              void loadData()
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  )
}
