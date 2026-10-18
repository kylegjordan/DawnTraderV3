# B-FORMULA-HEALTH-AUDIT-FRESHNESS — Step 4 change list (row 59g1a, `#1214`)

**Code commit:** `3d401cdec` · **Audit and plan (approved, conditions folded):** `Scope Files/B_FORMULA_HEALTH_AUDIT_FRESHNESS_PRE_AUDIT.md` · **Owner:** CC-B

## Gate A — the decision, pure (`server/services/formula-audit-view.ts`, new)
- `rowCarriesCounts(meta): meta is CountedAuditMeta` — a type predicate: four finite-number counts, a parseable `auditTimestamp`, and every test with a string `name`, a string `status` and a finite-number `deviationPercent`.
- `countedMetaFromReport(report)` — exactly the fields the card renders; `totalFormulas` from the run.
- `resolveFormulaAuditView({ manual, latestRow, latestCountedRow })` → `{ shown, note }`. **Shown** = the newer of M and C; neither ⇒ `null` (the route runs one). **Note** iff L exists, L is not the shown result, and L is abnormal: `error` ⇒ "did not complete"; names its counts but fails the predicate ⇒ "recorded a result the card cannot read" (Langston Step-3 D1); otherwise ⇒ "recorded no result". "A later" when L is newer than what is shown, "the last" otherwise (incl. under an on-read result).

## Gate B — the writers (`server/jobs/formula-auto-audit.ts`, `server/services/formula-audit.ts`)
- `runFormulaAudit`: the summary join, both `/tmp` writes and `validateReportFile` in one try/catch (the pre-change span `:143-150`; at `3d401cdec` it is `formula-auto-audit.ts:158-167` — Langston's Step-4 record item 1) — a failure is logged, the report is still returned with `reportPath: null` and `reportWriteError`. A `manual` run is recorded at module level (`getLastManualFormulaAudit()`), lost on restart by design.
- The cron callback keeps the return and spreads `countedMetaFromReport(result)` into the fire row's `meta` beside `trigger_source: 'cron'` and `duration_ms`; on a thrown run, `meta` is unchanged from today and `status = 'error'`.
- `FormulaAuditService.saveReportToFile`: the `/tmp/audit_report.txt` write guarded the same way (it used to throw out of `runAudit()`).

## Gate C — the read (`server/routes.ts`, `GET /api/system/formula-audit`)
- Two reads of `scheduled_tasks_audit`: L (latest `formula_audit_cron` row) and up to 10 latest `success` rows whose `meta` names `passed`, filtered in code by `rowCarriesCounts` — **C is the newest row that validates** (bound 10). Types come from the predicate; no `as any`.
- `decision.shown` ⇒ that result and its `runType`; else `formulaAuditService.runAudit()` once, `runType: 'on-read'`, not held. Response: `{ ok, runType, note, report: { timestamp, totalFormulas, passed, warnings, failed, tests } }` (`summary` dropped — the card never read it).
- The manual route is unchanged except that `reportPath` may now be `null` (it passes `result.reportPath` through).

## Gate D — the card (`client/src/pages/ai-transparency.tsx`, `shared/formula-audit-labels.ts` new)
- *"Last audit: 3 hours ago (daily scheduled run)"* — `formulaAuditSourceLabel(runType)`; the note under it (`text-audit-note`); both admin pointers to `/tmp/audit_report.txt` (failed and warnings branches) carry *"it holds the most recent run of the audit, which may not be the run shown here"*.

## Gate E — tests (`server/tests/unit/b-formula-health-audit-freshness.test.ts`, 21)
- One per table row: A1 (in today's state — rows without counts), A2-A5, N1, N2a, N2b, N3a, N3b; the counted-but-invalid row (D1); the predicate (string, `null`, missing `deviationPercent`; the legacy shape); `countedMetaFromReport`'s fields; both write guards (only the audit's own `audit_report*` writes fail in the mock); the cron `meta` wiring; the route runs `runAudit()` once and only on the no-result branch, with no `as any`; the card's label, note and both pointers; the labels.
- **Against the original files:** 5 fail (both guards, the meta wiring, the route, the card); the resolver/predicate tests pass there because the module is new. Related suites: 45 / 45. `check-tsc-baseline`: 329 = 329.

## Governance in the same push
- `GOVERNANCE_EXCEPTIONS` declared-open row (2026-10-18T04:30:00Z), as Langston required.
- Still owed at Step 10: SIM `:1155`, `:957`, `:1637` (growth + time-based retention rule); System Manual `:10094` count at the shipped head; `BATCH_CATALOG`, `PHASE_HISTORY`, plan row, task list, `#1214`.

## Step 7 (pre-audit item 8, corrected)
(a) mtime positive control before the deploy; (b) after the deploy: A1 + N2b, the mtime still moves per read; (c) after the 2026-10-19T03:00Z run: A2, the mtime pinned across reloads; (d) restart, reload — still the 03:00Z run.

## Step 4 — APPROVED (Langston, at `ee0a3b0e4`; code byte-identical to `3d401cdec`) — record items for the completion report
1. The guard's line citation (fixed above). 2. `countedMetaFromReport(result)` sits inside the cron's try — a throw there would book a completed audit `error`; fenced, not a defect (no I/O in it; `calculateDeviationPercent` floors the denominator) — build `resultMeta` after the try when next in the file. 3. A scheduled row's `auditTimestamp` is `runFormulaAudit`'s start (its spread overrides `report.timestamp`); a manual run stores the service's `report.timestamp` — sub-ms apart, and neither is the `/tmp/audit_report.txt` `Timestamp:` line. 4. In `saveReportToFile` the guard covers the write only (the text build is outside it). 5. The route is fenced by a source-text check, not by invoking the handler; the decision logic is pure and behaviour-tested. §13: the unused `storage` import at `formula-audit.ts:1` — an item for the next batch in that file (disposition 2).

## Steps 5-7
- **Step 5:** CI run `39096976591` at `ee0a3b0e4` — 4/4 per job (Langston). *(`3d401cdec`'s run `39096887913` was cancelled by the change-list push — not cited.)*
- **Step 6:** range `f0abf8494..ee0a3b0e4` carried one other runtime commit, CC-A's `f807ad20c` (one log string in `b75-retention-sweep.ts`, Langston-PROCEEDed, CI `39093799776` 4/4) — **CC-A said yes before the deploy**. `dt-deploy ee0a3b0e4dcfb1403a4f98c9d72c9b743f1825ea --by cc-b`, live 2026-10-18T04:38:39Z (rollback `f0abf8494`).
- **Step 7 (a) — positive control, before the deploy:** `/tmp/audit_report.txt` mtime 2026-10-18 03:00:00.0167Z; one card load in Chrome (04:37Z) → mtime **04:37:52.114Z**, card *"Last audit: less than a minute ago"* — the instrument moves.
- **Step 7 (b) — after the deploy (04:39Z), state A1 + N2b:** the card reads *"Last audit: less than a minute ago (run when this page loaded — no scheduled result recorded yet)"* and the note *"The last scheduled run (2026-10-18T03:00:00.013Z) recorded no result"*; the API returns `runType: on-read`, 10 formulas / 9 passed / 1 warning; the route logged `No scheduled or manual result to show` per read (2) and **0** `Formula audit read error` lines; the mtime moved to 04:39:29Z — **expected in A1**.
- **Step 7 (c)-(d) — pending the 2026-10-19T03:00Z run:** alert `9f83d547-f2d8-4145-a055-849caaf3b896` (triggers 2026-10-19T03:15Z) carries the pre-registered PASS/FAIL.
- **Step 7 (a)-(b) CONFIRMED by Langston**, with four notes for the report: (1) the 0 route-error count belongs in `error.log` (`console.error`) — Langston counted it there, **0**, with the stream live (2,202 lines in `04:3x`); stream-controlled, not branch-controlled. (2) **(b)'s mtime leg is non-discriminating** — it moves before and after the fix in A1; the discriminating evidence in (b) is the `on-read` label and the note only. (3) **Two preconditions for reading (c):** no admin manual run between 03:00Z and the read (it would legitimately be shown instead), and no third-party touch of the shared `/tmp` file (`#979`); (d) is immune to the first (a restart clears the manual result). (4) Liveness: the 10-18 fire row exists (03:00:00.013Z) and wrote the file (.0167Z) — the cron fires, so the `#691` re-arm branch is provided for but unlikely.
