// Hebrew number formatting. Every number is wrapped in its own <bdi dir="ltr"> (design.md §4 RTL checklist).

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const bdi = (n: number | string) => `<bdi dir="ltr" class="num">${esc(String(n))}</bdi>`;

const HOURS: Record<string, string> = {
  '0.25': 'רבע שעה',
  '0.5': 'חצי שעה',
  '0.75': 'שלושת רבעי שעה',
  '1': 'שעה',
  '1.25': 'שעה ורבע',
  '1.5': 'שעה וחצי',
  '1.75': 'שעה ושלושה רבעים',
  '2': 'שעתיים',
  '2.25': 'שעתיים ורבע',
  '2.5': 'שעתיים וחצי',
  '2.75': 'שעתיים ושלושה רבעים',
  '3': 'שלוש שעות',
};
/** hoursPerDay (quarter steps 0.25–3) → words (engine.md §7). */
export const hoursText = (h: number) => HOURS[String(h)] ?? `${h} שעות`;

/** Years as Hebrew words; < 1 year → months. HTML (numbers inside <bdi>). */
export function yearsHtml(y: number): string {
  if (y < 1) {
    const m = Math.max(1, Math.round(y * 12));
    return m === 1 ? 'חודש' : m === 2 ? 'חודשיים' : `${bdi(m)} חודשים`;
  }
  const r = Math.round(y * 2) / 2;
  if (r === 1) return 'שנה';
  if (r === 1.5) return 'שנה וחצי';
  if (r === 2) return 'שנתיים';
  if (r === 2.5) return 'שנתיים וחצי';
  return `${bdi(r)} שנים`;
}
/** Plain-text version for screen-reader announcements. */
export const yearsText = (y: number) => yearsHtml(y).replace(/<[^>]+>/g, '');
