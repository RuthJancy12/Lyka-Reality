"""English-Only language policy for LYKA AI Property Assistant.

All assistant responses are strictly in English.
If input in another language or script is detected, the assistant politely responds in English.
"""

from __future__ import annotations

import re
from typing import Optional

SUPPORTED_LANGUAGES = ("en",)
LANGUAGE_NAMES = {"en": "English"}

_TAMIL_SCRIPT = re.compile(r"[\u0B80-\u0BFF]")
_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_ARABIC = re.compile(r"[\u0600-\u06FF\u0750-\u077F]")
_OTHER_UNSUPPORTED = re.compile(
    r"[\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0C00-\u0C7F\u0E00-\u0E7F"
    r"\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]"
)

_EXPLICIT_NON_ENGLISH = re.compile(
    r"(?:\b(?:reply|respond|answer|speak|talk|write|continue)\s+(?:to\s+me\s+)?in\s+"
    r"(?:tamil|tanglish|arabic|hindi|urdu|malayalam|telugu|french|german|spanish|chinese|russian)\b"
    r"|\b(?:in|use)\s+(?:tamil|tanglish|arabic|hindi|urdu|malayalam|telugu|french|german|spanish|chinese|russian)\b"
    r"|[\u0B80-\u0BFF\u0900-\u097F\u0600-\u06FF\u0750-\u077F])",
    re.IGNORECASE,
)

_PAUSE_PATTERNS = (
    re.compile(
        r"\b(?:i(?:'?m| am|'ll be| will be)\s+(?:a\s+bit\s+|kinda\s+|really\s+|"
        r"super\s+|quite\s+|very\s+|a\s+little\s+)?busy"
        r"|busy\s+(?:now|right now|at the moment|here|tonight|today|working|driving)"
        r"|in (?:a|the)\s+meeting|on (?:a|the|my)\s+(?:phone|call)"
        r"|call(?:ed)?\s+(?:me\s+)?(?:back|later)|text\s+me\s+later"
        r"|be\s+right\s+back|brb|catch\s+me\s+later|chat\s+later"
        r"|come\s+back\s+(?:later|shortly|soon)"
        r"|will\s+(?:be\s+)?back\s+(?:in|shortly|soon|later))\b",
        re.IGNORECASE,
    ),
)

_THANKS_PATTERNS = (
    re.compile(r"\b(?:thank|thanks|thx|thank you|appreciate it)\b", re.IGNORECASE),
)

_BYE_PATTERNS = (
    re.compile(
        r"\b(?:bye|goodbye|cya|see you|take care|have a good (?:day|night|one))\b",
        re.IGNORECASE,
    ),
)

_GREETING_PATTERNS = (
    re.compile(
        r"^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|howdy|"
        r"hi\s+there|hello\s+there|hey\s+there|"
        r"(?:hello|hi|hey)\s+good\s+(?:morning|afternoon|evening))[!., ]*$",
        re.IGNORECASE,
    ),
)

_HOW_ARE_YOU_PATTERNS = (
    re.compile(
        r"\b(?:how are you|how're you|how do you do|how is it going|"
        r"how's it going|how are things)\b",
        re.IGNORECASE,
    ),
)

_RESET_PATTERNS = (
    re.compile(
        r"\b(?:start (?:a )?fresh(?: search)?|start (?:a )?new search|start over|fresh start|clear (?:filters|search|everything)|"
        r"reset(?: (?:filters|search|conversation))?|new search|start again)\b",
        re.IGNORECASE,
    ),
)

_AFFIRMATIVE = re.compile(
    r"\b(?:yes|yeah|yep|sure|ok|okay|alright|definitely|absolutely|fine|go ahead)\b",
    re.IGNORECASE,
)

_NEGATIVE = re.compile(
    r"\b(?:no|nope|not really|don't|dont|never mind|cancel)\b",
    re.IGNORECASE,
)

_UNSURE = re.compile(
    r"\b(?:not sure|don't know|dont know|maybe|undecided|either)\b",
    re.IGNORECASE,
)


def _has_any(patterns: tuple, text: str) -> bool:
    target = text or ""
    return any(p.search(target) for p in patterns)


def is_pause_message(text: str) -> bool:
    return _has_any(_PAUSE_PATTERNS, text)


def is_thanks_message(text: str) -> bool:
    return _has_any(_THANKS_PATTERNS, text)


def is_bye_message(text: str) -> bool:
    return _has_any(_BYE_PATTERNS, text)


def is_greeting_message(text: str) -> bool:
    stripped = (text or "").strip()
    return _has_any(_GREETING_PATTERNS, stripped)


def is_how_are_you_message(text: str) -> bool:
    return _has_any(_HOW_ARE_YOU_PATTERNS, text)


def is_reset_message(text: str) -> bool:
    return _has_any(_RESET_PATTERNS, text)


def is_affirmative(text: str) -> bool:
    return bool(_AFFIRMATIVE.search((text or "").strip()))


def is_negative(text: str) -> bool:
    return bool(_NEGATIVE.search((text or "").strip()))


def is_unsure(text: str) -> bool:
    return bool(_UNSURE.search(text or ""))


def is_unsupported_language_input(text: str) -> bool:
    """True when input is written in a non-English script or explicitly asks for non-English."""
    sample = text or ""
    if _EXPLICIT_NON_ENGLISH.search(sample):
        return True
    if _OTHER_UNSUPPORTED.search(sample) or _TAMIL_SCRIPT.search(sample) or _DEVANAGARI.search(sample) or _ARABIC.search(sample):
        return True
    return False


def requested_language(text: str) -> Optional[str]:
    return "en"


def detect_tanglish(text: str) -> bool:
    return False


def detect_language(text: str) -> str:
    return "en"


def detect_style(text: str, previous_language: str = "en", previous_style: str = "english") -> str:
    return "english"


def resolve_language(text: str, previous: str = "en") -> str:
    return "en"


def has_unsupported_script(text: str, language: str = "en") -> bool:
    sample = text or ""
    return bool(_TAMIL_SCRIPT.search(sample) or _DEVANAGARI.search(sample) or _ARABIC.search(sample) or _OTHER_UNSUPPORTED.search(sample))


def has_repeated_phrase(text: str, min_chars: int = 32) -> bool:
    sample = re.sub(r"\s+", " ", text or "").strip()
    if len(sample) < min_chars * 2:
        return False
    for i in range(0, len(sample) - min_chars + 1):
        phrase = sample[i:i + min_chars]
        if sample.find(phrase, i + min_chars) != -1:
            return True
    return False


def style_consistent(text: str, style: str) -> bool:
    return True


def _localized_table() -> dict:
    t = {
        "pause": {
            "en": "No problem! Take your time. Whenever you're ready, simply message me and we will continue your Dubai property search.",
        },
        "thanks": {
            "en": "You're very welcome! I'm here to help with all your Dubai property questions, floor plans, and viewings.",
        },
        "bye": {
            "en": "Goodbye for now! Wishing you a wonderful day. Come back anytime — LYKA Realty is always here to assist you.",
        },
        "how_are_you": {
            "en": "I'm doing well, thank you for asking! How are you today, and what kind of Dubai property can I help you find?",
        },
        "reset": {
            "en": "Fresh start — I've cleared your earlier search preferences. Are you looking to buy or rent in Dubai?",
        },
        "greeting": {
            "en": "Hello! Welcome to LYKA Realty. What kind of property are you looking for in Dubai?",
        },
        "offline": {
            "en": "I'm sorry — the assistant service is temporarily unavailable. Please try again in a moment. Nothing was lost.",
        },
        "unsupported_language": {
            "en": "I am LYKA Realty's AI Property Assistant. I provide real estate advisory in English. How may I assist you with Dubai property discovery today?",
        },
        "retry_style": {
            "en": "I want to give you a precise answer. Could you please rephrase that in a sentence?",
        },
        "unknown_listing_fact": {
            "en": "That detail is not recorded in this official property listing, so I cannot confirm it. I'd rather be honest than guess.",
        },
        "no_property_context": {
            "en": "I don't have a specific property open in front of us yet. Tell me the property reference or community you'd like to explore, and I will check the verified details.",
        },
        "found": {
            "en": "I found {n} verified {bhk}{ptype} options in {loc}. The details and exact prices are shown below.{purpose_note}",
        },
        "found_nearby": {
            "en": "I couldn't find an exact match in {loc}, but these {n} verified {bhk}{ptype} alternatives are nearby in {actuals}. Their verified details are shown below.{purpose_note}",
        },
        "purpose_note": {
            "en": " I haven't filtered by buy or rent yet — let me know your preference and I will tailor the listings.",
        },
        "acknowledgement": {
            "en": "Understood. Please let me know when you would like to refine your criteria or explore specific Dubai communities.",
        },
        "help": {
            "en": "I can help you search luxury apartments, villas, townhouses, and penthouses across Dubai, filter by budget, location, and amenities, compare listings, and book verified viewings.",
        },
        "no_more_results": {
            "en": "You have viewed all current matching properties for this search in our database. Would you like to adjust your budget or explore neighboring communities?",
        },
    }
    # Provide identical English fallbacks for any legacy language keys
    for key, dict_val in t.items():
        en_copy = dict_val["en"]
        dict_val["ta"] = en_copy
        dict_val["tanglish"] = en_copy
        dict_val["ar"] = en_copy
        dict_val["hi"] = en_copy
    return t


_STRINGS = _localized_table()


def localized_string(kind: str, style: str = "english", **kwargs: object) -> str:
    entry = _STRINGS.get(kind, {})
    template = entry.get(style) or entry.get("en", "")
    if not template:
        return ""
    try:
        return template.format(**kwargs)
    except KeyError:
        return template


localized = localized_string


def looks_like_echo(reply: str, user_text: str) -> bool:
    r = (reply or "").strip().lower()
    u = (user_text or "").strip().lower()
    if not r or not u:
        return False
    return r == u or (len(r) > 10 and r == u[:len(r)])


def unsupported_language_requested(text: str) -> bool:
    return is_unsupported_language_input(text)


def is_non_english_script(text: str) -> bool:
    return has_unsupported_script(text)


def enforce_english_reply(text: str) -> str:
    return (
        "LYKA Realty provides consultation exclusively in English. "
        "How may I assist you with Dubai property discovery today?"
    )


def detect_language_preference(text: str) -> str:
    return "en"

