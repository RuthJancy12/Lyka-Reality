"""
Comprehensive Unit & Integration Tests for LYKA Realty Real-Time Notification System.
Tests:
- Isolation between users (Customer A vs Customer B)
- Deduplication prevention within time window
- Unread count calculation and reactive updates
- Mark single notification as read & mark all as read
- User notification preferences suppression and system alert bypass
- Business event notifications:
  * Customer appointment confirmation / cancellation
  * Customer inquiry response
  * CRM employee lead assignment
  * Admin lead / inquiry notifications
  * HRMS leave notifications
"""
import unittest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    Notification, NotificationPreference, StaffUser, Lead, Assignment, Viewing,
    CustomerInquiry, HRNotification,
)
from app.services import notification_service


class TestNotificationSystem(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(bind=self.engine)
        TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = TestingSession()

    def tearDown(self):
        self.db.close()

    def test_customer_appointment_notification(self):
        """Scenario 1: Customer receives appointment notification."""
        notif = notification_service.create_notification(
            db=self.db,
            recipient_email="customer@example.com",
            recipient_role="customer",
            title="Viewing Confirmed",
            message="Your viewing for Marina Tower is confirmed for 2026-11-05 10:00 UTC.",
            category="appointments",
            notification_type="appointment_confirmed",
            related_entity_type="viewing",
            related_entity_id="101",
            action_url="/account",
        )
        self.assertIsNotNone(notif)
        self.assertFalse(notif.is_read)
        self.assertEqual(notif.recipient_email, "customer@example.com")
        self.assertEqual(notif.category, "appointments")

        # Verify retrieval
        notifs = notification_service.get_user_notifications(self.db, "customer@example.com", "customer")
        self.assertEqual(len(notifs), 1)
        self.assertEqual(notifs[0].title, "Viewing Confirmed")

    def test_crm_employee_lead_assignment_notification(self):
        """Scenario 2: CRM agent receives lead assignment alert."""
        staff = StaffUser(
            name="Agent Sarah",
            email="sarah@lykarealty.ae",
            role="salesperson",
            firebase_uid="uid_sarah_123",
            is_active=True,
        )
        self.db.add(staff)
        self.db.commit()

        notif = notification_service.create_notification(
            db=self.db,
            recipient_email=staff.email,
            recipient_user_id=staff.firebase_uid,
            recipient_role="salesperson",
            title="New Lead Assigned",
            message="You have been assigned to Lead #42 (John Doe).",
            category="system",
            notification_type="lead_assigned",
            related_entity_type="lead",
            related_entity_id=42,
            action_url="/crm/leads?id=42",
        )
        self.assertIsNotNone(notif)
        self.assertEqual(notif.recipient_email, "sarah@lykarealty.ae")

        # Agent checks their notifications
        agent_notifs = notification_service.get_user_notifications(self.db, "sarah@lykarealty.ae", "salesperson")
        self.assertEqual(len(agent_notifs), 1)
        self.assertEqual(agent_notifs[0].notification_type, "lead_assigned")

    def test_admin_new_lead_notification(self):
        """Scenario 3: Admins notified on new lead."""
        admin = StaffUser(
            name="Admin Boss",
            email="admin@lykarealty.ae",
            role="admin",
            firebase_uid="uid_admin_1",
            is_active=True,
        )
        self.db.add(admin)
        self.db.commit()

        created = notification_service.notify_admins(
            db=self.db,
            title="New Lead Created",
            message="Lead #55 created for VIP buyer in Palm Jumeirah.",
            category="system",
            notification_type="lead_created",
            related_entity_type="lead",
            related_entity_id=55,
            action_url="/crm/leads?id=55",
        )
        self.assertGreaterEqual(len(created), 1)
        self.assertTrue(any(n.recipient_email == "admin@lykarealty.ae" for n in created))

    def test_hrms_leave_notification(self):
        """Scenario 4: HR notification mirrored into universal notification center."""
        notif = notification_service.create_notification(
            db=self.db,
            recipient_email="hr@lykarealty.ae",
            recipient_role="hrms_admin",
            title="New Leave Application",
            message="Agent Sarah applied for 3 days annual leave.",
            category="announcements",
            notification_type="leave",
            related_entity_type="hrms",
            action_url="/staff/hrms",
        )
        self.assertIsNotNone(notif)
        self.assertEqual(notif.notification_type, "leave")
        hr_notifs = notification_service.get_user_notifications(self.db, "hr@lykarealty.ae", "hrms_admin")
        self.assertEqual(len(hr_notifs), 1)

    def test_strict_user_isolation(self):
        """Scenario 5: User A never sees User B's notifications."""
        notification_service.create_notification(
            db=self.db,
            recipient_email="user_a@example.com",
            recipient_role="customer",
            title="User A Secret Alert",
            message="Private data for User A.",
            category="system",
        )
        notification_service.create_notification(
            db=self.db,
            recipient_email="user_b@example.com",
            recipient_role="customer",
            title="User B Secret Alert",
            message="Private data for User B.",
            category="system",
        )

        a_list = notification_service.get_user_notifications(self.db, "user_a@example.com", "customer")
        b_list = notification_service.get_user_notifications(self.db, "user_b@example.com", "customer")

        self.assertEqual(len(a_list), 1)
        self.assertEqual(a_list[0].title, "User A Secret Alert")
        self.assertEqual(len(b_list), 1)
        self.assertEqual(b_list[0].title, "User B Secret Alert")

        # User B cannot mark User A's notification as read
        unauth_read = notification_service.mark_notification_read(self.db, a_list[0].id, "user_b@example.com", "customer")
        self.assertIsNone(unauth_read)
        # User A's notification remains unread
        self.assertFalse(self.db.query(Notification).filter(Notification.id == a_list[0].id).first().is_read)

    def test_deduplication_prevention(self):
        """Scenario 6: Prevents duplicate notifications within the dedup window."""
        n1 = notification_service.create_notification(
            db=self.db,
            recipient_email="client@example.com",
            title="Price Drop Alert",
            message="Marina 2BR price dropped by 50,000 AED.",
            category="recommendations",
            related_entity_id="prop_401",
            dedup_window_seconds=120,
        )
        self.assertIsNotNone(n1)

        # Immediate second call with identical parameters
        n2 = notification_service.create_notification(
            db=self.db,
            recipient_email="client@example.com",
            title="Price Drop Alert",
            message="Marina 2BR price dropped by 50,000 AED.",
            category="recommendations",
            related_entity_id="prop_401",
            dedup_window_seconds=120,
        )
        self.assertIsNotNone(n2)
        self.assertEqual(n2.id, n1.id)

        # Count in DB should be exactly 1
        total = self.db.query(Notification).filter(Notification.recipient_email == "client@example.com").count()
        self.assertEqual(total, 1)

    def test_unread_count_and_marking_read(self):
        """Scenario 7: Unread count reactive updates and mark all as read."""
        for i in range(3):
            notification_service.create_notification(
                db=self.db,
                recipient_email="test@lykarealty.ae",
                title=f"Alert #{i}",
                message=f"Message #{i}",
                category="system",
                dedup_window_seconds=0,
            )

        # Initial count = 3
        self.assertEqual(notification_service.get_unread_count(self.db, "test@lykarealty.ae", "staff"), 3)

        # Mark 1 as read
        notifs = notification_service.get_user_notifications(self.db, "test@lykarealty.ae", "staff")
        marked = notification_service.mark_notification_read(self.db, notifs[0].id, "test@lykarealty.ae")
        self.assertTrue(marked.is_read)
        self.assertIsNotNone(marked.read_at)
        self.assertEqual(notification_service.get_unread_count(self.db, "test@lykarealty.ae", "staff"), 2)

        # Mark all remaining read
        updated_count = notification_service.mark_all_read(self.db, "test@lykarealty.ae")
        self.assertEqual(updated_count, 2)
        self.assertEqual(notification_service.get_unread_count(self.db, "test@lykarealty.ae", "staff"), 0)

    def test_preferences_suppression_and_system_alert_bypass(self):
        """Scenario 8: Category preference toggle disables alerts, but system alerts always pass."""
        email = "optout@example.com"
        # Opt out of recommendations & followups
        notification_service.update_preferences(
            db=self.db,
            email=email,
            updates={"recommendations": False, "followups": False},
        )

        # Recommendations should be suppressed
        n_rec = notification_service.create_notification(
            db=self.db,
            recipient_email=email,
            title="New Recommended Villa",
            message="Check out this new villa.",
            category="recommendations",
        )
        self.assertIsNone(n_rec)

        # Followups should be suppressed
        n_fol = notification_service.create_notification(
            db=self.db,
            recipient_email=email,
            title="Follow-up Scheduled",
            message="Agent scheduled follow-up call.",
            category="followups",
        )
        self.assertIsNone(n_fol)

        # System alert MUST pass
        n_sys = notification_service.create_notification(
            db=self.db,
            recipient_email=email,
            title="Account Password Changed",
            message="Your password was updated.",
            category="system",
        )
        self.assertIsNotNone(n_sys)
        self.assertEqual(n_sys.title, "Account Password Changed")


if __name__ == "__main__":
    unittest.main()
