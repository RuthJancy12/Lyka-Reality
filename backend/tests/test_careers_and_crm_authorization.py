import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Targeted tests for:
1. Admin-only Careers & Recruitment Module (Job openings, applicant tracking, stats, security checks)
2. Role authorization verification (Admin allowed, Salesperson/Customer denied with 403)
3. Sales Manager targets & customer directory access (No 403 Forbidden for authorized managers)
4. Lead reassignment with `reassign=True` preventing 409 Conflict
"""
import os
import tempfile
from datetime import datetime, timezone
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles
from app.database import SessionLocal, init_db
from app.main import app
from app.models import Assignment, CareerJob, JobApplication, Lead, PerformanceTarget, StaffUser
from fastapi.testclient import TestClient

init_db()
db = SessionLocal()

# Seed staff users
admin_user = StaffUser(email="admin@lyka.ae", name="Executive Admin", role="admin", is_active=True)
sm_user = StaffUser(email="sm@lyka.ae", name="Sales Manager", role="sales_manager", is_active=True)
sp_user = StaffUser(email="sp@lyka.ae", name="Salesperson", role="salesperson", is_active=True, manager_email="sm@lyka.ae")

db.add_all([admin_user, sm_user, sp_user])
db.commit()

# Seed lead
lead1 = Lead(raw_enquiry_text="Dubai Marina 2 bedroom buy", contact_email="client1@domain.com", customer_name="Client One", location="Dubai Marina", status="new")
db.add(lead1)
db.commit()
lead1_id = lead1.id
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, f"FAIL: {name} {extra}"
    passed.append(name)
    print("ok:", name)


def as_user(email: str, uid: str = None):
    claims = {"uid": uid or ("uid-" + email), "email": email}
    return patch.object(roles, "verify_bearer_token", return_value=claims)


# ─── 1. Admin Career Job Vacancy Management ───────────────────────────────────

# 1.1 Non-admin (Salesperson / Customer) receives 403 on Admin Careers
with as_user("sp@lyka.ae"):
    r = client.get("/api/admin/careers/jobs")
    check("salesperson_careers_403", r.status_code == 403, r.text)

with as_user("customer@domain.com"):
    r = client.get("/api/admin/careers/jobs")
    check("customer_careers_403", r.status_code == 403, r.text)

with client:
    r = client.get("/api/admin/careers/jobs")
    check("anonymous_careers_401", r.status_code == 401, r.text)

# 1.2 Admin creates Career Job
job_payload = {
    "title": "Senior Luxury Property Consultant",
    "department": "Sales",
    "location": "Downtown Dubai, UAE",
    "employment_type": "Full-time",
    "experience_level": "Senior level",
    "salary_range": "AED 20,000 - 35,000 / month",
    "description": "Lead luxury residential advisory for Palm Jumeirah and Downtown portfolios.",
    "requirements": ["3+ years Dubai luxury real estate experience", "RERA License"],
    "responsibilities": ["HNW client consultation", "Site viewings", "Deal negotiation"],
    "benefits": ["Uncapped commission", "Health insurance", "UAE Employment Visa"],
    "status": "active",
}

with as_user("admin@lyka.ae"):
    r = client.post("/api/admin/careers/jobs", json=job_payload)
    check("admin_create_job_201", r.status_code == 201, r.text)
    job_data = r.json()
    job_id = job_data["id"]
    check("admin_job_fields_match", job_data["title"] == job_payload["title"] and job_data["status"] == "active")

# 1.3 Admin lists Career Jobs
with as_user("admin@lyka.ae"):
    r = client.get("/api/admin/careers/jobs")
    check("admin_list_jobs_200", r.status_code == 200, r.text)
    jobs_list = r.json()
    check("admin_list_jobs_count", len(jobs_list) >= 1)

# 1.4 Admin updates Career Job
with as_user("admin@lyka.ae"):
    r = client.put(f"/api/admin/careers/jobs/{job_id}", json={
        "title": "Lead Luxury Property Consultant",
        "salary_range": "AED 25,000 - 40,000 / month",
    })
    check("admin_update_job_200", r.status_code == 200, r.text)
    check("admin_update_job_title", r.json()["title"] == "Lead Luxury Property Consultant")

# 1.5 Admin pauses Career Job
with as_user("admin@lyka.ae"):
    r = client.patch(f"/api/admin/careers/jobs/{job_id}/status", json={"status": "paused"})
    check("admin_pause_job_200", r.status_code == 200, r.text)
    check("admin_pause_job_status", r.json()["status"] == "paused")


# ─── 2. Candidate Job Applications & Evaluation ──────────────────────────────

# 2.1 Candidate cannot apply to paused job
app_payload = {
    "job_id": job_id,
    "applicant_name": "Sarah Jenkins",
    "applicant_email": "sarah.jenkins@example.com",
    "applicant_phone": "+971501234567",
    "years_experience": 4.5,
    "current_company": "Premier Properties Dubai",
    "cover_letter": "Passionate luxury property advisor with proven sales record in Palm Jumeirah.",
}
r = client.post("/api/careers/apply", json=app_payload)
check("apply_paused_job_400", r.status_code == 400, r.text)

# Re-activate job
with as_user("admin@lyka.ae"):
    r = client.patch(f"/api/admin/careers/jobs/{job_id}/status", json={"status": "active"})
    check("admin_reactivate_job_200", r.status_code == 200, r.text)

# 2.2 Candidate applies to active job
r = client.post("/api/careers/apply", json=app_payload)
check("apply_active_job_201", r.status_code == 201, r.text)
app_data = r.json()
app_id = app_data["id"]
check("application_status_received", app_data["status"] == "received")
check("application_job_title_populated", app_data["job_title"] == "Lead Luxury Property Consultant")

# 2.3 Duplicate application prevention
r_dup = client.post("/api/careers/apply", json=app_payload)
check("apply_duplicate_409", r_dup.status_code == 409, r_dup.text)

# 2.4 Admin lists applications and evaluates candidate
with as_user("admin@lyka.ae"):
    r = client.get("/api/admin/careers/applications")
    check("admin_list_applications_200", r.status_code == 200, r.text)
    apps = r.json()
    check("admin_applications_count", len(apps) >= 1)

    # Shortlist candidate
    r_eval = client.patch(
        f"/api/admin/careers/applications/{app_id}/status",
        json={"status": "shortlisted", "notes": "Strong luxury portfolio experience; schedule preliminary screening call."}
    )
    check("admin_evaluate_candidate_200", r_eval.status_code == 200, r_eval.text)
    eval_data = r_eval.json()
    check("admin_candidate_status_shortlisted", eval_data["status"] == "shortlisted")
    check("admin_candidate_notes_saved", "screening call" in eval_data["notes"])

# 2.5 Admin Career Statistics
with as_user("admin@lyka.ae"):
    r = client.get("/api/admin/careers/stats")
    check("admin_career_stats_200", r.status_code == 200, r.text)
    stats_data = r.json()
    check("stats_total_jobs", stats_data["total_jobs"] >= 1)
    check("stats_active_jobs", stats_data["active_jobs"] >= 1)
    check("stats_total_applications", stats_data["total_applications"] >= 1)
    check("stats_applications_by_status", "shortlisted" in stats_data["applications_by_status"])


# ─── 3. Business Targets & Customer Directory Authorization ──────────────────

# 3.1 Admin sets monthly targets; Sales Manager reads targets (200 OK)
current_period = datetime.now(timezone.utc).strftime("%Y-%m")
with as_user("admin@lyka.ae"):
    r = client.put("/api/staff/targets", json={
        "metric": "calls_connected",
        "period": current_period,
        "target_value": 75.0,
    })
    check("admin_upsert_target_200", r.status_code == 200, r.text)
    check("target_value_stored", r.json()["target_value"] == 75.0)

with as_user("sm@lyka.ae"):
    # Read targets back (Sales Manager has full read visibility)
    r_get = client.get(f"/api/staff/targets?period={current_period}")
    check("sales_manager_get_targets_200", r_get.status_code == 200, r_get.text)

    # Sales Manager is forbidden from editing company-wide targets
    r_put = client.put("/api/staff/targets", json={
        "metric": "calls_connected",
        "period": current_period,
        "target_value": 85.0,
    })
    check("sales_manager_edit_target_403", r_put.status_code == 403, r_put.text)

# 3.2 Customer directory: restricted to admin/manager (SM receives 403, Admin receives 200)
with as_user("sm@lyka.ae"):
    r = client.get("/api/staff/customers")
    check("sales_manager_customers_403", r.status_code == 403, r.text)

with as_user("admin@lyka.ae"):
    r = client.get("/api/staff/customers")
    check("admin_customers_200", r.status_code == 200, r.text)

# 3.3 Salesperson is still denied on targets setting (security boundary preserved)
with as_user("sp@lyka.ae"):
    r = client.put("/api/staff/targets", json={
        "metric": "calls_connected",
        "period": current_period,
        "target_value": 100.0,
    })
    check("salesperson_upsert_target_403", r.status_code == 403, r.text)


# ─── 4. Lead Reassignment Conflict Prevention ────────────────────────────────

# 4.1 First assignment to Salesperson
with as_user("sm@lyka.ae"):
    r = client.post("/api/staff/assignments", json={
        "lead_id": lead1_id,
        "staff_email": "sp@lyka.ae",
    })
    check("assign_lead_initial_201", r.status_code == 201, r.text)
    first_assign_id = r.json()["id"]

# 4.2 Duplicate assignment without reassign flag returns 409
with as_user("sm@lyka.ae"):
    r_dup = client.post("/api/staff/assignments", json={
        "lead_id": lead1_id,
        "staff_email": "sp@lyka.ae",
    })
    check("assign_lead_duplicate_409", r_dup.status_code == 409, r_dup.text)

# 4.3 Reassignment with reassign=True closes prior assignment and opens new one
with as_user("sm@lyka.ae"):
    r_reassign = client.post("/api/staff/assignments", json={
        "lead_id": lead1_id,
        "staff_email": "sp@lyka.ae",
        "reassign": True,
    })
    check("reassign_lead_success_201", r_reassign.status_code == 201, r_reassign.text)
    new_assign_id = r_reassign.json()["id"]
    check("reassign_created_new_row", new_assign_id != first_assign_id)

# Verify the old assignment is closed
db = SessionLocal()
old_row = db.query(Assignment).filter(Assignment.id == first_assign_id).first()
check("old_assignment_closed", old_row.status == "closed")
new_row = db.query(Assignment).filter(Assignment.id == new_assign_id).first()
check("new_assignment_open", new_row.status == "open")
db.close()

# Cleanup temp DB
try:
    os.unlink(tmp.name)
except Exception:
    pass

print(f"\nALL {len(passed)} VERIFICATION CHECKS PASSED SUCCESSFULLY!")
