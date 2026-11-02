import { useCallback, useEffect, useRef, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { useDashboardData, LEVEL_NAMES } from '../../../context/DashboardDataContext';
import { supabase } from '../../../lib/supabaseClient';
import useLiveRefresh from '../../../lib/liveRefresh';
import { fmtDate } from '../../../lib/dateLocale';
import { fmtPts } from '../../../lib/scoring';
import Certificate, { certificateToPng, printCertificate, loadLogo } from './Certificate';
import css from './certificates.css?inline';
import PageStyle from '../../../components/PageStyle';

const PLACE_LABEL = { 1: '1st place', 2: '2nd place' };

/** Card that tilts toward the pointer and catches a moving light — pure CSS vars, no re-render per move. */
function TiltCard({ children, onClick, label }) {
  const ref = useRef(null);
  const move = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', ((0.5 - y) * 7).toFixed(2) + 'deg');
    el.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  };
  const leave = () => { const el = ref.current; if (el) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); } };
  return (
    <button type="button" ref={ref} className="cf-card" onMouseMove={move} onMouseLeave={leave} onClick={onClick} aria-label={label}>
      {children}
      <span className="cf-shine" aria-hidden="true" />
    </button>
  );
}

export default function CertificatesView() {
  const { t, lang } = useCabinetI18n();
  const { user, name } = useDashboardData();
  const userId = user && user.id;
  const [rows, setRows] = useState(null);
  const [logo, setLogo] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_certificates');
    if (error) { console.error('Sertifikatlar:', error.message); setRows([]); return; }
    setRows(data || []);
  }, []);
  useEffect(() => { load(); loadLogo().then(setLogo); }, [load]);
  useLiveRefresh(load);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  const propsFor = (r) => ({
    name: name || (typeof localStorage !== 'undefined' && localStorage.getItem('ufuq-profile-name')) || '',
    levelNo: r.level, levelName: LEVEL_NAMES[Math.max(0, Number(r.level) - 1)] || '',
    place: Number(r.place), points: fmtPts(r.total_points), max: r.max_points || 150,
    date: fmtDate(r.issued_at, lang, { day: 'numeric', month: 'long', year: 'numeric' }),
    number: `UFQ-L${r.level}-P${r.place}-${String(userId || '').replace(/-/g, '').slice(0, 6).toUpperCase()}`,
    logo,
  });

  const download = async (r) => {
    setBusy(true); setMsg('');
    try {
      const blob = await certificateToPng(propsFor(r));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `Ufuq-certificate-level-${r.level}-place-${r.place}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { setMsg(t('Could not create the image. Try again.')); }
    setBusy(false);
  };
  const print = (r) => { if (!printCertificate(propsFor(r))) setMsg(t('Allow pop-ups to print the certificate.')); };

  const list = rows || [];
  const firsts = list.filter((r) => Number(r.place) === 1).length;
  const seconds = list.filter((r) => Number(r.place) === 2).length;

  return (
    <div className="cf">
      <PageStyle css={css} />
      <section className="cf-hero">
        <div className="cf-hero-txt">
          <span className="cf-kicker">{t('Achievements')}</span>
          <h2>{t('Your certificates')}</h2>
          <p>{t('The two best results of every level receive a certificate. Students with the same result share the same place.')}</p>
        </div>
        <div className="cf-stats">
          <div><b>{rows === null ? '–' : firsts}</b><span>{t('1st place')}</span></div>
          <div><b>{rows === null ? '–' : seconds}</b><span>{t('2nd place')}</span></div>
        </div>
      </section>

      {rows !== null && list.length > 0 && (
        <div className="cf-grid">
          {list.map((r, i) => (
            <TiltCard key={r.level} onClick={() => setOpen(r)} label={`${t(PLACE_LABEL[r.place] || '')} · ${t('Level')} ${r.level}`}>
              <div className="cf-thumb" style={{ animationDelay: `${i * 70}ms` }}>
                <Certificate {...propsFor(r)} />
              </div>
              <div className="cf-meta">
                <span className={'cf-place p' + r.place}>{t(PLACE_LABEL[r.place] || '')}</span>
                <b>{t('Level')} {r.level} · {LEVEL_NAMES[Math.max(0, Number(r.level) - 1)]}</b>
                <small>{fmtPts(r.total_points)} / {r.max_points || 150} · {t('{n} students').replace('{n}', r.cohort_size)}</small>
              </div>
            </TiltCard>
          ))}
        </div>
      )}

      {rows !== null && list.length === 0 && (
        <section className="cf-empty">
          <div className="cf-ghosts" aria-hidden="true">
            {[1, 2].map((p) => (
              <div key={p} className={'cf-ghost g' + p}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6" /><path d="m8.5 14 -1.5 8 5 -3 5 3 -1.5 -8" /></svg>
                <b>{p}</b>
              </div>
            ))}
          </div>
          <h3>{t('No certificates yet')}</h3>
          <p>{t('When a level ends, the best two results receive a certificate here. Finish your midterm and final to compete.')}</p>
        </section>
      )}

      <section className="cf-how">
        {[
          ['1', 'Take the midterm and the final', 'Your level total is the midterm plus the final (150 points).'],
          ['2', 'The best results win', 'The highest total gets the 1st-place certificate, the next one the 2nd.'],
          ['3', 'Ties are shared', 'If several students have the same total, all of them receive that place.'],
        ].map(([n, h, d]) => (
          <div key={n} className="cf-step"><i>{n}</i><div><b>{t(h)}</b><span>{t(d)}</span></div></div>
        ))}
      </section>

      {open && (
        <div className="cf-modal" role="dialog" aria-modal="true" aria-label={t('Certificate')} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="cf-sheet">
            <button type="button" className="cf-x" aria-label={t('Close')} onClick={() => setOpen(null)}>×</button>
            <div className="cf-paper"><Certificate {...propsFor(open)} /></div>
            <div className="cf-actions">
              <button type="button" className="cf-btn primary" disabled={busy} onClick={() => download(open)}>
                {busy ? t('Preparing…') : t('Download PNG')}
              </button>
              <button type="button" className="cf-btn" onClick={() => print(open)}>{t('Print / Save as PDF')}</button>
            </div>
            {msg && <div className="cf-msg" role="status">{msg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
