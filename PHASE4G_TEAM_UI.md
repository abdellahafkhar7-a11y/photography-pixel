# Phase 4G — Team UI

Status: **Complete — awaiting approval. Not committed, not pushed.**

This phase turns `/admin/team` into a real, owner-only team management module:
view members, create coordinator accounts, activate/deactivate, and change
roles. Account creation uses the existing Supabase Auth admin API, so no
password is ever stored or logged by this application. RBAC stays server-side
as-is (owner-only, `requireOwner`).

---

## 1. Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `functions/admin/_lib/team-data.ts` | **new** | `listTeamMembers`, `listRoles`, `setUserActive`, `setUserRole`, `createTeamMember` (via `auth.admin.createUser` + profile update). |
| `functions/admin/_lib/team-views.ts` | **new** | `renderTeam(appUser, members, roles, options)` — stats, create form, members table with role select and activate/deactivate actions. |
| `functions/admin/team.ts` | modified | GET + POST: create / toggle / role actions, `sameOrigin` check, owner-only, UUID & email validation, self-modification guard. |
| `functions/admin/_lib/shell.ts` | modified | CSS: `.badge.ok`/`.badge.off`, `.tbl select`, `.inline-actions`, `.form-grid`. |
| `functions/admin/_lib/views.ts` | modified | Removed the old read-only `renderTeam` / `rolePill` usage (replaced by `team-views`). |

No migrations, no infra, no bindings, no public-site files, no RBAC changes.

---

## 2. Routes

| Route | Role | Content |
| --- | --- | --- |
| `/admin/team` (GET) | **owner only** | Stats (total / owners / coordinators / active), add-member form, members table (member, role, status, last login, actions). |
| `/admin/team` (POST) | **owner only** | `create` (Supabase Auth admin API), `toggle` (active on/off), `role` (owner/coordinator). All require `sameOrigin`. |

---

## 3. Security behaviour

- Route is owner-only: `requireOwner` returns HTTP 403 for coordinators
  independent of the UI (verified: coordinator gets "غير مصرح", nav 0).
- `sameOrigin` enforced on every POST.
- Passwords: sent once to Supabase `auth.admin.createUser`; never stored,
  logged, or returned. `email_confirm: true` is set so the account can sign in
  after creation.
- The owner cannot modify their own row (`حسابك الحالي`, backend guard returns
  400) — prevents self-lockout.
- Role changes only ever happen via the service role after `requireOwner`.

---

## 4. Verification

- `npm run typecheck` ✅
- `npm run lint` (`--max-warnings=0`) ✅
- `npm run build` ✅ (no prerender diffs)
- Runtime QA (headless Edge + CDP), full lifecycle:
  - Owner GET: nav 12, stats `2/1/1/2`, create form present, owner row marked
    as self.
  - Create coordinator → success + active badge; appears with toggle form.
  - Role change coordinator → owner → applied ("تم تحديث الدور").
  - Toggle off/on reflected in the status badge.
  - Login as the new coordinator: nav 8, **no** team nav item; direct
    `/admin/team` → **403**.
  - Deactivate the coordinator → login attempt blocked ("غير مفعّل").
  - Responsive at 1440/1280/1024/768/430/390/375 — **0 horizontal overflow**.
  - Result: **0 problems**. Test account removed afterwards (`app_users` back
    to baseline = 2).
- `git diff` reviewed: changes limited to the intended files.

---

## 5. Known limitations

- New members land active because the owner explicitly creates them (unlike
  self-signups, which land inactive per the `handle_new_user` trigger).
- No password-reset flow in the admin UI yet; that is Supabase account
  management, out of scope for this phase.
- Editing a member's name is not offered; accounts are identified by email.