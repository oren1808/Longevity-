"""Quick re-implementation of spec section 4.2 for review purposes."""
import math, itertools, random
import numpy as np

MAXAGE = 110

# ---------------- life table: Gompertz-Makeham + infant term ----------------
def qx_table(A, B, c, q0):
    q = []
    for x in range(MAXAGE + 1):
        H = A + B / c * (math.exp(c * (x + 1)) - math.exp(c * x))
        qq = 1 - math.exp(-H)
        if x == 0:
            qq = 1 - (1 - qq) * (1 - q0)
        q.append(min(qq, 1.0))
    q[MAXAGE] = 1.0
    return np.array(q)

def ex(q, a, hr=None):
    """e_a = 0.5 + sum_k prod_{j<k}(1-q'_{a+j}); hr(y) gives HR at age y."""
    s, surv = 0.5, 1.0
    for y in range(a, MAXAGE + 1):
        qq = q[y]
        if hr is not None:
            h = hr(y)
            qq = 1 - (1 - qq) ** h
        surv *= (1 - qq)
        s += surv
        if surv < 1e-9:
            break
    return s

# spec formula: e = 0.5 + sum_{k>=1} prod_{j<k}(1-q) ; our loop adds surv after
# multiplying by (1-q_a) first, i.e. sum_{k>=1} l_{a+k}/l_a  -> matches.

TARGETS = {'M': (80.8, 19.6, 9.2), 'F': (85.0, 22.2, 10.4)}

def nelder_mead(f, x0, step=0.1, iters=4000):
    n = len(x0)
    pts = [np.array(x0, float)]
    for i in range(n):
        p = np.array(x0, float); p[i] += step; pts.append(p)
    vals = [f(p) for p in pts]
    for _ in range(iters):
        order = np.argsort(vals); pts = [pts[i] for i in order]; vals = [vals[i] for i in order]
        cen = sum(pts[:-1]) / n
        xr = cen + (cen - pts[-1]); fr = f(xr)
        if fr < vals[0]:
            xe = cen + 2 * (cen - pts[-1]); fe = f(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = cen + 0.5 * (pts[-1] - cen); fc = f(xc)
            if fc < vals[-1]:
                pts[-1], vals[-1] = xc, fc
            else:
                pts = [pts[0] + 0.5 * (p - pts[0]) for p in pts]; vals = [f(p) for p in pts]
    i = int(np.argmin(vals)); return pts[i], vals[i]

def calibrate(sex):
    t = TARGETS[sex]
    q0 = 0.0030 if sex == 'M' else 0.0026
    def obj(p):
        A, B, c = math.exp(p[0]), math.exp(p[1]), p[2]
        q = qx_table(A, B, c, q0)
        return sum((ex(q, a) - v) ** 2 for a, v in zip((0, 65, 80), t))
    p, v = nelder_mead(obj, [math.log(3e-4), math.log(2e-5), 0.10], 0.3)
    p, v = nelder_mead(obj, list(p), 0.05)
    return qx_table(math.exp(p[0]), math.exp(p[1]), p[2], q0), (math.exp(p[0]), math.exp(p[1]), p[2]), v

LT = {}
for s in 'MF':
    LT[s], params, err = calibrate(s)
    print(f"{s}: A={params[0]:.2e} B={params[1]:.2e} c={params[2]:.4f} sse={err:.2e} | " +
          " ".join(f"e{a}={ex(LT[s], a):.2f}" for a in (0, 30, 40, 45, 50, 60, 65, 70, 80, 85, 90)) +
          f" | q45={LT[s][45]:.4f} q70={LT[s][70]:.4f}")
LT['X'] = (LT['M'] + LT['F']) / 2  # 'not specified' option A: averaged qx

# ---------------- factors (Appendix B) ----------------
F = {
 'act':   {'300+': (1.00, 1.00, 1.00), '150-299': (1.10, 1.05, 1.15), '75-149': (1.20, 1.12, 1.28),
           '1-74': (1.30, 1.20, 1.40), '0': (1.55, 1.40, 1.70)},
 'fit':   {'easy': (1.00, 1.00, 1.00), 'mod': (1.10, 1.03, 1.20), 'hard': (1.30, 1.15, 1.50)},
 'str':   {'2+': (1.00, 1.00, 1.00), '1': (1.05, 1.00, 1.10), '0': (1.15, 1.08, 1.20)},
 'smk':   {'never': (1.00, 1.00, 1.00), 'q>15': (1.10, 1.00, 1.20), 'q5-15': (1.30, 1.15, 1.45),
           'q<5': (1.70, 1.40, 2.00), '<10': (2.00, 1.70, 2.30), '10-19': (2.50, 2.20, 2.80),
           '20+': (3.00, 2.60, 3.40)},
 'diet':  {'top': (1.00, 1.00, 1.00), 'mid': (1.10, 1.05, 1.15), 'low': (1.22, 1.12, 1.35)},
 'waist': {'<0.5': (1.00, 1.00, 1.00), '0.5-0.6': (1.10, 1.05, 1.20), '>0.6': (1.45, 1.30, 1.55)},
 'sleep': {'7-8': (1.00, 1.00, 1.00), '6': (1.06, 1.03, 1.08), '<=5': (1.13, 1.08, 1.20), '9+': (1.10, 1.00, 1.15)},
 'irreg': {'no': (1.00, 1.00, 1.00), 'yes': (1.05, 1.00, 1.10)},
 'alc':   {'0-7': (1.00, 1.00, 1.00), '8-14': (1.05, 1.02, 1.08), '15-24': (1.17, 1.10, 1.22), '25+': (1.55, 1.45, 1.65)},
 'soc':   {'conn': (1.00, 1.00, 1.00), 'mid': (1.10, 1.03, 1.15), 'iso': (1.25, 1.14, 1.32)},
}
BEST = {f: list(v)[0] for f, v in F.items()}
WORST = {'act': '0', 'fit': 'hard', 'str': '0', 'smk': '20+', 'diet': 'low', 'waist': '>0.6',
         'sleep': '<=5', 'irreg': 'yes', 'alc': '25+', 'soc': 'iso'}

# Assumed Israeli adult prevalence (rough, stated in report)
PREV = {
 'act':   {'300+': .15, '150-299': .20, '75-149': .17, '1-74': .18, '0': .30},
 'fit':   {'easy': .40, 'mod': .38, 'hard': .22},
 'str':   {'2+': .20, '1': .12, '0': .68},
 'smk_M': {'never': .50, 'q>15': .10, 'q5-15': .08, 'q<5': .05, '<10': .07, '10-19': .09, '20+': .11},
 'smk_F': {'never': .72, 'q>15': .06, 'q5-15': .05, 'q<5': .03, '<10': .05, '10-19': .05, '20+': .04},
 'diet':  {'top': .25, 'mid': .45, 'low': .30},
 'waist': {'<0.5': .30, '0.5-0.6': .45, '>0.6': .25},
 'sleep': {'7-8': .55, '6': .27, '<=5': .12, '9+': .06},
 'irreg': {'no': .70, 'yes': .30},
 'alc_M': {'0-7': .82, '8-14': .10, '15-24': .05, '25+': .03},
 'alc_F': {'0-7': .95, '8-14': .03, '15-24': .015, '25+': .005},
 'soc':   {'conn': .50, 'mid': .38, 'iso': .12},
}
def prev(f, sex):
    s = 'M' if sex == 'X' else sex
    return PREV.get(f + '_' + s, PREV.get(f))

K, CLAMP = 0.75, 4.0

def hr_of(f, lvl, b): return F[f][lvl][b]

def pair_af(a, fi, b, mode):
    ha, hf = hr_of('act', a, b), hr_of('fit', fi, b)
    if mode == 'max':   return math.log(max(ha, hf))
    if mode == 'k05':   return 0.5 * (math.log(ha) + math.log(hf))
    return math.log(ha) + math.log(hf)  # 'both' = naive double count

def raw_ln(ans, b, mode='max'):
    s = pair_af(ans['act'], ans['fit'], b, mode)
    for f in F:
        if f in ('act', 'fit'): continue
        s += math.log(hr_of(f, ans[f], b))
    return s

def pop_norm_ln(sex, b, mode='max'):
    """spec-literal: divide each HR by prevalence-weighted mean -> C = sum k*ln(m_i)."""
    s = 0
    # activity/fitness pair mean under independence
    pa, pf = prev('act', sex), prev('fit', sex)
    m = sum(pa[a] * pf[fi] * math.exp(pair_af(a, fi, b, mode)) for a in pa for fi in pf)
    s += math.log(m)
    for f in F:
        if f in ('act', 'fit'): continue
        p = prev(f, sex)
        s += math.log(sum(p[l] * hr_of(f, l, b) for l in p))
    return K * s

def w(y):
    if y <= 60: return 1.0
    if y >= 90: return 0.5
    return 1 - 0.5 * (y - 60) / 30

def combined_hr(ans, sex, b, mode='max', clamp=CLAMP, k=K, norm_b=None):
    raw = math.exp(k * raw_ln(ans, b, mode))
    if clamp: raw = min(raw, clamp)
    nb = b if norm_b is None else norm_b
    C = math.exp(pop_norm_ln(sex, nb, mode) * k / K)
    return raw / C

def e_total(age, sex, H):
    return age + ex(LT[sex], age, lambda y: 1 + (H - 1) * w(y))

def run(ans, age, sex, b=0, **kw):
    return e_total(age, sex, combined_hr(ans, sex, b, **kw))

def range_(ans, age, sex, **kw):
    mid = run(ans, age, sex, 0, **kw)
    lo = run(ans, age, sex, 2, **kw)   # hrHigh -> lower e
    hi = run(ans, age, sex, 1, **kw)
    lo2, hi2 = min(lo, mid - 2), max(hi, mid + 2)
    return mid, lo, hi, round(lo2), round(hi2)

TARGET = {'act': '150-299', 'str': '2+', 'smk': 'q<5', 'diet': 'top', 'waist': '<0.5',
          'sleep': '7-8', 'irreg': 'no', 'alc': '0-7', 'soc': 'conn'}
ORDER = {f: list(F[f]) for f in F}

def improve(cur, f, tgt):
    # only move toward healthier (lower index); smoking target only for current smokers / recent
    if f == 'smk':
        return tgt if cur in ('<10', '10-19', '20+') else cur
    if f == 'sleep' and cur == '9+':
        return cur  # spec: long sleep not an action
    return tgt if ORDER[f].index(cur) > ORDER[f].index(tgt) else cur

def actions(ans, age, sex, **kw):
    base = run(ans, age, sex, **kw)
    out = {}
    for f, t in TARGET.items():
        new = dict(ans); new[f] = improve(ans[f], f, t)
        if new[f] != ans[f]:
            out[f] = run(new, age, sex, **kw) - base
    allnew = dict(ans)
    for f, t in TARGET.items(): allnew[f] = improve(ans[f], f, t)
    allnew['fit'] = 'easy'  # modifiable via activity
    pot = run(allnew, age, sex, **kw) - base
    return base, out, pot

if __name__ == '__main__':
    pass
