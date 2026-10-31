"""
HRMS Router for LYKA Realty.
Manages:
- Executive HRMS Overview KPIs
- Employee Directory & Profile Management
- Attendance Clock-in/Clock-out & Manual Corrections
- Leave Balances & Approval Workflows
- Payroll Generation & Payslip Distribution
- Recruitment Interviews Integration
- Performance Reviews & Appraisals
- HR Requests & Ticket Thread Messaging
- Employee Documents
- HR Notifications & Audit Logs
"""
import logging
import random
import string
from datetime import date, datetime, time, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Lead,
    ACTIVE_STAFF_ROLES, STAFF_ROLES, AttendanceRecord, CareerJob,
    CommissionRecord, EmployeeDocument, HRAuditLog, HRNotification,
    HRRequest, HRRequestMessage, InterviewSchedule, JobApplication,
    LeaveBalance, LeaveRequest, PayrollRecord, Payslip, PerformanceReview,
    StaffUser, utcnow
)
from app.schemas import (
    AttendanceCheckInOut, AttendanceRecordOut, EmployeeDocumentCreate,
    EmployeeDocumentOut, HRAuditLogOut, HRMSOverviewStats, HRNotificationOut,
    HRRequestCreate, HRRequestMessageCreate, HRRequestMessageOut,
    HRRequestOut, HRRequestStatusUpdate, InterviewScheduleCreate,
    InterviewScheduleOut, InterviewScheduleUpdate, LeaveApprovalAction,
    LeaveBalanceOut, LeaveRequestCreate, LeaveRequestOut,
    ManualAttendanceCorrection, PayrollGenerate, PayrollRecordOut,
    PayslipOut, PerformanceReviewCreate, PerformanceReviewOut,
    StaffOut, StaffUpdate
)
from app.services.roles import (
    forbid_second_admin, require_admin, require_hrms_admin, require_staff
)

logger = logging.getLogger("lyka.hrms")
router = APIRouter(prefix="/api/hrms", tags=["hrms"])


def _as_utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _log_hr_audit(
    db: Session,
    actor_email: str,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> HRAuditLog:
    """Helper to persist HR operational audit trails."""
    audit = HRAuditLog(
        actor_email=actor_email,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        details=details or {},
        created_at=_as_utc_now(),
    )
    db.add(audit)
    db.commit()
    return audit


def _send_hr_notification(
    db: Session,
    recipient_email: str,
    title: str,
    message: str,
    notification_type: str = "general",
    recipient_role: Optional[str] = None,
    link_url: Optional[str] = None,
) -> HRNotification:
    """Helper to create targeted in-app HR alerts."""
    notif = HRNotification(
        recipient_email=recipient_email,
        recipient_role=recipient_role,
        title=title,
        message=message,
        notification_type=notification_type,
        link_url=link_url,
        is_read=False,
        created_at=_as_utc_now(),
    )
    db.add(notif)
    db.commit()

    try:
        from app.services import notification_service
        notification_service.create_notification(
            db=db,
            recipient_email=recipient_email,
            recipient_role=recipient_role,
            title=title,
            message=message,
            category="announcements" if notification_type in ("announcement", "general") else "system",
            notification_type=notification_type,
            related_entity_type="hrms",
            action_url=link_url or "/staff/hrms",
        )
    except Exception as exc:
        logger.warning("Failed to mirror HR notification: %s", exc)

    return notif


def _get_caller_staff(db: Session, ctx: Dict[str, Any]) -> StaffUser:
    """Resolve caller's authenticated StaffUser record."""
    uid = ctx.get("uid")
    email = ctx.get("email")
    staff = None
    if uid:
        staff = db.query(StaffUser).filter(StaffUser.firebase_uid == uid, StaffUser.is_active == True).first()  # noqa: E712
    if not staff and email:
        staff = db.query(StaffUser).filter(func.lower(StaffUser.email) == str(email).lower(), StaffUser.is_active == True).first()  # noqa: E712
    if not staff:
        raise HTTPException(status_code=403, detail="Active staff record not found.")
    return staff


# ─── 1. Executive HRMS Overview KPIs ──────────────────────────────────────────

@router.get("/overview", response_model=HRMSOverviewStats, summary="HRMS executive overview KPIs (Admin & HRMS Admin)")
def get_hrms_overview(
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    total_emp = db.query(func.count(StaffUser.id)).scalar() or 0
    active_emp = db.query(func.count(StaffUser.id)).filter(StaffUser.is_active == True).scalar() or 0  # noqa: E712

    today = date.today()
    present_today = db.query(func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.status.in_(["present", "late", "half_day"])
    ).scalar() or 0

    on_leave_today = db.query(func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.status == "on_leave"
    ).scalar() or 0

    absent_today = max(0, active_emp - present_today - on_leave_today)

    pending_leaves = db.query(func.count(LeaveRequest.id)).filter(LeaveRequest.status == "pending").scalar() or 0
    approved_leaves = db.query(func.count(LeaveRequest.id)).filter(LeaveRequest.status == "approved").scalar() or 0

    new_applications = db.query(func.count(JobApplication.id)).filter(JobApplication.status == "received").scalar() or 0
    open_hr_requests = db.query(func.count(HRRequest.id)).filter(HRRequest.status.in_(["open", "in_progress"])).scalar() or 0

    return HRMSOverviewStats(
        total_employees=total_emp,
        active_employees=active_emp,
        present_today=present_today,
        absent_today=absent_today,
        pending_leaves=pending_leaves,
        approved_leaves=approved_leaves,
        new_job_applications=new_applications,
        open_hr_requests=open_hr_requests,
    )


# ─── 2. Employee Directory & Profiles ─────────────────────────────────────────

@router.get("/employees", response_model=List[StaffOut], summary="List employee directory (Admin & HRMS Admin)")
def list_employees(
    department: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    query = db.query(StaffUser)
    if not include_inactive:
        query = query.filter(StaffUser.is_active == True)  # noqa: E712
    if department:
        query = query.filter(func.lower(StaffUser.department) == department.lower())
    if role:
        query = query.filter(StaffUser.role == role)
    if status:
        query = query.filter(StaffUser.employment_status == status)
    if q:
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(StaffUser.name).like(term),
                func.lower(StaffUser.email).like(term),
                func.lower(StaffUser.employee_id).like(term),
                func.lower(StaffUser.designation).like(term),
            )
        )
    return query.order_by(StaffUser.id).all()


@router.get("/employees/{staff_id}", response_model=StaffOut, summary="Get single employee profile")
def get_employee_detail(
    staff_id: int,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    staff = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return staff


@router.patch("/employees/{staff_id}", response_model=StaffOut, summary="Update employee record (Admin & HRMS Admin)")
def update_employee(
    staff_id: int,
    payload: StaffUpdate,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    staff = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Employee not found.")

    # Role changing restrictions: only Admin can change roles to/from admin
    if payload.role is not None:
        if ctx.get("role") != "admin" and (payload.role == "admin" or staff.role == "admin"):
            raise HTTPException(status_code=403, detail="Only Admin can manage Admin roles.")
        if payload.role not in STAFF_ROLES:
            raise HTTPException(status_code=422, detail="Unknown role.")
        forbid_second_admin(db, payload.role, exclude_id=staff.id)
        staff.role = payload.role

    if payload.name is not None:
        staff.name = payload.name.strip()
    if payload.department is not None:
        staff.department = payload.department.strip()
    if payload.designation is not None:
        staff.designation = payload.designation.strip()
    if payload.phone is not None:
        staff.phone = payload.phone.strip()
    if payload.employment_status is not None:
        staff.employment_status = payload.employment_status
    if payload.salary_basic_aed is not None:
        staff.salary_basic_aed = payload.salary_basic_aed
    if payload.salary_allowances_aed is not None:
        staff.salary_allowances_aed = payload.salary_allowances_aed
    if payload.salary_deductions_aed is not None:
        staff.salary_deductions_aed = payload.salary_deductions_aed
    if payload.is_active is not None:
        if staff.role == "admin" and payload.is_active is False:
            raise HTTPException(status_code=409, detail="Cannot deactivate the only active Admin.")
        staff.is_active = payload.is_active

    staff.updated_at = _as_utc_now()
    db.commit()
    db.refresh(staff)

    _log_hr_audit(
        db,
        actor_email=str(ctx.get("email")),
        actor_role=str(ctx.get("role")),
        action="employee_updated",
        entity_type="staff",
        entity_id=str(staff.id),
        details={"email": staff.email, "department": staff.department, "role": staff.role},
    )
    return staff


@router.get("/me/profile", response_model=StaffOut, summary="Get own staff HR profile (All staff)")
def get_my_profile(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    return staff


# ─── 3. Attendance Management ────────────────────────────────────────────────

@router.get("/attendance/today", response_model=Optional[AttendanceRecordOut], summary="Get today's attendance record (Self-service)")
def get_today_attendance(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    today = date.today()
    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.staff_user_id == staff.id,
        AttendanceRecord.date == today
    ).first()
    return record


@router.post("/attendance/check-in", response_model=AttendanceRecordOut, summary="Clock in for today (Self-service)")
def attendance_check_in(
    payload: AttendanceCheckInOut,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    today = date.today()
    now = _as_utc_now()

    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.staff_user_id == staff.id,
        AttendanceRecord.date == today
    ).first()

    if record and record.check_in_time:
        raise HTTPException(status_code=400, detail="Already checked in for today.")

    # Status calculation (standard start: 09:30 UAE time)
    status = "present"
    if now.time() > time(9, 35):
        status = "late"

    if not record:
        record = AttendanceRecord(
            staff_user_id=staff.id,
            staff_email=staff.email,
            date=today,
            check_in_time=now,
            status=status,
            notes=payload.notes,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
    else:
        record.check_in_time = now
        record.status = status
        if payload.notes:
            record.notes = payload.notes
        record.updated_at = now

    db.commit()
    db.refresh(record)
    return record


@router.post("/attendance/check-out", response_model=AttendanceRecordOut, summary="Clock out for today (Self-service)")
def attendance_check_out(
    payload: AttendanceCheckInOut,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    today = date.today()
    now = _as_utc_now()

    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.staff_user_id == staff.id,
        AttendanceRecord.date == today
    ).first()

    if not record or not record.check_in_time:
        raise HTTPException(status_code=400, detail="Cannot check out without checking in first.")

    check_in_tz = record.check_in_time.replace(tzinfo=timezone.utc if record.check_in_time.tzinfo is None else record.check_in_time.tzinfo)
    diff_seconds = (now - check_in_tz).total_seconds()
    if diff_seconds < 60:
        raise HTTPException(status_code=400, detail="Minimum 1 minute of work required before clocking out.")
    diff_hours = diff_seconds / 3600.0
    record.check_out_time = now
    record.total_hours = round(max(0.0, diff_hours), 2)
    if payload.notes:
        record.notes = (record.notes + " | " + payload.notes) if record.notes else payload.notes
    record.updated_at = now

    db.commit()
    db.refresh(record)
    return record


@router.get("/attendance/my-history", response_model=List[AttendanceRecordOut], summary="Get own attendance history (Self-service)")
def get_my_attendance_history(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2024, le=2035),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    query = db.query(AttendanceRecord).filter(AttendanceRecord.staff_user_id == staff.id)
    if month and year:
        # Filter by month and year
        query = query.filter(
            func.extract("month", AttendanceRecord.date) == month,
            func.extract("year", AttendanceRecord.date) == year
        )
    return query.order_by(AttendanceRecord.date.desc()).limit(60).all()


@router.get("/attendance/all", response_model=List[AttendanceRecordOut], summary="List company attendance (Admin & HRMS Admin)")
def list_all_attendance(
    date_val: Optional[date] = Query(None, alias="date"),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2024, le=2035),
    department: Optional[str] = Query(None),
    staff_email: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    query = db.query(AttendanceRecord).join(StaffUser, AttendanceRecord.staff_user_id == StaffUser.id)
    if date_val:
        query = query.filter(AttendanceRecord.date == date_val)
    if month and year:
        query = query.filter(
            func.extract("month", AttendanceRecord.date) == month,
            func.extract("year", AttendanceRecord.date) == year
        )
    if department:
        query = query.filter(func.lower(StaffUser.department) == department.lower())
    if staff_email:
        query = query.filter(func.lower(AttendanceRecord.staff_email) == staff_email.lower())

    return query.order_by(AttendanceRecord.date.desc(), StaffUser.name).all()


@router.post("/attendance/manual-correction", response_model=AttendanceRecordOut, summary="Manual attendance correction (Admin & HRMS Admin)")
def manual_attendance_correction(
    payload: ManualAttendanceCorrection,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    staff = db.query(StaffUser).filter(func.lower(StaffUser.email) == payload.staff_email.lower()).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Employee not found.")

    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.staff_user_id == staff.id,
        AttendanceRecord.date == payload.date
    ).first()

    now = _as_utc_now()
    total_hours = 0.0
    if payload.check_in_time and payload.check_out_time:
        total_hours = round(max(0.0, (payload.check_out_time - payload.check_in_time).total_seconds() / 3600.0), 2)
    elif payload.status in ("present", "late"):
        total_hours = 8.0

    if not record:
        record = AttendanceRecord(
            staff_user_id=staff.id,
            staff_email=staff.email,
            date=payload.date,
            check_in_time=payload.check_in_time,
            check_out_time=payload.check_out_time,
            total_hours=total_hours,
            status=payload.status,
            notes=payload.notes,
            is_manually_corrected=True,
            corrected_by=str(ctx.get("email")),
            correction_reason=payload.correction_reason,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
    else:
        record.check_in_time = payload.check_in_time
        record.check_out_time = payload.check_out_time
        record.total_hours = total_hours
        record.status = payload.status
        if payload.notes:
            record.notes = payload.notes
        record.is_manually_corrected = True
        record.corrected_by = str(ctx.get("email"))
        record.correction_reason = payload.correction_reason
        record.updated_at = now

    db.commit()
    db.refresh(record)

    _log_hr_audit(
        db,
        actor_email=str(ctx.get("email")),
        actor_role=str(ctx.get("role")),
        action="attendance_corrected",
        entity_type="attendance_record",
        entity_id=str(record.id),
        details={"staff_email": staff.email, "date": str(payload.date), "reason": payload.correction_reason},
    )

    _send_hr_notification(
        db,
        recipient_email=staff.email,
        title="Attendance Correction Applied",
        message=f"Your attendance for {payload.date} was updated to {payload.status}. Reason: {payload.correction_reason}",
        notification_type="attendance",
        link_url="/staff/attendance",
    )
    return record


# ─── 4. Leave Management ─────────────────────────────────────────────────────

@router.get("/leaves/balance", response_model=LeaveBalanceOut, summary="Get own leave balance (Self-service)")
def get_my_leave_balance(
    year: int = Query(2026, ge=2024, le=2035),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    balance = db.query(LeaveBalance).filter(
        LeaveBalance.staff_user_id == staff.id,
        LeaveBalance.year == year
    ).first()

    if not balance:
        balance = LeaveBalance(
            staff_user_id=staff.id,
            staff_email=staff.email,
            year=year,
            annual_total=30.0,
            annual_used=0.0,
            sick_total=15.0,
            sick_used=0.0,
            casual_total=7.0,
            casual_used=0.0,
            unpaid_used=0.0,
        )
        db.add(balance)
        db.commit()
        db.refresh(balance)

    return LeaveBalanceOut(
        id=balance.id,
        staff_user_id=balance.staff_user_id,
        staff_email=balance.staff_email,
        year=balance.year,
        annual_total=balance.annual_total,
        annual_used=balance.annual_used,
        annual_remaining=max(0.0, balance.annual_total - balance.annual_used),
        sick_total=balance.sick_total,
        sick_used=balance.sick_used,
        sick_remaining=max(0.0, balance.sick_total - balance.sick_used),
        casual_total=balance.casual_total,
        casual_used=balance.casual_used,
        casual_remaining=max(0.0, balance.casual_total - balance.casual_used),
        unpaid_used=balance.unpaid_used,
        updated_at=balance.updated_at,
    )


@router.get("/leaves/my-requests", response_model=List[LeaveRequestOut], summary="List own leave requests (Self-service)")
def get_my_leave_requests(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    return db.query(LeaveRequest).filter(
        LeaveRequest.staff_user_id == staff.id
    ).order_by(LeaveRequest.created_at.desc()).all()


@router.post("/leaves/apply", response_model=LeaveRequestOut, summary="Apply for leave (Self-service)")
def apply_for_leave(
    payload: LeaveRequestCreate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)

    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date.")

    days_count = float((payload.end_date - payload.start_date).days + 1)
    now = _as_utc_now()

    # Verify balance
    year = payload.start_date.year
    balance = db.query(LeaveBalance).filter(
        LeaveBalance.staff_user_id == staff.id,
        LeaveBalance.year == year
    ).first()

    if not balance:
        balance = LeaveBalance(staff_user_id=staff.id, staff_email=staff.email, year=year)
        db.add(balance)
        db.commit()
        db.refresh(balance)

    if payload.leave_type == "annual":
        remaining = balance.annual_total - balance.annual_used
        if days_count > remaining:
            raise HTTPException(status_code=400, detail=f"Insufficient annual leave balance. Requested: {days_count}, Remaining: {remaining}")
    elif payload.leave_type == "sick":
        remaining = balance.sick_total - balance.sick_used
        if days_count > remaining:
            raise HTTPException(status_code=400, detail=f"Insufficient sick leave balance. Requested: {days_count}, Remaining: {remaining}")
    elif payload.leave_type == "casual":
        remaining = balance.casual_total - balance.casual_used
        if days_count > remaining:
            raise HTTPException(status_code=400, detail=f"Insufficient casual leave balance. Requested: {days_count}, Remaining: {remaining}")

    req = LeaveRequest(
        staff_user_id=staff.id,
        staff_email=staff.email,
        staff_name=staff.name,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_count=days_count,
        reason=payload.reason,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Notify HRMS Admins
    hrms_admins = db.query(StaffUser).filter(
        StaffUser.role.in_(["admin", "hrms_admin"]),
        StaffUser.is_active == True  # noqa: E712
    ).all()
    for ha in hrms_admins:
        _send_hr_notification(
            db,
            recipient_email=ha.email,
            title="New Leave Application",
            message=f"{staff.name} applied for {days_count} days {payload.leave_type} leave from {payload.start_date} to {payload.end_date}.",
            notification_type="leave",
            link_url="/staff/leaves",
        )

    return req


@router.get("/leaves/all", response_model=List[LeaveRequestOut], summary="List all company leave requests (Admin & HRMS Admin)")
def list_all_leaves(
    status: Optional[str] = Query(None),
    leave_type: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    query = db.query(LeaveRequest)
    if status:
        query = query.filter(LeaveRequest.status == status)
    if leave_type:
        query = query.filter(LeaveRequest.leave_type == leave_type)
    if year:
        query = query.filter(func.extract("year", LeaveRequest.start_date) == year)
    return query.order_by(LeaveRequest.created_at.desc()).all()


@router.post("/leaves/{leave_id}/action", response_model=LeaveRequestOut, summary="Approve or reject leave request (Admin & HRMS Admin)")
def action_leave_request(
    leave_id: int,
    payload: LeaveApprovalAction,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    req = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found.")

    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Leave request is already {req.status}.")

    now = _as_utc_now()
    req.status = "approved" if payload.action == "approve" else "rejected"
    req.reviewer_email = str(ctx.get("email"))
    req.reviewer_comments = payload.reviewer_comments
    req.reviewed_at = now
    req.updated_at = now

    # If approved, deduct from balance
    if payload.action == "approve":
        year = req.start_date.year
        bal = db.query(LeaveBalance).filter(
            LeaveBalance.staff_user_id == req.staff_user_id,
            LeaveBalance.year == year
        ).first()
        if bal:
            if req.leave_type == "annual":
                bal.annual_used += req.days_count
            elif req.leave_type == "sick":
                bal.sick_used += req.days_count
            elif req.leave_type == "casual":
                bal.casual_used += req.days_count
            else:
                bal.unpaid_used += req.days_count
            bal.updated_at = now

        # Sales Agent lead continuity: mark open leads for coverage & alert Admin
        staff_member = db.query(StaffUser).filter(StaffUser.id == req.staff_user_id).first()
        if not staff_member and req.staff_email:
            staff_member = db.query(StaffUser).filter(func.lower(StaffUser.email) == req.staff_email.lower()).first()

        if staff_member and staff_member.role in ("salesperson", "sales_agent"):
            open_leads = db.query(Lead).filter(
                or_(
                    func.lower(Lead.current_responsible_email) == staff_member.email.lower(),
                    func.lower(Lead.original_assigned_email) == staff_member.email.lower(),
                ),
                Lead.status.notin_(["closed_won", "closed_lost", "disqualified"]),
            ).all()
            for ol in open_leads:
                ol.coverage_status = "coverage_required"
                if not ol.original_assigned_email:
                    ol.original_assigned_email = ol.current_responsible_email or staff_member.email

            admins = db.query(StaffUser).filter(StaffUser.role == "admin", StaffUser.is_active == True).all()
            for adm in admins:
                _send_hr_notification(
                    db,
                    recipient_email=adm.email,
                    title="Sales Agent Leave Approved — Lead Coverage Required",
                    message=f"{staff_member.name} ({staff_member.email}) leave approved ({req.days_count} days from {req.start_date} to {req.end_date}). {len(open_leads)} active leads require coverage assignment.",
                    notification_type="lead_coverage",
                    link_url="/crm/team?tab=coverage",
                )

    db.commit()
    db.refresh(req)

    _log_hr_audit(
        db,
        actor_email=str(ctx.get("email")),
        actor_role=str(ctx.get("role")),
        action=f"leave_{payload.action}d",
        entity_type="leave_request",
        entity_id=str(req.id),
        details={"staff_email": req.staff_email, "action": payload.action, "days": req.days_count},
    )

    _send_hr_notification(
        db,
        recipient_email=req.staff_email,
        title=f"Leave Request {payload.action.capitalize()}d",
        message=f"Your {req.days_count}-day {req.leave_type} leave from {req.start_date} to {req.end_date} has been {payload.action}d by {ctx.get('email')}.",
        notification_type="leave",
        link_url="/staff/leaves",
    )
    return req



@router.post("/leaves/{leave_id}/cancel", response_model=LeaveRequestOut, summary="Cancel own pending leave request")
def cancel_leave_request(
    leave_id: int,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    req = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found.")
    user_email = (ctx.get("email") or "").lower()
    if req.staff_email.lower() != user_email and ctx.get("role") not in ("admin", "hrms_admin"):
        raise HTTPException(status_code=403, detail="You can only cancel your own leave requests.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot cancel a leave request that is already {req.status}.")

    now = _as_utc_now()
    req.status = "cancelled"
    req.updated_at = now
    db.commit()
    db.refresh(req)
    _log_hr_audit(
        db,
        actor_email=user_email,
        actor_role=str(ctx.get("role")),
        action="leave_cancelled",
        entity_type="leave_request",
        entity_id=str(req.id),
        details={"staff_email": req.staff_email},
    )
    return req


@router.get("/leaves/calendar", response_model=List[LeaveRequestOut], summary="Approved leaves company-wide calendar (All staff)")
def get_leaves_calendar(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2024, le=2035),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(LeaveRequest).filter(LeaveRequest.status == "approved")
    if year:
        query = query.filter(func.extract("year", LeaveRequest.start_date) == year)
    if month:
        query = query.filter(func.extract("month", LeaveRequest.start_date) == month)
    return query.order_by(LeaveRequest.start_date.asc()).all()


# ─── 5. Payroll Management ───────────────────────────────────────────────────

@router.get("/payroll/records", response_model=List[PayrollRecordOut], summary="List payroll runs (Admin & HRMS Admin)")
def list_payroll_records(
    year: Optional[int] = Query(None),
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    query = db.query(PayrollRecord)
    if year:
        query = query.filter(PayrollRecord.year == year)
    return query.order_by(PayrollRecord.year.desc(), PayrollRecord.month.desc()).all()


@router.post("/payroll/generate", response_model=PayrollRecordOut, summary="Generate monthly payroll run (Admin & HRMS Admin)")
def generate_payroll_run(
    payload: PayrollGenerate,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    # Check if run already exists for this month/year
    existing = db.query(PayrollRecord).filter(
        PayrollRecord.month == payload.month,
        PayrollRecord.year == payload.year
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Payroll record already generated for {payload.month}/{payload.year}.")

    active_staff = db.query(StaffUser).filter(StaffUser.is_active == True).all()  # noqa: E712
    if not active_staff:
        raise HTTPException(status_code=400, detail="No active staff members found.")

    now = _as_utc_now()
    title = payload.title or f"LYKA Realty Payroll — {payload.year}-{payload.month:02d}"

    run = PayrollRecord(
        month=payload.month,
        year=payload.year,
        title=title,
        total_employees=len(active_staff),
        total_gross_aed=0.0,
        total_deductions_aed=0.0,
        total_net_aed=0.0,
        status="draft",
        processed_by=str(ctx.get("email")),
        created_at=now,
        updated_at=now,
    )
    db.add(run)
    db.flush()

    total_gross = 0.0
    total_deductions = 0.0
    total_net = 0.0

    for s in active_staff:
        basic = s.salary_basic_aed or 12000.0
        allowances = s.salary_allowances_aed or 3000.0
        deductions = s.salary_deductions_aed or 0.0

        # Query closed commissions for this salesperson in this month/year
        comm_records = db.query(CommissionRecord).filter(
            func.lower(CommissionRecord.staff_email) == s.email.lower(),
            CommissionRecord.status == "approved",
            func.extract("month", CommissionRecord.created_at) == payload.month,
            func.extract("year", CommissionRecord.created_at) == payload.year,
        ).all()
        commission_aed = sum(c.amount_aed for c in comm_records)

        gross = basic + allowances + commission_aed
        net = max(0.0, gross - deductions)

        total_gross += gross
        total_deductions += deductions
        total_net += net

        payslip = Payslip(
            payroll_record_id=run.id,
            staff_user_id=s.id,
            staff_email=s.email,
            staff_name=s.name,
            month=payload.month,
            year=payload.year,
            basic_salary_aed=basic,
            allowances_aed=allowances,
            commission_aed=commission_aed,
            deductions_aed=deductions,
            net_salary_aed=net,
            status="draft",
            created_at=now,
        )
        db.add(payslip)

    run.total_gross_aed = round(total_gross, 2)
    run.total_deductions_aed = round(total_deductions, 2)
    run.total_net_aed = round(total_net, 2)

    db.commit()
    db.refresh(run)

    _log_hr_audit(
        db,
        actor_email=str(ctx.get("email")),
        actor_role=str(ctx.get("role")),
        action="payroll_generated",
        entity_type="payroll_record",
        entity_id=str(run.id),
        details={"period": f"{payload.year}-{payload.month}", "employees": len(active_staff), "total_net_aed": total_net},
    )
    return run


@router.post("/payroll/{record_id}/publish", response_model=PayrollRecordOut, summary="Publish payroll run & notify staff (Admin & HRMS Admin)")
def publish_payroll_run(
    record_id: int,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    run = db.query(PayrollRecord).filter(PayrollRecord.id == record_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found.")

    now = _as_utc_now()
    run.status = "published"
    run.updated_at = now

    payslips = db.query(Payslip).filter(Payslip.payroll_record_id == run.id).all()
    for p in payslips:
        p.status = "published"
        p.payment_date = now

        _send_hr_notification(
            db,
            recipient_email=p.staff_email,
            title=f"Payslip Published ({run.year}-{run.month:02d})",
            message=f"Your payslip for {run.year}-{run.month:02d} has been published. Net Salary: AED {p.net_salary_aed:,.2f}.",
            notification_type="payroll",
            link_url="/staff/payslips",
        )

    db.commit()
    db.refresh(run)

    _log_hr_audit(
        db,
        actor_email=str(ctx.get("email")),
        actor_role=str(ctx.get("role")),
        action="payroll_published",
        entity_type="payroll_record",
        entity_id=str(run.id),
        details={"period": f"{run.year}-{run.month}", "published_payslips": len(payslips)},
    )
    return run


@router.get("/payroll/records/{record_id}/payslips", response_model=List[PayslipOut], summary="Get payslips of a payroll run (Admin & HRMS Admin)")
def list_payroll_payslips(
    record_id: int,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    return db.query(Payslip).filter(Payslip.payroll_record_id == record_id).order_by(Payslip.staff_name).all()


@router.get("/payroll/my-payslips", response_model=List[PayslipOut], summary="Get strictly own published payslips (Self-service)")
def get_my_payslips(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    return db.query(Payslip).filter(
        Payslip.staff_user_id == staff.id,
        Payslip.status == "published"
    ).order_by(Payslip.year.desc(), Payslip.month.desc()).all()


# ─── 6. Recruitment & Careers Interviews ─────────────────────────────────────

@router.get("/recruitment/interviews", response_model=List[InterviewScheduleOut], summary="List recruitment interviews (Admin & HRMS Admin)")
def list_interviews(
    status: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    query = db.query(InterviewSchedule)
    if status:
        query = query.filter(InterviewSchedule.status == status)
    return query.order_by(InterviewSchedule.interview_date.desc()).all()


@router.post("/recruitment/interviews", response_model=InterviewScheduleOut, summary="Schedule candidate interview (Admin & HRMS Admin)")
def schedule_interview(
    payload: InterviewScheduleCreate,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    app_record = db.query(JobApplication).filter(JobApplication.id == payload.application_id).first()
    if not app_record:
        raise HTTPException(status_code=404, detail="Job application not found.")

    interviewer_email = payload.interviewer_email or str(ctx.get("email"))
    interviewer_staff = db.query(StaffUser).filter(func.lower(StaffUser.email) == interviewer_email.lower()).first()
    interviewer_name = interviewer_staff.name if interviewer_staff else (payload.interviewer_name or "LYKA Hiring Manager")

    now = _as_utc_now()
    schedule = InterviewSchedule(
        application_id=app_record.id,
        job_id=app_record.job_id,
        applicant_name=app_record.applicant_name,
        interviewer_email=interviewer_email,
        interviewer_name=interviewer_name,
        interview_date=payload.interview_date,
        round=payload.round,
        meeting_link=payload.meeting_link,
        location=payload.location or "LYKA HQ - Downtown Dubai",
        status="scheduled",
        created_at=now,
        updated_at=now,
    )
    db.add(schedule)

    # Update candidate status to interview_scheduled
    app_record.status = "interview_scheduled"
    app_record.updated_at = now

    db.commit()
    db.refresh(schedule)

    _log_hr_audit(
        db,
        actor_email=str(ctx.get("email")),
        actor_role=str(ctx.get("role")),
        action="interview_scheduled",
        entity_type="interview_schedule",
        entity_id=str(schedule.id),
        details={"applicant": app_record.applicant_name, "date": str(payload.interview_date), "round": payload.round},
    )

    _send_hr_notification(
        db,
        recipient_email=interviewer_email,
        title="Candidate Interview Scheduled",
        message=f"You have an interview scheduled with {app_record.applicant_name} ({payload.round}) on {payload.interview_date}.",
        notification_type="recruitment",
        link_url="/staff/recruitment",
    )
    return schedule


@router.patch("/recruitment/interviews/{interview_id}", response_model=InterviewScheduleOut, summary="Update interview feedback/status")
def update_interview(
    interview_id: int,
    payload: InterviewScheduleUpdate,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    interview = db.query(InterviewSchedule).filter(InterviewSchedule.id == interview_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found.")

    if payload.status:
        interview.status = payload.status
    if payload.feedback:
        interview.feedback = payload.feedback
    if payload.rating:
        interview.rating = payload.rating
    if payload.meeting_link:
        interview.meeting_link = payload.meeting_link

    interview.updated_at = _as_utc_now()
    db.commit()
    db.refresh(interview)
    return interview


# ─── 7. Performance Reviews ──────────────────────────────────────────────────

@router.get("/performance/reviews", response_model=List[PerformanceReviewOut], summary="List employee performance reviews (Admin & HRMS Admin)")
def list_performance_reviews(
    period: Optional[str] = Query(None),
    staff_email: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    query = db.query(PerformanceReview)
    if period:
        query = query.filter(PerformanceReview.review_period == period)
    if staff_email:
        query = query.filter(func.lower(PerformanceReview.staff_email) == staff_email.lower())
    return query.order_by(PerformanceReview.created_at.desc()).all()


@router.post("/performance/reviews", response_model=PerformanceReviewOut, summary="Create performance evaluation (Admin & HRMS Admin)")
def create_performance_review(
    payload: PerformanceReviewCreate,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    staff = db.query(StaffUser).filter(func.lower(StaffUser.email) == payload.staff_email.lower()).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Employee not found.")

    now = _as_utc_now()
    rev = PerformanceReview(
        staff_user_id=staff.id,
        staff_email=staff.email,
        reviewer_email=str(ctx.get("email")),
        review_period=payload.review_period,
        deals_closed_count=payload.deals_closed_count,
        revenue_generated_aed=payload.revenue_generated_aed,
        attendance_score_pct=payload.attendance_score_pct,
        overall_rating=payload.overall_rating,
        strengths=payload.strengths,
        areas_for_improvement=payload.areas_for_improvement,
        goals=payload.goals,
        status="submitted",
        created_at=now,
        updated_at=now,
    )
    db.add(rev)
    db.commit()
    db.refresh(rev)

    _log_hr_audit(
        db,
        actor_email=str(ctx.get("email")),
        actor_role=str(ctx.get("role")),
        action="performance_review_created",
        entity_type="performance_review",
        entity_id=str(rev.id),
        details={"staff_email": staff.email, "period": payload.review_period, "rating": payload.overall_rating},
    )

    _send_hr_notification(
        db,
        recipient_email=staff.email,
        title="Performance Review Submitted",
        message=f"Your performance review for {payload.review_period} has been completed by HR. Rating: {payload.overall_rating}/5.0",
        notification_type="general",
        link_url="/staff/performance",
    )
    return rev


@router.get("/performance/my-reviews", response_model=List[PerformanceReviewOut], summary="Get own performance reviews (Self-service)")
def get_my_performance_reviews(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    return db.query(PerformanceReview).filter(
        PerformanceReview.staff_user_id == staff.id
    ).order_by(PerformanceReview.created_at.desc()).all()


# ─── 8. HR Helpdesk & Queries ────────────────────────────────────────────────

@router.post("/requests", response_model=HRRequestOut, summary="Submit HR query or helpdesk ticket (Self-service)")
def create_hr_request(
    payload: HRRequestCreate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    now = _as_utc_now()

    # Generate ticket number HR-YYYYMMDD-XXXX
    rnd = "".join(random.choices(string.digits, k=4))
    ticket_num = f"HR-{now.strftime('%Y%m%d')}-{rnd}"

    req = HRRequest(
        ticket_number=ticket_num,
        staff_user_id=staff.id,
        staff_email=staff.email,
        staff_name=staff.name,
        category=payload.category,
        priority=payload.priority,
        subject=payload.subject,
        status="open",
        created_at=now,
        updated_at=now,
    )
    db.add(req)
    db.flush()

    msg = HRRequestMessage(
        request_id=req.id,
        sender_email=staff.email,
        sender_name=staff.name,
        sender_role=staff.role,
        message=payload.message,
        created_at=now,
    )
    db.add(msg)
    db.commit()
    db.refresh(req)

    # Notify HRMS Admins
    hrms_admins = db.query(StaffUser).filter(
        StaffUser.role.in_(["admin", "hrms_admin"]),
        StaffUser.is_active == True  # noqa: E712
    ).all()
    for ha in hrms_admins:
        _send_hr_notification(
            db,
            recipient_email=ha.email,
            title="New HR Helpdesk Ticket",
            message=f"{staff.name} opened ticket #{ticket_num}: {payload.subject} ({payload.priority} priority).",
            notification_type="hr_request",
            link_url="/staff/hr-requests",
        )

    return req


@router.get("/requests/my-requests", response_model=List[HRRequestOut], summary="List own HR tickets (Self-service)")
def list_my_hr_requests(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    return db.query(HRRequest).filter(
        HRRequest.staff_user_id == staff.id
    ).order_by(HRRequest.created_at.desc()).all()


@router.get("/requests/all", response_model=List[HRRequestOut], summary="List all HR tickets (Admin & HRMS Admin)")
def list_all_hr_requests(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    query = db.query(HRRequest)
    if status:
        query = query.filter(HRRequest.status == status)
    if priority:
        query = query.filter(HRRequest.priority == priority)
    if category:
        query = query.filter(HRRequest.category == category)
    return query.order_by(HRRequest.created_at.desc()).all()


@router.get("/requests/{request_id}", response_model=HRRequestOut, summary="Get HR ticket details with thread")
def get_hr_request_detail(
    request_id: int,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    req = db.query(HRRequest).filter(HRRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="HR ticket not found.")

    if ctx.get("role") not in ("admin", "hrms_admin") and req.staff_user_id != staff.id:
        raise HTTPException(status_code=403, detail="Cannot access other employee's HR requests.")

    return req


@router.post("/requests/{request_id}/messages", response_model=HRRequestMessageOut, summary="Reply to HR ticket thread")
def reply_hr_request(
    request_id: int,
    payload: HRRequestMessageCreate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    req = db.query(HRRequest).filter(HRRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="HR ticket not found.")

    if ctx.get("role") not in ("admin", "hrms_admin") and req.staff_user_id != staff.id:
        raise HTTPException(status_code=403, detail="Cannot reply to other employee's HR requests.")

    now = _as_utc_now()
    msg = HRRequestMessage(
        request_id=req.id,
        sender_email=staff.email,
        sender_name=staff.name,
        sender_role=staff.role,
        message=payload.message,
        attachment_url=payload.attachment_url,
        created_at=now,
    )
    db.add(msg)
    req.updated_at = now
    db.commit()
    db.refresh(msg)

    # Notify counterparty
    if staff.id == req.staff_user_id:
        # Notify assigned HR or all HR admins
        recipient = req.assigned_to or "admin"
        if req.assigned_to:
            _send_hr_notification(
                db,
                recipient_email=req.assigned_to,
                title=f"New Reply on Ticket #{req.ticket_number}",
                message=f"{staff.name} sent a reply on ticket #{req.ticket_number}.",
                notification_type="hr_request",
                link_url=f"/staff/hr-requests/{req.id}",
            )
    else:
        # Notify employee
        _send_hr_notification(
            db,
            recipient_email=req.staff_email,
            title=f"HR Reply on Ticket #{req.ticket_number}",
            message=f"{staff.name} from HR replied to your ticket #{req.ticket_number}.",
            notification_type="hr_request",
            link_url=f"/staff/hr-requests/{req.id}",
        )

    return msg


@router.patch("/requests/{request_id}/status", response_model=HRRequestOut, summary="Update HR ticket status (Admin & HRMS Admin)")
def update_hr_request_status(
    request_id: int,
    payload: HRRequestStatusUpdate,
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    req = db.query(HRRequest).filter(HRRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="HR ticket not found.")

    now = _as_utc_now()
    req.status = payload.status
    if payload.assigned_to is not None:
        req.assigned_to = payload.assigned_to
    if payload.status in ("resolved", "closed") and not req.resolved_at:
        req.resolved_at = now
    req.updated_at = now

    db.commit()
    db.refresh(req)

    _send_hr_notification(
        db,
        recipient_email=req.staff_email,
        title=f"Ticket #{req.ticket_number} Status Updated",
        message=f"Your HR ticket status was changed to {payload.status}.",
        notification_type="hr_request",
        link_url=f"/staff/hr-requests/{req.id}",
    )
    return req


# ─── 9. Employee Documents ───────────────────────────────────────────────────

@router.get("/documents/my-documents", response_model=List[EmployeeDocumentOut], summary="Get own documents (Self-service)")
def get_my_documents(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    return db.query(EmployeeDocument).filter(
        EmployeeDocument.staff_user_id == staff.id
    ).order_by(EmployeeDocument.created_at.desc()).all()


@router.post("/documents/upload", response_model=EmployeeDocumentOut, summary="Upload personnel document (All staff for own, HR for any)")
def upload_employee_document(
    payload: EmployeeDocumentCreate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = _get_caller_staff(db, ctx)
    is_hr = ctx.get("role") in ("admin", "hrms_admin")

    target_staff = staff
    if is_hr and payload.staff_email and payload.staff_email.lower() != staff.email.lower():
        target_staff = db.query(StaffUser).filter(func.lower(StaffUser.email) == payload.staff_email.lower()).first()
        if not target_staff:
            raise HTTPException(status_code=404, detail="Target employee not found.")

    doc = EmployeeDocument(
        staff_user_id=target_staff.id,
        staff_email=target_staff.email,
        title=payload.title,
        document_type=payload.document_type,
        file_url=payload.file_url,
        file_size_bytes=payload.file_size_bytes or 0,
        expiry_date=payload.expiry_date,
        is_verified=is_hr,
        uploaded_by=staff.email,
        created_at=_as_utc_now(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    _log_hr_audit(
        db,
        actor_email=str(ctx.get("email")),
        actor_role=str(ctx.get("role")),
        action="document_uploaded",
        entity_type="employee_document",
        entity_id=str(doc.id),
        details={"title": doc.title, "type": doc.document_type, "employee": doc.staff_email},
    )
    return doc


@router.get("/documents/all", response_model=List[EmployeeDocumentOut], summary="List all employee documents (Admin & HRMS Admin)")
def list_all_documents(
    staff_email: Optional[str] = Query(None),
    document_type: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    query = db.query(EmployeeDocument)
    if staff_email:
        query = query.filter(func.lower(EmployeeDocument.staff_email) == staff_email.lower())
    if document_type:
        query = query.filter(EmployeeDocument.document_type == document_type)
    return query.order_by(EmployeeDocument.created_at.desc()).all()


# ─── 10. HR Notifications & Audit Logs ───────────────────────────────────────

@router.get("/notifications", response_model=List[HRNotificationOut], summary="Get own notifications (All staff)")
def get_my_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    email = str(ctx.get("email") or "").lower()
    query = db.query(HRNotification).filter(func.lower(HRNotification.recipient_email) == email)
    if unread_only:
        query = query.filter(HRNotification.is_read == False)  # noqa: E712
    return query.order_by(HRNotification.created_at.desc()).limit(limit).all()


@router.post("/notifications/{notification_id}/read", response_model=HRNotificationOut, summary="Mark notification as read (All staff)")
def mark_notification_read(
    notification_id: int,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    email = str(ctx.get("email") or "").lower()
    notif = db.query(HRNotification).filter(
        HRNotification.id == notification_id,
        func.lower(HRNotification.recipient_email) == email
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")

    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


@router.post("/notifications/read-all", summary="Mark all notifications as read (All staff)")
def mark_all_notifications_read(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    email = str(ctx.get("email") or "").lower()
    db.query(HRNotification).filter(
        func.lower(HRNotification.recipient_email) == email,
        HRNotification.is_read == False  # noqa: E712
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"status": "ok", "message": "All notifications marked as read."}


@router.get("/audit-logs", response_model=List[HRAuditLogOut], summary="List HR operational audit logs (Admin & HRMS Admin)")
def list_hr_audit_logs(
    limit: int = Query(100, ge=1, le=500),
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_hrms_admin),
    db: Session = Depends(get_db),
):
    query = db.query(HRAuditLog)
    if entity_type:
        query = query.filter(HRAuditLog.entity_type == entity_type)
    if action:
        query = query.filter(HRAuditLog.action == action)
    return query.order_by(HRAuditLog.created_at.desc()).limit(limit).all()

