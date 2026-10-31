"""
Admin-only security event & alert endpoints.

Provides:
  - GET /api/security/events    — list security events (admin-only)
  - GET /api/security/alerts    — open alerts (admin-only)
  - POST /api/security/events/{id}/resolve — mark resolved (admin-only)

All endpoints require the `admin` role resolved from a VERIFIED Firebase ID
token. No customer-facing route exposes these.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SecurityEvent
from app.schemas import SecurityAlertsResponse, SecurityEventOut
from app.services import security_monitor
from app.services.roles import require_admin

router = APIRouter(prefix="/api/security", tags=["security"])


@router.get("/events", response_model=List[SecurityEventOut], summary="Security events (admin)")
def list_security_events(
    event_type: Optional[str] = Query(None, description="Filter: auth_failure | unauthorized_burst | role_violation | ownership_violation"),
    severity: Optional[str] = Query(None, description="Filter: info | warning | critical"),
    limit: int = Query(100, ge=1, le=500),
    ctx: Dict[str, Any] = Depends(require_admin),
    db: Session = Depends(get_db),
):
    events = security_monitor.get_events(db, limit=limit, severity=severity, event_type=event_type)
    out: List[SecurityEventOut] = []
    for e in events:
        out.append(SecurityEventOut(
            id=e.id,
            event_type=e.event_type,
            severity=e.severity,
            subject_hash=e.subject_hash,
            subject_kind=e.subject_kind,
            resource=e.resource,
            method=e.method,
            path=e.path,
            status_code=e.status_code,
            count=e.count,
            context=e.context,
            first_seen_at=e.first_seen_at,
            last_seen_at=e.last_seen_at,
            resolved=e.resolved,
            created_at=e.created_at,
        ))
    return out


@router.get("/alerts", response_model=SecurityAlertsResponse, summary="Open security alerts (admin)")
def get_security_alerts(
    ctx: Dict[str, Any] = Depends(require_admin),
    db: Session = Depends(get_db),
):
    events = security_monitor.get_open_alerts(db, limit=50)
    return SecurityAlertsResponse(
        alerts=[
            SecurityEventOut(
                id=e.id,
                event_type=e.event_type,
                severity=e.severity,
                subject_hash=e.subject_hash,
                subject_kind=e.subject_kind,
                resource=e.resource,
                method=e.method,
                path=e.path,
                status_code=e.status_code,
                count=e.count,
                context=e.context,
                first_seen_at=e.first_seen_at,
                last_seen_at=e.last_seen_at,
                resolved=e.resolved,
                created_at=e.created_at,
            )
            for e in events
        ],
        total=len(events),
        threshold=security_monitor.security_config()["auth_failure_threshold"],
    )


@router.post("/events/{event_id:int}/resolve", response_model=SecurityEventOut, summary="Resolve a security event (admin)")
def resolve_security_event(
    event_id: int,
    ctx: Dict[str, Any] = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ev = db.query(SecurityEvent).filter(SecurityEvent.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Security event not found")
    ev.resolved = True
    db.commit()
    db.refresh(ev)
    return SecurityEventOut(
        id=ev.id,
        event_type=ev.event_type,
        severity=ev.severity,
        subject_hash=ev.subject_hash,
        subject_kind=ev.subject_kind,
        resource=ev.resource,
        method=ev.method,
        path=ev.path,
        status_code=ev.status_code,
        count=ev.count,
        context=ev.context,
        first_seen_at=ev.first_seen_at,
        last_seen_at=ev.last_seen_at,
        resolved=ev.resolved,
        created_at=ev.created_at,
    )
