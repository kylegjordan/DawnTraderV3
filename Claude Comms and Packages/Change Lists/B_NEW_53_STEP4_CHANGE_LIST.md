# B-NEW-53 — Step-4 Change List (for Langston code review BEFORE push)

**Date:** 2026-06-07. Implements the Step-2-gated decision-provenance capture. **NOT pushed** — your review gates the push. Bench-verified: **tsc baseline PASS (no regressions); 8/8 new unit tests pass; the 12 full-suite failures are pre-existing (identical on clean head with my eval-cycle reverted).**

All changed files are staged in your inbox `/home/langston/inbox/b-new-53/` — Read them directly (local FS, fast). **DO NOT cd /mnt/gdrive or git on the gdrive mount.** For repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

## ★ THREE THINGS TO CHECK FIRST (you flagged these at Step-2)

1. **Base-row write-path change** (`signal-eval-archiver.ts`): `id` is now in `COLUMNS` and registered DEFAULT-on-undefined. `archiveSignalEval` sets `id: archiveId` where `archiveId = wantProvenance ? takeArchiveId() : undefined`. When undefined (crypto, or block momentarily empty), the batch writer emits SQL `DEFAULT` → the DB sequence fills it → **the base archive row is never lost**. This is the only change touching the existing base-row write. Confirm it's safe.

2. **Provenance enqueue is INSIDE the existing flow** — the prov-row enqueue + constants re-resolve + version upsert all sit AFTER the base enqueue, and the whole `archiveSignalEval` is still called inside the hooks' existing `try { ... } catch { counters.archiveFailures++ }`. A provenance failure cannot block the decision or the base row. Confirm.

3. **Amortized id (C2)** — `archive-id-allocator.ts`: block allocation via `SELECT nextval('signal_eval_archive_id_seq') FROM generate_series(1,1000)`, served from an in-memory buffer by a SYNC `takeArchiveId()` (no await, no per-decision DB round-trip). Background refill at <200 remaining. Migration also bumps the sequence `CACHE 50`. **B-PHASE-A2 CYCLE_DBS_TIMING verification will run at Step-7 before I call it done.**

## ★ CORRECTION TO THE PRE-AUDIT (please note)

My pre-audit cited the hooks as `vts-runner.ts:1930/3584`. **That was wrong** — those are the CRYPTO path (provenance is OFF for crypto at launch). Verified in code: the xStock decisions archive from **`server/asset_classes/xstock_spot/eval-cycle.ts`** (4 hooks: L538 strategy_internal, L635 sqe, L668 tcl, L685 admitted; `source:'vts-runner'` there is just a label). So I threaded the provenance into eval-cycle.ts, NOT vts-runner. The vts-runner crypto hooks are left untouched (gated off; to be threaded when crypto provenance is enabled). This is the correct surface for an xStock-only launch.

## FILES

**NEW:**
- `drizzle/migrations/2026-06-07-b-new-53-decision-provenance.sql` (+ `-rollback.sql`, out of MANIFEST) — `signal_eval_provenance` (partitioned by captured_at, PK (captured_at, archive_id), typed cols, 2026-06..2027-06 partitions), `module_constants_version` (hash PK), `ALTER SEQUENCE ... CACHE 50`, per-class capture flag (xstock=true/crypto=false/*=false fail-closed).
- `server/services/data-archive/archive-id-allocator.ts` — block id allocator (C2).
- `server/services/data-archive/decision-provenance.ts` — `resolveConstantsProvenance` (re-resolve + stable hash) + `recordConstantsVersion` (in-proc-deduped upsert-on-novel).
- `server/tests/unit/b-new-53-decision-provenance.test.ts` — 8 tests.

**MODIFIED:**
- `server/services/data-archive/signal-eval-archiver.ts` — `id` in COLUMNS (DEFAULT-on-undefined); register provenance table; `SignalEvalProvenanceInput`; provenance enqueue logic.
- `server/services/data-archive/archive-batch-writer.ts` — `registerArchiveTable(name, cols, defaultOnUndefined[])`; `insertChunk` emits `DEFAULT` for undefined values of default-on-undefined columns (explicit `null` still → NULL).
- `server/services/data-archive/archive-config.ts` — `provenanceCaptureByClass` resolved per-class + `provenanceCaptureEnabled(ac)`.
- `server/asset_classes/xstock_spot/eval-cycle.ts` — `_provBase` (forming bar by value, captured right after detect; settled-ref; interval from bar spacing) + `provenance` threaded into the 4 hooks (hooks 2-4 add the resolved stop/target levels = RI-a checksum).
- `server/scripts/b70-create-monthly-partitions.ts`, `b70-retention-sweep.ts`, `b70-table-export.ts`, `server/services/drift-dashboard-aggregator.ts` — register `signal_eval_provenance` in their table lists (partition look-ahead, 90d retention sweep, cold-tier export, dashboard panel).
- `server/startup/data-archive-bootstrap.ts` — `primeArchiveIdAllocator()` at boot.

## DEFERRED to deploy/post-deploy (noted, not in this diff)
- The 2 §10.5 scheduled alerts (post-accrual proof-of-capture re-run; resume-Phase-25-sweep) — registered at Step-6 via `npm run system-alerts -- add` with the concrete accrual condition (≥N xStock provenance rows with `forming_bar_ts + interval < now` across ≥M strategies). The proof-of-capture parity re-run (Obj-4) is a POST-ACCRUAL gate per your BONUS condition, not a deploy-time check.
- The Obj-4 harness change to LEFT-JOIN + report coverage% vs parity% separately (C1) — built when the Phase-25 study runs against captured rows.

Reply with approve-to-push or required changes.
