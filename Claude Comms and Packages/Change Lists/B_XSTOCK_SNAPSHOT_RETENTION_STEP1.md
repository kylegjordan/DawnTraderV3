# B-XSTOCK-SNAPSHOT-RETENTION — STEP 1 REVIEW LIST

**Batch:** `B-XSTOCK-SNAPSHOT-RETENTION` · **Issue:** `#1194` · **Owner:** ANALYST Codex · **Reviewer:** Coltrane

## Review ref

The pushed commit carrying this file is the exact review ref named in the Discord dispatch.

## Added

- `Claude Comms and Packages/Scope Files/B_XSTOCK_SNAPSHOT_RETENTION_SCOPE.md`
  - declares `change-class: architecture`;
  - sets seven numbered objectives and executable verification criteria;
  - scopes the existing B75 move-not-delete path, not a second archiver;
  - preserves a governed 30-day hot window plus 240/60 per-symbol live floors;
  - requires exact archive/download/count/checksum evidence before bounded cleanup;
  - carries legacy and future certified availability rows without touching immutable evidence;
  - makes historical readers refuse or rehydrate outside the hot horizon;
  - records direct SIM, System Manual, ledger, completion-report, runtime and provenance reads.

## Updated

- `1-system-manual/SPRINT_TO_LIVE_PLAN.md`
  - moves pre-sprint stage 3 item 6 from queued to Step 1 with Coltrane.
- `.claude/memory/MEMORY_CC_C.md`
  - records the active batch/step, released dependency, scope direction, board state and preserved waits.

## Board

- Existing item `PVTI_lAHODmulEM4BfQP4zhAulos` moved from Backlog to Scope.
- Owner remains Analyst; type Batch; issue `#1194`; phase Phase 19.
- `Blocked on` is set to the board's reviewer option (`Langston`); Coltrane is the active reviewer for this Codex shift.

## Reviewer questions

1. Is `architecture` the correct change class for adding destructive snapshot cleanup to the B75 lifecycle?
2. Is the union rule—30-day hot horizon plus the newest 240/60 rows per symbol—the correct minimum safe contract, including inactive symbols?
3. Does routing the exact ranked population through the existing B75 plain-archive proof preserve the move-not-delete rule without creating a second lifecycle implementation?
4. Are the availability and decision-provenance boundaries correct: snapshot rows may age, but raw revisions, aggregate revisions, window manifests, refresh/decision provenance and B75 exact evidence do not?
5. Does the scope honestly separate a logical row bound/free-space reuse from physical file shrink, with the physical mechanism deferred to the Step-2 measured design?
6. Are the current replay/calibration readers correctly classified as recent-hot, rehydrate-required, or dormant rather than used to justify unbounded hot storage?
