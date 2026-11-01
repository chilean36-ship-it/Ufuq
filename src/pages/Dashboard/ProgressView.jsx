import { useEffect, useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import { getExamHistory } from './Exam/examData';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import PageStyle from '../../components/PageStyle';
import ProgressLine, { LINE_CSS } from '../../components/ProgressLine';
import Loader from '../../components/Loader';

const LOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
);

const CSS = `
.pgx-panel{ padding:26px 28px 24px; }
.pgx-head{ margin-bottom:18px; }
.pgx-head h2{ margin:0; font-family:'Fraunces',serif; font-size:24px; font-weight:600; color:var(--text); }
.pgx-note{ font-size:14.5px; color:var(--text-muted); padding:60px 0; text-align:center; }
@media (max-width:640px){ .pgx-panel{ padding:18px 14px 16px; } .pgx-head h2{ font-size:20px; } }
`;

/** Progress page: one simple line graph of the student's exam results (latest result + change on top). */
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
  // a new exam result shows up on the graph without a reload
  useLiveRefresh(load, [{ table: 'written_exam_submissions', filter: userId ? 'user_id=eq.' + userId : undefined }], { enabled: joined && !!userId });

  return (
    <section id="progressView">
      <PageStyle css={CSS + LINE_CSS} />
      {!joined ? (
        <div className="panel" id="progressLockedPanel">
          <div className="inner-locked">{LOCK_ICON}<h3>{t('No progress yet')}</h3><p>{t('Ask your teacher for a group code to track your progress.')}</p></div>
        </div>
      ) : (
        <div className="panel pgx-panel">
          <div className="pgx-head"><h2>{t('Exam results over time')}</h2></div>
          {history === null ? <Loader inline label={t('Loading…')} />
            : history.length === 0 ? <div className="pgx-note">{t('Take your first exam to see your progress chart.')}</div>
            : <ProgressLine items={history} />}
        </div>
      )}
    </section>
  );
}
