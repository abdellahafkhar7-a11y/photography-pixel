# FINAL PRODUCT ARCHITECTURE — Photography Pixel

Date: 2026-09-28  
Scope: end-to-end product architecture after the Phase 4M master pass
(ONE DELIVERY → MANY VIDEOS → ONE PRIVATE LINK). See
`FINAL_PRODUCTION_AUDIT.md` for the audit and deployment findings.

## 1. Stack

- **Frontend/static**: plain HTML/CSS/JS, Arabic RTL, custom design system in
  `functions/admin/_lib/shell.ts`; prerendered public pages by `build.mjs`.
- **Runtime**: Cloudflare Pages Functions (TypeScript), `wrangler pages dev`.
- **Data**: remote Supabase (PostgREST + Auth) via service role from `.dev.vars`.
- **Media**: R2 bucket `photography-pixel-private` (bound as `BUCKET`);
  in dev it is the local Miniflare simulation (`/.wrangler`).
- **Deploy**: GitHub main → Cloudflare Pages only; never direct-upload the repo
  root (§6 of the audit).

## 2. Public site (`/`)

Static `data/*` feeds pages: home, portfolio (`/portfolio`), services
(`/services`, alias `/photography` 301), gallery, drone, models, contact.
No public DB-write surface. `robots.txt`, `sitemap.xml`, custom `404.html`
(shipped `noindex`).

## 3. Delivery subsystem (the core)

### 3.1 Domain model (migration 12 — additive, backward compatible)

- `deliveries` — one row per private link: `source_type` (`portfolio`|`r2`),
  `delivery_mode` (`VIEW_AND_DOWNLOAD`|`VIEW_ONLY`), `status`
  (`pending|preview_viewed|confirmed|download_available|downloaded|expired`),
  `client_visible_id`, hashed `token`, confirm/download/expiry timestamps.
- `delivery_videos` — 1..N **items** per delivery, each identified by
  `item_pos`; every item starts at `version 1` and re-uploads bump that item's
  version. Unique `(delivery_id, item_pos, version)`. `is_active` marks exactly
  one version per item (partial index `delivery_videos_active_item_idx`).
  Archive rows keep R2 keys + `original_deleted_at`.
- `delivery_activity` — event log incl. `version_created {item,version}`
  (trigger `handle_video_created`), `reuploaded {item,version}`,
  `version_deleted {item}`, `delivery_released {items}`,
  `download_started {isFirst}`, `link_opened`, `preview_viewed`,
  `video_confirmed`.

Single-video deliveries created before migration 12 default to `item_pos = 1`
and keep working unchanged through the same private link.

### 3.2 Create

`/admin/deliveries/new` — classic form and JSON modal both supported.
- Portfolio source: multi-select of **several** public catalog videos
  (`portfolio_url[]`); each becomes an item. Validates against the catalog,
  rejects dupes, requires ≥1.
- r2 source (owner-only): creates an empty delivery; items are uploaded later.
- Classic POST renders the detail page at the same URL (no redirect) and feeds
  the same portfolio catalog to the add-video card (fixed in the 4M pass).

### 3.3 Detail / manage (`/admin/deliveries/[id]`)

- Numbered item cards + versions log (`فيديو {n} · النسخة {v}`); per-item
  status (قالب/النسخة الحالية/مؤرشفة).
- Actions: confirm, **release-all** (stamps `download_released_at` on every
  active item; logs `delivery_released {items:N}`), set mode (blocked after
  download), regenerate/cancel link, archive/unarchive, address book,
  client-info edit.
- `add_video`: append a portfolio video to a delivery (checks catalog + not at
  `downloaded`/`expired`); resets lifecycle on active rows (status → pending,
  `confirmed_at`/`download_released_at` null, token unchanged).
- `delete_video`: archives that item's rows, deletes its active R2 original +
  preview, sets `original_deleted_at`, logs `version_deleted {item}`; the rest
  of the delivery keeps the same link and numbering stays stable.

### 3.4 r2 uploads (`/admin/deliveries/[id]/upload`)

`?item=add` → new item at `max(item_pos)+1`, version 1; `?item=N` → replace
item N only (vN archived, vN+1 active). Keys:
`originals/{deliveryId}/{itemPos}/{version}/{filename}`. Multipart
init/part/complete (stream fallback in the sim). The **new item's** version
history purposes replace; add/upload resets lifecycle to pending. `?item`
out-of-range or a non-r2 delivery rejects. Cross-origin → 403.

### 3.5 Client portal (`/p/<identifier>-<secret>`)

- Renders every active item: portfolio items show an embed `<iframe>` (the CDN
  host itself plays the video); r2 items show a locked, watermarked
  "Photography Pixel" frame until released.
- One confirm button confirms the whole set. First **download** stamps the
  shared 72h `download_expires_at` on all active items; later downloads never
  extend it. Status transitions drive the UI (pending → confirmed →
  download_available → downloaded/expired).
- Download/preview endpoints are token-based and item-scoped
  (`?item=N`/`?preview=1`): portfolio → 302 to the CDN embed/original; r2 →
  streamed from R2 with the same `.mp4` bytes; invalid `?item` → 302 back to
  the client page.

### 3.6 Client-player browser download protection (UX layer)

Objective: remove the *native* browser "download/playback-speed/PiP" controls
from the delivery page before the owner releases, without touching the server
security model or the official post-release download flow.

- `<video>` (r2 items): `draggable="false"`, `disablepictureinpicture`,
  `controlslist="nofullscreen nodownload noplaybackrate nopic"`, and unchanged
  `playsinline webkit-playsinline` (iOS stays inline; the existing
  fullscreen-exit guard is intentional and preserved).
- Portfolio embeds: `picture-in-picture` removed from the iframe `allow`
  policy (denied at the permissions-policy level); `draggable="false"`.
- Inline script (same architecture as the fullscreen guard): capture-phase
  `contextmenu`/`dragstart` prevention **scoped to `.video-frame` elements
  only** (never the whole page), plus `enterpictureinpicture` guard.
- `brand.ts` CSS hides the WebKit PiP control button.
- The client page never contains R2 keys, bucket names, presigned/signed URLs,
  or original object references — the preview `<video>` src is always the
  authorized `{base}/p/{token}/preview?item=N` route, which streams the
  watermarked preview server-side.

Honest scope: this is UX-only hardening, not DRM. A determined user can still
screen-record or open DevTools, and browsers that ignore `controlsList` (e.g.
Firefox) still show native controls. Cross-origin iframe players cannot be
context-menu-blocked from the parent. The real protection stays server-side:
private R2 bucket, token secret, release-state gating, and the 72h expiry
stamped on first download. The supported claim is: "Native browser download
controls are disabled and original files remain server-protected."

### 3.7 List (`/admin/deliveries`)

Operational columns: العميل | واتساب | الفيديوهات | المصدر | الحالة | تأكيد
العميل | الإطلاق/التحميل | آخر موعد للتحميل | تاريخ الإنشاء | إجراء. Per-row
"X فيديو / Y إصدار" from `activeVideoCount` (distinct active `item_pos`) and
version count. Filters: query (name/whatsapp/visible id), status, source,
client, and **فيديوهات متعددة (≥2)**. Cleanup action garbage-collects expired
deliveries + deletes their originals.

## 4. CRM + production workspace

- **Projects/kanban** (`qa4o`): CRM project cards, tasks, uploads, dashboard.
- **Trello-style board** (`qa4p`): move cards, card detail, coordinator 403s.
- **Daily workbench** (`qa4q`): date navigation, attention queue, filters,
  mobile layouts.

## 5. Security model

- Admin session cookie `SameSite=lax`; every admin POST handler enforces
  `sameOrigin` (one non-blocking gap: `models.ts` — recommended).
- RBAC on `app_users.role` (owner/coordinator); reads/writes row-scoped;
  coordinator 403s verified on workspace/board/delivery mutations.
- Client pages: random `secret` in the URL only; no database-write without a
  valid token; preview/download endpoints 404/410 on invalid state.
- Browser download protection on the client player (§3.6) removes the native
  download/playback-rate/PiP UI pre-release; server-side gating is untouched.
- CSP with bounded connect/frame sources for video embeds, `frame-ancestors
  'none'`, `object-src 'none'`; `permissions-policy` camera/mic/geolocation off.
- Avatar uploads: server-side magic-byte sniff + size limits; every admin
  render escapes user fields via `escapeHtml`.

## 6. Build & configuration hygiene

- Scripts: `typecheck` (tsc --noEmit), `lint` (eslint --max-warnings=0),
  `build` (prerender + sitemap), `dev` (wrangler pages dev), `db:migrate`,
  `owner:create`, `coordinator:create`.
- 12 Supabase migrations (roles/app_users → **multiple videos**) match code.
- No secrets in tracked files; `.env.example` is a template only.

## 7. Verification state

- Master-compact E2E replay `qa4m-multi.mjs`: **100/100 PASS** — create flows,
  per-item uploads `?item=add`/`?item=N`, R2 key layout, delete_video,
  downloads/preview/negatives, cross-origin 403s, list columns + multi filter,
  390px overflow, **plus the §3.6 protection suite** (download endpoint
  redirects to the client page pre-release, contextmenu/dragstart blocked,
  iframe PiP denied, no official download button + no R2 key/presign leaks
  pre-release on both portfolio and r2 pages, `controlsList`/PiP/draggable
  attributes, r2 src is preview-only, official download button appears
  post-release, and a 7-step viewport sweep 360/375/390/430 & 1024/1280/1440
  checking no overflow + intact playback controls + watermark + blocked
  context menu).
- All prior suites (smoke4n, qa4n, qa4o, qa4p, qa4q) green.
- QA state at end: every business table 0 rows, 0 orphans, `auth.users` = owner
  only, local R2 sim = 1 avatar object; typecheck/lint/build clean.

## 8. Known notes

- `siteUrl` link host in dev is `localhost:8788` vs the listening
  `127.0.0.1:8788`; both reach the same dev server (cosmetic only).
- Portfolio "preview" is by design a 302 to the CDN embed (public asset);
  r2 preview streams 200 from R2.
- Deprecated "single-show" r2 token flow still exists but is superseded by the
  multi-video `?item` protocol.
- Download protection is UX-only (see §3.6): `controlsList`/`disablePictureInPicture`
  are honors-based, and Firefox does not implement them.