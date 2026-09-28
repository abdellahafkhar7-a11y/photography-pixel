# PHASE4L — Client Management + Versioning + Stable Client Links

## Result: PASS — `PROBLEMS=0`

Gates: `typecheck` ✅ `lint` ✅ (max-warnings=0) `build` ✅ (13 prerendered pages, sitemap 14 URLs).
Schema: 2 migrations applied to the linked Supabase project (`20260926000005_client_management_versioning`, `20260927000006_activity_management_events`).
Verification: DB invariant checks (**8/8 PASS**) + bundle-level render tests of every admin view (**12/12 PASS**) + live-runtime checks on `npm run dev` (:8788), incl. stable-link dead-page routing. See caveats below — no long-lived E2E auth flow was rerun this session, so the report lists exactly what was verified.

## The new capabilities (this pass)

**1. Stable client links — `identifier` + secret.** Every private link is now `/p/<identifier>-<secret>` where:
- `identifier` = a cosmetic, **non-secret** prefix derived once at creation from the client's normalized WhatsApp digits (`stableClientVisibleId`), else 8 hex chars of the delivery uuid for client-less portfolio links (≤ 32 chars, validated by `splitStableToken`).
- `secret` = the random private token; **only its SHA-256 hash is stored** (`private_token_hash`). The identifier is never stored separately — it is recomputed from `clients.whatsapp_number`/`delivery_id` on demand.
- Legacy bare `/p/<secret>` links still resolve: `splitStableToken` falls back to `{identifier:null, secret}` when there is no dash, so old links keep working.
- The full link is shown **once** (freshToken after create/regenerate); afterwards the detail page shows the masked stable link `/p/<identifier>-••••••••••••` with owner actions إنشاء رابط جديد (regenerate) / إلغاء الرابط (revoke). Recovery path = «إنشاء رابط جديد».

**2. Versioning without token rotation.** Re-uploading on `/admin/deliveries/{id}/upload`:
- Deactivates the active version, inserts a new `delivery_videos` row (version++, fresh state), resets the delivery lifecycle to `pending` with confirm/download fields nulled.
- **The link/token is NOT rotated** — the private link stays the same and the old version's own state columns are preserved for history.
- Version history table on the detail page: each row shows النسخة N, current/sort/archived badge, file details, lifecycle timestamps; owner actions أرشفة / حذف الملف for non-active versions only (active version is protected; deletable original is removed from R2 + `original_deleted_at`/`archived_at` set; second click restores the link state).

**3. Delivery modes.** `deliveries.delivery_mode` (`VIEW_AND_DOWNLOAD` | `VIEW_ONLY`), settable at creation (new-delivery wizard step 3, upload wizard step 2) and togglable on the detail page (owner, blocked after first download):
- `VIEW_ONLY`: client confirms and views only — `downloadAllowed` is always false, no release button, client stats show «—», badges read «تم التأكيد — العرض فقط».
- `VIEW_AND_DOWNLOAD`: previous behavior (confirm → release → download window).

**4. Client management.** `/admin/clients` (owner-only, unchanged in sidebar):
- Active/archived status (`clients.status`), status filter, search by name/WhatsApp digits, totals (all/active/deliveries), latest delivery per client.
- Add client form (create or reactivate by normalized WhatsApp), archive/reactivate on the client detail page. Archived clients keep deliveries and links; archiving never deletes.
- Client detail now shows deliveries with mode + stable identifier + open links + active-version count. Coordinators still create/select clients through the existing delivery create flows (per their permissions) — the management page stays owner-only.

**5. Delivery archive.** Detail page danger-zone «أرشفة التوصيل / إعادة إلى القوائم» hides archived deliveries from the main list but keeps data; archived deliveries block release/regenerate/revoke/set_mode server-side.

**6. Audit trail.** New activity events `delivery_archived`, `delivery_unarchived`, `version_archived`, `version_deleted`, `delivery_mode_changed` (enum extended by migration `000006`), with Arabic labels in the admin log.

## Files touched

- `supabase/migrations/20260926000005_client_management_versioning.sql` — NEW (applied): `delivery_mode` + `client_status` enums, `deliveries.delivery_mode`, `deliveries.client_visible_id`, `deliveries.archived_at`, `clients.status` (backfilled), per-version columns on `delivery_videos` (`confirmed_at`, `download_released_at`, `downloaded_at`, `download_expires_at`, `expired_at`, `archived_at`) + backfill of active-version state and a stable `client_visible_id`.
- `supabase/migrations/20260927000006_activity_management_events.sql` — NEW (applied): 5 new `delivery_activity_type` values.
- `functions/_lib/db-types.ts` — `DeliveryMode`, `ClientStatus`, extended row/insert/update types, extended `DeliveryActivityType`.
- `functions/_lib/tokens.ts` — `splitStableToken` (identifier–secret split, legacy fallback).
- `functions/p/_client.ts` — resolve hashes only the secret; `setActiveVersionColumn` mirrors lifecycle timestamps onto the active version; `downloadAllowed` blocks VIEW_ONLY; private page renders view-only messaging («هذا الرابط للعرض فقط», stat expiry «—»).
- `functions/p/[token].ts` + `p/[token]/preview.ts` + `p/[token]/download.ts` + `p/[token]/thumb.ts` — validate `splitStableToken(token).secret`.
- `functions/admin/_lib/shell.ts` — `archive` icon + CSS: `.badge.md-download/.md-view/.st-download`, `.tbl tr.row-muted`, `.row.deleted`, `.check-field`, `.card.danger-zone`.
- `functions/admin/deliveries/_helpers.ts` — `.client_visible_id`/`.archived_at`/`delivery_mode` in list/detail selects, unfiltered `listDeliveries` (200), `stableClientVisibleId`, `privateLinkFor(request, env, token, identifier)`, new activity labels.
- `functions/admin/deliveries/[id]/upload.ts` — version upload no longer rotates the token.
- `functions/admin/deliveries/[id]/index.ts` — POST `set_mode`, `archive_delivery`/`unarchive_delivery`, `archive_version`/`delete_version` (R2 delete + guards: active version protected, archived blocks everything but unarchive), archive/`VIEW_ONLY` guards on `release`/`regenerate`/`revoke`, activity logging.
- `functions/admin/deliveries/index.ts` — GET parses `q/status/source/client/multi`, loads client dropdown.
- `functions/admin/deliveries/new.ts` — mode step, `crypto.randomUUID()` delivery id, `client_visible_id`, stable link in JSON + HTML paths.
- `functions/admin/uploads.ts` — `handleCreate` accepts `delivery_mode`, inserts identifier, returns stable link.
- `functions/admin/_lib/delivery-views.ts` — mode badges, list filters (status/source/client/multi), `linkCard` (stable fresh link + copy/wa.me/فتح), shareCard (masked stable + release gated `!viewOnly` + regenerate/revoke, archived notice), version-history table + actions, mode-toggle card, delivery archive danger zone, wizard step 2 mode radio + create sends `delivery_mode`, upload hints («بقاء الرابط نفسه»), view-only confirmed badge.
- `functions/admin/_lib/clients-data.ts` — rewritten: list with status + latest delivery, client detail with mode/identifier/active-version count, `createClient` (create/reactivate by WhatsApp), `setClientStatus`.
- `functions/admin/_lib/clients-views.ts` — rewritten: status pills/filter, add-client form, stats, client detail with deliveries (mode + stable id) + archive/reactivate.
- `functions/admin/clients.ts`, `functions/admin/clients/[id].ts` — GET filters (status/q) + POST create / archive / reactivate (owner-only).

## Verified

- `tsc --noEmit` ✅, `eslint --max-warnings=0` ✅, `npm run build` ✅.
- DB invariants (direct service-role queries): 8/8 PASS — both deliveries have a valid `delivery_mode` + non-empty `client_visible_id`; clients status enum valid; `delivery_videos` rows have all 6 per-version columns; live row 5abfbedd→active v1 portfolio intact.
- `splitStableToken` (bundled real code): 8/8 PASS — legacy bare token, `identifier-secret`, letters/underscore identifiers, empty identifier fallback, first-dash split, generated token format, null rejection.
- View render harnesses (bundled real templates, ~15 JSON scenarios): 12/12 PASS — list; fresh-stable link card; version table (current/previous/archived + delete); release control; stable masked link; VIEW_ONLY hides release + shows «عرض فقط»; archived shows restore + hides controls; wizard; clients list + detail.
- Runtime on `npm run dev` (:8788): `/p/<identifier>-<bogus secret>` and legacy bogus token both render the dead/invalid link page; `/home`, `/admin/*` respond correctly.

## Caveats / not re-run this session

- No authenticated full-flow E2E (create delivery → client opens/confirms → owner release → download → expiry) was re-executed on the live server this session; the previous 4J/4K E2E suite (`p4l-qa.mjs`/`p4k-qa.mjs` patterns) would need the owner session + R2 emulator to be replayed.
- `5a809d7f` (live r2 delivery `212766646107`) has **no** `delivery_videos` row yet — its original token is unrecoverable; use «إنشاء رابط جديد» on its admin page to obtain a fresh stable link.
- DB-verification harnesses live in `%TEMP%\opencode\` (`p4l-verify.mjs`, `p4l-tokens-test.mjs`, `p4l-views-test.mjs`) and are intentionally not committed.

## Baseline (unchanged)

Not committing/pushing; everything staged as working-tree changes only.