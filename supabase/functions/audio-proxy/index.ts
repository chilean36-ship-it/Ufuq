// audio-proxy — audio faylni server tarafida o'qib, client'ga oqim (stream)
// sifatida uzatadi. Manba ikki xil bo'lishi mumkin:
//   1) Cloudflare R2 public URL (https://....r2.dev/...) — hozirgi asosiy manba
//   2) Google Drive havolasi (eski darslar uchun)
// Kirish faqat audio-sign bergan, muddati o'tmagan, imzosi to'g'ri so'rov
// orqali. <audio> elementi Authorization header yubora olmagani uchun bu
// funksiya JWT emas, so'rov parametridagi imzo orqali tekshiradi
// (shuning uchun verify_jwt=false).

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

function fail(message: string, status: number) {
  return new Response(message, { status, headers: corsHeaders });
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Faqat Cloudflare R2 public domenlariga ruxsat beramiz (o'zboshimcha
// tashqi URL'larni proksi qilib yubormaslik uchun).
function isR2Url(raw: string): URL | null {
  try {
    const u = new URL(String(raw || ""));
    if (u.protocol !== "https:") return null;
    return u.hostname.endsWith(".r2.dev") ? u : null;
  } catch {
    return null;
  }
}

function extractDriveFileId(raw: string): string | null {
  const s = String(raw || "");
  let m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function guessAudioType(pathname: string): string {
  const p = pathname.toLowerCase();
  if (p.endsWith(".mp3")) return "audio/mpeg";
  if (p.endsWith(".wav")) return "audio/wav";
  if (p.endsWith(".ogg")) return "audio/ogg";
  if (p.endsWith(".aac")) return "audio/aac";
  if (p.endsWith(".webm")) return "audio/webm";
  return "audio/mp4"; // .m4a
}

// Google Drive katta fayllar uchun audio o'rniga HTML "virus scan" sahifasini
// qaytaradi. Shu sahifani aniqlab, yashirin forma maydonlari bilan qayta
// so'raymiz.
async function fetchDriveFile(fileId: string, range: string | undefined): Promise<Response> {
  const baseHeaders: Record<string, string> = {};
  if (range) baseHeaders["Range"] = range;

  const firstUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
  let res = await fetch(firstUrl, { headers: baseHeaders });
  let ct = res.headers.get("content-type") || "";

  if (res.ok && !ct.includes("text/html")) return res;

  if (ct.includes("text/html")) {
    const html = await res.text();
    const cookie = res.headers.get("set-cookie");
    const fields: Record<string, string> = {};
    const inputRe = /<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = inputRe.exec(html))) fields[m[1]] = m[2];

    if (fields.id) {
      const retryHeaders: Record<string, string> = { ...baseHeaders };
      if (cookie) retryHeaders["Cookie"] = cookie.split(";")[0];
      const retryUrl = `https://drive.usercontent.google.com/download?${new URLSearchParams(fields).toString()}`;
      const retry = await fetch(retryUrl, { headers: retryHeaders });
      const retryCt = retry.headers.get("content-type") || "";
      if (retry.ok && !retryCt.includes("text/html")) return retry;
    }
  }

  const fallbacks = [
    `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`,
    `https://docs.google.com/uc?export=download&confirm=t&id=${fileId}`,
  ];
  for (const url of fallbacks) {
    try {
      const r = await fetch(url, { headers: baseHeaders });
      const c = r.headers.get("content-type") || "";
      if (r.ok && !c.includes("text/html")) return r;
    } catch {
      // try next
    }
  }

  throw new Error("all-drive-fetch-attempts-failed");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    if (!id || !exp || !sig) return fail("Bad request", 400);

    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not available in this runtime");
      return fail("Server misconfigured", 500);
    }
    const expected = await hmac(secret, `${id}.${exp}`);
    if (expected !== sig) return fail("Forbidden", 403);
    if (Math.floor(Date.now() / 1000) > Number(exp)) {
      return fail("Link expired", 410);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: lesson } = await supabase
      .from("audio_lessons").select("drive_url").eq("id", id).maybeSingle();
    if (!lesson?.drive_url) return fail("Not found", 404);

    const range = req.headers.get("range") || undefined;
    let upstream: Response;
    let fallbackType = "audio/mp4";

    const r2 = isR2Url(lesson.drive_url);
    if (r2) {
      // Cloudflare R2 — to'g'ridan-to'g'ri oqim qilib uzatamiz.
      fallbackType = guessAudioType(r2.pathname);
      const h: Record<string, string> = {};
      if (range) h["Range"] = range;
      try {
        upstream = await fetch(r2.toString(), { headers: h });
      } catch (err) {
        console.error("R2 fetch failed for", r2.toString(), err);
        return fail("Could not fetch audio", 502);
      }
      if (!upstream.ok && upstream.status !== 206) {
        console.error("R2 returned", upstream.status, "for", r2.toString());
        return fail("Audio not available", upstream.status === 404 ? 404 : 502);
      }
    } else {
      const fileId = extractDriveFileId(lesson.drive_url);
      if (!fileId) return fail("Not found", 404);
      try {
        upstream = await fetchDriveFile(fileId, range);
      } catch (err) {
        console.error("Drive fetch failed for", fileId, err);
        return fail("Could not fetch audio", 502);
      }
    }

    const upstreamCt = upstream.headers.get("content-type") || "";
    const headers = new Headers(corsHeaders);
    headers.set(
      "Content-Type",
      (upstreamCt && upstreamCt !== "application/octet-stream") ? upstreamCt : fallbackType,
    );
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=3600");
    const cl = upstream.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    const cr = upstream.headers.get("content-range");
    if (cr) headers.set("Content-Range", cr);

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers,
    });
  } catch (err) {
    console.error("audio-proxy unexpected error:", err);
    return fail("Internal server error", 500);
  }
});
