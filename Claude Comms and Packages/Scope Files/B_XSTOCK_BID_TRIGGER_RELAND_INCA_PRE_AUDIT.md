# B-XSTOCK-BID-TRIGGER-RELAND increment A — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1, CC-C, 2026-10-10)

Scope: `B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` §MERGED r1 + r2 (Langston PROCEED 14:48Z). Increment A = objectives 1, 2, 3, 4. Code read at `origin/migration/aws-supabase` (deployed on staging as `ad01f5339`).

## 0. PREVIOUSLY STATED → NOW (read this first)
- **PREVIOUSLY STATED (scope obj 1b, and the deleted row 66): build a ring-independent release bound. NOW: WITHDRAW it (§9.4 disposition 5), keeping its reopen condition. REASON: measured below (A1).** Over 14 days, time spent refusing while the book was back inside the escape band (ratio ≤ kRel 3) totals **0.78 h across 468 episodes**, with **0 episodes over 30 min** (max 16.0 min, STZ). `8a-P4a` §A7 homed this bound with *"REOPENS if the named arm's logged real ratios show a held symbol stranded"*. The named arm (`REFUSE unvalidated … ratio=`) is exactly what this measured, and it shows no stranding.
- **PREVIOUSLY STATED (Langston's KKR finding): the hollow-yield re-seed resets the escape's progress, a defect to fix. NOW: confirmed as a mechanism, measured as LOW impact, kept as a one-line fix (A2).**

## A. THE AUDIT

### A1. The stranding measurement — the decision for obj 1b
**Instrument:** `scripts/analysis/xstock-refusal-episodes.py` (committed with this file). It reads the exit loop's own stderr: `REFUSE unvalidated … ratio=`, `SEED_ESCAPED`, `COMPARATOR_CLEARED reason=`, `SEED_IMPLAUSIBLE`. **Population:** every `error__2026-09-27…10-10*.log` plus `error.log` on staging (R2a: stderr rotates daily; all retained files are read), de-duplicated by line. **ratio** = the chain's current trailing median spread ÷ the retained ring median (`takeChainRefusalBasis`, `book-state-tracker.ts:194`).
| measure | value |
|---|---|
| refusal episodes (gap > 60 s splits) | **468 on 100 symbols**, 92,540 lines; 44 `SEED_IMPLAUSIBLE` |
| episode duration | median **17 s**, p90 **652 s**, max **14,146 s** (3.9 h) |
| end events | 450 none (a fresh chain validating, the documented two-tick cost; or the position closing), **17 `SEED_ESCAPED`**, 1 yield-clear |
| **stranded time** (refusing while ratio ≤ 3) | **0.78 h total; 4 episodes > 5 min; 0 > 30 min** |
| top stranded | STZ 10-08 06:52 16.0 min (ratio 1.10 throughout, no escape: the book did not MOVE, so condition (c) held it) · GLW 6.0 min within a 236-min episode that ended `SEED_ESCAPED` · STZ 5.6 min, escaped |
⇒ The escape works (17 escapes; the long episodes are books genuinely blown, e.g. KKR at ratio 270). **Withdraw obj 1b.** ⚠️ **Limits:** (i) the 60 s gap rule can split one episode in two; (ii) a ratio ≤ 3 with no MOVE is held on purpose by condition (c) (a frozen book), so 0.78 h is an UPPER bound on what a release bound could have released; (iii) 103 episodes contain `state=two_sided ratio=none` lines, which are freshly seeded chains whose trailing window is not yet full (the two-tick cost), not a reach gap.

### A2. KKR — the reset mechanism, read at the code
`active-execution-engine.ts:2140-2151`: at `hollowSkipCap` (60) consecutive hollow ticks the loop YIELDS and calls `clearBookStateComparator`. The next frame then seeds a new chain (`_seedable` admits `unknown/no_comparator`, `:2253`). On a blown book that seed is `SEED_IMPLAUSIBLE`, and the new chain starts with `plausibleRunMoves = 0` and an empty ring (`book-state-tracker.ts:355-410`). **Measured KKR/USD 2026-10-09:** 20:16:31Z yield-clear → 20:16:33Z `SEED_IMPLAUSIBLE seedSpread=0.05945 retainedMedian=0.00022` (ratio 270) → refusing. **The clear exists to drop a bad reference on a VALIDATED chain** (Langston's 09-03 latch finding: without it a healthy book reads `mark_deviation` forever). On a chain that is already `seedImplausible` it cannot do that job: the chain could never validate, and clearing only re-seeds on the blown frame and throws away escape progress. **Impact (A1):** low. Yields happen only during hollow streaks, and none of the 0.78 stranded hours traces to a post-yield reset. Kept because it is a one-line, provably safe fix.

### A3. `spread_blown` (obj 1a) — present, OFF, not a knob
`book-state.ts:266`: the arm returns `hollow / spread_blown` when `cfg.spreadBlownEnabled && spreadFrac > threshold`, using the same threshold as the one-side arms (`max(kRel × trailing, floorPct/100)`). `book-state-config.ts:44`: `spreadBlownEnabled: false`, a code constant, deliberately not a knob: *"Increment 3 adds the knob when the arm is turned on"* (`:41-43`, Langston's `3n.q7` inc-2 Step-1 ruling (a); `3n.q7`'s increment 3 is now this batch's objective 6). The boot assertion `assertBookStateKnobsAtBoot` requires EXACTLY 12 rows by set-equality. ⇒ Turning it on needs a 13th knob row, `BOOK_STATE_KNOBS` + 1, and the assertion moved to 13. **Its limit, pinned in the code (`book-state.ts:262-264`):** on a chain seeded inside a blowout its threshold is itself blown, so it cannot fire. That chain is caught by the seed judgement against the retained ring instead (A1 shows that path working).

### A4. Entry plausibility (obj 3, was row 41 / `#996`) — read at the code
`active-execution-engine.ts:700-735`: the entry gate calls `assessBookStateNow(symbol)`. `_comparators` holds only HELD symbols (single writer, the exit loop, `:2255`), so for an unheld symbol `assessBookState` returns `unknown/no_comparator` on any two-sided quote (`book-state.ts:200-203`). **Reachable at entry: `absent_bid`, `absent_ask` only.** A collapsed-but-positive bid or a stub ask on an unheld symbol passes. Langston refused seeding the comparator at entry (a second writer to SIM S25).

### A5. [C5] — `execution/depth-source.ts:48-56`, read at the code
The xStock query filters `ask > 0 AND ask_qty > 0 AND bid > 0 AND bid_qty > 0` BEFORE `ORDER BY captured_at DESC LIMIT 1`. If the current snapshot is one-sided (a side withdrawn), the query silently returns an OLDER two-sided row. `age_ms` is computed from that row, so the age bound is NOT defeated. **But the current book's withdrawal is invisible:** a withdrawn book reads as the last valid one (Langston's precision at the pre-sprint plan [C5]).

### A6. The refusal-duration report (obj 2) — what exists
Per-tick `REFUSE unvalidated` lines and one `REFUSAL_BASIS` line per chain (`:2296-2318`) already carry the evidence, but only in the log. Nothing on the trade records how long its exits were refused. `closed_trades` carries `exit_book_state` / `exit_book_state_at_fill` / `exit_book_state_basis` (`shared/schema.ts:1874-1883`): the state at decision and fill, not the duration.

### A7. Census (§9.5(a)) — SIM S25 `_comparators` / S25b `_retainedSpreads`, tests excluded
- **writes:** `advanceBookStateComparator` — ONE call site, the exit loop (`aee:2255`) · `3n.q8` ring restore at boot (`book-state-ring-store.ts`).
- **deletes:** `clearBookStateComparator` — the yield (`aee:2151`) and the escape (`book-state-tracker.ts:334`).
- **reads:** `assessBookStateNow` — entry gate (`aee:731`), exit loop (`aee:2100`), close fill (`aee:3762`), two `routes.ts` display reads (`:12677`, `:12810`) · `takeChainRefusalBasis` (`aee:2302`) · `readThresholdBasis` (`aee:2344`).
- **schedules:** the exit monitor loop only. **Exactly one writer of comparators, confirmed;** this increment keeps it one (obj 3 reads a DIFFERENT source; P3 below).

### A8. Ledger and provenance (§9.5(b), (b-ii))
`#943` (the guard), `#996` (entry asymmetry, the deleted row 41), `#1065` (MDB symmetric blowout), `#1066` (restart durability + its duration amendment), `#567`, `3n.q5` (§A7 homing, now withdrawn with citation), and Langston's KKR alert `8a1eded8`. **Kyle's 09-03 ruling (no clock term; judge the book) binds every plan item below; none adds a clock term** (the pause is increment C).

## B. THE PLAN (each item cites its finding)
| # | item | from | change | proof |
|---|---|---|---|---|
| **P1** | **Withdraw obj 1b** (the ring-independent bound) | A1 | No code. The scope records the withdrawal with A1's numbers and keeps the reopen condition: an episode stranded > 30 min with ratio ≤ kRel on a MOVING book. | A1's table, re-derivable with the committed script |
| **P2** | **KKR: do not clear a `seedImplausible` chain at the yield** | A2 | At `aee:2151`, skip `clearBookStateComparator` when the current chain is `seedImplausible` (read via `readBookStateComparator`). The yield's streak reset, alert and refusal stay unchanged. A validated chain still clears, as the 09-03 latch fix requires. | Unit: an implausible chain survives a yield with its `plausibleRunMoves` intact and escapes on recovery; control: a validated chain is still cleared at the yield (mutation: remove the guard → the first test fails) |
| **P3** | **Entry plausibility WITHOUT a second comparator writer** | A4 | For an UNHELD symbol, the entry gate judges the CURRENT spread against the symbol's own recent history read from `xstock_spot_ticker_snap`: the median spread over its last `trailingSpreadWindowSnaps` two-sided snapshots (one query against the table `depth-source.ts` already reads, caller `active-portfolio-manager.ts:290`; its cost is measured with `EXPLAIN` on staging at Step 3, not asserted here). Refuse entry when `spread > max(kRel × that median, floorPct/100)`, the same threshold form as `spread_blown`. HELD symbols keep the comparator path. Fail-open on absence (fewer than the window's rows ⇒ pass, labelled), per the seam's `#546` discipline. | Unit: stub ask and collapsed bid on an unheld symbol are refused; a normal book passes; under-window passes labelled. Staging: entry refusals counted by reason |
| **P4** | **[C5]: take the NEWEST snapshot, then judge it** | A5 | `depth-source.ts`: select the newest row for the symbol unconditionally; if a side is missing or zero, return a typed one-sided result (`null` + a reason the caller logs), never an older two-sided row. | Unit: a newest-row withdrawal returns one-sided, not the prior book; control: a two-sided newest row returns as today |
| **P5** | **The refusal-duration REPORT** | A6 | Per open position, in the exit loop: count refused ticks, refused seconds, episodes and the longest episode, plus the bid-side distance to the stop at each release. Written onto `closed_trades.metadata.exitRefusal` at close. A report query (`scripts/analysis/`) reads it. **No alert.** ⚠️ In memory, so a restart truncates an open position's tally; the field says so (`sinceRestart: true` when the position predates the boot). | Unit on the tally; staging: the field on the next closes; grep shows no new alert key |
| **P6** | **`spread_blown` knob: NOT in increment A** | A3 | Langston already ruled the knob lands WITH the switch, not ahead of it (`book-state-config.ts:41-43`). So the 13th row, `BOOK_STATE_KNOBS` + 1 and the assertion 12 → 13 ship as objective 6, seeded at Kyle's value. Increment A adds nothing here. | (objective 6's own Step 2) |
- **No item is UNAUDITED.**
- **Out of increment A:** the trigger and fill on the bid (B); the pause (C); crypto (row 38).
- **Governance owed at Step 10:** SM §3.5.1 (the entry arm P3, the yield change P2); SIM S25/S25b (unchanged writers, plus P3's read of the snapshot table as a new consumer); `DELETED_COMPONENTS_LOG` N/A (nothing removed).

## C. LANGSTON'S r2 ITEMS — WHERE EACH IS ANSWERED
| item | answer |
|---|---|
| **Order (r2 BLOCKER)** | **Form (i): A → objective 6 → B, with C independent.** B ships ungated, AFTER Kyle's switch. Reason: form (ii) puts a second reader of `spreadBlownEnabled` in the trigger path, which is one more thing to keep in step; form (i) costs only waiting. If the batch closes before objective 6, **B does not ship** (r2 condition 1). |
| C3 (where the pause lives), C4 (an exported ET predicate in `market-hours.ts`, no fifth Eastern-time reader), the row-166b non-contradiction | **Increment C's Step 2** — they bind only the pause. C is independent of A, so it does not hold A. |
| Row 65 (what it adds beyond `EquityTickRaw`), row 8b (census WITH a positive control that it has no xStock leg) | **Increment B's Step 2** — both are dependencies of B's trigger and size test, not of A. |

**Second readers:** none spawned for this document. **NOT RE-READ:** A1's numbers (re-derivable with the committed script) and A2's mechanism.
