// Engine data: life table, factors, prevalence, normalisation constants and engine parameters.
// Every value here is a placeholder until the medical advisor signs off (docs/engine.md, header).
import factorsJson from '../../../config/factors.json';
import prevalenceJson from '../../../config/prevalence.json';
import normalizationJson from '../../../config/normalization.json';
import paramsJson from '../../../config/engine-params.json';
import lifeTableJson from '../../../data/life-tables/IL-placeholder-gm.json';
import type { FactorId, Sex } from './types';

export type HRTriple = [number, number, number]; // [HR, CI low, CI high]

export interface EngineParams {
  k: number;
  L: number;
  rhoBreaks: number[];
  rhoValues: number[];
  hrRef: number;
  ws: [number, number, number];
  wo: [number, number, number];
  hwCoef: number;
  quitT0: Record<string, number>;
}

export interface EngineData {
  maxAge: number;
  /** qx[sex][0..maxAge], q[maxAge] = 1. */
  qx: Record<Sex, number[]>;
  factors: Record<FactorId, Record<string, HRTriple>>;
  factorStatus: Record<FactorId, string>;
  factorsVersion: string;
  prevalence: {
    groupCentres: number[];
    base: Record<string, Record<string, number>>;
    exSmokerRamps: { level: string; from: number; to: number }[];
  };
  /** C[sex][age − cFrom], ages cFrom..cTo. */
  C: Record<Sex, number[]>;
  cFrom: number;
  cTo: number;
  params: EngineParams;
  statuses: string[];
}

/** Level order per factor, worst → best by HR (used for "one level up" actions and for iteration). */
export const LEVELS: Record<FactorId, string[]> = {
  act: ['0', '1-74', '75-149', '150-299', '300+'],
  fit: ['hard', 'mod', 'easy'],
  str: ['0', '1', '2+'],
  smk: ['20+', '10-19', '<10', 'q<5', 'q5-15', 'q>15', 'never'],
  diet: ['low', 'mid', 'high'],
  whtr: ['>0.6', '0.5-0.6', '<0.5'],
  bmi: ['35+', '30-35', '<18.5', '25-30', '18.5-25'],
  sleep: ['<6', '9+', '6', '7-8'],
  irreg: ['yes', 'no'],
  alc: ['35+', '25-34', '15-24', '8-14', '0-7'],
  soc: ['iso', 'mid', 'conn'],
};

export function buildDefaultData(): EngineData {
  const maxAge = lifeTableJson.maxAge;
  const qM = [...lifeTableJson.qx.M];
  const qF = [...lifeTableJson.qx.F];
  const qX = qM.map((q, i) => 0.5 * (q + qF[i])); // §1: qx_X = 0.5 (qx_M + qx_F)
  for (const q of [qM, qF, qX]) q[maxAge] = 1;

  const factors = {} as EngineData['factors'];
  const factorStatus = {} as EngineData['factorStatus'];
  for (const [f, def] of Object.entries(factorsJson.factors)) {
    const levels: Record<string, HRTriple> = {};
    for (const [l, v] of Object.entries(def.levels as Record<string, { hr: number; ciLow: number; ciHigh: number }>)) {
      levels[l] = [v.hr, v.ciLow, v.ciHigh];
    }
    factors[f as FactorId] = levels;
    factorStatus[f as FactorId] = def.status;
  }

  const p = paramsJson;
  return {
    maxAge,
    qx: { M: qM, F: qF, X: qX },
    factors,
    factorStatus,
    factorsVersion: factorsJson.version,
    prevalence: {
      groupCentres: prevalenceJson.groupCentres,
      base: prevalenceJson.base as Record<string, Record<string, number>>,
      exSmokerRamps: prevalenceJson.exSmokerRamps,
    },
    C: normalizationJson.C as Record<Sex, number[]>,
    cFrom: normalizationJson.ageFrom,
    cTo: normalizationJson.ageTo,
    params: {
      k: p.k,
      L: p.L,
      rhoBreaks: p.rhoBreaks,
      rhoValues: p.rhoValues,
      hrRef: p.hrRef,
      ws: p.ws as [number, number, number],
      wo: p.wo as [number, number, number],
      hwCoef: p.hwCoef,
      quitT0: p.quitT0,
    },
    statuses: [
      ...Object.values(factorStatus),
      prevalenceJson.status,
      normalizationJson.status,
      p.status,
      lifeTableJson.status,
    ],
  };
}
