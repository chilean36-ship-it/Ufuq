import { renderToStaticMarkup } from 'react-dom/server';
import { CERT_W, CERT_H, THEMES, SERIF, SANS, ARABIC, Khatam, CornerOrnament, Seal } from './certDesign';

export { CERT_W, CERT_H };

/* The certificate itself: a 1400 × 990 SVG (A4 landscape), drawn rather than photographed, so it stays sharp at any size and
   exports to PNG / prints cleanly. `logo` is a data URL, so the export has no external dependencies. */
export default function Certificate({ name, levelNo, levelName, place, points, max, date, number, logo }) {
  const th = THEMES[place] || THEMES[1];
  const id = 'c' + place;
  const g = `g${id}`;
  const W = CERT_W, H = CERT_H, M = W / 2;
  const shownName = String(name || '').trim() || 'Student';
  const nameSize = shownName.length > 30 ? 50 : shownName.length > 22 ? 60 : shownName.length > 16 ? 70 : 80;
  const stars = Array.from({ length: 6 }, (_, i) => i);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
         aria-label={`${th.label} · Level ${levelNo} · ${shownName}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={th.a} /><stop offset=".45" stopColor={th.b} /><stop offset="1" stopColor={th.c} />
        </linearGradient>
        <radialGradient id={`bg${id}`} cx=".5" cy=".45" r=".8">
          <stop offset="0" stopColor={th.paper1} /><stop offset=".65" stopColor={th.paper2} /><stop offset="1" stopColor={th.paper3} />
        </radialGradient>
        <pattern id={`pt${id}`} width="64" height="64" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={th.b} strokeOpacity=".16" strokeWidth="1">
            <rect x="14" y="14" width="36" height="36" /><rect x="14" y="14" width="36" height="36" transform="rotate(45 32 32)" />
            <circle cx="32" cy="32" r="6" />
          </g>
        </pattern>
      </defs>

      <rect width={W} height={H} fill={`url(#bg${id})`} />
      <rect width={W} height={H} fill={`url(#pt${id})`} />
      {/* large faint star behind the text */}
      <Khatam cx={M} cy={H / 2 + 10} r={330} stroke={th.b} sw={1.2} opacity=".14" />
      <Khatam cx={M} cy={H / 2 + 10} r={250} stroke={th.b} sw={1} opacity=".12" />

      {/* frames */}
      <rect x="26" y="26" width={W - 52} height={H - 52} fill="none" stroke={`url(#${g})`} strokeWidth="9" />
      <rect x="46" y="46" width={W - 92} height={H - 92} fill="none" stroke={`url(#${g})`} strokeWidth="2" />
      <rect x="58" y="58" width={W - 116} height={H - 116} fill="none" stroke={th.b} strokeOpacity=".55" strokeWidth="1" strokeDasharray="2 6" />
      <CornerOrnament x={46} y={46} sx={1} sy={1} g={g} />
      <CornerOrnament x={W - 46} y={46} sx={-1} sy={1} g={g} />
      <CornerOrnament x={46} y={H - 46} sx={1} sy={-1} g={g} />
      <CornerOrnament x={W - 46} y={H - 46} sx={-1} sy={-1} g={g} />
      {[M - 300, M + 300].map((x) => <Khatam key={x} cx={x} cy={46} r={10} fill={`url(#${g})`} />)}
      {[M - 300, M + 300].map((x) => <Khatam key={'b' + x} cx={x} cy={H - 46} r={10} fill={`url(#${g})`} />)}

      {/* header: logo in a ring + wordmark */}
      <circle cx={M} cy="136" r="62" fill={th.paper1} stroke={`url(#${g})`} strokeWidth="4" />
      <circle cx={M} cy="136" r="54" fill="none" stroke={th.b} strokeOpacity=".5" strokeWidth="1" strokeDasharray="2 4" />
      {logo && <image href={logo} xlinkHref={logo} x={M - 38} y="98" width="76" height="76" preserveAspectRatio="xMidYMid meet" />}
      <text x={M} y="238" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="30" letterSpacing="16" fill={th.c}>UFUQ</text>
      <text x={M} y="262" textAnchor="middle" fontFamily={SANS} fontWeight="600" fontSize="12" letterSpacing="6" fill={th.ink} fillOpacity=".55">ARABIC LANGUAGE ACADEMY</text>

      {/* title */}
      <text x={M} y="336" textAnchor="middle" fontFamily={SERIF} fontWeight="600" fontSize="80" letterSpacing="12" fill={th.ink}>CERTIFICATE</text>
      <text x={M} y="378" textAnchor="middle" fontFamily={SANS} fontWeight="600" fontSize="19" letterSpacing="14" fill={th.c}>OF ACHIEVEMENT</text>

      {/* place ribbon */}
      <g transform={`translate(${M} 420)`}>
        <path d="M-210 -22 H210 L190 0 L210 22 H-210 L-190 0 Z" fill={`url(#${g})`} />
        <path d="M-210 -22 H210 L190 0 L210 22 H-210 L-190 0 Z" fill="none" stroke={th.ink} strokeOpacity=".25" strokeWidth="1" />
        <text y="7" textAnchor="middle" fontFamily={SANS} fontWeight="800" fontSize="19" letterSpacing="9" fill={th.ink}>{th.label}</text>
      </g>

      <text x={M} y="494" textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize="22" fill={th.ink} fillOpacity=".7">This certificate is proudly presented to</text>
      <text x={M} y="580" textAnchor="middle" fontFamily={SERIF} fontWeight="600" fontSize={nameSize} fill={th.ink}>{shownName}</text>
      <path d={`M${M - 340} 606 H${M - 22} M${M + 22} 606 H${M + 340}`} stroke={`url(#${g})`} strokeWidth="1.8" />
      <Khatam cx={M} cy={606} r={11} fill={`url(#${g})`} />

      <text x={M} y="654" textAnchor="middle" fontFamily={SERIF} fontSize="22" fill={th.ink} fillOpacity=".78">for outstanding results in</text>
      <text x={M} y="698" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="38" fill={th.c}>Level {levelNo} · {levelName}</text>
      <text x={M} y="734" textAnchor="middle" fontFamily={SANS} fontSize="17" letterSpacing="1" fill={th.ink} fillOpacity=".72">
        Midterm + Final: <tspan fontWeight="700" fill={th.ink} fillOpacity="1">{points} / {max} points</tspan>
      </text>
      <text x={M} y="772" textAnchor="middle" fontFamily={ARABIC} fontSize="30" fill={th.c}>{th.ar}</text>

      <Seal cx={M} cy={850} th={th} g={g} place={place} />

      {/* footer: date and signature */}
      <g fontFamily={SANS} fill={th.ink}>
        <path d="M150 884 H430" stroke={th.b} strokeWidth="1.5" />
        <text x="290" y="876" textAnchor="middle" fontFamily={SERIF} fontSize="22">{date}</text>
        <text x="290" y="910" textAnchor="middle" fontSize="11.5" letterSpacing="4" fillOpacity=".55">DATE OF ISSUE</text>
        <path d="M970 884 H1250" stroke={th.b} strokeWidth="1.5" />
        <text x="1110" y="868" textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize="32" fill={th.c}>Ali Hifniy</text>
        <text x="1110" y="910" textAnchor="middle" fontSize="11.5" letterSpacing="4" fillOpacity=".55">USTAZ · FOUNDER OF UFUQ</text>
      </g>
      {stars.map((i) => <Khatam key={i} cx={M - 110 + i * 44} cy={H - 70} r={5} fill={th.b} opacity=".5" />)}
      <text x={M} y={H - 46} textAnchor="middle" fontFamily={SANS} fontSize="10.5" letterSpacing="3" fill={th.ink} fillOpacity=".45">CERTIFICATE No. {number}</text>
    </svg>
  );
}

export const certificateMarkup = (props) => renderToStaticMarkup(<Certificate {...props} />);

/** Fetch the logo once and keep it as a data URL (needed for PNG export / print window). */
let logoCache = null;
export async function loadLogo() {
  if (logoCache) return logoCache;
  try {
    const blob = await (await fetch('/assets/images/logo-mark.png')).blob();
    logoCache = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
  } catch (e) { logoCache = null; }
  return logoCache;
}

/** Render the certificate to a PNG blob (2800 × 1980). */
export async function certificateToPng(props) {
  const svg = certificateMarkup(props);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = CERT_W * 2; canvas.height = CERT_H * 2;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob(res, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

/** Open the browser print dialog with only the certificate on an A4 landscape page ("Save as PDF" works there too). */
export function printCertificate(props) {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ufuq certificate</title>
<style>@page{size:A4 landscape;margin:0}html,body{margin:0;background:#fff}svg{width:100vw;height:auto;display:block}</style></head>
<body>${certificateMarkup(props)}<script>window.onload=function(){setTimeout(function(){window.print();},250)}</script></body></html>`);
  w.document.close();
  return true;
}
