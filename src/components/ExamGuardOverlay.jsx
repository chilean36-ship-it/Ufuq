import PageStyle from './PageStyle';
import { GUARD_CSS } from '../hooks/useExamGuard';

const fill = (s, vars) => Object.keys(vars).reduce((acc, k) => acc.replace('{' + k + '}', String(vars[k])), s);

/** Warning shown when the student leaves the exam. `t` is the cabinet translate function. Max = total warnings allowed. */
export default function ExamGuardOverlay({ t, warning, max, onContinue }) {
  if (!warning) return <><PageStyle css={GUARD_CSS} /></>;
  const n = warning.count;
  let head;
  let body;
  let text;
  if (warning.tech) {
    head = t('Connection interruption');
    body = t('You had no internet connection, so this is not counted against you. Please return to the exam.');
    text = warning.back
      ? t('You are back. The interruption is recorded but not counted.')
      : t('Your answers are saved. Return to the exam when the connection is back.');
  } else {
    head = fill(t('Warning {n} of 3: you left the exam'), { n });
    body = t('Leaving the exam page, switching apps or tabs, locking the screen or exiting full screen is recorded and shown to your teacher.');
    if (warning.final) text = t('Your exam is being submitted now.');
    else if (warning.back) text = n >= max
      ? t('The warnings are used up. Leaving the exam again submits it at once.')
      : fill(t('You are back. This is warning {n} of 3 for leaving the exam. Please stay on the exam page.'), { n });
    else if (warning.stage >= 2) text = t('You have been away for 20 seconds. Return now: if you stay away until 40 seconds, the exam is submitted automatically.');
    else if (n >= max - 1) text = t('This is your last warning. Staying away for 20 seconds submits the exam automatically.');
    else text = t('Return to the exam now. Staying away for 20 seconds gives the next warning; staying away for 40 seconds submits the exam.');
  }
  return (
    <>
      <PageStyle css={GUARD_CSS} />
      <div className="exam-guard-overlay" role="alertdialog" aria-modal="true">
        <div className="exam-guard-box">
          <h3>{head}{warning.tech ? '' : ' · ' + n + ' / ' + max}</h3>
          <p>
            {body}{' '}
            <b>{text}</b>
          </p>
          {!warning.final && <button type="button" onClick={onContinue}>{t('Return to the exam')}</button>}
        </div>
      </div>
    </>
  );
}
