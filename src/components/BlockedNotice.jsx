import { useNavigate } from 'react-router-dom';
import { LANG_KEY } from '../i18n';
import { ufuqSignOut } from '../lib/auth';

const TEXT = {
  EN: { title: 'Your account is not active', sub: 'Your teacher or the administration removed this account from the platform. If you think this is a mistake, write to support.', support: 'Contact support', out: 'Sign out' },
  UZ: { title: 'Akkauntingiz faol emas', sub: "Ustozingiz yoki ma'muriyat bu akkauntni platformadan chiqargan. Agar bu xato deb o'ylasangiz, yordam xizmatiga yozing.", support: 'Yordamga yozish', out: 'Chiqish' },
  RU: { title: 'Ваш аккаунт не активен', sub: 'Преподаватель или администрация исключили этот аккаунт из платформы. Если это ошибка, напишите в поддержку.', support: 'Написать в поддержку', out: 'Выйти' },
  AR: { title: 'حسابك غير نشط', sub: 'قام معلمك أو الإدارة بإزالة هذا الحساب من المنصة. إذا كان هذا خطأً فتواصل مع الدعم.', support: 'التواصل مع الدعم', out: 'تسجيل الخروج' },
};

function readLang() {
  try { const l = localStorage.getItem(LANG_KEY); return TEXT[l] ? l : 'EN'; } catch (e) { return 'EN'; }
}

/** Shown instead of the student cabinet when profiles.status = 'blocked' (a teacher / admin removed the student from the platform). */
export default function BlockedNotice() {
  const navigate = useNavigate();
  const L = TEXT[readLang()];
  const out = async () => { await ufuqSignOut(); navigate('/index', { replace: true }); };
  return (
    <div role="alertdialog" aria-labelledby="blkTitle" dir={readLang() === 'AR' ? 'rtl' : 'ltr'}
         style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'grid', placeItems: 'center', padding: 20, background: 'var(--bg,#121212)', color: 'var(--text,#EDEAE3)' }}>
      <div style={{ width: '100%', maxWidth: 440, padding: '30px 26px', textAlign: 'center', borderRadius: 16, border: '1px solid var(--line,rgba(237,234,227,.14))', background: 'var(--bg-2,#1A1A1A)' }}>
        <h2 id="blkTitle" style={{ margin: '0 0 10px', fontSize: 22 }}>{L.title}</h2>
        <p style={{ margin: '0 0 22px', lineHeight: 1.6, color: 'var(--text-muted,#A8A29B)', fontSize: 14.5 }}>{L.sub}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <a href="https://t.me/ufuq_support" target="_blank" rel="noopener noreferrer"
             style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--gold,#C9A24B)', color: '#121212', fontWeight: 700, textDecoration: 'none' }}>{L.support}</a>
          <button type="button" onClick={out}
                  style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line,rgba(237,234,227,.2))', background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>{L.out}</button>
        </div>
      </div>
    </div>
  );
}
