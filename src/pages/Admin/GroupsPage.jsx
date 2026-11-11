import { LEVEL_LIST, MAX_LEVEL } from '../../lib/levels';
import { safeHttpUrl } from '../../lib/safeUrl';
import { viewerIsOnTashkentTime, entryInViewerZone, viewerGmtLabel } from '../../lib/tzTime';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import { EditIcon, Modal, Switch } from '../../components/panel/ui';
import { Avatar, EmptyState, Ico, PageHeader, SearchInput, Segmented, StatCard } from './ui';
import { DAYS, dayLabel } from '../../lib/panelUtils';
import useJoinCodes from '../../lib/useJoinCodes';
import useLiveRefresh from '../../lib/liveRefresh';
import { closedReason, levelErrorText } from '../../lib/levelErrors';

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// At most 7 class-group series: the letter is the permanent identity (audio names are tied to it), the level changes.
const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const letterOfGroup = (g) => (g && g.letter) || ((String(g && g.name || '').match(/^(?:group|guruh)[ _-]*([A-G])/i) || [])[1] || '').toUpperCase() || null;
function groupErrorText(t, err) {
  const m = (err && err.message) || String(err || '');
  if (/GROUP_LETTER_TAKEN/.test(m)) return t('This letter is already used by another group. Choose a free letter.');
  if (/GROUP_LETTER_REQUIRED/.test(m)) return t('Choose the group letter (A–G).');
  if (/GROUP_LEVEL_REQUIRED/.test(m)) return t('Choose a level') + ' (1–' + MAX_LEVEL + ').';
  if (/NOT_ALLOWED/.test(m)) return t('Only the main admin can create groups.');
  if (/groups_letter_level_uidx|23505/.test(m + (err && err.code || ''))) return t('This letter already has a group on that level.');
  return levelErrorText(t, err);
}

// Internal group key for NEW groups: 'G' + 6 chars (letters and digits, no look-alikes) — always contains letters.
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newGroupKey() {
  const bytes = new Uint8Array(6);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  let k = 'G';
  for (let i = 0; i < bytes.length; i++) k += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  return k;
}

export default function GroupsPage() {
  const { t, allGroups: myGroups, toast, reloadGroups, askConfirm } = usePanel();   // all groups, inactive ones too: this is the only page that shows them
  const [modal, setModal] = useState({ open: false, group: null });
  const { joinCodes } = useJoinCodes(myGroups.map((g) => g.code));
  const [counts, setCounts] = useState(null);
  const [stranded, setStranded] = useState([]);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('active');
  const [series, setSeries] = useState(null); // letter whose level groups are open in the levels window
  const [fType, setFType] = useState('all');
  const [view, setView] = useState(() => { try { return localStorage.getItem('ufuq-admin-groups-view') || 'cards'; } catch (e) { return 'cards'; } });
  const setViewSaved = (v) => { setView(v); try { localStorage.setItem('ufuq-admin-groups-view', v); } catch (e) { /* ignore */ } };

  useEffect(() => {   // a group whose final-exam deadline has passed is switched off here too (the server also does it by itself)
    (async () => { try { const { data } = await supabase.rpc('ufuq_sweep_group_deadlines'); if (data) reloadGroups({ silent: true }); } catch (e) { /* non-fatal */ } })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Students per group = real students (the server leaves out test accounts and staff). Until that function exists on the
  // database the members are counted as before. Also: the students who sit in a switched-off group and in no running one.
  const loadCounts = useCallback(async () => {
    if (myGroups.length === 0) { setCounts({}); setStranded([]); return; }
    let c = null;
    try {
      const r = await supabase.rpc('staff_group_student_counts');
      if (!r.error && Array.isArray(r.data)) { c = {}; r.data.forEach((x) => { c[x.group_code] = x.students || 0; }); }
    } catch (e) { /* older database */ }
    if (!c) {
      const { data } = await supabase.from('group_members').select('group_code').in('group_code', myGroups.map((g) => g.code));
      c = {}; (data || []).forEach((m) => { c[m.group_code] = (c[m.group_code] || 0) + 1; });
    }
    setCounts((cur) => (JSON.stringify(cur) === JSON.stringify(c) ? cur : c));
    let s = [];
    try { const r = await supabase.rpc('staff_stranded_students'); if (!r.error && Array.isArray(r.data)) s = r.data; } catch (e) { /* older database */ }
    setStranded((cur) => (JSON.stringify(cur) === JSON.stringify(s) ? cur : s));
  }, [myGroups]);
  useEffect(() => { loadCounts(); }, [loadCounts]);
  useLiveRefresh(loadCounts);

  const stats = useMemo(() => ({
    all: myGroups.filter((g) => g.is_active || g.type === 'individual').length, active: myGroups.filter((g) => g.is_active).length, inactive: myGroups.filter((g) => !g.is_active).length,
    // running groups only: a letter keeps 14 level rows, of which one or two run at a time
    cls: myGroups.filter((g) => g.is_active && g.type !== 'individual').length, ind: myGroups.filter((g) => g.is_active && g.type === 'individual').length,
  }), [myGroups]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return myGroups.filter((g) => (fStatus === 'all' || (fStatus === 'active') === !!g.is_active)
      && (fType === 'all' || (fType === 'individual') === (g.type === 'individual'))
      && !(!g.is_active && g.type !== 'individual' && letterOfGroup(g))   // switched-off level groups live inside their letter card
      && (!s || (g.name || '').toLowerCase().includes(s) || String(joinCodes[g.code] || '').toLowerCase().includes(s)));
  }, [myGroups, q, fStatus, fType, joinCodes]);

  // Lettered class groups come as one compact card per letter (all 14 level groups inside); a group card only for active ones.
  const seriesList = useMemo(() => {
    const s2 = q.trim().toLowerCase();
    const by = {};
    myGroups.filter((g) => g.type !== 'individual' && letterOfGroup(g)).forEach((g) => { (by[letterOfGroup(g)] = by[letterOfGroup(g)] || []).push(g); });
    return Object.keys(by).sort().map((L) => ({ letter: L, groups: by[L].slice().sort((a, b) => (a.level || 0) - (b.level || 0)) }))
      .filter((x) => !s2 || ('group ' + x.letter).toLowerCase().includes(s2) || x.groups.some((g) => (g.name || '').toLowerCase().includes(s2)));
  }, [myGroups, q]);
  const showSeries = fType !== 'individual' && (fStatus === 'inactive' || fStatus === 'all');
  const showGroups = fStatus !== 'inactive' || fType !== 'class';

  // Switching a group OFF is one click on the card's switch, so ask first; switching it back on stays instant.
  function toggleActive(g) {
    if (!g.is_active) { saveActive(g); return; }
    const n = (counts && counts[g.code]) || 0;   // students still inside: they would be left without lessons
    askConfirm(t('Switch off group'),
      n > 0
        ? t('{n} students are still in {name}. If you switch it off they see no lessons until you move them to a running group (they will be listed on this page). Switch it off?').replace('{n}', n).replace('{name}', g.name)
        : t('Switch off {name}? It moves to the inactive groups. You can switch it back on at any time.').replace('{name}', g.name),
      () => saveActive(g), t('Switch off group'));
  }
  async function saveActive(g) {
    const { error } = await supabase.from('groups').update({ is_active: !g.is_active }).eq('code', g.code);
    if (error) { toast(error.message, 'err'); return; }
    toast(t('Group updated.'), 'ok');
    await reloadGroups({ silent: true });
    loadCounts();
  }
  async function copyCode(g) {
    const text = String(joinCodes[g.code] || '');
    if (!text) { toast(t('This group has no join code yet.'), 'err'); return; }
    try { await navigator.clipboard.writeText(text); toast(t('Copied') + ': ' + text, 'ok'); } catch (e) { toast(text, 'ok'); }
  }
  const openNew = () => setModal({ open: true, group: null });
  const openEdit = (g) => setModal({ open: true, group: g });
  const TypeChip = ({ g }) => (g.type === 'individual' ? <span className="chip chip-type-individual">{t("Qur'an lesson")}</span> : <span className="chip chip-type-class">{t('Arabic language')}</span>);
  const zoomLink = (g) => (g.zoom_link ? <a href={safeHttpUrl(g.zoom_link) || '#'} target="_blank" rel="noopener noreferrer" className="a-link">Zoom ↗</a> : null);

  return (
    <section className="page active" id="page-groups">
      <PageHeader title={t('Group')} sub={t('Create groups and manage their schedule and Zoom link.')}>
        <button className="btn btn-gold" id="newGroupBtn" onClick={openNew}><Ico><path d="M12 5v14M5 12h14" /></Ico>{t('New group')}</button>
      </PageHeader>

      <div className="a-stats a-stats-sm">
        <StatCard tone="var(--gold)" label={t('All your groups')} value={stats.all} icon={<Ico><path d="m12 2 10 5-10 5L2 7l10-5Z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></Ico>} onClick={() => { setFStatus('all'); setFType('all'); }} />
        <StatCard tone="var(--a-green)" label={t('Active')} value={stats.active} icon={<Ico><path d="M20 6 9 17l-5-5" /></Ico>} onClick={() => setFStatus('active')} />
        <StatCard tone="var(--gold)" label={t('Arabic language')} value={stats.cls} icon={<Ico><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Ico>} onClick={() => setFType('class')} />
        <StatCard tone="var(--a-quran)" label={t("Qur'an lesson")} value={stats.ind} icon={<Ico><circle cx="12" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /></Ico>} onClick={() => setFType('individual')} />
      </div>

      <StrandedPanel rows={stranded} groups={myGroups} onDone={async () => { await reloadGroups({ silent: true }); loadCounts(); }} />

      <div className="a-toolbar a-toolbar-solo a-toolbar-groups">
        <SearchInput value={q} onChange={setQ} placeholder={t('Search groups…')} />
        <Segmented value={fStatus} onChange={setFStatus} options={[{ value: 'all', label: t('All') }, { value: 'active', label: t('Active'), count: stats.active }, { value: 'inactive', label: t('Inactive'), count: stats.inactive }]} />
        <Segmented value={fType} onChange={setFType} options={[{ value: 'all', label: t('All') }, { value: 'class', label: t('Arabic language') }, { value: 'individual', label: t("Qur'an lesson") }]} />
        <div className="a-toolbar-end">
          <div className={'a-viewtoggle' + (view === 'table' ? ' is-compact' : '')} role="group" aria-label={t('View')}>
            <span className="a-vt-thumb" aria-hidden="true" />
            <button type="button" className={view === 'cards' ? 'on' : ''} aria-pressed={view === 'cards'} onClick={() => setViewSaved('cards')} title={t('Large view')}>
              <Ico><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Ico>
              <span>{t('Large')}</span>
            </button>
            <button type="button" className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => setViewSaved('table')} title={t('Compact view')}>
              <Ico><path d="M4 6h16M4 12h16M4 18h16" /></Ico>
              <span>{t('Compact')}</span>
            </button>
          </div>
        </div>
      </div>

      {myGroups.length === 0 ? (
        <div className="panel"><EmptyState title={t('No groups yet')} hint={t('You don\'t have any groups yet. Click "+ New group" to add one.')}>
          <button className="btn btn-gold btn-sm" onClick={openNew}>{t('+ New group')}</button></EmptyState></div>
      ) : list.length === 0 && !(showSeries && seriesList.length > 0) ? (
        <div className="panel"><EmptyState title={t('No groups match your filters.')}><button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setFStatus('all'); setFType('all'); }}>{t('Clear filters')}</button></EmptyState></div>
      ) : list.length === 0 ? null : view === 'cards' ? (
        <div className="a-cards" id="groupsBody">
          {list.map((g) => {
            const ind = g.type === 'individual';
            const days = Array.isArray(g.schedule_days) ? g.schedule_days : [];
            return (
              <article className={'a-gcard' + (g.is_active ? '' : ' is-off')} key={g.code}>
                <header>
                  <Avatar name={g.name || '?'} size={42} tone={ind ? 'quran' : 'arabic'} />
                  <div className="a-gcard-t"><h4>{g.name}</h4><TypeChip g={g} /><ClosedChip g={g} /></div>
                  <button type="button" className="icon-btn" title={t('Edit')} aria-label={t('Edit')} onClick={() => openEdit(g)}><EditIcon /></button>
                </header>
                <div className="a-gcard-meta">
                  <button type="button" className="a-code" onClick={() => copyCode(g)} title={t('Copy join code')}>
                    <small>{t('Join code')}</small><b>{joinCodes[g.code] || '—'}</b>
                    <Ico><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Ico>
                  </button>
                  <div className="a-gcard-num"><b>{counts ? (counts[g.code] || 0) : '…'}</b><small>{t('Students')}</small></div>
                </div>
                <div className="a-gcard-sched">
                  {ind ? <span className="muted">{g.schedule || t('One-on-one slots')}</span>
                    : days.length ? days.map((d, i) => { const z = viewerIsOnTashkentTime() ? null : entryInViewerZone(d); return z ? <span className="a-day" key={i} title={dayLabel(t, d.day) + ' ' + d.time + ' (' + t('Tashkent time') + ')'}>{dayLabel(t, z.day).slice(0, 3)} <b>{z.time}</b></span> : <span className="a-day" key={i}>{dayLabel(t, d.day).slice(0, 3)} <b>{d.time}</b></span>; })
                    : <span className="muted">{g.schedule || '\u2014'}</span>}
                </div>
                <footer>
                  <label className="a-switch-row" onClick={(e) => { e.preventDefault(); toggleActive(g); }}>
                    <Switch on={!!g.is_active} /><span>{g.is_active ? t('Active') : t('Inactive')}</span>
                  </label>
                  {zoomLink(g)}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel a-flush"><div className="a-table-wrap a-flat">
          <table>
            <thead><tr><th>{t('Name')}</th><th>{t('Join code')}</th><th>{t('Type')}</th><th>{t('Schedule')}</th><th>{t('Students')}</th><th>Zoom</th><th>{t('Status')}</th><th></th></tr></thead>
            <tbody id="groupsBody">
              {list.map((g) => (
                <tr key={g.code}>
                  <td><div className="a-cell-user"><Avatar name={g.name || '?'} size={32} tone={g.type === 'individual' ? 'quran' : 'arabic'} /><b>{g.name}</b></div></td>
                  <td><button type="button" className="a-code a-code-inline" onClick={() => copyCode(g)}>{joinCodes[g.code] || '—'}</button></td>
                  <td><TypeChip g={g} /></td>
                  <td className="muted">{g.type === 'individual' ? '\u2014' : (g.schedule || '\u2014')}</td>
                  <td>{counts ? (counts[g.code] || 0) : '…'}</td>
                  <td>{zoomLink(g) || <span className="muted">{'\u2014'}</span>}</td>
                  <td><label className="a-switch-row" onClick={(e) => { e.preventDefault(); toggleActive(g); }}><Switch on={!!g.is_active} /></label></td>
                  <td className="a-actions"><button className="icon-btn" title={t('Edit')} aria-label={t('Edit')} onClick={() => openEdit(g)}><EditIcon /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {myGroups.length > 0 && showSeries && seriesList.length > 0 && (
        <>
          <h3 className="a-series-h">{t('Level groups')} <small>{t('Each letter keeps all 14 levels. Open a letter to switch its levels on or off.')}</small></h3>
          <div className="a-cards a-series">
            {seriesList.map((x) => {
              const act = x.groups.filter((g) => g.is_active);
              const total = x.groups.reduce((n, g) => n + ((counts && counts[g.code]) || 0), 0);
              return (
                <article className="a-gcard a-series-card" key={x.letter} role="button" tabIndex={0} onClick={() => setSeries(x.letter)}
                         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSeries(x.letter); } }}>
                  <header>
                    <Avatar name={x.letter} size={42} tone="arabic" />
                    <div className="a-gcard-t"><h4>{t('Group')} {x.letter}</h4><span className="chip chip-type-class">{x.groups.length} {t('levels')}</span></div>
                    <span className="a-series-go" aria-hidden="true">{'›'}</span>
                  </header>
                  <div className="a-gcard-sched">
                    {act.length ? act.map((g) => <span className="a-day" key={g.code}>{g.name} <b>{t('Active')}</b></span>) : <span className="muted">{t('No active level')}</span>}
                  </div>
                  <footer><span className="muted">{total} {t('Students')}</span><span className="a-link">{t('Open levels')}</span></footer>
                </article>
              );
            })}
          </div>
        </>
      )}
      <LevelsModal letter={series} groups={(seriesList.find((x) => x.letter === series) || { groups: [] }).groups} counts={counts} joinCodes={joinCodes}
                   onClose={() => setSeries(null)} onToggle={toggleActive} onCopy={copyCode} onEdit={(g) => { setSeries(null); openEdit(g); }} />
      <GroupModal open={modal.open} group={modal.group} onClose={() => setModal((m) => ({ ...m, open: false }))} />
    </section>
  );
}

/** Why a switched-off class group is off (only the automatic reasons get a chip). */
function ClosedChip({ g }) {
  const { t } = usePanel();
  const r = closedReason(g);
  if (r === 'deadline') return <span className="chip" title={t('Closed automatically: the final exam deadline has passed. Decide for the students who did not hand in.')}>{t('Deadline passed')}</span>;
  if (r === 'moved_on') return <span className="chip" title={t('Closed automatically: its last student moved to another level group.')}>{t('Students moved on')}</span>;
  return null;
}

/**
 * Students who sit in a switched-off class group and in no running one: they see no lessons, and no other page lists them
 * (every other page shows running groups only). Each one is moved to a running group here; his level becomes that group's level.
 * The suggested group is the nearest running level at or below his own, his own letter first.
 */
function StrandedPanel({ rows, groups, onDone }) {
  const { t, toast, askConfirm } = usePanel();
  const [pick, setPick] = useState({});
  const [busy, setBusy] = useState(null);
  const targets = useMemo(() => (groups || []).filter((g) => g.is_active && g.type !== 'individual' && g.level)
    .sort((a, b) => (b.level - a.level) || String(a.name || '').localeCompare(String(b.name || ''))), [groups]);
  if (!rows || rows.length === 0) return null;

  const letterOf = (code) => letterOfGroup((groups || []).find((g) => g.code === code));
  const suggest = (r) => {
    const own = letterOf(r.group_code);
    const below = targets.filter((g) => g.level <= r.level);
    if (!below.length) return '';
    const top = below[0].level;
    const same = below.filter((g) => g.level === top);
    return (same.find((g) => letterOfGroup(g) === own) || same[0]).code;
  };
  const chosen = (r) => (Object.prototype.hasOwnProperty.call(pick, r.user_id) ? pick[r.user_id] : suggest(r));
  const why = { deadline: t('Deadline passed'), moved_on: t('Students moved on'), manual: t('Switched off') };

  function move(r) {
    const code = chosen(r);
    const g = targets.find((x) => x.code === code);
    if (!g) return;
    askConfirm(t('Move student'),
      t('{name}: move to {group}? The level becomes {level} and the exams of that level start fresh.').replace('{name}', r.name || t('Student')).replace('{group}', g.name).replace('{level}', g.level),
      async () => {
        setBusy(r.user_id);
        const { error } = await supabase.rpc('admin_move_student_to_group', { p_user: r.user_id, p_group_code: g.code });
        setBusy(null);
        if (error) { toast(levelErrorText(t, error), 'err'); return; }
        toast(t('Student moved to {group}.').replace('{group}', g.name), 'ok');
        onDone();
      }, t('Move'));
  }

  return (
    <div className="panel a-stranded" role="region" aria-label={t('Students in switched-off groups')}>
      <div className="panel-head"><h3>{t('Students in switched-off groups')} <span className="chip">{rows.length}</span></h3></div>
      <p className="hint">{t('These students are in a group that is switched off, so they see no lessons. Move each one to a running group, or switch the group back on.')}</p>
      <div className="a-lv-list">
        {rows.map((r) => (
          <div className="a-lv-row" key={r.user_id + r.group_code}>
            <Avatar name={r.name || '?'} size={30} />
            <div className="a-lv-name"><b>{r.name || t('Student')}</b><small>{r.group_name} · {t('Level')} {r.level} · {why[r.reason] || why.manual}</small></div>
            {targets.length === 0 ? <span className="muted">{t('No group is running.')}</span> : (
              <>
                <select className="a-select" aria-label={t('Move to')} value={chosen(r)} disabled={busy === r.user_id}
                        onChange={(e) => setPick((cur) => ({ ...cur, [r.user_id]: e.target.value }))}>
                  <option value="">{t('Move to')}…</option>
                  {targets.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                </select>
                <button type="button" className="btn btn-gold btn-sm" disabled={busy === r.user_id || !chosen(r)} onClick={() => move(r)}>{t('Move')}</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** All level groups of one letter (1-14): switch each on or off. A level switches on by itself when a student reaches it. */
function LevelsModal({ letter, groups, counts, joinCodes, onClose, onToggle, onCopy, onEdit }) {
  const { t } = usePanel();
  return (
    <Modal open={!!letter} onClose={onClose} style={{ maxWidth: 560 }}>
      <h3>{t('Group')} {letter} — {t('levels')}</h3>
      <p className="hint">{t('Students move up one by one when they pass a level: the next level switches on for the first of them and the old level switches off when its last student has left. You can also switch a level on or off here.')}</p>
      <div className="a-lv-list">
        {groups.map((g) => (
          <div className={'a-lv-row' + (g.is_active ? ' on' : '')} key={g.code}>
            <span className="a-lv-no">{g.level || '—'}</span>
            <div className="a-lv-name"><b>{g.name}</b>{closedReason(g) === 'deadline' ? <small>{t('Deadline passed')}</small> : closedReason(g) === 'moved_on' ? <small>{t('Students moved on')}</small> : null}</div>
            <span className={'a-lv-n' + (!g.is_active && counts && counts[g.code] > 0 ? ' warn' : '')} title={!g.is_active && counts && counts[g.code] > 0 ? t('Students are still in this switched-off group.') : undefined}>{counts ? (counts[g.code] || 0) : '…'} <small>{t('Students')}</small></span>
            <button type="button" className="a-code a-code-inline" title={t('Copy join code')} onClick={() => onCopy(g)}>{joinCodes[g.code] || '—'}</button>
            <button type="button" className="icon-btn" title={t('Edit')} aria-label={t('Edit')} onClick={() => onEdit(g)}><EditIcon /></button>
            <label className="a-switch-row" onClick={(e) => { e.preventDefault(); onToggle(g); }}><Switch on={!!g.is_active} /><span>{g.is_active ? t('Active') : t('Inactive')}</span></label>
          </div>
        ))}
      </div>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>{t('Close')}</button></div>
    </Modal>
  );
}

/** New / Edit group dialog (#groupModalOverlay). */
function GroupModal({ open, group: g, onClose }) {
  const { t, toast, user, reloadGroups, allGroups: myGroups } = usePanel();
  const [f, setF] = useState(blank());
  // Letters that already run a series (any class row with a level or switched on). A..G only: 7 groups at most.
  const takenLetters = useMemo(() => new Set((myGroups || []).filter((x) => x.type !== 'individual' && (x.level || x.is_active)).map((x) => letterOfGroup(x)).filter(Boolean)), [myGroups]);
  const freeLetters = GROUP_LETTERS.filter((l) => !takenLetters.has(l));
  const [days, setDays] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [typeLocked, setTypeLocked] = useState(false);

  function blank() {
    return { code: '', name: '', letter: '', level: '', schedule: '', zoom: '', active: true, type: 'class', slot: 10, buffer: 2, noShow: 3 };
  }

  // Re-initialise every time the dialog opens (the old openGroupModal()).
  useEffect(() => {
    if (!open) return undefined;
    setF(g ? {
      code: g.code, name: g.type === 'individual' ? g.name : String(g.name || '').replace(/\d+$/, ''), letter: letterOfGroup(g) || '', level: g.level ? String(g.level) : '', schedule: g.schedule || '', zoom: g.zoom_link || '', active: !!g.is_active,
      type: g.type === 'individual' ? 'individual' : 'class',
      slot: g.slot_minutes || 10, buffer: g.buffer_minutes || 2, noShow: g.no_show_minutes || 3,
    } : blank());
    setDays(g && Array.isArray(g.schedule_days) ? JSON.parse(JSON.stringify(g.schedule_days)) : []);
    setError('');
    setTypeLocked(false);
    // Once a group has any scheduled individual slots, changing its type would orphan that data — lock the selector.
    let cancelled = false;
    if (g) {
      (async () => {
        const { count } = await supabase.from('group_slots').select('id', { count: 'exact', head: true }).eq('group_code', g.code);
        if (!cancelled) setTypeLocked((count || 0) > 0);
      })();
    }
    return () => { cancelled = true; };
  }, [open, g]);

  const isIndividual = f.type === 'individual';
  // A level group keeps its level for good: students change level one by one (exams, or the Students page), the row is never renumbered.
  const levelLocked = !!g && g.type !== 'individual' && !!g.level;
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));

  const addDay = () => {
    // Default the new row to the first weekday that isn't already used, so teachers can't accidentally end up
    // with two rows for the same day (which used to make Join Class silently check the wrong time).
    const used = days.map((d) => d.day);
    const free = DAYS.find((d) => used.indexOf(d) === -1) || 'Monday';
    setDays([...days, { day: free, time: '18:00' }]);
  };
  const setDay = (i, k, v) => setDays((cur) => cur.map((d, idx) => (idx === i ? { ...d, [k]: v } : d)));

  async function submit(e) {
    e.preventDefault();
    setError('');
    const name = f.name.trim();
    const schedule = f.schedule.trim();
    const zoom_link = f.zoom.trim();
    const type = isIndividual ? 'individual' : 'class';
    const slot_minutes = Math.max(1, parseInt(f.slot, 10) || 10);
    const buffer_minutes = Math.max(0, parseInt(f.buffer, 10) || 0);
    const no_show_minutes = Math.max(1, parseInt(f.noShow, 10) || 3);
    if (!zoom_link) { setError(t('Please enter the Zoom link.')); return; }
    if (!/^https?:\/\//i.test(zoom_link) || !safeHttpUrl(zoom_link)) { setError(t('The Zoom link must start with https://')); return; }
    const levelNum = type === 'class' && f.level ? Math.round(Number(f.level)) : null;
    if (type === 'class' && !(levelNum >= 1 && levelNum <= MAX_LEVEL)) { setError(t('Choose a level') + ' (1–' + MAX_LEVEL + ').'); return; }
    if (type === 'class' && !g && !GROUP_LETTERS.includes(f.letter)) { setError(t('Choose the group letter (A–G).')); return; }
    if (type === 'individual' && !name) { setError(t('Please enter the group name.')); return; }
    if (type === 'class' && !schedule) { setError(t('Please fill in the schedule text for students.')); return; }
    for (let i = 0; i < days.length; i++) {
      if (!TIME_RE.test(days[i].time)) { setError(t('Invalid time format (must be HH:MM, e.g. 18:00).')); return; }
    }
    // Block saving if two rows target the same weekday — Join Class would check a different (often stale) time.
    const seen = {};
    for (let i = 0; i < days.length; i++) {
      const d = days[i].day;
      if (seen[d]) { setError(t('You have two schedule rows for the same day ({day}). Remove one before saving.').replace('{day}', d)); return; }
      seen[d] = true;
    }
    setSaving(true);
    try {
      const daysToSave = type === 'individual' ? [] : days;
      const fields = { level: levelNum, schedule, zoom_link, is_active: f.active, schedule_days: daysToSave, type, slot_minutes, buffer_minutes, no_show_minutes };
      if (type === 'individual') fields.name = name;      // a class group is named by the server: "Group " + letter + level
      if (levelLocked && type === 'class') delete fields.level;
      if (g) {
        const { error: err } = await supabase.from('groups').update(fields).eq('code', g.code);
        if (err) throw err;
        toast(t('Group updated.'), 'ok');
      } else if (type === 'class') {
        // Atomic on the server: letter A–G not used yet + level, join code, teacher link (no half-made group is possible).
        const { error: err } = await supabase.rpc('create_class_group', { p_letter: f.letter, p_level: levelNum, p_schedule: schedule, p_zoom: zoom_link, p_days: daysToSave, p_active: f.active });
        if (err) throw err;
        toast(t('New group created.'), 'ok');
      } else {
        // The internal key is generated here (letters + digits); admins never type or see it.
        let code = '';
        let lastErr = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          code = newGroupKey();
          const { error: err } = await supabase.from('groups').insert({ code, ...fields });
          if (!err) { lastErr = null; break; }
          lastErr = err;
          if (err.code !== '23505') break; // only a key collision is worth retrying
        }
        if (lastErr) throw lastErr;
        const { error: tgErr } = await supabase.from('teacher_groups').insert({ teacher_id: user.id, group_code: code });
        if (tgErr) throw tgErr;
        let jcErr = null;
        try { const jc = await supabase.rpc('generate_group_join_code', { p_group_code: code }); jcErr = jc.error || null; } catch (e) { jcErr = e; }
        if (jcErr) toast(t('The group was created, but its join code could not be generated:') + ' ' + (jcErr.message || ''), 'err');
        else toast(t('New group created.'), 'ok');
      }
      onClose();
      await reloadGroups();
    } catch (err) {
      setError(groupErrorText(t, err) || t('An unknown error occurred.'));
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} id="groupModalOverlay">
      <h3 id="groupModalTitle">{g ? t('Edit group') : t('New group')}</h3>
      <form id="groupForm" onSubmit={submit}>
        {isIndividual && (
          <div className="field-row">
            <div className="field">
              <label>{t('Group name')}</label>
              <input type="text" id="groupName" required value={f.name} onChange={(e) => set('name', e.target.value)} />
            </div>
          </div>
        )}
        {!isIndividual && (
          <div className="field-row">
            <div className="field">
              <label>{t('Group letter')}</label>
              {g ? (
                <input type="text" value={f.letter || '—'} disabled aria-readonly="true" />
              ) : (
                <select value={f.letter} onChange={(e) => set('letter', e.target.value)} style={{ width: '100%' }} required>
                  <option value="">{t('Choose a letter')}</option>
                  {freeLetters.map((l) => <option key={l} value={l}>{t('Group')} {l}</option>)}
                </select>
              )}
              <p className="hint">{g ? t('The letter never changes: chat, audio names and history stay tied to it.') : (freeLetters.length ? t('Only A–G exist (7 groups at most). Letters already in use are not listed.') : t('All 7 letters (A–G) are already used, so no new group can be created.'))}</p>
            </div>
            <div className="field">
              <label>{t('Level')}</label>
              {levelLocked ? (
                <input type="text" value={t('Level') + ' ' + f.level} disabled aria-readonly="true" />
              ) : (
                <select value={f.level} onChange={(e) => set('level', e.target.value)} style={{ width: '100%' }} required>
                  <option value="">{t('Choose a level')}</option>
                  {LEVEL_LIST.map((l) => <option key={l} value={String(l)}>{t('Level')} {l}</option>)}
                </select>
              )}
              <p className="hint">{levelLocked
                ? t('The level of a group never changes. Students move to the next level group when they pass the exams; to move one student by hand use the Students page.')
                : t('The group is named from its letter and level (Group A8). Every student moves up on his own as soon as he passes the level exams. The group switches off by itself when its last student has moved on, or when the final exam deadline ends.')}</p>
            </div>
          </div>
        )}
        <div className="field">
          <label>{t('Group type')}</label>
          <div className="a-typepick" role="radiogroup" id="groupType">
            {[['class', 'Arabic language'], ['individual', "Qur'an lesson"]].map(([v, lbl]) => (
              <button type="button" role="radio" aria-checked={f.type === v} key={v} disabled={typeLocked} className={f.type === v ? 'on' : ''} onClick={() => set('type', v)}>{t(lbl)}</button>
            ))}
          </div>
          <p className="hint" id="groupTypeLockedHint" style={{ display: typeLocked ? 'block' : 'none' }}>
            {t('This group already has scheduled slots, so its type can no longer be changed.')}
          </p>
        </div>
        <div className="field" id="groupScheduleField">
          <label>{t('Schedule text')}</label>
          <input type="text" id="groupSchedule" required={!isIndividual} value={f.schedule} onChange={(e) => set('schedule', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('Zoom link')}</label>
          <input type="url" id="groupZoom" required placeholder="https://zoom.us/j/..." value={f.zoom} onChange={(e) => set('zoom', e.target.value)} />
        </div>
        <div className="field" id="groupClassDaysField" style={{ display: isIndividual ? 'none' : 'block' }}>
          <label>{t('Class days')}</label>
          <div id="scheduleDaysList">
            {days.length === 0 ? <p className="hint">{t('No days added yet.')}</p> : days.map((d, i) => (
              <div className="schedule-day-row" key={i}>
                <select value={d.day} onChange={(e) => setDay(i, 'day', e.target.value)}>
                  {DAYS.map((dd) => <option key={dd} value={dd}>{dayLabel(t, dd)}</option>)}
                </select>
                <input type="text" value={d.time} placeholder="18:00" style={{ width: 90 }} onChange={(e) => setDay(i, 'time', e.target.value)} />
                <button type="button" className="icon-btn" onClick={() => setDays(days.filter((_, idx) => idx !== i))}>&times;</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" id="addScheduleDay" onClick={addDay}>{t('+ Add day')}</button>
          <p className="hint">{t('Times are entered in Tashkent time (GMT+5). Everyone else sees them converted to their own time automatically.')}</p>
        </div>
        <div className="field-row" id="groupIndividualFields" style={{ display: isIndividual ? 'flex' : 'none' }}>
          <div className="field">
            <label>{t('Slot minutes')}</label>
            <input type="number" id="groupSlotMinutes" min="1" max="180" value={f.slot} onChange={(e) => set('slot', e.target.value)} />
          </div>
          <div className="field">
            <label>{t('Break minutes')}</label>
            <input type="number" id="groupBufferMinutes" min="0" max="60" value={f.buffer} onChange={(e) => set('buffer', e.target.value)} />
          </div>
          <div className="field">
            <label>{t('No-show after minutes')}</label>
            <input type="number" id="groupNoShowMinutes" min="1" max="60" value={f.noShow} onChange={(e) => set('noShow', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="att-toggle" style={{ cursor: 'pointer' }} onClick={() => set('active', !f.active)}>
            <Switch on={f.active} id="groupActiveSwitch" />
            {t('Group is active (students can join)')}
          </label>
        </div>
        <p className="hint" id="groupFormError" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)' }}>{error}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="btn btn-gold" id="groupSaveBtn" disabled={saving}>{t('Save')}</button>
        </div>
      </form>
    </Modal>
  );
}
