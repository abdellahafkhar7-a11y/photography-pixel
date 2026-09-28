# Phase 4N — Client → Model → Video Slots → Script → Delivery (Workspace)

Date: 2026-09-26 · Environment: `wrangler pages dev` (127.0.0.1:8788) + headless Edge (CDP 9330) + Supabase (`db push`) + R2 emulator. Artifacts: `C:\Users\abdel\AppData\Local\Temp\opencode\qa4n\` (screenshots), `smoke4n.ps1` (HTTP smoke), `qa4n.mjs` (CDP QA).

## Result: 30/30 CDP QA + 24/24 HTTP smoke — ALL PASS

Both suites green. No app code was changed for QA: the only edits during this session were to the QA scripts themselves.

## What was built (all additive — no data deletion)

- `supabase/migrations/20260927000009_client_model_video_workspace.sql` (applied) — tables `models`
  and `client_video_slots` (RLS service_role only, per the 000003 pattern); new columns and FK on
  `clients` (`model_id`, `video_slots_count`, `delivery_mode`, `script`); `deliveries.client_video_slot_id`
  + partial unique index (one current delivery per slot). Existing clients/deliveries/videos untouched.
- Model workspace (`/admin/models`) — 6 seeded models (مريم، دريس، حنان، حسناء، يوسف، خولود from `data/models.json`),
  owner-only set-whatsapp + availability toggle, per-model stats (clients, planned videos, delivered/pending, latest client).
- Client workspace (`/admin/clients`, `/admin/clients/{id}`) — booking form (نموذج طلب تصوير) capturing
  client + model + planned video count + default mode + script; workspace shows a service stat-grid,
  an editable plan form (model / count / mode / script), a **video-slots grid (1 slot per planned video)**,
  a message-to-model booking link, the deliveries table and the activity log.
- **Slot → delivery** is lazy: each slot’s private link is created on «تحضير الرابط + الفيديو», reusing the
  existing `/p/{stable-identifier}-{secret}` model (secret hashed, shown once, identical to `New delivery` flow).
  The response renders the delivery detail page with the fresh link + copy box (as in the wizard POST).
- `delivery_mode` is a **default for new slot deliveries only**; existing deliveries keep their own mode.
- **Lowering the plan count pauses** slots beyond the count (pill «خارج الخطة») but **never deletes** an
  uploaded video, its delivery, or its R2 object; raising the count re-includes the slot («لقطة مخططة»,
  or active again if its delivery exists).
- Delivery detail now carries a slot→client chip «جزء من خطة «عميل» — اللقطة N (الحالة)» and the client
  workspace links back to slot deliveries.

## QA coverage (A–J) — evidence

1. **Models workspace** — 6 set_whatsapp forms + 6 availability toggles; no horizontal overflow at 390 px.
2. **Create client with model/count/mode/script** — workspace renders 2 slot cards + 2 prepare buttons +
   the plan form; fresh booking wa.me link = `wa.me/212663493003?text=…حسناء…QA4N DL …عدد الفيديوهات المطلوبة: 2.QA4N script marker 12345…شكراً…` (model name, client name, count, script section; script omitted when the field is empty — verified with the VIEW_ONLY client).
3. **Prepare slot** — fresh private link rendered exactly once (`/p/2126******-«token»`, copy box + success notice), upload entry point present; DB stores only the SHA-256 of the secret.
4. **Upload** (existing R2 multipart page) — «تم رفع الفيديو», active-version pill «النسخة الحالية», slot keeps its delivery link; the workspace’s prepared slot still links to its upload page (not deleted by count changes).
5. **Confirm/release/download (VIEW_AND_DOWNLOAD)** — private page: «أؤكد الفيديو» present and no download leak before release; owner sees «إطلاق التحميل» once confirmed; after release the client private page offers the original download. VIEW_ONLY variant: no release form, hint «وضع «عرض فقط» — لا يتوفر تحميل للأصل», and the private page never exposes a download link.
6. **Count down 2→1** — slot 2 paused («خارج الخطة»), slot 1 still «في الخطة», both cards remain and the delivery/video survive. **Count up 1→2** — slot 2 re-included (planned). No deletion anywhere.
7. **Model filter** — `/admin/clients?model={id}` returns the client bound to that model (HTTP smoke).
8. **RBAC** — owner-gated by the same `requireSession` + `requireOwner` + `sameOrigin` chain used across the admin (models POSTs owner-only; anon `/admin/clients` → login redirect, verified). No coordinator account exists in the dev DB, so live coordinator checks were not re-run here; the deliveries coordinator gate (owner/coordinator same-origin policies) was fully exercised in Phase 4M. **Caveat:** automated tests only assert the presence of the gates as exercised above, not a new coordinator session.
9. **Responsive** — workspace and models pages have no horizontal overflow at 390 px (also 1440 baseline).
10. **Phase 4M regression** — `/admin/deliveries` list renders (13 rows incl. pre-existing), `/admin/deliveries/new` wizard form renders; existing slot-less deliveries keep working (no slot chip → shows «—»).

## One functional note (by design)

Post-hoc “aggregated per-client booking message with all private links” is impossible and **not**
implemented: raw private tokens are shown once at creation and only their hashes are stored (Phase 4L/4M
privacy model). The model booking message therefore carries the client/count/script and points to the
client workspace; individual slot links are shared through the workspace / per-slot copy.

## DB state after QA (dev)

Additive only — pre-existing data untouched. Current: clients=15 (8 bound to models), models=6 (3 with a
WhatsApp number set during QA), slots=20 (12 active / 8 planned), deliveries=11 (8 slot-linked, 3 legacy
slot-less untouched), current videos=2, activity=41.

**QA-created artifacts remain in the dev DB** (this phase's constraint forbids deletion): clients named
`Smoke T4N …`, `QA4N DL/VO …`, `MaskProbe …`, `DBG7/8/9 …`, plus their slots and slot-linked deliveries.
The delivery videos/activity rows created by the last `qa4n.mjs` run were removed at its end; the older
smoke/probe artifacts intentionally left. To restore baseline, delete only rows whose client names match
the prefixes above (nothing else).

## Gates

- `npm run typecheck` → exit 0
- `npm run lint` (max-warnings=0) → exit 0
- `npm run build` → exit 0 (13 prerendered pages, sitemap 14 URLs)

## Git

Working tree intentionally left uncommitted (per instructions). This phase added/changed:
`supabase/migrations/20260927000009_client_model_video_workspace.sql` (new), `functions/_lib/db-types.ts`,
`functions/_lib/whatsapp.ts`, `functions/admin/models.ts`, `functions/admin/_lib/models-data.ts`,
`functions/admin/_lib/models-views.ts` (new), `functions/admin/clients.ts`, `functions/admin/clients/[id].ts`,
`functions/admin/_lib/clients-data.ts` (rewritten), `functions/admin/_lib/clients-views.ts` (rewritten),
`functions/admin/deliveries/_helpers.ts`, `functions/admin/_lib/delivery-views.ts`.
All other modified/untracked files are the pre-existing Phase 4 working tree.