import { useEffect, useState } from 'react'
import {
  Briefcase, Users, Plus, RefreshCw, AlertCircle, CheckCircle2,
  X, Search, Edit3, Trash2, Eye
} from 'lucide-react'
import {
  listCareerJobs, createCareerJob, updateCareerJob, updateCareerJobStatus, deleteCareerJob,
  listJobApplications, updateJobApplicationStatus, getCareerStats,
  type CareerJob, type JobApplication, type CareerStats
} from '../services/staffApi'

const NAVY = '#3B2348'
const TEAL = '#C6A15B'
const IVORY_BG = '#FAF7F0'
const IVORY_SURFACE = '#FFFFFF'
const BORDER = '#E8DCC8'
const TEXT_MAIN = '#26232B'
const TEXT_MUTED = '#7A6B78'

const CARD: React.CSSProperties = {
  background: IVORY_SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(23, 42, 70, 0.05)',
  padding: '20px',
}

const STATUS_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  active: { bg: '#FAF7F0', color: '#8A6E30', border: '#E8DCC8' },
  paused: { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },
  closed: { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' },
  received: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  under_review: { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },
  shortlisted: { bg: '#F3E8FF', color: '#7E22CE', border: '#E9D5FF' },
  interview_scheduled: { bg: '#E0F2FE', color: '#0369A1', border: '#BAE6FD' },
  selected: { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
  rejected: { bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA' },
}

const DEPARTMENTS = ['Sales', 'Marketing', 'Operations', 'IT & Technology', 'Finance & Legal', 'HR & Admin']
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Commission-based']

export function AdminCareers() {
  const [activeTab, setActiveTab] = useState<'jobs' | 'applications'>('jobs')
  const [jobs, setJobs] = useState<CareerJob[]>([])
  const [applications, setApplications] = useState<JobApplication[]>([])
  const [stats, setStats] = useState<CareerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters
  const [jobSearch, setJobSearch] = useState('')
  const [jobDeptFilter, setJobDeptFilter] = useState('All')
  const [jobStatusFilter, setJobStatusFilter] = useState('All')

  const [appSearch, setAppSearch] = useState('')
  const [appJobFilter, setAppJobFilter] = useState<number | 'All'>('All')
  const [appStatusFilter, setAppStatusFilter] = useState('All')

  // Modals
  const [isJobModalOpen, setIsJobModalOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<CareerJob | null>(null)
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null)

  // Form State
  const [formTitle, setFormTitle] = useState('')
  const [formDept, setFormDept] = useState(DEPARTMENTS[0])
  const [formLocation, setFormLocation] = useState('Dubai, UAE')
  const [formEmpType, setFormEmpType] = useState('Full-time')
  const [formExpLevel, setFormExpLevel] = useState('Mid-Senior level')
  const [formSalary, setFormSalary] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formReqs, setFormReqs] = useState('')
  const [formResps, setFormResps] = useState('')
  const [formBenefits, setFormBenefits] = useState('')
  const [formStatus, setFormStatus] = useState<'active' | 'paused' | 'closed'>('active')
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Status Update state for Application Modal
  const [newAppStatus, setNewAppStatus] = useState<JobApplication['status']>('received')
  const [appNotes, setAppNotes] = useState('')
  const [updatingApp, setUpdatingApp] = useState(false)

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [jList, aList, sData] = await Promise.all([
        listCareerJobs().catch(() => []),
        listJobApplications().catch(() => []),
        getCareerStats().catch(() => null),
      ])
      setJobs(jList)
      setApplications(aList)
      setStats(sData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recruitment records')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const openCreateModal = () => {
    setEditingJob(null)
    setFormTitle('')
    setFormDept(DEPARTMENTS[0])
    setFormLocation('Dubai, UAE')
    setFormEmpType('Full-time')
    setFormExpLevel('Mid-Senior level')
    setFormSalary('AED 15,000 - 25,000 / month')
    setFormDesc('')
    setFormReqs('')
    setFormResps('')
    setFormBenefits('Visa sponsorship, Private Health Insurance, Annual Flight Allowance')
    setFormStatus('active')
    setIsJobModalOpen(true)
  }

  const openEditModal = (job: CareerJob) => {
    setEditingJob(job)
    setFormTitle(job.title)
    setFormDept(job.department)
    setFormLocation(job.location)
    setFormEmpType(job.employment_type)
    setFormExpLevel(job.experience_level)
    setFormSalary(job.salary_range || '')
    setFormDesc(job.description)
    setFormReqs((job.requirements || []).join('\n'))
    setFormResps((job.responsibilities || []).join('\n'))
    setFormBenefits((job.benefits || []).join('\n'))
    setFormStatus(job.status)
    setIsJobModalOpen(true)
  }

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim() || !formDesc.trim()) {
      setError('Job title and description are required.')
      return
    }
    setFormSubmitting(true)
    setError(null)
    try {
      const parseList = (text: string) =>
        text
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)

      const payload = {
        title: formTitle.trim(),
        department: formDept,
        location: formLocation.trim() || 'Dubai, UAE',
        employment_type: formEmpType,
        experience_level: formExpLevel,
        salary_range: formSalary.trim() || null,
        description: formDesc.trim(),
        requirements: parseList(formReqs),
        responsibilities: parseList(formResps),
        benefits: parseList(formBenefits),
        status: formStatus,
      }

      if (editingJob) {
        await updateCareerJob(editingJob.id, payload)
        setSuccessMsg(`Position "${payload.title}" updated successfully.`)
      } else {
        await createCareerJob(payload)
        setSuccessMsg(`New opening "${payload.title}" created successfully.`)
      }
      setIsJobModalOpen(false)
      await loadData()
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job vacancy.')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleToggleJobStatus = async (job: CareerJob, nextStatus: 'active' | 'paused' | 'closed') => {
    try {
      await updateCareerJobStatus(job.id, nextStatus)
      setSuccessMsg(`Position status changed to ${nextStatus}.`)
      await loadData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job status.')
    }
  }

  const handleDeleteJob = async (job: CareerJob) => {
    if (!window.confirm(`Delete opening "${job.title}" and its ${job.applications_count} applications?`)) {
      return
    }
    try {
      await deleteCareerJob(job.id)
      setSuccessMsg(`Position "${job.title}" deleted.`)
      await loadData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete position.')
    }
  }

  const openAppModal = (app: JobApplication) => {
    setSelectedApp(app)
    setNewAppStatus(app.status)
    setAppNotes(app.notes || '')
  }

  const handleUpdateAppStatus = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedApp) return
    setUpdatingApp(true)
    setError(null)
    try {
      const updated = await updateJobApplicationStatus(selectedApp.id, newAppStatus, appNotes)
      setSelectedApp(updated)
      setSuccessMsg(`Applicant status updated to ${newAppStatus.replace('_', ' ')}.`)
      await loadData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update applicant status.')
    } finally {
      setUpdatingApp(false)
    }
  }

  // Filtered jobs
  const filteredJobs = jobs.filter((j) => {
    if (jobDeptFilter !== 'All' && j.department !== jobDeptFilter) return false
    if (jobStatusFilter !== 'All' && j.status !== jobStatusFilter) return false
    if (jobSearch.trim()) {
      const q = jobSearch.toLowerCase()
      return (
        j.title.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Filtered applications
  const filteredApps = applications.filter((a) => {
    if (appJobFilter !== 'All' && a.job_id !== appJobFilter) return false
    if (appStatusFilter !== 'All' && a.status !== appStatusFilter) return false
    if (appSearch.trim()) {
      const q = appSearch.toLowerCase()
      return (
        a.applicant_name.toLowerCase().includes(q) ||
        a.applicant_email.toLowerCase().includes(q) ||
        (a.current_company && a.current_company.toLowerCase().includes(q))
      )
    }
    return true
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '12px', color: TEXT_MUTED }}>
        <RefreshCw size={28} color={TEAL} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '14px', fontWeight: 600 }}>Loading Careers &amp; Recruitment Management…</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', background: IVORY_BG, minHeight: '100%' }}>
      {/* 1. Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', background: IVORY_SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '22px 26px', boxShadow: '0 1px 4px rgba(23, 42, 70, 0.04)' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(17, 181, 164, 0.08)', borderRadius: '20px', border: '1px solid rgba(17, 181, 164, 0.25)', fontSize: '11px', fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            <Briefcase size={13} /> Admin Recruitment Portal
          </div>
          <h1 style={{ fontSize: '26px', color: NAVY, margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Careers &amp; Talent Acquisition
          </h1>
          <p style={{ color: TEXT_MUTED, fontSize: '13.5px', margin: '6px 0 0' }}>
            Strictly internal Admin management for hiring, job openings, applicant pipelines, and interview reviews.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 15px', background: IVORY_SURFACE, border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: NAVY, cursor: 'pointer' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Updating…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: NAVY, color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: 'none' }}
          >
            <Plus size={15} /> Post New Vacancy
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#991B1B', fontSize: '13px' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', color: '#166534', fontSize: '13px' }}>
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}

      {/* 2. Recruitment KPI Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: TEXT_MUTED }}>Total Positions</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: NAVY, margin: '6px 0 2px' }}>{stats?.total_jobs ?? jobs.length}</div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Across {DEPARTMENTS.length} departments</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#16A34A' }}>Active Openings</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#16A34A', margin: '6px 0 2px' }}>
            {stats?.active_jobs ?? jobs.filter((j) => j.status === 'active').length}
          </div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Accepting applications</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: TEAL }}>Total Applicants</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: TEAL, margin: '6px 0 2px' }}>
            {stats?.total_applications ?? applications.length}
          </div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>Candidate profiles registered</div>
        </div>

        <div style={CARD}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#7E22CE' }}>Shortlisted &amp; Interviews</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#7E22CE', margin: '6px 0 2px' }}>
            {(stats?.applications_by_status?.shortlisted || 0) + (stats?.applications_by_status?.interview_scheduled || 0)}
          </div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>In active recruitment funnel</div>
        </div>
      </div>

      {/* 3. Tab Switcher */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: `1px solid ${BORDER}`, paddingBottom: '4px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('jobs')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'jobs' ? NAVY : TEXT_MUTED,
            borderBottom: activeTab === 'jobs' ? `3px solid ${TEAL}` : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Briefcase size={16} /> Job Openings ({jobs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('applications')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'applications' ? NAVY : TEXT_MUTED,
            borderBottom: activeTab === 'applications' ? `3px solid ${TEAL}` : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Users size={16} /> Candidate Applications ({applications.length})
        </button>
      </div>

      {/* 4. Tab A: Job Openings List */}
      {activeTab === 'jobs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '6px 12px', flex: '1 1 240px' }}>
              <Search size={15} color={TEXT_MUTED} style={{ marginRight: '8px' }} />
              <input
                type="text"
                placeholder="Search openings by title, department, or location…"
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px' }}
              />
            </div>

            <select
              value={jobDeptFilter}
              onChange={(e) => setJobDeptFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, background: '#fff', fontSize: '13px', color: NAVY }}
            >
              <option value="All">All Departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={jobStatusFilter}
              onChange={(e) => setJobStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, background: '#fff', fontSize: '13px', color: NAVY }}
            >
              <option value="All">All Statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Table */}
          <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
            <table className="crm-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: `1px solid ${BORDER}` }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Position Title</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Department</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Type &amp; Experience</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Salary Range</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Applicants</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: TEXT_MUTED }}>
                      No job vacancies matched your filter. Click <strong>Post New Vacancy</strong> to create one.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => {
                    const badge = STATUS_BADGE[job.status] || STATUS_BADGE.closed
                    return (
                      <tr key={job.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ fontWeight: 700, color: NAVY }}>{job.title}</div>
                          <div style={{ fontSize: '11.5px', color: TEXT_MUTED }}>{job.location}</div>
                        </td>
                        <td style={{ padding: '14px 18px', color: TEXT_MAIN }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', background: '#F1F5F9', fontSize: '11.5px', fontWeight: 600 }}>
                            {job.department}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', color: TEXT_MAIN }}>
                          <div>{job.employment_type}</div>
                          <div style={{ fontSize: '11px', color: TEXT_MUTED }}>{job.experience_level}</div>
                        </td>
                        <td style={{ padding: '14px 18px', color: TEXT_MUTED, fontSize: '12px' }}>
                          {job.salary_range || 'Undisclosed'}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              textTransform: 'capitalize',
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                            }}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setAppJobFilter(job.id)
                              setActiveTab('applications')
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: TEAL,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Users size={13} /> {job.applications_count} Candidates
                          </button>
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {job.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => handleToggleJobStatus(job, 'paused')}
                                title="Pause opening"
                                style={{ padding: '4px 8px', background: '#FEF3C7', color: '#B45309', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Pause
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleJobStatus(job, 'active')}
                                title="Activate opening"
                                style={{ padding: '4px 8px', background: '#E6F8F6', color: TEAL, border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditModal(job)}
                              title="Edit position"
                              style={{ padding: '4px 8px', background: '#F1F5F9', color: NAVY, border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteJob(job)}
                              title="Delete position"
                              style={{ padding: '4px 8px', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Tab B: Candidate Applications */}
      {activeTab === 'applications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '6px 12px', flex: '1 1 240px' }}>
              <Search size={15} color={TEXT_MUTED} style={{ marginRight: '8px' }} />
              <input
                type="text"
                placeholder="Search candidates by name, email, or company…"
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px' }}
              />
            </div>

            <select
              value={appJobFilter}
              onChange={(e) => setAppJobFilter(e.target.value === 'All' ? 'All' : Number(e.target.value))}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, background: '#fff', fontSize: '13px', color: NAVY }}
            >
              <option value="All">All Applied Positions</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>

            <select
              value={appStatusFilter}
              onChange={(e) => setAppStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, background: '#fff', fontSize: '13px', color: NAVY }}
            >
              <option value="All">All Applicant Statuses</option>
              <option value="received">Received</option>
              <option value="under_review">Under Review</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interview_scheduled">Interview Scheduled</option>
              <option value="selected">Selected</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Table */}
          <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
            <table className="crm-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: `1px solid ${BORDER}` }}>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Candidate</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Applied Position</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Experience &amp; Current Co.</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Application Date</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED }}>Status</th>
                  <th style={{ padding: '12px 18px', fontWeight: 700, color: TEXT_MUTED, textAlign: 'right' }}>Review</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: TEXT_MUTED }}>
                      No applications found for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredApps.map((app) => {
                    const badge = STATUS_BADGE[app.status] || STATUS_BADGE.received
                    return (
                      <tr key={app.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ fontWeight: 700, color: NAVY }}>{app.applicant_name}</div>
                          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>{app.applicant_email}</div>
                          <div style={{ fontSize: '11px', color: TEXT_MUTED }}>{app.applicant_phone}</div>
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ fontWeight: 600, color: NAVY }}>{app.job_title || 'Position #' + app.job_id}</div>
                          <div style={{ fontSize: '11px', color: TEXT_MUTED }}>{app.job_department}</div>
                        </td>
                        <td style={{ padding: '14px 18px', color: TEXT_MAIN }}>
                          <div>{app.years_experience ? `${app.years_experience} yrs exp` : 'Entry level'}</div>
                          <div style={{ fontSize: '11px', color: TEXT_MUTED }}>{app.current_company || 'Undisclosed'}</div>
                        </td>
                        <td style={{ padding: '14px 18px', color: TEXT_MUTED, fontSize: '12px' }}>
                          {new Date(app.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              textTransform: 'capitalize',
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                            }}
                          >
                            {app.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => openAppModal(app)}
                            style={{
                              padding: '6px 12px',
                              background: '#F1F5F9',
                              border: 'none',
                              borderRadius: '6px',
                              color: NAVY,
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Eye size={13} /> View &amp; Evaluate
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Modal: Create / Edit Job Vacancy */}
      {isJobModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', padding: '26px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: `1px solid ${BORDER}`, paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: NAVY }}>
                {editingJob ? 'Edit Position Vacancy' : 'Post New Job Vacancy'}
              </h3>
              <button type="button" onClick={() => setIsJobModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUTED }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveJob} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Position Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Luxury Property Consultant"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Department</label>
                  <select
                    value={formDept}
                    onChange={(e) => setFormDept(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', background: '#fff' }}
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Employment Type</label>
                  <select
                    value={formEmpType}
                    onChange={(e) => setFormEmpType(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', background: '#fff' }}
                  >
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Location</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Salary Range</label>
                  <input
                    type="text"
                    placeholder="e.g. AED 18,000 - 30,000 / month"
                    value={formSalary}
                    onChange={(e) => setFormSalary(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Role Overview &amp; Description *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the role, objectives, client portfolio, and team structure…"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Key Requirements (One per line)</label>
                <textarea
                  rows={2}
                  placeholder="3+ years Dubai real estate brokerage experience&#10;RERA Certified Card Holder&#10;Proven track record in luxury villa/penthouse sales"
                  value={formReqs}
                  onChange={(e) => setFormReqs(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Core Responsibilities (One per line)</label>
                <textarea
                  rows={2}
                  placeholder="Conduct exclusive buyer consultations and property viewings&#10;Manage verified High-Net-Worth client relationships&#10;Negotiate sale agreements and coordinate escrow conveyancing"
                  value={formResps}
                  onChange={(e) => setFormResps(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Benefits &amp; Package (One per line)</label>
                <textarea
                  rows={2}
                  placeholder="High uncapped commission scheme&#10;Company vehicle or fuel allowance&#10;UAE Employment Visa &amp; Comprehensive Medical"
                  value={formBenefits}
                  onChange={(e) => setFormBenefits(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Publishing Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', background: '#fff' }}
                >
                  <option value="active">Active (Open for applications)</option>
                  <option value="paused">Paused (Temporarily on hold)</option>
                  <option value="closed">Closed (Position filled)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', borderTop: `1px solid ${BORDER}`, paddingTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsJobModalOpen(false)}
                  style={{ padding: '9px 16px', background: '#F1F5F9', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: NAVY, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{ padding: '9px 20px', background: NAVY, border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                >
                  {formSubmitting ? 'Saving…' : editingJob ? 'Save Changes' : 'Publish Opening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal: Evaluate Applicant */}
      {selectedApp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', padding: '26px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: `1px solid ${BORDER}`, paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: NAVY }}>
                  {selectedApp.applicant_name}
                </h3>
                <div style={{ fontSize: '12px', color: TEXT_MUTED }}>
                  Applying for: <strong>{selectedApp.job_title}</strong> ({selectedApp.job_department})
                </div>
              </div>
              <button type="button" onClick={() => setSelectedApp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUTED }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: '11px', color: TEXT_MUTED, fontWeight: 600 }}>Email</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY, marginTop: '2px' }}>{selectedApp.applicant_email}</div>
              </div>
              <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: '11px', color: TEXT_MUTED, fontWeight: 600 }}>Phone</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY, marginTop: '2px' }}>{selectedApp.applicant_phone}</div>
              </div>
              <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: '11px', color: TEXT_MUTED, fontWeight: 600 }}>Experience</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY, marginTop: '2px' }}>
                  {selectedApp.years_experience ? `${selectedApp.years_experience} Years` : 'Not specified'}
                </div>
              </div>
              <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: '11px', color: TEXT_MUTED, fontWeight: 600 }}>Current / Previous Co.</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY, marginTop: '2px' }}>
                  {selectedApp.current_company || 'Not specified'}
                </div>
              </div>
            </div>

            {selectedApp.cover_letter && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Cover Letter / Candidate Statement</div>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '12.5px', color: TEXT_MAIN, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                  {selectedApp.cover_letter}
                </div>
              </div>
            )}

            <form onSubmit={handleUpdateAppStatus} style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: `1px solid ${BORDER}`, paddingTop: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Candidate Evaluation Status</label>
                <select
                  value={newAppStatus}
                  onChange={(e) => setNewAppStatus(e.target.value as any)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', background: '#fff' }}
                >
                  <option value="received">Received</option>
                  <option value="under_review">Under Review</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="interview_scheduled">Interview Scheduled</option>
                  <option value="selected">Selected / Offer Extended</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>Internal Evaluation &amp; Interview Notes</label>
                <textarea
                  rows={3}
                  placeholder="Record interviewer remarks, salary expectations, notice period, or next steps…"
                  value={appNotes}
                  onChange={(e) => setAppNotes(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  style={{ padding: '8px 16px', background: '#F1F5F9', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: NAVY, cursor: 'pointer' }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={updatingApp}
                  style={{ padding: '8px 20px', background: NAVY, border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                >
                  {updatingApp ? 'Updating…' : 'Save Evaluation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
