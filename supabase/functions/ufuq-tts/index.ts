// Supabase Edge Function: ufuq-tts  (v5: server-side payment check)
// Turns one language chunk { text, lang, gender? } of a Ufuq AI answer into natural speech.
// Providers (whatever has a secret), tried in this order until one works:
//   1. Azure Neural   AZURE_TTS_KEY + AZURE_TTS_REGION  (uz, ru, en, ar)
//   2. Aisha          AISHA_API_KEY                      (uz, ru, en)
//   3. ElevenLabs     ELEVENLABS_API_KEY                 (ar, en, ru)
//   4. Gemini TTS     GEMINI_API_KEY (already used by ai-chat) - last resort for every language
// If none can speak the chunk the function answers 422 and the browser voice is used for that chunk.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const AZURE_KEY = Deno.env.get("AZURE_TTS_KEY");
const AZURE_REGION = Deno.env.get("AZURE_TTS_REGION");
const AISHA_KEY = Deno.env.get("AISHA_API_KEY");
const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const ELEVEN_VOICE = Deno.env.get("ELEVENLABS_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM";
// Optional: a dedicated Arabic (Fusha) voice from the ElevenLabs voice library.
const ELEVEN_VOICE_AR = Deno.env.get("ELEVENLABS_VOICE_ID_AR") ?? ELEVEN_VOICE;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_TTS_MODEL = Deno.env.get("GEMINI_TTS_MODEL") ?? "gemini-2.5-flash-preview-tts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const AISHA_HOST = "back.aisha.group";
const AISHA_LANGS = new Set(["uz", "ru", "en"]);
const ELEVEN_LANGS = new Set(["ar", "en", "ru"]);

const ALLOWED_ORIGINS = new Set([
  "https://ufuq-com.vercel.app",
  "https://ufuq-com.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);
function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://ufuq-com.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Azure voices: [female, male]. Default = female (warm, clear teacher voice).
const AZURE_VOICES: Record<string, [string, string]> = {
  uz: ["uz-UZ-MadinaNeural", "uz-UZ-SardorNeural"],
  ru: ["ru-RU-SvetlanaNeural", "ru-RU-DmitryNeural"],
  en: ["en-US-AvaMultilingualNeural", "en-US-AndrewMultilingualNeural"],
  ar: ["ar-SA-ZariyahNeural", "ar-SA-HamedNeural"],
};
// Arabic is spoken a bit slower: the audience are learners.
const AZURE_RATE: Record<string, string> = { uz: "0%", ru: "+4%", en: "+2%", ar: "-6%" };   // brisk but clear: live conversation
// Gemini voices: [female, male]
const GEMINI_VOICES: [string, string] = ["Sulafat", "Charon"];

const MAX_CHARS = 1000;
const RATE_LIMIT_MAX = 80;
const RATE_LIMIT_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
// At most this many characters are spoken per student per day (live voice turns are also limited in ai-chat); best effort per instance.
const DAILY_CHARS = 9000;
const dailyChars = new Map<string, { day: string; n: number }>();

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
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Safety net: markdown, URLs, emoji and stray symbols must never be read out loud. */
function sanitize(t: string) {
  return t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_~#>|\\^=<>{}\[\]]+/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type Result = { ok: true; body: BodyInit } | { ok: false; status: number; error: string };
const BUSY: Result = { ok: false, status: 502, error: "Ovoz xizmati vaqtincha ishlamayapti." };

async function azureSynth(text: string, lang: string, male: boolean): Promise<Result> {
  const voice = AZURE_VOICES[lang][male ? 1 : 0];
  // Short pauses after sentence ends make the speech sound natural; Arabic gets a longer pause.
  const pause = lang === "ar" ? "220ms" : "140ms";
  const body = escapeXml(text).replace(/([.!?؟…]+)\s+/g, `$1<break time="${pause}"/> `);
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="${voice}"><prosody rate="${AZURE_RATE[lang]}">${body}</prosody></voice></speak>`;
  const r = await fetch(`https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": AZURE_KEY!,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "ufuq-tts",
    },
    body: ssml,
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) { console.error("Azure TTS xatosi:", r.status, await r.text()); return BUSY; }
  return { ok: true, body: r.body! };
}

async function aishaSynth(text: string, lang: string): Promise<Result> {
  const form = new FormData();
  form.append("transcript", text);
  form.append("language", lang);
  if (lang === "uz") { form.append("model", "Gulnoza"); form.append("mood", "Neutral"); form.append("speed", "1.0"); }
  const r = await fetch(`https://${AISHA_HOST}/api/v1/tts/post/`, {
    method: "POST",
    headers: { "X-Api-Key": AISHA_KEY!, "Accept-Language": "uz" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 402) { console.error("Aisha balansi tugagan"); return BUSY; }
  if (r.status !== 201 && r.status !== 200) { console.error("Aisha TTS xatosi:", r.status, await r.text()); return BUSY; }
  const { audio_path } = await r.json();
  if (!audio_path) return BUSY;
  const url = new URL(String(audio_path), `https://${AISHA_HOST}`);
  if (url.hostname !== AISHA_HOST) return BUSY;
  const a = await fetch(url, { headers: { "X-Api-Key": AISHA_KEY! }, signal: AbortSignal.timeout(20_000) });
  if (!a.ok) { console.error("Aisha audio yuklanmadi:", a.status); return BUSY; }
  return { ok: true, body: a.body! };
}

async function elevenSynth(text: string, lang: string): Promise<Result> {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(lang === "ar" ? ELEVEN_VOICE_AR : ELEVEN_VOICE)}?output_format=mp3_44100_96`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY!, "Content-Type": "application/json", "Accept": "audio/mpeg" },
    body: JSON.stringify({ text, model_id: Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_flash_v2_5", voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) { console.error("ElevenLabs xatosi:", r.status, await r.text()); return BUSY; }
  return { ok: true, body: r.body! };
}

// Gemini returns raw 16-bit PCM @ 24 kHz mono; wrap it in a WAV header so the browser can play it.
function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0); out.set(pcm, 44);
  return out;
}

async function geminiSynth(text: string, lang: string, male: boolean): Promise<Result> {
  const style = lang === "ar"
    ? "Read this Arabic text aloud in clear Modern Standard Arabic (Fusha) with correct pronunciation and natural intonation, like a professional teacher on a call, at a steady, unhurried pace"
    : "Read this text aloud in a warm, clear, friendly teacher's voice at a calm pace";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${style}: ${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICES[male ? 1 : 0] } } },
      },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) { console.error("Gemini TTS xatosi:", r.status, await r.text()); return BUSY; }
  const data = await r.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) { console.error("Gemini TTS audio qaytarmadi"); return BUSY; }
  const bin = atob(b64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  return { ok: true, body: pcmToWav(pcm) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const azureOn = !!(AZURE_KEY && AZURE_REGION);
  if (!azureOn && !AISHA_KEY && !ELEVEN_KEY && !GEMINI_KEY) return json(req, { error: "TTS hali sozlanmagan." }, 503);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json(req, { error: "Tizimga kiring." }, 401);
    const userId = userData.user.id;

    const { data: hasAccess } = await supabase.rpc("ufuq_has_access");
    if (hasAccess !== true) return json(req, { error: "PAYMENT_REQUIRED" }, 402);

    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) return json(req, { error: "Juda tez, biroz kuting." }, 429);
    recent.push(now);
    hits.set(userId, recent);

    let payload: { text?: string; lang?: string; gender?: string };
    try { payload = await req.json(); } catch { return json(req, { error: "Noto'g'ri JSON" }, 400); }
    const text = sanitize(String(payload.text ?? "")).slice(0, MAX_CHARS);
    const lang = String(payload.lang ?? "uz");
    const male = payload.gender === "male";
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return json(req, { error: "Matn bo'sh" }, 400);
    {
      const day = new Date().toISOString().slice(0, 10);
      const cur = dailyChars.get(userId);
      const used = cur && cur.day === day ? cur.n : 0;
      if (used + text.length > DAILY_CHARS) return json(req, { error: "Bugungi ovoz limiti tugadi (brauzer ovozi ishlatiladi)." }, 422);   // 422 = the browser voice takes over
      dailyChars.set(userId, { day, n: used + text.length });
    }
    if (!AZURE_VOICES[lang]) return json(req, { error: "Til qo'llab-quvvatlanmaydi" }, 400);

    // Ordered attempts: a failing provider falls through to the next one.
    const attempts: (() => Promise<Result>)[] = [];
    if (azureOn) attempts.push(() => azureSynth(text, lang, male));
    if (AISHA_KEY && AISHA_LANGS.has(lang)) attempts.push(() => aishaSynth(text, lang));
    if (ELEVEN_KEY && ELEVEN_LANGS.has(lang)) attempts.push(() => elevenSynth(text, lang));
    if (GEMINI_KEY) attempts.push(() => geminiSynth(text, lang, male));
    if (!attempts.length) return json(req, { error: "Bu til uchun ovoz yo'q (brauzer ovoziga qaytiladi)." }, 422);

    let last: Result = BUSY;
    for (const run of attempts) {
      try { last = await run(); } catch (e) { console.error("TTS provayder xatosi:", e); last = BUSY; }
      if (last.ok) break;
    }
    if (!last.ok) return json(req, { error: last.error }, last.status);

    return new Response(last.body, {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", ...corsHeadersFor(req) },
    });
  } catch (err) {
    console.error("ufuq-tts xatosi:", err);
    return json(req, { error: "Ovoz xizmati vaqtincha ishlamayapti." }, 502);
  }
});
