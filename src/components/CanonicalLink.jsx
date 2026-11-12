import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE = 'https://ufuqtaleem.com';

/**
 * Keeps <link rel="canonical"> in sync with the current route.
 * The site is a single-page app (every URL serves the same index.html), so without this Google sees several
 * URLs with identical HTML and reports "Duplicate without user-selected canonical". "/" and "/index.html"
 * resolve to the landing page, whose one canonical address is "/index" (the same URL the sitemap lists).
 */
export function canonicalFor(pathname) {
  let path = (pathname || '/').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  if (path === '/') path = '/index';
  return SITE + path;
}

export default function CanonicalLink() {
  const { pathname } = useLocation();
  useEffect(() => {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonicalFor(pathname));
  }, [pathname]);
  return null;
}
