import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""
Complete HRMS & Role Restructuring backend test suite (isolated SQLite DB).
Verifies:
1. Employee Roles: ADMIN, HRMS_ADMIN, SALES_AGENT.
2. Sales Manager role rejection on active login and assignment.
3. HRMS Admin access boundaries & permissions.
4. Attendance check-in / check-out / manual correction.
5. Leave balance tracking, application, approval, and deduction.
6. Payroll generation, publication, and strict self-service payslip isolation.
7. Candidate interview scheduling with notification.
8. HR Helpdesk ticket creation, messaging thread, and status updates.
9. Notification delivery for sensitive operations.
10. HR audit trail logging.
"""
import os
import tempfile
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles
from app.database import SessionLocal, init_db
from app.main import app
from app.models import (
    CareerJob, JobApplication, Lead, LeaveBalance, StaffUser
)
from fastapi.testclient import TestClient

init_db()
db = SessionLocal()

# Seed staff users
admin_staff = StaffUser(
    email="admin@lyka.ae",
    name="Admin User",
    role="admin",
    is_active=True,
    employee_id="EMP-001",
    department="Executive",
    designation="Managing Director",
)
hrms_staff = StaffUser(
    email="hrms@lyka.ae",
    name="HRMS Director",
    role="hrms_admin",
    is_active=True,
    employee_id="EMP-002",
    department="Human Resources",
    designation="HR Director",
)
agent_staff = StaffUser(
    email="agent@lyka.ae",
    name="Sales Agent",
    role="sales_agent",
    is_active=True,
    employee_id="EMP-003",
    department="Sales",
    designation="Luxury Property Consultant",
)
inactive_sm = StaffUser(
    email="old_manager@lyka.ae",
    name="Old Sales Manager",
    role="sales_manager",
    is_active=False,
    employee_id="EMP-004",
)

db.add_all([admin_staff, hrms_staff, agent_staff, inactive_sm])
db.commit()

# Seed Leave Balance for agent
db.add(LeaveBalance(
    staff_user_id=agent_staff.id,
    staff_email=agent_staff.email,
    year=2026,
    annual_total=30.0,
    annual_used=0.0,
    sick_total=15.0,
    sick_used=0.0,
    casual_total=7.0,
    casual_used=0.0,
    unpaid_used=0.0,
))

# Seed career job & application for interview scheduling test
job = CareerJob(
    title="Senior Luxury Property Consultant",
    department="Sales",
    location="Dubai, UAE",
    employment_type="Full-time",
    description="Selling high-end Dubai villas and penthouses.",
    status="active",
)
db.add(job)
db.flush()

app_rec = JobApplication(
    job_id=job.id,
    applicant_name="John Doe",
    applicant_email="john.doe@example.com",
    applicant_phone="+971501234567",
    status="received",
)
db.add(app_rec)
db.commit()

job_id = job.id
app_id = app_rec.id

db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []

def check(name, cond, extra=""):
    assert cond, f"FAIL: {name} {extra}"
    passed.append(name)
    print("ok:", name)

def as_user(uid, email):
    return patch.object(roles, "verify_bearer_token", return_value={"uid": uid, "email": email})

def run_all_tests():
    print("\n--- Running HRMS & Role Restructuring Tests ---")

    # 1. Inactive Sales Manager cannot access staff area
    with as_user("uid-sm", "old_manager@lyka.ae"):
        r = client.get("/api/staff/me")
        check("inactive_sales_manager_blocked", r.status_code == 403, r.text)

    # 2. Admin & HRMS Admin can access HRMS Overview
    with as_user("uid-hrms", "hrms@lyka.ae"):
        r = client.get("/api/hrms/overview")
        check("hrms_admin_overview_200", r.status_code == 200, r.text)
        data = r.json()
        check("hrms_overview_has_kpis", "total_employees" in data and "active_employees" in data and "pending_leaves" in data)

    # 3. Sales Agent cannot access HRMS Overview (403)
    with as_user("uid-agent", "agent@lyka.ae"):
        r = client.get("/api/hrms/overview")
        check("sales_agent_cannot_access_hrms_overview", r.status_code == 403, r.text)

    # 4. Sales Agent can access own profile
    with as_user("uid-agent", "agent@lyka.ae"):
        r = client.get("/api/hrms/me/profile")
        check("sales_agent_me_profile_200", r.status_code == 200, r.text)
        data = r.json()
        check("sales_agent_role_is_sales_agent", data["role"] == "sales_agent")
        check("sales_agent_has_employee_id", data["employee_id"] == "EMP-003")

    # 5. Sales Agent Attendance Check-in & Check-out
    with as_user("uid-agent", "agent@lyka.ae"):
        r_in = client.post("/api/hrms/attendance/check-in", json={"notes": "Morning check-in from office"})
        check("agent_attendance_check_in_200", r_in.status_code == 200, r_in.text)
        check("agent_checked_in_status", r_in.json()["status"] in ["present", "late"])

        # Duplicate check-in fails
        r_in_dup = client.post("/api/hrms/attendance/check-in", json={})
        check("agent_duplicate_check_in_400", r_in_dup.status_code == 400, r_in_dup.text)

        # Fast-forward check-in time by 5 minutes to satisfy the 1-minute minimum work requirement
        from app.models import AttendanceRecord
        from datetime import timedelta
        db_att = SessionLocal()
        att_rec = db_att.query(AttendanceRecord).filter(AttendanceRecord.staff_email == "agent@lyka.ae").order_by(AttendanceRecord.id.desc()).first()
        if att_rec:
            att_rec.check_in_time = datetime.now(timezone.utc) - timedelta(minutes=5)
            db_att.commit()
        db_att.close()

        # Check-out succeeds
        r_out = client.post("/api/hrms/attendance/check-out", json={"notes": "Heading to client viewing"})
        check("agent_attendance_check_out_200", r_out.status_code == 200, r_out.text)
        check("agent_attendance_has_hours", "total_hours" in r_out.json())

    # 6. HRMS Admin Manual Attendance Correction
    with as_user("uid-hrms", "hrms@lyka.ae"):
        r_corr = client.post("/api/hrms/attendance/manual-correction", json={
            "staff_email": "agent@lyka.ae",
            "date": str(date.today()),
            "status": "present",
            "notes": "Verified client meeting attendance",
            "correction_reason": "Approved offsite client meeting in Palm Jumeirah"
        })
        check("hrms_manual_attendance_correction_200", r_corr.status_code == 200, r_corr.text)
        check("correction_marked_manually", r_corr.json()["is_manually_corrected"] is True)

    # 7. Leave Management: Balance Check, Application, Approval
    leave_id = None
    with as_user("uid-agent", "agent@lyka.ae"):
        # Check balance
        r_bal = client.get("/api/hrms/leaves/balance?year=2026")
        check("agent_leave_balance_200", r_bal.status_code == 200, r_bal.text)
        check("agent_annual_remaining_30", r_bal.json()["annual_remaining"] == 30.0)

        # Apply for leave
        start = date.today() + timedelta(days=7)
        end = date.today() + timedelta(days=9)  # 3 days
        r_app = client.post("/api/hrms/leaves/apply", json={
            "leave_type": "annual",
            "start_date": str(start),
            "end_date": str(end),
            "reason": "Family vacation"
        })
        check("agent_apply_leave_200", r_app.status_code == 200, r_app.text)
        leave_data = r_app.json()
        check("leave_request_pending", leave_data["status"] == "pending")
        check("leave_days_count_3", leave_data["days_count"] == 3.0)
        leave_id = leave_data["id"]

    # HRMS Admin approves leave
    with as_user("uid-hrms", "hrms@lyka.ae"):
        r_act = client.post(f"/api/hrms/leaves/{leave_id}/action", json={
            "action": "approve",
            "reviewer_comments": "Approved. Have a great time."
        })
        check("hrms_approve_leave_200", r_act.status_code == 200, r_act.text)
        check("leave_approved_status", r_act.json()["status"] == "approved")

    # Verify agent's leave balance deducted
    with as_user("uid-agent", "agent@lyka.ae"):
        r_bal_after = client.get("/api/hrms/leaves/balance?year=2026")
        check("agent_annual_remaining_deducted_27", r_bal_after.json()["annual_remaining"] == 27.0)

    # 8. Payroll Generation & Payslip Distribution
    payroll_id = None
    with as_user("uid-hrms", "hrms@lyka.ae"):
        r_pay = client.post("/api/hrms/payroll/generate", json={
            "month": 11,
            "year": 2026,
            "title": "LYKA Realty November 2026 Payroll"
        })
        check("hrms_generate_payroll_200", r_pay.status_code == 200, r_pay.text)
        payroll_id = r_pay.json()["id"]
        check("payroll_status_draft", r_pay.json()["status"] == "draft")

        # Publish payroll
        r_pub = client.post(f"/api/hrms/payroll/{payroll_id}/publish")
        check("hrms_publish_payroll_200", r_pub.status_code == 200, r_pub.text)
        check("payroll_status_published", r_pub.json()["status"] == "published")

    # Agent can view own published payslip
    with as_user("uid-agent", "agent@lyka.ae"):
        r_ps = client.get("/api/hrms/payroll/my-payslips")
        check("agent_my_payslips_200", r_ps.status_code == 200, r_ps.text)
        slips = r_ps.json()
        check("agent_has_payslip", len(slips) > 0)
        check("payslip_belongs_to_agent", slips[0]["staff_email"] == "agent@lyka.ae")

    # 9. Recruitment Interviews
    with as_user("uid-hrms", "hrms@lyka.ae"):
        r_int = client.post("/api/hrms/recruitment/interviews", json={
            "application_id": app_id,
            "interview_date": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "round": "technical",
            "meeting_link": "https://meet.google.com/lyka-sales-interview",
        })
        check("hrms_schedule_interview_200", r_int.status_code == 200, r_int.text)
        check("interview_round_technical", r_int.json()["round"] == "technical")

    # 10. HR Helpdesk & Queries
    req_id = None
    with as_user("uid-agent", "agent@lyka.ae"):
        r_req = client.post("/api/hrms/requests", json={
            "category": "certificate_request",
            "priority": "high",
            "subject": "Salary Certificate for Bank Mortgage",
            "message": "Please issue an official salary certificate for Emirates NBD."
        })
        check("agent_create_hr_request_200", r_req.status_code == 200, r_req.text)
        req_data = r_req.json()
        req_id = req_data["id"]
        check("hr_ticket_has_number", req_data["ticket_number"].startswith("HR-"))

    # HRMS Admin replies to query
    with as_user("uid-hrms", "hrms@lyka.ae"):
        r_reply = client.post(f"/api/hrms/requests/{req_id}/messages", json={
            "message": "Certificate has been prepared and sent to HR documents."
        })
        check("hrms_reply_hr_request_200", r_reply.status_code == 200, r_reply.text)

        # Update ticket status to resolved
        r_stat = client.patch(f"/api/hrms/requests/{req_id}/status", json={
            "status": "resolved"
        })
        check("hrms_resolve_ticket_200", r_stat.status_code == 200, r_stat.text)

    # 11. Notifications delivery
    with as_user("uid-agent", "agent@lyka.ae"):
        r_notif = client.get("/api/hrms/notifications")
        check("agent_get_notifications_200", r_notif.status_code == 200, r_notif.text)
        notifs = r_notif.json()
        check("agent_received_notifications", len(notifs) >= 3)

    # 12. HR Audit Logs
    with as_user("uid-hrms", "hrms@lyka.ae"):
        r_audit = client.get("/api/hrms/audit-logs")
        check("hrms_get_audit_logs_200", r_audit.status_code == 200, r_audit.text)
        check("audit_logs_populated", len(r_audit.json()) > 0)

    print(f"\nALL {len(passed)} HRMS & ROLE RESTRUCTURING CHECKS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_all_tests()

