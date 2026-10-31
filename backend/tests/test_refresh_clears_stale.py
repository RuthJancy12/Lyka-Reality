import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Stale-recommendation regression test (isolated temp DB).

Reproduces Lead #3's state: a Dubai Silicon Oasis renter lead with three
stale cross-location recommendation rows stored from before the location
gate. Verifies that POST /api/leads/{id}/recommendations (used by both
Find Properties and Refresh) returns an empty list, deletes the stale
rows so old cards clear, preserves score/status/assignment data, and
that a lead WITH local stock keeps fresh recommendations.

Run: python test_refresh_clears_stale.py
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
from app.models import Activity, CRMProperty, Lead, Recommendation, StaffUser  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="admin@t.ae", name="AD", role="admin", is_active=True))


def prop(ref, location, listing_type, rent=None, sale=None):
    return CRMProperty(
        ref_code=ref, title=f"[TEST] {ref}", property_type="Apartment",
        listing_type=listing_type, location=location, bedrooms=1,
        bathrooms=1, size_sqft=800, price_sale=sale,
        price_rent_monthly=rent, is_available=True,
    )


p_mar = prop("CRM-S-MAR-R1", "Dubai Marina", "Rent", rent=7500)
p_bb = prop("CRM-S-BB-R1", "Business Bay", "Rent", rent=11500)
p_dt = prop("CRM-S-DT-R1", "Downtown Dubai", "Rent", rent=9500)
db.add_all([p_mar, p_bb, p_dt])
db.commit()

# Lead #3 shape: DSO renter, score already 50/Medium (must be preserved).
dso = Lead(
    raw_enquiry_text="Public website enquiry from ruth. DSO rent apartment. Long enough text.",
    customer_name="ruth", contact_email="ruth-stale@t.ae",
    contact_phone="+918754198521", lead_type="renter",
    property_type="Apartment", location="Dubai Silicon Oasis",
    priority_score=50, priority_label="Medium",
    score_breakdown={"total": 50, "label": "Medium"},
    missing_fields=["bedrooms", "budget_max", "timeline_days"],
    status="new",
)
db.add(dso)
db.commit()
# Three STALE cross-location rows, as currently stored for Lead #3.
for p in (p_mar, p_bb, p_dt):
    db.add(Recommendation(lead_id=dso.id, property_id=p.id,
                          match_score=40.0, match_explanation="stale",
                          mismatches=["Location mismatch"]))
db.commit()
dso_id = dso.id

# Positive control: Marina renter with one stale row pointing at Business Bay.
marina = Lead(
    raw_enquiry_text="Marina renter wants an apartment. Long enough text here.",
    customer_name="m", contact_email="marina-fresh@t.ae",
    lead_type="renter", property_type="Apartment", location="Dubai Marina",
    priority_score=50, priority_label="Medium",
    score_breakdown={"total": 50, "label": "Medium"},
    status="new",
)
db.add(marina)
db.commit()
db.add(Recommendation(lead_id=marina.id, property_id=p_bb.id,
                      match_score=40.0, match_explanation="stale wrong",
                      mismatches=["Location mismatch"]))
db.commit()
marina_id = marina.id
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


with as_user("admin@t.ae"):
    # Precondition: stale cards are currently served.
    before = client.get(f"/api/leads/{dso_id}").json()
    check("precondition: 3 stale cards served", len(before["recommendations"]) == 3,
          str(len(before["recommendations"])))

    # The fix: refresh returns [] (both Find Properties and Refresh hit this).
    r = client.post(f"/api/leads/{dso_id}/recommendations")
    check("refresh DSO 200", r.status_code == 200, r.text[:300])
    check("refresh DSO returns empty list", r.json()["recommendations"] == [],
          str([x["property"]["ref_code"] for x in r.json()["recommendations"]]))

    # Stale rows are gone from storage; a re-fetch stays empty (cards clear).
    after = client.get(f"/api/leads/{dso_id}").json()
    check("detail empty after refresh", after["recommendations"] == [])

    db = SessionLocal()
    leftovers = db.query(Recommendation).filter(Recommendation.lead_id == dso_id).count()
    check("stale rows deleted", leftovers == 0, str(leftovers))
    fresh = db.query(Lead).filter(Lead.id == dso_id).first()
    check("score preserved 50/Medium",
          fresh.priority_score == 50 and fresh.priority_label == "Medium",
          f"{fresh.priority_score}/{fresh.priority_label}")
    check("status/contact preserved",
          fresh.status == "new" and fresh.customer_name == "ruth"
          and fresh.location == "Dubai Silicon Oasis", fresh.status)
    notes = [a.notes for a in db.query(Activity)
             .filter(Activity.lead_id == dso_id)
             .filter(Activity.activity_type == "recommendation_sent").all()]
    check("no-match activity logged",
          any("No matching" in (n or "") for n in notes), str(notes))
    db.close()

    # Positive control: lead WITH local stock gets fresh, replaced recs.
    r2 = client.post(f"/api/leads/{marina_id}/recommendations")
    check("refresh Marina 200", r2.status_code == 200, r2.text[:300])
    refs = [x["property"]["ref_code"] for x in r2.json()["recommendations"]]
    check("Marina refresh only Marina (stale BB replaced)",
          refs == ["CRM-S-MAR-R1"], str(refs))

    # Second refresh on the now-empty DSO lead is idempotent.
    r3 = client.post(f"/api/leads/{dso_id}/recommendations")
    check("second refresh still 200 + empty",
          r3.status_code == 200 and r3.json()["recommendations"] == [])

# Auth gates unchanged.
check("refresh anonymous 401",
      client.post(f"/api/leads/{dso_id}/recommendations").status_code == 401)
with as_user("buyer@gmail.com"):
    check("refresh customer 403",
          client.post(f"/api/leads/{dso_id}/recommendations").status_code == 403)

print("PASSED %d checks" % len(passed))
