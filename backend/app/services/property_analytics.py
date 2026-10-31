"""Property advertising analytics: real, deduplicated, database-backed.

Design notes
------------
* `property_ads` mirrors existing listings by their existing id (CSV LYK-* or
  CRM ref_code). Nothing here creates or renumbers a property.
* `property_ad_events` stores one row per real interaction. Public tracking
  only writes impression/view/whatsapp_click; enquiry/site-visit/booking rows
  are written by the backend flow that owns the Lead/Viewing row, which keeps
  clicks, enquiries, and successful bookings distinct.
* `dedupe_key` is UNIQUE. Repeated renders/short double-clicks are ignored at
  the database level rather than counted twice.
* Dashboard numbers are SQL aggregates over the requested UTC date range.
  Empty data yields 0 (and `None` for rates), never demo/fallback values.
"""
from __future__ import annotations

import csv
import hashlib
import logging
import math
import os
import re
import time
from datetime import date, datetime, time as dtime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import CRMProperty, Lead, PropertyAd, PropertyAdEvent, Viewing, utcnow

logger = logging.getLogger("lyka.ads")

PUBLIC_EVENT_TYPES = ("impression", "view", "whatsapp_click")
SYSTEM_EVENT_TYPES = ("enquiry", "site_visit_scheduled", "booking")
ALL_EVENT_TYPES = PUBLIC_EVENT_TYPES + SYSTEM_EVENT_TYPES

# Optional salt for the anonymous visitor hash. The visitor id is a random
# browser value, never PII; the salt prevents trivial cross-instance lookups.
_ANALYTICS_SALT = os.getenv("ANALYTICS_HASH_SALT", "lyka-advertising-v1")

_REF_RE = re.compile(r"\b(?:LYK-\d{3,}|CRM-[A-Z0-9-]{2,})\b", re.IGNORECASE)


# ─── Date ranges ─────────────────────────────────────────────────────────────

def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _day_start(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _parse_custom_date(value: Optional[str], *, end: bool) -> datetime:
    if not value:
        raise ValueError("Custom range requires both start and end dates.")
    raw = value.strip()
    try:
        if len(raw) == 10:  # YYYY-MM-DD
            d = date.fromisoformat(raw)
            dt = datetime.combine(d, dtime.min, tzinfo=timezone.utc)
            return dt + timedelta(days=1) if end else dt
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError as exc:
        raise ValueError("Dates must be ISO dates (YYYY-MM-DD) or datetimes.") from exc


def resolve_date_range(
    range_key: Optional[str] = "month",
    start: Optional[str] = None,
    end: Optional[str] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Return an inclusive-start/exclusive-end UTC range.

    today | week | month | custom. "week" starts Monday (UAE business week
    commonly starts Monday; the UI labels it explicitly).
    """
    now = _as_utc(now) or utcnow()
    today = _day_start(now)
    key = (range_key or "month").strip().lower()
    if key == "today":
        start_dt, end_dt = today, today + timedelta(days=1)
    elif key == "week":
        start_dt = today - timedelta(days=today.weekday())
        end_dt = start_dt + timedelta(days=7)
    elif key == "month":
        start_dt = today.replace(day=1)
        end_dt = (start_dt.replace(year=start_dt.year + 1, month=1)
                  if start_dt.month == 12 else start_dt.replace(month=start_dt.month + 1))
    elif key == "custom":
        start_dt = _parse_custom_date(start, end=False)
        end_dt = _parse_custom_date(end, end=True)
        if end_dt <= start_dt:
            raise ValueError("Custom range end must be after start.")
    else:
        raise ValueError("range must be one of: today, week, month, custom.")
    return {"key": key, "start": start_dt, "end": end_dt}


def current_month_bounds(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    now = _as_utc(now) or utcnow()
    start = _day_start(now).replace(day=1)
    end = (start.replace(year=start.year + 1, month=1)
           if start.month == 12 else start.replace(month=start.month + 1))
    return start, end


# ─── Visitor hashing & event recording ───────────────────────────────────────

def visitor_hash(visitor_id: Optional[str], fallback: Optional[str] = None) -> Optional[str]:
    raw = (visitor_id or "").strip() or (fallback or "").strip()
    if not raw:
        return None
    return hashlib.sha256(f"{_ANALYTICS_SALT}:{raw}".encode("utf-8")).hexdigest()


def _event_dedupe(event_type: str, ref: str, vhash: Optional[str], when: datetime) -> str:
    ref_key = ref.strip().lower()
    if event_type == "view":
        bucket = when.strftime("%Y-%m-%d-%H")
    elif event_type == "impression":
        bucket = when.strftime("%Y-%m-%d")
    elif event_type == "whatsapp_click":
        bucket = when.strftime("%Y-%m-%d-%H-%M")
    else:
        bucket = ""
    who = vhash or "anon"
    return f"{event_type}:{ref_key}:{who}:{bucket}"


def record_event(
    db: Session,
    property_ref: str,
    event_type: str,
    *,
    occurred_at: Optional[datetime] = None,
    visitor_id: Optional[str] = None,
    visitor_sha: Optional[str] = None,
    context: Optional[str] = None,
    lead_id: Optional[int] = None,
    viewing_id: Optional[int] = None,
    dedupe_key: Optional[str] = None,
    commit: bool = True,
) -> bool:
    """Insert one event; return False when the idempotency key already exists.

    Callers must pass a property_ref that was already validated against the
    real ad registry. Unique-key races are handled by the DB constraint.
    """
    ref = (property_ref or "").strip()
    if not ref or event_type not in ALL_EVENT_TYPES:
        return False
    when = _as_utc(occurred_at) or utcnow()
    vhash = visitor_sha or visitor_hash(visitor_id)
    key = (dedupe_key or _event_dedupe(event_type, ref, vhash, when))[:160]
    existing = db.query(PropertyAdEvent.id).filter(PropertyAdEvent.dedupe_key == key).first()
    if existing:
        return False
    row = PropertyAdEvent(
        property_ref=ref,
        event_type=event_type,
        visitor_hash=vhash,
        occurred_at=when,
        lead_id=lead_id,
        viewing_id=viewing_id,
        dedupe_key=key,
        context=context,
    )
    db.add(row)
    if commit:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return False
    return True


def ad_exists(db: Session, property_ref: str) -> bool:
    ref = (property_ref or "").strip()
    if not ref:
        return False
    return db.query(PropertyAd.id).filter(PropertyAd.property_ref == ref).first() is not None


# ─── Ad registry mirroring (existing ids only) ──────────────────────────────

def _int_or_none(value: Any) -> Optional[int]:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _csv_rows():
    from app.services.property_service import CSV_PATH
    if not os.path.exists(CSV_PATH):
        logger.warning("Property CSV not found at %s; ad registry will only mirror CRM rows.", CSV_PATH)
        return
    with open(CSV_PATH, mode="r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            ref = (row.get("property_id") or "").strip()
            if ref:
                yield row


def seed_property_ads(db: Session, *, force: bool = False) -> Dict[str, int]:
    """Idempotently mirror the real catalogue + CRM inventory into property_ads.

    Existing refs are left untouched (published_at stays stable across
    restarts). New refs are inserted only. `force` refreshes descriptive
    fields from the source without changing ids or published_at.
    """
    t0 = time.perf_counter()
    existing = {row[0]: row[1] for row in db.query(PropertyAd.property_ref, PropertyAd.id).all()}
    if not force and len(existing) >= 3000:
        return {"inserted": 0, "updated": 0, "skipped": len(existing)}
    inserted = updated = 0
    now = utcnow()

    rows_to_add: List[PropertyAd] = []
    for row in _csv_rows():
        ref = (row.get("property_id") or "").strip()
        if not ref:
            continue
        try:
            listed_days = max(0, int(float(row.get("listed_days_ago") or 0)))
        except (TypeError, ValueError):
            listed_days = 0
        published = now - timedelta(days=listed_days)
        values = dict(
            source="dataset",
            title=(row.get("title") or "Dubai Property")[:255],
            location=(row.get("location") or "Dubai")[:100],
            project=(row.get("location") or "").strip()[:120] or None,
            property_type=(row.get("property_type") or "Apartment")[:50],
            listing_type=(row.get("listing_type") or "Sale")[:10],
            bedrooms=_int_or_none(row.get("bhk")),
            bathrooms=_int_or_none(row.get("bathrooms")),
            size_sqft=_int_or_none(row.get("property_size_sqft")),
            price_aed=float(_int_or_none(row.get("price_aed")) or 0),
            availability=(row.get("availability") or None),
            image_url=(row.get("image_url") or None),
            is_active=True,
            published_at=published,
        )
        if ref not in existing:
            rows_to_add.append(PropertyAd(property_ref=ref, **values))
            inserted += 1
        elif force:
            db.query(PropertyAd).filter(PropertyAd.property_ref == ref).update(values)
            updated += 1

    if rows_to_add:
        db.add_all(rows_to_add)

    # CRM inventory is already persistent and keeps its own ids/timestamps.
    for prop in db.query(CRMProperty).all():
        _sync_crm_ad_row(db, prop)
        if prop.ref_code not in existing:
            inserted += 1
        elif force:
            updated += 1

    db.commit()
    refresh_inactive_ads_cache(db)
    _FILTER_CACHE["at"] = 0.0
    logger.info(
        "Property ad registry seeded in %.1f ms (inserted=%d updated=%d total=%d)",
        (time.perf_counter() - t0) * 1000, inserted, updated,
        db.query(func.count(PropertyAd.id)).scalar() or 0,
    )
    return {"inserted": inserted, "updated": updated}


def _sync_crm_ad_row(db: Session, prop: CRMProperty) -> None:
    """Mirror one existing CRM property into property_ads (same ref_code)."""
    ref = (prop.ref_code or "").strip()
    if not ref:
        return
    price = prop.price_sale if prop.listing_type == "Sale" else prop.price_rent_monthly
    values = dict(
        source="crm",
        title=(prop.title or "CRM Property")[:255],
        location=(prop.location or "Dubai")[:100],
        project=(prop.community or prop.location or "").strip()[:120] or None,
        property_type=(prop.property_type or "Apartment")[:50],
        listing_type=(prop.listing_type or "Sale")[:10],
        bedrooms=prop.bedrooms,
        bathrooms=prop.bathrooms,
        size_sqft=prop.size_sqft,
        price_aed=float(price or 0),
        availability="Available" if prop.is_available else "Booked",
        image_url=prop.image_url,
    )
    ad = db.query(PropertyAd).filter(PropertyAd.property_ref == ref).first()
    if ad is None:
        ad = PropertyAd(
            property_ref=ref, published_at=_as_utc(prop.created_at) or utcnow(),
            is_active=bool(prop.is_available), **values,
        )
        db.add(ad)
    else:
        for key, value in values.items():
            setattr(ad, key, value)
        # Preserve an explicit ad pause/resume across inventory syncs.
    _FILTER_CACHE["at"] = 0.0


def sync_crm_ad(db: Session, prop: CRMProperty, *, commit: bool = True) -> None:
    """Public helper used by the property CRUD router after create/update."""
    _sync_crm_ad_row(db, prop)
    if commit:
        db.commit()
    refresh_inactive_ads_cache(db)
    _FILTER_CACHE["at"] = 0.0


def refresh_inactive_ads_cache(db: Session) -> None:
    """Keep the public catalogue's paused-ad filter in sync (best effort)."""
    try:
        from app.services import property_service
        refs = [
            row[0] for row in
            db.query(PropertyAd.property_ref).filter(PropertyAd.is_active == False).all()  # noqa: E712
        ]
        property_service.set_inactive_ad_refs(refs)
    except Exception:
        logger.exception("Could not refresh paused-ad cache (public catalogue unchanged).")


# ─── Backfill from existing persistent records ─────────────────────────────

def infer_property_ref(text: Optional[str]) -> Optional[str]:
    match = _REF_RE.search(text or "")
    return match.group(0).upper() if match else None


def backfill_events(db: Session) -> Dict[str, int]:
    """Create missing events for pre-existing Leads/Viewings (idempotent).

    Only refs that exist in `property_ads` are accepted, so analytics never
    invent a listing. Existing events are left untouched.
    """
    valid_refs = {row[0] for row in db.query(PropertyAd.property_ref).all()}
    if not valid_refs:
        return {"lead_refs": 0, "events": 0}

    lead_refs = 0
    leads = db.query(Lead).all()
    for lead in leads:
        if lead.property_ref:
            continue
        inferred = infer_property_ref(lead.raw_enquiry_text)
        if inferred and inferred in valid_refs:
            lead.property_ref = inferred
            lead_refs += 1

    inserted = 0
    # Iterate the same list: SessionLocal has autoflush=False, so querying
    # again here would not see the refs inferred immediately above.
    for lead in leads:
        ref = (lead.property_ref or "").strip()
        if not ref or ref not in valid_refs:
            continue
        when = _as_utc(lead.created_at) or utcnow()
        if record_event(
            db, ref, "enquiry", occurred_at=when, lead_id=lead.id,
            context="system", dedupe_key=f"enquiry:lead:{lead.id}", commit=False,
        ):
            inserted += 1
        if (lead.status or "").lower() == "closed":
            booked = _as_utc(lead.updated_at) or when
            if record_event(
                db, ref, "booking", occurred_at=booked, lead_id=lead.id,
                context="system", dedupe_key=f"booking:lead:{lead.id}", commit=False,
            ):
                inserted += 1

    for viewing in db.query(Viewing).all():
        ref = (viewing.property_ref or "").strip()
        if not ref or ref not in valid_refs:
            continue
        when = _as_utc(viewing.created_at) or utcnow()
        if record_event(
            db, ref, "site_visit_scheduled", occurred_at=when,
            viewing_id=viewing.id, context="system",
            dedupe_key=f"site_visit:viewing:{viewing.id}", commit=False,
        ):
            inserted += 1

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return {"lead_refs": lead_refs, "events": inserted}


def sync_lead_conversion_events(db: Session, lead: Optional[Lead], *, commit: bool = True) -> None:
    """Keep a lead's enquiry/booking events consistent with its stored state.

    Called by every backend flow that can change a lead's status or property
    attribution (staff lead create, public enquiry, status/outcome updates).
    Bookings are represented only while the lead is actually `closed`; if it
    is reopened or marked lost, its booking event is removed rather than left
    behind as an inflated conversion.
    """
    if lead is None or not getattr(lead, "id", None):
        if commit:
            db.commit()
        return

    ref = (lead.property_ref or "").strip()
    if not ref:
        inferred = infer_property_ref(lead.raw_enquiry_text)
        if inferred and ad_exists(db, inferred):
            lead.property_ref = ref = inferred
    if ref and ad_exists(db, ref):
        created = _as_utc(lead.created_at) or utcnow()
        record_event(
            db, ref, "enquiry", occurred_at=created, lead_id=lead.id,
            context="system", dedupe_key=f"enquiry:lead:{lead.id}", commit=False,
        )
        booking_key = f"booking:lead:{lead.id}"
        if (lead.status or "").lower() == "closed":
            booked = _as_utc(lead.updated_at) or created
            record_event(
                db, ref, "booking", occurred_at=booked, lead_id=lead.id,
                context="system", dedupe_key=booking_key, commit=False,
            )
        else:
            db.query(PropertyAdEvent).filter(
                PropertyAdEvent.dedupe_key == booking_key
            ).delete(synchronize_session=False)

    if commit:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()


def sync_viewing_event(db: Session, viewing: Optional[Viewing], *, commit: bool = True) -> None:
    """Create/remove the site-visit event tied to one Viewing row.

    A cancelled viewing is not a scheduled site visit and its event is
    removed. Other statuses (scheduled/completed/no_show) keep the visit in
    the funnel; the Viewing row remains the source of truth for outcome.
    """
    if viewing is None or not getattr(viewing, "id", None):
        if commit:
            db.commit()
        return
    ref = (viewing.property_ref or "").strip()
    key = f"site_visit:viewing:{viewing.id}"
    if not ref or not ad_exists(db, ref) or (viewing.status or "") == "cancelled":
        db.query(PropertyAdEvent).filter(PropertyAdEvent.dedupe_key == key).delete(
            synchronize_session=False
        )
    else:
        record_event(
            db, ref, "site_visit_scheduled",
            occurred_at=_as_utc(viewing.created_at) or utcnow(),
            viewing_id=viewing.id, context="system", dedupe_key=key, commit=False,
        )
    if commit:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()


# ─── Aggregates & ad listing ────────────────────────────────────────────────

def _event_totals(db: Session, start: datetime, end: datetime) -> Dict[str, Dict[str, int]]:
    rows = (
        db.query(
            PropertyAdEvent.event_type,
            func.count(PropertyAdEvent.id),
            func.count(func.distinct(PropertyAdEvent.visitor_hash)),
        )
        .filter(PropertyAdEvent.occurred_at >= start, PropertyAdEvent.occurred_at < end)
        .group_by(PropertyAdEvent.event_type)
        .all()
    )
    out: Dict[str, Dict[str, int]] = {}
    for event_type, total, unique in rows:
        out[event_type] = {"total": int(total or 0), "unique": int(unique or 0)}
    return out


def overview(db: Session, start: datetime, end: datetime, *, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = _as_utc(now) or utcnow()
    month_start, month_end = current_month_bounds(now)
    totals = _event_totals(db, start, end)

    def count(name: str) -> int:
        return int((totals.get(name) or {}).get("total") or 0)

    views = count("view")
    unique_views = int((totals.get("view") or {}).get("unique") or 0)
    enquiries = count("enquiry")
    bookings = count("booking")
    active_listings = (
        db.query(func.count(PropertyAd.id)).filter(PropertyAd.is_active == True).scalar() or 0  # noqa: E712
    )
    new_this_month = (
        db.query(func.count(PropertyAd.id))
        .filter(PropertyAd.published_at >= month_start, PropertyAd.published_at < month_end)
        .scalar() or 0
    )
    published_in_range = (
        db.query(func.count(PropertyAd.id))
        .filter(PropertyAd.published_at >= start, PropertyAd.published_at < end)
        .scalar() or 0
    )
    conversion = round((bookings / enquiries) * 100, 1) if enquiries > 0 else None
    return {
        "active_listings": int(active_listings),
        "new_listings_this_month": int(new_this_month),
        "listings_published_in_range": int(published_in_range),
        "impressions": count("impression"),
        "views": views,
        "unique_views": unique_views,
        "enquiries": enquiries,
        "whatsapp_clicks": count("whatsapp_click"),
        "site_visits": count("site_visit_scheduled"),
        "bookings": bookings,
        "enquiry_conversion_rate": conversion,
    }


def _metric_rows_for_refs(
    db: Session, refs: List[str], start: datetime, end: datetime
) -> Dict[str, Dict[str, int]]:
    metrics: Dict[str, Dict[str, int]] = {
        ref: {"impressions": 0, "views": 0, "unique_views": 0, "enquiries": 0,
              "whatsapp_clicks": 0, "site_visits": 0, "bookings": 0}
        for ref in refs
    }
    if not refs:
        return metrics
    rows = (
        db.query(
            PropertyAdEvent.property_ref,
            PropertyAdEvent.event_type,
            func.count(PropertyAdEvent.id),
            func.count(func.distinct(PropertyAdEvent.visitor_hash)),
        )
        .filter(
            PropertyAdEvent.property_ref.in_(refs),
            PropertyAdEvent.occurred_at >= start,
            PropertyAdEvent.occurred_at < end,
        )
        .group_by(PropertyAdEvent.property_ref, PropertyAdEvent.event_type)
        .all()
    )
    field = {
        "impression": "impressions",
        "view": "views",
        "enquiry": "enquiries",
        "whatsapp_click": "whatsapp_clicks",
        "site_visit_scheduled": "site_visits",
        "booking": "bookings",
    }
    for ref, event_type, total, unique in rows:
        cell = metrics.setdefault(ref, {})
        name = field.get(event_type)
        if name:
            cell[name] = int(total or 0)
        if event_type == "view":
            cell["unique_views"] = int(unique or 0)
    return metrics


_SORT_FIELDS = {
    "newest": None,
    "oldest": None,
    "price_asc": PropertyAd.price_aed.asc(),
    "price_desc": PropertyAd.price_aed.desc(),
    "title_asc": PropertyAd.title.asc(),
    "views_desc": None,
    "enquiries_desc": None,
}


def list_ads(
    db: Session,
    *,
    start: datetime,
    end: datetime,
    page: int = 1,
    per_page: int = 25,
    search: Optional[str] = None,
    location: Optional[str] = None,
    project: Optional[str] = None,
    property_type: Optional[str] = None,
    listing_type: Optional[str] = None,
    availability: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    active: Optional[bool] = None,
    sort: str = "newest",
) -> Dict[str, Any]:
    """Server-side paginated/filtered ad table with range-scoped metrics."""
    page = max(1, int(page))
    per_page = max(1, min(int(per_page), 100))
    sort = sort if sort in _SORT_FIELDS else "newest"

    q = db.query(PropertyAd)
    if active is not None:
        q = q.filter(PropertyAd.is_active == bool(active))
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(
            PropertyAd.title.ilike(like),
            PropertyAd.property_ref.ilike(like),
            PropertyAd.location.ilike(like),
            PropertyAd.project.ilike(like),
        ))
    if location:
        q = q.filter(PropertyAd.location.ilike(f"%{location.strip()}%"))
    if project:
        q = q.filter(PropertyAd.project == project.strip())
    if property_type:
        q = q.filter(func.lower(PropertyAd.property_type) == property_type.strip().lower())
    if listing_type:
        q = q.filter(func.lower(PropertyAd.listing_type) == listing_type.strip().lower())
    if availability:
        av = availability.strip().lower()
        if av == "off-plan":
            q = q.filter(func.lower(PropertyAd.availability) != "ready")
        else:
            q = q.filter(func.lower(PropertyAd.availability) == av)
    if min_price is not None:
        q = q.filter(PropertyAd.price_aed >= float(min_price))
    if max_price is not None:
        q = q.filter(PropertyAd.price_aed <= float(max_price))

    total = q.count()

    # Sort-by-engagement needs an aggregate join. All other sorts paginate the
    # ad table first and aggregate only the returned page (bounded work).
    aggregate_sort = sort in ("views_desc", "enquiries_desc")
    if aggregate_sort:
        event_field = "view" if sort == "views_desc" else "enquiry"
        agg = (
            db.query(
                PropertyAdEvent.property_ref.label("ref"),
                func.count(PropertyAdEvent.id).label("n"),
            )
            .filter(
                PropertyAdEvent.event_type == event_field,
                PropertyAdEvent.occurred_at >= start,
                PropertyAdEvent.occurred_at < end,
            )
            .group_by(PropertyAdEvent.property_ref)
            .subquery()
        )
        q = q.outerjoin(agg, agg.c.ref == PropertyAd.property_ref)
        q = q.order_by(func.coalesce(agg.c.n, 0).desc(), PropertyAd.published_at.desc())
    elif sort == "oldest":
        q = q.order_by(PropertyAd.published_at.asc())
    elif sort == "price_asc":
        q = q.order_by(PropertyAd.price_aed.asc())
    elif sort == "price_desc":
        q = q.order_by(PropertyAd.price_aed.desc())
    elif sort == "title_asc":
        q = q.order_by(PropertyAd.title.asc())
    else:
        q = q.order_by(PropertyAd.published_at.desc(), PropertyAd.id.desc())

    rows = q.offset((page - 1) * per_page).limit(per_page).all()
    refs = [row.property_ref for row in rows]
    metrics = _metric_rows_for_refs(db, refs, start, end)

    items = []
    for row in rows:
        m = metrics.get(row.property_ref, {})
        items.append({
            "property_ref": row.property_ref,
            "source": row.source,
            "title": row.title,
            "location": row.location,
            "project": row.project,
            "property_type": row.property_type,
            "listing_type": row.listing_type,
            "bedrooms": row.bedrooms,
            "bathrooms": row.bathrooms,
            "size_sqft": row.size_sqft,
            "price_aed": row.price_aed,
            "availability": row.availability,
            "image_url": row.image_url,
            "is_active": bool(row.is_active),
            "published_at": _as_utc(row.published_at),
            "metrics": m,
        })

    return {
        "total": int(total),
        "page": page,
        "per_page": per_page,
        "pages": max(1, math.ceil(total / per_page)) if total else 0,
        "sort": sort,
        "items": items,
    }


_FILTER_CACHE: Dict[str, Any] = {"at": 0.0, "data": None}
_FILTER_TTL_SECONDS = 60.0


def filter_options(db: Session) -> Dict[str, List[str]]:
    """Distinct real filter values (short cache; invalidated on ad sync)."""
    now_ts = time.time()
    if _FILTER_CACHE["data"] is not None and now_ts - _FILTER_CACHE["at"] < _FILTER_TTL_SECONDS:
        return _FILTER_CACHE["data"]

    def distinct(column):
        return sorted({
            str(row[0]).strip()
            for row in db.query(column).filter(column.isnot(None)).distinct().all()
            if row[0] and str(row[0]).strip()
        })

    data = {
        "locations": distinct(PropertyAd.location),
        "projects": distinct(PropertyAd.project),
        "property_types": distinct(PropertyAd.property_type),
        "availabilities": distinct(PropertyAd.availability),
        "listing_types": distinct(PropertyAd.listing_type),
    }
    _FILTER_CACHE.update({"at": now_ts, "data": data})
    return data


def set_ad_active(db: Session, property_ref: str, is_active: bool) -> Optional[PropertyAd]:
    ad = db.query(PropertyAd).filter(PropertyAd.property_ref == property_ref).first()
    if not ad:
        return None
    ad.is_active = bool(is_active)
    ad.updated_at = utcnow()
    db.commit()
    db.refresh(ad)
    refresh_inactive_ads_cache(db)
    _FILTER_CACHE["at"] = 0.0
    return ad
