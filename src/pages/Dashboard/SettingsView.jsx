import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import PageStyle from '../../components/PageStyle';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import { supabase } from '../../lib/supabaseClient';
import { ufuqSignOut } from '../../lib/auth';
import { LANGS } from '../../i18n';
import { useUiPrefs } from '../../lib/uiPrefs';
import SettingsProfile from './SettingsProfile';
import PasswordModal from '../Profile/PasswordModal';
import settingsCss from './settings.css?inline';

const ico = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const I = {
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>,
  search: ico(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>),
  user: ico(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>),
  appearance: ico(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  language: ico(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z" /></>),
  bell: ico(<><path d="M6 9a6 6 0 0112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 004 0" /></>),
  shield: ico(<><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>),
  device: ico(<><rect x="2.5" y="4" width="14" height="11" rx="2" /><path d="M6 19h7M9.5 15v4" /><rect x="18" y="8" width="3.5" height="9" rx="1" /></>),
  lock: ico(<><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /></>),
  bellOff: ico(<><path d="M6 9a6 6 0 0110-4.2M18 9c0 6 2.5 7.5 2.5 7.5H8" /><path d="M10 20a2 2 0 004 0M3 3l18 18" /></>),
  data: ico(<><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>),
  info: ico(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.1" /></>),
  warn: ico(<><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18.5v.1" /></>),
  reset: ico(<><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" /><path d="M3 3v5h5" /></>),
  sun: ico(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2" /></>),
  moon: ico(<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />),
  auto: ico(<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>),
};

function Switch({ id, on, label, onClick }) {
  return (
    <button type="button" role="switch" className={'st-switch' + (on ? ' on' : '')} id={id} aria-label={label} aria-checked={on ? 'true' : 'false'} onClick={onClick}>
      <span className="st-switch-thumb" />
    </button>
  );
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="st-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={value === o.value} key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Mini "screenshot" used by the theme cards. */
function ThemePreview({ kind }) {
  return (
    <span className={'st-prev st-prev-' + kind} aria-hidden="true">
      <span className="st-prev-side" /><span className="st-prev-main"><i /><i /><i className="short" /></span>
      {kind === 'system' && <span className="st-prev-half" />}
    </span>
  );
}

/**
 * Settings — two-column layout: sticky section navigation (with live search + scroll-spy) and the sections themselves.
 * Appearance prefs are per-device (lib/uiPrefs.js + useTheme); notifications are per-account (public.profiles).
 */
export default function SettingsView({ theme, onToggleTheme, themeMode, onSetThemeMode, onNavigate }) {
  const { t, lang, setLang } = useCabinetI18n();
  const { user, name, avatarUrl, notif, setNotif } = useDashboardData();
  const navigate = useNavigate();
  const { prefs, setPref, reset, isDefault } = useUiPrefs();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [confirmSO, setConfirmSO] = useState(null); // 'others'
  const [soBusy, setSoBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('profile');
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const flashToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);
  const savedToast = useCallback(() => flashToast(t('Saved on this device')), [flashToast, t]);
  const pick = (k, v) => { setPref(k, v); savedToast(); };

  const mode = themeMode || theme;
  const setMode = (m) => { if (onSetThemeMode) onSetThemeMode(m); else if (m !== theme && m !== 'system') onToggleTheme(); savedToast(); };

  // Per-account notification switches (saved to public.profiles; rolled back if the save fails).
  const toggleNotif = async (column) => {
    const value = !notif[column];
    setNotif((cur) => ({ ...cur, [column]: value }));
    if (!user) return;
    try {
      const { error } = await supabase.from('profiles').update({ [column]: value }).eq('id', user.id);
      if (error) throw error;
    } catch (err) {
      console.error('Sozlamani saqlashda xatolik:', err.message);
      setNotif((cur) => ({ ...cur, [column]: !value }));
      flashToast(t('Could not save the setting. Please try again.'));
    }
  };

  const signOut = async () => { await ufuqSignOut(); navigate('/index', { replace: true }); };
  const email = (user && user.email) || localStorage.getItem('ufuq-profile-email') || '';
  const displayName = name || (email ? email.split('@')[0] : t('Student'));

  // Current device (best-effort from the user agent) + last sign-in time
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : t('Browser');
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const lastIn = user && user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString({ EN: 'en', UZ: 'uz', RU: 'ru', AR: 'ar' }[lang] || 'en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const allOn = notif.notif_lessons && notif.notif_tasks && notif.notif_group;
  const anyOn = notif.notif_lessons || notif.notif_tasks || notif.notif_group;
  const setAllNotif = async (value) => {
    const prev = notif;
    setNotif({ notif_lessons: value, notif_tasks: value, notif_group: value });
    if (!user) return;
    try {
      const { error } = await supabase.from('profiles').update({ notif_lessons: value, notif_tasks: value, notif_group: value }).eq('id', user.id);
      if (error) throw error;
      flashToast(value ? t('All notifications on') : t('All notifications muted'));
    } catch (err) {
      setNotif(prev);
      flashToast(t('Could not save the setting. Please try again.'));
    }
  };
  // Client-side export of what this device knows about the account (no extra server call).
  const downloadData = () => {
    const keep = {};
    try { Object.keys(localStorage).filter((k) => k.startsWith('ufuq') && !/token|auth|sb-/i.test(k) && !/avatar:/.test(k)).forEach((k) => { keep[k] = localStorage.getItem(k); }); } catch (e) { /* ignore */ }
    const payload = {
      exportedAt: new Date().toISOString(),
      account: { id: user && user.id, email, name: displayName, createdAt: user && user.created_at, lastSignIn: user && user.last_sign_in_at, emailVerified: !!(user && user.email_confirmed_at) },
      notifications: notif,
      appearance: { theme: mode, ...prefs, language: lang },
      deviceStorage: keep,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'ufuq-my-data.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    flashToast(t('Your data was downloaded'));
  };
  const runSignOut = async (scope) => {
    setSoBusy(true);
    try {
      await ufuqSignOut(scope);
      flashToast(t('Signed out of other devices'));
    } catch (e) { flashToast(t('Something went wrong. Please try again.')); }
    setSoBusy(false); setConfirmSO(null);
  };

  // Time zone of this device (shown for information: class times follow it)
  let tz = '';
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const off = -new Date().getTimezoneOffset();
    tz = zone + ' (UTC' + (off >= 0 ? '+' : '−') + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0') + ':' + String(Math.abs(off) % 60).padStart(2, '0') + ')';
  } catch (e) { tz = ''; }
  const verified = !!(user && user.email_confirmed_at);

  // ---- Sections are data, so search and navigation work for every item automatically ----
  const sections = [
    {
      id: 'profile', icon: I.user, title: t('Profile'), desc: t('Your name, email and photo.'),
      items: [
        { key: 'prof', block: true, bare: true, label: t('Personal information'), desc: t('Your account details.'), kw: 'name email photo avatar first last', render: () => <SettingsProfile onToast={flashToast} onOpenProfile={() => (onNavigate ? onNavigate('profile') : navigate('/profile'))} /> },
        { key: 'email', label: t('Email address'), desc: email || '—', kw: 'email mail verified', render: () => <span className={'st-chip ' + (verified ? 'ok' : 'warn')}>{verified ? t('Verified') : t('Not verified')}</span> },
      ],
    },
    {
      id: 'appearance', icon: I.appearance, title: t('Appearance'), desc: t('Theme, text size and accessibility.'),
      items: [
        {
          key: 'theme', block: true, label: t('Theme'), desc: t('Choose how Ufuq looks on this device.'), kw: 'dark light night mode',
          render: () => (
            <div className="st-theme-grid" role="radiogroup" aria-label={t('Theme')}>
              {[['light', 'Light', I.sun], ['dark', 'Dark', I.moon], ['system', 'System', I.auto]].map(([v, l, ic]) => (
                <button type="button" role="radio" aria-checked={mode === v} key={v} className={'st-theme' + (mode === v ? ' on' : '')} id={v === 'dark' ? 'settingsThemeSwitch' : undefined} onClick={() => setMode(v)}>
                  <ThemePreview kind={v} />
                  <span className="st-theme-label"><i>{ic}</i>{t(l)}<b>{I.check}</b></span>
                </button>
              ))}
            </div>
          ),
        },
        {
          key: 'text', label: t('Text size'), desc: t('Make text easier to read.'), kw: 'font zoom bigger',
          render: () => <Segmented label={t('Text size')} value={prefs.text} onChange={(v) => pick('text', v)} options={[{ value: 'small', label: t('Small') }, { value: 'normal', label: t('Default') }, { value: 'large', label: t('Large') }]} />,
        },
        {
          key: 'contrast', label: t('High contrast'), desc: t('Stronger text and borders for easier reading.'), kw: 'accessibility contrast wcag vision',
          render: () => <Switch id="settingsContrast" on={prefs.contrast === 'high'} label={t('High contrast')} onClick={() => pick('contrast', prefs.contrast === 'high' ? 'normal' : 'high')} />,
        },
        {
          key: 'motion', label: t('Reduce motion'), desc: t('Fewer animations and transitions.'), kw: 'animation reduce accessibility',
          render: () => <Segmented label={t('Reduce motion')} value={prefs.motion} onChange={(v) => pick('motion', v)} options={[{ value: 'full', label: t('Off') }, { value: 'system', label: t('Follow system') }, { value: 'reduced', label: t('On') }]} />,
        },
      ],
    },
    {
      id: 'language', icon: I.language, title: t('Language & region'), desc: t('Interface language and time zone.'),
      items: [
        {
          key: 'lang', block: true, label: t('Dashboard language'), desc: t('Choose your preferred language for the dashboard.'), kw: 'english uzbek russian arabic til язык',
          render: () => (
            <div className="st-lang-grid" role="radiogroup" aria-label={t('Language')}>
              {LANGS.map((l) => (
                <button type="button" role="radio" aria-checked={lang === l.code} key={l.code} className={'st-lang' + (lang === l.code ? ' on' : '')} onClick={() => { setLang(l.code); }}>
                  <em>{l.code}</em><span>{l.label}</span><b>{I.check}</b>
                </button>
              ))}
            </div>
          ),
        },
        ...(tz ? [{ key: 'tz', label: t('Time zone'), desc: t('Detected from your device. Class times are shown in it.'), kw: 'timezone clock region utc', render: () => <span className="st-chip">{tz}</span> }] : []),
      ],
    },
    {
      id: 'notifications', icon: I.bell, title: t('Notifications'), desc: t('Choose what we tell you about.'),
      items: [
        { key: 'n0', label: t('All notifications'), desc: allOn ? t('Everything is on.') : (anyOn ? t('Some are turned off.') : t('Everything is muted.')), kw: 'mute pause enable all', render: () => (
          <div className="st-inline">
            <button type="button" className="st-btn" disabled={allOn} onClick={() => setAllNotif(true)}>{t('Turn all on')}</button>
            <button type="button" className="st-btn" disabled={!anyOn} onClick={() => setAllNotif(false)}>{I.bellOff}{t('Mute all')}</button>
          </div>) },
        { key: 'n1', label: t('Lesson reminders'), desc: t('Get notified before your class starts.'), kw: 'class alert', render: () => <Switch id="settingsNotifLessons" on={notif.notif_lessons} label={t('Toggle lesson reminders')} onClick={() => toggleNotif('notif_lessons')} /> },
        { key: 'n2', label: t('Task & exam alerts'), desc: t('Get notified about new homework, exams, and deadlines.'), kw: 'homework deadline', render: () => <Switch id="settingsNotifTasks" on={notif.notif_tasks} label={t('Toggle task alerts')} onClick={() => toggleNotif('notif_tasks')} /> },
        { key: 'n3', label: t('Group announcements'), desc: t('Get notified when your teacher posts something new.'), kw: 'teacher news', render: () => <Switch id="settingsNotifGroup" on={notif.notif_group} label={t('Toggle group announcements')} onClick={() => toggleNotif('notif_group')} /> },
      ],
    },
    {
      id: 'security', icon: I.lock, title: t('Security'), desc: t('Password, devices and sign-in.'),
      items: [
        { key: 's1', label: t('Password'), desc: t('Change the password used to sign in.'), kw: 'security login', render: () => <button type="button" className="st-btn" id="settingsChangePwBtn" onClick={() => setPasswordOpen(true)}>{t('Change')}</button> },
        { key: 's2', block: true, bare: true, label: t('This device'), desc: '', kw: 'session device browser sign in',
          render: () => (
            <div className="st-device">
              <span className="st-device-ico">{I.device}</span>
              <div className="st-device-txt"><b>{browser}{os ? ' · ' + os : ''}</b><small>{lastIn ? t('Last sign-in') + ': ' + lastIn : t('Signed in')}</small></div>
              <span className="st-pill-live"><i />{t('Active now')}</span>
            </div>) },
        { key: 's3', label: t('Sign out other devices'), desc: t('Keep this device signed in and sign out everywhere else.'), kw: 'sessions logout', render: () => (
          confirmSO === 'others'
            ? <div className="st-confirm"><span>{t('Are you sure?')}</span><button type="button" className="st-btn st-danger" disabled={soBusy} onClick={() => runSignOut('others')}>{t('Yes')}</button><button type="button" className="st-btn" onClick={() => setConfirmSO(null)}>{t('No')}</button></div>
            : <button type="button" className="st-btn" onClick={() => setConfirmSO('others')}>{t('Sign out others')}</button>) },
      ],
    },
    {
      id: 'privacy', icon: I.data, title: t('Privacy & data'), desc: t('Your data belongs to you.'),
      items: [
        { key: 'p1', label: t('Download my data'), desc: t('Get a copy of your account details and settings as a file.'), kw: 'export json gdpr', render: () => <button type="button" className="st-btn" onClick={downloadData}>{t('Download')}</button> },
      ],
    },
    {
      id: 'about', icon: I.info, title: t('Help & legal'), desc: t('Support and policies.'),
      items: [
        { key: 'h0', label: t('Contact support'), desc: t('Questions about payments, lessons or your account.'), kw: 'help telegram contact support', render: () => <a className="st-btn" href="https://t.me/ufuq_support" target="_blank" rel="noopener noreferrer">{t('Open Telegram')}</a> },
        { key: 'h1', label: t('Terms of Service'), desc: t('The rules for using Ufuq.'), kw: 'legal terms', render: () => <a className="st-btn" href="/terms" target="_blank" rel="noopener">{t('Open')}</a> },
        { key: 'h2', label: t('Privacy Policy'), desc: t('How we handle your information.'), kw: 'legal privacy data', render: () => <a className="st-btn" href="/privacy" target="_blank" rel="noopener">{t('Open')}</a> },
        { key: 'h3', label: t('Cookies'), desc: t('What we store in your browser.'), kw: 'legal cookies', render: () => <a className="st-btn" href="/cookies" target="_blank" rel="noopener">{t('Open')}</a> },
      ],
    },
    {
      id: 'account', icon: I.warn, title: t('Account'), desc: t('Sign out or remove your account.'), danger: true,
      items: [
        { key: 'a2', label: t('Sign out'), desc: t('Sign out of Ufuq on this device.'), kw: 'logout', render: () => <button type="button" className="st-btn st-danger" id="settingsSignOutBtn" onClick={signOut}>{t('Sign out')}</button> },
        { key: 'a3', label: t('Delete account'), desc: t('Permanently delete your account and learning data. This cannot be undone.'), kw: 'remove', render: () => <button type="button" className="st-btn st-danger st-solid" id="settingsDeleteBtn" onClick={() => setDelOpen(true)}>{t('Delete')}</button> },
      ],
    },
  ];

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!q) return sections;
    return sections.map((s) => {
      const secHit = (s.title + ' ' + s.desc).toLowerCase().includes(q);
      const items = secHit ? s.items : s.items.filter((it) => (it.label + ' ' + it.desc + ' ' + (it.kw || '')).toLowerCase().includes(q));
      return { ...s, items };
    }).filter((s) => s.items.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, lang, mode, prefs, notif, confirmSO, soBusy, user]);

  // Scroll-spy: highlight the section currently in view.
  useEffect(() => {
    const els = sections.map((s) => document.getElementById('st-sec-' + s.id)).filter(Boolean);
    if (!els.length || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id.replace('st-sec-', ''));
    }, { rootMargin: '-90px 0px -60% 0px', threshold: 0 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.length, q]);

  const go = (id) => {
    setActive(id);
    const el = document.getElementById('st-sec-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="settingsView" className="st">
      <PageStyle css={settingsCss} />
      <div className="inner-page-head st-head">
        <div>
          <h1>{t('Settings')}</h1>
          <p>{t('Manage your appearance, notifications, and account.')}</p>
        </div>
        <label className="st-search">
          {I.search}
          <input type="search" value={query} placeholder={t('Search settings')} aria-label={t('Search settings')} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="st-layout">
        <aside className="st-nav">
          <div className="st-me">
            <span className="st-me-av">{avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.charAt(0).toUpperCase()}</span>
            <span className="st-me-txt"><b>{displayName}</b><small>{email}</small></span>
          </div>
          <nav aria-label={t('Settings')}>
            {sections.map((s) => (
              <button type="button" key={s.id} className={'st-nav-item' + (active === s.id ? ' on' : '')} onClick={() => go(s.id)}>
                <i>{s.icon}</i><span>{s.title}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="st-reset" disabled={isDefault} onClick={() => { reset(); savedToast(); }}>{I.reset}<span>{t('Reset appearance')}</span></button>
        </aside>

        <div className="st-body">
          {shown.length === 0 && (
            <div className="st-empty"><i>{I.search}</i><b>{t('No settings match')}</b><span>{t('Try a different word.')}</span></div>
          )}
          {shown.map((s, i) => (
            <section className={'st-card' + (s.danger ? ' st-card-danger' : '')} id={'st-sec-' + s.id} key={s.id} style={{ '--i': i }}>
              <header className="st-card-head">
                <span className="st-card-ico">{s.icon}</span>
                <div><h2>{s.title}</h2><p>{s.desc}</p></div>
              </header>
              <div className="st-rows">
                {s.items.map((it) => (
                  it.block ? (
                    <div className="st-block" key={it.key}>
                      {!it.bare && <><div className="st-row-label">{it.label}</div>
                      <div className="st-row-desc">{it.desc}</div></>}
                      <div className={it.bare ? '' : 'st-block-body'}>{it.render()}</div>
                    </div>
                  ) : (
                    <div className="st-row" key={it.key}>
                      <div className="st-row-text">
                        <div className="st-row-label">{it.label}</div>
                        <div className="st-row-desc">{it.desc}</div>
                      </div>
                      <div className="st-row-ctl">{it.render()}</div>
                    </div>
                  )
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <DeleteAccountDialog open={delOpen} onClose={() => setDelOpen(false)} />
      <PasswordModal
        open={passwordOpen} onClose={() => setPasswordOpen(false)} email={email}
        onSaved={() => { setPasswordOpen(false); flashToast(t('Password updated')); }}
      />
      <div className={'save-toast' + (toast ? ' show' : '')} id="saveToast">
        {I.check}<span>{toast || ''}</span>
      </div>
    </section>
  );
}
