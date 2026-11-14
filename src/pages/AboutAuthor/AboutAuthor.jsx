import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import tokensCss from '../../styles/tokens.css?inline';
import pageCss from './about-author.css?inline';
import PageStyle from '../../components/PageStyle';
import LangSelect from '../../components/LangSelect';
import { useI18n } from '../../context/I18nContext';
import { useLandingMedia } from '../../lib/landingMedia';
import { ABOUT_CREDS } from '../Landing/landingData';

const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Adds `.in` to every `.aa-rv` element once it scrolls into view (content stays visible if animations are off / unsupported). */
function useReveal(root) {
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const items = Array.from(el.querySelectorAll('.aa-rv'));
    if (reduced() || typeof IntersectionObserver === 'undefined') { items.forEach((n) => n.classList.add('in')); return undefined; }
    el.classList.add('aa-anim');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    items.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
}

/** "1000+" counts up from 0 the first time it is on screen. */
function CountUp({ value }) {
  const m = /^(\d+)(.*)$/.exec(String(value));
  const target = m ? Number(m[1]) : 0;
  const suffix = m ? m[2] : '';
  const [n, setN] = useState(reduced() || !m ? target : 0);
  const ref = useRef(null);
  useEffect(() => {
    if (!m || reduced() || typeof IntersectionObserver === 'undefined') { setN(target); return undefined; }
    let raf; let io;
    const run = () => {
      const t0 = performance.now(); const dur = 1400;
      const step = (ts) => {
        const k = Math.min(1, (ts - t0) / dur);
        setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); run(); } }, { threshold: 0.6 });
    if (ref.current) io.observe(ref.current);
    return () => { if (io) io.disconnect(); cancelAnimationFrame(raf); };
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}>{n}{suffix}</span>;
}

/** About the founder — long-form bio page: animated portrait hero, key facts, story in three chapters, a pull quote and a closing call to action. */
export default function AboutAuthor() {
  const { t } = useI18n();
  const media = useLandingMedia();
  const rootRef = useRef(null);
  const portraitRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => { document.title = t('author.meta.title'); }, [t]);
  useReveal(rootRef);

  // thin gold reading-progress line under the header
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // the portrait leans toward the pointer (desktop only)
  const onMove = (e) => {
    const el = portraitRef.current;
    if (!el || reduced()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', (x * 10).toFixed(2) + 'deg');
    el.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
  };
  const onLeave = () => {
    const el = portraitRef.current;
    if (el) { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); }
  };

  const chapters = [
    { n: '01', title: t('author.section1.title'), blocks: [
      { sub: t('author.section1.sub1'), ps: [t('author.section1.p1'), t('author.section1.p2')] },
      { sub: t('author.section1.sub2'), ps: [t('author.section1.p3'), t('author.section1.p4')] },
    ] },
    { n: '02', title: t('author.section2.title'), blocks: [{ ps: [t('author.section2.p1'), t('author.section2.p2')] }] },
    { n: '03', title: t('author.section3.title'), blocks: [{ ps: [t('author.section3.p1'), t('author.section3.p2')] }] },
  ];

  return (
    <div ref={rootRef} className="aa-page">
      <PageStyle css={tokensCss} />
      <PageStyle css={pageCss} />
      <header className="aa-top">
        <div className="head-wrap">
          <Link to="/index#about-author" className="back-link" aria-label={t('author.nav.back')}>
            <svg className="back-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            <span>{t('author.nav.back')}</span>
          </Link>
          <Link to="/index" className="logo"><img src="/assets/images/logo-small.png" alt="" /><span>Ufuq</span></Link>
          <div className="head-right"><LangSelect /></div>
        </div>
        <div className="aa-progress" aria-hidden="true"><i style={{ transform: `scaleX(${progress})` }} /></div>
      </header>

      <section className="aa-hero">
        <div className="aa-orb o1" aria-hidden="true" /><div className="aa-orb o2" aria-hidden="true" />
        <div className="aa-hero-inner">
          <div className="aa-stage" ref={portraitRef} onMouseMove={onMove} onMouseLeave={onLeave}>
            <svg className="aa-star" viewBox="0 0 200 200" aria-hidden="true">
              <g fill="none" stroke="currentColor" strokeWidth="0.7">
                <rect x="40" y="40" width="120" height="120" /><rect x="40" y="40" width="120" height="120" transform="rotate(45 100 100)" />
                <circle cx="100" cy="100" r="86" strokeDasharray="2 5" /><circle cx="100" cy="100" r="62" />
              </g>
            </svg>
            <div className="aa-frame">
              <div className="aa-portrait">
                <img src={media.img('about_photo', '/assets/images/img-04.webp')} alt={t('author.hero.name')} />
              </div>
            </div>
            <span className="aa-spark s1" aria-hidden="true" /><span className="aa-spark s2" aria-hidden="true" /><span className="aa-spark s3" aria-hidden="true" />
          </div>
          <div className="aa-intro">
            <div className="eyebrow aa-rv" style={{ '--d': '0ms' }}>{t('author.hero.eyebrow')}</div>
            <h1 className="aa-rv" style={{ '--d': '80ms' }}><span className="aa-shine">{t('author.hero.name')}</span></h1>
            <p className="role aa-rv" style={{ '--d': '160ms' }}>{t('author.hero.role')}</p>
            <div className="aa-facts">
              {ABOUT_CREDS.map((c, i) => (
                <div className="aa-fact aa-rv" key={c.key} style={{ '--d': 240 + i * 90 + 'ms' }}>
                  <span className="aa-fact-num"><CountUp value={c.num} /></span>
                  <span className="aa-fact-lbl">{t(c.key)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <main className="aa-main">
        <article className="aa-article">
          {chapters.map((c, ci) => (
            <section className="aa-chapter aa-rv" key={c.n}>
              <span className="aa-dot" aria-hidden="true" />
              <div className="aa-chapter-head">
                <span className="aa-chapter-n">{c.n}</span>
                <h2>{c.title}</h2>
              </div>
              {c.blocks.map((b, bi) => (
                <div key={bi}>
                  {b.sub && <h3>{b.sub}</h3>}
                  {b.ps.map((p, pi) => <p key={pi}>{p}</p>)}
                </div>
              ))}
              {ci === 0 && <blockquote className="lead-quote">{t('author.quote.text')}</blockquote>}
            </section>
          ))}
        </article>

        <aside className="aa-cta aa-rv">
          <p>{t('cta.sub')}</p>
          <Link to="/index" className="btn-primary">{t('contact.apply')}</Link>
        </aside>
      </main>

      <footer>{t('author.footer.copyright')}</footer>
    </div>
  );
}
