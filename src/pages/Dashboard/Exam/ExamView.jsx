import { useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { useDashboardData } from '../../../context/DashboardDataContext';
import WrittenExams from './WrittenExams';
import { useLevelResults, EarlierLevelsModal } from './LevelResults';

const LOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
);

/** Exam page — written exams only (level tests were removed). */
export default function ExamView() {
  const { t } = useCabinetI18n();
  const { groupCode, user, role, level: myLevel } = useDashboardData();
  const joined = !!groupCode;
  const isStaff = role === 'teacher';
  const levelData = useLevelResults(isStaff ? null : (user && user.id), myLevel);   // current level card + earlier levels
  const [olderOpen, setOlderOpen] = useState(false);

  return (
    <section id="examView">
      <div className="inner-page-head">
        <div>
          <h1>{t('Exams')}</h1>
        </div>
        {joined && levelData.older.length > 0 && (
          <button type="button" className="ex2-older-btn" onClick={() => setOlderOpen(true)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
            {t('Earlier levels')}<i>{levelData.older.length}</i>
          </button>
        )}
      </div>
      {olderOpen && <EarlierLevelsModal data={levelData} onClose={() => setOlderOpen(false)} />}

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
            <WrittenExams levelData={levelData} />
          </div>
        </div>
      )}
    </section>
  );
}
