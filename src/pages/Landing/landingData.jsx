/* Static content for the landing page. Text is referenced by i18n key so every language switches live. */

export const NAV_LINKS = [
  { href: '#about-author', key: 'nav.about' },
  { href: '#programs', key: 'nav.programs' },
  { href: '#pricing', key: 'nav.pricing' },
  { href: '#faq', key: 'nav.faq' },
  { href: '#contacts', key: 'nav.contacts' },
];

export const FLOATING_LETTERS = [
  { ch: 'ا', style: { top: '14%', left: '12%', fontSize: '34px', animationDelay: '0.2s' } },
  { ch: 'ب', style: { top: '70%', left: '8%', fontSize: '26px', animationDelay: '1.1s' } },
  { ch: 'ق', style: { top: '20%', right: '6%', fontSize: '30px', animationDelay: '0.6s' } },
  { ch: 'م', style: { top: '76%', right: '10%', fontSize: '22px', animationDelay: '1.6s' } },
];

export const ABOUT_CREDS = [
  { num: '10+', key: 'about.cred1' },
  { num: '1000+', key: 'about.cred2' },
  { num: '2', key: 'about.cred3' },
];

const EX_ICON = {
  1: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5z" /><path d="M8 7.5h8M8 11.5h5" /></svg>),
  2: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14v-2a8 8 0 0116 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>),
  3: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3l1.9 4.9L18 10l-5.1 2.1L11 17l-1.9-4.9L4 10l5.1-2.1z" /><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>),
  4: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="10" rx="2" /><rect x="13" y="3" width="8" height="6" rx="2" /><rect x="13" y="11" width="8" height="10" rx="2" /><rect x="3" y="15" width="8" height="6" rx="2" /></svg>),
  5: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="M15.5 10.5l6-3.2v9.4l-6-3.2" /></svg>),
  6: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5.5-5.5 4 4L21 7" /><path d="M15 7h6v6" /></svg>),
};

export const EXPLORE_CARDS = [
  { n: '01', t: 'explore.c1t', d: 'explore.c1d', icon: EX_ICON[1] },
  { n: '02', t: 'explore.c2t', d: 'explore.c2d', icon: EX_ICON[2] },
  { n: '03', t: 'explore.c3t', d: 'explore.c3d', icon: EX_ICON[3] },
  { n: '04', t: 'explore.c4t', d: 'explore.c4d', icon: EX_ICON[4] },
  { n: '05', t: 'explore.c5t', d: 'explore.c5d', icon: EX_ICON[5] },
  { n: '06', t: 'explore.c6t', d: 'explore.c6d', icon: EX_ICON[6] },
];

const ARROW = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#EDEAE3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const PROG_ARROW = ARROW;

export const PROGRAMS = [
  {
    img: '/assets/images/program-textbook.webp',
    alt: 'Al-Ufuq — Arabic language textbook for non-native speakers',
    labelKey: 'programs.p1l', titleKey: 'programs.p1t',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#E5C878" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
        <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
      </svg>
    ),
  },
  {
    img: '/assets/images/img-06.webp',
    alt: 'Arabic calligraphy pen and ink on script',
    labelKey: 'programs.p2l', titleKey: 'programs.p2t',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#E5C878" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    img: '/assets/images/img-07.webp',
    alt: 'Open Arabic book with a stack of texts and candlelight',
    labelKey: 'programs.p3l', titleKey: 'programs.p3t',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#E5C878" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.6 8.6 0 0 1-3.6-.8L3 20l1.05-4.05A8.4 8.4 0 1 1 21 11.5Z" />
      </svg>
    ),
  },
];

const CULTURE_IMG_STYLE = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

export const DISCOVER_TABS = [
  {
    id: 'stories', tabKey: 'discover.tab1', textKey: 'discover.text1',
    cards: [
      // Students tab: real student videos (faces blurred). noPreview = the card shows only its picture + play button; the video opens (and plays) in the window.
      { img: '/assets/images/students-story.jpg', alt: 'Six students retelling one story, each in turn', titleKey: 'discover.s1', video: '/assets/videos/students-story.mp4', fixed: true, noPreview: true },
      { img: '/assets/images/students-dialogue.jpg', alt: 'Two students having a conversation in Arabic', titleKey: 'discover.s2', video: '/assets/videos/students-dialogue.mp4', fixed: true, noPreview: true },
      { img: '/assets/images/students-writing.jpg', alt: 'Pages from the Arabic handwriting notebooks of students', titleKey: 'discover.s3', video: '/assets/videos/students-writing.mp4', fixed: true, noPreview: true },
    ],
  },
  {
    id: 'morals', tabKey: 'discover.tab2', textKey: 'discover.text2',
    cards: [
      { img: '/assets/images/img-12.webp', alt: 'Kindness and helping an elder', titleKey: 'discover.m1', video: '/assets/videos/morals-honesty.mp4', moral: true },
      { img: '/assets/images/img-13.webp', alt: 'Kindness and helping a child', titleKey: 'discover.m2', video: '/assets/videos/morals-kindness.mp4', moral: true },
      { img: '/assets/images/img-14.webp', alt: 'Family learning together', titleKey: 'discover.m3', video: '/assets/videos/morals-patience.mp4', moral: true },
    ],
  },
  {
    id: 'culture', tabKey: 'discover.tab3', textKey: 'discover.text3',
    cards: [
      { img: '/assets/images/img-15.webp', alt: 'Culture image 1', titleKey: 'discover.c1', video: '/assets/videos/culture-geometric-pattern.mp4', imgStyle: CULTURE_IMG_STYLE },
      { img: '/assets/images/img-16.webp', alt: 'Culture image 2', titleKey: 'discover.c2', video: '/assets/videos/culture-dome-minaret.mp4', imgStyle: CULTURE_IMG_STYLE },
      { img: '/assets/images/img-17.webp', alt: 'Culture image 3', titleKey: 'discover.c3', video: '/assets/videos/culture-calligraphy-pen.mp4', imgStyle: CULTURE_IMG_STYLE },
    ],
  },
];

// Official CEFR and Al-Tanal certificates of Ustaz Ali's students (from the teacher's Telegram channel). Names, ID numbers, photos and QR codes
// are painted over in the image files, so only the level and the scores show.
export const FACES = [
  { name: 'Al-Tanal', level: 'Arab tili · 75.7%', initial: 'T', cls: 'face-photo-1', file: 'cert-1.jpg' },
  { name: 'CEFR B2', level: 'Arab tili · 63', initial: 'B2', cls: 'face-photo-2', file: 'cert-2.jpg' },
  { name: 'CEFR B2', level: 'Arab tili · 56', initial: 'B2', cls: 'face-photo-3', file: 'cert-3.jpg' },
  { name: 'CEFR B2', level: 'Arab tili · 53', initial: 'B2', cls: 'face-photo-4', file: 'cert-4.jpg' },
  { name: 'CEFR B2', level: 'Arab tili · 53', initial: 'B2', cls: 'face-photo-5', file: 'cert-5.jpg' },
  { name: 'CEFR B2', level: 'Arab tili · 51', initial: 'B2', cls: 'face-photo-6', file: 'cert-6.jpg' },
];

export const QUOTES = [
  { qKey: 'testi.q1', name: 'Sarvar A.', levelKey: 'testi.l1' },
  { qKey: 'testi.q2', name: 'Dilnoza K.', levelKey: 'testi.l2' },
  { qKey: 'testi.q3', name: 'Jasur M.', levelKey: 'testi.l3' },
  { qKey: 'testi.q4', name: 'Madina T.', levelKey: 'testi.l4' },
  { qKey: 'testi.q5', name: 'Otabek R.', levelKey: 'testi.l5' },
];

export const PRICING_FEATURES = ['pricing.f1', 'pricing.f2', 'pricing.f3', 'pricing.f4', 'pricing.f5'];

export const FAQ = [1, 2, 3, 4, 5, 6].map((n) => ({ q: `faq.q${n}`, a: `faq.a${n}` }));

export const FOOTER_COLUMNS = [
  {
    h: 'footer.h1',
    links: [
      { href: '#explore', key: 'footer.explore' },
      { href: '#pricing', key: 'footer.pricing' },
      { href: '#stories', key: 'footer.stories' },
    ],
  },
  {
    h: 'footer.h2',
    links: [
      { href: '#about', key: 'footer.about' },
      { href: '#about-author', key: 'footer.teachers' },
      { href: '#contacts', key: 'footer.contact' },
    ],
  },
  {
    h: 'footer.h3',
    links: [
      { href: '', text: 'YouTube', linkSlot: 'link_youtube' },
      { href: '', text: 'Instagram', linkSlot: 'link_instagram' },
      { href: 'https://t.me/Arabic_UstazAli', text: 'Telegram', external: true, linkSlot: 'link_telegram' },
    ],
  },
];
