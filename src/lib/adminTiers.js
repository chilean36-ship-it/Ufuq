// Admin tiers. 'super' = main admin (everything). 'standard' = admin without group / task / exam management.
// One place to tweak what a standard admin sees: add or remove a page key below.
// 'payments' is deliberately NOT listed: orders, access and payment settings are for main admins only.
export const STANDARD_PAGES = ['overview', 'announcements', 'profile'];

// Sections that exist in the teacher panel but are NOT part of the admin panel at all.
export const ADMIN_HIDDEN_PAGES = ['myGroup', 'attendance', 'calendar', 'tasks', 'media', 'reports'];

export function canOpenPage(tier, page) {
  if (ADMIN_HIDDEN_PAGES.includes(page)) return false;
  return tier !== 'standard' || STANDARD_PAGES.includes(page);
}
