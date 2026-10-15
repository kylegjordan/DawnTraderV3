# B-CLASS-LEG-FILL-MODE — Step 2 change list

**Audit ref:** `e6bc1c505e37e6c5ea89b494b8c9cdd5c5b0ec06`

**Step:** 2 of 11 — pre-implementation audit and implementation plan

**Implementation:** none in this change set

## Changed

1. `Claude Comms and Packages/Scope Files/B_CLASS_LEG_FILL_MODE_PRE_AUDIT.md`
   - audits all six required sources: current code, runtime/database, System Impact Map, System Manual, ledgers/completion records, and canonical/git provenance;
   - enumerates four maker/taker decision callers, three shared pending evaluators, the sole twin planner, every VTS open-row writer/rehydrate seam, and the independent paper/VTS schedulers;
   - records the live deployment cut: seven pending entries and one xStock target rest cannot receive invented policy/placement provenance;
   - keeps the existing two-arm Net Expectancy calculation unchanged and places a typed per-class/per-leg policy overlay after it;
   - separates the existing freshness clock from the exact local quote-arrival clock and makes `placement < arrival < deadline` structural;
   - plans durable policy/placement provenance through RTB, paper and VTS persistence/rehydration;
   - preserves stop precedence, VTS target-rest exclusion, xStock replay semantics and the remaining `#1073` home;
   - records exact continuation rules for every open observation window and creates no new calendar or deployment hold;
   - incorporates the one-pass fresh-reader hits after re-deriving them at the audited ref with positive controls.

## Load-bearing review questions

1. Is the policy overlay correct: maker-only requires a positive adjusted maker arm and rejects on the hard taker floor, while maker-preferred chooses an admissible maker first and falls back only to an independently admissible taker under the caller's existing lane floor?
2. Is policy correctly treated as snapshotted decision/rest provenance rather than a live fill-time lookup?
3. Does the strict local-receipt interval preserve the intentional mixed freshness clocks and the existing fill-wins-late-evaluation rule?
4. Are the legacy cuts correct: retire no-provenance pending entries unfilled, and clear no-policy target rests while leaving positions open?
5. Is suppressing forbidden/inadmissible VTS twins the right way to honor policy without corrupting aggregate exclusions?
6. Do the observation handoffs permit normal reviewed deployments while preserving the October 19, October 25 and November reads?

## Explicit non-changes

- no application code, schema or migration in Step 2;
- no change to the two-arm Net Expectancy kernel, maker haircut, fees or existing lane floors;
- no change to quote freshness limits, accepted sides or freshness clock basis;
- no VTS target-rest lifecycle (`#513`);
- no resolution of `#1073`'s refused-cycle deletion timing;
- no historical timestamp/policy backfill;
- no natural-fill quota or observation freeze;
- `.claude/launch.json` remains untouched.
