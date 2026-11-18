import { useEffect, useMemo, useRef, useState } from 'react';
import { ENTRIES, POS_NAME } from './dictData';
import { SECRET } from './dictLock';
import './dict.css';

const FAV_KEY = 'lugat-saralangan';
const keyOf = (e) => e.word.toLowerCase() + '|' + e.pos;
const SORTED = ENTRIES.slice().sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()) || a.pos.localeCompare(b.pos));
const LETTERS = Array.from(new Set(SORTED.map((e) => e.word[0].toUpperCase())));

function readFav() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) { return new Set(); }
}
function speak(word) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US'; u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch (e) { /* speech not available */ }
}
const Icon = ({ d, size = 20, fill }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const I = {
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  x: 'M6 6l12 12M18 6L6 18',
  speaker: 'M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z',
};

/** The cover of the app: a plain English–Uzbek dictionary of the most useful words. Typing the secret word opens the real app. */
export default function DictionaryGate({ onUnlock }) {
  const [q, setQ] = useState('');
  const [fav, setFav] = useState(readFav);
  const [onlyFav, setOnlyFav] = useState(false);
  const listRef = useRef(null);

  const term = q.trim().toLowerCase();
  useEffect(() => {
    if (term !== SECRET) return undefined;
    const id = setTimeout(onUnlock, 180);
    return () => clearTimeout(id);
  }, [term, onUnlock]);

  const toggleFav = (e) => {
    const k = keyOf(e);
    setFav((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch (x) { /* storage blocked */ }
      return next;
    });
  };

  const shown = useMemo(() => {
    let list = SORTED;
    if (onlyFav) list = list.filter((e) => fav.has(keyOf(e)));
    if (term) {
      const starts = []; const rest = [];
      list.forEach((e) => {
        const w = e.word.toLowerCase();
        if (w.startsWith(term)) starts.push(e);
        else if (w.includes(term) || e.uz.toLowerCase().includes(term)) rest.push(e);
      });
      return starts.concat(rest);
    }
    return list;
  }, [term, onlyFav, fav]);

  const groups = useMemo(() => {
    if (term) return [{ letter: null, items: shown }];
    const out = []; let cur = null;
    shown.forEach((e) => {
      const L = e.word[0].toUpperCase();
      if (!cur || cur.letter !== L) { cur = { letter: L, items: [] }; out.push(cur); }
      cur.items.push(e);
    });
    return out;
  }, [shown, term]);

  // word of the day: the same word all day, a new one tomorrow
  const today = useMemo(() => {
    const d = new Date();
    const n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    return SORTED[(n * 7) % SORTED.length];
  }, []);

  const jump = (L) => {
    const el = listRef.current && listRef.current.querySelector('[data-letter="' + L + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="dg" role="main">
      <header className="dg-head">
        <div className="dg-brand"><span className="dg-logo" aria-hidden="true">Aa</span><div><h1>Dictionary</h1><p>Inglizcha–o‘zbekcha · eng kerakli so‘zlar</p></div></div>
        <label className="dg-search">
          <Icon d={I.search} />
          <input type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                 placeholder="So‘z qidirish…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="So‘z qidirish" />
          {q && <button type="button" className="dg-x" onClick={() => setQ('')} aria-label="Tozalash"><Icon d={I.x} size={16} /></button>}
        </label>
        <div className="dg-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!onlyFav} className={!onlyFav ? 'on' : ''} onClick={() => setOnlyFav(false)}>Hammasi <i>{ENTRIES.length}</i></button>
          <button type="button" role="tab" aria-selected={onlyFav} className={onlyFav ? 'on' : ''} onClick={() => setOnlyFav(true)}>Saralangan <i>{fav.size}</i></button>
        </div>
      </header>

      <div className="dg-body" ref={listRef}>
        {!term && !onlyFav && (
          <section className="dg-today">
            <span className="dg-kicker">Kun so‘zi</span>
            <div className="dg-today-row">
              <div><b>{today.word}</b><em>{POS_NAME[today.pos] || today.pos}</em><p>{today.uz}</p></div>
              <button type="button" className="dg-round" onClick={() => speak(today.word)} aria-label="Talaffuz"><Icon d={I.speaker} size={22} /></button>
            </div>
          </section>
        )}

        {shown.length === 0 ? (
          <p className="dg-empty">{onlyFav ? 'Saralangan so‘zlar hali yo‘q. So‘z yonidagi yulduzchani bosing.' : 'Hech narsa topilmadi.'}</p>
        ) : groups.map((g) => (
          <section key={g.letter || 'res'} data-letter={g.letter || undefined}>
            {g.letter && <h2 className="dg-letter">{g.letter}</h2>}
            <ul className="dg-list">
              {g.items.map((e) => (
                <li key={keyOf(e)} className="dg-row">
                  <div className="dg-main">
                    <div className="dg-w"><b>{e.word}</b><em>{POS_NAME[e.pos] || e.pos}</em></div>
                    <p>{e.uz}</p>
                  </div>
                  <button type="button" className="dg-ic" onClick={() => speak(e.word)} aria-label={'Talaffuz: ' + e.word}><Icon d={I.speaker} /></button>
                  <button type="button" className={'dg-ic star' + (fav.has(keyOf(e)) ? ' on' : '')} onClick={() => toggleFav(e)} aria-pressed={fav.has(keyOf(e))} aria-label="Saralash"><Icon d={I.star} fill={fav.has(keyOf(e))} /></button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="dg-foot">{shown.length} ta so‘z</div>
      </div>

      {!term && !onlyFav && (
        <nav className="dg-az" aria-label="Harflar">
          {LETTERS.map((L) => <button type="button" key={L} onClick={() => jump(L)}>{L}</button>)}
        </nav>
      )}
    </div>
  );
}
