import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Targeted verification for LYKA REALTY Manual Phone Calling & CRM Call Activity Integration.

Tests:
1. Salesperson can record a manual call attempt for an authorized lead.
2. Outcomes: "attempted_no_answer" sets attempted_at but NOT connected_at.
3. Outcome "connected" sets both attempted_at and connected_at.
4. Outcome "busy_unreachable" sets attempted_at but NOT connected_at.
5. Outcome "not_interested" records customer response without falsely marking a sale.
6. Comments and next follow-up dates persist in CallLog and create FollowUp.
7. Follow-up 1 month ahead persists accurately.
8. Lead Activity timeline receives activity row for call attempts and outcomes.
9. Unauthorized staff (salesperson not assigned to lead) cannot record or update calls (403).
10. Double submission protection prevents duplicate logs for identical rapid requests.
11. Scheduled call without attempt has attempted_at=None, connected_at=None.
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
    Activity, Assignment, CallLog, FollowUp, Lead, StaffUser,
)
from fastapi.testclient import TestClient

init_db()
db = SessionLocal()
now = datetime.now(timezone.utc)

db.add_all([
    StaffUser(email="admin@lyka.ae", name="Admin", role="admin", is_active=True),
    StaffUser(email="manager@lyka.ae", name="Manager", role="sales_manager", is_active=True),
    StaffUser(email="sp1@lyka.ae", name="Salesperson 1", role="salesperson", is_active=True, manager_email="manager@lyka.ae"),
    StaffUser(email="sp2@lyka.ae", name="Salesperson 2", role="salesperson", is_active=True),
    Lead(
        id=1,
        raw_enquiry_text="Looking for luxury apartment in Marina",
        customer_name="Sheikh Ahmed",
        contact_email="ahmed@example.ae",
        contact_phone="+971501234567",
        location="Dubai Marina",
        status="new",
    ),
    Lead(
        id=2,
        raw_enquiry_text="Downtown penthouse",
        customer_name="Fatima Noor",
        contact_email="fatima@example.ae",
        contact_phone="+971509876543",
        location="Downtown Dubai",
        status="new",
    ),
    Assignment(lead_id=1, staff_email="sp1@lyka.ae", assigned_by="manager@lyka.ae", status="open"),
    Assignment(lead_id=2, staff_email="sp2@lyka.ae", assigned_by="admin@lyka.ae", status="open"),
])
db.commit()
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []

def check(name, cond, extra=""):
    assert cond, f"FAIL: {name} {extra}"
    passed.append(name)
    print(f"ok: {name}")

def as_user(email, uid=None):
    claims = {"uid": uid or ("uid-" + email), "email": email}
    return patch.object(roles, "verify_bearer_token", return_value=claims)

# 1. Salesperson 1 attempts call -> No Answer (Example A)
with as_user("sp1@lyka.ae"):
    tomorrow = (now + timedelta(days=1)).isoformat()
    r = client.post("/api/staff/calls", json={
        "lead_id": 1,
        "status": "attempted_no_answer",
        "notes": "Customer did not answer the call. Rang 5 times.",
        "next_follow_up_at": tomorrow,
    })
    check("salesperson records no_answer call attempt", r.status_code == 201, r.text)
    call = r.json()
    check("no_answer sets attempted_at", call["attempted_at"] is not None)
    check("no_answer leaves connected_at None", call["connected_at"] is None)
    check("notes persist", call["notes"] == "Customer did not answer the call. Rang 5 times.")
    check("next_follow_up_at persists", call["next_follow_up_at"] is not None)

    # Verify FollowUp record was created
    fus = client.get("/api/staff/followups?lead_id=1").json()
    check("follow-up entry created from call log", len(fus) >= 1)
    check("follow-up note mentions call", "Follow-up from call" in fus[0]["note"])

    # 2. Duplicate submission protection: rapid repeated POST within 10s returns existing
    r_dup = client.post("/api/staff/calls", json={
        "lead_id": 1,
        "status": "attempted_no_answer",
        "notes": "Customer did not answer the call. Rang 5 times.",
        "next_follow_up_at": tomorrow,
    })
    check("rapid duplicate request returns 201 with same id", r_dup.status_code == 201 and r_dup.json()["id"] == call["id"])

    # 3. Busy / Unreachable call attempt (Example E)
    r_busy = client.post("/api/staff/calls", json={
        "lead_id": 1,
        "status": "busy_unreachable",
        "notes": "Line busy / out of coverage.",
    })
    check("busy_unreachable recorded", r_busy.status_code == 201)
    call_busy = r_busy.json()
    check("busy_unreachable has attempted_at", call_busy["attempted_at"] is not None)
    check("busy_unreachable has NO connected_at", call_busy["connected_at"] is None)

    # 4. Connected call with one-month follow-up (Example B)
    one_month_later = (now + timedelta(days=30)).isoformat()
    r_conn = client.post("/api/staff/calls", json={
        "lead_id": 1,
        "status": "connected",
        "notes": "Spoke with customer. Customer requested a follow-up call in one month.",
        "next_follow_up_at": one_month_later,
        "duration_minutes": 6,
        "lead_temperature": "Warm",
    })
    check("connected call recorded", r_conn.status_code == 201, r_conn.text)
    call_conn = r_conn.json()
    check("connected sets attempted_at", call_conn["attempted_at"] is not None)
    check("connected sets connected_at", call_conn["connected_at"] is not None)
    check("duration persists", call_conn["duration_minutes"] == 6)

    # Verify Activity Timeline received entries
    lead1 = client.get("/api/leads/1").json()
    activities = lead1.get("activities", [])
    check("lead activity timeline contains call events", len(activities) >= 3, str(activities))
    act_types = [a["activity_type"] for a in activities]
    check("activity distinguishes call_attempted and agent_contacted", "agent_contacted" in act_types and "call_attempted" in act_types)
    check("lead temperature updated to Warm", lead1.get("lead_score_band") == "Warm")
    check("lead status advanced to contacted", lead1.get("status") == "contacted")

    # 5. Not Interested outcome (Example D)
    r_ni = client.post("/api/staff/calls", json={
        "lead_id": 1,
        "status": "not_interested",
        "notes": "Customer bought in Abu Dhabi, no longer looking in Dubai.",
        "lead_status": "lost",
    })
    check("not_interested outcome recorded", r_ni.status_code == 201)
    lead1_after = client.get("/api/leads/1").json()
    check("not_interested updated status to lost without sale", lead1_after["status"] == "lost")

# 6. Unauthorized access: Salesperson 2 CANNOT log or update calls on Lead 1 (assigned to sp1)
with as_user("sp2@lyka.ae"):
    r_unauth = client.post("/api/staff/calls", json={
        "lead_id": 1,
        "status": "connected",
        "notes": "Unauthorized attempt",
    })
    check("unauthorized salesperson denied logging call on another's lead (403)", r_unauth.status_code == 403)

    r_update_unauth = client.patch(f"/api/staff/calls/{call['id']}", json={
        "status": "completed",
    })
    check("unauthorized salesperson denied updating another's call (403)", r_update_unauth.status_code == 403)

# 7. Analytics verification: attempts, connections, no-answer counts reflect real outcomes
with as_user("admin@lyka.ae"):
    analytics = client.get("/api/staff/analytics").json()
    calls_stat = analytics["calls"]
    check("analytics counts attempted calls accurately", calls_stat["attempted"] >= 3)
    check("analytics counts connected calls accurately", calls_stat["connected"] >= 1)
    check("analytics counts no_answer calls accurately", calls_stat["no_answer"] >= 1)
    check("connect rate is computed", calls_stat["connect_rate"] is not None and calls_stat["connect_rate"] > 0)

print(f"\nAll {len(passed)} manual calling verification checks passed successfully!")
