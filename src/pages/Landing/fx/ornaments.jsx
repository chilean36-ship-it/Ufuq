/* Decorative SVG: sand dunes (section dividers), . */
const GRAINS = [[120, 52], [310, 38], [470, 66], [640, 30], [790, 58], [960, 40], [1120, 70], [1290, 34], [1390, 60]];

export function SandDivider({ className = '' }) {
  return (
    <div className={('fx-dunes ' + className).trim()} aria-hidden="true">
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none">
        <g className="d d1"><path d="M-80 66 C 120 18 300 22 520 60 S 900 104 1100 58 S 1400 26 1520 56 V120 H-80Z" /></g>
        <g className="d d2"><path d="M-80 84 C 160 44 360 52 560 82 S 940 112 1160 78 S 1420 54 1520 76 V120 H-80Z" /></g>
        <g className="d d3"><path d="M-80 100 C 200 74 420 80 640 98 S 1000 116 1220 96 S 1440 84 1520 96 V120 H-80Z" /><path className="crest" d="M-80 100 C 200 74 420 80 640 98 S 1000 116 1220 96 S 1440 84 1520 96" /></g>
        {GRAINS.map(([x, y], i) => <circle key={i} className="g" cx={x} cy={y} r="1.6" style={{ animationDelay: (i * 0.45) + 's' }} />)}
      </svg>
    </div>
  );
}
