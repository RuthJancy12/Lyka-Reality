"""
Server-side chat persistence helpers for LYKA Realty.

Every authenticated chat turn (user message and AI reply) is written
here — inside the POST /api/chat and POST /api/chat/stream request
handlers — so persistence is guaranteed regardless of whether the
frontend client is still connected.

Functions
---------
save_chat_turn(db, uid, session_id, role, text, property_ids=None,
               title_hint=None, message_ref=None)
    Upsert one chat turn into customer_chat_sessions /
    customer_chat_messages.  Idempotent when the caller supplies a
    ``message_ref``: retries with the same ref return the existing row
    instead of inserting a duplicate. The unique
    (firebase_uid, message_ref) constraint is the final safety net.

load_session_history(uid, session_id, limit=12)
    Return the last `limit` turns from the database, ordered oldest
    first, for session rehydration when the in-memory Ollama session is
    cold (server restart, eviction).

load_session_requirements(uid, session_id)
    Rebuild the per-conversation requirement dict from the stored user
    messages (no schema change, no cross-conversation bleed).

load_last_recommendations(uid, session_id, limit=12)
    Return the verified property records from the most recent assistant
    turns so follow-ups like "the second one" keep working after a cold
    start.

The helpers intentionally share the _upsert logic from customer.py to
keep a single source of truth for DB writes; they import models and
SessionLocal directly so they can open their own short-lived DB
connections from sync or async contexts.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

logger = logging.getLogger("lyka.chat_persistence")

# message_ref values originate from the client; accept only a bounded
# identifier alphabet so they can never inject log/JSON garbage.
_SAFE_REF = re.compile(r"^[A-Za-z0-9_.:\-]{1,64}$")

_REQUIREMENT_DEFAULTS: Dict[str, Any] = {
    "purpose": None,
    "location": None,
    "propertyType": None,
    "bhk": None,
    "min_budget": None,
    "budget": None,
    "timeline": None,
    "nearMetro": None,
    "beachfront": None,
    "mainRoad": None,
    "parking": None,
    "budgetFlexible": None,
    "amenities": [],
    "pendingTypeClarify": None,
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_ref(prefix: str = "msg") -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _clean_ref(value: Optional[str]) -> Optional[str]:
    text = (value or "").strip()
    return text if text and _SAFE_REF.match(text) else None


def _clean_property_ids(values: Optional[List[Any]]) -> List[str]:
    out: List[str] = []
    seen: set = set()
    for raw in (values or []):
        pid = str(raw).strip()[:64]
        if pid and pid not in seen:
            seen.add(pid)
            out.append(pid)
        if len(out) >= 50:
            break
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def save_chat_turn(
    db: Session,
    uid: str,
    session_id: str,
    role: str,
    text: str,
    property_ids: Optional[List[str]] = None,
    title_hint: Optional[str] = None,
    message_ref: Optional[str] = None,
) -> Any:
    """Persist one chat turn for an authenticated user.

    Parameters
    ----------
    db           : SQLAlchemy session (caller is responsible for commit).
    uid          : Firebase UID of the authenticated customer.
    session_id   : Conversation session id (must be non-empty).
    role         : ``"user"`` or ``"assistant"``.
    text         : Message content (truncated to 4 000 chars).
    property_ids : Property references attached to an assistant turn.
    title_hint   : When the session has no title yet, use this text as
                   the title (first user message works well).
    message_ref  : Optional client-supplied stable id. Supplying the same
                   ref on a retry is a no-op (returns the existing row),
                   which is what makes re-submission exactly-once.

    Returns the persisted ``CustomerChatMessage`` row (or the existing row
    when the ref was already stored), or ``None`` for invalid input.
    """
    from app.models import CustomerChatMessage, CustomerChatSession  # local to avoid circular

    sess_id = (session_id or "").strip()[:128]
    if not sess_id or not uid:
        return None

    clean_role = "assistant" if str(role or "").strip().lower() == "assistant" else "user"
    clean_text = (text or "").strip()[:4000]
    clean_pids = _clean_property_ids(property_ids)
    ref = _clean_ref(message_ref) or _new_ref("msg")

    # Idempotency fast path: a retry with the same ref never duplicates.
    existing = (
        db.query(CustomerChatMessage)
        .filter(
            CustomerChatMessage.firebase_uid == uid,
            CustomerChatMessage.message_ref == ref,
        )
        .first()
    )
    if existing is not None:
        return existing

    now = _utcnow()

    # Ensure session row exists.
    session_row = (
        db.query(CustomerChatSession)
        .filter(
            CustomerChatSession.firebase_uid == uid,
            CustomerChatSession.session_id == sess_id,
        )
        .first()
    )
    if session_row is None:
        title = (title_hint or text or "LYKA chat").strip()[:120] if clean_role == "user" else "LYKA chat"
        session_row = CustomerChatSession(
            firebase_uid=uid,
            session_id=sess_id,
            title=title or "LYKA chat",
            created_at=now,
            updated_at=now,
        )
        db.add(session_row)
        db.flush()
    else:
        # Update title to first user message when still default.
        if clean_role == "user" and (not session_row.title or session_row.title == "LYKA chat"):
            session_row.title = (text or "").strip()[:120] or "LYKA chat"
        session_row.updated_at = now

    row = CustomerChatMessage(
        firebase_uid=uid,
        session_id=sess_id,
        message_ref=ref,
        role=clean_role,
        text=clean_text,
        property_ids=clean_pids,
        created_at=now,
    )

    # The unique (firebase_uid, message_ref) constraint is the final guard
    # against two concurrent retries. A savepoint keeps the caller's
    # transaction usable if the insert loses that race.
    savepoint = db.begin_nested()
    try:
        db.add(row)
        db.flush()
        savepoint.commit()
    except IntegrityError:
        savepoint.rollback()
        existing = (
            db.query(CustomerChatMessage)
            .filter(
                CustomerChatMessage.firebase_uid == uid,
                CustomerChatMessage.message_ref == ref,
            )
            .first()
        )
        if existing is not None:
            return existing
        raise

    logger.debug(
        "Persisted %s turn for uid=%s session=%s len=%d pids=%d",
        clean_role, uid[:8], sess_id[:12], len(clean_text), len(clean_pids),
    )
    return row


def derive_requirements_from_texts(texts: List[str]) -> Dict[str, Any]:
    """Rebuild the requirement dict by replaying user messages in order.

    Uses the same deterministic extractor as the live chat, so a restored
    conversation asks no already-answered question and never flips
    Buy/Rent unless the customer actually said so. Nothing is invented:
    only explicit criteria are returned.
    """
    req = dict(_REQUIREMENT_DEFAULTS)
    req["amenities"] = []
    try:
        from app.services.ollama_chat_service import extract_criteria_from_text
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Requirement extraction unavailable: %s", exc)
        return req

    mapping = (
        ("purpose", "purpose"),
        ("location", "location"),
        ("property_type", "propertyType"),
        ("bedrooms", "bhk"),
        ("min_budget_aed", "min_budget"),
        ("max_budget_aed", "budget"),
        ("near_metro", "nearMetro"),
        ("near_beach", "beachfront"),
        ("main_road_access", "mainRoad"),
        ("parking", "parking"),
        ("timeline", "timeline"),
    )
    amenities: List[str] = []
    for text in texts or []:
        try:
            crit = extract_criteria_from_text(text or "")
        except Exception:
            continue
        for src, dst in mapping:
            value = crit.get(src)
            if value is not None:
                req[dst] = value
        for amenity in crit.get("amenities") or []:
            if amenity not in amenities:
                amenities.append(amenity)
        if crit.get("needs_type_clarify") and not req.get("propertyType"):
            req["pendingTypeClarify"] = True
        if req.get("propertyType"):
            req["pendingTypeClarify"] = None
    req["amenities"] = amenities
    return req


def load_session_requirements(uid: str, session_id: str) -> Dict[str, Any]:
    """Return the requirement state for one owned conversation.

    Derived from that session's user messages only, so opening an old
    conversation restores its own context and never another session's.
    """
    if not uid or not session_id:
        return dict(_REQUIREMENT_DEFAULTS)
    try:
        from app.database import SessionLocal
        from app.models import CustomerChatMessage

        db: Session = SessionLocal()
        try:
            rows = (
                db.query(CustomerChatMessage.text)
                .filter(
                    CustomerChatMessage.firebase_uid == uid,
                    CustomerChatMessage.session_id == session_id,
                    CustomerChatMessage.role == "user",
                )
                .order_by(CustomerChatMessage.created_at.asc(), CustomerChatMessage.id.asc())
                .limit(500)
                .all()
            )
        finally:
            db.close()
        return derive_requirements_from_texts([r[0] or "" for r in rows])
    except Exception as exc:
        logger.warning("load_session_requirements failed: %s", exc)
        return dict(_REQUIREMENT_DEFAULTS)


def load_last_recommendations(
    uid: str,
    session_id: str,
    limit: int = 12,
) -> List[Dict[str, Any]]:
    """Return verified property records from recent assistant turns.

    Only ids that resolve against the real dataset are returned, so a
    cold session can answer "the second property" without inventing data.
    """
    if not uid or not session_id:
        return []
    try:
        from app.database import SessionLocal
        from app.models import CustomerChatMessage
        from app.services.property_service import get_property_by_id

        db: Session = SessionLocal()
        try:
            rows = (
                db.query(CustomerChatMessage.property_ids)
                .filter(
                    CustomerChatMessage.firebase_uid == uid,
                    CustomerChatMessage.session_id == session_id,
                    CustomerChatMessage.role == "assistant",
                )
                .order_by(CustomerChatMessage.created_at.desc(), CustomerChatMessage.id.desc())
                .limit(25)
                .all()
            )
        finally:
            db.close()

        # Most recent recommendation list first, newest assistant turn
        # first. Deduplicate while preserving that recency order.
        ordered: List[str] = []
        for (pids,) in rows:
            if not isinstance(pids, list):
                continue
            for pid in pids:
                pid_str = str(pid).strip()
                if pid_str and pid_str not in ordered:
                    ordered.append(pid_str)
            if len(ordered) >= limit:
                break

        props: List[Dict[str, Any]] = []
        for pid in ordered[:limit]:
            prop = get_property_by_id(pid)
            if prop:
                props.append(prop)
        return props
    except Exception as exc:
        logger.warning("load_last_recommendations failed: %s", exc)
        return []


def load_session_history(
    uid: str,
    session_id: str,
    limit: int = 12,
) -> List[Dict[str, str]]:
    """Return the last `limit` conversation turns from the database.

    Returns a list of dicts with keys ``"user"`` and ``"ai"`` (paired),
    matching the ``OllamaChatSession.conversation_turns`` format.

    Turns that cannot be paired (e.g. consecutive user messages without
    an AI reply) are included as single-side entries with an empty
    counterpart so no DB content is silently dropped.
    """
    try:
        from app.database import SessionLocal
        from app.models import CustomerChatMessage

        db: Session = SessionLocal()
        try:
            rows = (
                db.query(CustomerChatMessage)
                .filter(
                    CustomerChatMessage.firebase_uid == uid,
                    CustomerChatMessage.session_id == session_id,
                )
                .order_by(CustomerChatMessage.created_at.asc(), CustomerChatMessage.id.asc())
                .limit(limit * 2)  # fetch more, then pair
                .all()
            )
        finally:
            db.close()

        # Pair consecutive user / assistant rows into turns.
        turns: List[Dict[str, str]] = []
        pending_user: Optional[str] = None
        for row in rows:
            if row.role == "user":
                if pending_user is not None:
                    # Two user messages in a row — emit unpaired.
                    turns.append({"user": pending_user, "ai": ""})
                pending_user = (row.text or "").strip()
            elif row.role == "assistant":
                turns.append({
                    "user": pending_user or "",
                    "ai": (row.text or "").strip(),
                })
                pending_user = None
        if pending_user is not None:
            turns.append({"user": pending_user, "ai": ""})

        return turns[-limit:]
    except Exception as exc:
        logger.warning("load_session_history failed: %s", exc)
        return []
