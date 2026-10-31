import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Chat latency regression test (isolated temp DB, in-process calls).

Budgets (model-free paths must be sub-second; the local Ollama text
generation step is the only allowed exception and is covered by
streaming, which delivers meta first):
  - instant greeting turn: p95 < 1000 ms
  - deterministic gate turn: p95 < 1000 ms
  - dataset search: p95 < 1000 ms
  - SSE stream: first (meta) event < 1000 ms, exactly one done event
  - community list: cached identity (no recompute, no stale rebuild)

Ollama-backed turns are measured in bench_chat_latency.py and reported,
never asserted sub-second (dishonest).

Run: python test_chat_latency.py
"""
import asyncio
import json
import os
import statistics
import tempfile
import time

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

from app.services.ollama_chat_service import (  # noqa: E402
    get_or_create_ollama_session,
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
    return f"lat-{_n['i']}-{time.time_ns()}"


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


def pct95(ds):
    s = sorted(ds)
    return s[min(len(s) - 1, int(len(s) * 0.95))]


def measure(fn, reps=10):
    ds = []
    for _ in range(reps):
        t0 = time.perf_counter()
        fn()
        ds.append((time.perf_counter() - t0) * 1000)
    return statistics.median(ds), pct95(ds)


# ── Deterministic paths stay sub-second ────────────────────────────────────
p50, p95 = measure(lambda: process_ollama_chat_message("Hi", fresh_sid()))
check("greeting sub-second", p95 < 1000, f"p50={p50:.1f} p95={p95:.1f} ms")
print("   greeting: p50=%.1f ms p95=%.1f ms" % (p50, p95))

p50, p95 = measure(lambda: process_ollama_chat_message(
    "I want to buy a 2 BHK apartment under 2 million", fresh_sid()))
check("gate turn sub-second", p95 < 1000, f"p50={p50:.1f} p95={p95:.1f} ms")
print("   gate: p50=%.1f ms p95=%.1f ms" % (p50, p95))

p50, p95 = measure(lambda: search_properties_dataset(
    location="Dubai Marina", property_type="Apartment", bedrooms=2,
    max_budget_aed=2000000, purpose="Sale", limit=3))
check("dataset search sub-second", p95 < 1000, f"p50={p50:.1f} p95={p95:.1f} ms")
print("   search: p50=%.1f ms p95=%.1f ms" % (p50, p95))

# ── Communities cache: same object, no recompute ────────────────────────────
a = get_distinct_locations()
b = get_distinct_locations()
check("community list cached identity", a is b)
check("community list real", len(a) == 20 and any(
    c["location"] == "Dubai Silicon Oasis" for c in a))

# ── SSE stream: meta first and fast, exactly one done ───────────────────────
async def collect_first_meta(session_msg):
    gen = stream_ollama_chat_message(session_msg, fresh_sid())
    t0 = time.perf_counter()
    first = await gen.__anext__()
    first_ms = (time.perf_counter() - t0) * 1000
    rest = [e async for e in gen]
    return first_ms, [first] + rest


first_ms, events = asyncio.run(collect_first_meta(
    "I want to buy a 2 BHK apartment under 2 million"))
check("stream meta first and fast", first_ms < 1000, f"{first_ms:.1f} ms")
print("   stream time-to-meta: %.1f ms" % first_ms)
kinds = [json.loads(e.split("data:", 1)[1])["type"] for e in events]
check("stream meta before tokens/done",
      kinds[0] == "meta" and kinds.count("done") == 1, str(kinds))
meta = json.loads(events[0].split("data:", 1)[1])
check("stream meta carries gate options",
      meta["need"] == "location" and len(meta["options"]) > 0)
done = json.loads(events[-1].split("data:", 1)[1])
check("stream done has single reply", isinstance(done["reply"], str)
      and len(done["reply"]) > 0)

# ── Streamed turn retains requirements like the plain path ──────────────────
async def run_stream_turns():
    sid = fresh_sid()
    async for _ in stream_ollama_chat_message("I want to buy a villa", sid):
        pass
    async for _ in stream_ollama_chat_message("Palm Jumeirah", sid):
        pass
    return get_or_create_ollama_session(sid).requirements


req = asyncio.run(run_stream_turns())
check("stream retains requirements",
      req["purpose"] == "Sale" and req["propertyType"] == "Villa"
      and req["location"] == "Palm Jumeirah", str(req))

print("PASSED %d checks" % len(passed))
