// docs/engine.md §11 anchors (computed by the TS engine itself) and §12 structural tests.
import { describe, expect, it } from 'vitest';
import {
  createEngine,
  creditedGain,
  LEVELS,
  pickActions,
  toEngineAnswers,
  type EngineAnswers,
  type QuestionnaireAnswers,
  type Sex,
} from '../src';

const eng = createEngine();
const TYP: EngineAnswers = { act: '75-149', fit: 'mod', str: '0', smk: 'never', diet: 'mid', bmi: '25-30', sleep: '7-8', irreg: 'no', alc: '0-7', soc: 'mid' };
const BEST: EngineAnswers = { act: '300+', fit: 'easy', str: '2+', smk: 'never', diet: 'high', bmi: '18.5-25', whtr: '<0.5', sleep: '7-8', irreg: 'no', alc: '0-7', soc: 'conn' };
const WORST: EngineAnswers = { act: '0', fit: 'hard', str: '0', smk: '20+', diet: 'low', bmi: '35+', sleep: '<6', irreg: 'yes', alc: '35+', soc: 'iso' };
const SMOKER: EngineAnswers = { act: '0', fit: 'hard', str: '0', smk: '20+', diet: 'low', bmi: '30-35', sleep: '6', irreg: 'no', alc: '0-7', soc: 'mid' };
const mod = (a: EngineAnswers, p: Partial<EngineAnswers>): EngineAnswers => ({ ...a, ...p });
const FIVE = mod(TYP, { smk: 'never', bmi: '18.5-25', act: '150-299', fit: 'easy', alc: '0-7', diet: 'high' });
const NONE = mod(TYP, { smk: '10-19', bmi: '30-35', act: '1-74', fit: 'mod', alc: '15-24', diet: 'low' });
const pt = (a: EngineAnswers, age: number, s: Sex) => eng.point(a, age, s);
const quitGain = (a: EngineAnswers, age: number, s: Sex) => eng.point(a, age, s, true) - eng.point(a, age, s);
const within = (v: number, lo: number, hi: number) => expect(v >= lo - 1e-9 && v <= hi + 1e-9, `${v} in [${lo}, ${hi}]`).toBe(true);

describe('§11 calibration anchors', () => {
  it('A3 Li five vs none @50', () => {
    within(pt(FIVE, 50, 'M') - pt(NONE, 50, 'M'), 12, 14);
    within(pt(FIVE, 50, 'F') - pt(NONE, 50, 'F'), 10.5, 13);
  });
  it('A4 pack/day vs never @40', () => {
    for (const s of ['M', 'F'] as Sex[]) within(pt(TYP, 40, s) - pt(mod(TYP, { smk: '20+' }), 40, s), 8, 10.5);
  });
  it('A5 quit @45 from 10-19', () => {
    for (const s of ['M', 'F'] as Sex[]) within(quitGain(mod(TYP, { smk: '10-19' }), 45, s), 5, 6.5);
  });
  it('A5b quit gradient from 20+ (mean of sexes) 10/9/6/4 ±1.5, decreasing', () => {
    const g = [30, 40, 50, 60].map((a) => (quitGain(mod(TYP, { smk: '20+' }), a, 'M') + quitGain(mod(TYP, { smk: '20+' }), a, 'F')) / 2);
    [10, 9, 6, 4].forEach((t, i) => within(g[i], t - 1.5, t + 1.5));
    for (let i = 0; i < 3; i++) expect(g[i]).toBeGreaterThan(g[i + 1]);
  });
  it('A6 0 → 150-299 (fit mod → easy) @40', () => {
    for (const s of ['M', 'F'] as Sex[]) {
      const a = mod(TYP, { act: '0' });
      const [n] = eng.applyAction(a, 'walk30', s, 40)!;
      within(pt(n, 40, s) - pt(a, 40, s), 1.3, 3);
    }
  });
  it('A7 / A7b alcohol', () => {
    for (const s of ['M', 'F'] as Sex[]) {
      within(pt(TYP, 40, s) - pt(mod(TYP, { alc: '25-34' }), 40, s), 2, 3);
      within(pt(TYP, 40, s) - pt(mod(TYP, { alc: '35+' }), 40, s), 4, 5);
    }
  });
  it('A8 diet mid → high ≤ 3', () => {
    for (const s of ['M', 'F'] as Sex[]) for (const a of [18, 30, 40, 50]) expect(pt(mod(TYP, { diet: 'high' }), a, s) - pt(TYP, a, s)).toBeLessThanOrEqual(3);
  });
  it('A9 worst vs best @50', () => {
    for (const s of ['M', 'F'] as Sex[]) within(pt(BEST, 50, s) - pt(WORST, 50, s), 15, 22);
  });
});

describe('§12 structural', () => {
  it('monotonicity: a lower-HR level never lowers the point', () => {
    for (const base of [TYP, SMOKER, BEST, WORST])
      for (const s of ['M', 'F', 'X'] as Sex[])
        for (const age of [18, 30, 45, 60, 74, 85, 95])
          for (const f of ['act', 'fit', 'str', 'diet', 'sleep', 'irreg', 'alc', 'soc', 'bmi', 'whtr'] as const) {
            // smoking is excluded, as in the prototype: ex-smoker paths (rho term) are not ordered against current levels at every age
            const b0: EngineAnswers = { ...base };
            if (f === 'bmi') delete b0.whtr;
            const pts = LEVELS[f].map((l) => pt({ ...b0, [f]: l } as EngineAnswers, age, s));
            for (let i = 0; i + 1 < pts.length; i++) expect(pts[i + 1], `${f} ${age}${s}`).toBeGreaterThanOrEqual(pts[i] - 1e-9);
          }
  });
  it('quit gain ≥ 0 for every current level, 18–100', () => {
    for (const l of ['<10', '10-19', '20+'] as const)
      for (const s of ['M', 'F'] as Sex[]) for (let a = 18; a <= 100; a++) expect(quitGain(mod(BEST, { smk: l }), a, s)).toBeGreaterThanOrEqual(0);
  });
  it('smoker guard: ≥4 @25–54, ≥3 @55–64, ≥2 @65–74', () => {
    for (const s of ['M', 'F', 'X'] as Sex[])
      for (let a = 25; a < 75; a++) {
        const g = eng.assess(SMOKER, a, s).actions.find((x) => x.id === 'smk_quit_date')!.gainYears!;
        expect(g).toBeGreaterThanOrEqual(a <= 54 ? 4 : a <= 64 ? 3 : 2);
      }
  });
  it('birthday: point(a+1) ≥ point(a) − 0.05 (incl. ex-smokers with stored quit age)', () => {
    const personas: EngineAnswers[] = [TYP, BEST, SMOKER, WORST, mod(TYP, { smk: '10-19' })];
    for (const p of personas)
      for (const s of ['M', 'F', 'X'] as Sex[]) for (let a = 18; a < 100; a++) expect(pt(p, a + 1, s)).toBeGreaterThanOrEqual(pt(p, a, s) - 0.05);
    for (const [lvl, t0] of [['q<5', 2.5], ['q5-15', 10], ['q>15', 20]] as const)
      for (let a0 = 30; a0 < 90; a0 += 7) {
        const p = mod(TYP, { smk: lvl, quitAge: a0 - t0 });
        for (const s of ['M', 'F'] as Sex[]) for (let a = a0; a < 100; a++) expect(pt(p, a + 1, s)).toBeGreaterThanOrEqual(pt(p, a, s) - 0.05);
      }
  });
  it('random sweep: low ≤ high, even width, hw 2–5, potential ≥ max gain ≥ 0, hoursPerDay 0.25–3', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    for (let i = 0; i < 300; i++) {
      const a = {} as Record<string, string>;
      for (const f of ['act', 'fit', 'str', 'smk', 'diet', 'bmi', 'sleep', 'irreg', 'alc', 'soc'] as const) a[f] = pick(LEVELS[f]);
      if (rnd() < 0.15) a.fit = 'dk';
      if (rnd() < 0.1) a.bmi = 'dk';
      const ans = a as unknown as EngineAnswers;
      const r = eng.assess(ans, 18 + Math.floor(rnd() * 82), pick(['M', 'F', 'X'] as Sex[]), pick(['no', 'yes', 'prefer_not'] as const));
      expect(r.low).toBeLessThanOrEqual(r.high);
      expect((r.high - r.low) % 2).toBe(0);
      expect(r.hw).toBeGreaterThanOrEqual(2);
      expect(r.hw).toBeLessThanOrEqual(5);
      expect(r.potentialGain).toBeGreaterThanOrEqual(-1e-9);
      const mx = Math.max(0, ...r.actions.map((x) => x.gainYears ?? 0));
      expect(r.potentialGain).toBeGreaterThanOrEqual(mx - 1e-9);
      for (const x of r.actions) if (x.hoursPerDay != null) within(x.hoursPerDay, 0.25, 3);
      for (const x of r.actions) if (x.gainYears != null) expect(x.gainLow! <= x.gainYears && x.gainYears <= x.gainHigh!).toBe(true);
    }
  });
  it('display per §9', () => {
    expect(eng.assess(TYP, 75, 'M').display).toBe('gain-only');
    expect(eng.assess(TYP, 74, 'M').display).toBe('full');
    expect(eng.assess(TYP, 55, 'M', 'yes').display).toBe('gain-only');
    expect(eng.assess(TYP, 55, 'M', 'prefer_not').display).toBe('full');
    expect(eng.assess(BEST, 45, 'F').display).toBe('maintenance');
    expect(eng.assess(TYP, 55, 'M', 'prefer_not').hw).toBe(eng.assess(TYP, 55, 'M').hw + 1);
  });
  it('creditedGain 0 / 50% / 100%', () => {
    expect([creditedGain(2, 11, true), creditedGain(2, 12, false), creditedGain(2, 25, true), creditedGain(2, 26, false), creditedGain(2, 26, true)]).toEqual([0, 1, 1, 1, 2]);
  });
  it('what-if hidden outside full display', () => {
    expect(eng.whatIf(TYP, '300+', 80, 'M')).toBeNull();
    expect(eng.whatIf(TYP, '300+', 45, 'M', 'no', true)).toBeNull();
  });
  it('determinism and placeholder flag', () => {
    expect(eng.assess(SMOKER, 45, 'M')).toEqual(eng.assess(SMOKER, 45, 'M'));
    expect(eng.isPlaceholder).toBe(true);
  });
  it('rejects ages outside 18..109', () => {
    expect(() => eng.assess(TYP, 17, 'M')).toThrow();
  });
});

describe('questionnaire mapping and action cards', () => {
  const Q: QuestionnaireAnswers = {
    age: 47, sex: 'F', gate: 'no', activity: '1-74', stairs: 'mod', strength: '0', smoking: 'never', hookah: 'no',
    veg: 1, whole: 1, processed: 'few', body: { heightCm: 165, weightKg: 70 }, sleep: '6', regular: false,
    alcohol: 'none', contact: 'weekly', lonely: 'sometimes',
  };
  it('maps answers per §2', () => {
    const a = toEngineAnswers(Q);
    expect(a).toMatchObject({ act: '1-74', fit: 'mod', str: '0', smk: 'never', diet: 'low', bmi: '25-30', sleep: '6', irreg: 'yes', alc: '0-7', soc: 'mid' });
    expect(toEngineAnswers({ ...Q, stairs: 'other' }).fit).toBe('dk');
    expect(toEngineAnswers({ ...Q, body: null }).bmi).toBe('dk');
    expect(toEngineAnswers({ ...Q, body: { heightCm: 170, weightKg: 70, waistCm: 90 } }).whtr).toBe('0.5-0.6');
    expect(toEngineAnswers({ ...Q, contact: 'monthly' }).soc).toBe('iso');
    expect(toEngineAnswers({ ...Q, lonely: 'rarely' }).soc).toBe('conn');
  });
  it('diet sub-actions replace diet_up and are hidden when the gain is 0', () => {
    const a = toEngineAnswers(Q); // scores 1+1+1 = 3 (low) → any +1 reaches mid
    const ids = eng.assess(a, 47, 'F').actions.map((x) => x.id);
    expect(ids).not.toContain('diet_up');
    expect(ids).toEqual(expect.arrayContaining(['veg_each_meal', 'legumes_nuts', 'swap_sweet_drink']));
    const mid = toEngineAnswers({ ...Q, veg: 2, whole: 2 }); // 2+2+1 = 5 → 6 stays mid → no gain
    expect(eng.assess(mid, 47, 'F').actions.map((x) => x.id)).not.toContain('veg_each_meal');
    const rarely = toEngineAnswers({ ...Q, processed: 'rarely' });
    expect(eng.assess(rarely, 47, 'F').actions.map((x) => x.id)).not.toContain('swap_sweet_drink');
  });
  it('picks cards by the product rules', () => {
    const a = toEngineAnswers(Q);
    const r = eng.assess(a, 47, 'F');
    const cards = pickActions(r, a, { age: 47, gateYes: false, smokingTalk: false, isCurrentSmoker: false });
    expect(cards).toHaveLength(3);
    expect(cards[0].id).toBe(r.actions[0].id);
    const old = eng.assess(a, 80, 'F');
    for (const c of pickActions(old, a, { age: 80, gateYes: false, smokingTalk: false, isCurrentSmoker: false }))
      expect(['strength2', 'balance', 'connect', 'walk30']).toContain(c.id);
    const s = toEngineAnswers({ ...Q, smoking: '10-19' });
    const rs = eng.assess(s, 47, 'F');
    expect(rs.biggestLever?.kind).toBe('smoking');
    expect(pickActions(rs, s, { age: 47, gateYes: false, smokingTalk: true, isCurrentSmoker: true })[0].id).toBe('smk_delay_first');
    expect(pickActions(rs, s, { age: 47, gateYes: false, smokingTalk: false, isCurrentSmoker: true }).map((c) => c.id)).not.toContain('smk_quit_date');
    const best = toEngineAnswers({ ...Q, activity: '300+', stairs: 'easy', strength: '2+', veg: 3, whole: 3, processed: 'rarely', body: { heightCm: 170, weightKg: 62 }, sleep: '7-8', regular: true, lonely: 'rarely' });
    const rb = eng.assess(best, 45, 'F');
    expect(rb.display).toBe('maintenance');
    expect(pickActions(rb, best, { age: 45, gateYes: false, smokingTalk: false, isCurrentSmoker: false }).every((c) => c.countDays)).toBe(true);
    const g = pickActions(r, a, { age: 47, gateYes: true, smokingTalk: false, isCurrentSmoker: false });
    expect(g.filter((c) => c.medicalNote).every((c) => ['walk30', 'strength2', 'balance', 'mobility'].includes(c.id))).toBe(true);
  });
  it('contributions: never-smoker gains vs. population average', () => {
    const c = eng.contributions(BEST, 45, 'M');
    expect(c.find((x) => x.factor === 'smk')!.years).toBeGreaterThan(1);
    expect(c.find((x) => x.factor === 'act')!.years).toBeGreaterThan(0);
  });
});
