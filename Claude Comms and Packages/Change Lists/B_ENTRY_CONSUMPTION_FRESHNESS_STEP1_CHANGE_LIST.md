# B-ENTRY-CONSUMPTION-FRESHNESS — Step 1 change list r1

**Review target:** scope and plan placement only; no runtime code or schema changed.

**Change class:** sub_batch

**Parent / issue:** pre-sprint P1b, row 40 entry half / `#684`

## Added

- `Claude Comms and Packages/Scope Files/B_ENTRY_CONSUMPTION_FRESHNESS_SCOPE.md`
  - scopes the final class-agnostic book-freshness check at the immediate-fill consumption boundary;
  - preserves the existing 5-second crypto and 15-second xStock DB-governed limits;
  - preserves the upstream xStock dispatch guard, liveness gate, VPG/VOG ordering, same-snapshot identity, and pending-maker boundary;
  - records full provenance for the gate, snapshot/walk, order port, and existing entry-age evidence;
  - requires separate gate-time and consumption-time facts without duplicating Stage-4 `#1083`;
  - pre-registers deterministic delay mutations and an immediate bounded live proof, with no calendar observation hold.

## Updated

- `1-system-manual/SPRINT_TO_LIVE_PLAN.md`
  - names `B-ENTRY-CONSUMPTION-FRESHNESS` as the leading batch/reference for row 40's P1b entry half;
  - makes the P1b summary explicit without changing its sequence.
- `Claude Comms and Packages/Scope Files/PRE_SPRINT_SIMULATION_TRUTH_PLAN.md`
  - names the P1b sub-batch at the already-approved consumption-freshness item.
- `Claude Comms and Packages/SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md`
  - records the current unblocked pre-sprint work and the nonblocking state of the two event-window batches.

## Reviewer questions

1. Does the scope preserve the original single-snapshot intent while correctly extending freshness through the elapsed waits?
2. Is it correct to leave both governed thresholds unchanged given the registered xStock relaxation result and Kyle's hour-invariant ruling?
3. Is the immediate-fill versus pending-maker boundary exact, including maker-marketable→taker fallback?
4. Are separate gate-time and consumption-time evidence plus existing refusal telemetry sufficient without prematurely duplicating `#1083`?
5. Does the Step-7 plan prove the mechanism without creating another global deployment hold?
