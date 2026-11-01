/**
 * Voice layer for Ufuq AI (Live mode + dictation + "read aloud").
 *
 * The UI only talks to a VOICE PROVIDER — an object with this shape:
 *
 *   id: string
 *   support(): { stt: boolean, tts: boolean }
 *   hasVoice(bcp47): boolean                       // can we speak this language out loud?
 *   listen({ lang, onStart?, onInterim?, onError?, onDone }) -> { stop(), abort() }
 *        onInterim(text)  live transcript while the person talks
 *        onError(code)    'not-allowed' | 'network' | 'language-not-supported' | 'audio-capture' | 'no-speech' | …
 *        onDone(text)     called exactly once at the end (text may be '')
 *        stop()  = finish and deliver what was heard;  abort() = drop everything silently
 *   speak(text, { lang, onStart?, onBoundary?, onEnd? }) -> { cancel() }
 *
 * The default provider below uses the browser's Web Speech API (free, no server). To connect another
 * speech engine (Meta's, a realtime WebSocket model, a cloud TTS…) implement the same shape and call
 * `setVoiceProvider(myProvider)` once at start-up — no UI code changes.
 * The *answers* come from `askUfuqAi()` in aiClient.js (the `ai-chat` edge function).
 */

import { speak as neuralSpeak } from '../../../lib/speak';
import { serverListen, serverSttSupported } from '../../../lib/serverStt';

export const VOICE_LANGS = [
  { id: 'ar', bcp: 'ar-SA', label: 'العربية' },
  { id: 'uz', bcp: 'uz-UZ', label: 'O‘zbekcha' },
  { id: 'ru', bcp: 'ru-RU', label: 'Русский' },
  { id: 'en', bcp: 'en-US', label: 'English' },
];

const LANG_KEY = 'ufuq-ai-voice-lang';

export function uiLangToVoiceId(uiLang) {
  const l = String(uiLang || 'EN').toUpperCase();
  return l === 'AR' ? 'ar' : l === 'UZ' ? 'uz' : l === 'RU' ? 'ru' : 'en';
}
export function voiceBcp(id) {
  const f = VOICE_LANGS.find((v) => v.id === id);
  return (f || VOICE_LANGS[3]).bcp;
}
export function voiceLabel(id) {
  const f = VOICE_LANGS.find((v) => v.id === id);
  return (f || VOICE_LANGS[3]).label;
}
export function readSavedVoiceLang(uiLang) {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && VOICE_LANGS.some((v) => v.id === saved)) return saved;
  } catch (e) { /* storage blocked */ }
  return uiLangToVoiceId(uiLang);
}
export function saveVoiceLang(id) {
  try { localStorage.setItem(LANG_KEY, id); } catch (e) { /* ignore */ }
}

const AR_RE = /[\u0600-\u06FF]/g;
const LETTER_RE = /\p{L}/gu;
/** Chunk-level language: Arabic script dominates → Arabic, otherwise the language the person chose. */
export function detectChunkLang(text, fallbackBcp) {
  const ar = (text.match(AR_RE) || []).length;
  const letters = (text.match(LETTER_RE) || []).length;
  if (letters > 0 && ar / letters > 0.4) return 'ar-SA';
  return fallbackBcp;
}

/** Markdown / emoji / URLs out — what is left should sound natural when read aloud. */
export function stripForSpeech(t) {
  return String(t || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[*_~>#]+/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split into sentence-sized pieces — Chrome silently stops long utterances after ~15 s. */
function splitForSpeech(text, max = 180) {
  const parts = text.match(/[^.!?؟۔…\n]+[.!?؟۔…]*\s*/g) || [text];
  const out = [];
  let buf = '';
  parts.forEach((p) => {
    if ((buf + p).length > max && buf) { out.push(buf.trim()); buf = p; } else { buf += p; }
  });
  if (buf.trim()) out.push(buf.trim());
  // hard-split any single sentence that is still too long
  return out.flatMap((s) => {
    if (s.length <= max * 1.6) return [s];
    const pieces = [];
    let rest = s;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max);
      if (cut < max * 0.5) cut = max;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut);
    }
    if (rest.trim()) pieces.push(rest.trim());
    return pieces;
  });
}

/* ------------------------------------------------------------------ */
/*  Default provider: browser Web Speech API                           */
/* ------------------------------------------------------------------ */
function createBrowserProvider() {
  const w = typeof window !== 'undefined' ? window : {};
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  const synth = w.speechSynthesis;
  const hasTts = !!(synth && w.SpeechSynthesisUtterance);
  let voices = [];
  const loadVoices = () => { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } };
  if (hasTts) {
    loadVoices();
    try { synth.addEventListener('voiceschanged', loadVoices); } catch (e) { /* old Safari */ }
  }
  const pickVoice = (bcp) => {
    const base = bcp.slice(0, 2).toLowerCase();
    const same = voices.filter((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(base));
    if (!same.length) return null;
    return same.find((v) => v.lang.toLowerCase().replace('_', '-') === bcp.toLowerCase())
      || same.find((v) => /google|natural|enhanced|premium/i.test(v.name))
      || same[0];
  };

  return {
    id: 'browser',
    support() { return { stt: !!SR, tts: hasTts }; },
    hasVoice(bcp) {
      if (!hasTts) return false;
      if (!voices.length) loadVoices();
      if (!voices.length) return true; // list not loaded yet — assume yes
      return !!pickVoice(bcp);
    },

    listen({ lang, onStart, onInterim, onError, onDone }) {
      if (!SR) { if (onError) onError('unsupported'); if (onDone) onDone(''); return { stop() {}, abort() {} }; }
      const rec = new SR();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let finalText = '';
      let interimText = '';
      let finished = false;
      let silent = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (!silent && onDone) onDone((finalText || interimText).trim());
      };
      rec.onstart = () => { if (onStart) onStart(); };
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript;
        }
        interimText = interim;
        if (!silent && onInterim) onInterim((finalText + interim).trim());
      };
      rec.onerror = (e) => { if (!silent && e.error !== 'aborted' && onError) onError(e.error); };
      rec.onend = finish;
      try { rec.start(); } catch (err) { if (onError) onError('start-failed'); finish(); }
      return {
        stop() { try { rec.stop(); } catch (e) { finish(); } },
        abort() { silent = true; try { rec.abort(); } catch (e) { /* ignore */ } },
      };
    },

    speak(text, { lang, onStart, onBoundary, onEnd } = {}) {
      const clean = String(text || '').trim();
      if (!hasTts || !clean) { if (onEnd) setTimeout(onEnd, 0); return { cancel() {} }; }
      const chunks = splitForSpeech(clean);
      let i = 0;
      let cancelled = false;
      let started = false;
      const next = () => {
        if (cancelled) return;
        if (i >= chunks.length) { if (onEnd) onEnd(); return; }
        const chunk = chunks[i++];
        const bcp = detectChunkLang(chunk, lang);
        const u = new w.SpeechSynthesisUtterance(chunk);
        u.lang = bcp;
        const v = pickVoice(bcp);
        if (v) u.voice = v;
        u.rate = 1;
        u.onstart = () => { if (!started) { started = true; if (onStart) onStart(); } };
        u.onboundary = () => { if (onBoundary) onBoundary(); };
        u.onend = next;
        u.onerror = (ev) => { if (cancelled || ev.error === 'interrupted' || ev.error === 'canceled') return; next(); };
        w.__ufuqUtterance = u; // keep a reference — Chrome may garbage-collect it before `onend` fires
        synth.speak(u);
      };
      try { synth.cancel(); } catch (e) { /* ignore */ }
      setTimeout(next, 60); // Chrome drops an utterance queued in the same tick as cancel()
      return { cancel() { cancelled = true; try { synth.cancel(); } catch (e) { /* ignore */ } } };
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Neural provider: ufuq-tts edge function (Azure / Aisha / ElevenLabs)*/
/*  Listening stays on the browser; speaking uses src/lib/speak.js,     */
/*  which falls back to the browser voice chunk-by-chunk on any error.  */
/* ------------------------------------------------------------------ */
function createNeuralProvider() {
  const base = createBrowserProvider();
  return {
    ...base,
    id: 'neural',
    // Listening: our own recorder + server speech recognition (Uzbek, Arabic, Russian, English in every browser);
    // the browser's recognizer is only the fallback when the microphone API is missing.
    support() { const s = base.support(); return { stt: serverSttSupported() || s.stt, tts: true }; },
    listen(opts) {
      if (!serverSttSupported()) return base.listen(opts);
      const id = String((opts && opts.lang) || 'en').slice(0, 2).toLowerCase();
      return serverListen({ ...opts, lang: ['uz', 'ru', 'en', 'ar'].includes(id) ? id : 'en' });
    },
    // The server voice (or its browser fallback) is always attempted, so never show "no voice" up front.
    hasVoice() { return true; },
    speak(text, { lang, onStart, onBoundary, onEnd } = {}) {
      const id = String(lang || 'en').slice(0, 2).toLowerCase();
      const h = neuralSpeak(text, ['uz', 'ru', 'en', 'ar'].includes(id) ? id : 'en', { onStart, onBoundary, onEnd });
      return { cancel() { h.cancel(); } };
    },
  };
}

let provider = null;
export function getVoiceProvider() {
  if (!provider) provider = createNeuralProvider();
  return provider;
}
/** Plug in another speech engine (see the contract at the top of this file). */
export function setVoiceProvider(next) { provider = next; }
