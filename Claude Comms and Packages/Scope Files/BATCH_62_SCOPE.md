# BATCH 62 — Scope — Regime Taxonomy Redesign

**Phase:** 15b (Regime / DBS / Strategy / Filter Restructure)
**Sub-Phase:** B — Regime Taxonomy Redesign
**Batch:** B62
**Date:** 2026-04-16
**Author:** Claude Code
**Status:** APPROVED — Langston reviewed (4 flags), previous CC reviewed (8 flags), Kyle locked 4 benchmark decisions + 6 implementation points. All applied.

---

## 1. Why this batch exists

B61 proved that the current regime classifier (`calculatePairRegime()` in `market-regime.ts`) is systematically mislabeling directional pairs as range-bound. The numbers are structural, not transient:

- **70.17%** of RANGE_BOUND_STABLE labels have non-NEUTRAL DBS (drift contamination)
- **55.28%** of strongly directional pair-cycles are locked out of trend strategies
- **IMPULSE_EXPANSION** at 1.03% is vestigial — 4 strategies are starving
- **STRUCTURAL_TRANSITION** at ~18–22% is likely a default fallback, not a transient regime

The pair-level DBS formula is validated (A.1 KEEP). The thresholds are defensible but need calibration (A.2). The global DBS aggregation has three code defects that must be fixed before it carries decisions (A.3 REVISE). DBS flicker is a threshold-placement artifact, not directional instability (A.4 PASS WITH CAVEAT).

**B62's job:** Redesign the regime classifier to use DBS as an input, so that directional pairs are correctly routed to trend strategies. This is the structural fix for the drift-contamination problem B59 identified and B61 quantified.

---

## 2. Phased approach

B62 is split into two phases to avoid committing to a classifier design before we know what the data demands.

### Phase 0 — Counterfactual Routing + Proxy Opportunity Analysis (no code changes, ~4 days)

Counterfactual analysis on B61's mature telemetry window. Answers the question: "If the classifier used DBS, what would happen to strategy routing?" Specifically produces the **failure-mode decomposition** that locks the Path D decision. **Note:** This is a counterfactual routing analysis with proxy signal assessment, not a full deterministic OHLC replay. The telemetry does not carry raw OHLC + indicator state, so strategy detect functions cannot be replayed exactly. Signal generation estimates use proxy assessment based on available telemetry fields (ATR, vol, ADX, momentum, DBS). Path D decisions should treat these as directional evidence, not precise counts.

### Phase 1 — Classifier Redesign + Global DBS Fixes (implementation, ~1–2 weeks)

Implements the classifier changes that Phase 0's data supports, plus the three global DBS fixes from A.3.

**Dependency separation:** The pair-level classifier redesign (§4.1) depends on **pair-level DBS** (validated in B61 A.1, KEEP). It does NOT depend on global DBS. The global DBS fixes (§4.2) are separate blocking prerequisites only for any downstream use of **global DBS** as a decision input. These two workstreams share a batch for scheduling convenience but have independent dependency chains.

---

## 3. Phase 0 — Counterfactual Routing + Proxy Opportunity Analysis

### 3.1 Objective

Produce a per-strategy table showing:
- How many pair-cycles each trend strategy is currently eligible for
- How many would become newly eligible under a DBS-integrated classifier
- Of those, how many would actually generate a signal (detect function fires)
- Of those, how many survive SQE/RTB/Net EV gates
- The **x/y split**: x = Failure Mode A (regime-scarcity lockout), y = Failure Mode B (post-eligibility gate rejection)

This table is the decision input for whether Paths A/B/C (fix the classifier) are sufficient, or whether Path D (trend-rider with separate filters) is also needed.

### 3.2 Replay design (5 steps from B61 report §7.5a)

1. **Counterfactual regime labeling.** Apply a candidate DBS-integrated classifier to each MCE cycle-sample. Produce a `counterfactual_regime` column. The candidate classifier adds a DBS check to the existing vol + ADX + momentum logic.

2. **Counterfactual eligibility.** For each pair-cycle that flips regime under the counterfactual, compute which trend strategies become newly eligible via the canonical regime → strategy map (`CANONICAL_REGIME_STRATEGY_MAP`).

3. **Proxy signal assessment.** For each newly-eligible (pair, cycle, strategy) tuple, estimate whether the strategy's detect function would plausibly fire. Full OHLC + indicator-state replay is NOT available from telemetry — this step uses a **proxy assessment** based on the strategy's minimum indicator requirements (ADX thresholds, volatility floors, momentum direction) vs the telemetry's captured values. This produces directional estimates, not deterministic signal counts. The report must label all signal-generation numbers as "proxy estimates" and state the confidence bound.

4. **Counterfactual gate survival.** For signals that would fire, assess SQE confidence floor, RTB ranking cutoff, and Net EV threshold survival. Use recorded gate thresholds from the current configuration.

5. **Output.** Per-strategy failure-mode table with x/y split.

### 3.3 Candidate classifier designs to test

The replay tests **three** candidate designs against the current classifier:

**Design A — DBS override.** Current classifier logic unchanged, but add: if `|DBS score| ≥ 0.30` (UP_MODERATE or stronger), override the regime to TREND_FRIENDLY_STABLE regardless of vol/ADX/momentum. Simplest change, most aggressive reclassification.

**Design B — DBS as fourth input.** Add DBS magnitude as a fourth dimension to the existing vol + ADX + momentum decision tree. Specifically:
- Current RBS condition (`vol < 0.012 && dx < 45`) gets an additional gate: `AND |DBS| < 0.10`
- Current TFS condition (`mom > 0.003 && dx > 50`) gets relaxed: `OR |DBS| >= 0.30`
- IE condition gets relaxed: `OR (vol > 0.015 && |DBS| >= 0.50)`

**Design C — Mixed.** Design B for most regimes + Design A as a safety net for strong-DBS cases (|DBS| ≥ 0.50) that Design B still routes to RBS/ST.

The replay runs all three designs on every cycle-sample and reports the regime distribution + strategy eligibility + x/y split for each. **All distribution measurements must use rolling-window methodology per CLAUDE.md §5 rule #13** (prefer rolling windows over single-point snapshots). Report both the rolling-window mean and variance for any distribution-shaped quantity.

### 3.4 Non-OHLC dependencies (mandatory honesty section per B61 §7.5b)

The replay must enumerate every non-OHLC input and state how it is held constant or approximated:

| Dependency | Treatment |
|---|---|
| MCE 60s TTL cache | Frozen: use recorded values at cycle time. Report may differ ~3–5% from live. |
| Global friction cache | Frozen: use the recorded value at cycle time if available; otherwise use session-wide median. |
| Global DBS cache | Frozen: use MCE telemetry's per-cycle global DBS. Note: this is the noisy unweighted-median value (A.3 defect), so treat as approximate. |
| Active pair-pool / filter-pool state | Frozen: the 60-pair universe from the telemetry window is the pool. Pairs not in telemetry are excluded. |
| Telemetry-aggregator regime context | Frozen: use the classifier regime recorded in each telemetry line. |
| Time-of-call branching | Ignored: no strategy detect function branches on wall-clock time in the current codebase. |
| Double-count / path-collision | Canonical ownership tag applied: each pair-cycle gets `regime_gated` or `trend_rider_routed`. No double-counting. |

### 3.5 Path D decision rule

After the replay produces the x/y split per trend strategy:

- If **x dominates** (regime-scarcity > 70% for most trend strategies): Paths A/B/C alone will recover most opportunity. Path D is not needed in B62.
- If **y dominates** (gate-rejection > 50% for ≥2 trend strategies): the classifier fix alone won't help — Path D (trend-rider with DBS-tuned gates) should be scoped as a B63 or B64 deliverable.
- If **mixed**: evaluate per-strategy. Path D may be needed for specific gate-rejection-heavy strategies only.

**Proxy-uncertainty caveat:** The x/y split comes from proxy signal estimates (§3.2 step 3), not deterministic replay. Thresholds should be interpreted with a **±5–10% confidence band**. If the split falls in an ambiguous zone (e.g., x = 65%, y = 35%), the default is **no Path D in B62** — the bias is toward not building it unless the data clearly demands it, **unless there is strong per-strategy asymmetry** (e.g., one strategy shows x = 30% / y = 70% while others show x = 80% / y = 20%). In that case, Path D may be warranted for the gate-rejection-heavy strategy specifically, not as a wholesale addition.

**Path D is NOT pre-committed.** The replay data decides.

### 3.6 Phase 0 deliverable

`BATCH_62_PHASE0_REPLAY_ANALYSIS.md` containing:
- Per-strategy failure-mode table (x/y split)
- Regime distribution under each candidate design (A, B, C)
- Non-OHLC dependencies section
- Path D decision with rationale
- Recommended classifier design for Phase 1 implementation

---

## 4. Phase 1 — Classifier Redesign + Global DBS Fixes

### 4.1 Classifier changes (design selected by Phase 0)

Modify `calculatePairRegime()` in `server/core/metrics/market-regime.ts` to incorporate DBS as an input. The specific design (A, B, or C) is selected by the Phase 0 replay results. **This is the first time the code freeze on `market-regime.ts` is lifted since Phase 15b lock (2026-04-14).**

The new classifier must:
- Reduce RBS drift contamination from 70% to < 30%
- Increase TFS + IE combined share: **≥15% floor** (non-negotiable improvement from 12.5% mature-window baseline), **18–25% target band** (exact expectation depends on Phase 0-selected design)
- Maintain or improve the legacy classifier's family-level stability (1.56% baseline)
- Not break existing strategy routing for non-DBS regimes (HVU, ST)

### 4.2 Global DBS fixes (from A.3 — blocking prerequisites)

These three fixes must land BEFORE global DBS is consumed by any decision layer:

| # | Fix | File | Effort |
|---|---|---|---|
| 1 | Supply real 24h volume data to `computeGlobalBias()` | `market-indicators.ts` + volume data source | ~1h |
| 2 | Ensure full cache coverage before computing global DBS (atomic snapshot approach) | `market-context-engine.ts` | ~2–4h |
| 3 | Add sentinel-zero filter to global aggregation | `directional-bias.ts` types + `market-context-engine.ts` | ~30min |

### 4.3 Benchmark decisions (Kyle locked 2026-04-16)

**Four decisions locked:**

1. **Phase 0 runs on current 60-pair non-benchmark universe.** Benchmarks are NOT unblocked in VTS before Phase 0. The classifier design question won't materially change with 3-6 additional pairs, and unblocking would cost 48-72h telemetry delay on the critical path. B61 comparability is preserved.

2. **Unblock benchmarks in VTS at Phase 1 start.** Remove the Directive 11.6F benchmark exclusion filter (`vts-runner.ts` ~L1256-1257) as a pre-step before/alongside classifier deploy. The 72h post-deploy verification metrics are then measured on the full intended trading universe including BTC/ETH/SOL. Active trading will trade benchmarks; VTS should simulate them.

3. **Include BTC/ETH/SOL in global DBS aggregation.** A signal called "global" that excludes 57% of the crypto market is semantically wrong. Flow benchmark MCE cached contexts into `computeGlobalBias()` as part of global DBS fix #1.

4. **No volume weight cap initially. Measure first, cap only if data demands it.** The weighted median is inherently robust against single-entry dominance. Add a configurable cap constant (`GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT = 1.0`, effectively disabled) so a cap can be activated later without a code change. Report BTC's actual weight share in post-deploy verification metrics. If BTC consistently exceeds 40% of total volume weight and the median degenerates, activate cap at 20-25%.

### 4.3.1 Shadow telemetry for benchmarks (optional Phase 0 Step 1.5)

Add a lightweight benchmark MCE/DBS telemetry capture during Phase 0 WITHOUT unblocking VTS benchmark trading. Call `computeContext()` for benchmark pairs in the MCE scan and emit telemetry, but don't pass them to VTS strategy evaluation. This lets Phase 0 validate the classifier design against benchmark DBS behavior without the 48-72h full VTS unblock delay. **Strongly preferred unless materially invasive** (per Langston) — proceed with Phase 0 regardless only if the data path turns out to be complex.

### 4.4 IE redefine-or-delete (from B61 carry-forward item 7)

**Step 1:** Redefine IE with a less-restrictive criterion. The current condition (`vol > 0.020 && dx > 55`) is empirically too narrow — only 1.03% of cycles qualify. **Initial candidate** (subject to Phase 1 measurement and adjustment): replace with a DBS-magnitude + volatility criterion, e.g., `|DBS| >= 0.50 && vol > 0.015`. Justification for starting values: 0.50 corresponds to approximately the 97th percentile of |DBS| in the B61 mature window (capturing ~3% of cycles as IE candidates); 0.015 is midway between the current RBS ceiling (0.012) and IE floor (0.020). Both values are initial and will be calibrated against the Phase 0 counterfactual distribution.

**Step 2:** Measure the redefined IE share over the telemetry window. Target: 3–5% of cycles.

**Step 3:** If redefined IE is still < 1% or behaviorally indistinct from TFS, delete IE and redistribute its 4 strategies to TFS/HVU. If > 1% and distinct, keep the redefined version.

No pre-commitment to delete or keep.

### 4.5 STRUCTURAL_TRANSITION definition review

ST at ~18–22% is the default `else` fallback in `calculatePairRegime()` (line 142). B62 must decide:
- Is ST a legitimate regime with real semantic meaning, in which case 18% should be bounded?
- Or is it a catch-all bin, in which case it should be narrowed or split?

The DBS-integrated classifier should naturally shrink ST by correctly routing currently-ambiguous pairs to TFS or RBS based on their DBS.

### 4.6 Category granularity (from A.4 carry-forward item 5)

A.4 Final showed 2.37% category-boundary flicker (technical fail) but 1.35% family-level flicker (pass). B62 chooses one of:
1. **Raw DBS score** as continuous classifier input — no discretization boundary, no flicker
2. **Family-level categories** (UP/NEUTRAL/DOWN) — 3 categories, 1.35% flicker
3. **Adjusted 7-category thresholds** (rolling percentiles or tighter fixed) — reduces boundary chatter

### 4.7 Threshold calibration (from A.2 carry-forward items 6–8)

If B62 keeps DBS categories (options 2 or 3 above):
- STRONG categories at 2.38% combined need wider capture (tighten thresholds or use rolling percentiles)
- Positive median skew (+0.042) means UP/DOWN thresholds should not be symmetric
- Rolling-percentile approach recommended by A.2 Final

### 4.8 Strategy capacity planning (from B61 carry-forward item 8)

The 5 TFS-mapped strategies will see significantly more flow under the new classifier (~7–8× increase in candidate signal volume based on B61's drift contamination numbers). B62 must audit:
- Per-strategy concurrency limits
- RTB ranking behavior under higher candidate volumes
- Confluence-buffer capacity
- Any fixed-size data structures that assume current TFS flow rates

### 4.9 Dormant-wire + half-wire cleanup

B61 carried two dead code paths as discovered. B62 should fix them. **The decision depends on which classifier design Phase 0 selects:**

- `signal-orchestrator.ts:454` — dormant DBS consumer wire (confidence modifier). **If the Phase 0-selected design uses DBS at the regime-labeling level only** (Designs A/B/C all do), the per-signal confidence modifier is redundant — DBS is already consumed at the classifier stage before signals are generated. **Remove the dead code.** If a future design needs per-signal DBS modulation (post-B62), it should be built fresh with clean wiring, not resurrected from a dormant path with a secondary bug at L453.
- `vts-runner.ts:877` — half-wired no-op. Same logic: if DBS is consumed at the classifier level, the per-trade confidence modifier in VTS is redundant. **Remove.** The VTS already captures DBS category + score as metadata (B61 wave 1); it doesn't need to apply a modifier.

### 4.10 Component-clamp evaluation (from B61 carry-forward item #10)

B61 found the three DBS component clamps are UNAUDITED with divergent saturation rates: slope 0%, return 4.6%, ema 7.9%. The spread suggests three independent guesses rather than a coherent calibration. B62 Phase 1 should:

1. Measure post-deploy component saturation rates on ≥72h of telemetry
2. Compare to B61 baselines (slope 0%, return 4.6%, ema 7.9%)
3. Recommend widen/tighten/no-change for each clamp

This is an evaluation task, not a code change in B62 — unless saturation rates shift dramatically (e.g., ema saturation > 15%), in which case the clamp adjustment becomes a B62 implementation item.

### 4.11 Flicker-threshold principle (from B61 carry-forward item #12)

The 1.5× flicker baseline multiplier and the numeric baseline value (1.56% on the mature window) are **audit gate values, not runtime toggles** (per B61 consensus item #13). The system does NOT check DBS flicker every minute and toggle DBS in/out. **Config-driven implementation is deferred to post-launch maintenance.** However, the principle stands: the absolute numeric baseline should be **re-measured on future telemetry windows** rather than treated as eternal. Each major classifier change (including this one) should re-run A.0 on post-deploy data to establish a new baseline.

---

## 5. Verification criteria

### Phase 0 verification

- [ ] Replay analysis document exists with per-strategy x/y split
- [ ] All three candidate designs tested
- [ ] Non-OHLC dependencies section present
- [ ] Path D decision stated with rationale
- [ ] Langston reviews replay analysis before Phase 1 begins

### Phase 1 verification

**Measurement methodology:** Post-deploy metrics are measured by re-running `scripts/phase15b/a2_final.py` (or equivalent) on ≥72h of post-deploy cycle-sampled telemetry, using the same rolling-window methodology as B61 A.2 Final (per CLAUDE.md §5 rule #13: prefer rolling windows over snapshots).

**72h timeline constraint:** B62 cannot fully close (completion report with verified metrics) until ≥72 hours after staging deploy. The deploy itself can happen quickly, but the verification gate has a built-in 3-day wait. Step 24 also includes re-running A.0 on post-deploy data to establish a new classifier flicker baseline. The mature-window A.0 baseline (1.56%) is authoritative for all flicker comparisons; the original 1.37% from the ~15.5h window is superseded.

**Provisional-to-Final stability note:** B61 demonstrated that early-window and mature-window analyses produce consistent results (all numbers within ±3pp). This validates that Phase 0's analysis on the current 60-pair telemetry window is likely representative of what the full-universe mature window will show post-deploy.

- [ ] `calculatePairRegime()` uses DBS as an input
- [ ] RBS drift contamination < 30% on cycle-sampled telemetry (post-deploy)
- [ ] TFS + IE combined share ≥ 15% floor (18–25% target band, exact expectation set by Phase 0)
- [ ] Family-level regime flicker ≤ 2.0% (post-deploy)
- [ ] All three global DBS fixes deployed and verified
- [ ] Benchmark pairs included in global DBS aggregation (BTC/ETH/SOL)
- [ ] Configurable cap constant present (`GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT = 1.0`)
- [ ] BTC volume weight share in global DBS median reported. 40% is a review trigger (not an automatic activation rule) — if consistently > 40%, evaluate whether the median is degenerate and whether activating cap at 20-25% is warranted
- [ ] VTS benchmark exclusion (Directive 11.6F) removed — benchmarks in VTS trading universe
- [ ] IE redefined or deleted with measurement evidence
- [ ] ST share < 15% or explicitly justified if higher
- [ ] Strategy capacity audit for TFS-mapped strategies completed
- [ ] Dormant-wire and half-wire either energized or removed
- [ ] No new CI failures introduced. Pre-existing TS Check errors (Running Issue #39, 654 errors) unchanged unless explicitly fixed in-batch. Build, Test Suite, and Docker Build remain GREEN.
- [ ] Staging deploy + PM2 restart successful
- [ ] System Manual Layer 1 updated with new classifier logic
- [ ] SIM updated with new/modified component connections

---

## 6. Files expected to be modified

| File | Change type |
|---|---|
| `server/core/metrics/market-regime.ts` | **MAJOR** — classifier redesign (code freeze lifted) |
| `server/core/metrics/directional-bias.ts` | MINOR — sentinel-zero boolean on `DirectionalBiasResult` type |
| `server/services/market-context-engine.ts` | MODERATE — atomic cache snapshot + sentinel-zero filter in `computeGlobalBias()` |
| `server/services/market-indicators.ts` | MINOR — supply real volume data to `computeGlobalBias()` |
| `server/config/canonical-regime-strategy-map.ts` | POSSIBLE — IE strategy reassignment if IE is deleted |
| `server/services/signal-orchestrator.ts` | MINOR — fix dormant wire (energize or remove) |
| `server/services/vts-runner.ts` | MODERATE — remove half-wire + remove Directive 11.6F benchmark exclusion filter |

---

## 7. What B62 does NOT do

- **Does not build Path D** (trend-rider strategy family) unless Phase 0 replay data demands it. Path D is a B63/B64 decision.
- **Does not modify DBS formula weights or component logic.** A.1 Final = KEEP. Formula stays as-is.
- **Unblocks VTS benchmark exclusion in Phase 1** (Directive 11.6F filter removed). Benchmarks join VTS trading universe for post-deploy verification.
- **Does not implement adaptive/ML-driven regime classification.** This is a Phase 17/18 post-live concern.
- **Does not add new strategies.** B62 makes existing strategies reachable by fixing the routing. New strategies are a separate batch.

---

## 8. Dependencies

- **B61 telemetry must remain running.** Phase 0 replay uses the B61 cycle-sampled data. `DT_PHASE15B_DBS_TELEMETRY=1` must stay set.
- **Staging server must remain healthy.** PM2, nginx, Supabase all operational.
- **Code freeze on `market-regime.ts` lifts at Phase 1 start.** Not before Phase 0 completes.

---

## 9. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Phase 0 replay fidelity limited by telemetry-only data | HIGH | MEDIUM | Honest non-OHLC dependencies section; treat replay as directional, not authoritative |
| Classifier change breaks existing HVU/ST routing | LOW | HIGH | Run new classifier on existing telemetry before deploy; compare regime distributions |
| TFS strategy capacity exceeded under 7–8× flow increase | MEDIUM | MEDIUM | Capacity audit in Phase 1 §4.8 before deploy |
| IE redefine produces a regime behaviorally identical to TFS | MEDIUM | LOW | Measure over 72h before committing; delete if indistinct |
| Global DBS fix #2 (cache stability) cascades into MCE timing | LOW | MEDIUM | Atomic snapshot approach (option b) is self-contained |

---

*End of BATCH_62_SCOPE.md — DRAFT.*
