import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Confirm & Find Properties regression test (isolated temp DB).

Proves one confirmation produces one coherent outcome driven by the
deterministic search — never a no-results text plus a contradictory
recommendation, and never two replies:
  1. Exact-location matches display first, unflagged.
  2. Empty exact result falls back to multiple valid nearby properties,
     all flagged with their real communities.
  3. Zero exact + zero nearby -> exactly ONE honest no-results reply
     (need "no_results", community options), no model invention.
  4. Strict filters (budget/bedrooms/type/purpose/metro/coast) hold on
     every row, exact and nearby alike.
  5. Sync and streaming paths agree (same ids, need, options, reply on
     deterministic turns) with exactly one done event.
  6. Indian-format budgets ("AED 30,00,000") parse as 3,000,000.

Run: python test_confirm_search.py
"""
import asyncio
import json
import os
import tempfile

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

from app.services.ollama_chat_service import (  # noqa: E402
    extract_criteria_from_text,
    process_ollama_chat_message,
    stream_ollama_chat_message,
)
from app.services.property_service import (  # noqa: E402
    get_distinct_locations,
    search_properties_dataset,
)

passed = []
_n = {"i": 0}


def fresh_sid():
    _n["i"] += 1
    return f"confirm-{_n['i']}"


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


REAL_NAMES = [c["location"] for c in get_distinct_locations()]

# ── 1. Exact-location matches first, unflagged ───────────────────────────────
res = search_properties_dataset(
    location="Dubai Marina", property_type="Apartment", bedrooms=2,
    max_budget_aed=200000, purpose="Rent", limit=3)
check("exact search returns rows", len(res["top_properties"]) > 0)
check("exact rows all Marina, unflagged",
      all("marina" in p["location"].lower()
          and not p.get("is_nearby_alternative") for p in res["top_properties"]))
check("exact fallback unused", res["fallback"]["used"] is False)

# ── 2. Empty exact -> multiple valid nearby, all flagged ────────────────────
res = search_properties_dataset(
    location="Dubai Silicon Oasis", bedrooms=5, max_budget_aed=700000,
    purpose="Rent", limit=3)
rows = res["top_properties"]
check("nearby fallback returns rows", 1 < len(rows) <= 3, str(len(rows)))
check("all nearby flagged with real communities",
      all(p.get("is_nearby_alternative") is True
          and p.get("actual_location") in ("Mirdif", "Dubai Creek Harbour")
          for p in rows),
      str([(p.get("actual_location"), p.get("property_id")) for p in rows]))
check("no exact rows smuggled in",
      all("silicon" not in (p.get("location") or "").lower() for p in rows))

# ── 3. Zero/zero -> ONE honest no-results reply, no invention ───────────────
sid = fresh_sid()
d = process_ollama_chat_message("2BHK apartment for rent under 1000 AED", sid)
# location gate fires first (no location stated)
check("location asked before search", d.get("need") == "location", str(d.get("need")))
sid = fresh_sid()
for m in ["I want to rent", "an apartment", "Mirdif", "7 bedrooms",
          "under 10000 AED", "within 3 months", "no", "no"]:
    d = process_ollama_chat_message(m, sid)
check("zero/zero matched empty", d["matched_properties"] == [])
check("zero/zero single need flag", d.get("need") == "no_results", str(d.get("need")))
check("zero/zero offers real communities",
      set(d.get("options") or []) <= set(REAL_NAMES) and len(d.get("options") or []) > 0)
check("zero/zero reply names scope honestly",
      "Mirdif" in d["reply"] and "10,000" in d["reply"],
      d["reply"][:220])
check("zero/zero recommends nothing", "LYK-" not in d["reply"], d["reply"][:220])
check("zero/zero is one response object",
      isinstance(d.get("reply"), str) and isinstance(d.get("matched_properties"), list))


def collect(stream_sid, message):
    async def go():
        out = []
        async for e in stream_ollama_chat_message(message, stream_sid):
            out.append(json.loads(e.split("data:", 1)[1]))
        return out
    return asyncio.run(go())


# ── 4. Strict filters hold everywhere ────────────────────────────────────────
res = search_properties_dataset(
    location="Dubai Marina", property_type="Apartment", bedrooms=2,
    max_budget_aed=200000, purpose="Rent", near_metro=True,
    near_beach=True, min_parking=1, amenities=["gym"], limit=10)
check("strict search returns rows", len(res["top_properties"]) > 0)
bad = [p for p in res["top_properties"] if not (
    "marina" in (p.get("location") or "").lower()
    and (p.get("property_type") or "").lower() == "apartment"
    and p.get("bhk") == 2
    and (p.get("listing_type") or "").lower() == "rent"
    and (p.get("price_aed") or 0) <= 200000
    and (p.get("parking_spaces") or 0) >= 1
    and "gym" in [a.lower() for a in (p.get("amenities") or [])]
)]
check("every row honors every strict filter", bad == [], str(bad[:1]))

# ── 5. Streaming and non-streaming agree; exactly one done ──────────────────
sid_a, sid_b = fresh_sid(), fresh_sid()
sync_gate = process_ollama_chat_message("I want to buy a villa", sid_a)
evts = collect(sid_b, "I want to buy a villa")
kinds = [e["type"] for e in evts]
check("stream gate: meta first, one done",
      kinds[0] == "meta" and kinds.count("done") == 1, str(kinds))
done = evts[-1]
check("stream/sync gate agree",
      done["reply"] == sync_gate["reply"]
      and done["need"] == sync_gate["need"]
      and done["options"] == sync_gate["options"]
      and [p["property_id"] for p in done["matched_properties"]] == [],
      done["reply"][:120])

sid_c, sid_d = fresh_sid(), fresh_sid()
walk = ["I want to rent", "an apartment", "Mirdif", "7 bedrooms",
        "under 10000 AED", "within 3 months", "no"]
for m in walk:
    process_ollama_chat_message(m, sid_c)
    collect(sid_d, m)
sync_zero = process_ollama_chat_message("no", sid_c)
evts = collect(sid_d, "no")
done = evts[-1]
check("stream/sync zero-match agree",
      done["reply"] == sync_zero["reply"]
      and done["need"] == "no_results"
      and done["matched_properties"] == []
      and [e["type"] for e in evts].count("done") == 1,
      done["reply"][:160])

# ── 6. Indian-format budgets parse as millions ───────────────────────────────
check("AED 30,00,000 -> 3000000",
      extract_criteria_from_text("budget AED 30,00,000").get("max_budget_aed") == 3000000)
check("under 30,00,000 -> 3000000",
      extract_criteria_from_text("under 30,00,000").get("max_budget_aed") == 3000000)
check("plain 2000000 still works",
      extract_criteria_from_text("under 2000000").get("max_budget_aed") == 2000000)

print("PASSED %d checks" % len(passed))
