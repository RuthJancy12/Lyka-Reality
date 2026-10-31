"""
Pydantic schemas for request/response validation.
"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, EmailStr, field_validator


# ─── Self-reported discovery source ─────────────────────────────────────────
# Canonical "How did you hear about LYKA Realty?" options. Kept separate
# from automatic UTM/referrer attribution; absent stays None, never guessed.

DISCOVERY_SOURCES = (
    "Google",
    "Instagram",
    "Facebook",
    "Friend/Referral",
    "Direct Website",
    "Other/Unknown",
)


def _validate_discovery_source(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    t = v.strip()
    if not t:
        return None
    if t not in DISCOVERY_SOURCES:
        raise ValueError(
            "discovery_source must be one of: " + ", ".join(DISCOVERY_SOURCES)
        )
    return t


# ─── Analyse ──────────────────────────────────────────────────────────────────

class AnalyseRequest(BaseModel):
    enquiry_text: str = Field(..., min_length=10, max_length=5000)

class ScoreBreakdown(BaseModel):
    budget: int = 0
    location: int = 0
    property_type_bedrooms: int = 0
    intent: int = 0
    timeline: int = 0
    preferences: int = 0
    total: int = 0
    label: str = "Low"
    band: str = "Cold"
    confidence: Optional[float] = None
    recommended_next_action: Optional[str] = None
    reasoning: List[str] = []

class ExtractedRequirements(BaseModel):
    customer_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    lead_type: Optional[str] = None        # buyer | renter
    property_type: Optional[str] = None
    location: Optional[str] = None
    bedrooms: Optional[int] = None
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    purpose: Optional[str] = None
    amenities: List[str] = []
    timeline_days: Optional[int] = None
    missing_fields: List[str] = []

class AnalyseResponse(BaseModel):
    requirements: ExtractedRequirements
    score: ScoreBreakdown
    suggestions: List[str] = []
    recommended_next_action: Optional[str] = None


# ─── Properties ───────────────────────────────────────────────────────────────

class PropertyCreate(BaseModel):
    ref_code: str
    title: str
    property_type: str
    listing_type: str   # Sale | Rent
    location: str
    community: Optional[str] = None
    bedrooms: int
    bathrooms: int
    size_sqft: int
    price_sale: Optional[float] = None
    price_rent_monthly: Optional[float] = None
    description: Optional[str] = None
    amenities: List[str] = []
    near_metro: bool = False
    near_beach: bool = False
    view: Optional[str] = None
    is_available: bool = True
    status: Optional[str] = "Available"
    is_featured: Optional[bool] = False
    image_url: Optional[str] = None
    image_gallery: Optional[List[str]] = []
    verification_status: Optional[str] = "pending"
    document_status: Optional[str] = "pending"
    permit_number: Optional[str] = None

class PropertyUpdate(BaseModel):
    title: Optional[str] = None
    property_type: Optional[str] = None
    listing_type: Optional[str] = None
    location: Optional[str] = None
    community: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqft: Optional[int] = None
    price_sale: Optional[float] = None
    price_rent_monthly: Optional[float] = None
    description: Optional[str] = None
    amenities: Optional[List[str]] = None
    is_available: Optional[bool] = None
    status: Optional[str] = None
    is_featured: Optional[bool] = None
    image_url: Optional[str] = None
    image_gallery: Optional[List[str]] = None
    verification_status: Optional[str] = None
    document_status: Optional[str] = None
    permit_number: Optional[str] = None

class PropertyOut(PropertyCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class PropertyImportRow(BaseModel):
    ref_code: str
    title: str
    property_type: str
    listing_type: str
    location: str
    community: Optional[str] = None
    bedrooms: int = 0
    bathrooms: int = 1
    size_sqft: int = 500
    price_sale: Optional[float] = None
    price_rent_monthly: Optional[float] = None
    description: Optional[str] = None
    amenities: List[str] = []
    near_metro: bool = False
    near_beach: bool = False
    view: Optional[str] = None
    status: Optional[str] = "Available"
    is_available: bool = True
    image_url: Optional[str] = None
    verification_status: Optional[str] = "imported"

class PropertyImportResult(BaseModel):
    success: bool
    processed: int
    imported: int
    skipped_duplicates: int
    errors: List[str] = []

class PropertyAnalyticsOut(BaseModel):
    total_properties: int
    available_count: int
    reserved_count: int
    sold_count: int
    rented_count: int
    verified_count: int
    pending_verification_count: int
    total_portfolio_value_aed: float
    avg_price_sqft: float
    by_property_type: Dict[str, int]
    by_location: Dict[str, int]


# ─── Leads ────────────────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    raw_enquiry_text: str = Field(..., min_length=10, max_length=5000)
    # Optional pre-filled from analyse step
    customer_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    lead_type: Optional[str] = None
    property_type: Optional[str] = None
    location: Optional[str] = None
    bedrooms: Optional[int] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    purpose: Optional[str] = None
    amenities: List[str] = []
    timeline_days: Optional[int] = None
    missing_fields: List[str] = []
    priority_score: int = 0
    priority_label: str = "Low"
    score_breakdown: Dict[str, Any] = {}

class LeadUpdate(BaseModel):
    customer_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    lead_type: Optional[str] = None
    property_type: Optional[str] = None
    location: Optional[str] = None
    bedrooms: Optional[int] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    purpose: Optional[str] = None
    amenities: Optional[List[str]] = None
    timeline_days: Optional[int] = None
    agent_notes: Optional[str] = None

class LeadStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(new|contacted|qualified|closed|lost)$")
    notes: Optional[str] = None

class RecommendationOut(BaseModel):
    id: int
    property_id: int
    match_score: float
    match_explanation: str
    mismatches: List[str]
    is_nearby: bool = False
    property: PropertyOut
    model_config = {"from_attributes": True}

class ActivityOut(BaseModel):
    id: int
    activity_type: str
    notes: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}

class LeadOut(BaseModel):
    id: int
    customer_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    property_ref: Optional[str] = None
    lead_type: Optional[str] = None
    property_type: Optional[str] = None
    location: Optional[str] = None
    bedrooms: Optional[int] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    purpose: Optional[str] = None
    amenities: Optional[List[str]] = []
    timeline_days: Optional[int] = None
    missing_fields: Optional[List[str]] = []
    priority_score: Optional[int] = 0
    priority_label: Optional[str] = "Low"
    score_breakdown: Optional[Dict[str, Any]] = None
    status: Optional[str] = "new"
    raw_enquiry_text: Optional[str] = ""
    agent_notes: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    referrer: Optional[str] = None
    discovery_source: Optional[str] = None
    lead_score: Optional[int] = None
    lead_score_band: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    original_assigned_email: Optional[str] = None
    current_responsible_email: Optional[str] = None
    covering_agent_email: Optional[str] = None
    coverage_status: Optional[str] = "normal"
    next_followup_at: Optional[datetime] = None
    last_contacted_at: Optional[datetime] = None
    last_call_outcome: Optional[str] = None
    callback_requested: Optional[bool] = False
    coverage_priority_rank: Optional[int] = 3
    recommendations: List[RecommendationOut] = []
    activities: List[ActivityOut] = []
    model_config = {"from_attributes": True}

class LeadListOut(BaseModel):
    id: int
    customer_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    property_ref: Optional[str] = None
    lead_type: Optional[str] = None
    property_type: Optional[str] = None
    location: Optional[str] = None
    bedrooms: Optional[int] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    purpose: Optional[str] = None
    priority_score: Optional[int] = 0
    priority_label: Optional[str] = "Low"
    lead_score: Optional[int] = None
    lead_score_band: Optional[str] = None
    status: Optional[str] = "new"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    referrer: Optional[str] = None
    discovery_source: Optional[str] = None
    original_assigned_email: Optional[str] = None
    current_responsible_email: Optional[str] = None
    covering_agent_email: Optional[str] = None
    coverage_status: Optional[str] = "normal"
    next_followup_at: Optional[datetime] = None
    last_contacted_at: Optional[datetime] = None
    last_call_outcome: Optional[str] = None
    callback_requested: Optional[bool] = False
    do_not_disturb: Optional[bool] = False
    model_config = {"from_attributes": True}

class LeadListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    leads: List[LeadListOut]


# ─── Lead Score (transparent 0-100, Hot/Warm/Cold) ───────────────────────────

class LeadScoreSignal(BaseModel):
    signal: str
    points: float
    detail: Optional[str] = None

class LeadScoreOverride(BaseModel):
    # score: Optional[float] — pass a value to set an override, or None to clear it.
    score: Optional[float] = Field(None, ge=0, le=100)
    reason: Optional[str] = Field(None, max_length=300)

class LeadScoreResponse(BaseModel):
    lead_id: int
    score: Optional[float] = None
    band: Optional[str] = None  # Hot | Warm | Cold
    insufficient_data: bool = False
    reasons: List[LeadScoreSignal] = []
    signals: Dict[str, float] = {}
    observed_signal_count: int = 0
    source: str = "computed"  # computed | override
    scored_at: Optional[str] = None
    override: Optional[Dict[str, Any]] = None


# ─── Security events & alerts (admin) ────────────────────────────────────────

class SecurityEventOut(BaseModel):
    id: int
    event_type: str
    severity: str
    subject_hash: str
    subject_kind: Optional[str] = None
    resource: Optional[str] = None
    method: Optional[str] = None
    path: Optional[str] = None
    status_code: Optional[int] = None
    count: int
    context: Optional[str] = None
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    resolved: bool = False
    created_at: Optional[datetime] = None

class SecurityAlertsResponse(BaseModel):
    alerts: List[SecurityEventOut] = []
    total: int = 0
    threshold: float = 5.0


# ─── Public website enquiry (no staff auth) ─────────────────────────────────

class PublicEnquiryCreate(BaseModel):
    """Anonymous customer enquiry from the public site (PropertyModal /
    ContactConsultation). Saved as a Lead row in the SAME `leads` table
    used by the CRM so Admin → Leads lists it immediately."""

    customer_name: str = Field(..., min_length=1, max_length=200)
    contact_email: EmailStr
    contact_phone: Optional[str] = Field(None, max_length=50)
    property_ref: Optional[str] = Field(None, max_length=50)
    property_title: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=100)
    lead_type: Optional[str] = Field(None, pattern="^(buyer|renter)$")
    property_type: Optional[str] = Field(None, max_length=50)
    # Optional customer-stated requirements. Never defaulted/invented:
    # absent stays None and scores 0 for that criterion.
    bedrooms: Optional[int] = Field(None, ge=0, le=20)
    budget_min: Optional[float] = Field(None, ge=0)
    budget_max: Optional[float] = Field(None, ge=0)
    timeline_days: Optional[int] = Field(None, ge=0, le=3650)
    message: Optional[str] = Field(None, max_length=2000)
    preferred_date: Optional[str] = Field(None, max_length=50)
    # Lead-source attribution (UTM + referrer); all optional, never invented.
    utm_source: Optional[str] = Field(None, max_length=255)
    utm_medium: Optional[str] = Field(None, max_length=255)
    utm_campaign: Optional[str] = Field(None, max_length=255)
    referrer: Optional[str] = Field(None, max_length=500)
    # Self-reported discovery source ("How did you hear about LYKA
    # Realty?"). Optional, allowlisted, stored separately from UTM data.
    discovery_source: Optional[str] = Field(None, max_length=50)

    @field_validator("discovery_source")
    @classmethod
    def discovery_must_be_listed(cls, v: Optional[str]) -> Optional[str]:
        return _validate_discovery_source(v)


class PublicEnquiryOut(BaseModel):
    """Minimal acknowledgement for an unauthenticated submission.

    Deliberately excludes name, email, phone, raw enquiry text, scores,
    recommendations, and duplicate-record identifiers so a public caller can
    never read sensitive customer/CRM data back out of this endpoint.
    """
    id: int
    status: str = "received"


# ─── Dashboard ────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_leads: int
    new_today: int
    high_priority: int
    medium_priority: int
    low_priority: int
    status_counts: Dict[str, int]
    recent_activities: List[ActivityOut]


# ─── Customer portal (self-service profile, UID-owned) ────────────────────────

class CustomerRequirement(BaseModel):
    """One saved property requirement in the customer's own profile JSON.

    The customer can keep several distinct briefs (e.g. Marina rental now and
    a Palm investment later) without adding another data store.
    """
    id: str = Field(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.:\-]+$")
    label: Optional[str] = Field(None, max_length=120)
    locations: List[str] = Field(default_factory=list, max_length=20)
    propertyType: Optional[str] = Field(None, max_length=50)
    bedrooms: Optional[int] = Field(None, ge=0, le=20)
    budgetMin: Optional[float] = Field(None, ge=0)
    budgetMax: Optional[float] = Field(None, ge=0)
    purpose: Optional[str] = Field(None, max_length=20)
    timeline_days: Optional[int] = Field(None, ge=0, le=3650)


class CustomerPreferences(BaseModel):
    locations: List[str] = []
    propertyType: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    budgetMin: Optional[float] = None
    budgetMax: Optional[float] = None
    purpose: Optional[str] = None
    # Expected buying/renting timeline in days (optional; absent stays None
    # and is never invented). Lives inside the JSON preferences column, so
    # no table migration is needed for it.
    timeline_days: Optional[int] = Field(None, ge=0, le=3650)
    timeline: Optional[str] = None
    amenities: List[str] = Field(default_factory=list)
    petFriendly: Optional[bool] = None
    furnishing: Optional[str] = None
    theme: Optional[str] = Field(default="light", pattern="^(light|dark)$")
    # Multiple named customer briefs, stored in the same JSON column.
    requirements: List[CustomerRequirement] = Field(default_factory=list, max_length=20)


class CustomerProfileUpdate(BaseModel):
    """Permitted self-service fields only. No email (token-owned), no role."""
    name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    city: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    # Omitted = keep whatever is already stored (profile-only saves must
    # never wipe preferences). Send an explicit empty object to clear them.
    preferences: Optional[CustomerPreferences] = None
    utm_source: Optional[str] = Field(None, max_length=255)
    utm_medium: Optional[str] = Field(None, max_length=255)
    utm_campaign: Optional[str] = Field(None, max_length=255)
    referrer: Optional[str] = Field(None, max_length=500)
    discovery_source: Optional[str] = Field(None, max_length=50)

    @field_validator("name")
    @classmethod
    def name_must_be_nonblank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name must not be blank.")
        return v

    @field_validator("discovery_source")
    @classmethod
    def discovery_must_be_listed(cls, v: Optional[str]) -> Optional[str]:
        return _validate_discovery_source(v)


class CustomerProfileOut(BaseModel):
    firebase_uid: str
    email: Optional[str]
    name: Optional[str]
    phone: Optional[str]
    city: Optional[str]
    country: Optional[str]
    preferences: Dict[str, Any] = {}
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    referrer: Optional[str] = None
    discovery_source: Optional[str] = None
    # NULL = never asked, True = opted in, False = declined.
    tracking_consent: Optional[bool] = None
    role: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ─── Customer-owned records (favorites / inquiries / chat / interactions) ─────
# Every endpoint derives identity from the verified token. No request body or
# path ever supplies a uid; ownership is always "the caller's own rows".

class FavoriteListOut(BaseModel):
    favorites: List[str] = []


class FavoriteListUpdate(BaseModel):
    favorites: List[str] = Field(default_factory=list, max_length=500)


class CustomerInquiryCreate(BaseModel):
    # Client/legacy document id. Optional; the server generates one when
    # absent. It is only an idempotency key scoped to the verified owner.
    record_ref: Optional[str] = Field(None, max_length=64)
    session_id: Optional[str] = Field(None, max_length=128)
    lead_id: Optional[int] = None
    property_id: str = Field(..., min_length=1, max_length=64)
    property_title: str = Field(..., min_length=1, max_length=255)
    property_location: Optional[str] = Field(None, max_length=100)
    property_type: Optional[str] = Field(None, max_length=50)
    listing_type: Optional[str] = Field(None, max_length=20)
    price_aed: float = Field(0, ge=0)
    bedrooms: int = Field(0, ge=0, le=20)
    size_sqft: float = Field(0, ge=0)
    availability: Optional[str] = Field(None, max_length=50)
    # Optional timestamp for owner-matched legacy migration fidelity.
    created_at: Optional[datetime] = None

    @field_validator("property_title", mode="before")
    @classmethod
    def _sanitize_title(cls, v: Any) -> str:
        s = str(v or "Property Inquiry").strip()
        return s[:255] if len(s) > 255 else (s or "Property Inquiry")

    @field_validator("lead_id", mode="before")
    @classmethod
    def _sanitize_lead_id(cls, v: Any) -> Optional[int]:
        if v in (None, "", "null"):
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None


class CustomerInquiryOut(BaseModel):
    id: str  # record_ref (stable client-facing id)
    lead_id: Optional[int] = None
    session_id: Optional[str] = None
    property_id: str
    property_title: str
    property_location: Optional[str] = None
    property_type: Optional[str] = None
    listing_type: Optional[str] = None
    price_aed: float
    bedrooms: int
    size_sqft: float
    availability: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime


class CustomerInquiryListOut(BaseModel):
    inquiries: List[CustomerInquiryOut] = []


class CustomerInquiryStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(Submitted|Contacted|Withdrawn)$")


class CustomerAppointmentOut(BaseModel):
    """Customer-safe appointment view: no internal notes or staff details."""
    id: int
    lead_id: int
    kind: str = Field(..., pattern="^(call|viewing)$")
    scheduled_at: datetime
    status: str
    property_ref: Optional[str] = None


class CustomerAppointmentsOut(BaseModel):
    appointments: List[CustomerAppointmentOut] = []


class CustomerChatSessionCreate(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128,
                            pattern=r"^[A-Za-z0-9_.:\-]+$")
    title: Optional[str] = Field(None, max_length=120)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CustomerChatTurnCreate(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128,
                            pattern=r"^[A-Za-z0-9_.:\-]+$")
    record_ref: Optional[str] = Field(None, max_length=64)
    role: str = Field(..., pattern="^(user|assistant)$")
    text: str = Field(..., min_length=1, max_length=4000)
    property_ids: List[str] = Field(default_factory=list, max_length=50)
    created_at: Optional[datetime] = None

    @field_validator("role", mode="before")
    @classmethod
    def _sanitize_role(cls, v: Any) -> str:
        s = str(v or "user").lower().strip()
        return s if s in ("user", "assistant") else "user"


class CustomerChatTurnOut(BaseModel):
    id: str  # message_ref
    session_id: str
    role: str
    text: str
    property_ids: List[str] = []
    created_at: datetime


class CustomerChatLatestOut(BaseModel):
    session_id: Optional[str] = None
    turns: List[CustomerChatTurnOut] = []


class CustomerChatSessionOut(BaseModel):
    session_id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    turn_count: int = 0
    has_recommendations: bool = False
    recommended_property_ids: List[str] = []
    # WhatsApp-style sidebar extras (additive; older clients ignore them).
    preview: Optional[str] = None
    last_message_at: Optional[datetime] = None


class CustomerChatSessionsListOut(BaseModel):
    sessions: List[CustomerChatSessionOut] = []
    has_more: bool = False
    next_cursor: Optional[str] = None
    total: int = 0


class CustomerChatSessionRename(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


class CustomerChatSessionRenamedOut(BaseModel):
    session_id: str
    title: str
    updated_at: datetime


class CustomerChatSessionDetailOut(BaseModel):
    session_id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    turns: List[CustomerChatTurnOut] = []
    recommended_properties: List[Dict[str, Any]] = []
    # Older-message pagination + restored requirement state.
    has_more: bool = False
    next_cursor: Optional[str] = None
    requirements: Dict[str, Any] = {}


class CustomerInteractionCreate(BaseModel):
    record_ref: Optional[str] = Field(None, max_length=64)
    kind: str = Field(..., pattern="^(view|search|filter|enquiry)$")
    property_id: Optional[str] = Field(None, max_length=64)
    location: Optional[str] = Field(None, max_length=100)
    property_type: Optional[str] = Field(None, max_length=50)
    bedrooms: Optional[int] = Field(None, ge=0, le=20)
    query: Optional[str] = Field(None, max_length=300)
    # Optional timestamp for owner-matched legacy migration fidelity.
    created_at: Optional[datetime] = None

    @field_validator("kind", mode="before")
    @classmethod
    def _sanitize_kind(cls, v: Any) -> str:
        s = str(v or "view").lower().strip()
        if s in ("view", "search", "filter", "enquiry"):
            return s
        return "view"


class CustomerInteractionOut(BaseModel):
    id: str
    kind: str
    property_id: Optional[str] = None
    location: Optional[str] = None
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    query: Optional[str] = None
    created_at: datetime


class CustomerInteractionListOut(BaseModel):
    interactions: List[CustomerInteractionOut] = []


class TrackingConsentUpdate(BaseModel):
    allow: bool


class TrackingConsentOut(BaseModel):
    tracking_consent: Optional[bool] = None


class LegacyMigrationProfile(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    city: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    discovery_source: Optional[str] = Field(None, max_length=50)


class LegacyMigrationIn(BaseModel):
    """Owner-matched legacy data moved once into the backend.

    The client only sends uid-scoped browser/RTDB data after sign-in. Guest
    data is never part of this payload (see docs/STORAGE_AUDIT_*). Once the
    profile marker is set, replays are ignored so deleted records can never
    be resurrected.
    """
    favorites: List[str] = Field(default_factory=list, max_length=500)
    inquiries: List[CustomerInquiryCreate] = Field(default_factory=list, max_length=200)
    sessions: List[CustomerChatSessionCreate] = Field(default_factory=list, max_length=100)
    turns: List[CustomerChatTurnCreate] = Field(default_factory=list, max_length=500)
    interactions: List[CustomerInteractionCreate] = Field(default_factory=list, max_length=200)
    profile: Optional[LegacyMigrationProfile] = None
    preferences: Optional[CustomerPreferences] = None
    tracking_consent: Optional[bool] = None


class LegacyMigrationOut(BaseModel):
    migrated: bool
    favorites: int = 0
    inquiries: int = 0
    sessions: int = 0
    turns: int = 0
    interactions: int = 0


# ─── Staff & roles ────────────────────────────────────────────────────────────

class StaffCreate(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=200)
    role: str = Field(..., pattern="^(admin|hrms_admin|sales_agent|salesperson|sales_manager|manager)$")
    manager_email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    department: Optional[str] = Field("Sales", max_length=100)
    designation: Optional[str] = Field("Sales Consultant", max_length=100)
    phone: Optional[str] = Field(None, max_length=50)
    salary_basic_aed: Optional[float] = 12000.0
    salary_allowances_aed: Optional[float] = 3000.0
    salary_deductions_aed: Optional[float] = 0.0
    update_existing: Optional[bool] = False

    @field_validator("password", mode="before")
    @classmethod
    def empty_password_to_none(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            return v if v else None
        return v


class StaffUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    role: Optional[str] = Field(None, pattern="^(admin|hrms_admin|sales_agent|salesperson|sales_manager|manager)$")
    is_active: Optional[bool] = None
    manager_email: Optional[EmailStr] = None
    department: Optional[str] = Field(None, max_length=100)
    designation: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)
    employment_status: Optional[str] = Field(None, max_length=50)
    salary_basic_aed: Optional[float] = None
    salary_allowances_aed: Optional[float] = None
    salary_deductions_aed: Optional[float] = None


class StaffOut(BaseModel):
    id: int
    email: str
    firebase_uid: Optional[str] = None
    name: str
    role: str
    is_active: bool
    manager_email: Optional[str] = None
    employee_id: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    joining_date: Optional[datetime] = None
    employment_status: Optional[str] = None
    salary_basic_aed: Optional[float] = None
    salary_allowances_aed: Optional[float] = None
    salary_deductions_aed: Optional[float] = None
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    invitation_link: Optional[str] = None
    message: Optional[str] = None
    availability_status: Optional[str] = "available"
    model_config = {"from_attributes": True}


# ─── Admin Careers & Recruitment Schemas ─────────────────────────────────────

class CareerJobCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    department: str = Field(..., min_length=2, max_length=100)
    location: str = Field("Dubai, UAE", max_length=100)
    employment_type: str = Field("Full-time", max_length=50)
    experience_level: str = Field("Mid-Senior level", max_length=50)
    salary_range: Optional[str] = Field(None, max_length=100)
    description: str = Field(..., min_length=10)
    requirements: List[str] = Field(default_factory=list)
    responsibilities: List[str] = Field(default_factory=list)
    benefits: List[str] = Field(default_factory=list)
    status: str = Field("active", pattern="^(active|paused|closed)$")


class CareerJobUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    department: Optional[str] = Field(None, min_length=2, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    employment_type: Optional[str] = Field(None, max_length=50)
    experience_level: Optional[str] = Field(None, max_length=50)
    salary_range: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, min_length=10)
    requirements: Optional[List[str]] = None
    responsibilities: Optional[List[str]] = None
    benefits: Optional[List[str]] = None
    status: Optional[str] = Field(None, pattern="^(active|paused|closed)$")


class CareerJobStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(active|paused|closed)$")


class CareerJobOut(BaseModel):
    id: int
    title: str
    department: str
    location: str
    employment_type: str
    experience_level: str
    salary_range: Optional[str] = None
    description: str
    requirements: List[str] = []
    responsibilities: List[str] = []
    benefits: List[str] = []
    status: str
    posted_by: Optional[str] = None
    applications_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class JobApplicationCreate(BaseModel):
    job_id: int
    applicant_name: str = Field(..., min_length=2, max_length=200)
    applicant_email: EmailStr
    applicant_phone: str = Field(..., min_length=7, max_length=50)
    resume_url: Optional[str] = Field(None, max_length=500)
    cover_letter: Optional[str] = None
    linkedin_url: Optional[str] = Field(None, max_length=300)
    years_experience: Optional[float] = Field(None, ge=0, le=50)
    current_company: Optional[str] = Field(None, max_length=200)


class JobApplicationStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        pattern="^(received|under_review|shortlisted|interview_scheduled|selected|rejected)$",
    )
    notes: Optional[str] = None


class JobApplicationOut(BaseModel):
    id: int
    job_id: int
    job_title: Optional[str] = None
    job_department: Optional[str] = None
    applicant_name: str
    applicant_email: str
    applicant_phone: str
    resume_url: Optional[str] = None
    cover_letter: Optional[str] = None
    linkedin_url: Optional[str] = None
    years_experience: Optional[float] = None
    current_company: Optional[str] = None
    status: str
    notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CareerStatsOut(BaseModel):
    total_jobs: int = 0
    active_jobs: int = 0
    paused_jobs: int = 0
    closed_jobs: int = 0
    total_applications: int = 0
    applications_by_status: Dict[str, int] = {}
    departments: List[Dict[str, Any]] = []

    manager_email: Optional[str] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    invitation_link: Optional[str] = None
    message: Optional[str] = None
    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    lead_id: int
    staff_email: EmailStr
    reassign: bool = False


class AssignmentUpdate(BaseModel):
    status: str = Field(..., pattern="^(open|in_progress|closed)$")


class AssignmentOut(BaseModel):
    id: int
    lead_id: int
    staff_email: str
    staff_uid: Optional[str] = None
    assigned_by: str
    status: str
    original_staff_email: Optional[str] = None
    is_temporary_coverage: Optional[bool] = False
    coverage_reason: Optional[str] = None
    coverage_start: Optional[date] = None
    coverage_end: Optional[date] = None
    assignment_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class LeadCoverageItemOut(BaseModel):
    lead_id: int
    customer_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    property_ref: Optional[str] = None
    temperature: Optional[str] = None
    priority_label: Optional[str] = None
    callback_requested: bool = False
    do_not_disturb: bool = False
    next_followup_at: Optional[datetime] = None
    is_overdue: bool = False
    coverage_priority_rank: int = 3
    original_assigned_email: Optional[str] = None
    current_responsible_email: Optional[str] = None
    covering_agent_email: Optional[str] = None
    coverage_status: str = "normal"

class AbsentAgentCoverageOut(BaseModel):
    staff_id: int
    staff_name: str
    staff_email: str
    employee_id: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    leave_type: str
    start_date: date
    end_date: date
    days_count: float
    leave_status: str
    total_assigned_leads: int
    leads_needing_coverage: List[LeadCoverageItemOut] = []

class LeadCoverageOverviewOut(BaseModel):
    absent_agents: List[AbsentAgentCoverageOut] = []
    unassigned_coverage_queue: List[LeadCoverageItemOut] = []
    available_covering_agents: List[StaffOut] = []

class LeadCoverageAssignPayload(BaseModel):
    lead_ids: List[int]
    covering_staff_email: EmailStr
    assignment_reason: Optional[str] = "Temporary coverage during approved leave"

class LeadCoverageReturnPayload(BaseModel):
    lead_ids: List[int]
    action: str = Field(..., pattern="^(return_to_original|keep_with_covering)$")
    reason: Optional[str] = None

class EmployeeProfileUpdate(BaseModel):
    phone: Optional[str] = Field(None, max_length=50)


class FollowUpCreate(BaseModel):
    lead_id: int
    note: str = Field(..., min_length=1, max_length=2000)
    next_action_at: Optional[datetime] = None


class FollowUpOut(BaseModel):
    id: int
    lead_id: int
    staff_email: str
    staff_uid: Optional[str] = None
    note: str
    next_action_at: Optional[datetime]
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class FollowUpComplete(BaseModel):
    completed: bool = True


class CallCreate(BaseModel):
    lead_id: int
    scheduled_at: Optional[datetime] = None
    attempted_at: Optional[datetime] = None
    status: Optional[str] = Field(
        "scheduled",
        pattern="^(scheduled|attempted_no_answer|no_answer|busy_unreachable|busy|switched_off|network_issue|invalid_number|connected|follow_up_required|callback_requested|budget_mismatch|wrong_number|not_interested|site_visit_scheduled|closed_won|completed|lost)$",
    )
    duration_minutes: Optional[int] = Field(None, ge=0, le=1440)
    notes: Optional[str] = Field(None, max_length=2000)
    next_follow_up_at: Optional[datetime] = None
    lead_temperature: Optional[str] = Field(None, pattern="^(Cold|Warm|Hot)$")
    lead_status: Optional[str] = Field(None, pattern="^(new|contacted|qualified|closed|lost)$")
    customer_response: Optional[str] = None
    recommended_action: Optional[str] = None


class CallUpdate(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = Field(
        None,
        pattern="^(scheduled|attempted_no_answer|no_answer|busy_unreachable|busy|switched_off|network_issue|invalid_number|connected|follow_up_required|callback_requested|budget_mismatch|wrong_number|not_interested|site_visit_scheduled|closed_won|completed|lost)$",
    )
    duration_minutes: Optional[int] = Field(None, ge=0, le=1440)
    notes: Optional[str] = Field(None, max_length=2000)
    next_follow_up_at: Optional[datetime] = None
    lead_temperature: Optional[str] = Field(None, pattern="^(Cold|Warm|Hot)$")
    lead_status: Optional[str] = Field(None, pattern="^(new|contacted|qualified|closed|lost)$")
    customer_response: Optional[str] = None
    recommended_action: Optional[str] = None


class CallOut(BaseModel):
    id: int
    lead_id: int
    staff_email: str
    staff_uid: Optional[str] = None
    scheduled_at: datetime
    attempted_at: Optional[datetime] = None
    connected_at: Optional[datetime] = None
    status: str
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    next_follow_up_at: Optional[datetime] = None
    attempt_number: Optional[int] = 1
    is_first_call: Optional[bool] = False
    customer_response: Optional[str] = None
    recommended_action: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class AuditEventOut(BaseModel):
    id: int
    actor_email: Optional[str] = None
    actor_uid: Optional[str] = None
    actor_role: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    lead_id: Optional[int] = None
    details: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class AuditListOut(BaseModel):
    events: List[AuditEventOut] = []
    total: int = 0


TARGET_METRICS = (
    "leads", "deals_closed", "site_visits_completed",
    "calls_connected", "calls_attempted",
)


class TargetUpsert(BaseModel):
    metric: str = Field(..., pattern="^(leads|deals_closed|site_visits_completed|calls_connected|calls_attempted)$")
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    target_value: float = Field(..., ge=0)


class TargetOut(BaseModel):
    id: int
    metric: str
    period: str
    target_value: float
    actual_value: float
    progress_pct: Optional[float] = None
    updated_by: Optional[str] = None
    updated_at: datetime
    model_config = {"from_attributes": True}


class ViewingCreate(BaseModel):
    lead_id: int
    property_ref: str = Field(..., min_length=1, max_length=20)
    scheduled_at: datetime


class ViewingUpdate(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = Field(None, pattern="^(scheduled|completed|cancelled|no_show)$")
    notes: Optional[str] = Field(None, max_length=2000)


class ViewingOut(BaseModel):
    id: int
    lead_id: int
    property_ref: str
    staff_email: str
    staff_uid: Optional[str] = None
    scheduled_at: datetime
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ─── Property advertising analytics ─────────────────────────────────────────
# Public callers may only send the three interaction types below. Enquiry,
# site-visit and booking events are written by the backend flows that own the
# corresponding Lead/Viewing row, never by a client request.

class PropertyAdEventCreate(BaseModel):
    property_ref: str = Field(
        ..., min_length=3, max_length=64,
        pattern=r"^(LYK-\d{3,}|CRM-[A-Za-z0-9-]{2,})$",
    )
    event_type: str = Field(..., pattern="^(impression|view|whatsapp_click)$")
    # Random browser-scoped id; the API stores only its salted SHA-256 hash.
    visitor_id: Optional[str] = Field(None, max_length=128)
    context: Optional[str] = Field(None, max_length=40)


class PropertyAdEventAck(BaseModel):
    counted: bool
    duplicate: bool = False


class PropertyAdMetrics(BaseModel):
    impressions: int = 0
    views: int = 0
    unique_views: int = 0
    enquiries: int = 0
    whatsapp_clicks: int = 0
    site_visits: int = 0
    bookings: int = 0


class PropertyAdRow(BaseModel):
    property_ref: str
    source: str
    title: str
    location: str
    project: Optional[str] = None
    property_type: str
    listing_type: str
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqft: Optional[int] = None
    price_aed: float
    availability: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool


# ─── Admin Careers & Recruitment Schemas ─────────────────────────────────────

class CareerJobCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    department: str = Field(..., min_length=2, max_length=100)
    location: str = Field("Dubai, UAE", max_length=100)
    employment_type: str = Field("Full-time", max_length=50)
    experience_level: str = Field("Mid-Senior level", max_length=50)
    salary_range: Optional[str] = Field(None, max_length=100)
    description: str = Field(..., min_length=10)
    requirements: List[str] = Field(default_factory=list)
    responsibilities: List[str] = Field(default_factory=list)
    benefits: List[str] = Field(default_factory=list)
    status: str = Field("active", pattern="^(active|paused|closed)$")


class CareerJobUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    department: Optional[str] = Field(None, min_length=2, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    employment_type: Optional[str] = Field(None, max_length=50)
    experience_level: Optional[str] = Field(None, max_length=50)
    salary_range: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, min_length=10)
    requirements: Optional[List[str]] = None
    responsibilities: Optional[List[str]] = None
    benefits: Optional[List[str]] = None
    status: Optional[str] = Field(None, pattern="^(active|paused|closed)$")


class CareerJobStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(active|paused|closed)$")


class CareerJobOut(BaseModel):
    id: int
    title: str
    department: str
    location: str
    employment_type: str
    experience_level: str
    salary_range: Optional[str] = None
    description: str
    requirements: List[str] = []
    responsibilities: List[str] = []
    benefits: List[str] = []
    status: str
    posted_by: Optional[str] = None
    applications_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class JobApplicationCreate(BaseModel):
    job_id: int
    applicant_name: str = Field(..., min_length=2, max_length=200)
    applicant_email: EmailStr
    applicant_phone: str = Field(..., min_length=7, max_length=50)
    resume_url: Optional[str] = Field(None, max_length=500)
    cover_letter: Optional[str] = None
    linkedin_url: Optional[str] = Field(None, max_length=300)
    years_experience: Optional[float] = Field(None, ge=0, le=50)
    current_company: Optional[str] = Field(None, max_length=200)


class JobApplicationStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        pattern="^(received|under_review|shortlisted|interview_scheduled|selected|rejected)$",
    )
    notes: Optional[str] = None


class JobApplicationOut(BaseModel):
    id: int
    job_id: int
    job_title: Optional[str] = None
    job_department: Optional[str] = None
    applicant_name: str
    applicant_email: str
    applicant_phone: str
    resume_url: Optional[str] = None
    cover_letter: Optional[str] = None
    linkedin_url: Optional[str] = None
    years_experience: Optional[float] = None
    current_company: Optional[str] = None
    status: str
    notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CareerStatsOut(BaseModel):
    total_jobs: int = 0
    active_jobs: int = 0
    paused_jobs: int = 0
    closed_jobs: int = 0
    total_applications: int = 0
    applications_by_status: Dict[str, int] = {}
    departments: List[Dict[str, Any]] = []

    published_at: datetime
    metrics: PropertyAdMetrics


class PropertyAdListOut(BaseModel):
    total: int
    page: int
    per_page: int
    pages: int
    sort: str
    range: Dict[str, Any]
    items: List[PropertyAdRow]


class PropertyAdsOverviewOut(BaseModel):
    active_listings: int
    new_listings_this_month: int
    listings_published_in_range: int
    impressions: int
    views: int
    unique_views: int
    enquiries: int
    whatsapp_clicks: int
    site_visits: int
    bookings: int
    enquiry_conversion_rate: Optional[float] = None
    range: Dict[str, Any]


class PropertyAdFiltersOut(BaseModel):
    locations: List[str] = []
    projects: List[str] = []
    property_types: List[str] = []
    availabilities: List[str] = []
    listing_types: List[str] = []


class PropertyAdActiveUpdate(BaseModel):
    is_active: bool


# ─── Admin Careers & Recruitment Schemas ─────────────────────────────────────
class CareerJobCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    department: str = Field(..., min_length=2, max_length=100)
    location: str = Field("Dubai, UAE", max_length=100)
    employment_type: str = Field("Full-time", max_length=50)
    experience_level: str = Field("Mid-Senior level", max_length=50)
    salary_range: Optional[str] = Field(None, max_length=100)
    description: str = Field(..., min_length=10)
    requirements: List[str] = Field(default_factory=list)
    responsibilities: List[str] = Field(default_factory=list)
    benefits: List[str] = Field(default_factory=list)
    status: str = Field("active", pattern="^(active|paused|closed)$")


class CareerJobUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    department: Optional[str] = Field(None, min_length=2, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    employment_type: Optional[str] = Field(None, max_length=50)
    experience_level: Optional[str] = Field(None, max_length=50)
    salary_range: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, min_length=10)
    requirements: Optional[List[str]] = None
    responsibilities: Optional[List[str]] = None
    benefits: Optional[List[str]] = None
    status: Optional[str] = Field(None, pattern="^(active|paused|closed)$")


class CareerJobStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(active|paused|closed)$")


class CareerJobOut(BaseModel):
    id: int
    title: str
    department: str
    location: str
    employment_type: str
    experience_level: str
    salary_range: Optional[str] = None
    description: str
    requirements: List[str] = []
    responsibilities: List[str] = []
    benefits: List[str] = []
    status: str
    posted_by: Optional[str] = None
    applications_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class JobApplicationCreate(BaseModel):
    job_id: int
    applicant_name: str = Field(..., min_length=2, max_length=200)
    applicant_email: EmailStr
    applicant_phone: str = Field(..., min_length=7, max_length=50)
    resume_url: Optional[str] = Field(None, max_length=500)
    cover_letter: Optional[str] = None
    linkedin_url: Optional[str] = Field(None, max_length=300)
    years_experience: Optional[float] = Field(None, ge=0, le=50)
    current_company: Optional[str] = Field(None, max_length=200)


class JobApplicationStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        pattern="^(received|under_review|shortlisted|interview_scheduled|selected|rejected)$",
    )
    notes: Optional[str] = None


class JobApplicationOut(BaseModel):
    id: int
    job_id: int
    job_title: Optional[str] = None
    job_department: Optional[str] = None
    applicant_name: str
    applicant_email: str
    applicant_phone: str
    resume_url: Optional[str] = None
    cover_letter: Optional[str] = None
    linkedin_url: Optional[str] = None
    years_experience: Optional[float] = None
    current_company: Optional[str] = None
    status: str
    notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CareerStatsOut(BaseModel):
    total_jobs: int = 0
    active_jobs: int = 0
    paused_jobs: int = 0
    closed_jobs: int = 0
    total_applications: int = 0
    applications_by_status: Dict[str, int] = {}
    departments: List[Dict[str, Any]] = []


# ─── Admin Careers & Recruitment Schemas ─────────────────────────────────────

class CareerJobCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    department: str = Field(..., min_length=2, max_length=100)
    location: str = Field("Dubai, UAE", max_length=100)
    employment_type: str = Field("Full-time", max_length=50)
    experience_level: str = Field("Mid-Senior level", max_length=50)
    salary_range: Optional[str] = Field(None, max_length=100)
    description: str = Field(..., min_length=10)
    requirements: List[str] = Field(default_factory=list)
    responsibilities: List[str] = Field(default_factory=list)
    benefits: List[str] = Field(default_factory=list)
    status: str = Field("active", pattern="^(active|paused|closed)$")


class CareerJobUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    department: Optional[str] = Field(None, min_length=2, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    employment_type: Optional[str] = Field(None, max_length=50)
    experience_level: Optional[str] = Field(None, max_length=50)
    salary_range: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, min_length=10)
    requirements: Optional[List[str]] = None
    responsibilities: Optional[List[str]] = None
    benefits: Optional[List[str]] = None
    status: Optional[str] = Field(None, pattern="^(active|paused|closed)$")


class CareerJobStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(active|paused|closed)$")


class CareerJobOut(BaseModel):
    id: int
    title: str
    department: str
    location: str
    employment_type: str
    experience_level: str
    salary_range: Optional[str] = None
    description: str
    requirements: List[str] = []
    responsibilities: List[str] = []
    benefits: List[str] = []
    status: str
    posted_by: Optional[str] = None
    applications_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class JobApplicationCreate(BaseModel):
    job_id: int
    applicant_name: str = Field(..., min_length=2, max_length=200)
    applicant_email: EmailStr
    applicant_phone: str = Field(..., min_length=7, max_length=50)
    resume_url: Optional[str] = Field(None, max_length=500)
    cover_letter: Optional[str] = None
    linkedin_url: Optional[str] = Field(None, max_length=300)
    years_experience: Optional[float] = Field(None, ge=0, le=50)
    current_company: Optional[str] = Field(None, max_length=200)


class JobApplicationStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        pattern="^(received|under_review|shortlisted|interview_scheduled|selected|rejected)$",
    )
    notes: Optional[str] = None


class JobApplicationOut(BaseModel):
    id: int
    job_id: int
    job_title: Optional[str] = None
    job_department: Optional[str] = None
    applicant_name: str
    applicant_email: str
    applicant_phone: str
    resume_url: Optional[str] = None
    cover_letter: Optional[str] = None
    linkedin_url: Optional[str] = None
    years_experience: Optional[float] = None
    current_company: Optional[str] = None
    status: str
    notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CareerStatsOut(BaseModel):
    total_jobs: int = 0
    active_jobs: int = 0
    paused_jobs: int = 0
    closed_jobs: int = 0
    total_applications: int = 0
    applications_by_status: Dict[str, int] = {}
    departments: List[Dict[str, Any]] = []



# ─── Support Tickets ─────────────────────────────────────────────────────────

class SupportTicketCreate(BaseModel):
    subject: str = Field(..., min_length=3, max_length=255)
    category: str = Field(default="general", pattern="^(general|inquiry|viewing|payment|maintenance|complaint|moving_relocation|property_management|utility_setup|partner_referral)$")
    message: str = Field(..., min_length=5, max_length=5000)
    customer_name: Optional[str] = None


class TicketMessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)


class TicketMessageOut(BaseModel):
    id: int
    ticket_id: int
    sender_type: str
    sender_email: str
    sender_name: Optional[str] = None
    message: str
    created_at: datetime
    model_config = {"from_attributes": True}


class SupportTicketOut(BaseModel):
    id: int
    ticket_number: str
    customer_email: str
    customer_name: Optional[str] = None
    subject: str
    category: str
    status: str
    priority: str
    assigned_staff_email: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    messages: List[TicketMessageOut] = []
    model_config = {"from_attributes": True}


class SupportTicketUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern="^(open|in_progress|resolved|closed)$")
    priority: Optional[str] = Field(None, pattern="^(low|medium|high|urgent)$")
    assigned_staff_email: Optional[str] = None


# ─── Customer Saved Searches & Alerts ───────────────────────────────────────

class CustomerSavedSearchCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    search_criteria: Dict[str, Any] = Field(default_factory=dict)


class CustomerSavedSearchOut(BaseModel):
    id: int
    customer_email: str
    title: str
    search_criteria: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    model_config = {"from_attributes": True}


class PropertyAlertCreate(BaseModel):
    alert_type: str = Field(default="price_drop", pattern="^(price_drop|new_listing|status_change)$")
    criteria: Dict[str, Any] = Field(default_factory=dict)
    frequency: str = Field(default="instant", pattern="^(instant|daily|weekly)$")


class PropertyAlertOut(BaseModel):
    id: int
    customer_email: str
    alert_type: str
    criteria: Dict[str, Any] = Field(default_factory=dict)
    frequency: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Deals & Commissions ───────────────────────────────────────────────────

class DealCreate(BaseModel):
    lead_id: Optional[int] = None
    property_ref: Optional[str] = None
    salesperson_email: Optional[str] = None
    customer_name: str = Field(..., min_length=2, max_length=100)
    customer_email: Optional[str] = None
    deal_value_aed: float = Field(..., ge=0)
    commission_rate_pct: float = Field(default=2.0, ge=0, le=100)
    deal_stage: str = Field(default="offer", pattern="^(offer|contract_signed|payment_pending|closed_won|closed_lost)$")
    expected_close_date: Optional[datetime] = None
    notes: Optional[str] = None


class DealUpdate(BaseModel):
    deal_stage: Optional[str] = Field(None, pattern="^(offer|contract_signed|payment_pending|closed_won|closed_lost)$")
    deal_value_aed: Optional[float] = Field(None, ge=0)
    commission_rate_pct: Optional[float] = Field(None, ge=0, le=100)
    expected_close_date: Optional[datetime] = None
    actual_close_date: Optional[datetime] = None
    notes: Optional[str] = None


class CommissionRecordOut(BaseModel):
    id: int
    deal_id: int
    staff_email: str
    role: str
    amount_aed: float
    status: str
    approved_by: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class DealOut(BaseModel):
    id: int
    lead_id: Optional[int] = None
    property_ref: Optional[str] = None
    salesperson_email: str
    customer_name: str
    customer_email: Optional[str] = None
    deal_value_aed: float
    commission_rate_pct: float
    commission_amount_aed: float
    deal_stage: str
    expected_close_date: Optional[datetime] = None
    actual_close_date: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    commissions: List[CommissionRecordOut] = []
    model_config = {"from_attributes": True}


class LeaderboardEntryOut(BaseModel):
    staff_email: str
    staff_name: Optional[str] = None
    deals_count: int = 0
    total_sales_aed: float = 0.0
    total_commission_aed: float = 0.0
    calls_connected: int = 0
    viewings_completed: int = 0
    rank: int = 1


# ─── Notifications ──────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: int
    recipient_email: Optional[str] = None
    recipient_user_id: Optional[str] = None
    recipient_role: Optional[str] = None
    title: str
    message: str
    category: str
    notification_type: Optional[str] = "system"
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None
    link_url: Optional[str] = None
    action_url: Optional[str] = None
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class NotificationCreate(BaseModel):
    recipient_email: Optional[str] = None
    recipient_user_id: Optional[str] = None
    recipient_role: Optional[str] = None
    title: str
    message: str
    category: str = "system"
    notification_type: Optional[str] = "system"
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None
    link_url: Optional[str] = None
    action_url: Optional[str] = None


class NotificationPreferenceOut(BaseModel):
    id: Optional[int] = None
    user_email: str
    user_role: str = "customer"
    recommendations: bool = True
    appointments: bool = True
    inquiries: bool = True
    followups: bool = True
    announcements: bool = True
    browser_push: bool = False
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class NotificationPreferenceUpdate(BaseModel):
    recommendations: Optional[bool] = None
    appointments: Optional[bool] = None
    inquiries: Optional[bool] = None
    followups: Optional[bool] = None
    announcements: Optional[bool] = None
    browser_push: Optional[bool] = None


# ─── HRMS Schemas ─────────────────────────────────────────────────────────────

class HRMSOverviewStats(BaseModel):
    total_employees: int = 0
    active_employees: int = 0
    present_today: int = 0
    absent_today: int = 0
    pending_leaves: int = 0
    approved_leaves: int = 0
    new_job_applications: int = 0
    open_hr_requests: int = 0


class AttendanceCheckInOut(BaseModel):
    notes: Optional[str] = None


class AttendanceRecordOut(BaseModel):
    id: int
    staff_user_id: int
    staff_email: str
    staff_name: Optional[str] = None
    date: date
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    total_hours: float = 0.0
    status: str
    notes: Optional[str] = None
    is_manually_corrected: bool = False
    corrected_by: Optional[str] = None
    correction_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class ManualAttendanceCorrection(BaseModel):
    staff_email: str
    date: date
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    status: str = Field(..., pattern="^(present|late|half_day|absent|on_leave)$")
    notes: Optional[str] = None
    correction_reason: str = Field(..., min_length=3, max_length=500)


class LeaveBalanceOut(BaseModel):
    id: int
    staff_user_id: int
    staff_email: str
    year: int
    annual_total: float = 30.0
    annual_used: float = 0.0
    annual_remaining: float = 30.0
    sick_total: float = 15.0
    sick_used: float = 0.0
    sick_remaining: float = 15.0
    casual_total: float = 7.0
    casual_used: float = 0.0
    casual_remaining: float = 7.0
    unpaid_used: float = 0.0
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class LeaveRequestCreate(BaseModel):
    leave_type: str = Field(..., pattern="^(annual|sick|casual|unpaid|maternity|paternity)$")
    start_date: date
    end_date: date
    reason: str = Field(..., min_length=3, max_length=1000)


class LeaveRequestOut(BaseModel):
    id: int
    staff_user_id: int
    staff_email: str
    staff_name: str
    leave_type: str
    start_date: date
    end_date: date
    days_count: float
    reason: str
    status: str
    reviewer_email: Optional[str] = None
    reviewer_comments: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class LeaveApprovalAction(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$")
    reviewer_comments: Optional[str] = None


class PayrollGenerate(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2024, le=2035)
    title: Optional[str] = None


class PayrollRecordOut(BaseModel):
    id: int
    month: int
    year: int
    title: str
    total_employees: int
    total_gross_aed: float
    total_deductions_aed: float
    total_net_aed: float
    status: str
    processed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class PayslipOut(BaseModel):
    id: int
    payroll_record_id: int
    staff_user_id: int
    staff_email: str
    staff_name: str
    month: int
    year: int
    basic_salary_aed: float
    allowances_aed: float
    commission_aed: float
    deductions_aed: float
    net_salary_aed: float
    status: str
    payment_date: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class EmployeeDocumentCreate(BaseModel):
    staff_email: str
    title: str = Field(..., min_length=2, max_length=200)
    document_type: str = Field(..., pattern="^(passport|visa|emirates_id|contract|certificate|other)$")
    file_url: str = Field(..., min_length=5, max_length=500)
    file_size_bytes: Optional[int] = 0
    expiry_date: Optional[date] = None


class EmployeeDocumentOut(BaseModel):
    id: int
    staff_user_id: int
    staff_email: str
    title: str
    document_type: str
    file_url: str
    file_size_bytes: int
    expiry_date: Optional[date] = None
    is_verified: bool
    uploaded_by: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class InterviewScheduleCreate(BaseModel):
    application_id: int
    interview_date: datetime
    round: str = Field("initial_screening", max_length=50)
    interviewer_email: Optional[str] = None
    interviewer_name: Optional[str] = None
    meeting_link: Optional[str] = None
    location: Optional[str] = "LYKA HQ - Office 4201, Downtown Dubai"


class InterviewScheduleUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern="^(scheduled|completed|cancelled|rescheduled)$")
    feedback: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    meeting_link: Optional[str] = None


class InterviewScheduleOut(BaseModel):
    id: int
    application_id: int
    job_id: int
    applicant_name: str
    interviewer_email: str
    interviewer_name: str
    interview_date: datetime
    round: str
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    status: str
    feedback: Optional[str] = None
    rating: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class PerformanceReviewCreate(BaseModel):
    staff_email: str
    review_period: str = Field(..., min_length=2, max_length=50)
    deals_closed_count: int = 0
    revenue_generated_aed: float = 0.0
    attendance_score_pct: float = 100.0
    overall_rating: float = Field(5.0, ge=1.0, le=5.0)
    strengths: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    goals: Optional[str] = None


class PerformanceReviewOut(BaseModel):
    id: int
    staff_user_id: int
    staff_email: str
    reviewer_email: str
    review_period: str
    deals_closed_count: int
    revenue_generated_aed: float
    attendance_score_pct: float
    overall_rating: float
    strengths: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    goals: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class HRRequestMessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    attachment_url: Optional[str] = None


class HRRequestMessageOut(BaseModel):
    id: int
    request_id: int
    sender_email: str
    sender_name: str
    sender_role: str
    message: str
    attachment_url: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class HRRequestCreate(BaseModel):
    category: str = Field(..., pattern="^(salary_inquiry|certificate_request|grievance|benefits|general_query)$")
    priority: str = Field("medium", pattern="^(low|medium|high|urgent)$")
    subject: str = Field(..., min_length=3, max_length=255)
    message: str = Field(..., min_length=3, max_length=5000)


class HRRequestStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(open|in_progress|resolved|closed)$")
    assigned_to: Optional[str] = None


class HRRequestOut(BaseModel):
    id: int
    ticket_number: str
    staff_user_id: int
    staff_email: str
    staff_name: str
    category: str
    priority: str
    subject: str
    status: str
    assigned_to: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    messages: List[HRRequestMessageOut] = []
    model_config = {"from_attributes": True}


class HRNotificationOut(BaseModel):
    id: int
    recipient_email: str
    recipient_role: Optional[str] = None
    title: str
    message: str
    notification_type: str
    link_url: Optional[str] = None
    is_read: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class HRAuditLogOut(BaseModel):
    id: int
    actor_email: str
    actor_role: str
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    details: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}
