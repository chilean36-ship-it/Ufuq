import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import PageStyle from '../../components/PageStyle';
import { PageHeader } from './ui';

/** Admin → Administration → Resources (main admin only): how full Supabase, Cloudflare R2 and the Claude API are.
 *  Data comes from the `resource-usage` Edge Function; a service without its secret shows what to set instead of a gauge. */

const CSS = `
#page-resources .rs-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; margin-bottom:16px; }
#page-resources .rs-card{ background:var(--bg-card,rgba(255,255,255,.03)); border:1px solid var(--border,rgba(255,255,255,.08)); border-radius:16px; padding:18px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
#page-resources .rs-card h3{ margin:0; font-size:.95rem; display:flex; align-items:center; gap:8px; }
#page-resources .rs-ring{ position:relative; width:132px; height:132px; }
#page-resources .rs-ring svg{ width:100%; height:100%; transform:rotate(-90deg); }
#page-resources .rs-ring .trk{ fill:none; stroke:rgba(128,128,128,.22); stroke-width:11; }
#page-resources .rs-ring .bar{ fill:none; stroke-width:11; stroke-linecap:round; transition:stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1), stroke .3s; }
#page-resources .rs-ring .pct{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.5rem; }
#page-resources .rs-nums{ font-size:.85rem; }
#page-resources .rs-nums b{ font-size:1rem; }
#page-resources .rs-sub{ font-size:.78rem; opacity:.7; }
#page-resources .rs-state{ font-size:.78rem; padding:3px 10px; border-radius:99px; }
#page-resources .rs-state.ok{ background:rgba(60,190,120,.15); color:#3fae78; }
#page-resources .rs-state.warn{ background:rgba(230,170,50,.18); color:#b8860b; }
#page-resources .rs-state.bad{ background:rgba(235,80,80,.16); color:#d65a5a; }
#page-resources .rs-note{ background:rgba(201,162,75,.08); border:1px dashed rgba(201,162,75,.4); border-radius:12px; padding:12px 14px; font-size:.82rem; width:100%; text-align:left; }
#page-resources code{ font-size:.78rem; background:rgba(128,128,128,.18); padding:1px 6px; border-radius:6px; }
#page-resources .rs-buckets{ width:100%; display:flex; flex-direction:column; gap:6px; }
#page-resources .rs-brow{ display:grid; grid-template-columns:minmax(80px,1fr) 2fr auto; gap:8px; align-items:center; font-size:.78rem; text-align:left; }
#page-resources .rs-bbar{ height:7px; border-radius:6px; background:rgba(128,128,128,.22); overflow:hidden; }
#page-resources .rs-bbar i{ display:block; height:100%; background:var(--gold,#c9a24b); border-radius:6px; }
@media (prefers-reduced-motion:reduce){ #page-resources .rs-ring .bar{ transition:none; } }
`;

const MB = 1024 * 1024;
function size(b) {
  if (b == null) return '—';
  if (b >= 1024 * MB) return (b / (1024 * MB)).toFixed(2) + ' GB';
  if (b >= MB) return (b / MB).toFixed(1) + ' MB';
  return Math.max(0, Math.round(b / 1024)) + ' KB';
}
const tone = (p) => (p >= 90 ? 'bad' : p >= 70 ? 'warn' : 'ok');
const COL = { ok: '#3fae78', warn: '#d9a21f', bad: '#d65a5a' };

function Ring({ pct }) {
  const p = Math.max(0, Math.min(100, pct || 0)), r = 52, c = 2 * Math.PI * r;
  return (
    <div className="rs-ring">
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <circle className="trk" cx="66" cy="66" r={r} />
        <circle className="bar" cx="66" cy="66" r={r} stroke={COL[tone(p)]} strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
      </svg>
      <div className="pct">{Math.round(p)}%</div>
    </div>
  );
}

function Gauge({ icon, title, used, limit, extra, t }) {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const tn = tone(pct);
  return (
    <div className="rs-card" role="group" aria-label={title}>
      <h3>{icon}{title}</h3>
      <Ring pct={pct} />
      <div className="rs-nums"><b>{size(used)}</b> / {size(limit)}</div>
      <div className="rs-sub">{t('Free')}: {size(Math.max(0, limit - used))}</div>
      <span className={'rs-state ' + tn}>{tn === 'ok' ? t('Plenty of room') : tn === 'warn' ? t('Getting full') : t('Almost full')}</span>
      {extra}
    </div>
  );
}

function Notice({ title, icon, children }) {
  return (
    <div className="rs-card" style={{ alignItems: 'stretch' }}>
      <h3 style={{ justifyContent: 'center' }}>{icon}{title}</h3>
      <div className="rs-note">{children}</div>
    </div>
  );
}

const I = (d) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const IC_DB = I(<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>);
const IC_FILES = I(<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>);
const IC_CLOUD = I(<path d="M18 10a6 6 0 0 0-11.6-1.5A4.5 4.5 0 0 0 7 18h11a4 4 0 0 0 0-8z" />);
const IC_AI = I(<><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>);

export default function ResourcesPage() {
  const { t, toast } = usePanel();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    const { data, error } = await supabase.functions.invoke('resource-usage', { body: {} });
    setBusy(false);
    if (error || !data || data.error) { setErr((data && data.error) || (error && error.message) || 'error'); toast(t('Could not load resource usage.'), 'err'); return; }
    setD(data);
  }, [t, toast]);
  useEffect(() => { load(); }, [load]);

  const sb = d && d.supabase, cf = d && d.cloudflare, cl = d && d.claude;
  const need = (arr) => (arr || []).map((k) => <code key={k} style={{ marginInlineEnd: 6 }}>{k}</code>);

  return (
    <section className="page active" id="page-resources">
      <PageStyle css={CSS} />
      <PageHeader title={t('Resources')} sub={t('How much space and budget is left on Supabase, Cloudflare and Claude.')}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={busy}>{busy ? t('Loading…') : t('Refresh')}</button>
      </PageHeader>
      {err && !d && <div className="panel" style={{ padding: 16 }}>{t('Could not load resource usage.')} <small style={{ opacity: .7 }}>{err}</small></div>}
      {!d && !err && <div className="panel" style={{ padding: 16 }}>{t('Loading…')}</div>}

      {d && (<>
        <div className="rs-grid">
          {sb && sb.db ? <Gauge t={t} icon={IC_DB} title={t('Supabase database')} used={sb.db.used} limit={sb.db.limit} />
            : <Notice icon={IC_DB} title={t('Supabase database')}>{sb && sb.error ? sb.error : '—'} · <code>20261201_resource_usage.sql</code></Notice>}
          {sb && sb.storage ? (
            <Gauge t={t} icon={IC_FILES} title={t('Supabase file storage')} used={sb.storage.used} limit={sb.storage.limit}
              extra={sb.storage.buckets && sb.storage.buckets.length ? (
                <div className="rs-buckets">
                  {sb.storage.buckets.slice(0, 5).map((b) => (
                    <div className="rs-brow" key={b.name}><span>{b.name}</span><span className="rs-bbar"><i style={{ width: Math.max(2, (b.bytes / Math.max(1, sb.storage.used)) * 100) + '%' }} /></span><span>{size(b.bytes)}</span></div>
                  ))}
                </div>) : null} />
          ) : <Notice icon={IC_FILES} title={t('Supabase file storage')}>—</Notice>}

          {cf && cf.r2 ? <Gauge t={t} icon={IC_CLOUD} title={t('Cloudflare R2 (audio, media)')} used={cf.r2.used} limit={cf.r2.limit} extra={<div className="rs-sub">{cf.r2.objects} {t('files')}</div>} />
            : cf && cf.configured === false
              ? <Notice icon={IC_CLOUD} title={t('Cloudflare R2 (audio, media)')}>{t('Not connected yet. Add these secrets to the Edge Function:')} {need(cf.need)}</Notice>
              : <Notice icon={IC_CLOUD} title={t('Cloudflare R2 (audio, media)')}>{(cf && cf.error) || '—'}</Notice>}

          {cl && cl.configured === false
            ? <Notice icon={IC_AI} title={t('Claude API')}>{t('Not connected yet. Add these secrets to the Edge Function:')} {need(cl.need)}</Notice>
            : cl && (
              <div className="rs-card" role="group" aria-label={t('Claude API')}>
                <h3>{IC_AI}{t('Claude API')}</h3>
                {cl.spent != null && cl.budget ? <>
                  <Ring pct={(cl.spent / cl.budget) * 100} />
                  <div className="rs-nums"><b>${cl.spent.toFixed(2)}</b> / ${cl.budget.toFixed(2)} {t('this month')}</div>
                  <div className="rs-sub">{t('Left')}: ${Math.max(0, cl.budget - cl.spent).toFixed(2)}</div>
                </> : cl.spent != null ? <div className="rs-nums"><b>${cl.spent.toFixed(2)}</b> {t('this month')}<div className="rs-sub"><code>CLAUDE_MONTHLY_BUDGET_USD</code></div></div>
                  : <div className="rs-note">{cl.spendNeed ? <code>{cl.spendNeed}</code> : cl.spendError}</div>}
                {cl.rate && cl.rate.requests && cl.rate.requests.limit != null && (
                  <div className="rs-nums">{t('Requests per minute left')}: <b>{cl.rate.requests.remaining}</b> / {cl.rate.requests.limit}</div>
                )}
                {cl.rate && cl.rate.tokens && cl.rate.tokens.limit != null && (
                  <div className="rs-nums">{t('Tokens per minute left')}: <b>{cl.rate.tokens.remaining}</b> / {cl.rate.tokens.limit}</div>
                )}
                <div className="rs-sub">{t('Anthropic does not expose the prepaid credit balance through the API; check it in the Console.')}</div>
              </div>
            )}
        </div>
        <p className="hint">{t('Updated')}: {new Date(d.at).toLocaleString()}</p>
      </>)}
    </section>
  );
}
