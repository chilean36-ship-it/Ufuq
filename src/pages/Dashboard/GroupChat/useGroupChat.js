import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import useLiveRefresh from '../../../lib/liveRefresh';
import {
  GC_FILE_MAX_MB, GC_MEDIA_MAX_MB, GC_VOICE_MAX_SECONDS, GC_VOICE_MIN_MS, MESSAGE_COLUMNS,
  gcBaseMime, gcForgetSignedUrl, gcGetSignedUrl, gcPeekSignedUrl, gcPickRecordingMimeType, gcR2Delete, gcR2Upload,
} from './chatUtils';

/** Drops later rows that share an id (a realtime INSERT can land before the optimistic row is swapped for the real one). */
function dedupeById(list) {
  const seen = new Set();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}

/**
 * Everything the group chat needs, in one place — port of the gc* state machine in dashboard.html.
 *
 * Table: public.group_messages(id, group_code, sender_id, sender_name, content, message_type, voice_path,
 *   voice_duration, media_path, file_name, file_size, file_mime, created_at, edited_at, reply_to_id,
 *   is_pinned, pinned_by, pinned_at). RLS: members can SELECT/INSERT; a message's own sender OR a teacher
 *   assigned to the group (public.teacher_groups) can UPDATE/DELETE — enforced server-side, not here.
 *   Realtime pushes INSERT / UPDATE / DELETE so every open tab stays in sync.
 * Read receipts: public.group_chat_reads(group_code, user_id, last_read_at, user_name) — one row per user & group.
 *   Members can read each other's rows, so a message counts as "seen" by everyone whose last_read_at >= created_at.
 * Reactions: public.group_message_reactions(message_id, user_id, group_code, emoji, user_name) — one per user per message.
 * Moderation: admins (profiles.role = 'admin') and the group's teachers (teacher_groups) may delete or pin any message;
 *   everybody else can only delete their own. The SQL in /supabase/chat_upgrade.sql enforces the same rule server-side.
 */
export function useGroupChat({ groupCode, user, myName, t }) {
  const [messages, setMessages] = useState([]);
  const [canModerate, setCanModerate] = useState(false); // admin, or teacher of this group
  const [reactions, setReactions] = useState({});          // message id -> [{ user_id, emoji, user_name }]
  const [reactionsEnabled, setReactionsEnabled] = useState(false); // false until the reactions table answers
  const [readers, setReaders] = useState([]);               // [{ user_id, last_read_at, user_name }]
  const [avatars, setAvatars] = useState({});               // user id -> photo URL (students and staff of this group)
  const [composer, setComposerState] = useState(null); // null | {type:'edit', id} | {type:'reply', id, name, msg}
  const [unreadCount, setUnreadCount] = useState(0);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [chatOpen, setChatOpenState] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0); // seconds
  const [micError, setMicError] = useState(false);
  const [typingNames, setTypingNames] = useState([]); // classmates currently typing (broadcast, never stored)

  const messagesRef = useRef([]);
  const reactionsRef = useRef({});
  const readTimerRef = useRef(null);
  const lastReadSentRef = useRef(0);
  const composerRef = useRef(null);
  const chatOpenRef = useRef(false);
  const firstUnreadRef = useRef(null);
  const lastReadAtRef = useRef(null);
  const retryRef = useRef(new Map()); // temp id -> retry function
  const channelRef = useRef(null);
  const typingRef = useRef(new Map());   // user id -> display name
  const typingTimers = useRef(new Map()); // user id -> timeout id
  const lastTypingSent = useRef(0);
  const userId = user && user.id;

  const commitMessages = useCallback((next) => {
    const value = typeof next === 'function' ? next(messagesRef.current) : next;
    messagesRef.current = value;
    setMessages(value);
  }, []);
  const setComposer = useCallback((mode) => { composerRef.current = mode; setComposerState(mode); }, []);
  const commitReactions = useCallback((next) => {
    const value = typeof next === 'function' ? next(reactionsRef.current) : next;
    reactionsRef.current = value;
    setReactions(value);
  }, []);
  const putReaction = useCallback((row) => {
    if (!row || row.message_id == null || !row.user_id) return;
    commitReactions((all) => {
      const others = (all[row.message_id] || []).filter((r) => r.user_id !== row.user_id);
      return { ...all, [row.message_id]: [...others, { user_id: row.user_id, emoji: row.emoji, user_name: row.user_name || null }] };
    });
  }, [commitReactions]);
  const dropReaction = useCallback((row) => {
    if (!row || row.message_id == null) return;
    if (!reactionsRef.current[row.message_id]) return;
    commitReactions((all) => ({ ...all, [row.message_id]: all[row.message_id].filter((r) => r.user_id !== row.user_id) }));
  }, [commitReactions]);
  const upsertReader = useCallback((row) => {
    if (!row || !row.user_id) return;
    setReaders((list) => [...list.filter((r) => r.user_id !== row.user_id),
      { user_id: row.user_id, last_read_at: row.last_read_at, user_name: row.user_name || null }]);
  }, []);

  /* ---------- unread / read receipts ---------- */
  const setUnread = useCallback((n) => setUnreadCount(Math.max(0, n)), []);
  const setFirstUnread = useCallback((id) => { firstUnreadRef.current = id; setFirstUnreadId(id); }, []);

  // Everything from someone else newer than last_read_at is unread. No row at all = epoch (whole history counts).
  const recomputeUnread = useCallback(() => {
    if (chatOpenRef.current) return;
    const cutoff = lastReadAtRef.current ? new Date(lastReadAtRef.current).getTime() : 0;
    let count = 0, firstId = null;
    for (const m of messagesRef.current) {
      if (m.sender_id === userId) continue;
      if (new Date(m.created_at).getTime() > cutoff) { count++; if (!firstId) firstId = m.id; }
    }
    setFirstUnread(firstId);
    setUnread(count);
  }, [userId, setFirstUnread, setUnread]);

  // last_read_at = the newest message's own (server) timestamp, so clock skew between devices can never mark
  // a message as read before it was. An empty chat falls back to now().
  const markChatAsRead = useCallback(async () => {
    setUnread(0);
    if (!groupCode || !userId) return;
    lastReadSentRef.current = Date.now();
    const list = messagesRef.current.filter((m) => !String(m.id).startsWith('temp-'));
    const newest = list.length ? list[list.length - 1].created_at : new Date().toISOString();
    lastReadAtRef.current = newest;
    const base = { group_code: groupCode, user_id: userId, last_read_at: newest };
    try {
      let { error } = await supabase.from('group_chat_reads').upsert({ ...base, user_name: myName || null }, { onConflict: 'group_code,user_id' });
      // The user_name column only exists after chat_upgrade.sql has run — fall back so unread tracking never breaks.
      if (error) ({ error } = await supabase.from('group_chat_reads').upsert(base, { onConflict: 'group_code,user_id' }));
      if (error) throw error;
      upsertReader({ ...base, user_name: myName || null });
    } catch (err) {
      console.error("O'qilgan holatni saqlashda xatolik:", err.message);
    }
  }, [groupCode, userId, myName, setUnread, upsertReader]);

  // New messages arriving while the chat is open: report "read" shortly after, at most every ~1.5 s.
  const scheduleMarkRead = useCallback(() => {
    if (readTimerRef.current) return;
    const wait = Math.max(300, 1500 - (Date.now() - lastReadSentRef.current));
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null;
      if (chatOpenRef.current && document.visibilityState === 'visible') markChatAsRead();
    }, wait);
  }, [markChatAsRead]);

  /** Called when the full chat view opens/closes. The "New messages" divider stays for the whole viewing and clears on close. */
  const setChatOpen = useCallback((open) => {
    chatOpenRef.current = open;
    setChatOpenState(open);
    if (open) markChatAsRead();
    else setFirstUnread(null);
  }, [markChatAsRead, setFirstUnread]);

  // Coming back to the tab with the chat open counts as reading whatever arrived meanwhile.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && chatOpenRef.current) markChatAsRead(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); clearTimeout(readTimerRef.current); readTimerRef.current = null; };
  }, [markChatAsRead]);

  /* ---------- load + realtime ---------- */
  useEffect(() => {
    commitMessages([]); commitReactions({}); setReactionsEnabled(false); setReaders([]); setCanModerate(false);
    setUnread(0); setFirstUnread(null);
    lastReadAtRef.current = null; chatOpenRef.current = false; setChatOpenState(false);
    typingRef.current.clear(); setTypingNames([]);
    if (!groupCode || !userId) return undefined;
    let cancelled = false;

    // May this user moderate the chat? (delete any message, pin/unpin) — platform admin, or a teacher of this group.
    (async () => {
      try {
        const [profRes, tgRes] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
          supabase.from('teacher_groups').select('teacher_id').eq('group_code', groupCode).eq('teacher_id', userId).maybeSingle(),
        ]);
        if (profRes.error) throw profRes.error;
        if (tgRes.error) throw tgRes.error;
        const isAdminRole = !!(profRes.data && profRes.data.role === 'admin');
        if (!cancelled) setCanModerate(isAdminRole || !!tgRes.data);
      } catch (err) {
        console.error('Ruxsatlarni tekshirishda xatolik:', err.message);
        if (!cancelled) setCanModerate(false);
      }
    })();

    // Reactions + everybody's read position (for the "seen" ticks). Both are optional: if the SQL hasn't been run
    // yet the chat keeps working, it just doesn't show them.
    (async () => {
      const { data, error } = await supabase.from('group_message_reactions')
        .select('message_id, user_id, emoji, user_name').eq('group_code', groupCode).limit(5000);
      if (cancelled) return;
      if (error) { console.error('Reaksiyalarni yuklashda xatolik:', error.message); setReactionsEnabled(false); return; }
      const grouped = {};
      (data || []).forEach((r) => { (grouped[r.message_id] = grouped[r.message_id] || []).push({ user_id: r.user_id, emoji: r.emoji, user_name: r.user_name }); });
      commitReactions(grouped);
      setReactionsEnabled(true);
    })();
    (async () => {
      let res = await supabase.from('group_chat_reads').select('user_id, last_read_at, user_name').eq('group_code', groupCode);
      if (res.error) res = await supabase.from('group_chat_reads').select('user_id, last_read_at').eq('group_code', groupCode);
      if (cancelled) return;
      if (res.error) { console.error("O'qilganlar ro'yxatini olishda xatolik:", res.error.message); return; }
      setReaders((res.data || []).map((r) => ({ user_id: r.user_id, last_read_at: r.last_read_at, user_name: r.user_name || null })));
    })();

    (async () => {
      let loaded = [];
      let lastRead = null;
      try {
        const [msgsRes, readRes] = await Promise.all([
          supabase.from('group_messages').select(MESSAGE_COLUMNS).eq('group_code', groupCode)
            .order('created_at', { ascending: true }).limit(200),
          supabase.from('group_chat_reads').select('last_read_at').eq('group_code', groupCode).eq('user_id', userId).maybeSingle(),
        ]);
        if (msgsRes.error) throw msgsRes.error;
        loaded = msgsRes.data || [];
        lastRead = readRes && !readRes.error && readRes.data ? readRes.data.last_read_at : null;
        if (readRes && readRes.error) console.error("O'qilgan holatni olishda xatolik:", readRes.error.message);
      } catch (err) {
        console.error('Guruh chatini yuklashda xatolik:', err.message);
      }
      if (cancelled) return;
      lastReadAtRef.current = lastRead;
      commitMessages(loaded);
      recomputeUnread(); // badge is accurate the moment the group page loads
    })();

    const clearTyping = (id) => {
      clearTimeout(typingTimers.current.get(id));
      typingTimers.current.delete(id);
      if (typingRef.current.delete(id) && !cancelled) setTypingNames(Array.from(typingRef.current.values()));
    };

    const channel = supabase
      .channel('group-chat-' + groupCode)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || !payload.user_id || payload.user_id === userId) return;
        const id = payload.user_id;
        typingRef.current.set(id, String(payload.name || '').slice(0, 40));
        setTypingNames(Array.from(typingRef.current.values()));
        clearTimeout(typingTimers.current.get(id));
        typingTimers.current.set(id, setTimeout(() => clearTyping(id), 4000));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: 'group_code=eq.' + groupCode }, (payload) => {
        if (messagesRef.current.some((m) => m.id === payload.new.id)) return; // sender's own optimistic copy
        clearTyping(payload.new.sender_id); // a sent message ends that person's "typing…"
        commitMessages((list) => [...list, payload.new]);
        const fromMe = payload.new.sender_id === userId;
        if (!chatOpenRef.current && !fromMe) {
          if (!firstUnreadRef.current) setFirstUnread(payload.new.id);
          setUnreadCount((c) => c + 1);
        } else if (chatOpenRef.current && !fromMe) {
          scheduleMarkRead();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: 'group_code=eq.' + groupCode }, (payload) => {
        commitMessages((list) => {
          const idx = list.findIndex((m) => m.id === payload.new.id);
          if (idx === -1) return [...list, payload.new];
          const copy = list.slice(); copy[idx] = payload.new; return copy;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages', filter: 'group_code=eq.' + groupCode }, (payload) => {
        // Needs REPLICA IDENTITY FULL on group_messages so payload.old carries group_code + id.
        const deletedId = payload.old && payload.old.id;
        if (!deletedId) return;
        commitMessages((list) => list.filter((m) => m.id !== deletedId));
        commitReactions((all) => { if (!all[deletedId]) return all; const { [deletedId]: _gone, ...rest } = all; return rest; });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_message_reactions', filter: 'group_code=eq.' + groupCode }, (p) => putReaction(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_message_reactions', filter: 'group_code=eq.' + groupCode }, (p) => putReaction(p.new))
      // DELETE events can't be filtered server-side; the row carries message_id + user_id (the primary key), and
      // dropReaction ignores messages that aren't in this chat.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_message_reactions' }, (p) => dropReaction(p.old))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat_reads', filter: 'group_code=eq.' + groupCode }, (p) => upsertReader(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_chat_reads', filter: 'group_code=eq.' + groupCode }, (p) => upsertReader(p.new))
      .subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      channelRef.current = null;
      typingTimers.current.forEach((tm) => clearTimeout(tm));
      typingTimers.current.clear(); typingRef.current.clear();
      supabase.removeChannel(channel);
    };
  }, [groupCode, userId, commitMessages, commitReactions, putReaction, dropReaction, upsertReader, scheduleMarkRead, recomputeUnread, setFirstUnread, setUnread]);

  /** Tells the group "I'm typing" — throttled to one tiny broadcast every ~2.5 s, nothing is saved to the database. */
  const notifyTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !userId) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = now;
    try {
      Promise.resolve(ch.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, name: myName } })).catch(() => {});
    } catch (e) { /* channel not ready yet — ignore */ }
  }, [userId, myName]);

  /* ---------- failed-send bookkeeping ---------- */
  const markFailed = useCallback((tempId, reason, retryFn) => {
    commitMessages((list) => list.map((m) => (m.id === tempId ? { ...m, _uploading: false, _failed: true, _failReason: reason || 'Unknown error' } : m)));
    if (retryFn) retryRef.current.set(tempId, retryFn);
  }, [commitMessages]);
  const retryFailed = useCallback((id) => {
    const fn = retryRef.current.get(id);
    retryRef.current.delete(id);
    commitMessages((list) => list.filter((m) => m.id !== id));
    if (fn) fn();
  }, [commitMessages]);
  const dismissFailed = useCallback((id) => {
    retryRef.current.delete(id);
    commitMessages((list) => list.filter((m) => m.id !== id));
  }, [commitMessages]);

  /* ---------- sending ---------- */
  const sendText = useCallback(async (text, replyToId) => {
    const content = text.trim();
    if (!content || !groupCode || !userId) return;
    const optimistic = {
      id: 'temp-' + Date.now(), sender_id: userId, sender_name: myName, content, message_type: 'text',
      voice_path: null, voice_duration: null, created_at: new Date().toISOString(), edited_at: null,
      reply_to_id: replyToId || null, is_pinned: false, pinned_by: null, pinned_at: null,
    };
    commitMessages((list) => [...list, optimistic]);
    const { data, error } = await supabase.from('group_messages')
      .insert({ group_code: groupCode, sender_id: userId, sender_name: myName, content, reply_to_id: replyToId || null })
      .select(MESSAGE_COLUMNS).single();
    if (error) {
      console.error('Xabar yuborishda xatolik:', error.message);
      commitMessages((list) => list.filter((m) => m.id !== optimistic.id)); // roll back the optimistic bubble
      return;
    }
    commitMessages((list) => dedupeById(list.map((m) => (m.id === optimistic.id ? data : m))));
  }, [groupCode, userId, myName, commitMessages]);

  const editMessage = useCallback(async (id, text) => {
    const content = text.trim();
    if (!content) return;
    const msg = messagesRef.current.find((m) => m.id === id);
    if (!msg) return;
    const prevContent = msg.content;
    commitMessages((list) => list.map((m) => (m.id === id ? { ...m, content } : m)));
    const { data, error } = await supabase.from('group_messages').update({ content }).eq('id', id).select(MESSAGE_COLUMNS).single();
    if (error) {
      console.error('Xabarni tahrirlashda xatolik:', error.message);
      commitMessages((list) => list.map((m) => (m.id === id ? { ...m, content: prevContent } : m)));
      return;
    }
    commitMessages((list) => list.map((m) => (m.id === id ? { ...m, ...data } : m)));
  }, [commitMessages]);

  // Composer submit: edit mode edits, reply mode replies, otherwise a plain message.
  // flood guard: at most 8 messages / edits per 10 seconds from one person (protects the group and the database from spam or a stuck key)
  const sendTimes = useRef([]);
  const submitComposer = useCallback((text) => {
    if (!text.trim()) return;
    const now = Date.now();
    sendTimes.current = sendTimes.current.filter((x) => now - x < 10000);
    if (sendTimes.current.length >= 8) return;
    sendTimes.current.push(now);
    const mode = composerRef.current;
    setComposer(null);
    if (mode && mode.type === 'edit') editMessage(mode.id, text);
    else sendText(text, mode && mode.type === 'reply' ? mode.id : null);
  }, [editMessage, sendText, setComposer]);

  const uploadMedia = useCallback(async function upload(file, replyToId) {
    if (!file || !groupCode || !userId) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    // Anything that isn't a photo or video goes as a generic "file" message (audio files get an inline player).
    const messageType = isVideo ? 'video' : isImage ? 'image' : 'file';
    const maxMb = messageType === 'file' ? GC_FILE_MAX_MB : GC_MEDIA_MAX_MB;
    if (file.size > maxMb * 1024 * 1024) { window.alert(t('File is too large ({a} MB). Maximum is {b} MB.').replace('{a}', (file.size / 1048576).toFixed(1)).replace('{b}', String(maxMb))); return; }
    const localUrl = messageType === 'file' ? null : URL.createObjectURL(file); // instant preview while uploading
    const tempId = 'temp-' + Date.now();
    const fileFields = messageType === 'file'
      ? { file_name: file.name || 'File', file_size: file.size, file_mime: file.type || null }
      : { file_name: null, file_size: null, file_mime: null };
    commitMessages((list) => [...list, {
      id: tempId, sender_id: userId, sender_name: myName, content: null, message_type: messageType,
      media_path: null, voice_path: null, voice_duration: null, ...fileFields,
      created_at: new Date().toISOString(), edited_at: null, reply_to_id: replyToId || null,
      is_pinned: false, pinned_by: null, pinned_at: null, _uploading: true, _localUrl: localUrl,
    }]);
    let key;
    try {
      key = await gcR2Upload(file, 'media', groupCode, (k) => {
        commitMessages((list) => list.map((m) => (m.id === tempId ? { ...m, media_path: k } : m)));
      });
    } catch (uploadErr) {
      console.error('Media yuklashda xatolik:', uploadErr.message);
      markFailed(tempId, uploadErr.message, () => upload(file, replyToId));
      return;
    }
    const { data, error } = await supabase.from('group_messages')
      .insert({ group_code: groupCode, sender_id: userId, sender_name: myName, content: null, message_type: messageType,
        media_path: key, ...fileFields, reply_to_id: replyToId || null })
      .select(MESSAGE_COLUMNS).single();
    if (error) {
      console.error('Media xabarni yuborishda xatolik:', error.message);
      markFailed(tempId, error.message, () => upload(file, replyToId));
      gcR2Delete(key, groupCode);
      return;
    }
    commitMessages((list) => dedupeById(list.map((m) => (m.id === tempId ? data : m))));
  }, [groupCode, userId, myName, commitMessages, markFailed]);

  const uploadVoice = useCallback(async function uploadV(blob, durationSeconds, replyToId) {
    if (!groupCode || !userId) return;
    const baseType = gcBaseMime(blob.type) || 'audio/webm';
    const ext = baseType.includes('mp4') || baseType.includes('aac') ? 'm4a' : baseType.includes('ogg') ? 'ogg' : 'webm';
    const localFilename = 'voice-' + Date.now() + '.' + ext;
    const tempId = 'temp-' + Date.now();
    commitMessages((list) => [...list, {
      id: tempId, sender_id: userId, sender_name: myName, content: null, message_type: 'voice',
      voice_path: null, voice_duration: durationSeconds, created_at: new Date().toISOString(), edited_at: null,
      reply_to_id: replyToId || null, is_pinned: false, pinned_by: null, pinned_at: null, _uploading: true,
    }]);
    const file = new File([blob], localFilename, { type: baseType });
    let key;
    try {
      key = await gcR2Upload(file, 'voice', groupCode, (k) => {
        commitMessages((list) => list.map((m) => (m.id === tempId ? { ...m, voice_path: k } : m)));
      });
    } catch (uploadErr) {
      console.error('Ovozli xabarni yuklashda xatolik:', uploadErr.message);
      markFailed(tempId, uploadErr.message, () => uploadV(blob, durationSeconds, replyToId));
      return;
    }
    const { data, error } = await supabase.from('group_messages')
      .insert({ group_code: groupCode, sender_id: userId, sender_name: myName, content: null, message_type: 'voice',
        voice_path: key, voice_duration: durationSeconds, reply_to_id: replyToId || null })
      .select(MESSAGE_COLUMNS).single();
    if (error) {
      console.error('Ovozli xabarni yuborishda xatolik:', error.message);
      markFailed(tempId, error.message, () => uploadV(blob, durationSeconds, replyToId));
      gcR2Delete(key, groupCode);
      return;
    }
    commitMessages((list) => dedupeById(list.map((m) => (m.id === tempId ? data : m))));
  }, [groupCode, userId, myName, commitMessages, markFailed]);

  /** Attach button: a reply composer applies to the file too, then clears. */
  const sendFile = useCallback((file) => {
    const mode = composerRef.current;
    const replyToId = mode && mode.type === 'reply' ? mode.id : null;
    if (replyToId) setComposer(null);
    uploadMedia(file, replyToId);
  }, [uploadMedia, setComposer]);

  /* ---------- delete / pin ---------- */
  // Own messages can always be deleted; other people's only by an admin or the group's teacher (canModerate).
  // The confirmation dialog lives in the UI; RLS enforces the same rule server-side.
  const deleteMessage = useCallback(async (id) => {
    if (!id || String(id).startsWith('temp-')) return;
    const prev = messagesRef.current;
    const target = prev.find((m) => m.id === id);
    if (!target) return;
    if (target.sender_id !== userId && !canModerate) return;
    stopVoiceIf(id);
    commitMessages((list) => list.filter((m) => m.id !== id));
    const { error } = await supabase.from('group_messages').delete().eq('id', id);
    if (error) {
      console.error("Xabarni o'chirishda xatolik:", error.message);
      commitMessages(prev);
      return;
    }
    if (target.message_type === 'voice' && target.voice_path) gcR2Delete(target.voice_path, groupCode);
    if (['image', 'video', 'file'].includes(target.message_type) && target.media_path) gcR2Delete(target.media_path, groupCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupCode, userId, canModerate, commitMessages]);

  /* ---------- reactions ---------- */
  // One reaction per person per message: tapping a new emoji replaces yours, tapping the same one removes it.
  const toggleReaction = useCallback(async (messageId, emoji) => {
    if (!userId || !groupCode || !reactionsEnabled || !messageId || String(messageId).startsWith('temp-')) return;
    const before = reactionsRef.current[messageId] || [];
    const mine = before.find((r) => r.user_id === userId);
    const restore = () => commitReactions((all) => ({ ...all, [messageId]: before }));
    if (mine && mine.emoji === emoji) {
      commitReactions((all) => ({ ...all, [messageId]: before.filter((r) => r.user_id !== userId) }));
      const { error } = await supabase.from('group_message_reactions').delete().eq('message_id', messageId).eq('user_id', userId);
      if (error) { console.error("Reaksiyani olib tashlashda xatolik:", error.message); restore(); }
      return;
    }
    commitReactions((all) => ({ ...all, [messageId]: [...before.filter((r) => r.user_id !== userId), { user_id: userId, emoji, user_name: myName }] }));
    const { error } = await supabase.from('group_message_reactions')
      .upsert({ message_id: messageId, group_code: groupCode, user_id: userId, user_name: myName || null, emoji }, { onConflict: 'message_id,user_id' });
    if (error) { console.error('Reaksiya qo\'shishda xatolik:', error.message); restore(); }
  }, [userId, groupCode, myName, reactionsEnabled, commitReactions]);

  // Pin/unpin: admins and the group's teachers only. Only one message stays pinned per group — pinning a new one unpins the previous.
  const togglePin = useCallback(async (id) => {
    if (!canModerate) return;
    const msg = messagesRef.current.find((m) => m.id === id);
    if (!msg) return;
    const clear = { is_pinned: false, pinned_by: null, pinned_at: null };
    if (msg.is_pinned) {
      const { error } = await supabase.from('group_messages').update(clear).eq('id', id);
      if (error) { console.error('Pindan olishda xatolik:', error.message); return; }
      commitMessages((list) => list.map((m) => (m.id === id ? { ...m, ...clear } : m)));
      return;
    }
    const prevPinned = messagesRef.current.find((m) => m.is_pinned && m.id !== id);
    if (prevPinned) {
      const { error: unpinErr } = await supabase.from('group_messages').update(clear).eq('id', prevPinned.id);
      if (!unpinErr) commitMessages((list) => list.map((m) => (m.id === prevPinned.id ? { ...m, ...clear } : m)));
    }
    const { data, error } = await supabase.from('group_messages')
      .update({ is_pinned: true, pinned_by: userId, pinned_at: new Date().toISOString() })
      .eq('id', id).select('id, is_pinned, pinned_by, pinned_at').single();
    if (error) { console.error('Pin qilishda xatolik:', error.message); return; }
    commitMessages((list) => list.map((m) => (m.id === id ? { ...m, ...data } : m)));
  }, [canModerate, userId, commitMessages]);

  /* ---------- voice playback ---------- */
  // One shared <audio>; each VoiceBubble subscribes to its own message id for { playing, progress }.
  const audioRef = useRef({ el: null, id: null });
  const listenersRef = useRef(new Map()); // id -> Set(cb)
  const emit = useCallback((id, patch) => {
    const set = listenersRef.current.get(id);
    if (set) set.forEach((cb) => cb(patch));
  }, []);
  const subscribeVoice = useCallback((id, cb) => {
    if (!listenersRef.current.has(id)) listenersRef.current.set(id, new Set());
    listenersRef.current.get(id).add(cb);
    return () => { const s = listenersRef.current.get(id); if (s) s.delete(cb); };
  }, []);

  function stopVoiceIf(id) {
    const a = audioRef.current;
    if (a.el && a.id === id) { a.el.pause(); a.el = null; a.id = null; }
  }
  const stopAllVoice = useCallback(() => {
    const a = audioRef.current;
    if (a.el) { a.el.pause(); a.el = null; a.id = null; }
  }, []);

  /** Warm the signed-URL cache so the tap can start playback synchronously (iOS Safari refuses play() after an await). */
  const prefetchVoice = useCallback((id) => {
    const msg = messagesRef.current.find((m) => m.id === id);
    if (!msg || !msg.voice_path || msg._uploading) return;
    gcGetSignedUrl(groupCode, msg.voice_path).catch(() => {});
  }, [groupCode]);

  const toggleVoice = useCallback(async (id) => {
    const msg = messagesRef.current.find((m) => m.id === id);
    if (!msg || !msg.voice_path) return;
    const a = audioRef.current;
    if (a.id === id && a.el && !a.el.paused) { a.el.pause(); return; }
    if (a.el && a.id !== id) { a.el.pause(); emit(a.id, { playing: false }); }
    if (a.id === id && a.el && a.el.paused && a.el.currentTime > 0 && !a.el.ended) { a.el.play().catch(() => {}); return; }

    const knownDuration = Number(msg.voice_duration) || 0;
    let retried = false;
    const start = (url) => {
      const el = new Audio();
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      audioRef.current = { el, id };
      el.addEventListener('play', () => emit(id, { playing: true, error: false }));
      el.addEventListener('pause', () => emit(id, { playing: false }));
      el.addEventListener('ended', () => emit(id, { playing: false, progress: 0 }));
      el.addEventListener('timeupdate', () => {
        // MediaRecorder webm files report duration = Infinity — fall back to the length we stored with the message.
        const dur = isFinite(el.duration) && el.duration > 0 ? el.duration : knownDuration;
        if (dur) emit(id, { progress: Math.min(100, (el.currentTime / dur) * 100) });
      });
      el.addEventListener('error', () => {
        emit(id, { playing: false });
        if (!retried) {
          // The signed URL may have expired — fetch a fresh one once.
          retried = true;
          gcForgetSignedUrl(groupCode, msg.voice_path);
          gcGetSignedUrl(groupCode, msg.voice_path).then((fresh) => {
            if (audioRef.current.id !== id) return;
            el.src = fresh; el.load(); el.play().catch(() => emit(id, { playing: false, error: true }));
          }).catch(() => emit(id, { playing: false, error: true }));
        } else {
          emit(id, { playing: false, error: true });
        }
      });
      el.src = url;
      const p = el.play();
      if (p && p.catch) p.catch((err) => {
        if (err && err.name === 'AbortError') return;
        console.error('Ovozli xabarni ijro etishda xatolik:', err && err.message);
        emit(id, { playing: false, error: true });
      });
    };

    // Fast path: URL already signed -> play() runs inside the tap (works on iPhone).
    const cached = gcPeekSignedUrl(groupCode, msg.voice_path);
    if (cached) { start(cached); return; }
    try {
      start(await gcGetSignedUrl(groupCode, msg.voice_path));
    } catch (err) {
      console.error('Ovozli xabarni ijro etishda xatolik:', err && err.message);
      emit(id, { playing: false, error: true });
    }
  }, [groupCode, emit]);

  /* ---------- voice recording ---------- */
  const rec = useRef({ recorder: null, stream: null, chunks: [], startedAt: 0, timer: null, cancelled: false });

  const confirmRecording = useCallback(() => {
    const r = rec.current;
    if (!r.recorder || r.recorder.state === 'inactive') return;
    r.cancelled = false;
    r.recorder.stop();
  }, []);
  const cancelRecording = useCallback(() => {
    const r = rec.current;
    if (!r.recorder) return;
    r.cancelled = true;
    r.recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    const r = rec.current;
    if (r.recorder) return;
    setMicError(false);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { setMicError('unsupported'); return; }
    try {
      r.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      console.error('Mikrofonga ruxsat berilmadi:', err && err.message);
      const name = err && err.name;
      setMicError(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : name === 'NotReadableError' || name === 'AbortError' ? 'busy' : 'denied');
      return;
    }
    const mimeType = gcPickRecordingMimeType();
    r.chunks = []; r.cancelled = false;
    try {
      r.recorder = mimeType ? new MediaRecorder(r.stream, { mimeType }) : new MediaRecorder(r.stream);
    } catch (err) {
      console.error("Yozishni boshlab bo'lmadi:", err && err.message);
      r.stream.getTracks().forEach((tr) => tr.stop());
      r.stream = null;
      setMicError('unsupported');
      return;
    }
    r.recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) r.chunks.push(e.data); };
    r.recorder.onstop = () => {
      if (r.stream) { r.stream.getTracks().forEach((tr) => tr.stop()); r.stream = null; }
      const elapsedMs = Date.now() - r.startedAt;
      const chunks = r.chunks; r.chunks = [];
      const type = r.recorder ? (r.recorder.mimeType || mimeType || 'audio/webm') : 'audio/webm';
      r.recorder = null;
      clearInterval(r.timer); r.timer = null;
      setRecording(false); setRecordElapsed(0);
      if (r.cancelled || elapsedMs < GC_VOICE_MIN_MS || !chunks.length) return;
      const blob = new Blob(chunks, { type: gcBaseMime(type) || 'audio/webm' });
      // A voice note can be a reply too — carry the composer's reply reference over.
      const mode = composerRef.current;
      const replyToId = mode && mode.type === 'reply' ? mode.id : null;
      if (replyToId) setComposer(null);
      uploadVoice(blob, Math.round(elapsedMs / 1000), replyToId);
    };
    r.startedAt = Date.now();
    r.recorder.start();
    setRecording(true);
    const tick = () => {
      const elapsed = (Date.now() - r.startedAt) / 1000;
      setRecordElapsed(elapsed);
      if (elapsed >= GC_VOICE_MAX_SECONDS) confirmRecording();
    };
    tick();
    r.timer = setInterval(tick, 250);
  }, [uploadVoice, setComposer, confirmRecording]);

  // Leaving the page: stop audio, drop any recording.
  useEffect(() => () => {
    stopAllVoice();
    const r = rec.current;
    if (r.recorder) { r.cancelled = true; try { r.recorder.stop(); } catch (e) { /* already stopped */ } }
    clearInterval(r.timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Photos of everyone in the group (classmates, teacher, admins). Silently refreshed, so a new photo shows up at once.
  const loadAvatars = useCallback(async () => {
    if (!groupCode) { setAvatars({}); return; }
    const { data, error } = await supabase.rpc('group_chat_avatars', { p_group_code: groupCode });
    if (error || !Array.isArray(data)) return;
    const map = {};
    data.forEach((r) => { if (r && r.user_id && r.avatar_url) map[r.user_id] = r.avatar_url; });
    setAvatars(map);
  }, [groupCode]);
  useEffect(() => { loadAvatars(); }, [loadAvatars]);
  useLiveRefresh(loadAvatars);

  return {
    avatars, messages, canModerate, isAdmin: canModerate, reactions, reactionsEnabled, readers, toggleReaction, composer, setComposer, unreadCount, firstUnreadId, chatOpen, setChatOpen,
    typingNames, notifyTyping,
    submitComposer, sendFile, deleteMessage, togglePin, retryFailed, dismissFailed,
    subscribeVoice, toggleVoice, prefetchVoice, stopAllVoice,
    recording, recordElapsed, micError, startRecording, cancelRecording, confirmRecording,
  };
}
