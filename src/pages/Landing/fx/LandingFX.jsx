import { useEffect, useRef } from 'react';

/* Quiet page-wide effects: a thin scroll-progress bar and count-up numbers.
   (The old cursor sand trail, magnetic buttons and 3D-tilt cards were removed on purpose: buttons now stay where they are
   and cards never tilt.) */
export default function LandingFX() {
  const barRef = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const off = [];

    /* scroll progress */
    const bar = barRef.current; let tick = false;
    const onScroll = () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => {
        const h = document.documentElement, max = h.scrollHeight - h.clientHeight;
        if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, h.scrollTop / max) : 0) + ')';
        tick = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    off.push(() => window.removeEventListener('scroll', onScroll));

    /* count-up (mutates the text node's value so React keeps its reference) */
    if (!reduced && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return; io.unobserve(e.target);
        const node = e.target.firstChild; const m = node && /^(\d+)(.*)$/.exec(node.nodeValue || '');
        if (!m) return;
        const end = parseInt(m[1], 10), tail = m[2], t0 = performance.now(), dur = 1500;
        const run = (now) => {
          const p = Math.min(1, (now - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - p, 3)));
          node.nodeValue = v + tail; if (p < 1) requestAnimationFrame(run);
        };
        node.nodeValue = '0' + tail; requestAnimationFrame(run);
      }), { threshold: 0.6 });
      document.querySelectorAll('.cred-num').forEach((n) => io.observe(n));
      off.push(() => io.disconnect());
    }

    return () => off.forEach((f) => f());
  }, []);

  return <div className="fx-progress" aria-hidden="true"><i ref={barRef} /></div>;
}
