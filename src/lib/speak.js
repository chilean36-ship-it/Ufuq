import { supabase } from './supabaseClient';

// ---------- Matnni tozalash ----------
/** AI javobidagi markdown, havola va emojilarni olib tashlaydi — ovoz toza o'qisin. */
export function cleanForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------- Til aniqlash (uz / ru / en / ar) ----------
const AR = '\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF';
const AR_RUN = new RegExp(`([${AR}][${AR}\\s\\u060C\\u061B\\u061F\\u0640]*)`, 'g');
const HAS_AR = new RegExp(`[${AR}]`);
const HAS_CYR = /[\u0400-\u04FF]/;
const UZ_CYR_ONLY = /[ўқғҳЎҚҒҲ]/;

const UZ_WORDS = new Set('va bu men siz sen biz uchun bilan ham emas yoki nima qanday qaysi bor yoq yo\'q ha xo\'p yaxshi rahmat salom iltimos kerak mumkin bo\'ladi qiling ayting dars darslar arab tili til so\'z gap'.split(' '));
const EN_WORDS = new Set('the is are and to of you your in that it for with this what how can do does not be have i we they a an on as at but or if so my me hello thanks thank please word sentence lesson'.split(' '));

function detectLatin(s, fallback) {
  if (/[oOgG][ʻ’‘`´']/.test(s)) return 'uz';
  const words = s.toLowerCase().replace(/[’‘`´ʻ]/g, "'").match(/[a-z']+/g) || [];
  let uz = 0, en = 0;
  for (const w of words) { if (UZ_WORDS.has(w)) uz++; if (EN_WORDS.has(w)) en++; }
  if (uz === en) return fallback;
  return uz > en ? 'uz' : 'en';
}

const CYR_MAP = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'ts',ч:'ch',ш:'sh',ъ:"'",ы:'i',ь:'',э:'e',ю:'yu',я:'ya',ў:"o'",қ:'q',ғ:"g'",ҳ:'h' };
/** O'zbekcha kirill matnini lotinga o'giradi (Azure o'zbek ovozi lotin yozuvini o'qiydi). */
export function uzCyrToLatin(s) {
  return s.replace(/[а-яёўқғҳ]/gi, (c) => {
    const m = CYR_MAP[c.toLowerCase()];
    return m === undefined ? c : m;
  });
}

/**
 * Matnni (til, matn) bo'laklariga ajratadi: arabcha yozuv -> 'ar', kirill -> 'ru' (yoki o'zbekcha kirill -> 'uz'),
 * lotin -> 'uz' yoki 'en'. Yonma-yon bir xil til bo'laklari birlashtiriladi.
 */
export function splitByLanguage(text, defaultLang = 'uz') {
  const out = [];
  const push = (lang, t) => {
    if (!t.trim()) return;
    const last = out[out.length - 1];
    if (last && last.lang === lang) last.text += t; else out.push({ lang, text: t });
  };

  const sentences = text.match(/[^.!?؟…]+[.!?؟…]*\s*/g) || [text];
  for (const sentence of sentences) {
    const parts = sentence.split(AR_RUN);
    // Latin/kirill qismi uchun gap bo'yicha til: harfsiz (raqam, tinish) bo'laklar qo'shnisiga yopishadi.
    const nonAr = parts.filter((p) => !HAS_AR.test(p)).join(' ');
    let sentLang;
    if (HAS_CYR.test(nonAr)) sentLang = UZ_CYR_ONLY.test(nonAr) ? 'uz-cyr' : 'ru';
    else sentLang = detectLatin(nonAr, defaultLang);

    for (const p of parts) {
      if (!p) continue;
      if (HAS_AR.test(p)) { push('ar', p); continue; }
      const letters = (p.match(/\p{L}/gu) || []).length;
      if (letters < 2 && out.length) { out[out.length - 1].text += p; continue; } // bo'sh/qisqa bo'lak
      if (sentLang === 'uz-cyr') push('uz', uzCyrToLatin(p));
      else push(sentLang, p);
    }
  }
  return out;
}


// ---------- Bo'laklash (kechikishni kamaytirish) ----------
/** Matnni gap chegaralari bo'yicha `max` belgidan oshmaydigan bo'laklarga ajratadi. */
export function chunkText(text, max = 220) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  const sents = clean.match(/[^.!?؟…]+[.!?؟…]*\s*/g) || [clean];
  const out = [];
  let buf = '';
  sents.forEach((s) => {
    if ((buf + s).length > max && buf.trim()) { out.push(buf.trim()); buf = s; } else { buf += s; }
  });
  if (buf.trim()) out.push(buf.trim());
  return out.flatMap((p) => {
    if (p.length <= max * 1.4) return [p];
    const pieces = [];
    let rest = p;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max);
      if (cut < max * 0.5) cut = max;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
    return pieces;
  });
}

/** Birinchi bo'lak qisqa bo'ladi: ovoz birinchi jumladanoq boshlanadi, qolganlari parallel tayyorlanadi. */
function toSpeechSegments(text, defaultLang) {
  const out = [];
  splitByLanguage(text, defaultLang).forEach((seg) => {
    let rest = seg.text.trim();
    if (!rest) return;
    if (out.length === 0) {
      const head = chunkText(rest, 90);
      out.push({ lang: seg.lang, text: head[0] });
      rest = head.slice(1).join(' ');
    }
    chunkText(rest, 220).forEach((t) => out.push({ lang: seg.lang, text: t }));
  });
  return out;
}

// ---------- Ijro ----------
let currentAudio = null;
let currentUrl = null;
let requestId = 0;

export function stopSpeaking() {
  requestId++;
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; }
  if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    // Chrome can leave the speech queue paused after a cancel; resume() keeps the next answer audible.
    try { window.speechSynthesis.cancel(); window.speechSynthesis.resume(); } catch (e) { /* ignore */ }
  }
}

const norm = (l) => String(l || '').toLowerCase().replace('_', '-');

/** Qurilmadagi eng yaxshi ovozni tanlaydi (Natural/Google/Premium ovozlar afzal). */
function pickVoice(langCode) {
  const prefix = langCode.slice(0, 2).toLowerCase();
  const voices = (window.speechSynthesis.getVoices() || []).filter((v) => norm(v.lang).startsWith(prefix));
  if (!voices.length) return null;
  const score = (v) =>
    (/natural|neural|online/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 3 : 0) +
    (/premium|enhanced/i.test(v.name) ? 3 : 0) +
    (norm(v.lang) === langCode.toLowerCase() ? 1 : 0);
  return voices.sort((x, y) => score(y) - score(x))[0];
}

/** Ba'zi brauzerlarda ovozlar ro'yxati keyinroq yuklanadi. */
function voicesReady() {
  const synth = window.speechSynthesis;
  return new Promise((resolve) => {
    if (synth.getVoices().length) return resolve();
    const t = setTimeout(resolve, 800);
    if (synth.addEventListener) synth.addEventListener('voiceschanged', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

async function browserFallback(segments) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  await voicesReady();
  const codes = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US', ar: 'ar-SA' };
  await Promise.all(segments.map((s) => new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(s.text);
    u.lang = codes[s.lang] || 'uz-UZ';
    const v = pickVoice(u.lang);
    if (v) { u.voice = v; u.lang = v.lang; }
    if (s.lang === 'ar') u.rate = 1;
    u.onend = resolve; u.onerror = resolve;
    window.speechSynthesis.speak(u);
  })));
}

function sniffType(buf) {
  const b = new Uint8Array(buf.slice ? buf.slice(0, 4) : buf);
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46) return 'audio/wav'; // "RIFF"
  return 'audio/mpeg';
}

async function fetchSegment(seg) {
  const { data, error } = await supabase.functions.invoke('ufuq-tts', { body: { text: seg.text, lang: seg.lang } });
  if (error) throw error;
  const buf = await data.arrayBuffer();
  return new Blob([buf], { type: sniffType(buf) });
}

function playBlob(blob, onTick) {
  currentUrl = URL.createObjectURL(blob);
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = currentUrl;
  currentAudio = audio;
  return new Promise((resolve, reject) => {
    // Orb animatsiyasi uchun: audio o'ynayotganda onBoundary'ni vaqti-vaqti bilan chaqiramiz.
    const tick = onTick ? setInterval(onTick, 180) : null;
    const clear = () => { if (tick) clearInterval(tick); };
    audio.onended = () => { clear(); resolve(); };
    audio.onerror = (e) => { clear(); reject(e); };
    audio.play().catch((e) => { clear(); reject(e); });
  });
}

/**
 * AI javobini chiroyli neyron ovozda aytadi. voiceAdapter.js dagi provayder shaklida ishlaydi:
 *   const h = speak(text, 'uz', { onStart, onBoundary, onEnd });  h.cancel() — to'xtatish.
 * onEnd faqat javob oxirigacha o'qilganda chaqiriladi (cancel qilinsa chaqirilmaydi).
 * Til har bo'lak uchun avtomatik aniqlanadi (uz / ru / en / ar aralash bo'lishi mumkin).
 * Bo'laklar parallel tayyorlanadi va ketma-ket ijro etiladi; biror bo'lak olinmasa, faqat o'sha bo'lak brauzer ovozida o'qiladi.
 */
export function speak(text, defaultLang = 'uz', { onStart, onBoundary, onEnd } = {}) {
  stopSpeaking();
  const my = ++requestId;
  const handle = { cancel() { if (my === requestId) stopSpeaking(); } };

  (async () => {
    const segments = toSpeechSegments(cleanForSpeech(text), defaultLang);   // no cut-off: long answers are read to the end
    if (!segments.length) { if (onEnd) onEnd(); return; }

    // Prefetch with a small pool: the next pieces download while the current one plays (no request storm).
    const POOL = 3;
    let active = 0;
    const waiters = [];
    const acquire = () => {
      if (active < POOL) { active++; return Promise.resolve(); }
      return new Promise((resolve) => waiters.push(resolve));
    };
    const release = () => {
      active--;
      const w = waiters.shift();
      if (w) { active++; w(); }
    };
    const jobs = segments.map((seg) => (async () => {
      await acquire();
      try { return await fetchSegment(seg); }
      catch (e) { console.warn("ufuq-tts bo'lagi olinmadi:", e); return null; }
      finally { release(); }
    })());

    let started = false;
    const markStart = () => { if (!started) { started = true; if (onStart) onStart(); } };

    for (let i = 0; i < segments.length; i++) {
      const blob = await jobs[i];
      if (my !== requestId) return; // yangi so'rov yoki stop bosilgan
      try {
        markStart();
        if (blob) await playBlob(blob, onBoundary);
        else await browserFallback([segments[i]]);
      } catch (e) {
        console.warn('Audio ijro etilmadi, brauzer ovoziga qaytildi:', e);
        if (my === requestId) await browserFallback([segments[i]]);
      }
      if (my !== requestId) return;
    }
    if (onEnd) onEnd();
  })();

  return handle;
}
