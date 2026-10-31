import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Lead-assignment flow tests backing the Lead Details Assign-To feature.

Uses the existing assignments schema/endpoints (no new API, no migration):
assign -> appears in salesperson My Work + Leads view -> reassign closes
the old row (history preserved) -> scoping and auth gates hold.
Run: python test_lead_assign.py
"""
import os
import tempfile
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Assignment, Lead, StaffUser  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add_all([
    StaffUser(email="admin@a.ae", name="AD", role="admin", is_active=True),
    StaffUser(email="sm@a.ae", name="SM", role="sales_manager", is_active=True),
    StaffUser(email="sp1@a.ae", name="S1", role="salesperson", is_active=True,
              manager_email="sm@a.ae"),
    StaffUser(email="sp2@a.ae", name="S2", role="salesperson", is_active=True,
              manager_email="sm@a.ae"),
    StaffUser(email="spout@a.ae", name="SO", role="salesperson", is_active=True),
    Lead(raw_enquiry_text="2 bed marina buy", contact_email="c1@x.ae",
         customer_name="C1", location="Dubai Marina", status="new"),
    Lead(raw_enquiry_text="villa palm rent", contact_email="c2@x.ae",
         customer_name="C2", location="Palm Jumeirah", status="new"),
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
    return patch.object(roles, "verify_bearer_token",
                        return_value={"uid": uid or ("u-" + email), "email": email})


# 1. Admin assigns lead 1 to sp1 (201, correct schema/fields).
with as_user("admin@a.ae"):
    r = client.post("/api/staff/assignments", json={"lead_id": 1, "staff_email": "sp1@a.ae"})
    check("admin assign 201", r.status_code == 201, r.text[:200])
    body = r.json()
    check("assignee stored", body["staff_email"] == "sp1@a.ae", str(body))
    check("assigned_by audit", body["assigned_by"] == "admin@a.ae", str(body))
    check("status open", body["status"] == "open", str(body))
    asg1 = body["id"]

# 2. Assigned lead appears in sp1's My Work + Leads view; lead 2 hidden.
with as_user("sp1@a.ae"):
    mine = client.get("/api/staff/assignments").json()
    check("sp1 sees assignment", [a["id"] for a in mine] == [asg1], str(mine))
    leads = [l["id"] for l in client.get("/api/leads").json()["leads"]]
    check("sp1 sees lead 1 only", leads == [1], str(leads))
    check("sp1 followups scoped", client.get("/api/staff/followups").status_code == 200)

# 3. Unauthorized attempts: customer, anonymous, salesperson, SM out-of-team.
with as_user("cust@gmail.com"):
    check("customer assign 403", client.post(
        "/api/staff/assignments", json={"lead_id": 2, "staff_email": "sp1@a.ae"}).status_code == 403)
    check("customer list assignments 403",
          client.get("/api/staff/assignments").status_code == 403)
check("anonymous assign 401", client.post(
    "/api/staff/assignments", json={"lead_id": 2, "staff_email": "sp1@a.ae"}).status_code == 401)
with as_user("sp1@a.ae"):
    check("salesperson assign 403", client.post(
        "/api/staff/assignments", json={"lead_id": 2, "staff_email": "sp1@a.ae"}).status_code == 403)
with as_user("sm@a.ae"):
    r = client.post("/api/staff/assignments", json={"lead_id": 2, "staff_email": "spout@a.ae"})
    check("sm outside team 403/409", r.status_code in (403, 409), r.text[:160])

# 4. Duplicate open assignment blocked (409), then reassign preserves history.
with as_user("admin@a.ae"):
    r = client.post("/api/staff/assignments", json={"lead_id": 1, "staff_email": "sp2@a.ae"})
    check("double-assign 409", r.status_code == 409, r.text[:160])
    check("close old 200", client.patch(
        "/api/staff/assignments/%d" % asg1, json={"status": "closed"}).status_code == 200)
    r = client.post("/api/staff/assignments", json={"lead_id": 1, "staff_email": "sp2@a.ae"})
    check("reassign 201", r.status_code == 201, r.text[:200])
    rows = sorted(client.get("/api/staff/assignments").json(),
                  key=lambda a: a["id"])
    check("history preserved (2 rows)",
          len(rows) == 2 and rows[0]["status"] == "closed" and rows[1]["status"] == "open",
          str([(a["id"], a["status"]) for a in rows]))

# 5. Visibility follows reassignment; lead + admin data preserved.
with as_user("sp1@a.ae"):
    check("sp1 loses lead", [l["id"] for l in client.get("/api/leads").json()["leads"]] == [], "sp1 still sees lead")
with as_user("sp2@a.ae"):
    check("sp2 gains lead", [l["id"] for l in client.get("/api/leads").json()["leads"]] == [1], "sp2 missing lead")
# 6. My Work consistency: ex-assignee sees active work only; history stays
# for managers; closed rows are read-only for salespeople.
with as_user("sp1@a.ae"):
    check("sp1 assignments empty after loss",
          client.get("/api/staff/assignments").json() == [], "sp1 still sees rows")
    check("sp1 followups empty after loss",
          client.get("/api/staff/followups").json() == [], "sp1 still sees notes")
    check("sp1 viewings empty after loss",
          client.get("/api/staff/viewings").json() == [], "sp1 still sees viewings")
    check("sp1 cannot reopen closed row", client.patch(
        "/api/staff/assignments/%d" % asg1, json={"status": "open"}).status_code == 403)
    check("sp1 cannot note lost lead", client.post(
        "/api/staff/followups", json={"lead_id": 1, "note": "x"}).status_code == 403)
    check("sp1 cannot view lost lead", client.post(
        "/api/staff/viewings", json={"lead_id": 1, "property_ref": "LYK-1",
                                     "scheduled_at": "2030-01-01T10:00:00"}).status_code == 403)
with as_user("sp2@a.ae"):
    mine = client.get("/api/staff/assignments").json()
    check("sp2 sees open row",
          len(mine) == 1 and mine[0]["status"] == "open"
          and mine[0]["staff_email"] == "sp2@a.ae", str(mine))
with as_user("admin@a.ae"):
    rows = client.get("/api/staff/assignments").json()
    check("admin sees full history",
          len(rows) == 2 and {a["status"] for a in rows} == {"open", "closed"},
          str([(a["id"], a["status"]) for a in rows]))

d = SessionLocal()
lead = d.query(Lead).filter(Lead.id == 1).first()
check("lead record intact",
      lead.customer_name == "C1" and lead.location == "Dubai Marina" and lead.status == "new",
      "%s %s %s" % (lead.customer_name, lead.location, lead.status))
check("admin intact",
      d.query(StaffUser).filter(StaffUser.email == "admin@a.ae").first().role == "admin")
check("assignment rows reference real leads",
      all(a.lead_id in (1, 2) for a in d.query(Assignment).all()))
d.close()

print("PASSED %d checks" % len(passed))
