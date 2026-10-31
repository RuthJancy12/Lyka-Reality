import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Lead-analysis workflow regression test (isolated temp DB).

Exercises POST /api/leads/analyze -> POST /api/leads -> GET /api/leads
with the UI sample enquiry, plus the 401/403 auth gates. Requires the
local Ollama model; skips cleanly (exit 0) when Ollama is unreachable so
offline environments stay green.
Run: python test_lead_analyze.py
"""
import os
import sys
import tempfile
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import StaffUser  # noqa: E402
from app.services.lead_service import _ollama_health  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

if _ollama_health().get("status") != "online":
    print("SKIP: local Ollama unavailable — lead-analysis test needs llama3.2:3b")
    sys.exit(0)

init_db()
db = SessionLocal()
db.add(StaffUser(email="mgr@analyze.ae", name="MG", role="manager", is_active=True))
db.commit()
db.close()

SAMPLE = (
    "Hi, I'm Ahmed Al-Rashid, my email is ahmed@gmail.com. I'm looking to buy "
    "a 2-bedroom apartment in Dubai Marina with a sea view. My budget is around "
    "AED 2 million. I need a pool and gym. I want to move in within the next 2 months."
)

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


# Auth gates preserved (no token -> 401, customer -> 403).
r = client.post("/api/leads/analyze", json={"enquiry_text": SAMPLE})
check("analyze no-token 401", r.status_code == 401, str(r.status_code))
with patch.object(roles, "verify_bearer_token",
                  return_value={"uid": "u-c", "email": "buyer@gmail.com"}):
    check("analyze customer 403",
          client.post("/api/leads/analyze", json={"enquiry_text": SAMPLE}).status_code == 403)

with patch.object(roles, "verify_bearer_token",
                  return_value={"uid": "u-mgr", "email": "mgr@analyze.ae"}):
    r = client.post("/api/leads/analyze", json={"enquiry_text": SAMPLE})
    check("analyze staff 200", r.status_code == 200, r.text[:300])
    assert r.status_code == 200
    data = r.json()
    req, score = data["requirements"], data["score"]
    check("name extracted", (req["customer_name"] or "").lower().startswith("ahmed"), str(req))
    check("email exact", req["contact_email"] == "ahmed@gmail.com", str(req))
    check("buyer intent", req["lead_type"] == "buyer", str(req))
    check("apartment type", (req["property_type"] or "").lower() == "apartment", str(req))
    check("marina location", (req["location"] or "").lower() == "dubai marina", str(req))
    check("2 bedrooms", req["bedrooms"] == 2, str(req))
    check("budget 2M", req["budget_max"] == 2000000, str(req))
    check("timeline 60d", req["timeline_days"] == 60, str(req))
    check("pool+gym amenities",
          any("pool" in a.lower() for a in req["amenities"])
          and any("gym" in a.lower() for a in req["amenities"]), str(req))
    check("phone honestly missing", req["missing_fields"] == ["contact_phone"], str(req))
    check("score high", score["total"] >= 70 and score["label"] == "High", str(score))
    check("score band hot", score.get("band") == "Hot", str(score))
    check("score confidence present", score.get("confidence") is not None and score["confidence"] > 0, str(score))
    check("recommended action present", bool(data.get("recommended_next_action")), str(data))
    check("no openai residue",
          "openai" not in r.text.lower() and "429" not in r.text, "response mentions OpenAI")

    payload = {
        "raw_enquiry_text": SAMPLE,
        "customer_name": req["customer_name"],
        "contact_email": "analyze-persist@t.ae",
        "contact_phone": req["contact_phone"],
        "lead_type": req["lead_type"],
        "property_type": req["property_type"],
        "location": req["location"],
        "bedrooms": req["bedrooms"],
        "budget_min": req["budget_min"],
        "budget_max": req["budget_max"],
        "purpose": req["purpose"],
        "amenities": req["amenities"],
        "timeline_days": req["timeline_days"],
        "missing_fields": req["missing_fields"],
        "priority_score": score["total"],
        "priority_label": score["label"],
        "score_breakdown": score,
    }
    r2 = client.post("/api/leads", json=payload)
    check("save lead 201", r2.status_code == 201, r2.text[:300])
    saved = r2.json()
    lead_id = saved["id"]
    check("lead score persisted", saved.get("lead_score") == score["total"], str(saved))
    check("lead score band persisted Hot", saved.get("lead_score_band") == "Hot", str(saved))
    check("score breakdown reasons present", len(saved.get("score_breakdown", {}).get("reasoning", [])) > 0, str(saved))
    ids = [l["id"] for l in client.get("/api/leads").json()["leads"]]
    check("saved lead listed", lead_id in ids, str(ids))

print("PASSED %d checks" % len(passed))
