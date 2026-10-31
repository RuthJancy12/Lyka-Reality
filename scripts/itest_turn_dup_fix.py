# -*- coding: utf-8 -*-
"""Live verification of the /api/customer/chat/turns duplicate-write fix.

Two concurrent requests with the SAME record_ref must both succeed
(one creates, the other dedupes via the savepoint/IntegrityError guard) —
previously the loser raised an unhandled IntegrityError -> HTTP 500 with
the exact user-facing text "Internal server error. Please retry shortly."
"""
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(r"C:\Users\ADMIN\Desktop\lyka reality REAL ESTATE")
load_dotenv(str(ROOT / "backend" / ".env"))
BASE = "http://127.0.0.1:8104"

import firebase_admin
from firebase_admin import credentials, auth as admin_auth

_firebase_app = firebase_admin.initialize_app(credentials.Certificate(
    str(ROOT / "backend" / "firebase-service-account.json")))
_api_key = None
import re as _re
for line in (ROOT / "frontend" / ".env").read_text(encoding="utf-8").splitlines():
    m = _re.match(r"VITE_FIREBASE_API_KEY=(.+)", line.strip())
    if m:
        _api_key = m.group(1).strip()

_uid = "itst_" + uuid.uuid4().hex[:10]
_tok = admin_auth.create_custom_token(_uid)
_r = httpx.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={_api_key}",
                json={"token": _tok.decode(), "returnSecureToken": True}, timeout=60.0)
_r.raise_for_status()
token = _r.json()["idToken"]
H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
client = httpx.Client(timeout=120.0)

SESSION = "itf-" + uuid.uuid4().hex[:6]
REF = "itfref_" + uuid.uuid4().hex[:8]
PAYLOAD = {
    "session_id": SESSION,
    "record_ref": REF,
    "role": "user",
    "text": "Please show me a beautiful villa in Dubai.",
}

statuses = []
with ThreadPoolExecutor(max_workers=2) as pool:
    f1 = pool.submit(lambda: client.post(f"{BASE}/api/customer/chat/turns", json=PAYLOAD, headers=H).status_code)
    f2 = pool.submit(lambda: client.post(f"{BASE}/api/customer/chat/turns", json=PAYLOAD, headers=H).status_code)
    statuses = [f1.result(), f2.result()]

eng = create_engine(os.environ["DATABASE_URL"], connect_args={"connect_timeout": 20})
with eng.begin() as c:
    n_rows = c.execute(text(
        "select count(*) from customer_chat_messages where firebase_uid=:u"), {"u": _uid}).scalar()

print(f"concurrent /chat/turns with same ref -> statuses={statuses}; rows_for_uid={n_rows}")
ok = statuses == [200, 200] and n_rows == 1
print("RESULT:", "PASS" if ok else "FAIL")

with eng.begin() as c:
    c.execute(text("delete from customer_chat_messages where firebase_uid=:u"), {"u": _uid})
    c.execute(text("delete from customer_chat_sessions where firebase_uid=:u"), {"u": _uid})
    print("cleanup done")
sys.exit(0 if ok else 1)
