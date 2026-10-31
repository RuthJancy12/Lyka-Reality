"""
Migration: Add status, is_featured, image_gallery columns to crm_properties table if they do not exist.
Safe, non-destructive, idempotent.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine
from sqlalchemy import text

def run_migration():
    print("Running inventory columns migration...")
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE crm_properties ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Available';"))
        conn.execute(text("ALTER TABLE crm_properties ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("ALTER TABLE crm_properties ADD COLUMN IF NOT EXISTS image_gallery JSON DEFAULT '[]'::json;"))
        conn.commit()
    print("Inventory columns migration completed successfully!")

if __name__ == "__main__":
    run_migration()

