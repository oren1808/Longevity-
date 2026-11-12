"""Engine v4 -- reference implementation of docs/engine.md (v4).

Not production code. Mirrors the spec section by section (comments give the section).
All tunable *engine* parameters live in PARAMS; evidence HRs (Appendix B) live in F and are
never tuned. Interpretation choices the spec leaves open are marked 'INTERP'.

Normalisation constants C[sex][age] (18..100) are produced by Monte Carlo (fixed seed,
N = 20,000 per sex, common random numbers across ages), smoothed to be non-increasing in age
(isotonic / PAV) and cached in v4_C.json keyed by a hash of PARAMS + prevalence + N.
"""
import math, json, os, hashlib
import numpy as np
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    import engine as _E                    # Gompertz-Makeham table fitted to CBS anchors (placeholder for real CBS table)

MAXAGE = 110
AGES = np.arange(MAXAGE + 1)
LT = {'M': _E.LT['M'].copy(), 'F': _E.LT['F'].copy()}
LT['X'] = 0.5 * (LT['M'] + LT['F'])          # §1: qx_X = 0.5 (qx_M + qx_F)
for s in LT: LT[s][MAXAGE] = 1.0
LN1Q = {s: np.log(1 - LT[s][:MAXAGE]) for s in LT}   # ln(1-q_x), x = 0..109 (q_110 = 1 never enters e)

# ------------------------------------------------------------------------------------------------
# Engine parameters (tunable; everything else is evidence or definition)
# ------------------------------------------------------------------------------------------------
PARAMS_SPEC = dict(                      # exactly as written in docs/engine.md v4
    k=0.75,                              # cluster shrinkage
    L=math.log(3),                       # soft cap on cluster
    rho_breaks=(35, 45, 55),             # rho(Q) step breakpoints
    rho_vals=(0.0, 0.1, 0.3, 0.5),       # rho for Q<35, 35-44, 45-54, 55+
    hr_ref=2.5,                          # HR_ref for ex-smokers (level 10-19)
    ws=(80, 90, 0.7),                    # smoking attenuation: 1 up to 80, linear to 0.7 at 90
    wo=(60, 90, 0.5),                    # other attenuation:   1 up to 60, linear to 0.5 at 90
    hw_coef=0.06,                        # half-width coefficient on e_rem
)
PARAMS = dict(PARAMS_SPEC)               # calibrated values are set at the bottom of this file

# ------------------------------------------------------------------------------------------------
# Appendix B factors: level -> (HR, CI low, CI high). Missing CI -> point (BMI, sleep, alcohol).
# ------------------------------------------------------------------------------------------------
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
STATUS = {f: 'placeholder' for f in F}           # §12: every value is a placeholder until advisor sign-off
CURRENT = ('<10', '10-19', '20+')
QUIT = {'q<5': 2.5, 'q5-15': 10.0, 'q>15': 20.0}  # §3.1 t0 by answer
TIER = ('q<5', 'q5-15', 'q>15')                  # HR_tier(t): t<5 / 5<=t<15 / t>=15

# ------------------------------------------------------------------------------------------------
# Prevalence (placeholder, from v3). INTERP / added age variation (documented in README):
#  * values are given per 10-year group (centres 20,30,...,90) and linearly interpolated (§1);
#  * all groups equal to the v3 placeholder EXCEPT ex-smoker feasibility: 'q>15' needs quitting
#    >15 years ago, so it ramps 0 at age 25 -> full at 35; 'q5-15' ramps 0 at 18 -> full at 25.
#    Removed mass goes to 'never'. (Otherwise an 18-year-old 'quit >15 years ago' would be sampled.)
# ------------------------------------------------------------------------------------------------
PREV_BASE = {
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
GROUP_CENTRES = [20, 30, 40, 50, 60, 70, 80, 90]

def _ramp(a, lo, hi): return min(1.0, max(0.0, (a - lo) / (hi - lo)))

def _group_prev(f, sex, centre):
    p = dict(PREV_BASE.get(f + '_' + sex, PREV_BASE.get(f)))
    if f == 'smk':
        for lvl, lo, hi in (('q>15', 25, 35), ('q5-15', 18, 25)):
            keep = p[lvl] * _ramp(centre, lo, hi); p['never'] += p[lvl] - keep; p[lvl] = keep
    return p

def prev(f, sex, age):
    """prevalence dict for factor f at single age (linear interpolation between group centres)."""
    if sex == 'X':                       # INTERP: X = 50/50 mix of M and F marginals
        m, w_ = prev(f, 'M', age), prev(f, 'F', age); return {k: .5 * m[k] + .5 * w_[k] for k in m}
    a = min(max(age, GROUP_CENTRES[0]), GROUP_CENTRES[-1])
    i = min(int((a - 20) // 10), len(GROUP_CENTRES) - 2); c0 = GROUP_CENTRES[i]; t = (a - c0) / 10
    p0, p1 = _group_prev(f, sex, c0), _group_prev(f, sex, c0 + 10)
    return {k: (1 - t) * p0[k] + t * p1[k] for k in p0}

# ------------------------------------------------------------------------------------------------
# §2 answer -> HR mapping
# ------------------------------------------------------------------------------------------------
def diet_level(q5a, q5b, q6):
    s = q5a + q5b + q6; return 'low' if s <= 3 else ('mid' if s <= 6 else 'high')

def social_level(contact, lonely):
    """Appendix A: contact in {'most','weekly','monthly'}; lonely in {'rarely','sometimes','often'}."""
    if contact == 'monthly' or lonely == 'often': return 'iso'
    if lonely == 'rarely': return 'conn'
    return 'mid'

def bmi_level(bmi):
    if bmi < 18.5: return '<18.5'
    return '18.5-25' if bmi < 25 else ('25-30' if bmi < 30 else ('30-35' if bmi < 35 else '35+'))

def whtr_level(r): return '<0.5' if r < 0.5 else ('0.5-0.6' if r < 0.6 else '>0.6')

def mean_hr(f, sex, age, b):
    p = prev(f, sex, age); return sum(v * F[f][l][b] for l, v in p.items())

def hr(f, lvl, b, sex, age):
    """'dk' -> prevalence-weighted mean HR for the user's sex and age (§2)."""
    return mean_hr(f, sex, age, b) if lvl == 'dk' else F[f][lvl][b]

def smoking_level(ans):
    """§2 4b: hookah/e-cig/heated tobacco daily -> '<10' unless Q4 is worse; 'sometimes' -> 'q5-15'.
    INTERP: the 4b 'sometimes' mapping is a STATIC HR (ongoing use, not a quit date) -> returned as ('static', 'q5-15')."""
    s = ans.get('smk', 'never'); h = ans.get('hookah', 'no')
    if s in CURRENT:
        if h == 'daily' and F['smk']['<10'][0] > F['smk'][s][0]: return ('cur', '<10')
        return ('cur', s)
    if h == 'daily': return ('cur', '<10')
    if h == 'sometimes' and F['smk']['q5-15'][0] > F['smk'][s][0] and s not in QUIT:
        return ('static', 'q5-15')
    if s in QUIT: return ('quit', s)
    return ('static', 'never')

def actfit_hr(ans, b, sex, age):
    ha = hr('act', ans['act'], b, sex, age)
    if ans.get('fit', 'dk') == 'dk': return ha                   # fitness dk -> activity alone
    return max(ha, hr('fit', ans['fit'], b, sex, age))

def weight_hr(ans, b, sex, age):
    w, bm = ans.get('whtr'), ans.get('bmi', 'dk')
    if w and w != 'dk':
        h = F['whtr'][w][b]
        if bm == '<18.5': h = max(h, F['bmi'][bm][b])
        return h
    return hr('bmi', bm, b, sex, age)

def cluster_lnsum(ans, b, sex, age):
    return (math.log(actfit_hr(ans, b, sex, age)) + math.log(hr('str', ans['str'], b, sex, age)) +
            math.log(hr('diet', ans['diet'], b, sex, age)) + math.log(weight_hr(ans, b, sex, age)) +
            math.log(hr('sleep', ans['sleep'], b, sex, age)) + math.log(hr('irreg', ans['irreg'], b, sex, age)) +
            math.log(hr('soc', ans['soc'], b, sex, age)))

# ------------------------------------------------------------------------------------------------
# §3 H(x)
# ------------------------------------------------------------------------------------------------
def _lin(x, a0, a1, v1):
    return np.where(x <= a0, 1.0, np.where(x >= a1, v1, 1 + (v1 - 1) * (x - a0) / (a1 - a0)))

def w_s(x, P): return _lin(x, *P['ws'])
def w_o(x, P): return _lin(x, *P['wo'])

def rho(Q, P):
    i = sum(Q >= br for br in P['rho_breaks']); return P['rho_vals'][i]

def smk_path(state, a, b, P, quit_now=False, quit_age=None):
    """HR_smk(x) for x = a..109 (before attenuation)."""
    x = np.arange(a, MAXAGE)
    kind, lvl = state
    if quit_now:
        assert kind == 'cur'
        t0, Q, ref = 0.0, float(a), F['smk'][lvl][b]          # §3.1 quit action: HR_ref = HR_current
    elif kind == 'quit':
        t0 = QUIT[lvl]; Q = a - t0
        if quit_age is not None:            # PROPOSED (not in spec): stored age at quitting -> t0 advances with age, Q fixed
            Q = float(quit_age); t0 = max(a - Q, 0.0)
        ref = P['hr_ref'] if b == 0 else P['hr_ref'] * F['smk']['10-19'][b] / F['smk']['10-19'][0]
    else:
        return np.full(len(x), F['smk'][lvl][b])
    t = t0 + (x - a)
    tier = np.where(t < 5, F['smk']['q<5'][b], np.where(t < 15, F['smk']['q5-15'][b], F['smk']['q>15'][b]))
    return tier + rho(Q, P) * (ref - 1)

def H_path(ans, a, sex, b=0, quit_now=False, P=None):
    P = P or PARAMS
    x = np.arange(a, MAXAGE)
    ws, wo = w_s(x, P), w_o(x, P)
    hs = 1 + (smk_path(smoking_level(ans), a, b, P, quit_now, ans.get('quit_age')) - 1) * ws
    ha = 1 + (hr('alc', ans['alc'], b, sex, a) - 1) * wo
    S = P['k'] * cluster_lnsum(ans, b, sex, a)
    hc = 1 + (math.exp(P['L'] * math.tanh(S / P['L'])) - 1) * wo
    return hs * ha * hc

# ------------------------------------------------------------------------------------------------
# §4 normalisation and life expectancy
# ------------------------------------------------------------------------------------------------
def e_rem(Hp, a, sex, C):
    """e_a = 0.5 + sum_{k=1}^{110-a} prod_{j<k} (1-q'_{a+j}),  q' = 1-(1-q)^(H/C)."""
    cum = np.cumsum(Hp * LN1Q[sex][a:], axis=-1)
    return 0.5 + np.exp(cum / C).sum(axis=-1)

def cbs_e(sex, a): return e_rem(np.ones(MAXAGE - a), a, sex, 1.0)

N_MC, SEED = 20000, 20240601
MC_FACTORS = ['act', 'fit', 'str', 'smk', 'diet', 'bmi', 'sleep', 'irreg', 'alc', 'soc']
_U = {}
def _uniforms(sex):
    if sex not in _U:
        rng = np.random.default_rng(SEED + {'M': 0, 'F': 1, 'X': 2}[sex])
        _U[sex] = rng.random((N_MC, len(MC_FACTORS)))
    return _U[sex]

def _sample_idx(f, sex, age, u):
    p = prev(f, sex, age); lv = list(p); cdf = np.cumsum([p[l] for l in lv]); cdf /= cdf[-1]
    return lv, np.minimum(np.searchsorted(cdf, u, side='right'), len(lv) - 1)

def pop_H(sex, a, P):
    """H matrix (N x (110-a)) for the MC population at age a. Common random numbers across ages."""
    U = _uniforms(sex); x = np.arange(a, MAXAGE); wo = w_o(x, P); ws = w_s(x, P)
    lvl = {}
    for j, f in enumerate(MC_FACTORS):
        lv, idx = _sample_idx(f, sex, a, U[:, j]); lvl[f] = (lv, idx)
    def hrv(f):
        lv, idx = lvl[f]; return np.array([F[f][l][0] for l in lv])[idx]
    lnS = (np.log(np.maximum(hrv('act'), hrv('fit'))) + np.log(hrv('str')) + np.log(hrv('diet')) + np.log(hrv('bmi')) +
           np.log(hrv('sleep')) + np.log(hrv('irreg')) + np.log(hrv('soc')))
    S = P['k'] * lnS
    capped = np.exp(P['L'] * np.tanh(S / P['L']))
    Hc = 1 + (capped[:, None] - 1) * wo[None, :]
    Ha = 1 + (hrv('alc')[:, None] - 1) * wo[None, :]
    lv, idx = lvl['smk']
    paths = np.array([1 + (smk_path(('quit', l) if l in QUIT else ('static', l), a, 0, P) - 1) * ws for l in lv])
    return paths[idx] * Ha * Hc

def solve_C_age(sex, a, P):
    cum = np.cumsum(pop_H(sex, a, P) * LN1Q[sex][a:][None, :], axis=1)
    target = cbs_e(sex, a)
    f = lambda C: 0.5 + np.exp(cum / C).sum(axis=1).mean() - target     # increasing in C
    lo, hi = 0.3, 4.0; flo, fhi = f(lo), f(hi)
    side = 0
    for _ in range(100):                                                  # Illinois regula falsi
        c = (lo * fhi - hi * flo) / (fhi - flo); fc = f(c)
        if abs(fc) < 1e-9: break
        if fc > 0:
            hi, fhi = c, fc
            if side == -1: flo /= 2
            side = -1
        else:
            lo, flo = c, fc
            if side == 1: fhi /= 2
            side = 1
    return c

def isotonic_nonincreasing(y):
    """PAV for a non-increasing fit (equal weights)."""
    blocks = []                          # [mean, count]
    for v in y:
        blocks.append([v, 1])
        while len(blocks) > 1 and blocks[-2][0] < blocks[-1][0]:
            m2, n2 = blocks.pop(); m1, n1 = blocks.pop()
            blocks.append([(m1 * n1 + m2 * n2) / (n1 + n2), n1 + n2])
    out = []
    for m, n in blocks: out += [m] * n
    return out

C_AGES = range(18, 101)
_CF = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'v4_C.json')
def _phash(P):
    blob = json.dumps(dict(P=sorted((k, list(v) if isinstance(v, tuple) else v) for k, v in P.items()),
                           prev=PREV_BASE, N=N_MC, seed=SEED, F=F), sort_keys=True)
    return hashlib.sha1(blob.encode()).hexdigest()[:12]
try: _CACHE = json.load(open(_CF))
except Exception: _CACHE = {}

def C_table(sex, P=None):
    P = P or PARAMS; key = _phash(P) + '|' + sex
    if key not in _CACHE:
        raw = [solve_C_age(sex, a, P) for a in C_AGES]
        _CACHE[key] = dict(raw=raw, iso=isotonic_nonincreasing(raw))
        with open(_CF, 'w') as fh: json.dump(_CACHE, fh)
    return _CACHE[key]

C_SMOOTH = 'iso'      # 'iso' = spec §4 (isotonic non-increasing); 'raw' = unsmoothed MC root (diagnostics)
def Cconst(sex, a, P=None):
    a = min(max(a, 18), 100); return C_table(sex, P)[C_SMOOTH][a - 18]

# ------------------------------------------------------------------------------------------------
# Core evaluations
# ------------------------------------------------------------------------------------------------
def ev(ans, a, sex, b=0, quit_now=False, C=None, P=None):
    """remaining life expectancy e_a."""
    P = P or PARAMS; C = C if C is not None else Cconst(sex, a, P)
    return float(e_rem(H_path(ans, a, sex, b, quit_now, P), a, sex, C))

def point(ans, a, sex, quit_now=False, P=None): return a + ev(ans, a, sex, 0, quit_now, P=P)

def rhu(x): return int(math.floor(x + 0.5))          # round half up
def round_quarter(x): return math.floor(x * 4 + 0.5) / 4

# ------------------------------------------------------------------------------------------------
# §6 actions
# ------------------------------------------------------------------------------------------------
ORDER = {'act': ['0', '1-74', '75-149', '150-299', '300+'], 'fit': ['hard', 'mod', 'easy'], 'str': ['0', '1', '2+'],
         'diet': ['low', 'mid', 'high'], 'sleep': ['<6', '9+', '6', '7-8'], 'irreg': ['yes', 'no'],
         'alc': ['35+', '25-34', '15-24', '8-14', '0-7'], 'soc': ['iso', 'mid', 'conn']}
ACTIONS = {   # id: (factor, adherence, grade, hasYears)
    'walk30':            ('act',   5/7, 'B', True),
    'strength2':         ('str',   2/7, 'C', True),
    'smk_quit_date':     ('smk',   None, 'A', True),
    'diet_up':           ('diet',  5/7, 'C', True),   # veg_each_meal / legumes_nuts / swap_sweet_drink share this (engine.md §6: one level up)
    'bedtime':           ('sleep', 5/7, 'C', True),
    'wake_same':         ('irreg', 6/7, 'C', True),
    'alcohol_free_days': ('alc',   4/7, 'B', True),
    'connect':           ('soc',   None, 'C', False),
    'balance':           (None,    None, 'C', False),
}
EW = {'A': 1.0, 'B': 0.8, 'C': 0.6}

def _dk_level(f, sex, age):
    """INTERP: for 'one level up/down' actions from 'dk', treat dk as the best level whose HR >= mean HR."""
    m = mean_hr(f, sex, age, 0); cands = [l for l in ORDER[f] if F[f][l][0] >= m - 1e-12]
    return max(cands, key=lambda l: ORDER[f].index(l)) if cands else ORDER[f][0]

def apply_action(ans, aid, sex, age):
    """-> (new answers, quit_now) or None if not offered."""
    n = dict(ans); f = ACTIONS[aid][0]
    if aid == 'walk30':
        cur = ans['act']
        if cur == 'dk':
            if mean_hr('act', sex, age, 0) <= F['act']['150-299'][0]: return None
        elif ORDER['act'].index(cur) >= ORDER['act'].index('150-299'): return None
        n['act'] = '150-299'
        if ans.get('fit') in ('hard', 'mod'): n['fit'] = ORDER['fit'][ORDER['fit'].index(ans['fit']) + 1]
        return n, False
    if aid == 'strength2':
        if ans['str'] == '2+': return None
        n['str'] = '2+'; return n, False
    if aid == 'smk_quit_date':
        return (n, True) if smoking_level(ans)[0] == 'cur' else None
    if aid == 'diet_up':
        cur = _dk_level('diet', sex, age) if ans['diet'] == 'dk' else ans['diet']
        if cur == 'high': return None
        n['diet'] = ORDER['diet'][ORDER['diet'].index(cur) + 1]; return n, False
    if aid == 'bedtime':
        if ans['sleep'] not in ('<6', '6'): return None          # never from 9+ (or 7-8)
        n['sleep'] = '7-8'; return n, False
    if aid == 'wake_same':
        if ans['irreg'] != 'yes': return None
        n['irreg'] = 'no'; return n, False
    if aid == 'alcohol_free_days':
        cur = _dk_level('alc', sex, age) if ans['alc'] == 'dk' else ans['alc']
        if cur == '0-7': return None
        n['alc'] = ORDER['alc'][ORDER['alc'].index(cur) + 1]; return n, False
    if aid == 'connect':
        return (n, False) if ans['soc'] != 'conn' else None
    if aid == 'balance':
        return (n, False) if age >= 75 else None

YEAR_ACTIONS = [k for k, v in ACTIONS.items() if v[3]]

def potential_answers(ans, sex, age):
    """§6: all year-actions at target together (no weight, no social)."""
    n = dict(ans); qn = False
    for aid in YEAR_ACTIONS:
        r = apply_action(ans, aid, sex, age)
        if not r: continue
        new, q = r; qn = qn or q
        for f in ('act', 'fit', 'str', 'diet', 'sleep', 'irreg', 'alc'):
            if new.get(f) != ans.get(f): n[f] = new[f]
    return n, qn

def hours_per_day(gain, e_target, adherence, P=None):
    if adherence is None or gain is None: return None
    v = round_quarter(gain * 8766 / (365.25 * e_target * adherence))
    return min(max(v, 0.25), 3.0)

# ------------------------------------------------------------------------------------------------
# §5 range, §9 display, full compute
# ------------------------------------------------------------------------------------------------
def compute(ans, age, sex, gate='no', P=None):
    P = P or PARAMS; C = Cconst(sex, age, P)
    E = lambda a_, b, qn=False: ev(a_, age, sex, b, qn, C, P)
    e0, elo, ehi = E(ans, 0), E(ans, 1), E(ans, 2)     # b=1: all HR at CI lower -> longer
    pt = age + e0
    spread = elo - ehi
    hw0 = min(max(rhu(P['hw_coef'] * e0 + 0.5 * spread), 2), 4)
    dk = any(v == 'dk' for v in ans.values())
    mods = min(1, int(sex == 'X') + int(dk) + int(18 <= age <= 24) + int(gate == 'prefer_not'))
    hw = hw0 + mods
    acts = []
    for aid, (f, adh, grade, has_years) in ACTIONS.items():
        r = apply_action(ans, aid, sex, age)
        if not r: continue
        n, qn = r
        if has_years:
            et = E(n, 0, qn); g = et - e0
            gl, gh = E(n, 2, qn) - ehi, E(n, 1, qn) - elo    # all HR at CI upper / lower
            hpd = None if aid == 'smk_quit_date' else hours_per_day(g, et, adh, P)
            acts.append(dict(id=aid, gainYears=g, gainLow=min(gl, gh), gainHigh=max(gl, gh), hoursPerDay=hpd,
                             hpd_raw=None if hpd is None else g * 8766 / (365.25 * et * adh), grade=grade,
                             score=g * EW[grade], kind='smoking' if f == 'smk' else 'habit'))
        else:
            acts.append(dict(id=aid, gainYears=None, gainLow=None, gainHigh=None, hoursPerDay=None, hpd_raw=None,
                             grade=grade, score=-1e9, kind='persistence'))
    acts.sort(key=lambda x: -x['score'])
    pn, pq = potential_answers(ans, sex, age)
    pot = E(pn, 0, pq) - e0
    potl, poth = E(pn, 2, pq) - ehi, E(pn, 1, pq) - elo
    pot_lo, pot_hi = min(potl, poth, pot), max(potl, poth, pot)
    if age >= 75 or gate == 'yes': disp = 'gain-only'
    elif pot_hi < 0.5: disp = 'maintenance'
    else: disp = 'full'
    big = acts[0] if acts and acts[0]['gainYears'] is not None else None
    return dict(point=pt, baseline=age + cbs_e(sex, age), e_rem=e0, spread=spread, hw0=hw0, hw=hw,
                low=rhu(pt) - hw, high=rhu(pt) + hw, potentialGain=pot, potLow=pot_lo, potHigh=pot_hi,
                actions=acts, display=disp, C=C,
                biggestLever=None if big is None else dict(actionId=big['id'], gainYears=big['gainYears'], kind=big['kind']),
                isPlaceholder=any(v == 'placeholder' for v in STATUS.values()))

# ------------------------------------------------------------------------------------------------
# §7/§8 credit, §10 what-if
# ------------------------------------------------------------------------------------------------
def credited_gain(gain, weeks_full, monthly_all_confirmed):
    """§8. Smoking uses the same schedule with smoke-free weeks and gain = quit gain (tier path)."""
    if weeks_full < 12: return 0.0
    if weeks_full < 26: return 0.5 * gain
    return gain if monthly_all_confirmed else 0.5 * gain

def week_counts(days_done, threshold): return days_done >= threshold

def hours_per_week(days_done, dose_days, hpd):
    return None if hpd is None else round_quarter(min(days_done, dose_days) * hpd)

def what_if(ans, level, age, sex, gate='no', hide_number=False, P=None):
    """§10: activity only, five stops (Q1 levels). Hidden in gain-only / maintenance / hide-number."""
    base = compute(ans, age, sex, gate, P)
    if base['display'] != 'full' or hide_number: return None
    n = dict(ans); n['act'] = level
    r = compute(n, age, sex, gate, P)
    return dict(point=r['point'], potentialGain=(r['potLow'], r['potHigh']))

# ------------------------------------------------------------------------------------------------
# Calibrated parameters (see README 'v4 calibration log'). Kept separate so PARAMS_SPEC stays the
# literal docs/engine.md values.
# ------------------------------------------------------------------------------------------------
PARAMS_CAL = dict(PARAMS_SPEC, k=0.80, rho_vals=(0.0, 0.025, 0.1, 0.25), wo=(55, 90, 0.5))
PARAMS.update(PARAMS_CAL)
