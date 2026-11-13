// Types for the life-expectancy engine (docs/engine.md v4.1).

export type Sex = 'M' | 'F' | 'X';
/** Q3 gate answer: chronic condition under treatment / follow-up. */
export type Gate = 'no' | 'yes' | 'prefer_not';
/** 0 = point estimate, 1 = every HR at its CI lower bound (longer), 2 = every HR at its CI upper bound. */
export type Bound = 0 | 1 | 2;

export type ActLevel = '300+' | '150-299' | '75-149' | '1-74' | '0';
export type FitLevel = 'easy' | 'mod' | 'hard';
export type StrLevel = '2+' | '1' | '0';
export type SmkCurrent = '<10' | '10-19' | '20+';
export type SmkQuit = 'q<5' | 'q5-15' | 'q>15';
export type SmkLevel = 'never' | SmkQuit | SmkCurrent;
export type DietLevel = 'high' | 'mid' | 'low';
export type WhtrLevel = '<0.5' | '0.5-0.6' | '>0.6';
export type BmiLevel = '18.5-25' | '25-30' | '30-35' | '35+' | '<18.5';
export type SleepLevel = '7-8' | '6' | '<6' | '9+';
export type IrregLevel = 'no' | 'yes';
export type AlcLevel = '0-7' | '8-14' | '15-24' | '25-34' | '35+';
export type SocLevel = 'conn' | 'mid' | 'iso';
export type Hookah = 'no' | 'sometimes' | 'daily';
export type DK = 'dk';

export type FactorId = 'act' | 'fit' | 'str' | 'smk' | 'diet' | 'whtr' | 'bmi' | 'sleep' | 'irreg' | 'alc' | 'soc';

/** Diet sub-scores, each 0 (worst) .. 3 (best). processed is already reversed (Q9 "every day" = 0). */
export interface DietScores {
  veg: number;
  whole: number;
  processed: number;
}

/** Engine input: answers already mapped to factor levels (docs/engine.md §2). */
export interface EngineAnswers {
  act: ActLevel | DK;
  fit?: FitLevel | DK;
  str: StrLevel;
  smk: SmkLevel;
  hookah?: Hookah;
  diet: DietLevel | DK;
  /** When present, diet actions work on the sub-answers (veg_each_meal / legumes_nuts / swap_sweet_drink, §6). */
  dietScores?: DietScores;
  bmi: BmiLevel | DK;
  whtr?: WhtrLevel | DK;
  sleep: SleepLevel;
  irreg: IrregLevel;
  alc: AlcLevel | DK;
  soc: SocLevel;
  /** Age at quitting, stored once at the first assessment (§3.1). Defaults to age − t0. */
  quitAge?: number;
}

export type ActionId =
  | 'walk30'
  | 'strength2'
  | 'smk_quit_date'
  | 'diet_up'
  | 'veg_each_meal'
  | 'legumes_nuts'
  | 'swap_sweet_drink'
  | 'bedtime'
  | 'wake_same'
  | 'alcohol_free_days'
  | 'connect'
  | 'balance';

export type Grade = 'A' | 'B' | 'C';
export type Display = 'full' | 'gain-only' | 'maintenance';

export interface ActionResult {
  id: ActionId;
  gainYears: number | null;
  gainLow: number | null;
  gainHigh: number | null;
  hoursPerDay: number | null;
  grade: Grade;
  score: number;
  kind: 'habit' | 'smoking' | 'persistence';
}

export interface Assessment {
  /** age + remaining life expectancy (years, unrounded). */
  point: number;
  /** age + CBS remaining life expectancy for this age and sex. */
  baseline: number;
  eRem: number;
  spread: number;
  hw0: number;
  hw: number;
  low: number;
  high: number;
  potentialGain: number;
  potLow: number;
  potHigh: number;
  actions: ActionResult[];
  display: Display;
  C: number;
  biggestLever: { actionId: ActionId; gainYears: number; kind: ActionResult['kind'] } | null;
  isPlaceholder: boolean;
  engineVersion: string;
  factorsVersion: string;
}
