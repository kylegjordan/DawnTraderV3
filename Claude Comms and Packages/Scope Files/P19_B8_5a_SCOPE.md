# P19-B8.5a — Switch-On Prep: scoring de-contamination + gate restructure (Step-1 Scope)

change-class: architecture

**Batch:** P19-B8.5a — the pre-switch-on structural set from the 2026-07-13 crew consensus (CC-B + Langston + OLD Claude, every claim verified at code; Kyle GREEN-LIT 2026-07-13: "going with what you guys recommend"). Owner: NEW Claude (CC-B). **architecture** — touches core engine paths (signal orchestrator, SQE, active-execution-engine, vts-runner): SYSTEM_MANUAL + SIM content updates owed at close.

**Why now (the one-line case per objective):** the retired-from-ranking finalScore still contaminates the ranker's decisive number and still gates admission; the broken confidence axis scales position size up to 4× on empirically-worse trades; the net-EV gate sits at OPEN instead of admission so the RTB queue can fill with untradeable signals; and VTS never persisted real DI — so without this batch, switch-on would collect polluted calibration data ranked by a number we don't trust. This batch makes the paper data CLEAN AT THE SOURCE. (Evidence: `P25_SCORING_STACK_PRESTUDY.md` §0-§4d at the ref; consensus §4b; all touchpoints below independently verified at code by ≥2 of the crew on 2026-07-13.)

**Authority chain:** Kyle ratified the PART II scoring redesign (2026-07-13) + green-lit prep-then-switch-on. Kyle defaults applied: **11.8B open-stage net-EV check stays STILL-BLOCKS** (no loosening elected — alarm-only was offered as an explicit Kyle-ratifiable loosening and not taken).

## Objectives

1. **OBJ-1 (FIX-1) — de-contaminate the ranker.** Replace `signalStrength = finalScore` at BOTH call sites — `signal-orchestrator.ts:748` (gen) and `ready_to_buy_service.ts:870` (RTB refresh) — with the MEASURED flat class base rate (~0.30 from OLD Claude's 12,140-trade probe). The constant ships **DB-governed day one** (`module_constants`, per-class), NOT hardcoded; the probe is PINNED re-derivable (query + window + ref) in the Step-2 pre-audit. Also the VTS call site (`vts-runner.ts:1702`) for path symmetry. Result: `chosenNetEv` (the rank key + gate input) no longer carries the anti-predictive finalScore tint.
2. **OBJ-2 (FIX-2) — VTS capture honesty.** Persist **real DI + netEv + predicted pWin** on every VTS open (today: DI is `predictiveConfidence×100` at `vts-runner.ts:1657` and `diAtOpen` hardcoded 50 at `:2043` — FINDING B). Additive telemetry, zero behavior change; starts the clean calibration accrual immediately.
3. **OBJ-3 — net-EV to SQE ADMISSION.** The fee-aware `chosenNetEV > 0` check becomes an SQE-side admission gate (the inputs already exist pre-SQE: `decideMakerTaker` at `signal-orchestrator.ts:730` runs before `.evaluate()` at `:787`), so the RTB queue holds only tradeable signals and promoted→opens holds. The 11.8B open-stage gate (`active-execution-engine.ts:2233`) **remains STILL-BLOCKS** as the drift backstop (Kyle default); a non-zero backstop reject count is a GATES-DRIFTED investigation signal, wired as telemetry. **Step-2 MUST spec (Langston's load-bearing line): the exact precedence wiring; the SQEInput fields the dormant ROI gate (`signal_quality_evaluator.ts:327`) reads vs what `signal-orchestrator.ts:772-785` omits, as a checked enumeration; and the FIX-6 RTB-revalidation re-read (`ready_to_buy_service.ts:854-892`) folded into the same dig.** No two EV gates that can silently disagree.
4. **OBJ-4 (B1) — sever confidence→position-size.** Cut the `signal.confidence` → `computeGlobalStability` (`active-execution-engine.ts:3120`) → mode → `positionSizeMultiplier` 0.25-1.0× (`:3233/:3287`) coupling. Fix surface is the stability→mode→multiplier chain ONLY (base sizer verified clean). Blast-radius includes the hybrid sub-path (`signal-orchestrator.ts:2299` writes `hybridScore` into `confidence` — severing covers it). Unanimous crew: this is a paper-DATA-INTEGRITY item (distorted sizing pollutes the calibration source), not just risk.
5. **OBJ-5 — retire the finalScore GATE + shadow-log.** The SQE stops gating on `finalScore ≥ 0.35` (`signal_quality_evaluator.ts:316`; pattern-pool 0.45). finalScore keeps being COMPUTED and its would-have-rejected verdict LOG-ONLY through the paper period (the formal field-kill ruling comes post-paper, per consensus). Surviving structural floors stay: regimeWeight floor (explicit, short-term per consensus), confidence floor pending its Phase-25 disposition, AMR, governance, geometry/liquidity.
6. **OBJ-6 — flat-pWin switch-on expectations note.** Pre-write in the B8.5 switch-on doc: with the flat base-rate pWin, early netEV/ranking discriminate on geometry+friction alone — the intended calibration-collection state, NOT a broken model (Langston catch-4).

**Step-7 config checklist (cheap, at deploy-verify):** `rtb_ranking.active_ranker` = `r_multiple` in the live DB · AMR per-class flag state (determines whether the B1 chain was live) · hybrid-integration MIN_SCORE call-site confirm.

**Hard rule:** this batch adds **ZERO new hardcoded decision constants** (Kyle mandate; §9 migration list is Phase-25's, but nothing new gets added here).

## Out of scope (named homes)
Phase-25 (`P25_SCORING_STACK_PRESTUDY.md` §8/§10 + 25-2/25-4/25-10/#399a): pWin calibration (model+calibrator, ONE deliverable), meaningful netEV floor, stricter-entry-than-hold wiring, ensemble rebuild, hierarchical EB, threshold recalibration, finalScore formal kill. **B-NEW-53.3** (5 decision-time indicator scalars, #206): pulled forward per Kyle 2026-07-13 — runs as its OWN micro-batch in the pre-switch-on window, owner per crew assignment. **B8.5**: THE SWITCH-ON itself.

## Verification criteria
- FIX-1: a signal's `chosenNetEv` provably computed with the DB-resolved base rate (no finalScore in the input chain) — unit test + live log sample.
- FIX-2: a VTS open row carrying real DI + netEv + predicted pWin (non-null, ≠ the old proxy) on staging.
- OBJ-3: an SQE-rejected net-EV-negative signal NEVER enters the RTB; the 11.8B backstop still blocks on injected drift (test); backstop-reject telemetry visible.
- OBJ-4: position size invariant to `confidence` across the mode chain (test: same signal, different confidence → same size, AMR flag off).
- OBJ-5: a below-0.35-finalScore, positive-netEV signal ADMITS (was rejected); the shadow log carries its would-have-rejected verdict.
- All four CI jobs green; Langston Step-2 (pre-audit incl. his (b)/(c) ref-verify) + Step-4 (diff) + Step-8 (deployed behavior); §9.3 UI verify where surfaces change; SysManual + SIM content updates landed at close.
