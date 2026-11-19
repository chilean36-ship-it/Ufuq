import { useCallback, useEffect, useState } from 'react';
import { useCabinetI18n } from '../context/CabinetI18nContext';
import { useDashboardData } from '../context/DashboardDataContext';
import { getAllExamHistory } from '../pages/Dashboard/Exam/examData';
import useLiveRefresh from '../hooks/useLiveRefresh';
import PageStyle from '../components/PageStyle';
import ProgressLine, { LINE_CSS } from '../components/ProgressLine';
import { useApp } from './AppContext';
import { useCountUp } from './hooks';
import { Ico } from './ui';

/** Native progress screen: latest result with its change, the line chart, and every graded exam as an animated bar. */
export default function ProgressScreen() {
  const { t } = useCabinetI18n();
  const { t: ta } = useApp();
  const { user, groupCode, groupReady } = useDashboardData();
  const joined = !!groupCode;
  const userId = user && user.id;
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => { const h = await getAllExamHistory(userId); setHistory(h.map((x) => (x.title === '—' ? { ...x, title: t('Exam') } : x))); }, [userId, t]);
  useEffect(() => {
    if (!groupReady || !joined) return undefined;
    let cancelled = false;
    setHistory(null);
    (async () => { const h = await getAllExamHistory(userId); if (!cancelled) setHistory(h.map((x) => (x.title === '—' ? { ...x, title: t('Exam') } : x))); })();
    return () => { cancelled = true; };
  }, [groupReady, joined, userId, t]);
  useLiveRefresh(load, [{ table: 'written_exam_submissions', filter: userId ? 'user_id=eq.' + userId : undefined }], { enabled: joined && !!userId });

  const last = history && history.length ? history[history.length - 1] : null;
  const prev = history && history.length > 1 ? history[history.length - 2] : null;
  const delta = last && prev ? last.pct - prev.pct : null;
  const best = history && history.length ? Math.max(...history.map((h) => h.pct)) : 0;
  const avg = history && history.length ? Math.round(history.reduce((a, h) => a + h.pct, 0) / history.length) : 0;
  const lastN = useCountUp(last ? last.pct : 0, 800);
  const bestN = useCountUp(best);
  const avgN = useCountUp(avg);

  if (!joined) {
    return <div className="ua-native"><div className="ua-empty big"><Ico n="chart" size={28} /><span>{t('Ask your teacher for a group code to track your progress.')}</span></div></div>;
  }
  return (
    <div className="ua-native ua-prog">
      <PageStyle css={LINE_CSS} />
      {history === null ? <div className="ua-skel tall" /> : history.length === 0 ? (
        <div className="ua-empty big"><Ico n="chart" size={28} /><span>{t('Take your first exam to see your progress chart.')}</span></div>
      ) : (
        <>
          <section className="ua-hero2 prog" style={{ '--i': 0 }}>
            <p className="ua-k light">{last.title}</p>
            <div className="ua-prog-now"><b>{lastN}</b><span>/ 100</span>
              {delta !== null && <i className={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}>{delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= '}{delta}</i>}
            </div>
            <div className="ua-meter light"><i style={{ width: last.pct + '%' }} /></div>
          </section>
          <div className="ua-tiles3" style={{ '--i': 1 }}>
            <div className="ua-t3 gold"><b>{bestN}</b><small>{ta('bestWord')}</small></div>
            <div className="ua-t3 ok"><b>{avgN}</b><small>{ta('avgWord')}</small></div>
            <div className="ua-t3"><b>{history.length}</b><small>{ta('q_exam')}</small></div>
          </div>
          <section className="ua-card2" style={{ '--i': 2 }}>
            <div className="ua-card2-h"><h3>{t('Exam results over time')}</h3></div>
            <ProgressLine items={history} />
          </section>
        </>
      )}
    </div>
  );
}
