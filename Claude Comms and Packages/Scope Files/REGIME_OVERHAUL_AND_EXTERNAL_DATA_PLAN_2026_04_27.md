# Regime Classifier Overhaul + External Data Integration — Master Planning Document

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-04-27
**Status:** Pre-scoping — captures the full conversation between CC and Langston on Kyle's questions about external data, the regime classifier, and material improvement levers. **This is a planning document, not a scope document.** Decisions called out in §11.
**Reading-priority:** ⭐ MUST READ on next session start. Listed in `MEMORY.md` as key immediate-read.
**Context for why this exists:** Kyle's directive 2026-04-27 to capture everything we've discussed before context compaction so the work doesn't get lost. We have a coordinated set of changes that are interconnected and need to be planned out together rather than implemented piecemeal.

---

## §0 — Update 2026-04-28: Resolved decisions and design refinements

Following Kyle's review of this planning doc on 2026-04-28, all §11 decisions have been resolved and several design refinements have been added. This section captures the deltas. Downstream sections (§3, §5.3, §6, §10, §11) preserve the original CC+Langston conversation and reasoning for traceability.

### §0.1 §11 decision resolutions (Kyle, 2026-04-28)

| # | Decision | Kyle's answer |
|---|---|---|
| 1 | Adopt Langston's confidence-modifier (Option C) | **YES** — adopted |
| 2 | Phase dimension on existing regimes | **YES** — adopted, with rename MATURE → **PRIME** (see §0.2) |
| 3 | B67 as one coordinated batch | **YES** — but expanded to B67/B68/B69 split (see §0.4) |
| 4 | ML-light reliability score in scope | **YES** — slotted as B69 (separate batch) |
| 5 | Start B67 immediately after compaction | **YES** |
| 6 | B68 (Tier-2 external data) conditional | **YES** — conditional on B67 success; renumbered to B70+ post-split |
| 7 | Tier-1 sources: BTC dominance + funding + mcap (all three) | **YES** |
| 8 | Modifier range 0.85–1.05× initially | **YES** |
| 9 | Phase boundaries 2h / 12h | **YES** — calibrate with VTS data |
| 10 | Ship-data-then-validate | **REPLACED** by continuous replay-ablation framework (B67.0). See §0.5. |
| 11 | Pre-register success thresholds | **YES** — to be defined in `BATCH_67_SCOPE.md` |
| 12 | BTC-correlation codebase audit | **YES** — runs in B67 pre-audit (Step 2) |

### §0.2 Naming change: MATURE → PRIME

Throughout all subsequent code, schema, dashboards, governance docs, and discussions: phase dimension uses **EARLY / PRIME / LATE**, not EARLY / MATURE / LATE. Kyle's reasoning: PRIME more clearly conveys "right in the thick of things." Section §5.3 below retains the original "MATURE" wording for historical record; all forward-looking artifacts use PRIME.

### §0.3 Confidence score: identity clarified

The "confidence" Langston flagged as computed-but-underused is `RegimeClassification.confidence` — the per-pair regime classifier's own confidence number from `server/core/metrics/market-regime.ts`. This is **distinct** from:

- `PredConf` (signal-pattern match confidence, used in signal scoring)
- `CWQI` (composite weighted quality index, signal scoring)
- `FinalScore` (admission gate composite)

Today, regime confidence is **not consumed** by FinalScore, CWQI, or PredConf. The signal-scoring pipeline ignores it entirely. The "underused" diagnosis was specifically about regime confidence, not about the signal-scoring confidences. B67.5 wires regime confidence into seven concrete consumer points — see §0.6.

### §0.4 Final batch structure: B67 / B68 / B69 split

Original §6 proposed a single B67 with 5 sub-deliverables. The 2026-04-28 discussion expanded the lever set to 10 (Kyle's directive: don't let any of the recommendations slide). To keep individual batches reasonable, work is now split:

**B67 — Coordinated Regime-Confidence Core (~3–4 weeks)**

- B67.0 Telemetry & ablation framework (NEW; built first — see §0.5)
- B67.1 Macro confidence modifier (BTC dominance + funding + mcap)
- B67.2 Phase dimension (EARLY/PRIME/LATE)
- B67.3 Per-underlying position limits (general, not paper-only)
- B67.4 Realized-outcome feedback into classifier confidence
- B67.5 Wire confidence into seven downstream consumers (see §0.6)

**B68 — Structural Classifier Improvements (~3–4 weeks; starts after B67 closes)**

- B68.1 Multi-timeframe DBS agreement (Path B's second gate AND broader classifier input)
- B68.2 Volume regime dimension
- B68.3 Pair correlation context
- B68.4 Regime-age tracking as first-class metric
- B68.5 Path B sustainability tightening (uses B68.1's multi-TF metric)

**B69 — ML-Lite Reliability Score (~2–3 weeks; starts after B68 closes)**

- Logistic regression error-detector. Trained on B67/B68-instrumented data.

**Sequencing rationale:** ML-Lite trains on whatever the classifier looks like at training time. If we train it on the pre-B68 classifier and then change the classifier under it, the model is stale. ML-Lite ships last so it learns the post-B68 classifier.

External-data Tier-2 (the original B68 in MEMORY — exchange flows, liquidations, DXY, SPX) becomes B70+, renumbered post-split. Conditional on B67/B68 producing measurable lift before we invest in additional external feeds.

### §0.5 Telemetry & ablation framework (B67.0) — replaces "ship-data-then-validate"

§11 decision 10 originally proposed a 1–2 week macro-data-collection-before-activation phase. Kyle's directive 2026-04-28 redirected this: implement and measure with telemetry rather than observe-then-implement. The replacement is a **replay ablation framework** that measures each factor's impact while everything runs in production.

**Architecture:**

1. Every B67/B68 sub-deliverable has an `enabled` flag in `module_constants`.
2. Classifier emits its real decision plus N alternate decisions on every signal evaluation — one per factor; each alternate computed as "if this factor were absent."
3. Alternates logged to a sibling table.
4. Nightly job replays each alternate against the trade's actual price path → counterfactual outcome.
5. Dashboard panel: real WR vs WR-without-factor-X for each factor.

**Why this beats the original ship-data-then-validate plan:**

- Per-factor attribution is continuous, not batch-and-evaluate.
- All factors stay live in production. No A/B periods. No market-conditions-changed problem (rotation across observation periods is what makes traditional A/B unreliable here).
- ~2–3 days of implementation work, not a multi-week observation window blocking implementation.

**Exception — B67.3 (per-underlying limits) cannot be replay-attributed.** Limits prevent trades from existing in the first place; there is no actual price path to replay an alternate against. For B67.3 specifically: deterministic universe-split A/B (hash pair-ID, half with limit, half without, run for N days). One factor, one A/B test, manageable.

### §0.6 Eight consumers identified, **seven shipping in B67.5** — Consumer #6 deferred to Phase 19 observation

**Update 2026-04-28 (Kyle directive):** the originally-scoped 8 consumers reduce to 7 in B67.5. Consumer #6 (daily loss budget weighting) is deferred to a Phase 19.X observational decision item. Pre-audit V2 confirmed no daily-loss-budget service exists today and that the kill switch's auto-trip is not wired despite the threshold being configured. Both of those findings are deferred for paper-mode observation rather than building speculatively pre-launch. The numbering gap at #6 is preserved for traceability.

Today, `RegimeClassification.confidence` is essentially decorative — computed and shown in dashboards but not gating any decisions. B67.5 wires it into seven concrete decision points. This is the deliverable that makes B67.1 and B67.2 functionally meaningful (those re-compute the value; B67.5 makes the new value affect outcomes).

| # | Consumer | Today | Post-B67 |
|---|---|---|---|
| 1 | Signal admission gate | `admit = FinalScore ≥ threshold` | `admit = (FinalScore × f(regime_conf)) ≥ threshold` |
| 2 | Position sizing (Kelly) | Kelly × portfolio constraints | Kelly × regime_conf × portfolio constraints |
| 3 | EV gate threshold | Static per strategy | Inversely scales with regime_conf — low conf raises the EV bar |
| 4 | Strategy routing tiebreak | First-match / static priority | Highest-confidence regime wins the slot |
| 5 | TEC parameters at trade-open | Static `module_constants` | Modulated by regime_conf at entry — BE-lock distance, moonbag eligibility, ladder rung-floor buffer |
| 6 | Daily loss budget weighting | All losses count equally | Low-confidence-trade losses get a cost multiplier |
| 7 | VTS feature column | Not recorded | Persisted on every trade record — enables B69 ML-Lite training |

**Calibration-gated sequencing within B67:**

```
B67.0 telemetry framework
   ↓
B67.1 macro modifier  +  B67.2 phase dimension       (recompute the confidence value)
   ↓
CALIBRATION CHECK: does WR stratify cleanly by confidence bucket? (high-conf bucket WR > low-conf bucket WR by meaningful margin)
   ↓
B67.5 wire into seven consumers                       (only if calibration passes)
   ↓
B67.3 per-underlying limits  +  B67.4 realized-outcome feedback
```

The calibration check is a **hard prerequisite** for B67.5. If regime confidence is poorly calibrated, multiplying Kelly by it (consumer #2) makes sizing worse, not better. If calibration fails, B67.4 (realized-outcome feedback) likely needs to ship first to recalibrate, then re-test.

### §0.7 Routing-map methodology: post-hoc regime labeling

Original §5.4 implied the (regime, phase, strategy) → outcome map would be built from naïve backfill: tag every historical trade with classifier-label-at-entry, measure WR by bucket. Kyle's 2026-04-28 pushback was correct — this conflates two failure modes:

- (a) Strategy was a bad fit for the actual regime → routing-map problem
- (b) Classifier mislabeled the regime → classifier-accuracy problem

Both produce identical observations (loss). Same data point, two different lessons.

**Refined methodology — post-hoc regime labeling:**

For each historical trade, compute a second regime label using **only price action AFTER entry** (classifier re-run on the trade's holding period). Call this the **realized regime**.

Split trades into two cohorts:

- **Classifier-correct cohort** (entry label ≈ realized regime): informs the routing map. Strategy losses here are real strategy/regime mismatches.
- **Classifier-wrong cohort** (entry label ≠ realized regime): informs classifier improvements (B67.1 macro modifier, B68.1 multi-TF, B68.5 Path B tightening, etc.).

Routing map gets built from the **classifier-correct cohort only**. That's the clean signal.

**Honest caveat:** "realized regime" is hindsight-defined ground truth. We're using the classifier itself as the truth source, just run on forward-looking data. Imperfect but the best available without an external oracle. Worth doing — it's a real upgrade over naïve backfill.

This refines §5.4's lever ranking and adds ~50% audit work to B67's pre-implementation phase. Worth the investment.

### §0.8 Path B second-gate evaluation: four-case backtest

Original framing was implicit pick-one between multi-TF DBS agreement vs DBS slope. Kyle's 2026-04-28 suggestion: also test combining both. Final backtest matrix (lives in B68.1):

| Case | Gates |
|---|---|
| A | `|DBS| ≥ 0.30` alone (current — baseline) |
| B | A + multi-TF DBS agreement (5m sign matches 1h sign) |
| C | A + DBS slope rising/stable |
| D | A + multi-TF + slope (triple gate) |

**Selection criterion:** `net_expectancy × sample_size` — total expected $ produced over the backtest period. Maximizes total profit, not just per-trade WR. D may be highest per-trade but starve signal volume; B or C may still win on total expected dollars.

All four cases backtested. No prejudgment. Report all four results, data picks the winner.

### §0.10 Langston's consensus refinements (2026-04-28)

After CC sent the consensus message (R1–R7) summarizing §0.1–§0.9, Langston came back with sharpening adjustments. All accepted; consensus reached.

**§0.10.A — B67.3 deploys FIRST within B67.** Per-underlying limits are a safety net with zero confidence dependency — ship them before any new confidence factors so we have downside protection during the rollout. Original sequencing in §0.6 had B67.3 last; revised to first. Updated dependency chain:

```
B67.0 telemetry framework
  ↓
B67.3 per-underlying limits          (safety net, no confidence dependency)
  ↓
B67.1 macro modifier  +  B67.2 phase dimension
  ↓
CALIBRATION CHECK
  ↓
B67.5 wire confidence into 8 consumers
  ↓
B67.4 realized-outcome feedback
```

**§0.10.B — RegimeWeight REPLACED, not multiplied.** Critical architectural correction. Original §0.6 Consumer #1 had `admit = (FinalScore × f(regime_conf)) ≥ threshold` — multiply on top. Langston flagged: B63 Item 18 already proved RegimeWeight (the 20% term in FinalScore today) is anti-predictive; stacking regime confidence on top creates squared dependence on a flawed input. Correct approach: **regime confidence REPLACES RegimeWeight in the FinalScore formula.**

```
TODAY:        FinalScore = hybridScore × 0.4 + confidence × 0.3 + regimeWeight × 0.2 − decayPenalty × 0.1
POST-B67.5:   FinalScore = hybridScore × 0.4 + confidence × 0.3 + regimeConfidence × 0.2 − decayPenalty × 0.1
```

Important identity note: RegimeWeight today is `trendStrength × 0.7 + (1 − normalizedVolatility) × 0.3` — NOT the classifier's confidence. It's a per-signal composite of trend strength and low-volatility preference. The two underlying inputs (trendStrength, volatility) survive independently in their existing consumers (`strategy-engine.ts`, `signal-orchestrator.ts`, `strategy-filters.ts`, `strategy-validators.ts`, MCE, TEC, ATR sizing, friction modeling). Removing RegimeWeight does not orphan them.

**RegimeWeight deletion scope (per Kyle's directive — be exhaustive):**

- Code: `score-calculator.ts`, `quality_index.ts`, `signal_quality_evaluator.ts`, `score-weights.config.ts`, plus 40+ other server files. Full grep, file-by-file removal.
- Database schema: `paper_sim_trades.regime_weight` column removal via migration. Same for any other signal-level tables.
- UI: `client/src/pages/machine-learning.tsx` column. Closed-trade table column. Open-trade table column. Diagnostics dashboard tiles.
- CSV exports: open + closed simulated trade exports.
- Logs: `console.log` lines emitting `regimeWeight=...`.
- Tests: `finalscore-equivalence.test.ts`, `score-weights.test.ts`, plus regression tests.
- Governance docs: SYSTEM_MANUAL formula sections, AUTHORITY_BASELINE, ADJUSTMENT_FRAMEWORK, score-weights documentation, CHANGES_AND_FIXES entry.
- Active-trading tables: deferred per Kyle's directive until paper-mode rebuild — logged in POST_AUDIT_ROADMAP as deferred line item.

Full file list will be a sub-deliverable inside `BATCH_67_SCOPE.md` so Langston can verify completeness during Step-4 code review.

**§0.10.C — Calibration criterion sharpened to tertile-monotonic.** Original §0.6 used binary high/low confidence buckets. Langston proposed tertile (HIGH / MID / LOW) with required monotonic ordering and tighter gap. Reasoning: Kelly amplifies miscalibration, so the bar must be stricter than a binary check.

| Criterion | CC original | Langston revised |
|---|---|---|
| Bucket structure | Binary (high vs low) | Tertile (HIGH > MID > LOW) |
| Required ordering | High > Low | Strict monotonic — HIGH > MID > LOW |
| WR gap threshold | ≥5pp | **≥7pp** (HIGH−LOW) |
| Sample size per bucket | ≥200 | ≥150 |
| Statistical test | p<0.05 | chi-square p<0.05 |

Adopted as written.

**§0.10.D — Consumer #8 resolved as tiebreak only.** Original Langston proposal had Consumer #8 as RTB queue ordering (rankingScore). Kyle's pushback: rankingScore already inherits regime confidence transitively via FinalScore (the first term in `rankingScore = FinalScore × qualityWeight + ...`). Adding regime confidence as a separate term double-counts.

**Resolution:** Consumer #8 is a **tiebreak only**, not in the rankingScore formula.

```
IF |rankingScore_A − rankingScore_B| < ε  (ε = 0.02)
  THEN prefer signal with higher regimeConfidence
  ELSE existing rankingScore ordering applies
```

This activates only on near-ties where the primary ranking cannot discriminate. Does not double-count. Replaces current arbitrary tiebreak (insertion order) with a meaningful secondary sort.

`ε = 0.02` enters `module_constants` per §0.9 governance rule.

**§0.10.E — Three-cohort split for routing map (replaces two-cohort).** Original §0.7 used two cohorts (CORRECT vs WRONG). Langston refined to three:

| Cohort | Definition | Use |
|---|---|---|
| **CORRECT** | Entry label matches realized regime, any phase | Build routing map from this cohort |
| **WRONG** | Label mismatch AND entry confidence ≥0.60 | Feed into classifier improvement work (B67.1, B68.1, B68.5) |
| **AMBIGUOUS** | Label mismatch AND entry confidence <0.60 | Discard — classifier was already uncertain, mismatch isn't a clean failure signal |

Routing map quality goes up (built from CORRECT only). Classifier-improvement work focuses on confident-wrong cases (WRONG only). Discarded data is data the classifier itself flagged as not-trustworthy.

**§0.10.F — Storage growth flag.** Ablation row count grows linearly with factors × trades. With 10 factors and ~100 trades/day, ~1,000 alternate-outcome rows per day. Trivial at VTS scale; flag for monitoring at paper/live scale and downsample if necessary. Logged as B67.0 sub-task: include retention policy.

**§0.10.G — Path B four-case backtest predicted ordering: B > C > D > A.** Both CC and Langston converge on Case B (multi-TF DBS agreement) winning the `net_expectancy × sample_size` criterion. Reasoning: 04-22 dominant failure mode was "DBS ≥ 0.30 from a recent move, but the move was already exhausted." Multi-TF agreement (5m sign matches 1h sign) catches this directly when the lower TF reverses while the higher TF is still positive. Case D (triple gate) likely too restrictive — temporal misalignment of all three signals starves volume. Case C (slope) is a weaker version of the same signal Case B captures more cleanly.

This is a prediction; B68.1 backtest is the authoritative test.

---

### §0.11 — 2026-04-29 mid-batch reorganization (Kyle directive)

After B67.1 + B67.2 shipped LIVE (no shadow flags, all fallbacks removed) on 2026-04-28/29, Kyle's mid-batch review surfaced several issues and a directive to expand the scope of work that runs through the 14-day calibration window. This section captures the resulting reorganization. **Supersedes §0.4's "B67/B68/B69 split" for the 6 confidence-modifying levers from §5.4.**

#### §0.11.A Issues found 2026-04-29 (require fix before window can start)

1. **Replay logic not wired.** `replay-ablation.ts` is gated/stubbed — counts pending rows + retention sweep only. No active-path or VTS-path outcome lookup. No cron scheduled. The ablation framework is collecting evidence rows but nothing replays them. Without this fix, all "Replayed" counters stay at 0 indefinitely → no calibration data.
2. **Phase transition logging shows zero entries** in 10K+ PM2 log lines despite MCE classifying 177 pairs every cycle. Either the regime-phase store isn't being ticked OR the log statement has a bug. **B67.2 may be silently broken.** Must debug before adding more levers.
3. **`?? 0` fallbacks remain in `macro-modifier.ts`** lines 212-214 (z-score result construction). Missed during the cleanup commit. Plus the BTC/ETH 0.6/0.4 funding weighting is still hardcoded — should be `module_constants` per §0.9.
4. **Modifier + phase + regime confidence not persisted on trade records.** Originally deferred to B67.5 — wrong call. They need to be on every trade record from this batch forward (NOT B67.5) for daily monitoring during the window AND for active-trading path eventually.
5. **`paper_sim_trades` empty.** 0 rows total — VTS trade outcomes aren't landing in the table the replay job's planned join targets. Trade-outcome data flow needs investigation.
6. **B67.3 still in shadow.** No good ongoing reason. Plus `pair_id_hash` follow-up commit (persist hash to trade record at trade-open) hasn't shipped — required before flipping `b67_3_enabled=true` for the cohort A/B comparison.
7. **04-22 was not the only hostile day.** Sustained underperformance pattern across last 7 days (analytics shows strong_bull_trend in TFS at 20.5% WR, IE at 23.8%; range_trade in RBS at 0%). Recurring failure mode, not a one-off.

#### §0.11.B Lever-batching reorganization

The original §0.4 split B67 (confidence-modifier core) from B68 (structural improvements) sequentially with B68 starting "after B67 closes." Kyle's 2026-04-29 directive: **pull the cheap and medium tiers forward** so they can be observed during the calibration window via the per-factor ablation rows (which the framework natively supports — each factor gets its own row independent of when it was deployed).

**Final 4-batch structure for the remaining 6 confidence-modifying levers from §5.4** (ML-light still deferred per below):

| Batch | Levers | Effort | Notes |
|---|---|---|---|
| **B67.4 cheap-tier bundle** ✅ **SHIPPED 2026-05-01** | Three small levers shipping in one commit, retaining separate sub-deliverable identifiers for ablation tracking: <br>• **B67.4** — Realized-outcome feedback (recent (regime, strategy) losses → downgrade confidence on new entries) <br>• **B68.4** — Regime-age first-class metric (per-pair regime history depth, "freshness fingerprint") <br>• **B68.5** — Path B sustainability tightening (Case C — DBS slope ≥ slopeMin gate; Case B/D deferred to B68.1 backtest per §0.8 four-case matrix) | ~2 weeks combined | All three small, complementary. Bundled into one commit (commits `24c88702` v1 + 3 hotfixes `173d1d59` `f5fe7e71` `18165430`). PM2 #126. CI 3 of 4 green throughout. Langston Steps 1/2/4 cc-inbox #856/#857/#879. **Calibration window started Day 0 of 14 = 2026-05-01.** All 7 expected factor types confirmed emitting ablation rows post-deploy. |
| **B68.2 — Volume regime** | Accumulation/distribution as a second confidence dimension. Volume profile computation per pair. | ~1 week | Own batch. Needs new volume-profile infrastructure. |
| **B68.3 — Pair correlation** | Cross-pair correlation gate. Distinguishes idiosyncratic alt moves from BTC-correlated drift. | ~1 week | Own batch. Needs cross-pair correlation matrix infrastructure. Builds on existing per-pair BTC correlation in `defensive-hedge.ts`. |
| **B68.1 — Multi-timeframe agreement** | 1h regime confirming 1m signals. Higher-TF OHLC pipeline. | ~2 weeks | Own batch. Needs new higher-TF OHLC data path — real new infrastructure. |
| ~~B69 — ML-light~~ | Logistic regression error detector | ~2-3 weeks | **Stays deferred to end of pre-Phase-16 batches** per Kyle directive 2026-04-29. Trains on data accumulated by B67.x + B68.x. |

#### §0.11.C Calibration window timing — revised

Original plan had a single 14-day window starting at B67.2 deploy (2026-04-29). **Revised:** window cannot start until ablation framework is actually capable of replaying counterfactuals AND all factors that will be observed in the window are live.

**Concrete window-start sequencing:**

1. Fix the issues from §0.11.A:
   - Lock calibration window dates in MEMORY (placeholder until window-start is determined)
   - Debug B67.2 phase transition log absence (potential silent breakage)
   - Remove remaining fallbacks in macro-modifier.ts + promote BTC/ETH funding weighting to module_constants
   - Implement actual replay logic + schedule cron
   - Persist modifier + phase + regime confidence on trade records + UI tables (with regime confidence rendered in same column as regime label)
   - B67.3 pair_id_hash trade-open persistence + activation flip
2. Ship B67.4 cheap-tier bundle (3 small levers in one commit).
3. **Calibration window officially starts** when the cheap-tier bundle deploys + post-deploy verification confirms all 5 factors (B67.1 + B67.2 + B67.4 + B68.4 + B68.5) emitting ablation rows correctly.
4. 14-day observation window. Calibration check at end → if pass, B67.5 wires confidence into 7 consumers; if fail, recalibrate per §0.6 sequencing.
5. **Subsequent batches (B68.2 → B68.3 → B68.1) get their own ~14-day mini-windows** when each ships. Each batch's calibration check evaluates its own factor against its own observation cohort. The ablation framework natively handles this because each factor has its own row.

**Why this works:** the ablation framework attributes per-factor independently. When B68.2 ships into a running calibration window, it adds its own row type to the ablation table. The B68.2-specific calibration check uses only rows where `factor_name='b68_2_volume_regime'` over the 14 days following its deploy. Earlier factors' calibration data (B67.1, B67.2, etc.) is unaffected because their rows are separate.

#### §0.11.D Persistence + UI changes (B67.2.1 follow-up scope)

Surfaced 2026-04-29: regime classifier outputs need to be persisted on every trade record (open + closed) and rendered in the UI tables. Specifically:

- **Trade-record fields** (added to whatever schema VTS currently uses + paper_sim_trades for active path):
  - `regime_confidence_raw` (pre-modifier, pre-phase)
  - `macro_modifier_value` (B67.1 output)
  - `phase` ('EARLY' | 'PRIME' | 'LATE')
  - `phase_age_seconds`
  - `strategy_phase_weight` (the (strategy, phase) JSONB lookup result)
  - `regime_confidence_modulated` (final value: raw × modifier × phase_weight)
- **CSV exports** include these fields for both open and closed trades.
- **UI tables** render regime confidence in the same column as the regime label (under or beside it) so it's immediately visible.
- **Cross-cutting:** the persistence layer must be writable from BOTH the VTS path AND the active trading path so when active trading turns back on, the same fields populate.

#### §0.11.E No-fallbacks discipline (carry-forward from §0.9)

The §0.9 "no new hardcoded constants from B67 forward" rule is reinforced 2026-04-29:
- **Cold-start warmup paths are NOT fallbacks** (legitimate runtime states with explicit telemetry flags). Modifier returning `value=1.0 + fallbackActive=true` when rolling baseline has < 48 samples STAYS.
- **Config-read defaults ARE fallbacks** (silent substitution). All `??` patterns on `getConstant()` reads MUST throw on missing.
- **Hardcoded constants that should be in DB ARE fallbacks** (e.g., the BTC/ETH 0.6/0.4 weighting). Promote to `module_constants`.
- **Future levers** must follow this discipline from the first commit. Migrations seed all-or-nothing; missing keys throw.

---

### §0.12 — 2026-04-29 mid-batch foundation work + open discussion items

After §0.11's reorganization, additional implementation issues surfaced and were addressed mid-batch. This section documents what shipped and what remains as open discussion for the next Langston touchpoint.

#### §0.12.A Foundation work shipped 2026-04-29 (PM2 #105 → #113)

| # | Fix | Commit | Notes |
|---|---|---|---|
| 1 | Per-input ablation split | `ed9a1a08` | Single `b67_1_macro_modifier` row → 3 per-input rows (btc_dominance / funding_rates / mcap_momentum). `b67_2_phase_dimension` renamed `b67_2_phase_preference`. |
| 2 | Final fallback removal | `cab55804` | All `??` config-read patterns → throw. `b67_1_enabled` shadow flag removed entirely. BTC/ETH funding weighting → `module_constants`. Cold-start warmup fallback retained (legitimate runtime state). |
| 3 | B67.3 activation | `c1b314ad` + DB UPDATE | `pair_id_hash` trade-open persistence (active + VTS paths). `b67_3_enabled=true` flipped on staging. 14d cohort A/B observation began. |
| 4 | B67.2.1 trade record persistence + UI | `141ec3c3` + `41abd541` + `575dbca4` | 6 nullable columns on `paper_sim_trades` (regime_confidence_raw, macro_modifier_value, phase, phase_age_seconds, strategy_phase_weight, regime_confidence_modulated). Active path + VTS path both populate. UI renders regime + confidence + phase badge in same column. CSV exports auto-include. |
| 5 | Replay logic + cron | `3d1a1e7f` + `5e1031a6` + `33df2380` | `replay-ablation.ts` actual outcome lookup wired (was stubbed). VTS JSONL reader. Real bug fixed: signal id mismatch between ablation rows and JSONL — threaded `originalSignalId` through `persistRealPriceTrade`. Cron at 04:00 UTC nightly. |
| 6 | Persistence + dashboard cleanup | `8f417ca5` | `regimePhaseStore` and macro-feed rolling window persist to `/tmp/*.json` files. Dashboard SQL filters legacy factor names. |
| 7 | **B67.3.5 Pre-Window Hardening** | `49209eb4` + `d97d47d7` | Phase backfill from OHLC history (resolves §0.12.B Item 1) + TFS branch desaturation (resolves §0.12.B Item 2). New `RegimeConfig` type; `calculatePairRegime` 4th param; `regimePhaseStore.tick` accepts optional `BackfillContext`; 5 new module_constants in regime_classifier module. PM2 #114. First diversified macro modifier observed: 0.85 with real z-scores. |

Comprehensive governance pass: BATCH_CATALOG, PHASE_HISTORY, SIM (new "B67.x foundation work" section), CHANGES_AND_FIXES (full lessons-learned entry), BATCH_67_PROGRESS_REPORT (closure block), MEMORY all updated through commit `fa3fa593`. B67.3.5 closure governance pass: same set updated through commit (TBD).

#### §0.12.B Resolved items — both shipped 2026-04-29 in B67.3.5

Items 1 + 2 below were the open-discussion items surfaced 2026-04-29 evening. Discussed with Langston post-compact (cc-inbox #850), scoped + pre-audited + implemented + reviewed + deployed in a single sub-batch (B67.3.5). Both are now LIVE on staging PM2 #114. Original framing preserved below for traceability; resolution noted inline.

**Item 1 — Phase backfill from OHLC history (Kyle 2026-04-29):** ✅ SHIPPED in B67.3.5 (`backfillFromHistory` method on `RegimePhaseStore`). First-observation only, current DBS approximation accepted, persisted via existing `/tmp/regime-phase-store.json` layer, walks 12 × 60min windows, caps age at walk depth.

Current `regimePhaseStore.tick()` records `enteredAt = now` on first observation. So the moment we first see a pair, regime age = 0 — even if the pair has actually been in TFS for 6 hours by external reality. Phase reads as EARLY when it should read PRIME (or LATE).

Persistence (shipped in §0.12.A item 6) fixes the PM2-restart-wipe problem but doesn't address the cold-pair problem (pairs that come into the universe mid-cycle, or after the universe expands).

Kyle's question: can we backfill regime entry time from OHLC history? The classifier is a pure function of OHLC + DBS. We have historical OHLC per pair. We could walk backward through 60-min windows until the classifier output changes — that's the actual regime entry time. With ~177 pairs × up to 12 windows (covering 12h LATE phase) = ~2,124 classifier calls per cold-start scan. Not heavy.

**Open design questions for Langston:**
- Should we backfill on first observation only, OR re-validate periodically (e.g., once per pair per day) in case the historical regime changed near the boundary?
- DBS is required for the classifier; do we have backfilled DBS, or just current DBS? If only current, the backfill is approximate.
- Should the backfilled enteredAt persist to disk via the same persistence layer added in §0.12.A item 6?
- If a pair's backfilled age is > 12h, it lands in LATE phase immediately — does that flow correctly through the existing code paths?

**Item 2 — Confidence saturation (Kyle 2026-04-29):** ✅ SHIPPED in B67.3.5. TFS branch step-function replaced with continuous mapping `confidence = min + (max - min) × (mom_factor × dbs_strength × vol_inverse)` on the same three inputs. Output range [0.50, 0.90] via 5 module_constants (recalibrate via DB UPDATE post-deploy). Other 4 regime branches (HVU/RBS/IE/ST) deferred to post-window classifier-tuning batch — logged in `RUNNING_ISSUES.md`. Original framing:

TFS branch in `market-regime.ts:177-184` saturates at 0.95 INPUT for any pair with positive momentum + |DBS| ≥ 0.30. After B67.1's clamp ceiling raise to 1.0:
- `0.95 × 1.05 macro_modifier × 1.10 phase_weight = 1.097` → clamps to 1.0 for almost every TFS classification

Today's distribution from 16 closed VTS trades: 12 at conf=1.0, 3 at 0.9, 1 at 0.8 — heavily clustered at the top 25% of the possible range.

**This compromises the calibration check premise.** Tertile-monotonic WR by confidence bucket requires meaningful variance in confidence; with current saturation, tertile boundaries collapse to nearly-identical buckets and the calibration check passes/fails trivially without telling us anything.

Kyle's question (paraphrased): does it make sense to have a confidence score where everything is in the top 25% of the possible range? Probably not. The current B62 formula structure (per-regime branch with sum-of-bonuses capped) produces tightly-clustered output rather than a continuous score.

**Open design questions for Langston:**
- Replace branch-based formula with continuous mapping (sigmoid? logistic regression on raw indicators?)
- Spread the per-regime baseline values so they don't anchor at 0.50 / 0.65 / 0.70 / 0.75 — let modulators differentiate within a wider band
- Alternative calibration check approach: bucket on RAW pre-clamp confidence value, OR on macro modifier value alone, OR on phase weight alone (each has more variance than modulated confidence)
- Defer to a dedicated classifier-formula tuning batch post-B67.4 vs address inline

**Sequencing resolved (Langston cc-inbox #850):** Modified B chosen — fix both before B67.4 cheap-tier ships. Reasoning: B67.4 outcome feedback adjusts confidence per (regime, strategy); saturated input makes the feedback loop a no-op and the calibration check meaningless. Cost of fix (1-2 days) < cost of 14d wasted calibration window. Sub-batch B67.3.5 implemented both items together. Now LIVE PM2 #114, awaiting deferred verification (cold-pair backfill logs + TFS distribution shift + phase mix shift) ~24h post-deploy.

#### §0.12.C Calibration window status (as of 2026-04-29 evening)

NOT YET STARTED. All 7 pre-window foundation fixes complete (now including B67.3.5 phase backfill + TFS desaturation). Only B67.4 cheap-tier bundle remains. Window starts when B67.4 deploys clean per master plan §0.11.C.

#### §0.12.D Known follow-up: other 4 regime-branch desaturation

B67.3.5 desaturated only the TFS branch (~55-60% of pairs — the dominant regime, immediate calibration bottleneck). HVU / RBS / IE / ST branches still use the original step-function-with-bonuses formulas. Tracked in `RUNNING_ISSUES.md` for a post-window classifier-formula tuning batch. Reasoning: TFS desaturation alone gives ≥ half the calibration window meaningful confidence variance; deferring the other 4 branches keeps B67.3.5 scope tight and lets us verify the desat approach on one branch before applying it to the others.

---

### §0.9 No new hardcoded constants from B67 forward

**Permanent governance rule (Kyle directive 2026-04-28):** every new threshold, weight, multiplier, cutoff, lookback, percentile bound, or seed value introduced from B67 onward goes directly into `module_constants` at the moment of introduction. No new hardcoded values in the codebase.

This rule will be added to `CLAUDE.md` §5 (Critical Rules) on the next governance pass and tagged as a non-negotiable invariant. Langston will be asked to enforce this during code review.

Effect on B72 scope: B72 (comprehensive lever sweep) becomes a sweep of **pre-B67 legacy constants only** — much smaller than originally planned. Inline migration during B67/B68/B69 covers everything new; B72 cleans up everything old.

---

## 1. The starting question (Kyle, 2026-04-27)

Kyle asked five sharp questions when we started discussing B67/B68 (external data integration):

1. What is external data being fed INTO? Specifically the per-pair regime classifier formula, or somewhere else?
2. How will adding external data affect regime calculations? How do we know that's the right way to add it? Won't this create classifications we can't make sense of?
3. Are there industry norms? Known/proven correlations between external data and pair regimes?
4. Plain-language explanation of how each external data type quantifiably impacts regime classifications and the theoretical why/how.
5. Rate the regime classifier overall, complete honesty. Confidence in routing pairs to right strategies. What's missing. How to materially improve (not cosmetic 1-2% improvements). Are there enough regimes? Are some missing?

Kyle's framing in plain terms: don't just bolt external data onto the system to say we did it. Make a real case for how it helps, with measurable impact, anchored in known correlations, and audited up- and down-stream so we don't double-count or cancel out signals already in the system.

---

## 2. CC's initial position (the position we are now revising)

CC proposed two integration patterns:

**Option A — alongside the classifier (CC's original recommendation):** external data flows External Data Service → MCE storage → consumed by SQE pre-filter gates AND/OR ranking-weights bonus formula. The pair regime classifier formula stays unchanged. The regime label that comes out is the same as today; new gates layered after classification.

**Option B — inside the classifier:** external data joins the classifier formula directly. Regime labels can change based on macro context. Bigger blast radius; existing strategy mappings might no longer mean the same thing; requires re-tuning thresholds and re-validating mappings.

CC recommended Option A on the basis of smaller blast radius.

---

## 3. Langston's independent take — the third option (now the recommended one)

Langston pushed back with a third option CC hadn't laid out:

**Option C — confidence modifier on the classifier output.** The pair regime LABEL stays unchanged (so "TFS" still means what it meant). But the classifier's CONFIDENCE NUMBER gets multiplied by a 0.85-1.05x range based on macro alignment. Low confidence → triggers TRANSITION/UNSTABLE stability → activates the existing DEFENSIVE mode overlay → automatic throttling of trades through paths that are already wired in.

**In plain language:** when the classifier says "TFS, confidence 0.85" but BTC dominance is rising sharply, the macro modifier knocks confidence down to "TFS, confidence 0.72." The downstream stability detector reads that as less-stable, which the existing mode-overlay (Directive 11.7S) reads as defensive conditions, which throttles new entries. The label is preserved; only the confidence is modulated.

**Why Option C is better than CC's Option A:**

- One integration point (the confidence number), not two (gates + bonuses). Cleaner attribution: when something changes downstream we can trace it back to one source.
- Preserves B62 calibration entirely. The thresholds, the regime-to-strategy map, the mode-overlay logic all stay.
- Automatic propagation. Existing systems that read confidence/stability automatically pick up macro context. No new pathway to debug.
- Shrinks blast radius. Doesn't change what TFS means; doesn't add new SQE gate semantics; doesn't add new ranking-weight terms.

**CC has withdrawn Option A and recommends Option C.**

---

## 4. Industry norms and known correlations (plain language)

Kyle asked whether these external signals have known empirical backing or are speculative hypotheses.

| Signal | Status | Plain-language description |
|---|---|---|
| **BTC dominance vs altcoin performance** | Well-established multi-cycle empirical finding | When BTC dominance rises, money rotates from alts into BTC, alts underperform. When dominance falls, alts outperform. "Altseason" vs "BTC season" terminology comes from this. Magnitude varies by cycle phase but direction is robust. |
| **Funding rates as squeeze signal** | Well-established in derivatives literature | Extreme positive funding (longs paying shorts) means the trade is overcrowded; mean-reversion / squeeze typically follows. Standard input on every major derivatives desk. Multiple academic papers documenting predictive power. |
| **DXY inverse correlation with crypto** | Known but weaker post-2022 | Strong correlation 2017-2021; has decreased as crypto became more institutionally held. Still directionally true but not as tight. Useful as context input, less reliable as hard filter. |
| **Crypto market-cap momentum** | Well-established | Sector-wide capital flow leads individual pair moves. Essentially the same logic as BTC dominance from a different angle; less novel insight. |
| **Exchange flows / on-chain** | Well-documented in Glassnode/CryptoQuant research | When BTC flows TO exchanges, sell pressure typically follows within hours/days. Less granular for short-term trading; more useful for daily/weekly context. Langston: "lag by hours, not useful for intraday." |
| **Liquidation cascades** | Reactive, not predictive | You see it as it happens, not before. Useful as a circuit-breaker (pause new entries for N minutes after a cascade) rather than a leading indicator. |

**Honest caveat across all of these:** correlations have predictive power on AVERAGE but vary by market cycle (bull/bear, early/late), pair characteristics (BTC vs small-cap alt), time horizon (hours vs days), and microstructure (low-volume periods amplify signals). We should not expect "BTC dominance > 60% means filter all alt entries" to deliver +20pp WR. We should expect maybe +3-5pp WR on alt strategies during high-dominance periods, with significant variance.

**Langston's framing:** "Each one tells you something the per-pair data can't see — they're the 'weather' that every 'pair-level thermometer' is operating inside."

---

## 5. Honest classifier rating

Kyle asked for complete honesty, no soft-pedaling. Here's the consolidated CC + Langston view (we agreed on this rating).

**Overall confidence: medium-low.** Competent on easy cases, unreliable on the cases where routing matters most.

### 5.1 What works (strengths to preserve)

- **5-regime taxonomy covers the broad space** (trend, range, volatility expansion, no-direction-vol, uncertain).
- **B62's DBS integration was a real achievement.** Pre-B62 the system was 70.2% drift-contaminated; B62 fixed that to 0.00%. **Langston flagged this as undersold in CC's first rating** — it deserves to be called out as a major success, not background context.
- **Per-cycle classification (~60s)** so it adapts quickly to changing conditions.
- **Indicator inputs (vol, ADX, momentum, DBS)** are widely-used in technical analysis literature.
- **Code is well-tested** and the math itself is correct given its inputs.

### 5.2 What doesn't work, in order of impact

1. **Path B over-firing** (B65.6 documented). The TFS branch fires whenever `|DBS| >= 0.30` alone, with no sustainability check. On strong-direction days this trivially classifies most pairs as TFS regardless of whether the trend has more room. Direct cost in real money: ~$11 across 5 trades on 04-22 just from one strategy family.
2. **No multi-timeframe agreement.** Classifier looks at the most recent ~7.5 hours of price action. A 1m DBS reading of +0.40 might be inside a 1h DBS that's rolling over (about to reverse) or inside a 1h DBS that's still rising (continuation likely). The classifier doesn't distinguish. **Industry-standard trend-following systems use multi-timeframe agreement as a hard filter; ours doesn't.** (Note: this lever is downstream of B67 because it requires higher-TF OHLC data.)
3. **No volume regime separately.** Volume is used in the FX5 filter (minimum-volume gate) but not as a dimension in regime classification. Accumulation-volume vs distribution-volume is a real distinction we can't see. Rising prices on declining volume = exhaustion; rising prices on rising volume = healthy. Classifier sees neither.
4. **No macro context.** The 04-22 evidence showed this directly. System has zero visibility into BTC dominance, funding rates, mcap momentum, DXY, etc. **B67 addresses this.**
5. **No pair-correlation context.** Small-cap alt moving up purely because BTC is moving up has no idiosyncratic edge — the trade adds no value over just buying BTC. Classifier doesn't know correlated-drift vs idiosyncratic moves. **Langston: this is the cross-pair concentration gate (already in AMR Phase 19.5 design), not a regime taxonomy issue.**
6. **No regime-age / freshness tracking.** Time-since-last-regime-change is a real signal in trading literature. A pair that just entered TFS is more reliable than a pair that's been TFS for 6 hours and might exhaust. We don't track this.
7. **No regime-TRANSITION-freshness as first-class state** (Langston's addition, CC missed this). When a pair flips from RBS to TFS, the new TFS classification is treated identically to a TFS that's been stable for 6 hours. A fresh transition is fundamentally different from a long-running label.
8. **Confidence number is computed but underused.** Classifier emits 0.40-0.95; no downstream code uses it as a hard gate. Wasted information. **Langston: this is exactly the integration point his confidence-modifier architecture targets.**

### 5.3 Are there missing regimes?

CC's first answer was "yes, four missing": Distribution/Topping, Accumulation/Bottoming, Climactic/Parabolic, Correlated-drift.

**Langston pushed back: don't add new top-level regimes. Sub-classify the existing ones.**

Specifically: add a **PHASE DIMENSION (EARLY / MATURE / LATE)** to the existing 5 regimes, with phase boundaries at 2 hours and 12 hours of regime stability. So instead of:

- TFS, RBS, IE, STR, HVU, +new regimes

You get a 5×3 matrix:

- TFS-EARLY, TFS-MATURE, TFS-LATE
- RBS-EARLY, RBS-MATURE, RBS-LATE
- IE-EARLY, IE-MATURE, IE-LATE
- HVU-EARLY, HVU-MATURE, HVU-LATE
- STR-EARLY, STR-MATURE, STR-LATE

**Captures most of what CC was reaching for:**

- TFS-LATE = the topping case (trend has been going for a while, exhaustion-prone)
- RBS-LATE = the accumulation case (range has held long enough to be coiling for breakout)
- IE-EARLY = the climactic case (move just exploded, may parabolic-fail)

**Why Langston's approach is better:** cheaper, easier to validate, doesn't require new strategy mappings (each existing strategy can read the phase as a confidence modifier on its own entry decision). Doesn't expand the regime taxonomy footprint. Composable with the macro confidence modifier.

**Correlated-drift goes elsewhere** (cross-pair concentration gate, Phase 19.5 AMR) per Langston.

**CC has withdrawn the new-regimes proposal and recommends the phase dimension.**

### 5.4 How to MATERIALLY improve (not cosmetic)

Combined CC + Langston view, ranked by expected impact and ordered for sequencing:

| # | Lever | Expected impact | Effort | Notes |
|---|---|---:|---:|---|
| 1 | **Macro confidence modifier (B67 work, Langston's architecture)** | 5-10pp on hostile-day cohorts, 2-3pp overall | ~2 weeks | Core of the new design. BTC dominance + funding rates + mcap momentum modulate confidence. Triggers existing stability/mode-overlay path. |
| 2 | **Concentration gate + phase dimension** | 3-7pp combined | ~1 week | Concentration catches universe-level hostile windows (Phase 19.5 AMR work). Phase dimension catches per-pair exhaustion (regime-age tracking). |
| 3 | **Multi-timeframe agreement** | 3-5pp on trend-rider signals | ~1 week (after B67) | Blocked by B67 because it requires higher-TF OHLC. 1h regime as confirming filter on 1m signals. |
| 4 | **Volume regime as second dimension** | 2-4pp on trend-rider WR | ~1 week | Accumulation/distribution as a second confidence multiplier. |
| 5 | **Per-underlying position limits** (Langston add, missed by CC) | 3-5pp hostile-day risk reduction | ~1-2 days | Limit concurrent open trades on any one underlying. Already in `POST_B62_PRE_LAUNCH_PLAN.md` Item 4 as paper-only with VTS bypass — promote to general. |
| 6 | **Realized-outcome feedback** (Langston add, missed by CC) | 2-4pp | ~2-3 days | If recent trades on (regime, strategy) combo are losing, downgrade confidence on new entries. Self-correcting. |
| 7 | **Path B sustainability tightening (B65.6 deferred work)** | 1-2pp alone, compounds with #1-3 | ~3-5 days | The work we deferred per Kyle's earlier directive. Worth revisiting once macro modifier is in place — together they solve the over-firing problem. |
| 8 | **ML-light reliability score** (Langston, pre-launch viable) | 2-4pp | ~2-3 days | Logistic regression on classifier inputs, trained on 30d VTS data, predicts "is this classification wrong?" Outputs reliability score = another confidence modifier. |
| 9 | **Full ML regime classification (Phase 17/18)** | 5-15pp eventually | months | Long-term post-launch work. Replaces rule-based with learned classifier. |

**Combined realistic estimate (Langston + CC consensus): 10-20pp WR improvement on currently-failing cohorts (hostile days, exhausted-trend setups), 3-5pp on the overall population.** Stacked, not magic-bullet from any single lever.

---

## 6. The recommended coordinated work package

Per Kyle: "I want to incorporate all or most of it, and I wanna make sure that we do this right, not haphazardly."

**Proposed coordinated batch structure (B67 with sub-deliverables):**

The first 6 levers above are tightly coupled — they all affect the confidence number that drives downstream gating, and they share the architecture (confidence modifier on classifier output). Treating them as one coordinated batch is cleaner than splitting them.

```
B67 — Coordinated Regime-Confidence Overhaul

  B67.1  Macro confidence modifier (BTC dominance + funding + mcap)         ~2 weeks
  B67.2  Phase dimension (EARLY/MATURE/LATE on existing regimes)            ~3 days
  B67.3  Per-underlying position limits (promote from paper-only)           ~1-2 days
  B67.4  Realized-outcome feedback into classifier confidence               ~2-3 days
  B67.5  Path B sustainability tightening (deferred B65.6 work folded in)   ~3-5 days
  
B68 — External Data Phase 2 (conditional on B67 success)
  Exchange flows, liquidations, DXY, SPX cross-asset                        ~2-3 weeks
  
Phase 19.4 candidate (interim, post-paper-mode-active):
  ML-light reliability score                                                 ~2-3 days
  
Phase 19.5 (already planned):
  Cross-pair concentration gate + AMR mode-overlay expansion                  TBD
  
Post-launch:
  Multi-timeframe agreement (requires B67 OHLC infrastructure)
  Volume regime as second dimension
```

**Why bundle B67.1-B67.5 into one batch:** they all consume the same B67-introduced infrastructure (external data fetching, telemetry storage), they all write into the same target (the confidence number), and they're scientifically coupled (you can't validate the macro modifier in isolation if the phase dimension is also active and changing the population). Better to land them together with one careful observation period than dribble them out one at a time.

**Estimated total effort for the bundle: ~3-4 weeks of CC implementation time** plus the standard workflow overhead (Langston reviews, deploys, observation).

---

## 7. Industry-norm caveats Kyle specifically asked about

**"How do we know that the way you plan to add that into the regime calc is the right way to do it, and that adding them is not going to result in classifications that we can't make sense of?"**

Honest answer: we don't know with certainty. We know the correlations are real and documented. We don't know the right magnitudes for our specific universe. Three protective design choices in the proposed plan:

1. **Confidence-modifier architecture means the regime LABEL doesn't change.** A pair classified as TFS today is still classified as TFS after the change. Only confidence is modulated. So we cannot produce "classifications we can't make sense of" — labels are preserved; we'd just see the same label with lower confidence, which is interpretable.
2. **Modifier range bounded at 0.85-1.05x initially.** Even if the macro signal is wrong, the worst case is confidence is 15% off. Conservative band keeps the change mostly in "throttle a bit" territory rather than "completely override."
3. **Validation period before activation.** The data collection runs for 1-2 weeks before the modifier is wired into actual decisions. We see what the modifier WOULD have done on real cohorts before letting it gate anything.

**"And how is that going to affect our signals and the trades that would open from those signals?"**

The modifier reduces confidence on trades during macro-disagreement conditions (hostile windows for that pair direction). Reduced confidence triggers existing stability/mode-overlay path that throttles entries. So:

- Some entries that would fire today will not fire (they get filtered through the existing throttle)
- Some entries that fire will be smaller-sized (mode overlay has size dampening)
- Entries that pass the throttle are higher-quality on average (they survived the macro filter)

Net expected effect on trade volume: -10% to -25% during high-macro-disagreement periods, near-zero during macro-aligned periods.

**"Is there a way to measure its effectiveness once it's put in?"**

Yes, two natural measures:

1. **Hostile-day WR** (days where system-wide WR < 25%). Should improve materially because that's exactly where the modifier earns its keep.
2. **Counterfactual analysis** — same pattern as the B65.4.1 ladder counterfactual we already documented. For each modifier-rejected trade, compute what would have happened if it had fired. Aggregate over time. Positive aggregate means the modifier is filtering preferentially-bad trades.

**"What is this addressing?"**

The 04-22 case in plain terms: globalRegime said "trend-friendly stable, 98% of pairs bullish, all clear for trend-riders." The system entered 177 strong-bull-trend trades. 84% of them lost. Why? Because the directional bias was lagging — it captured "what just happened" not "what's about to happen" — and the macro context (which the system can't see) was rolling over. With macro context, BTC dominance rising sharply on a "everyone bullish" day would have been a contrarian flag, knocking confidence down on those 177 trades and either preventing many of them or sizing them smaller. We don't have that visibility today. B67 adds it.

---

## 8. Things to look up- and downstream of these changes

Kyle: "we need to make sure that we look up and downstream in our math and in our signal generation process to make sure that we're not double counting or canceling things out."

**Up-stream of regime classification (input dependencies):**

- DBS calculation (B62 work). Macro modifier doesn't change DBS itself. Safe.
- Per-pair OHLC + technical indicators. Unchanged by external data. Safe.
- FX5 scanner / minimum-volume filter. Unchanged. Safe.

**Down-stream of regime classification (consumers):**

- **Regime-to-strategy canonical map.** UNCHANGED — labels are preserved. ✅
- **Strategy entry detection** (e.g., strong_bull_trend's Donchian + ATR detector). UNCHANGED — strategies still see their regime mapping. ✅
- **SQE pre-filter gates.** The existing SQE consumes confidence as one input. Macro modifier flows in there naturally. Watch for: SQE thresholds were calibrated against pre-modifier confidence range; tightening the band may be needed.
- **Ranking weights / queue priority.** Same as SQE — consumes confidence. May need re-tuning.
- **Mode overlay (Directive 11.7S).** Reads regime stability. Reduced confidence → less stable → mode overlay activates DEFENSIVE. **This is the main intended effect channel.** Already wired; modifier just feeds it more accurately.
- **Trailing exit / TEC.** Doesn't directly read regime confidence. Reads regime label for moonbag qualification. UNCHANGED — labels preserved. ✅

**Specific double-counting / cancellation concerns to audit during implementation:**

1. **BTC correlation already factored somewhere?** Kyle flagged this in his message: "I believe that we already have some sort of BTC correlation component factored in somewhere into our system." CC needs to grep the codebase for "BTC", "btc_correlation", "dominance" before B67 implementation to confirm whether there's pre-existing logic to coordinate with.
2. **Mode overlay already throttling on stability flicker.** Risk: macro modifier triggers throttle, then mode overlay throttles AGAIN on top of the modifier's effect. Could be over-throttling. Audit: simulate macro-modifier outcomes against current mode-overlay logic during the 1-2 week data-collection period.
3. **B65.6 concentration gate (if/when shipped) and macro modifier might cover overlapping cases.** When ALL pairs are bullish (concentration high) AND BTC dominance is rising (macro disagreement), both signals fire. Need to confirm they multiply rather than double-count. Likely fine because they target different mechanisms (concentration = local pair universe state, macro = broader market state) but worth explicit testing.
4. **Realized-outcome feedback risk.** This signal is computed from recent VTS trade outcomes. If VTS itself is using the macro modifier, the outcome feedback is partially measuring the modifier's own effect. Need to think carefully about whether to lag the feedback or use a holdout cohort.

---

## 9. ML-light pre-launch — Langston's interesting suggestion

CC originally said full ML is post-launch (Phase 17/18). Langston pointed out an interim ML-light step is viable pre-launch:

**The proposal:** logistic regression model. Inputs: classifier's existing inputs (vol, ADX, momentum, DBS) plus B67 macro features. Output: probability that this classification will produce a winning trade — i.e., a **reliability score** that becomes another confidence modifier.

Training data: 30 days of VTS observations (we'll have this by the time B67 ships). Effort: 2-3 days. Architecture: a single sklearn model behind a service interface that the classifier reads at inference time.

**Why it's pre-launch viable:**

- Logistic regression is interpretable (we can see which features matter and by how much)
- 30 days of VTS data is enough for a binary classifier with ~10-20 features
- Single model, no deep learning, no GPU, no production-ML infrastructure needed
- Outputs a single number (reliability score) that fits the confidence-modifier architecture cleanly
- Validation is easy — held-out test set, classification accuracy / AUC are standard metrics

**What it doesn't do:** doesn't replace the rule-based classifier. Doesn't predict prices. Doesn't trade. Just rates the reliability of each classification the rule-based system produces. Phase 17/18 ML can replace the classifier entirely; this is a stepping stone.

**Where to slot it:** Phase 19.4 candidate, after macro modifier is in production for 1-2 weeks (so we have macro features in the training data). Lands during paper-mode audit period.

---

## 10. Implications for existing roadmap

If we adopt this plan, several existing roadmap items shift:

- **B65.6 (Per-pair classifier audit + sustainability gate)** — folds into B67 as sub-deliverable B67.5 (Path B sustainability tightening). Standalone B65.6 closes via SUPERSEDED route.
- **B67/B68 (External Data Context Layer)** — B67 expands from "single workstream" into a coordinated 5-sub-deliverable batch. B68 stays as conditional Tier-2 work.
- **POST_B62_PRE_LAUNCH_PLAN Item 4 (Per-underlying position limits)** — was "paper-only with VTS bypass." Promotes to "general" within B67.3.
- **Phase 19.4 SQE Recalibration** — can include the ML-light reliability score as an additional sub-item.
- **Phase 19.5 AMR (Adaptive Market Response)** — concentration gate stays here. Phase dimension is now in B67 instead of being conceptually part of AMR. Cleaner separation: B67 = per-pair confidence work; Phase 19.5 = system-wide hostile-window response. Both feed into the mode overlay.
- **Phase 18.5 (VTS Partition + Exchange-Data Adapter)** — Kyle directive 2026-04-27: rename to "very start of Phase 19" or "back of Phase 16" because Phase 18 is ML/post-launch and we shouldn't use 18.5 for pre-launch work. **Need to re-label this in next governance pass.**
- **Phase 21.4 Modularization** — unchanged. Lever-migration sub-phase already moved to B72 pre-launch.

---

## 11. ⭐ DECISIONS QUEUED FOR KYLE — RESOLVED 2026-04-28

> **STATUS: ALL 12 DECISIONS RESOLVED.** See §0.1 for the resolution table. Original questions and CC+Langston positions retained below for traceability.

These are the calls that needed to be made before we could scope B67. As of 2026-04-28 they have all been resolved by Kyle. Forward-looking work uses §0 as the authoritative state.

**Architecture decisions:**

1. **Adopt Langston's confidence-modifier architecture (Option C) for external data integration?** vs my original alongside-the-classifier (Option A) or the bigger "external data inside the classifier formula" (Option B). [CC + Langston recommend C.]
2. **Sub-classify existing regimes with EARLY/MATURE/LATE phase dimension?** vs add new top-level regimes (Distribution/Topping etc.) vs do nothing. [CC + Langston recommend phase dimension.]
3. **Treat B67 as one coordinated batch with 5 sub-deliverables?** vs split into separate sequential batches. [CC + Langston recommend coordinated.]
4. **Include ML-light reliability score as Phase 19.4 item?** vs defer to post-launch Phase 17/18.

**Sequencing decisions:**

5. **Start B67 immediately after compaction?** vs finish other pre-Phase-19 items first (B69 schema, B70 archiving) and do B67 later. [CC view: B67 should go first; the macro modifier compounds with everything else.]
6. **B68 (Tier-2 external data) — keep as conditional or drop entirely?** Tier-2 is exchange flows + liquidations + DXY + SPX. Useful but additive on top of B67. CC view: keep as conditional, decide based on B67 outcomes.

**Scope decisions:**

7. **Tier-1 source selection: BTC dominance + funding rates + mcap momentum (all three)?** vs just BTC dominance + funding (drop mcap as redundant with dominance) vs just BTC dominance (minimum-viable). [CC recommends all three; redundancy with mcap is OK since they capture different time horizons.]
8. **Modifier range: 0.85-1.05x initially?** vs wider (0.7-1.2x) for stronger initial signal vs narrower (0.95-1.05x) for ultra-conservative test. CC view: 0.85-1.05x is the right starting band — strong enough to matter, not so strong it overrides classifier confidence.
9. **Phase dimension boundaries: 2h (EARLY→MATURE) and 12h (MATURE→LATE)?** Langston's proposal. CC view: defensible starting points, calibrate with VTS data.

**Validation decisions:**

10. **Ship-data-then-validate vs activate-immediately?** Ship-data: 1-2 weeks of macro data collection BEFORE the modifier is wired into actual decisions, validate against historical VTS, then activate only what shows positive lift. Activate-immediately: turn it on with default thresholds, observe live, tune in production. [CC view: ship-data-then-validate. We already have evidence the system is making bad calls; we shouldn't add a new uncalibrated signal on top.]
11. **Define "success" thresholds for B67 deactivation.** If after 30 days of post-activation observation the macro modifier has NOT delivered measurable lift, what's the response? Tune thresholds, deactivate, leave running with no expectation? CC view: pre-register threshold (e.g., +3pp WR on hostile-day cohorts) below which we treat the modifier as inert and revisit design.

**Pre-implementation audit decisions:**

12. **BTC correlation pre-existing logic audit.** Kyle flagged: "I believe that we already have some sort of BTC correlation component factored in somewhere into our system." CC needs to grep the codebase before B67 design is finalized. Decision: do this audit as part of B67 pre-audit (Step 2)?

---

## 12. What CC and Langston agreed on (consensus)

So Kyle has clear visibility into where the two of us align (high confidence in this direction) vs where we differed (CC was wrong, deferred to Langston).

**Strong consensus:**
- Classifier rating is medium-low overall.
- B62 DBS integration was a real success.
- Path B over-firing is a real problem.
- 04-22 evidence is canonical hostile-day positive case.
- 10-20pp WR improvement on currently-failing cohorts is realistic with stacked levers.
- Multi-timeframe agreement is missing and matters.
- Volume regime is missing and matters.
- Macro context is missing and matters.

**CC was wrong, Langston corrected:**
- "Alongside the classifier" was inferior to "confidence modifier on classifier output."
- "New top-level regimes" was inferior to "phase dimension on existing regimes."
- B62 DBS achievement was undersold.
- Per-underlying position limits and realized-outcome feedback were missing from CC's lever list.
- ML-light pre-launch is more viable than CC initially thought.

**Where we still both have uncertainty:**
- Exact magnitudes per lever (we have estimates, not measurements).
- Best modifier range (0.85-1.05x is starting point, optimal TBD).
- Whether to add multi-TF and volume regime in B67 or wait for Phase 17/18 (currently leaving out of B67 scope for blast-radius reasons).

---

## 13. Open data analysis still owed

Two specific data analyses are queued and not yet started:

1. **Codebase audit for pre-existing BTC correlation logic.** Per Kyle's flag in §11 decision 12. Grep `server/` for `btc_correlation`, `btcDominance`, anything BTC-related not just symbol references. Output: short report listing what already exists and recommendations for how B67 integrates without double-counting.
2. **Counterfactual analysis re-run for B65.4.1 hotfix verification.** Kyle is uploading CSVs (open + closed simulated trades). Reporting workflow at `BATCH_65_4_1_HOTFIX_COMPLETION.md` §5. Run weekly during Phase 19 observation per Phase 19.4.5 item 7.

---

## 14. Cross-references

- `B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md` — the analysis pattern
- `BATCH_65_4_1_HOTFIX_COMPLETION.md` §5 — the reporting instructions
- `REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md` — the deep dive on the per-pair classifier issue
- `B65_5_PHASE_A0_WINDOW_CONTROL.md` — the 04-22 hostile-day discovery
- `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` — the AMR concept doc Phase 19.5 will scope from
- `INDEPENDENT_VTS_DATA_FEED_FEASIBILITY.md` — the multi-exchange data feed feasibility (relevant for B67 if external data feeds also need multi-exchange)
- `EXTERNAL_DATA_SOURCES_INVENTORY.md` — original B67/B68 source inventory
- `BATCH_67_SCOPE.md` (pending) — actual scope doc to be written after Kyle's decisions on §11 are made
- `MEMORY.md` — flags this document as ⭐ MUST READ on next session

---

## 15. Workflow note

**This is a planning document, not a scope document.** The actual scope (`BATCH_67_SCOPE.md`) gets written ONLY after Kyle has made the §11 decisions. That's the next workflow step.

Per CLAUDE.md §2 (the 11-step workflow), the next phases would be:

- Step 1 (Planning + Scope) — write `BATCH_67_SCOPE.md` with concrete sub-deliverable definitions, file lists, API designs, threshold seed values, validation criteria.
- Step 2 (Pre-Implementation Audit) — including the BTC-correlation codebase audit per §11 decision 12.
- Steps 3-11 — standard workflow.

This planning doc is the input to Step 1. Kyle's §11 decisions are the gating event.

---

*End of master planning document. Listed in MEMORY.md as ⭐ MUST READ on next session start. Decisions queued in §11.*
