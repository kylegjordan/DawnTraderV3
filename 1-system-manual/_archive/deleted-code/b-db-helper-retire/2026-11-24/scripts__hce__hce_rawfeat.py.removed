#!/usr/bin/env python3
"""
HCE — RAW market-shape feature angle (Kyle 2026-06-05).
================================================================================
Tests the pattern-study lens on TAKEN trades: instead of our LOGGED labels
(regime, DBS), compute the RAW market shape at entry directly from 1-min OHLC —
realized volatility (ATR%), short-horizon momentum (return over the lookback),
and distance-below-recent-high — then check win-rate / expectancy by ABSOLUTE
bands of each (calibration-robust per plan 1a). Also the continuation x high-vol
cell where the pattern edge lived. May-Jun admitted trades (OHLC era), per class.

Reads the Gate-(c) candidate set (/tmp/gatec_cands.jsonl: symbol, ac, entryTime,
entry, net) and queries preceding OHLC per symbol (psql; stdlib only).
"""
import json, os, subprocess, statistics, datetime, collections, argparse
TABLE={'crypto_spot':'crypto_spot_ohlc_1m','xstock_spot':'xstock_spot_ohlc_1m'}
def get_dburl(envfile):
    for l in open(envfile):
        if l.startswith('DATABASE_URL='): return l.strip().split('=',1)[1]
    raise SystemExit('no DATABASE_URL')
def iso(ms): return datetime.datetime.fromtimestamp(ms/1000,datetime.timezone.utc).isoformat()
def psql_ohlc(dburl,table,symbol,t0,t1):
    sym=symbol.replace("'","''")
    q=("SELECT (extract(epoch from interval_begin)*1000)::bigint, open, high, low, close "
       "FROM %s WHERE symbol='%s' AND interval_begin BETWEEN '%s' AND '%s' ORDER BY interval_begin")%(table,sym,iso(t0),iso(t1))
    r=subprocess.run(['psql',dburl,'-At','-F','\t','-c',q],capture_output=True,text=True)
    out=[]
    for line in r.stdout.splitlines():
        p=line.split('\t')
        if len(p)>=5:
            try: out.append((int(p[0]),float(p[1]),float(p[2]),float(p[3]),float(p[4])))
            except: pass
    return out
def band(v,bands):
    if v is None: return None
    for lo,hi,n in bands:
        if lo<=v<hi: return n
    return None
VOL=[(0,0.003,'vol_calm(<0.3%)'),(0.003,0.006,'vol_mid'),(0.006,0.012,'vol_high'),(0.012,9,'vol_extreme(>1.2%)')]
MOM=[(-9,-0.01,'mom_down(<-1%)'),(-0.01,0,'mom_softdown'),(0,0.01,'mom_softup'),(0.01,9,'mom_up(>1%)')]
DFH=[(0,0.005,'at_high(<0.5%)'),(0.005,0.02,'near_high'),(0.02,0.05,'below_high(2-5%)'),(0.05,9,'far_below(>5%)')]
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--cands',default='/tmp/gatec_cands.jsonl')
    ap.add_argument('--envfile',default='/home/deploy/dawntrader/.env')
    ap.add_argument('--lookback-min',type=int,default=60)
    args=ap.parse_args()
    dburl=get_dburl(args.envfile)
    cands=[json.loads(l) for l in open(args.cands) if l.strip()]
    bysym=collections.defaultdict(list)
    for c in cands: bysym[(c['ac'],c['symbol'])].append(c)
    keys=sorted(bysym,key=lambda k:-len(bysym[k]))
    print('candidates=%d symbols=%d lookback=%dmin'%(len(cands),len(keys),args.lookback_min))
    lb=args.lookback_min*60000
    feats=[]
    for i,(ac,sym) in enumerate(keys):
        rows=bysym[(ac,sym)]; table=TABLE.get(ac)
        if not table: continue
        t0=min(c['entryTime'] for c in rows)-lb-5*60000; t1=max(c['entryTime'] for c in rows)+60000
        bars=psql_ohlc(dburl,table,sym,t0,t1)
        for c in rows:
            e=c['entry']; et=c['entryTime']
            win=[b for b in bars if et-lb<=b[0]<et]
            if len(win)<10 or not e: continue
            atrp=statistics.mean([b[2]-b[3] for b in win])/e          # realized vol (ATR%)
            mom=(e-win[0][4])/win[0][4] if win[0][4] else None        # return over lookback
            hi=max(b[2] for b in win); dfh=(hi-e)/hi if hi else None   # distance below recent high
            feats.append(dict(ac=ac,net=c['net'],win=1 if c['net']>0 else 0,
                              vol=band(atrp,VOL),mom=band(mom,MOM),dfh=band(dfh,DFH),
                              atrp=atrp,mom_raw=mom))
        if (i+1)%100==0: print(' ...%d/%d symbols'%(i+1,len(keys)))
    def stats(rs):
        n=len(rs); w=sum(r['win'] for r in rs)
        return n,(100*w/n if n else 0),(100*statistics.mean([r['net'] for r in rs]) if rs else 0)
    print('\n'+'='*80); print('RAW MARKET-SHAPE FEATURES vs outcome (computed from OHLC at entry)'); print('='*80)
    for AC in ['crypto_spot','xstock_spot']:
        rs=[f for f in feats if f['ac']==AC]
        n,wr,ex=stats(rs)
        print('\n### %s  N=%d win%%=%.1f exp%%=%+.4f ###'%(AC,n,wr,ex))
        for dim,bands,lbl in [('vol',VOL,'realized-vol'),('mom',MOM,'momentum'),('dfh',DFH,'dist-below-high')]:
            print(' [%s]'%lbl)
            for _,_,name in bands:
                sub=[f for f in rs if f[dim]==name]
                if len(sub)<30: continue
                sn,sw,se=stats(sub)
                print('    %-22s N=%5d win%%=%.1f exp%%=%+.4f'%(name,sn,sw,se))
        # pattern-study cell: momentum-up (continuation) x high/extreme vol
        cont_hv=[f for f in rs if f['mom'] in ('mom_up(>1%)','mom_softup') and f['vol'] in ('vol_high','vol_extreme(>1.2%)')]
        rev_calm=[f for f in rs if f['mom'] in ('mom_down(<-1%)','mom_softdown') and f['vol'] in ('vol_calm(<0.3%)','vol_mid')]
        for lbl,sub in [('momentum-UP x HIGH-vol (pattern-edge cell)',cont_hv),('momentum-DOWN x CALM (loser cell)',rev_calm)]:
            if len(sub)>=30:
                sn,sw,se=stats(sub); print('    %-40s N=%5d win%%=%.1f exp%%=%+.4f'%(lbl,sn,sw,se))
if __name__=='__main__': main()
