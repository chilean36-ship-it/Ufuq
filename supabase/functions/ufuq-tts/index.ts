// Supabase Edge Function: ufuq-tts
// Ufuq AI javobini chiroyli ovozga aylantiradi. Bitta so'rov = bitta til bo'lagi { text, lang }.
// Provayder secret'larga qarab tanlanadi:
//   - AZURE_TTS_KEY + AZURE_TTS_REGION  -> Azure Neural (uz, ru, en, ar)
//   - AISHA_API_KEY                     -> Aisha (uz, ru, en; arabcha YO'Q)
//   - ELEVENLABS_API_KEY                -> ElevenLabs (ar, en, ru; o'zbekcha YO'Q)
// Tartib: Azure > Aisha > ElevenLabs (til qo'llab-quvvatlansa). Hech biri to'g'ri kelmasa 422 qaytadi,
// frontend shu bo'lakni brauzer ovozida o'qiydi.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const AZURE_KEY = Deno.env.get("AZURE_TTS_KEY");
const AZURE_REGION = Deno.env.get("AZURE_TTS_REGION");
const AISHA_KEY = Deno.env.get("AISHA_API_KEY");
const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY");
// Standart (premade) ovoz; boshqa ovoz uchun ELEVENLABS_VOICE_ID secret'ini qo'ying.
const ELEVEN_VOICE = Deno.env.get("ELEVENLABS_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM";
const ELEVEN_LANGS = new Set(["ar", "en", "ru"]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const AISHA_HOST = "back.aisha.group";
const AISHA_LANGS = new Set(["uz", "ru", "en"]);

import { corsHeadersFor } from "../_shared/cors.ts";

// Azure: hammasi ayol ovozi.
const AZURE_VOICES: Record<string, string> = {
  uz: "uz-UZ-MadinaNeural", // erkak ovoz: uz-UZ-SardorNeural
  ru: "ru-RU-SvetlanaNeural",
  en: "en-US-JennyNeural",
  ar: "ar-SA-ZariyahNeural",
};
const AZURE_RATE: Record<string, string> = { uz: "-3%", ru: "0%", en: "0%", ar: "-10%" };

const MAX_CHARS = 1000; // Aisha API kaliti bilan ham 1000 belgi
const RATE_LIMIT_MAX = 60; // bir foydalanuvchiga daqiqada (bir javob bir necha bo'lak bo'lishi mumkin)
const RATE_LIMIT_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeadersFor(req) },
  });
}

function escapeXml(s: string) {
  return s
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type Result = { ok: true; body: BodyInit } | { ok: false; status: number; error: string };

async function azureSynth(text: string, lang: string): Promise<Result> {
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="${AZURE_VOICES[lang]}"><prosody rate="${AZURE_RATE[lang]}">${escapeXml(text)}</prosody></voice></speak>`;
  const r = await fetch(`https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": AZURE_KEY!,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "ufuq-tts",
    },
    body: ssml,
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) {
    console.error("Azure TTS xatosi:", r.status, await r.text());
    return { ok: false, status: 502, error: "Ovoz xizmati vaqtincha ishlamayapti." };
  }
  return { ok: true, body: r.body! };
}

async function aishaSynth(text: string, lang: string): Promise<Result> {
  const form = new FormData();
  form.append("transcript", text);
  form.append("language", lang);
  if (lang === "uz") {
    form.append("model", "Gulnoza");
    form.append("mood", "Neutral");
    form.append("speed", "1.0");
  }
  const r = await fetch(`https://${AISHA_HOST}/api/v1/tts/post/`, {
    method: "POST",
    headers: { "X-Api-Key": AISHA_KEY!, "Accept-Language": "uz" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 402) {
    console.error("Aisha balansi tugagan");
    return { ok: false, status: 503, error: "Ovoz xizmati vaqtincha ishlamayapti." };
  }
  if (r.status !== 201 && r.status !== 200) {
    console.error("Aisha TTS xatosi:", r.status, await r.text());
    return { ok: false, status: 502, error: "Ovoz xizmati vaqtincha ishlamayapti." };
  }
  const { audio_path } = await r.json();
  if (!audio_path) return { ok: false, status: 502, error: "Ovoz xizmati vaqtincha ishlamayapti." };

  const url = new URL(String(audio_path), `https://${AISHA_HOST}`);
  if (url.hostname !== AISHA_HOST) return { ok: false, status: 502, error: "Ovoz xizmati vaqtincha ishlamayapti." };
  const a = await fetch(url, { headers: { "X-Api-Key": AISHA_KEY! }, signal: AbortSignal.timeout(20_000) });
  if (!a.ok) {
    console.error("Aisha audio yuklanmadi:", a.status);
    return { ok: false, status: 502, error: "Ovoz xizmati vaqtincha ishlamayapti." };
  }
  return { ok: true, body: a.body! };
}

async function elevenSynth(text: string): Promise<Result> {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE)}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY!, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!r.ok) {
    console.error("ElevenLabs xatosi:", r.status, await r.text());
    // 401/402/429: kalit yoki limit muammosi — foydalanuvchiga baribir "vaqtincha" deymiz.
    return { ok: false, status: [401, 402, 429].includes(r.status) ? 503 : 502, error: "Ovoz xizmati vaqtincha ishlamayapti." };
  }
  return { ok: true, body: r.body! };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const azureOn = !!(AZURE_KEY && AZURE_REGION);
  if (!azureOn && !AISHA_KEY && !ELEVEN_KEY) {
    console.error("TTS secret'lari sozlanmagan (AZURE_TTS_KEY+AZURE_TTS_REGION, AISHA_API_KEY yoki ELEVENLABS_API_KEY)");
    return json(req, { error: "TTS hali sozlanmagan." }, 503);
  }

  try {
    // Faqat tizimga kirgan foydalanuvchi (anon kalit yetarli emas — TTS puli ketadi).
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json(req, { error: "Tizimga kiring." }, 401);
    const userId = userData.user.id;

    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) return json(req, { error: "Juda tez, biroz kuting." }, 429);
    recent.push(now);
    hits.set(userId, recent);

    let payload: { text?: string; lang?: string };
    try {
      payload = await req.json();
    } catch {
      return json(req, { error: "Noto'g'ri JSON" }, 400);
    }
    const text = String(payload.text ?? "").trim().slice(0, MAX_CHARS);
    const lang = String(payload.lang ?? "uz");
    if (!text) return json(req, { error: "Matn bo'sh" }, 400);
    if (!AZURE_VOICES[lang]) return json(req, { error: "Til qo'llab-quvvatlanmaydi" }, 400);

    let result: Result;
    if (azureOn) result = await azureSynth(text, lang);
    else if (AISHA_KEY && AISHA_LANGS.has(lang)) result = await aishaSynth(text, lang);
    else if (ELEVEN_KEY && ELEVEN_LANGS.has(lang)) result = await elevenSynth(text);
    else return json(req, { error: "Bu til uchun ovoz yo'q (brauzer ovoziga qaytiladi)." }, 422);

    if (!result.ok) return json(req, { error: result.error }, result.status);

    // supabase-js `functions.invoke` octet-stream'ni Blob sifatida qaytaradi.
    return new Response(result.body, {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", ...corsHeadersFor(req) },
    });
  } catch (err) {
    console.error("ufuq-tts xatosi:", err);
    return json(req, { error: "Ovoz xizmati vaqtincha ishlamayapti." }, 502);
  }
});
