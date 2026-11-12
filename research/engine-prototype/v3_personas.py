import v3
from v3 import compute
from v3_tests import TYP, BEST, SMOKER, mod
P = [('Healthy 45F', BEST, 45, 'F', 'no'), ('Typical 50M', TYP, 50, 'M', 'no'), ('Pack/day 45M sed/obese/poor diet', SMOKER, 45, 'M', 'no'),
     ('Typical 70F', TYP, 70, 'F', 'no'), ('Typical 30M', TYP, 30, 'M', 'no'), ('Typical 80M', TYP, 80, 'M', 'no'),
     ('Typical 45 sex-unspecified', TYP, 45, 'X', 'no'), ('Typical 55M gate=yes', TYP, 55, 'M', 'yes')]
for nm, a, age, s, g in P:
    r = compute(a, age, s, g)
    top = "; ".join(f"{x['id']} {x['gain']:.2f}y [{x['gainCI'][0]:.2f}-{x['gainCI'][1]:.2f}] {x['hoursPerDay']}h ({x['hpd_raw']:.2f}) {x['grade']}" for x in r['actions'][:3])
    bl = r['biggest']
    print(f"| {nm} | {r['baseline']:.1f} | {r['point']:.1f} | {r['low']}-{r['high']} (±{r['hw']}) | {r['display']} | {r['pot']:.1f} [{r['potCI'][0]:.1f}-{r['potCI'][1]:.1f}] | {bl['id']+' %.2f'%bl['gain'] if bl else '-'} | {top} |")
# spec example 4.2.12
for s in 'MF':
    a = mod(TYP, act='0'); r = compute(a, 45, s); x = [x for x in r['actions'] if x['id']=='act'][0]
    print(f"spec example walking 45{s} inactive (fit mod->easy): gain {x['gain']:.2f} hpd {x['hpd_raw']:.2f} -> {x['hoursPerDay']} (spec 1.3 M / 1.1 F)")
    a = mod(TYP, act='0', fit='easy'); r = compute(a, 45, s); x = [x for x in r['actions'] if x['id']=='act'][0]
    print(f"   fit easy: gain {x['gain']:.2f} hpd {x['hpd_raw']:.2f}")
