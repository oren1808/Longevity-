import v3, math, itertools, random
from v3 import ev, compute, cbs_e
TYP = dict(act='75-149', fit='mod', str='0', smk='never', diet='mid', bmi='25-30', sleep='7-8', irreg='no', alc='0-7', soc='mid')
MODAL = dict(act='0', fit='easy', str='0', smk='never', diet='mid', bmi='18.5-25', sleep='7-8', irreg='no', alc='0-7', soc='conn')
BEST = dict(act='300+', fit='easy', str='2+', smk='never', diet='high', whtr='<0.5', sleep='7-8', irreg='no', alc='0-7', soc='conn')
SMOKER = dict(act='0', fit='hard', str='0', smk='20+', diet='low', bmi='30-35', sleep='6', irreg='no', alc='0-7', soc='mid')
def pt(a, age, s, qn=False): return age + ev(a, age, s, 0, qn)
def mod(a, **k): b = dict(a); b.update(k); return b
print("=== 4.3 anchors ===")
for s in 'MF':
    for age in (30, 45, 60):
        print(f"modal persona {s}{age}: engine-CBS = {pt(MODAL,age,s)-age-cbs_e(s,age):+.2f} (target 0..+3) | TYP {pt(TYP,age,s)-age-cbs_e(s,age):+.2f}")
for s in 'MF':
    five = mod(TYP, smk='never', bmi='18.5-25', act='150-299', fit='easy', alc='0-7', diet='high')
    five_f = mod(five, fit='mod')
    for nm, none in (('mild', mod(TYP, smk='<10', bmi='25-30', act='75-149', alc='15-24', diet='mid')),
                     ('moderate', mod(TYP, smk='10-19', bmi='30-35', act='1-74', alc='15-24', diet='low')),
                     ('severe', mod(TYP, smk='20+', bmi='35+', act='0', fit='hard', alc='35+', diet='low'))):
        print(f"Li @50 {s} five vs none[{nm}]: {pt(five,50,s)-pt(none,50,s):.1f} (fit kept mod in 'five': {pt(five_f,50,s)-pt(none,50,s):.1f}) target 12-14 (Li M12.2 F14.0)")
for s in 'MF':
    for nm, o in (('typ', TYP), ('best', BEST)):
        print(f"pack/day vs never @40 {s} others {nm}: {pt(mod(o,smk='never'),40,s)-pt(mod(o,smk='20+'),40,s):.2f} target 8-10")
for s in 'MF':
    a = mod(TYP, smk='20+')
    print(f"quit @45 {s} (others typ): {pt(a,45,s,True)-pt(a,45,s):.2f}; others SMOKER: {pt(SMOKER,45,s,True)-pt(SMOKER,45,s):.2f}; static q<5 forever: {pt(mod(a,smk='q<5'),45,s)-pt(a,45,s) if False else 0:.2f} target 5-6.5")
for s in 'MF':
    for fit in ('mod', 'hard', 'easy'):
        a = mod(TYP, act='0', fit=fit); n, _ = v3.apply_action(a, 'act')
        print(f"inactive->150 @40 {s} fit {fit}->{n['fit']}: {pt(n,40,s)-pt(a,40,s):.2f} target 1.5-3")
for s in 'MF':
    for lv in ('25-34', '35+'):
        print(f"alcohol {lv} vs 0-7 @40 {s}: {pt(TYP,40,s)-pt(mod(TYP,alc=lv),40,s):.2f} target 2-3")
    print(f"diet mid->high @40 {s}: {pt(mod(TYP,diet='high'),40,s)-pt(TYP,40,s):.2f}; low->high {pt(mod(TYP,diet='high'),40,s)-pt(mod(TYP,diet='low'),40,s):.2f} target <=3")
    print(f"best vs worst @50 {s}: {pt(BEST,50,s)-pt(dict(act='0',fit='hard',str='0',smk='20+',diet='low',bmi='35+',sleep='<6',irreg='yes',alc='35+',soc='iso'),50,s):.1f} (spec: 15-20 legit)")
