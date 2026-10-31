"""
Careers and recruitment management router for LYKA Realty.
Strictly internal recruitment operations managed inside Admin CRM.
NO public careers page or external nav link is surfaced to customers.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CareerJob, JobApplication
from app.schemas import (
    CareerJobCreate, CareerJobOut, CareerJobStatusUpdate, CareerJobUpdate,
    CareerStatsOut, JobApplicationCreate, JobApplicationOut, JobApplicationStatusUpdate,
)
from app.services.audit_service import log_audit
from app.services.roles import require_admin, require_roles
require_recruitment_manager = require_roles('admin', 'hrms_admin')

logger = logging.getLogger("lyka.careers")
router = APIRouter(tags=["careers"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─── Admin Job Openings Management ──────────────────────────────────────────

@router.get("/api/admin/careers/jobs", response_model=List[CareerJobOut], summary="List career jobs (admin)")
def list_career_jobs(
    status: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    query = db.query(CareerJob)
    if status:
        query = query.filter(CareerJob.status == status)
    if department:
        query = query.filter(func.lower(CareerJob.department) == department.lower())
    if q:
        query = query.filter(
            CareerJob.title.ilike(f"%{q}%") | CareerJob.description.ilike(f"%{q}%")
        )
    jobs = query.order_by(CareerJob.created_at.desc()).all()

    # Pre-aggregate application counts for efficiency
    app_counts = dict(
        db.query(JobApplication.job_id, func.count(JobApplication.id))
        .group_by(JobApplication.job_id)
        .all()
    )

    result = []
    for job in jobs:
        out = CareerJobOut(
            id=job.id,
            title=job.title,
            department=job.department,
            location=job.location,
            employment_type=job.employment_type,
            experience_level=job.experience_level,
            salary_range=job.salary_range,
            description=job.description,
            requirements=job.requirements or [],
            responsibilities=job.responsibilities or [],
            benefits=job.benefits or [],
            status=job.status,
            posted_by=job.posted_by,
            applications_count=app_counts.get(job.id, 0),
            created_at=job.created_at,
            updated_at=job.updated_at,
        )
        result.append(out)
    return result


@router.post("/api/admin/careers/jobs", response_model=CareerJobOut, status_code=201, summary="Create career job (admin)")
def create_career_job(
    payload: CareerJobCreate,
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    job = CareerJob(
        title=payload.title,
        department=payload.department,
        location=payload.location,
        employment_type=payload.employment_type,
        experience_level=payload.experience_level,
        salary_range=payload.salary_range,
        description=payload.description,
        requirements=payload.requirements,
        responsibilities=payload.responsibilities,
        benefits=payload.benefits,
        status=payload.status,
        posted_by=ctx.get("email") or "admin",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    log_audit(
        db, ctx, "career_job_created", "career_job", job.id,
        details={"title": job.title, "department": job.department, "status": job.status}
    )

    return CareerJobOut(
        id=job.id,
        title=job.title,
        department=job.department,
        location=job.location,
        employment_type=job.employment_type,
        experience_level=job.experience_level,
        salary_range=job.salary_range,
        description=job.description,
        requirements=job.requirements or [],
        responsibilities=job.responsibilities or [],
        benefits=job.benefits or [],
        status=job.status,
        posted_by=job.posted_by,
        applications_count=0,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/api/admin/careers/jobs/{job_id}", response_model=CareerJobOut, summary="Get career job (admin)")
def get_career_job(
    job_id: int,
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    job = db.query(CareerJob).filter(CareerJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Career job not found.")
    app_count = db.query(func.count(JobApplication.id)).filter(JobApplication.job_id == job.id).scalar() or 0

    return CareerJobOut(
        id=job.id,
        title=job.title,
        department=job.department,
        location=job.location,
        employment_type=job.employment_type,
        experience_level=job.experience_level,
        salary_range=job.salary_range,
        description=job.description,
        requirements=job.requirements or [],
        responsibilities=job.responsibilities or [],
        benefits=job.benefits or [],
        status=job.status,
        posted_by=job.posted_by,
        applications_count=app_count,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.put("/api/admin/careers/jobs/{job_id}", response_model=CareerJobOut, summary="Update career job (admin)")
def update_career_job(
    job_id: int,
    payload: CareerJobUpdate,
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    job = db.query(CareerJob).filter(CareerJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Career job not found.")

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(job, field, val)
    job.updated_at = _utcnow()
    db.commit()
    db.refresh(job)

    app_count = db.query(func.count(JobApplication.id)).filter(JobApplication.job_id == job.id).scalar() or 0
    log_audit(
        db, ctx, "career_job_updated", "career_job", job.id,
        details={"title": job.title, "status": job.status}
    )

    return CareerJobOut(
        id=job.id,
        title=job.title,
        department=job.department,
        location=job.location,
        employment_type=job.employment_type,
        experience_level=job.experience_level,
        salary_range=job.salary_range,
        description=job.description,
        requirements=job.requirements or [],
        responsibilities=job.responsibilities or [],
        benefits=job.benefits or [],
        status=job.status,
        posted_by=job.posted_by,
        applications_count=app_count,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.patch("/api/admin/careers/jobs/{job_id}/status", response_model=CareerJobOut, summary="Update job status (admin)")
def update_career_job_status(
    job_id: int,
    payload: CareerJobStatusUpdate,
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    job = db.query(CareerJob).filter(CareerJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Career job not found.")

    job.status = payload.status
    job.updated_at = _utcnow()
    db.commit()
    db.refresh(job)

    app_count = db.query(func.count(JobApplication.id)).filter(JobApplication.job_id == job.id).scalar() or 0
    log_audit(
        db, ctx, "career_job_status_changed", "career_job", job.id,
        details={"status": job.status}
    )

    return CareerJobOut(
        id=job.id,
        title=job.title,
        department=job.department,
        location=job.location,
        employment_type=job.employment_type,
        experience_level=job.experience_level,
        salary_range=job.salary_range,
        description=job.description,
        requirements=job.requirements or [],
        responsibilities=job.responsibilities or [],
        benefits=job.benefits or [],
        status=job.status,
        posted_by=job.posted_by,
        applications_count=app_count,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.delete("/api/admin/careers/jobs/{job_id}", status_code=204, summary="Delete career job (admin)")
def delete_career_job(
    job_id: int,
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    job = db.query(CareerJob).filter(CareerJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Career job not found.")

    db.delete(job)
    db.commit()
    log_audit(db, ctx, "career_job_deleted", "career_job", job_id)
    return None


# ─── Admin Candidate Applications Management ─────────────────────────────────

@router.get("/api/admin/careers/applications", response_model=List[JobApplicationOut], summary="List job applications (admin)")
def list_job_applications(
    job_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    query = db.query(JobApplication)
    if job_id:
        query = query.filter(JobApplication.job_id == job_id)
    if status:
        query = query.filter(JobApplication.status == status)
    if q:
        query = query.filter(
            JobApplication.applicant_name.ilike(f"%{q}%")
            | JobApplication.applicant_email.ilike(f"%{q}%")
            | JobApplication.current_company.ilike(f"%{q}%")
        )
    apps = query.order_by(JobApplication.created_at.desc()).all()

    # Preload jobs map for title/department
    job_ids = {a.job_id for a in apps}
    jobs_map = {
        j.id: j for j in db.query(CareerJob).filter(CareerJob.id.in_(job_ids or [-1])).all()
    }

    result = []
    for a in apps:
        j = jobs_map.get(a.job_id)
        result.append(
            JobApplicationOut(
                id=a.id,
                job_id=a.job_id,
                job_title=j.title if j else None,
                job_department=j.department if j else None,
                applicant_name=a.applicant_name,
                applicant_email=a.applicant_email,
                applicant_phone=a.applicant_phone,
                resume_url=a.resume_url,
                cover_letter=a.cover_letter,
                linkedin_url=a.linkedin_url,
                years_experience=a.years_experience,
                current_company=a.current_company,
                status=a.status,
                notes=a.notes,
                reviewed_by=a.reviewed_by,
                created_at=a.created_at,
                updated_at=a.updated_at,
            )
        )
    return result


@router.get("/api/admin/careers/applications/{app_id}", response_model=JobApplicationOut, summary="Get job application (admin)")
def get_job_application(
    app_id: int,
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    app_row = db.query(JobApplication).filter(JobApplication.id == app_id).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Job application not found.")
    job = db.query(CareerJob).filter(CareerJob.id == app_row.job_id).first()

    return JobApplicationOut(
        id=app_row.id,
        job_id=app_row.job_id,
        job_title=job.title if job else None,
        job_department=job.department if job else None,
        applicant_name=app_row.applicant_name,
        applicant_email=app_row.applicant_email,
        applicant_phone=app_row.applicant_phone,
        resume_url=app_row.resume_url,
        cover_letter=app_row.cover_letter,
        linkedin_url=app_row.linkedin_url,
        years_experience=app_row.years_experience,
        current_company=app_row.current_company,
        status=app_row.status,
        notes=app_row.notes,
        reviewed_by=app_row.reviewed_by,
        created_at=app_row.created_at,
        updated_at=app_row.updated_at,
    )


@router.patch("/api/admin/careers/applications/{app_id}/status", response_model=JobApplicationOut, summary="Update application status (admin)")
def update_job_application_status(
    app_id: int,
    payload: JobApplicationStatusUpdate,
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    app_row = db.query(JobApplication).filter(JobApplication.id == app_id).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Job application not found.")

    app_row.status = payload.status
    if payload.notes is not None:
        app_row.notes = payload.notes
    app_row.reviewed_by = ctx.get("email") or "admin"
    app_row.updated_at = _utcnow()
    db.commit()
    db.refresh(app_row)

    job = db.query(CareerJob).filter(CareerJob.id == app_row.job_id).first()
    log_audit(
        db, ctx, "application_status_updated", "job_application", app_row.id,
        details={"status": app_row.status, "job_id": app_row.job_id}
    )

    return JobApplicationOut(
        id=app_row.id,
        job_id=app_row.job_id,
        job_title=job.title if job else None,
        job_department=job.department if job else None,
        applicant_name=app_row.applicant_name,
        applicant_email=app_row.applicant_email,
        applicant_phone=app_row.applicant_phone,
        resume_url=app_row.resume_url,
        cover_letter=app_row.cover_letter,
        linkedin_url=app_row.linkedin_url,
        years_experience=app_row.years_experience,
        current_company=app_row.current_company,
        status=app_row.status,
        notes=app_row.notes,
        reviewed_by=app_row.reviewed_by,
        created_at=app_row.created_at,
        updated_at=app_row.updated_at,
    )


@router.get("/api/admin/careers/stats", response_model=CareerStatsOut, summary="Get careers & recruitment stats (admin)")
def get_career_stats(
    ctx: Dict[str, Any] = Depends(require_recruitment_manager),
    db: Session = Depends(get_db),
):
    total_jobs = db.query(func.count(CareerJob.id)).scalar() or 0
    active_jobs = db.query(func.count(CareerJob.id)).filter(CareerJob.status == "active").scalar() or 0
    paused_jobs = db.query(func.count(CareerJob.id)).filter(CareerJob.status == "paused").scalar() or 0
    closed_jobs = db.query(func.count(CareerJob.id)).filter(CareerJob.status == "closed").scalar() or 0

    total_apps = db.query(func.count(JobApplication.id)).scalar() or 0

    status_counts = dict(
        db.query(JobApplication.status, func.count(JobApplication.id))
        .group_by(JobApplication.status)
        .all()
    )

    dept_rows = (
        db.query(CareerJob.department, func.count(CareerJob.id))
        .group_by(CareerJob.department)
        .all()
    )
    departments = [{"department": d, "job_count": c} for d, c in dept_rows]

    return CareerStatsOut(
        total_jobs=total_jobs,
        active_jobs=active_jobs,
        paused_jobs=paused_jobs,
        closed_jobs=closed_jobs,
        total_applications=total_apps,
        applications_by_status=status_counts,
        departments=departments,
    )


# ─── Public Job Application Submission ───────────────────────────────────────

@router.post("/api/careers/apply", response_model=JobApplicationOut, status_code=201, summary="Submit job application")
def apply_for_job(
    payload: JobApplicationCreate,
    db: Session = Depends(get_db),
):
    """Candidate submits application for an open position."""
    job = db.query(CareerJob).filter(CareerJob.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job position not found.")
    if job.status != "active":
        raise HTTPException(status_code=400, detail="This job opening is no longer accepting applications.")

    # Duplicate submission prevention: same email + same job in last 24h
    existing = (
        db.query(JobApplication)
        .filter(
            JobApplication.job_id == payload.job_id,
            func.lower(JobApplication.applicant_email) == payload.applicant_email.lower(),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="An application with this email has already been submitted for this position.")

    app_row = JobApplication(
        job_id=payload.job_id,
        applicant_name=payload.applicant_name,
        applicant_email=payload.applicant_email,
        applicant_phone=payload.applicant_phone,
        resume_url=payload.resume_url,
        cover_letter=payload.cover_letter,
        linkedin_url=payload.linkedin_url,
        years_experience=payload.years_experience,
        current_company=payload.current_company,
        status="received",
    )
    db.add(app_row)
    db.commit()
    db.refresh(app_row)

    return JobApplicationOut(
        id=app_row.id,
        job_id=app_row.job_id,
        job_title=job.title,
        job_department=job.department,
        applicant_name=app_row.applicant_name,
        applicant_email=app_row.applicant_email,
        applicant_phone=app_row.applicant_phone,
        resume_url=app_row.resume_url,
        cover_letter=app_row.cover_letter,
        linkedin_url=app_row.linkedin_url,
        years_experience=app_row.years_experience,
        current_company=app_row.current_company,
        status=app_row.status,
        notes=None,
        reviewed_by=None,
        created_at=app_row.created_at,
        updated_at=app_row.updated_at,
    )

