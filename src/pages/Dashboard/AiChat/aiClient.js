import { supabase, SUPABASE_URL } from '../../../lib/supabaseClient';

/**
 * "Brain" of Ufuq AI. Requests go to the `ai-chat` Supabase Edge Function with the student's own
 * access token (the model key never reaches the browser). If that fails, a tiny local fallback answers.
 * Both the text chat and the voice mode (Live) use this one function — to switch the model later
 * (any provider) you only change the edge function, or swap this file's fetch.
 */

export const TEACHER_SYSTEM_PROMPT = `You are Ufuq AI, the assistant built into the teacher panel of the Ufuq Arabic-learning platform.
You help Arabic teachers and administrators: planning lessons and homework, writing exam questions with answer keys,
drafting short feedback for students, writing clear announcements for a group, explaining grammar so it can be taught,
and answering questions about using the teacher panel (groups, tasks, attendance, exams, media, reports).
Politely decline anything unrelated to teaching Arabic or running this platform. Be concise and practical; offer
ready-to-use text the teacher can copy. You may use light Markdown (short lists, **bold**).`;

export const AI_SYSTEM_PROMPT = `You are Ufuq AI, the learning assistant built into the Ufuq Arabic-learning platform.
Only help with things that support the student's Arabic learning: conversation practice, grammar
explanations, vocabulary, pronunciation tips, correcting sentences, and questions about their
lessons, tasks, exams, or progress on this platform. Encourage the student to reply in Arabic when
practicing conversation. Politely decline anything unrelated to Arabic learning or this platform
(e.g. image/video/music generation, unrelated general topics), and steer the conversation back.
Keep answers concise and encouraging. You may use light Markdown (short lists, **bold**) in the text chat.`;

// Added only for voice turns: the answer is read aloud, so it must sound natural when spoken.
const VOICE_CLAUSE = `

You are in a live VOICE conversation and your reply will be read aloud. Answer in 1-3 short, natural spoken
sentences. No Markdown, no lists, no emojis, no URLs. Reply in the language the student just spoke. When practicing
Arabic, say the Arabic phrase first, then a very short explanation.`;

const MAX_HISTORY = 20;

/** Shown only when the AI service cannot be reached at all (no canned fake lessons). */
export function localAiFallback() {
  return 'Ufuq AI hozir javob bera olmayapti. Internetni tekshirib, birozdan keyin qayta urinib ko\u2018ring.\n\nUfuq AI is not reachable right now. Please check your connection and try again in a moment.';
}

/**
 * @param {{ text: string, history: {role:'user'|'assistant', content:string}[], voice?: boolean, signal?: AbortSignal }} args
 *   `history` must already end with the latest user message.
 * @returns {Promise<{ reply: string, offline: boolean, aborted: boolean }>}
 */
export async function askUfuqAi({ text, history, voice = false, signal, systemPrompt }) {
  // The real instructions live on the server (ai-chat). The browser only says which panel it is in; the server
  // double-checks that the account is a teacher/admin before it uses the teacher mode.
  const mode = systemPrompt === TEACHER_SYSTEM_PROMPT ? 'teacher' : 'student';
  const messages = history.slice(-MAX_HISTORY);
  let reply = null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData && sessionData.session && sessionData.session.access_token;
    if (accessToken) {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ message: text, history: messages, voice, mode }),
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        reply = data.reply || data.message || null;
      } else {
        let serverMsg = '';
        let code = '';
        try { const j = await response.json(); serverMsg = (j && j.error) || ''; code = (j && j.code) || ''; } catch (e) { /* not json */ }
        // Live voice allowance used up / too fast: not an answer to read aloud, the voice screen reacts to the code.
        if (response.status === 429 && (code === 'VOICE_LIMIT' || code === 'VOICE_SLOW')) return { reply: '', offline: false, aborted: false, voiceLimit: code === 'VOICE_LIMIT', voiceSlow: code === 'VOICE_SLOW' };
        console.error('ai-chat function returned', response.status, serverMsg);
        // Rate limits and "busy" are real answers for the person, not an outage: show the server's own message.
        if ((response.status === 429 || response.status === 503) && serverMsg) return { reply: serverMsg, offline: false, aborted: false };
      }
    }
  } catch (err) {
    if (signal && signal.aborted) return { reply: '', offline: false, aborted: true };
    console.error('ai-chat request failed:', err);
  }
  if (signal && signal.aborted) return { reply: '', offline: false, aborted: true };
  if (!reply) return { reply: localAiFallback(), offline: true, aborted: false };
  return { reply: String(reply), offline: false, aborted: false };
}
