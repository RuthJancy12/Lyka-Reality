"""
Customer support ticket management for customers and staff.

Customers submit and track tickets in their portal.
Staff (Support/Admin) manage, assign, prioritize, and resolve tickets.
Every ticket persists in the database with an immutable conversation thread.
"""
import logging
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SupportTicket, TicketMessage, StaffUser
from app.schemas import (
    SupportTicketCreate, SupportTicketOut, SupportTicketUpdate,
    TicketMessageCreate, TicketMessageOut,
)
from app.services.audit_service import log_audit
from app.services import notification_service
from app.services.roles import require_staff, verify_bearer_token, resolve_role

logger = logging.getLogger("lyka.support")
router = APIRouter(tags=["support"])


def _utcnow():
    return datetime.now(timezone.utc)


def _generate_ticket_number() -> str:
    now_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    rand_part = random.randint(1000, 9999)
    return f"TKT-{now_str}-{rand_part}"


def _require_customer(
    authorization: Optional[str] = Depends(lambda: None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    from fastapi import Header
    pass


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    claims = verify_bearer_token(authorization)
    if not claims or not claims.get("email"):
        raise HTTPException(status_code=401, detail="Authentication required.")
    role, email, uid = resolve_role(db, claims)
    return {"role": role, "email": email, "uid": uid}


# ─── Customer Endpoints ─────────────────────────────────────────────────────

@router.post("/api/customer/tickets", response_model=SupportTicketOut, status_code=201, summary="Submit a customer support ticket")
def create_customer_ticket(
    payload: SupportTicketCreate,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(get_current_user),
):
    customer_email = ctx["email"]
    ticket_num = _generate_ticket_number()
    # Check uniqueness
    while db.query(SupportTicket).filter(SupportTicket.ticket_number == ticket_num).first():
        ticket_num = _generate_ticket_number()

    ticket = SupportTicket(
        ticket_number=ticket_num,
        customer_email=customer_email,
        customer_name=payload.customer_name or customer_email.split("@")[0],
        subject=payload.subject.strip(),
        category=payload.category,
        status="open",
        priority="medium",
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(ticket)
    db.flush()

    first_msg = TicketMessage(
        ticket_id=ticket.id,
        sender_type="customer",
        sender_email=customer_email,
        sender_name=payload.customer_name or customer_email.split("@")[0],
        message=payload.message.strip(),
        created_at=_utcnow(),
    )
    db.add(first_msg)
    db.commit()
    db.refresh(ticket)

    try:
        notification_service.create_notification(
            db=db,
            recipient_email=customer_email,
            recipient_role="customer",
            title=f"Support Ticket #{ticket.ticket_number} Created",
            message=f"Your ticket '{ticket.subject}' has been submitted. Our support team will assist you.",
            category="system",
            notification_type="ticket_created",
            related_entity_type="ticket",
            related_entity_id=ticket.id,
            action_url="/support",
        )
        notification_service.notify_admins(
            db=db,
            title=f"New Support Ticket #{ticket.ticket_number}",
            message=f"New ticket from {customer_email}: '{ticket.subject}' ({ticket.category}).",
            category="system",
            notification_type="ticket_created",
            related_entity_type="ticket",
            related_entity_id=ticket.id,
            action_url="/staff/support",
        )
    except Exception as exc:
        logger.warning("Failed to dispatch ticket notification: %s", exc)

    return ticket


@router.get("/api/customer/tickets", response_model=List[SupportTicketOut], summary="List own customer tickets")
def list_customer_tickets(
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(get_current_user),
):
    customer_email = ctx["email"]
    return (
        db.query(SupportTicket)
        .filter(func.lower(SupportTicket.customer_email) == customer_email.lower())
        .order_by(SupportTicket.created_at.desc())
        .all()
    )


@router.get("/api/customer/tickets/{ticket_id:int}", response_model=SupportTicketOut, summary="Get own customer ticket details")
def get_customer_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(get_current_user),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket or ticket.customer_email != ctx["email"]:
        raise HTTPException(status_code=404, detail="Support ticket not found.")
    return ticket


@router.post("/api/customer/tickets/{ticket_id:int}/messages", response_model=TicketMessageOut, status_code=201, summary="Reply to own customer ticket")
def reply_customer_ticket(
    ticket_id: int,
    payload: TicketMessageCreate,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(get_current_user),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket or ticket.customer_email != ctx["email"]:
        raise HTTPException(status_code=404, detail="Support ticket not found.")

    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_type="customer",
        sender_email=ctx["email"],
        sender_name=ticket.customer_name or ctx["email"].split("@")[0],
        message=payload.message.strip(),
        created_at=_utcnow(),
    )
    db.add(msg)
    ticket.updated_at = _utcnow()
    if ticket.status == "resolved":
        ticket.status = "in_progress"
    db.commit()
    db.refresh(msg)

    try:
        notification_service.create_notification(
            db=db,
            recipient_email=ticket.customer_email,
            recipient_role="customer",
            title=f"Update on Support Ticket #{ticket.ticket_number}",
            message=f"Support staff responded to your ticket '{ticket.subject}'.",
            category="system",
            notification_type="ticket_reply",
            related_entity_type="ticket",
            related_entity_id=ticket.id,
            action_url="/support",
        )
    except Exception as exc:
        logger.warning("Failed to notify customer on ticket reply: %s", exc)

    return msg


# ─── Staff / Admin Endpoints ────────────────────────────────────────────────

@router.get("/api/staff/tickets", response_model=List[SupportTicketOut], summary="List support tickets (staff)")
def list_staff_tickets(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    q = db.query(SupportTicket)
    if status:
        q = q.filter(SupportTicket.status == status)
    if priority:
        q = q.filter(SupportTicket.priority == priority)
    if category:
        q = q.filter(SupportTicket.category == category)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (SupportTicket.subject.ilike(s))
            | (SupportTicket.customer_email.ilike(s))
            | (SupportTicket.ticket_number.ilike(s))
        )
    return q.order_by(SupportTicket.created_at.desc()).all()


@router.get("/api/staff/tickets/{ticket_id:int}", response_model=SupportTicketOut, summary="Get support ticket details (staff)")
def get_staff_ticket(
    ticket_id: int,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")
    return ticket


@router.patch("/api/staff/tickets/{ticket_id:int}", response_model=SupportTicketOut, summary="Update ticket status / priority / assignee")
def update_staff_ticket(
    ticket_id: int,
    payload: SupportTicketUpdate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")

    old_status = ticket.status
    if payload.status:
        ticket.status = payload.status
        if payload.status == "resolved" and old_status != "resolved":
            ticket.resolved_at = _utcnow()
    if payload.priority:
        ticket.priority = payload.priority
    if payload.assigned_staff_email is not None:
        ticket.assigned_staff_email = payload.assigned_staff_email.strip() or None

    ticket.updated_at = _utcnow()
    db.commit()
    db.refresh(ticket)

    log_audit(
        db, ctx, "ticket_updated", "support_ticket", str(ticket.id),
        details={"ticket_number": ticket.ticket_number, "status": ticket.status, "priority": ticket.priority},
    )
    return ticket


@router.post("/api/staff/tickets/{ticket_id:int}/messages", response_model=TicketMessageOut, status_code=201, summary="Staff reply to ticket")
def reply_staff_ticket(
    ticket_id: int,
    payload: TicketMessageCreate,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")

    staff_email = ctx["email"]
    staff_user = db.query(StaffUser).filter(StaffUser.email == staff_email).first()
    sender_name = staff_user.name if staff_user else staff_email.split("@")[0]

    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_type="staff",
        sender_email=staff_email,
        sender_name=sender_name,
        message=payload.message.strip(),
        created_at=_utcnow(),
    )
    db.add(msg)
    ticket.updated_at = _utcnow()
    if ticket.status == "open":
        ticket.status = "in_progress"
    db.commit()
    db.refresh(msg)

    log_audit(
        db, ctx, "ticket_reply_sent", "support_ticket", str(ticket.id),
        details={"ticket_number": ticket.ticket_number, "message_id": msg.id},
    )
    return msg
