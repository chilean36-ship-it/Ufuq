// Supabase Edge Function: ufuq-hifz-check
// Student sends { assignment_id, audio (base64 16 kHz mono WAV) }.
// 1) loads the expected words of the assigned ayahs, 2) speech -> Arabic text, 3) aligns word by word,
// 4) stores the attempt (service role, so scores cannot be forged) and returns the colour-coded result.
//
// Speech engines (tried in this order):
//   a) Quran-tuned Whisper service, only if the ASR_URL (+ ASR_TOKEN) secrets are set  (see asr-space/)
//   b) Gemini, using the same GEMINI_API_KEY secret as ai-chat / ufuq-stt
// Optional secrets: QURAN_BASE_URL (default: the site's /quran folder), HIFZ_GEMINI_MODEL.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { alignRecitation, splitWords, normalizeArabic } from "./hifz-align.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SITE = "https://ufuqtaleem.com";
const QURAN_BASE_URL = (Deno.env.get("QURAN_BASE_URL") ?? `${SITE}/quran`).replace(/\/$/, "");
const PRIMARY_MODEL = Deno.env.get("HIFZ_GEMINI_MODEL") ?? "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";

const ALLOWED_ORIGINS = new Set([
  "https://ufuqtaleem.com",
  "https://www.ufuqtaleem.com",
  "https://ufuq-com.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);
function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : SITE;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeadersFor(req) } });
}

const MAX_AUDIO_B64_CHARS = 5_000_000; // ~90 s of 16 kHz mono WAV
const MAX_PER_MINUTE = 6;              // protects the Gemini quota
const practiceHits = new Map<string, number[]>();   // self-practice checks (no assignment), best effort per instance
// deno-lint-ignore no-explicit-any
const quranCache = new Map<number, any>();

async function loadSurah(n: number) {
  if (quranCache.has(n)) return quranCache.get(n);
  const r = await fetch(`${QURAN_BASE_URL}/${n}.json`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`quran data ${n}: HTTP ${r.status}`);
  const data = await r.json();
  quranCache.set(n, data);
  return data;
}

async function asrQuranWhisper(audio: string): Promise<string> {
  const url = Deno.env.get("ASR_URL");
  if (!url) throw new Error("ASR_URL not set");
  const r = await fetch(`${url.replace(/\/$/, "")}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-asr-token": Deno.env.get("ASR_TOKEN") ?? "" },
    body: JSON.stringify({ audio }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`asr service HTTP ${r.status}`);
  return String((await r.json()).text ?? "");
}

const GEMINI_PROMPT =
  "This is a student reciting the Qur'an from memory. Transcribe EXACTLY the words that were actually recited, in Arabic script. " +
  "Do NOT correct mistakes. Do NOT complete the verse from memory. Do NOT add words that were not said. Do NOT skip words that were said, " +
  "and keep repeated words. Output ONLY the Arabic text: no quotes, no labels, no translation, no comments. " +
  "If there is no intelligible recitation (silence, noise, breathing), output exactly: [NO_SPEECH]";

async function geminiCall(model: string, audio: string, withThinking: boolean) {
  // deno-lint-ignore no-explicit-any
  const generationConfig: any = { temperature: 0, maxOutputTokens: 2000 };
  if (withThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: "audio/wav", data: audio } }] }],
      generationConfig,
    }),
    signal: AbortSignal.timeout(45_000),
  });
}

// Tajweed / pronunciation review by Gemini: advisory only (the word-level check above is the score). It must name only what it can clearly hear.
const LANG_NAME: Record<string, string> = { uz: "Uzbek", ru: "Russian", en: "English", ar: "Arabic" };
// deno-lint-ignore no-explicit-any
async function geminiTajweed(audio: string, ayahs: { n: number; words: string[] }[], lang: string): Promise<any> {
  if (!GEMINI_API_KEY) return null;
  const expected = ayahs.map((a) => `(${a.n}) ${a.words.join(" ")}`).join("\n");
  const prompt =
    "You are an experienced Qur'an teacher (Hafs 'an 'Asim). Listen to the student's recitation and compare it with the expected verses below (fully vocalised).\n" +
    "Judge ONLY tajweed and pronunciation problems that you can clearly HEAR: madd (elongation too short or too long), ghunna, idgham / ikhfa / iqlab / izhar, qalqala, " +
    "letters confused with a neighbour (ص/س, ح/ه, ع/ا, ق/ك, ض/د, ط/ت, ذ/ز), tafkhim / tarqiq, wrong vowels, and wrong stopping (waqf). " +
    "Do NOT judge the voice, speed, accent or recording quality. If you are not sure about something, do not mention it. Never invent a mistake.\n" +
    `Write each tip as ONE short, kind sentence in ${LANG_NAME[lang] ?? "English"}. The rule name stays in Arabic transliteration (for example madd, ghunna, qalqala).\n` +
    "Return ONLY JSON: {\"overall\": <0-100 estimate of tajweed quality>, \"notes\": [{\"ayah\": <number>, \"word\": \"<the word as written>\", \"rule\": \"<rule>\", \"level\": \"minor\"|\"major\", \"tip\": \"<tip>\"}]} " +
    "with at most 8 notes, the most important first. If the recitation is clean, notes is an empty array.\n\nExpected verses:\n" + expected;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: "audio/wav", data: audio } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 1500, responseMimeType: "application/json" },
  });
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY }, body, signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) { console.error("tajweed model failed", model, res.status, await res.text()); continue; }
      const data = await res.json();
      // deno-lint-ignore no-explicit-any
      const txt = String(data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") ?? "").replace(/^```(?:json)?|```$/g, "").trim();
      const j = JSON.parse(txt);
      const notes = Array.isArray(j?.notes) ? j.notes.slice(0, 8).map((x: Record<string, unknown>) => ({
        ayah: Number(x.ayah) || 0, word: String(x.word ?? "").slice(0, 40), rule: String(x.rule ?? "").slice(0, 40),
        level: x.level === "major" ? "major" : "minor", tip: String(x.tip ?? "").slice(0, 220),
      })) : [];
      return { overall: Math.max(0, Math.min(100, Math.round(Number(j?.overall) || 0))), notes };
    } catch (e) { console.error("tajweed review failed", model, String(e)); }
  }
  return null;
}

async function asrGemini(audio: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  let res = await geminiCall(PRIMARY_MODEL, audio, true);
  if (res.status === 400) res = await geminiCall(PRIMARY_MODEL, audio, false);
  if (!res.ok && (res.status === 429 || res.status >= 500 || res.status === 404)) {
    console.error("hifz primary model failed", res.status, await res.text());
    res = await geminiCall(FALLBACK_MODEL, audio, true);
    if (res.status === 400) res = await geminiCall(FALLBACK_MODEL, audio, false);
  }
  if (!res.ok) { console.error("hifz gemini error", res.status, await res.text()); throw new Error(`gemini HTTP ${res.status}`); }
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  let text = String(data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join(" ") ?? "").trim();
  if (/^\[?\s*NO_SPEECH\s*\]?\.?$/i.test(text)) text = "";
  return text;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    const user = u?.user;
    if (uErr || !user) return json(req, { error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const audio = String(body.audio ?? "");
    const assignmentId = String(body.assignment_id ?? "");
    if (audio.length < 400 || audio.length > MAX_AUDIO_B64_CHARS) return json(req, { error: "bad-audio" }, 400);

    const practice = body.mode === "practice";   // the student checks any range by himself (no teacher assignment, nothing is stored)
    // deno-lint-ignore no-explicit-any
    let a: any;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    if (practice) {
      const sN = Number(body.surah), f = Number(body.from_ayah), t2 = Number(body.to_ayah);
      if (!(sN >= 1 && sN <= 114 && f >= 1 && t2 >= f && t2 - f < 25)) return json(req, { error: "bad-range" }, 400);
      const { data: hasAccess } = await userClient.rpc("ufuq_has_access");
      if (hasAccess !== true) return json(req, { error: "PAYMENT_REQUIRED" }, 402);
      const now = Date.now();
      const recent = (practiceHits.get(user.id) ?? []).filter((x) => now - x < 60_000);
      if (recent.length >= MAX_PER_MINUTE) return json(req, { error: "slow-down" }, 429);
      recent.push(now); practiceHits.set(user.id, recent);
      a = { id: null, surah: sN, from_ayah: f, to_ayah: t2 };
    } else {
      // RLS decides whether this student can see the assignment; only the assigned student may submit.
      const { data: asg } = await userClient.from("hifz_assignments").select("*").eq("id", assignmentId).maybeSingle();
      if (!asg || asg.student_id !== user.id) return json(req, { error: "no-assignment" }, 403);
      a = asg;
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await admin.from("hifz_attempts").select("id", { count: "exact", head: true })
        .eq("student_id", user.id).gte("created_at", since);
      if ((count ?? 0) >= MAX_PER_MINUTE) return json(req, { error: "slow-down" }, 429);
    }

    // expected words
    let surah;
    try { surah = await loadSurah(a.surah); } catch (e) { console.error(String(e)); return json(req, { error: "quran-data-unavailable" }, 503); }
    // deno-lint-ignore no-explicit-any
    const ayahs = (surah.ayahs as any[]).filter((x) => x.n >= a.from_ayah && x.n <= a.to_ayah);
    if (!ayahs.length) return json(req, { error: "bad-range" }, 400);
    const expected: string[] = [];
    const display: { ayah: number; text: string }[] = [];
    for (const ay of ayahs) {
      (ay.clean as string[]).forEach((c, k) => {
        const w = normalizeArabic(c);
        if (!w) return;
        expected.push(w);
        display.push({ ayah: ay.n, text: ay.words[k] });
      });
    }

    // tajweed review runs in parallel with the speech recognition (practice mode only)
    const tajAyahs = ayahs.map((ay: { n: number; words: string[] }) => ({ n: ay.n, words: ay.words as string[] }));
    const tajPromise = practice && body.tajweed !== false ? geminiTajweed(audio, tajAyahs, String(body.lang ?? "en")) : Promise.resolve(null);

    // speech -> text
    let transcript = "";
    let engine = "";
    let done = false;
    if (Deno.env.get("ASR_URL")) {
      try { transcript = await asrQuranWhisper(audio); engine = "quran-whisper"; done = true; }
      catch (e) { console.error("quran-whisper failed:", String(e)); }
    }
    if (!done) {
      try { transcript = await asrGemini(audio); engine = "gemini"; }
      catch (e) { console.error("gemini failed:", String(e)); return json(req, { error: "asr-unavailable" }, 503); }
    }

    const heard = splitWords(transcript);
    if (!heard.length) return json(req, { error: "no-speech" }, 422);

    const res = alignRecitation(expected, heard);
    const words = res.words.map((w: { i: number; status: string; heard: string }) => ({
      ayah: display[w.i].ayah, text: display[w.i].text, status: w.status, heard: w.heard,
    }));

    let attemptId: string | null = null;
    if (!practice) {
      const { data: saved, error } = await admin.from("hifz_attempts").insert({
        assignment_id: a.id, student_id: user.id, transcript, word_results: words, extras: res.extras,
        score: res.score, correct_count: res.counts.correct, near_count: res.counts.near, wrong_count: res.counts.wrong,
        missing_count: res.counts.missing, total_words: res.counts.total, asr_engine: engine,
      }).select("id").single();
      if (error) console.error("save attempt failed:", error.message);
      attemptId = saved?.id ?? null;
    }
    const tajweed = await tajPromise;

    return json(req, { ok: true, attempt_id: attemptId, engine, score: res.score, counts: res.counts, words, extras: res.extras, tajweed });
  } catch (e) {
    console.error("ufuq-hifz-check error:", e);
    return json(req, { error: "server" }, 500);
  }
});
