from pathlib import Path
import pandas as pd,json
R=Path('C:/DawnTrader-Codex-Data');O=Path(__file__).parent
d=pd.read_csv(R/'trades_closed.csv')
for c in ['opened_at','closed_at']:d[c]=pd.to_datetime(d[c],format='mixed',utc=True)
keys=['mode','trade_mode','strategy_name','asset_class','close_reason']
g=d.groupby(keys,dropna=False).agg(n=('id','size'),open_min=('opened_at','min'),open_max=('opened_at','max'),close_min=('closed_at','min'),close_max=('closed_at','max'),missing_close=('closed_at',lambda x:int(x.isna().sum()))).reset_index()
g.insert(0,'population','supplied paper/TARGET table records; inventory only; deploy strata unknown; not a survival risk set')
g.to_csv(O/'q2_strata_inventory.csv',index=False)
special=d[d.close_reason.isna()|d.close_reason.eq('max_holding_period')]
special[['id',*keys,'symbol','opened_at','closed_at','actual_entry_price','actual_exit_price']].to_csv(O/'q2_special_records.csv',index=False)
summary={'n_records':len(d),'n_closed_timestamp':int(d.closed_at.notna().sum()),'n_missing_close':int(d.closed_at.isna().sum()),'n_never_filled':int(d.close_reason.eq('never_filled').sum()),'n_negative_open_close_interval':int((d.closed_at<d.opened_at).sum()),'n_max_holding_period':int(d.close_reason.eq('max_holding_period').sum()),'n_strata_inventory':len(g),'max_hold_records':special[special.close_reason.eq('max_holding_period')][['id','symbol','opened_at','closed_at']].astype(str).to_dict('records'),'strategy_counts_inventory':d.strategy_name.value_counts().to_dict()}
c=pd.read_csv(R/'code_changes_exit_path.csv');c.insert(0,'population','exported commit-touch records; not deploy boundaries');c.to_csv(O/'q2_commit_inventory.csv',index=False)
summary['exit_change_rows']=len(c);summary['exit_change_unique_commits']=c.commit_sha.nunique()
(O/'q2_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8');print(json.dumps(summary,indent=2))
