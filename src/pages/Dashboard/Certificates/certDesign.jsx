/* Drawing parts of the certificate (kept apart from the export helpers in Certificate.jsx). */
export const CERT_W = 1400;
export const CERT_H = 990;

export const THEMES = {
  1: { a: '#F6E3A1', b: '#C9A24B', c: '#8A6516', ink: '#2F2208', paper1: '#FFFDF7', paper2: '#F7EFD9', paper3: '#EBDDB6', label: 'FIRST PLACE', ar: 'المركز الأول' },
  2: { a: '#F4F6F9', b: '#B3BCC8', c: '#66707E', ink: '#1F2530', paper1: '#FFFFFF', paper2: '#F2F4F7', paper3: '#DFE4EA', label: 'SECOND PLACE', ar: 'المركز الثاني' },
};
export const SERIF = "Fraunces, 'Playfair Display', Georgia, 'Times New Roman', serif";
export const SANS = "Inter, 'Segoe UI', Arial, sans-serif";
export const ARABIC = "Amiri, 'Noto Naskh Arabic', 'Traditional Arabic', serif";

export const LEVEL_NAMES_AR = ['المبتدئ', 'الأساسي', 'ما قبل المتوسط', 'المتوسط', 'فوق المتوسط', 'المتقدّم', 'المتمكّن', 'الإتقان', 'الخبير', 'العالِم', 'المتميّز', 'النخبة', 'الحكيم', 'المنير'];
export const levelNameAr = (n) => LEVEL_NAMES_AR[Math.max(0, Number(n) - 1)] || '';

/** Eight-pointed Islamic star (khatam): two squares rotated 45 degrees. */
export function Khatam({ cx, cy, r, fill, stroke, sw = 1.6, opacity = 1 }) {
  const q = r;
  return (
    <g transform={`translate(${cx} ${cy})`} fill={fill || 'none'} stroke={stroke || 'none'} strokeWidth={sw} opacity={opacity}>
      <rect x={-q / 1.414} y={-q / 1.414} width={q * 1.414} height={q * 1.414} />
      <rect x={-q / 1.414} y={-q / 1.414} width={q * 1.414} height={q * 1.414} transform="rotate(45)" />
    </g>
  );
}

export function CornerOrnament({ x, y, sx, sy, g }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} ${sy})`}>
      <g fill="none" stroke={`url(#${g})`} strokeLinecap="round">
        <path d="M0 0 H120 M0 0 V120" strokeWidth="5" />
        <path d="M18 18 H96 M18 18 V96" strokeWidth="1.6" />
        <path d="M34 34 H72 M34 34 V72" strokeWidth="1" />
        <path d="M128 0 q16 18 0 36 M0 128 q18 16 36 0" strokeWidth="2" />
      </g>
      <Khatam cx={46} cy={46} r={30} stroke={`url(#${g})`} sw={2} />
      <Khatam cx={46} cy={46} r={14} fill={`url(#${g})`} />
    </g>
  );
}

/** Laurel branch curving around the seal; `flip` mirrors it for the other side. */
export function Laurel({ cx, cy, flip, g }) {
  const leaves = Array.from({ length: 11 }, (_, i) => i);
  return (
    <g transform={`translate(${cx} ${cy}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M-4 92 C-80 78 -112 20 -102 -52" fill="none" stroke={`url(#${g})`} strokeWidth="3" strokeLinecap="round" />
      {leaves.map((i) => {
        const t = i / 10;
        const px = -4 - 98 * Math.sin(t * 1.45) - 2 * i;
        const py = 92 - 144 * t;
        const rot = -40 - t * 70;
        return (
          <g key={i}>
            <ellipse cx={px - 7} cy={py} rx="19" ry="7.5" transform={`rotate(${rot} ${px} ${py})`} fill={`url(#${g})`} />
            <ellipse cx={px + 7} cy={py + 6} rx="15" ry="6" transform={`rotate(${rot + 85} ${px} ${py})`} fill={`url(#${g})`} opacity=".8" />
          </g>
        );
      })}
    </g>
  );
}

export function Seal({ cx, cy, th, g, place }) {
  const rays = Array.from({ length: 32 }, (_, i) => i);
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <Laurel cx={0} cy={4} g={g} />
      <Laurel cx={0} cy={4} flip g={g} />
      <path d="M-30 40 L-46 104 L-23 93 L-6 110 L8 52 Z" fill={th.c} />
      <path d="M30 40 L46 104 L23 93 L6 110 L-8 52 Z" fill={th.b} />
      {rays.map((i) => <path key={i} d="M0 -66 L6 -50 L-6 -50 Z" fill={`url(#${g})`} transform={`rotate(${i * 11.25})`} />)}
      <circle r="54" fill={`url(#${g})`} />
      <circle r="45" fill="none" stroke={th.ink} strokeOpacity=".4" strokeWidth="1.4" strokeDasharray="1.5 5" />
      <circle r="39" fill={th.a} fillOpacity=".5" />
      <Khatam cx={0} cy={0} r={32} stroke={th.ink} sw={1} opacity=".25" />
      <text y="15" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="44" fill={th.ink}>{place}</text>
    </g>
  );
}
