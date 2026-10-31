import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import httpx
import time

session_id = f"test-interactive-{int(time.time())}"
BASE = "http://127.0.0.1:8000"

def turn(msg: str):
    t0 = time.time()
    r = httpx.post(f"{BASE}/api/chat", json={"message": msg, "session_id": session_id}, timeout=45.0)
    assert r.status_code == 200, f"Error {r.status_code}: {r.text}"
    data = r.json()
    dur = round(time.time() - t0, 2)
    reqs = data.get("requirements", {})
    props = data.get("matched_properties", [])
    timings = data.get("timings", {})
    print(f"User: \"{msg}\"")
    print(f"-> Reply: {data.get('reply')[:140]}...")
    print(f"-> Requirements: location={reqs.get('location')}, bhk={reqs.get('bhk')}, budget={reqs.get('budget')}, purpose={reqs.get('purpose')}")
    print(f"-> Matched properties: {len(props)} listings")
    if props:
        for p in props[:2]:
            print(f"   * {p['title']} ({p['bhk']} BHK, {p['property_type']}) in {p['location']} - AED {p['price_aed']:,}")
    print(f"-> Timings: DB Search: {timings.get('db_search_ms')}ms | AI Gen: {timings.get('ai_generation_ms')}ms | Total Client: {dur}s")
    print("-" * 65)
    return data

if __name__ == "__main__":
    print("=== MULTI-TURN INTERACTIVE CONVERSATION TEST ===\n")
    # Turn 1: no Buy/Rent stated -> purpose gate asks first (no assumed listings).
    d1 = turn("Find a 2-bedroom apartment in Dubai Marina under AED 2 million")
    assert d1["requirements"]["location"] == "Dubai Marina", f"Expected Dubai Marina, got {d1['requirements']['location']}"
    assert d1["requirements"]["bhk"] == 2, f"Expected 2 BHK, got {d1['requirements']['bhk']}"
    assert d1.get("need") == "purpose", f"Expected purpose gate, got {d1.get('need')}"
    assert len(d1["matched_properties"]) == 0, "Gate turn must show no listings"

    # Turn 1b: answer Buy -> one-at-a-time collection continues (timeline
    # next: purpose/location/type/bhk/budget known, timeline missing).
    d1b = turn("Buy")
    assert d1b["requirements"]["purpose"] == "Sale", f"Expected Sale, got {d1b['requirements']['purpose']}"
    assert d1b.get("need") == "timeline", f"Expected timeline gate, got {d1b.get('need')}"
    assert len(d1b["matched_properties"]) == 0, "Gate turn must show no listings"

    # Turns 1c-1e: timeline -> metro -> beach, each asked exactly once.
    d1c = turn("Within 3 months")
    assert d1c.get("need") == "metro", f"Expected metro gate, got {d1c.get('need')}"
    d1d = turn("No")
    assert d1d.get("need") == "beach", f"Expected beach gate, got {d1d.get('need')}"
    d1e = turn("No preference")
    assert len(d1e["matched_properties"]) >= 1, "Expected matching 2BHK apartments in Dubai Marina"
    for p in d1e["matched_properties"]:
        assert p["listing_type"] == "Sale" and p["bhk"] == 2 and "Dubai Marina" in p["location"]

    d2 = turn("What if I want 3 bedrooms instead?")
    assert d2["requirements"]["location"] == "Dubai Marina", f"Expected Dubai Marina remembered, got {d2['requirements']['location']}"
    assert d2["requirements"]["bhk"] == 3, f"Expected 3 BHK updated, got {d2['requirements']['bhk']}"
    # Dataset-true: no exact 3BHK Marina Sale <= 2M exists (cheapest is 2.99M).
    # The search may suggest nearby communities, but every card must be
    # explicitly labelled as a nearby alternative and honour the filters.
    exact = [p for p in d2["matched_properties"] if not p.get("is_nearby_alternative")]
    assert exact == [], "Expected no exact 3BHK Marina Sale <= 2M match"
    for p in d2["matched_properties"]:
        assert p.get("is_nearby_alternative") is True, "Non-exact cards must be labelled nearby"
        assert p.get("actual_location") and p["actual_location"] != "Dubai Marina"
        assert p["property_type"] == "Apartment" and p["bhk"] == 3
        assert p["listing_type"] == "Sale" and p["price_aed"] <= 2000000

    d3 = turn("Actually I want to rent, not buy")
    assert d3["requirements"]["purpose"] == "Rent", f"Expected Rent updated, got {d3['requirements']['purpose']}"
    assert d3["requirements"]["bhk"] == 3, f"Expected 3 BHK remembered, got {d3['requirements']['bhk']}"
    for p in d3["matched_properties"]:
        assert p["listing_type"] == "Rent" and p["bhk"] == 3, f"Card honors Rent+3BHK: {p['property_id']}"

    d4 = turn("Can you find something in Downtown Dubai instead?")
    assert d4["requirements"]["location"] == "Downtown Dubai", f"Expected Downtown Dubai updated, got {d4['requirements']['location']}"
    assert d4["requirements"]["bhk"] == 3, f"Expected 3 BHK remembered, got {d4['requirements']['bhk']}"
    for p in d4["matched_properties"]:
        assert "Downtown Dubai" in p["location"] and p["bhk"] == 3, f"Card honors Downtown+3BHK: {p['property_id']}"

    print("\nALL INTERACTIVE CONVERSATION TURNS VERIFIED SUCCESSFULLY!")
