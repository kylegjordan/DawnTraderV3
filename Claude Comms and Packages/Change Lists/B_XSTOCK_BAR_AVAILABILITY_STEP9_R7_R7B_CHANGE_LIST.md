# B-XSTOCK-BAR-AVAILABILITY — Step 9 R7 + R7b (+ R7c): change list for the Step-4 diff review

> **R7d (2026-11-20, after the R7c PROCEED) is the newest round: read the R7d section first.** R7c answered the CHANGES NEEDED verdict; the sections after it describe R7 + R7b as first sent, with the superseded lines marked.

**Header (Step-4 dispatch fields):**
- **(i) Declared change-class:** `architecture` (scope header, `Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md:3`).
- **(ii) Doc set for that class, row by row:**
  - scope `Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md`: **present**.
  - pre-audit `Scope Files/B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md`: **present**. r6 ruling, C6 r7/r8, the C6 timing read and its ruling are at its end (`### ✅ C6 timing read RULED 2026-11-20`).
  - completion report: **absent** (batch open at Step 9).
  - `BATCH_CATALOG`, `PHASE_HISTORY`, System Manual, System Impact Map: **owed at Step 10**. They will record R7 (a new root cron, a new canonical actor, a new one-shot alert key) and R7b (a new retention-hold rule inside the B75 sweep). The STORAGE_POLICY and SIM text for B-DISK-FILE-TIERING is OLD Claude's; the R7b hold rule is mine to document (agreed in channel, `1573272236641746975`).
- **(iii) Step 2:** the pre-audit above, Step-2 ref `a46a79f7a` (r6 re-run plan). This diff implements r6 R7 + R7b as ruled at `1573143973550096385`, plus C6-ruling condition 1 (`1573271063721287783`). Condition 2 (the ~665 s / 55% figure) is recorded in the R7b module header and goes into the batch record at Step 10. Condition 3 belongs to R2'.

**Diff range:** the four code commits whose subjects start `B-XSTOCK-BAR-AVAILABILITY R7 condition 1`, `… R7:`, `… R7b:` and `… R7c:`; their shas as pushed are in the Step-4 dispatch (a rebase changes them). Only my files are in this range.

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

## R7d — the three carried items (2, 4, 5) from the R7c PROCEED, for their own Step-4 round
**Code commit:** subject `B-XSTOCK-BAR-AVAILABILITY R7d: verdict-runner liveness check, hold-key clearing on an empty night, process-group kill` (sha as pushed is in the dispatch). Pushed only after OLD Claude's `4456f515d` deploy landed (21:40:57Z), so that deploy carries none of it. Six files, +181/−7, all mine.

| file | change |
|---|---|
| `server/scripts/b-xstock-bar-availability-verdict-runner.ts` | +39/−3: Cron-line header block; `started at` / `DONE` lines in `main`; `killProcessGroup`; gate child `detached: true` |
| `server/scripts/b-storage-archival-health.ts` | +14: CheckSpec `xstock-bar-verdict` |
| `server/scripts/b75-retention-sweep.ts` | +14/−3: `settleRevisionHold` runs on an empty list; the sweep settles before the empty skip |
| `server/tests/unit/b-disk-file-tiering-amendment1.test.ts` | +2/−1: the new check in the expected-names list and the Cron-line subject map |
| `server/tests/unit/b-xstock-bar-availability-verdict-runner.test.ts` | +73 |
| `server/tests/unit/b-xstock-bar-availability-sweep-hold.test.ts` | +39 |

**Item 2: liveness.** `main` now writes a start line after the root refusal and a DONE line on every terminal result:
```ts
  console.log(`${LOG} started at ${new Date().toISOString()}`);
  const result = await runVerdictRunner({ … });
  process.exitCode = result === 'ran-no-verdict' ? 1 : 0;
  console.log(`${LOG} DONE result=${result} failed=${result === 'ran-no-verdict' ? 1 : 0}`);
```
The archival-health watchdog grades it like the three B75 subjects:
```ts
    name: 'xstock-bar-verdict',
    logFile: 'xstock-bar-availability-verdict.log',
    schedule: '15 0 * * *',
    donePattern: /\[xstock-bar-verdict-runner\] DONE result=\S+ failed=(\d+)/,
    startPattern: /\[xstock-bar-verdict-runner\] started at (\S+)/,
    onMissing: 'alert',
```
That gives `not_started` (no start line after the fire: cron line gone, lock still held, launcher refused), `incomplete` (start with no DONE: a fatal or a kill), `failed` (ran-no-verdict), and, from `effectiveSchedule` (`b-storage-archival-health.ts:298`), `not_scheduled` / `schedule_drift` when the root crontab has no active line appending to that log or a different expression. The runner header now opens with the installed line (Infra, root crontab line 15 of 15), because the amendment1 Cron-line fence takes the FIRST `* <5 fields> su - deploy` match in the subject's header and requires it to equal the CheckSpec schedule.

**Item 4: the hold key's clearing edge.**
```ts
-  if (parent !== XSTOCK_REVISION_PARENT || eligible.length === 0) return { kind: 'not-applicable' };
+  if (parent !== XSTOCK_REVISION_PARENT) return { kind: 'not-applicable' };
 …
+  if (plan.kind === 'window-unreadable' && plan.held.length === 0) {
+    deps.log(`[B75 sweep] ${parent}: graded window unreadable (${plan.reason}); no eligible partition, nothing held`);
+    return plan;
+  }
```
and in `runSweep` the settle call moves above `if (oldPartitions.length === 0)`. Every other table still reads nothing (the parent check is first). Tests: readable + no verdict + empty list resolves `[UNREADABLE, holdKey]` and leaves the cap key; verdict present resolves `[UNREADABLE, hold, cap]`; unreadable + empty raises nothing and resolves nothing; a source check that the settle precedes the empty skip and appears once.

**Item 5: process-group kill.**
```ts
-    const child = spawn('npx', ['tsx', GATE_SCRIPT, ...args], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
+    const child = spawn('npx', ['tsx', GATE_SCRIPT, ...args], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
 …
-    const timer = setTimeout(() => child.kill('SIGKILL'), GATE_CHILD_TIMEOUT_MS);
+    const timer = setTimeout(() => killProcessGroup(child.pid, () => child.kill('SIGKILL')), GATE_CHILD_TIMEOUT_MS);
```
`killProcessGroup` sends SIGKILL to `-pid`; a throw or no usable pid falls back to `child.kill`. Tests cover all three arms.

**Verification at my clone:** the two runner/hold test files 81/81; tsc 324 = baseline, none in touched files. amendment1 fails 8 tests in its H-2 block on this laptop only: the working copy of `staging-liveness-watchdog.mjs` is CRLF (`git ls-files --eol`: `i/lf w/crlf`), its `#!` line then ends in `\r`, and the import throws. That file is untouched here; CI checks out LF. CI on the pushed head is the evidence, not my clone.

**Judgement calls I want attacked (R7d):**
1. **A no-verdict night pages twice:** the runner's own `…-runner-failed` key and the watchdog's `failed`. I kept both: the first fires at 00:15Z with the reason, the second at 05:00Z is the independent check that does not trust the runner. The other choice is `failed=0` always, with the watchdog grading liveness only.
2. **A lock-held night pages `not_started`.** The launcher writes no start line when the previous run still holds the lock. A run alive 24 h later needs a person, so I did not add a "skipped, lock held" DONE line that would grade green.
3. **Residual, not fixed:** if the runner itself is killed while the gate runs, the detached gate group is not killed with it and lives until its own statement budget ends (at most 1,200 s). Under cron nothing kills the runner early, so I left it.
4. **Infra's proposed crontab-line check in `dt-install-drift`** (`1573453936608936057`) would duplicate `effectiveSchedule` above for this job. Infra WITHDREW it (`1573458335095718159`). His named residual: an edit to the COMMAND on a line that keeps the same log and schedule is not seen by `effectiveSchedule`. My read: a command that no longer runs this runner stops writing the `started at` line, so the CheckSpec pages `not_started` at 05:00Z; the uncovered case is only a changed command that still runs a runner writing both lines. Accepted, no own check.

## Step-4 verdict on R7c: PROCEED (Langston `1573342539186966542`, 2026-11-20)
Code `38af683a6`; graded at `b6428d6ef` (CI `44745580867` 4/4); bytes unchanged at `c0a82132e`. Nothing ruled on reported fact. Two readings and five carried items for the record, each with its disposition:

- **What `[]` means.** `in_window_days_missing_from_hot = []` means every in-window UTC day still has a hot child partition, judged from the child NAME (`classifyPartition`). It does NOT mean the rows are intact. Nobody may read `[]` as data completeness.
- **R2 prediction, re-derived by Langston:** missing `[2026-11-09, 2026-11-10, 2026-11-11]`, 10 days compared (the 00:05 start touches ten UTC days). `[]` on R2 is a broken measurement.
- **Reflog control (fold-in e):** the deploy clone's reflog holds 160 entries: 151 `reset: moving to <SHA40>`, 9 `reset: moving to HEAD`, zero other verbs. The allowlist covers all of the measured history.

Carried items:
1. **R7b's hold arms are unexercised on this window.** `hot_retention_days` is 8, so the first age-eligible child (`…_2026_11_12`) reaches the sweep at 11-21 02:15Z. The runner fires at 00:15Z that same night. If night one writes a verdict, the hold, cap and window-unreadable arms never engage on this window, and no silence from them is evidence that they fire (#661 leg 3). DISPOSITION: folded into this batch; this sentence goes into the completion report's honest residual.
2. **The new nightly job has no liveness check.** The other three nightly subjects each have a `CheckSpec` with start and done patterns. This runner prints no `started` line, and the launcher exits 0 on a held lock with only a log line. DISPOSITION: folded into this batch as R7d (a `started at <ISO>` line plus a `CheckSpec`), owner CC-C. It gets its own Step-4 round and is pushed only after OLD Claude's 11-20 deploy lands, so that deploy carries no unreviewed code.
3. `/tmp/xstock-bar-availability-verdict.lock` follows the `b75-retention-run.sh` precedent and falls in the shared-`/tmp` class already homed at #979. DISPOSITION: no work, citing #979.
4. `settleRevisionHold` returns `not-applicable` on `eligible.length === 0` before it clears the hold key. An open `…-sweep-hold:<start>` would then have no clearing edge, which can only happen if the 8-day retention is raised. DISPOSITION: folded into R7d.
5. `SIGKILL` goes to `npx`, not the process group, so a hung `tsx` grandchild can outlive the 30-minute timeout. It is bounded in practice because `budgetedQuery` caps every statement by the remaining 1,200 s budget. DISPOSITION: folded into R7d (kill the process group).

Step 10 order on `8bd256bc`: flip the GOVERNANCE_EXCEPTIONS row to open-retired and push, THEN resolve. Resolving first frees the dedupe key, and the next tick re-mints it.

## R7c — answers to the Step-4 send-back (`1573299718837108808`, follow-up `1573304681877348355`)
One commit, subject `B-XSTOCK-BAR-AVAILABILITY R7c:`; its sha as pushed is in the dispatch. Seven files: runner, launcher, B75 sweep, hold module, `system-alerts.ts` (one `why` string), and the two batch test files.

**B1 — run as deploy.** Root crontab line, as handed to Infra:
`15 0 * * * su - deploy -c "cd /home/deploy/dawntrader && server/scripts/b-xstock-bar-availability-verdict-run.sh" >> /var/log/dawntrader/xstock-bar-availability-verdict.log 2>&1`
Both entry points refuse uid 0 before any work, and tests pin the order:
```sh
+if [ "$(id -u)" = 0 ]; then            # run.sh, before /usr/bin/flock -n 9
+  echo "[xstock-bar-verdict-runner] refusing to run as root; schedule it as su - deploy -c" >&2
+  exit 1
+fi
```
```ts
+  if (process.getuid?.() === 0) {        // runner main(), before runVerdictRunner(
```
The `ALERT_ACTORS` `why` text now says root crontab, run as deploy.

**B2 — dropped days are MEASURED, and C-3 is struck.** Before the gate runs, the runner lists the child partitions of `xstock_bar_revision_event` and records three fields in the verdict metadata and the evidence file: `hot_partitions_examined`, `in_window_days_compared`, and `in_window_days_missing_from_hot`. Daily children cover one UTC day, monthly children cover their range (`classifyPartition`). Any missing day turns a gate PASS into INCONCLUSIVE with leg `runner-checks`. A FAIL stays a FAIL. The headline day count is unchanged.
- **Judgement call to attack — measured emptiness.** An empty partition list, or a partition read that throws, is **NO VERDICT** (failure key raised, one-shot not spent, retried next night). It is not INCONCLUSIVE. So `[]` in `in_window_days_missing_from_hot` can only come from a read that returned partitions and covered every day. If you want an empty read recorded as INCONCLUSIVE instead, that costs the one-shot on a read error.
- **Expected R2 first run:** the earliest hot child is `xstock_bar_revision_event_2026_11_12`, so the list must be `[2026-11-09, 2026-11-10, 2026-11-11]` and the verdict INCONCLUSIVE (or FAIL). **`[]` on R2 would mean the measurement is broken**, and I will treat it that way. R2 is never recorded as a graded nine-day window.

**Fold-ins.**
- **(b) Clearing edges.** The hold module header now names the clearing edge for every key. `…-sweep-hold:<start>`: a night that holds nothing. `…-sweep-hold-cap:<start>`: a verdict for that window only. `…-window-unreadable`: the first readable night. When the governed start moves, both the sweep (`resolveOtherWindowAlerts`, both hold prefixes) and the runner (`resolveOtherWindows`, the runner-failed prefix) resolve older-window rows through `resolveAlertsByDedupePrefix(prefix, actor, evidence, transport, excludeKeys={current})`. A failed clear is logged and never stops the run.
- **(c)** `held=${partitionsHeld}` is appended **after** `duration_ms` on the sweep's DONE line. The AP-7 fence literals are untouched.
- **(d)** Hold alerts pass category `verification` (`raiseSweepAlert` gained a `category` parameter, default `breakage`).
- **(e) Reflog allowlist.** `reset: moving to <40-char sha>` counts as a deploy. `reset: moving to HEAD` is benign. Every other entry since the build running at window open is counted and listed as `reflog_unrecognised_entries`: a checkout, a pull, a commit, or a line the parser cannot read. Any such entry turns a PASS INCONCLUSIVE.
- **(f)** A read-back failure now raises `…-verdict-runner-failed:<start>` **before** the throw. If that raise fails too, it still throws, and logs that the key could not be raised.
- **(g)** `HOLD_CAP_DAYS` is renamed `HOLD_CAP_PARTITIONS = 3`; the count is child tables, not days. **What cap 3 buys:** with hot retention at 8 days against a 9-day window, a partition becomes age-eligible on the night the window's runner first falls due. So cap 3 covers three runner-failure nights before the oldest in-window day is released.
- **Ruling 4:** `verdictState` moved inside the readable-window arm of `RevisionHoldInput`, so a readable window without a state cannot be expressed. The `| null` is gone.

**AP-7 fence (run, not asserted).** `server/tests/unit/b-disk-file-tiering-amendment2.test.ts` (the fence `describe` at :188) passed in my clone together with the runner and sweep-hold files: 3 files, 102 tests. A sweep-hold test also feeds a DONE line ending ` duration_ms=1200 held=2` to the checker's `RET_DONE` pattern and confirms it still matches. tsc is at the 324 baseline. CI on the dispatched sha: see the dispatch.

**Doc set at Step 10 (added):** a System Impact Map cross-cutting entry for the verdict key, which the sweep holds on and the runner writes. The `GOVERNANCE_EXCEPTIONS` row is retired before `8bd256bc` is resolved.

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
- ~~**A late run grades the superset `[start, now)`** … (C-3).~~ **Struck at R7c (B2):** extra days no longer stand in for missing ones. Missing in-window days are measured, and any missing day makes a PASS inconclusive.

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
  // R7c: HOLD_CAP_DAYS → HOLD_CAP_PARTITIONS; verdictState now read from input.window (ruling 4)
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
1. *(Ruled OK; R7c makes the benign set an allowlist, see (e).)* **Reviewed refs come from the deploy reflog.** An unattended run cannot ask you, so it passes every `dt-deploy` reset since the window opened, plus the one before it. A build that reached staging any other way is still absent, so the gate still FAILS on it. The list does **not** prove you cleared each deploy. The verdict records `reviewed_refs_source`, and the grading session confirms each ref against your clearances before treating the verdict as final. Is that an acceptable division, or must the runner refuse to write a verdict until a governed reviewed-ref list exists?
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
