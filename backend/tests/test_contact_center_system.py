import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Comprehensive tests for Customer Contact Center & Call Monitoring System.

Verifies:
- GET /api/staff/contact-center/summary (role-scoped metrics)
- GET /api/staff/contact-center/contacts (filtering by tab, search, SLA breach)
- GET /api/staff/contact-center/daily-history (chronological history)
- GET /api/staff/contact-center/performance (salesperson metrics)
- GET /api/staff/contact-center/lead/{id}/details (timeline & customer info)
- GET /api/staff/contact-center/export (CSV export)
- GET/PUT /api/staff/contact-center/sla (SLA threshold)
- Attempt tracking & first call preservation in POST /api/staff/calls
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles
from app.database import SessionLocal, init_db
from app.main import app
from app.models import (
    Assignment, CallLog, FollowUp, Lead, StaffUser, Viewing, Activity
)
from fastapi.testclient import TestClient

init_db()
db = SessionLocal()
now = datetime.now(timezone.utc)

# Seed staff: admin, sales manager, 2 salespeople
db.add_all([
    StaffUser(email="admin@lyka.test", name="Admin User", role="admin", is_active=True),
    StaffUser(email="sm@lyka.test", name="Sales Manager", role="sales_manager", is_active=True),
    StaffUser(email="sp1@lyka.test", name="Agent 1", role="salesperson", is_active=True, manager_email="sm@lyka.test"),
    StaffUser(email="sp2@lyka.test", name="Agent 2", role="salesperson", is_active=True, manager_email="other@lyka.test"),
    # Leads
    Lead(id=1, customer_name="Hot Buyer", contact_email="buyer@test.ae", contact_phone="+971501112233",
         location="Palm Jumeirah", property_type="Villa", purpose="Buy", budget_min=5000000, budget_max=8000000,
         lead_score_band="Hot", status="new", created_at=now - timedelta(hours=30), raw_enquiry_text="Palm villa with private pool"),
    Lead(id=2, customer_name="Marina Renter", contact_email="renter@test.ae", contact_phone="+971502223344",
         location="Dubai Marina", property_type="Apartment", purpose="Rent", budget_min=100000, budget_max=150000,
         lead_score_band="Warm", status="new", created_at=now - timedelta(hours=5), raw_enquiry_text="1 bed marina near metro"),
    Lead(id=3, customer_name="Downtown Investor", contact_email="investor@test.ae", contact_phone="+971503334455",
         location="Downtown Dubai", property_type="Penthouse", purpose="Invest", budget_min=12000000, budget_max=18000000,
         lead_score_band="Hot", status="contacted", created_at=now - timedelta(hours=48), raw_enquiry_text="Burj view penthouse"),
])
db.commit()

# Assignments: lead 1 -> sp1, lead 2 -> sp1, lead 3 -> sp2
db.add_all([
    Assignment(lead_id=1, staff_email="sp1@lyka.test", assigned_by="sm@lyka.test", status="open"),
    Assignment(lead_id=2, staff_email="sp1@lyka.test", assigned_by="sm@lyka.test", status="open"),
    Assignment(lead_id=3, staff_email="sp2@lyka.test", assigned_by="admin@lyka.test", status="open"),
])
db.commit()
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []

def check(name, cond, extra=""):
    assert cond, f"FAIL: {name} {extra}"
    passed.append(name)
    print("ok:", name)

def as_user(email, uid=None):
    claims = {"uid": uid or ("u-" + email), "email": email}
    return patch.object(roles, "verify_bearer_token", return_value=claims)

# 1. Admin reads SLA and updates threshold
with as_user("admin@lyka.test"):
    r = client.get("/api/staff/contact-center/sla")
    check("admin gets sla config", r.status_code == 200 and r.json()["threshold_hours"] == 24)

    r_put = client.put("/api/staff/contact-center/sla", json={"threshold_hours": 24})
    check("admin updates sla config", r_put.status_code == 200 and r_put.json()["threshold_hours"] == 24)

# 2. Salesperson cannot update SLA
with as_user("sp1@lyka.test"):
    r_put = client.put("/api/staff/contact-center/sla", json={"threshold_hours": 12})
    check("salesperson cannot update sla config", r_put.status_code == 403)

# 3. Agent 1 views scoped summary (starts with 0 calls, 2 leads, 1 SLA breach because lead 1 is 30h old)
with as_user("sp1@lyka.test"):
    s = client.get("/api/staff/contact-center/summary")
    check("agent 1 gets summary", s.status_code == 200, s.text[:200])
    s_data = s.json()
    check("agent 1 has 2 contacts", s_data["total_contacts"] == 2, str(s_data))
    check("agent 1 has 2 not contacted", s_data["not_contacted_count"] == 2, str(s_data))
    check("agent 1 has 1 SLA breach (>24h uncontacted)", s_data["sla_breaches_count"] == 1, str(s_data))

# 4. Agent 1 logs first call with attempt tracking, outcomes, customer response and follow-up
with as_user("sp1@lyka.test"):
    r_call = client.post("/api/staff/calls", json={
        "lead_id": 1,
        "status": "connected",
        "duration_minutes": 8,
        "notes": "Discussed Palm villas with client",
        "customer_response": "Very interested in luxury waterfront, requested portfolio presentation",
        "recommended_action": "Schedule physical viewing for Saturday",
        "next_follow_up_at": (now + timedelta(days=2)).isoformat(),
        "lead_temperature": "Hot",
        "lead_status": "contacted",
    })
    check("agent 1 logs call (201)", r_call.status_code == 201, r_call.text[:200])
    call_json = r_call.json()
    check("first call is preserved as is_first_call=True", call_json.get("is_first_call") is True, str(call_json))
    check("attempt_number is 1", call_json.get("attempt_number") == 1, str(call_json))
    check("customer_response persisted", "waterfront" in (call_json.get("customer_response") or ""), str(call_json))

    # Log second call on same lead (attempt 2)
    r_call2 = client.post("/api/staff/calls", json={
        "lead_id": 1,
        "status": "connected",
        "duration_minutes": 5,
        "notes": "Follow-up confirmation",
        "customer_response": "Confirmed Saturday 11am",
        "recommended_action": "Coordinate with villa security",
        "lead_temperature": "Hot",
        "lead_status": "qualified",
    })
    check("second call logged", r_call2.status_code == 201, r_call2.text[:200])
    call2_json = r_call2.json()
    check("attempt_number incremented to 2", call2_json.get("attempt_number") == 2, str(call2_json))
    check("is_first_call is False for attempt 2", call2_json.get("is_first_call") is False, str(call2_json))

# 5. Summary reflects updated metrics
with as_user("sp1@lyka.test"):
    s2 = client.get("/api/staff/contact-center/summary").json()
    check("summary shows 1 connected contact", s2["connected_count"] == 1, str(s2))
    check("summary shows 1 not contacted", s2["not_contacted_count"] == 1, str(s2))
    check("summary calls_today is 2", s2["calls_today"] == 2, str(s2))
    check("connection_rate is 100%", s2["connection_rate"] == 100.0, str(s2))

# 6. Contacts list filtering by tab
with as_user("sp1@lyka.test"):
    all_res = client.get("/api/staff/contact-center/contacts?tab=all").json()
    check("tab=all returns 2 contacts", all_res["total"] == 2, str(all_res))

    conn_res = client.get("/api/staff/contact-center/contacts?tab=connected").json()
    check("tab=connected returns 1 contact (Lead 1)", conn_res["total"] == 1 and conn_res["contacts"][0]["lead_id"] == 1, str(conn_res))

    unconn_res = client.get("/api/staff/contact-center/contacts?tab=not_contacted").json()
    check("tab=not_contacted returns 1 contact (Lead 2)", unconn_res["total"] == 1 and unconn_res["contacts"][0]["lead_id"] == 2, str(unconn_res))

# 7. Customer details and activity history timeline
with as_user("sp1@lyka.test"):
    details = client.get("/api/staff/contact-center/lead/1/details")
    check("lead details returns 200", details.status_code == 200, details.text[:200])
    d_json = details.json()
    check("lead requirements included", d_json["lead"]["location"] == "Palm Jumeirah", str(d_json["lead"]))
    check("timeline has calls recorded", len(d_json["timeline"]) >= 2, str(d_json["timeline"]))
    first_event = d_json["timeline"][0]
    check("timeline items have title and details", bool(first_event["title"]) and "details" in first_event, str(first_event))

# 8. Daily call history
with as_user("sp1@lyka.test"):
    dh = client.get("/api/staff/contact-center/daily-history")
    check("daily history returns 200", dh.status_code == 200, dh.text[:200])
    dh_json = dh.json()
    check("history contains the 2 logged calls", dh_json["total"] == 2, str(dh_json))
    check("history includes customer name", dh_json["calls"][0]["customer_name"] == "Hot Buyer", str(dh_json["calls"][0]))

# 9. Performance comparison: Admin sees all agents, Sales Manager sees Agent 1, Agent 1 sees self
with as_user("admin@lyka.test"):
    perf_admin = client.get("/api/staff/contact-center/performance")
    check("admin gets performance comparison", perf_admin.status_code == 200, perf_admin.text[:200])
    pa = perf_admin.json()
    check("admin sees multiple staff", len(pa) >= 2, str(pa))
    sp1_stat = next((x for x in pa if x["staff_email"] == "sp1@lyka.test"), None)
    check("agent 1 has 2 attempted calls in admin view", sp1_stat and sp1_stat["calls_attempted"] == 2, str(sp1_stat))

with as_user("sm@lyka.test"):
    perf_sm = client.get("/api/staff/contact-center/performance").json()
    sm_emails = {x["staff_email"] for x in perf_sm}
    check("sales manager sees team agent", "sp1@lyka.test" in sm_emails, str(sm_emails))
    check("sales manager does not see unrelated agent 2", "sp2@lyka.test" not in sm_emails, str(sm_emails))

# 10. CSV Export
with as_user("admin@lyka.test"):
    csv_res = client.get("/api/staff/contact-center/export?tab=all")
    check("csv export returns 200", csv_res.status_code == 200, csv_res.text[:200])
    check("content-type is text/csv", "text/csv" in csv_res.headers.get("content-type", ""))
    check("csv header has Lead ID and Customer Name", "Lead ID,Customer Name" in csv_res.text)
    print("CSV TEXT:", repr(csv_res.text))
    check("csv contains customer data", "Hot Buyer" in csv_res.text)

print(f"\nAll {len(passed)} Contact Center backend checks passed!")
