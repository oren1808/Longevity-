"""v4 tests: calibration anchors A1-A9 (docs/engine.md §11), structural tests (§12) and persona table.
Run:  python v4_tests.py            (uses v4.PARAMS, i.e. the calibrated values)
      python v4_tests.py --spec     (uses the literal docs/engine.md values, v4.PARAMS_SPEC)
"""
import sys, math, random
import numpy as np
import v4
from v4 import point, compute, cbs_e, ev

# §11 definitions
TYP = dict(act='75-149', fit='mod', str='0', smk='never', diet='mid', bmi='25-30', sleep='7-8', irreg='no', alc='0-7', soc='mid')
def modal(sex, age):                     # most common answer per question, by sex (and age)
    return {f: max(v4.prev(f, sex, age).items(), key=lambda kv: kv[1])[0]
            for f in ['act', 'fit', 'str', 'smk', 'diet', 'bmi', 'sleep', 'irreg', 'alc', 'soc']}
BEST = dict(act='300+', fit='easy', str='2+', smk='never', diet='high', bmi='18.5-25', whtr='<0.5', sleep='7-8', irreg='no', alc='0-7', soc='conn')
WORST = dict(act='0', fit='hard', str='0', smk='20+', diet='low', bmi='35+', sleep='<6', irreg='yes', alc='35+', soc='iso')
SMOKER = dict(act='0', fit='hard', str='0', smk='20+', diet='low', bmi='30-35', sleep='6', irreg='no', alc='0-7', soc='mid')
def mod(a, **k): b = dict(a); b.update(k); return b
FIVE = mod(TYP, smk='never', bmi='18.5-25', act='150-299', fit='easy', alc='0-7', diet='high')
NONE = mod(TYP, smk='10-19', bmi='30-35', act='1-74', fit='mod', alc='15-24', diet='low')

def quit_gain(ans, age, sex, P=None): return point(ans, age, sex, True, P) - point(ans, age, sex, False, P)

def anchors(P=None, sexes='MF'):
    """returns list of (id, label, value, lo, hi, ok)"""
    R = []
    def add(i, lbl, v, lo, hi, ok=None):
        R.append((i, lbl, v, lo, hi, (lo - 1e-9 <= v <= hi + 1e-9) if ok is None else ok))
    for s in sexes:
        add('A3', f'Li @50 {s}: five vs none', point(FIVE, 50, s, P=P) - point(NONE, 50, s, P=P), *((12, 14) if s == 'M' else (10.5, 13)))  # engine.md v4.1 §11 A3
    for s in sexes:
        add('A4', f'pack/day vs never @40 {s}', point(TYP, 40, s, P=P) - point(mod(TYP, smk='20+'), 40, s, P=P), 8, 10.5)
    for s in sexes:
        add('A5', f'quit @45 from 10-19 {s}', quit_gain(mod(TYP, smk='10-19'), 45, s, P), 5, 6.5)
    # A5b: Jha 2013 gains (10/9/6/4) are for the average US smoker (all-cause HR ~2.8-3.0 = our '20+' level).
    # Evaluated from '20+' (anchor) and, for information only, from '10-19' (literal continuation of A5; provably infeasible).
    # engine.md v4.1: target applies to the mean of both sexes; per-sex values printed as INFO
    gs = {s: [quit_gain(mod(TYP, smk='20+'), a, s, P) for a in (30, 40, 50, 60)] for s in ('M', 'F')}
    for s in ('M', 'F'):
        add('A5b', f'quit gradient decreasing (20+) {s}', float(all(gs[s][i] > gs[s][i + 1] for i in range(3))), 1, 1)
        for a, gi, tgt in zip((30, 40, 50, 60), gs[s], (10, 9, 6, 4)):
            add('INFO', f'A5b quit @{a} from 20+ {s}', gi, tgt - 1.5, tgt + 1.5)
    for i, (a, tgt) in enumerate(zip((30, 40, 50, 60), (10, 9, 6, 4))):
        add('A5b', f'quit @{a} from 20+ mean(M,F)', (gs['M'][i] + gs['F'][i]) / 2, tgt - 1.5, tgt + 1.5)
    for s in sexes:
        g = [quit_gain(mod(TYP, smk='10-19'), a, s, P) for a in (30, 40, 50, 60)]
        for a, gi, tgt in zip((30, 40, 50, 60), g, (10, 9, 6, 4)):
            add('INFO', f'A5b literal: quit @{a} from 10-19 {s}', gi, tgt - 1.5, tgt + 1.5)
    for s in sexes:
        a = mod(TYP, act='0'); n, _ = v4.apply_action(a, 'walk30', s, 40)
        add('A6', f'0 -> 150-299 (fit mod->easy) @40 {s}', point(n, 40, s, P=P) - point(a, 40, s, P=P), 1.3, 3)
    for s in sexes:
        add('A7', f'alc 25-34 vs 0-7 @40 {s}', point(TYP, 40, s, P=P) - point(mod(TYP, alc='25-34'), 40, s, P=P), 2, 3)
        add('A7b', f'alc 35+ vs 0-7 @40 {s}', point(TYP, 40, s, P=P) - point(mod(TYP, alc='35+'), 40, s, P=P), 4, 5)
    for s in sexes:
        v = max(point(mod(TYP, diet='high'), a, s, P=P) - point(TYP, a, s, P=P) for a in (18, 30, 40, 50))
        add('A8', f'diet mid->high (max over ages 18-50) {s}', v, -99, 3)
    for s in sexes:
        add('A9', f'worst vs best @50 {s}', point(BEST, 50, s, P=P) - point(WORST, 50, s, P=P), 15, 22)
    return R

def anchor_A1(P=None):
    out = []
    for s in 'MFX':
        T = v4.C_table(s, P); worst = (0, None)
        for a in v4.C_AGES:
            C = v4.Cconst(s, a, P)
            e = v4.e_rem(v4.pop_H(s, a, P or v4.PARAMS), a, s, C).mean() - cbs_e(s, a)
            if abs(e) > abs(worst[0]): worst = (e, a)
        out.append(('A1', f'pop mean - CBS, worst over 18-100, sex {s} (age {worst[1]})', worst[0], -0.2, 0.2, abs(worst[0]) <= 0.2))
    return out

def anchor_A2(P=None):
    out = []
    for s in 'MF':
        vals = [(point(modal(s, a), a, s, P=P) - a - cbs_e(s, a), a) for a in range(18, 75)]
        lo = min(vals); hi = max(vals)
        out.append(('A2', f'modal persona - CBS, ages 18-74 {s}: min {lo[0]:+.2f}@{lo[1]} max', hi[0], 0, 3.5, lo[0] >= 0 and hi[0] <= 3.5))
    return out

def print_table(rows, title):
    print(f'\n=== {title} ===')
    print(f"{'id':5s} {'test':58s} {'value':>8s}  {'target':>13s}  result")
    for i, lbl, v, lo, hi, ok in rows:
        tgt = f'[{lo:g}, {hi:g}]' if lo > -99 else f'<= {hi:g}'
        res = ('PASS' if ok else 'FAIL') if i != 'INFO' else ('(in)' if ok else '(out)') + ' info only'
        print(f"{i:5s} {lbl:58s} {v:8.2f}  {tgt:>13s}  {res}")
    return all(r[5] for r in rows if r[0] != 'INFO')

# ---------------------------------------------------------------- structural (§12)
SMK_ORDER = ['20+', '10-19', '<10', 'q<5', 'q5-15', 'q>15', 'never']
ORD = dict(v4.ORDER); ORD['bmi'] = ['35+', '30-35', '<18.5', '25-30', '18.5-25']; ORD['whtr'] = ['>0.6', '0.5-0.6', '<0.5']

def structural(P=None):
    R = []
    def add(lbl, ok, detail=''): R.append((lbl, ok, detail))
    # monotonicity: improvement (lower HR) never lowers the point
    viol = []
    for base in (TYP, SMOKER, BEST, WORST, mod(SMOKER, act='300+', fit='easy')):
        for s in 'MFX':
            for age in (18, 30, 45, 59, 60, 74, 75, 85, 95):
                for f, order in ORD.items():
                    b0 = {k: v for k, v in base.items() if not (f == 'bmi' and k == 'whtr')}   # bmi only counts without waist
                    pts = [ev(mod(b0, **{f: l}), age, s, P=P) for l in order]
                    viol += [(f, order[i], order[i + 1], age, s, round(pts[i + 1] - pts[i], 3)) for i in range(len(pts) - 1) if pts[i + 1] < pts[i] - 1e-9]
                # current smoking levels vs ex-levels: compare each ex-level with each current level
    add('monotonicity (HR-ordered levels, 5 bases x 3 sexes x 9 ages)', not viol, f'{len(viol)} violations {viol[:4]}')
    # quit action never negative for any current level (direct consequence of the rho term)
    neg = [(l, s, a, round(quit_gain(mod(b_, smk=l), a, s, P), 2)) for b_ in (TYP, BEST) for l in v4.CURRENT for s in 'MF' for a in range(18, 101, 1)
           if quit_gain(mod(b_, smk=l), a, s, P) < 0]
    add('quit gain >= 0 for every current level, age 18-100', not neg, f'{len(neg)} negatives {neg[:4]}')
    # random sweep
    random.seed(11); bad = dict(lowhigh=0, pot0=0, potmax=0, hw=0, even=0, hpd=0); ex = {}
    LV = {f: list(v4.F[f]) for f in v4.F}
    for i in range(400):
        a = {f: random.choice(LV[f]) for f in ['act', 'fit', 'str', 'smk', 'diet', 'bmi', 'sleep', 'irreg', 'alc', 'soc']}
        if random.random() < 0.15: a['fit'] = 'dk'
        if random.random() < 0.10: a['bmi'] = 'dk'
        if random.random() < 0.10: a['hookah'] = random.choice(['sometimes', 'daily'])
        s = random.choice('MFX'); age = random.randint(18, 99); gate = random.choice(['no', 'no', 'yes', 'prefer_not'])
        r = compute(a, age, s, gate, P)
        if r['low'] > r['high']: bad['lowhigh'] += 1
        if r['potentialGain'] < -1e-9: bad['pot0'] += 1; ex.setdefault('pot0', (a, age, s, r['potentialGain']))
        mx = max([x['gainYears'] for x in r['actions'] if x['gainYears'] is not None] or [0])
        if r['potentialGain'] < mx - 1e-9: bad['potmax'] += 1; ex.setdefault('potmax', (a, age, s, r['potentialGain'], mx))
        if not 2 <= r['hw'] <= 5: bad['hw'] += 1
        if (r['high'] - r['low']) % 2: bad['even'] += 1
        for x in r['actions']:
            if x['hoursPerDay'] is not None and not 0.25 <= x['hoursPerDay'] <= 3: bad['hpd'] += 1
    add('low <= high (400 random)', bad['lowhigh'] == 0, str(bad['lowhigh']))
    add('potentialGain >= 0', bad['pot0'] == 0, f"{bad['pot0']} {ex.get('pot0', '')}")
    add('potentialGain >= max(gainYears)', bad['potmax'] == 0, f"{bad['potmax']} {ex.get('potmax', '')}")
    add('half-width in [2,5]', bad['hw'] == 0, str(bad['hw']))
    add('width even', bad['even'] == 0, str(bad['even']))
    add('hoursPerDay in [0.25,3] or null', bad['hpd'] == 0, str(bad['hpd']))
    # smoker guard
    worst_g = min((next(x['gainYears'] for x in compute(SMOKER, a, s, P=P)['actions'] if x['id'] == 'smk_quit_date'), a, s)
                  for a in range(25, 75) for s in 'MFX')
    add('INFO (v4 wording) smoker guard >= 4 at all ages 25-74', True, f'min {worst_g[0]:.2f} at {worst_g[1]}{worst_g[2]}')
    gq = {(a, s): next(x['gainYears'] for x in compute(SMOKER, a, s, P=P)['actions'] if x['id'] == 'smk_quit_date') for a in range(25, 75) for s in 'MFX'}
    last4 = min(a for a in range(25, 75) if min(gq[(a, s)] for s in 'MFX') < 4)
    bands = ((25, 54, 4), (55, 64, 3), (65, 74, 2))
    add('smoker guard by band (engine.md v4.1): >=4 @25-54, >=3 @55-64, >=2 @65-74',
        all(min(v for (a, s), v in gq.items() if lo <= a <= hi) >= t for lo, hi, t in bands), '')
    add('  (info) smoker guard: last age with gain >= 4 is ' + str(last4 - 1) + '; min by band 25-54/55-64/65-74', True,
        ' / '.join(f"{min(v for (a, s), v in gq.items() if lo <= a <= hi):.2f}" for lo, hi in ((25, 54), (55, 64), (65, 74))))
    # birthday
    PERS = [TYP, BEST, SMOKER, WORST, modal('M', 45), mod(TYP, smk='10-19'), mod(TYP, smk='q<5'), mod(TYP, smk='q5-15'), mod(TYP, smk='q>15')]
    drops = []
    for i, p in enumerate(PERS):
        for s in 'MFX':
            pts = [point(p, a, s, P=P) for a in range(18, 101)]
            for a in range(18, 100):
                d = pts[a + 1 - 18] - pts[a - 18]
                if d < -0.05: drops.append((i, s, a, round(d, 2)))
    cur = [d for d in drops if d[0] <= 5]; exs = [d for d in drops if d[0] > 5]
    add('birthday: point(a+1) >= point(a)-0.05, personas (never/current smokers)', not cur, f'{len(cur)} drops, worst {sorted(cur, key=lambda d: d[3])[:3]}')
    add('INFO (superseded) birthday: ex-smokers with moving quit age', True, f'{len(exs)} drops, worst {sorted(exs, key=lambda d: d[3])[:3]}')
    # proposed fix: store the age at quitting at first assessment (Q fixed, time since quitting advances)
    drops2 = []
    for lvl in ('q<5', 'q5-15', 'q>15'):
        for a0 in range(18, 90, 4):
            if a0 - v4.QUIT[lvl] < 15: continue
            p = mod(TYP, smk=lvl, quit_age=a0 - v4.QUIT[lvl])
            for s in 'MF':
                pts = [point(p, a, s, P=P) for a in range(a0, 101)]
                drops2 += [(lvl, a0, s, a0 + i, round(pts[i + 1] - pts[i], 2)) for i in range(len(pts) - 1) if pts[i + 1] - pts[i] < -0.05]
    add('birthday: ex-smokers with stored quit age (engine.md v4.1)', not drops2, f'{len(drops2)} drops {drops2[:3]}')
    # display
    cases = [(TYP, 75, 'M', 'no', 'gain-only'), (TYP, 74, 'M', 'no', 'full'), (TYP, 55, 'M', 'yes', 'gain-only'),
             (TYP, 55, 'M', 'prefer_not', 'full'), (BEST, 45, 'F', 'no', 'maintenance'), (BEST, 80, 'F', 'no', 'gain-only')]
    got = [(compute(a, age, s, g, P)['display'], exp) for a, age, s, g, exp in cases]
    add('display per §9', all(g == e for g, e in got), str(got))
    r1, r2 = compute(TYP, 55, 'M', 'no', P), compute(TYP, 55, 'M', 'prefer_not', P)
    add('gate prefer-not -> +1 half-width', r2['hw'] == r1['hw'] + 1, f"{r1['hw']} -> {r2['hw']}")
    # creditedGain
    cg = [(w, m, v4.credited_gain(2.0, w, m)) for w, m in ((0, True), (11, True), (12, False), (25, True), (26, False), (26, True))]
    add('creditedGain 0/50%/100% (habit and smoking share schedule)', [c[2] for c in cg] == [0, 0, 1, 1, 1, 2], str(cg))
    add('isPlaceholder', compute(TYP, 45, 'M', P=P)['isPlaceholder'] is True)
    a, b = compute(SMOKER, 45, 'M', P=P), compute(SMOKER, 45, 'M', P=P)
    add('determinism', a['point'] == b['point'] and a['low'] == b['low'])
    # whatIf
    w = [v4.what_if(TYP, l, 45, 'M', P=P) for l in v4.ORDER['act']]
    add('whatIf: 5 stops, point non-decreasing with activity', all(w[i + 1]['point'] >= w[i]['point'] for i in range(4)),
        ' '.join(f"{x['point']:.1f}" for x in w))
    add('whatIf hidden in gain-only', v4.what_if(TYP, '300+', 80, 'M', P=P) is None)
    # C monotone
    add('C non-increasing (after isotonic)', all(all(np.diff(v4.C_table(s, P)['iso']) <= 1e-12) for s in 'MFX'))
    return R

def widths(P=None):
    out = []
    for age in (18, 25, 30, 45, 60, 70):
        r = compute(TYP, age, 'M', P=P); out.append(f"{age}: ±{r['hw']} (e_rem {r['e_rem']:.1f}, spread {r['spread']:.2f})")
    return out

PERSONAS = [('Healthy 45F', BEST, 45, 'F', 'no'), ('Typical 50M', TYP, 50, 'M', 'no'),
            ('Pack/day 45M sedentary BMI30-35 poor diet', SMOKER, 45, 'M', 'no'),
            ('Typical 70F', TYP, 70, 'F', 'no'), ('Typical 30M', TYP, 30, 'M', 'no'), ('Typical 80M', TYP, 80, 'M', 'no'),
            ('Typical 45 sex X', TYP, 45, 'X', 'no'), ('Typical 55M gate=yes', TYP, 55, 'M', 'yes')]

def personas(P=None):
    print('\n=== personas ===')
    print('| persona | CBS | point | range (±hw) | display | potential [lo-hi] | biggest lever | top actions: gain [lo-hi] h/day grade |')
    print('|---|---|---|---|---|---|---|---|')
    for nm, a, age, s, g in PERSONAS:
        r = compute(a, age, s, g, P)
        top = '; '.join([f"{x['id']} {x['gainYears']:.2f} [{x['gainLow']:.2f}-{x['gainHigh']:.2f}] {x['hoursPerDay']} {x['grade']}"
                        for x in r['actions'] if x['gainYears'] is not None][:3])
        bl = r['biggestLever']
        print(f"| {nm} | {r['baseline']:.1f} | {r['point']:.1f} | {r['low']}-{r['high']} (±{r['hw']}) | {r['display']} | "
              f"{r['potentialGain']:.1f} [{r['potLow']:.1f}-{r['potHigh']:.1f}] | "
              f"{(bl['actionId'] + ' %.2f' % bl['gainYears'] + (' (smoking)' if bl['kind'] == 'smoking' else '')) if bl else '-'} | {top} |")

if __name__ == '__main__':
    P = dict(v4.PARAMS_SPEC) if '--spec' in sys.argv else None
    if '--raw' in sys.argv: v4.C_SMOOTH = 'raw'
    print('params:', P or v4.PARAMS, '| C smoothing:', v4.C_SMOOTH)
    ok1 = print_table(anchor_A1(P) + anchor_A2(P) + anchors(P), 'calibration anchors (§11)')
    S = structural(P)
    print('\n=== structural tests (§12) ===')
    for lbl, ok, d in S: print(f"{'PASS' if ok else 'FAIL'}  {lbl}  {d}")
    print('\nhalf-width, typical man:', '; '.join(widths(P)), '(spec: ±4 @30, ±3-4 @45, ±3 @60)')
    personas(P)
    print('\nALL ANCHORS PASS' if ok1 else '\nSOME ANCHORS FAIL', '|', 'ALL STRUCTURAL PASS' if all(s[1] for s in S) else 'SOME STRUCTURAL FAIL')
