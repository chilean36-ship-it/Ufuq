import '../styles/loader.css';

/**
 * Ufuq loader: the site's own emblem, drawn in gold, with a light sweep across it, a breathing glow and an orbiting ring.
 * One component for the whole site:
 *   <Loader />                          full-screen (route guards, first load)
 *   <Loader overlay label="..." />      full-screen, with a caption
 *   <Loader inline label="..." />       small block inside a page / card / table cell
 *   <Loader size="xs" />                tiny, for buttons (use inline={true} too)
 * Colours follow the theme (gold on dark / on light) and it respects "reduce motion".
 */
export default function Loader({ overlay = false, inline = false, size, label = '', className = '' }) {
  const kind = inline ? 'is-inline' : 'is-full';
  const sz = size || (inline ? 'sm' : 'lg');
  return (
    <div className={`ufq-loader ${kind} ufq-${sz} ${className}`.trim()} role="status" aria-live="polite" aria-busy="true"
         data-overlay={overlay ? '1' : undefined}>
      <div className="ufq-stage" aria-hidden="true">
        <span className="ufq-glow" />
        <svg className="ufq-ring" viewBox="0 0 100 100">
          <circle className="ufq-ring-track" cx="50" cy="50" r="46" />
          <circle className="ufq-ring-arc" cx="50" cy="50" r="46" pathLength="100" />
        </svg>
        <span className="ufq-orbit"><i /></span>
        <span className="ufq-logo"><span className="ufq-logo-shine" /></span>
      </div>
      {label ? <div className="ufq-label">{label}</div> : <span className="ufq-sr">Loading</span>}
    </div>
  );
}
