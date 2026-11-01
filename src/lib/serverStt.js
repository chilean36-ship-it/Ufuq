import { supabase } from './supabaseClient';

/*
 * Server-side speech recognition for Ufuq AI voice mode.
 * Records the microphone as 16 kHz mono PCM (no MediaRecorder, so it works in every browser incl. iOS Safari),
 * stops by itself when the person stops talking (energy-based voice-activity detection), wraps the audio in a WAV
 * and sends it to the `ufuq-stt` edge function (Gemini), which knows Uzbek, Arabic, Russian and English.
 *
 *   const h = serverListen({ lang: 'uz', onStart, onLevel, onError, onDone });  h.stop() | h.abort()
 */
const TARGET_RATE = 16000;
const MAX_MS = 30000;          // hard cap for one utterance
const NO_SPEECH_MS = 8000;     // nobody started talking
const END_SILENCE_MS = 900;   // talking, then this much silence = finished (quick turn-taking, still tolerates a natural pause)
const MIN_SPEECH_MS = 250;     // ignore clicks / pops

export function serverSttSupported() {
  const w = typeof window !== 'undefined' ? window : {};
  return !!(navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (w.AudioContext || w.webkitAudioContext));
}

function downsample(buf, inRate) {
  if (inRate === TARGET_RATE) return buf;
  const ratio = inRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(buf.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(buf.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += buf[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function toWavBase64(float32) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, TARGET_RATE, true); v.setUint32(28, TARGET_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, pcm.byteLength, true);
  const bytes = new Uint8Array(44 + pcm.byteLength);
  bytes.set(new Uint8Array(header), 0);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

async function transcribe(samples, lang) {
  const { data, error } = await supabase.functions.invoke('ufuq-stt', { body: { audio: toWavBase64(samples), mime: 'audio/wav', lang } });
  if (error) throw error;
  return String((data && data.text) || '').trim();
}


/* Shared microphone: the stream and AudioContext are kept warm between turns, so every new turn starts at once
   instead of asking the device again. The mic is released after a short idle period (and on releaseMic()),
   so the browser's recording indicator never stays on needlessly. */
const IDLE_RELEASE_MS = 25000;
let sharedMic = null;   // { stream, ctx }
let idleTimer = null;

function micIsLive(m) {
  return !!(m && m.stream && m.stream.getAudioTracks().some((t) => t.readyState === 'live') && m.ctx && m.ctx.state !== 'closed');
}

let micPending = null;  // one permission request at a time, even if two turns start together

async function openMic() {
  if (sharedMic) releaseMic();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const AC = window.AudioContext || window.webkitAudioContext;
  sharedMic = { stream, ctx: new AC() };
  return sharedMic;
}

async function acquireMic() {
  clearTimeout(idleTimer);
  if (!micIsLive(sharedMic)) {
    if (!micPending) micPending = openMic().finally(() => { micPending = null; });
    await micPending;
  }
  if (!micIsLive(sharedMic)) throw new Error('microphone unavailable');
  if (sharedMic.ctx.state === 'suspended') { try { await sharedMic.ctx.resume(); } catch (e) { /* ignore */ } }
  return sharedMic;
}

/** Stops the microphone and frees the audio context. Safe to call any time. */
export function releaseMic() {
  clearTimeout(idleTimer);
  idleTimer = null;
  const m = sharedMic;
  sharedMic = null;
  if (!m) return;
  try { m.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
  try { if (m.ctx.state !== 'closed') m.ctx.close(); } catch (e) { /* ignore */ }
}

function scheduleRelease() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(releaseMic, IDLE_RELEASE_MS);
}

// `raw: true` (used by the Hifz checker): do NOT call ufuq-stt, hand the recorded 16 kHz WAV (base64) to onDone instead.
// maxMs / noSpeechMs / endSilenceMs let a caller allow longer pauses (a student recalling a verse needs more than a chat turn).
export function serverListen({ lang = 'uz', onStart, onLevel, onError, onDone, raw = false, maxMs = MAX_MS, noSpeechMs = NO_SPEECH_MS, endSilenceMs = END_SILENCE_MS }) {
  let finished = false;
  let silent = false;
  let ctx = null;
  let proc = null;
  let src = null;
  let chunks = [];
  let rate = 48000;
  let speechMs = 0;
  let silenceMs = 0;
  let totalMs = 0;
  let noise = 0.008;
  let calibrating = 300;
  let heard = false;
  let stopping = false;

  const cleanup = () => {
    try { if (proc) { proc.onaudioprocess = null; proc.disconnect(); } } catch (e) { /* ignore */ }
    try { if (src) src.disconnect(); } catch (e) { /* ignore */ }
    proc = null; src = null;
    scheduleRelease();   // the shared microphone stays warm for the next turn, then is released when idle
  };
  const done = (text) => { if (finished) return; finished = true; cleanup(); if (!silent && onDone) onDone(text); };

  const finishRecording = async () => {
    if (stopping || finished) return;
    stopping = true;
    cleanup();
    if (silent) { finished = true; return; }
    if (!heard || speechMs < MIN_SPEECH_MS) { if (onError && !silent) onError('no-speech'); done(''); return; }
    let total = 0;
    chunks.forEach((c) => { total += c.length; });
    const merged = new Float32Array(total);
    let o = 0;
    chunks.forEach((c) => { merged.set(c, o); o += c.length; });
    chunks = [];
    try {
      const samples = downsample(merged, rate);
      if (raw) { if (silent) { finished = true; return; } done(toWavBase64(samples)); return; }
      const text = await transcribe(samples, lang);
      if (silent) { finished = true; return; }
      if (!text && onError) onError('no-speech');
      done(text);
    } catch (e) {
      console.error('ufuq-stt failed:', e);
      if (!silent && onError) onError('network');
      done('');
    }
  };

  (async () => {
    try {
      sharedMic = await acquireMic();
    } catch (e) {
      if (!silent && onError) onError(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'not-allowed' : 'audio-capture');
      done('');
      return;
    }
    if (silent || finished) { cleanup(); return; }
    ctx = sharedMic.ctx;
    rate = ctx.sampleRate;
    src = ctx.createMediaStreamSource(sharedMic.stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => {
      if (finished || stopping) return;
      const input = e.inputBuffer.getChannelData(0);
      const frameMs = (input.length / rate) * 1000;
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      totalMs += frameMs;
      if (onLevel) onLevel(Math.min(1, rms * 8));
      if (calibrating > 0) { calibrating -= frameMs; noise = Math.max(noise * 0.6 + rms * 0.4, 0.004); chunks.push(new Float32Array(input)); return; }
      const speaking = rms > Math.max(0.018, noise * 3.2);
      if (speaking) { heard = true; speechMs += frameMs; silenceMs = 0; } else if (heard) { silenceMs += frameMs; }
      if (heard || chunks.length < 6) chunks.push(new Float32Array(input)); // keep a little lead-in before speech starts
      else { chunks.push(new Float32Array(input)); if (chunks.length > 8) chunks.shift(); }
      if (heard && silenceMs >= endSilenceMs) finishRecording();
      else if (!heard && totalMs >= noSpeechMs) finishRecording();
      else if (totalMs >= maxMs) finishRecording();
    };
    src.connect(proc);
    proc.connect(ctx.destination); // required by some browsers for onaudioprocess to fire (output is silent)
    if (onStart) onStart();
  })();

  return {
    stop() { if (!finished) finishRecording(); },
    abort() { silent = true; if (!finished) { finished = true; cleanup(); } },
  };
}
