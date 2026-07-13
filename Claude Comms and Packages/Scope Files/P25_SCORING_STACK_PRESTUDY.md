# Pre-Phase-25 Scoring & Ranking — VERIFIED findings + the big-fixes list

**Author:** CC-A (Claude Old). **v2, 2026-07-13** — supersedes the v1 survey (same file, git history). Per Kyle: *"in advance of the deep recalibration phase, a document of the big things that need to be fixed right away with our ranking system, our scoring system."* v2 is fully **verified at the code with transitive caller traces** (three independent deep digs, 2026-07-13), cross-checked against `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`, `SYSTEM_IMPACT_MAP.md`, `SYSTEM_MANUAL.md`, `DELETED_COMPONENTS_LOG.md`. Where the v1 survey was wrong, this says so.

---

## 0. The verified pipeline (what actually runs on the active path)

signal → orchestrator stamps `confidence`/`finalScore`/`regimeWeight` (`calculateExtendedSignalMetrics`, signal-orchestrator.ts:591) → **`decideMakerTaker`** (:730, **takes `signalStrength = finalScore`**, :748) → **SQE gates**: finalScore ≥ 0.35 (pattern 0.45) (signal_quality_evaluator.ts:316), regimeWeight ≥ 0.30 (:321), confidence floor (:355), AMR (:370), governance (:392); ROI gate **dormant at admission** (inputs not passed, :327) → queue (SQE trusted, not re-run; finalScore only a dedup tiebreak, ready_to_buy_service.ts:2186) → 30s revalidation (decayed finalScore re-gated :827; **confidence-floor/governance/ROI silently skipped** — inputs absent, :909-920) → **rank** `getRankedSignals` (:1904): geometry floor (:1816) then **r_multiple key** = `evaluateTradeExpectancy().netRewardToRisk`, **overridden by `chosenNetEv / distStop` when present** (:1886-1891) → promotion (AMR re-check, active-execution-engine.ts:1847) → **Net-Expectancy gate `netEV > 0` strict** (:2163-2269) + guardrails (:2090) → order.

---

## 1. THE BIG FIXES (priority order — the answer to "what must be fixed before/at Phase 25")

**FIX-1 — finalScore CONTAMINATES the new ranker through the maker/taker door (NEW finding, verified).**
The r_multiple key ranks on `chosenNetEv` (:1889) — and `chosenNetEv` is produced by `decideMakerTaker`, whose `signalStrength` input **is finalScore** (signal-orchestrator.ts:748; refresh path ready_to_buy_service.ts:870). So the uncalibrated, empirically anti-predictive old score leaks directly into the new ranking's decisive number, on both active AND VTS paths (vts-runner.ts:1702). *Fix:* replace `signalStrength=finalScore` with an honest input (pWinFloored / DI-based strength) — small diff, big integrity gain. **This is the #1 pre-calibration fix: without it, calibrating pWin still leaves the ranker finalScore-tinted.**

**FIX-2 — VTS feeds the kernel a FAKE DI (NEW finding, verified) → VTS calibration data ≠ active behavior.**
On the VTS path the kernel's "DI" input is actually **`predictiveConfidence × 100`** (vts-runner.ts:1657) and `diAtOpen` is **hardcoded 50** on every VTS trade (:2043). The active path uses REAL FX5 DI (`diAtQueue`, orchestrator :700→ready_to_buy :1864). Consequences: (a) every VTS netEV/EV-floor decision to date used a confidence-proxy, not DI — VTS and active are apples-to-oranges at the kernel; (b) true DI is **never persisted at VTS entry**, so DI-axis calibration from VTS history is impossible without new instrumentation. *Fix:* persist real DI (+ netEv, predicted pWin) on VTS opens NOW, so calibration data accumulates before Phase 25.

**FIX-3 — pWin is a placeholder AND its calibration data is thinner than assumed (verified).**
`pWin = clamp(0.40 + DI/200, 0.40..0.60)` (strong-trend `0.40+|dbs|/2`) — never validated. The ideal validation table (`rtb_shadow_pairings`, which has real `di_at_queue`+`predicted_r_multiple`+outcomes) is **EMPTY** — its only writer is the dormant picker (ready_to_buy_service.ts:1964 "DORMANT until paper active"). Existing evidence = ~740 post-B62 closed VTS trades (JSON store) carrying `pairDirectionalBiasScore`+`predictiveConfidence`+outcome — enough for a **sanity probe** (§4), NOT a calibration. *Fix:* the probe now (timing signal) + real calibration on paper-active data in Phase 25 (#399a) + FIX-2's instrumentation so the pipeline fills.

**FIX-4 — the finalScore GATE: retire, don't recalibrate (CC-A recommendation — to Langston + CC-B for debate, per Kyle "recommend, don't ask me").** See §2.

**FIX-5 — the dead legacy layer: one rule-18 deletion batch (verified dead, zero non-test callers each).**
`getTopSignal` + `checkForPromotion` (#329 already says revive-or-delete; verdict: delete) · `FINAL_SCORE_GAP_OVERRIDE` + `CONTEXT_BONUS` + the unreachable #217 shadow block · the three `×1.1` legacy EV helpers (`isMathematicallyProfitable`, `calculateNetExpectancy`, `getExpectancyBreakdown`, expectancy.ts:127/145/157) · `MIN_QUEUE_CONFIDENCE=0.55` const · `calculateAdaptiveFinalScore` (script-only). **None are in DELETED_COMPONENTS_LOG — all are confirmed leftovers from past "remove later" promises.** Display-only (keep-but-label or retire deliberately): `computeRankingScore` (VTS card display, bonus hardcoded 0), `calculateQualityScore`/`expectancyScore`, `calculateProfitRate`, the routes.ts:5085 "NGC" finalRank display block.

**FIX-6 — revalidation gate asymmetry (NEW finding, verified).**
At 30s revalidation the SQE input omits regimeStability/entry/target/regime → **confidence floor, governance gate, and ROI gate silently never re-run** (ready_to_buy_service.ts:909-920); only finalScore/regimeWeight/AMR re-gate. Either intentional (document it) or a gap (fix it) — decide explicitly at the Phase-25 scope.

**FIX-7 — split-brain + doc drift (verified).**
#211 two drifted finalScore implementations (orchestrator vs vts-runner) still open — must be resolved before ANY finalScore recalibration (or mooted by retiring it, §2). Doc corrections owed: SYSTEM_MANUAL :998/:1327 still claim NGC feeds live confidence (**false — no live NGC formula exists**; retired by Directive 12.3.3; only a display alias + audit column survive), :3040 still describes the pre-B7.1 "best score wins" ranker; SIM :237/:942 list dead `getTopSignal` as a live ranking-weights consumer.

**Corrections vs the v1 survey (honesty ledger):** v1 called NGC "still contaminating confidence in error" — too harsh, it's display-only; stale docs, not stale code. v1 called rankingScore "VTS-shadow" — too generous, it's card display with the bonus hardcoded 0. v1 called the ranker "clean" — too generous, see FIX-1.

---

## 2. The GATE recommendation (CC-A position, for Langston + CC-B debate)

**RETIRE the finalScore composite gate; gate on interpretable primitives. Sequenced, not immediate.**

Why retire rather than recalibrate:
1. It's an uncalibrated hardcoded blend (0.4/0.3/0.2/−0.1, frozen "v1.0.1") of components empirically shown anti-predictive (r=−0.140) and inverted (13.8% vs 83.3%) — recalibrating the WEIGHTS of broken INPUTS optimizes a lens we don't trust.
2. Everything the gate is supposed to protect is already gated by interpretable primitives that survive on their own: `netEV > 0` (honest, fee-aware, strict at execution), the geometry floor, regimeWeight floor (keep as its own explicit floor if wanted), confidence floor (mode overlay — recalibrate or drop as its own decision), AMR/governance/guardrails.
3. Retiring moots #211 (the split-brain) instead of requiring its repair as a prerequisite.
4. FIX-1 is a prerequisite either way — with `signalStrength` re-based, finalScore's last load-bearing role disappears and retirement becomes a clean cut.

Sequencing (the part that matters): **freeze as-is through the B8.5 switch-on + B9 baseline run** — we want baseline paper-active data under the current config, not a config churned mid-switch-on — then retire at the Phase-25 scoring batch alongside pWin calibration, with the candidate-volume impact measured (dropping the 0.35/0.45 admission floor changes how many signals reach the queue; the netEV gate + floors must demonstrably hold the line). Counter-position I expect and accept debate on: "keep a recalibrated composite as a cheap pre-filter." My response: a pre-filter should be a calibrated pWin/EV threshold, not a resurrected blend.

---

## 3. What is verifiably DEAD vs DISPLAY vs LIVE (the caller-trace table, condensed)

**DEAD (zero non-test callers):** getTopSignal · checkForPromotion · FINAL_SCORE_GAP_OVERRIDE · CONTEXT_BONUS · #217 shadow block (unreachable — lives inside dead getTopSignal) · isMathematicallyProfitable · calculateNetExpectancy · getExpectancyBreakdown · MIN_QUEUE_CONFIDENCE const · calculateAdaptiveFinalScore (audit-script-only).
**DISPLAY/API-only (never gates a live trade):** computeRankingScore + normalizeNetReturn (VTS card) · calculateQualityScore/expectancyScore · calculateProfitRate · routes.ts:5085 "NGC" finalRank · compositeScore (telemetry).
**LIVE-active (correctly):** calculateFinalScore (gate) · calculateRiskScore→confidence · evaluateTradeExpectancy + kernel (rank + gate) · strategy patternScore/momentumScore (feed raw confidence) · DI/dbs (FX5 at-queue snapshot on the active path).
**Doc reality-check:** `ACTIVE_TRADING_PIPELINE_AUDIT` is accurate (line-drift nit only); SIM + SYSTEM_MANUAL carry the drifts in FIX-7.

---

## 4. The pWin probe — design + constraints (running 2026-07-13)

**What CAN run now:** on the ~740 post-B62 closed VTS trades (JSON store), bucket realized win-rate by `pairDirectionalBiasScore` (the dbs the kernel actually used) and by `predictiveConfidence` (the EXACT DI-proxy the VTS kernel consumed — per FIX-2, this is what "DI" really was), segmented by sourcePool × regime × assetClass, vs the placeholder mappings.
**What CANNOT:** true-DI axis (never persisted), netEv/predicted-pWin axes (never written for VTS), anything from `rtb_shadow_pairings` (empty until switch-on).
**§19.4 constraints honored:** post-B62 only; sibling-strategy control on any cohort WR; framed as a *placeholder-mapping sanity check*, NOT classifier accuracy (trade outcomes are contaminated by entry/exit/sizing/friction — the roadmap's own warning); per-bucket min-N power gate (740 trades thin fast).
**What it buys:** a TIMING signal — if the placeholder is directionally sane, pWin calibration stays a Phase-25 tune; if it's noise/inverted, the pWin fix must jump the queue to before/at switch-on. Result below.

### ★ PROBE RESULT (RUN 2026-07-13, staging VTS store) — the placeholder is INVERTED, not merely uncalibrated
**Sample: 12,140 closed post-B62 trades** (99.3% field coverage — far larger than the ~740 §19.4 subset). Overall realized WR **0.307** (net-of-friction outcomes).
- **dbs variant (`0.40+|dbs|/2`): NO monotonicity.** Realized WR flat 0.285–0.323 across ALL |dbs| buckets while predicted pWin climbs 0.421→0.600. The bucket predicted 0.600 realized **0.316**. n per bucket 883–5,342 — these are powered nulls, not ambiguity.
- **DI-proxy variant (`predictiveConfidence`, the VTS kernel's actual DI input): NEGATIVE.** WR by rising confidence bucket: **0.317 → 0.274 → 0.259 → 0.167** (then a noisy small-n rebound 0.433 @ n=141, 0.269 @ n=78). Rank-corr(pc, win) **rho=−0.045, n=12,058, t≈−4.97** — significantly inverted. **The confidence inversion (B65.6/B-NEW-36/37/39) reproduces in fresh post-B62 data.**
- **Sibling control:** per-strategy WRs cluster 0.27–0.38 (reverse_impulse best 0.380) — the bucket effects are not a strategy-mix artifact.
- **§19.4 honesty:** outcomes are downstream of exit/sizing/friction, so this does not measure classifier accuracy and the ABSOLUTE gap (placeholder floor 0.40 vs realized ~0.31) partly reflects friction + exit policy. But the ORDERING findings (flat on dbs, negative on the DI-proxy) are §19.4-safe conclusions: the placeholder's ranking information is absent-to-inverted.

**TIMING CONSEQUENCE (elevates FIX-3, feeds the FIX-4 debate):** at switch-on, the R-multiple ranker would rank with a pWin input whose confidence component is INVERTED — producing a systematically wrong order AND poisoning the B9 baseline itself. Recommendation to the crew: **neutralize the inverted input before/at switch-on** — the cheapest honest option is a FLAT pWin (constant, DI-agnostic; e.g. the 0.40 floor) so the ranker ranks purely on geometry-per-risk net of friction (all real, no fake signal), until the Phase-25 calibration replaces it with an outcome-calibrated mapping. This is a one-knob change (`expectancy_kernel` module_constants) — no code. The alternative (freeze-as-is for baseline purity) preserves a baseline of a KNOWN-inverted config, which is not a baseline worth protecting.

## 4b. ★ CREW CONSENSUS (LOCKED 2026-07-13 — CC-A + CC-B + Langston, per Kyle "debate to consensus")
**Structural, PRE-switch-on (CC-B owns the batch scope; Langston gates; CC-A Step-4 with this study as the lens):** (A) activate the fee-aware **netEV admission gate** by feeding already-computed values into the SQE input (feasibility proven at code by all three independently: `decideMakerTaker` fires at orchestrator :730/:731, `chosenNetEV` exists before the SQE call at :787; Langston's Step-2 line: state the PRECEDENCE rule vs the 11.8B open-stage gate — no two EV gates without an authority rule; the OPEN-stage re-check is KEPT, demoted to drift backstop). (B) **retire FinalScore's GATE authority; keep computing + logging it** as shadow telemetry; formal field-kill post-paper on logged evidence. (C) **FIX-1** re-base `decideMakerTaker.signalStrength` off finalScore. (D) **FIX-2** VTS instrumentation (real DI + netEv + predicted pWin persisted at open) — unconditional, starts now. (E) **pWin NEUTRALIZED to a pinned constant** — Langston condition 1: pinned to the MEASURED base rate (~0.31, CI [0.30,0.32]; conservative anchor — net-of-friction WR under-states pre-friction pWin, the safe direction), explicitly marked **PINNED PLACEHOLDER** with its replacement homed at 25-4/#399. NOT a calibrated value. (F) Langston condition 2: **decompose FinalScore at Step-4 before cutting** — any component with independent non-inverted signal survives as its own floor (RegimeWeight already kept). (G) Langston condition 4: **prove pWin SSOT** — every consumer reads through the kernel; any direct recomputation = fail the diff. **Numeric, POST-paper (named home per §13): Phase-25 item 25-4 + the #399 umbrella** — the meaningful netEV floor (bare >0 admits penny-positives), RegimeWeight/confidence floor decisions, FinalScore field-kill ruling, pWin outcome-calibration.

## 4c. ★ FIX-8 — the confidence-consumer trace (Langston condition 3; RUN 2026-07-13)
**The feared hazard is REAL: the confidence axis scales POSITION SIZE on the active path.**
- **B1 (HIGH, pre-switch-on blocker):** `signal.confidence` (fallback for `regimeConfidence`) → `computeGlobalStability` (active-execution-engine.ts:3120) → strategy mode → **`positionSizeMultiplier` 0.25×–1.0× applied at :3233/:3287** (+ stop distance :3210, target distance :3213). Higher confidence → STABLE mode → **up to 4× bigger position** — sizing UP on empirically-worse trades. Live caveat: severed when the AMR per-class flag is ACTIVE (:3143-3151); the confidence fallback rides whenever `metadata.regimeConfidence` is absent (frequent per the code's own comment). **Checklist: verify AMR flag state before switch-on.**
- **B2 (HIGH):** confidence is 0.3 of finalScore — and up to **0.7** when hybridScore falls back to confidence (score-calculator.ts:47) — so the admission gate is looser for worse trades until (B) lands; consider zeroing `W.CONFIDENCE` in `score-weights.config.ts` as part of the retirement.
- **Config verifications before switch-on:** `rtb_ranking.active_ranker` must be `r_multiple` in the DB (the `confidence` arm would rank promotions by inverted finalScore); confirm hybrid-integration's `MIN_SCORE 0.65` gate live-status (call-site unconfirmed).
- **CLEAN (verified):** base position sizing (`sizeActivePositionForSignal`) reads NO confidence/finalScore/hybridScore — pure fixed-fractional risk + exposure caps + correlationScale; the confidence coupling is ONLY the post-hoc mode multiplier (B1). The maker/taker `signalStrength` path pushes toward MORE taker/higher assumed friction at higher strength — conservative direction, LOW risk.
- **VTS calibration-source contamination (MED):** VTS scales its own sizes/stops/targets via a predictiveConfidence→stability→mode loop (vts-runner.ts:1605→1779) — mode-scaled exits alter realized outcomes as a function of a confidence-like input; a §19.4-class caveat on all VTS-derived calibration.
- **⚠ Honest tension flagged (CC-A, against the trace's own framing):** the trace labels `predictiveConfidence` "honest by construction" (winrate-derived sigmoid) and its consumers LOW-risk — but the §4 probe measured predictiveConfidence's ordering as **empirically INVERTED** (0.317→0.167 by rising pc, t≈−4.97) on 12k trades. Construction ≠ empirical validity. Its consumers (dynamicROI admission threshold — higher pc → LOOSER ROI gate, expectancy.ts:280; the VTS mode loop) inherit the inversion risk until 25-2/25-4 calibrate. Treat as MED, not LOW.

## 4d. ★ FULL FEEDER-CONTAMINATION MAP (Kyle anti-tunnel-vision escalation; completeness pass over the 94-hit/30-file grep, 2026-07-13)
**One genuinely NEW decision-driving discovery:** the **hybrid MIN_SCORE 0.65 gate is LIVE** on the main generation loop (`signal-orchestrator.ts:2290` → `hybrid-integration.ts:172`) and — the part that matters — **hybridScore is written straight into the signal's `confidence`** (`signal-orchestrator.ts:2299`), so on the hybrid (quant×pattern confluence) sub-path, hybridScore PROPAGATES into B1 (sizing) and B2 (admission). Disposition: the propagation's sizing consequence is covered by the B1 severing (fix-now); the MIN_SCORE gate itself is an intended gate whose threshold is Phase-25 calibration (25-4).
**CLEARED (the three files FIX-8 hadn't opened — their "confidence" hits are DIFFERENT DOMAINS, not the feeder scores):** `adaptive-guardrails.ts` (behavioral-log statistical confidence; mutates risk limits but not from signal scores; `applyAdaptiveAdjustments` has NO caller — dormant, routes-only) · `consensus-engine.ts` (agent-vote confidence, agent-collaboration domain) · `dynamic-sizing-engine.ts` (**fully dormant confirmed** — `computeDynamicSize` zero callers outside a diagnostics route; `applyDSEMultiplier` imported nowhere).
**EXIT SIDE CLEAN:** tec-evaluator (zero matches), trailing/exit-replay/session-reset — none read the feeders; the mode-overlay stop/target scaling (B1 chain) remains the only exit-side score read.
**Two residual `ready_to_buy` call-sites** (batch finalScore refresh `:1122-1205`, top-signal selection `:1378-1403`) — same class as already-classified Phase-25 rank/refresh items, not new vectors. All persistence/telemetry-only reads counted and excluded.
**NET fix-now set (unchanged by the completeness pass, now with completeness PROVEN):** B1 severing + FIX-1 re-base + FIX-2 instrumentation + netEV admission activation + pWin pin — everything else is Phase-25-classified with file:line dispositions on record.

## 5. Probe hooks already in place for Phase 25
Selection-IC harness (`selection-ic.ts`, per-cycle cross-sectional Spearman, window-clustered SEs) · the B7.1 shadow columns (fill on switch-on) · `rtb_shadow_pairings` (ideal calibration table, fills on switch-on) · the 25-24 probe methodology (reusable bucketing harness). Five deferred homes under #399 unchanged: pWin calibration · fractional-Kelly · xStock dbsScore gap · selection-IC GO/NO-GO · per-class pWin haircut.
