# ITEM 4 Phase B — STEPS 4 + 5 + 6 COMPLETION REPORT (paper/live scaffolding · storage-for-3 · throughput study)

> Gate-2 packet §4 steps 4–6, closed 2026-06-10 under Kyle's overnight autonomous directive. Steps 4 and 5 close **by documentation** (their objectives were subsumed by the step-1/2/2b/3 builds — verified, not assumed); step 6 ran live this morning. **Langston review (2026-06-10): study SIGNED OFF (all 6 gates, artifact counts + percentiles + integrity SQL independently re-verified exact-match live); steps-4/5 documentation close APPROVED with 3 conditions (specific evidence per claim ✓ below; governance list ✓ §below; §6-item-4 resolution recorded in the packet ✓); 4.6-A GO with his systemd-first sequencing correction.**
>
> 🚨 **SCAFFOLDING-VS-FUNCTIONAL (§9.1):** these steps complete the structural separation. They do NOT make paper trade-ready (Phase 19) or live buildable (Phase 21). Live start remains explicitly REFUSED (409) until the Phase-21 numeric flip.

## Step 4 — Paper + live standalone scaffolding (O3): **CLOSED, subsumed — evidence-verified**
| Objective | Evidence |
|---|---|
| Paper independently startable | Started/stopped cleanly **three times via the production routes**: 21:38–21:41Z + 22:49–22:53Z transients (2026-06-09) and the **33m20s sustained window** 09:50:08–10:23:28Z (2026-06-10, session `paper_cHEmpUkX01`) — clean start ACK, running orchestrator, clean stop, zero engine errors, VTS unaffected each time |
| Live switch-only + never-start assertion | Step-3 Phase-21 gate: live start probe → **HTTP 409 `LIVE_ENGINE_PHASE21_GATED`**, zero engine activity, no state flip; fail-closed on missing/failed constant read; lock tests 1a–1e (incl. the strict `=== 1` boolean-trap lock); flip instruction paper-trailed in roadmap 19-17b |
| No cross-dependency between the three systems | The throughput study's W2 is the live proof: VTS cadence byte-identical with paper on/off; paper start/stop never touches VTS lifecycle (step-3 lock test 3) |

## Step 5 — Storage-for-3 finalization (O4): **CLOSED, subsumed — evidence-verified**
| Objective | Evidence |
|---|---|
| Storage accepts all 3 producers | Learning-store key `(source, assetClass, regime, strategy)` with source REQUIRED-no-default; `LearningSource = RunMode` ('vts' \| 'paper_sim' \| 'live') — the `live` partition is **reserved and structurally ready** (Phase 21 fills it); 3 archivers take the carried mode |
| Pair-scan tier decision (packet §6 item 6 — was parked) | **RESOLVED in the step-2 build with Langston's ACK: `'shared'`** (producer-agnostic substrate tier). Study confirmation: 59,866 + 3,042 rows, 100% `'shared'`, exactly 1 row per (symbol, cycle) compute |
| Per-source retention knobs | Per Kyle Gate-2 decision 2: **uniform default**; the per-source knob exists structurally (partitioned key + per-source calibration epochs) and stays at uniform until there is a reason to diverge (§6 item 3 stays parked) |
| Comparison bridge | `would_admit_v0` live since 2b; accrued 10 full verdicts + 11,297 honest `no_final_score` stamps during W2 alone |

## Step 6 — Throughput study (O6): **CLOSED — ALL 6 GATES PASS**
Full numbers in `Claude Comms and Packages/Scope Files/ITEM_4_THROUGHPUT_STUDY_RESULTS.md`. One-line verdicts:
1. **Data integrity (HARD GATE): PASS** — W2: 11,307 signal_eval rows ALL `vts`, zero cross-stamps during active paper; store single-writer-per-partition holds (30/30 `vts_`).
2. **Compute-once: PASS** — pair_scan rows = MCE computes **exactly** in both windows (59,866 = 59,866; 3,042 = 3,042).
3. **Latency: PASS** — VTS cadence 60.0s mean both windows (610 + 33 beats, max gap 61s); lag p95 3ms vs baseline 5ms.
4. **Queue depth: PASS** — paper op-queue flat zero across 7,714 health samples; no monotonic growth anywhere.
5. **Event-loop lag: PASS** — p99 28ms concurrent (gate <100ms); the baseline's 90ms p99 tail is the pre-existing 306-pair scan stall (→ item 4.6-B), which **shrank** under concurrency. Instrument = the `metrics-service.ts` 1s timer-drift sampler (positive-drift-only) — counts are a floor; 4.6-B carries `monitorEventLoopDelay` histograms for the definitive characterization (Langston condition).
6. **Write backpressure: PASS** — B74 writer 66.5 vs 67.5 lines/min, zero writer errors, error.log rate identical (41.0 vs 41.9/min).

**Capacity recommendation:** keep Hetzner CPX22; no Supabase bump; **in-process concurrency GO** — packet §6 item 4 (separate VTS process) resolves NOT-needed pre-Phase-19; re-evaluate at Phase 21 with three real producers. The binding constraint is disk hygiene (80% full) = item 4.6-A, executed immediately after this study by design.

**Compute-once witness note (Langston):** this study used the `[Phase14][MCE]` per-pair log line as the MCE-compute counter for the 1:1 invariant. Once 4.6-A puts that line behind a default-OFF switch, **`pair_scan_archive` row count becomes the sole witness for compute-once** — stated here so future audits don't hunt for vanished log lines.

## New findings logged at this close
- **health_engine lying-state** (NEW → RUNNING_ISSUES #214): the broadcast's ENGINE block reads the legacy `global.tradingEngines` registry and reported `isRunning:false` throughout the active paper window; its QUEUE block reads the real operation queues (correct). Display-only TODAY — but the flip side (Langston) is that engine-health monitoring gives **zero liveness signal for paper**, which matters exactly when Phase 19 runs long soaks. **Target: Phase-19 prep**, and the fix must consolidate all three engine-state registries (`health-monitor.ts:444-470` `global.tradingEngines` · `context-refresh-coordinator.ts:197-201` `getGlobalSession()` [correct] · `state-awareness.ts:307-321` `globalPaperPortfolioManager`) to one truth source — not rewire one reader and leave the next lying surface in place.
- The W1 lag tail independently corroborates Langston's 2026-06-09 scan-stall root-cause (his ~25×/hr spike rate vs measured ~13/hr >100ms — same phenomenon, threshold-dependent counting).

## Governance files changed
`RUNNING_ISSUES.md` (health_engine entry) · `BATCH_CATALOG.md` (steps-4-6 row) · `PHASE_HISTORY.md` (steps-4-6 block) · `ITEM_4_THROUGHPUT_STUDY_RESULTS.md` (new) · this report · the item-4 umbrella report · MEMORY 3-way.

**Next: item-4 UMBRELLA completion report → item 4.6-A hygiene execution → Kyle morning report.**
