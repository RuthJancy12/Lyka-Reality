import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Discovery-source (self-reported acquisition) regression test (isolated temp DB).

Verifies the "How did you hear about LYKA Realty?" field end to end:
  1. Public enquiry persists discovery_source on the Lead and returns it
     via the admin detail API; automatic UTM/referrer travel alongside
     in separate columns (never mixed).
  2. Missing discovery_source stays NULL (never invented).
  3. Unlisted discovery_source values are rejected with 422; nothing saved.
  4. Customer profile create stores the source; later updates keep the
     first-touch answer (never overwritten) while permitted fields change.
  5. Ownership: anonymous 401; second account cannot read the first row.
  6. Existing records stay compatible; the additive migration adds the
     column without touching rows; staff customer directory exposes it.

Run: python test_discovery_source.py
"""
import os
import sqlite3
import tempfile
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db, migrate  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Lead, StaffUser  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="admin@t.ae", name="AD", role="admin", is_active=True))
db.commit()
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


def as_user(uid, email):
    return patch.object(roles, "verify_bearer_token",
                        return_value={"uid": uid, "email": email})


def as_admin():
    return patch.object(roles, "verify_bearer_token",
                        return_value={"uid": "u-admin", "email": "admin@t.ae"})


# ── 1. Public enquiry persists self-reported source, UTM separate ──────────
r = client.post("/api/leads/public", json={
    "customer_name": "Hear About",
    "contact_email": "hear-about@t.ae",
    "discovery_source": "Friend/Referral",
    "utm_source": "google",
    "utm_medium": "cpc",
    "referrer": "https://www.google.com/",
})
check("public 201 with discovery_source", r.status_code == 201, r.text[:300])
body = r.json()
lead_id = body["id"]
check("public response minimal", set(body) == {"id", "status"},
      str(sorted(body.keys())))

db = SessionLocal()
row = db.query(Lead).filter(Lead.id == lead_id).first()
check("discovery stored on lead",
      row is not None and row.discovery_source == "Friend/Referral"
      and row.utm_source == "google")
check("utm kept separate",
      row is not None and row.utm_source == "google"
      and row.referrer == "https://www.google.com/",
      str({k: getattr(row, k, None) for k in ("utm_source", "referrer")}))
db.close()

with as_admin():
    r1 = client.get(f"/api/leads/{lead_id}")
check("admin detail shows discovery",
      r1.status_code == 200 and r1.json().get("discovery_source") == "Friend/Referral",
      str(r1.status_code))

# ── 2. Missing stays NULL ──────────────────────────────────────────────────
r = client.post("/api/leads/public", json={
    "customer_name": "No Answer",
    "contact_email": "hear-none@t.ae",
})
check("public 201 without discovery", r.status_code == 201, r.text[:200])
lead_id = r.json()["id"]
db = SessionLocal()
row = db.query(Lead).filter(Lead.id == lead_id).first()
check("missing discovery null, not invented",
      row is not None and row.discovery_source is None,
      str(getattr(row, "discovery_source", None)))
db.close()

# ── 3. Invalid values rejected ─────────────────────────────────────────────
with as_admin():
    before = client.get("/api/leads").json()["total"]
bad = {"customer_name": "Bad Src", "contact_email": "hear-bad@t.ae",
       "discovery_source": "TikTok"}
check("invalid discovery 422",
      client.post("/api/leads/public", json=bad).status_code == 422)
with as_admin():
    check("no rows on 422", client.get("/api/leads").json()["total"] == before)

# ── 4. Customer profile: create + first-touch + ownership ──────────────────
check("anon profile PUT 401",
      client.put("/api/customer/profile",
                 json={"name": "Sara", "discovery_source": "Google"}).status_code == 401)

with as_user("uid-hear-1", "sara@t.ae"):
    r = client.put("/api/customer/profile", json={
        "name": "Sara Ahmed", "city": "Dubai Marina",
        "discovery_source": "Instagram",
        "utm_source": "google",
    })
check("profile PUT 200", r.status_code == 200, r.text[:300])
p = r.json()["profile"]
check("profile discovery stored",
      p["discovery_source"] == "Instagram", str(p.get("discovery_source")))
check("profile utm separate",
      p["utm_source"] == "google", str(p.get("utm_source")))

# Persistence after refresh/login: GET returns the same answer.
with as_user("uid-hear-1", "sara@t.ae"):
    r = client.get("/api/customer/profile")
check("profile GET persists discovery",
      r.status_code == 200 and r.json()["profile"]["discovery_source"] == "Instagram")

# Second answer must NOT overwrite the first-touch value.
with as_user("uid-hear-1", "sara@t.ae"):
    r = client.put("/api/customer/profile", json={
        "name": "Sara K", "discovery_source": "Facebook",
    })
check("update keeps first-touch discovery",
      r.status_code == 200 and r.json()["profile"]["discovery_source"] == "Instagram"
      and r.json()["profile"]["name"] == "Sara K",
      str({k: r.json()["profile"].get(k) for k in ("name", "discovery_source")}))

with as_user("uid-hear-1", "sara@t.ae"):
    check("invalid profile discovery 422",
          client.put("/api/customer/profile",
                     json={"name": "Sara", "discovery_source": "TikTok"}).status_code == 422)

# Second account cannot read the first account's row.
with as_user("uid-hear-2", "bob@t.ae"):
    r = client.get("/api/customer/profile")
check("cross-account isolation", r.json()["profile"] is None, str(r.json()))

# ── 5. Existing records compatible + migration additive ────────────────────
db = SessionLocal()
legacy = Lead(raw_enquiry_text="legacy enquiry text long enough",
              contact_email="legacy@t.ae")
db.add(legacy)
db.commit()
legacy_id = legacy.id
db.close()
db = SessionLocal()
check("legacy lead reads with null discovery",
      db.query(Lead).filter(Lead.id == legacy_id).first().discovery_source is None)
db.close()

db_path = os.environ["DATABASE_URL"].replace("sqlite:///", "")
con = sqlite3.connect(db_path)
cols = {row[1] for row in con.execute("PRAGMA table_info(leads)")}
check("leads discovery column exists", "discovery_source" in cols)
pcols = {row[1] for row in con.execute("PRAGMA table_info(customer_profiles)")}
check("profiles discovery column exists", "discovery_source" in pcols)
n_before = con.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
migrate()
n_after = con.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
check("migrate preserves rows", n_before == n_after, f"{n_before}->{n_after}")
con.close()

# ── 6. Staff directory exposes the self-reported source ────────────────────
with as_admin():
    r = client.get("/api/staff/customers")
check("staff customers 200", r.status_code == 200, str(r.status_code) + r.text[:200])
mine = [c for c in r.json() if c.get("email") == "sara@t.ae"]
check("directory shows discovery",
      len(mine) == 1 and mine[0].get("discovery_source") == "Instagram",
      str(mine))

print("PASSED %d checks" % len(passed))
