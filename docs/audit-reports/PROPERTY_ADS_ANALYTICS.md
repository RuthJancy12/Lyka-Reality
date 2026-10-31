# Property Advertising Analytics

## What this adds

Real, persistent, deduplicated advertising analytics for the existing LYKA
catalogue and CRM inventory.

- `property_ads` mirrors existing listings by their existing id (`LYK-*` from
  the CSV catalogue, `CRM-*` from `crm_properties`). It does not create or
  renumber properties.
- `property_ad_events` stores one row per real interaction:
  `impression`, `view`, `whatsapp_click`, `enquiry`, `site_visit_scheduled`,
  `booking`.
- Public clients may only submit `impression`, `view`, and `whatsapp_click`.
  Conversion events are written by the backend flow that owns the underlying
  `Lead` or `Viewing` row.
- `leads.property_ref` attributes enquiries/bookings to a real listing. It is
  nullable; legacy leads are backfilled from `LYK-*` / `CRM-*` references in
  their raw enquiry text.

## API

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/property-analytics/events` | Public | Record impression/view/WhatsApp click |
| GET | `/api/property-analytics/overview` | Staff | KPI aggregates for a date range |
| GET | `/api/property-analytics/ads` | Staff | Server-side filtered/paginated ad table |
| GET | `/api/property-analytics/filters` | Staff | Distinct real filter values |
| PATCH | `/api/property-analytics/ads/{property_ref}` | Admin/Manager | Pause or resume an ad |

Date ranges: `range=today|week|month|custom`. Custom requires ISO `start` and
`end` dates. Range filters apply to event metrics; inventory counts are current
state (`active_listings`, `new_listings_this_month`) plus
`listings_published_in_range`.

Ad table filters: search, location, project, property type, listing type,
availability, min/max price, active/paused, sort, page, per-page (max 100).

## Dedupe rules

`property_ad_events.dedupe_key` is `UNIQUE`.

| Event | Dedupe bucket |
|---|---|
| impression | visitor + property + UTC day |
| view | visitor + property + UTC hour |
| whatsapp_click | visitor + property + UTC minute |
| enquiry | one per lead id |
| site_visit_scheduled | one per viewing id |
| booking | one per lead id while lead is `closed` |

Visitor ids are random browser values. Only a salted SHA-256 hash is stored.
`ANALYTICS_HASH_SALT` can be set in the environment.

Reopening or losing a closed lead removes its booking event so the funnel does
not retain an invalid conversion. Cancelling a viewing removes its site-visit
event.

## Definitions

- **Impression**: card became at least 35% visible; same visitor/property/day
  counted once.
- **View**: property detail modal opened; same visitor/property/hour once.
- **Enquiry**: a saved `Lead`, linked to an existing listing.
- **WhatsApp click**: click on the property's WhatsApp consultant link.
- **Site visit**: a scheduled `Viewing`.
- **Booking**: a `closed` lead linked to an existing listing.
- **Enquiry conversion rate**: bookings ÷ enquiries in the selected range.
- **New listings this month**: `property_ads.published_at` in the current UTC
  month. CSV dates derive from each row's real `listed_days_ago`; CRM dates use
  `created_at`. Published timestamps remain stable across restarts.

## Frontend

- `/crm/ads`: KPI cards, period controls (today/week/month/custom), filters,
  sorting, server-side pagination, and pause/resume for admin/manager.
- `PropertyCard`: IntersectionObserver impression tracking.
- `PropertyModal`: modal-view tracking and WhatsApp click tracking.
- `AdminDashboard`: removed the fabricated `78% / 42% / 29% / 18m` conversion
  fallbacks and fake channel labels; missing data now shows `—` or an explicit
  no-data message.

## Startup and migration

On startup:

1. `init_db()` creates new tables and applies the additive Postgres/SQLite
   `leads.property_ref` migration.
2. `init_property_dataset()` loads the real CSV catalogue.
3. `seed_property_ads()` idempotently mirrors existing CSV + CRM listings.
4. `backfill_events()` creates missing enquiry/booking/viewing events for
   pre-existing records.

Both sync steps are idempotent. Pausing an ad does not rewrite any property
record; it excludes the ref from the public catalogue through a cached paused
set and hides it from `/api/properties/search`.

## Verification

Run from `backend/`:

```powershell
.\.venv\Scripts\python.exe test_property_ads_analytics.py
```

The test uses an isolated temporary SQLite database and the real 3,000-row
`lyka_dubai_properties.csv`. Latest run: **87 checks passed**.

Measured on the full existing inventory (3,020 ads = 3,000 catalogue + 20 CRM):

- paginated ads query: ~12–25 ms median, ~14–25 ms p95
- overview aggregate: ~7–20 ms median, ~12–60 ms p95

Existing regression tests also passed:
`test_public_enquiry.py` (15), `test_crm_roles_api.py` (44),
`test_calls_audit_analytics.py` (35), `test_staff_create.py` (41),
`test_lead_list.py` (16), `test_lead_assign.py` (29).

Frontend: `npm run build` succeeded. `npm run lint` reports warnings only (the
codebase already has similar warnings).

## Limitations

- Existing real inventory is 3,020 ads (3,000 CSV + 20 CRM), not 5,000. No
  synthetic listings were added. Indexes and bounded server-side pagination are
  sized for 5,000+, but a 5,000-row benchmark was not fabricated.
- Paused-ad exclusion is an in-process cache refreshed by the analytics API.
  With multiple backend workers, other workers refresh on restart or their next
  startup sync; a shared cache/pub-sub would be needed for instant cross-worker
  invalidation.
- Booking means a closed lead linked to a listing; there is no separate
  booking/payment object in the existing CRM schema.
- Tracking requires JavaScript. Ad blockers or offline clients are not counted.
- The CSV catalogue file must exist at the path expected by
  `property_service.CSV_PATH` at runtime; otherwise only CRM inventory is
  mirrored.
