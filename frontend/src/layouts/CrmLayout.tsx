import React from 'react'

interface CrmLayoutProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
  header?: React.ReactNode
  className?: string
}

/**
 * CrmLayout provides the dashboard shell for LYKA Realty CRM, Admin, HRMS,
 * and Sales staff portals with consistent navigation, typography, and theme styling.
 */
export const CrmLayout: React.FC<CrmLayoutProps> = ({
  children,
  sidebar,
  header,
  className = '',
}) => {
  return (
    <div
      className={`lyka-crm-layout min-h-screen flex ${className}`}
      style={{
        backgroundColor: '#F8FAFC',
        color: '#0F172A',
        minHeight: '100vh',
        display: 'flex',
      }}
    >
      {sidebar && (
        <aside
          className="lyka-crm-sidebar flex-shrink-0"
          style={{
            width: '260px',
            backgroundColor: '#1E1B4B',
            color: '#FFFFFF',
          }}
        >
          {sidebar}
        </aside>
      )}
      <div className="lyka-crm-main-area flex-1 flex flex-col min-w-0" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {header && (
          <header className="lyka-crm-topbar w-full border-b border-gray-200 bg-white">
            {header}
          </header>
        )}
        <main className="lyka-crm-content-body flex-1 p-6 overflow-y-auto" style={{ flex: 1, padding: '24px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

export default CrmLayout

