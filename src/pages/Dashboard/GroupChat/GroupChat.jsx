import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { scrollWithin } from '../../../hooks/useScrollTop';
import PageStyle from '../../../components/PageStyle';
import chatCss from './chat.css?inline';
import voiceCss from './voice-bubble.css?inline';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { GC_EMOJI_GROUPS, gcCopyText as copyText, gcFormatDaySeparator, gcFormatDuration, gcFormatTime, gcHexToRgba, gcSenderColor } from './chatUtils';
import { Svg, IconSearch, IconClose, IconSmile, IconChevronDown, QUICK_REACTIONS, MENU_ICONS, PreviewText, Ticks, ReactionChips, Bubble } from './chatParts';


/**
 * Full-screen group chat. State/data live in useGroupChat (owned by My Group so the unread badge works while this is
 * closed); this component is only mounted while the chat is open.
 *
 * Extras on top of the original port: live "typing…" line, jump-to-latest button with a new-message counter,
 * multi-line composer (Enter sends, Shift+Enter = new line), emoji panel, copy-text, clickable links, right-click menu,
 * double-click to reply, sent/pending ticks.
 */
export default function GroupChat({ chat, groupCode, groupName, memberCount, myId, myAvatarUrl, onBack }) {
  const { t } = useCabinetI18n();
  const { messages, canModerate, composer, firstUnreadId, typingNames, reactions, reactionsEnabled, readers, avatars = {} } = chat;
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const emojiRef = useRef(null);
  const [input, setInput] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [searchIndex, setSearchIndex] = useState(-1);
  const [searchNonce, setSearchNonce] = useState(0);
  const [menu, setMenu] = useState(null); // { id, btn }
  const [menuPos, setMenuPos] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [confirmId, setConfirmId] = useState(null); // message waiting for delete confirmation
  const [toast, setToast] = useState('');
  const [showJump, setShowJump] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const menuRef = useRef(null);
  const firstRender = useRef(true);
  const stickRef = useRef(true);   // is the reader at (or near) the bottom?
  const prevLenRef = useRef(0);
  const toastTimer = useRef(null);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  // Everybody except me, with their read position as a number — a message is "seen" once someone's position passes it.
  const otherReaders = useMemo(
    () => readers.filter((r) => r.user_id !== myId && r.last_read_at).map((r) => ({ ts: new Date(r.last_read_at).getTime(), name: r.user_name || '' })),
    [readers, myId]
  );
  const seenByFor = (m) => {
    const ts = new Date(m.created_at).getTime();
    return otherReaders.filter((r) => r.ts >= ts).map((r) => r.name || t('Student'));
  };

  const flash = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ---------- search ---------- */
  const trimmedTerm = term.trim();
  const matches = useMemo(
    () => (trimmedTerm ? messages.filter((m) => (m.content || '').toLowerCase().includes(trimmedTerm.toLowerCase())).map((m) => m.id) : []),
    [messages, trimmedTerm]
  );
  const activeIndex = matches.length ? (searchIndex < 0 || searchIndex >= matches.length ? matches.length - 1 : searchIndex) : -1; // starts at the most recent match

  const scrollToMessage = useCallback((id) => {
    const body = bodyRef.current;
    if (!body) return;
    const row = body.querySelector(`.gc-msg-row[data-msg-id="${CSS.escape(String(id))}"]`);
    if (!row) return;
    scrollWithin(body, row, 'center'); // chat body only — scrollIntoView() would also move the page
    row.classList.add('gc-search-current');
    setTimeout(() => row.classList.remove('gc-search-current'), 1200);
  }, []);

  // Jump to the active match when the term changes or the user steps — not on every incoming message.
  useEffect(() => {
    if (searchNonce && matches.length && activeIndex >= 0) scrollToMessage(matches[activeIndex]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchNonce]);

  const stepSearch = (dir) => {
    if (!matches.length) return;
    setSearchIndex((activeIndex + dir + matches.length) % matches.length);
    setSearchNonce((n) => n + 1);
  };
  const closeSearch = () => { setSearchOpen(false); setTerm(''); setSearchIndex(-1); };

  /* ---------- scrolling ---------- */
  const scrollToBottom = useCallback((smooth) => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTo({ top: body.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onBodyScroll = () => {
    const body = bodyRef.current;
    if (body) {
      const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
      stickRef.current = atBottom;
      setShowJump(!atBottom);
      if (atBottom) setNewBelow(0);
    }
    if (menu) closeMenu();
  };

  // Opening lands on the "New messages" divider; afterwards the view follows new messages ONLY while the reader is at the
  // bottom (or the message is their own) — otherwise it stays put and the jump button counts what arrived.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const prevLen = prevLenRef.current;
    prevLenRef.current = messages.length;
    if (firstRender.current) {
      firstRender.current = false;
      const sep = body.querySelector('.gc-unread-sep');
      if (sep) { scrollWithin(body, sep, 'start'); body.scrollTop = Math.max(0, body.scrollTop - 48); } else body.scrollTop = body.scrollHeight;
      stickRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
      setShowJump(!stickRef.current);
      return;
    }
    if (trimmedTerm) return;
    const last = messages[messages.length - 1];
    const grew = messages.length > prevLen;
    if (stickRef.current || (grew && last && last.sender_id === myId)) {
      body.scrollTop = body.scrollHeight;
    } else if (grew && last && last.sender_id !== myId) {
      setNewBelow((n) => n + (messages.length - prevLen));
      setShowJump(true);
    }
  }, [messages, trimmedTerm, myId]);

  useEffect(() => { if (inputRef.current) inputRef.current.focus({ preventScroll: true }); }, []);

  /* ---------- composer textarea: auto-grow ---------- */
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  /* ---------- emoji panel ---------- */
  useEffect(() => {
    if (!emojiOpen) return undefined;
    const onDown = (e) => { if (emojiRef.current && !emojiRef.current.contains(e.target)) setEmojiOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setEmojiOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [emojiOpen]);

  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    const start = el ? el.selectionStart : input.length;
    const end = el ? el.selectionEnd : input.length;
    const next = (input.slice(0, start) + emoji + input.slice(end)).slice(0, 2000);
    setInput(next);
    chat.notifyTyping();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus({ preventScroll: true });
      const pos = Math.min(start + emoji.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  };

  /* ---------- message dropdown (portal) ---------- */
  const closeMenu = useCallback(() => { setMenu(null); setMenuPos(null); }, []);
  useEffect(() => { closeMenu(); }, [messages, closeMenu]); // a re-render invalidates the anchor button
  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', closeMenu); window.removeEventListener('keydown', onKey); };
  }, [menu, closeMenu]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const btnRect = menu.btn.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const margin = 8;
    let top = btnRect.bottom + 6;
    if (top + menuRect.height > window.innerHeight - margin) top = btnRect.top - menuRect.height - 6;
    top = Math.max(margin, Math.min(top, window.innerHeight - menuRect.height - margin));
    let left = btnRect.right - menuRect.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - menuRect.width - margin));
    setMenuPos({ top, left });
  }, [menu]);

  const openMenu = (btn, id) => {
    if (!btn) return;
    if (menu && menu.btn === btn) { closeMenu(); return; }
    setMenuPos(null);
    setMenu({ id, btn });
  };

  const startReply = (msg) => {
    chat.setComposer({ type: 'reply', id: msg.id, name: msg.sender_name, preview: msg.content, previewType: msg.message_type, previewMsg: msg });
    if (inputRef.current) inputRef.current.focus({ preventScroll: true });
  };

  const menuMsg = menu ? byId.get(menu.id) : null;
  const confirmMsg = confirmId ? byId.get(confirmId) : null;
  useEffect(() => { if (confirmId && !confirmMsg) setConfirmId(null); }, [confirmId, confirmMsg]); // already gone (deleted elsewhere)
  useEffect(() => {
    if (!confirmId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setConfirmId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmId]);
  const runDelete = () => { const id = confirmId; setConfirmId(null); if (id) chat.deleteMessage(id); };
  const canReactToMenuMsg = reactionsEnabled && menuMsg && !String(menuMsg.id).startsWith('temp-');
  const menuItems = [];
  if (menuMsg) {
    const mine = menuMsg.sender_id === myId;
    const isText = menuMsg.message_type === 'text';
    menuItems.push({ action: 'reply', label: 'Reply', icon: 'reply' });
    if (isText && menuMsg.content) menuItems.push({ action: 'copy', label: 'Copy', icon: 'copy' });
    if (mine && isText) menuItems.push({ action: 'edit', label: 'Edit', icon: 'edit' });
    if (canModerate) menuItems.push({ action: 'pin', label: menuMsg.is_pinned ? 'Unpin' : 'Pin', icon: 'pin', active: menuMsg.is_pinned });
    if (mine || canModerate) menuItems.push({ action: 'delete', label: 'Delete', icon: 'delete', danger: true });
  }
  const runMenuAction = (action) => {
    const msg = menuMsg;
    closeMenu();
    if (!msg) return;
    if (action === 'delete') setConfirmId(msg.id);
    else if (action === 'pin') chat.togglePin(msg.id);
    else if (action === 'copy') copyText(msg.content || '').then(() => flash(t('Copied')));
    else if (action === 'edit') {
      if (msg.message_type === 'voice') return;
      chat.setComposer({ type: 'edit', id: msg.id, preview: msg.content });
      setInput(msg.content || '');
      if (inputRef.current) inputRef.current.focus({ preventScroll: true });
    } else if (action === 'reply') startReply(msg);
  };

  /* ---------- composer ---------- */
  const cancelComposer = () => { chat.setComposer(null); setInput(''); };
  const send = () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    setEmojiOpen(false);
    chat.submitComposer(text);
    stickRef.current = true;
  };
  const onSubmit = (e) => { e.preventDefault(); send(); };
  const onInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
    if (e.key === 'Escape' && composer) cancelComposer();
  };
  const hasText = input.trim().length > 0;

  const pinned = messages.find((m) => m.is_pinned);

  /* ---------- message list ---------- */
  const rows = [];
  let lastDay = null;
  messages.forEach((m, i) => {
    const dayKey = gcFormatDaySeparator(m.created_at);
    const isNewDay = dayKey !== lastDay;
    if (isNewDay) { rows.push(<div className="gc-day-sep" key={'d' + i}>{t(dayKey)}</div>); lastDay = dayKey; }
    if (firstUnreadId && m.id === firstUnreadId) rows.push(<div className="gc-unread-sep" key={'u' + m.id}>{t('New messages')}</div>);

    const isMine = m.sender_id === myId;
    const isPlain = !['voice', 'image', 'video', 'file'].includes(m.message_type);
    const isMatch = isPlain && !!trimmedTerm && (m.content || '').toLowerCase().includes(trimmedTerm.toLowerCase());
    const isDim = !!trimmedTerm && !isMatch;
    const initial = (m.sender_name || '?').charAt(0).toUpperCase();
    const senderColor = gcSenderColor(m.sender_id);

    // Grouping: only the last bubble of a run shows the avatar + tail; only the first shows the name.
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sameSenderAsPrev = !isNewDay && prev && prev.sender_id === m.sender_id;
    const sameSenderAsNext = next && next.sender_id === m.sender_id && gcFormatDaySeparator(next.created_at) === dayKey;
    const isFirstInGroup = !sameSenderAsPrev;
    const isLastInGroup = !sameSenderAsNext;

    const replied = m.reply_to_id ? byId.get(m.reply_to_id) : null;
    const quoteColor = replied ? gcSenderColor(replied.sender_id) : null; // tinted with the ORIGINAL sender's colour

    rows.push(
      <div key={m.id} data-msg-id={m.id}
           onContextMenu={(e) => { e.preventDefault(); openMenu(e.currentTarget.querySelector('.gc-msg-more-btn'), m.id); }}
           className={'gc-msg-row ' + (isMine ? 'is-mine' : '') + ' ' + (m.is_pinned ? 'gc-has-pin' : '') + ' ' + (isDim ? 'gc-dim' : '') + ' ' + (isFirstInGroup ? '' : 'gc-grouped')}>
        {isLastInGroup
          ? <div className="gc-msg-avatar" style={isMine ? undefined : { background: gcHexToRgba(senderColor, 0.2), color: senderColor }}>{(isMine ? (myAvatarUrl || avatars[m.sender_id]) : avatars[m.sender_id])
              ? <img src={(isMine ? (myAvatarUrl || avatars[m.sender_id]) : avatars[m.sender_id])} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
              : initial}</div>
          : <div className="gc-msg-avatar-gap" />}
        <div className="gc-msg-col">
          {(isMine || !isFirstInGroup) ? null : <div className="gc-msg-name" style={{ color: senderColor }}>{m.sender_name || t('Student')}</div>}
          <div className="gc-msg-bubble-wrap" onDoubleClick={() => { if (!String(m.id).startsWith('temp-')) startReply(m); }}>
            <button type="button" className={'gc-msg-more-btn' + (menu && menu.id === m.id ? ' is-open' : '')} data-msg-id={m.id}
                    aria-label={t('More')} title={t('More')} onClick={(e) => openMenu(e.currentTarget, m.id)}>
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="18" r="1.7" /></svg>
            </button>
            <div className="gc-bubble-stack">
              {m.reply_to_id ? (
                <div className="gc-reply-quote" onClick={() => scrollToMessage(m.reply_to_id)}
                     style={quoteColor ? { borderLeftColor: quoteColor, background: gcHexToRgba(quoteColor, 0.14) } : undefined}>
                  <span className="gc-reply-quote-name" style={quoteColor ? { color: quoteColor } : undefined}>{replied ? replied.sender_name : t('Original message')}</span>
                  <span className="gc-reply-quote-text">{replied ? <PreviewText msg={replied} /> : t('Message unavailable')}</span>
                </div>
              ) : null}
              <Bubble msg={m} chat={chat} groupCode={groupCode} isLast={isLastInGroup} isMine={isMine} term={trimmedTerm ? term : ''} seenBy={isMine ? seenByFor(m) : []} />
              {reactionsEnabled && reactions[m.id] && reactions[m.id].length > 0 && !String(m.id).startsWith('temp-')
                ? <ReactionChips list={reactions[m.id]} myId={myId} onToggle={(emoji) => chat.toggleReaction(m.id, emoji)} /> : null}
            </div>
          </div>
          {m._failed ? (
            <div className="gc-send-failed">
              <span className="gc-send-failed-text" title={m._failReason || ''}>⚠️ {t('Not sent')}{m._failReason ? <small className="gc-send-failed-reason"> · {String(m._failReason).slice(0, 80)}</small> : null}</span>
              <button type="button" className="gc-send-failed-retry" onClick={() => chat.retryFailed(m.id)}>{t('Retry')}</button>
              <button type="button" className="gc-send-failed-dismiss" aria-label={t('Dismiss')} onClick={() => chat.dismissFailed(m.id)}>✕</button>
            </div>
          ) : null}
          {/* text bubbles carry their own time + tick inside; media / voice / file keep it underneath */}
          {isLastInGroup && !isPlain ? (
            <div className="gc-msg-time">{gcFormatTime(m.created_at)}{isMine ? <Ticks pending={String(m.id).startsWith('temp-')} seenBy={seenByFor(m)} /> : null}</div>
          ) : null}
        </div>
      </div>
    );
  });

  const counter = trimmedTerm ? (matches.length ? `${activeIndex + 1} / ${matches.length}` : '0 / 0') : '';

  // Header status line: live typing info wins over the member count.
  let statusLine;
  if (typingNames.length > 0) {
    const label = typingNames.length === 1
      ? t('{name} is typing…').replace('{name}', typingNames[0] || t('Student'))
      : t('{n} people are typing…').replace('{n}', typingNames.length);
    statusLine = <span className="gc-typing"><span className="gc-typing-dots"><i /><i /><i /></span><span className="gc-typing-text">{label}</span></span>;
  } else if (memberCount == null) {
    statusLine = <><span className="group-chat-live-dot" aria-hidden="true" /><span>{t('Live')}</span></>;
  } else {
    statusLine = <span>{memberCount} {t(memberCount === 1 ? 'member' : 'members')}</span>;
  }
  const groupInitial = (groupName || 'G').trim().charAt(0).toUpperCase();

  return (
    <div className="group-chat-fullview" id="groupChatFullView">
      <PageStyle css={chatCss} />
      <PageStyle css={voiceCss} />
      <div className="panel group-chat-card group-chat-card--full" id="groupChatCard">
        <div className="panel-head group-chat-full-head">
          <button type="button" className="group-chat-back-btn" id="groupChatBackBtn" aria-label={t('Close')} onClick={onBack}>
            <Svg size={18}><path d="M15 18l-6-6 6-6" /></Svg>
          </button>
          <div className="gc-header-avatar" aria-hidden="true">{groupInitial}</div>
          <div className="gc-header-info">
            <h3 id="groupChatHeaderName">{groupName || t('Group chat')}</h3>
            <span className="gc-header-meta" id="groupChatHeaderMeta">{statusLine}</span>
          </div>
          <div className="gc-header-actions">
            <button type="button" className={'gc-header-icon-btn' + (searchOpen ? ' active' : '')} id="groupChatSearchBtn"
                    aria-label={t('Search messages')} title={t('Search')}
                    onClick={() => { if (searchOpen) closeSearch(); else setSearchOpen(true); }}>
              <IconSearch />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="gc-search-bar" id="groupChatSearchBar" style={{ display: 'flex' }}>
            <IconSearch size={15} />
            <input type="text" id="groupChatSearchInput" className="gc-search-input" autoComplete="off" autoFocus
                   placeholder={t('Search messages…')} value={term}
                   onChange={(e) => {
                     const v = e.target.value; setTerm(v); setSearchIndex(-1); setSearchNonce((n) => n + 1);
                   }}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') { e.preventDefault(); stepSearch(e.shiftKey ? -1 : 1); }
                     if (e.key === 'Escape') closeSearch();
                   }} />
            <span className="gc-search-count" id="groupChatSearchCount">{counter}</span>
            <button type="button" className="gc-search-nav-btn" aria-label={t('Previous match')} title={t('Previous')} onClick={() => stepSearch(-1)}>
              <Svg size={14} w={2.4}><polyline points="18 15 12 9 6 15" /></Svg>
            </button>
            <button type="button" className="gc-search-nav-btn" aria-label={t('Next match')} title={t('Next')} onClick={() => stepSearch(1)}>
              <Svg size={14} w={2.4}><polyline points="6 9 12 15 18 9" /></Svg>
            </button>
            <button type="button" className="gc-search-nav-btn" aria-label={t('Close search')} title={t('Close')} onClick={closeSearch}>
              <IconClose />
            </button>
          </div>
        )}

        {pinned && (
          <div className="group-chat-pinned-bar" id="groupChatPinnedBar" style={{ display: 'flex' }}>
            <span className="gc-pinned-icon">
              <Svg size={15} w={2}><path d="M12 17v5" /><path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" /></Svg>
            </span>
            <div className="gc-pinned-body" onClick={() => scrollToMessage(pinned.id)}>
              <div className="gc-pinned-label">{t('Pinned message')}</div>
              <div className="gc-pinned-text">{pinned.sender_name}: <PreviewText msg={pinned} /></div>
            </div>
            {canModerate && (
              <button type="button" className="gc-pinned-unpin" id="groupChatUnpinBtn" aria-label={t('Unpin')} title={t('Unpin')}
                      onClick={(e) => { e.stopPropagation(); chat.togglePin(pinned.id); }}>
                <IconClose />
              </button>
            )}
          </div>
        )}

        <div className="gc-body-wrap">
          <div className="group-chat-body" id="groupChatBody" ref={bodyRef} onScroll={onBodyScroll}>
            {messages.length === 0
              ? (
                <div className="group-chat-empty" id="groupChatEmpty">
                  <div className="gc-empty-icon"><Svg size={26} w={1.8}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></Svg></div>
                  <div>{t('No messages yet. Say hello to your classmates!')}</div>
                </div>
              )
              : rows}
          </div>

          <button type="button" className={'gc-jump-btn' + (showJump ? ' show' : '')} aria-label={t('Jump to latest')} title={t('Jump to latest')}
                  tabIndex={showJump ? 0 : -1}
                  onClick={() => { scrollToBottom(true); setNewBelow(0); }}>
            <IconChevronDown />
            {newBelow > 0 && <span className="gc-jump-badge">{newBelow > 99 ? '99+' : newBelow}</span>}
          </button>
          <div className={'gc-toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast}</div>
        </div>

        {composer && (
          <div className="gc-composer-bar" id="groupChatComposerBar" style={{ display: 'flex' }}>
            <span className="gc-composer-icon">
              <Svg size={15}>{composer.type === 'edit' ? MENU_ICONS.edit : MENU_ICONS.reply}</Svg>
            </span>
            <div className="gc-composer-text">
              <div className="gc-composer-label">{composer.type === 'edit' ? t('Editing message') : `${t('Replying to')} ${composer.name}`}</div>
              <div className="gc-composer-preview">
                {composer.type === 'reply' && ['voice', 'image', 'video', 'file'].includes(composer.previewType)
                  ? <PreviewText msg={composer.previewMsg} />
                  : composer.preview}
              </div>
            </div>
            <button type="button" className="gc-composer-cancel" id="gcComposerCancelBtn" aria-label={t('Cancel')} title={t('Cancel')} onClick={cancelComposer}>
              <IconClose />
            </button>
          </div>
        )}

        {chat.micError && <div className="gc-mic-error" id="groupChatMicError" style={{ display: 'block' }}>{t(({ unsupported: 'Voice recording is not supported in this browser', missing: 'No microphone found', busy: 'Microphone is being used by another app' })[chat.micError] || 'Microphone access needed')}</div>}

        <div className="gc-footer-wrap" ref={emojiRef}>
          {emojiOpen && (
            <div className="gc-emoji-panel" role="dialog" aria-label={t('Emoji')}>
              <div className="gc-emoji-tabs">
                {GC_EMOJI_GROUPS.map((g, i) => (
                  <button type="button" key={g.id} className={'gc-emoji-tab' + (i === emojiTab ? ' active' : '')} onClick={() => setEmojiTab(i)}>{g.icon}</button>
                ))}
              </div>
              <div className="gc-emoji-grid">
                {GC_EMOJI_GROUPS[emojiTab].list.map((em) => (
                  <button type="button" key={em} className="gc-emoji-item" onClick={() => insertEmoji(em)}>{em}</button>
                ))}
              </div>
            </div>
          )}

          <form className={'group-chat-footer' + (chat.recording ? ' is-recording' : '')} id="groupChatForm" onSubmit={onSubmit}>
            <input type="file" id="groupChatMediaInput" ref={fileRef} style={{ display: 'none' }}
                   onChange={(e) => {
                     const file = e.target.files && e.target.files[0];
                     e.target.value = ''; // allow picking the same file again later
                     if (file) chat.sendFile(file);
                   }} />
            <div className="gc-input-shell">
              <button type="button" className={'gc-emoji-btn' + (emojiOpen ? ' active' : '')} aria-label={t('Emoji')} title={t('Emoji')}
                      onClick={() => setEmojiOpen((o) => !o)}>
                <IconSmile />
              </button>
              <textarea id="groupChatInput" className="group-chat-input" rows={1} maxLength={2000} autoComplete="off" ref={inputRef}
                        placeholder={t('Type a message…')} value={input}
                        onChange={(e) => { setInput(e.target.value); if (e.target.value.trim()) chat.notifyTyping(); }}
                        onKeyDown={onInputKeyDown} />
              <button type="button" className="gc-attach-btn" id="groupChatAttachBtn" aria-label={t('Send photo, video, or file')} title={t('Send photo, video, or file')}
                      onClick={() => fileRef.current && fileRef.current.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
              </button>
            </div>
            {hasText ? (
              <button type="submit" className="group-chat-send" id="groupChatSendBtn" aria-label={t('Send')} title={t('Send')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            ) : (
              <button type="button" className="gc-mic-btn" id="groupChatMicBtn" aria-label={t('Record voice message')} title={t('Record voice message')} onClick={chat.startRecording}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" /><path d="M19 10v1a7 7 0 01-14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg>
              </button>
            )}
            <div className={'gc-record-bar' + (chat.recording ? ' active' : '')} id="groupChatRecordBar">
              <button type="button" className="gc-record-cancel" id="groupChatRecordCancelBtn" aria-label={t('Cancel recording')} title={t('Cancel')} onClick={chat.cancelRecording}>
                <IconClose size={15} />
              </button>
              <span className="gc-record-dot" aria-hidden="true" />
              <span className="gc-record-timer" id="groupChatRecordTimer">{gcFormatDuration(chat.recording ? chat.recordElapsed : 0)}</span>
              <span className="gc-record-bars" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></span>
              <button type="button" className="gc-record-send" id="groupChatRecordSendBtn" aria-label={t('Send voice message')} title={t('Send')} onClick={chat.confirmRecording}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
            </div>
          </form>
        </div>
      </div>

      {confirmMsg && createPortal(
        <div className="gc-confirm-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmId(null); }}>
          <div className="gc-confirm" role="alertdialog" aria-modal="true" aria-labelledby="gcConfirmTitle">
            <div className="gc-confirm-ico"><Svg size={22} w={2}>{MENU_ICONS.delete}</Svg></div>
            <h4 id="gcConfirmTitle">{t('Delete this message?')}</h4>
            <p>{confirmMsg.sender_id !== myId
              ? `${t('Message from')} ${confirmMsg.sender_name || t('Student')}. ${t("This can't be undone.")}`
              : t("This can't be undone.")}</p>
            <div className="gc-confirm-actions">
              <button type="button" className="gc-confirm-btn" autoFocus onClick={() => setConfirmId(null)}>{t('Cancel')}</button>
              <button type="button" className="gc-confirm-btn gc-confirm-btn--danger" onClick={runDelete}>{t('Delete')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* True top-level portal: position:fixed can never be clipped by .group-chat-card's overflow. */}
      {menu && createPortal(
        <>
          <div className="gc-msg-menu-scrim open" id="gcMsgMenuScrim" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
          <div className="gc-msg-menu open" id="gcMsgMenu" role="menu" ref={menuRef}
               style={menuPos ? { top: menuPos.top, left: menuPos.left } : { top: 0, left: 0, visibility: 'hidden' }}>
            {canReactToMenuMsg && (
              <div className="gc-menu-reactions">
                {QUICK_REACTIONS.map((em) => {
                  const mineNow = (reactions[menuMsg.id] || []).some((r) => r.user_id === myId && r.emoji === em);
                  return (
                    <button type="button" key={em} className={'gc-menu-react' + (mineNow ? ' is-mine' : '')} aria-label={em}
                            onClick={() => { const id = menuMsg.id; closeMenu(); chat.toggleReaction(id, em); }}>{em}</button>
                  );
                })}
              </div>
            )}
            {menuItems.map((it) => (
              <button type="button" key={it.action} data-action={it.action}
                      className={'gc-msg-menu-item ' + (it.danger ? 'gc-menu-danger' : '') + ' ' + (it.active ? 'gc-menu-active' : '')}
                      onClick={() => runMenuAction(it.action)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{MENU_ICONS[it.icon]}</svg>
                <span>{t(it.label)}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
