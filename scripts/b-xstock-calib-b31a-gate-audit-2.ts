#!/usr/bin/env tsx
/**
 * B3.1a — xStock Strategy-Gate Correctness Audit Engine (CHUNK 2: L2 + cross-cutting checks)
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Companion to b-xstock-calib-b31a-gate-audit.ts (CHUNK 1 = L1 pure-filter strategies).
 * CHUNK 2 covers everything CHUNK 1 deferred (B_3_1_SCOPE.md §8 Langston conditions):
 *
 *   A. L2 (entry-conditional strategies) — the 8 strategies whose gate is upstream of a
 *      conditional entry: vwap_pullback, vwap_bounce, breakout, range_trade, inside_bar_reversal,
 *      morning_star, pivot_shift (+ abcd_long is DISABLED for xstock_spot → skipped live).
 *      Rejected candidates have no entry price, so per Langston #4 we use L2:
 *        - REACHED-GATE bucketing via the per-strategy detect-code gate ORDER (extracted from
 *          source) + the terminal reject reason. passed-G = cleared G (admitted/downstream OR
 *          failed a LATER gate); rejected-at-G = terminal reason == G; excluded = failed earlier.
 *        - ENDPOINT EXCESS RETURN AUC (Langston #1, PRIMARY): entry=open(min+1), exit=close(min+1+H),
 *          minus the cross-sectional universe base rate over the same window. AUC(passed>rejected).
 *        - L2 HIT-ORDERING (Langston #5, path-dependency): reconstruct entry(min+1) + a
 *          STANDARDIZED stop/target geometry applied IDENTICALLY to passed & rejected (isolates
 *          the GATE's signal from per-strategy geometry noise — the absolute win-rate is not a
 *          P&L claim; the passed-vs-rejected DIFFERENCE is the correctness signal). Two geometries:
 *          (a) ATR-based 1R:2R using production-faithful 60m ATR-14; (b) percent 0.5%:1.0%.
 *        - VERDICT = per-day rolling consistency (Langston #6).
 *
 *   B. DEPTH-DELTA VALIDATION (Langston Q4 — validate-or-remove). The per-bar OHLC `volume` is
 *      UNDERLYING-EQUITY volume (confirmed: ws-equities OHLC channel, ~$6.8B/day on SPY vs <$1M/24h
 *      token market). Candidate honest replacement = top-of-book depth movement from ticker_snap
 *      (bid_qty/ask_qty). Test depth-delta's OWN discrimination: does high depth-delta at decision
 *      time predict better forward excess return? AUC≈0.5 ⇒ no signal ⇒ REMOVE volume-confirmation
 *      (NO-PATCHES) rather than adopt it.
 *
 *   C. PATTERN-SHAPE DIAGNOSIS (Langston Q5b — scopes B3.1d). ~1.6M no_pattern across morning_star
 *      + pivot_shift (both gate on the MORNING_STAR shape) + 228K inside_bar (INSIDE_BAR shape).
 *      Replicate the production recognizer (pattern-recognizer.ts detectMorningStar:321 / detectInsideBar:238)
 *      on the live 60m bars. Decompose: is no_pattern driven by the SHAPE never appearing
 *      (under-production → recognizer/inputs) or by a too-strict quality threshold? NB: MORNING_STAR
 *      strength = min(1, 0.7+…) is ALWAYS ≥0.7 > the 0.55/0.50 weak_pattern gates → if true, the
 *      quality gate is NON-BINDING and the whole block is shape-availability. The engine confirms.
 *
 *   D. CHECK-2 METRIC-SANITY overlays. For the recomputable gate metrics (VWAP-distance for the
 *      price_position gates; RSI for the indicator_filter gates) dump the live xStock distribution
 *      percentiles and overlay the threshold — is the threshold at a defensible point of the REAL
 *      distribution, or a crypto level prices rarely reach?
 *
 * DISPOSITION: offline diagnostic, READ-ONLY. No deploy. Run on staging (has DATABASE_URL):
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env && set +a && npx tsx scripts/b-xstock-calib-b31a-gate-audit-2.ts'"
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
const { Client } = pg;

const WINDOW_DAYS = 7;
const HORIZONS_MIN = [60, 240]; // 1h, 4h endpoint horizons
const L2_MAX_HOLD_MIN = 240;    // hit-ordering walk cap
const MIN_BUCKET_N = 30;        // skip a cell with too few in either bucket
const MIN = 60_000;             // ms/min

// ── Per-strategy detect-code gate ORDER (source-extracted) + the target gates to audit.
//    `order` lists the strategy_internal terminal reasons in detection order (earliest→latest).
//    insufficient_data is treated as pre-gate (earlier than everything). Inert DBS exclusion
//    gates (never fire for xStock: DBS synthesized neutral 0) are omitted.
interface StratSpec { order: string[]; gates: string[]; }
const ENTRY_CONDITIONAL: Record<string, StratSpec> = {
  vwap_pullback:       { order: ['insufficient_data', 'price_position', 'target_validation'], gates: ['price_position'] },
  vwap_bounce:         { order: ['insufficient_data', 'indicator_filter', 'price_position'], gates: ['price_position'] },
  breakout:            { order: ['insufficient_data', 'range_not_found', 'breakout_fail'], gates: ['range_not_found', 'breakout_fail'] },
  range_trade:         { order: ['insufficient_data', 'range_not_found', 'price_position'], gates: ['range_not_found'] },
  inside_bar_reversal: { order: ['insufficient_data', 'no_pattern', 'breakout_fail', 'sell_disabled_long_only', 'volume_insufficient', 'indicator_filter', 'guard_fail'], gates: ['no_pattern', 'breakout_fail'] },
  morning_star:        { order: ['insufficient_data', 'no_pattern', 'weak_pattern', 'guard_fail'], gates: ['no_pattern'] },
  pivot_shift:         { order: ['insufficient_data', 'no_pattern', 'weak_pattern', 'indicator_filter', 'volume_insufficient', 'guard_fail'], gates: ['no_pattern', 'indicator_filter', 'volume_insufficient'] },
};

// ── 1m bar store: symbol → Map<minuteEpoch, [o,h,l,c]> ───────────────────────
type Bar = [number, number, number, number]; // o,h,l,c
const bars = new Map<string, Map<number, Bar>>();
function barAt(symbol: string, minuteMs: number): Bar | undefined { return bars.get(symbol)?.get(minuteMs); }

// ── 60m snapshot store: symbol → sorted array of {ts,o,h,l,c} for ATR + pattern replication
interface Bar60 { ts: number; o: number; h: number; l: number; c: number; }
const bars60 = new Map<string, Bar60[]>();

// ── ticker depth store: symbol → sorted array of {ts, depthUsd} (top-of-book two-sided USD)
interface Depth { ts: number; usd: number; }
const depth = new Map<string, Depth[]>();

// forward endpoint return: ENTRY=open(min+1), EXIT=close(min+1+H). Session-clip: both bars exist.
function fwdReturn(symbol: string, decisionMinMs: number, horizonMin: number): number | null {
  const entry = barAt(symbol, decisionMinMs + MIN);
  const exit = barAt(symbol, decisionMinMs + MIN + horizonMin * MIN);
  if (!entry || !exit || entry[0] <= 0) return null;
  return (exit[3] - entry[0]) / entry[0];
}

// universe base rate (cross-sectional mean fwd return over same window) for excess de-meaning.
const universeCache = new Map<string, number | null>();
let allSymbols: string[] = [];
function universeBaseRate(decisionMinMs: number, horizonMin: number): number | null {
  const key = `${decisionMinMs}:${horizonMin}`;
  const c = universeCache.get(key);
  if (c !== undefined) return c;
  let sum = 0, n = 0;
  for (const s of allSymbols) { const r = fwdReturn(s, decisionMinMs, horizonMin); if (r !== null && Number.isFinite(r)) { sum += r; n++; } }
  const base = n >= 5 ? sum / n : null;
  universeCache.set(key, base);
  return base;
}

// production-faithful 60m ATR-14 (simple TR average, computeATR style) ending at/before decision.
function atrAt(symbol: string, decisionMs: number): { atr: number; close: number } | null {
  const arr = bars60.get(symbol);
  if (!arr || arr.length < 15) return null;
  // last index with ts <= decisionMs
  let hi = -1;
  for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].ts <= decisionMs) { hi = i; break; } }
  if (hi < 14) return null;
  let trSum = 0;
  for (let i = hi - 13; i <= hi; i++) {
    const cur = arr[i], prev = arr[i - 1];
    const tr = Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));
    trSum += tr;
  }
  return { atr: trSum / 14, close: arr[hi].c };
}

// L2 hit-ordering on 1m bars: returns +1 (target first / win), -1 (stop first / loss), 0 (timeout).
// Conservative tie-break: if a single bar's range spans BOTH stop and target, count stop first.
function hitOrder(symbol: string, entryMinMs: number, entry: number, stop: number, target: number): -1 | 0 | 1 | null {
  const bm = bars.get(symbol);
  if (!bm) return null;
  let t = entryMinMs;
  const end = entryMinMs + L2_MAX_HOLD_MIN * MIN;
  let stepped = false;
  for (; t <= end; t += MIN) {
    const b = bm.get(t);
    if (!b) { if (!stepped) continue; break; }  // gap after we started ⇒ session clip (timeout)
    stepped = true;
    const [, h, l] = b;
    if (l <= stop) return -1;       // stop hit (checked first = conservative)
    if (h >= target) return 1;      // target hit
  }
  return 0;                          // neither within hold ⇒ timeout (treated as no-win)
}

// ── Stats ────────────────────────────────────────────────────────────────────
function aucMannWhitney(passed: number[], rejected: number[]): number {
  const n1 = passed.length, n2 = rejected.length;
  if (n1 === 0 || n2 === 0) return NaN;
  const tagged = passed.map((v) => ({ v, g: 1 })).concat(rejected.map((v) => ({ v, g: 0 })));
  tagged.sort((a, b) => a.v - b.v);
  const ranks = new Array(tagged.length);
  let i = 0;
  while (i < tagged.length) {
    let j = i; while (j + 1 < tagged.length && tagged[j + 1].v === tagged[i].v) j++;
    const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) ranks[k] = avg; i = j + 1;
  }
  let R1 = 0; for (let k = 0; k < tagged.length; k++) if (tagged[k].g === 1) R1 += ranks[k];
  return (R1 - (n1 * (n1 + 1)) / 2) / (n1 * n2);
}
function median(a: number[]): number { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function mean(a: number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pctl(a: number[], p: number): number { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function dayKey(tsMs: number): string { return new Date(tsMs).toISOString().slice(0, 10); }

// Wilder RSI-14 from an array of closes (production calculateRSI semantics).
function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - 14; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  const ag = gain / 14, al = loss / 14;
  if (al === 0) return 100;
  const rs = ag / al; return 100 - 100 / (1 + rs);
}

interface Cand { symbol: string; tsMs: number; stage: string; reason: string | null; }

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const maxRes = await client.query<{ max: string }>(`SELECT max(interval_begin) AS max FROM xstock_spot_ohlc_1m`);
  const maxMs = new Date(maxRes.rows[0].max).getTime();
  const startMs = maxMs - WINDOW_DAYS * 86_400_000;
  const startISO = new Date(startMs).toISOString(), maxISO = new Date(maxMs).toISOString();
  console.log(`[B31A-2] window ${startISO} → ${maxISO}  (${WINDOW_DAYS}d)`);

  // 1m bars (o,h,l,c)
  console.log('[B31A-2] loading 1m bars…');
  const barRes = await client.query<{ symbol: string; interval_begin: string; open: string; high: string; low: string; close: string }>(
    `SELECT symbol, interval_begin, open, high, low, close FROM xstock_spot_ohlc_1m
      WHERE interval_begin >= $1 AND interval_begin <= $2`, [startISO, maxISO]);
  for (const r of barRes.rows) {
    const m = Math.floor(new Date(r.interval_begin).getTime() / MIN) * MIN;
    let bm = bars.get(r.symbol); if (!bm) { bm = new Map(); bars.set(r.symbol, bm); }
    bm.set(m, [Number(r.open), Number(r.high), Number(r.low), Number(r.close)]);
  }
  allSymbols = [...bars.keys()];
  console.log(`[B31A-2] ${barRes.rows.length.toLocaleString()} 1m bars, ${allSymbols.length} symbols`);

  // 60m snapshots (for ATR + pattern replication) — load a touch before window for ATR warmup.
  const warmISO = new Date(startMs - 3 * 86_400_000).toISOString();
  const b60Res = await client.query<{ symbol: string; bucket_ts: string; open: string; high: string; low: string; close: string }>(
    `SELECT symbol, bucket_ts, open, high, low, close FROM xstock_spot_ohlc_60m_snapshot
      WHERE bucket_ts >= $1 AND bucket_ts <= $2 ORDER BY symbol, bucket_ts`, [warmISO, maxISO]);
  for (const r of b60Res.rows) {
    let a = bars60.get(r.symbol); if (!a) { a = []; bars60.set(r.symbol, a); }
    a.push({ ts: new Date(r.bucket_ts).getTime(), o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close) });
  }
  console.log(`[B31A-2] ${b60Res.rows.length.toLocaleString()} 60m snapshot bars, ${bars60.size} symbols`);

  // ticker depth (per-symbol per-minute last snap → two-sided top-of-book USD)
  const depRes = await client.query<{ symbol: string; minute: string; bid: string; ask: string; bid_qty: string; ask_qty: string }>(
    `SELECT DISTINCT ON (symbol, date_trunc('minute', captured_at))
            symbol, date_trunc('minute', captured_at) AS minute, bid, ask, bid_qty, ask_qty
       FROM xstock_spot_ticker_snap
      WHERE captured_at >= $1 AND captured_at <= $2
      ORDER BY symbol, date_trunc('minute', captured_at), captured_at DESC`, [startISO, maxISO]);
  for (const r of depRes.rows) {
    const usd = Number(r.bid) * Number(r.bid_qty) + Number(r.ask) * Number(r.ask_qty);
    if (!Number.isFinite(usd)) continue;
    let a = depth.get(r.symbol); if (!a) { a = []; depth.set(r.symbol, a); }
    a.push({ ts: new Date(r.minute).getTime(), usd });
  }
  console.log(`[B31A-2] ${depRes.rows.length.toLocaleString()} per-minute depth snaps, ${depth.size} symbols`);

  // realized VTS exits (admit cross-check)
  const exitRes = await client.query<{ strategy: string; r_multiple: string | null; pnl_pct: string | null }>(
    `SELECT strategy, r_multiple, pnl_pct FROM exit_decision_archive WHERE asset_class='xstock_spot' AND captured_at >= $1`, [startISO]);
  const realized = new Map<string, { r: number[]; p: number[] }>();
  for (const r of exitRes.rows) {
    let e = realized.get(r.strategy); if (!e) { e = { r: [], p: [] }; realized.set(r.strategy, e); }
    if (r.r_multiple != null && Number.isFinite(Number(r.r_multiple))) e.r.push(Number(r.r_multiple));
    if (r.pnl_pct != null && Number.isFinite(Number(r.pnl_pct))) e.p.push(Number(r.pnl_pct));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // A. ENTRY-CONDITIONAL STRATEGIES — L2 + endpoint excess-return AUC
  // ════════════════════════════════════════════════════════════════════════════
  for (const [strategy, spec] of Object.entries(ENTRY_CONDITIONAL)) {
    const candRes = await client.query<{ symbol: string; captured_at: string; reject_stage: string; reason: string | null }>(
      `SELECT DISTINCT ON (symbol, date_trunc('minute', captured_at))
              symbol, captured_at, reject_stage,
              COALESCE(gate_decision->>'reason', features->>'detailReason') AS reason
         FROM signal_eval_archive
        WHERE asset_class='xstock_spot' AND strategy=$1 AND captured_at >= $2 AND captured_at <= $3
        ORDER BY symbol, date_trunc('minute', captured_at), captured_at DESC`, [strategy, startISO, maxISO]);
    const cands: Cand[] = candRes.rows.map((r) => ({ symbol: r.symbol, tsMs: Math.floor(new Date(r.captured_at).getTime() / MIN) * MIN, stage: r.reject_stage, reason: r.reason }));

    console.log(`\n══════════════════════════════════════════════════════════════════`);
    console.log(`ENTRY-CONDITIONAL — ${strategy}   (n=${cands.length} reached-strategy candidates)`);
    console.log(`══════════════════════════════════════════════════════════════════`);

    for (const gate of spec.gates) {
      const gi = spec.order.indexOf(gate);
      // bucket: passed-G vs rejected-at-G vs excluded(earlier)
      const passed: Cand[] = [], rejected: Cand[] = [];
      for (const c of cands) {
        if (c.stage !== 'strategy_internal') { passed.push(c); continue; } // admitted/tcl/sqe/rtb cleared all gates
        const ri = c.reason ? spec.order.indexOf(c.reason) : -1;
        if (ri === -1) continue;          // unknown reason (e.g. inert dbs) → skip
        if (ri < gi) continue;            // failed earlier → didn't reach G
        if (ri === gi) rejected.push(c);  // rejected AT G
        else passed.push(c);              // failed later → passed G
      }
      console.log(`\n  ── gate '${gate}'  (passed-G=${passed.length}  rejected-at-G=${rejected.length}) ──`);
      if (passed.length < MIN_BUCKET_N || rejected.length < MIN_BUCKET_N) {
        console.log(`     [LOW-N] one bucket < ${MIN_BUCKET_N}; not decision-grade.`);
      }

      // A1. endpoint excess-return AUC (PRIMARY)
      for (const H of HORIZONS_MIN) {
        const exP: number[] = [], exR: number[] = [];
        const perDay = new Map<string, { p: number[]; r: number[] }>();
        for (const c of [...passed, ...rejected]) {
          const raw = fwdReturn(c.symbol, c.tsMs, H); if (raw === null) continue;
          const base = universeBaseRate(c.tsMs, H); if (base === null) continue;
          const ex = raw - base; const isP = passed.includes(c);
          (isP ? exP : exR).push(ex);
          const dk = dayKey(c.tsMs); let d = perDay.get(dk); if (!d) { d = { p: [], r: [] }; perDay.set(dk, d); }
          (isP ? d.p : d.r).push(ex);
        }
        const auc = aucMannWhitney(exP, exR);
        const dayAucs = [...perDay.keys()].sort().map((dk) => { const d = perDay.get(dk)!; return (d.p.length < MIN_BUCKET_N || d.r.length < MIN_BUCKET_N) ? `${dk.slice(5)}:n/a` : `${dk.slice(5)}:${aucMannWhitney(d.p, d.r).toFixed(2)}`; });
        console.log(`     [endpoint H=${H}m] excess mean P=${(mean(exP) * 100).toFixed(2)}% R=${(mean(exR) * 100).toFixed(2)}% | med P=${(median(exP) * 100).toFixed(2)}% R=${(median(exR) * 100).toFixed(2)}% | AUC=${auc.toFixed(3)} | rejected-abs-excess=${(mean(exR) * 100).toFixed(2)}%`);
        console.log(`        per-day AUC: ${dayAucs.join(' ')}`);
      }

      // A2. L2 hit-ordering — two standardized geometries applied identically to both buckets
      for (const geom of ['atr1to2', 'pct0.5to1'] as const) {
        const winsP: number[] = [], winsR: number[] = [];
        for (const c of [...passed, ...rejected]) {
          const entryBar = barAt(c.symbol, c.tsMs + MIN); if (!entryBar) continue;
          const entry = entryBar[0]; if (entry <= 0) continue;
          let stop: number, target: number;
          if (geom === 'atr1to2') {
            const a = atrAt(c.symbol, c.tsMs); if (!a || a.atr <= 0) continue;
            stop = entry - a.atr; target = entry + 2 * a.atr;
          } else { stop = entry * 0.995; target = entry * 1.01; }
          const ho = hitOrder(c.symbol, c.tsMs + MIN, entry, stop, target); if (ho === null) continue;
          const win = ho === 1 ? 1 : 0;
          (passed.includes(c) ? winsP : winsR).push(win);
        }
        const wrP = mean(winsP), wrR = mean(winsR);
        const aucW = aucMannWhitney(winsP, winsR);
        console.log(`     [L2 ${geom}] target-first win%: passed=${(wrP * 100).toFixed(1)}% (n=${winsP.length})  rejected=${(wrR * 100).toFixed(1)}% (n=${winsR.length})  AUC=${aucW.toFixed(3)}`);
      }
    }

    const rz = realized.get(strategy);
    console.log(`\n  realized VTS exits (strategy-level, all exits): ${rz && rz.r.length ? `n=${rz.r.length} r_mult mean=${mean(rz.r).toFixed(3)} med=${median(rz.r).toFixed(3)} pnl% mean=${mean(rz.p).toFixed(3)}` : 'none in window'}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B. DEPTH-DELTA VALIDATION (validate-or-remove)
  // ════════════════════════════════════════════════════════════════════════════
  console.log(`\n\n══════════════════════════════════════════════════════════════════`);
  console.log(`B. DEPTH-DELTA discrimination (honest token-volume replacement candidate)`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  // depth-delta at a minute = (depthUsd_now - depthUsd_15m_ago) / depthUsd_15m_ago.
  // Sample decision minutes = every minute we have a 1m bar + depth for a symbol, strided to bound cost.
  function depthAt(symbol: string, tsMs: number): number | null {
    const a = depth.get(symbol); if (!a) return null;
    // nearest depth snap at/before tsMs within 5 min
    let best: number | null = null;
    for (let i = a.length - 1; i >= 0; i--) { if (a[i].ts <= tsMs && tsMs - a[i].ts <= 5 * MIN) { best = a[i].usd; break; } if (a[i].ts < tsMs - 5 * MIN) break; }
    return best;
  }
  for (const H of HORIZONS_MIN) {
    const ddVals: { dd: number; ex: number }[] = [];
    for (const s of allSymbols) {
      const bm = bars.get(s)!;
      for (const m of bm.keys()) {
        if (m % (15 * MIN) !== 0) continue;           // stride: 1 sample / 15min / symbol
        const now = depthAt(s, m), past = depthAt(s, m - 15 * MIN);
        if (now === null || past === null || past <= 0) continue;
        const dd = (now - past) / past;
        const raw = fwdReturn(s, m, H); if (raw === null) continue;
        const base = universeBaseRate(m, H); if (base === null) continue;
        ddVals.push({ dd, ex: raw - base });
      }
    }
    if (ddVals.length < 4 * MIN_BUCKET_N) { console.log(`  H=${H}m: depth coverage too thin (n=${ddVals.length}).`); continue; }
    ddVals.sort((a, b) => a.dd - b.dd);
    const tier = Math.floor(ddVals.length / 3);
    const bottom = ddVals.slice(0, tier).map((x) => x.ex);
    const top = ddVals.slice(ddVals.length - tier).map((x) => x.ex);
    const auc = aucMannWhitney(top, bottom);
    console.log(`  H=${H}m | n=${ddVals.length} | top-depth-delta tercile excess mean=${(mean(top) * 100).toFixed(2)}% vs bottom=${(mean(bottom) * 100).toFixed(2)}% | AUC(top>bottom)=${auc.toFixed(3)}  (≈0.5 ⇒ no signal ⇒ REMOVE volume-confirm; >0.55 ⇒ depth-delta has edge ⇒ viable replacement)`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // C. PATTERN-SHAPE DIAGNOSIS (MORNING_STAR + INSIDE_BAR base rate vs quality threshold)
  // ════════════════════════════════════════════════════════════════════════════
  console.log(`\n\n══════════════════════════════════════════════════════════════════`);
  console.log(`C. PATTERN-SHAPE diagnosis — under-production vs too-strict quality`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  let msTriples = 0, msShape = 0; const msStrength: number[] = [];
  let ibPairs = 0, ibShape = 0; const ibStrength: number[] = []; let ibCompPass = 0;
  for (const [, arr] of bars60) {
    for (let i = 2; i < arr.length; i++) {
      const c1 = arr[i - 2], c2 = arr[i - 1], c3 = arr[i];
      msTriples++;
      // detectMorningStar replica
      const c1Bear = c1.c < c1.o, c1Body = Math.abs(c1.c - c1.o), c1Range = c1.h - c1.l;
      const c2Body = Math.abs(c2.c - c2.o), c2Range = c2.h - c2.l;
      const c3Bull = c3.c > c3.o; const c1Mid = (c1.o + c1.c) / 2;
      if (c1Bear && c1Range > 0 && c1Body / c1Range >= 0.3 && !(c2Range > 0 && c2Body / c2Range > 0.3) && c3Bull && c3.c > c1Mid) {
        msShape++;
        const hasGap = c2.h < c1.c; const recovery = c1Body > 0 ? Math.abs(c3.c - c3.o) / c1Body : 0;
        msStrength.push(Math.min(1, 0.7 + Math.min(0.2, recovery * 0.1) + (hasGap ? 0.1 : 0)));
      }
    }
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1], cur = arr[i];
      ibPairs++;
      const tol = 0.001;
      if (cur.h < prev.h * (1 + tol) && cur.l > prev.l * (1 - tol)) {
        ibShape++;
        const prevR = prev.h - prev.l, curR = cur.h - cur.l; const comp = prevR > 0 ? curR / prevR : 0;
        ibStrength.push(Math.min(1, 0.6 + (1 - comp) * 0.3));
        if (comp <= 0.85) ibCompPass++;  // IB_MAX_COMPRESSION gate
      }
    }
  }
  console.log(`  MORNING_STAR: ${msShape} shapes / ${msTriples.toLocaleString()} bar-triples = ${(100 * msShape / Math.max(1, msTriples)).toFixed(3)}% base rate`);
  console.log(`    strength when present: min=${pctl(msStrength, 0).toFixed(3)} med=${median(msStrength).toFixed(3)} max=${pctl(msStrength, 0.999).toFixed(3)} | %≥0.55 (weak_pattern gate)=${(100 * msStrength.filter((s) => s >= 0.55).length / Math.max(1, msStrength.length)).toFixed(1)}%  ⇒ if 100%, the quality gate is NON-BINDING (no_pattern = shape availability)`);
  console.log(`  INSIDE_BAR: ${ibShape} shapes / ${ibPairs.toLocaleString()} bar-pairs = ${(100 * ibShape / Math.max(1, ibPairs)).toFixed(3)}% base rate | of shapes, %passing compression≤0.85 = ${(100 * ibCompPass / Math.max(1, ibShape)).toFixed(1)}%`);

  // ════════════════════════════════════════════════════════════════════════════
  // D. CHECK-2 METRIC-SANITY overlays (recomputable metrics vs threshold)
  // ════════════════════════════════════════════════════════════════════════════
  console.log(`\n\n══════════════════════════════════════════════════════════════════`);
  console.log(`D. CHECK-2 metric distributions vs gate thresholds (live 60m bars)`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  // VWAP-distance proxy: |close - SMA20|/SMA20 per 60m bar (VWAP unavailable in snapshot; SMA20 = mean-reversion anchor proxy)
  // RSI-14 distribution (indicator_filter gates: pivot_shift 35–65 neutral band reject; mean_reversion oversold)
  const rsiVals: number[] = [];
  for (const [, arr] of bars60) {
    const closes = arr.map((b) => b.c);
    for (let i = 15; i < closes.length; i++) { const r = rsi14(closes.slice(0, i + 1)); if (r !== null) rsiVals.push(r); }
  }
  console.log(`  RSI-14 across live 60m bars (n=${rsiVals.length.toLocaleString()}): p5=${pctl(rsiVals, 0.05).toFixed(1)} p25=${pctl(rsiVals, 0.25).toFixed(1)} med=${median(rsiVals).toFixed(1)} p75=${pctl(rsiVals, 0.75).toFixed(1)} p95=${pctl(rsiVals, 0.95).toFixed(1)}`);
  console.log(`    pivot_shift neutral-band reject = RSI<35 OR >65 → keeps ${(100 * rsiVals.filter((r) => r >= 35 && r <= 65).length / Math.max(1, rsiVals.length)).toFixed(1)}% of bars in the 35–65 admit band`);
  console.log(`    (overlay: is the 35–65 band where xStock RSI actually lives, or a crypto-tuned window? p25–p75 above is the real mass.)`);

  await client.end();
  console.log('\n[B31A-2] CHUNK 2 complete. Verdict rules: gate "wrong" only on CONSISTENT cross-day AUC failure (≈0.5 ⇒ no discrimination; <0.45 ⇒ inverted). Depth-delta adopted only if its own AUC>0.55. Pattern: if MORNING_STAR base rate ≪ expected AND quality gate non-binding ⇒ under-production (B3.1d = recognizer/inputs, not threshold-loosening).');
}

main().catch((err) => { console.error('[B31A-2] Fatal:', err); process.exit(1); });
