import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { fmtDate } from '../../lib/panelUtils';
import { LEVEL_LIST, MAX_LEVEL } from '../../lib/levels';
import { Avatar, EmptyState, Ico, PageHeader, SearchInput, Segmented, Skeleton, StatCard } from './ui';

const STATUSES = ['active', 'unpaid', 'blocked'];
const LEVELS = LEVEL_LIST;   // 1..MAX_LEVEL (14)
const SORTS = { name: 'Name', joined: 'Newest first', level: 'Level' };


/** Level stepper: − / + still work, and the number in the middle can be typed (e.g. 12 + Enter) to jump straight there. */
function LevelStepper({ value, max, onCommit, label }) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(String(value)); }, [value]);

  async function commit() {
    const n = Math.round(Number(draft));
    if (!draft.trim() || !Number.isFinite(n) || n < 1 || n > max || n === value) { setDraft(String(value)); return; }
    setSaving(true);
    const ok = await onCommit(n);
    setSaving(false);
    if (!ok) setDraft(String(value));
  }
  const step = async (d) => { setSaving(true); const ok = await onCommit(value + d); setSaving(false); if (!ok) setDraft(String(value)); };

  return (
    <div className="a-stepper" role="group" aria-label={label}>
      <button type="button" disabled={saving || value <= 1} aria-label="-" onClick={() => step(-1)}>−</button>
      <input
        type="text" inputMode="numeric" pattern="[0-9]*" className="a-stepper-input" aria-label={label}
        value={draft} disabled={saving} maxLength={2}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur(); } }}
      />
      <button type="button" disabled={saving || value >= max} aria-label="+" onClick={() => step(1)}>+</button>
    </div>
  );
}

function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

export default function StudentsPage() {
  const { t, toast, askConfirm, myGroups, currentGroup: g, setCurrentGroupCode, goToAnnouncements, isSuper } = usePanel();
  const code = g ? g.code : null;
  const [rows, setRows] = useState(null);   // null = loading
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [bulkLevel, setBulkLevel] = useState('');

  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!code) return;
    if (!silent) setRows(null);
    const { data: members, error } = await supabase.from('group_members').select('user_id, name, joined_at').eq('group_code', code).order('joined_at');
    if (error) { if (!silent) toast(error.message, 'err'); return; }
    if (!members || members.length === 0) { setRows([]); return; }
    const ids = members.map((m) => m.user_id);
    const { data: profs } = await supabase.from('profiles').select('id, status, level, avatar_url').in('id', ids);
    const profMap = {};
    (profs || []).forEach((p) => { profMap[p.id] = p; });
    setRows(members.map((m) => {
      const p = profMap[m.user_id] || { status: 'unpaid', level: 1 };
      return { ...m, status: p.status, level: p.level, avatar_url: p.avatar_url };
    }));
  }, [code, toast]);

  useEffect(() => { setPicked(new Set()); setBulkLevel(''); setQ(''); setStatusFilter('all'); setLevelFilter('all'); load(); }, [load]);
  useLiveRefresh(load);

  const patchRows = (ids, patch) => setRows((cur) => cur.map((r) => (ids.includes(r.user_id) ? { ...r, ...patch } : r)));

  async function changeStatus(uid, status) {
    const { error } = await supabase.rpc('admin_update_student', { p_user_id: uid, p_status: status, p_level: null });
    if (error) { toast(error.message, 'err'); return false; }
    patchRows([uid], { status });
    return true;
  }
  async function changeLevel(uid, level) {
    const { error } = await supabase.rpc('admin_update_student', { p_user_id: uid, p_status: null, p_level: level });
    if (error) { toast(error.message, 'err'); return false; }
    patchRows([uid], { level });
    return true;
  }

  async function bulkStatus(status) {
    const ids = [...picked];
    if (!ids.length) return;
    setBusy(true);
    let ok = 0;
    for (const id of ids) { if (await changeStatus(id, status)) ok += 1; }
    setBusy(false);
    toast(t('Status updated.') + ' (' + ok + '/' + ids.length + ')', ok === ids.length ? 'ok' : 'err');
    setPicked(new Set());
  }

  // Everyone picked gets the same level in one go (5 requests at a time); only the rows that really saved are patched.
  async function bulkLevelApply() {
    const ids = [...picked];
    const lvl = Number(bulkLevel);
    if (!ids.length || !(lvl >= 1 && lvl <= MAX_LEVEL)) return;
    setBusy(true);
    let ok = 0;
    for (let i = 0; i < ids.length; i += 5) {
      const chunk = ids.slice(i, i + 5);
      const res = await Promise.all(chunk.map((id) => supabase.rpc('admin_update_student', { p_user_id: id, p_status: null, p_level: lvl })));
      const saved = chunk.filter((id, k) => !res[k].error);
      ok += saved.length;
      if (saved.length) patchRows(saved, { level: lvl });
      const bad = res.find((x) => x.error);
      if (bad) toast(bad.error.message, 'err');
    }
    setBusy(false);
    toast(t('Level updated.') + ' (' + ok + '/' + ids.length + ')', ok === ids.length ? 'ok' : 'err');
    if (ok === ids.length) { setPicked(new Set()); setBulkLevel(''); }
  }

  function remove(m) {
    askConfirm(
      t('Remove student from group'),
      (m.name || t('Student')) + ' ' + t('will be removed from this group. They can rejoin later using the group code. Continue?'),
      async () => {
        const { error } = await supabase.from('group_members').delete().eq('group_code', g.code).eq('user_id', m.user_id);
        if (error) { toast(error.message, 'err'); return; }
        toast(t('Student removed from the group.'), 'ok');
        load();
      }
    );
  }

  const visible = useMemo(() => {
    if (!Array.isArray(rows)) return rows;
    const s = q.trim().toLowerCase();
    const list = rows.filter((m) => (statusFilter === 'all' || (m.status || 'unpaid') === statusFilter)
      && (levelFilter === 'all' || String(m.level) === levelFilter) && (!s || (m.name || '').toLowerCase().includes(s)));
    const cmp = {
      name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
      joined: (a, b) => new Date(b.joined_at || 0) - new Date(a.joined_at || 0),
      level: (a, b) => (b.level || 0) - (a.level || 0),
    }[sort];
    return list.slice().sort(cmp);
  }, [rows, q, statusFilter, levelFilter, sort]);

  const counts = useMemo(() => {
    const c = { all: 0, unpaid: 0, active: 0, blocked: 0 };
    (Array.isArray(rows) ? rows : []).forEach((m) => { c.all += 1; c[m.status || 'unpaid'] = (c[m.status || 'unpaid'] || 0) + 1; });
    return c;
  }, [rows]);

  const statusLabels = { unpaid: t('Unpaid'), active: t('Active (paid)'), blocked: t('Blocked') };
  const allPicked = Array.isArray(visible) && visible.length > 0 && visible.every((m) => picked.has(m.user_id));
  const togglePick = (id) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(visible.map((m) => m.user_id)));

  function exportCsv() {
    const lines = [[t('Name'), t('Status'), t('Level'), t('Joined')].map(csvCell).join(',')]
      .concat(visible.map((m) => [m.name, m.status, m.level, m.joined_at ? String(m.joined_at).slice(0, 10) : ''].map(csvCell).join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'students-' + code + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const loading = rows === null && !!g;
  const filtersOn = q || statusFilter !== 'all' || levelFilter !== 'all';

  return (
    <section className="page active" id="page-students">
      <PageHeader title={t('Students')} sub={g ? g.name + ' · ' + t('Status and level of every student') : t('Select a group from the switcher above.')}>
        {Array.isArray(visible) && visible.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>
          <Ico><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Ico>{t('Export CSV')}</button>}
      </PageHeader>

      {myGroups.length > 1 && (
        <div className="a-chips" id="studentsGroupTabs" role="tablist">
          {myGroups.filter((mg) => mg.is_active || mg.code === code).map((mg) => (
            <button type="button" role="tab" aria-selected={mg.code === code} key={mg.code} className={'a-chip-btn' + (mg.code === code ? ' on' : '')} onClick={() => setCurrentGroupCode(mg.code)}>{mg.name}</button>
          ))}
        </div>
      )}

      <div className="a-stats a-stats-sm">
        <StatCard loading={loading} tone="var(--a-blue)" label={t('Total students')} value={counts.all} icon={<Ico><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></Ico>} onClick={() => setStatusFilter('all')} />
        <StatCard loading={loading} tone="var(--a-green)" label={t('Active (paid)')} value={counts.active} icon={<Ico><path d="M20 6 9 17l-5-5" /></Ico>} onClick={() => setStatusFilter('active')} />
        <StatCard loading={loading} tone="var(--a-amber)" label={t('Unpaid')} value={counts.unpaid} icon={<Ico><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></Ico>} onClick={() => setStatusFilter('unpaid')} />
        <StatCard loading={loading} tone="var(--a-rose)" label={t('Blocked')} value={counts.blocked} icon={<Ico><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></Ico>} onClick={() => setStatusFilter('blocked')} />
      </div>

      <div className="panel a-flush">
        <div className="a-toolbar">
          <SearchInput value={q} onChange={setQ} placeholder={t('Search by name…')} />
          <Segmented value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'all', label: t('All'), count: counts.all }, { value: 'active', label: statusLabels.active, count: counts.active },
            { value: 'unpaid', label: statusLabels.unpaid, count: counts.unpaid }, { value: 'blocked', label: statusLabels.blocked, count: counts.blocked }]} />
          <div className="a-toolbar-end">
            <select className="a-select" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} aria-label={t('Level')}>
              <option value="all">{t('Level')}: {t('All')}</option>
              {LEVELS.map((l) => <option key={l} value={String(l)}>{t('Level')} {l}</option>)}
            </select>
            <select className="a-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('Sort')}>
              {Object.keys(SORTS).map((k) => <option key={k} value={k}>{t(SORTS[k])}</option>)}
            </select>
          </div>
        </div>

        {picked.size > 0 && (
          <div className="a-bulk" role="region" aria-label={t('Selected')}>
            <b>{picked.size} {t('selected')}</b>
            <span className="a-bulk-sp" />
            <span className="a-bulk-level">
              <select className="a-select" value={bulkLevel} disabled={busy} onChange={(e) => setBulkLevel(e.target.value)} aria-label={t('Level')}>
                <option value="">{t('Set level')}…</option>
                {LEVELS.map((l) => <option key={l} value={String(l)}>{t('Level')} {l}</option>)}
              </select>
              <button type="button" className="btn btn-gold btn-sm" disabled={busy || !bulkLevel} onClick={bulkLevelApply}>{t('Apply')}</button>
            </span>
            {STATUSES.map((s) => <button type="button" key={s} disabled={busy} className={'btn btn-ghost btn-sm chip-status-' + s + ' a-bulk-btn'} onClick={() => bulkStatus(s)}>{statusLabels[s]}</button>)}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>{t('Clear')}</button>
          </div>
        )}

        <div className="a-table-wrap a-flat">
          <table>
            <thead><tr>
              <th style={{ width: 40 }}><input type="checkbox" className="a-check" checked={allPicked} onChange={toggleAll} aria-label={t('Select all')} /></th>
              <th>{t('Name')}</th><th>{t('Status')}</th><th>{t('Level')}</th><th>{t('Joined')}</th><th></th></tr></thead>
            <tbody id="studentsBody">
              {!g ? <tr className="empty-row"><td colSpan={6}><EmptyState title={t('Select a group')} /></td></tr>
                : loading ? [0, 1, 2, 3, 4].map((i) => <tr key={i} className="empty-row"><td colSpan={6}><Skeleton h={30} /></td></tr>)
                : rows.length === 0 ? <tr className="empty-row"><td colSpan={6}><EmptyState title={t('There are no students in this group yet.')} hint={t('Share the group code so students can join.')} /></td></tr>
                : visible.length === 0 ? <tr className="empty-row"><td colSpan={6}><EmptyState title={t('No students match your search.')}>
                  {filtersOn && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setStatusFilter('all'); setLevelFilter('all'); }}>{t('Clear filters')}</button>}</EmptyState></td></tr>
                : visible.map((m) => (
                  <tr key={m.user_id} className={picked.has(m.user_id) ? 'is-picked' : ''}>
                    <td><input type="checkbox" className="a-check" checked={picked.has(m.user_id)} onChange={() => togglePick(m.user_id)} aria-label={m.name || t('Student')} /></td>
                    <td><div className="a-cell-user"><Avatar name={m.name || '?'} src={m.avatar_url} /><div style={{ minWidth: 0 }}><b>{m.name || t('Student')}</b></div></div></td>
                    <td>
                      <select className={'chip-select chip-status-' + (m.status || 'unpaid')} value={m.status || 'unpaid'} aria-label={t('Status')}
                              onChange={async (e) => { if (await changeStatus(m.user_id, e.target.value)) toast(t('Status updated.'), 'ok'); }}>
                        {STATUSES.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
                      </select>
                    </td>
                    <td>
                      <LevelStepper value={m.level} max={MAX_LEVEL} label={t('Level')}
                        onCommit={async (n) => { if (await changeLevel(m.user_id, n)) { toast(t('Level updated.'), 'ok'); return true; } return false; }} />
                    </td>
                    <td className="muted">{fmtDate(m.joined_at)}</td>
                    <td className="a-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => goToAnnouncements(m.user_id, m.name)}>{t('Message')}</button>
                      {isSuper && <button className="btn btn-danger btn-sm" onClick={() => remove(m)}>{t('Remove')}</button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {Array.isArray(visible) && rows.length > 0 && <div className="a-foot-note">{t('Showing')} {visible.length} {t('of')} {rows.length}</div>}
      </div>
    </section>
  );
}
