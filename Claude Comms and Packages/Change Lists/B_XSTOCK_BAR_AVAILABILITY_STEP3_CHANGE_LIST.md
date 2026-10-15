# B-XSTOCK-BAR-AVAILABILITY — Step 3 implementation change list

**Issue:** `#707`

**Approved plan:** `B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md`

**Status:** Step 3 capture-phase implementation complete; Step 4 corrections ready for exact-ref re-review.

## Step-4 dispatch header

**DECLARED CHANGE-CLASS:** `architecture`

**STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md` at approved ref `8623c6ce1`.

### Architecture document set at this gate

| document | gate state |
|---|---|
| batch `SCOPE` | **present** — `Claude Comms and Packages/Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md` |
| batch `PRE_AUDIT` | **present** — `Claude Comms and Packages/Scope Files/B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md` |
| `COMPLETION_REPORT` | **absent** — Step 11 is not reached; the batch must remain open through the capture observation and enforcement phases. |
| `BATCH_CATALOG.md` | **absent** — content update is owed at Step 10. |
| `PHASE_HISTORY.md` | **absent** — content update is owed at Step 10. |
| `SYSTEM_MANUAL.md` | **absent** — required architecture content update is owed at Step 10. |
| `SYSTEM_IMPACT_MAP.md` | **absent** — required architecture content update is owed at Step 10. |
| `CHANGES_AND_FIXES.md` | **absent** — the availability/no-look-ahead risk entry is owed at Step 10. |
| `RUNNING_ISSUES.md` | **absent** — issue `#707` remains open and is owed its Step-10 update. |
| `POST_AUDIT_ROADMAP.md` | **judged N/A** — this diff changes the active pre-sprint batch, not the phase-level roadmap. |
| `DELETED_COMPONENTS_LOG.md` | **judged N/A** — this diff deletes no component. |
| `ADJUSTMENT_FRAMEWORK.md` | **judged N/A** — this diff changes no trading parameter or adjustment rule. |
| `PHASE_19_PLAN.md` | **judged N/A** — this batch has no in-flight row there. |
| active `SPRINT_TO_LIVE_PLAN.md` row | **present, open** — the Stage-3 row exists; its close/report update is owed at Step 10. |
| shared `MEMORY.md` | **absent** — final shared-state update is owed at Step 10. |
| own `MEMORY_CC_C.md` | **present** — advanced to Step 4 at this ref. |
| Langston `MEMORY.md` | **absent** — Coltrane-shift handback update is owed at Step 10. |
| four session task lists | **absent** — ANALYST list update and the three `N/A — not mine` ledger entries are owed at Step 10. |

## Exact review object

- **Graded code ref:** `12c0b71341939d60c92ce19c6ffe6faadb370fa2` on `migration/b-xstock-bar-availability-step4-codex-c`; this change list is committed immediately after it on that review branch. `origin/migration/aws-supabase` remains at `37ef9f382` until Step 4 approval, so none of the review-only commits is represented as shared yet.
- **Batch commits:** `65d66a6aa`, `9e7a2c068`, `d0ded2877`, `a0d3a9c34`, `661b8e818`, `7235d3052`, Step-3 boundary record `37ef9f382`, capture-only deployment correction `744a5a4c8`, and Step-4 blocker closure `12c0b7134`.
- **Review boundary:** P14 phase 1 only. The scanner and RTB consumer switch is deliberately absent until the full capacity/quality population passes. The exact aggregate/cache/manifest APIs are present but dormant; manual and lifecycle prewarm remain on the legacy path during capture so the old consumers receive the same producer contract.

**REVIEWER:** claim-only · asked what objects settle the capture-only/no-live-consumer-switch claim and what other worlds fit them · **HIT:** shared snapshot prewarm could affect legacy reads, the projection trigger would reject old-process writes during migration, and caller absence alone was not an activation lock · **re-derived yes** — the live prewarm caller and deployment order confirmed both effects; this ref keeps exact prewarm as a separately named dormant API, leaves lifecycle/manual prewarm legacy, and activates the projection guard durably only when the new writer first runs.

## Load-bearing diff excerpts

### NEW — xStock-only writer boundary; first transaction commits before certification

```ts
const attempts = await db.transaction(async (tx) => {
  const result = await tx.execute(sql`
    SELECT * FROM apply_xstock_bar_revision_events(
      ${payloadJson}::jsonb,
      ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid,
      ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text
    )
  `);
  return resultRows<DbProjectionAttemptRow>(result).map((row) => ({
    revisionId: row.revision_id,
    arrivedAt: new Date(row.arrived_at),
    projectionApplied: row.projection_applied,
    projectionGeneration: row.projection_generation == null ? null : Number(row.projection_generation),
    supersedesRevisionId: row.supersedes_revision_id,
    observedWinnerRevisionId: row.observed_winner_revision_id,
    payloadHash: row.payload_hash,
    payloadRepeatedFromWinner: row.payload_repeated_from_winner,
  }));
});

const revisionIds = attempts.map((attempt) => attempt.revisionId);
const certificates = await certifyRevisionIds(revisionIds);
```

### NEW — row-locked projection generation updates the winning projection

```sql
SELECT o.winning_revision_id, o.projection_generation, o.arrived_at, o.winning_payload_hash
  INTO prior_revision_id, prior_generation, prior_arrived_at, prior_payload_hash
  FROM xstock_spot_ohlc_1m o
  WHERE o.symbol = item->>'symbol' AND o.interval_begin = in_interval_begin
  FOR UPDATE;

did_apply := prior_arrived_at IS NULL OR prior_arrived_at <= in_arrived_at;
next_generation := CASE WHEN did_apply THEN COALESCE(prior_generation, 0) + 1 ELSE NULL END;
IF did_apply THEN
  UPDATE xstock_spot_ohlc_1m SET
    open = (item->>'open')::numeric,
    arrived_at = in_arrived_at,
    winning_revision_id = new_revision_id,
    winning_payload_hash = hash_text,
    projection_generation = next_generation
  WHERE symbol = item->>'symbol' AND interval_begin = in_interval_begin;
END IF;
```

### NEW — certification refuses the wrong server, clock regression, and partial ID sets

```sql
IF pg_is_in_recovery() THEN
  RAISE EXCEPTION 'xstock visibility certification refused on a recovery/replica server';
END IF;
IF observed_at < prior_clock THEN
  RAISE EXCEPTION 'xstock bar database clock regression: observed %, prior %', observed_at, prior_clock;
END IF;
IF matched_count <> expected_count THEN
  RAISE EXCEPTION 'xstock visibility certificate exact-ID mismatch: expected %, matched %',
    expected_count, matched_count;
END IF;
```

### NEW — decision-window evidence preserves the forming revision and settled manifest separately

```ts
evidence: {
  symbol: forming.symbol,
  intervalMinutes: forming.intervalMinutes,
  formingAggregateRevisionId: forming.aggregateRevisionId,
  settledWindowManifestId: manifest.manifestId,
  settledWindowHash: manifest.windowHash,
  sourceMaxVisibleBy,
  sourceMaxVisibleSeq,
  readObservedAt: manifest.readObservedAt,
  readObservedSeq: manifest.readObservedSeq,
  certificatePrimaryIdentity: forming.certificatePrimaryIdentity,
  eligibilityState: 'eligible_certified',
}
```

## Judgement calls for Coltrane to attack

1. Does the exact arrival/application ordering remain correct under cross-process overlap, equal-arrival inversion, identical-content later arrival, and delayed certification?
2. Does the later primary observation prove only the bounded claim the documents make, while every NULL, clock, primary, set, and snapshot mismatch remains fail-closed?
3. Is this genuinely additive capture: can any scanner, RTB, replay, calibration, or dashboard path accidentally consume the new evidence as certified decision input before the capacity/quality gate?
4. Do the aggregate, snapshot, cache, manifest, and prewarm paths preserve one whole revision object—including microsecond database timestamps—without resurrecting an older eligible collision or permitting 240m fallback?

## Increment 1 — immutable raw revision capture and certification

- Added a daily-partitioned, append-only `xstock_bar_revision_event` ledger and kept the existing `xstock_spot_ohlc_1m` table as the compact operational projection.
- Added an xStock-only server-side application function that serializes each key, preserves maximum-arrival/equal-arrival-last-applied F-G-1 behavior, assigns projection generations only to winners, and records rejected older arrivals without a generation.
- Added distinct immutable event identity for identical payloads, with payload-repetition telemetry and predecessor/winner linkage.
- Added a later-transaction primary certificate with exact expected/returned-ID equality, monotonic `visible_seq`, a database-clock non-regression guard, and NULL/fail-closed repair semantics.
- Added a bounded repair pass to the existing writer cadence and shutdown drain; a certificate failure never replays the original arrival transaction.
- Added a compact-projection trigger with a durable writer-activation boundary: migration-time legacy writes remain valid until the new writer first runs, then rollback/legacy writes that mutate xStock OHLC values or the arrival watermark without rotating the immutable winner ID fail closed.
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
- Added a read observation and clock check after each exact source read. Certificates and reads now allocate from one causal sequence, so their order can be compared; primary identity uses the stable database system identity plus database/listener identity, so an ordinary database restart does not invalidate every historical certificate while a different cluster/listener still fails closed. Historical reads anchor both the source window and eligibility test to the requested cutoff; an uncertified or later actual winner cannot resurrect a lower certified revision.
- Added content-addressed settled-window manifests and database checks that the complete ordered aggregate set exists, belongs to one symbol/interval and stable primary identity, is time-ordered, and matches the declared bounds and canonical payload before reuse.
- Added snapshot columns and database guards that allow legacy all-NULL rows or fully linked exact rows, reject value/evidence drift under one aggregate ID, and reject inserts whose values or source evidence do not match the immutable aggregate.
- Added a separate availability-aware cache API for 15-minute and 60-minute bars. Snapshot reads cross-check persisted aggregate values/evidence; a newer ineligible live collision replaces the whole older object; TTL hits retain the original read evidence; 240-minute reads now fail before the database.
- Added the exact aggregate/prewarm API and its awaited snapshot-write path, but kept it separately named and dormant during additive capture. Manual and lifecycle prewarm remain on the legacy implementation until the approved dual-read/cutover phase; the exact dry-run uses the same winner/certificate query inside a read-only transaction and creates no identities or snapshot rows.
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

### Increment-3 CI and Step-3 boundary

- CI run `38599247157` passed TypeScript Check, Test Suite, Build, and Docker Build individually at `7235d3052`.
- Fresh Step-3 closeout verification at the current shared head ran the seven focused availability/capture/cache/prewarm/writer suites: 7 files passed, 49 tests passed, and the one migration-backed local integration leg skipped as designed. `node scripts/check-tsc-baseline.mjs` remained 337 current errors / 337 baseline errors.
- This is the approved P14 **additive-capture boundary**. It is intentionally deployable before live-consumer enforcement: revision capture and certification are active; exact 15m/60m aggregate identity, availability snapshots/cache/prewarm, manifests, and the decision-window evidence handoff are implemented but dormant. The scanner, RTB, and lifecycle/manual prewarm remain on the old path during the required capacity/quality observation phase.
- P8-P14 enforcement work is not waived. After this capture-only deployment, the workflow must measure the full eight-day/five-session population and capacity terms, then return through Step 9 for dual-read, the atomic scanner/RTB switch, durable refresh-attempt/promotion provenance, replay/calibration/dashboard migration, dormant-reader fences, fault rehearsals, and final live verification. No label-only path may be represented as exact in the meantime.

### Step-4 capture-only deployment correction

- The exact prewarm is now a separately named dormant API. The manual command and lifecycle controller continue to call the legacy prewarm throughout P14 phases 1-2, so the supposedly additive deployment cannot change the snapshot values consumed by the legacy scanner/RTB path.
- The projection guard now has a one-way durable activation state. It permits the still-running old process to finish legacy writes while the migration is installed, activates inside the first new-writer transaction, and thereafter rejects inserts or mutations without immutable winner rotation—including a rollback to the old writer.
- Focused verification at code ref `744a5a4c8`: 9 test files passed; 68 tests passed; 2 migration-backed local legs skipped because the isolated PostgreSQL test database is not available locally. The TypeScript baseline remained 337 current errors / 337 baseline errors. The pushed CI database must execute the migration-overlap/activation integration leg before review approval.

### Step-4 review blocker closure

Coltrane's exact-ref review at `744a5a4c8` returned five load-bearing blockers. Code ref `12c0b71341939d60c92ce19c6ffe6faadb370fa2` closes each one:

1. **Activation is serialized.** Every legacy projection write now holds a shared lock on the durable activation row until commit, while the first revision-aware writer must take the conflicting update lock before it can activate. Activation therefore waits for every already-admitted legacy mutation; the state is one-way, and every later legacy write fails closed. A real two-connection integration mutation proves the waiter blocks, the pre-boundary transaction commits first, activation completes, deactivation is refused, and later legacy update/insert paths reject.
2. **Wall-clock observations are taken inside the serialized boundary.** Certification and read observation acquire the clock-guard lock before sampling database wall time. Two separate two-connection mutations hold that lock, prove each observer is genuinely waiting on a database lock, advance the guarded clock, and prove the resumed observer cannot report an earlier time.
3. **Certificate/read order uses one sequence domain.** The independent read sequence was removed; both source certificates and later reads allocate from `xstock_bar_visible_seq`. Eligibility now rejects a read sequence behind its source maximum, with a far-ahead source mutation plus a migration-backed positive path proving a later read orders after its source certificates.
4. **Every exact snapshot source is revalidated against current winners.** Snapshot eligibility now requires every immutable source revision named by the stored aggregate to remain the current compact winner for that symbol. An older-than-overlay mutation returns the stale snapshot as the positive control but strips its exact identity and marks it legacy/unknown instead of resurrecting it.
5. **Manifest persistence preserves and validates caller order.** The persistence path no longer sorts its input; it requires strictly increasing timestamps in the supplied array and rejects a reversed window before any manifest write.

Local closeout at code ref `12c0b7134`: 5 focused files passed; 24 tests passed and 4 migration-backed two-connection/database legs skipped because the isolated PostgreSQL test database is unavailable locally. The TypeScript check reported 337 current errors over the whole project against the 337-error baseline, with no regression. Exact-ref four-job CI is pending the review-branch push and must be green before re-dispatch.
