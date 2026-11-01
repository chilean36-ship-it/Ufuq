// Generates the Level 1 listening mp3 files with Google Gemini TTS, asked for pure Modern Standard Arabic (fusha).
// Run (your own Google AI Studio key; it is read from the environment and never written anywhere):
//   npm i --no-save @breezystack/lamejs
//   GEMINI_API_KEY=...  node scripts/gen-listening-audio-gemini.mjs scripts/data/listening-level1.json public/listening/level1
// Every speaker of the json ("m1", "m2", "f1", "f2") has its own Gemini voice below.
import fs from "fs";
import path from "path";


const lamejs = await import("@breezystack/lamejs");

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
if (!KEY) { console.error("Set GEMINI_API_KEY first."); process.exit(1); }
const [, , jsonPath, outDir] = process.argv;
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

// two boys, two girls
const VOICES = { m1: "Charon", m2: "Orus", f1: "Kore", f2: "Sulafat" };
const STYLE =
  "Read the following Arabic text aloud in pure Modern Standard Arabic (Fusha), like a careful teacher of the language for beginners. " +
  "Pronounce every letter exactly as in classical Arabic: the letter jeem as /dʒ/ (never a hard g), qaf as /q/, and articulate every short vowel and case ending clearly. " +
  "Speak calmly, slowly and very clearly, with no dialect and no rushing. Text: ";

const RATE = 24000;
async function say(voice, text) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: STYLE + text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const b64 = j?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64) return Buffer.from(b64, "base64");   // raw 16-bit mono PCM, 24 kHz
    } else console.error("Gemini", r.status, (await r.text()).slice(0, 200));
    await new Promise((res) => setTimeout(res, 2500 * (attempt + 1)));
  }
  throw new Error("TTS failed: " + text);
}

const silence = (ms) => Buffer.alloc(Math.round((RATE * ms) / 1000) * 2);

function toMp3(pcm) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const enc = new lamejs.Mp3Encoder(1, RATE, 64);
  const out = []; const block = 1152;
  for (let i = 0; i < samples.length; i += block) {
    const buf = enc.encodeBuffer(samples.subarray(i, i + block));
    if (buf.length) out.push(Buffer.from(buf));
  }
  const end = enc.flush(); if (end.length) out.push(Buffer.from(end));
  return Buffer.concat(out);
}

for (const exam of data.exams) {
  for (const q of exam.questions) {
    const parts = [];
    for (let i = 0; i < q.audio.length; i++) {
      parts.push(await say(VOICES[q.audio[i].voice], q.audio[i].text));
      if (i < q.audio.length - 1) parts.push(silence(700));
    }
    const mp3 = toMp3(Buffer.concat(parts));
    const file = path.join(outDir, `${exam.kind}-${q.id}.mp3`);
    fs.writeFileSync(file, mp3);
    console.log(file, mp3.length, "bytes");
  }
}
