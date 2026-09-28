# Phase 4Q — Daily Production Workspace (لوحة العمل اليومية)

Date: 2026-09-28
Supersedes the 4O "agenda + table" list page; keeps the 4P Trello board unchanged at `/admin/projects/[id]`.

## Scope

`/admin/projects` is now a daily production command center:

- **Date navigation** (`.wd-nav`): prev/next day, "اليوم" accent button when viewing another day, falls back to today on invalid `?date`.
- **4 summary stats** (from all projects matching the search): جلسات اليوم (hosted today), قيد التنفيذ (editing+review totals), تحتاج مراجعة (review totals), جاهزة (ready totals).
- **يحتاج انتباهك** (attention): highest-priority single item per project — review high → session today high → task due today → ready → nothing. Capped at 8, ordered by weight.
- **أعمال اليوم**: projects with `shoot_date === date` OR activity (`project_activity`) on that date.
- **الجلسات القادمة**: shoots in `(date, date+14]`, sorted by date, sliced to 12, labels اليوم/غداً/بعد غد + ar-MA date.
- **المشاريع النشطة**: everything not in اليوم (search-filtered), attention-first sort.
- **Filter pills** (`all|today|wip|review|ready`) with live DB counts from the full set; **search** (q) narrows cards but pills keep their unfiltered counts.
- **Quick actions**: مشروع جديد (unchanged modal), إضافة فيديو → `?tab=board&focus=add` (todo add-form auto-open + autofocus), إضافة مهمة → `?tab=details&open=add-task`. Dropdowns list first 24 active projects.
- Workbench **excludes** `PROJECT_CSS`; standalone `WORKBENCH_CSS` block appended to `projects-views.ts`.

## Semantics & decisions

- **أعمال اليوم** = `hostedOnDate || workedOnDate` (activity-based), so moving cards or adding notes surfaces a project on its work day without a stored shoot.
- **Job status** (`status` / `task` counts) lifecycle kept exactly as 4P: todo → editing → review → ready → done; movement only via board (never from workbench).
- **Next action ladder**: review>0 → "راجع N فيديو" · tasks due ≤2d → workspace task editing · editing>0 → "كمّل التعديل…" · ready>0 → "جهّز تسليم N فيديو" · shoot today/future → "جلسة تصوير اليوم/التاريخ" · todo>0 → "ابدأ أول بطاقة" · else "لا شيء مستعجل".
- **RBAC**: list route keeps `requireOwner` (coordinator gets 403); only inline form actions are exposed.
- **No new migration**: reuses 4O schema (`shoot_date/shoot_time/location`, `client_video_slots.kanban_status/order`, `project_tasks.due_date`, `project_activity`, `deliveries`).
- Responsive: single-column stacking at 390px with no horizontal overflow.

## Files

- `functions/admin/_lib/projects-data.ts` — `loadProjectsWorkbench` (batched, no N+1), `WorkbenchData`/`WorkbenchProject` types, `emptyWorkbench`, `todayCasablancaDate`, `shiftDate`.
- `functions/admin/_lib/projects-views.ts` — workbench `renderProjects`, `workbenchCard`, `slotBreakdown`, `buildAttention`, `nextActionText`, filter pills, date nav, `WORKBENCH_CSS`; board `openAddCard` on `boardTab`.
- `functions/admin/projects.ts` — GET validation (`date`, `filter`, `q`, `client_id`) + `loadProjectsWorkbench` → `renderProjects`; POST create kept.
- `functions/admin/projects/[id].ts` — `?focus=add` wiring, `workspaceError` via `emptyWorkbench`.

## Verification

- `qa4q.mjs` strict E2E (DB-derived counts): **69/69 PASS**.
- Regression: `qa4p` (board) **64/64**, `qa4o` (CRM workspace, list assertions adapted to workbench sections) **63/63**, `qa4n` (client workspace) **30/30**, `smoke4n` **24/24**.
- `npm run typecheck`, `npm run lint`, `npm run build` all green.

Note: the demo/dev DB accumulates QA seed projects across phases (27+ non-archived) — qa4q derives every global count from the API rather than hard-coding.