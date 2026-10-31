import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import unittest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    Base,
    CustomerProfile,
    CustomerFavorite,
    CustomerInquiry,
    CustomerChatSession,
    CustomerChatMessage,
    CustomerInteraction,
)
from app.routers import customer
from app import schemas


class TestLegacyMigrationEndpoint(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.uid = "test_mig_uid_1001"
        self.claims = {"uid": self.uid, "email": "mig_user@example.com"}

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_full_migration_all_categories(self):
        """Verify that every required category is migrated into the database:
        profile, preferences, favorites, inquiries, chat sessions, turns, and interactions."""
        payload = schemas.LegacyMigrationIn(
            favorites=["LYK-00001", "LYK-00002", "LYK-00001"],  # Test client deduplication
            inquiries=[
                schemas.CustomerInquiryCreate(
                    record_ref="inq_legacy_01",
                    session_id="sess_legacy_01",
                    property_id="LYK-00001",
                    property_title="Luxury Marina Tower",
                    property_location="Dubai Marina",
                    property_type="Apartment",
                    listing_type="Sale",
                    price_aed=2500000.0,
                    bedrooms=2,
                    size_sqft=1250.0,
                    availability="Ready",
                )
            ],
            sessions=[
                schemas.CustomerChatSessionCreate(
                    session_id="sess_legacy_01",
                    title="Looking for Marina 2BHK",
                    created_at=datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc),
                ),
                schemas.CustomerChatSessionCreate(
                    session_id="sess_legacy_02",
                    title="Downtown Penthouses",
                ),
            ],
            turns=[
                schemas.CustomerChatTurnCreate(
                    session_id="sess_legacy_01",
                    record_ref="msg_legacy_01",
                    role="user",
                    text="Show me 2 bedroom apartments in Dubai Marina under 3M",
                    property_ids=[],
                ),
                schemas.CustomerChatTurnCreate(
                    session_id="sess_legacy_01",
                    record_ref="msg_legacy_02",
                    role="assistant",
                    text="Here are top verified listings matching your budget in Dubai Marina:",
                    property_ids=["LYK-00001"],
                ),
            ],
            interactions=[
                schemas.CustomerInteractionCreate(
                    record_ref="evt_legacy_01",
                    kind="view",
                    property_id="LYK-00001",
                    location="Dubai Marina",
                    property_type="Apartment",
                )
            ],
            profile=schemas.LegacyMigrationProfile(
                name="Rashid Al Maktoum",
                phone="+971501234567",
                city="Dubai",
                country="United Arab Emirates",
                discovery_source="google_search",
            ),
            preferences=schemas.CustomerPreferences(
                locations=["Dubai Marina", "Downtown Dubai"],
                propertyType="Apartment",
                bedrooms=2,
                bathrooms=2,
                budgetMin=1500000.0,
                budgetMax=3000000.0,
                purpose="Buy",
                timeline="Within 3 months",
                theme="dark",
            ),
            tracking_consent=True,
        )

        res = customer.migrate_legacy_records(payload, self.claims, self.db)
        self.assertTrue(res.migrated)
        self.assertEqual(res.favorites, 2)  # Deduped LYK-00001
        self.assertEqual(res.inquiries, 1)
        self.assertEqual(res.sessions, 2)
        self.assertEqual(res.turns, 2)
        self.assertEqual(res.interactions, 1)

        # Verify profile persisted in database
        prof = self.db.query(CustomerProfile).filter(CustomerProfile.firebase_uid == self.uid).first()
        self.assertIsNotNone(prof)
        self.assertEqual(prof.name, "Rashid Al Maktoum")
        self.assertEqual(prof.phone, "+971501234567")
        self.assertEqual(prof.city, "Dubai")
        self.assertEqual(prof.country, "United Arab Emirates")
        self.assertEqual(prof.discovery_source, "google_search")
        self.assertEqual(prof.preferences.get("theme"), "dark")
        self.assertEqual(prof.preferences.get("locations"), ["Dubai Marina", "Downtown Dubai"])
        self.assertTrue(prof.tracking_consent)
        self.assertIsNotNone(prof.legacy_migrated_at)

        # Verify favorites persisted in database
        favs = self.db.query(CustomerFavorite).filter(CustomerFavorite.firebase_uid == self.uid).all()
        fav_ids = {f.property_id for f in favs}
        self.assertEqual(fav_ids, {"LYK-00001", "LYK-00002"})

        # Verify inquiries persisted in database
        inqs = self.db.query(CustomerInquiry).filter(CustomerInquiry.firebase_uid == self.uid).all()
        self.assertEqual(len(inqs), 1)
        self.assertEqual(inqs[0].property_id, "LYK-00001")
        self.assertEqual(inqs[0].record_ref, "inq_legacy_01")
        self.assertEqual(inqs[0].status, "Submitted")

        # Verify chat sessions persisted in database
        sessions = self.db.query(CustomerChatSession).filter(CustomerChatSession.firebase_uid == self.uid).all()
        self.assertEqual(len(sessions), 2)
        sess_ids = {s.session_id for s in sessions}
        self.assertEqual(sess_ids, {"sess_legacy_01", "sess_legacy_02"})

        # Verify chat messages persisted in database
        msgs = self.db.query(CustomerChatMessage).filter(CustomerChatMessage.firebase_uid == self.uid).all()
        self.assertEqual(len(msgs), 2)
        self.assertEqual(msgs[0].message_ref, "msg_legacy_01")
        self.assertEqual(msgs[0].role, "user")
        self.assertEqual(msgs[1].message_ref, "msg_legacy_02")
        self.assertEqual(msgs[1].role, "assistant")

        # Verify interactions persisted in database
        evts = self.db.query(CustomerInteraction).filter(CustomerInteraction.firebase_uid == self.uid).all()
        self.assertEqual(len(evts), 1)
        self.assertEqual(evts[0].event_ref, "evt_legacy_01")

    def test_idempotent_re_migration_does_not_duplicate(self):
        """Calling migration repeatedly with the same records must never create duplicates."""
        payload = schemas.LegacyMigrationIn(
            favorites=["LYK-00010"],
            inquiries=[
                schemas.CustomerInquiryCreate(
                    record_ref="inq_dup_01",
                    property_id="LYK-00010",
                    property_title="Palm Villa",
                )
            ],
            turns=[
                schemas.CustomerChatTurnCreate(
                    session_id="sess_dup_01",
                    record_ref="msg_dup_01",
                    role="user",
                    text="Hello",
                )
            ],
        )

        res1 = customer.migrate_legacy_records(payload, self.claims, self.db)
        self.assertTrue(res1.migrated)
        self.assertEqual(res1.favorites, 1)
        self.assertEqual(res1.inquiries, 1)
        self.assertEqual(res1.turns, 1)

        # Second call with the same payload
        res2 = customer.migrate_legacy_records(payload, self.claims, self.db)
        # Should be safe with 0 newly added records
        self.assertEqual(res2.favorites, 0)
        self.assertEqual(res2.inquiries, 0)
        self.assertEqual(res2.turns, 0)

        # Database counts must still be exactly 1
        fav_count = self.db.query(CustomerFavorite).filter(CustomerFavorite.firebase_uid == self.uid).count()
        inq_count = self.db.query(CustomerInquiry).filter(CustomerInquiry.firebase_uid == self.uid).count()
        msg_count = self.db.query(CustomerChatMessage).filter(CustomerChatMessage.firebase_uid == self.uid).count()
        self.assertEqual(fav_count, 1)
        self.assertEqual(inq_count, 1)
        self.assertEqual(msg_count, 1)

    def test_deep_preferences_merge_preserves_existing_server_values(self):
        """Existing server preferences must win, while missing fields from the legacy payload are imported."""
        # Pre-seed server profile with existing theme='light'
        prof = CustomerProfile(
            firebase_uid=self.uid,
            email="mig_user@example.com",
            preferences={"theme": "light", "purpose": "Rent"},
        )
        self.db.add(prof)
        self.db.commit()

        # Legacy payload has locations and bedrooms, but theme='dark'
        payload = schemas.LegacyMigrationIn(
            preferences=schemas.CustomerPreferences(
                locations=["Downtown Dubai"],
                bedrooms=3,
                purpose="Buy",  # Server already has 'Rent', server must win
                theme="dark",   # Server already has 'light', server must win
            )
        )

        res = customer.migrate_legacy_records(payload, self.claims, self.db)
        self.assertTrue(res.migrated)

        self.db.refresh(prof)
        self.assertEqual(prof.preferences.get("theme"), "light")  # Preserved server value
        self.assertEqual(prof.preferences.get("purpose"), "Rent")  # Preserved server value
        self.assertEqual(prof.preferences.get("locations"), ["Downtown Dubai"])  # Merged missing
        self.assertEqual(prof.preferences.get("bedrooms"), 3)  # Merged missing


    def test_resilience_to_invalid_lead_id_and_oversized_fields(self):
        """Verify that foreign key mismatches and long strings do not crash migration."""
        payload = schemas.LegacyMigrationIn(
            inquiries=[
                schemas.CustomerInquiryCreate(
                    record_ref="inq_invalid_lead",
                    lead_id=999999,
                    property_id="LYK-00099",
                    property_title="A" * 255,
                    property_location="Downtown",
                    property_type="Apartment",
                    price_aed=1500000.0,
                )
            ],
            turns=[
                schemas.CustomerChatTurnCreate(
                    session_id="sess_legacy_resilience",
                    record_ref="msg_empty_sess",
                    role="user",
                    text="Hello from legacy",
                )
            ],
            interactions=[
                schemas.CustomerInteractionCreate(
                    record_ref="evt_long_kind",
                    kind="view_recommendation_extended",
                    property_id="LYK-00099",
                )
            ],
        )

        res = customer.migrate_legacy_records(payload, self.claims, self.db)
        self.assertTrue(res.migrated)
        self.assertEqual(res.inquiries, 1)
        self.assertEqual(res.turns, 1)
        self.assertEqual(res.interactions, 1)

        inq = self.db.query(CustomerInquiry).filter(CustomerInquiry.record_ref == "inq_invalid_lead").first()
        self.assertIsNotNone(inq)
        self.assertIsNone(inq.lead_id)
        self.assertEqual(len(inq.property_title), 255)

        turn = self.db.query(CustomerChatMessage).filter(CustomerChatMessage.message_ref == "msg_empty_sess").first()
        self.assertIsNotNone(turn)
        self.assertTrue(turn.session_id.startswith("sess_"))

        evt = self.db.query(CustomerInteraction).filter(CustomerInteraction.event_ref == "evt_long_kind").first()
        self.assertIsNotNone(evt)
        self.assertEqual(evt.kind, "view")


if __name__ == "__main__":
    unittest.main()
