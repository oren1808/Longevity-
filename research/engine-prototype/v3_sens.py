import v3, numpy as np
from v3 import ev, compute
from v3_tests import TYP, SMOKER, BEST, mod
def pt(a, age, s, qn=False): return age + ev(a, age, s, 0, qn)
def anchors(tag):
    out=[]
    for s in 'M':
        out.append(('pack@40', pt(mod(TYP,smk='never'),40,s)-pt(mod(TYP,smk='20+'),40,s)))
        a=mod(TYP,smk='20+'); out.append(('quit@45', pt(a,45,s,True)-pt(a,45,s)))
        a=mod(TYP,act='0'); n,_=v3.apply_action(a,'act'); out.append(('act@40', pt(n,40,s)-pt(a,40,s)))
        out.append(('alc25-34@40', pt(TYP,40,s)-pt(mod(TYP,alc='25-34'),40,s)))
        out.append(('best-worst@50', pt(BEST,50,s)-pt(dict(act='0',fit='hard',str='0',smk='20+',diet='low',bmi='35+',sleep='<6',irreg='yes',alc='35+',soc='iso'),50,s)))
        out.append(('TYP70 pt', pt(TYP,70,s))); out.append(('smoker q<5 @50 pt', pt(mod(TYP,smk='q<5'),50,s)))
        out.append(('fit dk, act 300+ @45 pt', pt(mod(BEST,fit='dk'),45,s)))
    print(f"{tag:28s} " + "  ".join(f"{k}={v:.2f}" for k,v in out))
anchors('default (component atten)')
v3.OPTS['atten']='factor'; anchors('per-factor atten')
v3.OPTS['atten']='component'; v3.OPTS['quit_offset']='start'; anchors('quit offset = start')
v3.OPTS['quit_offset']='mid'; v3.OPTS['fit_dk_rule']='act_only'; anchors('fit dk -> activity only')
v3.OPTS['fit_dk_rule']='mean'
# q' form check: proportional hazards vs q*H
q=v3.LT['M']; H=3.0/2.0
for a in (45,70,85,95):
    print(f"age {a}: q={q[a]:.4f}  1-(1-q)^H={1-(1-q[a])**H:.4f}  min(1,qH)={min(1,q[a]*H):.4f}")
