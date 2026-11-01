import { supabase } from '../../../lib/supabaseClient';

/* Cross-device AI chat history. Everything is best-effort: if the table is missing or the network is down the
   widget keeps working from the browser copy (localStorage) exactly as before. */
const MAX_REMOTE = 30;

export async function loadRemoteChats(uid, mode) {
  try {
    const { data, error } = await supabase.from('ai_chats').select('chat_id,title,messages,updated_at')
      .eq('user_id', uid).eq('mode', mode).order('updated_at', { ascending: false }).limit(MAX_REMOTE);
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({ id: r.chat_id, title: r.title || '', updatedAt: new Date(r.updated_at).getTime(), messages: Array.isArray(r.messages) ? r.messages : [] }));
  } catch (e) { return []; }
}

export async function pushRemoteChat(uid, mode, chat) {
  try {
    await supabase.from('ai_chats').upsert({
      user_id: uid, chat_id: chat.id, mode, title: chat.title || '', messages: chat.messages, updated_at: new Date(chat.updatedAt || Date.now()).toISOString(),
    }, { onConflict: 'user_id,chat_id' });
  } catch (e) { /* offline — the local copy still has it */ }
}

export async function deleteRemoteChat(uid, mode, chatId) {
  try { await supabase.from('ai_chats').delete().eq('user_id', uid).eq('mode', mode).eq('chat_id', chatId); } catch (e) { /* ignore */ }
}
