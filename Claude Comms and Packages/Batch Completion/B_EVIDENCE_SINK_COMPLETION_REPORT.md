# B-EVIDENCE-SINK — Completion Report (CC-A, 2026-07-14)

**change-class: architecture.** Owner CC-A · Reviewer Langston · Consumer CC-B (B8.5 switch-on).
**One-line:** a durable, tiered DB sink for the three switch-on behavioral proofs, so they survive the weeks-long paper-validation window instead of aging out of the now-rotating stdout.

> 🚨 **§9.1 SCAFFOLDING DISCLAIMER: this batch readies the SINK; it does NOT itself produce switch-on evidence.** The three proof emitters are on the ACTIVE path (SQE admission / 11.8B open-stage / decideMakerTaker), which does not run until the B8.5 switch-on. So the sink is DEPLOYED + WIRED + verified NON-REGRESSIVE with **0 rows today (correct)**; live proof rows + the behavioral checks (EV_REJECT rate ~0, maker-pick-rate shift, FINALSCORE_SHADOW cohort) are a **named switch-on-time obligation of the B8.5 batch**, not this batch's claim. The FLIP itself HOLDS for Kyle's explicit go.

## Objectives — outcome
| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Durable, governed DB store (not a flat file) | ✅ | `switch_on_shadow_evidence` — partitioned, 13 monthly partitions, 22 cols, on staging |
| OBJ-2 | Capture the 3 proofs at their decision points | ✅ | emit at SQE `signal_quality_evaluator.ts` (async+sync), 11.8B `active-execution-engine.ts`, `decideMakerTaker` via `signal-orchestrator.ts` |
| OBJ-3 | Additive + honest write path | ✅ | dual-write (console.log kept as evidence-of-last-resort); NULL-honest; active-path only; VTS untouched |
| OBJ-4 | Verified WORKING pre-flip (isolation) | ✅ | bench test 5/5 incl. the Flag-A isolation proof (a throwing enqueue → `.not.toThrow()`); deployed round-trip = table+registration live |
| OBJ-5 | Retention registered (tiered, never-drop) | ✅ | `data_lifecycle.switch_on_shadow_evidence.hot_retention_days=90`; table added to b75 sweep B70_TABLES + b70 partition self-heal (Step-7 fix) |

## What shipped (files)
- **Migration** `2026-07-14-b-evidence-sink.sql` (+ rollback OUT of MANIFEST): dedicated partitioned table (proof_type discriminator, superset-nullable-by-type), `_type_time` index, monthly partitions, data_lifecycle 90d row.
- **NEW** `server/services/data-archive/switch-on-evidence-sink.ts`: `registerSwitchOnEvidenceSink()` + `emitSqeShadow`/`emitEvReject`/`emitMakerTaker` — each fire-and-forget through `enqueueArchiveRow` inside an internal try/catch that degrades (never throws into the decision).
- **`maker-taker-decision.ts`**: exposes the APPLIED `makerFillProbability` (pFill) + `signalStrength` in the result — the faithful decision-time haircut snapshot (Phase-25 pFill-calibration substrate; rtb_signals is transient + holds no snapshot).
- 3 additive emit sites + bootstrap registration.
- **Step-7 fix:** `b75-retention-sweep.ts` B70_TABLES + `b70-create-monthly-partitions.ts` PARTITIONED_TABLES gain the table (verification caught that the retention KEY alone doesn't tier — the sweep/partition lists are hardcoded).
- **Test** `b-evidence-sink.test.ts` (5 cases).

## Verification
- Bench: tsc baseline OK (one TS2322 caught+fixed — safeResolveAssetClass null tail); sink test 5/5; 40/40 maker-taker+SQE regression.
- CI: 4-green on both commits (runs 29332299716 + 29332850033).
- Deploy: migration BEFORE code; staging table has 13 partitions / 22 cols / retention=90 / 0 rows; HTTP 200; feeds untouched (13 outbound :443); 0 sink errors; deployed sweep+partition scripts list the table.
- **Step-8 (Langston independent):** ✅ PASS 2026-07-14 — re-derived every claim (not reported): registration wired (:30/:52), tiering member (b75:99) + partition member (b70:31) genuine array entries; live psql = 13 partitions / 22 cols / all 5 named cols / 0 rows / retention=90; app HTTP 200, restart stable, 0 sink-DEGRADE lines. §9.1 disclaimer accepted; the behavioral proofs = his named B8.5 obligation.

## Review-caught defects (the process working)
- Langston Step-4: asymmetric `asset_class` NOT-NULL guard — only the EV_REJECT site had the `?? 'unknown'` last-resort; a null at the SQE/orchestrator sites would silently lose evidence at flush. Fixed uniformly.
- Langston Step-4 (earlier, pre-audit): my two asserted-absence overreaches ("zero archiveSignalEval anywhere" / "zero proof cols anywhere") — the #453 trap; corrected to measured claims, dedicated-table justified on schema+semantic grounds.
- **Step-7 self-caught:** the retention key didn't tier the table (hardcoded sweep/partition lists) — fixed before close. *This is why Step-7 is not skipped.*

## Named follow-up (§13)
- The console.log dual-write retires with the **post-paper FinalScore field-kill batch** (Flag B) — logged with Langston.

## Governance files changed
STORAGE_POLICY.md (§3 table row + §5.5 named the table) · SYSTEM_IMPACT_MAP.md (sink component) · BATCH_CATALOG.md · PHASE_HISTORY.md · PHASE_19_PLAN.md · RUNNING_ISSUES.md (durable-shadow-sink item resolved) · this report · CC-A + Langston MEMORY. *(SYSTEM_MANUAL.md judged N/A — a data-capture/evidence service is SIM-scope; the `maker-taker-decision.ts` change exposes already-computed values with no math/architecture change.)*
