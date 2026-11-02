import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { DISCOVER_TABS, PROGRAMS, FACES } from '../pages/Landing/landingData';

/*
 * Landing-page media slots. The page ships with default images/videos (public/assets); the main admin can replace any slot
 * from the admin panel → "Landing page". Overrides live in public.landing_media (public read, main-admin write) and the
 * files in the public Storage bucket "landing-media". No override row → the built-in default is used.
 */
export const LANDING_BUCKET = 'landing-media';
export const IMAGE_MAX_MB = 5;
export const VIDEO_MAX_MB = 50;

const DISCOVER_GROUP_LABEL = { stories: 'Stories', morals: 'Morals', culture: 'Culture' };

/** [{ slot, group, label, defaultImage, defaultVideo|null }] in display order. */
export const LANDING_SLOTS = [
  { slot: 'hero_teacher', group: 'Teacher', label: 'Teacher photo (top of page)', defaultImage: '/assets/images/img-02.webp', defaultVideo: null },
  { slot: 'about_photo', group: 'Teacher', label: 'Teacher photo (About section)', defaultImage: '/assets/images/img-04.webp', defaultVideo: null },
  ...PROGRAMS.map((p, i) => ({ slot: 'program_' + (i + 1), group: 'Programs', label: p.alt, defaultImage: p.img, defaultVideo: null })),
  ...DISCOVER_TABS.flatMap((d) => d.cards.map((c, i) => ({
    slot: d.id + '_' + (i + 1), group: DISCOVER_GROUP_LABEL[d.id], label: c.alt, defaultImage: c.img, defaultVideo: c.video,
  }))),
  { slot: 'site_logo', group: 'Site', label: 'Logo (header and footer)', defaultImage: '/assets/images/img-01.webp', defaultVideo: null },
  { slot: 'bg_about', group: 'Site', label: 'About section background', defaultImage: '/assets/images/img-03.webp', defaultVideo: null },
  { slot: 'bg_discover', group: 'Site', label: 'Discover section background', defaultImage: '/assets/images/img-08.webp', defaultVideo: null },
  { slot: 'bg_pricing', group: 'Site', label: 'Pricing section decoration', defaultImage: '/assets/images/img-18.webp', defaultVideo: null },
  ...FACES.map((f, i) => ({ slot: 'student_' + (i + 1), group: 'Student photos', label: f.name, defaultImage: '/assets/students/' + f.file, defaultVideo: null })),
];
/** Footer social links, stored in the same table (url in video_url). */
export const LANDING_LINKS = [
  { slot: 'link_youtube', label: 'YouTube', placeholder: 'https://youtube.com/@…' },
  { slot: 'link_instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { slot: 'link_telegram', label: 'Telegram', placeholder: 'https://t.me/…' },
];
export const LANDING_GROUPS = ['Teacher', 'Programs', 'Stories', 'Morals', 'Culture', 'Student photos', 'Site'];

let cache = null;          // { slot: row }
let inflight = null;

export async function fetchLandingMedia(force) {
  if (cache && !force) return cache;
  if (!inflight || force) {
    inflight = (async () => {
      try {
        const { data, error } = await supabase.from('landing_media').select('slot, image_url, video_url, updated_at');
        if (error) throw error;
        const map = {};
        (data || []).forEach((r) => { map[r.slot] = r; });
        cache = map;
      } catch (e) { cache = {}; } // table unreachable → built-in defaults
      inflight = null;
      return cache;
    })();
  }
  return inflight;
}

/** Landing components call this; returns { img(slot, fallback), video(slot, fallback) } (re-renders when loaded). */
export function useLandingMedia() {
  // Until the saved overrides are read, nothing is drawn (no flash of the built-in picture before the admin's one);
  // if the read takes too long the built-in defaults are shown.
  const [map, setMap] = useState(cache);
  const [late, setLate] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchLandingMedia().then((m) => { if (alive) setMap(m); });
    const id = setTimeout(() => { if (alive) setLate(true); }, 2500);
    return () => { alive = false; clearTimeout(id); };
  }, []);
  const ready = !!map || late;
  const rows = map || {};
  const v = (row) => (row && row.updated_at ? '?v=' + new Date(row.updated_at).getTime() : '');
  return {
    ready,
    img: (slot, fallback) => { if (!ready) return undefined; const r = rows[slot]; return r && r.image_url ? r.image_url + (r.image_url.includes('supabase') ? v(r) : '') : fallback; },
    link: (slot, fallback) => { const r = rows[slot]; return r && r.video_url ? r.video_url : fallback; },
    video: (slot, fallback) => { if (!ready) return undefined; const r = rows[slot]; return r && r.video_url ? r.video_url : fallback; },
  };
}
