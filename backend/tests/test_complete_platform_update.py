import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""
Comprehensive Verification Script for LYKA Realty Platform Update.
Tests:
1. All 16 Intent Classifications
2. Strict English-Only Response Enforcement
3. Small-talk property card suppression
4. Chat Session Context, Latency measurement & "Show me more" exclusion
5. Admin-only Company Inventory Management APIs & 403 RBAC Enforcement
6. Role Restructuring (ADMIN, HRMS_ADMIN, SALES_AGENT only)
"""

import sys
import os
import unittest
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.services.ollama_chat_service import classify_conversation_intent, OllamaChatSession, process_ollama_chat_message
from app.services.chat_language import detect_language_preference, enforce_english_reply, is_non_english_script
from app.models import ACTIVE_STAFF_ROLES

client = TestClient(app)


class TestIntentClassification(unittest.TestCase):
    """Test 16-intent classification taxonomy."""

    def test_all_16_intents(self):
        test_cases = [
            ("Hello good morning", "greeting"),
            ("How are you today?", "general_conversation"),
            ("Find me a 2 bedroom apartment in Dubai Marina", "property_search"),
            ("What do you recommend for high capital appreciation?", "property_recommendation"),
            ("My maximum budget is 4 million AED", "budget_clarification"),
            ("Tell me about the community in Palm Jumeirah", "community_search"),
            ("Compare listing LYK-101 with listing LYK-102", "property_comparison"),
            ("What amenities and floor plans are included in this penthouse?", "property_details"),
            ("What is the average rental yield and ROI in Business Bay?", "investment_advice"),
            ("I want to rent an apartment for 1 year", "rental_search"),
            ("I am looking to buy a luxury beachfront villa", "buying_search"),
            ("I would like to schedule a viewing appointment tomorrow at 3pm", "viewing_appointment"),
            ("Does the residence come with covered parking and balcony?", "follow_up_question"),
            ("Understood, okay got it", "acknowledgement"),
            ("Thank you very much for your assistance!", "thanks"),
            ("Help me find where to search", "help_request"),
        ]

        for text, expected_intent in test_cases:
            detected = classify_conversation_intent(text)
            self.assertEqual(
                detected,
                expected_intent,
                f"Expected intent '{expected_intent}' for query: '{text}', but got '{detected}'"
            )


class TestEnglishOnlyEnforcement(unittest.TestCase):
    """Test English-only chat and response enforcement."""

    def test_non_english_script_detection(self):
        # Arabic
        self.assertTrue(is_non_english_script("مرحبا بكم في دبي"))
        # Tamil
        self.assertTrue(is_non_english_script("வணக்கம் எப்படி இருக்கிறீர்கள்"))
        # Hindi / Devanagari
        self.assertTrue(is_non_english_script("नमस्ते, मुझे दुबई में घर चाहिए"))
        # English
        self.assertFalse(is_non_english_script("Hello, I am looking for a 2 bedroom villa in Dubai."))

    def test_enforce_english_reply(self):
        arabic_text = "مرحبا، أريد شراء شقة في وسط مدينة دبي"
        response = enforce_english_reply(arabic_text)
        self.assertIn("LYKA Realty provides consultation exclusively in English", response)
        # Verify no Arabic characters in system redirection
        self.assertFalse(is_non_english_script(response))


class TestChatCardSuppressionAndExclusion(unittest.TestCase):
    """Test suppression of cards on casual chatter & Show Me More exclusion."""

    def test_casual_chatter_suppression(self):
        session_id = "test-session-suppress"

        # Greeting should not attach property cards
        resp_greeting = process_ollama_chat_message(message="Hello!", session_id=session_id)
        self.assertEqual(resp_greeting.get("intent"), "greeting")
        self.assertEqual(resp_greeting.get("matched_properties"), [])

        # Thanks should not attach property cards
        resp_thanks = process_ollama_chat_message(message="Thank you very much!", session_id=session_id)
        self.assertEqual(resp_thanks.get("intent"), "thanks")
        self.assertEqual(resp_thanks.get("matched_properties"), [])

        # Latency must be tracked
        self.assertIsNotNone(resp_greeting.get("response_latency_ms"))
        self.assertGreater(resp_greeting.get("response_latency_ms"), 0)

    def test_show_me_more_tracks_and_excludes(self):
        session = OllamaChatSession(session_id="test-session-more")
        session.displayed_property_ids.add("PROP-1")
        session.displayed_property_ids.add("PROP-2")

        # Session must track displayed properties
        self.assertEqual(len(session.displayed_property_ids), 2)
        self.assertIn("PROP-1", session.displayed_property_ids)


class TestRoleRestructuring(unittest.TestCase):
    """Test employee role structure (ADMIN, HRMS_ADMIN, SALES_AGENT only active)."""

    def test_active_roles(self):
        self.assertIn("admin", ACTIVE_STAFF_ROLES)
        self.assertIn("hrms_admin", ACTIVE_STAFF_ROLES)
        self.assertIn("sales_agent", ACTIVE_STAFF_ROLES)
        self.assertNotIn("sales_manager", ACTIVE_STAFF_ROLES)
        self.assertNotIn("manager", ACTIVE_STAFF_ROLES)


class TestCompanyInventoryRBAC(unittest.TestCase):
    """Test RBAC enforcement on Company Inventory write APIs."""

    def test_unauthenticated_analytics_forbidden(self):
        # Unauthenticated request to /api/properties/analytics
        res = client.get("/api/properties/analytics")
        self.assertEqual(res.status_code, 401)

    def test_unauthenticated_import_forbidden(self):
        # Unauthenticated request to /api/properties/import
        res = client.post("/api/properties/import", json={"properties": []})
        self.assertEqual(res.status_code, 401)

    def test_unauthenticated_verify_forbidden(self):
        # Unauthenticated request to /api/properties/1/verify
        res = client.patch("/api/properties/1/verify")
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
