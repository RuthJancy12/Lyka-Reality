import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Recommendation + scoring regression tests (isolated temp DB).

Covers:
  A. Location hard gate — a lead for a community with no CRM stock
     (e.g. Dubai Silicon Oasis) gets ZERO recommendations instead of
     cross-location properties shown as normal matches. Intent
     (buy/rent) stays a hard filter; type/budget stay soft weights.
  B. Honest priority scoring — a Lead-#3-like enquiry (name, email,
     phone, renter, Apartment, DSO; no budget/bedrooms/timeline)
     scores 50/Medium from actual fields, never 0, and nothing is
     invented (budget/bedrooms/timeline stay None).

Run: python test_recommendation_scoring.py
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
from app.models import CRMProperty, Lead, StaffUser  # noqa: E402
from app.services.lead_service import (  # noqa: E402
    calculate_score, match_properties, _location_matches,
)
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
    prop("CRM-T-MAR-R1", "Dubai Marina", "Rent", rent=7500),
    prop("CRM-T-BB-R1", "Business Bay", "Rent", rent=11500),
    prop("CRM-T-DT-R1", "Downtown Dubai", "Rent", rent=9500),
    prop("CRM-T-MAR-S1", "Dubai Marina", "Sale", sale=2100000),
    prop("CRM-T-JVC-R1", "Jumeirah Village Circle", "Rent", rent=4500),
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
    base = dict(raw_enquiry_text="test enquiry text long enough",
                status="new")
    base.update(kw)
    return Lead(**base)


db = SessionLocal()

# ── A. Location gate (unit level) ──────────────────────────────────────────
dso = lead(customer_name="r", contact_email="r@x.ae", contact_phone="+1",
           lead_type="renter", property_type="Apartment",
           location="Dubai Silicon Oasis")
m = match_properties(dso, db)
check("DSO renter gets zero recs (no stock)", m == [], str([x["property"].ref_code for x in m]))

dso_abbr = lead(raw_enquiry_text="test enquiry text long enough",
                lead_type="renter", location="DSO")
check("DSO abbreviation matches nothing wrong",
      match_properties(dso_abbr, db) == [])

marina_renter = lead(raw_enquiry_text="test enquiry text long enough",
                     lead_type="renter", property_type="Apartment",
                     location="Dubai Marina")
m = match_properties(marina_renter, db)
check("Marina renter only Marina",
      [x["property"].ref_code for x in m] == ["CRM-T-MAR-R1"], str([x["property"].ref_code for x in m]))

marina_buyer = lead(raw_enquiry_text="test enquiry text long enough",
                    lead_type="buyer", location="Dubai Marina")
m = match_properties(marina_buyer, db)
check("buyer intent only Sale",
      [x["property"].ref_code for x in m] == ["CRM-T-MAR-S1"], str([x["property"].ref_code for x in m]))

multi = lead(raw_enquiry_text="test enquiry text long enough",
             lead_type="renter", location="Business Bay, Downtown")
refs = sorted(x["property"].ref_code for x in match_properties(multi, db))
check("multi-location covers both, no Marina",
      refs == ["CRM-T-BB-R1", "CRM-T-DT-R1"], str(refs))

jvc = lead(raw_enquiry_text="test enquiry text long enough",
           lead_type="renter", location="JVC")
check("JVC alias resolves",
      [x["property"].ref_code for x in match_properties(jvc, db)] == ["CRM-T-JVC-R1"])

no_loc = lead(raw_enquiry_text="test enquiry text long enough",
              lead_type="renter")
check("no location still matches (gate skipped)",
      len(match_properties(no_loc, db)) == 3, str(len(match_properties(no_loc, db))))

check("helper rejects cross-location",
      _location_matches("Dubai Silicon Oasis", "Dubai Marina") is False)
check("helper accepts substring",
      _location_matches("Downtown", "Downtown Dubai") is True)
db.close()

# ── B. Honest scoring (unit level, Lead-#3 shape) ───────────────────────────
req3 = {"budget_max": None, "budget_min": None, "location": "Dubai Silicon Oasis",
        "property_type": "Apartment", "bedrooms": None, "lead_type": "renter",
        "timeline_days": None, "amenities": [], "purpose": None}
s = calculate_score(req3)
check("lead3-like scores 50 not 0", s["total"] == 50, str(s))
check("lead3-like label Medium", s["label"] == "Medium", str(s))
check("location 20", s["location"] == 20 and s["property_type_bedrooms"] == 15
      and s["intent"] == 15 and s["budget"] == 0 and s["timeline"] == 0
      and s["preferences"] == 0, str(s))

# ── C. Public API end-to-end (DSO renter, nothing invented) ─────────────────
payload = {
    "customer_name": "ruth",
    "contact_email": "lead3-like@t.ae",
    "contact_phone": "+918754198521",
    "property_ref": "LYK-01711",
    "property_title": "2 BHK Apartment on Silicon Oasis Main Street",
    "location": "Dubai Silicon Oasis",
    "lead_type": "renter",
    "property_type": "Apartment",
    "preferred_date": "2026-10-13",
}
r = client.post("/api/leads/public", json=payload)
check("public DSO 201", r.status_code == 201, r.text[:300])
body = r.json()
lead_id = body["id"]
check("public response minimal", set(body) == {"id", "status"},
      str(sorted(body.keys())))

with as_user("admin@t.ae"):
    ids = [l["id"] for l in client.get("/api/leads").json()["leads"]]
    check("admin lists DSO lead", lead_id in ids, str(ids))
    detail = client.get(f"/api/leads/{lead_id}").json()
    check("detail DSO score 50", detail["priority_score"] == 50,
          str(detail.get("priority_score")))
    check("detail DSO label Medium", detail["priority_label"] == "Medium",
          str(detail.get("priority_label")))
    check("missing honest (no invention)",
          detail["missing_fields"] == ["bedrooms", "budget_max", "timeline_days"],
          str(detail.get("missing_fields")))
    check("budget/bedrooms/timeline stay None",
          detail["bedrooms"] is None and detail["budget_max"] is None
          and detail["budget_min"] is None and detail["timeline_days"] is None,
          str(detail))
    check("no wrong-location recs saved", detail["recommendations"] == [],
          str([x["property"]["ref_code"] for x in detail["recommendations"]]))
    check("score breakdown totals 50",
          detail["score_breakdown"].get("total") == 50,
          str(detail.get("score_breakdown")))
    check("detail recs empty (clear state, not fake match)",
          detail["recommendations"] == [])
    check("detail score persisted 50",
          detail["priority_score"] == 50 and detail["priority_label"] == "Medium")

print("PASSED %d checks" % len(passed))
