import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""End-to-end regression test for property advertising analytics.

Uses an isolated temporary database but the REAL 3,000-row Dubai catalogue.
Covers:
  * idempotent ad-registry seeding from existing listings (no new properties)
  * server-side pagination/filter/sort and date ranges
  * public impression/view/WhatsApp deduplication
  * enquiry/booking/viewing conversion events written only by owner flows
  * pause/resume and public catalogue exclusion
  * CRM create/update mirroring without losing an explicit pause
  * auth gates and validation

Run from backend/:  .venv\\Scripts\\python.exe test_property_ads_analytics.py
"""
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Lead, PropertyAd, PropertyAdEvent, StaffUser, Viewing  # noqa: E402
from app.services import property_analytics  # noqa: E402
from app.services import property_service  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
property_service.init_property_dataset()

db = SessionLocal()
db.add_all([
    StaffUser(email="admin@ads.test", name="Admin", role="admin", is_active=True),
    StaffUser(email="sales@ads.test", name="Sales", role="salesperson", is_active=True),
])
db.commit()
seed = property_analytics.seed_property_ads(db)
total_ads = db.query(PropertyAd).count()
sample = db.query(PropertyAd).order_by(PropertyAd.property_ref).first()
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


def as_user(email):
    return patch.object(
        roles, "verify_bearer_token",
        return_value={"uid": "uid-" + email, "email": email},
    )


def overview(range_key="month", start=None, end=None):
    params = {"range": range_key}
    if start:
        params["start"] = start
    if end:
        params["end"] = end
    return client.get("/api/property-analytics/overview", params=params)


# 1. Registry mirrors the real catalogue, no invented properties.
check("catalogue seeded", total_ads >= 3000, "total=%s" % total_ads)
check("seed inserted real rows", seed["inserted"] >= 3000, str(seed))
check("sample is real LYK id", sample is not None and sample.property_ref.startswith("LYK-"), str(sample))

# Re-seeding is idempotent.
db = SessionLocal()
seed_again = property_analytics.seed_property_ads(db)
check("seed idempotent", db.query(PropertyAd).count() == total_ads, str(seed_again))
db.close()
check("no reinserts", seed_again["inserted"] == 0, str(seed_again))

# 2. Anonymous auth gates.
check("overview anonymous 401", client.get("/api/property-analytics/overview").status_code == 401)
check("ads anonymous 401", client.get("/api/property-analytics/ads").status_code == 401)
check("filters anonymous 401", client.get("/api/property-analytics/filters").status_code == 401)

with as_user("admin@ads.test"):
    # 3. Server-side pagination/sorting/filtering.
    r = client.get("/api/property-analytics/ads", params={"page": 2, "per_page": 25})
    check("ads endpoint 200", r.status_code == 200, r.text[:300])
    payload = r.json()
    check("page size enforced server-side", len(payload["items"]) == 25, str(len(payload["items"])))
    check("page number echoed", payload["page"] == 2)
    check("totals are complete", payload["total"] == total_ads, str(payload["total"]))

    r = client.get("/api/property-analytics/ads", params={"search": sample.property_ref})
    check("search finds exact ref", r.status_code == 200 and r.json()["total"] >= 1, r.text[:200])

    loc = sample.location
    r = client.get("/api/property-analytics/ads", params={"location": loc, "per_page": 100})
    check("location filter applied", r.status_code == 200 and r.json()["total"] >= 1, r.text[:200])
    check("location rows match", all(loc.lower() in i["location"].lower() for i in r.json()["items"]))

    r = client.get("/api/property-analytics/ads", params={"min_price": 10_000_000, "max_price": 20_000_000, "per_page": 100})
    check("price filter applied", r.status_code == 200, r.text[:200])
    check("price rows in range", all(10_000_000 <= i["price_aed"] <= 20_000_000 for i in r.json()["items"]))

    r = client.get("/api/property-analytics/ads", params={"sort": "price_desc", "per_page": 100})
    prices = [i["price_aed"] for i in r.json()["items"]]
    check("price sort descending", prices == sorted(prices, reverse=True))

    r = client.get("/api/property-analytics/filters")
    check("filters 200", r.status_code == 200, r.text[:200])
    check("real locations returned", sample.location in r.json()["locations"], str(r.json()["locations"][:5]))

    r = overview("today")
    check("overview today 200", r.status_code == 200, r.text[:300])
    check("active listings KPI", r.json()["active_listings"] == total_ads, str(r.json()))

    r = overview("custom", "2026-01-01", "2026-01-31")
    check("custom range 200", r.status_code == 200, r.text[:300])
    check("custom range key", r.json()["range"]["key"] == "custom")

    bad = overview("custom", "2026-02-01", "2026-01-01")
    check("reversed range 400", bad.status_code == 400, bad.text[:200])
    bad2 = overview("nonsense")
    check("bad range 400", bad2.status_code == 400, bad2.text[:200])

# 4. Public interaction events + dedupe.
ref = sample.property_ref
body = {"property_ref": ref, "event_type": "impression", "visitor_id": "visitor-a", "context": "card"}
r = client.post("/api/property-analytics/events", json=body)
check("impression accepted", r.status_code == 202 and r.json()["counted"] is True, r.text[:300])
r2 = client.post("/api/property-analytics/events", json=body)
check("duplicate impression deduped", r2.status_code == 202 and r2.json()["duplicate"] is True, r2.text[:300])
r3 = client.post("/api/property-analytics/events", json={**body, "visitor_id": "visitor-b"})
check("different visitor counted", r3.json()["counted"] is True)

for event_type, context in (("view", "modal"), ("whatsapp_click", "whatsapp")):
    r = client.post("/api/property-analytics/events", json={
        "property_ref": ref, "event_type": event_type,
        "visitor_id": "visitor-a", "context": context,
    })
    check("%s accepted" % event_type, r.status_code == 202 and r.json()["counted"] is True, r.text[:200])
    r = client.post("/api/property-analytics/events", json={
        "property_ref": ref, "event_type": event_type,
        "visitor_id": "visitor-a", "context": context,
    })
    check("%s deduped" % event_type, r.json()["duplicate"] is True, r.text[:200])

check("system event rejected", client.post("/api/property-analytics/events", json={
    "property_ref": ref, "event_type": "booking", "visitor_id": "visitor-a",
}).status_code == 422)
check("unknown listing rejected", client.post("/api/property-analytics/events", json={
    "property_ref": "LYK-999999", "event_type": "view", "visitor_id": "visitor-a",
}).status_code == 404)

with as_user("admin@ads.test"):
    agg = overview("month").json()
check("impressions aggregated", agg["impressions"] >= 2, str(agg))
check("views aggregated", agg["views"] >= 1, str(agg))
check("unique views reported", agg["unique_views"] >= 1, str(agg))
check("whatsapp aggregated", agg["whatsapp_clicks"] >= 1, str(agg))

# 5. Enquiry from the real public flow.
enquiry = {
    "customer_name": "Analytics Buyer",
    "contact_email": "analytics.buyer@example.com",
    "property_ref": ref,
    "property_title": sample.title,
}
r = client.post("/api/leads/public", json=enquiry)
check("public enquiry saved", r.status_code == 201, r.text[:400])
lead_id = r.json()["id"]
check("public response minimal", set(r.json()) == {"id", "status"},
      str(sorted(r.json().keys())))

db = SessionLocal()
check("enquiry event stored", db.query(PropertyAdEvent).filter(
    PropertyAdEvent.event_type == "enquiry",
    PropertyAdEvent.lead_id == lead_id,
).count() == 1)
check("lead property_ref persisted", db.query(Lead).filter(Lead.id == lead_id).first().property_ref == ref)
db.close()

with as_user("admin@ads.test"):
    agg = overview("month").json()
    check("enquiry KPI", agg["enquiries"] == 1, str(agg))
    check("no booking yet", agg["bookings"] == 0, str(agg))
    check("conversion zero", agg["enquiry_conversion_rate"] == 0.0, str(agg))

    # 6. Closed lead = successful booking; reopening removes it.
    r = client.patch(f"/api/leads/{lead_id}/status", json={"status": "closed", "notes": "deal signed"})
    check("lead closed", r.status_code == 200 and r.json()["status"] == "closed", r.text[:300])
    agg = overview("month").json()
    check("booking counted", agg["bookings"] == 1, str(agg))
    check("conversion 100%", agg["enquiry_conversion_rate"] == 100.0, str(agg))

    r = client.patch(f"/api/leads/{lead_id}/status", json={"status": "qualified", "notes": "reopened"})
    check("lead reopened", r.status_code == 200)
    agg = overview("month").json()
    check("booking removed on reopen", agg["bookings"] == 0, str(agg))

    r = client.patch(f"/api/leads/{lead_id}/status", json={"status": "closed", "notes": "reclosed"})
    agg = overview("month").json()
    check("booking re-counted once", agg["bookings"] == 1, str(agg))

    # 7. Scheduled viewing event + cancellation removal.
    r = client.post("/api/staff/viewings", json={
        "lead_id": lead_id,
        "property_ref": ref,
        "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
    })
    check("viewing created", r.status_code == 201, r.text[:300])
    viewing_id = r.json()["id"]
    agg = overview("month").json()
    check("site visit counted", agg["site_visits"] == 1, str(agg))

    r = client.patch(f"/api/staff/viewings/{viewing_id}", json={"status": "cancelled"})
    check("viewing cancelled", r.status_code == 200, r.text[:200])
    agg = overview("month").json()
    check("cancelled visit removed", agg["site_visits"] == 0, str(agg))

    # 8. Pause/resume and public catalogue exclusion.
    db = SessionLocal()
    second = db.query(PropertyAd).filter(PropertyAd.property_ref != ref).order_by(PropertyAd.property_ref).first()
    db.close()
    second_ref = second.property_ref
    r = client.patch(f"/api/property-analytics/ads/{second_ref}", json={"is_active": False})
    check("ad paused", r.status_code == 200 and r.json()["is_active"] is False, r.text[:200])
    check("paused public event 404", client.post("/api/property-analytics/events", json={
        "property_ref": second_ref, "event_type": "view", "visitor_id": "visitor-p",
    }).status_code == 404)
    check("paused listing hidden from catalogue", property_service.get_property_by_id(second_ref) is None)
    check("paused listing excluded from search", all(
        p["property_id"] != second_ref
        for p in property_service.search_properties_dataset(location=second.location, limit=250)["top_properties"]
    ))

    r = client.patch(f"/api/property-analytics/ads/{second_ref}", json={"is_active": True})
    check("ad resumed", r.status_code == 200 and r.json()["is_active"] is True, r.text[:200])

# Salesperson can read, cannot pause.
with as_user("sales@ads.test"):
    check("salesperson overview allowed", overview("month").status_code == 200)
    check("salesperson pause forbidden", client.patch(
        f"/api/property-analytics/ads/{ref}", json={"is_active": False}
    ).status_code == 403)

# 9. CRM create/update mirroring and pause preservation.
with as_user("admin@ads.test"):
    crm_payload = {
        "ref_code": "CRM-ADS01",
        "title": "Analytics Test Residence",
        "property_type": "Apartment",
        "listing_type": "Sale",
        "location": "Dubai Marina",
        "community": "Marina Gate",
        "bedrooms": 2,
        "bathrooms": 2,
        "size_sqft": 1200,
        "price_sale": 2500000,
        "is_available": True,
    }
    r = client.post("/api/properties", json=crm_payload)
    check("CRM property created", r.status_code == 201, r.text[:400])

    db = SessionLocal()
    crm_ad = db.query(PropertyAd).filter(PropertyAd.property_ref == "CRM-ADS01").first()
    check("CRM ad mirrored", crm_ad is not None and crm_ad.source == "crm")
    db.close()

    r = client.patch("/api/property-analytics/ads/CRM-ADS01", json={"is_active": False})
    check("CRM ad paused", r.status_code == 200)
    crm_id = client.get("/api/properties", params={"available_only": False}).json()[-1]["id"]
    r = client.patch(f"/api/properties/{crm_id}", json={"price_sale": 2600000})
    check("CRM property updated", r.status_code == 200, r.text[:300])
    db = SessionLocal()
    crm_ad = db.query(PropertyAd).filter(PropertyAd.property_ref == "CRM-ADS01").first()
    check("CRM ad price synced", crm_ad.price_aed == 2600000, str(crm_ad.price_aed))
    check("explicit pause preserved on sync", crm_ad.is_active is False, str(crm_ad.is_active))
    db.close()

# 10. Backfill must work with the app's autoflush=False session: a legacy
# lead whose ref is inferred in-memory must also get its event in one pass.
db = SessionLocal()
legacy = Lead(
    raw_enquiry_text="Legacy enquiry about %s from an imported record." % ref,
    customer_name="Legacy Buyer",
    contact_email="legacy.ads@example.com",
    status="new",
)
db.add(legacy)
db.commit()
legacy_id = legacy.id
db.close()

db = SessionLocal()
backfill = property_analytics.backfill_events(db)
legacy_events = db.query(PropertyAdEvent).filter(
    PropertyAdEvent.lead_id == legacy_id,
    PropertyAdEvent.event_type == "enquiry",
).count()
db.close()
check("legacy ref inferred", backfill["lead_refs"] >= 1, str(backfill))
check("legacy enquiry event created in one pass", legacy_events == 1, str(backfill))

# 11. Performance on the full real catalogue (database + FastAPI routing).
with as_user("admin@ads.test"):
    times = []
    for page in (1, 25, 60, 100):
        t0 = time.perf_counter()
        rr = client.get("/api/property-analytics/ads", params={"page": page, "per_page": 25, "sort": "views_desc"})
        times.append((time.perf_counter() - t0) * 1000)
        check("benchmark page %d 200" % page, rr.status_code == 200, rr.text[:200])
    overview_times = []
    for _ in range(10):
        t0 = time.perf_counter()
        rr = overview("month")
        overview_times.append((time.perf_counter() - t0) * 1000)
        check("overview benchmark 200", rr.status_code == 200)
    times.sort()
    overview_times.sort()
    print("\nBENCHMARK (%d ads, 3,000 real catalogue listings)" % total_ads)
    print("  paginated list: median %.1f ms, p95 %.1f ms, max %.1f ms" % (
        times[len(times) // 2], times[-1], times[-1]))
    print("  overview:       median %.1f ms, p95 %.1f ms, max %.1f ms" % (
        overview_times[len(overview_times) // 2], overview_times[-1], overview_times[-1]))
    check("list latency sane", times[-1] < 1500, "max=%.1fms" % times[-1])
    check("overview latency sane", overview_times[-1] < 1000, "max=%.1fms" % overview_times[-1])

print("\nPASSED %d checks" % len(passed))
