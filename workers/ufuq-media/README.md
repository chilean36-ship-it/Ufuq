# ufuq-media worker

1. `cd workers/ufuq-media`
2. Edit `ALLOWED_ORIGINS` in `wrangler.toml` → your real site origin(s), e.g. `https://ufuq.uz,http://localhost:5173`
3. `npx wrangler secret put SIGNING_SECRET` → paste a long random string (`openssl rand -base64 48`)
4. `npx wrangler deploy`
5. Keep the bucket PRIVATE: do not enable r2.dev / a public custom domain on `ufuq-media`. Playback only happens through the worker's signed links.
6. Optional: in the Cloudflare dashboard add an R2 lifecycle rule "abort incomplete multipart uploads after 1 day".
