"""
LYKA REALTY — Genuine Real Inventory Continuity & Recommendation Verification Test

Verifies:
1. Exact criteria match in real property dataset (lyka_dubai_properties.csv):
   - Location: Dubai Sports City
   - Type: Apartment
   - Bedrooms: 2 BHK
   - Budget: <= AED 5,000,000
2. Exact Property IDs verified in inventory:
   - LYK-01032 (2 BHK Apartment, Dubai Sports City, Price AED 742,000)
   - LYK-00604 (2 BHK Apartment on Hessa Street, Dubai Sports City, Price AED 780,000)
   - LYK-00381 (2 BHK Apartment on Sports City Road, Dubai Sports City, Price AED 802,000)
3. Follow-up "I liked the second property" resolves strictly to LYK-00604 (2 BHK Apartment on Hessa Street, AED 780,000).
"""

import os, sys, unittest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import Base
from app.models import CustomerChatSession, CustomerChatMessage
from app.services.property_service import get_all_properties
from app.services.chat_memory_service import (
    retrieve_customer_conversation_context,
    is_recall_query,
    generate_recall_response,
)


class TestInventoryMemoryEvidence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        self.db.query(CustomerChatMessage).delete()
        self.db.query(CustomerChatSession).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_real_inventory_matches_criteria_and_ids(self):
        props = get_all_properties()
        self.assertGreater(len(props), 500, "Expected loaded property inventory")

        target_ids = ['LYK-01032', 'LYK-00604', 'LYK-00381']
        matched = [p for p in props if p.get('property_id') in target_ids]

        self.assertEqual(len(matched), 3, "Expected all 3 properties in inventory")

        for p in matched:
            self.assertEqual(p.get('location'), 'Dubai Sports City')
            self.assertEqual(p.get('property_type'), 'Apartment')
            self.assertEqual(p.get('bhk'), 2)
            self.assertLessEqual(p.get('price_aed'), 5000000)

    def test_second_property_followup_resolution(self):
        owner_uid = "cust_real_evidence_001"
        sess_id = "sess_real_evidence_001"
        now_utc = datetime.now(timezone.utc)

        session = CustomerChatSession(
            firebase_uid=owner_uid,
            session_id=sess_id,
            title="Sports City 2 BHK Search",
            created_at=now_utc,
            updated_at=now_utc,
        )
        self.db.add(session)

        # Assistant recommended the 3 real inventory properties
        rec_ids = ["LYK-01032", "LYK-00604", "LYK-00381"]
        m = CustomerChatMessage(
            firebase_uid=owner_uid,
            session_id=sess_id,
            message_ref="msg_rec_sports_city",
            role="assistant",
            text="Here are 3 great options in Dubai Sports City:\n1. LYK-01032\n2. LYK-00604\n3. LYK-00381",
            property_ids=rec_ids,
            created_at=now_utc,
        )
        self.db.add(m)
        self.db.commit()

        # Follow-up query
        query_text = "I liked the second property"
        ctx = retrieve_customer_conversation_context(
            owner_uid=owner_uid,
            query_text=query_text,
            db_session=self.db,
        )

        query_info = is_recall_query(query_text)
        self.assertTrue(query_info.get('is_recall'))
        self.assertEqual(query_info.get('kind'), 'followup')
        self.assertEqual(query_info.get('target_index'), 1)

        res = generate_recall_response(query_info, ctx, owner_uid, query_text)

        self.assertEqual(len(res["matched_properties"]), 1)
        self.assertEqual(res["matched_properties"][0]["property_id"], "LYK-00604")
        self.assertIn("second property", res["reply"].lower())
        self.assertIn("2 BHK Apartment on Hessa Street", res["reply"])
        self.assertIn("AED 780,000", res["reply"])


if __name__ == '__main__':
    unittest.main()
