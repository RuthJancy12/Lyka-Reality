"""
LYKA Realty — Transparent Lead Scoring Service (rule-based, 0–100).

Computes a transparent, deterministic lead score from *available* CRM
signals. Designed for the Lyka Realty product requirements:

  - Score range: 0–100, bands: Hot (High), Warm, Cold.
  - Signals (weights sum to 100):
      intent (20)            — expressed buying/rental intent (buyer|renter)
      budget (20)            — confirmed budget (budget_max)
      timeline (15)          — timeline clarity / urgency
      property_fit (15)      — property fit completeness (location + type + beds)
      viewings (15)          — viewing requests / scheduled viewings (deduped)
      engagement (15)        — recent meaningful engagement (deduped by activity type)
  - Human override supported (manager+): stored with who changed it and why;
    the effective score = override when present, else the computed score.
  - Insufficient data state: when fewer than two independent positive signals
    are evidenced, the score is not fabricated; the response carries
    ``insufficient_data: True`` with reasons.

Scoring is intentionally NOT a trained predictive ML model: it is a documented,
configurable rule-based engine. Historical outcome data (conversion after
viewing etc.) is not yet used for ML training/evaluation, so no predictive
claim is made.

Sensitive personal characteristics (name, nationality, gender, age, religion,
disability, etc.) are never read or used as scoring signals — only the CRM
requirement/contact fields listed above.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ── Configurable rule-based weights (documented; sum = 100) ──────────────────
SCORE_WEIGHTS: Dict[str, float] = {
    "intent": 20.0,
    "budget": 20.0,
    "timeline": 15.0,
    "property_fit": 15.0,
    "viewings": 15.0,
    "engagement": 15.0,
}

BAND_THRESHOLDS: Dict[str, float] = {
    # hot_min: score >= hot_min  -> Hot
    # warm_min: score >= warm_min -> Warm (score >= cold below warm_min -> Cold)
    "hot_min": 70.0,
    "warm_min": 40.0,
}

MIN_OBSERVED_SIGNALS = 2  # below this, the score is reported as insufficient data
ENGAGEMENT_WINDOW_DAYS = 30  # meaningful engagement within this window
MAX_ENGAGEMENT_TYPES = 3  # dedupe to distinct activity types per lead


def _norm(val: Any) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip().lower()
    return s or None


def band_for(score: float) -> str:
    if score >= BAND_THRESHOLDS["hot_min"]:
        return "Hot"
    if score >= BAND_THRESHOLDS["warm_min"]:
        return "Warm"
    return "Cold"


def score_lead(
    lead: Optional[Dict[str, Any]],
    viewings: Optional[List[Dict[str, Any]]] = None,
    activities: Optional[List[Dict[str, Any]]] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Compute the transparent 0–100 lead score.

    ``lead`` is a lead-shaped mapping (CRM fields only). ``viewings`` and
    ``activities`` are optional collections (dedup handled internally).

    Returns a dict with: score, band, insufficient_data, reasons, signals,
    observed_signal_count, scored_at.
    """
    lead = lead or {}
    now = now or datetime.now(timezone.utc)
    viewings = viewings or []
    activities = activities or []

    reasons: List[Dict[str, Any]] = []
    signals_observed = 0
    total = 0.0

    # 1. Intent (20) — expressed buying/rental intent.
    intent_val = _norm(lead.get("lead_type"))
    intent_points = SCORE_WEIGHTS["intent"] if intent_val in ("buyer", "renter") else 0.0
    if intent_val:
        signals_observed += 1
    if intent_points:
        total += intent_points
        reasons.append({"signal": "intent", "points": intent_points, "detail": f"Intent expressed: {intent_val}"})

    # 2. Confirmed budget (20) — budget_max > 0.
    budget_max = lead.get("budget_max")
    budget_points = SCORE_WEIGHTS["budget"] if (budget_max is not None and float(budget_max) > 0) else 0.0
    if budget_max is not None and float(budget_max) > 0:
        signals_observed += 1
    if budget_points:
        total += budget_points
        reasons.append({"signal": "budget", "points": budget_points, "detail": f"Confirmed budget: AED {budget_max}"})

    # 3. Timeline (15) — urgency from timeline_days.
    timeline_days = lead.get("timeline_days")
    timeline_points = 0.0
    timeline_detail = "No timeline provided"
    if timeline_days is not None:
        td = int(float(timeline_days))
        if td > 0:
            signals_observed += 1
            if td <= 90:
                timeline_points = SCORE_WEIGHTS["timeline"]
                timeline_detail = f"Move-in timeline: {td} days (high urgency)"
            elif td <= 180:
                timeline_points = SCORE_WEIGHTS["timeline"] * 0.66
                timeline_detail = f"Move-in timeline: {td} days (moderate urgency)"
            else:
                timeline_points = SCORE_WEIGHTS["timeline"] * 0.33
                timeline_detail = f"Move-in timeline: {td} days (low urgency)"
    if timeline_points:
        total += timeline_points
        reasons.append({"signal": "timeline", "points": timeline_points, "detail": timeline_detail})

    # 4. Property fit (15) — completeness across location / type / beds.
    fit_points = 0.0
    fit_slots = [
        ("location", bool(lead.get("location"))),
        ("property_type", bool(lead.get("property_type"))),
        ("bedrooms", lead.get("bedrooms") is not None),
    ]
    for slot, ok in fit_slots:
        if ok:
            signals_observed += 1
            fit_points += 5.0
    if fit_points:
        total += fit_points
        reasons.append({
            "signal": "property_fit",
            "points": fit_points,
            "detail": "Property fit signals: " + ", ".join(k for k, ok in fit_slots if ok),
        })

    # 5. Viewings (15) — deduped by property, capped.
    valid_viewing = False
    seen_refs = set()
    for v in viewings or []:
        st = _norm(v.get("status"))
        ref = v.get("property_ref") or v.get("property_id")
        key = str(ref or "")
        if not key or key in seen_refs:
            continue
        seen_refs.add(key)
        if st in ("scheduled", "completed"):
            valid_viewing = True
    viewing_points = SCORE_WEIGHTS["viewings"] if valid_viewing else 0.0
    if valid_viewing:
        signals_observed += 1
    if viewing_points:
        total += viewing_points
        reasons.append({"signal": "viewings", "points": viewing_points, "detail": "Viewing requested / scheduled"})

    # 6. Engagement (15) — distinct meaningful activity types within window, deduped.
    eng_points = 0.0
    window_start = now
    meaningful = {"agent_contacted", "recommendation_sent", "status_changed", "property_viewed", "note_added"}
    seen_types = set()
    for a in activities or []:
        at = _norm(a.get("activity_type"))
        if at not in meaningful:
            continue
        if at in seen_types:
            continue
        seen_types.add(at)
        if len(seen_types) > MAX_ENGAGEMENT_TYPES:
            break
        # recent check
        ca = a.get("created_at")
        if ca is not None:
            try:
                delta_days = (now - datetime.fromisoformat(str(ca).replace("Z", "+00:00"))).days
                if delta_days > ENGAGEMENT_WINDOW_DAYS:
                    continue
            except Exception:
                pass
        eng_points += 5.0
    eng_points = min(eng_points, SCORE_WEIGHTS["engagement"])
    if eng_points > 0:
        signals_observed += 1
    if eng_points:
        total += eng_points
        reasons.append({"signal": "engagement", "points": eng_points, "detail": f"Recent meaningful engagement ({len(seen_types)} signal type(s))"})

    score = float(total)
    score = max(0.0, min(100.0, round(score, 2)))
    insufficient = len([r for r in reasons if r.get("points", 0) > 0]) < MIN_OBSERVED_SIGNALS

    if insufficient:
        return {
            "score": None,
            "band": None,
            "insufficient_data": True,
            "reasons": reasons,
            "signals": {
                "intent": intent_points, "budget": budget_points, "timeline": timeline_points,
                "property_fit": fit_points, "viewings": viewing_points, "engagement": eng_points,
            },
            "observed_signal_count": len(reasons),
            "scored_at": now.isoformat(),
        }

    band = band_for(score)
    if band == "Hot":
        recommended_action = "High priority: Contact immediately via phone to schedule private viewing."
    elif band == "Warm":
        recommended_action = "Follow up within 24 hours to confirm timeline and share matching units."
    else:
        recommended_action = "Send curated email portfolio and follow up on move-in timeframe."

    return {
        "score": score,
        "band": band,
        "insufficient_data": False,
        "recommended_next_action": recommended_action,
        "reasons": reasons,
        "signals": {
            "intent": intent_points, "budget": budget_points, "timeline": timeline_points,
            "property_fit": fit_points, "viewings": viewing_points, "engagement": eng_points,
        },
        "observed_signal_count": len(reasons),
        "scored_at": now.isoformat(),
    }


def effective_lead_score(lead: Dict[str, Any]) -> Dict[str, Any]:
    """Effective score = human override when present, else computed score."""
    lead = lead or {}
    override = lead.get("lead_score_override")
    if override is not None:
        try:
            ov = float(override)
        except (ValueError, TypeError):
            ov = None
        if ov is not None:
            return {
                "score": round(max(0.0, min(100.0, ov)), 2),
                "band": band_for(ov),
                "insufficient_data": False,
                "reasons": [
                    {"signal": "override", "points": ov, "detail": f"Agent override: {lead.get('lead_score_override_reason') or 'no reason recorded'}"}
                ],
                "override": {
                    "score": ov,
                    "reason": lead.get("lead_score_override_reason"),
                    "by": lead.get("lead_score_override_by"),
                    "at": lead.get("lead_score_override_at"),
                },
                "source": "override",
                "scored_at": (lead.get("lead_score_override_at") or "").isoformat() if hasattr(lead.get("lead_score_override_at"), "isoformat") else str(lead.get("lead_score_override_at") or ""),
            }
    computed = score_lead(lead)
    computed["source"] = "computed"
    return computed
