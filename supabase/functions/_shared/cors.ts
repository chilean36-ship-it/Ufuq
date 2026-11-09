// Shared CORS for every browser-facing Edge Function (one allow-list instead of "*" or six copies).
//
// Origins allowed = the built-in list below + SITE_URL + the comma-separated ALLOWED_ORIGINS secret
// (supabase secrets set ALLOWED_ORIGINS="https://ufuq.example,https://www.ufuq.example").
// Any other Origin gets the primary site origin back, so the browser blocks the response.
// CORS is not the only gate: every function still verifies the caller's JWT.

const DEFAULT_ORIGINS = [
  "https://ufuqtaleem.com",
  "https://www.ufuqtaleem.com",
  "https://ufuq-com.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

const clean = (s: string) => s.trim().replace(/\/+$/, "");

function allowList(): Set<string> {
  const set = new Set(DEFAULT_ORIGINS);
  const site = clean(Deno.env.get("SITE_URL") || "");
  if (site) set.add(site);
  for (const o of (Deno.env.get("ALLOWED_ORIGINS") || "").split(",")) if (clean(o)) set.add(clean(o));
  return set;
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowList();
  const primary = clean(Deno.env.get("SITE_URL") || "") || DEFAULT_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : primary,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** Wraps a handler: answers OPTIONS preflight and adds the CORS headers to every response (including errors). */
export function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeadersFor(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    const res = await handler(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
