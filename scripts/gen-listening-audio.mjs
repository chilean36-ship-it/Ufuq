// Generates the Level 1 listening mp3 files from scripts/data/listening-level1.json (Azure neural Arabic voices, same ones as ufuq-tts).
// Run:  npm i --no-save msedge-tts  &&  node scripts/gen-listening-audio.mjs scripts/data/listening-level1.json public/listening/level1
import fs from "fs";
import path from "path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const [, , jsonPath, outDir] = process.argv;
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const collect = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on("data", (c) => chunks.push(c));
  stream.on("end", () => resolve(Buffer.concat(chunks)));
  stream.on("error", reject);
});

const clients = {};
async function client(voice) {
  if (!clients[voice]) {
    const c = new MsEdgeTTS();
    await c.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    clients[voice] = c;
  }
  return clients[voice];
}

async function say(voice, text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const c = await client(voice);
      const { audioStream } = c.toStream(text, { rate: "-10%" });
      const buf = await collect(audioStream);
      if (buf.length > 500) return buf;
    } catch (e) { delete clients[voice]; }
  }
  throw new Error("TTS failed: " + text);
}

async function silence(voice, ms) {
  const c = await client(voice);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-SA"><voice name="${voice}"><break time="${ms}ms"/></voice></speak>`;
  try {
    const { audioStream } = c.rawToStream(ssml);
    return await collect(audioStream);
  } catch (e) { return Buffer.alloc(0); }
}

for (const exam of data.exams) {
  for (const q of exam.questions) {
    const parts = [];
    for (let i = 0; i < q.audio.length; i++) {
      const seg = q.audio[i];
      const voice = data.voices[seg.voice];
      parts.push(await say(voice, seg.text));
      if (i < q.audio.length - 1) parts.push(await silence(voice, 600));
    }
    const file = path.join(outDir, `${exam.kind}-${q.id}.mp3`);
    fs.writeFileSync(file, Buffer.concat(parts));
    console.log(file, Buffer.concat(parts).length, "bytes");
  }
}
