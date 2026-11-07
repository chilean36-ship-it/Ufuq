// If the app bundle fails before React mounts (old cached files, blocked script...), show a message instead of a blank page.
// Lives in its own file (not inline in index.html) so the Content-Security-Policy can use script-src 'self' without 'unsafe-inline'.
window.addEventListener('error', function (e) { window.__ufuqBootError = e && e.message; });
setTimeout(function () {
  var r = document.getElementById('root');
  // React painted but the loader is still there: main.jsx removes it in requestAnimationFrame, which does not run
  // while the tab is in the background. The app is fine, so just drop the loader instead of replacing the page.
  if (r && r.firstChild && document.getElementById('boot')) { document.getElementById('boot').remove(); return; }
  if (r && !r.firstChild) {
    var b = document.getElementById('boot'); if (b) b.remove();
    r.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;background:#121212;color:#EDEAE3;font-family:system-ui,sans-serif;text-align:center"><div><p style="margin:0 0 14px">Sayt yuklanmadi / The site did not load.<br><small id="boot-err" style="color:#A8A29B"></small></p><button id="boot-reload" style="padding:12px 22px;border:0;border-radius:9px;background:#C9A24B;color:#121212;font-weight:600;cursor:pointer">Reload / Qayta yuklash</button></div></div>';
    // textContent (not string concatenation) so an error message can never be parsed as HTML
    document.getElementById('boot-err').textContent = window.__ufuqBootError || '';
    document.getElementById('boot-reload').addEventListener('click', async function () {
      try {
        var g = await navigator.serviceWorker.getRegistrations();
        await Promise.all(g.map(function (x) { return x.unregister(); }));
        var k = await caches.keys();
        await Promise.all(k.map(function (x) { return caches.delete(x); }));
      } catch (e) {}
      location.reload();
    });
  }
}, 8000);
