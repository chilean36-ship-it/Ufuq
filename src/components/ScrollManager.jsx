import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** A route change in an SPA must behave like the old full page load: start at the top (unless there is a #hash). */
export default function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
