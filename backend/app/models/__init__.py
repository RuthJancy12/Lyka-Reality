"""
SQLAlchemy ORM models for the LYKA Realty CRM system.
Models: Lead, CRMProperty, Recommendation, Activity
"""
import json
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey,
    Integer, String, Text, JSON, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CRMProperty(Base):
    """
    Fictional Dubai properties for the CRM seed dataset.
    Separate from the CSV-backed search used by the public site.
    """
    __tablename__ = "crm_properties"

    id = Column(Integer, primary_key=True, index=True)
    ref_code = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    property_type = Column(String(50), nullable=False)  # Apartment, Villa, Penthouse, Townhouse
    listing_type = Column(String(10), nullable=False)   # Sale | Rent
    location = Column(String(100), nullable=False, index=True)
    community = Column(String(100), nullable=True)
    bedrooms = Column(Integer, nullable=False)
    bathrooms = Column(Integer, nullable=False)
    size_sqft = Column(Integer, nullable=False)
    price_sale = Column(Float, nullable=True)           # AED
    price_rent_monthly = Column(Float, nullable=True)  # AED/month
    description = Column(Text, nullable=True)
    amenities = Column(JSON, default=list)              # List[str]
    near_metro = Column(Boolean, default=False)
    near_beach = Column(Boolean, default=False)
    view = Column(String(100), nullable=True)
    is_available = Column(Boolean, default=True)
    status = Column(String(50), default="Available", nullable=True)
    is_featured = Column(Boolean, default=False, nullable=True)
    image_url = Column(String(500), nullable=True)
    image_gallery = Column(JSON, default=list, nullable=True)
    verification_status = Column(String(50), default="verified", nullable=True)
    document_status = Column(String(50), default="approved", nullable=True)
    permit_number = Column(String(100), nullable=True)
    price_history = Column(JSON, default=list, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    recommendations = relationship("Recommendation", back_populates="property")


class Lead(Base):
    """Customer enquiry lead with AI-extracted requirements and scoring."""
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)

    # Contact info
    customer_name = Column(String(200), nullable=True)
    contact_email = Column(String(200), nullable=True, index=True)
    contact_phone = Column(String(50), nullable=True)

    # Verified listing this enquiry is about (LYK-* catalogue id or CRM-* ref).
    # Nullable because general enquiries are not tied to a property. Set from
    # the public enquiry payload; legacy rows are backfilled from raw text.
    property_ref = Column(String(64), nullable=True, index=True)

    # Property requirements (AI-extracted)
    lead_type = Column(String(10), nullable=True)        # buyer | renter
    property_type = Column(String(50), nullable=True)
    location = Column(String(100), nullable=True, index=True)
    bedrooms = Column(Integer, nullable=True)
    budget_min = Column(Float, nullable=True)
    budget_max = Column(Float, nullable=True)
    purpose = Column(String(100), nullable=True)         # investment, own-use
    amenities = Column(JSON, default=list)               # List[str]
    timeline_days = Column(Integer, nullable=True)
    missing_fields = Column(JSON, default=list)          # List[str]

    # Scoring
    priority_score = Column(Integer, default=0)
    priority_label = Column(String(10), default="Low")   # High | Medium | Low
    score_breakdown = Column(JSON, default=dict)          # {criterion: points}

    # Workflow
    status = Column(String(20), default="new", index=True)
    # new | contacted | qualified | closed | lost

    # ── Transparent Lead Score (0–100, Hot/Warm/Cold) — ADDITIVE fields ──
    # Computed by app.services.lead_scoring_service (documented rule-based
    # engine). Human overrides live here too and are recorded with who/when/why.
    lead_score = Column(Integer, nullable=True)          # effective score (override wins)
    lead_score_band = Column(String(16), nullable=True)  # Hot | Warm | Cold | None
    lead_score_reasons = Column(JSON, nullable=True)     # list of {signal, points, detail}
    lead_score_updated_at = Column(DateTime, nullable=True)
    lead_score_source = Column(String(20), nullable=True)  # computed | override | None
    # Human override (manager+). Recorded with identity + reason; never guessed.
    lead_score_override = Column(Integer, nullable=True)
    lead_score_override_reason = Column(String(300), nullable=True)
    lead_score_override_by = Column(String(200), nullable=True)  # staff uid/email who changed it
    lead_score_override_at = Column(DateTime, nullable=True)

    # Raw data
    raw_enquiry_text = Column(Text, nullable=False)
    agent_notes = Column(Text, nullable=True)

    # Lead source (UTM + referrer captured at enquiry time; all nullable —
    # absent attribution stays NULL, never invented).
    utm_source = Column(String(255), nullable=True)
    utm_medium = Column(String(255), nullable=True)
    utm_campaign = Column(String(255), nullable=True)
    referrer = Column(String(500), nullable=True)
    # Self-reported discovery source ("How did you hear about LYKA
    # Realty?"). Stored separately from automatic UTM/referrer attribution;
    # never guessed, never defaulted.
    discovery_source = Column(String(50), nullable=True)

    # Lead Continuity & Response Ownership
    original_assigned_email = Column(String(200), nullable=True, index=True)
    current_responsible_email = Column(String(200), nullable=True, index=True)
    covering_agent_email = Column(String(200), nullable=True, index=True)
    coverage_status = Column(String(50), default="normal", nullable=False, index=True)
    next_followup_at = Column(DateTime, nullable=True)
    last_contacted_at = Column(DateTime, nullable=True)
    last_call_outcome = Column(String(100), nullable=True)
    callback_requested = Column(Boolean, default=False, nullable=False)
    do_not_disturb = Column(Boolean, default=False, nullable=False, index=True)

    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    recommendations = relationship(
        "Recommendation", back_populates="lead",
        cascade="all, delete-orphan",
        order_by="Recommendation.match_score.desc()"
    )
    activities = relationship(
        "Activity", back_populates="lead",
        cascade="all, delete-orphan",
        order_by="Activity.created_at.desc()"
    )


class Recommendation(Base):
    """Property recommendation generated for a lead."""
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("crm_properties.id"), nullable=False, index=True)
    match_score = Column(Float, nullable=False)          # 0.0 – 100.0
    match_explanation = Column(Text, nullable=True)
    mismatches = Column(JSON, default=list)              # List[str]
    # True when this row is a nearby-community alternative (not an exact
    # location match). The UI renders a "Nearby alternative" label for it.
    is_nearby = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    lead = relationship("Lead", back_populates="recommendations")
    property = relationship("CRMProperty", back_populates="recommendations")


class Activity(Base):
    """Follow-up activities logged against a lead."""
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    activity_type = Column(String(50), nullable=False)
    # enquiry_received | ai_analysed | agent_contacted | recommendation_sent |
    # note_added | status_changed | property_viewed
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)

    lead = relationship("Lead", back_populates="activities")


# ─── Staff & roles (PRD: exactly one Admin + Manager, Sales Manager, Salesperson) ──
# Customers are Firebase Auth users and are NOT rows here: any verified email
# without an active staff row resolves to role "customer". The single-admin
# invariant is enforced in code (routers/staff.py + create_admin.py), because
# SQLite has no portable partial-unique constraint.

STAFF_ROLES = ("admin", "hrms_admin", "sales_agent", "salesperson", "sales_manager", "manager")
ACTIVE_STAFF_ROLES = ("admin", "hrms_admin", "sales_agent", "salesperson")


class StaffUser(Base):
    """Internal team member. Role determines backend permissions (see services/roles.py)."""
    __tablename__ = "staff_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    # Stable Firebase UID, bound automatically on the staff member's first
    # verified sign-in. Identity resolution prefers UID and falls back to
    # email, so records survive email changes.
    firebase_uid = Column(String(128), unique=True, nullable=True, index=True)
    name = Column(String(200), nullable=False)
    role = Column(String(20), nullable=False, index=True)
    # admin | manager | sales_manager | salesperson
    is_active = Column(Boolean, default=True, nullable=False)
    # Direct manager's staff email (team relationship). Used to scope a
    # sales manager to their authorized team. Null = no team assignment.
    manager_email = Column(String(200), nullable=True, index=True)
    last_login_at = Column(DateTime, nullable=True)
    # HRMS Employee fields
    employee_id = Column(String(50), unique=True, nullable=True, index=True)
    department = Column(String(100), nullable=True, default="Sales", index=True)
    designation = Column(String(100), nullable=True, default="Sales Consultant")
    phone = Column(String(50), nullable=True)
    joining_date = Column(DateTime, nullable=True, default=utcnow)
    employment_status = Column(String(50), nullable=True, default="full_time")  # full_time, part_time, probation, terminated
    salary_basic_aed = Column(Float, nullable=True, default=12000.0)
    salary_allowances_aed = Column(Float, nullable=True, default=3000.0)
    salary_deductions_aed = Column(Float, nullable=True, default=0.0)
    availability_status = Column(String(50), default="available", nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def get_effective_availability(self, db_session, on_date=None):
        if not self.is_active:
            return "inactive"
        check_d = on_date or datetime.now(timezone.utc).date()
        try:
            has_leave = db_session.query(LeaveRequest).filter(
                LeaveRequest.staff_user_id == self.id,
                LeaveRequest.status == "approved",
                LeaveRequest.start_date <= check_d,
                LeaveRequest.end_date >= check_d,
            ).first()
            if has_leave:
                return "on_leave"
        except Exception:
            pass
        return getattr(self, "availability_status", "available") or "available" 

    # HRMS Relationships
    attendance_records = relationship("AttendanceRecord", back_populates="staff_user", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequest", back_populates="staff_user", cascade="all, delete-orphan")
    leave_balances = relationship("LeaveBalance", back_populates="staff_user", cascade="all, delete-orphan")
    payslips = relationship("Payslip", back_populates="staff_user", cascade="all, delete-orphan")
    documents = relationship("EmployeeDocument", back_populates="staff_user", cascade="all, delete-orphan")
    performance_reviews = relationship("PerformanceReview", back_populates="staff_user", cascade="all, delete-orphan")
    hr_requests = relationship("HRRequest", back_populates="staff_user", cascade="all, delete-orphan")


class Assignment(Base):
    """Lead routed to a staff member by a manager (or admin)."""
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    # Stable assignee UID snapshot (null for rows created before UID binding).
    staff_uid = Column(String(128), nullable=True, index=True)
    assigned_by = Column(String(200), nullable=False)
    status = Column(String(20), default="open", nullable=False)
    # open | in_progress | closed
    original_staff_email = Column(String(200), nullable=True, index=True)
    is_temporary_coverage = Column(Boolean, default=False, nullable=False, index=True)
    coverage_reason = Column(String(255), nullable=True)
    coverage_start = Column(Date, nullable=True)
    coverage_end = Column(Date, nullable=True)
    assignment_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class CustomerProfile(Base):
    """Self-service customer profile, owned by exactly one Firebase UID.

    Identity (firebase_uid, email) always comes from the verified token —
    never from request bodies. Permitted self-service fields only; role is
    resolved via staff rows (non-staff => customer) and is never stored
    or accepted here. Acquisition attribution uses first-touch-wins.
    """
    __tablename__ = "customer_profiles"

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(200), nullable=True, index=True)
    name = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    city = Column(String(100), nullable=True)
    # Customer country (optional, self-reported; additive nullable column).
    country = Column(String(100), nullable=True)
    preferences = Column(JSON, default=dict)
    # {locations, propertyType, bedrooms, budgetMin, budgetMax, purpose,
    #  timeline_days}
    utm_source = Column(String(255), nullable=True)
    utm_medium = Column(String(255), nullable=True)
    utm_campaign = Column(String(255), nullable=True)
    referrer = Column(String(500), nullable=True)
    # Self-reported discovery source ("How did you hear about LYKA
    # Realty?"). Separate from automatic UTM/referrer attribution and
    # governed by first-touch-wins in routers/customer.py.
    discovery_source = Column(String(50), nullable=True)
    # Privacy preference: NULL = never asked, True = opted in, False = declined.
    tracking_consent = Column(Boolean, nullable=True)
    # One-time marker proving owner-matched legacy browser/RTDB data has been
    # copied into the backend. NULL = not migrated yet (safe to retry).
    legacy_migrated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class CustomerFavorite(Base):
    """Saved property ID owned by exactly one verified Firebase UID.

    Small, explicit rows (no JSON blob) so ownership checks are a simple
    uid filter and duplicated IDs are impossible.
    """
    __tablename__ = "customer_favorites"
    __table_args__ = (
        UniqueConstraint("firebase_uid", "property_id", name="uq_customer_favorite"),
    )

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String(128), nullable=False, index=True)
    property_id = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, index=True)


class CustomerInquiry(Base):
    """Customer-owned enquiry record (mirrors the chat inquiry card).

    The CRM-facing Lead row remains the source for staff workflows; this table
    is the customer's own read-only history, filtered by verified uid.
    """
    __tablename__ = "customer_inquiries"
    __table_args__ = (
        UniqueConstraint("firebase_uid", "record_ref", name="uq_customer_inquiry_ref"),
    )

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String(128), nullable=False, index=True)
    # Client/legacy document id. Never trusted for ownership: uid always wins.
    record_ref = Column(String(64), nullable=False, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id = Column(String(128), nullable=True, index=True)
    property_id = Column(String(64), nullable=False, index=True)
    property_title = Column(String(255), nullable=False)
    property_location = Column(String(100), nullable=True)
    property_type = Column(String(50), nullable=True)
    listing_type = Column(String(20), nullable=True)
    price_aed = Column(Float, default=0)
    bedrooms = Column(Integer, default=0)
    size_sqft = Column(Float, default=0)
    availability = Column(String(50), nullable=True)
    status = Column(String(20), default="Submitted", nullable=False)  # Submitted | Contacted
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class CustomerChatSession(Base):
    """Authenticated conversation container owned by one Firebase UID."""
    __tablename__ = "customer_chat_sessions"
    __table_args__ = (
        UniqueConstraint("firebase_uid", "session_id", name="uq_customer_chat_session"),
    )

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String(128), nullable=False, index=True)
    session_id = Column(String(128), nullable=False, index=True)
    title = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class CustomerChatMessage(Base):
    """One authenticated chat turn. Text is capped at the API limit."""
    __tablename__ = "customer_chat_messages"
    __table_args__ = (
        UniqueConstraint("firebase_uid", "message_ref", name="uq_customer_chat_message"),
    )

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String(128), nullable=False, index=True)
    session_id = Column(String(128), nullable=False, index=True)
    message_ref = Column(String(64), nullable=False, index=True)
    role = Column(String(16), nullable=False)  # user | assistant
    text = Column(Text, nullable=False)
    property_ids = Column(JSON, default=list)
    created_at = Column(DateTime, default=utcnow, index=True)


class CustomerInteraction(Base):
    """Consent-gated behavioral event (views/searches) owned by one UID."""
    __tablename__ = "customer_interactions"
    __table_args__ = (
        UniqueConstraint("firebase_uid", "event_ref", name="uq_customer_interaction"),
    )

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String(128), nullable=False, index=True)
    event_ref = Column(String(64), nullable=False, index=True)
    kind = Column(String(16), nullable=False)  # view | search | filter | enquiry
    property_id = Column(String(64), nullable=True)
    location = Column(String(100), nullable=True)
    property_type = Column(String(50), nullable=True)
    bedrooms = Column(Integer, nullable=True)
    query = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)


class FollowUp(Base):
    """Follow-up note on a lead.

    Notes remain append-only for their content, but a follow-up can now be
    explicitly completed (or reopened) so completion rates are measured from
    real persisted state rather than inferred from timestamps.
    """
    __tablename__ = "follow_ups"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    staff_uid = Column(String(128), nullable=True, index=True)
    note = Column(Text, nullable=False)
    next_action_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True, index=True)
    completed_by = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)


class Viewing(Base):
    """Scheduled property viewing for a lead."""
    __tablename__ = "viewings"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    property_ref = Column(String(20), nullable=False)
    # CRM ref_code (CRM-*) or CSV property_id (LYK-*) — always a real record.
    staff_email = Column(String(200), nullable=False, index=True)
    staff_uid = Column(String(128), nullable=True, index=True)
    scheduled_at = Column(DateTime, nullable=False, index=True)
    status = Column(String(20), default="scheduled", nullable=False)
    # scheduled | completed | cancelled | no_show
    notes = Column(Text, nullable=True)
    feedback = Column(Text, nullable=True)
    interest_level = Column(String(50), nullable=True)
    rejection_reasons = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class SecurityEvent(Base):
    """Structured security event (auth failures / bursts / violations).

    Additive table. Safe context only — never stores tokens, passwords, chat
    transcripts or unnecessary PII. Subject is stored hashed (see security_monitor).
    """
    __tablename__ = "security_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)  # auth_failure | unauthorized_burst | role_violation | ownership_violation
    severity = Column(String(16), nullable=False, default="warning")  # info | warning | critical
    subject_hash = Column(String(64), nullable=False, index=True)
    subject_kind = Column(String(16), nullable=True)  # ip | staff
    resource = Column(String(200), nullable=True)
    method = Column(String(16), nullable=True)
    path = Column(String(255), nullable=True)
    status_code = Column(Integer, nullable=True)
    count = Column(Integer, nullable=False, default=1)  # dedup counter
    context = Column(String(1000), nullable=True)  # JSON string, safe context only
    first_seen_at = Column(DateTime, nullable=False, default=utcnow)
    last_seen_at = Column(DateTime, nullable=False, default=utcnow)
    resolved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, index=True)


class CallLog(Base):
    """A scheduled customer call and its independently recorded outcome.

    A scheduled call is deliberately NOT an attempted call: `attempted_at`
    and `connected_at` stay NULL until a staff member records the actual
    attempt/connection. Analytics therefore cannot count a future
    appointment as activity.
    """
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    staff_uid = Column(String(128), nullable=True, index=True)
    scheduled_at = Column(DateTime, nullable=False, index=True)
    attempted_at = Column(DateTime, nullable=True, index=True)
    connected_at = Column(DateTime, nullable=True, index=True)
    status = Column(String(32), default="scheduled", nullable=False, index=True)
    # scheduled | attempted_no_answer | connected | follow_up_required |
    # site_visit_scheduled | completed | lost
    duration_minutes = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    next_follow_up_at = Column(DateTime, nullable=True)
    attempt_number = Column(Integer, default=1, nullable=True)
    is_first_call = Column(Boolean, default=False, nullable=True)
    customer_response = Column(Text, nullable=True)
    recommended_action = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class AuditEvent(Base):
    """Append-only business audit trail.

    Stores the who/what/when/which-record for important changes. Details are
    deliberately bounded, non-secret JSON (statuses, IDs, outcomes) — never
    passwords, tokens, chat transcripts, or full customer records.
    """
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    actor_email = Column(String(200), nullable=True, index=True)
    actor_uid = Column(String(128), nullable=True)
    actor_role = Column(String(20), nullable=True)
    action = Column(String(64), nullable=False, index=True)
    entity_type = Column(String(32), nullable=False, index=True)
    entity_id = Column(String(64), nullable=True, index=True)
    lead_id = Column(Integer, nullable=True, index=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)


class PerformanceTarget(Base):
    """Monthly business target for one metric (admin/manager configured)."""
    __tablename__ = "performance_targets"

    id = Column(Integer, primary_key=True, index=True)
    metric = Column(String(32), nullable=False, index=True)
    period = Column(String(7), nullable=False, index=True)  # YYYY-MM
    target_value = Column(Float, nullable=False)
    updated_by = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


# ─── Property advertising & analytics ───────────────────────────────────────
# Additive tables. They reference existing listings by their stable string id
# (CSV LYK-* or CRM ref_code) so no property/inventory row is duplicated or
# rewritten. Catalogue rows are mirrored into `property_ads` for one indexed
# place to filter/sort/paginate advertisements server-side at 5,000+ rows.

class PropertyAd(Base):
    """One advertising record for an existing property listing.

    `property_ref` is the existing public id, never a new id. Rows are
    idempotently mirrored from the real CSV catalogue and CRM inventory at
    startup; deactivating an ad pauses its public catalogue visibility.
    """

    __tablename__ = "property_ads"
    __table_args__ = (
        Index("ix_property_ads_active_published", "is_active", "published_at"),
        Index("ix_property_ads_type_price", "property_type", "price_aed"),
        Index("ix_property_ads_location_active", "location", "is_active"),
        Index("ix_property_ads_project", "project"),
    )

    id = Column(Integer, primary_key=True, index=True)
    property_ref = Column(String(64), unique=True, nullable=False, index=True)
    source = Column(String(16), nullable=False, default="dataset", index=True)  # dataset | crm
    title = Column(String(255), nullable=False)
    location = Column(String(100), nullable=False, index=True)
    project = Column(String(120), nullable=True)  # community / project name
    property_type = Column(String(50), nullable=False, index=True)
    listing_type = Column(String(10), nullable=False, index=True)  # Sale | Rent
    bedrooms = Column(Integer, nullable=True)
    bathrooms = Column(Integer, nullable=True)
    size_sqft = Column(Integer, nullable=True)
    price_aed = Column(Float, nullable=False, default=0, index=True)
    availability = Column(String(50), nullable=True, index=True)
    image_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    published_at = Column(DateTime, nullable=False, default=utcnow, index=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class PropertyAdEvent(Base):
    """A real, deduplicated advertising interaction.

    event_type: impression | view | whatsapp_click | enquiry |
                site_visit_scheduled | booking
    Only impression/view/whatsapp_click are accepted from the public API.
    Enquiry/visit/booking rows are written by the authenticated backend flow
    that owns the underlying Lead/Viewing record, so the same conversion can
    never be counted twice. `dedupe_key` is unique and is the idempotency key.
    """

    __tablename__ = "property_ad_events"
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_property_ad_event_dedupe"),
        Index("ix_property_ad_events_ref_type_time", "property_ref", "event_type", "occurred_at"),
        Index("ix_property_ad_events_type_time", "event_type", "occurred_at"),
        Index("ix_property_ad_events_visitor_time", "visitor_hash", "occurred_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    property_ref = Column(String(64), nullable=False, index=True)
    event_type = Column(String(32), nullable=False, index=True)
    # SHA-256 of an anonymous browser id (never an email/phone/IP in clear).
    visitor_hash = Column(String(64), nullable=True, index=True)
    occurred_at = Column(DateTime, nullable=False, default=utcnow, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    viewing_id = Column(Integer, ForeignKey("viewings.id", ondelete="SET NULL"), nullable=True, index=True)
    dedupe_key = Column(String(160), nullable=False)
    context = Column(String(40), nullable=True)  # card | modal | whatsapp | system
    created_at = Column(DateTime, default=utcnow, index=True)


# ─── Admin-only Careers & Recruitment Module ─────────────────────────────────
# Strictly internal recruitment records managed inside Admin CRM.
# No public careers page or external nav link is surfaced to customers.

class CareerJob(Base):
    """Job vacancy record managed by Admin/Owner."""
    __tablename__ = "career_jobs"
    __table_args__ = (
        Index("ix_career_jobs_dept_status", "department", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    department = Column(String(100), nullable=False, index=True)  # Sales, Marketing, Operations, IT, Finance, HR
    location = Column(String(100), nullable=False, default="Dubai, UAE")
    employment_type = Column(String(50), nullable=False, default="Full-time")  # Full-time, Part-time, Contract
    experience_level = Column(String(50), nullable=False, default="Mid-Senior level")
    salary_range = Column(String(100), nullable=True)  # e.g. "AED 15,000 - 25,000 / month"
    description = Column(Text, nullable=False)
    requirements = Column(JSON, default=list)  # List[str]
    responsibilities = Column(JSON, default=list)  # List[str]
    benefits = Column(JSON, default=list)  # List[str]
    status = Column(String(20), nullable=False, default="active", index=True)  # active | paused | closed
    posted_by = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    applications = relationship("JobApplication", back_populates="job", cascade="all, delete-orphan")


class JobApplication(Base):
    """Candidate job application record managed by Admin/Owner."""
    __tablename__ = "job_applications"
    __table_args__ = (
        Index("ix_job_applications_job_status", "job_id", "status"),
        Index("ix_job_applications_email", "applicant_email"),
    )

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("career_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    applicant_name = Column(String(200), nullable=False)
    applicant_email = Column(String(200), nullable=False, index=True)
    applicant_phone = Column(String(50), nullable=False)
    resume_url = Column(String(500), nullable=True)
    cover_letter = Column(Text, nullable=True)
    linkedin_url = Column(String(300), nullable=True)
    years_experience = Column(Float, nullable=True)
    current_company = Column(String(200), nullable=True)
    status = Column(String(30), nullable=False, default="received", index=True)
    # received | under_review | shortlisted | interview_scheduled | selected | rejected
    notes = Column(Text, nullable=True)
    reviewed_by = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    job = relationship("CareerJob", back_populates="applications")



class SupportTicket(Base):
    """Customer support ticket managed by Admin and Support staff."""
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String(32), unique=True, nullable=False, index=True)
    customer_email = Column(String(200), nullable=False, index=True)
    customer_name = Column(String(100), nullable=True)
    subject = Column(String(255), nullable=False)
    category = Column(String(50), default="general", nullable=False)
    status = Column(String(50), default="open", nullable=False, index=True)
    priority = Column(String(20), default="medium", nullable=False)
    assigned_staff_email = Column(String(200), nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    resolved_at = Column(DateTime, nullable=True)

    messages = relationship("TicketMessage", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketMessage.created_at")


class TicketMessage(Base):
    """Individual message in a support ticket thread."""
    __tablename__ = "ticket_messages"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_type = Column(String(20), nullable=False)
    sender_email = Column(String(200), nullable=False)
    sender_name = Column(String(100), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow, index=True)

    ticket = relationship("SupportTicket", back_populates="messages")


class CustomerSavedSearch(Base):
    """Saved customer property search filter."""
    __tablename__ = "customer_saved_searches"

    id = Column(Integer, primary_key=True, index=True)
    customer_email = Column(String(200), nullable=False, index=True)
    title = Column(String(100), nullable=False)
    search_criteria = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)


class PropertyAlert(Base):
    """Customer subscription to property alerts."""
    __tablename__ = "property_alerts"

    id = Column(Integer, primary_key=True, index=True)
    customer_email = Column(String(200), nullable=False, index=True)
    alert_type = Column(String(50), default="price_drop", nullable=False)
    criteria = Column(JSON, default=dict)
    frequency = Column(String(20), default="instant", nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=utcnow)


class Deal(Base):
    """Closed or in-progress real estate transaction."""
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    property_ref = Column(String(64), nullable=True, index=True)
    salesperson_email = Column(String(200), nullable=False, index=True)
    customer_name = Column(String(100), nullable=False)
    customer_email = Column(String(200), nullable=True)
    deal_value_aed = Column(Float, default=0.0, nullable=False)
    commission_rate_pct = Column(Float, default=2.0, nullable=False)
    commission_amount_aed = Column(Float, default=0.0, nullable=False)
    deal_stage = Column(String(50), default="offer", nullable=False, index=True)
    expected_close_date = Column(DateTime, nullable=True)
    actual_close_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    commissions = relationship("CommissionRecord", back_populates="deal", cascade="all, delete-orphan")


class CommissionRecord(Base):
    """Sales agent and manager commission split for closed deals."""
    __tablename__ = "commission_records"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    role = Column(String(50), nullable=False)
    amount_aed = Column(Float, default=0.0, nullable=False)
    status = Column(String(50), default="pending", nullable=False)
    approved_by = Column(String(200), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    deal = relationship("Deal", back_populates="commissions")


class Notification(Base):
    """In-app alert or notification for staff and customers."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient_email = Column(String(200), nullable=True, index=True)
    recipient_user_id = Column(String(128), nullable=True, index=True)
    recipient_role = Column(String(50), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(50), default="system", nullable=False, index=True)
    notification_type = Column(String(50), default="system", nullable=True, index=True)
    related_entity_type = Column(String(50), nullable=True)
    related_entity_id = Column(String(100), nullable=True)
    link_url = Column(String(255), nullable=True)
    action_url = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    read_at = Column(DateTime, nullable=True)


class NotificationPreference(Base):
    """User notification preferences and opt-ins."""
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(200), unique=True, nullable=False, index=True)
    user_role = Column(String(50), default="customer", nullable=False)
    recommendations = Column(Boolean, default=True, nullable=False)
    appointments = Column(Boolean, default=True, nullable=False)
    inquiries = Column(Boolean, default=True, nullable=False)
    followups = Column(Boolean, default=True, nullable=False)
    announcements = Column(Boolean, default=True, nullable=False)
    browser_push = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


# ─── HRMS Module Models ────────────────────────────────────────────────────────

class AttendanceRecord(Base):
    """Daily employee attendance clock-in/clock-out log."""
    __tablename__ = "attendance_records"
    __table_args__ = (
        Index("ix_attendance_staff_date", "staff_email", "date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    check_in_time = Column(DateTime, nullable=True)
    check_out_time = Column(DateTime, nullable=True)
    total_hours = Column(Float, default=0.0, nullable=False)
    status = Column(String(50), default="present", nullable=False, index=True)  # present, late, half_day, absent, on_leave
    notes = Column(Text, nullable=True)
    is_manually_corrected = Column(Boolean, default=False, nullable=False)
    corrected_by = Column(String(200), nullable=True)
    correction_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    staff_user = relationship("StaffUser", back_populates="attendance_records")


class LeaveBalance(Base):
    """Annual leave entitlement balances per employee per year."""
    __tablename__ = "leave_balances"
    __table_args__ = (
        UniqueConstraint("staff_user_id", "year", name="uq_leave_balance_staff_year"),
    )

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    year = Column(Integer, nullable=False, default=2026, index=True)
    annual_total = Column(Float, default=30.0, nullable=False)
    annual_used = Column(Float, default=0.0, nullable=False)
    sick_total = Column(Float, default=15.0, nullable=False)
    sick_used = Column(Float, default=0.0, nullable=False)
    casual_total = Column(Float, default=7.0, nullable=False)
    casual_used = Column(Float, default=0.0, nullable=False)
    unpaid_used = Column(Float, default=0.0, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    staff_user = relationship("StaffUser", back_populates="leave_balances")


class LeaveRequest(Base):
    """Employee leave application and approval workflow."""
    __tablename__ = "leave_requests"
    __table_args__ = (
        Index("ix_leave_requests_staff_status", "staff_email", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    staff_name = Column(String(200), nullable=False)
    leave_type = Column(String(50), nullable=False, index=True)  # annual, sick, casual, unpaid, maternity, paternity
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    days_count = Column(Float, default=1.0, nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(50), default="pending", nullable=False, index=True)  # pending, approved, rejected, cancelled
    reviewer_email = Column(String(200), nullable=True)
    reviewer_comments = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    staff_user = relationship("StaffUser", back_populates="leave_requests")


class PayrollRecord(Base):
    """Monthly organization payroll run."""
    __tablename__ = "payroll_records"
    __table_args__ = (
        UniqueConstraint("month", "year", name="uq_payroll_records_month_year"),
    )

    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    total_employees = Column(Integer, default=0, nullable=False)
    total_gross_aed = Column(Float, default=0.0, nullable=False)
    total_deductions_aed = Column(Float, default=0.0, nullable=False)
    total_net_aed = Column(Float, default=0.0, nullable=False)
    status = Column(String(50), default="draft", nullable=False, index=True)  # draft, approved, published
    processed_by = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    payslips = relationship("Payslip", back_populates="payroll_record", cascade="all, delete-orphan")


class Payslip(Base):
    """Individual employee monthly payslip."""
    __tablename__ = "payslips"
    __table_args__ = (
        UniqueConstraint("payroll_record_id", "staff_user_id", name="uq_payslips_run_staff"),
        Index("ix_payslips_staff_month_year", "staff_email", "month", "year"),
    )

    id = Column(Integer, primary_key=True, index=True)
    payroll_record_id = Column(Integer, ForeignKey("payroll_records.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    staff_name = Column(String(200), nullable=False)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    basic_salary_aed = Column(Float, default=0.0, nullable=False)
    allowances_aed = Column(Float, default=0.0, nullable=False)
    commission_aed = Column(Float, default=0.0, nullable=False)
    deductions_aed = Column(Float, default=0.0, nullable=False)
    net_salary_aed = Column(Float, default=0.0, nullable=False)
    status = Column(String(50), default="draft", nullable=False, index=True)  # draft, published, paid
    payment_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)

    payroll_record = relationship("PayrollRecord", back_populates="payslips")
    staff_user = relationship("StaffUser", back_populates="payslips")


class EmployeeDocument(Base):
    """Personnel documents (passports, visas, Emirates ID, contracts)."""
    __tablename__ = "employee_documents"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    document_type = Column(String(50), nullable=False, index=True)  # passport, visa, emirates_id, contract, certificate, other
    file_url = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, default=0, nullable=False)
    expiry_date = Column(Date, nullable=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    uploaded_by = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)

    staff_user = relationship("StaffUser", back_populates="documents")


class InterviewSchedule(Base):
    """Candidate interview session linked to job applications."""
    __tablename__ = "interview_schedules"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("job_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("career_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    applicant_name = Column(String(200), nullable=False)
    interviewer_email = Column(String(200), nullable=False, index=True)
    interviewer_name = Column(String(200), nullable=False)
    interview_date = Column(DateTime, nullable=False, index=True)
    round = Column(String(50), default="initial_screening", nullable=False)  # initial_screening, technical, cultural_fit, final_partner
    meeting_link = Column(String(500), nullable=True)
    location = Column(String(200), nullable=True, default="LYKA HQ - Office 4201, Downtown Dubai")
    status = Column(String(50), default="scheduled", nullable=False, index=True)  # scheduled, completed, cancelled, rescheduled
    feedback = Column(Text, nullable=True)
    rating = Column(Integer, nullable=True)  # 1 to 5
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    application = relationship("JobApplication")
    job = relationship("CareerJob")


class PerformanceReview(Base):
    """Employee quarterly/annual performance evaluation."""
    __tablename__ = "performance_reviews"

    id = Column(Integer, primary_key=True, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    reviewer_email = Column(String(200), nullable=False)
    review_period = Column(String(50), nullable=False, index=True)  # e.g., "Q1 2026", "Annual 2025"
    deals_closed_count = Column(Integer, default=0, nullable=False)
    revenue_generated_aed = Column(Float, default=0.0, nullable=False)
    attendance_score_pct = Column(Float, default=100.0, nullable=False)
    overall_rating = Column(Float, default=5.0, nullable=False)  # 1.0 to 5.0
    strengths = Column(Text, nullable=True)
    areas_for_improvement = Column(Text, nullable=True)
    goals = Column(Text, nullable=True)
    status = Column(String(50), default="draft", nullable=False, index=True)  # draft, submitted, acknowledged
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    staff_user = relationship("StaffUser", back_populates="performance_reviews")


class HRRequest(Base):
    """Employee HR helpdesk ticket (inquiries, certificates, grievances)."""
    __tablename__ = "hr_requests"
    __table_args__ = (
        Index("ix_hr_requests_staff_status", "staff_email", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String(32), unique=True, nullable=False, index=True)
    staff_user_id = Column(Integer, ForeignKey("staff_users.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(200), nullable=False, index=True)
    staff_name = Column(String(200), nullable=False)
    category = Column(String(50), nullable=False, index=True)  # salary_inquiry, certificate_request, grievance, benefits, general_query
    priority = Column(String(20), default="medium", nullable=False)  # low, medium, high, urgent
    subject = Column(String(255), nullable=False)
    status = Column(String(50), default="open", nullable=False, index=True)  # open, in_progress, resolved, closed
    assigned_to = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    resolved_at = Column(DateTime, nullable=True)

    staff_user = relationship("StaffUser", back_populates="hr_requests")
    messages = relationship("HRRequestMessage", back_populates="request", cascade="all, delete-orphan", order_by="HRRequestMessage.created_at")


class HRRequestMessage(Base):
    """Messages in an HR request ticket thread."""
    __tablename__ = "hr_request_messages"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("hr_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_email = Column(String(200), nullable=False)
    sender_name = Column(String(200), nullable=False)
    sender_role = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    attachment_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)

    request = relationship("HRRequest", back_populates="messages")


class HRNotification(Base):
    """Targeted internal HR notification."""
    __tablename__ = "hr_notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient_email = Column(String(200), nullable=False, index=True)
    recipient_role = Column(String(50), nullable=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), default="general", nullable=False)  # leave, attendance, payroll, recruitment, hr_request, general
    link_url = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, index=True)


class HRAuditLog(Base):
    """Audit trail for all sensitive HR and personnel operations."""
    __tablename__ = "hr_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_email = Column(String(200), nullable=False, index=True)
    actor_role = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(100), nullable=True)
    details = Column(JSON, default=dict)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
