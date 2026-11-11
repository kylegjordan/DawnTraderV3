# B-XSTOCK-SNAPSHOT-RETENTION — Step 4 code-review change list

## Dispatch header

**DECLARED CHANGE-CLASS:** `architecture`

**IMPLEMENTATION DIFF:** approved Step-2 boundary `891e867093e602e2192f8cb55885764446f200ac` through corrected implementation/refinement head `905dc4cb6f13517995158d25d0d6b99584df42b7`

**REVIEW BRANCH:** `origin/review/b-xstock-snapshot-retention-step4-codex` (the Discord dispatch names the exact review-ready head containing this packet)

**STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_XSTOCK_SNAPSHOT_RETENTION_PRE_AUDIT.md`

### Complete `architecture` document set

| Class document | Step-4 state | Disposition |
|---|---|---|
| Scope | **present** — `Claude Comms and Packages/Scope Files/B_XSTOCK_SNAPSHOT_RETENTION_SCOPE.md` | Approved at Step 1. |
| Pre-audit | **present** — `Claude Comms and Packages/Scope Files/B_XSTOCK_SNAPSHOT_RETENTION_PRE_AUDIT.md` | Approved at Step 2. |
| Completion report | **absent** | Required and deliberately outstanding until Step 11; absence is visible here, not waived. |
| `BATCH_CATALOG` | **absent** | Required; implementation truth is added at Step 10. |
| `PHASE_HISTORY` | **absent** | Required; implementation/deployment history is added at Step 10. |
| System Manual | **absent** | Required; the B75 snapshot lifecycle, proof/delete gate, restore contract, and operator path are added at Step 10. |
| System Impact Map | **absent** | Required; writer/reader/archive/rehydrate impacts are added at Step 10. |
| `CHANGES_AND_FIXES` | **absent — applicable** | The batch corrects unbounded snapshot accumulation and unsafe overlap-lock ownership; the entry is added at Step 10. |
| `RUNNING_ISSUES` | **present** — `1-system-manual/RUNNING_ISSUES.md` | Issue `#1194` is the agreed home. |
| Post-Audit Roadmap | **judged N/A** | This batch is already sequenced in the Sprint-to-Live Plan; it is not a post-audit roadmap item. |
| Deleted Components Log | **absent — applicable** | The timestamp/age-reclaim/unlink run-lock implementation was removed and must be recorded at Step 10. |
| Phase 19 Plan | **judged N/A** | The batch id is not `P19-*`; the checker's conditional requirement does not apply. |
| Adjustment Framework | **judged N/A** | No trading-behaviour, risk, scoring, strategy, regime, or calibration setting changes. |

Additional sequencing record: the Sprint-to-Live Plan already contains `B-XSTOCK-SNAPSHOT-RETENTION` at pre-sprint stage 3, item 6.

## One review gate

Review the Step-3 implementation against the approved scope and pre-audit. Return **APPROVED** or **SENT BACK** with exact findings. This is one code-diff gate; deployment, runtime proof, governance closeout, and completion-signoff are later workflow gates.

## What changed

The implementation adds a dedicated ranked-day snapshot lane inside the existing B75 lifecycle instead of creating a second archiver. It keeps 30 complete UTC days plus at least the newest 240 fifteen-minute rows and 60 sixty-minute rows per symbol, exports the complete 19-field row shape with microsecond timestamps, and binds the downloaded object to exact row count, ordered keys, full-row content, and compressed checksum before any removal is possible.

Deletion is one short, bounded transaction. It recomputes the frozen population while writers are excluded, compares the count and both digests, deletes only keys loaded from the proven download, marks the existing manifest active in the same statement, commits, and then proves those exact keys are absent. Mismatch, timeout, archive/readback failure, wrong database session, or config drift leaves the source rows hot.

The initial backlog is supervised through `--snapshot-only`; mutation is disabled by default in database configuration. Cron and manual entry now share one kernel-owned lock with no six-hour stale reclaim or unlink race. Historical readers either stay inside the governed hot horizon or require a proven rehydrated object and matching sidecar; the fixed B1a replay can no longer silently read a mutable, incomplete hot-era table.

## Change-set census

The corrected object reviewed is the complete `891e86709..905dc4cb6` diff: **28 files, 4,225 insertions, 164 deletions**. This includes the Step-3 implementation/boundary records, the earlier review packet, the five corrections below, and the complete rollback-column, cold-proof, interval-label, and live-prewarm proof added after Coltrane's split re-review rulings.

- Database contract: forward migration, rollback migration, and migration manifest.
- Lifecycle/prewarm: shared snapshot policy, legacy prewarm, xStock cache policy binding.
- B75 archive path: retention sweep, kernel-lock launcher, exact evidence, hot-horizon logic, exporter, rehydrate command, proven rehydrated-input loader, exact snapshot selector/proof/delete module.
- Historical readers: B1a replay, B3 regime audit, B31a gate audit, W20c provenance replay, W2a geometry sweep.
- Verification: real-PostgreSQL proof/delete mutation suite, B75 harness extensions, hot-horizon tests, process-level lock tests, and snapshot retention/refusal tests.

The only untracked workspace file is `.claude/launch.json`; it is unrelated, excluded, and untouched.

## Load-bearing diff snippets

### 1. NEW — one policy binds live caps to retention floors

```ts
export const XSTOCK_SNAPSHOT_POLICIES: readonly XstockSnapshotPolicy[] = [
  {
    intervalMinutes: 15,
    label: '15m',
    table: 'xstock_spot_ohlc_15m_snapshot',
    liveCapRows: 240,
    bucketSeconds: 900,
  },
  {
    intervalMinutes: 60,
    label: '60m',
    table: 'xstock_spot_ohlc_60m_snapshot',
    liveCapRows: 60,
    bucketSeconds: 3600,
  },
] as const;
```

```ts
export function assertSnapshotFloorCoversLiveCap(table: XstockSnapshotTable, keepFloorRows: number): void {
  const policy = XSTOCK_SNAPSHOT_POLICIES.find((candidate) => candidate.table === table);
  if (!policy) throw new Error(`unsupported xStock snapshot table: ${table}`);
  if (!Number.isInteger(keepFloorRows) || keepFloorRows < policy.liveCapRows) {
    throw new Error(
      `${table} keep-floor ${keepFloorRows} is below live cap ${policy.liveCapRows}; `
      + 'prewarm/retention refused before any write or delete',
    );
  }
}
```

### 2. MODIFIED — prewarm now validates exact lifecycle config before writes

BEFORE:

```ts
const MAX_BARS_60M = 60;
const MAX_BARS_15M = 240;

const SNAPSHOT_INTERVALS: SnapshotInterval[] = [
  {
    label: '60m', intervalMinutes: 60, bucketSeconds: 3600,
    maxBars: MAX_BARS_60M, table: 'xstock_spot_ohlc_60m_snapshot',
  },
  {
    label: '15m', intervalMinutes: 15, bucketSeconds: 900,
    maxBars: MAX_BARS_15M, table: 'xstock_spot_ohlc_15m_snapshot',
  },
];
```

AFTER:

```ts
const SNAPSHOT_INTERVALS: SnapshotInterval[] = [...XSTOCK_SNAPSHOT_POLICIES]
  .sort((a, b) => b.intervalMinutes - a.intervalMinutes)
  .map((policy) => ({
    label: policy.label,
    intervalMinutes: policy.intervalMinutes,
    bucketSeconds: policy.bucketSeconds,
    maxBars: policy.liveCapRows,
    table: policy.table,
  }));

export function assertPrewarmRowsWithinCap(rows: readonly LegacyBucketRow[], maxBars: number): void {
  if (!Number.isInteger(maxBars) || maxBars <= 0 || rows.length > maxBars) {
    throw new Error(`[B-NEW-34b] prewarm selected ${rows.length} rows above live cap ${maxBars}; write refused`);
  }
  let previous = -Infinity;
  for (const row of rows) {
    const bucket = new Date(row.bucket_ts).getTime();
    if (!Number.isFinite(bucket) || bucket <= previous) {
      throw new Error('[B-NEW-34b] prewarm rows are not unique and ascending; write refused');
    }
    previous = bucket;
  }
}
```

Before the symbol loop, the writer now reads the exact wildcard lifecycle rows, rejects narrower contradictory rows, parses both floors/horizons and the mutation switch, and calls `assertPrewarmRowsWithinCap` before every upsert.

### 3. NEW — count/key/content proof gates exact proven-key deletion

```ts
return `WITH current_rows AS MATERIALIZED (
    ${currentPopulation}
  ), current_proof AS (
    SELECT count(*)::bigint AS row_count,
           encode(digest(COALESCE(string_agg(
             int4send(octet_length(convert_to(symbol, 'UTF8'))) || convert_to(symbol, 'UTF8') ||
             int4send(octet_length(convert_to(bucket_ts_text, 'UTF8'))) || convert_to(bucket_ts_text, 'UTF8'),
             ''::bytea ORDER BY symbol, bucket_ts
           ), ''::bytea), 'sha256'), 'hex') AS ordered_key_sha256,
           encode(digest(COALESCE(string_agg(
             convert_to(canonical_json || E'\\n', 'UTF8'),
             ''::bytea ORDER BY symbol, bucket_ts
           ), ''::bytea), 'sha256'), 'hex') AS full_row_sha256
      FROM current_rows
```

```ts
  ), deleted AS (
    DELETE FROM ${source} target
     USING ${proven} proven, proof_gate gate
     WHERE gate.matches
       AND target.symbol = proven.symbol
       AND target.bucket_ts = proven.bucket_ts
     RETURNING target.symbol, target.bucket_ts
  ), delete_count AS (
    SELECT count(*)::bigint AS row_count FROM deleted
  ), marked AS (
    UPDATE data_archive_manifest manifest
       SET state = 'active', hot_partition_dropped_at = NOW()
      FROM proof_gate gate, delete_count removed
     WHERE manifest.id = $8
       AND manifest.state = 'verified'
       AND manifest.completeness_basis = 'source-count-matched'
       AND gate.matches
       AND removed.row_count = $5::bigint
```

### 4. MODIFIED — the final gate is bounded and post-commit checked

BEFORE: the B75 plain-table lane deleted newly re-evaluated age ranges in batches and had no ranked snapshot proof/delete transaction.

AFTER:

```ts
await client.query('BEGIN');
try {
  await client.query("SET LOCAL lock_timeout = '1s'");
  await client.query("SET LOCAL statement_timeout = '5s'");
  const lockStartedAt = Date.now();
  await client.query(`LOCK TABLE ${quoteIdent(selector.table)} IN SHARE MODE`);
  lockWaitDurationMs = Date.now() - lockStartedAt;
  const result = await client.query(
    snapshotLockedDeleteSql(selector),
    snapshotLockedDeleteParams(selector, archived.proof, archived.manifestId),
  );
```

```ts
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
}
const remaining = Number((await client.query(
  snapshotProvenKeyAbsenceSql(selector.table),
)).rows[0]?.remaining_rows ?? -1);
if (remaining !== 0) {
  throw new ArchiveReadbackMismatchError(
    `[B75 sweep][snapshot] ${selector.table}/${archived.partitionLabel}: ${remaining} proven key(s) remain after commit`,
  );
}
```

### 5. DELETED / NEW — unsafe stale-file ownership is replaced by a kernel-held lock

BEFORE:

```ts
const SWEEP_LOCK_STALE_MS = 6 * 60 * 60 * 1000;

const fd = fs.openSync(
  SWEEP_LOCK_FILE,
  fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
  0o644,
);

const ageMs = Date.now() - fs.statSync(SWEEP_LOCK_FILE).mtimeMs;
if (ageMs > SWEEP_LOCK_STALE_MS) {
  fs.unlinkSync(SWEEP_LOCK_FILE);
  continue;
}
```

AFTER:

```sh
LOCK_FILE=${B75_SWEEP_LOCK_FILE:-/tmp/b75-retention-sweep.lock}

exec 9>>"$LOCK_FILE"
if ! /usr/bin/flock -n 9; then
  echo "[B75 sweep] another run still holds the kernel lock — skipping this invocation"
  exit 0
fi

export B75_SWEEP_LOCK_HELD=1
cd "$ROOT_DIR"
exec /usr/bin/npx tsx server/scripts/b75-retention-sweep.ts "$@"
```

Process tests cover an aged-but-live holder, crash release, successor ownership, and cron/manual contention on the same inode.

### 6. MODIFIED — fixed historical replay requires proven rehydrated input

BEFORE:

```ts
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const symbols = await fetchAllSymbols(client);
for (const symbol of symbols) {
  const n = await replayOneSymbol(client, symbol, regimeConfig, out, agg);
  totalWritten += n;
}
```

AFTER:

```ts
if (B1A_REHYDRATED_INPUT) {
  const loaded = await loadProvenRehydratedSnapshot(B1A_REHYDRATED_INPUT, SNAPSHOT_TABLE);
  rehydrated = new Map();
  const rehydratedFromMs = Date.parse(REPLAY_START) - 60 * 60 * 60_000;
  const rehydratedToMs = Date.parse(REPLAY_END);
  for (const row of loaded.rows) {
    const bucketMs = Date.parse(row.bucket_ts);
    if (bucketMs < rehydratedFromMs || bucketMs >= rehydratedToMs) continue;
    const bars = rehydrated.get(row.symbol) ?? [];
    bars.push({
      bucket_ts: row.bucket_ts,
      open: String(row.open), high: String(row.high), low: String(row.low),
      close: String(row.close), volume: String(row.volume),
    });
    rehydrated.set(row.symbol, bars);
  }
}
```

```ts
} else {
  const horizonRows = (await client.query(HOT_HORIZON_SQL)).rows as Array<{ constant_name: string; value: unknown }>;
  const era = decideEraWithWarmup(
    new Date(REPLAY_START).toISOString(),
    60 * 60 * 60_000,
    [SNAPSHOT_TABLE],
    parseHorizonRows(horizonRows),
    Date.now(),
  );
  if (!era.ok) {
    throw new Error(`[B1A] fixed historical replay requires proven rehydrated snapshot input. ${era.message} `
      + 'Set B1A_REHYDRATED_SNAPSHOT_PATH to that downloaded file or directory.');
  }
  throw new Error('[B1A] fixed historical replay may not read the mutable hot snapshot table; set B1A_REHYDRATED_SNAPSHOT_PATH.');
}
```

The loader independently verifies the table identity, proven/checksum flags, cursor contract, row count, ordered-key digest, full-row digest, and duplicate-key absence against each downloaded object and sidecar. It also requires the atomic run index described below, so a valid individual object can no longer stand in for a partial replay request.

## Coltrane sent-back findings and corrections

Coltrane returned five blocking findings against the first Step-4 ref. All five are accepted and corrected; the split re-review then required complete rollback-column proof, an end-to-end cold-proof handoff, an independently derived interval-label set, and live-path prewarm writer spies. Those final proof corrections are `a68c9f037`, `8cf03a9f8`, `852f5212f`, `205c21085`, and the SQL-projection-derived cold proof `905dc4cb6`; this section is part of the stateless re-review context.

### C1 — preserve every pre-existing evidence cursor contract

Both the forward and rollback migrations retain `disk-file-lines-v1` when rebuilding the evidence constraint. The real-PostgreSQL suite seeds disk-file evidence, applies the forward migration and rollback, proves the seeded row remains valid, inserts a second disk-file row after rollback, and now asserts that all nine selector-only columns were removed only after the zero-snapshot-proof rollback arm. This closes Coltrane's split-review finding that the first test asserted only three of those nine columns.

```sql
CHECK (cursor_contract IN (
  'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid',
  'text-ts-tiegroup-v1',
  'disk-file-lines-v1',
  'xstock-snapshot-jsonb-v1:symbol+bucket_ts'
));
```

### C2 — carry immutable snapshot proof across warm-to-cold rotation

Warm-to-cold manifest creation, exact proof copy, exact proof comparison, and warm-state transition now share one database transaction. A `source-count-matched` warm object cannot be marked migrated or deleted unless the active cold manifest has an exact copy of all equality, selector, cutoff, floor, day, key-digest, and full-row-digest fields. The executable test derives its persisted cold proof from the production copy statement's actual target/source projection, requires every production comparison predicate, restores that resulting active cold object, writes the run index, and loads it through the historical-reader proof gate. Omitting a field from the production projection or comparison now turns the test red; a separate corrupted-field arm still proves rollback before migration or warm deletion.

```ts
await ctlClient.query('BEGIN');
// create/refresh the cold manifest, copy append-only evidence, and compare every field
if (proof.rows[0]?.exact !== true) {
  throw new Error('[B75 rotator] proven warm object has no exact proof for its cold manifest');
}
await ctlClient.query(`UPDATE data_archive_manifest SET state = 'migrated' WHERE id = $1`, [candidate.id]);
await ctlClient.query('COMMIT');
// Warm storage deletion remains after the committed database transition.
```

### C3 — bind historical replay to the whole requested rehydrate run

The rehydrate command removes any stale prior index before work and derives the interval's expected label set independently from the append-only exact-evidence ledger, not from the downloadable manifest result. It atomically writes a version-2 run index after all selected labels finish; `complete=true` now requires the independently proven label set to match the selected set exactly and every selected object to be downloaded and proven, with zero skipped, cold-skipped, mismatch, missing, or unproven objects. The historical loader requires that index, rechecks the expected-versus-downloaded label sets, verifies its requested interval covers B1a's 60-hour warmup plus fixed replay window, and reads exactly the indexed files. One red arm omits an indexed file; the new mutation returns two independently proven interval labels but only one manifest result and requires the run to remain incomplete.

```ts
const complete = labelCoverageMatches
  && results.length === choices.length
  && expectedLabels.length > 0
  && results.every((result) => result.kind === 'downloaded' && result.basisProven === true);

const loaded = await loadProvenRehydratedSnapshot(input, SNAPSHOT_TABLE, {
  from: new Date(rehydratedFromMs),
  toExclusive: new Date(rehydratedToMs),
});
```

### C4 — record each export's actual repeatable-read observation time

The exporter now establishes its repeatable-read snapshot and captures its time together, returns that time with the proof, and the archive evidence stores it instead of the earlier table-loop timestamp. The export stays read-only: an independent population count and a forward-only database cursor read the same repeatable-read snapshot, avoiding a temporary-table write inside the read-only transaction. The real-PostgreSQL writer-between-discovery-and-export test first observes two eligible rows, commits a third eligible row from another session, then requires the export snapshot to contain three rows and carry its own later observation time.

```ts
const observation = await client.query(
  'SELECT clock_timestamp() AS observed_at, txid_current_snapshot()::text AS snapshot_id',
);
snapshotObservedAt = new Date(observation.rows[0].observed_at);
```

### C5 — share the lifecycle/floor refusal across both prewarm writers

The exact wildcard/narrow-row lifecycle check is now one shared guard. The legacy and revision-aware prewarm paths both call it before any aggregate preview or snapshot write. The executable red test now runs both writers in live mode with injected legacy-aggregate, legacy-upsert, and revision-aware-prewarm spies: a 239-row floor for the 240-row live cap requires rejection with all three spies untouched. Its positive-control arm restores the 240-row floor and requires two interval calls through each writer path, proving the zero-call refusal is discriminating rather than a dry-run bypass.

```ts
const lifecycleClient = options.lifecycleClient ?? (await import('../server/db.js')).pool;
await validateSnapshotLifecycleForPrewarm(lifecycleClient);
// availability preview/cache imports and writes occur only after this guard
```

### 7. NEW — real PostgreSQL red mutations execute the shipped gate

```ts
it('refuses same-count key replacement, content replacement and recent floor displacement before deletion', async () => {
  const mutations = [
    async () => {
      await client.query("DELETE FROM xstock_spot_ohlc_15m_snapshot WHERE bucket_ts = '2025-01-01T00:00:00Z'");
      await client.query(`INSERT INTO xstock_spot_ohlc_15m_snapshot
        (symbol, bucket_ts, open, high, low, close, volume, source_bar_count, captured_at)
        VALUES ('B-XSSR/USD', '2025-01-01T00:02:00Z', 1, 1, 1, 1, 1, 1, '2025-02-02T00:00:00Z')`);
    },
    async () => {
      await client.query("UPDATE xstock_spot_ohlc_15m_snapshot SET close = close + 1 WHERE bucket_ts = '2025-01-01T00:00:00Z'");
    },
```

For each mutation the test requires `proof_matches=false`, zero deleted rows, zero manifest rows advanced, and a still-verified manifest. Separate cases prove the positive delete, wrong-session temp-table refusal, and the shipped append-only evidence guard's DELETE/TRUNCATE refusal.

## Refusal and safety coverage

- Missing, narrow-scope, non-numeric, non-positive, below-live-cap, or contradictory lifecycle configuration refuses before archive/delete; prewarm refuses before write.
- Cutoff/floor/day drift, same-count key replacement, same-key content replacement, recent rank displacement, wrong-session proven-key table, malformed/truncated/extra/out-of-order download, sidecar mismatch, checksum/count/key/content mismatch, unproven or closed-out copy, and early archive/readback failure cannot reach deletion.
- Snapshot cleanup names only the two snapshot tables; append-only revision, aggregate, window-manifest, decision, refresh-attempt, certificate, and exact-evidence tables remain outside the delete path.
- Vacuum/analyze runs zero times for an unchanged table and once after the full changed-table object loop; it is not represented as operating-system disk return.
- Mutation remains disabled by default. Step 6 will deploy code/config with deletion off; Step 7 starts with a dry read before any supervised mutation.

## Verification at the implementation ref

- After rebasing cleanly onto current `origin/migration/aws-supabase`, CI run `43055149049` is tied to exact correction head `905dc4cb6f13517995158d25d0d6b99584df42b7` and passed all four jobs: TypeScript Check, Test Suite, Build, Docker Build. Its full Vitest population was 429/429 test files and 5,543/5,543 tests passed; all six real-PostgreSQL snapshot-retention cases passed, including the complete nine-column rollback assertion.
- The current focused snapshot-retention population was 27/27 tests passed, including the independently proven interval-label omission and live-path prewarm writer-spy mutations. The six real-PostgreSQL cases were skipped locally because no local database was configured, then all six passed in CI.
- Those six database cases cover positive atomic delete; three proof-changing mutations; wrong-session proven-key refusal; append-only evidence DELETE/TRUNCATE refusal; writer-between-discovery-and-export snapshot timing; and disk-file cursor preservation through the forward migration and rollback.
- TypeScript baseline remained 324 current findings against 324 expected findings, with no new regression.

## Judgement calls to attack

1. Whether the SHARE table lock plus one-second lock timeout and five-second statement timeout is sufficient to freeze every relevant writer without an unbounded production stall.
2. Whether the exporter/download digest framing is exactly equivalent to the locked PostgreSQL recomputation, including microseconds, nulls, numerics, Unicode symbols, ordering, and empty populations.
3. Whether day + ordered-key-digest labels and existing-copy reuse make progress for new keys without allowing same-key changed content or a closed-out label to be silently reused.
4. Whether refusing over-wide/misordered prewarm results before write preserves every operational lifecycle path, including manual lookback.
5. Whether every historical reader is correctly classified and the fixed B1a replay is right to require proven rehydrated input even when a hot-table query could still return some rows.
6. Whether mutation-disabled deployment, supervised `--snapshot-only`, rollback, and config defaults make the destructive path impossible to enter accidentally.
7. Whether exact-evidence immutability and the table census truly keep all xStock availability/provenance records outside the cleanup blast radius.
8. Whether the one-vacuum-per-changed-table rule and the no-physical-shrink claim are operationally honest.
9. Whether the single launcher and inherited kernel lock really cover cron, manual invocation, long runs, crashes, and successor ownership without an alternate direct entry.

## Fresh-reader record

**NOT RE-READ:** The host instruction for this Codex task prohibits spawning subagents unless the user explicitly asks for delegation. Therefore the mechanism and absence claims above were re-derived by the owner at the pushed ref but were not routed through the workflow skill's fresh-context reader. Coltrane is the independent review boundary; no omitted fresh-reader pass is represented as supporting evidence.

## Known limits at this gate

- The implementation has not been deployed to staging and has not mutated staging data. Those are Steps 6 and 7, after review and fresh CI.
- UI verification is not applicable to this server-side lifecycle path; runtime, database, archive, restore, log, and alert evidence are the verification surfaces.
- Governance closeout documents listed as absent above remain owed at Steps 10–11 and are not waived by code approval.
