/**
 * Reference-counted page scroll lock for modals / full-screen overlays.
 *
 * On desktop the page does not scroll — the `.main` column does — so `body{overflow:hidden}` alone leaves the
 * content behind a modal scrollable. This locks BOTH, and pads the vanishing scrollbar's width so the layout
 * does not jump sideways when the lock turns on/off. Several overlays can be open at once (e.g. a modal on top
 * of the AI chat): the page unlocks only when the last one closes.
 */
let count = 0;
let saved = null;

function targets() {
  const main = document.querySelector('.main');
  return { body: document.body, main };
}

export function lockScroll() {
  count += 1;
  if (count > 1) return;
  const { body, main } = targets();
  saved = {
    bodyOverflow: body.style.overflow,
    bodyPad: body.style.paddingRight,
    main,
    mainOverflow: main ? main.style.overflowY : '',
    mainPad: main ? main.style.paddingRight : '',
  };
  const winBar = window.innerWidth - document.documentElement.clientWidth;
  if (winBar > 0) body.style.paddingRight = winBar + 'px';
  body.style.overflow = 'hidden';
  if (main) {
    const mainBar = main.offsetWidth - main.clientWidth;
    if (mainBar > 0) main.style.paddingRight = mainBar + 'px';
    main.style.overflowY = 'hidden';
  }
}

export function unlockScroll() {
  if (count === 0) return;
  count -= 1;
  if (count > 0 || !saved) return;
  const { body } = targets();
  body.style.overflow = saved.bodyOverflow;
  body.style.paddingRight = saved.bodyPad;
  if (saved.main && document.contains(saved.main)) {
    saved.main.style.overflowY = saved.mainOverflow;
    saved.main.style.paddingRight = saved.mainPad;
  }
  saved = null;
}
