// Questionnaire (spec Appendix A) → engine answers (docs/engine.md §2).
import { bmiLevel, dietLevel, socialLevel, whtrLevel } from './engine';
import type { ActLevel, AlcLevel, EngineAnswers, Gate, Hookah, Sex, SleepLevel, SmkLevel, StrLevel } from './types';

export interface QuestionnaireAnswers {
  /** Q1 */ age: number;
  /** Q2 */ sex: Sex;
  /** Q3 */ gate: Gate;
  /** Q4 */ activity: ActLevel;
  /** Q5: 'other' = "can't climb stairs for another reason (knees, back)" → fitness unknown */
  stairs: 'easy' | 'mod' | 'hard' | 'other';
  /** Q6 */ strength: StrLevel;
  /** Q7 */ smoking: SmkLevel;
  /** Q7b, asked only of never / ex-smokers */ hookah?: Hookah;
  /** Q8a servings of fruit & veg per day: 0 = one or less … 3 = five or more */ veg: 0 | 1 | 2 | 3;
  /** Q8b legumes / nuts / whole grains per week: 0 = almost never … 3 = almost every day */ whole: 0 | 1 | 2 | 3;
  /** Q9 processed / sweetened per week: 'daily' | 'few' | 'weekly' | 'rarely' */
  processed: 'daily' | 'few' | 'weekly' | 'rarely';
  /** Q10, null = "can't measure right now" */
  body: { heightCm: number; weightKg: number; waistCm?: number } | null;
  /** Q11a */ sleep: SleepLevel;
  /** Q11b: going to bed and waking at about the same times (within an hour) */ regular: boolean;
  /** Q12: 'none' = not at all */ alcohol: 'none' | AlcLevel;
  /** Q13a */ contact: 'most' | 'weekly' | 'monthly';
  /** Q13b */ lonely: 'rarely' | 'sometimes' | 'often';
  /** Age at quitting, if stored from an earlier assessment (Phase B). */
  quitAge?: number;
}

const PROCESSED_SCORE = { daily: 0, few: 1, weekly: 2, rarely: 3 } as const;

export function toEngineAnswers(q: QuestionnaireAnswers): EngineAnswers {
  const dietScores = { veg: q.veg, whole: q.whole, processed: PROCESSED_SCORE[q.processed] };
  let bmi: EngineAnswers['bmi'] = 'dk';
  let whtr: EngineAnswers['whtr'];
  if (q.body) {
    const m = q.body.heightCm / 100;
    bmi = bmiLevel(q.body.weightKg / (m * m));
    if (q.body.waistCm) whtr = whtrLevel(q.body.waistCm / q.body.heightCm);
  }
  const isCurrent = q.smoking === '<10' || q.smoking === '10-19' || q.smoking === '20+';
  const a: EngineAnswers = {
    act: q.activity,
    fit: q.stairs === 'other' ? 'dk' : q.stairs,
    str: q.strength,
    smk: q.smoking,
    hookah: isCurrent ? 'no' : q.hookah ?? 'no',
    diet: dietLevel(dietScores),
    dietScores,
    bmi,
    sleep: q.sleep,
    irreg: q.regular ? 'no' : 'yes',
    alc: q.alcohol === 'none' ? '0-7' : q.alcohol,
    soc: socialLevel(q.contact, q.lonely),
  };
  if (whtr) a.whtr = whtr;
  if (q.quitAge != null) a.quitAge = q.quitAge;
  return a;
}

/** Any "hard to know" answer (adds +1 to the half-width, §5). */
export function hasDontKnow(a: EngineAnswers) {
  return Object.values(a).some((v) => v === 'dk');
}
