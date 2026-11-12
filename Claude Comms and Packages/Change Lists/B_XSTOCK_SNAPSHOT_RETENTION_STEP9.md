# B-XSTOCK-SNAPSHOT-RETENTION — Step 9 iteration gate

**Owner:** ANALYST Codex (`codex-c`)
**Reviewer:** Coltrane
**Step 8 evidence ref:** `33e5162af1fbb460fddec9b204322fcb9fe8528e`
**Deployed code ref:** `fbbe0b5e4af86be3a87fa0d6c2362f3e7bc899e4`

## Verdict

All seven scoped objectives are green. No Step 9 repair loop is required, so the batch may proceed to Step 10 governance without another code, deploy, or verification cycle.

## Objective closure

| objective | Step 9 result | exact evidence |
|---|---|---|
| OBJ-1 — one governed selector contract | GREEN | The frozen 30-day-plus-floor selector was exercised for both tables; Coltrane reproduced zero remaining eligible rows and symbols against nonzero 495-symbol live controls. |
| OBJ-2 — verified archive-before-delete | GREEN | Coltrane reproduced 100 complete 15-minute proofs covering 2,163,663 rows and 111 complete 60-minute proofs covering 573,523 rows. |
| OBJ-3 — delete only the proven population | GREEN | Archive, downloaded proof, exact evidence, proven-key deletion, post-delete absence, and the one-second lock/five-second statement fail-closed path were independently reproduced. |
| OBJ-4 — preserve live cache and writers | GREEN | Post-apply writers added 11,832 fifteen-minute rows and 489 sixty-minute rows; the next retention run completed with zero deletes and zero failures. |
| OBJ-5 — preserve availability/provenance evidence | GREEN | The availability anchor stayed `2026-11-09T00:05:00Z`; all five named event waits remained unacknowledged; only the two completed retention-failure rows were resolved. |
| OBJ-6 — honest historical consumers | GREEN | The reviewed implementation and focused tests preserve recent-hot readers, refuse unsupported historical reads with the rehydrate path, and leave dormant AMR unreachable. |
| OBJ-7 — execute safely and prove the bound | GREEN | The supervised backlog completed with exact totals, the current frozen selector was empty, the natural writer/next-run control passed, and CI run `43092508271` passed TypeScript Check, Test Suite, Build, and Docker Build individually. UI is N/A. |

## Known limits carried into governance

- The evidence proves the registered backlog and next post-writer run, not future storage or database availability.
- Writer contention remains fail-closed and may defer an object to a later run.
- Ordinary vacuum makes deleted pages reusable but does not promise immediate allocated-file shrinkage.

## Step 9 disposition

No objective is silently open and no finding needs a separate repair home. The Delivery Board remains **Verification / Approved / Blocked on Nothing** until Step 10 moves the batch into governance.
