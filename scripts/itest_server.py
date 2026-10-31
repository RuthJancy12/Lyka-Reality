# -*- coding: utf-8 -*-
"""Live integration test server launcher (local only).

Loads the REAL backend/.env (Supabase DATABASE_URL + Firebase) and starts
the actual FastAPI app on 127.0.0.1:8000 — with two safeguards:

* ``init_db`` is a NO-OP during this run (no create_all/migrate/DDL).
* The advertising analytics seed/backfill is skipped (no writes to
  production leads/viewings).

Property dataset initialisation (in-memory CSV load) still runs.

Usage: python ../scripts/itest_server.py [port] [ollama_base_url_override]
"""
import os
import sys

sys.path.insert(0, r"C:\Users\ADMIN\Desktop\lyka reality REAL ESTATE\backend")

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ollama_override = sys.argv[2] if len(sys.argv) > 2 else None
if ollama_override:
    # Must be set BEFORE importing app: ollama_chat_service reads it at import.
    os.environ["OLLAMA_BASE_URL"] = ollama_override
    print(f"OLLAMA_BASE_URL overridden to {ollama_override} (failure simulation)")

import app.main as app_main  # noqa: E402

app_main.init_db = lambda: None  # never run create_all()/migrate() against live Supabase
seed = getattr(app_main.property_analytics, "seed_property_ads", None)
backfill = getattr(app_main.property_analytics, "backfill_events", None)
if seed is not None:
    app_main.property_analytics.seed_property_ads = lambda db: None
if backfill is not None:
    app_main.property_analytics.backfill_events = lambda db: "skipped-for-itest"

import uvicorn  # noqa: E402

uvicorn.run(app_main.app, host="127.0.0.1", port=port, log_level="warning")
