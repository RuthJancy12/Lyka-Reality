"""Append-only business audit logging.

The audit trail is intentionally separate from the lead-visible Activity
timeline: Activity explains what happened to a lead, while AuditEvent records
who performed a sensitive business action. Only bounded, non-secret context is
stored.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models import AuditEvent

logger = logging.getLogger("lyka.audit")


def actor_from(ctx: Optional[Dict[str, Any]], *, fallback_email: Optional[str] = None,
               fallback_role: Optional[str] = None) -> Dict[str, Any]:
    ctx = ctx or {}
    return {
        "email": ctx.get("email") or fallback_email,
        "uid": ctx.get("uid"),
        "role": ctx.get("role") or fallback_role,
    }


def log_audit(
    db: Session,
    actor: Optional[Dict[str, Any]],
    action: str,
    entity_type: str,
    entity_id: Any = None,
    *,
    lead_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
    commit: bool = True,
) -> Optional[AuditEvent]:
    """Persist one audit event without ever blocking the business operation.

    Callers should invoke this *after* their business row is committed. A
    failure here is logged but swallowed so an audit-storage problem cannot
    turn a successful assignment/call into a 500 for the user.
    """
    try:
        info = actor_from(actor)
        event = AuditEvent(
            actor_email=(info.get("email") or None),
            actor_uid=(info.get("uid") or None),
            actor_role=(info.get("role") or None),
            action=action[:64],
            entity_type=entity_type[:32],
            entity_id=(str(entity_id)[:64] if entity_id is not None else None),
            lead_id=lead_id,
            details=(json.dumps(details or {}, default=str)[:4000] if details else None),
        )
        db.add(event)
        if commit:
            db.commit()
            db.refresh(event)
        else:
            db.flush()
        return event
    except Exception:
        logger.exception("Audit event failed (action=%s entity=%s)", action, entity_type)
        try:
            db.rollback()
        except Exception:
            pass
        return None
