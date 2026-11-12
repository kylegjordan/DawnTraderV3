# B-XSTOCK-SNAPSHOT-RETENTION — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture

**Batch:** `B-XSTOCK-SNAPSHOT-RETENTION` · **Issue:** `#1194` · **Owner:** CC-C / ANALYST Codex · **Reviewer:** Coltrane for this Codex shift · **Code ref audited:** `origin/migration/aws-supabase` = `2fe1fb7b9a3e6c30fd34e43910e2159d486283bf` · **Runtime/DB reads:** staging, 2026-11-11 10:30–11:31Z.

## 0. PREVIOUSLY-STATED-VS-NOW

- **PREVIOUSLY STATED: the 60-minute snapshot is bounded to about 15,900 rows and the 15-minute snapshot to about 63,600 rows. NOW: 701,946 sixty-minute rows and 2,687,740 fifteen-minute rows. REASON:** the original cap limited each prewarm/read result but never removed older primary keys; every later UPSERT added another time bucket.
- **PREVIOUSLY STATED: 2,170,469 fifteen-minute rows and 574,432 sixty-minute rows were cleanup-eligible at the Step-1 read. NOW: 2,163,663 fifteen-minute rows and 573,523 sixty-minute rows at the frozen 2026-11-11T11:30:51.962861Z audit read. REASON:** the audited selector freezes the 30-day cutoff at the complete UTC-day boundary `2026-10-12T00:00:00Z`, keeping the partial boundary day hot; the Step-1 measurement used the moving intra-day cutoff, and writers continued between reads.
- **PREVIOUSLY STATED: 2,687,293 fifteen-minute rows and 701,922 sixty-minute rows at the Step-1 size read. NOW: 2,687,740 and 701,946. REASON:** the live cache/prewarm writers continued normally; this is +447 fifteen-minute keys and +24 sixty-minute keys over the named populations.
- **PREVIOUSLY STATED: 642,834,432 bytes total for the 15-minute relation and 169,517,056 for the 60-minute relation. NOW: 642,891,776 and 169,517,056 bytes. REASON:** the live 15-minute table grew between reads; PostgreSQL relation allocation for the 60-minute table did not cross another allocation boundary.
- **PREVIOUSLY STATED: all current snapshot rows are legacy-shaped. NOW: all 2,687,740 fifteen-minute rows and all 701,946 sixty-minute rows still have NULL aggregate-revision identity. REASON:** the availability cutover remains in its separate observation window; this batch must nevertheless support the already-live certified schema shape.
- **PREVIOUSLY STATED: ordinary `VACUUM` follows cleanup. NOW: ordinary `VACUUM (ANALYZE)` follows cleanup and is reported only as reusable database space, not operating-system disk return. REASON:** ordinary VACUUM does not shrink the relation files; `pg_repack` is not installed, and a blocking `VACUUM FULL` is outside the approved scope.
- **PREVIOUSLY STATED: the existing six-hour-stale O_EXCL run lock safely serialises cron and manual runs. NOW: replace it with one kernel-held `flock` entry path shared by cron and manual runs, with no age-based unlink or application release. REASON:** a live run older than six hours can currently be unlinked and overlapped, and its eventual unconditional release can delete the successor's lock; the 211-object backlog has no proved sub-six-hour bound.
- **PREVIOUSLY STATED: each archived object is followed by `VACUUM (ANALYZE)`. NOW: run it at most once per snapshot table per invocation, after that table's whole object loop and outside every source lock. REASON:** 211 full-table vacuums would magnify runtime and production impact without adding proof to each object.
- **PREVIOUSLY STATED: the two tables can use B75's generic plain-archive lane. NOW: they require a dedicated ranked-population adapter inside B75's one manifest/storage/evidence state machine. REASON:** the current plain lane freezes a time range and reuses it by row count only; these mutable UPSERT tables require a per-symbol rank floor, ordered-key digest, full-row digest, and proven-key delete.

## 1. Audit conclusion

The scope is valid, but the current plain-table B75 implementation is not strong enough to delete from these two mutable snapshot stores. The implementation will add one **snapshot lane inside B75**, not a second archiver: the existing manifest, storage providers, one existing-copy decision, exact-evidence table, alerts, cold rotation and rehydrate command remain the lifecycle state machine. The unsafe timestamp/unlink run lock is replaced at the same single entry path by a kernel-owned lock that cannot outlive its process or remove a successor.

Each UTC-day object will freeze a cutoff, ranking instant and complete eligible population. It will be exported in `(symbol, bucket_ts)` order with three proofs: source/export/download row equality, an ordered-key SHA-256, and a canonical full-row JSONL SHA-256. Immediately before deletion, a short `LOCK TABLE ... IN SHARE MODE` transaction will recompute that exact population under the stored cutoff/floor, compare both digests to the downloaded proof, delete only the downloaded/proven keys, check the deleted count, and mark the manifest active in the same commit. Any mismatch or timeout leaves source rows hot.

The initial backlog is large but bounded: 211 UTC-day objects across the two tables, containing 2,737,186 candidate rows at the audit read. It will be processed by a supervised, resumable run under the replacement kernel-held B75 lock after a dry read; the ordinary nightly schedule remains the only recurring scheduler and handles the later steady-state day objects.

## 2. Six-source read and evidence boundary

All six required sources were read. Code citations and mechanism statements refer to the fixed audited ref above, not an uncommitted working tree.

| # | Source read | What it established |
|---|---|---|
| 1 | **Actual code:** full `xstock-ohlc-cache.ts`, `b-new-34b-prewarm-snapshot.ts`, `session-lifecycle-controller.ts`, `b75-retention-sweep.ts`, `partition-exporter.ts`, `archive-completeness.ts`, `exact-archive-evidence.ts`, `storage-client.ts`, `b75-rehydrate.ts`; direct historical readers and focused tests | Current live caps/writers, entry points, archive state machine, count-only reuse weakness, mutable-table proof needs, rehydrate seam and every direct snapshot consumer. |
| 2 | **Runtime logs + database:** PM2 process state and `/var/log/dawntrader/out.log`; full current B75 terminal run; root/deploy crontabs; table counts/sizes/stats/schema/triggers/FKs/config/manifest rows; selector plans and candidate populations | Writers operate about every 30 seconds; one installed B75 schedule exists; the latest sweep ran 73.1 minutes; current cleanup population, object sizes, concurrency and reclamation posture. |
| 3 | **System Impact Map:** B-NEW-34b/B.4 snapshot rows (`SYSTEM_IMPACT_MAP.md:1548-1574`), B75 inventory and evidence/harness sections (`:2487-2584`) | Upstream writers, live consumers, scheduler ownership, one lifecycle stack, exact-evidence readers/writers and the stale claim that selected UPSERT caps bound stored rows. |
| 4 | **System Manual:** B75 Data Lifecycle (`SYSTEM_MANUAL.md:12127`, `:12243-12328`); 60m/15m snapshot architecture (`:12780-12880`); lifecycle prewarm (`:13361-13374`) | Move-not-delete rule, proof-before-removal, 42-case executable harness, 60/240 live guarantees, and documentation gaps identified in A10. |
| 5 | **Ledger + reports:** `RUNNING_ISSUES` `#1194`, `#441`, `#1195`, `#1208`; `BATCH_CATALOG`; snapshot/B75/export-completeness/harness scopes, change lists and completion reports | `#1194` is the placed home; `#441` is separate; the two B75 prerequisites are closed; same-count replacement is explicitly outside the predecessor's count-only contract and belongs here. |
| 6 | **`bridge/canonical/` + git archaeology:** all snapshot/B75/prewarm/retention terms; introducing commits `d9031fe8...`, `f7fa4be2...`, `f4e6a73f...`, `f3d5fa54...`, `817f1a26...` | The canonical pre-governance corpus has no material coverage of these later components. Git history establishes the intended bounded live cache and Kyle's controlling “move, never drop” lifecycle rule. |

This is a server-side data-lifecycle batch. No UI reads either snapshot table or the archive control tables directly, so a Step-2 UI observation would not test the mechanism; UI is N/A for this batch.

## 3. Entry points first — production census

The census began with repo-wide scheduler/start enumeration, tests and `scripts/inventory/**` excluded.

| Entry point | What starts it | State touched | Mutual exclusion / overlap result |
|---|---|---|---|
| B75 retention sweep | exactly one installed root-cron line, `15 2 * * *`; the same command can be invoked manually | all registered lifecycle tables, manifest/evidence, warm storage | current O_EXCL lock is unsafe after six hours; P7 replaces both entry routes with one kernel-held `flock` and removes age-based unlink/release |
| xStock cache write-back | live scanner/cache cold reads; scanner reconciliation runs every 30 seconds | UPSERT newest 24 rows per requested interval | no global lock with B75; the retention transaction must exclude writers briefly and then release |
| Lifecycle prewarm | exactly one lifecycle boundary driver: scanner's 30-second Fri/Sun reconcile; shutdown and restart each call the legacy prewarm | UPSERT newest 240/60 rows per symbol | lifecycle `inFlight` mutex serialises lifecycle calls only |
| Manual prewarm | `npm run b-new-34b:prewarm` operator command | same snapshot UPSERTs | not covered by lifecycle mutex; idempotent with another UPSERT, but must be blocked by the retention lock window |
| Server boot | `session-lifecycle-controller.init()` | reconciles scanner/trade state | boot itself does not prewarm; System Manual prose implying a boot prewarm is stale |
| Historical scripts | operator-only tsx commands listed in §5 A7 | read snapshot rows | no recurring schedule; they need horizon/refusal honesty, not locking |

There are **two write entry families** against the snapshot tables (cache write-back and prewarm), and **one retention scheduler**. The current run lock does not prove retention-to-retention exclusion beyond six hours; P7 closes that defect at the shared cron/manual entry path. The database table lock closes the separate writer-to-delete race.

## 4. Component census at each shared-state hop

### 4.1 Snapshot tables

- **Writers/mutators (exactly 2 production components):** `server/services/xstock-ohlc-cache.ts` and `scripts/b-new-34b-prewarm-snapshot.ts` (the lifecycle imports the latter; it is not a third writer implementation).
- **Live readers:** `xstock-ohlc-cache.ts`, reached by the xStock scanner and refresh consumers.
- **Historical/manual readers:** B.1a replay, B.3 regime audit, B31a gate audit 2, W2a geometry sweep, W20C provenance replay.
- **Dormant reader:** `amr-context-bonus-shadow.ts`; no production caller was found and this batch does not activate it.
- **Deleter today:** none. Positive control: B75 contains real DELETE/DROP statements for other lifecycle objects.
- **Constraints/triggers:** primary key `(symbol,bucket_ts)`, descending duplicate-support index, availability-shape check and an INSERT/UPDATE availability guard; no DELETE trigger.
- **Foreign keys into the snapshots:** zero. Positive control: the same database census found 60 foreign keys overall.

### 4.2 `data_archive_manifest` and `data_archive_exact_evidence`

The retention sweep, context lane and disk-file lane write exact evidence; the cold rotator carries the proven basis without manufacturing a new export proof. Rehydrate and capacity/readiness tools read it. Evidence is append-only and tied to the manifest; no production path deletes evidence.

The existing evidence row proves only source/export/download **count equality**, cursor contract and compressed object checksum. `proofCountStillMatches` recounts only a time range. That is sufficient for write-sealed partitions but cannot distinguish these snapshot mutations:

1. one old key replaced by another key with the same count;
2. an UPSERT changing OHLC/availability content under the same key;
3. a recent insert moving the per-symbol rank boundary while total day count stays equal;
4. a later wall-clock cutoff selecting a different boundary population.

Therefore the same table/state machine must gain snapshot-specific selector identity and two digests; a second evidence table would create two competing definitions of “proven.”

### 4.3 Storage and rehydrate

`storage-client.ts` streams local gzip files to warm storage (TUS over 40 MB), downloads them for checksum/readback, and supports the existing cold tier. `b75-rehydrate.ts` selects the manifest object, verifies checksum and writes the object plus completeness sidecar into a private destination. The snapshot lane will use those transports unchanged and add its selector/key/content fields to the sidecar.

### 4.4 State that must not be deleted

The snapshot tables have zero FK edges to `xstock_bar_revision_event`, `xstock_bar_aggregate_revision`, `xstock_bar_window_manifest`, certificates, decision/refresh-attempt provenance, observation state or alerts. The implementation inventory will contain DELETE only against the two snapshot tables and `data_archive_manifest` state updates; no evidence or availability table enters a removal target.

## 5. Audit findings

### A1 — Result caps never bounded stored primary keys

The live cache reads at most 240 fifteen-minute or 60 sixty-minute rows per symbol, merges a recent overlay, returns the cap and writes back only the newest 24. The prewarm likewise selects at most 240/60 before UPSERT. Neither component deletes an older `(symbol,bucket_ts)` key. The original “bounded table” claim therefore described each read/write set, not stored history.

At the frozen audit read, the 15-minute table held 2,687,740 rows (42.3 times the old 63,600 estimate) and the 60-minute table held 701,946 (44.2 times the old 15,900 estimate). **Falls to P1–P3.**

### A2 — The exact governed population is a time/rank union

The approved rule keeps every row at or after the frozen complete-day cutoff and, regardless of age, the newest 240/60 rows for each represented symbol. Cleanup eligibility is `bucket_ts < frozen_cutoff AND bucket_ts < that symbol's retained-floor boundary`. The floor CTE must be materialized: on a 23,079-row 15-minute day, `EXPLAIN ANALYZE` was 722.119 ms with the materialized boundary and 5.8 seconds when PostgreSQL repeated the subplan.

Frozen at 2026-11-11T11:30:51.962861Z (`cutoff=2026-10-12T00:00:00Z`, 495 symbols):

| table | exact rows | eligible rows | UTC-day objects | per-object rows (min / median / max) | oldest → newest eligible |
|---|---:|---:|---:|---:|---|
| 15m | 2,687,740 | 2,163,663 | 100 | 1 / 23,000.5 / 25,951 | 2026-05-21T11:45Z → 2026-10-09T23:45Z |
| 60m | 701,946 | 573,523 | 111 | 1 / 6,025 / 8,467 | 2026-05-06T18:00Z → 2026-10-09T23:00Z |

Cutoff and ranking instant are evidence fields, not values recomputed later. A frozen object does not absorb a row that becomes eligible tomorrow; that row belongs to a later object/run. **Falls to P1–P4.**

### A3 — Count-only B75 reuse is unsafe for mutable ranked rows

The existing exporter takes a REPEATABLE READ READ ONLY time-range snapshot and proves counts/checksum. The reuse helper later asks only whether the source count still equals the stored count. Unlike an old partition, these two tables remain writable by UPSERT and eligibility depends on ranking. All four red mutations in A2 can preserve a count while changing what would be deleted.

Snapshot reuse is allowed only when the current population under the **stored** selector contract reproduces the stored ordered-key and full-row digests. Generic B75 lanes keep their existing count contract unchanged. **Falls to P3–P5.**

The manifest label must also distinguish legitimate later populations in an already-processed UTC day without turning a same-key resurrection into an automatic overwrite. Snapshot labels will therefore be deterministic `UTC-day + ordered-key-digest` identities. A newly eligible floor-displacement key produces a new label and fresh proof; the same key set with changed content resolves to the old label and refuses against its immutable evidence until an explicit rebuild/intervention. Range bounds, not label parsing, drive rehydrate selection. **Falls to P2–P5.**

### A4 — Canonical proof can be exact without changing storage providers

For each object, one REPEATABLE READ transaction will materialize the floor boundaries and selected day keys, then stream rows ordered by `(symbol,bucket_ts)`. The exporter will write a fixed, versioned 19-field JSONB object per line; timestamp fields are rendered by PostgreSQL at UTC microsecond precision before JSON construction. The exact uncompressed JSONL bytes (including one `\n` per row) produce the full-row SHA-256. A length-framed UTF-8 `(symbol,bucket_ts-text)` stream produces the ordered-key SHA-256. The existing gzip file SHA-256 remains the transport checksum.

The current schema is exactly 19 columns. A 2026-10-01 sample measured 23,139 fifteen-minute rows / 12,930,331 raw JSONL bytes (558.8 bytes/row average) and 7,400 sixty-minute rows / 4,137,551 bytes (559.1 average). The contract will refuse an unexpected column set rather than silently omit a future field. **Falls to P3–P5.**

### A5 — A short writer-excluding lock closes the final race

The source proof is created without blocking writers. Before delete, the downloaded rows are loaded into a session-local temporary table. The delete transaction sets `lock_timeout='1s'` and `statement_timeout='5s'`, then takes `LOCK TABLE <snapshot> IN SHARE MODE`: ordinary reads continue, but INSERT/UPDATE/DELETE writers cannot cross the final compare/delete boundary.

After the lock, one data-modifying statement rematerializes the floor with the stored cutoff/floor, computes the current day count/key/content digests using the same canonical SQL expressions, conditionally deletes only by joining the temporary proven keys, requires the deleted count to equal the proof, and conditionally marks that manifest label active. It is followed immediately by COMMIT, with no network/storage work or unrelated query while the lock is held. A timeout or mismatch rolls back; the post-commit absence read names the same proven keys. The reviewed writer-pause target is at most the 5-second compare/delete statement plus commit/rollback overhead, based on the 722 ms selector plan—not a false absolute wall-clock guarantee. Step 5/7 must measure the full locked path and refuse production cleanup if the observed pause exceeds 5 seconds. **Falls to P4, P7 and P9.**

### A6 — Live writers do not need a second policy

Cache write-back only touches the recent 24 buckets. Prewarm selects the newest 240/60, exactly the minimum floor protected from cleanup; even a wider manual `--days` source scan cannot select rows older than that retained set. Therefore no rebuild mode is needed now. The implementation will centralize/validate the floor relationship and add a test that a wide prewarm cannot recreate an archived key. A future prewarm cap greater than the configured floor must fail closed before the selector runs. **Falls to P1, P6 and P8.**

### A7 — Direct consumers divide into four honest classes

| Consumer | Class after this batch | Required change |
|---|---|---|
| `xstock-ohlc-cache.ts` | live bounded | none to returned bars or write-back; share/validate floor constants only |
| prewarm + lifecycle | recent-hot writer | preserve 14-day default and 240/60 cap; add invariant/refusal test, no new scheduler |
| B31a gate audit 2 | recent-hot | 7-day window + 3-day warmup; assert the requested 10 days fit the configured snapshot horizon |
| W2a geometry sweep | recent-hot | default 14-day window + 2-day warmup; reject `W2A_WINDOW_DAYS` values whose required 16+ days exceed the horizon |
| B.3 regime audit | recent-hot | make the “full window” explicitly the current hot window and assert the 7-day verdict plus 60-bar warmup are present |
| W20C provenance replay | recent-hot with exact references | pair its existing decision/provenance hot-horizon check with the snapshot horizon; require all captured `settled_bar_count` references (up to 240 bars) instead of silently counting missing history as `droppedThin` |
| B.1a fixed 2026-05 replay | historical-rehydrate | refuse the hot table and print the exact B75 rehydrate command/labels needed for its fixed era; a rehydrated input path is the only way it may run |
| AMR context-bonus shadow | dormant | no reachability or activation change; keep its dormant status documented |

The shared horizon reader will name the earliest hot date and a concrete rehydrate instruction. A hot-window positive control and historical refusal are both required. **Falls to P8.**

### A8 — One scheduler remains correct; initial cleanup must be supervised

The root crontab contains exactly one B75 retention line. Staging provides `/usr/bin/flock` from util-linux 2.39.3. The latest run examined/dropped 22 partitions, failed 0, reported 28,351,709,184 relation bytes freed, archived 1,045,738,984 bytes, deleted 144,480 plain rows and ran 4,384,109 ms (73.1 minutes). Live snapshot logs show reads and write-backs continuing about every 30 seconds, including 72-symbol / 17,280-bar reads and 1,728-row write-backs.

The current lock is not safe for that backlog. It force-unlinks any lock whose mtime is older than six hours without checking whether the holder is alive, and every original holder later unlinks the path unconditionally. A live supervised run crossing six hours can therefore overlap cron and then erase cron's successor lock. No measurement proves the 211-object/2,737,186-row backlog will finish below six hours.

Deployment therefore first replaces the timestamp/unlink lock with a stable kernel-held `flock` entry path used by both cron and manual invocations. The operating system owns release when the holder exits or crashes; the application never unlinks or age-reclaims the lock file. The snapshot lane then starts disabled-for-mutation, runs its dry read, and enables a `--snapshot-only` manual mode of the same B75 process under that identical lock for the resumable backlog. That mode skips unrelated lanes but creates no second scheduler or lifecycle implementation. After backlog, the existing daily full-sweep schedule is the only recurring owner. **Falls to P1, P7 and P9.**

### A9 — Space reporting must separate logical cleanup from physical shrink

Current relation sizes:

| table | heap bytes | index bytes | total bytes | planner dead rows at the earlier audit read |
|---|---:|---:|---:|---:|
| 15m | 320,937,984 | 321,830,912 | 642,891,776 | 370,097 |
| 60m | 81,854,464 | 87,605,248 | 169,517,056 | 98,218 |

Ordinary `VACUUM (ANALYZE)` makes deleted pages reusable but normally leaves relation files allocated. `pg_repack` is available to install but not installed; `VACUUM FULL` takes a blocking rewrite lock. Neither physical rewrite belongs in this cleanup. Before/after reports will name logical rows, heap/index/total bytes and reusable/dead-space effects without promising OS/Supabase file shrink. **Falls to P7 and P9.**

### A10 — Governance describes the intended caps but no retention owner

The System Impact Map and System Manual correctly describe 240/60 live reads and prewarm, but call the stored tables bounded and name no deleter. The Manual also retains stale “interim manual prewarm until lifecycle ships” and boot/prewarm wording. B75 documentation says exact evidence is count equality and that the harness has 42 executable cases; this batch strengthens only snapshot objects and extends that harness.

Step 10 must record the two lifecycle constants/floors, ranked selector, digest evidence, lock/delete contract, reader classes, physical-space honesty and deployment mode; it must remove the false stored-row bounds without rewriting the historical reason the caches were built. **Falls to P10.**

### A11 — Availability evidence remains outside the delete target

All current rows are legacy-shaped, but the schema/guard already accepts fully certified rows with microsecond timestamps, UUIDs, hashes, sequences, primary identity, contract version and eligibility state. Canonical full-row JSONL and rehydrate fixtures must cover one legacy row and one complete certified row. The availability revision/aggregate/manifest/certificate/observation tables and current Step-9 alerts are neither selected nor cascaded. **Falls to P3, P5 and P9.**

### A12 — Provenance preserves both original intents

The 60m origin `d9031fe8...` and 15m origin `f7fa4be2...` intended a cheap, bounded live cache, not indefinite historical hot storage. The B75 origin `f4e6a73...` records Kyle's “never drop data” directive and the export→upload→readback→verify→remove sequence; `f3d5fa54...` adds the plain move-not-delete lane; `817f1a26...` makes exact evidence the one proof home. This plan combines those intents: live reads remain bounded and old rows move through B75 rather than vanish.

`bridge/canonical/` has no coverage of these post-governance components, so it supplies no conflicting historical architecture. **Falls to P1–P10.**

## 6. Load-bearing review boundary

The Step-2 skill normally sends mechanism, absence and decision-bearing number claims to one fresh reader. This Codex host's governing instruction forbids spawning subagents unless the user explicitly requests delegation, so no fresh reader was started. The following load-bearing claims ship **NOT RE-READ** for Coltrane's second pass: complete writer/reader/deleter/scheduler census; safety of the `SHARE` lock transaction; deterministic version-label mechanism; canonical digest equivalence; prewarm non-resurrection invariant; exact eligible-population numbers; and reader-horizon classification.

## 7. Implementation plan — every item falls out of the audit

There are no `UNAUDITED` plan items.

### P1 — Governed configuration and activation posture (← A1, A2, A6, A8, A12)

Add a forward/rollback migration with wildcard `data_lifecycle` rows for both snapshot tables: `hot_retention_days=30`, `keep_floor_rows=240|60`, plus one snapshot-lane mutation-enable flag initially false. Extend B75 config resolution to require exact wildcard scope, positive integers and both table rows; reject missing, narrow, non-numeric or contradictory values. Require each configured floor to be at least the live cache/prewarm cap. The rollback disables future snapshot retention and removes only the new config/contract columns when no snapshot evidence depends on them; it never deletes manifest/evidence/storage objects or restores removed hot rows automatically.

### P2 — One ranked selector contract (← A1, A2, A6, A12)

Add `server/services/data-archive/xstock-snapshot-retention.ts` with the two allowlisted table specs, identifier-safe SQL and pure selector metadata. It freezes `cutoff_at=date_trunc('day', observed_at-30d)`, `ranking_observed_at`, table, day range, floor and contract version. In one REPEATABLE READ READ ONLY transaction it materializes per-symbol floor boundaries, materializes the day population, rejects duplicate keys/unexpected schema and exposes dry-read metadata. A deterministic label combines the UTC day with the complete ordered-key digest; range columns remain the rehydrate time index. Both export and locked recheck must call the same SQL builder/contract; no phase may retype a predicate.

### P3 — Snapshot export and complete canonical proof (← A1–A4, A11, A12)

Extend the existing partition exporter through an optional population adapter, not a second storage state machine. The snapshot adapter streams the fixed 19-field PostgreSQL-rendered JSONB line in `(symbol,bucket_ts)` order, preserving UTC microseconds and exact numeric/UUID/hash/null values. It computes exported row count, ordered-key SHA-256, uncompressed full-row SHA-256 and existing compressed-object SHA-256; download recomputes all four before `verified` can land.

Extend `data_archive_exact_evidence` and its append-only writer with nullable generic fields plus snapshot-required constraints: selector contract/version, frozen cutoff, ranking instant, floor, day bounds, key digest and full-row digest. Existing lanes keep their current rows/contract byte-for-byte. A snapshot manifest can receive `source-count-matched` only when its evidence row includes every snapshot field.

### P4 — Exact reuse and proven-key delete transaction (← A2, A3, A5, A12)

Add a snapshot-specific existing-copy adapter to the existing `decideExistingCopy` path. A verified/proven copy is reusable only after downloaded proof and current source under the stored selector reproduce count, ordered keys and row digest. Populate a typed session temp table from the downloaded object before taking any source lock.

For each object: begin; set local 1-second lock timeout and 5-second statement timeout; `LOCK TABLE ... IN SHARE MODE`; execute one conditional compare/delete/active-mark statement; commit immediately. That statement rematerializes current eligibility under the stored cutoff/floor, recomputes count/key/content digests, deletes only `USING` the temp proven keys when all proofs match, and returns exact deleted/manifest counts. Any same-count key swap, content UPSERT, rank displacement, cutoff drift, parse/truncation, lock timeout or count mismatch rolls back before source removal. The post-commit read checks the same proven keys absent and pages if reality contradicts the committed count.

### P5 — Rehydrate and sidecar completeness (← A3, A4, A11, A12)

Keep the generic rehydrate command and storage chooser. Add the snapshot selector/digest fields to its completeness sidecar and validate a downloaded snapshot object's row count, ordered-key digest and full-row digest before reporting it proven. A legacy all-NULL row and a fully certified row must round-trip byte-for-byte at the canonical JSONL layer; microseconds must survive. A sampled object must reproduce its stored proof after rehydrate.

### P6 — Writer invariants without a second lifecycle (← A5, A6)

Export/share the 240/60 live caps or add one tested mapping so cache, prewarm and retention cannot drift silently. Preserve cache overlays, returned bars, recent-24 write-back and 14-day lifecycle prewarm. Add a wide-lookback/manual-prewarm fixture proving only the newest floor is UPSERTed and no archived key is recreated. A future cap/floor contradiction refuses before any archive/delete or prewarm write.

### P7 — B75 orchestration, dry read and runtime bounds (← A5, A8, A9)

Register the snapshot lane after the existing partition/plain work while retaining one B75 entry path, alert actor/keys and scheduler. Replace the internal O_EXCL/mtime/unlink lock with one checked-in launcher used by both the root cron and the documented manual command. The launcher opens the persistent B75 lock file on a dedicated inherited descriptor, takes nonblocking `/usr/bin/flock` on that descriptor, then `exec`s the TypeScript command with every argument passed through; it sets a required launcher marker and never unlinks or age-reclaims the file. The TypeScript entry refuses an unmarked direct invocation. A process exit, signal or crash closes that process tree's owning descriptor and releases only that holder's kernel lock, so there is no stale wait and no old-owner cleanup capable of deleting a successor.

Add `--snapshot-only` as an operator mode of that same process for the initial backlog/dry read; it uses the identical launcher and cannot overlap cron. When mutation is disabled, scheduled and manual snapshot runs print the frozen population/bytes and perform no upload/delete. The first apply is supervised after that read and resumes per object; ordinary nightly runs then process new eligible day objects.

Each object reports archive/readback/lock/compare/delete durations, rows and bytes. Stop that table on the first object failure; continue the other table under the existing per-table isolation. If that table deleted any rows, run `VACUUM (ANALYZE)` exactly once after its entire object loop (including a loop stopped after a later failure), outside every source lock, and report one table-level vacuum duration. A no-delete table performs zero vacuums. Report logical deletion/reusable space separately from unchanged relation allocation.

### P8 — Honest historical readers (← A7)

Extend the shared hot-horizon helper to the two snapshot constants and add a concrete snapshot rehydrate instruction. B31a, W2a, B.3 and W20C assert their requested window plus warmup fits; W20C distinguishes unavailable referenced history from genuinely thin captured input. B.1a refuses its fixed May era unless supplied a rehydrated proven object path. AMR remains dormant and gains no caller. Add one current-hot positive control and one older-era refusal for every configurable reader family.

### P9 — Executed verification and deployment proof (← A5, A8, A9, A11)

Extend the 42-case executable B75 fake-I/O harness and focused archive tests. Required mutations: floor 240/60; cutoff comparator; only-one-phase selector drift; same-count key swap; in-place content replacement; recent insert floor displacement; cutoff drift; missing/extra/truncated/malformed download; checksum/key/content mismatch; lock timeout; early delete; wrong transaction client; deleted-count mismatch; unexpected schema; legacy/certified row shape; prewarm resurrection; evidence-table deletion attempt. Lock-process tests must prove a live holder remains exclusive after the lock file is aged beyond six hours, a killed/crashed holder is immediately recoverable, no old-owner release/unlink can disturb a successor, and cron/manual launchers contend on the same inode with exactly one body entering. Vacuum tests require zero calls for no deletes and exactly one per table for one or many successful objects, including a table loop stopped after a later failure.

Step 7 order: deploy with mutation disabled → hold the kernel lock with an aged lock-file timestamp and prove both the cron and manual path refuse, then terminate that holder and prove exactly one path enters without waiting six hours → exact dry read over both tables/all 495 symbols, including counts, oldest/newest keys, object distribution and estimated JSONL bytes → enable supervised apply → archive/readback/proof/delete/one-table-vacuum/post-delete invariant → verify availability anchors/alerts unchanged → later natural writer cycle and next retention read. CI must pass TypeScript Check, Test Suite, Build and Docker Build individually at the deployed ref. API/log/database evidence is required; UI is N/A.

### P10 — Governance and closeout (← A10, A12)

At Step 10 update System Impact Map, System Manual, SIM component rows, Batch Catalog, Running Issues, migration manifest and lifecycle records with the final reviewed contract. Replace false stored-row bounds with “bounded live reads + governed retained hot history,” record one B75 scheduler and both prewarm entries, correct stale lifecycle-prewarm prose, document the reader classes and physical-space limitation, and close `#1194` only after Step 11. `#441`, B-XSTOCK-BAR-AVAILABILITY and KD-19 remain separate.

## 8. Verification matrix

| Objective | Positive control | Mutation/failure that must refuse before delete |
|---|---|---|
| OBJ-1 | current 30d + 240/60 selector retains liquid, inactive, boundary and short-history symbols | missing/narrow/bad config; changed floor; comparator or phase drift |
| OBJ-2 | source/export/download count, key digest, row digest and checksum all match; existing proven copy reproduces proof | same-count key/content replacement; unproven state; changed current proof; readback/storage failure |
| OBJ-3 | locked current proof equals downloaded proof; proven-key delete count exact; manifest active in same commit | recent rank displacement; cutoff drift; lock/statement timeout; early/new-selector delete; count/absence mismatch |
| OBJ-4 | live cache returns 240/60 and 14-day/wide prewarm writes only protected keys | cap/floor drift; archived-key resurrection; scanner/regime/mixed-clock output change |
| OBJ-5 | legacy and fully certified rows rehydrate with exact fields/microseconds; evidence-table census unchanged | shape loss, timestamp truncation, any DELETE/cascade into availability/provenance/evidence |
| OBJ-6 | each recent-hot tool runs inside horizon; B.1a prints exact rehydrate instruction | old era silently reads hot subset; W20C converts missing history into ordinary thinness; AMR becomes reachable |
| OBJ-7 | disabled dry read, supervised resumable cleanup, natural writer/next read, four green CI jobs | cron mutates before dry proof; overlap; stale row remains outside both protections; alert/window anchor moves |

## 9. Plain-language summary

The tables grew because “keep the latest 240 or 60” limited what each run read and wrote, not what stayed stored. The plan keeps the last 30 days plus those minimum per-symbol floors, but first moves every older row through the same verified B75 archive system used elsewhere.

Because these tables keep changing while the app runs, a row count is not enough proof. Each archived day will carry a fingerprint of every key and every full row; deletion gets a short writer pause, rechecks those fingerprints, and removes only the proven keys. Old analysis tools will either stay inside the hot window or stop with an exact rehydrate instruction instead of quietly analysing an incomplete slice.

## 10. Step 10 final-design reconciliation (2026-11-12)

The implementation matches P1-P10 without a repair loop. Staging reads back the five exact wildcard lifecycle values as 30 days, 240/60 per-symbol floors and mutation enabled; the frozen selector is empty after the initial apply while 495-symbol positive controls remain present. Every one of the 100 fifteen-minute and 111 sixty-minute objects is source-count-matched, and the exact archived row totals are 2,163,663 and 573,523 respectively.

Known limits remain explicit: the proof covers the registered backlog and the next post-writer run, not all future storage/database availability; lock contention deliberately defers work rather than weakening proof; and ordinary vacuum makes pages reusable but need not shrink the relation file immediately. Step 11 will transcribe the Step-10 tier ledger into the completion report; it will not close or acknowledge any separate event/window wait.
