"""
Deals, Commission Management & Sales Leaderboard API.

Manages property transactions, commission splits, and performance rankings.
Scoped by role:
- Salespeople see their own deals and leaderboard.
- Sales Managers see team deals and coaching performance.
- Admin & Managers manage all deals, approve commissions, and view revenue.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Deal, CommissionRecord, Lead, StaffUser, CallLog, Viewing
from app.schemas import (
    DealCreate, DealOut, DealUpdate,
    CommissionRecordOut, LeaderboardEntryOut,
)
from app.services.audit_service import log_audit
from app.services.roles import (
    require_staff, require_roles, team_scope_emails,
)

logger = logging.getLogger("lyka.deals")
router = APIRouter(prefix="/api/staff", tags=["deals"])

require_deal_admin = require_roles("admin", "manager")


def _utcnow():
    return datetime.now(timezone.utc)


@router.get("/deals", response_model=List[DealOut], summary="List deals (scoped)")
def list_deals(
    stage: Optional[str] = Query(None),
    salesperson: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    role = ctx["role"]
    q = db.query(Deal)

    if role == "salesperson":
        q = q.filter(func.lower(Deal.salesperson_email) == (ctx.get("email") or "").lower())
    elif role == "sales_manager":
        team = team_scope_emails(db, ctx)
        if team is not None:
            lowered = [e.lower() for e in team]
            q = q.filter(func.lower(Deal.salesperson_email).in_(lowered))
    elif salesperson:
        q = q.filter(func.lower(Deal.salesperson_email) == salesperson.strip().lower())

    if stage:
        q = q.filter(Deal.deal_stage == stage)

    return q.order_by(Deal.created_at.desc()).all()


@router.post("/deals", response_model=DealOut, status_code=201, summary="Create a new deal")
def create_deal(
    payload: DealCreate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    role = ctx["role"]
    sales_email = payload.salesperson_email.strip() if payload.salesperson_email else ctx["email"]

    if role == "salesperson" and sales_email.lower() != ctx["email"].lower():
        raise HTTPException(status_code=403, detail="Salespeople can only create deals assigned to themselves.")

    comm_rate = payload.commission_rate_pct if payload.commission_rate_pct is not None else 2.0
    comm_amount = round(payload.deal_value_aed * (comm_rate / 100.0), 2)

    deal = Deal(
        lead_id=payload.lead_id,
        property_ref=payload.property_ref,
        salesperson_email=sales_email,
        customer_name=payload.customer_name.strip(),
        customer_email=payload.customer_email.strip() if payload.customer_email else None,
        deal_value_aed=payload.deal_value_aed,
        commission_rate_pct=comm_rate,
        commission_amount_aed=comm_amount,
        deal_stage=payload.deal_stage,
        expected_close_date=payload.expected_close_date,
        notes=payload.notes,
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(deal)
    db.flush()

    # Automatically create a commission record for the salesperson
    comm_record = CommissionRecord(
        deal_id=deal.id,
        staff_email=sales_email,
        role="salesperson",
        amount_aed=comm_amount,
        status="pending",
        created_at=_utcnow(),
    )
    db.add(comm_record)

    # If deal is created as closed_won, update corresponding lead
    if deal.deal_stage == "closed_won" and deal.lead_id:
        lead = db.query(Lead).filter(Lead.id == deal.lead_id).first()
        if lead and lead.status != "closed":
            lead.status = "closed"
            lead.updated_at = _utcnow()

    db.commit()
    db.refresh(deal)

    log_audit(
        db, ctx, "deal_created", "deal", str(deal.id),
        details={"deal_id": deal.id, "customer": deal.customer_name, "value_aed": deal.deal_value_aed},
    )
    return deal


@router.patch("/deals/{deal_id:int}", response_model=DealOut, summary="Update deal stage / details")
def update_deal(
    deal_id: int,
    payload: DealUpdate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found.")

    role = ctx["role"]
    if role == "salesperson" and deal.salesperson_email.lower() != ctx["email"].lower():
        raise HTTPException(status_code=403, detail="Cannot edit deals assigned to another salesperson.")

    if payload.deal_stage:
        deal.deal_stage = payload.deal_stage
        if payload.deal_stage == "closed_won":
            deal.actual_close_date = _utcnow()
            if deal.lead_id:
                lead = db.query(Lead).filter(Lead.id == deal.lead_id).first()
                if lead and lead.status != "closed":
                    lead.status = "closed"
                    lead.updated_at = _utcnow()

    if payload.deal_value_aed is not None:
        deal.deal_value_aed = payload.deal_value_aed
        deal.commission_amount_aed = round(deal.deal_value_aed * (deal.commission_rate_pct / 100.0), 2)
        # Update pending commission records
        for comm in deal.commissions:
            if comm.status == "pending" and comm.role == "salesperson":
                comm.amount_aed = deal.commission_amount_aed

    if payload.commission_rate_pct is not None:
        deal.commission_rate_pct = payload.commission_rate_pct
        deal.commission_amount_aed = round(deal.deal_value_aed * (deal.commission_rate_pct / 100.0), 2)

    if payload.expected_close_date is not None:
        deal.expected_close_date = payload.expected_close_date
    if payload.actual_close_date is not None:
        deal.actual_close_date = payload.actual_close_date
    if payload.notes is not None:
        deal.notes = payload.notes

    deal.updated_at = _utcnow()
    db.commit()
    db.refresh(deal)

    log_audit(
        db, ctx, "deal_updated", "deal", str(deal.id),
        details={"deal_id": deal.id, "stage": deal.deal_stage, "value_aed": deal.deal_value_aed},
    )
    return deal


@router.get("/deals/leaderboard", response_model=List[LeaderboardEntryOut], summary="Sales agent leaderboard")
def get_leaderboard(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    staff_members = db.query(StaffUser).filter(StaffUser.is_active == True).all()  # noqa: E712
    staff_dict = {s.email.lower(): s.name for s in staff_members}

    # Aggregate closed_won deals
    won_deals = (
        db.query(
            Deal.salesperson_email,
            func.count(Deal.id).label("deals_count"),
            func.sum(Deal.deal_value_aed).label("total_sales"),
            func.sum(Deal.commission_amount_aed).label("total_comm"),
        )
        .filter(Deal.deal_stage == "closed_won")
        .group_by(Deal.salesperson_email)
        .all()
    )
    deal_map = {r[0].lower(): (r[1], float(r[2] or 0), float(r[3] or 0)) for r in won_deals if r and r[0]}

    # Aggregate connected calls
    calls = (
        db.query(
            CallLog.staff_email,
            func.count(CallLog.id).label("calls_connected"),
        )
        .filter(CallLog.connected_at.isnot(None))
        .group_by(CallLog.staff_email)
        .all()
    )
    call_map = {r[0].lower(): r[1] for r in calls if r and r[0]}

    # Aggregate completed viewings
    viewings = (
        db.query(
            Viewing.staff_email,
            func.count(Viewing.id).label("viewings_completed"),
        )
        .filter(Viewing.status == "completed")
        .group_by(Viewing.staff_email)
        .all()
    )
    viewing_map = {r[0].lower(): r[1] for r in viewings if r and r[0]}

    all_emails = set(staff_dict.keys()) | set(deal_map.keys())
    entries = []
    for email in all_emails:
        d_count, sales_val, comm_val = deal_map.get(email, (0, 0.0, 0.0))
        c_conn = call_map.get(email, 0)
        v_comp = viewing_map.get(email, 0)
        entries.append({
            "staff_email": email,
            "staff_name": staff_dict.get(email, email.split("@")[0]),
            "deals_count": d_count,
            "total_sales_aed": sales_val,
            "total_commission_aed": comm_val,
            "calls_connected": c_conn,
            "viewings_completed": v_comp,
        })

    # Sort primarily by total_sales_aed desc, then deals_count desc
    entries.sort(key=lambda x: (x["total_sales_aed"], x["deals_count"], x["calls_connected"]), reverse=True)

    for rank, e in enumerate(entries, start=1):
        e["rank"] = rank

    return entries


@router.patch("/commissions/{commission_id:int}/status", response_model=CommissionRecordOut, summary="Approve/pay commission (admin/manager)")
def update_commission_status(
    commission_id: int,
    status: str = Query(..., pattern="^(pending|approved|paid)$"),
    ctx: Dict[str, Any] = Depends(require_deal_admin),
    db: Session = Depends(get_db),
):
    comm = db.query(CommissionRecord).filter(CommissionRecord.id == commission_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="Commission record not found.")

    comm.status = status
    if status == "approved":
        comm.approved_by = ctx["email"]
    elif status == "paid":
        comm.paid_at = _utcnow()
        if not comm.approved_by:
            comm.approved_by = ctx["email"]

    db.commit()
    db.refresh(comm)

    log_audit(
        db, ctx, "commission_status_updated", "commission_record", str(comm.id),
        details={"deal_id": comm.deal_id, "status": comm.status, "amount_aed": comm.amount_aed},
    )
    return comm
