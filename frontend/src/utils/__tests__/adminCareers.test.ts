import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listCareerJobs,
  createCareerJob,
  updateCareerJobStatus,
  listJobApplications,
  updateJobApplicationStatus,
  getCareerStats,
} from '../../crm/services/staffApi'

describe('Admin Careers & Recruitment Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('listCareerJobs formats search query parameters correctly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 1,
          title: 'Senior Property Consultant',
          department: 'Sales',
          status: 'active',
          applications_count: 5,
        },
      ],
    })
    globalThis.fetch = fetchMock

    const jobs = await listCareerJobs({ status: 'active', department: 'Sales', q: 'Luxury' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const callUrl = fetchMock.mock.calls[0][0] as string
    expect(callUrl).toContain('/api/admin/careers/jobs')
    expect(callUrl).toContain('status=active')
    expect(callUrl).toContain('department=Sales')
    expect(callUrl).toContain('q=Luxury')
    expect(jobs).toHaveLength(1)
    expect(jobs[0].title).toBe('Senior Property Consultant')
  })

  it('createCareerJob sends JSON payload with POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 2,
        title: 'Marketing Director',
        department: 'Marketing',
        status: 'active',
        applications_count: 0,
      }),
    })
    globalThis.fetch = fetchMock

    const newJob = await createCareerJob({
      title: 'Marketing Director',
      department: 'Marketing',
      description: 'Lead omni-channel luxury branding across UAE.',
      status: 'active',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/admin/careers/jobs')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string).title).toBe('Marketing Director')
    expect(newJob.id).toBe(2)
  })

  it('updateCareerJobStatus updates status via PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, status: 'paused' }),
    })
    globalThis.fetch = fetchMock

    const updated = await updateCareerJobStatus(1, 'paused')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/admin/careers/jobs/1/status')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(init?.body as string).status).toBe('paused')
    expect(updated.status).toBe('paused')
  })

  it('listJobApplications queries applications with job_id and status filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: 101, job_id: 1, applicant_name: 'John Doe', status: 'received' },
      ],
    })
    globalThis.fetch = fetchMock

    const apps = await listJobApplications({ job_id: 1, status: 'received' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const callUrl = fetchMock.mock.calls[0][0] as string
    expect(callUrl).toContain('/api/admin/careers/applications')
    expect(callUrl).toContain('job_id=1')
    expect(callUrl).toContain('status=received')
    expect(apps).toHaveLength(1)
    expect(apps[0].applicant_name).toBe('John Doe')
  })

  it('updateJobApplicationStatus updates candidate status and notes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 10, status: 'shortlisted', notes: 'Top candidate' }),
    })
    globalThis.fetch = fetchMock

    const updated = await updateJobApplicationStatus(10, 'shortlisted', 'Top candidate')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/admin/careers/applications/10/status')
    expect(init?.method).toBe('PATCH')
    const body = JSON.parse(init?.body as string)
    expect(body.status).toBe('shortlisted')
    expect(body.notes).toBe('Top candidate')
    expect(updated.status).toBe('shortlisted')
  })

  it('getCareerStats retrieves recruitment statistics', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        total_jobs: 6,
        active_jobs: 4,
        paused_jobs: 1,
        closed_jobs: 1,
        total_applications: 42,
        applications_by_status: { received: 20, shortlisted: 8 },
        departments: [{ department: 'Sales', job_count: 3 }],
      }),
    })
    globalThis.fetch = fetchMock

    const stats = await getCareerStats()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(stats.total_jobs).toBe(6)
    expect(stats.active_jobs).toBe(4)
    expect(stats.total_applications).toBe(42)
  })
})
