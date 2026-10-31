import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Public enquiry regression test (isolated temp DB).

Verifies the customer-facing flow: POST /api/leads/public (anonymous) saves
a Lead in the SAME `leads` table used by the CRM, and the new row is
immediately visible via the Admin Leads API (GET /api/leads + GET
/api/leads/{id}). Also guards validation, duplicate prevention, and that
staff auth gates are unchanged.

Run: python test_public_enquiry.py
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
from app.models import Lead, StaffUser  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="admin@t.ae", name="AD", role="admin", is_active=True))
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


ENQUIRY = {
    "customer_name": "Elena Rostova",
    "contact_email": "elena.public@t.ae",
    "contact_phone": "+971 50 000 0001",
    "property_ref": "LYK-00042",
    "property_title": "Marina Gate 2BR Sea View",
    "location": "Dubai Marina",
    "lead_type": "buyer",
    "property_type": "Apartment",
    "preferred_date": "2026-10-20",
}

# 1. Anonymous public submission succeeds (no token required).
r = client.post("/api/leads/public", json=ENQUIRY)
check("public anonymous 201", r.status_code == 201, r.text[:400])
lead_id = r.json()["id"]
check("public status received", r.json()["status"] == "received", str(r.json().get("status")))
check("public response is minimal", set(r.json().keys()) == {"id", "status"}, str(sorted(r.json().keys())))
check("public response hides PII",
      all(k not in r.json() for k in (
          "customer_name", "contact_email", "contact_phone", "raw_enquiry_text",
          "agent_notes", "priority_score", "recommendations", "activities",
      )), str(sorted(r.json().keys())))

# 2. Row lives in the same `leads` table (direct DB read).
db = SessionLocal()
row = db.query(Lead).filter(Lead.id == lead_id).first()
check("same leads table", row is not None and row.contact_email == "elena.public@t.ae")
check("raw text has property context",
      "LYK-00042" in (row.raw_enquiry_text or ""), (row.raw_enquiry_text or "")[:200])
db.close()

# 3. Admin Leads API returns the new lead immediately (no filter/permission bug).
with as_user("admin@t.ae"):
    ids = [l["id"] for l in client.get("/api/leads").json()["leads"]]
    check("admin list contains public lead", lead_id in ids, str(ids))
    r1 = client.get(f"/api/leads/{lead_id}")
    check("admin detail 200", r1.status_code == 200, str(r1.status_code))

# 4. Validation: bad email / missing name -> 422, nothing saved.
with as_user("admin@t.ae"):
    before = client.get("/api/leads").json()["total"]
bad = dict(ENQUIRY, contact_email="not-an-email")
check("invalid email 422", client.post("/api/leads/public", json=bad).status_code == 422)
bad2 = dict(ENQUIRY, customer_name="")
check("empty name 422", client.post("/api/leads/public", json=bad2).status_code == 422)
with as_user("admin@t.ae"):
    check("no rows on 422", client.get("/api/leads").json()["total"] == before)

# 5. Duplicate prevention: same email within 24h -> 409, no duplicate row.
r = client.post("/api/leads/public", json=ENQUIRY)
check("duplicate 409", r.status_code == 409, r.text[:200])
duplicate_detail = r.json().get("detail", "")
check("duplicate 409 hides email and lead id",
      "elena.public@" not in duplicate_detail and str(lead_id) not in duplicate_detail,
      duplicate_detail)
with as_user("admin@t.ae"):
    check("no duplicate row", client.get("/api/leads").json()["total"] == before)

# 6. Existing gates preserved: staff create still needs auth; list stays guarded.
check("staff create anonymous 401", client.post("/api/leads", json={
    "raw_enquiry_text": "long enough enquiry text here"}).status_code == 401)
check("anonymous list 401", client.get("/api/leads").status_code == 401)
with as_user("buyer@gmail.com"):
    check("customer list 403", client.get("/api/leads").status_code == 403)

print("PASSED %d checks" % len(passed))
