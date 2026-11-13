import { useEffect } from 'react';

/*
 * Telegram-like behaviour for the group chat inside the app (the chat component itself is unchanged):
 *  - the message list stays glued to the newest message when the keyboard opens or the composer grows;
 *  - long-press a message = its menu (reply, copy, react …); swipe a message to the right = reply;
 *  - tapping the text box scrolls to the latest message once the keyboard is up.
 * It only drives the chat's own handlers (a context-menu / double-click event on the message), so every rule of the chat
 * (who may edit, delete, pin) stays exactly as it is.
 */
const buzz = (ms) => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) { /* ignore */ } };
const nearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 140;

export default function useChatEnhance(active) {
  useEffect(() => {
    if (!active) return undefined;
    let body = null;
    let ro = null;
    let detach = [];
    let wasNear = true;

    const attach = () => {
      body = document.getElementById('groupChatBody');
      if (!body) return false;

      const toBottom = () => { body.scrollTop = body.scrollHeight; };

      // 1) keep the bottom anchored whenever the list is resized (keyboard, composer, reply bar)
      const onScroll = () => { wasNear = nearBottom(body); };
      body.addEventListener('scroll', onScroll, { passive: true });
      detach.push(() => body.removeEventListener('scroll', onScroll));
      if (window.ResizeObserver) {
        ro = new ResizeObserver(() => { if (wasNear) toBottom(); });
        ro.observe(body);
      }
      const input = document.getElementById('groupChatInput');
      const onFocus = () => { setTimeout(() => { if (wasNear) toBottom(); }, 280); };
      if (input) { input.addEventListener('focus', onFocus); detach.push(() => input.removeEventListener('focus', onFocus)); }

      // 2) long press -> menu, swipe right -> reply
      let timer = 0; let row = null; let sx = 0; let sy = 0; let dx = 0; let swiping = false; let moved = false;
      const reset = () => {
        clearTimeout(timer);
        if (row) { row.style.transition = 'transform .2s cubic-bezier(.2,.9,.2,1)'; row.style.transform = ''; row.classList.remove('ua-swipe'); }
        row = null; swiping = false; moved = false; dx = 0;
      };
      const onStart = (e) => {
        if (e.touches.length !== 1) { reset(); return; }
        const r = e.target.closest && e.target.closest('.gc-msg-row');
        if (!r || (e.target.closest && e.target.closest('a, button, audio, video, input, textarea'))) { row = null; return; }
        row = r; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; swiping = false; moved = false;
        row.style.transition = 'none';
        timer = setTimeout(() => {
          if (!row || moved) return;
          buzz(14);
          const target = row.querySelector('.gc-msg-bubble') || row;
          target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
          row = null;
        }, 430);
      };
      const onMove = (e) => {
        if (!row) return;
        const t = e.touches[0];
        const mx = t.clientX - sx; const my = t.clientY - sy;
        if (!swiping && (Math.abs(mx) > 9 || Math.abs(my) > 9)) { moved = true; clearTimeout(timer); }
        if (!swiping && mx > 14 && Math.abs(my) < Math.abs(mx) * 0.6) swiping = true;
        if (swiping) {
          dx = Math.max(0, Math.min(mx, 84));
          row.style.transform = 'translateX(' + dx + 'px)';
          row.classList.add('ua-swipe');
          row.style.setProperty('--sw', String(Math.min(1, dx / 64)));
        }
      };
      const onEnd = () => {
        const fire = swiping && dx >= 60 && row;
        const target = row && row.querySelector('.gc-msg-bubble-wrap');
        reset();
        if (fire && target) { buzz(10); target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })); }
      };
      body.addEventListener('touchstart', onStart, { passive: true });
      body.addEventListener('touchmove', onMove, { passive: true });
      body.addEventListener('touchend', onEnd, { passive: true });
      body.addEventListener('touchcancel', reset, { passive: true });
      detach.push(() => {
        body.removeEventListener('touchstart', onStart); body.removeEventListener('touchmove', onMove);
        body.removeEventListener('touchend', onEnd); body.removeEventListener('touchcancel', reset); clearTimeout(timer);
      });
      return true;
    };

    // the chat mounts a moment after the flag flips
    let tries = 0;
    const iv = setInterval(() => { if (attach() || ++tries > 50) clearInterval(iv); }, 100);
    return () => { clearInterval(iv); if (ro) ro.disconnect(); detach.forEach((f) => f()); detach = []; };
  }, [active]);
}
