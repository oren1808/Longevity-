"""Export the prototype's data and reference results for the TypeScript engine (packages/engine).

Writes:
  config/factors.json, config/prevalence.json, config/normalization.json, config/engine-params.json
  data/life-tables/IL-placeholder-gm.json          (Gompertz-Makeham placeholder, see engine.py)
  packages/engine/test/fixtures/prototype.json     (compute()/point()/what_if results the TS port must match, ±0.01)

Run:  python export_for_ts.py      (from research/engine-prototype)
"""
import json, os, random, math
import v4
from v4_tests import TYP, BEST, WORST, SMOKER, FIVE, NONE, mod, modal, PERSONAS, anchors

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
def w(rel, obj, indent=1):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as fh: json.dump(obj, fh, ensure_ascii=False, indent=indent); fh.write('\n')
    print('wrote', rel)

P = v4.PARAMS
GRADE = {'act': 'B', 'fit': 'B', 'str': 'C', 'smk': 'A', 'diet': 'C', 'whtr': 'B', 'bmi': 'B', 'sleep': 'C', 'irreg': 'C', 'alc': 'B', 'soc': 'C'}
SRC = {'act': 'Arem 2015; Moore 2012', 'fit': 'Arem 2015; Moore 2012', 'str': 'Momma 2022', 'smk': 'Jha 2013',
       'diet': 'Shan 2023', 'whtr': 'Global BMI Mortality Collaboration 2016', 'bmi': 'Global BMI Mortality Collaboration 2016',
       'sleep': 'Yin 2017', 'irreg': 'Windred 2024', 'alc': 'Wood 2018', 'soc': 'Holt-Lunstad 2010; Wang 2023'}
w('config/factors.json', dict(
    version='0.4.1-placeholder',
    note='All values are placeholders pending medical-advisor sign-off (docs/engine.md, spec Appendix B).',
    factors={f: dict(status=v4.STATUS[f], source=SRC[f], sourceUrl=None, evidenceGrade=GRADE[f],
                     levels={l: dict(hr=v[0], ciLow=v[1], ciHigh=v[2]) for l, v in lv.items()})
             for f, lv in v4.F.items()}))
w('config/prevalence.json', dict(
    status='placeholder', note='v3 placeholder per 10-year group, linearly interpolated; ex-smoker ramps (see research/engine-prototype/README.md).',
    groupCentres=v4.GROUP_CENTRES, base=v4.PREV_BASE,
    exSmokerRamps=[{'level': 'q>15', 'from': 25, 'to': 35}, {'level': 'q5-15', 'from': 18, 'to': 25}]))
w('config/engine-params.json', dict(
    status='placeholder', note='Calibrated engine parameters (research/engine-prototype/README.md, v4 calibration log).',
    k=P['k'], L=P['L'], rhoBreaks=list(P['rho_breaks']), rhoValues=list(P['rho_vals']), hrRef=P['hr_ref'],
    ws=list(P['ws']), wo=list(P['wo']), hwCoef=P['hw_coef'],
    quitT0={'q<5': 2.5, 'q5-15': 10.0, 'q>15': 20.0}))
w('config/normalization.json', dict(
    status='placeholder', note='C[sex][age] for ages 18..100, Monte Carlo (N=20000, fixed seed) + isotonic smoothing, from v4.py. Regenerate when factors, prevalence or life table change.',
    ageFrom=18, ageTo=100, C={s: v4.C_table(s)['iso'] for s in 'MFX'}))
w('data/life-tables/IL-placeholder-gm.json', dict(
    status='placeholder', note='Gompertz-Makeham fit to CBS 2019-2023 anchors (e0 80.8/85.0, e65 19.6/22.2, e80 9.2/10.4). Replace with the real CBS single-age table.',
    maxAge=110, qx={s: [float(v) for v in v4.LT[s]] for s in 'MF'}))

# ---------------------------------------------------------------- fixtures
def slim(r):
    keep = ['point', 'baseline', 'e_rem', 'spread', 'hw0', 'hw', 'low', 'high', 'potentialGain', 'potLow', 'potHigh', 'display', 'C']
    o = {k: r[k] for k in keep}
    o['biggestLever'] = r['biggestLever']
    o['actions'] = [{k: a[k] for k in ('id', 'gainYears', 'gainLow', 'gainHigh', 'hoursPerDay', 'grade', 'kind')} for a in r['actions']]
    return o

cases = []
for nm, a, age, s, g in PERSONAS:
    cases.append(dict(name=nm, answers=a, age=age, sex=s, gate=g))
for nm, a in (('five', FIVE), ('none', NONE), ('worst', WORST), ('typical', TYP), ('best', BEST), ('smoker', SMOKER)):
    for age in (18, 24, 40, 50, 64, 75, 90, 99):
        for s in 'MFX':
            cases.append(dict(name=f'{nm} {age}{s}', answers=a, age=age, sex=s, gate='no'))
for s in 'MF':
    for age in (25, 45, 65):
        cases.append(dict(name=f'modal {age}{s}', answers=modal(s, age), age=age, sex=s, gate='no'))
random.seed(2026)
LV = {f: list(v4.F[f]) for f in v4.F}
for i in range(300):
    a = {f: random.choice(LV[f]) for f in ['act', 'fit', 'str', 'smk', 'diet', 'bmi', 'sleep', 'irreg', 'alc', 'soc']}
    if random.random() < 0.15: a['fit'] = 'dk'
    if random.random() < 0.10: a['bmi'] = 'dk'
    if random.random() < 0.15: a['act'] = 'dk'
    if random.random() < 0.10: a['diet'] = 'dk'
    if random.random() < 0.20: a['whtr'] = random.choice(LV['whtr'])
    if random.random() < 0.15: a['hookah'] = random.choice(['no', 'sometimes', 'daily'])
    s = random.choice('MFX'); age = random.randint(18, 100); gate = random.choice(['no', 'no', 'yes', 'prefer_not'])
    if a['smk'] in v4.QUIT and random.random() < 0.3:
        a['quit_age'] = max(10.0, age - v4.QUIT[a['smk']] - random.choice([0, 1, 3, 7]))
    cases.append(dict(name=f'random {i}', answers=a, age=age, sex=s, gate=gate))

out = []
for c in cases:
    r = v4.compute(c['answers'], c['age'], c['sex'], c['gate'])
    out.append(dict(c, expected=slim(r)))
wi = []
for age, s in ((45, 'M'), (30, 'F'), (60, 'X')):
    for lvl in v4.ORDER['act']:
        wi.append(dict(answers=TYP, age=age, sex=s, level=lvl, expected=v4.what_if(TYP, lvl, age, s)))
quit = []
for lvl in v4.CURRENT:
    for age in (25, 40, 45, 60, 74, 85):
        for s in 'MF':
            a = mod(TYP, smk=lvl)
            quit.append(dict(answers=a, age=age, sex=s, expected=v4.point(a, age, s, True) - v4.point(a, age, s)))
anc = [dict(id=i, label=l, value=v, lo=lo, hi=hi, ok=ok) for i, l, v, lo, hi, ok in anchors()]
w('packages/engine/test/fixtures/prototype.json', dict(
    source='research/engine-prototype/v4.py (PARAMS = calibrated)', tolerance=0.01, cases=out, whatIf=wi, quitGain=quit, anchors=anc), indent=None)
