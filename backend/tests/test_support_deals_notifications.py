import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""
Comprehensive integration tests for:
1. Customer Support Management (Phase 8)
2. Deals & Commission Management + Leaderboard (Phase 11.2)
3. In-App Notifications & Customer Saved Searches / Alerts (Phase 9 & 11)
"""
import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
import app.models as _models
from app.models import StaffUser, Lead
from app.services.roles import require_staff
from app.routers.support import get_current_user
from app.routers.deals import require_deal_admin
from app.routers.notifications import _get_current_identity

# Setup test DB with StaticPool so all threads/sessions share the in-memory SQLite
TEST_DB_URL = "sqlite://"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db

# Mock users
mock_customer = {"role": "customer", "email": "customer@lyka.ae", "uid": "cust123"}
mock_salesperson = {"role": "salesperson", "email": "sales@lyka.ae", "uid": "sales123"}
mock_admin = {"role": "admin", "email": "admin@lyka.ae", "uid": "admin123"}

client = TestClient(app)

# Seed staff user and lead
db = TestingSessionLocal()
admin_user = StaffUser(email="admin@lyka.ae", name="Lyka Admin", role="admin", is_active=True, firebase_uid="admin123")
sales_user = StaffUser(email="sales@lyka.ae", name="Bruns Agent", role="salesperson", is_active=True, firebase_uid="sales123")
lead1 = Lead(customer_name="Sheikh Ahmed", contact_email="ahmed@dubai.ae", raw_enquiry_text="Interested in luxury palm villa", status="qualified", property_type="Villa", location="Palm Jumeirah", budget_max=15000000)
db.add_all([admin_user, sales_user, lead1])
db.commit()
lead1_id = lead1.id
db.close()


def test_support_tickets_workflow():
    print("\n--- 1. TEST SUPPORT TICKETS WORKFLOW ---")
    # Customer submits a ticket
    app.dependency_overrides[get_current_user] = lambda: mock_customer
    res = client.post("/api/customer/tickets", json={
        "subject": "Question about Marina Viewings",
        "category": "viewing",
        "message": "Can I arrange a weekend viewing for ref CRM-101?",
        "customer_name": "Hamdan",
    })
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    ticket = res.json()
    assert ticket["ticket_number"].startswith("TKT-")
    assert ticket["status"] == "open"
    assert len(ticket["messages"]) == 1
    ticket_id = ticket["id"]
    print("ok: customer submitted ticket (201):", ticket["ticket_number"])

    # Customer lists own tickets
    res = client.get("/api/customer/tickets")
    assert res.status_code == 200
    assert len(res.json()) >= 1
    print("ok: customer listed own tickets (200)")

    # Staff views tickets
    app.dependency_overrides[require_staff] = lambda: mock_admin
    res = client.get("/api/staff/tickets")
    assert res.status_code == 200
    assert any(t["id"] == ticket_id for t in res.json())
    print("ok: staff listed tickets (200)")

    # Staff updates ticket priority & assignee
    res = client.patch(f"/api/staff/tickets/{ticket_id}", json={
        "priority": "high",
        "assigned_staff_email": "sales@lyka.ae",
    })
    assert res.status_code == 200
    assert res.json()["priority"] == "high"
    assert res.json()["assigned_staff_email"] == "sales@lyka.ae"
    print("ok: staff updated ticket priority & assignee (200)")

    # Staff replies to ticket
    res = client.post(f"/api/staff/tickets/{ticket_id}/messages", json={
        "message": "Hello Hamdan! We have scheduled your viewing with agent Bruns for Saturday at 11 AM.",
    })
    assert res.status_code == 201
    assert res.json()["sender_type"] == "staff"
    print("ok: staff replied to ticket (201)")

    # Staff resolves ticket
    res = client.patch(f"/api/staff/tickets/{ticket_id}", json={"status": "resolved"})
    assert res.status_code == 200
    assert res.json()["status"] == "resolved"
    assert res.json()["resolved_at"] is not None
    print("ok: staff resolved ticket (200)")


def test_deals_and_leaderboard_workflow():
    print("\n--- 2. TEST DEALS & LEADERBOARD WORKFLOW ---")
    app.dependency_overrides[require_staff] = lambda: mock_salesperson

    # Salesperson creates a deal
    res = client.post("/api/staff/deals", json={
        "lead_id": lead1_id,
        "property_ref": "CRM-101",
        "customer_name": "Sheikh Ahmed",
        "customer_email": "ahmed@dubai.ae",
        "deal_value_aed": 12500000.0,
        "commission_rate_pct": 2.0,
        "deal_stage": "offer",
        "notes": "Offer accepted by seller.",
    })
    assert res.status_code == 201, f"Expected 201: {res.text}"
    deal = res.json()
    assert deal["deal_value_aed"] == 12500000.0
    assert deal["commission_amount_aed"] == 250000.0
    assert len(deal["commissions"]) == 1
    deal_id = deal["id"]
    comm_id = deal["commissions"][0]["id"]
    print("ok: salesperson created deal with commission calculation (201)")

    # Salesperson updates deal to closed_won
    res = client.patch(f"/api/staff/deals/{deal_id}", json={
        "deal_stage": "closed_won",
    })
    assert res.status_code == 200
    assert res.json()["deal_stage"] == "closed_won"
    assert res.json()["actual_close_date"] is not None
    print("ok: deal closed_won status updated (200)")

    # Check Leaderboard
    res = client.get("/api/staff/deals/leaderboard")
    assert res.status_code == 200
    leaderboard = res.json()
    assert len(leaderboard) >= 1
    top_agent = leaderboard[0]
    assert top_agent["staff_email"] == "sales@lyka.ae"
    assert top_agent["deals_count"] >= 1
    assert top_agent["total_sales_aed"] == 12500000.0
    assert top_agent["rank"] == 1
    print("ok: leaderboard rankings calculated accurately (200)")

    # Admin approves commission
    app.dependency_overrides[require_deal_admin] = lambda: mock_admin
    res = client.patch(f"/api/staff/commissions/{comm_id}/status?status=approved")
    assert res.status_code == 200
    assert res.json()["status"] == "approved"
    assert res.json()["approved_by"] == "admin@lyka.ae"
    print("ok: admin approved commission (200)")


def test_notifications_and_saved_searches():
    print("\n--- 3. TEST NOTIFICATIONS & SAVED SEARCHES ---")
    app.dependency_overrides[_get_current_identity] = lambda: mock_customer

    # Customer saves a search
    res = client.post("/api/customer/saved-searches", json={
        "title": "Luxury Palm Villas",
        "search_criteria": {"location": "Palm Jumeirah", "bedrooms": 4, "min_price": 10000000},
    })
    assert res.status_code == 201
    search_id = res.json()["id"]
    print("ok: customer saved search (201)")

    # Customer lists saved searches
    res = client.get("/api/customer/saved-searches")
    assert res.status_code == 200
    assert len(res.json()) >= 1
    print("ok: customer listed saved searches (200)")

    # Customer creates a property alert
    res = client.post("/api/customer/property-alerts", json={
        "alert_type": "price_drop",
        "criteria": {"location": "Palm Jumeirah"},
        "frequency": "instant",
    })
    assert res.status_code == 201
    alert_id = res.json()["id"]
    print("ok: customer created property alert (201)")

    # Check in-app notifications
    res = client.get("/api/notifications")
    assert res.status_code == 200
    print("ok: retrieved in-app notifications (200)")


if __name__ == "__main__":
    test_support_tickets_workflow()
    test_deals_and_leaderboard_workflow()
    test_notifications_and_saved_searches()
    print("\n==================================================")
    print("ALL NEW ENTERPRISE MODULES VERIFIED SUCCESSFULLY!")
    print("==================================================")
