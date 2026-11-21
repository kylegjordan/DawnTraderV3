# Step 7 evidence
HEAD 7538c9244258f54526de1ef87fca6e991192c735
origin f8eb0f4c14f01f7ba3691e345d338b572606a776
## OBJ-1

### $ node scripts/crew-tooling/ledger-validate.mjs --self-test
exit 0
  PASS  sample ledger is valid
  PASS  seeded missing link (done, no diff)  <- got [missing-link] want missing-link
  PASS  seeded missing link (no plan item)  <- got [missing-link] want missing-link
  PASS  seeded missing actor (top level)  <- got [missing-actor] want missing-actor
  PASS  seeded missing actor (Step-8 proof)  <- got [missing-actor] want missing-actor
  PASS  seeded done-while-unproven (Step-7 unproven)  <- got [done-while-unproven] want done-while-unproven
  PASS  seeded done-while-unproven (no Step-8)  <- got [done-while-unproven] want done-while-unproven
  PASS  closed-unproven without a home  <- got [missing-field] want missing-field
  PASS  reader without stale behaviour  <- got [missing-field] want missing-field
  PASS  objectives given as an object, not an array  <- got [bad-type] want bad-type
self-test: PASS 10 FAIL 0
## OBJ-4
commit
commit

### $ node scripts/crew-tooling/code-refs.mjs toCanonical
exit 0
{
  "tool": "code-refs.mjs",
  "tool_version": "1.0",
  "root": "C:\\DawnTraderV3-pm",
  "symbol": "toCanonical",
  "ts_version": "5.6.3",
  "tsconfigs": [
    "tsconfig.json",
    "server/tsconfig.json",
    "(test files added)"
  ],
  "program_files": 1327,
  "unresolved_surfaces": [
    "raw SQL strings (table and column names in sql`...` or text queries)",
    "string-keyed access (obj[name], route strings, config keys, JSON)",
    "dynamic import() with a computed path, require() of a computed path",
    "JavaScript (.mjs/.js/.cjs) anywhere, and shell, Python and systemd files: none is in either TypeScript program. scripts/ holds most of the JavaScript, including the crew tooling itself",
    "TypeScript outside both tsconfig includes (client/src, shared, server): scripts/ is the largest (about 40 files), then docs/, e2e/, tests/, types/, chaplet/, diagnostics/ and the root config files (drizzle, vite, vitest, playwright, tailwind); and server/legacy and build output, excluded"
  ],
  "declaration": {
    "file": "server/services/utils/symbol-canonicalizer.ts",
    "line": 94
  },
  "counts": {
    "references_total": 66,

### $ node scripts/crew-tooling/code-refs.mjs toCanonical --root .
exit 0
{
  "tool": "code-refs.mjs",
  "tool_version": "1.0",
  "root": "C:\\DawnTraderV3-pm",
  "symbol": "toCanonical",
  "ts_version": "5.6.3",
  "tsconfigs": [
    "tsconfig.json",
## OBJ-5

### $ node scripts/crew-tooling/census.mjs --path server/services/active-portfolio-manager.ts
exit 0
CENSUS active-portfolio-manager at 7538c9244 (working tree)
reach (1 reached, 0 not):
  server/services/active-portfolio-manager.ts  <- server/index.ts:522 (dynamic import) -> server/services/active-engine-service.ts:1570 (dynamic import)
entry points touching the target (3):
  [start] server/services/active-portfolio-manager.ts:200  await this.executionEngine.start(source);
  [start] server/services/active-portfolio-manager.ts:203  await this.microExecutionService.start();
  [start] server/services/active-portfolio-manager.ts:219  await this.signalOrchestrator.start(async (signal: StrategySignal) => {
searched: {"ref":"7538c9244 (working tree)","typescript_program_files":null,"import_graph_files":1484,"start_files":["server/index.ts"],"server_files_scanned_for_entry_points":672,"entry_point_lines_total":173,"pm2_entries":2,"systemd_unit_files":43,"raw_sql_files_scanned":null}
cannot see:
  - type-aware uses: --path and --table run no language-server search, so readers of the target are seen only as import edges (leg 2) or raw text (--table)
  - string-keyed access (obj[name], route strings, config keys, JSON)
  - shell, Python and systemd files are read for entry-point lines only, never as importers
  - import() with a computed path, and require() of a computed path (no edge in the reach graph)
  - routes reached by HTTP string (an API path is reach by request, not by import)
  - systemd units and cron on a host but not in this repo; PM2 runs dist/ build output, mapped back to server/index.ts by assumption
  - entry points not using .start / setInterval / cron.schedule / cron.createTask / cronRegistry.register (setTimeout chains, event listeners, queue consumers)

### $ node scripts/crew-tooling/census.mjs --path scripts/crew-tooling/census.mjs
exit 1
CENSUS census at 7538c9244 (working tree)
reach (0 reached, 1 not):
  scripts/crew-tooling/census.mjs  NOT REACHED from any start file by a resolvable import - a test, a script run by hand, a string-keyed or computed import, or dead code
entry points touching the target (0):
searched: {"ref":"7538c9244 (working tree)","typescript_program_files":null,"import_graph_files":1484,"start_files":["server/index.ts"],"server_files_scanned_for_entry_points":672,"entry_point_lines_total":173,"pm2_entries":2,"systemd_unit_files":43,"raw_sql_files_scanned":null}
cannot see:
  - type-aware uses: --path and --table run no language-server search, so readers of the target are seen only as import edges (leg 2) or raw text (--table)
  - string-keyed access (obj[name], route strings, config keys, JSON)
  - shell, Python and systemd files are read for entry-point lines only, never as importers
  - import() with a computed path, and require() of a computed path (no edge in the reach graph)
  - routes reached by HTTP string (an API path is reach by request, not by import)
  - systemd units and cron on a host but not in this repo; PM2 runs dist/ build output, mapped back to server/index.ts by assumption
  - entry points not using .start / setInterval / cron.schedule / cron.createTask / cronRegistry.register (setTimeout chains, event listeners, queue consumers)

### $ node scripts/crew-tooling/census.mjs --table nonexistent_zz_table
exit 1
CENSUS nonexistent_zz_table at 7538c9244 (working tree)
table nonexistent_zz_table: no pgTable declaration - NO pgTable declaration in the schema files: the table is reached only by raw SQL (or is declared elsewhere) - the type-aware leg does not apply
reach (0 reached, 0 not):
entry points touching the target (0):
raw SQL (0 lines, 0 with a keyword on the line) - TEXT MATCH - every line naming the table; [sql] marks an SQL keyword or call on the same line (a multi-line query names the table on a line of its own, so unmarked lines are kept). Not type-checked; includes comments; misses a table name built at runtime
searched: {"ref":"7538c9244 (working tree)","typescript_program_files":null,"import_graph_files":1484,"start_files":["server/index.ts"],"server_files_scanned_for_entry_points":672,"entry_point_lines_total":173,"pm2_entries":2,"systemd_unit_files":43,"raw_sql_files_scanned":1080}
cannot see:
  - type-aware uses: --path and --table run no language-server search, so readers of the target are seen only as import edges (leg 2) or raw text (--table)
  - string-keyed access (obj[name], route strings, config keys, JSON)
  - shell, Python and systemd files are read for entry-point lines only, never as importers
  - import() with a computed path, and require() of a computed path (no edge in the reach graph)
  - routes reached by HTTP string (an API path is reach by request, not by import)
  - systemd units and cron on a host but not in this repo; PM2 runs dist/ build output, mapped back to server/index.ts by assumption
  - entry points not using .start / setInterval / cron.schedule / cron.createTask / cronRegistry.register (setTimeout chains, event listeners, queue consumers)
## OBJ-6

### $ node scripts/crew-tooling/history.mjs server/services/ml-calibration.ts --ref origin/migration/aws-supabase
exit 0
HISTORY server/services/ml-calibration.ts at origin/migration/aws-supabase (f8eb0f4c14f0; no fetch performed): 6 commits, 2 attributed to 2 batches, 4 unattributed
  B59  [a254601d4]  docs: BATCH_59_COMPLETION_REPORT.md, BATCH_59_PRE_AUDIT.md, BATCH_59_SCOPE.md
  B55  [f52c87e17]  docs: BATCH_55_COMPLETION_REPORT.md, BATCH_55_SCOPE.md
unattributed (4):
  c66233340 2026-01-28 Improve ML calibration by correctly ingesting HYBRID trades
  bce183a11 2026-01-26 Add centralized logging for all trading adjustment services
  dc83c1bbc 2026-01-10 Update trading simulator to use new phase-10 metrics and isolate data
  b141cbfdf 2026-01-04 Update trading data with new evaluation metrics and timestamps
1-system-manual/RUNNING_ISSUES.md: 6 entries cite ml-calibration.ts
  :16 - **#607 ✅ WITHDRAWN 2026-09-30 (CC-B, W40 census handover): not a defect. The non-finite rows are twin records written with `countsInAggreg
  :77 - **#591 OPEN 2026-07-28 (CC-A; surfaced by the #558 PHASE-B PRE-DROP CENSUS — §9.5(a)+(a-ii)) — SURVIVING READERS OF THE RETIRED `finalScor
  :144 - **#582 OPEN 2026-07-25 (CC-A; #558 A1 Step-4 deferral — Langston §9.4 condition, HOME NAMED) — THE `finalScore` TELEMETRY-READER SLICE: RE
  :1916 ### #661 OPEN 2026-08-07 (Kyle challenge; CC-A) — ★ LEGACY-LEARNING CENSUS: AT LEAST THREE OTHER LEARNING-ISH SYSTEMS ARE STILL WIRED, DISPO
  :2389 ### #174 OPEN 2026-06-08 (B-NEW-54) — Phase-16 register: predictive-learning teardown REMAINDER (after the ML microservice was retired)
  :2959 ### #214 OPEN 2026-06-10 (item 4 step-6 throughput study, CC find + Langston code-confirm) — `health_engine` broadcast ENGINE block reads th
1-system-manual/pm/DECISIONS.md: 0 entries cite ml-calibration.ts
1-system-manual/DELETED_COMPONENTS_LOG.md: 0 entries cite ml-calibration.ts
not covered: batch-ids only in commit bodies; issues citing the component by prose name, not file name; history before the first commit of the path; phase-scoped sub-batch ids (e.g. P19-B8.5l): the parent-document fallback matches only B<number> ids; ledger rows are matched by BASENAME, so a duplicated basename (index.ts, types.ts, friction.ts and others) cites every file of that name; former names are proven by one rename (paper-portfolio-manager.ts); multi-hop renames are not tested

### $ node scripts/crew-tooling/history.mjs B55 --ref 36126033e
exit 1
NO COMMITS for B55 at 36126033e (path never existed there, or misspelled)
## OBJ-7

### $ node scripts/crew-tooling/closeout.mjs --self-test
exit 0
PASS  nested candidate sorting first is not a candidate (the measured crash)  (declared, hotfix, Claude Comms and Packages/Scope Files/B_SELF_TEST_SCOPE.md)
PASS  an unreadable candidate is skipped, not thrown  (declared, sub_batch, Claude Comms and Packages/Scope Files/B_SELF_TEST_SCOPE_r2.md)
PASS  the first marker-carrying candidate in sort order wins  (declared, non_architecture, Claude Comms and Packages/Scope Files/B_SELF_TEST_SCOPE_r2.md)
PASS  a mid-line declaration is reported as present but unmatched  (present-unmatched, null, Claude Comms and Packages/Scope Files/B_SELF_TEST_SCOPE.md)
PASS  an invalid token is invalid-class, not no-marker  (invalid-class, null, Claude Comms and Packages/Scope Files/B_SELF_TEST_SCOPE.md)
PASS  no change-class text at all is no-marker  (no-marker, null, Claude Comms and Packages/Scope Files/B_SELF_TEST_SCOPE.md)
PASS  no scope file is no-scope  (no-scope, null, null)
self-test: PASS 7 FAIL 0

### $ node scripts/crew-tooling/closeout.mjs --compare
exit 0
COMPARE generated matrix vs workflow-10-governance/SKILL.md:107 (17 rows; generator has 17)
  :109 the batch `SCOPE`: equal
  :110 the batch `PRE_AUDIT`: equal
  :111 `COMPLETION_REPORT`: equal
  :112 `BATCH_CATALOG.md`: equal
  :113 `PHASE_HISTORY.md`: equal
  :114 `SYSTEM_MANUAL.md`: equal
  :115 `SYSTEM_IMPACT_MAP.md`: equal
  :116 `CHANGES_AND_FIXES.md`: equal
  :117 `RUNNING_ISSUES.md`: equal
  :118 `POST_AUDIT_ROADMAP.md`: equal
  :119 `DELETED_COMPONENTS_LOG.md`: equal
  :120 `ADJUSTMENT_FRAMEWORK.md`: equal
  :121 `PHASE_19_PLAN.md`: predicate row - compared by its rule, not its cells (REQUIRED_IF P19-*; in-flight row; else N/A)
  :122 the ACTIVE plan - `SPRINT_TO_LIVE_PLAN.md`: your row: equal
  :123 shared `MEMORY.md` + your own memory file + Langston's `MEMORY.md`: equal
  :124 your own session task list: equal
  :125 every other row in the ledger: equal
COMPARE: every row equal
## OBJ-11

### $ node scripts/crew-tooling/move-ledger-check.mjs --self-test
exit 0
PASS the real tree passes, with --dupes
PASS a seeded MISSING passage fails
PASS a seeded EDITED passage fails
PASS a passage put BACK into CLAUDE.md fails (and --dupes sees two homes)
PASS a RE-SPACED passage put back into CLAUDE.md fails
PASS a lost pointer fails
PASS the multi-source ledger passes, with --dupes
PASS a passage put back into the SECOND of several sources fails
PASS one source of several losing its pointer fails
9/9 PASS

### $ node scripts/crew-tooling/move-ledger-check.mjs --dupes
exit 0
move-ledger-check 1.1 (B-TOKEN-ECONOMY P5; multi-source for B-WORKFLOW-IMPROVE Q10): OK — Claude Comms and Packages/Change Lists/B_TOKEN_ECONOMY_MOVE_LEDGER.json: 55 moves, each present once at its destination, unchanged, gone from every source, one home each (declared sources only; an undeclared second copy elsewhere is not searched).

### $ node scripts/crew-tooling/move-ledger-check.mjs --ledger Claude Comms and Packages/Change Lists/B_WORKFLOW_IMPROVE_MOVE_LEDGER.json --dupes
exit 0
move-ledger-check 1.1 (B-TOKEN-ECONOMY P5; multi-source for B-WORKFLOW-IMPROVE Q10): OK — Claude Comms and Packages/Change Lists/B_WORKFLOW_IMPROVE_MOVE_LEDGER.json: 14 moves, each present once at its destination, unchanged, gone from every source, one home each (declared sources only; an undeclared second copy elsewhere is not searched).

### $ node scripts/crew-tooling/skill-cites.mjs --self-test
exit 0
PASS  unchanged corpus: nothing reported  (stale 0, new 0, disappeared 0)
PASS  all three removed: 3 DISAPPEARED (positive control)  (stale 0, new 0, disappeared 3)
PASS  short name re-pointed to the full name, same line and text: 0 DISAPPEARED, 0 new  (stale 0, new 0, disappeared 0)
PASS  cited line now holds other text: 1 stale  (stale 1, new 0, disappeared 0)
PASS  re-pointed to another line: 1 DISAPPEARED and 1 new  (stale 0, new 1, disappeared 1)
PASS  one of two identical citations dropped: 0 DISAPPEARED (the stated limit)  (stale 0, new 0, disappeared 0)
self-test: PASS 6 FAIL 0

## OBJ-6 B55 control (path form, per PILOT.md:53)
$ history.mjs server/jobs/formula-auto-audit.ts --ref 36126033e
exit 0
fatal: path '1-system-manual/pm/DECISIONS.md' exists on disk, but not in '36126033e'
fatal: path '1-system-manual/DELETED_COMPONENTS_LOG.md' exists on disk, but not in '36126033e'
HISTORY server/jobs/formula-auto-audit.ts at 36126033e (36126033e9e3; no fetch performed): 6 commits, 1 attributed to 1 batches, 5 unattributed
  B55  [f52c87e17]  docs: BATCH_55_COMPLETION_REPORT.md, BATCH_55_SCOPE.md
unattributed (5):
  67aec23f3 2026-02-26 Remove Walter AI assistant and related features from the platform
  3fa7844c9 2025-10-21 Improve system monitoring and automated incident resolution
  aa4e7ffba 2025-10-21 Integrate AI assistant to autonomously manage formula deviations and system issues

## OBJ-10 CI run 44907099007
gh exit 0
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:09.7589090Z   - 2026-05-24a-b79-0n-strategy-enum-orb.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:09.7589490Z   - 2026-05-24-b79-0n-strategy-per-class.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:09.7589919Z   - 2026-05-24b-b79-0n-pattern-detect-naming-converge.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:09.7590386Z   - 2026-05-25-b79-0n-confidence-chain-per-class-seed.sql
--
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:09.7644698Z   - 2026-10-02-b-pattern-enum-drift-abcd.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:09.7645311Z   - 2026-10-06-b-atr-bad-print-retire-daily-range-frac.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:09.7646056Z   - 2026-10-06-b-engine-stop-drop-time-limit-columns.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:09.7646759Z   - 2026-10-06-b-engine-heartbeat-cluster-bus-retention.sql
--
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.4296868Z [db-migrate] Applying: 2026-05-24a-b79-0n-strategy-enum-orb.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.4307484Z [db-migrate] ✓ 2026-05-24a-b79-0n-strategy-enum-orb.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.4308971Z [db-migrate] Applying: 2026-05-24-b79-0n-strategy-per-class.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.4337453Z [db-migrate] ✓ 2026-05-24-b79-0n-strategy-per-class.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.4338534Z [db-migrate] Applying: 2026-05-24b-b79-0n-pattern-detect-naming-converge.sql
--
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.7495538Z [db-migrate] Applying: 2026-10-02-b-pattern-enum-drift-abcd.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.7504511Z [db-migrate] ✓ 2026-10-02-b-pattern-enum-drift-abcd.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.7505666Z [db-migrate] Applying: 2026-10-06-b-atr-bad-print-retire-daily-range-frac.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.7513114Z [db-migrate] ✓ 2026-10-06-b-atr-bad-print-retire-daily-range-frac.sql
Test Suite	Apply database migrations (schema + seed data)	2026-11-21T13:06:10.7514552Z [db-migrate] Applying: 2026-10-06-b-engine-stop-drop-time-limit-columns.sql
--
Test Suite	Run tests	2026-11-21T13:06:13.0499544Z  [32m✓[39m server/tests/unit/f-g-1-venue-price-grid-fence.test.ts[2m > [22mF-G-1 — the xStock absent set must be ENUMERABLE, not just countable[2m > [22mexposes the derived KEYS, sorted, so the comple
Test Suite	Run tests	2026-11-21T13:06:13.0502634Z  [32m✓[39m server/tests/unit/f-g-1-venue-price-grid-fence.test.ts[2m > [22mF-G-1 — the xStock absent set must be ENUMERABLE, not just countable[2m > [22mthe refresher NAMES the symbols it skipped, in 
Test Suite	Run tests	2026-11-21T13:06:13.0505657Z  [32m✓[39m server/tests/unit/f-g-1-venue-price-grid-fence.test.ts[2m > [22mF-G-1 — the row carries its own grid answer (Langston catches 1 + 2)[2m > [22mBOTH arms stamp — so "no stamp" cannot mean t
Test Suite	Run tests	2026-11-21T13:06:13.0508561Z  [32m✓[39m server/tests/unit/f-g-1-venue-price-grid-fence.test.ts[2m > [22mF-G-1 — the row carries its own grid answer (Langston catches 1 + 2)[2m > [22mthe stamp is carried through the RTB rebuild, n
Test Suite	Run tests	2026-11-21T13:06:13.0511360Z  [32m✓[39m server/tests/unit/f-g-1-venue-price-grid-fence.test.ts[2m > [22mF-G-1 — the row carries its own grid answer (Langston catches 1 + 2)[2m > [22meach arm preserves prior metadata rather than r
--
Test Suite	Run tests	2026-11-21T13:06:26.4886563Z [22m[39m[11.1B][AdaptiveRepo] Failed to load adaptive weights: error: invalid input value for enum market_regime: "TREND_FRIENDLY_STABLE"
Test Suite	Run tests	2026-11-21T13:06:26.4887988Z     at [90m/home/runner/work/DawnTraderV3/DawnTraderV3/[39mnode_modules/[4mpg-pool[24m/index.js:45:11

## OBJ-8
# B-WORKFLOW-IMPROVE — Q7: how each crew reaches the audit-aid instructions (OBJ-8)

actor: PM Claude (session 994e6488) · role: implementer · STEP: 3 of 11 (task Q7) · 2026-11-20
Edits: commit `4265cb1df` plus the two Step-2 pointer lines in the commit that carries this file.

## The one home and its pointers
The aids' table, their standing (leads, never verdicts) and the pilot's limits list stand once, in `workflow-02-audit-and-plan`, section "THE AUDIT AIDS". Every other place names the aid it needs at that point and points there.

| instruction | where it stands | point of action |
|---|---|---|
| the table, standing and limits | `workflow-02-audit-and-plan`, "THE AUDIT AIDS" | writing the pre-audit |
| `census.mjs` for the census | `workflow-02`, first line under "§9.5(a) — COMPONENT CENSUS" | the per-hop census |
| `history.mjs` for the provenance read | `workflow-02`, first line under "6 — THE PROVENANCE READ" | the Step-2 provenance read |
| `history.mjs` for the provenance read | `workflow-01-scope`, under "MANDATORY 1.b" | the Step-1 provenance read |
| `census.mjs` and `code-refs.mjs` for blast radius | `workflow-hotfix`, after §2's five questions | the hotfix blast-radius audit |
| the aids are leads, never verdicts | `CLAUDE.md` §9.5 trigger, one sentence | an audit or architectural dispute with no step open |
| the shared contract and the CLIs | `AGENTS.md` §2 item 5 | Codex start-up read path |

| crew | how the instruction arrives |
|---|---|
| **Claude** | `CLAUDE.md` is auto-loaded, so the §9.5 sentence is always in context. Its §0.a table sends the session to the step file before each step, and the hotfix line sends it to `workflow-hotfix`. |
| **Codex** | `AGENTS.md` is auto-loaded. Item 5 names the aids and the shared contract. Item 2 has it read `CLAUDE.md` (the §9.5 sentence and the hotfix line), and item 4 has it read each step file by path. |

All destinations are tracked Markdown files that both crews read by path; nothing depends on Claude's skill machinery.

## Canary, 2026-11-20 (fresh reader, read from the working tree at `4265cb1df`)
A sonnet helper with no context walked eight paths, following only the documents' own pointers and not searching for the aid names: two entry files (`CLAUDE.md` for Claude, `AGENTS.md` for Codex) by four situations (Step-1 scope, Step-2 cen

| crew | situation | reached | where |
|---|---|---|---|

## OBJ-2/3 drafts
.claude/skills/workflow-01-scope/SKILL.md:51:## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)
.claude/skills/workflow-08-verify-langston/SKILL.md:25:## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)
.claude/skills/workflow-09-iterate/SKILL.md:28:## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)
.claude/skills/workflow-10-governance/SKILL.md:268:## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)
.claude/skills/workflow-11-completion/SKILL.md:62:## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)

## OBJ-9 pilot
1:# B-WORKFLOW-IMPROVE — Q8: the pilot (OBJ-9)
9:## Per batch
11:### B-NEW-49 — #691 (second path) and #1211 (failed-read-as-empty) · worktree at base `36126033e`, head `00945ddf8`
12:| | |
14:| aids found | `census formula-auto-audit` (17.7 s): reach via the dynamic import at `index.ts:517`, the `cron.schedule` entry point at `:195`; 152 entry-point lines and 929 import-graph files sear
15:| aids missed | #1211: the meaning of a failed read inside the batch's own new code. No aid reads error paths. #691: node-cron's own missed-execution behaviour lives in a third-party library, which
16:| hand audit missed | Pre-audit §2.5 (the verifier) never asks what happens when the query fails. Its "MISSED" lines (22, 30, 39, 48) are observations; it checked `getNextRun` but never asked what
18:### Batch 19F — #1063 (enum drift) · worktree at parent `c928dd8ea`, head `bd40aa666`
19:| | |
21:| aids found | `census --symbol PatternType --file server/types.ts`: 21 uses in 6 files at the parent, 22 at the head, reaching `pattern-recognizer.ts`. `census --symbol patternTypeEnum`: 3 type-aw
22:| aids missed | The gap itself: nothing puts the TypeScript union and the database enum values side by side. `census --table pattern_type` returned "0 raw-SQL lines": `pattern_type` is an enum type
23:| hand audit missed | No pre-audit exists (`ls-tree` finds only `BATCH_19F_SCOPE.md`). The 127-line scope is silent on the database enum, a migration and the schema; the batch added `'ABCD'` to the
25:### Batch 74 — #1029 (meaning mismatch) · worktree at parent `399445527`, head `b8eba807e`
26:| | |
28:| aids found | `census --path` on each archiver: each reached at startup (`index.ts:767` → `passive-archive-bootstrap.ts:27`), each with its `setInterval` entry points. |
29:| aids missed | The counters are object properties; `census --symbol` and `code-refs` accept only top-level declarations, so both exit 2 on `cumulativeOhlcRows`. No aid shows sibling producers that
30:| hand audit missed | The 247-line pre-audit has no mention of scanned, persisted, counter or cumulative. The commit chose "scanned = received, stored = persisted" and never checked that definition
32:### B-NEW-40 — #448 (enum drift, three alert-category lists) · worktree at `6a70b45c4`
33:| | |
35:| aids found | `code-refs AlertCategory --file server/services/system-alerts.ts`: 3 uses, and "string-keyed access" named as unresolved. `census`: `routes.ts` reaches the alert engine through a dyn
36:| aids missed | The route's own `new Set([...])` of the five category strings (`routes.ts:6329-6331`) is not a reference to the type, so type-aware search cannot see it. The CLI's `as AlertCategory
37:| hand audit missed | The pre-audit lists the values (lines 259, 273, 283) but never enumerates where the list is defined or checked, so the route allowlist and the CLI cast were never named as cop
39:## Blind-spot list (what Step 2 must not rely on the aids for)
51:## Defect found and fixed in this batch (§9.4 disposition 1, folded in)
59:## Reliance text for Step 2 (proposed for the step skill, Q7; Langston rules at Step 4)

## OBJ-12
43:| Q11 | OBJ-12 | none | none | waits on row 5b; CLOSED-UNPROVEN at close if 5b has not delivered |
117:- **The Codex canary was simulated.** OBJ-8 asks for one per crew; PM ruled the Claude-walked Codex path a partial proof and carried the real one to B-TOKEN-ECONOMY OBJ-3. Is that acceptable at cl

## OBJ-10 CI parity lines
Test Suite	Run tests	2026-11-21T13:06:18.5765249Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts
Test Suite	Run tests	2026-11-21T13:06:18.8545494Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 1: useTrailing=false, stop hit clamps to stop
Test Suite	Run tests	2026-11-21T13:06:18.8615731Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 1: useTrailing=false, stop hit clamps to stop
Test Suite	Run tests	2026-11-21T13:06:18.8619701Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 1: useTrailing=false, stop hit clamps to stop
Test Suite	Run tests	2026-11-21T13:06:18.8643793Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 1: useTrailing=false, stop hit clamps to stop
Test Suite	Run tests	2026-11-21T13:06:18.8647435Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 1: useTrailing=false, stop hit clamps to stop
Test Suite	Run tests	2026-11-21T13:06:18.8651418Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 2: useTrailing=false, target hit clamps to target
Test Suite	Run tests	2026-11-21T13:06:18.8655045Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 2: useTrailing=false, target hit clamps to target
Test Suite	Run tests	2026-11-21T13:06:18.8658424Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 2: useTrailing=false, target hit clamps to target
Test Suite	Run tests	2026-11-21T13:06:18.8661772Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 2: useTrailing=false, target hit clamps to target
Test Suite	Run tests	2026-11-21T13:06:18.8665276Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 2: useTrailing=false, target hit clamps to target
Test Suite	Run tests	2026-11-21T13:06:18.8669094Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 3: stale-price force-close exits at entry
Test Suite	Run tests	2026-11-21T13:06:18.8672237Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 3: stale-price force-close exits at entry
Test Suite	Run tests	2026-11-21T13:06:18.8675468Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 3: stale-price force-close exits at entry
Test Suite	Run tests	2026-11-21T13:06:18.8678945Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 3: stale-price force-close exits at entry
Test Suite	Run tests	2026-11-21T13:06:18.8682348Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 3: stale-price force-close exits at entry
Test Suite	Run tests	2026-11-21T13:06:18.8686389Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 4: MAX_HOLD timeout with live price closes at currentPrice
Test Suite	Run tests	2026-11-21T13:06:18.8689831Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 4: MAX_HOLD timeout with live price closes at currentPrice
Test Suite	Run tests	2026-11-21T13:06:18.8693272Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 4: MAX_HOLD timeout with live price closes at currentPrice
Test Suite	Run tests	2026-11-21T13:06:18.8696498Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 4: MAX_HOLD timeout with live price closes at currentPrice
Test Suite	Run tests	2026-11-21T13:06:18.8699576Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 4: MAX_HOLD timeout with live price closes at currentPrice
Test Suite	Run tests	2026-11-21T13:06:18.8703601Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 5: qualifier accept — strong_bull_trend hits target, enters moonbag
Test Suite	Run tests	2026-11-21T13:06:18.8706991Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 5: qualifier accept — strong_bull_trend hits target, enters moonbag
Test Suite	Run tests	2026-11-21T13:06:18.8710604Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 5: qualifier accept — strong_bull_trend hits target, enters moonbag
Test Suite	Run tests	2026-11-21T13:06:18.8714056Z [90mstdout[2m | server/tests/unit/b65-tec-parity.test.ts[2m > [22m[2mB65.2 — evaluateTECExit end-to-end[2m > [22m[2mScenario 5: qualifier accept — strong_bull_trend hits target, enters moonbag
334
{"conclusion":"success","headSha":"29303adffb0eb087eac7431bbf39d47d09fc6090"}

## OBJ-10 CI enum-parity (grep 'enum-parity|Enum parity')
Test Suite	Enum parity (advisory, not required)	﻿2026-11-21T13:07:36.2882491Z ##[group]Run npx vitest run --config vitest.enum-parity.config.ts --reporter=verbose
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.2883057Z [36;1mnpx vitest run --config vitest.enum-parity.config.ts --reporter=verbose[0m
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.2903301Z shell: /usr/bin/bash -e {0}
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.2903646Z env:
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.2903836Z   NODE_ENV: test
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.2904279Z   DATABASE_URL: ***localhost:5432/test
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.2904531Z   COINGECKO_API_TIER: demo
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.2904738Z ##[endgroup]
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.7954096Z 
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.7955502Z [1m[46m RUN [49m[22m [36mv3.2.4 [39m[90m/home/runner/work/DawnTraderV3/DawnTraderV3[39m
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:36.7956095Z 
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:37.5640587Z [90mstdout[2m | server/tests/enum-parity/enum-parity.parity.ts[2m > [22m[2menum parity: shared/schema.ts pgEnum against pg_enum in the migrated CI database[2m > [22m[2mevery d
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:37.5642537Z [22m[39menum-parity: 73 declared enums, 85 database enum types (public schema, control included)
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:37.5647205Z enum-parity: missing types []; code-only values ["market_regime.TREND_FRIENDLY_STABLE","market_regime.HIGH_VOLATILITY_UNSTABLE","market_regime.RANGE_BOUND_STABLE","market_regime.IMPUL
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:37.5650313Z 
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:37.5754099Z  [32m✓[39m server/tests/enum-parity/enum-parity.parity.ts[2m > [22menum parity: shared/schema.ts pgEnum against pg_enum in the migrated CI database[2m > [22mthe instrument rea
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:37.5755881Z  [32m✓[39m server/tests/enum-parity/enum-parity.parity.ts[2m > [22menum parity: shared/schema.ts pgEnum against pg_enum in the migrated CI database[2m > [22mcontrol: a matchin
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:37.5757619Z  [32m✓[39m server/tests/enum-parity/enum-parity.parity.ts[2m > [22menum parity: shared/schema.ts pgEnum against pg_enum in the migrated CI database[2m > [22mcontrol, code -> d
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:37.5759414Z  [32m✓[39m server/tests/enum-parity/enum-parity.parity.ts[2m > [22menum parity: shared/schema.ts pgEnum against pg_enum in the migrated CI database[2m > [22mcontrol, database 
Test Suite	Enum parity (advisory, not required)	2026-11-21T13:07:37.5761847Z  [31m×[39m server/tests/enum-parity/enum-parity.parity.ts[2m > [22menum parity: shared/schema.ts pgEnum against pg_enum in the migrated CI database[2m > [22mevery declared enum
run sha 29303adff is ancestor of HEAD
7538c9244 B-WORKFLOW-IMPROVE Step 5 green, Step 6 no deploy owed
f8eb0f4c1 PM memory: token-economy P4 floor met (53,002 vs 92,974 control)
