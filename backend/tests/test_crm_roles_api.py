import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""CRM multi-role login + dashboard API tests (isolated temp DB).

Covers: one account per role (/api/staff/me), UID binding on first login,
deactivation lockout, role-scoped GET /api/staff/overview dashboards, role
changes (admin-only), team scoping on leads, and unauthorized API access
(401 anonymous / 403 customer / 403 cross-role). Verified Firebase tokens are
SIMULATED by patching verify_bearer_token in app.services.roles.
Run: python test_crm_roles_api.py
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
from app.models import Assignment, FollowUp, Lead, StaffUser, Viewing  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
now = datetime.now(timezone.utc)
db.add_all([
    StaffUser(email="admin@crm.ae", name="AD", role="admin", is_active=True),
    StaffUser(email="mgr@crm.ae", name="MG", role="manager", is_active=True),
    StaffUser(email="sm@crm.ae", name="SM", role="sales_manager", is_active=True),
    StaffUser(email="sp1@crm.ae", name="S1", role="salesperson", is_active=True,
              manager_email="sm@crm.ae"),
    StaffUser(email="sp2@crm.ae", name="S2", role="salesperson", is_active=True,
              manager_email="sm@crm.ae"),
    StaffUser(email="spout@crm.ae", name="SO", role="salesperson", is_active=True),
    StaffUser(email="off@crm.ae", name="OFF", role="salesperson", is_active=False),
    Lead(raw_enquiry_text="2 bed marina buy", contact_email="c1@x.ae",
         customer_name="C1", location="Dubai Marina", status="new"),
    Lead(raw_enquiry_text="villa palm rent", contact_email="c2@x.ae",
         customer_name="C2", location="Palm Jumeirah", status="contacted"),
    Lead(raw_enquiry_text="studio jvc buy", contact_email="c3@x.ae",
         customer_name="C3", location="JVC", status="new"),
])
db.commit()
db.add_all([
    Assignment(lead_id=1, staff_email="sp1@crm.ae", assigned_by="mgr@crm.ae", status="open"),
    Assignment(lead_id=2, staff_email="spout@crm.ae", assigned_by="mgr@crm.ae", status="open"),
    FollowUp(lead_id=1, staff_email="sp1@crm.ae", note="Call back tomorrow",
             next_action_at=now + timedelta(days=2)),
    FollowUp(lead_id=2, staff_email="spout@crm.ae", note="Far future check",
             next_action_at=now + timedelta(days=60)),
    Viewing(lead_id=1, property_ref="LYK-00001", staff_email="sp1@crm.ae",
            scheduled_at=now + timedelta(days=2), status="scheduled"),
    Viewing(lead_id=2, property_ref="LYK-00002", staff_email="spout@crm.ae",
            scheduled_at=now - timedelta(days=5), status="cancelled"),
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


# 1. One account per role resolves via /api/staff/me.
for email, want in [("admin@crm.ae", "admin"), ("mgr@crm.ae", "manager"),
                    ("sm@crm.ae", "sales_manager"), ("sp1@crm.ae", "salesperson")]:
    with as_user(email):
        r = client.get("/api/staff/me")
        check("me %s -> %s" % (email, want),
              r.status_code == 200 and r.json()["role"] == want, r.text[:120])

# 2. Customer (verified email, no staff row) + anonymous are locked out.
with as_user("buyer@gmail.com"):
    check("customer me 403", client.get("/api/staff/me").status_code == 403)
    check("customer overview 403", client.get("/api/staff/overview").status_code == 403)
    check("customer leads 403", client.get("/api/leads").status_code == 403)
check("anonymous me 401", client.get("/api/staff/me").status_code == 401)
check("anonymous overview 401", client.get("/api/staff/overview").status_code == 401)

# 3. Login binds UID; deactivation locks the account out.
with as_user("sp2@crm.ae", uid="UID-SP2"):
    check("sp2 login 200", client.get("/api/staff/me").status_code == 200)
db2 = SessionLocal()
bound = db2.query(StaffUser).filter(StaffUser.email == "sp2@crm.ae").first()
check("sp2 UID bound", bound.firebase_uid == "UID-SP2", str(bound.firebase_uid))
db2.close()
with as_user("off@crm.ae", uid="u-off@crm.ae"):
    check("deactivated me 403", client.get("/api/staff/me").status_code == 403)
    check("deactivated overview 403", client.get("/api/staff/overview").status_code == 403)

# 4. Admin overview: real staff counts, assigned/unassigned, due, viewings.
with as_user("admin@crm.ae"):
    o = client.get("/api/staff/overview").json()
    check("admin staff_total", o.get("staff_total") == 7, str(o.get("staff_total")))
    check("admin active_staff", o.get("active_staff") == 6, str(o.get("active_staff")))
    check("admin leads_total", o.get("leads_total") == 3, str(o.get("leads_total")))
    check("admin assigned", o.get("assigned_leads") == 2, str(o.get("assigned_leads")))
    check("admin unassigned", o.get("unassigned_leads") == 1, str(o.get("unassigned_leads")))
    check("admin pipeline", o.get("pipeline") == {"new": 2, "contacted": 1}, str(o.get("pipeline")))
    check("admin followups due", o.get("followups_due_count") == 1
          and o["followups_due"][0]["lead_id"] == 1, str(o.get("followups_due")))
    check("admin upcoming viewing", len(o.get("upcoming_viewings")) == 1
          and o["upcoming_viewings"][0]["lead_id"] == 1, str(o.get("upcoming_viewings")))
    check("admin recent inquiries", len(o.get("recent_inquiries")) == 3, str(len(o.get("recent_inquiries"))))
    check("admin team perf", any(p["staff_email"] == "sp1@crm.ae" and p["open"] == 1
                                 for p in o.get("team_performance")), str(o.get("team_performance")))

# 5. Manager sees the same operational overview (read-only; writes stay admin-only).
with as_user("mgr@crm.ae"):
    o = client.get("/api/staff/overview").json()
    check("manager staff counts", o.get("staff_total") == 7 and o.get("active_staff") == 6, str(o))
    check("manager unassigned", o.get("unassigned_leads") == 1, str(o.get("unassigned_leads")))
    check("manager cannot create staff 403", client.post(
        "/api/staff", json={"email": "n@crm.ae", "name": "N", "role": "salesperson"}).status_code == 403)

# 6. Sales-manager overview is team-scoped (sm + sp1 + sp2).
with as_user("sm@crm.ae"):
    o = client.get("/api/staff/overview").json()
    check("sm team_size", o.get("team_size") == 3, str(o.get("team_size")))
    check("sm team leads only", o.get("leads_total") == 1 and o.get("assigned_leads") == 1,
          str((o.get("leads_total"), o.get("assigned_leads"))))
    check("sm team followups", o.get("followups_due_count") == 1, str(o.get("followups_due_count")))
    check("sm team viewings", len(o.get("upcoming_viewings")) == 1, str(o.get("upcoming_viewings")))
    check("sm no staff totals", "staff_total" not in o, str(sorted(o.keys())))

# 7. Salesperson overview is own-assignments only.
with as_user("sp1@crm.ae", uid="u-sp1@crm.ae"):
    o = client.get("/api/staff/overview").json()
    check("sp leads_total own", o.get("leads_total") == 1, str(o.get("leads_total")))
    check("sp upcoming own", len(o.get("upcoming_viewings")) == 1, str(o.get("upcoming_viewings")))
    leads = client.get("/api/leads").json()["leads"]
    check("sp lists own lead", [l["id"] for l in leads] == [1], str(leads))
    check("sp cross lead 403", client.get("/api/leads/2").status_code == 403)
    check("sp cannot assign 403", client.post(
        "/api/staff/assignments", json={"lead_id": 3, "staff_email": "sp1@crm.ae"}).status_code == 403)
    check("sp cannot write property 403", client.post(
        "/api/properties", json={"ref_code": "CRM-X", "title": "T", "property_type": "Apartment",
                                 "listing_type": "Sale", "location": "Dubai", "bedrooms": 1,
                                 "bathrooms": 1, "size_sqft": 500}).status_code == 403)

# 8. Admin-only role changes; second admin blocked.
with as_user("admin@crm.ae"):
    sp2row = SessionLocal().query(StaffUser).filter(StaffUser.email == "sp2@crm.ae").first()
    sp2id = sp2row.id
    r = client.patch("/api/staff/%d" % sp2id, json={"role": "manager"})
    check("admin role change 200", r.status_code == 200 and r.json()["role"] == "manager", r.text[:120])
with as_user("sp2@crm.ae", uid="UID-SP2"):
    check("promoted me manager", client.get("/api/staff/me").json()["role"] == "manager")
with as_user("admin@crm.ae"):
    r = client.patch("/api/staff/%d" % sp2id, json={"role": "salesperson"})
    check("admin role revert 200", r.status_code == 200 and r.json()["role"] == "salesperson", r.text[:120])
    r = client.post("/api/staff", json={"email": "second@crm.ae", "name": "S", "role": "admin"})
    check("second admin 409", r.status_code == 409, r.text[:120])
with as_user("mgr@crm.ae"):
    check("manager role change 403", client.patch(
        "/api/staff/%d" % sp2id, json={"role": "manager"}).status_code == 403)

# 9. SM assigns inside team, blocked outside it.
with as_user("sm@crm.ae"):
    r = client.post("/api/staff/assignments", json={"lead_id": 3, "staff_email": "sp2@crm.ae"})
    check("sm assign in-team 201", r.status_code == 201, r.text[:160])
    r = client.post("/api/staff/assignments", json={"lead_id": 3, "staff_email": "spout@crm.ae"})
    check("sm assign outside 403/409", r.status_code in (403, 409), r.text[:160])

print("PASSED %d checks" % len(passed))
