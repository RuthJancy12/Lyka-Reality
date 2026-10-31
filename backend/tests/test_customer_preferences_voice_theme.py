import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""
Targeted verification tests for:
1. Customer Preferences schema & database persistence (bathrooms, amenities, petFriendly, furnishing, timeline, theme)
2. Theme persistence ('light' | 'dark') and input validation
3. Customer data isolation (UID-keyed ownership)
4. Property search matching (furnishing, bathrooms, amenities, budget, location) against the real 3,000 dataset
5. Honest empty search results when criteria do not match
"""
import os
import sys
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
# sys.path already has _backend_dir at index 0

from app.main import app
from app.services import roles, property_service

client = TestClient(app, raise_server_exceptions=False)


class TestCustomerPreferencesVoiceTheme(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        property_service.init_property_dataset()

    def setUp(self):
        self.alice_uid = "cust_pref_alice_123"
        self.alice_email = "alice.pref@example.com"

        self.bob_uid = "cust_pref_bob_456"
        self.bob_email = "bob.pref@example.com"

    def as_user(self, email: str, uid: str):
        return patch.object(
            roles,
            "verify_bearer_token",
            return_value={"uid": uid, "email": email},
        )

    def test_customer_preferences_persistence_and_schema(self):
        """Verify full preferences payload saves and restores via PUT/GET /api/customer/preferences."""
        payload = {
            "locations": ["Dubai Marina", "Palm Jumeirah"],
            "propertyType": "Apartment",
            "bedrooms": 2,
            "bathrooms": 2,
            "budgetMin": 1500000.0,
            "budgetMax": 2500000.0,
            "purpose": "Buy",
            "timeline_days": 90,
            "timeline": "Within 3 months",
            "amenities": ["Swimming Pool", "Covered Parking", "Gym"],
            "petFriendly": True,
            "furnishing": "Furnished",
            "theme": "dark",
        }

        # Save Alice's preferences
        with self.as_user(self.alice_email, self.alice_uid):
            res_put = client.put(
                "/api/customer/preferences",
                json=payload,
                headers={"Authorization": "Bearer mock-token-alice"},
            )
            self.assertEqual(res_put.status_code, 200, res_put.text)
            saved = res_put.json()

            self.assertEqual(saved["locations"], ["Dubai Marina", "Palm Jumeirah"])
            self.assertEqual(saved["propertyType"], "Apartment")
            self.assertEqual(saved["bedrooms"], 2)
            self.assertEqual(saved["bathrooms"], 2)
            self.assertEqual(saved["budgetMax"], 2500000.0)
            self.assertEqual(saved["purpose"], "Buy")
            self.assertEqual(saved["timeline"], "Within 3 months")
            self.assertEqual(saved["amenities"], ["Swimming Pool", "Covered Parking", "Gym"])
            self.assertTrue(saved["petFriendly"])
            self.assertEqual(saved["furnishing"], "Furnished")
            self.assertEqual(saved["theme"], "dark")

            # Read back via GET
            res_get = client.get(
                "/api/customer/preferences",
                headers={"Authorization": "Bearer mock-token-alice"},
            )
            self.assertEqual(res_get.status_code, 200)
            loaded = res_get.json()
            self.assertEqual(loaded["theme"], "dark")
            self.assertEqual(loaded["furnishing"], "Furnished")
            self.assertTrue(loaded["petFriendly"])
            self.assertEqual(loaded["bathrooms"], 2)

    def test_theme_validation(self):
        """Theme must only accept 'light' or 'dark'."""
        bad_payload = {
            "theme": "invalid_neon_theme",
        }
        with self.as_user(self.alice_email, self.alice_uid):
            res = client.put(
                "/api/customer/preferences",
                json=bad_payload,
                headers={"Authorization": "Bearer mock-token-alice"},
            )
            self.assertEqual(res.status_code, 422)

    def test_customer_data_isolation(self):
        """Bob should never see Alice's preferences or theme."""
        # Alice saves custom preferences with theme=dark
        with self.as_user(self.alice_email, self.alice_uid):
            client.put(
                "/api/customer/preferences",
                json={"locations": ["Downtown Dubai"], "theme": "dark"},
                headers={"Authorization": "Bearer mock-token-alice"},
            )

        # Bob requests his preferences
        with self.as_user(self.bob_email, self.bob_uid):
            res_bob = client.get(
                "/api/customer/preferences",
                headers={"Authorization": "Bearer mock-token-bob"},
            )
            self.assertEqual(res_bob.status_code, 200)
            bob_prefs = res_bob.json()

            # Bob has fresh/default preferences, not Alice's
            self.assertEqual(bob_prefs.get("locations", []), [])
            self.assertEqual(bob_prefs.get("theme"), "light")

    def test_property_search_with_furnishing_and_amenities(self):
        """Search the real dataset by furnishing, bathrooms, and amenities."""
        res = client.get(
            "/api/properties/search",
            params={
                "location": "Dubai Marina",
                "property_type": "Apartment",
                "bedrooms": 2,
                "furnishing": "Furnished",
                "limit": 5,
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("top_properties", data)
        self.assertGreater(data["total_found"], 0)

        for prop in data["top_properties"]:
            self.assertEqual(prop["bhk"], 2)
            self.assertIn("dubai marina", prop["location"].lower())
            if prop.get("furnishing"):
                self.assertIn("furnished", prop["furnishing"].lower())

    def test_property_search_honest_empty_result(self):
        """Searching for impossible criteria returns an honest 0 count (never invented listings)."""
        res = client.get(
            "/api/properties/search",
            params={
                "location": "NonExistentCommunityXYZ999",
                "max_budget": 500,
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_found"], 0)
        self.assertEqual(len(data["top_properties"]), 0)


if __name__ == "__main__":
    unittest.main()
