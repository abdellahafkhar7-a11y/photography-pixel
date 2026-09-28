# Phase 4P — Trello-Style Project Board

**Status: COMPLETE (uncommitted — do not commit/push)**

Phase 4P turns the 4O workflow tab into a production **Trello-style board**
(board-first workspace, drag & drop with persisted order, card detail modal with
checklist + delivery, horizontal-scrolling responsive board). Additive on top of 4O;
4M/4N/4O behavior is untouched and re-verified by regression below.

---

## 1. Goal

```
/admin/projects/[id]
  ├── [board]   ← default (Trello board: todo → editing → review → ready → done)
  ├── [details] ← legacy overview + tasks + delivery (was “videos”/“overview”/“tasks”)
  └── [activity]← project activity timeline

Board card (backend project_video_slot row)
  ├── drag & drop between columns + reorder within column (HTML5 DnD + fetch POST, no reload)
  ├── optimistic move with placeholder, auto-scroll, restore-on-failure + toast
  ├── quick-move <select> on each card
  ├── “add card” form per column
  ├── filters: search text / model / status column / delivery
  └── click card → detail modal (edit title/notes/label/deadline, move, checklist, delivery)
```

Legacy tab URLs keep working via a mapping (`videos → board`, `overview|tasks|delivery → details`);
the default workspace URL `/admin/projects/[id]` now renders the board.

---

## 2. Migration

**None.** Reuses the 4O schema (`client_video_slots.kanban_status`, `kanban_order`, `notes`,
`project_tasks`, `project_activity`). No new table/enum/column.

---

## 3. What changed

### `functions/admin/_lib/projects-views.ts`
- **Workspace split** into `workspaceTab` (hidden tab) composing `boardTab` (default) +
  `detailsTab` + `activityTab`; hoisted `taskModals(detail, openAddTask)`.
- **Board layout** — header row (count chips + add-card toggle + filter toolbar: q / model /
  status / delivery / clear), then `.b-root` (horizontal scroll) → `.b-col` per
  `KANBAN_STATUSES` column → `.b-card` cards (title, chips: label/deadline/notes hint,
  version chip + delivery link when prepared, checklist bar, quick-move select, open button).
- **BOARD_SCRIPT v2** — HTML5 drag & drop across columns and reorder within a column using a
  drop placeholder (`.b-ph`) instead of move-hacks; `body.b-dragging` class; rAF auto-scroll
  at container edges; snapshot → optimistic reorder → `POST ?move_slot` (same-origin header +
  `app-intent: reorder`); on HTTP failure restore DOM + toast `عذراً، لم نتمكن من الحفظ`; toast.
- **DMENU_SCRIPT** — header dropdown menu (`[data-dmenu-toggle]` + `.dmenu-panel`).
- **CARD_SCRIPT** — delegated click-to-open on a card body (`data-card-trigger`, guards
  interactive elements) and on open buttons (`data-card-open` / `data-open-card`);
  `fetch ?cd_card=<slotId>` → card detail partial into `#cd-box`.
- **`renderCardDetailPartial`** (4O) kept intact for the modal: title/notes/label/deadline,
  5 move buttons (current disabled), checklist renderer (+ add-task + toggle + counts),
  delivery panel (prepare / fresh private link / open delivery page), activity timeline scoped
  to the slot. `?tab=details&open=add-task` opens the board silently then opens the modal.
- **PROJECT_CSS** — segmented tabs (`.ws-seg`/`.ws-seg-btn`), full-bleed `body.ws-full` layout
  (`ShellOptions.bodyClass`), column/card styling, `.count-chip`, `.cnt-sep`, `.b-ph`,
  `.b-toast`, `.dmenu*`, scroll-snap base column widths (280px), and a mobile media block
  (segmented tabs wrap full-width, columns `min(82vw, 280px)`, `100dvh` overrides, no page
  horizontal overflow).

### `functions/admin/projects/[id].ts`
- `tabFrom` legacy mapping; default `board`; `open === 'add-task'` → `openAddTask`;
  forced tabs updated: `set_profile` / `record_sent` → details, `move_slot` / `add_slot` /
  `update_slot` → board, `edit_task` errors → details; hidden inputs now send `tab=board/details`.

### `functions/admin/_lib/shell.ts`
- `ShellOptions.bodyClass` → `dash ws-full` on the body (full-bleed board, `.dash-foot` hidden).

### QA harness (temp, outside repo)
- `qa4p.mjs` — 64-assertion CDP suite (create client → create project → board invariants →
  DnD move + server-side persistence + reload → add-card → same-column reorder persistence →
  quick-move → card detail modal edit → checklist add/toggle/persist → prepare → delivery link
  → filters → mobile 390px → auth 302 → cd_card fragment 200/no-store/noindex → 404 → bogus
  move 400 → sameOrigin 403 → coordinator RBAC 403 (list/workspace/fragment) → owner restored).
- `qa4o.mjs` adapted to the new DOM (seg tabs, `.b-col/.b-card`, `?tab=details/activity`,
  `boardMove` helper); still 61/61.
- `qa4n.mjs` (30/30) + `smoke4n.ps1` (24/24) unchanged and green.

---

## 4. Verification

### QA4P — new board suite
`node qa4p.mjs` → **64/64 PASS, 0 FAIL**

- 5 columns in `todo,editing,review,ready,done`, 3 plan cards, per-column add buttons, filter
  toolbar, count badges `3,0,0,0,0`.
- DnD move: optimistic (2/1 counts) → server-side persisted → persisted across reload.
- Same-column reorder: `[D,A]` after drop-at-end → server-side → reload.
- Quick-move (select) persisted; add-card in-review card E shows label/deadline/notes chips.
- Modal: title/label/deadline prefilled, 5 move buttons, current = review disabled, empty
  checklist hint, delivery prepare button, activity timeline present; edits persisted
  (title/notes/label); checklist add + toggle → 1/1 bar on board + survives reload; prepare
  renders a **fresh** private link `http://localhost:8788/p/21267…-…`; delivery link on card.
- Filters: text "edited" isolates card E (1) and clear restores 5; delivery "بدون تجهيز"
  hides prepared (4).
- Mobile (390px): page overflow 0, board inner scroll 1088px, modal full-width.
- Auth/RBAC: workspace & cd_card 302 without session; cd_card fragment 200 + `cache: private,
  no-store` + `noindex` + fragment-only body; unknown card → 404; bogus `move_slot` → 400
  (JS revert path); headerless POST → 403; coordinator 403 on projects list / workspace / card
  fragment; owner session restored.

### QA4O — CRM workspace regression (re-run on 4P UI)
**61/61 PASS, 0 FAIL** — tabs `?tab=board,?tab=details,?tab=activity`, board 5 columns /
3 cards, board move persisted, details tasks + profile + record_sent, prepare/upload/thumb/version
chip/delivery link, archive/unarchive, status change, 15 activity entries, search, client page,
dashboard stats, no-store/noindex headers, mobile overflow 0.

### QA4N — delivery/versioning regression
`node qa4n.mjs` → **30/30**; `smoke4n.ps1` → **24/24**. VIEW_AND_DOWNLOAD + VIEW_ONLY flows,
fresh stable links, confirm/release, 72h pause, upload + version pill, privacy all green.

### Static checks
- `npm run typecheck` — clean
- `npm run lint` (eslint `--max-warnings=0`) — clean
- `npm run build` — 13 prerendered pages + sitemap, no errors

---

## 5. Phase 4P STATUS

- **Board layout** — done. Board-first workspace, 5 columns (`todo→editing→review→ready→done`),
  count badges, add-card per column, header with status select / archive / client / WhatsApp /
  dmenu filters (q/model/status/delivery/clear), legacy URLs mapped (`videos→board`).
- **Trello interaction** — done. Click card → modal partial; open/add-task flow
  (`?tab=details&open=add-task`).
- **Horizontal board** — done. `.b-root` horizontal scroll, scroll-snap 280px columns,
  per-column vertical scroll, full-bleed `body.ws-full`; mobile 390px verified (no page
  overflow, inner board scrollable, full-width modal).
- **Drag & drop** — done. HTML5 DnD across columns + within-column reorder, placeholder,
  `b-dragging` state, rAF auto-scroll, optimistic update, restore-on-failure + toast.
- **Persistent order** — done. `move_slot` POST (same-origin guarded, `app-intent: reorder`),
  `kanban_status` + `kanban_order`; verified server-side + across reload.
- **Card detail** — done. Title/notes/label/deadline edit (autosave via `update_slot`),
  5 move buttons (current disabled), slot activity timeline, delivery panel with fresh link.
- **Checklist** — done. Add task, toggle (`cd_toggle`), count chip `0/1 → 1/1`, board card
  progress bar, persisted across reload.
- **Delivery** — done. Prepare shows fresh `/p/<id>-<secret>` link; prepared card shows version
  chip + delivery link; modal switches to فتح صفحة التوصيل.
- **Mobile** — done. 390px board scroll + full-width modal + no horizontal overflow.
- **RBAC** — done. Workspace & cd_card are OWNER-ONLY (`requireOwner`); coordinator blocked
  403 on list/workspace/fragment (verified end-to-end).
- **4M** — covered: authenticated replay + auth-302 + sameOrigin + coordinator RBAC green.
- **4N** — **30/30** (`qa4n.mjs`) + **24/24** (`smoke4n.ps1`).
- **4O** — **61/61** regression on 4P UI.
- **4P** — **64/64** (`qa4p.mjs`).
- **Typecheck / Lint / Build** — all pass.

---

## 6. Deliverables / pending user actions

- Implementation: `functions/admin/_lib/projects-views.ts` (board/detail/modal/scripts/css),
  `functions/admin/projects/[id].ts`, `functions/admin/_lib/shell.ts`.
- No new migration required; 4O schema reused.
- QA scripts: `C:\Users\abdel\AppData\Local\Temp\opencode\qa4p.mjs` (new),
  `qa4o.mjs` (adapted), `qa4n.mjs` + `smoke4n.ps1` (unchanged).
- **NOT committed / NOT pushed.** Ready for review.