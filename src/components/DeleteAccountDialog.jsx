import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ufuqSignOut } from '../lib/auth';
import { useCabinetI18n } from '../context/CabinetI18nContext';
import { lockScroll, unlockScroll } from '../lib/scrollLock';

const REASONS = [
  ['not_using', 'I no longer use Ufuq'],
  ['finished', 'I finished my course'],
  ['difficult', 'It is too difficult or confusing'],
  ['alternative', 'I found another platform'],
  ['technical', 'Technical problems'],
  ['privacy', 'Privacy concerns'],
  ['notifications', 'Too many notifications'],
  ['other', 'Other'],
];
const LOSSES = [
  'Your profile, name, photo and login',
  'Progress, exam results and submitted work',
  'Group memberships and your chat messages',
  'AI chats, saved items and notifications',
];

/**
 * Account deletion in two steps, the way large services do it:
 *   1) an exit survey (reason + optional comment — stored anonymously),  2) a final, typed confirmation.
 * Works for every role. After the server erased the account the browser is signed out and sent to the landing page.
 */
export default function DeleteAccountDialog({ open, onClose }) {
  const { t } = useCabinetI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setStep(1); setReason(''); setDetails(''); setTyped(''); setBusy(false); setErr(''); } }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    lockScroll();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { unlockScroll(); window.removeEventListener('keydown', onKey); };
  }, [open, busy, onClose]);

  if (!open) return null;

  const needDetails = reason === 'other' && details.trim().length < 3;
  const canContinue = !!reason && !needDetails;
  const canDelete = typed.trim().toUpperCase() === 'DELETE' && !busy;

  async function erase() {
    setBusy(true); setErr('');
    try {
      const args = { p_reason: reason || 'not_given', p_details: details.trim() || null };
      // 1) the anonymous exit survey (never blocks the deletion)
      try { await supabase.rpc('record_deletion_feedback', args); } catch (e) { /* optional */ }
      // 2) the deletion itself: the newer function erases every role; fall back to the older one if it is not installed yet
      let res = await supabase.rpc('delete_my_account', args);
      if (res.error && /could not find the function|PGRST202|schema cache/i.test(res.error.message || res.error.code || '')) {
        res = await supabase.rpc('delete_my_account');
      }
      if (res.error) throw res.error;
      try { const { data } = await supabase.auth.getUser(); if (data && data.user) await supabase.storage.from('avatars').remove([data.user.id + '/avatar.jpg']); } catch (e) { /* no photo */ }
      await ufuqSignOut();
      try { localStorage.clear(); } catch (e) { /* ignore */ }
      navigate('/index', { replace: true });
    } catch (e) {
      const m = String((e && e.message) || '');
      setErr(/last_admin|admin_cannot_self_delete/.test(m)
        ? t('The last main administrator cannot delete the account. Appoint another main administrator first.')
        : t('Could not delete the account. Please try again or contact support.'));
      setBusy(false);
    }
  }

  return createPortal(
    <div className="uk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="uk-dialog uk-md uk-del" role="dialog" aria-modal="true" aria-labelledby="ukDelTitle">
        <button type="button" className="uk-x" aria-label={t('Cancel')} disabled={busy} onClick={onClose}>&times;</button>
        <div className="uk-steps" aria-hidden="true"><i className="on" /><i className={step === 2 ? 'on' : ''} /></div>

        {step === 1 && (
          <>
            <h3 id="ukDelTitle" className="uk-title">{t('We are sorry to see you go. Why are you leaving?')}</h3>
            <p className="uk-sub">{t('Your answer is anonymous and helps us improve Ufuq.')}</p>
            <div className="uk-radios" role="radiogroup">
              {REASONS.map(([v, label]) => (
                <label key={v} className={'uk-radio' + (reason === v ? ' on' : '')}>
                  <input type="radio" name="delReason" value={v} checked={reason === v} onChange={() => setReason(v)} />
                  <span className="uk-radio-dot" aria-hidden="true" /><span>{t(label)}</span>
                </label>
              ))}
            </div>
            <label className="uk-label" htmlFor="ukDelDetails">{reason === 'other' ? t('Please tell us a little more') : t('Tell us more (optional)')}</label>
            <textarea id="ukDelDetails" className={'uk-textarea' + (reason === 'other' && needDetails && details ? ' bad' : '')} rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} dir="auto" />
            <div className="uk-actions">
              <button type="button" className="uk-btn" onClick={onClose}>{t('Cancel')}</button>
              <button type="button" className="uk-btn uk-btn-pri" disabled={!canContinue} onClick={() => setStep(2)}>{t('Continue')}</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 id="ukDelTitle" className="uk-title">{t('Delete your account')}</h3>
            <div className="uk-warn">
              <b>{t('What will be deleted')}</b>
              <ul>{LOSSES.map((x) => <li key={x}>{t(x)}</li>)}</ul>
              <p>{t('This cannot be undone.')}</p>
            </div>
            <label className="uk-label" htmlFor="ukDelType">{t('Type DELETE to confirm')}</label>
            <input id="ukDelType" className="uk-input" type="text" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" spellCheck={false} />
            {err && <div className="uk-err" role="alert">{err}</div>}
            <div className="uk-actions">
              <button type="button" className="uk-btn" disabled={busy} onClick={() => setStep(1)}>{t('Back')}</button>
              <button type="button" className="uk-btn uk-btn-danger" disabled={!canDelete} onClick={erase}>{busy ? t('Deleting…') : t('Delete my account permanently')}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
