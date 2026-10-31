import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Conversation-logic tests: clarification gates, memory, accurate results.

Covers: missing Buy/Rent -> ask first with clickable options (no assumed
listings); house-vs-apartment ambiguity -> type follow-up; conversation
memory + preference updates; real dataset prices; honest no-match.
Short-circuit paths need no Ollama; search/memory paths work online or
offline (assertions only cover deterministic fields).
Run: python test_chat_clarify.py
"""
import sys

from app.services.ollama_chat_service import (
    formulate_followup_question,
    process_ollama_chat_message,
)
from app.services.property_service import (
    get_distinct_locations,
    search_properties_dataset,
)

passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


# 1. Missing Buy/Rent -> ask FIRST, zero listings, nothing assumed.
r = process_ollama_chat_message("I need a 2BHK house", "clarify-t1")
check("need flag is purpose", r.get("need") == "purpose", str(r.get("need")))
check("options are Buy/Rent", r.get("options") == ["Buy", "Rent"], str(r.get("options")))
check("no listings shown", r["matched_properties"] == [])
check("purpose not assumed", r["requirements"].get("purpose") is None)
check("type not assumed", r["requirements"].get("propertyType") is None)
check("bhk extracted", r["requirements"].get("bhk") == 2)
check("reply asks buy-or-rent",
      "buy or rent" in r["reply"].lower(), r["reply"][:120])

# 2. Answering "Rent" -> purpose stored, then type asked (never assumed).
r2 = process_ollama_chat_message("Rent", "clarify-t1")
check("purpose remembered", r2["requirements"].get("purpose") == "Rent")
check("bhk remembered", r2["requirements"].get("bhk") == 2)
check("type asked second", r2.get("need") == "property_type", str(r2.get("need")))
check("still no listings", r2["matched_properties"] == [])
check("type still unassumed", r2["requirements"].get("propertyType") is None)

# 3. Resolving type with no location yet -> one-at-a-time location gate
# with REAL dataset communities (no broad unfiltered dump, no invented
# options). Requirements stay retained in the session.
REAL_NAMES = [c["location"] for c in get_distinct_locations()]
r3 = process_ollama_chat_message("an apartment", "clarify-t1")
check("type resolved to Apartment", r3["requirements"].get("propertyType") == "Apartment")
check("purpose still Rent", r3["requirements"].get("purpose") == "Rent")
check("location asked next", r3.get("need") == "location", str(r3.get("need")))
check("location options are real communities",
      len(r3.get("options") or []) > 0 and set(r3["options"]) <= set(REAL_NAMES),
      str((r3.get("options") or [])[:5]))
check("gate shows no cards yet", r3["matched_properties"] == [])

# 3a. Selecting a location keeps everything; budget is asked next
# (one question at a time — never everything at once).
r3a = process_ollama_chat_message("Dubai Marina", "clarify-t1")
check("location retained", r3a["requirements"].get("location") == "Dubai Marina")
check("purpose+bhk kept", r3a["requirements"].get("purpose") == "Rent"
      and r3a["requirements"].get("bhk") == 2)
check("budget asked next", r3a.get("need") == "budget", str(r3a.get("need")))
check("budget options include Not sure",
      "Not sure" in (r3a.get("options") or []), str(r3a.get("options")))
check("no cards before collection completes", r3a["matched_properties"] == [])

# 3b. Budget -> timeline -> metro -> beach, each asked once, then search.
r3b = process_ollama_chat_message("under 2 million", "clarify-t1")
check("budget stored", r3b["requirements"].get("budget") == 2000000)
check("timeline asked next", r3b.get("need") == "timeline", str(r3b.get("need")))
r3c = process_ollama_chat_message("within 3 months", "clarify-t1")
check("timeline stored", r3c["requirements"].get("timeline") == "Within 3 months")
check("metro asked next", r3c.get("need") == "metro", str(r3c.get("need")))
check("metro options are Yes/No", r3c.get("options") == ["Yes", "No"], str(r3c.get("options")))
r3d = process_ollama_chat_message("yes", "clarify-t1")
check("metro stored", r3d["requirements"].get("nearMetro") is True)
check("coastline asked next", r3d.get("need") == "beach", str(r3d.get("need")))
r3e = process_ollama_chat_message("no", "clarify-t1")
check("coastline stored", r3e["requirements"].get("beachfront") is False)
check("results returned", len(r3e["matched_properties"]) > 0)
check("all results Rent 2BHK Marina apartments",
      all(p["listing_type"] == "Rent" and p["bhk"] == 2 and p["property_type"] == "Apartment"
          and "marina" in p["location"].lower()
          for p in r3e["matched_properties"]))
expected = search_properties_dataset(
    location="Dubai Marina", property_type="Apartment", bedrooms=2, purpose="Rent", limit=3)
got_ids = [p["property_id"] for p in r3e["matched_properties"]]
exp_ids = [p["property_id"] for p in expected["top_properties"]]
check("ids match real dataset search", got_ids == exp_ids, "%s vs %s" % (got_ids, exp_ids))
for p in r3e["matched_properties"]:
    row = next(q for q in expected["top_properties"] if q["property_id"] == p["property_id"])
    check("price %s is dataset-true" % p["property_id"],
          p["price_aed"] == row["price_aed"])

# 3c. Preference change mid-conversation updates filters, keeps the rest.
r3f = process_ollama_chat_message("actually make it 3 bedrooms", "clarify-t1")
check("bhk updated to 3", r3f["requirements"].get("bhk") == 3)
check("purpose still Rent", r3f["requirements"].get("purpose") == "Rent")
check("type still Apartment", r3f["requirements"].get("propertyType") == "Apartment")
check("location still Marina", r3f["requirements"].get("location") == "Dubai Marina")
if r3f["matched_properties"]:
    check("updated results are 3 BHK Marina",
          all(p["bhk"] == 3 and "marina" in p["location"].lower()
              for p in r3f["matched_properties"]))

# 4. Known purpose + "house" -> type clarification, no listings.
r4 = process_ollama_chat_message("I want to buy a 2BHK house", "clarify-t4")
check("need flag is property_type", r4.get("need") == "property_type", str(r4.get("need")))
check("type options offered",
      r4.get("options") == ["Villa", "Townhouse", "Apartment"], str(r4.get("options")))
check("no listings on ambiguity", r4["matched_properties"] == [])
check("purpose extracted as Sale", r4["requirements"].get("purpose") == "Sale")
check("type still unassumed", r4["requirements"].get("propertyType") is None)

# 5. Resolving type with no location -> location gate first, then a
# location selection searches real stock (ids match a filtered search).
r5 = process_ollama_chat_message("a villa", "clarify-t4")
check("type resolved to Villa", r5["requirements"].get("propertyType") == "Villa")
check("villa turn asks location", r5.get("need") == "location", str(r5.get("need")))
check("villa location options real",
      len(r5.get("options") or []) > 0 and set(r5["options"]) <= set(REAL_NAMES))
r5b = process_ollama_chat_message("Palm Jumeirah", "clarify-t4")
check("palm retained", r5b["requirements"].get("location") == "Palm Jumeirah")
check("budget asked after location", r5b.get("need") == "budget", str(r5b.get("need")))
r5c = process_ollama_chat_message("under 10 million", "clarify-t4")
check("budget stored", r5c["requirements"].get("budget") == 10000000)
check("timeline asked", r5c.get("need") == "timeline", str(r5c.get("need")))
r5d = process_ollama_chat_message("flexible", "clarify-t4")
check("flexible timeline stored", r5d["requirements"].get("timeline") == "Flexible")
check("metro asked", r5d.get("need") == "metro", str(r5d.get("need")))
r5e = process_ollama_chat_message("no", "clarify-t4")
check("metro stored no", r5e["requirements"].get("nearMetro") is False)
check("coastline asked", r5e.get("need") == "beach", str(r5e.get("need")))
r5f = process_ollama_chat_message("no preference", "clarify-t4")
check("coastline stored no", r5f["requirements"].get("beachfront") is False)
if r5f["matched_properties"]:
    check("villa results all Sale+2BHK+Palm",
          all(p["listing_type"] == "Sale" and p["bhk"] == 2
              and "palm" in p["location"].lower()
              for p in r5f["matched_properties"]))
    expected = search_properties_dataset(
        location="Palm Jumeirah", property_type="Villa", bedrooms=2, purpose="Sale", limit=3)
    got_ids = [p["property_id"] for p in r5f["matched_properties"]]
    exp_ids = [p["property_id"] for p in expected["top_properties"]]
    check("ids match real dataset search", got_ids == exp_ids, "%s vs %s" % (got_ids, exp_ids))
    for p in r5b["matched_properties"]:
        row = next(q for q in expected["top_properties"] if q["property_id"] == p["property_id"])
        check("price %s is dataset-true" % p["property_id"],
              p["price_aed"] == row["price_aed"])

# 6. Follow-up ordering: purpose question always first.
check("purpose asked first",
      "buy or rent" in formulate_followup_question({"purpose": None}, False).lower())
check("type asked when pending",
      "villa" in formulate_followup_question(
          {"purpose": "Rent", "pendingTypeClarify": True, "propertyType": None}, False).lower())

# 7. Honest no-match: impossible budget, no listings invented.
r7 = process_ollama_chat_message(
    "2BHK apartment for rent under 1000 AED", "clarify-t7")
check("no-match returns zero cards", r7["matched_properties"] == [])
check("no-match keeps requirements",
      r7["requirements"].get("purpose") == "Rent" and r7["requirements"].get("bhk") == 2)

# 8. Greeting stays a greeting (no gate, no search dump).
r8 = process_ollama_chat_message("hi", "clarify-t8")
check("greeting has no need flag", r8.get("need") in (None, ))
check("greeting shows no cards", r8["matched_properties"] == [])

print("PASSED %d checks" % len(passed))
if __name__ == "__main__":
    sys.exit(0)

