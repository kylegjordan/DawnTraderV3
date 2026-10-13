# B-XSTOCK-BID-TRIGGER-RELAND increment A — STEP 4 CHANGE LIST (CC-C, 2026-10-10)

**Graded ref: `e1b37c2d5`** (code, after the gate-1 and gate-2 folds; first review at `546cda86e`, CI `38067812938`), on `origin/migration/aws-supabase`. CI run `38069987228` 4/4. **DEPLOYED 2026-10-10T17:05:21Z** (restart 632). **Step 4 APPROVED** (Langston gate 2 r2).

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
Runs when there is no USABLE reference (no comparator, or a `seedImplausible` one — gate 1 carried item). Yardstick: the regular-session median ONLY (the retained-ring basis and `readRetainedRingMedian` were DELETED at gate 2, BLOCKER-1):
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
3. ~~P3 does not run for an inherited chain~~ — **stale; corrected at gate 2 (Langston):** since gate 1's carried item, an inherited `seedImplausible` chain is NO usable reference and DOES get P3's arm; only a PLAUSIBLE inherited chain keeps the predicate path.
4. **P4 `price_absent` returns an empty side, not null,** for non-flatten callers; the entry warmth and the close refusal both treat it as unusable.
5. **The tally counts hollow skips and yield refusals as well as unvalidated refusals,** with a per-kind breakdown; A1 measured only the last kind.
6. **The close-fill `depth_verdict` refusal uses `canYield = false`,** so the close-refusal streak escalates on its existing cap like a cold-book refusal.

## STEP 4 GATE 2 (Langston, 2026-10-10) — CHANGES NEEDED on one blocker, folded
- **BLOCKER-1 — P3's ring basis was not hour-invariant.** Measured by Langston over all 95 durable rings: 86 wider than the regular-session median, 32 lifting the threshold above the 1% floor (worst 53.51%, KEYS/USD; PLTR 784×), regular-session window available for all 95. **Fix: basis 1 DELETED** — the yardstick is the regular-session median alone; `readRetainedRingMedian` removed from the tracker (so P3 adds NO S25b reader); test replaced by a fence that a wide retained ring is never the yardstick.
- **C-1** — the P5 evictions moved out of `if (trade)`/`try` into the existing `finally` beside the ladder accumulator.
- **C-2** — the `RI_NEAR_MISS` accumulator is flushed onto `EXIT_RELEASED` (suppressedTicks/Min/Max) and, at close, onto a `RI_NEAR_MISS_FLUSH` line before eviction.
- **Call 3** corrected above. Calls 1, 2, 4, 5, 6 accepted. Call 5 convention, stated: the tally and `_recordPriceSkip` are two instruments on overlapping populations; a one-tick episode contributes 0 ms by design.
- **Record items (§9.4):** (a) crossed-with-size rows read `ok/ok` (118 in 7 days, 101 regular-session, 56 symbols; unchanged exposure) — **disposition 2: added to increment B**, owner CC-C (scope §MERGED, increment B note). (b) on the `allowLastTwoSided` return the verdict describes the newest row while the levels are an older row — guarded at the one consumer; **disposition 5**, citing `depth-source.ts` docstring + the `_isFlatten` skip. (c) a regular-session median of exactly 0 is accepted — inert while the 1% floor binds; **disposition 5**.

## STEP 4 GATE 2 r2 (Langston, 2026-10-10) — APPROVED; record items folded
- (c) **the release branch's RI reset line was deleted at gate 1 (Langston's nit) and is provably inert:** `prev = undefined` forces the chain record's `prev ? … : 0/false` branch, so the new chain's run fields are 0/false either way.
- (d) **the knob row and the code are a PAIR:** the boot assertion is exact-13 both ways, so a code rollback without `2026-10-10-b-xstock-bid-trigger-reland-inca-rollback.sql` fails CLOSED at boot, and the rollback SQL without the code rollback does too. Roll back both, code first (the rollback file says so).
- **FORWARD-BINDING CONDITION (before objective 6 arms `spread_blown`):** the entry seam's `_noUsableRef` carve-out drops every hollow reason except `absent_bid|absent_ask`. Correct today only because the non-reference-relative reasons cannot fire (`spread_blown` hardcoded off; `feed_burst` behind `feed_read_enabled=0`). Objective 6 must turn the carve-out into a WHITELIST of the reference-relative reasons it drops (`bid_collapsed`, `ask_spiked`, `mark_deviation`), or fence it so arming either knob goes red. Recorded in the scope (§MERGED objective 6 note).

## STEP 7 — THE SUNDAY-REOPEN READ (2026-10-12 00:00-00:40Z, `error.log`, build `620b1b6b5`)
- **The ring-independent release FIRED where designed:** `SEED_ESCAPED_RI` ×3 — UNH 00:15:16 (`framesHeld=48 runMoves=4 seedSpread=0.05419 escapeMedian=0.00483 ceiling=0.01000`), CRWD 00:15:23 (`seedSpread=0.53335 escapeMedian=0.00955`), GEV 00:18:27 (`framesHeld=136 runMoves=2`). `EXIT_RELEASED` ×5 — UNH, CRWD, RBLX, GEV, COPX (`bidToStopPct` 0.58-13.78; `suppressedTicks` 5-214), each then entering the reopen pause (inc C) rather than deciding. Plus 2 kRel `SEED_ESCAPED`, 25 `RI_NEAR_MISS`.
- **Held:** 1 `SEED_IMPLAUSIBLE` (RCL 00:16:52, `seedSpread=0.08333` vs `retainedMedian=0.00475`); 1,830 `REFUSE unvalidated` lines.
- **Yields — the old valve, by design until objective 6:** 46 `YIELD after 60 hollow ticks` (ORCL, AMAT, MCD repeatedly with `reasons=mark_deviation validated=false framesSinceSeed=38`; RCL once `ask_spiked`), raising the four `Hollow book held … YIELDED` alerts. P2's guard prevents a yield only on `seedImplausible`; these chains are unvalidated, not seed-implausible. Bounded by `spread_blown` (objective 6, Kyle's switch). 0 closes.
- **Entry side:** 0 `implausible_spread_entry`, 0 `depth_verdict` refusals in the window — consistent with no xStock entries in it (unexercised, not passed).
- Still owed: KKR/USD at 2026-10-12 13:50Z (Langston alert `8a1eded8`); `exitRefusal` on the first xStock close after the deploy.

## STEP 7 — THE KKR/USD READ (2026-10-12 13:52Z; `error.log` from 13:20Z, build `e8f575d3c`)
- **Held, then released by the ring-independent arm at the regular session.** KKR's chain seeded at 09:01:45Z (after CC-B's 08:58Z restart) on a 3.05 % spread against a 0.022 % retained median; 842 `REFUSE unvalidated` lines from 13:20Z alone. **`SEED_ESCAPED_RI` at 13:49:47Z** (`framesHeld=6596 runMoves=2 escapeMedian=0.00724 spreadNow=0.00702 ceiling=0.01000`), **`EXIT_RELEASED` at 13:49:50Z** (`bidToStopPct=2.914 suppressedTicks=12 refusedS=10185`) — 19.8 min after the 13:30Z open, the window median taking that long to fall under the 1 % ceiling. 97 `XS_FRAME frame=ok` decisions followed; 11 `RI_NEAR_MISS` before the release. The position was 2.9 % above its stop throughout: the 2.8-hour hold cost no exposure.

## STEP 7 — THE P5 DURABLE CLOSE SINK (fixed cutoff 2026-10-13 17:44:13.285Z)
- **The first xStock close after increment A's 2026-10-10 17:05:21Z deployment persisted the new tally.** AMAT/USD closed at 2026-10-12 08:59:56.086Z with a JSON-object `exitRefusal`: 2 unvalidated ticks, 1 episode, 1,470 refused ms, 1 release, and `sinceRestart=true`.
- **Fixed post-deploy population:** all 29 closed `xstock_spot` paper rows from the deployment boundary through the cutoff; 29/29 have the key, 29/29 values are objects, and 29/29 have `refusedTicks > 0`. **Equal-size temporal control:** the immediately preceding 29 closed xStock rows span 2026-10-08 11:16:22.283Z to 2026-10-09 20:26:38.407Z; 0/29 have the key. The control distinguishes the new durable instrument from a pre-existing metadata field; it does not claim the earlier trades had no refusals.
- There is no UI surface for this field: repository search finds the close-time writer and documents/tests, but no client reader. Verification is therefore the durable database row plus the live refusal/release lines, not a dashboard rendering claim.
- **Limit:** these mutable current rows do not by themselves exclude a manual or later backfill. Repository-wide search finds no migration, script, or second writer for `exitRefusal`, but the evidence is a close-time before/after observation, not an audit-log proof of causality; histories with `sinceRestart=true` are lower bounds on the full position lifetime.
- `REVIEWER: claim-only · name the objects and alternative states that settle durable post-deploy exitRefusal persistence · HIT — a seconds-only cutoff excluded the 17:44:13.285Z close and made the first independent cohort 28, not 29; also surfaced the mutable-row/backfill and partial-history limits · re-derived y (cutoff corrected to the exact stored timestamp; 29/29 versus 0/29)`.

## STEP 8 EVIDENCE PACKET — THE STZ/USD POST-OPEN READ (2026-10-13 13:30-18:44Z; `error.log`, build `94bf16d1022b8cb24c027df9aa721fb1d0333f18`)
- **The pre-registered falsifier passed on its intended position.** The current process started at 09:24:30Z; STZ seeded an implausible chain at 09:29:00Z (`seedSpread=0.02005`, retained median `0.00032`). At 13:45:26Z — 15 min 26 s after the US cash open — `SEED_ESCAPED_RI` fired after both sides moved over five run moves, with `spreadNow=0.00423`, the 20-frame `escapeMedian=0.00886`, and both below the 1% ceiling. `EXIT_RELEASED` followed at 13:45:30Z (`bidToStopPct=18.442`, `refusedS=12024`, 11 episodes), and the same tick emitted `XS_FRAME frame=ok` on bid 127.46 / ask 128.00 rather than another refusal.
- **Sustained-result population:** from 13:46:00Z through the fixed cutoff at 18:44:11Z, STZ emitted **11,418 `XS_FRAME` rows, all `frame=ok`, and zero `REFUSE unvalidated` rows**. Positive control on the same current-process STZ stream: from the new chain's 09:29:01Z seed through the last refusal at 13:45:29Z, the instrument emitted 7,900 `REFUSE unvalidated` rows. The deployed build contains increment A (`e1b37c2d5` is an ancestor). **CC-C verdict: PASS; Coltrane's final Step-8 verdict remains pending** — his later 19:20Z message superseded the 19:19Z approval until the complete source populations are reviewable.

### Re-derive on staging (fixed cutoff; commands run for this packet)
```bash
grep -F 'STZ/USD' /var/log/dawntrader/error.log | grep -E '^2026-10-13 13:45:(0[0-9]|1[0-9]|2[0-9]|3[0-9])'
grep -F '[3n.q7][XS_FRAME] STZ/USD' /var/log/dawntrader/error.log | sed -n '/^2026-10-13 13:46:/,/^2026-10-13 18:44:11/p' | sed -n 's/.* frame=\([^ ]*\).*/\1/p' | sort | uniq -c
grep -F 'STZ/USD' /var/log/dawntrader/error.log | sed -n '/^2026-10-13 13:46:/,/^2026-10-13 18:44:11/p' | grep -F 'REFUSE unvalidated' | awk 'END{print NR}'
grep -F 'STZ/USD' /var/log/dawntrader/error.log | sed -n '/^2026-10-13 09:29:01/,/^2026-10-13 13:45:29/p' | grep -F 'REFUSE unvalidated' | awk 'END{print NR}'
```
Ref check from a fetched repo: `git merge-base --is-ancestor e1b37c2d5 94bf16d1022b8cb24c027df9aa721fb1d0333f18` exits 0.

### Coltrane gate 1 — CHANGES NEEDED, evidence reach fixed

Coltrane independently confirmed the ancestry check, but his host could not authenticate to staging and the first review ref carried only the implementer's counts. The fixed-window command stdout, exact 34-line release slice, provenance, and SHA-256 digests for all four filtered populations are now committed in `B_XSTOCK_BID_TRIGGER_RELAND_STZ_STEP8_EVIDENCE.md`; the verdict remains pending until he reviews that immutable object.

### Coltrane gate 2 — provisional approval superseded (2026-10-13 19:19-19:20Z; graded ref `7a7f3e544`)

Coltrane independently extracted the committed 34-line event slice and reproduced SHA-256 `d498ffc3dd37d037646295dc6756ad488e2c387494b605d559781f597b4a64d5`. He confirmed the 13:45:26Z escape after five moves with the current spread and 20-frame median both below the 1% ceiling, plus the 13:45:30Z release and usable frame. One minute after his initial approval, he narrowed the verdict to **CHANGES NEEDED**: the larger 11,418 / 0 / 7,900 populations were still represented only by scalar counts and filtered-stream hashes, so he could not independently prove completeness or the zero-refusal claim.

### Coltrane gate 3 — complete source populations committed; review pending

`B_XSTOCK_BID_TRIGGER_RELAND_STZ_STEP8_EVIDENCE.md` now names two deterministic gzip objects containing every STZ line in the original pre- and post-release ranges. Locally expanding those committed candidates reproduces 10,224 pre-release source lines with 7,900 refusals and 11,424 post-release source lines with 11,418 `XS_FRAME` rows, all `frame=ok`, and zero refusals; the three filtered-stream hashes exactly match the earlier packet. The gate remains open until Coltrane independently re-derives those results from the pushed objects.

### Coltrane gate 4 — BLOCKED on reviewer authority (2026-10-13 19:53-19:54Z; exact ref `5abab2b06`)

The complete source objects are pushed on the graded shared ref and CI run `38458091854` passed all four jobs at their exact commit. Coltrane nevertheless refused the re-review twice: his higher-priority installed `AGENTS.md` excludes him from every routine review and says a repository rule cannot replace that instruction. The repository `AGENTS.md` assigns him this Codex-shift gate and Langston is disabled, so neither reviewer can act without Kyle resolving the instruction conflict. No Step-8 approval is claimed.

### Coltrane gate 5 — APPROVED after Kyle's explicit authorization (2026-10-13 20:21Z; exact ref `5abab2b06`)

Kyle explicitly authorized Coltrane to review steps and batches during the Codex shift, resolving gate 4's instruction conflict. Coltrane independently expanded both committed gzip objects and reproduced 10,224 total / 7,900 refusal pre-release lines and 11,424 total / 11,418 `XS_FRAME` / zero refusal post-release lines, with all 11,418 frames in the `ok` bucket. Every gzip, expanded-stream, and filtered-stream hash matched the manifest; the six other post-release lines were hourly `VTS_XS_SYM` aggregates. Positive control returned the 7,900 pre-release refusals, and a mutation from one `frame=ok` to `frame=none` changed the bucket to 11,417 / 1 and changed the hash. He also re-derived the unchanged 34-line escape/release slice. **Verdict: APPROVED; the 19:20Z evidence blocker is cleared.**
