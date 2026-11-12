import { useState } from 'react';
import ExamShell from '../../../../components/ExamShell';
import { pickFeedback } from '../../../../lib/aiFeedback';
import { splitAnswer } from '../../../../lib/examPaper';
import { examMax, examPoints, fmtPts } from '../../../../lib/scoring';
import { ScoreWindow } from './runnerShared';
import RichQ from '../../../../components/RichQ';

/** The handed-in, AI-checked paper: score ring, correct / partial / wrong filters and one expandable card per question. */
export default function ResultReview({ t, lang, exam, sub, laid, answers, texts, showResult, onCloseResult, onBack, backBtn }) {
  const [rf, setRf] = useState('all');   // result filter: all | good | mid | bad
  const [ov, setOv] = useState({});      // cards opened / closed by hand
    const tone = (v) => (v >= 80 ? 'good' : v >= 50 ? 'mid' : 'bad');
    let sn = 0; let skey = '|';
    const rows = laid.map(({ q, body, partHead, secHead }, i) => {
      const a = answers[q.id];
      const sc = a ? ((a.teacher_score !== null && a.teacher_score !== undefined) ? a.teacher_score : (a.ai_score !== undefined ? a.ai_score : null)) : null;
      const raw = (texts[q.id] || '');
      const k = (partHead || '') + '|' + (secHead || '');
      if (k !== '|' && k !== skey) { sn += 1; skey = k; }
      let ansText = raw.trim();
      if (q.type === 'matching' || q.type === 'antonym') { const sp = splitAnswer(raw); ansText = [sp.word, sp.sentence].filter((x) => x && x.trim()).join('\n'); }
      return { id: q.id, n: i + 1, body, sc, fb: a ? pickFeedback(a, lang, t) : '', ans: ansText, sec: sn, bank: null };
    });
    const cnt = { good: 0, mid: 0, bad: 0 };
    rows.forEach((r) => { cnt[tone(r.sc || 0)] += 1; });
    const shown = rows.filter((r) => rf === 'all' || tone(r.sc || 0) === rf);
    const isOpen = (r) => (r.id in ov ? ov[r.id] : (r.sc || 0) < 80);
    const setAll = (v) => { const o = {}; rows.forEach((r) => { o[r.id] = v; }); setOv(o); };
    const filters = [['all', t('All'), rows.length], ['good', t('Correct'), cnt.good], ['mid', t('Partial'), cnt.mid], ['bad', t('Wrong'), cnt.bad]];
    const sTotal = sub.total_score == null ? null : sub.total_score;
    const resultWindow = showResult ? (
      <ScoreWindow t={t} total={sTotal} kind={exam.exam_kind} title={exam.title} counts={cnt}
                   onDetails={() => onCloseResult()} onBack={onBack} />
    ) : null;
    return (
      <ExamShell title={exam.title} subtitle={t('Review your answers')} right={backBtn} overlay={resultWindow}>
        <div className="xrv">
          <section className="xrv-top">
            <div className={'xr-score ' + tone(sTotal || 0)}>
              <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" className="bg" /><circle cx="60" cy="60" r="52" className="fg" style={{ strokeDasharray: (Math.max(0, Math.min(100, sTotal || 0)) * 3.267) + ' 400' }} /></svg>
              <b>{sTotal == null ? '—' : fmtPts(examPoints(sTotal, exam.exam_kind))}</b><span>/ {examMax(exam.exam_kind)}</span>
            </div>
            <div className="xrv-sum">
              <h2>{t('Your result')}</h2>
              <p>{t('Checked by AI')} · {exam.title}</p>
              <div className="xrv-stats">
                <div className="good"><b>{cnt.good}</b>{t('Correct')}</div>
                <div className="mid"><b>{cnt.mid}</b>{t('Partial')}</div>
                <div className="bad"><b>{cnt.bad}</b>{t('Wrong')}</div>
              </div>
            </div>
          </section>

          <div className="xrv-bar">
            <div className="xrv-filters" role="tablist">
              {filters.map(([k, label, n]) => (
                <button key={k} type="button" role="tab" aria-selected={rf === k} className={'xrv-f ' + k + (rf === k ? ' on' : '')} onClick={() => setRf(k)}>{label}<i>{n}</i></button>
              ))}
            </div>
            <div className="xrv-all">
              <button type="button" onClick={() => setAll(true)}>{t('Expand all')}</button>
              <button type="button" onClick={() => setAll(false)}>{t('Collapse all')}</button>
            </div>
          </div>

          <div className="xrv-list">
            {shown.map((r) => {
              const open = isOpen(r); const tn = tone(r.sc || 0);
              return (
                <article className={'xrv-card ' + tn + (open ? ' open' : '')} key={r.id}>
                  <button type="button" className="xrv-head" aria-expanded={open} onClick={() => setOv((o) => ({ ...o, [r.id]: !open }))}>
                    <span className="xrv-n">{r.n}</span>
                    <span className="xrv-q" dir="auto">{String(r.body).replace(/[{}]/g, '').replace(/\s+/g, ' ').slice(0, 120)}</span>
                    {r.sec > 0 && <span className="xrv-sec">{t('Section')} {r.sec}</span>}
                    <span className={'xr-rs ' + tn}>{r.sc == null ? '—' : r.sc}</span>
                    <svg className="xrv-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {open && (
                    <div className="xrv-body">
                      <p className="xrv-full" dir="auto"><RichQ text={r.body} /></p>
                      <div className="xrv-lbl">{t('Your answer')}</div>
                      <div className={'xrv-ans' + (r.ans ? '' : ' none')} dir="auto">{r.ans || t('No answer')}</div>
                      {r.fb ? (<><div className="xrv-lbl">{t('AI comment')}</div><div className="xrv-fb" dir="auto">{r.fb}</div></>) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <div style={{ textAlign: 'center', margin: '26px 0 10px' }}>{backBtn}</div>
        </div>
      </ExamShell>
    );
}
