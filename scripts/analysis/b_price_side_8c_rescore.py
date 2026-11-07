"""Row 8c section 10 - the pre-registered per-form admission re-score (B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md section 10).
Input: the output of b_price_side_8c_rescore.sql (psql -At, comma-separated), optional opened_at cutoff (string compare).
  ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && set -a && . ./.env && set +a && psql \"$DATABASE_URL\" -At -f /tmp/q.sql'" > out.csv
  python3 b_price_side_8c_rescore.py out.csv "2026-11-06 10"
Per record, re-based by the stamped form of the branch that built it: entry -> ask E(1+sp/2); anchor unchanged; distance
-(sp/2)E; proportional x(1-sp/2); r_multiple -> its R (invariant). Compared against the live crypto min_rr; the old
"every leg moves" formula (T-E-sp E)/(E-S+sp E) is printed beside it. sma_trend_ride/vwap_pullback branches are classified
by an EXACT R match; intended_entry_price is the promotion price (section 6 limit 1), so near-R records fall to the other
branch - both branches pass on this population.
"""
import sys, csv
rows=[l.strip().split(',') for l in open(sys.argv[1])]; rows=[r for r in rows if len(r)==9]
cut=sys.argv[2] if len(sys.argv)>2 else '9999'
recs=[]
for at,i,st,e,s,tp,sp,pool,fl in rows:
    if at>=cut: continue
    recs.append(dict(at=at,id=i,st=st,e=float(e),s=float(s),tp=float(tp),sp=(float(sp) if sp else None),pool=pool,fl=float(fl)))
np=[r for r in recs if r['pool']!='pattern']
print('total',len(recs),'non-pattern',len(np),'with spread',sum(r['sp'] is not None for r in np))
R_BREAK=2.5; R_VWAP_OVR=3.0; R_VWAP_DEF=2.0
out={}
for r in np:
    if r['sp'] is None: continue
    E,S,T,sp,fl=r['e'],r['s'],r['tp'],r['sp'],r['fl']
    rr_mid=(T-E)/(E-S)
    if rr_mid<fl: continue  # mid-pass population only
    ask=E*(1+sp/2); half=sp/2*E
    st=r['st']
    if st=='strong_bull_trend':          # distance / distance
        s2=S-half; t2=T-half; rr=(t2-ask)/(ask-s2); form='dist/dist'
    elif st in ('morning_star','reverse_impulse'):   # anchor / distance
        s2=S; t2=T-half; rr=(t2-ask)/(ask-s2); form='anchor/dist'
    elif st=='sma_trend_ride':
        if abs(rr_mid-R_BREAK)<1e-6: rr=R_BREAK; form='anchor/r(break)'
        else: s2=S; t2=T*(1-sp/2); rr=(t2-ask)/(ask-s2); form='anchor/prop(trailing)'
    elif st=='vwap_pullback':
        if abs(rr_mid-R_VWAP_OVR)<1e-6: rr=R_VWAP_OVR; form='dist/r(override)'
        else:
            # default: anchor stop, max(anchor, r_multiple) target; bound both
            rr_a=(T-ask)/(ask-S); rr_r=R_VWAP_DEF; rr=max(rr_a, rr_r) if abs(rr_mid-R_VWAP_DEF)>1e-6 else rr_r; form='anchor/max(anchor,r)'
    else:
        form='?'; rr=float('nan')
    old=(T-E-sp*E)/(E-S+sp*E)
    o=out.setdefault(st,[0,0,form,[],0]); o[0]+=1
    if rr<fl: o[1]+=1
    if old<fl: o[4]+=1
    o[3].append(round(rr_mid,4))
tot=sum(v[0] for v in out.values()); ref=sum(v[1] for v in out.values())
for k,v in sorted(out.items(), key=lambda kv:-kv[1][0]): print(k, v[2], 'mid-pass', v[0], 'newly refused per-form', v[1], 'every-leg', v[4], 'rr_mid', v[3][:6])
print('ALL mid-pass',tot,'newly refused per-form',ref, '=%.1f%%'%(100*ref/tot if tot else 0), 'every-leg', sum(v[4] for v in out.values()))
