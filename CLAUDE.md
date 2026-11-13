# Ufuq — notes for Claude

Arabic-learning platform (teacher: Ustaz Ali Hifniy). React 18 + Vite SPA, Supabase (Postgres + Auth + Edge Functions, project `ldbthwpikixtykwmvudy`), Cloudflare Workers for media/audio, Paymob for card payments. Roles: student (`/dashboard`), teacher (`/teacher`), admin (`/admin`). UI languages: uz, ru, ar, en.

## Commands
- `npm install` · `npm run dev` (5173) · `npm run build` · `npm test` (plain Node tests in `test/`, no framework) · `npm run lint` (ESLint; must stay at 0 errors, warnings are tolerated)
- `npm run test:sql` — level-system SQL test on a throw-away local Postgres (`test/sql/`, needs `initdb`; skips when Postgres is not installed). Run it after touching any level / group function.
- CI: `.github/workflows/ci.yml` runs lint + test + build on every push / PR. Deploys are done by Vercel's GitHub integration (production branch `main`).

## Layout
- `src/App.jsx` routes; all pages except Landing are `React.lazy` (keep new pages lazy).
- `src/pages/{Dashboard,Teacher,Admin,Profile,Checkout,Landing,Legal}`, `src/lib` (supabase client, scoring, levels, payments…), `src/i18n` (several translation files; strings are keyed per area).
- `supabase/migrations/*.sql` — applied to the live project by hand in the SQL editor; `DEPLOY.md` lists which are applied. Never assume a migration is live.
- `supabase/functions/*` — Deno Edge Functions. Browser-facing ones use `_shared/cors.ts` (origin allow-list; add domains via the `SITE_URL` / `ALLOWED_ORIGINS` secrets, not by editing code). `paymob-webhook` must stay `--no-verify-jwt` (it checks the Paymob HMAC instead).
- `workers/` Cloudflare Workers; `public/zoom-meeting.html` is a standalone page that loads the Zoom SDK from Zoom's CDN (no npm Zoom package).

## Edge Function deploys
- `.github/workflows/deploy-functions.yml` deploys changed functions to Supabase on every push to `main` that touches `supabase/functions/**` (needs the `SUPABASE_ACCESS_TOKEN` repository secret). `supabase/config.toml` holds the per-function `verify_jwt` setting.
- It stays inactive until `supabase/functions/.synced` exists. That file comes from `sync-functions.yml` (manual run), which pulls the LIVE functions into branch `sync/live-functions`. Always start from the live code: the repo copies were older than production once already.
- Never deploy a function from a copy you have not compared with the live one (`get_edge_function` / `supabase functions download`).

## Rules of thumb
- Prices, access and grading are decided on the server (RPCs / Edge Functions); the browser is never trusted.
- Payment enforcement at RLS level is intentionally NOT done yet (`payments_enforced = false`); leave it unless asked.
- CSP is in report-only mode in `vercel.json` until verified on the live site.
- Level system: 14 levels, exams 150 points (midterm 50 + final 100), pass mark 75; groups are letter + level (e.g. `Group A7`).
- Level groups (rules in the header of `supabase/migrations/20261201_level_groups_lifecycle.sql`): students move one by one; only RUNNING groups (`is_active`) are ever a target; a group closes itself when its last real student leaves and its letter runs elsewhere (`moved_on_at`) or on the final-exam deadline (`deadline_closed_at`). Every page except Admin > Groups lists running groups only. `profiles.level_free` = test account: never moved, never counted.

## Ufuq app (PWA, `/app`)
- Installable mobile app, same codebase: `src/app/*`, route `/app/*` (lazy `AppRoot`), manifest `public/app.webmanifest` (scope `/app`, icons in `public/app/`), linked from `index.html` so the website's "Install the app" buttons (`components/InstallAppButton.jsx`, `lib/pwaInstall.js`) can trigger installation.
- Flow: onboarding (language, goal, level, daily goal; kept in `localStorage ufuq-app-prefs`, copied to `user_metadata.app_onboarding` on sign-up) -> native sign-up/sign-in -> bottom-tab student app. Auto-login = Supabase persisted session (`persistSession`), checked in `AppRoot`.
- Home/Learn/AI/Me screens are native (`src/app/*Screen.jsx`); Group, Tasks, Exams, Library, Progress, Billing, Profile, Settings reuse the cabinet views through `ViewHost` (the cabinet dictionary is shared via `pages/Dashboard/cabinetDict.js`).
- Google/Apple sign-in redirects to `https://ufuqtaleem.com/app` — it must be in Supabase Auth Redirect URLs.
