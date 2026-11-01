import { useEffect, useMemo, useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import { getExamHistory } from './Exam/examData';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import PageStyle from '../../components/PageStyle';
import ExamTrendChart, { CHART_CSS } from '../../components/ExamTrendChart';
import Loader from '../../components/Loader';

const LOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
);

const CSS = `
.pgx-panel{ padding:26px 28px 24px; }
.pgx-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:20px; }
.pgx-head h2{ margin:0; font-family:'Fraunces',serif; font-size:26px; font-weight:600; color:var(--text); }
.pgx-note{ font-size:14.5px; color:var(--text-muted); padding:60px 0; text-align:center; }
.pgx-ins{ display:flex; flex-direction:column; gap:10px; margin-top:22px; }
.pgx-ins div{ font-size:14.5px; padding:13px 16px; border-radius:12px; background:var(--bg-3); border-left:3px solid var(--gold); transition:transform .15s ease; }
.pgx-ins div:hover{ transform:translateX(3px); }
@media (max-width:640px){ .pgx-panel{ padding:18px 14px 16px; } .pgx-head h2{ font-size:21px; } }
`;

/** Progress page: one big interactive chart of the student's exam results over time (Monthly / Yearly). */
export default function ProgressView() {
  const { t } = useCabinetI18n();
  const { user, groupCode, groupReady } = useDashboardData();
  const joined = !!groupCode;
  const userId = user && user.id;
  const [history, setHistory] = useState(null);

  const load = async () => { const h = await getExamHistory(groupCode, userId); setHistory(h); };
  useEffect(() => {
    if (!groupReady || !joined) return undefined;
    let cancelled = false;
    setHistory(null);
    (async () => { const h = await getExamHistory(groupCode, userId); if (!cancelled) setHistory(h); })();
    return () => { cancelled = true; };
  }, [groupReady, joined, groupCode, userId]);
  // a new exam result shows up on the chart without a reload
  useLiveRefresh(load, [{ table: 'written_exam_submissions', filter: userId ? 'user_id=eq.' + userId : undefined }], { enabled: joined && !!userId });

  const insights = useMemo(() => {
    if (!history || history.length === 0) return [];
    const pcts = history.map((d) => d.pct);
    const out = [];
    if (pcts.length > 1) {
      const last = pcts[pcts.length - 1], prev = pcts[pcts.length - 2], delta = last - prev;
      out.push(delta > 0 ? t('Your last exam was {n}% better than the one before.').replace('{n}', delta)
        : delta < 0 ? t('Your last exam was {n}% lower than the one before — review the weak topics.').replace('{n}', Math.abs(delta))
        : t('Your last two exams are at the same level.'));
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const trend = Math.round(mean(pcts.slice(Math.floor(pcts.length / 2))) - mean(pcts.slice(0, Math.ceil(pcts.length / 2))));
      if (trend > 0) out.push(t('Overall you improved by {n}% since your first exams. Keep going!').replace('{n}', trend));
    }
    return out;
  }, [history, t]);

  return (
    <section id="progressView">
      <PageStyle css={CSS + CHART_CSS} />
      {!joined ? (
        <div className="panel" id="progressLockedPanel">
          <div className="inner-locked">{LOCK_ICON}<h3>{t('No progress yet')}</h3><p>{t('Ask your teacher for a group code to track your progress.')}</p></div>
        </div>
      ) : (
        <div className="panel pgx-panel">
          <div className="pgx-head"><h2>{t('Exam results over time')}</h2></div>
          {history === null ? <Loader inline label={t('Loading…')} />
            : history.length === 0 ? <div className="pgx-note">{t('Take your first exam to see your progress chart.')}</div>
            : <><ExamTrendChart items={history} size="lg" />{insights.length > 0 && <div className="pgx-ins">{insights.map((s, i) => <div key={i}>{s}</div>)}</div>}</>}
        </div>
      )}
    </section>
  );
}
