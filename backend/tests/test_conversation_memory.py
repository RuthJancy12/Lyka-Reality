"""
LYKA REALTY — Backend Tests for AI Conversation Memory & Recommendation Continuity

Tests:
1. Storing recommendations in PostgreSQL.
2. Recall of previous recommendations ("Yesterday you recommended some properties" / "Show me yesterday's properties").
3. Follow-up on individual recommendation ("I liked the second property").
4. Recall of previous budget ("What was my previous budget?").
5. Continuation of conversation ("Continue from where we stopped").
6. Honest response when history is missing.
7. Multi-session isolation (starting fresh doesn't overwrite old sessions).
8. Customer ownership isolation (Customer B cannot retrieve Customer A's history).
"""

import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import unittest
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CustomerChatSession, CustomerChatMessage, CustomerProfile
from app.services.chat_memory_service import (
    retrieve_customer_conversation_context,
    is_recall_query,
    generate_recall_response,
    DUBAI_TZ,
)
from app.services.ollama_chat_service import (
    process_ollama_chat_message,
    get_or_create_ollama_session,
)


class TestConversationMemory(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        # Clean chat and profile tables before each test
        self.db.query(CustomerChatMessage).delete()
        self.db.query(CustomerChatSession).delete()
        self.db.query(CustomerProfile).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_is_recall_query_detection(self):
        """Test regexes detect various natural language recall prompts."""
        q1 = is_recall_query("Yesterday it recommended some properties")
        self.assertTrue(q1["is_recall"])
        self.assertEqual(q1["kind"], "recommendations")
        self.assertEqual(q1["time_reference"], "yesterday")

        q2 = is_recall_query("Show me the properties you showed me yesterday")
        self.assertTrue(q2["is_recall"])
        self.assertEqual(q2["kind"], "recommendations")

        q3 = is_recall_query("Show me yesterday's properties")
        self.assertTrue(q3["is_recall"])
        self.assertEqual(q3["kind"], "recommendations")

        q4 = is_recall_query("I liked the second property")
        self.assertTrue(q4["is_recall"])
        self.assertEqual(q4["kind"], "followup")
        self.assertEqual(q4["target_index"], 1)

        q5 = is_recall_query("What was my previous budget?")
        self.assertTrue(q5["is_recall"])
        self.assertEqual(q5["kind"], "budget")

        q6 = is_recall_query("Continue from where we stopped")
        self.assertTrue(q6["is_recall"])
        self.assertEqual(q6["kind"], "continue")

        q7 = is_recall_query("Is Dubai Marina good for families?")
        self.assertFalse(q7["is_recall"])

    def test_retrieve_yesterday_recommendations_and_criteria(self):
        """Test retrieving yesterday's conversation records and properties from inventory."""
        owner_uid = "cust_test_recall_001"
        sess_id = "sess_yesterday_01"

        now_utc = datetime.now(timezone.utc)
        yesterday_utc = now_utc - timedelta(days=1)

        # Create yesterday's chat session
        session = CustomerChatSession(
            firebase_uid=owner_uid,
            session_id=sess_id,
            title="Buy 2 BHK in Dubai Sports City",
            created_at=yesterday_utc,
            updated_at=yesterday_utc,
        )
        self.db.add(session)

        # User message: stated search criteria
        m1 = CustomerChatMessage(
            firebase_uid=owner_uid,
            session_id=sess_id,
            message_ref="msg_u1",
            role="user",
            text="I want to buy a 2 BHK apartment in Dubai Sports City with a budget of AED 3M to 5M",
            property_ids=[],
            created_at=yesterday_utc,
        )
        self.db.add(m1)

        # Assistant recommendation turn with 3 real property IDs
        m2 = CustomerChatMessage(
            firebase_uid=owner_uid,
            session_id=sess_id,
            message_ref="msg_a1",
            role="assistant",
            text="Here are 3 verified properties in Dubai Sports City matching your criteria:",
            property_ids=["LYK-00001", "LYK-00002", "LYK-00003"],
            created_at=yesterday_utc + timedelta(seconds=5),
        )
        self.db.add(m2)
        self.db.commit()

        # Retrieve context
        ctx = retrieve_customer_conversation_context(
            owner_uid=owner_uid,
            query_text="Yesterday it recommended some properties",
            time_reference="yesterday",
            db_session=self.db,
        )

        self.assertIsNotNone(ctx)
        self.assertEqual(ctx["session_id"], sess_id)
        self.assertEqual(len(ctx["properties"]), 3)
        self.assertEqual(ctx["properties"][0]["property_id"], "LYK-00001")
        self.assertEqual(ctx["properties"][1]["property_id"], "LYK-00002")
        self.assertEqual(ctx["properties"][2]["property_id"], "LYK-00003")

        # Check extracted criteria
        self.assertEqual(ctx["criteria"].get("location"), "Dubai Sports City")
        self.assertEqual(ctx["criteria"].get("bedrooms"), 2)
        self.assertEqual(ctx["criteria"].get("property_type"), "Apartment")
        self.assertEqual(ctx["criteria"].get("purpose"), "Sale")

        # Test generate recall response
        query_info = is_recall_query("Yesterday it recommended some properties")
        res = generate_recall_response(query_info, ctx, owner_uid, "Yesterday it recommended some properties")

        self.assertIn("Yesterday", res["reply"])
        self.assertIn("2 BHK", res["reply"])
        self.assertIn("Dubai Sports City", res["reply"])
        self.assertEqual(len(res["matched_properties"]), 3)

    def test_followup_on_second_property(self):
        """Test asking 'I liked the second property' returns the verified second property details."""
        owner_uid = "cust_test_recall_002"
        sess_id = "sess_followup_01"
        now_utc = datetime.now(timezone.utc)

        session = CustomerChatSession(
            firebase_uid=owner_uid,
            session_id=sess_id,
            title="Apartment search",
            created_at=now_utc,
            updated_at=now_utc,
        )
        self.db.add(session)

        # Assistant recommended 3 properties
        m = CustomerChatMessage(
            firebase_uid=owner_uid,
            session_id=sess_id,
            message_ref="msg_rec_01",
            role="assistant",
            text="Here are your options:",
            property_ids=["LYK-00001", "LYK-00002", "LYK-00003"],
            created_at=now_utc,
        )
        self.db.add(m)
        self.db.commit()

        ctx = retrieve_customer_conversation_context(
            owner_uid=owner_uid,
            query_text="I liked the second property",
            db_session=self.db,
        )

        query_info = is_recall_query("I liked the second property")
        res = generate_recall_response(query_info, ctx, owner_uid, "I liked the second property")

        self.assertIn("second property", res["reply"].lower())
        self.assertEqual(len(res["matched_properties"]), 1)
        self.assertEqual(res["matched_properties"][0]["property_id"], "LYK-00002")
        self.assertIn("priced at AED", res["reply"])

    def test_recall_previous_budget(self):
        """Test customer asks 'What was my previous budget?'."""
        owner_uid = "cust_test_recall_003"
        sess_id = "sess_budget_01"
        now_utc = datetime.now(timezone.utc)

        session = CustomerChatSession(
            firebase_uid=owner_uid,
            session_id=sess_id,
            title="Budget inquiry",
            created_at=now_utc,
            updated_at=now_utc,
        )
        self.db.add(session)

        m = CustomerChatMessage(
            firebase_uid=owner_uid,
            session_id=sess_id,
            message_ref="msg_user_budget",
            role="user",
            text="Looking for a 2 BHK apartment in Downtown Dubai with budget 4000000 AED",
            property_ids=[],
            created_at=now_utc,
        )
        self.db.add(m)
        self.db.commit()

        ctx = retrieve_customer_conversation_context(
            owner_uid=owner_uid,
            query_text="What was my previous budget?",
            db_session=self.db,
        )

        query_info = is_recall_query("What was my previous budget?")
        res = generate_recall_response(query_info, ctx, owner_uid, "What was my previous budget?")

        self.assertIn("AED 4M", res["reply"])
        self.assertIn("Downtown Dubai", res["reply"])

    def test_missing_history_honest_response(self):
        """Test Requirement 6: Missing history returns honest response instead of hallucinating."""
        owner_uid = "cust_no_history_999"

        # Customer has profile preferences, but no recorded properties
        profile = CustomerProfile(
            firebase_uid=owner_uid,
            name="Test Customer",
            preferences={"locations": ["Dubai Sports City"], "bedrooms": 2, "propertyType": "Apartment", "budgetMax": 4500000},
        )
        self.db.add(profile)
        self.db.commit()

        ctx = retrieve_customer_conversation_context(
            owner_uid=owner_uid,
            query_text="Yesterday it recommended some properties",
            time_reference="yesterday",
            db_session=self.db,
        )

        query_info = is_recall_query("Yesterday it recommended some properties")
        res = generate_recall_response(query_info, ctx, owner_uid, "Yesterday it recommended some properties")

        # Must state honestly that exact properties could not be retrieved, but criteria are kept
        self.assertIn("couldn't retrieve the exact properties", res["reply"])
        self.assertIn("Dubai Sports City", res["reply"])
        self.assertEqual(len(res["matched_properties"]), 0)

    def test_customer_isolation_cross_account_security(self):
        """Test Requirement 8, Test 10: Customer B cannot retrieve Customer A's chat history or recommendations."""
        cust_a_uid = "customer_A_uid"
        cust_b_uid = "customer_B_uid"

        # Customer A has recommendations
        s_a = CustomerChatSession(firebase_uid=cust_a_uid, session_id="sess_cust_a", title="A Session")
        self.db.add(s_a)
        m_a = CustomerChatMessage(
            firebase_uid=cust_a_uid,
            session_id="sess_cust_a",
            message_ref="msg_a",
            role="assistant",
            text="3 luxury properties",
            property_ids=["LYK-00001", "LYK-00002", "LYK-00003"],
        )
        self.db.add(m_a)
        self.db.commit()

        # Customer B queries
        ctx_b = retrieve_customer_conversation_context(
            owner_uid=cust_b_uid,
            query_text="Show me yesterday's properties",
            time_reference="yesterday",
            db_session=self.db,
        )

        # Must be None for customer B
        self.assertIsNone(ctx_b)

        query_info = is_recall_query("Show me yesterday's properties")
        res_b = generate_recall_response(query_info, ctx_b, cust_b_uid, "Show me yesterday's properties")
        self.assertEqual(len(res_b["matched_properties"]), 0)
        self.assertIn("couldn't retrieve", res_b["reply"])

    def test_e2e_ollama_process_message_yesterday_recall_and_followup(self):
        """Test end-to-end integration through process_ollama_chat_message."""
        owner_uid = "cust_e2e_test_01"
        sess_yesterday = "sess_e2e_yesterday"

        # Setup yesterday's session in DB
        now_utc = datetime.now(timezone.utc)
        yesterday_utc = now_utc - timedelta(days=1)

        s = CustomerChatSession(
            firebase_uid=owner_uid,
            session_id=sess_yesterday,
            title="Buy 2 BHK apartment in Dubai Sports City",
            created_at=yesterday_utc,
            updated_at=yesterday_utc,
        )
        self.db.add(s)

        u_msg = CustomerChatMessage(
            firebase_uid=owner_uid,
            session_id=sess_yesterday,
            message_ref="msg_e2e_u1",
            role="user",
            text="I want to buy a 2 BHK apartment in Dubai Sports City with budget 3M to 5M AED",
            property_ids=[],
            created_at=yesterday_utc,
        )
        self.db.add(u_msg)

        a_msg = CustomerChatMessage(
            firebase_uid=owner_uid,
            session_id=sess_yesterday,
            message_ref="msg_e2e_a1",
            role="assistant",
            text="Here are 3 verified properties in Dubai Sports City:",
            property_ids=["LYK-00001", "LYK-00002", "LYK-00003"],
            created_at=yesterday_utc + timedelta(seconds=2),
        )
        self.db.add(a_msg)
        self.db.commit()

        # Mock database session retrieval in chat_memory_service to use self.db
        import app.services.chat_memory_service as cms
        orig_session_local = cms.SessionLocal
        cms.SessionLocal = lambda: self.db

        try:
            # 1. Customer returns and says: "Yesterday it recommended some properties"
            res1 = process_ollama_chat_message(
                message="Yesterday it recommended some properties",
                session_id="sess_e2e_today",
                owner_uid=owner_uid,
            )

            self.assertIn("Yesterday", res1["reply"])
            self.assertIn("Dubai Sports City", res1["reply"])
            self.assertEqual(len(res1["matched_properties"]), 3)
            self.assertEqual(res1["matched_properties"][0]["property_id"], "LYK-00001")
            self.assertEqual(res1["matched_properties"][1]["property_id"], "LYK-00002")
            self.assertEqual(res1["matched_properties"][2]["property_id"], "LYK-00003")

            # 2. Customer follows up: "I liked the second property"
            res2 = process_ollama_chat_message(
                message="I liked the second property",
                session_id="sess_e2e_today",
                owner_uid=owner_uid,
            )

            self.assertIn("second property", res2["reply"].lower())
            self.assertEqual(len(res2["matched_properties"]), 1)
            self.assertEqual(res2["matched_properties"][0]["property_id"], "LYK-00002")

            # 3. Customer asks about budget: "What was my previous budget?"
            res3 = process_ollama_chat_message(
                message="What was my previous budget?",
                session_id="sess_e2e_today",
                owner_uid=owner_uid,
            )
            self.assertIn("AED 3M", res3["reply"])

            # 4. Customer asks to continue: "Continue from where we stopped"
            res4 = process_ollama_chat_message(
                message="Continue from where we stopped",
                session_id="sess_e2e_today",
                owner_uid=owner_uid,
            )
            self.assertIn("Continuing from where we stopped", res4["reply"])
            self.assertEqual(len(res4["matched_properties"]), 3)

            # 5. Customer starts fresh: "Start fresh"
            res5 = process_ollama_chat_message(
                message="Start fresh",
                session_id="sess_e2e_fresh",
                owner_uid=owner_uid,
            )
            # Fresh search prompts for purpose
            self.assertEqual(res5["need"], "purpose")
            self.assertEqual(len(res5["matched_properties"]), 0)

            # Verify that yesterday's session in DB was NOT deleted or modified
            old_s = self.db.query(CustomerChatSession).filter(CustomerChatSession.session_id == sess_yesterday).first()
            self.assertIsNotNone(old_s)
            old_msgs = self.db.query(CustomerChatMessage).filter(CustomerChatMessage.session_id == sess_yesterday).all()
            self.assertEqual(len(old_msgs), 2)
        finally:
            cms.SessionLocal = orig_session_local

    def test_customer_chat_sessions_endpoints(self):
        """Test customer chat session list and detail endpoints with RBAC isolation."""
        from app.routers.customer import get_my_chat_sessions, get_my_chat_session_detail
        from fastapi import HTTPException

        owner_uid = "cust_endpoint_test_01"
        other_uid = "cust_endpoint_test_02"

        s1 = CustomerChatSession(firebase_uid=owner_uid, session_id="sess_ep_1", title="Downtown Apartment")
        self.db.add(s1)
        m1 = CustomerChatMessage(
            firebase_uid=owner_uid,
            session_id="sess_ep_1",
            message_ref="msg_ep_1",
            role="assistant",
            text="Downtown options",
            property_ids=["LYK-00001", "LYK-00002"],
        )
        self.db.add(m1)
        self.db.commit()

        # 1. Owner lists sessions
        claims_owner = {"uid": owner_uid}
        res_list = get_my_chat_sessions(claims=claims_owner, db=self.db)
        self.assertEqual(len(res_list.sessions), 1)
        self.assertEqual(res_list.sessions[0].session_id, "sess_ep_1")
        self.assertTrue(res_list.sessions[0].has_recommendations)
        self.assertEqual(res_list.sessions[0].recommended_property_ids, ["LYK-00001", "LYK-00002"])

        # 2. Owner gets session details
        res_detail = get_my_chat_session_detail(session_id="sess_ep_1", claims=claims_owner, db=self.db)
        self.assertEqual(res_detail.session_id, "sess_ep_1")
        self.assertEqual(len(res_detail.turns), 1)
        self.assertEqual(len(res_detail.recommended_properties), 2)
        self.assertEqual(res_detail.recommended_properties[0]["property_id"], "LYK-00001")

        # 3. Other customer cannot access owner's session detail (HTTP 404 isolation)
        claims_other = {"uid": other_uid}
        with self.assertRaises(HTTPException) as cm:
            get_my_chat_session_detail(session_id="sess_ep_1", claims=claims_other, db=self.db)
        self.assertEqual(cm.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
