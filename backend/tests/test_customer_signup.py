import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Customer sign-up + profile persistence regression test (isolated temp DB).

Covers the enhanced registration/profile system end to end:
  1. PUT creates the UID-owned row with country, full preferences
     (purpose Invest, timeline_days), discovery source, and UTM kept
     separate; role auto-resolves to customer.
  2. A "role" key smuggled in the body is ignored (never user-chosen).
  3. GET restores the identical profile (logout/login or another device).
  4. Ownership: anonymous 401, second account sees null, updates touch
     only permitted fields and keep first-touch attribution.
  5. Validation rejects blank names, overlong country, unlisted discovery
     sources, and out-of-range timelines — with nothing saved.
  6. Preferences round-trip on update; staff directory exposes country.
  7. Additive country migration preserves rows; legacy rows read NULL.

Run: python test_customer_signup.py
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
from app.models import CustomerProfile, Lead, StaffUser  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="admin@t.ae", name="AD", role="admin", is_active=True))
db.add(Lead(raw_enquiry_text="seed lead long enough for validation",
            contact_email="s@x.ae"))
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


FULL = {
    "name": "Elena Rostova",
    "phone": "+971 50 000 0001",
    "city": "Dubai Marina",
    "country": "United Arab Emirates",
    "preferences": {
        "locations": ["Dubai Marina"],
        "propertyType": "Apartment",
        "bedrooms": 2,
        "budgetMin": 1500000,
        "budgetMax": 3000000,
        "purpose": "Invest",
        "timeline_days": 90,
    },
    "discovery_source": "Instagram",
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "spring-launch",
    "referrer": "https://www.google.com/",
}

# ── 1. Creation with everything, role auto-customer ───────────────────────
with as_user("uid-signup-1", "elena@t.ae"):
    r = client.put("/api/customer/profile", json=FULL)
check("create 200", r.status_code == 200, r.text[:300])
body = r.json()
check("role auto customer", body["role"] == "customer", str(body["role"]))
p = body["profile"]
check("identity + country stored",
      (p["name"], p["city"], p["country"]) ==
      ("Elena Rostova", "Dubai Marina", "United Arab Emirates"), str(p))
check("preferences stored incl Invest + timeline",
      p["preferences"].get("purpose") == "Invest"
      and p["preferences"].get("timeline_days") == 90
      and p["preferences"].get("bedrooms") == 2, str(p["preferences"]))
check("discovery + utm separate",
      p["discovery_source"] == "Instagram" and p["utm_source"] == "google"
      and p["utm_campaign"] == "spring-launch", str(p))

# ── 2. Smuggled role is ignored ───────────────────────────────────────────
with as_user("uid-signup-1", "elena@t.ae"):
    r = client.put("/api/customer/profile",
                   json={**FULL, "role": "admin", "name": "Elena R"})
check("role key ignored, still customer",
      r.status_code == 200 and r.json()["role"] == "customer"
      and r.json()["profile"].get("role", "customer") == "customer",
      r.text[:200])

# ── 3. Restoration (fresh read, as after relogin/another device) ─────────
with as_user("uid-signup-1", "elena@t.ae"):
    r = client.get("/api/customer/profile")
check("GET 200", r.status_code == 200, r.text[:200])
rp = r.json()["profile"]
check("profile restored identically",
      rp["country"] == "United Arab Emirates"
      and rp["preferences"].get("timeline_days") == 90
      and rp["discovery_source"] == "Instagram"
      and r.json()["role"] == "customer", str(rp))

# ── 4. Ownership ──────────────────────────────────────────────────────────
check("anon GET 401", client.get("/api/customer/profile").status_code == 401)
check("anon PUT 401",
      client.put("/api/customer/profile", json=FULL).status_code == 401)
with as_user("uid-signup-2", "bob@t.ae"):
    r = client.get("/api/customer/profile")
check("second account sees null", r.json()["profile"] is None, str(r.json()))
db = SessionLocal()
check("exactly one row for UID-1",
      db.query(CustomerProfile).filter(
          CustomerProfile.firebase_uid == "uid-signup-1").count() == 1)
db.close()

# ── 5. Validation failures save nothing ───────────────────────────────────
def count_profiles():
    db = SessionLocal()
    n = db.query(CustomerProfile).count()
    db.close()
    return n

before = count_profiles()
with as_user("uid-bad-1", "bad@t.ae"):
    check("blank name 422",
          client.put("/api/customer/profile",
                     json={**FULL, "name": "  "}).status_code == 422)
    check("long country 422",
          client.put("/api/customer/profile",
                     json={**FULL, "country": "c" * 101}).status_code == 422)
    check("bad discovery 422",
          client.put("/api/customer/profile",
                     json={**FULL, "discovery_source": "TikTok"}).status_code == 422)
    check("negative timeline 422",
          client.put("/api/customer/profile", json={
              **FULL, "preferences": {**FULL["preferences"], "timeline_days": -1},
          }).status_code == 422)
    check("huge timeline 422",
          client.put("/api/customer/profile", json={
              **FULL, "preferences": {**FULL["preferences"], "timeline_days": 99999},
          }).status_code == 422)
check("nothing saved on 422", count_profiles() == before,
      "%d -> %d" % (before, count_profiles()))

# ── 6. Update keeps first-touch, changes permitted fields + prefs ─────────
with as_user("uid-signup-1", "elena@t.ae"):
    r = client.put("/api/customer/profile", json={
        **FULL, "name": "Elena R", "country": "UAE",
        "preferences": {**FULL["preferences"], "purpose": "Buy",
                        "timeline_days": 30},
        "discovery_source": "Facebook", "utm_source": "instagram",
    })
check("update 200", r.status_code == 200, r.text[:200])
p = r.json()["profile"]
check("permitted fields updated",
      p["name"] == "Elena R" and p["country"] == "UAE"
      and p["preferences"]["purpose"] == "Buy"
      and p["preferences"]["timeline_days"] == 30, str(p))
check("first-touch kept",
      p["discovery_source"] == "Instagram" and p["utm_source"] == "google",
      str({k: p.get(k) for k in ("discovery_source", "utm_source")}))

# ── 7. Staff directory shows country (authorized staff only) ──────────────
def as_admin():
    return patch.object(roles, "verify_bearer_token",
                        return_value={"uid": "u-admin", "email": "admin@t.ae"})

with as_admin():
    r = client.get("/api/staff/customers")
check("directory 200", r.status_code == 200, str(r.status_code))
mine = [c for c in r.json() if c.get("email") == "elena@t.ae"]
check("directory exposes country",
      len(mine) == 1 and mine[0].get("country") == "UAE", str(mine))
with as_user("uid-signup-1", "elena@t.ae"):
    check("customer directory 403",
          client.get("/api/staff/customers").status_code == 403)

# ── 8. Migration additive; legacy rows read NULL ──────────────────────────
db = SessionLocal()
legacy = CustomerProfile(firebase_uid="uid-legacy-1", email="leg@t.ae",
                         name="Legacy")
db.add(legacy)
db.commit()
db.close()
db = SessionLocal()
check("legacy row country NULL",
      db.query(CustomerProfile).filter(
          CustomerProfile.firebase_uid == "uid-legacy-1").first().country is None)
check("seed lead + staff intact",
      db.query(Lead).count() == 1
      and db.query(StaffUser).filter(StaffUser.email == "admin@t.ae").count() == 1)
db.close()

db_path = os.environ["DATABASE_URL"].replace("sqlite:///", "")
con = sqlite3.connect(db_path)
cols = {row[1] for row in con.execute("PRAGMA table_info(customer_profiles)")}
check("country column exists", "country" in cols)
n_before = con.execute("SELECT COUNT(*) FROM customer_profiles").fetchone()[0]
migrate()
n_after = con.execute("SELECT COUNT(*) FROM customer_profiles").fetchone()[0]
check("migrate preserves rows", n_before == n_after, f"{n_before}->{n_after}")
con.close()

print("PASSED %d checks" % len(passed))
