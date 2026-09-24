# Photography Pixel — Supabase + Admin Setup

One-time setup for Phase 1 (real auth for `/admin`).

## 1. Create the Supabase project

1. At https://supabase.com/dashboard → **New project**.
2. Region close to your site's visitors. Save the **database password**.
3. Copy the project URL (Settings → API → Project URL) and note the **project ref** (the `abcdefgh` part of the URL).

## 2. Link the CLI and apply migrations

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:migrate
```

`npm run db:migrate` runs `supabase db push`, which applies

- `supabase/migrations/20260924000001_create_roles_app_users.sql`

It creates `roles` (owner/coordinator), `app_users` profiles, a trigger that auto-creates an inactive *coordinator* profile for every new sign-up, RLS, and locks down writes to the service role only.

## 3. Get the keys

Settings → API:

- `SUPABASE_URL` — project URL
- `SUPABASE_ANON_KEY` — public anon key (safe to expose)
- `SUPABASE_SERVICE_ROLE_KEY` — secret, server-only, never in the browser

## 4. Configure secrets

**Local dev** — create `.dev.vars` in the repo root (copy from `.env.example`):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Production** — Cloudflare Pages → your project → Settings → Environment variables → add the same three variables. Keep them **encrypted/secret** (not plaintext) and do **not** expose them to the frontend.

## 5. Create the owner account

Create `.env` in the repo root (git-ignored):

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
INITIAL_OWNER_EMAIL=you@example.com
INITIAL_OWNER_PASSWORD=<strong-password>
```

Then run:

```powershell
npm run owner:create
```

This creates the auth user, confirms the email, and sets their profile to **owner + active** (the app_users trigger defaults new users to inactive coordinator; the script overrides for the initial owner). Only run it once — on re-runs it re-activates/resets the existing account instead of creating a duplicate.

## 6. Add team members (coordinators)

In Supabase Dashboard → Authentication → Users → **Add user** with an email. New users arrive as **inactive coordinators** — to let them in, set their profile to active in the `app_users` table (Database → Table Editor). They can then log in at `/admin/login` and reach `/admin`, but only the **owner** can open `/admin/team`.

## 7. About `gen auth_links`

The original plan referenced a `gen auth_links` type command. Supabase CLI v2.x (stable) does **not** ship such a subcommand, so the secure equivalent is the `npm run owner:create` bootstrap script (step 5) plus Dashboard user management (step 6). Both avoid ever touching the service-role key in browser code.

## Local smoke test

```powershell
npm run dev
```

- `/admin` → redirects to `/admin/login`
- `/admin/login` → shows the login form once secrets are set
- Wrong/missing secrets → the "Setup required" message (fail-closed, never an untrusted page)

## Quality gates

```powershell
npm run typecheck   # tsc --noEmit (zero errors)
npm run lint        # eslint --max-warnings=0 (zero warnings)
npm run build       # public site prerender still passes
```