# Phase 4C — Client Delivery UI (Phase 4A Shell)

Status: **Complete — awaiting approval. Not committed, not pushed.**

This phase rebuilds the Client Delivery admin UI on top of the Phase 4A/4B
shell and design system. The Phase 2 backend (private tokens, R2 storage,
3-day download window, cleanup worker, version rotation, WhatsApp sharing) is
preserved unchanged — only the presentation layer was reskinned and the
existing route handlers were rewired to the new views.

---

## 1. Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `functions/admin/_lib/delivery-views.ts` | **new** | Shell-based renderers for the delivery list, create form, detail page, and upload page. Presentation-only. |
| `functions/admin/_lib/shell.ts` | modified | 15 new inline line icons; a forms/alerts/badges/layout CSS block. Design tokens untouched. `NAV_ITEMS` client-delivery href → `/admin/deliveries`. |
| `functions/admin/deliveries/index.ts` | modified | Renders via `renderDeliveryList`; server-side `q`/`status` filtering; owner cleanup POST preserved. |
| `functions/admin/deliveries/new.ts` | modified | Renders via `renderDeliveryNew`; create logic (client upsert, token generation, portfolio/r2 branch) preserved. |
| `functions/admin/deliveries/[id]/index.ts` | modified | `renderDetailPage(appUser, …)` now delegates to `renderDeliveryDetail`; regenerate/revoke logic preserved. |
| `functions/admin/deliveries/[id]/upload.ts` | modified | Renders via `renderDeliveryUpload`; R2 upload / version rotation / token reset logic preserved. |

No migrations, no infrastructure, no Cloudflare bindings, no secrets, no
public-site files, and no Phase 1/2/3 backend logic were modified.

---

## 2. Routes & behaviour

- **`/admin/deliveries`** — list with four real status stat cards (الإجمالي,
  بانتظار العميل, مؤكّدة, منتهية), a search box (client name or WhatsApp),
  a status filter, and a table (client, WhatsApp, source, status, version,
  created date, download deadline, details). Empty state:
  `لا توجد توصيلات`. Owner-only cleanup button preserved
  (`تنظيف التوصيلات المنتهية`).
- **`/admin/deliveries/new`** — three-step form: existing/new client, video
  source, create. Owner sees both `من المعرض العام` and `فيديو خاص`; the
  coordinator sees only `من المعرض العام`. Portfolio videos are grouped by
  category from the site's own `/data` catalog (81 options / 6 categories live).
- **`/admin/deliveries/{id}`** — client info, source + status badges, active
  version preview (public portfolio video inline, or a private-storage note for
  R2), version history, status timeline, and the append-only activity log.
  Fresh private link is shown **once** after create/regenerate/upload, with a
  copy button and an `إرسال عبر واتساب` `wa.me` button. Owner-only regenerate /
  revoke / upload actions.
- **`/admin/deliveries/{id}/upload`** — owner-only R2 upload; the new version
  deactivates the previous one, resets the delivery to `pending`, and rotates
  the private token. Portfolio-source deliveries show a guard message.

### Bug fixed during QA
Immediately after creating an R2 delivery, the fresh-token page previously
showed no way to upload the first version (the upload action lived only in the
non-fresh branch). The upload action is now its own card, rendered in both
branches, with the private-storage explanation.

---

## 3. Role behaviour

| | Owner | Coordinator |
| --- | --- | --- |
| View list / detail | yes | yes |
| Create from portfolio | yes | yes |
| Create private (r2) delivery | yes | **no** (radio hidden + server-side rejection) |
| Upload / regenerate / revoke | yes | no (owner-only, server-side) |
| Cleanup expired deliveries | yes | no (owner-only) |

UI hiding is not treated as security: every owner-only action is still gated
server-side by `requireOwner` and `sameOrigin`.

---

## 4. Security & data integrity

- No service-role key or token ever reaches the browser; all queries run
  server-side with the canonical `createServiceClient`.
- Private links are still stored only as a hash; the plaintext token is shown
  once. The list/detail pages are returned with `Cache-Control: private,
  no-store` and `X-Robots-Tag: noindex` (via `adminHtml`).
- No R2 public URL is generated; private originals remain in the private bucket.
- The 3-day download window, one-active-version rule, cleanup worker, and
  version-rotation-on-upload behaviours are untouched.

---

## 5. Verification

- `npm run typecheck` ✅
- `npm run lint` (`--max-warnings=0`) ✅
- `npm run build` ✅ (13 prerendered pages, no diffs)
- Runtime QA via headless Edge + CDP against `wrangler pages dev`:
  - Owner: list (empty + filtered), new form (81 portfolio options), portfolio
    create, fresh-link card + copy + `wa.me`, regenerate, revoke, portfolio
    upload guard, R2 create → upload → lock preview + version 1 + fresh token.
  - Coordinator: list (no cleanup button), new form (no R2 radio).
  - Responsive at 1440/1280/1024/768/430/390/375 — **0 horizontal overflow**.
  - Result: **0 problems**.
- All seeded test data and the uploaded R2 object were removed afterwards;
  database returned to baseline (clients=2, deliveries=0, videos=0,
  activity=0).

---

## 6. Known limitations

- The create POST renders the detail page inline at `/admin/deliveries/new`
  (same behaviour as Phase 2) so the one-time token can be displayed; the URL
  does not change to the delivery id. This matches the existing design.
- Portfolio videos are previewed from their existing public Bamboo URL; R2
  private videos intentionally have no admin preview.
