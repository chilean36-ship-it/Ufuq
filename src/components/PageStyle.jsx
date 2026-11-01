/**
 * Injects a page's own stylesheet while that page is mounted (and removes it on unmount).
 * The original site was multi-page, so every page had CSS that could freely reuse class names
 * like .card/.btn/.wrap. Loading it this way keeps each page's CSS isolated exactly like before,
 * with zero selector rewriting.  Usage:  import css from './x.css?inline';  <PageStyle css={css} />
 */
export default function PageStyle({ css }) {
  return <style>{css}</style>;
}
