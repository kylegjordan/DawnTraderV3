# BATCH 61 — Sub-Phase A: DBS Validation

**Phase:** 15b (Regime / DBS / Strategy / Filter Restructure)
**Sub-Phase:** A — DBS Validation (BLOCKING)
**Date:** 2026-04-14 (revised 2026-04-15 — previous-session review + Langston consensus)
**Author:** Claude Code
**Status:** APPROVED by Langston 2026-04-15 pending this revision fold-in
**Owner:** Claude Code (A.0, A.1, A.2, A.4) + Langston (A.3)

---

## 1. Purpose

Validate that the Directional Bias Score (DBS) is mathematically and empirically sound **before** it is used as a first-class input to the regime classifier in B62. If DBS is flawed at the foundation, any downstream restructure inherits the flaw.

This is an **audit batch**. No threshold or formula edits to `server/core/metrics/directional-bias.ts` or `server/core/metrics/market-regime.ts`. **Instrumentation only.** Regime/DBS code freeze is in effect per Phase 15b lock (2026-04-14).

### 1.1 Intent

DBS will become a load-bearing input to the regime classifier, and (conditionally, in Sub-Phase E) to confidence modifiers, filter gates, and ranking logic. Any flaw in the DBS score — formula, weights, thresholds, stability, or global aggregation — will propagate into every downstream decision. This batch's job is not classifier neatness; it is to establish whether DBS is **trustworthy enough to carry downstream trade-quality decisions**. If it isn't, B62 is building on sand.

### 1.2 Desired Outcome

"Good enough to carry into B62" means, at minimum:

- The DBS formula and weights have been empirically validated against the live DBS distribution, not assumed from defaults.
- The category thresholds are either confirmed behaviorally meaningful or replaced with rolling-percentile thresholds that are.
- The global DBS aggregation methodology is understood, its pair universe is stable (or its drift is bounded and documented), and it is cross-referenced against at least one external market-direction reference.
- DBS values are stable cycle-to-cycle, reflect price moves without excessive lag, and the three components are individually sane.
- Silent-zero (early-return) observations are quantified and explicitly **excluded** from all category-mass and distribution analyses.
- Every recommendation in the B61 deliverables is traceable to cycle-sampled evidence (authoritative) with trade-sampled evidence marked explicitly provisional.

If any of these cannot be asserted by the end of B61, the phase does not advance to B62 — we either extend the forward cycle-sampled collection window or revisit the methodology.

---

## 2. Context Snapshot

- **DBS formula** (in `server/core/metrics/directional-bias.ts`): `score = slopeComponent + returnComponent + emaComponent`, where:
  - `slopeComponent = clamp((linreg_slope(log_close) * avgPrice / ATR) * 0.40, -0.40, +0.40)`
  - `returnComponent = clamp((close[N]-close[0])/close[0] * 10, -1, 1) * 0.35`
  - `emaComponent = clamp((EMA_fast − EMA_slow) / ATR, -1, 1) * 0.25`
  - Final score clamped to `[-1.0, +1.0]`.
- **Default config** (`DEFAULT_DBS_CONFIG`): weights 0.40/0.35/0.25, lookback 30 candles, EMA periods fast=9 / slow=21.
- **Thresholds**: `UP_STRONG ≥ 0.60`, `UP_MODERATE ≥ 0.30`, `UP_WEAK ≥ 0.10`, `NEUTRAL (−0.10, 0.10)`, mirrored down.
- **Global DBS**: weighted median of pair DBS scores, weighted by 24h volume.
- **Current consumer status (corrected 2026-04-15 post-Phase-3a-grep):** dormant wire on orchestrator, no-op half-wire on VTS, both buried under ambiguous "orphan" language in prior governance docs. Specifically:
  - `server/services/signal-orchestrator.ts:454` — dormant consumer wire. Imports `computeBiasConfidenceModifier` (L89) and multiplies `extendedMetrics.confidence` by `dbsModifier` with recomputed `finalScore` at L448–467 (shipped 2026-03-05 in commit `c28f0df`, same day as DBS module creation). **Never executed against a captured cycle** because active trading has been continuously OFF since at least 2026-01-12 (verified against zero rows in `trades`, `paper_trades`, `paper_sim_trades` and audit_log latest timestamp 2026-01-12 19:05 UTC — seven weeks before DBS integration). The L448 comment `// (parity with VTS path)` is doubly incorrect: VTS has no applying behavior to achieve parity with, and the orchestrator path has not run at all.
  - `server/services/vts-runner.ts:877` — half-wired dead code. Imports `computeBiasConfidenceModifier` (L67) and computes `biasModifier = computeBiasConfidenceModifier(biasCategory)` at L875–877; the result is never referenced again anywhere in the file. Every VTS-emitted trade across the 15-day audit window has been scored with `biasModifier` computed and immediately discarded.
  - **15-day VTS audit window is DBS-clean.** The ~960 closed VTS trades between 2026-03-31 and 2026-04-14 are raw observations of the scoring path without applied DBS modulation. B61 measurement integrity is intact.
  - All other DBS-touching sites in the codebase are benign passthrough / metadata / display references (trade metadata, UI badges, CSV export, DB columns); see PRE_AUDIT §2.2.1 for the full inventory. The two sites above are the only non-benign references and neither has ever applied DBS to a captured decision.
- **Observed live distribution** (B59-era, 88 samples): DBS score range `[−0.537, +0.685]`, 55.7% of pairs UP_MODERATE or stronger, 4.5% NEUTRAL.
- **Simulated DBS-based classifier**: `TREND_FRIENDLY_STABLE` 19.3% → 55.7%, `RANGE_BOUND_STABLE` 54.5% → 3.4%.

---

## 3. Historical Data Availability (pre-kickoff check)

**VTS trade-level data with `pairDirectionalBias` field:**
- **~15+ recent days**: 2026-03-31 → 2026-04-14.
- **~960 closed VTS trades** in that window carry `pairDirectionalBias`, `globalDirectionalBias`, `regime`, `strategy`, outcome fields.
- This is the primary historical source for **A.1 Provisional** (component independence / weight perturbation / ATR-bucket / edge-case spot checks), **A.2 Provisional** (exploratory threshold calibration), and **A.4 Provisional** (component sanity spot check + silent-zero count from VTS trade metadata). All three Provisional passes are explicitly non-gating and cannot bless anything for B62. **A.1 Final, A.2 Final, and A.4 Final are cycle-sampled** and do not depend on this window — they run on forward telemetry after the §3 maturity gate is satisfied and Langston confirms maturity in writing.

**Regime archive (`logs/regime_archive/`):**
- **Sparse** — only ~5 daily snapshots since the B59 aggregator fix. Not useful for longitudinal validation on its own.
- We will NOT lean on regime_archive for Sub-Phase A. Historical validation piggybacks on VTS trade-level regime+DBS snapshots instead, which are denser and per-decision rather than per-day.

**Critical distinction — trade-sampled vs cycle-sampled evidence (three-way consensus, 2026-04-14, extended 2026-04-15):**
- The 15-day VTS window is **trade-sampled only**. VTS trades fire after signals pass filters, so the DBS distribution at trade time is **selection-biased** toward pairs where strategies saw valid setups. It does not represent the full pair-time distribution and cannot be treated as authoritative for any distribution-dependent measurement (correlation, weight perturbation, ATR-bucket comparison, threshold calibration, flicker, latency).
- **Cycle-sampled DBS telemetry does not exist historically** because no consumer ever logged it. It must be collected forward via Phase 15b instrumentation (see §5).
- **A.1, A.2, and A.4 are ALL executed in two passes** (revised 2026-04-15 after previous-session review identified A.1 and A.4 had the same trade-sampled bias as A.2 but were not split):
  - **Provisional pass** — runs immediately on the 15-day trade-sampled window (for A.1 and A.2) or on trade metadata spot-checks (for A.4 component sanity). Surfaces early patterns. **Explicitly non-gating.** Exploratory only. Cannot be used to bless anything for B62.
  - **Final pass** — runs on forward cycle-sampled telemetry once the collection window has passed the maturity test below. **Authoritative and gating.**
- Historical validation beyond 15 days is deferred to B62 (Sub-Phase B.2) retroactive replay.

**Maturity test for the cycle-sampled window (LOCKED — previous-session item 2 + Langston refinement, 2026-04-15):**

The window is mature iff **at least 2 of the following 3 conditions hold**:

- **(a) Global DBS crossed NEUTRAL in both directions during the window** — i.e. the cycle-sampled global DBS trace touched a positive category from a non-positive state, AND touched a non-positive category from a positive state, at different points in the window. This requires genuine aggregate-level direction change, not a single one-way drift.
- **(b) At least 3 distinct pair-level 2-sigma volatility moves occurred across 3 different symbols** — tightened from the original "at least one 2-sigma move" per Langston. One 2-sigma move can be a single weird alt; 3 distinct symbols makes it condition diversity rather than an outlier event.
- **(c) The RANGE_BOUND_STABLE / TREND_FRIENDLY_STABLE ratio in the cycle-sampled window differs from the 15-day VTS backdrop ratio by more than ±10 percentage points** — confirms the window is not an exact replay of the pre-kickoff state.

**Starting window:** 72–96 hours. **Extension:** if fewer than 2 of 3 conditions hold at 96h, extend in 24h increments until satisfied.

**Maturity declaration procedure:** CC posts the 3 condition values to Thread 21 when proposing maturity. Langston confirms or rejects in writing. A.1 Final / A.2 Final / A.4 Final cannot be run until Langston's written maturity confirmation is on Thread 21.

**B62 gate clause (updated for the three-way split):** *B62 kickoff is blocked until A.1 Final, A.2 Final, A.3, and A.4 Final are all GREEN based on forward cycle-sampled telemetry. The Provisional passes (A.1 Provisional, A.2 Provisional, A.4 Provisional) are informational only.* A.0, A.1 Provisional, A.2 Provisional, A.4 Provisional, and A.3 may complete before the cycle-sampled window matures — this allows most of the batch to progress while cycle-sampled evidence accumulates.

---

## 4. Objectives

### A.0 — Baseline of Current Regime Classifier *(CC)*

Before A.4 Final compares DBS flicker against "the existing classifier," we need a concrete baseline of what the existing classifier's flicker actually looks like. Without a baseline, "DBS within 1.5× legacy" is unmoored.

This runs on the first 6 hours of cycle-sampled telemetry once instrumentation is live — it does not require window maturity, it only requires a minimum of ~360 cycles of data (6h × 60s).

1. **Legacy classifier 1-cycle flip rate:** fraction of pair-cycle observations where `classifier.regime` at cycle N differs from cycle N-1, excluding SENTINEL_ZERO observations.
2. **Legacy classifier 3-cycle flip rate:** fraction of pair-3-cycle observations where regime at cycle N differs from cycle N-3.
3. **Distribution of regime assignments** in the baseline window (confirmation that the cycle-sampled distribution roughly reproduces the known ~54.5% RANGE_BOUND_STABLE from the B59-era snapshot — if it doesn't, flag as a window-representativeness concern).
4. **Red-flag check:** if the legacy classifier's own 1-cycle flip rate exceeds 5%, note explicitly that "DBS within 1.5× legacy" is not automatically comforting because the baseline itself is unstable. The A.4 Final flicker verdict must address this if triggered.

**Deliverable:** `BATCH_61_A0_BASELINE.md` — short report, baseline flicker figures, distribution confirmation, red-flag status.

---

### A.1 — Formula Review *(CC)* — **TWO PASSES: Provisional + Final**

Validate that `0.40×slope + 0.35×return + 0.25×EMA_alignment` is a defensible composite for "is this pair directionally biased right now?"

**A.1 Provisional (trade-sampled, exploratory, non-gating — previous-session item 1):**

Runs on the 15-day VTS window. Surfaces early signals only. Does NOT gate B62. Every figure in the deliverable must be labeled "trade-sampled (selection-biased)."

1. **Component independence (provisional):** measure correlation between slope / return / EMA components across the trade-sampled window. Early flag only.
2. **Weight sensitivity (provisional):** recompute DBS on the trade-sampled data with alternate weights `(0.50,0.30,0.20)`, `(0.33,0.33,0.34)`, `(0.40,0.20,0.40)`. Surface pattern, not authoritative.
3. **ATR-bucket distributions (provisional):** bucket the trade-sampled observations by ATR percentile (top 20% / mid 60% / bottom 20%) and compare DBS distributions per bucket.
4. **Edge cases (provisional):**
   - Thin-volume pairs (bottom-decile 24h volume) — does DBS produce usable or garbage scores on the trade-sampled subset?
   - Gaps / reporting pauses — silent-zero pattern in the VTS window.
   - Very recent listings with <30 candles — same silent-zero path.
5. **SENTINEL_ZERO separation:** all observations from the early-return `score: 0` path are tagged and excluded from the provisional correlation / distribution / perturbation math.

**Deliverable:** `BATCH_61_A1_FORMULA_REVIEW_PROVISIONAL.md` — labeled non-gating.

**A.1 Final (cycle-sampled, authoritative, gating for B62):**

Runs on the cycle-sampled telemetry once the maturity test in §3 is satisfied and Langston has confirmed maturity in writing.

1. **Component independence (final):** compute pair-level correlation between slopeComponent, returnComponent, and emaComponent across all cycle-sampled observations (SENTINEL_ZERO excluded). **Pass criterion:** if any two components are ≥ 0.90 correlated, the composite is effectively 2-dimensional and the A.1 recommendation flags the weights as overstating diversification.
2. **Weight sensitivity (final):** recompute DBS under alternate weight sets `(0.50,0.30,0.20)`, `(0.33,0.33,0.34)`, `(0.40,0.20,0.40)`, plus the current `(0.40,0.35,0.25)`. Report the 7-category mass shift for each alternate and the fraction of cycle-sampled observations that change category under each. Is the current weighting stable or on a cliff?
3. **ATR normalization check (final, with responsiveness injection — previous-session nice-to-have #2):**
   - (a) Bucket cycle-sampled observations by ATR percentile (top 20% / mid 60% / bottom 20%) and compare DBS distributions per bucket. If low-ATR has a radically wider DBS spread, normalization is under-compensating.
   - (b) **Responsiveness injection:** pick 5 pairs from each ATR bucket. For each, replay a 30-candle window and inject a synthetic final candle at entry + 1.0 × that pair's ATR upward. Compute the DBS delta. A well-normalized formula produces approximately equal DBS deltas across buckets. Report the delta per bucket and flag any bucket whose delta is more than 2× or less than 0.5× the mid-bucket delta.
4. **Edge cases (final):** thin-volume pairs, gaps, recent listings — run the edge-case inventory on cycle-sampled observations and confirm the behavior matches the A.1 Provisional early signals.
5. **SENTINEL_ZERO separation:** same tagging rule as provisional. Never mixed into correlation, distribution, or perturbation math.
6. **Recommendation:** explicit KEEP / TWEAK / REDESIGN with rationale tied to the cycle-sampled evidence.

**Deliverable:** `BATCH_61_A1_FORMULA_REVIEW_FINAL.md` — cycle-sampled, authoritative, gates B62.

### A.2 — Threshold Review *(CC)* — **TWO PASSES: Provisional + Final**

Validate that the fixed category thresholds match the live DBS distribution. Executed in two passes per §3 above.

**A.2 Provisional (trade-sampled, exploratory, non-gating):**

1. **Trade-sampled distribution:** build the per-pair DBS histogram across the 15-day VTS window (~960 trades). Report min / max / percentiles (1, 5, 10, 25, 50, 75, 90, 95, 99). **Every deliverable must label this "trade-sampled (selection-biased)".**
2. **Category mass (provisional):** report % of trade-sampled observations per category under current fixed thresholds.
3. **Early signals:** flag any pattern — e.g. a category that sits near-empty or one that dominates — that warrants investigation in the final pass.
4. **Silent-zero separation:** any observation originating from the `score: 0` early-return path is tagged `SENTINEL_ZERO` and reported in a separate row. It is **excluded** from histogram mass, percentile computation, neutral-band counts, and every category-mass figure.

**A.2 Final (cycle-sampled, authoritative, gating for B62):**

1. **Full distribution:** build the per-pair DBS histogram from the forward cycle-sampled telemetry log (see §5), sampling ALL pairs on every MCE cycle, not only pairs with active trades. Report same percentiles as provisional.
2. **Category mass (final):** report % of cycle-sampled observations per category under current fixed thresholds. This is the authoritative distribution.
3. **Fixed vs rolling-percentile thresholds:** simulate rolling-percentile thresholds (e.g. `UP_STRONG = 90th pct, UP_MODERATE = 70th, UP_WEAK = 55th, NEUTRAL = 45–55`) on the cycle-sampled data. Does this produce more balanced categories? More behaviorally meaningful splits?
4. **Behavioral validation (non-overlapping samples — previous-session item 6):** for each category under BOTH threshold schemes, compute forward 1h / 4h / 24h price return. **Use non-overlapping samples, not every-cycle rolling samples.** For 1h forward: one observation per pair per hour. For 4h forward: one per pair per 4h. For 24h forward: one per pair per 24h. This avoids autocorrelation inflation of effective sample size (naively using every 60s cycle would produce adjacent samples sharing 59/60 of their forward window, inflating confidence intervals). **Report both raw cycle count and usable non-overlapping sample count in every forward-return table** so the reader knows how much weight to place on each difference-in-means result. A category is meaningful only if forward behavior differs across categories in the expected direction on the non-overlapping samples.
5. **Neutral-zone width — both snapshot and cycle-sampled (previous-session item 9):** current NEUTRAL is ±0.10. Report the drift-contamination overlap **two ways**:
   - (a) **Reproduction of the original 88-pair snapshot figure** — take a single cycle-sampled snapshot near the center of the window, restrict to pairs present in the original B59 snapshot, and compute "of pairs classified RANGE_BOUND_STABLE by the legacy classifier, what fraction have DBS outside NEUTRAL." This reproduces the 47% figure from the range_trade investigation.
   - (b) **Full cycle-sampled figure** — same measurement across the entire cycle-sampled window, full pair universe, all observations.
   - **Divergence rule:** if (a) and (b) differ by more than ±10 percentage points, treat as a finding requiring explicit explanation in the deliverable (either the B59 snapshot was unrepresentative, or the cycle-sampled window is one-sided, or both).
6. **Silent-zero separation:** same tagging rule as provisional. SENTINEL_ZERO observations are reported but never mixed into distribution/category math.

**Deliverables:**
- `BATCH_61_A2_THRESHOLD_REVIEW_PROVISIONAL.md` — trade-sampled, labeled non-gating.
- `BATCH_61_A2_THRESHOLD_REVIEW_FINAL.md` — cycle-sampled, authoritative, gates B62.

### A.3 — Global DBS Methodology *(Langston)*

Langston owns this objective. Scope restated here for three-way visibility:

1. **Weighted-median-by-volume review:** is weighting by 24h volume the right choice, or should it be by market cap / liquidity / free float?
2. **Pair inclusion set + membership stability (tightened):** Langston's deliverable must explicitly answer:
   - What exact pair universe feeds global DBS (all FX5-scanned pairs vs. top-N by volume vs. fixed set)?
   - How often does that membership change? Daily? Hourly? Never?
   - Does membership drift change the *meaning* of the aggregate — i.e. can "global DBS moved" partly mean "the basket changed" rather than market truth?
   - If the basket is unstable, that is a methodology problem that must be surfaced, not washed into the score.
3. **Industry cross-reference (methodology locked 2026-04-15 per previous-session item 10 + Langston refinement):** compare global DBS behavior to Crypto Fear & Greed Index, BTC dominance trend, aggregate altcoin momentum indices, and any comparable "market direction" references Langston surfaces. Minimum methodology language:
   - **Normalize each external reference to the coarsest shared cadence required for valid comparison** (daily if needed). Do not force a fake rolling-correlation precision onto references that are daily snapshots or smoothed composite indicators.
   - For each reference, report:
     1. **Same-period direction agreement** — does the reference move in the same direction as global DBS over matched periods?
     2. **Lag check** — does global DBS appear to lead, lag, or co-move with the reference?
     3. **Strength of relationship** — a simple stated correlation method appropriate to the cadence. The method must be named in the deliverable.
     4. An explicit **verdict per reference**: `AGREES` / `LEADS` / `LAGS` / `DIVERGES` / `INCONCLUSIVE`.
   - If a reference lacks enough aligned data for a defensible comparison, label it `INCONCLUSIVE` rather than forcing a verdict. `INCONCLUSIVE` is a valid outcome.
   - Divergence is not automatically a failure — it may reveal a real methodology gap worth investigating — but must be explained.
4. **Regime-boundary behavior (primary/secondary framing):** primary evidence is VTS decision-window behavior plus external market references. The sparse `regime_archive` (5 snapshots) is **secondary** and must be framed as supporting, not authoritative. Do not overclaim regime-transition interpretation from 5 archive snapshots alone.
5. **Silent-zero handling:** any pair whose DBS was produced via the `score: 0` early-return path must be tagged `SENTINEL_ZERO` and **excluded** from global DBS membership for A.3 analysis purposes. Surface the count separately.

**Deliverable:** `BATCH_61_A3_GLOBAL_DBS_METHODOLOGY.md` — Langston authored.

### A.4 — Data Quality *(CC)* — **TWO PASSES: Provisional + Final** (previous-session item 7)

Confirm DBS values are stable and trustworthy. Split into provisional and final because flicker, latency, and silent-zero count all require cycle-sampled data that does not exist historically. Only component sanity can run before the window matures, and its "known directional behavior" test is replaced with a mechanical forward-return rule (previous-session item 5).

**A.4 Provisional (runs immediately on trade-sampled VTS metadata, non-gating):**

1. **Component sanity spot check (provisional):** on the 15-day VTS window, sample 20 closed trades stratified by outcome (10 largest wins, 10 largest losses). For each trade, pull the recorded `slopeComponent`, `returnComponent`, and `emaComponent` values. Confirm that at trade time, the sign of each component roughly matches the realized P&L direction for the winning trades and is consistent for the losing trades. This is an exploratory sanity check, not a predictive claim, and is explicitly non-gating.
2. **Silent-zero count (provisional):** count trades in the 15-day window where `pairDirectionalBias.score = 0` AND the early-return guard condition would have held. Surface the count. Flag if downstream VTS trade metadata is treating these as genuine NEUTRAL.

**Deliverable:** `BATCH_61_A4_DATA_QUALITY_PROVISIONAL.md` — non-gating.

**A.4 Final (cycle-sampled, authoritative, gating for B62):**

Runs on the cycle-sampled telemetry once the §3 maturity test is confirmed.

1. **Cycle-to-cycle stability (flicker) — relative target per previous-session item 3 + Langston refinement:**
   - Compute DBS 1-cycle category flip rate and 3-cycle category flip rate across all cycle-sampled observations (SENTINEL_ZERO excluded).
   - **Pass criterion (primary):** DBS 1-cycle flip rate must be within 1.5× the legacy regime classifier's 1-cycle flip rate measured on the same cycles (from A.0 baseline). If DBS is more flicker-prone than the existing classifier, that is a failure signal.
   - **Red-flag note (per Langston):** if A.0 shows the legacy classifier's own 1-cycle flip rate is above 5%, "within 1.5× legacy" is not automatically comforting — the deliverable must explicitly address whether DBS is itself stable in absolute terms, not just relative to an unstable baseline.
   - Also report the cross-category flip rate (how often a pair flips by more than 1 category in 3 cycles). No hard threshold but surface as a diagnostic.
2. **Latency simulation (injection magnitude locked per previous-session item 4):**
   - Select 20 pairs stratified by ATR bucket (top 20% / mid 60% / bottom 20%).
   - For each pair, replay a 30-candle window ending at a recent cycle. Inject a synthetic final candle with close at `entry + 2.0 × ATR` (upward shock), compute DBS, record the delta from the pre-shock score at shock cycle, +1, +2, +3, +5.
   - Repeat with close at `entry − 2.0 × ATR` (downward shock).
   - Report the decay curve per ATR bucket. A healthy formula reflects the injected move at the shock cycle with a monotonic approach to steady state.
3. **Component sanity (mechanical replacement per previous-session item 5 + Langston threshold softening):**
   - From the cycle-sampled window, select the 10 pairs with the highest forward-24h return and the 10 pairs with the lowest forward-24h return, measured at the window midpoint.
   - For each selected pair at the selection cycle, check whether:
     - (a) `slopeComponent` sign matches the forward-24h return sign
     - (b) `returnComponent` sign matches
     - (c) `emaComponent` sign matches
   - **Pass threshold: at least 16 of 20 agreement per component** (softened from 18/20 per Langston — this is a sanity check for silent bugs, not a predictive-dominance claim).
   - Report per-component agreement rates. Any component below 16/20 is flagged as a potential silent-bug candidate.
4. **Silent-zero count (cycle-sampled):** full count of SENTINEL_ZERO observations across the cycle-sampled window. Surface separately. Report the fraction of total observations affected.

**Deliverable:** `BATCH_61_A4_DATA_QUALITY_FINAL.md` — cycle-sampled, authoritative, gates B62.

---

## 5. Instrumentation (Allowed Under Freeze) — Footprint-Constrained

The freeze permits **read-only instrumentation** needed to collect evidence. Footprint must be defined upfront (pre-audit requirement, per Langston amendment #5) to prevent operational drift.

**Telemetry log specification (locked before implementation in BATCH_61_PRE_AUDIT.md):**

- **File path:** `logs/phase15b_dbs_telemetry/YYYY-MM-DD.jsonl` (daily rotation).
- **Emission point:** MCE per-cycle DBS computation path. One line per pair per cycle.
- **Exact fields per line:**
  - `ts` — ISO timestamp
  - `cycleId` — MCE cycle identifier
  - `symbol` — pair
  - `dbs.score` — final DBS score
  - `dbs.category` — classified category
  - `dbs.slopeComponent` / `dbs.returnComponent` / `dbs.emaComponent` — three components
  - `dbs.sentinelZero` — boolean, true iff the early-return `score: 0` path was hit (missing data, ATR=0, etc.)
  - `classifier.vol` / `classifier.adx` / `classifier.mom` — current classifier inputs for cross-reference
  - `classifier.regime` — current regime assignment (for A.2 Final neutral-zone overlap analysis)
  - `ohlc.len` — number of OHLC candles available (for edge-case debugging)
  - `atr` — ATR value used in normalization
- **Sampling:** full (all pairs, every cycle) for the forward collection window. Bounded by retention, not by sampling rate.
- **Rotation:** daily file rotation. No in-process buffering beyond standard log-line flushing.
- **Retention:** Phase 15b only. Files are deleted when Phase 15b closes. No long-term retention.
- **Disk budget:** pre-audit must estimate daily file size and confirm it stays under 50 MB/day across full pair set. If projected higher, sample by pair rather than by cycle.
- **MCE timing regression check:** instrumentation must be measured against baseline MCE cycle time. Hard ceiling: +1 ms per cycle. If instrumentation exceeds this, it is redesigned (async write queue, batched emission, etc.) before merge.

**Additional observational emission points (added 2026-04-15 per Phase-3a grep amendment):** Two feature-flagged emitters are added to capture the dormant consumer wire and half-wired dead-code paths empirically. No behavior change — pure observation.

- **Signal-orchestrator emitter** at `server/services/signal-orchestrator.ts:454` (just before the dbsModifier multiplication). Emits one telemetry line per execution with fields: `dbsModifier`, `confidencePreDBS`, `confidencePostDBS`, `finalScorePreDBS`, `finalScorePostDBS`, `dbsApplied` (boolean, true iff `dbsModifier !== 1.0`). **Expected firing rate during B61: zero**, because active trading remains off. Instrumentation buys measurement capacity for a future audit if active trading resumes; it produces no B61 audit data.
- **VTS-runner parity emitter** at `server/services/vts-runner.ts:877` (just after the `biasModifier` compute). Emits the same 6-field schema with `dbsApplied=false` on every cycle, empirically confirming the dead-code status. Expected firing rate: one line per VTS-signal-evaluation cycle. This is the forward confirmation that VTS's `biasModifier` remains discarded.
- Both emitters use the same file-rotation, feature-flag (`DT_PHASE15B_DBS_TELEMETRY=1`), try/catch error handling, and timing-budget rules as the MCE emitter. They write to `logs/phase15b_dbs_telemetry/consumer_sites/YYYY-MM-DD.jsonl` (separate file to keep consumer-site and MCE telemetry cleanly separated during analysis).
- Full field schema + rules are locked in `BATCH_61_PRE_AUDIT.md` §6.

**Scripts:** read-only scripts under `scripts/phase15b/` that consume VTS trade files + the telemetry log and produce the A.1/A.2/A.4 deliverables. No schema changes. No DB writes.

Explicitly **out of scope for this batch**:
- Any change to DBS weights, thresholds, component math, classification logic.
- Any change to `market-regime.ts` thresholds or formula.
- Any new consumer of DBS (confidence modifier, classifier routing, strategy gate). That is Sub-Phases B/C/E.

---

## 6. Verification Criteria (Phase 7/8 gates)

A batch objective is GREEN only if **both** CC first-pass and Langston second-pass confirm:

**Deliverable list (revised 2026-04-15):**
- `BATCH_61_A0_BASELINE.md` — legacy classifier baseline (non-gating, but required input to A.4 Final flicker target)
- `BATCH_61_A1_FORMULA_REVIEW_PROVISIONAL.md` — trade-sampled, non-gating
- `BATCH_61_A1_FORMULA_REVIEW_FINAL.md` — cycle-sampled, gating
- `BATCH_61_A2_THRESHOLD_REVIEW_PROVISIONAL.md` — trade-sampled, non-gating
- `BATCH_61_A2_THRESHOLD_REVIEW_FINAL.md` — cycle-sampled, gating
- `BATCH_61_A3_GLOBAL_DBS_METHODOLOGY.md` — Langston authored, gating
- `BATCH_61_A4_DATA_QUALITY_PROVISIONAL.md` — trade-metadata sanity, non-gating
- `BATCH_61_A4_DATA_QUALITY_FINAL.md` — cycle-sampled flicker/latency/silent-zero, gating

**Gate conditions:**

1. **A.0 GREEN** iff the baseline document exists, reports legacy classifier 1-cycle and 3-cycle flip rates, confirms the cycle-sampled distribution roughly reproduces the B59 snapshot, and flags the red-flag status.
2. **A.1 Provisional GREEN** iff the trade-sampled document exists, is labeled non-gating, applies SENTINEL_ZERO separation, and surfaces early patterns. Does NOT gate B62.
3. **A.1 Final GREEN** iff the cycle-sampled document contains component correlation matrix, weight perturbation table, ATR-bucket distributions, ATR responsiveness injection results, edge-case inventory, SENTINEL_ZERO tagging throughout, and an explicit KEEP / TWEAK / REDESIGN recommendation. **Gates B62.**
4. **A.2 Provisional GREEN** iff the trade-sampled document exists, is labeled non-gating, applies SENTINEL_ZERO separation. Does NOT gate B62.
5. **A.2 Final GREEN** iff the cycle-sampled document contains the full histogram, 7-category mass table under both fixed and rolling-percentile schemes, forward-return-by-category matrix using non-overlapping samples (with both raw and usable sample counts reported), neutral-zone drift-contamination reported both as B59-snapshot reproduction AND as full cycle-sampled figure (with the ±10 pp divergence finding rule applied), SENTINEL_ZERO separation, and an explicit threshold recommendation. **Gates B62.**
6. **A.3 GREEN** iff Langston's global DBS methodology doc exists, addresses all 5 sub-items (weighted-median review, pair-universe stability, industry cross-reference with coarsest-shared-cadence methodology and AGREES/LEADS/LAGS/DIVERGES/INCONCLUSIVE verdicts, primary/secondary regime-boundary framing, silent-zero exclusion), and concludes with a keep/revise recommendation. **Gates B62.**
7. **A.4 Provisional GREEN** iff the trade-metadata document exists, reports 20-trade component sanity spot check and silent-zero count from VTS metadata, labeled non-gating. Does NOT gate B62.
8. **A.4 Final GREEN** iff the cycle-sampled document contains: flicker figures meeting the 1.5× legacy relative target (with red-flag note if A.0 legacy flip rate > 5%), latency injection decay curves per ATR bucket for both ±2×ATR shock directions, component sanity at the 16/20 mechanical threshold, full silent-zero count, and a pass/fail verdict on DBS trustworthiness. **Gates B62.**
9. **Governance GREEN** iff the B61 completion report lists all 8 deliverables, SIM updates if any were triggered, SYSTEM_MANUAL updates if any were triggered (**and specifically: if A.1 Final findings warrant, SYSTEM_MANUAL Layer 1b ATR normalization section must be updated as a Phase 10 Tier 2 deliverable per previous-session nice-to-have**), the instrumentation MCE-timing regression result, the codebase consumer grep result from the pre-audit, and explicit confirmation that no code changes were made to `directional-bias.ts` or `market-regime.ts` beyond the locked instrumentation spec (subject only to the freeze-exception clause in §8).

**B62 gate (revised):** A single RED or PARTIAL on A.1 Final, A.2 Final, A.3, or A.4 Final blocks kickoff of B62. A.0 is not strictly gating but is a prerequisite input to A.4 Final. The Provisional passes (A.1/A.2/A.4 Provisional) are informational only and do NOT gate.

---

## 7. Dependencies & Impact Map Notes (pre-audit SIM consult)

Sub-Phase A touches:

- **`server/core/metrics/directional-bias.ts`** — read-only + potential instrumentation log points.
- **`server/core/metrics/market-regime.ts`** — read-only (we need its inputs vol/adx/mom for cross-reference in A.2/A.4).
- **MCE orchestration (`server/services/market-context-engine.ts` or equivalent)** — potential instrumentation entry point for per-cycle logging.
- **`logs/virtual_trades/*.json`** — read-only consumer.
- **`logs/regime_archive/*`** — read-only, sparse, secondary.

**Upstream dependencies of DBS:** OHLC data feed (Kraken), ATR computation (MCE), 24h volume (market data cache). None are modified.

**Downstream consumers of DBS:** currently NONE (orphan). That is why this audit is safe — no consumer can be broken by observing the metric.

**Blast radius of instrumentation:** low. Added log emissions only. No hot-path computation changes. Must verify instrumentation does not regress MCE cycle time (should be <1 ms added per cycle).

Full SIM / SYSTEM_MANUAL pre-audit analysis will be in `BATCH_61_PRE_AUDIT.md` after this scope is approved.

---

## 8. Out of Scope

- Classifier redesign (→ B62, Sub-Phase B)
- DBS integration into confidence modifier / gates / sizing (→ B63 C-inventory, then conditional B64/B65)
- Strategy re-audit under new classifier (→ B63, Sub-Phase D)
- Historical validation beyond the 15-day VTS window (→ B62 retroactive replay)
- Any **design improvement** to DBS formula, weights, or thresholds (→ B62/B64 if audit recommends)
- Any **design improvement** to `market-regime.ts` (→ B62/B64 if audit recommends)
- Outcome-weighted weight sensitivity analysis (deferred to B62)

### 8.1 Implementation Bug Exception (LOCKED 2026-04-15 per previous-session item 8)

The Phase 15b freeze on `directional-bias.ts` and `market-regime.ts` blocks **design improvements**, not **implementation bug fixes**. This distinction matters: a frozen audit that blocks a genuine bug fix is worse than the audit going long.

**Exception clause:** If any B61 deliverable (A.0, A.1, A.2, A.4) surfaces a **confirmed implementation bug** — defined as a computation that does not match the documented formula, a sign error, an off-by-one loop bound, a wrong field reference, an uncaught divide-by-zero, or any similar defect where the behavior is unambiguously not what the comment/spec describes — then:

1. **CC halts.** No further implementation proceeds.
2. **CC documents the bug** with file path, line number, the documented/expected behavior, the actual behavior, and the evidence that demonstrates the mismatch.
3. **CC posts the finding to Thread 21** for three-way discussion with Langston and Kyle.
4. **Kyle decides one of two paths:**
   - **(a) Carry-as-scoped:** the bug finding is noted in the completion report and the fix is deferred to B62 as a separate scoped item. Freeze remains in force.
   - **(b) Emergency exception:** Kyle grants an explicit freeze exception via the **Adjustment Framework emergency-exception process** (`1-system-manual/ADJUSTMENT_FRAMEWORK.md`), three-way consensus is required, and the specific bug is fixed in a targeted, minimal edit. The exception scope is the bug fix only; no other changes ride along.
5. **Design improvements always defer to B62/B64.** "This would be better if..." is not a bug. Only "this does not match the documented formula/spec" qualifies.

This clause exists to prevent the freeze from blocking a genuine defect, not to create a general pressure valve for "things we want to change."

---

## 9. Kickoff Checklist

Before implementation begins on B61:

- [ ] Langston reviews this scope on Thread 21 and approves / amends.
- [ ] Three-way written approval.
- [ ] `BATCH_61_PRE_AUDIT.md` drafted with SIM + SYSTEM_MANUAL analysis.
- [ ] Langston reviews the pre-audit.
- [ ] Instrumentation design (log schema, emission points, sampling rate) approved.
- [ ] CC executes A.1, A.2, A.4. Langston executes A.3 in parallel.
- [ ] Deliverables cross-reviewed.
- [ ] BATCH_61_COMPLETION_REPORT.md drafted with YES/NO/PARTIAL for each objective.

---

## 10. Amendment Log

**2026-04-15 — Phase 3a grep amendment (CC + Langston three-way consensus, Kyle-approved framing correction).**

The Phase 3a codebase consumer grep surfaced two previously undocumented references to `computeBiasConfidenceModifier`. Initial CC + Langston classification misread both as active consumers and concluded DBS had been shaping live signal confidence since Phase 14. That conclusion was factually wrong: active trading has been off continuously since at least 2026-01-12 (verified against zero rows in `trades`, `paper_trades`, `paper_sim_trades` and audit_log latest timestamp seven weeks before DBS integration on 2026-03-05).

The corrected framing — "dormant wire on orchestrator, no-op half-wire on VTS, both buried under ambiguous orphan language" — is folded into §2 Context Snapshot and §5 Instrumentation as in-place edits (not appended). This amendment note exists only for traceability of the review/correction process; the body of the scope now reads true on first pass.

Amendments folded into §2, §5, and (indirectly) §8.1 bug-exception rationale. Nothing in §4 Objectives, §3 Historical Data Availability, §6 Verification Criteria, §7 Dependencies, §8 Out-of-Scope (above §8.1), §9 Kickoff Checklist, or any gate condition is modified. B61 measurement integrity is unchanged — the 15-day VTS audit window is DBS-clean and the A.1/A.2/A.4 methodology is untouched.

Governance deltas logged separately in:
- `1-system-manual/SYSTEM_IMPACT_MAP.md` §5.1b (downstream consumer claim corrected)
- `1-system-manual/SYSTEM_MANUAL.md` Layer 1b (factual error corrected, false-parity-comment burial pattern added as case study)

---

*End of BATCH_61_SCOPE.md.*
