import { lazy, Suspense, useEffect } from 'react';

const Admin = lazy(() => import('../pages/Admin/Admin'));
const Teacher = lazy(() => import('../pages/Teacher/Teacher'));

/**
 * `/app/admin` and `/app/teacher`: the website's admin / teacher panels, opened inside the installed app's own scope (so the Android
 * app does not drop to a browser bar). Phones get the app look: bottom tab bar, safe areas, no page zoom. The panels keep their
 * own sign-in check and permissions — a student who opens these addresses is sent back to /app.
 */
export default function PanelHost({ kind }) {
  useEffect(() => {
    document.body.classList.add('ua-panel');
    const vp = document.querySelector('meta[name="viewport"]');
    const was = vp ? vp.getAttribute('content') : null;
    if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content');
    return () => { document.body.classList.remove('ua-panel'); if (vp && was != null) vp.setAttribute('content', was); };
  }, []);
  return <Suspense fallback={null}>{kind === 'admin' ? <Admin /> : <Teacher />}</Suspense>;
}
