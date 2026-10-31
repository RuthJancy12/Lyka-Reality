# -*- coding: utf-8 -*-
"""Live reproduction battery for the LYKA chatbot HTTP 500 (real stack).

Replays realistic authenticated conversation shapes through the SAME
endpoints the frontend chat uses (POST /api/chat, POST /api/chat/stream,
GET /api/customer/chat/latest) against real Supabase + real Ollama.
Any unhandled backend exception surfaces as
`{"detail": "Internal server error. Please retry shortly."}` (HTTP 500)
via the global FastAPI exception handler.
"""
import json
import os
import sys
import time
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(r"C:\Users\ADMIN\Desktop\lyka reality REAL ESTATE")
load_dotenv(str(ROOT / "backend" / ".env"))
BASE = "http://127.0.0.1:8102"

import firebase_admin
from firebase_admin import credentials, auth as admin_auth
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

_firebase_app = firebase_admin.initialize_app(credentials.Certificate(
    str(ROOT / "backend" / "firebase-service-account.json")))
_api_key = None
for line in (ROOT / "frontend" / ".env").read_text(encoding="utf-8").splitlines():
    m = __import__("re").match(r"VITE_FIREBASE_API_KEY=(.+)", line.strip())
    if m:
        _api_key = m.group(1).strip()

_uid = "itst_" + uuid.uuid4().hex[:10]
_tok = admin_auth.create_custom_token(_uid)
_r = httpx.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={_api_key}",
                json={"token": _tok.decode(), "returnSecureToken": True}, timeout=60.0)
_r.raise_for_status()
token = _r.json()["idToken"]
H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
client = httpx.Client(timeout=240.0)

results = []
def check(label, ok, evidence=""):
    results.append((label, ok, evidence))
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f"  | {evidence}" if evidence else ""))

# 1 ─ latest-chat endpoint (AccountPage reads this on load) -----------------------------
r1 = client.get(f"{BASE}/api/customer/chat/latest", headers=H)
check("GET /api/customer/chat/latest", r1.status_code == 200,
      f"HTTP {r1.status_code}, body keys={list(r1.json().keys()) if r1.status_code==200 else r1.text[:200]}")

# 2 ─ real chat battery via POST /api/chat (sync) -----------------------------------------
sessions = []
msgs = [
    ("itg-1-" + uuid.uuid4().hex[:6], "Hi, I'm looking for a home in Dubai."),
    ("itg-2-" + uuid.uuid4().hex[:6], "Do you have beachfront apartments?"),
    ("itg-3-" + uuid.uuid4().hex[:6], "I want to buy a villa in Palm Jumeirah under AED 5 million"),
    ("itg-4-" + uuid.uuid4().hex[:6], "What communities are best for families with kids?"),
]
for sid, msg in msgs:
    r = client.post(f"{BASE}/api/chat", json={"message": msg, "session_id": sid,
             "message_ref": "itg_" + uuid.uuid4().hex[:8]}, headers=H)
    check(f"chat sync turn OK: {msg[:42]}", r.status_code == 200, f"HTTP {r.status_code}, reply={(r.json().get('reply') or '')[:50]!r}")

# 3 ─ real chat battery via POST /api/chat/stream (SSE) -----------------------------------
for sid, msg in msgs[:2]:
    tokens, done, status = [], None, None
    buffer = ""
    with client.stream("POST", f"{BASE}/api/chat/stream", json={"message": msg, "session_id": sid,
              "message_ref": "itg_" + uuid.uuid4().hex[:8]}, headers=H, timeout=240) as resp:
        status = resp.status_code
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
                            done = evt
    check(f"chat stream turn OK: {msg[:42]}", status == 200 and done is not None and len(tokens) > 0,
          f"HTTP {status}, tokens={len(tokens)}, provider={(done or {}).get('provider')}")

fails = [r for r in results if not r[1]]
print(f"\nREPRO SUMMARY: {len(results) - len(fails)}/{len(results)} checks passed; FAIL: {[f[0] for f in fails] or 'none'}")

import sqlalchemy
with sqlalchemy.create_engine(os.environ["DATABASE_URL"], connect_args={"connect_timeout": 20}).begin() as c:
    n = c.execute(sqlalchemy.text(
        "delete from customer_chat_messages where firebase_uid=:u"), {"u": _uid}).rowcount
    n2 = c.execute(sqlalchemy.text(
        "delete from customer_chat_sessions where firebase_uid=:u"), {"u": _uid}).rowcount
    print(f"CLEANUP deleted {n} msgs / {n2} sessions for {_uid}")
