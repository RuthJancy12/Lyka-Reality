"""Customer Contact Center & Call Monitoring System Router.

Role-scoped contact management, structured call monitoring, attempt tracking,
follow-ups, SLA compliance, and team performance analytics.
"""
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Activity,
    Assignment,
    CallLog,
    FollowUp,
    Lead,
    StaffUser,
    Viewing,
    utcnow,
)
from app.services.roles import is_org_wide_sales_manager, require_admin, require_staff, team_scope_emails

router = APIRouter(prefix="/api/staff/contact-center", tags=["contact-center"])

_DEFAULT_SLA_HOURS = 24
_SLA_CONFIG = {"threshold_hours": _DEFAULT_SLA_HOURS}

CONNECTED_OUTCOMES = {
    "connected",
    "follow_up_required",
    "callback_requested",
    "site_visit_scheduled",
    "budget_mismatch",
    "wrong_number",
    "closed_won",
    "completed",
    "not_interested",
    "lost",
}

NOT_CONNECTED_OUTCOMES = {
    "attempted_no_answer",
    "no_answer",
    "busy",
    "busy_unreachable",
    "switched_off",
    "network_issue",
    "invalid_number",
}


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _get_scope_leads(db: Session, ctx: Dict[str, Any]):
    """Returns a base query for Leads scoped to the caller's role."""
    role = ctx.get("role")
    email = (ctx.get("email") or "").lower()
    q = db.query(Lead)

    if role in ("salesperson", "sales_agent"):
        subq = (
            select(Assignment.lead_id)
            .filter(
                func.lower(Assignment.staff_email) == email,
                Assignment.status == "open",
            )
        )
        q = q.filter(
            or_(
                Lead.id.in_(subq),
                func.lower(Lead.covering_agent_email) == email,
                func.lower(Lead.current_responsible_email) == email,
            )
        )
    elif role == "hrms_admin":
        from sqlalchemy import text
        q = q.filter(text("1=0"))
    elif role in ("sales_manager", "manager"):
        if is_org_wide_sales_manager(db, ctx):
            return q
        team_emails = team_scope_emails(db, ctx) or [email]
        team_lower = [e.lower() for e in team_emails]
        subq = (
            select(Assignment.lead_id)
            .filter(
                func.lower(Assignment.staff_email).in_(team_lower),
                Assignment.status == "open",
            )
        )
        q = q.filter(Lead.id.in_(subq))
    # Admin sees all leads
    return q


# ─── 1. Summary Endpoint ────────────────────────────────────────────────────
@router.get("/summary", summary="Contact Center KPI summary (role-scoped)")
def get_contact_center_summary(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    leads_query = _get_scope_leads(db, ctx)
    lead_ids = [lid for (lid,) in leads_query.with_entities(Lead.id).all()]
    total_contacts = len(lead_ids)

    if not lead_ids:
        return {
            "total_contacts": 0,
            "not_contacted_count": 0,
            "connected_count": 0,
            "not_connected_count": 0,
            "pending_followups_count": 0,
            "calls_today": 0,
            "connected_today": 0,
            "connection_rate": 0.0,
            "avg_duration_minutes": 0.0,
            "sla_breaches_count": 0,
            "sla_threshold_hours": _SLA_CONFIG["threshold_hours"],
        }

    now = utcnow()
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    sla_cutoff = now - timedelta(hours=_SLA_CONFIG["threshold_hours"])

    # Query all calls for scoped leads
    all_calls = (
        db.query(CallLog)
        .filter(CallLog.lead_id.in_(lead_ids))
        .all()
    )

    lead_attempt_counts: Dict[int, int] = {}
    lead_connected_flags: Dict[int, bool] = {}
    calls_today = 0
    connected_today = 0
    total_connected = 0
    total_attempted = 0
    total_duration = 0.0
    connected_with_duration = 0

    for c in all_calls:
        att = _as_utc(c.attempted_at)
        if att:
            total_attempted += 1
            lead_attempt_counts[c.lead_id] = lead_attempt_counts.get(c.lead_id, 0) + 1
            if att >= today_start:
                calls_today += 1

            is_conn = c.connected_at is not None or c.status in CONNECTED_OUTCOMES
            if is_conn:
                total_connected += 1
                lead_connected_flags[c.lead_id] = True
                if att >= today_start:
                    connected_today += 1
                if c.duration_minutes:
                    total_duration += c.duration_minutes
                    connected_with_duration += 1

    not_contacted_count = 0
    connected_count = 0
    not_connected_count = 0
    sla_breaches_count = 0

    leads = leads_query.all()
    for lead in leads:
        attempts = lead_attempt_counts.get(lead.id, 0)
        has_conn = lead_connected_flags.get(lead.id, False)
        created = _as_utc(lead.created_at)

        if attempts == 0:
            not_contacted_count += 1
            if created and created < sla_cutoff and lead.status == "new":
                sla_breaches_count += 1
        elif has_conn:
            connected_count += 1
        else:
            not_connected_count += 1

    # Pending follow-ups due today or overdue
    pending_followups_count = (
        db.query(func.count(FollowUp.id))
        .filter(
            FollowUp.lead_id.in_(lead_ids),
            FollowUp.completed_at.is_(None),
            FollowUp.next_action_at <= (now + timedelta(hours=24)),
        )
        .scalar()
        or 0
    )

    conn_rate = round(100.0 * total_connected / total_attempted, 1) if total_attempted > 0 else 0.0
    avg_dur = round(total_duration / connected_with_duration, 1) if connected_with_duration > 0 else 0.0

    return {
        "total_contacts": total_contacts,
        "not_contacted_count": not_contacted_count,
        "connected_count": connected_count,
        "not_connected_count": not_connected_count,
        "pending_followups_count": pending_followups_count,
        "calls_today": calls_today,
        "connected_today": connected_today,
        "connection_rate": conn_rate,
        "avg_duration_minutes": avg_dur,
        "sla_breaches_count": sla_breaches_count,
        "sla_threshold_hours": _SLA_CONFIG["threshold_hours"],
    }


# ─── 2. Contacts List Endpoint ──────────────────────────────────────────────
@router.get("/contacts", summary="Filterable & searchable contacts list with call monitoring")
def list_contacts(
    tab: str = Query("all", description="all | connected | not_connected | not_contacted | follow_up"),
    search: Optional[str] = Query(None),
    temperature: Optional[str] = Query(None, description="Hot | Warm | Cold"),
    staff_email: Optional[str] = Query(None),
    sla_breached_only: bool = Query(False),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    sort_by: str = Query("newest"),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    base_q = _get_scope_leads(db, ctx)

    if staff_email:
        s_email = staff_email.strip().lower()
        subq = (
            select(Assignment.lead_id)
            .filter(
                func.lower(Assignment.staff_email) == s_email,
                Assignment.status == "open",
            )
        )
        base_q = base_q.filter(Lead.id.in_(subq))

    if search:
        s = f"%{search.strip().lower()}%"
        base_q = base_q.filter(
            or_(
                func.lower(Lead.customer_name).like(s),
                func.lower(Lead.contact_email).like(s),
                func.lower(Lead.contact_phone).like(s),
                func.lower(Lead.location).like(s),
                func.lower(Lead.property_ref).like(s),
            )
        )

    if temperature:
        base_q = base_q.filter(Lead.lead_score_band == temperature.title())

    is_sla_only = bool(sla_breached_only) if not hasattr(sla_breached_only, 'default') else bool(getattr(sla_breached_only, 'default', False))
    now = utcnow()
    sla_cutoff = now - timedelta(hours=_SLA_CONFIG["threshold_hours"])

    # Pre-fetch assignments for display
    all_scoped_leads = base_q.all()
    if not all_scoped_leads:
        return {"total": 0, "page": page, "limit": limit, "total_pages": 1, "contacts": []}

    lead_ids = [l.id for l in all_scoped_leads]

    # Pre-fetch assignments
    open_assignments = (
        db.query(Assignment)
        .filter(Assignment.lead_id.in_(lead_ids), Assignment.status == "open")
        .all()
    )
    assign_map: Dict[int, Assignment] = {a.lead_id: a for a in open_assignments}

    # Pre-fetch staff names
    staff_emails = {a.staff_email.lower() for a in open_assignments if a.staff_email}
    staff_users = (
        db.query(StaffUser)
        .filter(func.lower(StaffUser.email).in_(staff_emails))
        .all()
    ) if staff_emails else []
    name_map = {su.email.lower(): su.name for su in staff_users}

    # Pre-fetch calls
    all_calls = (
        db.query(CallLog)
        .filter(CallLog.lead_id.in_(lead_ids))
        .order_by(desc(CallLog.attempted_at), desc(CallLog.created_at))
        .all()
    )
    calls_by_lead: Dict[int, List[CallLog]] = {}
    for c in all_calls:
        calls_by_lead.setdefault(c.lead_id, []).append(c)

    # Pre-fetch pending follow-ups
    pending_fus = (
        db.query(FollowUp)
        .filter(FollowUp.lead_id.in_(lead_ids), FollowUp.completed_at.is_(None))
        .order_by(FollowUp.next_action_at)
        .all()
    )
    fu_map: Dict[int, FollowUp] = {}
    for f in pending_fus:
        if f.lead_id not in fu_map:
            fu_map[f.lead_id] = f

    # Filter and construct contact records
    filtered_contacts: List[Dict[str, Any]] = []

    for lead in all_scoped_leads:
        lead_calls = calls_by_lead.get(lead.id, [])
        attempt_calls = [c for c in lead_calls if c.attempted_at]
        total_attempts = len(attempt_calls)
        last_call = attempt_calls[0] if attempt_calls else (lead_calls[0] if lead_calls else None)

        is_connected = any(
            (c.connected_at is not None or c.status in CONNECTED_OUTCOMES)
            for c in attempt_calls
        )

        created_dt = _as_utc(lead.created_at)
        hours_elapsed = 0.0
        if created_dt:
            hours_elapsed = round((now - created_dt).total_seconds() / 3600.0, 1)

        sla_breached = (total_attempts == 0 and created_dt and created_dt < sla_cutoff and lead.status == "new")

        if is_sla_only and not sla_breached:
            continue

        # Tab filtering
        if tab == "not_contacted":
            if total_attempts > 0:
                continue
        elif tab == "connected":
            if not is_connected:
                continue
        elif tab == "not_connected":
            if total_attempts == 0 or is_connected:
                continue
        elif tab == "follow_up":
            if lead.id not in fu_map and not any(c.next_follow_up_at for c in lead_calls):
                continue

        asgn = assign_map.get(lead.id)
        assignee_email = asgn.staff_email if asgn else None
        assignee_name = name_map.get(assignee_email.lower(), assignee_email) if assignee_email else "Unassigned"

        next_fu = fu_map.get(lead.id)
        next_fu_time = next_fu.next_action_at if next_fu else None
        if not next_fu_time and last_call and last_call.next_follow_up_at:
            next_fu_time = last_call.next_follow_up_at

        first_call = next((c for c in lead_calls if c.is_first_call), (attempt_calls[-1] if attempt_calls else None))
        first_call_status = first_call.status if first_call else None
        first_call_date = first_call.attempted_at.isoformat() if first_call and first_call.attempted_at else None
        last_contacted_date = last_call.attempted_at.isoformat() if last_call and last_call.attempted_at else None
        lead_source = lead.discovery_source or lead.utm_source or "Website"

        contact_record = {
            "lead_id": lead.id,
            "customer_name": lead.customer_name or "Anonymous Lead",
            "contact_email": lead.contact_email or "",
            "contact_phone": lead.contact_phone or "",
            "location": lead.location or "Dubai",
            "property_type": lead.property_type or "Apartment",
            "property_ref": lead.property_ref or "",
            "budget_min": lead.budget_min,
            "budget_max": lead.budget_max,
            "purpose": lead.purpose or "Buy",
            "lead_temperature": lead.lead_score_band or "Warm",
            "status": lead.status or "new",
            "lead_source": lead_source,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
            "assigned_to": {
                "email": assignee_email,
                "name": assignee_name,
            },
            "total_call_attempts": total_attempts,
            "first_call_status": first_call_status,
            "first_call_date": first_call_date,
            "last_contacted_date": last_contacted_date,
            "is_connected": is_connected,
            "last_call": {
                "id": last_call.id if last_call else None,
                "status": last_call.status if last_call else None,
                "attempted_at": last_call.attempted_at.isoformat() if last_call and last_call.attempted_at else None,
                "duration_minutes": last_call.duration_minutes if last_call else None,
                "notes": last_call.notes if last_call else None,
            } if last_call else None,
            "next_follow_up_at": next_fu_time.isoformat() if next_fu_time else None,
            "sla_hours_elapsed": hours_elapsed,
            "sla_breached": sla_breached,
            "is_temporary_coverage": bool(getattr(asgn, "is_temporary_coverage", False) if asgn else (lead.coverage_status == "covered")),
            "original_staff_email": lead.original_assigned_email or (getattr(asgn, "original_staff_email", None) if asgn else None),
            "current_responsible_email": lead.current_responsible_email or assignee_email,
            "covering_agent_email": lead.covering_agent_email,
            "coverage_status": lead.coverage_status or "normal",
        }
        filtered_contacts.append(contact_record)

    # Sorting
    if sort_by == "oldest":
        filtered_contacts.sort(key=lambda x: x["created_at"] or "")
    elif sort_by == "last_called":
        filtered_contacts.sort(key=lambda x: (x["last_call"]["attempted_at"] if x["last_call"] else ""), reverse=True)
    elif sort_by == "sla":
        filtered_contacts.sort(key=lambda x: (x["sla_breached"], x["sla_hours_elapsed"]), reverse=True)
    elif sort_by == "temperature":
        prio = {"Hot": 3, "Warm": 2, "Cold": 1}
        filtered_contacts.sort(key=lambda x: prio.get(x["lead_temperature"], 0), reverse=True)
    else:  # newest
        filtered_contacts.sort(key=lambda x: x["created_at"] or "", reverse=True)

    total_items = len(filtered_contacts)
    total_pages = max(1, (total_items + limit - 1) // limit)
    offset = (page - 1) * limit
    paginated = filtered_contacts[offset : offset + limit]

    return {
        "total": total_items,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "contacts": paginated,
    }


# ─── 3. Daily Call History Endpoint ─────────────────────────────────────────
@router.get("/daily-history", summary="Chronological call history")
def get_daily_call_history(
    date_preset: Optional[str] = Query(None, description="today | yesterday | this_week | this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    staff_email: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    leads_q = _get_scope_leads(db, ctx)
    lead_ids = [lid for (lid,) in leads_q.with_entities(Lead.id).all()]
    if not lead_ids:
        return {"total": 0, "page": page, "limit": limit, "calls": []}

    q = db.query(CallLog).filter(CallLog.lead_id.in_(lead_ids))

    if staff_email:
        q = q.filter(func.lower(CallLog.staff_email) == staff_email.strip().lower())
    if status:
        q = q.filter(CallLog.status == status.strip())

    now = utcnow()
    if date_preset:
        today_start = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)
        if date_preset == "today":
            q = q.filter(CallLog.attempted_at >= today_start)
        elif date_preset == "yesterday":
            yesterday_start = today_start - timedelta(days=1)
            q = q.filter(CallLog.attempted_at >= yesterday_start, CallLog.attempted_at < today_start)
        elif date_preset == "this_week":
            week_start = today_start - timedelta(days=now.weekday())
            q = q.filter(CallLog.attempted_at >= week_start)
        elif date_preset == "this_month":
            month_start = datetime(now.year, now.month, 1, 0, 0, 0, tzinfo=timezone.utc)
            q = q.filter(CallLog.attempted_at >= month_start)

    if start_date:
        try:
            sd = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            q = q.filter(CallLog.attempted_at >= sd)
        except ValueError:
            pass

    if end_date:
        try:
            ed = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            q = q.filter(CallLog.attempted_at <= ed)
        except ValueError:
            pass

    total = q.count()
    calls = (
        q.order_by(desc(CallLog.attempted_at), desc(CallLog.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Fetch customer names for leads
    lead_ids_in_calls = {c.lead_id for c in calls}
    leads_info = db.query(Lead).filter(Lead.id.in_(lead_ids_in_calls)).all()
    lead_name_map = {l.id: {"name": l.customer_name or "Anonymous", "phone": l.contact_phone or "", "email": l.contact_email or ""} for l in leads_info}

    out_calls = []
    for c in calls:
        cust = lead_name_map.get(c.lead_id, {"name": "Lead #" + str(c.lead_id), "phone": "", "email": ""})
        is_conn = c.connected_at is not None or c.status in CONNECTED_OUTCOMES
        out_calls.append({
            "id": c.id,
            "lead_id": c.lead_id,
            "customer_name": cust["name"],
            "contact_phone": cust["phone"],
            "contact_email": cust["email"],
            "staff_email": c.staff_email,
            "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
            "attempted_at": c.attempted_at.isoformat() if c.attempted_at else None,
            "connected_at": c.connected_at.isoformat() if c.connected_at else None,
            "is_connected": is_conn,
            "status": c.status,
            "duration_minutes": c.duration_minutes,
            "notes": c.notes,
            "customer_response": c.customer_response,
            "recommended_action": c.recommended_action,
            "attempt_number": c.attempt_number or 1,
            "is_first_call": bool(c.is_first_call),
            "next_follow_up_at": c.next_follow_up_at.isoformat() if c.next_follow_up_at else None,
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, (total + limit - 1) // limit),
        "calls": out_calls,
    }


# ─── 4. Performance Comparison Endpoint ─────────────────────────────────────
@router.get("/performance", summary="Salesperson call performance comparison")
def get_performance_comparison(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    role = ctx.get("role")
    email = (ctx.get("email") or "").lower()

    if role == "salesperson":
        target_emails = [email]
    elif role in ("sales_manager", "manager"):
        target_emails = [e.lower() for e in (team_scope_emails(db, ctx) or [email])]
    else:  # admin sees all salespeople & sales managers
        staff_rows = db.query(StaffUser).filter(StaffUser.is_active == True).all()  # noqa: E712
        target_emails = [s.email.lower() for s in staff_rows]

    staff_records = (
        db.query(StaffUser)
        .filter(func.lower(StaffUser.email).in_(target_emails))
        .all()
    )
    staff_dict = {s.email.lower(): s for s in staff_records}

    results = []
    now = utcnow()
    sla_cutoff = now - timedelta(hours=_SLA_CONFIG["threshold_hours"])

    for s_email in target_emails:
        su = staff_dict.get(s_email)
        name = su.name if su else s_email

        # Assigned leads
        assigned_lead_ids = [
            a.lead_id for a in
            db.query(Assignment.lead_id)
            .filter(func.lower(Assignment.staff_email) == s_email, Assignment.status == "open")
            .all()
        ]
        total_assigned = len(assigned_lead_ids)

        # Calls by this staff member
        calls = (
            db.query(CallLog)
            .filter(func.lower(CallLog.staff_email) == s_email)
            .all()
        )
        attempted_calls = [c for c in calls if c.attempted_at]
        connected_calls = [c for c in attempted_calls if c.connected_at is not None or c.status in CONNECTED_OUTCOMES]

        total_attempts = len(attempted_calls)
        total_connected = len(connected_calls)
        conn_rate = round(100.0 * total_connected / total_attempts, 1) if total_attempts > 0 else 0.0

        durations = [c.duration_minutes for c in connected_calls if c.duration_minutes]
        avg_dur = round(sum(durations) / len(durations), 1) if durations else 0.0

        # Follow-ups completed
        completed_fus = (
            db.query(func.count(FollowUp.id))
            .filter(func.lower(FollowUp.staff_email) == s_email, FollowUp.completed_at.is_not(None))
            .scalar() or 0
        )

        # SLA compliance on assigned leads
        sla_breaches = 0
        if assigned_lead_ids:
            leads = db.query(Lead).filter(Lead.id.in_(assigned_lead_ids), Lead.status == "new").all()
            for l in leads:
                c_dt = _as_utc(l.created_at)
                if c_dt and c_dt < sla_cutoff:
                    has_call = any(c.lead_id == l.id and c.attempted_at for c in calls)
                    if not has_call:
                        sla_breaches += 1

        sla_comp = round(100.0 * (total_assigned - sla_breaches) / total_assigned, 1) if total_assigned > 0 else 100.0

        results.append({
            "staff_email": s_email,
            "staff_name": name,
            "role": su.role if su else "salesperson",
            "total_assigned": total_assigned,
            "calls_attempted": total_attempts,
            "calls_connected": total_connected,
            "connection_rate": conn_rate,
            "follow_ups_completed": completed_fus,
            "avg_duration_minutes": avg_dur,
            "sla_breaches": sla_breaches,
            "sla_compliance_pct": sla_comp,
        })

    # Sort by total calls attempted desc
    results.sort(key=lambda x: x["calls_attempted"], reverse=True)
    return results


# ─── 5. Customer Details & Activity History Timeline ────────────────────────
@router.get("/lead/{lead_id}/details", summary="Full lead details with complete activity history timeline")
def get_lead_details(
    lead_id: int,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    base_q = _get_scope_leads(db, ctx)
    lead = base_q.filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found or access denied.")

    # Assignment
    assignment = (
        db.query(Assignment)
        .filter(Assignment.lead_id == lead.id, Assignment.status == "open")
        .first()
    )
    assignee_name = None
    if assignment:
        su = db.query(StaffUser).filter(func.lower(StaffUser.email) == assignment.staff_email.lower()).first()
        assignee_name = su.name if su else assignment.staff_email

    # Calls
    calls = (
        db.query(CallLog)
        .filter(CallLog.lead_id == lead.id)
        .order_by(desc(CallLog.created_at))
        .all()
    )

    # Follow-ups
    followups = (
        db.query(FollowUp)
        .filter(FollowUp.lead_id == lead.id)
        .order_by(desc(FollowUp.created_at))
        .all()
    )

    # Viewings
    viewings = (
        db.query(Viewing)
        .filter(Viewing.lead_id == lead.id)
        .order_by(desc(Viewing.created_at))
        .all()
    )

    # Activities
    activities = (
        db.query(Activity)
        .filter(Activity.lead_id == lead.id)
        .order_by(desc(Activity.created_at))
        .all()
    )

    # Build chronological timeline
    timeline: List[Dict[str, Any]] = []

    for c in calls:
        t_time = c.attempted_at or c.scheduled_at or c.created_at
        is_conn = c.connected_at is not None or c.status in CONNECTED_OUTCOMES
        timeline.append({
            "type": "call",
            "time": t_time.isoformat() if t_time else None,
            "title": f"Call #{c.attempt_number or 1}: {c.status.replace('_', ' ').title()}",
            "is_connected": is_conn,
            "details": {
                "staff_email": c.staff_email,
                "status": c.status,
                "duration_minutes": c.duration_minutes,
                "notes": c.notes,
                "customer_response": c.customer_response,
                "recommended_action": c.recommended_action,
                "is_first_call": bool(c.is_first_call),
                "attempt_number": c.attempt_number or 1,
            },
        })

    for f in followups:
        timeline.append({
            "type": "follow_up",
            "time": f.created_at.isoformat() if f.created_at else None,
            "title": f"Follow-up: {f.note[:60]}",
            "details": {
                "staff_email": f.staff_email,
                "note": f.note,
                "next_action_at": f.next_action_at.isoformat() if f.next_action_at else None,
                "completed_at": f.completed_at.isoformat() if f.completed_at else None,
                "completed_by": f.completed_by,
            },
        })

    for v in viewings:
        timeline.append({
            "type": "viewing",
            "time": v.scheduled_at.isoformat() if v.scheduled_at else (v.created_at.isoformat() if v.created_at else None),
            "title": f"Property Viewing: {v.property_ref} ({v.status})",
            "details": {
                "staff_email": v.staff_email,
                "property_ref": v.property_ref,
                "status": v.status,
                "feedback": v.feedback,
                "interest_level": v.interest_level,
            },
        })

    for a in activities:
        timeline.append({
            "type": "activity",
            "time": a.created_at.isoformat() if a.created_at else None,
            "title": a.activity_type.replace("_", " ").title(),
            "details": {
                "notes": a.notes,
            },
        })

    # Sort timeline desc by time
    timeline.sort(key=lambda x: x["time"] or "", reverse=True)

    attempt_calls = [c for c in calls if c.attempted_at]
    first_call = next((c for c in calls if c.is_first_call), (attempt_calls[-1] if attempt_calls else None))
    latest_call = attempt_calls[0] if attempt_calls else (calls[0] if calls else None)

    first_call_info = {
        "date": first_call.attempted_at.isoformat() if first_call and first_call.attempted_at else None,
        "status": first_call.status if first_call else None,
        "outcome": first_call.status if first_call else None,
        "notes": first_call.notes if first_call else None,
        "duration_minutes": first_call.duration_minutes if first_call else None,
    } if first_call else None

    latest_call_info = {
        "date": latest_call.attempted_at.isoformat() if latest_call and latest_call.attempted_at else None,
        "status": latest_call.status if latest_call else None,
        "outcome": latest_call.status if latest_call else None,
        "notes": latest_call.notes if latest_call else None,
        "customer_response": latest_call.customer_response if latest_call else None,
        "recommended_action": latest_call.recommended_action if latest_call else None,
        "duration_minutes": latest_call.duration_minutes if latest_call else None,
    } if latest_call else None

    next_rec_action = (
        latest_call.recommended_action
        if latest_call and latest_call.recommended_action
        else ("Call immediately: High buyer intent & budget ready" if lead.lead_score_band == "Hot" else "Schedule consultation to confirm requirements")
    )

    return {
        "lead": {
            "id": lead.id,
            "customer_name": lead.customer_name or "Anonymous",
            "contact_email": lead.contact_email or "",
            "contact_phone": lead.contact_phone or "",
            "location": lead.location or "Dubai",
            "property_type": lead.property_type or "Apartment",
            "property_ref": lead.property_ref or "",
            "budget_min": lead.budget_min,
            "budget_max": lead.budget_max,
            "purpose": lead.purpose or "Buy",
            "amenities": lead.amenities or [],
            "lead_temperature": lead.lead_score_band or "Warm",
            "status": lead.status or "new",
            "lead_source": lead.discovery_source or lead.utm_source or "Website",
            "raw_enquiry_text": lead.raw_enquiry_text,
            "discovery_source": lead.discovery_source,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
            "assigned_to": {
                "email": assignment.staff_email if assignment else None,
                "name": assignee_name,
            } if assignment else None,
        },
        "stats": {
            "total_calls": len([c for c in calls if c.attempted_at]),
            "connected_calls": len([c for c in calls if c.connected_at is not None or c.status in CONNECTED_OUTCOMES]),
            "open_followups": len([f for f in followups if not f.completed_at]),
            "viewings_count": len(viewings),
        },
        "first_call": first_call_info,
        "latest_call": latest_call_info,
        "next_recommended_action": next_rec_action,
        "timeline": timeline,
    }


# ─── 6. CSV Export Endpoint ──────────────────────────────────────────────────
@router.get("/export", summary="Export contact center records to CSV")
def export_contacts_csv(
    tab: str = Query("all"),
    search: Optional[str] = Query(None),
    temperature: Optional[str] = Query(None),
    staff_email: Optional[str] = Query(None),
    sla_breached_only: bool = Query(False),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    contacts_data = list_contacts(
        tab=str(tab or "all"),
        search=search,
        temperature=temperature,
        staff_email=staff_email,
        sla_breached_only=bool(sla_breached_only),
        page=1,
        limit=5000,
        sort_by="newest",
        ctx=ctx,
        db=db,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Lead ID",
        "Customer Name",
        "Email",
        "Phone",
        "Location",
        "Property Type",
        "Purpose",
        "Budget Min",
        "Budget Max",
        "Lead Temperature",
        "Lead Status",
        "Assigned Agent",
        "Total Call Attempts",
        "Connected",
        "Last Call Status",
        "Last Call Time",
        "Last Call Notes",
        "Next Follow-Up",
        "SLA Breached",
        "Created At",
    ])

    for c in contacts_data.get("contacts", []):
        last_c = c.get("last_call") or {}
        assigned = c.get("assigned_to") or {}
        writer.writerow([
            c.get("lead_id"),
            c.get("customer_name"),
            c.get("contact_email"),
            c.get("contact_phone"),
            c.get("location"),
            c.get("property_type"),
            c.get("purpose"),
            c.get("budget_min") or "",
            c.get("budget_max") or "",
            c.get("lead_temperature"),
            c.get("status"),
            f"{assigned.get('name', '')} ({assigned.get('email', '')})",
            c.get("total_call_attempts"),
            "Yes" if c.get("is_connected") else "No",
            last_c.get("status") or "",
            last_c.get("attempted_at") or "",
            last_c.get("notes") or "",
            c.get("next_follow_up_at") or "",
            "YES" if c.get("sla_breached") else "NO",
            c.get("created_at") or "",
        ])

    csv_content = output.getvalue()
    filename = f"lyka_contact_center_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── 7. SLA Threshold Config Endpoints ───────────────────────────────────────
class SlaConfigUpdate(BaseModel):
    threshold_hours: int = Field(..., ge=1, le=168)


@router.get("/sla", summary="Get SLA threshold settings")
def get_sla_config(ctx: Dict[str, Any] = Depends(require_staff)):
    return {"threshold_hours": _SLA_CONFIG["threshold_hours"]}


@router.put("/sla", summary="Update SLA threshold settings (admin only)")
def update_sla_config(
    payload: SlaConfigUpdate,
    ctx: Dict[str, Any] = Depends(require_admin),
):
    _SLA_CONFIG["threshold_hours"] = payload.threshold_hours
    return {"threshold_hours": _SLA_CONFIG["threshold_hours"]}
