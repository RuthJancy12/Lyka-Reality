import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Customer profile API tests (isolated temp DB).

Covers UID ownership and trusted roles (verified tokens are SIMULATED by
patching verify_bearer_token in app.services.roles):
  1. Anonymous GET/PUT -> 401.
  2. Verified non-staff customer auto-resolves role "customer"; GET with
     no row returns {profile: null, role}.
  3. PUT creates exactly one row bound to the TOKEN uid (email copied
     from claims, never the body); preferences + attribution persist.
  4. Second account cannot read the first account's row (no id parameter
     exists to even address it); its own GET is null.
  5. Updates overwrite permitted fields but keep first-touch attribution.
  6. Validation rejects blank names / overlong phone.
  7. Staff identity resolves its staff role (read-only, never granted).
  8. Existing tables/rows untouched (migration-compatible).

Run: python test_customer_profile.py
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
from app.models import CustomerProfile, Lead, StaffUser  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="admin@t.ae", name="AD", role="admin", is_active=True,
                 firebase_uid="uid-admin-1"))
db.add(Lead(raw_enquiry_text="seed lead long enough", contact_email="s@x.ae"))
db.commit()
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


def as_user(uid, email):
    return patch.object(roles, "verify_bearer_token",
                        return_value={"uid": uid, "email": email})


PAYLOAD = {
    "name": "Sara Ahmed",
    "phone": "+971 50 000 0000",
    "city": "Dubai Marina",
    "preferences": {"locations": ["Dubai Marina"], "propertyType": "Apartment",
                    "bedrooms": 2, "budgetMin": None, "budgetMax": 2000000,
                    "purpose": "Buy"},
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "marina-launch",
    "referrer": "https://www.google.com/",
}

# ── 1. Anonymous rejected ──────────────────────────────────────────────────
check("anon GET 401", client.get("/api/customer/profile").status_code == 401)
check("anon PUT 401",
      client.put("/api/customer/profile", json=PAYLOAD).status_code == 401)

# ── 2. Fresh customer: null profile, trusted customer role ─────────────────
with as_user("uid-cust-1", "sara@x.co"):
    r = client.get("/api/customer/profile")
    check("customer GET 200", r.status_code == 200, r.text[:200])
    check("new customer profile null + role customer",
          r.json() == {"profile": None, "role": "customer"}, str(r.json()))

# ── 3. Create binds token UID, email from claims ───────────────────────────
    r = client.put("/api/customer/profile", json=PAYLOAD)
    check("PUT 200", r.status_code == 200, r.text[:300])
    body = r.json()
    check("role still customer", body["role"] == "customer", str(body["role"]))
    p = body["profile"]
    check("uid + email from token",
          p["firebase_uid"] == "uid-cust-1" and p["email"] == "sara@x.co",
          str({k: p.get(k) for k in ("firebase_uid", "email")}))
    check("fields + prefs + source stored",
          p["name"] == "Sara Ahmed" and p["city"] == "Dubai Marina"
          and p["preferences"]["bedrooms"] == 2
          and (p["utm_source"], p["utm_campaign"]) == ("google", "marina-launch"),
          str(p))

# ── 4. Cross-account isolation ─────────────────────────────────────────────
with as_user("uid-cust-2", "bob@x.co"):
    r = client.get("/api/customer/profile")
    check("second account sees null (no leak)", r.json()["profile"] is None,
          str(r.json()))
    db = SessionLocal()
    check("exactly one profile row exists",
          db.query(CustomerProfile).count() == 1)
    db.close()

# ── 5. Update keeps first-touch attribution, changes permitted fields ──────
with as_user("uid-cust-1", "sara-new@x.co"):
    r = client.put("/api/customer/profile", json={
        **PAYLOAD, "name": "Sara K", "city": "JVC",
        "utm_source": "instagram", "referrer": "https://instagram.com/",
    })
    check("update 200", r.status_code == 200, r.text[:200])
    p = r.json()["profile"]
    check("permitted fields updated",
          p["name"] == "Sara K" and p["city"] == "JVC", str(p))
    check("email follows verified token", p["email"] == "sara-new@x.co")
    check("first-touch source kept",
          (p["utm_source"], p["referrer"]) ==
          ("google", "https://www.google.com/"), str(p))

# ── 6. Validation ──────────────────────────────────────────────────────────
with as_user("uid-cust-1", "sara@x.co"):
    check("blank name 422",
          client.put("/api/customer/profile",
                     json={**PAYLOAD, "name": "  "}).status_code == 422)
    check("long phone 422",
          client.put("/api/customer/profile",
                     json={**PAYLOAD, "phone": "1" * 60}).status_code == 422)

# ── 7. Staff identity resolves staff role (never granted) ──────────────────
with as_user("uid-admin-1", "admin@t.ae"):
    r = client.get("/api/customer/profile")
    check("staff role resolved read-only",
          r.status_code == 200 and r.json()["role"] == "admin"
          and r.json()["profile"] is None, str(r.json()))

# ── 8. Existing records intact ─────────────────────────────────────────────
db = SessionLocal()
check("seed lead intact", db.query(Lead).count() == 1)
check("staff row intact",
      db.query(StaffUser).filter(StaffUser.email == "admin@t.ae").count() == 1)
db.close()

print("PASSED %d checks" % len(passed))
