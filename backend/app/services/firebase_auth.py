"""
Firebase ID-token verification for LYKA Realty (optional, non-enforcing).

The chatbot and property search remain public so existing functionality —
including voice and anonymous dataset search — keeps working. When the server
is configured for Firebase (firebase-admin installed AND one of
FIREBASE_PROJECT_ID / FIREBASE_CREDENTIALS_JSON / GOOGLE_APPLICATION_CREDENTIALS
present), a valid `Authorization: Bearer <Firebase ID token>` header is
verified with the Admin SDK and the caller identity is returned. Otherwise
(and on any verification failure) this module returns None and requests
proceed anonymously.

Security rules:
- Never trust a uid/email supplied by the frontend; only verified token claims.
- Service-account private keys stay on the server (env vars), never frontend.
- To enforce auth on an endpoint later, check the return value and raise 401
  when it is None — do not add enforcement silently.
"""

import json
import logging
import os
from typing import Any, Dict, Optional
from dotenv import load_dotenv

logger = logging.getLogger("lyka.firebase_auth")

_backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_env_path = os.path.join(_backend_dir, ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path)
else:
    load_dotenv()

_admin_app_initialized = False


def _ensure_admin() -> bool:
    """Initializes firebase_admin lazily. Returns True when verification is available."""
    global _admin_app_initialized
    if _admin_app_initialized:
        return True
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError:
        logger.info("firebase-admin not installed — Firebase verification disabled.")
        return False

    try:
        # If the default Firebase app is already initialized, reuse it safely.
        try:
            firebase_admin.get_app()
            _admin_app_initialized = True
            return True
        except ValueError:
            pass

        project_id = os.getenv("FIREBASE_PROJECT_ID")
        creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
        sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if not sa_path or not os.path.exists(sa_path):
            candidate = os.path.join(_backend_dir, "firebase-service-account.json")
            if os.path.exists(candidate):
                sa_path = candidate

        if creds_json:
            cred = credentials.Certificate(json.loads(creds_json))
            firebase_admin.initialize_app(cred, {"projectId": project_id} if project_id else None)
            _admin_app_initialized = True
            logger.info("Firebase Admin initialized from FIREBASE_CREDENTIALS_JSON.")
            return True
        elif sa_path and os.path.exists(sa_path):
            cred = credentials.Certificate(sa_path)
            firebase_admin.initialize_app(cred, {"projectId": project_id} if project_id else None)
            _admin_app_initialized = True
            logger.info("Firebase Admin initialized from service account file.")
            return True
        else:
            # Without explicit credentials, we do not initialize a credential-less Admin app
            # that would fail on non-GCP cloud hosts. Strategy 2 verifies tokens directly
            # using Google public x509 certificates.
            logger.info("No service account file found; token verification uses Google public certificates.")
            return False
    except Exception as e:
        logger.warning("Firebase Admin init failed — using public cert fallback: %s", e)
        return False


def _verify_token_with_public_certs(token: str, project_id: str) -> Optional[Dict[str, Any]]:
    """
    Cryptographically verifies a Firebase ID token using Google public x509 certs.
    Validates token signature, issuer, audience/project ID, expiration, and timestamps.
    Requires no service-account private key.
    """
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        request_adapter = google_requests.Request()
        claims = google_id_token.verify_firebase_token(
            token,
            request_adapter,
            audience=project_id,
            clock_skew_in_seconds=60,
        )
        uid = claims.get("user_id") or claims.get("sub") or claims.get("uid")
        email = claims.get("email")
        if uid or email:
            return {
                "uid": uid,
                "email": email,
                "email_verified": claims.get("email_verified") is True,
            }
    except Exception as e:
        logger.info("Google public cert token verification failed: %s: %s", type(e).__name__, e)
    return None


def verify_bearer_token(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Verifies `Authorization: Bearer <token>` and returns the decoded claims
    (uid, email, ...) or None when unavailable/invalid. Never raises.
    """
    if not authorization or not authorization.startswith("Bearer "):
        logger.info("Firebase token verification failed: missing or malformed Authorization header")
        return None
    token = authorization[len("Bearer "):].strip()
    if not token:
        return None

    # Strategy 1: Firebase Admin SDK (used when service account credentials are provided)
    if _ensure_admin():
        try:
            from firebase_admin import auth as admin_auth
            # Tokens are minted by Google's servers: tolerate clock drift up to the SDK cap (60s).
            claims = admin_auth.verify_id_token(token, clock_skew_seconds=60)
            return {"uid": claims.get("uid"), "email": claims.get("email")}
        except Exception as e:
            logger.info("Firebase Admin token verification failed: %s: %s", type(e).__name__, e)

    # Strategy 2: Google public x509 certs verification via google-auth (resilient cloud fallback, zero private keys needed)
    project_id = os.getenv("FIREBASE_PROJECT_ID") or "real-estimate-6b291"
    if not project_id:
        logger.warning("Firebase token verification failed: FIREBASE_PROJECT_ID is not configured")
        return None

    return _verify_token_with_public_certs(token, project_id)
