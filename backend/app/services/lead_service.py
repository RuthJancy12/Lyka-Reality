"""
Lead qualification business logic:
  1. AI extraction (local Ollama llama3.2:3b — no paid API)
  2. Schema validation + missing field detection
  3. Rule-based priority scoring
  4. Weighted property matching
"""
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from app.models import CRMProperty, Lead, Recommendation, Activity

load_dotenv()
logger = logging.getLogger("lyka.lead_service")

OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "").strip()
OLLAMA_BASE_URL = os.getenv(
    "OLLAMA_BASE_URL",
    "https://ollama.com" if OLLAMA_API_KEY else "http://localhost:11434",
)
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_HEADERS = {"Authorization": f"Bearer {OLLAMA_API_KEY}"} if OLLAMA_API_KEY else {}

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"\+?\d[\d\s\-()]{7,}\d")


def _ollama_health() -> Dict[str, Any]:
    """Lightweight Ollama probe so failures produce a clear message."""
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.get(f"{OLLAMA_BASE_URL}/api/tags", headers=OLLAMA_HEADERS)
            if r.status_code != 200:
                return {"status": "error", "detail": f"HTTP {r.status_code}"}
            names = [m.get("name", "") for m in r.json().get("models", [])]
            if not any(OLLAMA_MODEL in n for n in names):
                return {"status": "error",
                        "detail": f"model {OLLAMA_MODEL} not installed (ollama pull {OLLAMA_MODEL})"}
            return {"status": "online"}
    except Exception as e:
        return {"status": "offline", "detail": str(e)}


def _regex_contact(text: str) -> Dict[str, Optional[str]]:
    """Deterministic email/phone extraction — never invented, never missed
    when literally present in the enquiry."""
    email_m = _EMAIL_RE.search(text or "")
    phone_m = _PHONE_RE.search(text or "")
    return {
        "contact_email": email_m.group(0) if email_m else None,
        "contact_phone": phone_m.group(0).strip() if phone_m else None,
    }


# ─── AI Extraction ────────────────────────────────────────────────────────────

EXTRACTION_SYSTEM_PROMPT = """
You are a real-estate lead extraction assistant for LYKA Realty Dubai.
Your ONLY job is to extract structured JSON from a customer enquiry.

RULES:
- Extract only what the customer explicitly stated. Never invent data.
- Use null for any field not mentioned.
- For amenities, extract a list of strings (e.g. ["pool", "gym", "parking"]).
- For timeline_days: convert "immediately"→1, "1 week"→7, "1 month"→30, "3 months"→90, "6 months"→180, "1 year"→365.
- For lead_type: "buy"/"purchase"/"invest" → "buyer"; "rent"/"lease" → "renter".
- For missing_fields: list the field names that are null.
- Return ONLY a valid JSON object, no markdown, no explanation.

JSON schema:
{
  "customer_name": string | null,
  "contact_email": string | null,
  "contact_phone": string | null,
  "lead_type": "buyer" | "renter" | null,
  "property_type": string | null,
  "location": string | null,
  "bedrooms": integer | null,
  "budget_min": integer | null,
  "budget_max": integer | null,
  "purpose": string | null,
  "amenities": string[],
  "timeline_days": integer | null,
  "missing_fields": string[]
}
"""


def _parse_json_object(raw: str) -> Dict[str, Any]:
    """Extracts the first JSON object from model output (strips fences/prose)."""
    text = (raw or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    logger.error("Ollama returned non-JSON output: %s", (raw or "")[:200])
    return {}


def extract_requirements(enquiry_text: str) -> Dict[str, Any]:
    """Extract structured requirements using the local Ollama model.

    Email/phone come from deterministic regex (exact substrings of the
    enquiry); everything else comes from a single Ollama JSON call.
    Never invents details; missing data stays null. Raises RuntimeError
    with a clear message when Ollama is unreachable — never falls back
    to any paid API.
    """
    if not (enquiry_text or "").strip():
        raise ValueError("Enquiry text is empty.")

    contact = _regex_contact(enquiry_text)

    health = _ollama_health()
    if health.get("status") != "online":
        raise RuntimeError(
            "Local AI (Ollama %s) is unavailable: %s. "
            "Start Ollama (`ollama serve`) and pull the model "
            "(`ollama pull %s`), then retry. No paid API is used."
            % (OLLAMA_MODEL, health.get("detail"), OLLAMA_MODEL)
        )

    prompt = (
        EXTRACTION_SYSTEM_PROMPT
        + "\nCustomer enquiry:\n\n" + enquiry_text
        + "\n\nReturn ONLY the JSON object."
    )
    try:
        with httpx.Client(timeout=60.0) as client:
            res = client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                headers=OLLAMA_HEADERS,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                    "keep_alive": "30m",
                    "options": {"num_predict": 400, "temperature": 0.0},
                },
            )
            if res.status_code != 200:
                raise RuntimeError(f"Ollama returned HTTP {res.status_code}")
            data = _parse_json_object(res.json().get("response") or "")
    except RuntimeError:
        raise
    except Exception as e:
        logger.error("Ollama extraction error: %s", e)
        raise RuntimeError(
            "Local AI (Ollama %s) request failed: %s. "
            "Check that Ollama is running, then retry." % (OLLAMA_MODEL, e)
        )

    # Normalise and validate
    extracted: Dict[str, Any] = {
        "customer_name": _str_or_none(data.get("customer_name")),
        "contact_email": _str_or_none(data.get("contact_email")),
        "contact_phone": _str_or_none(data.get("contact_phone")),
        "lead_type": _str_or_none(data.get("lead_type")),
        "property_type": _str_or_none(data.get("property_type")),
        "location": _str_or_none(data.get("location")),
        "bedrooms": _int_or_none(data.get("bedrooms")),
        "budget_min": _int_or_none(data.get("budget_min")),
        "budget_max": _int_or_none(data.get("budget_max")),
        "purpose": _str_or_none(data.get("purpose")),
        "amenities": _list_of_str(data.get("amenities")),
        "timeline_days": _int_or_none(data.get("timeline_days")),
    }

    # Deterministic contact details win over model output: they are exact
    # substrings of the enquiry and can never be hallucinated.
    if contact["contact_email"]:
        extracted["contact_email"] = contact["contact_email"]
    if contact["contact_phone"]:
        extracted["contact_phone"] = contact["contact_phone"]

    # Recalculate missing fields honestly
    core_fields = ["customer_name", "contact_email", "contact_phone",
                   "lead_type", "property_type", "location", "bedrooms",
                   "budget_max", "timeline_days"]
    extracted["missing_fields"] = [f for f in core_fields if extracted.get(f) is None]

    return extracted


def _str_or_none(val: Any) -> Optional[str]:
    if val is None or val == "":
        return None
    return str(val).strip() or None


def _int_or_none(val: Any) -> Optional[int]:
    if val is None:
        return None
    if isinstance(val, bool):
        return None
    if isinstance(val, (int, float)):
        return int(val)
    try:
        cleaned = re.sub(r"[^\d.\-]", "", str(val))
        return int(float(cleaned)) if cleaned and cleaned not in ("-", ".", "-.") else None
    except (TypeError, ValueError):
        return None


def _list_of_str(val: Any) -> List[str]:
    if not val or not isinstance(val, list):
        return []
    return [str(x).strip() for x in val if x]


# ─── Scoring ──────────────────────────────────────────────────────────────────

def calculate_score(req: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transparent rule-based scoring per PRD spec.
    Returns breakdown dict + total + label.
    """
    breakdown: Dict[str, int] = {}
    reasoning: List[str] = []

    # Budget (20 pts)
    if req.get("budget_max") or req.get("budget_min"):
        breakdown["budget"] = 20
        reasoning.append("✅ Budget provided (+20)")
    else:
        breakdown["budget"] = 0
        reasoning.append("❌ Budget not specified (0)")

    # Location (20 pts)
    if req.get("location"):
        breakdown["location"] = 20
        reasoning.append(f"✅ Location specified: {req['location']} (+20)")
    else:
        breakdown["location"] = 0
        reasoning.append("❌ Location not specified (0)")

    # Property type or bedrooms (15 pts)
    if req.get("property_type") or req.get("bedrooms") is not None:
        breakdown["property_type_bedrooms"] = 15
        reasoning.append("✅ Property type/bedrooms specified (+15)")
    else:
        breakdown["property_type_bedrooms"] = 0
        reasoning.append("❌ Property type/bedrooms not specified (0)")

    # Buy/rent intent (15 pts)
    if req.get("lead_type"):
        breakdown["intent"] = 15
        reasoning.append(f"✅ Intent confirmed: {req['lead_type']} (+15)")
    else:
        breakdown["intent"] = 0
        reasoning.append("❌ Buy/rent intent not clear (0)")

    # Timeline (0/5/15/20 pts)
    tl = req.get("timeline_days")
    if tl is None:
        breakdown["timeline"] = 0
        reasoning.append("❌ Timeline unknown (0)")
    elif tl <= 30:
        breakdown["timeline"] = 20
        reasoning.append(f"✅ Timeline ≤ 30 days: {tl} days (+20)")
    elif tl <= 90:
        breakdown["timeline"] = 15
        reasoning.append(f"✅ Timeline 31–90 days: {tl} days (+15)")
    else:
        breakdown["timeline"] = 5
        reasoning.append(f"⚠️ Timeline > 90 days: {tl} days (+5)")

    # Essential preferences (10 pts)
    if len(req.get("amenities", [])) > 0 or req.get("purpose"):
        breakdown["preferences"] = 10
        reasoning.append("✅ Essential preferences specified (+10)")
    else:
        breakdown["preferences"] = 0
        reasoning.append("❌ No preferences specified (0)")

    total = sum(breakdown.values())

    if total >= 70:
        label = "High"
        band = "Hot"
    elif total >= 40:
        label = "Medium"
        band = "Warm"
    else:
        label = "Low"
        band = "Cold"

    core_signals = ["budget_max", "budget_min", "location", "property_type", "bedrooms", "lead_type", "timeline_days"]
    observed_signals = sum(1 for s in core_signals if req.get(s) is not None)
    confidence = round(min(1.0, observed_signals / len(core_signals)), 2)

    if band == "Hot":
        recommended_action = "High priority: Contact immediately via phone to schedule private viewing."
    elif band == "Warm":
        recommended_action = "Follow up within 24 hours to confirm timeline and share matching units."
    else:
        recommended_action = "Send curated email portfolio and follow up on move-in timeframe."

    return {
        **breakdown,
        "total": total,
        "label": label,
        "band": band,
        "confidence": confidence,
        "reasoning": reasoning,
        "recommended_next_action": recommended_action,
    }


# ─── Property Matching ────────────────────────────────────────────────────────

WEIGHTS = {
    "location": 0.30,
    "budget": 0.25,
    "type_bedrooms": 0.20,
    "amenities": 0.15,
    "preferences": 0.10,
}

# Common community abbreviations mapped to the full location name used in
# the CRM seed dataset. Keeps "JVC" / "DSO" style enquiries matching the
# right community without ever matching the wrong one.
_LOCATION_ALIASES = {
    "dso": "dubai silicon oasis",
    "jvc": "jumeirah village circle",
    "jbr": "jumeirah beach residence",
    "dhe": "dubai hills estate",
    "dmac": "damac hills",
    "difc": "dubai international financial centre",
    "palm": "palm jumeirah",
    "dt": "downtown dubai",
    "bb": "business bay",
}


def _normalize_location(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _location_matches(lead_location: Any, prop_location: Any) -> bool:
    """True when the property is in the customer's requested location.

    Handles multi-location leads ("Business Bay, Downtown") by splitting on
    common separators, plus known abbreviations ("DSO", "JVC"). Matching is
    substring either way so "Downtown" matches "Downtown Dubai". Anything
    else is NOT a match — a different community must never be presented as
    a normal recommendation.
    """
    pl = _normalize_location(prop_location)
    if not pl:
        return False
    tokens = [t.strip() for t in re.split(r"[,;/|]+", _normalize_location(lead_location)) if t.strip()]
    if not tokens:
        return False
    for tok in tokens:
        tok = _LOCATION_ALIASES.get(tok, tok)
        if len(tok) < 3:
            continue
        if tok in pl or pl in tok:
            return True
    return False


def match_properties(lead: "Lead", db: Session, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Match a lead against the CRM property database.
    Returns up to `limit` results with scores and explanations.

    - Hard constraints: availability and sale-vs-rent intent.
    - Exact-location matches (when the lead states a location) always rank
      first, scored normally.
    - Nearby fallback: when fewer than `limit` exact matches exist, fill the
      remaining slots with suitable alternatives from explicitly mapped
      neighbouring communities (see services/nearby.py), ranked by proximity
      then requirement match. Alternatives carry ``is_nearby=True`` and an
      explanation naming their actual community. Communities outside the
      map are never suggested.
    - When neither the requested location nor its mapped neighbours have
      suitable stock, this returns [] so the UI shows the no-results
      message. Type, bedrooms, and budget stay soft (weighted) signals
      for both exact and nearby candidates.
    """
    from app.services.nearby import nearby_communities_for

    # Hard constraint: availability
    query = db.query(CRMProperty).filter(CRMProperty.is_available == True)  # noqa: E712

    # Hard constraint: sale vs rent intent
    if lead.lead_type == "buyer":
        query = query.filter(CRMProperty.listing_type == "Sale")
    elif lead.lead_type == "renter":
        query = query.filter(CRMProperty.listing_type == "Rent")

    from sqlalchemy import func, or_
    if lead.location:
        loc_str = _normalize_location(lead.location)
        tokens = [t.strip() for t in re.split(r"[,;/|]+", loc_str) if t.strip()]
        loc_filters = []
        for t in tokens:
            alias = _LOCATION_ALIASES.get(t, t)
            if len(alias) >= 3:
                loc_filters.append(func.lower(CRMProperty.location).contains(alias))
        if loc_filters:
            exact_candidates = query.filter(or_(*loc_filters)).limit(100).all()
        else:
            exact_candidates = query.limit(100).all()
        exact = [p for p in exact_candidates if _location_matches(lead.location, p.location)]
    else:
        exact = query.limit(100).all()

    scored_exact: List[Tuple[CRMProperty, float, str, List[str]]] = []
    for prop in exact:
        score, explanation, mismatches = _score_match(lead, prop)
        scored_exact.append((prop, score, explanation, mismatches))
    scored_exact.sort(key=lambda x: x[1], reverse=True)

    results: List[Dict[str, Any]] = []
    for prop, score, explanation, mismatches in scored_exact[:limit]:
        results.append({
            "property": prop,
            "match_score": round(score, 1),
            "match_explanation": explanation,
            "mismatches": mismatches,
            "is_nearby": False,
        })

    # Nearby fallback: fill remaining slots only, never ahead of exact hits.
    if lead.location and len(results) < limit:
        nearby_order = nearby_communities_for(lead.location)
        if nearby_order:
            exact_ids = {p.id for p in exact}
            rank = {n.lower(): i for i, n in enumerate(nearby_order)}

            def _nb_rank(p: CRMProperty) -> Optional[int]:
                hits = [rank[n.lower()] for n in nearby_order
                        if _location_matches(n, p.location)]
                return min(hits) if hits else None

            nearby_filters = [func.lower(CRMProperty.location).contains(c.lower()) for c in nearby_order]
            nearby_pool = query.filter(or_(*nearby_filters)).limit(50).all() if nearby_filters else []
            fill: List[Tuple[int, float, CRMProperty, float, str, List[str]]] = []
            for prop in nearby_pool:
                if prop.id in exact_ids:
                    continue
                r = _nb_rank(prop)
                if r is None:
                    continue
                score, explanation, mismatches = _score_match(
                    lead, prop, nearby_rank=r, nearby_of=lead.location)
                # A nearby alternative is labelled, not warned: drop the
                # location-mismatch complaint, keep budget/type/bedroom notes.
                mismatches = [m for m in mismatches if not m.startswith("Location mismatch")]
                explanation = (
                    f"No exact match in {lead.location}; "
                    f"nearby alternative in {prop.location}. {explanation}"
                )
                fill.append((r, -score, prop, score, explanation, mismatches))
            fill.sort(key=lambda x: (x[0], x[1]))
            for _, _, prop, score, explanation, mismatches in fill[:limit - len(results)]:
                results.append({
                    "property": prop,
                    "match_score": round(score, 1),
                    "match_explanation": explanation,
                    "mismatches": mismatches,
                    "is_nearby": True,
                })

    return results[:limit]


def _score_match(
    lead: "Lead",
    prop: CRMProperty,
    nearby_rank: Optional[int] = None,
    nearby_of: Optional[str] = None,
) -> Tuple[float, str, List[str]]:
    """Score a single property against a lead, returning (score, explanation, mismatches).

    When ``nearby_rank`` is set (0 = closest mapped neighbour), the location
    component earns proximity credit instead of a mismatch: alternatives are
    labelled alternatives, never penalised as wrong-location matches.
    """
    scores: Dict[str, float] = {}
    parts: List[str] = []
    mismatches: List[str] = []

    # Location (30%)
    if lead.location:
        lead_loc = lead.location.lower()
        prop_loc = prop.location.lower()
        if nearby_rank is not None:
            credit = max(0.6 - 0.1 * nearby_rank, 0.2)
            scores["location"] = credit
            parts.append(f"Nearby alternative in {prop.location} (requested {nearby_of or lead.location})")
        elif lead_loc in prop_loc or prop_loc in lead_loc:
            scores["location"] = 1.0
            parts.append(f"✅ Location match: {prop.location}")
        else:
            scores["location"] = 0.0
            mismatches.append(f"Location mismatch: wanted {lead.location}, got {prop.location}")
    else:
        scores["location"] = 0.5  # No preference → partial credit

    # Budget (25%)
    price = prop.price_sale if lead.lead_type == "buyer" else prop.price_rent_monthly
    if price is None:
        price = prop.price_sale or prop.price_rent_monthly or 0

    if lead.budget_max or lead.budget_min:
        bmax = lead.budget_max or float("inf")
        bmin = lead.budget_min or 0
        if bmin <= price <= bmax:
            scores["budget"] = 1.0
            parts.append(f"✅ Within budget: AED {price:,.0f}")
        elif price <= bmax * 1.1:  # Within 10% above budget
            scores["budget"] = 0.7
            parts.append(f"⚠️ Slightly over budget: AED {price:,.0f}")
            mismatches.append(f"Price AED {price:,.0f} slightly exceeds budget")
        else:
            pct = (price - bmax) / bmax * 100
            scores["budget"] = max(0.0, 1.0 - pct / 100)
            mismatches.append(f"Price AED {price:,.0f} exceeds budget AED {bmax:,.0f}")
    else:
        scores["budget"] = 0.5

    # Property type + bedrooms (20%)
    type_score = 0.0
    if lead.property_type:
        if lead.property_type.lower() in prop.property_type.lower():
            type_score += 0.5
        else:
            mismatches.append(f"Type mismatch: wanted {lead.property_type}, got {prop.property_type}")
    else:
        type_score += 0.25

    if lead.bedrooms is not None:
        if prop.bedrooms == lead.bedrooms:
            type_score += 0.5
            parts.append(f"✅ Bedrooms match: {prop.bedrooms}")
        elif abs(prop.bedrooms - lead.bedrooms) == 1:
            type_score += 0.3
            mismatches.append(f"Bedrooms: wanted {lead.bedrooms}, got {prop.bedrooms}")
        else:
            mismatches.append(f"Bedrooms mismatch: wanted {lead.bedrooms}, got {prop.bedrooms}")
    else:
        type_score += 0.25

    scores["type_bedrooms"] = min(type_score, 1.0)

    # Amenities (15%)
    if lead.amenities:
        lead_amen = [a.lower() for a in lead.amenities]
        prop_amen = [a.lower() for a in (prop.amenities or [])]
        matches = sum(1 for a in lead_amen if any(a in pa for pa in prop_amen))
        ratio = matches / len(lead_amen)
        scores["amenities"] = ratio
        if ratio == 1.0:
            parts.append(f"✅ All {len(lead_amen)} amenities available")
        elif ratio > 0:
            parts.append(f"⚠️ {matches}/{len(lead_amen)} amenities available")
            missing_am = [a for a in lead_amen if not any(a in pa for pa in prop_amen)]
            mismatches.append(f"Missing amenities: {', '.join(missing_am)}")
        else:
            mismatches.append("No requested amenities available")
    else:
        scores["amenities"] = 0.5

    # Preferences/purpose (10%)
    pref_score = 0.5  # default
    if lead.purpose and prop.description:
        if lead.purpose.lower() in prop.description.lower():
            pref_score = 1.0
    scores["preferences"] = pref_score

    # Weighted total
    total = sum(scores[k] * WEIGHTS[k] for k in scores) * 100

    if not parts:
        parts.append(f"Property at {prop.location} — {prop.bedrooms}BR {prop.property_type}")

    explanation = " | ".join(parts) if parts else f"Partial match for {prop.location}"

    return total, explanation, mismatches


def save_recommendations(lead: "Lead", matches: List[Dict[str, Any]], db: Session) -> None:
    """Persist recommendations to DB, replacing any existing ones."""
    db.query(Recommendation).filter(Recommendation.lead_id == lead.id).delete()

    for m in matches:
        rec = Recommendation(
            lead_id=lead.id,
            property_id=m["property"].id,
            match_score=m["match_score"],
            match_explanation=m["match_explanation"],
            mismatches=m["mismatches"],
            is_nearby=bool(m.get("is_nearby", False)),
        )
        db.add(rec)

    db.commit()


def log_activity(lead_id: int, activity_type: str, notes: Optional[str], db: Session) -> Activity:
    """Create an activity log entry."""
    act = Activity(lead_id=lead_id, activity_type=activity_type, notes=notes)
    db.add(act)
    db.commit()
    db.refresh(act)
    return act
