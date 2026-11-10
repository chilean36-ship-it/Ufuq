import { useCallback, useEffect, useMemo, useState } from 'react';
import useLiveRefresh from '../../../lib/liveRefresh';
import { supabase } from '../../../lib/supabaseClient';
import { usePanel } from '../../../components/panel/PanelContext';
import { Modal } from '../../../components/panel/ui';
import { day, IC_INBOX, SearchBox, IC_CARET, IC_GROUP, PILL } from './paymentsShared';

export default function AccessTab() {
  const { t, toast, askConfirm, isSuper } = usePanel();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [grant, setGrant] = useState(null);
  const [months, setMonths] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState([]);
  const [members, setMembers] = useState([]);
  const [gFilter, setGFilter] = useState('all');
  const [closed, setClosed] = useState(() => new Set());

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_access', { p_q: q || null });
    if (error) { setRows((r) => r || { error: error.message }); return; }
    setRows(data || []);
  }, [q]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);
  useLiveRefresh(load);

  const loadGroups = useCallback(async () => {
    const [g, m] = await Promise.all([
      supabase.from('groups').select('code, name, is_active').order('name'),
      supabase.from('group_members').select('user_id, group_code'),
    ]);
    if (!g.error) setGroups((g.data || []).slice().sort((x, y) => String(x.name || x.code).localeCompare(String(y.name || y.code), undefined, { numeric: true, sensitivity: 'base' })));
    if (!m.error) setMembers(m.data || []);
  }, []);
  useEffect(() => { loadGroups(); }, [loadGroups]);
  useLiveRefresh(loadGroups);

  async function doGrant() {
    setBusy(true);
    const { error } = await supabase.rpc('admin_grant_access', { p_user: grant.user_id, p_months: Number(months), p_note: note });
    setBusy(false);
    if (error) { toast(error.message, 'err'); return; }
    toast(t('Access granted.'), 'ok'); setGrant(null); setNote(''); load();
  }
  function revoke(r) {
    askConfirm(t('Revoke access'), (r.full_name || r.email) + ' — ' + t('current access will end now. Continue?'), async () => {
      const { error } = await supabase.rpc('admin_revoke_access', { p_user: r.user_id });
      if (error) { toast(error.message, 'err'); return; }
      toast(t('Access revoked.'), 'ok'); load();
    });
  }

  const list = Array.isArray(rows) ? rows : [];
  const isOn = (r) => !!(r.ends_at && new Date(r.ends_at) > new Date());

  // Sections: one per group (a student in several groups shows in each), plus "No group".
  const sections = useMemo(() => {
    const byUser = new Map();
    members.forEach((m) => { if (!byUser.has(m.user_id)) byUser.set(m.user_id, []); byUser.get(m.user_id).push(m.group_code); });
    // running groups only: a switched-off level group is not a place where anybody studies (its students fall under "No group")
    const out = groups.filter((g) => g.is_active !== false).map((g) => ({ code: g.code, name: g.name || g.code, rows: [] }));
    const idx = new Map(out.map((x, i) => [x.code, i]));
    const none = { code: '__none', name: null, rows: [] };
    list.forEach((r) => {
      const codes = (byUser.get(r.user_id) || []).filter((c) => idx.has(c));
      if (!codes.length) none.rows.push(r);
      else codes.forEach((c) => out[idx.get(c)].rows.push(r));
    });
    return [...out, none].filter((x) => x.rows.length > 0);
  }, [groups, members, list]);

  const visible = gFilter === 'all' ? sections : sections.filter((x) => x.code === gFilter);
  const searching = q.trim().length > 0;
  const toggle = (code) => setClosed((c) => { const n = new Set(c); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const allClosed = visible.length > 0 && visible.every((x) => closed.has(x.code));
  const nOn = list.filter(isOn).length;
  const secName = (x) => x.name || t('No group');

  const tableFor = (rs) => (
    <table className="pay-table">
      <thead><tr><th>{t('Student')}</th><th>{t('Access until')}</th><th></th></tr></thead>
      <tbody>
        {rs.map((r) => {
          const on = isOn(r);
          return (
            <tr key={r.user_id}>
              <td data-label={t('Student')} className="pay-buyer"><b>{r.full_name || '—'}</b><div className="hint">{r.email}</div></td>
              <td data-label={t('Access until')}>{on ? <span className="pay-pill ok">{day(r.ends_at)}</span> : <span className={'pay-pill ' + (r.ends_at ? 'bad' : 'mute')}>{r.ends_at ? t('Expired') + ' ' + day(r.ends_at) : t('Never paid')}</span>}</td>
              <td className="pay-actions">
                <button className="btn btn-gold btn-sm" onClick={() => { setGrant(r); setMonths(1); }}>{t('Grant access')}</button>
                {isSuper && on && <button className="btn btn-danger btn-sm" onClick={() => revoke(r)}>{t('Revoke')}</button>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="panel pay-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('Search students by name or email')} />
        {sections.length > 0 && (
          <div className="acc-chips" role="tablist" aria-label={t('Groups')}>
            <button type="button" className={'acc-chip' + (gFilter === 'all' ? ' is-active' : '')} onClick={() => setGFilter('all')}>{t('All')}<span className="acc-chip-n">{list.length}</span></button>
            {sections.map((x) => (
              <button key={x.code} type="button" className={'acc-chip' + (gFilter === x.code ? ' is-active' : '')} onClick={() => setGFilter(x.code)}>{secName(x)}<span className="acc-chip-n">{x.rows.length}</span></button>
            ))}
          </div>
        )}
        <div className="acc-toolbar">
          <span className="hint"><b>{list.length}</b> {t('students')} · <b>{nOn}</b> {t('with access')}</span>
          {visible.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setClosed(allClosed ? new Set() : new Set(visible.map((x) => x.code)))}>{allClosed ? t('Expand all') : t('Collapse all')}</button>}
        </div>
      </div>

      {rows === null ? (
        <div className="panel pay-table-wrap"><table className="pay-table"><tbody>{[0, 1, 2].map((i) => <tr key={i} className="pay-skel">{[0, 1, 2].map((j) => <td key={j}><span className="pay-skel-bar" /></td>)}</tr>)}</tbody></table></div>
      ) : rows.error ? (
        <div className="panel pay-table-wrap"><div className="pay-empty"><div>{rows.error}</div></div></div>
      ) : visible.length === 0 ? (
        <div className="panel pay-table-wrap"><div className="pay-empty">{IC_INBOX}<div>{t('No students.')}</div></div></div>
      ) : visible.map((x) => {
        const open = searching || !closed.has(x.code);
        const on = x.rows.filter(isOn).length;
        return (
          <div key={x.code} className={'panel acc-group' + (open ? ' is-open' : '')}>
            <button type="button" className="acc-group-head" aria-expanded={open} onClick={() => toggle(x.code)}>
              <span className="acc-group-ic">{IC_GROUP}</span>
              <span className="acc-group-title"><b>{secName(x)}</b><span>{x.rows.length} {t('students')} · {on} {t('with access')}</span></span>
              <span className="acc-caret">{IC_CARET}</span>
            </button>
            <div className="acc-group-body">{open && tableFor(x.rows)}</div>
          </div>
        );
      })}

      <Modal open={!!grant} onClose={() => setGrant(null)} style={{ maxWidth: 440 }}>
        {grant && (<>
          <h3>{t('Grant access')}</h3>
          <p className="hint" style={{ color: 'var(--text)' }}>{grant.full_name || grant.email}</p>
          <div className="field"><label>{t('Months')}</label><select style={{ width: '100%' }} value={months} onChange={(e) => setMonths(e.target.value)}>{[1, 2, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <div className="field"><label>{t('Reason (internal)')}</label><input style={{ width: '100%' }} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setGrant(null)}>{t('Cancel')}</button><button className="btn btn-gold" disabled={busy} onClick={doGrant}>{t('Grant')}</button></div>
        </>)}
      </Modal>
    </>
  );
}
