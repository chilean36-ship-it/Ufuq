// /app presents itself as a plain "Dictionary" from the very first paint: title, icons, colours and the loader that shows
// before React mounts (the website's gold Ufuq loader must never flash there). Runs synchronously in <head>.
// Its own file (not inline) so the Content-Security-Policy keeps script-src 'self'.
(function () {
  if (!/^\/app(\/|$)/.test(location.pathname)) return;
  var d = document, h = d.documentElement;
  h.classList.add('cover');
  d.title = 'Dictionary';
  var meta = function (sel, attr, val) { var e = d.querySelector(sel); if (e) e.setAttribute(attr, val); };
  meta('meta[name="theme-color"]', 'content', '#121212');
  meta('meta[name="application-name"]', 'content', 'Dictionary');
  meta('meta[name="apple-mobile-web-app-title"]', 'content', 'Dictionary');
  meta('meta[property="og:title"]', 'content', 'Dictionary');
  meta('meta[property="og:site_name"]', 'content', 'Dictionary');
  meta('link[rel="apple-touch-icon"]', 'href', '/app/apple-touch-icon.png');
  var icons = d.querySelectorAll('link[rel="icon"]');
  for (var i = 0; i < icons.length; i++) { icons[i].setAttribute('href', '/app/icon-192.png'); icons[i].setAttribute('type', 'image/png'); icons[i].removeAttribute('sizes'); }
  var s = d.createElement('style');
  s.textContent =
    'html.cover,html.cover body{background:#121212}' +
    'html.cover #boot{background:#121212;flex-direction:column;gap:18px;transition:opacity .25s}' +
    'html.cover #boot .s{display:none}' +
    'html.cover #boot::before{content:"Aa";width:84px;height:84px;border-radius:26px;display:grid;place-items:center;font:800 36px/1 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;background:linear-gradient(145deg,#3b7bf6,#2457d6);box-shadow:0 18px 38px -16px #2457d6;animation:cvp 1.4s ease-in-out infinite}' +
    'html.cover #boot::after{content:"Dictionary";font:700 20px/1 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e8eefb;letter-spacing:-.2px}' +
    '@keyframes cvp{0%,100%{transform:scale(.96)}50%{transform:scale(1.04)}}' +
    '@media (prefers-reduced-motion:reduce){html.cover #boot::before{animation:none}}' +
    'html.cover .ufq-loader{display:none!important}';
  (d.head || h).appendChild(s);
})();
