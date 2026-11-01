import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import PageStyle from './PageStyle';
import css from '../styles/exam-mode.css?inline';
import { lockScroll, unlockScroll } from '../lib/scrollLock';

/**
 * The exam "room": a full-viewport layer rendered into <body>, so nothing of the dashboard (sidebar, topbar, AI
 * launcher, other sections) is visible or reachable while the student sits the exam.
 *
 * Desktop:  header (title, progress, tools)  /  [ question | numbered question list ]  /  footer (prev · mark · next)
 * Phone:    the question list becomes a bottom sheet opened from the "3 / 25" bar under the header.
 *
 * props: title, subtitle, progress { done, total }, right (node: save status, warnings, tools),
 *        nav [{ id, label, done, current, flag, group }], navTitle, navLegend { done, todo, flag, current } (labels),
 *        onNav(id), navActions (node, shown at the bottom of the list), current { n, total } (phone bar),
 *        footerLeft, footerCenter, footerRight, overlay (node rendered inside the room), children
 */
export default function ExamShell({
  title, subtitle, progress, right, nav, navTitle, navLegend, onNav, navActions, current,
  footerLeft, footerCenter, footerRight, overlay, children,
}) {
  const [sheet, setSheet] = useState(false);
  useEffect(() => { lockScroll(); document.body.classList.add('exam-room-open'); return () => { unlockScroll(); document.body.classList.remove('exam-room-open'); }; }, []);
  useEffect(() => {
    if (!sheet) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSheet(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const hasNav = !!(nav && nav.length > 0);

  // keep the original order, but print a heading whenever the group changes
  const blocks = [];
  if (hasNav) {
    nav.forEach((n) => {
      const g = n.group || '';
      const last = blocks[blocks.length - 1];
      if (last && last.group === g) last.items.push(n); else blocks.push({ group: g, items: [n] });
    });
  }
  // keep the current question visible in the list (desktop: while moving with Next / Previous; phone: when the sheet opens)
  const curId = hasNav ? (nav.find((n) => n.current) || {}).id : null;
  useEffect(() => {
    const el = document.querySelector('.xr-nav .xr-dot.cur');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [curId, sheet]);
  const go = (id) => { setSheet(false); if (onNav) onNav(id); };

  return createPortal(
    <div className="xr" role="dialog" aria-modal="true" aria-label={title}>
      <PageStyle css={css} />
      <header className="xr-head">
        <div className="xr-brand">
          <span className="xr-logo" aria-hidden="true">
            <img src="/assets/images/logo-mark.png" alt="" draggable="false" />
            <span className="xr-logo-name">Ufuq</span>
          </span>
          <div className="xr-titles">
            <div className="xr-title" dir="auto">{title}</div>
            {subtitle ? <div className="xr-sub">{subtitle}</div> : null}
          </div>
        </div>
        <div className="xr-right">{right}</div>
        {progress && (
          <div className="xr-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <i style={{ width: pct + '%' }} />
          </div>
        )}
      </header>

      {hasNav && current && (
        <button type="button" className="xr-qbar" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet}>
          <span className="xr-qbar-n"><b>{current.n}</b> / {current.total}</span>
          <span className="xr-qbar-track" aria-hidden="true"><i style={{ width: pct + '%' }} /></span>
          <span className="xr-qbar-go">{navTitle}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg></span>
        </button>
      )}

      <div className="xr-main">
        <main className="xr-body" id="xrBody">
          <div className="xr-inner">{children}</div>
        </main>

        {hasNav && (
          <>
            {sheet && <div className="xr-scrim" onClick={() => setSheet(false)} />}
            <aside className={'xr-nav' + (sheet ? ' open' : '')} aria-label={navTitle}>
              <div className="xr-nav-head">
                <span className="xr-nav-title">{navTitle}</span>
                <span className="xr-nav-count">{progress ? progress.done : 0}/{progress ? progress.total : 0}</span>
                <button type="button" className="xr-nav-close" onClick={() => setSheet(false)} aria-label="Close">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <div className="xr-nav-scroll">
                {blocks.map((b, bi) => (
                  <section className="xr-nav-block" key={bi}>
                    {b.group ? <h4 className="xr-nav-group" dir="auto" title={b.group}>{b.group}</h4> : null}
                    <div className="xr-nav-grid">
                      {b.items.map((n) => (
                        <button
                          key={n.id} type="button"
                          className={'xr-dot' + (n.done ? ' done' : '') + (n.current ? ' cur' : '') + (n.flag ? ' flag' : '')}
                          onClick={() => go(n.id)}
                          aria-current={n.current ? 'true' : undefined}
                        >{n.label}</button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {navLegend && (
                <div className="xr-legend">
                  <span><i className="d done" />{navLegend.done}</span>
                  <span><i className="d" />{navLegend.todo}</span>
                  <span><i className="d flag" />{navLegend.flag}</span>
                  <span><i className="d cur" />{navLegend.current}</span>
                </div>
              )}
              {navActions ? <div className="xr-nav-actions" onClick={() => setSheet(false)}>{navActions}</div> : null}
            </aside>
          </>
        )}
      </div>

      <footer className="xr-foot">
        <div className="xr-foot-l">{footerLeft}</div>
        <div className="xr-foot-c">{footerCenter}</div>
        <div className="xr-foot-r">{footerRight}</div>
      </footer>
      {overlay}
    </div>,
    document.body,
  );
}
