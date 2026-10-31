import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getContactCenterSummary,
  listContacts,
  getDailyCallHistory,
  getLeadDetails,
  getSlaConfig,
  updateSlaConfig,
  logContactCall,
} from '../../crm/services/contactCenterApi'

describe('CRM Contact Center & Call Monitoring', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches contact center summary correctly', async () => {
    const mockSummary = {
      total_leads: 25,
      contacted_leads: 18,
      not_contacted_leads: 7,
      connected_leads: 12,
      not_connected_leads: 6,
      pending_followups: 4,
      calls_today: 15,
      connected_today: 10,
      connection_rate: 66.7,
      avg_duration_minutes: 5.4,
      sla_breaches_count: 2,
      sla_threshold_hours: 24,
    }

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockSummary,
    })))

    const summary = await getContactCenterSummary()
    expect(summary.total_leads).toBe(25)
    expect(summary.connected_leads).toBe(12)
    expect(summary.connection_rate).toBe(66.7)
    expect(summary.sla_breaches_count).toBe(2)
  })

  it('formats query parameters correctly for filtered contacts', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrl = url
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          page: 1,
          limit: 20,
          total_pages: 1,
          contacts: [
            {
              lead_id: 101,
              customer_name: 'Sara Khan',
              contact_phone: '+971501234567',
              contact_email: 'sara@example.com',
              location: 'Dubai Marina',
              property_type: 'Apartment',
              lead_temperature: 'Hot',
              status: 'new',
              lead_source: 'Instagram',
              first_call_status: 'connected',
              total_call_attempts: 1,
              is_connected: true,
              sla_hours_elapsed: 28.5,
              sla_breached: true,
            },
          ],
        }),
      }
    }))

    const res = await listContacts({
      tab: 'not_contacted',
      search: 'Sara',
      temperature: 'Hot',
      sla_breached_only: true,
      page: 1,
      limit: 20,
      sort_by: 'newest',
    })

    expect(capturedUrl).toContain('/api/staff/contact-center/contacts?')
    expect(capturedUrl).toContain('tab=not_contacted')
    expect(capturedUrl).toContain('search=Sara')
    expect(capturedUrl).toContain('temperature=Hot')
    expect(capturedUrl).toContain('sla_breached_only=true')
    expect(res.contacts[0].customer_name).toBe('Sara Khan')
    expect(res.contacts[0].lead_source).toBe('Instagram')
    expect(res.contacts[0].first_call_status).toBe('connected')
    expect(res.contacts[0].sla_breached).toBe(true)
  })

  it('handles missing phone numbers without fabricating fake data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        total: 1,
        page: 1,
        limit: 20,
        total_pages: 1,
        contacts: [
          {
            lead_id: 102,
            customer_name: 'Anonymous Lead',
            contact_phone: '',
            contact_email: 'test@example.com',
            location: 'Downtown Dubai',
            property_type: 'Penthouse',
            lead_temperature: 'Warm',
            status: 'new',
            total_call_attempts: 0,
            is_connected: false,
            sla_hours_elapsed: 5.0,
            sla_breached: false,
          },
        ],
      }),
    })))

    const res = await listContacts({ tab: 'all' })
    const c = res.contacts[0]
    expect(c.contact_phone).toBe('')
    const displayPhone = c.contact_phone && c.contact_phone.trim() ? c.contact_phone : 'Phone number not provided'
    expect(displayPhone).toBe('Phone number not provided')
  })

  it('queries call history with preset date filters', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrl = url
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total_calls: 3,
          calls: [
            {
              id: 1,
              lead_id: 101,
              customer_name: 'Sara Khan',
              contact_phone: '+971501234567',
              staff_email: 'bruns0866@gmail.com',
              staff_name: 'Agent Bruns',
              status: 'connected',
              attempt_number: 1,
              is_first_call: true,
              duration_minutes: 6,
              attempted_at: '2026-10-30T10:00:00Z',
              notes: 'Discussed Marina 2BHK',
              customer_response: 'Prefers sea view',
              recommended_action: 'Send brochure',
              next_follow_up_at: '2026-11-02T10:00:00Z',
              is_connected: true,
            },
          ],
        }),
      }
    }))

    const res = await getDailyCallHistory({
      date_preset: 'today',
      status: 'connected',
      limit: 25,
    })

    expect(capturedUrl).toContain('/api/staff/contact-center/daily-history?')
    expect(capturedUrl).toContain('date_preset=today')
    expect(capturedUrl).toContain('status=connected')
    expect(capturedUrl).toContain('limit=25')
    expect(res.calls[0].customer_name).toBe('Sara Khan')
    expect(res.calls[0].attempt_number).toBe(1)
    expect(res.calls[0].is_first_call).toBe(true)
    expect(res.calls[0].next_follow_up_at).toBe('2026-11-02T10:00:00Z')
  })

  it('logs call with structured outcome, response, and attempt data', async () => {
    let sentBody: any = null
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.body) {
        sentBody = JSON.parse(options.body as string)
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 42, ...sentBody }),
      }
    }))

    await logContactCall({
      lead_id: 101,
      status: 'connected',
      duration_minutes: 8,
      notes: 'Customer interested in 2BHK',
      customer_response: 'Wants sea view unit under 2.5M',
      recommended_action: 'Send marina gate brochures',
      lead_temperature: 'Hot',
    })

    expect(sentBody).not.toBeNull()
    expect(sentBody.lead_id).toBe(101)
    expect(sentBody.status).toBe('connected')
    expect(sentBody.duration_minutes).toBe(8)
    expect(sentBody.customer_response).toBe('Wants sea view unit under 2.5M')
    expect(sentBody.recommended_action).toBe('Send marina gate brochures')
    expect(sentBody.lead_temperature).toBe('Hot')
  })

  it('fetches lead details with complete first call, latest call and next recommended action', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        lead: {
          id: 101,
          customer_name: 'Sara Khan',
          contact_email: 'sara@example.com',
          contact_phone: '+971501234567',
          location: 'Dubai Marina',
          property_type: 'Apartment',
          purpose: 'Buy',
          budget_max: 2500000,
          lead_temperature: 'Hot',
          lead_source: 'Google Ads',
        },
        stats: {
          total_calls: 2,
          connected_calls: 1,
          open_followups: 1,
          viewings_count: 0,
        },
        first_call: {
          date: '2026-10-29T10:00:00Z',
          status: 'connected',
          outcome: 'connected',
          notes: 'Spoke with client',
        },
        latest_call: {
          date: '2026-10-30T10:00:00Z',
          status: 'connected',
          outcome: 'connected',
          notes: 'Follow-up discussion',
          customer_response: 'Ready to view this weekend',
          recommended_action: 'Schedule in-person tour on Saturday',
        },
        next_recommended_action: 'Schedule in-person tour on Saturday',
        timeline: [
          {
            type: 'call',
            time: '2026-10-30T10:00:00Z',
            title: 'Call #2: Connected',
            is_connected: true,
            details: {
              status: 'connected',
              duration_minutes: 8,
              customer_response: 'Ready to view this weekend',
            },
          },
        ],
      }),
    })))

    const details = await getLeadDetails(101)
    expect(details.lead.customer_name).toBe('Sara Khan')
    expect(details.lead.lead_source).toBe('Google Ads')
    expect(details.stats.total_calls).toBe(2)
    expect(details.first_call?.status).toBe('connected')
    expect(details.latest_call?.customer_response).toBe('Ready to view this weekend')
    expect(details.next_recommended_action).toBe('Schedule in-person tour on Saturday')
    expect(details.timeline).toHaveLength(1)
  })

  it('retrieves and updates SLA config', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') {
        const body = JSON.parse(options.body as string)
        return {
          ok: true,
          status: 200,
          json: async () => ({ threshold_hours: body.threshold_hours }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ threshold_hours: 24 }),
      }
    }))

    const initial = await getSlaConfig()
    expect(initial.threshold_hours).toBe(24)

    const updated = await updateSlaConfig(12)
    expect(updated.threshold_hours).toBe(12)
  })
})
