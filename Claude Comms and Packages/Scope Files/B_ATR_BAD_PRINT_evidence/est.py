import json, urllib.request, time, statistics as st, sys
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
                k=[[c[0],float(c[1]),float(c[2]),float(c[3]),float(c[4])] for kk,v in d["result"].items() if kk!="last" for c in v]
                cache[p]=k; time.sleep(1.1); return k
        except Exception: pass
        time.sleep(1.1)
    cache[p]=None; return None
def trs(b):  # b: list of [t,o,h,l,c]; 15 bars -> 14 TRs
    return [max(b[i][2]-b[i][3], abs(b[i][2]-b[i-1][4]), abs(b[i][3]-b[i-1][4])) for i in range(1,len(b))]
def E0(b): t=trs(b); return sum(t)/len(t)
def E1raw(b): return st.median(trs(b))
def E2(b):
    t=trs(b); m=st.median(t); return sum(min(x,3*m) for x in t)/len(t)
def E3(b):
    m=st.median(trs(b)); nb=[b[0]]
    for x in b[1:]:
        hi=max(x[1],x[4]); lo=min(x[1],x[4])
        nb.append([x[0],x[1],min(x[2],hi+3*m),max(x[3],lo-3*m),x[4]])
    return E0(nb)
def spiked(b):
    t=trs(b); mx=max(t); r=sorted(t); r.remove(mx); return mx/sum(t)>=0.40 and st.median(r)>0 and mx>=4*st.median(r)
def clean13(b):
    t=trs(b); mx=max(t); r=list(t); r.remove(mx); return sum(r)/len(r)
recs=[]
for sym,strat,op,*_ in rows:
    k=candles(sym)
    if not k: continue
    op=int(op); b=[c for c in k if c[0]+3600<=op][-15:]
    if len(b)<15: continue
    recs.append(dict(sym=sym,sp=spiked(b),e0=E0(b),e1r=E1raw(b),e2=E2(b),e3=E3(b),c13=clean13(b)))
ctrl=[r for r in recs if not r["sp"]]; spk=[r for r in recs if r["sp"]]
scale=st.median([r["e0"]/r["e1r"] for r in ctrl if r["e1r"]>0])
for r in recs: r["e1"]=r["e1r"]*scale
print(f"opens measured: {len(recs)} (spiked {len(spk)}, control {len(ctrl)}); E1 scale factor {scale:.3f}")
def q(xs,p): xs=sorted(xs); return xs[min(len(xs)-1,int(p*(len(xs)-1)+0.5))]
for e in ("e1","e2","e3"):
    d=[abs(r[e]-r["e0"])/r["e0"] for r in ctrl if r["e0"]>0]
    over=[(r["sym"],round(100*abs(r[e]-r["e0"])/r["e0"],1)) for r in ctrl if r["e0"]>0 and abs(r[e]-r["e0"])/r["e0"]>0.10]
    supp=[(r["sym"], round(r[e]/r["c13"],2)) for r in spk]
    c1=all(x<=1.5 for _,x in supp); c2=st.median(d)<=0.02 and q(d,0.95)<=0.10
    print(f"\n{e.upper()}: control |dE|/E0  min {100*min(d):.2f}% p5 {100*q(d,.05):.2f}% p25 {100*q(d,.25):.2f}% median {100*st.median(d):.2f}% p75 {100*q(d,.75):.2f}% p95 {100*q(d,.95):.2f}% max {100*max(d):.2f}%")
    print(f"   controls over 10%: {len(over)} {over}")
    print(f"   spiked E/clean13: {supp}")
    print(f"   criterion1(suppress) {'PASS' if c1 else 'FAIL'}  criterion2(control) {'PASS' if c2 else 'FAIL'}")
# positive-control fixtures
def bars(seq):
    return [[i,o,h,l,c] for i,(o,h,l,c) in enumerate(seq)]
base=[(100,100.5,99.5,100)]*15
fa=base[:14]+[(100,128,99.5,100.1)]
fb=base[:12]+[(100,104.5,99.8,104),(104,108.5,103.8,108),(108,112.5,107.8,112)]
fc=base[:14]+[(110,111,109,110)]
clean=E0(bars(base))
print("\nfixtures (E0 clean = %.3f):" % clean)
for name,f in (("a isolated wick",fa),("b 3 wide moving bars",fb),("c gap-and-hold",fc)):
    b=bars(f); e0=E0(b)
    out={e: round(fn(b),3) for e,fn in (("E0",E0),("E2",E2),("E3",E3))}
    out["E1"]=round(E1raw(b)*scale,3)
    rise={k:(v-clean)/(e0-clean) if e0!=clean else 0 for k,v in out.items()}
    print(f"  {name}: {out}  share of E0's rise: { {k:round(v,2) for k,v in rise.items()} }  vs clean x{ {k:round(v/clean,2) for k,v in out.items()} }")
