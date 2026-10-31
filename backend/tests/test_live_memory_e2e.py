"""
LYKA REALTY — Complete Property Memory Continuity Verification Test

Test Scenario (Original Customer Search Criteria):
- Location: Dubai Sports City
- Property type: Apartment
- Bedrooms: 2 BHK
- Budget: AED 3 million to AED 5 million

Workflow:
1. Initial Search:
   - Call process_ollama_chat_message with search criteria.
   - Verify initial recommendations and save turn to database.
2. New Conversation Session:
   - Start session 2: ask 'Yesterday it recommended some properties'.
   - Verify exact same property IDs and details are returned.
3. Second Property Follow-Up:
   - Ask 'I liked the second property'.
   - Verify exact property ID resolves strictly to LYK-00604.
"""

import os, sys, unittest
from datetime import datetime, timezone, timedelta

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import CustomerChatSession, CustomerChatMessage
from app.services.ollama_chat_service import process_ollama_chat_message


class TestExactPropertyMemoryContinuity(unittest.TestCase):
    def setUp(self):
        self.owner_uid = "cust_sports_city_exact_user"
        self.db = SessionLocal()
        # Clean test user sessions
        self.db.query(CustomerChatMessage).filter(CustomerChatMessage.firebase_uid == self.owner_uid).delete()
        self.db.query(CustomerChatSession).filter(CustomerChatSession.firebase_uid == self.owner_uid).delete()
        self.db.commit()

    def tearDown(self):
        # Clean up
        self.db.query(CustomerChatMessage).filter(CustomerChatMessage.firebase_uid == self.owner_uid).delete()
        self.db.query(CustomerChatSession).filter(CustomerChatSession.firebase_uid == self.owner_uid).delete()
        self.db.commit()
        self.db.close()

    def test_exact_continuity_flow(self):
        # ---------------------------------------------------------
        # STEP 1: Initial search with original criteria
        # ---------------------------------------------------------
        sess_1 = "sess_sports_city_001"
        initial_msg = "I want to buy a 2 BHK apartment in Dubai Sports City with budget AED 3 million to AED 5 million"

        print("\n=== STEP 1: INITIAL SEARCH (SESSION 1) ===")
        print(f"User Query: {initial_msg}")
        res_1 = process_ollama_chat_message(
            message=initial_msg,
            session_id=sess_1,
            owner_uid=self.owner_uid
        )

        props_1 = res_1.get("matched_properties", [])
        self.assertEqual(len(props_1), 3, "Expected 3 properties returned for initial search")

        saved_ids = [p["property_id"] for p in props_1]
        print(f"Returned Property IDs: {saved_ids}")
        for i, p in enumerate(props_1, 1):
            print(f"  #{i}: ID: {p['property_id']} | Title: {p['title']} | Price: AED {p['price_aed']:,} | BHK: {p['bhk']} | Location: {p['location']}")
            self.assertEqual(p["location"], "Dubai Sports City")
            self.assertEqual(p["property_type"], "Apartment")
            self.assertEqual(p["bhk"], 2)
            self.assertLessEqual(p["price_aed"], 5000000)

        # Record turns in database (simulating frontend saving turns as yesterday)
        yesterday_utc = datetime.now(timezone.utc) - timedelta(days=1)
        session_row = CustomerChatSession(
            firebase_uid=self.owner_uid,
            session_id=sess_1,
            title="2 BHK Sports City Search",
            created_at=yesterday_utc,
            updated_at=yesterday_utc,
        )
        self.db.add(session_row)
        self.db.flush()

        user_turn = CustomerChatMessage(
            firebase_uid=self.owner_uid,
            session_id=sess_1,
            message_ref="msg_user_001",
            role="user",
            text=initial_msg,
            property_ids=[],
            created_at=yesterday_utc,
        )
        self.db.add(user_turn)

        assistant_turn = CustomerChatMessage(
            firebase_uid=self.owner_uid,
            session_id=sess_1,
            message_ref="msg_assistant_001",
            role="assistant",
            text=res_1.get("reply", "Here are 3 properties in Dubai Sports City"),
            property_ids=saved_ids,
            created_at=yesterday_utc,
        )
        self.db.add(assistant_turn)
        self.db.commit()
        print("Session 1 successfully recorded in database.")

        # ---------------------------------------------------------
        # STEP 2: New conversation session & recall query
        # ---------------------------------------------------------
        sess_2 = "sess_sports_city_002"
        recall_msg = "Yesterday it recommended some properties"

        print("\n=== STEP 2: RECALL QUERY IN NEW SESSION (SESSION 2) ===")
        print(f"User Query: {recall_msg}")
        res_2 = process_ollama_chat_message(
            message=recall_msg,
            session_id=sess_2,
            owner_uid=self.owner_uid
        )

        props_2 = res_2.get("matched_properties", [])
        self.assertEqual(len(props_2), 3, "Expected exact same 3 properties recalled in new session")

        recalled_ids = [p["property_id"] for p in props_2]
        print(f"Recalled Property IDs: {recalled_ids}")
        self.assertEqual(recalled_ids, saved_ids, "Recalled property IDs must strictly match original recommendations")

        for p1, p2 in zip(props_1, props_2):
            self.assertEqual(p1["property_id"], p2["property_id"])
            self.assertEqual(p1["title"], p2["title"])
            self.assertEqual(p1["price_aed"], p2["price_aed"])
            self.assertEqual(p1["location"], p2["location"])
            print(f"  Verified exact detail match: {p2['property_id']} | {p2['title']} | AED {p2['price_aed']:,}")

        # ---------------------------------------------------------
        # STEP 3: Follow-up inquiry on the second property
        # ---------------------------------------------------------
        followup_msg = "I liked the second property"

        print("\n=== STEP 3: FOLLOW-UP ON SECOND PROPERTY ===")
        print(f"User Query: {followup_msg}")
        res_3 = process_ollama_chat_message(
            message=followup_msg,
            session_id=sess_2,
            owner_uid=self.owner_uid
        )

        props_3 = res_3.get("matched_properties", [])
        self.assertEqual(len(props_3), 1, "Expected exactly 1 property resolved for second property")

        expected_second_id = saved_ids[1] # The second item
        resolved_id = props_3[0]["property_id"]
        print(f"Resolved Property ID: {resolved_id} (Expected Second ID: {expected_second_id})")
        self.assertEqual(resolved_id, expected_second_id, f"Expected {expected_second_id} but got {resolved_id}")
        self.assertEqual(resolved_id, "LYK-00604")
        self.assertEqual(props_3[0]["title"], "2 BHK Apartment on Hessa Street, Dubai Sports City")
        self.assertEqual(props_3[0]["price_aed"], 780000)
        print(f"  Confirmed: Second property resolved strictly to LYK-00604 (AED 780,000, 2 BHK on Hessa Street)")


if __name__ == '__main__':
    unittest.main()
