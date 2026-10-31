# LYKA Realty — Environment Variables Reference

This document describes all environment variables used by the frontend and backend applications, their purpose, security classifications, and target deployment platforms.

---

## 1. Frontend Environment Variables (`frontend/.env.local` / Vercel)

All frontend variables use the `VITE_` prefix, which instructs Vite to bundle them into the browser JavaScript. **Never put private server secrets, database credentials, or service account keys in frontend environment variables.**

| Variable | Description | Example / Default | Target Service |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Base URL for the FastAPI backend (no trailing slash). | `http://localhost:8000` (Dev) / `https://lyka-realty-backend.onrender.com` (Prod) | Vercel |
| `VITE_FIREBASE_API_KEY` | Public Firebase Web API Key. | `AIzaSyB7oP...` | Vercel |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain. | `real-estimate-6b291.firebaseapp.com` | Vercel |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID. | `real-estimate-6b291` | Vercel |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Cloud Storage bucket. | `real-estimate-6b291.firebasestorage.app` | Vercel |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Cloud Messaging Sender ID. | `57626277280` | Vercel |
| `VITE_FIREBASE_APP_ID` | Public Firebase Web App ID. | `1:57626277280:web:75428658632388390d60c5` | Vercel |
| `VITE_FIREBASE_MEASUREMENT_ID` | Optional Google Analytics Measurement ID. | `G-Q123SZT14L` | Vercel |
| `VITE_FIREBASE_DATABASE_URL` | Firebase Realtime Database URL. | `https://real-estimate-6b291-default-rtdb.firebaseio.com` | Vercel |
| `VITE_FIREBASE_IN_MEMORY_AUTH` | When `'true'` (default), forces memory-only auth persistence (`inMemoryPersistence`). Zero tokens written to IndexedDB/localStorage. Note: users must log in again after page refresh. | `'true'` | Vercel |

---

## 2. Backend Environment Variables (`backend/.env` / Render)

Backend variables are strictly private server configuration parameters. **Configure these directly in the Render dashboard or local `backend/.env`. Never commit them to Git.**

| Variable | Description | Security Level | Target Service |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Supabase PostgreSQL Connection String (PgBouncer pooler port 5432). | **CONFIDENTIAL** | Render |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of permitted production origins (e.g. `https://ai-real-estate-lead-qualification-a.vercel.app`). | Restricted | Render |
| `PORT` | Server listening port. Provided automatically by Render. | Standard | Render |
| `ENVIRONMENT` | Application environment (`development` or `production`). | Standard | Render |
| `FIREBASE_PROJECT_ID` | Firebase Project ID for token verification. | Standard | Render |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Firebase service account JSON. | **CONFIDENTIAL** | Render |
| `FIREBASE_CREDENTIALS_JSON` | Inline JSON string of service account for container environments without file mounts. | **CONFIDENTIAL** | Render |
| `OLLAMA_BASE_URL` | Endpoint for Ollama AI model server. On local dev: `http://localhost:11434`. In production on Render: must point to a reachable private Ollama service URL (e.g. `https://ollama.your-internal-domain.com`), NOT `localhost`. | Internal / Confidential | Render / Self-hosted |
| `OLLAMA_MODEL` | Target Ollama model name (default: `llama3.2:3b`). | Standard | Render |
| `OPENAI_API_KEY` | Optional OpenAI API Key for fallback assistant. Customer assistant operates without this key. | **CONFIDENTIAL** | Render |
| `OPENAI_MODEL` | Target OpenAI model name (`gpt-4o-mini`). | Standard | Render |

---

## 3. Production Ollama Reachability Architecture

- **Local Development**: Developer runs `ollama run llama3.2:3b` on `http://localhost:11434`. Backend defaults to `http://localhost:11434`.
- **Render Production**: Render containers are isolated without GPU/Ollama runtimes by default. Therefore:
  1. If using a self-hosted Ollama server (e.g., RunPod, AWS EC2, or private VPS), set `OLLAMA_BASE_URL=https://ollama-instance.your-domain.com`.
  2. If `OLLAMA_BASE_URL` is unreachable or offline, the backend degrades gracefully: the health check reports `status: degraded`, while deterministic lead qualification, property inventory search, and recommendations continue functioning from the PostgreSQL dataset without crashing.
  3. No paid OpenAI API dependencies are required for normal customer conversation or property recommendation recall.
