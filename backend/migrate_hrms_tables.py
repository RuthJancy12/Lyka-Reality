"""
Safe, non-destructive migration script to create HRMS tables and add employee columns.
Works against both Supabase PostgreSQL and local SQLite.
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import inspect, text
from app.database import engine, Base, SessionLocal
import app.models as models

def run_migration():
    print(f"Connecting to database using engine: {engine.url.render_as_string(hide_password=True)}")
    
    # 1. Create any missing tables defined in Base.metadata
    Base.metadata.create_all(bind=engine)
    print("Base.metadata.create_all completed.")

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    print(f"Current tables count: {len(table_names)}")

    is_sqlite = engine.url.drivername.startswith("sqlite")
    dt_type = "DATETIME" if is_sqlite else "TIMESTAMP WITH TIME ZONE"

    # 2. Add columns to staff_users if missing
    staff_cols_wanted = {
        "employee_id": "VARCHAR(50)",
        "department": "VARCHAR(100) DEFAULT 'Sales'",
        "designation": "VARCHAR(100) DEFAULT 'Sales Consultant'",
        "phone": "VARCHAR(50)",
        "joining_date": dt_type,
        "employment_status": "VARCHAR(50) DEFAULT 'full_time'",
        "salary_basic_aed": "FLOAT DEFAULT 12000.0",
        "salary_allowances_aed": "FLOAT DEFAULT 3000.0",
        "salary_deductions_aed": "FLOAT DEFAULT 0.0",
    }

    existing_staff_cols = {c["name"] for c in inspector.get_columns("staff_users")}
    with engine.begin() as conn:
        for col, col_type in staff_cols_wanted.items():
            if col not in existing_staff_cols:
                print(f"Adding column {col} to staff_users...")
                conn.execute(text(f"ALTER TABLE staff_users ADD COLUMN {col} {col_type}"))
            else:
                print(f"Column {col} already exists on staff_users.")

    # 3. Seed employee_ids and leave balances for existing staff users if missing
    db = SessionLocal()
    try:
        staff_list = db.query(models.StaffUser).order_by(models.StaffUser.id).all()
        for idx, s in enumerate(staff_list, start=1):
            if not s.employee_id:
                s.employee_id = f"EMP-{idx:03d}"
                print(f"Assigned {s.employee_id} to {s.email}")
            if not s.department:
                if s.role == "admin":
                    s.department = "Executive"
                    s.designation = "Managing Director / Admin"
                elif s.role == "hrms_admin":
                    s.department = "Human Resources"
                    s.designation = "HR Director"
                else:
                    s.department = "Sales"
                    s.designation = "Senior Sales Consultant"
            if not s.joining_date:
                s.joining_date = datetime.now(timezone.utc)
            if not s.employment_status:
                s.employment_status = "full_time"
            if s.salary_basic_aed is None:
                s.salary_basic_aed = 25000.0 if s.role == "admin" else 15000.0
            if s.salary_allowances_aed is None:
                s.salary_allowances_aed = 5000.0 if s.role == "admin" else 3000.0
            if s.salary_deductions_aed is None:
                s.salary_deductions_aed = 0.0

            # Seed 2026 leave balance if not exists
            bal = db.query(models.LeaveBalance).filter_by(staff_user_id=s.id, year=2026).first()
            if not bal:
                bal = models.LeaveBalance(
                    staff_user_id=s.id,
                    staff_email=s.email,
                    year=2026,
                    annual_total=30.0,
                    annual_used=0.0,
                    sick_total=15.0,
                    sick_used=0.0,
                    casual_total=7.0,
                    casual_used=0.0,
                    unpaid_used=0.0,
                )
                db.add(bal)
                print(f"Initialized 2026 leave balance for {s.email}")

        db.commit()
        print(f"Successfully verified & updated {len(staff_list)} staff records.")

        # Print all tables now
        inspector = inspect(engine)
        final_tables = sorted(inspector.get_table_names())
        print(f"Final tables count: {len(final_tables)}")
        print("Tables:", ", ".join(final_tables))

    finally:
        db.close()

if __name__ == "__main__":
    run_migration()

