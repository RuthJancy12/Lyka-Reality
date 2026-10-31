# LYKA Realty — Enterprise Real Estate CRM, HRMS & AI Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646cff.svg)](https://vitejs.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase_Cloud-336791.svg)](https://supabase.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Authentication-ffca28.svg)](https://firebase.google.com/)

An enterprise-grade real estate platform combining luxury Dubai property search, continuous multi-turn conversational AI with voice synthesis, high-throughput CRM lead pipeline management, and full-lifecycle HRMS employee administration.

---

## Project Structure

The project follows a strict separation of concerns with isolated **Frontend**, **Backend**, and **Documentation** layers:

```text
LYKA-REALTY/
│
├── frontend/                        # Client-Side Application (React + Vite + TypeScript)
│   ├── public/                      # Static web assets, favicon, brand graphics
│   ├── src/
│   │   ├── assets/                  # High-resolution luxury property imagery and icons
│   │   ├── components/              # Modular UI components (Agent Modal, Cards, Modals)
│   │   ├── pages/                   # Public page views (Home, Property, Portal, Careers)
│   │   ├── layouts/                 # Structural page shells (MainLayout, CrmLayout)
│   │   ├── hooks/                   # Custom hooks (useAuth, useTheme)
│   │   ├── services/                # API client adapters, Firebase SDK, Audio services
│   │   ├── api/                     # Unified API client exports and endpoints
│   │   ├── context/                 # Application state providers (Auth, Theme, Favorites)
│   │   ├── types/                   # TypeScript interfaces (Property, Lead, Staff, HRMS)
│   │   ├── utils/                   # Business logic, formatting, and test suites
│   │   ├── styles/                  # Design system tokens and global typography
│   │   ├── App.tsx                  # Root application router and layout composer
│   │   └── main.tsx                 # Client entrypoint and DOM hydration
│   ├── .env.example                 # Public environment variable template
│   ├── .env.local                   # Local development overrides (git-ignored)
│   ├── package.json                 # Node.js dependencies and scripts
│   ├── tsconfig.json                # Strict TypeScript configuration
│   ├── vite.config.ts               # Vite bundler and dev server configuration
│   └── vercel.json                  # Vercel SPA routing and security headers
│
├── backend/                         # Server-Side Application (FastAPI + SQLAlchemy)
│   ├── app/
│   │   ├── api/                     # Centralized API route aggregation (routes.py)
│   │   ├── core/                    # Settings (config.py) and RBAC security (security.py)
│   │   ├── database/                # Database engine, connection pooler, auto-migrations
│   │   ├── middleware/              # CORS, Security Headers, Rate Limiting
│   │   ├── models/                  # SQLAlchemy ORM entity definitions
│   │   ├── schemas/                 # Pydantic validation contracts
│   │   ├── services/                # Lead scoring, continuity, HRMS, and AI services
│   │   ├── utils/                   # Data formatting (AED, Phone) and UUID helpers
│   │   └── main.py                  # FastAPI ASGI application entrypoint
│   ├── tests/                       # 42 self-resolving integration test suites
│   ├── requirements.txt             # Python pip dependencies
│   ├── .env.example                 # Server-side environment variable template
│   ├── .env                         # Server environment configuration (git-ignored)
│   ├── render.yaml                  # Render Cloud production deployment blueprint
│   └── README.md                    # Backend developer documentation
│
├── docs/                            # System Architecture & Operations Documentation
│   ├── architecture.md              # Complete topology, data flows, and security matrix
│   └── deployment.md                # Step-by-step production guides (Vercel + Render + Supabase)
│
├── .gitignore                       # Comprehensive multi-language ignore rules
├── package.json                     # Root monorepo script runner
└── README.md                        # Project root documentation (this file)
```

---

## Key Platform Capabilities

1. **Intelligent Real Estate AI Consultant**:
   - Continuous multi-turn voice interaction powered by a local Ollama instance (`llama3.2:3b`) with OpenAI fallback.
   - 1,200ms silence auto-submission, live speech interruption handling, and turn persistence in PostgreSQL.
   - Strict Role-Based Access Control: customer-only AI access returns HTTP 403 Forbidden for internal staff.

2. **Lead Qualification & Automated Continuity**:
   - Intelligent scoring of buyer/renter intent with Dubai community knowledge.
   - Automatic agent availability tracking: re-routes leads to designated covering agents when assigned staff are on approved leave.

3. **Enterprise HRMS & Role-Based Access Control**:
   - Fine-grained role partitioning (`admin`, `hrms_admin`, `sales_agent`, `customer`).
   - HRMS Admin privileges are strictly restricted to Employee Directory, Attendance, Leaves, Payroll, and Recruitment.

4. **Cloud Database Architecture**:
   - Backed by Supabase Cloud PostgreSQL with connection pooling on AWS Sydney (`aws-0-ap-southeast-2.pooler.supabase.com`).
   - Real-time catalog of 3,000+ luxury Dubai residences.

---

## Quickstart & Local Development

### 1. Root Script Shortcuts
The root `package.json` delegates all common operations to the frontend and backend:

```powershell
# Run frontend dev server (Vite on http://localhost:5173)
npm run dev

# Run frontend production build
npm run build

# Run frontend unit tests (37 suites, 379 tests)
npm test
```

### 2. Backend API Setup
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1    # On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API Documentation:
- Swagger UI: `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/api/health`

---

## Running Verification Tests

### Frontend Tests (Vitest)
```powershell
npm --prefix frontend test -- --run
```
- **Coverage**: 37 test suites, 379 unit tests.
- **Result**: 100% passing.

### Backend Tests (Python)
All backend test suites in `backend/tests/` auto-resolve dependencies:
```powershell
# Offline SQLite integration suite
python backend/tests/test_all_rectifications_sqlite.py
python backend/tests/test_models_sqlite.py

# Live Supabase PostgreSQL suites
python backend/tests/test_roles_suite.py
python backend/tests/test_admin_team_management.py
python backend/tests/test_lead_list.py
```

---

## Production Deployment

- **Frontend**: Deployed to **Vercel** (`frontend/vercel.json`) with SPA pushState routing and edge caching.
- **Backend**: Deployed to **Render Cloud** (`backend/render.yaml`) with auto-scaling Uvicorn ASGI workers.
- **Database**: Hosted on **Supabase Cloud** (PostgreSQL 15 on AWS Sydney).

For detailed deployment instructions and cloud provider settings, refer to:
- [System Architecture Guide](file:///docs/architecture.md)
- [Production Deployment Guide](file:///docs/deployment.md)
- [Backend Documentation](file:///backend/README.md)
