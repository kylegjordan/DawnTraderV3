#!/usr/bin/env python3
"""B65.6 Option C test: rewrite Path B as a combined-filter rule.

Test: |DBS| >= 0.30 AND momentum > X AND RSI > Y AND price > MA_20

Goal: see what gets blocked on hostile days (intent: block losers) and on clean days
(cost: should NOT preferentially block winners).

Data sources:
  - Hostile-day trades + OHLC variables: from /tmp/b656_t2s2.py output (380 L / 57 W)
  - Clean-day trades + OHLC variables: from /tmp/b656_t2s3.py output (71 L / 206 W)

For combined rule, we need momentum at entry too. Computing from OHLC closes in the
pull (rate-of-change over last N candles).
"""
import json, glob, urllib.request, time, os, bisect
from collections import defaultdict
from datetime import datetime, timezone

VTS_DIR = "/home/deploy/dawntrader/logs/virtual_trades"
HOSTILE_DAYS = ["2026-03-26", "2026-04-02", "2026-04-12", "2026-04-18", "2026-04-22"]
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
        req = urllib.request.Request(url, headers={"User-Agent": "b656-optC/1.0"})
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

def momentum_pct(closes, period=30):
    """Price change over last N periods, as a fraction (matches classifier 'mom')."""
    if len(closes) < period+1: return None
    return (closes[-1] - closes[-period-1]) / closes[-period-1]

def vol_trend(volumes, period=20):
    if len(volumes) < period: return None
    half = period//2
    recent = sum(volumes[-half:])/half
    earlier = sum(volumes[-period:-half])/half
    if earlier == 0: return None
    return recent/earlier

def load_and_enrich(target_days):
    trades=[]; seen=set()
    for f in sorted(glob.glob(f"{VTS_DIR}/2026-*.json")):
        try:
            if os.path.getsize(f) < 10000: continue
            for t in json.load(open(f)):
                if t.get("status") != "closed": continue
                if t.get("id") in seen: continue
                d = fmt_day(t.get("entryTime", 0))
                if d not in target_days: continue
                seen.add(t.get("id")); t["_d"] = d; trades.append(t)
        except Exception: continue
    print(f"  Loaded {len(trades)} trades", flush=True)
    cache={}; success=0
    for i, t in enumerate(trades):
        sym = t.get("signal", {}).get("symbol") or t.get("symbol")
        bsym = kraken_to_binance(sym)
        if not bsym: continue
        et = t.get("entryTime", 0)
        end_ms = (et // 60000) * 60000
        ck = (bsym, end_ms)
        if ck in cache:
            klines = cache[ck]
        else:
            klines = fetch_klines(bsym, end_ms, 90)
            cache[ck] = klines
            time.sleep(0.05)
        if not klines or len(klines) < 35: continue
        closes = [float(k[4]) for k in klines]
        highs  = [float(k[2]) for k in klines]
        vols   = [float(k[5]) for k in klines]
        cc = closes[-1]
        t["_rsi14"] = compute_rsi(closes, 14)
        t["_ma_dist"] = ma_dist(closes, cc, 20)
        t["_mom"] = momentum_pct(closes, 30)
        t["_vol_trend"] = vol_trend(vols, 20)
        success += 1
        if i % 100 == 0 and i > 0:
            print(f"    {i}/{len(trades)} (success={success})", flush=True)
    return [t for t in trades if t.get("_rsi14") is not None]

print("Loading HOSTILE-day cohort + computing variables...", flush=True)
hostile = load_and_enrich(HOSTILE_DAYS)
print(f"Hostile cohort with full variables: {len(hostile)}", flush=True)
print("Loading CLEAN-day cohort + computing variables...", flush=True)
clean = load_and_enrich(CLEAN_DAYS)
print(f"Clean cohort with full variables: {len(clean)}", flush=True)

# Apply combined rule: |DBS| >= 0.30 implicit (we already filtered to TFS-Path-B candidates upstream — but here all trades, just test the OHLC-side rule)
# Note: for this test we apply rule to ALL trades since DBS is already a precondition for many of them anyway
def apply_rule(t, mom_thresh, rsi_thresh, ma_thresh):
    """Returns True if trade passes the rule (would be allowed)."""
    if t.get("_mom") is None: return None  # missing data
    if t.get("_rsi14") is None: return None
    if t.get("_ma_dist") is None: return None
    if t["_mom"] < mom_thresh: return False
    if t["_rsi14"] < rsi_thresh: return False
    if t["_ma_dist"] < ma_thresh: return False
    return True

def evaluate_rule(label, mom_thresh, rsi_thresh, ma_thresh):
    h_blocked_l=0; h_blocked_w=0; h_kept_l=0; h_kept_w=0
    c_blocked_l=0; c_blocked_w=0; c_kept_l=0; c_kept_w=0
    for t in hostile:
        passed = apply_rule(t, mom_thresh, rsi_thresh, ma_thresh)
        if passed is None: continue
        if is_win(t):
            if passed: h_kept_w += 1
            else:      h_blocked_w += 1
        else:
            if passed: h_kept_l += 1
            else:      h_blocked_l += 1
    for t in clean:
        passed = apply_rule(t, mom_thresh, rsi_thresh, ma_thresh)
        if passed is None: continue
        if is_win(t):
            if passed: c_kept_w += 1
            else:      c_blocked_w += 1
        else:
            if passed: c_kept_l += 1
            else:      c_blocked_l += 1
    h_total_l = h_blocked_l + h_kept_l
    h_total_w = h_blocked_w + h_kept_w
    c_total_l = c_blocked_l + c_kept_l
    c_total_w = c_blocked_w + c_kept_w
    h_kept_wr = h_kept_w / max(h_kept_w + h_kept_l, 1) * 100
    c_kept_wr = c_kept_w / max(c_kept_w + c_kept_l, 1) * 100
    h_baseline_wr = h_total_w / max(h_total_w + h_total_l, 1) * 100
    c_baseline_wr = c_total_w / max(c_total_w + c_total_l, 1) * 100
    print(f"\n--- {label} ---")
    print(f"  Rule: |DBS|>=0.30 AND mom>{mom_thresh} AND RSI>{rsi_thresh} AND price-MA distance>{ma_thresh}%")
    print(f"  HOSTILE: blocked {h_blocked_l}/{h_total_l} losers ({h_blocked_l/max(h_total_l,1)*100:.1f}%) | blocked {h_blocked_w}/{h_total_w} winners ({h_blocked_w/max(h_total_w,1)*100:.1f}%)")
    print(f"           kept-cohort WR: {h_kept_wr:.1f}% (baseline {h_baseline_wr:.1f}%, change {h_kept_wr-h_baseline_wr:+.1f}pp)")
    print(f"  CLEAN:   blocked {c_blocked_l}/{c_total_l} losers ({c_blocked_l/max(c_total_l,1)*100:.1f}%) | blocked {c_blocked_w}/{c_total_w} winners ({c_blocked_w/max(c_total_w,1)*100:.1f}%)")
    print(f"           kept-cohort WR: {c_kept_wr:.1f}% (baseline {c_baseline_wr:.1f}%, change {c_kept_wr-c_baseline_wr:+.1f}pp)")

print()
print("=" * 88)
print("OPTION C COMBINED-RULE EVALUATION: blocks both losers and winners")
print("Goal: rule that blocks more LOSERS on hostile days AND fewer WINNERS on clean days")
print("=" * 88)

# Sweep through threshold combinations
# mom: 0 (just non-negative), 0.001, 0.003
# RSI: 40 (very loose), 50, 55, 60
# MA dist: -0.5 (loose, allow some below MA), 0 (must be at/above MA), 0.1 (slightly above)

evaluate_rule("LOOSE: mom>0, RSI>40, price>MA-0.5%",         0.000, 40, -0.5)
evaluate_rule("LOOSE+: mom>0, RSI>50, price>MA-0.5%",        0.000, 50, -0.5)
evaluate_rule("MEDIUM: mom>0, RSI>50, price>=MA",            0.000, 50,  0.0)
evaluate_rule("MEDIUM+: mom>0.001, RSI>50, price>=MA",       0.001, 50,  0.0)
evaluate_rule("STRICT: mom>0.001, RSI>55, price>=MA",        0.001, 55,  0.0)
evaluate_rule("STRICT+: mom>0.003, RSI>55, price>MA+0.1%",   0.003, 55,  0.1)
evaluate_rule("VERY STRICT: mom>0.003, RSI>60, price>MA+0.1%", 0.003, 60, 0.1)

print()
print("=" * 88)
print("INTERPRETATION GUIDE")
print("=" * 88)
print("""
  KEY METRICS:
   - Hostile losers blocked: more = better (preferentially excluding bad trades on bad days)
   - Hostile winners blocked: fewer = better (don't kill the few winners that did exist)
   - Clean losers blocked: incidental benefit
   - Clean winners blocked: COST - this is healthy trades being killed

  Rule of thumb: a useful rule blocks > 50% of hostile losers while blocking < 30% of clean winners.
  If the rule blocks > 50% of clean winners, it's killing too many good trades on normal days.
""")
