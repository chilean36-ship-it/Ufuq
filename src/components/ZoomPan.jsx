import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

/**
 * A picture you can zoom like a gallery app: two-finger pinch, double-tap (or double-click) to zoom in / out, drag to move
 * around when zoomed, mouse wheel, and `zoomBy()` for + / − buttons. When the picture is not zoomed a sideways swipe calls
 * `onSwipe(-1 | 1)` (previous / next photo). The picture can never be dragged off the screen.
 * The wrapper carries data-zoomable so the app's "no page zoom" lock lets these gestures through.
 */
const MAX_ZOOM = 6;

const ZoomPan = forwardRef(function ZoomPan({ src, alt = '', className = '', style, onSwipe, onZoomChange, onError, onTap }, ref) {
  const box = useRef(null);
  const img = useRef(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const pts = useRef(new Map());
  const g = useRef({ dist: 1, s: 1, mx: 0, my: 0, x: 0, y: 0, t: 0, moved: 0, lastTap: 0, sx: 0, sy: 0 });
  const zoomedRef = useRef(false);

  const apply = useCallback(() => {
    const el = img.current; const v = view.current;
    if (el) el.style.transform = 'translate3d(' + v.x + 'px,' + v.y + 'px,0) scale(' + v.s + ')';
    const z = v.s > 1.02;
    if (z !== zoomedRef.current) { zoomedRef.current = z; if (onZoomChange) onZoomChange(z); }
  }, [onZoomChange]);

  // the extra size created by zooming is the only room the picture may move in
  const clamp = useCallback(() => {
    const el = img.current; const v = view.current; const b = box.current;
    if (!el || !b) return;
    const w = el.offsetWidth * v.s; const h = el.offsetHeight * v.s;
    const mx = Math.max(0, (w - b.clientWidth) / 2); const my = Math.max(0, (h - b.clientHeight) / 2);
    v.x = Math.max(-mx, Math.min(mx, v.x)); v.y = Math.max(-my, Math.min(my, v.y));
    if (v.s <= 1) { v.x = 0; v.y = 0; }
  }, []);

  const zoomTo = useCallback((s, cx, cy) => {
    const v = view.current; const b = box.current;
    const ns = Math.max(1, Math.min(MAX_ZOOM, s));
    if (b && cx != null) {
      const r = b.getBoundingClientRect();
      const px = cx - (r.left + r.width / 2); const py = cy - (r.top + r.height / 2);
      v.x = px - (px - v.x) * (ns / v.s); v.y = py - (py - v.y) * (ns / v.s);
    }
    v.s = ns; clamp(); apply();
  }, [apply, clamp]);

  const reset = useCallback(() => { view.current = { s: 1, x: 0, y: 0 }; pts.current.clear(); apply(); }, [apply]);
  useEffect(() => { reset(); }, [src, reset]);
  useImperativeHandle(ref, () => ({ zoomBy: (f) => zoomTo(view.current.s * f), reset }), [zoomTo, reset]);

  // wheel needs a non-passive listener to be allowed to stop the page from zooming / scrolling
  useEffect(() => {
    const b = box.current;
    if (!b) return undefined;
    const onWheel = (e) => { e.preventDefault(); zoomTo(view.current.s * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY); };
    b.addEventListener('wheel', onWheel, { passive: false });
    return () => b.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  const down = (e) => {
    if (e.target.closest && e.target.closest('button, a, input')) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const G = g.current; const v = view.current;
    if (pts.current.size === 2) {
      const [p, q] = [...pts.current.values()];
      G.dist = Math.hypot(p.x - q.x, p.y - q.y) || 1; G.s = v.s; G.mx = (p.x + q.x) / 2; G.my = (p.y + q.y) / 2; G.x = v.x; G.y = v.y;
    } else { G.sx = e.clientX; G.sy = e.clientY; G.t = Date.now(); G.moved = 0; }
  };
  const move = (e) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const G = g.current; const v = view.current;
    if (pts.current.size >= 2) {
      const [p, q] = [...pts.current.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      const mx = (p.x + q.x) / 2; const my = (p.y + q.y) / 2;
      const ns = Math.max(1, Math.min(MAX_ZOOM, G.s * (d / G.dist)));
      const r = box.current.getBoundingClientRect();
      const px = G.mx - (r.left + r.width / 2); const py = G.my - (r.top + r.height / 2);
      v.s = ns; v.x = G.x + (mx - G.mx) + (px - G.x) * (1 - ns / G.s); v.y = G.y + (my - G.my) + (py - G.y) * (1 - ns / G.s);
      G.moved += 20; clamp(); apply();
    } else {
      const dx = e.clientX - prev.x; const dy = e.clientY - prev.y;
      G.moved += Math.abs(dx) + Math.abs(dy);
      if (v.s > 1.02) { v.x += dx; v.y += dy; clamp(); apply(); }
    }
  };
  const up = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.delete(e.pointerId);
    if (pts.current.size > 0) return;
    const G = g.current; const v = view.current;
    const dt = Date.now() - G.t; const dx = e.clientX - G.sx; const dy = e.clientY - G.sy;
    if (G.moved < 10 && dt < 320) {                                  // a tap
      const now = Date.now();
      if (now - G.lastTap < 320) { zoomTo(v.s > 1.02 ? 1 : 2.6, e.clientX, e.clientY); G.lastTap = 0; } else { G.lastTap = now; if (onTap) onTap(); }
    } else if (v.s <= 1.02 && onSwipe && Math.abs(dx) > 70 && Math.abs(dy) < 60 && dt < 700) {
      onSwipe(dx < 0 ? 1 : -1);                                       // swipe left = next, right = previous
    }
  };

  return (
    <div ref={box} data-zoomable="1" className={'zp ' + className}
         style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(style || {}) }}
         onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={(e) => { pts.current.delete(e.pointerId); }}>
      <img ref={img} src={src} alt={alt} draggable="false" onError={onError}
           style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transformOrigin: 'center center', willChange: 'transform', WebkitUserDrag: 'none', borderRadius: 6 }} />
    </div>
  );
});

export default ZoomPan;
