import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Lead-listing regression tests: listing, search filtering (incl. NULL
fields), pagination, and role-based visibility. Isolated temp DB.
Run: python test_lead_list.py
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
    StaffUser(email="admin@l.ae", name="AD", role="admin", is_active=True),
    StaffUser(email="sm@l.ae", name="SM", role="sales_manager", is_active=True),
    StaffUser(email="sp1@l.ae", name="S1", role="salesperson", is_active=True,
              manager_email="sm@l.ae"),
    StaffUser(email="spout@l.ae", name="SO", role="salesperson", is_active=True),
    Lead(raw_enquiry_text="t1", customer_name="Ahmed Al-Rashid",
         contact_email="ahmed@gmail.com", location="Dubai Marina",
         status="new", priority_label="High"),
    Lead(raw_enquiry_text="t2", customer_name=None, contact_email=None,
         location="Business Bay", status="contacted", priority_label="Medium"),
    Lead(raw_enquiry_text="t3", customer_name="Sarah Johnson",
         contact_email="sarah.j@email.com", location="JVC",
         status="qualified", priority_label="Low"),
])
db.commit()
db.add(Assignment(lead_id=1, staff_email="sp1@l.ae", assigned_by="admin@l.ae", status="open"))
db.add(Assignment(lead_id=2, staff_email="spout@l.ae", assigned_by="admin@l.ae", status="closed"))
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


with as_user("admin@l.ae"):
    r = client.get("/api/leads").json()
    check("admin sees all 3", r["total"] == 3 and len(r["leads"]) == 3, str(r["total"]))
    # Search matches name, email, location; case-insensitive; NULL-safe.
    check("search name", client.get("/api/leads", params={"search": "ahmed"}).json()["total"] == 1)
    check("search email", client.get("/api/leads", params={"search": "SARAH.J@EMAIL"}).json()["total"] == 1)
    check("search location", client.get("/api/leads", params={"search": "marina"}).json()["total"] == 1)
    check("search matches null-name row by location",
          [l["id"] for l in client.get("/api/leads", params={"search": "business"}).json()["leads"]] == [2])
    # The reported case: non-matching term -> honest zero, data intact.
    r = client.get("/api/leads", params={"search": "ruth"}).json()
    check("no-match total 0", r["total"] == 0 and r["leads"] == [], str(r))
    check("data intact after no-match", client.get("/api/leads").json()["total"] == 3)
    # Combined filters + pagination.
    check("search+status",
          client.get("/api/leads", params={"search": "a", "status": "new"}).json()["total"] == 1)
    r = client.get("/api/leads", params={"page": 1, "per_page": 2}).json()
    check("pagination p1", r["total"] == 3 and len(r["leads"]) == 2, str(r))
    r = client.get("/api/leads", params={"page": 2, "per_page": 2}).json()
    check("pagination p2", r["total"] == 3 and len(r["leads"]) == 1, str(r))

with as_user("sp1@l.ae"):
    ids = [l["id"] for l in client.get("/api/leads").json()["leads"]]
    check("sp sees open-assigned only", ids == [1], str(ids))
    check("sp search respects scope",
          client.get("/api/leads", params={"search": "sarah"}).json()["total"] == 0)
with as_user("spout@l.ae"):
    check("closed-only sp sees none", client.get("/api/leads").json()["total"] == 0)
with as_user("sm@l.ae"):
    check("sm sees team lead", [l["id"] for l in client.get("/api/leads").json()["leads"]] == [1])
with as_user("cust@gmail.com"):
    check("customer list 403", client.get("/api/leads").status_code == 403)
check("anonymous list 401", client.get("/api/leads").status_code == 401)

print("PASSED %d checks" % len(passed))
