import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import tokensCss from '../../styles/tokens.css?inline';
import pageCss from './about-author.css?inline';
import PageStyle from '../../components/PageStyle';
import LangSelect from '../../components/LangSelect';
import { useI18n } from '../../context/I18nContext';
import { useLandingMedia } from '../../lib/landingMedia';
import { ABOUT_CREDS } from '../Landing/landingData';

/** About the founder — long-form bio page: portrait hero, key facts, story in three chapters, a pull quote and a closing call to action. */
export default function AboutAuthor() {
  const { t } = useI18n();
  const media = useLandingMedia();

  useEffect(() => { document.title = t('author.meta.title'); }, [t]);

  const chapters = [
    { n: '01', title: t('author.section1.title'), blocks: [
      { sub: t('author.section1.sub1'), ps: [t('author.section1.p1'), t('author.section1.p2')] },
      { sub: t('author.section1.sub2'), ps: [t('author.section1.p3'), t('author.section1.p4')] },
    ] },
    { n: '02', title: t('author.section2.title'), blocks: [{ ps: [t('author.section2.p1'), t('author.section2.p2')] }] },
    { n: '03', title: t('author.section3.title'), blocks: [{ ps: [t('author.section3.p1'), t('author.section3.p2')] }] },
  ];

  return (
    <>
      <PageStyle css={tokensCss} />
      <PageStyle css={pageCss} />
      <header className="aa-top">
        <div className="head-wrap">
          <Link to="/index" className="logo"><img src="/assets/images/logo-small.png" alt="" /><span>Ufuq</span></Link>
          <div className="head-right">
            <LangSelect />
            <Link to="/index#about-author" className="back-link" aria-label={t('author.nav.back')}>
              <svg className="back-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
              <span>{t('author.nav.back')}</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="aa-hero">
        <div className="aa-hero-inner">
          <div className="aa-portrait">
            <img src={media.img('about_photo', '/assets/images/img-04.webp')} alt={t('author.hero.name')} />
          </div>
          <div className="aa-intro">
            <div className="eyebrow">{t('author.hero.eyebrow')}</div>
            <h1>{t('author.hero.name')}</h1>
            <p className="role">{t('author.hero.role')}</p>
            <div className="aa-facts">
              {ABOUT_CREDS.map((c) => (
                <div className="aa-fact" key={c.key}>
                  <span className="aa-fact-num">{c.num}</span>
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
            <section className="aa-chapter" key={c.n}>
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

        <aside className="aa-cta">
          <p>{t('cta.sub')}</p>
          <Link to="/index" className="btn-primary">{t('contact.apply')}</Link>
        </aside>
      </main>

      <footer>{t('author.footer.copyright')}</footer>
    </>
  );
}
