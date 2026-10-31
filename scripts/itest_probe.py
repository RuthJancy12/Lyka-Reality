# -*- coding: utf-8 -*-
"""Read-only Supabase probe: schema + row counts for the chat tables.

Loads the REAL backend .env (Supabase DATABASE_URL). Only SELECT/SHOW
statements are executed. Output masks nothing here (uids are synthetic
anyway), but the report will mask sensitive values.
"""
import os
import sys

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend", ".env"))

url = os.environ.get("DATABASE_URL", "")
print("db host:", url.split("@")[1].split(":")[0] if "@" in url else "?")
eng = create_engine(url, connect_args={"connect_timeout": 20})

with eng.connect() as c:
    print("current_database:", c.execute(text("select current_database()")).scalar())
    print("server_version:", c.execute(text("show server_version")).scalar())
    msg_cols = [r[0] for r in c.execute(text(
        "select column_name from information_schema.columns "
        "where table_name='customer_chat_messages' order by ordinal_position"))]
    ses_cols = [r[0] for r in c.execute(text(
        "select column_name from information_schema.columns "
        "where table_name='customer_chat_sessions' order by ordinal_position"))]
    print("customer_chat_messages columns:", msg_cols)
    print("customer_chat_sessions columns:", ses_cols)
    idx = [tuple(r) for r in c.execute(text(
        "select indexname, indexdef from pg_indexes "
        "where tablename='customer_chat_messages'"))]
    for name, ddl in idx:
        print("index:", name, "->", ddl)
    print("existing message rows:", c.execute(text("select count(*) from customer_chat_messages")).scalar())
    print("existing session rows:", c.execute(text("select count(*) from customer_chat_sessions")).scalar())
    # Reference sample of unrelated data (masked uid) to prove read access.
    sample = c.execute(text(
        "select substr(firebase_uid,1,6)||'***', substr(session_id,1,12)||'***', role, length(text) "
        "from customer_chat_messages order by id desc limit 3")).fetchall()
    for row in sample:
        print("latest existing row (masked):", row)
