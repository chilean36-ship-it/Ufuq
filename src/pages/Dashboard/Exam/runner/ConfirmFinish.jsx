/** The "Finish and submit" confirmation: how many answered / unanswered / marked, with shortcuts to the open ones. */
export default function ConfirmFinish({ t, left, total, flagCount, unansweredIdx, flaggedIdx, onClose, onJump, onFinish }) {
  return (
        <div className="xr-modal" role="alertdialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <div className="xr-modal-box">
            <h3>{t('Finish and submit')}</h3>
            <p>{left > 0 ? t('Some questions are not answered yet. Check them before you submit.') : t('All questions are answered.')} {t('Once you finish you can no longer change your answers. Continue?')}</p>
            <div className="xr-sum">
              <div className="ok"><b>{total - left}</b>{t('Answered')}</div>
              <div className={left > 0 ? 'no' : ''}><b>{left}</b>{t('Not answered')}</div>
              <div className="fl"><b>{flagCount}</b>{t('Marked')}</div>
            </div>
            {unansweredIdx.length > 0 && (
              <div className="xr-jump">
                <div className="xr-jump-t">{t('Not answered')}</div>
                <div className="xr-jump-l">{unansweredIdx.map((i) => <button key={i} type="button" className="xr-dot no" onClick={() => onJump(i)}>{i + 1}</button>)}</div>
              </div>
            )}
            {flaggedIdx.length > 0 && (
              <div className="xr-jump">
                <div className="xr-jump-t">{t('Marked for review')}</div>
                <div className="xr-jump-l">{flaggedIdx.map((i) => <button key={i} type="button" className="xr-dot flag" onClick={() => onJump(i)}>{i + 1}</button>)}</div>
              </div>
            )}
            <div className="xr-modal-actions">
              <button type="button" className="xr-btn" onClick={() => onClose()}>{left > 0 ? t('Go back to the exam') : t('Back')}</button>
              <button type="button" className="xr-btn ok" onClick={onFinish}>{t('Finish and submit')}</button>
            </div>
          </div>
        </div>
  );
}
