# B-CLASS-LEG-FILL-MODE — Step 11 selected-EV correction

**Date:** 2026-10-15

**Owner:** CC-C / ANALYST Codex

**Change class:** `behavioral-correction`

**Deployed ref audited:** `097306d1a91d5bb0dfc9cc9d376ec84887861aeb`

## Completion-audit finding

The Step-11 claim-only reader found, and CC-C independently re-derived, a narrow crypto VTS provenance mismatch. Admission correctly used `_vtsPolicyDecision.chosenNetEV`, but the durable `netEvAtOpen` snapshot and returned `VirtualSignal.netEV` still used the pre-policy best-of-both value. The ordinary VTS trade log separately labelled taker EV as `netEV`.

This matters for `maker_only`: when adjusted maker EV is 2 and taker EV is 3, policy admission selects maker EV 2 while the old persistence/recheck path recorded 3. A positive-control case with maker EV 3 and taker EV 2 records 3 in both worlds, demonstrating that the check distinguishes matching from mismatching states.

## Correction

- `server/services/vts-runner.ts`
  - persists `_vtsPolicyDecision.chosenNetEV` as `netEvAtOpen`;
  - returns that same selected value as `VirtualSignal.netEV` for the caller-side floor recheck and rejection archive;
  - logs the selected entry mode and selected EV together;
  - reconciles nearby comments with the post-policy contract.
- `server/tests/unit/b-class-leg-fill-mode.test.ts`
  - proves `maker_only` can select maker EV even when the pre-policy best-of-both arm is taker;
  - fences all three crypto VTS selected-EV seams against regression.

The complete `_vtsMtDecision` consumer census found no other correction. Taker-only calibration fields (`expectedEdge`, `predictedProfit`, `predictedPwinAtOpen`), the marketable fallback, and independently admissible twin checks retain their intentional meanings. The xStock creator already persists its policy-selected EV.

## Local evidence

- Focused behavioral suite: 2 files, 27 tests passed.
- Mutation: replacing only the corrected durable `netEvAtOpen` source with `_vtsMtDecision.chosenNetEV` caused exactly 1 of 25 tests to fail at the new wiring fence; restoring the correction returned the focused suite to 27 of 27 passing.
- `git diff --check`: clean apart from the repository's existing Windows LF/CRLF notice.

## Review and release gates

This correction must receive Coltrane review at its exact pushed ref, pass all four CI jobs, deploy as an exact SHA, and repeat bounded staging verification before the Step-11 completion report may close. It creates no observation window and no deployment hold.
