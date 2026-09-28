# Phase 4F — Clients + History UI

Status: **Complete — awaiting approval. Not committed, not pushed.**

This phase replaces the `/admin/clients` placeholder with a real, owner-only
Clients module backed by the existing `clients`, `deliveries` and
`delivery_activity` tables. Every value comes from the database; nothing is
invented and no data is written. The Client Delivery backend, RBAC, RLS and the
public private-link flow are untouched.

---

## 1. Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `functions/admin/_lib/clients-data.ts` | **new** | `listClients(service)` (clients + delivery counts) and `loadClientDetail(service, id)` (client, deliveries desc, activity desc, limited to 100). |
| `functions/admin/_lib/clients-views.ts` | **new** | `renderClients(appUser, items, options)` and `renderClientDetail(appUser, detail)`. |
| `functions/admin/clients.ts` | modified | Owner-only list route: `requireSession` + `requireOwner`, optional `q` search, no-store headers. |
| `functions/admin/clients/[id].ts` | **new** | Owner-only detail route: UUID validation, 404/500 handling, no-store headers. |
| `functions/admin/_lib/delivery-views.ts` | modified | `statusBadge` / `sourcePill` exported for reuse; search filter hardened (see §5). |

No migrations, no infrastructure, no bindings, no secrets, no public-site files
and no backend logic were modified.

---

## 2. Routes

| Route | Role | Content |
| --- | --- | --- |
| `/admin/clients` | **owner only** | Stats (total clients, total deliveries), search by name/WhatsApp, table (name, WhatsApp, delivery count, created date, detail link). |
| `/admin/clients?q=…` | **owner only** | Server-side filtered list with a real empty state. |
| `/admin/clients/{id}` | **owner only** | Client info card + WhatsApp (`wa.me`) button, related deliveries table (source, status, created, confirmed, downloaded, open link), and activity history table (event, delivery ref, date). |

The coordinator is denied on both routes by `requireOwner` (server-side, HTTP
403), independent of any UI hiding.

---

## 3. Data sources

- `clients` — `id`, `name`, `whatsapp_number`, `created_at`, `updated_at`.
- `deliveries` — filtered by `client_id`, ordered by `created_at desc`.
- `delivery_activity` — for the client's deliveries, ordered by `created_at desc`,
  capped at 100 rows.

Status/source labels and badges are reused from the Phase 4C delivery views.
A database trigger (`handle_delivery_created`) auto-writes the
`delivery_created` activity row; the UI simply displays what exists.

---

## 4. Verification

- `npm run typecheck` ✅
- `npm run lint` (`--max-warnings=0`) ✅
- `npm run build` ✅ (no prerender diffs)
- Runtime QA (headless Edge + CDP) with one seeded delivery + activity, owner and
  coordinator:
  - List: owner nav 12, 2 clients, total deliveries 1, search present, detail
    link correct.
  - Search: a non-matching query returns the real empty state (1 row).
  - Detail: 4 info cells, WhatsApp button, 1 delivery row, 2 activity rows
    (trigger `delivery_created` + seeded `video_confirmed`).
  - Responsive at 1440/1280/1024/768/430/390/375 — **0 horizontal overflow**.
  - Coordinator: `/admin/clients` returns **403** ("غير مصرح"), nav 0.
  - Result: **0 problems**. Seed data cleaned afterwards (deliveries=0,
    activity=0).
- `git diff` reviewed: only the files above changed; no unrelated edits.

---

## 5. Bug found and fixed during QA

The WhatsApp branch of the search filter used
`whatsapp.includes(query.replace(/\D/g, ''))`. For a query with no digits the
stripped string is `""`, and `String.includes("")` is always `true`, so any
non-name query matched every row. Fixed in both `clients-views.ts` and
`delivery-views.ts` by only applying the WhatsApp match when the stripped query
is non-empty (`queryDigits.length > 0`).

---

## 6. Known limitations

- Client detail activity is capped at the 100 most recent events.
- Client records are read-only here; creation/editing of clients is not part of
  this phase.
- `/admin/clients` is owner-only to match the current RBAC. If coordinators are
  later granted access, that must be a deliberate RBAC change (server-side), not
  a UI toggle.
