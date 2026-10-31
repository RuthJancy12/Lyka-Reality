import { useState, useEffect } from 'react'
import {
  Bell,
  Calendar,
  MessageSquare,
  Sparkles,
  PhoneCall,
  Megaphone,
  Shield,
  X,
  Check,
  Smartphone,
} from 'lucide-react'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../crm/services/enterpriseApi'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

export function NotificationPreferencesModal({ isOpen, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    user_email: '',
    user_role: 'customer',
    recommendations: true,
    appointments: true,
    inquiries: true,
    followups: true,
    announcements: true,
    browser_push: false,
  })

  useEffect(() => {
    if (!isOpen) return
    setSuccessMsg('')
    setLoading(true)
    getNotificationPreferences()
      .then((data) => {
        if (data) {
          setPrefs(data)
        }
      })
      .finally(() => setLoading(false))
  }, [isOpen])

  if (!isOpen) return null

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleBrowserPushToggle = async () => {
    if (!prefs.browser_push) {
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          setPrefs((prev) => ({ ...prev, browser_push: true }))
        } else if (Notification.permission !== 'denied') {
          const perm = await Notification.requestPermission()
          if (perm === 'granted') {
            setPrefs((prev) => ({ ...prev, browser_push: true }))
          } else {
            alert('Browser notifications were not granted. Please enable them in your browser settings.')
          }
        } else {
          alert('Notifications are blocked by your browser settings. Please allow notifications for this site.')
        }
      } else {
        alert('Browser notifications are not supported in your browser.')
      }
    } else {
      setPrefs((prev) => ({ ...prev, browser_push: false }))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSuccessMsg('')
    try {
      const updated = await updateNotificationPreferences(prefs)
      if (updated) {
        setPrefs(updated)
      }
      setSuccessMsg('Notification preferences updated successfully.')
      setTimeout(() => {
        if (onSaved) onSaved()
        onClose()
      }, 1000)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(26, 11, 28, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          maxWidth: '520px',
          width: '100%',
          overflow: 'hidden',
          border: '1px solid #E8DCC8',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #3B2348 0%, #200E26 100%)',
            color: '#FAF7F0',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(226, 201, 141, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#E2C98D',
              }}
            >
              <Bell size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#FAF7F0' }}>
                Notification Preferences
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'rgba(250, 247, 240, 0.7)' }}>
                Choose which notifications you wish to receive
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: '#FAF7F0',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#746875' }}>
              Loading preferences...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Mandatory Alerts Box */}
              <div
                style={{
                  background: 'rgba(59, 35, 72, 0.05)',
                  border: '1px solid rgba(59, 35, 72, 0.12)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <Shield size={20} color="#3B2348" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#3B2348' }}>
                    Account &amp; Security Alerts
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#746875' }}>
                    Critical account, security, and verification notices are always active.
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#2E7D32',
                    background: '#E8F5E9',
                    padding: '3px 8px',
                    borderRadius: '4px',
                  }}
                >
                  ALWAYS ON
                </span>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 1. Appointments */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    border: '1px solid #E8DCC8',
                    borderRadius: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Calendar size={18} color="#C6A15B" />
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#26232B' }}>
                        Appointments &amp; Viewings
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#746875' }}>
                        Bookings, confirmations, reschedules, and viewing reminders.
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.appointments}
                    onChange={() => handleToggle('appointments')}
                    style={{ width: '18px', height: '18px', accentColor: '#C6A15B', cursor: 'pointer' }}
                  />
                </div>

                {/* 2. Recommendations */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    border: '1px solid #E8DCC8',
                    borderRadius: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Sparkles size={18} color="#C6A15B" />
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#26232B' }}>
                        Property Recommendations
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#746875' }}>
                        New matches tailored to your search criteria and price updates.
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.recommendations}
                    onChange={() => handleToggle('recommendations')}
                    style={{ width: '18px', height: '18px', accentColor: '#C6A15B', cursor: 'pointer' }}
                  />
                </div>

                {/* 3. Inquiries */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    border: '1px solid #E8DCC8',
                    borderRadius: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <MessageSquare size={18} color="#C6A15B" />
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#26232B' }}>
                        Inquiries &amp; Messages
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#746875' }}>
                        Status updates and replies regarding your property inquiries.
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.inquiries}
                    onChange={() => handleToggle('inquiries')}
                    style={{ width: '18px', height: '18px', accentColor: '#C6A15B', cursor: 'pointer' }}
                  />
                </div>

                {/* 4. Followups */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    border: '1px solid #E8DCC8',
                    borderRadius: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <PhoneCall size={18} color="#C6A15B" />
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#26232B' }}>
                        Follow-ups &amp; Callbacks
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#746875' }}>
                        Scheduled advisor callbacks and consultation alerts.
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.followups}
                    onChange={() => handleToggle('followups')}
                    style={{ width: '18px', height: '18px', accentColor: '#C6A15B', cursor: 'pointer' }}
                  />
                </div>

                {/* 5. Announcements */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    border: '1px solid #E8DCC8',
                    borderRadius: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Megaphone size={18} color="#C6A15B" />
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#26232B' }}>
                        Announcements &amp; News
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#746875' }}>
                        Company updates, luxury market briefings, and holiday notices.
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.announcements}
                    onChange={() => handleToggle('announcements')}
                    style={{ width: '18px', height: '18px', accentColor: '#C6A15B', cursor: 'pointer' }}
                  />
                </div>

                {/* 6. Desktop Push Alerts */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    border: '1px solid #E8DCC8',
                    borderRadius: '10px',
                    background: prefs.browser_push ? 'rgba(198, 161, 91, 0.08)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Smartphone size={18} color="#C6A15B" />
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#26232B' }}>
                        Browser Desktop Notifications
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#746875' }}>
                        Receive instant alerts on your desktop when active in LYKA.
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.browser_push}
                    onChange={handleBrowserPushToggle}
                    style={{ width: '18px', height: '18px', accentColor: '#C6A15B', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {successMsg && (
                <div
                  style={{
                    background: '#E8F5E9',
                    color: '#2E7D32',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Check size={16} /> {successMsg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E8DCC8',
            background: '#FAF7F0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid #E8DCC8',
              background: '#FFFFFF',
              color: '#3B2348',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              padding: '9px 22px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--gold-gradient, linear-gradient(135deg, #C6A15B 0%, #B89248 100%))',
              color: '#200E26',
              fontSize: '13px',
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  )
}
