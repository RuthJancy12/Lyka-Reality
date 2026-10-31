import { Loader2 } from 'lucide-react'
import { useStaffRole } from '../services/staffApi'
import { AdminDashboard } from './AdminDashboard'
import { HrmsAdminDashboard } from './HrmsAdminDashboard'
import { SalesPersonDashboard } from './SalesPersonDashboard'

export function Dashboard() {
  const { role, loading } = useStaffRole()

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        gap: '10px',
        color: 'var(--text-secondary)',
        fontSize: '14px',
      }}>
        <Loader2 size={24} color="var(--gold-dark)" style={{ animation: 'spin 0.8s linear infinite' }} />
        <span>Loading role-specific CRM dashboard…</span>
      </div>
    )
  }

  // Exact 3-role separation matching specification:
  // 1. HRMS Admin Dashboard
  if (role === 'hrms_admin') {
    return <HrmsAdminDashboard />
  }

  // 2. Sales Agent Dashboard
  if (role === 'sales_agent' || role === 'salesperson') {
    return <SalesPersonDashboard />
  }

  // 3. Admin / Owner Dashboard
  if (role === 'admin' || role === 'manager') {
    return <AdminDashboard />
  }

  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <h3 style={{ fontSize: '18px', color: 'var(--plum-main)', marginBottom: '8px' }}>Staff Access Verification</h3>
      <p style={{ fontSize: '14px' }}>Your account role does not have an active dashboard view. Please contact your administrator.</p>
    </div>
  )
}
