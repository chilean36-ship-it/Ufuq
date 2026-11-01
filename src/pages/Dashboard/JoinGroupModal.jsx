import { useEffect, useRef, useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import { supabase } from '../../lib/supabaseClient';

/**
 * "Join a group" modal (port of #groupOverlay / #groupJoinForm). The 7-character code (letters + digits) is checked
 * server-side by the join_group() RPC — the client never validates it against a local list.
 */
export default function JoinGroupModal({ open, onClose, onJoined }) {
  const { t } = useCabinetI18n();
  const { locked } = useDashboardData();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tick, setTick] = useState(0); // re-plays the shake on every failed attempt
  const inputRef = useRef(null);
  const fail = (msg) => { setError(msg); setTick((n) => n + 1); };

  useEffect(() => {
    if (open) { setCode(''); setError(''); const id = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 80); return () => clearTimeout(id); }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (locked) return; // no plan → the code is never asked for or sent
    if (code.length !== 7) {
      fail(t("That code doesn't match any group. Check with your teacher and try again."));
      return;
    }
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('join_group', { p_code: code });
      if (rpcError) {
        const m = rpcError.message || '';
        fail(m.includes('PAYMENT_REQUIRED')
          ? 'You need an active subscription to join a group. Please choose a plan first.' // English in the original, not run through TT()
          : m.includes('TOO_MANY_ATTEMPTS')
            ? t('Too many wrong attempts. Please wait 15 minutes and try again.')
            : m.includes('LEVEL_MISMATCH')
              ? t('This group is for a different level. Join the group that matches your current level.')
              : t("That code doesn't match any group. Check with your teacher and try again."));
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { // join_group() returns no row for a wrong code (the failed attempt is logged server-side)
        fail(t("That code doesn't match any group. Check with your teacher and try again."));
        return;
      }
      const groupCode = (row && (row.group_code || row.code)) || code;
      const groupData = {
        name: (row && (row.group_name || row.name)) || `Group ${groupCode}`,
        schedule: (row && (row.group_schedule || row.schedule)) || '',
        scheduleDays: (row && (row.group_schedule_days || row.schedule_days)) || [],
        zoomLink: (row && (row.group_zoom_link || row.zoom_link)) || null,
        type: (row && (row.group_type || row.type)) || 'class',
        slotMinutes: (row && (row.group_slot_minutes || row.slot_minutes)) || 10,
        bufferMinutes: (row && (row.group_buffer_minutes || row.buffer_minutes)) || 2,
        noShowMinutes: (row && (row.group_no_show_minutes || row.no_show_minutes)) || 3,
      };
      onJoined(groupCode, groupData);
    } finally {
      setBusy(false);
    }
  }

  if (locked) return null; // joining a group is closed until a plan is paid

  return (
    <div className={'group-overlay' + (open ? ' open' : '')} id="groupOverlay" aria-hidden={!open}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="group-modal" role="dialog" aria-modal="true" aria-label={t('My Group')}>
        <button type="button" className="group-close" id="groupCloseBtn" aria-label={t('Close')} onClick={onClose}>&times;</button>
        <div id="groupJoinView">
          <div className="gp-join-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M19 8v6M16 11h6" /></svg>
          </div>
          <h3 className="group-modal-title">{t('My Group')}</h3>
          <p className="group-modal-sub">{t('Enter the 7-character group code (letters and digits) your teacher gave you to join your class group.')}</p>
          <form id="groupJoinForm" onSubmit={handleSubmit}>
            <div className="gp-code">
              <input
                ref={inputRef} type="text" id="groupCodeInput" className={'group-code-input gp-code-input' + (error ? ' has-error' : '')}
                aria-label={t('Group code')} aria-invalid={!!error}
                inputMode="text" autoCapitalize="characters" spellCheck={false} maxLength={7} placeholder="A7K2M9X" autoComplete="off"
                value={code} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)); if (error) setError(''); }}
              />
              <div className={'gp-code-cells' + (error ? ' is-error' : '')} key={error ? 'e' + tick : 'ok'} aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i} className={'gp-cell' + (code[i] ? ' is-filled' : '') + (focused && i === Math.min(code.length, 6) ? ' is-cur' : '')}>{code[i] || ''}</span>
                ))}
              </div>
            </div>
            {error && <div className="group-code-error" role="alert" style={{ display: 'block' }}>{error}</div>}
            <button type="submit" className="btn-join-group" disabled={busy || code.length < 7} data-busy={busy ? '1' : undefined}>
              {busy && <span className="gp-spin" aria-hidden="true" />}<span>{t('Join group')}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
