import { RoleMyAccountModal } from '../../components/RoleMyAccountModal'
import { NotificationCenter } from '../../components/NotificationCenter'
import { useState } from 'react'
// /crm staff area: role-filtered navigation reusing the existing CRM pages
// plus team operations, personal workspace, and team management.
// Every route re-checks the backend-verified role; the backend enforces all
// data permissions regardless of what the nav shows.

import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom'
import { LayoutDashboard, PhoneCall, DollarSign, Users, Building2, ClipboardList, Briefcase, ContactRound, LogOut, Home, ShieldCheck, Loader2, Megaphone, Clock, Calendar, Award, FileText, MessageSquare } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { HrmsAdminDashboard } from '../pages/HrmsAdminDashboard'
import { EmployeeSelfService } from '../components/EmployeeSelfService'
import { useAuth } from '../../context/AuthContext'
import { RequireStaff } from '../components/RequireStaff'
import { useStaffRole, clearStaffMeCache, type StaffRole } from '../services/staffApi'
import { clearLocalUser } from '../../services/chatStore'
import { Dashboard } from '../pages/Dashboard'
import { LeadManagement } from '../pages/LeadManagement'
import { LeadAnalysis } from '../pages/LeadAnalysis'
import { NewEnquiry } from '../pages/NewEnquiry'
import { PropertyManagement } from '../pages/PropertyManagement'
import { AdAnalytics } from '../pages/AdAnalytics'
import { MyWork } from '../pages/MyWork'
import { TeamOps } from '../pages/TeamOps'
import { Team } from '../pages/Team'
import { ProjectProgress } from '../pages/ProjectProgress'
import { Customers } from '../pages/Customers'
import { AdminConsole } from '../pages/AdminConsole'
import { AdminCareers } from '../pages/AdminCareers'
import { SupportDesk } from '../pages/SupportDesk'
import { ContactCenter } from '../pages/ContactCenter'
import { CallHistory } from '../pages/CallHistory'
import { DealsManagement } from '../pages/DealsManagement'
import { ErrorBoundary } from '../components/ErrorBoundary'

const ALL_STAFF: StaffRole[] = ['admin', 'manager', 'hrms_admin', 'sales_agent', 'salesperson', 'sales_manager']
const LEAD_ROLES: StaffRole[] = ['admin', 'manager', 'sales_manager']

interface NavItem {
  to: string
  label: string
  icon: typeof Home
  roles: StaffRole[]
  end?: boolean
}

function EmployeeSelfServiceWrapper() {
  const [searchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as any) || 'profile'
  return (
    <div style={{ padding: '24px 28px', background: 'var(--champagne-light, #FAF8F4)', minHeight: '100%' }}>
      <EmployeeSelfService initialTab={tab} />
    </div>
  )
}

function getNavItems(role: StaffRole | null): NavItem[] {
  if (!role) return []

  if (role === 'admin' || role === 'manager') {
    return [
      { to: '/crm', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager'], end: true },
      { to: '/crm/ops', label: 'CRM Management', icon: ClipboardList, roles: ['admin', 'manager'] },
      { to: '/crm/leads', label: 'Leads', icon: Users, roles: ['admin', 'manager'] },
      { to: '/crm/contact-monitoring', label: 'Contact Center', icon: PhoneCall, roles: ['admin', 'manager'] },
      { to: '/crm/properties', label: 'Properties', icon: Building2, roles: ['admin', 'manager'] },
      { to: '/crm/deals', label: 'Deals & Revenue', icon: DollarSign, roles: ['admin', 'manager'] },
      { to: '/crm/ads', label: 'Ads & Analytics', icon: Megaphone, roles: ['admin', 'manager'] },
      { to: '/crm/hrms', label: 'HRMS Management', icon: ShieldCheck, roles: ['admin', 'manager'] },
      { to: '/crm/employees', label: 'Employee Directory', icon: ContactRound, roles: ['admin', 'manager'] },
      { to: '/crm/careers', label: 'Recruitment', icon: Briefcase, roles: ['admin', 'manager'] },
      { to: '/crm/team', label: 'Team', icon: Users, roles: ['admin', 'manager'] },
      { to: '/crm/admin', label: 'Settings', icon: ShieldCheck, roles: ['admin', 'manager'] },
    ]
  }

  if (role === 'hrms_admin') {
    return [
      { to: '/crm', label: 'Dashboard', icon: LayoutDashboard, roles: ['hrms_admin'], end: true },
      { to: '/crm/employees', label: 'Employee Directory', icon: ContactRound, roles: ['hrms_admin'] },
      { to: '/crm/attendance', label: 'Attendance', icon: Clock, roles: ['hrms_admin'] },
      { to: '/crm/leaves', label: 'Leave Management', icon: Calendar, roles: ['hrms_admin'] },
      { to: '/crm/payroll', label: 'Payroll', icon: DollarSign, roles: ['hrms_admin'] },
      { to: '/crm/careers', label: 'Recruitment & Careers', icon: Briefcase, roles: ['hrms_admin'] },
      { to: '/crm/performance', label: 'Performance', icon: Award, roles: ['hrms_admin'] },
      { to: '/crm/documents', label: 'Employee Documents', icon: FileText, roles: ['hrms_admin'] },
      { to: '/crm/hr-requests', label: 'HR Requests', icon: MessageSquare, roles: ['hrms_admin'] },
      { to: '/crm/hr-reports', label: 'HR Reports', icon: ShieldCheck, roles: ['hrms_admin'] },
    ]
  }

  // Sales Agent (also handles legacy salesperson)
  return [
    { to: '/crm', label: 'Dashboard', icon: LayoutDashboard, roles: ['sales_agent', 'salesperson'], end: true },
    { to: '/crm/leads', label: 'Leads', icon: Users, roles: ['sales_agent', 'salesperson'] },
    { to: '/crm/contact-center', label: 'Contact Center', icon: PhoneCall, roles: ['sales_agent', 'salesperson'] },
    { to: '/crm/my', label: 'My Work', icon: Briefcase, roles: ['sales_agent', 'salesperson'] },
    { to: '/crm/deals', label: 'Deals & Revenue', icon: DollarSign, roles: ['sales_agent', 'salesperson'] },
    { to: '/crm/self-service?tab=attendance', label: 'My Attendance', icon: Clock, roles: ['sales_agent', 'salesperson'] },
    { to: '/crm/self-service?tab=leaves', label: 'Apply for Leave', icon: Calendar, roles: ['sales_agent', 'salesperson'] },
    { to: '/crm/self-service?tab=requests', label: 'My HR Requests', icon: MessageSquare, roles: ['sales_agent', 'salesperson'] },
    { to: '/crm/self-service?tab=payslips', label: 'My Payslips', icon: DollarSign, roles: ['sales_agent', 'salesperson'] },
    { to: '/crm/self-service?tab=profile', label: 'My Profile', icon: ContactRound, roles: ['sales_agent', 'salesperson'] },
  ]
}

function StaffShell({ children }: { children: React.ReactNode }) {
  const { role } = useStaffRole()
  const { user, logout } = useAuth()
  const items = getNavItems(role)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  return (
    <div className="crm-shell" style={{ minHeight: '100vh', background: 'var(--champagne-light, #FAF8F4)', display: 'flex' }}>
      <aside
        className="crm-aside"
        style={{
          width: '240px',
          flexShrink: 0,
          background: 'linear-gradient(180deg, #1C0A1E 0%, #28102B 55%, #18081B 100%)',
          borderRight: '1px solid rgba(197, 168, 105, 0.2)',
          boxShadow: '4px 0 24px rgba(18, 6, 20, 0.3)',
          padding: '24px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        <Link
          to="/"
          style={{
            textDecoration: 'none',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: '18px',
            padding: '4px 12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            letterSpacing: '0.04em',
            borderBottom: '1px solid rgba(197, 168, 105, 0.15)',
            marginBottom: '10px',
          }}
        >
          <span className="luxury-serif">LYKA</span>
          <span style={{ color: 'var(--gold-hover, #D8BD80)', fontSize: '13px', fontWeight: 700, padding: '2px 8px', background: 'rgba(197, 168, 105, 0.15)', border: '1px solid rgba(197, 168, 105, 0.3)', borderRadius: '6px' }}>
            CRM
          </span>
        </Link>
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              padding: '10px 14px',
              borderRadius: '9px',
              fontSize: '13.5px',
              fontWeight: isActive ? 700 : 500,
              textDecoration: 'none',
              transition: 'all 0.18s ease',
              color: isActive ? '#FFFFFF' : 'rgba(251, 248, 243, 0.72)',
              background: isActive
                ? 'linear-gradient(135deg, rgba(197, 168, 105, 0.22) 0%, rgba(62, 30, 56, 0.6) 100%)'
                : 'transparent',
              borderLeft: isActive ? '3px solid var(--gold-primary, #C5A869)' : '3px solid transparent',
              boxShadow: isActive ? '0 2px 10px rgba(0, 0, 0, 0.18)' : 'none',
            })}
          >
            <n.icon size={16} color="currentColor" /> {n.label}
          </NavLink>
        ))}
        <div
          className="crm-userbox"
          style={{
            marginTop: 'auto',
            padding: '16px 12px 4px',
            borderTop: '1px solid rgba(197, 168, 105, 0.18)',
            fontSize: '12px',
            color: 'rgba(251, 248, 243, 0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px', gap: '8px' }}>
            <div style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
              {user?.name || user?.email}
            </div>
            <NotificationCenter theme="dark" />
          </div>
          <div style={{ display: 'inline-block', margin: '4px 0 10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(197, 168, 105, 0.15)', color: 'var(--gold-hover, #D8BD80)', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' }}>
            {role?.replace('_', ' ')}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setAccountModalOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--gold-hover, #D8BD80)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              My Account
            </button>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>&bull;</span>
            <Link to="/" style={{ color: 'var(--gold-hover, #D8BD80)', fontSize: '12px', textDecoration: 'none', fontWeight: 600 }}>Site</Link>
            <button
              type="button"
              onClick={() => { clearStaffMeCache(); clearLocalUser(); logout() }}
              style={{
                background: 'none',
                border: 'none',
                color: '#E8A598',
                cursor: 'pointer',
                fontSize: '12px',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <LogOut size={12} /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="crm-main" style={{ flex: 1, minWidth: 0, padding: '28px 32px', maxWidth: '1360px' }}>{children}</main>
      <RoleMyAccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
      />
    </div>
  )
}

function RoleIndex() {
  const { role, loading } = useStaffRole()
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--text-secondary)', fontSize: '14px' }}>
        Verifying staff access…
      </div>
    )
  }
  if (!role) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '36px', textAlign: 'center', maxWidth: '520px', margin: '40px auto' }}>
        <h3 className="luxury-serif" style={{ fontSize: '20px', color: 'var(--plum-main)', marginBottom: '8px' }}>
          Staff access required
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
          This area is reserved for the LYKA team. Customers can use the property search, favorites, and account pages on the main site.
        </p>
        <Link to="/" className="gold-btn" style={{ display: 'inline-block', padding: '10px 22px', textDecoration: 'none' }}>
          Back to site
        </Link>
      </div>
    )
  }
  return <Navigate to="/crm" replace />
}

export function StaffArea() {
  const { role, loading } = useStaffRole()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--champagne-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
        <Loader2 size={24} color="var(--gold-dark)" style={{ animation: 'spin 0.8s linear infinite', marginRight: '8px' }} />
        Verifying staff access…
      </div>
    )
  }

  if (!role) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--champagne-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid var(--champagne-border)', borderRadius: '12px', padding: '40px 32px', textAlign: 'center', maxWidth: '500px', width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--champagne-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Building2 size={24} color="var(--gold-dark)" />
          </div>
          <h2 className="luxury-serif" style={{ fontSize: '22px', color: 'var(--plum-main)', marginBottom: '8px' }}>
            Staff CRM Access Required
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
            This portal is restricted to authorized LYKA team members. As a customer, you can view your saved properties, inquiries, and preferences in your dedicated Customer Portal.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/account" className="gold-btn" style={{ padding: '10px 22px', textDecoration: 'none', fontSize: '13px' }}>
              Go to Customer Portal
            </Link>
            <Link to="/" style={{ padding: '10px 22px', textDecoration: 'none', fontSize: '13px', color: 'var(--text-main)', border: '1px solid var(--champagne-border)', borderRadius: '6px', background: '#fff' }}>
              Browse Properties
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <StaffShell>
      <ErrorBoundary>
      <Routes>
        <Route path="/crm" element={<RequireStaff roles={ALL_STAFF}><Dashboard /></RequireStaff>} />
        <Route path="/crm/leads" element={<RequireStaff roles={ALL_STAFF}><LeadManagement /></RequireStaff>} />
        <Route path="/crm/contact-center" element={<RequireStaff roles={ALL_STAFF}><ContactCenter /></RequireStaff>} />
        <Route path="/crm/contact-monitoring" element={<RequireStaff roles={['admin', 'manager', 'sales_manager']}><ContactCenter /></RequireStaff>} />
        <Route path="/crm/team-monitoring" element={<RequireStaff roles={['manager', 'sales_manager']}><ContactCenter /></RequireStaff>} />
        <Route path="/crm/call-history" element={<RequireStaff roles={ALL_STAFF}><CallHistory /></RequireStaff>} />
        <Route path="/crm/leads/:id" element={<RequireStaff roles={ALL_STAFF}><LeadAnalysis /></RequireStaff>} />
        <Route path="/crm/enquiry" element={<RequireStaff roles={LEAD_ROLES}><NewEnquiry /></RequireStaff>} />
        <Route path="/crm/properties" element={<RequireStaff roles={ALL_STAFF}><PropertyManagement /></RequireStaff>} />
        <Route path="/crm/ads" element={<RequireStaff roles={ALL_STAFF}><AdAnalytics /></RequireStaff>} />
        <Route path="/crm/ops" element={<RequireStaff roles={LEAD_ROLES}><TeamOps /></RequireStaff>} />
        <Route path="/crm/my" element={<RequireStaff roles={ALL_STAFF}><MyWork /></RequireStaff>} />
        <Route path="/crm/team" element={<RequireStaff roles={LEAD_ROLES}><Team /></RequireStaff>} />
        <Route path="/crm/customers" element={<RequireStaff roles={['admin', 'manager']}><Customers /></RequireStaff>} />
        <Route path="/crm/progress" element={<RequireStaff roles={LEAD_ROLES}><ProjectProgress /></RequireStaff>} />
        <Route path="/crm/admin" element={<RequireStaff roles={['admin']}><AdminConsole /></RequireStaff>} />
        <Route path="/crm/careers" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><AdminCareers /></RequireStaff>} />
        <Route path="/crm/recruitment" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/deals" element={<RequireStaff roles={ALL_STAFF}><DealsManagement /></RequireStaff>} />
        <Route path="/crm/support" element={<RequireStaff roles={ALL_STAFF}><SupportDesk /></RequireStaff>} />
        <Route path="/crm/hrms" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/employees" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/attendance" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/leaves" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/payroll" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/performance" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/documents" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/hr-requests" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/hr-reports" element={<RequireStaff roles={['admin', 'manager', 'hrms_admin']}><HrmsAdminDashboard /></RequireStaff>} />
        <Route path="/crm/self-service" element={<RequireStaff roles={ALL_STAFF}><EmployeeSelfServiceWrapper /></RequireStaff>} />
        <Route path="*" element={<RoleIndex />} />
      </Routes>
          </ErrorBoundary>
    </StaffShell>
  )
}
