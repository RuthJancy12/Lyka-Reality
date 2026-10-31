import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Focused tests for call outcomes, audit trail, analytics, and customer
appointment scoping.

Run: python test_calls_audit_analytics.py
Uses an isolated temporary SQLite database and simulated verified tokens.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Assignment, CallLog, CustomerInquiry, CustomerProfile, FollowUp, Lead,
    StaffUser, Viewing,
)
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
now = datetime.now(timezone.utc)
db.add_all([
    StaffUser(email="admin@a.ae", name="AD", role="admin", is_active=True),
    StaffUser(email="sm@a.ae", name="SM", role="sales_manager", is_active=True),
    StaffUser(email="sp1@a.ae", name="S1", role="salesperson", is_active=True,
              manager_email="sm@a.ae"),
    StaffUser(email="sp2@a.ae", name="S2", role="salesperson", is_active=True),
    Lead(raw_enquiry_text="2 bed marina", contact_email="buyer@x.ae",
         customer_name="Buyer", location="Dubai Marina", status="contacted"),
    Lead(raw_enquiry_text="villa palm", contact_email="other@x.ae",
         customer_name="Other", location="Palm Jumeirah", status="new"),
])
db.commit()
db.add_all([
    Assignment(lead_id=1, staff_email="sp1@a.ae", assigned_by="sm@a.ae", status="open"),
    Assignment(lead_id=2, staff_email="sp2@a.ae", assigned_by="admin@a.ae", status="open"),
    FollowUp(lead_id=1, staff_email="sp1@a.ae", note="Call back",
             next_action_at=now + timedelta(days=1)),
    Viewing(lead_id=1, property_ref="LYK-00001", staff_email="sp1@a.ae",
            scheduled_at=now + timedelta(days=2), status="completed"),
    Viewing(lead_id=2, property_ref="LYK-00002", staff_email="sp2@a.ae",
            scheduled_at=now + timedelta(days=3), status="scheduled"),
    CustomerInquiry(
        firebase_uid="buyer-uid", record_ref="inq-1", lead_id=1,
        property_id="LYK-00001", property_title="Marina home",
        property_location="Dubai Marina", property_type="Apartment",
        listing_type="Sale", price_aed=2000000, bedrooms=2, size_sqft=1100,
        status="Submitted",
    ),
    CustomerProfile(firebase_uid="buyer-uid", email="buyer@x.ae", name="Buyer"),
])
db.commit()
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


def as_user(email, uid=None):
    claims = {"uid": uid or ("u-" + email), "email": email}
    return patch.object(roles, "verify_bearer_token", return_value=claims)


# Customer can save multiple named requirements in the existing JSON prefs.
with as_user("buyer@x.ae", uid="buyer-uid"):
    payload = {
        "locations": ["Dubai Marina"],
        "propertyType": "Apartment",
        "bedrooms": 2,
        "budgetMin": 1500000,
        "budgetMax": 2500000,
        "purpose": "Buy",
        "timeline_days": 60,
        "requirements": [
            {
                "id": "req-marina", "label": "Marina rental",
                "locations": ["Dubai Marina"], "propertyType": "Apartment",
                "bedrooms": 1, "budgetMin": 80000, "budgetMax": 120000,
                "purpose": "Rent", "timeline_days": 30,
            },
            {
                "id": "req-palm", "label": "Palm investment",
                "locations": ["Palm Jumeirah"], "propertyType": "Villa",
                "budgetMin": 5000000, "budgetMax": 9000000,
                "purpose": "Invest",
            },
        ],
    }
    r = client.put("/api/customer/preferences", json=payload)
    check("customer saves multiple requirements", r.status_code == 200, r.text[:200])
    got = client.get("/api/customer/preferences").json()
    check("multiple requirements persist", len(got.get("requirements", [])) == 2, str(got))

# Scheduling is not an attempt.
with as_user("sp1@a.ae", uid="uid-sp1"):
    r = client.post("/api/staff/calls", json={
        "lead_id": 1,
        "scheduled_at": (now + timedelta(hours=2)).isoformat(),
        "notes": "Discovery call",
    })
    check("salesperson schedules call", r.status_code == 201, r.text[:200])
    call = r.json()
    check("scheduled call is not attempted",
          call["status"] == "scheduled" and call["attempted_at"] is None
          and call["connected_at"] is None, str(call))
    call_id = call["id"]

    r2 = client.post("/api/staff/calls", json={
        "lead_id": 2, "scheduled_at": (now + timedelta(hours=3)).isoformat(),
    })
    check("cannot schedule on another salesperson's lead", r2.status_code == 403,
          r2.text[:200])

    r3 = client.patch(f"/api/staff/calls/{call_id}", json={"status": "connected"})
    check("actual outcome records attempt + connection",
          r3.status_code == 200 and r3.json()["attempted_at"]
          and r3.json()["connected_at"], r3.text[:200])

    a = client.get("/api/staff/analytics")
    check("salesperson analytics 200", a.status_code == 200, a.text[:200])
    a = a.json()
    check("analytics does not count scheduled as attempted",
          a["calls"]["scheduled"] == 0 and a["calls"]["attempted"] == 1
          and a["calls"]["connected"] == 1, str(a["calls"]))

    # Follow-up completion is explicit and measurable.
    f = client.post("/api/staff/followups", json={
        "lead_id": 1, "note": "Send options", "next_action_at": now.isoformat(),
    })
    check("salesperson creates follow-up", f.status_code == 201, f.text[:200])
    fid = f.json()["id"]
    c = client.patch(f"/api/staff/followups/{fid}/complete", json={"completed": True})
    check("follow-up completed explicitly", c.status_code == 200
          and c.json()["completed_at"] is not None, c.text[:200])
    a = client.get("/api/staff/analytics").json()
    check("follow-up completion rate is computed",
          a["followups"]["total"] == 2 and a["followups"]["completed"] == 1
          and a["conversion"]["follow_up_completion_rate"] == 50.0,
          str(a["followups"]) + str(a["conversion"]))

# Cross-role call update is denied even when the call id is known.
with as_user("sp2@a.ae", uid="uid-sp2"):
    r = client.patch(f"/api/staff/calls/{call_id}", json={"status": "completed"})
    check("salesperson cannot update another's call", r.status_code == 403, r.text[:200])
    check("salesperson analytics stays scoped",
          client.get("/api/staff/analytics").json()["totals"]["leads"] == 1,
          client.get("/api/staff/analytics").text[:200])
    check("salesperson cannot read audit",
          client.get("/api/staff/audit").status_code == 403)

# Customer appointment view is read-only, own-lead only, and lacks internals.
with as_user("buyer@x.ae", uid="buyer-uid"):
    r = client.get("/api/customer/appointments")
    check("customer reads own appointments", r.status_code == 200, r.text[:200])
    appts = r.json()["appointments"]
    check("customer sees call + viewing for own lead", len(appts) == 2, str(appts))
    check("customer does not see other lead's viewing",
          all(x["lead_id"] == 1 for x in appts), str(appts))
    check("appointment payload exposes no staff notes/email",
          all("notes" not in x and "staff_email" not in x for x in appts), str(appts))
    check("customer cannot read staff analytics",
          client.get("/api/staff/analytics").status_code == 403)
    w = client.patch("/api/customer/inquiries/inq-1", json={"status": "Withdrawn"})
    check("customer withdraws own enquiry", w.status_code == 200
          and w.json()["status"] == "Withdrawn", w.text[:200])

# Admin audit + analytics see real totals and the recorded actions.
with as_user("admin@a.ae", uid="uid-admin"):
    a = client.get("/api/staff/analytics")
    check("admin analytics 200", a.status_code == 200, a.text[:200])
    a = a.json()
    check("admin sees both leads", a["totals"]["leads"] == 2, str(a["totals"]))
    check("admin sees real customer total", a["totals"]["customers_total"] == 1,
          str(a["totals"]))
    audit = client.get("/api/staff/audit?limit=100")
    check("admin reads audit trail", audit.status_code == 200, audit.text[:200])
    body = audit.json()
    actions = {e["action"] for e in body["events"]}
    check("audit records schedule + outcome + completion",
          {"call_scheduled", "call_outcome_recorded", "follow_up_completed"} <= actions,
          str(actions))
    check("audit records actor + entity id",
          all(e["actor_email"] and e["entity_type"] for e in body["events"]),
          str(body["events"][:2]))
    check("audit never stores tokens or passwords",
          "token" not in (audit.text or "").lower()
          and "password" not in (audit.text or "").lower())

# Manager scope: sales manager sees own team only.
with as_user("sm@a.ae", uid="uid-sm"):
    a = client.get("/api/staff/analytics")
    check("sales manager analytics 200", a.status_code == 200, a.text[:200])
    check("sales manager sees only team lead", a.json()["totals"]["leads"] == 1,
          str(a.json()["totals"]))
    check("sales manager cannot edit targets",
          client.put("/api/staff/targets", json={
              "metric": "leads", "period": now.strftime("%Y-%m"), "target_value": 5,
          }).status_code == 403)

# Admin target tracking uses real month actuals and is audited.
with as_user("admin@a.ae", uid="uid-admin"):
    period = now.strftime("%Y-%m")
    r = client.put("/api/staff/targets", json={
        "metric": "leads", "period": period, "target_value": 10,
    })
    check("admin sets monthly target", r.status_code == 200, r.text[:200])
    t = r.json()
    check("target actual reflects persisted leads",
          t["actual_value"] == 2 and t["progress_pct"] == 20.0, str(t))
    rows = client.get(f"/api/staff/targets?period={period}").json()
    check("admin reads target list", len(rows) == 1 and rows[0]["metric"] == "leads", str(rows))
    actions = {e["action"] for e in client.get("/api/staff/audit?limit=100").json()["events"]}
    check("target changes are audited", "target_updated" in actions, str(actions))

with as_user("sp1@a.ae", uid="uid-sp1"):
    check("salesperson cannot read targets",
          client.get("/api/staff/targets").status_code == 403)

print("\n%d checks passed" % len(passed))
