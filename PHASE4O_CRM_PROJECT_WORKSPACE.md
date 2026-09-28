# Phase 4O — CRM Project Workspace

**Status: COMPLETE (uncommitted — do not commit/push)**
This report supersedes the interim notes; it documents what was built when the phase was
paused, what was finished on resume, and the full verification matrix.

---

## 1. Goal

Turn *Clients* into the root of a project/session CRM:

```
Client
  ↓
Project / Session
  ├── Model (optional, real models table)
  ├── Shoot information (date / time / location / planned video count)
  ├── Script (optional, reused by the WhatsApp builder)
  ├── Tasks (todo → in_progress → done)
  ├── Video Slots  (reused client_video_slots, no second slot system)
  │     └── Delivery  (existing 4N page remains authoritative)
  │           └── Versions / confirm / release / 72h / download
  ├── Notes (owner-only)
  └── Activity (project-scoped timeline)
```

Everything is **additive**. Phase 4N/4M behavior (R2 multipart ≤1 GB, stable
`/p/<identifier>-<secret>` links, versioning, confirmation, release, VIEW_ONLY /
VIEW_AND_DOWNLOAD, 72h window, R2 cleanup, activity logging, portfolio, auth/RBAC,
admin shell) is untouched and re-verified by regression below.

---

## 2. Migration

`supabase/migrations/20260927000010_crm_projects.sql` — **applied** to the dev DB
(verified: `projects`, `project_tasks`, `project_activity` exist; `client_video_slots`
carries `project_id`/`kanban_status`/`kanban_order`/`notes`).

Additive only, nothing dropped:

1. **Enums** — `project_status` (new/contacted/booked/shooting/editing/review/
   delivery/completed/archived), `kanban_status` (todo/editing/review/ready/done),
   `task_status` (todo/in_progress/done), `task_priority` (low/medium/high),
   `payment_status` (unpaid/partial/paid). Grants: `service_role` only; revoked from
   `anon`/`authenticated`.
2. **`projects`** — client_id (FK, cascade), name, unique project_code, status +
   status_prior (for archive restore), model_id (FK set-null), planned_video_count,
   shoot_date/shoot_time/location, script, notes, total_price/advance/payment_status,
   created_by, timestamps + `set_updated_at` trigger, indexes on client/status/shoot/model.
3. **`client_video_slots` EXTENDED** (not duplicated): `project_id` (FK set-null),
   `kanban_status`, `kanban_order`, `notes`. Legacy plan slots (`project_id IS NULL`)
   keep the existing behaviour; the existing partial-unique delivery index and the
   `(client_id, position)` planning constraint are untouched. Partial index on
   `(project_id, kanban_status, kanban_order)`.
4. **`project_tasks`** — project_id FK cascade, title, status, priority, assignee_id
   → `app_users` (set-null), due_date, sort_order, completed_at, timestamps + trigger.
5. **`project_activity`** — project-scoped timeline (type + metadata jsonb). Delivery
   events remain in `delivery_activity`.
6. **RLS** — enabled on all three new tables, zero policies, everything through the
   server-side `service_role` client (same pattern as 000003/000009).

---

## 3. Routes

| Route | Purpose |
|---|---|
| `GET/POST /admin/projects` | List page: 4 stat cards, filter bar (status/date/model/client/search), status agenda for upcoming shoots, all-projects table. `?new=1` opens the create modal; `?new=1&client_id=…` preselected client; `?new=1&name=…&video_count=…&model=…` prefills (used by dashboard quick-add). Owner-only. |
| `GET/POST /admin/projects/[id]` | The **workspace**: tabs نظرة عامة / الفيديوهات / المهام / التسليم / النشاط. Video actions (move_slot, prepare_slot), task CRUD (add/edit/set_task/delete), set_status/archive/unarchive, set_profile (reconciles slot count non-destructively), record_sent. Owner-only, no-store + noindex. |
| `GET /admin/project-video-thumb?project=&slot=` | Serves the active version's thumbnail (r2_thumb_key) from private R2 for kanban cards. 404 when the project/slot doesn't exist or no thumb key (see Known limitations). Owner-only, no-store. |
| `GET /admin/search` | General search across clients/projects/deliveries/slots/messages; project name matches now included (project_code + name + client name + mode). |

All new admin routes: `requireSession` + `requireOwner`, `sameOrigin` CSRF on POST,
`Cache-Control: private, no-store` + `X-Robots-Tag: noindex`.

---

## 4. New / modified files

New (untracked):
- `functions/admin/projects.ts`, `functions/admin/projects/[id].ts`
- `functions/admin/project-video-thumb.ts`
- `functions/admin/search.ts`, `functions/admin/_lib/search-views.ts`
- `functions/admin/_lib/projects-data.ts`, `functions/admin/_lib/projects-views.ts`
- `supabase/migrations/20260927000010_crm_projects.sql`

Modified for integration:
- `functions/admin/_lib/clients-data.ts`, `functions/admin/_lib/clients-views.ts`
  — slot upserts scoped `.is('project_id', null)` so project slots are never touched;
  client workspace gains a «مشاريع العميل» panel (by-status counts, «مشروع جديد»
  prefill, open link) between the slots and deliveries cards.
- `functions/admin/_lib/models-views.ts` — per-model «المشاريع» button →
  `/admin/projects?model={id}`.
- `functions/admin/_lib/dashboard-data.ts`, `functions/admin/_lib/views.ts` —
  real المشاريع stat + «جلسات اليوم» panel (today's shoots from `projects.shoot_date`).
- `functions/_lib/db-types.ts`, `functions/admin/_lib/db.ts`,
  `functions/admin/_lib/types.ts` — new row/view types.

---

## 5. Kanban (Trello-style)

- Columns **جديد | قيد المونتاج | المراجعة | جاهز | مكتمل** (todo/editing/review/
  ready/done), driven by `client_video_slots.kanban_status`/`kanban_order`.
- Desktop drag & drop with drop-column ordering; mobile/fallback via in-card
  `<select class="kb-move">`. Both go through `POST move_slot` (server-side,
  persistent, then reload) — no client-only state.
- Card shows: gradient thumb block (video number + play icon, or `<img>` when a
  thumb key exists), title (`فيديو N` / planned count, «خارج الخطة» badge when paused),
  model + notes, status pill, delivery mode badge, version chip (ن-1 · أنشط v1), a
  status selector, and either «تجهيز الرابط» (prepare_slot) or «التوصيل» link to the
  existing delivery page.
- Thumb `onerror` masks missing keys so a card never shows a broken image.

## 6. Tasks

- Board columns جديدة / قيد التنفيذ / مكتملة (todo/in_progress/done), assignee from
  `app_users`, priority, due date, created/completed timestamps. `createTask`,
  `updateTask`, `setTaskStatus`, `deleteTask` all record `project_activity` events.

## 7. Overview / Script / WhatsApp

- Editable project profile (name, client linkbox, model select, video count,
  shoot date/time, location, payment status, total price, advance, script).
- Changing `planned_video_count` **reconciles slots non-destructively** — only adds
  or pauses, never drops an uploaded video, delivery, version or R2 object.
- Owner-only notes card («ملاحظات المالك فقط»).
- Live WhatsApp message built from current model/client/count/date/time/location and
  the script **if present** (empty sections auto-omitted) → `wa.me` link + copy +
  «تسجيل الإرسال» (`record_sent` → activity).

## 8. Delivery / Archive / Activity

- «تجهيز الرابط» calls the existing `createSlotDelivery` (stored proc) and renders
  the existing delivery detail paused with a one-time fresh link — identical to the
  4N prepare path. «التوصيل» opens `/admin/deliveries/[id]`; versioning, confirm,
  release, download, 72h window are all untouched/re-verified.
- Archive/unarchive toggles status↔status_prior and **never deletes** videos, R2
  objects, deliveries, versions or activities.
- `project_activity` timeline records project_created, slot_moved, task_created,
  task_status, payment_updated, shoot_updated, message_sent, project_archived,
  project_unarchived, status_changed, delivery_created, new_version … rendered to
  plain text (no `[object Object]`).

---

## 9. QA matrix

All gates clean:
- `npm run typecheck` — 0 errors
- `npm run lint` (eslint `functions/**/*.ts` --max-warnings=0) — 0 warnings
- `npm run build` (prerender) — 13 pages + sitemap 14 URLs (4O routes are worker
  functions, not prerendered)

Browser/HTTP QA (dev server `wrangler pages dev . --port 8788`, Edge headless CDP :9330):

| Suite | Result |
|---|---|
| `qa4o.mjs` — Phase 4O end-to-end | **61/61 PASS** |
| `smoke4n.ps1` — Phase 4N smoke | **24/24 PASS** |
| `qa4n.mjs` — Phase 4N CDP (upload → delivery → version) | **30/30 PASS** |
| Model→projects link probe | 6 per-model «المشاريع» buttons → `/admin/projects?model={id}` |
| curl (no session) | `/admin/projects`, `/admin/projects/{id}`, `/admin/search`, `project-video-thumb` → all 302 → `/admin/login` |

`qa4o.mjs` covers: client create, list page (4 stats, create button, filter bar,
agenda + table), modal create with prefill, kanban 5 columns in order, 3 plan cards,
kanban move + persistence, tasks add/set-status persistence, overview profile
(price 1200 / advance 400 / partial), record_sent, prepare → fresh
`/p/<id>-<secret>` link (rendered exactly once), R2 upload of a fake 1.5 MB mp4 →
active version chip `ن1` + delivery link, re-prepare «جاهزة مسبقاً», thumb 404 → masked
placeholder, archive/unarchive, status → shooting, activity timeline with labels and
no `[object Object]`, remaining = 800, search (project + client + empty + no error),
client projects panel (row + «مشروع جديد» prefill + open link), dashboard
المشاريع stat (real count, excludes archive, 「غير متضمنة الأرشيف」 caption) +
جلسات اليوم panel, unauth workspace → 302, unknown-slot/project thumb → 404,
no-store + noindex headers, 390 px no horizontal overflow.

---

## 10. Known limitations & notes

- **Thumbnails (app-wide, pre-existing):** R2 uploads never write `r2_thumb_key`
  (no thumbnail pipeline exists anywhere, incl. 4N). `/admin/project-video-thumb`
  (like `/p/[token]/thumb`) correctly returns 404 when the key is null and the
  kanban masks the img so no broken image shows. Generating real thumbs is a
  separate future feature, not part of 4O.
- **جلسات اليوم** panel shows projects whose `shoot_date` is today; with the QA
  projects scheduled 2026-10-01 the list is empty today (asserted as expected).
- QA data (`QA4O Client …` / `QA4O Project …`, QA tasks, one small mp4 per run in
  private R2) is **kept in the dev DB/R2**, following the established
  prefix-policy of prior phases (T4N/Smoke data is also deliberately preserved).
  Nothing was deleted; no baseline 4N data touched.
- Per-model filter on the projects list also powers the model-page button; client
  filter is `client_id` (used by the client-panel prefill link).

---

## 11. Final state

- Completed on resume: hardened `qa4o.mjs` assertions (strict `ok(cond, msg)`),
  corrected task-status E2E, thumb-mask onerror in `projects-views.ts`, verified
  unauth 302s, model→projects link, ran 4N regressions, re-ran gates.
- **Nothing left for 4O**; report written uncommitted as required. No commits, no push.