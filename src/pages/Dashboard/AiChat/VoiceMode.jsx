import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { askUfuqAi } from './aiClient';
import {
  VOICE_LANGS, getVoiceProvider, readSavedVoiceLang, saveVoiceLang, stripForSpeech, voiceBcp, voiceLabel,
} from './voiceAdapter';
import { I } from './icons';
import { releaseMic, watchVoice } from '../../../lib/serverStt';
import { stopSpeaking } from '../../../lib/speak';

const MAX_SILENT_ROUNDS = 3; // after this many empty listening rounds we wait for a tap instead of looping forever

/**
 * "Live" voice conversation (live voice): the orb listens → thinks → speaks → listens again.
 * Tap the orb to interrupt. Speech engine = voice provider (voiceAdapter.js), answers = askUfuqAi().
 * Every finished turn is handed to `onTurn` so the transcript also lands in the normal chat.
 */
// Remembers (per day, in this browser) that the live-speaking allowance was used up, so the screen does not even start listening.
const LIMIT_KEY = 'ufuq-ai-voice-limit-day';

export default function VoiceMode({ uiLang, tr, getHistory, onTurn, onClose, systemPrompt }) {
  const [phase, setPhase] = useState('idle'); // idle | listening | thinking | speaking
  const [userText, setUserText] = useState('');
  const [botText, setBotText] = useState('');
  const [muted, setMuted] = useState(false);
  const [problem, setProblem] = useState(null); // unsupported | denied | network | lang
  const [notice, setNotice] = useState('');
  const [vlang, setVlang] = useState(() => readSavedVoiceLang(uiLang));

  const phaseRef = useRef('idle');
  const aliveRef = useRef(true);
  const mutedRef = useRef(false);
  const vlangRef = useRef(vlang);
  const listenRef = useRef(null);
  const speakRef = useRef(null);
  const abortRef = useRef(null);
  const tokenRef = useRef(0);
  const errRef = useRef(null);
  const limitRef = useRef(false);
  const watchRef = useRef(null);   // barge-in watcher while the assistant speaks
  const silenceRef = useRef(0);
  const bumpRef = useRef(0);
  const orbRef = useRef(null);
  const endBtnRef = useRef(null);
  const api = useRef({});

  const setPhaseBoth = (p) => { phaseRef.current = p; setPhase(p); };

  const killListen = () => {
    tokenRef.current += 1; // any late callback from the old session is ignored
    if (listenRef.current) { listenRef.current.abort(); listenRef.current = null; }
  };
  const killSpeech = () => {
    if (watchRef.current) { watchRef.current.stop(); watchRef.current = null; }   // stop watching for barge-in
    if (speakRef.current) { speakRef.current.cancel(); speakRef.current = null; }
    stopSpeaking();   // always silence every audio source (the handle alone can miss a clip that is loading)
  };
  const killRequest = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
  };

  api.current.startListening = (opts) => {
    if (!aliveRef.current || mutedRef.current || limitRef.current) return;
    const prov = getVoiceProvider();
    if (!prov.support().stt) { setProblem('unsupported'); setPhaseBoth('idle'); return; }
    killSpeech();
    killListen();
    setProblem(null);
    setNotice('');
    setUserText('');
    errRef.current = null;
    setPhaseBoth('listening');
    const token = tokenRef.current;
    listenRef.current = prov.listen({
      lang: voiceBcp(vlangRef.current),
      endSilenceMs: 650,                         // quick turn-taking, like a call
      preheard: !!(opts && opts.bargeIn),        // the person interrupted: they are already talking
      onInterim: (txt) => { if (token === tokenRef.current) { bumpRef.current = 1; setUserText(txt); } },
      onLevel: (lv) => { if (token === tokenRef.current && lv > 0.15) bumpRef.current = 1; },
      onError: (code) => { if (token === tokenRef.current) errRef.current = code; },
      onDone: (text) => {
        if (token !== tokenRef.current || !aliveRef.current) return;
        listenRef.current = null;
        const err = errRef.current;
        errRef.current = null;
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') { setProblem('denied'); setPhaseBoth('idle'); return; }
        if (err === 'language-not-supported') { setProblem('lang'); setPhaseBoth('idle'); return; }
        if (err === 'network') { setProblem('network'); setPhaseBoth('idle'); return; }
        if (err === 'unsupported') { setProblem('unsupported'); setPhaseBoth('idle'); return; }
        if (text) { silenceRef.current = 0; api.current.handleUser(text); return; }
        silenceRef.current += 1;
        if (silenceRef.current >= MAX_SILENT_ROUNDS) { setPhaseBoth('idle'); return; } // went quiet — wait for a tap
        setTimeout(() => {
          if (aliveRef.current && !mutedRef.current && phaseRef.current === 'listening') api.current.startListening();
        }, 120);
      },
    });
  };

  api.current.handleUser = async (text) => {
    setUserText(text);
    setBotText('');
    setPhaseBoth('thinking');
    killRequest();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const history = [...getHistory(), { role: 'user', content: text }];
    const { reply, offline, aborted, voiceLimit, voiceSlow } = await askUfuqAi({ text, history, voice: true, signal: ctrl.signal, systemPrompt });
    if (!aliveRef.current || aborted || ctrl.signal.aborted) return;   // muting only turns the microphone off: the answer still comes
    abortRef.current = null;
    if (voiceLimit) { api.current.endForLimit(); return; }   // today's live allowance is used up: the live conversation ends here, nothing is spoken
    if (voiceSlow) {   // too many turns in a minute: say so in text, then listen again
      setNotice(tr('vSlow')); setPhaseBoth('idle');
      setTimeout(() => { if (aliveRef.current && !mutedRef.current && !limitRef.current) api.current.startListening(); }, 4000);
      return;
    }
    onTurn(text, reply, offline);
    setBotText(reply);
    api.current.speakReply(reply);
  };

  // The daily live-speaking limit is reached: stop microphone and speech for good (until tomorrow) and say so, in the screen language.
  api.current.endForLimit = () => {
    limitRef.current = true;
    try { localStorage.setItem(LIMIT_KEY, new Date().toISOString().slice(0, 10)); } catch (e) { /* ignore */ }
    killListen(); killSpeech(); killRequest(); stopSpeaking(); releaseMic();
    setProblem('limit');
    setNotice('');
    setPhaseBoth('idle');
  };

  api.current.speakReply = (reply) => {
    if (!aliveRef.current) return;
    const prov = getVoiceProvider();
    const bcp = voiceBcp(vlangRef.current);
    const spoken = stripForSpeech(reply);
    setPhaseBoth('speaking');
    const done = () => {
      if (!aliveRef.current) return;
      speakRef.current = null;
      if (phaseRef.current === 'speaking' && !mutedRef.current) api.current.startListening();
    };
    // No usable voice (e.g. Uzbek on many devices): show the answer as text and keep the conversation going.
    if (!spoken || !prov.support().tts || !prov.hasVoice(bcp)) {
      if (spoken) setNotice(tr('vNoVoice', { lang: voiceLabel(vlangRef.current) }));
      const id = setTimeout(done, Math.min(9000, 1400 + spoken.length * 45));
      speakRef.current = { cancel: () => clearTimeout(id) };
      return;
    }
    speakRef.current = prov.speak(spoken, { lang: bcp, onBoundary: () => { bumpRef.current = 1; }, onEnd: done });
    // Barge-in: if the person starts talking over the answer, stop it at once and listen (not while muted).
    setTimeout(() => {
      if (!aliveRef.current || mutedRef.current || phaseRef.current !== 'speaking' || watchRef.current) return;
      watchRef.current = watchVoice({ onVoice: () => {
        watchRef.current = null;
        if (aliveRef.current && !mutedRef.current && phaseRef.current === 'speaking') { killSpeech(); api.current.startListening({ bargeIn: true }); }
      } });
    }, 700);
  };

  const onOrb = () => {
    if (limitRef.current) return;   // limit reached: the orb stays quiet
    const p = phaseRef.current;
    if (p === 'speaking') { killSpeech(); api.current.startListening(); return; }
    if (p === 'thinking') { killRequest(); api.current.startListening(); return; }
    if (p === 'listening') { if (listenRef.current) listenRef.current.stop(); return; }
    if (mutedRef.current) { toggleMute(); return; }
    silenceRef.current = 0;
    api.current.startListening();
  };

  // Mute = only MY microphone is off. The assistant keeps thinking / speaking and finishes its answer (like a call);
  // it just does not start listening again until the microphone is back on.
  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      killListen();
      if (watchRef.current) { watchRef.current.stop(); watchRef.current = null; }
      if (phaseRef.current === 'listening') setPhaseBoth('idle');
    } else {
      silenceRef.current = 0;
      if (limitRef.current) return;
      if (phaseRef.current === 'idle' || phaseRef.current === 'listening') api.current.startListening();   // speaking / thinking: it listens when the answer ends
    }
  };

  const changeLang = (id) => {
    if (id === vlangRef.current) return;
    vlangRef.current = id;
    setVlang(id);
    saveVoiceLang(id);
    setNotice('');
    setProblem(null);
    if (phaseRef.current === 'listening') api.current.startListening(); // restart the recogniser in the new language
  };

  // Start / tear down.
  useEffect(() => {
    aliveRef.current = true;
    let usedToday = false;
    try { usedToday = localStorage.getItem(LIMIT_KEY) === new Date().toISOString().slice(0, 10); } catch (e) { /* ignore */ }
    if (usedToday) { limitRef.current = true; setProblem('limit'); }   // already ended earlier today (the server also enforces it)
    const id = setTimeout(() => api.current.startListening(), 350);
    if (endBtnRef.current) endBtnRef.current.focus({ preventScroll: true });
    return () => {
      aliveRef.current = false;
      clearTimeout(id);
      killListen();
      killSpeech();
      killRequest();
      releaseMic();   // leaving the voice screen turns the microphone off at once
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Orb animation: real microphone level on desktop, simulated motion elsewhere (mobile browsers can't
  // share the mic between the level meter and speech recognition reliably).
  useEffect(() => {
    let raf = 0;
    let stream = null;
    let ctx = null;
    let analyser = null;
    let data = null;
    let cancelled = false;
    let cur = 0;
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));
    (async () => {
      if (mobile || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        data = new Uint8Array(analyser.fftSize);
      } catch (e) { /* the recogniser reports a blocked mic itself */ }
    })();
    const t0 = performance.now();
    const loop = (now) => {
      const t = (now - t0) / 1000;
      const p = phaseRef.current;
      let target;
      if (p === 'listening') {
        if (analyser) {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
          target = Math.min(1, 0.06 + Math.sqrt(sum / data.length) * 4.2);
        } else {
          bumpRef.current *= 0.9;
          target = 0.1 + bumpRef.current * 0.55 + 0.04 * Math.sin(t * 3);
        }
      } else if (p === 'speaking') {
        bumpRef.current *= 0.88;
        target = 0.26 + 0.24 * Math.abs(Math.sin(t * 6.3)) + bumpRef.current * 0.28;
      } else if (p === 'thinking') {
        target = 0.12 + 0.06 * Math.sin(t * 4);
      } else {
        target = 0.03 + 0.02 * Math.sin(t * 1.4);
      }
      cur += (target - cur) * 0.22;
      if (orbRef.current) orbRef.current.style.setProperty('--lvl', cur.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (ctx && ctx.close) ctx.close().catch(() => {});
    };
  }, []);

  const statusText = muted ? tr('vMuted')
    : phase === 'listening' ? tr('vListening')
      : phase === 'thinking' ? tr('vThinking')
        : phase === 'speaking' ? tr('vSpeaking')
          : tr('vIdle');
  const problemText = problem === 'unsupported' ? tr('vUnsupported')
    : problem === 'denied' ? tr('vDenied')
      : problem === 'network' ? tr('vNetwork')
        : problem === 'lang' ? tr('vLangBad')
          : problem === 'limit' ? tr('vLimit') : '';

  return createPortal(
    <div className="uai-voice" role="dialog" aria-modal="true" aria-label="Ufuq AI Live">
      <div className="uai-voice-top">
        <div className="uai-voice-brand">
          <span className="uai-logo sm">{I.logo}</span>
          <span>Ufuq AI</span>
          <em>{tr('live')}</em>
        </div>
        <button type="button" className="uai-ibtn" onClick={onClose} aria-label={tr('back')} title={tr('back')}>{I.close}</button>
      </div>

      <div className="uai-voice-stage">
        <button type="button" ref={orbRef} className={'uai-orb ph-' + phase} onClick={onOrb} aria-label={statusText}>
          <span className="uai-orb-glow" />
          <span className="uai-orb-blob b1" />
          <span className="uai-orb-blob b2" />
          <span className="uai-orb-blob b3" />
          <span className="uai-orb-blob b4" />
          <span className="uai-orb-core" />
        </button>

        <div className={'uai-voice-status' + (phase !== 'idle' ? ' live' : '')} aria-live="polite">{statusText}</div>

        <div className="uai-voice-caps">
          <p className="uai-cap-user" dir="auto">{userText}</p>
          <p className="uai-cap-bot" dir="auto">{botText}</p>
        </div>

        {(problem || notice) && (
          <div className={'uai-voice-note' + (problem ? ' err' : '')} role="status">
            {problem ? problemText : notice}
            {problem && problem !== 'unsupported' ? <small>{tr('vTry')}</small> : null}
          </div>
        )}
      </div>

      <div className="uai-voice-foot">
        <div className="uai-vlangs" role="group" aria-label={tr('vLang')}>
          {VOICE_LANGS.map((l) => (
            <button type="button" key={l.id} className={'uai-vlang' + (vlang === l.id ? ' on' : '')} aria-pressed={vlang === l.id} onClick={() => changeLang(l.id)}>{l.label}</button>
          ))}
        </div>
        <div className="uai-vctrl">
          <button type="button" className={'uai-vbtn' + (muted ? ' off' : '')} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? tr('unmute') : tr('mute')} title={muted ? tr('unmute') : tr('mute')}>
            {muted ? I.micOff : I.mic}
          </button>
          <button type="button" ref={endBtnRef} className="uai-vbtn end" onClick={onClose} aria-label={tr('end')} title={tr('end')}>{I.endCall}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
