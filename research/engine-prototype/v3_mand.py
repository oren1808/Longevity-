import v3, random, math
from v3 import ev, compute, cbs_e, F, ORDER, credited_gain
from v3_tests import TYP, BEST, SMOKER, MODAL, mod
import contextlib, io
SMK_ORDER = ['20+', '10-19', '<10', 'q<5', 'q5-15', 'q>15', 'never']
ORD = dict(ORDER); ORD['smk'] = SMK_ORDER; ORD['bmi'] = ['35+', '30-35', '<18.5', '25-30', '18.5-25']
ORD['soc'] = ['iso', 'mid', 'conn']
print("=== monotonicity ===")
viol = []
for base in (TYP, SMOKER, BEST, MODAL):
    for s in 'MF':
        for age in (25, 45, 59, 60, 70, 80):
            for f, order in ORD.items():
                if f == 'fit': continue
                pts = []
                for l in order:
                    a = mod(base, **{f: l}); pts.append(ev(a, age, s))
                for i in range(len(pts) - 1):
                    if pts[i + 1] < pts[i] - 1e-9: viol.append((f, order[i], order[i+1], age, s, pts[i+1]-pts[i]))
print("violations:", len(viol), viol[:5])
# fitness monotone too
print("=== random sweep: low<=high, pot>=0, pot>=max action, hw 2..5, hoursPerDay 0.25..3 ===")
random.seed(3); bad = {'lowhigh':0,'pot0':0,'potmax':0,'hw':0,'hpd':0}; hpds=[]; hws=[]; n=0; ex_={}
LV = {f: list(F[f]) for f in F}
for i in range(250):
    a = {f: random.choice(LV[f]) for f in ['act','fit','str','smk','diet','bmi','sleep','irreg','alc','soc']}
    if random.random() < 0.15: a['fit'] = 'dk'
    s = random.choice('MFX'); age = random.randint(18, 74)
    r = compute(a, age, s); n += 1
    if r['low'] > r['high']: bad['lowhigh'] += 1
    if r['pot'] < 0: bad['pot0'] += 1
    mx = max([x['gain'] for x in r['actions']] or [0])
    if r['pot'] < mx - 1e-9: bad['potmax'] += 1; ex_.setdefault('potmax', (a, age, s, r['pot'], mx))
    if not 2 <= r['hw'] <= 5: bad['hw'] += 1; ex_.setdefault('hw', (age, s, r['hw'], a))
    hws.append(r['hw'])
    for x in r['actions']:
        hpds.append((x['hoursPerDay'], x['id'], age, s))
        if not 0.25 <= x['hoursPerDay'] <= 3: bad['hpd'] += 1
print(n, bad); print('examples:', ex_)
hp = sorted(hpds); print('hpd min', hp[:3], 'max', hp[-5:])
print("=== half-width by age (TYP, M), base and max modifiers ===")
for age in (18, 22, 30, 40, 45, 50, 60, 70, 74):
    r = compute(TYP, age, 'M'); r2 = compute(mod(TYP, fit='dk', bmi='dk'), age, 'X')
    print(f"age {age}: e_rem {r['e_rem']:.1f} CIspread {r['spread']:.2f} hw {r['hw']}  | sex X + 2 dk: hw {r2['hw']}")
print("=== smoker pack/day + 4 bad factors: quit gain >=4 ===")
for age in (25, 45, 60, 70, 74):
    for s in 'MF':
        r = compute(SMOKER, age, s); g = [x for x in r['actions'] if x['id']=='smk'][0]['gain']
        print(f"  {s}{age}: quit gain {g:.2f} {'PASS' if g>=4 else 'FAIL'}")
print("=== display ===")
for nm,a,age,s,gate in (('75 typ',TYP,75,'M','no'),('74 typ',TYP,74,'M','no'),('gate',TYP,55,'M','yes'),('best',BEST,45,'F','no'),('best 76',BEST,76,'F','no')):
    r=compute(a,age,s,gate); print(nm, r['display'], round(r['pot'],2))
print("=== creditedGain ===")
for w_, m in ((0,False),(11,False),(12,False),(25,True),(26,False),(26,True)): print(w_, m, credited_gain(2.0, w_, m))
