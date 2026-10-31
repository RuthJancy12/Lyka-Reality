import re
from typing import Optional


def format_aed(amount: Optional[float]) -> str:
    """Format numeric currency value to standard UAE Dirhams presentation."""
    if amount is None:
        return "N/A"
    return f"AED {amount:,.0f}" if amount == int(amount) else f"AED {amount:,.2f}"


def normalize_uae_phone(phone: Optional[str]) -> str:
    """Normalizes phone numbers to standard UAE international format (+971...)."""
    if not phone:
        return ""
    digits = re.sub(r"[^\d+]", "", phone.strip())
    if digits.startswith("05") and len(digits) == 10:
        return f"+971{digits[1:]}"
    if digits.startswith("9715") and not digits.startswith("+"):
        return f"+{digits}"
    return digits

