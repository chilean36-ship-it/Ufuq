import ExamShell from '../../../../components/ExamShell';

/** "Before you start" screen: the rules and the Start button. The Start logic itself lives in WrittenRunner. */
export default function ExamIntro({ t, exam, mins, introTotal, resumed, doneCount, total, rules, startErr, starting, onBack, onBegin }) {
  return (
      <ExamShell title={exam.title} subtitle={t('Exam room')}>
        <div className="xr-intro">
          <h2>{t('Before you start')}</h2>
          <p>{t('Only the exam is shown: all other sections of the site are hidden until you finish.')}</p>
          <div className="xr-stats">
            {introTotal !== null && <span className="xr-chip">{introTotal} {t('questions')}</span>}
            <span className="xr-chip">{mins ? '\u23F1 ' + mins + ' ' + t('min') : t('No time limit')}</span>
            {resumed && <span className="xr-chip ok">{doneCount}/{total} {t('answered')}</span>}
          </div>
          <ul className="xr-rules">{rules.map(([ic, txt]) => <li key={txt}><span className="xr-ri">{ic}</span><span>{txt}</span></li>)}</ul>
          {startErr && <p className="exam-empty">{startErr}</p>}
          <div className="xr-intro-actions">
            <button type="button" className="xr-btn" onClick={onBack}>{t('Cancel')}</button>
            <button type="button" className="xr-btn pri" onClick={onBegin} disabled={starting}>{resumed ? t('Continue the exam') : t('Start the exam')}</button>
          </div>
        </div>
      </ExamShell>
  );
}
