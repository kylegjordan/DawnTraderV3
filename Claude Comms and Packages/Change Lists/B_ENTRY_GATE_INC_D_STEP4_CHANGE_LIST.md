# B-ENTRY-GATE increment D — Step 4 change list

**Change class** `sub_batch`. Owner CC-B, parent issue #1224. Review the increment-D implementation diff from shared base `046e5a3aeade73ac9a503e8215e20393ba868863` to the exact review head named in the dispatch.

**Step 2** `Claude Comms and Packages/Scope Files/B_ENTRY_GATE_INC_D_PRE_AUDIT.md`, exact approved ref `2a5a3a27a15d67d8a596cf84bafa565561f8c2ea`, blob `f0254011b64c6d1e646017a3b4a9c3d8c2644705`. Coltrane approved at 2026-11-25 12:35:49Z and cleared the two protected instrumentation seams below. Scope approval `44893c07e1ae694bd7bcaf4826194c1d501f354b`.

| Sub-batch document | Disposition at this code review |
| --- | --- |
| Scope | **Present**, `Claude Comms and Packages/Scope Files/B_ENTRY_GATE_SCOPE_INC_D.md`. Exact Step 4 ref `c24ca16fa` carries the same blob at `B_ENTRY_GATE_INC_D_SCOPE.md`. |
| Pre-audit | **Present**, exact reviewed blob at the path above. |
| Completion report | **Absent**, the parent report is open and this increment has no staged evidence to close. |
| `BATCH_CATALOG.md` | **Present**, existing Entry Gate entry. Update on increment close. |
| `PHASE_HISTORY.md` | **Present**, increment-D entry owed after deploy and verification. |
| `SYSTEM_MANUAL.md` | **Present**, Entry Gate §19.0 is affected by the new evidence instruments. Update at Step 10. |
| `SYSTEM_IMPACT_MAP.md` | **Present**, code touches Central Clock and RTB observation seams. Update at Step 10. |
| `CHANGES_AND_FIXES.md` | **Judged N/A**, supplemental measurement under an already tracked batch. |
| `RUNNING_ISSUES.md` | **Present**, #1224 records this increment and the open historical proof. |
| `POST_AUDIT_ROADMAP.md` | **Judged N/A**, #1224 and the active sprint already home the work. |
| `DELETED_COMPONENTS_LOG.md` | **Judged N/A**, no existing capability or data removed. |
| `ADJUSTMENT_FRAMEWORK.md` | **Judged N/A**, observation only. |
| `PHASE_19_PLAN.md` | **Judged N/A**, no in-flight row for this batch. |
| `SPRINT_TO_LIVE_PLAN.md` | **Present**, item 2 and #1224. |
| Shared `MEMORY.md`, owner `MEMORY_CC_B.md`, reviewer `MEMORY.md` | **Present**, owner position up to Step 2 on shared. Record verified disposition at later boundary. |
| Session task list | **Present**, CC-B Entry Gate. Other sessions N/A. |
| Open deployment window | **Present on the Step-2 review ref** as row 59. Keep review-only until Nov 26 Phase A handoff. |

## Modified, protected modules under #1076

- `server/services/central-clock.ts` — `LOCKED MODULE — HANDLE WITH CARE`, Directive 8.8.4-A4.R10R-4. Same five existing subscribers in the same order. Existing 60-tick health output remains a separate control.
- `server/services/rtb-refresh-service.ts` — `LOCKED MODULE — HANDLE WITH CARE`, same directive. The existing cadence, busy decision, buckets, paper/live work, and ACT metric inputs/thresholds remain in place. The callback passes the actual clock event to retain the emitted time and number.

Before, the independent clock emission and refresh decision:

```ts
this.emit('tick', tick);

centralClock.subscribe('RTBRefreshService', (tick: ClockTick) => {
  this.onTick(tick.tickNumber);
});
private onTick(tickNumber: number): void {
  if (tickNumber % this.MICRO_CYCLE_INTERVAL !== 0) return;
  if (this.isRefreshing) {
```

After:

```ts
observeEntryGateClock(tick.tickNumber, tick.timestamp);
this.emit('tick', tick);

centralClock.subscribe('RTBRefreshService', (tick: ClockTick) => {
  this.onTick(tick);
});
private onTick({ tickNumber, timestamp }: ClockTick): void {
  if (tickNumber % this.MICRO_CYCLE_INTERVAL !== 0) return;
  observeEntryGateRefresh(tickNumber, timestamp, this.isRefreshing);
  if (this.isRefreshing) {
```

New observer, one query at the start of a started cycle. At most one is in flight, and a missed sample never turns into a zero. SQL takes one statement snapshot of both classes and both active statuses.

```sql
SELECT (EXTRACT(EPOCH FROM statement_timestamp()) * 1000)::double precision AS observed_at,
       COUNT(*) FILTER (WHERE asset_class = 'crypto_spot')::int AS crypto,
       COUNT(*) FILTER (WHERE asset_class = 'xstock_spot')::int AS xstock
FROM rtb_signals
WHERE mode = 'paper' AND status IN ('active', 'reconfirmed')
  AND asset_class IN ('crypto_spot', 'xstock_spot')
```

Step 4 r4 requires the database statement timestamp to fall between the app's query start time and response. The verifier applies the pre-registered maximum to both wall-clock and monotonic tick-to-response time. A difference above 2 ms between the app durations makes the sample unusable. The 2 ms covers millisecond rounding and the adjacent clock reads. We apply no offset adjustment to the database timestamp. A statement measured 199 ms after a tick with an app response at 18 ms fails even under a 200 ms bound.

## Modified, independent opportunity census and storage result

`signal-orchestrator.ts` census reads the selected strategies independently of detector output, the canonical first pattern consumer before pattern scanning, and the list of actual inner-hybrid outputs before processing. Pattern children enroll separately before the processing loop and share a parent count. The active portfolio explicitly stamps its origin. The oracle rejects a legacy paper crypto scan or an unexpected class or mode.

```ts
if (entryGateScan) {
  plannedDirect = new Map();
  for (const strategy of activeStrategies) {
    const evaluation = planEntryGateEvaluation(entryGateScan, symbol, strategy, 'direct');
    if (evaluation) plannedDirect.set(strategy, evaluation);
  }
}
// At each watched detector, only the existing branch has the planned ID.
observeEntryGateEvaluation(evaluation, 'detector_enter');
```

The existing target gate emits its actual verdict. Its pass or refusal remains separate from the fire-and-forget RTB call. `queueSQESignal` logs the upsert attempt immediately before storage and then the actual returned row. It logs explicit pre-storage return reasons. The existing caller rejection logs an RTB service error without rewriting the earlier write result.

```ts
observeEntryGateEvaluation(evaluation, 'upsert_attempt');
let signal: RtbSignal;
try {
  signal = await storage.upsertRtbSignal(insertData);
} catch (error) {
  if (evaluation) {
    const sqlState = classifyEntryGateUpsertError(error);
    observeEntryGateEvaluation(evaluation, sqlState ? 'upsert_failed' : 'upsert_unconfirmed', { sqlState });
  }
  throw error;
}
```

The next event requires a returned row ID. A reissue can retain the existing storage signal ID, so the measurement does not infer insert versus conflict update from that ID.

Step 4 r4 duplicates the reached seams in later terminal records. Its transient progress stays within the evidence context and never joins persisted trade or queue fields. The verifier reconciles each terminal declaration with the earlier events.

```ts
case 'evaluation_end':
  terminal = { targetVerdict: progress.targetVerdict, rtbCalls: progress.rtbCalls };
  break;
case 'rtb_error':
case 'rtb_refused':
case 'rtb_returned':
  terminal = { upsertOutcome: progress.upsertOutcome };
  break;
```

## New, bounded collection and offline verifier

- `entry-gate-evidence.ts` enqueues scalar records, caps the queue at 2,048, drains batches up to 64 outside tick dispatch, and marks loss under the affected session. Data is off by default. The approved Step-6 deploy may add only its registered observation values to `ENTRY_GATE_EVIDENCE_WINDOWS_UTC`. The existing PM2 launcher reads `.env` at process start. Inspect the registered values before the deploy and verify the running process and bound markers after it.
- A registered session covers its UTC clock ticks in `[start,end)` plus surrounding continuity markers. The P8 population comprises scans whose start is in the same interval, with all their eligible opportunities and terminal completions through 21:15Z. Record the exact boundary definition and maximum allowed DB statement lag before collection. The runtime does not enable diagnostics outside the configured session, and each session has a bounded drain.
- The clock's two window markers carry the scan sequence before the session and after its terminal cutoff. The verifier reconciles their difference to the entire contiguous scan sequence to detect complete loss of a first or last allocated scan. The anchors share stdout with the scan records, so collection still requires the complete log objects and the enrollment-path checks.
- `scripts/analysis/b-entry-gate-inc-d.mjs` takes a four-session JSON registration and the collected stdout paths in chronological rotation order. It checks the server's existing timestamped Central Clock health and lifecycle lines, distinct process identity, cycle and snapshot coverage, per-class medians, and legal per-ID evaluation sequences. An unconfirmed upsert fails the evidence cohort. Missing strategy gate outcomes are reported as insufficient based on the judged counts. A same-ID Strong Bull Trend commit is required across the four sessions.
- Artifact collection each day needs the complete rotated and live stdout paths through the guard and drain. Record the actual serving build/restart before and after each session and hash each captured artifact. `build` in the verifier's input identifies the independently verified serving build. The runtime process ID comes from the evidence records and must be pinned to the same running process before the session.

## Checks and attacks for the reviewer

- The existing #1161 subscriber enrollment test remains untouched. A deterministic runtime fixture emits through Central Clock, holds the diagnostic read across refresh ticks, then rejects it. Compare actual delivered IDs, bucket/mode work, the refresh's busy outcome and a positive ACT pool decision with the observer off.
- The reconciliation fixture deletes an aligned clock tick and its cycle/snapshot together, deletes a whole evaluation trace with and without its census, deletes an entire first or last scan, and suppresses or reorders storage events. All fail against the actual verifier. An independent per-scan count captured at the pre-processing nomination seam survives loss of the per-ID rows. The boundary-control test captures the runtime anchors while starting scans before, inside and at the end of the window. The fixtures also check correct two-class counts, a missing versus explicit zero, mode/class identity, pattern child counts, genuine upsert refusal and post-commit failure.
- The focused RTB service fixture exercises the actual one-call/zero-upsert class refusal, acknowledged upsert before later failure, known SQL rejection and ambiguous transport/unknown completion. The independent PostgreSQL fixture uses an isolated copy of the real migrated RTB table and separate connections for the writer, observer and independent reader. It distinguishes an insert, a status transition, excluded rows and a conflict reissue. This requires the CI test database.
- The fixture accepts only the existing Vitest localhost database URL. Its one URL read and three connection constructors are enrolled under its exact path in the B-DB-HELPER-RETIRE typed exclusions and surface baseline. CI run `45619609332` exposed the missing fixture enrollment by failing the existing validator before the Vitest job step.
- Attack the prospective scan boundary, the census independence in each lane, what a PostgreSQL result can establish after a lost acknowledgement, and the residual shared-process timing cost. Controlled ACT equivalence does not measure the timing cost on staging under load. Pin the live timing bounds before observation and invalidate a session if they fail.
- **NOT RE-READ** before the prospective sessions: real lane populations, arrival volume under staging load, the registered-build timing distribution, and the four-session Strong Bull Trend carrier.
- **REVIEWER:** claim-only · what other states fit a complete opportunity census and equivalent timed refresh? · HIT: deleting both an opportunity's census and all its outcomes previously passed; the SQL count may see a commit after tick emission · re-derived y. The scan roster detects the combined deletion. The queue result represents the PostgreSQL statement time inside the registered lag bound, which can differ from exact tick-time membership. Inner-hybrid coverage begins with the output array the implementation actually dispatches.
- **REVIEWER:** claim-only · can a whole first or last allocated scan disappear inside valid window anchors? · CLEAN on the scoped claim · re-derived y. The two boundary-deletion mutations passed on `20bd25da9` and fail with the anchor comparison.
- **Coltrane Step 4 CHANGES**, `497533ac292f4c4a0f897e0de0e7aee9004a0913`, 2026-11-25 13:23:14Z. Removing the target-refusal line, removing the upsert attempt plus its confirmed or unconfirmed result, and an impossible database/app timing pair passed r3. R4 rejects those changes against the real verifier. The intact fixture includes a genuine pre-upsert error and still distinguishes it from a successful write followed by an error.
- **REVIEWER:** claim-only · can reached seams or a physical statement bound still be misread? · HIT: a preliminary r4 accepted a statement before query start and an inconsistent wall/monotonic pair · re-derived y. Exact timing now brackets the raw statement timestamp, bounds both full durations, and rejects both mutations. Deleting individual trace records in the passing fixture did not bypass the terminal declarations.

## Classification warning and ruling — 2026-11-25

Governance warning `bbfdec6e-848e-4d6a-9526-0839c00b110e` graded `1d9a033298e5bbb61019d133c883872d169d73c3`. Both scope filenames matched `B-ENTRY-GATE`, and the checker selected the first parsed header after sorting. The increment scope sorted first and supplied `sub_batch` for the parent key. In the exact increment-D diff only `server/services/signal-orchestrator.ts` matched the engine-path heuristic. Removing that path in the replay stopped the warning while the parent still graded as `sub_batch`. The canonical parent `architecture` scope selected before the increment scope first landed, at `6eef3f113b5ce37f6cdb13b53b32540a0a17f351`.

**Coltrane CLASS AND DOC SET PROCEED**, 14:18:33Z on exact `c24ca16faeb0d11a7dfe4d1e37d31754f89c6183` (dispatch `1575152694870548624`). D remains a `sub_batch` for observation under the `architecture` parent #1224. The existing target gate and upsert remain the decision and write sites. Update `SYSTEM_MANUAL.md` §19.0 and `SYSTEM_IMPACT_MAP.md` for the instruments at Step 10 and reconcile `BATCH_CATALOG.md` and `PHASE_HISTORY.md`. Completion evidence remains due. The Step 6 gates and the parent Step 11 historical P6/P8 and December 1 P7 dispositions still apply.

Coltrane approved renaming the increment scope byte-for-byte to `B_ENTRY_GATE_SCOPE_INC_D.md`. The canonical `B_ENTRY_GATE_SCOPE.md` now sorts first, preserving required architecture-document grading for the parent. Preserve the warning for checker-owned clearance after grading the corrected shared ref.

- **REVIEWER:** claim-only · what changes could coexist with supplemental instrumentation in core paths? · HIT: the scope filename also changes the parent checker grade, and enabled observation leaves timing and database load to measure · re-derived y.
