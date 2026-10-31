# -*- coding: utf-8 -*-
"""Check who produced the row-count growth observed during the live test."""
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(r"C:\Users\ADMIN\Desktop\lyka reality REAL ESTATE\backend\.env")
eng = create_engine(os.environ["DATABASE_URL"], connect_args={"connect_timeout": 20})

with eng.connect() as c:
    hour_rows = c.execute(text(
        "select substr(firebase_uid,1,8) as uid8, substr(session_id,1,18) as sid18, role, created_at "
        "from customer_chat_messages where created_at > (now() - interval '1 hour') "
        "order by created_at desc limit 12")).fetchall()
    n_test = c.execute(text(
        "select count(*) from customer_chat_messages where firebase_uid like 'itst%'")).scalar()
    n_sess_test = c.execute(text(
        "select count(*) from customer_chat_sessions where firebase_uid like 'itst%'")).scalar()

print("test-uid rows remaining:", n_test, "| test-uid sessions remaining:", n_sess_test)
for row in hour_rows:
    print(f"uid={row[0]}*** session={row[1]}*** role={row[2]} created_at={row[3]}")
