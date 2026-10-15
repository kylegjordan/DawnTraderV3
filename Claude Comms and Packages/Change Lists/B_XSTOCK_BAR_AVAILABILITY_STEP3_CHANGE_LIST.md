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

#### MODIFIED — activation boundary (before / after)

```sql
-- BEFORE: observed activation without joining its serialization boundary
SELECT g.contract_active INTO contract_active
  FROM xstock_bar_clock_guard g WHERE g.singleton = true;

-- AFTER: every admitted legacy write holds a conflicting lock until commit
SELECT g.contract_active INTO contract_active
  FROM xstock_bar_clock_guard g WHERE g.singleton = true FOR SHARE;
```

#### MODIFIED — clock observation and sequence domain (before / after)

```sql
-- BEFORE: sampled while waiting; reads used an unrelated counter
observed_at := clock_timestamp();
SELECT last_observed_at INTO prior_clock
  FROM xstock_bar_clock_guard WHERE singleton = true FOR UPDATE;
observed_seq := nextval('xstock_bar_read_observed_seq');

-- AFTER: sample follows the lock; reads and certificates share causal order
SELECT last_observed_at INTO prior_clock
  FROM xstock_bar_clock_guard WHERE singleton = true FOR UPDATE;
observed_at := clock_timestamp();
observed_seq := nextval('xstock_bar_visible_seq');
```

#### MODIFIED — snapshot winner validation (before / after)

```ts
// BEFORE: persisted evidence was checked only against its aggregate row
&& row.persisted_contract_version === XSTOCK_BAR_AVAILABILITY_CONTRACT;

// AFTER: every named source revision must still be a current compact winner
&& row.persisted_contract_version === XSTOCK_BAR_AVAILABILITY_CONTRACT
&& Number(row.current_source_revision_count) === row.source_revision_ids.length;
```

#### MODIFIED — manifest order (before / after)

```ts
// BEFORE: caller order was silently normalized
const ordered = [...bars].sort((a, b) => a.timestamp - b.timestamp);

// AFTER: caller order is retained and reversal/duplication is refused
const ordered = [...bars];
if (index > 0 && bar.timestamp <= ordered[index - 1].timestamp) {
  throw new Error('[B-XSTOCK-BAR-AVAILABILITY] manifest window is not strictly ordered');
}
```

Local closeout at code ref `12c0b7134`: 5 focused files passed; 24 tests passed and 4 migration-backed two-connection/database legs skipped because the isolated PostgreSQL test database is unavailable locally. The TypeScript check reported 337 current errors over the whole project against the 337-error baseline, with no regression. Exact-ref four-job CI is pending the review-branch push and must be green before re-dispatch.

## Step 7 — staging first-pass verification of additive capture

- `dt-deploy` deployed shared head `183deb6ef1bd41ee7a05e4ab326e02c8fc480291` at `2026-10-15T03:34:31Z`, applied both availability migrations, asserted the running identity, and recorded ENGINE RESUMED. The authenticated liveness read at `2026-10-15T03:40:02Z` returned HTTP 200 with that exact build SHA and `engineExpected=true`, `engineRunning=true`.
- The fixed repeatable-read database window was `2026-10-15T03:34:31Z` through `2026-10-15T03:40:52.240710Z`. Over that population, `xstock_bar_revision_event` contained 2,101 retained post-buffer revision events across 467 distinct xStock symbols: 2,101 applied projection winners, 2,101 complete healthy certificates, zero pending certificates, zero rejected older-arrival attempts, and one writer boot. Certificate lag from event creation to the later primary observation was 75.601 ms minimum, 111.046 ms median, 1,150.112 ms p95, and 3,073.940 ms maximum over those 2,101 certified events.
- Every one of the 2,101 revision IDs and 2,101 shared causal sequence values was distinct; zero sequence values were invalid and zero certificates preceded event creation. The latest event for each of 1,068 observed symbol-minute keys matched the compact projection's exact winner revision, payload hash, and generation; zero keys lacked winner identity and zero mismatched.
- The same bounded log window contained 76 successful xStock writer flush lines. Its last cumulative line reported 3,581 accepted input frames minus 1,480 buffer-superseded frames = 2,101 projection attempts, exactly matching the database population; it also reported 2,101 certified attempts and zero pending repairs. The error stream contained 1,923 known-positive `XS_FRAME` lines in the same window and zero `[B-XSTOCK-BAR-AVAILABILITY]` failure lines, so the absence check processed a demonstrably live stream.
- Capture storage occupied 2,240 kB across 15 leaf partitions at the fixed cutoff. This is an initial six-minute observation only, not the eight-day capacity verdict.
- The phase boundary remained intact: aggregate revisions = 0, window manifests = 0, exact-provenance 15-minute snapshots = 0 of 2,243,236 snapshot rows, and exact-provenance 60-minute snapshots = 0 of 582,906 snapshot rows. At the deployed ref, the scanner still calls the legacy 15-minute cache reader and the RTB refresh still reaches the legacy 60-minute reader; the availability-aware aggregate, manifest, decision-window, and prewarm entry points remain separate.
- **Limits:** this successful live population did not exercise an older-arrival rejection or a certificate-failure/repair cycle, so neither is represented as live-proven here; their migration-backed fault tests remain the evidence for those arms. The retained-event certificate result also does not claim that every upstream feed frame reached the post-buffer revision writer. Phase one deliberately has no user-visible availability surface; under the Codex browser rule, **UI not yet checked**.
- **REVIEWER: claim-only · name the objects that would settle successful additive capture plus dormant consumers, then identify other consistent worlds · HIT: bounded the certificate claim to all retained events at the observation instant, separated code proof of the two-transaction boundary from timestamp evidence, and identified the unexercised rejection/repair arms plus the UI gap · re-derived yes.** The fixed database/log population, deployed caller census, and explicit limits above incorporate those qualifications; the reader's later independent live read also reproduced complete retained-event certification and dormant aggregate/manifest storage, but that clean result is not cited as evidence.

## Step 8 — Coltrane independent staging verification

- Evidence ref `2cb0ba9f25edfe7838d7ce0b076cebabbb9c7925` passed Test Suite, TypeScript Check, Build, and Docker Build individually in CI run `38678256607`. The deployed runtime remained `183deb6ef1bd41ee7a05e4ab326e02c8fc480291`.
- The initial Step-8 read correctly refused to proceed because the Codex failover setup had not given Coltrane a staging SSH path. A dedicated Coltrane key was installed at the same `deploy`-user boundary and Helsinki source-IP restriction as Langston's existing reviewed staging path. Running the supplied verification as operating-system user `coltrane` then proved direct database and both-log-stream reachability without copying evidence through the implementer.
- Coltrane's independent repeatable-read observation contained 8,140 retained post-buffer revision events across 467 symbols: 8,140 applied and certified, zero rejected, zero pending, 8,140 distinct revision IDs and sequences, and 2,948 of 2,948 latest symbol-minute winner identities exact. He observed zero aggregate revisions, zero manifests, zero exact-provenance snapshots, all 69 trigger instances normally enabled, and 6,624 kB across 15 revision partitions.
- He independently re-derived the original fixed `2026-10-15T03:34:31Z` through `2026-10-15T03:40:52.240710Z` reconciliation: 76 writer lines ended at 3,581 accepted input frames minus 1,480 buffer-superseded frames = 2,101 projection attempts, exactly matching 2,101 retained/applied/certified database events and zero pending certificates. The same fixed error-log window returned 1,923 `XS_FRAME` positive-control lines and zero batch failure lines.
- The exact deployed object still routes scanner 15-minute and RTB 60-minute reads through the legacy readers, while availability prewarm/readers have no external production caller. Coltrane returned `VERIFIED` strictly for P14 phase-one additive capture. Older-arrival rejection and certificate repair remain migration-backed-test evidence rather than live-proven evidence; dual-read and enforcement remain gated on the full eight-day/five-session capacity and quality population.

## Step 9 increment 4 — durable observation population and exact archive proof

- Added append-only admission and completion evidence for every logical xStock projection flush. Admission commits the running build identity before projection; completion commits atomically with the immutable revision events and stores their exact identities. The same flush identity and snapshot are reused after transient or ambiguous failures, while a permanent projection failure remains visible as an orphan admission that fails the gate.
- Changed the xStock writer from chunked projection transactions to one logical JSONB projection transaction, so accepted frames minus buffer supersession must equal one exact revision population. The generic archive classes retain their existing chunking and bounded-retry behavior.
- Closed the retry-buffer coverage hole by refusing further xStock OHLC intake at the 50,000-frame bound without shedding any accepted row. The OHLC lane remains stopped until restart, the ticker lane stays live for active exits, and a critical alert plus the observation continuity check prevent the interrupted window from passing.
- Added a read-only capacity/quality gate anchored at `2026-10-16T00:05:00Z`. It grades whole logical flushes by their durable admission boundary, reads their events only through completion links, and rejects orphan, mismatched, missing-link, unlinked-event, or wrong-contract populations. It records every contributing build, grades eight complete UTC days, five complete venue sessions, at least 100,000 projection attempts and 400 symbols, checks certificate health and governed constants, measures all capacity terms at the final graded ref, and requires the preceding partition's verified archive/readback/drop proof.
- Added an xStock-only exact B75 export mode using native `(arrived_at, revision_id)` pagination on a matching index, database-rendered JSON to retain microseconds, a source count in the same snapshot, and downloaded JSONL line-count equality before manifest verification or source deletion. Aggregate, manifest, and flush-evidence stores are not registered for deletion by this increment.
- Added the observation migration and evidence-preserving rollback, registered the revision-ledger retention constant at eight days and the venue-session global gap ceiling at 60 seconds, and recorded the separate generic B75 timestamp-tie defect as `#1195` / `B-B75-EXPORT-COMPLETENESS` rather than claiming this localized mode fixes unrelated archive tables.
- Review correction: admission and completion now retain the SHA-256 hash of the ordered JSONB population and both phases reject a same-ID/same-count retry whose rows differ. The gate now requires exactly one writer boot and requires every contributing writer/archive build to equal the exact 40-character reviewed ref, so any restart or deploy resets the window rather than hiding a possible in-memory handoff loss. Exact archive verification now lands an append-only proof row containing source, exported, and downloaded counts, cursor contract, object checksum, and producing build before the mutable manifest may advance; the final gate reads that durable row after hot deletion. Added mutations for changed retry payloads before and after completion, unreviewed builds, a second boot, and corrupted downloaded line counts.

### Increment-4 local verification before review push

- Eight availability-focused files passed: 38 tests passed and 6 database-gated tests skipped locally.
- Six shared-writer and xStock-feed regression files passed: 105 tests passed and 5 database-gated tests skipped locally.
- `node scripts/check-tsc-baseline.mjs` reported 335 current errors against 337 baseline errors, with zero regressions; the two removed diagnostics are the now-explicit exact-export cursor types.
- `git diff --check` passed. Migration-backed admission/completion idempotence, append-only guards, and the live archive proof remain CI/staging obligations and are not represented as locally passed.

## Step 9 increment 4 — review, promotion, deployment, and observation start

- Coltrane reviewed exact ref `6dadbb6143a8eb58d07bd05cbcf29baf28e09f57`. His first pass found three false-green states: retry identity was not population-bound, contributing builds/restarts did not gate the verdict, and exact archive equality was not durably retained after hot deletion. The corrected ref stores and compares the ordered-population hash, requires one writer boot plus exact reviewed writer/archive builds, and persists append-only source/export/download equality with cursor, checksum, and producing build before manifest verification. Coltrane returned `APPROVED` after re-reading that unchanged ref.
- Review-branch CI run `38686350447` passed Test Suite, TypeScript Check, Build, and Docker Build individually. The exact same commit was then promoted to `migration/aws-supabase`; shared-branch CI run `38687037442` again passed all four jobs individually.
- `dt-deploy` deployed the exact reviewed ref at `2026-10-15T05:32:11Z`, applied `2026-10-15-b-xstock-bar-availability-observation.sql`, asserted the running build identity, and recorded ENGINE RESUMED. The deployed `dist/BUILD_SHA`, repository HEAD, and deploy record all equal the reviewed ref.
- The first clean post-deploy read covered 29 admissions and 29 completions: 1,201 accepted frames minus 363 buffer-superseded frames equalled 838 projection attempts and 838 linked revision events across 467 symbols. It found one writer boot, only the reviewed build, zero orphan admissions, zero population-hash mismatches, zero missing links, zero unlinked events, zero pending or unhealthy certificates, all three evidence tables, `pgcrypto`, and all six append-only guards.
- The post-deploy log read processed 221,418 timestamped lines from the two live streams beginning at the deploy record. It found 879 `XS_FRAME` positive controls, 1,351 ticker positive controls, and zero batch failure lines. Phase two has no user-facing surface, so no UI claim is made.
- An immediate dry run of the final gate correctly matched the deployed build and governed constants, passed the current identity/link/certificate/capacity checks, and remained red on the intentionally unavailable time, session, population, single-window writer, archive, and positive-control requirements because the pre-registered window had not started. It is not represented as a capacity verdict.
- The graded window starts at `2026-10-16T00:05:00Z`. Event-wait alert `3c8db17f-5761-4fd1-91c8-452855a9487f` is scheduled for `2026-10-25T00:15:00Z`, before the `02:15Z` retention sweep, with the exact closing and reset conditions. It remains unacknowledged while waiting. The delivery-board card stays in Verification, with Review Approved and Blocked on External.

## Step 9 increment 5 — deploy-safe observation handoff

- Kyle rejected the operational consequence of the single-writer-boot criterion: an eight-day observation may not freeze every other reviewed deployment. The observation still requires the full time, session, population, capacity, and archive evidence, but normal reviewed deploys may now cross it through a durable handoff.
- Added append-only writer boot-start and handoff evidence. The outgoing process stops new xStock OHLC intake, closes the feed, drains every accepted frame, verifies zero remaining or in-flight work, reconciles its process counters to the durable admission/completion/revision population, and records the exact clean state. The incoming process records one boot start linked to its immediate predecessor.
- Moved the archive drain into the shutdown owner that actually exits the process. The second signal listener still stops VTS, but can no longer race the archive drain and let an unfinished handoff be killed by the exiting listener.
- Changed the final gate from one boot/one ref to an explicit set of independently reviewed refs plus a complete boot/handoff chain. Every contributing writer, boot, and archive build must be reviewed; every completed boot must have one exact reconciled handoff; the chain must not branch or skip; and the newest open boot must equal the final graded ref.
- Added mutation coverage for duplicate boot identity, a missing handoff, a broken predecessor link, a counter mismatch, a closed newest boot, a wrong newest build, and unreviewed writer, boot, or archive builds. A two-build clean-handoff case is the positive control.

### Increment-5 local verification before review push

- Eleven availability and shared-writer regression files passed: 71 tests passed and 8 database-backed tests skipped because the isolated PostgreSQL test database is unavailable locally. The shutdown fence explicitly proves that a ticker-drain failure does not skip the xStock handoff, while a handoff-persistence failure fails shutdown instead of recording a false clean boundary.
- The TypeScript baseline gate reported 335 current project diagnostics against the 337-diagnostic baseline, with zero regressions. The two below-baseline diagnostics are the already-reviewed exact-export type corrections, so the baseline was not changed.
- The production build passed. Migration-backed handoff behavior, four-job CI, Coltrane review, deployment, and a real old-process/new-process handoff remain required before this increment is complete.

## Step 9 increment 6 — boundary anchor and complete capacity accounting

- Corrected the boot-chain anchor to begin with the writer that was active at the exact observation-window boundary, not the first writer that later admitted a flush. The gate now fails if no writer was active at that boundary, and a boundary-active writer that dies before its first admission is still included and must supply a clean handoff.
- Added a database-backed mutation for the former false green: boot A is active at the boundary, dies without a handoff or admission, boot B links to A within the window and supplies the durable population. The production gate query now returns two starts, one required handoff, and zero clean handoffs for that case.
- Added both deploy-continuity tables to the exact capacity relation set. Their heaps, primary-key indexes, predecessor/time indexes, and any future indexes discovered through the same relation set now contribute to both the full non-revision store total and the new-index total.
- The focused unit and integration files pass locally: 8 tests passed and 9 database-backed tests skipped because the isolated PostgreSQL test database is unavailable locally. The TypeScript baseline gate remains green at 335 current diagnostics against the 337-diagnostic baseline, with no regressions; CI must execute the new database-backed mutation before re-review.
