const svg = (children, extra = {}) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra}>{children}</svg>
);

export const I = {
  logo: <img className="uai-logo-img" src="/assets/images/logo-mark.png" alt="" draggable="false" />,
  send: svg(<><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>, { strokeWidth: 2.3 }),
  mic: svg(<><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  micOff: svg(<><path d="M3 3l18 18" /><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3" /><path d="M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v3" /></>),
  wave: svg(<><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" /></>, { strokeWidth: 2.2 }),
  close: svg(<><path d="M6 6l12 12M18 6 6 18" /></>, { strokeWidth: 2.1 }),
  expand: svg(<><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></>),
  collapse: svg(<><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" /></>),
  newChat: svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  copy: svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>),
  check: svg(<path d="m5 12.5 4.5 4.5L19 7.5" />, { strokeWidth: 2.4 }),
  speaker: svg(<><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></>),
  stop: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>,
  retry: svg(<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>),
  down: svg(<path d="m6 9 6 6 6-6" />, { strokeWidth: 2.2 }),
  history: svg(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>),
  trash: svg(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>),
  plus: svg(<path d="M12 5v14M5 12h14" />, { strokeWidth: 2.2 }),
  endCall: svg(<><path d="M6 6l12 12M18 6 6 18" /></>, { strokeWidth: 2.4 }),
};
