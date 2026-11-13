import { useEffect, useMemo, useState } from 'react';
import { useApp } from './AppContext';
import { haptic, useToast } from './hooks';

const COLORS = ['#E5C878', '#C9A24B', '#6FCF97', '#4DA3FF', '#FF6B8A', '#9B7BFF'];

function Confetti({ onDone }) {
  const pieces = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.35, dur: 1.6 + Math.random() * 1.2, size: 6 + Math.random() * 7,
    rot: Math.random() * 360, color: COLORS[i % COLORS.length], drift: (Math.random() - 0.5) * 140, round: i % 3 === 0,
  })), []);
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="ua-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{ left: p.left + '%', width: p.size, height: p.round ? p.size : p.size * 1.6, background: p.color, borderRadius: p.round ? '50%' : 2, animationDelay: p.delay + 's', animationDuration: p.dur + 's', '--drift': p.drift + 'px', '--rot': p.rot + 'deg' }} />
      ))}
    </div>
  );
}

/** Listens for the daily-goal event and celebrates: confetti, a tick and a toast. */
export default function Celebrate() {
  const { t } = useApp();
  const toast = useToast();
  const [on, setOn] = useState(false);
  useEffect(() => {
    const fire = () => {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { toast(t('goalReachedTitle')); return; }
      setOn(true); haptic([20, 40, 20]); toast(t('goalReachedTitle') + ' — ' + t('goalReachedSub'));
    };
    window.addEventListener('ufuq-goal-reached', fire);
    window.addEventListener('ufuq-confetti', fire);
    return () => { window.removeEventListener('ufuq-goal-reached', fire); window.removeEventListener('ufuq-confetti', fire); };
  }, [t, toast]);
  return on ? <Confetti onDone={() => setOn(false)} /> : null;
}
