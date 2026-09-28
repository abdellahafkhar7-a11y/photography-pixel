# Phase 4H — Analytics UI

Status: **Complete — awaiting approval. Not committed, not pushed.**

This phase replaces the `/admin/analytics` placeholder with a real,
owner-only analytics page. Every number comes from the existing
`deliveries` / `delivery_activity` / `clients` tables. The completion rate is
derived from real status values and monthly buckets come from real
`created_at` dates. Nothing is fabricated.

---

## 1. Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `functions/admin/_lib/analytics-data.ts` | **new** | Read-only loader: status distribution, event counts, monthly buckets, recent activity, completion rate. |
| `functions/admin/_lib/analytics-views.ts` | **new** | `renderAnalytics(appUser, data)` with stats + four panels. |
| `functions/admin/analytics.ts` | modified | Owner-only route (was placeholder) with no-store headers. |
| `functions/admin/_lib/shell.ts` | modified | CSS fix: `min-width:0` on `.grid-2` and its children so wide tables inside panels scroll instead of overflowing the page. |

No migrations, no infra, no bindings, no public-site files.

---

## 2. Metrics (all real)

- Stats: total deliveries, total clients, completion rate (% up to video
  confirmation: confirmed + download_available + downloaded ÷ total),
  completed downloads (from `download_completed` events).
- **توزيع الحالات** — per-status counts + share of total.
- **نشاط التوصيلات** — counts per real event type (`link_opened`,
  `preview_viewed`, `video_confirmed`, `download_started`, `download_completed`,
  …) with real labels; zero-count types are hidden.
- **التوصيلات الشهرية** — buckets of real `created_at` dates by month.
- **آخر النشاطات** — the 8 most recent activity rows with client name.

Every list/table has a real empty state (e.g. "لا توجد تسليمات بعد").

---

## 3. Role behaviour

Owner-only (`requireOwner`), matching the existing RBAC and the coordinator nav
(analytics is not shown to coordinators). Coordinator access to
`/admin/analytics` returns HTTP 403 — verified.

---

## 4. Verification

- `npm run typecheck` ✅
- `npm run lint` (`--max-warnings=0`) ✅
- `npm run build` ✅ (no prerender diffs)
- Runtime QA (headless Edge + CDP) with 2 seeded deliveries + 7 seeded activity
  events (+2 trigger events, +? trigger rows):
  - Stats: `2 / 2 / 100٪ / 1`; status rows `تم التأكيد 1, تم التحميل 1`
    (50٪ each); event rows confirmed; monthly `شتنبر 2026 · 2`; recent list
    populated; owner nav 12.
  - Coordinator: `/admin/analytics` → **403**.
  - Responsive at 1440/1280/1024/768/430/390/375 — **0 horizontal overflow**
    (fixed a `grid-2` table overflow on phone widths; see §5).
  - Regression re-check on `/admin`, `/admin/portfolio`, `/admin/deliveries`,
    `/admin/clients`, `/admin/models` at 768/430/390/375 — all clean.
  - Result: **0 problems**. Seed data cleaned afterwards (deliveries=0,
    activity=0).
- `git diff` reviewed: changes limited to the intended files.

---

## 5. Note on the CSS fix

On phone widths, wide tables inside `.grid-2` panels were stretching the grid
track (CSS grid `min-width:auto`) and pushing the page wider than the
viewport. `.grid-2` and its direct children now have `min-width:0`, so the
tables scroll inside their own `.table-wrap` (the intended `overflow-x:auto`
behaviour). This also hardens the dashboard's `grid-2` panels.

---

## 6. Known limitations

- Activity events fetch is capped at 100 rows for counting; the list shows the
  most recent 8.
- No historical trend beyond month buckets; no cross-module funnels — anything
  more would require invented metrics or new tracking, which this phase
  deliberately avoids.