// Continuous, streaming speech-to-text from the browser's built-in recogniser (Web Speech API) — free, no server.
// Used by the live Hifz Mushaf page to fill in the words while the student is still reciting.
//
// Chrome / Edge / Samsung Internet / Safari expose it (Firefox does not). Chrome sends the audio to Google for recognition.
// The engine stops by itself after a few seconds of silence, so this wrapper restarts it until stop() is called and keeps
// the text of the earlier engine sessions, so the caller always receives ONE growing transcript.
//
// To switch to a server engine later (e.g. the Quran-tuned Whisper in asr-space/), keep this same shape:
//   const h = startLiveStt({ lang, onText, onState, onError }); h.stop(); h.abort();

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const liveSttSupported = () => !!SR;

/**
 * @param {object} o
 * @param {string} [o.lang]        BCP-47, default 'ar-SA'
 * @param {(t:{text:string, interim:string})=>void} o.onText  text = everything recognised so far (final + interim), interim = the unfinished tail
 * @param {(s:'listening'|'idle')=>void} [o.onState]
 * @param {(code:string)=>void} [o.onError]   'not-allowed' | 'audio-capture' | 'network' | 'unsupported' | 'service-not-allowed'
 */
export function startLiveStt({ lang = 'ar-SA', onText, onState, onError, idleMs = 180000 }) {
  if (!SR) { if (onError) onError('unsupported'); return { stop() {}, abort() {} }; }

  let active = true;
  let committed = '';       // text of engine sessions that already ended
  let rec = null;
  let timer = null;
  let quickRestarts = 0;    // guards against a restart loop when the engine fails immediately
  let lastStart = 0;
  let lastActivity = Date.now(); // the microphone stays on through long pauses; it stops by itself only after `idleMs` with nothing said
  let idleTimer = setInterval(() => {
    if (active && Date.now() - lastActivity > idleMs) { active = false; if (onError) onError('idle'); try { if (rec) rec.stop(); } catch (e) { /* ignore */ } }
  }, 5000);

  const emit = (live, interim) => {
    const text = (committed + ' ' + live).replace(/\s+/g, ' ').trim();
    if (onText) onText({ text, interim: interim || '' });
  };

  function run() {
    if (!active) return;
    rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let live = '';          // everything this engine session has produced (final + interim)
    lastStart = Date.now();

    rec.onstart = () => { if (onState) onState('listening'); };
    rec.onresult = (e) => {
      // Some Android versions of Chrome repeat the growing phrase in every result ("الحمد", "الحمد لله", "الحمد لله رب"):
      // a result that starts with the previous one replaces it, otherwise every word would be counted several times.
      const parts = [];
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const tx = String(r[0].transcript || '').trim();
        if (!tx) continue;
        while (parts.length && tx.startsWith(parts[parts.length - 1].tx)) parts.pop();
        parts.push({ tx, fin: r.isFinal });
      }
      parts.forEach((x) => { if (!x.fin) interim += x.tx + ' '; });
      live = parts.map((x) => x.tx).join(' ').trim();
      lastActivity = Date.now();
      emit(live, interim.trim());
    };
    rec.onerror = (e) => {
      const code = e && e.error;
      if (code === 'no-speech' || code === 'aborted') return;              // normal: engine timed out waiting for speech
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture' || code === 'language-not-supported') {
        active = false; if (onError) onError(code === 'language-not-supported' ? 'unsupported' : code); return;
      }
      if (code === 'network') { active = false; if (onError) onError('network'); }
    };
    rec.onend = () => {
      committed = (committed + ' ' + live).trim();
      live = '';
      if (!active) { clearInterval(idleTimer); if (onState) onState('idle'); return; }
      quickRestarts = Date.now() - lastStart < 1500 ? quickRestarts + 1 : 0;
      if (quickRestarts > 25) { active = false; clearInterval(idleTimer); if (onError) onError('network'); if (onState) onState('idle'); return; }
      timer = setTimeout(run, 40 + Math.min(quickRestarts, 10) * 60); // restart at once (words said while the engine is down are lost); back off only if it keeps failing
    };
    try { rec.start(); } catch (err) { /* start() throws if already started; onend will retry */ }
  }

  run();

  return {
    stop() { active = false; clearInterval(idleTimer); clearTimeout(timer); try { if (rec) rec.stop(); } catch (e) { /* ignore */ } },
    abort() { active = false; clearInterval(idleTimer); clearTimeout(timer); onText = null; onState = null; onError = null; try { if (rec) rec.abort(); } catch (e) { /* ignore */ } },
  };
}
