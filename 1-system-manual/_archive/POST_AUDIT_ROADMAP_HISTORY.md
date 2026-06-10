# POST_AUDIT_ROADMAP — HISTORICAL ARCHIVE

> **Created 2026-06-10** as part of the roadmap reorganization (Kyle-approved + Langston-approved 2026-06-10). This file preserves, VERBATIM, every section moved out of the live `1-system-manual/POST_AUDIT_ROADMAP.md` during the reorg — the original header, the "Where We Are" snapshot, the seven dated update blocks, the February-era state assessment and strategic-sequencing sections, the completed-phase detail (Phases 12, 13, 14, 11-Finalization, 15a, 15b), the superseded Phase-19.0 VTS-partition and §19.5 AMR sections, and the stale timeline/dependency/risk/mapping/pushback sections.
>
> **Nothing here is live planning.** The live plan is `POST_AUDIT_ROADMAP.md`. Several sections below contain decisions that were SUPERSEDED by later ones — read dates carefully and treat the live doc + `PHASE_24_TO_19_READINESS_CHECKLIST.md` as the only current truth. Each section below is labeled with its original line range in the pre-reorg file (final pre-reorg state, 1,777 lines, roadmap-path commit `cb5228363`).

---


<!-- ═══ ARCHIVED SECTION: Original document header — original lines 1-13 ═══ -->

# DawnTrader Post-Audit Roadmap

> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Created**: 2026-02-17
> **Revised**: 2026-06-08 (currency reconciliation during the Phase-24 governance-close audit — see the updated "Where We Are" note below + the `### 2026-06-05 update` section. The canonical CURRENT ordering lives in `PHASE_24_TO_19_READINESS_CHECKLIST.md`.)
> **Revised**: 2026-04-14 (v7 — Phase 15b restructured: B60 Smart Thermostat DEFERRED to post-live. New Phase 15b = Regime/DBS/Strategy/Filter Restructure (B61-B65). Locked via three-way consensus 2026-04-14.)
> **Revised**: 2026-04-12 (v6 — Phase 11 Finalization governance + code complete (B58). Adjustment Framework + Authority Baseline deployed. CI TS issue #39 flagged.)
> **Purpose**: Complete roadmap from current state through live mode trading and publication. Uses formal DawnTrader phase numbering.
> **Companion Documents**: SYSTEM_MANUAL.md (what the system IS), CHANGES_AND_FIXES.md (22 bugs, 85 risks), LEGACY_DEPRECATION_PLAN.md (removal waves), ADJUSTMENT_FRAMEWORK.md (parameter governance), AUTHORITY_BASELINE.md (V1.0 snapshot)
> **Source Documents Incorporated**: "Dawn Trader Next Steps After MCE Build" (2.14.26), "DT Phase 11.8 Final Steps" (2.6.26), "DT Predictive Learning Calibration" (2.2.26), "The Plan to Create A Plan for Machine Learning" (1.17.26)

---


<!-- ═══ ARCHIVED SECTION: "Where We Are" snapshot block — original lines 14-41 ═══ -->

## Where We Are

> **★ CURRENT (2026-06-09):** **Phase 24 (xstock_spot onboarding) is GOVERNANCE-CLOSED.** The system is executing the **between-Phase-24→19 plan** (canonical ordering: `PHASE_24_TO_19_READINESS_CHECKLIST.md`): items 1 (onboarding-workflow rebuild), 2 (Phase-24 governance close), 3 (ml-service RETIRED via B-NEW-54), and 3.5 (RUNNING_ISSUES→roadmap-homing audit + this reorder) are DONE; now on item 4 (VTS standalone always-on simulation service + storage-architecture design), then the item-4 throughput-study REMEDIATION batch + **4.6 (scan-stall + disk hygiene, NEW 2026-06-10** — Langston root-caused the event-loop stalls: the ~306-pair scan pins the CPU ~2s ~25×/hr, skipping clockwork jobs; plus a 43GB leftover debug log + 64k stale diagnostic files, disk 79%. Hygiene half executes immediately post-study; the structural scan fix is scoped from the throughput-study output and lands BEFORE 4.5/4.7 — full detail in the readiness checklist item 4.6**)**, then 4.5 (Kraken tiered-fee-model fix), **4.7 (per-asset-class regime / B-NEW-48, NEW 2026-06-09)**, 5 (AMR body) → then **Phase 19**. Active trading OFF throughout.
>
> **★★ CANONICAL EXECUTION ORDER — phase NUMBERS are NOT the run order (Kyle decision 2026-06-08; this is a SUMMARY — the literal source of truth is `PHASE_24_TO_19_READINESS_CHECKLIST.md` §1 "CANONICAL EXECUTION ORDER AFTER PHASE 19", which governs if any wording diverges):** run STRICTLY SEQUENTIAL, not parallel — correctness over speed. **(1) Phase 19** — Paper Mode Audit & Debug (turn paper-active trading back on, full pipeline → Kraken paper order system; debug end-to-end). **(2) Phase 25** — Calibration With Evidence (calibrate everything against live Kraken paper-sim results; go-live gate = calibrate in paper until COMFORTABLE with wins/losses/profit). **(3) Phase 16 + Phase 20** — Database/Legacy Cleanup + Production Hardening, on the now-stable system (EXCEPTION: the §16.7 test-suite cleanup happens at the START of Phase 19 as a debugging-enabler). **(4) Phase 21** — Live Mode Activation. **Numbering ≠ run order:** Phase 25 (calibration) runs right after 19; **Phase 22 (Publication) runs AFTER live (post-21)**; **Phase 26 = crypto_perp perpetual-futures onboarding** (the old "Phase 25" label before reuse), post-launch no-SLA; **Phase 17/18 (real ML)** post-live. Paper mode is PERMANENT — it keeps running post-live as the testing ground.
>
> The phase-status snapshot below is the historical Phase-11→15 record; the post-15 detail lives in the `### 2026-06-05 update` section + the locked Phase tables further down.

**Last completed batch** (historical snapshot, as of 2026-04-14): Batch 59 (Phase 15a — Predictive Learning UI Audit & Data Path Fixes). *(Since then: Phase 15b/15c → Phase 16 / 18 / 24; the current batch series is the B79.0n / B-XSTOCK-CALIB / B-NEW-\* era — see `BATCH_CATALOG.md` + `PHASE_HISTORY.md` for the live record.)*
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


<!-- ═══ ARCHIVED SECTION: 2026-06-05 update — strategic directions + VTS-standalone resequence — original lines 42-57 ═══ -->

### 2026-06-05 update — Strategic directions folded in + VTS-standalone RESEQUENCED (Kyle directive 2026-06-05)

Following the Hidden-Contextual-Edge (HCE) study + Kyle ↔ CC strategy discussion. Full detail + evidence/sources in **`1-system-manual/STRATEGIC_DIRECTIONS_AND_AI_EDGE.md`** (single home). Anchor finding: no hidden contextual edge inside the trades we already take; the path to profit is **selectivity + sizing + discipline + new data/structure**, not a loophole. Selectivity demonstrably works on xStock (top-decile by expected-edge → net-positive; top 2% +1.17%/52% win); crypto edge-scoring is mis-calibrated at the top (Phase-25 fix). Sequencing decisions:

- **VTS independent standalone (firehose) RESEQUENCED: post-launch → BETWEEN Phase 24 and Phase 19** (reverses the 2026-05-21 "VTS partition deferred to post-launch, possibly never built"). Reason: Phase 19 turning active on loses the continuous learning baseline (queue/active state doesn't persist; VTS stops). Unblock design: **ingest market data ONCE, fan out to N consumers** (VTS/paper/live) → zero extra Kraken API calls (kills the rate-limit blocker behind the original deferral). **Two simulated jobs, not one:** firehose (broad learning, drift, pattern-path negative-control) built pre-19; **shadow = paper mode** (faithful one-best-per-cycle selective pipeline on sim fills) built AS Phase 19.
- **Execution / friction reduction → Phase 19** (maker/limit orders, depth-aware sizing, high EV bar early).
- **AMR placement CONFIRMED (Kyle 2026-06-05, per the recorded decision):** the AMR **BODY** is a **pre-Phase-19 batch** — roadmap **item 19-19** (CC + Langston consensus 2026-05-28; sequencing reconciled 2026-06-08: it is the **LAST item (item 5) of the Phase-24→19 plan** — after the onboarding-workflow finalize (done), the Phase-24 governance close, the ml-service fix, the VTS standalone service, and the Kraken fee-model fix; before Phase 19 kickoff. The xStock-calibration TAIL is decoupled to Phase 25 (Kyle 2026-06-05) and is NOT an AMR precondition. Shadow-gated for the first ~5-7 days of Phase 19, then DB-flag to active). The Phase-25 "AMR build/skip" item (item 62) is only the **brain** (the M2 ML model that later replaces the body's hand-set thresholds). No tension — body pre-19, brain-calibration Phase 25. **Adaptive trend-following (volatility-adaptive lookbacks)** = candidate to fold into the AMR body's weather/response-dial layer (Kyle: "could be an option"; evidence: time-series momentum + adaptive lookbacks = strongest crypto edge) — a design question for the AMR-body scope, NOT a separate placement. **Layer distinction (Langston): adaptive lookbacks live INSIDE the strategy at signal generation; AMR dials are OUTSIDE-strategy posture — AMR may bias which lookback regime is active, but the lookback adaptation is not itself an AMR dial.**
  - **AMR-body precondition RESOLVED (Kyle override 2026-06-05):** AMR was scheduled pre-Phase-19 INDEPENDENTLY, before any xStock-calibration work existed — so it does NOT gate on the xStock-calibration umbrella at all. **The AMR body proceeds pre-Phase-19 on its own schedule.** The xStock calibration-resume steps that cannot finish pre-19 (Step 2 pattern-negative-control + Step 3b buy-the-dip forward-validation — both need paper-active outcomes) **move to Phase 25** (calibration-with-evidence), NOT Phase-19-acceptance. The pre-19 xStock work (Step 1 soak + Step 3a EV-gate calibration + Step 4 gate-placement architecture) proceeds pre-19. (Supersedes the earlier Langston "gate the AMR body on the pre-19-closeable subset" framing — Kyle decoupled AMR from the xStock umbrella entirely.) See `XSTOCK_CALIB_RESUME_SCOPE.md` (close-boundary section).
- **Alt-data ranking layer → Phase 25+ data layer:** AI/LLM scoring of news/earnings/events (xStocks) + on-chain flows / smart-money (crypto), feeding signal confidence + ranking. Subjective-news problem is what AI solves (consistent scoring; value learned from realized moves). xStock-first. (Fuller home: `1-system-manual/STRATEGIC_DIRECTIONS_AND_AI_EDGE.md`.)
- **★ PAPER MODE IS PERMANENT — runs continuously even AFTER live mode is live (Kyle directive 2026-06-08).** Paper-mode active trading does NOT shut off when live turns on. End-state = three concurrent producers: (1) **standalone always-on VTS** (broad continuous learning / negative-control, between-plan item 4), (2) **paper mode** — simulates live as closely as possible AND serves as the permanent **TESTING GROUND** where new functionality + new calibration are validated BEFORE they are promoted to live, and (3) **live trading**. New strategies/calibrations/features always prove out in paper first, then graduate to live. This is the standing operating posture, not a phase. (Storage-architecture implication is the between-plan item-4 §5a decision: three always-on producers → strict sim/paper/live partition + hot/warm/cold tiering. Ties to Phase 20.2 retention work.)
- **Periodic ML edge-scan scheduled job (Kyle directive):** the HCE engine (`scripts/hce/hce_study.py` + `hce_ohlc_sim.py` + `hce_rawfeat.py`) becomes a scheduled weekly/monthly ML routine re-running winner-commonality / selectivity / raw-feature analysis → ranked candidate gates + drift report. ML system roadmap (model work stays post-launch Phase 17/18; this scan is scheduled infra).
- **POST-LAUNCH / further out:** delta-neutral funding-rate / cash-and-carry yield (needs perps = new asset class; after first launch + bigger portfolio); pure buy-and-hold investment sleeve (after bigger portfolio); cross-sectional ranking (long-only "rank + top longs" possible; market-neutral gated on **short-sale access**, not available via Kraken today — Kyle open if it becomes available, NOT a philosophical no).
- **Immediate next work = xStock calibration RESUME** (scope `Claude Comms and Packages/Scope Files/XSTOCK_CALIB_RESUME_SCOPE.md`): close the B.4 soak, LOCK "pattern path stays ON for xStock" (free negative-control test of the queue ranking — Kyle 2026-06-05), then per-strategy work using the two HCE leads (working EV-gate selectivity + buy-the-dip / distance-below-high raw feature).

---


<!-- ═══ ARCHIVED SECTION: 2026-06-03 update — crypto re-validation directive — original lines 58-65 ═══ -->

### 2026-06-03 update — Crypto re-validation of strategy-SIGNAL settings (Kyle directive 2026-06-03)

The xStock B3.1a gate-correctness audit surfaced that, while the GATES/filters/regime/friction were calibrated for xStocks, each strategy's own **trade-construction settings** were never xStock-fitted — entry trigger, stop/target geometry, hold horizon, indicator periods/levels, pattern-detection tolerances, and the evaluation **tick/bar frequency** all still run inherited (crypto-wildcard) values; only ORB has xStock-specific params. That motivates the **xStock strategy-fit effort** (pick bar frequency first → re-tune the 10 live strategies' signal params per-class → re-enable + re-tune the deferred equity-suitable strategies + finish ORB → make pattern-detection per-class; all asset-class-scoped, measured by `scripts/b-xstock-calib-b31a-gate-audit-2.ts`).

**Kyle's stronger point + ROADMAP ITEM:** these strategy-signal settings (and the pattern-detection settings, and the tick/bar frequency) were **likely never empirically calibrated for CRYPTO either** — they were inherited from the original strategy DESIGN, set before there was real crypto data to evaluate against. The crypto work to date calibrated gates/filters, not the strategies' own signal parameters. **ROADMAP ITEM (placement: AFTER Phase 24 / xStock calibration completes, BEFORE the AMR — Adaptive Market Response, Phase 25; confirmed by Kyle 2026-06-03):** apply the SAME re-validation now being done for xStocks to **crypto** (crypto_spot + crypto_perp) — strategy-internal signal settings, pattern-detection settings, tick/bar frequency, and any other item surfaced by the xStock strategy-fit effort. The xStock effort establishes the methodology + the evidence engine; reuse both. Asset-class-scoped throughout (crypto tuned independently of xStock; per-class plumbing already exists). Cross-ref: ORB disable (B-NEW-34) was caused by exactly this bar-frequency issue — 60-min bars left no intra-hour data for an opening-range; re-enabling ORB is gated on the bar-frequency decision (Phase D `XSTOCK_CALIBRATION_PLAN.md` "ORB redesign: 5/15/30/60min sweep").

---


<!-- ═══ ARCHIVED SECTION: 2026-05-27 update — Phase 19/25 split preamble + notes (locked tables stayed LIVE) — original lines 66-77 ═══ -->

### 2026-05-27 update — Phase 19 / Phase 25 SPLIT locked (Kyle directive 2026-05-27 evening)

**Decision (Kyle directive after EXECUTION close 2026-05-27 evening):** the work previously bundled under Phase 19 splits into TWO phases on outcome-dependency:

- **Phase 19 = "Functional from scan to closed trade"** — active-trading-path restoration, structural plumbing, safety mechanisms, the act of running paper-active, structural bug fixes found during that run, calibrations that DON'T require trade outcomes to make a decision-grade verdict (thresholds, regime classifiers without confidence, strategy selection, strategy gates, archive-replay priors).
- **Phase 25 = "Calibration with evidence"** — anything that needs paper-active wins/losses to verify (confidence modifiers, SQE thresholds, sustainability gate value-scope, ladder net contribution, AMR build/skip decision, factor calibrations).

**Notes (Kyle directive 2026-05-27):**
- **Batch ordering within each phase is decided at the start of that phase**, not pre-locked here. The table below catalogs WHICH phase each item lives in, not the sequence.
- **Some items overlap across the existing roadmap sections and `RUNNING_ISSUES` entries.** Phase 19 and Phase 25 cleanup at start-of-phase will collapse duplicates and resolve any remaining ambiguous placements before sequencing begins.
- **B80 crypto_perp (formerly labeled "Phase 25") was deferred to POST-LAUNCH on 2026-05-21** — that label is now retired. New canonical naming: B80 crypto_perp is "post-launch / Phase 26 placeholder, no SLA." The "Phase 25" number is now repurposed as the calibration-with-evidence phase per this split.


<!-- ═══ ARCHIVED SECTION: 2026-05-27 update — cross-references paragraph (placement superseded by the reorg) — original lines 123-125 ═══ -->


**Cross-references to existing sections:** Phase 19 sub-section content at §19.0.5 / §19.0.B / §19.x / §19.1 / §19.2 / §19.3 / §19.3.5 below remains accurate but its placement under "Phase 19" stays unchanged (these are Phase 19 items per the table above). Phase 25 sub-section content at §19.0.A / §19.0.3 / §19.4 / §19.4.5 / §19.5 below also remains accurate but its phase tag moves from "Phase 19" to "Phase 25" per the table above. Cleanup pass at start of Phase 25 will renumber the section anchors if helpful.


<!-- ═══ ARCHIVED SECTION: (separators) — original lines 127-129 ═══ -->


---


<!-- ═══ ARCHIVED SECTION: 2026-05-23 update — Phase 19 before Phase 16 — original lines 130-135 ═══ -->

### 2026-05-23 update — Phase 19 runs BEFORE Phase 16 (B-NEW-43 Phase 1 close)

**Decision (Kyle approved 2026-05-23 on joint CC + Langston advisory):** Phase 19 (active-trading-path restoration walkthrough) runs BEFORE Phase 16 (DB/legacy cleanup). The restoration walkthrough creates ground truth on what is dead vs. dormant; cleanup then acts on that ground truth instead of guessing. Infra-clean parts of Phase 16 (DB schema rationalization / column drops independent of active-trading code surface) can still front-run safely. Surfaced during B-NEW-43 Phase 1 chunk 6 audit; locked at Phase 1 close (2026-05-23, baseline frozen at 488 errors / 68 files). Source-of-truth lists: Phase 19 intake = RUNNING_ISSUES #137 + baseline-file `files[]` with `phase_tag.startsWith("Phase 19")`; Phase 16 legacy register = RUNNING_ISSUES #136.

---


<!-- ═══ ARCHIVED SECTION: 2026-05-21 update — pre-launch scope tightened — original lines 136-149 ═══ -->

### 2026-05-21 update — Pre-launch scope tightened (Kyle directive)

Four sequencing changes locked 2026-05-21 to keep the pre-launch path focused:

1. **Regime classifier confidence-chain calibration moved INTO Phase 19** (new §19.0.A). VTS and active-trading outcomes are not comparable populations — VTS opens simulated trades on every filter-survivor against every strategy in a regime family, while active trading runs SQE filtering on top. Calibrating chain modifiers against VTS conflates two different populations and produces verdicts that won't transfer to live. The B-NEW-33 / B-NEW-36 / B-NEW-37 / B-NEW-39 workstream pauses; data continues accumulating; calibration verdicts re-run against paper-active outcomes once paper-active path is healthy. B-NEW-39 phase-1 floor fix (structural correction) stays in place. B67.5 consumer-gate design also parked until paper-active calibration produces decision-grade verdicts.

2. **Crypto_perp (Phase 25 / B80) deferred to POST-LAUNCH.** Only ~10 perpetual pairs at Kraken Futures; the May 2026 xStocks universe discovery (220+ additional tokenized equities, total ~450+ Fortune 500 / NASDAQ / ETFs / index funds) gives the launch a deeply diversified pair set. Marginal universe expansion from perps doesn't justify the calendar cost pre-launch.

3. **VTS partition + Exchange-Data Adapter (Phase 19.0) deferred to POST-LAUNCH** — possibly never built. Requires solving API rate-limit budgeting across multiple alternate-source exchanges and a partitioned data storage design before the partition itself can land. Phase 19 paper-mode audit accepts the start-stop interruption to VTS data accumulation as a known cost.

4. **Daily loss-budget service + auto-trip wiring promoted to dedicated OPTIONAL Phase 19 batch (§19.0.B).** Previously buried in 19.4.5 item 9. If Phase 19 observation shows the manual kill switch + per-trade guardrails are absorbing real-world loss patterns adequately, the auto-trip wiring can ship later.

---


<!-- ═══ ARCHIVED SECTION: 2026-05-10 update — Phase 24 closed + 12 onboarding patterns — original lines 150-181 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: 2026-05-07 update — Multi-Asset VTS Expansion stretch (B78-B81) — original lines 182-204 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Current State Assessment (February-era; STALE) — original lines 205-224 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Strategic Sequencing — Why This Order (April-era; STALE) — note: the Post-Live tracked work items list stayed LIVE — original lines 225-310 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Key 2026-04-14 decisions + Batch Approach (Replit-era) — original lines 321-339 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Phase 12 detail (COMPLETE) — original lines 340-452 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Phase 13 detail (COMPLETE) — original lines 453-482 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Phase 14 detail (COMPLETE) — original lines 483-608 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Phase 11 Finalization detail (COMPLETE) — original lines 609-656 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Phase 15a detail (COMPLETE) — original lines 657-664 ═══ -->

## Phase 15a: Predictive Learning UI Audit & Data Path Fixes — ✅ COMPLETE (B59)

**Status**: DEPLOYED. Predictive learning data path fixes shipped. Regime Archive verification pending next telemetry cycle.

**Key outcome**: Discovered three broken data paths in predictive learning UI (telemetry aggregator never running, hardcoded weight defaults, dropped Phase-10 metrics in VTS getRecentTrades). Fixed all three. Discovered predictive learning services are largely cosmetic — they record but cannot execute filter changes. Discovered DBS is fully implemented but ORPHANED (computed every MCE cycle but consumed nowhere — not in classifier, not in strategy gates, not in SQE/RTB/TEC). DBS discovery triggered Phase 15b restructure.

---


<!-- ═══ ARCHIVED SECTION: Phase 15b detail (COMPLETE) — original lines 665-790 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Phase 19.0 VTS Partition + Exchange-Data Adapter (SUPERSEDED: VTS-standalone half = Interphase item 4; adapter half = post-live backlog) — original lines 1077-1150 ═══ -->

## Phase 19.0: VTS Partition + Exchange-Data Adapter — DEFERRED TO POST-LAUNCH (Kyle directive 2026-05-21)

> **★ SUPERSEDED (Kyle directive 2026-06-05, reaffirmed 2026-06-08) — the VTS-standalone half is NO LONGER post-launch; it is between-Phase-24→19 plan item 4 (pre-19).** The original 2026-05-21 deferral was unblocked by the **ingest-once-fan-out-to-N-consumers** design (one market-data ingest → standalone-VTS / paper / live), which kills the API-rate-limit blocker that drove the deferral. So: the **VTS standalone always-on Simulation service is built PRE-19** (between-plan item 4, with the §5a storage-architecture design as its required design-before-build gate — that design also resolves the original "storage system" blocker). The **Exchange-Data Adapter / alternate-source (Binance/Coinbase/KuCoin) half** of this section MAY remain post-launch if not needed (the fan-out design uses the single Kraken feed). The text below is the original 2026-05-21 framing, preserved for reference; read it through the lens of "VTS-standalone = pre-19 item 4, alternate-source-adapter = still-deferrable."

**Status (2026-05-21, SUPERSEDED — see note above):** DEFERRED to post-launch — possibly never built. Kyle's reasoning: the partition would require solving two non-trivial upstream problems first — (a) API rate-limit budgeting across Kraken + Binance + Coinbase + KuCoin so the alternate-source data feed doesn't blow through quotas, and (b) a data storage system design for the partitioned VTS process (separate writers, partition-aware archive tables, retention policy alignment). Neither is sized or planned. Rather than block Phase 19 paper-mode audit on that work, accept the start-stop interruption to VTS data accumulation during audit cycles as a known cost and proceed. Post-launch we reassess whether the partition still earns its build cost or whether the same goal can be achieved more cheaply.

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


<!-- ═══ ARCHIVED SECTION: §19.5 Adaptive Market Response conditional section (SUPERSEDED: body = Interphase item 5 / 19-19; brain = 25-6) — original lines 1358-1403 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Timeline Summary (2026-04-09; STALE) — original lines 1638-1667 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Phase Dependency Chain (STALE) — original lines 1668-1689 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Risk Assessment (February-era; STALE) — original lines 1690-1714 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Mapping to Kyle's "Next Steps" Document — original lines 1715-1736 ═══ -->

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


<!-- ═══ ARCHIVED SECTION: Pushback on Original Sequencing + v2 closing note — original lines 1737-1753 ═══ -->

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

---

## Intentional rewrites at the 2026-06-10 reorg (originals quoted verbatim — zero-content-loss record)

The following 8 lines were rewritten in the live doc at the 2026-06-10 reorg (stale location pointers after the move). Each original line is quoted VERBATIM below, preceded by its original line number on a separate label line:

*Original line 953:*

**Sequencing:** Trend Mining Engine is an ML-DESIGN-PHASE consideration, not a standalone earlier phase. It belongs in Directive 18.0 as a peer architecture to the supervised ML pipeline, sharing the Feature Store + Validation Pipeline. Concrete build can land in Phase 18 (alongside the Crawl/Walk/Run/Fly milestones) or as a Phase 22+ research track post-launch. Pre-launch: do not build. Pre-launch: ensure B70 data capture is designed so that when we DO build, the data is ready (see B70 forward-design note above).

*Original line 955:*

**Forward-design implication for ML-light:** ML-light must NOT be designed as the system's sole "discovery" engine. It is a supervised classifier consumer. The Trend Mining Engine is the discovery engine. Both feed the validation pipeline. See ML-light forward-design note above.

*Original line 1031:*

**Pre-Phase-18 work:** ensure B70 data capture is wide + structured for automated mining tools (already noted in B70 entry above). No engine code lands pre-launch.

*Original line 1459:*

**Phase 19 expected outcome**: Fully debugged paper trading system with optional SQE recalibration (19.4), Adaptive Market Response brain (now Phase 25 — see top-of-file 2026-05-23 update), and end-of-phase diagnostics dashboards (19.6) covering external-source health and internal compute capacity wired into the alerts queue. All components validated. Ready for production hardening.

*Original line 1465:*

**Anchor section (added 2026-06-09, item-3.5 reorder).** Phase 25 = "calibrate everything that needs paper-active wins/losses to verify." It runs **immediately after Phase 19** in the canonical execution order (see top-of-file "CANONICAL EXECUTION ORDER" block), NOT in numeric sequence — Phase 25 precedes Phases 16/20/21. **Go-live gate (Kyle):** calibrate in Kraken paper-sim until COMFORTABLE with the wins/losses/profit, THEN proceed — not "launch and prove it live."

*Original line 1467:*

**The locked Phase 25 item list (25-1 … 25-15) lives in the `### 2026-05-27 update — Phase 19 / Phase 25 SPLIT locked` section above** (the "Locked Phase 25 items" table). That table is the authoritative catalog; this heading exists so every "→ Phase 25" home in `RUNNING_ISSUES.md` and the item-3.5 reconciliation resolves to a real roadmap section. Highlights: 25-2 regime confidence-chain calibration · 25-3 **TFS sustainability gate value-scope** (RUNNING_ISSUES #111, moved here 2026-06-09 per Kyle) · 25-4 SQE recalibration · 25-7 xStock macro modifiers (#94) · 25-8 pattern_max_position_pct (#153) · 25-10 crypto confidence-modifier · 25-12/13/14 xStock entry-trigger/geometry/per-strategy re-fit (data-gated, self-surface via the #206 accrual alert) · 25-15 HCE rejected-arm causal test (#205). **Crypto strategy-signal re-validation** (2026-06-03 update) also sits here. Batch ordering within Phase 25 is decided at the start of the phase.

*Original line 1469:*

> **Note (numbering):** "Phase 25" the calibration phase is distinct from the retired "Phase 25 = B80 crypto_perp" label. crypto_perp perpetual-futures onboarding is now **Phase 26**, post-launch, no SLA (see the 2026-05-21 + 2026-05-27 updates).

*Original line 1608:*

xstock_spot fully onboarded across 9 sub-batches. ~450+ tokenized equities feeding the system post-discovery (May 2026). See Phase 24 close note above.

**Standing-constraint note (Langston review):** the B70 + ML-light forward-design notes inside the archived "Strategic Sequencing" section are STANDING DESIGN CONSTRAINTS (Trend-Mining-ready data capture; ML-light as consumer-not-discoverer), not stale history — the live §17.6/§18.5 text carries the substance; the archived originals remain authoritative for full wording.
