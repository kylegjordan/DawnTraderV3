# B-ENTRY-CONSUMPTION-FRESHNESS — Step 11 closing correction

## Why this correction exists

The required one-pass fresh reader found three load-bearing qualifications in the closing mechanism claim. Re-derivation confirmed that the guarantee belongs to the active engine rather than every repository execution path, that `OrderPlacer.openOrder` is the immediate order-placement/consumption boundary rather than necessarily a side effect in the present paper adapter, and that `[CONSUMPTION_PASS]` logging sat between the final age verdict and that boundary.

## Changed behavior

- The active engine now invokes `orderPlacer.openOrder` before emitting the PASS line. A future live placer can therefore submit synchronously without first waiting on a potentially blocking logging sink.
- No threshold, refusal rule, snapshot, arm selection, persistence field, or later-fill maker behavior changed.
- Source and runtime tests now pin port invocation before PASS logging while retaining the same-snapshot and fail-closed assertions.

## Claim corrections

- Completion and governance wording now says **active-path** direct taker and maker-to-taker, not every immediate path in the repository; VTS remains outside this batch.
- The port is described as the active engine's sole immediate **order-placement/consumption boundary**. The present paper adapter is a pure depth walk, while a future live implementation may place a real order.

## Verification before review

- `npx vitest run server/tests/unit/b-entry-distance-guard.test.ts server/tests/unit/b-entry-consumption-freshness.test.ts server/tests/unit/b-entry-consumption-freshness-engine.test.ts`
- Result: 3 test files passed; 46/46 tests passed. The adjacent entry-distance source fence was updated to follow the renamed fill-promise binding while preserving its floor-before-fill assertion.
- `git -c core.whitespace=cr-at-eol diff --check`: clean.

`REVIEWER: claim-only · name the objects that settle the same-snapshot active immediate-open mechanism and other states consistent with them · active-path/VTS scope, paper-port terminology, and pre-call PASS-log gap hit · re-derived yes`
