# B-XSTOCK-BID-TRIGGER-RELAND increment A — STEP 4 CHANGE LIST (CC-C, 2026-10-10)

**Graded ref: `546cda86e`** (code), on `origin/migration/aws-supabase`. CI run `38067812938`.

## DISPATCH HEADER (workflow-04, three fields)
| field | value |
|---|---|
| **(i) declared change-class** | `architecture` (scope header, `B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` §MERGED r1) |
| **(ii) doc set for `architecture`** | `scope` **present** (`Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md`, §MERGED r1+r2) · `pre_audit` **present** (`Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCA_PRE_AUDIT.md` r5) · `completion_report` **absent — owed at Step 11** (batch open; increments B, C and objective 6 follow) · `batch_catalog`, `phase_history`, `system_manual` (§3.5.1/§3.5.1a), `sim` (S25/S25b readers, `getDepthSnapshot` return), `adjustment_framework` / `LEVER_INVENTORY` (the new knob) **absent — owed at Step 10** · `changes_and_fixes`, `running_issues` (`#996`, `#1066`, `3n.q5` homing, KKR `8a1eded8`) **conditional, owed at Step 10** · `deleted_log` **N/A** (nothing removed) · `roadmap` **N/A** (no roadmap change) · `phase_19_plan` **N/A** (not a P19 batch) |
| **(iii) Step 2** | `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCA_PRE_AUDIT.md` r5 at `f28012a25` — Langston accepted P1, P2, P4, P5, P6 and gate 3 (gate 2 r2); P3's read-site point folded in r5 |

## FILES (18)
**New:** `server/asset_classes/xstock_spot/entry-spread-plausibility.ts` (P3) · `server/services/exit-refusal-tally.ts` (P5) · `drizzle/migrations/2026-10-10-b-xstock-bid-trigger-reland-inca.sql` + `-rollback.sql` (P1 knob) · `server/tests/unit/b-xstock-bid-trigger-reland-inca.test.ts` (21 tests).
**Modified:** `book-state-tracker.ts` (P1, P3 accessor) · `book-state.ts`, `book-state-config.ts`, `b72-warmup.ts`, `MANIFEST.txt`, `scripts/xstock-hollow-recut.ts` (the 13th knob) · `active-execution-engine.ts` (P1 wiring, P2, P3, P4 callers, P5) · `execution/depth-source.ts` (P4) · `active-portfolio-manager.ts` (P4 flatten) · four existing tests (count 12 → 13, config literal, engine stub fields).

## P1 — the ring-independent release (`book-state-tracker.ts`, in `advanceBookStateComparator`, after the kRel escape)
```ts
  if (prev && prev.seedImplausible && riCeilingFrac !== null && riCeilingFrac > 0) {
    const inRun = spreadNow <= riCeilingFrac;
    if (inRun) {
      const bidMoved = frame.bid !== prev.priorBid;
      const askMoved = frame.ask !== prev.priorAsk;
      riRunMovesNow = prev.riRunMoves + (bidMoved || askMoved ? 1 : 0);
      riBidMovedNow = prev.riBidMoved || bidMoved;
      riAskMovedNow = prev.riAskMoved || askMoved;
    }
    const trailing = prev.spreads.concat(spreadNow); while (trailing.length > ringCap) trailing.shift();
    const trailingMedian = trailing.length >= ringCap ? medianOf(trailing) : null;
    const failed: string[] = [];
    if (trailingMedian === null) failed.push('window_not_full');
    else if (trailingMedian > riCeilingFrac) failed.push('window_median');
    if (!inRun) failed.push('frame');
    if (riRunMovesNow < 2) failed.push('moves');
    if (!(riBidMovedNow && riAskMovedNow)) failed.push('both_sides');
    if (failed.length === 0) { /* SEED_ESCAPED_RI line */ clearBookStateComparator(key, 'ring_independent_escape'); prev = undefined; escapedThisFrame = true; riEscapedThisFrame = true; }
    else riMiss = { failed, spreadNow, ceiling: riCeilingFrac, trailingMedian, runMoves: riRunMovesNow, bidMoved: riBidMovedNow, askMoved: riAskMovedNow };
  }
  ...
  if (!prev && riEscapedThisFrame) {      // the new chain's seed
    _retainedSpreads.delete(key);          // consumed, as a plausible seed consumes it
    seedRetainedMedian = null;             // seeded `vacuous`
  } else if (!prev) { /* unchanged seed judgement against the ring */ }
```
The engine passes `_c.riAbsSpreadCeilingPct / 100`. Knob `ri_abs_spread_ceiling_pct` = 1.0 (13th row); boot assertion `!== 13`, range (0, 10]. The `book-state-config.ts:41-44` comment that argued against a 13th row is rewritten (your gate 2 r2 record item); `spread_blown` becomes the 14th at objective 6.
**`RI_NEAR_MISS`** (engine, at `REFUSE unvalidated`): one line per position per CHANGE of the failed-clause set, carrying spread, ceiling, window median, run moves, both side flags and the position's running tally (`refusedS`, `episodes`, `longestS`, `sinceRestart`).

## P2 — the yield keeps an implausible chain (`active-execution-engine.ts`, the hollow yield)
```ts
- clearBookStateComparator(position.symbol, `yield_after_${_next}_hollow`);
+ if (readBookStateComparator(position.symbol)?.seedImplausible !== true) {
+   clearBookStateComparator(position.symbol, `yield_after_${_next}_hollow`);
+ } else {
+   console.warn(`… YIELD_KEEPS_IMPLAUSIBLE_CHAIN — not cleared; it ends by the escape or the ring-independent release`);
+ }
```
Both your in-code statements are in the comment above it (safe only with P1; the r6 retention warning does not reach the clear).

## P3 — unheld-name entry plausibility (`entry-spread-plausibility.ts` + the entry gate)
Runs only when `readBookStateComparator(symbol) === null`. Yardstick: `readRetainedRingMedian(symbol)` (new tracker accessor over the in-memory `_retainedSpreads`) else:
```sql
SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY spread)
FROM (SELECT (ask-bid)/((ask+bid)/2) AS spread FROM xstock_spot_ticker_snap
      WHERE symbol = $1 AND is_extended_hours = false AND bid > 0 AND ask > 0 AND ask >= bid
        AND captured_at > NOW() - '5 days'::interval
      ORDER BY captured_at DESC LIMIT $window) s
```
Refuse when `spreadNow > max(kRel × yardstick, floorPct/100)` (`implausible_spread_entry …`). Under a full window or a failed read ⇒ pass, labelled. **Measured on staging (HUT/USD, 2026-10-10):** execution 2.2 ms, planning 14.2 ms (45 daily partitions), n = 20, median 0.267%.

## P4 — the newest-row depth verdict (`depth-source.ts`)
Newest row unconditionally; verdict per side `ok | qty_absent | price_absent`; a `qty_absent` side carries its price at qty 0, a `price_absent` side is empty. `opts.allowLastTwoSided` reruns the exact pre-P4 query (last complete row) and marks `fromLastTwoSided`. Callers: entry depth gate refuses (`depth_verdict bid=… ask=…`), the close fill refuses unless `_isFlatten` (`_countCloseRefusal(…, 'depth_verdict_<bid>_<ask>', canYield=false)`), `resolveFlattenPrice` passes `allowLastTwoSided: true`.

## P5 — the tally (`exit-refusal-tally.ts`)
Per position: refused ticks, refused ms (between ticks of one episode only), episodes split at a 60 s gap, the longest episode, per kind (`hollow_skip | yield_refused | unvalidated`), and at each release the bid-to-stop distance in percent (`EXIT_RELEASED` line). Durable: `closed_trades.metadata.exitRefusal` (added to the close's allowlist), evicted after the write. `sinceRestart` = opened before this engine instance started.

## TESTS
`b-xstock-bid-trigger-reland-inca.test.ts` — 21: P1 release on the HUT/GLW shape (new chain vacuous, ring consumed, validates on the next frame) + null-ceiling control; stub ask (both_sides), the 7/503 book (frame, window_median), one tight print (window_median), a frozen book (moves, both_sides), an unimplausible chain untouched; P2 source fence + unguarded-fixture control; P3 judge cases, ring preferred with no DB call, regular-session query asserts `is_extended_hours = false`, under-window and read-failed labelled; P4 four verdict cases incl. the flatten's last-complete row; P5 episodes, gaps, release distance, null distance.
**Mutation run:** deleting the `both_sides` clause turns the stub-ask and frozen-book tests red (2 failures), restored. Related suites 41 files / 645 tests green. tsc baseline 337 = 337.
**Local full suite:** 2 failed / 3961 passed; 11 files failed. Every failure traced to this laptop: integration tests with no database, and `b-root-duplicate-scanner-retire` counting 13 clock subscribers because a stale agent worktree under `.claude/worktrees/` duplicates the source tree locally. CI on a clean checkout is the gate.

## JUDGEMENT CALLS TO ATTACK
1. **The released chain's seed is not judged against the ring, and it consumes the ring** (P1). Same end state as the kRel escape, but that ring is the outside datum r4-r6 protect. After a release the next yardstick comes only from the new chain's own ring when it next clears with movement — an after-hours ring. Is that the permissive drift r5 guards against? The ceiling bounds it: a later blown seed still has to exceed `kRel` times that ring.
2. **RI fields reset only on an ADVANCED frame over the ceiling.** A frame that never reaches the advance (a `hollow` verdict, which skips or yields; a crossed frame, which the writer refuses) neither counts nor resets the run — exactly as the kRel escape's `plausibleRunMoves` behaves today. So a hollow tick in the middle of a tight run does not break it.
3. **P3 does not run for a symbol whose stale comparator chain outlived its position** (an inherited chain): it keeps the predicate path, as the plan says. That chain's arms are relative to an old reference.
4. **P4 `price_absent` returns an empty side, not null,** for non-flatten callers; the entry warmth and the close refusal both treat it as unusable.
5. **The tally counts hollow skips and yield refusals as well as unvalidated refusals,** with a per-kind breakdown; A1 measured only the last kind.
6. **The close-fill `depth_verdict` refusal uses `canYield = false`,** so the close-refusal streak escalates on its existing cap like a cold-book refusal.
