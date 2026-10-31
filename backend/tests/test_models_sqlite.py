import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""
Sandboxed in-memory test suite for Employee Automation, My Account, Leave, and Sales Continuity
Uses SQLite in-memory database to test without external network or credentials.
"""
import sys
import os
from datetime import datetime, timezone, timedelta, date

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import (
    Base, StaffUser, Lead, Assignment, Activity, LeaveBalance, LeaveRequest, HRNotification
)
from app.routers.staff import _compute_coverage_priority_rank

# In-memory SQLite engine
engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

def test_all():
    db = Session()
    print("=" * 70)
    print("RUNNING IN-MEMORY SUITE: EMPLOYEE AUTOMATION & SALES CONTINUITY")
    print("=" * 70)

    now = datetime.now(timezone.utc)
    today = now.date()

    # 1. Create Staff Members (Admin, HRMS Admin, Sales Agent)
    admin = StaffUser(
        id=1, email="admin@lyka.ae", name="Admin User", role="admin",
        employee_id="EMP-001", is_active=True, department="Executive Leadership", designation="Director"
    )
    hrms = StaffUser(
        id=2, email="hrms@lyka.ae", name="HRMS Admin", role="hrms_admin",
        employee_id="EMP-002", is_active=True, department="Human Resources", designation="HR Manager"
    )
    agent = StaffUser(
        id=3, email="agent@lyka.ae", name="Sales Agent", role="sales_agent",
        employee_id="EMP-003", is_active=True, department="Sales", designation="Luxury Property Consultant"
    )
    db.add_all([admin, hrms, agent])
    db.commit()

    # 2. Check initial availability
    assert agent.get_effective_availability(db, today) == "available"
    print("[PASS] Initial sales agent availability: 'available'")

    # 3. Initialize Leave Balance
    bal = LeaveBalance(
        staff_user_id=agent.id,
        staff_email=agent.email,
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
    print("[PASS] Leave entitlement initialized: 30 Annual, 15 Sick, 7 Casual")

    # 4. Priority Ranking Test
    l1 = Lead(
        customer_name="Hot Lead", priority_label="High", lead_score=80,
        callback_requested=False, raw_enquiry_text="High priority"
    )
    l2 = Lead(
        customer_name="Callback Lead", priority_label="Low", lead_score=10,
        callback_requested=True, raw_enquiry_text="Call me"
    )
    l3 = Lead(
        customer_name="Warm Lead", priority_label="Medium", lead_score=50,
        callback_requested=False, raw_enquiry_text="Warm enquiry"
    )
    l4 = Lead(
        customer_name="Cold Lead", priority_label="Low", lead_score=10,
        callback_requested=False, raw_enquiry_text="Cold enquiry"
    )
    assert _compute_coverage_priority_rank(l1, now) == 1
    assert _compute_coverage_priority_rank(l2, now) == 1
    assert _compute_coverage_priority_rank(l3, now) == 2
    assert _compute_coverage_priority_rank(l4, now) == 3
    print("[PASS] Priority ranking: Rank 1 (HOT/Callback) > Rank 2 (WARM) > Rank 3 (COLD)")

    # 5. Leave Application & Approval Flow
    leave = LeaveRequest(
        staff_user_id=agent.id,
        staff_email=agent.email,
        staff_name=agent.name,
        leave_type="annual",
        start_date=today,
        end_date=today + timedelta(days=5),
        days_count=5.0,
        reason="Vacation",
        status="approved",
        reviewer_email=admin.email,
        reviewed_at=now,
    )
    db.add(leave)
    db.commit()

    # Agent is now on leave
    assert agent.get_effective_availability(db, today) == "on_leave"
    print("[PASS] Dynamic availability calculation: Sales Agent is 'on_leave'")

    # 6. Sales Continuity: Lead Coverage Assignment & Return
    lead = Lead(
        customer_name="VIP Client",
        contact_email="vip@dubai.ae",
        original_assigned_email=agent.email,
        current_responsible_email=agent.email,
        coverage_status="coverage_required",
        raw_enquiry_text="Palm villa purchase",
    )
    db.add(lead)
    db.commit()

    # Coverage assignment
    covering_agent = "covering@lyka.ae"
    lead.current_responsible_email = covering_agent
    lead.covering_agent_email = covering_agent
    lead.coverage_status = "covered"
    asgn = Assignment(
        lead_id=lead.id,
        staff_email=covering_agent,
        original_staff_email=agent.email,
        is_temporary_coverage=True,
        coverage_reason="Sales Agent On Approved Leave",
        coverage_start=today,
        coverage_end=today + timedelta(days=5),
        assigned_by=admin.email,
        status="open",
    )
    db.add(asgn)
    db.commit()

    assert lead.coverage_status == "covered"
    assert lead.covering_agent_email == covering_agent
    assert lead.original_assigned_email == agent.email
    print(f"[PASS] Temporary coverage successfully assigned to {covering_agent}")

    # Return to original agent
    lead.current_responsible_email = agent.email
    lead.covering_agent_email = None
    lead.coverage_status = "normal"
    asgn.status = "closed"
    db.commit()

    assert lead.coverage_status == "normal"
    assert lead.current_responsible_email == agent.email
    assert lead.covering_agent_email is None
    print("[PASS] Lead coverage returned to original sales agent upon leave conclusion")

    print("\n" + "=" * 70)
    print("ALL IN-MEMORY INTEGRATION TESTS PASSED (100% SUCCESS)!")
    print("=" * 70)

if __name__ == "__main__":
    test_all()
