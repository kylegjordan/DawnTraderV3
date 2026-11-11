# B-B75-SCRIPT-TEST-HARNESS — STEP 3 CHANGE LIST

**Batch:** `B-B75-SCRIPT-TEST-HARNESS` · **Issue:** `#1208` · **Change class:** `non_architecture` · **Plan:** `Scope Files/B_B75_SCRIPT_TEST_HARNESS_PRE_AUDIT.md` P1–P9.

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
