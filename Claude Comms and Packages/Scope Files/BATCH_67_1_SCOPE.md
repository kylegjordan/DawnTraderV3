# Batch 67.1 — Scope (Macro Confidence Modifier)

**Sub-deliverable:** B67.1 — Macro Confidence Modifier (3 of 6 in B67 chain, ships first per scope §3 dependency)
**Author:** Claude Code
**Date:** 2026-04-28
**Status:** APPROVED 2026-04-28 by Langston (cc-inbox #844, Telegram #3230) with 3 substantive additions folded in (z-score sample floor, raw-8h funding-rate convention, B67.5 composition floor pre-registration). STEP-1 + STEP-2 complete.
**Parent:** `BATCH_67_SCOPE.md` §6 (this doc supersedes that section as the binding sub-deliverable scope)
**Sequencing:** Ships before B67.2 per Option A serial agreement (cc-inbox #842, Telegram #3225). 24h shadow soak in production before B67.2 implementation begins.

---

## 1. Why this batch exists

Per the master regime overhaul planning doc (`REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0.6) and the canonical 04-22 hostile-day evidence: the per-pair regime classifier has zero visibility into macro market state. On 04-22, globalRegime reported "trend-friendly stable, 98% bullish" while BTC dominance was rising sharply — a contrarian flag the system could not see. 177 strong-bull-trend trades fired; 84% lost.

B67.1 introduces an **external-data-driven multiplier** on the per-pair regime classifier's confidence number. The classifier label stays unchanged (TFS still means TFS); only the confidence is modulated. Range: 0.85–1.05× initially. Inputs: BTC dominance, derivatives funding rates, total-market-cap momentum.

Architecture is Langston's Option C from the master plan — chosen over Option A (alongside the classifier) and Option B (inside the classifier formula) for smaller blast radius and cleaner attribution.

**Critical context:** confidence is NOT consumed by any downstream decision today. B63 Item 18 audit confirmed FinalScore, PredConf, RegimeWeight, and RTB ranking all ignore `RegimeClassification.confidence`. `isHighConfidenceRegime()` is defined but has zero callers (verified 2026-04-28 via grep). B67.1 modulates a number that nothing currently reads. **B67.5 wires the downstream consumers** — only after the calibration check (scope §8) passes. This sequencing is intentional: ship the new value, observe it via B67.0 ablation framework, validate calibration, then connect.

---

## 2. Operating-mode context

Active trading is currently STOPPED. VTS continues; B67.0 ablation hooks fire on every signal evaluation regardless of trade execution. B67.1 ships in **shadow mode** (`b67_1_enabled=false`) for ≥24h after deploy to confirm the macro feed is stable, the modifier values look sane on the ablation rows, and the classifier output (now `confidence × modifier` when enabled) clamps within bounds. Activation via `module_constants` flip; no code redeploy required.

---

## 3. Numbered objectives

1. **External macro feed in production.** A new service `server/services/external-macro-feed.ts` polls CoinGecko (BTC dominance, total mcap) and Binance public futures (funding rates aggregated across top BTC + ETH perps). 60s cache. Stale-data flag at 300s.
2. **Macro modifier formula computes a value in [0.85, 1.05].** Pure function `computeMacroModifier(macroSnapshot)` returns `{ value, btcDomZ, fundingZ, mcapZ, fallbackActive, staleDataFlag }`. Z-scores computed against rolling 30-day baseline. **Z-score sample floor: min 48 samples** before z-scores are considered valid — below that, force `value=1.0` and `fallbackActive=true`. Covers post-restart cold start where the in-memory baseline is thin (Langston cc-inbox #844 §6.2).

   **Funding rate normalization:** Binance reports 8h funding rates; B67.1 z-scores **raw 8h rates** (no annualization conversion). Documented inline in `external-macro-feed.ts`. Z-scoring removes the time-unit dependency anyway.
3. **MCE stores the macro snapshot per cycle.** `market-context-engine.ts` `computeContext()` reads the latest macro snapshot (cached in the feed service) and threads it through to the regime classifier.
4. **`calculatePairRegime()` applies the modifier to confidence post-classification.** Label preserved; confidence multiplied by macro modifier value. Final clamp range expanded if needed to accommodate modifier (post-modifier upper bound = 0.95 × 1.05 = 0.9975 → clamp upper raised to 1.0; lower 0.4 × 0.85 = 0.34 → lower stays 0.4 as a hard floor).
5. **B67.0 ablation hook fires per signal evaluation with the agreed JSONB shape.** `factor_name='b67_1_macro_modifier'`, `alternate_decision = { confidence_with_modifier, confidence_without_modifier, modifier_value, btc_dom_z, funding_z, mcap_z, fallback_active, stale_data_flag }`. Per Langston cc-inbox #842 review.
6. **Existing `market-snapshot.ts` stub is reconciled, not parallel-created.** The pre-existing `MarketSnapshot` type already declares `btcDominance` + `totalMarketCapUsd` + `avgVolatility30d` fields with stub values (`54.2`, `2.36e12`, etc.). B67.1 reconciles by either (a) re-using `MarketSnapshot` as the carrier type and replacing the stub `getMarketSnapshot()` body with real data from `external-macro-feed.ts`, or (b) deprecating `market-snapshot.ts` and migrating its callers. Decision deferred to Step 3 once we grep `getMarketSnapshot` callers — but the no-parallel-structure rule is binding.
7. **Pre-existing BTC-correlation logic in `defensive-hedge.ts` is documented as orthogonal, not in conflict.** That strategy uses per-pair Spearman correlation between asset and BTC returns as an entry filter; B67.1 uses BTC dominance (macro market-structure %) as a regime confidence modifier. No double-count risk; documented in pre-audit §3.4 + SIM update.
8. **Fallback graceful when feeds fail.** When CoinGecko or Binance public-futures endpoints are unreachable, rate-limited, or return data older than `b67_1_external_feed_stale_seconds`, modifier returns 1.0 (neutral) and `stale_data_flag` is set on the ablation row. Telemetry logs loudly in PM2 with `[B67.1][stale]` prefix.
9. **Shadow-mode default at deploy.** `b67_1_enabled=false` in seed migration. Activation via `UPDATE module_constants SET value='true'::jsonb WHERE module_name='macro_modifier' AND constant_name='b67_1_enabled'`.
10. **All new constants land in `module_constants`** per the post-B67 governance rule (§0.9 of master plan, codified in CLAUDE.md §5 critical rule 14 to be added in next governance pass). No hardcoded thresholds.

---

## 4. module_constants entries (10 rows in `macro_modifier` module)

| Constant | Type | Default | Notes |
|---|---|---|---|
| `b67_1_enabled` | bool | `false` | SHADOW at deploy. Flip to true after 24h soak + Langston Step-7 ack. |
| `b67_1_btc_dominance_weight` | float | `0.40` | Theory-prior seed; recalibrate after 14d. |
| `b67_1_funding_weight` | float | `0.35` | Theory-prior seed; recalibrate after 14d. |
| `b67_1_mcap_momentum_weight` | float | `0.25` | Theory-prior seed; recalibrate after 14d. |
| `b67_1_modifier_min` | float | `0.85` | Conservative initial band. |
| `b67_1_modifier_max` | float | `1.05` | Conservative initial band. |
| `b67_1_external_feed_cache_seconds` | int | `60` | Aligns with MCE cycle. |
| `b67_1_external_feed_stale_seconds` | int | `300` | 5 min — beyond this, stale fallback fires. |
| `b67_1_btc_dominance_zscore_lookback_days` | int | `30` | Rolling baseline window. |
| `b67_1_funding_zscore_lookback_days` | int | `30` | Rolling baseline window. |
| `b67_1_zscore_min_sample_count` | int | `48` | Minimum samples before z-score is valid. Below this → modifier=1.0 + `fallbackActive=true`. Covers cold start (Langston cc-inbox #844 §6.2). |

**Inline migration comment:** `-- B67.1 SEED VALUES — recalibrate after 14d post-activation from B67.0 ablation rows on hostile-day cohorts. See REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md §0 + cc-inbox #842 #843 for the recalibration methodology.`

---

## 5. Files affected

### New files (3)

| File | Purpose | Approx lines |
|---|---|---:|
| `drizzle/migrations/2026-04-28-b67-1-macro-modifier.sql` | 10 module_constants seeds + rollback companion | ~70 |
| `server/services/external-macro-feed.ts` | CoinGecko + Binance public-futures polling, 60s cache, stale flag, retries with exponential backoff. Singleton service. | ~220 |
| `server/core/metrics/macro-modifier.ts` | Pure `computeMacroModifier(snapshot, weights, range, baselines)` function returning the alternate-decision JSONB shape. | ~140 |
| `drizzle/migrations/2026-04-28-b67-1-rollback.sql` | Symmetric rollback. | ~20 |
| `server/tests/unit/b67-1-macro-modifier.test.ts` | Unit tests: clamp behavior, weight math, z-score normalization, fallback path. | ~180 |
| `server/tests/unit/b67-1-feed-fallback.test.ts` | Stale-feed → modifier=1.0 + flag set. | ~60 |

### Modified files (5)

| File | Change |
|---|---|
| `shared/schema.ts` | If feed history persistence is needed, add a `macro_feed_history` table for the rolling-30d z-score baseline. Otherwise no change. **Decision deferred to Step-2 pre-audit.** |
| `server/types/market-context.ts` | Extend `MarketContext` with optional `macro?: MacroContext` field. New `MacroContext` interface: `{ snapshot: MarketSnapshot, modifier: { value, btcDomZ, fundingZ, mcapZ, fallbackActive, staleDataFlag } | null }`. Null when `b67_1_enabled=false`. |
| `server/services/market-context-engine.ts` | `computeContext()` reads `externalMacroFeed.getLatest()` and (if `b67_1_enabled`) calls `computeMacroModifier(...)`. Result attached to MarketContext.macro. Confidence modulation applied in `calculatePairRegime()` itself, NOT in MCE — keeps the formula change scoped to one file. |
| `server/core/metrics/market-regime.ts` | `calculatePairRegime(ohlcData, dbsScore, macroModifier?)` accepts optional `macroModifier` param. When provided AND `b67_1_enabled`, applies `confidence *= macroModifier` BEFORE the existing clamp. Clamp upper bound raised from 0.95 → 1.0 (nothing in the codebase asserts the prior 0.95 ceiling — verified). |
| `server/services/factor-ablation-emitter.ts` | Extend the existing emit function call sites in signal-orchestrator + vts-runner so the alternate row carries the B67.1 factor with the agreed JSONB shape when modulation runs. (No emitter API change — alternate is just a JSONB blob. Wire-up in the call sites of B67.0.) |
| `server/services/market-snapshot.ts` | **Reconcile per objective #6.** Replace stub body with a thin wrapper that returns the latest snapshot from `external-macro-feed.ts`. Preserves the existing type signature so any pre-existing callers continue to work. |

---

## 6. Architecture (recap from master plan §0 + Langston review)

```
real_confidence = clamp(0.4, 1.0, base_classifier_confidence × macro_modifier)

macro_modifier = clamp(0.85, 1.05,
  1.0
  + btc_dominance_weight × (-btc_dom_zscore)      // rising dominance penalizes alt confidence
  + funding_weight       × (-funding_zscore)      // crowded funding penalizes momentum confidence
  + mcap_momentum_weight × (mcap_momentum_zscore) // rising mcap confirms breadth
)

z-scores: rolling 30-day baseline, computed on every cycle
```

Sign convention: BTC dominance and funding penalize when extreme positive (the contrarian frame); mcap momentum reinforces when positive. Verified against the canonical 04-22 case in §7 of the master plan.

---

## 7. Verification criteria

| Check | Pass criterion |
|---|---|
| TypeScript clean | `npx tsc --noEmit` zero new errors |
| CI green | All 4 checks (TS, Test Suite, Build, Docker) |
| Migration applied | `npm run db:migrate` clean; 10 rows in `module_constants` `macro_modifier` module |
| Macro feed alive | PM2 logs show `[B67.1][feed] btc_dom=X.X% funding=X.X% mcap_mom=X.X%` every 60s |
| Modifier clamps | Unit test confirms clamp [0.85, 1.05] under extreme z-score inputs |
| Confidence clamps | Unit test confirms post-modulation clamp [0.4, 1.0] |
| Fallback graceful | Unit test: feed unreachable → modifier=1.0 + `stale_data_flag=true` + `[B67.1][stale]` log |
| Ablation rows populated | After 1h shadow run, `regime_factor_alternates` has rows with `factor_name='b67_1_macro_modifier'` and the agreed JSONB shape |
| No-double-count documented | Pre-audit §3.4 explicitly maps `defensive-hedge` BTC-correlation + B67.1 BTC-dominance to different decision points |
| Pre-existing stub reconciled | `market-snapshot.ts` either re-used or migrated; no parallel `MarketSnapshot` carrier types |
| `b67_1_enabled=false` at deploy | Confirmed in PM2 logs by absence of `[B67.1][modifier]` lines until DB flip |
| Active activation cycle | After flip → first PM2 line shows applied modifier; first ablation row shows `confidence_with_modifier !== confidence_without_modifier` |

---

## 8. Pre-registered success thresholds (per master plan §0.1 decision 11)

After 14 days of post-activation observation, B67.1 is judged successful if **at least one** of:

1. Hostile-day cohort WR (system-wide WR < 25% days) improves by ≥3pp vs the matched pre-B67.1 14d window.
2. B67.0 counterfactual analysis shows the modifier's `realAdmitAltReject` cohort (real admitted, modifier-disabled would have admitted at higher confidence) has lower WR than the `realAdmitAltAdmit` cohort by ≥5pp on hostile days.
3. Calibration check (scope §8 of master) passes tertile-monotonic WR(HIGH) − WR(LOW) ≥ 7pp at p<0.05.

If none of the three pass after 30d → tune weights; if 60d → revisit modifier-range band; if 90d → escalate to Kyle for design revisit.

---

## 9. Out of scope (deferred)

- **Tier-2 external data** (DXY, SPX, exchange flows, liquidations) → B70+ conditional on B67 success per master plan §0.4.
- **B67.5 consumer wiring** — confidence today is decorative; downstream connection happens in B67.5 only after calibration passes.
- **Recalibration script** — written separately in B67.4 (realized-outcome feedback) workstream.
- **Daily loss budget service** — Phase 19.4.5 item 9, BLOCKING for live activation per scope §11.
- **Multi-TF DBS agreement** — B68.1, structural classifier improvement, not in B67.

---

## 10. Workflow gates

| Step | Status |
|---|---|
| 1 — Scope | ⏳ This document. Pending Langston review. |
| 2 — Pre-audit | ⏳ See `BATCH_67_1_PRE_AUDIT.md`. Pending Langston review. |
| 3 — Implementation | Pending Steps 1+2 sign-off. |
| 4 — Code review | Will package the diff for Langston. |
| 5 — GitHub push + CI | Push only after Step 4. |
| 6 — Staging deploy | PM2 restart in shadow mode. |
| 7 — First-pass verification (CC) | 1h+ shadow log review. |
| 8 — Second-pass verification (Langston) | UI + log review. |
| 9 — Iterate | If the ablation shape or feed semantics surprise. |
| 10 — Governance | BATCH_CATALOG, PHASE_HISTORY, SIM (§5.1 + §5.2.5 deltas), SYSTEM_MANUAL (formula change), CHANGES_AND_FIXES, MEMORY, change list, completion report. |
| 11 — Completion ack | Kyle. |

---

## 11. Cross-references

- `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` — master planning doc, §0 resolutions
- `BATCH_67_SCOPE.md` §6 — original sub-deliverable carve-out (this doc supersedes)
- `BATCH_67_PRE_AUDIT.md` V2 — macro-B67 SIM consultation (this doc's pre-audit augments at the B67.1 level)
- `B67_2_STRATEGY_PHASE_WEIGHT_SEEDS.md` — sister sub-deliverable seed table (approved)
- cc-inbox #842 + #843 — Langston scope alignment + table approval
- `BATCH_67_0_CHANGE_LIST.md` — ablation framework that B67.1 emits into
- `1-system-manual/SYSTEM_IMPACT_MAP.md` §5.1, §5.1b, §5.1c, §5.2.5 — affected components

*End of B67.1 scope.*
