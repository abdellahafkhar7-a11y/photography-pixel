# Phase 4A: Admin Dashboard Shell + Design System

Date: 2026-09-24
Scope: Build the admin dashboard **shell and design system only**. No feature modules,
no backend/RBAC/R2/cleanup changes, no public-portfolio changes.

Out of scope (deferred to Phase 4B+): the actual content of every module page. Each
module route is a styled, RBAC-protected placeholder. The working Client Delivery
module from Phase 2 is preserved as-is.

## 1. Design language

The dashboard is an extension of the public portfolio's editorial system, not a
generic admin theme. Runtime-verified computed styles:

| Token | Value | Where |
| --- | --- | --- |
| Content background | `#FAF8F3` (warm ivory) | `.dash-main` |
| Card / sidebar surface | `#FFFFFF` | `.card`, `.side` |
| Primary text | `#201F1C` (charcoal) | body |
| Accent | `#362477` (blue/purple) | buttons, pills, active nav |
| Signature gradient | `135deg #2678bb → #362477 → #4a1170` | active nav item, avatar, logo |
| Font | `Segoe UI` stack (matches site) | body |
| Radii / shadows | site radii + soft warm shadows | cards, panels |

Clean line icons are hand-inlined SVGs (`stroke="currentColor"`, 1.7 stroke, 24 viewBox)
in `shell.ts` — **no icon library was added**. Everything is server-rendered HTML strings,
matching the existing Functions convention; the only client JS is a ~10-line drawer toggle.

## 2. Files

| File | Purpose |
| --- | --- |
| `functions/admin/_lib/shell.ts` | New. Design tokens/CSS, line-icon set, nav config, responsive shell (`shell()`), login page, shared components (`card`, `statCard`, `panel`, `rolePill`, `placeholderBody`). |
| `functions/admin/_lib/views.ts` | Rewritten from the old dark template to the new shell: `renderLogin`, `renderDashboard`, `renderTeam`, `renderPlaceholder`. Same exported signatures, so existing route handlers are unchanged. |
| `functions/admin/portfolio.ts`, `models.ts`, `ugc.ts`, `media-buyer.ts`, `voice-over.ts`, `equipment.ts` | New placeholder routes (any active session). |
| `functions/admin/clients.ts`, `analytics.ts`, `settings.ts` | New placeholder routes (owner only). |
| `functions/admin/client-delivery.ts` | New alias: `302` → `/admin/deliveries` (the real Phase 2 module). |
| `functions/admin/index.ts`, `login.ts`, `team.ts`, `logout.ts` | Unchanged handlers; now render the new shell via `views.ts`. |
| `functions/_lib/brand.ts`, `functions/admin/deliveries/**` | Untouched. Client Delivery keeps its existing brand topbar. |

## 3. Dashboard home

- Greeting with the real user name + real "last login" time + role pill.
- Four neutral summary cards (`—`, "جاهز للبيانات"): العملاء، الأعمال، تسليمات العملاء، أعضاء الفريق.
  No fabricated numbers.
- Reserved panels (honest placeholders, tagged "قيد التحضير"): النشاط الأخير، نظرة عامة على المعرض.
- Real quick actions that target existing working pages only: توصيل جديد (`/admin/deliveries/new`),
  قائمة التوصيلات (`/admin/deliveries`), الفريق (`/admin/team`, owner only).

## 4. Navigation & RBAC

Nav is role-filtered server-side in `navItemsFor(role)`; the same rule is enforced again
per route via `requireSession` / `requireOwner` (RBAC is unchanged and remains the source of truth).

| # | Item | Route | Coordinator | Owner |
| --- | --- | --- | --- | --- |
| 1 | لوحة التحكم | `/admin` | yes | yes |
| 2 | الأعمال | `/admin/portfolio` | yes | yes |
| 3 | الموديلات | `/admin/models` | yes | yes |
| 4 | UGC | `/admin/ugc` | yes | yes |
| 5 | Media Buyer | `/admin/media-buyer` | yes | yes |
| 6 | التعليق الصوتي | `/admin/voice-over` | yes | yes |
| 7 | المعدات | `/admin/equipment` | yes | yes |
| 8 | تسليم العملاء | `/admin/client-delivery` → `/admin/deliveries` | yes | yes |
| 9 | العملاء | `/admin/clients` | no (403) | yes |
| 10 | التحليلات | `/admin/analytics` | no (403) | yes |
| 11 | الفريق | `/admin/team` | no (403) | yes |
| 12 | الإعدادات | `/admin/settings` | no (403) | yes |

Coordinator sees 8 items; owner sees 12. Unauthenticated `/admin*` redirects to `/admin/login`.
The owner-only forbidden response is the pre-existing `requireOwner` 403 page (unchanged).

## 5. Responsive behavior

- ≥ 992px: fixed right-hand sidebar (RTL start) + sticky glass header.
- < 992px: off-canvas drawer with overlay, hamburger toggle, Esc-to-close.
- ≤ 767px: stat grid 2 columns, reserved panels stack, user email hidden.
- ≤ 479px: stat grid stays 2 columns; the team table scrolls inside its card (`.table-wrap`)
  so the page never overflows.

## 6. Verification

Static gates (all pass): `npm run typecheck`, `npm run lint`, `npm run build`
(prerender output deterministic — no diff to root HTML/sitemap).

Browser QA via headless Edge + CDP against `wrangler pages dev` (real Supabase login),
logging in through the actual login form:

- Unauthenticated `GET /admin` → redirects to `/admin/login`. `/admin/client-delivery` → 302.
- Owner dashboard at 1440/1280/1024/768/430/390/375px: 12 nav items, no horizontal overflow,
  content bg `rgb(250,248,243)`, sidebar `rgb(255,255,255)`, active nav has the brand gradient, font `Segoe UI`.
- Owner `/admin/portfolio`, `/admin/settings`, `/admin/team` → 200.
- Coordinator dashboard at 1280/375px: 8 nav items, no overflow, no owner items in the sidebar.
- Coordinator `/admin/portfolio` → 200; `/admin/team`, `/admin/settings`, `/admin/analytics`,
  `/admin/clients` → 403 (owner-only).
- Mobile drawer: toggling `#nav-toggle` adds `.nav-open` and reveals the sidebar.
- Public `/` and `/portfolio` → 200 (untouched).
- Screenshots captured for all widths and key pages (owner, coordinator, login, drawer, placeholder, 403).

## 7. Stop condition

Phase 4A is complete at the shell level. Module functionality is intentionally not implemented;
Phase 4B should not be started without explicit instruction. No backend, RBAC, R2, cleanup,
bindings, secrets, or public pages were modified.
