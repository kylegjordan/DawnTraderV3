# B-VTS-REST-DEADLINE #1073 — Step 4 change list

**DECLARED CHANGE-CLASS** `architecture`, from the approved scope.

**STEP-2 REFERENCE** `Claude Comms and Packages/Scope Files/B_VTS_REST_DEADLINE_PRE_AUDIT.md`. Coltrane cleared P2 and P4 at 14:22:55Z on `80445012f0672018e155e702ecd34b3502973942` and the final P3 condition at 14:51:47Z on `9fb5d2f2d065472bff6b0a0bc49e0c4e2997de77`. The #961 writer prerequisite was shared `2d8635ed632d74ddc06778bb312f0a29b0baf481`, 45842708142 four green. This review asks whether the exact candidate correctly captures and distinguishes paper maker placement, skipped prices, and winning outcomes.

| Architecture document | Disposition at Step 4 |
|---|---|
| Scope | Present in Scope Files, `B_VTS_REST_DEADLINE_SCOPE.md`. |
| Pre-audit and implementation plan | Present at the Step-2 reference above, with the implemented P4 capture procedure. |
| Completion report | Absent. Step 11 after the authorized observation. |
| `1-system-manual/BATCH_CATALOG.md` | Batch update due at Step 10. |
| `1-system-manual/PHASE_HISTORY.md` | Batch update due at Step 10. |
| `1-system-manual/SYSTEM_MANUAL.md` | Batch update due at Step 10 for the entry evidence and interpretation. |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | Batch update due at Step 10 for paper writer and offline reader. |
| `1-system-manual/CHANGES_AND_FIXES.md` | Conditional update due at Step 10 for the transactional paper crypto correction. |
| `1-system-manual/RUNNING_ISSUES.md` | Existing #1073 home present. Update its disposition after the graded read. |
| `1-system-manual/POST_AUDIT_ROADMAP.md` | Judged N/A. Existing sprint row 4b placement and scope. |
| `1-system-manual/DELETED_COMPONENTS_LOG.md` | Judged N/A. No components deleted. |
| `1-system-manual/PHASE_19_PLAN.md` | Conditional review at Step 10 for compatibility with the existing P19-B7.2c policy. |
| `1-system-manual/ADJUSTMENT_FRAMEWORK.md` | Judged N/A. No new price threshold or tuning authority. |
| `1-system-manual/DEPLOY_WINDOWS.jsonl` | Present. The existing Step-2 record has Dec 18/19 12:00Z administrative dates until exact activation. |

## Code excerpts

**P1 changed.** The engine's existing independent success line carries the exact position and trade IDs and a versioned pending-maker receipt for the two paper spot classes. The guarded optional stamp follows the line and can fail independently.

```ts
const makerReceipt = paperSpotRest
  ? ` | makerAuditVersion=1 | makerAuditRole=pending_maker | mode=paper | assetClass=${_openClass} | makerPlacedAtMs=${_makerPlacedAtMs ?? 'unknown'}`
  : '';
console.log(`[AJ10.3][OPEN_POSITION_OK] positionId=${openPosition.id} | symbol=${signal.symbol} | tradeId=${trade.id}${makerReceipt}`);
if (paperSpotRest) {
  void storage.recordPaperMakerPlacement(openPosition, trade.id).then((recorded) => {
    if (!recorded) console.warn(`[#1073][MAKER_PLACEMENT_AUDIT_MISSING] tradeId=${trade.id} positionId=${openPosition.id}`);
  });
}
```

The existing ordinary success line was emitted without the suffix. The actual error handler remains with the call.

**P2 new.** The timer enters with epoch and callback number before any overlap return. Only this placement's successful adjacent observations with matching epoch and wall/monotonic checks can extend a span. A pending or failed evidence write cannot extend it.

```ts
const samePlacement = previous?.placedAtMs === placedAtMs && previous.deadlineAtMs === deadlineAtMs;
const sameEpoch = previous?.epochId === epoch.id && previous.periodMs === epoch.periodMs;
const adjacent = samePlacement && sameEpoch && previous.sample.slot + 1 === sample.slot
  && previous.sample.callbackNumber + 1 === sample.callbackNumber;
let discontinuity = sampleBreak(epoch, sample);
if (!Number.isFinite(placedAtMs) || !Number.isFinite(deadlineAtMs) || deadlineAtMs <= placedAtMs
  || sample.wallAtMs <= placedAtMs) discontinuity = 'placement';
```

**P3 changed.** Paper crypto uses a guarded pair transaction like the reviewed xStock writer. Legacy cancellation remains available for one exact key while the record-key lock excludes a concurrent insert. A stale or terminal stamp cannot merge late on the winning trade. The exact earlier accepted quote can be recorded on a fill processed after the deadline.

```ts
const [changed] = change.kind === 'fill'
  ? await tx.update(activeOpenPositions)
      .set({ state: 'open', currentPrice: change.currentPrice, lastUpdated: now })
      .where(pendingKey).returning(paperMakerTerminalPosition)
  : await tx.delete(activeOpenPositions).where(pendingKey).returning(paperMakerTerminalPosition);
if (!changed) return { status: 'not_pending' };

const evidence = linkedId === null ? {
  version: 1, positionId: position.id, outcome: 'cancel', timing: 'unknown', refusal: 'unknown', link: 'legacy_unique',
} : linkedMakerTerminal(position.id, change.kind, change.evaluatedAtMs, change.kind === 'fill' ? change : undefined,
  terminalMakerRefusal(changed, candidates[0].metadata, change.refusalEvidence));
```

The earlier crypto path updated the selected position and trade outside that pair transaction. The flatten caller now reports the committed result.

**P4 new.** The receipt reader takes retained output with an exact build and source inventory. The read-only PostgreSQL export independently enumerates exact and broader candidates. Grading keeps the trigger numerator separate from class coverage, distinguishes ordinary late evaluation from a truly late quote, and retains an exact outcome when the refusal cause is unknown.

```py
if quote_arrived < deadline:
    return result | {"receipt_timing": "early", "trigger": "no"}
result["receipt_timing"] = "at_or_after_deadline"
if result["refusal"] == "recovered_across_deadline" and passes_rest_limit(trade, stamp):
    result["trigger"] = "yes"
return result
```

**P5 carried.** Exact approved window row retained. It books no deployment. Activation, evidence retention and final grade occur through the existing coordination and observation procedure.

## Verification and challenge

- Exact safe parent `1eadf42f4770726aee7d2b88d6f5cf0cf70f9684` passed all four jobs in 45853995384. Alternate P2 cut `4a0bcf0f0` had two source-assertion failures in 45857330591. This candidate uses the verified green parent and adjusts only what the assertions need to find the unchanged xStock side/size argument and crypto cache reconciliation after the monitor begins receiving its optional attempt.
- Five focused Vitest files passed 53/53, including the two exact source suites and eight actual isolated PostgreSQL #1073 cases. TypeScript reported the same 314 findings as baseline. Twelve reader fixtures passed, including exact placement boundaries, an at-deadline constructed positive, a pre-deadline quote processed late, a noncrossing winning-side price, an interrupted source, an unmatched placement and a bad history digest. The at-deadline positive challenges the reader. It is no claim of a real paper fill, and the shipping evaluator refuses that arrival under a valid deadline.
- REVIEWER: claim-only · paper_rest_p4_reader · which objects could corroborate an individual trigger when source coverage fails · found an unlogged before-edge placement that could be skipped by the broad opened-time candidate cut, unverified history bytes and a missing crossing-price witness · re-derived yes at the engine clocks and actual reader inputs. The candidate export reaches the terminal day and discharges only candidates with an exact outside placement stamp. The reader checks the independent history file hashes and exact persisted crossing price. Re-derived with PostgreSQL and receipt fixtures. The wider no-reset and staging-world claims are NOT RE-READ.
- Please challenge the production handoff from scheduler to exact position, from independently logged receipt to DB evidence and from actual winning fill to graded verdict. Examine whether a missed callback or worker failure can masquerade as continuity and whether a reported flatten can count another writer's work. Use the Step-2 boundary and restore controls. The Step 7 observation remains a separate authorization.

## Step 4 r4 — queue and lifecycle riders

Coltrane returned CHANGES NEEDED at 16:59:01Z on `43fab10a80504a8eb38447f004d82633c25ae089` (45860276851 four green).
The corrections are confined to the placement stamp and the offline reader. The independent stdout placement receipt remains.

- Placement stamp: add the same target-trade terminal guard as the existing refusal stamp. The test holds the exact trade
  row, observes the fill and then the placement update queue, and releases the lock. In isolated PostgreSQL the previous
  candidate returned true for the queued stamp on 1/1 trials despite the committed fill. With the guard the fill still
  commits and the queued stamp returns false, with no placement metadata attached after the terminal receipt. The earlier
  pre-fill successful placement and repeated-stamp controls remain green.
- Offline reader: require either the exact surviving open position or an exact close at/after the recorded fill and by
  snapshot capture with that position absent. Retain the exact fill and quote timing when the terminal refusal summary
  has missing, nonforward or incoherent monotonic times. The writer bounds each endpoint clock difference, so the
  reader allows the two endpoint tolerances together when comparing elapsed wall and monotonic times.
- Re-derived the open-without-position false trigger and all four malformed clock subcases on the unfixed reader.
  The corrected reader also refuses a close before the fill, a closed trade with a still-open position and a future
  close. The same exact fill with a later observed close or its surviving position remains a positive control.
- Focused rerun passed 59/59 across five Vitest files, including all nine isolated PostgreSQL cases, and 14/14 reader
  fixtures. No observation dates or staging settings changed.

Please re-grade these two corrections on the exact candidate. Shared placement still requires the review and normal CI checks.
