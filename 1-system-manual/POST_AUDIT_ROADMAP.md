# DawnTrader Post-Audit Roadmap

> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Created**: 2026-02-17
> **Revised**: 2026-04-14 (v7 — Phase 15b restructured: B60 Smart Thermostat DEFERRED to post-live. New Phase 15b = Regime/DBS/Strategy/Filter Restructure (B61-B65). Locked via three-way consensus 2026-04-14.)
> **Revised**: 2026-04-12 (v6 — Phase 11 Finalization governance + code complete (B58). Adjustment Framework + Authority Baseline deployed. CI TS issue #39 flagged.)
> **Purpose**: Complete roadmap from current state through live mode trading and publication. Uses formal DawnTrader phase numbering.
> **Companion Documents**: SYSTEM_MANUAL.md (what the system IS), CHANGES_AND_FIXES.md (22 bugs, 85 risks), LEGACY_DEPRECATION_PLAN.md (removal waves), ADJUSTMENT_FRAMEWORK.md (parameter governance), AUTHORITY_BASELINE.md (V1.0 snapshot)
> **Source Documents Incorporated**: "Dawn Trader Next Steps After MCE Build" (2.14.26), "DT Phase 11.8 Final Steps" (2.6.26), "DT Predictive Learning Calibration" (2.2.26), "The Plan to Create A Plan for Machine Learning" (1.17.26)

---

## Where We Are (as of 2026-04-14, Phase 15b Locked)

**Last completed batch**: Batch 59 (Phase 15a — Predictive Learning UI Audit & Data Path Fixes)
**Phase 11 status**: COMPLETE — Governance + code deployed (B58). Phase 11 CLOSED.
**Phase 12 status**: COMPLETE
**Phase 13 status**: COMPLETE — MCE installed, L12-L20 cluster fully removed.
**Phase 14.1 status**: COMPLETE — VTS wired to real detect functions.
**Phase 14.2 status**: EFFECTIVELY COMPLETE — DBS implemented (Batch 15). NOTE: DBS discovered to be ORPHANED (computed but never consumed by classifier or strategy gates) — addressed in new Phase 15b.
**Phase 14.3 status**: DEFERRED INDEFINITELY — replaced by Exchange Expansion (post-live).
**Phase 14.4 status**: CANCELED
**Phase 14.5 status**: COMPLETE — Dual-path pattern scanning, merit-based ranking, filter diagnostics (Batches 19-19K).
**Phase 14.6 status**: COMPLETE — Family-qualified identity, filter diagnostics data truth (Batches 20-39).
**Phase 14.7 status**: COMPLETE — Strategy calibration, pattern recognizer optimization, hardcoded default removal, ML service (Batches 48-54).
**Migration status**: COMPLETE — Hetzner + Supabase (Batch 40). Post-migration stabilization (Batches 41-47) complete.
**Phase 15a status**: DEPLOYED — Predictive learning data path fixes (B59). Regime Archive verification pending next telemetry cycle.
**Phase 15b OLD (Smart Thermostat) status**: DEFERRED to post-live (renumbered to a post-live phase, e.g. Phase 17.5). Decision: cannot tune adaptive policy on top of a misclassified state model.
**Phase 15b NEW status**: LOCKED 2026-04-14 — Regime/DBS/Strategy/Filter Restructure. Five sub-phases (A-E), five batches (B61-B65). Three-way consensus reached.
**Running Issues**: 37 RESOLVED, 1 DEFERRED, 1 OPEN (#39 CI TS Check).
**Next phase**: Phase 15b (NEW — Regime/DBS/Strategy/Filter Restructure, B61-B65), then Phase 16 (DB/Legacy Cleanup)

---

### 2026-05-27 update — Phase 19 / Phase 25 SPLIT locked (Kyle directive 2026-05-27 evening)

**Decision (Kyle directive after EXECUTION close 2026-05-27 evening):** the work previously bundled under Phase 19 splits into TWO phases on outcome-dependency:

- **Phase 19 = "Functional from scan to closed trade"** — active-trading-path restoration, structural plumbing, safety mechanisms, the act of running paper-active, structural bug fixes found during that run, calibrations that DON'T require trade outcomes to make a decision-grade verdict (thresholds, regime classifiers without confidence, strategy selection, strategy gates, archive-replay priors).
- **Phase 25 = "Calibration with evidence"** — anything that needs paper-active wins/losses to verify (confidence modifiers, SQE thresholds, sustainability gate value-scope, ladder net contribution, AMR build/skip decision, factor calibrations).

**Notes (Kyle directive 2026-05-27):**
- **Batch ordering within each phase is decided at the start of that phase**, not pre-locked here. The table below catalogs WHICH phase each item lives in, not the sequence.
- **Some items overlap across the existing roadmap sections and `RUNNING_ISSUES` entries.** Phase 19 and Phase 25 cleanup at start-of-phase will collapse duplicates and resolve any remaining ambiguous placements before sequencing begins.
- **B80 crypto_perp (formerly labeled "Phase 25") was deferred to POST-LAUNCH on 2026-05-21** — that label is now retired. New canonical naming: B80 crypto_perp is "post-launch / Phase 26 placeholder, no SLA." The "Phase 25" number is now repurposed as the calibration-with-evidence phase per this split.

**Locked Phase 19 items:**

| # | Item | Plain-language purpose |
|---|---|---|
| 19-1 | B79.0n.WIRE-IN (umbrella v4 #14) | xStock active-trading wire-in. Connects xstock_spot signals end-to-end through the engine so paper trades can actually open and close on xstock symbols. Activates the canary log + outcomeFeedback EMA store + diagnostic counter math we deferred in EXECUTION. |
| 19-2 | B79.0n.OBSERVABILITY T2 + active-trading flip (umbrella v4 #16) | The actual flip-the-switch on paper-active for all 4 active classes + observability dashboards/alerts. After this, the system is running. |
| 19-3 | §19.0.5 Full data-capture coverage for paper-active path | Active-path SQE/RTB/TCL reject hooks + FX5 pre-filter capture. HARD precondition before paper-active turns on. |
| 19-4 | §19.0.B Daily loss-budget service + kill-switch auto-trip | Aggregator + auto-trip on rolling 24h paper P&L vs portfolio. Safety mechanism. |
| 19-5 | §19.x Boot Readiness Coordinator | Unify the patchwork boot sequence. Triggered if Phase 19 surfaces boot-related cascading failures. |
| 19-6 | #137 active-trading-path restoration intake list | TypeScript baseline file's `phase_tag.startsWith("Phase 19")` entries — concrete code fixes from B-NEW-43 needed for active-trading to function correctly. |
| 19-7 | #92 wire xstockSpotScanner through signal-orchestration | Pre-existing wiring gap. Required for xstock_spot to produce signals on the active path. |
| 19-8 | B79.5 xStock real-time WebSocket pricing adapter | `wss://ws-equities.kraken.com` live-pricing adapter. Without it xstock active-trading runs on stale REST polling. |
| 19-9 | B79.x failure-mode taxonomy — entry-side gap | LULD halts / circuit breakers / dividends / splits / earnings entry-side scanner consult. Exit-side landed via B-NEW-42; entry-side is required before live trading. |
| 19-10 | #139 vts-runner throwing `resolveAssetClass` call sites | 10+ pre-existing throwing call sites surfaced during PATTERN-DETECT. Functional fix needed before paper-active across multiple classes. |
| 19-11 | §19.1 Paper Trading Run | The act of actually running paper-active for an extended observation window. Generates the data Phase 25 consumes. |
| 19-12 | §19.2 Audit & Debug | Fix structural bugs surfaced during the paper run. |
| 19-13 | §19.3 Performance Validation | Latency, throughput, queue depth, cadence holds under real paper-active flow. |
| 19-14 | §19.3.5 Trailing-exit live verification (B65.3 folded in) | Verify ATR TEC + ladder + break-even-stop behavior under real fills. |
| 19-15 | #97 xStock asset-specific characteristics inventory | Earnings calendar / market cap / P/E / IV / analyst ratings feeds. Plumbing for data sources active trading will consult. |
| 19-16 | B79.6 sector-aware portfolio-cluster prevention | Equities cluster by sector. Without this, multiple correlated xstock positions can land simultaneously. |
| 19-17 | **NEW — Active Trading Simulations (Kyle directive 2026-05-27)** | VTS-like layer that opens a simulated trade for every signal that enters RTB (and optionally for signals rejected by SQE, marked `SQE_PASSED` vs `SQE_REJECTED`). Captures additional data per unit of calendar time when slot caps limit how many real paper trades open. Lets us measure what the trades-we-didn't-take would have done + measure SQE filter quality (is SQE removing winners or losers?). Strict data partition so calibration doesn't pool simulated vs real. Reuses VTS infrastructure where possible. |
| 19-18 | **NEW — Live mode active-trading build approach (Kyle directive 2026-05-27)** | Discussion + design item at start of Phase 19: is live mode a copy-paste of paper mode with a switch-button toggle (current design plan), or is there a better way to build it? Decision lands before Phase 21 live mode activation. |
| 19-19 | **NEW — AMR body pre-Phase-19 (CC + Langston consensus 2026-05-28)** | Adaptive Market Response BODY lands as a pre-Phase-19 batch (after B-XSTOCK-CALIB umbrella close + asset-class-onboarding-workflow finalize, before Phase 19 kickoff). Body = weather-report aggregator service (combines regime state + DBS direction/trend + realized-vs-predicted EV + pair-level regime distribution + friction trend into one classification: calm/choppy/stormy/favorable) + response dials (position size, stop distance, target distance, confidence floor, entry cooldown, strategy/pool allowance lists, slot-count caps, hard-pause flag) + offensive Aggressive mode added to existing Normal/Defensive/Survival skeleton + per-asset-class `module_constants` integration (hand-set conservative thresholds, NOT VTS-calibrated). **Shadow-mode boot gate (Langston friendly amendment):** first ~5-7 days of Phase 19, weather aggregator runs and logs every classification + transition but response dials remain pinned at Normal (no actual brakes applied). After shadow window, flip DB feature flag to active. Mitigates debug-confounder concern during Phase 19's bug-discovery window while preserving observation runway. Cost trivial — dials already need respect/ignore toggle for emergency revert. Source documents: `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` (2026-04-25, body design) + `Claude Comms and Packages/Cross-Session Briefs/AMR_PRE_PHASE_19_PEER_DISCUSSION_2026-05-25.md` (sequencing argument) + `Claude Comms and Packages/Cross-Session Briefs/ML_DESIGN_PRELIMINARY_2026-05-21.md` §6.2 + §7 (M2 socket spec). CC + Langston converged consensus 2026-05-28 on body-now/brain-later split per Kyle directive 2026-05-27 evening "if so share with Langston and iterate until you guys arrive at a decision."  |

**Locked Phase 25 items (calibration with evidence):**

| # | Item | Plain-language purpose |
|---|---|---|
| 25-1 | B79.0n.ML-CALIBRATION T2 (umbrella v4 #15) | Tier 2 ML calibration — confidence-chain calibration against active-paper outcomes. Explicitly needs live evidence. |
| 25-2 | §19.0.A Regime classifier confidence-chain calibration | B-NEW-33/36/37/39 workstream — confidence-modifier calibration re-run against paper-active outcomes (the apples-to-apples population). |
| 25-3 | §19.0.3 TFS sustainability gate value-scope decision | Recalibrate / re-target / deprecate the b68_5 sustainability gate against paper-active data. |
| 25-4 | §19.4 SQE Recalibration (B66 conditional) | Rebuild SQE thresholds with sibling-strategy WR controls + post-B62-only data + active-paper outcomes. |
| 25-5 | §19.4.5 Observational Decision Gate | Pre-launch reordering decision based on 1-2 weeks of clean active-paper outcomes. Hostile-window recurrence, ladder net contribution, low-volume moonbag exclusion, etc. |
| 25-6 | **AMR posture-model M2 calibration (post-launch — Phase 17/18 ML buildout)** | **CORRECTED 2026-05-28 per CC + Langston consensus** — AMR BODY moved to Phase 19 entry 19-19 (pre-Phase-19 batch with hand-set conservative thresholds + shadow-mode boot gate). What remains for Phase 25 / post-launch is the BRAIN: ML M2 posture-model trains against paper-active outcomes from Phase 19, replaces the hand-set thresholds with a learned model via the body's existing socket per `ML_DESIGN_PRELIMINARY_2026-05-21.md` §6.2 + §7. This is the calibration-with-evidence component — M2 needs paper-active outcomes to train against (the population that hand-set thresholds couldn't legitimately be calibrated against pre-Phase-19). CC's original 2026-05-27 recommendation (full defer to Phase 25) was based on stale `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §5 decision pathway that Kyle's 2026-05-21 directive "yes we're building it" had already retired; corrected via Langston independent read 2026-05-28. |
| 25-7 | #94 B79.3 xStock equity-equivalent macro confidence modifiers | xStock equivalents to B68.x macro modifiers (DXY / SPY / VIX-flavor signals). Confidence modifier work per Kyle 2026-05-27 voice — needs outcomes. |
| 25-8 | #153 xStock `pattern_max_position_pct` 0.50 placeholder validation | The 0.50 cap inherited from xstock_spot module is a placeholder. Calibrate the actual right value against xStock outcome data. |
| 25-9 | xStock `pair_correlation` per-pair WR data accumulation (B68.3 calibration) | Per-pair correlation modifier needs paper-active WR data to set the right modifier coefficient. From `XSTOCK_CALIBRATION_PLAN.md`. |
| 25-10 | Crypto confidence-modifier calibration | Kyle 2026-05-27 voice flagged crypto also needs confidence-modifier calibration, not just xStock. Same family as 25-2 / 25-7, applied to crypto's existing modifier stack. |
| 25-11 | **Order-book / liquidity-aware position sizing + thin-market exit — BOTH asset classes (Kyle directive 2026-05-29)** | Build live order-book-depth into position sizing + a thin-market exit hook for xStock AND crypto. **SCOPE CHANGE 2026-05-29 (Kyle-approved):** these hooks are NO LONGER in B.1.5 — fully deferred here. Rationale: at the live portfolio (~$830, maybe →$1,330), guardrail math gives per-trade size ~$150-250, which is <1% of median overnight xStock top-of-book ($33K) and ~2% of the thin-decile ($11K) — a depth-based sizing cap **cannot bind** at this scale, so building it in B.1.5 would be dead code that never fires. B.1.5 ships the liquidity **FILTER only** (depth-based LQ + min_depth admission gate — portfolio-size-independent, the real stuck-trade screen against genuinely-dead/empty books). This Phase-25 batch builds the sizing/exit hooks when (a) paper-active outcomes exist to calibrate against and/or (b) the portfolio grows large enough (trades in the thousands) that depth actually constrains sizing — full version: depth-walking (multi-level book), MM-quote-availability prediction, hours-aware caps, regime-conditional participation rates — AND **ports the depth-aware sizing/exit to crypto** (crypto sizing/exits ignore depth today; identical gap). NOTE: B.1.5 does NOT change crypto's liquidity FILTER (crypto volume = real token volume, not broken; only the SIZING piece is the cross-asset item). Depends on B.1.5 depth-plumbing landing. Decision to port to crypto is Kyle's, evidence-backed. **BUILD-TRIGGER WATCH-ITEM (Langston 2026-05-29):** the deferral must not drift past its sell-by date — track a crossover trigger that says "build 25-11 NOW": roughly when **(per-trade sizing × max-concurrent positions) approaches ~3-5% of the p10 (thin-decile) top-of-book depth at the admission threshold**. Below that, the participation cap can't bind (dead code); at/above it, a single order could move a thin book and the cap becomes load-bearing. Re-evaluate this trigger as the portfolio grows through bands (e.g. $830 → $1,330 → $5K → $20K+). See `B_1_5_PRE_AUDIT.md` §9-§10 + MEMORY. |

**Cross-references to existing sections:** Phase 19 sub-section content at §19.0.5 / §19.0.B / §19.x / §19.1 / §19.2 / §19.3 / §19.3.5 below remains accurate but its placement under "Phase 19" stays unchanged (these are Phase 19 items per the table above). Phase 25 sub-section content at §19.0.A / §19.0.3 / §19.4 / §19.4.5 / §19.5 below also remains accurate but its phase tag moves from "Phase 19" to "Phase 25" per the table above. Cleanup pass at start of Phase 25 will renumber the section anchors if helpful.

**XSTOCK_CALIBRATION_PLAN.md cross-walk:** Phases A / B / C / D / B.6 priors / F-NOW from `XSTOCK_CALIBRATION_PLAN.md` are calibrations that DON'T need outcomes — they sit in Phase 19 (or can run pre-Phase-19 as standalone calibration batches per Kyle directive 2026-05-27, where the next batch after EXECUTION close is exactly this work). Phases E / F-LATER from the same doc DO need outcomes and sit in Phase 25.

---

### 2026-05-23 update — Phase 19 runs BEFORE Phase 16 (B-NEW-43 Phase 1 close)

**Decision (Kyle approved 2026-05-23 on joint CC + Langston advisory):** Phase 19 (active-trading-path restoration walkthrough) runs BEFORE Phase 16 (DB/legacy cleanup). The restoration walkthrough creates ground truth on what is dead vs. dormant; cleanup then acts on that ground truth instead of guessing. Infra-clean parts of Phase 16 (DB schema rationalization / column drops independent of active-trading code surface) can still front-run safely. Surfaced during B-NEW-43 Phase 1 chunk 6 audit; locked at Phase 1 close (2026-05-23, baseline frozen at 488 errors / 68 files). Source-of-truth lists: Phase 19 intake = RUNNING_ISSUES #137 + baseline-file `files[]` with `phase_tag.startsWith("Phase 19")`; Phase 16 legacy register = RUNNING_ISSUES #136.

---

### 2026-05-21 update — Pre-launch scope tightened (Kyle directive)

Four sequencing changes locked 2026-05-21 to keep the pre-launch path focused:

1. **Regime classifier confidence-chain calibration moved INTO Phase 19** (new §19.0.A). VTS and active-trading outcomes are not comparable populations — VTS opens simulated trades on every filter-survivor against every strategy in a regime family, while active trading runs SQE filtering on top. Calibrating chain modifiers against VTS conflates two different populations and produces verdicts that won't transfer to live. The B-NEW-33 / B-NEW-36 / B-NEW-37 / B-NEW-39 workstream pauses; data continues accumulating; calibration verdicts re-run against paper-active outcomes once paper-active path is healthy. B-NEW-39 phase-1 floor fix (structural correction) stays in place. B67.5 consumer-gate design also parked until paper-active calibration produces decision-grade verdicts.

2. **Crypto_perp (Phase 25 / B80) deferred to POST-LAUNCH.** Only ~10 perpetual pairs at Kraken Futures; the May 2026 xStocks universe discovery (220+ additional tokenized equities, total ~450+ Fortune 500 / NASDAQ / ETFs / index funds) gives the launch a deeply diversified pair set. Marginal universe expansion from perps doesn't justify the calendar cost pre-launch.

3. **VTS partition + Exchange-Data Adapter (Phase 19.0) deferred to POST-LAUNCH** — possibly never built. Requires solving API rate-limit budgeting across multiple alternate-source exchanges and a partitioned data storage design before the partition itself can land. Phase 19 paper-mode audit accepts the start-stop interruption to VTS data accumulation as a known cost.

4. **Daily loss-budget service + auto-trip wiring promoted to dedicated OPTIONAL Phase 19 batch (§19.0.B).** Previously buried in 19.4.5 item 9. If Phase 19 observation shows the manual kill switch + per-trade guardrails are absorbing real-world loss patterns adequately, the auto-trip wiring can ship later.

---

### 2026-05-10 update — Phase 24 (xstock_spot onboarding) CLOSED

Phase 24 (B79 + B79.TEC + B79.0a-0g + B79.0h governance retrospective) closed 2026-05-10. xstock_spot fully onboarded across 9 sub-batches + governance retrospective. **Canonical onboarding workflow** at `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` is now battle-tested through this stretch — Sections H.1.x (post-mortem) and H.1.y (updated decision rules) are the high-value content for B80 (crypto_perp / Phase 25) implementer.

**12 architectural patterns established as cross-cutting standards** for future asset class onboarding (rules 1-10 from Phase 24 close 2026-05-10; rules 11-12 added 2026-05-10 from B79.0i.b — see SYSTEM_MANUAL appendix #6-#7):
1. Per-asset-class behavioral config is the default (DB-resolved, asset_class-scoped, HARD-FAIL on missing rows)
2. Telemetry partitioning via separate-instance triad
3. Asset-class resolution is exchange-disambiguated, never canonical-form-disambiguated
4. Persistence-at-trade-open (read from row, never re-resolve)
5. Ticker collisions checked at scope time (live AssetPairs intersection + provenance + quarterly re-audit)
6. Per-symbol predicates when class is not monolithic
7. Strategy real-implementation = 6 steps (detect → dispatch → orchestrator → regime-map → thresholds → gate)
8. Namespace reservation (tokenized representations get own namespace)
9. Two parallel ablation frameworks during VTS observation (B67.0 + B73)
10. Each new asset class gets dedicated observation UI tab — **CLOSED for xstock_spot 2026-05-10 (B79.0i.b)**; outstanding for B80 (crypto_perp) and beyond. Recipe lives at `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Section M.
11. **Cross-asset-class UI component reuse via export+endpointBase prop** (B79.0i.b). Rich primary-asset components (`FilterDiagnosticsPanel`, `ExitStrategyAblationSection`, `FactorCalibrationSection`) exported with optional `endpointBase` prop whose default preserves byte-identical legacy behavior. Asset-class-specific tabs pass their own endpointBase pointing at sibling endpoints. No duplication, no behavioral drift, no risk to legacy crypto consumers.
12. **Shared aggregator parameterization via optional asset_class** (B79.0i.b). Backend aggregator functions gain optional `assetClass` parameter with default value preserving the legacy crypto-only behavior. SQL WHERE clause appends `AND asset_class = $X` only when the param is provided (or when default is a literal, the SQL is parameterized rather than hardcoded). Crypto regression invariant: any caller that omits the param gets byte-identical pre-change behavior. Verified by post-deploy curl on `/api/analytics/factor-calibration` returning unchanged `factors: 10` shape.

**Terminology standing rule (Kyle directive 2026-05-10 evening):** "VTS Observation" — never "shadow-mode" — when referring to VTS + passive learning telemetry surfaces in UI, code, governance docs, and Telegram comms.

**Phase 24 follow-ups carrying into post-Phase-24:**
- B79.0g-tx (RUNNING_ISSUES #91) — close-time atomic DELETE+INSERT through `persistRealPriceTrade` (substantial refactor; affects B73 + B70 hooks)
- **xStock Calibration Plan LOCKED 2026-05-15** (supersedes the prior B79.x placeholder + archived-data-backfill-calibration line item). Two CC sessions converged on plan structure; Langston two-round design review completed. The locked living plan lives at **`1-system-manual/XSTOCK_CALIBRATION_PLAN.md`** and is the canonical source of truth for all Phase 24 calibration follow-on work. Phases sequenced: Phase 0 corporate-actions pre-flight → Phase A DBS foundation → Phase B (7 sub-batches: regime / IMF / strategy gates / friction / max-spread / TEC priors / position sizing + sector concentration) → Phase C equity macro modifier → Phase D strategy set scope + earnings handling → Phase E factor identification + 14-day observation calibration → Phase F two-stage exit-strategy ablation calibration → Phase G cross-asset ranking parity (post-launch, reference only). Timeline 35-45 days nominal / 55-65 conservative. Picks up where `MULTI_ASSET_VTS_EXPANSION_PLAN.md` leaves off. Code starts at Phase 0 when Kyle gives green light. Full paper trail in `Claude Comms and Packages/Cross-Session Briefs/` (5 docs) + `Claude Comms and Packages/Langston Design Asks/` (4 docs).
- B79.5 — live-pricing adapter for `wss://ws-equities.kraken.com` (Phase 19 prerequisite)
- B79.6 — sector-aware portfolio cluster prevention (Stage 12.5)
- B79.x — Kraken WS-equities weekend silence investigation (RUNNING_ISSUES #89; Kraken Pro feed-tier OR REST polling fallback)
- B79.x — failure-mode taxonomy implementation (LULD halts, circuit breakers, dividends, splits, earnings) — **PARTIALLY ADDRESSED 2026-05-17 by B-NEW-42 audit + B-NEW-42b price-discontinuity-detector hotfix.** Splits, halts, and known ex-dividend dates are now structurally short-circuited at the TEC exit-decision path (stop-check + target-lock-promote) for OPEN positions. Earnings handling deferred to Phase D. Curated ex-dividend calendar (60 entries Q3+Q4 2026 for 15 div-paying symbols) at `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` is the interim posture; Phase D auto-feed (Yahoo Finance) replaces it without changing the consumer (detector reads via `entries[]` schema contract). **Entry-side gap accepted per Kyle directive 2026-05-17 (Option A):** the detector does NOT gate the scanner; new entries on a halt-resume gap or split-effected price are still possible. Live-trading prep in Phase 19 must add the entry-side counterpart (mirror-image scanner consult). VTS + paper modes treat bad entries as observation/learning signal; no real-money exposure.

**Phase 25 (B80 crypto_perp) — DEFERRED to POST-LAUNCH (Kyle directive 2026-05-21).** Originally scheduled to follow B79 as the next asset-class onboarding. Pushed to post-launch for three converging reasons: (1) the xStocks universe expanded substantially when ~220 additional tokenized equities were discovered to be feeding the system (final universe ~450+ tokenized equities — Fortune 500, NASDAQ, ETFs, index funds), giving the launch a deeply diversified pair set without needing perps; (2) Kraken Futures has only ~10 perpetual pairs, so the marginal universe gain from onboarding it pre-launch is small relative to the time cost; (3) even with the canonical onboarding workflow in hand, a clean perp onboarding (Day 0 friction extraction, funding-rate per-pair macro extension, leverage/liquidation guardrails, perpetual settlement, observation window) still consumes calendar weeks the launch path would rather spend on Phase 19 paper-mode audit. Phase 25 now sits AFTER Phase 21 live activation. The canonical workflow documentation remains valid for the eventual perp onboarding — the move is timing only, not approach.

---

### 2026-05-07 update — Multi-Asset VTS Expansion stretch (B78-B81 + B78.1)

Per Kyle directive 2026-05-07: skip Phase 16 cleanup for now and use the 8-day observational window (until 2026-05-15) for the Multi-Asset VTS Expansion stretch. Phase 16 stays parked. Living plan doc: `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md`.

**No-deferrals directive (Kyle 2026-05-07 evening):** the three structural items deferred from B78 (ws-adapter cycle break, friction extraction, filter-as-first-class) are folded into named batches — none left as orphan "address later" items.

| Batch | Status | Description |
|---|---|---|
| **B78** | SHIPPED 2026-05-07 (`de827f37b`) | Modularization scaffold. `server/asset_classes/{crypto_spot,crypto_perp,xstock_spot}/` + `server/exchanges/kraken/`. crypto_spot regime-thresholds extracted (leaf module). Aggregator scoped to crypto_spot. Madge 47→47. |
| **B78.1** | NEXT | **Cycle break only.** DI inversion of `kraken-websocket-adapter ↔ live-pricing-adapter` via event-emitter pattern. Move ws-adapter into `exchanges/kraken/` after cycle is broken. Behavioral verify required (data-feed surgery — PM2 log side-by-side diff against pre-deploy baseline). |
| **B79** | After B78.1 | Xstock_spot (Kraken XStocks Pro). **Day 0:** per-asset-class friction extraction (`asset_classes/<class>/friction.ts` populated; `cost-model.ts` consumes per-asset-class overlays via module_constants resolution hierarchy). Then xstock_spot weekend-pause logic, 3-layer threshold derivation, strategy gate audit, SQE asset-class threshold rows. |
| **B80** | **DEFERRED POST-LAUNCH (Kyle directive 2026-05-21)** | Crypto_perp (Kraken Futures). Only ~10 perpetual pairs; marginal pre-launch universe gain too small to justify the calendar cost given xStocks already provides 450+ tokenized equities. Picks up after Phase 21 live activation. |
| **B81** | After B79 (B80 no longer a prerequisite) | **Day 0:** filter-as-first-class promotion (`module_name='filter:<name>'` rows in `module_constants`; `pattern-pool-filters.ts` becomes a thin DB consumer). Then RTB ranking parity (`expectedNetReturnR` primitive, pool-relative normalization) + SQE asset-class threshold rows. Removes B78 re-export shims (RUNNING_ISSUES #73). |

This stretch is **observational** for the new asset classes — VTS-path is what gets behaviorally verified. Live-trading testing of xstock_spot / crypto_perp is Phase 19 territory (component-by-component active trading audit). Live-trading enablement is downstream of Phase 19.

**Hard fence on crypto_spot calibration through 2026-05-15** — no threshold/factor-chain/regime-classifier-math changes for crypto_spot during this window. B67.5 consumer-wiring decision opens 2026-05-15.

After this stretch closes, the regular roadmap (Phase 16 → Phase 17 → ... → Phase 21.4 Modularization formal extraction) resumes. Phase 21.4 still owns the **conceptual-module** axis (Exchange Adapter / Filter Module Family / Context Provider / Eligibility / Scoring Kernel / Threshold / Profitability / Ranking); B78-B81 establishes the **asset-class + exchange** axes only.
**Code freeze in effect**: Regime classifier (`server/core/metrics/market-regime.ts`) and DBS module (`server/core/metrics/directional-bias.ts`) are FROZEN during Phase 15b audit, EXCEPT instrumentation needed to collect evidence. No threshold or formula changes permitted until Phase 15b completes.

---

## Current State Assessment

DawnTrader is a functional paper-trading system with elite-tier backend math and runtime validation, but carrying significant technical debt:

| Dimension | State |
|-----------|-------|
| **Core Math** | Strong — FinalScore kernel, Expectancy Gate, cost-model are correct and well-tested |
| **Trading Pipeline** | Functional — MCE centralized regime/indicators, NGC replaced with deterministic confidence (Batch 13), DSS deleted (HF9), 17 canonical strategies active |
| **Risk Management** | Active — Guardrails V2, kill switch, pre-execution validator, REB diagnostics |
| **Predictive Learning** | Observational only — Predictive Adjustments, Calibration, and Regime Archive exist but cannot execute filter changes. No adjustment framework. No authority baseline. |
| **Test Coverage** | Backend math: elite. Frontend: zero. Integration: fragile. CI/CD: absent. |
| **Legacy Code** | Significantly reduced — Walter/Bob/Cortex major files deleted (Phases 12-13). ~71 legacy DB tables, residual unused API endpoints, ~40 legacy enums. 2 read-only Walter DB refs remain in routes.ts. |
| **Database** | ~160 tables (44% legacy), no retention policy, no partitioning, 10 GB limit |
| **Frontend** | Improved — 7 dead pages removed (Batch 9), Walter references reduced, regime archive debug UI cleaned (Batch 18C). Still has 91 tab sub-pages and monolithic components. |
| **Regime Model** | DBS implemented (Batch 15) with pair-level + global bias. Structural Regime rename SKIPPED (no value). 5 canonical regimes active. Friction feed deferred to Phase 11 finalization. |
| **Trading Modes** | Long-only. Short trading DEFERRED INDEFINITELY (capital constraint). Replaced by Exchange Expansion (post-launch). |
| **Machine Learning** | Not designed. Prerequisites (Feature Store, Touchpoint Matrix, Infrastructure Proposal) do not exist. |

---

## Strategic Sequencing — Why This Order

Kyle's Next Steps document (2.14.26) lists the full scope of work from current state to live trading. The original roadmap (v1) covered cleanup → MCE → VTS → live mode, but was missing several major workstreams:

1. **Directional Bias & Structural Regime rework** — Must be added to the regime model before VTS can generate meaningful signals
2. **Short trading** — Expands strategy coverage (requires Kraken confirmation)
3. **Phase 11.8B-E (Adjustment Framework)** — Defines which filters may be adjusted, with what bounds, and under what evidence
4. **Phase 11.8C (Authority Baseline)** — Establishes the authoritative baseline state, enabling bounded predictive execution
5. **Rules-based Predictive Execution** — The "Smart Thermostat" layer, allowing pre-ML adaptive filter adjustments
6. **Machine Learning Design & Implementation** — The "Plan to Create a Plan" research phase, followed by actual ML build

These items are now placed in the roadmap at their correct dependency points. The sequencing logic from v1 still holds — you can't install MCE into a contaminated pipeline, and you can't wire VTS without MCE — but the post-MCE scope is significantly larger than v1 captured.

**Revised recommended order (Kyle directive 2026-04-09)**:

Steps 1-8 are COMPLETE (Phases 12-14.7, Batches 1-54).

9. ✅ ~~Fix active pipeline contamination~~ — COMPLETE (Phase 12)
10. ✅ ~~Remove dead code~~ — COMPLETE (Phase 12)
11. ✅ ~~Unify pipeline~~ — COMPLETE (Phase 12)
12. ✅ ~~Install MCE~~ — COMPLETE (Phase 13)
13. ✅ ~~Wire VTS to real calculations~~ — COMPLETE (Phase 14.1)
14. ✅ ~~Directional Bias & Structural Regime~~ — COMPLETE (Phase 14.2)
15. ✅ ~~Dual-path pattern scanning + strategy calibration~~ — COMPLETE (Phases 14.5-14.7)

**Remaining phases (locked order, 2026-04-14):**

**Pre-Live (in order):**
1. ✅ Phase 11 Finalization — Adjustment Framework + Authority Baseline (COMPLETE, B58)
2. ✅ Phase 15a — Predictive Learning UI Audit & Data Path Fixes (COMPLETE, B59)
3. ✅ Phase 15b NEW — Regime/DBS/Strategy/Filter Restructure (B61-B62 COMPLETE, B63-B65 conditional)
4. **Phase 15c NEW — Post-B62/Pre-Launch Consolidation (Kyle locked 2026-04-18) ← NEXT**
5. Phase 16 — DB/Legacy Cleanup
6. Phase 19 — Paper Mode Full Audit & Debug
7. Phase 20 — Production Hardening
8. Phase 21 — Live Mode Activation (real Kraken orders)

**Pre-Live tracked work items — Phase 15c sequencing (updated 2026-04-22 after B63 implementation close + backtest findings):**

Full detail for all items in `Claude Comms and Packages/Scope Files/POST_B62_PRE_LAUNCH_PLAN.md`. External data inventory in `EXTERNAL_DATA_SOURCES_INVENTORY.md`.

**Done (B63 shipped 2026-04-21):**
  - ✅ Strong Bull Trend strategy (Path D, Items 1-9 of B63)
  - ✅ Counter-trend LONG guards (B63 Item 10 — mirror defect fix)
  - ✅ vwap_pullback promotion into strong-trend lane + geometry override + mode-overlay bypass (B63 Items 11/12/14)
  - ✅ Global DBS architecture fix (B63 Item 16 — persistent store + snapshot + 20-pair floor)
  - ✅ B58a Authority baseline verification (B64-lite, Section A + Sections B+C both intact)

**In flight (B63 audit track — running during observation window):**
  - **B63 Item 15** — Multi-lever adaptive framework audit (audit-only deliverable)
  - **B63 Item 18** — Full SQE audit (audit-only deliverable)
  - **B63 Item 19** — Classifier cadence / latency audit (audit-only deliverable)
  - **B63 Item 13** — vwap_pullback-in-lane decision gate (evaluated ≥ 2026-04-28)

**Queued sequence (revised 2026-04-25):**
  1. ✅ **B64 — Canonical map sync / IE metrics / residual UI alignment** — DONE (B64a + B64b shipped Apr 21-23).
  2. ✅ **B65.1–B65.4 — module_constants infra + TEC shared-service wiring + ladder trailing model** — DONE through B65.4 ship 2026-04-25. B65.3 (paper percentage-trailing → ATR TEC migration) found MOOT during B65.2 audit because paper-execution-engine no longer consumes the metadata `trailingStopPercent` path (deleted in B65.2 functional ship); residual ladder/BE/floor verification under active trading folded into Phase 19.
  3. **B65.5 — Strong Bull Pullback research (NEW 2026-04-25)** — research-only batch (no code ship). Trigger: B63 Item 13 preliminary BUILD_DEDICATED verdict on vwap_pullback in strong-trend lane (57 trades, 21.1% WR, sumR -28.99 at 2.85x min sample size). Analyze whether to build a purpose-built `strong_bull_pullback` strategy (continuation-pattern entries on high-DBS bullish pairs that pull back without reversing) OR drop pullback entries from the strong-trend lane entirely and let strong_bull_trend carry it alone. Output: scope decision document + recommendation. ~2-3 days.
  4. **B65.6 — Strong Bull Pullback build (conditional on B65.5)** — implements new strategy if research recommends BUILD; otherwise becomes a closure batch (canonical map removal + log line) if recommendation is DROP.
  5. **B66 — RETIRED.** Original scope split: SQE recalibration moved to Phase 19.4; data archiving moved to B70; drift dashboard delivered as B71 (now done). Number reserved, no work attached.
  6. **B67 — Coordinated Regime-Confidence Overhaul (REORGANIZED 2026-04-29 per master plan §0.11; original 2026-04-22 framing as "External Data Context Layer Phase 1" superseded).** Confidence-modifier architecture (Langston Option C). LIVE: B67.0 ablation framework / B67.1 macro modifier (BTC dominance + funding + mcap, deployed 2026-04-28) / B67.2 phase dimension EARLY/PRIME/LATE (deployed 2026-04-29) / B67.3 per-underlying limits (shadow). NEXT: pre-window fixes (replay logic + cron, debug B67.2 phase transition log, remove remaining `??` fallbacks, BTC/ETH funding weighting → module_constants), B67.2.1 persistence + UI (modifier + phase + regime confidence on trade records + UI tables with confidence in same column as regime label), B67.3 activation flip, **B67.4 cheap-tier bundle** (B67.4 outcome feedback + B68.4 regime-age first-class metric + B68.5 Path B sustainability tightening — 3 levers in one commit, separate ablation rows per factor). Calibration window starts AFTER cheap-tier deploys (14d). Calibration check → B67.5 wires confidence into 7 consumers if pass. **No shadow flags going forward** — confidence is decorative pre-B67.5; ablation framework collects evidence regardless. Master plan: `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0 + §0.11.
  7. **B68 — Structural Classifier Improvements (REORGANIZED 2026-04-29 per master plan §0.11; original 2026-04-22 "External Data Phase 2" deferred to a future post-Phase-16 batch slot).** Three sub-batches sequenced after B67.4 cheap-tier bundle's 14d calibration window completes; each gets its own ~14d mini-window for per-factor calibration via the existing ablation framework: **B68.2 Volume regime** (~1 week; needs volume profile infrastructure) → **B68.3 Pair correlation** (~1 week; needs cross-pair matrix; builds on `defensive-hedge.ts` BTC correlation) → **B68.1 Multi-timeframe agreement** (~2 weeks; needs higher-TF OHLC pipeline — heaviest of the three). B68.4 + B68.5 moved into B67.4 cheap-tier bundle, not part of B68 anymore. ML-light (originally Tier 8 of master plan §5.4) stays deferred to end of pre-Phase-16 batches per Kyle directive 2026-04-29. **Forward-design note (Kyle directive 2026-05-04, "Trend Mining Engine" concept):** ML-light when it ships must be designed as a CONSUMER of curated signals, not as a discovery engine. Specifically: (a) supervised classifier with explicit feature schema + label definition (predicting "is this regime classification wrong?" or "will this trade be profitable?"); (b) feature input list versioned in a registry that can grow over time; (c) training pipeline cleanly separable from inference so a future Trend Mining Engine (see Phase 17/18 notes below) can later propose new candidate features and append them to the registry without redesigning the model. Goal: ML-light is the "supervised reliability score" use case; the Trend Mining Engine is the candidate-generation use case; they're complementary and ship in different phases. Avoid coupling that makes them hard to evolve independently. Use the existing B67.0 ablation framework as the validation pipeline both engines feed into.
  8. **B69 — Asset class field + standardized schema** across all signal/trade tables. 1 batch. Prerequisite for expansion to equities/FX and for asset-class-specific external data routing.
  9. **B70 — Data archiving update** — pair-level scan + unified trade schema across VTS/Paper/Live, Option B retroactive B62 re-labeling of Mar 6 – Apr 16 VTS data. 1-2 batches. **Forward-design note (Kyle directive 2026-05-04, "Trend Mining Engine" concept):** B70 data-capture decisions must be made with the assumption that a future Trend Mining Engine (see Phase 17/18 notes below) will consume this data to propose candidate signals we never explicitly hypothesized. **Capture maximally and structure for both human + automated analysis.** Specifically: per-pair scan-state snapshots (not just OHLC) at every cycle; every signal evaluation (admit + reject) with all 30+ feature inputs; every exit decision with the full state snapshot at exit; macro feeds at the same cadence joinable by timestamp; standardized schema across asset classes (B69 already locked this in). Storage formats should be queryable by standard pattern-mining tooling (Parquet, Postgres) so tsfresh / Featuretools / Qlib / mlfinlab / custom Python can chew on it without retrofit. Design intent: when the Trend Mining Engine is built (post-launch, Phase 17/18 era), the data is already collected and structured — not requiring a backfill or re-archive batch.
  10. ✅ **B71 — Regime & Strategy Drift Dashboard tab** — DONE 2026-04-25.
  10a. **B73 — Exit-Strategy Ablation Framework (NEW 2026-04-29, Kyle directive)** — observation-only framework that records what 12 BE-stop / trailing-stop variants WOULD have done on every closed trade. No exit-behavior changes, just counterfactual recording. Triggered by 7-day data showing 509 BE_STOP trades (44%) and only 22 take-profit-target hits (2%) — pattern of long winning streaks (20-30 TPs in a row) replaced by BE-stop-streaks. Counterfactual analysis on 87 trades with `originalStopPrice` populated showed 18.4% would have hit TP first, 28.7% would have hit original SL first, 52.9% chopped — net +1.18% per trade vs ~0% with BE-stop. n=87 too small to act on; B73 builds the multi-week observation framework. 12 variants (BE-stop A-F + trailing-stop G-J + combined K-L). Selection criterion: Sharpe-like `(mean_variant_pnl − mean_baseline_pnl) / std × sqrt(n)` to penalize variance. Per-regime breakdown supported. New table `exit_strategy_alternates` parallel to B67.0's `regime_factor_alternates`. 1-min OHLC replay (matches existing replay-ablation.ts pattern). Trailing-stop replay uses simplified state machine (peak_price + trail_level + parameterized ATR multiplier); moonbag/ladder replay deferred to v2. Runs in parallel with B67 calibration window — zero contamination since exits are unchanged. Langston-approved cc-inbox #859 + #860. Scope: `BATCH_73_SCOPE.md` (drafted 2026-04-29).
  10b. **B74 — Equity Passive Data Collection (NEW 2026-04-29, Kyle directive)** — start scanning + storing Kraken X-stocks (tokenized equities) + stock perp futures NOW so we have weeks/months of OHLC by the time Phase 21.5 (equity expansion, post-live) lands. Minimal scope per Kyle: scan + store, no schemas/processing/cohorting. New service file (NOT FX5 extension — coupling-blast risk per Langston cc-inbox #859). Plain dump tables `xstock_ohlc_raw` and `stock_perp_ohlc_raw` with minimal columns (pair, timestamp, OHLCV). No regime classification, no signal routing, no UI. Verify Kraken pair count in pre-audit before committing scan cadence (likely 50-100 X-stocks + handful of perps per Langston, but verify). Continuous polling, append-only writes. Loud `[EQUITY-SCAN]` PM2 logging. Runs in parallel with B73 + B67 calibration. Langston-approved cc-inbox #859 + #860. Scope: `BATCH_74_SCOPE.md` (TBD).
  11. **B65.6 — Per-pair regime classifier audit + sustainability gate (ACTIVE 2026-04-26, scope drafted)** — Promoted from the originally-queued B72 slot per Kyle directive 2026-04-26 to continue this line of work NOW.
  12. ✅ **B72 — Comprehensive lever-to-`module_constants` sweep — SHIPPED 2026-05-05.** 14 commits + 4 hotfixes. **34 modules / ~163 levers live in production sync-read paths.** 293 module_constants + 28 screener_filters rows in `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` (auto-generated via `server/scripts/dump-settings-registry.ts`). Sync-read API in `module-constants-service.ts`: `prefetchModule()`, `getCachedConstant<T>()`, `getCachedNumberRequired()`, `getCachedNumbersForModule()` (bulk), 60s background refresher. Boot hard-fail discipline in `server/startup/b72-warmup.ts` (PREFETCH_MODULES list). All 9 strategy files migrated to bulk-read pattern. SQE 3-layer precedence (`screener_filters → sqe_config → static mirror`). net-expectancy-kernel pure-math contract preserved via caller-injection refactor. DBS routing guards group migration with mutual-consistency integration test. Three post-deploy hotfixes (BUG-2026-05-05-E/F/G) for warmup ordering + missed const refs in `vts-runner` + `expectancy.ts` — all RESOLVED. **B72 main CLOSED.** Completion report: `Claude Comms and Packages/Batch Completion/BATCH_72_COMPLETION_REPORT.md`. Langston sign-offs: cc-inbox #903/#904/#906/#908/#909/#910/#911. **B72.1 carry-over** (non-blocking, rows seeded but source-side wiring deferred — each needs different pattern than `getCachedNumberRequired`): adaptive-manager / risk-concentration singleton-init refactors; strategy-modes confidence-floor naming reseed; pre-execution-validator goal_alignment + strategy_profiles atomic block; trade-safety guardrail_defaults; 17-vs-9 strategy reconciliation pass.

  12-original-text. **B72 — Comprehensive lever-to-`module_constants` sweep (pre-launch, Kyle directive 2026-04-26)** — runs as the FINAL pre-Phase-19 batch so it can sweep any new constants introduced by B65.6 / B67 / B68 / B69 / B70 along with the original Item 15 inventory. Comprehensive sweep of all hardcoded levers in the active codebase, migrate each to `module_constants` table with proper most-specific-wins resolution scope (regime / strategy / asset_class / exchange). Original intention from go-live design: every threshold, weight, multiplier, and limit must be DB-tunable before live trading so operators can adjust without code redeploy. Inline migration for B65.6 / B66 / B67 / etc. continues — B72 is the comprehensive backstop sweep, not a license to defer. Output sub-deliverable: `LEVER_INVENTORY.md` listing every promotable constant with current location, candidate module, candidate resolution scope, current value, and migration risk rating. **Phase 21.4 Modularization (post-live) keeps the 8-module architectural extraction work; the lever-migration sub-phase moves to B72 pre-launch.** — focused audit of `server/core/metrics/market-regime.ts` triggered by `REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md`. The TFS branch fires when `(mom > 0.003 AND ADX > 50) OR |DBS| >= 0.30 (alone)` — the second-path sole `|DBS| >= 0.30` trigger over-classifies pairs as TFS on strong-direction days, producing the 04-22 inversion (195 TFS-classified pairs at 13.8% WR while 6 STRUCTURAL_TRANSITION-classified pairs had 83.3% WR). Threshold was tuned for flicker stability (2% ceiling), not outcome alignment. Scope: (a) test whether requiring an additional non-lagging confirmation (ADX > 35, momentum > 0.002, volume ratio > 1.2) on the |DBS|-alone path improves outcome alignment without breaching flicker ceiling; (b) re-tune 0.30 threshold for outcome alignment with smoothing as a separate downstream layer; (c) evaluate confidence-decay for stale-DBS readings (exhausted-trend vs fresh-trend). Research-then-design batch — analysis first, code only if recommendations validate. ~1-2 weeks. Independent of B65.5 (which closed via SKIP). Verified live in Analytics & Diagnostics → Drift Dashboard tab: Rolling 24h/7d/30d/Since-last-restart toggles, summary cards, regime distribution, B62-style regime integrity, DBS category distribution, Global DBS live snapshot.

**Storage budget:** ~40 GB/year gzipped (pair scan + OHLC + trades + MCE telemetry combined, pre-external-data; B67+B68 add minimal additional storage). Fits current Hetzner CPX22 disk with ~18 months runway.

**ML prep only** — model work itself deferred to post-launch Phase 17/18.
- **Archive minimum-viable capture** — SUPERSEDED by the 2026-04-18 post-B62 plan above. The MVP capture is replaced by the full capture plan (all pair data + all trade data + OHLC references).
- **Paper trading pipeline readiness** — verify the full paper pipeline works under the new math, new filters, and dual-path (quant + pattern) end-to-end. Folded into Phase 19. **DEPENDS ON Phase 15c item 5** (standardized schema must be in place before paper mode activates, otherwise paper trades lose DBS/friction context).
- **Live trading pipeline readiness** — verify the live execution pipeline is sound. May require rebuild from paper if structural divergence is found. Folded into Phase 20 + Phase 21 kickoff.

**Post-Live (in order):**
8. Phase 21.5 — Exchange Expansion (XStocks + Perpetual Futures from Kraken)
9. Phase 17 — Machine Learning Design
10. Phase 18 — Machine Learning Implementation (ML Adaptive Intelligence Layer)
11. Phase 17.5 (formerly Phase 15b) — Smart Thermostat / Rules-Based Predictive Execution (DEFERRED here from pre-live 2026-04-14)
12. Phase 22 — Publication & Monitoring

**Post-Live tracked work items (additional backlog, to be slotted into post-live phases):**
- **Predictive learning full teardown** — remove the cosmetic predictive learning services that B59 labeled as placeholders. Deferred because services are inert, not actively harming.
- **UI redesign** — Predictive Adjustments tab redesign, Events tab redesign as a news-report-style feed, broader UI cleanup.
- **Modular filter/strategy architecture** — refactor SQE/RTB/strategy filter layer into pluggable modular architecture so new strategies and filters can be added without touching core orchestration.
- **`liquidity_trap` strategy redesign** — current implementation flagged for redesign post-live.
- **`THREE_SOLDIERS` legacy cleanup** — remove residual legacy code paths around the THREE_SOLDIERS pattern after the new dual-path canonicalization is live.
- **X-stocks / perpetual futures integration** — covered by Phase 21.5 above.
- **ML Adaptive Intelligence Layer** — covered by Phases 17, 18 above.
- **VTS always-on** — only adopted if the effort is genuinely simple AFTER Kraken rate-limit research confirms it does not blow the API budget. Conditional, not committed.

**Key 2026-04-14 decisions:**
- B60 Smart Thermostat removed from pre-live and renumbered post-live. Reason: cannot tune adaptive policy on top of a misclassified state model.
- All DBS + regime + strategy + filter restructure work consolidated into a single pre-live phase (15b), NOT split across pre-live and post-live.
- Predictive learning service teardown also deferred to post-live (services are inert, not actively harming).
- Pre-live and post-live tracked work items above are now part of the locked roadmap.


### Batch Approach

All phases use a **mega-batch approach**: one scope document → one code batch → one governance batch per phase. Sub-batches within a phase are avoided unless the phase is genuinely too large. This reduces coordination overhead and ensures each batch is a complete, self-contained unit of work.

The batch sequence for each phase is:
1. **Scope document** — write `BATCH_N_SCOPE.md` to `Claude Comms and Packages/Scope Files/`
2. **Pre-implementation audit** — read every source file, verify all assumptions
3. **Kyle approval** — scope must be approved before code is written
4. **Code batch** (Batch N) — modified files + INSTRUCTIONS.md + README.md → zip → Replit applies → push
5. **Governance batch** (Batch NB) — documentation updates → zip → Replit applies → push
---

## Phase 12: Cleanup & Foundation (Weeks 1-6) — ✅ COMPLETE

**Goal**: Fix critical math errors, harden security, remove all dead code, and unify the active trading pipeline. Creates the clean foundation that everything else depends on.

**Why this is Phase 12**: Phase 11 is still open (11.8B-E and 11.8C remain), but those require MCE + VTS + real data to complete. Phase 12 is independent pre-work that unblocks everything downstream.

### 12.1 Critical Math & Security Fixes (Weeks 1-2)

#### 12.1.1 Fix DI Probability Divergence (BUG-004) — PRE-MCE CRITICAL
- Replace `DI = normalizedConf * 100` (line 1128, signal-orchestrator.ts) with `calculateDirectionalIntegrity(prices)`
- This is a direct math error: the kernel computes Pwin from NGC instead of price geometry
- **Standalone fix, no dependencies**

#### 12.1.2 Fix Dual Friction Models (RISK-009) — PRE-MCE
- Replace `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` (flat 0.5%) with `computeTotalRoundTripCost()` from cost-model.ts
- Affects: signal-orchestrator.ts line 1122, analysis-utils.ts `calculateFriction()`

#### 12.1.3 Security Hardening (RISK-049, RISK-050, RISK-051)
- Remove hardcoded JWT fallback secrets from 9 files — fail hard if `JWT_SECRET` undefined
- Remove `x-internal-audit` header bypass from 4 files
- Fix `regime-archive.ts` JWT secret inconsistency

#### 12.1.4 Remove Simulated Price Display (BUG-020)
- Replace `entryPrice * 1.02` in active-trades.tsx with real price feed

#### 12.1.5 RiskManager Class Cleanup (RISK-084)
- Remove deprecated RiskManager class from 12 import locations across 7 files
- Already replaced by `checkGuardrailRisk()` from `trade-safety.ts`

#### 12.1.6 LSP Error Triage (RISK-085)
- Address critical ~620 TypeScript LSP errors
- Priority: routes.ts (211 errors), storage.ts (66 errors), then null/undefined issues

### 12.2 Dead Code Purge — Waves 1-4.7 (Weeks 2-4)

**Kyle's legacy removal policy**: "Get rid of everything in a way that it can never be accidentally pulled back in." All removals are permanent deletions, not comments.

#### 12.2.1 Wave 1: Safe Deletions (EASY)
- LATTi files (~12 files)
- Strategy Presets files
- Goals ML Engine files
- DHMA Tuning Service files
- Unused SQE threshold exports
- Legacy interface fields in SizedStrategySignal

#### 12.2.2 Wave 1.5: MarketScanner Class Removal (MODERATE)
- Stop instantiating MarketScanner class in routes.ts and startup.ts
- Preserve `collectAdaptiveBatch()` function and REB diagnostic exports

#### 12.2.3 Wave 3: Walter/Bob/Cortex Ecosystem (MODERATE — largest batch, ~96 files)
- All walter-*.ts, bob-*.ts, bobs/*.ts files
- Cortex system (6 files, 4 API endpoints, 9+ consuming services)
- Walter/Bob API routes (~20+ endpoints)
- Walter middleware (bob-routing.ts, chat-logging.ts)
- Phase 8.6.5 route file, provenance-debug.ts
- Walter-related test files

#### 12.2.4 Wave 3.1: Frontend Walter Cleanup
- Remove walter.tsx page, walter-floating-assistant.tsx component
- Remove Walter Approvals tab from settings.tsx
- Remove Walter Activity tab from enhanced-system-monitoring.tsx
- Remove Walter log categories from ai-transparency.tsx
- Remove useWalterPreferences.tsx hook
- Clean Walter notification bell from top-bar.tsx
- Fix BUG-022 (duplicate "learning" tab value)

#### 12.2.5 Wave 4: Friction Model Unification
- Replace all `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` with cost-model calls
- Remove `calculateFriction()` family from analysis-utils.ts

#### 12.2.6 Wave 4.5: Goal Alignment Removal
- Delete from pre-execution-validator.ts and trading-engine.ts
- Remove all goal-related references (daily targets, weekly targets, win rate targets)
- System becomes a two-gate pre-execution validator

#### 12.2.7 Wave 4.7: NLAI System Removal
- Remove 5 NLAI files + related routes and event handlers

#### 12.2.8 Wave 8: Walter-Era Learning Services (5+ files)
- Remove continuous-learning.ts, learning-cycle-service.ts, learning-coordinator.ts, learning-bridge.ts, learning-gate-validator.ts
- Remove unmounted learning.ts route file
- Remove learning-bob.ts and phase-8.6.5-enhancements.ts

#### 12.2.9 Wave 9: Frontend Dead Code
- Delete 7 dead pages (2,771 lines)
- Delete dead hook (use-biometric-auth.ts)
- Remove dead imports and variables
- Clean 123 console.log statements

**Expected outcome**: ~200+ files removed. Codebase reduced by roughly 25-30%.

### 12.3 Pipeline Unification — Wave 2 (Weeks 4-6)

#### 12.3.1 Regime Authority Resolution (BUG-006, BUG-008)
- Rewire DSS to call `calculatePairRegime()` — unify regime classification
- Replace `SYSTEM_GUARDS.STRATEGY_MAP` with `CANONICAL_REGIME_STRATEGY_MAP`

#### 12.3.2 Strategy Routing Expansion
- Use `selectContextAwareStrategy()` for pattern-aware routing
- Replace legacy hybrid types (H1-H4) with canonical definitions
- Update strategy-sync.ts to include all 17 canonical strategies
- Initialize drift detector baselines for 8 new strategies

#### 12.3.3 Confidence Authority Cleanup (Wave 5 partial)
- NGC still flows as confidence carrier — replace with interim deterministic confidence
- Remove NGC-to-DI conversion (already fixed in 12.1.1)
- Remove quality_index.ts NGC computation
- Remove rolling normalization infrastructure

**Expected outcome**: Clean, unified trading pipeline. One regime engine, one strategy map, one confidence source. Ready for MCE.

---

## Phase 13: MCE Installation (Weeks 6-10) — ✅ COMPLETE

**Goal**: Install the Market Calculation Engine (Counsel/Group Think) as the authoritative data provider for the trading pipeline.

> **Completed**: 2026-03-04 (Batch 14 code + Batch 14-hotfix + Batch 14B governance)
> **Actual scope**: MCE core build + pipeline integration + full L12-L20 removal (originally planned for Phase 16, pulled forward). PredictiveConfidence DEFERRED to a future batch.
> **Bugs/risks resolved**: BUG-002, BUG-003, BUG-008, RISK-002, RISK-016, RISK-019, RISK-020
> **Net result**: ~8,200 lines removed, 29 legacy files deleted, 59 API endpoints removed, strategy_type enum expanded 9→18

### 13.1 MCE Core Build
- MCE becomes the single source of truth for market data, indicators, and regime classification
- All indicator computations (VWAP, SMA, RSI, etc.) centralized in MCE
- MCE calculates indicators AND regime per cycle
- Regime classification from `calculatePairRegime()` absorbed into MCE

### 13.2 Pipeline Integration
- Signal Orchestrator consumes MCE output instead of computing indicators independently
- Strategy Engine receives indicators from MCE
- Cost model receives spread/slippage data from MCE
- Telemetry fed from MCE cycle data

### 13.3 PredictiveConfidence Introduction
- PredictiveConfidence becomes sole confidence authority
- Replaces interim confidence from Phase 12.3.3
- Deterministic, strategy-specific confidence modeling

**Expected outcome**: MCE is the authoritative data provider. Single source of truth for all market calculations and regime classification.

---

## Phase 14: VTS Real Calculations & Signal Model Enrichment (Weeks 10-16)

**Goal**: Replace VTS simulation stubs with real strategy-specific calculations, add Directional Bias to the regime model, add Short trading capability, and clear/backfill VTS data. This is the "make the signals real" phase.

### 14.1 Strategy-Specific VTS (BUG-001, RISK-043) — Weeks 10-12 — IN PROGRESS

> **Status**: COMPLETE (Batches 15-18, HF6-HF9). VTS wired to real detect functions. DSS fully deleted. IMF filters relaxed for VTS. OHLC cache. 300 pairs. Governance gate centralized to SQE. All 9 QUANT strategies producing trades. Pattern/hybrid strategies structurally unable to fire — requires Phase 14.5.
>
> **Commits**: Batch 15 through HF7 `64014bd2`
>
> **Remaining 14.1 work** (HF8-HF9):
> 1. Analytics tab: wire `/api/regime-map` to replace hardcoded mapping table in analytics.tsx
> 2. Governance gate into SQE: move trade quality check and confidence floor from paper-execution-engine into SQE so VTS and active trading share same qualification
> 3. TCL duplicate FinalScore check: remove duplicate FinalScore > 0.35 from c13-validation-service.ts
> 4. DSS pre-selector: change DSS from post-filter to pre-selector in dynamic-strategy-selector.ts
> 5. Secondary metrics: make secondaryMetrics fields programmatically evaluable instead of display-only strings
> 6. Return type fix: fix getOpenVirtualTradesForML() return type declaration
> 7. Increase VTS OHLC fetch 50 to 100 candles (adaptive_flow needs 65, support_bounce needs 50)
> 8. Provide BTC candles to VTS for defensive_hedge (currently always returns null in simulation)

- Each of 17 strategies gets unique entry logic, stop logic, target logic, and confidence modeling
- Kyle: "Each strategy must have unique entry logic, unique stop logic, unique target logic, unique confidence modeling"
- Replace `simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()` with real calculations
- VTS consumes MCE indicators for realistic strategy evaluation
- VTS calculates signals for all strategies for the calculated regime
- Ensure FinalScore, Hybrid Score, Confidence, Regime Weight, etc. are being calculated in VTS and fed into predictive learning

### 14.1B VTS/Orchestrator Timeframe Alignment — NEW

The VTS uses 15-minute candles and the signal orchestrator uses 60-minute candles. This means the same pair at the same moment gets different regime classifications from each system. If VTS learns on 15-min conditions and active trading executes on 60-min conditions, the ML learning may not transfer accurately. Must be resolved before Phase 14.4 (VTS Data Clear and Backfill).

### 14.5 Parallel Pattern Scanning + Signal Ranking Overhaul + Global Regime Pre-Filter — NEXT (Block 3, Batch 19)

**Goal**: With $834 portfolio and ~4-5 open trade slots, ensure the RTB queue always has the best possible opportunities at the top. Achieved through three integrated changes:

**Guiding principle**: The bottleneck is not signal generation speed — it's signal quality at the top of the RTB queue.

#### 14.5.1 Dual-Path Pattern Scanning
Pattern and hybrid strategies are structurally unable to fire in the current architecture. The quant-oriented filtering pipeline (min volume $1M, RSI 30-70, volatility 0.5-5%) eliminates pairs before pattern detection runs.

**Design**: FX5 scanner outputs two pools:
- **Quant pool** (existing filters): Available to ALL strategies (quant + pattern + hybrid)
- **Pattern pool** (new looser filters: $250K volume, RSI 15-85, wider volatility, maxVolNoise 0.7): Available to PATTERN + HYBRID strategies only

Signal orchestrator evaluates both pools (confirmed strategy-agnostic — doesn't care about signal type). Both pools feed into the same RTB queue. Pattern-pool signals tagged `sourcePool: 'pattern'` for telemetry.

**Pattern-specific risk guardrails**: Elevated FinalScore threshold (0.45 vs 0.35 for quant), tighter position sizing (15% max vs 25%). Pattern signals must be BETTER than quant signals to execute, not just equal.

**VTS integration**: VTS gets same dual-path scanning for ML training data across all strategy types.

**UI**: New Pattern Scanning tab in Trading page showing pattern filter process.

#### 14.5.2 Expected Return Magnitude in Signal Ranking
New composite `rankingScore` for RTB queue ordering:
```
rankingScore = (FinalScore x QUALITY_WEIGHT) + (returnMagnitude x RETURN_WEIGHT)
```
- SQE gating stays on FinalScore alone (0.35 minimum, non-negotiable quality floor)
- rankingScore used ONLY for RTB queue ordering
- returnMagnitude is net-of-fees, normalized (5% net = 1.0 ceiling)
- Weights are regime-conditional (RANGE_BOUND: 0.10, IMPULSE_EXPANSION: 0.20, default: 0.15)
- Safety rule: FinalScore gap > 0.10 → FinalScore always wins. Gap < 0.05 → higher returnMagnitude wins.
- Solves the "apples to apples" problem: quant and pattern signals compared on same composite score

#### 14.5.3 Global Regime Pre-Filter (small effort, bundled)
New `GlobalRegimeService` (~150 lines): BTC regime snapshot + scan hints on 60-second cache. FX5 adjusts filter parameters per global regime. Signal orchestrator skips regime-inappropriate strategy types. No new Kraken API calls. Reduces pipeline noise by 30-50%.

### 14.2 Directional Bias & Structural Regime Rework — Weeks 12-14 — EFFECTIVELY COMPLETE

> **Status**: DBS (Directional Bias Score) implemented in Batch 15 — pair-level + global bias calculation, DBS confidence modifier applied to trade scoring, 6 context dimensions captured at trade OPEN. Kyle decisions (2026-03-08): Skip regime→structural regime rename (no value). Skip DBS backfill into VTS signals (unnecessary). Skip Global Structural Regime feature (low incremental value). No further work needed.

~~This is a significant enrichment of the regime model. The current system classifies regime but has no concept of directional bias or the distinction between global and pair-level structural regime.~~

#### 14.2.1 Rename & Restructure: "Regime" → "Structural Regime"
- Rename regime classification throughout the codebase
- Change frontend labels, API responses, and database fields from "Regime" to "Structural Regime"

#### 14.2.2 Add Directional Bias
- Implement Directional Bias calculation (Global and Pair-level)
- Directional Bias should be factored into strategy selection and mapping
- Backfill VTS simulated signals with Directional Bias
- Add to regime-strategy mapping as a selection factor

#### 14.2.3 Global vs Pair-Level Dimensions
- Implement both Global and Pair-level for:
  - Structural Regime
  - Directional Bias
  - Friction
- All three dimensions at both levels should feed into predictive learning for correlation, trend analysis, and possible relationships with trade success outcomes

> **Note**: Kyle has an existing Word document with detailed steps for this work. That document should be referenced when this phase begins.

### 14.3 Short Trading — DEFERRED INDEFINITELY
> Requires significant capital not currently available. Replaced on roadmap by Exchange Expansion (post-launch): adding an exchange supporting stocks/ETFs/tokenized assets/futures to expand tradeable asset classes with limited portfolio.

#### 14.3.1 Kraken Confirmation
- Confirm Kraken allows short trading on target pairs
- Identify any API differences for short orders vs long orders

#### 14.3.2 Short Strategy Implementation
- Add short trading ability to Trading Engine
- Add short strategies to VTS signal generation
- Update strategy-signal pipeline to support short signals
- Update risk management / guardrails for short positions (different risk profile)

> **Note**: Kyle has an existing Word document with detailed steps for short trading implementation. That document should be referenced when this phase begins.

### 14.4 VTS Data Clear & Backfill — CANCELED
> Kyle decision 2026-03-08. VTS data will not be cleared/backfilled.

#### 14.4.1 Clear Simulated Data
- Clear all simulated trading results data/learning from VTS simulations
- Kyle note: "Some of the VTS data is still useful — see if correct calculations can be generated to backfill existing data"
- Audit VTS data to determine what can be salvaged vs what must be regenerated

#### 14.4.2 Backfill with Real Calculations
- Run VTS with real strategy calculations against historical data
- Backfill VTS signals with Directional Bias data
- Calibrate strategy parameters using actual performance data
- Initialize adaptive learning weights from real performance
- Verify FinalScore, Hybrid Score, Confidence, Regime Weight are flowing correctly

**Expected outcome**: VTS produces real, strategy-specific signals enriched with Directional Bias and Structural Regime. Short strategies available. Simulated data replaced with real calculations.

---

## Phase 11 Finalization: 11.8B-E & 11.8C (Weeks 16-18)

**Goal**: Complete the remaining Phase 11 work — the Adjustment Framework and Authority Baseline. These were deferred because they require MCE + real VTS calculations to be meaningful.

**Why this comes after Phase 14**: The Adjustment Framework (11.8B-E) defines which filters may be adjusted and with what bounds. The Authority Baseline (11.8C) establishes the authoritative baseline state. Both require the system to be producing real data (MCE indicators, real VTS signals, Directional Bias) before the framework and baseline can be defined against reality rather than simulated data.

### 11.8B-E: Adjustment Framework (Week 16-17)

This is the "decision constitution" — it answers: What may be adjusted? Under what evidence? With what bounds? At what cadence? With what safety guarantees?

#### What 11.8B-E Defines:
- **Which filters may be adjusted**: Enumerate every adjustable parameter (e.g., minVolume, FinalScore threshold, confidence floors, regime thresholds)
- **Adjustment types**: Small, bounded, reversible, slow-moving
- **Evidence requirements**: What data must exist before an adjustment is allowed (minimum trades, minimum time window, statistical significance)
- **Cadence rules**: How often adjustments can change (prevent jitter)
- **Safety guarantees**: Maximum adjustment magnitude, mandatory reversion if outcomes degrade, audit trail requirements
- **Explicit statement**: "Predictive learning may execute bounded, rules-based filter adjustments once baseline authority (11.8C) is established, without requiring machine learning."

#### What 11.8B-E Explicitly Includes:
- A slot for executable, rules-based policies (not just observational)
- A distinction between policy definition and policy execution
- The three-layer learning stack model:
  - **Predictive Adjustments** (micro, fast) — pattern-level confidence tuning
  - **Learning Calibration** (medium, batch) — structural strategy/regime learning
  - **Regime Archive** (long-horizon) — historical memory, audit trail

### 11.8C: Authority Baseline (Week 17-18)

This is the authoritative "Version 1.0" of the system's learned knowledge, established against real MCE data and real VTS calculations.

#### What 11.8C Establishes:
- The single, authoritative baseline state for all adjustable parameters
- Canonical weights for every strategy × regime combination (based on real data, not simulation)
- Baseline confidence expectations per strategy
- Baseline filter thresholds
- The "known-good" state that all future adjustments are measured against
- Checkpoint that can be rolled back to if learning degrades

#### After 11.8C:
- Bounded, rules-based predictive execution is UNLOCKED
- Controlled systems may make bounded adjustments relative to the baseline
- Authority can be exercised by: a human, a rules engine, a predictive system, or eventually ML
- **Phase 11 is officially CLOSED**

**Expected outcome**: Adjustment Framework defined. Authority Baseline established against real data. Phase 11 closed. Rules-based predictive execution unlocked.

---

## Phase 15a: Predictive Learning UI Audit & Data Path Fixes — ✅ COMPLETE (B59)

**Status**: DEPLOYED. Predictive learning data path fixes shipped. Regime Archive verification pending next telemetry cycle.

**Key outcome**: Discovered three broken data paths in predictive learning UI (telemetry aggregator never running, hardcoded weight defaults, dropped Phase-10 metrics in VTS getRecentTrades). Fixed all three. Discovered predictive learning services are largely cosmetic — they record but cannot execute filter changes. Discovered DBS is fully implemented but ORPHANED (computed every MCE cycle but consumed nowhere — not in classifier, not in strategy gates, not in SQE/RTB/TEC). DBS discovery triggered Phase 15b restructure.

---

## Phase 15b: Regime / DBS / Strategy / Filter Restructure (B61-B65) — LOCKED 2026-04-14

**Goal**: Audit and restructure the regime classifier, DBS integration, strategy-regime mapping, and filter layer as a single coherent change. Replaces the old Phase 15b (Smart Thermostat / B60), which has been DEFERRED to post-live.

**Source documents**:
- `Claude Comms and Packages/Design Discussions/REGIME_DBS_STRATEGY_AUDIT_SCOPE_2026-04-14.md` (audit scope)
- `Claude Comms and Packages/Design Discussions/PHASE_15B_REGIME_DBS_STRATEGY_FILTER_RESTRUCTURE_ROADMAP_2026-04-14.md` (roadmap lock)

**Why this exists**: A B59 investigation into range_trade's 76% loss rate exposed three layered problems:
1. Regime classifier labels 54.5% of pairs as `RANGE_BOUND_STABLE` based on vol+ADX thresholds with NO directional drift check, while only 8% of pairs actually have neutral momentum. The other ~47% are drift-contaminated false ranges.
2. DBS exists fully implemented (`server/core/metrics/directional-bias.ts`) but is orphaned — never consumed by classifier, strategy gates, filters, or any decision layer.
3. 7 of 17 strategies are dormant (zero trades over a 7-day window). 4 are starved by regime scarcity (`IMPULSE_EXPANSION` only 2.4%). 3 have detection logic too strict for current conditions.

These are not independent bugs. They are downstream symptoms of a regime taxonomy that does not match the market state. Patching the classifier without auditing DBS, filters, and strategy mapping would produce more breakage. Hence: structural audit, not patch.

**Decisions locked 2026-04-14 (three-way consensus):**
1. B60 Smart Thermostat → DEFERRED to post-live (renumbered to Phase 17.5 below). Cannot tune adaptive policy on top of a misclassified state model.
2. Predictive learning service teardown → DEFERRED to post-live. Services are inert, not actively harming.
3. DBS + regime + strategy + filter restructure → consolidated into THIS phase. Strategies and filters are NOT split off to post-live — they are downstream of the regime taxonomy and must move with it.
4. Filters explicitly in scope (entry gates, Net_EV thresholds, RTB rankingScore, TEC exits — wherever DBS could become first-class).
5. **Regime/DBS code FROZEN during audit** except instrumentation needed to collect evidence. No threshold or formula changes permitted until Phase 15b completes.
6. B58 Adjustment Framework + Authority Baseline remain in force for any change made during this phase.
7. Both sessions reset BEFORE B61 begins. Audit will not start in current stretched contexts.
8. Sub-Phase D core proof is BLOCKING for go-live. Full per-strategy/per-bucket optimization matrix is NON-blocking and may defer post-live.

### Sub-Phase A — DBS Validation (B61) [BLOCKING]
**Owner**: Claude Code (A.1, A.2, A.4) + Langston (A.3)
- A.1 Formula review: validate `0.40×slope + 0.35×return + 0.25×EMA_alignment` weights, ATR normalization, edge cases (CC)
- A.2 Threshold review: validate `UP_STRONG ≥ 0.60`, `UP_MODERATE ≥ 0.30`, `NEUTRAL ±0.10` against actual live distribution. Consider rolling-percentile thresholds. (CC)
- A.3 Global DBS methodology: validate weighted-median-by-volume approach. Cross-reference industry standards (Crypto Fear & Greed, BTC dominance, aggregate altcoin momentum). (Langston)
- A.4 Data quality: stability across MCE cycles, latency, edge cases (thin volume, gaps, reporting pauses). (CC)
- **Deliverable**: DBS Validation Report

### Sub-Phase B — Regime Taxonomy Redesign (B62) [BLOCKING]
**Owner**: Claude Code (B.1-B.3) + Langston (B.4)
- B.1 Regime definition review of all 5 current regimes. Identify gaps. (CC)
- B.2 Classifier redesign with DBS as primary input + 30+ day historical validation. (CC)
- B.3 Strategy-regime alignment validation against canonical map. (CC)
- B.4 Missing regimes evaluation: should we add `LOW_VOL_UPTREND`, `LOW_VOL_DOWNTREND`, `CHOPPY_NO_BIAS`, `TRUE_RANGE`? High burden — only add if behaviorally distinct AND decision-relevant. (Langston)
- **Validation gate**: Must improve downstream trade-selection economics, not just classification accuracy (Langston's recommendation).
- **Deliverable**: Regime Taxonomy & Classifier Redesign Document

### Sub-Phase C — DBS Integration Inventory (folded into B63) [INVENTORY ONLY]
**Owner**: Langston (conceptual review) + Claude Code (codebase mapping)

Per Langston's directive: this is design inventory + opportunity mapping, NOT a parallel implementation agenda. Prevents "redesign-by-enthusiasm" sprawl.

- C.1 `biasConfidenceModifier` application (already defined but never imported)
- C.2 Net_EV gate enhancement — DBS-aware bullish vs bearish thresholds?
- C.3 Position sizing within risk limits
- C.4 TP/SL ratios in trending vs neutral markets
- C.5 Entry filter — reject signals opposing global DBS during extreme conditions?
- C.6 RTB rankingScore — DBS alignment boost?
- C.7 TEC early-exit on DBS flip while trade is open
- C.8 Events feed — show DBS transitions as observable events
- **Decision gate**: Three-way consensus on which items are pulled into Sub-Phase E for pre-live implementation. Items not selected become post-live work items.
- **Deliverable**: DBS Integration Priority Matrix

### Sub-Phase D — Strategy Re-Audit Under New Classifier (B63) [Core BLOCKING, full matrix non-blocking]
**Owner**: Claude Code (data) + Langston (review)

**Core proof (BLOCKING for go-live):**
- D.1 Does the new classifier materially reduce range_trade false-range bleeding?
- D.2 Do the 7 currently dormant strategies receive legitimate opportunity flow?
- D.3 Do downstream trade-selection economics improve, not just classification accuracy?

**Full matrix (NON-BLOCKING — may defer post-live):**
- D.4 Per-strategy, per-regime, per-DBS-bucket performance matrix
- D.5 Strategy-level DBS integration recommendations

- **Deliverable**: Strategy Performance Under New Regime Classifier — empirical report

### Sub-Phase E — Restructure Implementation (B64 + B65) [CONDITIONAL on Audit Findings]
**Owner**: Claude Code (implementation) + Langston (code review)

**Implementation is NOT pre-committed.** B64 and B65 implement ONLY the changes that:
1. Are supported by the evidence collected in Sub-Phases A, B, C, D, AND
2. Have received explicit three-way approval as part of the chosen pre-live subset.

If the audit concludes no pre-live changes are warranted, Sub-Phase E may collapse to a no-op (or instrumentation-only) and Phase 15b closes with the audit deliverables alone.

- B64: E.1-E.3 — Classifier + canonical map deployment (IF approved)
- B65: E.4 — Filter/strategy/DBS integration items in approved pre-live subset (IF approved)
- E.5 — VTS data migration plan: does old VTS data need replay under new classifier before strategy decisions? (IF E.1-E.3 execute)

### Pre-Audit Lock-In Checklist (11 items, before B61 kickoff)

**Governance & Roadmap Updates (current session, before reset):**
1. Three-way written approval of Phase 15b roadmap (Kyle + CC + Langston)
2. POST_AUDIT_ROADMAP.md updated (this section)
3. CCPI updated with Phase 15b context, freeze policy, B61-B65 batch sequence
4. BATCH_CATALOG.md updated with B61-B65 placeholders
5. PHASE_HISTORY.md updated with Phase 15a closure + Phase 15b open
6. MEMORY.md updated with audit context block
7. Langston governance updated (SOUL.md, MEMORY.md, BOOTSTRAP.md) with full audit context
8. Regime/DBS code freeze enacted in writing

**Prerequisite Evidence Check (current session — feasibility check, NOT audit starting early):**
9. Historical data availability assessed — count of days of VTS trades with `pairDirectionalBias` field, count of days of regime archive entries

**Reset & Kickoff:**
10. Both sessions reset — Langston transcript archived, new CC session spun up with fresh full context
11. B61 scope doc drafted in the fresh CC session as the first audit deliverable

### Batch Mapping

| Batch | Sub-Phase | Owner | Blocking |
|---|---|---|---|
| **B61** | A — DBS Validation | CC + Langston (A.3) | YES |
| **B62** | B — Regime Taxonomy Redesign | CC + Langston (B.4) | YES |
| **B63** | C inventory + D core proof | CC + Langston | Core proof YES, full matrix NO |
| **B64** | E.1-E.3 — Classifier + map deploy | CC implementation, Langston review | YES (IF approved) |
| **B65** | E.4 — Filter/DBS integration deploy | CC implementation, Langston review | Selected items YES (IF approved) |

### Out of Scope for Phase 15b (Explicit)
- B60 Smart Thermostat / Rules-Based Predictive Execution (now Phase 17.5, post-live)
- Predictive learning service teardown (post-live)
- Machine learning design or implementation (Phases 17, 18 — post-live)
- DB/Legacy cleanup (Phase 16 — pre-live but separate)
- Strategy logic rewrites unless directly required by new regime mapping
- Any change to the Adjustment Framework or Authority Baseline (constitutional, separate process)

**Expected outcome**: Regime classifier accurately reflects market state with DBS as first-class input. Strategy-regime mapping aligned with new taxonomy. Filter layer DBS-aware where decided. False-range bleeding stopped. Dormant strategies awakened where appropriate. System is ready for paper mode audit (Phase 19) on a sound regime foundation.

---

## Phase 16: Database & Remaining Legacy Cleanup (Weeks 20-23)

**Goal**: Clean remaining legacy infrastructure — legacy database tables, remaining dead code, and schema simplification.

> **Note**: Wave 6 L-Series Cluster Removal was completed early in Phase 13 (Batch 14, 2026-03-04). The entire L12-L20 cluster (29 files, 59 endpoints, ~8,200 lines) has been permanently deleted. What remains for Phase 16 is database table cleanup, schema work, and any remaining legacy cleanup.

### ~~16.1 Wave 6: L-Series Cluster Removal~~ — ✅ DONE (Phase 13, Batch 14)
All L-Series services (17), route files (9), and utilities (2) removed. M3B validation service also removed. See Phase 13 completion notes above.

### 16.2 Database Phase A-B: Isolation & Modularization
- Confirm which legacy tables still have active writers (Phase A)
- Split storage.ts into domain-specific modules (Phase B)
- **Critical ordering**: storage.ts must be modularized BEFORE legacy tables are dropped

### 16.3 Database Phase C: Schema Simplification
- Drop Wave 3 tables (10 Walter tables) — if not already done in Phase 12
- Drop Wave 6 tables (~57 L-Series + ethics + cluster tables)
- Drop Wave 10 tables (4 paper duplicates + V1 guardrails)
- Remove ~40 legacy enums
- Clean schema.ts of dead definitions

### 16.4 Wave 7: Post-L-Series Cleanup
- SafetyGuardrails service removal
- Remaining consumer cleanup

### 16.5 LSP Error Resolution
- Delete legacy files causing LSP errors
- Fix remaining LSP error causes in active code
- Target: zero or near-zero LSP errors in active codebase

### 16.6 Trailing-Percent Code Purge (added 2026-04-25, Kyle directive)

The B65.2 functional ship deleted the paper-execution-engine consumption of metadata-driven `trailingStopPercent` for exit decisions, and B65.4 replaced the moonbag pure-trail design with the ATR-based ladder. The original B65.3 sub-batch ("migrate paper percentage trailing onto ATR TEC") was therefore declared MOOT in the catalog because the migration target no longer existed. Phase 16 will delete the residual references that survived only as legacy or dashboard-write artifacts:

**Required deletions:**
- `server/services/paper-execution-engine.ts:1929` — the single `highWaterMark` write at trade-open, comment-flagged "retained for legacy dashboards; no longer consumed by exit logic." Audit any "legacy dashboards" still reading the field; update them off the legacy path or delete them too.
- `server/services/tec-evaluator.ts` JSDoc paragraph referencing legacy paper trailing — already reduced to a forward-looking note in 2026-04-25 governance commit; remove entirely once the residual `highWaterMark` write is gone.

**Conditional deletions (only if ABCD + SMA Trend Ride strategies are themselves retired in Phase 16 cleanup):**
- `client/src/lib/types.ts:47,52` — `abcdTrailingStopPercent`, `smaTrailingStopPercent` settings type fields.
- `server/services/strategy-engine.ts` ABCD detector (~L232, L293, L314) and SMA Trend Ride detector (~L361, L378, L405, L428) per-strategy trailing-stop logic. These are entry-side strategy detector internals that compute `trailingStopPercent` from `trading_settings` and produce signal metadata — NOT the deleted paper exit-loop path. Decide retire/keep based on whether the strategies themselves still earn their slot in the canonical map after Phase 19 paper audit.
- `server/routes.ts:6602` — settings default literal `'2%'`.
- `1-system-manual/AUTHORITY_BASELINE.md` lines 89, 94 — canonical baseline references for ABCD + SMA Trend Ride trailing-stop. Update only if the strategies are retired.
- `1-system-manual/authority-baseline-v1.json` lines 68, 81 — same baseline JSON.

**Documentation-only references (no code change required):**
- `1-system-manual/sections/PHASE5_TRADE_EXECUTION_AND_LIFECYCLE.md:441`, `1-system-manual/SYSTEM_MANUAL.md:4464` — the engine's own `highWaterMark` field on `TrailingState` (still used inside `trailing-exit-controller.ts` as the secondary dynamic floor). Do NOT delete; this is the live engine field.
- `bridge/reference/DawnTrader_Chat_Archive_*.md` and `Archived Reports - Pre-Phase 12 Governance Implementation/*` — historical archives; do not edit.

**Pass criteria:** post-deletion, `grep -rn "trailingStopPercent"` over `server/` should return only the engine's own internal `highWaterMark` (which is part of the active ATR TEC state, not legacy). Any remaining ABCD/SMA references mean those strategies were kept; document the kept references explicitly so future audits don't re-flag them.

### 16.7 Test Suite Recovery (added 2026-05-13)

**Surfaced 2026-05-13 during BATCH_80 CI verification.** CI Test Suite has been red since at least 2026-05-12 23:23 with ~60 failed tests across 5 unrelated test files. Pre-existing — NOT caused by BATCH_80. CLAUDE.md §7 invariant "ALL 4 GREEN since B56" is currently violated.

**Failing test files (snapshot 2026-05-13 14:00 UTC, CI run `25802780663`):**
- `server/tests/unit/b73-exit-strategy-replay.test.ts` — BE-stop variant scenarios (Variants F, J, Scenarios 12-15). Likely test-data drift from B73.1 ATR real-input change.
- `server/tests/integration/cost_telemetry.test.ts` — DSE Cost Pressure (Directive 11.3C). Likely module_constants schema or seed drift.
- `server/tests/integration/dynamic_sizing.test.ts` — Directive 11.3 DSE (Core Sizing, Volatility/Cost Penalties, Telemetry, Diagnostics, Adaptive Weight Integration). Likely module_constants or storage interface drift.
- `server/tests/integration/b72-dbs-routing-guards-consistency.test.ts` — DBS routing guards mutual consistency.
- `server/tests/unit/b70-run-mode-controller.test.ts` — Run mode controller.

**Approach:**
- Triage each failing test: (a) legitimate regression to fix, (b) outdated test that needs updating, (c) test exercising intentionally-changed behavior that needs rewriting.
- Restore CI to clean green baseline so future batches can rely on the regression-gate signal.
- Likely sequenced AFTER xstock UI diagnostic-tab fixes close + AFTER BATCH_80 governance closes.

**Out of scope:** if any failing test reveals a live-system bug, file as a separate dedicated batch — don't bundle into Test Suite Recovery.

**Phase 16 expected outcome**: All legacy infrastructure permanently removed. Schema cleaned. ~71 legacy tables dropped. LSP errors resolved. Residual paper percentage-trailing code purged from active codebase. **CI Test Suite restored to green per §16.7.**

---

## Phase 17: Machine Learning Design (Weeks 23-28)

**Goal**: Execute the "Plan to Create a Plan" — perform the research, mapping, and design work required to produce the ML implementation blueprint (Directive 18.0). This is NOT the ML build itself.

**Source**: "The Plan to Create A Plan for Machine Learning - Phase 12" (1.17.26) — now renumbered to Phase 17 to fit the updated sequence.

> **Important note from Kyle**: This phase will likely require a dedicated brainstorming/design discussion session to decide what the machine learning architecture will look like. The system audit (Phases 1-11) provides the foundation knowledge, but the ML design decisions need collaborative input.

### 17.1 Scope & Grounding (Week 23)
- Define full scope of ML integration
- Align audit categories (functional, architectural, behavioral)
- Establish criteria for "complete system visibility" for ML purposes
- Create audit template for every subsystem: name, role, inputs, outputs, key functions, calculations, dependencies, update frequency, performance sensitivity, ML integration potential, verification requirements

### 17.2 ML Touchpoint & Influence Mapping (Weeks 24-25)

#### Feature Extraction Points (Outbound — what ML will learn from):
- Market State (volatility, spread, LQ/VN)
- Contextual Data (time, session, liquidity)
- Signal Metadata (strategy, pattern, score)
- Trade Lifecycle (open/close outcomes)
- Guardrail Metrics (IMF, SQE)
- Structural Regime, Directional Bias, and Friction Scores (Global + Pair-level)
- Predictive Adjustment history and outcomes

#### Influence Points (Inbound — where ML output goes):
- DSS (strategy weighting)
- SQE (signal qualification)
- RTB Queue (queue pruning)
- DSE (dynamic sizing & stop management)
- DSS & IMF thresholds (auto-tuning)
- Canonical weight updates (replacing rules-based calibration)

#### Deliverable: ML Touchpoint Matrix
- Every component → data → ML interaction
- Labeled as: Outbound (learning source), Inbound (intelligence consumer), Bidirectional (adaptive feedback)

### 17.3 Infrastructure Design (Weeks 25-26)
- In-process module vs local microservice decision
- Inter-process communication design (gRPC, WebSocket, shared memory)
- Persistent state store design (on-disk or vector DB) for context preservation
- Rolling memory buffers for real-time adaptive recall
- Performance budgeting: model inference latency budget (<100ms per signal)
- CPU/GPU resource profiling and trade-off options
- Safe Mode fallback design: revert to rules-based (Phase 15) if ML misbehaves
- Watchdog for memory drift or performance degradation
- **Requirement**: Must run entirely locally, no cloud dependency

### 17.4 Research & Feature Engineering (Weeks 26-27)
- Evaluate ML architectures: Gradient Boosted Trees (tabular data), RL agents (adaptive sizing), etc.
- Assess local ML libraries: ONNX runtime, LightGBM, PyTorch local
- Feature Store schema design (universal, normalized, labeled)
- Explainability tools: SHAP, LIME for transparency and trust
- Model Drift Detection design
- Real-time dashboard design for confidence and error rates
- Auto-trigger "safe mode" when drift exceeds threshold

### 17.5 Blueprint Assembly (Weeks 27-28)
- Merge data flow, touchpoints, infrastructure into actionable directive
- Development milestones (Crawl, Walk, Run, Fly)
- Testing protocols
- Rollback procedures
- Monitoring dashboards

#### Deliverable: Directive 18.0 (Comprehensive Predictive Learning Architecture)
- The fully vetted, implementation-ready ML plan
- Reviewed and approved by Kyle before Phase 18 begins

**Expected outcome**: Complete ML architecture design. Feature Store schema. Touchpoint Matrix. Infrastructure proposal. Implementation blueprint ready for execution.

### 17.6 Trend Mining Engine — design consideration (Kyle directive 2026-05-04)

**Concept:** A separate engine whose ONLY job is to churn through archived data (B70 + B74 archives + paper-sim trade history + every signal eval) and propose candidate trends/patterns/signals that no human and no narrowly-defined model would surface — across pairs, regimes, strategies, time-of-day, macro context, volume regimes, etc. Not a hypothesis-driven coder writing "I think X matters"; an automated proposer that explores the feature × pair × regime × time-window space and surfaces statistically interesting candidates for the validation pipeline to ablation-test.

**Why it matters:** Supervised ML (including Phase 18 models) only learns trends in the features YOU give it, predicting the labels YOU define. It does not autonomously discover edges in dimensions you didn't think to include. A Trend Mining Engine fills that gap — it's the candidate-generator, the validation pipeline (B67.0 ablation framework, already built) is the gate, and ML / chain modulators / strategy roster are the consumers. Top quant funds (Renaissance, Two Sigma, D.E. Shaw, Citadel) all run "alpha factory" pipelines built around this idea. Open-source precedents exist: tsfresh, Featuretools, Qlib (Microsoft), mlfinlab, WorldQuant Brain, Numerai.

**The trap to design around:** multiple-comparisons / data-dredging / p-hacking. A naive engine that returns 47 patterns/week without rigorous validation is actively worse than useless. Discipline required: Bonferroni / FDR correction, walk-forward holdout, friction-net EV gates, sample-size minimums, Bayesian skeptical priors, explicit null hypotheses per candidate.

**Scope-of-design considerations for Phase 17 to address:**
- Decide whether to build in-house, integrate Qlib/mlfinlab, or wrap an external service (Numerai-style).
- Define the "candidate language" — what kinds of patterns the engine searches for (single-feature thresholds, feature interactions, time-conditional signals, regime-conditional signals, motif/shapelet patterns, association rules, anomaly clusters).
- Define the validation discipline — how the candidate stream gates into the existing B67.0 ablation framework. Realistic throughput target: most weeks the engine outputs zero new signals; rarely (quarterly?) it surfaces 1-2 high-quality candidates that pass validation.
- Define the kill switch — engines that are too prolific become noise generators; need a "results per quarter" sanity ceiling.
- Decide whether the engine runs continuously (resource cost, but always-on discovery) or in scheduled passes (cheaper, batchier).
- Decide whether engine output is auto-deployed (no — too risky) or human-reviewed before activation (yes — Langston/Kyle gate).

**Sequencing:** Trend Mining Engine is an ML-DESIGN-PHASE consideration, not a standalone earlier phase. It belongs in Directive 18.0 as a peer architecture to the supervised ML pipeline, sharing the Feature Store + Validation Pipeline. Concrete build can land in Phase 18 (alongside the Crawl/Walk/Run/Fly milestones) or as a Phase 22+ research track post-launch. Pre-launch: do not build. Pre-launch: ensure B70 data capture is designed so that when we DO build, the data is ready (see B70 forward-design note above).

**Forward-design implication for ML-light:** ML-light must NOT be designed as the system's sole "discovery" engine. It is a supervised classifier consumer. The Trend Mining Engine is the discovery engine. Both feed the validation pipeline. See ML-light forward-design note above.

---

## Phase 18: Machine Learning Implementation (Weeks 28-34)

**Goal**: Build and deploy the ML system as designed in Phase 17. This replaces and extends the rules-based predictive execution from Phase 15.

> **Note**: The specific sub-phases of Phase 18 will be defined by Directive 18.0 (the output of Phase 17). The following is a high-level outline — the actual implementation plan will be much more detailed.

### 18.1 Crawl: Feature Store & Data Pipeline
- Build Feature Store with schema from Phase 17.4
- Wire all Outbound touchpoints (data capture)
- Validate data quality and completeness
- Historical data ingestion for initial training

### 18.2 Walk: Model Training & Validation
- Train initial models on historical data
- Validate against paper trading results
- A/B comparison: ML predictions vs rules-based predictions (Phase 15)
- Explainability verification (SHAP/LIME outputs make sense)

### 18.3 Run: Integration & Parallel Execution
- Wire Inbound touchpoints (ML output → system logic)
- Run ML in parallel with rules-based system (shadow mode)
- Compare outcomes, calibrate confidence
- Drift detection active

### 18.4 Fly: ML as Primary Intelligence
- ML replaces rules-based policies as primary decision layer
- Rules-based system becomes fallback (Safe Mode)
- Continuous learning active within 11.8B-E bounds
- Monitoring dashboards live

### 18.5 Trend Mining Engine — parallel architecture (per Phase 17.6 design)

**Status:** Build per the design produced in Phase 17.6 (see above). Either ships as part of Phase 18 alongside supervised ML, or splits into a Phase 22+ research track post-launch — Directive 18.0 makes the call.

**Architecture (regardless of when it ships):**

```
        ┌────────────────────────┐
        │ Trend Mining Engine    │  ← candidate generator
        │ - tsfresh feature gen  │     (auto-proposes signals)
        │ - motif discovery      │
        │ - subgroup mining      │
        │ - per-pair / per-regime│
        │   pattern hunting      │
        └─────────┬──────────────┘
                  │ proposes candidates
                  ▼
        ┌────────────────────────┐
        │ Validation Pipeline    │  ← gate (already built — B67.0)
        │ - holdout + FDR        │
        │ - tertile monotonicity │
        │ - friction-net EV gate │
        │ - sample-size gates    │
        └─────────┬──────────────┘
                  │ filters down to ~1-2 keepers/quarter
                  ▼
        ┌────────────────────────┐
        │ Confidence Chain       │  ← consumers
        │ Strategy Roster        │
        │ ML-light feature set   │
        │ Supervised ML feature  │
        │   inputs (Phase 18)    │
        └────────────────────────┘
```

**Key principles:**
- Candidate generation and validation are decoupled. Generators compete; the validator is canonical.
- ML-light (pre-Phase-16 batch when it ships) is a CONSUMER of validated signals, not a generator.
- Phase 18 supervised ML is also a consumer — its feature inputs include validated mining outputs.
- Engine output requires human gate (Langston/Kyle) before activation. No auto-deploy of mined signals.
- "Results per quarter" sanity ceiling enforced — if the engine is producing >5 keepers/quarter, suspect false positives, tighten discipline.

**Pre-Phase-18 work:** ensure B70 data capture is wide + structured for automated mining tools (already noted in B70 entry above). No engine code lands pre-launch.

### ML Safety Principles (Throughout):
- No overwrite without versioning — all static logic remains as fallbacks
- Everything observable — every ML output or adjustment logged and auditable
- Fail gracefully — if ML crashes or returns low confidence, revert to rules-based (Phase 15)
- Performance first — ML inference cannot block or delay live trading functions
- Authority Baseline (11.8C) is the floor — ML cannot violate the bounds defined by 11.8B-E

**Expected outcome**: ML system operational, producing real adaptive intelligence. Rules-based system retained as Safe Mode fallback.

---

## Phase 17.5: Smart Thermostat / Rules-Based Predictive Execution (Post-Live, Deferred from Phase 15b)

**Status**: DEFERRED here from pre-live on 2026-04-14. Originally planned as B60 / Phase 15b. Decision: cannot tune adaptive policy on top of a misclassified state model. Now sequenced after the new Phase 15b regime restructure has been validated in live mode and after ML design+implementation (Phases 17, 18).

**Goal**: Enable the "Smart Thermostat" — allow the predictive learning system to make bounded, rules-based filter adjustments. This is the pre-ML adaptive layer (Version 2 from Kyle's 11.8 document — rules + sensors, no AI).

### 17.5.1 Rules-Based Policy Engine
- Implement the policy execution layer defined by 11.8B-E
- Policies are deterministic, explainable, reversible
- Example policy: "In LOW_VOL_CHOP regime, increase minVolume by 15%"
- All adjustments logged, auditable, and bounded by 11.8B-E constraints

### 17.5.2 Predictive Adjustment Execution
- Wire Predictive Adjustments (currently observational-only) to execute bounded changes
- Pattern confidence multipliers can now modify behavior (within 11.8B-E bounds)
- Strategy weighting influenced by recent performance data

### 17.5.3 Calibration Execution
- Learning Calibration can now update canonical weights (within 11.8B-E bounds)
- Recommendations become executable (not just observational)
- All mutations logged against Authority Baseline for comparison

### 17.5.4 Regime-Aware Adaptation
- Structural Regime (Global + Pair-level) drives filter adjustments
- Directional Bias feeds into strategy selection weighting
- All three dimensions (Structural Regime, Directional Bias, Friction) feeding into predictive learning for correlation analysis

**Why deferred to post-live**: The new Phase 15b restructure changes the regime taxonomy and DBS integration. Smart Thermostat policies would need to be rewritten to match the new state model — so building the thermostat first and then redesigning the model would waste the work. Post-live ordering also lets ML (Phases 17, 18) inform whether a separate rules-based layer is even needed.

**Expected outcome**: System adapts to market conditions using rules + statistics. Not static, not ML. The intelligent middle ground.

---

## Phase 19.0: VTS Partition + Exchange-Data Adapter — DEFERRED TO POST-LAUNCH (Kyle directive 2026-05-21)

**Status (2026-05-21):** DEFERRED to post-launch — possibly never built. Kyle's reasoning: the partition would require solving two non-trivial upstream problems first — (a) API rate-limit budgeting across Kraken + Binance + Coinbase + KuCoin so the alternate-source data feed doesn't blow through quotas, and (b) a data storage system design for the partitioned VTS process (separate writers, partition-aware archive tables, retention policy alignment). Neither is sized or planned. Rather than block Phase 19 paper-mode audit on that work, accept the start-stop interruption to VTS data accumulation during audit cycles as a known cost and proceed. Post-launch we reassess whether the partition still earns its build cost or whether the same goal can be achieved more cheaply.

**Original rationale (preserved for reference):** First sub-section of Phase 19. Sits BEFORE 19.1 Paper Trading Run because the partition is a prerequisite for running the rest of Phase 19 effectively — without it, every active-trading-engine restart during Phase 19 audit work interrupts VTS data accumulation.

**Why this phase exists:** during Phase 19 the team will be repeatedly starting and stopping the active-trading engine to audit and fix it. Today VTS shares the trading-engine process and Kraken API budget — so every active-trading restart interrupts VTS data accumulation. To preserve continuous VTS observation through the start-stop cycles of Phase 19 paper-mode audit, VTS needs to be partitioned into a process that runs independently of the active-trading engine, with its own data feed (Binance + Coinbase + KuCoin combined fallback chain), and its own scan engine (FX5 instance) so it doesn't compete for Kraken API budget when active trading is running.

**Why this is also a modularization preview:** the work cleanly aligns with two of the Phase 21.4 Modularization phase's eight canonical modules — Exchange Adapter and Filter Module Family. By pulling these forward into Phase 19.0, we land the architectural patterns pre-launch on a low-risk surface (VTS observation), then Phase 21.4 extends the same patterns across the full system post-launch. This is the right time to start because the next exchange we'll integrate is XStocks for tokenized equities (Phase 21.5), and the cleaner the Exchange Adapter pattern is by then, the easier that integration becomes.

**Effort:** 1-2 weeks. Larger than the original feasibility note's 3-5 day estimate because this scope adds: (a) the symbol normalizer service so different exchanges' symbol conventions map cleanly, (b) the VTS-process partition (own PM2 process, own state), and (c) a dedicated FX5 scanner instance so the data layer split is clean.

**Dependencies:**
- ~~B72 lever-to-`module_constants` sweep should complete first~~ ✅ **B72 SHIPPED 2026-05-05** (+ B72.1 2026-05-05 + B72.2 2026-05-06); 34 modules / ~163 rows in production sync-read paths; 18/18 canonical strategies DB-tunable. New components land DB-tunable.
- `INDEPENDENT_VTS_DATA_FEED_FEASIBILITY.md` is the architectural reference.

### 19.0.1 Symbol Normalizer Service (NEW)

Build a small service that maps Kraken pair symbols (e.g., `BTC/USD`, `ETH/EUR`, `2Z/USD`) to their equivalents on Binance, Coinbase, and KuCoin (e.g., `BTCUSDT`, `BTC-USD`, `BTC-USDT`). Includes:

- A canonical `MarketSymbol` type with `{base, quote, exchange}` shape internally
- Forward map: Kraken symbol → exchange symbol per source
- Reverse map: exchange symbol → Kraken symbol (for inbound data normalization)
- Quote-substitution rules (e.g., Kraken EUR pair → Binance USDT proxy when no EUR equivalent exists)
- Coverage diagnostics: at startup, report how many Kraken pairs have at least one source mapping vs. uncovered pairs
- Stored as a registry that's `module_constants`-tunable so new pairs / new exchanges can be added without code redeploy

This service is reusable — when XStocks is added in Phase 21.5, the same normalizer adds the stock-symbol convention.

### 19.0.2 Exchange-Data Adapter Layer (Phase 21.4 Modularization preview)

Build a pluggable adapter interface in VTS specifically. The adapter abstracts OHLC fetching, with one backend per source exchange:

```
interface IExchangeDataAdapter {
  getOHLCData(symbol: string, interval: string, lookback: number): Promise<OHLCCandle[]>
  isAvailable(symbol: string): boolean
  rateLimit: { weightPerMinute: number, weightPerCall: number }
}
```

Backends to implement: BinanceAdapter, CoinbaseAdapter, KuCoinAdapter. Pluggable enough that adding KrakenAdapter (for the active-trading process) is trivial.

Fallback chain logic: for each Kraken pair, the chain tries Binance first (largest coverage), then Coinbase (USD-quoted gaps), then KuCoin (altcoin tail). First adapter with the pair wins. Coverage report logged at startup.

### 19.0.3 VTS Process Partition

Move VTS into its own PM2 process (`dawntrader-vts`) separate from `dawntrader` (active-trading process). VTS process:

- Runs its own scan engine (FX5 instance) on its own schedule
- Pulls OHLC from the Exchange-Data Adapter (Binance/Coinbase/KuCoin combined), NOT from Kraken
- Generates signals and simulates trades independently of active-trading state
- Persists VTS observations to the same database (via the same archiving path) as today
- Exposes its state via a separate set of API endpoints (`/api/vts/...`) so the active-trading process never blocks VTS-only API calls

When the active-trading process is stopped/restarted during Phase 19 audit work, VTS continues running uninterrupted.

### 19.0.4 Coverage diagnostics + observability

Health-check page or dashboard widget that shows:

- Which Kraken pairs have which exchange-data source backing them
- Adapter rate-limit health (any throttling events)
- Per-source coverage drift over time (if an exchange delists a pair, surface that)
- VTS signal volume vs. theoretical max if all pairs were covered

This makes the ~5% coverage gap explicit and trackable — if specific missing pairs turn out to matter, we know exactly which ones to address.

**Phase 19.0 expected outcome:** VTS runs continuously through Phase 19's start-stop cycles. The Exchange-Data Adapter pattern is in production on a low-risk surface. The symbol normalizer is in place ready to be extended for XStocks (Phase 21.5) and any future exchange. Phase 21.4 Modularization has a working reference implementation for two of its eight canonical modules already shipped.

---

## Phase 19: Paper Mode Audit & Debug (Weeks 34-37)

**Goal**: Run the complete system end-to-end in Paper Mode with all components active (MCE, real VTS, Directional Bias, Short Trading, Predictive Execution, ML). Find and fix everything before live capital.

### 19.0.A — Regime classifier confidence-chain calibration (MOVED HERE 2026-05-21, Kyle directive)

**Status (2026-05-21):** Moved INTO Phase 19. Previously the active workstream blocking B67.5 (factor consumer-gate design) — `B-NEW-33` calibration tool, `B-NEW-36` diagnostic spike, `B-NEW-37` forensics, `B-NEW-39` phase-1 floor revert. Kyle directive 2026-05-21: stop trying to calibrate the confidence-chain modifiers against VTS outcomes — VTS and active-trading wins/losses are not comparable. VTS opens simulated trades on every filter-survivor against every strategy in a regime family (broad coverage by design); active trading runs a strict SQE filter on top that removes signals VTS retains. So VTS is observing losers (and some winners) the active path will never see, and active trading is filtering for a tighter subset than VTS measures. Calibrating the confidence chain against VTS data therefore conflates two different populations and produces verdicts that won't transfer to live.

**The calibration moves into Phase 19** for the same reason SQE recalibration (19.4) was moved into Phase 19 — once the paper-active path is running cleanly, the chain modifiers get calibrated against active-paper-mode outcomes (the apples-to-apples population) instead of VTS outcomes.

**What stays preserved through the move:**
- The 10-factor catalog + `b76_chain_final` framework version + nightly `regime_factor_alternates` accumulation continue running in the background. Data continues to build; the calibration verdict just isn't read until paper-active turns on.
- The B-NEW-39 phase-1 fix (post-composition floor reverted 0.20 → 0.45) stays in place — it was a structural correction, not a calibration outcome.
- B67.5 consumer-gate design is similarly parked. Confidence chain is currently shadow-modulating; nothing downstream actually consumes it as a decision input. That's the right posture until calibration can be done against the right population.

**What changes when Phase 19 opens:**
- Replay tool re-runs against paper-active outcome data (mode='paper_active' or equivalent) instead of VTS outcomes.
- Decision-grade gates (n ≥ 150/tertile, |spread| ≥ 7pp, p < 0.05) stay locked.
- Per-factor verdicts re-derived; KEEP / DROP / INCONCLUSIVE rolled into the B67.5 consumer-gate design.
- The B-NEW-37 forensic finding that the b68_5 sustainability gate is uniformly over-aggressive (Δconf identical between winners and losers) gets re-validated against paper-active data, not VTS data. If the same finding holds, the gate is recalibrated or deprecated per Phase 19.0.3 — TFS sustainability-gate decision tree.

**Why this is the right move:** calibrating sensors against a population the sensors won't actually serve produces measurements that don't survive the population change. Same reason SQE recalibration was moved into Phase 19. Same family of problem.

### 19.0.B — Daily loss-budget service + kill-switch auto-trip (OPTIONAL Phase 19 batch, Kyle directive 2026-05-21)

**Status (2026-05-21):** Optional Phase 19 batch. Previously listed as item 9 in the 19.4.5 observational decision gate as "BLOCKING FOR LIVE-TRADING ACTIVATION." Promoted to a dedicated Phase 19 batch slot rather than buried inside the observational gate so it has its own visibility, but flagged optional — if Phase 19 observation shows the existing manual kill-switch + per-trade guardrails are already absorbing real-world loss patterns adequately, the auto-trip wiring can ship later. If Phase 19 observation shows the gap is materially exposing capital, the batch fires.

**The gap:** today the kill switch's `dailyLossKillSwitchPct` threshold (~25%) lives in `guardrails_v2` but is checked manually via UI/API. No service watches running daily P&L and trips automatically. `tripKillSwitch()` accepts `lossPercent`/`threshold` params but is never called by a budget aggregator. There is no `server/services/daily-loss-budget.ts`.

**Scope if the batch fires:**
- Build `server/services/daily-loss-budget.ts` — rolling 24h P&L aggregator across paper + live trades.
- Wire auto-trip when `dailyPnL / portfolioValue ≤ -dailyLossKillSwitchPct`.
- Trade-mode-aware (paper-active aggregation lifts into live aggregation when live mode activates).
- DB-tunable threshold via `module_constants` (already present in `guardrails_v2`).
- Same service can later be a regime-confidence consumer (original B67 "Consumer #6" scope).

**Effort:** ~1-2 weeks if fired. Otherwise zero work.



### 19.0.3 — TFS sustainability gate value-scope decision (NEW 2026-05-17, Kyle directive)

**Context.** The B67.5/B68.5 path-B sustainability gate currently feeds the confidence pipeline only — regime classifier, strategy selection, and Dynamic Sizing Engine do NOT consume sustainability output. Original design intent (B67.5/B68.5 era) was broader ("preventing late-trend entries" + "adding nuance to regime handling"); implementation contracted to confidence-only without explicit deferral tag. Step 1 baseline analysis 2026-05-17 (3,992 ablation rows in 16-day window) CONFIRMED B-NEW-37 forensic at scale: gate is uniform confidence dampener, blocks path B in only 0.9% of trades, Δconf identical between winners (0.4477) and losers (0.4423). Three-way Kyle/CC/Langston converged decision: table value-scope decision until Phase 19. RUNNING_ISSUES #111 tracks the deferral.

**Decision tree to resolve at Phase 19 opening:**

1. **Full stage-aware redesign** — extend regime model to include {EARLY, MATURE, LATE} stages; re-do canonical regime-strategy map as (regime × stage) → strategy set; modify DSE to factor stage into sizing. Multi-batch effort. Highest payoff if sustainability classifier validates AND stage-awareness measurably improves outcomes.

2. **Narrow trailing-exit-controller (TEC) routing hook** — read sustainability score at trade-entry time, route to TARGET (tight, lock-in) vs TRAILING_TAKE (wide trail, let-it-run) exit mode based on score. No changes to regime classifier, strategy selection, or sizing. Single batch (~1.x of follow-up). Smaller payoff but much smaller scope. Real near-term value path.

3. **Deprecate the gate** — remove the confidence-modification hook entirely, accept that DBS ≥ 0.30 regime classification + downstream Phase 19 filters carry the load. Smallest scope. Justified by data if classifier validation fails.

**Shared prerequisite for all three branches:** classifier accuracy validation. Methodology framework is locked at `Claude Comms and Packages/Langston Design Asks/TFS_SUSTAINABILITY_GATE_RESEARCH_DESIGN_2026-05-17_rev2.md`. Pivot at Kyle directive 2026-05-17: success criterion must be **forward-trend-continuation accuracy**, NOT trade-outcome win/loss (trade outcomes are downstream of entry/exit/sizing/friction; confidence inversion noise in VTS contaminates outcome-based measurement).

**Data continues accumulating during the deferral:** VTS persists sustainability score on every trade as feature for future ML training. The deferral doesn't lose history.

**Decision-record paper trail:** Step 1 baseline `..._STEP1_BASELINE_2026-05-17.md`; value-proposition decision `..._VALUE_PROPOSITION_2026-05-17.md`; methodology rev2 `..._RESEARCH_DESIGN_2026-05-17_rev2.md`. Implementation history captured in CHANGES_AND_FIXES `DESIGN-2026-05-17-A`.

### 19.0.5 — Full data-capture coverage for paper-active path (HARD requirement, Kyle directive 2026-05-05)

**Status:** B70 main + B70.1 shipped capture for the VTS path (which was the only active path at B70 time). When paper-active turns on in Phase 19, the system MUST capture EVERYTHING flowing through the paper path with the same fidelity. This is a precondition for Phase 19.1 paper trading run; without it, the paper run produces less data than the VTS run that preceded it, which defeats the whole point.

**Concrete deliverables (must land before Phase 19.1 starts paper-active):**

1. **FX5 pre-filter reject capture** — every pair the FX5 scanner evaluates and rejects pre-strategy (spread/volume/IMF/family-eligibility/etc.) writes a `signal_eval_archive` row with `reject_stage='pre_filter'` and `gate_decision.reason` carrying which stage rejected it. Today this is implicit (a pair that never appears in `signal_eval_archive` for a cycle was rejected pre-filter). When paper-active runs, we want explicit per-pair rejection rows. Surgical work: ~10 reject sites in `fx5-scanner.ts`.

2. **Active-path SQE / RTB / TCL reject hooks** — `signal-orchestrator.ts` currently has the admitted-path hook only (commit `6b63b6bd`, dormant until live activates). Phase 19 needs equivalent reject-stage hooks at:
   - `signal_quality_evaluator.ts` FinalScore-floor failure → `reject_stage='sqe'`
   - `ready_to_buy_service.ts` stale / TTL-expired path → `reject_stage='rtb'`
   - `trading-bootstrap.ts` TCL cooldown / dedup path → `reject_stage='tcl'`

3. **Paper-execution-engine admit hook** — currently paper-engine has only the `closePosition` exit hook. When paper-active opens a position, that admit event should also write a `signal_eval_archive` row with `mode='paper_sim'` and `source='paper-execution-engine'` so the open→close pair joins cleanly by trade_id.

4. **Verification target:** in the first 24h of paper-active running, every one of the 4 partitioned archive tables shows non-zero rows tagged with `mode='paper_sim'`. Drift Dashboard `DataArchiveSection` panel shows the breakdown.

**Why this is in Phase 19.0.5 not B70.2:** Kyle directive 2026-05-05 — "When paper mode active trading turns on, everything flowing through paper mode must be captured." Treating this as "B70.2 maybe-someday" risks the paper-active run going live with a capture gap. Locking it as a Phase 19 precondition guarantees the paper run produces a complete dataset.

**Estimated surface:** ~200-400 lines across fx5-scanner.ts (10 reject sites) + signal_quality_evaluator.ts (1 site) + ready_to_buy_service.ts (1-2 sites) + trading-bootstrap.ts TCL section (1-2 sites) + paper-execution-engine.ts open-position hook (1 site). All hot-path hooks try/catch wrapped, never block host paths (same pattern as B70 main).

### 19.1 Paper Trading Run
- Run extended paper trading with full system
- **Phase 19.0.5 capture coverage verified non-zero across all 4 archive tables for `mode='paper_sim'` (precondition)**
- All 17+ strategies active (including short strategies)
- MCE providing real indicators
- VTS generating real signals
- Predictive execution making bounded adjustments
- ML active (or in shadow mode if not ready)
- Structural Regime, Directional Bias, and Friction all flowing

### 19.2 Audit & Debug
- Verify FinalScore, Hybrid Score, Confidence, Regime Weight are all calculating correctly
- Verify Directional Bias is feeding into strategy selection
- Verify short positions execute correctly (if Kraken-confirmed)
- Verify predictive adjustments are bounded and reversible
- Verify ML outputs are explainable and within bounds
- Verify kill switch, guardrails, and safety systems function under all conditions
- Fix all discovered issues

### 19.3 Performance Validation
- Compare paper results to expectations
- Validate strategy performance across regimes
- Confirm learning systems are improving signal quality
- Validate data retention and archiving

### 19.3.5 Trailing-exit live verification (folded-in B65.3, 2026-04-25)

**Status:** B65.3 was originally scoped as "migrate paper's metadata-driven percentage trailing onto the ATR TEC state machine," but during the B65.2 audit it was found that paper-execution-engine.ts no longer consumes the legacy `trailingStopPercent` + `highWaterMark` exit path — the consumption was deleted as part of the B65.2 functional ship. Only a single non-consumed `highWaterMark` write at trade-open survives for legacy dashboards (paper-execution-engine.ts:1929, comment-flagged). The migration target therefore no longer exists.

**What folds into Phase 19.3.5 instead:** live verification under active paper trading that the ATR TEC service — already wired into both VTS and paper exit loops as of B65.2, with B65.4 ladder ratchet on top — produces the expected behavior under real fills:

- Break-even lock fires at +1×ATR gain
- Target lock fires at first rung
- Ladder rung ratchet (B65.4) advances stop AND target by `(targetPrice − entryPrice)` step on each rung hit
- Cost-aware net floor (`computeNetTargetFloor`) holds even on volatile pairs where slippage might otherwise nip the profit
- HWM dynamic trail acts as secondary floor below the rung floor
- Persistence across PM2 restarts continues to work (already verified post-B65.4 ship via `[9.2][EXIT] {symbol} restored: ... rung=N` log lines)

**Pass criteria:** at least one closed paper trade per scenario above, observed in logs and reflected in the Machine Learning page Closed Simulated Trades table with the correct TEC State badge (BE PROTECT slate / TRAIL STOP emerald / 🌙 MB×N).

### 19.4 SQE Recalibration (B66, conditional)

**Status (2026-04-25):** Was originally queued as a pre-launch standalone batch. Moved INTO Phase 19 because SQE recalibration is downstream of signal generation and orchestration — if those upstream paths have problems in active-trading mode, SQE recalibration is unverifiable and risks shipping changes we cannot validate.

**Methodology requirement added 2026-04-26 (B65.5 Phase A0 lesson):** any cohort-based metric used to drive an SQE recalibration decision (FinalScore-vs-outcome correlation, per-source-pool WR, PredConf rolling-window calibration, realized-EV-adaptive floor data, etc.) must include a **sibling-strategy WR control** in the threshold definition. The B63 Item 13 BUILD_DEDICATED verdict was procedurally clean against pre-registered thresholds but was confounded by hostile-window contamination — sibling-strategy WR in the same ±60min windows was identical to the cohort, meaning the cohort metrics reflected window quality, not strategy quality. Phase 19.4 must apply the same control to its own threshold definitions. Specifically:

1. For any reported "strategy X has WR Y%" finding, also report sibling-strategy WR in the same time windows.
2. For any reported "FinalScore is anti-predictive r=Z" finding, segment the data by per-day or per-window quality and check whether the anti-predictive correlation holds in clean windows or only appears when hostile-window observations dominate the sample.
3. The B63 audit findings (Item 18 SQE in particular — see `B63_ITEM18_SQE_AUDIT.md`) were generated on a window that included pre-B62 data and must be re-validated with sibling-strategy WR controls + post-B62-only restriction before any of their recommendations get acted on as part of Phase 19.4. The 2026-04-26 spot-check (`REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md` §11 + §12 corrected re-run) returned mixed results:
   - **Item 18 FinalScore-anti-predictive: probably stands on post-B62 data.** Re-run on post-B62-only (740 trades, 04-20 onward): r=−0.140 full, r=−0.094 HOSTILE, r=−0.057 CLEAN, r=+0.005 MIXED. The signal is STRONGER on post-B62 data than the original Item 18 claim of r=−0.017 (which was averaged across pre+post B62 data and partially diluted). Hostile-amplified but persists on CLEAN days too. **Direction is robust; re-validate magnitude with sibling-strategy controls.**
   - **Item 18 "only quant-strong_trend net-profitable": INVERTED from current truth.** On post-B62 data, quant-strong_trend = WORST pool (28.3% WR / −$7.08 net). Pattern pool leads (57.1% WR / +$0.26 net). On CLEAN days quant-strong_trend = 42.0% WR / −$1.13 (still net negative). **Whatever Item 18 measured for source-pool profitability does not match current behavior. Discard this claim.**
   - **Item 15 ExpectedEdge anti-predictive r=−0.130: does not replicate on post-B62 data.** Full r=+0.008. Mostly noise per segment except MIXED days (r=+0.261). Original strength likely from a different cohort. Discard unless re-derived.
   - **Item 15 PredConf design flaw: mild signal at design level.** Post-B62 r=−0.097 full, smaller per-segment. Design-level claim probably stands; empirical magnitude smaller than originally reported.
   - **Item 19 batch correlation 87.8%: reproduces lower (~72%) on post-B62.** Hostile-amplification pattern holds. Reinterpretation as "global state dominance" stands — argues for Phase 19.5 AMR approach, not cadence change.

   **Phase 19.4 must re-derive every recalibration recommendation from post-B62 data with sibling-strategy WR controls before shipping any threshold or formula change.** The Item 18 FinalScore-anti-predictive direction is robust enough that Phase 19.4 work is still warranted; the source-pool profitability conclusion is wrong and must not be acted on.

This is not a Phase 19.4 blocker — it is a methodology requirement that the recalibration process must satisfy. The decision gate at end of Phase 19 paper audit is now: "do the empirical paper-mode outcomes (with sibling controls) support the recalibration changes B66 proposed, OR do they show that B66's findings were window-confounded?"

Decision gate: after several days of paper trading shows real WR / streak / FinalScore-vs-outcome data, we recalibrate SQE thresholds against actual paper observations rather than against VTS data.

Scope (from `BATCH_66_SCOPE.md`):
- 6 formula constant promotions to `module_constants`
- PredConf rolling window (replace all-time cumulative)
- Per-underlying position limits (cross-pair correlation cap)
- Realized-EV-adaptive floor
- rankingScore logging

May be split into multiple sub-deploys per the original scope. May be partially deferred to post-launch if paper-trading evidence suggests current SQE behavior is acceptable.

### 19.4.5 Observational Decision Gate — pre-launch reordering (NEW 2026-04-26, Kyle directive)

**Status:** added 2026-04-26 after B65.6 closed via SKIP. Sits between SQE recalibration (19.4) and AMR (19.5). The gate's job is to use 1-2 weeks of clean active-paper-trading data to decide which currently-post-live items might need to move pre-live.

**Trigger:** runs once after the trading engine is verified working in paper mode (19.1–19.3), SQE recalibration is complete (19.4), and ~~B72 lever-to-`module_constants` migration is complete~~ **B72 lever migration is complete (✅ shipped 2026-05-05; B72.1 2026-05-05; B72.2 2026-05-06)**. By this point the system is stable, observable, and tunable from the database — the prerequisites for collecting decision-grade observational data.

**Reference document:** `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md` — captures the per-pair classifier work that was done pre-Phase-19 and intentionally NOT shipped, so future-CC reading this gate during Phase 19 has the full record of what was tested and why we deferred to observation rather than building a fix in advance.

**Observation scope (1-2 weeks of paper trading):**

The gate watches for several conditions that, if observed, would justify pulling normally-post-live work into the pre-launch path:

1. **Hostile-window recurrence at active-trading scale.** The B65.6 work showed that VTS sees recurring hostile windows (04-22 trend-rider failure, 04-18 reversal-strategy failure, etc.). Active-trading filters are stricter than VTS, so the streak phenomenon may attenuate naturally. If active-paper-trading shows similar hostile-window concentration → **move Phase 19.5 AMR into pre-launch.** If it doesn't → AMR can stay post-launch.
2. **Daily signal volume.** If active-paper-trading is generating low daily signal counts (e.g., < 5 signals/day across the whole pair universe), the system isn't capturing enough opportunity to be meaningfully validated. **Trigger to move XStocks + Perp Futures (currently Phase 21.5) forward into pre-launch** so the pair universe expands and signal volume comes up to a level we can audit.
3. **Per-pair classifier misclassification visible in active trading.** If TFS-tagged pairs in active trading show outcome-vs-confidence inversion comparable to the 04-22 VTS pattern (TFS 13.8% WR vs STR 83.3% WR), → reopen B65.6 as a pre-launch fix using the candidate variables documented in §4 of the findings paper.
4. **Hardcoded constants causing operational pain.** If during the observation period the team needs to change any threshold, weight, or limit and finds it requires a code redeploy, → indicates B72 lever migration was incomplete and should be expanded before launch.
5. **Modularization friction.** If during observation the team identifies cross-module changes that require touching multiple files in the monolith to test ideas, → consider pulling some Phase 21.4 modularization work pre-launch (specifically the modules that block the testing work).
6. **Machine learning data sufficiency.** If by end of observation the system has accumulated enough trade + classifier-input + outcome data that ML model training becomes obviously valuable, → consider pulling Phase 17 ML Design pre-launch as well.
7. **Ladder net contribution at active-trading scale (added 2026-04-26, narrowed by B65.4.1 hotfix same-day).** Per `B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md` — original B65.4 formula cost ~$11 in absolute terms vs the counterfactual of just exiting at original target across the first 5 closed laddered VTS trades. **B65.4.1 hotfix shipped 2026-04-26** changing the rung floor formula from `target * (1 - totalCost/2)` (floor below target) to `target * (1 + slippage * bufferMultiplier)` (floor above target). The hotfix narrows the Phase 19.4.5 question from "fix formula or retire ladder" to "**tune multiplier or retire ladder**." The buffer multiplier is now a `module_constants` entry (`rung_floor_slippage_buffer_multiplier`, seed 1.0) so calibration is a DB update, not a code change. Phase 19.4.5 should track laddered-trade actual vs counterfactual across at least 30 laddered trades under the hotfix. Reporting instructions preserved at `BATCH_65_4_1_HOTFIX_COMPLETION.md` §5 — runnable ad-hoc using grep + awk + manual aggregation; refactor to scripted form when cohort grows past n=30. Decision options at end of observation: (a) keep multiplier at 1.0 if net contribution is positive, (b) tune multiplier up/down via DB, or (c) retire ladder design in favor of just-take-target-and-exit if even the slippage-buffer formula doesn't deliver positive net contribution.

8. **Low-volume pair exclusion from moonbag eligibility (added 2026-04-28, Kyle directive 2026-04-28).** Flagged decision for later: should low-volume pairs be EXCLUDED from moonbag/ladder eligibility entirely so they always exit at original target rather than ratcheting? Evidence from B65.4.1 verification 2026-04-28 (`B65_4_1_LADDER_TABLE_2026_04_28.md`): the ladder's biggest losses are concentrated on illiquid pairs (2Z/USD, ATH/USD, GWEI/USD, RENDER/USD/EUR, TAO/EUR) where slippage on the stop-out fill swallows the slippage buffer and pushes actual exit below the original target value. High-volume pairs (JUP, SNX, INX) show clean hotfix behavior. **Decision is deferred to allow more data accumulation** — Kyle directive 2026-04-28: "the longer we let it run, the more data we'll see, and it will be easier to make that decision." The decision belongs in the Phase 19.4.5 observational decision gate alongside item 7 (ladder net contribution). Implementation if approved: new `module_constants` entry `moonbag_min_volume_24h_usd` (seed e.g., $500K), checked in `isMoonbagQualifier` (`server/services/trailing-exit-controller.ts`) alongside the existing strategy/source-pool qualifier list. Pair-by-pair, DB-tunable. ~1-2 days work.

9. **Daily loss budget service + kill-switch auto-trip wiring (moved to dedicated 19.0.B 2026-05-21).** ⚠️ **Now sits as OPTIONAL Phase 19 batch 19.0.B above — see that section for full scope.** Item retained here for cross-reference only. Surfaced during B67 V2 pre-audit code-level inspection: (a) **no daily-loss aggregator service exists in the codebase** (grep on `dailyPnL|daily_pnl|aggregate.*loss` returns no service-level matches); (b) **the kill switch's `dailyLossKillSwitchPct` threshold is configured in `guardrails_v2` table (probably 25%) but no automated enforcement code exists** — `tripKillSwitch()` accepts `lossPercent`/`threshold` params but is only called manually via UI/API. The 25% kill switch is currently a manual safety mechanism, not an automated one. Phase 19 paper observation watches whether daily-loss-budget protection would have caught real loss patterns. **This gap MUST be closed before any real capital is at risk in live trading.** Live-trading activation is gated on this work being complete and tested. If Phase 19 observation supports building, build `server/services/daily-loss-budget.ts` (rolling 24h aggregator) AND wire kill-switch auto-trip when `dailyPnL / portfolioValue ≤ -dailyLossKillSwitchPct`. The same batch covers both: aggregator + auto-trip share infrastructure. Resulting service can ALSO be a regime-confidence consumer (B67 had originally scoped this as "Consumer #6"; Kyle directive 2026-04-28 deferred it here). Implementation effort if approved: ~1-2 weeks. **Independent safety-gap framing:** the auto-trip gap exists today regardless of B67 outcome — a hotfix to wire auto-trip on the existing manual mechanism can ship before Phase 19 if observation shows real risk OR if live-trading activation date approaches without the full service being ready.

**Decision artifacts:** at the end of the observation period, the gate produces a written decision document (likely named `PHASE_19_OBSERVATIONAL_DECISIONS.md` when it lands) that lists, for each of the 9 items above:

- What was actually observed
- Whether the threshold for moving the work pre-launch was met
- The decision (move pre-launch / keep post-launch / re-evaluate at next milestone)
- The justification

**Decision-making principle (Kyle directive 2026-04-26):** prefer NOT to build pre-launch fixes that will likely be replaced post-launch. The 19.4.5 gate exists specifically to prevent shipping interim patches that create technical debt. Only move post-launch work into pre-launch when the observed evidence shows the post-launch design point is materially different from what was assumed when the original sequencing was set.

**Why this gate exists:** during the pre-Phase-19 batches (B62 through B65.6), several investigations surfaced findings that COULD have justified pre-launch fixes but didn't have enough evidence to be sure. The findings paper for B65.6 is the canonical example — the per-pair classifier showed inverted confidence/outcome on 04-22, but no per-pair fix in the current input space was sharp enough to ship without unacceptable clean-day cost. The decision was to NOT ship something that might be replaced by Phase 19.5 AMR. This gate formalizes that pattern: defer pre-launch fixes to the observational stage when the evidence will be cleaner, then make final go/no-go calls with active-paper-trading data in hand.

**Phase 19.4.5 expected outcome:** a written decision document for each of the 6 observation items, plus any pre-launch reordering of subsequent work that the observations justify. By the end of 19.4.5 the team has empirical data about what the system actually does when running close to active conditions, which informs whether to proceed to Phase 20 (Production Hardening) directly or to insert additional pre-launch work (AMR, XStocks, Modularization, ML) first.

---

### 19.5 Adaptive Market Response (conditional)

**Status (2026-04-25):** Moved INTO Phase 19 (was previously listed as a separate Phase 19.5 conditional after the audit). Same conditional logic — decision gate at end of paper trading observations. Goal is to extend the existing rules-based mode overlay (Directive 11.7S) from defensive-only to a full adaptive market response — the system reads multiple weather signals, classifies current market conditions, and adjusts behavior both defensively (slow down, restrict, or pause in bad conditions) and offensively (lean in when conditions are unusually favorable).

**Goal**: Extend the existing rules-based mode overlay (Directive 11.7S) from defensive-only to a full adaptive market response — the system reads multiple weather signals, classifies current market conditions, and adjusts behavior both defensively (slow down, restrict, or pause in bad conditions) and offensively (lean in when conditions are unusually favorable).

**Concept document**: `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`

**Why conditional**: The system's existing protections (break-even lock, ladder trailing, SQE filtering, RTBQ slot caps) may absorb the streak phenomenon adequately at active-trading scale even without this layer. The streak phenomenon is real and measurable in the VTS, where the pipeline is permissive and unfiltered, but active-trading filters are strict. The right time to decide whether this layer is needed is after several days of paper trading data shows whether streaks actually appear at active-trading volume.

**Concept document**: `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`

**Why conditional**: The system's existing protections (break-even lock, ladder trailing, SQE filtering, RTBQ slot caps) may absorb the streak phenomenon adequately at active-trading scale even without this layer. The streak phenomenon is real and measurable in the VTS, where the pipeline is permissive and unfiltered, but active-trading filters are strict.

##### 19.5.1 Detection layer (richer weather report)

Replace the single-input stability sensor with a multi-input aggregator that reads:
- Regime state and how steady it has been (existing)
- Global DBS direction and trend (existing — DBS store)
- Realized vs. predicted EV gap (existing — telemetry aggregator)
- Pair-level regime distribution (existing — MCE per-pair)
- Friction trend (existing — cost cache)
- External signals when B67 lands (BTC dominance, funding rates, etc. — optional)

Output: single classification (calm / choppy / stormy / favorable) plus continuous confidence number.

#### 19.5.2 Offensive mode

Add a fourth driving mode (Aggressive / Favorable) to the existing Normal / Defensive / Survival set. Increases position size, broadens strategy roster, lowers confidence floor, shortens cooldowns when weather is unusually favorable.

#### 19.5.3 Tunable response dials

Promote hardcoded mode-overlay multipliers from `strategy-modes.ts` to `module_constants` table rows (aligns with B65.1 modularization).

#### 19.5.4 Calibration from VTS data

One-time pre-launch calibration: walk VTS closed-trade history, identify weather-indicator combinations that preceded long streaks (winning and losing), set detector thresholds based on identified patterns. This is the only step that requires VTS data, and it runs once before VTS shuts off in active-trading mode.

#### 19.5.5 Verification in paper

Restart paper with adaptive response live. Confirm that mode transitions fire when conditions warrant and that the response actions actually reduce losing-streak length and capture additional profit during favorable streaks.

**Relationship to Phase 17.5**: This is the rules-based pre-launch version of the same concept Phase 17.5 implements with machine learning post-launch. Same shape, two stages of sophistication. Phase 19.5 sets the rules manually; Phase 17.5 lets the system learn the rules from data.

**Expected outcome (if greenlit)**: Pre-launch system that responds to market conditions instead of treating all conditions identically. Reduces losing-streak length and amplifies favorable-streak capture. Tunable without redeploys. Calibrated against months of VTS data before going live.

### 19.6 External Source Connection & Capacity Diagnostics Dashboard (NEW 2026-06-02, Kyle directive)

**Status (2026-06-02):** Added to Phase 19 as the last operational sub-batch — diagnostics layer that hardens visibility before launch. Kyle directive 2026-06-02. Forward-compatible with the eventual ML/AI conversational layer (M5 in `ML_DESIGN_PRELIMINARY_2026-05-21.md`) — this dashboard's API surface is the same one the conversational overlay reads to answer "is everything healthy."

**Goal:** two new operator-facing diagnostics tabs that continuously monitor external data sources and internal compute capacity, surface health via a green / yellow / orange / red traffic-light system, and route degraded-or-worse states into the system-alerts queue so Langston and Claude Code sessions get notified per §10.5.

#### 19.6.1 External-Source Connection Dashboard

Per-source rows for every external API the system reads — Kraken (spot WS, equities WS, futures WS, REST, AssetPairs), CoinGecko (xStock discovery + crypto macro), Finnhub (sector tags), and any future feed wired in. Within each source, a row per *category* of data being pulled (e.g. Kraken spot: ticker channel, OHLC channel, trades channel, order book channel; CoinGecko: symbol discovery, macro). Each category shows:

| Status | Meaning |
|---|---|
| 🟢 Green | Working as expected — fresh data, within sanity baselines, well under API limits |
| 🟡 Yellow | Working but with intermittent disruptions (sporadic timeouts, brief feed gaps, approaching but under limits) |
| 🟠 Orange | Shaky — investigation warranted (sustained partial outages, sanity-check anomalies, API limit pressure ≥80%) |
| 🔴 Red | Off — no data flowing, or data flowing but failing baseline sanity checks |

**Two checks per category, not one:**
1. **Is data flowing?** Last-update freshness vs an expected cadence per category (e.g. ticker channel <2s, OHLC channel ≤60s, CoinGecko symbol discovery ≤24h).
2. **Does the data look right?** Per-category sanity baselines — NOT exhaustive per-pair validation. Examples: ticker prices within plausible bounds (not zero, not absurd), OHLC bar counts within an expected range per cycle, symbol discovery returning a stable count (within ±N% of recent baseline), sector tags returning the expected enum set. The "baseline" is defined per category and stored as a small set of expected-range constants; the dashboard flags categories whose live data falls outside the baseline range.

**API-limit pane (per source AND DawnTrader-wide):**
- Per-source usage vs that source's published rate-limit ceiling, expressed as a percentage with the same traffic-light tier.
- A DawnTrader-wide total throughput indicator showing aggregate inbound data rate vs the system's measured capacity (queue depths, persistence-pipeline lag, DB write throughput).
- Orange or red on either pane fires a system-alerts entry.

#### 19.6.2 CPU / Process Capacity Dashboard

A second tab listing every major process the system depends on at any given time and their live state:
- Scanner workers (FX5 crypto, xStock spot, xStock perp).
- Archivers (equity-spot, equity-perp, crypto-spot — the B74 chain).
- VTS runner.
- Active-trading orchestrator (when Phase 19 reactivates it).
- TEC / exit-decision service.
- Session-lifecycle controller.
- System-alerts dispatcher.
- DB pool + write batchers.
- ML sidecar (when it lands per Phase 17/18).

Each row shows: running / not running, current CPU%, memory footprint, queue depth or backlog where applicable, and the same green/yellow/orange/red status against per-process capacity envelopes. Aggregate CPU% and memory% against the host's total capacity are displayed at the top of the tab. Approaching capacity (≥80% sustained) is orange; saturated or process-down is red.

#### 19.6.3 Alert integration

Both dashboards write to `system-alerts.jsonl` (per §10.5) on yellow→orange or orange→red transitions, with severity matching the new tier (warning for orange, critical for red). The standing per-turn alerts-check protocol (CLAUDE.md §10.5) then surfaces them to whichever CC or Langston session is at the keyboard, plus Kyle via Telegram if severity is critical and during-RTH. Yellow alone does NOT fire an alert (would flood); yellow is a dashboard-only visibility state.

#### 19.6.4 Forward role — ML / AI conversational layer API

When the ML conversational layer (M5) lands in Phase 17/18, its "is everything healthy" question reads the SAME API surface this dashboard exposes. So the endpoints built here become a permanent part of the system's introspection layer, not a Phase-19-only artifact. Naming convention: `/api/diagnostics/external-sources/...` and `/api/diagnostics/process-capacity/...` so the surface is discoverable by both the dashboard frontend and any future programmatic consumer.

#### 19.6.5 Scope shape & sequencing

- Position: **last operational sub-batch of Phase 19** per Kyle directive. After SQE recalibration (19.4), the observational decision gate (19.4.5), and any AMR work that lands; before Phase 20 production hardening opens.
- Estimated scope: two new React tabs + ~6 new API endpoints + per-category baseline-range constants in `module_constants` (so baselines are DB-tunable per CLAUDE.md §5 #15) + per-process capacity envelopes also in `module_constants` + alert-emitter wiring. Roughly 1 week's batch — moderate surface, low risk because it's read-only diagnostics + alert writes.
- Tier 1 governance: scope file, pre-audit consulting SIM for every monitored process, completion report. No new DB tables required (re-uses `system-alerts.jsonl` queue + `module_constants` for tunable baselines).

**Phase 19 expected outcome**: Fully debugged paper trading system with optional SQE recalibration (19.4), Adaptive Market Response brain (now Phase 25 — see top-of-file 2026-05-23 update), and end-of-phase diagnostics dashboards (19.6) covering external-source health and internal compute capacity wired into the alerts queue. All components validated. Ready for production hardening.

---

## Phase 20: Production Hardening (Weeks 37-40)

**Goal**: Harden the system for live trading. Fix all remaining infrastructure, security, and quality concerns.

### 20.1 Database Phase D: Migration Rebaseline
- Generate fresh baseline migration from current schema.ts
- Archive old migration files
- Switch from `drizzle-kit push` to `drizzle-kit generate` + `drizzle-kit migrate`

### 20.2 Database Phase E: Index & Retention Hygiene
- Audit index usage via `pg_stat_user_indexes`
- Drop unused indexes
- Implement retention policies (Hot 0-30d / Warm 30-90d / Cold 90d+)
- Time-based partitioning for high-volume append-only tables

### 20.3 Test Infrastructure
- Add unified test runner scripts (`test:unit`, `test:e2e`, `test:all`)
- Install @testing-library/react + jest-dom for frontend tests
- Minimum frontend test targets: auth token refresh, TradingModeContext, WebSocket reconnection, TopBar start/stop
- Property-based testing for core math (fast-check)
- CI/CD pipeline (GitHub Actions workflow)

### 20.4 Security Finalization
- RBAC enforcement standardization across all routes (RISK-055)
- API versioning (`/api/v1/` namespace) (RISK-056)
- JWT token migration from localStorage to httpOnly cookies (RISK-063)
- Endpoint cleanup: remove any remaining unused server endpoints

### 20.5 Architecture Cleanup
- Decompose monolithic pages (enhanced-system-monitoring 4,528 lines, ai-transparency 2,074 lines)
- Define centralized polling policy (POLLING_TIERS)
- Decompose routes.ts into domain-specific route files

**Expected outcome**: Production-grade infrastructure. Tests, security, database hygiene all at deployment standard.

---

## Phase 21: Live Mode Activation (Weeks 40-43)

**Goal**: Create and validate live mode trading on Kraken.

### 21.1 Live Mode Engine
- Create Live Mode trading engine based on Paper Mode trading engine
- Resolve BUG-010, BUG-011 (TradingEngine placeholder code for live mode)
- Validate Kraken API integration for live orders (long AND short if confirmed)
- Test live order execution path end-to-end
- Validate kill switch functions correctly for live mode

### 21.2 Paper-to-Live Transition Testing
- Run parallel paper+live (small position sizes) to validate consistency
- Compare paper sim results with live execution results
- Validate fee/slippage models against actual Kraken fills
- Validate cost-model accuracy against real Kraken fee schedules

### 21.3 Live Mode Guardrails
- Validate all risk management guardrails for live mode
- Test emergency shutdown procedures
- Validate database monitoring alerts function correctly
- Confirm ML Safe Mode fallback works under live conditions
- Verify predictive execution bounds hold under real market volatility

**Expected outcome**: Live trading validated. Parallel paper+live confirms consistency. Ready for production.

---

## Phase 22: Publication (Weeks 43+)

**Goal**: Prepare the application for production deployment.

### 22.1 Build & Deploy Pipeline
- Production build validation
- Environment configuration (staging vs production)
- Database provisioning (consider Neon tier upgrade if approaching 10 GB)

### 22.2 Monitoring & Observability
- Production logging strategy (structured logging replacing console.log)
- Health monitoring endpoints
- Performance monitoring
- Error alerting
- ML performance dashboards (live)


---

## Phase 21.4: Modularization — 8-Module Architectural Extraction (Post-Live, formalized 2026-04-26, refined 2026-04-26)

**Status:** Formally inserted into the roadmap on 2026-04-26 in response to Kyle's question about where comprehensive lever-to-database migration lives. The phase has existed as an architectural plan in `Claude Comms and Packages/Scope Files/MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` since B63 close, but was not formally scheduled as a discrete phase header in this roadmap until now.

**Refinement 2026-04-26 (Kyle directive):** Comprehensive lever-to-`module_constants` migration was originally placed here, but per Kyle's go-live design intent, all levers must be DB-tunable BEFORE live trading. Lever migration moves to **B72 pre-launch** (final pre-Phase-19 batch). **B72 SHIPPED 2026-05-05 + B72.1 2026-05-05 + B72.2 2026-05-06** — 34 modules / ~163 rows now live. Phase 21.4 retains only the 8-module architectural extraction work, which is the heavy structural decomposition that benefits from live-trading evidence on which modules need which resolution scopes.

**Goal:** Extract 8 canonical modules from the current monolith. The 5D `(exchange, asset_class, filter, strategy, regime)` resolution matrix is already in place (B65.1 module_constants infrastructure + B72 comprehensive lever migration); Phase 21.4 wires the modules together against that matrix.

**Why post-live:** the architectural decomposition is a coherent exercise that benefits from being done once with full intent. By post-live, the system has live-trading evidence for which boundaries between modules matter most. Phase 21.4 is the prerequisite for Phase 21.5 (Exchange Expansion — XStocks + Perpetual Futures); without the 8-module decomposition, every new exchange or asset class would have to thread through the existing monolith.

**Pre-launch preview in Phase 19.0 (added 2026-04-26, renumbered from 18.5):** two of Phase 21.4's eight canonical modules — Exchange Adapter and Filter Module Family — land pre-launch as part of the VTS-partition work in Phase 19.0 (which sits at the very start of Phase 19, before paper audit work begins). The pre-launch versions are scoped to the VTS observation surface only (low-risk, doesn't affect active trading). Phase 21.4 then extends the same pattern to all 8 modules across the active-trading system. By that point the architectural pattern has been validated in production for months.

**Why before Phase 21.5 Exchange Expansion:** the 5D matrix is the prerequisite for adding new exchanges and asset classes in Phase 21.5. Without modularization, every new exchange or asset class would have to thread through the existing monolith — defeating the architectural intent.

**Addition 2026-04-29 (Kyle directive):** **Exit-strategy interface + per-asset-class strategy selection** is extracted as part of the 8-module architectural extraction. Triggered by B73 ablation findings (multi-week observation of 12 BE-stop / trailing-stop variants). Even if crypto data says "disable both BE and trail," equities have different microstructure (lower noise, slower retraces, gap risk) — exit-management should be pluggable so different asset classes can plug in different strategies. The IExitStrategy interface design is INFORMED by B73 outcomes, not designed speculatively before data. No pre-launch batch for this — it lands as part of Phase 21.4 whenever the modularization phase happens.

### 21.4.1 8-module extraction

Per `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md`:

1. **Exchange Adapter** — abstracts exchange-specific I/O (Kraken REST/WS, future Binance/Coinbase/etc.)
2. **Filter Module Family** — pluggable filter set per asset class
3. **Context Provider (MCE)** — extended to consume external data (B67/B68 outputs)
4. **Eligibility** — gates which signals proceed to scoring
5. **Scoring Kernel** — computes FinalScore / HybridScore / etc. with module_constants-resolved weights
6. **Threshold** — DB-tunable per (exchange, asset_class, filter, strategy, regime)
7. **Profitability** — net-EV computation with friction, slippage, fees
8. **Ranking** — ranks eligible signals for slot allocation

### 21.4.2 ~~Comprehensive lever-to-`module_constants` migration~~ — MOVED TO B72 (pre-launch) — ✅ SHIPPED 2026-05-05

Per Kyle directive 2026-04-26: comprehensive lever migration moved to **B72 pre-launch** as the final pre-Phase-19 batch. **B72 SHIPPED 2026-05-05** + **B72.1 SHIPPED 2026-05-05** + **B72.2 SHIPPED 2026-05-06**. 34 modules / ~163 rows live in production sync-read paths; 18/18 canonical strategies DB-tunable. Original go-live design intent (all levers DB-tunable before live trading) achieved. This phase retains only the architectural extraction work (§21.4.1). See `BATCH_CATALOG.md` rows 212-214 + `BATCH_72_COMPLETION_REPORT.md` + `BATCH_72_2_COMPLETION_REPORT.md`.

### 21.4.3 storage.ts modularization (folded in from Phase 16.2)

Phase 16.2's "storage.ts must be modularized BEFORE legacy tables are dropped" is also covered here as part of the 8-module extraction (Exchange Adapter + per-domain storage). The Phase 16 reference may need to be re-sequenced if the modularization phase happens later than Phase 16; alternative is to do a minimum storage.ts split as part of Phase 16 cleanup and the full split as part of 21.4.

**Phase 21.4 expected outcome:** monolith decomposed into 8 modules. With B72 lever migration already complete pre-launch, the 5D resolution matrix is populated and the modules just need to be wired against it. Adding a new exchange or asset class in Phase 21.5 becomes a configuration-and-adapter exercise, not a code-rewrite exercise.

---

## Phase 21.5: Exchange Expansion — Perpetual Futures (Post-Live)

**Status (2026-05-21):** XStocks already integrated pre-launch (Phase 24 closed 2026-05-10; xstock_spot universe expanded to ~450+ tokenized equities including Fortune 500 / NASDAQ / ETFs / index funds after the May discovery of ~220 previously-unrecognized feeds). Phase 21.5 now narrows to PERPETUAL FUTURES only.

**Goal**: Onboard Kraken Futures (~10 perpetual pairs) as the next asset class after live activation. Apply the canonical asset-class onboarding workflow (`ASSET_CLASS_ONBOARDING_WORKFLOW.md`) refined through xstock_spot.

**Why post-live**: Kraken Futures has only ~10 perp pairs — the marginal universe expansion is small relative to the 450+ tokenized equities the live system already trades. The calendar weeks needed for a clean perp onboarding (Day 0 friction extraction, funding-rate macro extension, leverage/liquidation guardrails, perpetual settlement, observation window) are better spent on Phase 19 paper audit pre-launch and reserved for post-launch when live data is informing the onboarding choices.

### 21.5.1 ~~Kraken XStocks Integration~~ — ✅ COMPLETE PRE-LAUNCH (Phase 24, 2026-05-10)

xstock_spot fully onboarded across 9 sub-batches. ~450+ tokenized equities feeding the system post-discovery (May 2026). See Phase 24 close note above.

### 21.5.2 Perpetual Futures Integration
- Add Kraken Futures API endpoints
- Funding rate awareness in cost model
- Leverage-aware position sizing in guardrails
- Short trading capability (futures enable shorts without capital constraints)
- Futures-specific risk management (liquidation prevention, margin monitoring)

### 21.5.3 Cross-Asset Infrastructure
- Unified portfolio view across asset classes
- Asset-class-aware regime classification (crypto, equity, futures may have different regime characteristics)
- Performance tracking per asset class

---

## Post-Launch Enhancement Priorities

These items are deferred and not currently sequenced. Listed for reference:

### WebSocket Event Triggers
- Real-time Kraken WebSocket feeds for time-sensitive opportunity detection between scan cycles
- Supplements (does not replace) timer-based scanning

### Parallel Signal Generation
- Promise.all batching in evaluateMarket() for concurrent pair evaluation
- Only if throughput becomes a constraint

---

## Timeline Summary (Revised 2026-04-09)

| Phase | Status | Key Milestone |
|-------|--------|---------------|
| **Phase 12: Cleanup & Foundation** | ✅ COMPLETE | Math fixed, ~200+ dead files removed, pipeline unified |
| **Phase 13: MCE Installation** | ✅ COMPLETE | MCE as authoritative data provider |
| **Phase 14.1-14.2: VTS + DBS** | ✅ COMPLETE | Real signals, regime, directional bias |
| **Phase 14.5: Pattern Scanning + Ranking** | ✅ COMPLETE | Dual-path scanning, merit-based ranking, filter diagnostics |
| **Phase 14.6: Family-Qualified Identity** | ✅ COMPLETE | Family IMF, data truth, pipeline metrics |
| **Phase 14.7: Strategy Calibration** | ✅ COMPLETE | 17-strategy audit, pattern recognizer, hardcoded defaults removed |
| **Migration (Batch 40-47)** | ✅ COMPLETE | Hetzner + Supabase, post-migration stabilization |
| **Phase 11.8: Adjustment Framework + Baseline** | **NEXT** | Defines adjustment bounds, establishes authority baseline |
| **Phase 15+16: Smart Thermostat + DB Cleanup** | PLANNED | Rules-based adaptive filters + legacy table/schema cleanup |
| **Phase 19: Paper Mode Audit & Debug** | PLANNED | Full system validated in paper trading |
| **Phase 20: Production Hardening** | PLANNED | Testing, security, RBAC, deployment pipeline |
| **Phase 21: Live Mode Activation** | PLANNED | Real Kraken orders, paper-to-live validation |
| **Phase 21.5: XStocks + Perpetual Futures** | PLANNED (post-live) | Kraken tokenized stocks + futures integration |
| **Phase 17: Machine Learning Design** | PLANNED (post-live) | ML architecture blueprint (Directive 18.0) |
| **Phase 18: Machine Learning Implementation** | PLANNED (post-live) | ML system built, Crawl/Walk/Run/Fly |
| **Phase 22: Publication & Monitoring** | PLANNED | Production deploy, observability, structured logging |
| **Phase 20: Production Hardening** | 37-40 | Tests, security, database, architecture finalized |
| **Phase 21: Live Mode Activation** | 40-43 | Live trading validated on Kraken |
| **Phase 22: Publication** | 43+ | Production deployment |

**Total estimated duration**: ~43+ weeks (vs ~20 weeks in v1 roadmap)

> **Why the difference**: The v1 roadmap omitted Directional Bias, Short Trading, Adjustment Framework, Authority Baseline, Predictive Execution, and the entire Machine Learning design & implementation cycle. These are not optional — they are core to Kyle's vision of a system that goes live with adaptive intelligence, not static filters.

---

## Phase Dependency Chain

```
Phase 12 (Math + Dead Code + Pipeline) ── COMPLETE
    └→ Phase 13 (MCE) ── COMPLETE
        └→ Phase 14.1 (VTS Real Calcs) ── COMPLETE
            ├→ Phase 14.2 (DBS) ── EFFECTIVELY COMPLETE (Batch 15)
            ├→ Phase 14.3 (Short Trading) ── DEFERRED INDEFINITELY
            ├→ Phase 14.4 (Data Backfill) ── CANCELED
            │
            └→ Phase 14.5 (Pattern Scanning + Ranking + Regime Pre-Filter) ← NEXT
                └→ Phase 11 Final (11.8B-E, 11.8C)
                    └→ Phase 15 (Adaptive Weights + Rules Engine + Monitor)
                        └→ Phase 19 (Paper Debug)
                            └→ Phase 20 (Hardening)
                                └→ Phase 21 (Live Mode)

Post-Launch: Exchange Expansion → ML (Phase 17+18) → AWS/Supabase Migration
```

---

## Risk Assessment

### Highest Risk Actions
1. **Phase 14.5 Dual-Path Pattern Scanning** (Batch 19) — Adds pattern pool alongside existing quant pool in FX5 scanner and signal orchestrator. Risk: Pattern signals with lower quality could dilute RTB queue if ranking weights miscalibrated.
2. **Phase 11 Finalization — Adjustment Framework** (11.8B-E) — Wiring predictive learning adjustments into live filter modifications. Risk: Bad adjustments could systematically degrade signal quality.
3. **ML Integration** (Phase 18.3) — Wiring ML output into live decision systems. Requires Safe Mode fallback.
4. **Live Mode Activation** (Phase 21) — Transitioning from paper to real money. Risk: Any latent bugs in execution pipeline become financial losses.
5. **Exchange Expansion** (Post-launch) — Adding new exchange with different API, order types, and fee structures. Risk: Integration complexity and regulatory differences.

### Lowest Risk Actions (Quick Wins)
1. **12.1.6 LSP Error Triage** — ~620 type annotation errors. Low severity, no logic impact. Deferred.
2. **BUG-021 system-config.tsx fetch** — Replace raw fetch() with apiRequest. Standalone, no dependencies.
3. **BUG-022 duplicate tab value** — Rename duplicate "learning" tab value. Trivial UI fix.
4. **Global Regime Pre-Filter** (Phase 14.5 Part C) — Small effort, uses existing BTC OHLC from MCE. Low risk.
5. **Regime archive stale data cleanup** — Purge pre-HF9 telemetry with old regime names from archive files.

### Critical Decision Points Requiring Kyle Input
1. ~~**Phase 14.3**: Does Kraken confirm short trading?~~ **RESOLVED** — DEFERRED INDEFINITELY (capital constraint). Replaced by Exchange Expansion post-launch.
2. **Phase 17**: ML architecture brainstorming session needed. In-process vs microservice? Which ML libraries? What's the inference latency budget?
3. **Phase 18**: Crawl-Walk-Run-Fly milestones — at what point is ML "good enough" to proceed to Paper Debug?
4. **Phase 21**: Position sizes for parallel paper+live testing. What's the risk budget for live validation?
5. **Exchange Selection**: Which exchange to add post-launch? Must support stocks/ETFs/tokenized assets/futures.

---

## Mapping to Kyle's "Next Steps" Document (Cross-Reference)

| Kyle's Next Steps Item | Roadmap Phase | Notes |
|------------------------|---------------|-------|
| Complete audit for MCE install | Phase 12 (done) | System audit is the 11-phase work we just completed |
| Install the MCE | Phase 13 | MCE / Counsel / Group Think installation |
| VTS to mirror strategy calcs / create real signals | Phase 14.1 | Strategy-specific VTS calculations |
| VTS to calculate signals for all strategies per regime | Phase 14.1 | Included in real VTS implementation |
| Clear simulated VTS data / backfill | Phase 14.4 | Data clear + backfill with real calculations |
| FinalScore, Hybrid Score, etc. fed into predictive learning | Phase 14.1, 14.4 | Verified during backfill |
| Finish 11.8B-E and 11.8C | Phase 11 Finalization | After MCE + VTS, before live |
| Check for other outstanding Phase 11 fixes | Phase 11 Finalization | Part of closing Phase 11 |
| Add Directional Bias + Structural Regime | Phase 14.2 | Includes Global/Pair-level + Friction |
| Backfill VTS with Directional Bias | Phase 14.4 | Part of data backfill |
| Add Short trading | Phase 14.3 | Requires Kraken confirmation |
| Add Machine Learning | Phase 17 (design) + Phase 18 (build) | Full ML lifecycle |
| Run, audit, debug Paper Mode | Phase 19 | Extended paper trading validation |
| Delete legacy files, fix LSP errors | Phase 12.2 + Phase 16 | Split across pre-MCE and post-MCE cleanup |
| Create Live Mode trading engine | Phase 21 | Based on Paper Mode engine |

---

## Pushback on Original Sequencing (Updated)

The v1 roadmap's pushback on "MCE first" still applies — Phases 12.1-12.3 (math fixes, dead code purge, pipeline unification) must precede MCE. But the v1 roadmap also had a critical gap: it went directly from VTS → L-Series removal → production hardening → live mode, skipping:

- **The Adjustment Framework and Authority Baseline** — Without these, the system goes live with static filters. Kyle's own document says this is unacceptable: "You want Version 2 (Smart Thermostat) before you go live. Not Version 1 (static). Not Version 3 (ML) yet."
- **Directional Bias** — The regime model is incomplete without it. VTS signals generated without Directional Bias are missing a key dimension.
- **Short Trading** — Cuts available strategy space roughly in half if omitted.
- **Machine Learning** — Kyle's plan was always to have ML before going live. The "Plan to Create a Plan" document outlines a 6-7 week design phase alone.

The revised roadmap captures all of this. The tradeoff is timeline: ~43 weeks vs ~20 weeks. But the ~20 week estimate was for a stripped-down version that would have gone live with static filters, no Directional Bias, no short trading, and no ML. That's not the system Kyle is building.

---

*Roadmap v2 complete. Incorporates all four source documents. Ready for Kyle's review and approval before Phase 12 Directive 12.1 is written.*

---

## Phase 19.x — Boot Readiness Coordinator (added 2026-05-08, Kyle directive)

**Status:** DEFERRED to Phase 19. NOT pre-launch.

**Trigger:** B79.TEC scope work (2026-05-08) surfaced that the current boot architecture is a patchwork — 12 separate bootstrap files in `server/startup/`, 8 separate health/monitor files in `server/services/`, the existing `SystemHealthMonitor` itself broken (`startPeriodicChecks is not a function` per PM2 logs), bootstraps run AFTER `server.listen()` so the app accepts traffic before subsystems are ready, and per-component error-handling is inconsistent (B74/B70 catch-and-continue, others throw, others silently degrade).

**Kyle directive 2026-05-08:** the patchwork is no bigger of an issue than any other subsystem during the patchwork era. Defer the unified coordinator to Phase 19. For B79.TEC specifically, ship hard-fail-on-boot with no env-flag carve-out (both production and dev hard-fail). If patchwork issues compound during Phase 19 paper-mode testing, address with the coordinator design then.

**Phase 19.x scope (number TBD when Phase 19 work formally begins):**

1. **Single Boot Readiness Coordinator service** registering all critical subsystems with declared dependencies.
2. **Per-subsystem readiness contract:** `register({name, dependsOn[], readinessCheck(), diagnose(), waitPolicy})`. Each subsystem declares its dependencies + how to check it's healthy + a diagnostic provider for failure cases + retry/wait policy (hard-fail, retry-with-backoff, retry-with-eta-from-external).
3. **Dependency-ordered boot.** Coordinator runs subsystems in topological order — `db_pool_ready` before `module_constants_warmup`, `module_constants_warmup` before `tec_config`, `tec_config` before `fx5_scanner`, etc.
4. **Single consolidated status surface.** Operator (Kyle) gets one Telegram message per state transition: "Booting... 11/14 green, waiting on Supabase (ETA 8 min based on retry response), full operation will resume when complete." Not noise from individual subsystems.
5. **All-green-before-traffic gate.** App refuses to accept production traffic until all subsystems green. Server.listen() moved BEHIND the coordinator's all-green signal.
6. **Continuous operation monitoring.** After full-green, coordinator continues to monitor — if a subsystem flips red mid-operation, alert with diagnosis.
7. **Replaces the patchwork:** consolidates the 12 bootstrap files + 8 health monitors. Fixes the broken `SystemHealthMonitor`. Standardizes error-handling across all subsystems.

**Why deferring is acceptable:** the patchwork has been running for many batches without recurring boot failures. B79.TEC's hard-fail handles its own correctness regardless of the broader boot architecture. The coordinator is cleanup work that benefits long-term maintainability, not a critical-path fix.

**Trigger conditions to escalate ahead of Phase 19:**
- Phase 19.0 VTS partition surfaces multiple boot-coordination bugs
- Phase 19.1 paper-trading run shows boot-related cascading failures
- Any new asset class onboarding (B80+) is significantly delayed by patchwork integration
