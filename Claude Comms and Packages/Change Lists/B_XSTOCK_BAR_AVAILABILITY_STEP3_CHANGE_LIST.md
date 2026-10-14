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

### Increment-1 CI correction

- CI run `38589282989` applied the migration successfully and passed TypeScript Check, Build, and Docker Build, but the Test Suite exposed that a one-element JavaScript UUID array was reaching PostgreSQL as scalar text rather than a `uuid[]`. Certification therefore failed closed exactly as designed, leaving the test revision pending instead of falsely certifying it.
- The certificate call now supplies an explicit PostgreSQL array literal while retaining the database-generated UUID source and exact-set checks on both sides of the transaction boundary.
- The pre-existing writer retry fence now mocks the new bounded repair transaction and exercises generic retry/latch mechanics on the unchanged xStock-perpetual path rather than accidentally entering the new xStock-spot revision contract with a crypto fixture.
- Focused rerun: `npx vitest run server/tests/unit/f-g-1-writer-retry-fence.test.ts server/tests/unit/b-xstock-bar-availability-capture.test.ts server/tests/integration/b-xstock-bar-availability-revision.test.ts` — 3 files passed; 21 tests passed, 1 local-database integration case skipped.
- `node scripts/check-tsc-baseline.mjs` — 337 current errors / 337 baseline errors; no regression.
- Corrected CI run `38590391854` passed TypeScript Check, Test Suite, Build, and Docker Build individually.

## Increment 2 — exact aggregate, snapshot/cache, manifest, and prewarm identity

- Added immutable daily-partitioned 15-minute and 60-minute aggregate revisions whose canonical payload names the exact ordered winning 1-minute revision set, its maximum certified availability bound/sequence, and the aggregate values.
- Added a primary read-observation sequence and clock check after each exact source read. Primary identity uses the stable database system identity plus database/listener identity, so an ordinary database restart does not invalidate every historical certificate while a different cluster/listener still fails closed. Historical reads anchor both the source window and eligibility test to the requested cutoff; an uncertified or later actual winner cannot resurrect a lower certified revision.
- Added content-addressed settled-window manifests and database checks that the complete ordered aggregate set exists, belongs to one symbol/interval and stable primary identity, is time-ordered, and matches the declared bounds and canonical payload before reuse.
- Added snapshot columns and database guards that allow legacy all-NULL rows or fully linked exact rows, reject value/evidence drift under one aggregate ID, and reject inserts whose values or source evidence do not match the immutable aggregate.
- Added a separate availability-aware cache API for 15-minute and 60-minute bars. Snapshot reads cross-check persisted aggregate values/evidence; a newer ineligible live collision replaces the whole older object; TTL hits retain the original read evidence; 240-minute reads now fail before the database.
- Migrated restart/manual prewarm to the same exact aggregate and awaited snapshot-write path. Dry-run uses the same winner/certificate query inside a read-only transaction and creates no identities or snapshot rows.
- Registered aggregate partitions in the shared daily partition lifecycle and added a rollback that removes only this aggregate/snapshot layer while preserving the raw revision ledger.

### Increment-2 verification before push

- Focused run: 7 test files passed; 32 tests passed and 6 local-database legs skipped. The population covered raw capture, exact aggregation, manifest identity and mixed-primary refusal, snapshot/cache collision, value/primary mismatch handling, restart/prewarm, legacy 15-minute/60-minute aggregation, and the F-G-1 arrival guard.
- `node scripts/check-tsc-baseline.mjs` — 337 current errors / 337 baseline errors; no regression.
- The snapshot trigger, aggregate/manifest database functions, and PostgreSQL integration mutation require the migration-applied CI database; they are not represented as locally passed.

### Increment-2 CI correction

- CI run `38596665242` applied both migrations and passed TypeScript Check, Build, and Docker Build, but its Test Suite found one exactness defect in the new PostgreSQL integration case: the PostgreSQL driver rounded a certified `timestamptz` with microsecond precision through JavaScript `Date` milliseconds before aggregate persistence, so the database correctly rejected the altered availability bound.
- Availability and read-observation bounds now cross the application boundary as fixed-width UTC database text with six fractional digits. Aggregate canonical payloads, snapshots, manifests, and comparisons retain that exact value; JavaScript parses a copy only when it needs temporal ordering.
- Focused correction run: 4 test files passed; 15 tests passed and 1 local-database integration leg skipped. `node scripts/check-tsc-baseline.mjs` remained 337 current errors / 337 baseline errors.
- Corrected CI run `38597553810` passed TypeScript Check, Test Suite, Build, and Docker Build individually; the migration-backed microsecond regression passed.

## Increment 3 — decision-window evidence foundation

- Added a fail-closed decision-window builder that accepts only a strictly ordered, homogeneous, fully eligible bar array, proves the later read observation cannot precede any source availability bound/sequence, and binds its forming aggregate revision to a content-addressed settled-window manifest without dropping or reordering unavailable bars.
- Manifest persistence now takes a later primary-database read observation in the same transaction, refuses a primary-identity crossing, and returns that exact observation beside the manifest identity. This is the typed handoff the scanner and RTB scalar-reduction paths will consume together with their provenance writes; neither live consumer is switched by this foundation commit.
- Focused run: `server/tests/unit/b-xstock-bar-availability-aggregate.test.ts` passed 8 tests. `node scripts/check-tsc-baseline.mjs` remained 337 current errors / 337 baseline errors.
