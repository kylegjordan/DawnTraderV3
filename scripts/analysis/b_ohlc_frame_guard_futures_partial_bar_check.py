"""
B-OHLC-FRAME-GUARD (#1028) / #1030 -- does a stored futures 1-minute bar equal the venue's FINAL candle?

WHY: kraken-futures-archiver.ts pollOhlcOnce skips any candle at or before a per-symbol high-water
mark (`candle.time <= lastSeen`) and the venue's charts endpoint returns the minute still in
progress. If both hold, each minute is stored as it stood when first polled and never read again
until a restart empties the in-memory mark. This script measures that on the stored rows.

RUN (staging, as deploy, repo root):
    set -a && . ./.env && set +a && python3 scripts/analysis/b_ohlc_frame_guard_futures_partial_bar_check.py

OBJECT:     crypto_perp_ohlc_1m and xstock_perp_ohlc_1m rows vs GET futures.kraken.com/api/charts/v1/trade/<sym>/1m
POPULATION: minutes in [max(process start + 5 min, now - 120 min), now - 3 min) -- after the PM2 start, so the
            boot re-fetch cannot have healed them; the newest 3 minutes excluded as possibly in progress.
            Three symbols per table, chosen by row count in the window (ties broken by Postgres order --
            NOT the most active).
CONTROL:    `open` is fixed by a minute's first trade, so a partial and a final bar share it. `open`
            matching on every joined minute proves the join and the numeric parse; a volume shortfall
            with `open` matching is a truncated minute, not a mis-join.
PASS (OBJ-8, post-deploy, window wholly after the deploy): zero rows with stored volume short of the
            venue, `open` still matching.
BASELINE (2026-09-11 05:47->07:44Z, 116 min): volume short in 14/24/2 minutes on PF_TRXUSD/PF_ONDOUSD/
            PF_FLOKIUSD and 1/1/1 on PF_HOODXUSD/PF_TSLAXUSD/PF_SPYXUSD; open matched 116/116 on all six.
READ-ONLY: SELECTs and one public GET per symbol.
"""
import json, subprocess, sys, time, urllib.request, os
from decimal import Decimal

DB = os.environ['DATABASE_URL']


def q(sql):
    out = subprocess.run(['psql', DB, '-At', '-F', '|', '-c', sql], capture_output=True, text=True)
    if out.returncode != 0:
        print('PSQL_ERR', out.stderr[:300]); sys.exit(1)
    return [l.split('|') for l in out.stdout.strip().splitlines() if l]


pj = json.loads(subprocess.run(['pm2', 'jlist'], capture_output=True, text=True).stdout)
app = [p for p in pj if p['name'] == 'dawntrader'][0]
up_ms = int(app['pm2_env']['pm_uptime'])
now_ms = int(time.time() * 1000)
lo = max(up_ms + 5 * 60000, now_ms - 120 * 60000)
hi = (now_ms // 60000) * 60000 - 3 * 60000
print('pm2_uptime_utc', time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(up_ms / 1000)),
      'window_utc', time.strftime('%H:%M', time.gmtime(lo / 1000)), '->', time.strftime('%H:%M', time.gmtime(hi / 1000)))

for table in ('crypto_perp_ohlc_1m', 'xstock_perp_ohlc_1m'):
    syms = q("select symbol, count(*) from %s where interval_begin >= to_timestamp(%d/1000.0) and interval_begin < to_timestamp(%d/1000.0) group by symbol order by 2 desc limit 3" % (table, lo, hi))
    print('TABLE', table, 'top symbols by rows in window:', syms)
    for sym, _ in syms:
        rows = q("select (extract(epoch from interval_begin)*1000)::bigint, open, high, low, close, volume from %s where symbol='%s' and interval_begin >= to_timestamp(%d/1000.0) and interval_begin < to_timestamp(%d/1000.0)" % (table, sym, lo, hi))
        db = {int(r[0]): r[1:] for r in rows}
        with urllib.request.urlopen('https://futures.kraken.com/api/charts/v1/trade/%s/1m' % sym, timeout=20) as resp:
            candles = json.load(resp).get('candles') or []
        venue = {int(c['time']): c for c in candles if lo <= int(c['time']) < hi}
        keys = sorted(set(db) & set(venue))
        m = dict(open=0, high=0, low=0, close=0, volume=0)
        vol_lt = hi_lt = lo_gt = 0
        for k in keys:
            d = db[k]; v = venue[k]
            dv = dict(open=Decimal(d[0]), high=Decimal(d[1]), low=Decimal(d[2]), close=Decimal(d[3]), volume=Decimal(d[4]))
            vv = dict(open=Decimal(v['open']), high=Decimal(v['high']), low=Decimal(v['low']), close=Decimal(v['close']), volume=Decimal(v.get('volume', '0')))
            for f in m:
                if dv[f] == vv[f]:
                    m[f] += 1
            if dv['volume'] < vv['volume']: vol_lt += 1
            if dv['high'] < vv['high']: hi_lt += 1
            if dv['low'] > vv['low']: lo_gt += 1
        print('  %s: joined=%d db_only=%d venue_only=%d | EXACT MATCH open=%d high=%d low=%d close=%d volume=%d | stored_vol<venue=%d stored_high<venue=%d stored_low>venue=%d'
              % (sym, len(keys), len(set(db) - set(venue)), len(set(venue) - set(db)), m['open'], m['high'], m['low'], m['close'], m['volume'], vol_lt, hi_lt, lo_gt))
