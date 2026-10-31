import { Link } from 'react-router-dom'
import {
  Building2, Users, PhoneCall, Calendar,
  BarChart3, Briefcase, Clock, DollarSign, ArrowRight
} from 'lucide-react'
import type { StaffRole } from '../crm/services/staffApi'

interface RoleOperationsHubProps {
  role: StaffRole | null
  userName: string
  userEmail: string
}

export function RoleOperationsHub({ role, userName, userEmail }: RoleOperationsHubProps) {
  if (!role) return null

  const isAdmin = role === 'admin'
  const isHrmsAdmin = role === 'hrms_admin'
  const isSalesAgent = role === 'sales_agent' || role === 'salesperson'

  return (
    <section style={{
      maxWidth: '1240px',
      margin: '0 auto 36px',
      padding: '0 20px'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--plum-deep, #3B2348) 0%, #2A1435 100%)',
        borderRadius: '16px',
        padding: '24px 28px',
        color: '#FFFFFF',
        border: '1px solid var(--gold-border, #D8C28E)',
        boxShadow: '0 8px 30px rgba(26, 13, 24, 0.25)'
      }}>
        {/* Header Ribbon */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '4px', background: 'rgba(198, 161, 91, 0.25)', border: '1px solid var(--gold-primary, #C6A15B)', color: 'var(--gold-soft, #E2C98D)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              {isAdmin && '👑 Administrator Workspace'}
              {isHrmsAdmin && '👥 HRMS Admin Workspace'}
              {isSalesAgent && '🎯 Sales Agent Operations Workspace'}
            </div>
            <h2 className="luxury-serif" style={{ fontSize: '24px', color: '#FFFFFF', margin: '0 0 4px', fontWeight: 600 }}>
              Welcome back, {userName}
            </h2>
            <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.75)' }}>
              Logged in as <strong style={{ color: '#FFFFFF' }}>{userEmail}</strong> &bull; Authenticated Role: <strong style={{ color: 'var(--gold-soft, #E2C98D)' }}>{role.toUpperCase()}</strong>
            </div>
          </div>

          <Link
            to="/crm"
            className="gold-btn"
            style={{ fontSize: '13px', padding: '9px 20px', borderRadius: '8px', textDecoration: 'none' }}
          >
            Launch Full Staff Portal <ArrowRight size={14} />
          </Link>
        </div>

        {/* Role-Specific Quick Operation Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {isAdmin && (
            <>
              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Building2 size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>Company Inventory</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Add, edit, verify listings, update prices &amp; import authorized datasets.
                </div>
              </Link>

              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Users size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>CRM &amp; Sales Leads</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Company-wide lead distribution, call monitoring &amp; customer interactions.
                </div>
              </Link>

              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Briefcase size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>HRMS Workforce</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Employee oversight, payroll approvals, recruitment &amp; compliance logs.
                </div>
              </Link>

              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <BarChart3 size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>Reports &amp; Deals</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Closed transactions, revenue forecasting &amp; commission distribution.
                </div>
              </Link>
            </>
          )}

          {isHrmsAdmin && (
            <>
              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Users size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>Employee Directory</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Staff profiles, documents, designations &amp; emergency contacts.
                </div>
              </Link>

              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Clock size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>Attendance &amp; Leave</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Track employee clock-ins, review leave requests &amp; balances.
                </div>
              </Link>

              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <DollarSign size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>Payroll &amp; Payslips</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Manage monthly salaries, allowances, deductions &amp; payslips.
                </div>
              </Link>

              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Briefcase size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>Recruitment &amp; HR</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Job postings, applicant pipeline &amp; HR ticket resolutions.
                </div>
              </Link>
            </>
          )}

          {isSalesAgent && (
            <>
              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Users size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>Assigned Leads</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Manage active buyer inquiries, budgets &amp; client preferences.
                </div>
              </Link>

              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <PhoneCall size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>Contact Center</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Log customer phone calls, schedule follow-ups &amp; record notes.
                </div>
              </Link>

              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Calendar size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>Viewings &amp; Deals</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Coordinate property tours, submit proposals &amp; track commissions.
                </div>
              </Link>

              <Link
                to="/crm"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(198, 161, 91, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  textDecoration: 'none',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Clock size={18} color="var(--gold-soft, #E2C98D)" />
                  <strong style={{ fontSize: '14px' }}>My Self-Service</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Clock-in daily, review attendance, submit leave &amp; view payslips.
                </div>
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
