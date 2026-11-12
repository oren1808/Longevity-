import v3
from v3_tests import TYP, mod
a=mod(TYP,smk='20+')
for s in 'MF':
    print(s,'quit gain by age (Jha: 25-34 ~10, 35-44 ~9, 45-54 ~6, 55-64 ~4):',{age: round(v3.ev(a,age,s,0,True)-v3.ev(a,age,s),1) for age in (30,40,45,50,60)},
          '| full gap vs never:',{age: round(v3.ev(mod(TYP,smk='never'),age,s)-v3.ev(a,age,s),1) for age in (30,45,60)})
# residual: replace q>15 HR with value that gives ~6 @45 M
orig=dict(v3.F['smk'])
for r in (1.3,1.5,1.7):
    v3.F['smk']['q>15']=(r,r,r); v3.F['smk']['q5-15']=(max(r,1.30),)*3
    print('q>15 floor',r,{age: round(v3.ev(a,age,'M',0,True)-v3.ev(a,age,'M'),1) for age in (30,40,45,50,60)})
v3.F['smk'].update(orig)
