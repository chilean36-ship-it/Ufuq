/* Shared "locked section" card: a calm empty state with a lock badge, a one-line reason and clear actions.
   Used by the paywall (Billing) and by the Home panels that wait for a plan. */
const LOCK = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const CSS = `
.lc-wrap{ display:flex; justify-content:center; padding:28px 12px; }
.lc-card{ width:100%; max-width:460px; text-align:center; border:1px solid var(--line); border-radius:18px; padding:clamp(22px,6vw,32px) clamp(16px,5vw,26px); box-sizing:border-box; min-width:0;
  background:radial-gradient(120% 90% at 50% 0%, rgba(200,160,60,.10), transparent 60%), var(--bg-2);
  display:grid; justify-items:center; gap:12px; animation:lcIn .35s ease both; }
.lc-orb{ width:56px; height:56px; border-radius:50%; display:grid; place-items:center; color:var(--gold-bright);
  border:1px solid rgba(200,160,60,.35); background:rgba(200,160,60,.08); }
.lc-title{ font-family:'Fraunces',serif; font-size:19px; line-height:1.3; font-weight:600; color:var(--text); margin:0; max-width:100%; overflow-wrap:anywhere; }
.lc-title{ text-wrap:balance; }
.lc-sub{ color:var(--text-muted); font-size:13.5px; line-height:1.6; margin:0; max-width:380px; overflow-wrap:anywhere; text-wrap:pretty; }
.lc-actions{ display:flex; gap:10px; flex-wrap:wrap; justify-content:center; align-items:center; margin-top:6px; }
.lc-btn{ display:inline-flex; align-items:center; gap:8px; background:var(--gold); color:var(--bg); border:none; border-radius:10px;
  padding:11px 20px; font-weight:600; font-size:14px; cursor:pointer; font-family:inherit; transition:background .2s, transform .15s; }
.lc-btn:hover{ background:var(--gold-bright); transform:translateY(-1px); }
.lc-link{ background:none; border:none; color:var(--text-muted); font-size:13.5px; cursor:pointer; font-family:inherit;
  text-decoration:underline; text-underline-offset:3px; padding:8px; }
.lc-link:hover{ color:var(--text); }
.lc-btn:focus-visible, .lc-link:focus-visible{ outline:2px solid var(--gold); outline-offset:3px; }
/* embedded: lives inside a dashboard panel (which already has its own frame), so no second card — the message is centred in the free space */
.lc-wrap.lc-embedded{ flex:1 1 auto; align-items:center; padding:8px 0 4px; min-height:0; }
.lc-embedded .lc-card{ max-width:none; border:none; background:none; border-radius:0; padding:0 4px; gap:10px; animation:none; }
.lc-embedded .lc-orb{ width:46px; height:46px; }
.lc-embedded .lc-title{ font-size:16px; }
.lc-embedded .lc-sub{ font-size:13px; max-width:30ch; }
@keyframes lcIn{ from{ opacity:0; transform:translateY(6px);} to{ opacity:1; transform:none;} }
@media (prefers-reduced-motion:reduce){ .lc-card, .lc-btn{ animation:none; transition:none; } }
`;

export default function LockedCard({ icon, title, sub, actions, embedded = false, className = '' }) {
  return (
    <div className={'lc-wrap' + (embedded ? ' lc-embedded' : '') + (className ? ' ' + className : '')}>
      <style>{CSS}</style>
      <div className="lc-card" role="group" aria-label={title}>
        <div className="lc-orb">{icon || LOCK}</div>
        <h3 className="lc-title">{title}</h3>
        {sub && <p className="lc-sub">{sub}</p>}
        {actions && <div className="lc-actions">{actions}</div>}
      </div>
    </div>
  );
}
