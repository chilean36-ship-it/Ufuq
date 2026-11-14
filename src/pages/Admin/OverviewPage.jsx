import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import usePendingWork from '../../components/panel/usePendingWork';
import useJoinCodes from '../../lib/useJoinCodes';
import { AreaChart, Avatar, ChevronRight, Donut, EmptyState, Ico, Skeleton, StatCard } from './ui';

import { fmtDate as fmtDateL, currentLang } from '../../lib/dateLocale';
const DAYS = 30;
const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/** Joins per day for the last DAYS days (oldest → newest) + change vs the previous period. */
function buildSeries(members) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push(d); }
  const map = {};
  (members || []).forEach((m) => { if (m.joined_at) { const k = dayKey(new Date(m.joined_at)); map[k] = (map[k] || 0) + 1; } });
  const perDay = days.map((d) => ({ label: d.getDate() + '/' + (d.getMonth() + 1), value: map[dayKey(d)] || 0 }));
  const half = DAYS / 2;
  const cur = perDay.slice(half).reduce((s, d) => s + d.value, 0);
  const prev = perDay.slice(0, half).reduce((s, d) => s + d.value, 0);
  const trend = prev === 0 ? (cur === 0 ? null : 100) : Math.round(((cur - prev) / prev) * 100);
  let run = 0;
  const cumulative = perDay.map((d) => (run += d.value));
  return { perDay, cur, prev, trend, cumulative, newThisPeriod: perDay.reduce((s, d) => s + d.value, 0) };
}

export default function OverviewPage() {
  const { t, myGroups, myName, showPage, setCurrentGroupCode, can, isSuper } = usePanel();
  const [data, setData] = useState(null); // null = loading
  const pending = usePendingWork(myGroups.map((g) => g.code));
  const { joinCodes } = useJoinCodes(myGroups.map((g) => g.code));

  const [liveTick, setLiveTick] = useState(0);
  const silentRef = useRef(false);
  useLiveRefresh(() => { silentRef.current = true; setLiveTick((n) => n + 1); });

  useEffect(() => {
    let cancelled = false;
    if (!silentRef.current) setData(null);
    silentRef.current = false;
    (async () => {
      // Platform-wide numbers: main admin only. A failure just hides that card.
      let platform = null;
      if (isSuper) {
        const head = (extra) => { let q = supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'); return extra ? extra(q) : q; };
        const [all, unpaid, active, blocked] = await Promise.all([head(), head((q) => q.eq('status', 'unpaid')), head((q) => q.eq('status', 'active')), head((q) => q.eq('status', 'blocked'))]);
        platform = {
          students: all.error ? null : all.count, unpaid: unpaid.error ? null : unpaid.count,
          active: active.error ? null : active.count, blocked: blocked.error ? null : blocked.count,
        };
      }
      if (myGroups.length === 0) { if (!cancelled) setData({ empty: true, platform }); return; }
      if (!isSuper) { if (!cancelled) setData({ counts: {}, total: 0, uniqueStudents: 0, platform: null, statuses: {}, series: null }); return; } // ordinary admins: no student data at all
      const codes = myGroups.map((g) => g.code);
      const { data: members } = await supabase.from('group_members').select('group_code, user_id, name, joined_at').in('group_code', codes);
      const list = members || [];
      const counts = {};
      list.forEach((m) => { counts[m.group_code] = (counts[m.group_code] || 0) + 1; });
      const ids = [...new Set(list.map((m) => m.user_id))];
      let statuses = {};
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, status').in('id', ids);
        (profs || []).forEach((p) => { statuses[p.id] = p.status || 'unpaid'; });
      }
      if (!cancelled) setData({ counts, total: list.length, uniqueStudents: ids.length, platform, statuses, series: buildSeries(list) });
    })();
    return () => { cancelled = true; };
  }, [myGroups, liveTick, isSuper]);

  const hour = new Date().getHours();
  const hello = hour < 12 ? t('Good morning') : hour < 18 ? t('Good afternoon') : t('Good evening');
  const first = (myName || '').trim().split(/\s+/)[0];
  const platform = data && data.platform;
  const loading = data === null;

  const statusItems = useMemo(() => {
    if (!data) return [];
    let a, u, b;
    if (platform && platform.active != null && platform.unpaid != null && platform.blocked != null) { a = platform.active; u = platform.unpaid; b = platform.blocked; }
    else { const v = Object.values(data.statuses || {}); a = v.filter((s) => s === 'active').length; u = v.filter((s) => s === 'unpaid').length; b = v.filter((s) => s === 'blocked').length; }
    return [
      { label: t('Active (paid)'), value: a, color: 'var(--a-green)' },
      { label: t('Unpaid'), value: u, color: 'var(--a-amber)' },
      { label: t('Blocked'), value: b, color: 'var(--a-rose)' },
    ];
  }, [data, platform, t]);

  const QUICK = [
    { page: 'groups', label: 'Manage groups', sub: 'Create and edit', icon: <Ico><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Ico> },
    { page: 'students', label: 'Students', sub: 'Status and level', icon: <Ico><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Ico> },
    { page: 'exams', label: 'Exams', sub: 'Create and review', icon: <Ico><path d="M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" /><path d="M9 8h6M9 12h6M9 16h4" /></Ico> },
    { page: 'announcements', label: 'Message students', sub: 'Group or one student', icon: <Ico><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a2 2 0 0 1-3.6 1.2" /></Ico> },
    { page: 'landing', label: 'Landing page', sub: 'Site media', icon: <Ico><rect x="2" y="5" width="14" height="14" rx="3" /><path d="M16 10l6-3v10l-6-3z" /></Ico> },
  ].filter((q) => can(q.page));

  const needs = pending.tasks + pending.exams;
  const series = data && data.series;
  const totalStudents = platform && platform.students != null ? platform.students : data && data.uniqueStudents;
  const dateStr = fmtDateL(new Date(), currentLang(), { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section className="page active" id="page-overview">
      <div className="a-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>{hello}{first ? ', ' + first : ''} 👋</h1>
        </div>
        <div className="a-hero-meta">
          <span className="a-pill"><i className="a-live" />{t('Live')}</span>
          <span className="a-pill"><Ico><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Ico>{dateStr}</span>
        </div>
      </div>

      <div className="a-stats" id="overviewStats">
        {isSuper && (
          <>
          <StatCard loading={loading} tone="var(--a-blue)" label={platform && platform.students != null ? t('Students on the platform') : t('Total students')} value={totalStudents}
                    icon={<Ico><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Ico>}
                    trend={series ? series.trend : null} spark={series ? series.cumulative : undefined} onClick={can('students') ? () => showPage('students') : undefined} />
          {(loading || (platform && platform.unpaid != null)) && (
            <StatCard loading={loading} tone="var(--a-amber)" label={t('Unpaid students')} value={platform ? platform.unpaid : 0}
                      icon={<Ico><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></Ico>} onClick={can('students') ? () => showPage('students') : undefined} />
          )}
          </>
        )}
        {(loading || !data.empty) && (
          <StatCard loading={loading} tone="var(--gold)" label={t('Groups')} value={myGroups.length}
                    icon={<Ico><path d="m12 2 10 5-10 5L2 7l10-5Z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></Ico>} onClick={can('groups') ? () => showPage('groups') : undefined} />
        )}
        {isSuper && (loading || !data.empty) && (
          <StatCard loading={loading} tone="var(--a-teal)" label={t('New in 30 days')} value={series ? series.newThisPeriod : 0}
                    icon={<Ico><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></Ico>} spark={series ? series.perDay.map((d) => d.value) : undefined} />
        )}
      </div>

      {isSuper && (
      <div className="a-grid g-21">
        <div className="panel">
          <div className="panel-head">
            <div><h3><span className="panel-head-bar" />{t('New students')}</h3><div className="panel-sub">{t('Last 30 days')}</div></div>
          </div>
          {loading ? <Skeleton h={190} /> : data.empty ? <EmptyState title={t('No group has been assigned to you yet.')} /> : <AreaChart data={series.perDay} color="var(--gold-bright)" />}
        </div>
        <div className="panel">
          <div className="panel-head"><h3><span className="panel-head-bar" />{t('Student status')}</h3></div>
          {loading ? <Skeleton h={150} /> : <Donut items={statusItems} centerLabel={t('Students')} onPick={can('students') ? () => showPage('students') : undefined} />}
        </div>
      </div>
      )}

      <div className="a-grid g-2">
        <div className="panel">
          <div className="panel-head"><h3><span className="panel-head-bar" />{t('Quick actions')}</h3></div>
          <div className="qa-grid">
            {QUICK.map((q) => (
              <button type="button" className="qa" key={q.page} onClick={() => showPage(q.page)}>
                <span className="qa-ico">{q.icon}</span>
                <span>{t(q.label)}<small>{t(q.sub)}</small></span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3><span className="panel-head-bar" />{t('Needs your attention')}</h3></div>
          <div className="attn-list">
            {!pending.loaded ? <Skeleton h={52} /> : (
              <>
                {isSuper && pending.tasks > 0 && <button type="button" className="attn" onClick={() => showPage('tasks')}><b>{pending.tasks}</b><span>{t('Task submissions waiting for a grade')}</span><ChevronRight /></button>}
                {isSuper && pending.exams > 0 && <button type="button" className="attn" onClick={() => showPage('exams')}><b>{pending.exams}</b><span>{t('Written exams waiting to be graded')}</span><ChevronRight /></button>}
                {platform && platform.unpaid > 0 && <button type="button" className="attn" onClick={() => showPage('students')}><b>{platform.unpaid}</b><span>{t('Students with unpaid status')}</span><ChevronRight /></button>}
                {(needs === 0 || !isSuper) && !(platform && platform.unpaid > 0) && <div className="attn ok" style={{ cursor: 'default' }}><b>{'✓'}</b><span>{t('All caught up — nothing is waiting for review.')}</span></div>}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3><span className="panel-head-bar" />{t('Your groups')}</h3></div>
        <div className="a-table-wrap" style={{ border: 0 }}>
          <table>
            <thead><tr><th>{t('Group')}</th><th>{t('Code')}</th><th>{t('Schedule')}</th>{isSuper && <th>{t('Students')}</th>}{isSuper && <th>{t('Status')}</th>}<th></th></tr></thead>
            <tbody id="overviewGroupsBody">
              {loading ? <tr className="empty-row"><td colSpan={isSuper ? 6 : 4}><Skeleton h={18} /></td></tr>
                : data.empty ? <tr className="empty-row"><td colSpan={isSuper ? 6 : 4}>{t('No group has been assigned to you yet.')}</td></tr>
                : myGroups.map((g) => (
                  <tr key={g.code} style={{ cursor: can('students') ? 'pointer' : 'default' }} onClick={() => { if (!can('students')) return; setCurrentGroupCode(g.code); showPage('students'); }}>
                    <td><div className="a-cell-user"><Avatar name={g.name || '?'} size={32} /><b>{g.name}</b></div></td>
                    <td className="muted">{joinCodes[g.code] || '—'}</td>
                    <td className="muted">{g.schedule || '—'}</td>
                    {isSuper && <td>{data.counts[g.code] || 0}</td>}
                    {isSuper && <td>{g.is_active ? <span className="chip chip-active">{t('Active')}</span> : <span className="chip chip-inactive">{t('Inactive')}</span>}</td>}
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>›</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
