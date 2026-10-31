"""Chat history persistence regression tests (isolated temp DB).

Covers the phase-6 guarantees without touching production data:
  1. save_chat_turn is idempotent for a repeated client message_ref.
  2. Session listing is paginated, previewed, and strictly UID-owned.
  3. Message paging returns older turns via a stable cursor.
  4. Conversation requirements are rebuilt from that session only.
  5. Rename is owner-scoped.
  6. User turns survive an AI failure; retries never duplicate rows.
  7. Cold-start rehydration restores turns, requirements and
     last recommendations.

Run: python -m pytest tests/test_chat_persistence_history.py -q
"""

import os
import sys
import tempfile
from unittest.mock import patch

_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + _tmp.name

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.main as app_main  # noqa: E402
import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.models import CustomerChatMessage, CustomerChatSession  # noqa: E402
from app.services.chat_persistence_service import (  # noqa: E402
    load_session_requirements,
    save_chat_turn,
)
from app.services.ollama_chat_service import (  # noqa: E402
    _OLLAMA_SESSIONS,
    get_or_create_ollama_session,
)
from app.services.property_service import search_properties_dataset  # noqa: E402


UID_A = "uid-history-a"
UID_B = "uid-history-b"


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()
    yield
    db = SessionLocal()
    db.query(CustomerChatMessage).delete()
    db.query(CustomerChatSession).delete()
    db.commit()
    db.close()


@pytest.fixture()
def client():
    with patch.object(roles, "verify_bearer_token",
                      side_effect=_claims), \
         patch.object(app_main, "verify_bearer_token",
                      side_effect=_claims):
        yield TestClient(app_main.app, raise_server_exceptions=False)


def _claims(authorization):
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    if token in (UID_A, UID_B):
        return {"uid": token, "email": f"{token}@example.com"}
    return None


def _auth(uid):
    return {"Authorization": f"Bearer {uid}"}


def _clean():
    _OLLAMA_SESSIONS.clear()
    db = SessionLocal()
    db.query(CustomerChatMessage).delete()
    db.query(CustomerChatSession).delete()
    db.commit()
    db.close()


def _seed(uid, session_id, turns, title=None):
    db = SessionLocal()
    try:
        for role, text, pids in turns:
            save_chat_turn(db, uid, session_id, role, text, property_ids=pids or [])
        if title:
            row = (
                db.query(CustomerChatSession)
                .filter(CustomerChatSession.firebase_uid == uid,
                        CustomerChatSession.session_id == session_id)
                .first()
            )
            if row:
                row.title = title
        db.commit()
    finally:
        db.close()


def test_save_chat_turn_is_idempotent_for_repeated_ref():
    _clean()
    db = SessionLocal()
    try:
        first = save_chat_turn(
            db, UID_A, "sess-idem", "user", "hello", message_ref="msg_same")
        db.commit()
        second = save_chat_turn(
            db, UID_A, "sess-idem", "user", "hello", message_ref="msg_same")
        db.commit()
        count = db.query(CustomerChatMessage).filter(
            CustomerChatMessage.firebase_uid == UID_A).count()
    finally:
        db.close()
    assert first is not None and second is not None
    assert count == 1


def test_session_list_paginates_previews_and_isolates_owner(client):
    _clean()
    _seed(UID_A, "sess-a1", [("user", "first conversation", [])])
    _seed(UID_A, "sess-a2", [("user", "second conversation", [])])
    _seed(UID_B, "sess-b1", [("user", "other customer", [])])

    page1 = client.get("/api/customer/chat/sessions?limit=1", headers=_auth(UID_A))
    assert page1.status_code == 200, page1.text
    body = page1.json()
    assert len(body["sessions"]) == 1
    assert body["has_more"] is True
    assert body["total"] == 2
    assert body["sessions"][0]["preview"] in ("first conversation", "second conversation")
    assert body["next_cursor"]

    page2 = client.get(
        "/api/customer/chat/sessions",
        params={"limit": 1, "before": body["next_cursor"]},
        headers=_auth(UID_A),
    )
    assert page2.status_code == 200, page2.text
    ids = {s["session_id"] for s in page1.json()["sessions"] + page2.json()["sessions"]}
    assert ids == {"sess-a1", "sess-a2"}
    assert all(s["session_id"] != "sess-b1" for s in page2.json()["sessions"])

    # Owner B sees only its own conversation.
    other = client.get("/api/customer/chat/sessions", headers=_auth(UID_B))
    assert other.status_code == 200
    assert [s["session_id"] for s in other.json()["sessions"]] == ["sess-b1"]

    # No token -> no data.
    assert client.get("/api/customer/chat/sessions").status_code == 401


def test_message_paging_and_requirements_restore(client):
    _clean()
    _seed(UID_A, "sess-page", [
        ("user", "I want to buy a 2 BHK apartment in Dubai Sports City with budget AED 3 million to AED 5 million", []),
        ("assistant", "Here are the matches.", ["PROP-1"]),
        ("user", "Show me the second one", []),
        ("assistant", "The second listing is shown.", ["PROP-2"]),
        ("user", "Thanks", []),
    ])

    latest = client.get("/api/customer/chat/sessions/sess-page",
                        params={"limit": 3}, headers=_auth(UID_A))
    assert latest.status_code == 200, latest.text
    body = latest.json()
    assert [t["text"] for t in body["turns"]] == [
        "Show me the second one",
        "The second listing is shown.",
        "Thanks",
    ]
    assert body["has_more"] is True
    assert body["next_cursor"] == body["turns"][0]["id"]

    req = body["requirements"]
    assert req["purpose"] == "Sale"
    assert req["location"] == "Dubai Sports City"
    assert req["bhk"] == 2
    assert req["min_budget"] == 3_000_000
    assert req["budget"] == 5_000_000

    older = client.get(
        "/api/customer/chat/sessions/sess-page",
        params={"limit": 3, "before": body["next_cursor"]},
        headers=_auth(UID_A),
    )
    assert older.status_code == 200, older.text
    older_body = older.json()
    assert [t["text"] for t in older_body["turns"]] == [
        "I want to buy a 2 BHK apartment in Dubai Sports City with budget AED 3 million to AED 5 million",
        "Here are the matches.",
    ]
    assert older_body["has_more"] is False

    # Cross-account access is a 404, never a leak.
    leak = client.get("/api/customer/chat/sessions/sess-page", headers=_auth(UID_B))
    assert leak.status_code == 404


def test_rename_is_owner_scoped(client):
    _clean()
    _seed(UID_A, "sess-rename", [("user", "rename me", [])])
    r = client.patch("/api/customer/chat/sessions/sess-rename",
                     json={"title": "Sports City 2BHK"},
                     headers=_auth(UID_A))
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Sports City 2BHK"

    blocked = client.patch("/api/customer/chat/sessions/sess-rename",
                           json={"title": "stolen"},
                           headers=_auth(UID_B))
    assert blocked.status_code == 404


def test_user_turn_survives_ai_failure_and_retry_is_idempotent(client):
    _clean()
    payload = {
        "message": "I want to buy a 2 BHK in Dubai Marina",
        "session_id": "sess-retry",
        "message_ref": "msg_retry_001",
    }

    with patch.object(app_main, "process_ollama_chat_message",
                      side_effect=RuntimeError("Ollama down")):
        failed = client.post("/api/chat", json=payload, headers=_auth(UID_A))
    assert failed.status_code == 500

    db = SessionLocal()
    try:
        user_rows = db.query(CustomerChatMessage).filter(
            CustomerChatMessage.firebase_uid == UID_A,
            CustomerChatMessage.role == "user",
        ).all()
        assert len(user_rows) == 1, "user turn must survive AI failure"
        assert db.query(CustomerChatMessage).filter(
            CustomerChatMessage.firebase_uid == UID_A,
            CustomerChatMessage.role == "assistant",
        ).count() == 0
    finally:
        db.close()

    fake = {
        "reply": "Here are verified matches.",
        "matched_properties": [{"property_id": "PROP-X"}],
        "requirements": {"purpose": "Sale"},
        "session_id": "sess-retry",
        "provider": "test",
        "model": "test",
    }
    with patch.object(app_main, "process_ollama_chat_message", return_value=fake):
        first = client.post("/api/chat", json=payload, headers=_auth(UID_A))
        second = client.post("/api/chat", json=payload, headers=_auth(UID_A))
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text

    db = SessionLocal()
    try:
        assert db.query(CustomerChatMessage).filter(
            CustomerChatMessage.firebase_uid == UID_A,
            CustomerChatMessage.role == "user",
        ).count() == 1
        assistant = db.query(CustomerChatMessage).filter(
            CustomerChatMessage.firebase_uid == UID_A,
            CustomerChatMessage.role == "assistant",
        ).all()
        assert len(assistant) == 1
        assert assistant[0].property_ids == ["PROP-X"]
    finally:
        db.close()


def test_cold_start_rehydrates_turns_requirements_and_recommendations():
    _clean()
    dataset = search_properties_dataset(limit=1)
    props = dataset.get("top_properties") or []
    assert props, "dataset must contain at least one property"
    pid = props[0]["property_id"]

    _seed(UID_A, "sess-cold", [
        ("user", "I want to rent a 3 BHK villa in Palm Jumeirah under AED 500000", []),
        ("assistant", "Here is a verified villa.", [pid]),
    ])
    _OLLAMA_SESSIONS.clear()

    session = get_or_create_ollama_session("sess-cold", UID_A)
    assert len(session.conversation_turns) == 1
    assert session.requirements["purpose"] == "Rent"
    assert session.requirements["location"] == "Palm Jumeirah"
    assert session.requirements["bhk"] == 3
    assert session.requirements["budget"] == 500_000
    assert [p.get("property_id") for p in session.last_matched_properties] == [pid]
    assert pid in session.displayed_property_ids

    # The requirements helper is conversational-isolation safe.
    other = load_session_requirements(UID_A, "sess-does-not-exist")
    assert other["purpose"] is None and other["location"] is None
