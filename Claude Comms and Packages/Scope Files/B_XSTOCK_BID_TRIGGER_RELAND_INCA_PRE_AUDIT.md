# B-XSTOCK-BID-TRIGGER-RELAND increment A — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r2, CC-C, 2026-10-10)

Scope: `B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` §MERGED r1 + r2 (Langston PROCEED 14:48Z). Increment A = objectives 1, 2, 3, 4. Code read at `origin/migration/aws-supabase` (deployed on staging as `ad01f5339`).

## 0. PREVIOUSLY STATED → NOW (read this first)
- **PREVIOUSLY STATED (r1, `8a02c1f6e`): withdraw objective 1b (the ring-independent release bound) — 0.78 h stranded, 0 episodes over 30 min. NOW: 1b STAYS and is BUILT in increment A (P1). REASON: r1 measured the wrong object** (Langston, gate 1, 2026-10-10). It counted refused time only while `ratio <= kRel`, which is the set the existing escape already handles; the ring-independent cases (`ratio > kRel`, `ratio=none`) scored zero by construction, so its "0 over 30 min" was guaranteed before the run. Its unit (a log fragment split at any 60 s gap) also could not see a long hold. **Measured on the right object (A1): 43.58 h of refusal at `ratio > kRel`, of which 6.46 h sat at an absolute spread ≤ 0.5%; GLW/USD was refused for 110 min continuously on a book under 0.5%.** That is the §A7 reopen condition, met.
- **The r1 instrument is DELETED** (`scripts/analysis/xstock-refusal-episodes.py`): its docstring called its figure "an UPPER bound on what a ring-independent bound could release", which is inverted. What it did measure stands as a separate, narrower finding: the escape's own lag inside the band (17 `SEED_ESCAPED`, 0.78 h withheld by its conditions (a)/(b)/(c); STZ 16 min at ratio 1.10 flat, held by (c) as designed).
- **PREVIOUSLY STATED (Langston's KKR finding): the hollow-yield re-seed resets the escape's progress. NOW: confirmed as a mechanism; kept as a one-line fix (A2). Langston accepted it at gate 1.**

## A. THE AUDIT

### A1. The stranding measurement, on the object §A7 names — the decision for obj 1b
**The condition** (`B_PRICE_SIDE_BY_JOB_8A_P4A_AUDIT_AND_PLAN.md:100`): a held symbol that *"DOES NOT ESCAPE … while its captured spread sits within the bound"*, the bound being candidate C's class-wide absolute ceiling (`B_PRICE_SIDE_BY_JOB_8A_P4A_SCOPE.md` §4a).
**Instrument:** `scripts/analysis/xstock-refusal-holds.py` (committed with this file). **Object:** every `REFUSE unvalidated … ratio=` line (one per refused exit tick) in `/var/log/dawntrader/error__2026-*.log` + `error.log` on staging, de-duplicated by line: **92,540 lines, 100 symbols.** Each line is joined AS-OF to the newest `xstock_spot_ticker_snap` row for its symbol (spread = (ask − bid) / mid; a row older than 120 s or one-sided is `unknown`, never inside any ceiling), and to the active-path position holding the symbol at that moment. **Unit: one HOLD = one position id** (127 units, of which 12 are refusal lines with no matching position, kept as their own units and never merged). Each line owns min(gap to the next line, 60 s).
**Refused HOURS by ratio class × absolute spread band (each class on its own line):**
| class | ≤0.5% | 0.5-1% | 1-2% | 2-3% | 3-5% | 5-10% | >10% | unknown | class total |
|---|---|---|---|---|---|---|---|---|---|
| `ratio=none` | 0.69 | 0.05 | 0.02 | 0.00 | 0.02 | 0.00 | 0.00 | 0.00 | **0.78** |
| `ratio <= kRel` | 0.58 | 0.13 | 0.08 | 0.02 | 0.02 | 0.00 | 0.00 | 0.25 | **1.08** |
| **`ratio > kRel`** | **6.46** | **4.17** | 11.61 | 2.91 | 1.20 | 2.55 | 1.65 | 13.04 | **43.58** |

**Longest CONTINUOUS refused run with spread ≤ ceiling, per hold (swept; no default):**
| ceiling | holds > 5 min | holds > 30 min | max |
|---|---|---|---|
| 0.5% | 4 | 1 | 110.3 min (GLW/USD, from 10-07 20:16) |
| 1% | 5 | 1 | 110.3 min |
| 2% | 8 | 2 | 110.7 min |
| 3% | 10 | 2 | 110.7 min |
| 5% / 10% | 10 | 3 | 110.7 min |

**Positive control — HUT/USD (the known long hold, 10-06 18:59 → 10-07 14:03):** one position, **15.79 h refused in 38 fragments**: 2.11 h at ≤0.5%, 2.47 h at 0.5-1%, 5.89 h at 1-2%, 4.38 h unknown; longest continuous run 16.6 min at ≤1%, 38.1 min at ≤3%. The instrument returns non-zero on the case it must.
⇒ **The reopen condition is met: the ring rejects books that are tight in ABSOLUTE terms.** A symbol's retained ring holds its tightest daytime spread (HUT's retained median at its 20:16 seed: 0.054%), so an ordinary after-hours spread of a few tenths of a percent reads as `kRel`-times blown. The 1-2% band (11.61 h) shows why the ceiling is a decision, not a fact.
⚠️ **Limits:** (i) the as-of snapshot is a different producer from the guard's frames; (ii) 13.04 h are `unknown`, mostly stale snapshots (the feed's newest row fleet-wide is 10-10 13:02Z, so weekend refusals carry no spread); (iii) the continuous-run figure resets at every 60 s gap in the refusal lines (HUT: 38 fragments), so it UNDERSTATES a hold's longest stranded stretch, while the per-band hours do not depend on fragmentation; (iv) `ratio=none` (0.78 h) and the escape's in-band lag (`ratio <= kRel`, 1.08 h) are reported, not merged.

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
`#943` (the guard), `#996` (entry asymmetry, the deleted row 41), `#1065` (MDB symmetric blowout), `#1066` (restart durability + its duration amendment), `#567`, `3n.q5` (§A7 homing; its reopen condition is met by A1, so it is built here as P1), and Langston's KKR alert `8a1eded8`. **Kyle's 09-03 ruling (no clock term; judge the book) binds every plan item below; none adds a clock term** (the pause is increment C).

## B. THE PLAN (each item cites its finding)
| # | item | from | change | proof |
|---|---|---|---|---|
| **P1** | **BUILD candidate C, the ring-independent release** (objective 1b) | A1 | In `advanceBookStateComparator`, beside the existing escape, on a `seedImplausible` chain: the SAME run structure as the escape's condition (c) (a run of contiguous two-sided frames, counted in moves, repeats tolerated), with two changes: the yardstick is a class-wide **absolute ceiling** instead of `kRel × retained median`, and **BOTH sides must have moved** within the run (stricter than the escape's either-side, per `8a-P4a` §4a). On success it routes through `clearBookStateComparator` with reason `ring_independent_escape` and logs `SEED_ESCAPED_RI` with the spread, ceiling and run. **The ceiling is a DB-governed knob with no code default** (a 13th `book_state` row; boot assertion 12 → 13; fail-closed when absent). **Proposed seed: 1%.** It would have released the 10.6 of 43.6 refused hours that sat at ≤1% (A1), and it is conservative ON PURPOSE: until increment B the exit TRIGGER is still the mark, so a release on a wide book closes at a price the bid would not give. Langston rules on the value. | Fixtures for every `8a-P4a` r3-r5 case: a half-hollow stub-ask book (fails both-sides-move), the collapsed 7.00/503 book (fails the ceiling), a single tight print (fails the run), a HUT-shape tight after-hours book (releases). Mutation: drop the both-sides clause → the stub-ask fixture fails. Staging: `SEED_ESCAPED_RI` lines on holds of the A1 shape |
| **P2** | **KKR: do not clear a `seedImplausible` chain at the yield** | A2 | At `aee:2151`, skip `clearBookStateComparator` when the current chain is `seedImplausible` (read via `readBookStateComparator`). The yield's streak reset, alert and refusal stay unchanged. A validated chain still clears, as the 09-03 latch fix requires. | Unit: an implausible chain survives a yield with its `plausibleRunMoves` intact and escapes on recovery; control: a validated chain is still cleared at the yield (mutation: remove the guard → the first test fails) |
| **P3** | **Entry plausibility WITHOUT a second comparator writer** | A4 | For an UNHELD symbol, the entry gate judges the CURRENT spread against the symbol's own recent history read from `xstock_spot_ticker_snap`: the median spread over its last `trailingSpreadWindowSnaps` two-sided snapshots (one query against the table `depth-source.ts` already reads, caller `active-portfolio-manager.ts:290`; its cost is measured with `EXPLAIN` on staging at Step 3, not asserted here). Refuse entry when `spread > max(kRel × that median, floorPct/100)`, the same threshold form as `spread_blown`. HELD symbols keep the comparator path. Fail-open on absence (fewer than the window's rows ⇒ pass, labelled), per the seam's `#546` discipline. | Unit: stub ask and collapsed bid on an unheld symbol are refused; a normal book passes; under-window passes labelled. Staging: entry refusals counted by reason |
| **P4** | **[C5]: take the NEWEST snapshot, then judge it** | A5 | `depth-source.ts`: select the newest row for the symbol unconditionally; if a side is missing or zero, return a typed one-sided result (`null` + a reason the caller logs), never an older two-sided row. | Unit: a newest-row withdrawal returns one-sided, not the prior book; control: a two-sided newest row returns as today |
| **P5** | **The refusal-duration REPORT** | A6 | Per open position, in the exit loop: count refused ticks, refused seconds, episodes and the longest episode, plus the bid-side distance to the stop at each release. Written onto `closed_trades.metadata.exitRefusal` at close. A report query (`scripts/analysis/`) reads it. **No alert.** ⚠️ In memory, so a restart truncates an open position's tally; the field says so (`sinceRestart: true` when the position predates the boot). | Unit on the tally; staging: the field on the next closes; grep shows no new alert key |
| **P6** | **`spread_blown` knob: NOT in increment A** | A3 | Langston already ruled the knob lands WITH the switch, not ahead of it (`book-state-config.ts:41-43`). So its row ships as objective 6 (the 14th, after P1's 13th), seeded at Kyle's value. Increment A adds nothing here. | (objective 6's own Step 2) |
- **No item is UNAUDITED.**
- **Out of increment A:** the trigger and fill on the bid (B); the pause (C); crypto (row 38).
- **Governance owed at Step 10:** SM §3.5.1/§3.5.1a (the ring-independent release P1, the entry arm P3, the yield change P2); `ADJUSTMENT_FRAMEWORK` / `LEVER_INVENTORY` for the new knob; SIM S25/S25b (unchanged writers, plus P3's read of the snapshot table as a new consumer); `DELETED_COMPONENTS_LOG` N/A (nothing removed).

## C. LANGSTON'S r2 ITEMS — WHERE EACH IS ANSWERED
| item | answer |
|---|---|
| **Order (r2 BLOCKER)** | **Form (i): A → objective 6 → B, with C independent.** B ships ungated, AFTER Kyle's switch. Reason: form (ii) puts a second reader of `spreadBlownEnabled` in the trigger path, which is one more thing to keep in step; form (i) costs only waiting. If the batch closes before objective 6, **B does not ship** (r2 condition 1). |
| C3 (where the pause lives), C4 (an exported ET predicate in `market-hours.ts`, no fifth Eastern-time reader), the row-166b non-contradiction | **Increment C's Step 2** — they bind only the pause. C is independent of A, so it does not hold A. |
| Row 65 (what it adds beyond `EquityTickRaw`), row 8b (census WITH a positive control that it has no xStock leg) | **Increment B's Step 2** — both are dependencies of B's trigger and size test, not of A. |

**Second readers:** none spawned. **NOT RE-READ by a second reader:** A1's numbers (re-derivable: run the committed script as stated, about 17 s on staging) and A2's mechanism. Langston's gate-1 send-back is folded in full: object, unit, populations on separate lines, positive control.
