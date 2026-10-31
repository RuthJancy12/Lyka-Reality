/**
 * Firebase client initialization for LYKA Realty.
 *
 * Config is read from Vite env vars (see .env.example). The values supplied
 * by the project owner are used as fallbacks so the app works even if the
 * .env file is missing. These are PUBLIC web-app identifiers by design —
 * never place service-account private keys in frontend code.
 *
 * ZERO-BROWSER-PERSISTENCE ARCHITECTURE:
 * - Application-managed customer and business data (profiles, preferences,
 *   favorites, inquiries, chat turns, ad tracking) is strictly persisted in
 *   Supabase Cloud PostgreSQL via FastAPI with zero browser storage.
 * - Firebase Authentication persistence can be configured via VITE_FIREBASE_IN_MEMORY_AUTH:
 * - Firebase Authentication persistence is STRICT in-memory authentication:
 *   - inMemoryPersistence is enforced exclusively (tokens reside solely in JS heap memory;
 *     refreshing the page requires re-login; zero tokens written to browser storage).
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  setPersistence,
  inMemoryPersistence,
  GoogleAuthProvider,
  type Auth,
} from 'firebase/auth'
import { getDatabase, type Database } from 'firebase/database'

/**
 * Guest-access policy. When false (current), signed-out visitors may use the
 * welcome page, dashboard, and chatbot with in-memory storage, while Firebase
 * Authentication stays fully enabled and functional.
 */
export const AUTH_GATE_ENABLED = false

function envOrFallback(envKey: string, fallback: string): string {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[envKey]
    return v && v.trim() ? v.trim() : fallback
  } catch {
    return fallback
  }
}

/**
 * Strict in-memory authentication toggle. Set VITE_FIREBASE_IN_MEMORY_AUTH=true
 * to eradicate IndexedDB usage for auth tokens. Note: users will be logged out
 * on page refresh when in-memory persistence is active.
 */
/**
 * STRICT ZERO-BROWSER-PERSISTENCE:
 * In-memory authentication is the default and only active persistence mode.
 * Auth tokens reside strictly in JavaScript memory heap; zero tokens are written
 * to IndexedDB, localStorage, or cookies.
 *
 * Re-login is required after page refresh because tokens are never persisted in browser storage.
 */
export const USE_IN_MEMORY_AUTH = true

const firebaseConfig = {
  apiKey: envOrFallback('VITE_FIREBASE_API_KEY', 'AIzaSyB7oPZpG-_VKAFvMXePd6qmZ--cU95pIJU'),
  authDomain: envOrFallback('VITE_FIREBASE_AUTH_DOMAIN', 'real-estimate-6b291.firebaseapp.com'),
  projectId: envOrFallback('VITE_FIREBASE_PROJECT_ID', 'real-estimate-6b291'),
  storageBucket: envOrFallback('VITE_FIREBASE_STORAGE_BUCKET', 'real-estimate-6b291.firebasestorage.app'),
  messagingSenderId: envOrFallback('VITE_FIREBASE_MESSAGING_SENDER_ID', '57626277280'),
  appId: envOrFallback('VITE_FIREBASE_APP_ID', '1:57626277280:web:75428658632388390d60c5'),
  measurementId: envOrFallback('VITE_FIREBASE_MEASUREMENT_ID', 'G-Q123SZT14L'),
  // Verified live instance (see .env). Must match the console URL exactly.
  databaseURL: envOrFallback(
    'VITE_FIREBASE_DATABASE_URL',
    'https://real-estimate-6b291-default-rtdb.firebaseio.com'
  ),
}

const app: FirebaseApp = getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseConfig)

export const auth: Auth = getAuth(app)

/**
 * Asynchronous persistence readiness promise.
 * Guaranteed to resolve with inMemoryPersistence before any auth operations run,
 * completely preventing race conditions on login/signup.
 */
export const authPersistenceReady: Promise<void> = setPersistence(auth, inMemoryPersistence)
  .catch((err) => {
    console.error('[LYKA Firebase Auth] CRITICAL: In-memory persistence configuration failed:', err)
    throw err
  })

/** Realtime Database handle. Reads/writes still require auth per DB rules. */
export const db: Database = getDatabase(app)

/** Google provider for optional Google Sign-In (must be enabled in console). */
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export default app
