# LYKA Realty — Final Security & Privacy Audit (2026-10-26)

**Verdict:** the audited customer-data paths are now backend-first and token-owned. Customer
profiles, preferences, saved properties, enquiries, authenticated chat history, interactions
and consent are persisted in FastAPI/SQLite, not in custom browser storage. Public and staff
access paths are separated, anonymous responses are minimized, and the four originally failing
backend scripts were updated to assert the sanitized contract. All automated checks pass.
Residual operational risks are listed in §10.

Companion document: `docs/STORAGE_AUDIT_2026-10-26.md` (full key-by-key inventory).
This report supersedes the storage model in `docs/SECURITY_AUDIT_2026-10-24.md`; that file is
left untouched as historical evidence.

---

## 1. Scope and threat model

Audited assets:

- customer profile data (name, email, phone, city, country, attribution);
- saved properties, enquiries, authenticated chat history, consent-gated interactions;
- Firebase Auth session and ID tokens;
- staff/Admin APIs and role checks;
- public website enquiry endpoint;
- browser `localStorage` / `sessionStorage` / IndexedDB / Cache Storage / RTDB;
- API responses, errors, headers, CORS, rate limiting, HTTPS/HSTS.

Adversaries considered:

1. an anonymous internet user probing private endpoints or public responses;
2. customer A trying to read/modify customer B's records (including by supplying a UID);
3. a signed-in customer calling staff/Admin APIs;
4. a shared-device visitor after logout/account switch;
5. scripted abuse (spam, brute-force, oversized payloads);
6. accidental leakage through browser storage, bundles, logs, URLs or error messages.

Non-goals / unchanged by design: Firebase Auth and its sign-in methods, existing Firebase UIDs,
staff roles, listings, CRM records, favorites, chat data, Admin/Manager/Salesperson
permissions, and the Ollama chatbot. No backend cookie-session/CSRF scheme was introduced
because the app authenticates with Firebase bearer ID tokens.

---

## 2. Findings and remediation

| # | Severity | Finding (before) | Remediation | Evidence |
|---|---|---|---|---|
| 1 | **High** | Profiles (incl. phone), inquiries, chat history, favorites, interactions and consent were mirrored into `localStorage` under owner keys; RTDB was the live cloud store. | Rewrote `src/services/chatStore.ts` as a per-tab, per-owner **in-memory** store. All reads/writes go through `/api/customer/*`; new SQLite tables own the records. `src/services/rtdb.ts` is now read-only legacy migration code. | `test_customer_records_ownership.py`; `customerStorageSecurity.test.ts` (7 cases); storage audit §1–§2 |
| 2 | **High** | `POST /api/leads/public` echoed name/email/phone/raw text, score, recommendations, UTM/discovery data; duplicate `409` echoed the email and lead id. | Public response is now `PublicEnquiryOut(id, status="received")`. Duplicate `409` is generic. Staff still get full detail via authenticated `/api/leads/{id}`. | `test_public_enquiry.py` (17); updated `test_chat_enquiry_workflow.py` (14), `test_recommendation_scoring.py` (23), `test_lead_source.py` (9), `test_discovery_source.py` (23) |
| 3 | **High** | CORS was wildcard with credentials enabled. | Explicit `CORS_ALLOWED_ORIGINS` allowlist; `allow_credentials=False`; local Vite origins only as the dev default; bearer `Authorization` remains the only credential path. | `app/main.py` lines 50–66, 180–190; `test_api_hardening.py` |
| 4 | **Medium** | No request-rate limiting. | Per-client-IP in-memory sliding window (`RATE_LIMIT_PER_MINUTE`, default 300/min), `TRUST_PROXY` opt-in, bounded key map, `429` + `Retry-After`. | `app/main.py` lines 69–120; `test_api_hardening.py` |
| 5 | **Medium** | No security headers / cache controls on JSON APIs. | `Cache-Control: no-store` on all `/api/*`; `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, API CSP (`default-src 'none'`); HSTS when HTTPS/flag. Generic `500`. | `app/main.py` lines 98–166, 169–177; `test_api_hardening.py` (no-store, 401 headers) |
| 6 | **Medium** | Favorites and chat history had no backend persistence (RTDB only). | Added `customer_favorites`, `customer_inquiries`, `customer_chat_sessions`, `customer_chat_messages`, `customer_interactions`; `tracking_consent`/`legacy_migrated_at` columns. All keyed/filtered by token UID. | `app/models.py` 211–345; `app/routers/customer.py`; `test_customer_records_ownership.py` |
| 7 | **Medium** | Customer endpoints accepted email-only tokens for some reads and did not centrally require a UID for record writes. | `require_verified_uid` now guards all record endpoints; identity is always `claims["uid"]`; no UID is accepted in body/path. | `customer.py` 39–62; ownership test includes a body-injected UID attempt |
| 8 | **Medium** | Profile-only saves could wipe preferences; no preferences-only endpoint. | Profile saves preserve existing preferences when omitted; dedicated `GET/PUT /api/customer/preferences` cannot touch name/phone/city/attribution. | `customer.py` 114–213; `test_customer_portal.py` |
| 9 | **Medium** | One-time migration/adoption of legacy browser/RTDB data was not owner-verified/idempotent. | `POST /api/customer/migrate/legacy`: verified UID only, idempotent `legacy_migrated_at`, existing backend values win, failure keeps client copies, guest data excluded. | `customer.py` 658–735; `customerStorageSecurity.test.ts`; ownership test §7 |
| 10 | **Low** | HTTPS/HSTS not enforceable. | Opt-in `ENFORCE_HTTPS` (403 for non-HTTPS API except localhost/testserver) and `ENABLE_HSTS`; HSTS also set when the request is already HTTPS. Defaults off for local dev. | `app/main.py` 85–86, 129–165 |
| 11 | **Low** | Admin-only security event/alerts surface did not exist. | Added `/api/security/*` guarded by `require_admin`; auth failures, role violations and unauthorized-request bursts are recorded with hashed subjects (an ownership-violation recorder is also available). | `app/routers/security.py`; `app/main.py` burst middleware; `test_roles_suite.py` |

No finding required disabling Firebase rules, exposing a database, deleting accounts, resetting
passwords, changing staff roles, or removing a working feature.

---

## 3. Authorization and ownership model

### Trust boundary

- Firebase Authentication is the only identity source. The backend verifies the ID token with
  the Firebase Admin SDK (`clock_skew_seconds=10`, project-scoped audience checking inside the
  SDK). A missing/invalid token returns `None`, and protected routes answer `401`.
- Roles are resolved from SQLite `staff_users` using the **verified UID first, then verified
  email**. A client-supplied role or UID is never trusted. Unknown/inactive staff resolve to
  `customer`.
- Customer records are always queried with `firebase_uid == claims["uid"]`. No customer route
  takes a UID or email from the request body/path.
- Staff/Admin routes use `require_staff` / `require_roles(...)`; customer tokens receive `403`.

### Matrix

| Surface | Anonymous | Customer | Salesperson / Sales Manager / Manager | Admin |
|---|---|---|---|---|
| `GET/PUT /api/customer/profile` | 401 | own profile only (PUT requires UID token) | own customer profile row if present | own customer profile row if present |
| `GET/PUT /api/customer/preferences` | 401 | own only | own only | own only |
| `GET/PUT /api/customer/favorites` | 401 | own only | own only | own only |
| `GET/POST/PATCH /api/customer/inquiries*` | 401 | own only; cross-owner PATCH 404 | own only | own only |
| `GET /api/customer/chat/latest`, `POST /api/customer/chat/turns` | 401 | own only | own only | own only |
| `GET/POST /api/customer/interactions` | 401 | own only | own only | own only |
| `GET/PUT /api/customer/tracking-consent` | 401 | own only | own only | own only |
| `POST /api/customer/migrate/legacy` | 401 | own UID only, once | own UID only, once | own UID only, once |
| `POST /api/leads/public` | allowed, minimal ack | allowed, minimal ack | allowed, minimal ack | allowed, minimal ack |
| `GET /api/leads*`, `/api/staff/*` | 401 | 403 | role-dependent | allowed |
| `/api/security/*` | 401 | 403 | 403 | allowed |

`*` inquiry PATCH resolves by `record_ref` or numeric id, but **both lookups are UID-filtered**;
a foreign id returns `404`, never the row.

### Verified isolation checks

`backend/test_customer_records_ownership.py` (48 checks, two real UIDs) proves:

- every private endpoint returns `401` without a token (14 endpoint/method combinations);
- A's favorites/inquiries/chat/interactions/consent/preferences are invisible to B;
- B's `PATCH` of A's inquiry returns `404` and A's status is unchanged;
- B reusing A's chat `record_ref`/`session_id` creates only B-scoped rows; A's chat is unchanged;
- a `firebase_uid` injected into a favorites body is ignored — the token owner receives the write;
- a customer token gets `403` on `/api/staff/customers` and `/api/leads`; Admin gets `200`;
- legacy migration is applied once (`migrated:true`), replay is ignored (`migrated:false`), and
  B sees none of A's migrated records.

`backend/test_customer_portal.py` additionally covers profile A/B isolation, blank-name `422`,
one-profile-per-UID, staff-directory field minimization (no `firebase_uid`), and
customer/salesperson/sales-manager `403`s.

Frontend isolation is covered by `chatIsolation.test.ts`, `favorites.test.ts`,
`customerStorageSecurity.test.ts`, and `customerInquiryApi.test.ts`.

---

## 4. Browser storage and frontend state

Full inventory: `docs/STORAGE_AUDIT_2026-10-26.md`.

Summary:

- `chatStore.ts` keeps customer records in memory, namespaced per `uid:<uid>` or
  `guest:<tabId>`. It writes **no** customer data to `localStorage`.
- The only app-owned browser keys are `lyka_welcomed` (UI flag) and `lyka_tab_id`
  (`sessionStorage`, random per-tab guest scope).
- Legacy owner-matched keys and the old RTDB node are read **once** after sign-in, merged into
  the backend, then local copies are purged. Guest/unattributable data is never uploaded.
- Firebase Auth's own SDK storage remains; it is required for refresh/session continuity and is
  never copied by application code.
- No app-owned IndexedDB, Cache Storage or service worker exists.
- On logout/account switch the in-memory owner state and queued writes are dropped; the next
  visitor cannot see the previous customer's data.
- Failed writes stay in an in-memory retry queue (retried on new writes, hydration completion,
  and browser `online`); nothing sensitive is used as a fallback cache.
- On refresh, signed-in records are re-hydrated from `GET /api/customer/*`; guest state is
  intentionally memory-only.

---

## 5. API, data-exposure and input hardening

- **Public enquiry response minimization** — `{id, status}` only. The id is the caller's own
  newly created row; duplicate submissions return a generic `409` without email or id.
- **Error handling** — generic `500` (`Internal server error.`) with `no-store`; validation
  errors are Pydantic `422`s; no stack traces, SQL, token contents or customer rows in errors.
- **No PII in URLs** — customer endpoints use no UID/email path or query parameters except the
  opaque inquiry `record_ref`/numeric id, which is still UID-filtered.
- **No PII in logs** — auth failures log only a generic message; security events store a hashed
  subject. Request bodies are not logged.
- **AI prompt boundary** — `/api/chat` receives only the user's message, session id and prior
  turns. Profile name/email/phone are not injected into the model prompt; the display name is
  used locally for greetings (`detectChatIntent`).
- **Input limits** — chat message ≤ 4,000 chars, session id ≤ 128 chars and restricted charset,
  history ≤ 50 turns, search limit ≤ 250, favorites ≤ 500, inquiries ≤ 200, chat turns ≤ 500,
  interactions ≤ 200; inquiry/chat/interaction fields have length and pattern bounds.
- **CORS** — explicit allowlist, no wildcard, credentials disabled; bearer token only.
- **Rate limiting** — 300 requests/minute/client IP by default, `429` + `Retry-After`; proxy
  header trust is off unless `TRUST_PROXY=1` is set behind a trusted proxy.
- **Cache** — every `/api/*` response is `no-store`, including `401`, `429` and `500`.
- **Browser headers** — API responses add `nosniff`, `DENY` framing, strict-origin referrer,
  restrictive permissions policy and a `default-src 'none'` CSP.
- **HTTPS** — opt-in enforcement/HSTS for production; local HTTP dev keeps working.

---

## 6. XSS, CSRF and sessions

- **XSS:** React 19 auto-escapes rendered content; a repository scan found no
  `dangerouslySetInnerHTML`, `innerHTML =`, `eval(` or `new Function(` in `src/`. Because the
  bearer token lives in Firebase SDK storage, XSS remains the highest-impact residual risk;
  a host-level CSP for the HTML shell is recommended in production (§10).
- **CSRF:** not applicable to the current design. The API accepts `Authorization: Bearer`
  headers, not cookies, and CORS credentials are disabled. Introducing cookie sessions without
  a full CSRF design would add risk, so it was deliberately not done.
- **Session expiry/refresh:** Firebase SDK refreshes tokens; persistence-critical customer
  writes call `getIdToken(true)` so an expired token cannot silently drop a save. Reads use the
  cached token. Invalid/expired sessions resolve to signed-out.
- **Sign-out:** Firebase `logout()`, staff cache clear, in-memory customer purge and chat close
  are performed together (`App.tsx` `handleLogout`; `UIAgentModal` close path).

---

## 7. Migration and data-preservation safeguards

- Only `uid:<verified-uid>` browser keys and RTDB `users/<same-uid>` are read; guest and other
  owners are excluded.
- Backend rows win; migration only fills missing favorites/inquiries/turns/interactions and
  missing profile/preferences/consent fields.
- `legacy_migrated_at` is set only after a successful commit; retries are safe and replays are
  ignored, so deleted records cannot be resurrected.
- A failed migration returns `502` and the client keeps its source data for a later retry.
- RTDB is never written or deleted; it remains as a backup.
- Local copies are purged only after a successful verified migration.
- No global `localStorage.clear()`, no key renaming/encoding/encryption as a security
  substitute, and no guest-to-account auto-upload.

---

## 8. Verification evidence (commands actually executed)

| Check | Result |
|---|---|
| Backend scripts, one isolated process each (temp SQLite) | **30/30 passed** |
| `python test_customer_records_ownership.py` | 48 checks passed |
| `python test_customer_portal.py` | 36 checks passed |
| `python test_api_hardening.py` | 17 checks passed |
| `python test_public_enquiry.py` | 17 checks passed |
| `python test_chat_enquiry_workflow.py` | 14 checks passed |
| `python test_recommendation_scoring.py` | 23 checks passed |
| `python test_lead_source.py` | 9 checks passed |
| `python test_discovery_source.py` | 23 checks passed |
| `npx vitest run` | **25 files / 281 tests passed** |
| `npx tsc -b` | clean (exit 0) |
| `npx oxlint` | exit 0, warnings only (pre-existing; includes the obsolete `frontend/` duplicate) |
| `npm run build` (`tsc -b && vite build`) | success; pre-existing chunk-size and ineffective-dynamic-import warnings only |

The four backend scripts that failed before this final pass were asserting fields the public
endpoint must no longer expose. They were updated to assert the minimal public reply and to
read the persisted score/attribution through the authenticated staff detail API — no private
field was re-exposed to make them pass.

---

## 9. Reversibility / change surface

All changes are uncommitted on `master` and can be reviewed with `git diff` / `git status`.
Rollback is a normal revert; no destructive migration was run against production data.

Primary files:

- frontend: `src/services/chatStore.ts`, `src/services/api.ts`, `src/services/rtdb.ts`,
  `src/App.tsx`, `src/pages/AccountPage.tsx`, `src/components/agent/*`,
  `src/utils/__tests__/*`;
- backend: `app/models.py`, `app/schemas.py`, `app/routers/customer.py`,
  `app/routers/leads.py`, `app/routers/security.py`, `app/main.py`,
  `app/database.py` (additive migration), plus new/updated `test_*.py`;
- docs: this report and `docs/STORAGE_AUDIT_2026-10-26.md`.

Preserved: Firebase Auth and sign-in methods, Firebase UIDs, staff roles, listings, CRM data,
favorites, chat data, existing RTDB backup, and the Ollama chatbot.

---

## 10. Remaining risks and required production configuration

1. **Production CORS allowlist** — set `CORS_ALLOWED_ORIGINS` to the real frontend origin(s).
   Without it the dev localhost allowlist applies.
2. **HTTPS/HSTS** — terminate TLS at the proxy and set `ENFORCE_HTTPS=1` and
   `ENABLE_HSTS=1` in production. Verify the proxy forwards `X-Forwarded-Proto`; set
   `TRUST_PROXY=1` only behind a trusted proxy, otherwise the rate limiter can be bypassed or
   spoofed.
3. **Security-event hashing** — set a strong, private `SECURITY_HASH_SALT` (the built-in
   fallback is a known constant) and, if alerting is wanted, `SECURITY_ALERT_WEBHOOK_URL`.
4. **Rate limiter scope** — in-memory, per process. It is defence-in-depth, not a substitute
   for an edge/WAF limiter in a multi-worker deployment; add a shared limiter or run one worker.
5. **Static-host headers/CSP** — the API sets CSP/HSTS, but the HTML shell is served by Vite/
   the host. Add a document CSP (accounting for Google Fonts, Firebase and the OpenAI realtime
   endpoint) and HSTS at the CDN/host.
6. **Legacy RTDB backup still contains PII** — owner-only rules remain, but it is frozen legacy
   data. After verifying migration, the operator should apply the agreed retention/export/
   deletion policy. This audit did not delete it.
7. **Pre-isolation localStorage on never-signed-in devices** — old global keys are not read or
   uploaded and are purged after a verified migration; they can remain on a device whose owner
   never signs in. Auto-quarantine was intentionally not enabled to avoid moving data before a
   recovery path is confirmed.
8. **No automated data-retention/erasure workflow** — backend chat/inquiry/interaction rows
   persist until an operator removes them. Define retention periods and a customer erasure
   process before launch.
9. **No independent penetration test or live two-device RTDB run** — coverage is automated
   unit/integration testing plus code review. A live staging test (two accounts, account
   switch, failed sync, RTDB rules denial) is recommended.
10. **Public enquiry spam/abuse** — duplicate suppression + rate limiting reduce but do not
    eliminate spam; add CAPTCHA/bot protection if the public form is targeted.
11. **SQLite at rest** — no application-level encryption. Rely on host/disk encryption and
    database access controls; staff with database access can read lead data by design.
12. **Bundle warnings** — the main chunk is >500 kB and `api.ts` is both statically and
    dynamically imported. Cosmetic today, but worth code-splitting; no secret is in the bundle
    (the Firebase web config is public by design; service-account keys stay server-side).
13. **Obsolete `frontend/` duplicate** — the repository still contains an older `frontend/`
    tree with pre-hardening storage code. The root `package.json` builds and tests the real app,
    so this copy is not deployed by the verified build; delete or archive it before any
    deployment/hand-off so the wrong folder cannot be shipped accidentally.

---

## 11. Conclusion

The customer-data storage and authorization objectives are met and verified:

- no customer names, emails, phones, full profiles, complete chat histories, inquiries,
  favorites, interactions or consent flags are written to custom browser storage;
- FastAPI/SQLite is authoritative, with records owned by the verified Firebase UID;
- anonymous users cannot reach private endpoints, customers cannot reach staff APIs, and
  customer A cannot read or modify customer B's records;
- public responses and errors no longer disclose customer/CRM data;
- legacy data moves only through an owner-matched, idempotent, non-destructive migration.

The remaining items are deployment/operational hardening (CORS/HTTPS/CSP/edge rate limiting,
RTDB retention, live staging verification), not missing application-level authorization.
