# B-FORMULA-HEALTH-AUDIT-FRESHNESS — Step 4 change list (row 59g1a, `#1214`)

**Code commit:** `3d401cdec` · **Audit and plan (approved, conditions folded):** `Scope Files/B_FORMULA_HEALTH_AUDIT_FRESHNESS_PRE_AUDIT.md` · **Owner:** CC-B

## Gate A — the decision, pure (`server/services/formula-audit-view.ts`, new)
- `rowCarriesCounts(meta): meta is CountedAuditMeta` — a type predicate: four finite-number counts, a parseable `auditTimestamp`, and every test with a string `name`, a string `status` and a finite-number `deviationPercent`.
- `countedMetaFromReport(report)` — exactly the fields the card renders; `totalFormulas` from the run.
- `resolveFormulaAuditView({ manual, latestRow, latestCountedRow })` → `{ shown, note }`. **Shown** = the newer of M and C; neither ⇒ `null` (the route runs one). **Note** iff L exists, L is not the shown result, and L is abnormal: `error` ⇒ "did not complete"; names its counts but fails the predicate ⇒ "recorded a result the card cannot read" (Langston Step-3 D1); otherwise ⇒ "recorded no result". "A later" when L is newer than what is shown, "the last" otherwise (incl. under an on-read result).

## Gate B — the writers (`server/jobs/formula-auto-audit.ts`, `server/services/formula-audit.ts`)
- `runFormulaAudit`: the summary join, both `/tmp` writes and `validateReportFile` in one try/catch (the span `:143-150` at the ref) — a failure is logged, the report is still returned with `reportPath: null` and `reportWriteError`. A `manual` run is recorded at module level (`getLastManualFormulaAudit()`), lost on restart by design.
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
