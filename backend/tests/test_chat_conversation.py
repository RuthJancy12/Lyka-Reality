import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Conversational requirement-collection regression test (live backend logic).

Uses the real in-process app (no Ollama text asserted — only the
deterministic parts: gates, options, requirements memory, filters).
Covers: dataset-driven communities endpoint, one-at-a-time location
gate with real community chips, selection retention, greeting variety,
parking/amenity extraction + filtering, and instant-turn latency.

Run: python test_chat_conversation.py
"""
import os
import time
import tempfile

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

from app.services.ollama_chat_service import (  # noqa: E402
    extract_criteria_from_text,
    get_or_create_ollama_session,
    process_ollama_chat_message,
    _OLLAMA_SESSIONS,
)
from app.services.property_service import (  # noqa: E402
    get_distinct_locations,
    search_properties_dataset,
)
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


# ── 1. Communities come from the real dataset ──────────────────────────────
client = TestClient(app, raise_server_exceptions=False)
r = client.get("/api/communities")
check("communities anonymous 200", r.status_code == 200, str(r.status_code))
names = [c["location"] for c in r.json()["communities"]]
check("20 real communities", len(names) == 20, str(len(names)))
check("DSO listed with stock",
      any(c["location"] == "Dubai Silicon Oasis" and c["listings"] > 0
          for c in r.json()["communities"]))
check("counts sorted desc",
      all(r.json()["communities"][i]["listings"] >= r.json()["communities"][i + 1]["listings"]
          for i in range(len(names) - 1)))

# ── 2. One-at-a-time location gate (no invented options) ───────────────────
sid = "t-conv-locgate"
d = process_ollama_chat_message(
    "I want to buy a 2 BHK apartment under 2 million", sid)
check("location gate triggers", d.get("need") == "location", str(d.get("need")))
check("gate shows zero cards", d["matched_properties"] == [])
check("gate options are real communities",
      len(d["options"]) > 0 and set(d["options"]) <= set(names), str(d["options"]))
req = d["requirements"]
check("criteria retained through gate",
      req["purpose"] == "Sale" and req["bhk"] == 2
      and req["budget"] == 2000000 and req["location"] is None, str(req))

# ── 3. Selecting a location is retained; remaining questions follow ─────────
t0 = time.perf_counter()
d2 = process_ollama_chat_message("Dubai Marina", sid)
sel_ms = (time.perf_counter() - t0) * 1000
req2 = d2["requirements"]
check("location retained", req2["location"] == "Dubai Marina", str(req2["location"]))
check("earlier criteria kept",
      req2["purpose"] == "Sale" and req2["bhk"] == 2
      and req2["budget"] == 2000000, str(req2))
check("timeline asked next (one at a time)",
      d2.get("need") == "timeline", str(d2.get("need")))
check("no cards before collection completes", d2["matched_properties"] == [])
d2b = process_ollama_chat_message("within 3 months", sid)
check("metro asked next", d2b.get("need") == "metro", str(d2b.get("need")))
d2c = process_ollama_chat_message("yes", sid)
check("metro stored", d2c["requirements"].get("nearMetro") is True)
check("coastline asked next", d2c.get("need") == "beach", str(d2c.get("need")))
t0 = time.perf_counter()
d2d = process_ollama_chat_message("no", sid)
sel_ms = (time.perf_counter() - t0) * 1000
check("matches follow the completed collection",
      len(d2d["matched_properties"]) > 0
      and all("marina" in p["location"].lower() for p in d2d["matched_properties"]),
      str([p["location"] for p in d2d["matched_properties"]][:3]))
print("   final turn: %.0f ms (DB %.1f ms + AI %.1f ms)" % (
    sel_ms, d2d["timings"]["db_search_ms"], d2d["timings"]["ai_generation_ms"]))

# ── 4. Greetings vary; never repeat the same canned reply ───────────────────
sid2 = "t-conv-greet"
g1 = process_ollama_chat_message("Hi", sid2)
t0 = time.perf_counter()
g2 = process_ollama_chat_message("Hello", sid2)
greet_ms = (time.perf_counter() - t0) * 1000
check("greetings instant, no cards",
      g1["matched_properties"] == [] and g2["matched_properties"] == [])
check("greetings vary", g1["reply"] != g2["reply"])
print("   instant greeting turn: %.1f ms" % greet_ms)

# ── 5. Parking + amenity extraction and deterministic filtering ─────────────
crit = extract_criteria_from_text("Looking to rent an apartment with parking and a gym")
check("parking extracted", crit.get("parking") is True, str(crit))
check("gym extracted", "gym" in (crit.get("amenities") or []), str(crit))
res = search_properties_dataset(purpose="Rent", min_parking=1,
                                amenities=["gym"], limit=20)
check("parking+gym filter returns rows", len(res["top_properties"]) > 0)
bad = [p for p in res["top_properties"]
       if (p.get("parking_spaces") or 0) < 1
       or "gym" not in [a.lower() for a in (p.get("amenities") or [])]]
check("all rows truly have parking+gym", bad == [], str(bad[:1]))
sid3 = "t-conv-park"
d3 = process_ollama_chat_message("I want to rent an apartment with parking", sid3)
check("parking stored in session",
      d3["requirements"].get("parking") is True, str(d3["requirements"]))

# ── 6. Session memory is not overwritten by later turns ─────────────────────
d4 = process_ollama_chat_message("make it 3 bedrooms", sid)
check("bedrooms updated, rest kept",
      d4["requirements"]["bhk"] == 3
      and d4["requirements"]["location"] == "Dubai Marina"
      and d4["requirements"]["purpose"] == "Sale", str(d4["requirements"]))

print("PASSED %d checks" % len(passed))
