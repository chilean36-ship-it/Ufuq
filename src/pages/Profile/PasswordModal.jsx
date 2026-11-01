import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import Captcha from '../../components/Captcha';
import { isCaptchaError } from '../../lib/captcha';

function PasswordField({ id, label, value, onChange, error, autoComplete, minLength, hasErrorSlot }) {
  const { t } = useCabinetI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className={'password-input-wrap' + (error ? ' has-error' : '')}>
        <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={minLength} required
               value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="password-eye" data-target={id} aria-label={t(visible ? 'Hide password' : 'Show password')}
                onClick={() => setVisible((v) => !v)}>
          <svg className="eye-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={visible ? { display: 'none' } : undefined}>
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
          </svg>
          <svg className="eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={visible ? undefined : { display: 'none' }}>
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </button>
      </div>
      {hasErrorSlot && <div className="password-error" style={{ display: error ? 'block' : 'none' }}>{error}</div>}
    </div>
  );
}

/**
 * Change-password modal (port of #passwordOverlay). Re-authenticates with the current
 * password before calling supabase.auth.updateUser — Supabase does not ask for the old
 * password itself, so this is what actually verifies it.
 */
export default function PasswordModal({ open, onClose, email, onSaved }) {
  const { t } = useCabinetI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentErr, setCurrentErr] = useState('');
  const [confirmErr, setConfirmErr] = useState('');
  const [busy, setBusy] = useState(false);
  const firstRef = useRef(null);
  const cap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) { setCurrent(''); setNext(''); setConfirm(''); setCurrentErr(''); setConfirmErr(''); }
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setCurrentErr(''); setConfirmErr('');

    if (next !== confirm) {
      setConfirmErr(t('New password and confirmation do not match.'));
      return;
    }
    setBusy(true);
    try {
      let captchaToken;
      if (cap.current && cap.current.enabled) {
        captchaToken = await cap.current.getToken();
        if (!captchaToken) {
          setCurrentErr(t('Security check is not finished yet. Please wait a moment and try again.'));
          cap.current.reset();
          setBusy(false);
          return;
        }
      }
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current, options: { captchaToken } });
      if (cap.current) cap.current.reset();
      if (verifyError) {
        setCurrentErr(isCaptchaError(verifyError)
          ? t('Security check was not passed. Please try again.')
          : t('Incorrect password. Please try again.'));
        setBusy(false);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;
      onSaved();
    } catch (err) {
      console.error('Parolni yangilashda xatolik:', err.message);
      setCurrentErr(err.message || t('Could not update password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={'password-overlay' + (open ? ' open' : '')} id="passwordOverlay" aria-hidden={!open}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="password-modal" role="dialog" aria-modal="true" aria-labelledby="passwordTitle">
        <div className="password-brand">
          <img id="passwordLogo" alt="Ufuq logo" src="/assets/images/logo-mark.png" />
          <span>Ufuq</span>
        </div>
        <h2 className="password-title" id="passwordTitle">{t('Change Password')}</h2>
        <form id="passwordForm" onSubmit={handleSubmit}>
          <PasswordField id="currentPassword" label={t('Current password')} value={current} onChange={setCurrent}
                          error={currentErr} hasErrorSlot autoComplete="current-password" />
          <PasswordField id="newPassword" label={t('New password')} value={next} onChange={setNext}
                          autoComplete="new-password" minLength={6} />
          <PasswordField id="confirmPassword" label={t('Confirm new password')} value={confirm} onChange={setConfirm}
                          error={confirmErr} hasErrorSlot autoComplete="new-password" minLength={6} />
          <div className="password-actions">
            <button type="button" className="password-cancel" id="passwordCancelBtn" onClick={onClose}>{t('Cancel')}</button>
            <button type="submit" className="password-save" disabled={busy}>{t('Save')}</button>
          </div>
          {open && <Captcha ref={cap} action="reauth" />}
        </form>
      </div>
    </div>
  );
}
