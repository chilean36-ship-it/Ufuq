import { useCallback, useEffect, useMemo, useState } from 'react';
import useLiveRefresh from '../../lib/liveRefresh';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import { Modal } from '../../components/panel/ui';
import { Avatar, EmptyState, Ico, PageHeader, Skeleton, StatCard } from './ui';

// Kind of staff member: main admin / ordinary admin / teacher. Every change goes through SECURITY DEFINER RPCs
// (supabase/migrations/20261026_staff_teacher_groups.sql) that re-check on the server that the caller is a main admin.
const KINDS = [['super', 'Main admin'], ['standard', 'Admin'], ['teacher', 'Teacher']];
/** One entry per group SERIES (letter), not per level: "Group A" covers A7, A8, ... so the link survives promotions.
 *  Only levels that run or have run belong to a series (pre-created, never-run groups are not linked: they get their staff
 *  from the series when they are created, see 20261201c). Other groups (individual / legacy) stay single entries.
 *  extra = codes the person is already linked to that no entry covers, so such a link stays visible and removable. */
const hasRun = (g) => g.is_active !== false || !!(g.reopened_at || g.deadline_closed_at || g.moved_on_at);
function buildUnits(groups, extra) {
  const byLetter = new Map();
  const out = [];
  const covered = new Set();
  groups.forEach((g) => {
    if (g.type === 'class' && g.letter) {
      if (!hasRun(g)) return;
      if (!byLetter.has(g.letter)) { const u = { key: 'L' + g.letter, name: 'Group ' + g.letter, codes: [], activeLevel: null }; byLetter.set(g.letter, u); out.push(u); }
      const u = byLetter.get(g.letter);
      u.codes.push(g.code); covered.add(g.code);
      if (g.is_active !== false && g.level != null && (u.activeLevel == null || g.level > u.activeLevel)) u.activeLevel = g.level;
    } else if (g.is_active !== false) {
      out.push({ key: 'C' + g.code, name: g.name || '\u2014', codes: [g.code], activeLevel: null }); covered.add(g.code);
    }
  });
  const names = new Map(groups.map((g) => [g.code, g.name]));
  (extra || []).forEach((c) => { if (!covered.has(c) && names.has(c)) out.push({ key: 'X' + c, name: names.get(c) || '\u2014', codes: [c], activeLevel: null, off: true }); });
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}
const unitOn = (u, sel) => u.codes.some((c) => sel.has(c));
const unitToggle = (u, cur) => { const n = new Set(cur); if (unitOn(u, cur)) u.codes.forEach((c) => n.delete(c)); else u.codes.forEach((c) => n.add(c)); return n; };
const UnitName = ({ u, t }) => <span className="a-gp-name">{u.name}{u.activeLevel != null ? <small style={{ opacity: .65, marginInlineStart: 6 }}>{t('now')} L{u.activeLevel}</small> : null}{u.off ? <small className="muted"> · {t('switched off')}</small> : null}</span>;

const kindOf = (a) => (a.role === 'teacher' ? 'teacher' : a.admin_tier === 'standard' ? 'standard' : 'super');

/** Main admin only: appoint teachers / admins, change their type, link them to groups, remove their rights. */
export default function AdminsPage() {
  const { t, toast, askConfirm, user } = usePanel();
  const [rows, setRows] = useState(null);
  const [groups, setGroups] = useState([]);
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState('teacher');
  const [newGroups, setNewGroups] = useState(() => new Set()); // groups the new teacher / admin will work with
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const units = useMemo(() => buildUnits(groups), [groups]);
  const [picker, setPicker] = useState(null); // staff row whose groups are being edited
  const [rolePerson, setRolePerson] = useState(null); // staff row whose role is being changed
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async (opts) => {
    const [st, gr] = await Promise.all([
      supabase.rpc('admin_list_staff'),
      supabase.from('groups').select('code, name, is_active, type, letter, level, reopened_at, deadline_closed_at, moved_on_at').order('name'),
    ]);
    if (st.error) { if (!(opts && opts.silent)) setRows({ error: st.error.message }); return; }
    setRows(st.data || []);
    if (!gr.error) setGroups((gr.data || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const fail = (err) => {
    const m = err && err.message ? err.message : String(err);
    toast(m.includes('user_not_found') ? t('No account with this email. The person must sign up first.')
      : m.includes('group_not_found') ? t('One of the groups no longer exists. Refresh and try again.') : m, 'err');
  };

  async function appoint(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError(t('Enter the email of the person.')); return; }
    // A teacher / ordinary admin works only with the groups chosen here; a main admin gets every group.
    if (kind !== 'super' && newGroups.size === 0) { setError(t('Choose at least one group for this person.')); return; }
    setBusy(true);
    const { error: err } = await supabase.rpc('admin_appoint', { p_email: email.trim(), p_tier: kind });
    if (err) { setBusy(false); fail(err); return; }
    if (kind !== 'super') {
      const st = await supabase.rpc('admin_list_staff');
      const me = (st.data || []).find((a) => String(a.email || '').toLowerCase() === email.trim().toLowerCase());
      const known = new Set(groups.map((g) => g.code));
      const { error: gErr } = me ? await supabase.rpc('admin_set_staff_groups', { p_user: me.id, p_codes: [...newGroups].filter((c) => known.has(c)) }) : { error: null };
      if (gErr) { setBusy(false); fail(gErr); await load(); return; }
    }
    setBusy(false);
    toast(kind === 'teacher' ? t('Teacher appointed.') : t('Admin appointed.'), 'ok');
    setEmail(''); setNewGroups(new Set());
    await load();
  }

  async function changeKind(a, next) {
    const { error: err } = await supabase.rpc('admin_set_staff_kind', { p_user: a.id, p_kind: next });
    if (err) { fail(err); return false; }
    toast(t('Account type updated.'), 'ok');
    load();
    return true;
  }

  function revoke(a) {
    const isT = a.role === 'teacher';
    askConfirm(isT ? t('Remove teacher rights') : t('Remove admin rights'),
      (a.full_name || a.email) + ' ' + (isT ? t('will lose teacher access and become a regular student account. Continue?') : t('will lose admin access and become a regular student account. Continue?')), async () => {
        const { error: err } = await supabase.rpc('admin_revoke', { p_user: a.id });
        if (err) { fail(err); return; }
        toast(isT ? t('Teacher rights removed.') : t('Admin rights removed.'), 'ok');
        load();
      });
  }

  const list = Array.isArray(rows) ? rows : [];
  const count = (k) => list.filter((a) => kindOf(a) === k).length;
  const nameOf = useMemo(() => { const m = {}; groups.forEach((g) => { m[g.code] = g.name || ''; }); return m; }, [groups]);
  // Only running groups can be given to somebody; a switched-off level group gets its teachers when the cohort reaches it.
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((a) => (filter === 'all' || kindOf(a) === filter)
      && (!s || String(a.full_name || '').toLowerCase().includes(s) || String(a.email || '').toLowerCase().includes(s)));
  }, [list, q, filter]);
  const FILTERS = [['all', 'All', list.length], ...KINDS.map(([v, l]) => [v, l, count(v)])];

  return (
    <section className="page active" id="page-admins">
      <PageHeader title={t('Admins')} sub={t('Appoint teachers and admins and choose which groups each one works with.')} />

      <div className="a-stats a-stats-sm">
        <StatCard loading={rows === null} tone="var(--gold)" label={t('Main admin')} value={count('super')} icon={<Ico><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></Ico>} />
        <StatCard loading={rows === null} tone="var(--a-blue)" label={t('Admin')} value={count('standard')} icon={<Ico><circle cx="12" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /></Ico>} />
        <StatCard loading={rows === null} tone="var(--gold)" label={t('Teacher')} value={count('teacher')} icon={<Ico><path d="M12 7c-1.5-1.5-4-2-8-1.5v13c4-.5 6.5 0 8 1.5 1.5-1.5 4-2 8-1.5v-13c-4-.5-6.5 0-8 1.5Z" /><path d="M12 7v13" /></Ico>} />
      </div>

      <form className="panel a-appoint" onSubmit={appoint}>
        <div className="panel-head"><h3><span className="panel-head-bar" />{t('Appoint')}</h3></div>
        <div className="a-appoint-row">
          <div className="field a-appoint-email">
            <label htmlFor="adm-email">{t('Email of an existing account')}</label>
            <input id="adm-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="field">
            <label id="adm-tier-lbl">{t('Account type')}</label>
            <div className="a-seg" role="radiogroup" aria-labelledby="adm-tier-lbl" id="adm-tier">
              {KINDS.map(([v, l]) => <button type="button" role="radio" aria-checked={kind === v} key={v} className={kind === v ? 'on' : ''} onClick={() => setKind(v)}>{t(l)}</button>)}
            </div>
          </div>
          <button type="submit" className="btn btn-gold a-appoint-btn" disabled={busy}>{busy ? t('Saving…') : t('Appoint')}</button>
        </div>
        {kind === 'super' ? (
          <p className="hint" style={{ margin: '10px 0 0' }}>{t('A main admin works with every group.')}</p>
        ) : (
          <div className="a-appoint-groups">
            <div className="a-appoint-gh">
              <b>{t('Groups this person can work with')}</b>
              <span className="a-gp-count">{units.filter((u) => unitOn(u, newGroups)).length} {t('selected')}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewGroups(new Set(units.flatMap((u) => u.codes)))}>{t('Select all')}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewGroups(new Set())}>{t('Clear')}</button>
            </div>
            <div className="a-gp-list a-appoint-glist" role="group" aria-label={t('Groups')}>
              {units.length === 0 ? <p className="hint">{t('No groups yet')}</p> : units.map((u) => (
                <label key={u.key} className={'a-gp-item' + (unitOn(u, newGroups) ? ' on' : '')}>
                  <input type="checkbox" checked={unitOn(u, newGroups)} onChange={() => setNewGroups((cur) => unitToggle(u, cur))} />
                  <UnitName u={u} t={t} />
                </label>
              ))}
            </div>
            <p className="hint" style={{ margin: '8px 0 0' }}>{t('The person stays linked to the group even when its level changes. You can change this later with "Groups" in the list below.')}</p>
          </div>
        )}
        <p className="hint" role="alert" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)', margin: '6px 0 0' }}>{error}</p>
      </form>

      <div className="panel a-flush">
        <div className="a-staff-bar">
          <h3><span className="panel-head-bar" />{t('Teachers and admins')}</h3>
          <div className="a-staff-tools">
            <div className="a-filters" role="group" aria-label={t('Account type')}>
              {FILTERS.map(([v, l, n]) => <button type="button" key={v} className={filter === v ? 'on' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>{t(l)} <span>{n}</span></button>)}
            </div>
            <input type="search" className="a-staff-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search by name or email…')} aria-label={t('Search by name or email…')} />
          </div>
        </div>
        <div className="a-table-wrap a-flat">
          <table className="a-staff-table">
            <thead><tr><th>{t('Name')}</th><th>{t('Account type')}</th><th>{t('Groups')}</th><th></th></tr></thead>
            <tbody>
              {rows === null ? <tr className="empty-row"><td colSpan={4}><Skeleton h={28} /></td></tr>
                : rows.error ? <tr className="empty-row"><td colSpan={4}>{rows.error} {'\u2014'} {t('Run the latest SQL migration first.')}</td></tr>
                : list.length === 0 ? <tr className="empty-row"><td colSpan={4}><EmptyState title={t('No admins or teachers yet.')} /></td></tr>
                : shown.length === 0 ? <tr className="empty-row"><td colSpan={4}><EmptyState title={t('No results')} /></td></tr>
                : shown.map((a) => {
                  const me = user && a.id === user.id;
                  const k = kindOf(a);
                  // running groups first; links to switched-off groups only as a number
                  const own = new Set(a.group_codes || []);
                  const names = units.filter((u) => unitOn(u, own)).map((u) => u.name);
                  const covered = new Set(units.flatMap((u) => u.codes));
                  const offCount = (a.group_codes || []).filter((c) => nameOf[c] && !covered.has(c)).length;
                  return (
                    <tr key={a.id}>
                      <td data-label={t('Name')}><div className="a-cell-user"><Avatar name={a.full_name || a.email || '?'} /><span className="a-who"><b>{a.full_name || '\u2014'}{me ? <span className="u-pill gold" style={{ marginLeft: 8 }}>{t('You')}</span> : null}</b><small>{a.email}</small></span></div></td>
                      <td data-label={t('Account type')}>
                        {me ? <span className="u-pill gold">{t('Main admin')}</span> : (
                          <button type="button" className={'a-role-btn ' + (k === 'super' ? 'is-super' : k === 'standard' ? 'is-admin' : 'is-teacher')} onClick={() => setRolePerson(a)} aria-label={t('Change role') + ': ' + (a.full_name || a.email)}>
                            <span>{t(KINDS.find(([v]) => v === k)[1])}</span>
                            <span className="a-role-edit" aria-hidden="true">{t('Change')}</span>
                          </button>
                        )}
                      </td>
                      <td data-label={t('Groups')}>
                        {k === 'super' ? <span className="muted">{t('All groups')}</span> : (
                          <button type="button" className="a-groups-btn" onClick={() => setPicker(a)} aria-label={t('Groups') + ': ' + (a.full_name || a.email)}>
                            {names.length === 0 && offCount === 0 ? <span className="muted">{t('No groups yet')}</span> : (
                              <span className="a-gchips">
                                {names.slice(0, 2).map((n, ni) => <span className="a-gchip" key={ni}>{n}</span>)}
                                {names.length > 2 && <span className="a-gchip more">+{names.length - 2}</span>}
                                {offCount > 0 && <span className="a-gchip more" title={t('Links to switched-off groups')}>{offCount} {t('switched off')}</span>}
                              </span>
                            )}
                            <span className="a-groups-edit" aria-hidden="true">{'\u270E'}</span>
                          </button>
                        )}
                      </td>
                      <td className="a-actions">{!me && <button className="btn btn-danger btn-sm" onClick={() => revoke(a)}>{t('Remove')}</button>}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <RoleDialog person={rolePerson} onClose={() => setRolePerson(null)} onChange={changeKind} />
      <GroupPicker person={picker} groups={groups} onClose={() => setPicker(null)} onSaved={() => { setPicker(null); load(); }} onError={fail} />
    </section>
  );
}

/** Pick which groups a teacher / admin works with. Saved atomically through admin_set_staff_groups. */
function GroupPicker({ person, groups, onClose, onSaved, onError }) {
  const { t, toast } = usePanel();
  const [sel, setSel] = useState(new Set());
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const open = !!person;
  useEffect(() => { if (person) { setSel(new Set(person.group_codes || [])); setQ(''); } }, [person]);

  // One entry per series ("Group A"), plus links to switched-off groups this person still has (visible, removable).
  const listed = useMemo(() => buildUnits(groups, (person && person.group_codes) || []), [groups, person]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? listed.filter((u) => u.name.toLowerCase().includes(s)) : listed;
  }, [listed, q]);
  const toggle = (u) => setSel((cur) => unitToggle(u, cur));
  const setAll = (on) => setSel((cur) => { const n = new Set(cur); shown.forEach((u) => u.codes.forEach((c) => { if (on) n.add(c); else n.delete(c); })); return n; });

  async function save() {
    if (!person) return;
    setSaving(true);
    const known = new Set(groups.map((g) => g.code));
    const { error: err } = await supabase.rpc('admin_set_staff_groups', { p_user: person.id, p_codes: [...sel].filter((c) => known.has(c)) });
    setSaving(false);
    if (err) { onError(err); return; }
    toast(t('Groups updated.'), 'ok');
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} label={t('Groups')}>
      <h3>{t('Groups')}</h3>
      <p className="hint">{person ? (person.full_name || person.email) : ''}</p>
      <div className="a-gp-tools">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search groups…')} aria-label={t('Search groups…')} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>{t('Select all')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(false)}>{t('Clear')}</button>
      </div>
      <div className="a-gp-list" role="group" aria-label={t('Groups')}>
        {listed.length === 0 ? <p className="hint">{t('No groups yet')}</p>
          : shown.length === 0 ? <p className="hint">{t('No groups match your filters.')}</p>
          : shown.map((u) => (
            <label key={u.key} className={'a-gp-item' + (unitOn(u, sel) ? ' on' : '')}>
              <input type="checkbox" checked={unitOn(u, sel)} onChange={() => toggle(u)} />
              <UnitName u={u} t={t} />
            </label>
          ))}
      </div>
      <div className="modal-actions">
        <span className="a-gp-count">{listed.filter((u) => unitOn(u, sel)).length} {t('selected')}</span>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="btn btn-gold" disabled={saving} onClick={save}>{saving ? t('Saving…') : t('Save')}</button>
      </div>
    </Modal>
  );
}

const ROLE_INFO = {
  super: ['Main admin', 'Full access to every section and group. Can appoint and manage other staff.'],
  standard: ['Admin', 'Works only with the groups linked to them. Cannot manage groups, tasks or exams.'],
  teacher: ['Teacher', 'Teaches the groups linked to them: lessons, tasks, exams and attendance.'],
};

/** Change the role of an existing admin / teacher. Linked groups are kept; main admin is confirmed explicitly. */
function RoleDialog({ person, onClose, onChange }) {
  const { t } = usePanel();
  const [next, setNext] = useState('teacher');
  const [saving, setSaving] = useState(false);
  const open = !!person;
  const current = person ? kindOf(person) : null;
  useEffect(() => { if (person) { setNext(kindOf(person)); setSaving(false); } }, [person]);

  async function save() {
    if (!person || next === current) return;
    setSaving(true);
    const ok = await onChange(person, next);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} label={t('Change role')}>
      <h3>{t('Change role')}</h3>
      <p className="hint">{person ? (person.full_name || person.email) : ''}</p>
      <div className="a-role-list" role="radiogroup" aria-label={t('Account type')}>
        {KINDS.map(([v, label]) => (
          <button type="button" role="radio" aria-checked={next === v} key={v} className={'a-role-opt' + (next === v ? ' on' : '')} onClick={() => setNext(v)}>
            <span className="a-role-dot" aria-hidden="true" />
            <span className="a-role-txt"><b>{t(label)}{current === v ? <em>{t('Current')}</em> : null}</b><small>{t(ROLE_INFO[v][1])}</small></span>
          </button>
        ))}
      </div>
      {next === 'super' && current !== 'super' && <p className="hint a-role-warn">{t('This person will get access to every group and section.')}</p>}
      <p className="hint">{t('Linked groups are kept when the role changes.')}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="btn btn-gold" disabled={saving || next === current} onClick={save}>{saving ? t('Saving…') : t('Save')}</button>
      </div>
    </Modal>
  );
}
