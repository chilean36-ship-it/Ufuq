import { lockScroll, unlockScroll } from '../lib/scrollLock';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LANG_KEY } from '../i18n';
import { cleanName, saveFullName } from '../lib/profileName';

/**
 * Mandatory "What's your name?" window — shown once to every signed-in cabinet user (student, teacher, admin) who
 * has not yet confirmed a name (auth metadata flag `profile_name_set`). It cannot be dismissed. Saving goes through
 * saveFullName() → set_my_name(), so the same name appears everywhere (profile, topbar, group lists, chat, slots),
 * then the page content below is remounted so every view re-reads it.
 */

const TEXT = {
  EN: { title: 'What is your name?', sub: 'Please enter your full name. It is shown to your teacher and classmates, and across the whole cabinet.', label: 'Full name', ph: 'e.g. Aisha Karimova', btn: 'Save and continue', saving: 'Saving…', short: 'Please enter your name (at least 2 letters).', fail: 'Could not save the name. Check your connection and try again.' },
  UZ: { title: 'Ismingiz nima?', sub: "Iltimos, ism va familiyangizni kiriting. U ustozingiz va guruhdoshlaringizga hamda kabinetning barcha joylarida ko'rinadi.", label: 'Ism va familiya', ph: 'Masalan: Aisha Karimova', btn: 'Saqlash va davom etish', saving: 'Saqlanmoqda…', short: 'Iltimos, ismingizni kiriting (kamida 2 ta harf).', fail: "Ismni saqlab bo'lmadi. Internetni tekshirib, qayta urinib ko'ring." },
  RU: { title: 'Как вас зовут?', sub: 'Введите имя и фамилию. Оно будет видно преподавателю, одногруппникам и во всём кабинете.', label: 'Имя и фамилия', ph: 'Например: Аиша Каримова', btn: 'Сохранить и продолжить', saving: 'Сохранение…', short: 'Введите имя (не менее 2 букв).', fail: 'Не удалось сохранить имя. Проверьте интернет и повторите.' },
  AR: { title: 'ما اسمك؟', sub: 'يرجى إدخال اسمك الكامل. سيظهر لمعلمك وزملائك وفي جميع أنحاء الحساب.', label: 'الاسم الكامل', ph: 'مثال: عائشة كريموفا', btn: 'حفظ ومتابعة', saving: 'جارٍ الحفظ…', short: 'يرجى إدخال اسمك (حرفان على الأقل).', fail: 'تعذّر حفظ الاسم. تحقّق من الاتصال وحاول مرة أخرى.' },
};

const CSS = `
.ng-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
.ng-card{width:100%;max-width:440px;background:var(--bg-2,#1A1A1A);color:var(--text,#EDEAE3);border:1px solid var(--line,rgba(237,234,227,.14));border-radius:14px;padding:30px 26px 26px;box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:inherit;}
.ng-ico{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;background:var(--gold-dim,rgba(201,162,75,.14));color:var(--gold,#C9A24B);}
.ng-title{margin:0 0 8px;text-align:center;font-size:22px;font-weight:600;}
.ng-sub{margin:0 0 20px;text-align:center;font-size:14px;line-height:1.5;color:var(--text-muted,#A8A29B);}
.ng-label{display:block;margin:0 0 6px;font-size:13px;color:var(--text-muted,#A8A29B);}
.ng-input{width:100%;box-sizing:border-box;padding:12px 14px;font-size:16px;font-family:inherit;color:var(--text,#EDEAE3);background:var(--bg,#121212);border:1px solid var(--line,rgba(237,234,227,.18));border-radius:9px;outline:none;transition:border-color .15s;}
.ng-input:focus{border-color:var(--gold,#C9A24B);}
.ng-input.bad{border-color:#D98B78;}
.ng-err{min-height:18px;margin:8px 0 0;font-size:13px;color:#D98B78;}
.ng-btn{width:100%;margin-top:12px;padding:13px 16px;font-size:15px;font-weight:600;font-family:inherit;color:#121212;background:var(--gold,#C9A24B);border:0;border-radius:9px;cursor:pointer;transition:filter .15s,opacity .15s;}
.ng-btn:hover:not(:disabled){filter:brightness(1.08);}
.ng-btn:disabled{opacity:.6;cursor:default;}
`;

function readLang() {
  try { const l = localStorage.getItem(LANG_KEY); return TEXT[l] ? l : 'EN'; } catch (e) { return 'EN'; }
}

/** A name worth pre-filling: not the "Student" placeholder and not the e-mail prefix the account was created with. */
function initialName(user) {
  let saved = '';
  try { saved = localStorage.getItem('ufuq-profile-name') || ''; } catch (e) { /* ignore */ }
  const fromMeta = (user && user.user_metadata && user.user_metadata.full_name) || '';
  const cand = cleanName(saved || fromMeta);
  const emailPrefix = ((user && user.email) || '').split('@')[0].toLowerCase();
  if (!cand || cand.toLowerCase() === 'student' || cand.toLowerCase() === emailPrefix) return '';
  return cand;
}

function NameModal({ user, onSaved }) {
  const L = TEXT[readLang()];
  const [value, setValue] = useState(() => initialName(user));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    lockScroll();
    const id = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 50);
    return () => { unlockScroll(); clearTimeout(id); };
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const n = cleanName(value);
    if (n.length < 2 || n.toLowerCase() === 'student') { setError(L.short); return; }
    setBusy(true); setError('');
    try {
      const res = await saveFullName(user, n);
      onSaved(res.name);
    } catch (err) {
      setError(err && err.message === 'INVALID_NAME' ? L.short : L.fail);
      setBusy(false);
    }
  }

  return (
    <div className="ng-overlay" role="dialog" aria-modal="true" aria-labelledby="ngTitle" dir={readLang() === 'AR' ? 'rtl' : 'ltr'}>
      <style>{CSS}</style>
      <form className="ng-card" onSubmit={submit} noValidate>
        <div className="ng-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
        </div>
        <h2 className="ng-title" id="ngTitle">{L.title}</h2>
        <p className="ng-sub">{L.sub}</p>
        <label className="ng-label" htmlFor="ngName">{L.label}</label>
        <input id="ngName" ref={inputRef} className={'ng-input' + (error ? ' bad' : '')} type="text" autoComplete="name" maxLength={60}
               placeholder={L.ph} value={value} onChange={(e) => { setValue(e.target.value); if (error) setError(''); }} />
        <div className="ng-err" role="alert">{error}</div>
        <button type="submit" className="ng-btn" disabled={busy}>{busy ? L.saving : L.btn}</button>
      </form>
    </div>
  );
}

export default function NameGate({ children }) {
  const { user } = useAuth();
  const [done, setDone] = useState(false);
  const [version, setVersion] = useState(0);
  const needsName = !done && !!user && !(user.user_metadata && user.user_metadata.profile_name_set);

  return (
    <>
      {/* After saving, the page below is remounted so every view re-reads the one new name. */}
      <Fragment key={version}>{children}</Fragment>
      {needsName && (
        <NameModal user={user} onSaved={(n) => {
          try { localStorage.setItem('ufuq-profile-name', n); } catch (e) { /* ignore */ }
          setDone(true);
          setVersion((v) => v + 1);
        }} />
      )}
    </>
  );
}
