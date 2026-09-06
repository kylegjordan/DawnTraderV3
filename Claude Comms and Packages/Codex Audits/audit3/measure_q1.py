"""Archive-observation statistics only; no claim of full venue tick resolution."""
from pathlib import Path
import pandas as pd, numpy as np, json, gc
ROOT=Path('C:/DawnTrader-Codex-Data'); OUT=Path(__file__).parent
summaries=[]
for cls,suffix in [('crypto_spot','crypto'),('xstock_spot','xstock')]:
    q=pd.read_csv(ROOT/f'quotes_{suffix}.csv',usecols=['symbol','asset_class','exchange','captured_at','bid','ask','last','bid_qty','ask_qty'])
    q['t']=pd.to_datetime(q.captured_at,format='mixed',utc=True)
    q=q.sort_values(['symbol','t'],kind='stable')
    finite=np.isfinite(q.bid)&np.isfinite(q.ask)
    positive=finite&(q.bid>0)&(q.ask>0)
    valid=positive&(q.ask>=q.bid)
    q['spread_bps']=np.where(valid,10000*(q.ask-q.bid)/((q.ask+q.bid)/2),np.nan)
    q['gap_s']=q.groupby('symbol').t.diff().dt.total_seconds()
    p=q[valid].copy()
    per=[]
    tape=pd.read_csv(ROOT/f'tape_1m_{suffix}.csv',usecols=['symbol','interval_begin','open','high','low','close'])
    tape['t']=pd.to_datetime(tape.interval_begin,format='mixed',utc=True)
    tape=tape[(tape.t>=q.t.min().floor('min'))&(tape.t<=q.t.max().floor('min'))]
    tok=np.isfinite(tape[['open','high','low','close']]).all(axis=1)&(tape[['open','high','low','close']]>0).all(axis=1)&(tape.high>=tape[['open','close','low']].max(axis=1))&(tape.low<=tape[['open','close','high']].min(axis=1))
    tape=tape[tok].copy();tape['range_bps']=(tape.high-tape.low)/tape.close*10000
    typical=tape.groupby('symbol').range_bps.median()
    for sym,g in q.groupby('symbol',sort=True):
        z=g.spread_bps.dropna(); gaps=g.gap_s.dropna()
        r={'population':f'{cls}; archived observations; {g.t.min().isoformat()} to {g.t.max().isoformat()}', 'asset_class':cls,'symbol':sym,'rows':len(g),'valid_spreads':len(z),'first':g.t.min().isoformat(),'last':g.t.max().isoformat(),'span_s':(g.t.max()-g.t.min()).total_seconds()}
        r['observed_rows_per_hour_span']=len(g)*3600/r['span_s'] if r['span_s']>0 else None
        for name,arr in [('spread_bps',z),('receipt_gap_s',gaps)]:
            for v in [.1,.5,.9,.95,.99]:r[f'{name}_p{int(v*100)}']=float(arr.quantile(v)) if len(arr) else None
        r['typical_1m_range_bps_same_archive_window']=float(typical.get(sym,np.nan))
        m=r['typical_1m_range_bps_same_archive_window']
        r['fraction_spread_ge_half_typical_range']=float((z>=m*.5).mean()) if np.isfinite(m) and m>0 and len(z) else None
        r['fraction_spread_ge_typical_range']=float((z>=m).mean()) if np.isfinite(m) and m>0 and len(z) else None
        # An observed quote lattice, not a published venue tick. Pool both sides on valid records.
        vals=g.loc[g.spread_bps.notna(),['bid','ask']].to_numpy().ravel()
        vals=np.unique(np.rint(vals*1e8).astype(np.int64))
        dif=np.diff(vals); dif=dif[dif>0]
        r['observed_quote_lattice_gcd']=float(np.gcd.reduce(dif)/1e8) if len(dif) else None
        r['minimum_observed_price_separation']=float(dif.min()/1e8) if len(dif) else None
        r['distinct_valid_side_prices']=len(vals)
        per.append(r)
    df=pd.DataFrame(per);df.to_csv(OUT/f'q1_instruments_{suffix}.csv',index=False)
    # Every hour is UTC, not an inferred venue session. Class summary explicitly event weighted.
    p['hour_utc']=p.t.dt.floor('h')
    hour=p.groupby(['symbol','hour_utc']).spread_bps.agg(n='size',median='median',p90=lambda x:x.quantile(.9)).reset_index()
    hour.insert(0,'population',f'{cls}; valid archived quotes per symbol/hour UTC')
    hour.to_csv(OUT/f'q1_hourly_{suffix}.csv',index=False)
    classhour=p.groupby('hour_utc').spread_bps.agg(n='size',median='median',p90=lambda x:x.quantile(.9)).reset_index()
    classhour.to_csv(OUT/f'q1_class_hourly_{suffix}.csv',index=False)
    s={'asset_class':cls,'population':'archived rows, event weighted unless stated','rows':len(q),'symbols':q.symbol.nunique(),'start':str(q.t.min()),'end':str(q.t.max()),'exchanges':q.exchange.value_counts().to_dict(),'valid_spreads':int(valid.sum()),'nonpositive_or_nonfinite_sides':int((~positive).sum()),'crossed_positive':int((positive&(q.ask<q.bid)).sum()),'locked_positive':int((positive&(q.ask==q.bid)).sum()),'duplicate_symbol_time':int(q.duplicated(['symbol','t']).sum()),'positive_size_valid_quotes':int((valid&(q.bid_qty>0)&(q.ask_qty>0)).sum()),'spread_bps_quantiles':p.spread_bps.quantile([.1,.5,.9,.95,.99]).to_dict(),'receipt_gap_s_quantiles':q.gap_s.dropna().quantile([.01,.1,.5,.9,.99]).to_dict(),'equal_instrument_median_spread_bps':float(df.spread_bps_p50.median()),'symbols_with_zero_typical_1m_range':int((df.typical_1m_range_bps_same_archive_window==0).sum()),'symbols_with_measurable_typical_range':int(df.fraction_spread_ge_typical_range.notna().sum()),'equal_instrument_median_fraction_spread_ge_half_typical_range':float(df.fraction_spread_ge_half_typical_range.median()),'equal_instrument_median_fraction_spread_ge_typical_range':float(df.fraction_spread_ge_typical_range.median())}
    summaries.append(s)
    print(json.dumps(s,indent=2),flush=True)
    del q,p,tape,hour;gc.collect()
(OUT/'q1_summary.json').write_text(json.dumps(summaries,indent=2),encoding='utf-8')
