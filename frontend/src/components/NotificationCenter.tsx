import { useState, useEffect, useRef, useCallback, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  CheckCheck,
  Calendar,
  MessageSquare,
  Sparkles,
  PhoneCall,
  Megaphone,
  Shield,
  Settings,
  ChevronRight,
} from 'lucide-react'
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '../crm/services/enterpriseApi'
import { NotificationPreferencesModal } from './NotificationPreferencesModal'

interface Props {
  className?: string
  style?: CSSProperties
  theme?: 'dark' | 'light'
}

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    if (diffMs < 0) return 'Just now'
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  } catch {
    return 'Recently'
  }
}

function getCategoryIcon(category?: string, notificationType?: string | null) {
  const cat = (category || notificationType || '').toLowerCase()
  if (cat.includes('appoint') || cat.includes('viewing')) return <Calendar size={15} color="#C6A15B" />
  if (cat.includes('inquir') || cat.includes('message') || cat.includes('ticket')) return <MessageSquare size={15} color="#3B2348" />
  if (cat.includes('rec') || cat.includes('property')) return <Sparkles size={15} color="#C6A15B" />
  if (cat.includes('follow') || cat.includes('call')) return <PhoneCall size={15} color="#8E6A2B" />
  if (cat.includes('announce') || cat.includes('leave') || cat.includes('hrms')) return <Megaphone size={15} color="#5A3A69" />
  return <Shield size={15} color="#746875" />
}

export function NotificationCenter({ className, style, theme = 'dark' }: Props) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all')
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef<number>(0)

  // 1. Fetch unread count
  const refreshUnreadCount = useCallback(async () => {
    try {
      const count = await getUnreadNotificationCount()
      setUnreadCount(count)
      // Check if count increased and trigger browser notification if permitted
      if (count > prevCountRef.current && prevCountRef.current > 0) {
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('LYKA Realty Notification', {
              body: 'You have new notifications in your account.',
              icon: '/favicon.ico',
            })
          } catch {
            // ignore
          }
        }
      }
      prevCountRef.current = count
    } catch {
      // ignore
    }
  }, [])

  // 2. Fetch full notifications list
  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listNotifications(false, 50)
      setNotifications(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  // 3. Periodic polling & visibility listener
  useEffect(() => {
    refreshUnreadCount()

    // 25-second polling interval
    const interval = setInterval(refreshUnreadCount, 25000)

    // Visibility / Focus synchronization
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshUnreadCount()
        if (isOpen) {
          loadNotifications()
        }
      }
    }

    const handleFocus = () => {
      refreshUnreadCount()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [refreshUnreadCount, loadNotifications, isOpen])

  // 4. Load full list when opening dropdown
  const toggleDropdown = () => {
    if (!isOpen) {
      loadNotifications()
      refreshUnreadCount()
    }
    setIsOpen(!isOpen)
  }

  // 5. Close on outside click or Escape
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // 6. Action handlers
  const handleMarkAsRead = async (e: ReactMouseEvent, item: AppNotification) => {
    e.stopPropagation()
    if (item.is_read) return
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    await markNotificationRead(item.id)
  }

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
    await markAllNotificationsRead()
  }

  const handleNotificationClick = async (item: AppNotification) => {
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
      await markNotificationRead(item.id)
    }
    setIsOpen(false)

    const targetUrl = item.action_url || item.link_url
    if (targetUrl) {
      navigate(targetUrl)
    }
  }

  const filteredNotifications =
    activeTab === 'unread'
      ? notifications.filter((n) => !n.is_read)
      : notifications

  const isLight = theme === 'light'
  const buttonBorder = isLight ? '#E8DCC8' : 'rgba(255, 255, 255, 0.15)'
  const buttonBg = isLight ? '#FFFFFF' : 'rgba(255, 255, 255, 0.08)'
  const iconColor = isLight ? '#3B2348' : '#FAF7F0'

  return (
    <div
      ref={dropdownRef}
      className={`notification-center-root ${className || ''}`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}
    >
      {/* Bell Icon Button */}
      <button
        type="button"
        onClick={toggleDropdown}
        aria-label="Notifications"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: buttonBg,
          border: `1px solid ${buttonBorder}`,
          cursor: 'pointer',
          color: iconColor,
          transition: 'all 0.2s',
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              minWidth: '18px',
              height: '18px',
              padding: '0 4px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #E2C98D 0%, #C6A15B 100%)',
              color: '#200E26',
              fontSize: '10.5px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
              border: '1.5px solid #FFFFFF',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="region"
          aria-label="Notifications Dropdown"
          style={{
            position: 'absolute',
            top: '44px',
            right: 0,
            width: '380px',
            maxWidth: '92vw',
            background: '#FFFFFF',
            borderRadius: '14px',
            boxShadow: '0 12px 36px rgba(32, 14, 38, 0.2)',
            border: '1px solid #E8DCC8',
            zIndex: 9990,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #3B2348 0%, #200E26 100%)',
              color: '#FAF7F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#FAF7F0' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: '#C6A15B',
                    color: '#200E26',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: '10px',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#E2C98D',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 6px',
                    borderRadius: '4px',
                  }}
                  title="Mark all as read"
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setPreferencesOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(250, 247, 240, 0.7)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                }}
                title="Notification Settings"
              >
                <Settings size={15} />
              </button>
            </div>
          </div>

          {/* Tabs Filter */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #E8DCC8',
              background: '#FAF7F0',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              style={{
                flex: 1,
                padding: '9px 0',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'all' ? '2.5px solid #C6A15B' : '2.5px solid transparent',
                color: activeTab === 'all' ? '#3B2348' : '#746875',
                fontWeight: activeTab === 'all' ? 700 : 500,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              style={{
                flex: 1,
                padding: '9px 0',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'unread' ? '2.5px solid #C6A15B' : '2.5px solid transparent',
                color: activeTab === 'unread' ? '#3B2348' : '#746875',
                fontWeight: activeTab === 'unread' ? 700 : 500,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notification List */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#746875', fontSize: '13px' }}>
                Loading notifications...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: '#746875' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: 'rgba(198, 161, 91, 0.15)',
                    color: '#C6A15B',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <Check size={20} />
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#3B2348', marginBottom: '4px' }}>
                  You're all caught up!
                </div>
                <div style={{ fontSize: '12px', color: '#746875' }}>
                  {activeTab === 'unread'
                    ? 'No unread notifications at the moment.'
                    : 'No notifications have been received yet.'}
                </div>
              </div>
            ) : (
              filteredNotifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 16px',
                    borderBottom: '1px solid #F0EAE1',
                    background: item.is_read ? '#FFFFFF' : 'rgba(198, 161, 91, 0.08)',
                    cursor: (item.action_url || item.link_url) ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Category Icon */}
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: item.is_read ? '#F6F3EE' : 'rgba(198, 161, 91, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getCategoryIcon(item.category, item.notification_type)}
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: item.is_read ? 600 : 700,
                          color: '#3B2348',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title}
                      </span>
                      <span style={{ fontSize: '11px', color: '#8E7D8F', flexShrink: 0 }}>
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </div>

                    <p
                      style={{
                        margin: '3px 0 6px',
                        fontSize: '12px',
                        color: '#4A3E4D',
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.message}
                    </p>

                    {(item.action_url || item.link_url) && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#C6A15B',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        View Details <ChevronRight size={11} />
                      </span>
                    )}
                  </div>

                  {/* Unread dot / Mark read */}
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    {!item.is_read ? (
                      <button
                        type="button"
                        onClick={(e) => handleMarkAsRead(e, item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px',
                        }}
                        title="Mark as read"
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#C6A15B',
                            display: 'block',
                          }}
                        />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 16px',
              background: '#FAF7F0',
              borderTop: '1px solid #E8DCC8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11.5px',
              color: '#746875',
            }}
          >
            <span>Real-time notifications</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setPreferencesOpen(true)
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#3B2348',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '11.5px',
              }}
            >
              Preferences
            </button>
          </div>
        </div>
      )}

      {/* Preferences Modal */}
      <NotificationPreferencesModal
        isOpen={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        onSaved={refreshUnreadCount}
      />
    </div>
  )
}
