import { useLayoutEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import PageStyle from '../../components/PageStyle';
import LangSelect from '../../components/LangSelect';
import tokensCss from '../../styles/tokens.css?inline';
import { useI18n } from '../../context/I18nContext';
import { LEGAL } from './legalConfig';
import { LEGAL_DOCS, getLegalDoc, legalUi } from './legalContent';

const CSS = `
  *{box-sizing:border-box}
  html,body{height:auto !important;min-height:100%;overflow:visible !important;overflow-x:clip !important;}
  body{margin:0;background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;font-size:16px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  a{color:inherit;text-decoration:none;}
  a:focus-visible,button:focus-visible{outline:2px solid var(--gold-bright);outline-offset:3px;}

  /* ---------- top bar: logo (left) · language + back (right) ---------- */
  .lg-top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 84%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line);}
  .lg-top-in{max-width:1080px;margin:0 auto;padding:14px clamp(16px,4vw,28px);display:flex;align-items:center;justify-content:space-between;gap:12px;}
  .lg-logo{display:flex;align-items:center;gap:9px;color:var(--text);flex-shrink:0;}
  .lg-logo img{height:28px;width:auto;}
  .lg-logo span{font-family:'Fraunces',serif;font-size:19px;font-weight:600;}
  .lg-actions{display:flex;align-items:center;gap:14px;}

  .back-link{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:500;letter-spacing:.01em;color:var(--gold-bright);background:var(--gold-dim);border:1px solid rgba(201,162,75,.32);padding:8px 16px 8px 12px;border-radius:999px;text-decoration:none;white-space:nowrap;transition:background .25s ease,border-color .25s ease,color .25s ease,transform .25s ease,box-shadow .25s ease;}
  .back-link .back-ico{width:16px;height:16px;flex-shrink:0;transition:transform .25s ease;}
  .back-link:hover{background:rgba(201,162,75,.18);border-color:var(--gold-bright);color:var(--text);transform:translateX(-2px);box-shadow:0 8px 22px -12px rgba(201,162,75,.55);}
  .back-link:hover .back-ico{transform:translateX(-3px);}
  .back-link:focus-visible{outline:2px solid var(--gold-bright);outline-offset:3px;}
  [dir="rtl"] .back-link .back-ico{transform:scaleX(-1);}
  [dir="rtl"] .back-link:hover{transform:translateX(2px);}
  [dir="rtl"] .back-link:hover .back-ico{transform:scaleX(-1) translateX(-3px);}
  @media (max-width:520px){.back-link{padding:7px 13px 7px 10px;font-size:12.5px;}}

  .lang-select{position:relative;}
  .lang-btn{display:flex;align-items:center;gap:6px;background:none;border:1px solid rgba(237,234,227,.2);color:var(--text-muted);font-size:13px;font-family:'Inter',sans-serif;padding:8px 11px;border-radius:var(--radius);cursor:pointer;transition:border-color .2s ease,color .2s ease;}
  .lang-btn:hover,.lang-btn:focus-visible{border-color:var(--gold-bright);color:var(--gold-bright);}
  .lang-btn svg{width:11px;height:11px;transition:transform .2s ease;}
  .lang-select.open .lang-btn svg{transform:rotate(180deg);}
  .lang-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:128px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius);padding:6px;display:none;flex-direction:column;gap:2px;z-index:50;box-shadow:0 18px 40px -12px rgba(0,0,0,.6);}
  .lang-select.open .lang-menu{display:flex;}
  .lang-menu button{background:none;border:none;text-align:left;color:var(--text);font-size:13px;padding:8px 10px;border-radius:2px;cursor:pointer;font-family:'Inter',sans-serif;}
  .lang-menu button:hover{background:rgba(201,162,75,.14);color:var(--gold-bright);}
  .lang-menu button.active{color:var(--gold-bright);font-weight:600;}

  /* ---------- hero ---------- */
  .lg-hero{position:relative;padding:56px 0 40px;border-bottom:1px solid var(--line);background:radial-gradient(900px 340px at 50% -10%,var(--gold-dim),transparent 70%);}
  .lg-hero-in{max-width:1080px;margin:0 auto;padding:0 clamp(16px,4vw,28px);}
  .lg-eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);font-weight:600;}
  .lg-eyebrow::before{content:'';width:22px;height:1px;background:var(--gold);}
  .lg-hero h1{font-family:'Fraunces',serif;font-weight:500;font-size:clamp(32px,4.6vw,50px);line-height:1.1;margin:14px 0 14px;letter-spacing:-.01em;}
  .lg-meta{display:inline-flex;align-items:center;gap:8px;color:var(--text-muted);font-size:13.5px;padding:6px 12px;border:1px solid var(--line);border-radius:999px;}
  .lg-meta::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--gold-bright);box-shadow:0 0 8px rgba(229,200,120,.6);}

  /* ---------- body grid ---------- */
  .lg-wrap{max-width:1080px;margin:0 auto;padding:44px clamp(16px,4vw,28px) 40px;display:grid;grid-template-columns:240px minmax(0,1fr);gap:56px;align-items:start;}
  .lg-nav{position:sticky;top:96px;display:flex;flex-direction:column;gap:4px;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--bg-2);}
  .lg-nav h6{margin:0 0 10px 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted);font-weight:600;}
  .lg-nav a{position:relative;padding:10px 12px 10px 14px;border-radius:10px;color:var(--text-muted);font-size:14px;line-height:1.35;transition:color .2s ease,background .2s ease;}
  .lg-nav a::before{content:'';position:absolute;left:0;top:50%;width:2px;height:0;transform:translateY(-50%);border-radius:2px;background:var(--gold-bright);transition:height .25s ease;}
  .lg-nav a:hover{color:var(--text);background:rgba(255,255,255,.04);}
  .lg-nav a.on{color:var(--gold-bright);background:var(--gold-dim);}
  .lg-nav a.on::before{height:60%;}

  .lg-doc{min-width:0;max-width:760px;}
  .lg-note{padding:14px 16px;border:1px solid rgba(201,162,75,.28);background:var(--gold-dim);border-radius:12px;color:var(--text-muted);font-size:14px;line-height:1.6;margin:0 0 28px;}
  .lg-sec{padding:0 0 30px;margin:0 0 30px;border-bottom:1px solid var(--line);counter-increment:lg;}
  .lg-sec:last-child{border-bottom:none;margin-bottom:0;}
  .lg-doc{counter-reset:lg;}
  .lg-sec h2{display:flex;align-items:baseline;gap:14px;font-family:'Fraunces',serif;font-weight:500;font-size:clamp(20px,2.4vw,24px);line-height:1.25;color:var(--text);margin:0 0 14px;scroll-margin-top:96px;}
  .lg-sec h2::before{content:counter(lg,decimal-leading-zero);flex-shrink:0;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:.06em;color:var(--gold-bright);background:var(--gold-dim);border:1px solid rgba(201,162,75,.3);border-radius:8px;padding:3px 8px;transform:translateY(-3px);}
  .lg-sec p{color:var(--text);opacity:.88;margin:0 0 14px;font-size:15.5px;line-height:1.8;overflow-wrap:anywhere;}
  .lg-sec ul{margin:0 0 14px;padding-left:22px;}
  .lg-sec li{color:var(--text);opacity:.88;margin-bottom:8px;font-size:15.5px;line-height:1.75;overflow-wrap:anywhere;}
  .lg-sec li::marker{color:var(--gold);}

  .lg-foot{border-top:1px solid var(--line);padding:24px clamp(16px,4vw,28px);text-align:center;color:var(--text-muted);font-size:13px;}

  [dir="rtl"] .lg-doc, [dir="rtl"] .lg-sec p, [dir="rtl"] .lg-sec li{font-family:'Amiri',serif;}
  [dir="rtl"] .lg-nav a::before{left:auto;right:0;}
  [dir="rtl"] .lg-nav a{padding:10px 14px 10px 12px;}
  [dir="rtl"] .lg-sec h2{flex-direction:row-reverse;}
  [dir="rtl"] .lg-meta::before{order:2;}

  @media (max-width:860px){
    .lg-wrap{grid-template-columns:1fr;gap:28px;}
    .lg-nav{position:static;flex-direction:row;flex-wrap:wrap;gap:6px;padding:12px;}
    .lg-nav h6{width:100%;margin:0 0 4px 4px;}
    .lg-nav a{padding:8px 12px;font-size:13.5px;border:1px solid var(--line);}
    .lg-nav a::before{display:none;}
    .lg-nav a.on{border-color:rgba(201,162,75,.4);}
    .lg-sec h2{scroll-margin-top:84px;}
  }
  @media (max-width:420px){
    .lg-actions{gap:8px;}
    .back-link{padding:8px;}
    .back-link span{display:none;}
  }
  @media (max-width:520px){
    .lg-top-in{padding:12px 16px;}
    .lg-logo span{font-size:17px;}
    .lg-hero{padding:40px 0 30px;}
    .lg-wrap{padding:28px 16px 32px;}
    .lg-sec p, .lg-sec li{font-size:15px;}
  }
  @media (prefers-reduced-motion:reduce){ *{transition:none !important;} }
`;

const ARROW = (
  <svg className="back-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export default function LegalPage({ doc }) {
  const { lang } = useI18n();

  // A page-to-page navigation can happen while a modal's scroll lock is still applied to <body>/<main>.
  // Clear those inline overrides so this document always scrolls.
  useLayoutEffect(() => {
    const els = [document.documentElement, document.body, document.querySelector('.main')].filter(Boolean);
    els.forEach((el) => {
      el.style.overflow = '';
      el.style.overflowY = '';
      el.style.paddingRight = '';
      el.style.height = '';
    });
    window.scrollTo(0, 0);
  }, [doc]);

  if (!LEGAL_DOCS.includes(doc)) return <Navigate to="/terms" replace />;

  const ui = legalUi(lang);
  const sections = getLegalDoc(lang, doc);
  const title = ui.docs[doc];
  const fallback = lang !== 'EN' && lang !== 'UZ' ? ui.fallback : '';

  return (
    <>
      <PageStyle css={tokensCss} />
      <PageStyle css={CSS} />

      <header className="lg-top">
        <div className="lg-top-in">
          <Link to="/index" className="lg-logo" aria-label="Ufuq">
            <img src="/assets/images/img-01.webp" alt="" />
            <span>Ufuq</span>
          </Link>
          <div className="lg-actions">
            <LangSelect />
            <Link to="/index" className="back-link" aria-label={ui.back}>
              {ARROW}
              <span>{ui.back}</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="lg-hero">
        <div className="lg-hero-in">
          <div className="lg-eyebrow">{ui.footerTitle}</div>
          <h1>{title}</h1>
          <div className="lg-meta">{ui.updated}: {LEGAL.updated}</div>
        </div>
      </section>

      <div className="lg-wrap">
        <nav className="lg-nav" aria-label={ui.footerTitle}>
          <h6>{ui.contents || ui.footerTitle}</h6>
          {LEGAL_DOCS.map((d) => (
            <Link key={d} to={`/${d}`} className={d === doc ? 'on' : ''} aria-current={d === doc ? 'page' : undefined}>
              {ui.docs[d]}
            </Link>
          ))}
        </nav>

        <article className="lg-doc">
          {fallback && <div className="lg-note">{fallback}</div>}
          {sections.map((s) => (
            <section className="lg-sec" key={s.h}>
              <h2>{s.h}</h2>
              {(s.p || []).map((x, i) => <p key={i}>{x}</p>)}
              {s.ul && <ul>{s.ul.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </section>
          ))}
        </article>
      </div>

      <footer className="lg-foot">© {new Date().getFullYear()} Ufuq</footer>
    </>
  );
}
