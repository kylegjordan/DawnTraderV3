/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-XSTOCK-FRESHNESS-MONITOR (#441) — weekly opportunity-loss / unintended-
 * consequence report for the Wave-D conservative xStock capture rate (4000 ms)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Kyle's CONDITION for accepting the conservative capture rate: watch, weekly,
 * what tradeable moments (if any) the reduced cadence costs us + side-effects,
 * until satisfied. Read-only over live tables + one self-owned trend table + one
 * §10.5 alert. NO live-pipeline coupling.
 *
 * ⛔⛔ SUPERSEDED CONTENT — READ THIS BEFORE TRUSTING ANYTHING BELOW (CC-A, 2026-07-23).
 * This file was written 2026-07-08 and COMMITTED 2026-07-23 (`c65813bcd`) only to rescue it —
 * it had sat uncommitted in a single folder for a fortnight and was absent at origin. Landing it
 * preserved it; it did NOT bless its design.
 *
 * ★ OBJ-1 BELOW IS RETIRED. The throttle-caused-tail vs natively-slow ATTRIBUTION SPLIT was ruled
 *   a CATEGORY ERROR on 2026-07-08 (crew-locked, Langston + CC-B): it needs the one-time Wave-D
 *   pre/post counterfactual, and the ticker capture stores INGEST time only (no venue quote-ts),
 *   so per-fetch attribution is undefined — a heuristic re-derivation returned 474 against ~10
 *   ground truth. OBJ-1 is now an honest freshness SLI + regression detector (per-symbol
 *   median/p95 gap + RTH breach-rate, WoW trend, absolute-band alert, min-sample guard,
 *   #439 quarantine). See RUNNING_ISSUES #441 and `B_XSTOCK_FRESHNESS_MONITOR_PRE_AUDIT.md`
 *   §OBJ-1-REFRAMED — those are current; the split described below is NOT.
 *
 * ★ AND IT CANNOT RUN AS WRITTEN: it writes INTO `xstock_freshness_report`, and NO migration
 *   creating that table exists (0 in MANIFEST, absent from the tree). First write would fail.
 *   Green CI proves the TypeScript COMPILES and nothing more.
 *
 * ⇒ Treat everything below as a 2026-07-08 DRAFT pending rework, never as current design.
 *
 * Reports (over the past LOOKBACK_DAYS of xStock RTH):
 *  OBJ-1  Freshness-breach exposure per symbol vs the live 15 s fill gate, SPLIT
 *         into throttle-caused-tail (fast median, occasional tail — the Wave-D
 *         cost) vs natively-slow (#440 — stale at ANY cadence) so the report
 *         never conflates them.
 *  OBJ-2a Depth-median sample adequacy — min ticker samples in any 20-min window
 *         stays above DEPTH_SAMPLE_FLOOR (the scanner's rolling-median depth read).
 *  OBJ-2b Decision-bar integrity — xstock_spot_ohlc_1m coverage stays full.
 *  OBJ-2c Range-compression (Langston Q3) — do the throttle-affected names' 1-min
 *         bar range / ticks-per-bar compress MORE than a non-throttled control?
 *         (The bars are Kraken-`ohlc`-fed = throttle-independent, so the expected
 *         delta is ~0; the control makes the null result trustworthy and guards
 *         against a market-wide-compression false flag.)
 *  OBJ-4  (forward seam — NOT built until active trading is ON) cross-ref breaches
 *         vs actual signal/RTB/fill events = the TRUE opportunity-loss. Until then
 *         the report is EXPOSURE-ONLY and says so in plain language.
 *
 * Delivery: writes an `xstock_freshness_report` row (week-over-week trend SSOT) +
 * a dated file + fires a §10.5 info alert whose body is a plain-language summary
 * (auto-posts to Discord). The summary MUST frame exposure as "what COULD have
 * been blocked, not what we actually lost — true loss isn't measurable until
 * active trading is live" (Langston Step-1 lock).
 *
 * On/off: `module_constants` `xstock_freshness_monitor.enabled`. FAIL-LOUD — a
 * missing/unreadable value does NOT silently no-op; the run still fires and the
 * alert says the flag was unreadable (rule 10). Cold-start default = enabled.
 *
 * Cron (root crontab, weekly Sunday 06:00 UTC):
 *   0 6 * * 0 su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b-xstock-freshness-monitor.ts" >> /var/log/dawntrader/xstock-freshness-monitor.log 2>&1
 * ═════════════════════════════════════════════════════════════════════════════
 */

// dotenv FIRST (before ../db.js) — the #438 lesson: db.ts throws at module-load
// on a missing DATABASE_URL, and the deploy cron's login shell doesn't export it.
import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import { addAlert } from '../services/system-alerts.js';

const { Client } = pg;

// ─── Named tunables (Langston Q2: no buried magic numbers) ────────────────────
const LOOKBACK_DAYS = 7;
/** Min ticker samples in a 20-min window for a robust rolling-median depth read.
 *  Nominal at the 4000 ms cadence ≈ 240 (20 min ÷ ~5 s). 30 ⇒ ~1 sample / 40 s,
 *  a defensible degradation trigger; travels with the cadence rationale. */
const DEPTH_SAMPLE_FLOOR = 30;
/** Range-compression flags only if the throttle-affected names' range/ticks drop
 *  more than this % BEYOND the control group's drop (isolates the throttle effect
 *  from market-wide compression — Langston Q3). */
const RANGE_COMPRESSION_TRIP_PCT = 20;
const WORST_N = 15;
/** Heuristic split at the fixed 4000 ms cadence (the precise pre/post split was
 *  the one-time Wave-D measurement): a breaching symbol whose MEDIAN gap is still
 *  small ticks fast natively → the breach is throttle-caused tail; a symbol whose
 *  MEDIAN gap is itself ≥ the gate is natively slow (#440), stale at any cadence. */
const NATIVE_SLOW_MEDIAN_FRACTION = 1.0; // native-slow if median gap ≥ gate
/** Pre-Wave-D baseline week for the range-compression control (throttle was 1000). */
const BASELINE_START = '2026-06-28T00:00:00Z';
const BASELINE_END = '2026-07-05T00:00:00Z';
const RTH_START_HOUR = 13, RTH_START_MIN = 30, RTH_END_HOUR = 20; // 13:30–20:00 UTC = 9:30–16:00 ET
const REPORT_DIR = '/var/log/dawntrader';

interface Cfg { enabled: boolean; enabledReadable: boolean; gateMs: number; gateReadable: boolean; throttleMs: number | null; }

async function loadConfig(c: pg.Client): Promise<Cfg> {
  let enabled = true, enabledReadable = false, gateMs = 15000, gateReadable = false;
  let throttleMs: number | null = null;
  try {
    const r = await c.query(
      `SELECT module_name, constant_name, value FROM module_constants
        WHERE (module_name='xstock_freshness_monitor' AND constant_name='enabled')
           OR (module_name='fill_depth_gate' AND constant_name='warmth_max_age_ms')
           OR (module_name='passive_archive' AND constant_name='b74_ticker_snapshot_min_interval_ms')`,
    );
    for (const row of r.rows) {
      if (row.module_name === 'xstock_freshness_monitor') {
        if (typeof row.value === 'boolean') { enabled = row.value; enabledReadable = true; }
      } else if (row.module_name === 'fill_depth_gate') {
        // xstock_spot gate is 15000; take the max seen (most-specific resolution is
        // out of scope for a monitor — 15000 is the xStock value).
        if (typeof row.value === 'number') { gateMs = Math.max(gateMs === 15000 && !gateReadable ? 0 : gateMs, row.value); gateReadable = true; }
      } else if (row.module_name === 'passive_archive') {
        if (typeof row.value === 'number') throttleMs = row.value;
      }
    }
  } catch {
    // fail-LOUD: leave defaults, mark unreadable — the run still fires + the alert says so.
  }
  if (!gateReadable) gateMs = 15000;
  return { enabled, enabledReadable, gateMs, gateReadable, throttleMs };
}

const rthClause = (col: string) =>
  `EXTRACT(DOW FROM ${col}) BETWEEN 1 AND 5
   AND ( (EXTRACT(HOUR FROM ${col})*60 + EXTRACT(MINUTE FROM ${col})) BETWEEN ${RTH_START_HOUR*60+RTH_START_MIN} AND ${RTH_END_HOUR*60} )`;

interface Exposure {
  totalBreachMoments: number;
  throttleCaused: { symbol: string; med: number; max: number; breaches: number }[];
  nativeSlow: { symbol: string; med: number; max: number; breaches: number }[];
}

/** OBJ-1: per-symbol gap stats over the window (RTH only), split throttle-caused
 *  vs native-slow, counting breach moments (gaps ≥ the freshness gate). */
async function computeExposure(c: pg.Client, start: string, end: string, gateMs: number): Promise<Exposure> {
  const r = await c.query(
    `WITH g AS (
       SELECT symbol,
              EXTRACT(EPOCH FROM (captured_at - LAG(captured_at) OVER (PARTITION BY symbol ORDER BY captured_at)))*1000 AS gap_ms
         FROM xstock_spot_ticker_snap
        WHERE captured_at >= $1 AND captured_at < $2 AND ${rthClause('captured_at')})
     SELECT symbol,
            (percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_ms))::float8 med,
            (max(gap_ms))::float8 max_gap,
            count(*) FILTER (WHERE gap_ms >= $3)::int breaches
       FROM g WHERE gap_ms IS NOT NULL GROUP BY symbol`,
    [start, end, gateMs],
  );
  const throttleCaused: Exposure['throttleCaused'] = [];
  const nativeSlow: Exposure['nativeSlow'] = [];
  let totalBreachMoments = 0;
  for (const row of r.rows) {
    const med = Number(row.med), max = Number(row.max_gap), breaches = Number(row.breaches);
    if (breaches <= 0) continue;
    totalBreachMoments += breaches;
    const rec = { symbol: row.symbol, med: Math.round(med), max: Math.round(max), breaches };
    if (med >= gateMs * NATIVE_SLOW_MEDIAN_FRACTION) nativeSlow.push(rec);
    else throttleCaused.push(rec);
  }
  throttleCaused.sort((a, b) => b.breaches - a.breaches);
  nativeSlow.sort((a, b) => b.breaches - a.breaches);
  return { totalBreachMoments, throttleCaused, nativeSlow };
}

/** OBJ-2a: minimum ticker samples in any fixed 20-min RTH bucket, across symbols. */
async function depthSampleMin(c: pg.Client, start: string, end: string): Promise<number> {
  const r = await c.query(
    `WITH b AS (
       SELECT symbol, date_bin('20 minutes', captured_at, TIMESTAMPTZ '2026-01-01') AS bucket, count(*)::int n
         FROM xstock_spot_ticker_snap
        WHERE captured_at >= $1 AND captured_at < $2 AND ${rthClause('captured_at')}
        GROUP BY 1, 2)
     SELECT COALESCE(min(n), 0)::int AS min_n FROM b`,
    [start, end],
  );
  return Number(r.rows[0]?.min_n ?? 0);
}

/** OBJ-2b: xstock_spot_ohlc_1m decision-bar coverage over RTH vs expected minutes. */
async function ohlcCoveragePct(c: pg.Client, start: string, end: string): Promise<number> {
  const r = await c.query(
    `WITH bars AS (
       SELECT count(DISTINCT date_trunc('minute', interval_begin))::int actual_minutes
         FROM xstock_spot_ohlc_1m
        WHERE interval_begin >= $1 AND interval_begin < $2 AND ${rthClause('interval_begin')})
     SELECT actual_minutes FROM bars`,
    [start, end],
  );
  const actual = Number(r.rows[0]?.actual_minutes ?? 0);
  // Expected RTH minutes over the window: weekdays × (RTH_END - RTH_START) minutes.
  const days: string[] = [];
  let d = new Date(start);
  const endD = new Date(end);
  while (d < endD) { const dow = d.getUTCDay(); if (dow >= 1 && dow <= 5) days.push(''); d = new Date(d.getTime() + 86_400_000); }
  const expected = days.length * ((RTH_END_HOUR * 60) - (RTH_START_HOUR * 60 + RTH_START_MIN));
  return expected > 0 ? Math.round((actual / expected) * 1000) / 10 : 0;
}

/** OBJ-2c: median (high-low)/open + median trade_count for a symbol set over a
 *  window (RTH). Used current-window vs pre-Wave-D baseline, affected vs control. */
async function rangeStats(c: pg.Client, start: string, end: string, symbols: string[] | null): Promise<{ medRange: number; medTicks: number; n: number }> {
  const params: any[] = [start, end];
  let symClause = '';
  if (symbols && symbols.length) { params.push(symbols); symClause = `AND symbol = ANY($3::text[])`; }
  const r = await c.query(
    `SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN open>0 THEN (high-low)/open ELSE NULL END))::float8 med_range,
            (percentile_cont(0.5) WITHIN GROUP (ORDER BY trade_count))::float8 med_ticks,
            count(*)::int n
       FROM xstock_spot_ohlc_1m
      WHERE interval_begin >= $1 AND interval_begin < $2 AND ${rthClause('interval_begin')} ${symClause}
        AND high IS NOT NULL AND low IS NOT NULL`,
    params,
  );
  return { medRange: Number(r.rows[0]?.med_range ?? 0), medTicks: Number(r.rows[0]?.med_ticks ?? 0), n: Number(r.rows[0]?.n ?? 0) };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('[xstock-freshness-monitor] DATABASE_URL unset'); process.exit(1); }
  const now = new Date();
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const cfg = await loadConfig(c);
    if (cfg.enabledReadable && !cfg.enabled) {
      console.log('[xstock-freshness-monitor] disabled via module_constants — skipping (readable=true, enabled=false)');
      return; // an EXPLICIT, readable disable is the one clean no-op path.
    }

    // ── OBJ-1 exposure ──
    const exp = await computeExposure(c, windowStart, windowEnd, cfg.gateMs);
    // ── OBJ-2a depth adequacy ──
    const depthMin = await depthSampleMin(c, windowStart, windowEnd);
    // ── OBJ-2b OHLC coverage ──
    const coverage = await ohlcCoveragePct(c, windowStart, windowEnd);
    // ── OBJ-2c range-compression with control ──
    const affectedSyms = exp.throttleCaused.map((s) => s.symbol);
    const controlSyms: string[] = []; // empty = whole universe as control (non-affected majors dominate)
    const affNow = await rangeStats(c, windowStart, windowEnd, affectedSyms.length ? affectedSyms : ['__none__']);
    const affBase = await rangeStats(c, BASELINE_START, BASELINE_END, affectedSyms.length ? affectedSyms : ['__none__']);
    const ctlNow = await rangeStats(c, windowStart, windowEnd, null); // whole xStock universe = control baseline
    const ctlBase = await rangeStats(c, BASELINE_START, BASELINE_END, null);
    // % change in median range, affected vs control, current vs baseline
    const pctDrop = (base: number, now2: number) => base > 0 ? ((base - now2) / base) * 100 : 0;
    const affDrop = pctDrop(affBase.medRange, affNow.medRange);
    const ctlDrop = pctDrop(ctlBase.medRange, ctlNow.medRange);
    const excessCompression = affDrop - ctlDrop; // >0 = affected compressed MORE than the market
    const rangeFlag = affectedSyms.length > 0 && affBase.n > 20 && affNow.n > 20 && excessCompression > RANGE_COMPRESSION_TRIP_PCT;
    const rangeDetail = {
      affected_symbols: affectedSyms.length,
      affected_med_range_base: round4(affBase.medRange), affected_med_range_now: round4(affNow.medRange),
      control_med_range_base: round4(ctlBase.medRange), control_med_range_now: round4(ctlNow.medRange),
      affected_drop_pct: round1(affDrop), control_drop_pct: round1(ctlDrop),
      excess_compression_pct: round1(excessCompression), trip_pct: RANGE_COMPRESSION_TRIP_PCT,
      affected_med_ticks_now: round1(affNow.medTicks), control_med_ticks_now: round1(ctlNow.medTicks),
      note: 'ohlc_1m bars are Kraken-fed (throttle-independent) — expected excess ≈ 0; a positive flag would mean a real leak.',
    };

    const worst = [
      ...exp.throttleCaused.slice(0, WORST_N).map((s) => ({ ...s, kind: 'throttle_caused' })),
    ];

    // ── write the trend-SSOT row ──
    await c.query(
      `INSERT INTO xstock_freshness_report
         (window_start, window_end, throttle_ms, freshness_gate_ms, total_breach_moments,
          throttle_caused_symbols, native_slow_symbols, worst, depth_sample_min,
          ohlc_coverage_pct, range_compression_flag, range_detail, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb,$13)`,
      [windowStart, windowEnd, cfg.throttleMs, cfg.gateMs, exp.totalBreachMoments,
       exp.throttleCaused.length, exp.nativeSlow.length, JSON.stringify(worst), depthMin,
       coverage, rangeFlag, JSON.stringify(rangeDetail),
       cfg.enabledReadable ? null : 'WARN: xstock_freshness_monitor.enabled flag was UNREADABLE — ran anyway (fail-loud).'],
    );

    // ── dated human-readable file ──
    const dateTag = windowEnd.slice(0, 10);
    const reportPath = `${REPORT_DIR}/xstock-freshness-report-${dateTag}.txt`;
    const fileBody = renderFile(cfg, windowStart, windowEnd, exp, depthMin, coverage, rangeFlag, rangeDetail);
    try { fs.writeFileSync(reportPath, fileBody); } catch (e) { console.error('[xstock-freshness-monitor] file write failed:', e); }

    // ── plain-language §10.5 alert (framing-locked) ──
    await fireReportAlert(cfg, exp, depthMin, coverage, rangeFlag);
    console.log(`[xstock-freshness-monitor] DONE window=${windowStart}..${windowEnd} breach_moments=${exp.totalBreachMoments} throttle_caused=${exp.throttleCaused.length} native_slow=${exp.nativeSlow.length} depth_min=${depthMin} coverage=${coverage}% range_flag=${rangeFlag}`);
  } finally {
    await c.end().catch(() => {});
  }
}

function round1(n: number) { return Math.round(n * 10) / 10; }
function round4(n: number) { return Math.round(n * 10000) / 10000; }

function renderFile(cfg: Cfg, ws: string, we: string, exp: Exposure, depthMin: number, coverage: number, rangeFlag: boolean, rd: any): string {
  const lines: string[] = [];
  lines.push(`B-XSTOCK-FRESHNESS-MONITOR report  window ${ws} .. ${we}`);
  lines.push(`throttle=${cfg.throttleMs}ms  freshness_gate=${cfg.gateMs}ms  flag_readable=${cfg.enabledReadable}`);
  lines.push(`\nEXPOSURE (what COULD have been blocked — NOT actual loss; true loss needs active trading ON):`);
  lines.push(`  total breach-moments: ${exp.totalBreachMoments}`);
  lines.push(`  throttle-caused names (fast median, occasional tail — the Wave-D cost): ${exp.throttleCaused.length}`);
  lines.push(`  natively-slow names (#440 — stale at ANY cadence): ${exp.nativeSlow.length}`);
  lines.push(`\n  worst throttle-caused (symbol: med gap / max gap / breach-moments):`);
  for (const s of exp.throttleCaused.slice(0, WORST_N)) lines.push(`    ${s.symbol}: med ${(s.med/1000).toFixed(1)}s / max ${(s.max/1000).toFixed(1)}s / ${s.breaches}`);
  lines.push(`\nUNINTENDED CONSEQUENCES:`);
  lines.push(`  depth-median sample floor: min ${depthMin} samples/20min (floor ${DEPTH_SAMPLE_FLOOR}) → ${depthMin < DEPTH_SAMPLE_FLOOR ? 'BELOW FLOOR' : 'OK'}`);
  lines.push(`  decision-bar (ohlc_1m) coverage: ${coverage}%`);
  lines.push(`  range-compression: excess ${rd.excess_compression_pct}% (affected drop ${rd.affected_drop_pct}% vs control ${rd.control_drop_pct}%, trip ${rd.trip_pct}%) → ${rangeFlag ? 'FLAG' : 'ok'}`);
  return lines.join('\n') + '\n';
}

async function fireReportAlert(cfg: Cfg, exp: Exposure, depthMin: number, coverage: number, rangeFlag: boolean): Promise<void> {
  const consequences: string[] = [];
  if (depthMin < DEPTH_SAMPLE_FLOOR) consequences.push(`order-book depth sampling dipped to ${depthMin}/20min (below the ${DEPTH_SAMPLE_FLOOR} floor)`);
  if (coverage < 90) consequences.push(`decision-bar coverage was ${coverage}% (watch — see #439)`);
  if (rangeFlag) consequences.push(`the affected names' price-range compressed MORE than the market (possible volatility-input leak — investigate)`);
  if (!cfg.enabledReadable) consequences.push(`the on/off flag was UNREADABLE (ran anyway; fix the flag)`);
  const consequencesLine = consequences.length ? `Side-effects flagged: ${consequences.join('; ')}.` : `No unintended side-effects flagged (depth sampling, decision-bar coverage, and price-range all normal).`;
  const body =
    `Weekly xStock freshness check (conservative capture rate). Over the past ${LOOKBACK_DAYS} days of market hours, ` +
    `${exp.throttleCaused.length} name(s) had ${exp.totalBreachMoments} moment(s) where their latest quote was older than the ${(cfg.gateMs/1000).toFixed(0)}-second freshness limit — ` +
    `i.e. moments a fill on that name COULD have been briefly blocked. ⚠️ This is what could have been blocked, NOT what we actually lost — ` +
    `true opportunity-loss isn't measurable until active trading is live (it will cross-reference these moments against real signals then). ` +
    `A separate ${exp.nativeSlow.length} name(s) are naturally too slow to trade on freshness at any capture rate (not caused by the capture change). ` +
    consequencesLine + ` Full detail in the weekly report file + the xstock_freshness_report trend table.`;
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'health_check',
      severity: (rangeFlag || depthMin < DEPTH_SAMPLE_FLOOR) ? 'warning' : 'info',
      title: `Weekly xStock freshness / opportunity-loss report`,
      body,
      metadata: { source: 'b-xstock-freshness-monitor', batch: 'B-XSTOCK-FRESHNESS-MONITOR', issue: 441,
        throttle_caused: exp.throttleCaused.length, native_slow: exp.nativeSlow.length,
        breach_moments: exp.totalBreachMoments, depth_min: depthMin, coverage_pct: coverage, range_flag: rangeFlag },
    });
  } catch (e) { console.error('[xstock-freshness-monitor] alert failed:', e); }
}

main().catch((err) => { console.error('[xstock-freshness-monitor] fatal:', err); process.exit(1); });
