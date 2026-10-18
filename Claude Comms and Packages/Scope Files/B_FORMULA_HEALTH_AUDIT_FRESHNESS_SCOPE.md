# B-FORMULA-HEALTH-AUDIT-FRESHNESS — SCOPE (Step 1, r1)

change-class: non_architecture

**Issue:** `#1214` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 59g1a (after 59g1) · **Owner:** CC-B (NEW Claude)
*Read at `origin/migration/aws-supabase` after `5ff7de1ae`, 2026-10-18 ~03:05Z UTC.*

## 0. What is there
- **The card** (AI Transparency → AI Command Center → Formula Health, drawn since row 59g1) polls `GET /api/system/formula-audit` every 5 min (`ai-transparency.tsx` query, `refetchInterval: 300000`) and shows *"Last audit: {formatDistanceToNow(report.timestamp)} ago"*.
- **The read route RUNS the audit** (`routes.ts:15137-15160`): `formulaAuditService.runAudit()` on every request, returning that run's timestamp — so the line always reads "less than a minute ago" and says nothing about when the system last audited itself. `runAudit()` also rewrites `/tmp/audit_report.txt` each time (`formula-audit.ts:845-883`).
- **The scheduled audit** (`formula-auto-audit.ts`, `registerFormulaAuditJob`, daily `0 3 * * *` UTC, env `FORMULA_AUDIT_SCHEDULE`): `runFormulaAudit('scheduled')` (`:125-178`) runs the same `runAudit()`, writes `/tmp/audit_report_<date>.txt` + `/tmp/audit_report_latest.txt` (text summary only), raises an alert per WARNING/FAIL test, and writes a `scheduled_tasks_audit` fire row. **Its result is not kept anywhere the page can read** — not in memory, not in the database.
- **The admin "Run Audit Now" button** calls `GET /system/formula-audit/run` (`:15162`, `manage_system`) → `runFormulaAudit('manual')`.

## 1. Provenance (TIER 1) and disposition
- **Corpora searched:** `RUNNING_ISSUES` (by route, `runAudit`, `formula_audit_cron`), `BATCH_CATALOG`, the completion reports, `SYSTEM_IMPACT_MAP`, `SYSTEM_MANUAL`; `git log -S` on the route and the job; `bridge/canonical/` — no coverage of the formula audit.
- **Intent, quoted:** the read route came first — `ef0b4bd72` (2025-10-21): *"Add formula audit endpoint and update AI analysis logs. Introduce a new API endpoint for formula auditing…"* — an on-demand audit. The same day `c491a6ff2` added the schedule: *"Introduce a scheduled daily formula audit job, a manual trigger endpoint for administrators, and enhanced logging/alerting for formula deviations. This addresses the need for continuous formula integrity assurance…"*. ⇒ the card was built on the on-demand endpoint before the daily job existed and was never re-pointed at it.
- **Disposition (2), relevant but needs updating to today's intent:** the daily job IS the continuous assurance; the card should show its result and its time. An on-demand run stays available through "Run Audit Now".
- **Related, not this batch:** `#690` (the audit's RSI defect, fixed 2026-08-18) and `#691` (the daily job missing runs, row 3, CC-C) — this batch makes a missed run *visible* on the card but does not change the scheduler.

## 2. Objectives
1. **Keep the last completed audit.** `runFormulaAudit` records its result in memory with `runType` (`scheduled` | `manual`) and `timestamp`; `formulaAuditService.runAudit()` itself stays a pure run.
2. **The read route stops running the audit.** `GET /api/system/formula-audit` returns the last completed audit plus `runType`; **if none has completed since the process started**, it runs one, records it as `runType: 'on-read'`, and returns it — so the card is never empty after a restart, and says honestly where the figure came from. *(Decision for Langston: alternatively return `null` and let the card say "no audit since restart; next scheduled 03:00 UTC". Recommend the on-read fallback — restarts are frequent and the card would be empty most of the time otherwise.)*
3. **The card says what the time means:** *"Last audit: 3 h ago (daily scheduled run)"* / *"(run by an admin)"* / *"(run when this page loaded — no scheduled audit since the last restart)"*.
4. **Tests:** the read route performs no audit when a completed one exists (counting `runAudit` calls); performs exactly one when none does and labels it `on-read`; a scheduled run replaces an `on-read` one; the card renders the three labels.
5. **Verify (Step 7):** after the deploy the card reads "run when this page loaded"; after the next 03:00Z scheduled run (or a manual run) it reads that run's time and source, and reloading the page leaves the time unchanged (no new `[AUDIT] Starting` line per page load).

**Out of scope:** the daily job's missed runs (`#691`, row 3); the job's `/tmp` text files and `runAudit`'s `/tmp/audit_report.txt` (shared `/tmp`, `#979`'s class — recorded there); the TODO auto-resolve of recovered formulas (`formula-auto-audit.ts`, the comment after the alert loop).
**Docset (non_architecture):** scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, System Impact Map (the route's contract changes: a read no longer runs the audit), the plan row, the task list.
