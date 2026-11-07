import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/ui-behavior.css';
import './styles/ui-kit.css';
import './styles/ui-prefs.css';
import './styles/captcha.css';
import './styles/mobile-safety.css';
import { applyUiPrefs } from './lib/uiPrefs';
import { installLinkUrlHider } from './lib/hideLinkUrls';

// A new deploy changes the hashed chunk names; a tab/cache still pointing at the old ones would fail to load
// a chunk and stay blank. Reload once (guarded, so it can never loop) to pick up the fresh index.html.
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('ufuq-chunk-reload')) return;
    sessionStorage.setItem('ufuq-chunk-reload', '1');
  } catch (e) { /* ignore */ }
  window.location.reload();
});

// Edge's "Ask Edge to help write text" (Compose) button and other writing assistants are not wanted in our text fields.
// The standard `writingsuggestions` attribute is inherited from <html>; data-ms-editor covers Microsoft Editor.
// Fields that appear later (modals, chat box) are marked as they are added.
const QUIET_FIELDS = 'textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), [contenteditable]';
function quietWritingAssistants(el) {
  if (el.getAttribute('writingsuggestions') !== 'false') el.setAttribute('writingsuggestions', 'false');
  if (el.getAttribute('data-ms-editor') !== 'false') el.setAttribute('data-ms-editor', 'false');
}
try {
  document.documentElement.setAttribute('writingsuggestions', 'false');
  document.querySelectorAll(QUIET_FIELDS).forEach(quietWritingAssistants);
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches(QUIET_FIELDS)) quietWritingAssistants(n);
    if (n.querySelectorAll) n.querySelectorAll(QUIET_FIELDS).forEach(quietWritingAssistants);
  }))).observe(document.body, { childList: true, subtree: true });
} catch (e) { /* ignore */ }

try { applyUiPrefs(); } catch (e) { /* ignore */ }
try { installLinkUrlHider(); } catch (e) { console.warn('link hider:', e); } // no link addresses on mouse-hover anywhere on the site

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);

// Hide the first-paint loader once React has painted (the app's own loaders take over from here).
// requestAnimationFrame never fires in a background tab, so a timer removes the loader as a fallback.
const hideBoot = () => {
  const b = document.getElementById('boot');
  if (!b || b.classList.contains('out')) return;
  b.classList.add('out');
  setTimeout(() => b.remove(), 400);
};
requestAnimationFrame(() => requestAnimationFrame(hideBoot));
setTimeout(hideBoot, 1500);

// Offline rejim: sahifalar va (bir marta ochilgan) audio/rasmlarni keshlab,
// internet bo'lmaganda ham ishlashi uchun Service Worker (port of the
// registration that used to live in supabase-client.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker ro\'yxatdan o\'tmadi:', err);
    });
  });
}
