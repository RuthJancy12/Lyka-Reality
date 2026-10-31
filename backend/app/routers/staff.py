"""
Staff, assignment, follow-up, and viewing endpoints with backend role enforcement.

- All routes require a verified Firebase staff identity (401 otherwise).
- /api/staff (list/create/update) is admin-only. Exactly one active admin is
  enforced: creating a second admin, or removing the last one, returns 409.
- Assignments/follow-ups/viewings: managers+ assign; salespeople see and
  update only their own assignments.
- Customers never appear here: verified non-staff emails resolve to role
  "customer" and receive 403 on these routes.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Activity, Assignment, AuditEvent, CallLog, CRMProperty, CustomerProfile, FollowUp,
    HRNotification, Lead, LeaveRequest, PerformanceTarget, StaffUser, Viewing,
)
from app.services.lead_source import CHANNELS, channel_predicate
from app.services.audit_service import log_audit
from app.services import notification_service
from app.services.firebase_auth import _ensure_admin
from app.services.property_analytics import sync_lead_conversion_events, sync_viewing_event
from app.schemas import (
    AssignmentCreate, AssignmentOut, AssignmentUpdate,
    AuditListOut,
    CallCreate, CallOut, CallUpdate,
    FollowUpComplete, FollowUpCreate, FollowUpOut,
    StaffCreate, StaffOut, StaffUpdate,
    TargetOut, TargetUpsert,
    ViewingCreate, ViewingOut, ViewingUpdate,
    LeadCoverageOverviewOut, LeadCoverageAssignPayload,
    LeadCoverageReturnPayload, LeadCoverageItemOut,
    AbsentAgentCoverageOut, EmployeeProfileUpdate,
)
from app.services.roles import (
    STAFF_ROLES, _identity_match, find_staff, forbid_second_admin,
    require_admin, require_manager_plus, require_roles, require_staff,
    resolve_role, team_lead_ids, team_scope_emails, is_org_wide_sales_manager,
)

logger = logging.getLogger("lyka.staff")
router = APIRouter(prefix="/api/staff", tags=["staff"])


def _utcnow():
    return datetime.now(timezone.utc)


def _row_is_mine(model: Any, row: Any, ctx: Dict[str, Any]) -> bool:
    """True when the row's staff identity matches the caller (UID or email)."""
    uid = ctx.get("uid")
    if uid and getattr(row, "staff_uid", None) == uid:
        return True
    return (getattr(row, "staff_email", "") or "").lower() == (ctx.get("email") or "").lower()


def _row_in_team_scope(db: Session, ctx: Dict[str, Any], staff_email: Optional[str]) -> bool:
    """True when the email belongs to the caller's team (or is the caller)."""
    scope = [(e or "").lower() for e in (team_scope_emails(db, ctx) or [])]
    return (staff_email or "").lower() in scope


# ─── Self ─────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=StaffOut, summary="Own staff profile (records login)")
def get_self(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = find_staff(db, ctx.get("uid"), ctx.get("email"))
    if not staff:
        raise HTTPException(status_code=403, detail="Staff record not found.")
    # Bind the stable UID on first verified sign-in (no-op afterwards).
    if ctx.get("uid") and not staff.firebase_uid:
        staff.firebase_uid = ctx["uid"]
    staff.last_login_at = _utcnow()
    staff.availability_status = staff.get_effective_availability(db)
    db.commit()
    db.refresh(staff)
    staff.availability_status = staff.get_effective_availability(db)
    return staff


@router.patch("/me", response_model=StaffOut, summary="Update own personal profile details (phone only)")
def update_self_profile(
    payload: EmployeeProfileUpdate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff = find_staff(db, ctx.get("uid"), ctx.get("email"))
    if not staff:
        raise HTTPException(status_code=403, detail="Staff record not found.")
    if payload.phone is not None:
        staff.phone = payload.phone.strip()
    staff.updated_at = _utcnow()
    db.commit()
    db.refresh(staff)
    staff.availability_status = staff.get_effective_availability(db)
    log_audit(db, ctx, "profile_phone_updated", "staff", staff.id, details={"phone": staff.phone})
    return staff


# ─── Staff management (admin only) ────────────────────────────────────────────

@router.get("", response_model=List[StaffOut], summary="List staff (admin/manager all, SM team only)")
def list_staff(
    include_inactive: bool = Query(False),
    q: Optional[str] = Query(None, description="Search query across name, email, department, designation"),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    if ctx["role"] in ("salesperson", "sales_agent"):
        raise HTTPException(status_code=403, detail="Insufficient role.")
    query = db.query(StaffUser)
    if not include_inactive:
        query = query.filter(StaffUser.is_active == True)  # noqa: E712
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(StaffUser.name).like(term),
                func.lower(StaffUser.email).like(term),
                func.lower(StaffUser.department).like(term),
                func.lower(StaffUser.designation).like(term),
                func.lower(StaffUser.employee_id).like(term),
            )
        )
    if ctx["role"] == "sales_manager":
        scope = team_scope_emails(db, ctx) or []
        lowered = [e.lower() for e in scope]
        query = query.filter(
            or_(StaffUser.email.in_(scope),
                func.lower(StaffUser.email).in_(lowered or [""]))
        )
    staff_results = query.order_by(StaffUser.role, StaffUser.email).all()
    for s in staff_results:
        s.availability_status = s.get_effective_availability(db)
    return staff_results


@router.post("", response_model=StaffOut, status_code=201, summary="Add/invite staff (admin)")
def create_staff(
    payload: StaffCreate,
    ctx: Dict[str, Any] = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if payload.role not in STAFF_ROLES:
        raise HTTPException(status_code=422, detail="Unknown role.")
    forbid_second_admin(db, payload.role)
    normalized_email = payload.email.strip().lower()
    existing = db.query(StaffUser).filter(func.lower(StaffUser.email) == normalized_email).first()
    if existing:
        if not existing.is_active:
            # Safe recovery/reactivation path for existing inactive staff
            existing.is_active = True
            existing.name = payload.name.strip()
            existing.role = payload.role
            if getattr(payload, "department", None):
                existing.department = payload.department
            if getattr(payload, "designation", None):
                existing.designation = payload.designation
            if getattr(payload, "manager_email", None):
                existing.manager_email = payload.manager_email
            if getattr(payload, "phone", None):
                existing.phone = payload.phone
            if getattr(payload, "salary_basic_aed", None) is not None:
                existing.salary_basic_aed = payload.salary_basic_aed
            if getattr(payload, "salary_allowances_aed", None) is not None:
                existing.salary_allowances_aed = payload.salary_allowances_aed
            if getattr(payload, "salary_deductions_aed", None) is not None:
                existing.salary_deductions_aed = payload.salary_deductions_aed

            invitation_link = None
            if _ensure_admin():
                try:
                    from firebase_admin import auth as admin_auth
                    fb_user = None
                    try:
                        fb_user = admin_auth.get_user_by_email(normalized_email)
                    except Exception:
                        pass
                    if fb_user:
                        existing.firebase_uid = fb_user.uid
                        admin_auth.set_custom_user_claims(fb_user.uid, {"role": payload.role})
                        if payload.password:
                            admin_auth.update_user(fb_user.uid, password=payload.password, display_name=payload.name)
                        else:
                            try:
                                invitation_link = admin_auth.generate_password_reset_link(normalized_email)
                            except Exception:
                                pass
                except Exception as e:
                    logger.warning("Firebase sync during reactivation: %s", e)

            db.commit()
            db.refresh(existing)
            existing.message = "Existing inactive employee account has been reactivated and updated."
            existing.invitation_link = invitation_link
            return existing
        elif getattr(payload, "update_existing", False):
            # Safe update path if Admin explicitly approves updating the existing record
            existing.name = payload.name.strip()
            existing.role = payload.role
            if getattr(payload, "department", None):
                existing.department = payload.department
            if getattr(payload, "designation", None):
                existing.designation = payload.designation
            if getattr(payload, "manager_email", None):
                existing.manager_email = payload.manager_email
            if getattr(payload, "phone", None):
                existing.phone = payload.phone
            if getattr(payload, "salary_basic_aed", None) is not None:
                existing.salary_basic_aed = payload.salary_basic_aed
            if getattr(payload, "salary_allowances_aed", None) is not None:
                existing.salary_allowances_aed = payload.salary_allowances_aed
            if getattr(payload, "salary_deductions_aed", None) is not None:
                existing.salary_deductions_aed = payload.salary_deductions_aed

            invitation_link = None
            if _ensure_admin():
                try:
                    from firebase_admin import auth as admin_auth
                    fb_user = None
                    try:
                        fb_user = admin_auth.get_user_by_email(normalized_email)
                    except Exception:
                        pass
                    if fb_user:
                        existing.firebase_uid = fb_user.uid
                        admin_auth.set_custom_user_claims(fb_user.uid, {"role": payload.role})
                        if payload.password:
                            admin_auth.update_user(fb_user.uid, password=payload.password, display_name=payload.name)
                except Exception as e:
                    logger.warning("Firebase sync during update_existing: %s", e)

            db.commit()
            db.refresh(existing)
            existing.message = "Existing employee details have been successfully updated."
            existing.invitation_link = invitation_link
            return existing
        else:
            raise HTTPException(
                status_code=409,
                detail=f"Staff email '{normalized_email}' is already registered as an active employee ({existing.name}, ID: {existing.employee_id or 'N/A'}, Role: {existing.role}). Use Edit Employee to modify this account."
            )

    fb_uid: Optional[str] = None
    created_new_fb_user: bool = False
    invitation_link: Optional[str] = None
    msg: str = "Staff member created."

    # If Firebase Admin SDK is available, create or update user in Firebase Auth
    if _ensure_admin():
        try:
            from firebase_admin import auth as admin_auth

            fb_user = None
            try:
                fb_user = admin_auth.get_user_by_email(normalized_email)
            except admin_auth.UserNotFoundError:
                fb_user = None
            except Exception as e:
                logger.info("Firebase get_user_by_email lookup for %s: %s", normalized_email, e)

            if fb_user:
                # User already exists in Firebase Auth: bind their UID and set custom role claim
                fb_uid = fb_user.uid
                admin_auth.set_custom_user_claims(fb_uid, {"role": payload.role})
                if payload.password:
                    admin_auth.update_user(fb_uid, password=payload.password, display_name=payload.name)
                    msg = "Existing Firebase user linked to staff role with updated initial password."
                else:
                    try:
                        invitation_link = admin_auth.generate_password_reset_link(normalized_email)
                    except Exception as e:
                        logger.info("Could not generate password reset link for existing user: %s", e)
                    msg = "Existing Firebase user linked to staff role."
            else:
                # User does not exist in Firebase Auth: create new Firebase account
                user_kwargs: Dict[str, Any] = {
                    "email": normalized_email,
                    "display_name": payload.name.strip(),
                    "email_verified": False,
                }
                if payload.password:
                    user_kwargs["password"] = payload.password

                new_user = admin_auth.create_user(**user_kwargs)
                fb_uid = new_user.uid
                created_new_fb_user = True
                admin_auth.set_custom_user_claims(fb_uid, {"role": payload.role})

                if not payload.password:
                    try:
                        invitation_link = admin_auth.generate_password_reset_link(normalized_email)
                    except Exception as e:
                        logger.warning("Could not generate password reset link for new user: %s", e)
                    msg = "Staff user created in Firebase Authentication. Invitation password setup link generated."
                else:
                    msg = "Staff user created in Firebase Authentication with specified initial password."

        except HTTPException:
            raise
        except Exception as fb_err:
            logger.error("Firebase user creation failed for %s: %s", normalized_email, fb_err)
            raise HTTPException(
                status_code=400,
                detail=f"Firebase user creation failed: {str(fb_err)}"
            )

    # Ensure emp_id is unique across all existing staff records
    all_emp_ids = [r[0] for r in db.query(StaffUser.employee_id).filter(StaffUser.employee_id.isnot(None)).all() if r[0]]
    max_num = 0
    for eid in all_emp_ids:
        if eid.startswith("EMP-"):
            try:
                n = int(eid.replace("EMP-", ""))
                if n > max_num:
                    max_num = n
            except ValueError:
                pass
    candidate_num = max(max_num + 1, (db.query(StaffUser).count() + 1))
    emp_id = f"EMP-{candidate_num:03d}"
    while db.query(StaffUser).filter(StaffUser.employee_id == emp_id).first():
        candidate_num += 1
        emp_id = f"EMP-{candidate_num:03d}"

    dept = getattr(payload, "department", None) or ("Human Resources" if payload.role == "hrms_admin" else "Sales")
    desig = getattr(payload, "designation", None) or ("HR Director" if payload.role == "hrms_admin" else "Sales Consultant")
    phone = getattr(payload, "phone", None)
    salary_basic = getattr(payload, "salary_basic_aed", None) or 12000.0
    salary_allowances = getattr(payload, "salary_allowances_aed", None) or 3000.0
    salary_deductions = getattr(payload, "salary_deductions_aed", None) or 0.0

    staff = StaffUser(
        email=normalized_email,
        name=payload.name.strip(),
        role=payload.role,
        is_active=True,
        manager_email=payload.manager_email,
        firebase_uid=fb_uid,
        employee_id=emp_id,
        department=dept,
        designation=desig,
        phone=phone,
        salary_basic_aed=salary_basic,
        salary_allowances_aed=salary_allowances,
        salary_deductions_aed=salary_deductions,
        employment_status="full_time",
        joining_date=_utcnow(),
    )

    try:
        db.add(staff)
        db.commit()
        db.refresh(staff)
    except Exception as db_err:
        db.rollback()
        # Roll back newly created Firebase user to prevent orphan records
        if created_new_fb_user and fb_uid:
            try:
                from firebase_admin import auth as admin_auth
                admin_auth.delete_user(fb_uid)
                logger.info("Rolled back created Firebase user %s after DB error", fb_uid)
            except Exception as cleanup_err:
                logger.error("Failed to clean up Firebase user %s after DB error: %s", fb_uid, cleanup_err)
        logger.error("Database persistence failed for staff %s: %s", normalized_email, db_err)
        raise HTTPException(
            status_code=500,
            detail="Database persistence failed. Staff creation was safely rolled back."
        )

    # Initialize default leave balance for new employee
    try:
        from app.models import LeaveBalance
        db.add(LeaveBalance(
            staff_user_id=staff.id,
            staff_email=staff.email,
            year=_utcnow().year,
            annual_total=30.0,
            annual_used=0.0,
            sick_total=15.0,
            sick_used=0.0,
            casual_total=7.0,
            casual_used=0.0,
            unpaid_used=0.0,
        ))
        db.commit()
    except Exception:
        db.rollback()

    log_audit(
        db, ctx, "staff_created", "staff", staff.id,
        details={"email": staff.email, "role": staff.role, "firebase_uid": staff.firebase_uid}
    )

    return {
        "id": staff.id,
        "email": staff.email,
        "firebase_uid": staff.firebase_uid,
        "name": staff.name,
        "role": staff.role,
        "is_active": staff.is_active,
        "manager_email": staff.manager_email,
        "employee_id": staff.employee_id,
        "department": staff.department,
        "designation": staff.designation,
        "phone": staff.phone,
        "last_login_at": staff.last_login_at,
        "created_at": staff.created_at,
        "updated_at": staff.updated_at,
        "invitation_link": invitation_link,
        "message": msg,
    }


@router.patch("/{staff_id:int}", response_model=StaffOut, summary="Update staff (admin)")
def update_staff(
    staff_id: int,
    payload: StaffUpdate,
    ctx: Dict[str, Any] = Depends(require_admin),
    db: Session = Depends(get_db),
):
    staff = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found.")
    if payload.role is not None:
        if payload.role not in STAFF_ROLES:
            raise HTTPException(status_code=422, detail="Unknown role.")
        forbid_second_admin(db, payload.role, exclude_id=staff.id)
        staff.role = payload.role
        if _ensure_admin() and staff.firebase_uid:
            try:
                from firebase_admin import auth as admin_auth
                admin_auth.set_custom_user_claims(staff.firebase_uid, {"role": staff.role})
            except Exception as e:
                logger.info("Could not sync custom role claims to Firebase for %s: %s", staff.email, e)
    if payload.name is not None:
        staff.name = payload.name
    if getattr(payload, "department", None) is not None:
        staff.department = payload.department
    if getattr(payload, "designation", None) is not None:
        staff.designation = payload.designation
    if getattr(payload, "phone", None) is not None:
        staff.phone = payload.phone
    if getattr(payload, "employment_status", None) is not None:
        staff.employment_status = payload.employment_status
    if getattr(payload, "salary_basic_aed", None) is not None:
        staff.salary_basic_aed = payload.salary_basic_aed
    if getattr(payload, "salary_allowances_aed", None) is not None:
        staff.salary_allowances_aed = payload.salary_allowances_aed
    if getattr(payload, "salary_deductions_aed", None) is not None:
        staff.salary_deductions_aed = payload.salary_deductions_aed
    if "manager_email" in payload.model_dump(exclude_unset=True):
        # Explicit null clears the team assignment; omitted leaves it.
        staff.manager_email = payload.manager_email
    if payload.is_active is not None:
        if staff.role == "admin" and payload.is_active is False:
            # Deactivating the last active admin is forbidden.
            forbid_second_admin(db, "admin", exclude_id=None)
            raise HTTPException(
                status_code=409,
                detail="Cannot deactivate the only active Admin.",
            )
        staff.is_active = payload.is_active
    staff.updated_at = _utcnow()
    db.commit()
    db.refresh(staff)
    log_audit(db, ctx, "staff_updated", "staff", staff.id,
              details={"role": staff.role, "is_active": staff.is_active})
    return staff


# ─── Role-scoped operational overview ───────────────────────────────────────

def _as_utc(dt: Any) -> Optional[datetime]:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


@router.get("/overview", summary="Role-scoped dashboard overview (real data)")
def get_overview(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Single real-data summary powering every role dashboard.

    Scoping mirrors the list endpoints: admin/manager see everything,
    sales managers see their team (+themselves), salespeople see only
    their own assignments. Staff totals are included for admin/manager
    (read-only here; writes stay admin-only).
    """
    role = ctx.get("role")
    now = datetime.now(timezone.utc)

    # Lead IDs visible to the caller.
    if role in ("admin", "manager", "hrms_admin"):
        visible_ids: Optional[List[int]] = None
    elif role == "sales_manager":
        if is_org_wide_sales_manager(db, ctx):
            visible_ids = None
        else:
            visible_ids = team_lead_ids(db, ctx) or []
    else:
        own = db.query(Assignment).filter(_identity_match(Assignment, ctx)).all()
        visible_ids = [a.lead_id for a in own]

    def _scope_leads(q):
        if visible_ids is not None:
            q = q.filter(Lead.id.in_(visible_ids or [-1]))
        return q

    leads_total = _scope_leads(db.query(func.count(Lead.id))).scalar() or 0

    open_assigned_ids = {
        r[0] for r in db.query(Assignment.lead_id)
        .filter(Assignment.status != "closed").all()
    }
    if visible_ids is not None:
        open_assigned_ids &= set(visible_ids)
    assigned_leads = len(open_assigned_ids)
    unassigned_leads = _scope_leads(
        db.query(func.count(Lead.id)).filter(~Lead.id.in_(list(open_assigned_ids) or [-1]))
    ).scalar() or 0

    status_rows = _scope_leads(
        db.query(Lead.status, func.count(Lead.id))
    ).group_by(Lead.status).all()
    pipeline = {row[0]: row[1] for row in status_rows}

    # Acquisition-channel breakdown over the same scoped leads (real UTM data).
    channel_breakdown: Dict[str, int] = {}
    for ch in CHANNELS:
        channel_breakdown[ch] = (
            _scope_leads(db.query(func.count(Lead.id)))
            .filter(channel_predicate(Lead, ch))
            .scalar() or 0
        )

    # Follow-ups due within 7 days on visible leads (real notes only).
    fu_q = db.query(FollowUp).filter(FollowUp.next_action_at.isnot(None), FollowUp.completed_at.is_(None))
    if visible_ids is not None:
        fu_q = fu_q.filter(FollowUp.lead_id.in_(visible_ids or [-1]))
    due_cutoff = now + timedelta(days=7)
    due_all = fu_q.order_by(FollowUp.next_action_at.asc()).limit(200).all()
    due = [
        {
            "id": f.id, "lead_id": f.lead_id, "staff_email": f.staff_email,
            "note": f.note, "next_action_at": _as_utc(f.next_action_at),
            "created_at": _as_utc(f.created_at),
        }
        for f in due_all
        if (_as_utc(f.next_action_at) or due_cutoff + timedelta(days=1)) <= due_cutoff
    ]
    followups_due = due[:10]
    followups_due_count = len(due)

    # Upcoming scheduled viewings on visible leads.
    v_q = db.query(Viewing).filter(Viewing.status == "scheduled")
    if role == "salesperson":
        v_q = v_q.filter(_identity_match(Viewing, ctx))
    elif role == "sales_manager":
        scope = team_scope_emails(db, ctx) or []
        lowered = [e.lower() for e in scope]
        v_q = v_q.filter(
            or_(Viewing.staff_email.in_(scope),
                func.lower(Viewing.staff_email).in_(lowered or [""]))
        )
    upcoming_all = v_q.order_by(Viewing.scheduled_at.asc()).limit(100).all()
    upcoming = [
        {
            "id": v.id, "lead_id": v.lead_id, "property_ref": v.property_ref,
            "staff_email": v.staff_email, "scheduled_at": _as_utc(v.scheduled_at),
            "status": v.status,
        }
        for v in upcoming_all
        if (_as_utc(v.scheduled_at) or now) >= now - timedelta(hours=1)
    ]
    upcoming_viewings = upcoming[:10]

    recent = _scope_leads(db.query(Lead)).order_by(Lead.created_at.desc()).limit(8).all()
    recent_inquiries = [
        {
            "id": l.id, "customer_name": l.customer_name,
            "contact_email": l.contact_email, "location": l.location,
            "status": l.status, "priority_label": l.priority_label,
            "created_at": _as_utc(l.created_at),
        }
        for l in recent
    ]

    # Workload per staff email (team-scoped for SM, own for salesperson).
    perf_q = db.query(Assignment)
    if role == "salesperson":
        perf_q = perf_q.filter(_identity_match(Assignment, ctx))
    elif role == "sales_manager":
        scope = team_scope_emails(db, ctx) or []
        lowered = [e.lower() for e in scope]
        perf_q = perf_q.filter(
            or_(Assignment.staff_email.in_(scope),
                func.lower(Assignment.staff_email).in_(lowered or [""]))
        )
    perf_rows = perf_q.all()
    perf: Dict[str, Dict[str, int]] = {}
    for a in perf_rows:
        cell = perf.setdefault(a.staff_email, {"open": 0, "in_progress": 0, "closed": 0, "total": 0})
        cell["total"] += 1
        if a.status in cell:
            cell[a.status] += 1
    team_performance = [
        {"staff_email": email, **counts}
        for email, counts in sorted(perf.items(), key=lambda kv: -kv[1]["total"])
    ][:20]

    out: Dict[str, Any] = {
        "role": role,
        "leads_total": leads_total,
        "assigned_leads": assigned_leads,
        "unassigned_leads": unassigned_leads,
        "pipeline": pipeline,
        "channel_breakdown": channel_breakdown,
        "followups_due_count": followups_due_count,
        "followups_due": followups_due,
        "upcoming_viewings": upcoming_viewings,
        "recent_inquiries": recent_inquiries,
        "team_performance": team_performance,
    }

    if role in ("admin", "manager", "hrms_admin"):
        out["staff_total"] = db.query(func.count(StaffUser.id)).scalar() or 0
        out["active_staff"] = db.query(func.count(StaffUser.id)).filter(
            StaffUser.is_active == True  # noqa: E712
        ).scalar() or 0
    elif role == "sales_manager":
        team = team_scope_emails(db, ctx) or []
        out["team_members"] = team
        out["team_size"] = len(team)

    return out


# ─── Role-scoped analytics (real persisted rows only) ────────────────────────

def _pct(numerator: int, denominator: int):
    if denominator <= 0:
        return None
    return round((numerator / denominator) * 100, 1)


@router.get("/analytics", summary="Role-scoped business analytics (real data)")
def get_analytics(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Every metric below is derived from persisted rows, never demo values.

    Scope mirrors the operational overview: admin/manager see all leads,
    sales managers see their team, salespeople see their own active work.
    Empty datasets return 0 counts and `null` rates (not fake percentages).
    """
    role = ctx["role"]
    now = datetime.now(timezone.utc)

    if role in ("admin", "manager", "hrms_admin"):
        leads = db.query(Lead).all()
    elif role == "sales_manager":
        ids = team_lead_ids(db, ctx) or []
        leads = db.query(Lead).filter(Lead.id.in_(ids or [-1])).all()
    else:
        own_ids = [
            a.lead_id for a in
            db.query(Assignment).filter(_identity_match(Assignment, ctx))
            .filter(Assignment.status != "closed").all()
        ]
        leads = db.query(Lead).filter(Lead.id.in_(own_ids or [-1])).all()

    lead_ids = [l.id for l in leads]
    by_id = {l.id: l for l in leads}
    scope_ids = set(lead_ids)

    assignments = db.query(Assignment).filter(Assignment.lead_id.in_(lead_ids or [-1])).all()
    followups = db.query(FollowUp).filter(FollowUp.lead_id.in_(lead_ids or [-1])).all()
    calls = db.query(CallLog).filter(CallLog.lead_id.in_(lead_ids or [-1])).all()
    viewings = db.query(Viewing).filter(Viewing.lead_id.in_(lead_ids or [-1])).all()

    # Salespeople only see their own activity even if another staff member
    # previously worked the same lead. Sales managers are limited to team.
    if role == "salesperson":
        assignments = [a for a in assignments if _row_is_mine(Assignment, a, ctx)]
        followups = [f for f in followups if _row_is_mine(FollowUp, f, ctx)]
        calls = [c for c in calls if _row_is_mine(CallLog, c, ctx)]
        viewings = [v for v in viewings if _row_is_mine(Viewing, v, ctx)]
    elif role == "sales_manager":
        team_emails = {(e or "").lower() for e in (team_scope_emails(db, ctx) or [])}
        assignments = [a for a in assignments if (a.staff_email or "").lower() in team_emails]
        followups = [f for f in followups if (f.staff_email or "").lower() in team_emails]
        calls = [c for c in calls if (c.staff_email or "").lower() in team_emails]
        viewings = [v for v in viewings if (v.staff_email or "").lower() in team_emails]

    status_counts: Dict[str, int] = {}
    for lead in leads:
        status_counts[lead.status] = status_counts.get(lead.status, 0) + 1

    connected_call_lead_ids = {c.lead_id for c in calls if c.connected_at is not None}
    followup_lead_ids = {f.lead_id for f in followups}
    contacted_ids = {
        l.id for l in leads
        if l.status in ("contacted", "qualified", "closed")
        or l.id in connected_call_lead_ids
        or l.id in followup_lead_ids
    }
    completed_viewing_lead_ids = {v.lead_id for v in viewings if v.status == "completed"}
    closed_ids = {l.id for l in leads if l.status == "closed"}
    lost_ids = {l.id for l in leads if l.status == "lost"}

    first_action: Dict[int, datetime] = {}
    for a in assignments:
        dt = _as_utc(a.created_at)
        if dt and (a.lead_id not in first_action or dt < first_action[a.lead_id]):
            first_action[a.lead_id] = dt
    for f in followups:
        dt = _as_utc(f.created_at)
        if dt and (f.lead_id not in first_action or dt < first_action[f.lead_id]):
            first_action[f.lead_id] = dt
    for c in calls:
        dt = _as_utc(c.attempted_at)
        if dt and (c.lead_id not in first_action or dt < first_action[c.lead_id]):
            first_action[c.lead_id] = dt

    response_minutes: List[float] = []
    for lead_id, action_at in first_action.items():
        lead = by_id.get(lead_id)
        created = _as_utc(lead.created_at) if lead else None
        if created:
            delta = (action_at - created).total_seconds() / 60
            if delta >= 0:
                response_minutes.append(delta)

    followups_completed = sum(1 for f in followups if f.completed_at is not None)
    followups_overdue = sum(
        1 for f in followups
        if f.completed_at is None and f.next_action_at is not None
        and (_as_utc(f.next_action_at) or now) < now
    )

    sources = []
    for channel in CHANNELS:
        channel_ids = {
            row[0] for row in
            db.query(Lead.id).filter(Lead.id.in_(lead_ids or [-1]))
            .filter(channel_predicate(Lead, channel)).all()
        }
        sources.append({
            "channel": channel,
            "leads": len(channel_ids),
            "contacted": len(channel_ids & contacted_ids),
            "site_visits": len(channel_ids & completed_viewing_lead_ids),
            "deals": len(channel_ids & closed_ids),
            "conversion_rate": _pct(len(channel_ids & closed_ids), len(channel_ids)),
        })

    team: Dict[str, Dict[str, Any]] = {}

    def cell(email: str) -> Dict[str, Any]:
        return team.setdefault(email, {
            "staff_email": email, "assigned": 0, "open": 0, "closed_assignments": 0,
            "calls_attempted": 0, "calls_connected": 0, "followups": 0,
            "followups_completed": 0, "viewings_completed": 0, "deals": 0,
        })

    for a in assignments:
        row = cell(a.staff_email)
        row["assigned"] += 1
        if a.status == "closed":
            row["closed_assignments"] += 1
        else:
            row["open"] += 1
        lead = by_id.get(a.lead_id)
        if lead and lead.status == "closed":
            row["deals"] += 1
    for c in calls:
        row = cell(c.staff_email)
        if c.attempted_at is not None:
            row["calls_attempted"] += 1
        if c.connected_at is not None:
            row["calls_connected"] += 1
    for f in followups:
        row = cell(f.staff_email)
        row["followups"] += 1
        if f.completed_at is not None:
            row["followups_completed"] += 1
    for v in viewings:
        if v.status == "completed":
            cell(v.staff_email)["viewings_completed"] += 1

    locations: Dict[str, int] = {}
    property_types: Dict[str, int] = {}
    budget_buckets = {"Under AED 1M": 0, "AED 1M–2M": 0, "AED 2M–5M": 0, "AED 5M+": 0, "Not stated": 0}
    for lead in leads:
        if lead.location:
            locations[lead.location] = locations.get(lead.location, 0) + 1
        if lead.property_type:
            property_types[lead.property_type] = property_types.get(lead.property_type, 0) + 1
        budget = lead.budget_max
        if budget is None:
            budget_buckets["Not stated"] += 1
        elif budget < 1_000_000:
            budget_buckets["Under AED 1M"] += 1
        elif budget < 2_000_000:
            budget_buckets["AED 1M–2M"] += 1
        elif budget < 5_000_000:
            budget_buckets["AED 2M–5M"] += 1
        else:
            budget_buckets["AED 5M+"] += 1

    lost_reasons: Dict[str, int] = {}
    for lead in leads:
        if lead.status == "lost":
            reason = (lead.agent_notes or "").strip() or "Not recorded"
            lost_reasons[reason[:200]] = lost_reasons.get(reason[:200], 0) + 1

    calls_attempted = sum(1 for c in calls if c.attempted_at is not None)
    calls_connected = sum(1 for c in calls if c.connected_at is not None)
    calls_scheduled = sum(1 for c in calls if c.status == "scheduled")

    return {
        "role": role,
        "scope": {
            "leads_visible": len(leads),
            "salespeople_visible": len(team) if role != "salesperson" else 1,
        },
        "pipeline": status_counts,
        "totals": {
            "leads": len(leads),
            "contacted_leads": len(contacted_ids),
            "site_visits_completed": len(completed_viewing_lead_ids),
            "deals_closed": len(closed_ids),
            "leads_lost": len(lost_ids),
            "unassigned_leads": len(scope_ids - {a.lead_id for a in assignments if a.status != "closed"}),
            # Real catalogue/account totals for the admin oversight header.
            "customers_total": (db.query(func.count(CustomerProfile.id)).scalar() or 0)
                if role in ("admin", "manager") else 0,
            "properties_total": db.query(func.count(CRMProperty.id)).scalar() or 0,
        },
        "conversion": {
            "enquiry_to_contact_rate": _pct(len(contacted_ids), len(leads)),
            "contact_to_site_visit_rate": _pct(len(completed_viewing_lead_ids), len(contacted_ids)),
            "site_visit_to_deal_rate": _pct(len(closed_ids), len(completed_viewing_lead_ids)),
            "follow_up_completion_rate": _pct(followups_completed, len(followups)),
            "average_lead_response_minutes": (
                round(sum(response_minutes) / len(response_minutes), 1)
                if response_minutes else None
            ),
            "response_time_sample": len(response_minutes),
        },
        "calls": {
            "scheduled": calls_scheduled,
            "attempted": calls_attempted,
            "connected": calls_connected,
            "no_answer": sum(1 for c in calls if c.status == "attempted_no_answer"),
            "follow_up_required": sum(1 for c in calls if c.status == "follow_up_required"),
            "site_visit_scheduled": sum(1 for c in calls if c.status == "site_visit_scheduled"),
            "completed": sum(1 for c in calls if c.status == "completed"),
            "lost": sum(1 for c in calls if c.status == "lost"),
            "connect_rate": _pct(calls_connected, calls_attempted),
        },
        "followups": {
            "total": len(followups),
            "completed": followups_completed,
            "overdue": followups_overdue,
        },
        "source_performance": sources,
        "agent_productivity": sorted(
            team.values(),
            key=lambda row: (-row["deals"], -row["calls_connected"], -row["assigned"]),
        ),
        "property_demand": {
            "locations": [
                {"location": k, "count": v}
                for k, v in sorted(locations.items(), key=lambda kv: -kv[1])[:10]
            ],
            "property_types": [
                {"property_type": k, "count": v}
                for k, v in sorted(property_types.items(), key=lambda kv: -kv[1])[:8]
            ],
            "budget_buckets": [
                {"bucket": k, "count": v} for k, v in budget_buckets.items()
            ],
        },
        "lost_reasons": [
            {"reason": k, "count": v}
            for k, v in sorted(lost_reasons.items(), key=lambda kv: -kv[1])[:10]
        ],
        "definitions": {
            "contacted_lead": "Lead status is contacted/qualified/closed, or it has a connected call or follow-up note.",
            "enquiry_to_contact_rate": "Contacted leads ÷ visible leads.",
            "contact_to_site_visit_rate": "Leads with a completed viewing ÷ contacted leads.",
            "site_visit_to_deal_rate": "Closed leads ÷ leads with a completed viewing.",
            "follow_up_completion_rate": "Follow-ups with completed_at set ÷ all follow-ups in scope.",
            "average_lead_response_minutes": "Mean minutes from enquiry creation to the first assignment, follow-up, or actual call attempt. Scheduled-only calls are excluded.",
            "connect_rate": "Calls with connected_at set ÷ calls with attempted_at set.",
        },
    }


# ─── Audit trail (admin) ─────────────────────────────────────────────────────

@router.get("/audit", response_model=AuditListOut, summary="Business audit trail (admin)")
def list_audit_events(
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    ctx: Dict[str, Any] = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(AuditEvent)
    if entity_type:
        q = q.filter(AuditEvent.entity_type == entity_type)
    if action:
        q = q.filter(AuditEvent.action.ilike(f"%{action}%"))
    total = q.count()
    events = q.order_by(AuditEvent.created_at.desc()).limit(limit).all()
    return AuditListOut(events=events, total=total)


# ─── Monthly targets (admin/manager) ─────────────────────────────────────────

_TARGET_METRICS = (
    "leads", "deals_closed", "site_visits_completed",
    "calls_connected", "calls_attempted",
)


def _month_bounds(period: str) -> tuple[datetime, datetime]:
    try:
        year, month = (int(part) for part in period.split("-"))
        if not 1 <= month <= 12:
            raise ValueError
        start = datetime(year, month, 1, tzinfo=timezone.utc)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="period must be YYYY-MM.")
    end = (datetime(year + 1, 1, 1, tzinfo=timezone.utc) if month == 12
           else datetime(year, month + 1, 1, tzinfo=timezone.utc))
    return start, end


def _target_actual(db: Session, metric: str, start: datetime, end: datetime) -> int:
    if metric == "leads":
        return db.query(func.count(Lead.id)).filter(
            Lead.created_at >= start, Lead.created_at < end).scalar() or 0
    if metric == "deals_closed":
        return db.query(func.count(Lead.id)).filter(
            Lead.status == "closed",
            Lead.updated_at >= start, Lead.updated_at < end).scalar() or 0
    if metric == "site_visits_completed":
        return db.query(func.count(Viewing.id)).filter(
            Viewing.status == "completed",
            Viewing.updated_at >= start, Viewing.updated_at < end).scalar() or 0
    if metric == "calls_connected":
        return db.query(func.count(CallLog.id)).filter(
            CallLog.connected_at >= start, CallLog.connected_at < end).scalar() or 0
    if metric == "calls_attempted":
        return db.query(func.count(CallLog.id)).filter(
            CallLog.attempted_at >= start, CallLog.attempted_at < end).scalar() or 0
    return 0


def _target_out(db: Session, row: PerformanceTarget, start: datetime, end: datetime) -> TargetOut:
    actual = _target_actual(db, row.metric, start, end)
    progress = (round((actual / row.target_value) * 100, 1)
                if row.target_value > 0 else None)
    return TargetOut(
        id=row.id, metric=row.metric, period=row.period,
        target_value=row.target_value, actual_value=actual,
        progress_pct=progress, updated_by=row.updated_by, updated_at=row.updated_at,
    )


@router.get("/targets", response_model=List[TargetOut],
            summary="Monthly business targets with real progress (manager+)")
def list_targets(
    period: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_manager_plus),
    db: Session = Depends(get_db),
):
    period = period or datetime.now(timezone.utc).strftime("%Y-%m")
    start, end = _month_bounds(period)
    rows = (
        db.query(PerformanceTarget)
        .filter(PerformanceTarget.period == period)
        .order_by(PerformanceTarget.metric).all()
    )
    return [_target_out(db, row, start, end) for row in rows]


@router.put("/targets", response_model=TargetOut,
            summary="Set/update a monthly target (admin/manager)")
def upsert_target(
    payload: TargetUpsert,
    ctx: Dict[str, Any] = Depends(require_roles('admin', 'manager')),
    db: Session = Depends(get_db),
):
    if payload.metric not in _TARGET_METRICS:
        raise HTTPException(status_code=422, detail="Unknown target metric.")
    start, end = _month_bounds(payload.period)
    row = (
        db.query(PerformanceTarget)
        .filter(PerformanceTarget.metric == payload.metric,
                PerformanceTarget.period == payload.period)
        .first()
    )
    if row is None:
        row = PerformanceTarget(
            metric=payload.metric, period=payload.period,
            target_value=payload.target_value,
            updated_by=ctx.get("email") or "",
        )
        db.add(row)
    else:
        row.target_value = payload.target_value
        row.updated_by = ctx.get("email") or ""
        row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    log_audit(db, ctx, "target_updated", "target", row.id,
              details={"metric": row.metric, "period": row.period,
                       "target_value": row.target_value})
    return _target_out(db, row, start, end)


# ─── Customer directory (admin/manager read-only) ─────────────────────────

@router.get("/customers", summary="Customer directory (admin/manager)")
def list_customers(
    ctx: Dict[str, Any] = Depends(require_roles('admin', 'manager')),
    db: Session = Depends(get_db),
):
    """Permitted customer fields for authorized employees. Staff identities
    are excluded; customers resolve by absence of an active staff row.
    No firebase_uid or internal identifiers are exposed."""
    staff_uids = {
        (s.firebase_uid or "").strip()
        for s in db.query(StaffUser).filter(StaffUser.is_active == True).all()  # noqa: E712
    }
    staff_uids.discard("")
    staff_emails = {
        (s.email or "").strip().lower()
        for s in db.query(StaffUser).filter(StaffUser.is_active == True).all()  # noqa: E712
    }
    rows = (
        db.query(CustomerProfile)
        .order_by(CustomerProfile.updated_at.desc())
        .limit(200)
        .all()
    )
    out = []
    for p in rows:
        if (p.firebase_uid or "") in staff_uids:
            continue
        if (p.email or "").strip().lower() in staff_emails:
            continue
        out.append({
            "name": p.name,
            "email": p.email,
            "phone": p.phone,
            "city": p.city,
            "country": p.country,
            "role": "customer",
            "utm_source": p.utm_source,
            "utm_medium": p.utm_medium,
            "utm_campaign": p.utm_campaign,
            "referrer": p.referrer,
            "discovery_source": p.discovery_source,
            "created_at": _as_utc(p.created_at),
            "updated_at": _as_utc(p.updated_at),
        })
    return out


# ─── Assignments ──────────────────────────────────────────────────────────────

@router.get("/assignments", response_model=List[AssignmentOut], summary="List assignments (scoped)")
def list_assignments(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    q = db.query(Assignment)
    if ctx["role"] in ("salesperson", "sales_agent"):
        # Salespeople see only ACTIVE work: closed rows are history for
        # managers, and ex-assignees must lose access after reassignment.
        q = q.filter(_identity_match(Assignment, ctx)).filter(Assignment.status != "closed")
    elif ctx["role"] == "sales_manager":
        scope = team_scope_emails(db, ctx) or []
        lowered = [e.lower() for e in scope]
        q = q.filter(
            or_(Assignment.staff_email.in_(scope),
                func.lower(Assignment.staff_email).in_(lowered or [""]))
        )
    return q.order_by(Assignment.created_at.desc()).all()


@router.post("/assignments", response_model=AssignmentOut, status_code=201, summary="Assign lead (manager+)")
def create_assignment(
    payload: AssignmentCreate,
    ctx: Dict[str, Any] = Depends(require_manager_plus),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == payload.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    role, _, _ = resolve_role(db, {"email": payload.staff_email})
    if role not in STAFF_ROLES:
        raise HTTPException(status_code=422, detail="Assignee is not an active staff member.")
    if ctx["role"] == "sales_manager":
        # Sales managers distribute only within their authorized team.
        scope = [(e or "").lower() for e in (team_scope_emails(db, ctx) or [])]
        if (payload.staff_email or "").lower() not in scope:
            raise HTTPException(status_code=403, detail="Assignee is outside your team.")
    existing = (
        db.query(Assignment)
        .filter(Assignment.lead_id == payload.lead_id, Assignment.status != "closed")
        .first()
    )
    if existing:
        if getattr(payload, "reassign", False):
            existing.status = "closed"
            existing.updated_at = _utcnow()
        else:
            raise HTTPException(status_code=409, detail="Lead already has an open assignment.")
    assignee = find_staff(db, None, payload.staff_email)
    row = Assignment(
        lead_id=payload.lead_id, staff_email=payload.staff_email,
        staff_uid=assignee.firebase_uid if assignee else None,
        assigned_by=ctx["email"] or "", status="open",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    log_audit(db, ctx, "lead_assigned", "assignment", row.id, lead_id=row.lead_id,
              details={"staff_email": row.staff_email, "status": row.status})

    try:
        notification_service.create_notification(
            db=db,
            recipient_email=row.staff_email,
            recipient_user_id=row.staff_uid,
            recipient_role="salesperson",
            title="New Lead Assigned",
            message=f"You have been assigned to Lead #{row.lead_id} ({lead.customer_name}).",
            category="system",
            notification_type="lead_assigned",
            related_entity_type="lead",
            related_entity_id=row.lead_id,
            action_url=f"/crm/leads?id={row.lead_id}",
        )
    except Exception as exc:
        logger.warning("Failed to notify assigned staff: %s", exc)
    return row


@router.patch("/assignments/{assignment_id:int}", response_model=AssignmentOut, summary="Update assignment status")
def update_assignment(
    assignment_id: int,
    payload: AssignmentUpdate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    row = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if ctx["role"] == "salesperson" and not _row_is_mine(Assignment, row, ctx):
        raise HTTPException(status_code=403, detail="Salespeople update only their own assignments.")
    if ctx["role"] == "salesperson" and row.status == "closed":
        raise HTTPException(status_code=403, detail="Closed assignments are read-only history.")
    if ctx["role"] == "sales_manager" and not _row_in_team_scope(db, ctx, row.staff_email):
        raise HTTPException(status_code=403, detail="Assignment is outside your team.")
    row.status = payload.status
    row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    log_audit(db, ctx, "assignment_status_changed", "assignment", row.id,
              lead_id=row.lead_id,
              details={"staff_email": row.staff_email, "status": row.status})
    return row


# ─── Follow-ups (append-only) ─────────────────────────────────────────────────

@router.get("/followups", response_model=List[FollowUpOut], summary="List follow-up notes (scoped)")
def list_followups(
    lead_id: Optional[int] = Query(None),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    q = db.query(FollowUp)
    if lead_id is not None:
        q = q.filter(FollowUp.lead_id == lead_id)
    if ctx["role"] in ("salesperson", "sales_agent"):
        own_lead_ids = [
            a.lead_id for a in
            db.query(Assignment).filter(_identity_match(Assignment, ctx)).filter(
                Assignment.status != "closed").all()
        ]
        q = q.filter(FollowUp.lead_id.in_(own_lead_ids or [-1]))
    elif ctx["role"] == "sales_manager":
        team_ids = team_lead_ids(db, ctx) or [-1]
        q = q.filter(FollowUp.lead_id.in_(team_ids))
    return q.order_by(FollowUp.created_at.desc()).limit(200).all()


@router.post("/followups", response_model=FollowUpOut, status_code=201, summary="Add follow-up note")
def create_followup(
    payload: FollowUpCreate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == payload.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    if ctx["role"] in ("salesperson", "sales_agent"):
        own = (
            db.query(Assignment)
            .filter(Assignment.lead_id == payload.lead_id)
            .filter(_identity_match(Assignment, ctx))
            .filter(Assignment.status != "closed")
            .first()
        )
        if not own:
            raise HTTPException(status_code=403, detail="Lead is not assigned to you.")
    elif ctx["role"] == "sales_manager":
        if payload.lead_id not in (team_lead_ids(db, ctx) or []):
            raise HTTPException(status_code=403, detail="Lead is outside your team.")
    row = FollowUp(
        lead_id=payload.lead_id, staff_email=ctx["email"] or "",
        staff_uid=ctx.get("uid"),
        note=payload.note, next_action_at=payload.next_action_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    log_audit(db, ctx, "follow_up_added", "follow_up", row.id, lead_id=row.lead_id,
              details={"next_action_at": str(row.next_action_at) if row.next_action_at else None})
    return row


@router.patch("/followups/{followup_id:int}/complete", response_model=FollowUpOut,
              summary="Complete or reopen a follow-up")
def complete_followup(
    followup_id: int,
    payload: FollowUpComplete,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    row = db.query(FollowUp).filter(FollowUp.id == followup_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Follow-up not found.")
    if ctx["role"] in ("salesperson", "sales_agent"):
        if not _row_is_mine(FollowUp, row, ctx):
            raise HTTPException(status_code=403, detail="Salespeople update only their own follow-ups.")
        active = (
            db.query(Assignment)
            .filter(Assignment.lead_id == row.lead_id)
            .filter(_identity_match(Assignment, ctx))
            .filter(Assignment.status != "closed")
            .first()
        )
        if not active:
            raise HTTPException(status_code=403, detail="Lead is no longer assigned to you.")
    elif ctx["role"] == "sales_manager":
        if not _row_in_team_scope(db, ctx, row.staff_email):
            raise HTTPException(status_code=403, detail="Follow-up is outside your team.")
    row.completed_at = _utcnow() if payload.completed else None
    row.completed_by = (ctx.get("email") or "") if payload.completed else None
    db.commit()
    db.refresh(row)
    log_audit(
        db, ctx, "follow_up_completed" if payload.completed else "follow_up_reopened",
        "follow_up", row.id, lead_id=row.lead_id,
        details={"completed_by": row.completed_by},
    )
    return row


# ─── Calls (scheduled appointments vs actual call outcomes) ───────────────────

_CALL_CONNECTED_STATUSES = {
    "connected", "follow_up_required", "callback_requested", "site_visit_scheduled", "completed", "lost", "not_interested",
    "budget_mismatch", "wrong_number", "closed_won",
}


def _assert_lead_work_access(db: Session, ctx: Dict[str, Any], lead_id: int) -> Lead:
    """Reuse the same lead-access rules as follow-ups/viewings."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    if ctx["role"] in ("salesperson", "sales_agent"):
        own = (
            db.query(Assignment)
            .filter(Assignment.lead_id == lead_id)
            .filter(_identity_match(Assignment, ctx))
            .filter(Assignment.status != "closed")
            .first()
        )
        if not own:
            raise HTTPException(status_code=403, detail="Lead is not assigned to you.")
    elif ctx["role"] == "sales_manager":
        if lead_id not in (team_lead_ids(db, ctx) or []):
            raise HTTPException(status_code=403, detail="Lead is outside your team.")
    return lead


@router.get("/calls", response_model=List[CallOut], summary="List calls (scoped)")
def list_calls(
    lead_id: Optional[int] = Query(None),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    q = db.query(CallLog)
    if lead_id is not None:
        q = q.filter(CallLog.lead_id == lead_id)
    if ctx["role"] in ("salesperson", "sales_agent"):
        active_ids = [
            a.lead_id for a in
            db.query(Assignment).filter(_identity_match(Assignment, ctx)).filter(
                Assignment.status != "closed").all()
        ]
        q = q.filter(_identity_match(CallLog, ctx)).filter(
            CallLog.lead_id.in_(active_ids or [-1]))
    elif ctx["role"] == "sales_manager":
        scope = team_scope_emails(db, ctx) or []
        lowered = [e.lower() for e in scope]
        q = q.filter(
            or_(CallLog.staff_email.in_(scope),
                func.lower(CallLog.staff_email).in_(lowered or [""]))
        )
    return q.order_by(CallLog.scheduled_at.desc()).limit(300).all()


@router.post("/calls", response_model=CallOut, status_code=201,
             summary="Schedule a customer call or record an immediate manual call attempt")
def create_call(
    payload: CallCreate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    lead = _assert_lead_work_access(db, ctx, payload.lead_id)
    now = _utcnow()
    scheduled_at = payload.scheduled_at or now
    status = payload.status or "scheduled"

    # Avoid duplicate records from accidental rapid clicks (within 10s)
    ten_sec_ago = now - timedelta(seconds=10)
    recent_dup = (
        db.query(CallLog)
        .filter(CallLog.lead_id == payload.lead_id)
        .filter(_identity_match(CallLog, ctx))
        .filter(CallLog.status == status)
        .filter(CallLog.notes == payload.notes)
        .filter(CallLog.created_at >= ten_sec_ago)
        .first()
    )
    if recent_dup:
        return recent_dup

    attempted_at = payload.attempted_at
    connected_at = None
    if status != "scheduled":
        if attempted_at is None:
            attempted_at = now
        if status in _CALL_CONNECTED_STATUSES:
            connected_at = now

    prior_attempts = db.query(func.count(CallLog.id)).filter(CallLog.lead_id == payload.lead_id).scalar() or 0
    attempt_num = prior_attempts + 1
    is_first = (prior_attempts == 0)

    row = CallLog(
        lead_id=payload.lead_id,
        staff_email=ctx["email"] or "",
        staff_uid=ctx.get("uid"),
        scheduled_at=scheduled_at,
        attempted_at=attempted_at,
        connected_at=connected_at,
        status=status,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
        next_follow_up_at=payload.next_follow_up_at,
        customer_response=payload.customer_response,
        recommended_action=payload.recommended_action,
        attempt_number=attempt_num,
        is_first_call=is_first,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    if status == "scheduled":
        log_audit(db, ctx, "call_scheduled", "call", row.id, lead_id=row.lead_id,
                  details={"scheduled_at": str(row.scheduled_at)})
    else:
        log_audit(db, ctx, "call_outcome_recorded", "call", row.id, lead_id=row.lead_id,
                  details={"status": row.status, "attempted_at": str(row.attempted_at),
                           "connected_at": str(row.connected_at),
                           "next_follow_up_at": str(row.next_follow_up_at) if row.next_follow_up_at else None})

    # Log in lead Activity timeline so it displays chronologically
    if status != "scheduled":
        act_type = "agent_contacted" if connected_at else "call_attempted"
        outcome_label = status.replace("_", " ").title()
        act_note = f"Call attempt by {ctx.get('email')}: {outcome_label}"
        if payload.notes:
            act_note += f" — {payload.notes}"
        if payload.next_follow_up_at:
            act_note += f" (Follow-up scheduled: {payload.next_follow_up_at.strftime('%Y-%m-%d %H:%M')})"
        act = Activity(lead_id=row.lead_id, activity_type=act_type, notes=act_note, created_at=now)
        db.add(act)

        # Update lead stage if appropriate
        if connected_at and lead.status == "new":
            lead.status = "contacted"
            lead.updated_at = now

    if payload.lead_temperature and payload.lead_temperature in ("Cold", "Warm", "Hot"):
        lead.lead_score_band = payload.lead_temperature
        lead.updated_at = now

    if payload.lead_status and payload.lead_status in ("contacted", "qualified", "closed", "lost"):
        lead.status = payload.lead_status
        lead.updated_at = now

    if status.lower() in ("dnd", "do_not_disturb"):
        lead.do_not_disturb = True
        lead.status = "lost"
        lead.last_call_outcome = "DND"
        lead.next_followup_at = None
        lead.updated_at = now
    else:
        lead.last_call_outcome = status.replace("_", " ").title()
        lead.last_contacted_at = now
        lead.updated_at = now

    # Follow-Up system integration: persist note with next action date
    # (Do not create unnecessary reminders for Not Interested leads)
    if payload.next_follow_up_at and status != "not_interested":
        # Avoid duplicate follow-up records when a request is retried
        dup_fu = (
            db.query(FollowUp)
            .filter(FollowUp.lead_id == row.lead_id)
            .filter(_identity_match(FollowUp, ctx))
            .filter(FollowUp.next_action_at == payload.next_follow_up_at)
            .first()
        )
        if not dup_fu:
            fu_note = f"Follow-up from call ({status.replace('_', ' ')})"
            if payload.notes:
                fu_note += f": {payload.notes}"
            fu = FollowUp(
                lead_id=row.lead_id,
                staff_email=ctx["email"] or "",
                staff_uid=ctx.get("uid"),
                note=fu_note,
                next_action_at=payload.next_follow_up_at,
                created_at=now,
            )
            db.add(fu)
            log_audit(db, ctx, "follow_up_added", "follow_up", fu.id, lead_id=row.lead_id,
                      details={"next_action_at": str(fu.next_action_at), "source": "call_log"})

    db.commit()
    db.refresh(row)
    sync_lead_conversion_events(db, lead)
    return row


@router.patch("/calls/{call_id:int}", response_model=CallOut,
              summary="Record the actual call attempt and outcome")
def update_call(
    call_id: int,
    payload: CallUpdate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    row = db.query(CallLog).filter(CallLog.id == call_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Call not found.")
    if ctx["role"] in ("salesperson", "sales_agent"):
        if not _row_is_mine(CallLog, row, ctx):
            raise HTTPException(status_code=403, detail="Salespeople update only their own calls.")
        active = (
            db.query(Assignment)
            .filter(Assignment.lead_id == row.lead_id)
            .filter(_identity_match(Assignment, ctx))
            .filter(Assignment.status != "closed")
            .first()
        )
        if not active:
            raise HTTPException(status_code=403, detail="Lead is no longer assigned to you.")
    elif ctx["role"] == "sales_manager" and not _row_in_team_scope(db, ctx, row.staff_email):
        raise HTTPException(status_code=403, detail="Call is outside your team.")

    data = payload.model_dump(exclude_unset=True)
    new_status = data.pop("status", None)
    lead_temp = data.pop("lead_temperature", None)
    lead_stat = data.pop("lead_status", None)

    for field, value in data.items():
        setattr(row, field, value)

    lead = db.query(Lead).filter(Lead.id == row.lead_id).first()

    if new_status is not None:
        if new_status == "scheduled" and row.attempted_at is not None:
            raise HTTPException(
                status_code=409,
                detail="This call already has an actual attempt; choose an outcome instead.",
            )
        row.status = new_status
        now = _utcnow()
        # The key rule: an attempt is only recorded when staff explicitly
        # move the call out of "scheduled". Analytics never infer it.
        if new_status != "scheduled" and row.attempted_at is None:
            row.attempted_at = now
        if new_status in _CALL_CONNECTED_STATUSES and row.connected_at is None:
            row.connected_at = now

        # Add Activity entry for the outcome change
        act_type = "agent_contacted" if row.connected_at else "call_attempted"
        outcome_label = new_status.replace("_", " ").title()
        act_note = f"Call outcome recorded by {ctx.get('email')}: {outcome_label}"
        if row.notes:
            act_note += f" — {row.notes}"
        if row.next_follow_up_at:
            act_note += f" (Follow-up scheduled: {row.next_follow_up_at.strftime('%Y-%m-%d %H:%M')})"
        act = Activity(lead_id=row.lead_id, activity_type=act_type, notes=act_note, created_at=now)
        db.add(act)

        if row.connected_at and lead and lead.status == "new":
            lead.status = "contacted"
            lead.updated_at = now

    if lead:
        if lead_temp and lead_temp in ("Cold", "Warm", "Hot"):
            lead.lead_score_band = lead_temp
            lead.updated_at = _utcnow()
        if lead_stat and lead_stat in ("contacted", "qualified", "closed", "lost"):
            lead.status = lead_stat
            lead.updated_at = _utcnow()

    if payload.next_follow_up_at and row.status != "not_interested":
        now = _utcnow()
        dup_fu = (
            db.query(FollowUp)
            .filter(FollowUp.lead_id == row.lead_id)
            .filter(_identity_match(FollowUp, ctx))
            .filter(FollowUp.next_action_at == payload.next_follow_up_at)
            .first()
        )
        if not dup_fu:
            fu_note = f"Follow-up from call ({row.status.replace('_', ' ')})"
            if row.notes:
                fu_note += f": {row.notes}"
            fu = FollowUp(
                lead_id=row.lead_id,
                staff_email=ctx["email"] or "",
                staff_uid=ctx.get("uid"),
                note=fu_note,
                next_action_at=payload.next_follow_up_at,
                created_at=now,
            )
            db.add(fu)
            log_audit(db, ctx, "follow_up_added", "follow_up", fu.id, lead_id=row.lead_id,
                      details={"next_action_at": str(fu.next_action_at), "source": "call_log"})

    row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    sync_lead_conversion_events(db, lead)
    log_audit(db, ctx, "call_outcome_recorded", "call", row.id, lead_id=row.lead_id,
              details={"status": row.status, "attempted_at": str(row.attempted_at),
                       "connected_at": str(row.connected_at),
                       "next_follow_up_at": str(row.next_follow_up_at) if row.next_follow_up_at else None})
    return row



# ─── Viewings ─────────────────────────────────────────────────────────────────

@router.get("/viewings", response_model=List[ViewingOut], summary="List viewings (scoped)")
def list_viewings(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    q = db.query(Viewing)
    if ctx["role"] in ("salesperson", "sales_agent"):
        active_ids = [
            a.lead_id for a in
            db.query(Assignment).filter(_identity_match(Assignment, ctx)).filter(
                Assignment.status != "closed").all()
        ]
        q = q.filter(_identity_match(Viewing, ctx)).filter(
            Viewing.lead_id.in_(active_ids or [-1]))
    elif ctx["role"] == "sales_manager":
        scope = team_scope_emails(db, ctx) or []
        lowered = [e.lower() for e in scope]
        q = q.filter(
            or_(Viewing.staff_email.in_(scope),
                func.lower(Viewing.staff_email).in_(lowered or [""]))
        )
    return q.order_by(Viewing.scheduled_at.desc()).limit(200).all()


@router.post("/viewings", response_model=ViewingOut, status_code=201, summary="Schedule viewing")
def create_viewing(
    payload: ViewingCreate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == payload.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    if ctx["role"] in ("salesperson", "sales_agent"):
        own = (
            db.query(Assignment)
            .filter(Assignment.lead_id == payload.lead_id)
            .filter(_identity_match(Assignment, ctx))
            .filter(Assignment.status != "closed")
            .first()
        )
        if not own:
            raise HTTPException(status_code=403, detail="Lead is not assigned to you.")
    elif ctx["role"] == "sales_manager":
        if payload.lead_id not in (team_lead_ids(db, ctx) or []):
            raise HTTPException(status_code=403, detail="Lead is outside your team.")
    row = Viewing(
        lead_id=payload.lead_id, property_ref=payload.property_ref,
        staff_email=ctx["email"] or "", staff_uid=ctx.get("uid"),
        scheduled_at=payload.scheduled_at,
        status="scheduled",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    sync_viewing_event(db, row)
    log_audit(db, ctx, "viewing_scheduled", "viewing", row.id, lead_id=row.lead_id,
              details={"property_ref": row.property_ref, "scheduled_at": str(row.scheduled_at)})

    try:
        if lead.contact_email:
            notification_service.create_notification(
                db=db,
                recipient_email=lead.contact_email,
                title="Viewing Scheduled",
                message=f"Your viewing for {row.property_ref} is scheduled for {row.scheduled_at}.",
                category="appointments",
                notification_type="appointment_booked",
                related_entity_type="viewing",
                related_entity_id=row.id,
                action_url="/account",
            )
        if row.staff_email:
            notification_service.create_notification(
                db=db,
                recipient_email=row.staff_email,
                recipient_user_id=row.staff_uid,
                recipient_role="salesperson",
                title="New Viewing Scheduled",
                message=f"Viewing for {row.property_ref} with {lead.customer_name} scheduled for {row.scheduled_at}.",
                category="appointments",
                notification_type="appointment_booked",
                related_entity_type="viewing",
                related_entity_id=row.id,
                action_url="/crm/viewings",
            )
        notification_service.notify_admins(
            db=db,
            title="New Viewing Scheduled",
            message=f"Viewing booked for {lead.customer_name} on {row.property_ref}.",
            category="appointments",
            notification_type="appointment_booked",
            related_entity_type="viewing",
            related_entity_id=row.id,
            action_url="/crm/viewings",
        )
    except Exception as exc:
        logger.warning("Failed to dispatch viewing notifications: %s", exc)
    return row


@router.patch("/viewings/{viewing_id:int}", response_model=ViewingOut, summary="Update viewing")
def update_viewing(
    viewing_id: int,
    payload: ViewingUpdate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    row = db.query(Viewing).filter(Viewing.id == viewing_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Viewing not found.")
    if ctx["role"] == "salesperson" and not _row_is_mine(Viewing, row, ctx):
        raise HTTPException(status_code=403, detail="Salespeople update only their own viewings.")
    if ctx["role"] in ("salesperson", "sales_agent"):
        active = (
            db.query(Assignment)
            .filter(Assignment.lead_id == row.lead_id)
            .filter(_identity_match(Assignment, ctx))
            .filter(Assignment.status != "closed")
            .first()
        )
        if not active:
            raise HTTPException(status_code=403, detail="Lead is no longer assigned to you.")
    if ctx["role"] == "sales_manager" and not _row_in_team_scope(db, ctx, row.staff_email):
        raise HTTPException(status_code=403, detail="Viewing is outside your team.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    sync_viewing_event(db, row)
    log_audit(db, ctx, "viewing_updated", "viewing", row.id, lead_id=row.lead_id,
              details={"status": row.status})

    try:
        lead = db.query(Lead).filter(Lead.id == row.lead_id).first()
        customer_email = lead.contact_email if lead else None
        if row.status == "cancelled":
            if customer_email:
                notification_service.create_notification(
                    db=db,
                    recipient_email=customer_email,
                    title="Viewing Cancelled",
                    message=f"Your viewing for {row.property_ref} scheduled for {row.scheduled_at} has been cancelled.",
                    category="appointments",
                    notification_type="appointment_cancelled",
                    related_entity_type="viewing",
                    related_entity_id=row.id,
                    action_url="/account",
                )
            notification_service.notify_admins(
                db=db,
                title="Viewing Cancelled",
                message=f"Viewing #{row.id} for {row.property_ref} has been cancelled.",
                category="appointments",
                notification_type="appointment_cancelled",
                related_entity_type="viewing",
                related_entity_id=row.id,
                action_url="/crm/viewings",
            )
        elif row.status == "confirmed":
            if customer_email:
                notification_service.create_notification(
                    db=db,
                    recipient_email=customer_email,
                    title="Viewing Confirmed",
                    message=f"Your viewing for {row.property_ref} on {row.scheduled_at} has been confirmed.",
                    category="appointments",
                    notification_type="appointment_confirmed",
                    related_entity_type="viewing",
                    related_entity_id=row.id,
                    action_url="/account",
                )
    except Exception as exc:
        logger.warning("Failed to dispatch viewing update notification: %s", exc)
    return row


@router.post("/ai/assistant", summary="Executive AI Business Assistant (admin/manager)")
def ai_business_assistant(
    prompt_payload: Dict[str, str],
    ctx: Dict[str, Any] = Depends(require_roles("admin", "manager", "sales_manager")),
    db: Session = Depends(get_db),
):
    query = (prompt_payload.get("prompt") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Prompt is required.")

    # Gather live business context
    leads_count = db.query(func.count(Lead.id)).scalar() or 0
    hot_count = db.query(func.count(Lead.id)).filter(Lead.priority_label == "High").scalar() or 0
    connected_calls = db.query(func.count(CallLog.id)).filter(CallLog.connected_at.isnot(None)).scalar() or 0

    from app.models import Deal
    won_deals = db.query(func.count(Deal.id)).filter(Deal.deal_stage == "closed_won").scalar() or 0
    total_sales = db.query(func.sum(Deal.deal_value_aed)).filter(Deal.deal_stage == "closed_won").scalar() or 0.0

    sys_context = f"""You are the LYKA Realty Executive AI Business Advisor.
Current Real Estate Platform Metrics:
- Total Leads: {leads_count} (Hot Leads: {hot_count})
- Connected Client Calls: {connected_calls}
- Closed Won Deals: {won_deals} (Total Sales Volume: AED {total_sales:,.0f})
- Local Ollama AI Model: llama3.2:3b

Provide a sharp, executive-level business summary or actionable recommendation in 2-4 sentences."""

    import httpx
    try:
        res = httpx.post(
            "http://localhost:11434/api/generate",
            json={"model": "llama3.2:3b", "prompt": f"{sys_context}\n\nQuestion: {query}", "stream": False},
            timeout=8.0,
        )
        if res.status_code == 200:
            ai_ans = res.json().get("response", "").strip()
            if ai_ans:
                return {"query": query, "response": ai_ans, "source": "llama3.2:3b"}
    except Exception:
        pass

    ans = f"LYKA Realty currently manages {leads_count} active leads ({hot_count} High-Priority HOT leads) with {connected_calls} verified client call connections. Total closed transactions stand at AED {total_sales:,.0f} across {won_deals} closed deals. High recommendation to accelerate agent follow-ups on active Palm Jumeirah and Downtown Dubai inquiries."
    return {"query": query, "response": ans, "source": "executive_analytics"}


# ─── Leave Coverage & Sales Continuity Endpoints ──────────────────────────────

def _compute_coverage_priority_rank(lead: Lead, now: datetime) -> int:
    """
    Priority ranking:
    Rank 1: HOT / High Priority OR callback_requested == True OR overdue follow-up
    Rank 2: WARM / Medium Priority
    Rank 3: COLD / Low Priority or others
    """
    is_hot = (getattr(lead, "priority_label", "") or "").strip().lower() in ("high", "hot") or (getattr(lead, "lead_score", 0) or 0) >= 70
    cb_req = bool(getattr(lead, "callback_requested", False))
    next_f = getattr(lead, "next_followup_at", None)
    is_overdue = False
    if next_f:
        if next_f.tzinfo is None:
            next_f = next_f.replace(tzinfo=timezone.utc)
        if next_f < now:
            is_overdue = True

    if is_hot or cb_req or is_overdue:
        return 1

    is_warm = (getattr(lead, "priority_label", "") or "").strip().lower() in ("medium", "warm") or (30 <= (getattr(lead, "lead_score", 0) or 0) < 70)
    if is_warm:
        return 2
    return 3


def _lead_to_coverage_item(lead: Lead, now: datetime) -> LeadCoverageItemOut:
    rank = _compute_coverage_priority_rank(lead, now)
    return LeadCoverageItemOut(
        lead_id=lead.id,
        customer_name=getattr(lead, "customer_name", None) or getattr(lead, "name", None) or "Unnamed Customer",
        customer_email=getattr(lead, "contact_email", None) or getattr(lead, "email", None),
        customer_phone=getattr(lead, "contact_phone", None) or getattr(lead, "phone", None),
        priority_label=lead.priority_label,
        stage=getattr(lead, "status", None) or getattr(lead, "stage", None) or "new",
        callback_requested=bool(lead.callback_requested),
        next_followup_at=lead.next_followup_at,
        last_contacted_at=lead.last_contacted_at,
        last_call_outcome=lead.last_call_outcome,
        original_assigned_email=lead.original_assigned_email,
        current_responsible_email=lead.current_responsible_email,
        covering_agent_email=lead.covering_agent_email,
        coverage_status=lead.coverage_status or "normal",
        coverage_priority_rank=rank,
    )


@router.get("/leave-coverage", response_model=LeadCoverageOverviewOut, summary="Lead coverage overview for sales agents on leave (Admin & Manager)")
def get_lead_coverage_overview(
    ctx: Dict[str, Any] = Depends(require_manager_plus),
    db: Session = Depends(get_db),
):
    now = _utcnow()
    today_date = now.date()

    sales_staff = db.query(StaffUser).filter(
        StaffUser.role.in_(("salesperson", "sales_agent")),
        StaffUser.is_active == True,
    ).all()

    absent_agents: List[AbsentAgentCoverageOut] = []
    available_covering_agents: List[StaffOut] = []

    for s in sales_staff:
        eff_avail = s.get_effective_availability(db, today_date)
        s.availability_status = eff_avail
        if eff_avail == "on_leave":
            active_leave = db.query(LeaveRequest).filter(
                LeaveRequest.staff_user_id == s.id,
                LeaveRequest.status == "approved",
                LeaveRequest.start_date <= today_date,
                LeaveRequest.end_date >= today_date,
            ).first()

            agent_email = (s.email or "").strip().lower()
            assign_lead_ids = [
                a.lead_id for a in
                db.query(Assignment).filter(
                    func.lower(Assignment.staff_email) == agent_email,
                    Assignment.status != "closed",
                ).all()
            ]
            leads = db.query(Lead).filter(
                or_(
                    Lead.id.in_(assign_lead_ids or [-1]),
                    func.lower(Lead.original_assigned_email) == agent_email,
                    func.lower(Lead.current_responsible_email) == agent_email,
                ),
                Lead.status.notin_(["closed", "lost"]),
            ).all()

            lead_items = [_lead_to_coverage_item(l, now) for l in leads]
            lead_items.sort(key=lambda item: item.coverage_priority_rank)

            l_start = datetime.combine(active_leave.start_date, datetime.min.time(), tzinfo=timezone.utc) if active_leave else None
            l_end = datetime.combine(active_leave.end_date, datetime.max.time(), tzinfo=timezone.utc) if active_leave else None
            l_type = active_leave.leave_type if active_leave else None

            absent_agents.append(AbsentAgentCoverageOut(
                staff_id=s.id,
                email=s.email,
                name=s.name,
                employee_id=s.employee_id,
                availability_status=eff_avail,
                leave_start=l_start,
                leave_end=l_end,
                leave_type=l_type,
                leads=lead_items,
            ))
        else:
            available_covering_agents.append(s)

    unassigned_leads = db.query(Lead).filter(
        Lead.coverage_status == "coverage_required",
        Lead.covering_agent_email.is_(None),
        Lead.status.notin_(["closed", "lost"]),
    ).all()
    unassigned_queue = [_lead_to_coverage_item(l, now) for l in unassigned_leads]
    unassigned_queue.sort(key=lambda item: item.coverage_priority_rank)

    return LeadCoverageOverviewOut(
        absent_agents=absent_agents,
        unassigned_queue=unassigned_queue,
        available_covering_agents=available_covering_agents,
    )


@router.post("/leave-coverage/assign", summary="Assign temporary lead coverage for absent sales agent (Admin & Manager)")
def assign_lead_coverage(
    payload: LeadCoverageAssignPayload,
    ctx: Dict[str, Any] = Depends(require_manager_plus),
    db: Session = Depends(get_db),
):
    if not payload.lead_ids:
        raise HTTPException(status_code=400, detail="lead_ids list cannot be empty.")

    target_agent = db.query(StaffUser).filter(
        func.lower(StaffUser.email) == payload.covering_agent_email.strip().lower(),
        StaffUser.is_active == True,
    ).first()
    if not target_agent:
        raise HTTPException(status_code=404, detail="Covering sales agent not found or inactive.")
    if target_agent.role not in ("salesperson", "sales_agent", "admin", "manager"):
        raise HTTPException(status_code=400, detail="Covering agent must be a sales agent or manager.")

    now = _utcnow()
    reason = payload.coverage_reason or "Sales Agent On Leave"
    assigned_count = 0

    for lid in payload.lead_ids:
        lead = db.query(Lead).filter(Lead.id == lid).first()
        if not lead:
            continue

        # Find existing assignment to obtain original staff
        existing_asgn = db.query(Assignment).filter(Assignment.lead_id == lead.id, Assignment.status != "closed").first()
        orig_email = lead.original_assigned_email or (existing_asgn.staff_email if existing_asgn else None)
        lead.original_assigned_email = orig_email
        lead.current_responsible_email = target_agent.email
        lead.covering_agent_email = target_agent.email
        lead.coverage_status = "covered"
        lead.updated_at = now

        cov_start = now.date()
        cov_end = payload.coverage_end.date() if payload.coverage_end else None

        assignment = Assignment(
            lead_id=lead.id,
            staff_email=target_agent.email,
            staff_uid=target_agent.firebase_uid,
            assigned_by=ctx.get("email") or "admin",
            original_staff_email=orig_email,
            is_temporary_coverage=True,
            coverage_reason=reason,
            coverage_start=cov_start,
            coverage_end=cov_end,
            assignment_reason="Temporary Leave Coverage",
            status="open",
        )
        db.add(assignment)

        db.add(Activity(
            lead_id=lead.id,
            actor_email=ctx.get("email") or "admin",
            actor_name=ctx.get("name") or "Admin",
            action="temporary_coverage_assigned",
            description=f"Assigned temporary coverage to {target_agent.name} ({target_agent.email}). Original agent: {orig_email}. Reason: {reason}",
            created_at=now,
        ))

        cust_label = getattr(lead, "customer_name", None) or getattr(lead, "name", None) or "Customer"
        db.add(HRNotification(
            recipient_email=target_agent.email,
            recipient_role=target_agent.role,
            title="Temporary Lead Coverage Assigned",
            message=f"You have been assigned temporary coverage for Lead #{lead.id} ({cust_label}). Priority: {lead.priority_label or 'Normal'}. Reason: {reason}.",
            notification_type="lead_coverage",
            link_url=f"/crm/leads?lead_id={lead.id}",
        ))
        assigned_count += 1

    db.commit()
    log_audit(db, ctx, "leave_coverage_assigned", "leads", None,
              details={"covering_agent": target_agent.email, "lead_ids": payload.lead_ids, "reason": reason})
    return {
        "status": "success",
        "assigned_count": assigned_count,
        "covering_agent": target_agent.email,
        "coverage_reason": reason,
    }


@router.post("/leave-coverage/return", summary="Return or finalize covered leads after leave (Admin & Manager)")
def return_lead_coverage(
    payload: LeadCoverageReturnPayload,
    ctx: Dict[str, Any] = Depends(require_manager_plus),
    db: Session = Depends(get_db),
):
    if not payload.lead_ids:
        raise HTTPException(status_code=400, detail="lead_ids list cannot be empty.")
    now = _utcnow()
    processed_count = 0

    for lid in payload.lead_ids:
        lead = db.query(Lead).filter(Lead.id == lid).first()
        if not lead:
            continue

        orig_email = lead.original_assigned_email
        covering_email = lead.covering_agent_email
        cust_label = getattr(lead, "customer_name", None) or getattr(lead, "name", None) or "Customer"

        if payload.return_to_original:
            lead.current_responsible_email = orig_email
            lead.covering_agent_email = None
            lead.coverage_status = "normal"
            lead.updated_at = now

            temp_assigns = db.query(Assignment).filter(
                Assignment.lead_id == lead.id,
                Assignment.is_temporary_coverage == True,
            ).all()
            for ta in temp_assigns:
                ta.status = "closed"
                ta.coverage_end = now.date()

            db.add(Activity(
                lead_id=lead.id,
                actor_email=ctx.get("email") or "admin",
                actor_name=ctx.get("name") or "Admin",
                action="lead_returned_from_coverage",
                description=f"Returned lead from coverage back to original owner {orig_email}. Notes: {payload.notes or 'Leave ended'}",
                created_at=now,
            ))

            if orig_email:
                db.add(HRNotification(
                    recipient_email=orig_email,
                    recipient_role="salesperson",
                    title="Lead Returned from Coverage",
                    message=f"Lead #{lead.id} ({cust_label}) has returned to your active portfolio from coverage.",
                    notification_type="lead_coverage",
                    link_url=f"/crm/leads?lead_id={lead.id}",
                ))
        else:
            new_owner = covering_email
            lead.original_assigned_email = new_owner
            lead.current_responsible_email = new_owner
            lead.covering_agent_email = None
            lead.coverage_status = "normal"
            lead.updated_at = now

            temp_assigns = db.query(Assignment).filter(
                Assignment.lead_id == lead.id,
                Assignment.is_temporary_coverage == True,
            ).all()
            for ta in temp_assigns:
                ta.is_temporary_coverage = False
                ta.assignment_reason = "Permanent Reassignment After Coverage"

            db.add(Activity(
                lead_id=lead.id,
                actor_email=ctx.get("email") or "admin",
                actor_name=ctx.get("name") or "Admin",
                action="lead_reassigned_permanently",
                description=f"Lead permanently retained by {new_owner}. Notes: {payload.notes or 'Reassigned by admin'}",
                created_at=now,
            ))

        processed_count += 1

    db.commit()
    log_audit(db, ctx, "leave_coverage_returned", "leads", None,
              details={"lead_ids": payload.lead_ids, "return_to_original": payload.return_to_original})
    return {
        "status": "success",
        "processed_count": processed_count,
        "returned_to_original": payload.return_to_original,
    }
