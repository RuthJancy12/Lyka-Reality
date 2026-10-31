# LYKA Realty — Storage & Persistence Audit (2026-10-26)

**Status: final for this change set.** This supersedes the cache-mirror model described in
`docs/SECURITY_AUDIT_2026-10-24.md`. The FastAPI backend is now the source of truth for
customer data; custom browser storage holds only non-sensitive UI/scoping metadata.

Scope: every `localStorage`, `sessionStorage`, IndexedDB, browser-cache and Firebase
Realtime Database (RTDB) use; every customer-facing API response; and the frontend state
that mirrors backend records.

Files audited: `src/App.tsx`, `src/pages/AccountPage.tsx`,
`src/components/agent/{UIAgentModal,LykaAuthPanel,LykaOnboardingPanel,LykaRecordsPanel}.tsx`,
`src/context/AuthContext.tsx`, `src/services/{chatStore,api,rtdb,firebase}.ts`,
`src/utils/chatIdentity.ts`, `src/utils/chatIds.ts`, all tests under `src/utils/__tests__/`,
`backend/app/{main,models,schemas,database}.py`,
`backend/app/routers/{customer,leads,security}.py`, and
`backend/app/services/{roles,firebase_auth,security_monitor,ollama_chat_service}.py`.

---

## 1. Final browser-storage inventory

`{owner}` means `uid:<firebaseUid>` for a signed-in customer or `guest:<tabId>` for a
signed-out guest. The tab id is random and lives only in `sessionStorage`.

| # | Key / namespace | Former content | Current handling | Classification | Status |
|---|---|---|---|---|---|
| 1 | `lyka_welcomed` | `"1"` first-visit flag | localStorage UI flag only; removed on logout | Non-sensitive | Kept (allowed) |
| 2 | `lyka_tab_id` | `tab_<uuid>` | sessionStorage; per-tab guest scope; dies with the tab | Non-sensitive | Kept (allowed) |
| 3 | `lyka_profile_user_{owner}` | name, email, phone, city, country, discovery/UTM | **No longer written.** Read once only if `owner` matches the verified UID; migrated to `customer_profiles`, then removed | Sensitive (PII) | Read-once → migrated → purged |
| 4 | `lyka_profile_prefs_{owner}` | locations, budgets, type, bedrooms, purpose, timeline | **No longer written.** Same owner-matched one-time migration → `customer_profiles.preferences`, then removed | Medium | Read-once → migrated → purged |
| 5 | `lyka_favorites_{owner}` | property-ID array | **No longer written.** Owner-matched migration → `customer_favorites`; guest copies never uploaded; demo seed is in-memory only | Non-sensitive | Read-once → migrated → purged |
| 6 | `lyka_inquiries_{owner}` | inquiry snapshots + status | **No longer written.** Owner-matched migration → `customer_inquiries`; guest copies never uploaded | Sensitive | Read-once → migrated → purged |
| 7 | `lyka_chat_v2_{owner}_{sessionId}` | full conversation turns | **No longer written.** Owner-matched migration → `customer_chat_messages`; guest copies never uploaded; live guest chats are in-memory/tab-only | Sensitive | Read-once → migrated → purged |
| 8 | `lyka_last_chat_v2_{owner}` | last session id | **No longer written.** Migration reads it only inside the verified owner scope; live state is in memory | Medium | Read-once → purged |
| 9 | `lyka_interactions_{owner}` | consent-gated view/search/filter events | **No longer written.** Owner-matched migration → `customer_interactions`; live events are in-memory/backend | Non-sensitive (opt-in) | Read-once → migrated → purged |
| 10 | `lyka_tracking_consent_{owner}` | `"1"` / `"0"` | **No longer written.** Owner-matched migration → `customer_profiles.tracking_consent` | Non-sensitive | Read-once → migrated → purged |
| 11 | `lyka_legacy_*` | byte-identical quarantine copies of pre-isolation keys | Never read, displayed or uploaded; removed after the owning account's verified migration succeeds | Varies (was sensitive) | Quarantined / purged after verified migration |
| 12 | `lyka_legacy_quarantined_v1` | one-time quarantine marker | Removed together with the quarantined copies | Non-sensitive | Cleaned up |
| 13 | Pre-isolation globals: `lyka_profile_user`, `lyka_profile_prefs`, `lyka_inquiries`, `lyka_favorites`, `lyka_last_chat_session`, `lyka_chat_turns_*` | Old global records | Never read by live code; `quarantineLegacyChatData()` remains available but is not called automatically; a signed-in migration purges `lyka_legacy_*` once verified | Sensitive | Not auto-adopted; see residual risk |
| 14 | Firebase Auth session | SDK-managed ID/refresh token + user record (IndexedDB/localStorage) | Owned by Firebase SDK; app never reads/writes/copies these entries | Authentication credential (SDK) | Unavoidable, SDK-managed |
| 15 | IndexedDB / Cache Storage / Service Worker | — | No app-owned IndexedDB, Cache Storage or service worker exists in `src/` or `public/` | — | None |
| 16 | Firebase RTDB `users/{uid}/{profile,prefs,favorites,inquiries,turns}` | Previous live owner-scoped cloud mirror | **No live writes.** Read once per verified UID for migration; left untouched as a backup | Sensitive at rest | Frozen legacy backup |

**Never written to custom browser storage by current code:** names, emails, phone numbers,
full profiles, complete chat histories, inquiry snapshots, saved-property lists, behavioural
events, Firebase ID/refresh tokens, passwords, service-account keys or staff roles.

`chatStore.ts` is a per-tab, per-owner **in-memory** store; it only *reads* legacy keys during
the one-time migration and only writes `lyka_tab_id` (guest scope).

---

## 2. What moved to the backend (source of truth)

| Data | Backend store | Endpoint(s) | Ownership rule |
|---|---|---|---|
| Profile + preferences + consent + attribution | `customer_profiles` | `GET/PUT /api/customer/profile`, `GET/PUT /api/customer/preferences`, `GET/PUT /api/customer/tracking-consent` | `firebase_uid` from verified token; profile writes require a UID-bearing token; no uid is accepted in body/path |
| Saved properties | `customer_favorites` (unique `uid + property_id`) | `GET/PUT /api/customer/favorites` | Replace-all is filtered by token UID |
| Enquiries | `customer_inquiries` (unique `uid + record_ref`) + CRM `leads` | `GET/POST /api/customer/inquiries`, `PATCH /api/customer/inquiries/{id}` | Reads/updates always filter token UID; id fallback is still UID-filtered |
| Authenticated chat history | `customer_chat_sessions`, `customer_chat_messages` (unique `uid + message_ref`) | `GET /api/customer/chat/latest`, `POST /api/customer/chat/turns` | Session/message lookups filter token UID |
| Consent-gated interactions | `customer_interactions` (unique `uid + event_ref`) | `GET/POST /api/customer/interactions` | Token UID only |
| One-time legacy import | same tables + `customer_profiles.legacy_migrated_at` | `POST /api/customer/migrate/legacy` | Token UID; idempotent; existing backend values win |
| Public website enquiry | CRM `leads` | `POST /api/leads/public` | Anonymous by design; reply is `{id, status:"received"}` only |

Live guest state (chat, favorites, inquiries, interactions, consent before sign-in) stays in
the tab's memory and disappears on refresh/tab close. Nothing is uploaded when a guest later
signs in.

---

## 3. Unavoidable non-sensitive browser state

1. `lyka_welcomed` — first-visit UI preference.
2. `lyka_tab_id` — random per-tab guest namespace (no identity value).
3. Firebase Auth's SDK-managed session (`IndexedDB`/`localStorage`) — required for sign-in to
   survive refresh and for the SDK to mint ID tokens. This is authentication infrastructure,
   not app-copied customer data; the app never enumerates or exports it.
4. `lyka_legacy_*` quarantine copies on devices that have not yet completed a verified
   owner migration (see §6) — retained for recovery, never read or uploaded.

No other customer metadata is intentionally retained in the browser.

---

## 4. Runtime lifecycle checks

Automated (jsdom) coverage in `src/utils/__tests__/customerStorageSecurity.test.ts`,
`customerInquiryApi.test.ts`, `chatIsolation.test.ts`, `favorites.test.ts`,
`propertyInteractions.test.ts`; backend ownership/authorization coverage in
`backend/test_customer_records_ownership.py` (48 checks, two real customer UIDs) and
`backend/test_customer_portal.py`:

| Scenario | Verified behaviour |
|---|---|
| Sign-in + hydration | Records arrive through `/api/customer/*` and live in memory; `localStorage` stays empty; `sessionStorage` contains only `lyka_tab_id` |
| Customer write | Request goes to the token-owned API; no UID is present in body/path; no storage write |
| Logout | Previous owner's in-memory state and queued writes are dropped; backend rows remain |
| Account switch A → B | A's memory is purged before B hydrates; B cannot see A's records |
| Refresh | UI re-hydrates from the backend (authenticated) or starts an empty tab (guest) |
| Failed sync | Change stays in the in-memory retry queue; nothing is written to storage; a banner reports pending/error |
| Failed hydration | No fallback to stale browser data and no storage writes |
| Guest chat/favorites/inquiries/interactions | Memory only; not written to localStorage and never uploaded |
| Legacy migration | Only `uid:<verified-uid>` keys plus that UID's RTDB node are read/merged; guest keys are excluded; success purges migrated/guest/quarantined local keys; failure keeps the source data for retry |

Manual/live two-device RTDB testing was **not** performed in this environment; the migration
path is covered by unit tests and the backend idempotency tests.

---

## 5. Migration safeguards

- **Owner match first:** only keys under `uid:<verified-uid>` and RTDB `users/<same uid>` are
  read. No guest key and no other UID's key can enter the payload.
- **No auto-upload of guest history:** guest state is memory-only.
- **Backend wins:** `migrate/legacy` only fills missing rows/fields; profiles/preferences use
  newest-wins only between the user's own legacy copies, never over newer backend edits.
- **Idempotent + non-destructive:** `legacy_migrated_at` is written only after a successful
  commit; replays return `migrated:false`; failure returns `502` and leaves browser data intact.
- **No deletion before verification:** local copies are purged only after the migration call
  succeeds. RTDB is never deleted or rewritten.
- **No key renaming as a security control:** keys are kept only as read-only legacy names; the
  values are moved to the backend, not hidden/encoded/encrypted client-side.
- **Refresh survival:** authenticated data comes from `GET /api/customer/*`; no browser cache
  is required for the app to restore saved data.

---

## 6. Residual browser-storage risks (honest)

1. **Pre-isolation global keys on old devices.** If a device still holds unprefixed keys
   (`lyka_profile_user`, `lyka_inquiries`, …) and its owner never signs in, they remain on
   disk. They are never read, displayed or uploaded by current code; they are purged after a
   verified owner migration. Auto-quarantining them at boot was intentionally not enabled to
   avoid moving data before a recovery path is confirmed.
2. **Guest legacy copies are purged on a successful sign-in migration** (they are
   unattributable and can never be safely uploaded). This is intentional, but it means a guest
   who never signs in keeps their old copies while a later sign-in on the same device removes
   them.
3. **Firebase Auth session** remains in SDK storage and is readable by any script running on
   the origin — hence the importance of XSS prevention (see the security report).
4. **No live browser/device verification** of RTDB read permissions was possible here; RTDB is
   no longer live but still contains a backup copy under existing owner-only rules.
5. **Obsolete `frontend/` duplicate** still contains the older storage model. It is not part of
   the root build/tests and should be deleted or archived before deployment.

---

## 7. Verification commands (all executed 2026-10-26)

| Check | Result |
|---|---|
| `npx vitest run` | **25 files / 281 tests passed** |
| `npx tsc -b` | clean (exit 0) |
| `npx oxlint` | exit 0, warnings only (pre-existing; includes the obsolete `frontend/` duplicate) |
| `npm run build` | success (`tsc -b && vite build`; pre-existing >500 kB chunk warning) |
| Backend `test_*.py`, one process each | **30/30 scripts passed** (including `test_customer_records_ownership.py`, 48 checks) |

---

## 8. Conclusion

Current code no longer persists customer profiles, preferences, favorites, inquiries, chat
history, interactions or consent in custom browser storage. Those records are read from and
written to the FastAPI backend under a verified Firebase UID, with per-tab in-memory state for
guests. Remaining browser state is limited to two non-sensitive app flags plus the
SDK-managed Firebase session and legacy recovery copies described above.
