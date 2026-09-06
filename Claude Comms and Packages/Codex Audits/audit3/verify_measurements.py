"""Independent timestamp/dictionary checks, fee identity, file/row invariants."""
from pathlib import Path
from datetime import datetime,timedelta
import csv,json,math
import pandas as pd,numpy as np
R=Path('C:/DawnTrader-Codex-Data');O=Path(__file__).parent;checks=[]
for suffix in ['crypto','xstock']:
    measured=pd.read_csv(O/f'q3_tape_instruments_{suffix}.csv')
    symbols=['BTC/USD','ETH/USD'] if suffix=='crypto' else ['NVDA/USD','A/USD']
    have=set(measured.symbol);symbols=[x for x in symbols if x in have]
    by={s:{} for s in symbols}
    with (R/f'tape_1m_{suffix}.csv').open(newline='',encoding='utf-8') as f:
        for row in csv.DictReader(f):
            s=row['symbol']
            if s not in by:continue
            ts=datetime.fromisoformat(row['interval_begin'])
            v={k:float(row[k]) for k in ['open','high','low','close']}
            if all(math.isfinite(x) and x>0 for x in v.values()) and v['high']==max(v.values()) and v['low']==min(v.values()):by[s][ts]=v
    for s,data in by.items():
        for h in [5,15,60,240]:
            ep=[];up=[]
            for t,v in data.items():
                future=[data.get(t+timedelta(minutes=k)) for k in range(1,h+1)]
                if any(x is None for x in future):continue
                ep.append((future[-1]['close']/v['close']-1)*10000)
                up.append((max(x['high'] for x in future)/v['close']-1)*10000)
            found=measured[(measured.symbol==s)&(measured.horizon_min==h)].iloc[0]
            assert found.valid_origins==len(ep),(s,h,found.valid_origins,len(ep))
            if ep:
                assert math.isclose(found.signed_endpoint_bps_p50,float(np.median(ep)),abs_tol=1e-8)
                assert math.isclose(found.future_up_excursion_bps_p90,float(np.quantile(up,.9)),abs_tol=1e-8)
            checks.append({'check':'independent datetime dictionary all-intervening-minutes','symbol':s,'horizon':h,'n':len(ep),'result':'PASS'})
    q1=pd.read_csv(O/f'q1_instruments_{suffix}.csv');summary=json.load(open(O/'q1_summary.json'))[0 if suffix=='crypto' else 1]
    assert int(q1.rows.sum())==summary['rows']
    assert int(q1.valid_spreads.sum())==summary['valid_spreads']
    assert len(q1)==summary['symbols']
    assert (q1.spread_bps_p50>=0).all()
    checks.append({'check':'Q1 per-instrument totals and nonnegative admitted spreads','class':suffix,'result':'PASS'})
fees=pd.read_csv(O/'q3_fee_hurdles.csv')
for f in fees.itertuples():
    p1=1+f.exact_long_fee_breakeven_bps/10000
    assert abs(p1*(1-f.exit_rate)-(1+f.entry_rate))<1e-12
assert len(fees)==57
checks.append({'check':'57 fee hurdles settle to zero exact net quote cashflow','result':'PASS'})
# Inspect actual dataset fee-group ambiguity, without assigning a substitute schedule.
for suffix in ['crypto','xstock']:
    q=pd.read_csv(O/f'q1_class_hourly_{suffix}.csv')
    lo=q.loc[q['median'].idxmin()];hi=q.loc[q['median'].idxmax()]
    checks.append({'check':'hourly descriptive range','class':suffix,'min_hour':str(lo.hour_utc),'min_bps':lo['median'],'max_hour':str(hi.hour_utc),'max_bps':hi['median']})
(O/'verification.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
print(json.dumps(checks,indent=2))
