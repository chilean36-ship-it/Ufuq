// audio-sign — audio darsni Google Drive'dan olib berishdan oldin, bir martalik
// (vaqtinchalik) imzolangan proxy-URL beradi. Client hech qachon Drive
// URL/fayl ID'sini ko'rmaydi — faqat shu funksiya qaytargan, o'zimizning
// domenimizdagi (Supabase) URL'ni ko'radi.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { audioId } = body ?? {};
    if (!audioId) return json({ error: "audioId majburiy" }, 400);

    // RLS (audio_lessons_select_authenticated) hozircha har qanday tizimga
    // kirgan foydalanuvchiga o'qishga ruxsat beradi — shuning uchun bu yerda
    // faqat qatorning mavjudligini tekshiramiz, guruhga qo'shimcha filtr
    // qo'ymaymiz (RLS bilan bir xil darajada ochiq).
    const { data: lesson, error: lessonErr } = await supabase
      .from("audio_lessons").select("id").eq("id", audioId).maybeSingle();
    if (lessonErr || !lesson) return json({ error: "Topilmadi" }, 404);

    // Maxsus sozlash talab qilmaydigan, Supabase har bir edge function uchun
    // avtomatik beradigan maxfiy kalitdan foydalanamiz (service role key —
    // hech qachon clientga chiqmaydi, faqat server tarafida ishlatiladi).
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not available in this runtime");
      return json({ error: "Server misconfigured" }, 500);
    }
    const exp = Math.floor(Date.now() / 1000) + 7200; // 2 soat amal qiladi
    const sig = await hmac(secret, `${audioId}.${exp}`);
    const base = Deno.env.get("SUPABASE_URL")!;
    const url = `${base}/functions/v1/audio-proxy?id=${encodeURIComponent(audioId)}&exp=${exp}&sig=${sig}`;
    return json({ url });
  } catch (err) {
    console.error("audio-sign unexpected error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
