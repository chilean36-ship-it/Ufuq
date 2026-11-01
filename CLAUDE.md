# Ufuq — notes for Claude

Arabic-learning platform (teacher: Ustaz Ali Hifniy). React 18 + Vite SPA, Supabase (Postgres + Auth + Edge Functions, project `ldbthwpikixtykwmvudy`), Cloudflare Workers for media/audio, Paymob for card payments. Roles: student (`/dashboard`), teacher (`/teacher`), admin (`/admin`). UI languages: uz, ru, ar, en.

## Commands
- `npm install` · `npm run dev` (5173) · `npm run build` · `npm test` (plain Node tests in `test/`, no framework) · `npm run lint` (ESLint; must stay at 0 errors, warnings are tolerated)
- CI: `.github/workflows/ci.yml` runs lint + test + build on every push / PR. Deploys are done by Vercel's GitHub integration (production branch `main`).

## Layout
- `src/App.jsx` routes; all pages except Landing are `React.lazy` (keep new pages lazy).
- `src/pages/{Dashboard,Teacher,Admin,Profile,Checkout,Landing,Legal}`, `src/lib` (supabase client, scoring, levels, payments…), `src/i18n` (several translation files; strings are keyed per area).
- `supabase/migrations/*.sql` — applied to the live project by hand in the SQL editor; `DEPLOY.md` lists which are applied. Never assume a migration is live.
- `supabase/functions/*` — Deno Edge Functions. Browser-facing ones use `_shared/cors.ts` (origin allow-list; add domains via the `SITE_URL` / `ALLOWED_ORIGINS` secrets, not by editing code). `paymob-webhook` must stay `--no-verify-jwt` (it checks the Paymob HMAC instead).
- `workers/` Cloudflare Workers; `public/zoom-meeting.html` is a standalone page that loads the Zoom SDK from Zoom's CDN (no npm Zoom package).

## Rules of thumb
- Prices, access and grading are decided on the server (RPCs / Edge Functions); the browser is never trusted.
- Payment enforcement at RLS level is intentionally NOT done yet (`payments_enforced = false`); leave it unless asked.
- CSP is in report-only mode in `vercel.json` until verified on the live site.
- Level system: 14 levels, exams 150 points (midterm 50 + final 100), pass mark 75; groups are letter + level (e.g. `Group A7`).
