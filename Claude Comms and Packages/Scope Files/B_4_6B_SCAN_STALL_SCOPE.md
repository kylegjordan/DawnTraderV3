# B-4.6-B — Scan-stall structural fix (event-loop yield for the pair-universe sweep) — SCOPE v1

> Readiness-checklist item 4.6 half B (Kyle-approved 2026-06-10; sequenced immediately after item 4, BEFORE 4.5/4.7). Origin: Langston's 2026-06-09 root-cause (scan pins CPU, ~25×/hr p99 spikes 300–500ms incl. one 2s freeze, skipped clockwork slots) + the item-4 throughput study (W1 lag tail p99=90ms/max=393ms present in VTS-ONLY baseline → the scan, NOT producer concurrency; `ITEM_4_THROUGHPUT_STUDY_RESULTS.md` §4 + caveat 0). Phase-19 rationale: paper debugging must run on a non-stalling system.

## Step-1.a architectural read (what we know going in)
Live-log + code surface (2026-06-10 16:06–16:08Z observations):
- **The sweep runs EVERY 30s** as a back-to-back sequence: `[B79.0a]SCAN_CYCLE` xStock eval (`server/asset_classes/xstock_spot/eval-cycle.ts`, 75 pairs, `duration_ms` 1,176–1,746 of which `db_roundtrip_ms` 569–1,139) → `[B63.3]AdaptiveScan` crypto Pre-DBS pass (`server/services/market-scanner.ts`, ~245–259 of ~300 pairs, ~1.3s, "batched 10 concurrent") → `[19F]` pattern global filter (300 pairs) → FX5 survivor selection. The historical "306-pair scan" = this crypto-universe sweep.
- The VTS eval loop (`vts-runner.ts`, 115–155 pairs at the 60s beat) is a SECOND per-pair compute lane (computeContext per pair).
- **Crucial nuance:** 120 sweeps/hr but only ~13–25 stalls/hr >100ms — most sweep wall-time is ASYNC DB I/O (event loop free during awaits). The stalls come from the SYNCHRONOUS compute segments (per-pair regime/indicator math between awaits) when they clump. The fix must target those segments SPECIFICALLY — chunking the whole sweep blindly would add latency without proof.
- Known instrument limitation (Langston step-6 condition): the existing 1s timer-drift sampler under-counts short stalls. This batch carries `perf_hooks.monitorEventLoopDelay` histograms as its measurement spine.

## Objectives (numbered, verification-criteria attached)
1. **Instrument first (chunk A):** (a) a `monitorEventLoopDelay` histogram service (p50/p95/p99/max, periodic METRIC line + exposed on a diagnostics endpoint); (b) per-segment SYNC-time breakdown inside the sweep (xStock eval loop / AdaptiveScan / pattern filter / VTS eval loop) — measure the synchronous slice per segment per cycle, logged at a sampled cadence. **Verify:** 24h of histograms identifying the top stall contributors with their per-cycle sync-ms; the stall sites NAMED with evidence.
2. **Yield-chunk the proven-hot synchronous loops (chunk B):** insert cooperative yields (`setImmediate`/`await new Promise(setImmediate)`) every N pairs in ONLY the segments objective 1 proves hot (expected: the per-pair compute loops in market-scanner Pre-DBS, eval-cycle, and/or vts-runner). N chosen so each uninterrupted slice stays under ~25ms. NO behavioral change: same pairs, same order, same outputs per cycle. **Verify:** scan outputs byte-comparable (same per-cycle counters: `pairs_scanned`, `passed_families`, `pattern_fanout`, pair_scan_archive row counts per cycle); cadence unchanged (30s sweep / 60s VTS beats exact).
3. **Acceptance gate (before/after, same instrument):** over a ≥24h window post-fix: `monitorEventLoopDelay` **p99 < 50ms and max < 250ms** (vs the corroborated 300–500ms spikes + 2s freeze); **zero skipped cron slots** (the B-NEW-49 cron-fire evidence verifier is the witness); VTS beats exact. If chunking alone cannot hit the gate, STOP and bring the worker-thread/off-lane escalation to Kyle as a separate decision (it re-opens the in-process-GO study verdict and carries data-marshaling cost — NOT in this scope).
4. **Governance:** SIM entries for the instrument + each touched loop; System Manual Ch3 scan-architecture note; RUNNING_ISSUES cross-ref (the stall finding); study-results cross-ref (caveat-0 resolution); BATCH_CATALOG/PHASE_HISTORY; completion report with the before/after histograms.

## Boundaries
- NO scan redesign, NO pair-universe changes, NO threshold changes, NO worker threads (escalation path only, Kyle decision).
- Active trading stays OFF; verification uses the always-on VTS + the existing 30s sweep under natural load.
- `MCE_PER_PAIR_LOG` stays default-OFF (compute-once witness = pair_scan rows, per the steps-4-6 report).

## Sequencing
Step 2 pre-audit traces the three loops' SIM dependencies + enumerates every synchronous segment; chunks A→B as separate reviewed diffs (instrument ships first and runs ≥24h before B is tuned). Estimated: 2–3 working days end-to-end including the two 24h measurement windows.
