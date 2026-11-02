import { useEffect, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { useDashboardData, LEVEL_NAMES } from '../../../context/DashboardDataContext';
import { supabase } from '../../../lib/supabaseClient';

/* One-time window for a student who took 1st or 2nd place in a level ("You took 1st place"). It is shown once per certificate:
   the server remembers it (ack_certificates), so it never comes back, on any device. Until the migration is applied it stays silent. */
const CSS = `
.cw-back{ position:fixed; inset:0; z-index:420; display:grid; place-items:center; padding:16px; background:rgba(8,8,10,.78); backdrop-filter:blur(6px); animation:cwFade .25s ease both; }
.cw{ position:relative; width:min(440px,100%); text-align:center; padding:34px 28px 26px; border-radius:24px; border:1px solid rgba(200,160,60,.6); overflow:hidden;
  background:radial-gradient(420px 220px at 50% 0%, rgba(229,200,120,.28), transparent 70%), var(--bg-2); box-shadow:0 40px 90px -30px rgba(0,0,0,.9); animation:cwRise .4s cubic-bezier(.2,.8,.2,1) both; }
.cw-medal{ width:92px; height:92px; margin:0 auto 14px; border-radius:50%; display:grid; place-items:center; font:700 44px 'Fraunces',serif; color:#2F2208;
  background:linear-gradient(135deg,#F6E3A1,#C9A24B 55%,#8A6516); box-shadow:0 0 0 8px rgba(200,160,60,.18), 0 18px 36px -12px rgba(200,160,60,.8); animation:cwPop .6s cubic-bezier(.2,1.4,.3,1) .1s both; }
.cw.p2 .cw-medal{ background:linear-gradient(135deg,#F4F6F9,#B3BCC8 55%,#66707E); color:#1F2530; box-shadow:0 0 0 8px rgba(160,170,185,.2), 0 18px 36px -12px rgba(150,160,175,.8); }
.cw h2{ margin:0 0 8px; font-family:'Fraunces',serif; font-size:26px; color:var(--text); }
.cw p{ margin:0 0 20px; color:var(--text-muted); font-size:14.5px; line-height:1.6; }
.cw-btn{ display:block; width:100%; margin-top:10px; padding:13px 18px; border-radius:12px; border:none; cursor:pointer; font:700 15px 'Inter',sans-serif; color:var(--bg); background:linear-gradient(180deg,var(--gold-bright),var(--gold)); }
.cw-btn.ghost{ background:none; border:1px solid var(--line); color:var(--text-muted); font-weight:600; }
@keyframes cwFade{ from{ opacity:0; } to{ opacity:1; } }
@keyframes cwRise{ from{ opacity:0; transform:translateY(16px) scale(.97); } to{ opacity:1; transform:none; } }
@keyframes cwPop{ from{ transform:scale(.4); opacity:0; } to{ transform:none; opacity:1; } }
@media (prefers-reduced-motion:reduce){ .cw-back, .cw, .cw-medal{ animation:none; } }
`;

export default function CertificateWinModal({ onOpen }) {
  const { t } = useCabinetI18n();
  const { user, role, locked } = useDashboardData();
  const [win, setWin] = useState(null);
  const uid = user && user.id;

  useEffect(() => {
    if (!uid || role !== 'student' || locked) return undefined;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc('my_certificates');
      if (!alive || error || !Array.isArray(data)) return;
      const fresh = data.filter((r) => !r.seen).sort((a, b) => a.place - b.place || b.level - a.level);
      if (fresh.length) setWin(fresh[0]);
    })();
    return () => { alive = false; };
  }, [uid, role, locked]);

  if (!win) return null;
  const close = async (go) => {
    setWin(null);
    try { await supabase.rpc('ack_certificates'); } catch (e) { /* shown again next time at worst */ }
    if (go && onOpen) onOpen();
  };
  const place = Number(win.place);
  const lvl = LEVEL_NAMES[Math.max(0, Number(win.level) - 1)] || '';

  return (
    <div className="cw-back" role="dialog" aria-modal="true" aria-label={t('Congratulations')}>
      <style>{CSS}</style>
      <div className={'cw p' + place}>
        <div className="cw-medal">{place}</div>
        <h2>{place === 1 ? t('You took 1st place!') : t('You took 2nd place!')}</h2>
        <p>{t('Level')} {win.level} · {lvl}<br />{t('Your certificate is ready in the Certificates section.')}</p>
        <button type="button" className="cw-btn" onClick={() => close(true)}>{t('View my certificate')}</button>
        <button type="button" className="cw-btn ghost" onClick={() => close(false)}>{t('Close')}</button>
      </div>
    </div>
  );
}
