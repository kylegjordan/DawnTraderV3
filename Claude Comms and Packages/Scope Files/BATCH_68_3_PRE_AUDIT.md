# BATCH 68.3 — Pre-Implementation Audit + Implementation Plan

**Companion to:** `BATCH_68_3_SCOPE.md` (commit `92c568a3` + §D.1/§D.2 refinements from Langston cc-inbox #883)
**Step:** 2 of 11 per CLAUDE.md §2 workflow
**SIM consulted:** YES — see §A.1 below
**System Manual consulted:** YES — see §A.2 below
**Status:** Drafted + updated with §A.4 XXBTZUSD finding, awaiting Langston Step-2 review

---

## §A. SIM + System Manual Consultation

### §A.1 SIM-mapped components affected

Per CLAUDE.md §9. **Same blast-radius profile as B68.2** — pure additive: 1 new chain multiplier + 1 new ablation row type + 1 new MCE refresh sub-method. Reuses existing `spearmanRankCorrelation` from `strategy-helpers.ts` (proven; already in `defensive-hedge.ts`).

| # | Component | File | Change | Blast |
|---|---|---|---|---|
| 1 | Pair correlation computation | `server/core/metrics/pair-correlation.ts` (NEW) | Pure-function score + factor + ablation builder. Reuses `spearmanRankCorrelation` + `ohlcCache.getOHLCData` for BTC reference. | LOW (new isolated module) |
| 2 | MCE 8th refresh sub-method | `server/services/market-context-engine.ts` | Add `refreshPairCorrelationConfig()` (becomes 8-method orchestrator); `pairCorrelationConfig` private field + `getCurrentPairCorrelationConfig()` accessor. No threading into `calculatePairRegime` (chain-only). | MEDIUM — orchestrator critical infra; B67.4 hotfix-#2 try/catch wrapper inherited unchanged. |
| 3 | Signal-orchestrator emit hook | `server/services/signal-orchestrator.ts` | Push `b68_3_pair_correlation` ablation row + apply factor in chain. Mirror B68.2 hook exactly (insert AFTER B68.2 volume-regime block). | MEDIUM — every signal in active path. Pre-B67.5 active trading is OFF → observational only. |
| 4 | VTS-runner emit hook | `server/services/vts-runner.ts` | Same pattern as orchestrator. Uses function-scope `ohlcData` + fetches BTC reference via `ohlcCache.getOHLCData(config.btcReferenceSymbol, 60)` where config seeds `XXBTZUSD` (Kraken REST format — matches existing defensive-hedge BTC fetch at vts-runner:2248, shares cache entry). Updates `openTrade.regimeConfidenceModulated` to reflect 6-modulator chain. | MEDIUM — every VTS signal. |
| 5 | Module constants | `module_constants` table | Add 8 new keys in `pair_correlation` module (additive, no schema change). | LOW. |
| 6 | Tests | `server/tests/unit/b68-3-pair-correlation.test.ts` (NEW) | Pure-function tests. | NONE. |

**Upstream feeders unchanged:**
- `ohlcCache` — already provides 30+ bars per pair AND for BTC; XBT/USD is a primary subscription always present.
- `spearmanRankCorrelation` from `strategy-helpers.ts` — mature; tested via `defensive-hedge.ts` integration.
- All B67.x + B68.2 + B68.4 + B68.5 chain factors unchanged.

**Downstream consumers — IMPACTED:**
- `paper_sim_trades.regime_confidence_modulated` column — reflects 6-multiplier chain (was 5). Other columns unchanged.
- B67.0 ablation framework emitter — receives ONE new factor type. Generic emitter, no code change needed.
- `replay-ablation.ts` — generic; processes `b68_3_pair_correlation` rows alongside the existing 8 factor types. No code change.
- `computeFactorCalibration()` aggregator — generic; surfaces `b68_3_pair_correlation` automatically once n ≥ 150 per bucket. No code change.
- `FactorCalibrationSection` UI — same generic auto-extension.
- B67.5 future consumer wiring — reads more meaningful confidence post-calibration.

**Shared state:**
- No new persistent state. Pure-function score over OHLC cache.
- `module_constants` — 8 new rows.

**Background execution:**
- No new timers / intervals.
- MCE refresh adds 8 more constant resolutions per cycle (negligible).
- Score computation cost: TWO `ohlcCache.getOHLCData` calls (pair + BTC) per signal eval, then `spearmanRankCorrelation` (O(N log N) for the rank sort). Trivial vs. existing classifier work.

### §A.2 System Manual sections to update on close

- Modulation chain ordering: `raw × macro × phase × freshness × outcome × volume_regime × pair_correlation → clamp [0.4, 1.0]` (one new term appended).
- New §"Pair Correlation (B68.3)": score formula, factor mapping, asymmetric-boost rationale, label thresholds (IDIOSYNCRATIC ≤ 0.30, NEUTRAL middle band, DRIFTING ≥ 0.70, SELF_REFERENCE for pair=BTC).
- Calibration-window note: B68.3's 14d mini-window starts at deploy; runs in parallel with B67.4 + B68.2.
- **Compound penalty floor decision (Langston O.1, cc-inbox #883):** explicit warning that after B68.1 (7th modulator) the worst-case compound is at the 0.4 floor edge. **B67.5 must define the post-composition floor decision before consumer wiring** — no more deferring.

### §A.3 Cascade risk check

| Risk | Verdict | Mitigation |
|---|---|---|
| 6-multiplier chain compound penalty stack getting close to 0.4 floor | Worst case ~0.455 (Langston O.1 cc-inbox #883). Still above floor; one more factor (B68.1) will take it to ~0.45 × 0.95 ≈ 0.43 — at the edge. | **B67.5 floor decision is now URGENT.** Logged in System Manual + this pre-audit. Non-blocking for B68.3 — observational only pre-B67.5. |
| BTC OHLC missing from cache when emit hook fires | XBT/USD is a primary subscription always present; cache cold-start window is bounded by FX5 first-tick. Mitigation: emit hook checks `btcOhlc.length >= min_samples` → factor=1.0 + `btc_reference_available: false` metadata flag if not. | Calibration data filters these rows. |
| Spearman correlation noise on N=30 cycle-to-cycle | Possible. Single-bar rank shift can produce notable correlation swings. | v2 follow-up: smoothed correlation (EMA of rolling correlation) if calibration shows high noise. v1 ships raw per-cycle and observes. |
| BTC self-reference (pair = XBT/USD) degenerate | Per Langston B.6: emit with factor=1.0 + `is_btc_self_reference: true` flag. Calibration cohort filters. | Explicit metadata flag — clean dataset, no holes. |
| MCE 8th sub-method failure cascade | Inherits B67.4 hotfix-#2 try/catch wrapper unchanged. | Validated. |
| Ablation row volume +12% per cycle (9 factor types vs 8) | ~1000 → ~1100 rows/cycle. Trivial at VTS scale; 90-day retention sweep already in `replay-ablation.ts`. | No mitigation needed. |

**Net:** B68.3 is observational pre-B67.5 (no consumer reads as gate). The escalating compound-penalty concern (Langston O.1) is the only real architectural worry, and it's a B67.5 problem.

### §A.4 Pre-audit finding: BTC reference symbol format

**Finding:** Scope §F migration seeds `b68_3_btc_reference_symbol = "XBT/USD"` (Kraken WS format). But `ohlcCache.getOHLCData()` passes through to `krakenService.getOHLCData()` which hits Kraken REST. The existing BTC OHLC fetch in vts-runner (line 2248) uses `XXBTZUSD` (Kraken REST format). While Kraken REST accepts both formats, using `XXBTZUSD` shares the defensive-hedge BTC cache entry (cache key = `XXBTZUSD_60`), avoiding a redundant API call.

**Decision:** Seed `"XXBTZUSD"` in migration (not `"XBT/USD"`). Self-reference check `symbol === config.btcReferenceSymbol` works because vts-runner symbols are also REST format. Scope §F migration SQL updated accordingly.

---

## §B. Implementation Plan

### §B.1 File-by-file edit map

#### **File 1 (NEW):** `server/core/metrics/pair-correlation.ts`

```typescript
import { spearmanRankCorrelation } from '../../strategies/strategy-helpers.js';
import type { OHLCData } from '../../types/market-regime.types.js';
import type { FactorAlternate, RegimeDecision } from '../../services/factor-ablation-emitter.js';

export interface PairCorrelationConfig {
  lookbackBars: number;
  btcReferenceSymbol: string;
  factorMin: number;
  factorMax: number;
  sensitivity: number;
  minSamples: number;
  driftingThreshold: number;
  idiosyncraticThreshold: number;
}

export interface PairCorrelationResult {
  correlationToBtc: number;        // [-1, +1]
  decorrelationScore: number;      // [0, 1] = 1 - |correlationToBtc|
  factor: number;                  // [factorMin, factorMax]
  coldStart: boolean;
  sampleCount: number;
  btcReferenceAvailable: boolean;
  isBtcSelfReference: boolean;
  label: 'IDIOSYNCRATIC' | 'DRIFTING' | 'NEUTRAL' | 'SELF_REFERENCE';
}

export function computePairCorrelation(
  pairSymbol: string,
  pairOhlc: OHLCData[],
  btcOhlc: OHLCData[] | null,
  config: PairCorrelationConfig,
): PairCorrelationResult {
  // 1. Self-reference guard (pair === btcReferenceSymbol)
  // 2. Cold-start guard (pairOhlc.length < min OR btcOhlc.length < min OR btcOhlc=null)
  // 3. Compute returns from each
  // 4. Spearman correlation
  // 5. decorrelationScore = 1 - |corr|
  // 6. Factor = clamp(min, max, 1 + decorr × sensitivity)
  // 7. Label from |corr| vs drifting/idiosyncratic thresholds
}

export function buildB68_3Alternate(
  realConfidence: number,
  realRegimeLabel: string,
  result: PairCorrelationResult,
  config: PairCorrelationConfig,
): FactorAlternate {
  // Counterfactual divide-out. Same pattern as B68.2.
}
```

Pure functions — no class, no state, no persistence.

#### **File 2:** `server/services/market-context-engine.ts`

1. Import `PairCorrelationConfig` type
2. Re-export `PairCorrelationConfig` from MCE
3. Add private field `pairCorrelationConfig: PairCorrelationConfig | null`
4. Add to `stop()`: clear field
5. New `refreshPairCorrelationConfig()` resolving 8 keys with hard-fail
6. Register in 8-method orchestrator (first-refresh Promise.all + groups array)
7. New accessor `getCurrentPairCorrelationConfig()`

Mirror exact pattern of `refreshVolumeRegimeConfig()` from B68.2.

#### **File 3:** `server/services/signal-orchestrator.ts`

Insert AFTER B68.2 volume-regime emit block, BEFORE B68.5 Path B ablation block (chain order: volume × pair_correlation):

```typescript
// ── B68.3 pair correlation (6th chain modulator) ─────────────────
const pairCorrelationConfig = mce.getCurrentPairCorrelationConfig();
if (pairCorrelationConfig !== null && symbolCtx !== null) {
  const ohlc = (rawSignal as any).ohlcData ?? (symbolCtx as any).ohlcData;
  // BTC reference — fetch from ohlcCache (XBT/USD primary, always present)
  const { ohlcCache } = await import('./ohlc-cache.js');
  const btcResult = await ohlcCache.getOHLCData(pairCorrelationConfig.btcReferenceSymbol, 60);
  const btcOhlc = btcResult?.ohlc ?? null;
  if (ohlc && Array.isArray(ohlc) && ohlc.length >= pairCorrelationConfig.minSamples) {
    try {
      const result = computePairCorrelation(rawSignal.symbol, ohlc, btcOhlc, pairCorrelationConfig);
      modulatedConfChain *= result.factor;
      ablationAlternates.push(
        buildB68_3Alternate(modulatedConfChain, regimeLabel, result, pairCorrelationConfig),
      );
      console.log(
        `[B68.3][correlation] pair=${rawSignal.symbol} corr=${result.correlationToBtc.toFixed(3)} ` +
          `decorr=${result.decorrelationScore.toFixed(3)} factor=${result.factor.toFixed(4)} ` +
          `label=${result.label}`,
      );
    } catch (err) {
      console.error('[B68.3][orchestrator] pair correlation emit failed:', err instanceof Error ? err.message : err);
    }
  }
}
```

Same any-cast deferral as B68.2 / B68.5 — silent skip when undefined; B67.5 fix.

#### **File 4:** `server/services/vts-runner.ts`

Mirror signal-orchestrator block. Function-scope `ohlcData` (correct path).

#### **File 5 (NEW):** `drizzle/migrations/2026-05-02-b68-3-pair-correlation.sql`

8 INSERTs in `pair_correlation` module per scope §F.

#### **File 6 (NEW):** `drizzle/migrations/2026-05-02-b68-3-pair-correlation-rollback.sql`

DELETE the 8 keys.

#### **File 7 (NEW):** `server/tests/unit/b68-3-pair-correlation.test.ts`

10+ cases per scope §A.5:
- Pure correlation +1 / pure anti-correlation -1 / zero correlation
- Cold-start: pair OHLC short / BTC OHLC null / BTC OHLC short
- Self-reference (pair = XBT/USD): factor=1.0, label=SELF_REFERENCE
- Factor clamps when sensitivity widened
- Label thresholds (IDIOSYNCRATIC ≤ 0.30, DRIFTING ≥ 0.70, NEUTRAL between)
- Spearman called with correct return arrays (length = N - 1)
- Counterfactual divide-out
- Zero-factor safety

### §B.2 Order of operations (Step 3)

1. Migration SQL (8 module_constants seeds)
2. `pair-correlation.ts` (pure functions + interfaces)
3. `market-context-engine.ts` — 8th refresh sub-method + state field + accessor + register in orchestrator
4. `signal-orchestrator.ts` — emit hook addition (active path)
5. `vts-runner.ts` — emit hook addition (VTS path) + 6-modulator chain update
6. Test file — at least 10 cases
7. `npm run check` clean; `npm test` clean
8. Bring diff to Langston (Step 4) BEFORE push

### §B.3 Risks I'm explicitly accepting

- **Pre-B67.5 modulation is decorative.** B68.3 modulates `regime_confidence_modulated` which has no consumer gate. Behavior change is observational.
- **Active-path orchestrator emit hook will silent-skip B68.3 ablation** when `MarketContext.ohlcData` any-cast is undefined. Same as B68.2 / B68.5; deferred to B67.5 (RUNNING_ISSUES #44).
- **Spearman noise at N=30** — v2 calibration follow-up if needed.
- **Per-quote-currency BTC reference** — v1 ships universal XBT/USD per Langston B.1/B.5.
- **Compound penalty stack getting tight.** Langston O.1: 6-multiplier worst-case ~0.455. After B68.1 ~0.43. **B67.5 floor decision is now urgent.** Logged in System Manual + RUNNING_ISSUES.

### §B.4 Rollback plan

- DB-only neutralization: `UPDATE module_constants SET value = '0.0'::jsonb WHERE constant_name = 'b68_3_sensitivity'` → factor always = 1.0.
- Full rollback: `git revert <commit>` and redeploy. Drop migration with rollback SQL.
- Ablation rows already emitted stay in `regime_factor_alternates` — no cleanup needed.

---

## §C. Verification Criteria (Step 11 closure — copy of scope §E)

- [ ] `regime_factor_alternates.factor_name = 'b68_3_pair_correlation'` rows appearing within 1h post-deploy
- [ ] `[B68.3][correlation]` log lines appearing in PM2 logs within 1h
- [ ] Distribution non-degenerate: at least two of {IDIOSYNCRATIC, DRIFTING, NEUTRAL} represented across pairs in first hour
- [ ] No `[B68.3]` errors in PM2 logs
- [ ] `regime_confidence_modulated` column reflects 6-multiplier chain
- [ ] `is_btc_self_reference: true` row present (XBT/USD pair) — sanity check
- [ ] All 4 CI checks GREEN (TS Check legacy baseline acceptable)
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] B68.3 mini-window officially starts (Day 0 of 14)
- [ ] Tier 1 governance updated: BATCH_CATALOG, MEMORY (truth + repo), master plan §0.11.B SHIPPED marker, BATCH_68_PROGRESS_REPORT B68.3 closure section
- [ ] Tier 2 governance: SIM (new component) + RUNNING_ISSUES (B68.3 calibration window observation)
- [ ] **System Manual updated with B67.5 post-composition-floor URGENT marker** (Langston O.1 cc-inbox #883)

---

## §D. Open questions for Langston (Step 2 review)

1. **BTC reference fetch latency in active-path emit hook.** The orchestrator emit hook currently fires synchronously (no `await`). Adding `await ohlcCache.getOHLCData(config.btcReferenceSymbol, 60)` introduces async overhead per signal eval (mitigated: BTC OHLC already cached from defensive-hedge fetch at vts-runner:2248 using `XXBTZUSD`). Acceptable for ablation hot path, or want to prefetch BTC OHLC into MCE state on the periodic refresh cadence and consume sync? Cleaner architecturally but adds a per-cycle data dependency.

2. **Spearman correlation cost on hot path.** O(N log N) for ranking each series. Per-pair per-eval × ~110 pairs/cycle × 60s cycle = ~110 × 30 sorts per minute. Trivial CPU but worth confirming. Alternative: pre-compute once per cycle in MCE, cache per-pair, consume sync at emit time. Adds infrastructure for negligible win. Lean ship-now-iterate?

3. **Anything missing or wrongly scoped in this pre-audit?**

---

*End of B68.3 Step 2 pre-audit. Awaiting Langston review.*
