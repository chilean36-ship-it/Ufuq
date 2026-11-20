import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getTasksForGroup, getTaskSubmissions, useDashboardData } from '../context/DashboardDataContext';
import { fetchMySubmissions, fetchPublishedWrittenExams } from '../pages/Dashboard/Exam/writtenData';
import { useApp } from './AppContext';
import { Ico } from './ui';
import { haptic } from './hooks';

/*
 * Task / exam reminders shown on the screen when the student opens the app:
 *   1. a task or exam that was posted since the last visit: once;
 *   2. a task or exam that is still not handed in and ends within 24 hours: once more.
 * What was already shown is remembered per student on this device (localStorage). The very first run only records what already exists,
 * so old tasks do not all pop up at once.
 */
const DAY = 86400000;
const keyOf = (uid) => 'ufuq-reminders:' + uid;
const readSeen = (uid) => { try { const v = JSON.parse(localStorage.getItem(keyOf(uid)) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };
const writeSeen = (uid, v) => { try { localStorage.setItem(keyOf(uid), JSON.stringify(v)); } catch (e) { /* ignore */ } };
const endOfDay = (d) => (d ? new Date(d + 'T23:59:59').getTime() : null);

export default function Reminders({ onNavigate }) {
  const { t } = useApp();
  const { user, groupCode, groupReady, role } = useDashboardData();
  const uid = user && user.id;
  const [items, setItems] = useState(null);   // [{ k, kind, title, left, fresh }]
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!uid || !groupReady || !groupCode || role !== 'student') return undefined;
    let off = false;
    const id = setTimeout(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        const [tasks, tsubs, exams] = await Promise.all([getTasksForGroup(groupCode), getTaskSubmissions(uid), fetchPublishedWrittenExams(groupCode).catch(() => [])]);
        const esubs = await fetchMySubmissions(uid, (exams || []).map((e) => e.id)).catch(() => ({}));
        if (off) return;
        const now = Date.now();
        const all = [];
        tasks.forEach((x) => { if (!tsubs[x.id]) all.push({ k: 'task:' + x.id, kind: 'task', title: x.title, end: endOfDay(x.due) }); });
        (exams || []).forEach((e) => {
          const s = esubs[e.id];
          if (s && (s.submitted_at || (s.status && s.status !== 'running'))) return;   // already handed in
          all.push({ k: 'exam:' + e.id, kind: 'exam', title: e.title, end: e.deadline_at ? new Date(e.deadline_at).getTime() : null });
        });
        const open = all.filter((x) => x.end === null || x.end > now);
        const seen = readSeen(uid);
        if (!seen) { writeSeen(uid, { n: open.map((x) => x.k), s: [] }); return; }   // first run on this device: remember, do not nag
        const fresh = open.filter((x) => !seen.n.includes(x.k));
        const soon = open.filter((x) => x.end !== null && x.end - now <= DAY && !seen.s.includes(x.k) && !fresh.includes(x));
        const list = [...fresh.map((x) => ({ ...x, fresh: true })), ...soon.map((x) => ({ ...x, fresh: false }))];
        if (list.length) setItems(list);
      } catch (e) { /* silent: reminders are optional */ }
    }, 2800);   // after the home screen and the "what's new" pop-up
    return () => { off = true; clearTimeout(id); };
  }, [uid, groupReady, groupCode, role]);

  const close = useCallback((goTo) => {
    if (!items) return;
    const seen = readSeen(uid) || { n: [], s: [] };
    const n = new Set(seen.n); const s = new Set(seen.s);
    items.forEach((x) => { n.add(x.k); if (!x.fresh || (x.end !== null && x.end - Date.now() <= DAY)) s.add(x.k); });
    writeSeen(uid, { n: [...n].slice(-300), s: [...s].slice(-300) });
    setClosing(true);
    setTimeout(() => { setItems(null); setClosing(false); if (goTo) onNavigate(goTo); }, 280);
  }, [items, uid, onNavigate]);

  if (!items) return null;
  const left = (x) => {
    if (x.end === null) return '';
    const h = Math.max(1, Math.round((x.end - Date.now()) / 3600000));
    return h >= 24 ? t('remOneDay') : h + ' ' + t('remHours');
  };
  const fresh = items.filter((x) => x.fresh);
  const soon = items.filter((x) => !x.fresh);
  const hasTask = items.some((x) => x.kind === 'task');
  const Row = ({ x }) => (
    <div className={'rm-row ' + x.kind}>
      <span className="rm-ic"><Ico n={x.kind === 'task' ? 'task' : 'exam'} size={20} /></span>
      <span className="rm-t"><b dir="auto">{x.title}</b><small>{x.kind === 'task' ? t('remTask') : t('remExam')}{!x.fresh && left(x) ? ' · ' + left(x) : ''}</small></span>
    </div>
  );
  return createPortal(
    <div className={'rm-ov' + (closing ? ' out' : '')} role="dialog" aria-modal="true" aria-label={t('remTitleNew')} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="rm-sheet">
        <span className="rm-grab" aria-hidden="true" />
        {fresh.length > 0 && (<><h3 className="rm-h">{t('remTitleNew')}</h3><div className="rm-list">{fresh.map((x) => <Row key={x.k} x={x} />)}</div></>)}
        {soon.length > 0 && (<><h3 className="rm-h warn">{t('remTitleSoon')}</h3><div className="rm-list">{soon.map((x) => <Row key={x.k} x={x} />)}</div></>)}
        <div className="rm-act">
          <button type="button" className="rm-btn ghost" onClick={() => { haptic(6); close(); }}>{t('popGotIt')}</button>
          <button type="button" className="rm-btn" onClick={() => { haptic(10); close(hasTask && !items.some((x) => x.kind === 'exam') ? 'tasks' : items.some((x) => x.kind === 'exam') && !hasTask ? 'exam' : 'tasks'); }}>{t('remOpen')}</button>
        </div>
      </div>
      <style>{`
        .rm-ov{position:fixed;inset:0;z-index:2100;display:flex;align-items:flex-end;justify-content:center;padding:12px 12px calc(12px + env(safe-area-inset-bottom));background:rgba(0,0,0,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:rmFade .25s ease both}
        .rm-sheet{width:100%;max-width:440px;max-height:78vh;overflow:auto;padding:10px 16px 16px;border-radius:28px;background:var(--bg-2);border:1px solid var(--line);box-shadow:0 30px 70px -20px rgba(0,0,0,.8);animation:rmUp .5s cubic-bezier(.2,.9,.25,1.05) both}
        .rm-grab{display:block;width:42px;height:4px;border-radius:4px;background:var(--line);margin:2px auto 12px}
        .rm-h{margin:6px 2px 10px;font:700 19px 'Fraunces',serif;color:var(--gold-bright)} .rm-h.warn{color:#E5A23C;margin-top:16px}
        .rm-list{display:flex;flex-direction:column;gap:8px}
        .rm-row{display:flex;align-items:center;gap:12px;padding:12px;border-radius:18px;background:var(--bg-3);border:1px solid var(--line)}
        .rm-ic{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--gold-dim);color:var(--gold-bright)}
        .rm-row.exam .rm-ic{background:rgba(124,92,230,.18);color:#A593F2}
        .rm-t{min-width:0;display:flex;flex-direction:column;gap:2px} .rm-t b{font-size:15px;overflow-wrap:anywhere} .rm-t small{font-size:12.5px;color:var(--text-muted)}
        .rm-act{display:flex;gap:10px;margin-top:16px}
        .rm-btn{flex:1;height:50px;border:0;border-radius:99px;font:800 15px 'Inter',sans-serif;color:#1a1405;cursor:pointer;background:linear-gradient(135deg,#F3D77E,#C9A24B 60%,#B98B3E)}
        .rm-btn.ghost{background:transparent;color:var(--text);border:1.5px solid var(--line)}
        .rm-ov.out{animation:rmFadeOut .28s ease forwards}.rm-ov.out .rm-sheet{animation:rmDown .28s ease-in forwards}
        @keyframes rmFade{from{opacity:0}} @keyframes rmFadeOut{to{opacity:0}} @keyframes rmUp{from{transform:translateY(110%)}} @keyframes rmDown{to{transform:translateY(110%)}}
        @media (prefers-reduced-motion:reduce){.rm-ov,.rm-sheet{animation:none!important}}
      `}</style>
    </div>,
    document.body,
  );
}
