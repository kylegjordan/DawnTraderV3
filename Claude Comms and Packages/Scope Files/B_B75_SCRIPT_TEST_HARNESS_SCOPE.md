# B-B75-SCRIPT-TEST-HARNESS — SCOPE

change-class: non_architecture

**Batch:** `B-B75-SCRIPT-TEST-HARNESS` · **Issue:** `#1208` · **Owner:** CC-B / NEW Codex · **Reviewer:** Coltrane for this Codex shift · **Plan position:** `SPRINT_TO_LIVE_PLAN` pre-sprint stage 3, item 5, after `B-B75-EXPORT-COMPLETENESS` and before `B-XSTOCK-SNAPSHOT-RETENTION`.

## 0. Directive and boundary

`RUNNING_ISSUES #1208` records the accepted gap: the four B75 archive scripts call `main()` at import, so `b-b75-export-completeness.test.ts` proves important wiring by reading source text rather than executing the lanes. The pure archive decisions are already behaviour-tested; this batch makes the script entry points import-safe, exposes the existing orchestration lanes to tests, and executes their safety gates against fake clients and fake storage.

This is `non_architecture`: the hot/warm/cold architecture, manifest state machine, retention policy, schedules, storage providers, database schema, alert policy and CLI contracts do not change. The only production change is how direct script execution is distinguished from module import and how the existing lane functions receive test doubles; direct invocation must preserve current behaviour exactly.

## 1. Objectives and verification

### OBJ-1 — Import all four scripts without running them

Make these modules safe to import:

1. `server/scripts/b75-retention-sweep.ts`
2. `server/scripts/context-bridge-log-ttl.ts`
3. `server/scripts/b75-cold-rotator.ts`
4. `server/scripts/b75-rehydrate.ts`

Factor the repository's established ESM check (`import.meta.url` against `pathToFileURL(process.argv[1])`) into one small, pure direct-entry predicate because the census found several local implementations but no exported helper. Each script keeps a thin direct-run wrapper that alone maps a returned failure to the current process exit code and fatal log/alert behaviour. Importing a module must not create a database client, touch storage or files, acquire a lock, log a run, or exit the process.

**Verified by:**

- a test imports each of the four modules with database, storage, file and process-exit spies armed and observes zero lane activity;
- the predicate passes for an exact direct path and refuses a different or absent entry path;
- mutation proof: making the predicate unconditional causes the import-safety test to fail;
- the four real command forms remain the same (`npx tsx <script> ...`).

### OBJ-2 — Execute the retention sweep’s archive and delete gates

Export the existing retention-sweep lane seams (or equivalently narrow seams established at Step 2) and give them explicit fakeable dependencies. The harness must execute, rather than text-match, the load/decision/export/proof/drop-or-delete/alert chain for both the partitioned and plain-archive lanes.

**Verified by fake clients/storage:**

- an existing copy is decided before any pending write or upload;
- a proven reuse is recounted before it can authorize a drop;
- a changed recount refuses and performs no drop/delete;
- evidence, `source-count-matched`, `verified`, and commit occur on the same control client in that order;
- the partition is dropped only after every required label is proven;
- a plain-archive delete occurs only after every present day is proven, and labels become active only after the delete;
- checksum, count, refusal and other failures take their keyed alert path; success takes the matching automatic resolve edge; a fatal run keeps its existing fatal key;
- the run lock is released on success and failure, and the current non-zero result is returned only after release.

**Mutation proofs:** bypassing the reuse recount, moving a proof write outside the control transaction, permitting a drop/delete before proof, or removing the alert key/resolve edge must fail a behavioural test even if the old call text remains in the file.

### OBJ-3 — Execute the context-bridge month gate

Export `exportAndUploadMonth` (or the Step-2 equivalent) as a testable lane with fake clients and storage. Preserve its one-copy decision, warm-to-cold 413 fallback, exact evidence, verified stamp, month-rounded delete boundary and later active mark.

**Verified by fake clients/storage:**

- refuse and skip/reuse outcomes perform no upload or delete;
- the export path uploads, reads back, checks the checksum, records exact evidence, stamps the actual tier and verifies on one control transaction;
- the 413 path records `cold`, not `warm`, after a successful cold readback;
- a checksum mismatch or transaction failure leaves the month unverified and prevents the delete;
- the delete boundary remains the first instant of the cutoff month and a partial month is not deleted;
- mutation proof moves the verified update to the wrong client or changes the recorded tier and the harness fails.

### OBJ-4 — Execute the warm-to-cold rotation gate

Extract/export the candidate rotation lane from `b75-cold-rotator.ts` with fake storage and a fake manifest client. Argument parsing and the direct CLI wrapper remain separate from the lane.

**Verified by fake clients/storage:**

- a dry run performs no storage or manifest write and still produces the current terminal success result;
- real rotation checks the warm checksum, uploads cold, downloads cold, checks the cold checksum, inserts/updates the cold manifest row with the inherited completeness basis, marks warm migrated, and only then deletes warm;
- warm or cold checksum failure performs no warm delete and counts a failure while the next candidate can continue;
- an existing cold row remains excluded by candidate selection;
- `--limit` and `--warm-retention-days` keep their current meaning and validation;
- mutation proof moving `deleteWarm` before either manifest write, or dropping the inherited basis, fails.

### OBJ-5 — Execute the rehydrate choice and file-safety gate

Extract/export the manifest-row rehydrate lane from `b75-rehydrate.ts` with fake storage and file operations. The direct wrapper retains environment/argument validation and the private-output-directory guard.

**Verified by fake rows/storage/files:**

- the existing label chooser prefers a downloadable warm row, falls to cold when warm is migrated, and refuses cold download unless requested;
- a checksum-matched object writes the current sidecar and contributes to exactly one proven or unproven total;
- a checksum mismatch is renamed outside the good-name glob, removes a stale good sidecar, contributes only to the mismatch total and returns the current non-zero outcome;
- disk-file restore retains its byte/newline checks and private output rule;
- 64-bit database counts are numbers before aggregation;
- mutation proof allowing a mismatch into the proven total, retaining the good name, or downloading a migrated warm row fails.

### OBJ-6 — Retire structural assertions only where execution replaces them

Update `server/tests/unit/b-b75-export-completeness.test.ts` so the safety claims covered by OBJs 2–5 no longer depend on `fnBody`, source-order indices or call-text presence. Keep genuinely static contract checks only where no runtime behaviour is claimed (for example migration text or a closed enumeration), and move executable safety claims into `server/tests/unit/b-b75-script-test-harness.test.ts`.

**Verified by:**

- the new harness fails under the short-circuit class that motivated `#1208` (`true ||` before a real gate) even though the old call text is still present;
- the two existing baseline files remain green: at the scope ref they pass **66/66** tests (`62` export-completeness + `4` count-gate);
- the new file plus every directly affected B75 archive test passes, followed by the full test suite, TypeScript baseline gate, build and Docker build;
- no test connects to staging, Supabase Storage or Backblaze and no test writes outside a private temporary directory that it removes.

### OBJ-7 — Prove direct-run compatibility

The harness is not permission to redesign the jobs. Preserve the exact environment checks, command-line flags, query predicates, manifest transitions, log/DONE contracts, alert keys/actors, exit codes, run-lock behaviour, output naming and file permissions.

**Verified by:**

- direct-wrapper tests cover success, expected refusal/failure and fatal rejection for each script without calling a real external service;
- a before/after code-path table in the change list maps every old direct entry to its new wrapper and lane;
- a source census at the implementation ref shows no fifth archive script still importing one of these four for side effects and no cron command change;
- Step 7 uses bounded fake-I/O execution evidence only unless the pre-audit identifies a safe, already-scheduled natural run; this batch does not force a real archive, rotation, delete or restore.

## 2. Architectural read

### System Impact Map

The B75 inventory defines the four touched scripts and their live roles:

- retention sweep: the scheduled hot-to-warm export, exact proof and drop/delete fence;
- context-bridge lane: a separate, currently manual month export, delete and VACUUM path;
- cold rotator: the scheduled warm-to-cold move with readback verification;
- rehydrate CLI: the manifest reader for warm/cold recovery and future analytics.

The same section states the forward couplings: future analytics wrap rehydrate; every tier boundary is move-not-delete; the sweep’s proof governs whether a hot source may be removed. Its change checklist also binds storage-provider changes to rehydrate parsing. Therefore the blast radius is the archive safety boundary, not the trading hot path: a testability refactor must be runtime-equivalent because a wiring error can either destroy the only hot copy or strand data on the expensive tier.

### System Manual

The Data Lifecycle Policy names `data_archive_manifest` as the single source of truth and says only `source-count-matched` is proven. A source may be dropped/deleted or a copy reused only against a verified, proven row whose count still matches. The rule governs the sweep’s whole, sliced and plain-archive lanes plus the context-bridge lane; rehydrate must carry the basis to its consumer. The harness therefore tests those gates as behaviour and does not create a second decision implementation.

### Caller, cadence and dependency surface

- The four scripts are top-level executable modules. Their production callers are their documented direct commands: nightly retention, manual context-bridge, monthly cold rotation, and operator/future-scheduler rehydrate.
- The change does not add a runtime caller. Tests become the only import callers.
- The scripts depend on PostgreSQL clients, the shared storage client, completeness/evidence helpers, file operations and process exit/logging. Those dependencies are injected or wrapped only at the orchestration seam; the shared decision helpers remain the single implementation.
- No client route, dashboard, active trading loop, migration or module constant is changed.

## 3. Provenance read

### Corpora searched

Searched at `HEAD`: `BATCH_CATALOG`, `RUNNING_ISSUES`, all batch completion reports, the B75 System Impact Map/System Manual sections, the predecessor scope/pre-audit/change list/completion report, the count-gate scope/note/test, and `git log -S` without a path limit for `runSweep`, `exportAndUploadMonth`, `listCandidates` and `queryManifest`. `git log --follow --name-status` for all four current paths found each introduced under its current filename and no former script filename. The capability census for `import.meta.url`, `pathToFileURL`, `isDirectRun`, `isMain` and `process.argv[1]` found established local entry checks (including `scripts/check-tsc-baseline.mjs`, `scripts/governance-checker/census.mjs` and `server/scripts/b-xstock-bar-availability-capacity-gate.ts`) but zero exported entry helpers under `scripts/` or `server/scripts/`; this batch reuses that mechanism rather than inventing a different check.

### Tier 1 — behaviour whose boundary changes

All four scripts were introduced together by `f4e6a73f601521777925a62ab23e8ea79fc77616`. The introducing commit says, verbatim:

> “B75 Step 3 ship: tiered hot/warm/cold storage architecture”

and records these exact intentions:

> “B74 export-then-drop fence: insert pending -> snapshot+export -> upload -> re-read+verify -> manifest verified -> DROP -> active”

> “Month-grouped export of unpartitioned table”

> “DELETE rounded to month-start (Langston B2 fix: never drop partial-month rows that haven't been archived)”

> “Manifest-driven CLI: --table/--from/--to/--out [--restore-cold]”

> “Monthly warm->cold rotation; dry-run when B2 creds missing OR cold_rotator_dry_run=true (default)”

The retention runner’s lock/finally seam was introduced by `0c22d02935b76602b059c1c535a58dba60af156b`, whose message says verbatim:

> “Plus a run-lock (O_EXCL) so a long first-tiering pass can't overlap the next day's trigger (Langston Step-2 cond B) — released in finally (runSweep returns the failure flag; process.exit moved after release so it can't bypass the lock cleanup).”

The predecessor’s structural-test intent is explicit in `723a41c4233340759cafaf4d40bbedb57e59bf8e`, verbatim:

> “The test now slices exportAndUploadMonth, asserts one BEGIN and one COMMIT, and requires the UPDATE on ctlClient inside them; the mutation (UPDATE on exportClient) is caught.”

**Disposition for each of the four scripts: (2) relevant but needs updating to today’s intent.** The archive/restore behaviour remains correct; unconditional import-time execution prevents the executable harness that `#1208` now requires. The update is an import boundary and dependency seam, not a new archive rule.

**Disposition for the predecessor’s structural wiring assertions: (2) relevant but needs updating to today’s intent.** Their claims remain important, but execution against fakes is the standing instrument; source text is not sufficient after the measured short-circuit mutation.

### Tier 2 — dependencies read or called, behaviour unchanged

| Dependency | Original/current intent | Disposition |
|---|---|---|
| `archive-completeness.ts` | One decision for reuse/export/skip/refuse and the canonical proof/alert classes. | **(1) still relevant and correct** |
| `exact-archive-evidence.ts` | Persist source = exported = downloaded evidence before a proven manifest stamp. | **(1) still relevant and correct** |
| `partition-exporter.ts` | Export under one read-only repeatable snapshot and refuse count mismatch. | **(1) still relevant and correct** |
| `storage-client.ts` | Single warm/cold transport implementation with readback checks and streaming where supported. | **(1) still relevant and correct** |
| `system-alerts.ts` | Mint and resolve keyed sweep failures under the archive script’s machine actor. | **(1) still relevant and correct** |
| `data_archive_manifest` | Crash-recovery and rehydrate seam for all tiers; state and basis remain authoritative. | **(1) still relevant and correct** |

No dependency is disconnected or slated for reconnection/removal, so dispositions (3), (4) and (5) do not apply.

## 4. Existing capability and decision census

1. `b-b75-count-gate.test.ts` already proves the exporter with a fake client. Reuse that style; do not invent a second fake-query language.
2. `b-b75-export-completeness.test.ts` already contains 62 passing tests for the pure decision/evidence helpers plus source-structure assertions. Keep the pure behavioural coverage and replace only the executable wiring claims.
3. The repository already uses the robust `pathToFileURL(process.argv[1])` direct-entry comparison. The new shared predicate is only a reusable home for that exact capability across these four modules.
4. `#1208` is the existing, placed home. No new issue or batch is owed.
5. `#169` remains the separate context-bridge scheduling/streaming matter. This batch does not schedule that lane or replace its buffered transport.
6. The predecessor’s Step-7 and completion report explicitly name the live paths it did not exercise; this batch closes the test-instrument gap, not those historical observations.

## 5. Files in scope

Expected implementation set, subject to Step-2 census:

- `server/scripts/b75-retention-sweep.ts`
- `server/scripts/context-bridge-log-ttl.ts`
- `server/scripts/b75-cold-rotator.ts`
- `server/scripts/b75-rehydrate.ts`
- one shared pure direct-entry helper under `server/scripts/` (new; exact name settled at Step 2)
- `server/tests/unit/b-b75-script-test-harness.test.ts` (new)
- `server/tests/unit/b-b75-export-completeness.test.ts`

Governance and workflow records are added only at their required later steps.

## 6. Explicit non-goals

- No database migration, manifest column, retention window, storage bucket/provider, schedule or module constant.
- No real archive, delete, rotation, VACUUM or rehydrate run merely to satisfy a test.
- No recovery of the historical unproven objects; Kyle’s no-recovery decision remains settled.
- No scheduling of `context-bridge-log-ttl.ts`; that remains `#169`.
- No rewrite of the pure completeness decision, exporter, storage transport or evidence writer.
- No promise to convert unrelated script source tests elsewhere in the repository.

## 7. Safety and rollback

The primary risk is accidental execution during import or an injected fake not matching the real dependency order. Tests must arm their spies before import, use fresh module loading, and prove the negative path by mutation. Production wrappers remain thin and direct-run-compatible; a rollback removes the helper/harness seams and restores the prior direct call without any data rollback because this batch changes no schema or stored state.

No test may use staging credentials. Temporary files use a private test directory and are removed in the same test lifecycle.

## 8. Step boundary

Step 1 ends only when Coltrane approves this scope at an exact pushed ref. Step 2 then performs the full component/state-write census and may narrow function boundaries, but it may not weaken the objectives or substitute source-text assertions for executed gate behaviour.
