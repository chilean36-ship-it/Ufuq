import { useEffect, useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import { supabase } from '../../lib/supabaseClient';
import { cleanName, saveFullName } from '../../lib/profileName';

const ico = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const BADGE = ico(<><path d="M12 3l2.4 2.1 3.2-.3.9 3.1 2.8 1.7-1.1 3 1.1 3-2.8 1.7-.9 3.1-3.2-.3L12 21l-2.4-2.1-3.2.3-.9-3.1-2.8-1.7 1.1-3-1.1-3 2.8-1.7.9-3.1 3.2.3L12 3z" /><path d="M9 12l2 2 4-4" /></>);
const ARROW = ico(<path d="M5 12h14M13 6l6 6-6 6" />);

function split(n) {
  const p = (n || '').trim().split(/\s+/).filter(Boolean);
  const first = p.shift() || '';
  return { first, last: p.join(' ') };
}

/** Settings → Profile: edit name and email in place (photo + phone live on the full Profile page). */
export default function SettingsProfile({ onToast, onOpenProfile }) {
  const { t } = useCabinetI18n();
  const { user, name, setName, avatarUrl } = useDashboardData();
  const cur = split(name);
  const [first, setFirst] = useState(cur.first);
  const [last, setLast] = useState(cur.last);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState({ ok: true, text: '' });

  // follow the name when it loads / changes elsewhere
  useEffect(() => { const c = split(name); setFirst(c.first); setLast(c.last); }, [name]);

  const email = (user && user.email) || '';
  const verified = !!(user && (user.email_confirmed_at || user.confirmed_at));
  const next = cleanName([first, last].filter(Boolean).join(' '));
  const dirty = next !== cleanName(name);
  const valid = first.trim().length >= 2;

  const saveName = async (e) => {
    e.preventDefault();
    if (!dirty || !valid || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await saveFullName(user, next);
      setName(r.name);
      try { localStorage.setItem('ufuq-profile-name', r.name); } catch (x) { /* ignore */ }
      onToast(t('Profile updated'));
    } catch (x) {
      setErr(/INVALID_NAME/.test(x.message || '') ? t('Please enter a valid name.') : t('Could not save the name. Please try again.'));
    } finally { setBusy(false); }
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()) && newEmail.trim().toLowerCase() !== email.toLowerCase();
  const changeEmail = async (e) => {
    e.preventDefault();
    if (!emailValid || emailBusy) return;
    setEmailBusy(true); setEmailMsg({ ok: true, text: '' });
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      setEmailMsg({ ok: true, text: t('Confirmation link sent to') + ' ' + newEmail.trim() });
      setNewEmail('');
    } catch (x) {
      setEmailMsg({ ok: false, text: t('Could not change the email. Please try again.') });
    } finally { setEmailBusy(false); }
  };

  const initial = (name || email || '?').charAt(0).toUpperCase();
  return (
    <div className="st-prof">
      <div className="st-prof-id">
        <span className="st-prof-av">{avatarUrl ? <img src={avatarUrl} alt="" /> : initial}</span>
        <div className="st-prof-who">
          <b>{name || t('Student')}</b>
          <span>{email}{verified && <em title={t('Email verified')}>{BADGE}{t('Email verified')}</em>}</span>
        </div>
        <button type="button" className="st-btn st-btn-ghost" onClick={onOpenProfile}>{t('Photo & full profile')}{ARROW}</button>
      </div>

      <form className="st-form" onSubmit={saveName}>
        <label className="st-field"><span>{t('First name')}</span>
          <input value={first} maxLength={40} autoComplete="given-name" onChange={(e) => setFirst(e.target.value)} />
        </label>
        <label className="st-field"><span>{t('Last name')}</span>
          <input value={last} maxLength={60} autoComplete="family-name" onChange={(e) => setLast(e.target.value)} />
        </label>
        <div className="st-form-actions">
          {err && <span className="st-msg err" role="alert">{err}</span>}
          <button type="button" className="st-btn" disabled={!dirty || busy} onClick={() => { const c = split(name); setFirst(c.first); setLast(c.last); setErr(''); }}>{t('Cancel')}</button>
          <button type="submit" className="st-btn st-primary" disabled={!dirty || !valid || busy}>{busy ? t('Saving…') : t('Save changes')}</button>
        </div>
      </form>

      <form className="st-form st-form-email" onSubmit={changeEmail}>
        <label className="st-field st-field-wide"><span>{t('Change email')}</span>
          <input type="email" value={newEmail} placeholder={t('New email address')} autoComplete="email" onChange={(e) => { setNewEmail(e.target.value); setEmailMsg({ ok: true, text: '' }); }} />
        </label>
        <div className="st-form-actions">
          {emailMsg.text && <span className={'st-msg ' + (emailMsg.ok ? 'ok' : 'err')} role="status">{emailMsg.text}</span>}
          <button type="submit" className="st-btn st-primary" disabled={!emailValid || emailBusy}>{emailBusy ? t('Sending…') : t('Send confirmation')}</button>
        </div>
      </form>
    </div>
  );
}
