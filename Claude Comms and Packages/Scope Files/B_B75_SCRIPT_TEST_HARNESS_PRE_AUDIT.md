# B-B75-SCRIPT-TEST-HARNESS — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture

**Batch:** `B-B75-SCRIPT-TEST-HARNESS` · **Issue:** `#1208` · **Owner:** CC-B / NEW Codex · **Reviewer:** Coltrane for this Codex shift · **Code ref audited:** `origin/migration/aws-supabase` = `e5a06d8dab5240a69529fbf2a905bf389ac6aa7d` · **Runtime/DB read:** staging, 2026-11-10 23:31–23:32Z.

## 0. PREVIOUSLY-STATED-VS-NOW

- **PREVIOUSLY STATED: 4 import-unsafe scripts. NOW: 4 import-unsafe scripts. REASON:** the repo-wide entry-point census still finds unconditional `main()` calls in exactly the four scoped modules; no production module imports any of those four for side effects.
- **PREVIOUSLY STATED: 7 objectives. NOW: 7 objectives. REASON:** the audit narrows their implementation seams and strengthens OBJ-3; it does not add or remove an objective.
- **PREVIOUSLY STATED: 66/66 targeted baseline tests pass (62 export-completeness + 4 count-gate). NOW: 66/66 pass at the approved scope boundary. REASON:** no code has changed during Steps 1–2.
- **PREVIOUSLY STATED: the only production change is the import boundary and test seams. NOW: one pre-existing context-lane safety defect must also be corrected in OBJ-3. REASON:** a proven context month is reused without the source recount required by the System Manual and System Impact Map, then the wrapper can delete that month's current rows. This is enforcement of the already-approved architecture, not a new archive rule; §4 A3 and plan P3 give the exact bound.
- **No prior numerical claim moved.** The runtime and database figures in §5 are fresh observations over named populations, not revisions to scope numbers.

## 1. Six-source read and evidence boundary

All six required sources were read. Code citations below are to the fixed audited ref, never the working tree.

| # | Source read | What it established |
|---|---|---|
| 1 | **Actual code:** the four scripts in full; `archive-completeness.ts`, `exact-archive-evidence.ts`, `partition-exporter.ts`, `storage-client.ts`, `disk-file-tiering.ts`; both predecessor test files | Current entry points, state transitions, storage order, file behaviour, source deletion gates, fake-client precedent and which claims are still structural. |
| 2 | **Runtime logs + database:** PM2 list/log tail; full `b75-retention.log` and `b75-cold-rotator.log`; live crontabs; `data_archive_manifest`, `data_archive_exact_evidence`, `context_bridge_log` | Which jobs actually run, current archive states, current context exposure and the positive controls for absent schedule/log/reuse population. |
| 3 | **System Impact Map:** B75 inventory and B-B75-EXPORT-COMPLETENESS block (`:2468-2571`) | Component roles, schedules, forward consumers, proof writers/readers and the four-gate recount rule. |
| 4 | **System Manual + Storage Policy:** Data Lifecycle (`SYSTEM_MANUAL.md:12258-12320`); Storage Policy §§2.5, 4, 4.5, 9.D | The authoritative deletion/reuse rule, retention policy, move-not-delete invariant, rehydrate contract and a schedule-status contradiction recorded in A9. |
| 5 | **Ledger + reports:** `RUNNING_ISSUES` `#1208`, `#1195`, `#169`; B75 and B-B75-EXPORT-COMPLETENESS entries in `BATCH_CATALOG`; predecessor scope/pre-audit/change list/Step-7/completion report; current approved scope | `#1208` is the placed home, structural coverage was deliberately temporary, the reuse path was not live-exercised, and context scheduling remains `#169`. |
| 6 | **`bridge/canonical/` + git archaeology:** all canonical filenames and every B75/archive/retention/rehydrate/context match; introducing and seam commits | The canonical corpus covers the old Context Bridge broadcaster only (`DawnTrader_System_Architecture_Execution_Flow.md:827-829`) and has **no B75 lifecycle coverage**. Git history is therefore the applicable intent record (§7). |

The UI does not read or operate these four maintenance scripts, `data_archive_manifest`, or `data_archive_exact_evidence`. There is no truthful UI behaviour to inspect at Step 2; the staging page gap is N/A for this server-side test-instrument batch.

## 2. Entry points first — complete production census

The census used `git grep` at the audited ref over tracked production code with tests and `scripts/inventory/**` excluded. The same instrument found six real imports of `archive-completeness.ts`, so its zero-import result for the four executable modules is non-vacuous.

| Module | Direct entry now | Other production importer/caller | Live scheduler/start surface | Mutual exclusion |
|---|---|---|---|---|
| `b75-retention-sweep.ts` | unconditional `main().catch(...)` at `:1458-1469` | **zero imports**; comments in `sweep-slicing.ts` are not callers | exactly one root-crontab line, `15 2 * * *`; the script header records the same command (`:30`) | O_EXCL lock acquired/released at `:1273-1305`; `main` releases before exit at `:1311-1333` |
| `context-bridge-log-ttl.ts` | unconditional `main().catch(...)` at `:478-481` | **zero imports** | no root/deploy cron, no `/etc/cron*` match and no `b75-ctx-bridge.log`; manual command only, already `#169` | no scheduler exists; this batch does not add one |
| `b75-cold-rotator.ts` | unconditional `main().catch(...)` at `:393-396` | **zero imports** | exactly one root-crontab line, `0 3 1 * *`; header at `:11` | one scheduler; no second recurring entry point |
| `b75-rehydrate.ts` | unconditional `main().catch(...)` at `:377-380` | **zero imports**; `moved-day-check.ts:98` emits the operator command, not an import | operator/future-analytics CLI only; no recurring scheduler | caller chooses a private output folder; no background concurrency is introduced |

The repo also has independent archive-related executables (`b-disk-file-tiering`, the xStock capacity gate, `perpfeed-gate-test`, moved-day checks and liveness/health jobs). They are not fifth entry points into these four modules and remain outside the runtime edit; their shared-state roles are enumerated next.

## 3. Component census at every shared-state hop

### 3.1 `data_archive_manifest`

The production census has **9 files** with this table (tests excluded):

- **Writers/mutators (4):** retention sweep (`:398-475`, `:737-740`), context lane (`:190-205`, `:250-301`, `:349-363`), cold rotator (`:303-344`), disk-file tiering (`b-disk-file-tiering.ts:127-208`).
- **Readers (8 executable files):** those four plus rehydrate (`b75-rehydrate.ts:105-146`), xStock archive capacity gate (`b-xstock-bar-availability-capacity-gate.ts:622-623`), moved-day check (`moved-day-check.ts:75`), and `perpfeed-gate-test.ts:108`. `archive-completeness.ts` documents the state rules but issues no query.
- **Deleter (exactly 1):** `perpfeed-gate-test.ts:139`, an operator gate cleanup path protected by the evidence foreign key; none of the four scoped production jobs deletes manifest rows.
- **Schedulers/starters:** the two installed root-cron entries and two manual/operator commands in §2. No module import starts work.

### 3.2 `data_archive_exact_evidence` and the proven-basis stamp

- **Evidence writers (3):** retention sweep (`:735`), context lane (`:265`), disk-file tiering (`b-disk-file-tiering.ts:197`).
- **Basis carrier, not evidence writer (1):** cold rotator copies the warm row's basis into the cold row (`b75-cold-rotator.ts:303-336`).
- **Readers:** the shared evidence writer/replay check (`exact-archive-evidence.ts:69-132`), the source recount (`:140-157`), the existence probe (`:160-166`), xStock capacity gate (`:622-623`) and rehydrate's manifest projection/sidecar output (`b75-rehydrate.ts:105-146`, `:320-370`).
- **Deleter:** no production delete of evidence. The manifest gate cleanup is refused while the evidence foreign key exists (`perpfeed-gate-test.ts:127-139`).
- **Trigger:** the database trigger checks that *an evidence row exists* for source+label before a `source-count-matched` stamp; it does not recount the current source. That is why the script-side recount is load-bearing.

### 3.3 Storage objects and source removal

| Lane | Creates/reads storage | Mutates manifest | Removes data | Terminal consumer |
|---|---|---|---|---|
| Retention | warm file upload/readback (`b75-retention-sweep.ts:667-675`) | pending → uploaded → verified → active | partition DROP (`:536-559`) or plain-table DELETE (`:1068-1258`) | manifest + rehydrate/future analytics |
| Context | warm upload/readback with 413 cold fallback (`context-bridge-log-ttl.ts:208-255`) | pending → verified → active | cutoff-wide batched source DELETE (`:322-363`), then VACUUM | manifest + rehydrate; currently manual only |
| Cold rotation | warm download, cold upload/readback (`b75-cold-rotator.ts:278-295`) | cold insert/upsert then warm `migrated` (`:297-344`) | warm object delete only at `:350` | cold rehydrate |
| Rehydrate | warm streamed download or cold download (`b75-rehydrate.ts:262-286`) | none | local mismatch rename + stale-sidecar removal only (`:288-318`) | operator/future analytics filesystem consumer |

At each tier boundary the writer and deleter are in the same lane. The harness must therefore execute the complete lane ordering; a test of a shared pure helper alone cannot prove that the remover waits.

## 4. Audit findings

### A1 — Importing any scoped script executes production work

All four files end in an unconditional `main().catch(...)`. Before the catch, their `main` paths construct real PostgreSQL clients and/or the singleton storage client; retention also acquires the live lock. There is no guarded entry predicate. This is the exact `#1208` gap and prevents safe behavioural imports. **Falls to P1.**

### A2 — The standing wiring instrument is source text

`b-b75-export-completeness.test.ts:39-59` reads the four source files and slices function bodies. Its runtime tests cover the pure decision, evidence writer, recount helper and gzip count, but the script claims at `:279-455` are presence/order assertions. The motivating mutation can leave those strings present while bypassing the gate. Static migration and closed-enumeration checks remain valid; executable safety claims do not. **Falls to P2–P6.**

### A3 — The context reuse path omits the required recount

This is a real, latent defect exposed by the audit, not a new architecture decision:

1. `decideExistingCopy` returns `reuse` for `verified + source-count-matched` (`archive-completeness.ts:78-88`), and `decisionNeeds` requests no row probe for that state (`:108-114`).
2. The context lane returns immediately on `reuse` (`context-bridge-log-ttl.ts:157-171`) without importing or calling `proofCountStillMatches`.
3. The wrapper still adds that month to its completed labels (`:420-438`), then deletes **all** source rows before the month-rounded cutoff (`:445-455`; delete loop `:322-346`).
4. The comparator lane does recount the current source against the stored proof before reuse (`b75-retention-sweep.ts:618-631`), using the shared helper (`exact-archive-evidence.ts:135-157`).
5. The System Manual requires the still-proven count for all four archive paths (`:12281-12283`), and the System Impact Map says the same at `:2555-2558`. The code is the contradicting object.

Current staging exposure is dormant, not clean evidence: all **6** context manifest rows are `unverified-legacy`; context has **0** evidence rows and therefore **0** proven reusable rows; the lane is unscheduled and its log is absent. The live source nevertheless has **4,291,152** rows from 2026-04-01 through 2026-11-10T23:31:28Z, so a future manual proven export followed by a crash can create the reachable `verified` resume state.

The safe-resume state (current count unchanged) and unsafe states (rows added/removed/replaced after proof) are all consistent with the current branch choice. Count equality does not prove row identity, but the approved rule is explicitly count-based; this batch enforces that rule rather than inventing a stronger one.

**Disposition:** fold into OBJ-3. Recount the current month before returning `reuse`; a mismatch throws `NonProvenExistingCopyError('reuse-count-changed', ...)`, so the wrapper never reaches source DELETE, active marking or VACUUM. No new issue, schedule, schema or policy.

`REVIEWER: claim-only · which objects settle whether a proven context month can be reused and later deleted without recounting the current source? · HIT: context returns reuse before the cutoff-wide delete and does not import the recount helper; runtime state is dormant · re-derived yes (exact code ref + retention positive control + DB/schedule controls)`

**Falls to P3.**

### A4 — Retention has two destructive shapes and one shared object gate

`archiveOneObject` makes the existing-copy decision before a pending write/upload (`b75-retention-sweep.ts:602-633`), writes evidence+basis+verified on the control transaction (`:730-745`), and returns an outcome. `processPartition` then applies whole/sliced completeness before DROP (`:790-992`). `sweepPlainTables` independently enumerates present days and gates its DELETE (`:1068-1258`). Faking only the exporter would miss both outer removers; the harness needs the clients/storage/alert/lock boundaries at the orchestration seams. **Falls to P2.**

### A5 — Context proof and delete are split across two functions

`exportAndUploadMonth` owns decision/export/readback/proof (`context-bridge-log-ttl.ts:151-315`), while `main` owns month enumeration and the later global delete (`:371-458`). A test of the inner function cannot prove that refusal or transaction failure prevents the outer delete. The Step-2 seam must include a month-run coordinator, not only export the existing inner function. **Falls to P3.**

### A6 — Cold rotation has correct ordering but no executable seam

Candidate selection excludes labels with an existing cold row (`b75-cold-rotator.ts:122-152`). The real path checks warm, writes+reads cold, inserts/upserts cold, marks warm migrated, and only then deletes warm (`:254-350`); per-candidate failures continue (`:352-364`). All of this lives inline in `main`, so the current test can only inspect strings. **Falls to P4.**

### A7 — Rehydrate mixes choice, transport, file safety and totals inside `main`

The manifest query normalises BIGINT fields to numbers (`b75-rehydrate.ts:105-146`) and the pure chooser is already tested, but download, checksum, rename, stale-sidecar removal, sidecar write, proven/unproven/mismatch totals and final exit remain inline (`:208-374`). The test seam must return a result to the thin wrapper instead of calling `process.exit` from the lane. **Falls to P5.**

### A8 — Runtime is healthy enough to refactor, but historical logs are not all-clean

- Retention log population: **162 starts / 162 DONE** over 3,077 lines; **4** historical `FAILED|fatal` matches. The latest **5 DONE** lines each have `failed=0`; the latest run examined/dropped 5, archived 120,893,215 bytes and deleted 137,760 plain rows.
- Cold rotator log population: **4 starts / 4 DONE / 0 `FAILED|fatal`** over Aug–Nov; each had `dry_run=false`, cold configured and zero candidates.
- Database positive control: **6,020** manifest rows and **5,448** evidence rows. Warm active population is **6,013**; warm active older than 365 days is **0**, explaining the rotator's zero-candidate runs.
- PM2 has exactly one app process (`dawntrader`, online); these four jobs are external CLI/cron processes, and the current PM2 tail contains trading activity rather than an archive invocation.

These observations establish current shapes and natural-run availability; they do not certify unexercised branches. **Falls to P7/P9.**

### A9 — Governance has two existing schedule contradictions

The System Impact Map inventory (`:2491`), Storage Policy (`:195`), live crontabs, absent context log and `#169` all say the context lane is not scheduled. The System Manual schedule table still presents `30 2 * * *` without marking it design-only (`:12292-12299`). The System Impact Map also contradicts itself: `:2504` says both context and cold rotation remain unscheduled, while `:2507` and the live root crontab show cold rotation installed and active. This batch installs neither schedule; Step 10 must correct the Manual's context status and the Impact Map's stale cold-rotation sentence while recording the new harness and context recount. **Falls to P10.**

### A10 — Canonical provenance is silent; git history supplies intent

`bridge/canonical/` predates B75 and has no lifecycle/archive/rehydrate/cold-rotation coverage; its only context match is the unrelated broadcaster. Git archaeology therefore controls:

- `f4e6a73f601521777925a62ab23e8ea79fc77616` introduced all four scripts and states the export→upload→readback→verify→remove order, month-rounded context delete, manifest-driven rehydrate and monthly warm→cold rotation.
- `0c22d02935b76602b059c1c535a58dba60af156b` introduced the retention O_EXCL lock and explicitly moved non-zero exit after `finally` release.
- `723a41c4233340759cafaf4d40bbedb57e59bf8e` records why the predecessor used source slicing to bind transaction connection/order.
- `2cf67da1f903f8d7a40cf518012ec1b3b6dcc936` added the reuse recount to the retention lane and helper but did not change the context lane—the historical source of A3.

**Falls to P1–P6 and P8.**

### A11 — Change class and safety boundary remain valid

The import guard, dependency seams, behavioural tests and A3 correction enforce documented behaviour. They add no schema, setting, schedule, provider, state or policy. Therefore `non_architecture` remains correct. Tests must use constructed fake clients/storage and private temporary folders only; no test may read staging credentials or call a real provider. **Falls to P7.**

## 5. Implementation plan — each item falls out of the audit

There are no `UNAUDITED` plan items.

### P1 — Shared direct-entry predicate and thin wrappers (← A1, A10)

Add one pure helper under `server/scripts/` that accepts `import.meta.url` plus an optional argv entry and compares it with `pathToFileURL(argvEntry).href`. It returns false when argv is absent. Each of the four scripts exports its runner and calls the direct wrapper only when the predicate is true. The wrapper alone retains fatal logging/alerting and exit-code mapping; importing performs no client/storage/file/lock/log/exit action.

### P2 — Retention orchestration seam and behavioural gates (← A2, A4, A10)

Export the existing retention lane types/functions needed by the harness and add an optional dependency bundle with production defaults for client construction, storage, exporter/evidence/recount calls, alerts, filesystem/clock and lock operations. Keep the shared decision/helpers as the only rule implementations. Execute with fakes:

1. decision before pending/upload;
2. reuse recount match and mismatch;
3. evidence → basis → verified on one control transaction;
4. whole/sliced proof set before DROP;
5. every present plain day proven before DELETE, then active mark;
6. keyed alert and resolve edges;
7. lock release before returned failure/fatal handling.

The production adapter preserves current clients, SQL, predicates, log text, actor/keys and return values.

### P3 — Context coordinator, missing recount and delete fence (← A3, A5, A9)

Create a testable context runner/coordinator with production-default dependencies and export the month lane. On `reuse`, call the existing `proofCountStillMatches` against quoted `context_bridge_log`, quoted `timestamp`, and the exact month `[start,end)` range. A false/no-proof result throws `NonProvenExistingCopyError('reuse-count-changed', ...)` before the month succeeds.

The coordinator collects a completed label only after export or safely recounted reuse. Any refusal, recount mismatch, checksum mismatch or transaction failure aborts before the cutoff-wide DELETE, active mark and VACUUM. Behavioural tests cover warm success, 413→cold, actual-tier proof, one-client transaction, rounded cutoff, partial-month retention, and outer-delete prevention. A mutation that bypasses the recount or catches-and-continues must fail.

### P4 — Cold-rotation candidate seam (← A2, A6, A10)

Extract/export a single-candidate rotation function plus a runner that continues after a candidate failure. Inject the manifest query client and storage interface. Test dry-run no-op, candidate exclusion, warm checksum, cold upload/readback checksum, inherited basis in insert/upsert, warm migrated update, and `deleteWarm` strictly last. Preserve argument validation, terminal DONE text and failure counting in the direct wrapper/runner.

### P5 — Rehydrate object/file seam (← A2, A7, A10)

Extract/export one chosen-label rehydrate lane with injected storage and file operations. Return a typed per-label result (`downloaded | skipped-cold | mismatch`, bytes, proven/unproven/mismatch rows) to the runner; the direct wrapper alone maps aggregate mismatch to exit 2. Test warm preference, migrated-warm fallback to cold, restore-cold refusal, checksum-matched sidecar, mismatch rename outside the good glob, stale good-sidecar removal, disk-file newline/byte checks, private output guard and numeric aggregation.

### P6 — Replace only executable structural assertions (← A2, A3–A7)

Add `server/tests/unit/b-b75-script-test-harness.test.ts`. Move the safety claims for the four runtime lanes out of `fnBody`/source-order assertions and into executed fake-I/O tests. Keep static migration text, closed enum, dead-transport and genuinely source-contract assertions in `b-b75-export-completeness.test.ts`. The existing pure decision/evidence/recount tests remain.

### P7 — Fake-I/O isolation and mutation proof (← A8, A11)

All clients/storage/files/alerts/exit paths are fakes. Temporary files live in one private directory per test and are removed in `finally`. Tests explicitly fail if production client/storage constructors are invoked. Required mutations: unconditional direct-run predicate; reuse recount bypass in retention and context; proof write on the wrong client/outside transaction; early DROP/DELETE; early warm delete; missing inherited basis; mismatch counted as proven; mismatch good-name/sidecar retained; alert key/resolve removed.

### P8 — Direct-run compatibility ledger (← A1, A6, A7, A10)

The Step-3 change list maps each old unconditional entry to the guarded wrapper and exported runner. Preserve exact four command forms, environment validation, flags, SQL predicates, state transitions, logs/DONE lines, keys/actors, exit codes, lock semantics, output naming and permissions. Re-run the production import/caller census at the implementation ref; the zero-import claim keeps the same positive control.

### P9 — Verification boundary (← A8, A11)

Step 7 is bounded fake-I/O execution evidence plus direct-wrapper/import probes. It does not force a real archive, delete, rotation, VACUUM or restore. If deployment naturally crosses the installed 02:15 retention or monthly rotator fire, record that run as an additional compatibility observation, never as substitute proof. The manual context lane and operator rehydrate remain uninvoked.

### P10 — Governance correction at Step 10 (← A9, A10)

Record the import-safe runners, executable harness and context reuse recount in the System Impact Map/System Manual. Correct the System Manual context row to “design command, not installed; `#169`”, and correct the System Impact Map sentence so only context remains unscheduled while cold rotation is installed. Do not change the Storage Policy's settled window or schedule either lane. Close `#1208` only after the full workflow; `#169` remains open and separate.

## 6. Behavioural verification matrix

| Objective | Executed positive control | Failure/mutation that must bite |
|---|---|---|
| OBJ-1 | direct path runs wrapper; different/absent path imports silently | unconditional predicate creates client/activity on import |
| OBJ-2 | proven unchanged reuse reaches removal; fully proven whole/plain sets remove source | changed recount, missing proof, early removal, wrong transaction client, missing alert/resolve |
| OBJ-3 | exported or safely recounted months reach rounded delete; 413 proof says cold | changed context recount, transaction/checksum failure, wrong tier, swallowed failure reaches delete |
| OBJ-4 | full cold readback + both manifest writes reaches warm delete | checksum fail, early delete, missing basis or candidate with cold row |
| OBJ-5 | matched file gets one sidecar and one total | mismatch retains good name/sidecar, enters proven total or returns success |
| OBJ-6 | executable tests fail with calls still present but gate bypassed | source strings remain while `true ||` bypasses behaviour |
| OBJ-7 | wrapper results/logs/flags match current contract | changed flag, exit, key, DONE, lock, name or permission |

Run order: new targeted harness → predecessor targeted files → every directly affected archive test → TypeScript baseline check → full Test Suite → Build → Docker Build. No structural assertion is retired until its behavioural replacement is green.

## 7. Plain-language summary

The four archive scripts are safe only when launched as commands; importing one launches the real job, which is why their most important safety wiring is still checked by reading text. The plan adds guarded entry points and controlled fake versions of the real database, storage and file boundaries, so the tests execute the deletion, rotation and restore decisions and prove that a bypass fails.

The audit also found one dormant safety hole in the manual context lane: a previously proven month can be reused without checking that the current month still has the proven row count, after which the outer job can delete it. This batch will add the already-documented recount before that delete, keep the lane unscheduled, and correct stale schedule wording in the System Manual and System Impact Map; no real archive action is required for verification.
