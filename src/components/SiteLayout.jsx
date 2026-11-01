import { Outlet } from 'react-router-dom';
import { I18nProvider } from '../context/I18nContext';

/** Layout for the pages that carry the language switcher (landing, about-author, checkout, profile). */
export default function SiteLayout() {
  return (
    <I18nProvider>
      <Outlet />
    </I18nProvider>
  );
}
