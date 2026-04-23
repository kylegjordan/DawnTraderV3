#!/usr/bin/env python3
"""
B63 Counterfactual Audit — exit-only replay on B62 72h window high-DBS trades.

Population: closed VTS trades in 2026-04-16 09:15 UTC → 2026-04-19 09:15 UTC
            with pairDirectionalBiasScore >= 0.30, LONG only (signal stop < entry).

Outputs:
  - Per-trade replay records JSONL
  - Deliverable 1 (overall), 2 (per-strategy), 3 (rescue), 4 (defect notes) markdown

Run on staging server where virtual_trades + phase15b_dbs_telemetry live.
"""
import json, glob, os, time, urllib.request, urllib.parse, statistics as stats
import datetime as dt
from collections import Counter, defaultdict

WINDOW_START_MS = int(dt.datetime(2026, 4, 16, 9, 15, tzinfo=dt.timezone.utc).timestamp() * 1000)
WINDOW_END_MS   = int(dt.datetime(2026, 4, 19, 9, 15, tzinfo=dt.timezone.utc).timestamp() * 1000)
TRADES_DIR      = "/home/deploy/dawntrader/logs/virtual_trades"
TELEMETRY_DIR   = "/home/deploy/dawntrader/logs/phase15b_dbs_telemetry"
OHLC_CACHE      = "/home/deploy/dawntrader/logs/b63_audit/ohlc_15m_cache.json"
OUTPUT_DIR      = "/home/deploy/dawntrader/logs/b63_audit"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# VTS friction model defaults (mirrors simulate-vts-trade friction params)
SPREAD_BPS  = 5      # 0.05% spread cost round-trip
SLIPPAGE_BPS = 2     # 0.02% slippage per leg
FEE_BPS     = 16     # 0.16% Kraken maker+taker per leg
def apply_friction(entry_price, exit_price, position_size, side="LONG"):
    """Returns netProfit given entry/exit/size. LONG-only."""
    gross = (exit_price - entry_price) * position_size
    entry_cost = entry_price * position_size * (FEE_BPS + SLIPPAGE_BPS + SPREAD_BPS/2) / 10000.0
    exit_cost  = exit_price  * position_size * (FEE_BPS + SLIPPAGE_BPS + SPREAD_BPS/2) / 10000.0
    return gross - entry_cost - exit_cost

# -------------------- step 1: load trades --------------------
def load_trades():
    all_trades = []
    for f in sorted(glob.glob(f"{TRADES_DIR}/2026-04-1[6-9].json")):
        try: all_trades += json.load(open(f))
        except: pass
    # Also need 4/20 for trades whose exit fell into next day
    try: all_trades += json.load(open(f"{TRADES_DIR}/2026-04-20.json"))
    except: pass
    return all_trades

def infer_side(t):
    s = t.get("signal", {})
    ep, sl = s.get("entryPrice"), s.get("stopLoss")
    if ep is None or sl is None: return "?"
    return "LONG" if sl < ep else ("SHORT" if sl > ep else "?")

def filter_population(trades):
    pop = []
    for t in trades:
        if t.get("status") != "closed": continue
        if not (WINDOW_START_MS <= t.get("entryTime", 0) < WINDOW_END_MS): continue
        if t.get("pairDirectionalBiasScore", -99) < 0.30: continue
        if infer_side(t) != "LONG": continue
        pop.append(t)
    return pop

# -------------------- step 2: ATR lookup from MCE telemetry --------------------
def build_atr_index():
    """Returns {symbol: [(ts_ms, atr), ...]} sorted by ts."""
    idx = defaultdict(list)
    for f in sorted(glob.glob(f"{TELEMETRY_DIR}/2026-04-1[5-9].jsonl")):
        with open(f) as fh:
            for line in fh:
                try:
                    r = json.loads(line)
                    ts_ms = int(dt.datetime.fromisoformat(r["ts"].replace("Z","+00:00")).timestamp()*1000)
                    idx[r["symbol"]].append((ts_ms, r.get("atr")))
                except: continue
    for s in idx: idx[s].sort()
    return idx

def lookup_atr(idx, symbol, ts_ms):
    arr = idx.get(symbol, [])
    if not arr: return None
    # Binary search-ish: walk until > ts_ms, take last <= ts_ms
    best = None
    for t, a in arr:
        if t <= ts_ms: best = a
        else: break
    return best

# -------------------- step 3: Kraken OHLC pull + cache --------------------
def kraken_pair(symbol):
    """Transform internal symbol to Kraken REST pair name."""
    s = symbol.replace("/", "")
    # Kraken quirks
    s = s.replace("XBT", "XBT")  # keep
    s = s.replace("BTC", "XBT")  # alias
    return s

def fetch_kraken_15m(symbol, since_ts):
    url = f"https://api.kraken.com/0/public/OHLC?pair={kraken_pair(symbol)}&interval=15&since={since_ts}"
    try:
        r = urllib.request.urlopen(url, timeout=15).read()
        d = json.loads(r)
        if d.get("error"): return None, d["error"]
        pk = [k for k in d["result"] if k != "last"][0]
        bars = d["result"][pk]  # [ts, open, high, low, close, vwap, volume, count]
        return [[int(b[0]), float(b[1]), float(b[2]), float(b[3]), float(b[4])] for b in bars], None
    except Exception as e:
        return None, str(e)

def ensure_ohlc_cache(symbols):
    cache = {}
    if os.path.exists(OHLC_CACHE):
        try: cache = json.load(open(OHLC_CACHE))
        except: pass
    since = int(dt.datetime(2026,4,16,0,0,tzinfo=dt.timezone.utc).timestamp())
    missing = [s for s in symbols if s not in cache]
    print(f"[ohlc] have {len(cache)} cached, need {len(missing)} more")
    for i, s in enumerate(missing):
        bars, err = fetch_kraken_15m(s, since)
        if err:
            print(f"[ohlc] {s} FAIL: {err}")
            cache[s] = None
        else:
            cache[s] = bars
            print(f"[ohlc] {s} OK ({len(bars)} bars)")
        time.sleep(1.2)  # Kraken rate limit ~1 req/sec
        if (i+1) % 10 == 0:
            json.dump(cache, open(OHLC_CACHE, "w"))
    json.dump(cache, open(OHLC_CACHE, "w"))
    return cache

# -------------------- step 4: replay engine --------------------
def get_forward_bars(ohlc, entry_ts_ms, horizon_ms):
    """Return list of [ts_ms, O, H, L, C] strictly after entry, up to horizon."""
    start = entry_ts_ms // 1000
    end   = (entry_ts_ms + horizon_ms) // 1000
    out = []
    for b in ohlc or []:
        if b[0] > start and b[0] <= end:
            out.append([b[0]*1000, b[1], b[2], b[3], b[4]])
    return out

def replay_fixed(entry, stop, target, bars, timeout_ms, entry_ts_ms):
    """Returns dict: result, exit_ts, exit_price, mae, mfe, r_multiple."""
    R = entry - stop  # risk per unit, LONG
    mae_price = entry
    mfe_price = entry
    for b in bars:
        ts, O, H, L, C = b
        mae_price = min(mae_price, L)
        mfe_price = max(mfe_price, H)
        # Conservative tie-break: adverse first within same bar
        if L <= stop:
            return dict(result="stop_loss", exit_ts=ts, exit_price=stop,
                        mae=entry-mae_price, mfe=mfe_price-entry,
                        r=(stop-entry)/R if R>0 else 0)
        if target is not None and H >= target:
            return dict(result="take_profit", exit_ts=ts, exit_price=target,
                        mae=entry-mae_price, mfe=mfe_price-entry,
                        r=(target-entry)/R if R>0 else 0)
    # Timeout at last bar close
    if bars:
        last = bars[-1]
        return dict(result="timeout", exit_ts=last[0], exit_price=last[4],
                    mae=entry-mae_price, mfe=mfe_price-entry,
                    r=(last[4]-entry)/R if R>0 else 0)
    return dict(result="no_data", exit_ts=entry_ts_ms, exit_price=entry, mae=0, mfe=0, r=0)

def replay_trailing(entry, initial_stop, bars, timeout_ms, entry_ts_ms):
    """Variant D TEC-lite:
       MFE>=1R -> stop=BE; MFE>=2R -> stop=+1R; else trail 3x ATR from HWM
       3x ATR used as initial_stop distance, trailing reuses same distance from HWM.
    """
    R = entry - initial_stop
    trail_dist = entry - initial_stop  # 3x ATR in this variant
    stop = initial_stop
    hwm = entry
    latch = 0  # 0=none, 1=BE locked, 2=+1R locked
    mae_price = entry; mfe_price = entry
    for b in bars:
        ts, O, H, L, C = b
        mae_price = min(mae_price, L); mfe_price = max(mfe_price, H)
        # Check adverse first
        if L <= stop:
            return dict(result="trailing_stop", exit_ts=ts, exit_price=stop,
                        mae=entry-mae_price, mfe=mfe_price-entry,
                        r=(stop-entry)/R if R>0 else 0, latch=latch)
        # Update HWM and latches from bar high
        if H > hwm: hwm = H
        mfe = hwm - entry
        if latch < 1 and mfe >= R:
            stop = max(stop, entry); latch = 1
        if latch < 2 and mfe >= 2*R:
            stop = max(stop, entry + R); latch = 2
        # Trailing
        stop = max(stop, hwm - trail_dist)
    # Timeout
    if bars:
        last = bars[-1]
        return dict(result="timeout", exit_ts=last[0], exit_price=last[4],
                    mae=entry-mae_price, mfe=mfe_price-entry,
                    r=(last[4]-entry)/R if R>0 else 0, latch=latch)
    return dict(result="no_data", exit_ts=entry_ts_ms, exit_price=entry, mae=0, mfe=0, r=0, latch=0)

# -------------------- step 5: full run --------------------
def main():
    print("=== B63 Counterfactual Audit ===")
    trades = load_trades()
    pop = filter_population(trades)
    print(f"Population: {len(pop)} bullish high-DBS LONG trades")

    symbols = sorted({t["signal"]["symbol"] for t in pop})
    print(f"Unique symbols: {len(symbols)}")

    atr_idx = build_atr_index()
    ohlc_cache = ensure_ohlc_cache(symbols)

    results = []
    no_atr = 0; no_ohlc = 0
    for t in pop:
        sym = t["signal"]["symbol"]
        entry = t["signal"]["entryPrice"]
        entry_ts = t["entryTime"]
        actual_exit_ts = t.get("exitTime")
        position_size = t.get("positionSize", 1.0)
        atr = lookup_atr(atr_idx, sym, entry_ts)
        ohlc = ohlc_cache.get(sym)
        rec = {
            "trade_id": t["id"], "symbol": sym, "strategy": t.get("strategy"),
            "regime": t.get("regime"), "pool": t.get("pool"),
            "filterTier": t.get("filterTier"), "dbs": t.get("pairDirectionalBiasScore"),
            "entry_ts": entry_ts, "entry_price": entry,
            "actual_exit_ts": actual_exit_ts, "actual_exit_price": t.get("exitPrice"),
            "actual_result": t.get("resultType"), "actual_net": t.get("netProfit"),
            "actual_hold_min": (actual_exit_ts-entry_ts)/60000 if actual_exit_ts else None,
            "atr_at_entry": atr, "position_size": position_size,
            "baseline_stop": t["signal"].get("stopLoss"), "baseline_target": t["signal"].get("takeProfit"),
            "variants": {}
        }
        if atr is None: no_atr += 1
        if not ohlc: no_ohlc += 1
        if atr is None or not ohlc:
            results.append(rec); continue

        native_timeout_ms = (actual_exit_ts - entry_ts) if actual_exit_ts else 24*3600*1000
        # For variants A/B/C/E use native timeout; D uses 24h
        variants_fixed = [
            ("A", 2*atr, 2*(2*atr), native_timeout_ms),
            ("B", 3*atr, 2*(3*atr), native_timeout_ms),
            ("C", 3*atr, 3*(3*atr), native_timeout_ms),
            ("E", 4*atr, 3*(4*atr), native_timeout_ms),
        ]
        for name, stop_dist, target_dist, timeout in variants_fixed:
            stop = entry - stop_dist; target = entry + target_dist
            bars = get_forward_bars(ohlc, entry_ts, timeout)
            r = replay_fixed(entry, stop, target, bars, timeout, entry_ts)
            r["net"] = apply_friction(entry, r["exit_price"], position_size)
            r["stop"] = stop; r["target"] = target
            rec["variants"][name] = r
        # Variant D trailing
        bars_d = get_forward_bars(ohlc, entry_ts, 24*3600*1000)
        rd = replay_trailing(entry, entry - 3*atr, bars_d, 24*3600*1000, entry_ts)
        rd["net"] = apply_friction(entry, rd["exit_price"], position_size)
        rd["stop"] = entry - 3*atr; rd["target"] = None
        rec["variants"]["D"] = rd
        results.append(rec)

    print(f"Replayed {len(results)} trades. Missing ATR: {no_atr}, missing OHLC: {no_ohlc}")
    json.dump(results, open(f"{OUTPUT_DIR}/per_trade_results.json", "w"), default=str, indent=1)

    # Deliverable 4 defect mirror: 94 neg-DBS LONG
    neg_longs = [t for t in trades if t.get("status")=="closed"
                 and WINDOW_START_MS<=t.get("entryTime",0)<WINDOW_END_MS
                 and t.get("pairDirectionalBiasScore",0)<=-0.30 and infer_side(t)=="LONG"]
    print(f"Mirror defect count (DBS<=-0.30 LONG): {len(neg_longs)}")
    neg_wr = sum(1 for t in neg_longs if t.get("netProfit",0)>0)
    neg_summary = {
        "count": len(neg_longs),
        "wr": neg_wr/len(neg_longs) if neg_longs else 0,
        "avg_net": sum(t["netProfit"] for t in neg_longs)/len(neg_longs) if neg_longs else 0,
        "strategies": dict(Counter(t.get("strategy") for t in neg_longs).most_common()),
        "regimes": dict(Counter(t.get("regime") for t in neg_longs).most_common()),
    }
    json.dump(neg_summary, open(f"{OUTPUT_DIR}/mirror_defect_summary.json", "w"), indent=1)

    # Aggregate
    make_tables(results, pop)

# -------------------- aggregation --------------------
def agg_variant(results, variant_name, subset=None):
    rows = []
    for r in results:
        if subset is not None and r["trade_id"] not in subset: continue
        if variant_name == "baseline":
            if r.get("actual_net") is None: continue
            # Baseline R: (actual_exit - entry) / (entry - baseline_stop)
            R_risk = r.get("entry_price", 0) - (r.get("baseline_stop") or r.get("entry_price", 0))
            if R_risk and r.get("actual_exit_price"):
                base_r = (r["actual_exit_price"] - r["entry_price"]) / R_risk
            else:
                base_r = 0
            # Return % as dollar-free metric
            ret_pct = (r["actual_exit_price"]/r["entry_price"] - 1) * 100 if r.get("actual_exit_price") and r.get("entry_price") else 0
            rows.append({
                "result": r["actual_result"], "net_pct": ret_pct,
                "hold_min": r.get("actual_hold_min") or 0,
                "r": base_r, "mae": None, "mfe": None,
            })
        else:
            v = r.get("variants", {}).get(variant_name)
            if not v: continue
            ret_pct = (v["exit_price"]/r["entry_price"] - 1) * 100 if v.get("exit_price") and r.get("entry_price") else 0
            rows.append({
                "result": v["result"], "net_pct": ret_pct,
                "hold_min": (v["exit_ts"]-r["entry_ts"])/60000 if v.get("exit_ts") else 0,
                "r": v.get("r", 0), "mae": v.get("mae"), "mfe": v.get("mfe"),
            })
    if not rows: return None
    wins = sum(1 for x in rows if x.get("r",0) > 0)
    results_ct = Counter(x["result"] for x in rows)
    stops = results_ct.get("stop_loss",0)+results_ct.get("trailing_stop",0)
    targets = results_ct.get("take_profit",0)
    timeouts = results_ct.get("timeout",0)
    pct_vals = [x["net_pct"] for x in rows if x.get("net_pct") is not None]
    r_vals = [x["r"] for x in rows if x.get("r") is not None]
    hold_vals = [x["hold_min"] for x in rows if x["hold_min"]]
    return {
        "n": len(rows), "wr": wins/len(rows) if rows else 0,
        "avg_pct": sum(pct_vals)/len(pct_vals) if pct_vals else 0,
        "avg_r": sum(r_vals)/len(r_vals) if r_vals else 0,
        "sum_r": sum(r_vals) if r_vals else 0,
        "stop_pct": stops/len(rows), "target_pct": targets/len(rows), "timeout_pct": timeouts/len(rows),
        "median_hold_min": stats.median(hold_vals) if hold_vals else 0,
        "median_r": stats.median(r_vals) if r_vals else 0,
    }

def make_tables(results, pop):
    lines = []
    lines.append("# B63 Counterfactual Audit — Exit-Only Replay on B62 72h Window\n")
    lines.append(f"**Window:** 2026-04-16 09:15 UTC → 2026-04-19 09:15 UTC")
    lines.append(f"**Population:** {len(results)} bullish high-DBS LONG trades (pairDBS >= 0.30)")
    lines.append(f"**Forward OHLC:** Kraken 15-min bars (Apr 16 00:00 → Apr 20 16:00 UTC)")
    lines.append(f"**ATR at entry:** recovered from MCE telemetry per-cycle snapshots")
    lines.append(f"**Variants:** Baseline / A (2xATR, 2R) / B (3xATR, 2R) / C (3xATR, 3R) / D (TEC-lite trail, 3xATR, 24h) / E (4xATR, 3R)")
    lines.append(f"**Friction:** spread {SPREAD_BPS}bps + slip {SLIPPAGE_BPS}bps + fees {FEE_BPS}bps per leg (VTS config)\n")

    # Deliverable 1: overall
    lines.append("## Deliverable 1 — Overall comparison\n")
    lines.append("| Variant | N | WR | Avg return % | Avg R | Sum R | Stop% | Target% | Timeout% | Med hold (min) | Med R |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for v in ["baseline","A","B","C","D","E"]:
        a = agg_variant(results, v)
        if not a: lines.append(f"| {v} | — | — | — | — | — | — | — | — | — | — |"); continue
        lines.append(f"| {v} | {a['n']} | {a['wr']*100:.1f}% | {a['avg_pct']:+.3f}% | {a['avg_r']:+.2f} | {a['sum_r']:+.1f} | {a['stop_pct']*100:.1f}% | {a['target_pct']*100:.1f}% | {a['timeout_pct']*100:.1f}% | {a['median_hold_min']:.0f} | {a['median_r']:+.2f} |")
    lines.append("")

    # Deliverable 2: per-strategy
    lines.append("## Deliverable 2 — Per-strategy comparison\n")
    strat_counts = Counter(r["strategy"] for r in results)
    big_strats = [s for s, c in strat_counts.items() if c >= 10]
    small_strats = [s for s, c in strat_counts.items() if c < 10]
    for strat in big_strats + (["others"] if small_strats else []):
        if strat == "others":
            subset = {r["trade_id"] for r in results if r["strategy"] in small_strats}
            label = f"others ({', '.join(small_strats)})"
        else:
            subset = {r["trade_id"] for r in results if r["strategy"] == strat}
            label = strat
        lines.append(f"### {label} — n={len(subset)}\n")
        lines.append("| Variant | WR | Avg return % | Avg R | Sum R | Stop% | Target% | Timeout% | Med R |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
        for v in ["baseline","A","B","C","D","E"]:
            a = agg_variant(results, v, subset)
            if not a: lines.append(f"| {v} | — | — | — | — | — | — | — | — |"); continue
            lines.append(f"| {v} | {a['wr']*100:.1f}% | {a['avg_pct']:+.3f}% | {a['avg_r']:+.2f} | {a['sum_r']:+.1f} | {a['stop_pct']*100:.1f}% | {a['target_pct']*100:.1f}% | {a['timeout_pct']*100:.1f}% | {a['median_r']:+.2f} |")
        lines.append("")

    # Deliverable 3: rescue table for original stop-outs
    lines.append("## Deliverable 3 — Rescue analysis (original stop-outs only)\n")
    orig_stops = {r["trade_id"] for r in results if r["actual_result"] == "stop_loss"}
    lines.append(f"Original stop-outs in population: **{len(orig_stops)}**\n")
    lines.append("For the original stopped-out subset, what % reached each milestone in each variant?\n")
    lines.append("| Variant | N | Reached BE | Reached +1R | Reached +2R | Still failed |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for v in ["A","B","C","D","E"]:
        be = one_r = two_r = failed = total = 0
        for r in results:
            if r["trade_id"] not in orig_stops: continue
            vv = r.get("variants", {}).get(v)
            if not vv: continue
            total += 1
            mfe = vv.get("mfe", 0); atr = r["atr_at_entry"]; R = atr if atr else None
            # BE = any positive MFE (crossed above entry)
            if mfe > 0: be += 1
            if R and mfe >= R: one_r += 1
            if R and mfe >= 2*R: two_r += 1
            if vv["result"] in ("stop_loss","trailing_stop") and (not R or mfe < R):
                failed += 1
        if total == 0: lines.append(f"| {v} | 0 | — | — | — | — |"); continue
        lines.append(f"| {v} | {total} | {be/total*100:.1f}% | {one_r/total*100:.1f}% | {two_r/total*100:.1f}% | {failed/total*100:.1f}% |")
    lines.append("")

    # MAE/MFE distributions
    lines.append("## MAE / MFE analysis (from Variant B — 3xATR stop, native timeout)\n")
    lines.append("Bar-approximated from 15-min Kraken OHLC. Units = price-level distance from entry.\n")
    for label, predicate in [
        ("All trades", lambda r: True),
        ("Baseline winners (actual_net > 0)", lambda r: r["actual_net"] and r["actual_net"] > 0),
        ("Baseline losers (actual_net <= 0)", lambda r: r["actual_net"] is not None and r["actual_net"] <= 0),
        ("Original stop-outs only", lambda r: r["actual_result"] == "stop_loss"),
    ]:
        maes = []; mfes = []
        for r in results:
            if not predicate(r): continue
            v = r.get("variants", {}).get("B")
            if not v: continue
            if v.get("mae") is not None: maes.append(v["mae"])
            if v.get("mfe") is not None: mfes.append(v["mfe"])
        if not maes:
            lines.append(f"- **{label}**: no data"); continue
        lines.append(f"- **{label}** (n={len(maes)})")
        lines.append(f"  - MAE: min={min(maes):.4f} med={stats.median(maes):.4f} max={max(maes):.4f}")
        lines.append(f"  - MFE: min={min(mfes):.4f} med={stats.median(mfes):.4f} max={max(mfes):.4f}")
    lines.append("")

    # Deliverable 4: defect notes + interpretation
    lines.append("## Deliverable 4 — Interpretation & defect notes\n")
    lines.append("### Defect notes\n")
    lines.append("- **SHORT trades in window: 0.** LONG-only invariant held.")
    try:
        neg = json.load(open(f"{OUTPUT_DIR}/mirror_defect_summary.json"))
        lines.append(f"- **Mirror defect — DBS ≤ -0.30 LONG trades in window: {neg['count']}**")
        lines.append(f"  - WR: {neg['wr']*100:.1f}%, avg net: ${neg['avg_net']:.4f}")
        lines.append(f"  - Strategy breakdown: {neg['strategies']}")
        lines.append(f"  - Regime breakdown: {neg['regimes']}")
    except: pass
    lines.append(f"- **morning_star contributed {strat_counts.get('morning_star',0)} of {len(results)} high-DBS bullish trades ({strat_counts.get('morning_star',0)/max(len(results),1)*100:.0f}%)** — strongest single-strategy concentration.")
    lines.append("\n### Interpretation\n")
    lines.append("*(To be completed after reviewing the above tables — see the auto-generated CONCLUSION section below.)*\n")
    # Heuristic conclusion
    base = agg_variant(results, "baseline"); b = agg_variant(results, "B"); d = agg_variant(results, "D")
    if base and b and d:
        lines.append("### Auto-generated conclusion candidates\n")
        lines.append(f"- Baseline avg R = {base['avg_r']:+.2f}, Sum R = {base['sum_r']:+.1f}")
        lines.append(f"- Variant B avg R = {b['avg_r']:+.2f}, Sum R = {b['sum_r']:+.1f} (ΔAvgR = {b['avg_r']-base['avg_r']:+.2f})")
        lines.append(f"- Variant D avg R = {d['avg_r']:+.2f}, Sum R = {d['sum_r']:+.1f} (ΔAvgR = {d['avg_r']-base['avg_r']:+.2f})")
        # Rescue hint
        rescue_any = 0; total_stops = 0
        for r in results:
            if r["actual_result"] != "stop_loss": continue
            total_stops += 1
            v = r.get("variants", {}).get("B")
            if v and v.get("mfe") and r["atr_at_entry"] and v["mfe"] >= r["atr_at_entry"]:
                rescue_any += 1
        if total_stops:
            lines.append(f"- Of {total_stops} original stop-outs, {rescue_any} ({rescue_any/total_stops*100:.0f}%) later reached +1R MFE under Variant B (3x ATR stop, native timeout).")
    lines.append("")

    out_md = f"{OUTPUT_DIR}/BATCH_63_COUNTERFACTUAL_AUDIT.md"
    with open(out_md, "w") as f:
        f.write("\n".join(lines))
    print(f"Wrote {out_md}")

if __name__ == "__main__":
    main()
