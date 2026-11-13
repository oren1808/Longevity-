// Pilot settings to fill before going out (docs/phase-a-runbook.md §1.6 "ממלאים לפני היציאה").
// Bracketed values are shown as-is on the page until they are filled.
export const PILOT = {
  productName: '[שם המוצר]',
  operator: '[שם מלא / שם החברה]',
  email: '[מייל]',
  deletionDate: '[תאריך מחיקה = D44]',
  advisorName: '[שם היועץ הרפואי]',
  /** International format without "+", e.g. 9725XXXXXXXX. Empty → wa.me lets the user pick the chat. */
  whatsappNumber: '',
  /** Phone numbers to verify before launch (runbook §1.1). */
  eran: '1201 [לאמת]',
  mda: '101',
  /**
   * Funnel analytics (PostHog EU, no cookies, no answers – spec Appendix D). Off until a key is set and the
   * vendor is in the privacy notice. When off, the T2 notice omits the usage-data line.
   */
  analytics: { enabled: false, posthogKey: '', host: 'https://eu.i.posthog.com' },
} as const;
