// Zoom Meeting SDK signature (JWT) beruvchi Edge Function. (v2: to'lov tekshiruvi qo'shildi)
//
// Sirlar (Supabase -> Edge Functions -> Secrets):
//   ZOOM_SDK_KEY      = Meeting SDK ilovasining Client ID
//   ZOOM_SDK_SECRET   = Meeting SDK ilovasining Client Secret
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const sdkKey = Deno.env.get("ZOOM_SDK_KEY")?.trim().replace(/^['"]|['"]$/g, "");
    const sdkSecret = Deno.env.get("ZOOM_SDK_SECRET")?.trim().replace(/^['"]|['"]$/g, "");
    if (!sdkKey || !sdkSecret) {
      return json({ error: "Zoom sozlanmagan (ZOOM_SDK_KEY / ZOOM_SDK_SECRET)" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Kirish talab qilinadi" }, 401);

    // Foydalanuvchi nomidan ishlaydigan klient: RLS amal qiladi
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: "Kirish talab qilinadi" }, 401);

    // To'lov (obuna) tekshiruvi — server tomonda. payments_enforced o'chiq bo'lsa hamma uchun true.
    const { data: hasAccess } = await supabase.rpc("ufuq_has_access");
    if (hasAccess !== true) return json({ error: "PAYMENT_REQUIRED" }, 402);

    // O'quvchi qaysi guruhda? (client ham shu jadvaldan o'qiydi)
    const { data: membership } = await supabase
      .from("group_members")
      .select("group_code")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership?.group_code) return json({ error: "Siz hech qaysi guruhda emassiz" }, 403);

    const { data: group } = await supabase
      .from("groups")
      .select("name, zoom_link, is_active")
      .eq("code", membership.group_code)
      .eq("is_active", true)
      .maybeSingle();
    if (!group) return json({ error: "Guruh topilmadi" }, 404);
    if (!group.zoom_link) return json({ error: "Bu guruh uchun Zoom havolasi qo'yilmagan" }, 400);

    const parsed = parseZoomLink(group.zoom_link);
    if (!parsed) {
      return json({ error: "Zoom havolasidan meeting raqamini o'qib bo'lmadi (…/j/123456789 ko'rinishida bo'lishi kerak)" }, 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const userName = profile?.full_name || user.user_metadata?.full_name ||
      user.email?.split("@")[0] || "Student";

    // Meeting SDK JWT (5.x): appKey, mn, role, iat, exp, tokenExp. role 0 = ishtirokchi.
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 2;
    const signature = await new SignJWT({
      appKey: sdkKey,
      mn: parsed.meetingNumber,
      role: 0,
      tokenExp: exp,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now - 30) // soat farqiga qarshi zaxira
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode(sdkSecret));

    return json({
      signature,
      sdkKey,
      meetingNumber: parsed.meetingNumber,
      password: parsed.password,
      userName,
      groupName: group.name,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
