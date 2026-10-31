"""
Safe, non-destructive migration script to add lead continuity, coverage, and employee availability columns.
Works against both Supabase PostgreSQL and SQLite.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import inspect, text
from app.database import engine, Base

def run_migration():
    print(f"Connecting to database using engine: {engine.url.render_as_string(hide_password=True)}")
    
    # Create any missing tables defined in Base.metadata
    Base.metadata.create_all(bind=engine)
    print("Base.metadata.create_all completed.")

    inspector = inspect(engine)
    is_sqlite = engine.url.drivername.startswith("sqlite")
    bool_type = "BOOLEAN DEFAULT 0" if is_sqlite else "BOOLEAN DEFAULT FALSE"
    dt_type = "DATETIME" if is_sqlite else "TIMESTAMP WITH TIME ZONE"
    date_type = "DATE"

    # 1. StaffUser columns
    existing_staff_cols = {c["name"] for c in inspector.get_columns("staff_users")}
    staff_cols_wanted = {
        "availability_status": "VARCHAR(50) DEFAULT 'available'",
    }
    with engine.begin() as conn:
        for col, col_type in staff_cols_wanted.items():
            if col not in existing_staff_cols:
                print(f"Adding column {col} to staff_users...")
                conn.execute(text(f"ALTER TABLE staff_users ADD COLUMN {col} {col_type}"))
            else:
                print(f"Column {col} already exists on staff_users.")

    # 2. Assignment columns
    existing_assign_cols = {c["name"] for c in inspector.get_columns("assignments")}
    assign_cols_wanted = {
        "original_staff_email": "VARCHAR(200)",
        "is_temporary_coverage": bool_type,
        "coverage_reason": "VARCHAR(255)",
        "coverage_start": date_type,
        "coverage_end": date_type,
        "assignment_reason": "VARCHAR(255)",
    }
    with engine.begin() as conn:
        for col, col_type in assign_cols_wanted.items():
            if col not in existing_assign_cols:
                print(f"Adding column {col} to assignments...")
                conn.execute(text(f"ALTER TABLE assignments ADD COLUMN {col} {col_type}"))
            else:
                print(f"Column {col} already exists on assignments.")

    # 3. Lead columns
    existing_lead_cols = {c["name"] for c in inspector.get_columns("leads")}
    lead_cols_wanted = {
        "original_assigned_email": "VARCHAR(200)",
        "current_responsible_email": "VARCHAR(200)",
        "covering_agent_email": "VARCHAR(200)",
        "coverage_status": "VARCHAR(50) DEFAULT 'normal'",
        "next_followup_at": dt_type,
        "last_contacted_at": dt_type,
        "last_call_outcome": "VARCHAR(100)",
        "callback_requested": bool_type,
    }
    with engine.begin() as conn:
        for col, col_type in lead_cols_wanted.items():
            if col not in existing_lead_cols:
                print(f"Adding column {col} to leads...")
                conn.execute(text(f"ALTER TABLE leads ADD COLUMN {col} {col_type}"))
            else:
                print(f"Column {col} already exists on leads.")

    print("\nMigration completed successfully.")

if __name__ == "__main__":
    run_migration()

