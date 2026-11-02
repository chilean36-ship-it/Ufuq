import { renderToStaticMarkup } from 'react-dom/server';

/* The certificate itself: a 1400 × 990 SVG (A4 landscape). It is drawn, not photographed, so it stays sharp at any
   size and can be exported to PNG or printed. `logo` is a data URL so the export has no external dependencies. */
export const CERT_W = 1400;
export const CERT_H = 990;

const THEMES = {
  1: { a: '#F3DC93', b: '#C9A24B', c: '#8E6A1F', ink: '#3A2A08', label: 'FIRST PLACE', ar: 'المركز الأول', glow: '#E5C878' },
  2: { a: '#F1F3F6', b: '#B6BEC9', c: '#6E7886', ink: '#262C36', label: 'SECOND PLACE', ar: 'المركز الثاني', glow: '#CBD3DD' },
};
const SERIF = "Fraunces, 'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "Inter, 'Segoe UI', Arial, sans-serif";
const ARABIC = "Amiri, 'Noto Naskh Arabic', 'Traditional Arabic', serif";

function Corner({ x, y, sx, sy, id }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} ${sy})`} fill="none" stroke={`url(#g${id})`} strokeWidth="2.2" strokeLinecap="round">
      <path d="M0 0 H92 M0 0 V92" strokeWidth="4" />
      <path d="M16 16 H70 M16 16 V70" />
      <path d="M30 30 q34 0 34 34" />
      <circle cx="30" cy="30" r="5" fill={`url(#g${id})`} stroke="none" />
      <path d="M100 0 q14 14 0 28 M0 100 q14 14 28 0" />
    </g>
  );
}

function Rosette({ cx, cy, theme, id, place }) {
  const rays = Array.from({ length: 24 }, (_, i) => i);
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <path d="M-34 40 L-52 118 L-26 104 L-8 126 L6 50 Z" fill={theme.c} />
      <path d="M34 40 L52 118 L26 104 L8 126 L-6 50 Z" fill={theme.b} />
      {rays.map((i) => (
        <path key={i} d="M0 -70 L8 -52 L-8 -52 Z" fill={`url(#g${id})`} transform={`rotate(${i * 15})`} />
      ))}
      <circle r="56" fill={`url(#g${id})`} />
      <circle r="46" fill="none" stroke={theme.ink} strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="2 5" />
      <circle r="40" fill={theme.a} fillOpacity=".55" />
      <text y="16" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="46" fill={theme.ink}>{place}</text>
    </g>
  );
}

export default function Certificate({ name, levelNo, levelName, place, points, max, date, number, logo }) {
  const th = THEMES[place] || THEMES[1];
  const id = 'c' + place;
  const shownName = String(name || '').trim() || 'Student';
  const nameSize = shownName.length > 28 ? 52 : shownName.length > 20 ? 64 : 78;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox={`0 0 ${CERT_W} ${CERT_H}`} width="100%" role="img"
         aria-label={`${th.label} · Level ${levelNo} · ${shownName}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={th.a} /><stop offset=".5" stopColor={th.b} /><stop offset="1" stopColor={th.c} />
        </linearGradient>
        <radialGradient id={`bg${id}`} cx=".5" cy=".42" r=".75">
          <stop offset="0" stopColor="#FFFDF6" /><stop offset=".7" stopColor="#FAF4E4" /><stop offset="1" stopColor="#F1E7CC" />
        </radialGradient>
        <pattern id={`pt${id}`} width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M23 0 L46 23 L23 46 L0 23 Z" fill="none" stroke={th.b} strokeOpacity=".10" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width={CERT_W} height={CERT_H} fill={`url(#bg${id})`} />
      <rect width={CERT_W} height={CERT_H} fill={`url(#pt${id})`} />
      <rect x="28" y="28" width={CERT_W - 56} height={CERT_H - 56} fill="none" stroke={`url(#g${id})`} strokeWidth="10" />
      <rect x="50" y="50" width={CERT_W - 100} height={CERT_H - 100} fill="none" stroke={`url(#g${id})`} strokeWidth="2" />
      <rect x="62" y="62" width={CERT_W - 124} height={CERT_H - 124} fill="none" stroke={th.b} strokeOpacity=".5" strokeWidth="1" />
      <Corner x={50} y={50} sx={1} sy={1} id={id} />
      <Corner x={CERT_W - 50} y={50} sx={-1} sy={1} id={id} />
      <Corner x={50} y={CERT_H - 50} sx={1} sy={-1} id={id} />
      <Corner x={CERT_W - 50} y={CERT_H - 50} sx={-1} sy={-1} id={id} />

      {/* header: logo + wordmark */}
      {logo && <image href={logo} xlinkHref={logo} x={CERT_W / 2 - 46} y="92" width="92" height="92" preserveAspectRatio="xMidYMid meet" />}
      <text x={CERT_W / 2} y="214" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="30" letterSpacing="12" fill={th.c}>UFUQ</text>
      <text x={CERT_W / 2} y="240" textAnchor="middle" fontFamily={SANS} fontSize="12.5" letterSpacing="5" fill={th.ink} fillOpacity=".6">ARABIC LANGUAGE ACADEMY</text>

      <text x={CERT_W / 2} y="326" textAnchor="middle" fontFamily={SERIF} fontWeight="600" fontSize="68" letterSpacing="6" fill={th.ink}>CERTIFICATE</text>
      <text x={CERT_W / 2} y="368" textAnchor="middle" fontFamily={SANS} fontWeight="600" fontSize="17" letterSpacing="9" fill={th.c}>OF ACHIEVEMENT · {th.label}</text>
      <path d={`M${CERT_W / 2 - 150} 392 H${CERT_W / 2 - 14} M${CERT_W / 2 + 14} 392 H${CERT_W / 2 + 150}`} stroke={`url(#g${id})`} strokeWidth="2" />
      <path d={`M${CERT_W / 2} 384 l8 8 -8 8 -8 -8 z`} fill={`url(#g${id})`} />

      <text x={CERT_W / 2} y="446" textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize="21" fill={th.ink} fillOpacity=".7">This certificate is proudly presented to</text>
      <text x={CERT_W / 2} y="540" textAnchor="middle" fontFamily={SERIF} fontWeight="600" fontSize={nameSize} fill={th.ink}>{shownName}</text>
      <path d={`M${CERT_W / 2 - 330} 566 H${CERT_W / 2 + 330}`} stroke={`url(#g${id})`} strokeWidth="2" />

      <text x={CERT_W / 2} y="618" textAnchor="middle" fontFamily={SERIF} fontSize="22" fill={th.ink} fillOpacity=".78">for outstanding results in</text>
      <text x={CERT_W / 2} y="668" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="38" fill={th.c}>Level {levelNo} · {levelName}</text>
      <text x={CERT_W / 2} y="712" textAnchor="middle" fontFamily={SANS} fontSize="18" letterSpacing="1" fill={th.ink} fillOpacity=".75">
        Midterm + Final total: <tspan fontWeight="700" fill={th.ink} fillOpacity="1">{points} / {max} points</tspan>
      </text>
      <text x={CERT_W / 2} y="760" textAnchor="middle" fontFamily={ARABIC} fontSize="30" fill={th.c}>{th.ar}</text>

      <Rosette cx={CERT_W / 2} cy={850} theme={th} id={id} place={place} />

      {/* footer: date, seal, signature */}
      <g fontFamily={SANS} fill={th.ink}>
        <path d="M150 886 H430" stroke={th.b} strokeWidth="1.5" />
        <text x="290" y="878" textAnchor="middle" fontFamily={SERIF} fontSize="22">{date}</text>
        <text x="290" y="914" textAnchor="middle" fontSize="12" letterSpacing="4" fillOpacity=".6">DATE OF ISSUE</text>
        <path d="M970 886 H1250" stroke={th.b} strokeWidth="1.5" />
        <text x="1110" y="872" textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize="30" fill={th.c}>Ali Hifniy</text>
        <text x="1110" y="914" textAnchor="middle" fontSize="12" letterSpacing="4" fillOpacity=".6">USTAZ · UFUQ</text>
      </g>
      <text x={CERT_W / 2} y={CERT_H - 70} textAnchor="middle" fontFamily={SANS} fontSize="11" letterSpacing="3" fill={th.ink} fillOpacity=".45">CERTIFICATE No. {number}</text>
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
