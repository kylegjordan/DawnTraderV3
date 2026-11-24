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
Not before the B-ENTRY-GATE increment-C read is TAKEN (after 2026-11-23 21:00Z, C-2). At deploy time: enumerate `c21c1502a..<deploy sha>`, run the A9 effect column on it, and get CC-C's and CC-INFRA's go-ahead for their commits or deploy a sha that excludes them (C-1); respect row 9j's own read window if it ships separately (C-3). For `d92423ce`, the deploy-drift key/instrument remains recorded to CC-A/OLD, while this existing row's operational follow-through belongs to NEW because NEW owns the next permitted combined deploy that can clear it. Preserve it active and unacknowledged; resolve only after a measured terminal `ZERO`, `NO_RUNTIME_PATHS`, or corroborated `BELOW_FLOOR` result. No deploy or restart is permitted while OLD's B-UNIVERSE-REFRESH-ACTS Step-6 explicit deploy hold remains.

## r2 — Langston's Step-4 verdict and what follows from it
**PROCEED** (Discord `1574070046152462520`, 2026-11-22). He re-measured the P3 baselines himself (`[AISummary]` 14, `[MarketScan]` 15,980 — a live control that grew, schedulers 38 with `AI Summary` present) and ruled tsc / vitest as reported fact covering no leg; CI is the gate at Step 5.

- **Nit, applied in this commit:** the in-code comment no longer hardcodes the `PRE_LIVE_SPRINT.md` line number (that list is re-ordered at every close); it now names "the #1264 after-live cleanup line". Comment only — no behaviour change; the two-hunk shape of the code diff is unchanged.
- **Step-10 condition 1:** the required running-plan row for this batch is `SPRINT_TO_LIVE_PLAN.md` (sprint item 3b); `PHASE_19_PLAN` is judged, N/A expected.
- **Step-10 condition 2 — two obligations added to the doc table:** the `PRE_LIVE_SPRINT.md` #1264 line gains the two `'AI Summary'` literal sites (`routes.ts:15758`, `storage.ts:2176`), the cross-check `user_id` 500, and (his §13 surfacing, disposition 2 — folded into the already-placed #1264 line, no new slot) `daily-brief.ts:93 startDailyBriefScheduler()`, which has zero callers but would create briefs and make an OpenAI call if anything ever called it; and the `RUNNING_ISSUES #1264` annotation.

| document | required? | state |
|---|---|---|
| `SPRINT_TO_LIVE_PLAN.md` (row 3b) | REQUIRED (running plan) | Step 10 |
| `PHASE_19_PLAN.md` | judged | N/A expected — not a Phase-19 row |
| `PRE_LIVE_SPRINT.md` #1264 line | REQUIRED by P6 + his condition 2 | Step 10 |
| `RUNNING_ISSUES.md` #1264 | REQUIRED by P6 | Step 10 |

## Step 6 — deployed 2026-11-24

**STEP: 6 of 11 COMPLETE · NEXT STEP: 7 of 11.** Exact candidate `e3a96a8126f0280a9568bb1823b9210783f0afe0` deployed under `codex-b` at `2026-11-24T00:03:08Z`, restart `715`, as the single reviewed backlog bundle from deployed base `c21c1502a215b428e2cba2a5214696cb9a1a5c74`. Component ref `473a7eb72` is an ancestor of the deployed SHA. The aggregate review record is `B_DEPLOY_BUNDLE_E3A96A812_STEP4.md` at exact off-branch ref `3087bb7c98727a82a48e89d32a2b268a90cb635e`; Coltrane ruled PROCEED at `2026-11-23T22:47:56Z`, authorizing only this exact deployment cutoff after the separate time, NEW, INFRA and window-census gates. Exact-target CI run `45047451029` was re-read before deploy: Build, Test Suite, TypeScript Check and Docker Build all succeeded at the deployed SHA.

The first `dt-deploy` invocation was refused before mutation because the branch-head observation-window register had advanced from the reviewed target's nine-row census. The authoritative branch-head census was then re-derived as exactly eight rows and passed with all eight named: `B-AI-BRIEF-OFF`, `B-PRICE-SIDE-BY-JOB`, `B-RTB-PROMOTION-RETRY-STORM`, `B-TOKEN-WATCH-BIRTH-CAP`, `B-TOKEN-WATCH-FOLLOWUP-MEMORY`, `B-UNIVERSE-REFRESH-ACTS`, `B-XSTOCK-BAR-AVAILABILITY`, `B-XSTOCK-BID-TRIGGER-RELAND`. `B-UNIVERSE-REFRESH-ACTS` explicitly permits a pre-Step-6 deploy and was therefore a named no-harm window. The corrected invocation completed with a bounded 14-second check-failure interval and recorded `register_sha=85b101adecb65ec24dfdd2f493785bfe58fc4e59` / `register_blob=9f78481c90feb16b0030bef527015516887ecf34`.

Independent post-deploy read-back found repository HEAD and `dist/BUILD_SHA` both exact, the app online with `restart_time=715` and `unstable_restarts=0`, and live post-resume price/exit cycles. The 25-hour verification clock is anchored to this process at `2026-11-24T00:03:08Z`; its full-span read is due at or after `2026-11-25T01:03:08Z`. The window register's `expected_by` is amended to that exact anchor + 25 hours in the same ledger commit.

The Delivery Board card was moved from `CI + Deploy` to `Verification`; authoritative `fieldValues` read-back returned Status `Verification`, Owner `Claude New`, Review `Approved`, and Blocked on `External` (the registered 25-hour clock).

### Step 7 immediate read-back — 2026-11-24T00:07Z

The authenticated staging scheduler-status call returned HTTP 200 and `ok=true`. Its complete task population was **37**: exact name `AI Summary` occurred **0/37**, while exact name `Market Scan` occurred **1/37** and was the known-present positive control. This is the pre-registered 1(b) shape (38 → 37, AI task absent, neighboring control present).

The database baseline used the same two exact task names. It found **179** lifetime `AI Summary` rows, with latest `2026-11-23T05:08:41.828899Z`, and **48,611** lifetime `Market Scan` rows, with latest `2026-11-23T23:58:47.138191Z`; both known-present populations prove the read can see the rows. At the immediate read neither had a post-deploy row, so no absence claim was taken from that zero.

At `2026-11-24T00:13:05Z`, the first post-deploy Market Scan ran. The database then held **2** post-deploy Market Scan rows (first timestamps `00:13:05.709623Z` and `00:13:05.709980Z`) and **0** post-deploy AI Summary rows over the same exact task-name population. The two current process logs, read from deployed-at onward, held **28** `[MarketScan]` lines and **0** `[AISummary]` lines. Market Scan is therefore the post-deploy positive control in both instruments; this is an early PASS on the two absence legs, not the registered 25-hour confirmation.

This does not complete Step 7: the confirmatory 25-hour log and database read remains due at or after `2026-11-25T01:03:08Z`, and the staging UI still needs the applicable scheduler/briefing surface judgement at that close. Event-wait alert `5a955fd6-71b6-4918-ae5e-7d7af1c6fc92` was read back `scheduled` for `2026-11-25T01:08:08Z`; never ack it, and resolve only with the completed evidence commit.

Deploy-drift alert `d92423ce-ff41-4542-8c0e-15f20a2580f5` did not self-clear on the first post-deploy hourly run. At `2026-11-24T00:17:01Z` the checker returned RUNG 3 for deployed `e3a96a8126f0280a9568bb1823b9210783f0afe0` versus shared head `7f0e0ad0031887dcd71cc37731e94d57bdae7348`: 88 commits and 18 runtime files, governed age 31 h. It remains active and unacknowledged; this is a terminal non-clear result, so no manual resolve is permitted.

The ownership split above was reaffirmed by PM Codex and sent to OLD Codex for counterpart confirmation at Discord message `1574716878528581754`. The complete alert-store read still found `d92423ce` active with every acknowledgement and resolution field null. The latest run at `2026-11-24T09:17:01Z` was another terminal non-clear (`RUNG=3`, age 40 h, 143 commits, capped file enumeration) against head `2305dfe79cf51a760d6fcc4fb3e718c6f4d54a27`; it authorizes neither acknowledgement nor resolution, and the B-UNIVERSE-REFRESH-ACTS deploy hold remains in force.

At `2026-11-24T04:17:01Z`, the same checker reached its 300-file enumeration cap while comparing deployed `e3a96a8126f0280a9568bb1823b9210783f0afe0` with head `75f9dd06bda3755335712136ae1bd6358340bc80`. The exact run remained RUNG 3 at 35 h / 114 commits and the returned slice already contained two qualifying runtime paths, but the complete runtime-path population was undecidable, so it minted `0e066248-a4e4-4ba6-bac5-ef65c76c56ad` (`deploy-drift-file-gate-undecidable`). The complete alert-store read found that row active and unacknowledged; the run proved none of its three clearing outcomes (`ZERO`, `NO_RUNTIME_PATHS`, or corroborated `BELOW_FLOOR`). It therefore remains active and unacknowledged for the hourly checker to clear only after a qualifying run; this evidence permits neither a manual acknowledge nor a manual resolve.

`REVIEWER: claim-only · whether deploy-drift alert 0e066248 must remain active/unacknowledged after the capped 04:17Z run · settling objects were the complete alert-store row, Helsinki run log, installed checker, deploy record and exact Git operands; hit: the capped label does not erase the two runtime-path matches already present in the returned slice, while the complete population remains undecidable; re-derived at the log and checker and wording corrected; later qualifying clear or manual mutation remain compatible alternative states · re-derived y`

`REVIEWER: claim-only · B-AI-BRIEF-OFF immediate Step-7 scheduler, database and log snapshots · three narrow counts re-derived with positive controls; no discrepancy; compatible alternatives remain (direct caller, later fire, hidden transparency-write failure, log-line count is not execution count); 25 h confirmation and UI still owed · re-derived y`
