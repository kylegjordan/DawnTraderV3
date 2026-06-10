# ITEM 4 — Throughput Study: RESULTS (step 6 / O6)

> Run 2026-06-10 per `ITEM_4_THROUGHPUT_STUDY_METHODOLOGY.md` (natural-load primary, per the documented amendment — the synthetic harness was NOT needed). Code under test = the fully-landed Phase-B steps 1+2+2b+3 (deploy `e5b91332f`→`acf683c5d` lineage). **VERDICT: ALL SIX GATES PASS. Stay on the current Hetzner box; no Supabase bump; in-process concurrency is a GO pre-Phase-21. The binding constraint is DISK HYGIENE (item 4.6), not compute.**

## 1. Windows (natural market load; crypto 24/7 + xStock 24/5 both in-session)
| | start (UTC) | end (UTC) | duration | producers |
|---|---|---|---|---|
| **W1 baseline** | 2026-06-09 23:40:26 | 2026-06-10 09:50:08 | **10h 09m** | VTS only (verified paper-free: last prior paper stop 22:53:05; process clean-booted at window open) |
| **W2 concurrent** | 2026-06-10 09:50:08 | 2026-06-10 10:23:28 | **33m 20s** | VTS + paper (session `paper_cHEmpUkX01`, started/stopped via the production start/stop routes) |

The original plan was a 45-min baseline; the overnight compaction gap turned it into a 10-hour baseline — strictly better (CLAUDE.md §5.13 rolling-window preference). W1 rates are normalized per-minute for comparison.

## 2. Metric table (W1 → W2, ratio)
| Metric | W1 baseline | W2 VTS+paper | Ratio / verdict |
|---|---|---|---|
| **VTS cadence** (HANDOFF beats) | 610 beats, gap 59–61s, mean 60.0s, 0 >90s | 33 beats, gap 59–61s, mean 60.0s, 0 >90s | **1.00× — PASS** (no starvation) |
| **VTS overlap skips** (`Skipping cycle`) | 0 | 0 | **PASS** |
| **Event-loop lag** (n samples; ms) | n=14,676: p50=1, p95=5, **p99=90**, max=393; >100ms: 134 (0.91%) | n=823: p50=1, p95=3, **p99=28**, max=169; >100ms: 3 (0.36%) | **PASS** (<100ms gate, BOTH windows; W2 tail thin — directional, not a precise factor) |
| **MCE per-pair computes** (`[Phase14][MCE]` lines) | 59,866 (98.2/min) | 3,042 (91.2/min) | 0.93×/min — **no multiplication under concurrency** |
| **Compute-once 1:1 invariant** | pair_scan rows **= 59,866 = MCE computes, EXACT** | **= 3,042 = MCE computes, EXACT** | **PASS** (one scan row per compute, per (symbol,cycle), both windows) |
| **Paper op-queue depth** (health beats) | 7,314 samples, all 0 | 400 samples, all 0 | **PASS** (no growth, no backlog) |
| **B74 OHLC writer** (lines) | 41,141 (67.5/min) | 2,217 (66.5/min) | 0.99× — **no backpressure**, zero writer errors |
| **signal_eval archive rows** | 231,496 (379.7/min) | 11,307 (339.1/min) | 0.89× (market-mix variance; VTS firehose dominates by design) |
| **out.log ERROR/FATAL/unhandled** | 0 | 0 | **PASS** |
| **error.log line rate** (routine stderr chatter: `[B79.0f][COLLISION_RESOLVE]`, MD-WS) | 24,985 (41.0/min) | 1,396 (41.9/min) | 1.02× — **no spike; kill-criteria never approached** |
| **CPU / memory** | spot 0%, 591MB at open | loadavg 0.06–0.45 (2 cores), 583.7MB at close | **stable, no leak** |
| RTB activity lines | 24.0/min | 28.1/min | 1.17× (paper's RTB refresh — modest, bounded) |
| TCL / orchestrator lines | 0 / 0 | 24 / 3 | paper pipeline active, quiet by design (one-best-per-cycle) |

## 3. Data integrity — the HARD GATE (presence-not-count): **PASS**
- W2 `signal_eval_archive`: **11,307 rows, ALL `mode='vts'`** — zero cross-stamps during 33 min of active paper (the carried-tag fix; pre-step-2 every one of these would have been mislabeled `paper_sim`). W1: 231,496 ALL `vts`.
- W2 `pair_scan_archive`: **3,042 rows, ALL `'shared'`** (producer-agnostic substrate tier). W1: 59,866 ALL `'shared'`.
- W2 `exit_decision_archive`: 1 row, `vts` (a VTS virtual exit; correct).
- Learning store: **30 keys, ALL in the `vts_` partition, zero unprefixed** — single-writer-per-partition holds. The `paper_sim` partition is legitimately empty (no paper trade closed in 33 min; absence ≠ failure).
- `would_admit` bridge accruing forward: 11,297 `no_final_score` + 10 full `final_score_vs_paper_finalScoreMin` verdicts in-window.

## 4. The W1 lag tail = the KNOWN pre-existing scan stall (NOT a concurrency cost)
W1's p99=90ms / max=393ms with 134 samples >100ms (~13/hr) is the **306-pair scan event-loop stall Langston independently root-caused on 2026-06-09** (his data: p99 spikes 300–500ms ~25×/hr, one 2s freeze, skipped cron slots). It appears in the VTS-ONLY baseline and got **smaller** during the concurrent window (a floor-vs-floor comparison under the same sampler — see caveat 0; the directional conclusion is sampler-independent) — concurrency did not cause or worsen it. Disposition: **item 4.6-B** (scan chunking / off-lane), scoped from this study, lands before items 4.5/4.7. His stall observations stand as corroborating baseline evidence.

## 5. Live projection (NOT run — Kyle rule: live always places real orders)
Live's per-cycle pipeline cost ≈ paper's (same compute → selection → queue path; the delta is real-order I/O, small and bounded). Paper's **measured marginal cost was ≈ zero on every axis** (lag p99 lower, cadence unchanged, writer rate unchanged, queue flat, load <0.5 on 2 cores). Projected 3-producer load therefore fits the current box with ample headroom. **Re-measure for real at Phase 21** (the reserved `live` partition + per-mode switches are already in place).

## 6. Capacity recommendation + go/no-go
- **Hetzner CPX22 (2 cores / 4GB): KEEP.** No resize needed for VTS+paper, nor for projected 3-producer.
- **Supabase: no compute/storage bump needed** from this load (archive write rates unchanged under concurrency).
- **In-process concurrency: GO.** The packet §6-item-4 parked decision (separate VTS process) resolves to **NOT needed pre-Phase-19**; the lag tail belongs to the scan (4.6-B), not to producer concurrency. Re-evaluate only at Phase 21 with three real producers.
- **The real capacity issue is disk: 80% full** — the 43GB `out.log` (per-pair debug logging) + 65,992 stale `tec_diag` diagnostic files (476MB, the stale May tool still running ×2 instances). That is **item 4.6-A** (Kyle-approved), executed immediately after this study so the logging change could not contaminate the window comparison.

## 7. Caveats (honest limits)
0. **Instrument (Langston step-6 review condition):** the lag series is `metrics-service.ts startEventLoopMonitor()` — a **1-second `setInterval` timer-drift sampler** that records only positive drift (`lag = now − lastCheck − 1000`). Point samples under-catch and under-read short stalls, so the >100ms counts are a **floor** on true stall frequency — fully consistent with Langston's independently observed ~25×/hr 300–500ms spikes. Item 4.6-B must carry `perf_hooks.monitorEventLoopDelay` histogram instrumentation for its before/after so the stall is definitively characterized there. W2's tail (n=823, ~8 samples beyond p99) is decision-grade for the <100ms gate but NOT for precise improvement factors.
1. **Absolute** write/log numbers include the per-pair debug-logging overhead (removed in 4.6-A after this study); **ratios are unaffected** (both windows ran identical logging).
2. W2 = 33 min vs W1 = 10.2h; rates normalized per-minute. W2 ran in the UTC-morning session (xStock 24-hr session active, US pre-RTH); the RTH-open busiest hour was not directly measured — the 10-hour baseline spans the heavier overnight crypto sessions.
3. No paper trade closed in-window (SQE + one-best-per-cycle gating), so the trade-execution/exit write path was exercised lightly (TCL active, 24 lines). Phase 19's long paper runs will load it; nothing in this study's queue/writer data suggests a constraint.
4. RTB/SQE/TCL have no periodic depth telemetry line; depth was measured via the paper op-queue health series (flat zero) + activity-line rates (no growth). Adding depth gauges is a candidate Phase-20 observability item.
5. NEW lying-state finding (logged at governance close): the `health_engine` broadcast's ENGINE block reads the legacy `global.tradingEngines` registry and reported `isRunning:false` throughout the active paper window (its QUEUE block reads the real queues and is correct). Display-only; #213-sibling; Phase 16/21 cleanup register.

## 8. Cross-refs
Methodology `ITEM_4_THROUGHPUT_STUDY_METHODOLOGY.md` · Gate-2 packet §4 step 6 + §6 item 4 · Langston stall root-cause (2026-06-09, Telegram t21) → readiness checklist item 4.6 · raw extraction artifacts on staging `/tmp/w{1,2}_{lag,beats,qdepth}.txt`, `/tmp/throughput_paper_window.log`, `/tmp/throughput_cpu_samples.txt`, integrity SQL `/tmp/integrity.sql`.
