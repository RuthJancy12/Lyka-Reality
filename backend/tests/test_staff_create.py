import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Staff-creation regression tests (isolated temp DB).

Covers the complete staff invitation & backend user creation flow:
- Validation of required fields, email format, and supported roles.
- Admin-only enforcement (customers & managers rejected with 403).
- Single-admin invariant preserved (409 on second admin).
- Safe duplicate handling (409 on existing staff email).
- Firebase Auth user creation and custom role claims assignment.
- Linking of verified Firebase UID to the persisted database record.
- Generation of invitation/password-setup links when no password is provided.
- Direct password configuration when initial password is provided.
- Safe linking of existing Firebase accounts.
- Atomic rollback of newly created Firebase user on DB failure.
- Graceful error reporting when Firebase creation fails.
- Manager assignment, clearing, and deactivation handling.

Run: python test_staff_create.py
"""
import os
import tempfile
from unittest.mock import patch, MagicMock

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import StaffUser  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="admin@s.ae", name="AD", role="admin", is_active=True,
                 firebase_uid="UID-AD"))
db.add(StaffUser(email="mgr@s.ae", name="MG", role="manager", is_active=True))
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


def count_staff():
    d = SessionLocal()
    try:
        return d.query(StaffUser).count()
    finally:
        d.close()


BEFORE = count_staff()

# Mock Firebase Auth state
class MockFirebaseUser:
    def __init__(self, uid, email, display_name=""):
        self.uid = uid
        self.email = email
        self.display_name = display_name


mock_fb_users = {}
mock_custom_claims = {}
mock_reset_links = {}


def mock_get_user_by_email(email):
    import firebase_admin.auth as admin_auth
    if email in mock_fb_users:
        return mock_fb_users[email]
    raise admin_auth.UserNotFoundError(f"User {email} not found")


def mock_create_user(**kwargs):
    email = kwargs["email"]
    uid = kwargs.get("uid") or f"mock-uid-{email}"
    user = MockFirebaseUser(uid=uid, email=email, display_name=kwargs.get("display_name", ""))
    mock_fb_users[email] = user
    return user


def mock_delete_user(uid):
    to_delete = [email for email, u in mock_fb_users.items() if u.uid == uid]
    for email in to_delete:
        del mock_fb_users[email]


def mock_set_custom_user_claims(uid, claims):
    mock_custom_claims[uid] = claims


def mock_generate_password_reset_link(email):
    link = f"https://mock-firebase.app/__/auth/action?mode=resetPassword&email={email}"
    mock_reset_links[email] = link
    return link


def patch_firebase_auth():
    import firebase_admin.auth as admin_auth
    return (
        patch.object(admin_auth, "get_user_by_email", side_effect=mock_get_user_by_email),
        patch.object(admin_auth, "create_user", side_effect=mock_create_user),
        patch.object(admin_auth, "delete_user", side_effect=mock_delete_user),
        patch.object(admin_auth, "set_custom_user_claims", side_effect=mock_set_custom_user_claims),
        patch.object(admin_auth, "generate_password_reset_link", side_effect=mock_generate_password_reset_link),
    )


p_get, p_create, p_del, p_claims, p_link = patch_firebase_auth()
p_get.start()
p_create.start()
p_del.start()
p_claims.start()
p_link.start()

try:
    # 1. Bodies without a JSON object or malformed are rejected.
    with as_user("admin@s.ae", uid="UID-AD"):
        r = client.post("/api/staff", content="not json",
                        headers={"Content-Type": "text/plain"})
        check("non-object body 422", r.status_code == 422, str(r.status_code))
        r = client.post("/api/staff", content='{"email": "x@s.ae"')
        check("truncated body 422", r.status_code == 422, str(r.status_code))
        check("no rows created by bad bodies", count_staff() == BEFORE, str(count_staff()))

        # Field-level validation enforced.
        r = client.post("/api/staff", json={"email": "bad", "name": "B", "role": "salesperson"})
        check("bad email 422", r.status_code == 422, r.text[:120])
        r = client.post("/api/staff", json={"email": "ok@s.ae", "name": "", "role": "salesperson"})
        check("empty name 422", r.status_code == 422, r.text[:120])
        r = client.post("/api/staff", json={"email": "ok@s.ae", "name": "O", "role": "superadmin"})
        check("unknown role 422", r.status_code == 422, r.text[:120])
        r = client.post("/api/staff", json={"email": "ok@s.ae", "name": "O", "role": "salesperson", "password": "123"})
        check("short password 422", r.status_code == 422, r.text[:120])
        check("no rows created by invalid bodies", count_staff() == BEFORE, str(count_staff()))

    # 2. Successful creation (without password -> generates invitation link & binds Firebase UID).
    with as_user("admin@s.ae", uid="UID-AD"):
        r = client.post("/api/staff", json={
            "email": "sp1@s.ae", "name": "S1", "role": "salesperson",
            "manager_email": "mgr@s.ae",
        })
        check("create 201", r.status_code == 201, r.text[:200])
        body = r.json()
        check("exact role assigned", body["role"] == "salesperson", str(body))
        check("manager link stored", body["manager_email"] == "mgr@s.ae", str(body))
        check("active by default", body["is_active"] is True, str(body))
        check("firebase uid bound upon creation", body["firebase_uid"] == "mock-uid-sp1@s.ae", str(body))
        check("invitation link generated", "resetPassword" in (body.get("invitation_link") or ""), str(body))
        check("custom role claim set", mock_custom_claims.get("mock-uid-sp1@s.ae") == {"role": "salesperson"})
        sp1_id = body["id"]

        d = SessionLocal()
        admin = d.query(StaffUser).filter(StaffUser.email == "admin@s.ae").first()
        check("admin row preserved",
              admin.role == "admin" and admin.is_active is True
              and admin.firebase_uid == "UID-AD" and admin.name == "AD",
              "%s %s %s %s" % (admin.role, admin.is_active, admin.firebase_uid, admin.name))
        check("exactly one active admin",
              d.query(StaffUser).filter(StaffUser.role == "admin",
                                        StaffUser.is_active == True).count() == 1)  # noqa: E712
        sp1_db = d.query(StaffUser).filter(StaffUser.email == "sp1@s.ae").first()
        check("db record has linked firebase_uid", sp1_db.firebase_uid == "mock-uid-sp1@s.ae")
        d.close()

    # 3. Successful creation with initial password.
    with as_user("admin@s.ae", uid="UID-AD"):
        r = client.post("/api/staff", json={
            "email": "sp2@s.ae", "name": "S2", "role": "salesperson",
            "password": "SecretPassword123!",
        })
        check("create with password 201", r.status_code == 201, r.text[:200])
        body2 = r.json()
        check("firebase uid bound with password", body2["firebase_uid"] == "mock-uid-sp2@s.ae")
        check("no reset link generated when password provided", body2.get("invitation_link") is None)
        check("custom role claim set for sp2", mock_custom_claims.get("mock-uid-sp2@s.ae") == {"role": "salesperson"})

    # 4. Linking existing Firebase user account safely.
    mock_fb_users["existing@s.ae"] = MockFirebaseUser("existing-fb-uid", "existing@s.ae", "Existing User")
    with as_user("admin@s.ae", uid="UID-AD"):
        r = client.post("/api/staff", json={
            "email": "existing@s.ae", "name": "Existing User", "role": "manager",
        })
        check("existing user link 201", r.status_code == 201, r.text[:200])
        body_existing = r.json()
        check("existing uid linked", body_existing["firebase_uid"] == "existing-fb-uid")
        check("existing user role claim updated", mock_custom_claims.get("existing-fb-uid") == {"role": "manager"})

    # 5. Second admin blocked; duplicate email blocked (case-insensitive).
    with as_user("admin@s.ae", uid="UID-AD"):
        r = client.post("/api/staff", json={"email": "a2@s.ae", "name": "A2", "role": "admin"})
        check("second admin 409", r.status_code == 409, r.text[:120])
        r = client.post("/api/staff", json={"email": "sp1@s.ae", "name": "Dup", "role": "salesperson"})
        check("duplicate email 409", r.status_code == 409, r.text[:120])
        r = client.post("/api/staff", json={"email": "SP1@S.AE", "name": "DupUpper", "role": "salesperson"})
        check("case-insensitive duplicate email 409", r.status_code == 409, r.text[:120])

    # 6. Non-admins cannot grant roles (unauthorized customer & manager denied with 403).
    with as_user("mgr@s.ae"):
        r = client.post("/api/staff", json={"email": "x@s.ae", "name": "X", "role": "salesperson"})
        check("manager create 403", r.status_code == 403, str(r.status_code))
    with as_user("customer@gmail.com"):
        r = client.post("/api/staff", json={"email": "me@gmail.com", "name": "Me", "role": "admin"})
        check("customer create 403", r.status_code == 403, str(r.status_code))
    with as_user("sp1@s.ae"):
        r = client.post("/api/staff", json={"email": "y@s.ae", "name": "Y", "role": "salesperson"})
        check("salesperson create 403", r.status_code == 403, str(r.status_code))

    # 7. Firebase user creation failure is reported cleanly with HTTP 400.
    def mock_create_user_error(**kwargs):
        raise ValueError("Firebase: Password does not meet complexity requirements.")

    with patch("firebase_admin.auth.create_user", side_effect=mock_create_user_error):
        with as_user("admin@s.ae", uid="UID-AD"):
            staff_before = count_staff()
            r = client.post("/api/staff", json={"email": "fail@s.ae", "name": "Fail", "role": "salesperson"})
            check("firebase error 400", r.status_code == 400, r.text[:150])
            check("no db row created on firebase failure", count_staff() == staff_before)

    # 8. Partial failure rollback: if DB commit fails, rollback deleted the newly created Firebase user.
    with patch("sqlalchemy.orm.Session.commit", side_effect=RuntimeError("Simulated DB Disk Failure")):
        with as_user("admin@s.ae", uid="UID-AD"):
            r = client.post("/api/staff", json={"email": "rollback@s.ae", "name": "Rollback", "role": "salesperson"})
            check("db error 500", r.status_code == 500, r.text[:150])
            check("firebase user rolled back from auth", "rollback@s.ae" not in mock_fb_users)

    # 9. Manager/reporting updates & deactivation handling.
    with as_user("admin@s.ae", uid="UID-AD"):
        r = client.patch("/api/staff/%d" % sp1_id, json={"manager_email": None})
        check("clear manager 200", r.status_code == 200 and r.json()["manager_email"] is None,
              r.text[:160])
        r = client.patch("/api/staff/%d" % sp1_id, json={"is_active": False})
        check("deactivate 200", r.status_code == 200 and r.json()["is_active"] is False,
              r.text[:160])
        d = SessionLocal()
        sp1 = d.query(StaffUser).filter(StaffUser.email == "sp1@s.ae").first()
        check("deactivation keeps identity",
              sp1.role == "salesperson" and sp1.name == "S1", "%s %s" % (sp1.role, sp1.name))
        d.close()
        r = client.patch("/api/staff/%d" % sp1_id, json={"is_active": True})
        check("reactivate 200", r.status_code == 200 and r.json()["is_active"] is True,
              r.text[:160])

        # Role change syncs custom claims
        r = client.patch("/api/staff/%d" % sp1_id, json={"role": "sales_manager"})
        check("role update 200", r.status_code == 200 and r.json()["role"] == "sales_manager")
        check("role update custom claims synced", mock_custom_claims.get("mock-uid-sp1@s.ae") == {"role": "sales_manager"})

finally:
    p_get.stop()
    p_create.stop()
    p_del.stop()
    p_claims.stop()
    p_link.stop()

print("PASSED %d checks" % len(passed))
