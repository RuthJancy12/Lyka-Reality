"""
In-app notifications & customer saved searches / property alerts API.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Notification, CustomerSavedSearch, PropertyAlert
from app.schemas import (
    NotificationOut, CustomerSavedSearchCreate, CustomerSavedSearchOut,
    PropertyAlertCreate, PropertyAlertOut, NotificationPreferenceOut,
    NotificationPreferenceUpdate,
)
from app.services.roles import verify_bearer_token, resolve_role
from app.services import notification_service

logger = logging.getLogger("lyka.notifications")
router = APIRouter(tags=["notifications"])


def _utcnow():
    return datetime.now(timezone.utc)


def _get_current_identity(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    claims = verify_bearer_token(authorization)
    if not claims or not claims.get("email"):
        raise HTTPException(status_code=401, detail="Authentication required.")
    role, email, uid = resolve_role(db, claims)
    return {"role": role, "email": email, "uid": uid}


# ─── Notifications ──────────────────────────────────────────────────────────

@router.get("/api/notifications", response_model=List[NotificationOut], summary="List in-app notifications")
def get_notifications(
    unread_only: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    """
    List notifications strictly isolated to the caller.
    Supports unread_only filtering and limit.
    """
    return notification_service.get_user_notifications(
        db=db,
        email=ctx["email"],
        role=ctx["role"],
        uid=ctx.get("uid"),
        unread_only=unread_only,
        limit=min(limit, 100),
    )


@router.get("/api/notifications/unread-count", summary="Get unread notification count")
def get_unread_count(
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    """
    Lightweight endpoint for polling bell badge count.
    """
    count = notification_service.get_unread_count(
        db=db,
        email=ctx["email"],
        role=ctx["role"],
        uid=ctx.get("uid"),
    )
    return {"unread_count": count}


@router.patch("/api/notifications/{notification_id:int}/read", response_model=NotificationOut, summary="Mark notification as read")
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found.")

    updated = notification_service.mark_notification_read(
        db=db,
        notification_id=notification_id,
        email=ctx["email"],
        role=ctx["role"],
        uid=ctx.get("uid"),
    )
    if not updated:
        raise HTTPException(status_code=403, detail="Unauthorized to mark this notification.")

    return updated


@router.post("/api/notifications/read-all", summary="Mark all notifications as read")
def mark_all_read(
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    count = notification_service.mark_all_read(
        db=db,
        email=ctx["email"],
        role=ctx["role"],
        uid=ctx.get("uid"),
    )
    return {"message": "All notifications marked as read.", "count": count}


@router.get("/api/notifications/preferences", response_model=NotificationPreferenceOut, summary="Get notification preferences")
def get_preferences(
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    return notification_service.get_or_create_preferences(
        db=db,
        email=ctx["email"],
        role=ctx["role"],
    )


@router.put("/api/notifications/preferences", response_model=NotificationPreferenceOut, summary="Update notification preferences")
def update_preferences(
    payload: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    return notification_service.update_preferences(
        db=db,
        email=ctx["email"],
        updates=payload.model_dump(exclude_unset=True),
    )


# ─── Saved Searches ─────────────────────────────────────────────────────────

@router.post("/api/customer/saved-searches", response_model=CustomerSavedSearchOut, status_code=201, summary="Save customer property search")
def save_search(
    payload: CustomerSavedSearchCreate,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    row = CustomerSavedSearch(
        customer_email=ctx["email"],
        title=payload.title.strip(),
        search_criteria=payload.search_criteria,
        created_at=_utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/api/customer/saved-searches", response_model=List[CustomerSavedSearchOut], summary="List saved searches")
def list_saved_searches(
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    return (
        db.query(CustomerSavedSearch)
        .filter(CustomerSavedSearch.customer_email == ctx["email"])
        .order_by(CustomerSavedSearch.created_at.desc())
        .all()
    )


@router.delete("/api/customer/saved-searches/{search_id:int}", summary="Delete saved search")
def delete_saved_search(
    search_id: int,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    row = (
        db.query(CustomerSavedSearch)
        .filter(CustomerSavedSearch.id == search_id, CustomerSavedSearch.customer_email == ctx["email"])
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Saved search not found.")
    db.delete(row)
    db.commit()
    return {"message": "Saved search deleted."}


# ─── Property Alerts ────────────────────────────────────────────────────────

@router.post("/api/customer/property-alerts", response_model=PropertyAlertOut, status_code=201, summary="Create property alert")
def create_property_alert(
    payload: PropertyAlertCreate,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    row = PropertyAlert(
        customer_email=ctx["email"],
        alert_type=payload.alert_type,
        criteria=payload.criteria,
        frequency=payload.frequency,
        is_active=True,
        created_at=_utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/api/customer/property-alerts", response_model=List[PropertyAlertOut], summary="List property alerts")
def list_property_alerts(
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    return (
        db.query(PropertyAlert)
        .filter(PropertyAlert.customer_email == ctx["email"])
        .order_by(PropertyAlert.created_at.desc())
        .all()
    )


@router.delete("/api/customer/property-alerts/{alert_id:int}", summary="Delete property alert")
def delete_property_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    ctx: Dict[str, Any] = Depends(_get_current_identity),
):
    row = (
        db.query(PropertyAlert)
        .filter(PropertyAlert.id == alert_id, PropertyAlert.customer_email == ctx["email"])
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Property alert not found.")
    db.delete(row)
    db.commit()
    return {"message": "Property alert deleted."}
