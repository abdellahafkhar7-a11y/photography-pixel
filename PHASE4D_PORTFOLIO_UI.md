# Phase 4D — Portfolio UI (Read-only)

Status: **Complete — awaiting approval. Not committed, not pushed.**

This phase replaces the `/admin/portfolio` placeholder with a read-only browser
of the site's existing portfolio. The public portfolio remains a set of static
`/data/*.txt` catalogues of Bamboo Cloud embed URLs declared in
`/data/config.json`; nothing was migrated to Supabase and no public portfolio
architecture was changed.

---

## 1. Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `functions/admin/_lib/portfolio-data.ts` | **new** | Read-only loader: parses `/data/config.json` categories and their `txtFile` video URL lists. |
| `functions/admin/_lib/views.ts` | modified | Added `renderPortfolio(appUser, categories)`. Other views untouched. |
| `functions/admin/portfolio.ts` | modified | Loads the overview and renders it instead of the placeholder. |

No migrations, no infrastructure, no bindings, no secrets, no public-site files,
and no delivery/backend logic were modified.

---

## 2. Behaviour

- **`/admin/portfolio`** — a read-only page with two real stat cards
  (`الأقسام`, `إجمالي الفيديوهات`) and one panel per video category. Each panel
  shows the category title, its description/subtitle, the source file
  (`data/…txt`), a per-category video count, a `الصفحة العامة` link to the live
  public page, and a table of the video URLs with an `فتح` link. Categories
  without a video catalogue (models, media-buyer, voice-over) are excluded —
  they have their own modules. Gallery is included and shows its real empty
  state.
- Live data: **7 categories, 81 videos** (UGC 21, Shooting 13, Stores 15,
  Events 13, Services 13, Gallery 0, Locations 6). Public routes are mapped
  correctly, including the historical `shoting` key → `/shooting`.
- Empty state when no categories are found: `لا توجد أقسام أعمال متاحة`.

No destructive editing was implemented: the module needs new architecture to
safely edit static catalogues, which is out of scope for this phase.

---

## 3. Role behaviour

Owner and coordinator both have read-only access (portfolio is a shared
module). No write action exists, so there is nothing to gate beyond the
session check (`requireSession`).

---

## 4. Verification

- `npm run typecheck` ✅
- `npm run lint` (`--max-warnings=0`) ✅
- `npm run build` ✅ (no prerender diffs)
- Runtime QA (headless Edge + CDP): owner nav 12, coordinator nav 8; 2 stat
  cards; 7 panels with the correct public links (`/ugc`, `/shooting`, `/stores`,
  `/events`, `/services`, `/gallery`, `/drone`); 81 real video rows; responsive
  at 1440/1280/1024/768/430/390/375 with **0 horizontal overflow**.
- Result: **0 problems**.

---

## 5. Known limitations

- The public portfolio is not editable from the admin (by design in this
  phase); it remains file-based.
- Video thumbnails are not available from the Bamboo embed URLs, so the list
  shows URLs rather than previews.
