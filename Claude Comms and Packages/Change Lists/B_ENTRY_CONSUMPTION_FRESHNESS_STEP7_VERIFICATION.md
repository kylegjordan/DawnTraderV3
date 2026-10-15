# B-ENTRY-CONSUMPTION-FRESHNESS — Step 7 first-pass staging verification

**Reviewed/deployed code:** `28c58fb8dc537242f7c1b320dd7e4d1f13af1b8a`

**Deployment record:** 2026-10-15T11:32:06Z, `restart_time=647`, actor `codex-c`, 11-second check-failure window

**Rollback:** `fe37ca6e266069b939d7a1cf34c0d6e11e613a8a`

**Step:** 7 of 11 — first-pass staging verification

## Verdict

**PASS under the approved bounded-window contract.** The registered live window reached its 15-minute cutoff with zero final consumption-freshness decisions. Zero is the terminal measured result, not a reason to extend the window or hold another deployment. The deterministic production-seam suite therefore carries the functional acceptance proof, while the live read proves deployment identity, health, schema availability, telemetry initialization, and that the separate xStock availability observation crossed this deployment through its designed durable handoff.

## 1. Pre-registered live window and stopping rule

- Application-ready anchor: `2026-10-15T11:32:01Z`, from the exact production line `[R9.3.HF-4.FIX] ✅ Paper engine resumed successfully`.
- Population: every structured `CONSUMPTION_PASS` and `CONSUMPTION_BLOCK` line in both application streams from the anchor until the first of 50 reached-seam decisions, 15 elapsed minutes, or another reviewed deployment.
- Fixed time cutoff: `2026-10-15T11:47:01Z`, exclusive.
- Actual stop: **time cutoff**. The deployment record, live checkout, built identity, and process counter were unchanged at the post-cutoff read, so no intervening deployment or restart shortened the window.
- The current output stream covered `11:05:39Z` through `11:48:33Z`; the current error stream covered `00:00:04Z` through `11:48:33Z`. Both therefore contain the complete registered interval.

## 2. Parser control and final live denominator

Before the live zero was read, the extractor was run against an exact-shape fixture containing one `CONSUMPTION_PASS` and one `CONSUMPTION_BLOCK`. It returned denominator 2, one direct-taker arm, one maker-to-taker arm, one crypto row, one xStock row, one pass, one block, and one stale-at-consumption reason. This proves the timestamp bounds, both outcome patterns, class/arm fields, reason field, two-stream merge, and 50-event cap can all fire.

The post-cutoff production extraction then read both live streams and returned:

| measured population | count |
|---|---:|
| all reached-seam decisions before the 50 cap | 0 |
| bounded denominator | 0 |
| `CONSUMPTION_PASS` | 0 |
| `CONSUMPTION_BLOCK` | 0 |
| crypto | 0 |
| xStock | 0 |
| direct taker | 0 |
| maker-to-taker | 0 |
| stale-at-consumption refusals | 0 |
| invalid-clock refusals | 0 |

Both stream-wide marker counts were also zero. This is not interpreted as evidence that the guard would admit or refuse correctly; it means no entry reached this final seam during the bounded window.

The authenticated in-memory read at `2026-10-15T11:48:07.250Z` independently agreed: attempts 0, opened 0, blocked 0, open-failed 0, and `CONSUMPTION_FRESHNESS=0`. Its positive upstream control was 295 maker/taker choice samples (292 maker, 3 taker), showing that the engine was evaluating candidates even though none progressed into the RTB attempt/final-consumption population.

## 3. Functional acceptance control

The production-seam tests were re-run after the live cutoff: **2 files, 26 tests passed**.

- The real `ActiveExecutionEngine.executeSimulatedTrade` path covers direct taker and maker-to-taker expiry, each with no placement, exactly one depth block, exactly one `CONSUMPTION_FRESHNESS` failure, and no trade or position write.
- A fresh immediate fill passes the identical asks-array object to placement and persists ordered 4,000 ms first-gate / 4,250 ms final-consumption ages.
- A pending maker does not call the immediate placer, persists the position, and leaves consumption age null.
- The Step-4 mutation proof remains discriminating: bypassing the production final guard made exactly the two expiry cases open and persist; restoring it returned the suite to green.

This is the functional proof for the zero-opportunity live window. The live zero itself is not promoted into a behavior claim.

## 4. Database and durable evidence

- Migration `2026-10-15-b-entry-consumption-freshness.sql` is present in the live migration ledger with applied time `2026-10-15T11:31:55.383297Z`.
- Both `entry_book_age_ms` and `entry_book_consumption_age_ms` exist as nullable double-precision fields.
- Positive historical control: 477 pre-window closed-trade rows carry the existing first-gate age.
- No pre-window row carries a final-consumption age, confirming the migration did not backfill or reinterpret history.
- The exact live window produced zero closed-trade rows, agreeing with the zero final-seam denominator rather than manufacturing persistence evidence from another population.

## 5. Live identity and health after the cutoff

All identity reads matched the exact Coltrane-approved ref:

- deploy record: `28c58fb8dc537242f7c1b320dd7e4d1f13af1b8a`;
- live checkout: `28c58fb8dc537242f7c1b320dd7e4d1f13af1b8a`;
- built artifact: `28c58fb8dc537242f7c1b320dd7e4d1f13af1b8a`;
- authenticated liveness response: the same build, `engineExpected=true`, `engineRunning=true`;
- process: online, `restart_time=647`, matching the deployment record, with zero unstable restarts.

Therefore the bounded evidence belongs to the reviewed code and one uninterrupted application boot.

## 6. xStock availability observation continuity

The newest xStock writer boot is `1aab5ae6-d372-4825-9fbe-5555b414f031`, started at `2026-10-15T11:32:05.634979Z` on the reviewed build. It names predecessor `c75247e2-421e-42c1-ab71-ea811c9668a4`, whose durable handoff completed at `2026-10-15T11:31:56.012133Z` with:

- 31,322 accepted input frames;
- 10,333 superseded buffer writes;
- 20,989 projection attempts;
- 2,623 admission flushes;
- 2,623 completion flushes.

That explicit predecessor-to-successor link is the designed evidence that the separate `B-XSTOCK-BAR-AVAILABILITY` observation continued across this ordinary reviewed deployment. It did not reset this batch's window and this batch did not hold that observation.

## 7. UI judgement

**No affected UI surface exists for this batch.** The changed behavior is a backend-only final entry guard plus backend evidence. The two diagnostic endpoints are not fetched or rendered by the client. The generic closed-trades response can contain the new database field, but `PaperClosedTradeRow` does not declare it and `adaptPaperClosedTrade` explicitly maps the fields sent to the shared closed-trades table without it (`client/src/lib/paper-trade-adapter.ts:78-143,294-343`; `client/src/components/trading/trade-history-tab.tsx:283-285`). A repository-wide client search had a positive control on the existing trades adapter/use site and zero references to the new field, stage, or diagnostic endpoints.

Because the client deliberately discards this backend evidence and no visible component changed, browser navigation could not exercise the batch and is **not applicable**, rather than skipped as a substitute for a backend check.

## 8. Known limits

1. The 15-minute staging window naturally exercised zero final consumption checks, so it supplies no live distribution, class split, arm split, admission, refusal, or persistence sample. The production-path suite and mutation carry those behavior claims.
2. The batch preserves the existing first-gate age and its intentionally compatible xStock clock treatment. It does not repair any source-clock skew already embedded before this final check.
3. The live database supplied schema and no-backfill evidence, but no new admitted trade existed in the registered window from which to read a final-consumption age.

REVIEWER: claim-only · zero-window and UI-completeness object selection · HIT: anchored at the engine-resumed log, read PASS from out.log and BLOCK from error.log, treated trade rows as a cross-check, and traced unchanged API/adapters before declaring no UI surface · re-derived yes

## Step 8 handoff

Coltrane should independently re-run the two-stream bounded extraction, read the migration/schema and exact-window rows, compare deploy-record/live checkout/built/liveness identity plus the restart counter, inspect the xStock predecessor handoff, and verify that the zero-opportunity cutoff is terminal under the approved Step-2 contract. The deterministic engine-path suite and Step-4 mutation record are the functional controls; the live zero is not.
