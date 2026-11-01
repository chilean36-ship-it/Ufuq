import { usePanel } from '../../components/panel/PanelContext';
import WrittenExamsPanel from './WrittenExamsPanel';

// Shared by the teacher and admin panels. Only written exams remain (level tests were removed).
export default function ExamsPage() {
  const { t } = usePanel();

  return (
    <section className="page active" id="page-exams">
      <div className="page-head">
        <h2>{t('Exams')}</h2>
        <p>{t("Create exams, write their questions and follow your students' results.")}</p>
      </div>
      <WrittenExamsPanel />
    </section>
  );
}
