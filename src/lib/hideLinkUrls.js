/**
 * Keeps link URLs out of the browser's hover tooltip / status bar everywhere on the site.
 *
 * The browser shows an anchor's address whenever it has an `href`. This moves every href into
 * `data-href` (also for anchors React renders later) and performs the navigation itself on click,
 * so links still work, but nothing is shown on hover.
 *  - `href="#"` anchors are just buttons (their own onClick does the work): nothing to navigate.
 *  - target="_blank" opens a new tab; Ctrl/Cmd/Shift-click opens a new tab too.
 *  - Enter on a focused link activates it (anchors without href are not keyboard-activatable by default).
 */
export function installLinkUrlHider() {
  if (typeof window === 'undefined' || window.__ufuqLinkUrlHider) return;
  window.__ufuqLinkUrlHider = true;

  const style = document.createElement('style');
  style.textContent = 'a[data-href]{cursor:pointer;-webkit-user-drag:none;}';
  document.head.appendChild(style);

  const strip = (a) => {
    const href = a.getAttribute('href');
    if (href == null) return;
    a.setAttribute('data-href', href);
    a.removeAttribute('href');
    if (href !== '#') {
      if (!a.hasAttribute('role')) a.setAttribute('role', 'link');
      if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
    }
  };
  const scan = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'A') strip(node);
    node.querySelectorAll('a[href]').forEach(strip);
  };

  scan(document.documentElement);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') { if (m.target.tagName === 'A') strip(m.target); }
      else m.addedNodes.forEach(scan);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });

  const go = (a, newTab) => {
    const href = a.getAttribute('data-href');
    if (!href || href === '#') return;
    if (newTab || a.getAttribute('target') === '_blank') { window.open(href, '_blank', 'noopener,noreferrer'); return; }
    if (href.charAt(0) === '#') { window.location.hash = href; return; }
    window.location.assign(href);
  };

  document.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    const a = e.target.closest && e.target.closest('a[data-href]');
    if (!a) return;
    // let the page's own onClick handlers run first (they may preventDefault to cancel navigation)
    setTimeout(() => { if (!e.defaultPrevented) go(a, e.ctrlKey || e.metaKey || e.shiftKey); }, 0);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const a = e.target.closest && e.target.closest('a[data-href]');
    if (a && a.getAttribute('role') === 'link') { e.preventDefault(); a.click(); }
  });
}
