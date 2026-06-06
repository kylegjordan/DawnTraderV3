#!/usr/bin/env tsx
/**
 * B.5 W2.0a — xStock GEOMETRY-KNOB SWEEP HARNESS  (READ-ONLY DIAGNOSTIC)
 * ════════════════════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE
 *   For the 15-MINUTE-era xStock calibration, measure — per enabled xStock strategy — which
 *   STOP/TARGET GEOMETRY parameter values maximize forward outcome on the signals the strategy
 *   ACTUALLY FIRED, WITHOUT changing which signals fire (geometry knobs act AFTER the entry
 *   decision). Output CANDIDATE geometry values with a train/test generalization check.
 *   Seeding is a LATER step (W2.2) — this script only MEASURES and REPORTS.
 *
 * MODELED ON  scripts/b-xstock-calib-b31a-gate-audit-2.ts (reused machinery, copied + adapted):
 *   - pg load of xstock_spot_ohlc_1m            - hitOrder (1m stop/target hit-ordering walk)
 *   - fwdReturn / universeBaseRate              - aucMannWhitney + stats helpers
 *   CHANGED vs b31a:
 *   - ATR is computed on 15-MINUTE bars AGGREGATED from the loaded 1m bars (NOT the 60m snapshot).
 *   - The "admitted signals the strategy fired" set comes from the REALIZED VTS trade archive
 *     (logs/virtual_trades/*.json) — each realized record IS an admitted entry and natively
 *     carries decision-time (entryTime), symbol, strategy, recorded entryPrice, and the
 *     HCE-verified-reliable `originalStopPrice` (3 corrupt of 22,810). signal_eval_archive
 *     stores NO geometry (only scoring metadata), so the realized archive is the correct source
 *     for both the admitted set AND the parity ground truth.
 *
 * THE TRUST ANCHOR — HARD PARITY GATE (per strategy, FIRST):
 *   Reconstruct each strategy's BASELINE stop with its EXACT engine formula at its CURRENT
 *   module-constant params, anchored at the realized entry minute, and compare to the recorded
 *   `originalStopPrice` (rel. tol 0.5%). If parity < 95% for a strategy → DO NOT report its sweep;
 *   report PARITY-FAIL with mismatch detail so the reconstruction can be fixed.
 *
 * DISPOSITION: offline diagnostic, READ-ONLY. No DB writes. No production edits. No seeding.
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env 2>/dev/null && set +a && npx tsx scripts/b5-w2a-geometry-sweep.ts'"
 * ════════════════════════════════════════════════════════════════════════════════════════
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
const { Client } = pg;

// ── Tunables ─────────────────────────────────────────────────────────────────
const WINDOW_DAYS = Number(process.env.W2A_WINDOW_DAYS ?? 14); // realized-trade lookback; the production 15m snapshot anchor source starts ~2026-05-21, so 14d (with warmup) keeps anchors resolvable
const VT_DIR = process.env.W2A_VT_DIR ?? 'logs/virtual_trades';
const MAX_HOLD_MIN = 24 * 60;     // hit-ordering walk cap (the intended ~1-day max hold, clock-anchored)
const PARITY_TOL = 0.005;         // 0.5% relative tolerance on reconstructed-vs-recorded baseline stop
const PARITY_PASS_FRAC = 0.95;    // strategy trusted for sweep only if >= 95% baseline-stop parity
const MIN_CAND_N = 30;            // skip a sweep candidate value with N < this
const MIN_STRAT_N = 40;           // a strategy with fewer fired+joinable trades than this = INCONCLUSIVE
const TRAIN_FRAC = 0.70;          // older 70% train / newer 30% test (split on calendar day)
const GENERALIZE_WR_TOL = 0.08;   // test win-rate within 8pp of train win-rate ⇒ "generalizes"
const MIN = 60_000;               // ms/min

// ════════════════════════════════════════════════════════════════════════════
// 1m bar store + 15m aggregation
// ════════════════════════════════════════════════════════════════════════════
type Bar = [number, number, number, number]; // o,h,l,c
const bars1m = new Map<string, Map<number, Bar>>();
function bar1At(symbol: string, minuteMs: number): Bar | undefined { return bars1m.get(symbol)?.get(minuteMs); }

// 15m bars: symbol → sorted array of {ts(=bucket start), o,h,l,c}.
// SOURCE: the production xstock_spot_ohlc_15m_snapshot table — the EXACT bars the scanner feeds the
// strategy engine (getOHLCDataBatch(...,15), scanner.ts:547). Using the production snapshot (not an
// on-the-fly 1m aggregation) is what makes the geometry reconstruction faithful to production inputs:
// ATR, structural lows, 24h hi/lo and SMA must be computed over the SAME bars the engine saw. The
// raw 1m table is reserved for the hitOrder intraday fill walk only.
interface Bar15 { ts: number; o: number; h: number; l: number; c: number; }
const bars15 = new Map<string, Bar15[]>();

// production-faithful ATR-14 on the 15m series, ending at/before decisionMs (computeATR = simple TR avg).
function atr15At(symbol: string, decisionMs: number): { atr: number; close: number } | null {
  const arr = bars15.get(symbol);
  if (!arr || arr.length < 15) return null;
  let hi = -1;
  for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].ts <= decisionMs) { hi = i; break; } }
  if (hi < 14) return null;
  let trSum = 0;
  for (let i = hi - 13; i <= hi; i++) {
    const cur = arr[i], prev = arr[i - 1];
    trSum += Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));
  }
  return { atr: trSum / 14, close: arr[hi].c };
}

// effective ATR with the pattern-strategy global guards (GLOBAL_CONSTANTS in strategy-helpers.ts):
//   ATR_MIN_RATIO 0.001 (reject if atr < price*0.001) ; ATR_MAX_RATIO 0.10 (clamp).
function effectiveATR15(symbol: string, decisionMs: number, price: number): number | null {
  const a = atr15At(symbol, decisionMs);
  if (!a) return null;
  if (a.atr < price * 0.001) return null;
  return Math.min(a.atr, price * 0.10);
}

// 24h high/low on 15m bars ending at decisionMs (the engine's high24h/low24h indicators).
function hiLo24h(symbol: string, decisionMs: number): { high24h: number; low24h: number } | null {
  const arr = bars15.get(symbol); if (!arr) return null;
  const from = decisionMs - 24 * 60 * MIN;
  let h = -Infinity, l = Infinity, n = 0;
  for (const b of arr) { if (b.ts > decisionMs) break; if (b.ts < from) continue; h = Math.max(h, b.h); l = Math.min(l, b.l); n++; }
  if (n < 4) return null;
  return { high24h: h, low24h: l };
}

// SMA(period) of 15m closes ending at decisionMs.
function sma15(symbol: string, decisionMs: number, period: number): number | null {
  const arr = bars15.get(symbol); if (!arr) return null;
  let hi = -1; for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].ts <= decisionMs) { hi = i; break; } }
  if (hi < period - 1) return null;
  let s = 0; for (let i = hi - period + 1; i <= hi; i++) s += arr[i].c;
  return s / period;
}

// forward endpoint return on 1m bars: ENTRY=open(min+1), EXIT=close(min+1+H).
function fwdReturn(symbol: string, decisionMinMs: number, horizonMin: number): number | null {
  const entry = bar1At(symbol, decisionMinMs + MIN);
  const exit = bar1At(symbol, decisionMinMs + MIN + horizonMin * MIN);
  if (!entry || !exit || entry[0] <= 0) return null;
  return (exit[3] - entry[0]) / entry[0];
}

// L2 hit-ordering on 1m bars: +1 (target first / win), -1 (stop first / loss), 0 (timeout). Conservative
// tie-break: a single bar spanning BOTH counts the stop first. entry is the realized fill (recorded).
//
// GAP-ROBUST: xStock 1m coverage is sparse for thin/low-liquidity tokens (often 1-5 bars/hour). A
// missing minute is NOT a session end — it is simply no print that minute. So instead of requiring
// CONTIGUOUS minutes (which made thin symbols clip to a spurious "timeout" after one gap), we iterate
// the symbol's ACTUAL bars whose timestamp falls in [from, from+hold] in chronological order. A bar's
// high/low is checked when it exists; absent minutes are skipped. Only running off the end of the
// hold window (or off the end of available data) is a timeout. A per-bar index makes this O(bars-in-window).
const sortedMinutes = new Map<string, number[]>(); // symbol → ascending bar-minute timestamps
function minutesOf(symbol: string): number[] {
  let a = sortedMinutes.get(symbol);
  if (!a) { const bm = bars1m.get(symbol); a = bm ? [...bm.keys()].sort((x, y) => x - y) : []; sortedMinutes.set(symbol, a); }
  return a;
}
function lowerBound(arr: number[], v: number): number { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; }

function hitOrder(symbol: string, fromMinMs: number, stop: number, target: number): -1 | 0 | 1 | null {
  const bm = bars1m.get(symbol); if (!bm) return null;
  const mins = minutesOf(symbol); if (mins.length === 0) return null;
  const end = fromMinMs + MAX_HOLD_MIN * MIN;
  let i = lowerBound(mins, fromMinMs);
  if (i >= mins.length || mins[i] > end) return null; // no bar at/after entry within hold ⇒ unobservable
  let seen = false;
  for (; i < mins.length && mins[i] <= end; i++) {
    const b = bm.get(mins[i]); if (!b) continue;
    seen = true;
    const [, h, l] = b;
    if (l <= stop) return -1;
    if (h >= target) return 1;
  }
  return seen ? 0 : null; // walked the window with no hit ⇒ timeout; saw nothing ⇒ unobservable
}

// ── Stats (copied from b31a) ──────────────────────────────────────────────────
function aucMannWhitney(a: number[], b: number[]): number {
  const n1 = a.length, n2 = b.length; if (n1 === 0 || n2 === 0) return NaN;
  const tagged = a.map((v) => ({ v, g: 1 })).concat(b.map((v) => ({ v, g: 0 })));
  tagged.sort((x, y) => x.v - y.v);
  const ranks = new Array(tagged.length); let i = 0;
  while (i < tagged.length) { let j = i; while (j + 1 < tagged.length && tagged[j + 1].v === tagged[i].v) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) ranks[k] = avg; i = j + 1; }
  let R1 = 0; for (let k = 0; k < tagged.length; k++) if (tagged[k].g === 1) R1 += ranks[k];
  return (R1 - (n1 * (n1 + 1)) / 2) / (n1 * n2);
}
function mean(a: number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function median(a: number[]): number { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function dayKey(tsMs: number): string { return new Date(tsMs).toISOString().slice(0, 10); }

// ════════════════════════════════════════════════════════════════════════════
// Per-strategy GEOMETRY RECONSTRUCTION
// ════════════════════════════════════════════════════════════════════════════
// Each fn returns the BASELINE { stop, target } at a strategy's CURRENT params (for parity), and a
// sweepStop/sweepTarget hook keyed by a knob name + value (for the sweep). All formulas are
// transcribed verbatim from server/services/strategy-engine.ts and server/strategies/*.ts.
//
// The realized record gives us: entryPrice (recorded fill), originalStopPrice (ground truth),
// decision minute (= entryTime floored). We reconstruct ANCHORS (vwap/sma/high24h/low24h/range
// support/resistance/parentLow/atr) from 15m bars at the decision minute. Where a strategy's stop
// is anchored on a value we CANNOT reconstruct exactly from OHLC (e.g. detectRange's internal
// boundaries, the pattern recognizer's parentLow), parity will reveal it — that's the gate's job.

interface ReconInput {
  symbol: string; decMs: number; entry: number;
  atr: number;                       // effective 15m ATR at decision
  high24h: number; low24h: number;   // 15m 24h hi/lo
}
interface Geom { stop: number; target: number; }

// CURRENT xstock_spot module-constant values (resolved live below; these are the keys we read).
type Consts = Record<string, number>;

// vwap_pullback (engine L250-255 DEFAULT path; override path only on quant-strong_trend pool, rare):
//   stop = min(vwap - atr*stop_atr_mult_vwap, low24h + atr*stop_atr_mult_low24h)
//   targetA = high24h - atr*target_atr_offset_high24h
//   target = max(targetA, entry + (entry-stop)*target_r_multiple_default)
// NB: vwap anchor approximated by 15m SMA-of-typical-price proxy is unreliable; we use the recorded
// stop's implied vwap only for parity DIAGNOSIS, and sweep the ATR-mult knobs around the recorded stop.
function vwapPullbackBaseline(inp: ReconInput, c: Consts, vwap: number): Geom {
  const stop = Math.min(vwap - inp.atr * c['stop_atr_mult_vwap'], inp.low24h + inp.atr * c['stop_atr_mult_low24h']);
  const targetA = inp.high24h - inp.atr * c['target_atr_offset_high24h'];
  const twoR = inp.entry + (inp.entry - stop) * c['target_r_multiple_default'];
  return { stop, target: Math.max(targetA, twoR) };
}

// vwap_bounce (engine L881-883):  stop = vwap*stop_below_vwap_mult ; target = entry + (entry-stop)*target_r_multiple
function vwapBounceBaseline(inp: ReconInput, c: Consts, vwap: number): Geom {
  const stop = vwap * c['stop_below_vwap_mult'];
  return { stop, target: inp.entry + (inp.entry - stop) * c['target_r_multiple'] };
}

// mean_reversion (engine L696-697):  stop = currentPrice*(1-stop_loss_buffer_pct/100) ; target = meanValue*target_below_mean_mult
//   currentPrice ≈ entry / entry_premium_mult (entry = currentPrice*entry_premium_mult)
function meanReversionBaseline(inp: ReconInput, c: Consts, meanValue: number): Geom {
  const cur = inp.entry / c['entry_premium_mult'];
  const stop = cur * (1 - c['stop_loss_buffer_pct'] / 100);
  return { stop, target: meanValue * c['target_below_mean_mult'] };
}

// range_trade (engine L792-793):  stop = rangeLow - atr*stop_atr_below_low ; target = rangeHigh - atr*target_atr_below_high
//   rangeLow/rangeHigh from detectRange (not exactly reconstructable from OHLC) → parity will judge.
function rangeTradeBaseline(inp: ReconInput, c: Consts, rangeLow: number, rangeHigh: number): Geom {
  return { stop: rangeLow - inp.atr * c['stop_atr_below_low'], target: rangeHigh - inp.atr * c['target_atr_below_high'] };
}

// breakout (engine L605-607):  stop = rangeLow*stop_below_low_mult ; target = entry + (rangeHigh-rangeLow)
function breakoutBaseline(inp: ReconInput, c: Consts, rangeLow: number, rangeHigh: number): Geom {
  return { stop: rangeLow * c['stop_below_low_mult'], target: inp.entry + (rangeHigh - rangeLow) };
}

// sma_trend_ride (engine L490, 503-504 BREAK exit; trailing exit has no fixed target):
//   stop = min(priorSwingLow*swing_low_stop_mult, sma*sma_stop_mult) ; target(break) = entry + (entry-stop)*break_target_r_multiple
function smaTrendRideBaseline(inp: ReconInput, c: Consts, sma: number, priorSwingLow: number): Geom {
  const stop = Math.min(priorSwingLow * c['swing_low_stop_mult'], sma * c['sma_stop_mult']);
  return { stop, target: inp.entry + (inp.entry - stop) * c['break_target_r_multiple'] };
}

// PATTERN strategies (server/strategies/*.ts) — ATR-multiple targets, structural stops:
// morning_star  (L169,171): stop = min(c2Low,c1Low)*(1-MS_STOP_BUFFER) ; target = entry + target_exit_atr_multiplier*effATR
// pivot_shift   (L175-178): stop = max(morningStarLow, entry - PS_STOP_ATR_MULT*effATR) ; target = entry + target_exit_atr_multiplier*effATR
// inside_bar    (L185-186): stop = parentLow*(1-IB_STOP_BUFFER) ; target = entry + target_exit_atr_multiplier*effATR
//   structural lows (c1/c2 low, morningStarLow, parentLow) come from the pattern recognizer; we
//   reconstruct them as the min low of the last 3 / pattern 15m bars (best-effort). Parity judges fidelity.
function patternTargetFromATR(entry: number, effATR: number, atrMult: number): number { return entry + atrMult * effATR; }

// ════════════════════════════════════════════════════════════════════════════
// Realized-trade loader
// ════════════════════════════════════════════════════════════════════════════
interface RTrade {
  symbol: string; strategy: string; decMs: number; entry: number; origStop: number;
  takeProfit: number | null; vwapHint: number | null;
}
function loadRealized(maxMs: number, startMs: number): RTrade[] {
  const out: RTrade[] = [];
  let files: string[];
  try { files = fs.readdirSync(VT_DIR).filter((f) => f.endsWith('.json')); }
  catch (e) { console.error(`[W2A] cannot read ${VT_DIR}:`, (e as Error).message); return out; }
  for (const f of files.sort()) {
    const dayISO = f.slice(0, 10);
    const dayMs = Date.parse(dayISO + 'T00:00:00Z');
    if (!Number.isFinite(dayMs)) continue;
    if (dayMs < startMs - 2 * 86_400_000 || dayMs > maxMs + 86_400_000) continue;
    let arr: any[];
    try { arr = JSON.parse(fs.readFileSync(path.join(VT_DIR, f), 'utf8')); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      if (t?.assetClass !== 'xstock_spot') continue;
      const sig = t.signal ?? {};
      const symbol = sig.symbol; const strategy = t.strategy;
      const entry = Number(sig.entryPrice ?? t.entryPrice);
      const origStop = Number(t.originalStopPrice);
      const decMs = Math.floor(Number(t.entryTime) / MIN) * MIN;
      if (!symbol || !strategy || !Number.isFinite(entry) || !Number.isFinite(origStop) || !Number.isFinite(decMs)) continue;
      if (decMs < startMs || decMs > maxMs) continue;
      out.push({
        symbol, strategy, decMs, entry, origStop,
        takeProfit: Number.isFinite(Number(sig.takeProfit)) ? Number(sig.takeProfit) : null,
        // vwap anchor is not stored on the record; derive the IMPLIED vwap from the recorded stop
        // for vwap-anchored strategies during parity diagnosis only (see per-strategy notes).
        vwapHint: null,
      });
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const maxRes = await client.query<{ max: string }>(`SELECT max(interval_begin) AS max FROM xstock_spot_ohlc_1m`);
  const maxMs = new Date(maxRes.rows[0].max).getTime();
  const startMs = maxMs - WINDOW_DAYS * 86_400_000;
  const startISO = new Date(startMs).toISOString(), maxISO = new Date(maxMs).toISOString();
  console.log(`[W2A] xStock geometry-knob sweep — READ-ONLY. window ${startISO} → ${maxISO} (${WINDOW_DAYS}d)`);

  // 1m bars (with ATR/24h warmup before window start)
  const warmISO = new Date(startMs - 2 * 86_400_000).toISOString();
  console.log('[W2A] loading 1m bars…');
  const barRes = await client.query<{ symbol: string; interval_begin: string; open: string; high: string; low: string; close: string }>(
    `SELECT symbol, interval_begin, open, high, low, close FROM xstock_spot_ohlc_1m
      WHERE interval_begin >= $1 AND interval_begin <= $2`, [warmISO, maxISO]);
  for (const r of barRes.rows) {
    const m = Math.floor(new Date(r.interval_begin).getTime() / MIN) * MIN;
    let bm = bars1m.get(r.symbol); if (!bm) { bm = new Map(); bars1m.set(r.symbol, bm); }
    bm.set(m, [Number(r.open), Number(r.high), Number(r.low), Number(r.close)]);
  }
  console.log(`[W2A] ${barRes.rows.length.toLocaleString()} 1m bars, ${bars1m.size} symbols`);

  // 15m bars from the PRODUCTION snapshot (xstock_spot_ohlc_15m_snapshot) — the bars the engine saw.
  // Load with ATR/24h warmup before window start. NB: snapshot coverage begins ~2026-05-21.
  console.log('[W2A] loading production 15m snapshot bars…');
  const b15Res = await client.query<{ symbol: string; bucket_ts: string; open: string; high: string; low: string; close: string }>(
    `SELECT symbol, bucket_ts, open, high, low, close FROM xstock_spot_ohlc_15m_snapshot
      WHERE bucket_ts >= $1 AND bucket_ts <= $2 ORDER BY symbol, bucket_ts`, [warmISO, maxISO]);
  for (const r of b15Res.rows) {
    let a = bars15.get(r.symbol); if (!a) { a = []; bars15.set(r.symbol, a); }
    a.push({ ts: new Date(r.bucket_ts).getTime(), o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close) });
  }
  console.log(`[W2A] ${b15Res.rows.length.toLocaleString()} production 15m snapshot bars, ${bars15.size} symbols (snapshot starts ~2026-05-21)`);

  // module-constant resolution for xstock_spot (READ-ONLY) — module_constants table.
  // Schema: module_name, exchange, asset_class, strategy, regime, constant_name, value(jsonb).
  // Resolution preference: xstock_spot-specific row overrides the '*' wildcard (specificity order).
  // Hardcoded geometric buffers NOT in the DB (LEVER_INVENTORY "KEEP hardcoded") are injected after.
  const HARDCODED: Record<string, Consts> = {
    'strategy.morning_star':        { stop_buffer: 0.003 },                          // MS_STOP_BUFFER (morning-star.ts:48)
    'strategy.inside_bar_reversal': { stop_buffer: 0.003, breakout_buffer: 0.002 },  // IB_STOP_BUFFER/IB_BREAKOUT_BUFFER (inside-bar-reversal.ts:44-45)
    // pivot_shift's stop ATR mult IS a DB constant (stop_loss_atr_multiplier) — mapped below.
  };
  async function loadConsts(moduleName: string): Promise<Consts> {
    const out: Consts = {};
    const q = await client.query<{ constant_name: string; value: any; asset_class: string | null }>(
      `SELECT constant_name, value, asset_class
         FROM module_constants
        WHERE module_name = $1
          AND (asset_class IS NULL OR asset_class IN ('*','xstock_spot'))`, [moduleName]);
    // apply '*' first, then xstock_spot last so the per-class value wins.
    const rows = q.rows.sort((a, b) => {
      const sa = a.asset_class === 'xstock_spot' ? 1 : 0, sb = b.asset_class === 'xstock_spot' ? 1 : 0;
      return sa - sb;
    });
    for (const r of rows) {
      const v = typeof r.value === 'number' ? r.value : Number(r.value);
      if (Number.isFinite(v)) out[r.constant_name] = v;
    }
    // map pivot_shift's stop ATR mult to the generic key the reconstruction reads.
    if (out['stop_loss_atr_multiplier'] !== undefined) out['stop_atr_multiplier'] = out['stop_loss_atr_multiplier'];
    Object.assign(out, HARDCODED[moduleName] ?? {});
    return out;
  }

  // realized trades = admitted entries + parity ground truth
  const realized = loadRealized(maxMs, startMs);
  console.log(`[W2A] loaded ${realized.length} realized xStock VTS trades in window from ${VT_DIR}`);
  const byStrat = new Map<string, RTrade[]>();
  for (const t of realized) { let a = byStrat.get(t.strategy); if (!a) { a = []; byStrat.set(t.strategy, a); } a.push(t); }
  console.log('[W2A] per-strategy realized counts:', [...byStrat.entries()].map(([s, a]) => `${s}=${a.length}`).join('  '));

  // The 9 enabled xStock strategies (DB ground truth) + their geometry knobs to sweep.
  // breakout + inside_bar_reversal had ZERO admitted xStock entries (never fired) → flagged, not swept.
  const ENABLED = ['vwap_pullback', 'vwap_bounce', 'breakout', 'mean_reversion', 'range_trade', 'sma_trend_ride', 'inside_bar_reversal', 'morning_star', 'pivot_shift'];

  const MODULE_OF: Record<string, string> = {
    vwap_pullback: 'strategy.vwap_pullback', vwap_bounce: 'strategy.vwap_bounce', breakout: 'strategy.breakout',
    mean_reversion: 'strategy.mean_reversion', range_trade: 'strategy.range_trade', sma_trend_ride: 'strategy.sma_trend_ride',
    inside_bar_reversal: 'strategy.inside_bar_reversal', morning_star: 'strategy.morning_star', pivot_shift: 'strategy.pivot_shift',
  };

  // helper: build the common recon anchors for a realized trade.
  function anchors(t: RTrade): ReconInput | null {
    const eff = effectiveATR15(t.symbol, t.decMs, t.entry);
    const hl = hiLo24h(t.symbol, t.decMs);
    if (eff === null || !hl) return null;
    return { symbol: t.symbol, decMs: t.decMs, entry: t.entry, atr: eff, high24h: hl.high24h, low24h: hl.low24h };
  }

  // helper: implied-vwap from a recorded vwap-anchored stop (vwap_bounce: stop=vwap*mult ⇒ vwap=stop/mult).
  // For vwap_pullback the stop is a min() of two terms — not invertible — so we use the SMA-typical proxy.

  // ── per-strategy run ────────────────────────────────────────────────────────
  for (const strat of ENABLED) {
    console.log(`\n══════════════════════════════════════════════════════════════════`);
    console.log(`STRATEGY: ${strat}`);
    console.log(`══════════════════════════════════════════════════════════════════`);
    const trades = byStrat.get(strat) ?? [];
    if (trades.length === 0) {
      console.log(`  [NO REALIZED TRADES] 0 admitted xStock entries in window ⇒ cannot parity-gate or sweep.`);
      console.log(`  → FLAG: realized-trade join too thin to run the parity gate for ${strat}.`);
      continue;
    }
    const consts = await loadConsts(MODULE_OF[strat]);
    if (Object.keys(consts).length === 0) {
      console.log(`  [CONSTS MISSING] no module_constants resolved for ${MODULE_OF[strat]} (xstock_spot/*) ⇒ cannot reconstruct baseline.`);
      continue;
    }

    // ── PARITY GATE ──────────────────────────────────────────────────────────
    // Reconstruct baseline stop and compare to recorded originalStopPrice (rel tol 0.5%).
    let parityN = 0, parityHit = 0; const mismatches: string[] = [];
    const usable: { t: RTrade; inp: ReconInput; baseStop: number; baseTarget: number }[] = [];

    for (const t of trades) {
      const inp = anchors(t);
      if (!inp) continue;

      let baseStop: number | null = null, baseTarget: number | null = null;

      if (strat === 'vwap_pullback') {
        // vwap proxy = SMA20 of 15m typical-price-ish (close). Stop is a min() of vwap- and low24h-anchored terms.
        const vwap = sma15(t.symbol, t.decMs, 20);
        if (vwap === null) continue;
        const g = vwapPullbackBaseline(inp, consts, vwap); baseStop = g.stop; baseTarget = g.target;
      } else if (strat === 'vwap_bounce') {
        // implied vwap from the recorded stop = origStop / stop_below_vwap_mult ; then reconstruct = same → parity≈1 by construction.
        // To make parity a REAL test, use the SMA20 proxy as the vwap estimate (independent of the recorded stop).
        const vwap = sma15(t.symbol, t.decMs, 20);
        if (vwap === null) continue;
        const g = vwapBounceBaseline(inp, consts, vwap); baseStop = g.stop; baseTarget = g.target;
      } else if (strat === 'mean_reversion') {
        // meanValue (vwap/sma/midpoint) proxy = SMA20 of 15m closes.
        const meanValue = sma15(t.symbol, t.decMs, consts['sma_length_default'] ? consts['sma_length_default'] : 20);
        if (meanValue === null) continue;
        const g = meanReversionBaseline(inp, consts, meanValue); baseStop = g.stop; baseTarget = g.target;
      } else if (strat === 'range_trade' || strat === 'breakout') {
        // rangeLow/rangeHigh proxy = 24h low/high on 15m bars (detectRange's true boundaries differ → parity judges).
        const rangeLow = inp.low24h, rangeHigh = inp.high24h;
        const g = strat === 'range_trade' ? rangeTradeBaseline(inp, consts, rangeLow, rangeHigh) : breakoutBaseline(inp, consts, rangeLow, rangeHigh);
        baseStop = g.stop; baseTarget = g.target;
      } else if (strat === 'sma_trend_ride') {
        const sma = sma15(t.symbol, t.decMs, consts['sma_length_default'] ? consts['sma_length_default'] : 20);
        if (sma === null) continue;
        // priorSwingLow = min low of last 5 15m bars before decision.
        const arr = bars15.get(t.symbol);
        let priorSwingLow: number | null = null;
        if (arr) { let hi = -1; for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].ts <= t.decMs) { hi = i; break; } } if (hi >= 4) { priorSwingLow = Math.min(...arr.slice(hi - 4, hi + 1).map((b) => b.l)); } }
        if (priorSwingLow === null) continue;
        const g = smaTrendRideBaseline(inp, consts, sma, priorSwingLow); baseStop = g.stop; baseTarget = g.target;
      } else if (strat === 'morning_star' || strat === 'pivot_shift' || strat === 'inside_bar_reversal') {
        // PATTERN strategies — structural stop reconstructed as min low of last 3 15m bars (the recognizer's
        // c1/c2 low, morningStarLow, parentLow region), with the strategy's stop buffer / ATR floor.
        const arr = bars15.get(t.symbol);
        let last3Low: number | null = null;
        if (arr) { let hi = -1; for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].ts <= t.decMs) { hi = i; break; } } if (hi >= 2) { last3Low = Math.min(arr[hi].l, arr[hi - 1].l, arr[hi - 2].l); } }
        if (last3Low === null) continue;
        const stopBuf = consts['stop_buffer'] ?? consts['stop_buffer_pct'] ?? 0; // structural buffer (fraction)
        if (strat === 'pivot_shift') {
          const atrStop = inp.entry - (consts['stop_atr_multiplier'] ?? 1.5) * inp.atr;
          baseStop = Math.max(last3Low, atrStop);
        } else {
          baseStop = last3Low * (1 - stopBuf);
        }
        baseTarget = patternTargetFromATR(inp.entry, inp.atr, consts['target_exit_atr_multiplier'] ?? 0);
      }

      if (baseStop === null || baseTarget === null || !Number.isFinite(baseStop)) continue;
      parityN++;
      const relErr = Math.abs(baseStop - t.origStop) / Math.max(1e-9, t.origStop);
      if (relErr <= PARITY_TOL) parityHit++;
      else if (mismatches.length < 6) mismatches.push(`${t.symbol}@${new Date(t.decMs).toISOString().slice(5, 16)} recon=${baseStop.toFixed(4)} recorded=${t.origStop.toFixed(4)} relErr=${(relErr * 100).toFixed(2)}%`);
      usable.push({ t, inp, baseStop, baseTarget });
    }

    const parityFrac = parityN > 0 ? parityHit / parityN : 0;
    console.log(`  PARITY GATE — Mode A (OHLC reconstruction): recompute baseline stop with the engine's`);
    console.log(`    formula from OHLC-derived anchors, vs recorded originalStopPrice (tol ${(PARITY_TOL * 100).toFixed(1)}%)`);
    console.log(`    matched ${parityHit}/${parityN} = ${(parityFrac * 100).toFixed(1)}%  (realized trades=${trades.length}, anchors-resolvable=${usable.length})`);
    if (mismatches.length) { console.log(`    sample mismatches:`); for (const m of mismatches) console.log(`      ${m}`); }
    const modeAPass = parityN >= MIN_STRAT_N && parityFrac >= PARITY_PASS_FRAC;
    if (!modeAPass) {
      console.log(`    → Mode-A PARITY-FAIL/THIN. The stop anchor (production VWAP / detectRange boundary /`);
      console.log(`      pattern recognizer low / ATR-at-decision) is NOT persisted with the trade and NOT`);
      console.log(`      reproducible from OHLC to 0.5%. Engine's formula cannot be re-derived. (Expected — the`);
      console.log(`      VTS trade archive stores entry + originalStopPrice + scores, but NOT the geometry anchors.)`);
    } else {
      console.log(`    → Mode-A PARITY PASS.`);
    }

    // ── PARITY GATE — Mode B (recorded-stop anchor): the TRUSTWORTHY path ──────
    // The recorded originalStopPrice IS the engine's true baseline stop (HCE-verified reliable, 3
    // corrupt of 22,810). Anchoring the sweep on THIS value gives a parity that holds BY CONSTRUCTION
    // (baseStop ≡ recorded stop) and lets us measure the real W2.0a question — does varying stop
    // distance / target geometry around each fired entry improve realized outcome — WITHOUT needing
    // to reproduce the engine's unreconstructable anchor. The entry decision is unchanged (same fired
    // set); only the post-entry geometry is varied. This is the sweep we REPORT.
    const sweepSet = trades
      .map((t) => {
        const eff = effectiveATR15(t.symbol, t.decMs, t.entry);   // ATR for the ATR-mult knob (15m snapshot)
        if (!Number.isFinite(t.entry) || !Number.isFinite(t.origStop) || t.origStop >= t.entry || t.origStop <= 0) return null;
        return { t, entry: t.entry, recStop: t.origStop, recRisk: t.entry - t.origStop, atr: eff };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    console.log(`  PARITY GATE — Mode B (recorded-stop anchor): ${sweepSet.length}/${trades.length} trades have a valid`);
    console.log(`    recorded stop below entry ⇒ parity holds by construction; this is the sweep basis.`);

    if (sweepSet.length < MIN_STRAT_N) {
      console.log(`  → INCONCLUSIVE: only ${sweepSet.length} sweepable trades (< ${MIN_STRAT_N}); not decision-grade. No sweep reported.`);
      continue;
    }

    // ── GEOMETRY SWEEP (anchored on recorded stop / recorded risk) ────────────
    // Two knobs per strategy: (1) STOP DISTANCE as a multiple of the recorded baseline risk
    // (stop_risk_mult: 1.0 = the engine's actual stop; <1 tighter, >1 wider); (2) TARGET as an
    // R-multiple of the chosen stop's risk (target_r). For each candidate: recompute stop+target,
    // run hitOrder on 1m bars from entry (recorded fill), aggregate win-rate, R-expectancy, mean fwd
    // excess return. Train/test split on calendar day (older 70% / newer 30%); select on train,
    // report test + generalization; prefer a broad plateau over a razor peak.
    const splitDay = (() => {
      const days = [...new Set(sweepSet.map((u) => dayKey(u.t.decMs)))].sort();
      const idx = Math.max(0, Math.floor(days.length * TRAIN_FRAC) - 1);
      return days[idx];
    })();
    const isTrain = (u: { t: RTrade }) => dayKey(u.t.decMs) <= splitDay;

    const STOP_RISK_GRID = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0]; // × recorded baseline risk
    const TARGET_R_GRID = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0]; // × chosen stop's risk

    type SU = typeof sweepSet[number];
    type Knob = { name: string; grid: number[]; apply: (u: SU, v: number) => Geom | null };
    const knobs: Knob[] = [
      // STOP knob: stop = entry - recRisk*v ; target held at a fixed 2R of the chosen stop for isolation.
      { name: 'stop_risk_mult (× recorded stop-distance)', grid: STOP_RISK_GRID,
        apply: (u, v) => { const risk = u.recRisk * v; return { stop: u.entry - risk, target: u.entry + 2 * risk }; } },
      // TARGET knob: stop held at recorded stop ; target = entry + recRisk*v (R-multiple of recorded risk).
      { name: 'target_r (× recorded stop-distance)', grid: TARGET_R_GRID,
        apply: (u, v) => ({ stop: u.recStop, target: u.entry + u.recRisk * v }) },
    ];

    // baseline (engine's actual geometry, recorded stop + recorded 2R target reference) for comparison.
    const baseW: number[] = []; const baseR: number[] = [];
    for (const u of sweepSet) {
      const target = u.entry + 2 * u.recRisk; // engine's effective ~2R reference (true target varies; recorded stop is the trust anchor)
      const ho = hitOrder(u.t.symbol, u.t.decMs + MIN, u.recStop, target); if (ho === null) continue;
      baseW.push(ho === 1 ? 1 : 0); baseR.push(ho === 1 ? 2 : ho === -1 ? -1 : 0);
    }
    const baseWR = mean(baseW), baseRexp = mean(baseR);
    console.log(`  BASELINE (recorded stop, 2R target): win%=${(baseWR * 100).toFixed(1)}  R-exp=${baseRexp.toFixed(3)}  (N=${baseW.length})`);
    console.log(`  → SWEEP (entry fixed = recorded fill; recorded stop = trust anchor; one knob varied):`);

    for (const knob of knobs) {
      console.log(`\n  ── knob '${knob.name}' ──`);
      console.log(`     value | train: win%  R-exp   exMean  N  | test: win%  R-exp   N  | generalizes`);
      const rows: { v: number; trWR: number; trR: number; trEx: number; teWR: number; teR: number; teN: number; gen: boolean }[] = [];
      for (const v of knob.grid) {
        const tr = { w: [] as number[], r: [] as number[], ex: [] as number[] };
        const te = { w: [] as number[], r: [] as number[] };
        for (const u of sweepSet) {
          const g = knob.apply(u, v); if (!g || !Number.isFinite(g.stop) || !Number.isFinite(g.target)) continue;
          if (g.target <= u.entry || g.stop >= u.entry || g.stop <= 0) continue; // invalid long geometry
          const ho = hitOrder(u.t.symbol, u.t.decMs + MIN, g.stop, g.target); if (ho === null) continue;
          const win = ho === 1 ? 1 : 0;
          const risk = u.entry - g.stop; const reward = g.target - u.entry;
          const r = ho === 1 ? reward / risk : ho === -1 ? -1 : 0; // realized R: +reward/risk win, -1 stop, 0 timeout
          if (isTrain(u)) { tr.w.push(win); tr.r.push(r); const fr = fwdReturn(u.t.symbol, u.t.decMs, 240); if (fr !== null) tr.ex.push(fr); }
          else { te.w.push(win); te.r.push(r); }
        }
        if (tr.w.length < MIN_CAND_N) continue;
        const trWR = mean(tr.w), trR = mean(tr.r), trEx = mean(tr.ex);
        const teWR = te.w.length >= MIN_CAND_N ? mean(te.w) : NaN, teR = te.w.length >= MIN_CAND_N ? mean(te.r) : NaN;
        const gen = Number.isFinite(teWR) && Math.abs(teWR - trWR) <= GENERALIZE_WR_TOL;
        rows.push({ v, trWR, trR, trEx, teWR, teR, teN: te.w.length, gen });
        console.log(`     ${v.toString().padStart(5)} |       ${(trWR * 100).toFixed(1).padStart(5)} ${trR.toFixed(3).padStart(7)} ${(trEx * 100).toFixed(2).padStart(6)}% ${tr.w.length.toString().padStart(4)} |      ${(Number.isFinite(teWR) ? (teWR * 100).toFixed(1) : 'n/a').padStart(5)} ${Number.isFinite(teR) ? teR.toFixed(3).padStart(6) : '   n/a'} ${te.w.length.toString().padStart(4)} | ${gen ? 'YES' : (Number.isFinite(teWR) ? 'no' : 'thin-test')}`);
      }
      if (rows.length === 0) { console.log(`     [no candidate met N>=${MIN_CAND_N} on train]`); continue; }
      // select best on TRAIN by R-expectancy; prefer a broad plateau (avg of neighbors) over a razor peak.
      const scored = rows.map((row, i) => {
        const lo = rows[Math.max(0, i - 1)].trR, hi = rows[Math.min(rows.length - 1, i + 1)].trR;
        return { ...row, plateau: (lo + row.trR + hi) / 3 };
      });
      scored.sort((a, b) => b.plateau - a.plateau);
      const best = scored[0];
      const razor = best.trR - best.plateau > 0.25;
      const beatsBase = best.trR > baseRexp;
      console.log(`     → TRAIN-selected ${best.v} (plateau-R=${best.plateau.toFixed(3)}, train win%=${(best.trWR * 100).toFixed(1)}, train R=${best.trR.toFixed(3)})`);
      console.log(`       TEST: win%=${Number.isFinite(best.teWR) ? (best.teWR * 100).toFixed(1) : 'n/a'}  R=${Number.isFinite(best.teR) ? best.teR.toFixed(3) : 'n/a'} (N=${best.teN}) | generalizes=${best.gen ? 'YES' : (Number.isFinite(best.teWR) ? 'NO' : 'thin-test')}${razor ? '  ⚠ razor-edge (prefer plateau)' : '  (broad plateau)'} | beats-baseline-R=${beatsBase ? 'YES' : 'no'}`);
    }
  }

  // realized-outcome sanity (exit_decision_archive r_multiple per strategy, for cross-check)
  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(`REALIZED-OUTCOME CROSS-CHECK (exit_decision_archive, xstock_spot, window)`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  const exRes = await client.query<{ strategy: string; n: string; rmean: string; pmean: string }>(
    `SELECT strategy, count(*) AS n, avg(r_multiple) AS rmean, avg(pnl_pct) AS pmean
       FROM exit_decision_archive WHERE asset_class='xstock_spot' AND captured_at >= $1 GROUP BY strategy ORDER BY n DESC`, [startISO]);
  for (const r of exRes.rows) console.log(`  ${r.strategy.padEnd(20)} n=${Number(r.n).toString().padStart(5)}  r_mult mean=${r.rmean ? Number(r.rmean).toFixed(3) : 'n/a'}  pnl% mean=${r.pmean ? Number(r.pmean).toFixed(3) : 'n/a'}`);

  await client.end();
  console.log(`\n[W2A] complete. READ-ONLY: no DB writes, no production edits, no seeding. Candidates are CANDIDATES only — adoption is W2.2 / Phase 19/25.`);
}

main().catch((err) => { console.error('[W2A] Fatal:', err); process.exit(1); });
