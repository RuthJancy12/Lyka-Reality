# LYKA Realty — Frontend Application

Luxury Real Estate Platform frontend built with Vite, React 19, TypeScript, and Tailwind CSS.

## Architecture

- **Framework**: Vite + React 19 + TypeScript
- **Styling**: Tailwind CSS + Custom Design System (Deep Plum & Champagne Gold)
- **Authentication**: Firebase Authentication (with optional zero-persistence in-memory mode)
- **State & Data**: React hooks and context; Supabase PostgreSQL via FastAPI backend is the permanent source of truth
- **Zero Browser Persistence**: No application data or preferences stored in `localStorage` or `sessionStorage`

## Local Development

```bash
cd frontend
npm install
npm run dev
```

The frontend development server starts at `http://localhost:5173`.

## Testing

```bash
npm run test
```

Runs the Vitest test suite.

## Production Build

```bash
npm run build
```

Generates optimized production assets in `dist/`.

## Deployment

Configured for **Vercel**:
- **Framework**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: `VITE_API_URL`, Firebase client keys (see `.env.example`).

