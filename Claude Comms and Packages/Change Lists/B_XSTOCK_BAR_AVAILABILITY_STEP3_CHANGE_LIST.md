# B-XSTOCK-BAR-AVAILABILITY — Step 3 implementation change list

**Issue:** `#707`

**Approved plan:** `B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md`

**Status:** implementation in increments; this file is cumulative until Step 3 closes.

## Increment 1 — immutable raw revision capture and certification

- Added a daily-partitioned, append-only `xstock_bar_revision_event` ledger and kept the existing `xstock_spot_ohlc_1m` table as the compact operational projection.
- Added an xStock-only server-side application function that serializes each key, preserves maximum-arrival/equal-arrival-last-applied F-G-1 behavior, assigns projection generations only to winners, and records rejected older arrivals without a generation.
- Added distinct immutable event identity for identical payloads, with payload-repetition telemetry and predecessor/winner linkage.
- Added a later-transaction primary certificate with exact expected/returned-ID equality, monotonic `visible_seq`, a database-clock non-regression guard, and NULL/fail-closed repair semantics.
- Added a bounded repair pass to the existing writer cadence and shutdown drain; a certificate failure never replays the original arrival transaction.
- Added a compact-projection trigger that rejects rolling-deploy/legacy writes which mutate xStock OHLC values or the arrival watermark without rotating the immutable winner ID.
- Added daily partition registry/bootstrap coverage, typed compact-projection columns, writer telemetry for accepted frames, same-buffer supersession, attempts, repeated payloads, winners, rejected arrivals, certificates, and pending repair.
- Added focused unit tests for payload identity, exact-ID set equality, post-commit call order, and certificate failure; added a PostgreSQL integration mutation for `X@A1 -> identical X@A3 -> changed Y@A2` and exact replayable winner-chain evidence.

### Increment-1 verification

- `npx vitest run server/tests/unit/b-xstock-bar-availability-capture.test.ts server/tests/unit/f-g-1-reopen-writer-order.test.ts` — 2 files / 17 tests passed.
- `node scripts/check-tsc-baseline.mjs` — 337 current errors / 337 baseline errors; no regression.
- The new PostgreSQL integration test requires the migration-applied CI database and is therefore graded by the pushed four-job run, not represented as locally passed.
