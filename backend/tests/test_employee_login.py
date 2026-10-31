import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Employee-login backend regression test (isolated temp DB).

The dedicated employee portal authenticates with Firebase and then trusts
ONLY GET /api/staff/me (verified token -> staff_users row). This guards:
  1. Anonymous /me -> 401; verified customer (no staff row) -> 403.
  2. Staff /me -> 200 with the DATABASE role (never a client-supplied one):
     extra query params or JSON fields claiming another role are ignored.
  3. Inactive staff rows resolve to customer -> 403.
  4. UID binding happens on first verified sign-in without touching other
     rows; existing leads/records stay intact (account compatibility).

Run: python test_employee_login.py
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
db.add(StaffUser(email="sp@t.ae", name="SP", role="salesperson", is_active=True,
                 manager_email="sm@t.ae"))
db.add(StaffUser(email="old@t.ae", name="OLD", role="manager", is_active=False))
db.add(Lead(raw_enquiry_text="seed lead long enough for validation",
            contact_email="s@x.ae"))
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


# ── 1. Gates ─────────────────────────────────────────────────────────────
check("anon /me 401", client.get("/api/staff/me").status_code == 401)
with as_user("uid-cust-9", "buyer@gmail.com"):
    r = client.get("/api/staff/me")
check("customer /me 403", r.status_code == 403, r.text[:160])
with as_user("uid-old-1", "old@t.ae"):
    check("inactive staff /me 403",
          client.get("/api/staff/me").status_code == 403)

# ── 2. Verified role comes from the DB row ────────────────────────────────
with as_user("uid-sp-1", "sp@t.ae"):
    r = client.get("/api/staff/me")
check("salesperson /me 200", r.status_code == 200, r.text[:200])
check("role is salesperson", r.json().get("role") == "salesperson",
      str(r.json().get("role")))
with as_user("uid-admin-9", "admin@t.ae"):
    r = client.get("/api/staff/me")
check("admin /me 200 + role admin",
      r.status_code == 200 and r.json().get("role") == "admin",
      r.text[:200])

# ── 3. Client-supplied roles never grant ──────────────────────────────────
with as_user("uid-sp-1", "sp@t.ae"):
    r = client.get("/api/staff/me", params={"role": "admin"})
check("query role ignored",
      r.status_code == 200 and r.json().get("role") == "salesperson",
      str(r.json().get("role")))
with as_user("uid-cust-9", "buyer@gmail.com"):
    r = client.get("/api/staff/me", params={"role": "admin"})
check("customer cannot self-promote via params", r.status_code == 403)

# ── 4. No secrets in the response ─────────────────────────────────────────
with as_user("uid-admin-9", "admin@t.ae"):
    body = client.get("/api/staff/me").json()
check("no secret fields",
      not any(k in body for k in ("password", "token", "secret", "api_key")),
      str(sorted(body.keys())))

# ── 5. UID binding + compatibility ────────────────────────────────────────
db = SessionLocal()
sp = db.query(StaffUser).filter(StaffUser.email == "sp@t.ae").first()
check("uid bound on first sign-in",
      sp is not None and sp.firebase_uid == "uid-sp-1",
      str(getattr(sp, "firebase_uid", None)))
check("other rows untouched",
      db.query(StaffUser).filter(StaffUser.email == "admin@t.ae").first().firebase_uid in (None, "uid-admin-9"))
check("seed lead intact", db.query(Lead).count() == 1)
check("staff count intact", db.query(StaffUser).count() == 3)
db.close()

# Same UID, changed email still resolves via UID (no duplicate, no loss).
with as_user("uid-sp-1", "sp-new@t.ae"):
    r = client.get("/api/staff/me")
check("uid-first survives email change",
      r.status_code == 200 and r.json().get("role") == "salesperson",
      r.text[:200])

print("PASSED %d checks" % len(passed))
