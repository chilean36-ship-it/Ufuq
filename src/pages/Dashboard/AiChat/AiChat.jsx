import { lockScroll, unlockScroll } from '../../../lib/scrollLock';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import PageStyle from '../../../components/PageStyle';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { DashboardDataContext } from '../../../context/DashboardDataContext';
import aiCss from './ai-chat.css?inline';
import { askUfuqAi, AI_SYSTEM_PROMPT, TEACHER_SYSTEM_PROMPT } from './aiClient';
import { makeTr, TEACHER_AI_STRINGS } from './aiStrings';
import { getVoiceProvider, stripForSpeech, uiLangToVoiceId, voiceBcp } from './voiceAdapter';
import Markdown from './Markdown';
import VoiceMode from './VoiceMode';
import { I } from './icons';

import { loadRemoteChats, pushRemoteChat, deleteRemoteChat } from './chatSync';
const MAX_STORED = 60;   // messages kept per chat
const MAX_CHATS = 50;    // chats kept in the history

/** Title of a history entry = first thing the user wrote. */
function chatTitle(msgs) {
  const first = msgs.find((m) => m.role === 'user' && m.text);
  const t = first ? first.text.replace(/\s+/g, ' ').trim() : '';
  return t.length > 44 ? t.slice(0, 44).trimEnd() + '…' : t;
}

function isValidChat(c) {
  return c && typeof c.id === 'string' && Array.isArray(c.messages) && c.messages.length;
}

/** History grouped like ChatGPT / Claude: Today · Yesterday · Previous 7 days · Older. */
function groupChats(chats, tr) {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const day = 86400000;
  const buckets = [[tr('today'), []], [tr('yesterday'), []], [tr('week'), []], [tr('older'), []]];
  chats.forEach((c) => {
    const age = startOfDay.getTime() - (c.updatedAt || 0);
    const i = age <= 0 ? 0 : age <= day ? 1 : age <= 7 * day ? 2 : 3;
    buckets[i][1].push(c);
  });
  return buckets.filter((b) => b[1].length);
}

const TEACHER_CHIPS = [
  { icon: '📝', label: 'tchip1', prompt: 'tchip1p' },
  { icon: '❓', label: 'tchip2', prompt: 'tchip2p' },
  { icon: '💬', label: 'tchip3', prompt: 'tchip3p' },
  { icon: '📣', label: 'tchip4', prompt: 'tchip4p' },
];

const CHIPS = [
  { icon: '💬', label: 'chip1', prompt: 'chip1p' },
  { icon: '📖', label: 'chip2', prompt: 'chip2p' },
  { icon: '🧠', label: 'chip3', prompt: 'chip3p' },
  { icon: '✍️', label: 'chip4', prompt: 'chip4p' },
];

/** {role:'user'|'bot'} messages → the {role:'user'|'assistant'} history the edge function expects. */
function toHistory(msgs) {
  return msgs
    .filter((m) => m.text)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
}

function isValidStored(m) {
  return m && typeof m.id === 'number' && (m.role === 'user' || m.role === 'bot') && typeof m.text === 'string';
}

/** `suppress` removes Ufuq AI entirely (no launcher; an open chat is closed) on sections where it must not appear.
 *  `hideLauncher` is set while the group chat is on screen (the launcher would sit on its composer). */
export default function AiChat({ hideLauncher = false, suppress = false, mode = 'student', user: userProp, name: nameProp }) {
  const { lang } = useCabinetI18n();
  const dash = useContext(DashboardDataContext); // null inside the teacher/admin panels, which pass user + name instead
  const user = userProp || (dash && dash.user) || null;
  const name = nameProp || (dash && dash.name) || '';
  const isTeacher = mode === 'teacher';
  const systemPrompt = isTeacher ? TEACHER_SYSTEM_PROMPT : AI_SYSTEM_PROMPT;
  const chips = isTeacher ? TEACHER_CHIPS : CHIPS;
  const tr = useMemo(() => makeTr(lang, isTeacher ? TEACHER_AI_STRINGS : null), [lang, isTeacher]);
  const uid = user && user.id;
  const firstName = ((name || '').trim().split(/\s+/)[0]) || '';
  const uiVoiceBcp = voiceBcp(uiLangToVoiceId(lang));

  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [messages, setMessages] = useState([]); // [{ id, role: 'user' | 'bot', text, offline? }]
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);
  const [dictating, setDictating] = useState(false);
  const [chats, setChats] = useState([]);       // saved history, newest first
  const [activeId, setActiveId] = useState(null); // null = a fresh, still-empty chat
  const [sideOpen, setSideOpen] = useState(false); // history drawer (compact / phone)
  const [toast, setToast] = useState('');

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const voiceOpenRef = useRef(false);
  voiceOpenRef.current = voiceOpen;
  const idRef = useRef(0);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const speakRef = useRef(null);
  const dictRef = useRef(null);
  const dictBaseRef = useRef('');
  const toastTimer = useRef(null);
  const activeRef = useRef(null);
  const chatsRef = useRef([]);
  chatsRef.current = chats;
  const stickRef = useRef(true); // keep following new messages only while the reader is at the bottom

  const nextId = () => { idRef.current += 1; return idRef.current; };
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3600);
  }, []);

  /* ---------- chat history (per account, on this device) ----------
     Every visit and every opening of the widget starts a NEW chat; older chats stay in the history list. */
  const storeKey = uid ? 'ufuq-ai-chats:v2:' + (isTeacher ? 't:' : '') + uid : null;
  useEffect(() => {
    if (!storeKey) return;
    let list = [];
    try {
      const raw = localStorage.getItem(storeKey);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) list = arr.filter(isValidChat);
      if (!list.length) { // one-time import of the single conversation the old version kept
        const old = localStorage.getItem('ufuq-ai-chat:v1:' + (isTeacher ? 't:' : '') + uid);
        const msgs = old ? JSON.parse(old).filter(isValidStored) : [];
        if (msgs.length) list = [{ id: 'c' + Date.now(), title: chatTitle(msgs), updatedAt: Date.now(), messages: msgs }];
      }
    } catch (e) { /* storage blocked or corrupt — start with an empty history */ }
    list.forEach((c) => c.messages.forEach((m) => { if (m.id > idRef.current) idRef.current = m.id; }));
    setChats(list);

    // Then pull the account's history from the server (other devices) and merge — the newer copy of a chat wins.
    let cancelled = false;
    loadRemoteChats(uid, isTeacher ? 'teacher' : 'student').then((remote) => {
      if (cancelled || !remote.length) return;
      const byId = new Map(chatsRef.current.map((c) => [c.id, c]));
      remote.filter(isValidChat).forEach((r) => { const l = byId.get(r.id); if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) byId.set(r.id, r); });
      const merged = [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, MAX_CHATS);
      merged.forEach((c) => c.messages.forEach((m) => { if (m.id > idRef.current) idRef.current = m.id; }));
      chatsRef.current = merged;
      setChats(merged);
      try { localStorage.setItem(storeKey, JSON.stringify(merged)); } catch (e) { /* quota */ }
    });
    return () => { cancelled = true; };
  }, [storeKey, isTeacher, uid]);

  // Debounced upload of the active chat so the history follows the account.
  const pushTimer = useRef(null);
  const queuePush = useCallback((entry) => {
    if (!uid) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushRemoteChat(uid, isTeacher ? 'teacher' : 'student', entry), 900);
  }, [uid, isTeacher]);

  // Save the active conversation into the history whenever it changes.
  useEffect(() => {
    if (!messages.length) return;
    if (!activeRef.current) { activeRef.current = 'c' + Date.now(); setActiveId(activeRef.current); }
    const id = activeRef.current;
    const cur = chatsRef.current.find((c) => c.id === id);
    const last = messages[messages.length - 1];
    if (cur && cur.messages.length === messages.length && cur.messages[cur.messages.length - 1].id === last.id) return; // just opened, nothing new
    const entry = { id, title: chatTitle(messages), updatedAt: Date.now(), messages: messages.slice(-MAX_STORED) };
    const next = [entry, ...chatsRef.current.filter((c) => c.id !== id)].slice(0, MAX_CHATS);
    chatsRef.current = next;
    setChats(next);
    if (storeKey) { try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch (e) { /* quota / blocked */ } }
    queuePush(entry);
  }, [messages, storeKey, queuePush]);

  /* ---------- open / close ---------- */
  const focusInput = useCallback(() => { setTimeout(() => taRef.current && taRef.current.focus({ preventScroll: true }), 60); }, []);
  

  const stopSpeaking = useCallback(() => {
    if (speakRef.current) { speakRef.current.cancel(); speakRef.current = null; }
    setSpeakingId(null);
  }, []);
  const stopDictation = useCallback(() => {
    if (dictRef.current) { dictRef.current.abort(); dictRef.current = null; }
    setDictating(false);
  }, []);
  const closeChat = useCallback(() => {
    stopSpeaking(); stopDictation();
    setVoiceOpen(false);
    setSideOpen(false);
    setOpen(false);
    setFull(false);
    try { window.dispatchEvent(new Event('ufuq-ai-closed')); } catch (e) { /* ignore */ }
  }, [stopSpeaking, stopDictation]);

  useEffect(() => { if (suppress && open) closeChat(); }, [suppress, open, closeChat]);

  // Esc: leave full screen first, then close.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || voiceOpenRef.current) return;
      if (sideOpen) setSideOpen(false); else if (full) setFull(false); else closeChat();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, full, sideOpen, closeChat]);

  // On phones (and full screen) the page behind must not scroll.
  useEffect(() => {
    if (!open) return undefined;
    const narrow = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    if (!narrow && !full) return undefined;
    lockScroll();
    return unlockScroll;
  }, [open, full]);

  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
    if (speakRef.current) speakRef.current.cancel();
    if (dictRef.current) dictRef.current.abort();
    clearTimeout(toastTimer.current);
  }, []);

  /* ---------- scrolling ---------- */
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };
  useEffect(() => {
    if (!open) return;
    const last = messages[messages.length - 1];
    if (stickRef.current || (last && last.role === 'user')) scrollToBottom(true);
  }, [messages, typing, open, scrollToBottom]);
  useEffect(() => { if (open) { stickRef.current = true; setTimeout(() => scrollToBottom(false), 30); } }, [open, scrollToBottom]);

  // Textarea grows with its content (max ~6 lines).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (!input) { ta.style.height = ''; return; }
    ta.style.height = 'auto';                               // measure, then clamp (border-box: scrollHeight already includes padding)
    ta.style.height = Math.min(Math.max(ta.scrollHeight, 40), 176) + 'px';
  }, [input, open, full]);

  /* ---------- asking ---------- */
  const runAsk = useCallback(async (base, text) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setTyping(true);
    stickRef.current = true;
    const { reply, offline, aborted } = await askUfuqAi({ text, history: toHistory(base), signal: ctrl.signal, systemPrompt });
    if (aborted || ctrl.signal.aborted) return;
    abortRef.current = null;
    setTyping(false);
    setMessages((m) => [...m, { id: nextId(), role: 'bot', text: reply, offline }]);
    focusInput();
  }, [focusInput]);

  const send = useCallback((override) => {
    const text = (typeof override === 'string' ? override : input).trim();
    if (!text || typing) return;
    stopSpeaking(); stopDictation();
    const base = [...messagesRef.current, { id: nextId(), role: 'user', text }];
    setMessages(base);
    setInput('');
    runAsk(base, text);
  }, [input, typing, runAsk, stopSpeaking, stopDictation]);

  const regenerate = useCallback(() => {
    if (typing) return;
    const msgs = messagesRef.current;
    let end = msgs.length;
    while (end > 0 && msgs[end - 1].role === 'bot') end -= 1;
    const base = msgs.slice(0, end);
    const last = base[base.length - 1];
    if (!last || last.role !== 'user') return;
    stopSpeaking();
    setMessages(base);
    runAsk(base, last.text);
  }, [typing, runAsk, stopSpeaking]);

  const resetChat = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    stopSpeaking(); stopDictation();
    activeRef.current = null;
    setActiveId(null);
    setTyping(false);
    setMessages([]);
    setInput('');
  }, [stopSpeaking, stopDictation]);

  const newChat = useCallback(() => { resetChat(); setSideOpen(false); focusInput(); }, [resetChat, focusInput]);

  const openChat = useCallback(() => { resetChat(); setOpen(true); focusInput(); }, [resetChat, focusInput]);

  // Other parts of the page (e.g. the teacher/admin top bar) can open the chat with window.dispatchEvent(new Event('ufuq-ai-open')).
  useEffect(() => {
    const onOpen = () => { if (!suppress) openChat(); };
    window.addEventListener('ufuq-ai-open', onOpen);
    return () => window.removeEventListener('ufuq-ai-open', onOpen);
  }, [openChat, suppress]);

  const selectChat = useCallback((id) => {
    const c = chatsRef.current.find((x) => x.id === id);
    if (!c) return;
    resetChat();
    activeRef.current = id;
    setActiveId(id);
    setMessages(c.messages);
    setSideOpen(false);
    stickRef.current = true;
  }, [resetChat]);

  const deleteChat = useCallback((id) => {
    const next = chatsRef.current.filter((c) => c.id !== id);
    chatsRef.current = next;
    setChats(next);
    if (storeKey) { try { if (next.length) localStorage.setItem(storeKey, JSON.stringify(next)); else localStorage.removeItem(storeKey); } catch (e) { /* ignore */ } }
    if (uid) deleteRemoteChat(uid, isTeacher ? 'teacher' : 'student', id);
    if (activeRef.current === id) resetChat();
  }, [storeKey, resetChat, uid, isTeacher]);

  /* ---------- per-message actions ---------- */
  const copyMsg = async (m) => {
    try {
      await navigator.clipboard.writeText(m.text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = m.text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (err) { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopiedId(m.id);
    setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1600);
  };

  const speakMsg = (m) => {
    if (speakingId === m.id) { stopSpeaking(); return; }
    stopSpeaking();
    const prov = getVoiceProvider();
    if (!prov.support().tts) { showToast(tr('vUnsupported')); return; }
    setSpeakingId(m.id);
    speakRef.current = prov.speak(stripForSpeech(m.text), {
      lang: uiVoiceBcp,
      onEnd: () => { setSpeakingId((cur) => (cur === m.id ? null : cur)); },
    });
  };

  /* ---------- dictation (mic inside the composer) ---------- */
  const toggleDictation = () => {
    if (dictRef.current) { dictRef.current.stop(); return; }
    const prov = getVoiceProvider();
    if (!prov.support().stt) { showToast(tr('vUnsupported')); return; }
    stopSpeaking();
    dictBaseRef.current = input ? input.replace(/\s*$/, ' ') : '';
    setDictating(true);
    let failed = null;
    dictRef.current = prov.listen({
      lang: uiVoiceBcp,
      onInterim: (txt) => setInput(dictBaseRef.current + txt),
      onError: (code) => { failed = code; },
      onDone: (txt) => {
        dictRef.current = null;
        setDictating(false);
        if (txt) setInput(dictBaseRef.current + txt);
        if (failed === 'not-allowed' || failed === 'service-not-allowed' || failed === 'audio-capture') showToast(tr('vDenied'));
        else if (failed === 'network') showToast(tr('vNetwork'));
        focusInput();
      },
    });
  };

  /* ---------- live voice ---------- */
  const openVoice = () => { stopSpeaking(); stopDictation(); setVoiceOpen(true); };
  const closeVoice = useCallback(() => { setVoiceOpen(false); focusInput(); }, [focusInput]);
  const getHistory = useCallback(() => toHistory(messagesRef.current), []);
  const onVoiceTurn = useCallback((userText, botText, offline) => {
    const add = [{ id: nextId(), role: 'user', text: userText }, { id: nextId(), role: 'bot', text: botText, offline }];
    messagesRef.current = [...messagesRef.current, ...add]; // visible to the very next voice turn immediately
    setMessages((m) => [...m, ...add]);
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  const hasText = input.trim().length > 0;
  const lastBotId = (() => { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'bot') return messages[i].id; return null; })();
  const greet = firstName ? tr('greetBase') + tr('greetSep') + firstName : tr('greetBase');

  return (
    <>
      <PageStyle css={aiCss} />

      {!suppress && <button type="button" className={'ai-fab uai-fab' + (open ? ' hidden' : '') + (hideLauncher ? ' gc-chat-open' : '')}
              id="aiFab" aria-label="Ufuq AI" onClick={openChat}>
        <span className="uai-fab-icon">{I.logo}</span>
        <span className="uai-fab-text">Ufuq AI</span>
      </button>}

      <div className={'uai-panel' + (open && !suppress ? ' open' : '') + (full ? ' full' : '')} id="aiChatPanel" role="dialog" aria-label="Ufuq AI" aria-hidden={open ? 'false' : 'true'}>
        <aside className={'uai-side' + (sideOpen ? ' open' : '')} aria-label={tr('history')}>
          <div className="uai-side-brand">
            <span className="uai-logo">{I.logo}</span>
            <div className="uai-brand-text">
              <b>Ufuq AI</b>
              <small>{tr('subtitle')}</small>
            </div>
          </div>
          <button type="button" className="uai-side-new" onClick={newChat}>{I.plus}<span>{tr('newChat')}</span></button>
          <div className="uai-side-title">{tr('history')}</div>
          <div className="uai-side-list">
            {chats.length === 0 && <p className="uai-side-empty">{tr('noHistory')}</p>}
            {groupChats(chats, tr).map(([label, items]) => (
              <div className="uai-side-group" key={label}>
                <div className="uai-side-label">{label}</div>
                {items.map((c) => (
                  <div key={c.id} className={'uai-side-item' + (c.id === activeId ? ' active' : '')}>
                    <button type="button" className="uai-side-pick" onClick={() => selectChat(c.id)} title={c.title}>
                      <span dir="auto">{c.title || tr('untitled')}</span>
                    </button>
                    <button type="button" className="uai-side-del" onClick={() => deleteChat(c.id)} aria-label={tr('delChat')} title={tr('delChat')}>{I.trash}</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
        <div className={'uai-side-scrim' + (sideOpen ? ' show' : '')} onClick={() => setSideOpen(false)} />

        <div className="uai-main">
        <header className="uai-head">
          <button type="button" className="uai-ibtn uai-hist-btn" onClick={() => setSideOpen((v) => !v)} aria-label={tr('openHistory')} title={tr('openHistory')}>{I.history}</button>
          <div className="uai-brand">
            <span className="uai-logo uai-head-logo">{I.logo}</span>
            <div className="uai-brand-text">
              <b>Ufuq AI</b>
              <small className="uai-head-sub">{tr('subtitle')}</small>
            </div>
          </div>
          <div className="uai-head-title" dir="auto">{chatTitle(messages) || tr('untitled')}</div>
          <div className="uai-head-actions">
            <button type="button" className="uai-ibtn" onClick={newChat} aria-label={tr('newChat')} title={tr('newChat')}>{I.newChat}</button>
            <button type="button" className="uai-ibtn uai-hide-sm" id="aiChatExpand" onClick={() => { setFull((f) => !f); focusInput(); }}
                    aria-label={full ? tr('collapse') : tr('expand')} title={full ? tr('collapse') : tr('expand')}>{full ? I.collapse : I.expand}</button>
            <button type="button" className="uai-ibtn" id="aiChatClose" onClick={closeChat} aria-label={tr('close')} title={tr('close')}>{I.close}</button>
          </div>
        </header>

        <div className="uai-scroll" ref={scrollRef} onScroll={onScroll} id="aiChatBody">
          <div className="uai-thread">
            {messages.length === 0 && !typing && (
              <div className="uai-empty" id="aiEmptyState">
                <span className="uai-logo xl">{I.logo}</span>
                <h2 className="uai-greet"><span>{greet}</span></h2>
                <p className="uai-greet-sub">{tr('greetSub')}</p>
                <div className="uai-chips">
                  {chips.map((c) => (
                    <button type="button" key={c.label} className="uai-chip" onClick={() => send(tr(c.prompt))}>
                      <span className="uai-chip-ic" aria-hidden="true">{c.icon}</span>
                      <span>{tr(c.label)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              m.role === 'user' ? (
                <div key={m.id} className="uai-msg user"><div className="uai-bubble" dir="auto">{m.text}</div></div>
              ) : (
                <div key={m.id} className="uai-msg bot">
                  <span className="uai-logo xs">{I.logo}</span>
                  <div className="uai-bot-body">
                    <Markdown text={m.text} />
                    {m.offline ? <div className="uai-offline">{tr('offlineNote')}</div> : null}
                    <div className="uai-actions">
                      <button type="button" className="uai-act" onClick={() => copyMsg(m)} aria-label={tr('copy')} title={copiedId === m.id ? tr('copied') : tr('copy')}>{copiedId === m.id ? I.check : I.copy}</button>
                      <button type="button" className={'uai-act' + (speakingId === m.id ? ' on' : '')} onClick={() => speakMsg(m)} aria-label={speakingId === m.id ? tr('stopListen') : tr('listen')} title={speakingId === m.id ? tr('stopListen') : tr('listen')}>{speakingId === m.id ? I.stop : I.speaker}</button>
                      {m.id === lastBotId && !typing ? (
                        <button type="button" className="uai-act" onClick={regenerate} aria-label={tr('retry')} title={tr('retry')}>{I.retry}</button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            ))}

            {typing && (
              <div className="uai-msg bot" id="aiTypingIndicator">
                <span className="uai-logo xs spin">{I.logo}</span>
                <div className="uai-bot-body"><div className="uai-skel"><i /><i /><i /></div></div>
              </div>
            )}
          </div>
        </div>

        {toast ? <div className="uai-toast" role="status" aria-live="polite">{toast}</div> : null}

        <footer className="uai-composer">
          <div className={'uai-box' + (dictating ? ' dictating' : '')}>
            <textarea ref={taRef} className="uai-input" id="aiChatInput" rows={1} value={input} dir="auto"
                      placeholder={dictating ? tr('vListening') : tr('placeholder')} autoComplete="off" enterKeyHint="send"
                      onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} />
            <div className="uai-box-actions">
              <button type="button" className={'uai-ibtn' + (dictating ? ' rec' : '')} onClick={toggleDictation}
                      aria-pressed={dictating} aria-label={dictating ? tr('dictateStop') : tr('dictate')} title={dictating ? tr('dictateStop') : tr('dictate')}>{I.mic}</button>
              {hasText ? (
                <button type="button" className="uai-send" id="aiChatSend" onClick={() => send()} disabled={typing} aria-label={tr('send')} title={tr('send')}>{I.send}</button>
              ) : (
                <button type="button" className="uai-live" onClick={openVoice} aria-label={tr('live')} title={tr('live')}>{I.wave}<span>{tr('live')}</span></button>
              )}
            </div>
          </div>
          <p className="uai-disclaimer">{tr('disclaimer')}</p>
        </footer>
        </div>
      </div>

      {voiceOpen && (
        <VoiceMode uiLang={lang} tr={tr} getHistory={getHistory} onTurn={onVoiceTurn} onClose={closeVoice} systemPrompt={systemPrompt} />
      )}
    </>
  );
}
