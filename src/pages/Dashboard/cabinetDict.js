// The student cabinet's merged dictionary. Shared by the website cabinet (Dashboard.jsx) and the Ufuq app (src/app).
// The Profile view reuses the profile dictionary; the dashboard's own strings win on any overlap.
import dashboardDict from '../../i18n/cabinet-dashboard';
import examLevelsDict from '../../i18n/exam-levels';
import dashboardExtra from '../../i18n/dashboard-extra';
import examModeDict from '../../i18n/exam-mode';
import profileDict from '../../i18n/cabinet-profile';
import fillMissing from '../../i18n/fill-missing';
import billingDict from '../../i18n/billing-cabinet';
import myGroupDict from '../../i18n/my-group';

const cabinetDict = Object.fromEntries(
  Object.keys(dashboardDict).map((lang) => [lang, { ...(examLevelsDict[lang] || {}), ...(fillMissing[lang] || {}), ...(profileDict[lang] || {}), ...dashboardDict[lang], ...(dashboardExtra[lang] || {}), ...(examModeDict[lang] || {}), ...(billingDict[lang] || {}), ...(myGroupDict[lang] || {}) }])
);
export default cabinetDict;
