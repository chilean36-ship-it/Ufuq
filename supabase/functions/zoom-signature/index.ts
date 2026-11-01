// Zoom Meeting SDK signature (JWT) beruvchi Edge Function.
//
// Oqim: o'quvchi "Join Class" bosadi -> brauzer shu funksiyani chaqiradi ->
// funksiya (1) foydalanuvchini tekshiradi, (2) o'quvchi a'zo bo'lgan guruhni topadi,
// (3) shu guruhning `zoom_link` manzilidan meeting raqami va parolini ajratadi,
// (4) SDK Secret bilan imzolangan qisqa muddatli JWT qaytaradi.
// SDK Secret hech qachon brauzerga tushmaydi.
//
// Sirlar (Supabase -> Edge Functions -> Secrets):
//   ZOOM_SDK_KEY      = Meeting SDK ilovasining Client ID
//   ZOOM_SDK_SECRET   = Meeting SDK ilovasining Client Secret
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

// Shared origin allow-list (_shared/cors.ts). The Authorization check below still decides who gets a signature.
import { corsHeadersFor as corsFor } from "../_shared/cors.ts";

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** https://us02web.zoom.us/j/81234567890?pwd=abc  ->  { meetingNumber, password } */
function parseZoomLink(link: string) {
  try {
    const u = new URL(link.trim());
    if (!/(^|\.)zoom\.(us|com)$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\d{9,11}/);
    if (!m) return null; // masalan zoom.us/my/ism — shaxsiy havola, raqami yo'q
    return { meetingNumber: m[0], password: u.searchParams.get("pwd") ?? "" };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });

  try {
    const sdkKey = Deno.env.get("ZOOM_SDK_KEY");
    const sdkSecret = Deno.env.get("ZOOM_SDK_SECRET");
    if (!sdkKey || !sdkSecret) {
      return json(req, { error: "Zoom sozlanmagan (ZOOM_SDK_KEY / ZOOM_SDK_SECRET)" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(req, { error: "Kirish talab qilinadi" }, 401);

    // Foydalanuvchi nomidan ishlaydigan klient: RLS amal qiladi
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json(req, { error: "Kirish talab qilinadi" }, 401);

    // O'quvchi qaysi guruhda? (client ham shu jadvaldan o'qiydi)
    const { data: membership } = await supabase
      .from("group_members")
      .select("group_code")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership?.group_code) return json(req, { error: "Siz hech qaysi guruhda emassiz" }, 403);

    const { data: group } = await supabase
      .from("groups")
      .select("name, zoom_link, is_active")
      .eq("code", membership.group_code)
      .eq("is_active", true)
      .maybeSingle();
    if (!group) return json(req, { error: "Guruh topilmadi" }, 404);
    if (!group.zoom_link) return json(req, { error: "Bu guruh uchun Zoom havolasi qo'yilmagan" }, 400);

    const parsed = parseZoomLink(group.zoom_link);
    if (!parsed) {
      return json(req, { error: "Zoom havolasidan meeting raqamini o'qib bo'lmadi (…/j/123456789 ko'rinishida bo'lishi kerak)" }, 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const userName = profile?.full_name || user.user_metadata?.full_name ||
      user.email?.split("@")[0] || "Student";

    // Meeting SDK JWT. 5.0 dan beri `appKey` majburiy; role 0 = ishtirokchi.
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 2;
    const signature = await new SignJWT({
      appKey: sdkKey,
      sdkKey,
      mn: parsed.meetingNumber,
      role: 0,
      tokenExp: exp,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now - 30) // soat farqiga qarshi zaxira
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode(sdkSecret));

    return json(req, {
      signature,
      meetingNumber: parsed.meetingNumber,
      password: parsed.password,
      userName,
      groupName: group.name,
    });
  } catch (e) {
    console.error("zoom-signature failed:", e); // details stay in the server log, never in the response
    return json(req, { error: "Server error" }, 500);
  }
});
