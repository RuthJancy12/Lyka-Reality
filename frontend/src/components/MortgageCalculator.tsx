import { useState, useMemo } from 'react'
import {
  Calculator, Scale, Share2, Check,
} from 'lucide-react'

export function MortgageCalculator() {
  const [activeTab, setActiveTab] = useState<'mortgage' | 'rent_vs_buy'>('mortgage')

  // Mortgage Inputs
  const [propertyPrice, setPropertyPrice] = useState(3500000)
  const [downPaymentPercent, setDownPaymentPercent] = useState(20)
  const [tenureYears, setTenureYears] = useState(25)
  const [interestRate, setInterestRate] = useState(4.25)

  // Rent vs Buy Inputs
  const [monthlyRent, setMonthlyRent] = useState(16000)
  const [rentInflation, setRentInflation] = useState(5)
  const [propertyAppreciation, setPropertyAppreciation] = useState(4)

  const [copied, setCopied] = useState(false)

  // --- Calculations ---
  const downPaymentAmount = useMemo(() => (propertyPrice * downPaymentPercent) / 100, [propertyPrice, downPaymentPercent])
  const loanAmount = useMemo(() => propertyPrice - downPaymentAmount, [propertyPrice, downPaymentAmount])
  const monthlyRate = useMemo(() => interestRate / 100 / 12, [interestRate])
  const totalMonths = useMemo(() => tenureYears * 12, [tenureYears])

  const monthlyMortgage = useMemo(() => {
    if (monthlyRate <= 0) return loanAmount / totalMonths
    return (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths))) /
      (Math.pow(1 + monthlyRate, totalMonths) - 1)
  }, [loanAmount, monthlyRate, totalMonths])

  // Upfront UAE Transaction Costs (DLD, Brokerage, Trustee, Valuation)
  const dldFee = useMemo(() => propertyPrice * 0.04 + 580, [propertyPrice])
  const brokerFee = useMemo(() => propertyPrice * 0.02 * 1.05, [propertyPrice]) // 2% + 5% VAT
  const mortgageRegFee = useMemo(() => loanAmount * 0.0025 + 4200, [loanAmount])
  const valuationFee = 3000
  const totalUpfrontFees = useMemo(() => dldFee + brokerFee + mortgageRegFee + valuationFee, [dldFee, brokerFee, mortgageRegFee])
  const totalInitialCashRequired = useMemo(() => downPaymentAmount + totalUpfrontFees, [downPaymentAmount, totalUpfrontFees])

  // Rent vs Buy 5-Year & 10-Year Projections
  const projection = useMemo(() => {
    // 5 Years Cumulative Rent Paid
    let cumRent5 = 0
    let curRent = monthlyRent * 12
    for (let yr = 1; yr <= 5; yr++) {
      cumRent5 += curRent
      curRent *= 1 + rentInflation / 100
    }

    // 5 Years Home Equity
    // Estimated future property value
    const propValue5 = propertyPrice * Math.pow(1 + propertyAppreciation / 100, 5)
    // Approximate remaining loan balance after 5 years
    let balance = loanAmount
    for (let m = 0; m < 60; m++) {
      const interestPmt = balance * monthlyRate
      const principalPmt = monthlyMortgage - interestPmt
      balance = Math.max(0, balance - principalPmt)
    }
    const equity5 = propValue5 - balance

    // 5-year net advantage of buying = Equity built minus initial fees and interest paid
    const interestPaid5 = monthlyMortgage * 60 - (loanAmount - balance)
    const netAdvantage5 = equity5 - downPaymentAmount - totalUpfrontFees - interestPaid5 + cumRent5

    return {
      cumRent5,
      equity5,
      propValue5,
      balance5: balance,
      netAdvantage5,
    }
  }, [monthlyRent, rentInflation, propertyPrice, propertyAppreciation, loanAmount, monthlyMortgage, monthlyRate, downPaymentAmount, totalUpfrontFees])

  const formattedSummary = useMemo(() => {
    return `🏛️ *LYKA REALTY — MORTGAGE & AFFORDABILITY SUMMARY*
Property Price: AED ${propertyPrice.toLocaleString('en-US')}
Down Payment (${downPaymentPercent}%): AED ${downPaymentAmount.toLocaleString('en-US')}
Est. Monthly Mortgage: AED ${Math.round(monthlyMortgage).toLocaleString('en-US')}/month
Est. Upfront Buying Costs (DLD, Brokerage, Trustee): AED ${Math.round(totalUpfrontFees).toLocaleString('en-US')}
Total Initial Outlay: AED ${Math.round(totalInitialCashRequired).toLocaleString('en-US')}
5-Year Equity Built vs Rent Paid: AED ${Math.round(projection.equity5).toLocaleString('en-US')} vs AED ${Math.round(projection.cumRent5).toLocaleString('en-US')}

Calculated via LYKA Realty Smart Affordability Engine. Estimates only, not guaranteed bank offers.`
  }, [propertyPrice, downPaymentPercent, downPaymentAmount, monthlyMortgage, totalUpfrontFees, totalInitialCashRequired, projection])

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(formattedSummary)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // fallback
    }
  }

  const handleShareWhatsApp = () => {
    const url = `https://wa.me/97148005952?text=${encodeURIComponent(formattedSummary)}`
    window.open(url, '_blank')
  }

  return (
    <section
      id="calculator"
      style={{
        padding: '90px 0',
        background: 'var(--champagne-surface, #F5EFE6)',
        borderBottom: '1px solid var(--champagne-border, #E8DCC8)',
      }}
    >
      <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <span
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              fontWeight: 700,
              color: 'var(--theme-accent, #C6A15B)',
            }}
          >
            Financial Planning &amp; Advisory
          </span>
          <h2
            className="luxury-serif"
            style={{
              fontSize: '34px',
              fontWeight: 600,
              color: 'var(--theme-primary, #3B2348)',
              marginTop: '8px',
              marginBottom: '12px',
            }}
          >
            Smart Affordability &amp; Rent-vs-Buy Calculator
          </h2>
          <p
            style={{
              color: 'var(--theme-muted, #746875)',
              maxWidth: '640px',
              margin: '0 auto',
              fontSize: '15px',
            }}
          >
            Transparent financial modelling for UAE luxury properties: monthly repayments, DLD upfront fees, and long-term equity growth vs renting.
          </p>

          {/* Mode Switcher Tabs */}
          <div style={{ display: 'inline-flex', gap: '8px', marginTop: '24px', background: 'var(--theme-surface, #FFFFFF)', padding: '4px', borderRadius: '30px', border: '1px solid var(--theme-border, #E8DCC8)' }}>
            <button
              type="button"
              onClick={() => setActiveTab('mortgage')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 20px',
                borderRadius: '24px',
                border: 'none',
                background: activeTab === 'mortgage' ? 'var(--theme-primary, #3B2348)' : 'transparent',
                color: activeTab === 'mortgage' ? '#FFFFFF' : 'var(--theme-text, #26232B)',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Calculator size={15} color={activeTab === 'mortgage' ? 'var(--theme-accent, #C6A15B)' : undefined} />
              Mortgage &amp; Upfront Costs
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rent_vs_buy')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 20px',
                borderRadius: '24px',
                border: 'none',
                background: activeTab === 'rent_vs_buy' ? 'var(--theme-primary, #3B2348)' : 'transparent',
                color: activeTab === 'rent_vs_buy' ? '#FFFFFF' : 'var(--theme-text, #26232B)',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Scale size={15} color={activeTab === 'rent_vs_buy' ? 'var(--theme-accent, #C6A15B)' : undefined} />
              Rent vs. Buy Analysis
            </button>
          </div>
        </div>

        {/* Calculator Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: '30px',
            alignItems: 'start',
          }}
        >
          {/* Left Panel: Sliders & Controls */}
          <div
            style={{
              background: 'var(--theme-surface, #FFFFFF)',
              padding: '30px',
              borderRadius: '12px',
              border: '1px solid var(--theme-border, #E8DCC8)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
            }}
          >
            {activeTab === 'mortgage' ? (
              <>
                {/* Property Price Slider */}
                <div style={{ marginBottom: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--theme-text, #26232B)', fontWeight: 600 }}>Property Purchase Price</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>
                      AED {propertyPrice.toLocaleString('en-US')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1000000"
                    max="30000000"
                    step="250000"
                    value={propertyPrice}
                    onChange={(e) => setPropertyPrice(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--theme-accent, #C6A15B)', cursor: 'pointer' }}
                  />
                </div>

                {/* Down Payment Slider */}
                <div style={{ marginBottom: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--theme-text, #26232B)', fontWeight: 600 }}>Down Payment ({downPaymentPercent}%)</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>
                      AED {downPaymentAmount.toLocaleString('en-US')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="60"
                    step="5"
                    value={downPaymentPercent}
                    onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--theme-accent, #C6A15B)', cursor: 'pointer' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--theme-muted, #746875)', marginTop: '4px' }}>
                    * UAE Central Bank minimum down payment is 20% for expatriates and residents.
                  </div>
                </div>

                {/* Loan Duration Slider */}
                <div style={{ marginBottom: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--theme-text, #26232B)', fontWeight: 600 }}>Loan Tenure</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>
                      {tenureYears} Years ({totalMonths} Months)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="25"
                    step="5"
                    value={tenureYears}
                    onChange={(e) => setTenureYears(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--theme-accent, #C6A15B)', cursor: 'pointer' }}
                  />
                </div>

                {/* Interest Rate Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--theme-text, #26232B)', fontWeight: 600 }}>Assumed Mortgage Rate (Annual)</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>
                      {interestRate}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="3.75"
                    max="7.00"
                    step="0.25"
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--theme-accent, #C6A15B)', cursor: 'pointer' }}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Rent vs Buy Input Controls */}
                <div style={{ marginBottom: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--theme-text, #26232B)', fontWeight: 600 }}>Current Annual / Monthly Rent</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>
                      AED {monthlyRent.toLocaleString('en-US')} / mo
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5000"
                    max="50000"
                    step="1000"
                    value={monthlyRent}
                    onChange={(e) => setMonthlyRent(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--theme-accent, #C6A15B)', cursor: 'pointer' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--theme-muted, #746875)', marginTop: '4px' }}>
                    Equivalent to AED {(monthlyRent * 12).toLocaleString('en-US')} per year
                  </div>
                </div>

                <div style={{ marginBottom: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--theme-text, #26232B)', fontWeight: 600 }}>Annual Rent Inflation Assumption</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>
                      {rentInflation}% per year
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="10"
                    step="1"
                    value={rentInflation}
                    onChange={(e) => setRentInflation(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--theme-accent, #C6A15B)', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--theme-text, #26232B)', fontWeight: 600 }}>Property Capital Growth Assumption</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--theme-primary, #3B2348)' }}>
                      {propertyAppreciation}% per year
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="0.5"
                    value={propertyAppreciation}
                    onChange={(e) => setPropertyAppreciation(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--theme-accent, #C6A15B)', cursor: 'pointer' }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Right Panel: Summary & Results */}
          <div
            style={{
              background: 'var(--theme-surface, #FFFFFF)',
              padding: '30px',
              borderRadius: '12px',
              border: '1px solid var(--theme-border, #E8DCC8)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {activeTab === 'mortgage' ? (
              <>
                {/* Monthly Payment Hero */}
                <div
                  style={{
                    padding: '20px',
                    borderRadius: '10px',
                    background: 'var(--theme-surface-elevated, #FAF7F0)',
                    border: '1px solid var(--theme-border, #E8DCC8)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--theme-muted, #746875)' }}>
                    Estimated Monthly Mortgage
                  </div>
                  <div
                    style={{
                      fontSize: '34px',
                      fontWeight: 800,
                      color: 'var(--theme-primary, #3B2348)',
                      margin: '6px 0 2px',
                    }}
                  >
                    AED {Math.round(monthlyMortgage).toLocaleString('en-US')}
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--theme-muted, #746875)' }}>/month</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--theme-muted, #746875)' }}>
                    Principal Loan Amount: AED {loanAmount.toLocaleString('en-US')}
                  </div>
                </div>

                {/* Upfront Costs Breakdown */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--theme-primary, #3B2348)', marginBottom: '8px' }}>
                    Transparent UAE Upfront Acquisition Costs
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--theme-text, #26232B)' }}>
                      <span>DLD Transfer Fee (4% + AED 580 Admin)</span>
                      <strong>AED {Math.round(dldFee).toLocaleString('en-US')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--theme-text, #26232B)' }}>
                      <span>Agency Commission (2% + 5% VAT)</span>
                      <strong>AED {Math.round(brokerFee).toLocaleString('en-US')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--theme-text, #26232B)' }}>
                      <span>Mortgage Registration (0.25% + Trustee)</span>
                      <strong>AED {Math.round(mortgageRegFee).toLocaleString('en-US')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--theme-text, #26232B)' }}>
                      <span>Bank Valuation Fee</span>
                      <strong>AED {valuationFee.toLocaleString('en-US')}</strong>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderTop: '1px solid var(--theme-border, #E8DCC8)',
                        paddingTop: '6px',
                        fontSize: '13px',
                        fontWeight: 800,
                        color: 'var(--theme-primary, #3B2348)',
                      }}
                    >
                      <span>Total Initial Cash Required (Down Pmt + Fees)</span>
                      <span style={{ color: 'var(--theme-accent, #C6A15B)' }}>
                        AED {Math.round(totalInitialCashRequired).toLocaleString('en-US')}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Rent vs Buy Comparative Hero */}
                <div
                  style={{
                    padding: '20px',
                    borderRadius: '10px',
                    background: 'var(--theme-surface-elevated, #FAF7F0)',
                    border: '1px solid var(--theme-border, #E8DCC8)',
                  }}
                >
                  <div style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--theme-muted, #746875)' }}>
                    5-Year Wealth Accumulation Comparison
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                    <div style={{ padding: '12px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid var(--theme-border, #E8DCC8)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626' }}>If You Rent (5 Years)</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#DC2626', margin: '4px 0' }}>
                        -AED {Math.round(projection.cumRent5).toLocaleString('en-US')}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--theme-muted, #746875)' }}>
                        100% Sunk cost with 0 equity retention
                      </div>
                    </div>

                    <div style={{ padding: '12px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid var(--theme-border, #E8DCC8)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A' }}>If You Buy (5 Years)</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#16A34A', margin: '4px 0' }}>
                        +AED {Math.round(projection.equity5).toLocaleString('en-US')}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--theme-muted, #746875)' }}>
                        Net accumulated property equity
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--theme-text, #26232B)', lineHeight: 1.5 }}>
                  Based on a <strong>{propertyAppreciation}% annual capital growth</strong>, this residence is projected to appreciate to{' '}
                  <strong>AED {Math.round(projection.propValue5).toLocaleString('en-US')}</strong> by year 5, while your outstanding mortgage loan balance decreases to{' '}
                  <strong>AED {Math.round(projection.balance5).toLocaleString('en-US')}</strong>.
                </div>
              </>
            )}

            {/* Sharing Actions & Disclaimer */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleCopySummary}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  background: 'var(--theme-surface-elevated, #FAF7F0)',
                  border: '1px solid var(--theme-border, #E8DCC8)',
                  color: 'var(--theme-primary, #3B2348)',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copied ? <Check size={14} color="#16A34A" /> : <Share2 size={14} />}
                {copied ? 'Summary Copied!' : 'Copy Summary'}
              </button>

              <button
                type="button"
                onClick={handleShareWhatsApp}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
                }}
              >
                Share with Sales Consultant
              </button>
            </div>

            <div
              style={{
                fontSize: '11px',
                color: 'var(--theme-muted, #746875)',
                lineHeight: 1.5,
                borderTop: '1px solid var(--theme-border, #E8DCC8)',
                paddingTop: '12px',
              }}
            >
              * <strong>Financial Disclaimer:</strong> Calculations are indicative estimates for decision-support purposes only and do not constitute an official loan offer, bank pre-approval, or financial advice. Actual mortgage terms depend on individual credit verification and lender underwriting.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
