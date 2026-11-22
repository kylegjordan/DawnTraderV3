# B-AI-BRIEF-OFF — SCOPE (r2)

change-class: non_architecture

**Issue:** `#1264` · **Plan row:** CC-B list `3b` (`SPRINT_TO_LIVE_PLAN`) · **After-live deletion:** `PRE_LIVE_SPRINT.md`, "Legacy and dead-code cleanup" · **Owner:** CC-B (NEW Claude) · **Decision:** `KD-111` (`1-system-manual/pm/DECISIONS.md`). ⚠️ **Records:** PM Claude holds the `KD-111` row, the `#1264` entry with its `HOME:` line, the plan row and the after-live line in commits not yet on origin (Discord, PM Claude 2026-11-22T12:54:59Z). r1 cited `849df8380` for them; **that id is not a commit on origin and is withdrawn.** This scope is dispatched for Step 1 only once those records are at the graded ref, and the refs are written here then: `KD-111` at `<ref>`, `#1264` at `<ref>`, plan row `3b` at `<ref>`, after-live line at `<ref>`.

**Directed by Kyle, directly, on 2026-11-22** (relayed by PM Claude, `KD-111`): *"The daily AI brief is old legacy concepts and code that needs to be just turned off. If we can turn it off in a way that and make sure that it's not interfering with the current code, it's not causing alerts, then let's do that. And then we can gut it and just take it out later after we go live or in the batch where we're doing our major cleanup."*

⛔ **THE AI-PAGES BOUNDARY — WHY THIS BATCH MAY TOUCH IT (Langston's condition, Discord 1574017595747598528).** Kyle's 2026-10-19 rule keeps the main Dashboard and the AI pages off-limits unless paper-mode trading or the VTS is broken. **This batch exists because Kyle ordered it himself on 2026-11-22; that direct order overrides his own 10-19 rule for this one change.** The prior disposal under the 10-19 rule — the 69 `[AISummary] … trading_mode` enum errors withdrawn to cleanup (`B_WORKFLOW_IMPROVE_CHANGE_LIST.md:181`) — is superseded by `KD-111` for the switch-off only. **Scope stays inside the order: switch it off, prove it is harmless to do so, nothing more.**

## r1 → r2 (Langston SENT BACK, Discord 1574035433191641152)
| item | r1 said | r2 |
|---|---|---|
| F-1 | the cadence check "already marks it non-compliant … and still does" | **wrong.** The switch-off flips that reader's `all_tasks_compliant` from true to false once the task ages out of the window. Stated in the reader census; the reader is unreachable from the client and its route currently fails, so nothing sees it. Named for cleanup. |
| F-2 | 1(c) reads `out.log`; 3(c) "3 users × error + stack" | `out.log` holds ~2 h, so a read of it passes vacuously. 1(c) now reads every rotated `out__*` file covering the window (`.gz` included), with a log-line control; 3(c) reads `error.log` and its rotated set. The six lines are 3 users × 2 runs. |
| F-3 | led with the alert-file read | leads with the code census. The file read cannot discriminate (no registry task has ever been named in it) and is kept only as a supplement, labelled. |
| F-4 | plan-row re-cite only | the `#1264` entry, its `HOME:` line, the after-live line and `KD-111` are all cited at the ref (header). |
| provenance | Langston could not read the two commits | quoted inline below. |

## Objectives
1. **Switch off the daily AI brief's scheduling** — remove its import (`server/index.ts:683`) and its registration (`server/index.ts:723-732`) from the scheduler start-up block, leaving one comment that names `#1264`, `KD-111` and the after-live cleanup line. *Verify:*
   - (a) at the ref, `git grep aiSummaryTask -- server` returns only `server/services/ai-summary-task.ts` itself (its own export at `:118`).
   - (b) after deploy, `GET /api/schedulers/status` (read via `dt-api`) lists no `AI Summary` task. **Positive control:** the same read lists `Market Scan` (today's pre-change read lists both; `AI Summary` shows `lastRun 2026-11-22T05:08:41.627Z`, `nextRun 2026-11-23T05:08:41.817Z`).
   - (c) **no `[AISummary]` line in the first 25 h of process uptime after the restart.** The task's first run comes 24 h after start-up (`intervalMs`, no `getInitialDelay`), so 25 h covers the run that would have happened. **Instrument:** `out.log` keeps only about two hours (at 13:00Z it began 11:00:29Z), so the read enumerates **every** file in `/var/log/dawntrader/` that covers the window — `out.log`, `out__*.log`, and `out__*.log.gz` read with `zgrep` — and lists each file's name and time span to show the window is covered end to end. **Log-line control:** the same read counts `[MarketScan]` lines across the same files (> 0 required; `out__2026-11-22_11-00-26.log` holds 924 today). **Instrument control, run before deploy:** the same enumeration finds today's 4 `[AISummary]` lines (2 × "Starting", 2 × "complete", all 05:08:41Z) in `out__2026-11-22_11-00-26.log`. **Expected without the change:** 4 lines, not 2 — the first interval after a restart runs twice (`RUNNING_ISSUES #1039`, below). Also zero new `ai_transparency_log` rows named `AI Summary` in the same window (control: `Market Scan` rows > 0). If a second restart lands inside the window, (b) is re-read on the new process and (c) counts uptime from that restart.
2. **Prove what it writes is read by nothing current, and state the one reader that changes.** *Verify:* the reader census below, repo-wide at the ref, tests excluded, every reader named with `path:line`. One reader — the cadence check in the database cross-check route — does change; the census states how, why it is harmless, and where its cleanup goes.
3. **Prove no alert depends on it.** *Verify:*
   - (a) **code census (the test):** `executeTask` writes only to `ai_transparency_log` (`scheduler-registry.ts:85-105`) and calls no alert producer; the string `AI Summary` appears in `server/` at exactly `routes.ts:15758`, `storage.ts:2175-2176` and `ai-summary-task.ts:8`; no alert producer in `server/` references the task, its name or the `daily_briefs` table (`git grep` at the ref, every hit listed).
   - (b) **supplement, cannot discriminate:** the whole `system-alerts.jsonl` holds zero rows matching `aisummary | ai summary | daily brief | daily_brief | ai_summary | not found in registry` (pre-change: 3,561 lines, 0 hits). Control `B-ENTRY-GATE` (25 hits) shows the file is readable — but `Market Scan` is also 0, so no registry task has ever been named in that file and this read could not have seen the class. It is reported, never cited as the proof.
   - (c) **the daily error lines stop.** `console.error` writes to `error.log`, not `out.log` (`ai-summary-task.ts:90`). Today: 6 `[AISummary] Error creating summary for user … invalid input value for enum trading_mode` lines at 05:08:41Z = 3 users × 2 runs (users `56523b4f…`, `05066a82…`, `6c591801…`); 18 lines carry `AISummary` in all (6 errors + 12 stack lines). After deploy: zero such lines across `error.log` and every rotated `error__*` file covering the same 25 h window, enumerated as in 1(c). **Instrument control, before deploy:** the same enumeration finds today's 6.
4. **No fix, no deletion.** The broken call stays broken and the file stays. *Verify:* `git diff <base>..<ref> -- server/services/ai-summary-task.ts` is empty; `.tsc-baseline.json` is unchanged (its `ai-summary-task.ts` entry at `:243` stays, because `tsconfig.json:2` still compiles `server/**/*`); the deletion sits on the after-live list (rule 18 disposition (b)), cited at the ref in the header.

## Provenance (§2 1.b, TIER 1 — this batch removes behaviour)
**Corpora searched:** `git log -S` (not path-limited), `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the completion reports and change lists (`git grep` at the ref), `attached_assets/`.

**Introduced — `1590221f7a37c0e735b41c07cf93bc265595d326`, 2025-10-09 17:23:38Z (Replit), message verbatim:**
> Add AI transparency panel and automated scheduler tasks
>
> Introduces a new `/ai-transparency` page for monitoring scheduler activity and logs. Integrates four new autonomous scheduler tasks (Screener Recalibration, Market Scan, AI Summary, System Health Check) into the `SchedulerRegistry`. Adds API endpoints for managing and viewing scheduler statuses and transparency logs. Updates database schema with `aiTransparencyLog` table. Modifies user registration to auto-generate email if not provided.

Files: `server/services/ai-summary-task.ts` (+115, new), `server/services/scheduler-registry.ts` (+132, new), `server/index.ts` (+62). Excerpt of the new file as introduced:
```ts
export class AISummaryTask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = 'AI Summary';
  description = 'Compiles daily AI summary for Daily Brief (Paper + Live combined overview)';
  frequency = 'Daily at UTC midnight';
  intervalMs = 24 * 60 * 60 * 1000; // 24 hours
  ...
      const liveTrades = await storage.getTrades(userId, { limit: 1000 });
```
Spec: `attached_assets/Pasted-Step-4-Autonomous-Schedulers-AI-Transparency-Panel-Milestone-11-...txt:55` (*"3. AI Summary Task"*). **Built to** compile a once-a-day overview of paper and live trades into one Daily Brief row per user, shown on the main Dashboard. The "daily at UTC midnight" label was never true: with no `getInitialDelay` its first run is 24 h after start-up.

**Broken — `5d785f2647d27fdf309ec338a71d61279870f089`, 2025-10-25 18:01:08Z, message verbatim:** *"Remove user ID from service layer calls to use mode-based queries"*. The hunk in this file:
```diff
-      const liveTrades = await storage.getTrades(userId, { limit: 1000 });
+      const liveTrades = await storage.getTrades({ limit: 1000 });
```
`getTrades(mode, filters?)` (`server/storage.ts:315`) takes the object as the mode, so Postgres refuses `trading_mode = '{"limit":1000}'` on every run. The TypeScript error was grandfathered (`.tsc-baseline.json:243`).

**Why the break is invisible:** `createSummaryForUser` catches and logs each user's error, so `run()` returns normally and the scheduler writes `success = true` every day — 178 `AI Summary` rows in `ai_transparency_log`, all `success = t`, first 2025-11-25, latest 2026-11-22 05:08:42Z, so every one post-dates the break. (Langston's control: `Market Scan` 48,396 rows with 1 failure, so the failure path in that table is reachable.)

**Disposition: (4) connected but should be REMOVED**, staged by Kyle's order: disconnected now (this batch), deleted after live (rule 18 (b)). Precedent in the same registry: `B-HEALTH-CHECK-REMOVAL` (`#1147`, `3b4df5bf5`), which deleted the System Health Check task introduced by the same commit.

## Entry-point census (§9.5(a-ii), repo-wide at the ref, tests excluded)
**Exactly two ways the task runs:** (1) registration at `server/index.ts:723-732`, started by `schedulerRegistry.startAllTasks()` at `:835`; (2) the manual `POST /api/schedulers/run` (`server/routes.ts:15522`), which calls `executeTask(taskName)`. `autonomy-scheduler.ts:1004-1069` and `jobs/learning-feedback.ts` start only their own named tasks, none of them this one. **After the change, (2) answers `500 Task AI Summary not found in registry`** (`scheduler-registry.ts:66-69`); no client code calls that route (`git grep "schedulers/run" -- client`: none).

**The double first run (cross-reference, no new work).** `startTask` arms a `setTimeout` at `getInitialDelay?.() ?? intervalMs` and a `setInterval` at `intervalMs` (`scheduler-registry.ts:42-49`), so the first interval after every restart runs the task twice. That is why today shows two `AI Summary` rows 0.217 s apart and 3 users × 2 error lines. It is `RUNNING_ISSUES #1039` (`B-SCHEDULER-FIRST-TICK`, plan row 73, Infra Claude), already homed — recorded here only so the Step-7 counts are read correctly.

## Reader census (§9.5(a)/(a-ii))
**State it writes, and every reader:**
| state | writers | readers | effect of switching off |
|---|---|---|---|
| `daily_briefs` rows | `ai-summary-task.ts:69` (this task); `daily-brief.ts:120` via the manual `POST /api/daily-briefs/update` (`routes.ts:4998`) — not scheduled by this task, unaffected | `GET /daily-briefs/today`, `/daily-briefs`, `/daily-briefs/:date` (`routes.ts:4949-4990`); `portfolio-overview.tsx:70-72` (`enabled: !isPaper`, so dark in paper mode); `DailyBriefCard` on `dashboard.tsx:113` | **none** — 73 rows, 4 users, newest `created_at` 2025-10-24 00:01:02Z: nothing has been written since the break, so every reader sees identical data before and after |
| `ai_transparency_log` rows named `AI Summary` | `scheduler-registry.ts` `executeTask` (one row per run) | (i) the cadence check in `GET /learning/database-cross-check` (`routes.ts:15676`; `storage.getSystemSchedulerLogs(200)` at `:15757`, task list `:15758`, comparison `:15764-15783`); (ii) `GET /schedulers/transparency-logs` (`routes.ts:15546`) → `ai-transparency.tsx:41`, a display list | **(i) CHANGES — see below.** (ii) stops gaining a daily false "success" row. |

**(i) The cadence check flips, and that is harmless.** It does not compare against the task's interval; it takes the two newest rows per task inside the newest 200 scheduler rows and passes when they are ≤ 4 h apart. Today `AI Summary` has exactly 2 rows in that window, 0.217 s apart (the `#1039` double run), so it reads `meets_requirement: true`, and with `Market Scan` and `Screener Recalibration` also passing, `all_tasks_compliant` is **true**. After the switch-off, `AI Summary` ages out of the 200-row window in about 33 h (Market Scan writes about 190 rows per 31 h), falls to the else branch (`:15776-15783`: `last_run: null`, `meets_requirement: false`), and **`all_tasks_compliant` becomes false.** *(Mechanism and numbers re-derived by Langston from the code and the table, Discord 1574035433191641152.)* Why it does not matter: `all_tasks_compliant` and `scheduler_cadence` each occur once repo-wide, the route has no client caller, and **the route currently fails before it answers** — a live read through `dt-api` on 2026-11-22 returned `500 {"error":"column \"user_id\" does not exist"}`, matching `error.log` `2026-11-22 12:56:19 +00:00: Database cross-check error: error: column "user_id" does not exist`. So no caller sees the field today, before or after this change. *(Which query in the route raises it was NOT RE-READ; that failure is not this batch's — it is recorded on `#1264` for the cleanup item.)*
**Cleanup, named:** the three-name task lists at `routes.ts:15758` and `storage.ts:2176` are what cause the flip. They stay in this batch (they read history; removing a name is gutting work) and are written into the after-live deletion line with the route's own 500.

**None of these feeds trading, the SQE, the RTB pool, the VTS, sizing, or any alert.** `expert-insights-metrics.ts` reads only `Weekly Expert Insights Update` rows (`:145-179`), not this task's.

## Deploy
Its own deploy, no migration. **Placed after the B-ENTRY-GATE Step-7 window closes (2026-11-23 21:00Z)** so this batch adds no restart to that read. Staging is behind the review branch (alert `d92423ce`, deploy-drift); this deploy carries the branch head and is expected to clear it — the alert is resolved on that deploy's read-back, not before.

## Out of scope
- Fixing the `getTrades` call, deleting `ai-summary-task.ts`, the `daily_briefs` table or its routes, the Daily Brief card, the 178 history rows, the task-name lists, or the cross-check route's `user_id` failure — all cleanup work, placed after live.
- The manual `daily-brief.ts` service and its route — not scheduled, not broken by this batch.
- The double first run — `#1039`, Infra Claude.
