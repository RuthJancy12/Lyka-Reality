from typing import Any, Dict, List, Optional
import logging
import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.services.openai_service import generate_text_response
from app.services.openai_chat_service import process_chat_message
from app.services.ollama_chat_service import (
    process_ollama_chat_message,
    stream_ollama_chat_message,
    check_ollama_health,
    OLLAMA_MODEL,
    OLLAMA_BASE_URL
)
from app.services.openai_realtime_service import (
    create_realtime_session,
    negotiate_webrtc_sdp,
    REALTIME_MODEL
)
from app.services.property_service import (
    search_properties_dataset, init_property_dataset, get_distinct_locations, get_inventory_analytics,
)
from app.services import security_monitor
from app.services.firebase_auth import verify_bearer_token
from app.database import init_db, SessionLocal
from app.routers import (
    leads as leads_router, properties as properties_router,
    staff as staff_router, customer as customer_router,
    security as security_router, property_analytics as property_analytics_router,
    careers as careers_router,
    support as support_router,
    deals as deals_router,
    notifications as notifications_router,
    contact_center as contact_center_router,
    hrms as hrms_router,
)
from app.services import property_analytics

app = FastAPI(
    title="Lyka Realty API",
    description="Backend API for Lyka Realty – AI Lead Qualification & Property Recommendation System",
    version="3.0.0",
)

logger = logging.getLogger("lyka.api")


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


DEFAULT_CORS_ORIGINS: List[str] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:5176",
    "http://127.0.0.1:5176",
    "http://localhost:5177",
    "http://127.0.0.1:5177",
    "http://localhost:5178",
    "http://127.0.0.1:5178",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "https://ai-real-estate-lead-qualification-and.onrender.com",
    "https://ai-real-estate-lead-qualification-and-property-recom-i2g7sts7h.vercel.app",
    "https://ai-real-estate-lead-qualification-a.vercel.app",
]


def _cors_origins() -> List[str]:
    """Explicit origin allowlist. Never `*` (customer APIs return private data).

    Configure production origins with a comma-separated
    CORS_ALLOWED_ORIGINS env var. Local Vite dev/preview origins are
    included by default so local development keeps working.
    """
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
    configured = [o.strip() for o in raw.split(",") if o.strip()]
    origins = list(DEFAULT_CORS_ORIGINS)
    for origin in configured:
        if origin not in origins:
            origins.append(origin)
    return origins



# ─── Rate limiting (per client IP, in-memory sliding window) ────────────────
# Defence-in-depth only: a single-process limiter. In a multi-worker
# deployment put a shared limiter at the edge as well (documented in the
# security report). Limits are env-tunable and generous enough for normal
# browsing while stopping scripted abuse.
def _int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
        return value if value > 0 else default
    except Exception:
        return default


_RATE_LIMIT_PER_MINUTE = _int_env("RATE_LIMIT_PER_MINUTE", 300)
_RATE_LIMIT_WINDOW_SECONDS = 60.0
_TRUST_PROXY = _env_bool("TRUST_PROXY", False)
_ENFORCE_HTTPS = _env_bool("ENFORCE_HTTPS", False)
_ENABLE_HSTS = _env_bool("ENABLE_HSTS", False)
_RATE_HITS: Dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    if _TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return (request.client.host if request.client else None) or "unknown"


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    if request.method == "OPTIONS" or not request.url.path.startswith("/api"):
        return await call_next(request)
    now = time.monotonic()
    key = _client_ip(request)
    hits = _RATE_HITS[key]
    cutoff = now - _RATE_LIMIT_WINDOW_SECONDS
    while hits and hits[0] <= cutoff:
        hits.popleft()
    if len(hits) >= _RATE_LIMIT_PER_MINUTE:
        retry_after = max(1, int(_RATE_LIMIT_WINDOW_SECONDS - (now - hits[0])) + 1)
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please retry shortly."},
            headers={
                "Retry-After": str(retry_after),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )
    hits.append(now)
    # Bound memory if a flood creates many distinct client keys.
    if len(_RATE_HITS) > 10000:
        for stale in [k for k, v in _RATE_HITS.items() if not v or v[-1] <= cutoff]:
            _RATE_HITS.pop(stale, None)
    return await call_next(request)


@app.middleware("http")
async def api_security_headers(request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    # Production HTTPS enforcement (off by default so local HTTP dev works).
    if (
        _ENFORCE_HTTPS
        and request.url.path.startswith("/api")
        and request.url.scheme != "https"
        and request.url.hostname not in ("localhost", "127.0.0.1", "testserver")
    ):
        return JSONResponse(
            status_code=403,
            content={"detail": "HTTPS is required for this API."},
            headers={"Cache-Control": "no-store"},
        )

    response = await call_next(request)

    # Every backend response is per-request and often carries customer data
    # (chat turns, profiles, CRM objects) or streaming SSE — nothing here is
    # a cacheable public artifact served by the API. Shared caches must never
    # store these responses.
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy", "camera=(), geolocation=(), microphone=(self)"
    )
    if request.url.path.startswith("/api"):
        # JSON/SSE only: no scripts, no framing, no external subresources.
        response.headers.setdefault(
            "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        )
    if request.url.scheme == "https" or _ENABLE_HSTS:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Never leak stack traces, SQL, provider payloads, or tokens to clients.
    Preserves legitimate HTTP status codes (401, 403, 404, 422) and adds CORS headers.
    """
    origin = request.headers.get("origin", "")
    headers = {"Cache-Control": "no-store"}
    allowed = _cors_origins()
    if origin and (origin in allowed or "localhost" in origin or "127.0.0.1" in origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Headers"] = "*"
        headers["Access-Control-Allow-Methods"] = "*"

    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=headers,
        )
    if isinstance(exc, RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"detail": exc.errors()},
            headers=headers,
        )

    logger.exception("Unhandled API error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please retry shortly."},
        headers=headers,
    )



# ─── Security event monitoring: unauthorized-request burst detection ─────────
# Counts recent 401/403 responses per client IP and records an
# `unauthorized_burst` security event once the configured threshold is crossed.
# Dedup + cooldown live in the security monitor service.
_unauth_hits: Dict[str, List[float]] = {}


@app.middleware("http")
async def security_burst_monitor(request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    response = await call_next(request)
    try:
        if request.url.path.startswith("/api") and response.status_code in (401, 403):
            ip = _client_ip(request)
            now_ts = time.monotonic()
            cfg = security_monitor.security_config()
            hits = _unauth_hits.setdefault(ip, [])
            cutoff = now_ts - cfg["burst_window_seconds"]
            hits[:] = [t for t in hits if t > cutoff]
            hits.append(now_ts)
            if len(hits) >= cfg["auth_failure_threshold"]:
                db = SessionLocal()
                try:
                    security_monitor.record_unauthorized_burst(
                        db, subject=ip, path=request.url.path, method=request.method,
                        status_code=response.status_code,
                    )
                finally:
                    db.close()
    except Exception:
        # Monitoring must never break the response path.
        pass
    return response


# CORS is added last so it is the outermost middleware and its headers are
# present even on rate-limit/HSTS rejections. Credentials are disabled: the
# client authenticates with a bearer Firebase ID token, never cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"^https://ai-real-estate-lead-qualification-[a-zA-Z0-9\-]+\.vercel\.app$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "ngrok-skip-browser-warning", "*"],
    max_age=600,
)


# ─── Startup: Initialise database tables & in-memory property index ──────────
@app.on_event("startup")
def on_startup():
    init_db()
    init_property_dataset()
    # Mirror the real catalogue/CRM inventory into the ad registry and backfill
    # conversion events for pre-existing leads/viewings. Both operations are
    # idempotent and use only existing property ids.
    db = SessionLocal()
    try:
        property_analytics.seed_property_ads(db)
        result = property_analytics.backfill_events(db)
        logger.info("Advertising analytics ready (backfill: %s).", result)
    except Exception:
        logger.exception("Advertising analytics startup sync failed; API remains available.")
    finally:
        db.close()

# ─── CRM Routers ──────────────────────────────────────────────────────────────
app.include_router(leads_router.router)
app.include_router(properties_router.router)
app.include_router(staff_router.router)
app.include_router(customer_router.router)
app.include_router(security_router.router)
app.include_router(property_analytics_router.router)
app.include_router(careers_router.router)
app.include_router(support_router.router)
app.include_router(deals_router.router)
app.include_router(notifications_router.router)
app.include_router(contact_center_router.router)
app.include_router(hrms_router.router)


class OpenAITestRequest(BaseModel):
    message: str = Field(..., description="User message to send to OpenAI")


class OpenAITestResponse(BaseModel):
    response: str = Field(..., description="OpenAI generated response")


class ChatMessagePayload(BaseModel):
    # Length caps bound abuse (memory, prompt injection size, log spam)
    # without affecting genuine conversation turns. message aligns with the
    # 4000-char turn log cap; session_id caps the server session-store key.
    message: str = Field(..., min_length=1, max_length=4000,
                         description="User message to send to AI chat")
    session_id: Optional[str] = Field("default", max_length=128,
                                      pattern=r"^[A-Za-z0-9_.:\-]+$",
                                      description="Conversation session ID")
    history: Optional[List[Dict[str, str]]] = Field(
        None, max_length=50,
        description="Previous conversation turns (informational; the server "
                    "keeps its own session history)"
    )
    # Client-generated stable id for this turn. Re-sending the same ref on a
    # retry is idempotent (no duplicate user/assistant rows). Optional so
    # existing clients keep working unchanged.
    message_ref: Optional[str] = Field(
        None, max_length=64, pattern=r"^[A-Za-z0-9_.:\-]+$",
        description="Stable client id for exactly-once turn persistence"
    )


class ChatResponsePayload(BaseModel):
    reply: str
    matched_properties: List[Dict[str, Any]]
    requirements: Dict[str, Any]
    session_id: str
    provider: Optional[str] = "ollama"
    model: Optional[str] = "llama3.2:3b"
    timings: Optional[Dict[str, float]] = None
    # Clarification gate: "purpose" | "property_type" when the turn asks a
    # follow-up instead of searching; options lists the clickable choices.
    need: Optional[str] = None
    options: Optional[List[str]] = None
    intent: Optional[str] = "general_conversation"
    response_latency_ms: Optional[float] = None
    # Assistant response language: strictly English
    language: Optional[str] = "en"
    language_style: Optional[str] = "english"


class WebRtcOfferPayload(BaseModel):
    sdp: str = Field(..., description="WebRTC SDP offer from browser")
    model: Optional[str] = Field(None, description="Optional Realtime model override")


class WebRtcAnswerResponse(BaseModel):
    sdp: str = Field(..., description="WebRTC SDP answer from OpenAI")


@app.get("/health", include_in_schema=False)
@app.get("/api/health")
def health_check():
    ollama_info = check_ollama_health()
    db_status = "connected"
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception as e:
        db_status = f"disconnected ({str(e)[:60]})"

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "provider": "ollama",
        "model": OLLAMA_MODEL,
        "database": {"status": "connected" if db_status == "connected" else "disconnected", "detail": db_status},
        "ollama": ollama_info,
        "message": f"Lyka Realty backend is running (DB: {db_status}; Ollama {ollama_info.get('status', 'unknown')})"
    }


@app.get("/api/ollama/status")
def ollama_status():
    """
    Health check specifically for the local Ollama service and target model.
    """
    return check_ollama_health()


@app.get("/api/voice/status")
def voice_status():
    return {
        "status": "ready",
        "provider": "openai-realtime",
        "model": REALTIME_MODEL,
        "transport": "webrtc",
        "audio_format": {
            "input": "audio/pcm;rate=24000",
            "output": "audio/pcm;rate=24000"
        }
    }


@app.post("/api/voice/session")
async def create_voice_session():
    """
    Creates an ephemeral session with OpenAI Realtime API for browser WebRTC connection.
    Keeps permanent API key secure on the backend.
    """
    try:
        session = await create_realtime_session()
        return session
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Voice session creation failed")
        raise HTTPException(status_code=500, detail="Voice session could not be created.")


@app.post("/api/voice/webrtc", response_model=WebRtcAnswerResponse)
async def exchange_webrtc_sdp(payload: WebRtcOfferPayload):
    """
    Exchanges browser WebRTC SDP offer with OpenAI Realtime server,
    returning the answer SDP. Eliminates browser CORS and keeps key secure on backend.
    """
    try:
        answer_sdp = await negotiate_webrtc_sdp(payload.sdp, model=payload.model)
        return {"sdp": answer_sdp}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("WebRTC negotiation failed")
        raise HTTPException(status_code=500, detail="WebRTC negotiation failed.")


@app.post("/api/chat", response_model=ChatResponsePayload)
def chat_with_assistant(
    payload: ChatMessagePayload,
    authorization: Optional[str] = Header(default=None),
):
    # Customer-Only AI Assistance: Employees (Admin, HRMS Admin, Sales Agent) are forbidden
    if authorization:
        claims = verify_bearer_token(authorization)
        if claims:
            from app.database import SessionLocal
            from app.services.roles import resolve_role, STAFF_ROLES
            db_role = SessionLocal()
            try:
                caller_role, _, _ = resolve_role(db_role, claims)
                if caller_role in STAFF_ROLES:
                    raise HTTPException(
                        status_code=403,
                        detail="AI Assistant is exclusively for customer accounts. Employee accounts cannot access customer AI chat."
                    )
            finally:
                db_role.close()
    """
    Multi-turn conversational chat powered by local Ollama
    with deterministic verified-listing search and real Dubai dataset
    integration. Supported reply languages are English and Tamil (including
    natural Tanglish), detected from the customer's message.
    A Firebase ID token may be supplied via Authorization header; when the
    server is Firebase-configured it is verified. Signed-in sessions are
    namespaced by the verified UID so one customer can never continue
    another customer's conversation by guessing a session id. Anonymous
    requests keep the original session-id behaviour.
    """
    try:
        verified = verify_bearer_token(authorization)
        owner_uid = (verified or {}).get("uid")
        if owner_uid:
            logging.getLogger("lyka.chat").info(
                "Authenticated chat request (uid verified)."
            )
        session_id = payload.session_id or "default"
        assistant_ref = f"{payload.message_ref[:62]}:a" if payload.message_ref else None

        # Server-side persistence: user turn saved BEFORE AI reply
        if owner_uid:
            try:
                from app.database import SessionLocal
                from app.services.chat_persistence_service import save_chat_turn
                _db = SessionLocal()
                try:
                    save_chat_turn(_db, owner_uid, session_id, "user", payload.message,
                                   title_hint=payload.message,
                                   message_ref=payload.message_ref)
                    _db.commit()
                finally:
                    _db.close()
            except Exception as _pe:
                logging.getLogger("lyka.chat").warning("User turn persist failed: %s", _pe)

        result = process_ollama_chat_message(
            message=payload.message,
            session_id=session_id,
            client_history=payload.history,
            owner_uid=owner_uid,
        )

        # Server-side persistence: assistant turn saved AFTER reply
        if owner_uid:
            try:
                from app.database import SessionLocal
                from app.services.chat_persistence_service import save_chat_turn
                _db = SessionLocal()
                try:
                    _prop_ids = [
                        str(p.get("property_id"))
                        for p in (result.get("matched_properties") or [])
                        if p.get("property_id")
                    ]
                    save_chat_turn(_db, owner_uid, session_id, "assistant",
                                   result.get("reply", ""), property_ids=_prop_ids,
                                   message_ref=assistant_ref)
                    _db.commit()
                finally:
                    _db.close()
            except Exception as _pe:
                logging.getLogger("lyka.chat").warning("Assistant turn persist failed: %s", _pe)

        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Ollama chat failed")
        raise HTTPException(status_code=500, detail="Chat service is temporarily unavailable.")


@app.post("/api/chat/stream")
async def chat_stream_with_assistant(
    payload: ChatMessagePayload,
    authorization: Optional[str] = Header(default=None),
):
    # Customer-Only AI Assistance: Employees (Admin, HRMS Admin, Sales Agent) are forbidden
    if authorization:
        claims = verify_bearer_token(authorization)
        if claims:
            from app.database import SessionLocal
            from app.services.roles import resolve_role, STAFF_ROLES
            db_role = SessionLocal()
            try:
                caller_role, _, _ = resolve_role(db_role, claims)
                if caller_role in STAFF_ROLES:
                    raise HTTPException(
                        status_code=403,
                        detail="AI Assistant is exclusively for customer accounts. Employee accounts cannot access customer AI chat."
                    )
            finally:
                db_role.close()
    """
    Streams conversational chat tokens from local Ollama via Server-Sent Events (SSE),
    emitting DB search results and criteria metadata in < 3ms so UI updates immediately.
    Preserves cancellation and error handling.
    """
    try:
        verified = verify_bearer_token(authorization)
        owner_uid = (verified or {}).get("uid")
        session_id = payload.session_id or "default"

        # Server-side persistence: user turn saved BEFORE streaming starts
        if owner_uid:
            try:
                from app.database import SessionLocal
                from app.services.chat_persistence_service import save_chat_turn
                _db = SessionLocal()
                try:
                    save_chat_turn(_db, owner_uid, session_id, "user", payload.message,
                                   title_hint=payload.message,
                                   message_ref=payload.message_ref)
                    _db.commit()
                finally:
                    _db.close()
            except Exception as _pe:
                logging.getLogger("lyka.chat").warning("Stream user turn persist failed: %s", _pe)

        return StreamingResponse(
            stream_ollama_chat_message(
                message=payload.message,
                session_id=session_id,
                client_history=payload.history,
                owner_uid=owner_uid,
                message_ref=payload.message_ref,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Chat stream setup failed")
        raise HTTPException(status_code=500, detail="Chat service is temporarily unavailable.")


@app.get("/api/communities")
def list_communities():
    """Public list of real dataset communities with live listing counts.

    Powers chatbot location chips and summary dropdowns. No auth required
    so guests can explore; read-only, no data exposure beyond names/counts.
    """
    try:
        return {"communities": get_distinct_locations()}
    except Exception:
        logger.exception("Community list failed")
        raise HTTPException(status_code=500, detail="Community data is temporarily unavailable.")



@app.get("/api/properties/inventory-stats", summary="Verified 3,000 property inventory analytics")
def inventory_stats_endpoint():
    try:
        return get_inventory_analytics()
    except Exception:
        logger.exception("Inventory analytics failed")
        raise HTTPException(status_code=500, detail="Inventory analytics temporarily unavailable.")

@app.get("/api/properties/search")
def search_properties_endpoint(
    location: Optional[str] = None,
    property_type: Optional[str] = None,
    bedrooms: Optional[int] = None,
    bathrooms: Optional[int] = None,
    min_budget: Optional[float] = None,
    max_budget: Optional[float] = None,
    purpose: Optional[str] = None,
    near_metro: Optional[bool] = None,
    near_beach: Optional[bool] = None,
    view: Optional[str] = None,
    sort_by: Optional[str] = None,
    main_road_access: Optional[bool] = None,
    availability: Optional[str] = None,
    # limit is clamped: an unbounded page size would let one request scan
    # and ship the entire dataset.
    limit: int = 12,
    page: int = 1,
    min_parking: Optional[int] = None,
    amenity: Optional[List[str]] = Query(None),
    furnishing: Optional[str] = None,
):
    page = max(1, int(page or 1))
    limit = max(1, min(int(limit or 12), 500))
    try:
        return search_properties_dataset(
            location=location,
            property_type=property_type,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            min_budget_aed=min_budget,
            max_budget_aed=max_budget,
            purpose=purpose,
            near_metro=near_metro,
            near_beach=near_beach,
            view=view,
            sort_by=sort_by,
            main_road_access=main_road_access,
            availability=availability,
            limit=limit,
            page=page,
            min_parking=min_parking,
            amenities=amenity,
            furnishing=furnishing,
        )
    except Exception:
        logger.exception("Property search failed")
        raise HTTPException(status_code=500, detail="Property search is temporarily unavailable.")


@app.post("/api/openai/test", response_model=OpenAITestResponse)
def test_openai(payload: OpenAITestRequest):
    try:
        reply = generate_text_response(payload.message)
        return {"response": reply}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("OpenAI test endpoint failed")
        raise HTTPException(status_code=500, detail="Text generation is temporarily unavailable.")
