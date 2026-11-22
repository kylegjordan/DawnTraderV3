# B-AI-BRIEF-OFF — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture

**Issue:** `#1264` · **Decision:** `KD-111` · **Scope:** `Claude Comms and Packages/Scope Files/B_AI_BRIEF_OFF_SCOPE.md` r2 (Langston Step-1 PROCEED, Discord `1574054372231483554`, read at `75dcbaaf5`) · **Audited at:** `origin/migration/aws-supabase` = `8ccdf750add53fd7e7877aed02912c082f1167b0` · **Owner:** CC-B (NEW Claude)

The audit comes first (A-sections); every plan item (P-sections) names the finding it falls out of. Nothing in the plan is unaudited.

## PREVIOUSLY STATED vs NOW

| item | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| `daily_briefs` client readers | scope reader census: `portfolio-overview.tsx:70-72` and `DailyBriefCard` (via `dashboard.tsx:113`), 2 readers | **4 files, 6 call sites:** `DailyBriefCard.tsx:73`, `portfolio-overview.tsx:71`, `briefings.tsx:87`, `:316`, `:318`, `daily-brief.tsx:53-54` | Langston F-5 under-enumeration; re-derived here by `git grep` at the ref (A3). The row's conclusion does not change — see A3 for why the row is informational. |
| `Market Scan` rows in `ai_transparency_log` (the control) | 48,396 rows, 1 failure (scope, Langston's read) | **48,404 rows, 1 failure** (`dt-sql`, 2026-11-22 ~13:35Z, latest 13:28:43Z) | The table grows about every ten minutes; the count is a live control, not a fixed number. |
| `AI Summary` rows | 178, all `success = t`, latest 2026-11-22 05:08:42Z | **unchanged: 178, 0 failures, latest 05:08:42.048Z** | Same read, A2. |
| `daily_briefs` | 73 rows, newest `created_at` 2025-10-24 00:01:02Z | **unchanged: 73, newest 2025-10-24 00:01:02.169Z** | Same read, A3. |
| scheduler tasks registered (System Impact Map §9.8) | `server/index.ts` 12, `autonomy-scheduler.ts` 25, `learning-feedback.ts` 1 = 38; `#1039` double run affects "35 of the 38" | after this batch: **index.ts 11, total 37; 34 of the 37** | `AI Summary` is one of the 35 (no `getInitialDelay`, A1). Written into the System Impact Map at Step 10 (P6). |

---

## PART A — THE AUDIT

### A1. Source 1, the code at the ref — what runs it, and the only two entry points
- `server/index.ts:683` imports `aiSummaryTask`; `:723-732` registers it; `:835` `schedulerRegistry.startAllTasks()` starts every registered task.
- `server/services/ai-summary-task.ts:7-11`: `name = 'AI Summary'`, `intervalMs = 24 * 60 * 60 * 1000`, **no `getInitialDelay`** (0 occurrences in the file).
- `server/services/scheduler-registry.ts:26-52` `startTask`: first run by `setTimeout` at `getInitialDelay?.() ?? intervalMs`, then a `setInterval` at `intervalMs`. So this task first runs 24 h after start-up, twice (`#1039`, Infra Claude, already homed).
- **Repo-wide reference census at the ref, code paths only** (`git grep "AI Summary|aiSummaryTask|ai-summary-task|AISummary"` over `server client shared scripts tests` and the two baseline files, the task's own file excluded) — **every hit:**

| hit | what it is | this batch |
|---|---|---|
| `server/index.ts:683`, `:724-728` | the import and the registration | **removed** (P1) |
| `server/routes.ts:15758` | the cadence check's task-name list | kept; named for cleanup (A4) |
| `server/storage.ts:2175-2176` | the scheduler-log query's task-name list | kept; named for cleanup (A4) |
| `.tsc-baseline.json:243` | the grandfathered type error in the task file | unchanged (A6) |
| `.baseline-userid-files.txt:7` | userId-inventory list | unchanged |
| `scripts/classify-baseline.mjs:145` | a path regex that classifies baseline entries | unchanged |

  **No test file references the task** (the `tests` paths returned no hit; the instrument is the same `git grep` that returned the six hits above).
- **Entry points (scope §Entry-point census, re-confirmed):** exactly two — the registration (`index.ts:723-732` → `:835`) and the manual `POST /api/schedulers/run` (`routes.ts:15522` → `executeTask`). After P1 the manual route answers `500 Task AI Summary not found in registry` (`scheduler-registry.ts:66-69`); no client calls it.

### A2. Source 2, runtime and database (read 2026-11-22 ~13:35Z)
- `GET /api/schedulers/status` via `dt-api`: **38 tasks**; `AI Summary` `lastRun 2026-11-22T05:08:41.627Z`, `nextRun 2026-11-23T05:08:41.817Z`, `idle`; `Market Scan` `lastRun 13:28:42.826Z` (the positive control for 1(b)).
- `ai_transparency_log` (`dt-sql`; column `executed_at`, `shared/schema.ts:1602`): `AI Summary` 178 rows, 0 with `success = false`, latest 05:08:42.048Z; `Market Scan` 48,404 rows, 1 failure.
- **Why every row says success** (scope provenance): `createSummaryForUser` catches each user's error (`ai-summary-task.ts:89-91`), so `run()` returns normally and `executeTask` records a success.

### A3. The `daily_briefs` reader row — Langston F-5, re-derived
**The row is informational, and this is the lead:** the task's only write is `storage.createDailyBrief` at `ai-summary-task.ts:69`. It is unreachable: `:47` `storage.getTrades({ limit: 1000 })` passes the object as the `mode` argument (`storage.ts:315`), Postgres refuses it, and `:89` catches it — so control never reaches `:69`. The table confirms it: 73 rows, newest `created_at` 2025-10-24 00:01:02Z, which predates the break (`5d785f2647`, 2025-10-25). **Switching off a writer that has not written for thirteen months cannot change what any reader sees.**

The client readers, enumerated in full at the ref (`git grep "daily-brief|daily_briefs|dailyBrief" -- client`, every API call site):

| reader | call |
|---|---|
| `client/src/components/DailyBriefCard.tsx:73` | `/api/daily-briefs/today` |
| `client/src/components/trading/portfolio-overview.tsx:71` | `/api/daily-briefs`, limit 30 |
| `client/src/pages/briefings.tsx:87` | `/api/daily-briefs/today` |
| `client/src/pages/briefings.tsx:316`, `:318` | `/api/daily-briefs` with or without a date range |
| `client/src/pages/daily-brief.tsx:53-54` | `/api/daily-briefs/:date` or `/today` |

Server side unchanged from the scope: the three `GET` routes at `routes.ts:4949-4990`, and the separate manual writer `daily-brief.ts:120` behind `POST /api/daily-briefs/update` (`routes.ts:4994`), which this batch does not touch.

### A4. Source 3, the System Impact Map (§9.8 Scheduler Registry, `:976-982`)
- The registry's consumers, the `#1039` defect line and the task counts (`:981-982`) are the only places it names this task's population. **Content update owed at Step 10** under §17 (a runtime component removed), even at `non_architecture` — Langston's Step-1 note: index.ts 12 → 11, registered 38 → 37, "35 of the 38" → "34 of the 37".
- The cadence-check flip (scope reader census (i)) sits on a route the map does not list as a consumer of the registry log. The route has no client caller and currently answers `500 column "user_id" does not exist`. Not a gap this batch fills; it is on the cleanup line (P6).

### A5. Source 4, the System Manual (§12, `:7715-7770`)
- The registered-tasks table (`:7742`) lists `3 | AI Summary | ai-summary-task`. **Owed at Step 10:** mark that row switched off (`B-AI-BRIEF-OFF`, `KD-111`), file kept, deletion after live.
- The "POST-AUDIT INVESTIGATION REQUIRED" note lists AI summaries among the non-core tasks. This batch answers it for this one task; the note gets a dated line saying so.
- No contradiction between scope and manual. The manual is silent on the task never having run since 2025-10-25; the Step-10 row update records that.

### A6. Build and baseline
- `tsconfig.json:2` compiles `server/**/*`, so `ai-summary-task.ts` is still compiled after the import goes; its grandfathered error (`.tsc-baseline.json:243`) stays, and the baseline file is unchanged. Gate: `node scripts/check-tsc-baseline.mjs` before the push.
- Removing a dynamic `import()` and a `registerTask` call changes no exported type and no other module's imports (A1 census: the import at `:683` is the only one).

### A7. Source 5, the ledger
`#1264` (owner CC-B, `HOME:` at `f4e8f6330`), `KD-111` (`f4e8f6330`), plan row `3b`, and the after-live line `Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md:171` (Langston F-8: cited here with the full path). Related, not reopened: `#1039` (double first run, Infra), `#1147` / `B-HEALTH-CHECK-REMOVAL` (same-registry precedent, `3b4df5bf5`). The 69 enum errors withdrawn under the 10-19 rule (`B_WORKFLOW_IMPROVE_CHANGE_LIST.md:181`) are superseded by `KD-111` for this switch-off only.

### A8. Source 6, provenance
Read and quoted in the scope at Step 1 (introduced `1590221f7a37c0e735b41c07cf93bc265595d326`, broken `5d785f2647d27fdf309ec338a71d61279870f089`; spec `attached_assets/Pasted-Step-4-Autonomous-Schedulers-AI-Transparency-Panel-Milestone-11-...txt:55`). Langston confirmed both at the ref. `bridge/canonical/` was not re-read for this step: the task post-dates the pre-governance corpus (introduced 2025-10-09) and nothing about its behaviour is disputed.

### A9. The deploy windows the restart touches (Langston F-6)
`1-system-manual/DEPLOY_WINDOWS.jsonl` at the ref, 42 lines, replayed (open / close / amend): **seven windows open.** This batch deploys **not before 2026-11-23 21:00Z**. *(r2: the "never 02:00-02:30Z" fence is dropped — Langston asked for its citation and none exists in the governance corpus; it is a carried habit from sibling pre-audits with no recorded reason.)*

| window (owner) | open until | effect of this batch's restart | `--in-window` |
|---|---|---|---|
| `B-ENTRY-GATE` (cc-b) | 2026-11-23 21:00Z | none — the deploy lands after it ends | no |
| `B-PRICE-SIDE-BY-JOB` 8c (cc-c) | 2026-11-23 09:45Z, review by 18:00Z | none — it ends first, and the row says a restart with no crypto-admission change splits nothing; this batch changes no crypto admission | no |
| `B-XSTOCK-BID-TRIGGER-RELAND` (cc-c) | 2026-11-23 03:00Z | none — it ends first, and the deploy carries the retirement (`8fac86e5e` is an ancestor of the audited ref) | no |
| `B-RTB-PROMOTION-RETRY-STORM` / row 9j (cc-b) | one session after row 9j's deploy (expected by 11-24) | **ordering:** a deploy *before* row 9j's deploy disturbs nothing; a deploy *after* it would split its churn and park counts. This batch deploys before row 9j's code is deployed, or rides the same deploy | yes |
| `B-TOKEN-WATCH-FOLLOWUP-MEMORY` (cc-infra) | 2026-11-27 | box-wide CPU only; owner attributes a slow hour to the deploy | yes |
| `B-TOKEN-WATCH-BIRTH-CAP` (cc-infra) | 2026-11-27 | box-wide CPU only; owner attributes a late switch to the deploy | yes |
| `B-XSTOCK-BAR-AVAILABILITY` (cc-c) | 2026-12-09 | must not roll back past the R2' commit and must not cross the 12-09 00:15Z fire. This deploy carries the branch head (no rollback) and lands days before 12-09 | yes |

At deploy time the replay is re-run (the register changes), and every window still open is named.

---

## PART B — THE PLAN

### P1. The code change *(from A1)*
In `server/index.ts`: delete the import at `:683` and the registration block at `:723-732`. In their place, one comment: the AI Summary task is switched off by `B-AI-BRIEF-OFF` (`#1264`, `KD-111`); the file stays until the after-live cleanup line in `PRE_LIVE_SPRINT.md`. No other file changes in code. `ai-summary-task.ts` is untouched (scope OBJ-4).

### P2. Gates before the push *(from A6, A1)*
- `node scripts/check-tsc-baseline.mjs` — no new error, baseline file unchanged.
- The server unit suite (vitest). No test references the task (A1), so nothing should change; it is run as a regression check, not as evidence for the switch-off.
- Scope 1(a): `git grep aiSummaryTask -- server` at the pushed ref returns only `server/services/ai-summary-task.ts`.
- Scope 4: `git diff 8ccdf750a..<ref> -- server/services/ai-summary-task.ts .tsc-baseline.json` is empty.

### P3. Instrument controls, run before the deploy *(from A2, scope 1(c), 3(c))*
Recorded in the Step-4 change list so the after-read has a baseline taken by the same instrument:
- the `out*` enumeration (`out.log`, `out__*.log`, `out__*.log.gz` via `zgrep`) finds the pre-change `[AISummary]` lines; the same files hold `[MarketScan]` lines;
- the `error*` enumeration finds the 6 `[AISummary] Error creating summary` lines of 2026-11-22 05:08:41Z (3 users × 2 runs);
- `GET /api/schedulers/status` lists `AI Summary` and `Market Scan` (A2).

### P4. Deploy *(from A9)*
Own deploy, `dt-deploy <full-40-sha> --by cc-b`, strictly after the `B-ENTRY-GATE` increment-C read is TAKEN (not merely after 2026-11-23 21:00Z — C-2), before row 9j's deploy or riding it. Re-run the A9 replay first and name every open window. Staging is behind the review branch (alert `d92423ce`); this deploy carries the branch head. `d92423ce` is CC-A's and is **not hand-resolved**: it clears itself on the first drift run after the deploy, and Step 7 confirms that it did.

### P5. Verification and how the batch closes *(from A1, A2, Langston F-7)*
- **The discriminating reads, which close the objective:** 1(a) the grep at the ref (P2); 1(b) `GET /api/schedulers/status` on the new process lists no `AI Summary` and does list `Market Scan`; 3(a) the code census (scope 3(a), re-run at the deployed ref).
- **The confirmatory reads:** 1(c) no `[AISummary]` line and no new `AI Summary` row in `ai_transparency_log` across 25 h of uptime (control: `[MarketScan]` lines and `Market Scan` rows > 0); 3(c) no `[AISummary]` error line across the same window. **They cannot fail on their own while 1(b) passes** — a process with no registered task has nothing to run — so they confirm, they do not prove (F-7). The batch closes on 1(a) + 1(b) + 3(a) plus whatever of the 25 h has elapsed. **If another deploy lands inside the 25 h, the read is reported as shortened, with its actual span; the clock is not restarted.**
- 3(b), the alerts-file read, stays labelled as unable to discriminate (no registry task has ever been named in that file; `Market Scan` is also 0).
- Verification in the staging UI (Step 7): the AI transparency page's scheduler list, read in Claude-in-Chrome, shows no `AI Summary` task. This is the one AI-page read the batch makes, inside `KD-111`.

### P6. Governance at Step 10 *(from A4, A5, A7)*
- **System Impact Map** §9.8: counts 12 → 11 (index.ts), 38 → 37, `#1039` "35 of the 38" → "34 of the 37"; one dated line that `AI Summary` is switched off.
- **System Manual** §12: the table row marked switched off; a dated line on the "POST-AUDIT INVESTIGATION REQUIRED" note.
- `RUNNING_ISSUES` `#1264`: annotated with the deploy sha and the read.
- `Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md:171`: the line gains the two task-name lists (`routes.ts:15758`, `storage.ts:2176`) and the cross-check route's `user_id` 500, as the scope said it would.
- **System Manual** §12 header count 12 → 11 (`SYSTEM_MANUAL.md:7737`) (C-5).
- The rest of the Tier-1 ledger as the class matrix sets it for `non_architecture`.

### P7. The deploy-window row *(from A9, Langston F-6, KD-56; my R-3 forward rule)*
Filed in this commit as an `open` row in `1-system-manual/DEPLOY_WINDOWS.jsonl`. Its `until_event` is the batch's longest leg — the end of the 25 h confirmatory read — not the first read-back.

### P8. Langston Step-2 conditions, folded in at Step 3 (r2, Discord `1574059372915593276`)
- **C-1 — enumerate the deploy delta.** Staging runs `c21c1502a`; the branch head between it and this batch carries other sessions' work (CC-C's R2' migration and capacity-gate script, CC-INFRA's token-watch route and page). At deploy time: list every commit in `<deployed sha>..<deploy sha>`, run the A9 effect column on that delta, and get CC-C's and CC-INFRA's go-ahead for their commits — or deploy a sha that excludes them.
- **C-2 — P4 runs only after the increment-C read is taken** (the EntryWindow tally is in-process; a restart before the read destroys it).
- **C-3 — if row 9j ships alone first,** this batch waits for the end of 9j's read rather than splitting it.
- **C-4 — `GOVERNANCE_EXCEPTIONS.md` `open` row** filed in the same commit as P1; flipped to `open-retired` at close before its nag is hand-resolved.
- **C-5 — the System Manual §12 header count** (P6).

## Reader record
No fresh reader was spawned for this step. Load-bearing claims and their standing: the unreachable-write mechanism (A3) is cited to `ai-summary-task.ts:47`/`:69`/`:89` and `storage.ts:315` and was re-derived by Langston at Step 1; the reference census (A1) is a complete `git grep` result printed in full; the window replay (A9) is a script over every line of the register. **NOT RE-READ by a second reader: A9's per-window effect column.**
