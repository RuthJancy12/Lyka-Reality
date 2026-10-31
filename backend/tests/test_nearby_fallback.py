import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Nearby-fallback regression test (isolated temp DB).

Verifies the intelligent recommendation engine:
  1. Exact-location matches rank first and are NOT flagged nearby.
  2. Zero exact stock -> alternatives from explicitly mapped neighbours
     (DSO -> Mirdif), labelled is_nearby with the actual community named
     and no location-mismatch warnings.
  3. Non-neighbour communities are never suggested (DT excluded for DSO).
  4. Budget/bedroom/intent filters apply to nearby results too.
  5. Unknown locations have no fallback (honest empty, stale cleared).
  6. Dataset search falls back the same way with honest flags; exact
     searches never carry the nearby label.

Run: python test_nearby_fallback.py
"""
import os
import tempfile
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import CRMProperty, Lead, Recommendation, StaffUser  # noqa: E402
from app.services.lead_service import match_properties  # noqa: E402
from app.services.nearby import nearby_communities_for, resolve_community  # noqa: E402
from app.services.property_service import search_properties_dataset  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="admin@t.ae", name="AD", role="admin", is_active=True))


def prop(ref, location, listing_type, property_type="Apartment", bedrooms=1,
         sale=None, rent=None):
    return CRMProperty(
        ref_code=ref, title=f"[TEST] {ref}", property_type=property_type,
        listing_type=listing_type, location=location, bedrooms=bedrooms,
        bathrooms=1, size_sqft=800, price_sale=sale,
        price_rent_monthly=rent, is_available=True,
    )


db.add_all([
    prop("CRM-N-MAR-R1", "Dubai Marina", "Rent", bedrooms=1, rent=7500),
    prop("CRM-N-MAR-R2", "Dubai Marina", "Rent", bedrooms=2, rent=12000),
    prop("CRM-N-MAR-S1", "Dubai Marina", "Sale", bedrooms=2, sale=2100000),
    prop("CRM-N-MIR-R1", "Mirdif", "Rent", bedrooms=1, rent=4500),
    prop("CRM-N-MIR-R2", "Mirdif", "Rent", bedrooms=3, rent=20000),
    prop("CRM-N-MIR-S1", "Mirdif", "Sale", "Villa", bedrooms=4, sale=4500000),
    prop("CRM-N-DT-R1", "Downtown Dubai", "Rent", bedrooms=1, rent=9500),
])
db.commit()
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


def as_user(email, uid=None):
    return patch.object(roles, "verify_bearer_token",
                        return_value={"uid": uid or ("u-" + email), "email": email})


def lead(**kw):
    base = dict(raw_enquiry_text="nearby fallback test enquiry long enough",
                status="new")
    base.update(kw)
    return Lead(**base)


# ── 0. Map resolution ──────────────────────────────────────────────────────
check("DSO neighbours mapped",
      nearby_communities_for("Dubai Silicon Oasis") == ["Mirdif", "Dubai Creek Harbour"],
      str(nearby_communities_for("Dubai Silicon Oasis")))
check("abbreviation resolves", resolve_community("DSO") == "dubai silicon oasis")
check("unknown has no fallback", nearby_communities_for("Lonely Island") == [])
check("vague Dubai has no fallback", nearby_communities_for("Dubai") == [])

db = SessionLocal()

# ── 1. Exact matches first, unflagged ───────────────────────────────────────
m = match_properties(lead(lead_type="renter", property_type="Apartment",
                          location="Dubai Marina", bedrooms=1), db)
check("exact Marina all Marina",
      len(m) > 0 and all(x["property"].location == "Dubai Marina" for x in m),
      str([(x["property"].ref_code, x["is_nearby"]) for x in m]))
check("exact not flagged nearby", all(x["is_nearby"] is False for x in m))

# ── 2/3. Fallback labelled, non-neighbours excluded ─────────────────────────
m = match_properties(lead(lead_type="renter", property_type="Apartment",
                          location="Dubai Silicon Oasis", bedrooms=1,
                          budget_max=6000), db)
refs = [x["property"].ref_code for x in m]
check("fallback returns Mirdif", "CRM-N-MIR-R1" in refs, str(refs))
check("non-neighbour DT excluded", "CRM-N-DT-R1" not in refs, str(refs))
check("all fallback flagged", all(x["is_nearby"] is True for x in m), str(refs))
first = m[0]
check("fallback names actual community",
      "No exact match in Dubai Silicon Oasis" in first["match_explanation"]
      and "Mirdif" in first["match_explanation"],
      first["match_explanation"][:200])
check("no location-mismatch warnings on alternatives",
      all(not any(s.startswith("Location mismatch") for s in x["mismatches"]) for x in m),
      str([x["mismatches"] for x in m]))

# ── 4. Bedroom + budget rank nearby ─────────────────────────────────────────
m = match_properties(lead(lead_type="renter",
                          location="Dubai Silicon Oasis", bedrooms=1,
                          budget_max=6000), db)
check("affordable 1BR ranks above pricey 3BR",
      [x["property"].ref_code for x in m][0] == "CRM-N-MIR-R1",
      str([x["property"].ref_code for x in m]))

# ── 5. Intent applies to nearby ─────────────────────────────────────────────
m = match_properties(lead(lead_type="buyer", location="Dubai Silicon Oasis"), db)
check("buyer fallback only Sale",
      len(m) > 0 and all(x["property"].listing_type == "Sale" for x in m),
      str([(x["property"].ref_code, x["property"].listing_type) for x in m]))

# ── 6. Unknown location -> honest empty ─────────────────────────────────────
m = match_properties(lead(lead_type="renter", location="Lonely Island"), db)
check("unknown location empty", m == [], str(len(m)))
db.close()

# ── 7. Dataset search: exact untouched, fallback flagged ────────────────────
exact = search_properties_dataset(
    location="Dubai Marina", property_type="Apartment", bedrooms=2,
    max_budget_aed=2000000, purpose="Sale", limit=3)
check("dataset exact has rows", len(exact["top_properties"]) > 0)
check("dataset exact no fallback flag",
      exact["fallback"]["used"] is False
      and all(not p.get("is_nearby_alternative") for p in exact["top_properties"]))

zero = search_properties_dataset(
    location="Dubai Silicon Oasis", bedrooms=5, max_budget_aed=700000,
    purpose="Rent", limit=3, nearby_fallback=False)
check("precondition: zero exact DSO 5BR rent under 700k",
      zero["total_found"] == 0, str(zero["total_found"]))

fb = search_properties_dataset(
    location="Dubai Silicon Oasis", bedrooms=5, max_budget_aed=700000,
    purpose="Rent", limit=3)
rows = fb["top_properties"]
check("dataset fallback returns rows", len(rows) > 0, "no nearby 6BR rent stock?")
check("fallback flagged + requested named",
      all(p.get("is_nearby_alternative") is True for p in rows)
      and all(p.get("requested_location") == "Dubai Silicon Oasis" for p in rows),
      str([(p.get("location"), p.get("is_nearby_alternative")) for p in rows]))
check("fallback only mapped neighbours",
      all((p.get("actual_location") or "") in ("Mirdif", "Dubai Creek Harbour") for p in rows),
      str([p.get("actual_location") for p in rows]))
check("fallback respects intent+bedrooms+budget",
      all(p.get("listing_type") == "Rent" and p.get("bhk") == 5
          and (p.get("price_aed") or 0) <= 700000 for p in rows),
      str([(p.get("listing_type"), p.get("bhk"), p.get("price_aed")) for p in rows]))
check("fallback reasons honest",
      all("Nearby alternative" in (p.get("match_reasons") or [""])[0]
          or any("Nearby alternative" in r for r in (p.get("match_reasons") or []))
          for p in rows),
      str([p.get("match_reasons") for p in rows]))
check("fallback rows are real dataset ids",
      all(str(p.get("property_id", "")).startswith("LYK-") for p in rows))

# ── 8. Refresh persists flags, clears stale, keeps score ────────────────────
db = SessionLocal()
dso = lead(customer_name="nb", contact_email="nb-fallback@t.ae",
           lead_type="renter", property_type="Apartment",
           location="Dubai Silicon Oasis", bedrooms=1, budget_max=6000,
           priority_score=50, priority_label="Medium",
           score_breakdown={"total": 50, "label": "Medium"}, status="new")
db.add(dso)
db.commit()
mar = db.query(CRMProperty).filter(CRMProperty.ref_code == "CRM-N-MAR-R1").first()
mar_id = mar.id
db.add(Recommendation(lead_id=dso.id, property_id=mar_id, match_score=40.0,
                      match_explanation="stale pre-fallback row", mismatches=[]))
db.commit()
dso_id = dso.id

lone = lead(customer_name="nb2", contact_email="nb-lonely@t.ae",
            lead_type="renter", location="Lonely Island",
            priority_score=20, priority_label="Low",
            score_breakdown={"total": 20, "label": "Low"}, status="new")
db.add(lone)
db.commit()
db.add(Recommendation(lead_id=lone.id, property_id=mar_id, match_score=40.0,
                      match_explanation="stale row", mismatches=[]))
db.commit()
lone_id = lone.id
db.close()

with as_user("admin@t.ae"):
    r = client.post(f"/api/leads/{dso_id}/recommendations")
    check("refresh DSO 200", r.status_code == 200, r.text[:200])
    recs = r.json()["recommendations"]
    check("refresh returns flagged nearby",
          len(recs) > 0 and all(x["is_nearby"] is True for x in recs),
          str([(x["property"]["ref_code"], x.get("is_nearby")) for x in recs]))
    check("refresh names actual community",
          "Mirdif" in recs[0]["match_explanation"], recs[0]["match_explanation"][:200])
    check("refresh keeps 50/Medium",
          r.json()["priority_score"] == 50 and r.json()["priority_label"] == "Medium")
    db = SessionLocal()
    stored = db.query(Recommendation).filter(Recommendation.lead_id == dso_id).all()
    check("stale Marina row replaced",
          all(s.property_id != mar_id for s in stored) and len(stored) == len(recs),
          str([(s.property_id, s.is_nearby) for s in stored]))
    check("flags persisted", all(s.is_nearby is True for s in stored))
    db.close()

    r = client.post(f"/api/leads/{lone_id}/recommendations")
    check("unknown-location refresh 200 + empty",
          r.status_code == 200 and r.json()["recommendations"] == [])
    check("unknown-location score preserved",
          r.json()["priority_score"] == 20 and r.json()["priority_label"] == "Low")
    db = SessionLocal()
    check("unknown-location stale cleared",
          db.query(Recommendation).filter(Recommendation.lead_id == lone_id).count() == 0)
    db.close()

print("PASSED %d checks" % len(passed))
