import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageStyle from '../../components/PageStyle';
import LangSelect from '../../components/LangSelect';
import tokensCss from '../../styles/tokens.css?inline';
import { useI18n } from '../../context/I18nContext';
import { supabase } from '../../lib/supabaseClient';
import { normalizeSerial, looksLikeSerial } from '../../lib/certVerify';
import { levelNameAr } from '../Dashboard/Certificates/certDesign';

/* Public page: anybody (no account) can check a Ufuq certificate by its serial, or by scanning the QR code printed on it.
   It only shows what the certificate itself shows: name, level, place, score and date. */

const T = {
  EN: { title: 'Verify a certificate', lead: 'Enter the serial number printed at the bottom of the certificate, or scan its QR code.', ph: 'UFQ-XXXXX-XXXXX', check: 'Check', checking: 'Checking…',
        ok: 'This certificate is genuine', holder: 'Awarded to', level: 'Level', placeL: 'Place', place: ['', '1st place', '2nd place', '3rd place'], score: 'Score', date: 'Issued', serial: 'Serial',
        notFound: 'No certificate with this number was found. It may be forged or mistyped.', revoked: 'This certificate was cancelled and is no longer valid.', bad: 'The number must look like UFQ-XXXXX-XXXXX.',
        err: 'Could not check right now. Try again.', compare: 'Compare the name, level, place and score above with the certificate in your hands. If anything differs, the certificate is not genuine.', home: 'Ufuq' },
  UZ: { title: 'Sertifikatni tekshirish', lead: 'Sertifikat pastidagi seriya raqamini kiriting yoki undagi QR kodni skanerlang.', ph: 'UFQ-XXXXX-XXXXX', check: 'Tekshirish', checking: 'Tekshirilmoqda…',
        ok: 'Bu sertifikat haqiqiy', holder: 'Sertifikat egasi', level: 'Daraja', placeL: "O'rin", place: ['', '1-o\'rin', '2-o\'rin', '3-o\'rin'], score: 'Ball', date: 'Berilgan sana', serial: 'Seriya raqami',
        notFound: 'Bu raqamli sertifikat topilmadi. U soxta yoki raqam xato yozilgan bo\'lishi mumkin.', revoked: 'Bu sertifikat bekor qilingan, endi haqiqiy emas.', bad: 'Raqam UFQ-XXXXX-XXXXX ko\'rinishida bo\'lishi kerak.',
        err: 'Hozir tekshirib bo\'lmadi. Qayta urinib ko\'ring.', compare: 'Yuqoridagi ism, daraja, o\'rin va ballni qo\'lingizdagi sertifikat bilan solishtiring. Biror joyi farq qilsa, sertifikat haqiqiy emas.', home: 'Ufuq' },
  RU: { title: 'Проверка сертификата', lead: 'Введите серийный номер внизу сертификата или отсканируйте QR-код на нём.', ph: 'UFQ-XXXXX-XXXXX', check: 'Проверить', checking: 'Проверяем…',
        ok: 'Сертификат подлинный', holder: 'Выдан', level: 'Уровень', placeL: 'Место', place: ['', '1 место', '2 место', '3 место'], score: 'Баллы', date: 'Дата выдачи', serial: 'Серийный номер',
        notFound: 'Сертификат с таким номером не найден. Возможно, он поддельный или номер введён с ошибкой.', revoked: 'Сертификат аннулирован и больше не действителен.', bad: 'Номер должен выглядеть так: UFQ-XXXXX-XXXXX.',
        err: 'Сейчас проверить не удалось. Попробуйте ещё раз.', compare: 'Сравните имя, уровень, место и баллы выше с сертификатом на руках. Если что-то отличается, сертификат не подлинный.', home: 'Ufuq' },
  AR: { title: 'التحقق من الشهادة', lead: 'أدخل الرقم التسلسلي المطبوع أسفل الشهادة أو امسح رمز QR الموجود عليها.', ph: 'UFQ-XXXXX-XXXXX', check: 'تحقق', checking: 'جارٍ التحقق…',
        ok: 'هذه الشهادة أصلية', holder: 'مُنحت إلى', level: 'المستوى', placeL: 'المركز', place: ['', 'المركز الأول', 'المركز الثاني', 'المركز الثالث'], score: 'النقاط', date: 'تاريخ الإصدار', serial: 'الرقم التسلسلي',
        notFound: 'لم يتم العثور على شهادة بهذا الرقم. قد تكون مزوَّرة أو أن الرقم مكتوب بشكل خاطئ.', revoked: 'تم إلغاء هذه الشهادة ولم تعد صالحة.', bad: 'يجب أن يكون الرقم بالشكل UFQ-XXXXX-XXXXX.',
        err: 'تعذّر التحقق الآن. حاول مرة أخرى.', compare: 'قارن الاسم والمستوى والمركز والنقاط أعلاه بالشهادة التي بين يديك. إذا اختلف أي شيء فالشهادة غير أصلية.', home: 'Ufuq' },
};

const CSS = `
  *{box-sizing:border-box}
  html,body{height:auto !important;min-height:100%;overflow:visible !important;overflow-x:clip !important;}
  body{margin:0;background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;}
  a{color:inherit;text-decoration:none;}
  .vf-top{border-bottom:1px solid var(--line);}
  .vf-top-in{max-width:760px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;}
  .vf-logo{display:flex;align-items:center;gap:9px;}
  .vf-logo img{height:28px;width:auto;}
  .vf-logo span{font-family:'Fraunces',serif;font-size:19px;font-weight:600;}
  .vf-wrap{max-width:760px;margin:0 auto;padding:44px 20px 60px;}
  .vf-wrap h1{font-family:'Fraunces',serif;font-weight:500;font-size:clamp(28px,5vw,40px);margin:0 0 10px;letter-spacing:-.01em;}
  .vf-lead{color:var(--text-muted);margin:0 0 24px;}
  .vf-form{display:flex;gap:10px;flex-wrap:wrap;}
  .vf-input{flex:1 1 240px;min-width:0;padding:14px 16px;border-radius:12px;border:1px solid var(--line);background:var(--bg-2);color:var(--text);font:600 17px 'Inter',sans-serif;letter-spacing:.06em;text-transform:uppercase;direction:ltr;text-align:left;}
  .vf-input:focus{outline:2px solid var(--gold-bright);outline-offset:2px;}
  .vf-btn{padding:14px 26px;border-radius:12px;border:none;cursor:pointer;font:700 15px 'Inter',sans-serif;color:var(--bg);background:linear-gradient(180deg,var(--gold-bright),var(--gold));}
  .vf-btn:disabled{opacity:.6;cursor:default;}
  .vf-res{margin-top:28px;border-radius:20px;padding:28px 26px;border:1px solid var(--line);background:var(--bg-2);}
  .vf-res.ok{border-color:rgba(90,200,140,.55);background:radial-gradient(520px 200px at 50% 0%,rgba(90,200,140,.12),transparent 70%),var(--bg-2);}
  .vf-res.bad{border-color:rgba(230,100,90,.55);}
  .vf-badge{display:flex;align-items:center;gap:12px;font:700 19px 'Inter',sans-serif;margin-bottom:18px;}
  .vf-ico{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;font-size:19px;color:#0c1a12;background:#5ac88c;}
  .vf-res.bad .vf-ico{background:#e6645a;color:#2a0a07;}
  .vf-lbl{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);}
  .vf-name{font-family:'Fraunces',serif;font-size:clamp(24px,5vw,34px);margin:2px 0 16px;word-break:break-word;}
  .vf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:0;}
  .vf-grid dt{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);margin:0 0 2px;}
  .vf-grid dd{margin:0;font-size:17px;font-weight:600;}
  .vf-note{margin:20px 0 0;color:var(--text-muted);font-size:14px;}
  [dir="rtl"] .vf-input{text-align:left;}
`;

export default function VerifyCertificate() {
  const { serial: param } = useParams();
  const nav = useNavigate();
  const { lang } = useI18n();
  const t = T[lang] || T.EN;
  const [input, setInput] = useState(normalizeSerial(param || ''));
  const [tick, setTick] = useState(0);   // re-check the same serial
  const [state, setState] = useState({ kind: 'idle' });   // idle | loading | ok | revoked | none | bad | error

  useEffect(() => {
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex';
    document.head.appendChild(m);
    return () => { document.head.removeChild(m); };
  }, []);

  useEffect(() => {
    const s = normalizeSerial(param || '');
    setInput(s);
    if (!s) { setState({ kind: 'idle' }); return undefined; }
    if (!looksLikeSerial(s)) { setState({ kind: 'bad' }); return undefined; }
    let alive = true;
    setState({ kind: 'loading' });
    (async () => {
      const { data, error } = await supabase.rpc('verify_certificate', { p_serial: s });
      if (!alive) return;
      if (error) { setState({ kind: 'error' }); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) setState({ kind: 'none' });
      else setState({ kind: row.revoked ? 'revoked' : 'ok', row });
    })();
    return () => { alive = false; };
  }, [param, tick]);

  const submit = (e) => {
    e.preventDefault();
    const s = normalizeSerial(input);
    if (!s) return;
    if (normalizeSerial(param || '') === s) { setTick((n) => n + 1); return; }
    nav(`/verify/${encodeURIComponent(s)}`);
  };

  const row = state.row;
  const date = row ? new Date(row.issued_at).toLocaleDateString(lang === 'AR' ? 'ar-u-nu-latn' : lang === 'RU' ? 'ru-RU' : lang === 'UZ' ? 'uz-UZ' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <>
      <PageStyle css={tokensCss} />
      <PageStyle css={CSS} />
      <header className="vf-top">
        <div className="vf-top-in">
          <Link to="/index" className="vf-logo" aria-label="Ufuq"><img src="/assets/images/img-01.webp" alt="" /><span>{t.home}</span></Link>
          <LangSelect />
        </div>
      </header>
      <main className="vf-wrap">
        <h1>{t.title}</h1>
        <p className="vf-lead">{t.lead}</p>
        <form className="vf-form" onSubmit={submit}>
          <input className="vf-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.ph} aria-label={t.serial}
                 autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={32} />
          <button className="vf-btn" type="submit" disabled={state.kind === 'loading'}>{state.kind === 'loading' ? t.checking : t.check}</button>
        </form>

        {state.kind === 'ok' && row && (
          <section className="vf-res ok" role="status">
            <div className="vf-badge"><span className="vf-ico" aria-hidden="true">✓</span>{t.ok}</div>
            <div className="vf-lbl">{t.holder}</div>
            <div className="vf-name">{row.holder_name}</div>
            <dl className="vf-grid">
              <div><dt>{t.level}</dt><dd>{row.level} · {levelNameAr(row.level)}</dd></div>
              <div><dt>{t.placeL}</dt><dd>{t.place[row.place] || row.place}</dd></div>
              <div><dt>{t.score}</dt><dd>{Number(row.total_points)} / {row.max_points}</dd></div>
              <div><dt>{t.date}</dt><dd>{date}</dd></div>
              <div><dt>{t.serial}</dt><dd style={{ direction: 'ltr' }}>{normalizeSerial(param)}</dd></div>
            </dl>
            <p className="vf-note">{t.compare}</p>
          </section>
        )}
        {state.kind === 'revoked' && <section className="vf-res bad" role="alert"><div className="vf-badge"><span className="vf-ico" aria-hidden="true">!</span>{t.revoked}</div></section>}
        {state.kind === 'none' && <section className="vf-res bad" role="alert"><div className="vf-badge"><span className="vf-ico" aria-hidden="true">✕</span>{t.notFound}</div></section>}
        {state.kind === 'bad' && <section className="vf-res bad" role="alert"><div className="vf-badge"><span className="vf-ico" aria-hidden="true">✕</span>{t.bad}</div></section>}
        {state.kind === 'error' && <section className="vf-res bad" role="alert"><div className="vf-badge"><span className="vf-ico" aria-hidden="true">!</span>{t.err}</div></section>}
      </main>
    </>
  );
}
