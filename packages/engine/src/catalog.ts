// Action catalog (docs/actions.md) and the rules that pick the action cards shown after the reveal.
// Texts live in the app's messages file; this module only holds ids, doses and selection rules.
import type { ActionResult, Assessment, EngineAnswers } from './types';

export type CatalogId =
  | 'walk30'
  | 'strength2'
  | 'veg_each_meal'
  | 'legumes_nuts'
  | 'swap_sweet_drink'
  | 'bedtime'
  | 'wake_same'
  | 'alcohol_free_days'
  | 'smk_talk'
  | 'smk_delay_first'
  | 'smk_day_off'
  | 'smk_quit_date'
  | 'connect'
  | 'bp_check'
  | 'balance'
  | 'mobility';

export interface CatalogEntry {
  id: CatalogId;
  /** Days per week (dose) and the threshold for a week to count. */
  doseDays: number;
  weekCountThreshold: number;
  grade: 'A' | 'B' | 'C' | null;
  /** Has an engine value in years / hours. Otherwise the UI counts days. */
  hasYears: boolean;
  physical: boolean;
  hasEasy: boolean;
  hasAccessible: boolean;
  oneOff?: boolean;
}

/** Placeholder doses per docs/actions.md (all values pending advisor sign-off). */
export const CATALOG: Record<CatalogId, CatalogEntry> = {
  walk30: { id: 'walk30', doseDays: 5, weekCountThreshold: 4, grade: 'B', hasYears: true, physical: true, hasEasy: true, hasAccessible: true },
  strength2: { id: 'strength2', doseDays: 2, weekCountThreshold: 2, grade: 'C', hasYears: true, physical: true, hasEasy: true, hasAccessible: true },
  veg_each_meal: { id: 'veg_each_meal', doseDays: 5, weekCountThreshold: 4, grade: 'C', hasYears: true, physical: false, hasEasy: true, hasAccessible: true },
  legumes_nuts: { id: 'legumes_nuts', doseDays: 5, weekCountThreshold: 4, grade: 'C', hasYears: true, physical: false, hasEasy: true, hasAccessible: true },
  swap_sweet_drink: { id: 'swap_sweet_drink', doseDays: 5, weekCountThreshold: 4, grade: 'C', hasYears: true, physical: false, hasEasy: true, hasAccessible: false },
  bedtime: { id: 'bedtime', doseDays: 5, weekCountThreshold: 4, grade: 'C', hasYears: true, physical: false, hasEasy: true, hasAccessible: false },
  wake_same: { id: 'wake_same', doseDays: 6, weekCountThreshold: 5, grade: 'C', hasYears: true, physical: false, hasEasy: true, hasAccessible: false },
  alcohol_free_days: { id: 'alcohol_free_days', doseDays: 4, weekCountThreshold: 4, grade: 'B', hasYears: true, physical: false, hasEasy: true, hasAccessible: false },
  smk_talk: { id: 'smk_talk', doseDays: 1, weekCountThreshold: 1, grade: 'A', hasYears: false, physical: false, hasEasy: false, hasAccessible: false, oneOff: true },
  smk_delay_first: { id: 'smk_delay_first', doseDays: 5, weekCountThreshold: 4, grade: null, hasYears: false, physical: false, hasEasy: true, hasAccessible: false },
  smk_day_off: { id: 'smk_day_off', doseDays: 1, weekCountThreshold: 1, grade: null, hasYears: false, physical: false, hasEasy: false, hasAccessible: false },
  smk_quit_date: { id: 'smk_quit_date', doseDays: 7, weekCountThreshold: 6, grade: 'A', hasYears: true, physical: false, hasEasy: false, hasAccessible: false },
  connect: { id: 'connect', doseDays: 3, weekCountThreshold: 3, grade: 'C', hasYears: false, physical: false, hasEasy: true, hasAccessible: true },
  bp_check: { id: 'bp_check', doseDays: 1, weekCountThreshold: 1, grade: null, hasYears: false, physical: false, hasEasy: false, hasAccessible: false, oneOff: true },
  balance: { id: 'balance', doseDays: 5, weekCountThreshold: 4, grade: 'C', hasYears: false, physical: true, hasEasy: true, hasAccessible: true },
  mobility: { id: 'mobility', doseDays: 5, weekCountThreshold: 4, grade: 'C', hasYears: false, physical: true, hasEasy: false, hasAccessible: true },
};

export interface ActionCard {
  id: CatalogId;
  /** Engine values (null for persistence actions, which count days). */
  gainYears: number | null;
  gainLow: number | null;
  gainHigh: number | null;
  hoursPerDay: number | null;
  /** In maintenance mode habits are not credited in hours: count days. */
  countDays: boolean;
  /** Show "in coordination with the medical team" (gate = yes and a physical action). */
  medicalNote: boolean;
}

function card(id: CatalogId, r: ActionResult | undefined, countDays: boolean, medicalNote: boolean): ActionCard {
  const e = CATALOG[id];
  const years = !countDays && e.hasYears && r && r.gainYears != null;
  return {
    id,
    gainYears: years ? r!.gainYears : null,
    gainLow: years ? r!.gainLow : null,
    gainHigh: years ? r!.gainHigh : null,
    hoursPerDay: years ? r!.hoursPerDay : null,
    countDays: !years,
    medicalNote: medicalNote && e.physical,
  };
}

export interface PickOptions {
  age: number;
  gateYes: boolean;
  /** Current smokers are asked "talk about smoking now?" first. */
  smokingTalk: boolean;
  isCurrentSmoker: boolean;
  count?: number;
}

/**
 * Pick the action cards (design.md screen 10, actions.md rules):
 * - maintenance → balance, mobility, wake_same, connect (days, no hours);
 * - 75+ → only strength2, balance, connect, walk30;
 * - current smoker who chose to talk about smoking → smk_delay_first first, then smk_talk, smk_quit_date;
 * - otherwise the engine ranking (gain × evidence weight), smoking actions excluded unless chosen.
 */
export function pickActions(res: Assessment, ans: EngineAnswers, o: PickOptions): ActionCard[] {
  const n = o.count ?? 3;
  const byId = new Map(res.actions.map((a) => [a.id as string, a]));
  if (res.display === 'maintenance') {
    // new habits only: skip what the user already does (regular sleep, well connected)
    const ids = (['balance', 'mobility', 'wake_same', 'connect'] as CatalogId[]).filter(
      (id) => !(id === 'wake_same' && ans.irreg === 'no') && !(id === 'connect' && ans.soc === 'conn'),
    );
    return ids.slice(0, n).map((id) => card(id, byId.get(id), true, o.gateYes));
  }
  if (o.isCurrentSmoker && o.smokingTalk) {
    return (['smk_delay_first', 'smk_talk', 'smk_quit_date'] as CatalogId[]).map((id) => card(id, byId.get(id), false, false)).slice(0, n);
  }
  const allowed75: CatalogId[] = ['strength2', 'balance', 'connect', 'walk30'];
  const ranked = res.actions
    .filter((a) => a.gainYears != null && a.kind !== 'smoking' && a.id !== 'diet_up')
    .map((a) => a.id as CatalogId)
    .filter((id) => id in CATALOG)
    .filter((id) => o.age < 75 || allowed75.includes(id));
  const fill: CatalogId[] = o.age >= 75 ? ['balance', 'connect'] : ['connect', 'mobility'];
  const ids: CatalogId[] = [];
  for (const id of [...ranked, ...fill]) {
    if (ids.length >= n) break;
    if (id === 'connect' && ans.soc === 'conn') continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => card(id, byId.get(id), false, o.gateYes));
}

export type GainBucket = 'a' | 'b' | 'c' | 'd' | 'e';
/** Analytics / P-code gain bucket: <0.5 / 0.5–1 / 1–2 / 2–4 / 4+ (spec Appendix D). */
export function gainBucket(g: number): GainBucket {
  return g < 0.5 ? 'a' : g < 1 ? 'b' : g < 2 ? 'c' : g < 4 ? 'd' : 'e';
}
