// The TS engine must reproduce research/engine-prototype/v4.py (docs/engine.md §13: ±0.01).
// Fixtures: research/engine-prototype/export_for_ts.py → test/fixtures/prototype.json
import { describe, expect, it } from 'vitest';
import fx from './fixtures/prototype.json';
import { createEngine, type EngineAnswers, type Gate, type Sex } from '../src';

const eng = createEngine();
const TOL = fx.tolerance;
type Raw = Record<string, unknown>;
const toAnswers = (a: Raw): EngineAnswers => {
  const { quit_age, ...rest } = a as Raw & { quit_age?: number };
  const out = rest as unknown as EngineAnswers;
  if (quit_age != null) out.quitAge = quit_age;
  return out;
};
const close = (got: number, exp: number, what: string) => {
  if (Math.abs(got - exp) > TOL) throw new Error(`${what}: got ${got}, prototype ${exp}`);
};

describe('parity with the Python prototype', () => {
  it(`compute() on ${fx.cases.length} cases`, () => {
    for (const c of fx.cases) {
      const r = eng.assess(toAnswers(c.answers), c.age, c.sex as Sex, c.gate as Gate);
      const e = c.expected;
      const w = c.name;
      for (const k of ['point', 'baseline', 'spread', 'potentialGain', 'potLow', 'potHigh', 'C'] as const) close(r[k], e[k], `${w} ${k}`);
      close(r.eRem, e.e_rem, `${w} e_rem`);
      expect([r.hw0, r.hw, r.low, r.high, r.display], w).toEqual([e.hw0, e.hw, e.low, e.high, e.display]);
      expect(r.actions.map((a) => a.id), w).toEqual(e.actions.map((a) => a.id));
      r.actions.forEach((a, i) => {
        const x = e.actions[i];
        if (x.gainYears == null) return expect(a.gainYears, w).toBeNull();
        close(a.gainYears!, x.gainYears, `${w} ${a.id} gain`);
        close(a.gainLow!, Math.min(x.gainLow!, x.gainYears), `${w} ${a.id} gainLow`);
        close(a.gainHigh!, Math.max(x.gainHigh!, x.gainYears), `${w} ${a.id} gainHigh`);
        expect(a.hoursPerDay, `${w} ${a.id} hpd`).toBe(x.hoursPerDay);
        expect(a.grade).toBe(x.grade);
        expect(a.kind).toBe(x.kind);
      });
      if (e.biggestLever) {
        expect(r.biggestLever?.actionId, w).toBe(e.biggestLever.actionId);
        expect(r.biggestLever?.kind).toBe(e.biggestLever.kind);
      } else expect(r.biggestLever, w).toBeNull();
      expect(r.isPlaceholder).toBe(true);
    }
  });

  it('what-if', () => {
    for (const c of fx.whatIf) {
      const r = eng.whatIf(toAnswers(c.answers), c.level as EngineAnswers['act'], c.age, c.sex as Sex);
      if (!c.expected) {
        expect(r).toBeNull();
        continue;
      }
      close(r!.point, c.expected.point, 'whatIf point');
      close(r!.potentialGain[0], c.expected.potentialGain[0], 'whatIf potLow');
      close(r!.potentialGain[1], c.expected.potentialGain[1], 'whatIf potHigh');
    }
  });

  it('quit gain', () => {
    for (const c of fx.quitGain) {
      const a = toAnswers(c.answers);
      close(eng.point(a, c.age, c.sex as Sex, true) - eng.point(a, c.age, c.sex as Sex), c.expected, `quit ${c.age}${c.sex}`);
    }
  });
});
