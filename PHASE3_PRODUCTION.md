# Phase 3: Production Deployment — Client Delivery on Real Cloudflare + Supabase

Date: 2026-09-24
Scope: Move the Phase 2 Client Delivery system to real production infrastructure.
No Phase 1/2 rebuild, no dashboard redesign, no unnecessary public-portfolio changes,
no Bamboo video migration, no WhatsApp Business API, no mock infra.

## 1. Production components

| Component | Value |
| --- | --- |
| Pages project | `photographyportfolio` (existing, reused) |
| Pages production branch | `main` (GitHub repo `abdellahafkhar7-a11y/photography-pixel`) |
| Pages build command | `npm ci && npm run build` (prerenders root static pages via `build.mjs`) |
| Functions | auto-compiled from repo `functions/` (root `"",` output `/`) |
| R2 bucket (real) | `photography-pixel-client-delivery` (Standard storage) |
| R2 binding (Pages) | `BUCKET` -> `photography-pixel-client-delivery` |
| Supabase | real project `pleuxwnlfcumdurbjdea.supabase.co`, schema in place |
| Cleanup worker | `photography-pixel-cleanup`, cron `0 3 * * *` UTC |
| Worker secrets | `CLEANUP_ENDPOINT`, `CLEANUP_SECRET` (set via `wrangler secret put`) |
| Pages plain env vars | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL=https://photographypixell.com` |
| Pages secret env vars | `SUPABASE_SERVICE_ROLE_KEY`, `CLEANUP_SECRET` (type `secret_text`) |

No hard-coded secrets in the repo. `.env` / `.dev.vars` are git-ignored; only the
value-less `.env.example` is committed.

## 2. How it was deployed

1. Confirmed Cloudflare OAuth login (wrangler 4.137.0).
2. Located existing Pages project via API; verified domain and Git source.
3. Created real bucket:
   `npx wrangler r2 bucket create photography-pixel-client-delivery`
4. Configured project with the Cloudflare API (`PATCH /pages/projects/photographyportfolio`):
   - `deployment_configs.production.env_vars` (plain + `secret_text` entries)
   - `deployment_configs.production.r2_buckets` -> `BUCKET`
   - `build_config.build_command = "npm ci && npm run build"`
   Verified via `GET` (secret values are masked in responses).
5. Committed the previously untracked Phase 1/2 source and pushed to `main`;
   Pages built and deployed (deployment `e1f9c894`). Functions became live
   (previously `/admin/login` and `/p/*` were 404).
6. Deployed cleanup worker with `npx wrangler deploy`; set its secrets by piping
   values into `wrangler secret put CLEANUP_SECRET` / `CLEANUP_ENDPOINT`.

## 3. Production smoke tests (all against https://photographypixell.com)

- Public site: `/`, portfolio/UGS/shooting routes, sitemap -> 200. `/admin/login` 200 (Functions live).
- Owner login (real Supabase, real password) -> 303 to `/admin`; admin dashboard 200.
- Created a real portfolio delivery -> client flow:
  pending page (confirm UI) -> confirm -> preview/target 302 (Bamboo embed) ->
  download 302. DB: status `downloaded`, `download_expires_at = downloaded_at + 3 days` exactly.
  Repeat download logged a second `download_started` but did NOT reset `downloaded_at`/`download_expires_at`.
- Created a real R2 delivery, uploaded a real 4096-byte MP4 to the real bucket:
  my reset + token rotation happened after upload (by design); new token's flow:
  preview 200 `video/mp4`, Range -> 206, download 200 with
  `Content-Disposition: attachment; filename="sample.mp4"` streamed from R2.
- Expiry (safe, dedicated test delivery, backdated `download_expires_at` to -1 day):
  page flipped expired, preview 410, download 302 -> page, `delivery_expired` activity recorded.
- Real cleanup run (guarded `POST /__cleanup` with the real secret):
  `{"claimed":0,"originalsDeleted":1}` -> R2 original object deleted from the real bucket,
  `original_deleted_at` set, audit trail:
  delivery_created, version_created, link_opened, preview_viewed, video_confirmed,
  download_started, delivery_expired, original_deleted.
  Second run idempotent: `{"claimed":0,"originalsDeleted":0}`.
- Triggered the deployed cleanup WORKER over HTTPS -> it called the endpoint with its
  own secrets and got the rate-limit guard (`too_soon`), proving the full cron chain
  (execution path) works without waiting for 03:00 UTC.
- RBAC: coordinator login works, sees no `r2` source option, upload attempt -> 403.
- Guard rails: `GET /__cleanup` 405; no secret values appear in any admin/client HTML.

## 4. Test data cleanup

All deliveries in the real DB were test rows (Phase 2 + this smoke test); they were
deleted with cascade (0 deliveries / 0 videos / 0 activity rows remain). Seed clients
were left in place as reference data. The only R2 object ever stored in the real bucket
was the smoke-test upload, and it was deleted by the cleanup run; the real bucket is empty.

## 5. Presigned URL path (authored streaming, opt-in)

Downloads work without presigned URLs via the authorized streaming proxy. To OPT-IN to
short-lived presigned URL redirects, create an R2 API token scoped to
`photography-pixel-client-delivery` (dashboard: R2 -> Manage R2 API Tokens -> Object
Read/Write on `photography-pixel-client-delivery`), then set Pages env vars/secret:
`R2_ENDPOINT` (plain, e.g. `https://<account-id>.r2.cloudflarestorage.com`),
`R2_ACCESS_KEY_ID` (secrte_text), `R2_SECRET_ACCESS_KEY` (secret_text), redeploy.
Without these vars the system stays on the fallback streaming path (identical RBAC gate).

## 6. Ops / rollback

- Manual cleanup: `POST https://photographypixell.com/__cleanup` with
  `x-cleanup-secret: <CLEANUP_SECRET>` and `x-cleanup-since: <epoch-ms >30s in past>`.
- Cron: worker `photography-pixel-cleanup`, schedule `0 3 * * *`.
- Verify config: `GET /accounts/{acct}/pages/projects/photographyportfolio` (masked).
- Rollback: pin Pages back to the previous deployment or revert `main` and push.
- No secrets were printed or committed. `CLEANUP_SECRET` exists only as a Pages secret,
  a worker secret, and in the local temp scratch file on this machine.