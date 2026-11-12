import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Loader from '../../components/Loader';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import tokensCss from '../../styles/tokens.css?inline';
import shellCss from '../../styles/app-shell.css?inline';
import elementsCss from '../../styles/landing-elements.css?inline';
import polishCss from '../../styles/landing-polish.css?inline';
import PageStyle from '../../components/PageStyle';
import Reveal from '../../components/Reveal';
import LangSelect from '../../components/LangSelect';
import { useI18n } from '../../context/I18nContext';
import { getSessionAndRole, hasStoredSession, homeRoute, isOAuthCallback, readCachedRole, ROLE_PAGES, storedSessionUserId } from '../../lib/auth';
import { setPayIntent, afterAuthDestination } from '../../lib/payIntent';
import fxCss from './fx/fx.css?inline';
import showcaseCss from './showcase.css?inline';
import Showcase from './Showcase';
import LandingFX from './fx/LandingFX';
import SandCalligraphy from './fx/SandCalligraphy';
import HeroOrnament from './fx/HeroOrnament';
import { SandDivider } from './fx/ornaments';
import AuthModal from './AuthModal';
import Lightbox from './Lightbox';
import CardVideo from './CardVideo';
import { LEGAL_DOCS, legalUi } from '../Legal/legalContent';
import { useLandingMedia } from '../../lib/landingMedia';
import usePlanPrices from '../../lib/usePlanPrices';
import {
  NAV_LINKS, ABOUT_CREDS, EXPLORE_CARDS, PROGRAMS, PROG_ARROW, DISCOVER_TABS,
  FACES, QUOTES, PRICING_FEATURES, FAQ, FOOTER_COLUMNS,
} from './landingData';

const PLAY_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);

/* ---------------------------------------------------------------- header */
function SiteHeader({ onOpenAuth }) {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeHref, setActiveHref] = useState(null);

  useEffect(() => {
    // Highlight the nav link whose section currently spans the reading line (≈40% of the viewport).
    const updateActive = () => {
      const line = window.innerHeight * 0.4;
      let found = null;
      for (const l of NAV_LINKS) {
        const el = document.getElementById(l.href.slice(1));
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= line && r.bottom > line) { found = l.href; break; }
      }
      setActiveHref(found);
    };
    const onScroll = () => {
      setScrolled(window.scrollY > 30);
      updateActive();
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const media = useLandingMedia();
  return (
    <header id="site-header" className={scrolled ? 'scrolled' : undefined}>
      <div className="wrap">
        <nav>
          <div className="nav-left">
            <div className="logo"><img src={media.img('site_logo', '/assets/images/img-01.webp')} alt="Ufuq logo" /><span>Ufuq</span></div>
            <div className={'nav-links' + (menuOpen ? ' mobile-open' : '')}>
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className={activeHref === l.href ? 'active' : undefined}
                  aria-current={activeHref === l.href ? 'location' : undefined}
                  onClick={() => setMenuOpen(false)}
                >{t(l.key)}</a>
              ))}
            </div>
          </div>
          <div className="nav-right">
            <LangSelect />
            <a href="#" className="nav-cta js-open-auth" data-mode="signin"
               onClick={(e) => { e.preventDefault(); onOpenAuth('signin'); }}>{t('nav.signin')}</a>
            <button type="button" className="mobile-menu-btn" id="mobileMenuBtn" aria-label="Menu" aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((o) => !o)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */
function Hero({ onOpenAuth }) {
  const { t } = useI18n();
  const media = useLandingMedia();
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div>
          <div className="eyebrow">{t('hero.eyebrow')}</div>
          <h1 style={{ marginTop: '16px' }}>
            <span>{t('hero.title1')}</span>{' '}<span className="gold">{t('hero.title2')}</span>
          </h1>
          <p className="lead">{t('hero.lead')}</p>
          <div className="hero-actions">
            <a href="#explore" className="btn-ghost">{t('hero.explore')}</a>
            <a href="#" className="btn-primary js-open-auth" data-mode="signup"
               onClick={(e) => { e.preventDefault(); onOpenAuth('signup'); }}>{t('hero.startlearning')}</a>
          </div>
          <a href="#about-author" className="hero-teacher">
            <span className="hero-teacher-avatar"><img src={media.img('hero_teacher', '/assets/images/img-02.webp')} alt="Ustaz Ali Hifniy" /></span>
            <span className="hero-teacher-text">
              <span className="name">{t('person.name')}</span>
              <span className="role">{t('hero.teacherrole')}</span>
            </span>
          </a>
        </div>
        <Reveal className="hero-visual" initiallyIn>
          <div className="glow"></div>
          <div className="ring" aria-hidden="true"></div>
          <HeroOrnament />
          <div className="calligraphy" aria-hidden="true">أُفُق</div>
          <SandCalligraphy />
        </Reveal>
      </div>
      <SandDivider className="in-hero" />
    </section>
  );
}

/* ---------------------------------------------------------- about teaser */
function AboutTeaser() {
  const { t } = useI18n();
  const media = useLandingMedia();
  return (
    <section className="about-author" id="about-author" style={{ '--about-bg-image': "url('" + media.img('bg_about', '/assets/images/img-03.webp') + "')" }}>
      <div className="wrap about-grid">
        <Reveal className="about-visual">
          <div className="glow"></div>
          <img src={media.img('about_photo', '/assets/images/img-04.webp')} alt="Ustaz Ali Hifniy" className="about-photo" />
        </Reveal>
        <Reveal>
          <div className="eyebrow">{t('about.eyebrow')}</div>
          <h2 style={{ marginTop: '14px' }}>{t('person.name')}</h2>
          <p className="about-role">{t('about.role')}</p>
          <p className="about-bio">{t('about.bio')}</p>
          <div className="about-creds">
            {ABOUT_CREDS.map((c) => (
              <div className="cred" key={c.key}>
                <span className="cred-num">{c.num}</span><span className="cred-lbl">{t(c.key)}</span>
              </div>
            ))}
          </div>
          <Link to="/about-author" className="about-toggle" id="aboutMoreLink">{t('about.learnmore')}</Link>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- explore */
function Explore() {
  const { t } = useI18n();
  return (
    <section className="explore" id="explore">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="eyebrow">{t('explore.eyebrow')}</div>
          <h2>{t('explore.title')}</h2>
        </Reveal>
        <div className="explore-grid">
          {EXPLORE_CARDS.map((c) => (
            <Reveal className="ex-card" key={c.n}>
              <div className="num-tag">
                <span className="ex-ico" aria-hidden="true">{c.icon}</span>
                {c.soon ? <span className="coming-soon-badge">{t('auth.comingSoon')}</span> : <span className="ex-idx">{c.n}</span>}
              </div>
              <h3>{t(c.t)}</h3>
              <p>{t(c.d)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- programs */
function Programs({ onOpenLightbox }) {
  const { t } = useI18n();
  const media = useLandingMedia();
  return (
    <section className="programs" id="programs">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="eyebrow">{t('programs.eyebrow')}</div>
          <h2>{t('programs.title')}</h2>
          <p>{t('programs.sub')}</p>
        </Reveal>
        <div className="prog-grid">
          {PROGRAMS.map((pRaw, pi) => {
            const p = { ...pRaw, img: media.img('program_' + (pi + 1), pRaw.img) };
            return (
            <Reveal
              as="a" key={p.titleKey} className="prog-card js-prog-lightbox" href="#explore"
              onClick={(e) => {
                e.preventDefault();
                onOpenLightbox({ img: { src: p.img, alt: p.alt }, labelKey: p.labelKey, titleKey: p.titleKey });
              }}
            >
              <div className="prog-media"><img src={p.img} alt={p.alt} /></div>
              <div className="prog-scrim"></div>
              <span className="prog-icon" aria-hidden="true">{p.icon}</span>
              <div className="prog-copy">
                <div className="prog-label">{t(p.labelKey)}</div>
                <h3 className="prog-title">{t(p.titleKey)}</h3>
              </div>
              <span className="prog-arrow" aria-hidden="true">{PROG_ARROW}</span>
            </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- discover */
function Discover({ onOpenLightbox }) {
  const { t } = useI18n();
  const media = useLandingMedia();
  const [tab, setTab] = useState('stories');
  return (
    <section className="discover" id="discover" style={{ '--discover-img': 'url("' + media.img('bg_discover', '/assets/images/img-08.webp') + '")' }}>
      <div className="wrap">
        <Reveal className="section-head" style={{ textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
          <div className="eyebrow" style={{ justifyContent: 'center' }}>{t('discover.eyebrow')}</div>
          <h2>{t('discover.title')}</h2>
          <p style={{ marginLeft: 'auto', marginRight: 'auto' }}>{t('discover.sub')}</p>
        </Reveal>

        <div className="discover-tabs">
          {DISCOVER_TABS.map((d) => (
            <button key={d.id} type="button" className={'tab-btn' + (tab === d.id ? ' active' : '')} data-tab={d.id}
                    onClick={() => setTab(d.id)}>{t(d.tabKey)}</button>
          ))}
        </div>

        {DISCOVER_TABS.map((d) => (
          <div key={d.id} className={'discover-panel' + (tab === d.id ? ' active' : '')} data-panel={d.id}>
            <p className="discover-text">{t(d.textKey)}</p>
            <div className="discover-grid">
              {d.cards.map((cRaw, ci) => {
                const c = { ...cRaw, img: media.img(d.id + '_' + (ci + 1), cRaw.img), video: media.video(d.id + '_' + (ci + 1), cRaw.video) };
                const open = () => onOpenLightbox({
                  img: { src: c.img, alt: c.alt, style: c.imgStyle }, video: c.video, labelKey: d.tabKey, titleKey: c.titleKey,
                });
                return (
                  <Reveal
                    key={c.titleKey} className="disc-card js-prog-lightbox" tabIndex={0} role="button"
                    onClick={(e) => { e.preventDefault(); open(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
                  >
                    <div className={'disc-art' + (c.moral ? ' moral-photo' : '') + ' prog-media'}>
                      <img src={c.img} alt={c.alt} style={c.imgStyle} />
                      <CardVideo src={c.video} poster={c.img} />
                    </div>
                    <span className="disc-play" aria-hidden="true">{PLAY_ICON}</span>
                    <div className="disc-scrim"></div>
                    <div className="disc-copy">
                      <div className="disc-label">{t(d.tabKey)}</div>
                      <div className="disc-title">{t(c.titleKey)}</div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- testimonials */
/** Seamless infinite marquee. One "set" of cards is measured (pixel width incl. the gap); the set is repeated
 *  until the track is wider than the screen plus one set, and the animation travels exactly one set —
 *  so the end always meets the beginning with no gap or jump, at any screen width. */
function MarqueeTrack({ reverse, count, children }) {
  const ref = useRef(null);
  const [copies, setCopies] = useState(2);

  useLayoutEffect(() => {
    const track = ref.current;
    if (!track || !count) return undefined;
    const measure = () => {
      if (track.children.length <= count) return;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const first = track.children[0].getBoundingClientRect();
      const lastOfSet = track.children[count - 1].getBoundingClientRect();
      const setWidth = lastOfSet.right - first.left + gap;     // one full set including the gap that follows it
      if (setWidth <= 0) return;
      track.style.setProperty('--marquee-distance', setWidth + 'px');
      const need = Math.max(2, Math.ceil(window.innerWidth / setWidth) + 1);
      setCopies((c) => (c === need ? c : need));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track.children[0]);
    window.addEventListener('resize', measure);
    // images / fonts that load later change card widths — measure again once the page has settled
    const late = setTimeout(measure, 800);
    window.addEventListener('load', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('load', measure); clearTimeout(late); };
  }, [count, copies]);

  return (
    <div className={'marquee-track' + (reverse ? ' marquee-track-reverse' : '')} ref={ref}>
      {Array.from({ length: copies }, (_, i) => (
        <Fragment key={i}>{children}</Fragment>
      ))}
    </div>
  );
}

function Testimonials({ onOpenLightbox }) {
  const { t } = useI18n();
  const media = useLandingMedia();
  return (
    <section className="testimonials" id="stories">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="eyebrow">{t('testi.eyebrow')}</div>
          <h2>{t('testi.title')}</h2>
        </Reveal>
      </div>

      <div className="marquee-row marquee-row-top">
        <MarqueeTrack count={FACES.length}>
          {FACES.map((fRaw, i) => {
            const f = { ...fRaw, src: media.img('student_' + (i + 1), '/assets/students/' + fRaw.file) };
            const open = () => onOpenLightbox({
              img: { className: 'face-photo-img', src: f.src, alt: f.name, lazy: true, hideOnError: true },
              initial: f.initial, gradientClass: f.cls, label: f.level, title: f.name,
            });
            return (
              <div
                key={i} className="face-card js-prog-lightbox" tabIndex={0} role="button"
                onClick={(e) => { e.preventDefault(); open(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
              >
                <div className={`face-photo ${f.cls} prog-media`}>
                  <img className="face-photo-img" src={f.src} alt={f.name} loading="lazy"
                       onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  <span className="face-initial">{f.initial}</span>
                </div>
                <span className="face-expand" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M9 3H4v5M15 3h5v5M9 21H4v-5M15 21h5v-5" /></svg>
                </span>
                <div className="face-scrim"></div>
                <div className="face-info">
                  <div className="face-name">{f.name}</div>
                  <div className="face-level">{f.level}</div>
                </div>
              </div>
            );
          })}
        </MarqueeTrack>
      </div>

      <div className="marquee-row marquee-row-bottom">
        <MarqueeTrack reverse count={QUOTES.length}>
          {QUOTES.map((q, i) => (
            <div className="result-card" key={i}>
              <span className="result-quote">&ldquo;</span>
              <p>{t(q.qKey)}</p>
              <div className="result-who"><b>{q.name}</b> — <span>{t(q.levelKey)}</span></div>
            </div>
          ))}
        </MarqueeTrack>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- pricing */
const PAY_CSS = `
.price-card .pay-cta{ display:flex; flex-direction:column; align-items:center; gap:10px; margin-top:6px; }
.price-card .pay-cta .btn-primary{ width:100%; text-align:center; }
.price-card .pay-signin{ background:none; border:none; padding:0; font:inherit; font-size:13.5px; color:var(--text-muted); cursor:pointer; }
.price-card .pay-signin b{ color:var(--gold-bright); font-weight:600; text-decoration:underline; text-underline-offset:3px; }
.price-card .pay-signin:hover{ color:var(--text); }
.price-card .pay-methods{ display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-top:16px; padding-top:16px; border-top:1px solid var(--line); }
.price-card .pay-chip{ display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:99px; background:var(--gold-dim); color:var(--text-muted); font-size:12px; }
.price-card .pay-chip svg{ width:13px; height:13px; color:var(--gold-bright); }
.price-card .pay-note{ margin-top:10px; text-align:center; font-size:12px; color:var(--text-muted); line-height:1.5; }
`;
const PAY_CARD = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>;
const PAY_BANK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-6 9 6" /><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" /></svg>;
const PAY_LOCK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>;

function Pricing({ onOpenAuth }) {
  const { t } = useI18n();
  const media = useLandingMedia();
  // Prices come from the server (the same plans the checkout charges), so an admin change shows here at once.
  const { plans, savePct } = usePlanPrices('en');
  const money = (c) => '$' + (Math.round(c) / 100).toFixed(c % 100 ? 2 : 0);
  const pm = plans.find((x) => x.id === 'monthly'), py = plans.find((x) => x.id === 'yearly');
  const monthlyAmt = pm ? money(pm.usd_cents) : '$30';
  const yearlyAmt = py ? money(py.usd_cents / py.months) : '$24.90';
  const yearlyNote = (s) => (py ? s.replace('298.80', (py.usd_cents / 100).toFixed(2)).replace(/17%/, savePct + '%') : s);
  const [plan, setPlan] = useState('monthly');
  const yearly = plan === 'yearly';
  // "Pay" = remember the chosen plan, then sign up; right after signing in the visitor lands on the checkout with this plan.
  const startPay = (mode) => (e) => { e.preventDefault(); setPayIntent(plan); onOpenAuth(mode); };
  return (
    <section className="pricing" id="pricing" style={{ '--flower-img': "url('" + media.img('bg_pricing', '/assets/images/img-18.webp') + "')" }}>
      <PageStyle css={PAY_CSS} />
      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <span key={n} className={`flower f${n}`} aria-hidden="true"></span>)}
      <div className="wrap">
        <Reveal className="section-head">
          <div className="eyebrow">{t('pricing.eyebrow')}</div>
          <h2>{t('pricing.title')}</h2>
        </Reveal>
        <Reveal className="plan-toggle">
          <button type="button" className={'toggle-btn' + (!yearly ? ' active' : '')} data-plan="monthly"
                  onClick={() => setPlan('monthly')}>{t('pricing.monthly')}</button>
          <button type="button" className={'toggle-btn' + (yearly ? ' active' : '')} data-plan="yearly"
                  onClick={() => setPlan('yearly')}>
            <span>{t('pricing.yearly')}</span>{' '}<span className="save-badge" dir="auto">{t('pricing.save')}</span>
          </button>
        </Reveal>
        <Reveal className="price-card">
          <div className="pc-grid">
          <div className="pc-main">
          <div className="plan-name">{t('pricing.planname')}</div>
          <div className="amount" id="planAmount">{yearly ? yearlyAmt : monthlyAmt}<span>{t('pricing.perMonth')}</span></div>
          <div className="plan-note" id="planNote">{yearly ? yearlyNote(t('pricing.billedYearly')) : t('pricing.billedMonthly')}</div>
          <div className="pay-cta">
            <a href="#" className="btn-primary js-open-auth" data-mode="signup" onClick={startPay('signup')}>
              {t(yearly ? 'payEntry.ctaYearly' : 'payEntry.ctaMonthly')}
            </a>
            <button type="button" className="pay-signin" onClick={startPay('signin')}>
              {t('payEntry.haveAccount')} <b>{t('payEntry.signinToPay')}</b>
            </button>
          </div>
          </div>
          <ul className="pc-feats">{PRICING_FEATURES.map((k) => <li key={k}>{t(k)}</li>)}</ul>
          </div>
          <div className="pay-foot">
          <div className="pay-methods" aria-label={t('payEntry.methods')}>
            <span className="pay-chip">{PAY_CARD}{t('payEntry.card')}</span>
            <span className="pay-chip">{PAY_BANK}{t('payEntry.bank')}</span>
            <span className="pay-chip">{PAY_LOCK}{t('payEntry.secure')}</span>
          </div>
          <div className="pay-note">{t('payEntry.note')}</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- faq + etc */
function Faq() {
  const { t } = useI18n();
  return (
    <section className="faq-section" id="faq">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="eyebrow">{t('faq.eyebrow')}</div>
          <h2>{t('faq.title')}</h2>
        </Reveal>
        <Reveal className="faq-list">
          {FAQ.map((f) => (
            <details className="faq-item" key={f.q}>
              <summary><span>{t(f.q)}</span><span className="faq-icon" aria-hidden="true">+</span></summary>
              <p>{t(f.a)}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function Contact({ onOpenAuth }) {
  const { t } = useI18n();
  return (
    <section className="contact-section" id="contacts">
      <div className="wrap">
        <div className="contact-grid">
          <Reveal>
            <h2 className="contact-main-title">{t('contact.title')}</h2>
            <p className="contact-desc">{t('contact.desc')}</p>
            <div className="contact-actions">
              <a href="https://t.me/ufuq_support" target="_blank" rel="noopener" className="btn-telegram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.05 3.35 2.9 10.4c-1.24.5-1.23 1.19-.23 1.5l4.65 1.45 1.8 5.5c.22.6.37.84.76.84.3 0 .43-.14.6-.3l2.53-2.44 4.9 3.6c.9.5 1.55.24 1.77-.83l3.2-15.1c.3-1.32-.5-1.9-1.83-1.27Z" />
                </svg>
                <span>{t('contact.telegram')}</span>
              </a>
              <a href="#" className="btn-apply js-open-auth" data-mode="signup"
                 onClick={(e) => { e.preventDefault(); onOpenAuth('signup'); }}>{t('contact.apply')}</a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t, lang } = useI18n();
  const media = useLandingMedia();
  return (
    <footer id="about">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div className="foot-logo"><img src={media.img('site_logo', '/assets/images/img-01.webp')} alt="Ufuq logo" /><span>Ufuq</span></div>
            <p className="foot-desc">{t('footer.desc')}</p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.h}>
              <h5>{t(col.h)}</h5>
              <ul>
                {col.links.map((l) => {
                  // YouTube / Instagram / Telegram addresses are set by the main admin; a social link with no address is hidden.
                  const href = l.linkSlot ? media.link(l.linkSlot, l.href) : l.href;
                  if (l.linkSlot && (!href || href === '#')) return null;
                  const external = l.external || /^https?:\/\//i.test(href);
                  return (
                    <li key={l.key || l.text}>
                      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        {l.key ? t(l.key) : l.text}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="foot-bottom">
          <span>{t('footer.copyright')}</span>
          <span className="foot-legal">
            {LEGAL_DOCS.map((d) => <a key={d} href={`/${d}`}>{legalUi(lang).docs[d]}</a>)}
          </span>
          <span>{t('footer.tagline')}</span>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ page */
export default function LandingPage() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [auth, setAuth] = useState({ open: false, mode: 'signup' });
  const [lightbox, setLightbox] = useState(null);
  // Brauzerda saqlangan sessiya bo'lsa, tekshiruv tugaguncha landing o'rniga bo'sh ekran
  // ko'rsatiladi (login/landing "ko'rinib o'tib" ketmasligi uchun).
  // Coming back from Google / Apple the session is not stored yet (it is read from the URL): also show the blank screen,
  // otherwise the landing flashes for a second before the panel opens.
  const [checking, setChecking] = useState(() => hasStoredSession() || isOAuthCallback());

  const openAuth = useCallback((mode) => setAuth({ open: true, mode: mode || 'signup' }), []);
  const closeAuth = useCallback(() => setAuth((a) => ({ ...a, open: false })), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  // An already-signed-in visitor skips the landing page and lands straight on their
  // cabinet — port of auth-guard.js's ufuqRedirectIfSignedIn(), called from index.html.
  useEffect(() => {
    let cancelled = false;

    // 1) Tezkor yo'l: oldin kirgan va eslab qolingan bo'lsa — darrov o'z paneliga.
    //    (RequireRole/Teacher/Admin baribir sessiya va rolni qayta tekshiradi.)
    // Only a role cached for THIS session's user counts (another account's role on the same device must not be used).
    const oauth = isOAuthCallback();
    const cached = readCachedRole();
    const sessUid = storedSessionUserId();
    if (!oauth && sessUid && cached && cached.uid === sessUid && ROLE_PAGES[cached.role]) {
      navigate(afterAuthDestination(cached.role, homeRoute(cached.role, cached.tier)), { replace: true });
      return undefined;
    }

    // 2) Aks holda sessiya + rolni serverdan aniqlaymiz.
    (async () => {
      let result = null;
      // After Google the role is always read from the server (never a guess); the profile row can appear a moment late.
      for (let attempt = 0; attempt < (oauth ? 5 : 1) && !result; attempt++) {
        try { result = await getSessionAndRole(); } catch (e) { result = null; }
        if (cancelled) return;
        if (!result && oauth && attempt < 4) await new Promise((r) => setTimeout(r, 600));
      }
      if (cancelled) return;
      if (!result) { setChecking(false); return; }
      navigate(afterAuthDestination(result.role, homeRoute(result.role, result.admin_tier)), { replace: true });
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  // Modal / lightbox lock page scroll (same as the original body.style.overflow toggling).
  useEffect(() => {
    document.body.style.overflow = auth.open || lightbox ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [auth.open, lightbox]);

  // Arriving from another route with a #hash (e.g. /index#about-author) scrolls to it like a full page load did.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView();
  }, [hash]);

  if (checking) {
    return <Loader />;
  }

  return (
    <>
      <PageStyle css={tokensCss} />
      <PageStyle css={shellCss} />
      <PageStyle css={elementsCss} />
      <PageStyle css={fxCss} />
      <PageStyle css={polishCss} />
      <PageStyle css={showcaseCss} />
      <LandingFX />
      <SiteHeader onOpenAuth={openAuth} />
      <Hero onOpenAuth={openAuth} />
      <AboutTeaser />
      <Showcase />
      <Explore />
      <Programs onOpenLightbox={setLightbox} />
      <Discover onOpenLightbox={setLightbox} />
      <Testimonials onOpenLightbox={setLightbox} />
      <Pricing onOpenAuth={openAuth} />
      <Faq />
      <Contact onOpenAuth={openAuth} />
      <Footer />
      <AuthModal open={auth.open} mode={auth.mode} onModeChange={(mode) => setAuth((a) => ({ ...a, mode }))} onClose={closeAuth} />
      <Lightbox item={lightbox} onClose={closeLightbox} />
    </>
  );
}
