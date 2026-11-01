# Ufuq (React)

```bash
npm install
cp .env.example .env     # optional — the same public Supabase values are the built-in fallback
npm run dev              # http://localhost:5173
npm run build            # production build -> dist/
```

Deploy on Vercel as a Vite project (`vercel.json` already rewrites every path to `index.html`, so `/dashboard`, `/admin`… work on refresh).

Tests: `npm test` (plain Node, no extra dependencies). Deploy steps and the list of applied database migrations: `DEPLOY.md`. Payments: `PAYMENTS-HANDOFF.md`.

Layout: `src/` (React app; pages are code-split per route in `App.jsx`), `supabase/` (migrations + Edge Functions; shared code in `functions/_shared/`), `workers/` (Cloudflare Workers), `asr-space/` (optional Qur'an ASR service).


## Profile cover (v5)
`src/pages/Profile/ProfileCover.jsx` + `profile-cover.css`: Arabic «harf maydoni» cover — floating letters (canvas), pointer repel/threads, click burst, rotating calligraphic word (أفق · علم · نور · قرآن · حكمة · هدى), corner ornaments and arch row. Colours come from site tokens (`--gold`, `--gold-bright`, `--bg`, `--bg-2`) so dark/light themes match; respects `prefers-reduced-motion`; pauses when off-screen or tab hidden.


## Sidebar active item (unified)
`src/styles/sidebar-active.css` is the single source of truth for the active menu item (gold fade + 2px edge bar, hover nudge, sub-link tint). Any sidebar opts in with class `usb` — used by Admin/Teacher (`PanelSidebar`), Student (`Dashboard/Sidebar`, `Profile/Sidebar`). Tune via `--usb-*` tokens.
