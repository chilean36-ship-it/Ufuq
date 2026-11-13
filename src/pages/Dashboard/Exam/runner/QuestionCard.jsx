import { isAnswered } from './runnerShared';
import RichQ from '../../../../components/RichQ';
import { GUARD_IS_MOBILE } from '../../../../hooks/useExamGuard';

/** One question of the exam room (part / section heading, word list, the question text and the answer box passed in as `field`). */
export default function QuestionCard({ t, q, item, cur, total, qval, flagged, ctx, scale, field, onToggleFlag }) {
  const ICON_FLAG = <svg viewBox="0 0 24 24" width="18" height="18" fill={flagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>;
  return (
    <>
          <article className="xq" key={q.id} data-qid={q.id} style={{ '--xr-fs': scale }}>
            <div className="xq-top">
              <span className="xq-no"><span>{t('Question')}</span><b>{cur + 1}</b><span>/ {total}</span></span>
              {isAnswered(qval) ? <span className="xq-done">{'\u2713'} {t('Answered')}</span> : null}
              <button type="button" className={'xq-flagbtn' + (flagged ? ' on' : '')} aria-pressed={flagged} onClick={onToggleFlag} title={t('Mark for review')}>
                {ICON_FLAG}<span className="t">{flagged ? t('Marked for review') : t('Mark for review')}</span>
              </button>
            </div>
            {(ctx.part || ctx.sec) && (
              <div className="xq-ctx">
                {ctx.part ? <div className="xq-part" dir="auto">{ctx.part}</div> : null}
                {ctx.sec ? <div className="xq-sec" dir="auto">{ctx.sec}</div> : null}
              </div>
            )}
            {item.bank && item.bank.length > 0 && (
              <div className="xq-bank" dir="auto">
                <span className="xq-bank-l">{t('Word list')}</span>
                {item.bank.map((w) => <span className="xq-chip" key={w}>{w}</span>)}
              </div>
            )}
            <p className={'xq-text' + (item.audio ? ' xq-text-ar' : '')} dir="auto"><RichQ text={item.body} /></p>
            {field}
          </article>
          <p className="xq-hint">{t('Your answers are saved automatically.')}{GUARD_IS_MOBILE && total > 1 ? ' ' + t('Swipe left or right to change the question.') : ''}</p>
    </>
  );
}
