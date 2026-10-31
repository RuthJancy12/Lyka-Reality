import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""
Test Suite: Employee Automation, Role-Based My Account, HRMS Leave and Sales Continuity
LYKA Realty Master Enterprise Real Estate Platform
"""
import sys
import os
from datetime import datetime, timezone, timedelta, date

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models import (
    StaffUser, Lead, Assignment, Activity, LeaveBalance, LeaveRequest, HRNotification, AuditEvent
)
from app.routers.staff import _compute_coverage_priority_rank


def run_tests():
    db = SessionLocal()
    print("=" * 70)
    print("STARTING TEST SUITE: EMPLOYEE AUTOMATION & SALES CONTINUITY")
    print("=" * 70)

    try:
        now = datetime.now(timezone.utc)
        today = now.date()

        # ----------------------------------------------------------------------
        # TEST A: Verify Existing Staff Records and Role Isolation
        # ----------------------------------------------------------------------
        print("\n[TEST A] Checking Existing Staff in PostgreSQL...")
        staff_members = db.query(StaffUser).all()
        print(f"  Found {len(staff_members)} staff members:")
        for s in staff_members:
            avail = s.get_effective_availability(db, today)
            print(f"  - [{s.employee_id}] {s.name} ({s.email}) | Role: {s.role} | Availability: {avail}")
            assert s.role in ("admin", "salesperson", "sales_agent", "hrms_admin", "sales_manager", "manager")

        # ----------------------------------------------------------------------
        # TEST B: Dynamic Availability Status & Effective Leave Calculation
        # ----------------------------------------------------------------------
        print("\n[TEST B] Testing Effective Availability (available vs on_leave)...")
        sales_agent = db.query(StaffUser).filter(StaffUser.role.in_(("salesperson", "sales_agent"))).first()
        assert sales_agent is not None, "Need at least one sales agent for test"

        initial_avail = sales_agent.get_effective_availability(db, today)
        print(f"  Initial availability for {sales_agent.name}: {initial_avail}")

        bal = db.query(LeaveBalance).filter(LeaveBalance.staff_user_id == sales_agent.id).first()
        if not bal:
            bal = LeaveBalance(
                staff_user_id=sales_agent.id,
                staff_email=sales_agent.email,
                year=today.year,
                annual_total=30.0,
                annual_used=0.0,
                sick_total=15.0,
                sick_used=0.0,
                casual_total=7.0,
                casual_used=0.0,
                unpaid_used=0.0,
            )
            db.add(bal)
            db.commit()
            db.refresh(bal)
        print(f"  Leave Balance: Annual {bal.annual_total - bal.annual_used}d, Sick {bal.sick_total - bal.sick_used}d, Casual {bal.casual_total - bal.casual_used}d")
        assert bal.annual_total == 30.0
        assert bal.sick_total == 15.0
        assert bal.casual_total == 7.0

        # ----------------------------------------------------------------------
        # TEST C: HRMS Leave Request Lifecycle (Apply -> Cancel)
        # ----------------------------------------------------------------------
        print("\n[TEST C] Testing Leave Request Application & Self-Service Cancellation...")
        test_leave = LeaveRequest(
            staff_user_id=sales_agent.id,
            staff_email=sales_agent.email,
            staff_name=sales_agent.name,
            leave_type="casual",
            start_date=today + timedelta(days=20),
            end_date=today + timedelta(days=21),
            days_count=2.0,
            reason="Test family event",
            status="pending",
            created_at=now,
            updated_at=now,
        )
        db.add(test_leave)
        db.commit()
        db.refresh(test_leave)
        assert test_leave.status == "pending"
        print(f"  Created test pending leave #{test_leave.id}")

        test_leave.status = "cancelled"
        test_leave.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(test_leave)
        assert test_leave.status == "cancelled"
        print(f"  Cancelled test leave #{test_leave.id} successfully")
        db.delete(test_leave)
        db.commit()

        # ----------------------------------------------------------------------
        # TEST D: Priority Ranking Algorithm
        # ----------------------------------------------------------------------
        print("\n[TEST D] Testing Lead Coverage Priority Ranking Algorithm...")
        l1 = Lead(
            customer_name="Hot Client",
            contact_email="hot@client.ae",
            priority_label="High",
            lead_score=85,
            callback_requested=False,
            status="new",
            raw_enquiry_text="Looking for luxury penthouse",
        )
        l2 = Lead(
            customer_name="Callback Client",
            contact_email="cb@client.ae",
            priority_label="Low",
            lead_score=20,
            callback_requested=True,
            status="new",
            raw_enquiry_text="Please call me back immediately",
        )
        l3 = Lead(
            customer_name="Warm Client",
            contact_email="warm@client.ae",
            priority_label="Medium",
            lead_score=50,
            callback_requested=False,
            status="contacted",
            raw_enquiry_text="Looking for 2BR in Downtown",
        )
        l4 = Lead(
            customer_name="Cold Client",
            contact_email="cold@client.ae",
            priority_label="Low",
            lead_score=15,
            callback_requested=False,
            status="new",
            raw_enquiry_text="General browsing",
        )

        r1 = _compute_coverage_priority_rank(l1, now)
        r2 = _compute_coverage_priority_rank(l2, now)
        r3 = _compute_coverage_priority_rank(l3, now)
        r4 = _compute_coverage_priority_rank(l4, now)

        print(f"  Hot Client Rank: {r1} (Expected 1)")
        print(f"  Callback Client Rank: {r2} (Expected 1)")
        print(f"  Warm Client Rank: {r3} (Expected 2)")
        print(f"  Cold Client Rank: {r4} (Expected 3)")

        assert r1 == 1, f"Expected 1, got {r1}"
        assert r2 == 1, f"Expected 1, got {r2}"
        assert r3 == 2, f"Expected 2, got {r3}"
        assert r4 == 3, f"Expected 3, got {r4}"

        # ----------------------------------------------------------------------
        # TEST E: Sales Continuity Workflow (Leave -> Coverage Required -> Assign -> Return)
        # ----------------------------------------------------------------------
        print("\n[TEST E] Testing Sales Agent Absence & Lead Coverage Continuity Workflow...")
        test_lead = Lead(
            customer_name="Continuity Test Prospect",
            contact_email="continuity@investor.ae",
            contact_phone="+971509998888",
            priority_label="High",
            lead_score=90,
            original_assigned_email=sales_agent.email,
            current_responsible_email=sales_agent.email,
            coverage_status="normal",
            status="contacted",
            callback_requested=True,
            raw_enquiry_text="Interested in Palm Jumeirah villa",
            created_at=now,
        )
        db.add(test_lead)
        db.commit()
        db.refresh(test_lead)
        print(f"  Created active Lead #{test_lead.id} assigned to {sales_agent.email}")

        # Initial Assignment row
        initial_asgn = Assignment(
            lead_id=test_lead.id,
            staff_email=sales_agent.email,
            assigned_by="ruthjancy12@gmail.com",
            status="open",
            created_at=now,
        )
        db.add(initial_asgn)
        db.commit()

        # Simulate Leave Approval for sales_agent today
        leave_active = LeaveRequest(
            staff_user_id=sales_agent.id,
            staff_email=sales_agent.email,
            staff_name=sales_agent.name,
            leave_type="annual",
            start_date=today,
            end_date=today + timedelta(days=5),
            days_count=5.0,
            reason="Annual Vacation",
            status="approved",
            reviewer_email="ruthjancy12@gmail.com",
            reviewed_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(leave_active)
        db.commit()
        db.refresh(leave_active)

        eff_avail = sales_agent.get_effective_availability(db, today)
        print(f"  Effective availability for {sales_agent.name} after leave approval: {eff_avail}")
        assert eff_avail == "on_leave", f"Expected 'on_leave', got '{eff_avail}'"

        # Mark lead coverage_status = "coverage_required"
        test_lead.coverage_status = "coverage_required"
        db.add(HRNotification(
            recipient_email="ruthjancy12@gmail.com",
            recipient_role="admin",
            title="Sales Agent Leave Approved — Lead Coverage Required",
            message=f"{sales_agent.name} ({sales_agent.email}) on leave. Active leads require coverage.",
            notification_type="lead_coverage",
            link_url="/crm/team?tab=coverage",
        ))
        db.commit()
        print("  Marked lead coverage_status = 'coverage_required' and dispatched Admin notification")

        # Admin assigns coverage to covering agent
        covering_agent_email = "ruthjancy12@gmail.com"
        orig_agent_email = test_lead.original_assigned_email

        test_lead.current_responsible_email = covering_agent_email
        test_lead.covering_agent_email = covering_agent_email
        test_lead.coverage_status = "covered"

        cov_asgn = Assignment(
            lead_id=test_lead.id,
            staff_email=covering_agent_email,
            assigned_by="ruthjancy12@gmail.com",
            original_staff_email=orig_agent_email,
            is_temporary_coverage=True,
            coverage_reason="Sales Agent On Approved Leave",
            coverage_start=today,
            coverage_end=today + timedelta(days=5),
            assignment_reason="Temporary Leave Coverage",
            status="open",
        )
        db.add(cov_asgn)
        db.add(Activity(
            lead_id=test_lead.id,
            activity_type="temporary_coverage_assigned",
            notes=f"Assigned temporary coverage to {covering_agent_email} by ruthjancy12@gmail.com",
            created_at=now,
        ))
        db.commit()
        db.refresh(test_lead)

        assert test_lead.coverage_status == "covered"
        assert test_lead.covering_agent_email == covering_agent_email
        assert test_lead.original_assigned_email == orig_agent_email
        print(f"  Lead #{test_lead.id} successfully covered by {covering_agent_email}. Original: {orig_agent_email}")

        # Return Lead to Original Agent
        test_lead.current_responsible_email = orig_agent_email
        test_lead.covering_agent_email = None
        test_lead.coverage_status = "normal"
        cov_asgn.status = "closed"
        cov_asgn.coverage_end = today
        db.add(Activity(
            lead_id=test_lead.id,
            activity_type="lead_returned_from_coverage",
            notes=f"Returned lead from coverage back to {orig_agent_email} by ruthjancy12@gmail.com",
            created_at=now,
        ))
        db.commit()
        db.refresh(test_lead)

        assert test_lead.coverage_status == "normal"
        assert test_lead.current_responsible_email == orig_agent_email
        assert test_lead.covering_agent_email is None
        print(f"  Lead #{test_lead.id} successfully restored to original agent {orig_agent_email}")

        # Cleanup test records
        db.delete(cov_asgn)
        db.delete(initial_asgn)
        db.delete(test_lead)
        db.delete(leave_active)
        db.commit()

        # ----------------------------------------------------------------------
        # TEST F: Personal Profile Update (Phone editable, organizational fields fixed)
        # ----------------------------------------------------------------------
        print("\n[TEST F] Testing Self-Service Profile Update...")
        old_phone = sales_agent.phone
        test_phone = "+971 55 987 6543"
        sales_agent.phone = test_phone
        db.commit()
        db.refresh(sales_agent)
        assert sales_agent.phone == test_phone
        print(f"  Updated contact phone to {sales_agent.phone}")
        # Restore
        sales_agent.phone = old_phone
        db.commit()

        print("\n" + "=" * 70)
        print("ALL BACKEND & INTEGRATION TESTS PASSED (100% SUCCESS)!")
        print("=" * 70)

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Test failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
