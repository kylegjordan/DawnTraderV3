# BATCH 68.1 — Pre-Implementation Audit + Implementation Plan

**Companion to:** `BATCH_68_1_SCOPE.md` (Step 1 APPROVED, Langston cc-inbox #887, refinement D.1 incorporated)
**Step:** 2 of 11 per CLAUDE.md §2 workflow
**SIM consulted:** YES — see §A.1 below
**System Manual consulted:** YES — see §A.2 below
**Status:** APPROVED by Langston (cc-inbox #888, 2026-05-03). D.1 family map inside multi-tf-agreement.ts confirmed; D.2 OHLC-shape cleanup deferred + logged as RUNNING_ISSUES tech debt. Proceeding to Step 3.

---

## §A. SIM + System Manual Consultation

### §A.1 SIM-mapped components affected

Per CLAUDE.md §9. **Same blast-radius profile as B68.3** — pure additive: 1 new chain multiplier + 1 new ablation row type + 1 new MCE refresh sub-method (becomes the **9th** sub-method). Reuses existing `calculatePairRegime` from `market-regime.ts` (zero new regime logic) and `ohlcCache.getOHLCData` with a new interval key (`240`). **No DB-archive runtime dependency** — Kraken native 240-min OHLC consumed via the same in-memory cache infrastructure that already serves 60-min.

| # | Component | File | Change | Blast |
|---|---|---|---|---|
| 1 | Multi-TF agreement computation | `server/core/metrics/multi-tf-agreement.ts` (NEW) | Pure-function `computeMultiTfAgreement` (reuses `calculatePairRegime`) + `buildB68_1Alternate` + family map + config interface. | LOW (new isolated module) |
| 2 | MCE 9th refresh sub-method | `server/services/market-context-engine.ts` | Add `refreshMultiTfAgreementConfig()` (becomes 9-method orchestrator); `multiTfAgreementConfig` private field + `getCurrentMultiTfAgreementConfig()` accessor. No threading into `calculatePairRegime` (chain-only). | MEDIUM — orchestrator critical infra; B67.4 hotfix-#2 try/catch wrapper inherited unchanged. |
| 3 | Signal-orchestrator emit hook | `server/services/signal-orchestrator.ts` | Push `b68_1_multi_tf_agreement` ablation row + apply factor in chain. Insert AFTER B68.3 pair-correlation block (chain order: ... × pair_correlation × multi_tf_agreement). | MEDIUM — every signal in active path. Pre-B67.5 active trading is OFF → observational only. |
| 4 | VTS-runner emit hook | `server/services/vts-runner.ts` | Same pattern as orchestrator. Uses function-scope `ohlcData` (1h source for active TF) + fetches higher-TF series via `ohlcCache.getOHLCData(symbol, config.higherTfIntervalMinutes)` → cache key `${symbol}_240`. Updates `openTrade.regimeConfidenceModulated` to reflect 7-modulator chain. | MEDIUM — every VTS signal. |
| 5 | OHLC Cache (SIM §2.6) | `server/services/ohlc-cache.ts` (NO CODE CHANGE) | New cache key per pair: `${symbol}_240`. Generic cache infrastructure already supports any Kraken-supported interval. ~177 pairs × ~720 candles × 80 bytes = ~10MB additional in-memory state. 5-min TTL same as 60-min keys. | LOW — additive cache entries; existing eviction (cleanup at 2×TTL) handles them. |
| 6 | Module constants | `module_constants` table | Add 8 new keys in `multi_tf_agreement` module (additive, no schema change). | LOW. |
| 7 | Tests | `server/tests/unit/b68-1-multi-tf-agreement.test.ts` (NEW) | Pure-function tests + family-map tests. | NONE. |

**Upstream feeders unchanged:**
- `ohlcCache` — already provides 60-min OHLC; will provide 240-min via the same code path with a different `interval` arg.
- `KrakenService.getOHLCData(symbol, 240, ...)` — already supported. Kraken's REST endpoint accepts interval values from {1, 5, 15, 30, 60, 240, 1440, 10080, 21600}.
- `calculatePairRegime` from `market-regime.ts` — pure function, reused unchanged. Called twice per signal eval (once for active-TF regime via existing path; once for higher-TF regime via this batch's hook).
- All B67.x + B68.2 + B68.3 + B68.4 + B68.5 chain factors unchanged.

**Downstream consumers — IMPACTED:**
- `paper_sim_trades.regime_confidence_modulated` column — reflects 7-multiplier chain (was 6 after B68.3). Other columns unchanged.
- B67.0 ablation framework emitter — receives ONE new factor type. Generic emitter, no code change needed.
- `replay-ablation.ts` — generic; processes `b68_1_multi_tf_agreement` rows alongside the existing 9 factor types. No code change.
- `computeFactorCalibration()` aggregator — generic; surfaces `b68_1_multi_tf_agreement` automatically once n ≥ 150 per bucket. No code change.
- `FactorCalibrationSection` UI — same generic auto-extension.
- B67.5 future consumer wiring — reads more meaningful confidence post-calibration.

**Shared state:**
- No new persistent state. Pure-function score over OHLC cache.
- `ohlcCache` in-memory map gains ~177 new keys (one per active pair on the 240-min interval).
- `module_constants` — 8 new rows.

**Background execution:**
- No new timers / intervals.
- MCE refresh adds 8 more constant resolutions per cycle (negligible).
- Score computation cost: ONE `ohlcCache.getOHLCData` call (higher-TF series for the same pair) + ONE `calculatePairRegime` call on ~30 candles (computeVolatility/Momentum/ADX, all pure linear-in-N functions). Trivial vs. existing classifier work.

### §A.2 System Manual sections to update on close

- Modulation chain ordering: `raw × macro × phase × freshness × outcome × volume_regime × pair_correlation × multi_tf_agreement → clamp [0.45, 1.0]` (one new term appended; floor reflects B67.5-prep raise from 0.40).
- New §"Multi-Timeframe Agreement (B68.1)": active-TF=1h / higher-TF=4h split, `calculatePairRegime` reuse pattern, family map (5 regimes → 4 families), three-state classification (CONFIRMED / COMPATIBLE / CONFLICTED), asymmetric factor [0.92, 1.05], higher-TF DBS=0 v1 limitation.
- SIM §2.6 update: OHLC Cache now serves a second interval per pair (60-min and 240-min keys coexist; ~10MB additional memory).
- Calibration-window note: B68.1's 14d mini-window starts at deploy; runs in parallel with the still-running B67.4 + B68.2 + B68.3 windows (B68.1 is the 4th concurrent window).
- **Floor-engagement observability note:** with 7 modulators, worst-case compound is `0.85⁴ × 0.92² × 0.95 ≈ 0.419` — below the new 0.45 floor. Floor will engage in worst-case scenarios. **This is signal, not bug** — captured in ablation metadata (`confidence_with_factor` reflects clamp; `confidence_without_factor` shows pre-clamp value).

### §A.3 Cascade risk check

| Risk | Verdict | Mitigation |
|---|---|---|
| 7-multiplier chain compound penalty stack engaging the 0.45 floor | Worst case ~0.419 (Langston O.1 cc-inbox #887). Floor engagement is intentional + observational. B67.5-prep raised the floor in advance for exactly this. | Floor-binding rows are visible in ablation metadata; calibration analysis can quantify how often it actually fires. Non-blocking. |
| 240-min OHLC cache cold-start on every pair on first MCE cycle post-deploy | Cold-start window ~5 min (TTL). Until first cache hit, every pair returns coldStart=true factor=1.0. Identical to how 60-min cache cold-starts on PM2 restart. | Acceptable — calibration cohort filters cold-start rows. Logged via `cold_start: true` ablation flag. |
| Higher-TF Path-A-only classification misclassifies DBS-driven 4h moves as ST | ST is universally COMPATIBLE so the worst case is "missed boost" (factor=1.00 instead of 1.05), never "false penalty" (0.95). | v2 4h DBS upgrade if calibration shows the missed-boost rate is meaningful. Non-blocking for v1. |
| Kraken API load increase from 4h cache fetches | +1 cache key per pair × 5min TTL × 177 pairs = ~2,124 extra Kraken calls/hr. Within tier-2 limits with margin. | TTL same as existing keys; load symmetric. No mitigation needed. |
| MCE 9th sub-method failure cascade | Inherits B67.4 hotfix-#2 try/catch wrapper unchanged. | Validated. |
| Ablation row volume +10% per cycle (10 factor types vs 9) | ~1100 → ~1210 rows/cycle. Trivial at VTS scale; 90-day retention sweep already in `replay-ablation.ts`. | No mitigation needed. |
| `calculatePairRegime` called twice per signal eval (active-TF + higher-TF) | Doubles classifier work per eval. Function is pure, ~30-candle linear-time math. Profile-negligible — well under 1ms even at full cycle. | Ship-now-iterate. |
| B68.1 conceptually correlated with B68.5 Path B sustainability (per Langston O.2 cc-inbox #887) | Both check structural support across timeframes. Risk: chain double-counts. | Ablation framework attributes them as separate factors over the same trades — calibration data will reveal whether marginal signal is meaningful or one is redundant. Post-window analysis decision. |
| 240-min cache fetch latency in active-path emit hook | Cache read: microseconds when warm. First fetch per pair: ~200ms (Kraken REST). Hot-path concern is bounded: only first cycle after PM2 restart pays the warmup. Subsequent cycles serve from in-memory cache for 5min. | Same async pattern as existing B68.3 BTC-fetch hook (already in production). Acceptable. |

**Net:** B68.1 is observational pre-B67.5 (no consumer reads as gate). The compound-penalty stack is now expected to engage the 0.45 floor in worst-case — that's the calibration signal we want to observe. The B68.5 correlation concern (Langston O.2) is a post-window analysis question, not an implementation blocker.

### §A.4 Pre-audit findings (initial scan)

**Finding 1 — VTS-runner BTC-OHLC fetch pattern is the right reference template.** B68.3's vts-runner hook (line 1559–1600) shows the canonical async-cache-fetch pattern: `await ohlcCache.getOHLCData(symbol, interval)` → map raw Kraken candles to `OHLCData` shape (parseFloat on string fields, derive timestamp from `c.timestamp || c[0] * 1000`) → guard length → call pure function. B68.1 uses the same pattern with the pair's own symbol and interval=240.

**Finding 2 — The OHLC-shape map is non-trivial.** Kraken raw candles come back with stringified numbers and dual-shape access (`c.open || c[1]`). The B68.3 hook re-implements this map inline. Recommend extracting it to a shared helper if we touch it again — but for B68.1 v1, mirror the inline pattern (tactical refactor candidate for future cleanup, not B68.1 scope).

**Finding 3 — Active-path emit hook silent-skip pattern.** B68.2 / B68.3 / B68.5 all silent-skip their ablation row in the active-path orchestrator when `MarketContext.ohlcData` any-cast is undefined. RUNNING_ISSUES #44 / #45 track this for B67.5 consumer wiring. **B68.1 inherits the same deferral** — the orchestrator-side hook will silent-skip until B67.5 wires real OHLC propagation through `MarketContext`. The VTS-side hook works correctly via the function-scope `ohlcData` parameter (the path B68.4 hotfix #3 fixed for B68.5 / B68.2 / B68.3).

**Finding 4 — Higher-TF source confirmation: Kraken `interval=240` is supported and untouched by anything else.** Grep confirms no existing code path uses `getOHLCData(_, 240)`. B68.1 is the first consumer of the 4h cache key. No collision with existing data flows.

**Finding 5 — Family-map placement.** The five regimes live in `server/config/canonical-regime-strategy-map.ts` as the `REGIMES` const. The family map is logic-adjacent to that const but is B68.1-specific. Recommend placing it inside `multi-tf-agreement.ts` rather than mutating `canonical-regime-strategy-map.ts` — keeps the regime canonical map untouched (zero blast radius) and the family logic colocated with its only consumer. **Open Q D.1 for Langston: confirm placement inside multi-tf-agreement.ts vs canonical-regime-strategy-map.ts.**

---

## §B. Implementation Plan

### §B.1 File-by-file edit map

#### **File 1 (NEW):** `server/core/metrics/multi-tf-agreement.ts`

```typescript
import {
  calculatePairRegime,
  DEFAULT_REGIME_CONFIG,
} from './market-regime.js';
import type {
  OHLCData,
  RegimeConfig,
  MarketRegimeType,
} from '../../types/market-regime.types.js';
import { REGIMES } from '../../config/canonical-regime-strategy-map.js';
import type {
  FactorAlternate,
  RegimeDecision,
} from '../../services/factor-ablation-emitter.js';

export type RegimeFamily = 'directional' | 'range' | 'volatile' | 'transition';

/** Family map: 5 regimes → 4 families. Logic-only; not tunable. */
export const REGIME_FAMILY: Record<MarketRegimeType, RegimeFamily> = {
  [REGIMES.TREND_FRIENDLY_STABLE]:    'directional',
  [REGIMES.IMPULSE_EXPANSION]:        'directional',
  [REGIMES.RANGE_BOUND_STABLE]:       'range',
  [REGIMES.HIGH_VOLATILITY_UNSTABLE]: 'volatile',
  [REGIMES.STRUCTURAL_TRANSITION]:    'transition',
};

export interface MultiTfAgreementConfig {
  higherTfIntervalMinutes: number;
  minHigherTfSamples: number;
  factorMin: number;
  factorMax: number;
  sensitivity: number;
  compatibleScore: number;
  confirmedScore: number;
  conflictedScore: number;
}

export interface MultiTfAgreementResult {
  activeTfRegime: MarketRegimeType;
  higherTfRegime: MarketRegimeType | null;
  higherTfSampleCount: number;
  higherTfVolatility: number;
  higherTfMomentum: number;
  higherTfAdx: number;
  higherTfConfidence: number;
  agreement: 'CONFIRMED' | 'COMPATIBLE' | 'CONFLICTED' | 'COLD_START';
  agreementScore: number;
  factor: number;
  coldStart: boolean;
}

/**
 * Pure function: classify higher-TF regime and compute agreement factor.
 * Higher-TF DBS hardcoded to 0 in v1 (Path A only — see scope §A.2.1).
 */
export function computeMultiTfAgreement(
  activeTfRegime: MarketRegimeType,
  higherTfOhlc: OHLCData[] | null,
  config: MultiTfAgreementConfig,
  regimeConfig: RegimeConfig = DEFAULT_REGIME_CONFIG,
): MultiTfAgreementResult {
  // Cold-start guard
  if (!higherTfOhlc || higherTfOhlc.length < config.minHigherTfSamples) {
    return {
      activeTfRegime,
      higherTfRegime: null,
      higherTfSampleCount: higherTfOhlc?.length ?? 0,
      higherTfVolatility: 0,
      higherTfMomentum: 0,
      higherTfAdx: 0,
      higherTfConfidence: 0,
      agreement: 'COLD_START',
      agreementScore: 0,
      factor: 1.0,
      coldStart: true,
    };
  }

  // Higher-TF classification — Path A only (DBS=0, slope=0). Macro=1.0 (no compounding).
  const higherTfResult = calculatePairRegime(higherTfOhlc, 0, 0, 1.0, regimeConfig);

  // Three-state agreement
  const sameLabel = higherTfResult.regime === activeTfRegime;
  const sameFamily =
    REGIME_FAMILY[higherTfResult.regime] === REGIME_FAMILY[activeTfRegime];
  // ST (transition family) is universally COMPATIBLE — never escalates to CONFLICTED.
  const eitherIsTransition =
    REGIME_FAMILY[higherTfResult.regime] === 'transition' ||
    REGIME_FAMILY[activeTfRegime] === 'transition';

  let agreement: MultiTfAgreementResult['agreement'];
  let agreementScore: number;
  if (sameLabel) {
    agreement = 'CONFIRMED';
    agreementScore = config.confirmedScore;
  } else if (sameFamily || eitherIsTransition) {
    agreement = 'COMPATIBLE';
    agreementScore = config.compatibleScore;
  } else {
    agreement = 'CONFLICTED';
    agreementScore = config.conflictedScore;
  }

  // factor = clamp(min, max, 1.0 + (score - 0.5) × sensitivity × 2)
  const raw = 1.0 + (agreementScore - 0.5) * config.sensitivity * 2;
  const factor = Math.max(config.factorMin, Math.min(config.factorMax, raw));

  return {
    activeTfRegime,
    higherTfRegime: higherTfResult.regime,
    higherTfSampleCount: higherTfOhlc.length,
    higherTfVolatility: higherTfResult.volatility,
    higherTfMomentum: higherTfResult.momentum,
    higherTfAdx: higherTfResult.adx,
    higherTfConfidence: higherTfResult.confidence,
    agreement,
    agreementScore,
    factor,
    coldStart: false,
  };
}

export function buildB68_1Alternate(
  realConfidence: number,
  realRegimeLabel: string,
  result: MultiTfAgreementResult,
  config: MultiTfAgreementConfig,
): FactorAlternate {
  const confidenceWithoutFactor =
    result.factor > 0 ? realConfidence / result.factor : realConfidence;

  const alternate: RegimeDecision = {
    regimeLabel: realRegimeLabel,
    confidence: confidenceWithoutFactor,
    admissionPossible: true,
    metadata: {
      active_tf_regime: result.activeTfRegime,
      higher_tf_regime: result.higherTfRegime,
      higher_tf_interval_minutes: config.higherTfIntervalMinutes,
      higher_tf_sample_count: result.higherTfSampleCount,
      higher_tf_volatility: result.higherTfVolatility,
      higher_tf_momentum: result.higherTfMomentum,
      higher_tf_adx: result.higherTfAdx,
      higher_tf_confidence: result.higherTfConfidence,
      higher_tf_dbs_score: 0,    // Refinement D.1 (Langston cc-inbox #887)
      higher_tf_dbs_slope: 0,    // Refinement D.1
      agreement: result.agreement,
      agreement_score: result.agreementScore,
      multi_tf_factor: result.factor,
      confidence_with_factor: realConfidence,
      confidence_without_factor: confidenceWithoutFactor,
      cold_start: result.coldStart,
    },
  };

  return {
    factorName: 'b68_1_multi_tf_agreement',
    factorState: 'alternate_disabled',
    alternateDecision: alternate,
  };
}
```

Pure functions — no class, no state, no persistence.

#### **File 2:** `server/services/market-context-engine.ts`

1. Import `MultiTfAgreementConfig` type
2. Re-export `MultiTfAgreementConfig` from MCE
3. Add private field `multiTfAgreementConfig: MultiTfAgreementConfig | null`
4. Add to `stop()`: clear field
5. New `refreshMultiTfAgreementConfig()` resolving 8 keys with hard-fail
6. Register in 9-method orchestrator (first-refresh `Promise.all` + groups array)
7. New accessor `getCurrentMultiTfAgreementConfig()`

Mirror exact pattern of `refreshPairCorrelationConfig()` from B68.3.

#### **File 3:** `server/services/signal-orchestrator.ts`

Insert AFTER B68.3 pair-correlation emit block (chain order: ... × pair_correlation × multi_tf_agreement). Same any-cast deferral as B68.2 / B68.3 / B68.5 — silent-skip when undefined; B67.5 fix.

```typescript
// ── B68.1 multi-TF agreement (7th chain modulator, 2026-05-XX) ────────
const multiTfConfig = mce.getCurrentMultiTfAgreementConfig();
if (multiTfConfig !== null && symbolCtx !== null) {
  const ohlc = (rawSignal as any).ohlcData ?? (symbolCtx as any).ohlcData;
  if (ohlc && Array.isArray(ohlc)) {
    try {
      const { ohlcCache } = await import('./ohlc-cache.js');
      const higherRaw = await ohlcCache.getOHLCData(
        rawSignal.symbol,
        multiTfConfig.higherTfIntervalMinutes,
      );
      const higherTfOhlc = (higherRaw?.ohlc ?? []).map((c: any) => ({
        open: parseFloat(c.open || c[1]),
        high: parseFloat(c.high || c[2]),
        low: parseFloat(c.low || c[3]),
        close: parseFloat(c.close || c[4]),
        volume: parseFloat(c.volume || c[6] || 0),
        timestamp: c.timestamp || c[0] * 1000,
      }));
      const result = computeMultiTfAgreement(
        regimeLabel as MarketRegimeType,
        higherTfOhlc.length >= multiTfConfig.minHigherTfSamples ? higherTfOhlc : null,
        multiTfConfig,
        fullRegimeConfig ?? undefined,
      );
      modulatedConfChain *= result.factor;
      ablationAlternates.push(
        buildB68_1Alternate(modulatedConfChain, regimeLabel, result, multiTfConfig),
      );
      console.log(
        `[B68.1][multi-tf] pair=${rawSignal.symbol} active=${result.activeTfRegime} ` +
          `higher=${result.higherTfRegime ?? 'COLD'} agree=${result.agreement} ` +
          `factor=${result.factor.toFixed(4)}`,
      );
    } catch (err) {
      console.error(
        '[B68.1][orchestrator] multi-tf emit failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }
}
```

#### **File 4:** `server/services/vts-runner.ts`

Mirror signal-orchestrator block, using function-scope `ohlcData` (correct path that B68.4 hotfix #3 fixed). Same higher-TF cache fetch pattern. Insert AFTER B68.3 pair-correlation emit block (currently ends at line ~1600).

#### **File 5 (NEW):** `drizzle/migrations/2026-05-XX-b68-1-multi-tf-agreement.sql`

8 INSERTs in `multi_tf_agreement` module per scope §F.

#### **File 6 (NEW):** `drizzle/migrations/2026-05-XX-b68-1-multi-tf-agreement-rollback.sql`

DELETE the 8 keys.

#### **File 7 (NEW):** `server/tests/unit/b68-1-multi-tf-agreement.test.ts`

12+ cases per scope §A.7. Test fixtures use pure-function `calculatePairRegime` outputs (no mocking — fixture OHLC arrays sized to land on each regime branch).

### §B.2 Order of operations (Step 3)

1. Migration SQL (8 module_constants seeds)
2. `multi-tf-agreement.ts` (pure functions + interfaces + family map)
3. `market-context-engine.ts` — 9th refresh sub-method + state field + accessor + register in orchestrator
4. `signal-orchestrator.ts` — emit hook addition (active path)
5. `vts-runner.ts` — emit hook addition (VTS path) + 7-modulator chain update
6. Test file — at least 12 cases
7. `npm run check` clean; `npm test` clean
8. Bring diff to Langston (Step 4) BEFORE push

### §B.3 Risks I'm explicitly accepting

- **Pre-B67.5 modulation is decorative.** B68.1 modulates `regime_confidence_modulated` which has no consumer gate. Behavior change is observational.
- **Active-path orchestrator emit hook will silent-skip B68.1 ablation** when `MarketContext.ohlcData` any-cast is undefined. Same as B68.2 / B68.3 / B68.5; deferred to B67.5 (RUNNING_ISSUES #44).
- **Higher-TF DBS=0 v1.** Path A only — accepted per Langston cc-inbox #887 B.2.
- **Compound penalty stack engages 0.45 floor in worst case.** Intentional + observational per Langston O.1 cc-inbox #887.
- **Inline OHLC-shape map duplicated from B68.3.** Tactical refactor candidate for a future cleanup batch; out of scope here.

### §B.4 Rollback plan

- DB-only neutralization: `UPDATE module_constants SET value = '0.0'::jsonb WHERE constant_name = 'b68_1_sensitivity'` → factor always = 1.0.
- DB-only stronger neutralization: `UPDATE module_constants SET value = '1.0'::jsonb WHERE constant_name IN ('b68_1_factor_min', 'b68_1_factor_max')` → factor pinned at 1.0 regardless.
- Full rollback: `git revert <commit>` and redeploy. Drop migration with rollback SQL.
- Ablation rows already emitted stay in `regime_factor_alternates` — no cleanup needed.

---

## §C. Verification Criteria (Step 11 closure — copy of scope §E)

- [ ] `regime_factor_alternates.factor_name = 'b68_1_multi_tf_agreement'` rows appearing within 1h post-deploy
- [ ] `[B68.1][multi-tf]` log lines appearing in PM2 logs within 1h
- [ ] Distribution non-degenerate: at least two of {CONFIRMED, COMPATIBLE, CONFLICTED} represented across pairs in first hour
- [ ] No `[B68.1]` errors in PM2 logs
- [ ] `regime_confidence_modulated` column reflects 7-multiplier chain
- [ ] OHLC cache shows new 240-min cache keys populated for active universe within first cycle
- [ ] All 4 CI checks GREEN (TS Check legacy baseline acceptable)
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] B68.1 mini-window officially starts (Day 0 of 14)
- [ ] Tier 1 governance updated: BATCH_CATALOG, MEMORY (truth + repo), master plan §0.11.B SHIPPED marker, BATCH_68_PROGRESS_REPORT B68.1 closure section
- [ ] Tier 2 governance: SIM (multi-tf-agreement.ts NEW + ohlc-cache 240-min note + chain extension) + RUNNING_ISSUES (B68.1 calibration window observation entry)

---

## §D. Open questions for Langston (Step 2 review)

1. **Family-map placement.** Pre-audit Finding 5 — keep family map inside `multi-tf-agreement.ts` (logic colocated with consumer; canonical regime map untouched) vs export from `canonical-regime-strategy-map.ts` (logical home for regime taxonomy)? Lean inside multi-tf-agreement.ts for v1 — minimum blast radius.

2. **OHLC-shape map duplication.** Inline parseFloat-and-derive-timestamp map is now in 3 places (B68.3 vts-runner + B68.3 orchestrator + this batch's two new hooks). Worth a tactical cleanup as part of B68.1 (extract shared helper) or defer to a dedicated cleanup batch? Lean defer — keeping B68.1 surgical.

3. **Higher-TF cache cold-start: should the first-cycle `[B68.1][multi-tf]` log line include a special "warming" tag so we can quickly tell from logs how long warmup takes in production?** Lean yes (additive log info, zero blast).

4. **Higher-TF ohlcData mapping: should we use `chartTime` field if present from Kraken response, or stick with `c.timestamp || c[0] * 1000` like B68.3?** Lean stick with B68.3 pattern — consistency over correctness here (both work; the B68.3 pattern is field-tested).

5. **Anything missing or wrongly scoped in this pre-audit?**

---

*End of B68.1 Step 2 pre-audit. Awaiting Langston review.*
