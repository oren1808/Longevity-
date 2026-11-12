import v3, random
from v3 import ev, compute, F
from v3_tests import TYP, BEST, SMOKER, MODAL, mod
import contextlib, io
ORD = {'act': ['0','1-74','75-149','150-299','300+'], 'fit':['hard','mod','easy'], 'str':['0','1','2+'], 'diet':['low','mid','high'],
 'sleep':['<6','9+','6','7-8'], 'irreg':['yes','no'], 'alc':['35+','25-34','15-24','8-14','0-7'],
 'smk':['20+','10-19','<10','q<5','q5-15','q>15','never'], 'bmi':['35+','30-35','<18.5','25-30','18.5-25'], 'soc':['iso','mid','conn']}
viol=[]
for base in (TYP, SMOKER, BEST, MODAL, mod(SMOKER, act='300+', fit='easy')):
    for s in 'MFX':
        for age in (18, 45, 59, 60, 74, 75, 85):
            for f, order in ORD.items():
                pts=[ev(mod(base,**{f:l}),age,s) for l in order]
                viol += [(f,order[i],age,s) for i in range(len(pts)-1) if pts[i+1]<pts[i]-1e-9]
print('monotonic violations (HR-ordered levels):', len(viol), viol[:5])
# band-edge discontinuity
for s in 'MF':
    for a in (39,40,59,60,74,75):
        print(s,a,'TYP point',round(a+ev(TYP,a,s),2),'C',round(v3.Cconst(s,a),3))
# hoursPerDay distribution by action
random.seed(5); from collections import defaultdict; d=defaultdict(list)
LV={f:list(F[f]) for f in F}
for i in range(200):
    a={f:random.choice(LV[f]) for f in ['act','fit','str','smk','diet','bmi','sleep','irreg','alc','soc']}
    s=random.choice('MF'); age=random.randint(25,74)
    for x in compute(a,age,s)['actions']: d[x['id']].append(x['hpd_raw'])
for k,v in d.items():
    v=sorted(v); print(f"{k}: n={len(v)} min {v[0]:.2f} median {v[len(v)//2]:.2f} max {v[-1]:.2f}  share<0.125: {sum(x<0.125 for x in v)/len(v):.0%} share>3: {sum(x>3 for x in v)/len(v):.0%}")
