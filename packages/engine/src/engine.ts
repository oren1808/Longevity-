// Life-expectancy engine, TypeScript port of research/engine-prototype/v4.py (docs/engine.md v4.1).
// Section numbers in comments refer to docs/engine.md. Results must match the prototype to ±0.01
// (packages/engine/test/parity.test.ts).
import { buildDefaultData, LEVELS, type EngineData } from './data';
import type {
  ActionId,
  ActionResult,
  Assessment,
  Bound,
  DietLevel,
  DietScores,
  Display,
  EngineAnswers,
  FactorId,
  Gate,
  Grade,
  Sex,
} from './types';

export const ENGINE_VERSION = '4.1.0';

const CURRENT = ['<10', '10-19', '20+'];
const QUIT = ['q<5', 'q5-15', 'q>15'];
const EW: Record<Grade, number> = { A: 1.0, B: 0.8, C: 0.6 };

type SmokingState = { kind: 'cur' | 'quit' | 'static'; lvl: string };

interface ActionDef {
  factor: FactorId | null;
  adherence: number | null;
  grade: Grade;
  hasYears: boolean;
}

/** Engine-level action definitions (§6). Order matters: it is the tie-break order of the ranking. */
const ACTION_DEFS: Record<ActionId, ActionDef> = {
  walk30: { factor: 'act', adherence: 5 / 7, grade: 'B', hasYears: true },
  strength2: { factor: 'str', adherence: 2 / 7, grade: 'C', hasYears: true },
  smk_quit_date: { factor: 'smk', adherence: null, grade: 'A', hasYears: true },
  diet_up: { factor: 'diet', adherence: 5 / 7, grade: 'C', hasYears: true },
  veg_each_meal: { factor: 'diet', adherence: 5 / 7, grade: 'C', hasYears: true },
  legumes_nuts: { factor: 'diet', adherence: 5 / 7, grade: 'C', hasYears: true },
  swap_sweet_drink: { factor: 'diet', adherence: 5 / 7, grade: 'C', hasYears: true },
  bedtime: { factor: 'sleep', adherence: 5 / 7, grade: 'C', hasYears: true },
  wake_same: { factor: 'irreg', adherence: 6 / 7, grade: 'C', hasYears: true },
  alcohol_free_days: { factor: 'alc', adherence: 4 / 7, grade: 'B', hasYears: true },
  connect: { factor: 'soc', adherence: null, grade: 'C', hasYears: false },
  balance: { factor: null, adherence: null, grade: 'C', hasYears: false },
};
const DIET_SUB_ACTIONS: Record<string, keyof DietScores> = {
  veg_each_meal: 'veg',
  legumes_nuts: 'whole',
  swap_sweet_drink: 'processed',
};

// ------------------------------------------------------------------------------------------
// Pure helpers (§2)
// ------------------------------------------------------------------------------------------
export function dietLevel(s: DietScores): DietLevel {
  const t = s.veg + s.whole + s.processed;
  return t <= 3 ? 'low' : t <= 6 ? 'mid' : 'high';
}
export function socialLevel(contact: 'most' | 'weekly' | 'monthly', lonely: 'rarely' | 'sometimes' | 'often') {
  if (contact === 'monthly' || lonely === 'often') return 'iso' as const;
  if (lonely === 'rarely') return 'conn' as const;
  return 'mid' as const;
}
export function bmiLevel(bmi: number) {
  if (bmi < 18.5) return '<18.5' as const;
  return bmi < 25 ? ('18.5-25' as const) : bmi < 30 ? ('25-30' as const) : bmi < 35 ? ('30-35' as const) : ('35+' as const);
}
export function whtrLevel(r: number) {
  return r < 0.5 ? ('<0.5' as const) : r < 0.6 ? ('0.5-0.6' as const) : ('>0.6' as const);
}
/** Round half up (Python floor(x + 0.5)). */
export const rhu = (x: number) => Math.floor(x + 0.5);
export const roundQuarter = (x: number) => Math.floor(x * 4 + 0.5) / 4;

/** §8 credit schedule. Smoking uses the same schedule with smoke-free weeks. */
export function creditedGain(gain: number, weeksFull: number, monthlyAllConfirmed: boolean): number {
  if (weeksFull < 12) return 0;
  if (weeksFull < 26) return 0.5 * gain;
  return monthlyAllConfirmed ? gain : 0.5 * gain;
}
export function hoursPerWeek(daysDone: number, doseDays: number, hpd: number | null): number | null {
  return hpd == null ? null : roundQuarter(Math.min(daysDone, doseDays) * hpd);
}

// ------------------------------------------------------------------------------------------
// Engine
// ------------------------------------------------------------------------------------------
export function createEngine(data: EngineData = buildDefaultData()) {
  const P = data.params;
  const F = data.factors;
  const MAX = data.maxAge;
  const LN1Q: Record<Sex, Float64Array> = { M: lnq('M'), F: lnq('F'), X: lnq('X') };
  function lnq(s: Sex) {
    const out = new Float64Array(MAX);
    for (let x = 0; x < MAX; x++) out[x] = Math.log(1 - data.qx[s][x]);
    return out;
  }
  const isPlaceholder = data.statuses.some((s) => s === 'placeholder');

  // ---------------- prevalence (§1, README "Interpretation choices")
  const ramp = (a: number, lo: number, hi: number) => Math.min(1, Math.max(0, (a - lo) / (hi - lo)));
  function groupPrev(f: string, sex: 'M' | 'F', centre: number): Record<string, number> {
    const base = data.prevalence.base[`${f}_${sex}`] ?? data.prevalence.base[f];
    const p = { ...base };
    if (f === 'smk') {
      for (const r of data.prevalence.exSmokerRamps) {
        const keep = p[r.level] * ramp(centre, r.from, r.to);
        p.never += p[r.level] - keep;
        p[r.level] = keep;
      }
    }
    return p;
  }
  /** Prevalence of each level of factor f at a single age (linear interpolation between 10-year group centres). */
  function prev(f: string, sex: Sex, age: number): Record<string, number> {
    if (sex === 'X') {
      const m = prev(f, 'M', age);
      const w = prev(f, 'F', age);
      const out: Record<string, number> = {};
      for (const k of Object.keys(m)) out[k] = 0.5 * m[k] + 0.5 * w[k];
      return out;
    }
    const gc = data.prevalence.groupCentres;
    const a = Math.min(Math.max(age, gc[0]), gc[gc.length - 1]);
    const i = Math.min(Math.floor((a - gc[0]) / 10), gc.length - 2);
    const c0 = gc[i];
    const t = (a - c0) / 10;
    const p0 = groupPrev(f, sex, c0);
    const p1 = groupPrev(f, sex, c0 + 10);
    const out: Record<string, number> = {};
    for (const k of Object.keys(p0)) out[k] = (1 - t) * p0[k] + t * p1[k];
    return out;
  }
  function meanHr(f: FactorId, sex: Sex, age: number, b: Bound): number {
    const p = prev(f, sex, age);
    let s = 0;
    for (const l of LEVELS[f]) if (l in p) s += p[l] * F[f][l][b];
    return s;
  }
  /** 'dk' → prevalence-weighted mean HR for the user's sex and age (§2). */
  function hr(f: FactorId, lvl: string, b: Bound, sex: Sex, age: number): number {
    return lvl === 'dk' ? meanHr(f, sex, age, b) : F[f][lvl][b];
  }

  // ---------------- §2 answer → HR
  function smokingLevel(ans: EngineAnswers): SmokingState {
    const s = ans.smk ?? 'never';
    const h = ans.hookah ?? 'no';
    if (CURRENT.includes(s)) {
      if (h === 'daily' && F.smk['<10'][0] > F.smk[s][0]) return { kind: 'cur', lvl: '<10' };
      return { kind: 'cur', lvl: s };
    }
    if (h === 'daily') return { kind: 'cur', lvl: '<10' };
    if (h === 'sometimes' && F.smk['q5-15'][0] > F.smk[s][0] && !QUIT.includes(s)) return { kind: 'static', lvl: 'q5-15' };
    if (QUIT.includes(s)) return { kind: 'quit', lvl: s };
    return { kind: 'static', lvl: 'never' };
  }
  function actfitHr(ans: EngineAnswers, b: Bound, sex: Sex, age: number) {
    const ha = hr('act', ans.act, b, sex, age);
    const fit = ans.fit ?? 'dk';
    if (fit === 'dk') return ha; // fitness dk (incl. "can't climb stairs for another reason") → activity alone
    return Math.max(ha, hr('fit', fit, b, sex, age));
  }
  function weightHr(ans: EngineAnswers, b: Bound, sex: Sex, age: number) {
    const w = ans.whtr;
    const bm = ans.bmi ?? 'dk';
    if (w && w !== 'dk') {
      let h = F.whtr[w][b];
      if (bm === '<18.5') h = Math.max(h, F.bmi[bm][b]);
      return h;
    }
    return hr('bmi', bm, b, sex, age);
  }
  function clusterLnSum(ans: EngineAnswers, b: Bound, sex: Sex, age: number) {
    return (
      Math.log(actfitHr(ans, b, sex, age)) +
      Math.log(hr('str', ans.str, b, sex, age)) +
      Math.log(hr('diet', ans.diet, b, sex, age)) +
      Math.log(weightHr(ans, b, sex, age)) +
      Math.log(hr('sleep', ans.sleep, b, sex, age)) +
      Math.log(hr('irreg', ans.irreg, b, sex, age)) +
      Math.log(hr('soc', ans.soc, b, sex, age))
    );
  }

  // ---------------- §3 H(x)
  const lin = (x: number, [a0, a1, v1]: [number, number, number]) =>
    x <= a0 ? 1 : x >= a1 ? v1 : 1 + ((v1 - 1) * (x - a0)) / (a1 - a0);
  function rho(Q: number) {
    let i = 0;
    for (const br of P.rhoBreaks) if (Q >= br) i++;
    return P.rhoValues[i];
  }
  /** HR_smk(x) for x = a..MAX−1, before attenuation (§3.1). */
  function smkPath(state: SmokingState, a: number, b: Bound, quitNow: boolean, quitAge?: number): Float64Array {
    const n = MAX - a;
    const out = new Float64Array(n);
    let t0: number, Q: number, ref: number;
    if (quitNow) {
      if (state.kind !== 'cur') throw new Error('quitNow requires a current smoker');
      t0 = 0;
      Q = a;
      ref = F.smk[state.lvl][b]; // quit action: HR_ref = HR_current
    } else if (state.kind === 'quit') {
      t0 = P.quitT0[state.lvl];
      Q = a - t0;
      if (quitAge != null) {
        Q = quitAge; // stored once at the first assessment; t advances with age, Q fixed
        t0 = Math.max(a - Q, 0);
      }
      ref = b === 0 ? P.hrRef : (P.hrRef * F.smk['10-19'][b]) / F.smk['10-19'][0];
    } else {
      out.fill(F.smk[state.lvl][b]);
      return out;
    }
    const r = rho(Q) * (ref - 1);
    for (let j = 0; j < n; j++) {
      const t = t0 + j;
      const tier = t < 5 ? F.smk['q<5'][b] : t < 15 ? F.smk['q5-15'][b] : F.smk['q>15'][b];
      out[j] = tier + r;
    }
    return out;
  }
  function Hpath(ans: EngineAnswers, a: number, sex: Sex, b: Bound, quitNow: boolean): Float64Array {
    const n = MAX - a;
    const sp = smkPath(smokingLevel(ans), a, b, quitNow, ans.quitAge);
    const hAlc = hr('alc', ans.alc, b, sex, a);
    const S = P.k * clusterLnSum(ans, b, sex, a);
    const capped = Math.exp(P.L * Math.tanh(S / P.L));
    const out = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const x = a + j;
      const ws = lin(x, P.ws);
      const wo = lin(x, P.wo);
      const hs = 1 + (sp[j] - 1) * ws;
      const ha = 1 + (hAlc - 1) * wo;
      const hc = 1 + (capped - 1) * wo; // attenuation on the capped cluster
      out[j] = hs * ha * hc;
    }
    return out;
  }

  // ---------------- §4 normalisation and life expectancy
  /** e_a = 0.5 + Σ_{k=1}^{110−a} Π_{j<k} (1 − q'_{a+j}),  q' = 1 − (1 − q)^(H/C). */
  function eRem(H: ArrayLike<number> | null, a: number, sex: Sex, C: number) {
    const l = LN1Q[sex];
    let cum = 0;
    let e = 0.5;
    for (let j = 0; j < MAX - a; j++) {
      cum += (H ? H[j] : 1) * l[a + j];
      e += Math.exp(cum / C);
    }
    return e;
  }
  const cbsE = (sex: Sex, a: number) => eRem(null, a, sex, 1);
  function Cconst(sex: Sex, a: number) {
    const aa = Math.min(Math.max(a, data.cFrom), data.cTo);
    return data.C[sex][aa - data.cFrom];
  }
  function checkAge(age: number) {
    if (!Number.isInteger(age) || age < 18 || age >= MAX) throw new RangeError(`age must be an integer 18..${MAX - 1}`);
  }
  function ev(ans: EngineAnswers, a: number, sex: Sex, b: Bound = 0, quitNow = false, C?: number) {
    return eRem(Hpath(ans, a, sex, b, quitNow), a, sex, C ?? Cconst(sex, a));
  }
  function point(ans: EngineAnswers, age: number, sex: Sex, quitNow = false) {
    checkAge(age);
    return age + ev(ans, age, sex, 0, quitNow);
  }

  // ---------------- §6 actions
  /** For one-level actions from 'dk': the best level whose HR ≥ the mean HR (prototype INTERP). */
  function dkLevel(f: FactorId, sex: Sex, age: number) {
    const m = meanHr(f, sex, age, 0);
    const cands = LEVELS[f].filter((l) => F[f][l][0] >= m - 1e-12);
    return cands.length ? cands[cands.length - 1] : LEVELS[f][0];
  }
  function up(f: FactorId, cur: string) {
    return LEVELS[f][LEVELS[f].indexOf(cur) + 1];
  }
  /** → [new answers, quitNow] or null if the action is not offered. */
  function applyAction(ans: EngineAnswers, id: ActionId, sex: Sex, age: number): [EngineAnswers, boolean] | null {
    const n: EngineAnswers = { ...ans };
    switch (id) {
      case 'walk30': {
        const cur = ans.act;
        if (cur === 'dk') {
          if (meanHr('act', sex, age, 0) <= F.act['150-299'][0]) return null;
        } else if (LEVELS.act.indexOf(cur) >= LEVELS.act.indexOf('150-299')) return null;
        n.act = '150-299';
        if (ans.fit === 'hard' || ans.fit === 'mod') n.fit = up('fit', ans.fit) as EngineAnswers['fit'];
        return [n, false];
      }
      case 'strength2':
        if (ans.str === '2+') return null;
        n.str = '2+';
        return [n, false];
      case 'smk_quit_date':
        return smokingLevel(ans).kind === 'cur' ? [n, true] : null;
      case 'diet_up': {
        if (ans.dietScores) return null;
        const cur = ans.diet === 'dk' ? dkLevel('diet', sex, age) : ans.diet;
        if (cur === 'high') return null;
        n.diet = up('diet', cur) as DietLevel;
        return [n, false];
      }
      case 'veg_each_meal':
      case 'legumes_nuts':
      case 'swap_sweet_drink': {
        if (!ans.dietScores) return null;
        const key = DIET_SUB_ACTIONS[id];
        if (ans.dietScores[key] >= 3) return null;
        n.dietScores = { ...ans.dietScores, [key]: ans.dietScores[key] + 1 };
        n.diet = dietLevel(n.dietScores);
        return [n, false];
      }
      case 'bedtime':
        if (ans.sleep !== '<6' && ans.sleep !== '6') return null; // never from 9+ (or 7–8)
        n.sleep = '7-8';
        return [n, false];
      case 'wake_same':
        if (ans.irreg !== 'yes') return null;
        n.irreg = 'no';
        return [n, false];
      case 'alcohol_free_days': {
        const cur = ans.alc === 'dk' ? dkLevel('alc', sex, age) : ans.alc;
        if (cur === '0-7') return null;
        n.alc = up('alc', cur) as EngineAnswers['alc'];
        return [n, false];
      }
      case 'connect':
        return ans.soc !== 'conn' ? [n, false] : null;
      case 'balance':
        return age >= 75 ? [n, false] : null;
    }
  }
  const YEAR_ACTIONS = (Object.keys(ACTION_DEFS) as ActionId[]).filter((k) => ACTION_DEFS[k].hasYears);
  const MERGE_FIELDS = ['act', 'fit', 'str', 'diet', 'sleep', 'irreg', 'alc'] as const;

  /** §6: all year-actions at target together (no weight, no social). */
  function potentialAnswers(ans: EngineAnswers, sex: Sex, age: number): [EngineAnswers, boolean] {
    const n: EngineAnswers = { ...ans, dietScores: ans.dietScores ? { ...ans.dietScores } : undefined };
    let qn = false;
    for (const id of YEAR_ACTIONS) {
      const r = applyAction(ans, id, sex, age);
      if (!r) continue;
      const [nw, q] = r;
      qn = qn || q;
      for (const f of MERGE_FIELDS) if (nw[f] !== ans[f]) (n as unknown as Record<string, unknown>)[f] = nw[f];
      if (nw.dietScores && ans.dietScores && n.dietScores) {
        for (const k of ['veg', 'whole', 'processed'] as const)
          if (nw.dietScores[k] !== ans.dietScores[k]) n.dietScores[k] = nw.dietScores[k];
      }
    }
    if (n.dietScores) n.diet = dietLevel(n.dietScores);
    return [n, qn];
  }

  function hoursPerDay(gain: number, eTarget: number, adherence: number | null): number | null {
    if (adherence == null) return null;
    const v = roundQuarter((gain * 8766) / (365.25 * eTarget * adherence));
    return Math.min(Math.max(v, 0.25), 3.0);
  }

  // ---------------- §5 range, §9 display, full compute
  function assess(ans: EngineAnswers, age: number, sex: Sex, gate: Gate = 'no'): Assessment {
    checkAge(age);
    const C = Cconst(sex, age);
    const E = (a: EngineAnswers, b: Bound, qn = false) => ev(a, age, sex, b, qn, C);
    const e0 = E(ans, 0);
    const elo = E(ans, 1); // all HR at CI lower → longer
    const ehi = E(ans, 2);
    const pt = age + e0;
    const spread = elo - ehi;
    const hw0 = Math.min(Math.max(rhu(P.hwCoef * e0 + 0.5 * spread), 2), 4);
    const dk = Object.values(ans).some((v) => v === 'dk');
    const mods = Math.min(1, +(sex === 'X') + +dk + +(age >= 18 && age <= 24) + +(gate === 'prefer_not'));
    const hw = hw0 + mods;

    const acts: ActionResult[] = [];
    for (const id of Object.keys(ACTION_DEFS) as ActionId[]) {
      const def = ACTION_DEFS[id];
      const r = applyAction(ans, id, sex, age);
      if (!r) continue;
      const [n, qn] = r;
      if (def.hasYears) {
        const et = E(n, 0, qn);
        const g = et - e0;
        if (DIET_SUB_ACTIONS[id] && Math.abs(g) < 1e-9) continue; // §6: diet action with zero gain is hidden
        const gl = E(n, 2, qn) - ehi;
        const gh = E(n, 1, qn) - elo;
        const hpd = id === 'smk_quit_date' ? null : hoursPerDay(g, et, def.adherence);
        acts.push({
          id,
          gainYears: g,
          // §6: CI range widened so it always contains the point gain (soft cap can push it outside)
          gainLow: Math.min(gl, gh, g),
          gainHigh: Math.max(gl, gh, g),
          hoursPerDay: hpd,
          grade: def.grade,
          score: g * EW[def.grade],
          kind: def.factor === 'smk' ? 'smoking' : 'habit',
        });
      } else {
        acts.push({ id, gainYears: null, gainLow: null, gainHigh: null, hoursPerDay: null, grade: def.grade, score: -1e9, kind: 'persistence' });
      }
    }
    // stable sort; near-equal scores (float noise, e.g. two ×1.05 factors) keep the definition order
    acts.sort((x, y) => (Math.abs(y.score - x.score) < 1e-9 ? 0 : y.score - x.score));

    const [pn, pq] = potentialAnswers(ans, sex, age);
    const pot = E(pn, 0, pq) - e0;
    const potl = E(pn, 2, pq) - ehi;
    const poth = E(pn, 1, pq) - elo;
    const potLow = Math.min(potl, poth, pot);
    const potHigh = Math.max(potl, poth, pot);

    let display: Display;
    if (age >= 75 || gate === 'yes') display = 'gain-only';
    else if (potHigh < 0.5) display = 'maintenance';
    else display = 'full';

    const big = acts.length && acts[0].gainYears != null ? acts[0] : null;
    return {
      point: pt,
      baseline: age + cbsE(sex, age),
      eRem: e0,
      spread,
      hw0,
      hw,
      low: rhu(pt) - hw,
      high: rhu(pt) + hw,
      potentialGain: pot,
      potLow,
      potHigh,
      actions: acts,
      display,
      C,
      biggestLever: big ? { actionId: big.id, gainYears: big.gainYears as number, kind: big.kind } : null,
      isPlaceholder,
      engineVersion: ENGINE_VERSION,
      factorsVersion: data.factorsVersion,
    };
  }

  /** §10: activity only, five stops. Hidden (null) in gain-only / maintenance / hide-number. */
  function whatIf(ans: EngineAnswers, level: EngineAnswers['act'], age: number, sex: Sex, gate: Gate = 'no', hideNumber = false) {
    const base = assess(ans, age, sex, gate);
    if (base.display !== 'full' || hideNumber) return null;
    const r = assess({ ...ans, act: level }, age, sex, gate);
    return { point: r.point, potentialGain: [r.potLow, r.potHigh] as [number, number] };
  }

  /**
   * "What is already working for you" (design.md screen 9): per factor, the user's point minus the
   * prevalence-weighted average point when only that factor varies over the population of the same
   * age and sex. Positive values only are meant for display.
   */
  function contributions(ans: EngineAnswers, age: number, sex: Sex) {
    checkAge(age);
    const base = point(ans, age, sex);
    const out: { factor: 'act' | 'str' | 'smk' | 'diet' | 'weight' | 'sleep' | 'irreg' | 'alc' | 'soc'; years: number }[] = [];
    const avg = (variants: [Partial<EngineAnswers>, number][]) => {
      let s = 0;
      let w = 0;
      for (const [patch, p] of variants) {
        s += p * point({ ...ans, ...patch }, age, sex);
        w += p;
      }
      return s / w;
    };
    const single = (f: FactorId, key: keyof EngineAnswers = f as keyof EngineAnswers) =>
      Object.entries(prev(f, sex, age)).map(([l, p]) => [{ [key]: l } as Partial<EngineAnswers>, p] as [Partial<EngineAnswers>, number]);
    // activity + fitness vary together (independent prevalence)
    const pa = prev('act', sex, age);
    const pf = prev('fit', sex, age);
    const af: [Partial<EngineAnswers>, number][] = [];
    for (const [la, wa] of Object.entries(pa)) for (const [lf, wf] of Object.entries(pf)) af.push([{ act: la as EngineAnswers['act'], fit: lf as EngineAnswers['fit'] }, wa * wf]);
    out.push({ factor: 'act', years: base - avg(af) });
    out.push({ factor: 'str', years: base - avg(single('str')) });
    out.push({ factor: 'smk', years: base - avg(single('smk').map(([p, w]) => [{ ...p, hookah: 'no', quitAge: undefined }, w])) });
    if (ans.dietScores) {
      // diet varies as a level; drop sub-scores for the comparison
      out.push({ factor: 'diet', years: base - avg(single('diet').map(([p, w]) => [{ ...p, dietScores: undefined }, w])) });
    } else out.push({ factor: 'diet', years: base - avg(single('diet')) });
    out.push({
      factor: 'weight',
      years: ans.whtr && ans.whtr !== 'dk' ? base - avg(single('whtr')) : base - avg(single('bmi')),
    });
    out.push({ factor: 'sleep', years: base - avg(single('sleep')) });
    out.push({ factor: 'irreg', years: base - avg(single('irreg')) });
    out.push({ factor: 'alc', years: base - avg(single('alc')) });
    out.push({ factor: 'soc', years: base - avg(single('soc')) });
    return out;
  }

  return {
    data,
    assess,
    point,
    whatIf,
    contributions,
    applyAction,
    smokingLevel,
    prevalence: prev,
    cbsExpectancy: (sex: Sex, age: number) => age + cbsE(sex, age),
    C: Cconst,
    hoursPerDay,
    isPlaceholder,
  };
}

export type Engine = ReturnType<typeof createEngine>;
export { ACTION_DEFS };
