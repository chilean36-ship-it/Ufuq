import { Component } from 'react';

/**
 * Root error boundary: a render crash used to unmount the whole tree and leave a blank white page.
 * Now the visitor sees a readable message (with the technical reason) and a button that clears the
 * service-worker/browser caches and reloads — the usual cure after a new deploy.
 */
async function hardReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) { /* ignore */ }
  window.location.reload();
}

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[Ufuq] render error:', error, info && info.componentStack); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#121212', color: '#EDEAE3', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>Something went wrong / Xatolik yuz berdi</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#A8A29B', margin: '0 0 16px' }}>
            Sahifani yangilang. / Please reload the page.
          </p>
          <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, padding: 10, borderRadius: 8, background: 'rgba(255,255,255,.06)', color: '#D98B78', margin: '0 0 16px' }}>
            {String((error && error.message) || error)}
          </pre>
          <button type="button" onClick={hardReload}
            style={{ padding: '12px 22px', fontSize: 15, fontWeight: 600, border: 0, borderRadius: 9, cursor: 'pointer', background: '#C9A24B', color: '#121212' }}>
            Reload / Qayta yuklash
          </button>
        </div>
      </div>
    );
  }
}
