from pathlib import Path
import pandas as pd, json, hashlib
ROOT=Path('C:/DawnTrader-Codex-Data'); OUT=Path(__file__).parent
tr=pd.read_csv(ROOT/'trades_closed.csv')
profile={'trade_rows':len(tr),'columns':list(tr.columns),'axes':{},'null_counts':tr.isna().sum().to_dict()}
for c in ['mode','trade_mode','asset_class','exchange','close_reason','entry_price_producer','exit_price_producer','chosen_entry_mode','exit_fee_mode']:
    profile['axes'][c]=tr[c].fillna('<NULL>').value_counts().to_dict()
profile['trade_times']={c:{'min':tr[c].min(),'max':tr[c].max()} for c in ['opened_at','closed_at']}
profile['hashes']={}
for p in sorted(ROOT.iterdir()):
    if p.is_file():
        h=hashlib.sha256()
        with p.open('rb') as f:
            for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
        profile['hashes'][p.name]={'bytes':p.stat().st_size,'sha256':h.hexdigest()}
(OUT/'data_profile.json').write_text(json.dumps(profile,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in profile.items() if k not in ['hashes','columns','null_counts']},indent=2))
