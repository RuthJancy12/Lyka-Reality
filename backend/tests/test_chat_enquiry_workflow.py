import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Chat-enquiry workflow regression test (isolated temp DB).

Covers the chatbot/website customer flow end to end:
  1. Anonymous chat-shaped public enquiry persists with contact +
     property context, honest score from saved fields, and appears in
     the Admin Leads list (assignment/access rules unchanged).
  2. Accidental double-submit (same email + same property, 24h) -> 409.
  3. Legitimate separate enquiry (same email, different property) -> 201.
  4. Missing info stays missing (budget/bedrooms/timeline None, never
     invented).
  5. Deterministic dataset filtering for "2 BHK apartment in Dubai
     Marina under AED 2 million" returns only real matching rows
     (Marina + Apartment + 2 beds + Sale + <= 2M) — nothing invented.
  6. /api/chat stays anonymous-friendly (never 401 for guests).

Run: python test_chat_enquiry_workflow.py
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
from app.services.property_service import search_properties_dataset  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="admin@t.ae", name="AD", role="admin", is_active=True))
db.add(StaffUser(email="mgr@t.ae", name="MG", role="manager", is_active=True))
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


CHAT_ENQUIRY = {
    "customer_name": "Sara Ahmed",
    "contact_email": "sara.chat@t.ae",
    "contact_phone": "+971 50 000 0099",
    "property_ref": "LYK-00002",
    "property_title": "Marina 2BHK Sea View",
    "location": "Dubai Marina",
    "lead_type": "buyer",
    "property_type": "Apartment",
    "message": "Chatbot enquiry from session session-abc123",
}

# 1. Anonymous save succeeds with honest score + CRM visibility.
r = client.post("/api/leads/public", json=CHAT_ENQUIRY)
check("chat enquiry anonymous 201", r.status_code == 201, r.text[:300])
body = r.json()
lead_id = body["id"]
check("public response minimal", set(body) == {"id", "status"},
      str(sorted(body.keys())))
with as_user("admin@t.ae"):
    ids = [l["id"] for l in client.get("/api/leads").json()["leads"]]
    check("admin sees chat enquiry", lead_id in ids, str(ids))
    detail = client.get(f"/api/leads/{lead_id}").json()
    check("chat score from saved fields",
          detail["priority_score"] == 50 and detail["priority_label"] == "Medium",
          str((detail["priority_score"], detail["priority_label"])))
    check("chat missing stays missing",
          detail["missing_fields"] == ["bedrooms", "budget_max", "timeline_days"]
          and detail["bedrooms"] is None and detail["budget_max"] is None
          and detail["timeline_days"] is None, str(detail["missing_fields"]))
with as_user("mgr@t.ae"):
    ids = [l["id"] for l in client.get("/api/leads").json()["leads"]]
    check("manager sees chat enquiry", lead_id in ids, str(ids))

# 2. Accidental double-submit blocked.
r = client.post("/api/leads/public", json=CHAT_ENQUIRY)
check("same property retry 409", r.status_code == 409, r.text[:200])
with as_user("admin@t.ae"):
    total = client.get("/api/leads").json()["total"]
    check("no duplicate row on retry", total == 1, str(total))

# 3. Legitimate separate enquiry allowed.
other = dict(CHAT_ENQUIRY, property_ref="LYK-00015",
             property_title="Downtown 1BHK Fountain View")
r = client.post("/api/leads/public", json=other)
check("different property 201", r.status_code == 201, r.text[:300])
other_id = r.json()["id"]
check("separate lead id", other_id != lead_id, str((lead_id, other_id)))
with as_user("admin@t.ae"):
    check("admin sees both", client.get("/api/leads").json()["total"] == 2)

# 4. Deterministic real-dataset filtering (no invented listings).
res = search_properties_dataset(
    location="Dubai Marina", property_type="Apartment", bedrooms=2,
    max_budget_aed=2000000, purpose="Sale", limit=50,
)
rows = res["top_properties"]
check("filter returns rows", len(rows) > 0, "no Marina 2BHK under 2M in dataset")
bad = [p for p in rows if not (
    "marina" in (p.get("location") or "").lower()
    and (p.get("property_type") or "").lower() == "apartment"
    and p.get("bhk") == 2
    and (p.get("listing_type") or "").lower() == "sale"
    and (p.get("price_aed") or 0) <= 2000000
)]
check("all rows truly match filters", bad == [], str(bad[:2]))

# 5. Chat stays guest-friendly (never a 401 for anonymous users).
r = client.post("/api/chat", json={"message": "Hi", "session_id": "t-anon"})
check("chat anonymous not 401", r.status_code != 401, str(r.status_code))

print("PASSED %d checks" % len(passed))
