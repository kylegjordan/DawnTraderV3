# B-XSTOCK-BID-TRIGGER-RELAND design r5: minute-by-minute share of XS_FRAME frames with spread > 1% around the 4:15 pm ET (20:15Z, EDT) and 8:15 pm ET (00:15Z) handoffs, over the frozen 7-day corpus. Run on staging: python3 xstock-handoff-spread-minutes.py
import gzip,re,collections
rx=re.compile(r'^(\d{4}-\d\d-\d\d) (\d\d):(\d\d):\d\d \+00:00: .*\[XS_FRAME\] \S+ pos=\S+ .*? spread=(\S+) ')
tot=collections.Counter(); wide=collections.Counter(); days=collections.defaultdict(set)
for l in gzip.open('/home/deploy/xs_window/xs_frame_window_2026-10-02_to_2026-10-09.log.gz','rt',errors='replace'):
    if 'XS_FRAME' not in l: continue
    m=rx.match(l)
    if not m: continue
    h=int(m.group(2)); mi=int(m.group(3))
    if h in (19,20) or h in (23,0):
        key=('A' if h in (19,20) else 'B', (h*60+mi) if h in (19,20) else ((h%24)*60+mi if h==0 else -(60-mi)))
        try: sp=float(m.group(4))
        except: continue
        tot[key]+=1; wide[key]+= sp>0.01; days[key].add(m.group(1))
for w,lab,rng in (('A','4:15pm ET = 20:15Z',range(19*60+50,21*60)),('B','8:15pm ET = 00:15Z',range(-10,60))):
    print('==',lab,'minute  frames  share_spread>1%')
    for k in rng:
        t=tot[(w,k)]
        if t: print(f'{k//60 if k>=0 else 23:02d}:{k%60:02d} {t:6d} {100*wide[(w,k)]/t:6.1f}%')
