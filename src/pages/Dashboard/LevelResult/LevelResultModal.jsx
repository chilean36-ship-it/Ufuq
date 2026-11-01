import { useEffect, useRef, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { lockScroll, unlockScroll } from '../../../lib/scrollLock';
import { LEVEL_MAX, PASS_MARK, fmtPts } from '../../../lib/scoring';
import PageStyle from '../../../components/PageStyle';
import css from './level-result.css?inline';

const CONFETTI_COLORS = ['#E5C878', '#C9A24B', '#E07A5F', '#6FB98F', '#7AA5D9', '#F2EFE8'];
const BALLOONS = [
  { l: 6, c: '#E5C878', d: 0, s: 1 }, { l: 20, c: '#E07A5F', d: .35, s: .8 }, { l: 38, c: '#6FB98F', d: .15, s: .95 },
  { l: 58, c: '#7AA5D9', d: .5, s: .85 }, { l: 76, c: '#E5C878', d: .25, s: 1 }, { l: 90, c: '#E07A5F', d: .6, s: .8 },
];

/** Number that counts up from 0 (skipped for reduced-motion users). */
function useCountUp(target, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !target) { setV(target || 0); return undefined; }
    let raf; const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const Star = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.7-5.4 4.8 1.6 7L12 17.3 5.8 21l1.6-7L2 9.3l7.1-.7z" fill="currentColor" /></svg>);

/**
 * Full-screen result window shown once after the level exams (midterm + final) are graded.
 *  - passed  : a celebration (confetti, balloons, medal, counting score, "Level N -> Level N+1", new group)
 *  - failed  : a calm message that the student left the group (and where they go now)
 */
export default function LevelResultModal({ item, onClose }) {
  const { t } = useCabinetI18n();
  const open = !!item;
  const passed = !!item && item.outcome === 'passed';
  const up = !!item && item.to_level > item.from_level;
  const down = !!item && item.to_level < item.from_level;
  const reason = (item && item.reason) || 'exam';       // 'exam' (graded level exams) | 'missed' (teacher moved down) | 'removed' (teacher removed)
  const missed = reason === 'missed';
  const removed = reason === 'removed';
  const hasScore = reason === 'exam';
  const total = Number((item && item.total_points) || 0);
  const shown = useCountUp(open ? total : 0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    lockScroll();
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); unlockScroll(); };
  }, [open]);

  if (!item) return null;
  const left = item.from_group_name;
  const dest = item.to_group_name;

  return (
    <div className={'lrm-overlay ' + (passed ? 'is-pass' : 'is-fail')} role="presentation">
      <PageStyle css={css} />
      {passed && (
        <div className="lrm-fx" aria-hidden="true">
          {Array.from({ length: 46 }, (_, i) => (
            <i key={i} className="lrm-conf" style={{ left: ((i * 37) % 100) + '%', background: CONFETTI_COLORS[i % CONFETTI_COLORS.length], animationDelay: ((i % 12) * 0.12) + 's', animationDuration: (2.8 + (i % 5) * 0.45) + 's', '--r': (i % 2 ? 1 : -1) * (180 + (i % 7) * 70) + 'deg', width: (6 + (i % 4) * 2) + 'px', height: (10 + (i % 3) * 4) + 'px' }} />
          ))}
          {BALLOONS.map((b, i) => (
            <span key={i} className="lrm-balloon" style={{ left: b.l + '%', animationDelay: b.d + 's', '--sc': b.s }}>
              <svg viewBox="0 0 40 70" width="44" height="76"><ellipse cx="20" cy="22" rx="16" ry="20" fill={b.c} /><ellipse cx="14" cy="14" rx="4" ry="6" fill="#fff" opacity=".35" /><path d="M20 42l-3 5h6z" fill={b.c} /><path d="M20 47c-4 6 4 10 0 22" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".55" /></svg>
            </span>
          ))}
        </div>
      )}

      <div className="lrm-card" role="dialog" aria-modal="true" aria-labelledby="lrmTitle">
        {passed ? (
          <div className="lrm-medal" aria-hidden="true">
            <div className="lrm-rays" />
            <div className="lrm-disc"><span className="lrm-lv">{item.to_level}</span><small>{t('Level').toUpperCase()}</small></div>
            <span className="lrm-spark s1"><Star /></span><span className="lrm-spark s2"><Star /></span><span className="lrm-spark s3"><Star /></span>
          </div>
        ) : (
          <div className="lrm-exit" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="52" height="52" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 8H10a2 2 0 00-2 2v28a2 2 0 002 2h9" /><path d="M30 16l8 8-8 8M38 24H18" /></svg>
          </div>
        )}

        <p className="lrm-kicker">{passed ? t('Congratulations!') : missed ? t('Exam deadline missed') : removed ? t('Removed from the group') : t('Not passed this time')}</p>
        <h2 id="lrmTitle" className="lrm-title">
          {passed
            ? (up ? t('You have moved up to') + ' Level-' + item.to_level : t('You completed the highest level!'))
            : removed ? t('You were removed from the group')
            : missed ? t('You were moved down to') + ' Level-' + item.to_level
            : (left ? t('You have left the group') : (down ? t('You were moved down to') + ' Level-' + item.to_level : t('You stay on') + ' Level-' + item.to_level))}
        </h2>

        {hasScore && (
          <>
            <div className="lrm-score">
              <b>{fmtPts(Math.round(shown * 10) / 10)}</b><span>/ {LEVEL_MAX}</span>
            </div>
            <div className="lrm-sub">
              {t('Midterm')}: <b>{fmtPts(item.midterm_points)}</b> · {t('Final exam')}: <b>{fmtPts(item.final_points)}</b> · {t('Pass mark is')} {PASS_MARK}
            </div>
          </>
        )}
        {missed && <p className="lrm-note">{t('You did not hand in the exam before the deadline.')}</p>}

        {up && (
          <div className="lrm-path" aria-hidden="true">
            <span>{t('Level')} {item.from_level}</span><i>→</i><span className="on">{t('Level')} {item.to_level}</span>
          </div>
        )}

        {passed ? (
          dest && <div className="lrm-group"><small>{t('Your new group')}</small><b>{dest}</b></div>
        ) : (
          <div className="lrm-group is-fail">
            {left && <div className="lrm-row"><small>{t('You left')}</small><b className="lrm-struck">{left}</b></div>}
            {dest
              ? <div className="lrm-row"><small>{t('Your new group')}</small><b>{dest}</b></div>
              : ((down || removed) && <p className="lrm-note">{t('Your teacher will add you to a group soon.')}</p>)}
            {down && !missed && <p className="lrm-note">{t('You were moved down to')} Level-{item.to_level}</p>}
            {!down && <p className="lrm-note">{t('You stay on')} Level-{item.to_level}</p>}
          </div>
        )}

        {!removed && <p className="lrm-reset">{t('Your exams for this level have been reset - you can take them again from the start.')}</p>}
        <button type="button" className="lrm-btn" onClick={onClose} autoFocus>{passed ? t('Keep going') : t('Got it')}</button>
      </div>
    </div>
  );
}
