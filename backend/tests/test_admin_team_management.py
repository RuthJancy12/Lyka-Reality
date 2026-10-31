import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Admin Team Management & Role Governance Tests.

Tests:
1. Admin can list all staff with total count.
2. Admin can search staff by name, email, department, or designation via query param.
3. Admin can add a new employee (name, email, role, department, designation, reports to manager, password).
4. Admin can edit employee details (name, department, designation, manager_email, role).
5. Admin can deactivate and reactivate employee login access.
6. Deactivating the only active Admin is blocked (409 Conflict).
7. Non-admin roles (sales_agent) cannot list or manage staff (403 Forbidden).
8. Enforces role restrictions (cannot create second active admin, preserves role integrity).
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
db.add(StaffUser(
    email="admin@lyka.ae",
    name="System Administrator",
    role="admin",
    is_active=True,
    department="Executive Leadership",
    designation="Managing Director",
    firebase_uid="UID-ADMIN-1"
))
db.add(StaffUser(
    email="agent1@lyka.ae",
    name="Tariq Mansoor",
    role="sales_agent",
    is_active=True,
    department="Sales",
    designation="Luxury Property Consultant",
    manager_email="admin@lyka.ae",
    firebase_uid="UID-AGENT-1"
))
db.commit()
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, f"FAIL: {name} {extra}"
    passed.append(name)
    print("ok:", name)


def as_user(email, uid=None):
    return patch.object(roles, "verify_bearer_token",
                        return_value={"uid": uid or ("u-" + email), "email": email})


def test_admin_list_staff():
    with as_user("admin@lyka.ae", "UID-ADMIN-1"):
        res = client.get("/api/staff", headers={"Authorization": "Bearer fake"})
        check("admin_can_list_staff", res.status_code == 200, res.text)
        data = res.json()
        check("admin_sees_all_staff", len(data) >= 2)
        admin_entry = next((s for s in data if s["email"] == "admin@lyka.ae"), None)
        check("staff_has_department_and_designation",
              admin_entry is not None and admin_entry.get("department") == "Executive Leadership")


def test_admin_search_staff():
    with as_user("admin@lyka.ae", "UID-ADMIN-1"):
        # Search by name
        res = client.get("/api/staff?q=Tariq", headers={"Authorization": "Bearer fake"})
        check("search_by_name", res.status_code == 200 and len(res.json()) == 1)
        check("search_by_name_match", res.json()[0]["email"] == "agent1@lyka.ae")

        # Search by department
        res_dept = client.get("/api/staff?q=Executive", headers={"Authorization": "Bearer fake"})
        check("search_by_department", res_dept.status_code == 200 and len(res_dept.json()) == 1)
        check("search_by_dept_match", res_dept.json()[0]["email"] == "admin@lyka.ae")

        # Search by designation
        res_desig = client.get("/api/staff?q=Luxury Property", headers={"Authorization": "Bearer fake"})
        check("search_by_designation", res_desig.status_code == 200 and len(res_desig.json()) == 1)


def test_admin_create_staff():
    with as_user("admin@lyka.ae", "UID-ADMIN-1"):
        with patch("app.routers.staff._ensure_admin", return_value=False):
            payload = {
                "email": "hrms@lyka.ae",
                "name": "Sarah Jenkins",
                "role": "hrms_admin",
                "department": "Human Resources",
                "designation": "HR Director",
                "manager_email": "admin@lyka.ae",
                "password": "initialPassword123"
            }
            res = client.post("/api/staff", json=payload, headers={"Authorization": "Bearer fake"})
            check("admin_can_create_hrms_staff", res.status_code == 201, res.text)
            created = res.json()
            check("created_staff_email", created["email"] == "hrms@lyka.ae")
            check("created_staff_department", created["department"] == "Human Resources")
            check("created_staff_designation", created["designation"] == "HR Director")
            check("created_staff_manager", created["manager_email"] == "admin@lyka.ae")


def test_admin_update_staff_details():
    with as_user("admin@lyka.ae", "UID-ADMIN-1"):
        # Get Tariq's ID
        list_res = client.get("/api/staff?q=Tariq", headers={"Authorization": "Bearer fake"})
        tariq_id = list_res.json()[0]["id"]

        # Update details
        update_payload = {
            "name": "Tariq Mansoor Al-Ketbi",
            "department": "Ultra-Luxury Villas",
            "designation": "Senior Partner",
            "manager_email": "hrms@lyka.ae"
        }
        res = client.patch(f"/api/staff/{tariq_id}", json=update_payload, headers={"Authorization": "Bearer fake"})
        check("admin_can_update_staff", res.status_code == 200, res.text)
        updated = res.json()
        check("updated_name", updated["name"] == "Tariq Mansoor Al-Ketbi")
        check("updated_department", updated["department"] == "Ultra-Luxury Villas")
        check("updated_designation", updated["designation"] == "Senior Partner")
        check("updated_manager", updated["manager_email"] == "hrms@lyka.ae")


def test_admin_activate_deactivate():
    with as_user("admin@lyka.ae", "UID-ADMIN-1"):
        list_res = client.get("/api/staff?q=Tariq", headers={"Authorization": "Bearer fake"})
        tariq_id = list_res.json()[0]["id"]

        # Deactivate
        res_deact = client.patch(f"/api/staff/{tariq_id}", json={"is_active": False}, headers={"Authorization": "Bearer fake"})
        check("deactivate_staff_success", res_deact.status_code == 200)
        check("deactivated_is_inactive", res_deact.json()["is_active"] is False)

        # Deactivated staff excluded from default list
        res_active_only = client.get("/api/staff", headers={"Authorization": "Bearer fake"})
        check("deactivated_excluded_from_active_list", not any(s["id"] == tariq_id for s in res_active_only.json()))

        # Included when include_inactive=true
        res_with_inactive = client.get("/api/staff?include_inactive=true", headers={"Authorization": "Bearer fake"})
        check("deactivated_included_with_flag", any(s["id"] == tariq_id for s in res_with_inactive.json()))

        # Reactivate
        res_react = client.patch(f"/api/staff/{tariq_id}", json={"is_active": True}, headers={"Authorization": "Bearer fake"})
        check("reactivate_staff_success", res_react.status_code == 200 and res_react.json()["is_active"] is True)


def test_cannot_deactivate_only_admin():
    with as_user("admin@lyka.ae", "UID-ADMIN-1"):
        list_res = client.get("/api/staff?q=admin@lyka.ae", headers={"Authorization": "Bearer fake"})
        admin_id = list_res.json()[0]["id"]

        res = client.patch(f"/api/staff/{admin_id}", json={"is_active": False}, headers={"Authorization": "Bearer fake"})
        check("deactivate_sole_admin_rejected_409", res.status_code == 409, res.text)


def test_sales_agent_forbidden():
    with as_user("agent1@lyka.ae", "UID-AGENT-1"):
        res_get = client.get("/api/staff", headers={"Authorization": "Bearer fake"})
        check("sales_agent_cannot_list_staff_403", res_get.status_code == 403)

        res_post = client.post("/api/staff", json={"email": "x@lyka.ae", "name": "X", "role": "sales_agent"}, headers={"Authorization": "Bearer fake"})
        check("sales_agent_cannot_create_staff_403", res_post.status_code == 403)


def test_forbid_second_admin():
    with as_user("admin@lyka.ae", "UID-ADMIN-1"):
        payload = {
            "email": "admin2@lyka.ae",
            "name": "Second Admin",
            "role": "admin",
            "password": "password123"
        }
        res = client.post("/api/staff", json=payload, headers={"Authorization": "Bearer fake"})
        check("forbid_second_admin_409", res.status_code == 409, res.text)


if __name__ == "__main__":
    test_admin_list_staff()
    test_admin_search_staff()
    test_admin_create_staff()
    test_admin_update_staff_details()
    test_admin_activate_deactivate()
    test_cannot_deactivate_only_admin()
    test_sales_agent_forbidden()
    test_forbid_second_admin()
    print(f"\nALL {len(passed)} ADMIN TEAM MANAGEMENT TESTS PASSED!")
