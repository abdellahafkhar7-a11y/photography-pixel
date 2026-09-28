# PHASE4K — Final Client Delivery + Portfolio Workflow

## Result: PASS — `PROBLEMS=0`

Gates: `typecheck` ✅ `lint` ✅ `build` ✅ (13 prerendered pages, sitemap 14 URLs).
Live QA (headless Edge via CDP against `npm run dev` on :8788, real Supabase + local R2 emulator): all checks green, DB restored to baseline (deliveries=1, clients=3).

## The new workflow (this pass)

Every private link now follows one uniform lifecycle:

**client link (pending) → client opens (preview_viewed) → client confirms (confirmed = LOCKED) → owner releases («إطلاق التحميل») → download_available → first download (downloaded + 3-day window starts) → window ends → expired**

- Confirmation alone **never** releases the file. The original becomes downloadable only after the owner explicitly presses **إطلاق التحميل** on the admin detail page.
- The 3-day window still starts on the client's **first download** (`gateDownload`); release touches only `status`, so the 3-day semantics are untouched (aside from the one nullable-client migration below, no schema change).
- `downloadAllowed` = `download_available || downloaded`; `confirmed` renders a locked client view.

## Follow-up pass — quantified but optional clients (portfolio "إنشاء رابط" lacks a pre-creation form)

- Clicking a portfolio card's **إنشاء رابط** now creates the private link immediately (migration `000004` makes `client_id` nullable + `ON DELETE SET NULL`; no fake clients).
- WhatsApp and client data became **optional after-creation** actions in the same modal; PC-upload wizard still requires client info.
- Re-verified end-to-end: `PROBLEMS=0`, gates green, DB restored to baseline (deliveries=1, clients=3).

## Scope Verified

### 1. Portfolio — per-video `إنشاء رابط` (IMMEDIATE, no pre-form)
- 81 real cards each have an inline **إنشاء رابط** button (`data-create-link`) + a **عام** public-page link; owner-only "رفع فيديو جديد" header button.
- One click = immediate create: the card button POSTs `{source_type:portfolio, portfolio_url}` with `Accept: application/json` in the background (busy label «يتم الإنشاء…»), then opens the modal **already in the done state**. **No client-name/WhatsApp form before creation** — no fake clients, no exposed Bamboo URL.
- Done state shows the private link **short only** (`http://localhost:8788/p/{token}`) + actions: نسخ (data-copy), فتح الرابط, صفحة التوصيل, and the video chip (title + category) from the exact clicked card.
- **Optional AFTER creation:** «إرسال عبر واتساب» reveals an inline number input (placeholder `0663493003`) → `wa.me/212…?text=…/p/{token}` short link only; «إضافة بيانات العميل (اختياري)» toggles name+WhatsApp → owner-only `POST …/deliveries/{id}` × `action=set_client` (reuses `resolveClient`, name ≥2 chars + valid WhatsApp) → success notice + tie-up in DB.
- The wizard script is the same across sources, **except** the PC-upload flow (`/admin/uploads`) still collects client name+WhatsApp **before** creating the delivery.
- JSON error paths verified (bogus URL, short name, empty selection, clientless+valid-URL all return `{ok:false,error}`).
- DB: new `deliveries` row `source_type=portfolio`, **`client_id=NULL`** (no fabricated client), status `pending` → `preview_viewed`, v1 version row with `portfolio_url` exactly equal to the clicked card's URL; `/p/{token}` → 200 with Bamboo embed; clientless private hero falls back to «تسليم فيديو خاص»; no download button before confirm.

### 2. Standalone wizard `/admin/uploads` (رفع فيديو جديد)
- Owner-only (coordinator GET/POST/preview all 403). Uploads **first**, builds the delivery only **after** client data:
  `begin → part/stream → complete → create` (multipart 32 MiB parts, ≤ 1 GB; stream fallback).
- `begin` reserves `deliveryId` so the R2 key `originals/{id}/1/…` is already final; `create` binds the row + v1 version + fresh private token + link to that same key (works around `client_id NOT NULL`; no placeholder clients, no object copy).
- Client UX: dropzone, real progress, per-part retry, cancel/abort; step 2 shows an inline owner-only preview (`/admin/uploads?action=preview&key=…`, streams the staged object 200/video, key-traversal 404) + client name/WhatsApp; step 3 returns the link with نسخ/واتساب/فتح/صفحة التوصيل.
- Guards verified: 2 GB rejected, `text/plain` rejected, unknown action, empty file, create-before-upload all rejected; DB rows + `r2_original_key=originals/{id}/1/…` + filename/active/size confirmed.

### 3. Confirm → LOCKED
- `/p/{token}` at pending: watermark overlay + vertical 9:16 player, confirm button, preview streams (200).
- After confirm: `تم تأكيد الفيديو بنجاح — النسخة الأصلية ستكون متاحة بعد إطلاق التحميل`, hint «بانتظار إطلاق التحميل من المصوّر», **no download button**, DB `status=confirmed` + `confirmed_at`, **no** `download_expires_at` opened; `/p/{token}/download` stays gated (no state change).

### 4. Release (`POST /admin/deliveries/:id` × `action=release`)
- Owner-only (POST handler + requireOwner; coordinator detail has no button, POST → 403).
- Only from `confirmed`; sets `status=download_available`, does **not** touch `download_expires_at`/`downloaded_at` → the 3-day countdown still starts on the first client download.
- Client page now shows «التحميل متاح» + **تحميل الفيديو الأصلي**.

### 5. Download window (3 days)
- First download: `status=downloaded`, `downloaded_at`, `download_expires_at = +72h` exactly; repeat download allowed but the window is **not** reset; client notice shows «التحميل متاح حتى …».
- Expiry: past window → dead-link page + auto-flip `status=expired, expired_at`; download dead.

### 6. Watermark + mobile (R10 / 9:16)
- Private R2 preview renders inside `.video-frame vertical` with a visible `Photography Pixel` `.wm` overlay (no transcoding infra — CSS overlay over the constrained player; report notes the raw `/preview` stream is the original; burned-in watermarking remains out of scope by design).
- Client pages (portfolio + r2, incl. locked/released/expired) clean at 390×844 / 375×812 / 430×932 / 768×1024 / 1440×900; admin `/admin/uploads` + delivery detail clean at all 11 widths (1920→375).

### 7. RBAC + public regression
- Coordinator: `/admin/uploads` GET/POST/preview 403, no release button/POST, cannot un-expire, **can** still create portfolio deliveries.
- No private tokens leak into admin page HTML; `/p/{token}` is unauthenticated by design (the token is the credential).
- Public: all 14 pages clean, `/ugc` still 21 embeds, `/gallery` honest 0, sitemap present.

## Bugs found & fixed during this pass
1. `release` was (initially) gated to `source_type=r2`, which would have stranded portfolio deliveries at `confirmed` — now uniform for both sources.
2. Type error in the new route (`Route` used as the context type) — fixed with `Parameters<Route>[0]`.
3. QA-harness fixes only (not app code): role select value is a UUID (select by option text), PATCH needs `Prefer: return=representation` on 204, sitemap URLs use the production domain (`/ugc`, no trailing slash), `'إطلاق التحميل'` string collides with status-label prose.

## Notes / accepted trade-offs
- **Schema change (one, applied):** `deliveries.client_id` was NOT NULL and fake-client rows are forbidden → this pass applied migration **`supabase/migrations/20260925000004_optional_delivery_client.sql`** (drops NOT NULL, FK `ON DELETE SET NULL`) so an immediate portfolio link can exist before any client is known; `npm run db:migrate` (= `supabase db push`) reported only 000004 pending and applied it. Kept deliveries survive a client deletion (rows stay, `client_id` becomes NULL).
- `delivery_activity_type` is a Postgres ENUM, so a `download_released` log entry was intentionally **not** added (would require an enum migration). The status transition, badge and timeline convey the release.
- **Orphan-object risk (accepted)**: a `begin` that is abandoned before `create` leaves an R2 object under `originals/{id}/1/…` with no DB row; retries reuse the same `deliveryId`.
- Watermark is a CSS overlay (no transcoding); the `/p/{token}/download` gate remains the enforcement point for the original pre-release.
- `p4k-dev.log` shows occasional cosmetic `_redirects` warnings; no functional impact.

## Artifacts
- QA scripts (kept out of repo): `%TEMP%\opencode\p4k-qa.mjs` (full pass, `PROBLEMS=0`), `p4k-probe.mjs` / `p4k-probe2.mjs` (RBAC diagnostics).
- Source delivered this pass:
  - `functions/admin/uploads.ts` (new wizard route)
  - `functions/_lib/upload-meta.ts` (shared helpers; `[id]/upload.ts` refactored to use them)
  - `functions/admin/_lib/delivery-views.ts` (STATUS_LABEL, release button, wizard view+script, list button, timeline alerts)
  - `functions/admin/_lib/views.ts` (`data-create-link` card, create-link modal + script, header button)
  - `functions/admin/deliveries/new.ts` (JSON/HTML dual branch; portfolio JSON branch allows `client_id:null`)
  - `functions/admin/deliveries/[id]/index.ts` (`release` POST + `set_client` POST)
  - `functions/p/_client.ts` (`downloadAllowed`, locked/canDownload/expired render, nullable client + hero fallback)
  - `functions/admin/_lib/shell.ts` (`.lm-*` modal CSS), `functions/_lib/brand.ts` (`.video-frame.vertical` + `.wm`)
  - `functions/_lib/db-types.ts` (nullable `client_id` in Row/Insert/Update), `functions/admin/_lib/clients-data.ts` (null filter)
  - **`supabase/migrations/20260925000004_optional_delivery_client.sql`** (ALREADY APPLIED remotely via `db push`)
- DB left pristine: deliveries=1, clients=3, app_users=2 (owner + pre-existing coordinator). **No changes committed.**

## Gate for commit
Awaiting user approval to stage/commit (includes all prior 4A–4J uncommitted work).

---

# 4K Final Visual Pass — Client Video Player (watermark + fullscreen)

Additional client-page UI adjustments done after the main pass. Backend/delivery/security flow untouched (confirmation → lock → release → download → 72h window → expiry all re-verified identical).

## Changes
- **Client watermark matches the Photography Pixel Portfolio watermark style** — replaced the small corner pill (`.wm`) on `/p/{token}` with the full-frame diagonal repeating pattern used on the public video cards (`styles.css` `.pp-pattern-watermark` / `script.js` SVG tile): identical white-bold "Photography Pixel" SVG tile (280×80, two text lines), `url(data:image/svg+xml,...)` encoded 1:1, overlay `top:-30%;left:-30%;width/height:160%`, `rotate(-25deg)`, `opacity:.12`, `pointer-events:none`, `z-index:2`, `aria-hidden`. Applied over both the preview `<video>` and the Bamboo portfolio `<iframe>`.
- **Fullscreen control removed/disabled from the client video player** — three layers (works across Chromium/WebKit/Firefox, validates in headless):
  1. `controlslist="nofullscreen"` on the `<video>` (Chromium natively drops the fullscreen button).
  2. `.video-frame video::-webkit-media-controls-fullscreen-button{display:none!important}` (Firefox/Safari/WebKit).
  3. Small no-op guard script: any `fullscreenchange`/`webkitfullscreenchange` that targets the player immediately calls `exitFullscreen` (hard disable).
- `playsinline`/`webkit-playsinline` added so iOS never auto-fullscreens the vertical player.
- **Kept**: vertical 9:16 layout (`aspect-ratio:9/16`, `width:min(100%,calc(74vh*0.5625))`, centered, `object-fit:contain`, `max-height:74vh`), real logo `/assets/images/logo-3d.webp` in the hero, phone-first media query, native controls (play/pause/seek/volume), CSS-only watermark (no transcoding).

## Files changed this pass
- `functions/_lib/brand.ts` — `.pp-pattern-watermark` pattern rule (replaces `.wm`), fullscreen-button CSS rule.
- `functions/p/_client.ts` — `<video>` gains `playsinline webkit-playsinline controlslist="nofullscreen"`; both branches render `<div class="pp-pattern-watermark" aria-hidden="true">`; guard script appended to the r2 branch.
- QA harness `%TEMP%\opencode\p4l-qa.mjs` (kept out of repo).

## QA
Real 270×480 (9:16) webm generated in-browser and uploaded through the wizard (not mocked) — `PROBLEMS=0`.
- Sizes verified: **390×844, 375×812, 430×932, 1440×900, 1280×800** — player box 0.5625, video box 0.5625, centered, inside frame (no crop), no horizontal overflow, watermark covers the frame (opacity 0.12, SVG pattern, pointer-events none), video within first viewport on phones (top 265).
- Logo: served 200, hero `<img>` = `/assets/images/logo-3d.webp`, alt "شعار Photography Pixel", natural 1254×1254 (1:1, not stretched), rendered 38×38.
- Fullscreen removed: `controlsList` contains `nofullscreen`, CSSOM rule present, guard script present; `requestFullscreen` no longer reachable from the UI.
- Controls: play (t=0.81s), pause, seek (to 1.4s), volume all work; served source stays 270×480.
- Regression (unchanged semantics): pending → confirm → **locked** (+ DB `confirmed`/`confirmed_at`, no window) → download gated (302) → owner release → `download_available` → download → `downloaded` + `downloaded_at` + exact 72h window → expiry (dead page, `expired`, preview 410); real logo also on the invalid-token page.
- DB left pristine: **deliveries=1, clients=3, app_users=2**. Screenshots in `%TEMP%\opencode\qa4l\`.

## Gates
- `npm run typecheck` ✅ · `npm run lint` (eslint, max-warnings 0) ✅ · `npm run build` (prerender 13 pages + sitemap) ✅
- git status: only prior uncommitted work (`brand.ts`, `_client.ts`, and all 4A–4K sources) — **no commit, no push**.