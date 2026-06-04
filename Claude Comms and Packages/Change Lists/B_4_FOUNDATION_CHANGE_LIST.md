# B.4 foundation — Step-4 CHANGE LIST (pre-push diff review)

> For Langston. The xStock 60m→15m foundation bundle, ready for your pre-push review (you asked to "review the diff before push"). 22 local-only commits, 23 files, NOT pushed. **INFRASTRUCTURE NOTE: do NOT cd to any gdrive mount or run git there. Read the embedded snippets below; for any repo-side inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'` (GitHub HEAD, which lacks these commits) or ask me to paste a hunk.** Active trading OFF; xStock-scoped; crypto untouched.

## §0 — Bench gate (C:\dev, §7.1) — PASSED, ZERO DELTA
Ran the full bundle vs pure GitHub HEAD, both directions:
- **tsc --noEmit: 493 errors WITH bundle == 493 errors pure HEAD** (byte-identical file distribution; the "493" is the pre-existing error baseline CI already tolerates). My 13 changed .ts files contribute **0** new errors.
- **vitest run: 12 failed / 1597 passed / 140 skipped WITH bundle == identical pure HEAD.** **0** new test failures.
So the bundle is clean by the repo's baseline standard; a zero-delta push keeps CI green (origin HEAD carries the same 493/12 and CI is green).

## §1 — File manifest (23 files)
**Already reviewed by you chunk-by-chunk in prior sessions (per-class plumbing):**
- `server/types/market-regime.types.ts` — RegimeConfig +momentumLookback/+adxPeriod.
- `server/core/metrics/market-regime.ts` — DEFAULT 30/14; computeMomentum(ohlc,lookback); computeADX(period) threaded.
- `server/services/market-context-engine.ts` — refreshRegimeConfig UNIFORM class-keyed resolution + crypto PARITY ASSERTION (the Chunk-B1 pattern fix you signed off).
- `server/asset_classes/xstock_spot/ohlc-aggregator.ts` — 15m branch (MAX_BARS_15M=240, bucket /900).
- `server/asset_classes/xstock_spot/scanner.ts` — xStock DBS config from module_constants (lookback 192/ema 48-104/atr 56).
- `server/asset_classes/xstock_spot/xstock-ohlc-cache.ts` — 15m branch (DRY readSnapshotBars/mergeBars/writeBackSnapshot).
- `server/asset_classes/xstock_spot/regime-thresholds.ts` — 14 regime thresholds (parity-gate values you SIGNED OFF).

**NEW this session (need your review — embedded below):**
- `scripts/b4-dbs-15m-recompute.ts` (NEW) — DBS 15m full per-bar history recompute (supervised one-shot, run AT ACTIVATION).
- `scripts/b-new-34b-prewarm-snapshot.ts` — prewarm now warms BOTH 60m+15m snapshots.
- `drizzle/migrations/2026-06-04-b4-foundation-vndi-15m-recalib.sql` (+rollback) — VN/DI seed (you approved the VALUES; SQL below).
- `server/asset_classes/xstock_spot/imf-evaluator.ts` — single `export` keyword on computeDirectionalIntegrity (for the study; no behavior change).

**Studies/governance (read-only):** `scripts/b4-{regime-recalib-study,regime-parity,vndi-recalib-study}.ts`, `Claude Comms.../B_4_{REGIME_RECALIB_STUDY_RESULTS,REGIME_PARITY_REPORT,VNDI_RECALIB_STUDY_RESULTS}.md`, `B_4_FOUNDATION_PRE_AUDIT.md`, `MANIFEST.txt`, schema migrations `2026-06-03{b,c}`, `.claude/memory/MEMORY.md`.

## §2 — YOUR STEP-4 HARD-FAIL CONDITIONS — proofs
**Crypto-isolation (3 proofs):**
1. **Crypto reads NO new module_constants keys.** market-context-engine resolves regime lookbacks UNIFORMLY over getActiveAssetClasses(); crypto resolves to the shared DEFAULT_REGIME_CONFIG (30/14). DBS: crypto scanners (fx5-scanner, market-scanner) are UNTOUCHED and keep DEFAULT_DBS_CONFIG; only the xStock scanner + the recompute resolve from module_constants.
2. **Startup PARITY ASSERTION** in market-context-engine refreshRegimeConfig: crypto-resolved lookbacks MUST == DEFAULT_REGIME_CONFIG (30/14) or it throws at startup — a silent crypto drift is impossible.
3. **Shared DBSConfig type (tsc-enforced).** xStock DBSConfig and crypto DEFAULT_DBS_CONFIG share the ONE `DBSConfig` type; structural drift fails tsc.

**Bar-cap:** MAX_BARS_15M = **240** (≥ DBS-192 + margin 224 = your must-fix #1). ✓
**EMA per-class:** crypto fast/slow = **12/26** (DEFAULT_DBS_CONFIG, untouched); xStock = **48/104** (module_constants, migration 2026-06-03c). DBS lookback crypto 48 / xStock 192. ATR period crypto 14 / xStock 56. ✓

## §3 — NEW piece: DBS 15m recompute (`scripts/b4-dbs-15m-recompute.ts`)
Reworked from a wrong draft (it used the capped aggregator → 1 row/symbol). Now builds the FULL uncapped 15m series per symbol from `xstock_spot_ohlc_1m` (epoch/900 bucket SQL, mirrors b-phase-a2's full-series build) and slides a strict 192-bar window → one DBS row per bar.

**Config resolution (hard-fail, mirrors scanner.ts):**
```ts
const DBS_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' };
const [xsLookback, xsEmaFast, xsEmaSlow, xsAtrPeriod] = await Promise.all([
  getConstant<number>('directional_bias', 'lookback_period', DBS_KEY), // 192
  getConstant<number>('directional_bias', 'ema_fast', DBS_KEY),        // 48
  getConstant<number>('directional_bias', 'ema_slow', DBS_KEY),        // 104
  getConstant<number>('directional_bias', 'atr_period', DBS_KEY),      // 56
]);
// throws if any is non-number (no silent default); then:
const config = { ...DEFAULT_DBS_CONFIG, lookbackPeriod: xsLookback, emaPeriods: { fast: xsEmaFast, slow: xsEmaSlow } };
```

**Recompute core (strict 192-bar window; computeDirectionalBias EMA consumes the FULL passed array, so exactly 192):**
```ts
const lookback = dbsConfig.lookbackPeriod; // 192
for (let i = lookback - 1; i < bars.length; i++) {
  const window = bars.slice(i - (lookback - 1), i + 1); // exactly 192 bars
  const atr = computeATRFromOHLC(window, atrPeriod);     // atrPeriod 56
  if (atr <= 0) { skippedAtr++; continue; }
  const result = computeDirectionalBias(window, atr, dbsConfig);
  if (result.sentinelZero) { skippedSentinel++; continue; }  // <-- SEE REVIEW Q1
  // ... build per-bar row (symbol, sector, ts, score, components, atr, vol24hUsd, bar_interval_minutes=15)
}
```

**Transaction (your "PLUS retain 60m archive" + safety-gate + rollback-safe):**
```sql
BEGIN;
CREATE TABLE IF NOT EXISTS xstock_dbs_backfill_60m_archive (LIKE xstock_dbs_backfill INCLUDING ALL);
INSERT INTO xstock_dbs_backfill_60m_archive SELECT * FROM xstock_dbs_backfill WHERE bar_interval_minutes = 60 ON CONFLICT DO NOTHING;
-- SAFETY GATE: archive count(60) >= live count(60) else ROLLBACK + abort
DELETE FROM xstock_dbs_backfill;
INSERT INTO xstock_dbs_backfill (... , bar_interval_minutes) VALUES (..., 15) ON CONFLICT (symbol,ts) DO NOTHING;
COMMIT;  -- ROLLBACK on any error; live table never left half-cleared
```
Supervised one-shot, run AT ACTIVATION in the weekend-close window (NOT coupled to the flaky weekend_shutdown cron, per your Step-2 refinement). NOT run yet.

**REVIEW Q1 (your call):** the rework SKIPS sentinel-zero bars; the original b-phase-a2-backfill INSERTED them with the `sentinel_zero` flag. With strict 192-bar windows the length-guard never trips, so this only drops genuinely degenerate flat-price bars (rare). Skip = cleaner distribution for threshold derivation; Insert-with-flag = parity with the 60m archive + preserves the column's meaning for 15m rows. Which do you want?

## §4 — NEW piece: prewarm warms BOTH snapshots (`scripts/b-new-34b-prewarm-snapshot.ts`)
```ts
const MAX_BARS_15M = 240; // = aggregator cap; DBS-192 + margin
const SNAPSHOT_INTERVALS = [
  { label: '60m', bucketSeconds: 3600, maxBars: 60,  table: 'xstock_spot_ohlc_60m_snapshot' },
  { label: '15m', bucketSeconds: 900,  maxBars: 240, table: 'xstock_spot_ohlc_15m_snapshot' },
];
// per symbol, per interval: aggregateOneSymbol(pool, symbol, lookbackDays, iv.bucketSeconds, iv.maxBars)
//                           upsertSnapshot(pool, symbol, rows, iv.table)
```
aggregateOneSymbol/upsertSnapshot parameterized by interval/table (table values are internal constants, not user input). Pre-switch warming 15m is inert; post-switch it is essential (else 15m snapshot cold at Sunday reopen → DBS-192=48h starts degraded). 60m warm retained as archive/parity substrate. Exported `runPrewarm` signature UNCHANGED; the b-new-36 lifecycle tests (which mock runPrewarm) still pass.

## §5 — NEW piece: VN/DI seed (`2026-06-04-b4-foundation-vndi-15m-recalib.sql`)
Values you SIGNED OFF 2026-06-04. Validated against live staging: touches exactly 16 rows (2+4+2 di_max + 8 vn_max), no strays.
```sql
UPDATE screener_filters SET di_max=40.3 WHERE asset_class='xstock_spot' AND filter_path='active_oscillator' AND di_max=30;            -- 2 rows
UPDATE screener_filters SET di_max=42.8 WHERE asset_class='xstock_spot' AND filter_path IN ('active_reversal','vts_oscillator') AND di_max=35;  -- 4 rows
UPDATE screener_filters SET di_max=45.2 WHERE asset_class='xstock_spot' AND filter_path='vts_reversal' AND di_max=40;                  -- 2 rows
UPDATE screener_filters SET vn_max=0.826 WHERE asset_class='xstock_spot' AND filter_path IN ('active_breakout','active_oscillator','active_reversal','active_trend') AND vn_max=0.85;  -- 8 rows
```
LEFT (documented): vn_max 0.95/0.98 (drift tighter, lens-conservative — residual to be recorded in CHANGES_AND_FIXES per your condition); di_min + di_max=100 (inert). Paired rollback included; forward in MANIFEST. Value-guarded (idempotent).

## §6 — ORB (no code change) + activation plan
ORB needs NO foundation code: it rides the SAME scanner 60→15 flip for candles (candle source = scanner.ts getOHLCDataBatch, NOT the crypto signal-orchestrator path); its window is wall-clock-time-based (14:30 UTC + open_range_minutes=30, a clean 15-multiple) — no param change; enable flag confirmed `false` in live DB and STAYS false (ORB activation is a separate strategy-fit decision, out of foundation scope).

**Activation sequence (gated on YOUR Step-4 sign-off → push → CI green):** run DBS recompute → flip scanner getOHLCDataBatch 60→15 → deploy → §9.3 Claude-in-Chrome UI verify → your 2 banked activation-readiness conditions (flips/HOUR + responsiveness; capture LIVE-15m mix near predicted (3)).

## §7 — Ask
Review §3–§5 (the new code) + confirm §2 (your hard-fail proofs hold) + answer §3 REVIEW Q1 (sentinel skip vs insert). If clean, I push the bundle and confirm CI all-4-green, then proceed to supervised activation. The Phase-19 paper-active run remains the real arbiter; this is the forward proxy.
