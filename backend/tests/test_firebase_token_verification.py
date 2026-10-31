import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Hermetic unit tests for Firebase ID token verification.

Verifies:
1. Missing Authorization headers return None.
2. Malformed Authorization headers (non-Bearer) return None.
3. Invalid or corrupt token signatures return None.
4. Wrong project ID / audience tokens are rejected (return None).
5. Expired tokens are rejected (return None).
6. Valid verified tokens extract correct uid and email.
7. Missing configuration (no project ID) returns None safely without raising.
8. Admin SDK strategy precedence and graceful cloud fallback when credentials are unavailable.

Uses mocks and simulated claims — zero real secrets, credentials, or network calls.
Run: python test_firebase_token_verification.py
"""
import os
import unittest
from unittest.mock import MagicMock, patch

from app.services import firebase_auth


class TestFirebaseTokenVerification(unittest.TestCase):

    def setUp(self):
        # Reset cached app flag for tests
        firebase_auth._admin_app_initialized = False

    def test_missing_authorization_header(self):
        self.assertIsNone(firebase_auth.verify_bearer_token(None))
        self.assertIsNone(firebase_auth.verify_bearer_token(""))
        self.assertIsNone(firebase_auth.verify_bearer_token("   "))

    def test_malformed_authorization_header(self):
        self.assertIsNone(firebase_auth.verify_bearer_token("Basic dXNlcjpwYXNz"))
        self.assertIsNone(firebase_auth.verify_bearer_token("Token 12345"))
        self.assertIsNone(firebase_auth.verify_bearer_token("Bearer"))
        self.assertIsNone(firebase_auth.verify_bearer_token("Bearer "))
        self.assertIsNone(firebase_auth.verify_bearer_token("Bearer    "))

    def test_invalid_or_corrupt_token(self):
        # Without mocking, an actual corrupt token fails public cert verification
        result = firebase_auth.verify_bearer_token("Bearer not.a.real.jwt.token")
        self.assertIsNone(result)

    @patch("google.oauth2.id_token.verify_firebase_token")
    @patch("app.services.firebase_auth._ensure_admin", return_value=False)
    def test_wrong_audience_rejected(self, mock_admin, mock_verify):
        mock_verify.side_effect = ValueError("Token has wrong audience, expected real-estimate-6b291")
        result = firebase_auth.verify_bearer_token("Bearer some.token.payload")
        self.assertIsNone(result)

    @patch("google.oauth2.id_token.verify_firebase_token")
    @patch("app.services.firebase_auth._ensure_admin", return_value=False)
    def test_expired_token_rejected(self, mock_admin, mock_verify):
        mock_verify.side_effect = ValueError("Token expired")
        result = firebase_auth.verify_bearer_token("Bearer expired.jwt.token")
        self.assertIsNone(result)

    @patch("google.oauth2.id_token.verify_firebase_token")
    @patch("app.services.firebase_auth._ensure_admin", return_value=False)
    def test_valid_token_extracts_claims(self, mock_admin, mock_verify):
        mock_verify.return_value = {
            "sub": "mock_uid_12345",
            "email": "employee@lyka.ae",
            "aud": "real-estimate-6b291",
            "iss": "https://securetoken.google.com/real-estimate-6b291",
        }
        result = firebase_auth.verify_bearer_token("Bearer valid.mock.jwt")
        self.assertIsNotNone(result)
        self.assertEqual(result["uid"], "mock_uid_12345")
        self.assertEqual(result["email"], "employee@lyka.ae")

    @patch.dict(os.environ, {"FIREBASE_PROJECT_ID": ""}, clear=False)
    @patch("app.services.firebase_auth._ensure_admin", return_value=False)
    def test_missing_project_id_config_safe(self, mock_admin):
        # When FIREBASE_PROJECT_ID is empty/absent
        with patch.object(firebase_auth.os, "getenv", return_value=""):
            result = firebase_auth.verify_bearer_token("Bearer valid.mock.jwt")
            self.assertIsNone(result)

    @patch("app.services.firebase_auth._ensure_admin", return_value=True)
    def test_admin_sdk_precedence_when_configured(self, mock_admin):
        mock_admin_auth = MagicMock()
        mock_admin_auth.verify_id_token.return_value = {
            "uid": "admin_sdk_uid_789",
            "email": "admin@lyka.ae",
        }
        with patch.dict("sys.modules", {"firebase_admin.auth": mock_admin_auth}):
            result = firebase_auth.verify_bearer_token("Bearer test.token")
            self.assertIsNotNone(result)
            self.assertEqual(result["uid"], "admin_sdk_uid_789")
            self.assertEqual(result["email"], "admin@lyka.ae")

    @patch("google.oauth2.id_token.verify_firebase_token")
    @patch("app.services.firebase_auth._ensure_admin", return_value=True)
    def test_admin_sdk_cloud_failure_falls_back_to_public_certs(self, mock_admin, mock_verify):
        # Simulates Render container: admin SDK throws DefaultCredentialsError,
        # fallback to public x509 certs verifies the token successfully.
        mock_admin_auth = MagicMock()
        mock_admin_auth.verify_id_token.side_effect = Exception("DefaultCredentialsError: ADC not found")

        mock_verify.return_value = {
            "user_id": "fallback_uid_456",
            "email": "fallback@lyka.ae",
            "aud": "real-estimate-6b291",
        }

        with patch.dict("sys.modules", {"firebase_admin.auth": mock_admin_auth}):
            result = firebase_auth.verify_bearer_token("Bearer cloud.token")
            self.assertIsNotNone(result)
            self.assertEqual(result["uid"], "fallback_uid_456")
            self.assertEqual(result["email"], "fallback@lyka.ae")


if __name__ == "__main__":
    unittest.main()
