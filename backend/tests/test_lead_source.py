import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Lead-source attribution regression test (isolated temp DB).

Verifies UTM + referrer capture on the public enquiry endpoint:
  1. Submitted source values persist on the Lead and come back via the
     Admin detail API (visible in CRM).
  2. Missing attribution stays NULL (never invented) and old rows
     without source columns data read fine.
  3. The additive migration adds the four columns without touching
     existing rows or values.

Run: python test_lead_source.py
"""
import os
import sqlite3
import tempfile

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

from app.database import SessionLocal, init_db, migrate  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Lead  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


# ── 1. Source persists + returns ──────────────────────────────────────────
r = client.post("/api/leads/public", json={
    "customer_name": "Src Test",
    "contact_email": "src-attr@t.ae",
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "marina-launch",
    "referrer": "https://www.google.com/search?q=dubai",
})
check("public 201 with source", r.status_code == 201, r.text[:200])
body = r.json()
lead_id = body["id"]
check("public response minimal", set(body) == {"id", "status"},
      str(sorted(body.keys())))

db = SessionLocal()
row = db.query(Lead).filter(Lead.id == lead_id).first()
check("source stored",
      (row.utm_source, row.utm_medium, row.utm_campaign, row.referrer) ==
      ("google", "cpc", "marina-launch", "https://www.google.com/search?q=dubai"))
db.close()

# ── 2. Missing attribution stays NULL ─────────────────────────────────────
r = client.post("/api/leads/public", json={
    "customer_name": "No Src",
    "contact_email": "src-none@t.ae",
})
check("public 201 without source", r.status_code == 201, r.text[:200])
lead_id = r.json()["id"]
db = SessionLocal()
row = db.query(Lead).filter(Lead.id == lead_id).first()
check("missing source null, not invented",
      row.utm_source is None and row.utm_medium is None
      and row.utm_campaign is None and row.referrer is None,
      str({k: getattr(row, k) for k in ("utm_source", "utm_medium", "utm_campaign", "referrer")}))
db.close()

# ── 3. Migration is additive and preserves rows ────────────────────────────
db_path = os.environ["DATABASE_URL"].replace("sqlite:///", "")
con = sqlite3.connect(db_path)
cols = {row[1] for row in con.execute("PRAGMA table_info(leads)")}
check("four source columns exist",
      {"utm_source", "utm_medium", "utm_campaign", "referrer"} <= cols)
n_before = con.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
migrate()
n_after = con.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
check("migrate preserves row count", n_before == n_after == 2, f"{n_before}->{n_after}")
con.close()

print("PASSED %d checks" % len(passed))
