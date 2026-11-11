/* Payments page styles (presentation only) */
export const PAY_CSS = `
#page-payments .pay-head{ display:flex; align-items:center; gap:16px; margin-bottom:22px; }
#page-payments .pay-head-icon{ flex:none; width:46px; height:46px; border-radius:12px; display:grid; place-items:center; color:var(--gold-bright); background:var(--gold-dim); border:1px solid rgba(201,162,75,.3); }
#page-payments .pay-head-icon svg{ width:22px; height:22px; }
#page-payments .pay-head-text{ min-width:0; }
#page-payments .pay-head h2{ margin:0; font-size:24px; line-height:1.2; letter-spacing:-.01em; }
#page-payments .pay-head p{ margin:5px 0 0; font-size:14px; line-height:1.5; color:var(--text-muted); }

#page-payments .pay-tabs{ display:inline-flex; gap:4px; padding:4px; margin-bottom:22px; max-width:100%; overflow-x:auto; background:var(--bg-2); border:1px solid var(--line); border-radius:12px; }
#page-payments .pay-tab{ flex:none; min-height:36px; padding:8px 18px; border:none; border-radius:9px; background:transparent; color:var(--text-muted); font-family:inherit; font-size:13.5px; font-weight:600; line-height:1; cursor:pointer; transition:background-color .18s ease, color .18s ease, box-shadow .18s ease; }
#page-payments .pay-tab:hover{ color:var(--text); background:rgba(127,127,127,.08); }
#page-payments .pay-tab.is-active{ color:var(--bg); background:var(--gold); box-shadow:0 6px 16px -8px rgba(200,160,60,.7); }
#page-payments .pay-tab:focus-visible{ outline:2px solid var(--gold); outline-offset:2px; }

#page-payments .pay-metrics{ display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap:16px; margin-bottom:22px; }
#page-payments .pay-metric{ position:relative; overflow:hidden; display:flex; align-items:flex-start; gap:14px; padding:18px 18px 16px; background:var(--bg-2); border:1px solid var(--line); border-radius:14px; transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
#page-payments .pay-metric:hover{ transform:translateY(-2px); border-color:rgba(var(--m-rgb),.45); box-shadow:0 14px 30px -18px rgba(0,0,0,.5); }
#page-payments .pay-metric::before{ content:''; position:absolute; inset:0 0 auto 0; height:3px; background:linear-gradient(90deg, transparent, rgb(var(--m-rgb)), transparent); opacity:.8; }
#page-payments .pay-metric-ic{ flex:none; width:40px; height:40px; border-radius:11px; display:grid; place-items:center; color:rgb(var(--m-rgb)); background:rgba(var(--m-rgb),.13); border:1px solid rgba(var(--m-rgb),.3); }
#page-payments .pay-metric-ic svg{ width:19px; height:19px; }
#page-payments .pay-metric-body{ min-width:0; flex:1; }
#page-payments .pay-metric-lbl{ font-size:12px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--text-muted); line-height:1.3; }
#page-payments .pay-metric-val{ margin-top:6px; font-family:'Fraunces',serif; font-size:clamp(22px,3.4vw,27px); font-weight:600; line-height:1.15; color:var(--text); overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
#page-payments .pay-metric-sub{ margin-top:5px; font-size:12.5px; line-height:1.4; color:var(--text-muted); }
#page-payments .pay-metric.gold{ --m-rgb:201,162,75; }
#page-payments .pay-metric.warn{ --m-rgb:224,169,59; }
#page-payments .pay-metric.ok{ --m-rgb:80,176,120; }
#page-payments .pay-metric.bad{ --m-rgb:217,120,104; }
html[data-theme="light"] #page-payments .pay-metric.gold{ --m-rgb:160,118,38; }
html[data-theme="light"] #page-payments .pay-metric.warn{ --m-rgb:176,124,20; }
html[data-theme="light"] #page-payments .pay-metric.ok{ --m-rgb:36,128,76; }
html[data-theme="light"] #page-payments .pay-metric.bad{ --m-rgb:186,78,62; }
#page-payments .pay-metric-skel{ display:inline-block; width:64px; height:24px; border-radius:6px; background:rgba(127,127,127,.16); }

@media (max-width:640px){
  #page-payments .pay-head{ gap:12px; margin-bottom:18px; }
  #page-payments .pay-head-icon{ width:40px; height:40px; border-radius:10px; }
  #page-payments .pay-head h2{ font-size:21px; }
  #page-payments .pay-tabs{ display:flex; width:100%; }
  #page-payments .pay-tab{ flex:1 1 0; padding-inline:12px; }
  #page-payments .pay-metrics{ grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
  #page-payments .pay-metric{ flex-direction:column; gap:10px; padding:14px; }
}
@media (max-width:360px){ #page-payments .pay-metrics{ grid-template-columns:1fr; } }
@media (prefers-reduced-motion:reduce){ #page-payments .pay-tab, #page-payments .pay-metric{ transition:none; } #page-payments .pay-metric:hover{ transform:none; } }
/* Orders — filter bar, themed search, table, status pills */
#page-payments .pay-filters{ padding:18px; }
#page-payments .pay-filters-grid{ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; margin-bottom:14px; }
#page-payments .pay-filters-grid .field{ margin-bottom:0; }
#page-payments .pay-filters .field label{ font-size:11.5px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; }
#page-payments .pay-search{ position:relative; display:flex; align-items:center; width:100%; }
#page-payments .pay-search-ic{ position:absolute; left:14px; width:17px; height:17px; color:var(--text-muted); pointer-events:none; transition:color .18s ease; }
#page-payments .pay-search input[type=search]{ -webkit-appearance:none; appearance:none; width:100%; min-height:44px; padding:11px 42px 11px 42px; background:var(--bg-3); border:1px solid var(--line); border-radius:10px; color:var(--text); font-family:inherit; font-size:14.5px; line-height:1.3; color-scheme:dark; transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease; }
html[data-theme="light"] #page-payments .pay-search input[type=search]{ color-scheme:light; }
#page-payments .pay-search input[type=search]::placeholder{ color:var(--text-muted); opacity:.85; }
#page-payments .pay-search input[type=search]::-webkit-search-cancel-button,
#page-payments .pay-search input[type=search]::-webkit-search-decoration{ -webkit-appearance:none; display:none; }
#page-payments .pay-search input[type=search]:hover{ border-color:rgba(201,162,75,.35); }
#page-payments .pay-search input[type=search]:focus{ outline:none; border-color:var(--gold); background:var(--bg-2); box-shadow:0 0 0 3px var(--gold-dim); }
#page-payments .pay-search:focus-within .pay-search-ic{ color:var(--gold-bright); }
#page-payments .pay-search-clear{ position:absolute; right:8px; width:28px; height:28px; display:grid; place-items:center; border:none; border-radius:8px; background:transparent; color:var(--text-muted); cursor:pointer; transition:background-color .15s ease, color .15s ease; }
#page-payments .pay-search-clear:hover{ background:var(--gold-dim); color:var(--gold-bright); }
#page-payments .pay-search-clear svg{ width:14px; height:14px; }
#page-payments .pay-filters select, #page-payments .pay-filters input[type=date]{ min-height:42px; border-radius:10px; transition:border-color .18s ease, box-shadow .18s ease; }
#page-payments .pay-filters select:focus, #page-payments .pay-filters input[type=date]:focus{ border-color:var(--gold); box-shadow:0 0 0 3px var(--gold-dim); }
html[data-theme="dark"] #page-payments .pay-filters input[type=date], html:not([data-theme]) #page-payments .pay-filters input[type=date]{ color-scheme:dark; }
#page-payments .pay-filters-foot{ display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-top:14px; padding-top:14px; border-top:1px solid var(--line); }
#page-payments .pay-filters-foot .hint{ margin:0; font-size:13px; }
#page-payments .pay-filters-foot .hint b{ color:var(--gold-bright); font-variant-numeric:tabular-nums; }
#page-payments .pay-filters-actions{ display:flex; gap:8px; align-items:center; }

#page-payments .pay-table-wrap{ padding:0; overflow-x:auto; border-radius:14px; }
#page-payments .pay-table{ width:100%; border-collapse:separate; border-spacing:0; min-width:760px; }
#page-payments .pay-table thead th{ position:sticky; top:0; padding:13px 16px; text-align:left; font-size:11.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-muted); background:var(--bg-3); border-bottom:1px solid var(--line); white-space:nowrap; }
#page-payments .pay-table tbody td{ padding:14px 16px; vertical-align:middle; font-size:14px; border-bottom:1px solid var(--line); transition:background-color .15s ease; }
#page-payments .pay-table tbody tr:last-child td{ border-bottom:none; }
#page-payments .pay-table tbody tr:hover td{ background:rgba(201,162,75,.06); }
#page-payments .pay-table .hint{ margin-top:3px; }
#page-payments .pay-table .pay-buyer b{ font-weight:600; }
#page-payments .pay-table .pay-amt{ font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; }
#page-payments .pay-table .pay-refund{ color:#D97868; font-weight:500; }
html[data-theme="light"] #page-payments .pay-table .pay-refund{ color:#BA4E3E; }
#page-payments .pay-plan{ display:inline-block; padding:3px 9px; border-radius:7px; font-size:12.5px; font-weight:600; background:var(--bg-3); border:1px solid var(--line); }
#page-payments .pay-actions{ text-align:right; white-space:nowrap; }
#page-payments .pay-actions .btn + .btn{ margin-left:6px; }

#page-payments .pay-pill{ display:inline-flex; align-items:center; gap:7px; padding:4px 11px; border-radius:999px; font-size:12px; font-weight:600; white-space:nowrap; --p-rgb:201,162,75; color:rgb(var(--p-rgb)); background:rgba(var(--p-rgb),.13); border:1px solid rgba(var(--p-rgb),.3); }
#page-payments .pay-pill::before{ content:''; width:6px; height:6px; border-radius:50%; background:currentColor; }
#page-payments .pay-pill.ok{ --p-rgb:80,176,120; }
#page-payments .pay-pill.warn{ --p-rgb:224,169,59; }
#page-payments .pay-pill.bad{ --p-rgb:217,120,104; }
#page-payments .pay-pill.mute{ --p-rgb:150,146,138; }
html[data-theme="light"] #page-payments .pay-pill.ok{ --p-rgb:36,128,76; }
html[data-theme="light"] #page-payments .pay-pill.warn{ --p-rgb:176,124,20; }
html[data-theme="light"] #page-payments .pay-pill.bad{ --p-rgb:186,78,62; }
html[data-theme="light"] #page-payments .pay-pill.mute{ --p-rgb:113,105,91; }

#page-payments .pay-skel td{ padding:16px; }
#page-payments .pay-skel-bar{ display:block; height:14px; border-radius:6px; background:linear-gradient(90deg, rgba(127,127,127,.12), rgba(127,127,127,.22), rgba(127,127,127,.12)); background-size:200% 100%; animation:payShimmer 1.3s linear infinite; }
@keyframes payShimmer{ from{ background-position:200% 0; } to{ background-position:-200% 0; } }
#page-payments .pay-empty{ padding:44px 16px; text-align:center; color:var(--text-muted); }
#page-payments .pay-empty svg{ width:34px; height:34px; margin-bottom:10px; opacity:.6; }
#page-payments .pay-empty div{ font-size:14px; }

@media (max-width:720px){
  #page-payments .pay-filters{ padding:14px; }
  #page-payments .pay-filters-grid{ grid-template-columns:1fr; gap:12px; }
  #page-payments .pay-filters-foot{ flex-direction:column; align-items:stretch; }
  #page-payments .pay-filters-actions{ justify-content:flex-end; }
}
@media (prefers-reduced-motion:reduce){ #page-payments .pay-skel-bar{ animation:none; } #page-payments .pay-search input[type=search], #page-payments .pay-table tbody td{ transition:none; } }

/* Access — group chips + accordion */
#page-payments .acc-chips{ display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
#page-payments .acc-chip{ display:inline-flex; align-items:center; gap:8px; min-height:34px; padding:6px 8px 6px 14px; border:1px solid var(--line); border-radius:999px; background:var(--bg-3); color:var(--text-muted); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; transition:background-color .16s ease, color .16s ease, border-color .16s ease; }
#page-payments .acc-chip:hover{ color:var(--text); border-color:rgba(201,162,75,.4); }
#page-payments .acc-chip:focus-visible{ outline:2px solid var(--gold); outline-offset:2px; }
#page-payments .acc-chip.is-active{ color:var(--bg); background:var(--gold); border-color:var(--gold); }
#page-payments .acc-chip-n{ min-width:22px; padding:2px 7px; border-radius:999px; font-size:11.5px; line-height:1.3; text-align:center; background:rgba(127,127,127,.18); font-variant-numeric:tabular-nums; }
#page-payments .acc-chip.is-active .acc-chip-n{ background:rgba(0,0,0,.18); }
#page-payments .acc-toolbar{ display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-top:14px; padding-top:14px; border-top:1px solid var(--line); }
#page-payments .acc-toolbar .hint{ margin:0; font-size:13px; }
#page-payments .acc-toolbar .hint b{ color:var(--gold-bright); }
#page-payments .acc-group{ margin-bottom:14px; padding:0; overflow:hidden; border-radius:14px; }
#page-payments .acc-group-head{ width:100%; display:flex; align-items:center; gap:12px; padding:14px 18px; border:none; background:transparent; color:var(--text); font-family:inherit; text-align:left; cursor:pointer; transition:background-color .15s ease; }
#page-payments .acc-group-head:hover{ background:rgba(201,162,75,.06); }
#page-payments .acc-group-head:focus-visible{ outline:2px solid var(--gold); outline-offset:-2px; }
#page-payments .acc-group-ic{ flex:none; width:36px; height:36px; border-radius:10px; display:grid; place-items:center; color:var(--gold-bright); background:var(--gold-dim); border:1px solid rgba(201,162,75,.3); }
#page-payments .acc-group-ic svg{ width:18px; height:18px; }
#page-payments .acc-group-title{ flex:1; min-width:0; }
#page-payments .acc-group-title b{ display:block; font-size:15px; font-weight:600; overflow-wrap:anywhere; }
#page-payments .acc-group-title span{ display:block; margin-top:2px; font-size:12.5px; color:var(--text-muted); }
#page-payments .acc-caret{ flex:none; width:18px; height:18px; color:var(--text-muted); transition:transform .2s ease; }
#page-payments .acc-group.is-open .acc-caret{ transform:rotate(180deg); }
#page-payments .acc-group-body{ display:none; border-top:1px solid var(--line); overflow-x:auto; }
#page-payments .acc-group.is-open .acc-group-body{ display:block; animation:accFade .18s ease; }
@keyframes accFade{ from{ opacity:0; transform:translateY(-4px); } to{ opacity:1; transform:none; } }
#page-payments .acc-group-body .pay-table{ min-width:560px; }
#page-payments .acc-group-body .pay-table thead th{ position:static; }
@media (max-width:720px){ #page-payments .acc-group-head{ padding:12px 14px; } #page-payments .acc-toolbar{ flex-direction:column; align-items:stretch; } }
@media (prefers-reduced-motion:reduce){ #page-payments .acc-caret{ transition:none; } #page-payments .acc-group.is-open .acc-group-body{ animation:none; } }

/* Settings — section nav, toggle cards, plan cards, save bar */
#page-payments .set-wrap{ max-width:980px; }
#page-payments .set-nav{ display:flex; gap:6px; margin-bottom:18px; overflow-x:auto; padding-bottom:2px; border-bottom:1px solid var(--line); }
#page-payments .set-nav-btn{ position:relative; flex:none; display:inline-flex; align-items:center; gap:9px; min-height:42px; padding:10px 16px; border:none; border-bottom:2px solid transparent; margin-bottom:-1px; background:transparent; color:var(--text-muted); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; transition:color .15s ease, border-color .15s ease, background-color .15s ease; border-radius:10px 10px 0 0; }
#page-payments .set-nav-btn:hover{ color:var(--text); background:rgba(201,162,75,.06); }
#page-payments .set-nav-btn.is-active{ color:var(--gold-bright); border-bottom-color:var(--gold); }
#page-payments .set-nav-btn:focus-visible{ outline:2px solid var(--gold); outline-offset:-2px; }
#page-payments .set-nav-ic svg{ width:17px; height:17px; display:block; }
#page-payments .set-dot{ display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--gold); }
#page-payments .set-nav-btn .set-dot{ position:absolute; top:9px; right:7px; }

#page-payments .set-card{ margin-bottom:16px; padding:20px; border-radius:14px; }
#page-payments .set-anim{ animation:setIn .2s ease; }
@keyframes setIn{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }
#page-payments .set-card-head{ display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
#page-payments .set-card-head h3{ margin:0; font-size:16px; }
#page-payments .set-card-head .btn svg{ width:14px; height:14px; margin-right:6px; vertical-align:-2px; }
#page-payments .set-card > .hint{ margin:0 0 14px; font-size:13px; }
#page-payments .set-grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; }
#page-payments .set-field{ margin-bottom:14px; }
#page-payments .set-grid .set-field{ margin-bottom:0; }
#page-payments .set-grid{ margin-bottom:14px; }
#page-payments .set-field label{ font-size:11.5px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; }
#page-payments .set-field input, #page-payments .set-field textarea{ border-radius:10px; transition:border-color .18s ease, box-shadow .18s ease; }
#page-payments .set-field input{ min-height:42px; }
#page-payments .set-field input:hover, #page-payments .set-field textarea:hover{ border-color:rgba(201,162,75,.35); }
#page-payments .set-field input:focus, #page-payments .set-field textarea:focus{ outline:none; border-color:var(--gold); box-shadow:0 0 0 3px var(--gold-dim); }

#page-payments .set-toggles{ display:grid; gap:12px; }
#page-payments .set-toggle{ width:100%; display:flex; align-items:center; gap:14px; padding:14px 16px; text-align:left; font-family:inherit; color:var(--text); background:var(--bg-3); border:1px solid var(--line); border-radius:12px; cursor:pointer; transition:border-color .18s ease, background-color .18s ease, transform .18s ease; }
#page-payments .set-toggle:hover{ border-color:rgba(201,162,75,.45); transform:translateY(-1px); }
#page-payments .set-toggle:focus-visible{ outline:2px solid var(--gold); outline-offset:2px; }
#page-payments .set-toggle.is-on{ background:rgba(80,176,120,.08); border-color:rgba(80,176,120,.4); }
#page-payments .set-toggle-ic{ flex:none; width:40px; height:40px; border-radius:11px; display:grid; place-items:center; color:var(--gold-bright); background:var(--gold-dim); border:1px solid rgba(201,162,75,.3); }
#page-payments .set-toggle.is-on .set-toggle-ic{ color:rgb(80,176,120); background:rgba(80,176,120,.13); border-color:rgba(80,176,120,.35); }
#page-payments .set-toggle-ic svg{ width:19px; height:19px; }
#page-payments .set-toggle-body{ flex:1; min-width:0; }
#page-payments .set-toggle-body b{ display:block; font-size:14.5px; font-weight:600; }
#page-payments .set-toggle-body small{ display:block; margin-top:3px; font-size:12.5px; line-height:1.45; color:var(--text-muted); }
#page-payments .set-state{ flex:none; font-size:11px; font-weight:700; letter-spacing:.07em; color:var(--text-muted); }
#page-payments .set-toggle.is-on .set-state{ color:rgb(80,176,120); }
html[data-theme="light"] #page-payments .set-toggle.is-on .set-state{ color:#24804C; }
#page-payments .set-alert{ margin-top:14px; padding:12px 14px; border-radius:10px; font-size:13.5px; color:#E0A93B; background:rgba(224,169,59,.12); border:1px solid rgba(224,169,59,.35); }
html[data-theme="light"] #page-payments .set-alert{ color:#8A5F10; }

#page-payments .set-bank{ display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:18px; margin-bottom:12px; }
#page-payments .set-bank .set-field{ margin-bottom:0; }
#page-payments .set-preview-lbl{ margin-bottom:6px; font-size:11.5px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--text-muted); }
#page-payments .set-preview-box{ min-height:100%; padding:14px 16px; white-space:pre-wrap; overflow-wrap:anywhere; font-size:14px; line-height:1.6; background:var(--bg-3); border:1px dashed rgba(201,162,75,.4); border-radius:12px; }

#page-payments .set-plans{ display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap:14px; }
#page-payments .set-plan{ display:flex; flex-direction:column; gap:12px; padding:16px; background:var(--bg-3); border:1px solid var(--line); border-radius:12px; transition:border-color .18s ease, opacity .18s ease, transform .18s ease; }
#page-payments .set-plan:hover{ border-color:rgba(201,162,75,.4); transform:translateY(-1px); }
#page-payments .set-plan.is-off{ opacity:.7; }
#page-payments .set-plan .set-field{ margin-bottom:0; }
#page-payments .set-plan-top{ display:flex; justify-content:space-between; align-items:center; gap:10px; }
#page-payments .set-plan-sw{ display:inline-flex; align-items:center; gap:8px; }
#page-payments .set-plan-sw .hint{ margin:0; font-size:12.5px; }
#page-payments .set-plan-save{ align-self:flex-end; }

#page-payments .set-fx{ display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap:10px; }
#page-payments .set-fx-row{ display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--bg-3); border:1px solid var(--line); border-radius:12px; transition:border-color .18s ease; }
#page-payments .set-fx-row:hover{ border-color:rgba(201,162,75,.4); }
#page-payments .set-fx-cur{ flex:1; min-width:0; }
#page-payments .set-fx-cur b{ display:block; font-size:14.5px; }
#page-payments .set-fx-cur .hint{ display:block; margin:2px 0 0; font-size:11.5px; }
#page-payments .set-fx-row input{ width:110px; min-height:38px; border-radius:9px; }
#page-payments .set-remind{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
#page-payments .set-remind .hint{ flex:1; min-width:200px; margin:0; font-size:13px; }

#page-payments .set-savebar{ position:sticky; bottom:12px; z-index:5; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 16px; background:var(--bg-2); border:1px solid var(--line); border-radius:14px; box-shadow:0 12px 30px -16px rgba(0,0,0,.55); transition:border-color .18s ease; }
#page-payments .set-savebar.is-dirty{ border-color:rgba(201,162,75,.55); }
#page-payments .set-savebar-msg{ display:inline-flex; align-items:center; gap:9px; font-size:13.5px; font-weight:600; color:var(--text-muted); }
#page-payments .set-savebar-msg .set-dot{ background:rgb(80,176,120); }
#page-payments .set-savebar.is-dirty .set-savebar-msg{ color:var(--gold-bright); }
#page-payments .set-savebar.is-dirty .set-savebar-msg .set-dot{ background:var(--gold); animation:setPulse 1.4s ease-in-out infinite; }
@keyframes setPulse{ 50%{ opacity:.35; } }
#page-payments .set-savebar-btns{ display:inline-flex; align-items:center; gap:8px; }

@media (max-width:720px){
  #page-payments .set-card{ padding:16px; }
  #page-payments .set-grid{ grid-template-columns:1fr; }
  #page-payments .set-bank{ grid-template-columns:1fr; }
  #page-payments .set-toggle{ flex-wrap:wrap; }
  #page-payments .set-toggle-body{ flex-basis:calc(100% - 140px); }
  #page-payments .set-savebar{ bottom:8px; }
  #page-payments .set-savebar-btns{ width:100%; justify-content:flex-end; }
}
@media (prefers-reduced-motion:reduce){ #page-payments .set-anim, #page-payments .set-savebar.is-dirty .set-dot{ animation:none; } #page-payments .set-toggle, #page-payments .set-plan, #page-payments .set-nav-btn{ transition:none; } #page-payments .set-toggle:hover, #page-payments .set-plan:hover{ transform:none; } }

/* Global polish: pane transition, buttons, focus, mobile stacked tables */
#page-payments .pay-pane{ animation:payPane .22s ease; }
@keyframes payPane{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:none; } }
#page-payments .btn{ transition:transform .15s ease, box-shadow .15s ease, background-color .15s ease, border-color .15s ease, color .15s ease, opacity .15s ease; }
#page-payments .btn:not(:disabled):hover{ transform:translateY(-1px); }
#page-payments .btn:not(:disabled):active{ transform:translateY(0) scale(.98); }
#page-payments .btn-gold:not(:disabled):hover{ box-shadow:0 8px 18px -10px rgba(200,160,60,.8); }
#page-payments .btn:disabled{ opacity:.55; cursor:not-allowed; }
#page-payments .btn:focus-visible, #page-payments select:focus-visible, #page-payments input:focus-visible, #page-payments textarea:focus-visible{ outline:2px solid var(--gold); outline-offset:2px; }
#page-payments .pay-filters input:focus-visible, #page-payments .set-field input:focus-visible, #page-payments .set-field textarea:focus-visible, #page-payments .pay-search input:focus-visible{ outline:none; }
#page-payments .pay-table-wrap, #page-payments .acc-group-body{ scrollbar-width:thin; }
#page-payments .pay-actions .btn{ opacity:.92; }
#page-payments .pay-table tbody tr:hover .pay-actions .btn{ opacity:1; }
@media (max-width:640px){
  #page-payments .pay-table, #page-payments .acc-group-body .pay-table{ min-width:0; display:block; }
  #page-payments .pay-table thead{ display:none; }
  #page-payments .pay-table tbody{ display:block; }
  #page-payments .pay-table tbody tr{ display:block; padding:12px 14px; border-bottom:1px solid var(--line); }
  #page-payments .pay-table tbody tr:last-child{ border-bottom:none; }
  #page-payments .pay-table tbody td{ display:flex; justify-content:space-between; align-items:center; gap:14px; padding:6px 0; border:none; text-align:right; background:transparent !important; }
  #page-payments .pay-table tbody td[data-label]::before{ content:attr(data-label); flex:none; font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--text-muted); text-align:left; }
  #page-payments .pay-table tbody td.pay-buyer{ text-align:right; }
  #page-payments .pay-table tbody td.pay-actions{ justify-content:flex-end; padding-top:10px; }
  #page-payments .pay-table tbody td.pay-actions:empty{ display:none; }
  #page-payments .pay-table tr.pay-skel td{ display:block; }
}
/* compact inline icons (the Deadlines heading icon used to render at full size) */
#page-payments .pay-filters h3 svg{ width:20px; height:20px; flex:none; color:var(--gold); }
#page-payments .pay-filters .btn svg, #page-payments .pay-actions .btn svg{ width:15px; height:15px; vertical-align:-3px; flex:none; }
@media (prefers-reduced-motion:reduce){ #page-payments .pay-pane{ animation:none; } #page-payments .btn{ transition:none; } #page-payments .btn:not(:disabled):hover, #page-payments .btn:not(:disabled):active{ transform:none; } }
`;
