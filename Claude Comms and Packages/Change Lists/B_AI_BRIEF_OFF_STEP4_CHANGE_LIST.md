# B-AI-BRIEF-OFF — Step 4 change list (r1)

**READY AT:** `origin/migration/aws-supabase` = `e9c6faa2cc896a98ca67d04e07a18660912dd2ae` (the code commit; this change list is the commit after it).
**Issue / decision:** `#1264`, `KD-111` (sprint list item 3b). Card: Implementation, Blocked on Langston.

## Dispatch header (workflow-04 three fields)

| # | field | value |
|---|---|---|
| i | **Declared change-class** | `non_architecture` (scope header, `B_AI_BRIEF_OFF_SCOPE.md:3`) |
| ii | **Doc set for that class** | see table below |
| iii | **Step-2 reference** | `Claude Comms and Packages/Scope Files/B_AI_BRIEF_OFF_PRE_AUDIT.md` (r2 at `e9c6faa2c`; your Step-2 PROCEED with C-1..C-5, Discord `1574059372915593276`, folded as §P8) |

| document | required for `non_architecture`? | state at this ref |
|---|---|---|
| SCOPE | REQUIRED | present — `Scope Files/B_AI_BRIEF_OFF_SCOPE.md` (r2, your Step-1 PROCEED `1574054372231483554`) |
| PRE_AUDIT | REQUIRED | present — `Scope Files/B_AI_BRIEF_OFF_PRE_AUDIT.md` (r2) |
| COMPLETION_REPORT | REQUIRED | absent — Step 11 |
| BATCH_CATALOG | REQUIRED | absent — Step 10 |
| PHASE_HISTORY | REQUIRED | absent — Step 10 |
| SYSTEM_MANUAL | judged | judged APPLICABLE — §12 row + header count 12→11 (`SYSTEM_MANUAL.md:7737`, C-5), Step 10 (P6) |
| SYSTEM_IMPACT_MAP | judged | judged APPLICABLE — §9.8 counts 12→11 / 38→37 / "34 of the 37", Step 10 (P6) |
| CHANGES_AND_FIXES | judged | judged N/A at Step 4 — no bug fixed; re-judged in the Step-10 ledger |
| PHASE_19_PLAN · shared MEMORY + MEMORY_CC_B · your MEMORY | REQUIRED | absent — Step 10 |
| GOVERNANCE_EXCEPTIONS | (C-4) | present — `open` row at the top of the table, `e9c6faa2c` |
| DEPLOY_WINDOWS | (P7) | present — `open` row, `DEPLOY_WINDOWS.jsonl:43` (`5e3a34cec`) |

## The code change — the whole of it (`server/index.ts`, 3 insertions, 11 deletions)

```diff
@@ -680,7 +680,6 @@
       const { screenerRecalibrationTask } = await import('./services/screener-recalibration-task');
       const { marketScanTask } = await import('./services/market-scan-task');
-      const { aiSummaryTask } = await import('./services/ai-summary-task');
       const { cleTask } = await import('./services/cle-task');
@@ -720,16 +719,9 @@
-      schedulerRegistry.registerTask({
-        name: aiSummaryTask.name,
-        description: aiSummaryTask.description,
-        frequency: aiSummaryTask.frequency,
-        intervalMs: aiSummaryTask.intervalMs,
-        run: aiSummaryTask.run.bind(aiSummaryTask),
-        lastRun: null,
-        nextRun: null,
-        status: 'idle'
-      });
+      // B-AI-BRIEF-OFF (#1264, KD-111): the AI Summary task is switched off — not registered with
+      // the scheduler. services/ai-summary-task.ts is left in place until the after-live cleanup
+      // line in Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md:171 removes it.
```

No other code file changes. `git status --porcelain` before the commit held only the three committed files and `?? .claude/launch.json` (local preview config, never committed) — no untracked file belongs to the change set.

## P2 gates (run before the push)

| gate | result |
|---|---|
| `node scripts/check-tsc-baseline.mjs` | 324 = 324, no new error; `.tsc-baseline.json` unchanged |
| Scope 1(a): `git grep -n aiSummaryTask origin/migration/aws-supabase -- server` | exactly one line: `server/services/ai-summary-task.ts:118:export const aiSummaryTask = new AISummaryTask();` |
| Scope 4: `git diff --stat 8ccdf750a..origin/migration/aws-supabase -- server/services/ai-summary-task.ts .tsc-baseline.json` | empty. Control: `git ls-tree` at the ref lists both paths (blobs `9ae2d231…`, `656100ab…`), so the empty diff is over files that exist |
| vitest (local) | the full local run had 17 failing files, all DB-less (`ECONNREFUSED 5432`), module-resolution or census-timeout cases. Control: the six suspect files re-run with this change stashed vs applied — **12 failed without, 9 with**; every failure with the change also fails without it. No test references the task (pre-audit A1). CI is the gate. |

## P3 instrument controls — baseline taken BEFORE the deploy (staging, 2026-11-22 ~14:20Z, process on `c21c1502a`)

Same instrument the after-read will use (whole `out*` / `error*` enumeration in `/var/log/dawntrader`, `zgrep -c` on `.gz`, `grep -c` otherwise — counts matching lines):

| read | result |
|---|---|
| `out*` (20 files, 2026-11-15 → now, plus the 07-13 archive) — `[AISummary]` lines | **14** |
| `out*` — `[MarketScan]` lines (control) | **15,966** |
| `error*` (18 files, 2026-11-07 → now, plus archive) — `[AISummary] Error creating summary` lines | **63** |
| … of those, dated 2026-11-22 | **6** — all `05:08:41`, 2 each for users `05066a82…`, `56523b4f…`, `6c591801…` (3 users × 2 runs, as the pre-audit stated) |
| `GET /api/schedulers/status` (dt-api, HTTP 200) | `tasks` holds **38** names; `AI Summary` **present**, `Market Scan` **present** |

After the deploy the discriminating read (P5, 1(b)) is the same call on the new process: expect 37 names, `AI Summary` absent, `Market Scan` present.

## Judgement calls to attack

1. **Comment, not silence.** I left a three-line comment where the registration was, naming the batch and the after-live line that deletes the file. The alternative is a bare deletion with the reason only in git. I chose the comment because the file it points at stays in the tree, and a reader who finds `ai-summary-task.ts` unregistered should not have to dig to learn it is deliberate. Attack if you think the comment is the "lingering legacy" rule 18 forbids — my reading is that rule 18 is satisfied by the placed deletion (`PRE_LIVE_SPRINT.md:171`, Kyle-agreed via KD-111), not by the absence of a pointer.
2. **The import removal.** Removing the dynamic `import()` means the module is never loaded at boot. I checked for side effects at module load in `ai-summary-task.ts` at the ref: its top level is two imports (`../storage` `:4`, `./scheduler-registry` `:5`), the class at `:7`, and `export const aiSummaryTask = new AISummaryTask()` at `:118`. The class declares no constructor, and the file contains no `setInterval`, `setTimeout` or `.start(` (grep at the ref). Both imported modules are loaded at boot by the other registrations in the same block regardless. If you find a load-time side effect something else depends on, this is the line that would break it.
3. **The governance-exceptions row's timestamp** is the push time of `e9c6faa2c` (`2026-11-22T14:16:04Z`), set at the amend just before the push, not the time the row was first drafted.

## Deploy (not yet — recorded so the conditions are visible at review)
Not before the B-ENTRY-GATE increment-C read is TAKEN (after 2026-11-23 21:00Z, C-2). At deploy time: enumerate `c21c1502a..<deploy sha>`, run the A9 effect column on it, and get CC-C's and CC-INFRA's go-ahead for their commits or deploy a sha that excludes them (C-1); respect row 9j's own read window if it ships separately (C-3). `d92423ce` is CC-A's and is not hand-resolved.
