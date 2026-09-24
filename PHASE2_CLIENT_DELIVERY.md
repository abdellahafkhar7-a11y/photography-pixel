# Phase 2 — Client Delivery System (report)

Date: 2026-09-24
Status: implemented and verified end-to-end against the real Supabase project
(`pleuxwnlfcumdurbjdea.supabase.co`) and Cloudflare's local R2 simulator.

## What was built

A private, time-boxed client delivery system on top of the existing Photography
Pixel pages + Phase 1 admin/roles:

- A coordinator (or owner) creates a delivery for a client (name + a Moroccan
  WhatsApp number). The system returns a **one-time** private link
  `https://<site>/p/<token>`.
- The client opens the link, watches a preview, and confirms the video.
- The original is downloadable once confirmed, and only for **3 days from the
  first download**. After that the delivery dies and (for R2 originals) the
  cleanup job deletes the file.
- Owner-only features: upload/version originals, store originals in **Cloudflare
  R2** (private bucket), manage (regenerate/revoke) links, upload new versions,
  run cleanup.

## Database (migration `20260924000003_client_delivery.sql` — applied)

New tables: `clients`, `deliveries`, `delivery_videos`, `delivery_videos_queue`,
`delivery_activity`. New indexes + FK with `ON DELETE` rules per the spec.
`deliveries.status` = `pending → preview_viewed → confirmed → downloaded →
expired` (all `NOT NULL` guarded by CHECK), plus nullable transition timestamps
`confirmed_at`, `downloaded_at`, `download_expires_at`, `expired_at`.
`delivery_videos` carries `version` unique per delivery, `is_active`,
`r2_original_key` / `r2_preview_key` / `r2_thumb_key` and
`original_deleted_at` (audit trail; the key is kept after deletion).

## Token design

- 16 random bytes → unpadded base64url (22 chars), `TOKEN_PATTERN
  = /^[A-Za-z0-9_-]{20,64}$/`. (Fixed a bug: the encoder was emitting 16–17
  chars that failed the format check.)
- Only `SHA-256(token)` is stored (`private_token_hash`); the raw token is shown
  exactly once at create/regenerate and is never retrievable again.
- Unknown, revoked (`token_expires_at` in the past), and expired links all
  render the **same** generic "الرابط غير صالح" page (no enumeration).

## Flows verified (all on real Supabase + local R2)

| # | Scenario | Result |
|---|----------|--------|
| 1 | Coordinator creates portfolio delivery | OK: delivery created, status `pending`, one-time card with token + wa.me button |
| 2 | Client opens link, watches preview | Page 200 w/ Bamboo iframe; `/preview` → 302 to Bamboo; activity `link_opened`, `preview_viewed` |
| 3 | Download before confirm | 302 back to the page (blocked) |
| 4 | Confirm video | Status → `confirmed`; repeat confirm is harmless (`already`) |
| 5 | Download after confirm (portfolio) | 302 to the original Bamboo URL (direct open = download) |
| 6 | First download starts the 3-day window | `downloaded_at` set, `download_expires_at` = first download + 3 days exactly |
| 7 | Repeat downloads | Window **not** reset (timestamps unchanged) |
| 8 | Owner creates R2 delivery + uploads v1 (multipart) | `delivery_videos` row active, key `originals/<id>/1/<file>`, token rotated, status reset |
| 9 | R2 preview stream | 200 `video/mp4`; `Range: bytes=0-99` → 206 with `Content-Range: bytes 0-99/4096` |
| 10 | R2 confirm + download | 200 with `Content-Disposition: attachment; filename=…` |
| 11 | Version safety (upload v2) | v1 `is_active=false`, v2 active, delivery reset to `pending`, **token rotated** → old token dead; activity `reuploaded` + `version_created` (v2 original is the only one ever deleted) |
| 12 | Invalid & stale tokens | Identical generic dead-link page (200, no leak) |
| 13 | Window expires | Page renders the dead-link UI (fixed; previously showed a stale download button), `/preview` → 410, `/download` → 302; DB flipped to `expired` |
| 14 | Cleanup (cron path) | Pass 1 claim: `claimed=1`; self-heal pass deletes already-expired originals (`originalsDeleted=1`); second run fully idempotent (`0/0`, no errors) |
| 15 | Cleanup guards | GET → 405; POST without secret/session → 401; owner-session path works (list page button) |
| 16 | RBAC | Coordinator: no R2 radio, `/upload` → 403, cannot regenerate/revoke. Owner: full access |
| 17 | WhatsApp | One-time card has `https://wa.me/<212…>?text=…` with the private link (Arabic message, URL-encoded) |
| 18 | Revoke / regenerate | Revoked token dead; regenerated token works |
| 19 | Secrets | No Supabase/R2/cleanup secrets in any page response |
| 20 | Gates | `npm run typecheck`, `npm run lint`, `npm run build` all pass (13 pages + sitemap) |

## Architecture / files

- Private client package: `functions/p/[token].ts`, `[token]/preview.ts`,
  `[token]/thumb.ts`, `[token]/download.ts`, `_client.ts` (state machine,
  gating, rendering), `_media.ts` (Range-aware R2 streaming).
  - Download authorization is server-side (`gateDownload`): token liveness →
    window → status → original presence → (first time) enroll the 3-day window;
    then presigned-URL redirect **or** authorized streaming proxy (local dev).
- Admin delivery UI: `functions/admin/deliveries/_helpers.ts`, `index.ts`,
  `new.ts`, `[id]/index.ts` (exported `renderDetailPage` shared by create/upload),
  `[id]/upload.ts` (owner-only multipart upload; R2 put → deactivate old version
  → insert new → reset + rotate token).
- Cleanup: `functions/__cleanup.ts` (guarded endpoint), `_lib/cleanup.ts`
  (atomic claim + delete active-version original + self-heal),
  `workers/cleanup/index.ts` + `wrangler.toml` (cron `0 3 * * *`).
- `wrangler.toml`: R2 binding `BUCKET` → `photography-pixel-private` (used by
  local `wrangler pages dev`; the same binding is configured in the Pages
  dashboard for production).
- Defaults seeded: owner + coordinator (`scripts/bootstrap-coordinator.mjs`,
  `npm run coordinator:create`).

## Production steps (not automated — Cloudflare CLI was unauthenticated here)

1. **R2 bucket**: create the private bucket (e.g. `npx wrangler r2 bucket
   create photography-pixel-private`) and bind it to the Pages project as
   `BUCKET` (dashboard → project → Settings → Bindings → R2).
2. **Presigned downloads (optional)**: create an R2 API token (Object Read+Write
   on that bucket) and set secrets `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY` on Pages. Without them the app falls back to streaming
   through the authorized function.
3. **Env vars / secrets on Pages**: `SITE_URL` (e.g. `https://<project>.pages.dev`),
   Supabase URL/keys (already used by Phase 1), and `CLEANUP_SECRET` (strong,
   random) because cleaning runs from the cron worker.
4. **Cron worker**: `cd workers/cleanup && npx wrangler deploy` (its
   `wrangler.toml` defines the daily 03:00 cron). Set `CLEANUP_ENDPOINT` to
   `https://<project>.pages.dev/__cleanup` and `wrangler secret put
   CLEANUP_SECRET` to the same value as on Pages. The worker POSTs
   `x-cleanup-since` so the endpoint ignores calls sooner than 30 s apart.
5. **Deploy functions**: commit and push; Pages CI builds the Workers with the
   existing `_redirects` rules.

## Notes / dev artifacts

- The dev server is still running detached on `127.0.0.1:8788` (log at
  `server.log`). Killing strays before re-probes is required (port 8788 +
  `wrangler pages dev`/`workerd` processes).
- Admin/cron POSTs in tests required the `Origin: http://127.0.0.1:8788` header
  (same-origin guard).
- Test rows now live in the **real** project DB (deliveries for مريم العلوي /
  يوسف بكري) and local R2 holds test objects `originals/…/1|2/sample*.mp4`.
- The portfolio preview/“download” relies on Bamboo (no R2 object) — the
  confirm + first-download window still applies and is enforced server-side.