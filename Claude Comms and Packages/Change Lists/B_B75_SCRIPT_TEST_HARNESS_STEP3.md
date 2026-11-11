# B-B75-SCRIPT-TEST-HARNESS — STEP 3 CHANGE LIST

**Batch:** `B-B75-SCRIPT-TEST-HARNESS` · **Issue:** `#1208` · **Change class:** `non_architecture` · **Plan:** `Scope Files/B_B75_SCRIPT_TEST_HARNESS_PRE_AUDIT.md` P1–P9.

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

**AFTER — the same CLI/fatal contract behind one shared entry predicate:**

```ts
if (isDirectEntry(import.meta.url)) {
  runRetentionSweepCli().catch(async (err) => {
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

**AFTER — the stored proof is compared with the current exact month before success:**

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
  return { rowCount: 0, bytesCompressed: 0 };
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

**AFTER — any archive/recount throw rejects before all three destructive calls:**

```ts
for (const month of months) {
  const result = await deps.archiveMonth(month);
  archivedRows += result.rowCount;
  archivedBytes += result.bytesCompressed;
  completedLabels.push(month.label);
}

const { deleted } = await deps.deleteRows(deleteCutoff);
await deps.markActive(completedLabels);
await deps.vacuum();
return { archivedRows, archivedBytes, deleted, completedLabels };
```

### D. The new test drives the failure edge, not its source text

```ts
const deps = contextDeps({ proofCountStillMatches: vi.fn().mockResolvedValue(false) });
await expect(exportAndUploadContextMonth(
  {} as never, ctl as never, contextCfg, month, deps,
)).rejects.toBeInstanceOf(NonProvenExistingCopyError);
expect(deps.proofCountStillMatches).toHaveBeenCalledWith(
  ctl, 'ctx-1', expect.objectContaining({
    target: '"context_bridge_log"', tsCol: '"timestamp"',
    rangeStart: month.start, rangeEnd: month.end,
  }),
);
expect(deps.exportPartition).not.toHaveBeenCalled();
```

## Judgement calls for review

**Fresh-reader disposition:** The approved rule is count-based, so equal counts with replaced row identity are an explicit scope boundary already recorded in pre-audit A3. The reader also exposed a separate time-of-check/time-of-use question: the exact-range recount and the later cutoff-wide delete use different database clients with no shared transaction or lock, so source rows can change after a successful recount and before deletion. This batch does not silently introduce a long-running transaction or lock across export, batched deletion and VACUUM; Coltrane must rule whether the existing count-based rule accepts that window or whether it blocks this review.

`REVIEWER: claim-only · name the objects that settle whether a proven reused context month can reach delete/active/VACUUM only while its exact-range recount still matches, and name other states consistent with them · HIT — count equality permits identity replacement, and separate clients permit post-recount source mutation before delete; earlier-month side effects and post-delete mark/VACUUM failures are also non-atomic states · re-derived yes (pre-audit A3/P3 plus exact implementation adapters at 8fd2f526fec7d6f1c43625d28ff269f1dd78d120; count identity is the approved boundary, separate-client TOCTOU is sent to Coltrane)`

1. Rule on the separate-client time-of-check/time-of-use window above: does it violate the settled count-based recount rule, or is it an accepted limit that should be recorded without adding a long transaction/lock? Also attack whether extracting the defaulted dependency bundles otherwise changes production execution around delete, active marking and VACUUM.
2. Attack whether `isDirectEntry(import.meta.url)` preserves all four established `tsx path/to/script.ts` command surfaces on Linux while remaining import-safe.
3. Attack whether returning `proven: true` on a checksum-mismatch result is correctly bounded by `kind: 'mismatch'` and exclusion from both CLI aggregates, or whether that type shape can mislead a future caller.
4. Attack whether the fake-I/O seams reach every destructive gate without making a real database, Supabase or Backblaze call possible from the harness.

## 1. Direct-run compatibility ledger

The command forms are unchanged:

| Command | Previous entry | New entry | Preserved contract |
|---|---|---|---|
| `npx tsx server/scripts/b75-retention-sweep.ts` | unconditional `main()` | guarded `runRetentionSweepCli()` | environment validation, O_EXCL lock, alerts, terminal DONE text, non-zero failure after lock release |
| `npx tsx server/scripts/context-bridge-log-ttl.ts` | unconditional `main()` | guarded `runContextBridgeLogTtlCli()` | configuration, month-rounded cutoff, warm→cold 413 fallback, delete/active/VACUUM sequence, terminal DONE text |
| `npx tsx server/scripts/b75-cold-rotator.ts [--limit N] [--warm-retention-days D]` | unconditional `main()` | guarded `runColdRotatorCli()` | both flags, dry-run rules, candidate order, per-item continuation, terminal DONE text and failure exit |
| `npx tsx server/scripts/b75-rehydrate.ts --table … --from … --to … --out … [--restore-cold] [--disk-file]` | unconditional `main()` | guarded `runRehydrateCli()` | private-output validation, tier selection, names/permissions, sidecars, totals, mismatch exit 2 and fatal exit 1 |

`server/scripts/direct-entry.ts` is the single shared predicate. It compares `import.meta.url` with `pathToFileURL(process.argv[1]).href` and returns false when the argv entry is absent. Importing any of the four modules now performs no database-client construction, storage call, lock/file/log action, or process exit.

The implementation census found **0 production importers** of the four executable modules. The same expression found **6 production imports** of `archive-completeness.ts`, its positive control.

## 2. Executable seams and production adapters

- Retention exports the existing object lane, transactional DROP/active gate, plain-table removal coordinator, proof-set evaluator and lock wrapper. Production calls still use the same PostgreSQL, storage, evidence, exporter, alert and filesystem implementations; tests substitute only explicit dependencies.
- Context exports the month lane and the outer cycle. A `reuse` now invokes the existing exact-range source recount; false or missing proof throws `reuse-count-changed` before the month is completed. The outer cycle reaches cutoff-wide DELETE, active marking and VACUUM only after every month returns successfully.
- Cold rotation exports candidate selection, one-candidate rotation and the continue-on-failure runner. Warm deletion occurs only after warm checksum, cold upload/readback, cold manifest write carrying `completeness_basis`, and warm `migrated` update.
- Rehydrate exports a typed per-label lane. It returns `downloaded`, `skipped-cold`, `mismatch`, or an explicit non-download `skipped` result; only the CLI aggregates totals and maps any mismatch to exit 2. A mismatch remains outside the good-name glob, removes the stale good sidecar, and contributes to neither proven nor unproven totals.

## 3. Behavioural harness

`server/tests/unit/b-b75-script-test-harness.test.ts` executes the real exported gates with fake clients/storage and private temporary folders. Its mutation-sensitive cases cover:

- direct-entry match, mismatch and absent argv, plus silent imports of all four commands;
- retention reuse recount mismatch, evidence→basis→verified transaction order, DROP/active rollback, full proven-label set, bounded plain deletion before active/VACUUM, and lock release on returned and thrown failures;
- context reuse recount, 413 proof at the actual cold tier, and the outer delete fence on a thrown month;
- cold candidate exclusion/window selection, warm/cold checksums, inherited manifest basis, both manifest writes before warm deletion, and continue-after-failure;
- rehydrate good-file sidecar, mismatch quarantine/stale-sidecar removal/non-proven accounting, and cold refusal without `--restore-cold`.

The predecessor suite remains as a compatibility alarm for exact SQL/log/key/CLI shapes; it is no longer the safety proof for the executed gates.

## 4. Safety boundary

All new tests construct fakes and private local temporary directories. They do not read staging credentials and cannot connect to staging PostgreSQL, Supabase Storage, or Backblaze. Step 7 remains bounded to fake-I/O execution plus command/import probes; it does not authorize a real archive, delete, rotation, VACUUM, or restore.

The context recount is enforcement of the settled System Manual/System Impact Map rule, not a new policy or schedule. `#169` remains the separate home for whether the context job is installed.
