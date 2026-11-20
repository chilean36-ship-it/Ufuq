import PageStyle from './PageStyle';

/** The "what's new" card shown to students on opening the app. Presentational only: the app wraps it in a sheet, the admin panel shows it as a live preview. */
export const POPUP_CSS = `
.pc{width:100%;max-width:420px;margin:0 auto;padding:12px 12px 14px;border-radius:30px;background:var(--bg-2,#141211);color:var(--text,#eeeae3);border:1px solid var(--line,rgba(237,234,227,.1));box-shadow:0 30px 70px -20px rgba(0,0,0,.8);font-family:'Inter',system-ui,sans-serif;box-sizing:border-box}
.pc *{box-sizing:border-box}
.pc-img{position:relative;border-radius:22px;overflow:hidden;background:linear-gradient(135deg,rgba(201,162,75,.28),rgba(120,90,230,.2));aspect-ratio:16/10;display:grid;place-items:center}
.pc-img img{width:100%;height:100%;object-fit:cover;display:block;animation:pcZoom 1.1s cubic-bezier(.2,.8,.2,1) both}
@keyframes pcZoom{from{transform:scale(1.14);opacity:.2}}
.pc-img-ph{font-size:13px;color:var(--text-muted,#a8a29b)}
.pc-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:0;display:grid;place-items:center;background:rgba(20,20,20,.55);color:#fff;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:transform .2s cubic-bezier(.3,1.7,.5,1)}
.pc-x:active{transform:scale(.85)}
.pc-body{padding:18px 10px 4px;text-align:center}
.pc-title{margin:0 0 10px;font:700 24px/1.2 'Fraunces',serif;letter-spacing:-.005em;animation:pcUp .5s .15s cubic-bezier(.2,.8,.2,1) both}
.pc-text{margin:0;font-size:15.5px;line-height:1.55;color:var(--text-muted,#a8a29b);white-space:pre-wrap;animation:pcUp .5s .25s cubic-bezier(.2,.8,.2,1) both}
@keyframes pcUp{from{opacity:0;transform:translateY(12px)}}
.pc-cta{position:relative;overflow:hidden;display:block;width:calc(100% - 20px);margin:20px 10px 4px;height:54px;border:0;border-radius:99px;font:800 17px 'Inter',sans-serif;color:#1a1405;cursor:pointer;background:linear-gradient(135deg,#F3D77E,#C9A24B 60%,#B98B3E);box-shadow:0 14px 28px -12px rgba(201,162,75,.9);animation:pcUp .5s .35s cubic-bezier(.2,.8,.2,1) both;transition:transform .2s cubic-bezier(.3,1.7,.5,1)}
.pc-cta:active{transform:scale(.96)}
.pc-cta::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.45) 50%,transparent 65%);background-size:250% 100%;animation:pcSheen 3.6s ease-in-out 1s infinite;pointer-events:none}
@keyframes pcSheen{0%{background-position:150% 0}55%,100%{background-position:-60% 0}}
@media (prefers-reduced-motion:reduce){.pc *{animation:none!important}}
`;

const isVideoUrl = (u) => /\.(mp4|webm|mov)(\?|#|$)/i.test(String(u || ''));

export default function PopupCard({ imageUrl, title, body, ctaLabel, onCta, onClose, placeholder }) {
  return (
    <div className="pc">
      <PageStyle css={POPUP_CSS} />
      <div className="pc-img">
        {imageUrl ? (isVideoUrl(imageUrl) ? <video src={imageUrl} autoPlay muted loop playsInline controls={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <img src={imageUrl} alt="" />) : <span className="pc-img-ph">{placeholder || ''}</span>}
        {onClose && (
          <button type="button" className="pc-x" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>
      <div className="pc-body">
        <h3 className="pc-title" dir="auto">{title}</h3>
        {body ? <p className="pc-text" dir="auto">{body}</p> : null}
      </div>
      {ctaLabel ? <button type="button" className="pc-cta" onClick={onCta}>{ctaLabel}</button> : null}
    </div>
  );
}
