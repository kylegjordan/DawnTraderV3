# B-XSTOCK-SNAPSHOT-RETENTION — Step 8 independent verification pack

**Owner:** ANALYST Codex (`codex-c`)
**Reviewer:** Coltrane
**Step 7 evidence ref:** `c69e60e11cc52eadfdd0081fefe6ffc66c79a7ad`
**Deployed code ref:** `fbbe0b5e4af86be3a87fa0d6c2362f3e7bc899e4`
**Primary evidence:** `B_XSTOCK_SNAPSHOT_RETENTION_STEP7_CORRECTION.md`

## Verdict requested

Independently re-derive whether Step 7 may PROCEED to Step 9. A pass requires all of the following:

1. The deployed code/build stamp is the reviewed `fbbe0b5e4…` correction.
2. The complete pre-registered populations were archived with exact evidence before deletion: 2,163,663 15-minute rows in 100 objects and 573,523 60-minute rows in 111 objects.
3. The same frozen selector now finds zero remaining eligible rows in both live tables, while current live symbols and post-apply writer rows provide positive controls.
4. The registered next retention run completed with zero objects, zero deletes, and zero failures.
5. The mutation switch is enabled for steady state, and the availability window anchor plus its open event-wait alerts were not acknowledged or resolved by this batch.
6. The one-second lock-acquisition and five-second locked-statement safeguards remained unchanged; contention deferred an object rather than authorizing an unproved delete.

UI is N/A: this batch has no UI surface and no UI consumer reads the snapshot/archive control tables.

## Reachable staging objects

All log files are readable by the staging `deploy` account:

```text
/home/deploy/b75-step7-dry-5b83e648b-20261111T1837Z.log
/home/deploy/b75-step7-apply-5b83e648b-20261111T1907Z.log
/home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1927Z.log
/home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1935Z.log
/home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1939Z.log
/home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1943Z.log
/home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1947Z.log
/home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1950Z.log
/home/deploy/b75-step7-postwriter-fbbe0b5e4-20261111T1949Z.log
```

The old-code apply is included because it contains the first 138,501 successful 60-minute deletions. The corrected invocations contain the remaining 60-minute population and the whole 15-minute population.

## Exact reproduction commands

### 1. Deployed ref and terminal run records

```bash
cd /home/deploy/dawntrader
git rev-parse HEAD
cat dist/BUILD_SHA

for f in \
  /home/deploy/b75-step7-apply-5b83e648b-20261111T1907Z.log \
  /home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1927Z.log \
  /home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1935Z.log \
  /home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1939Z.log \
  /home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1943Z.log \
  /home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1947Z.log \
  /home/deploy/b75-step7-apply-fbbe0b5e4-20261111T1950Z.log \
  /home/deploy/b75-step7-postwriter-fbbe0b5e4-20261111T1949Z.log
do
  echo "FILE=$f"
  grep -E 'run_id=|vacuum_count=|snapshot_deleted=|snapshot_failed=' "$f" | tail -n 12
done
```

Expected deletion totals from the table-terminal records:

```text
15m = 231556 + 447677 + 431930 + 434855 + 251951 + 365694 = 2163663
60m = 138501 + 435022 = 573523
```

The final apply record must be run `be8fdd16-0ed3-4417-ae39-060c459ff0c0`, `snapshot_failed=0`. The post-writer record must be run `793f45b9-eaef-494d-98a1-a92130701686`, `snapshot_deleted=0 snapshot_failed=0`.

### 2. Current exact selector, manifest/evidence, writer, switch, and anchor read

Run from `/home/deploy/dawntrader` after loading `.env`; this is read-only:

```bash
cd /home/deploy/dawntrader
set -a
. ./.env
set +a
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1
```

Paste this complete statement set into that `psql` session:

```sql
WITH symbols AS MATERIALIZED (
  SELECT DISTINCT symbol FROM xstock_spot_ohlc_15m_snapshot
), floor_boundary AS MATERIALIZED (
  SELECT symbols.symbol, boundary.oldest_kept_bucket
  FROM symbols
  CROSS JOIN LATERAL (
    SELECT min(bucket_ts) AS oldest_kept_bucket
    FROM (
      SELECT bucket_ts
      FROM xstock_spot_ohlc_15m_snapshot f
      WHERE f.symbol = symbols.symbol
      ORDER BY bucket_ts DESC
      LIMIT 240
    ) retained
  ) boundary
)
SELECT 'eligible15' AS population,
       count(*)::bigint AS rows,
       count(DISTINCT s.symbol)::bigint AS symbols
FROM xstock_spot_ohlc_15m_snapshot s
JOIN floor_boundary f USING (symbol)
WHERE s.bucket_ts < '2026-10-12T00:00:00Z'
  AND s.bucket_ts < f.oldest_kept_bucket;

WITH symbols AS MATERIALIZED (
  SELECT DISTINCT symbol FROM xstock_spot_ohlc_60m_snapshot
), floor_boundary AS MATERIALIZED (
  SELECT symbols.symbol, boundary.oldest_kept_bucket
  FROM symbols
  CROSS JOIN LATERAL (
    SELECT min(bucket_ts) AS oldest_kept_bucket
    FROM (
      SELECT bucket_ts
      FROM xstock_spot_ohlc_60m_snapshot f
      WHERE f.symbol = symbols.symbol
      ORDER BY bucket_ts DESC
      LIMIT 60
    ) retained
  ) boundary
)
SELECT 'eligible60' AS population,
       count(*)::bigint AS rows,
       count(DISTINCT s.symbol)::bigint AS symbols
FROM xstock_spot_ohlc_60m_snapshot s
JOIN floor_boundary f USING (symbol)
WHERE s.bucket_ts < '2026-10-12T00:00:00Z'
  AND s.bucket_ts < f.oldest_kept_bucket;

SELECT 'live15' AS population, count(*) AS rows, count(DISTINCT symbol) AS symbols,
       min(captured_at), max(captured_at)
FROM xstock_spot_ohlc_15m_snapshot
UNION ALL
SELECT 'live60', count(*), count(DISTINCT symbol), min(captured_at), max(captured_at)
FROM xstock_spot_ohlc_60m_snapshot;

SELECT m.source_table,
       count(*) AS active_manifests,
       sum(m.row_count) AS manifest_rows,
       count(e.manifest_id) AS evidence_rows,
       count(*) FILTER (
         WHERE e.source_row_count = e.exported_row_count
           AND e.exported_row_count = e.downloaded_row_count
           AND e.selector_contract IS NOT NULL
           AND e.ordered_key_sha256 IS NOT NULL
           AND e.full_row_sha256 IS NOT NULL
       ) AS exact_complete
FROM data_archive_manifest m
LEFT JOIN data_archive_exact_evidence e ON e.manifest_id = m.id
WHERE m.source_table IN (
  'xstock_spot_ohlc_15m_snapshot',
  'xstock_spot_ohlc_60m_snapshot'
)
  AND m.state = 'active'
GROUP BY m.source_table
ORDER BY m.source_table;

SELECT 'post_writer_15' AS population, count(*) AS rows, max(captured_at)
FROM xstock_spot_ohlc_15m_snapshot
WHERE captured_at > '2026-11-11T19:47:47.411Z'
UNION ALL
SELECT 'post_writer_60', count(*), max(captured_at)
FROM xstock_spot_ohlc_60m_snapshot
WHERE captured_at > '2026-11-11T19:47:47.411Z';

SELECT module_name, constant_name, value, updated_by
FROM module_constants
WHERE module_name = 'data_lifecycle'
  AND constant_name = 'xstock_snapshot_retention.mutation_enabled';

SELECT module_name, constant_name, value, updated_by, updated_at
FROM module_constants
WHERE module_name = 'xstock_bar_availability'
  AND constant_name = 'graded_window_start';
```

Stable expected results are zero/zero for each eligible population; 100 / 2,163,663 / 100 / 100 for 15-minute manifest evidence; 111 / 573,523 / 111 / 111 for 60-minute evidence; mutation `true`; and availability anchor `2026-11-09T00:05:00Z`, updated by `b-xstock-bar-availability-r2-rerun`. Live and post-writer row counts may increase after this document; their positive-control requirement is nonzero rows and 495 represented symbols per live table.

### 3. Alert-state read

Read the whole alert store, merge by id, and inspect these exact ids:

```text
7e20ed0f-692a-4899-8af3-c3db071bd97a  KD-19 event wait — active, unacknowledged
3306c5c3-70d7-44c8-8e6f-44bb728417e8  availability final gate — scheduled, unacknowledged
507072de-132a-49f1-8c69-47a669985a41  availability daily tally — active, unacknowledged
0bf1414d-0630-42bd-bd08-1a038b5460a1  availability daily tally — active, unacknowledged
39fa19de-21de-4331-b907-2c359cdda1f3  availability daily tally — active, unacknowledged
362491d2-c08b-4316-b4a1-2d232909ab83  15-minute retention failure — resolved after completion
e4f13998-0854-46c1-8c5c-29f26350fcd5  60-minute retention failure — resolved after completion
```

Use the whole `/var/log/dawntrader/system-alerts.jsonl`, not a tail. The positive control at the Step 7 boundary was 3,116 distinct alert ids and seven matches from the seven ids above.

## Known limits to preserve in the verdict

- This proves the registered backlog and the next post-writer run, not future storage or database availability.
- Writer contention remains fail-closed and may defer one object to a later run.
- Ordinary vacuum makes deleted pages reusable but does not promise immediate allocated-file shrinkage.

## Coltrane Step 8 verdict

**PROCEED at exact ref `33e5162af1fbb460fddec9b204322fcb9fe8528e` (2026-11-11T20:19:54Z).** Coltrane independently reached every registered leg through his own staging access:

- deployed repository and build stamp both matched `fbbe0b5e4af86be3a87fa0d6c2362f3e7bc899e4`;
- log totals reproduced exactly 2,163,663 deleted 15-minute rows and 573,523 deleted 60-minute rows;
- database evidence reproduced 100 / 2,163,663 / 100 / 100 for 15-minute manifests, rows, evidence rows and complete proofs, and 111 / 573,523 / 111 / 111 for 60-minute;
- the frozen selector returned zero eligible rows and zero eligible symbols in both tables, against live positive controls of 536,563 15-minute rows and 129,546 60-minute rows across all 495 symbols, plus 11,832 and 489 post-apply writer rows respectively;
- the terminal and post-writer runs reproduced with zero terminal failure, and the latter with zero deletes and zero failures;
- mutation remained true, the availability anchor remained unchanged, all five event-wait alerts remained unacknowledged, and the two retention-failure alerts were resolved with successful-run evidence; and
- source plus the five lock-timeout runs independently proved the one-second/five-second fail-closed path was exercised before later completion.

No leg was ruled on a reported fact. UI remains N/A. The verdict preserves all three known limits above.
