# B-LOSS-WINDOW-OPERATOR-CLOSES — CHANGE LIST (Step 4)

| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (scope header; re-declared at Step 2 r2 from `non_architecture`) |
| ii | **DOC SET FOR `architecture`** | SCOPE — present, `Claude Comms and Packages/Scope Files/B_LOSS_WINDOW_OPERATOR_CLOSES_SCOPE.md` · PRE_AUDIT — present, `…/B_LOSS_WINDOW_OPERATOR_CLOSES_PRE_AUDIT.md` (r3) · COMPLETION_REPORT — absent (Step 11) · BATCH_CATALOG — absent (Step 10) · PHASE_HISTORY — absent (Step 10) · SYSTEM_MANUAL — absent (Step 10: `:3843`, the operator-anchor term) · SYSTEM_IMPACT_MAP — absent (Step 10: the window's anchor dependence; `getLastAnchorAt`'s second caller; `closeOpenTradesForHardReset`) · SPRINT_TO_LIVE_PLAN row 183b — present (plan line at close) · RUNNING_ISSUES — `#1154` closed at Step 10; `#1172` filed (`56d296de0`) · memory + task list — Step 10 · CHANGES_AND_FIXES / POST_AUDIT_ROADMAP / DELETED_COMPONENTS_LOG / ADJUSTMENT_FRAMEWORK — judged N/A (no fix-log entry beyond the issue, no roadmap change, nothing deleted, no tunable) · PHASE_19_PLAN — N/A (not a `P19-*` batch) |
| iii | **STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_LOSS_WINDOW_OPERATOR_CLOSES_PRE_AUDIT.md` r3 — r2 PROCEEDS (Langston 12:54Z, `f4512ad0d`); his P5(c) BLOCKER, corrections 1-2 and riders (i)-(ii) folded in r3 |

## The change, file by file
**`server/services/portfolio-anchor-service.ts` (P1).** NEW `OPERATOR_REBASE_REASONS = ['start_new','measurement_override','launch_snap'] as const satisfies readonly AnchorReason[]`, with the comment carrying: the closed four-member set, why `auto_divergence` is absent (`#1171`), and the genesis-only reason `launch_snap` is safe (and what breaks it). NEW `selectLastAnchorAt(executor, mode, reasons?)` — the query, executor-injected; `reasons` adds `inArray(reason, …)`. `getLastAnchorAt(mode, opts?)` now delegates; **default unchanged** (the divergence evaluator's cooldown, `friction-divergence-evaluator.ts:169`, still sees every reason).
```ts
// BEFORE
export async function getLastAnchorAt(mode: 'paper' | 'live'): Promise<Date | null> {
  const [row] = await db.select(...).from(portfolioAnchorEvents)
    .where(eq(portfolioAnchorEvents.mode, mode)).orderBy(desc(...occurredAt)).limit(1);
// AFTER
export async function selectLastAnchorAt(executor: Pick<typeof db, 'select'>, mode, reasons?) {
  const byMode = eq(portfolioAnchorEvents.mode, mode);
  ... .where(reasons ? and(byMode, inArray(portfolioAnchorEvents.reason, [...reasons])) : byMode) ...
export async function getLastAnchorAt(mode, opts?: { reasons?: readonly AnchorReason[] }) {
  return selectLastAnchorAt(db, mode, opts?.reasons);
```
**`server/services/daily-loss-budget.ts` (P2).** NEW exported pure `resolveLossWindowStart(nowMs, sessionStart, lastRebaseAt)` = the latest of the three (a max, so never earlier than the old window). `compute24hSnapshot` reads `getLastAnchorAt(mode, { reasons: OPERATOR_REBASE_REASONS })` and uses the result for BOTH legs (paper SQL sum, live in-memory filter).
```ts
// BEFORE
const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
const windowStart = sessionStart && sessionStart > twentyFourHoursAgo ? sessionStart : twentyFourHoursAgo;
// AFTER
const lastRebaseAt = await getLastAnchorAt(mode, { reasons: OPERATOR_REBASE_REASONS });
const windowStart = resolveLossWindowStart(now, sessionStart, lastRebaseAt);
```
A failed anchor read throws inside `compute24hSnapshot` exactly as the existing `getRealizedPnlSince` read on the same path does — same failure class, no new arm.

**`server/storage.ts` (P3).** The hard reset's close is now the named module function `closeOpenTradesForHardReset(executor, mode)` (executor-injected so its test runs in a rolled-back transaction), with the mode fence — column on the LEFT (your C1). The stale "no mode column" comments corrected; the now-unused local `closedTradesTable` destructure dropped from the method's dynamic import.
```ts
// BEFORE (inside hardResetActiveEngineTables)
.where(isNull(closedTradesTable.closedAt))
// AFTER
export async function closeOpenTradesForHardReset(executor: Pick<typeof db, 'update'>, mode) {
  return executor.update(closedTradesTable).set({ closedAt: new Date(), closeReason: 'hard_reset' })
    .where(and(isNull(closedTradesTable.closedAt), eq(closedTradesTable.mode, mode))).returning();
}
// in the method:  const closeTradesResult = await closeOpenTradesForHardReset(db, mode);
```
**`server/scripts/paper-reset-3000.ts` (P4).** Header: the "no restart or deploy within 24 h" hold replaced by the operator-anchor statement (true by A11's ordering: flatten at step 2, anchor at step 3).

**Tests (P5).** `server/tests/unit/b-loss-window-operator-closes.test.ts` — (a) five window cases incl. the grid invariant (never earlier than `max(now−24h, session)`, 81 input pairs); (b) wiring: the anchor read carries the operator reasons, the paper numerator receives the operator anchor (the mock answers a LATER automatic anchor when reasons are absent), and a live close before the anchor drops out. `server/tests/integration/b-loss-window-operator-closes-db.test.ts` — (c) and (d) each in a rolled-back transaction, seeded rows asserted absent afterwards by their own keys (a whole-table count would race parallel test files). `p19-b6-daily-loss-budget.integration.test.ts` gains a `portfolio-anchor-service` mock returning `null` (its window unchanged; without it the new DB read throws locally and the trip never fires).
**Mutations run:** drop the rebase term → (a)1, (b)1, (b)2 fail; call the anchor read without reasons → (b)1, (b)2 fail. (c)/(d) SKIP locally (no Postgres) and run in CI against the test database — their mutation is by construction (no predicate ⇒ the auto event / live row is returned).
**Local:** the four kill-switch suites 31 passed / 2 skipped; every test file referencing the changed modules 84 passed / 17 skipped (DB legs); tsc 337 = baseline.

## Judgement calls to attack
1. **`selectLastAnchorAt`'s executor parameter** exists for the test. The alternative was a test-only seam on `db` itself; I chose the explicit parameter because it is visible at the signature and cannot leak into production behaviour.
2. **The live leg also moves to the new window.** Live's operator set is the one 2026-07-05 `launch_snap` (rider ii), so this is inert today and correct at Phase 21 (the window starts no earlier than go-live).
3. **Extracting the hard-reset update** into a module function is a small refactor beyond P3's one-line fence; it is what makes your rolled-back-transaction test possible without seeding the whole reset (which also deletes every open position).

## Step 4 APPROVED (Langston 13:12Z, at `78d85f5d6`; test-only fix `b6907db69` after)
- **§13 condition → `#1174` `B-RESET-POSITIONS-MODE-FENCE`, row 183b3** (the hard reset's step 2 deletes `active_open_positions` in both modes; that table has no mode column — an outcome-(2) scope decision before Phase 21).
- **Record (i):** test (b)1's reasons assertion compares the call to the mock's own literals, so it does NOT guard the CONTENT of `OPERATOR_REBASE_REASONS` — adding `auto_divergence` to the constant leaves (b)1 green. The set's content is guarded only by (c), which imports the real constant: **CI-only, Postgres-gated.**
- **Record (ii):** A11's ordering compares two clocks — `closedAt` is app-set, `occurredAt` is the database's `now()`. Langston measured the skew unresolvable below ~272 ms by a round-trip bracket; inter-step gaps are seconds to minutes, and the failure direction is safe (a skew makes the window start slightly early, so more loss counts).
