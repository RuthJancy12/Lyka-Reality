from datetime import datetime, timezone
import uuid


def utc_now() -> datetime:
    """Return timezone-aware current UTC datetime."""
    return datetime.now(timezone.utc)


def generate_uuid() -> str:
    """Generate a clean RFC 4122 v4 UUID string."""
    return str(uuid.uuid4())

