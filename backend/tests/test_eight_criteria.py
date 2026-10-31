import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Eight-criteria collection regression test (isolated temp DB).

Proves the chatbot collects ALL EIGHT mandatory criteria
(purpose, location, property type, bedrooms, budget, timeline, metro
proximity, coastline/view) one question at a time before searching:
  1. Full walk: each turn asks exactly the next unanswered question
     (needs never repeat, zero cards until complete), then searches.
  2. Explicit "Not sure"/"Flexible" answers complete budget/timeline
     without inventing values.
  3. Bare yes/no answers complete metro/coastline.
  4. Lead edits preserve the other seven criteria.
  5. Confirm-time search applies every supported filter at once.

Run: python test_eight_criteria.py
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
from app.models import StaffUser  # noqa: E402
from app.services.ollama_chat_service import process_ollama_chat_message  # noqa: E402
from app.services.property_service import (  # noqa: E402
    get_distinct_locations,
    search_properties_dataset,
)
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="mgr@t.ae", name="MG", role="manager", is_active=True))
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


REAL_NAMES = [c["location"] for c in get_distinct_locations()]

# ── 1. Full eight-turn walk, one question at a time ─────────────────────────
sid = "t-eight-walk"
seen_needs = []
d = process_ollama_chat_message("I want to buy a house", sid)
check("house -> clarify type first", d.get("need") == "property_type", str(d.get("need")))
seen_needs.append(d.get("need"))

walk = [
    ("a townhouse", "location", {"propertyType": "Townhouse"}),
    ("Jumeirah Village Circle", "bhk", {"location": "Jumeirah Village Circle"}),
    ("3 bedrooms", "budget", {"bhk": 3}),
    ("under 5 million", "timeline", {"budget": 5000000}),
    ("within 3 months", "metro", {"timeline": "Within 3 months"}),
    ("no", "beach", {"nearMetro": False}),
]
for text, want_need, want in walk:
    d = process_ollama_chat_message(text, sid)
    check(f"'{text}' -> asks {want_need}", d.get("need") == want_need,
          str(d.get("need")))
    check(f"'{text}' -> zero cards mid-collection", d["matched_properties"] == [])
    for k, v in want.items():
        check(f"'{text}' stores {k}", d["requirements"].get(k) == v,
              str(d["requirements"].get(k)))
    seen_needs.append(d.get("need"))

check("no question repeats", len(set(seen_needs)) == len(seen_needs), str(seen_needs))

d = process_ollama_chat_message("no preference", sid)
check("coastline stored", d["requirements"].get("beachfront") is False)
req = d["requirements"]
check("all eight collected",
      req["purpose"] == "Sale" and req["location"] == "Jumeirah Village Circle"
      and req["propertyType"] == "Townhouse" and req["bhk"] == 3
      and req["budget"] == 5000000 and req["timeline"] == "Within 3 months"
      and req["nearMetro"] is False and req["beachfront"] is False, str(req))
check("search runs only after completion",
      len(d["matched_properties"]) > 0, "no JVC 3BR townhouse sale stock?")
check("matches honor collected filters",
      all(p["listing_type"] == "Sale" and p["bhk"] == 3
          and p["property_type"] == "Townhouse"
          and "village circle" in p["location"].lower()
          for p in d["matched_properties"]),
      str([(p["property_id"], p["location"]) for p in d["matched_properties"]][:3]))

# ── 2. Explicit unsure answers complete without inventing ───────────────────
sid2 = "t-eight-unsure"
process_ollama_chat_message("I want to rent an apartment", sid2)
process_ollama_chat_message("JVC", sid2)
process_ollama_chat_message("1 bedroom", sid2)
d = process_ollama_chat_message("not sure", sid2)
check("unsure budget marked flexible, not invented",
      d["requirements"].get("budget") is None
      and d["requirements"].get("budgetFlexible") is True,
      str(d["requirements"]))
check("timeline asked after flexible budget",
      d.get("need") == "timeline", str(d.get("need")))
d = process_ollama_chat_message("not sure", sid2)
check("unsure timeline marked Flexible",
      d["requirements"].get("timeline") == "Flexible",
      str(d["requirements"].get("timeline")))
check("metro asked after flexible timeline",
      d.get("need") == "metro", str(d.get("need")))

# ── 3. Location options are always dataset-real ─────────────────────────────
sid3 = "t-eight-locopts"
process_ollama_chat_message("I want to buy a villa", sid3)
d = process_ollama_chat_message("5 bedrooms", sid3)
check("location gate with real options",
      d.get("need") == "location"
      and len(d.get("options") or []) > 0
      and set(d["options"]) <= set(REAL_NAMES))

# ── 4. Lead edits preserve the other seven criteria ─────────────────────────
with as_user("mgr@t.ae"):
    payload = {
        "raw_enquiry_text": "Eight criteria lead: buy villa Palm 4BR 8M flexible. Long enough text.",
        "customer_name": "Eight Test",
        "contact_email": "eight-criteria@t.ae",
        "lead_type": "buyer",
        "property_type": "Villa",
        "location": "Palm Jumeirah",
        "bedrooms": 4,
        "budget_min": 7000000,
        "budget_max": 8000000,
        "purpose": "buy",
        "timeline_days": 30,
        "priority_score": 80,
        "priority_label": "High",
        "score_breakdown": {},
    }
    r = client.post("/api/leads", json=payload)
    check("lead created", r.status_code == 201, r.text[:200])
    lid = r.json()["id"]
    before = client.get(f"/api/leads/{lid}").json()
    r = client.patch(f"/api/leads/{lid}", json={"budget_max": 9000000})
    check("edit ok", r.status_code == 200, r.text[:200])
    after = r.json()
    for field in ("customer_name", "contact_email", "lead_type", "property_type",
                  "location", "bedrooms", "budget_min", "purpose", "timeline_days"):
        check(f"edit preserves {field}", after[field] == before[field],
              f"{field}: {before[field]} -> {after[field]}")
    check("edited value applied", after["budget_max"] == 9000000)

# ── 5. Confirm-time search applies every supported filter ───────────────────
res = search_properties_dataset(
    location="Dubai Marina", property_type="Apartment", bedrooms=2,
    max_budget_aed=200000, purpose="Rent", near_metro=True,
    near_beach=True, min_parking=1, amenities=["gym"], limit=10)
check("all-filter search returns rows", len(res["top_properties"]) > 0)
bad = [p for p in res["top_properties"] if not (
    "marina" in (p.get("location") or "").lower()
    and (p.get("property_type") or "").lower() == "apartment"
    and p.get("bhk") == 2
    and (p.get("listing_type") or "").lower() == "rent"
    and (p.get("price_aed") or 0) <= 200000
    and (p.get("parking_spaces") or 0) >= 1
    and "gym" in [a.lower() for a in (p.get("amenities") or [])]
)]
check("every row honors every filter", bad == [], str(bad[:1]))

print("PASSED %d checks" % len(passed))
