# B-SPREAD-BLOWN-RELEASE-MOVEMENT — #1199 offline comparison

Owner CC-C. Step 4 review of the Step 3 P1–P3 evidence and policy disposition. Coltrane approved the Step 2 plan at `2a07df59dd5efeda8ada4c5f50f667a5916ff324` on 2026-11-27 at 04:27:00 UTC.

**Declared change-class** `non_architecture`, re-declared in the scope on Coltrane's Step 4 ruling at `3374dee596681fe9daa0bb884e006d6472762edb` on 2026-11-27 at 05:51:26 UTC. The original class allowed for a possible trading change. The disposition now keeps the rule and carries only evidence and tests. **Step 2 reference** `Claude Comms and Packages/Scope Files/B_SPREAD_BLOWN_RELEASE_MOVEMENT_PRE_AUDIT.md` at the approval ref above.

| Non-architecture doc set and closeout ledger | Status at Step 4 r2 |
|---|---|
| Scope | Present at `Claude Comms and Packages/Scope Files/B_SPREAD_BLOWN_RELEASE_MOVEMENT_SCOPE.md`. |
| Pre-audit | Present at the Step 2 path above. |
| Change list | Present here, with the offline diff and the decision for review. |
| Completion report | Absent at Step 4. Due at closeout after the disposition is reviewed. |
| Batch Catalog | Absent for this batch. Due at closeout. |
| Phase History | Absent for this batch. Due at closeout. |
| System Manual | Conditional, judged N/A because the retained rule changes no trading architecture. |
| System Impact Map | Conditional, judged N/A because the retained rule changes no runtime component, dependency or state. |
| Changes and Fixes | Conditional, judged N/A for evidence and test fixtures only. |
| Running Issues | Present as the open #1199 entry in `1-system-manual/RUNNING_ISSUES.md`. Closure awaits the reviewed disposition. |
| Post-Audit Roadmap | Conditional, judged N/A for this evidence-only comparison. Placement already exists in `1-system-manual/SPRINT_TO_LIVE_PLAN.md`, Wave 2 row 3. |
| Deleted Components Log | Conditional, judged N/A. There are no deletions of components. |
| Phase 19 Plan | Conditional, judged N/A. #1199 is outside the Phase 19 batch namespace. |
| Adjustment Framework | Conditional, judged N/A. No setting or calibration changes. |
| Sprint to Live Plan | Present as Wave 2 row 3. Update the row and link the report at closeout. |
| Session task list | `1-system-manual/CC_C_SESSION_TASK_LIST.md` references #1199 under row 2. Record the resulting disposition and report link at closeout. |
| Memory | `.claude/memory/MEMORY_CC_C.md` and its matching outside copy track the exact review boundary. Record the reviewed disposition at closeout. |

## P1 — Existing historical evidence

The fixed screen comprises 81 of 297 paper xStock closes in the half-open interval 2026-10-16 15:10:55 UTC to 2026-11-04 13:52:36 UTC. The original list of 81 close IDs ordered by close time and ID reproduces MD5 `2587324df620604c1c54d6667a2d53c8`. The screen only finds close rows carrying a first stop-side wide-hold marker.

| Source | Coverage of the 81 screened closes | Recorded evidence |
|---|---:|---|
| `active_trade_logs`, joined by close ID | 81/81, one position per close | The bounded position-keyed read found 81 `position_closed` rows, one per position, between September 1 and November 4 at 14:10 UTC. |
| `exit_decision_archive`, joined by position ID, symbol and within five minutes of each close | 81/81, one archived close per position | The writer stores the position ID as `trade_id` and the archive mode as `paper_sim`. The snapshot has mode, quantity, costs, P&L, price source and pool. It carries no comparator history or per-evaluation state. GIS separately returned one exact matching row from the same join. |
| Saved `bookState` position metadata on the close row | 81/81 latest skip records, 73/81 with a saved wide-only yield, 8/81 without one | The 73 rows contain 1,274 retained wide-only yield entries. Of the 81 closes, 59 hit the writer's 20-yield cap. A position's yield entry does not prove that the shared comparator was present and deleted on that evaluation. |
| Operational logs and sampled quotes | Earliest retained error rotation was November 7, whose daily file starts November 6 under Storage Policy §5.5. November 16 GIS remains a direct positive control for the same log family. | The saved samples can witness quotes. A four-second target sampling cadence leaves intervening exit evaluations unknown. The October 19 retained warm manifest identifies an available partition; it cannot supply missing engine history. |

**Current coverage of the screened closes:** 81 partial, zero fully matched in the checked sources, zero missing all close evidence. Each close has its position and archived exit. For each, the missing grade is a same-process link from its wide hold to the actual comparator deletion, successor seed, validation and exit opportunity on an unbroken evaluation tape. The 53 first-night release log events and the later GIS control stay outside the 81-close screen. CRM remains a recorded ask-only sequence control. GIS remains a short hold with a surviving comparator and a witnessed bid, with no direct linkage from the archive snapshot to the booked fill.

A second read checked the retained C-P5 harvest. Across the compressed daily files named October 20 through November 16, it returned 9,513,729 admitted `XS_FRAME` lines and 1,443 `VENUE_PAUSE` family lines. The 9,515,172 lines exhaust the read. The producer deliberately retains only those line families, so it gives no clear, yield, seed or validation trace. The frame format also lacks bid size and a venue receipt identity. `scripts/analysis/xs_frame_extract.sh` describes a separate evaluator-frame harvest and deployment/restart manifest with the same frame limitations. Reading its default directory failed because the path did not exist on staging. No coverage is claimed from that path.

An independent open-position sample at 2026-11-27 05:44:04 UTC found 17 staging paper xStock positions currently open. All 17 opened after the fixed historical cohort cut. Sixteen of those 17 carried both a saved last book-state skip and a saved wide-only yield. These records are right-censored context. The data lacks a decision/close endpoint or the stable evaluator tape needed to grade these holds, and they stay outside the 81-close denominator.

REVIEWER: claim-only · which retained sources can settle exact historical matching and what other histories are possible · identified the C-P5 harvest and the separate frame-extractor path · re-derived y, read harvest and attempted default-path read.

The structured read can reproduce the per-close coverage beginning with this projection. Run through `dt-sql --csv`:

```sql
WITH screened AS (
  SELECT id, symbol, closed_at, metadata
  FROM closed_trades
  WHERE mode = 'paper' AND asset_class = 'xstock_spot'
    AND closed_at >= '2026-10-16T15:10:55Z'
    AND closed_at < '2026-11-04T13:52:36Z'
    AND metadata #>> '{exitRefusal,spreadBlownFirstStopRefusedBid}' IS NOT NULL
)
SELECT s.id, s.symbol, s.closed_at, p.position_id, p.position_count,
       a.archive_count,
       jsonb_typeof(s.metadata #> '{bookState,lastSkip}') = 'object' AS has_last_skip,
       count(y.entry) FILTER (WHERE y.entry->'reasons' = '["spread_blown"]'::jsonb) AS saved_wide_yields,
       count(y.entry) AS saved_yields
FROM screened s
LEFT JOIN LATERAL (
  SELECT max(position_id) AS position_id, count(DISTINCT position_id) AS position_count
  FROM active_trade_logs
  WHERE trade_id = s.id AND event_type = 'position_closed'
) p ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS archive_count
  FROM exit_decision_archive
  WHERE trade_id = p.position_id AND symbol = s.symbol
    AND source = 'active-execution-engine' AND mode = 'paper_sim' AND asset_class = 'xstock_spot'
    AND captured_at BETWEEN s.closed_at - interval '5 minutes' AND s.closed_at + interval '5 minutes'
) a ON true
LEFT JOIN LATERAL jsonb_array_elements(coalesce(s.metadata #> '{bookState,yields}', '[]'::jsonb)) y(entry) ON true
GROUP BY s.id, s.symbol, s.closed_at, s.metadata, p.position_id, p.position_count, a.archive_count
ORDER BY s.closed_at, s.id;
```

## P2 — Paired quote recovery fixtures

`server/tests/unit/b-xstock-bid-trigger-reland-inc2-chain.test.ts` adds nine paired tests through the real exit loop, guard, comparator, selector and hard-stop evaluator. Each arm starts a new engine fixture, warms a fresh comparator on the same tape and runs the identical ordered recovery quotes. A cap-reaching hold must record the position's wide yield and the comparator's actual deletion before starting the paired recovery. The candidate withholds evaluation at the fixture boundary. The close stub captures decision requests. The tape supplies synthetic receipt provenance and 1,500 ms between evaluations. These cases verify decision behavior under controlled inputs. They provide no observed historical fills.

| Tape after the hold | Existing rule | Movement candidate |
|---|---|---|
| Fresh `A → B → A` after clear | Requests a stop on evaluation 3 | Counts 0, 1, 2 through seeding and validation, then requests the same stop on evaluation 3. |
| Fresh `A → B → B`, frozen, ask-only, snapshot, replay and repeat-evaluation cases | Requests a stop on evaluation 3 in each of the six tapes | Holds on evaluation 3 in all six. The ask-only tape counts two pair changes without any bid movement. The snapshot, replay and repeat evaluation add no movement credit. These arms end without a decision at the end of the tape. |
| Fresh `A → B → wide → A → B → A` after clear | Requests a stop on evaluation 4 | Resets movement on the wide evaluation and requests the stop on evaluation 6, 3,000 ms later at the same tested bid relative to the original stop. |
| One wide evaluation with a surviving validated comparator, then `A` | Requests a stop on evaluation 1 | Requests the identical stop on evaluation 1 with zero movement. This protects the short-hold path used as the GIS control. |

Local verification passed **67/67** across the chain, increment A and reseed suites. Three temporary fixture mutations caused the specific assertions to fail: counting only after validation, allowing ask-only movement, and retaining movement across a wide interruption. The checked tests use the restored specification.

### Independent trailing state and incomplete history

`server/tests/unit/b65-tec-parity.test.ts` drives the real trailing evaluator with break-even enabled in the fixture and zero costs. Both arms start with entry 100, stop 95, target 110, ATR 1 and high-water 100. The fixture supplies the admission sequence established above. A repeated recovery quote at bid 101.20 reaches the existing evaluator alone. On this no-close evaluation the existing arm raises its stop to 100 and high-water to 101.20. The candidate records no evaluation and keeps stop 95 and high-water 100. At the next admitted bid of 99.90, the existing arm requests a break-even stop because its bid is 0.10 below its own stop. The candidate's bid is 4.90 above its stop and it remains open. Each arm has its own trade key and clears its trailing state after replay. Each starts with a fresh discontinuity detector for the same symbol.

`server/tests/unit/b-xstock-bid-trigger-reland-inc2-chain.test.ts` supplies the same `A → B → A` sequence with a four-second interval before the final A. Where the interval could contain unobserved decisions or quote changes, both arms stop after recording the first two evaluations and mark the comparison partial. Where the tape certifies no evaluations and unchanged admission state, both arms preserve the one earned move, count the arriving second move and request a stop at evaluation 3, 8,500 ms into recovery. This checks application of a known evidence status. The fixture supplies the status directly and makes no claim about the historical archive.

Local verification passed **101/101** across the four named fixture suites. The assertions detected three forced errors: allowing the unverified interval through, discarding the verified idle duration and updating the candidate's trailing state during a withheld evaluation.

### Scope and rejected inputs

The final paired fixtures exercise the real position streak, book guard and comparator. An empty comparator still yields after three wide evaluations, but records no deletion. A new engine given only the retained spread ring after a restart cannot inherit a movement gate from the previous engine. Both arms request the same stop on evaluation 3 with one quote move in each case. The retained-implausible test records `YIELD_KEEPS_IMPLAUSIBLE_CHAIN` and verifies the chain is present after the yield. The existing escape suite exercises how an implausible seed can recover.

With two positions holding the same symbol, the third wide evaluation records the first position's yield and one shared comparator deletion, alongside the other position's first skip. The paired runs then replay fresh `A → B → B`. The existing arm requests a stop for both position IDs at evaluation 2. The movement candidate requests the sibling's same stop at evaluation 2 at the same requested price, 384.60. The yielding position has just one move and requests no stop before the tape ends. Each requested close removes its position from the fixture before the next evaluation. This is a test of stop requests with stubbed fills. Removing the position-ID restriction suppresses the sibling's stop and fails the paired assertion.

If the evidence has two possible yielding owners, the fixture cannot attribute the deletion. A synthetic yield with both `spread_blown` and another reason is outside scope. The real absolute guard returns `spread_blown` alone before it reaches the comparator-relative branches.

Missing, crossed, nonpositive and stale quotes each block the existing evaluator on the ineligible evaluation and erase the candidate's one earned move. After that interruption, the existing arm first requests the stop at evaluation 4. The candidate restarts from zero and requests it at evaluation 6. In these four synthetic tapes the tested decision is at the same bid and 3,000 ms later. There is no fill simulation or historical opportunity credited in any fixture.

The new tally control uses the real refusal-tally writer. Two wide-hold releases occur on opposite sides of the same 100 stop, at 99 and 101. Each history then has a generic refusal and release. One later release carries no bid, while the other carries 99. The full serialized summaries are equal and both show a latest distance of −1%. That stored summary cannot establish the direction of the wide-hold release.

The final Step 4 diff from approved Step 2 contains three test files, this evidence file, and the class amendment to the scope. The upstream and downstream controls exercised paper entry depth, VTS booked closes and selector callers, crypto's stale/fresh exit boundary, and independent trailing states on the same symbol. The runtime files, entry paths, VTS and crypto code have no changes in the batch diff.

### Load-bearing fixture diff

**MODIFIED** `server/tests/unit/b-xstock-bid-trigger-reland-inc2-chain.test.ts`. Before the scope controls, the fixture's selected hold shape itself identified the candidate target.

```diff
- await warm(eng);
- if (hold === 'clear') {
-   await blowoutToYield(eng);
- } else {
-   const skipped = await tick(eng, BLOWN);
-   expect(readBookStateComparator(SYMBOL)?.validated).toBe(true);
- }
- allowDecision = !requireMovement || hold === 'short' || (moves >= 2 && bidMoved && askMoved);
```

```ts
function movementGateOwner(events: BookEvent[], cleared: boolean): string | undefined {
  const yields = events.filter(event => event.kind === 'yield');
  if (!cleared || yields.length !== 1) return;
  const [yieldEvent] = yields;
  if (yieldEvent.reasons.length === 1 && yieldEvent.reasons[0] === 'spread_blown') return yieldEvent.positionId;
}

eng.checkExitConditions = (position: { id: string }, ...args: unknown[]) => {
  reached = true;
  admitted = !requireMovement || position.id !== owner || movementReady;
  return admitted ? evaluate(position, ...args) : null;
};
```

**MODIFIED in r2**, actual stop requests checked by position and evaluation.

```ts
const { steps: baseline } = await replayRecovery(tape, false, 'siblings');
const { steps: candidate } = await replayRecovery(tape, true, 'siblings');
const siblingStop = { positionId: 'pos-MDB-sibling', requestedPrice: mid(b), reason: 'stop_hit' };
const ownerStop = { positionId: makePosition().id, requestedPrice: mid(b), reason: 'stop_hit' };
expect(baseline.map(step => step.requests)).toEqual([[], [ownerStop, siblingStop]]);
expect(candidate.map(step => step.requests)).toEqual([[], [siblingStop], []]);
expect(candidate[2].moves).toBe(1);
```

**NEW** `server/tests/unit/b-xstock-bid-trigger-reland-inca.test.ts`, tally control shown with the state-changing calls.

```ts
noteRefusal(tally, 'yield_refused', 1_000, true, 98, stop);
expect(noteRelease(tally, wideReleaseBid, stop, 2_000)).toBe(true);
expect(tally.lastReleaseBidToStopPct).toBe(wideReleaseBid - stop);
noteRefusal(tally, 'unvalidated', 3_000);
expect(noteRelease(tally, laterReleaseBid, stop, 4_000)).toBe(true);
return snapshotExitRefusal(tally);
```

**Verification** 182/182 tests across nine suites. Reproducible via `npm exec --offline -- vitest run --silent=true` with `b-xstock-bid-trigger-reland-inc2-chain`, `b-xstock-bid-trigger-reland-inca`, `b65-tec-parity`, `b-price-side-8a-p4a-reseed-escape`, `b-book-state-restart-durable`, `b80-tec-per-trade-keying`, `p19-b4b1-depth-gate`, `kd19-vts-exit-walk` and `b-xstock-bid-trigger-reland-inc4b` under `server/tests/unit/`. The Step 3 fixture mutations each failed their intended assertion: ignoring actual deletion, accepting a mixed reason, assigning an ambiguous clear and carrying ownership through restart. The r2 paired assertion specifically fails after removal of the position-ID restriction. The fixture was restored for the passing run.

## P3 — Disposition proposed for review

**Retain the current release rule.** The registered minimum is at least one fully matched eligible benefit and one fully matched eligible recovery case, with all scope controls passing. The fixed screen supplies zero of each across the 81 screened closes under the exact matching rule. The synthetic comparisons show how the candidate could withhold a valid decision or alter later trailing state, with no adjudicated historical benefit or cost. No policy release, setting change, deployment or new observation is requested. The #1191 joint recovery read and #1073/#961 staging gates retain their precedence.

**Review question** Does the revised paired sibling control and `non_architecture` inventory discharge the two Step 4 corrections at this ref? Coltrane's first ruling already accepted the historical retention result.
