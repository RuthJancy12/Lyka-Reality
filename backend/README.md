# LYKA Realty — Backend API Service

High-performance, secure backend API for the LYKA Realty platform built with FastAPI, SQLAlchemy ORM, PostgreSQL (Supabase Cloud), and Firebase Authentication.

---

## Architecture Overview

```text
backend/
├── app/
│   ├── api/             # Centralized routing & endpoint aggregation
│   │   ├── routes.py    # Main API router combining all domain routers
│   │   └── __init__.py
│   ├── core/            # System configuration & security policies
│   │   ├── config.py    # Environment variables & runtime settings
│   │   ├── security.py  # User roles, RBAC permissions, token helpers
│   │   └── __init__.py
│   ├── database/        # Database session & migration engine
│   │   └── __init__.py  # SessionLocal, Base, engine, get_db, migrate()
│   ├── middleware/      # Application middleware
│   │   ├── cors.py      # CORS setup for web and mobile clients
│   │   ├── security.py  # HTTP security headers (CSP, HSTS, X-Frame)
│   │   ├── rate_limit.py# In-memory sliding window rate limiter
│   │   └── __init__.py
│   ├── models/          # SQLAlchemy ORM models
│   │   └── __init__.py  # Leads, Staff, CustomerProfile, Properties, HRMS
│   ├── schemas/         # Pydantic v2 data validation schemas
│   │   └── __init__.py  # Request/response validation contracts
│   ├── services/        # Business logic & external service integrations
│   │   ├── firebase_auth.py       # Firebase token verification & claims
│   │   ├── ollama_chat_service.py # Local Ollama LLM conversation engine
│   │   ├── lead_service.py        # Lead scoring, routing, and continuity
│   │   ├── property_analytics.py  # Inventory analytics and ads seeding
│   │   └── hrms_service.py        # Leave calculation, payroll, attendance
│   ├── utils/           # Formatting and helper utilities
│   │   ├── formatting.py# Currency (AED) & phone formatting
│   │   ├── helpers.py   # UUID, timestamp helpers
│   │   └── __init__.py
│   └── main.py          # Application entrypoint & lifespan handlers
├── tests/               # Comprehensive integration & unit test suite (42 suites)
│   ├── conftest.py      # Universal test path resolution
│   ├── test_all_rectifications_sqlite.py
│   ├── test_models_sqlite.py
│   ├── test_admin_team_management.py
│   └── ...
├── render.yaml          # Render Cloud deployment blueprint
├── requirements.txt     # Python dependencies
├── .env.example         # Environment template
└── README.md            # This documentation
```

---

## Key Features

1. **Strict Role-Based Access Control (RBAC)**:
   - Differentiates between `admin`, `hrms_admin`, `sales_agent`, and `customer`.
   - Customer-only AI enforcement ensures internal staff cannot accidentally expose or invoke consumer concierge endpoints.
   - HRMS Admin permissions are strictly restricted to employee directory, leave, payroll, and recruitment.

2. **Automated Sales Continuity**:
   - Dynamic agent availability checking: automatically detects `on_leave` or inactive status.
   - Lead coverage delegation ensures hot leads are never neglected while agents are on approved leave.

3. **Supabase Cloud PostgreSQL Pipeline**:
   - Connection pooler integration on AWS Sydney (`aws-0-ap-southeast-2.pooler.supabase.com`).
   - Dynamic startup migration verifying all required columns (`do_not_disturb`, `coverage_agent_id`, etc.).

4. **Multi-Model AI Integration**:
   - Primary: Local Ollama `llama3.2:3b` with Dubai real estate context injection.
   - Fallback: OpenAI `gpt-4o-mini` and rule-based concierge.

---

## Local Development Setup

### 1. Prerequisites
- Python 3.11+
- Virtual environment (`venv`)

### 2. Environment Setup
```powershell
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```
Update `DATABASE_URL` with your Supabase PostgreSQL connection string or use SQLite for offline testing.

### 4. Run Development Server
```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Interactive API docs available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## Running Backend Tests

All test suites are centralized in `backend/tests/`. Each test file is self-resolving and can be run independently:

```powershell
# In-memory SQLite integration tests (runs in < 5 seconds without cloud network access)
python backend/tests/test_all_rectifications_sqlite.py
python backend/tests/test_models_sqlite.py

# Live Supabase PostgreSQL suites (requires active internet access)
python backend/tests/test_roles_suite.py
python backend/tests/test_admin_team_management.py
python backend/tests/test_lead_list.py
```

---

## Production Deployment (Render)

The backend is configured for 1-click deployment on Render using `render.yaml`:
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health Check**: `GET /api/health`
