import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Role-based access tests: default customer, no self-elevation, team scoping,
UID identity, deactivation, ownership, migration safety. Isolated temp DB;
verified Firebase tokens are SIMULATED by patching verify_bearer_token in
app.services.roles (live Firebase credentials are not configured here).
Run: python test_roles_suite.py
"""
import os
import tempfile

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

from unittest.mock import patch  # noqa: E402

import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.models import Assignment, Lead, StaffUser  # noqa: E402

init_db()
db = SessionLocal()
db.add_all([
    StaffUser(email="admin@x.ae", name="AD", role="admin", is_active=True),
    StaffUser(email="mgr@x.ae", name="MG", role="manager", is_active=True),
    StaffUser(email="sm1@x.ae", name="SM1", role="sales_manager", is_active=True),
    StaffUser(email="sp1@x.ae", name="S1", role="salesperson", is_active=True,
              manager_email="sm1@x.ae"),
    StaffUser(email="sp3@x.ae", name="S3", role="salesperson", is_active=True,
              manager_email="other@x.ae"),
    StaffUser(email="off@x.ae", name="OFF", role="salesperson", is_active=False),
    Lead(raw_enquiry_text="Looking for a 2 bedroom apartment in Marina budget 1.5M call me.", contact_email="c1@x.ae"),
    Lead(raw_enquiry_text="Need a villa on Palm Jumeirah urgently cash buyer contact today.", contact_email="c2@x.ae"),
])
db.commit()
db.add_all([
    Assignment(lead_id=1, staff_email="sp1@x.ae", assigned_by="mgr@x.ae", status="open"),
    Assignment(lead_id=2, staff_email="sp3@x.ae", assigned_by="mgr@x.ae", status="open"),
])
db.commit()

from app.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


def as_user(email, uid=None):
    claims = {"uid": uid or ("u-" + email), "email": email}
    return patch.object(roles, "verify_bearer_token", return_value=claims)


# 1. Default customer: unknown verified email resolves to customer everywhere
with as_user("newcustomer@x.ae"):
    check("customer staff/me 403", client.get("/api/staff/me").status_code == 403)
    check("customer create staff 403", client.post(
        "/api/staff", json={"email": "z@x.ae", "name": "Z", "role": "salesperson"}).status_code == 403)
    check("customer self-promote via PATCH 403", client.patch(
        "/api/staff/4", json={"role": "admin"}).status_code == 403)

# 2. Invalid role rejected even by admin (422, never stored)
with as_user("admin@x.ae"):
    r = client.post("/api/staff", json={"email": "bad@x.ae", "name": "B", "role": "superadmin"})
    check("invalid role 422", r.status_code == 422, r.text[:100])

# 3. Deactivated staff resolve to customer (old session, same UID)
with as_user("off@x.ae", uid="u-off"):
    check("inactive staff/me 403", client.get("/api/staff/me").status_code == 403)
    check("inactive leads 403", client.get("/api/leads").status_code == 403)

# 4. UID-first identity + binding: staff row without UID binds on first login
with as_user("sp1@x.ae", uid="UID-SP1"):
    r = client.get("/api/staff/me")
    check("sp1 me 200", r.status_code == 200, r.text[:120])
db2 = SessionLocal()
bound = db2.query(StaffUser).filter(StaffUser.email == "sp1@x.ae").first()
check("UID bound on login", bound.firebase_uid == "UID-SP1", str(bound.firebase_uid))
db2.close()

# 5. Email change survival: same UID, new email still resolves via UID
with as_user("renamed@x.ae", uid="UID-SP1"):
    check("UID-first survives email change", client.get("/api/staff/me").status_code == 200)

# 6. Sales-manager team scoping (sm1's team = sp1 only)
with as_user("sm1@x.ae"):
    staff = client.get("/api/staff").json()
    seen = sorted(s["email"] for s in staff)
    check("SM sees team+self only", seen == ["sm1@x.ae", "sp1@x.ae"], str(seen))
    leads = client.get("/api/leads").json()["leads"]
    check("SM sees team leads only", [l["id"] for l in leads] == [1], str(leads))
    check("SM lead2 outside team 403", client.get("/api/leads/2").status_code == 403)
    r = client.post("/api/staff/assignments", json={"lead_id": 2, "staff_email": "sp3@x.ae"})
    check("SM assign outside team 403", r.status_code == 403, r.text[:120])

# 7. Manager unrestricted + salesperson isolation intact
with as_user("mgr@x.ae"):
    check("manager sees all leads", len(client.get("/api/leads").json()["leads"]) == 2)
    check("manager sees all staff", len(client.get("/api/staff").json()) >= 5)
with as_user("sp1@x.ae", uid="UID-SP1"):
    check("sp1 sees own lead", [l["id"] for l in client.get("/api/leads").json()["leads"]] == [1])
    check("sp1 cross-team lead 403", client.get("/api/leads/2").status_code == 403)

# 8. Assignment snapshots the assignee UID
with as_user("mgr@x.ae"):
    r = client.post("/api/staff/assignments", json={"lead_id": 2, "staff_email": "sp1@x.ae"})
    check("reassign closed? 409 expected (open exists)",
          r.status_code == 409, r.text[:120])

# 9. Migration safety: simulate a pre-upgrade DB (no new cols/indexes),
# re-run init_db, columns re-added and rows preserved.
from sqlalchemy import text as _text  # noqa: E402
db3 = SessionLocal()
db3.execute(_text("DROP INDEX IF EXISTS ix_staff_users_firebase_uid"))
db3.execute(_text("DROP INDEX IF EXISTS ix_staff_users_manager_email"))
db3.execute(_text("ALTER TABLE staff_users DROP COLUMN firebase_uid"))
db3.execute(_text("ALTER TABLE staff_users DROP COLUMN manager_email"))
db3.commit()
init_db()
cols = [r[1] for r in db3.execute(_text("PRAGMA table_info(staff_users)"))]
check("migration re-adds columns", "firebase_uid" in cols and "manager_email" in cols, str(cols))
check("migration preserves rows", db3.query(StaffUser).count() == 6)
sp1 = db3.query(StaffUser).filter(StaffUser.email == "sp1@x.ae").first()
check("migration preserves existing values", sp1.role == "salesperson" and sp1.name == "S1")
check("new columns default to NULL", sp1.manager_email is None and sp1.firebase_uid is None)
db3.close()

db.close()
print("PASSED %d checks" % len(passed))
