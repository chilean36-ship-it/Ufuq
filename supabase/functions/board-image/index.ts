// board-image — Google Drive'dagi doska rasmini server tarafida olib, <img>
// ochaoladigan oddiy rasm javobi sifatida uzatadi. Drive'ning o'zi
// (uc?export=view / /file/d/.../view) havolalari <img> ichida ishlamaydi.
// URL: /functions/v1/board-image?id=<board_photos.id>
// Drive fayl ID'si board_photos.source_url dan olinadi (clientga berilmaydi).

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "range",
};

function fail(message: string, status: number) {
  return new Response(message, { status, headers: corsHeaders });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractDriveFileId(raw: string): string | null {
  const s = String(raw || "");
  let m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function isImage(res: Response): boolean {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return res.ok && ct.startsWith("image/");
}

async function fetchDriveImage(fileId: string): Promise<Response | null> {
  const candidates = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=view&authuser=0`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`,
    `https://drive.google.com/uc?export=view&id=${fileId}`,
    `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`,
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (isImage(r)) return r;
      await r.body?.cancel();
    } catch {
      // keyingisini sinab ko'ramiz
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "HEAD") return fail("Method not allowed", 405);

  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!UUID_RE.test(id)) return fail("Bad request", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: photo } = await supabase
      .from("board_photos").select("source_url").eq("id", id).maybeSingle();
    if (!photo?.source_url) return fail("Not found", 404);

    const fileId = extractDriveFileId(photo.source_url);
    if (!fileId) return fail("Not found", 404);

    const img = await fetchDriveImage(fileId);
    if (!img) {
      console.error("board-image: Drive did not return an image for", fileId,
        "(fayl 'Havolaga ega har kim' deb ulashilganmi?)");
      return fail("Image not available", 502);
    }

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", img.headers.get("content-type") || "image/jpeg");
    headers.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
    const cl = img.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    return new Response(req.method === "HEAD" ? null : img.body, { status: 200, headers });
  } catch (err) {
    console.error("board-image unexpected error:", err);
    return fail("Internal server error", 500);
  }
});
