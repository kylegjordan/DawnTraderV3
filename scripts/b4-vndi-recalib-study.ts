#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B.4 FOUNDATION — xStock VN/DI (IMF SCREEN) RECALIBRATION STUDY (READ-ONLY)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Question (B.4 foundation, 60m→15m bar switch): the per-family IMF screen
 * thresholds in `screener_filters` for asset_class='xstock_spot' — `vn_max`
 * (an UPPER cutoff on Volatility-Noise) and the `di_min`/`di_max` band on
 * Directional-Integrity — were cloned from the crypto baseline and have only
 * ever been evaluated against the 60-MINUTE input distribution. VN and DI are
 * BOTH FULL-ARRAY statistics (computed over the WHOLE trailing window the IMF
 * feeds them — VN = MAD/median of absolute log-returns over the array, DI =
 * Σ(Δclose)/Σ|Δclose| over the array). At 15-minute bars the live IMF feeds an
 * array that spans the SAME wall-clock (~60h) but is ~4× LONGER in bar count
 * (240 bars vs 60). A different-length array of the same wall-clock data lands
 * VN and DI at DIFFERENT magnitudes, so the SAME numeric cutoffs sit at
 * DIFFERENT percentiles of the 15m distribution → the IMF screen silently
 * admits/rejects a different fraction of xStock pairs.
 *
 * This study is the VN/DI parallel to the (already-done, parity-passed) regime-
 * threshold recalibration study. It produces the numbers Kyle needs to RE-CENTER
 * the IMF vn_max / di_min / di_max for 15m, plus a percentile-preserving
 * CANDIDATE for each threshold edge. It does NOT derive finals, does NOT write,
 * does NOT touch screener_filters or any seed.
 *
 * It produces:
 *   (a) percentile tables (p1..p99) of VN and DI at BOTH 15m and 60m, raw N shown;
 *   (b) for each current threshold edge (vn_max per family; di_min + di_max per
 *       family), its percentile RANK on the 60m distribution + the 15m value at
 *       that SAME percentile = the percentile-preserving CANDIDATE new 15m
 *       threshold. (vn_max = upper cutoff → preserve its rank. di_min/di_max
 *       bound a band → preserve EACH edge's rank independently.);
 *   (c) the 60m→15m SCALING direction + magnitude for VN and DI (median shift +
 *       distribution-wide ratio), to confirm/refute the "both shift because the
 *       15m array is ~4× longer per wall-clock" prediction empirically.
 *
 * ── PARITY / METHODOLOGY ────────────────────────────────────────────────────
 *  - Bars rebuilt from xstock_spot_ohlc_1m by DIRECT SQL bucket aggregation
 *    (epoch/900 for 15m, epoch/3600 for 60m), UNCAPPED over ALL history
 *    (o=first,h=max,l=min,c=last) — VERBATIM the regime study's loadFBars.
 *    Rule #13 (decision-grade): rolling distribution over all history, not a
 *    240-cap aggregator snapshot.
 *  - Each measured bar uses a TRAILING WINDOW that matches the LIVE IMF cache cap
 *    EXACTLY — this is the load-bearing parity input because VN and DI are
 *    full-array statistics over whatever array the IMF passes:
 *      • 15m: WINDOW_15M = 240 bars (= MAX_BARS_15M in ohlc-aggregator.ts:91;
 *        the array evaluateXstockFamilyIMF → calculateVolNoise/computeDirectional-
 *        Integrity receives at 15m).
 *      • 60m: WINDOW_60M = 60 bars (= MAX_BARS_60M in ohlc-aggregator.ts:84;
 *        the current-production array length).
 *    The aggregator returns the most-recent ≤N bars; the IMF computes VN/DI over
 *    that WHOLE array. We replicate by taking each trailing slice of exactly N
 *    bars (a full window) and running the SAME production functions over it.
 *  - VN via PRODUCTION `calculateVolNoise(window)` (imf-metrics.ts → analysis-
 *    utils canonical: |ln(close[i]/close[i-1])|, median, MAD, VN=MAD/max(median,
 *    1e-4), clamp [0,1]). Imported, not reimplemented.
 *  - DI via PRODUCTION `computeDirectionalIntegrity(window)` (the xStock IMF
 *    evaluator's own fn: netDelta=Σ(close[i]-close[i-1]), absDelta=Σ|...|,
 *    DI=(netDelta/absDelta)*50+50, clamp [0,100], min length 20). Exported from
 *    imf-evaluator.ts for this study (was module-private; export added, no
 *    behavior change — see EXPORT NOTE below).
 *  - A window is measured only when it is a FULL trailing window (exactly N bars).
 *    VN needs ≥3 closes (always true at N≥60); DI needs ≥20 (always true).
 *  - VN/DI are computed on the SAME bars the regime classifier reads (the same
 *    1m→Nm rebuild, same trailing-window cap), so the IMF screen and the regime
 *    classifier see a consistent substrate. NOTE the windows differ in LENGTH
 *    from some regime inputs only where the regime study used per-substrate
 *    lookbacks; VN/DI use the FULL cache-cap array (240/60) by construction,
 *    which is what the live IMF does. See UNCERTAINTY in the printed footer.
 *
 * ── SANITY ANCHORS (flag a likely bug if violated) ──────────────────────────
 *  - VN ∈ [0,1] by clamp; DI ∈ [0,100] by clamp. Any value outside ⇒ bug.
 *  - DI median should sit near 50 (balanced up/down tape over 60h); a DI median
 *    far from 50 (e.g. <35 or >65 system-wide) ⇒ suspect.
 *  - VN should be well under the cloned-from-crypto vn_max=0.95 for most bars
 *    (the crypto threshold was set high); a 15m VN p99 ABOVE 0.95 with a large
 *    fraction over it ⇒ either a real bar-sensitivity finding (report it) or a
 *    parity bug (cross-check the 60m panel first).
 *
 * ── DISPOSITION ─────────────────────────────────────────────────────────────
 *  READ-ONLY. No writes, no DDL. xStock-only. Zero production blast radius.
 *  Safe to re-invoke. Does NOT set thresholds — produces numbers + candidate map.
 *
 * ── EXPORT NOTE ─────────────────────────────────────────────────────────────
 *  `computeDirectionalIntegrity` in server/asset_classes/xstock_spot/imf-
 *  evaluator.ts was a module-private function. To compute DI with the EXACT
 *  production code (no reimplementation drift), this study imports it; a single
 *  `export` keyword was added to that function declaration. No call-site, no
 *  behavior, no signature change — purely makes the existing fn importable.
 *
 * Usage (on staging — has DATABASE_URL via .env):
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env && set +a && \
 *     npx tsx scripts/b4-vndi-recalib-study.ts 2>&1 | tee /tmp/b4_vndi_recalib.txt'"
 * ═════════════════════════════════════════════════════════════════════════════
 */

import pg from 'pg';
const { Client } = pg;
import { calculateVolNoise } from '../server/core/metrics/imf-metrics.js';
import { computeDirectionalIntegrity } from '../server/asset_classes/xstock_spot/imf-evaluator.js';
import type { OHLCData } from '../server/types/market-regime.types.js';

// ── Per-substrate trailing-window caps (= live IMF cache caps, exact parity) ──
const WINDOW_15M = 240; // = MAX_BARS_15M (ohlc-aggregator.ts:91) — the 15m IMF array length
const WINDOW_60M = 60;  // = MAX_BARS_60M (ohlc-aggregator.ts:84) — the current-prod IMF array length

// ── Current xStock IMF thresholds (screener_filters, asset_class='xstock_spot') ─
// DB-DERIVED at runtime (NO hardcoded list) — the seed file
// (drizzle/migrations/2026-05-11-b79-0m-a-xstock-family-imf-seeds.sql) cloned a
// PARTIAL set from crypto; the LIVE table has diverged (both vts_* and active_*
// path families exist under BOTH modes; extra vts_quant/vts_pattern rows; some
// rows are NULL/inert). Hardcoding would silently miss real rows or apply a
// stale value. Instead we enumerate EVERY live screener_filters row for
// asset_class='xstock_spot' with a non-null vn_max / di_min / di_max and emit
// one ThreshEdge per non-null edge. This is the "DB is the sole authority"
// invariant (Kyle directive) applied to the study itself. Each EDGE is mapped
// independently: vn_max = upper cutoff; di_min = lower band edge; di_max = upper
// band edge. The crypto baseline was never recalibrated for xStock at any bar
// size — that is exactly what this study informs.
interface ThreshEdge {
  family: string;   // filter_path
  mode: string;     // 'paper' | 'live' (whatever the row holds)
  metric: 'VN' | 'DI';
  edge: 'vn_max' | 'di_min' | 'di_max';
  value: number;    // the LIVE DB value
}

// ── Bar rebuild (direct SQL bucket aggregation, UNCAPPED) — VERBATIM regime study ─
interface FBar extends OHLCData { _ms: number; }
async function loadFBars(
  client: InstanceType<typeof Client>,
  symbol: string,
  bucketSeconds: number,
): Promise<FBar[]> {
  const r = await client.query<{
    bucket: string; open: string; high: string; low: string; close: string; volume: string;
  }>(
    `SELECT bucket,
            (array_agg(open  ORDER BY interval_begin ASC ))[1] AS open,
            max(high)                                          AS high,
            min(low)                                           AS low,
            (array_agg(close ORDER BY interval_begin DESC))[1] AS close,
            sum(volume)                                        AS volume
       FROM (
         SELECT (floor(extract(epoch FROM interval_begin) / $2)::bigint * $2) AS bucket,
                interval_begin, open, high, low, close, volume
           FROM xstock_spot_ohlc_1m
          WHERE symbol = $1
       ) s
      GROUP BY bucket
      ORDER BY bucket ASC`,
    [symbol, bucketSeconds],
  );
  return r.rows.map((row) => {
    const ms = Number(row.bucket) * 1000;
    return {
      timestamp: ms,
      _ms: ms,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    };
  });
}

// ── Quantile + percentile-rank helpers — VERBATIM regime study (parity) ──────
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return base + 1 < sorted.length ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}
// percentile RANK (fraction of values <= x), linear-interpolated. Inverse of quantile.
function pctRank(sorted: number[], x: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (x <= sorted[0]) return 0;
  if (x >= sorted[n - 1]) return 1;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < x) lo = mid + 1; else hi = mid; }
  const below = sorted[lo - 1];
  const at = sorted[lo];
  const frac = at === below ? 0 : (x - below) / (at - below);
  const pos = (lo - 1) + frac;
  return pos / (n - 1);
}
function median(sorted: number[]): number { return quantile(sorted, 0.5); }
function mean(arr: number[]): number { return arr.length === 0 ? NaN : arr.reduce((a, b) => a + b, 0) / arr.length; }

const PCTS = [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99];
function pctTable(label: string, arr: number[], dp: number): string {
  const s = [...arr].sort((a, b) => a - b);
  const cells = PCTS.map((q) => quantile(s, q).toFixed(dp).padStart(11)).join(' ');
  return `  ${label.padEnd(8)} (n=${String(arr.length).padStart(8)}) | ${cells}`;
}

// ── One substrate's full pass ────────────────────────────────────────────────
interface SubstrateResult {
  label: string;
  vn: number[];
  di: number[];
  symbolsUsed: number;
  totalFBars: number;
  totalWindows: number;
}
async function runSubstrate(
  client: InstanceType<typeof Client>,
  symbols: string[],
  opts: { label: string; bucketSeconds: number; windowBars: number },
): Promise<SubstrateResult> {
  const vn: number[] = [];
  const di: number[] = [];
  let symbolsUsed = 0;
  let totalFBars = 0;
  let totalWindows = 0;
  let processed = 0;

  for (const symbol of symbols) {
    const bars = await loadFBars(client, symbol, opts.bucketSeconds);
    totalFBars += bars.length;
    if (bars.length < opts.windowBars) { processed++; continue; }
    symbolsUsed++;

    // Every FULL trailing window of exactly windowBars bars (the live IMF array).
    for (let i = opts.windowBars - 1; i < bars.length; i++) {
      const window: OHLCData[] = bars.slice(i - opts.windowBars + 1, i + 1).map((b) => ({
        timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      }));
      // PRODUCTION functions — VN over closes, DI over closes, FULL array.
      const vnv = calculateVolNoise(window);
      const div = computeDirectionalIntegrity(window);
      vn.push(vnv);
      if (div !== null) di.push(div);
      totalWindows++;
    }
    processed++;
    if (processed % 50 === 0) {
      console.log(`[B4-VNDI] ${opts.label}: ${processed}/${symbols.length} symbols, ${totalWindows.toLocaleString()} windows measured`);
    }
  }
  return { label: opts.label, vn, di, symbolsUsed, totalFBars, totalWindows };
}

function printDistPanel(label: string, vn: number[], di: number[]): void {
  console.log(`\n  ── ${label} ──`);
  console.log(`  ${'metric'.padEnd(8)} ${''.padEnd(11)}  |${PCTS.map((q) => `p${Math.round(q * 100)}`.padStart(12)).join('')}`);
  console.log(pctTable('VN', vn, 6));
  console.log(pctTable('DI', di, 4));
  const svn = [...vn].sort((a, b) => a - b);
  const sdi = [...di].sort((a, b) => a - b);
  console.log(`  VN: min=${quantile(svn, 0).toFixed(6)}  max=${quantile(svn, 1).toFixed(6)}  mean=${mean(vn).toFixed(6)}  median=${median(svn).toFixed(6)}`);
  console.log(`  DI: min=${quantile(sdi, 0).toFixed(4)}  max=${quantile(sdi, 1).toFixed(4)}  mean=${mean(di).toFixed(4)}  median=${median(sdi).toFixed(4)}`);
}

function printScaling(r60: SubstrateResult, r15: SubstrateResult): void {
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`(c) 60m→15m SCALING — direction + magnitude of the VN/DI shift`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);
  console.log(`  Both VN and DI are FULL-ARRAY statistics; the 15m array (240 bars) spans the`);
  console.log(`  SAME ~60h wall-clock as the 60m array (60 bars) but is ~4× longer. Prediction`);
  console.log(`  from the earlier IMF investigation: both shift. Below = the empirical direction.\n`);
  const svn60 = [...r60.vn].sort((a, b) => a - b);
  const svn15 = [...r15.vn].sort((a, b) => a - b);
  const sdi60 = [...r60.di].sort((a, b) => a - b);
  const sdi15 = [...r15.di].sort((a, b) => a - b);
  const vnMed60 = median(svn60), vnMed15 = median(svn15);
  const diMed60 = median(sdi60), diMed15 = median(sdi15);
  console.log(`  metric | 60m median  15m median |  Δ (15m-60m) | ratio (15m/60m) | direction`);
  console.log(`  -------+------------------------+--------------+-----------------+-----------`);
  console.log(`  VN     | ${vnMed60.toFixed(6).padStart(10)}  ${vnMed15.toFixed(6).padStart(10)} | ${(vnMed15 - vnMed60 >= 0 ? '+' : '') + (vnMed15 - vnMed60).toFixed(6)} | ${(vnMed15 / vnMed60).toFixed(4).padStart(15)} | ${vnMed15 > vnMed60 ? 'VN RISES at 15m' : vnMed15 < vnMed60 ? 'VN FALLS at 15m' : 'flat'}`);
  console.log(`  DI     | ${diMed60.toFixed(4).padStart(10)}  ${diMed15.toFixed(4).padStart(10)} | ${(diMed15 - diMed60 >= 0 ? '+' : '') + (diMed15 - diMed60).toFixed(4)} | ${(diMed15 / diMed60).toFixed(4).padStart(15)} | ${diMed15 > diMed60 ? 'DI RISES at 15m' : diMed15 < diMed60 ? 'DI FALLS at 15m' : 'flat'}`);
  console.log(`\n  Per-percentile ratio (15m value / 60m value) at each percentile:`);
  console.log(`  metric |${PCTS.map((q) => `p${Math.round(q * 100)}`.padStart(9)).join('')}`);
  const vnRatios = PCTS.map((q) => (quantile(svn15, q) / Math.max(quantile(svn60, q), 1e-9)).toFixed(3).padStart(9)).join('');
  const diRatios = PCTS.map((q) => (quantile(sdi15, q) / Math.max(quantile(sdi60, q), 1e-9)).toFixed(3).padStart(9)).join('');
  console.log(`  VN     |${vnRatios}`);
  console.log(`  DI     |${diRatios}`);
  console.log(`\n  NOTE on DI: DI is bounded [0,100] and centered ~50; "scaling" for DI is about`);
  console.log(`  how far the band edges (di_min/di_max) sit from the body of the distribution,`);
  console.log(`  i.e. whether the band cuts a different fraction at 15m. The candidate table (b)`);
  console.log(`  preserves each edge's percentile, which is the decision-grade number.`);
}

function printCandidateMapping(r60: SubstrateResult, r15: SubstrateResult, edges: ThreshEdge[]): void {
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`(b) CANDIDATE-THRESHOLD MAPPING — percentile-preserving (60m rank → 15m value)`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);
  console.log(`  For each current xStock IMF threshold edge (LIVE screener_filters value): its`);
  console.log(`  percentile RANK on the 60m distribution of its metric, and the 15m value AT THAT`);
  console.log(`  SAME PERCENTILE = the candidate new 15m threshold. vn_max = UPPER cutoff (preserve`);
  console.log(`  its rank). di_min + di_max bound a BAND (preserve EACH edge's rank independently).`);
  console.log(`  The 'admit%' columns show the fraction of windows the edge ADMITS (passes).`);
  console.log(`  NEUTRAL mechanical mapping — NOT a final. Kyle sets finals.\n`);

  const svn60 = [...r60.vn].sort((a, b) => a - b);
  const svn15 = [...r15.vn].sort((a, b) => a - b);
  const sdi60 = [...r60.di].sort((a, b) => a - b);
  const sdi15 = [...r15.di].sort((a, b) => a - b);

  console.log(`  mode/family               edge   metric | current | 60m %ile | candidate(15m) | 60m admit% | 15m-curr admit% | 15m-cand admit%`);
  console.log(`  --------------------------+------+-------+--------+----------+----------------+----------+----------------+---------------`);
  // Stable print order: mode, then family, then vn_max/di_min/di_max.
  const edgeRank: Record<ThreshEdge['edge'], number> = { vn_max: 0, di_min: 1, di_max: 2 };
  const sorted = [...edges].sort((a, b) =>
    a.mode !== b.mode ? a.mode.localeCompare(b.mode)
    : a.family !== b.family ? a.family.localeCompare(b.family)
    : edgeRank[a.edge] - edgeRank[b.edge]);
  for (const t of sorted) {
    const cur = t.value; // LIVE DB value (DB-derived; no seed fallback)
    const s60 = t.metric === 'VN' ? svn60 : sdi60;
    const s15 = t.metric === 'VN' ? svn15 : sdi15;
    const rank = pctRank(s60, cur);
    const candidate = quantile(s15, rank);
    // admit% per edge: vn_max & di_max admit when value <= edge; di_min admits when value >= edge.
    const admitFrac = (sorted2: number[], edgeVal: number, kind: ThreshEdge['edge']): number => {
      if (sorted2.length === 0) return NaN;
      const r = pctRank(sorted2, edgeVal); // fraction <= edgeVal
      return kind === 'di_min' ? (1 - r) : r; // di_min admits the UPPER tail
    };
    const admit60 = admitFrac(s60, cur, t.edge);
    const admit15cur = admitFrac(s15, cur, t.edge);       // current edge applied to 15m dist
    const admit15cand = admitFrac(s15, candidate, t.edge); // candidate edge applied to 15m dist
    const dp = t.metric === 'VN' ? 6 : 4;
    console.log(
      `  ${(t.mode + '/' + t.family).padEnd(25)} ${t.edge.padEnd(6)} ${t.metric.padEnd(6)} | ` +
      `${cur.toFixed(dp === 6 ? 4 : 2).padStart(7)} | ` +
      `${(rank * 100).toFixed(2).padStart(7)}% | ` +
      `${candidate.toFixed(dp).padStart(14)} | ` +
      `${(admit60 * 100).toFixed(2).padStart(7)}% | ` +
      `${(admit15cur * 100).toFixed(2).padStart(13)}% | ` +
      `${(admit15cand * 100).toFixed(2).padStart(12)}%`,
    );
  }
  console.log(`\n  Read: "60m admit%" = fraction the CURRENT edge admits today (60m). "15m-curr`);
  console.log(`  admit%" = what the SAME current edge would admit on 15m bars BEFORE recalibration`);
  console.log(`  (the silent shift). "15m-cand admit%" = what the percentile-preserving candidate`);
  console.log(`  admits on 15m (≈ the 60m admit%, by construction — confirms the mapping restores`);
  console.log(`  the original screen tightness). A large 60m→15m-curr admit% gap = the recalibration`);
  console.log(`  this study justifies; if the gap is ~0 the edge is bar-insensitive and can stay.`);
}

// ── Derive the threshold-edge list from the LIVE screener_filters (DB is SSOT) ─
// One ThreshEdge per NON-NULL vn_max / di_min / di_max on every xstock_spot
// family row. NULL/inert rows contribute no edges. No hardcoded list.
async function loadLiveThresholds(client: InstanceType<typeof Client>): Promise<ThreshEdge[]> {
  const out: ThreshEdge[] = [];
  const r = await client.query<{
    mode: string; filter_path: string; vn_max: string | null; di_min: string | null; di_max: string | null;
  }>(
    `SELECT mode, filter_path, vn_max, di_min, di_max
       FROM screener_filters
      WHERE asset_class = 'xstock_spot' AND filter_path IS NOT NULL
      ORDER BY mode, filter_path`,
  );
  for (const row of r.rows) {
    if (row.vn_max !== null) out.push({ family: row.filter_path, mode: row.mode, metric: 'VN', edge: 'vn_max', value: Number(row.vn_max) });
    if (row.di_min !== null) out.push({ family: row.filter_path, mode: row.mode, metric: 'DI', edge: 'di_min', value: Number(row.di_min) });
    if (row.di_max !== null) out.push({ family: row.filter_path, mode: row.mode, metric: 'DI', edge: 'di_max', value: Number(row.di_max) });
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('═'.repeat(78));
  console.log('[B4-VNDI] xStock VN/DI (IMF SCREEN) RECALIBRATION STUDY (READ-ONLY)');
  console.log('═'.repeat(78));

  const span = await client.query<{ min: string; max: string; n: string }>(
    `SELECT min(interval_begin)::text AS min, max(interval_begin)::text AS max, count(*)::text AS n FROM xstock_spot_ohlc_1m`,
  );
  console.log(`[B4-VNDI] xstock_spot_ohlc_1m: ${Number(span.rows[0].n).toLocaleString()} rows | ${span.rows[0].min} → ${span.rows[0].max}`);

  const symRes = await client.query<{ symbol: string }>(
    `SELECT DISTINCT symbol FROM xstock_spot_ohlc_1m ORDER BY symbol`,
  );
  const symbols = symRes.rows.map((r) => r.symbol);
  console.log(`[B4-VNDI] ${symbols.length} xStock symbols in the 1m archive`);
  console.log(`[B4-VNDI] WINDOW_15M=${WINDOW_15M} (MAX_BARS_15M), WINDOW_60M=${WINDOW_60M} (MAX_BARS_60M) — live IMF array lengths`);

  // Enumerate the threshold edges from the LIVE DB (DB is sole authority).
  const edges = await loadLiveThresholds(client);
  const vnEdges = edges.filter((e) => e.metric === 'VN').length;
  const diEdges = edges.filter((e) => e.metric === 'DI').length;
  const famSet = new Set(edges.map((e) => `${e.mode}/${e.family}`));
  console.log(`[B4-VNDI] ${edges.length} live threshold edges across ${famSet.size} xstock_spot family rows (${vnEdges} vn_max + ${diEdges} di band edges)`);

  console.log(`\n[B4-VNDI] === 60-MINUTE substrate pass (window=${WINDOW_60M}) ===`);
  const r60 = await runSubstrate(client, symbols, { label: '60m', bucketSeconds: 3600, windowBars: WINDOW_60M });
  console.log(`[B4-VNDI] 60m done: ${r60.totalWindows.toLocaleString()} windows across ${r60.symbolsUsed} symbols (${r60.totalFBars.toLocaleString()} total 60m bars rebuilt)`);

  console.log(`\n[B4-VNDI] === 15-MINUTE substrate pass (window=${WINDOW_15M}) ===`);
  const r15 = await runSubstrate(client, symbols, { label: '15m', bucketSeconds: 900, windowBars: WINDOW_15M });
  console.log(`[B4-VNDI] 15m done: ${r15.totalWindows.toLocaleString()} windows across ${r15.symbolsUsed} symbols (${r15.totalFBars.toLocaleString()} total 15m bars rebuilt)`);

  // ── (a) Percentile tables at both substrates ───────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`(a) VN / DI PERCENTILE TABLES — both substrates (raw N shown)`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);
  printDistPanel(`60-MINUTE (window=${WINDOW_60M}, current substrate)`, r60.vn, r60.di);
  printDistPanel(`15-MINUTE (window=${WINDOW_15M}, new substrate)`, r15.vn, r15.di);

  // ── (b) Candidate-threshold mapping ────────────────────────────────────────
  printCandidateMapping(r60, r15, edges);

  // ── (c) Scaling direction ──────────────────────────────────────────────────
  printScaling(r60, r15);

  // ── Provenance + uncertainty footer ────────────────────────────────────────
  console.log(`\n  CURRENT xStock IMF thresholds (LIVE screener_filters, asset_class='xstock_spot'):`);
  const byFam = new Map<string, ThreshEdge[]>();
  for (const t of edges) {
    const k = `${t.mode}/${t.family}`;
    if (!byFam.has(k)) byFam.set(k, []);
    byFam.get(k)!.push(t);
  }
  for (const [fam, fedges] of [...byFam].sort((a, b) => a[0].localeCompare(b[0]))) {
    const parts = fedges.map((e) => `${e.edge}=${e.value}`).join(' ');
    console.log(`    ${fam.padEnd(26)} ${parts}`);
  }

  console.log(`\n  ── UNCERTAINTY / CAVEATS (decision-grade honesty) ──`);
  console.log(`  1. Trailing-window length: this study uses the live IMF cache caps EXACTLY`);
  console.log(`     (240 @ 15m = MAX_BARS_15M; 60 @ 60m = MAX_BARS_60M). VN and DI are FULL-ARRAY`);
  console.log(`     statistics, so the window length is THE load-bearing parity input. If the live`);
  console.log(`     cache cap changes (e.g. a future MAX_BARS_15M tweak), these candidates move.`);
  console.log(`  2. The aggregator returns the most-recent ≤N bars and the IMF computes over the`);
  console.log(`     WHOLE returned array; on cold-start / thin pairs the live array can be SHORTER`);
  console.log(`     than N (VN/DI then computed over fewer bars → different magnitude). This study`);
  console.log(`     measures only FULL N-bar windows (the steady-state case). Cold-start windows`);
  console.log(`     are out of scope (they're transient and not what the threshold targets).`);
  console.log(`  3. VN/DI are computed on the SAME 1m→Nm rebuild the regime classifier reads, so`);
  console.log(`     the IMF screen and regime classifier share a substrate. The regime study used`);
  console.log(`     per-substrate INDICATOR lookbacks (momentum/ADX/DBS); VN/DI by contrast use`);
  console.log(`     the FULL cache-cap array by construction — that is what the live IMF does, so`);
  console.log(`     no per-substrate lookback applies to VN/DI.`);
  console.log(`  4. di_min/di_max preserve EACH band edge's percentile independently. If Kyle`);
  console.log(`     prefers to preserve the BAND WIDTH instead, that is a different (also valid)`);
  console.log(`     policy — flagged, not chosen here.`);

  await client.end();
  console.log(`\n[B4-VNDI] complete. READ-ONLY — no writes, no DDL. Thresholds NOT set; candidate map is mechanical/percentile-preserving only.`);
}

main().catch((err) => { console.error('[B4-VNDI] Fatal:', err); process.exit(1); });
