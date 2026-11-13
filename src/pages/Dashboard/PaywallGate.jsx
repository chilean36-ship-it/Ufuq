import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';

/* "Subscription required" window shown in place of a section that needs a paid plan.
   Only what says "not paid" lives here: lock badge, status, title, one explanation, the way to pay (CTA → /checkout).
   Built from <div>s on purpose — dashboard.css has `.content section{padding:0}`, which wipes a one-class padding. */
const LOCK = (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7.5a4 4 0 018 0V11" /><circle cx="12" cy="16" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

const ARROW = (
  <svg className="pw-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
  </svg>
);

/* How long the window plays its exit before the checkout opens (skipped for reduced-motion users). */
const LEAVE_MS = 240;

const CSS = `
.pw-stage{ --pw-warn:#e0a93b; --pw-warn-rgb:224,169,59;
  display:flex; align-items:center; justify-content:center; width:100%;
  min-height:calc(100vh - 190px); min-height:calc(100dvh - 190px); padding:clamp(12px,4vw,32px); }

html[data-theme="light"] .pw-stage{ --pw-warn:#9a6a12; --pw-warn-rgb:184,134,60; }
/* soft ambient glow behind the window; blurred so it reads as depth, not as a shape */
.pw-stage{ position:relative; isolation:isolate; }
.pw-stage::before{ content:''; position:absolute; z-index:-1; left:50%; top:50%; width:min(560px,92%); height:min(420px,70%); transform:translate(-50%,-50%);
  background:radial-gradient(closest-side, rgba(var(--pw-warn-rgb),.16), transparent); filter:blur(28px); pointer-events:none; animation:pw-fade .5s ease both; }
.pw-dialog{ position:relative; overflow:hidden; width:100%; max-width:480px; margin:0 auto;
  padding:clamp(28px,6vw,44px) clamp(20px,6vw,40px) clamp(24px,5vw,36px);
  display:flex; flex-direction:column; align-items:center; text-align:center;
  background:radial-gradient(120% 70% at 50% 0%, rgba(var(--pw-warn-rgb),.12), transparent 62%), var(--bg-2);
  background:radial-gradient(120% 70% at 50% 0%, rgba(var(--pw-warn-rgb),.12), transparent 62%), color-mix(in srgb, var(--bg-2) 90%, transparent);
  -webkit-backdrop-filter:blur(14px) saturate(1.1); backdrop-filter:blur(14px) saturate(1.1);
  border:1px solid var(--line); border-radius:22px;
  box-shadow:0 1px 0 rgba(255,255,255,.04) inset, 0 24px 60px -24px rgba(0,0,0,.45); }
.pw-dialog::before{ content:''; position:absolute; inset:0 0 auto 0; height:3px;
  background:linear-gradient(90deg, transparent, var(--pw-warn), transparent); opacity:.85; }

/* lock badge: icon, soft halo, a thin ring */
.pw-orb{ position:relative; flex:none; width:76px; height:76px; margin-bottom:18px; border-radius:50%; display:grid; place-items:center;
  color:var(--pw-warn); background:rgba(var(--pw-warn-rgb),.12); border:1px solid rgba(var(--pw-warn-rgb),.4);
  box-shadow:0 0 0 8px rgba(var(--pw-warn-rgb),.07), 0 10px 28px -8px rgba(var(--pw-warn-rgb),.45); }

/* status pill */
.pw-status{ display:inline-flex; align-items:center; gap:8px; margin-bottom:14px; padding:5px 13px 5px 11px; border-radius:99px;
  font-size:11.5px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; line-height:1;
  color:var(--pw-warn); background:rgba(var(--pw-warn-rgb),.12); border:1px solid rgba(var(--pw-warn-rgb),.32); }
.pw-status::before{ content:''; width:7px; height:7px; border-radius:50%; background:currentColor; flex:none; }

.pw-title{ margin:0 0 10px; max-width:100%; font-family:'Fraunces',serif; font-weight:600; font-size:clamp(21px,5.4vw,26px);
  line-height:1.25; letter-spacing:-.01em; color:var(--text); overflow-wrap:anywhere; text-wrap:balance; }
.pw-sub{ margin:0; width:100%; max-width:390px; font-size:14.5px; line-height:1.65; color:var(--text-muted); overflow-wrap:anywhere; text-wrap:pretty; }

.pw-actions{ display:flex; flex-direction:column; align-items:stretch; gap:6px; width:100%; max-width:320px;
  margin-top:26px; padding-top:24px; border-top:1px solid var(--line); }
.pw-btn{ position:relative; overflow:hidden; isolation:isolate; display:flex; align-items:center; justify-content:center; gap:10px; width:100%; min-height:50px; padding:13px 22px; border:none; border-radius:12px;
  background:var(--gold); color:var(--bg); font-family:inherit; font-size:15px; font-weight:600; line-height:1.2; cursor:pointer; -webkit-tap-highlight-color:transparent;
  box-shadow:0 10px 24px -10px rgba(200,160,60,.6);
  transition:transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s ease, background-color .18s ease, opacity .18s ease; }
/* light sweep that crosses the button on hover / keyboard focus */
.pw-btn::after{ content:''; position:absolute; z-index:-1; inset:0; transform:translateX(-120%);
  background:linear-gradient(105deg, transparent 30%, rgba(255,255,255,.34) 50%, transparent 70%); transition:transform .6s ease; }
.pw-arrow{ flex:none; transition:transform .2s cubic-bezier(.2,.8,.2,1); }
html[dir="rtl"] .pw-arrow{ transform:scaleX(-1); }
.pw-btn:hover{ background:var(--gold-bright); transform:translateY(-1px); box-shadow:0 14px 28px -10px rgba(200,160,60,.7); }
.pw-btn:hover::after, .pw-btn:focus-visible::after{ transform:translateX(120%); }
.pw-btn:hover .pw-arrow{ transform:translateX(3px); }
html[dir="rtl"] .pw-btn:hover .pw-arrow{ transform:scaleX(-1) translateX(3px); }
.pw-btn:active{ transform:translateY(0) scale(.975); box-shadow:0 4px 12px -6px rgba(200,160,60,.6); transition-duration:.08s; }

/* loading: spinner instead of the arrow, button stays the same size and ignores further clicks */
.pw-spin{ flex:none; width:18px; height:18px; border-radius:50%; border:2.2px solid currentColor; border-inline-end-color:transparent; animation:pw-spin .7s linear infinite; }
@keyframes pw-spin{ to{ transform:rotate(360deg); } }
.pw-btn[aria-busy="true"]{ cursor:progress; pointer-events:none; background:var(--gold); transform:none; box-shadow:0 10px 24px -12px rgba(200,160,60,.5); }
.pw-btn[aria-busy="true"]::after{ display:none; }

.pw-link{ min-height:42px; padding:9px 12px; background:none; border:none; border-radius:8px; font-family:inherit; font-size:13.5px; font-weight:500;
  color:var(--text-muted); cursor:pointer; transition:color .15s ease, background-color .15s ease, opacity .15s ease; }
.pw-link:hover{ color:var(--text); background:rgba(127,127,127,.08); }
.pw-link:active{ background:rgba(127,127,127,.14); }
.pw-link:disabled{ opacity:.45; pointer-events:none; }
.pw-btn:focus-visible, .pw-link:focus-visible{ outline:2px solid var(--gold); outline-offset:3px; }

/* entrance: the window fades in and settles, then the lock badge pops once. Nothing else moves. */
@keyframes pw-fade{ from{ opacity:0; } to{ opacity:1; } }
@keyframes pw-rise{ from{ opacity:0; transform:translateY(14px) scale(.97); } to{ opacity:1; transform:none; } }
@keyframes pw-pop{ 0%{ transform:scale(.6); opacity:0; } 60%{ transform:scale(1.08); opacity:1; } 100%{ transform:scale(1); } }
.pw-dialog{ animation:pw-rise .42s cubic-bezier(.2,.8,.2,1) both; }
.pw-orb{ animation:pw-pop .5s cubic-bezier(.2,.8,.2,1) .14s both; }

/* the window gently steps back once the button is pressed, right before the checkout opens */
.pw-dialog{ transition:opacity .22s ease, transform .22s ease; }
.pw-dialog.pw-leaving{ animation:none; opacity:0; transform:translateY(8px) scale(.985); pointer-events:none; }

@media (max-width:480px){
  .pw-stage{ min-height:calc(100dvh - 150px); }
  .pw-dialog{ border-radius:18px; }
  .pw-orb{ width:66px; height:66px; margin-bottom:16px; }
  .pw-actions{ max-width:none; margin-top:22px; padding-top:20px; }
}
@media (max-width:360px){
  .pw-dialog{ padding-inline:16px; }
  .pw-title{ font-size:20px; }
  .pw-sub{ font-size:14px; }
}
@media (max-height:520px) and (orientation:landscape){
  .pw-stage{ min-height:0; padding-block:12px; }
  .pw-orb{ width:56px; height:56px; margin-bottom:12px; }
  .pw-actions{ margin-top:18px; padding-top:16px; }
}
@media (prefers-reduced-motion:reduce){
  .pw-btn, .pw-arrow, .pw-link, .pw-dialog{ transition:none; }
  .pw-btn::after{ display:none; }
  .pw-btn:hover, .pw-btn:active{ transform:none; }
  .pw-btn:hover .pw-arrow{ transform:none; }
  html[dir="rtl"] .pw-btn:hover .pw-arrow{ transform:scaleX(-1); }
  .pw-spin{ animation-duration:1.6s; }
  .pw-dialog.pw-leaving{ transform:none; }
  .pw-dialog, .pw-orb, .pw-stage::before{ animation:none; }
  .pw-dialog{ -webkit-backdrop-filter:none; backdrop-filter:none; }
}
`;

export default function PaywallGate({ onNavigate, variant }) {
  const { t } = useCabinetI18n();
  const { lockReason, attLock } = useDashboardData();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);
  const isGroup = variant === 'group';
  const byAttendance = lockReason === 'attendance';
  const title = byAttendance ? t('Access paused: too many missed lessons') : isGroup ? t('You are not subscribed') : t('Subscription required');
  const sub = byAttendance
    ? t('You missed {n} lessons this month, so the lesson sections are paused. Please talk to your teacher or the administrator — they can allow access again.').replace('{n}', String((attLock && attLock.absent) || 3))
    : isGroup
    ? t('Your group opens after you pay for a plan. Choose a plan to join your group, see the lessons and chat with your classmates.')
    : t('This section opens after you pay for a plan. You can still see your cabinet, your billing history and your profile.');

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // CTA: show the loading state, let the window step back, then open the checkout. A second click while busy does nothing.
  const goPay = () => {
    if (busy) return;
    setBusy(true);
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = window.setTimeout(() => navigate('/checkout'), calm ? 0 : LEAVE_MS);
  };

  return (
    <div className="pw-stage">
      <style>{CSS}</style>
      <div className={'pw-dialog' + (busy ? ' pw-leaving' : '')} role="alertdialog" aria-labelledby="pw-title" aria-describedby="pw-sub">
        <div className="pw-orb">{LOCK}</div>
        <span className="pw-status">{byAttendance ? t('Attendance limit reached') : t('Payment not made')}</span>
        <h2 className="pw-title" id="pw-title">{title}</h2>
        <p className="pw-sub" id="pw-sub">{sub}</p>
        {byAttendance ? (
          <div className="pw-actions">
            <button type="button" className="pw-btn" onClick={() => onNavigate('attendance')}><span>{t('See my attendance')}</span></button>
          </div>
        ) : (
          <div className="pw-actions">
            <button type="button" className="pw-btn" onClick={goPay} aria-busy={busy ? 'true' : 'false'} aria-disabled={busy ? 'true' : undefined}>
              {busy ? <span className="pw-spin" aria-hidden="true" /> : null}
              <span>{busy ? t('Opening checkout…') : t('Choose a plan')}</span>
              {busy ? null : ARROW}
            </button>
            <button type="button" className="pw-link" disabled={busy} onClick={() => onNavigate('billing')}>{t('Open Billing')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
