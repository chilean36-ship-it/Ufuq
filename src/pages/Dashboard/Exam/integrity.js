import { supabase } from '../../../lib/supabaseClient';

/*
 * Exam integrity helper. The server piece (exam_violations + log_exam_violation) lives in
 * supabase/migrations/20261006_exam_integrity.sql (hardened in 20261013_security_hardening.sql).
 *
 * Every departure is written to a small local queue first and then sent. If the device is offline, or the request
 * fails, the item stays in the queue and is sent again later (on the next call, or when the connection comes back).
 * So a technical interruption is still recorded for the teacher, and no departure is lost because of the network.
 * Each item has a unique id (p_client_id): if a request is sent twice, the server stores it once.
 */

const QUEUE_KEY = 'ufuq-guard-queue';
const MAX_QUEUE = 200;
let flushing = false;

function readQueue() {
  try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); } catch (e) { /* storage blocked */ }
}
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Sends queued violations in order; stops at the first failure so the order is kept. Never throws. */
export async function flushViolations() {
  if (flushing || !isOnline()) return;
  flushing = true;
  try {
    while (true) {
      const q = readQueue();
      if (!q.length) break;
      const item = q[0];
      let ok = false;
      try {
        const { error } = await supabase.rpc('log_exam_violation', {
          p_exam_type: item.examType, p_exam_id: item.examId, p_kind: item.kind, p_count: item.count, p_client_id: item.id,
        });
        ok = !error;
      } catch (e) { ok = false; }
      if (!ok) break;
      writeQueue(readQueue().filter((x) => x.id !== item.id));
    }
  } finally {
    flushing = false;
  }
}

/** Records a violation locally and tries to send it now. Never throws. kind: tab | blur | fullscreen | leave | tech_*. */
export async function logViolation(examType, examId, kind, count) {
  const item = {
    id: `${examType}:${examId}:${kind}:${count}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    examType, examId: String(examId), kind, count,
  };
  writeQueue([...readQueue(), item]);
  await flushViolations();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushViolations(); });
}
