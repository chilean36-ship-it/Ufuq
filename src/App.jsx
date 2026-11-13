import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ScrollManager from './components/ScrollManager';
import RecoveryGate from './components/RecoveryGate';
import SiteLayout from './components/SiteLayout';
import RequireAuth from './components/RequireAuth';
import RequireRole from './components/RequireRole';
import Loader from './components/Loader';
import LandingPage from './pages/Landing/LandingPage';

// Every page except the landing page is split into its own chunk: a visitor on "/index" no longer downloads the
// student, teacher and admin apps (they were ~2.6 MB in one file).
const AboutAuthor = lazy(() => import('./pages/AboutAuthor/AboutAuthor'));
const Checkout = lazy(() => import('./pages/Checkout/Checkout'));
const CheckoutResult = lazy(() => import('./pages/Checkout/CheckoutResult'));
const Invoice = lazy(() => import('./pages/Checkout/Invoice'));
const ProfileRoute = lazy(() => import('./pages/Profile/ProfileRoute'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Admin = lazy(() => import('./pages/Admin/Admin'));
const Teacher = lazy(() => import('./pages/Teacher/Teacher'));
const LegalPage = lazy(() => import('./pages/Legal/LegalPage'));
const AppRoot = lazy(() => import('./app/AppRoot')); // the installable Ufuq app (onboarding, sign-in, bottom-tab student app)

/**
 * Routes mirror the old multi-page site (cleanUrls):
 *   /index  /about-author  /checkout  /profile  /dashboard  /teacher  /admin
 * and "/" opened dashboard.html (vercel.json rewrite) — kept the same here.
 */
export default function App() {
  return (
    <>
      <ScrollManager />
      <RecoveryGate />
      <Suspense fallback={<Loader />}>
      <Routes>
        {/* pages with the shared language switcher */}
        <Route element={<SiteLayout />}>
          <Route path="/index" element={<LandingPage />} />
          {['programs', 'pricing', 'stories', 'faq', 'contacts'].map((p) => (
            <Route key={p} path={`/${p}`} element={<LandingPage />} />
          ))}
          <Route path="/about-author" element={<AboutAuthor />} />
          {['terms', 'privacy', 'cookies', 'refund'].map((d) => (
            <Route key={d} path={`/${d}`} element={<LegalPage doc={d} />} />
          ))}
          <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/checkout/result" element={<RequireAuth><CheckoutResult /></RequireAuth>} />
          <Route path="/invoice/:id" element={<RequireAuth><Invoice /></RequireAuth>} />
        </Route>

        {/* the Ufuq app (PWA, scope /app) */}
        <Route path="/app/*" element={<AppRoot />} />

        {/* profile uses its own "cabinet" i18n system (English-keyed), not the site's */}
        <Route path="/profile" element={<ProfileRoute />} />

        {/* role-guarded apps */}
        <Route path="/" element={<RequireRole role="student"><Dashboard /></RequireRole>} />
        <Route path="/dashboard" element={<RequireRole role="student"><Dashboard /></RequireRole>} />
        <Route path="/teacher" element={<RequireRole role="teacher"><Teacher /></RequireRole>} />
        <Route path="/admin" element={<RequireRole role="admin"><Admin /></RequireRole>} />

        {/* old *.html URLs keep working */}
        {['index', 'about-author', 'checkout', 'profile', 'dashboard', 'teacher', 'admin'].map((p) => (
          <Route key={p} path={`/${p}.html`} element={<Navigate to={`/${p}`} replace />} />
        ))}
        <Route path="*" element={<Navigate to="/index" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
