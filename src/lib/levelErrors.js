// Server error codes of the level / group functions (supabase/migrations/20261201_level_groups_lifecycle.sql) -> text for staff.
// Keys are English; t() translates them. Anything unknown is shown as the server sent it.
const MAP = [
  [/NO_ACTIVE_GROUP_AT_LEVEL|NO_GROUP_FOR_LEVEL/, 'No group is running on that level. Switch one on in Groups first, or choose a level that has a running group.'],
  [/GROUP_INACTIVE/, 'This group is switched off. Choose a running group.'],
  [/GROUP_LEVEL_LOCKED/, 'The level of a group that has students cannot be changed. Move the students instead.'],
  [/GROUP_NOT_FOUND/, 'This group no longer exists. Refresh and try again.'],
  [/not_a_student/, 'Only students can be moved.'],
  [/NOT_ALLOWED|not_allowed/, 'You are not allowed to do this.'],
];

export function levelErrorText(t, err) {
  const m = (err && err.message) || String(err || '');
  const hit = MAP.find(([re]) => re.test(m));
  return hit ? t(hit[1]) : m;
}

/** Why a class group is switched off: 'deadline' | 'moved_on' | 'manual' (from the group row itself). */
export function closedReason(g) {
  if (!g || g.is_active) return null;
  if (g.deadline_closed_at) return 'deadline';
  if (g.moved_on_at) return 'moved_on';
  return 'manual';
}
