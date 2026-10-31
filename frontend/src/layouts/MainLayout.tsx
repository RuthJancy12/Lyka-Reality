import React from 'react'

interface MainLayoutProps {
  children: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * MainLayout provides the standard container structure for LYKA Realty public pages,
 * framing the content with consistent brand spacing, luxury colors, and header/footer slots.
 */
export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  header,
  footer,
  className = '',
}) => {
  return (
    <div
      className={`lyka-main-layout min-h-screen flex flex-col ${className}`}
      style={{
        backgroundColor: 'var(--brand-ivory, #FAF7F0)',
        color: 'var(--brand-plum, #1A0B2E)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {header && <header className="lyka-header-slot w-full">{header}</header>}
      <main className="lyka-main-content flex-1 w-full" style={{ flex: 1 }}>
        {children}
      </main>
      {footer && <footer className="lyka-footer-slot w-full mt-auto">{footer}</footer>}
    </div>
  )
}

export default MainLayout

