import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { useDashboardData } from '../../../context/DashboardDataContext';
import WrittenExams from './WrittenExams';

const LOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
);

/** Exam page — written exams only (level tests were removed). */
export default function ExamView() {
  const { t } = useCabinetI18n();
  const { groupCode } = useDashboardData();
  const joined = !!groupCode;

  return (
    <section id="examView">
      <div className="inner-page-head">
        <div>
          <h1>{t('Exams')}</h1>
        </div>
      </div>

      {!joined ? (
        <div className="panel" id="examLockedPanel">
          <div className="inner-locked">
            {LOCK_ICON}
            <h3>{t('No exams yet')}</h3>
            <p>{t('Ask your teacher for a group code to unlock your level exams.')}</p>
          </div>
        </div>
      ) : (
        <div id="examContent">
          <div className="we-panel active" id="weStudentWrittenPanel">
            <WrittenExams />
          </div>
        </div>
      )}
    </section>
  );
}
