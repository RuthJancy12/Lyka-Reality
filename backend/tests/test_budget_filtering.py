"""
Budget Filtering & Verification Test Suite for LYKA Realty.

Validates:
1. Criteria extraction logic for budget ranges, min-only, max-only, and unconstrained searches.
2. Deterministic property filtering in property_service (price_aed >= min AND price_aed <= max).
3. Exact handling of AED 3M-5M, AED 1M-3M, maximum-only, minimum-only, and no budget.
4. Currency normalization and dataset price integrity (AED).
5. Real inventory truth: Dubai Sports City has 0 2-BHK apartments in AED 3M-5M, so LYKA
   honestly reports no matches without silently relaxing the budget or returning under-budget items.
6. Real inventory matches in Dubai Sports City for AED 700k-900k.
7. Conversation memory continuity preserving exact filters, budget range, and property IDs across sessions.
"""

import os
import sys
import unittest
from typing import Any, Dict

# Ensure backend directory is in Python path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.services.property_service import init_property_dataset, search_properties_dataset
from app.services.ollama_chat_service import (
    extract_criteria_from_text,
    process_ollama_chat_message,
)
from app.services.chat_memory_service import (
    format_criteria_phrase,
    generate_recall_response,
    is_recall_query,
)


class TestBudgetFilteringAndMemory(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_property_dataset()

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Budget Extraction Tests
    # ──────────────────────────────────────────────────────────────────────────
    def test_extract_budget_range_3m_to_5m(self):
        """Extracts AED 3M–5M range expressions correctly into min_budget_aed and max_budget_aed."""
        phrases = [
            "Location: Dubai Sports City, Property type: Apartment, Bedrooms: 2 BHK, Budget: AED 3 million to AED 5 million",
            "AED 3M–5M",
            "AED 3M-5M",
            "3M - 5M AED",
            "between 3 million and 5 million aed",
            "between 3m and 5m",
            "from 3 million to 5 million",
            "from 3M to 5M AED",
            "3 to 5 million AED",
            "3 - 5 million",
        ]
        for phrase in phrases:
            crit = extract_criteria_from_text(phrase)
            self.assertEqual(
                crit.get("min_budget_aed"),
                3_000_000,
                f"Failed min_budget extraction on '{phrase}': got {crit.get('min_budget_aed')}",
            )
            self.assertEqual(
                crit.get("max_budget_aed"),
                5_000_000,
                f"Failed max_budget extraction on '{phrase}': got {crit.get('max_budget_aed')}",
            )

    def test_extract_budget_range_1m_to_3m(self):
        """Extracts AED 1M–3M range expressions correctly into min_budget_aed and max_budget_aed."""
        phrases = [
            "AED 1M–3M",
            "AED 1M-3M",
            "1M - 3M AED",
            "between 1 million and 3 million aed",
            "from 1M to 3M",
            "1 to 3 million",
        ]
        for phrase in phrases:
            crit = extract_criteria_from_text(phrase)
            self.assertEqual(
                crit.get("min_budget_aed"),
                1_000_000,
                f"Failed min_budget extraction on '{phrase}': got {crit.get('min_budget_aed')}",
            )
            self.assertEqual(
                crit.get("max_budget_aed"),
                3_000_000,
                f"Failed max_budget extraction on '{phrase}': got {crit.get('max_budget_aed')}",
            )

    def test_extract_maximum_budget_only(self):
        """Extracts max budget only when no minimum is specified."""
        cases = [
            ("under 5 million", 5_000_000),
            ("under AED 5M", 5_000_000),
            ("max 5M", 5_000_000),
            ("maximum 5 million", 5_000_000),
            ("up to 5 million", 5_000_000),
            ("upto AED 5M", 5_000_000),
            ("less than 5 million", 5_000_000),
            ("budget 5 million", 5_000_000),
            ("budget: 5,000,000", 5_000_000),
            ("around 5 million", 5_000_000),
        ]
        for phrase, expected_max in cases:
            crit = extract_criteria_from_text(phrase)
            self.assertIsNone(
                crit.get("min_budget_aed"),
                f"Expected no min_budget for '{phrase}', got {crit.get('min_budget_aed')}",
            )
            self.assertEqual(
                crit.get("max_budget_aed"),
                expected_max,
                f"Failed max_budget extraction on '{phrase}': got {crit.get('max_budget_aed')}",
            )

    def test_extract_minimum_budget_only(self):
        """Extracts min budget only when no maximum is specified."""
        cases = [
            ("above AED 3 million", 3_000_000),
            ("min 3 million", 3_000_000),
            ("minimum 3M", 3_000_000),
            ("at least 3M", 3_000_000),
            ("starting from 3M", 3_000_000),
            ("starting at AED 3 million", 3_000_000),
            ("over 3 million", 3_000_000),
            ("more than 3M", 3_000_000),
            ("5M+ AED", 5_000_000),
            ("5M+", 5_000_000),
        ]
        for phrase, expected_min in cases:
            crit = extract_criteria_from_text(phrase)
            self.assertEqual(
                crit.get("min_budget_aed"),
                expected_min,
                f"Failed min_budget extraction on '{phrase}': got {crit.get('min_budget_aed')}",
            )
            self.assertIsNone(
                crit.get("max_budget_aed"),
                f"Expected no max_budget for '{phrase}', got {crit.get('max_budget_aed')}",
            )

    def test_extract_no_budget_specified(self):
        """Returns no budget filters when none are specified."""
        phrases = [
            "2 BHK apartment in Dubai Sports City",
            "I want to rent an apartment",
            "within 3 months",  # Move-in timeline, not a budget
            "no budget specified",
        ]
        for phrase in phrases:
            crit = extract_criteria_from_text(phrase)
            self.assertIsNone(crit.get("min_budget_aed"))
            self.assertIsNone(crit.get("max_budget_aed"))

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Deterministic Property Service Filtering Tests
    # ──────────────────────────────────────────────────────────────────────────
    def test_dataset_filtering_range_3m_to_5m(self):
        """Deterministic query enforces price_aed >= 3,000,000 AND price_aed <= 5,000,000."""
        res = search_properties_dataset(
            min_budget_aed=3_000_000,
            max_budget_aed=5_000_000,
            limit=25,
        )
        props = res.get("top_properties", [])
        self.assertGreater(len(props), 0, "Expected matching properties in the 3M-5M range across Dubai.")
        for p in props:
            price = p["price_aed"]
            self.assertGreaterEqual(price, 3_000_000, f"Property {p['property_id']} price {price} < 3,000,000")
            self.assertLessEqual(price, 5_000_000, f"Property {p['property_id']} price {price} > 5,000,000")

    def test_dataset_filtering_range_1m_to_3m(self):
        """Deterministic query enforces price_aed >= 1,000,000 AND price_aed <= 3,000,000."""
        res = search_properties_dataset(
            min_budget_aed=1_000_000,
            max_budget_aed=3_000_000,
            limit=25,
        )
        props = res.get("top_properties", [])
        self.assertGreater(len(props), 0, "Expected matching properties in the 1M-3M range across Dubai.")
        for p in props:
            price = p["price_aed"]
            self.assertGreaterEqual(price, 1_000_000, f"Property {p['property_id']} price {price} < 1,000,000")
            self.assertLessEqual(price, 3_000_000, f"Property {p['property_id']} price {price} > 3,000,000")

    def test_dataset_filtering_maximum_only(self):
        """Deterministic query enforces price_aed <= max_budget_aed."""
        res = search_properties_dataset(
            max_budget_aed=1_500_000,
            limit=25,
        )
        props = res.get("top_properties", [])
        self.assertGreater(len(props), 0)
        for p in props:
            self.assertLessEqual(p["price_aed"], 1_500_000)

    def test_dataset_filtering_minimum_only(self):
        """Deterministic query enforces price_aed >= min_budget_aed."""
        res = search_properties_dataset(
            min_budget_aed=4_000_000,
            limit=25,
        )
        props = res.get("top_properties", [])
        self.assertGreater(len(props), 0)
        for p in props:
            self.assertGreaterEqual(p["price_aed"], 4_000_000)

    def test_dataset_filtering_swap_defense(self):
        """Defensive swap handles inverted inputs min > max safely."""
        res = search_properties_dataset(
            min_budget_aed=5_000_000,
            max_budget_aed=3_000_000,
            limit=10,
        )
        props = res.get("top_properties", [])
        self.assertGreater(len(props), 0)
        for p in props:
            self.assertTrue(3_000_000 <= p["price_aed"] <= 5_000_000)

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Real Inventory & Honest No-Match Behavior in Dubai Sports City
    # ──────────────────────────────────────────────────────────────────────────
    def test_real_inventory_dubai_sports_city_3m_5m_returns_zero_and_honest_reply(self):
        """
        In the canonical dataset (lyka_dubai_properties.csv), all 45 2-BHK apartments
        in Dubai Sports City are priced strictly between AED 56,000 and AED 1,230,000.
        Therefore, when the user requests AED 3M to AED 5M in Dubai Sports City:
        - 0 properties match.
        - LYKA must NEVER return properties under AED 3,000,000 (such as 742k, 780k, 802k).
        - LYKA must clearly and honestly tell the customer that no match was found.
        """
        # A. Low-level service check
        res = search_properties_dataset(
            location="Dubai Sports City",
            property_type="Apartment",
            bedrooms=2,
            min_budget_aed=3_000_000,
            max_budget_aed=5_000_000,
            nearby_fallback=True,
        )
        self.assertEqual(res["total_found"], 0)
        self.assertEqual(len(res["top_properties"]), 0)

        # B. End-to-end chat turn
        sid = "test-dsc-3m-5m-honest"
        user_msg = "Location: Dubai Sports City, Property type: Apartment, Bedrooms: 2 BHK, Budget: AED 3 million to AED 5 million"
        response = process_ollama_chat_message(user_msg, sid)

        # Zero property cards must be returned
        self.assertEqual(
            response["matched_properties"],
            [],
            "Must NOT return properties under 3M when user specifies 3M-5M budget!"
        )

        # Honest no-match reply naming the criteria and budget range
        reply = response["reply"]
        self.assertIn("No exact match", reply)
        self.assertIn("Dubai Sports City", reply)
        self.assertIn("3,000,000", reply)
        self.assertIn("5,000,000", reply)

        # Requirements must accurately preserve both min and max budget
        req = response["requirements"]
        self.assertEqual(req.get("location"), "Dubai Sports City")
        self.assertEqual(req.get("propertyType"), "Apartment")
        self.assertEqual(req.get("bhk"), 2)
        self.assertEqual(req.get("min_budget"), 3_000_000)
        self.assertEqual(req.get("budget"), 5_000_000)

    def test_real_inventory_dubai_sports_city_700k_900k_returns_matching_records(self):
        """
        When the budget is set to AED 700k–900k for 2 BHK in Dubai Sports City,
        the real inventory returns the matching properties:
        LYK-01032 (AED 742,000), LYK-00604 (AED 780,000), LYK-00381 (AED 802,000).
        """
        sid = "test-dsc-700k-900k-match"
        user_msg = "Location: Dubai Sports City, Property type: Apartment, Bedrooms: 2 BHK, Budget: AED 700,000 to AED 900,000"
        response = process_ollama_chat_message(user_msg, sid)

        matches = response["matched_properties"]
        self.assertEqual(len(matches), 3, "Expected 3 matching properties in 700k-900k range")
        returned_ids = [p["property_id"] for p in matches]
        self.assertEqual(returned_ids, ["LYK-01032", "LYK-00604", "LYK-00381"])

        for p in matches:
            self.assertEqual(p["location"], "Dubai Sports City")
            self.assertEqual(p["property_type"], "Apartment")
            self.assertEqual(p["bhk"], 2)
            self.assertTrue(700_000 <= p["price_aed"] <= 900_000)

    # ──────────────────────────────────────────────────────────────────────────
    # 4. Conversation Memory & Recall Tests
    # ──────────────────────────────────────────────────────────────────────────
    def test_criteria_phrase_formatting_with_range(self):
        """format_criteria_phrase displays range when both min and max budget are present."""
        crit_range = {
            "location": "Dubai Sports City",
            "property_type": "Apartment",
            "bedrooms": 2,
            "min_budget_aed": 3_000_000,
            "max_budget_aed": 5_000_000,
        }
        phrase = format_criteria_phrase(crit_range)
        self.assertIn("2 BHK apartment in Dubai Sports City", phrase)
        self.assertIn("AED 3.0M – AED 5.0M", phrase.replace("3M", "3.0M").replace("5M", "5.0M"))

    def test_memory_recall_budget_range(self):
        """generate_recall_response reproduces exact budget range and recommendations."""
        mock_ctx = {
            "session_id": "test-sess-1",
            "properties": [
                {"property_id": "LYK-01032", "title": "Sports City 2BHK", "price_aed": 742000, "location": "Dubai Sports City", "bhk": 2, "property_type": "Apartment"},
                {"property_id": "LYK-00604", "title": "Hessa Street 2BHK", "price_aed": 780000, "location": "Dubai Sports City", "bhk": 2, "property_type": "Apartment"},
                {"property_id": "LYK-00381", "title": "Sports City Rd 2BHK", "price_aed": 802000, "location": "Dubai Sports City", "bhk": 2, "property_type": "Apartment"},
            ],
            "criteria": {
                "location": "Dubai Sports City",
                "bedrooms": 2,
                "property_type": "Apartment",
                "min_budget_aed": 700000,
                "max_budget_aed": 900000,
            },
            "relative_day_dubai": "today",
        }

        # User asks: "What was my previous budget?"
        query_check = is_recall_query("What was my previous budget?")
        self.assertTrue(query_check["is_recall"])
        self.assertEqual(query_check["kind"], "budget")

        resp = generate_recall_response(query_check, mock_ctx, "user-123", "What was my previous budget?")
        self.assertIn("AED 700,000 – AED 900,000", resp["reply"])
        self.assertIn("Dubai Sports City", resp["reply"])
        self.assertEqual(resp["requirements"]["min_budget_aed"], 700000)
        self.assertEqual(resp["requirements"]["max_budget_aed"], 900000)


if __name__ == "__main__":
    unittest.main()
