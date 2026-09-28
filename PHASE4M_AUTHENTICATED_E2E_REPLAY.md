# Phase 4M — Authenticated Full E2E Replay (4K/4L)

Date: 2026-09-26 · Environment: `wrangler pages dev` (127.0.0.1:8788) + headless Edge (CDP 9330) + local Supabase (`supabase db push`) + local R2 emulator. Artifacts under `C:\Users\abdel\AppData\Local\Temp\opencode\qa4l\`.

## Result: ALL CHECKS PASS (PROBLEMS=0)

The full authenticated workflow was replayed end-to-end with **one** scoped code fix
(see below) and **one** documented caveat. Final run: 170+ assertions, 22 steps, `PROBLEMS=0`.

## What was verified (per step)

1. **Owner login** — session → `/admin` with role `owner`.
2. **Client creation** — `عميل QA4L E2E` / `0612345678` via `/admin/clients`; row active in DB, list updated.
3. **Private delivery (wizard)** — multipart R2 upload, `VIEW_AND_DOWNLOAD`, delivery `pending`;
   stable link `http://localhost:8788/p/212612345678-…` (identifier = normalized WhatsApp digits);
   DB stores only `sha256(secret)`; v1 R2 key `originals/{id}/1/_____ E2E 4L A.mp4` (Arabic sanitized).
4. **Client open — unauth** — watermark `pp-pattern-watermark`, `.video-frame.vertical`,
   `controlslist="nofullscreen"` + fullscreen-exit guard, preview served by the app (`/p/{token}/preview`,
   real bytes), no delivery/version internal ids, no direct R2/Bamboo originals URL, no version history leak,
   no horizontal overflow at 390/375/430/768 px. Open flips `pending → preview_viewed`.
5. **Pre-confirm download blocked** — 302 redirect back to page, never to storage.
6. **Client confirmation** — «تم تأكيد الفيديو بنجاح», locks links, status `confirmed`, `confirmed_at` set,
   mirrored per-version; activity: `link_opened`/`preview_viewed`/`video_confirmed`.
7. **Owner confirmed view** — badge «تم التأكيد — بانتظار إطلاق التحميل», release button present,
   original download still blocked until release.
8. **Owner release** — `download_available`, does NOT open the window itself, `download_released_at`
   recorded on active version, and **activity `delivery_released` is logged** (new event — see fix).
9. **Client download** — «تحميل الفيديو الأصلي» appears, proxy 200 + `Content-Disposition: attachment`,
   bytes match upload, no direct storage URL.
10. **3-day timer** — first download → `downloaded`, `download_expires_at = downloaded_at + 72h` exactly
    (±5s), subsequent downloads keep the SAME expiry (no reset), v1 mirrors timestamps.
11. **V2 upload** — version table shows V1 inactive / V2 active, lifecycle reset (`pending`), timestamps
    cleared, **same `private_token_hash` → same stable link**, masked `212612345678-••••…` on detail,
    V1 history preserved.
12. **Client same link → V2 only** — V1 media absent, exactly one `<video>`, no version ids, no version
    history text, preview streams V2 bytes, layout clean.
13. **V2 independent confirmation** — re-confirms; V1 `confirmed_at` preserved & distinct.
14. **V2 independent release** — V2 released, V1 release timestamp untouched, V2 window still closed.
15. **VIEW_ONLY** — client views + confirms («هذا الرابط للعرض فقط» + «شكراً لثقتك»), never offers a
    download, original download 302, owner release blocked («هذا التوصيل بوضع «عرض فقط»»), badge
    «تم التأكيد — العرض فقط», info alert for owner, no release form.
16. **Archive** — archived badge + hint «التوصيل مؤرشف — أعد تفعيله لاستخدام الرابط.», actions hidden,
    server guard for owner POSTs («أعد تفعيله أولاً»), history (activity/versions) intact, unarchive
    restores controls. **Caveat:** the client link `/p/{token}` still resolves while archived (no archive
    gate in `p/[token].ts`); only admin controls/actions are gated — documented, not changed.
17. **Version guards** — archiving/deleting the *active* version blocked («لا يمكن أرشفة أو حذف النسخة
    النشطة…»); after V2 replaced it, V1's file was deleted from R2 (preview 404) and archived
    (`original_deleted_at` + `archived_at`).
18. **Client history** — client detail lists deliveries with mode badges, active-version stat,
    masked stable link `212612345678••••…`, correct modes in DB.
19. **RBAC (coordinator)** — `qa4l@test.local` allowed `/admin/deliveries` + portfolio create (r2 source
    hidden), 403 on `/admin/clients`, client detail, `/admin/uploads`, and all owner POSTs
    (release/set_mode/archive_version/upload-begin); detail page hides owner actions & version actions.
20. **Security scan** — no service key, its name, R2 creds, R2 object keys, R2/Bamboo hosts, token hashes,
    raw tokens, or `SUPABASE_URL` in any HTML response; private pages `private, no-store` + `noindex`.

## One code fix applied for the replay

Owner release did **not** write an audit event. Minor add-only change:

- `supabase/migrations/20260927000007_delivery_released_activity.sql` — `alter type … add value 'delivery_released'` (pattern of 000006). Applied via `npm run db:migrate`.
- `functions/_lib/db-types.ts` — union member `'delivery_released'`.
- `functions/admin/deliveries/_helpers.ts` — `ACTIVITY_LABEL.delivery_released = 'تم إطلاق التحميل'`.
- `functions/admin/deliveries/[id]/index.ts` — `recordActivity(service, detail.id, 'delivery_released')` in the release block.

Verified: the run that exercised release produced the `delivery_released` row; a direct enum probe insert
(service key) succeeded and was removed.

## Cleanup / baseline restore

- Deleted all test deliveries (main V1/V2, VIEW_ONLY, coordinator portfolio artifacts — incl. 5 leftovers
  bound to baseline client `34080551`), test client, and the coordinator auth user.
- **DB back to baseline: deliveries=2, clients=3, videos=1, activity=7.** Verified equal counts.
- **R2 back to baseline: 34 blobs** (13 test-upload blobs diffed against `p4l-baseline.json` and deleted
  after stopping the server; 0 baseline blobs missing).
- Deleted test links → «الرابط غير صالح أو انتهت صلاحيته» (dead-link check passed for both tokens).
- Dev server and QA browser stopped.

## Gates

- `npm run typecheck` → exit 0
- `npm run lint` (max-warnings=0) → exit 0
- `npm run build` → exit 0 (13 prerendered pages, sitemap 14 URLs)

## Git

Working tree intentionally left uncommitted (per instructions). This session changed only:
`functions/admin/deliveries/[id]/index.ts`, `functions/admin/deliveries/_helpers.ts`,
`functions/_lib/db-types.ts`, and the new `supabase/migrations/20260927000007_delivery_released_activity.sql`.
All other modified/untracked files are the pre-existing Phase 4 working tree.