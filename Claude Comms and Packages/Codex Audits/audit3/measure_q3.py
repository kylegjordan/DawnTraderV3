"""Forward bar-path opportunity descriptions, never strategy returns or fill proxies.
Only exact uninterrupted 1-minute sequences; drop all duplicate-key rows.
Fee hurdles are conditional scenarios, not a verified instrument-fee assignment.
"""
from pathlib import Path
import pandas as pd,numpy as np,json,gc
R=Path('C:/DawnTrader-Codex-Data');O=Path(__file__).parent
fees=pd.read_csv(R/'fee_ladder.csv'); hs=[]
for f in fees.itertuples():
    for mode,a,b in [('TT',f.taker_rate,f.taker_rate),('MT',f.maker_rate,f.taker_rate),('MM',f.maker_rate,f.maker_rate)]:
        hs.append({'asset_class':f.asset_class,'rung':f.rung,'execution':mode,'entry_rate':a,'exit_rate':b,'equal_notional_fee_bps':(a+b)*1e4,'exact_long_fee_breakeven_bps':((1+a)/(1-b)-1)*1e4,'population':'conditional supplied fee ladder; no spread, depth, queue or slippage; not a verified fee-group assignment per symbol'})
pd.DataFrame(hs).to_csv(O/'q3_fee_hurdles.csv',index=False)
quality=[];summary=[]
for cls,suffix in [('crypto_spot','crypto'),('xstock_spot','xstock')]:
    d=pd.read_csv(R/f'tape_1m_{suffix}.csv');d['t']=pd.to_datetime(d.interval_begin,format='mixed',utc=True)
    dup=d.duplicated(['symbol','t'],keep=False)
    vals=d[['open','high','low','close']]
    ok=np.isfinite(vals).all(axis=1)&(vals>0).all(axis=1)&(d.high>=vals.max(axis=1))&(d.low<=vals.min(axis=1))
    qual={'asset_class':cls,'rows':len(d),'symbols':d.symbol.nunique(),'start':str(d.t.min()),'end':str(d.t.max()),'exchanges':d.exchange.value_counts().to_dict(),'duplicate_key_rows_all_excluded':int(dup.sum()),'invalid_ohlc_rows':int((~ok).sum()),'zero_volume_rows':int((d.volume==0).sum()),'flat_bars':int((d.high==d.low).sum()),'admitted_valid_unique_bars':int((~dup&ok).sum())}
    d=d[~dup&ok].sort_values(['symbol','t']).copy()
    rows=[];comparisons=[];arrs={h:[] for h in [5,15,60,240]}
    for sym,g in d.groupby('symbol',sort=True):
        g=g.reset_index(drop=True); n=len(g);t=g.t.dt.as_unit('ns').astype('int64').to_numpy()//1_000_000_000
        assert (t%60==0).all(), 'Non-minute-aligned bar: cannot apply contiguous-minute estimator'
        assert t[0]==int(g.t.iloc[0].timestamp()), 'Datetime unit mismatch'
        price=g.close.to_numpy();high=g.high;low=g.low
        for h in arrs:
            # All h+1 source bars including origin exist. A span of h*60 with sorted unique
            # minute keys proves no omitted minutes between them.
            idx=np.arange(max(0,n-h));valid=(t[idx+h]-t[idx]==h*60)
            ii=idx[valid]
            ep=(price[ii+h]/price[ii]-1)*1e4
            # rolling right edge at origin+h contains exactly origin+1...origin+h.
            hi=high.rolling(h).max().to_numpy()[ii+h];lo=low.rolling(h).min().to_numpy()[ii+h]
            up=(hi/price[ii]-1)*1e4;down=(1-lo/price[ii])*1e4
            pop=f'{cls}; {sym}; contiguous {h+1} minute bars; origin close to future {h}m; supplied window; overlapping origins; no fill claim'
            row={'population':pop,'asset_class':cls,'symbol':sym,'horizon_min':h,'valid_origins':len(ii),'potential_row_offset_origins':len(idx),'origins_rejected_for_gaps':int((~valid).sum())}
            for name,v in [('signed_endpoint_bps',ep),('absolute_endpoint_bps',np.abs(ep)),('future_up_excursion_bps',up),('future_down_excursion_bps',down)]:
                for p in [.1,.5,.9,.99]:row[f'{name}_p{int(p*100)}']=float(np.quantile(v,p)) if len(v) else None
            rows.append(row)
            if len(ii):
                arrs[h].append(np.column_stack([ep,up,down]))
                for fee in [x for x in hs if x['asset_class']==cls]:
                    k=fee['exact_long_fee_breakeven_bps']
                    comparisons.append({'population':pop+'; conditional fee-only scenario, pair fee eligibility unverified','asset_class':cls,'symbol':sym,'horizon_min':h,'n_origins':len(ii),'rung':fee['rung'],'execution':fee['execution'],'hurdle_bps':k,'fraction_signed_endpoint_above_hurdle':float((ep>k).mean()),'fraction_future_up_excursion_above_hurdle':float((up>k).mean())})
    pd.DataFrame(rows).to_csv(O/f'q3_tape_instruments_{suffix}.csv',index=False)
    pd.DataFrame(comparisons).to_csv(O/f'q3_conditional_fee_clearance_{suffix}.csv',index=False)
    for h,ls in arrs.items():
        if not ls:continue
        a=np.concatenate(ls);f1=[x for x in hs if x['asset_class']==cls and x['rung']==1]
        out={'asset_class':cls,'population':'bar-origin weighted, continuous sequences only, overlapping, fee-only scenarios','horizon_min':h,'n_origins':len(a),'n_symbols':len(ls),'absolute_endpoint_bps_p50':float(np.median(np.abs(a[:,0]))),'absolute_endpoint_bps_p90':float(np.quantile(np.abs(a[:,0]),.9)),'up_excursion_bps_p50':float(np.median(a[:,1])),'up_excursion_bps_p90':float(np.quantile(a[:,1],.9)),'current_rung_scenarios':{f['execution']:{'hurdle_bps':f['exact_long_fee_breakeven_bps'],'fraction_endpoint_above':float((a[:,0]>f['exact_long_fee_breakeven_bps']).mean()),'fraction_up_excursion_above':float((a[:,1]>f['exact_long_fee_breakeven_bps']).mean())} for f in f1}}
        summary.append(out)
    quality.append(qual);print(json.dumps(qual),flush=True)
    del d,arrs;gc.collect()
(O/'q3_quality.json').write_text(json.dumps(quality,indent=2),encoding='utf-8')
(O/'q3_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print('Q3 complete',flush=True)
