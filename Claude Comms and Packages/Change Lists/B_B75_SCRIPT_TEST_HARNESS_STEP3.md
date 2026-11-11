# B-B75-SCRIPT-TEST-HARNESS — STEP 3 CHANGE LIST

**Batch:** `B-B75-SCRIPT-TEST-HARNESS` · **Issue:** `#1208` · **Change class:** `non_architecture` · **Plan:** `Scope Files/B_B75_SCRIPT_TEST_HARNESS_PRE_AUDIT.md` P1–P9.

**ROUND-2 IMPLEMENTATION REF:** `0fcc54a71da11a0a1cfb3300110e82d58f311fea` (the review ref additionally carries this evidence-only update; the dispatch names that final exact ref).

## Step-4 dispatch header

**DECLARED CHANGE-CLASS:** `non_architecture`

**STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_B75_SCRIPT_TEST_HARNESS_PRE_AUDIT.md`

The document-set census below is the state at Step 4. Rows whose work belongs to Steps 10–11 are deliberately marked absent rather than silently treated as complete.

| document-set row | state at the review ref |
|---|---|
| batch `SCOPE` | **present** — `Claude Comms and Packages/Scope Files/B_B75_SCRIPT_TEST_HARNESS_SCOPE.md` |
| batch `PRE_AUDIT` | **present** — `Claude Comms and Packages/Scope Files/B_B75_SCRIPT_TEST_HARNESS_PRE_AUDIT.md` |
| `COMPLETION_REPORT` | **absent** — Step 11 has not run |
| `BATCH_CATALOG.md` | **absent** — required Step-10 update has not run |
| `PHASE_HISTORY.md` | **absent** — required Step-10 update has not run |
| `SYSTEM_MANUAL.md` | **judged applicable; absent** — Step 10 must correct the context job's design-only schedule and record the recount gate |
| `SYSTEM_IMPACT_MAP.md` | **judged applicable; absent** — Step 10 must record the four import-safe command seams and correct the stale cold-rotation schedule sentence |
| `CHANGES_AND_FIXES.md` | **judged applicable; absent** — Step 10 must record the context reuse-count defect and correction |
| `RUNNING_ISSUES.md` | **present** — issue `#1208` has its existing home; closure annotation waits for Step 10 |
| `POST_AUDIT_ROADMAP.md` | **judged N/A** — no phase-level roadmap order changed |
| `DELETED_COMPONENTS_LOG.md` | **judged N/A** — no component was removed |
| `ADJUSTMENT_FRAMEWORK.md` | **judged N/A** — no governed parameter or adjustment rule changed |
| `PHASE_19_PLAN.md` | **N/A** — this is not a `P19-*` batch and has no in-flight row there |
| active `SPRINT_TO_LIVE_PLAN.md` | **present** — the stage-3 row and detailed sequence both name this batch; status update waits for Step 10 |
| shared `MEMORY.md` | **absent** — required closure sync waits for Step 10 |
| own `MEMORY_CC_B.md` | **present** — current position records Step 4 and the exact implementation ref |
| Coltrane/Langston `MEMORY.md` | **absent** — required net-zero closure sync waits for Step 10 |
| own `CC_B_SESSION_TASK_LIST.md` | **present** — row records Step 4 and the exact implementation ref |
| other three session task lists | **judged N/A** — this is CC-B's batch and no other owner's queue changed |
| delivery-board `Observation` column | **judged N/A** — the scope restricts verification to fake I/O and command/import probes, with no production observation window |
| `AUTHORITY_BASELINE.md` | **judged N/A** — no authority boundary changed |
| `STORAGE_POLICY.md` | **judged N/A** — no hot/warm/cold retention or tier policy changed; existing transitions are only made executable under fakes |
| `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | **judged N/A** — no B78–B81 or xStock-calibration assumption changed |
| `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | **judged N/A** — no asset-class onboarding learning surfaced |
| `BUILD_METHOD_PLAYBOOK.md` | **judged N/A** — no crew role, workflow gate, or stable build method changed |
| `LANGSTON_ARCHITECTURE.md` | **judged N/A** — the reviewer's runtime and read path did not change |
| `CLAUDE.md` / `CONDUCT.md` | **judged N/A** — no stable rule changed |
| `_archive/CLAUDE_MD_RULE_HISTORY.md` | **judged N/A** — no `CLAUDE.md` rule changed |
| `MISTAKE_PATTERNS.md` | **judged N/A** — no `MISTAKE:` trailer or weekly pass occurred |
| `GOVERNANCE_EXCEPTIONS.md` | **judged N/A** — Kyle granted no exception |
| `ALERT_HANDLING_PROTOCOL.md` | **judged N/A** — alert ack/resolve semantics did not change |
| `DELIVERY_BOARD_PROTOCOL.md` | **judged N/A** — board fields and ownership did not change |
| `CLAUDE_CODE_FEATURE_WATCH.md` | **judged N/A** — no daily feature/model check ran |

## Step-4 round 1 — SENT BACK and disposition

Coltrane returned **SENT BACK** at exact ref `be3948cab048e4599dce4fe1a49ba780cdf83f23`. No point is hidden or downgraded:

1. **Separate-client context TOCTOU — fixed.** Every admitted month now carries a final deletion guard. The source table is write-locked, every proven month is recounted (and every earlier empty skip is rechecked), then cutoff DELETE and active marking run in one transaction on one client. A mismatch rolls back before deletion; VACUUM remains after commit because PostgreSQL forbids it inside a transaction.
2. **Approved harness population missing — fixed in the round-1 correction.** That correction had 36 cases: 2 direct-entry/fresh-import, 12 four-command CLI contracts, 10 retention, 6 context, 3 cold-rotation and 3 rehydrate. The retention population executes whole-partition and plain-archive orchestration through remove plus keyed resolve/alert edges. The fresh-import case arms database/storage/file/alert/exit spies before resetting and importing all four modules.
3. **Context delete/active client boundary changed — fixed.** The production adapter again uses one connected client for DELETE and active marking; the final proof and lock now share that client as well.
4. **Direct-entry predicate sound, declared gates missing — fixed by items 1–3.** The predicate remains unchanged and every command wrapper now executes success, environment-refusal and fatal-rejection contracts through fakes.
5. **Ambiguous rehydrate proof result — fixed.** `RehydrateObjectResult` is now discriminated: only `downloaded` can carry `basisProven`; `mismatch` cannot carry any proof boolean. The CLI can therefore aggregate proven rows only from the downloaded arm.

## Step-4 round 2 — SENT BACK and disposition

Coltrane returned **SENT BACK** at exact ref `48021b5ba1ee5fea187bc6c96c69b970703c03c3`. Both points are preserved and closed in this correction:

1. **Locked guards did not cover a newly inserted, previously unenumerated old month — fixed.** After taking the source write lock, the finalizer now re-derives every UTC month label reachable by the cutoff-wide DELETE and requires that complete set to be covered by the guards before it recounts, deletes or marks active. A fake insertion of an unenumerated older month produces `BEGIN → LOCK → population → ROLLBACK`; delete and active marking remain unreachable.
2. **Remaining cold/rehydrate gates were unexecuted — fixed.** The harness now has 42 cases. The cold lane executes `data_lifecycle.cold_rotator_dry_run`, both positive-integer CLI flags, oldest-first limit behavior and invalid-value refusal. Rehydrate executes the private-output rule, `--disk-file` byte/newline restoration, numeric aggregation, mismatch-only accounting and exit 2. The old source-text aggregate/exit assertion is removed.

## Load-bearing diff excerpts

### A. Importing a command no longer executes it

**BEFORE — unconditional process entry:**

```ts
main().catch(async (err) => {
  console.error('[B75 sweep] fatal:', err);
  await raiseSweepAlert(
    'B75 retention sweep CRASHED',
    `The nightly storage archive sweep crashed before completing. No partition is left half-dropped ` +
      `(DROP only happens after verify). Reason: ${err instanceof Error ? err.message : String(err)}`,
    'critical',
    { fatal: true },
    FATAL_ALERT_KEY,
  );
  process.exit(1);
});
```

**AFTER — the same CLI/fatal contract behind one shared entry predicate and an executable process wrapper:**

```ts
export async function runRetentionSweepProcess(deps = productionDeps): Promise<void> {
  try {
    await deps.runCli();
  } catch (err) {
    console.error('[B75 sweep] fatal:', err);
    await deps.raiseAlert(
      'B75 retention sweep CRASHED',
      `The nightly storage archive sweep crashed before completing. No partition is left half-dropped ` +
        `(DROP only happens after verify). Reason: ${err instanceof Error ? err.message : String(err)}`,
      'critical',
      { fatal: true },
      FATAL_ALERT_KEY,
    );
    deps.exit(1);
  }
}

if (isDirectEntry(import.meta.url)) {
  void runRetentionSweepProcess();
}
```

### B. A reused context month must pass the exact-range recount

**BEFORE — `reuse` returned without re-reading the source population:**

```ts
if (decision.kind === 'skip' || decision.kind === 'reuse') {
  console.log(
    `[B75 ctx-bridge] ${month.label}: ` +
      `${decision.kind === 'skip' ? decision.reason : 'proven copy reused'} (skipped)`,
  );
  return { rowCount: 0, bytesCompressed: 0 };
}
```

**AFTER — the stored proof is compared with the current exact month, and its identity is carried to the final boundary:**

```ts
if (decision.kind === 'reuse') {
  const same = await deps.proofCountStillMatches(ctlClient, existing!.id, {
    target: `"${SOURCE_TABLE}"`,
    tsCol: `"${TS_COLUMN}"`,
    rangeStart: month.start,
    rangeEnd: month.end,
  });
  if (!same) {
    throw new NonProvenExistingCopyError('reuse-count-changed', SOURCE_TABLE, month.label);
  }
  console.log(`[B75 ctx-bridge] ${month.label}: proven copy reused after source recount (skipped)`);
  return {
    rowCount: 0,
    bytesCompressed: 0,
    deletionGuard: { kind: 'proven-count', manifestId: existing!.id, month },
  };
}
```

### C. The cutoff-wide delete is behind one executable all-month fence

**BEFORE — orchestration was embedded in `main`:**

```ts
for (const month of monthsToExport) {
  const { rowCount, bytesCompressed } = await exportAndUploadMonth(
    exportClient, ctlClient, cfg, month,
  );
  totalArchivedRows += rowCount;
  totalArchivedBytes += bytesCompressed;
  monthLabels.push(month.label);
}
const r = await deleteOldRows(delClient, cfg, deleteCutoff);
await markMonthsActive(delClient, monthLabels);
await vacuumTable(vacClient);
```

**AFTER — every admitted month is rechecked under one source-write lock, then delete and active marking share one transaction and client:**

```ts
for (const month of months) {
  const result = await deps.archiveMonth(month);
  archivedRows += result.rowCount;
  archivedBytes += result.bytesCompressed;
  completedLabels.push(month.label);
  deletionGuards.push(result.deletionGuard);
}

const { deleted } = await deps.finalize(deleteCutoff, completedLabels, deletionGuards);
await deps.vacuum();
return { archivedRows, archivedBytes, deleted, completedLabels };
```

The production `finalize` adapter opens one client. Its implementation runs `BEGIN`, locks `context_bridge_log` against source writes, re-derives the complete UTC-month set selected by `timestamp < deleteCutoff`, rejects any label absent from the guards, rechecks each guard, calls the existing batched delete, marks the same completed labels active, and commits. Any population, guard, delete or mark failure rolls the transaction back; VACUUM starts only after that client has committed.

### D. The new test drives the failure edge, not its source text

```ts
await expect(finalizeContextDeletion(
  client, cfg, cutoff, [month.label], [guard], deps,
)).resolves.toEqual({ deleted: 3 });
expect(events).toEqual([
  'BEGIN',
  'LOCK TABLE context_bridge_log IN SHARE ROW EXCLUSIVE MODE',
  'proof', 'delete', 'active', 'COMMIT',
]);

proofMatches = false;
await expect(finalizeContextDeletion(
  client, cfg, cutoff, [month.label], [guard], deps,
)).rejects.toBeInstanceOf(NonProvenExistingCopyError);
expect(events).toEqual([
  'BEGIN',
  'LOCK TABLE context_bridge_log IN SHARE ROW EXCLUSIVE MODE',
  'proof', 'ROLLBACK',
]);

await expect(finalizeContextDeletion(
  client, contextCfg, month.end, [month.label], [guard], {
    listDeletePopulationLabels: vi.fn(async () => ['2025-12', month.label]),
    proofCountStillMatches: vi.fn(),
    rowsPresent: vi.fn(),
    deleteRows,
    markActive,
  },
)).rejects.toThrow('unguarded month(s): 2025-12');
expect(deleteRows).not.toHaveBeenCalled();
expect(markActive).not.toHaveBeenCalled();
```

## Judgement calls for review

**Fresh-reader disposition:** The approved rule remains count-based, so count-equal identity replacement is the recorded scope boundary from pre-audit A3. The reader's separate-client time-of-check/time-of-use HIT was re-derived and Coltrane ruled it blocking. The correction does not hold a transaction across export: it starts only at the destructive boundary, excludes new source writes, rechecks the stored count or earlier empty state, then contains DELETE and active marking on the same client. VACUUM remains outside because it cannot run in a PostgreSQL transaction.

`REVIEWER: claim-only · name the objects that settle whether a proven reused context month can reach delete/active/VACUUM only while its exact-range recount still matches, and name other states consistent with them · HIT — count equality permits identity replacement, and separate clients permit post-recount source mutation before delete; earlier-month side effects and post-delete mark/VACUUM failures are also non-atomic states · re-derived yes (pre-audit A3/P3 plus the first exact implementation ref 8fd2f526fec7d6f1c43625d28ff269f1dd78d120; count identity remains the approved boundary, separate-client TOCTOU is fixed in this corrected ref)`

1. Attack whether the locked UTC-month population query covers every row reachable by the cutoff-wide DELETE, including an empty first enumeration followed by a backdated insert, while preserving the deliberate count-equal identity boundary.
2. Attack whether `SHARE ROW EXCLUSIVE`, the complete-population check and the per-guard recount/empty checks share the same client and transaction as DELETE→active, with VACUUM only post-commit.
3. Attack whether the fresh-import probe is genuinely fresh and arms all database/storage/file/alert/exit fakes before module evaluation.
4. Attack whether the partition/plain success and failure cases execute the real orchestration and keyed resolve/alert edges, rather than only helpers.
5. Attack whether the cold dry-run and both CLI flag tests execute the production-default helpers and preserve zero-mutation/oldest-first/positive-integer behavior.
6. Attack whether rehydrate's private-output, `--disk-file`, aggregate and exit-2 tests execute the production helpers, and whether the discriminated result prevents a mismatch from becoming proven.

## 1. Direct-run compatibility ledger

The command forms are unchanged:

| Command | Previous entry | New entry | Preserved contract |
|---|---|---|---|
| `npx tsx server/scripts/b75-retention-sweep.ts` | unconditional `main()` | guarded `runRetentionSweepProcess()` → `runRetentionSweepCli()` | environment validation, O_EXCL lock, alerts, terminal DONE text, non-zero failure after lock release |
| `npx tsx server/scripts/context-bridge-log-ttl.ts` | unconditional `main()` | guarded `runContextBridgeLogTtlProcess()` → `runContextBridgeLogTtlCli()` | configuration, month-rounded cutoff, warm→cold 413 fallback, same-client locked delete/active then VACUUM, terminal DONE text |
| `npx tsx server/scripts/b75-cold-rotator.ts [--limit N] [--warm-retention-days D]` | unconditional `main()` | guarded `runColdRotatorProcess()` → `runColdRotatorCli()` | both flags, dry-run rules, candidate order, per-item continuation, terminal DONE text and failure exit |
| `npx tsx server/scripts/b75-rehydrate.ts --table … --from … --to … --out … [--restore-cold] [--disk-file]` | unconditional `main()` | guarded `runRehydrateProcess()` → `runRehydrateCli()` | private-output validation, tier selection, names/permissions, sidecars, totals, mismatch exit 2 and fatal exit 1 |

`server/scripts/direct-entry.ts` is the single shared predicate. It compares `import.meta.url` with `pathToFileURL(process.argv[1]).href` and returns false when the argv entry is absent. Importing any of the four modules now performs no database-client construction, storage call, lock/file/log action, or process exit.

The implementation census found **0 production import statements** for the four executable modules. Its broader filename-reference control found only **2 production comment references** (`b74-create-daily-partitions.ts` and `sweep-slicing.ts`), so those were classified rather than silently counted as callers. The companion-module positive control found **6 production files** referencing `archive-completeness.ts`; all six are real importers.

## 2. Executable seams and production adapters

- Retention exports the existing object lane, whole/sliced partition coordinator, keyed partition settlement, plain-table coordinator, transactional DROP/active gate, plain-table removal coordinator, proof-set evaluator and lock wrapper. Production calls still use the same PostgreSQL, storage, evidence, exporter, alert and filesystem implementations; tests substitute only explicit dependencies.
- Context exports the month lane, outer cycle and final destructive boundary. A `reuse` first invokes the existing exact-range source recount; every success also carries a final guard. The finalizer begins a transaction on one client, excludes source writes, re-derives the complete UTC-month population reachable by the cutoff DELETE, refuses any unguarded label, rechecks every proven or earlier-empty guarded month, then executes cutoff-wide DELETE and active marking before commit. VACUUM is post-commit.
- Cold rotation exports candidate selection, one-candidate rotation and the continue-on-failure runner. Warm deletion occurs only after warm checksum, cold upload/readback, cold manifest write carrying `completeness_basis`, and warm `migrated` update.
- Rehydrate exports a discriminated per-label lane. It returns `downloaded`, `skipped-cold`, `mismatch`, or an explicit non-download `skipped` result; only `downloaded` can carry `basisProven`. The CLI aggregates totals and maps any mismatch to exit 2. A mismatch remains outside the good-name glob, removes the stale good sidecar, and contributes to neither proven nor unproven totals.

## 3. Behavioural harness

`server/tests/unit/b-b75-script-test-harness.test.ts` executes the real exported gates with fake clients/storage and private temporary folders. Its **42** cases cover:

- 2 direct-entry/import cases: match/mismatch/absent argv, plus a fresh module-cache reset where database, storage, file, alert and exit spies are armed before all four imports;
- 12 CLI cases: success, missing-setting refusal and fatal rejection for each of the four commands, including retention's fatal-key alert;
- 10 retention cases: reuse recount mismatch, evidence→basis→verified transaction order, DROP/active rollback, full proven-label set, bounded plain deletion, lock release, whole-partition archive→drop→active→resolve, partition failure→alert, plain archive→proof gate→delete→active→VACUUM→resolve, and plain failure→alert with no delete;
- 7 context cases: reuse recount, 413 proof at the actual cold tier, outer month fence, completed-month finalizer handoff, same-client locked population/recount→delete→active with rollback on count change, locked recheck of an earlier empty skip, and refusal of an unenumerated old month in the locked delete population;
- 5 cold-rotation cases: configured dry-run zero-mutation result, positive-integer flag meaning/refusal plus oldest-first limiting, candidate exclusion/window selection, warm/cold checksums plus inherited manifest basis with both manifest writes before warm deletion, and continue-after-failure;
- 6 rehydrate cases: good-file sidecar, private-output enforcement, `--disk-file` byte/newline restore, mismatch quarantine/stale-sidecar removal with no proof field, cold refusal without `--restore-cold`, and numeric aggregate/mismatch exit 2.

The predecessor suite remains as a compatibility alarm for exact SQL/log/key/CLI shapes; it is no longer the safety proof for the executed gates.

## 4. Local verification at the corrected Step-4 worktree

- The dedicated executable harness passed **42 of 42 cases in 1 test file**.
- The affected compatibility population passed **226 of 226 cases across 11 test files**: the B75 count/completeness/harness set plus the eight directly adjacent retention, heartbeat, trade-tier and xStock archive-observation files selected in the review command.
- `check-tsc-baseline.mjs` measured **324 current TypeScript errors against the repository baseline population of 324**, with no new or changed error identity.
- `git diff --check` returned clean over the **8 tracked round-2 correction/boundary files**. The user-owned untracked `.claude/launch.json` is outside the batch and is not staged.

These are pre-commit local controls. The corrected exact ref still requires all four GitHub CI jobs before redispatch; the review request will name that run and each job result.

## 5. Safety boundary

All new tests construct fakes and private local temporary directories. They do not read staging credentials and cannot connect to staging PostgreSQL, Supabase Storage, or Backblaze. Step 7 remains bounded to fake-I/O execution plus command/import probes; it does not authorize a real archive, delete, rotation, VACUUM, or restore.

The context recount is enforcement of the settled System Manual/System Impact Map rule, not a new policy or schedule. `#169` remains the separate home for whether the context job is installed.
