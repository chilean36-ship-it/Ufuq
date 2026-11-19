/**
 * "Grows out of a point and takes the whole screen" transitions, drawn by plain DOM nodes on <body> so they survive the
 * React tree changing underneath them (the dictionary cover unmounting, the app mounting).
 *  - revealCover(x, y, onCovered): a gold disc grows from (x, y) over the screen, `onCovered` runs once the screen is full
 *    (mount the next thing there), then the disc fades away to show it.
 *  - rippleFrom(x, y): a thin gold ring that races outwards, played together with the AI panel's own circular reveal.
 */
const STYLE_ID = 'ua-reveal-style';
const CSS = `
.ua-rv-cover{position:fixed;inset:0;z-index:2147483000;background:radial-gradient(120% 120% at var(--x) var(--y),#F3D77E 0%,#D4AE57 38%,#B98B3E 100%);clip-path:circle(0px at var(--x) var(--y));transition:clip-path .62s cubic-bezier(.65,0,.25,1),opacity .6s ease;pointer-events:all;overflow:hidden}
.ua-rv-cover.grow{clip-path:circle(160vmax at var(--x) var(--y))}
.ua-rv-cover.fade{opacity:0;pointer-events:none}
.ua-rv-logo{position:absolute;left:50%;top:50%;width:104px;height:104px;margin:-52px 0 0 -52px;background:#1a1405;-webkit-mask:url(/assets/images/logo-mark.png) center/contain no-repeat;mask:url(/assets/images/logo-mark.png) center/contain no-repeat;opacity:0;transform:scale(.55);transition:opacity .35s ease .3s,transform .5s cubic-bezier(.3,1.5,.5,1) .3s}
.ua-rv-cover.grow .ua-rv-logo{opacity:1;transform:none}
.ua-rv-cover.fade .ua-rv-logo{transform:scale(1.7);opacity:0;transition:transform .6s cubic-bezier(.4,0,.2,1),opacity .45s ease}
.ua-rv-ring{position:fixed;z-index:2147482999;left:var(--x);top:var(--y);width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:3px solid rgba(243,215,126,.95);box-shadow:0 0 34px rgba(243,215,126,.7),inset 0 0 22px rgba(243,215,126,.45);pointer-events:none;transform:scale(.2);opacity:.95;animation:uaRvRing .7s cubic-bezier(.5,0,.2,1) forwards}
@keyframes uaRvRing{to{transform:scale(var(--k,40));opacity:0}}
@media (prefers-reduced-motion:reduce){.ua-rv-cover{transition:opacity .3s ease;clip-path:none}.ua-rv-ring{display:none}}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID; s.textContent = CSS;
  document.head.appendChild(s);
}

export function revealCover(x, y, onCovered) {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'ua-rv-cover';
  el.style.setProperty('--x', x + 'px'); el.style.setProperty('--y', y + 'px');
  el.innerHTML = '<span class="ua-rv-logo"></span>';
  document.body.appendChild(el);
  // two frames so the browser registers the collapsed state before it grows
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('grow')));
  setTimeout(() => { try { if (onCovered) onCovered(); } catch (e) { /* ignore */ } }, 640);
  setTimeout(() => el.classList.add('fade'), 1150);
  setTimeout(() => el.remove(), 1850);
}

export function rippleFrom(x, y) {
  ensureStyle();
  const r = document.createElement('div');
  r.className = 'ua-rv-ring';
  const k = Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) / 28) + 4;
  r.style.setProperty('--x', x + 'px'); r.style.setProperty('--y', y + 'px'); r.style.setProperty('--k', String(k));
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 800);
}

/** Centre of an element, for use as an origin. */
export function centerOf(el) {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight - 70 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
