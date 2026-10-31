"""
Database engine and session factory.
Supports PostgreSQL (production) and SQLite (local dev).
Set DATABASE_URL in backend/.env to switch.
"""
import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv

_backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_env_path = os.path.join(_backend_dir, ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL or DATABASE_URL.strip() == "sqlite:///./lyka_realty.db":
    default_db_path = os.path.join(_backend_dir, "lyka_realty.db")
    DATABASE_URL = f"sqlite:///{default_db_path}"

# SQLite: use check_same_thread=False; PostgreSQL: no extra args needed
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: yields a DB session and closes it when done."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Call on startup."""
    from app import models  # noqa: F401 — ensure models are registered
    Base.metadata.create_all(bind=engine)
    migrate()


def migrate():
    """Safe additive migrations for existing databases.

    Adds columns introduced after the initial schema without touching
    existing rows (all new columns are nullable). New tables are handled
    by create_all above. Works across both PostgreSQL and SQLite.
    """
    is_sqlite = DATABASE_URL.startswith("sqlite")
    wanted: dict[str, dict[str, str]] = {
        "staff_users": {
            "firebase_uid": "VARCHAR(128)",
            "manager_email": "VARCHAR(200)",
            "employee_id": "VARCHAR(50)",
            "department": "VARCHAR(100) DEFAULT 'Sales'",
            "designation": "VARCHAR(100) DEFAULT 'Sales Consultant'",
            "phone": "VARCHAR(50)",
            "joining_date": "DATETIME" if is_sqlite else "TIMESTAMP WITH TIME ZONE",
            "employment_status": "VARCHAR(50) DEFAULT 'full_time'",
            "salary_basic_aed": "FLOAT DEFAULT 12000.0",
            "salary_allowances_aed": "FLOAT DEFAULT 3000.0",
            "salary_deductions_aed": "FLOAT DEFAULT 0.0",
        },
        "assignments": {
            "staff_uid": "VARCHAR(128)",
        },
        "follow_ups": {
            "staff_uid": "VARCHAR(128)",
            "completed_at": "DATETIME" if is_sqlite else "TIMESTAMP WITH TIME ZONE",
            "completed_by": "VARCHAR(200)",
        },
        "viewings": {
            "staff_uid": "VARCHAR(128)",
        },
        "recommendations": {
            "is_nearby": "BOOLEAN DEFAULT 0" if is_sqlite else "BOOLEAN DEFAULT FALSE",
        },
        "leads": {
            "utm_source": "VARCHAR(255)",
            "utm_medium": "VARCHAR(255)",
            "utm_campaign": "VARCHAR(255)",
            "referrer": "VARCHAR(500)",
            "discovery_source": "VARCHAR(50)",
            "property_ref": "VARCHAR(64)",
            "do_not_disturb": "BOOLEAN DEFAULT 0" if is_sqlite else "BOOLEAN DEFAULT FALSE",
            "callback_requested": "BOOLEAN DEFAULT 0" if is_sqlite else "BOOLEAN DEFAULT FALSE",
            "last_call_outcome": "VARCHAR(100)",
            "original_assigned_email": "VARCHAR(255)",
            "current_responsible_email": "VARCHAR(255)",
            "covering_agent_email": "VARCHAR(255)",
            "coverage_status": "VARCHAR(50) DEFAULT 'normal'",
            "next_followup_at": "DATETIME" if is_sqlite else "TIMESTAMP WITH TIME ZONE",
            "last_contacted_at": "DATETIME" if is_sqlite else "TIMESTAMP WITH TIME ZONE",
            "lead_score": "INTEGER",
            "lead_score_band": "VARCHAR(16)",
            "lead_score_reasons": "TEXT",
            "lead_score_updated_at": "DATETIME" if is_sqlite else "TIMESTAMP WITH TIME ZONE",
            "lead_score_source": "VARCHAR(32)",
            "lead_score_override": "BOOLEAN DEFAULT 0" if is_sqlite else "BOOLEAN DEFAULT FALSE",
            "lead_score_override_reason": "TEXT",
            "lead_score_override_by": "VARCHAR(255)",
            "lead_score_override_at": "DATETIME" if is_sqlite else "TIMESTAMP WITH TIME ZONE",
        },
        "customer_profiles": {
            "utm_source": "VARCHAR(255)",
            "utm_medium": "VARCHAR(255)",
            "utm_campaign": "VARCHAR(255)",
            "referrer": "VARCHAR(500)",
            "discovery_source": "VARCHAR(50)",
            "country": "VARCHAR(100)",
        },
        "call_logs": {
            "attempt_number": "INTEGER DEFAULT 1",
            "is_first_call": "BOOLEAN DEFAULT 0" if is_sqlite else "BOOLEAN DEFAULT FALSE",
            "customer_response": "TEXT",
            "recommended_action": "TEXT",
        },
        "viewings": {
            "staff_uid": "VARCHAR(128)",
            "feedback": "TEXT",
            "interest_level": "VARCHAR(50)",
            "rejection_reasons": "VARCHAR(255)",
        },
        "crm_properties": {
            "verification_status": "VARCHAR(50) DEFAULT 'verified'",
            "document_status": "VARCHAR(50) DEFAULT 'approved'",
            "permit_number": "VARCHAR(100)",
            "price_history": "TEXT" if is_sqlite else "JSONB DEFAULT '[]'::jsonb",
        },
        "notifications": {
            "recipient_user_id": "VARCHAR(128)",
            "notification_type": "VARCHAR(50) DEFAULT 'system'",
            "related_entity_type": "VARCHAR(50)",
            "related_entity_id": "VARCHAR(100)",
            "action_url": "VARCHAR(255)",
            "read_at": "DATETIME" if is_sqlite else "TIMESTAMP WITH TIME ZONE",
        },
    }

    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        table_columns = {}
        for table in table_names:
            try:
                table_columns[table] = {c["name"] for c in inspector.get_columns(table)}
            except Exception:
                table_columns[table] = set()

        with engine.begin() as conn:
            for table, cols in wanted.items():
                if table not in table_names:
                    continue
                existing_cols = table_columns.get(table, set())
                for col_name, col_type in cols.items():
                    if col_name not in existing_cols:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"))

            # Pre-migration rows: normalise is_nearby to false
            if "recommendations" in table_names:
                try:
                    val = 0 if is_sqlite else "false"
                    conn.execute(text(f"UPDATE recommendations SET is_nearby = {val} WHERE is_nearby IS NULL"))
                except Exception:
                    pass

            # Indexes on additive columns (IF NOT EXISTS keeps this rerunnable)
            for stmt in (
                "CREATE INDEX IF NOT EXISTS ix_leads_property_ref ON leads(property_ref)",
                "CREATE INDEX IF NOT EXISTS ix_leads_do_not_disturb ON leads(do_not_disturb)",
                "CREATE INDEX IF NOT EXISTS ix_leads_next_followup_at ON leads(next_followup_at)",
                "CREATE INDEX IF NOT EXISTS ix_property_ads_is_active ON property_ads(is_active)",
                "CREATE INDEX IF NOT EXISTS ix_property_ads_published_at ON property_ads(published_at)",
                "CREATE INDEX IF NOT EXISTS ix_property_ad_events_occurred_at ON property_ad_events(occurred_at)",
                "CREATE INDEX IF NOT EXISTS ix_call_logs_lead_id ON call_logs(lead_id)",
                "CREATE INDEX IF NOT EXISTS ix_call_logs_staff_email ON call_logs(staff_email)",
                "CREATE INDEX IF NOT EXISTS ix_call_logs_status ON call_logs(status)",
                "CREATE INDEX IF NOT EXISTS ix_call_logs_attempted_at ON call_logs(attempted_at)",
                "CREATE INDEX IF NOT EXISTS ix_notifications_recipient_email ON notifications(recipient_email)",
                "CREATE INDEX IF NOT EXISTS ix_notifications_recipient_user_id ON notifications(recipient_user_id)",
                "CREATE INDEX IF NOT EXISTS ix_notifications_recipient_role ON notifications(recipient_role)",
                "CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications(is_read)",
                "CREATE INDEX IF NOT EXISTS ix_notifications_created_at ON notifications(created_at)",
            ):
                try:
                    conn.execute(text(stmt))
                except Exception:
                    pass


    except Exception:
        # Startup must not fail if migration has already been executed or role is restricted
        pass

