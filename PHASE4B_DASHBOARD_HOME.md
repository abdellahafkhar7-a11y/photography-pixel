# Phase 4B — Dashboard Home (Real Data)

Status: **Complete — awaiting approval. Not committed, not pushed.**

This phase turns `/admin` from the Phase 4A shell placeholder into the real
Photography Pixel Dashboard Home, powered entirely by live Supabase data.
It reuses the Phase 4A shell and design system unchanged; only the dashboard
home was implemented (no other modules).

---

## 1. Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `functions/admin/_lib/dashboard-data.ts` | **new** | Read-only server-side data loader for the dashboard. |
| `functions/admin/_lib/views.ts` | modified | `renderDashboard(appUser, data)` now renders the 7 real sections. `renderLogin` / `renderTeam` / `renderPlaceholder` unchanged. |
| `functions/admin/_lib/shell.ts` | modified | `statCard` accepts a real value; `panel` accepts an optional header action; dashboard section CSS + `:focus-visible` styles added. Design tokens untouched. |
| `functions/admin/index.ts` | modified | Loads dashboard data via the canonical service client and returns the response with `Cache-Control: private, no-store` + `X-Robots-Tag: noindex`. |

No migrations, no infrastructure, no Cloudflare bindings, no secrets, no
public-site files, and no Phase 1/2/3 backend logic were modified.

---

## 2. Sections implemented

1. **Welcome header** — `مرحبا، {full_name ?? email} 👋`, role pill, and the real
   current date rendered server-side with `Intl.DateTimeFormat('ar-MA', … ,
   timeZone: 'Africa/Casablanca')`.
2. **Main stat cards** — العملاء (real count), المشاريع (`—`, no projects model
   exists), تسليمات العملاء (real count), أعضاء الفريق (owner only).
3. **Client Delivery summary** — real per-status counts for all six existing
   `delivery_status` values; when there are none it shows
   `لا توجد عمليات تسليم حالياً` with an `إنشاء تسليم` → `/admin/deliveries/new`
   button; otherwise a `عرض كل التسليمات` → `/admin/deliveries` link.
4. **Recent activity** — real `delivery_activity` (latest 8) with the localized
   event label (`ACTIVITY_LABEL`), the related client name (via nested embed),
   and the date/time. Empty state: `لا توجد أنشطة حديثة`.
5. **Recent clients** — latest 5 real clients (name, WhatsApp, join date only —
   the columns that actually exist). Empty state: `لا توجد بيانات بعد`.
6. **Quick actions** — role-filtered, existing routes only:
   `إنشاء تسليم عميل` (`/admin/deliveries/new`), `عرض الأعمال`
   (`/admin/portfolio`); owner-only `العملاء` (`/admin/clients`) and `الفريق`
   (`/admin/team`).
7. **Portfolio overview** — a shortcut card to `/admin/portfolio` (no fabricated
   metric, since portfolio has no database count).

---

## 3. Data sources (real, read-only)

All queries run server-side with the canonical service-role client
(`createServiceClient` from `functions/_lib/supabase.ts`, typed with the full
`functions/_lib/db-types.ts` schema — the same client/row types the Client
Delivery module uses). No second database abstraction or duplicate model was
created, and no service-role key ever reaches the browser.

| Query | Table | Notes |
| --- | --- | --- |
| Delivery counts | `deliveries` | `select status`, aggregated in JS into the six status buckets. |
| Clients count | `clients` | `count: exact, head: true`. |
| Recent activity | `delivery_activity` | nested embed `deliveries ( clients ( name ) )`, `order created_at desc`, `limit 8`. |
| Recent clients | `clients` | `order created_at desc`, `limit 5`. |
| Team count | `app_users` | `count: exact, head: true` — **only queried for owners**. |

All queries are issued in parallel with `Promise.all`. Only data that is
displayed is queried. No client-side polling and no new API endpoints.

---

## 4. Role behavior

| | Owner | Coordinator |
| --- | --- | --- |
| Nav items | 12 | 8 |
| Team stat card | yes | **hidden** |
| Team count query | executed | **not executed** |
| `عرض جميع العملاء` link | yes | **hidden** |
| Delivery summary / activity / clients / quick actions / portfolio | yes | yes |

The coordinator still sees the recent-clients list because coordinators already
have access to client PII inside Client Delivery. The `عرض جميع العملاء` link is
owner-only because `/admin/clients` is an owner-only route (403 for
coordinators). Server-side RBAC in `_lib/auth.ts` / `_middleware.ts` remains the
security boundary — UI hiding is only cosmetic.

---

## 5. QA (local `wrangler pages dev` + real Supabase)

Environment: `npx wrangler pages dev . --port 8788 --compatibility-date=2026-09-24`
(loads `.dev.vars`), driven through headless Edge via CDP. Logged in with the
real owner and coordinator accounts.

**Populated path** (temporary seed: 2 deliveries in different statuses + 4
activity rows, then removed):

- Owner `/admin` @ 1440/1280/1024/768/430/390/375 — nav 12, no horizontal
  overflow at any width, 4 stat cards (`العملاء=2`, `المشاريع=—`,
  `تسليمات العملاء=2`, `أعضاء الفريق=2`), 6 status rows, activity rows with
  client names, 2 recent clients, greeting, quick actions, portfolio card.
- Coordinator `/admin` @ 1280/375 — nav 8, no overflow, 3 stat cards (no team),
  no `عرض جميع العملاء` link, delivery summary/activity/clients still shown.
- `/admin/client-delivery` → 302; unauthenticated `/admin` → login; public `/`
  and `/portfolio` → 200.

**Empty path** (after seed removal — current live state: 0 deliveries, 0
activity, 2 clients):

- `تسليمات العملاء=0`, `0` status rows, `لا توجد عمليات تسليم حالياً` + `إنشاء
  تسليم`, `0` activity rows + `لا توجد أنشطة حديثة`; real clients list intact.

**Seed cleanup verified:** `deliveries = 0`, `delivery_activity = 0`,
`clients = 2` (untouched). No test data remains.

---

## 6. Gates

- `npm run typecheck` — pass
- `npm run lint` (`--max-warnings=0`) — pass
- `npm run build` — pass; deterministic (no prerender output diffs)

## 7. Security verification

- Service-role client used only in the server function; never serialized to the
  browser.
- Dashboard response sets `Cache-Control: private, no-store` and
  `X-Robots-Tag: noindex`.
- No changes to auth, RBAC, R2, cleanup worker, bindings, or secrets.
- All rendered values are HTML-escaped.

## 8. Phase 1/2/3 untouched

`git status` shows exactly the four admin files above. No Phase 1/2/3 backend,
migration, infrastructure, or public-site file was modified.
