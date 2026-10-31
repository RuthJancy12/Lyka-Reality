"""Property advertising analytics API.

Public endpoint
    POST /api/property-analytics/events
        Records only impression/view/whatsapp_click. Deduplicated by the
        service at the database level; system conversion events cannot be
        sent by a client.

Staff endpoints
    GET   /api/property-analytics/overview
    GET   /api/property-analytics/ads
    GET   /api/property-analytics/filters
    PATCH /api/property-analytics/ads/{property_ref}

Every number is an SQL aggregate over real rows. No demo/fallback metrics.
"""
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PropertyAd
from app.schemas import (
    PropertyAdActiveUpdate, PropertyAdEventAck, PropertyAdEventCreate,
    PropertyAdFiltersOut, PropertyAdListOut, PropertyAdsOverviewOut,
)
from app.services import property_analytics
from app.services.audit_service import log_audit
from app.services.roles import require_roles, require_staff

logger = logging.getLogger("lyka.ads.api")
router = APIRouter(prefix="/api/property-analytics", tags=["property-analytics"])

require_ad_manager = require_roles("admin", "manager", "sales_manager")


def _range_or_400(range_key: Optional[str], start: Optional[str], end: Optional[str]) -> Dict[str, Any]:
    try:
        return property_analytics.resolve_date_range(range_key, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _range_payload(resolved: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "key": resolved["key"],
        "start": resolved["start"],
        "end": resolved["end"],
    }


# ─── Public tracking ─────────────────────────────────────────────────────────

@router.post("/events", response_model=PropertyAdEventAck, status_code=202,
             summary="Record a public property interaction (no auth)")
def record_public_event(
    payload: PropertyAdEventCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Record one impression/view/WhatsApp click for a real, active listing.

    `visitor_id` is a random browser value. It is hashed with a server salt
    before storage — no raw id, IP, email or phone is persisted. When a client
    omits visitor_id we fall back to a salted hash of IP + user agent so
    uniqueness still works for ordinary browsers.
    """
    ref = payload.property_ref.strip()
    ad = (
        db.query(PropertyAd)
        .filter(PropertyAd.property_ref == ref, PropertyAd.is_active == True)  # noqa: E712
        .first()
    )
    if not ad:
        # Unknown/inactive listing: acknowledge without error so clients do
        # not retry the same event in a loop.
        return PropertyAdEventAck(counted=False, duplicate=True)

    fallback_raw = None
    if not payload.visitor_id:
        ip = request.client.host if request.client else "unknown"
        ua = request.headers.get("user-agent", "")[:300]
        fallback_raw = f"{ip}:{ua}"

    counted = property_analytics.record_event(
        db, ref, payload.event_type,
        visitor_id=payload.visitor_id,
        visitor_sha=property_analytics.visitor_hash(payload.visitor_id, fallback_raw),
        context=(payload.context or "public")[:40],
    )
    return PropertyAdEventAck(counted=counted, duplicate=not counted)


# ─── Staff analytics ─────────────────────────────────────────────────────────

@router.get("/overview", response_model=PropertyAdsOverviewOut,
            summary="Advertising KPI overview for a date range")
def ads_overview(
    range_key: Optional[str] = Query("month", alias="range"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    resolved = _range_or_400(range_key, start, end)
    data = property_analytics.overview(db, resolved["start"], resolved["end"])
    data["range"] = _range_payload(resolved)
    return data


@router.get("/ads", response_model=PropertyAdListOut,
            summary="Paginated/filterable advertisement table with range metrics")
def list_ads(
    range_key: Optional[str] = Query("month", alias="range"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=120),
    location: Optional[str] = Query(None, max_length=100),
    project: Optional[str] = Query(None, max_length=120),
    property_type: Optional[str] = Query(None, max_length=50),
    listing_type: Optional[str] = Query(None, max_length=10),
    availability: Optional[str] = Query(None, max_length=50),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    is_active: Optional[bool] = Query(None),
    sort: str = Query("newest", pattern="^(newest|oldest|price_asc|price_desc|title_asc|views_desc|enquiries_desc)$"),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    resolved = _range_or_400(range_key, start, end)
    if min_price is not None and max_price is not None and max_price < min_price:
        raise HTTPException(status_code=400, detail="max_price must be greater than or equal to min_price.")
    data = property_analytics.list_ads(
        db,
        start=resolved["start"], end=resolved["end"],
        page=page, per_page=per_page, search=search,
        location=location, project=project, property_type=property_type,
        listing_type=listing_type, availability=availability,
        min_price=min_price, max_price=max_price, active=is_active, sort=sort,
    )
    data["range"] = _range_payload(resolved)
    return data


@router.get("/filters", response_model=PropertyAdFiltersOut,
            summary="Distinct real filter values")
def ad_filters(
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    return property_analytics.filter_options(db)


@router.patch("/ads/{property_ref}", summary="Pause or resume an advertisement (admin/manager)")
def set_ad_active(
    property_ref: str,
    payload: PropertyAdActiveUpdate,
    ctx: Dict[str, Any] = Depends(require_ad_manager),
    db: Session = Depends(get_db),
):
    row = property_analytics.set_ad_active(db, property_ref.strip(), payload.is_active)
    if not row:
        raise HTTPException(status_code=404, detail="Property advertisement not found.")
    log_audit(
        db, ctx,
        "ad_resumed" if row.is_active else "ad_paused",
        "property_ad", row.property_ref,
        details={"property_ref": row.property_ref, "is_active": row.is_active},
    )
    return {"property_ref": row.property_ref, "is_active": row.is_active}
