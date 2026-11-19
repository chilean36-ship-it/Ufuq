// /app keeps its own identity from the very first paint: title, icons, colours — and the first-paint loader stays until the
// app's first screen (the dictionary) is on screen, so the website's loader / page never flashes there. Runs synchronously in <head>.
// Its own file (not inline) so the Content-Security-Policy keeps script-src 'self'.
(function () {
  if (!/^\/app(\/|$)/.test(location.pathname)) return;
  var d = document, h = d.documentElement;
  h.classList.add('cover');
  d.title = 'Ufuq';
  var meta = function (sel, attr, val) { var e = d.querySelector(sel); if (e) e.setAttribute(attr, val); };
  meta('meta[name="theme-color"]', 'content', '#121212');
  meta('meta[name="application-name"]', 'content', 'Ufuq');
  meta('meta[name="apple-mobile-web-app-title"]', 'content', 'Ufuq');
  meta('meta[property="og:title"]', 'content', 'Ufuq');
  meta('meta[property="og:site_name"]', 'content', 'Ufuq');
  meta('link[rel="apple-touch-icon"]', 'href', '/app/apple-touch-icon.png');
  var icons = d.querySelectorAll('link[rel="icon"]');
  for (var i = 0; i < icons.length; i++) { icons[i].setAttribute('href', '/app/icon-192.png'); icons[i].setAttribute('type', 'image/png'); icons[i].removeAttribute('sizes'); }
  var s = d.createElement('style');
  s.textContent = 'html.cover,html.cover body{background:#121212}html.cover .ufq-loader{display:none!important}';
  (d.head || h).appendChild(s);
})();
