# Phase 4E — Content Modules UI (Models, UGC, Media Buyer, Voice Over, Equipment)

Status: **Complete — awaiting approval. Not committed, not pushed.**

This phase replaces the five content-module placeholders with real, read-only
admin pages. Every record comes from the site's existing `/data` files; nothing
is invented and nothing is written. The public pages and model booking flow are
untouched.

---

## 1. Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `functions/admin/_lib/static-data.ts` | **new** | Shared read-only access to static `/data` assets (`readStaticAsset`, `readStaticJson`, `httpUrls`). |
| `functions/admin/_lib/content-data.ts` | **new** | Typed loaders: `loadModels`, `loadMediaBuyer`, `loadVoiceOver`, `loadUgc`. Malformed/missing data → `[]`. |
| `functions/admin/_lib/content-views.ts` | **new** | `renderModels`, `renderUgc`, `renderMediaBuyer`, `renderVoiceOver`, `renderEquipment`. |
| `functions/admin/_lib/portfolio-data.ts` | modified | Refactored to use the shared `static-data` helper (no behaviour change). |
| `functions/admin/models.ts` | modified | Loads and renders real models. |
| `functions/admin/ugc.ts` | modified | Loads and renders real UGC videos. |
| `functions/admin/media-buyer.ts` | modified | Loads and renders real campaigns. |
| `functions/admin/voice-over.ts` | modified | Loads and renders real voice-over records. |
| `functions/admin/equipment.ts` | modified | Renders an honest empty state. |

No migrations, no infrastructure, no bindings, no secrets, no public-site
files, and no backend logic were modified.

---

## 2. Modules

| Route | Source | Shown |
| --- | --- | --- |
| `/admin/models` | `data/models.json` (6) | Photo, name, city, category, availability badge, description; stats (total, available). |
| `/admin/ugc` | `data/ugc.txt` (21) | Numbered list of the real video URLs with open links; stat (count). |
| `/admin/media-buyer` | `data/media-buyer.json` (2) | Campaign, platform, objective, messages, result, description, screenshot link; stats (campaigns, total messages = 470). |
| `/admin/voice-over` | `data/voiceover.json` (1) | Title (+ featured badge), category, language, duration, client, date, audio link; stats (records, languages). |
| `/admin/equipment` | — | Honest empty state: the public equipment page is informational and has no structured equipment list, so nothing is fabricated. |

Each page has a `الصفحة العامة` link to its live public route (`/model`, `/ugc`,
`/media-buyer`, `/voice-over`, `/equipment`). Every table has a real empty
state.

---

## 3. Role behaviour

All five modules are shared (owner + coordinator) and read-only, so only the
session check (`requireSession`) applies. No write action exists.

---

## 4. Verification

- `npm run typecheck` ✅
- `npm run lint` (`--max-warnings=0`) ✅
- `npm run build` ✅ (no prerender diffs)
- Runtime QA (headless Edge + CDP), owner and coordinator:
  - models 6/6, 6 rows, 6 photos; ugc 21 rows; media-buyer 2 campaigns /
    470 messages; voice-over 1 record / 1 language; equipment empty state.
  - Public link present on every page; owner nav 12, coordinator nav 8.
  - Responsive at 1440/1280/1024/768/430/390/375 — **0 horizontal overflow**.
  - Result: **0 problems**.

---

## 5. Known limitations

- These modules are read-only; editing the static `/data` files from the admin
  would require new architecture and is out of scope for this phase.
- Model/UGC/media-buyer/voice-over content remains file-based.
