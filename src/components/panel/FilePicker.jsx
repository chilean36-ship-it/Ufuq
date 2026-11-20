import { useEffect, useState } from 'react';
import { usePanel } from './PanelContext';
import PageStyle from '../PageStyle';

const css = `
  .fp{position:relative; display:flex; align-items:center; gap:14px; width:100%; padding:14px 16px; border-radius:18px; border:1.5px dashed color-mix(in srgb,var(--gold) 55%,var(--line)); background:linear-gradient(160deg,color-mix(in srgb,var(--gold) 9%,var(--bg-3)),var(--bg-3)); color:var(--text); cursor:pointer; text-align:start; font-family:inherit; transition:border-color .2s, background .2s, transform .18s cubic-bezier(.3,1.6,.5,1);}
  .fp:hover,.fp.drag{border-color:var(--gold-bright); background:color-mix(in srgb,var(--gold) 14%,var(--bg-3));}
  .fp:active{transform:scale(.985);}
  .fp-ic{flex:none; width:46px; height:46px; border-radius:15px; display:grid; place-items:center; background:linear-gradient(145deg,#F3D77E,#C9A24B 60%,#B98B3E); color:#1a1405; box-shadow:0 10px 20px -10px rgba(201,162,75,.9);}
  .fp-ic svg{width:23px; height:23px;}
  .fp-t{flex:1; min-width:0; display:flex; flex-direction:column; gap:3px;}
  .fp-t b{font-size:15px; font-weight:700;}
  .fp-t small{font-size:12.5px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .fp.has .fp-t small{color:var(--gold-bright); font-weight:600;}
  .fp-thumb{flex:none; width:46px; height:46px; border-radius:12px; object-fit:cover; border:1px solid var(--line);}
  .fp-go{flex:none; padding:7px 13px; border-radius:99px; background:var(--gold); color:#1a1405; font-size:12.5px; font-weight:800;}
`;

const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/**
 * A clear upload button instead of the browser's own "Choose file / No file chosen" input.
 * `inputRef` is the hidden <input type="file"> (read `inputRef.current.files[0]` on submit). `resetKey` clears the choice (e.g. when a dialog reopens).
 */
export default function FilePicker({ inputRef, accept, label, current, resetKey, onFile, preview }) {
  const { t } = usePanel();
  const [file, setFile] = useState(null);
  const [thumb, setThumb] = useState('');
  const [drag, setDrag] = useState(false);

  useEffect(() => { setFile(null); setThumb(''); if (inputRef.current) inputRef.current.value = ''; }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

  const pick = (f) => {
    setFile(f || null);
    setThumb((old) => { if (old) URL.revokeObjectURL(old); return f && preview ? URL.createObjectURL(f) : ''; });
    if (onFile) onFile(f || null);
  };
  const open = () => inputRef.current && inputRef.current.click();
  const drop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !inputRef.current) return;
    try { const dt = new DataTransfer(); dt.items.add(f); inputRef.current.files = dt.files; pick(f); } catch (err) { /* browser without DataTransfer: tap to choose instead */ }
  };

  return (
    <>
      <PageStyle css={css} />
      <input type="file" accept={accept} ref={inputRef} style={{ display: 'none' }} onChange={(e) => pick(e.target.files && e.target.files[0])} />
      <button type="button" className={'fp' + (file ? ' has' : '') + (drag ? ' drag' : '')} onClick={open}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={drop}>
        {thumb ? <img className="fp-thumb" src={thumb} alt="" /> : (
          <span className="fp-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" /></svg>
          </span>
        )}
        <span className="fp-t">
          <b>{file ? t('Change file') : label}</b>
          <small>{file ? file.name + ' · ' + fmtSize(file.size) : (current ? t('The current file stays unless you choose a new one.') : t('Tap here or drop a file'))}</small>
        </span>
        {!file && <span className="fp-go">{t('Choose')}</span>}
      </button>
    </>
  );
}
