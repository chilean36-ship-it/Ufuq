import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { homeRoute, writeCachedRole } from '../lib/auth';
import { DICTS, LANG_KEY, resolve } from '../i18n';
import Captcha from './Captcha';
import { isCaptchaError } from '../lib/captcha';

function makeT(prefix = 'fp.') {
  let lang = 'EN';
  try { const s = localStorage.getItem(LANG_KEY); if (s && DICTS[s]) lang = s; } catch (e) { /* storage blocked */ }
  return (key, vars) => {
    let v = resolve(DICTS[lang], prefix + key); if (v === undefined) v = resolve(DICTS.EN, prefix + key); if (v === undefined) v = key;
    if (vars) Object.keys(vars).forEach((k) => { v = v.replace('{' + k + '}', vars[k]); });
    return v;
  };
}
const COOLDOWN = 45;

/**
 * Forgot-password flow in a standard dialog:  email → "check your email" (link, or a 6-digit code if the email has one)
 * → new password → signed in and sent to the right panel.  `initialStep="new"` is used when the person arrived through the
 * link in the email (Supabase signs them in with a recovery session first).
 */
export default function PasswordResetFlow({ open, onClose, initialStep = 'email', initialEmail = '', onDone }) {
  const t = makeT();
  const tc = makeT('captcha.');
  const cap = useRef(null);
  const navigate = useNavigate();
  const [step, setStep] = useState(initialStep);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [wait, setWait] = useState(0);
  const first = useRef(null);

  useEffect(() => { if (open) { setStep(initialStep); setEmail(initialEmail); setCode(''); setPw1(''); setPw2(''); setBusy(false); setErr(''); setWait(0); } }, [open, initialStep, initialEmail]);
  useEffect(() => { if (wait <= 0) return undefined; const id = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(id); }, [wait]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    const tm = setTimeout(() => { if (first.current) first.current.focus(); }, 60);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(tm); };
  }, [open, busy, onClose, step]);

  if (!open) return null;

  const explain = (e) => {
    const m = String((e && e.message) || '');
    if (/rate limit|too many|seconds/i.test(m)) return t('tooMany');
    if (/token|otp|expired|invalid/i.test(m)) return t('badCode');
    return t('failed');
  };

  async function sendMail(e) {
    if (e) e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v) return;
    setBusy(true); setErr('');
    try {
      let captchaToken;
      if (cap.current && cap.current.enabled) {
        captchaToken = await cap.current.getToken();
        if (!captchaToken) { setErr(tc('required')); cap.current.reset(); return; }
      }
      const { error } = await supabase.auth.resetPasswordForEmail(v, { redirectTo: window.location.origin + '/index', captchaToken });
      if (error) throw error;
      setEmail(v); setStep('sent'); setWait(COOLDOWN);
    } catch (x) { setErr(isCaptchaError(x) ? tc('rejected') : /rate limit|too many|seconds/i.test(String(x.message || '')) ? t('tooMany') : t('failed')); }
    finally { if (cap.current) cap.current.reset(); setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    const tok = code.replace(/\s+/g, '');
    if (tok.length < 6) { setErr(t('badCode')); return; }
    setBusy(true); setErr('');
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: tok, type: 'recovery' });
      if (error) throw error;
      setStep('new');
    } catch (x) { setErr(explain(x)); }
    finally { setBusy(false); }
  }

  async function savePassword(e) {
    e.preventDefault();
    if (pw1.length < 8) { setErr(t('short')); return; }
    if (pw1 !== pw2) { setErr(t('mismatch')); return; }
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      let dest = '/dashboard';
      try {
        const uid = data && data.user && data.user.id;
        if (uid) {
          const { data: p } = await supabase.from('profiles').select('role, admin_tier').eq('id', uid).maybeSingle();
          if (p && p.role) { writeCachedRole(uid, p.role, p.admin_tier); dest = homeRoute(p.role, p.admin_tier); }
        }
      } catch (x) { /* default destination */ }
      onClose();
      // The Ufuq app passes onDone so the person stays inside the app instead of being sent to the website panel.
      if (onDone) onDone(dest); else navigate(dest, { replace: true });
    } catch (x) { setErr(/same|different/i.test(String(x.message || '')) ? t('failed') : explain(x)); setBusy(false); }
  }

  return createPortal(
    <div className="uk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="uk-dialog uk-sm" role="dialog" aria-modal="true" aria-labelledby="fpTitle">
        <button type="button" className="uk-x" aria-label={t('close')} disabled={busy} onClick={onClose}>&times;</button>

        {step === 'email' && (
          <form onSubmit={sendMail}>
            <h3 id="fpTitle" className="uk-title">{t('title')}</h3>
            <p className="uk-sub">{t('sub')}</p>
            <label className="uk-label" htmlFor="fpEmail">Email</label>
            <input id="fpEmail" ref={first} className="uk-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
            {err && <div className="uk-err" role="alert">{err}</div>}
            <div className="uk-actions">
              <button type="button" className="uk-btn" onClick={onClose}>{t('back')}</button>
              <button type="submit" className="uk-btn uk-btn-pri" disabled={busy || !email.trim()}>{busy ? t('sending') : t('send')}</button>
            </div>
          </form>
        )}

        {step === 'sent' && (
          <form onSubmit={verify}>
            <h3 id="fpTitle" className="uk-title">{t('sentTitle')}</h3>
            <p className="uk-sub">{t('sentSub', { email })}</p>
            <label className="uk-label" htmlFor="fpCode">{t('code')}</label>
            <input id="fpCode" ref={first} className="uk-input fp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9\s]/g, ''))} placeholder="••••••" dir="ltr" />
            {err && <div className="uk-err" role="alert">{err}</div>}
            <div className="uk-actions">
              <button type="button" className="uk-btn" disabled={busy || wait > 0} onClick={() => sendMail()}>{wait > 0 ? t('resendIn', { s: wait }) : t('resend')}</button>
              <button type="submit" className="uk-btn uk-btn-pri" disabled={busy || code.replace(/\s+/g, '').length < 6}>{busy ? t('verifying') : t('verify')}</button>
            </div>
          </form>
        )}

        {step === 'new' && (
          <form onSubmit={savePassword}>
            <h3 id="fpTitle" className="uk-title">{t('newTitle')}</h3>
            <p className="uk-sub">{t('newSub')}</p>
            <label className="uk-label" htmlFor="fpPw1">{t('pw1')}</label>
            <input id="fpPw1" ref={first} className="uk-input" type="password" autoComplete="new-password" minLength={8} value={pw1} onChange={(e) => setPw1(e.target.value)} />
            <label className="uk-label" htmlFor="fpPw2">{t('pw2')}</label>
            <input id="fpPw2" className={'uk-input' + (pw2 && pw1 !== pw2 ? ' bad' : '')} type="password" autoComplete="new-password" minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} />
            {err && <div className="uk-err" role="alert">{err}</div>}
            <div className="uk-actions">
              <button type="submit" className="uk-btn uk-btn-pri" disabled={busy || !pw1 || !pw2}>{busy ? t('saving') : t('save')}</button>
            </div>
          </form>
        )}
        {(step === 'email' || step === 'sent') && <Captcha ref={cap} action="reset" />}
      </div>
    </div>,
    document.body,
  );
}
