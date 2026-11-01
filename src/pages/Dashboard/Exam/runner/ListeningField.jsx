import { useEffect, useRef, useState } from 'react';
import { LISTENING_MAX_PLAYS } from '../../../../lib/examPaper';

/* The listening item is Arabic only (audio, question, options and these few labels), like the paper itself.
   Plays are counted per attempt and kept in localStorage, so reloading the page cannot give extra listens. */
const LETTERS = ['أ', 'ب', 'ج', 'د'];
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);

const storeKey = (subId, qid) => 'ufuq-listen:' + subId + ':' + qid;
function readPlays(key) { try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; } }
function writePlays(key, n) { try { localStorage.setItem(key, String(n)); } catch (e) { /* private mode: the in-memory count still applies */ } }

export default function ListeningField({ subId, qid, audio, opts, value, readOnly, onPick }) {
  const key = storeKey(subId, qid);
  const [plays, setPlays] = useState(() => readPlays(key));
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const el = useRef(null);

  useEffect(() => { setPlays(readPlays(key)); setPlaying(false); setFailed(false); }, [key]);
  // leaving the question (or the exam) stops the sound
  useEffect(() => () => { if (el.current) { el.current.pause(); el.current = null; } }, [key]);

  const left = Math.max(0, LISTENING_MAX_PLAYS - plays);
  const play = () => {
    if (playing || left <= 0 || readOnly) return;
    setFailed(false);
    const a = new Audio(audio);
    el.current = a;
    a.onplaying = () => {   // a listen counts only once the sound really starts (a failed download costs nothing)
      setPlaying(true);
      const n = readPlays(key) + 1;
      writePlays(key, n); setPlays(n);
      a.onplaying = null;
    };
    a.onended = () => { setPlaying(false); el.current = null; };
    a.onerror = () => { setPlaying(false); setFailed(true); el.current = null; };
    a.play().catch(() => { setPlaying(false); setFailed(true); });
  };

  return (
    <div className="xl" dir="rtl" lang="ar">
      {!readOnly && (
        <div className="xl-player">
          <button type="button" className={'xl-play' + (playing ? ' on' : '')} disabled={playing || left <= 0} onClick={play}>
            <span aria-hidden="true">{playing ? '❙❙' : '▶'}</span>
            <span>{playing ? 'جارٍ الاستماع…' : (plays === 0 ? 'استمع' : 'استمع مرة أخرى')}</span>
          </button>
          <span className="xl-left" aria-live="polite">
            {left > 0 ? 'عدد مرات الاستماع المتبقية: ' + arNum(left) : 'انتهت مرات الاستماع'}
          </span>
        </div>
      )}
      {failed && <p className="xl-err" role="alert">تعذّر تشغيل الصوت. تحقّق من الاتصال ثم حاول مرة أخرى.</p>}
      <div className="xl-opts" role="radiogroup">
        {opts.map((o, i) => (
          <label key={o} className={'xl-opt' + (value === o ? ' on' : '')}>
            <input type="radio" name={'xl-' + qid} checked={value === o} disabled={readOnly} onChange={() => onPick(o)} />
            <span className="xl-l">{LETTERS[i] || i + 1}</span>
            <span className="xl-t">{o}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
