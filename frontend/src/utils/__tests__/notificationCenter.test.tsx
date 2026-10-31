import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { NotificationCenter } from '../../components/NotificationCenter'
import { NotificationPreferencesModal } from '../../components/NotificationPreferencesModal'
import * as enterpriseApi from '../../crm/services/enterpriseApi'

vi.mock('../../crm/services/enterpriseApi', () => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}))

const mockNotifications: enterpriseApi.AppNotification[] = [
  {
    id: 1,
    title: 'Viewing Confirmed',
    message: 'Your viewing for Marina Tower has been confirmed.',
    category: 'appointments',
    notification_type: 'appointment_confirmed',
    action_url: '/account',
    is_read: false,
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: 2,
    title: 'Inquiry Received',
    message: 'We received your inquiry regarding Downtown 2BR.',
    category: 'inquiries',
    notification_type: 'inquiry_received',
    action_url: '/account',
    is_read: true,
    created_at: new Date(Date.now() - 60 * 60000).toISOString(),
  },
]

describe('NotificationCenter Component and API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(enterpriseApi.getUnreadNotificationCount).mockResolvedValue(1)
    vi.mocked(enterpriseApi.listNotifications).mockResolvedValue(mockNotifications)
    vi.mocked(enterpriseApi.markNotificationRead).mockResolvedValue()
    vi.mocked(enterpriseApi.markAllNotificationsRead).mockResolvedValue()
    vi.mocked(enterpriseApi.getNotificationPreferences).mockResolvedValue({
      user_email: 'test@lykarealty.ae',
      user_role: 'customer',
      recommendations: true,
      appointments: true,
      inquiries: true,
      followups: true,
      announcements: true,
      browser_push: false,
    })
  })

  it('renders NotificationCenter bell button markup cleanly in SSR/DOM', () => {
    const html = renderToString(
      <MemoryRouter>
        <NotificationCenter theme="dark" />
      </MemoryRouter>
    )

    expect(html).toContain('notification-center-root')
    expect(html).toContain('aria-label="Notifications"')
  })

  it('renders NotificationCenter light theme markup cleanly', () => {
    const html = renderToString(
      <MemoryRouter>
        <NotificationCenter theme="light" />
      </MemoryRouter>
    )

    expect(html).toContain('notification-center-root')
    expect(html).toContain('aria-label="Notifications"')
  })

  it('renders NotificationPreferencesModal when open', () => {
    const html = renderToString(
      <NotificationPreferencesModal isOpen={true} onClose={vi.fn()} />
    )

    expect(html).toContain('Notification Preferences')
    expect(html).toContain('Account &amp; Security Alerts')
    expect(html).toContain('ALWAYS ON')
    expect(html).toContain('Appointments &amp; Viewings')
    expect(html).toContain('Property Recommendations')
    expect(html).toContain('Inquiries &amp; Messages')
    expect(html).toContain('Browser Desktop Notifications')
  })

  it('does not render NotificationPreferencesModal when closed', () => {
    const html = renderToString(
      <NotificationPreferencesModal isOpen={false} onClose={vi.fn()} />
    )

    expect(html).toBe('')
  })

  it('calls API methods correctly for listing and updating notifications', async () => {
    const unread = await enterpriseApi.getUnreadNotificationCount()
    expect(unread).toBe(1)
    expect(enterpriseApi.getUnreadNotificationCount).toHaveBeenCalled()

    const list = await enterpriseApi.listNotifications()
    expect(list).toHaveLength(2)
    expect(list[0].title).toBe('Viewing Confirmed')

    await enterpriseApi.markNotificationRead(1)
    expect(enterpriseApi.markNotificationRead).toHaveBeenCalledWith(1)

    await enterpriseApi.markAllNotificationsRead()
    expect(enterpriseApi.markAllNotificationsRead).toHaveBeenCalled()
  })

  it('retrieves and updates user notification preferences correctly', async () => {
    const prefs = await enterpriseApi.getNotificationPreferences()
    expect(prefs).not.toBeNull()
    expect(prefs?.appointments).toBe(true)

    await enterpriseApi.updateNotificationPreferences({ recommendations: false })
    expect(enterpriseApi.updateNotificationPreferences).toHaveBeenCalledWith({ recommendations: false })
  })
})
