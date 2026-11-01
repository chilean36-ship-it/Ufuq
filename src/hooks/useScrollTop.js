import { useLayoutEffect } from 'react';

/**
 * The cabinet pages (dashboard / teacher / admin) switch sections with component state, not with a route,
 * so <ScrollManager/> never fires and the browser keeps the old scroll offset — the new section then opens
 * "in the middle". Call this with the value that identifies the current section and the window jumps back
 * to the top whenever it changes.
 *
 * `behavior: 'instant'` overrides the `html{scroll-behavior:smooth}` rule, otherwise the page would visibly
 * glide up instead of simply starting at the top like a fresh page.
 */
export default function useScrollTop(key) {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const main = document.querySelector('.main'); // on desktop the content column scrolls, not the window
    if (main) main.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [key]);
}

/**
 * Scroll ONE scrollable container so that `el` is visible, without ever moving the page itself.
 * (Element.scrollIntoView() also scrolls every ancestor — including the window — which is what threw the
 * page down to the middle.)
 */
export function scrollWithin(container, el, block = 'nearest') {
  if (!container || !el) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = r.top - c.top + container.scrollTop;
  if (block === 'start') container.scrollTop = top;
  else if (block === 'center') container.scrollTop = top - (container.clientHeight - el.offsetHeight) / 2;
  else if (r.top < c.top) container.scrollTop = top;
  else if (r.bottom > c.bottom) container.scrollTop = top - container.clientHeight + el.offsetHeight;
}
