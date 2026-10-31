"""
Centralized Notification Service for LYKA Realty.
Handles notification dispatch, deduplication, user preferences,
unread counts, role broadcast, and user isolation.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import or_, and_, func
from sqlalchemy.orm import Session

from app.models import Notification, NotificationPreference, StaffUser, utcnow

logger = logging.getLogger("lyka.notifications")


def create_notification(
    db: Session,
    recipient_email: Optional[str] = None,
    title: str = "",
    message: str = "",
    category: str = "system",
    notification_type: str = "system",
    recipient_user_id: Optional[str] = None,
    recipient_role: Optional[str] = None,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[Any] = None,
    action_url: Optional[str] = None,
    dedup_window_seconds: int = 120,
) -> Optional[Notification]:
    """
    Create a notification with deduplication and user preference enforcement.
    System/security alerts are always delivered regardless of preferences.
    """
    norm_email = recipient_email.strip().lower() if recipient_email else None
    entity_id_str = str(related_entity_id) if related_entity_id is not None else None

    # 1. Deduplication Check
    if dedup_window_seconds > 0 and (norm_email or recipient_role):
        cutoff = utcnow() - timedelta(seconds=dedup_window_seconds)
        dedup_query = db.query(Notification).filter(
            Notification.title == title,
            Notification.created_at >= cutoff,
        )
        if norm_email:
            dedup_query = dedup_query.filter(func.lower(Notification.recipient_email) == norm_email)
        elif recipient_role:
            dedup_query = dedup_query.filter(Notification.recipient_role == recipient_role)

        if entity_id_str is not None:
            dedup_query = dedup_query.filter(Notification.related_entity_id == entity_id_str)

        existing = dedup_query.first()
        if existing:
            logger.info("Suppressed duplicate notification within %ds: %s to %s", dedup_window_seconds, title, norm_email or recipient_role)
            return existing

    # 2. Preference Check (except system / security)
    if norm_email and category not in ("system", "security"):
        prefs = db.query(NotificationPreference).filter(func.lower(NotificationPreference.user_email) == norm_email).first()
        if prefs:
            pref_attr = category.lower()
            if hasattr(prefs, pref_attr) and getattr(prefs, pref_attr) is False:
                logger.info("Notification suppressed by user preference [%s] for %s", category, norm_email)
                return None

    # 3. Create Notification
    notif = Notification(
        recipient_email=norm_email,
        recipient_user_id=recipient_user_id,
        recipient_role=recipient_role,
        title=title,
        message=message,
        category=category,
        notification_type=notification_type,
        related_entity_type=related_entity_type,
        related_entity_id=entity_id_str,
        link_url=action_url,
        action_url=action_url,
        is_read=False,
        created_at=utcnow(),
    )
    db.add(notif)
    try:
        db.commit()
        db.refresh(notif)
    except Exception as exc:
        db.rollback()
        logger.error("Failed to commit notification: %s", exc)
        return None

    return notif


def notify_admins(
    db: Session,
    title: str,
    message: str,
    category: str = "system",
    notification_type: str = "system",
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[Any] = None,
    action_url: Optional[str] = None,
    dedup_window_seconds: int = 60,
) -> List[Notification]:
    """
    Deliver notification to all active administrators.
    Also creates a role='admin' broadcast record if no admin staff exist.
    """
    admin_staff = (
        db.query(StaffUser)
        .filter(
            StaffUser.role.in_(["admin", "superadmin"]),
            StaffUser.is_active == True,  # noqa: E712
        )
        .all()
    )

    created_notifs = []
    if admin_staff:
        for admin in admin_staff:
            notif = create_notification(
                db=db,
                recipient_email=admin.email,
                recipient_role=admin.role,
                title=title,
                message=message,
                category=category,
                notification_type=notification_type,
                related_entity_type=related_entity_type,
                related_entity_id=related_entity_id,
                action_url=action_url,
                dedup_window_seconds=dedup_window_seconds,
            )
            if notif:
                created_notifs.append(notif)
    else:
        # Broadcast fallback
        notif = create_notification(
            db=db,
            recipient_email=None,
            recipient_role="admin",
            title=title,
            message=message,
            category=category,
            notification_type=notification_type,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            action_url=action_url,
            dedup_window_seconds=dedup_window_seconds,
        )
        if notif:
            created_notifs.append(notif)

    return created_notifs


def get_user_notifications(
    db: Session,
    email: str,
    role: str,
    uid: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 50,
) -> List[Notification]:
    """
    Retrieve notifications strictly isolated to the caller.
    Matches direct email, Firebase UID, or broadcast to their role / all (where recipient_email is null).
    """
    norm_email = email.strip().lower()

    filter_cond = or_(
        func.lower(Notification.recipient_email) == norm_email,
        Notification.recipient_user_id == uid if uid else False,
        and_(
            Notification.recipient_email.is_(None),
            or_(
                Notification.recipient_role == role,
                Notification.recipient_role == "all",
            ),
        ),
    )

    query = db.query(Notification).filter(filter_cond)

    if unread_only:
        query = query.filter(Notification.is_read == False)  # noqa: E712

    return query.order_by(Notification.created_at.desc()).limit(limit).all()


def get_unread_count(
    db: Session,
    email: str,
    role: str,
    uid: Optional[str] = None,
) -> int:
    """
    Get current unread notification count for user.
    """
    norm_email = email.strip().lower()

    filter_cond = and_(
        Notification.is_read == False,  # noqa: E712
        or_(
            func.lower(Notification.recipient_email) == norm_email,
            Notification.recipient_user_id == uid if uid else False,
            and_(
                Notification.recipient_email.is_(None),
                or_(
                    Notification.recipient_role == role,
                    Notification.recipient_role == "all",
                ),
            ),
        ),
    )
    return db.query(func.count(Notification.id)).filter(filter_cond).scalar() or 0


def mark_notification_read(
    db: Session,
    notification_id: int,
    email: str,
    role: Optional[str] = None,
    uid: Optional[str] = None,
) -> Optional[Notification]:
    """
    Mark a specific notification as read, enforcing authorization.
    """
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n:
        return None

    norm_email = email.strip().lower()
    notif_email = n.recipient_email.strip().lower() if n.recipient_email else None

    # Check isolation / ownership
    is_owner = (
        (notif_email and notif_email == norm_email)
        or (n.recipient_user_id and uid and n.recipient_user_id == uid)
        or (not notif_email and n.recipient_role in (role, "all"))
    )

    if not is_owner:
        return None

    if not n.is_read:
        n.is_read = True
        n.read_at = utcnow()
        db.commit()
        db.refresh(n)

    return n


def mark_all_read(
    db: Session,
    email: str,
    role: Optional[str] = None,
    uid: Optional[str] = None,
) -> int:
    """
    Mark all unread notifications for this user as read.
    """
    norm_email = email.strip().lower()

    filter_cond = and_(
        Notification.is_read == False,  # noqa: E712
        or_(
            func.lower(Notification.recipient_email) == norm_email,
            Notification.recipient_user_id == uid if uid else False,
            and_(
                Notification.recipient_email.is_(None),
                or_(
                    Notification.recipient_role == role,
                    Notification.recipient_role == "all",
                ),
            ),
        ),
    )

    now = utcnow()
    rows_updated = (
        db.query(Notification)
        .filter(filter_cond)
        .update(
            {"is_read": True, "read_at": now},
            synchronize_session=False,
        )
    )
    db.commit()
    return rows_updated


def get_or_create_preferences(
    db: Session,
    email: str,
    role: str = "customer",
) -> NotificationPreference:
    """
    Retrieve or create default notification preferences for an email.
    """
    norm_email = email.strip().lower()
    prefs = db.query(NotificationPreference).filter(func.lower(NotificationPreference.user_email) == norm_email).first()
    if not prefs:
        prefs = NotificationPreference(
            user_email=norm_email,
            user_role=role,
            recommendations=True,
            appointments=True,
            inquiries=True,
            followups=True,
            announcements=True,
            browser_push=False,
            created_at=utcnow(),
        )
        db.add(prefs)
        try:
            db.commit()
            db.refresh(prefs)
        except Exception:
            db.rollback()
            prefs = db.query(NotificationPreference).filter(func.lower(NotificationPreference.user_email) == norm_email).first()

    return prefs


def update_preferences(
    db: Session,
    email: str,
    updates: Dict[str, Any],
) -> NotificationPreference:
    """
    Update user notification preferences.
    """
    prefs = get_or_create_preferences(db, email)
    for key, val in updates.items():
        if val is not None and hasattr(prefs, key) and key not in ("id", "user_email", "created_at"):
            setattr(prefs, key, bool(val))

    prefs.updated_at = utcnow()
    db.commit()
    db.refresh(prefs)
    return prefs

