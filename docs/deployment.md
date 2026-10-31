# LYKA Realty — Production Deployment Guide

This guide details the end-to-end production deployment process for the LYKA Realty platform across **Supabase Cloud** (Database), **Render** (Backend API), and **Vercel** (Frontend SPA).

---

## Architecture Pipeline

```text
[ Vercel CDN ]  ── HTTPS API Calls ──►  [ Render Cloud ]  ── SSL Pooler ──►  [ Supabase Cloud ]
(React Frontend)                        (FastAPI Backend)                      (PostgreSQL DB)
       │                                       │
       ▼                                       ▼
[ Firebase Auth ] ◄────── JWT Validation ──────┘
```

---

## 1. Persistence Layer: Supabase Cloud PostgreSQL

### 1.1 Cluster Provisioning
1. Log into your [Supabase Dashboard](https://app.supabase.com).
2. Select your project (e.g., `real-estimate-6b291` or region `aws-0-ap-southeast-2`).
3. Navigate to **Project Settings** → **Database** → **Connection string**.
4. Select the **Transaction Pooler** (Port `5432` or `6543`) mode for optimal connection handling under concurrent ASGI load.

### 1.2 Database Connection String
Copy the URI in the following format:
```text
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

### 1.3 Schema Initialization & Automated Migration
The FastAPI backend includes automatic schema verification during application startup:
- Tables and indexes are verified via `init_db()` in `app/database/__init__.py`.
- Incremental migrations (e.g. `do_not_disturb`, `coverage_agent_id`) run automatically via `migrate()`.

---

## 2. Backend API Deployment: Render Cloud

The backend repository includes a native `render.yaml` blueprint.

### 2.1 Option A: One-Click Blueprint Deployment (Recommended)
1. Push the code to your GitHub / GitLab repository.
2. In the [Render Dashboard](https://dashboard.render.com), click **New** → **Blueprint**.
3. Connect your repository. Render will automatically detect `backend/render.yaml`.
4. Fill in the required environment variables:
   - `DATABASE_URL`: Your Supabase PostgreSQL pooler connection string.
   - `CORS_ALLOWED_ORIGINS`: Your Vercel frontend domain (e.g. `https://lyka-realty.vercel.app`).
   - `FIREBASE_PROJECT_ID`: `real-estimate-6b291`
   - `FIREBASE_CREDENTIALS_JSON`: The JSON content of your `firebase-service-account.json`.
5. Click **Apply**.

### 2.2 Option B: Manual Web Service Deployment
- **Environment**: Python 3
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health Check Path**: `/api/health`

### 2.3 Required Backend Environment Variables

| Variable | Description | Example Value |
|:---|:---|:---|
| `ENVIRONMENT` | Runtime environment | `production` |
| `PORT` | HTTP port provided by Render | `8000` |
| `DATABASE_URL` | Supabase Cloud PostgreSQL URI | `postgresql://postgres.xxx:xxx@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres` |
| `CORS_ALLOWED_ORIGINS` | Permitted origins | `https://lyka-realty.vercel.app,http://localhost:5173` |
| `FIREBASE_PROJECT_ID` | Google Firebase Project ID | `real-estimate-6b291` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path or file reference | `firebase-service-account.json` |
| `OPENAI_API_KEY` | OpenAI API key for concierge fallback | `sk-proj-...` |
| `OPENAI_MODEL` | OpenAI model identifier | `gpt-4o-mini` |

---

## 3. Frontend SPA Deployment: Vercel

The frontend includes `frontend/vercel.json` configured for Single Page Application (SPA) HTML5 pushState routing and secure HTTP headers.

### 3.1 Vercel Project Setup
1. In the [Vercel Dashboard](https://vercel.com/dashboard), click **Add New** → **Project**.
2. Select your Git repository.
3. In **Root Directory**, click **Edit** and set it to: `frontend`.
4. Framework Preset: **Vite**.
5. Build Command: `npm run build` (or left default).
6. Output Directory: `dist`.

### 3.2 Frontend Environment Variables

Configure these in **Project Settings** → **Environment Variables**:

| Variable | Value Description |
|:---|:---|
| `VITE_API_URL` | Production Render URL, e.g. `https://lyka-realty-backend.onrender.com` (no trailing slash) |
| `VITE_FIREBASE_API_KEY` | Public Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `real-estimate-6b291.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `real-estimate-6b291` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `real-estimate-6b291.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `57626277280` |
| `VITE_FIREBASE_APP_ID` | `1:57626277280:web:75428658632388390d60c5` |
| `VITE_FIREBASE_MEASUREMENT_ID` | `G-Q123SZT14L` |
| `VITE_FIREBASE_DATABASE_URL` | `https://real-estimate-6b291-default-rtdb.firebaseio.com` |

---

## 4. Post-Deployment Verification Checklist

Once both services are active:

1. **Backend Health Check**:
   - Make a GET request to `https://lyka-realty-backend.onrender.com/api/health`.
   - Confirm response is HTTP 200 with `"status": "ok"` and `"database": { "status": "connected" }`.

2. **CORS Handshake**:
   - Open browser developer tools on `https://lyka-realty.vercel.app`.
   - Ensure network requests to `/api/properties` succeed with `Access-Control-Allow-Origin` matching your domain.

3. **Authentication Handshake**:
   - Log in as Customer → confirm personalized feed and AI concierge availability.
   - Log in as Admin (`admin@lyka.ae`) → confirm Team Management and Leads table load all 15 records without HTTP 500.
   - Verify Customer-Facing AI access is blocked (HTTP 403) for Staff/Admin accounts.

4. **Sales Continuity Test**:
   - In HRMS, mark an agent on leave.
   - Verify lead assignments transfer to covering agents with notification records created.

