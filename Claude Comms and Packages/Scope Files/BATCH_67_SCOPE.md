# Batch 67 — Coordinated Regime-Confidence Overhaul

**Author:** Claude Code, 2026-04-28
**Status:** Step 1 scope. Pending Langston Step-1 review and Step-2 paired pre-audit.
**System phase:** 15c (Phase 19 prep)
**Prereq:** B65.4.2 closed (ladder observability columns deployed). B66 retired. B65.5 + B65.6 closed via SKIP/DEFER.
**Master planning doc:** `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0 (canonical state, all design decisions resolved 2026-04-28).
**Successor batches:** B68 (structural classifier improvements — multi-TF, volume regime, Path B tightening), B69 (ML-Lite reliability score). Both downstream of B67 closure.

---

## 1. Why this batch exists

The regime classifier has measurable structural problems. Three converging pieces of evidence:

1. **B63 Item 18 audit (post-B62 correction):** the FinalScore formula's RegimeWeight component is anti-predictive (r=−0.14 on post-B62 data; holds on clean days too). A 20%-weight input to the admission gate is pushing the wrong direction.
2. **B65.6 Phase A audit:** Path B (the TFS branch firing on `|DBS| ≥ 0.30` alone) over-fires on strong-direction days. On 04-22 hostile cohort, classifier-confident pairs (TFS, n=195) had 13.8% WR; least-confident pairs (STRUCTURAL_TRANSITION, n=6) had 83.3% WR — confidence inverted from outcome.
3. **REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md §5:** classifier rated medium-low overall by both CC and Langston. Multiple independent gaps: no multi-TF agreement, no volume regime, no macro context, no pair-correlation context, no regime-age tracking, no transition-freshness state, confidence number computed but not consumed.

B67 attacks the highest-leverage gaps coordinately. B68 follows with structural improvements. B69 wraps with ML-Lite reliability. Together: 10–20pp WR improvement on currently-failing cohorts; 3–5pp on overall population (Langston + CC consensus estimate).

This is **the** pre-Phase-19 priority work. Other pre-Phase-19 items (B70 archiving, B72 lever sweep) queue behind B67/B68/B69.

---

## 2. Operating-mode context

VTS active, paper trading active, live off. B67 sub-deliverables ship behind `module_constants` flags. Each flag has 4 states: `OFF`, `SHADOW` (compute alternates only, do not gate), `ON_VTS`, `ON_VTS_AND_PAPER`. Default deploy state is `SHADOW` for first 24h post-restart, then `ON_VTS_AND_PAPER` after sanity check passes. Live trading is NOT enabled by these flags — Phase 19 governs live activation.

---

## 3. Sub-deliverable structure and dependency chain

```
B67.0 Telemetry & ablation framework             (built first — measures every subsequent factor)
  ↓
B67.3 Per-underlying position limits              (safety net, no confidence dependency)
  ↓
B67.1 Macro confidence modifier  +  B67.2 Phase dimension      (recompute regime confidence value)
  ↓
B67 CALIBRATION CHECK                             (tertile-monotonic, ≥7pp HIGH−LOW gap, n≥150/bucket, χ² p<0.05)
  ↓
B67.5 Wire regime confidence into 8 consumers     (only if calibration passes)
  ↓
B67.4 Realized-outcome feedback                   (closes the loop; recalibrates confidence from VTS outcomes)
```

**Why this ordering:** B67.3 ships first because per-underlying limits are pure downside protection — no dependency on the new confidence factors. We get safety net coverage during the rest of the rollout. B67.1 + B67.2 ship together because they both modulate the same number (regime confidence) and need to be co-validated. The calibration check is a **hard gate** before B67.5 — multiplying Kelly fraction by an uncalibrated number makes sizing worse, not better. B67.4 closes the loop with realized-outcome feedback after consumers are wired.

**Estimated effort:** 3–4 weeks across 6 sub-deliverables. Solo CC implementation time. Standard workflow overhead on top.

---

## 4. B67.0 — Telemetry & Ablation Framework

### 4.1 What it is

A replay-ablation system that lets us measure each B67/B68 factor's impact while everything runs in production. Replaces the original "ship-data-then-validate" plan.

### 4.2 Architecture

1. Each B67/B68 sub-deliverable has an `enabled` flag in `module_constants`. Tagged either `confidence-modifying` (replay-OK) or `admission-gating` (requires universe-split A/B).
2. On every signal evaluation, classifier emits the real decision plus N alternates (one per `confidence-modifying` factor). Each alternate is computed as "what would I have decided if this factor were absent?"
3. Alternates logged to new sibling table `regime_factor_alternates` with FK to the signal record.
4. Nightly job (`scripts/replay-ablation.ts`) replays each alternate against the trade's actual price path → counterfactual outcome (hit target / hit stop / timeout / etc.).
5. Dashboard panel: "Counterfactual Comparison" tab in Analytics & Diagnostics. Real WR vs WR-without-factor-X for each factor. Per-strategy and aggregate views.

### 4.3 Failure modes acknowledged (from Langston review)

- **Admission-gating factors cannot be replay-attributed.** B67.3 (per-underlying limits) prevents trades from existing — no actual price path to replay against. B67.3 uses deterministic universe-split A/B (hash pair-ID modulo 2; half with limit, half without; run for full B67 observation period).
- **Kelly sizing replay breaks under binding capital constraints.** Valid for VTS where capital is unconstrained. For paper, replay output flagged as "estimate only" when daily capital usage > 80%.

### 4.4 Storage

Ablation row count grows linearly with factors × signals. Estimated 1,000 alternate-outcome rows per day at current VTS scale. Trivial. Retention policy: 90 days raw + permanent rolled-up daily aggregates. Codified in `B67_0_RETENTION_POLICY` constants.

### 4.5 Files affected (new)

- `server/services/factor-ablation-emitter.ts` — emits alternates from classifier
- `server/scripts/replay-ablation.ts` — nightly replay job. Cron schedule: **04:00 UTC daily** (PM2 cron entry added at deploy time). NPM script: `npm run b67:replay-ablation`.
- `server/routes/api-counterfactual.ts` — dashboard data endpoint
- `client/src/pages/diagnostics/counterfactual-comparison.tsx` — UI
- `drizzle/migrations/2026-04-XX-b67-0-factor-alternates-table.sql` — schema
- `shared/schema.ts` — `regime_factor_alternates` table addition

### 4.6 Files affected (modified)

- `server/core/metrics/market-regime.ts` — emit alternates alongside real decision
- `server/services/market-context-engine.ts` — pass through factor flags
- `server/storage.ts` — alternates write path

### 4.7 module_constants entries (new)

- `b67_0_ablation_emit_enabled` (bool, default `true`)
- `b67_0_alternates_retention_days` (int, default `90`)
- `b67_0_paper_replay_capital_threshold_pct` (float, default `0.80`)

### 4.8 Verification criteria

- Alternates row written for every signal evaluation in VTS (sample ~100 signals across 24h, all have alternate rows)
- Nightly replay job completes within 10 minutes
- Dashboard "Counterfactual Comparison" tab renders for B67 factors after 24h of data accumulation
- TypeScript clean (no new errors)

---

## 5. B67.3 — Per-Underlying Position Limits (deploys FIRST)

### 5.1 What it is

Cap on simultaneous open trades per underlying asset across all of VTS + paper. Promoted from `POST_B62_PRE_LAUNCH_PLAN.md` Item 4 (paper-only with VTS bypass) to general application. Rationale: ML doesn't get smarter from 10 simultaneous BTC trades — they're ~95% correlated outcomes. Per-underlying diversification improves training quality even in VTS.

### 5.2 Behavior

On signal admission, count open trades sharing the signal's underlying asset (e.g., BTC for BTC/USD, BTC/USDT, BTC/EUR). If count ≥ `b67_3_max_concurrent_per_underlying`, reject with `RejectionReason.PER_UNDERLYING_CAP`.

Underlying derivation: parse pair symbol via existing `extractBaseCurrency()` helper. ETH/BTC counts toward both ETH and BTC exposure (Langston's flag — but for B67.3 simplicity, count toward the BASE currency only; cross-quote correlation handled separately in B68.3 pair correlation context).

### 5.3 Validation: deterministic universe-split A/B

Per §0.5 §0.10.A, B67.3 cannot be replay-attributed. Validation method:

- Hash pair-ID via `crc32(pairId) % 2`
- `pair_id_hash == 0` cohort: limit ENABLED
- `pair_id_hash == 1` cohort: limit DISABLED (control)
- Run for full B67 observation period (minimum 14 days)
- Compare WR, net expectancy, max-loss-per-day across cohorts at end

### 5.4 module_constants entries (new)

- `b67_3_enabled` (bool, default `false` initially; flip to `true` on deploy)
- `b67_3_max_concurrent_per_underlying` (int, default `2`)
- `b67_3_universe_split_active` (bool, default `true` for first 14 days)

### 5.5 Files affected (modified)

- `server/services/signal-orchestrator.ts` — admission check
- `server/core/governance/strategy-modes.ts` — rejection reason taxonomy
- `server/services/vts-runner.ts` — VTS admission path
- `server/services/paper-execution-engine.ts` — paper admission path
- `shared/schema.ts` — add `pair_id_hash` column to `paper_sim_trades` for cohort assignment

### 5.6 Files affected (new)

- `drizzle/migrations/2026-04-XX-b67-3-per-underlying-cap-pair-hash.sql`

### 5.7 Verification criteria

- New rejection reason logged when limit triggers (PM2 log grep)
- A/B cohort counts roughly equal at 14-day mark (within 10%)
- Per-underlying open-trade count visible in `/api/vts/diagnostics`
- TypeScript clean

---

## 6. B67.1 — Macro Confidence Modifier

### 6.1 What it is

A new external-data-driven multiplier on the per-pair regime classifier's confidence number. Modifier range 0.85–1.05× initially. Inputs: BTC dominance, derivatives funding rates, total-mcap momentum.

### 6.2 Architecture (Langston's confidence-modifier — Option C from §3)

Classifier output unchanged. Confidence number multiplied by macro modifier post-classification. Label preserved; only confidence is modulated. Existing stability/mode-overlay path consumes modulated confidence automatically.

```
real_confidence = base_classifier_confidence × macro_modifier
where macro_modifier = clamp(0.85, 1.05, f(btc_dominance_zscore, funding_zscore, mcap_momentum))
```

`f()` to be a weighted average of the three z-scores, weights in module_constants.

### 6.3 External data ingestion

New `server/services/external-macro-feed.ts`. Pulls from CoinGecko (BTC dominance, mcap), Coinglass or Binance public futures endpoint (funding rates). Cache 60s. Emit to MCE per cycle.

Pre-implementation audit (Step 2) must include codebase grep for any pre-existing BTC-correlation logic per §11 decision 12 — Kyle flagged he believes some BTC correlation may already exist. Audit deliverable: `BATCH_67_PRE_AUDIT.md` §X.

### 6.4 module_constants entries (new)

- `b67_1_enabled` (bool, default `false` initially; SHADOW for 24h, then ON)
- `b67_1_btc_dominance_weight` (float, default `0.40`)
- `b67_1_funding_weight` (float, default `0.35`)
- `b67_1_mcap_momentum_weight` (float, default `0.25`)
- `b67_1_modifier_min` (float, default `0.85`)
- `b67_1_modifier_max` (float, default `1.05`)
- `b67_1_external_feed_cache_seconds` (int, default `60`)
- `b67_1_btc_dominance_zscore_lookback_days` (int, default `30`)
- `b67_1_external_feed_stale_seconds` (int, default `300` — 5 min)

### 6.5 Files affected (new)

- `server/services/external-macro-feed.ts`
- `server/core/metrics/macro-modifier.ts`
- `server/tests/unit/b67-1-macro-modifier.test.ts`

### 6.6 Files affected (modified)

- `server/services/market-context-engine.ts` — store macro signals
- `server/core/metrics/market-regime.ts` — apply modifier to confidence output
- `server/types/market-context.ts` — extend interface

### 6.7 External-data fallback behavior (Langston Step-2 review point #3)

When CoinGecko / Coinglass / Binance public-futures endpoints are unreachable, rate-limited, or return stale data:

- Macro modifier returns `1.0` (neutral) — no impact on regime confidence
- Telemetry flag `b67_1_external_feed_stale` set to `true` and logged loudly in PM2
- Stale threshold: configurable `b67_1_external_feed_stale_seconds` (default 300s — 5 minutes)
- Fallback behavior covered by unit test (`b67-1-feed-fallback.test.ts`) — must be tested, not discovered during a real outage

This makes the failure mode explicit and graceful. System reverts to pre-B67.1 behavior on feed failure rather than producing arbitrary modifier values from cached/stale inputs.

### 6.8 Verification criteria

- Macro feed delivers fresh data every 60s; logs in PM2
- Modifier clamps within [0.85, 1.05] (unit test)
- B67.0 ablation logs alternates with `b67_1_disabled` factor flag
- 04-22 replay test: simulated modifier on hostile-day cohort produces measurable WR lift on rejected-trade counterfactual
- Fallback test: simulate feed unreachable → modifier returns 1.0 + telemetry flag set

---

## 7. B67.2 — Phase Dimension (EARLY / PRIME / LATE)

### 7.1 What it is

Sub-classification of existing 5 regimes by regime age. Each regime label gets a phase suffix. Boundaries: 0–2h = EARLY, 2–12h = PRIME, 12h+ = LATE. Per-pair regime age tracked from last regime transition.

### 7.2 Architecture

Phase dimension computed alongside regime classification, NOT as part of FinalScore directly. Phase is a continuous-scoring confidence modulator: each strategy has phase-preference weights (e.g., `vwap_pullback`: EARLY=0.7, PRIME=1.0, LATE=0.85), which multiplies the strategy's effective regime confidence on signal admission.

**Continuous-scoring invariant (per §0.5 anti-rigidity rule):** phase preference is a multiplier, NOT a hard gate. A signal in slightly-off phase still admits if other inputs are strong.

### 7.3 Strategy-phase preference map

Initial seed values are theory-priors. Final values from post-hoc-regime-labeled CORRECT-cohort backfill (§0.10.E). Theory priors:

- Breakout strategies → EARLY heavy
- vwap_pullback / trend continuation → PRIME heavy
- Mean reversion / exhaustion fades → LATE heavy

All values in `module_constants` table under `b67_2_strategy_phase_weight_*` keys.

### 7.4 module_constants entries (new)

- `b67_2_enabled` (bool)
- `b67_2_early_phase_max_hours` (float, default `2.0`)
- `b67_2_prime_phase_max_hours` (float, default `12.0`)
- `b67_2_strategy_phase_weights` (JSONB) — single blob keyed by `<strategy>_<phase>` containing the 51 (~17 strategies × 3 phases) weight values. Single-row update is simpler than 51 individual constant rows; tradeoff is per-tuple history is harder to track. Decision logged 2026-04-28 per Langston Step-1 review point #4.

### 7.5 Files affected (new)

- `server/core/metrics/regime-phase.ts`
- `server/tests/unit/b67-2-phase-dimension.test.ts`

### 7.6 Files affected (modified)

- `server/core/metrics/market-regime.ts` — phase computation
- `server/services/signal-orchestrator.ts` — apply phase preference to admission
- `server/types/market-context.ts` — extend interface
- Strategy-regime canonical map (`server/config/canonical-regime-strategy-map.ts`) — add phase preference annotations

### 7.7 Verification criteria

- Phase computed per pair every MCE cycle
- Phase transitions logged
- B67.0 ablation logs alternates with `b67_2_disabled` factor flag
- Per-pair regime-age field visible in `/api/vts/regime-state`
- Strategy-phase preference applied on admission (unit test verifying)

---

## 8. B67 Calibration Check (gating event between B67.1+B67.2 and B67.5)

### 8.1 What it is

A hard prerequisite check that runs after B67.1 + B67.2 have produced ≥14 days of post-deploy data. Tests whether regime confidence is calibrated well enough to use for Kelly-multiplication and other capital-deploying consumers.

### 8.2 Pass criteria (Langston tertile-monotonic)

1. Bucket regime confidence into tertiles HIGH / MID / LOW based on the post-B67.1 distribution
2. Compute WR per tertile across all closed VTS trades in window
3. Required ordering: WR(HIGH) > WR(MID) > WR(LOW) — strict monotonic
4. Required gap: WR(HIGH) − WR(LOW) ≥ 7pp (Kelly amplifies miscalibration; binary 5pp not sufficient)
5. Sample size: ≥150 trades per bucket
6. Statistical test: chi-square p < 0.05

If all five pass → B67.5 ships.
If monotonic ordering fails or gap < 7pp → B67.5 holds. B67.4 (realized-outcome feedback) ships first to recalibrate, re-test calibration after 14 days, retry.
If sample size insufficient → extend observation period 7 days, retry.

### 8.3 Files affected (new)

- `server/scripts/b67-calibration-check.ts` — runnable on demand
- Dashboard tile in Counterfactual Comparison panel

### 8.4 Verification criteria

- Calibration check runs and outputs PASS/FAIL with all 5 metrics
- FAIL state blocks B67.5 deploy in `module_constants` (`b67_5_enabled` requires `b67_calibration_passed = true`)

---

## 9. B67.5 — Wire Regime Confidence Into 8 Consumers

### 9.1 What it is

Wire `RegimeClassification.confidence` (now modulated by B67.1 macro + B67.2 phase) into 7 concrete decision points (originally 8 — Consumer #6 daily-loss-budget deferred to Phase 19 observation per Kyle directive 2026-04-28). This is the biggest sub-deliverable in B67 — 7 integration points spanning admission, sizing, exit management, and queue ordering.

### 9.2 The 7 consumers (Consumer #6 deferred to Phase 19 observation per Kyle directive 2026-04-28)

| # | Consumer | Today | Post-B67.5 | File |
|---|---|---|---|---|
| 1 | FinalScore composite (REPLACE RegimeWeight) | `... + regimeWeight × 0.2 ...` | `... + regimeConfidence × 0.2 ...` | `server/core/utils/score-calculator.ts` (formula) + `signal-orchestrator.ts` + `vts-runner.ts` (consumer mirrors — must update lockstep) |
| 2 | Position sizing (riskAmount scaling, NOT Kelly — V2 framing) | `riskAmount = portfolio × risk_pct` | `riskAmount = portfolio × risk_pct × regime_conf_multiplier` (sourcePool max-position cap applies after sizing) | `server/services/paper-position-sizing.ts` |
| 3 | EV gate threshold (composition with PredConf, not replacement — V2 design call) | `getDynamicROIThreshold(regime, predConf)` | `getDynamicROIThreshold(regime, predConf, regimeConf)` — regime_conf adds inverse-scaling on top of existing PredConf flex | `server/core/calculations/expectancy.ts` |
| 4 | Strategy routing tiebreak (multi-strategy collisions) | first-match / static priority | highest-confidence regime wins slot | `server/services/signal-orchestrator.ts` |
| 5 | TEC parameters at trade-open (sourcePool-gated — V2 finding) | static `module_constants` | For non-strong-trend trades: modulates BE-lock distance, moonbag eligibility, ladder rung-floor buffer. Strong-trend lane (`sourcePool === 'quant-strong_trend'`) retains B63 mode-overlay-bypass and native geometry regardless of regime confidence. | `server/services/trailing-exit-controller.ts` + `vts-runner.ts` + `paper-execution-engine.ts` |
| ~~6~~ | ~~Daily loss budget weighting~~ | — | **DEFERRED to Phase 19 observation per Kyle directive 2026-04-28.** Daily-loss-budget service does not exist; building it requires its own batch, and Phase 19 paper observation will inform whether to build. Consumer numbering gap preserved at #6 for traceability. | (Phase 19.X) |
| 7 | VTS feature column (new) | not recorded | persisted on every trade for B69 training | `paper_sim_trades` schema |
| 8 | RTB queue tiebreak (ε=0.02) | insertion order | regime_conf tiebreaks near-ties only | `server/core/rtb/ready_to_buy_service.ts` |

**Critical: Consumer #1 REPLACES RegimeWeight, does not stack on top.** RegimeWeight is anti-predictive (B63 Item 18); stacking creates squared dependence on a flawed input.

### 9.3 RegimeWeight deletion sweep (per Kyle's directive — exhaustive)

This is its own sub-sub-deliverable inside B67.5. Full file list:

**Code:**
- `server/core/utils/score-calculator.ts` — remove `calculateRegimeWeight()`, remove from `calculateFinalScore()` signature
- `server/core/metrics/quality_index.ts` — line 250 + 299 + 308 + 313
- `server/core/filters/signal_quality_evaluator.ts`
- `server/config/score-weights.config.ts` — remove `REGIME` weight constant
- All 40+ other server files in grep results: `vts-service.ts`, `export-csv.ts`, `vts-runner.ts`, `adjustment-registry.ts`, `telemetry-aggregator.ts`, `routes.ts`, `canonical-regime-strategy-map.ts`, `market-context-engine.ts`, `signal-orchestrator.ts`, `market-regime.ts`, `telemetry-repository.ts`, `ml-calibration.ts`, `authority-baseline.ts`, `virtual-trade.interface.ts`, `score-calculator.ts`, `signal_quality_evaluator.ts`, `system-guards.ts`, `ready_to_buy_service.ts`, `trace_service.ts`, `analysis-utils.ts`, `adaptive-scan-manager.ts`, `skipped-signals-logger.ts`, `market-context.ts`, `multi-timeframe-scanner.ts`, `cost-telemetry.ts`, `adaptive-goals-weight.ts`

**Schema:**
- `shared/schema.ts` — remove `regimeWeight` column from `paper_sim_trades`
- New migration: `drizzle/migrations/2026-04-XX-b67-5-regimeweight-removal.sql`

**UI:**
- `client/src/pages/machine-learning.tsx` — RegimeWeight column on Open + Closed simulated trades tables
- Diagnostics dashboard tiles displaying RegimeWeight
- Closed-trade detail modal

**CSV exports:**
- `server/utils/export-csv.ts` — open + closed trade exports

**Tests:**
- `server/tests/unit/finalscore-equivalence.test.ts` — update against new formula
- `server/tests/unit/score-weights.test.ts`
- `server/tests/unit/sqe-config-dynamic.test.ts`
- `server/tests/unit/ml-calibration.test.ts`
- `server/tests/unit/directive-11.4B.2-R1.test.ts`
- `server/tests/unit/directive-11.4C-R2.test.ts`
- `server/tests/unit/adaptive-scan-manager.test.ts`
- `server/tests/unit/telemetry-aggregator.test.ts`
- `server/tests/unit/multi-timeframe.test.ts`
- `server/tests/unit/vts-modernization.test.ts`
- `server/tests/unit/directive-11.0E.2.test.ts`
- `server/tests/integration/telemetry_provenance_patch.test.ts`
- `server/tests/integration/dynamic_sizing.test.ts`

**Logs:**
- All `console.log` lines emitting `regimeWeight=` — grep and remove

**Governance docs:**
- `1-system-manual/SYSTEM_MANUAL.md` — formula sections
- `1-system-manual/AUTHORITY_BASELINE.md` + `authority-baseline-v1.json`
- `1-system-manual/ADJUSTMENT_FRAMEWORK.md`
- `1-system-manual/CHANGES_AND_FIXES.md` — add B67.5 entry documenting removal
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — RegimeWeight component removal

**Active-trading tables:** **DEFERRED** to paper-mode rebuild per Kyle directive 2026-04-28. Logged in `POST_AUDIT_ROADMAP.md` as deferred line item with cross-reference to B67.5.

**Deletion verification:** Final grep across entire repo for `regimeWeight|RegimeWeight|regime_weight` after sweep should return only:
- Historical entries in `1-system-manual/CHANGES_AND_FIXES.md`, `PHASE_HISTORY.md`, `BATCH_CATALOG.md`, archived governance
- Historical entries in `Claude Comms and Packages/` (Telegram archives, prior batch reports)
- Pre-Phase-12 archived docs (`bridge/`, `attached_assets/`, `audit/`)

Zero hits in `server/`, `client/`, `shared/`, active `1-system-manual/` formula docs, current tests.

### 9.4 module_constants entries (new)

- `b67_5_enabled` (bool, default `false`; gated on `b67_calibration_passed = true`)
- `b67_5_kelly_confidence_multiplier_floor` (float, default `0.5` — Kelly never multiplied below this)
- `b67_5_ev_gate_confidence_inverse_scale` (float, default `1.0`)
- `b67_5_tec_low_conf_threshold` (float, default `0.55` — below which TEC tightens)
- `b67_5_tec_confidence_floor` (float, default `0.40` — below which TEC snaps to most-defensive parameters instead of interpolating; prevents absurd parameter values at very low confidence). Per Langston Step-1 review point #6.
- ~~`b67_5_daily_budget_low_conf_multiplier`~~ — **REMOVED** (Consumer #6 deferred to Phase 19)
- `b67_5_rtb_tiebreak_epsilon` (float, default `0.02`)
- `b67_5_ev_gate_min_confidence` (float, default `0.4` — division floor for Consumer #3 regime_conf composition; prevents explosion at extreme low confidence)

### 9.5 Verification criteria

- All 8 consumers actively read `regimeConfidence` (PM2 log evidence per consumer)
- FinalScore formula unit test passes against new formula (no RegimeWeight term)
- Repo-wide grep returns zero `regimeWeight` hits in active code
- Schema migration runs cleanly
- UI columns renamed/removed correctly
- B67.0 ablation captures consumer-specific alternates

---

## 10. B67.4 — Realized-Outcome Feedback

### 10.1 What it is

Closed-loop recalibration of regime confidence based on recent VTS trade outcomes. If the last N trades on a (regime, strategy) combination are losing, downgrade regime confidence on new entries in that combination. Self-correcting.

### 10.2 Architecture

New service `realized-outcome-feedback.ts`. Maintains rolling window per (regime, strategy) tuple of last N closed trades. Computes outcome z-score. Confidence multiplier = 1 + α × outcome_zscore, clamped to [0.7, 1.3].

Multiplier is applied AFTER B67.1 macro modifier and B67.2 phase modulation, so it sits on top of B67.1+B67.2 output. Order: `final_confidence = base × macro × phase × outcome_feedback`.

Lookback window: 50 trades per (regime, strategy) tuple, configurable via module_constants.

### 10.3 Avoids self-reinforcing loop

Risk: if VTS uses the macro modifier and the outcome feedback is partially measuring the modifier's own effect, we get circular reasoning. Mitigation: outcome feedback uses ONLY trades where the modifier was in the SAME state as the new signal's evaluation (`b67_1_enabled` matched). This holds the macro modifier constant within the feedback window.

### 10.4 module_constants entries (new)

- `b67_4_enabled` (bool)
- `b67_4_lookback_trades` (int, default `50`)
- `b67_4_alpha` (float, default `0.10`)
- `b67_4_min_clamp` (float, default `0.7`)
- `b67_4_max_clamp` (float, default `1.3`)

### 10.5 Files affected (new)

- `server/services/realized-outcome-feedback.ts`
- `server/tests/unit/b67-4-outcome-feedback.test.ts`

### 10.6 Files affected (modified)

- `server/core/metrics/market-regime.ts` — chain feedback after macro × phase

### 10.7 Verification criteria

- Per-(regime,strategy) rolling outcome state visible in `/api/vts/regime-state`
- Feedback multiplier within clamp bounds (unit test)
- B67.0 ablation captures `b67_4_disabled` alternate
- After 14 days post-deploy: per-(regime,strategy) tuples with negative recent outcomes show measurably lower confidence in alternate-vs-real comparison

---

## 11. Pre-Implementation Audit Requirements (Step 2 deliverable)

`BATCH_67_PRE_AUDIT.md` must include:

1. **SIM consultation** per CLAUDE.md §9. Every component affected by B67. Trace upstream / downstream / shared state / blast radius.
2. **BTC-correlation pre-existing logic audit** per §11 decision 12. Grep `server/` for `btc_correlation`, `btcDominance`, `btc_dominance`, `dominance`, anything BTC-related not just symbol references. Document what already exists. Recommend integration approach with B67.1 to avoid double-counting.
3. **Position sizing service location.** TBD — find where Kelly fraction gets computed and document. B67.5 Consumer #2 requires this. **If service doesn't exist yet, B67.5 scope expands from "wire in" to "build + wire in" — surface clearly in pre-audit and re-scope** (Langston Step-1 review point #5).
4. **EV gate location.** TBD — find where EV admission threshold lives. B67.5 Consumer #3 requires this. Same expansion rule as #3 — flag in pre-audit if service is absent.
5. **Daily loss budget service.** TBD — find where daily budget tracking happens. B67.5 Consumer #6 requires this. Same expansion rule as #3 — flag in pre-audit if service is absent.
6. **RegimeWeight deletion file list verification.** Re-grep entire repo, confirm against §9.3 list. Add any missed files. **Specifically check `bridge/reference/signal-quality-ranking-metrics-overview.md`** (Langston Step-1 review point #2) — verify whether archival or active before including in deletion sweep.
7. **External-data feed sourcing audit.** Confirm CoinGecko/Binance/Coinglass endpoints reachable from Hetzner staging IP. Document rate limits.

---

## 12. Pre-Registered Success Thresholds

Per §11 decision 11, B67 success thresholds defined upfront. If after 30 days of post-activation observation B67 has NOT delivered measurable lift on these metrics, response actions defined.

| Metric | Threshold | Response if not met |
|---|---|---|
| Hostile-day WR (system-wide WR < 25% days) | +5pp WR vs pre-B67 baseline | Tune B67.1 modifier weights, re-evaluate at 60 days |
| Calibration check pass | tertile-monotonic + ≥7pp HIGH−LOW gap | If fails twice (60 days total), recalibrate B67.4 alpha and lookback |
| Per-underlying limit cohort delta (B67.3 A/B) | Limited cohort net-expectancy ≥ Unlimited cohort net-expectancy | If reversed, deactivate B67.3 limit, escalate to Kyle |
| Counterfactual ablation: macro modifier | Real WR > "macro disabled" WR by ≥3pp | Tune weights at 30 days, deactivate at 60 days if no improvement |
| Counterfactual ablation: phase dimension | Real WR > "phase disabled" WR by ≥2pp | Tune phase boundaries 2h/12h, deactivate at 60 days if no improvement |
| RTB tiebreak (Consumer #8) | Tiebreak-affected trades show ≥1pp WR lift over insertion-order baseline | Adjust ε or deactivate |
| Pattern-pool admission rate post-Consumer #1 (V2 audit addition) | Within ±20% of pre-B67 baseline | Recalibrate `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR` (currently 0.45) |

**Composite failure clause (Langston Step-1 review point #3):** if 3 or more of the 6 metrics above fail their 30-day threshold simultaneously, escalate to Kyle for a scope-level decision — continue with substantial redesign vs revert B67 entirely. Do not attempt to tune individual factors in isolation when the composite pattern indicates B67's overall design hypothesis is failing. Single-metric failures are tuning candidates; multi-metric failures are scope-level escalations.

---

## 13. Out of scope (deferred to B68/B69/B72)

- **Multi-timeframe DBS agreement** → B68.1
- **Volume regime as second classifier dimension** → B68.2
- **Pair correlation context** → B68.3
- **Regime-age as first-class metric** (B67.2 uses it implicitly via phase; B68.4 promotes to explicit)
- **Path B sustainability tightening** → B68.5 (uses B68.1's multi-TF metric)
- **ML-Lite reliability score** → B69
- **Tier-2 external data** (DXY, SPX, exchange flows, liquidations) → B70+
- **Active-trading-tables RegimeWeight removal** → paper-mode-rebuild batch
- **Comprehensive lever-to-`module_constants` sweep** → B72

---

## 14. Workflow gates

Per CLAUDE.md §2:

| Step | Owner | Gate to next step |
|---|---|---|
| 1 — Scope | CC drafts, Langston reviews | Langston approves scope |
| 2 — Pre-audit | CC drafts `BATCH_67_PRE_AUDIT.md`, Langston reviews | Langston approves audit including SIM analysis |
| 3 — Implementation | CC, sub-deliverable order per §3 dependency chain | Code complete, local TS clean |
| 4 — Code review | Langston reviews `git diff` before push | Langston approves diff |
| 5 — GitHub push + CI | CC | All 4 CI checks GREEN |
| 6 — Staging deploy | CC | HTTP 200 + PM2 stable |
| 7 — First-pass verification | CC | All B67 sub-deliverables operational |
| 8 — Second-pass verification | Langston | Independent UI + log evidence verification |
| 9 — Iteration | CC + Langston | All scope objectives green |
| 10 — Governance updates | CC | All applicable Tier 1 + Tier 2 docs updated |
| 11 — Completion report | CC + Langston + Kyle ack | `BATCH_67_COMPLETION_REPORT.md` filed |

**Internal gates within Step 3** (sub-deliverable sequencing per §3):
- B67.0 ships and emits alternates → B67.3 ships → B67.1 + B67.2 ship together → 14-day observation → calibration check → B67.5 (gated on calibration pass) → B67.4

Each internal gate produces a short verification note in `BATCH_67_INTERNAL_GATES.md` as work progresses.

---

## 15. Cross-references

- `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` — master planning doc, §0 canonical state
- `1-system-manual/SYSTEM_MANUAL.md` — architecture impact, formula updates
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — component dependency map (consult in pre-audit)
- `1-system-manual/POST_AUDIT_ROADMAP.md` — Phase 15c sequencing
- `1-system-manual/CHANGES_AND_FIXES.md` — RegimeWeight anti-predictive entry (B63 Item 18)
- `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md` — Path B over-firing evidence
- `Claude Comms and Packages/Scope Files/REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md` — classifier deep-dive

---

*End of `BATCH_67_SCOPE.md` Step-1 draft. Awaiting Langston review.*
