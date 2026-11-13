// Rounded 2px line icons, 24px (design.md §5). Decorative: aria-hidden. No medical / countdown imagery.
const P: Record<string, string> = {
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  steps: '<path d="M8 3c-2 0-3 2-3 4.5S6 12 8 12s3-2 3-4.5S10 3 8 3z"/><path d="M6 15h4v2a2 2 0 0 1-4 0z"/><path d="M16 8c-2 0-3 2-3 4.5s1 4.5 3 4.5 3-2 3-4.5S18 8 16 8z"/><path d="M14 20h4"/>',
  strength: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  leaf: '<path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14z"/><path d="M5 19l8-8"/>',
  cup: '<path d="M5 8h12v5a6 6 0 0 1-12 0z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v2M12 3v2"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 14.5c3 0 6 2 6 5.5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  balance: '<circle cx="12" cy="5" r="2"/><path d="M12 7v7M8 10h8M12 14l-3 7M12 14l2 3"/>',
  rings: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="10"/>',
  arrow: '<path d="M9 6l6 6-6 6"/>',
};
export const icon = (name: string, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] ?? P.sprout}</svg>`;
