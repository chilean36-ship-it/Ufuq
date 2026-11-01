// r2-presign — Cloudflare R2 uchun presigned URL beruvchi edge function. (v2: hardened)
// Amallar: "upload" (yozish uchun PUT URL), "download" (o'qish uchun GET URL),
// "delete" (R2'dan faylni o'chirish — xabar o'chirilganda yoki upload/insert
// muvaffaqiyatsiz tugaganda ishlatiladi).
// v2: kalit prefiksi qat'iy tekshiriladi (voice|media/<guruh>/...), faqat o'z faylini (yoki o'qituvchi) o'chira oladi,
//     xavfli fayl turlari (html/svg/xml/js) bloklanadi.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

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

function safeName(name: string): string {
  return (name || "file")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-80);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { action, groupCode } = body ?? {};
    if (!action || !groupCode) {
      return json({ error: "action va groupCode majburiy" }, 400);
    }
    if (typeof groupCode !== "string" || !/^[0-9]{5}$/.test(groupCode)) {
      return json({ error: "groupCode noto'g'ri" }, 400);
    }

    const [{ data: member }, { data: teacher }] = await Promise.all([
      supabase.from("group_members").select("id").eq("group_code", groupCode).eq(
        "user_id",
        userId,
      ).maybeSingle(),
      supabase.from("teacher_groups").select("teacher_id").eq(
        "group_code",
        groupCode,
      ).eq("teacher_id", userId).maybeSingle(),
    ]);
    if (!member && !teacher) {
      return json({ error: "Bu guruhga a'zo emassiz" }, 403);
    }

    // These four must all be set as project secrets — if even one is
    // missing, AwsClient still "signs" the request with an undefined/empty
    // value instead of throwing, which produces a URL that LOOKS valid but
    // R2 rejects with a signature mismatch. That silent failure is exactly
    // what made uploads (voice notes, photos, files) quietly disappear from
    // the chat instead of showing a real error, so we check explicitly here.
    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucket = Deno.env.get("R2_BUCKET_NAME");
    const missing = [
      !accountId && "R2_ACCOUNT_ID",
      !accessKeyId && "R2_ACCESS_KEY_ID",
      !secretAccessKey && "R2_SECRET_ACCESS_KEY",
      !bucket && "R2_BUCKET_NAME",
    ].filter(Boolean);
    if (missing.length) {
      console.error("r2-presign: missing secrets:", missing.join(", "));
      return json({ error: `Server misconfigured (missing: ${missing.join(", ")})` }, 500);
    }

    const client = new AwsClient({
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      service: "s3",
      region: "auto",
    });

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

    // A key is only valid when it lives under voice/<group>/ or media/<group>/ of THIS group (no path tricks).
    const keyInGroup = (k: unknown): k is string =>
      typeof k === "string" && k.length <= 400 && !k.includes("..") &&
      (k.startsWith(`voice/${groupCode}/`) || k.startsWith(`media/${groupCode}/`));

    if (action === "upload") {
      const { filename, contentType, kind } = body; // kind: 'voice' | 'media'
      if (!filename || !kind) {
        return json({ error: "filename va kind majburiy" }, 400);
      }
      if (kind !== "voice" && kind !== "media") return json({ error: "kind noto'g'ri" }, 400);
      if (typeof filename !== "string" || filename.length > 200) return json({ error: "filename noto'g'ri" }, 400);
      if (contentType && (typeof contentType !== "string" || contentType.length > 100 || /(html|svg|xml|javascript|ecmascript|x-msdownload|x-sh)/i.test(contentType))) {
        return json({ error: "Fayl turi ruxsat etilmagan" }, 415);
      }
      const key = `${kind}/${groupCode}/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${
        safeName(filename)
      }`;
      const urlToSign = `${endpoint}/${bucket}/${key}`;
      const signed = await client.sign(urlToSign, {
        method: "PUT",
        headers: contentType ? { "Content-Type": contentType } : {},
        aws: { signQuery: true },
      });
      return json({ uploadUrl: signed.url, key });
    }

    if (action === "download") {
      const { key } = body;
      if (!key) return json({ error: "key majburiy" }, 400);
      if (!keyInGroup(key)) {
        return json({ error: "Forbidden" }, 403);
      }
      const urlToSign = `${endpoint}/${bucket}/${key}`;
      const signed = await client.sign(urlToSign, {
        method: "GET",
        aws: { signQuery: true },
      });
      return json({ url: signed.url });
    }

    if (action === "delete") {
      const { key } = body;
      if (!key) return json({ error: "key majburiy" }, 400);
      if (!keyInGroup(key)) {
        return json({ error: "Forbidden" }, 403);
      }
      // members may delete only their own files; the group's teacher / an admin may delete any
      const own = key.startsWith(`voice/${groupCode}/${userId}/`) || key.startsWith(`media/${groupCode}/${userId}/`);
      if (!own && !teacher) {
        return json({ error: "Forbidden" }, 403);
      }
      const urlToSign = `${endpoint}/${bucket}/${key}`;
      const signed = await client.sign(urlToSign, { method: "DELETE" });
      const res = await fetch(signed);
      if (!res.ok && res.status !== 404) {
        return json({ error: `R2 delete failed: ${res.status}` }, 502);
      }
      return json({ ok: true });
    }

    return json({ error: "Noma'lum action" }, 400);
  } catch (err) {
    console.error("r2-presign unexpected error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
