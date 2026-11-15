import re,glob,bisect,collections
D='/var/log/dawntrader/'
mp=[]
for f in sorted(glob.glob(D+'out__2026-11-12_*.log'))+[D+'out__2026-11-13_00-00-00.log']:
    for l in open(f,errors='replace'):
        m=re.match(r'(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d).*\[MULTI_PROMOTE\] mode=paper, openSlots=(\d+), maxTrades=(\d+)',l)
        if m: mp.append((m.group(1),int(m.group(2)),int(m.group(3))))
mp.sort(); ts=[x[0] for x in mp]
rows=[]
for l in open(D+'error__2026-11-13_00-00-00.log',errors='replace'):
    m=re.match(r'(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d).*code:MAX_TOTAL_EXPOSURE, current=\$([\d.]+), projected=\$([\d.]+), max=\$([\d.]+)',l)
    if not m or not m.group(1).startswith('2026-11-12'): continue
    t,cur,proj,mx=m.group(1),float(m.group(2)),float(m.group(3)),float(m.group(4))
    i=bisect.bisect_right(ts,t)-1
    slots,maxT=(mp[i][1],mp[i][2]) if i>=0 else (None,None)
    rows.append((t,cur,proj-cur,mx,mx/(maxT or 20),slots,(maxT-slots) if slots is not None else None))
print('refusals',len(rows),'multi_promote lines',len(mp))
c=collections.Counter(r[6] for r in rows); print('open positions at bind:',sorted(c.items(),key=lambda x:(x[0] is None,x[0])))
over=[r[2]-r[4] for r in rows]; print('candidate - share ($): min %.2f max %.2f'%(min(over),max(over)))
print('candidate>share:',sum(1 for x in over if x>0),'of',len(over))
print('room left (max-current) min %.2f max %.2f'%(min(r[3]-r[1] for r in rows),max(r[3]-r[1] for r in rows)))
print('moneyHeld range %.2f-%.2f'%(min(r[3] for r in rows),max(r[3] for r in rows)))
for r in rows[:2]+rows[-2:]: print(r)
