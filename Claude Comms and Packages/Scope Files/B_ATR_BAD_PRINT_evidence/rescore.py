import json, urllib.request, time, statistics as st, sys, datetime
S=sys.argv[1]
rows=[l.strip().split("|") for l in open(S+"/opens_1005.txt") if l.strip()]
cache={}
def candles(sym):
    p=sym.replace("/","")
    if p in cache: return cache[p]
    for name in (p,p.replace("BTC","XBT")):
        try:
            d=json.load(urllib.request.urlopen(f"https://api.kraken.com/0/public/OHLC?pair={name}&interval=60",timeout=20))
            if not d["error"]:
                k=[[c[0],float(c[1]),float(c[2]),float(c[3]),float(c[4]),int(c[7])] for kk,v in d["result"].items() if kk!="last" for c in v]
                cache[p]=k; time.sleep(1.1); return k
        except Exception: pass
        time.sleep(1.1)
    cache[p]=None; return None
def trs(b): return [max(b[i][2]-b[i][3],abs(b[i][2]-b[i-1][4]),abs(b[i][3]-b[i-1][4])) for i in range(1,len(b))]
def E0(b): t=trs(b); return sum(t)/len(t)
def E3(b):
    m=st.median(trs(b)); nb=[b[0]]
    for x in b[1:]:
        hi=max(x[1],x[4]); lo=min(x[1],x[4]); nb.append([x[0],x[1],min(x[2],hi+3*m),max(x[3],lo-3*m),x[4],x[5]])
    return E0(nb)
def spiked_r1(b):
    t=trs(b); mx=max(t); r=sorted(t); r.remove(mx); return mx/sum(t)>=0.40 and st.median(r)>0 and mx>=4*st.median(r)
out=[]
for sym,strat,op,*_ in rows:
    k=candles(sym)
    if not k: continue
    op=int(op); idx=[i for i,c in enumerate(k) if c[0]+3600<=op]
    if len(idx)<15: continue
    last=idx[-1]; b=k[last-14:last+1]
    t=trs(b); j=max(range(14),key=lambda x:t[x]); bar=b[j+1]; prev=b[j]
    rest=t[:j]+t[j+1:]; mat=st.median(rest)>0 and t[j]>=4*st.median(rest)
    pc=prev[4]; up=abs(bar[2]-pc)>=abs(bar[3]-pc); ext=(bar[2] if up else bar[3])-pc
    gi=last-14+j+1; nxt=k[gi+1] if gi+1<len(k) else None
    if ext==0 or nxt is None: S_="S?"; r1=r2=None
    else:
        r1=(bar[4]-pc)/ext; r2=(nxt[4]-pc)/ext
        S_="S+" if r1>=0.5 and r2>=0.5 else ("S-" if r1<=0.2 and r2<=0.2 else "S?")
    mtr=st.median([c[5] for c in b[1:]]); pr=bar[5]/mtr if mtr>0 else 0
    P_="P+" if pr>=3 else ("P-" if pr<2 else "P?")
    cls="NO SPIKE" if not mat else ("OFF-MARKET" if (S_=="S-" and P_=="P-") else ("GENUINE" if (S_=="S+" and P_=="P+") else "UNDETERMINED"))
    clean=st.mean(rest)
    out.append(dict(sym=sym,strat=strat,op=op,cls=cls,r1spk=spiked_r1(b),S=S_,P=P_,r1=r1,r2=r2,pr=pr,e0=E0(b),e3=E3(b),clean=clean,bt=bar[0]))
fmt=lambda o: f"{o['sym']} {o['strat']} {datetime.datetime.fromtimestamp(o['op'],datetime.timezone.utc):%m-%d %H:%M} bar {datetime.datetime.fromtimestamp(o['bt'],datetime.timezone.utc):%m-%d %H:%M} {o['S']}/{o['P']} r1={o['r1'] if o['r1'] is None else round(o['r1'],2)} r2={o['r2'] if o['r2'] is None else round(o['r2'],2)} part={o['pr']:.1f}x E0/clean={o['e0']/o['clean']:.2f} E3/clean={o['e3']/o['clean']:.2f}"
from collections import Counter
print("N =",len(out), Counter(o["cls"] for o in out))
print("round-1 spiked (6) by new class:", Counter(o["cls"] for o in out if o["r1spk"]))
print("round-1 controls (143) by new class:", Counter(o["cls"] for o in out if not o["r1spk"]))
for c in ("OFF-MARKET","GENUINE","UNDETERMINED"):
    print(f"\n{c}:"); [print("  ",fmt(o)) for o in out if o["cls"]==c]
pop1=[o for o in out if o["cls"]=="OFF-MARKET"]
ctrl=[o for o in out if o["cls"] in ("NO SPIKE","GENUINE")]
c1=[(o['sym'],round(o['e3']/o['clean'],2)) for o in pop1]
print("\nCRIT1 (OFF-MARKET, E3/clean <= 1.5):", c1, "PASS" if all(x<=1.5 for _,x in c1) else "FAIL")
d=sorted(abs(o['e3']-o['e0'])/o['e0'] for o in ctrl if o['e0']>0)
q=lambda p: d[min(len(d)-1,int(p*(len(d)-1)+0.5))]
print(f"CRIT2 control n={len(d)} of 149: min {100*d[0]:.2f}% p5 {100*q(.05):.2f}% p25 {100*q(.25):.2f}% median {100*st.median(d):.2f}% p75 {100*q(.75):.2f}% p95 {100*q(.95):.2f}% max {100*d[-1]:.2f}%", "PASS" if st.median(d)<=0.02 and q(.95)<=0.10 else "FAIL")
print("controls over 10%:", [(o['sym'],o['cls'],round(100*abs(o['e3']-o['e0'])/o['e0'],1)) for o in ctrl if abs(o['e3']-o['e0'])/o['e0']>0.10])
for o in out:
    if o['sym']=='AKE/USD': print("AKE:", fmt(o), o['cls'])
