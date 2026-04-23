# Batch 66 — Core Recalibration & Structural Fixes

**Author:** Claude Code, 2026-04-22
**Status:** Draft scope. Built from Items 15/18/19 + Streakiness Analysis + Modularization Synthesis findings.
**Phase:** 15c
**Prereq:** B65 (asset_class + exchange schema formalized in pair metadata)
**Blocks:** B67 (external data), Phase 19 go-live

---

## 1. Purpose

B63 audits revealed three categories of structural problems in the signal pipeline:
1. **Scoring is broken** — FinalScore anti-predictive, PredConf self-cancellation, 6 P1 formula constants hard-coded
2. **Temporal pathologies** — PredConf uses all-time cumulative VTS WR, scan-cycle batch correlation at 87.8% same-outcome, scoring pipeline temporally divorced from the market
3. **Risk concentration** — symbol-based duplicate checking allows correlated-underlying concentration (ETH/USD + ETH/USDT + ETH/GBP = 3 bets on ETH)

B66 fixes the concrete, targeted issues that BLOCK Phase 19 go-live without attempting the larger modularization refactor (which is a post-live Modularization Phase). B66 is the "get the current Kraken-crypto-spot pipeline ready for paper mode" batch.

---

## 2. Operating-Mode Context

**Active trading is OFF. Paper trading is OFF. Only VTS (passive learning) is running.** All code changes land during a scheduled deployment window AFTER the current observation window closes (observation runs through 2026-04-28). Nothing in this scope deploys mid-observation.

**Explicit non-goal: do not attempt module extraction.** That's Modularization Phase work, post-live. B66 threads `exchange` and `asset_class` parameters through code paths for forward compatibility but does NOT refactor the monolith into modules.

---

## 3. Scope items (P0 — required for Phase 19)

### 3.1 Promote formula constants to DB

**Problem:** 6 P1 constants govern SQE scoring and are hard-coded in source. Cannot iterate on formula without a deploy.

**Action:**
- Create `module_constants` table per Modularization Synthesis §3.5 schema (4-dimensional: `exchange`, `asset_class`, `strategy`, `regime`, keyed by `constant_name`)
- Seed with current hardcoded values for `exchange='kraken', asset_class='crypto_spot'`
- Promote:
  1. `SCORE_WEIGHTS.FINAL_SCORE.HYBRID` (0.4)
  2. `SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE` (0.3)
  3. `SCORE_WEIGHTS.FINAL_SCORE.REGIME` (0.2)
  4. `SCORE_WEIGHTS.FINAL_SCORE.DECAY` (0.1)
  5. RegimeWeight trend coefficient (0.7)
  6. RegimeWeight volatility coefficient (0.3)
- Update `score-calculator.ts` and `score-weights.config.ts` to read from DB with hardcoded fallback (fallback logs a warning; Kyle's "no silent fallback" rule 2026-04-20 requires the warning to be loud)
- Add constant-resolution cache (60s TTL, same pattern as MCE)

**Out of scope:** formula recalibration itself. Promoting makes recalibration POSSIBLE; the actual recalibration (new coefficient values) is a separate iteration after B66 lands and the system is observable.

### 3.2 PredictiveConfidence rolling window replacement

**Problem (Item 15 §3.1 / Item 19 Exec Summary):** PredConf uses all-time cumulative VTS win rate. In a market that shifts on multi-hour timescales, it measures a market that no longer exists. This is a documented streak-production mechanism per Streakiness Analysis Part III §2.

**Action:**
- Replace `getPredictiveConfidence()` in `score-calculator.ts` with a rolling-window implementation
- Window size: DB-driven via `module_constants` with default `rolling_trade_count: 500` (tunable per asset_class)
- Rolling window per `(strategy, regime, asset_class)` tuple rather than global
- Retain the sigmoid transform parameters (center=0.5, scale=6) as DB constants (P1 items 8-9)
- Write unit tests confirming: (a) rolling window excludes trades outside the window, (b) sigmoid transform unchanged, (c) per-tuple isolation (one strategy's window doesn't contaminate another's)

**Risk:** current VTS trade volume is ~85-150 closed/day. A 500-trade rolling window = ~3-5 days. Window tuning TBD after observation.

### 3.3 Per-underlying position limits

**Problem (Streakiness Analysis Part III §6):** `hasDuplicatePosition(symbol)` checks by exact symbol. ETH/USD and ETH/USDT both admit → effective 2× underlying exposure. Item 19 H2 quantified 87.8% same-outcome correlation for simultaneously-admitted trades, partly driven by this.

**Action:**
- Add `underlying` column to pair metadata (populated during B65 asset_class schema work)
- Add `module_constants` entries: `max_positions_per_underlying` (default: 1 for crypto_spot) and `max_positions_per_asset_class` (default: TBD, probably 10-20)
- Update duplicate-check in `vts-runner.ts` L1150 AND `paper-execution-engine.ts` (for when paper mode activates) to check by underlying with cross-quote aggregation
- Structural: when underlying limit is hit, log `setNullReason('underlying_position_cap')`, emit telemetry for observability
- Unit tests: (a) ETH/USD + ETH/USDT second-admit blocked, (b) ETH/USD + SOL/USD both admit, (c) limit configurable per asset class

**Notes:** cross-exchange aggregation is a Modularization Phase concern. B66 only enforces within-current-exchange (Kraken).

### 3.4 Realized-EV-adaptive Net EV floor

**Problem (Streakiness Analysis Part III §4):** Net EV floor is currently fixed at −0.01 (−1%) in VTS. The floor compares PREDICTED edge to the threshold, but Item 15 §3.4 found `ExpectedEdge vs ActualNet` Pearson r = −0.130 — the edge kernel systematically overestimates. During the 70-loss streak, mean expected edge was +1.45% while reality delivered −2.31%. The floor failed because predictions were wrong.

**Action:**
- Introduce a rolling "predicted-vs-realized EV delta" metric in `module_constants`: compute mean(actualNet - expectedEdge) over last N trades per (strategy, regime, asset_class)
- Adjust Net EV floor dynamically: `effective_floor = configured_floor - realized_delta * 0.5` (half the observed overestimation as a penalty)
- Log when the adaptive adjustment triggers (so we can see when it's firing and by how much)
- Tune the adjustment coefficient (0.5) as a DB constant

**Risk:** this adds feedback from realized outcomes into admission, which creates a second-order streak-production pathway if the window is too short. Window size must be long enough to dampen noise but short enough to react to regime shifts — 500-trade rolling (same as PredConf) is a reasonable starting point.

### 3.5 rankingScore logging (foundation for Phase 19 Ranking module)

**Problem (Item 18 §C.1):** `rankingScore` is referenced in brief but NOT logged in VTS trade records. Cannot audit ranking cut discrimination post-hoc because the ranking value at entry isn't persisted.

**Action:**
- Identify whether a ranking computation exists in current code (Langston Item 19 found `ranking-weights.ts` exists per session notes)
- If computed: add to VTS trade log schema + paper trade log schema
- If NOT computed: this is a Phase 19 / Modularization Phase new-module item, not B66
- Either way, formally document the finding and the consequent action

**Note:** this is a LOGGING change, not a ranking-cut change. No trades are rejected by a new ranking gate in B66. That's Phase 19 work when the Ranking module is designed.

---

## 4. Scope items (P1 — Phase 19 preparation, not strictly blocking)

### 4.1 Global regime aggregation responsiveness tuning

**Context (Item 19 H1 re-verification 2026-04-22):** Post-B62, global regime aggregation IS responsive (2 transitions in 72h on 2026-04-20+ data). Severity was P0, now downgraded to P1. Still a tuning opportunity — transitions could be faster and more frequent.

**Action:**
- Observe post-B62 aggregation behavior for 2+ weeks (continues the observation window past 2026-04-28)
- If 2 transitions in 72h is too slow for observable regime shifts, tune the aggregation hysteresis (DB constant) to transition more aggressively
- If transition rate is appropriate, close this item and leave aggregation as-is

**Out of scope:** changing the aggregation FORMULA. That's a larger design discussion requiring Langston + Kyle review.

### 4.2 Promote remaining P2 constants

- RegimeWeight floor clamp (0.1)
- PredConf sigmoid center (0.5)
- PredConf sigmoid scale (6)
- PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR (0.45)
- MCE cache TTL (60_000ms)
- VTS scan interval (30s)
- Net EV floor base value (−0.01)

All go into `module_constants` following the same pattern as P0. Not blocking because their current values are defensible; promoting them just enables future tuning.

### 4.3 Formal alignment of SQE defaults with DB values (P3 cleanup)

`SQE_DEFAULT_THRESHOLDS` in `signal_quality_evaluator.ts` has hardcoded defaults that diverge from DB values in `screener_filters`. Align them. Low priority, low risk.

---

## 5. Non-scope items (deferred to Modularization Phase or later)

- Extract the 8 modules (7 core + Filter Module Family) from monolith (Modularization Phase, post-live)
- Per-asset-class filter sets — different filters for equities vs perpetuals vs crypto spot (Modularization Phase)
- Exchange Adapter abstraction (Modularization Phase)
- Ranking module design + implementation (Phase 19 / Modularization Phase)
- Multi-exchange schema changes beyond threading (`exchange` parameter in code paths is threaded in B66; new exchange adapters are Modularization Phase)
- Asset class expansion beyond crypto_spot (Phase 21.5+)
- External data consumption by SQE (B67)
- Mode overlay formula changes (design discussion, not B66)
- Strategy additions (rejected — backtests showed naive additions have poor S/N; external context is the path)

---

## 6. Estimated effort

| Item | Files touched | Effort (engineer-days) |
|---|---|---|
| 3.1 Promote 6 formula constants | `score-calculator.ts`, `score-weights.config.ts`, new DB table, new migration, module_constants service | 2-3 |
| 3.2 PredConf rolling window | `score-calculator.ts`, rolling-window infra in memory store, unit tests | 2-3 |
| 3.3 Per-underlying position limits | `vts-runner.ts`, `paper-execution-engine.ts`, pair metadata migration, unit tests | 2 |
| 3.4 Realized-EV-adaptive floor | `vts-runner.ts`, new realized-EV tracking store, DB constant | 2 |
| 3.5 rankingScore logging | `virtual-trade.interface.ts`, VTS trade log writer, paper equivalent (if wired) | 1 |
| 4.1 Global regime observability | Telemetry surfacing, no code change | 0.5 |
| 4.2 Promote P2 constants | Same pattern as 3.1 but lower surface | 2 |
| 4.3 SQE default alignment | Single file, audit + edit | 0.5 |
| Testing + verification + governance | All of above | 3-4 |
| **Total** | | **15-20 engineer-days** |

Actual calendar time depends on deployment windows and observation-gate cadence between sub-deploys.

---

## 7. Sequencing

1. **B65 completes first** (asset_class + exchange schema on pair metadata). B66 depends on it.
2. **B66 staged in 3 sub-deploys:**
   - **B66.1:** module_constants table + P0 formula constant promotion (items 3.1) — smallest change, observation for 24-48h to verify DB read path, fallback warnings, constant-resolution cache behave correctly
   - **B66.2:** PredConf rolling window + per-underlying limits (items 3.2 + 3.3) — bigger behavioral change, observation for 48-72h to verify streak reduction
   - **B66.3:** Realized-EV-adaptive floor + rankingScore logging + P2/P3 cleanups (items 3.4 + 3.5 + 4.x) — final polish, observation for 24h to confirm no regressions
3. **Observation between sub-deploys uses the Drift Dashboard** (live since 2026-04-22) + CSV exports for streakiness re-measurement. Expected metrics to watch: runs-test z-score (currently −15.57), max loss streak length, daily WR variance, per-underlying concentration.

---

## 8. Success criteria

Post-B66 metrics to verify on a fresh 7d window AFTER B66.3 deploys:

| Metric | Pre-B66 (current) | Post-B66 target |
|---|---|---|
| Runs-test z-score | −15.57 | Less extreme (target > −10) — streakiness should reduce materially |
| Max loss streak | 70 | < 30 (better if < 20) |
| Daily WR variance | 9.9% to 76.7% range | ±20pp around mean, not ±40pp |
| FinalScore vs net profit Pearson r | −0.017 | Target > +0.05 (modest positive correlation, not perfect) |
| ExpectedEdge vs actual net Pearson r | −0.130 | Target > −0.05 (significant reduction in systematic overestimation) |
| Per-underlying concentration (3+ correlated-pair positions) | common | < 5% of cohorts |

Success is not "all metrics perfect" — it's "materially better in a way consistent with the mechanisms we fixed." If a metric moves the wrong way, we investigate before the next sub-deploy.

---

## 9. Governance

Per CLAUDE.md §3 (Tier 1 mandatory every batch):
- `BATCH_CATALOG.md` — B66 entry
- `PHASE_HISTORY.md` — Phase 15c update
- `MEMORY.md` — state update after each sub-deploy
- `BATCH_66_SCOPE.md` — this doc (done)
- `BATCH_66_PRE_AUDIT.md` — written pre-implementation after B65 closes
- `BATCH_66_COMPLETION_REPORT.md` — written during closeout

Tier 2 (applicable):
- `SYSTEM_MANUAL.md` — new §B66 for module_constants table + PredConf rolling window + per-underlying limits + realized-EV adjustment
- `SYSTEM_IMPACT_MAP.md` — new components (module_constants service, rolling-window store, realized-EV tracker, per-underlying limit check)
- `CHANGES_AND_FIXES.md` — entries for each P0 fix
- `AUTHORITY_BASELINE.md` — reviewed; likely unchanged but audit to confirm

---

## 10. Open questions for Langston / Kyle review

1. **Rolling window size for PredConf** — 500 trades is the starting default. Too long = doesn't adapt. Too short = noise. Final choice may need calibration during B66.2 observation.
2. **`max_positions_per_asset_class`** — Kyle preference? 10? 20? Portfolio-level cap needs a number before B66.3 ships.
3. **Realized-EV adjustment coefficient** — 0.5 is a first guess. Could be 0.3 or 0.7 depending on how aggressive we want adaptation to be.
4. **B66 branch strategy** — one branch with 3 sub-deploys, or 3 separate feature branches each with its own CI?
5. **Post-B66 re-measurement timing** — how long after B66.3 ships before we declare success/failure and move to B67?

---

*End of B66 scope. Langston code-level review next, per the workflow in CLAUDE.md §2. Do not implement before B65 closes.*
