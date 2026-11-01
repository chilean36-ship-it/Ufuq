import { useCallback, useEffect, useRef, useState } from 'react';
import { getFreshUser, resolveFullName, saveFullName } from '../../lib/profileName';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ufuqSignOut } from '../../lib/auth';
import EditProfileModal from './EditProfileModal';
import ProfileCover from './ProfileCover';
import PasswordModal from './PasswordModal';
import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import { LEVEL_NAMES, clampLevel } from '../../context/DashboardDataContext';
import useLiveProfile from '../../hooks/useLiveRefresh';
import { announceAvatar, useLiveAvatar } from '../../lib/avatarSync';

const DATE_LOCALE = { EN: 'en', UZ: 'uz', RU: 'ru', AR: 'ar' }; // dates follow the interface language, not the browser's

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);
const TRASH_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
  </svg>
);
const AVATAR_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
  </svg>
);
const LEVEL_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4L3 8l9 4 9-4-9-4z" /><path d="M7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" /></svg>
);

const ico = (d, extra) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...extra}>{d}</svg>
);
const COPY_ICON = ico(<><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6.5A2.5 2.5 0 017.5 4H15" /></>);
const EDIT_ICON = ico(<><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>);
const LOGOUT_ICON = ico(<><path d="M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" /><path d="M16 17l5-5-5-5M21 12H9" /></>);
const SHIELD_ICON = ico(<><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>);
const KEY_ICON = ico(<><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2" /></>);
const USER_ICON = ico(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>);
const MAIL_ICON = ico(<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></>);
const PHONE_ICON = ico(<><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></>);
const GLOBE_ICON = ico(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z" /></>);
const CAL_ICON = ico(<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>);
const WARN_ICON = ico(<><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18.5v.1" /></>);
const CHEV_ICON = ico(<path d="M6 9l6 6 6-6" />);
const BADGE_ICON = ico(<><path d="M12 3l2.4 2.1 3.2-.3.9 3.1 2.8 1.7-1.1 3 1.1 3-2.8 1.7-.9 3.1-3.2-.3L12 21l-2.4-2.1-3.2.3-.9-3.1-2.8-1.7 1.1-3-1.1-3 2.8-1.7.9-3.1 3.2.3L12 3z" /><path d="M9 12l2 2 4-4" /></>);

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
    } catch (err) { return false; }
  }
}

function splitName(n) {
  const parts = (n || '').trim().split(/\s+/).filter(Boolean);
  const first = parts.shift() || '';
  const last = parts.join(' ');
  return { first, last };
}

export default function ProfileView({ onIdentityChange, asTeacher = false }) {
  const { t, lang } = useCabinetI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(() => localStorage.getItem('ufuq-profile-name') || '');
  const [email, setEmail] = useState(() => localStorage.getItem('ufuq-profile-email') || '');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('Uzbekistan');
  const [editCountry, setEditCountry] = useState('Uzbekistan');
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const avatarCacheKey = user ? 'ufuq-avatar:' + user.id : null;
  const [avatarUrl, setAvatarUrl] = useState(() => {
    try { return (user && localStorage.getItem('ufuq-avatar:' + user.id)) || null; } catch (e) { return null; }
  });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarKnown, setAvatarKnown] = useState(false); // true once the real photo (or its absence) has been read from the account
  const avatarFileInputRef = useRef(null);
  useLiveAvatar(user && user.id, (url) => { setAvatarUrl(url || null); setAvatarKnown(true); });
  const [role, setRole] = useState('student');
  // Real values from `profiles`: level (1–14, set by staff) and student_id (6 digits, generated by the DB trigger).
  const [level, setLevel] = useState(1);
  const [studentId, setStudentId] = useState('');

  // The `profiles` table row is the authority on the name; auth metadata is only a
  // fallback for accounts that predate that row (port of the profile.html session guard).
  useEffect(() => {
    if (!user) return;
    setEmail(user.email || '');
    localStorage.setItem('ufuq-profile-email', user.email || '');
    (async () => {
      let rowName = null;
      try {
        // select('*'): a single missing/renamed column must not make the whole row (photo, level, ID) disappear.
        const { data, error: rowError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (rowError) console.error('Profil qatorini olishda xatolik:', rowError.message);
        if (data && data.full_name) rowName = data.full_name;
        // The photo is also mirrored into the auth user's metadata, so it survives even if the profiles row can't be written.
        const savedAvatar = (data && data.avatar_url) || (user.user_metadata && user.user_metadata.avatar_url) || null;
        if (savedAvatar) {
          setAvatarUrl(savedAvatar);
          try { localStorage.setItem('ufuq-avatar:' + user.id, savedAvatar); } catch (e) { /* storage blocked */ }
        } else if (data) { // the account really has no photo (e.g. removed on another device) — drop any stale cached copy
          setAvatarUrl(null);
          try { localStorage.removeItem('ufuq-avatar:' + user.id); } catch (e) { /* storage blocked */ }
        }
        if (data || savedAvatar) setAvatarKnown(true);
        if (data && data.role) setRole(data.role);
        if (data) { setLevel(clampLevel(data.level)); setStudentId(data.student_id || ''); }
      } catch (err) {
        console.error('Profil ismini olishda xatolik:', err.message);
      }
      const fresh = await getFreshUser(user); // not the possibly stale `user` from React state
      const resolved = resolveFullName(fresh, rowName)
        || localStorage.getItem('ufuq-profile-name') || (user.email || '').split('@')[0] || 'Student';
      setName(resolved);
      localStorage.setItem('ufuq-profile-name', resolved);
    })();
  }, [user]);

  const flashToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);


  // Reads the chosen file, downsizes it to a square-ish JPEG on a canvas (so uploads stay
  // small and consistent), and resolves both a data URL (for the optimistic preview) and
  // the compressed blob (for the actual upload) — port of ufuqReadAndResizeImage in dashboard.html.
  const readAndResizeImage = useCallback((file, maxSize, quality) => (
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('image decode failed'));
        img.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          canvas.toBlob((blob) => resolve({ dataUrl, blob }), 'image/jpeg', quality);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    })
  ), []);

  const uploadAvatarFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { flashToast(t('Please choose an image file')); return; }
    if (file.size > 8 * 1024 * 1024) { flashToast(t('Image is too large (max 8MB)')); return; }
    setAvatarUploading(true);
    try {
      const { dataUrl, blob } = await readAndResizeImage(file, 240, 0.85);
      // Show the new photo immediately (optimistic), then persist for real.
      setAvatarUrl(dataUrl);
      if (!user) { flashToast(t('Photo updated')); return; }
      const path = user.id + '/avatar.jpg';
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust so the browser doesn't keep showing the old cached image at the same URL.
      const publicUrl = pub.publicUrl + '?v=' + Date.now();
      // .select() returns the updated rows: with a restrictive RLS policy an UPDATE can "succeed" while touching 0 rows.
      const { data: updated, error: profileError } = await supabase.from('profiles')
        .update({ avatar_url: publicUrl }).eq('id', user.id).select('avatar_url');
      if (profileError || !updated || !updated.length) {
        const { error: rpcError } = await supabase.rpc('set_my_avatar', { p_url: publicUrl });
        if (rpcError) throw new Error((profileError && profileError.message) || 'profiles update touched 0 rows; ' + rpcError.message);
      }
      try { await supabase.auth.updateUser({ data: { avatar_url: publicUrl } }); } catch (e) { /* the profiles row is the main copy */ }
      announceAvatar(user.id, publicUrl);
      setAvatarUrl(publicUrl);
      setAvatarKnown(true);
      flashToast(t('Photo updated'));
    } catch (err) {
      console.error('Rasmni yangilashda xatolik:', err && err.message);
      flashToast(t('Could not update photo') + (err && err.message ? ' — ' + String(err.message).slice(0, 70) : ''));
    } finally {
      setAvatarUploading(false);
    }
  }, [flashToast, readAndResizeImage, t, user]);

  const handleAvatarChange = useCallback((e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = '';
    uploadAvatarFile(file);
  }, [uploadAvatarFile]);

  // Drag & drop a photo straight onto the avatar
  const [dragOver, setDragOver] = useState(false);
  const onAvatarDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && !avatarUploading) uploadAvatarFile(f);
  }, [uploadAvatarFile, avatarUploading]);

  // Remove the photo everywhere: storage file, profiles row, auth metadata and the local cache.
  const handleAvatarRemove = useCallback(async () => {
    if (!avatarUrl || avatarUploading) return;
    if (!window.confirm(t('Remove photo') + '?')) return;
    setAvatarUploading(true);
    try {
      if (user) {
        const { data: updated, error: profileError } = await supabase.from('profiles')
          .update({ avatar_url: null }).eq('id', user.id).select('avatar_url');
        if (profileError || !updated || !updated.length) {
          const { error: rpcError } = await supabase.rpc('set_my_avatar', { p_url: null });
          if (rpcError) throw new Error((profileError && profileError.message) || rpcError.message);
        }
        try { await supabase.auth.updateUser({ data: { avatar_url: null } }); } catch (e) { /* ignore */ }
        try { await supabase.storage.from('avatars').remove([user.id + '/avatar.jpg']); } catch (e) { /* the file may not exist */ }
        announceAvatar(user.id, null);
      }
      setAvatarUrl(null);
      setAvatarKnown(true);
      flashToast(t('Photo removed'));
    } catch (err) {
      console.error('Rasmni o‘chirishda xatolik:', err && err.message);
      flashToast(t('Could not remove photo') + (err && err.message ? ' — ' + String(err.message).slice(0, 70) : ''));
    } finally {
      setAvatarUploading(false);
    }
  }, [avatarUrl, avatarUploading, flashToast, t, user]);

  const [copied, setCopied] = useState('');
  const [dangerOpen, setDangerOpen] = useState(false);
  const copiedTimer = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const doCopy = async (key, value) => {
    if (!value) return;
    const ok = await copyText(value);
    if (ok) { setCopied(key); flashToast(t('Copied')); clearTimeout(copiedTimer.current); copiedTimer.current = setTimeout(() => setCopied(''), 1600); }
  };
  // Hero parallax: the horizon follows the pointer a little (desktop only, purely decorative)
  const onHeroMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    e.currentTarget.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };
  const fmtDate = (iso, opts) => { try { return iso ? new Date(iso).toLocaleDateString(DATE_LOCALE[lang] || 'en', opts) : ''; } catch (e) { return ''; } };

  const displayName = name || t('Student');
  const { first, last } = splitName(displayName);
  const initial = displayName.charAt(0).toUpperCase();

  async function handleSaveProfile({ firstName, lastName, country: newCountry, dialCode, phoneDigits, phoneLen, phoneFormatted }) {
    if (phoneDigits.length === phoneLen) setPhone(`${dialCode} ${phoneFormatted}`);
    else if (phoneDigits.length === 0) setPhone('');
    // else: partially entered — leave the previously saved number untouched (same as the original).

    setCountry(newCountry);
    const n = [firstName, lastName].filter(Boolean).join(' ');
    if (n) {
      const prev = name;
      setName(n); // optimistic; rolled back below if the database did not accept it
      try {
        await saveFullName(user, n);
      } catch (err) {
        console.error('Ismni yangilashda xatolik:', err.message);
        setName(prev);
        setEditOpen(false);
        flashToast(/INVALID_NAME/.test((err && err.message) || '') ? t('Please enter a valid name.') : t('Could not save the name. Please try again.'));
        return;
      }
    }
    setEditOpen(false);
    flashToast(t('Profile updated'));
  }

  // A level changed by an admin shows up here at once (Realtime + focus + 5 s safety poll) — no reload needed.
  const pullLevel = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from('profiles').select('level, student_id').eq('id', user.id).maybeSingle();
      if (data) { setLevel(clampLevel(data.level)); if (data.student_id) setStudentId(data.student_id); }
    } catch (e) { /* keep the last known level */ }
  }, [user]);
  useLiveProfile(pullLevel, user ? [{ table: 'profiles', filter: 'id=eq.' + user.id }] : [], { enabled: !!user });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const handleDelete = () => setDeleteOpen(true);

  // Let the surrounding shell (topbar) follow name / photo / role changes made on this page.
  useEffect(() => {
    if (onIdentityChange) onIdentityChange({ name, avatarUrl, role, avatarKnown });
  }, [name, avatarUrl, role, avatarKnown]); // eslint-disable-line react-hooks/exhaustive-deps

  const verified = !!(user && (user.email_confirmed_at || user.confirmed_at));
  const memberSince = fmtDate(user && user.created_at, { month: 'long', year: 'numeric' });
  const lastSeen = fmtDate(user && user.last_sign_in_at, { day: 'numeric', month: 'short', year: 'numeric' });
  // Inside the teacher panel (and on the teacher profile page) a main admin is shown as a teacher.
  const roleLabel = t(asTeacher || role === 'teacher' ? 'Teacher' : role === 'admin' ? 'Admin' : 'Student');
  const fields = [
    { k: 'first', label: t('First name'), val: first, icon: USER_ICON, id: 'vFirstName' },
    { k: 'last', label: t('Last name'), val: last, icon: USER_ICON, id: 'vLastName' },
    { k: 'email', label: t('Email'), val: email, icon: MAIL_ICON, wide: true, badge: verified },
    { k: 'phone', label: t('Phone'), val: phone, icon: PHONE_ICON, id: 'vPhone' },
    { k: 'country', label: t('Country'), val: country, icon: GLOBE_ICON },
  ];

  return (
    <>
    <div className="pv">
      {/* ===== Hero ===== */}
      <section className="pv-hero" onPointerMove={onHeroMove}>
        <ProfileCover />

        <div className="pv-hero-body">
          <div
            className={'avatar-upload pv-avatar' + (dragOver ? ' is-drag' : '') + (avatarUploading ? ' is-busy' : '')}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onAvatarDrop}
          >
            <span className="pv-avatar-ring" aria-hidden="true" />
            <div className="avatar-lg" id="profileAvatarInitial">
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                : initial}
              <button type="button" className="pv-avatar-hover" tabIndex={-1} aria-hidden="true" onClick={() => { if (!avatarUploading) avatarFileInputRef.current?.click(); }}>
                {avatarUploading ? <i className="pv-spinner" /> : <>{AVATAR_ICON}<span>{dragOver ? t('Drop to upload') : t('Change photo')}</span></>}
              </button>
            </div>
            <div className={'avatar-edit-btn' + (avatarUploading ? ' is-busy' : '')} id="avatarEditBtn" aria-label={t('Change photo')} role="button" tabIndex={0}
                 aria-disabled={avatarUploading}
                 onClick={() => { if (!avatarUploading) avatarFileInputRef.current?.click(); }}
                 onKeyDown={(e) => { if (!avatarUploading && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); avatarFileInputRef.current?.click(); } }}>
              {AVATAR_ICON}
            </div>
            {avatarUrl && (
              <div className="avatar-remove-btn" id="avatarRemoveBtn" role="button" tabIndex={0} aria-label={t('Remove photo')} title={t('Remove photo')}
                   aria-disabled={avatarUploading}
                   onClick={handleAvatarRemove}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAvatarRemove(); } }}>
                {TRASH_ICON}
              </div>
            )}
            <input
              type="file" id="avatarFileInput" ref={avatarFileInputRef} accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }} onChange={handleAvatarChange}
            />
          </div>

          <div className="pv-who">
            <span className="pv-role">{roleLabel}</span>
            <h1 id="profileNameDisplay">{displayName}</h1>
            <button type="button" className={'pv-email pv-copy' + (copied === 'email-h' ? ' is-copied' : '')} title={t('Copy')} onClick={() => doCopy('email-h', email)}>
              {MAIL_ICON}<span id="profileEmailDisplay">{email}</span><i>{copied === 'email-h' ? CHECK_ICON : COPY_ICON}</i>
            </button>
            {role === 'student' && (
              <div className="pv-chips">
                <span className="pv-chip pv-chip-level">{LEVEL_ICON}<b>{t('Level')} {level}</b><em>{t(LEVEL_NAMES[level - 1])}</em></span>
                <button type="button" className={'pv-chip pv-chip-id pv-copy' + (copied === 'sid' ? ' is-copied' : '')} title={t('Copy')} onClick={() => doCopy('sid', studentId)}>
                  {t('Student ID:').replace(/:\s*$/, '')} <b>{studentId || '—'}</b>{studentId ? <i>{copied === 'sid' ? CHECK_ICON : COPY_ICON}</i> : null}
                </button>
              </div>
            )}
          </div>

          <div className="pv-actions">
            <button type="button" className="btn-edit-profile" id="editProfileBtn" onClick={() => { setEditCountry(country); setEditOpen(true); }}>{EDIT_ICON}<span>{t('Edit profile')}</span></button>
            <button type="button" className="btn-logout" id="logoutBtn"
                    onClick={async () => { await ufuqSignOut(); navigate('/index', { replace: true }); }}>
              {LOGOUT_ICON}<span>{t('Log out')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===== Quick facts ===== */}
      <div className="pv-stats">
        {role === 'student' ? (
          <div className="pv-stat pv-stat-level" style={{ '--i': 0 }}>
            <span className="pv-stat-k">{t('Level')}</span>
            <span className="pv-stat-v">{level}<small> / {LEVEL_NAMES.length}</small></span>
            <span className="pv-stat-sub">{LEVEL_ICON} {t(LEVEL_NAMES[level - 1])}</span>
            <span className="pv-steps" aria-hidden="true">
              {LEVEL_NAMES.map((n, i) => <i key={n} className={i < level ? 'on' : ''} style={{ '--s': i }} />)}
            </span>
          </div>
        ) : (
          <div className="pv-stat" style={{ '--i': 0 }}>
            <span className="pv-stat-k">{t('Account type')}</span>
            <span className="pv-stat-v pv-stat-text">{roleLabel}</span>
            <span className="pv-stat-sub">{LEVEL_ICON} Ufuq</span>
          </div>
        )}
        {role === 'student' && (
          <div className="pv-stat" style={{ '--i': 1 }}>
            <span className="pv-stat-k">{t('Student ID:').replace(/:\s*$/, '')}</span>
            <span className="pv-stat-v pv-stat-mono"><b id="studentIdDisplay">{studentId || '—'}</b></span>
            <span className="pv-stat-sub">{t('Account type')}: {t('Student')}</span>
          </div>
        )}
        <div className="pv-stat" style={{ '--i': 2 }}>
          <span className="pv-stat-k">{t('Member since')}</span>
          <span className="pv-stat-v pv-stat-text">{memberSince || '—'}</span>
          <span className="pv-stat-sub">{CAL_ICON} {lastSeen ? t('Last sign-in') + ': ' + lastSeen : '—'}</span>
        </div>
        <div className="pv-stat" style={{ '--i': 3 }}>
          <span className="pv-stat-k">{t('Country')}</span>
          <span className="pv-stat-v pv-stat-text" id="vCountry">{country || '—'}</span>
          <span className="pv-stat-sub">{phone || '—'}</span>
        </div>
      </div>

      <div className="pv-grid">
        {/* ===== Personal information ===== */}
        <section className="pv-panel">
          <div className="pv-panel-head pv-panel-head-row">
            <div>
              <h3>{t('Personal information')}</h3>
              <p>{t('Your account details.')}</p>
            </div>
            <button type="button" className="pv-icon-btn" onClick={() => { setEditCountry(country); setEditOpen(true); }}>{EDIT_ICON}<span>{t('Edit')}</span></button>
          </div>
          <dl className="pv-fields">
            {fields.map((f) => (
              <div className={'pv-field' + (f.wide ? ' pv-field-wide' : '')} key={f.k}>
                <span className="pv-field-ico">{f.icon}</span>
                <div className="pv-field-body">
                  <dt>{f.label}</dt>
                  <dd className={f.val ? '' : 'is-empty'} id={f.id}>
                    {f.val || '—'}
                    {f.badge && <span className="pv-verified" title={t('Email verified')}>{BADGE_ICON}</span>}
                  </dd>
                </div>
                {f.val && (f.k === 'email' || f.k === 'phone') ? (
                  <button type="button" className={'pv-field-copy' + (copied === f.k ? ' is-copied' : '')} aria-label={t('Copy')} title={t('Copy')} onClick={() => doCopy(f.k, f.val)}>
                    {copied === f.k ? CHECK_ICON : COPY_ICON}
                  </button>
                ) : null}
              </div>
            ))}
          </dl>
        </section>

        <div className="pv-side">
          {/* ===== Security ===== */}
          <section className="pv-panel pv-security">
            <div className="pv-panel-head pv-icon-head">
              <span className="pv-head-ico">{SHIELD_ICON}</span>
              <div>
                <h3>{t('Security')}</h3>
                <p>{t('Password')}: <span id="fPassword">••••••••</span></p>
              </div>
            </div>
            <button type="button" className="btn-change-gold pv-btn-wide" id="changePwBtn" onClick={() => setPasswordOpen(true)}>{KEY_ICON}<span>{t('Change password')}</span></button>
          </section>

          {/* ===== Danger zone (collapsed by default) ===== */}
          <section className={'pv-panel pv-danger' + (dangerOpen ? ' is-open' : '')}>
            <button type="button" className="pv-danger-toggle" aria-expanded={dangerOpen} onClick={() => setDangerOpen((v) => !v)}>
              <span className="pv-head-ico">{WARN_ICON}</span>
              <span className="pv-danger-title"><b>{t('Danger zone')}</b><small>{t('Permanently remove your account.')}</small></span>
              <span className="pv-chev">{CHEV_ICON}</span>
            </button>
            <div className="pv-danger-body"><div>
              <button type="button" className="btn-danger pv-btn-wide" id="deleteProfileBtn" onClick={handleDelete}>{TRASH_ICON}<span>{t('Delete profile')}</span></button>
            </div></div>
          </section>
        </div>
      </div>
    </div>

      <EditProfileModal
        open={editOpen} onClose={() => setEditOpen(false)} onSubmit={handleSaveProfile}
        firstName={first} lastName={last} country={editCountry} savedPhone={phone} onCountryChange={setEditCountry}
      />

      <div className={'save-toast' + (toast ? ' show' : '')} id="saveToast">
        {CHECK_ICON}<span>{toast || ''}</span>
      </div>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />

      <PasswordModal
        open={passwordOpen} onClose={() => setPasswordOpen(false)} email={email}
        onSaved={() => { setPasswordOpen(false); flashToast(t('Password updated')); }}
      />
    </>
  );
}
