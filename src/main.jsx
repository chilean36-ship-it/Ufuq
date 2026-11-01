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
requestAnimationFrame(() => requestAnimationFrame(() => {
  const b = document.getElementById('boot');
  if (!b) return;
  b.classList.add('out');
  setTimeout(() => b.remove(), 400);
}));

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
