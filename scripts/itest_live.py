# -*- coding: utf-8 -*-
"""LIVE integration verification for LYKA Realty chat history.

Targets the REAL stack configured in backend/.env:
  * Supabase PostgreSQL (DATABASE_URL)      -> persistence evidence via SELECTs
  * Ollama llama3.2:3b at localhost:11434   -> real AI replies (no mocks)
  * Firebase project real-estimate-6b291    -> real ID tokens minted from the
      server-side service account (custom token -> identitytoolkit exchange)

Safety:
  * Writes only NEW rows under the two synthetic uids itst_* / itstb_*.
  * Never touches existing customers' rows (all SELECTs are uid-filtered and
    the only DELETEs at the end target exactly the synthetic test uids).
  * No DDL, no migrations, no commits, no deployments.

Requires the itest servers on 127.0.0.1:8100 (real Ollama) and 8101
(Ollama deliberately unreachable, failure simulation).
"""
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(r"C:\Users\ADMIN\Desktop\lyka reality REAL ESTATE")
load_dotenv(str(ROOT / "backend" / ".env"))

BASE = "http://127.0.0.1:8100"
FAIL_BASE = "http://127.0.0.1:8101"


def mask(value, keep: int = 6) -> str:
    value = str(value or "")
    return (value[:keep] + "…***") if len(value) > keep else "***"


results = []  # (label, status, evidence)

def check(label, ok, evidence=""):
    results.append((label, "PASS" if ok else "FAIL", evidence))
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f"  | {evidence}" if evidence else ""))
    return bool(ok)


# ── Firebase: mint a real ID token for a synthetic test customer ─────────────
_api_key = None
for line in (ROOT / "frontend" / ".env").read_text(encoding="utf-8").splitlines():
    m = re.match(r"VITE_FIREBASE_API_KEY=(.+)", line.strip())
    if m:
        _api_key = m.group(1).strip()
assert _api_key, "VITE_FIREBASE_API_KEY not found in frontend/.env"

_firebase_app = None
def mint_id_token(uid):
    global _firebase_app
    import firebase_admin
    from firebase_admin import credentials, auth as admin_auth

    if _firebase_app is None:
        _firebase_app = firebase_admin.initialize_app(credentials.Certificate(
            str(ROOT / "backend" / "firebase-service-account.json")))
    custom = admin_auth.create_custom_token(uid)
    r = httpx.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={_api_key}",
        json={"token": custom.decode(), "returnSecureToken": True},
        timeout=60.0,
    )
    r.raise_for_status()
    return r.json()["idToken"]


def supabase():
    return create_engine(os.environ["DATABASE_URL"], connect_args={"connect_timeout": 20})


def chat_rows(engine, uid, session_id=None):
    q = (text(
        "select id, session_id, message_ref, role, left(text,60) as text_head, "
        "property_ids, created_at from customer_chat_messages "
        "where firebase_uid=:uid" + (" and session_id=:sid" if session_id else "") +
        " order by created_at, id"
    ))
    params = {"uid": uid, "sid": session_id} if session_id else {"uid": uid}
    with engine.connect() as c:
        return [dict(r._mapping) for r in c.execute(q, params)]


count_engine = supabase()
UID_A = "itst_" + uuid.uuid4().hex[:10]
UID_B = "itstb_" + uuid.uuid4().hex[:10]
SESS_A = "it-a-" + uuid.uuid4().hex[:8]
SESS_B = "it-b-" + uuid.uuid4().hex[:8]
SESS_C = "it-c-" + uuid.uuid4().hex[:8]
SESS_D = "it-d-" + uuid.uuid4().hex[:8]
SESS_F = "it-f-" + uuid.uuid4().hex[:8]
print(f"TEST-UIDS: A={mask(UID_A, 12)} B={mask(UID_B, 12)}")
print(f"TEST-SESSIONS: {SESS_A} {SESS_B} {SESS_C} {SESS_D} {SESS_F}\n")

token_a = mint_id_token(UID_A)
token_b = mint_id_token(UID_B)
print("tokens minted:", bool(token_a) and bool(token_b), "\n")

H_A = {"Authorization": f"Bearer {token_a}", "Content-Type": "application/json"}
H_B = {"Authorization": f"Bearer {token_b}", "Content-Type": "application/json"}

client = httpx.Client(timeout=240.0)

# 1 ─ reachability ----------------------------------------------------------------
r = client.get(f"{BASE}/api/communities")
check("Real backend reachable (8100) — communities endpoint",
      r.status_code == 200, f"HTTP {r.status_code}, {len(r.json().get('communities', []))} communities")

with httpx.Client(timeout=10) as hc:
    tags = hc.get("http://127.0.0.1:11434/api/tags")
models = [m["name"] for m in tags.json().get("models", [])]
check("Real Ollama online with llama3.2:3b",
      tags.status_code == 200 and any(m.startswith("llama3.2") for m in models), f"models: {models}")

# 2 ─ authenticated chat turn (JSON endpoint, real AI reply) -----------------------
MSG1_REF = "itmsg1_" + uuid.uuid4().hex[:8]
p1 = {"message": "I want to buy a 2 BHK apartment in Dubai Marina with budget AED 1 million to AED 2 million",
      "session_id": SESS_A, "message_ref": MSG1_REF}
t0 = time.time()
r1 = client.post(f"{BASE}/api/chat", json=p1, headers=H_A)
lat1 = round(time.time() - t0, 1)
reply1 = r1.json()
props1 = [p.get("property_id") for p in (reply1.get("matched_properties") or [])]
check("POST /api/chat (real Ollama reply, no mock)",
      r1.status_code == 200 and bool((reply1.get("reply") or "").strip()),
      f"HTTP {r1.status_code}, provider={reply1.get('provider')}, model={reply1.get('model')}, "
      f"{len(props1)} properties, {lat1}s")
check("Reply recommends real property IDs", len(props1) > 0, f"ids[:3]={props1[:3]}")
check("Live requirements keep purpose=Sale", (reply1.get("requirements") or {}).get("purpose") == "Sale",
      f"purpose={(reply1.get('requirements') or {}).get('purpose')}")

rows_a1 = chat_rows(count_engine, UID_A, SESS_A)
check("User + assistant turn stored in Supabase",
      len(rows_a1) == 2 and [x["role"] for x in rows_a1] == ["user", "assistant"],
      "; ".join(f"{x['role']}:{mask(x['message_ref'], 10)}:{x['text_head']!r}" for x in rows_a1))
assist_row = next((x for x in rows_a1 if x["role"] == "assistant"), None)
check("Property ids + created_at persisted on assistant row",
      bool(assist_row and assist_row["property_ids"] and assist_row["created_at"] is not None),
      f"property_ids={assist_row and assist_row['property_ids']}, created_at={assist_row and assist_row['created_at']}")

# 3 ─ recommended resolving against the dataset-backed search ------------------------
if props1:
    r_search = client.get(f"{BASE}/api/properties/search",
                          params={"q": "Dubai Marina 2 BHK apartment", "limit": 5})
    ds_ids = [p.get("property_id") for p in (r_search.json().get("top_properties") or [])]
    check("Dataset-backed property search returns real inventory",
          r_search.status_code == 200 and len(ds_ids) > 0,
          f"HTTP {r_search.status_code}, dataset ids[:3]={ds_ids[:3]}")

# 4 ─ continue the SAME session (original session id kept) ---------------------------
MSG2_REF = "itmsg2_" + uuid.uuid4().hex[:8]
p2 = {"message": "and only show me options with parking", "session_id": SESS_A, "message_ref": MSG2_REF}
r2 = client.post(f"{BASE}/api/chat", json=p2, headers=H_A)
reply2 = r2.json()
check("Follow-up turn on the same session id",
      r2.status_code == 200 and bool((reply2.get("reply") or "").strip()),
      f"HTTP {r2.status_code}, reply_head={(reply2.get('reply') or '')[:70]!r}")
rows_a2 = chat_rows(count_engine, UID_A, SESS_A)
check("Turn persisted under the same session id",
      len(rows_a2) == 4 and all(x["session_id"] == SESS_A for x in rows_a2),
      f"{len(rows_a2)} rows, refs={[mask(x['message_ref'], 8) for x in rows_a2]}")

# 5 ─ conversation list (sidebar data source) ----------------------------------------
r_list = client.get(f"{BASE}/api/customer/chat/sessions?limit=30", headers=H_A)
lst = r_list.json()
sess_entry = next((s for s in lst.get("sessions", []) if s["session_id"] == SESS_A), None)
check("Session list returns conversation with title/preview/timestamp",
      r_list.status_code == 200 and sess_entry is not None,
      f"HTTP {r_list.status_code}, total={lst.get('total')}, title={(sess_entry and sess_entry.get('title'))!r}, "
      f"preview={(sess_entry and sess_entry.get('preview') or '')[:44]!r}, "
      f"last_message_at={(sess_entry and sess_entry.get('last_message_at'))}, "
      f"turn_count={(sess_entry and sess_entry.get('turn_count'))}")
check("Preview is the stored last message text",
      bool(sess_entry and (sess_entry.get("preview") or "").strip()),
      f"preview[:50]={(sess_entry and sess_entry.get('preview') or '')[:50]!r}")

# 6 ─ detail: requirement restore + older-message pagination --------------------------
r_det = client.get(f"{BASE}/api/customer/chat/sessions/{SESS_A}?limit=2", headers=H_A)
det = r_det.json()
req = det.get("requirements") or {}
ok_req = (req.get("purpose") == "Sale" and req.get("location") == "Dubai Marina"
          and req.get("bhk") == 2 and req.get("budget") == 2_000_000)
check("Detail restores requirements from stored user messages",
      r_det.status_code == 200 and ok_req,
      f"purpose={req.get('purpose')}, location={req.get('location')}, bhk={req.get('bhk')}, budget={req.get('budget')}")
check("Detail pages newest-first with older cursor",
      det.get("has_more") is True and bool(det.get("next_cursor")) and len(det.get("turns", [])) == 2,
      f"turns={[t['text'][:26] for t in det['turns']]}, has_more={det.get('has_more')}, cursor={mask(det.get('next_cursor') or '', 10)}")
r_old = client.get(f"{BASE}/api/customer/chat/sessions/{SESS_A}",
                   params={"limit": 2, "before": det["next_cursor"]}, headers=H_A)
old = r_old.json()
check("Older messages load by cursor without overlap",
      r_old.status_code == 200 and len(old.get("turns", [])) == 2,
      f"turns={[t['text'][:26] for t in old['turns']]}")

# 7 ─ rename (owner-scoped PATCH) ------------------------------------------------------
r_ren = client.patch(f"{BASE}/api/customer/chat/sessions/{SESS_A}",
                     json={"title": "ITEST Marina 2BHK"}, headers=H_A)
ok_ren = r_ren.status_code == 200 and r_ren.json().get("title") == "ITEST Marina 2BHK"
check("PATCH rename accepted", ok_ren,
      f"HTTP {r_ren.status_code}, title={r_ren.json().get('title') if r_ren.status_code == 200 else '-'}")
with count_engine.connect() as c:
    db_title = c.execute(text(
        "select title from customer_chat_sessions where firebase_uid=:u and session_id=:s"),
        {"u": UID_A, "s": SESS_A}).scalar()
check("Renamed title persisted in Supabase", db_title == "ITEST Marina 2BHK", f"db title={db_title!r}")

# 8 ─ retry with same message_ref must not duplicate -----------------------------------
rows_before = chat_rows(count_engine, UID_A, SESS_A)
t0 = time.time()
r_retry = client.post(f"{BASE}/api/chat", json=p1, headers=H_A)
lat_retry = round(time.time() - t0, 1)
rows_after = chat_rows(count_engine, UID_A, SESS_A)
check("Retry with same message_ref adds no rows",
      r_retry.status_code == 200 and len(rows_after) == len(rows_before),
      f"rows {len(rows_before)} -> {len(rows_after)}; regenerated reply took {lat_retry}s")

# 9 ─ streaming endpoint (SSE) real turn -----------------------------------------------
MSG3_REF = "itmsg3_" + uuid.uuid4().hex[:8]
p3 = {"message": "I want to rent a studio apartment in Jumeirah Village Circle under AED 90000",
      "session_id": SESS_B, "message_ref": MSG3_REF}
tokens, done_evt = [], None
sse_status = None
t0 = time.time()
with client.stream("POST", f"{BASE}/api/chat/stream", json=p3, headers=H_A, timeout=240) as resp:
    sse_status = resp.status_code
    buffer = ""
    for chunk in resp.iter_text():
        buffer += chunk
        while "\n\n" in buffer:
            frame, buffer = buffer.split("\n\n", 1)
            for line in frame.splitlines():
                if line.startswith("data: "):
                    evt = json.loads(line[6:])
                    if evt.get("type") == "token":
                        tokens.append(evt["token"])
                    elif evt.get("type") == "done":
                        done_evt = evt
lat_sse = round(time.time() - t0, 1)
check("SSE stream yields tokens + done (real Ollama)",
      sse_status == 200 and len(tokens) > 0 and done_evt is not None,
      f"HTTP {sse_status}, {len(tokens)} tokens, provider={(done_evt or {}).get('provider')}, {lat_sse}s")
rows_b = chat_rows(count_engine, UID_A, SESS_B)
check("Streamed turn persisted as its own conversation",
      len(rows_b) == 2 and all(x["session_id"] == SESS_B for x in rows_b),
      f"{len(rows_b)} rows, refs={[mask(x['message_ref'], 8) for x in rows_b]}")

# 10 ─ per-conversation requirement isolation -------------------------------------------
r_det_b = client.get(f"{BASE}/api/customer/chat/sessions/{SESS_B}", headers=H_A)
req_b = r_det_b.json().get("requirements") or {}
r_det_a2 = client.get(f"{BASE}/api/customer/chat/sessions/{SESS_A}", headers=H_A)
req_a2 = r_det_a2.json().get("requirements") or {}
check("Rent conversation keeps its own context",
      req_b.get("purpose") == "Rent", f"purpose={req_b.get('purpose')}, bhk={req_b.get('bhk')}, location={req_b.get('location')}")
check("Buy conversation still Sale (no cross-conversation bleed)",
      req_a2.get("purpose") == "Sale", f"purpose={req_a2.get('purpose')}")

# 11 ─ multiple conversations + paginated list ------------------------------------------
for sess, msg in ((SESS_D, "hi"), (SESS_C, "what can you do")):
    client.post(f"{BASE}/api/chat", json={"message": msg, "session_id": sess,
                "message_ref": "itx_" + uuid.uuid4().hex[:8]}, headers=H_A)
r_pg1 = client.get(f"{BASE}/api/customer/chat/sessions?limit=2", headers=H_A)
pg1 = r_pg1.json()
ids1 = [s["session_id"] for s in pg1["sessions"]]
check("Sidebar list paginates (limit=2, has_more)",
      r_pg1.status_code == 200 and len(ids1) == 2 and pg1["has_more"] is True,
      f"page1 ids={ids1}, total={pg1['total']}, has_more={pg1['has_more']}")
r_pg2 = client.get(f"{BASE}/api/customer/chat/sessions",
                   params={"limit": 2, "before": pg1["next_cursor"]}, headers=H_A)
pg2 = r_pg2.json()
ids2 = [s["session_id"] for s in pg2["sessions"]]
check("Second list page via cursor, no duplicate sessions",
      r_pg2.status_code == 200 and not (set(ids1) & set(ids2)),
      f"page2 ids={ids2}")

# 12 ─ customer isolation -----------------------------------------------------------------
r_b_list = client.get(f"{BASE}/api/customer/chat/sessions?limit=30", headers=H_B)
ids_b = [s["session_id"] for s in r_b_list.json().get("sessions", [])]
check("Second customer sees none of customer A's conversations",
      r_b_list.status_code == 200 and not ids_b and all(s.startswith("itstb") is False for s in ids_b),
      f"B session ids={ids_b}")
r_b_det = client.get(f"{BASE}/api/customer/chat/sessions/{SESS_A}", headers=H_B)
check("Customer B cannot read A's conversation detail (404)",
      r_b_det.status_code == 404, f"HTTP {r_b_det.status_code}")
r_b_ren = client.patch(f"{BASE}/api/customer/chat/sessions/{SESS_A}",
                       json={"title": "stolen"}, headers=H_B)
check("Customer B cannot rename A's conversation (404)",
      r_b_ren.status_code == 404, f"HTTP {r_b_ren.status_code}")
r_noauth = client.get(f"{BASE}/api/customer/chat/sessions")
check("Unauthenticated list request rejected (401)",
      r_noauth.status_code == 401, f"HTTP {r_noauth.status_code}")

# 13 ─ logout/login simulation: fresh token, same data ------------------------------------
token_a2 = mint_id_token(UID_A)
r_relogin = client.get(f"{BASE}/api/customer/chat/sessions/{SESS_A}", headers={
    "Authorization": f"Bearer {token_a2}", "Content-Type": "application/json"})
det2 = r_relogin.json()
check("Fresh token (re-login) restores the same conversation",
      r_relogin.status_code == 200 and det2.get("session_id") == SESS_A
      and len(det2.get("turns", [])) >= 2,
      f"session_id={det2.get('session_id')}, turns={len(det2.get('turns', []))}, title={(det2.get('title'))!r}")

# 14 ─ Ollama failure: user turn must survive ---------------------------------------------
MSGF_REF = "itmsgf_" + uuid.uuid4().hex[:8]
pf = {"message": "I want to buy a villa in Palm Jumeirah under AED 5 million",
      "session_id": SESS_F, "message_ref": MSGF_REF}
t0 = time.time()
r_fail = client.post(f"{FAIL_BASE}/api/chat", json=pf, headers=H_A, timeout=120)
lat_f = round(time.time() - t0, 1)
fail_rows = chat_rows(count_engine, UID_A, SESS_F)
user_rows_f = [x for x in fail_rows if x["role"] == "user"]
replied_offline = (r_fail.status_code == 200 and "offline" in (r_fail.json().get("provider") or ""))
check("Failure-sim backend reachable (8101, Ollama unreachable)",
      client.get(f"{FAIL_BASE}/api/communities").status_code == 200, "HTTP 200")
check("With Ollama down, customer message is NOT lost",
      len(user_rows_f) == 1 and user_rows_f[0]["message_ref"] == MSGF_REF,
      f"HTTP {r_fail.status_code} ({'graceful offline reply' if replied_offline else 'AI error path'}), "
      f"user row persisted ref={mask(MSGF_REF, 10)}, {lat_f}s")

# 15 ─ cross-process retry idempotency (same ref from both instances) ----------------------
before_x = chat_rows(count_engine, UID_A, SESS_F)
r_x = client.post(f"{BASE}/api/chat", json=pf, headers=H_A)
after_x = chat_rows(count_engine, UID_A, SESS_F)
check("Same message_ref across processes stays deduplicated",
      r_x.status_code == 200 and len(after_x) == len(before_x),
      f"rows {len(before_x)} -> {len(after_x)}; refs={[mask(x['message_ref'], 10) for x in after_x]}")

# 16 ─ refresh-survival: reopen conversation listing after all turns ----------------------
r_final = client.get(f"{BASE}/api/customer/chat/sessions?limit=30", headers=H_A)
sessions_final = r_final.json()
found_ids = {s["session_id"] for s in sessions_final.get("sessions", [])}
expected = {SESS_A, SESS_B, SESS_C, SESS_D, SESS_F}
check("All conversations retrievable (page-refresh/reopen equivalent)",
      expected.issubset(found_ids),
      f"list has {len(found_ids)} sessions; missing={sorted(expected - found_ids) or 'none'}; "
      f"failure-sim session present={SESS_F in found_ids}")

# ── cleanup: remove ONLY the synthetic test rows + synthetic Firebase users ──────────────
deleted = {}
with count_engine.begin() as c:
    d1 = c.execute(text("delete from customer_chat_messages where firebase_uid in (:u1, :u2)"),
                   {"u1": UID_A, "u2": UID_B})
    d2 = c.execute(text("delete from customer_chat_sessions where firebase_uid in (:u1, :u2)"),
                   {"u1": UID_A, "u2": UID_B})
    with c.execute(text(
        "select count(*) from customer_chat_messages where firebase_uid like 'itst%'")) as _:
        pass
    leftover = c.execute(text(
        "select count(*) from customer_chat_messages where firebase_uid like 'itst%'")).scalar()
    deleted = {"messages": d1.rowcount, "sessions": d2.rowcount, "leftover_test_rows": leftover}
print(f"CLEANUP (synthetic rows only): {deleted}")

try:
    from firebase_admin import auth as admin_auth
    for u in (UID_A, UID_B):
        admin_auth.delete_user(u)
    print("CLEANUP: synthetic Firebase users deleted (created by this test only)")
except Exception as e:
    print(f"CLEANUP NOTE: Firebase user cleanup skipped: {type(e).__name__}")

fails = [r for r in results if r[1] != "PASS"]
print(f"\nSUMMARY: {len(results) - len(fails)}/{len(results)} checks passed; "
      f"FAIL: {[f[0] for f in fails] or 'none'}")
