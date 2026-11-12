"""Spec v3 (section 4.2) engine, implemented as literally as possible.
Interpretation choices are flagged with 'AMBIG' comments; alternatives selectable via OPTS."""
import math, io, contextlib
import numpy as np
with contextlib.redirect_stdout(io.StringIO()):
    import engine as _E          # Gompertz-Makeham life table fitted to CBS anchors
MAXAGE = 110
LT = {'M': _E.LT['M'], 'F': _E.LT['F']}
LT['X'] = (LT['M'] + LT['F']) / 2           # 4.2.1: "average qx of both sexes"

def cbs_e(sex, a):
    q = LT[sex][a:]; s = np.cumprod(1 - q); return 0.5 + s.sum()

OPTS = dict(
    atten='component',     # 'component' = attenuate smoking / alcohol / capped cluster;  'factor' = each HR before k & tanh
    c_where='after',       # 'after' = H_eff/C (spec 4.2.7); 'before' = 1+(H/C-1)w
    quit_offset='mid',     # years already elapsed for 'q<5'/'q5-15' at entry: 'mid' (2.5/10) or 'start' (0/5)
    dk='meanHR',           # don't-know -> prevalence-weighted mean HR
    fit_dk_rule='mean',    # 'mean' = worse-of(act, meanFit); 'act_only' = ignore fitness
)

# ---------------- Appendix B factors: level -> (HR, lo, hi); missing CI -> point ----------------
F = {
 'act':  {'300+': (1.00,1.00,1.00), '150-299': (1.10,1.05,1.15), '75-149': (1.20,1.12,1.28), '1-74': (1.30,1.20,1.40), '0': (1.55,1.40,1.70)},
 'fit':  {'easy': (1.00,1.00,1.00), 'mod': (1.20,1.12,1.28), 'hard': (1.55,1.40,1.70)},
 'str':  {'2+': (1.00,1.00,1.00), '1': (1.05,1.00,1.10), '0': (1.15,1.08,1.20)},
 'smk':  {'never': (1.00,1.00,1.00), 'q>15': (1.10,1.00,1.20), 'q5-15': (1.30,1.15,1.45), 'q<5': (1.70,1.40,2.00),
          '<10': (2.00,1.70,2.30), '10-19': (2.50,2.20,2.80), '20+': (3.00,2.60,3.40)},
 'diet': {'high': (1.00,1.00,1.00), 'mid': (1.10,1.05,1.15), 'low': (1.22,1.12,1.35)},
 'whtr': {'<0.5': (1.00,1.00,1.00), '0.5-0.6': (1.10,1.05,1.20), '>0.6': (1.45,1.30,1.55)},
 'bmi':  {'18.5-25': (1.00,1.00,1.00), '25-30': (1.10,1.10,1.10), '30-35': (1.45,1.45,1.45), '35+': (2.00,2.00,2.00), '<18.5': (1.30,1.30,1.30)},
 'sleep':{'7-8': (1.00,1.00,1.00), '6': (1.06,1.06,1.06), '<6': (1.13,1.13,1.13), '9+': (1.10,1.10,1.10)},
 'irreg':{'no': (1.00,1.00,1.00), 'yes': (1.05,1.00,1.10)},
 'alc':  {'0-7': (1.00,1.00,1.00), '8-14': (1.05,1.05,1.05), '15-24': (1.17,1.17,1.17), '25-34': (1.40,1.40,1.40), '35+': (1.90,1.90,1.90)},
 'soc':  {'conn': (1.00,1.00,1.00), 'mid': (1.10,1.03,1.15), 'iso': (1.25,1.14,1.32)},
}
# placeholder prevalence (Israeli adults, rough, independence assumed)
PREV = {
 'act': {'300+': .15, '150-299': .20, '75-149': .17, '1-74': .18, '0': .30},
 'fit': {'easy': .45, 'mod': .37, 'hard': .18},
 'str': {'2+': .20, '1': .12, '0': .68},
 'smk_M': {'never': .50, 'q>15': .10, 'q5-15': .08, 'q<5': .05, '<10': .07, '10-19': .09, '20+': .11},
 'smk_F': {'never': .72, 'q>15': .06, 'q5-15': .05, 'q<5': .03, '<10': .05, '10-19': .05, '20+': .04},
 'diet': {'high': .25, 'mid': .45, 'low': .30},
 'bmi': {'18.5-25': .38, '25-30': .35, '30-35': .17, '35+': .07, '<18.5': .03},
 'whtr': {'<0.5': .30, '0.5-0.6': .45, '>0.6': .25},
 'sleep': {'7-8': .55, '6': .27, '<6': .12, '9+': .06},
 'irreg': {'no': .70, 'yes': .30},
 'alc_M': {'0-7': .85, '8-14': .08, '15-24': .04, '25-34': .02, '35+': .01},
 'alc_F': {'0-7': .95, '8-14': .03, '15-24': .015, '25-34': .004, '35+': .001},
 'soc': {'conn': .50, 'mid': .38, 'iso': .12},
}
def prev(f, sex):
    if sex == 'X' and (f + '_M') in PREV:
        m, w_ = PREV[f + '_M'], PREV[f + '_F']; return {k: .5 * m[k] + .5 * w_[k] for k in m}
    return PREV.get(f + '_' + sex, PREV.get(f))

def hr(f, lvl, b, sex='M'):
    """b: 0 point, 1 lower CI, 2 upper CI.  lvl 'dk' -> prevalence-weighted mean (AMBIG)."""
    if lvl == 'dk':
        p = prev(f, sex); return sum(v * F[f][l][b] for l, v in p.items())
    return F[f][lvl][b]

K, L = 0.75, math.log(3)
EVID = {'act': 'B', 'str': 'C', 'smk': 'A', 'diet': 'C', 'sleep': 'C', 'irreg': 'C', 'alc': 'B', 'soc': 'C'}  # act/irreg grade missing in App.B (AMBIG)
EW = {'A': 1.0, 'B': 0.8, 'C': 0.6}
ADH = {'act': 5/7, 'str': 2/7, 'smk': 1.0, 'diet': 1.0, 'sleep': 1.0, 'irreg': 1.0, 'alc': 1.0}       # only walking given in spec (AMBIG)

def w_smk(y): return np.where(y <= 80, 1.0, np.where(y >= 90, 0.7, 1 - 0.3 * (y - 80) / 10))
def w_oth(y): return np.where(y <= 60, 1.0, np.where(y >= 90, 0.5, 1 - 0.5 * (y - 60) / 30))

def smoking_path(lvl, ages, a0, quit_now=False):
    """HR level label per projected age (time-varying quit tiers, 4.2.5)."""
    if quit_now: t0 = 0.0
    elif lvl == 'q<5': t0 = 2.5 if OPTS['quit_offset'] == 'mid' else 0.0
    elif lvl == 'q5-15': t0 = 10.0 if OPTS['quit_offset'] == 'mid' else 5.0
    else: return [lvl] * len(ages)
    out = []
    for y in ages:
        t = t0 + (y - a0)
        out.append('q<5' if t < 5 else ('q5-15' if t < 15 else 'q>15'))
    return out

def weight_key(ans):
    return ('whtr', ans['whtr']) if ans.get('whtr') else ('bmi', ans.get('bmi', 'dk'))

def actfit_hr(ans, b, sex):
    ha = hr('act', ans['act'], b, sex)
    if ans['fit'] == 'dk' and OPTS['fit_dk_rule'] == 'act_only': return ha
    return max(ha, hr('fit', ans['fit'], b, sex))           # "worse of Q1 and Q2"

def cluster_lnhrs(ans, b, sex):
    wk = weight_key(ans)
    return [math.log(actfit_hr(ans, b, sex)), math.log(hr('str', ans['str'], b, sex)),
            math.log(hr('diet', ans['diet'], b, sex)), math.log(hr(wk[0], wk[1], b, sex)),
            math.log(hr('sleep', ans['sleep'], b, sex)), math.log(hr('irreg', ans['irreg'], b, sex)),
            math.log(hr('soc', ans['soc'], b, sex))]

def cap(x): return L * math.tanh(x / L)

def H_path(ans, age, sex, b=0, quit_now=False):
    """unnormalised H_eff(y) for y = age..MAXAGE"""
    ages = np.arange(age, MAXAGE + 1)
    sl = smoking_path(ans['smk'], ages, age, quit_now)
    hs = np.array([hr('smk', l, b, sex) for l in sl])
    ha = hr('alc', ans['alc'], b, sex)
    lns = cluster_lnhrs(ans, b, sex)
    ws, wo = w_smk(ages), w_oth(ages)
    if OPTS['atten'] == 'component':
        hc = math.exp(cap(K * sum(lns)))
        return (1 + (hs - 1) * ws) * (1 + (ha - 1) * wo) * (1 + (hc - 1) * wo)
    # 'factor': attenuate each HR first, then k and tanh per projected year
    hcs = np.array([math.exp(cap(K * sum(math.log(1 + (math.exp(l) - 1) * w_) for l in lns))) for w_ in wo])
    return (1 + (hs - 1) * ws) * (1 + (ha - 1) * wo) * hcs

def e_from_H(Hp, age, sex, C):
    ages = np.arange(age, MAXAGE + 1); q = LT[sex][age:]
    if OPTS['c_where'] == 'after': h = Hp / C
    else: raise NotImplementedError
    surv = np.cumprod((1 - q) ** h)            # q' = 1-(1-q)^(H_eff/C)
    return 0.5 + surv.sum()                     # e = 0.5 + sum_{k>=1} l_{a+k}/l_a

BANDS = [(18, 39), (40, 59), (60, 74), (75, 100)]
def band(age): return next(i for i, (lo, hi) in enumerate(BANDS) if lo <= age <= hi)

# ---------------- Monte-Carlo normalisation ----------------
def sample(sex, N, rng):
    keys = ['act', 'fit', 'str', 'smk', 'diet', 'bmi', 'sleep', 'irreg', 'alc', 'soc']
    cols = {}
    for f in keys:
        p = prev(f, sex); lv = list(p); pr = np.array([p[l] for l in lv]); pr /= pr.sum()
        cols[f] = rng.choice(lv, size=N, p=pr)
    return [{f: cols[f][i] for f in keys} for i in range(N)]

_POP = {}
def pop(sex, N=4000):
    if sex not in _POP:
        rng = np.random.default_rng(7)
        if sex == 'X': _POP[sex] = sample('M', N // 2, rng) + sample('F', N // 2, rng)
        else: _POP[sex] = sample(sex, N, rng)
    return _POP[sex]

def pop_paths(sex, age):
    # group identical answer vectors for speed
    from collections import Counter
    cnt = Counter(tuple(sorted(a.items())) for a in pop(sex))
    return [(H_path(dict(k), age, sex), n) for k, n in cnt.items()]

def pop_e(sex, age, C, paths=None):
    paths = paths or pop_paths(sex, age)
    q = LT[sex][age:]; tot = 0; N = 0
    for Hp, n in paths:
        tot += n * np.cumprod((1 - q) ** (Hp / C)).sum(); N += n
    return 0.5 + tot / N

def solve_C(sex, ages):
    P = {a: pop_paths(sex, a) for a in ages}
    def err(C): return np.mean([pop_e(sex, a, C, P[a]) - cbs_e(sex, a) for a in ages])
    # larger C => smaller hazard => longer e => err increasing in C
    lo, hi = 0.5, 3.0
    for _ in range(40):
        m = (lo + hi) / 2
        if err(m) > 0: hi = m
        else: lo = m
    return (lo + hi) / 2, P

import json, os
_CF = os.path.join(os.path.dirname(__file__), 'v3_C.json')
def _ckey(): return '|'.join(f'{k}={v}' for k,v in sorted(OPTS.items()))
try: _CALL = json.load(open(_CF))
except Exception: _CALL = {}
_C = {}
def Cconst(sex, age):
    bi = band(age); k2 = _ckey() + f'|{sex}|{bi}'
    if k2 in _CALL: return _CALL[k2]
    v = _Cconst(sex, age); _CALL[k2] = v; json.dump(_CALL, open(_CF, 'w')); return v
def _Cconst(sex, age):
    bi = band(age)
    key = (sex, bi)
    if key not in _C:
        lo, hi = BANDS[bi]
        ages = list(range(lo, min(hi, 95) + 1, 3))
        _C[key] = solve_C(sex, ages)[0]
    return _C[key]

# ---------------- engine API ----------------
def ev(ans, age, sex, b=0, quit_now=False, C=None):
    C = C or Cconst(sex, age)
    return e_from_H(H_path(ans, age, sex, b, quit_now), age, sex, C)

def rnd(x): return int(math.floor(x + 0.5))

ORDER = {'act': ['0', '1-74', '75-149', '150-299', '300+'], 'fit': ['hard', 'mod', 'easy'], 'str': ['0', '1', '2+'],
         'diet': ['low', 'mid', 'high'], 'sleep': ['<6', '6', '9+', '7-8'], 'irreg': ['yes', 'no'],
         'alc': ['35+', '25-34', '15-24', '8-14', '0-7']}
TARGET = {'act': '150-299', 'str': '2+', 'diet': 'high', 'sleep': '7-8', 'irreg': 'no', 'alc': '0-7'}

def apply_action(ans, f):
    """return (new answers, quit_now) or None if not applicable"""
    n = dict(ans)
    if f == 'smk':
        return (n, True) if ans['smk'] in ('<10', '10-19', '20+') else None
    cur = ans[f]
    if f == 'sleep' and cur in ('9+',): return None
    if cur == 'dk': cur_i = -1
    else: cur_i = ORDER[f].index(cur)
    if cur_i >= ORDER[f].index(TARGET[f]): return None
    n[f] = TARGET[f]
    if f == 'act' and ans['fit'] in ('hard', 'mod'):          # activity also lifts fitness one level
        n['fit'] = ORDER['fit'][ORDER['fit'].index(ans['fit']) + 1]
    return n, False

def potential_answers(ans):
    n = dict(ans); qn = False
    for f in TARGET:
        r = apply_action(ans, f)
        if r: n[f] = r[0][f]
        if f == 'act' and r: n['fit'] = r[0]['fit']
    if ans['smk'] in ('<10', '10-19', '20+'): qn = True
    return n, qn

def compute(ans, age, sex, gate='no'):
    C = Cconst(sex, age)
    e0 = ev(ans, age, sex, 0, C=C); point = age + e0
    elo = ev(ans, age, sex, 1, C=C); ehi = ev(ans, age, sex, 2, C=C)   # lower HR -> longer
    spread = elo - ehi
    hw = min(max(rnd(0.08 * e0 + 0.5 * spread), 2), 4)
    mods = (sex == 'X') + sum(1 for v in ans.values() if v == 'dk') + (18 <= age <= 24)
    hw += mods
    low, high = rnd(point) - hw, rnd(point) + hw
    acts = []
    for f in ['act', 'str', 'smk', 'diet', 'sleep', 'irreg', 'alc']:
        r = apply_action(ans, f)
        if not r: continue
        n, qn = r
        g = ev(n, age, sex, 0, qn, C) - e0
        gl = ev(n, age, sex, 1, qn, C) - elo; gh = ev(n, age, sex, 2, qn, C) - ehi
        e_imp = e0 + g
        hpd = g * 8766 / (365.25 * e_imp * ADH[f])
        acts.append(dict(id=f, gain=g, gainCI=(min(gl, gh, g), max(gl, gh, g)), hpd_raw=hpd,
                         hoursPerDay=round(hpd * 4) / 4, grade=EVID[f], score=g * EW[EVID[f]]))
    acts.sort(key=lambda a: -a['score'])
    pn, pq = potential_answers(ans)
    pot = ev(pn, age, sex, 0, pq, C) - e0
    potl = ev(pn, age, sex, 1, pq, C) - elo; poth = ev(pn, age, sex, 2, pq, C) - ehi
    if age >= 75 or gate == 'yes': disp = 'gain-only'
    elif pot < 0.5: disp = 'maintenance'
    else: disp = 'full'
    return dict(point=point, baseline=age + cbs_e(sex, age), e_rem=e0, spread=spread, hw=hw, low=low, high=high,
                pot=pot, potCI=(min(potl, poth), max(potl, poth)), actions=acts, display=disp, C=C,
                biggest=max(acts, key=lambda a: a['gain']) if acts else None)

def credited_gain(gain, weeks, monthly_confirmed):
    if weeks >= 26 and monthly_confirmed: return gain
    if weeks >= 12: return 0.5 * gain
    return 0.0
