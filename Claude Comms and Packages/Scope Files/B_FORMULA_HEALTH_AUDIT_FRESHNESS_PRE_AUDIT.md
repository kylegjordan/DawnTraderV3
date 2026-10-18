# B-FORMULA-HEALTH-AUDIT-FRESHNESS — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · **Issue:** `#1214` · **Plan row:** 59g1a · **Owner:** CC-B
*Read at `origin/migration/aws-supabase` after `2921bb8ed`. Scope r6 APPROVED by Langston with two conditions (2026-10-18 ~06:10Z) — both carried below.*

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope r6 docset): the SIM edit is `:1155` (the card's new upstream). NOW: two SIM edits — `:1155` and the §9.10.c Downstream line (`:957`), which gains the card as a production reader of `scheduled_tasks_audit`. REASON (Langston C1):** a reader grepping the table lands on `:1637`'s archived "no production code reads"; the live Layer must carry the new reader.
- **PREVIOUSLY STATED: "the plan row". NOW: `SPRINT_TO_LIVE_PLAN.md` row 59g1a, named, is the required running-plan ledger row; `PHASE_19_PLAN` is N/A. REASON (Langston C2).**

## A. AUDIT
**A1 — the six sources.** (1) Code at the ref: scope §0 and r1-r6, every line re-read by Langston at `2921bb8ed`. (2) Runtime/DB: 138 `formula_audit_cron` rows, 0 `error`, 0 with counts, 138 `trigger_source='cron'`, 2026-06-01T03:00:00.012Z → 2026-10-18T03:00:00.013Z (Langston, positive control `duration_ms` = 138); `/tmp/audit_report.txt` mtime 2026-10-18 03:00:00Z. (3) SIM: `:1155` (the card) and §9.10.c `:937-960` (cron registry and Mode-B verifier; Downstream `:957`). (4) System Manual: one backlog match (`:10094`), content N/A. (5) Ledger: `#690`, `#691` (row 3), `#979` (the `/tmp` class, items recorded), `#1214`. (6) `bridge/canonical/`: no coverage.

**A2 — entry points, enumerated first, repo-wide (tests excluded).** The audit runs from exactly three places: the cron (`registerFormulaAuditJob`, `formula-auto-audit.ts:187`, registered at `server/index.ts:684-689`), the admin route (`routes.ts:15162-15167`, `runFormulaAudit('manual')`), and the card's read (`routes.ts:15137-15140`, `formulaAuditService.runAudit()` directly). Two `FormulaAuditService` instances exist — `formula-auto-audit.ts:11` and the exported singleton `formula-audit.ts:887` used by `routes.ts:19` — both stateless apart from the file write, so the new in-memory manual result lives at module level in `formula-auto-audit.ts`, where both runs that set it are.

**A3 — `scheduled_tasks_audit`, every writer and reader.** Writers: `scheduled-jobs-audit.ts:68` (`writeFireRow`, every cron) and `session-lifecycle-controller.ts:120` (B-NEW-36). Readers in production: `cron-fire-evidence-verifier.ts:82-86` — `task_name, MAX(fired_at)` only, never `meta` (Langston: objective 1 breaks no reader). Scripts: `scripts/b5c-diag.cjs`, `b5c-poll.cjs`, `b5c-verify.cjs` — diagnostic, other task names. ⇒ **after this batch: one new production reader (the card's route), reading `meta` of `formula_audit_cron` rows only.** No schema change: `meta` is free-form jsonb.

**A4 — state-write census (§9.5(a-ii)).** New state: (i) extra keys in the cron row's `meta` — readers: the new route only; (ii) a module-level last-manual-run — readers: the new route only; lost on restart by design. Changed state: `/tmp/audit_report.txt` is no longer rewritten on a card read (readers: admins via the card's pointer, which gains its clause); `/tmp/audit_report_<date>.txt` / `_latest.txt` unchanged on success.

**A5 — what the card renders.** Per test `name`, `status`, `deviationPercent.toFixed(2)` (`ai-transparency.tsx:514-541`); the summary counts; the timestamp line; two `isAdmin` pointers to `/tmp/audit_report.txt` (`:497`, `:502`).

## B. PLAN (each item back-references its finding)
1. **(scope obj 1; A3)** `formula-auto-audit.ts` cron callback: keep `runFormulaAudit`'s return and write into the fire row's `meta`: `totalFormulas`, `passed`, `warnings`, `failed`, `auditTimestamp`, `tests: [{name, status, deviationPercent}]` — `trigger_source: 'cron'` unchanged.
2. **(scope r5-r6; A2)** `runFormulaAudit`: the `/tmp` writes (`:146-147`) in their own try/catch — logged; the report still returned with `reportPath: null` + `reportWriteError`. `formula-audit.ts:881` (`saveReportToFile`) guarded the same way. Record the last `manual` result at module level.
3. **(scope obj 2)** A pure resolver `resolveFormulaAuditView({ manual, latestRow, latestCountedRow })` returning `{ shown, runType, note }` per the A1-A5 / N1-N3b table, plus `rowCarriesCounts(meta)` — the validating predicate (counts present; every test has `name`, `status`, finite-number `deviationPercent`).
4. **(scope obj 2)** `GET /api/system/formula-audit`: two reads (`L` = latest `formula_audit_cron` row; `C` = latest whose `meta` has counts — validated in code, not in SQL), the resolver, an on-read `runAudit()` only when it says so (never held). Response keeps today's `report` shape plus `runType` and `note`.
5. **(scope obj 3; A5)** The card: the source beside the time, the note when present, the clause on both `/tmp` pointers.
6. **(scope obj 4)** Tests: ten for the table (A1-A5 counting `runAudit` calls; N1, N2a, N2b, N3a, N3b), one for the predicate, the cron `meta` write (fixture captures `writeFireRow`), the two write guards (a throwing write still returns the report), the card labels. A1 is written in today's state (rows without counts).
7. **(scope docset)** `GOVERNANCE_EXCEPTIONS` declared-open row **in the same push as the code**; SIM `:1155` and `:957` (Langston C1); `SYSTEM_MANUAL:10094` line count 2,074 → 1,685.
8. **(scope obj 5)** Step 7: positive control first (load the card before the deploy, watch the mtime move); after the deploy the card reads A1 + N2b and the mtime stays pinned across reloads; after the 2026-10-19T03:00Z run and a process restart, the card still reads that run (from the row). A missed 03:00Z fire moves the verify a day (`#691`).
9. **Governance:** completion report (with the N3-fixture-only record) whose tier ledger names **`SPRINT_TO_LIVE_PLAN.md`** as the running-plan row (Langston C2); `BATCH_CATALOG`, `PHASE_HISTORY`, `#1214`, task list, memory.
No `UNAUDITED` items.

**Blast radius:** one route, one job file, one service's file write, one card; no trading path; no table or migration; the verifier reads only `MAX(fired_at)` and is unaffected.
