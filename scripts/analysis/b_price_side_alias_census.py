# B-PRICE-SIDE-BY-JOB r5 — Langston condition 6 (2026-09-11): coin/xStock symbols that share one cache key.
# argv[1] = Kraken public AssetPairs JSON; argv[2] = xstock_spot_universe symbols, one per line.
# Result 2026-09-11 19:54:58Z: 666 /USD wsnames x 498 universe symbols = 17, identical to Langston's census; control DASH/USD.
import json, sys
pairs = json.load(open(sys.argv[1], encoding='utf-8'))['result']
ws = set()
for k, v in pairs.items():
    w = v.get('wsname') or ''
    if w.endswith('/USD'):
        ws.add(w)
translate = {'XBT': 'BTC', 'XDG': 'DOGE'}
ws_internal = set(translate.get(w.split('/')[0], w.split('/')[0]) + '/USD' for w in ws)
uni_raw = [x.strip() for x in open(sys.argv[2], encoding='utf-8') if x.strip()]
uni = set(uni_raw)
print('kraken AssetPairs', len(pairs), '| distinct wsnames ending /USD', len(ws))
print('xstock_spot_universe rows', len(uni_raw), '| distinct symbols', len(uni), '| sample', sorted(uni)[:4])
inter = sorted(ws & uni)
inter_internal = sorted(ws_internal & uni)
print('INTERSECTION on the exact wsname key:', len(inter), inter)
print('INTERSECTION after the XBT/XDG internal translation:', len(inter_internal), 'extra:', sorted(set(inter_internal) - set(inter)))
print('CONTROL: DASH/USD in Kraken wsnames', 'DASH/USD' in ws, '| in the xStock universe', 'DASH/USD' in uni)
