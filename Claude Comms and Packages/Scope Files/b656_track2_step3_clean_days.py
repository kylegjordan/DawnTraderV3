#!/usr/bin/env python3
"""B65.6 Phase A Track 2 Step 3 - falsification test on CLEAN days.

If winners-have-momentum is hostile-day-SPECIFIC, the per-pair signal IS a hostile-day discriminator.
If winners-have-momentum holds on CLEAN days too, the signal is just "winners always have more momentum"
and isn't useful as a hostile-day-specific discriminator.

5 strong clean days picked from historical scan:
  2026-04-01 (WR 82.8%, n=99)
  2026-04-13 (WR 73.4%, n=64)
  2026-04-20 (WR 69.0%, n=58)
  2026-04-16 (WR 66.3%, n=98)
  2026-04-21 (WR 59.0%, n=61)

Same OHLC pull + same 4 variables (RSI / MA dist / swing-high dist / vol trend).
"""
import json, glob, urllib.request, time, os
from collections import defaultdict
from datetime import datetime, timezone

VTS_DIR = "/home/deploy/dawntrader/logs/virtual_trades"
CLEAN_DAYS = ["2026-04-01", "2026-04-13", "2026-04-16", "2026-04-20", "2026-04-21"]

def fmt_day(ms): return datetime.fromtimestamp(ms/1000, tz=timezone.utc).strftime("%Y-%m-%d")
def is_win(t): return (t.get("netProfit") or 0) > 0

def kraken_to_binance(sym):
    if "/" not in sym: return None
    base, quote = sym.split("/", 1)
    base = base.upper(); quote = quote.upper()
    if base == "XBT": base = "BTC"
    if quote in ("USD", "EUR"): quote = "USDT"
    elif quote in ("USDC","USDT"): pass
    else: return None
    return f"{base}{quote}"

def fetch_klines(symbol, end_ms, lookback_min=90):
    start_ms = end_ms - lookback_min * 60 * 1000
    url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval=1m&startTime={start_ms}&endTime={end_ms}&limit={lookback_min+5}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "b656-clean/1.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode())
    except Exception: return None

def compute_rsi(closes, period=14):
    if len(closes) < period+1: return None
    gains=[]; losses=[]
    for i in range(1, len(closes)):
        d = closes[i] - closes[i-1]
        if d > 0: gains.append(d); losses.append(0)
        else: gains.append(0); losses.append(-d)
    ag = sum(gains[:period])/period; al = sum(losses[:period])/period
    for i in range(period, len(gains)):
        ag = (ag*(period-1) + gains[i])/period
        al = (al*(period-1) + losses[i])/period
    if al == 0: return 100
    return 100 - (100/(1 + ag/al))

def ma_dist(closes, current, period=20):
    if len(closes) < period: return None
    ma = sum(closes[-period:])/period
    return (current - ma)/ma * 100

def swing_dist(highs, current, period=60):
    if len(highs) < period: return None
    sh = max(highs[-period:])
    return (current - sh)/sh * 100

def vol_trend(volumes, period=20):
    if len(volumes) < period: return None
    half = period//2
    recent = sum(volumes[-half:])/half
    earlier = sum(volumes[-period:-half])/half
    if earlier == 0: return None
    return recent/earlier

print("Loading clean-day trades...", flush=True)
trades=[]; seen=set()
for f in sorted(glob.glob(f"{VTS_DIR}/2026-*.json")):
    try:
        if os.path.getsize(f) < 10000: continue
        for t in json.load(open(f)):
            if t.get("status") != "closed": continue
            if t.get("id") in seen: continue
            d = fmt_day(t.get("entryTime", 0))
            if d not in CLEAN_DAYS: continue
            seen.add(t.get("id")); t["_d"] = d; trades.append(t)
    except Exception: continue
print(f"Loaded {len(trades)} clean-day trades", flush=True)

ohlc_cache={}; success=0; fail=0; missing=set()
print("Pulling OHLC...", flush=True)
for i, t in enumerate(trades):
    sym = t.get("signal", {}).get("symbol") or t.get("symbol")
    bsym = kraken_to_binance(sym)
    if not bsym: missing.add(sym); fail += 1; continue
    et = t.get("entryTime", 0)
    end_ms = (et // 60000) * 60000
    ck = (bsym, end_ms)
    if ck in ohlc_cache:
        klines = ohlc_cache[ck]
    else:
        klines = fetch_klines(bsym, end_ms, 90)
        ohlc_cache[ck] = klines
        time.sleep(0.05)
    if not klines or len(klines) < 30: fail += 1; continue
    closes = [float(k[4]) for k in klines]
    highs  = [float(k[2]) for k in klines]
    vols   = [float(k[5]) for k in klines]
    cc = closes[-1]
    t["_rsi14"] = compute_rsi(closes, 14)
    t["_ma_dist"] = ma_dist(closes, cc, 20)
    t["_swing_dist"] = swing_dist(highs, cc, 60)
    t["_vol_trend"] = vol_trend(vols, 20)
    success += 1
    if i % 50 == 0 and i > 0:
        print(f"  {i}/{len(trades)} (success={success} fail={fail})", flush=True)

print(f"\nDONE: success={success} fail={fail} missing-pairs={len(missing)}", flush=True)

def quantile(xs, q):
    xs = sorted([v for v in xs if v is not None])
    if not xs: return None
    return xs[int(q*(len(xs)-1))]
def describe(label, vals, fmt="{:>+8.2f}"):
    vals = [v for v in vals if v is not None]
    if not vals: print(f"  {label}: empty"); return
    p10=quantile(vals,0.10); p25=quantile(vals,0.25); p50=quantile(vals,0.50)
    p75=quantile(vals,0.75); p90=quantile(vals,0.90)
    mean = sum(vals)/len(vals)
    cells = [fmt.format(x) for x in [mean,p10,p25,p50,p75,p90]]
    print(f"  {label}: n={len(vals):>3} mean={cells[0]} p10={cells[1]} p25={cells[2]} p50={cells[3]} p75={cells[4]} p90={cells[5]}")

have_data = [t for t in trades if t.get("_rsi14") is not None]
clean_winners = [t for t in have_data if is_win(t)]
clean_losers  = [t for t in have_data if not is_win(t)]
print(f"\nClean-day cohort: winners={len(clean_winners)} losers={len(clean_losers)}\n")

print("=" * 78)
print("FALSIFICATION: winners-have-momentum on CLEAN days?")
print("If signal holds on clean days too, it isn't hostile-specific")
print("=" * 78)

for var_label, var_key, fmt in [
    ("RSI(14)                              ", "_rsi14", "{:>8.1f}"),
    ("Price distance from MA(20) %         ", "_ma_dist", "{:>+8.2f}"),
    ("Distance from 60-period swing high % ", "_swing_dist", "{:>+8.2f}"),
    ("Volume trend (recent/earlier)        ", "_vol_trend", "{:>8.3f}"),
]:
    print(f"\n--- {var_label} ---")
    describe("Clean-day winners", [t.get(var_key) for t in clean_winners], fmt=fmt)
    describe("Clean-day losers ", [t.get(var_key) for t in clean_losers], fmt=fmt)
    # Per-day breakdown
    for d in CLEAN_DAYS:
        dw = [t for t in have_data if t["_d"] == d and is_win(t)]
        dl = [t for t in have_data if t["_d"] == d and not is_win(t)]
        if dw and dl:
            describe(f"  {d} W ", [t.get(var_key) for t in dw], fmt=fmt)
            describe(f"  {d} L ", [t.get(var_key) for t in dl], fmt=fmt)
