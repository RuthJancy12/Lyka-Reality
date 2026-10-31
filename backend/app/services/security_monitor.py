"""
LYKA Realty — Security Event Monitoring & Admin Alerts service.

Records structured security events (auth failures, unauthorized bursts,
role violations, ownership violations) with configurable thresholds,
deduplication and cooldowns. Safe context only — never logs passwords, Firebase
tokens, service-account keys, full chat transcripts, or unnecessary PII.

Alerts are surfaced through Admin-authorized endpoints; an optional server-side
webhook notification can be configured via ``SECURITY_ALERT_WEBHOOK_URL``.
"""
import hashlib
import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.database import Base  # noqa: F401  (ensures declarative registry is ready)
from app.models import SecurityEvent  # noqa: F401  (imported for registry + typing)


def _cfg_float(name: str, default: float) -> float:
    try:
        v = float(os.getenv(name, str(default)))
        return v if v > 0 else float(default)
    except Exception:
        return float(default)


def _cfg_str(name: str, default: str) -> str:
    v = os.getenv(name, "").strip()
    return v or default


def security_config() -> Dict[str, Any]:
    """Resolved, configurable security monitor settings (documented)."""
    return {
        "auth_failure_threshold": _cfg_float("SECURITY_AUTH_FAILURE_THRESHOLD", 5.0),
        "burst_window_seconds": _cfg_float("SECURITY_BURST_WINDOW_SECONDS", 60.0),
        "cooldown_seconds": _cfg_float("SECURITY_COOLDOWN_SECONDS", 300.0),
        "alert_severity": _cfg_str("SECURITY_ALERT_SEVERITY", "warning"),
        "webhook_url": _cfg_str("SECURITY_ALERT_WEBHOOK_URL", ""),
        "hash_salt": _cfg_str("SECURITY_HASH_SALT", "lyka-security-salt"),
        "critical_severity": _cfg_str("SECURITY_CRITICAL_SEVERITY", "critical"),
    }


def _hash_subject(subject: str, salt: str) -> str:
    return hashlib.sha256((salt + (subject or "unknown")).encode("utf-8")).hexdigest()[:32]


def _event_key(event_type: str, subject: str) -> str:
    return f"{event_type}:{subject}"


def record_event(
    db: Session,
    event_type: str,
    subject: str = "unknown",
    severity: str = "warning",
    resource: Optional[str] = None,
    method: Optional[str] = None,
    path: Optional[str] = None,
    status_code: Optional[int] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Optional[SecurityEvent]:
    """Record a security event with dedup + cooldown. Returns the event row."""
    cfg = security_config()
    now = datetime.now(timezone.utc)
    key = _event_key(event_type, _hash_subject(subject, cfg["hash_salt"]))

    latest = (
        db.query(SecurityEvent)
        .filter(SecurityEvent.event_type == event_type)
        .filter(SecurityEvent.subject_hash == _hash_subject(subject, cfg["hash_salt"]))
        .order_by(SecurityEvent.created_at.desc())
        .first()
    )
    cooldown_start = (latest.created_at - latest.last_seen_at).total_seconds() if latest else None
    within_cooldown = False
    if latest and latest.last_seen_at is not None:
        elapsed = (now - latest.last_seen_at).total_seconds()
        within_cooldown = elapsed < cfg["cooldown_seconds"]

    if latest is not None and within_cooldown:
        # Dedup / cooldown: bump the existing event instead of raising a new one.
        latest.count = (latest.count or 1) + 1
        latest.last_seen_at = now
        if severity in ("critical", "warning", "info"):
            latest.severity = severity if int(latest.count) >= int(cfg["auth_failure_threshold"]) else latest.severity
        db.commit()
        return latest

    event = SecurityEvent(
        event_type=event_type,
        severity=severity,
        subject_hash=_hash_subject(subject, cfg["hash_salt"]),
        subject_kind="ip" if not (subject or "").startswith("staff:") else "staff",
        resource=str(resource) if resource is not None else None,
        method=str(method) if method is not None else None,
        path=str(path) if path is not None else None,
        status_code=int(status_code) if status_code is not None else None,
        count=1,
        context=json.dumps(context or {}, default=str),
        first_seen_at=now,
        last_seen_at=now,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def record_auth_failure(
    db: Session,
    subject: str = "unknown",
    path: Optional[str] = None,
    method: Optional[str] = None,
    status_code: Optional[int] = None,
) -> Optional[SecurityEvent]:
    return record_event(
        db, event_type="auth_failure", subject=subject, severity="warning",
        resource=path, method=method, path=path, status_code=status_code,
        context={"reason": "authentication_failed"},
    )


def record_unauthorized_burst(
    db: Session,
    subject: str = "unknown",
    path: Optional[str] = None,
    method: Optional[str] = None,
    status_code: Optional[int] = None,
    threshold: Optional[float] = None,
) -> Optional[SecurityEvent]:
    cfg = security_config()
    thr = threshold if threshold is not None else cfg["auth_failure_threshold"]
    ev = record_event(
        db, event_type="unauthorized_burst", subject=subject, severity="warning",
        resource=path, method=method, path=path, status_code=status_code,
        context={"reason": "unauthorized_request_burst", "threshold": thr},
    )
    return ev


def record_role_violation(
    db: Session,
    subject: str = "unknown",
    role_attempted: Optional[str] = None,
    path: Optional[str] = None,
    method: Optional[str] = None,
    status_code: Optional[int] = None,
) -> Optional[SecurityEvent]:
    return record_event(
        db, event_type="role_violation", subject=subject, severity="critical",
        resource=path, method=method, path=path, status_code=status_code,
        context={"reason": "insufficient_role", "role_attempted": role_attempted},
    )


def record_ownership_violation(
    db: Session,
    subject: str = "unknown",
    lead_id: Optional[int] = None,
    path: Optional[str] = None,
    method: Optional[str] = None,
) -> Optional[SecurityEvent]:
    return record_event(
        db, event_type="ownership_violation", subject=subject, severity="critical",
        resource=str(lead_id) if lead_id is not None else None, method=method, path=path,
        context={"reason": "cross_user_record_access_attempt", "lead_id": lead_id},
    )


def get_events(
    db: Session,
    limit: int = 100,
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
) -> List[SecurityEvent]:
    q = db.query(SecurityEvent)
    if severity:
        q = q.filter(SecurityEvent.severity == severity)
    if event_type:
        q = q.filter(SecurityEvent.event_type == event_type)
    return (
        q.order_by(SecurityEvent.created_at.desc())
        .limit(max(1, min(int(limit), 500)))
        .all()
    )


def get_open_alerts(db: Session, limit: int = 50) -> List[SecurityEvent]:
    cfg = security_config()
    q = db.query(SecurityEvent).filter(SecurityEvent.resolved == False)  # noqa: E712
    if cfg["alert_severity"] in ("warning", "critical"):
        q = q.filter(SecurityEvent.severity == cfg["alert_severity"])
    return q.order_by(SecurityEvent.created_at.desc()).limit(max(1, min(int(limit), 200))).all()


_webhook_lock = threading.Lock()
_webhook_in_flight = False


def _send_webhook(event: Dict[str, Any]) -> None:
    url = security_config()["webhook_url"]
    if not url:
        return
    import urllib.request

    payload = json.dumps(event)
    try:
        req = urllib.request.Request(url, data=payload.encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
        threading.Thread(target=lambda: urllib.request.urlopen(req, timeout=5).read(), daemon=True).start()
    except Exception:
        pass


def notify_alert(event: SecurityEvent) -> None:
    """Optional server-side alert notification (only if SECURITY_ALERT_WEBHOOK_URL configured)."""
    cfg = security_config()
    if not cfg["webhook_url"]:
        return
    _send_webhook({
        "event_type": event.event_type,
        "severity": event.severity,
        "count": event.count,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "context": event.context,
    })
