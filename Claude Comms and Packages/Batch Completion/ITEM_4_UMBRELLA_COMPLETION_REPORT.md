# ITEM 4 — UMBRELLA COMPLETION REPORT
## "Separate VTS / paper / live into independent standalone systems" (+ storage-for-3 + throughput study)

> Between-Phase-24→19 plan item 4 (Kyle reframe 2026-06-09). Two-gate process: Gate 1 (scope) → Phase A (design) → **Gate 2 (Kyle, all 3 decisions locked)** → Phase B (build, overnight autonomous per Kyle's 2026-06-09 ~22Z directive). Closed 2026-06-10. Every sub-step Langston-reviewed pre-push; all CI runs all-4-green; every claim staging-verified.
>
> 🚨 **SCAFFOLDING-VS-FUNCTIONAL (§9.1): this item makes the three systems STRUCTURALLY INDEPENDENT. It does NOT make paper trade-ready (that debugging is Phase 19) or build the real live engine (Phase 21). Live start is explicitly REFUSED (409) until the Phase-21 numeric flip of `live_engine_enabled` → 1.**

## The five objectives (scope `ITEM_4_SYSTEM_SEPARATION_SCOPE.md`) — ALL YES
| # | Objective | Verdict | Where proven |
|---|---|---|---|
| O1 | VTS standalone — runs regardless of active-trading state | **YES** | Step 1: 3 `tradingActive` guards removed + lifecycle guard; 14/14 beats through a live paper transient; 10.2h + 33min study windows at exact 60s cadence, 0 skips |
| O2 | Paper + live cleaved — independent switches, no cross-dependency, neither affects VTS | **YES** | Step 3: per-mode start/stop, live Phase-21 gate (409 probe, zero engine activity), lock tests; study W2 = live proof |
| O3 | Standalone scaffolding each needs (paper startable; live switch-only) | **YES** | Steps-4-6 report: 3 clean production-route paper runs; live never-start asserted |
| O4 | Storage accepts all 3 producers + data decisions | **YES** | Step 2/2b: source-partitioned learning store (source REQUIRED), carried-mode archivers, pair-scan `'shared'`, would_admit bridge; study integrity gate: zero cross-stamps under concurrency |
| O5 | Shared compute = compute-once fan-out | **YES** | Study: pair_scan rows = MCE computes EXACTLY (59,866=59,866; 3,042=3,042) in both windows |
| O6 | Throughput study → capacity recommendation | **YES** | `ITEM_4_THROUGHPUT_STUDY_RESULTS.md`: all 6 gates pass; keep current Hetzner; in-process GO |

## What shipped (Phase B, four deploys, all CI-green)
| Step | Deploy | CI run | Contents |
|---|---|---|---|
| 1 — VTS decouple | `b80c5e1a3` | 27236405837 | Guards removed; re-entrancy/overlap/crash lifecycle guard + skips counter; `sourceMode:'vts'` entry-stamp |
| 2 — labeled learning substrate | `becf000dc` | 27239916433 | D9 store key `(source, assetClass, regime, strategy)` + Welford + per-source calibration epochs (fail-hard, boot-asserted) + 2-stage disk re-key; D1 carried-mode archivers (`getCurrentMode()` write-path DELETED); D1b buffer source-namespacing; `LearningSource = RunMode` single vocabulary |
| 2b — would_admit bridge | `e5b91332f` | 27241756486 | One-site stamp in the eval archiver; SWR threshold cache + failure cooldown; honest bases incl. `no_final_score` |
| 3 — switch cleave | `acf683c5d` | 27242619135 | Live Phase-21 gate (fail-closed, strict numeric `=== 1` after the **jsonb-boolean-invisibility catch** that would have bricked the Phase-21 flip); stop-per-mode; 409-aware UI toast; 7 lock tests |
| 4/5/6 | — (documentation + study) | — | `ITEM_4_PHASE_B_STEPS_4_6_COMPLETION_REPORT.md` |

## The decisive evidence (one line each)
- **Contamination is dead:** 11,307 eval rows written DURING active paper, all carrying the simulator's own label — before step 2, every one would have been mislabeled.
- **Independence is real:** the simulator's 60-second heartbeat is byte-identical with paper off (610 beats/10.2h) and on (33 beats/33min).
- **Live cannot start by accident:** a real start attempt returned 409 with zero engine activity, and the gate fails CLOSED.
- **Capacity is a measurement now, not a guess:** current box carries VTS+paper with ≈zero marginal cost; live projected to fit; re-measure at Phase 21.

## Kyle's Gate-2 decisions — where each landed
1. **Learning = three-tier** (shared substrate / upstream comparison yes, POOLING PARKED / outcomes strictly source-matched) → step 2 substrate + 2b bridge; pooling prerequisites tracked in packet §6.
2. **Retention = uniform** → knob exists per-source, default uniform (§6 item 3 parked).
3. **Kill-switch = paper AND live keep it; VTS none** → per-mode mechanism verified already-correct; zero code change.

## Parked register disposition (packet §6 — nothing rode silently)
1 smart-blend read → still conditional-research (prereqs not met). 2 scoring-weights blind spot → Phase 19+. 3 retention divergence → parked at uniform. **4 separate VTS process → RESOLVED BY THE STUDY: not needed pre-19; re-evaluate Phase 21.** 5 paper debug / live build → Phase 19 / 21. **6 pair-scan tier → RESOLVED: `'shared'` shipped.**

## Issues opened/resolved across the item
Opened: #211 (finalScore drift), #212 (paper-admit-only), #213 (legacy /live-trading routes bypass gate — Langston catch), health_engine lying-state (this close). Resolved: #210 (the step-2-before-active-trading HARD GATE — satisfied and closed).

## Follow-ons (owned, not dangling)
- **Item 4.6-A** (Kyle-approved): disk hygiene — executed immediately after the study (separate mini-report).
- **Item 4.6-B**: 306-pair scan chunking/off-lane — scoped FROM the study results; lands before 4.5/4.7.
- **VTS status-indicator UI panel** — awaiting Kyle's placement input (deferred from step 3, Langston-ruled non-blocking).
- `.gitattributes` line-ending ruling — housekeeping.

## Governance files changed (cumulative, the item)
BATCH_CATALOG (4 step rows + umbrella row) · PHASE_HISTORY (4 blocks + umbrella) · RUNNING_ISSUES (#210 resolved; #211/#212/#213 + health_engine opened) · ADJUSTMENT_FRAMEWORK (CALIBRATION EPOCHS section) · SYSTEM_IMPACT_MAP (steps 1+2 component entries) · SYSTEM_MANUAL Ch2 (step-1 architecture) · POST_AUDIT_ROADMAP (19-17b flip paper-trail; item 4.6) · PHASE_24_TO_19_READINESS_CHECKLIST (item 4.6) · scope/design/pre-audit/packet + 4 step completion reports + study methodology/results · MEMORY 3-way every step · Langston MEMORY synced.

**Item 4 = CLOSED. Next in the between-plan order: 4.6 (hygiene now; scan fix scoped) → 4.5 (Kraken tiered fees) → 4.7 (per-class regime) → 5 (AMR) → Phase 19.**
*(Batch close per Kyle's morning acknowledgment.)*
