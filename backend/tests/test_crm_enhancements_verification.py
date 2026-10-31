import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""
Targeted Verification Suite for LYKA REALTY CRM Enhancements:
1. Role permissions & Scoping (Admin, Sales Manager, Salesperson, Customer)
2. Lead scoring & Unanswered Calls (Never Cold Proof)
3. Call Activity Outcomes & Duplicate Prevention
4. Property Inventory Verification (Exact 3,000 dataset, Ready vs Off-plan)
5. Customer Data Isolation & Ownership
"""
import os
import sys
import tempfile
from datetime import datetime, timezone
from unittest.mock import patch

# Use temporary sqlite database for isolated fast testing
tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles
from app.database import SessionLocal, init_db
from app.main import app
from app.models import Assignment, CallLog, CustomerProfile, FollowUp, Lead, StaffUser, Viewing
from app.services.property_service import get_inventory_analytics, search_properties_dataset
from app.services.lead_scoring_service import score_lead, band_for
from app.services.lead_service import calculate_score
from fastapi.testclient import TestClient

init_db()
db = SessionLocal()

# Seed staff users with strict hierarchy
admin_user = StaffUser(email="admin@crm.ae", name="Admin User", role="admin", is_active=True)
sm_user = StaffUser(email="sm@crm.ae", name="Sales Manager", role="sales_manager", is_active=True)
sp1_user = StaffUser(email="sp1@crm.ae", name="Sales Person 1", role="salesperson", manager_email="sm@crm.ae", is_active=True)
sp2_user = StaffUser(email="sp2@crm.ae", name="Sales Person 2", role="salesperson", manager_email="other_mgr@crm.ae", is_active=True)
db.add_all([admin_user, sm_user, sp1_user, sp2_user])
db.commit()

# Seed leads & assignments
lead1 = Lead(
    raw_enquiry_text="I want to buy a 2-bedroom apartment in Downtown Dubai for AED 3.5M.",
    customer_name="Alice Smith",
    contact_email="alice@test.com",
    location="Downtown Dubai",
    property_type="Apartment",
    lead_type="buyer",
    budget_max=3500000,
    timeline_days=20,
    status="new",
    priority_label="High",
    priority_score=85,
)
lead2 = Lead(
    raw_enquiry_text="Looking for a luxury villa in Dubai Marina for AED 5M.",
    customer_name="Bob Jones",
    contact_email="bob@test.com",
    location="Dubai Marina",
    property_type="Villa",
    lead_type="buyer",
    budget_max=5000000,
    timeline_days=60,
    status="contacted",
    priority_label="Medium",
    priority_score=60,
)
db.add_all([lead1, lead2])
db.commit()

# Assign lead 1 to sp1 (under sm), and lead 2 to sp2 (not under sm)
db.add(Assignment(lead_id=lead1.id, staff_email="sp1@crm.ae", assigned_by="sm@crm.ae", status="open"))
db.add(Assignment(lead_id=lead2.id, staff_email="sp2@crm.ae", assigned_by="other_mgr@crm.ae", status="open"))
db.commit()
lead1_id = lead1.id
lead2_id = lead2.id
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed_checks = 0

def check(name, condition, extra=""):
    global passed_checks
    assert condition, f"FAIL: {name} {extra}"
    passed_checks += 1
    print(f"ok: {name}")

print("\n--- 1. VERIFY PROPERTY INVENTORY EXACT COUNTS ---")
inv = get_inventory_analytics()
check("exact total inventory is 3000", inv["total_inventory"] == 3000, f"Got {inv['total_inventory']}")
check("available ready units count is 2713", inv["available_ready"] == 2713, f"Got {inv['available_ready']}")
check("reserved off-plan units count is 287", inv["reserved_off_plan"] == 287, f"Got {inv['reserved_off_plan']}")
check("listing types sum to 3000", (inv["listing_types"]["Sale"] + inv["listing_types"]["Rent"]) == 3000)
check("search pagination page 1", search_properties_dataset(limit=10, page=1)["page"] == 1)
check("search pagination page 2", search_properties_dataset(limit=10, page=2)["page"] == 2)
check("inventory-stats HTTP endpoint returns 200", client.get("/api/properties/inventory-stats").status_code == 200)

print("\n--- 2. VERIFY AI LEAD QUALIFICATION & UNANSWERED CALLS ---")
hot_req = {
    "budget_max": 4000000,
    "location": "Downtown Dubai",
    "property_type": "Apartment",
    "bedrooms": 2,
    "lead_type": "buyer",
    "timeline_days": 15,
}
scored_hot = calculate_score(hot_req)
check("hot lead scores >= 70", scored_hot["total"] >= 70)
check("hot lead band is Hot", scored_hot["band"] == "Hot")
check("hot lead has recommended_next_action", bool(scored_hot.get("recommended_next_action")))

# Unanswered calls: test that recording unanswered calls treats them as contact attempts without penalizing
call_activities = [
    {"activity_type": "call_attempted", "status": "attempted_no_answer", "created_at": datetime.now(timezone.utc).isoformat()}
]
score_with_no_answer = score_lead(hot_req, activities=call_activities)
check("unanswered call does not downgrade hot lead", score_with_no_answer["band"] == "Hot")

print("\n--- 3. VERIFY CALL ACTIVITY OUTCOMES & DUPLICATE PREVENTION ---")
with patch.object(roles, "verify_bearer_token", return_value={"uid": "u-sp1", "email": "sp1@crm.ae"}):
    # Call with outcome: attempted_no_answer
    r1 = client.post("/api/staff/calls", json={
        "lead_id": lead1_id,
        "status": "attempted_no_answer",
        "notes": "Customer did not pick up",
    })
    check("record no_answer call attempt (201)", r1.status_code == 201, r1.text)
    call_id = r1.json()["id"]

    # Rapid duplicate submission (within 10 seconds)
    r2 = client.post("/api/staff/calls", json={
        "lead_id": lead1_id,
        "status": "attempted_no_answer",
        "notes": "Customer did not pick up",
    })
    check("duplicate submission returns existing call id without creating duplicate", r2.status_code == 201 and r2.json()["id"] == call_id)

    # Call with outcome: busy_unreachable
    r_busy = client.post("/api/staff/calls", json={
        "lead_id": lead1_id,
        "status": "busy_unreachable",
        "notes": "Line busy",
    })
    check("record busy outcome (201)", r_busy.status_code == 201)

    # Call with outcome: connected
    r_conn = client.post("/api/staff/calls", json={
        "lead_id": lead1_id,
        "status": "connected",
        "duration_minutes": 8,
        "notes": "Spoke with Alice, interested in viewing",
    })
    check("record connected call (201)", r_conn.status_code == 201)

print("\n--- 4. VERIFY ROLE PERMISSIONS & DATA SCOPING ---")
# Admin sees everything
with patch.object(roles, "verify_bearer_token", return_value={"uid": "u-admin", "email": "admin@crm.ae"}):
    r_admin_ov = client.get("/api/staff/overview")
    check("admin overview 200", r_admin_ov.status_code == 200)
    check("admin sees both leads", r_admin_ov.json()["leads_total"] == 2)
    check("admin sees staff total", "staff_total" in r_admin_ov.json())

# Sales Manager sees only reporting team (sp1, lead1)
with patch.object(roles, "verify_bearer_token", return_value={"uid": "u-sm", "email": "sm@crm.ae"}):
    r_sm_ov = client.get("/api/staff/overview")
    check("sales manager overview 200", r_sm_ov.status_code == 200)
    check("sales manager scoped to team leads only (1 lead)", r_sm_ov.json()["leads_total"] == 1)
    check("sales manager sees team size", r_sm_ov.json().get("team_size") == 2)  # sm + sp1

# Salesperson sees only own assigned leads
with patch.object(roles, "verify_bearer_token", return_value={"uid": "u-sp1", "email": "sp1@crm.ae"}):
    r_sp_leads = client.get("/api/leads")
    check("salesperson lists own leads 200", r_sp_leads.status_code == 200)
    check("salesperson only sees 1 assigned lead", r_sp_leads.json()["total"] == 1)

    # Salesperson cannot access lead2 (assigned to sp2)
    r_sp_cross = client.get(f"/api/leads/{lead2_id}")
    check("salesperson denied access to unassigned lead (403)", r_sp_cross.status_code == 403)

# Customer denied staff routes
with patch.object(roles, "verify_bearer_token", return_value={"uid": "u-cust", "email": "customer@gmail.com"}):
    check("customer denied staff me (403)", client.get("/api/staff/me").status_code == 403)
    check("customer denied staff overview (403)", client.get("/api/staff/overview").status_code == 403)
    check("customer denied staff calls (403)", client.get("/api/staff/calls").status_code == 403)

print("\n--- 5. VERIFY CUSTOMER DATA ISOLATION ---")
with patch.object(roles, "verify_bearer_token", return_value={"uid": "u-alice", "email": "alice@gmail.com"}):
    # Customer Alice saves preferences
    r_p = client.put("/api/customer/profile", json={"name": "Alice", "city": "Dubai"})
    check("alice saves profile 200", r_p.status_code == 200)

    # Customer Alice saves favorite
    r_f = client.put("/api/customer/favorites", json={"favorites": ["LYK-00001", "LYK-00005"]})
    check("alice saves favorites 200", r_f.status_code == 200)

with patch.object(roles, "verify_bearer_token", return_value={"uid": "u-bob", "email": "bob@gmail.com"}):
    # Customer Bob cannot see Alice's profile
    r_bp = client.get("/api/customer/profile")
    check("bob gets own empty profile without seeing alice", r_bp.json().get("profile") is None)
    # Customer Bob has 0 favorites
    r_bf = client.get("/api/customer/favorites")
    check("bob has 0 favorites", r_bf.json().get("favorites") == [])

print(f"\n==================================================")
print(f"ALL {passed_checks} TARGETED VERIFICATION CHECKS PASSED!")
print(f"==================================================")
