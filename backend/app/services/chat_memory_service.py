"""
LYKA REALTY — Customer AI Conversation Memory & Recommendation Continuity Service

Provides intelligent retrieval of past customer conversations, search criteria,
and property recommendations from Supabase PostgreSQL.
Ensures session continuity, date/time awareness in Asia/Dubai timezone,
and prevents hallucinated or fabricated properties.
"""

import re
import logging
from datetime import datetime, timezone, date
from typing import Dict, Any, List, Optional
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import CustomerChatSession, CustomerChatMessage, CustomerProfile
from app.services.property_service import get_property_by_id

logger = logging.getLogger("lyka.chat_memory")

DUBAI_TZ = ZoneInfo("Asia/Dubai")

# Regular expressions for detecting conversation recall intents
_RECALL_RECOMMENDATIONS_RE = re.compile(
    r"\b(?:yesterday(?:'s)?|previous(?:ly)?|earlier|last\s+time|before)\b.*?\b(?:recommend(?:ed)?|show(?:ed)?|suggest(?:ed)?|found|properties|options|listings|apartments|villas|units)\b"
    r"|\b(?:show|bring\s+up|display|see|what\s+were)\b.*?\b(?:yesterday(?:'s)?|previous|earlier|last\s+time)\b.*?\b(?:properties|recommendations|options|listings|houses|villas|apartments)\b"
    r"|\b(?:what|which)\s+properties\b.*?\b(?:recommend(?:ed)?|show(?:ed)?|suggest(?:ed)?)\b"
    r"|\b(?:show\s+me\s+yesterday(?:'s)?\s+properties|properties\s+you\s+showed\s+me\s+yesterday)\b"
    r"|\b(?:show|bring\s+up|display)\s+(?:me\s+)?(?:those|the|my)\s+(?:properties|recommendations|options|listings)\s+(?:again|back)\b",
    re.IGNORECASE
)

_RECALL_BUDGET_RE = re.compile(
    r"\b(?:what\s+was|remind\s+me\s+of|check)\s+(?:my\s+)?(?:previous|earlier|last|yesterday(?:'s)?)\s+(?:budget|criteria|filters|preference|preferences|search)\b"
    r"|\b(?:my\s+previous\s+budget|previous\s+criteria|what\s+was\s+my\s+budget)\b",
    re.IGNORECASE
)

_CONTINUE_SEARCH_RE = re.compile(
    r"\b(?:continue|resume|pick\s+up)\s+(?:(?:from\s+)?where\s+we\s+(?:stopped|left\s+off)|previous\s+search|our\s+(?:conversation|search)|last\s+search)\b"
    r"|\bcontinue\s+(?:from\s+)?where\s+we\s+stopped\b",
    re.IGNORECASE
)

_FOLLOWUP_ORDINAL_RE = re.compile(
    r"\b(?:i\s+liked|tell\s+me\s+more\s+about|what\s+about|details\s+(?:of|on)|show\s+(?:me\s+)?(?:that|the))\s+(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|last)\s+(?:property|option|one|listing|apartment|villa|penthouse|residence)\b"
    r"|\b(?:the\s+)?(first|second|third|1st|2nd|3rd)\s+property\b"
    r"|\b(?:can\s+you\s+)?(?:show|tell\s+me\s+more\s+about)\s+that\s+(villa|apartment|penthouse|townhouse|property)(?:\s+again)?\b",
    re.IGNORECASE
)


def get_dubai_date(dt: Optional[datetime]) -> date:
    """Returns calendar date in Asia/Dubai (GST, UTC+4) timezone."""
    if dt is None:
        return datetime.now(timezone.utc).astimezone(DUBAI_TZ).date()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(DUBAI_TZ).date()


def format_criteria_phrase(crit: Dict[str, Any]) -> str:
    """Formats search criteria into a natural English phrase."""
    parts = []
    bhk = crit.get("bedrooms") if crit.get("bedrooms") is not None else crit.get("bhk")
    prop_type = crit.get("property_type") or crit.get("propertyType")
    location = crit.get("location")
    budget = crit.get("max_budget_aed") or crit.get("budget")
    min_budget = crit.get("min_budget_aed") or crit.get("min_budget")

    if bhk is not None:
        parts.append(f"{bhk} BHK" if bhk > 0 else "Studio")
    if prop_type:
        parts.append(f"{str(prop_type).lower()}s" if not parts else str(prop_type).lower())
    else:
        parts.append("properties")

    base = " ".join(parts)
    if location:
        base += f" in {location}"

    def _fmt_b(val: Any) -> str:
        b_num = float(val)
        if b_num >= 1_000_000:
            return f"AED {b_num / 1_000_000:.1f}M".replace(".0M", "M")
        return f"AED {int(b_num):,}"

    if min_budget and budget:
        try:
            base += f" with a budget of {_fmt_b(min_budget)} – {_fmt_b(budget)}"
        except (ValueError, TypeError):
            pass
    elif budget:
        try:
            base += f" with a budget of {_fmt_b(budget)}"
        except (ValueError, TypeError):
            pass
    elif min_budget:
        try:
            base += f" with a minimum budget of {_fmt_b(min_budget)}"
        except (ValueError, TypeError):
            pass

    return base.strip()


def is_recall_query(text: str) -> Dict[str, Any]:
    """Analyzes a user message to check if it asks to recall past conversation or recommendations."""
    raw = (text or "").strip()
    low = raw.lower()

    time_ref = None
    if "yesterday" in low:
        time_ref = "yesterday"
    elif "today" in low:
        time_ref = "today"
    elif any(w in low for w in ["previous", "earlier", "last time", "before"]):
        time_ref = "previous"

    if _RECALL_RECOMMENDATIONS_RE.search(low):
        return {
            "is_recall": True,
            "kind": "recommendations",
            "time_reference": time_ref,
        }

    if _RECALL_BUDGET_RE.search(low):
        return {
            "is_recall": True,
            "kind": "budget",
            "time_reference": time_ref,
        }

    if _CONTINUE_SEARCH_RE.search(low):
        return {
            "is_recall": True,
            "kind": "continue",
            "time_reference": time_ref,
        }

    followup_match = _FOLLOWUP_ORDINAL_RE.search(low)
    if followup_match:
        ordinal_word = followup_match.group(1) or followup_match.group(2) or followup_match.group(3) or ""
        ordinal_map = {
            "first": 0, "1st": 0, "second": 1, "2nd": 1,
            "third": 2, "3rd": 2, "fourth": 3, "4th": 3,
            "fifth": 4, "5th": 4, "last": -1
        }
        idx = ordinal_map.get(ordinal_word.lower())
        prop_type = ordinal_word.lower() if ordinal_word.lower() in ("villa", "apartment", "penthouse", "townhouse") else None
        return {
            "is_recall": True,
            "kind": "followup",
            "target_index": idx,
            "target_type": prop_type,
            "time_reference": time_ref,
        }

    return {"is_recall": False, "kind": None}


def retrieve_customer_conversation_context(
    owner_uid: str,
    query_text: Optional[str] = None,
    time_reference: Optional[str] = None,
    db_session: Optional[Session] = None,
) -> Optional[Dict[str, Any]]:
    """Retrieves previous customer conversation and recommendation records from Supabase PostgreSQL.

    1. Retrieves customer's previous chat sessions.
    2. Identifies the relevant conversation using timestamps and message context in Asia/Dubai timezone.
    3. Retrieves previous search criteria.
    4. Retrieves recommended property IDs.
    5. Fetches current live property records from inventory dataset.
    6. Ensures role-based privacy: strictly queries records owned by verified owner_uid.
    """
    if not owner_uid:
        return None

    close_db = False
    db = db_session
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        now_dubai = get_dubai_date(datetime.now(timezone.utc))

        # Query all customer sessions ordered by updated_at descending
        sessions = (
            db.query(CustomerChatSession)
            .filter(CustomerChatSession.firebase_uid == owner_uid)
            .order_by(CustomerChatSession.updated_at.desc())
            .all()
        )

        if not sessions:
            # Check customer profile for preferences if no sessions exist
            profile = db.query(CustomerProfile).filter(CustomerProfile.firebase_uid == owner_uid).first()
            if profile and profile.preferences and isinstance(profile.preferences, dict):
                p = profile.preferences
                crit = {
                    "purpose": p.get("purpose"),
                    "property_type": p.get("propertyType"),
                    "location": p.get("locations", [None])[0] if isinstance(p.get("locations"), list) and p.get("locations") else None,
                    "bedrooms": p.get("bedrooms"),
                    "min_budget_aed": p.get("budgetMin"),
                    "max_budget_aed": p.get("budgetMax"),
                }
                return {
                    "session_id": None,
                    "properties": [],
                    "criteria": crit,
                    "relative_day_dubai": "profile",
                    "days_ago": None,
                }
            return None

        # Determine target session based on time_reference or query
        target_session = None
        target_messages: List[CustomerChatMessage] = []
        found_properties: List[Dict[str, Any]] = []
        target_time: Optional[datetime] = None

        want_yesterday = (time_reference == "yesterday") or (query_text and "yesterday" in query_text.lower())

        for s in sessions:
            msgs = (
                db.query(CustomerChatMessage)
                .filter(CustomerChatMessage.firebase_uid == owner_uid)
                .filter(CustomerChatMessage.session_id == s.session_id)
                .order_by(CustomerChatMessage.created_at.desc())
                .all()
            )
            if not msgs:
                continue

            # Look for recommendation messages
            rec_msg = next((m for m in msgs if m.role == "assistant" and isinstance(m.property_ids, list) and len(m.property_ids) > 0), None)
            
            if rec_msg:
                msg_dubai_date = get_dubai_date(rec_msg.created_at)
                days_diff = (now_dubai - msg_dubai_date).days

                if want_yesterday and days_diff == 1:
                    target_session = s
                    target_messages = msgs
                    target_time = rec_msg.created_at
                    # Resolve property IDs from inventory
                    for pid in rec_msg.property_ids:
                        p = get_property_by_id(pid)
                        if p:
                            found_properties.append(p)
                    break
                elif not want_yesterday and not target_session:
                    # Fallback to most recent session with recommendations
                    target_session = s
                    target_messages = msgs
                    target_time = rec_msg.created_at
                    for pid in rec_msg.property_ids:
                        p = get_property_by_id(pid)
                        if p:
                            found_properties.append(p)
                    if not want_yesterday:
                        break

        # If want_yesterday requested but not found exactly yesterday, use the most recent session with recommendations
        if want_yesterday and not target_session and sessions:
            for s in sessions:
                msgs = (
                    db.query(CustomerChatMessage)
                    .filter(CustomerChatMessage.firebase_uid == owner_uid)
                    .filter(CustomerChatMessage.session_id == s.session_id)
                    .order_by(CustomerChatMessage.created_at.desc())
                    .all()
                )
                rec_msg = next((m for m in msgs if m.role == "assistant" and isinstance(m.property_ids, list) and len(m.property_ids) > 0), None)
                if rec_msg:
                    target_session = s
                    target_messages = msgs
                    target_time = rec_msg.created_at
                    for pid in rec_msg.property_ids:
                        p = get_property_by_id(pid)
                        if p:
                            found_properties.append(p)
                    break

        if not target_session:
            target_session = sessions[0]

        if target_session and not target_messages:
            target_messages = (
                db.query(CustomerChatMessage)
                .filter(CustomerChatMessage.firebase_uid == owner_uid)
                .filter(CustomerChatMessage.session_id == target_session.session_id)
                .order_by(CustomerChatMessage.created_at.desc())
                .all()
            )

        # Extract criteria from user messages in that session
        from app.services.ollama_chat_service import extract_criteria_from_text
        merged_criteria: Dict[str, Any] = {}
        for m in reversed(target_messages):
            if m.role == "user" and m.text:
                c = extract_criteria_from_text(m.text)
                for k, v in c.items():
                    if v is not None:
                        merged_criteria[k] = v

        # Supplement with customer profile preferences if criteria still missing
        profile = db.query(CustomerProfile).filter(CustomerProfile.firebase_uid == owner_uid).first()
        if profile and profile.preferences and isinstance(profile.preferences, dict):
            p = profile.preferences
            if not merged_criteria.get("purpose") and p.get("purpose"):
                merged_criteria["purpose"] = p["purpose"]
            if not merged_criteria.get("property_type") and p.get("propertyType"):
                merged_criteria["property_type"] = p["propertyType"]
            if not merged_criteria.get("location") and p.get("locations"):
                merged_criteria["location"] = p["locations"][0] if isinstance(p["locations"], list) and p["locations"] else p["locations"]
            if merged_criteria.get("bedrooms") is None and p.get("bedrooms") is not None:
                merged_criteria["bedrooms"] = p["bedrooms"]
            if not merged_criteria.get("min_budget_aed") and p.get("budgetMin"):
                merged_criteria["min_budget_aed"] = p["budgetMin"]
            if not merged_criteria.get("max_budget_aed") and p.get("budgetMax"):
                merged_criteria["max_budget_aed"] = p["budgetMax"]

        # Calculate relative day in Dubai timezone
        rec_dubai_date = get_dubai_date(target_time) if target_time else now_dubai
        days_ago = (now_dubai - rec_dubai_date).days
        if days_ago == 0:
            rel_day = "today"
        elif days_ago == 1:
            rel_day = "yesterday"
        else:
            rel_day = f"{days_ago} days ago"

        return {
            "session_id": target_session.session_id,
            "session_title": target_session.title,
            "properties": found_properties,
            "criteria": merged_criteria,
            "recommendation_time": target_time,
            "relative_day_dubai": rel_day,
            "days_ago": days_ago,
        }
    except Exception as exc:
        logger.warning("Error retrieving customer conversation context: %s", exc)
        return None
    finally:
        if close_db:
            db.close()


def generate_recall_response(
    query_info: Dict[str, Any],
    context: Optional[Dict[str, Any]],
    owner_uid: Optional[str],
    user_message: str,
) -> Dict[str, Any]:
    """Generates the authoritative, natural response and matched properties for conversation recall queries."""
    if not owner_uid:
        return {
            "reply": "I remember helping you with properties, but since you are not signed in, I cannot securely access your previous recommendations. Please sign in to your LYKA account to view your past conversations, saved properties, and enquiries.",
            "matched_properties": [],
            "requirements": {},
            "options": ["Sign In", "Start Fresh Search", "Browse Communities"],
        }

    kind = query_info.get("kind")
    props = (context or {}).get("properties") or []
    criteria = (context or {}).get("criteria") or {}
    rel_day = (context or {}).get("relative_day_dubai") or "yesterday"
    crit_phrase = format_criteria_phrase(criteria)

    # 1. Recall recommendations ("Yesterday you recommended some properties" / "Show me yesterday's properties")
    if kind == "recommendations":
        if props:
            day_text = "Yesterday" if rel_day == "yesterday" else ("Earlier today" if rel_day == "today" else f"{rel_day.capitalize()}")
            crit_text = f", we explored {crit_phrase}" if crit_phrase else " we explored verified Dubai properties"
            reply = (
                f"Yes! {day_text}{crit_text}. "
                f"I found {len(props)} matching properties. Let me show you those options again."
            )
            return {
                "reply": reply,
                "matched_properties": props,
                "requirements": criteria,
                "options": ["Book a Viewing", "I liked the second property", "Adjust Budget", "Explore Other Areas"],
            }
        elif criteria:
            # Requirement 6: Honest missing history response
            return {
                "reply": f"I couldn't retrieve the exact properties from our previous conversation. I still have your search criteria ({crit_phrase}), so I can search for matching properties again.",
                "matched_properties": [],
                "requirements": criteria,
                "options": ["Search Again with Saved Criteria", "Start Fresh Search", "Adjust Budget"],
            }
        else:
            return {
                "reply": "I couldn't retrieve the exact properties from our previous conversation, and no saved search criteria were found. Let's start fresh — what type of property and community in Dubai are you looking for?",
                "matched_properties": [],
                "requirements": {},
                "options": ["Buy an Apartment", "Buy a Villa", "Rent in Dubai"],
            }

    # 2. Recall budget or criteria ("What was my previous budget?")
    if kind == "budget":
        b_val = criteria.get("max_budget_aed") or criteria.get("budget")
        min_b_val = criteria.get("min_budget_aed") or criteria.get("min_budget")

        def _fmt_val(v: Any) -> str:
            b_float = float(v)
            return f"AED {b_float / 1_000_000:.1f}M".replace(".0M", "M") if b_float >= 1_000_000 else f"AED {int(b_float):,}"

        if b_val and min_b_val:
            b_str = f"{_fmt_val(min_b_val)} – {_fmt_val(b_val)}"
        elif b_val:
            b_str = _fmt_val(b_val)
        elif min_b_val:
            b_str = f"from {_fmt_val(min_b_val)}"
        else:
            b_str = None

        if b_str:
            loc = criteria.get("location") or "Dubai"
            bhk = criteria.get("bedrooms")
            ptype = criteria.get("property_type") or "property"
            spec = f"{bhk} BHK {ptype}" if bhk is not None else ptype

            reply = f"In our previous search, your budget was {b_str} for a {spec} in {loc}. Would you like to keep this budget or adjust it?"
            return {
                "reply": reply,
                "matched_properties": props,
                "requirements": criteria,
                "options": ["Keep Current Budget", "Increase Budget", "Lower Budget", "Explore Other Areas"],
            }
        else:
            return {
                "reply": "I couldn't find a recorded budget from your previous conversation. What price range are you targeting for your Dubai property?",
                "matched_properties": [],
                "requirements": criteria,
                "options": ["Under AED 2M", "AED 2M - 4M", "AED 4M - 7M", "AED 7M+"],
            }

    # 3. Continue previous search ("Continue from where we stopped")
    if kind == "continue":
        if props:
            reply = (
                f"Welcome back! Continuing from where we stopped, we were exploring {crit_phrase}. "
                f"I have your {len(props)} recommended properties ready. Would you like to review them, refine your criteria, or schedule a viewing?"
            )
            return {
                "reply": reply,
                "matched_properties": props,
                "requirements": criteria,
                "options": ["Book a Viewing", "I liked the second property", "Refine Criteria", "Start Fresh"],
            }
        elif criteria:
            return {
                "reply": f"Welcome back! Continuing from where we stopped, your search was for {crit_phrase}. Let me know if you would like me to search for available listings now or adjust your criteria.",
                "matched_properties": [],
                "requirements": criteria,
                "options": ["Search Available Properties", "Adjust Criteria", "Start Fresh"],
            }
        else:
            return {
                "reply": "Welcome back! I couldn't find an active previous search. Let's start fresh — are you looking to buy or rent in Dubai?",
                "matched_properties": [],
                "requirements": {},
                "options": ["Buy", "Rent", "Invest"],
            }

    # 4. Follow up on individual recommendation ("I liked the second property" / "Can you show that villa again?")
    if kind == "followup":
        target_idx = query_info.get("target_index")
        target_type = query_info.get("target_type")

        selected_prop = None
        if props:
            if target_idx is not None and 0 <= target_idx < len(props):
                selected_prop = props[target_idx]
            elif target_idx == -1 and props:
                selected_prop = props[-1]
            elif target_type:
                selected_prop = next((p for p in props if str(p.get("property_type") or "").lower() == target_type), props[0])
            else:
                selected_prop = props[0]

        if selected_prop:
            title = selected_prop.get("title") or "Verified Property"
            loc = selected_prop.get("location") or "Dubai"
            ptype = selected_prop.get("property_type") or "Property"
            bhk = selected_prop.get("bedrooms") or selected_prop.get("bhk")
            price = selected_prop.get("price_aed", 0)
            avail = selected_prop.get("availability") or "Available"
            amenities = selected_prop.get("amenities") or []
            amen_str = ", ".join(amenities[:3]) if amenities else "premium features"

            ordinal_str = "second" if target_idx == 1 else ("first" if target_idx == 0 else ("third" if target_idx == 2 else "selected"))
            reply = (
                f"The {ordinal_str} property is {title} in {loc}. "
                f"It is a {bhk if bhk is not None else ''} BHK {ptype} priced at AED {price:,} with {avail} status. "
                f"It features {amen_str}. Would you like to schedule a private viewing or speak with our property advisor?"
            )
            return {
                "reply": reply,
                "matched_properties": [selected_prop],
                "requirements": criteria,
                "options": ["Schedule a Viewing", "Book a Call", "Show All Recommendations", "Compare Properties"],
            }
        else:
            return {
                "reply": "I couldn't retrieve the details for that specific property from our previous session. Would you like me to show the recommended properties again or search for new options?",
                "matched_properties": [],
                "requirements": criteria,
                "options": ["Show Previous Recommendations", "Start Fresh Search"],
            }

    return {
        "reply": "I remember our previous conversation. Would you like to review your previous recommendations or start a new search?",
        "matched_properties": props,
        "requirements": criteria,
        "options": ["Show Previous Recommendations", "Start Fresh Search"],
    }
