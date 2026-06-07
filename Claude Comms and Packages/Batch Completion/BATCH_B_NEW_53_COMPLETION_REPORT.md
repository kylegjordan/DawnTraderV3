# B-NEW-53 — Decision-Provenance Capture — COMPLETION REPORT

**Date:** 2026-06-07. **Status: DEPLOYED to staging; runtime proof pending tonight's xStock reopen.**
**Deploy commit:** `b1dbb2c43` (migration `2026-06-07-b-new-53-decision-provenance.sql` applied). **CI:** run 27098783612 — all 4 jobs GREEN (2m27s).

> **NOT a scaffolding batch.** The capture IS functional — it begins recording the moment xStock decisions flow. It simply has nothing to record *right now* because today is Sunday and xStocks are in their weekend pause until tonight's 8 PM ET reopen. The runtime proof (rows landing + coverage% + cycle-timing-unchanged) is therefore a scheduled post-reopen check (alert `B-NEW-53 runtime proof`, fires 2026-06-08T01:30Z), exactly as B-NEW-52's Sunday-reopen proof was.

## What this batch does (one paragraph)
Forward-only capture of each xStock decision's exact replay inputs, so every future calibration study (entry-trigger sweep, geometry reconstruction, the RI-a stop-anchor trail) becomes *exactly* reproducible instead of backward-reconstructed — which provably caps at ~80% parity (the W2.0a Mode-A / RI-a / W2.0b wall). Capture is built now (pre-Phase-19); the study that consumes it runs in Phase-25. Additive, telemetry-only; **no change to any trade**; active trading OFF throughout.

## Scope objectives (checklist)
1. **Schema — YES.** `signal_eval_provenance` (partitioned by `captured_at`, PK `(captured_at, archive_id)`, 17 typed columns, **13 monthly partitions** 2026-06→2027-06) + `module_constants_version` (hash PK). Verified live on staging.
2. **Writer — YES.** `archiveSignalEval` threads the provenance fields; an amortized block-allocated `id` from `signal_eval_archive_id_seq` links the base + provenance rows 1:1; constants re-resolved at the hook → hashed → version store (upsert-on-novel). Provenance enqueue sits inside the existing best-effort try/catch (triple-insulated, verified by Langston).
3. **RI-a unification — YES.** The same provenance row carries `resolved_stop_price` + `resolved_target_price` (the self-verifying checksum); RI-a gets no separate mechanism.
4. **Proof-of-capture (key) — SCHEDULED (post-accrual).** Per Langston's BONUS condition, the ≥99% Tier-1 parity re-run on *captured* rows is a post-accrual gate (needs forming bars that have settled), registered as alert `B-NEW-53 proof-of-capture` (fires 2026-07-05T12Z). NOT a deploy-time check.
5. **Defined exit — YES.** The same post-accrual alert resurfaces "entry-trigger now backward-replayable — resume the Phase-25 sweep (roadmap 25-12)."
6. **Safety — YES.** Additive; per-asset-class fail-closed flag (`xstock_spot=true`, `crypto_spot=false`, `*=false`, verified live); best-effort — a provenance-write failure cannot block the decision or the base archive row (the base row emits SQL `DEFAULT` and the sequence fills its id, so it is *never lost*).

## Langston gates
- **Step-1:** ACK-to-proceed with locks Q1–Q5 + BONUS.
- **Step-2:** APPROVED to Step-3 with C1 (report coverage% separately from parity% — independent drop-oldest buffers can desync), C2 (amortize the id-source; verify B-PHASE-A2 cycle timing), C3 (xStock-only + 90-day retention override). All applied.
- **Step-4 code review:** **APPROVE TO PUSH.** All three flagged items verified safe (base-row never loses a row; provenance triple-insulated; amortized id collision-free). Applied his buffer-sizing catch pre-push (BLOCK_SIZE 1000→3000: a scan cycle is one macrotask and the hooks only `await import()`, so an in-flight id-refill cannot land mid-cycle — a small block would drop the *last* decisions in scan order, a biased coverage hole; the larger block makes a normal cycle ~100%).
- **Step-8 second-pass:** dispatched (independent deploy + schema verification on staging; co-owns the post-reopen runtime proof).

## Langston carry-forward notes
- **(a) settled-bar reference horizon — RESOLVED.** Provenance stores settled bars by *reference* into `xstock_spot_ohlc_15m_snapshot` (derived from `xstock_spot_ohlc_1m`). `xstock_spot_ohlc_1m.hot_retention_days = 365` — far longer than the provenance's 90 days — so the replay source never expires before a provenance row. (Re-confirmed in the post-accrual alert.)
- **(b) orphan provenance rows — noted.** Base + provenance are independent drop-oldest buffers, so under queue-cap pressure a base row could drop while its provenance survives → an unreferenced provenance row. Harmless to a base-driven LEFT JOIN, swept at 90 days; noted for the Obj-4 harness so it isn't mistaken for a bug.

## Storage (grounded on live prod)
xStock = 8.04M detect-evaluated decisions/30d (99.96% rejects; `strategy_internal` IS the replay population). Net-new ≈ 190 bytes/row → ≈ 1.45 GB/month xStock (~22% on top of the existing archive), ~4.4 GB at 90-day retention. Constants are static (~6 versions/month) → the hash-referenced version store is trivial. Crypto capture deferred (flag off) pending observed cost.

## Files changed
**New:** migration `2026-06-07-b-new-53-decision-provenance.sql` (+rollback), `server/services/data-archive/archive-id-allocator.ts`, `.../decision-provenance.ts`, `server/tests/unit/b-new-53-decision-provenance.test.ts`.
**Modified:** `.../signal-eval-archiver.ts`, `.../archive-batch-writer.ts`, `.../archive-config.ts`, `server/asset_classes/xstock_spot/eval-cycle.ts` (4 hooks), `server/scripts/b70-create-monthly-partitions.ts`, `.../b70-retention-sweep.ts`, `.../b70-table-export.ts`, `server/services/drift-dashboard-aggregator.ts`, `server/startup/data-archive-bootstrap.ts`, `drizzle/migrations/MANIFEST.txt`.

## Pre-audit correction (surfaced honestly)
The pre-audit cited the archive hooks as `vts-runner.ts:1930/3584`. Verified-in-code correction: those are the **crypto** path (provenance OFF). The xStock decisions archive from **`server/asset_classes/xstock_spot/eval-cycle.ts`** (4 hooks). The capture was threaded there. The vts-runner crypto hooks are untouched (to be threaded when crypto provenance is enabled).

## Verification (bench + staging)
- Bench: tsc baseline GREEN (no regressions — the CI gate); 8/8 new unit tests pass; the 12 full-suite failures are pre-existing (identical on clean head).
- Staging: CI all-4-green; migration applied cleanly; HTTP 200; schema verified (13 partitions, all columns, per-class flag, sequence CACHE=50); clean boot, no errors.
- **PENDING (post-reopen):** provenance rows landing for xstock_spot with populated fields; coverage% (separate from parity); module_constants_version ≥1 row; B-PHASE-A2 cycle timing unchanged. → alert `B-NEW-53 runtime proof` tonight.

## Governance files updated
- `Claude Comms and Packages/Scope Files/B_NEW_53_SCOPE.md`, `B_NEW_53_PRE_AUDIT.md` (with §8 Step-2 gate decision), `Change Lists/B_NEW_53_STEP4_CHANGE_LIST.md`, this completion report.
- `1-system-manual/`: BATCH_CATALOG, PHASE_HISTORY, SYSTEM_IMPACT_MAP (provenance table + writer + allocator + consumer components), SYSTEM_MANUAL (provenance layer), CHANGES_AND_FIXES, RUNNING_ISSUES (#206 capture built — study stays Phase-25), MULTI_ASSET_VTS_EXPANSION_PLAN, POST_AUDIT_ROADMAP (19-20).
- MEMORY.md (truth + in-repo mirror) + Langston MEMORY (Hetzner).

## Remaining to CLOSE
1. Langston Step-8 second-pass confirmation (dispatched).
2. Tonight's `B-NEW-53 runtime proof` alert (post-reopen): confirm capture is live + coverage% + cycle timing. **If green → B-NEW-53 CLOSED.** If provenance rows are zero after a confirmed session, or coverage is far below 1.0, or timing regressed → reopen + investigate.
3. (Weeks out) the post-accrual proof-of-capture parity re-run unblocks the Phase-25 entry-trigger study.
