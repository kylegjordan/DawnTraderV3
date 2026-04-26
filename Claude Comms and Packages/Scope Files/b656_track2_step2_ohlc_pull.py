#!/usr/bin/env python3
"""B65.6 Phase A Track 2 Step 2 - pull Binance 1-min OHLC for hostile-day trades + compute RSI/MA/swing-high.

Scope: 5 hostile days (04-22 post-B62 + 4 pre-B62: 03-26, 04-02, 04-12, 04-18).
For each TFS-Path-B trade on these days, pull 90 minutes of 1-min OHLC ending at entry time.
Compute RSI(14), distance from MA(20), distance from N-period high, volume trend.
Test discrimination on winners vs losers.

Symbol mapping: Kraken pair "BTC/USD" -> Binance "BTCUSDT" (USDT fallback for fiat).
Pairs without a Binance equivalent are skipped.
"""
import json, glob, urllib.request, urllib.parse, time, os
from collections import defaultdict
from datetime import datetime, timezone

VTS_DIR = "/home/deploy/dawntrader/logs/virtual_trades"
HOSTILE_DAYS = ["2026-03-26", "2026-04-02", "2026-04-12", "2026-04-18", "2026-04-22"]
POST_B62_CUTOFF_MS = 1776643200000

def fmt_day(ms): return datetime.fromtimestamp(ms/1000, tz=timezone.utc).strftime("%Y-%m-%d")
def is_win(t): return (t.get("netProfit") or 0) > 0

def kraken_to_binance(sym):
    """Map Kraken pair symbol to Binance symbol."""
    if "/" not in sym: return None
    base, quote = sym.split("/", 1)
    base = base.upper(); quote = quote.upper()
    # Special cases
    if base == "XBT": base = "BTC"
    # Quote remap
    if quote in ("USD", "EUR"): quote = "USDT"  # use USDT as proxy
    if quote == "USDC": quote = "USDC"
    elif quote == "USDT": quote = "USDT"
    else:
        return None  # unknown quote
    return f"{base}{quote}"

def fetch_binance_klines(symbol, end_ms, lookback_min=90):
    """Pull 1-min klines ending at end_ms, with lookback_min minutes of history."""
    start_ms = end_ms - lookback_min * 60 * 1000
    url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval=1m&startTime={start_ms}&endTime={end_ms}&limit={lookback_min+5}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "b656-analysis/1.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
        if not isinstance(data, list): return None
        return data
    except Exception as e:
        return None

def compute_rsi(closes, period=14):
    if len(closes) < period + 1: return None
    gains = []; losses = []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i-1]
        if diff > 0: gains.append(diff); losses.append(0)
        else: gains.append(0); losses.append(-diff)
    avg_gain = sum(gains[:period])/period
    avg_loss = sum(losses[:period])/period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain*(period-1) + gains[i])/period
        avg_loss = (avg_loss*(period-1) + losses[i])/period
    if avg_loss == 0: return 100
    rs = avg_gain/avg_loss
    return 100 - (100/(1+rs))

def compute_ma_distance_pct(closes, current, period=20):
    if len(closes) < period: return None
    ma = sum(closes[-period:])/period
    return (current - ma) / ma * 100

def compute_swing_high_distance_pct(highs, current, period=60):
    if len(highs) < period: return None
    swing_high = max(highs[-period:])
    return (current - swing_high) / swing_high * 100  # negative if below

def compute_volume_trend(volumes, period=20):
    """Ratio of recent (last period//2) volume mean to earlier (first period//2) volume mean."""
    if len(volumes) < period: return None
    half = period // 2
    recent = sum(volumes[-half:]) / half
    earlier = sum(volumes[-period:-half]) / half
    if earlier == 0: return None
    return recent / earlier

# Load hostile-day trades
print("Loading hostile-day trades...", flush=True)
trades = []; seen = set()
for f in sorted(glob.glob(f"{VTS_DIR}/2026-*.json")):
    try:
        if os.path.getsize(f) < 10000: continue
        for t in json.load(open(f)):
            if t.get("status") != "closed": continue
            if t.get("id") in seen: continue
            d = fmt_day(t.get("entryTime", 0))
            if d not in HOSTILE_DAYS: continue
            seen.add(t.get("id")); t["_d"] = d; trades.append(t)
    except Exception: continue

print(f"Loaded {len(trades)} trades on hostile days", flush=True)

# For each trade, pull OHLC and compute variables
fail_count = 0; success_count = 0; missing_pairs = set()
ohlc_cache = {}  # (binance_symbol, end_min_bucket) -> klines list, to dedupe pulls

print("Pulling OHLC and computing variables (this may take a few minutes)...", flush=True)
for i, t in enumerate(trades):
    sym_kraken = t.get("signal", {}).get("symbol") or t.get("symbol")
    sym_binance = kraken_to_binance(sym_kraken)
    if not sym_binance:
        missing_pairs.add(sym_kraken); fail_count += 1; continue
    et = t.get("entryTime", 0)
    # Bucket entry times to 1-min granularity for cache hits
    end_ms = (et // 60000) * 60000
    cache_key = (sym_binance, end_ms)
    if cache_key in ohlc_cache:
        klines = ohlc_cache[cache_key]
    else:
        klines = fetch_binance_klines(sym_binance, end_ms, lookback_min=90)
        ohlc_cache[cache_key] = klines
        time.sleep(0.05)  # rate limit safety

    if not klines or len(klines) < 30:
        fail_count += 1; continue

    closes = [float(k[4]) for k in klines]
    highs = [float(k[2]) for k in klines]
    volumes = [float(k[5]) for k in klines]
    current_close = closes[-1]

    t["_rsi14"] = compute_rsi(closes, 14)
    t["_ma_dist"] = compute_ma_distance_pct(closes, current_close, 20)
    t["_swing_dist"] = compute_swing_high_distance_pct(highs, current_close, 60)
    t["_vol_trend"] = compute_volume_trend(volumes, 20)
    success_count += 1

    if i % 50 == 0 and i > 0:
        print(f"  {i}/{len(trades)} processed (success={success_count}, fail={fail_count}, cache={len(ohlc_cache)})", flush=True)

print(f"\nDONE: success={success_count} fail={fail_count} cache_size={len(ohlc_cache)}")
print(f"Pairs with no Binance mapping (skipped): {len(missing_pairs)}")
print(f"  Sample missing: {sorted(list(missing_pairs))[:15]}")

# Build cohorts: TFS Path-B trades (need to look up classifier inputs from telemetry) - but for hostile-day cross-validation, just look at WIN vs LOSE per day
print()
print("=" * 78)
print("OHLC-DERIVED VARIABLE DISCRIMINATION TEST")
print("=" * 78)

def quantile(xs, q):
    xs = sorted([v for v in xs if v is not None])
    if not xs: return None
    return xs[int(q*(len(xs)-1))]
def describe(label, vals, fmt="{:>+8.2f}"):
    vals = [v for v in vals if v is not None]
    if not vals: print(f"  {label}: empty"); return
    p10 = quantile(vals,0.10); p25 = quantile(vals,0.25); p50 = quantile(vals,0.50)
    p75 = quantile(vals,0.75); p90 = quantile(vals,0.90)
    mean = sum(vals)/len(vals)
    cells = [fmt.format(x) for x in [mean,p10,p25,p50,p75,p90]]
    print(f"  {label}: n={len(vals):>3} mean={cells[0]} p10={cells[1]} p25={cells[2]} p50={cells[3]} p75={cells[4]} p90={cells[5]}")

# Per-day winner vs loser distribution for each variable
have_data = [t for t in trades if t.get("_rsi14") is not None]
print(f"\nTrades with OHLC data: {len(have_data)}")
print()

# 04-22 specifically: TFS-tagged losing trades (the ones we want to gate)
hostile_losers = [t for t in have_data if not is_win(t)]
hostile_winners = [t for t in have_data if is_win(t)]
print(f"Across all hostile days: losers={len(hostile_losers)} winners={len(hostile_winners)}")
print()

for var_label, var_key, fmt in [
    ("RSI (14-period) — overbought >70", "_rsi14", "{:>8.1f}"),
    ("Price distance from MA(20) %",  "_ma_dist", "{:>+8.2f}"),
    ("Distance from 60-period swing high %", "_swing_dist", "{:>+8.2f}"),
    ("Volume trend (recent/earlier)", "_vol_trend", "{:>8.3f}"),
]:
    print(f"--- {var_label} ---")
    for label, cohort in [
        ("All hostile losers     ", hostile_losers),
        ("All hostile winners    ", hostile_winners),
    ]:
        describe(label, [t.get(var_key) for t in cohort], fmt=fmt)
    # Per-day breakdown for context
    print(f"  Per hostile day:")
    for d in HOSTILE_DAYS:
        day_losers = [t for t in have_data if t["_d"] == d and not is_win(t)]
        day_winners = [t for t in have_data if t["_d"] == d and is_win(t)]
        if day_losers and day_winners:
            describe(f"  {d} losers ", [t.get(var_key) for t in day_losers], fmt=fmt)
            describe(f"  {d} winners", [t.get(var_key) for t in day_winners], fmt=fmt)
    print()

# Discrimination test: for each variable, sweep thresholds and see if losers cluster
print("=" * 78)
print("DISCRIMINATION TEST: thresholds that exclude losers preferentially")
print("=" * 78)

def discrim_test(label, lose_vals, win_vals, direction):
    lose_vals = [v for v in lose_vals if v is not None]
    win_vals = [v for v in win_vals if v is not None]
    if not lose_vals or not win_vals: print(f"  {label}: insufficient"); return
    all_vals = sorted(set(lose_vals + win_vals))
    print(f"  {label}: L={len(lose_vals)} W={len(win_vals)}")
    print(f"    {'Threshold':<14} {'L excl':>7} {'W preserved':>13} {'L%':>6} {'W%':>6}")
    for q in [0.20, 0.40, 0.50, 0.60, 0.80]:
        thresh = quantile(all_vals, q)
        if thresh is None: continue
        if direction == "above":
            l_ex = sum(1 for v in lose_vals if v > thresh)
            w_pr = sum(1 for v in win_vals if v <= thresh)
            cmp = ">"
        else:
            l_ex = sum(1 for v in lose_vals if v < thresh)
            w_pr = sum(1 for v in win_vals if v >= thresh)
            cmp = "<"
        l_pct = l_ex/len(lose_vals)*100; w_pct = w_pr/len(win_vals)*100
        print(f"    {cmp}={thresh:>+10.3f}  {l_ex:>7} {w_pr:>13} {l_pct:>5.1f}% {w_pct:>5.1f}%")

print("\n--- RSI > threshold (exclude overbought) ---")
discrim_test("RSI ABOVE", [t.get("_rsi14") for t in hostile_losers], [t.get("_rsi14") for t in hostile_winners], "above")
print("\n--- MA distance > threshold (exclude stretched-above-MA) ---")
discrim_test("MA dist ABOVE", [t.get("_ma_dist") for t in hostile_losers], [t.get("_ma_dist") for t in hostile_winners], "above")
print("\n--- Swing-high distance > threshold (exclude near-swing-high) ---")
discrim_test("SwingHi dist ABOVE", [t.get("_swing_dist") for t in hostile_losers], [t.get("_swing_dist") for t in hostile_winners], "above")
print("\n--- Volume trend < threshold (exclude declining volume = exhaustion) ---")
discrim_test("Vol trend BELOW", [t.get("_vol_trend") for t in hostile_losers], [t.get("_vol_trend") for t in hostile_winners], "below")
