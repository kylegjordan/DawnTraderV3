# B-XSTOCK-BAR-AVAILABILITY — Step 9 R7 + R7b: change list for the Step-4 diff review

**Header (Step-4 dispatch fields):**
- **(i) Declared change-class:** `architecture` (scope header, `Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md:3`).
- **(ii) Doc set for that class, row by row:**
  - scope `Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md`: **present**.
  - pre-audit `Scope Files/B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md`: **present**. r6 ruling, C6 r7/r8, the C6 timing read and its ruling are at its end (`### ✅ C6 timing read RULED 2026-11-20`).
  - completion report: **absent** (batch open at Step 9).
  - `BATCH_CATALOG`, `PHASE_HISTORY`, System Manual, System Impact Map: **owed at Step 10**. They will record R7 (a new root cron, a new canonical actor, a new one-shot alert key) and R7b (a new retention-hold rule inside the B75 sweep). The STORAGE_POLICY and SIM text for B-DISK-FILE-TIERING is OLD Claude's; the R7b hold rule is mine to document (agreed in channel, `1573272236641746975`).
- **(iii) Step 2:** the pre-audit above, Step-2 ref `a46a79f7a` (r6 re-run plan). This diff implements r6 R7 + R7b as ruled at `1573143973550096385`, plus C6-ruling condition 1 (`1573271063721287783`). Condition 2 (the ~665 s / 55% figure) is recorded in the R7b module header and goes into the batch record at Step 10. Condition 3 belongs to R2'.

**Diff range:** `2c93147fb` → `556e60702` (three code commits: `d2e9dea7d` condition 1, `4690c0181` R7, `556e60702` R7b; shas after the rebase onto `d56a55033`). Only my files are in this range.

| file | change |
|---|---|
| `server/scripts/b-xstock-bar-availability-gate-read.ts` | +64: per-statement timings and `summarizeTimings` (condition 1) |
| `server/scripts/b-xstock-bar-availability-capacity-gate.ts` | +10/−2: `runTiming` in the pass/fail and inconclusive verdict shapes |
| `server/scripts/b-xstock-bar-availability-verdict-runner.ts` | NEW, ~365 lines: R7 |
| `server/scripts/b-xstock-bar-availability-verdict-run.sh` | NEW, mode 100755: flock launcher |
| `server/services/system-alerts.ts` | +1: actor `xstock-bar-verdict-runner` (machine, `timer-script`) |
| `server/services/data-archive/xstock-revision-verdict-hold.ts` | NEW, 127 lines, pure: R7b rule and the shared key/window/SQL definitions |
| `server/scripts/b75-retention-sweep.ts` | +159: `settleRevisionHold` plus the loop skip |
| tests | NEW `…-verdict-runner.test.ts` (239), `…-sweep-hold.test.ts` (207); CHANGED `…-gate-read.test.ts` (+59) |

**Verification at my clone:** vitest 19 files / 289 tests pass (the hold, runner and gate-read tests, every `b-b75-*` test, and the B-DISK-FILE-TIERING AP-7 fence test). tsc baseline 324 = 324. CI: see the dispatch.

## Condition 1: every gate statement timed
`budgetedQuery` pushes `{ leg, elapsedMs, timeoutMs, outcome }` for every statement that reaches the server, and `refused` when the budget is exhausted first.
```ts
+  const started = budget.now();
   try {
     await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
-    return await client.query(text, params);
+    const result = await client.query(text, params);
+    budget.timings.push({ leg, elapsedMs: budget.now() - started, timeoutMs, outcome: 'ok' });
+    return result;
```
`summarizeTimings(budget)` returns `{ runElapsedMs, statementMs, statements, legTimings[] }`. `runElapsedMs` is measured from `startBudget`; it is **not** the window length that `gate.ts:655 elapsedMs` carries. Both verdict shapes now carry it:
```ts
-      verdict: { state: verdict.pass ? 'pass' : 'fail', ...verdict },
+      verdict: { state: verdict.pass ? 'pass' : 'fail', ...verdict, runTiming: summarizeTimings(budget) },
```

## R7: the unattended verdict runner
- **Entry:** root cron, daily at 00:15 UTC, `b-xstock-bar-availability-verdict-run.sh`. The launcher takes a kernel `flock -n` on an inherited fd and exits 0 if another run still holds it. Same shape as `b75-retention-run.sh`. Infra Claude enrolls the cron line and the paths in the dt-install-drift manifest once this clears.
- **Each run** (`runVerdictRunner`):
  1. Reads the governed `graded_window_start` through the ONE shared SQL. Due time is `final_gate_at = start + 9 d + 10 min`.
  2. Not due: logs `SKIPPED not-due`.
  3. Verdict key `xstock-bar-availability-capacity-verdict:<start>` in any state other than `absent`: logs `SKIPPED verdict-exists`.
  4. Otherwise runs the gate CLI once, with a 30 min child timeout.
- **Exit mapping** (`classifyGateExit`): 0 → pass, 2 → fail, 3 → inconclusive. These are verdicts **only when** stdout parses as one JSON object whose `verdict.state` agrees with the exit code. Exit 1, a signal, a timeout, unparseable stdout or a disagreeing state means **no verdict**: a warning on `xstock-bar-availability-verdict-runner-failed:<start>`, and it retries the next night.
- **Verdict write:** a one-shot alert on the verdict key. Its metadata carries the full `verdict.checks`, headline counts, `runTiming`, `final_gate_at`, the day count and the days beyond nine, plus `reviewed_refs_source: 'dt-deploy-reflog'`. It is **read back** (C-1) before `RAN-AND-WROTE` prints. The runner then resolves its own runner-failed row.
```ts
  const written = await deps.addAlert(buildVerdictAlert(outcome, ctx));
  if (!verdictReadBack(deps.readAllAlerts(), key, written, outcome.state)) {
    throw new Error(`verdict alert read-back failed on ${key} (written id ${written.id})`);
  }
  const cleared = await deps.resolveByKey(failKey, `verdict alert ${written.id} written on ${key}`);
```
- **A late run grades the superset `[start, now)`.** Every count check is `>=`, so only the session count can gain from extra days, and the metadata records how many days lie beyond the registered nine (C-3).

## R7b: the B75 sweep holds an open window's revision partitions
The rule applies to `xstock_bar_revision_event` only. It is pure, in `xstock-revision-verdict-hold.ts`:
```ts
  if (input.parent !== XSTOCK_REVISION_PARENT) return { kind: 'not-applicable' };
  if (!input.window.ok) return { kind: 'window-unreadable', held: [...input.eligible], reason: input.window.reason };
  if (input.verdictState !== 'absent') return { kind: 'no-hold', windowStart, verdictPresent: true };
  const inWindow = input.eligible.filter((p) => overlapsRegisteredWindow(p, windowStart))
    .sort((a, b) => b.rangeStart.getTime() - a.rangeStart.getTime()); // newest first
  ...
  return { kind: 'hold', windowStart, held: inWindow.slice(0, HOLD_CAP_DAYS), capReleased: inWindow.slice(HOLD_CAP_DAYS) };
```
- **In window** means the partition overlaps `[start, start + 9 d)`. The test pins the edges: 12-01 in, 12-02 out, 11-22 out, 11-23 in, and a monthly child that straddles the start counts as in.
- **Hold ends** when the verdict key is in any state at all. The hold guards the read, never the result.
- **Cap:** 3, newest first. Older in-window partitions go to the normal export-verify-drop path, with a **critical** alert on `…-sweep-hold-cap:<start>` that names them. `revisionHotRetentionDays` stays 8.
- **One definition:** `GRADED_WINDOW_START_SQL`, `parseGradedWindowStart`, `verdictKey` and the window length are defined once in this module, and the runner imports them. A test asserts that the runner's key equals the sweep's key.

The sweep wiring, `b75-retention-sweep.ts`:
```ts
+    const held = heldChildren(await settleRevisionHold(spec.parent, oldPartitions));
+
     for (const partition of oldPartitions) {
       partitionsExamined++;
+      if (held.has(partition.child)) continue; // R7b: logged and alerted by settleRevisionHold
```
`oldPartitions` is the age-eligible list (`listOldPartitions(…, cutoff)`). The sweep has no dry-run mode. `settleRevisionHold`:
- reads nothing for any other table;
- logs one `HELD — inside graded window` line per held child;
- warns on `…-sweep-hold:<start>`;
- resolves that key once a verdict exists, and resolves the window-unreadable key once the window is readable again.

The fenced `started` and `DONE` lines (B-DISK-FILE-TIERING AP-7) are untouched, and a test pins them. The default `verdictState` is a call-time lambda, so importing the script does not touch the alert store; the existing B75 harness mocks that module without this export.

## Judgement calls I want attacked
1. **Reviewed refs come from the deploy reflog.** An unattended run cannot ask you, so it passes every `dt-deploy` reset since the window opened, plus the one before it. A build that reached staging any other way is still absent, so the gate still FAILS on it. The list does **not** prove you cleared each deploy. The verdict records `reviewed_refs_source`, and the grading session confirms each ref against your clearances before treating the verdict as final. Is that an acceptable division, or must the runner refuse to write a verdict until a governed reviewed-ref list exists?
2. **An unreadable window holds every eligible revision partition, with no cap.** The alternative is to hold nothing (data loss) or to crash the sweep (every table stops). I chose "fail closed for this one table, critical alert". The cost: an unreadable `module_constants` row grows the hot table by ~0.7 GiB a day until a session fixes it.
3. **At the cap, the oldest partitions are released.** The newest days are the ones a late re-grade still needs. The oldest are the ones the window's start depends on, and releasing them makes the window ungradeable as registered (the critical alert says so).
4. **A verdict-store read that throws is treated as `absent`**, so the hold stays, within the cap. The other choice, treating it as present, would drop the data on a transient alert-file read error.
5. **The runner-failed key deduplicates.** A second no-verdict night while the first row is unresolved mints nothing new; the evidence file and log line still record it. It resolves when a verdict is written.

## Cost (C6 ruling condition 2)
- About 0.7 GiB hot per held day (741,040,128 B measured for 11-09).
- At the cap, the gate's two whole-table legs read about 1.43x the rows: **~665 s, 55% of the 1,200 s budget.** PREVIOUSLY STATED: 520-560 s. NOW: ~665 s at the cap. REASON: those legs scale with retained rows, not with the window.
- Infra's P9 database-size read (12-01 02:05Z, alert `f8188c60`) must name any held days in its comparison.

## Deploy
This rides OLD Claude's deploy after 20:30Z today, together with the DB TLS switch, only if it clears before then. Otherwise it goes in the next deploy. The open DEPLOY_WINDOWS rows are named at deploy time.
