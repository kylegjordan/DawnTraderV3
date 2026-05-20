# B79.0n — UMBRELLA tracker: xStock active-trading wire-in + systemic asset-class awareness (rev 2 — Langston FINAL ACK)

> **Status:** rev 2 Langston FINAL ACK 2026-05-20 PM. Green light to draft sub-batch scopes and start the arc. v1 came back with 11 items from "prove-me-wrong" review; v2 absorbed 11 items, counter-proposed on 3 (items 2, 6, 13c); Langston concurred on all 3 counter-proposals.
> **Origin:** Kyle directive 2026-05-20 PM. Original rev3 of `B79_0n_SCOPE.md` (Langston rev3 FINAL ACK) was the seed; Kyle's subsequent review expanded scope into systemic asset-class awareness across the active-trading pipeline.
> **Phase:** Phase 24 (multi-asset onboarding).
> **Locked sequence position:** last item before Phase 19 live-trading gate.

> **Rev 2 changes (per Langston v1 review):**
> - **§0 wording fix (Langston item 5):** Run-Mode Controller has 3 modes (vts | paper_sim | live). Routing is `vts vs (paper_sim | live)`. Active-trading path = paper_sim mode + live mode (both go through orchestrator).
> - **§1 Tier 1 promoted (Langston item 9):** TELEMETRY → Tier 1, hard-pinned to ship before WIRE-IN (RTB's ARM consumes telemetry → RTB depends on TELEMETRY, not reverse). Tier 1 grows from 14 to 15 batches.
> - **§1 dep graph corrected (Langston items 9 + 10):** RTB depends on TELEMETRY; ORCHESTRATOR adds CONFIDENCE-CHAIN; WIRE-IN hard-pinned after TELEMETRY.
> - **MCE scope (Langston item 2 — CC COUNTER-PROPOSE):** MCE keeps cost-model.ts (EV-side); slippage-fee-model.ts moves to EXECUTION (consumed by realtime-paper-executor.ts, execution-side concern).
> - **STRATEGY scope (Langston item 7):** strategy-mapper.ts (Directive 11.4H.6G) explicitly pinned with file:line.
> - **POOL scope (Langston item 1 — primary gate placement):** Primary market-hours gate at admission. Don't admit closed-market xStock pairs to activeFilterPool.
> - **ORCHESTRATOR scope (Langston item 1, 10):** Defense-in-depth market-hours check at evaluateSymbol entry; CONFIDENCE-CHAIN added to dep list.
> - **EXECUTION scope (Langston items 2, 3, 4, 6, 13c):** slippage-fee-model.ts + risk-concentration.ts + dynamic-slots.ts REQUIRED-assetClass + pre-audit enumeration of all 4 executor layers + tick-size/lot-size/whole-share enforcement for xStock.
> - **§2.2 per-metric regression-lock thresholds (Langston item 11):** FX5 pool / signal gen / VTS rate stay ±5% 24h; active trade-open rate is ±1-2 absolute trades/day OR ±15% over 7-day rolling.
> - **§2.4 scope-of-application (Langston item 12):** standing rule applies to "every Phase 24 batch" (not only this umbrella's sub-batches). CLAUDE.md §3.3 updated to match.
> - **§6 NEW Phase 19 readiness gaps (Langston item 13):** Cross-class portfolio P&L reconciliation + external macro feed per-class flagged as known follow-ups (post-umbrella).
> - **CC COUNTER-PROPOSE on 3 items (2, 6, 13c)** — described above; awaiting Langston FINAL ACK or further iteration.

---

## §0 — Why this is an umbrella, not a single batch

The original B79.0n was scoped as "wire xStock into active-trading dispatch" — a single batch. Kyle's Step 1 review and the subsequent code-level audit (`B79_0n_SCOPE.md` §2.5 Findings 1-3 + the comprehensive SIM/System-Manual enumeration 2026-05-20 PM) revealed that the wire-in by itself is impossible to ship cleanly because the entire active-trading pipeline has systemic asset-class-awareness gaps that would silently route xStock signals into crypto-calibrated logic at dozens of touch points. The right shape is a multi-sub-batch arc that audits + fixes one subsystem at a time, each with its own crypto-regression-lock and Phase-19-ready documentation.

**Active trading stays OFF** through this entire arc. We're building end-to-end-ready architecture; live-trading enablement is the Phase 19 gate.

**Kyle directive: mode-mutually-exclusive routing (rev 2 wording fix per Langston item 5).** The Run-Mode Controller (`server/services/run-mode-controller.ts`) documents three modes: `vts | paper_sim | live`. Routing is `vts vs (paper_sim | live)`. The active-trading path encompasses BOTH paper_sim mode and live mode — both flow through orchestrator → SQE → RTB → paper-execution-engine. The VTS path is the dedicated learning mode. xStock survivors get routed by the scanner based on the mode — `vts` mode keeps today's `eval-cycle.ts → registerOpenVtsTrade` path; `paper_sim` or `live` mode admits survivors to `activeFilterPool` for the orchestrator. Both paths exist in code; the mode determines which fires. Mirrors crypto's existing pattern at `fx5-scanner.ts:1390`.

---

## §1 — The 17 sub-batches

Two tiers. Tier 1 (12 batches) is the critical active-trading path; Tier 2 (5 batches) is the learning/observability adjacent systems that also cross asset-class boundaries and would otherwise drag into Phase 19.

### Tier 1 — Critical active-trading path (15 batches; was 14 in v1 — TELEMETRY promoted per Langston item 9)

| # | Name | Canonical scope file | What it covers | Dependencies |
|---|---|---|---|---|
| 1 | **B79.0n.HYGIENE** | `B79_0n_HYGIENE_SCOPE.md` | `setNullReason` ReferenceError fix (#121) + 5-symbol Kraken-gap registry trim (#120). Small, fast, clears noise before bigger work. | None |
| 2 | **B79.0n.STORAGE** | `B79_0n_STORAGE_SCOPE.md` | Codebase-wide silent-crypto-fallback audit + SQE bug fix (`signal_quality_evaluator.ts:143`) + storage API REQUIRED-assetClass refactor (Langston rev2 §11.4). Root-cause fixes the systemic pattern before downstream batches inherit it. | None (foundational) |
| 3 | **B79.0n.MCE** | `B79_0n_MCE_SCOPE.md` | Market Context Engine asset-class plumbing: regime classifier, IMF metric weights, DBS computation, Directional Integrity, **cost-model.ts (EV-side cost model only — slippage-fee-model.ts moved to EXECUTION per CC counter-proposal item 2)**, friction estimates, macro modifier, indicator computations (VWAP / ATR / EMA / BB / RSI). | STORAGE |
| 4 | **B79.0n.STRATEGY** | `B79_0n_STRATEGY_SCOPE.md` | Strategy engine + every quant detector method + `_SE_KEY` resolver specificity + Hybrid Integration Service (quant+pattern ensemble) + Strategy Sync per-asset-class `strategy_settings` rows + **strategy-mapper.ts (Directive 11.4H.6G Canonical Regime-Strategy Enforcement) — per Langston item 7**. | STORAGE |
| 5 | **B79.0n.PATTERN-DETECT** | `B79_0n_PATTERN_DETECT_SCOPE.md` | Pattern recognition modules (candlestick detectors, chart-pattern recognizers, pattern strength scoring). Audit whether already asset-class-aware via xStock VTS usage; close gaps. | STORAGE |
| 6 | **B79.0n.CONFIDENCE-CHAIN** | `B79_0n_CONFIDENCE_CHAIN_SCOPE.md` | b67_1 through b67_4 + b68_1 through b68_5 modulator chain asset-class awareness. Pre-audit verifies whether modulators differ per asset class — could be no-op or could surface per-class parameter need. | STORAGE |
| 7 | **B79.0n.SCORING** | `B79_0n_SCORING_SCOPE.md` | FinalScore + RankingScore + HybridScore + PredictiveConfidence + Net Expectancy Kernel + Adaptive Goals Weight System + SQE finalScoreMin/regimeWeightMin thresholds + ranking-weights + normalization bounds. Architecture-only plumbing; values calibration deferred. | STORAGE |
| 8 | **B79.0n.TEC** | `B79_0n_TEC_SCOPE.md` | Trailing Exit Controller + TEC Evaluator + xStock Structural Discontinuity Detector (B-NEW-42 already asset-class-aware) + Exit Strategy Replay Service + crypto_perp+xstock_perp residual #116 background timer fix. | STORAGE |
| 9 | **B79.0n.TELEMETRY** | `B79_0n_TELEMETRY_SCOPE.md` | **Telemetry Aggregator per-asset-class buckets. Promoted from Tier 2 per Langston item 9 — RTB's Adaptive Ratio Manager consumes telemetry, so RTB depends on TELEMETRY (not reverse). Hard-pinned to ship before WIRE-IN.** | STORAGE |
| 10 | **B79.0n.RTB** | `B79_0n_RTB_SCOPE.md` | Ready-to-Buy queue management + Adaptive Ratio Manager + TCL (Trade Candidate List) watchdog + cross-asset top-signal selection + FinalScore gap safety rule. | STORAGE, SCORING, **TELEMETRY (dep direction corrected per Langston item 9)** |
| 11 | **B79.0n.RTB-REFRESH** | `B79_0n_RTB_REFRESH_SCOPE.md` | RTB Refresh Service (split per Kyle's flag — distinct subsystem with its own 1-second cycle). Verify whether per-asset-class refresh cadence is needed. | RTB |
| 12 | **B79.0n.POOL** | `B79_0n_POOL_SCOPE.md` | Active Filter Pool `addSurvivors` signature change — REQUIRED `assetClass: AssetClass` parameter. All existing callers (fx5-scanner, unified-filter-gateway) updated to pass `'crypto_spot'` explicitly. New `getActivePoolByAssetClass()` accessor for diagnostics. **Primary market-hours gate at admission per Langston item 1 — don't admit closed-market xStock pairs to activeFilterPool. Consults `xstock_spot/market-hours.ts` at admission time.** | STORAGE |
| 13 | **B79.0n.ORCHESTRATOR** | `B79_0n_ORCHESTRATOR_SCOPE.md` | Signal orchestrator `evaluateSymbol` asset-class branching at every strategy detect call site + B79.0d ORB inline hook reachability verification + per-strategy signal-count logging instrumentation + **defense-in-depth market-hours check at evaluateSymbol entry (Langston item 1)**. | MCE, STRATEGY, PATTERN-DETECT, **CONFIDENCE-CHAIN (added per Langston item 10 — explicit > transitive through SCORING)**, SCORING, POOL |
| 14 | **B79.0n.EXECUTION** | `B79_0n_EXECUTION_SCOPE.md` | Paper-execution-engine asset-class branching + Paper Position Sizing + Dynamic Sizing Engine + Pre-Execution Validator + Trade Safety + Guardrails V2 + log-only dry-run journal + side-door audit. **Plus rev 2 additions per Langston items 2/3/4/6/13c:** (a) **slippage-fee-model.ts asset-class awareness** — consumed by realtime-paper-executor.ts (CC counter-proposed move here from MCE per item 2 since this is an execution-side concern). (b) **risk-concentration.ts** (Directive 9.4) — Σ\|ρ_ij\| × w_j correlation analyzer with per-class ρ matrices (crypto-internal ρ≈0.7+ differs structurally from crypto-vs-xStock ρ≈0.2-0.4). (c) **dynamic-slots.ts REQUIRED-assetClass** — `getDynamicSlots(mode, assetClass)` signature change. (d) **Pre-audit enumeration of all 4 executor layers** (paper-execution-engine, realtime-paper-executor, trade-executor, trading-engine) — determine if all 4 need asset-class branching or if there's clean delegation; scope adjusts based on pre-audit findings (CC counter-proposal on item 6). (e) **Tick-size / lot-size / whole-share enforcement for xStock** — prevents silent zero-rounding when small allocation rounds to zero shares (CC moved from Langston's Phase-19-deferred to in-arc per item 13c since silent zero-trade is a real production bug we can prevent now). | ORCHESTRATOR, TEC |
| 15 | **B79.0n.WIRE-IN** | `B79_0n_WIRE_IN_SCOPE.md` | The actual wire-in: xStock scanner mode-aware routing (gates on Run-Mode Controller mode — `vts` keeps eval-cycle path, `paper_sim`/`live` admits to activeFilterPool), survivor admission to `activeFilterPool` in active mode (vts mode keeps today's `eval-cycle.ts → registerOpenVtsTrade`), Passive Archive Pipeline tag verification. | All Tier 1 prior **including TELEMETRY (hard-pinned per Langston item 9)** |

### Tier 2 — Learning + observability (2 batches; was 3 in v1 — TELEMETRY promoted out)

| # | Name | Canonical scope file | What it covers | Dependencies | Priority |
|---|---|---|---|---|---|
| 16 | **B79.0n.ML-CALIBRATION** | `B79_0n_ML_CALIBRATION_SCOPE.md` | ML Calibration Service stratification per asset class (separate 10-HYBRID counters + separate calibration cycles per class so crypto outcomes don't pollute xStock recalibration). | STORAGE, TELEMETRY | **HIGH** (impacts long-term learning correctness) |
| 17 | **B79.0n.OBSERVABILITY** | `B79_0n_OBSERVABILITY_SCOPE.md` | Drift Detector per-{strategy, assetClass} baselines + Regime Archiver assetClass tagging + Drift Dashboard asset-class filter. | STORAGE | MEDIUM (diagnostics, not critical path but useful before Phase 19) |

### Sub-batch dependency graph (rev 2 — corrected per Langston items 9 + 10)

```
HYGIENE                               (independent)
   └─→ STORAGE                        (foundational)
         ├─→ MCE
         ├─→ STRATEGY
         ├─→ PATTERN-DETECT
         ├─→ CONFIDENCE-CHAIN
         ├─→ SCORING
         ├─→ TEC
         ├─→ POOL
         ├─→ TELEMETRY ─→ RTB ─→ RTB-REFRESH          (corrected: telemetry feeds RTB's ARM)
         │                ├─→ ML-CALIBRATION (T2)
         └─→ OBSERVABILITY (T2)
   └─→ ORCHESTRATOR (depends on MCE+STRATEGY+PATTERN+CONFIDENCE-CHAIN+SCORING+POOL)
         └─→ EXECUTION (depends on ORCHESTRATOR+TEC)
               └─→ WIRE-IN (depends on ALL T1 prior, INCLUDING TELEMETRY — hard-pin)
```

Middle batches (MCE, STRATEGY, PATTERN-DETECT, CONFIDENCE-CHAIN, SCORING, TEC, TELEMETRY, POOL) are independent of each other once STORAGE lands — could ship in any order; sequential probably gives cleaner reviews. **TELEMETRY must close before WIRE-IN** so ARM has per-asset-class telemetry buckets when xStock survivors enter the pool.

---

## §2 — Standing rules for every sub-batch

Every sub-batch in this umbrella MUST follow all of the following, in addition to the standard 11-step workflow:

### §2.1 — Standard 11-step workflow (CLAUDE.md §2)
Scope → pre-audit (with SIM consultation per §9.1) → implementation → Langston Step 4 code review → push → deploy → CC Step 7 verification → Langston Step 8 second-pass → iterate → governance → completion report.

### §2.2 — Crypto regression-lock (MANDATORY acceptance criterion) — per-metric thresholds (rev 2 per Langston item 11)

Every sub-batch's Step 7 includes a 24h pre-deploy / 24h post-deploy comparison of crypto metrics. **Per-metric thresholds (not global ±5%):**

| Metric | Threshold | Window | Reasoning |
|---|---|---|---|
| FX5 pool size | ±5% | 24h | High-volume metric (~300 pairs); ±5% is statistically meaningful |
| Signal generation rate | ±5% | 24h | High-volume (dozens/hour); ±5% appropriate |
| VTS trade rate | ±5% | 24h | High-volume; ±5% appropriate |
| **Active trade-open rate** | **±1-2 absolute trades/day OR ±15% over 7-day rolling window** | 7-day rolling | Low-volume metric (3-8 trades/day pre-WIRE-IN). A single extra trade swings the rate 12-33%; ±5% would either falsely block (statistical noise) or falsely pass (large bias hidden in small-N). 7-day window aggregates enough trades for signal. |

Any deviation outside the per-metric threshold blocks Step 8 advancement.

**Rolling-window baseline reset clarification (Langston v2 FINAL ACK forward-tracking note 2):** for the 14 sub-batches PRE-WIRE-IN, the active-trade-open-rate metric measures crypto-only baseline (xStock active trades not yet flowing). For WIRE-IN itself + any post-WIRE-IN sub-batches, the 7-day rolling window starts FRESH from WIRE-IN deploy time, because the introduction of xStock active trades materially changes the baseline. WIRE-IN's scope file will re-state this explicitly.

### §2.3 — Crypto-by-construction-NONE invariant
Every code change in this arc must be either ADDITIVE (adds asset-class branch; crypto path unchanged at runtime) or TYPE-ENFORCED with explicit crypto callers updated to pass `'crypto_spot'` explicitly. Mid-arc combine/split decisions preserve this invariant.

### §2.4 — Asset-class onboarding learning-capture (CLAUDE.md §3.3 — Kyle directive 2026-05-20; rev 2 wording per Langston item 12)

**Scope-of-application (rev 2):** every Phase 24 batch (including this umbrella's sub-batches AND any other B79.x batches outside this umbrella, e.g., the end-of-arc workflow consolidation batch). Standing rule lives at the Phase level, not the umbrella level. Per Langston item 12, this matches Kyle's original 2026-05-20 phrasing more precisely than v1 did.

Every Phase 24 completion report MUST include a section titled **"Asset-class onboarding workflow learnings"** covering (a) what worked well + reusable for next asset class, (b) what surprised us + future pitfalls, (c) recurring structural patterns, (d) concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Empty section is acceptable — say "No new onboarding learnings this batch" explicitly; no filler. Workflow doc edits applied in the same governance turn.

### §2.5 — Green light to fix obvious bugs found during audit (Kyle directive 2026-05-20)
Each sub-batch's pre-audit surfaces findings under three categories: (a) in-scope (the asset-class-awareness fix the batch is about), (b) deferred / can wait, (c) **obvious bug found in passing that would otherwise hit us in Phase 19**. For (c), CC decides whether to absorb the fix into the current batch (when small, contained, reduces Phase 19 workload) or to spawn it as a separate task. Decisions documented in pre-audit + completion report. Where a bug is large or risky to bundle, flag back to Kyle for the call.

### §2.6 — Combine/split autonomy (Kyle directive 2026-05-20)
CC + Langston have autonomy to combine, split, or reorder sub-batches when one batch's pre-audit findings genuinely warrant it. Every refinement gets documented with reasoning + routed through standard Step 4 review. Default to the 17-batch shape unless evidence justifies otherwise.

### §2.7 — Phase 24 end-of-arc workflow consolidation
At end of Phase 24, a dedicated review batch consolidates every sub-batch's "Asset-class onboarding workflow learnings" section into a finalized `ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Target: 90-95% guesswork reduction for the next asset class onboarding (perpetual futures next, then others).

---

## §3 — Per-sub-batch scope-file template

Each sub-batch gets its own detailed scope file at `Claude Comms and Packages/Scope Files/B79_0n_<NAME>_SCOPE.md`. Required sections:

1. **Objective** — what asset-class-awareness gap the batch closes.
2. **Pre-audit checklist** — SIM consultation + Step 4.5 (writer/reader asset-class enumeration) + Step 4.6 (block-scope rename audit) + Step 4.7 (scan-cycle read-side data-completeness) + any batch-specific disciplines.
3. **Code changes** — every file:line modification with before/after where load-bearing.
4. **Unit tests** — every change has unit-test coverage.
5. **Acceptance criteria** — including crypto regression-lock + any operational soak gates.
6. **Crypto-regression invariant** — by-construction proof for this batch.
7. **Deferred follow-ups** — anything found in pre-audit that's deferred (with reasoning).
8. **Asset-class onboarding learnings section** (placeholder, fills during completion report).
9. **Open questions for Langston** — anything CC wants Langston to confirm before implementation.

The first sub-batch (B79.0n.HYGIENE) gets a detailed scope written immediately after this umbrella is locked.

---

## §4 — Status tracking

| Sub-batch | Scope file | Status | Notes |
|---|---|---|---|
| HYGIENE | not yet drafted | NOT STARTED | First sub-batch; starts after umbrella lock |
| STORAGE | not yet drafted | NOT STARTED | Foundational; second after HYGIENE |
| MCE | not yet drafted | NOT STARTED | |
| STRATEGY | not yet drafted | NOT STARTED | |
| PATTERN-DETECT | not yet drafted | NOT STARTED | |
| CONFIDENCE-CHAIN | not yet drafted | NOT STARTED | Pre-audit verifies need |
| SCORING | not yet drafted | NOT STARTED | |
| TEC | not yet drafted | NOT STARTED | |
| RTB | not yet drafted | NOT STARTED | |
| RTB-REFRESH | not yet drafted | NOT STARTED | Split from RTB per Kyle |
| POOL | not yet drafted | NOT STARTED | |
| ORCHESTRATOR | not yet drafted | NOT STARTED | |
| EXECUTION | not yet drafted | NOT STARTED | |
| WIRE-IN | not yet drafted | NOT STARTED | Last in dependency chain |
| TELEMETRY | not yet drafted | NOT STARTED | T2 HIGH |
| ML-CALIBRATION | not yet drafted | NOT STARTED | T2 HIGH |
| OBSERVABILITY | not yet drafted | NOT STARTED | T2 MED |

This tracker gets updated at every sub-batch's Step 1 (scope drafted), Step 4 (Langston ACK), Step 6 (deployed), Step 11 (closed).

---

## §5 — Estimated total time

Tier 1: 4-6 weeks sequential. Possibly faster with parallelization where dependencies allow.
Tier 2: additional 1-2 weeks (HIGH-priority batches TELEMETRY + ML-CALIBRATION should not lag T1 too far; OBSERVABILITY is lower priority and can backfill).

End-of-arc: Phase 24 workflow consolidation batch (~1 week).

**Realistic timeline:** 6-9 weeks total before umbrella closes and Phase 24 finishes.

---

## §5.5 — Phase 19 readiness gaps deferred from this umbrella (rev 2 NEW per Langston item 13)

Items Langston flagged as known-risk gaps that will NOT be fully closed by this umbrella; tracked for post-umbrella B79.x follow-up batches:

1. **Cross-class portfolio P&L reconciliation.** `fx-conversion-service.ts` (USD/USDT/EUR/JPY) exists for guardrail USD-normalization. It doesn't currently know about xStock USD-native pricing vs crypto USDT-quoted pricing as a class concern. Will surface the first time portfolio equity reports mix asset classes in Phase 19. Defer to B79.x follow-up.
2. **External macro feed (`external-macro-feed.ts`) per-class signal.** MCE has "macro modifier" but the upstream feed is class-agnostic today. Crypto-relevant macro (BTC dominance, ETF flows, funding resets) differs structurally from xStock-relevant macro (rates, earnings calendar). Defer to B79.x follow-up.

(Langston's third Phase-19-readiness suggestion — tick-size / lot-size / whole-share enforcement — was MOVED into EXECUTION scope per CC counter-proposal on item 13c. See EXECUTION (#14) in §1 above.)

**Forward-tracking note 1 from Langston v2 FINAL ACK:** these §5.5 items get logged into `1-system-manual/RUNNING_ISSUES.md` at the same time as this umbrella's Step 1 governance closure, so they don't get lost when this umbrella file closes at end-of-arc. Tracked as new RUNNING_ISSUES entries:

- #122 (NEW) — Cross-class portfolio P&L reconciliation (`fx-conversion-service.ts` USD-normalization doesn't know about xStock USD-native vs crypto USDT-quoted as a class concern)
- #123 (NEW) — External macro feed per-class signal (`external-macro-feed.ts` is class-agnostic; crypto-relevant macro vs xStock-relevant macro differ structurally)

Both logged with cross-references back to this umbrella + Langston v1 review item 13 origin.

**Forward-tracking note 3 from Langston v2 FINAL ACK (EXECUTION pre-audit):** EXECUTION's pre-audit on the 4 executor layers (paper-execution-engine, realtime-paper-executor, trade-executor, trading-engine) MUST surface findings to Langston at Step 2 review BEFORE finalizing implementation scope. If all 4 layers need branching and EXECUTION grows beyond a single-batch shape, CC and Langston jointly decide whether to split EXECUTION into two sub-batches at that gate (per §2.6 combine/split autonomy). Explicit conversation > silent absorption.

---

## §6 — Ask for Langston (Step 1 umbrella v2 FINAL ACK review)

Langston: this is a "prove-me-wrong" review. CC's responsibility is to find every module/service/function in the active-trading path that needs asset-class awareness. Langston's responsibility is to try to break this list — find anything missing, mis-grouped, or misframed.

Specific questions:

(a) **Completeness:** is there ANY module/service/function in the active-trading path (or learning/observability adjacent to it) that should be asset-class-aware but isn't in the 17-batch list? Specifically check: anything in `server/services/`, `server/core/`, `server/strategies/`, `server/asset_classes/` that operates in the post-filter pipeline.

(b) **Mis-grouping:** are any of the modules I've folded into a batch genuinely separate enough to warrant their own batch? (e.g., I folded Adaptive Ratio Manager into RTB; should it be standalone? I folded Dynamic Sizing Engine into EXECUTION; should it be standalone?)

(c) **Dependency graph:** are the dependencies in §1 correct? Anything that should ship before STORAGE? Any sub-batch that depends on more than what I've listed?

(d) **Crypto-regression-lock acceptance:** ±5% threshold reasonable, or too loose / too tight for any specific subsystem?

(e) **Tier 2 placement:** are TELEMETRY + ML-CALIBRATION genuinely Tier 2, or should they be Tier 1 because they affect routing decisions (FX5 Adaptive Ratio reads telemetry to decide what to scan)?

(f) **Phase 19 readiness check:** anything in the 17-batch list that, even after close, leaves a known gap that Phase 19 testing would surface? Flag it as a known risk now.

Reply: **umbrella v1 FINAL ACK** / **specific list additions/regroupings** / **substantive design disagreement**.

---

## §7 — Rev 2 FINAL ACK gate (NEW per Langston v1 review iteration)

This is the v2 reply gate. Of your 11 v1 items, **8 are accepted as-is, 3 have CC counter-proposals.** The accepted items are folded into §0, §1, §2.2, §2.4, §5.5 of rev 2. The counter-proposals are:

| Item | Your v1 ask | CC counter-proposal | Reasoning |
|---|---|---|---|
| 2 | Fold slippage-fee-model.ts into MCE | Move to EXECUTION instead | slippage-fee-model.ts is consumed by realtime-paper-executor.ts (execution-side concern). MCE handles cost-model.ts (EV-side input). Splitting MCE/EXECUTION ownership by consumer rather than module-name keeps batch boundaries clean. EXECUTION batch already touches the execution layer; folding this here is natural. |
| 6 | Pin scope: which of 4 executor layers need branching | Add explicit pre-audit deliverable to enumerate all 4 + determine delegation; scope adjusts based on findings | Pre-audit is the right place to enumerate. If all 4 layers need fixes, EXECUTION scope expands at Step 2. If there's clean delegation through paper-execution-engine, scope stays focused on that one entry point. Either outcome is documented in pre-audit. |
| 13c | Defer tick-size/lot-size to Phase 19 follow-up | Include in EXECUTION scope of this umbrella | xStock whole-share rounding silently zero-ing small positions is a real production bug we can prevent now. Defer-to-Phase-19 means we ship knowing the bug exists; in-arc means we ship fixed. Phase 19 already has plenty of work; reducing avoidable bug surface here is high-value. |

The other 10 items I either accepted exactly as you framed them (1, 3, 4, 5, 7, 9, 10, 11, 12, 13a, 13b) or you confirmed my v1 position (item 8 — ARM stays in RTB).

Reply: **rev2 FINAL ACK** if you concur on the 3 counter-proposals / **further iteration** if you want to push back on any of them.

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §12 dispatch-anchoring: this umbrella IS the inbox file. Do NOT `cd /mnt/gdrive`. For repo-side inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

— Claude Code, 2026-05-20 PM (umbrella rev 2)
