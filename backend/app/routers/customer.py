"""
Customer self-service profile endpoints (any verified Firebase identity).

Ownership model: every row is keyed by the UID from the VERIFIED token.
Callers address only "my profile" — there is no id parameter, so one
account can never read or write another's row. Email is copied from the
verified claims (never trusted from the body); role is resolved through
trusted backend logic (non-staff => customer) and reported read-only.
Acquisition attribution is first-touch-wins: stored source columns are
never overwritten by later updates.
"""
from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
import re
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app import schemas
from app.database import get_db
from app.services.audit_service import log_audit
from app.models import (
    CallLog,
    CustomerChatMessage,
    CustomerChatSession,
    CustomerFavorite,
    CustomerInquiry,
    CustomerInteraction,
    CustomerProfile,
    Lead,
    Viewing,
)
from app.services import roles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/customer", tags=["customer"])

_SAFE_REF = re.compile(r"^[A-Za-z0-9_.:\-]{1,64}$")


def require_verified_user(
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Verified Firebase identity (any account, staff or customer)."""
    claims = roles.verify_bearer_token(authorization)
    if not claims or (not claims.get("uid") and not claims.get("email")):
        raise HTTPException(
            status_code=401,
            detail="Sign-in required (valid Firebase ID token).",
        )
    return claims


def require_verified_uid(
    claims: Dict[str, Any] = Depends(require_verified_user),
) -> Dict[str, Any]:
    """Verified identity that MUST carry a Firebase UID.

    Every customer-owned record is keyed by this token UID. An email-only
    token can never read or write another account's rows.
    """
    if not claims.get("uid"):
        raise HTTPException(status_code=401, detail="A UID-bearing token is required.")
    return claims


def _out(row: CustomerProfile, role: str) -> schemas.CustomerProfileOut:
    prefs = _prefs_payload(row.preferences).model_dump()
    return schemas.CustomerProfileOut(
        firebase_uid=row.firebase_uid,
        email=row.email,
        name=row.name,
        phone=row.phone,
        city=row.city,
        country=row.country,
        preferences=prefs,
        utm_source=row.utm_source,
        utm_medium=row.utm_medium,
        utm_campaign=row.utm_campaign,
        referrer=row.referrer,
        discovery_source=row.discovery_source,
        tracking_consent=row.tracking_consent,
        role=role,
        created_at=_as_utc(row.created_at),
        updated_at=_as_utc(row.updated_at),
    )


def _as_utc(dt: Any) -> datetime:
    if isinstance(dt, datetime):
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


class ProfileResponse(BaseModel):
    profile: Optional[schemas.CustomerProfileOut] = None
    role: str


@router.get("/profile", response_model=ProfileResponse, summary="My customer profile + trusted role")
def get_my_profile(
    claims: Dict[str, Any] = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    role, _, _ = roles.resolve_role(db, claims)
    uid = claims.get("uid")
    row = (
        db.query(CustomerProfile)
        .filter(CustomerProfile.firebase_uid == (uid or ""))
        .first()
        if uid else None
    )
    return ProfileResponse(profile=_out(row, role) if row else None, role=role)


@router.put("/profile", response_model=ProfileResponse, summary="Create/update my customer profile")
def save_my_profile(
    payload: schemas.CustomerProfileUpdate,
    claims: Dict[str, Any] = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    uid = claims.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="A UID-bearing token is required.")
    role, email, _ = roles.resolve_role(db, claims)
    row = (
        db.query(CustomerProfile)
        .filter(CustomerProfile.firebase_uid == uid)
        .first()
    )
    # None = caller did not send preferences (profile-only save). Preserve
    # the stored dict so a name/phone edit can never erase preferences.
    if payload.preferences is not None:
        prefs = payload.preferences.model_dump()
    elif row is not None and isinstance(row.preferences, dict):
        prefs = row.preferences
    else:
        prefs = {}
    if row is None:
        row = CustomerProfile(
            firebase_uid=uid,
            email=email,
            name=payload.name.strip(),
            phone=(payload.phone or "").strip() or None,
            city=(payload.city or "").strip() or None,
            country=(payload.country or "").strip() or None,
            preferences=prefs,
            utm_source=(payload.utm_source or "").strip() or None,
            utm_medium=(payload.utm_medium or "").strip() or None,
            utm_campaign=(payload.utm_campaign or "").strip() or None,
            referrer=(payload.referrer or "").strip() or None,
            discovery_source=(payload.discovery_source or "").strip() or None,
        )
        db.add(row)
    else:
        # Email always follows the verified token (never the body).
        row.email = email
        row.name = payload.name.strip()
        row.phone = (payload.phone or "").strip() or None
        row.city = (payload.city or "").strip() or None
        row.country = (payload.country or "").strip() or None
        row.preferences = prefs
        # First-touch attribution: keep the original acquisition source.
        if not row.utm_source and payload.utm_source:
            row.utm_source = payload.utm_source.strip() or None
        if not row.utm_medium and payload.utm_medium:
            row.utm_medium = payload.utm_medium.strip() or None
        if not row.utm_campaign and payload.utm_campaign:
            row.utm_campaign = payload.utm_campaign.strip() or None
        if not row.referrer and payload.referrer:
            row.referrer = payload.referrer.strip() or None
        # Self-reported discovery source is first-touch too: the customer's
        # own first answer is kept, never overwritten or guessed.
        if not row.discovery_source and payload.discovery_source:
            row.discovery_source = payload.discovery_source.strip() or None
        row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return ProfileResponse(profile=_out(row, role), role=role)


def _prefs_payload(prefs: Any) -> schemas.CustomerPreferences:
    if not isinstance(prefs, dict):
        return schemas.CustomerPreferences()
    allowed = schemas.CustomerPreferences.model_fields
    return schemas.CustomerPreferences(
        **{k: v for k, v in prefs.items() if k in allowed}
    )


@router.get("/preferences", response_model=schemas.CustomerPreferences,
            summary="My saved search preferences")
def get_my_preferences(
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    row = db.query(CustomerProfile).filter(CustomerProfile.firebase_uid == uid).first()
    return _prefs_payload(row.preferences if row else None)


@router.put("/preferences", response_model=schemas.CustomerPreferences,
            summary="Replace my saved search preferences")
def save_my_preferences(
    payload: schemas.CustomerPreferences,
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    """Preferences-only write: no profile name required and no other profile
    field (name/phone/city/country/attribution) can be touched."""
    row = _get_or_create_profile(db, claims)
    row.preferences = payload.model_dump()
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _prefs_payload(row.preferences)


# ─── Customer-owned records (backend is the single source of truth) ──────────
# Every query below is filtered by the VERIFIED token UID. No route accepts a
# uid, so cross-account reads/writes are structurally impossible.

def _new_ref(value: Optional[str], prefix: str) -> str:
    """Accept a bounded client/legacy id, otherwise mint a server id."""
    text = (value or "").strip()
    if text and _SAFE_REF.match(text):
        return text
    return f"{prefix}_{uuid.uuid4().hex}"


def _clean_favorite_ids(values: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in values or []:
        if not isinstance(raw, str):
            continue
        pid = raw.strip()[:64]
        if pid and pid not in seen:
            seen.add(pid)
            out.append(pid)
        if len(out) >= 500:
            break
    return out


def _clean_property_ids(values: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in values or []:
        if not isinstance(raw, str):
            continue
        pid = raw.strip()[:64]
        if pid and pid not in seen:
            seen.add(pid)
            out.append(pid)
        if len(out) >= 50:
            break
    return out


def _get_or_create_profile(db: Session, claims: Dict[str, Any]) -> CustomerProfile:
    uid = str(claims["uid"])
    row = db.query(CustomerProfile).filter(CustomerProfile.firebase_uid == uid).first()
    if row is None:
        row = CustomerProfile(
            firebase_uid=uid,
            email=claims.get("email"),
            preferences={},
        )
        db.add(row)
        db.flush()
    return row


def _inquiry_out(row: CustomerInquiry) -> schemas.CustomerInquiryOut:
    return schemas.CustomerInquiryOut(
        id=row.record_ref,
        lead_id=row.lead_id,
        session_id=row.session_id,
        property_id=row.property_id,
        property_title=row.property_title,
        property_location=row.property_location,
        property_type=row.property_type,
        listing_type=row.listing_type,
        price_aed=row.price_aed or 0,
        bedrooms=row.bedrooms or 0,
        size_sqft=row.size_sqft or 0,
        availability=row.availability,
        status=row.status,
        created_at=_as_utc(row.created_at),
        updated_at=_as_utc(row.updated_at),
    )


def _insert_inquiry(
    db: Session, uid: str, payload: schemas.CustomerInquiryCreate
) -> tuple[CustomerInquiry, bool]:
    ref = _new_ref(payload.record_ref, "inq")
    existing = (
        db.query(CustomerInquiry)
        .filter(CustomerInquiry.firebase_uid == uid)
        .filter(CustomerInquiry.record_ref == ref)
        .first()
    )
    if existing:
        return existing, False

    valid_lead_id = None
    if payload.lead_id is not None:
        try:
            lead_exists = db.query(Lead.id).filter(Lead.id == payload.lead_id).first()
            if lead_exists:
                valid_lead_id = payload.lead_id
        except Exception:
            valid_lead_id = None

    created_at = payload.created_at or datetime.now(timezone.utc)
    row = CustomerInquiry(
        firebase_uid=uid,
        record_ref=ref,
        lead_id=valid_lead_id,
        session_id=(payload.session_id or "").strip()[:128] or None,
        property_id=(payload.property_id or "").strip()[:64],
        property_title=(payload.property_title or "Property Inquiry").strip()[:255],
        property_location=(payload.property_location or "").strip()[:100] or None,
        property_type=(payload.property_type or "").strip()[:50] or None,
        listing_type=(payload.listing_type or "").strip()[:20] or None,
        price_aed=float(payload.price_aed or 0),
        bedrooms=int(payload.bedrooms or 0),
        size_sqft=float(payload.size_sqft or 0),
        availability=(payload.availability or "").strip()[:50] or None,
        status=(getattr(payload, 'status', None) or "Submitted").strip()[:20],
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(row)
    db.flush()
    return row, True


def _turn_out(row: CustomerChatMessage) -> schemas.CustomerChatTurnOut:
    ids = row.property_ids if isinstance(row.property_ids, list) else []
    return schemas.CustomerChatTurnOut(
        id=row.message_ref,
        session_id=row.session_id,
        role=row.role,
        text=row.text,
        property_ids=[str(x) for x in ids][:50],
        created_at=_as_utc(row.created_at),
    )


def _upsert_turn(
    db: Session, uid: str, payload: schemas.CustomerChatTurnCreate
) -> tuple[CustomerChatMessage, bool]:
    ref = _new_ref(payload.record_ref, "msg")
    existing = (
        db.query(CustomerChatMessage)
        .filter(CustomerChatMessage.firebase_uid == uid)
        .filter(CustomerChatMessage.message_ref == ref)
        .first()
    )
    if existing:
        return existing, False

    sess_id = (payload.session_id or "").strip()[:128] or f"sess_{uuid.uuid4().hex}"
    session = (
        db.query(CustomerChatSession)
        .filter(CustomerChatSession.firebase_uid == uid)
        .filter(CustomerChatSession.session_id == sess_id)
        .first()
    )
    created_at = payload.created_at or datetime.now(timezone.utc)

    # 1. Ensure session row exists (isolated savepoint to handle concurrent creation)
    if session is None:
        session_sp = db.begin_nested()
        try:
            session = CustomerChatSession(
                firebase_uid=uid,
                session_id=sess_id,
                title=((payload.text or "").strip()[:60] if payload.role == "user" else "LYKA chat"),
                created_at=created_at,
                updated_at=created_at,
            )
            db.add(session)
            db.flush()
            session_sp.commit()
        except IntegrityError:
            session_sp.rollback()
            session = (
                db.query(CustomerChatSession)
                .filter(CustomerChatSession.firebase_uid == uid)
                .filter(CustomerChatSession.session_id == sess_id)
                .first()
            )
    else:
        if payload.role == "user" and (not session.title or session.title == "LYKA chat"):
            session.title = (payload.text or "").strip()[:60]
        if _as_utc(created_at) >= _as_utc(session.updated_at):
            session.updated_at = created_at

    # 2. Insert message row with idempotency guard
    row = CustomerChatMessage(
        firebase_uid=uid,
        session_id=sess_id,
        message_ref=ref,
        role=(payload.role or "user").strip()[:16],
        text=(payload.text or "").strip()[:4000],
        property_ids=_clean_property_ids(payload.property_ids),
        created_at=created_at,
    )
    msg_sp = db.begin_nested()
    try:
        db.add(row)
        db.flush()
        msg_sp.commit()
        return row, True
    except IntegrityError:
        msg_sp.rollback()
        existing = (
            db.query(CustomerChatMessage)
            .filter(CustomerChatMessage.firebase_uid == uid)
            .filter(CustomerChatMessage.message_ref == ref)
            .first()
        )
        if existing is not None:
            return existing, False
        raise


def _interaction_out(row: CustomerInteraction) -> schemas.CustomerInteractionOut:
    return schemas.CustomerInteractionOut(
        id=row.event_ref,
        kind=row.kind,
        property_id=row.property_id,
        location=row.location,
        property_type=row.property_type,
        bedrooms=row.bedrooms,
        query=row.query,
        created_at=_as_utc(row.created_at),
    )


def _insert_interaction(
    db: Session, uid: str, payload: schemas.CustomerInteractionCreate
) -> tuple[CustomerInteraction, bool]:
    ref = _new_ref(payload.record_ref, "evt")
    existing = (
        db.query(CustomerInteraction)
        .filter(CustomerInteraction.firebase_uid == uid)
        .filter(CustomerInteraction.event_ref == ref)
        .first()
    )
    if existing:
        return existing, False
    created_at = payload.created_at or datetime.now(timezone.utc)
    row = CustomerInteraction(
        firebase_uid=uid,
        event_ref=ref,
        kind=(payload.kind or "view").strip()[:16],
        property_id=(payload.property_id or "").strip()[:64] or None,
        location=(payload.location or "").strip()[:100] or None,
        property_type=(payload.property_type or "").strip()[:50] or None,
        bedrooms=payload.bedrooms,
        query=(payload.query or "").strip()[:300] or None,
        created_at=created_at,
    )
    db.add(row)
    db.flush()
    return row, True


def _prefs_empty(prefs: Any) -> bool:
    if not isinstance(prefs, dict):
        return True
    keys = ("locations", "propertyType", "bedrooms", "budgetMin", "budgetMax",
            "purpose", "timeline_days")
    return all(
        prefs.get(k) in (None, [], "") for k in keys
    )


# ─── Favorites ───────────────────────────────────────────────────────────────

@router.get("/favorites", response_model=schemas.FavoriteListOut,
            summary="My saved property IDs (token-owned)")
def get_my_favorites(
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    rows = (
        db.query(CustomerFavorite)
        .filter(CustomerFavorite.firebase_uid == uid)
        .order_by(CustomerFavorite.created_at.asc())
        .all()
    )
    return schemas.FavoriteListOut(favorites=[r.property_id for r in rows])


@router.put("/favorites", response_model=schemas.FavoriteListOut,
            summary="Replace my saved property IDs")
def replace_my_favorites(
    payload: schemas.FavoriteListUpdate,
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    wanted = _clean_favorite_ids(payload.favorites)
    existing = {
        r.property_id: r
        for r in db.query(CustomerFavorite)
        .filter(CustomerFavorite.firebase_uid == uid)
        .all()
    }
    for pid in wanted:
        if pid not in existing:
            db.add(CustomerFavorite(firebase_uid=uid, property_id=pid))
    wanted_set = set(wanted)
    for pid, row in existing.items():
        if pid not in wanted_set:
            db.delete(row)
    db.commit()
    return schemas.FavoriteListOut(favorites=wanted)


# ─── Inquiries ───────────────────────────────────────────────────────────────

@router.get("/inquiries", response_model=schemas.CustomerInquiryListOut,
            summary="My submitted inquiries (token-owned)")
def get_my_inquiries(
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    rows = (
        db.query(CustomerInquiry)
        .filter(CustomerInquiry.firebase_uid == uid)
        .order_by(CustomerInquiry.created_at.desc())
        .limit(200)
        .all()
    )
    return schemas.CustomerInquiryListOut(inquiries=[_inquiry_out(r) for r in rows])


@router.post("/inquiries", response_model=schemas.CustomerInquiryOut,
             status_code=201, summary="Record one of my inquiries")
def create_my_inquiry(
    payload: schemas.CustomerInquiryCreate,
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    row, _created = _insert_inquiry(db, uid, payload)
    db.commit()
    db.refresh(row)
    log_audit(
        db,
        {"email": claims.get("email"), "uid": uid, "role": "customer"},
        "customer_inquiry_recorded", "customer_inquiry", row.id,
        lead_id=row.lead_id,
        details={"record_ref": row.record_ref, "property_id": row.property_id},
    )

    try:
        from app.services import notification_service
        if claims.get("email"):
            notification_service.create_notification(
                db=db,
                recipient_email=claims["email"],
                recipient_user_id=uid,
                recipient_role="customer",
                title="Inquiry Recorded",
                message=f"We have received your inquiry for property ref {row.property_id or 'General'}. A representative will contact you.",
                category="inquiries",
                notification_type="inquiry_received",
                related_entity_type="inquiry",
                related_entity_id=row.id,
                action_url="/account",
            )
        notification_service.notify_admins(
            db=db,
            title="New Customer Inquiry",
            message=f"Inquiry received from {claims.get('email') or 'customer'} for {row.property_id or 'property'}.",
            category="inquiries",
            notification_type="inquiry_created",
            related_entity_type="inquiry",
            related_entity_id=row.id,
            action_url="/crm/leads",
        )
    except Exception as exc:
        logger.warning("Failed to dispatch customer inquiry notification: %s", exc)
    return _inquiry_out(row)


@router.patch("/inquiries/{inquiry_id}", response_model=schemas.CustomerInquiryOut,
              summary="Update my inquiry status")
def update_my_inquiry(
    inquiry_id: str,
    payload: schemas.CustomerInquiryStatusUpdate,
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    row = (
        db.query(CustomerInquiry)
        .filter(CustomerInquiry.firebase_uid == uid)
        .filter(CustomerInquiry.record_ref == inquiry_id)
        .first()
    )
    if row is None and inquiry_id.isdigit():
        row = (
            db.query(CustomerInquiry)
            .filter(CustomerInquiry.firebase_uid == uid)
            .filter(CustomerInquiry.id == int(inquiry_id))
            .first()
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Inquiry not found.")
    row.status = payload.status
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    log_audit(
        db,
        {"email": claims.get("email"), "uid": uid, "role": "customer"},
        "customer_inquiry_status_changed", "customer_inquiry", row.id,
        lead_id=row.lead_id,
        details={"status": row.status},
    )
    return _inquiry_out(row)


# ─── My appointments (calls + viewings for my own enquiries) ─────────────────

@router.get("/appointments", response_model=schemas.CustomerAppointmentsOut,
            summary="My scheduled calls and site visits (token-owned)")
def get_my_appointments(
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    """Read-only appointment status for the caller's own enquiries.

    Ownership is established two ways, both server-verified:
      1. the enquiry is recorded in the caller's UID-owned inquiry rows;
      2. the lead's contact email matches the verified token email.
    Internal staff notes and staff contact details are never returned.
    """
    uid = str(claims["uid"])
    email = (claims.get("email") or "").strip().lower()

    lead_ids = {
        row[0] for row in
        db.query(CustomerInquiry.lead_id)
        .filter(CustomerInquiry.firebase_uid == uid)
        .filter(CustomerInquiry.lead_id.isnot(None)).all()
    }
    if email:
        lead_ids |= {
            row[0] for row in
            db.query(Lead.id)
            .filter(func.lower(Lead.contact_email) == email).all()
        }
    ids = list(lead_ids) or [-1]

    out: List[schemas.CustomerAppointmentOut] = []
    for v in (
        db.query(Viewing).filter(Viewing.lead_id.in_(ids))
        .order_by(Viewing.scheduled_at.desc()).limit(100).all()
    ):
        out.append(schemas.CustomerAppointmentOut(
            id=v.id, lead_id=v.lead_id, kind="viewing",
            scheduled_at=_as_utc(v.scheduled_at), status=v.status,
            property_ref=v.property_ref,
        ))
    for c in (
        db.query(CallLog).filter(CallLog.lead_id.in_(ids))
        .order_by(CallLog.scheduled_at.desc()).limit(100).all()
    ):
        out.append(schemas.CustomerAppointmentOut(
            id=c.id, lead_id=c.lead_id, kind="call",
            scheduled_at=_as_utc(c.scheduled_at), status=c.status,
        ))
    out.sort(key=lambda a: a.scheduled_at, reverse=True)
    return schemas.CustomerAppointmentsOut(appointments=out)


# ─── Authenticated chat history ──────────────────────────────────────────────

@router.get("/chat/sessions", response_model=schemas.CustomerChatSessionsListOut,
            summary="List my authenticated chat sessions")
def get_my_chat_sessions(
    limit: int = Query(30, ge=1, le=100),
    before: Optional[str] = Query(None, max_length=64),
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    """Paginated conversation list for the signed-in owner.

    Uses three aggregate queries for the whole page instead of loading
    every message of every session (the previous N+1 behaviour). All
    ownership filters use the verified token uid.
    """
    uid = str(claims["uid"])

    # Direct Python callers (tests/legacy helpers) may bypass FastAPI's
    # query parsing, in which case the defaults are Query() marker objects.
    if not isinstance(limit, int):
        limit = 30
    if not isinstance(before, str):
        before = None

    query = db.query(CustomerChatSession).filter(
        CustomerChatSession.firebase_uid == uid
    )
    before_dt: Optional[datetime] = None
    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
            if before_dt.tzinfo is None:
                before_dt = before_dt.replace(tzinfo=timezone.utc)
        except ValueError:
            before_dt = None
    if before_dt is not None:
        query = query.filter(CustomerChatSession.updated_at < before_dt)

    rows = (
        query
        .order_by(CustomerChatSession.updated_at.desc(), CustomerChatSession.id.desc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    session_ids = [s.session_id for s in rows]

    counts: Dict[str, int] = {}
    last_message_map: Dict[str, CustomerChatMessage] = {}
    rec_map: Dict[str, List[str]] = {}
    if session_ids:
        for sid, count in (
            db.query(CustomerChatMessage.session_id, func.count(CustomerChatMessage.id))
            .filter(
                CustomerChatMessage.firebase_uid == uid,
                CustomerChatMessage.session_id.in_(session_ids),
            )
            .group_by(CustomerChatMessage.session_id)
            .all()
        ):
            counts[str(sid)] = int(count or 0)

        last_ids = [
            r[0] for r in (
                db.query(func.max(CustomerChatMessage.id))
                .filter(
                    CustomerChatMessage.firebase_uid == uid,
                    CustomerChatMessage.session_id.in_(session_ids),
                )
                .group_by(CustomerChatMessage.session_id)
                .all()
            )
            if r[0] is not None
        ]
        if last_ids:
            for msg in (
                db.query(CustomerChatMessage)
                .filter(CustomerChatMessage.id.in_(last_ids))
                .all()
            ):
                last_message_map[msg.session_id] = msg

        for sid, pids in (
            db.query(CustomerChatMessage.session_id, CustomerChatMessage.property_ids)
            .filter(
                CustomerChatMessage.firebase_uid == uid,
                CustomerChatMessage.session_id.in_(session_ids),
                CustomerChatMessage.role == "assistant",
            )
            .all()
        ):
            if not isinstance(pids, list):
                continue
            bucket = rec_map.setdefault(str(sid), [])
            for pid in pids:
                pid_str = str(pid)
                if pid_str and pid_str not in bucket:
                    bucket.append(pid_str)

    out: List[schemas.CustomerChatSessionOut] = []
    for s in rows:
        rec_ids = rec_map.get(s.session_id, [])
        last = last_message_map.get(s.session_id)
        preview = (last.text or "").strip()[:140] if last is not None else None
        out.append(schemas.CustomerChatSessionOut(
            session_id=s.session_id,
            title=s.title,
            created_at=_as_utc(s.created_at),
            updated_at=_as_utc(s.updated_at),
            turn_count=counts.get(s.session_id, 0),
            has_recommendations=bool(rec_ids),
            recommended_property_ids=rec_ids[:10],
            preview=preview or None,
            last_message_at=_as_utc(last.created_at) if last is not None else None,
        ))

    total = (
        db.query(func.count(CustomerChatSession.id))
        .filter(CustomerChatSession.firebase_uid == uid)
        .scalar()
    ) or 0
    next_cursor = (
        _as_utc(rows[-1].updated_at).isoformat() if has_more and rows else None
    )
    return schemas.CustomerChatSessionsListOut(
        sessions=out,
        has_more=has_more,
        next_cursor=next_cursor,
        total=int(total),
    )


@router.get("/chat/sessions/{session_id}", response_model=schemas.CustomerChatSessionDetailOut,
            summary="Get specific chat session details and recommendations")
def get_my_chat_session_detail(
    session_id: str,
    limit: int = Query(100, ge=1, le=200),
    before: Optional[str] = Query(None, max_length=64),
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    """Return one owned conversation, newest page first.

    ``before`` accepts the ``id`` (message_ref) of the oldest message the
    client already has, which makes older-message paging stable even if
    new turns arrive meanwhile.
    """
    from app.services.property_service import get_property_by_id
    from app.services.chat_persistence_service import load_session_requirements

    uid = str(claims["uid"])
    if not isinstance(limit, int):
        limit = 100
    if not isinstance(before, str):
        before = None
    session = (
        db.query(CustomerChatSession)
        .filter(CustomerChatSession.firebase_uid == uid)
        .filter(CustomerChatSession.session_id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    query = (
        db.query(CustomerChatMessage)
        .filter(CustomerChatMessage.firebase_uid == uid)
        .filter(CustomerChatMessage.session_id == session_id)
    )
    if before:
        anchor = (
            db.query(CustomerChatMessage)
            .filter(CustomerChatMessage.firebase_uid == uid)
            .filter(CustomerChatMessage.session_id == session_id)
            .filter(CustomerChatMessage.message_ref == before)
            .first()
        )
        if anchor is not None:
            query = query.filter(CustomerChatMessage.id < anchor.id)

    fetched = (
        query
        .order_by(CustomerChatMessage.id.desc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(fetched) > limit
    fetched = fetched[:limit]
    fetched.reverse()

    # Recommendations span the whole conversation, not just this page.
    rec_props = []
    seen_ids = set()
    for (pids,) in (
        db.query(CustomerChatMessage.property_ids)
        .filter(CustomerChatMessage.firebase_uid == uid)
        .filter(CustomerChatMessage.session_id == session_id)
        .filter(CustomerChatMessage.role == "assistant")
        .order_by(CustomerChatMessage.created_at.asc(), CustomerChatMessage.id.asc())
        .all()
    ):
        if not isinstance(pids, list):
            continue
        for pid in pids:
            if pid in seen_ids:
                continue
            seen_ids.add(pid)
            prop = get_property_by_id(str(pid))
            if prop:
                rec_props.append(prop)

    return schemas.CustomerChatSessionDetailOut(
        session_id=session.session_id,
        title=session.title,
        created_at=_as_utc(session.created_at),
        updated_at=_as_utc(session.updated_at),
        turns=[_turn_out(r) for r in fetched],
        recommended_properties=rec_props,
        has_more=has_more,
        next_cursor=(fetched[0].message_ref if has_more and fetched else None),
        requirements=load_session_requirements(uid, session_id),
    )


@router.patch("/chat/sessions/{session_id}", response_model=schemas.CustomerChatSessionRenamedOut,
              summary="Rename one of my chat sessions")
def rename_my_chat_session(
    session_id: str,
    payload: schemas.CustomerChatSessionRename,
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    session = (
        db.query(CustomerChatSession)
        .filter(CustomerChatSession.firebase_uid == uid)
        .filter(CustomerChatSession.session_id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    session.title = title[:120]
    db.commit()
    db.refresh(session)
    return schemas.CustomerChatSessionRenamedOut(
        session_id=session.session_id,
        title=session.title or "",
        updated_at=_as_utc(session.updated_at),
    )


@router.get("/chat/latest", response_model=schemas.CustomerChatLatestOut,
            summary="My most recent authenticated chat (token-owned)")
def get_my_latest_chat(
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    session = (
        db.query(CustomerChatSession)
        .filter(CustomerChatSession.firebase_uid == uid)
        .order_by(CustomerChatSession.updated_at.desc())
        .first()
    )
    if session is None:
        return schemas.CustomerChatLatestOut(session_id=None, turns=[])
    rows = (
        db.query(CustomerChatMessage)
        .filter(CustomerChatMessage.firebase_uid == uid)
        .filter(CustomerChatMessage.session_id == session.session_id)
        .order_by(CustomerChatMessage.created_at.asc(), CustomerChatMessage.id.asc())
        .limit(100)
        .all()
    )
    return schemas.CustomerChatLatestOut(
        session_id=session.session_id,
        turns=[_turn_out(r) for r in rows],
    )


@router.post("/chat/turns", response_model=schemas.CustomerChatTurnOut,
             status_code=201, summary="Append one turn to my chat history")
def create_my_chat_turn(
    payload: schemas.CustomerChatTurnCreate,
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    try:
        row, _created = _upsert_turn(db, uid, payload)
        db.commit()
        db.refresh(row)
        return _turn_out(row)
    except Exception as exc:
        db.rollback()
        logger.warning("Error persisting chat turn for uid %s: %s", uid, exc)
        ref = _new_ref(payload.record_ref, "msg")
        existing = (
            db.query(CustomerChatMessage)
            .filter(CustomerChatMessage.firebase_uid == uid)
            .filter(CustomerChatMessage.message_ref == ref)
            .first()
        )
        if existing is not None:
            return _turn_out(existing)
        raise HTTPException(
            status_code=500,
            detail="Chat turn persistence error. Please retry."
        )


# ─── Consent-gated interactions ──────────────────────────────────────────────

@router.get("/interactions", response_model=schemas.CustomerInteractionListOut,
            summary="My consent-gated activity log")
def get_my_interactions(
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    rows = (
        db.query(CustomerInteraction)
        .filter(CustomerInteraction.firebase_uid == uid)
        .order_by(CustomerInteraction.created_at.asc())
        .limit(100)
        .all()
    )
    return schemas.CustomerInteractionListOut(
        interactions=[_interaction_out(r) for r in rows]
    )


@router.post("/interactions", response_model=schemas.CustomerInteractionOut,
             status_code=201, summary="Log one consent-gated activity event")
def create_my_interaction(
    payload: schemas.CustomerInteractionCreate,
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    row, _created = _insert_interaction(db, uid, payload)
    db.commit()
    db.refresh(row)
    return _interaction_out(row)


@router.get("/tracking-consent", response_model=schemas.TrackingConsentOut,
            summary="My activity-tracking preference")
def get_my_tracking_consent(
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    uid = str(claims["uid"])
    row = db.query(CustomerProfile).filter(CustomerProfile.firebase_uid == uid).first()
    return schemas.TrackingConsentOut(
        tracking_consent=(row.tracking_consent if row else None)
    )


@router.put("/tracking-consent", response_model=schemas.TrackingConsentOut,
            summary="Store my activity-tracking preference")
def set_my_tracking_consent(
    payload: schemas.TrackingConsentUpdate,
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    row = _get_or_create_profile(db, claims)
    row.tracking_consent = bool(payload.allow)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return schemas.TrackingConsentOut(tracking_consent=row.tracking_consent)


# ─── One-time owner-matched legacy migration ─────────────────────────────────

@router.post("/migrate/legacy", response_model=schemas.LegacyMigrationOut,
             summary="Import owner-matched legacy browser/RTDB records once")
def migrate_legacy_records(
    payload: schemas.LegacyMigrationIn,
    claims: Dict[str, Any] = Depends(require_verified_uid),
    db: Session = Depends(get_db),
):
    """Idempotent, non-destructive import of data the client could only have
    obtained from this exact Firebase UID's own browser/RTDB namespace.

    - Guest/other-owner data is never accepted by the client (see chatStore).
    - Existing backend values always win; only missing records/fields are added.
    - The marker is set only after a successful commit, so a failure leaves the
      client's source data intact for a safe retry.
    """
    uid = str(claims["uid"])
    row = _get_or_create_profile(db, claims)
    is_empty_payload = (
        not payload.favorites
        and not payload.inquiries
        and not payload.sessions
        and not payload.turns
        and not payload.interactions
        and payload.profile is None
        and payload.preferences is None
        and payload.tracking_consent is None
    )
    if row.legacy_migrated_at is not None and is_empty_payload:
        return schemas.LegacyMigrationOut(migrated=False)

    counts = {"favorites": 0, "inquiries": 0, "sessions": 0, "turns": 0, "interactions": 0}
    try:
        existing_favs = {
            r.property_id
            for r in db.query(CustomerFavorite)
            .filter(CustomerFavorite.firebase_uid == uid)
            .all()
        }
        for pid in _clean_favorite_ids(payload.favorites):
            if pid not in existing_favs:
                db.add(CustomerFavorite(firebase_uid=uid, property_id=pid))
                existing_favs.add(pid)
                counts["favorites"] += 1

        for item in payload.inquiries:
            _row, created = _insert_inquiry(db, uid, item)
            if created:
                counts["inquiries"] += 1

        for s in payload.sessions:
            sess_id = (s.session_id or "").strip()[:128]
            if not sess_id:
                continue
            existing_sess = (
                db.query(CustomerChatSession)
                .filter(CustomerChatSession.firebase_uid == uid)
                .filter(CustomerChatSession.session_id == sess_id)
                .first()
            )
            if existing_sess is None:
                created_at = s.created_at or datetime.now(timezone.utc)
                sess = CustomerChatSession(
                    firebase_uid=uid,
                    session_id=sess_id,
                    title=(s.title or "LYKA chat").strip()[:120],
                    created_at=created_at,
                    updated_at=s.updated_at or created_at,
                )
                db.add(sess)
                db.flush()
                counts["sessions"] += 1

        for item in payload.turns:
            _row, created = _upsert_turn(db, uid, item)
            if created:
                counts["turns"] += 1

        for item in payload.interactions:
            _row, created = _insert_interaction(db, uid, item)
            if created:
                counts["interactions"] += 1

        profile = payload.profile
        if profile:
            if not row.name and profile.name:
                row.name = profile.name.strip()[:200] or None
            if not row.phone and profile.phone:
                row.phone = profile.phone.strip()[:50] or None
            if not row.city and profile.city:
                row.city = profile.city.strip()[:100] or None
            if not row.country and profile.country:
                row.country = profile.country.strip()[:100] or None
            if not row.discovery_source and profile.discovery_source:
                row.discovery_source = profile.discovery_source.strip()[:50] or None

        if payload.preferences is not None:
            cur_prefs = dict(row.preferences) if isinstance(row.preferences, dict) else {}
            for k, v in payload.preferences.model_dump().items():
                if v not in (None, [], ""):
                    if cur_prefs.get(k) in (None, [], ""):
                        cur_prefs[k] = v
                    elif k not in cur_prefs:
                        cur_prefs[k] = v
            row.preferences = cur_prefs

        if row.tracking_consent is None and payload.tracking_consent is not None:
            row.tracking_consent = bool(payload.tracking_consent)

        row.legacy_migrated_at = datetime.now(timezone.utc)
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Legacy migration failed for uid %s: %s", uid, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Legacy migration failed: {exc}",
        )

    return schemas.LegacyMigrationOut(migrated=True, **counts)
