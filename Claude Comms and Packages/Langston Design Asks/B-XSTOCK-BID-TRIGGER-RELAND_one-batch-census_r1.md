# One batch for xStock trade realism — overlap census and merge proposal (r1, CC-C, 2026-10-09)

**Kyle (2026-10-09 ~08:15Z), condensed:** go through the sprint plan and the pre-sprint plan for anything that overlaps or aims at the same thing. Where something already planned does it better, borrow from it; where ours is better, adopt ours. **End with ONE batch, done BEFORE the sprint,** so that weeks from now nobody opens a second batch that re-tweaks something already working, without the context. He confirmed that alerts for a genuine feed anomaly are wanted (rows 3a/3a1).

**The goal the batch serves (design file `B-XSTOCK-BID-TRIGGER-RELAND_overnight-exit-design_r1.md`, r3-r6):** a paper or VTS xStock trade opens or closes only where a real Kraken trade could. That means the bid for a sell and the ask for a buy, on a plausible book that holds our size, at any hour except an ~20-minute pause at each venue transition. There is no forced exit and no overnight alert flood.

## Census — every row in `SPRINT_TO_LIVE_PLAN.md` (and §0a's pre-sprint stages) that touches this, read in full at `f3c721bf4`
| row | owner | what it does | verdict |
|---|---|---|---|
| **2** `B-XSTOCK-BID-TRIGGER-RELAND` | CC-C | inc 3a `spread_blown` ON; inc 3b trigger to the bid | **THE BATCH** |
| **66** `B-BOOK-STATE-RING-INDEPENDENT-BOUND` (+ `#567` via row 17) | CC-C | the plausibility bound, so a re-seed inside a blowout has a way out; the refusal-duration REPORT | **FOLD.** It is the "broken book" gate the design rests on, and 3a's `spread_blown` arm is the same comparator. Two batches on one gate is the failure Kyle described. |
| **41** `B-XSTOCK-ENTRY-COMPARATOR` (`#996`, pre-sprint P1b) | CC-C | at ENTRY the book-state predicate runs only its two comparator-free arms, so the weaker gate guards the name we are about to take risk on | **FOLD.** It is exactly the entry half of "buy only on a plausible book". Langston's refusal to seed the comparator at entry (second writer) binds the fold. |
| **64** `B-EXIT-TRIGGER-FILL-PARITY` (`#959`, pre-sprint stage 2, first) | CC-C | the fill comes from the same book, at the same moment, as the trigger | **xStock leg FOLDED (already ruled, 10-09);** the crypto leg stays in 64 |
| **189** "refuse a position larger than the visible book" (roadmap 25-11a) | CC-A | one line, no scope | **FOLD the xStock leg** (the depth-for-size test is the same check); the crypto leg stays, OR the whole row folds if Langston prefers one implementation for both classes. ⚠️ CC-A's row; needs CC-A's consent. |
| **D3 of `PRICING_DECISIONS_2026-09-11.md`** (xStock 20-level book, `#949`, absorbed into `3n` r5) | CC-C | subscribe the xStock `book` channel for held and queued xStocks | ⛔ **NEVER BUILT.** Measured at the ref: `equity-spot-archiver.ts:332-341` subscribes `ohlc` + `ticker` only. ⇒ **Today the xStock "depth" is the ticker's top-of-book size.** Decide in Step 1, on Kyle's quicker-of-two-close-options rule: top-of-book size may be enough at our ~$40 trade (Langston: `exit_price = exit_ticker_bid` on 82 of 82, so the walk has never left the top), or subscribe the book. Either way the decision lands here, not in a second batch. |
| — the trigger exists twice (`_vtsTriggerPrice` in `vts-runner.ts` and the engine's path) | CC-C | — | **FOLD** (Langston r6 (c)1): one shared module and a call-site fence |
| **65** `B-EXIT-TICKER-LEG-ADAPTER-SIDES` (`#952`, pre-sprint stage 2) | CC-C | the exit path sees both price sides | **PREREQUISITE, kept separate:** plumbing for every exit, both classes |
| **3a** `B-FEED-HEALTH-GRADE-ARM` · **3a1** `B-VENUE-QUIET-ALERTING` (+ `166a` folded) | CC-B | alerts for a genuine feed problem; no paging on an expected quiet market | **KEPT, no duplication:** this is Kyle's "alert on a real anomaly". The one thing they lacked (book-state refusals on a ticking symbol still page) is the item added to 3a1 on 10-09. |
| **8b** `B-STALE-BOOK-DEPTH-REFUSAL` (`#1085`, pre-sprint stage 2) | CC-C | depth-gate refusals caused by our own stale book cache | **PREREQUISITE, kept:** the depth test is only honest if the cache is fresh. It is about the crypto book (73% one symbol); confirm at Step 2 that no xStock leg exists. |
| **40** `B-XSTOCK-SESSION-FRESHNESS` (entry half in P1b) | CC-C | the xStock entry-age limit vs the exit standard (`#684`); `#393` paging outside the liquid window | **KEPT:** price AGE, not book realism. Adjacent, and its `#393` paging leg goes with 3a1. |
| **166b** `B-XSTOCK-WEEKEND-POSTURE` (`#531`) | CC-B | stop opening xStocks before the 48 h weekend closure | **KEPT, cross-referenced:** a RISK decision (an inoperative stop for 48 h), not simulation fidelity. Our pause covers the Sunday reopen; 166b covers the Friday close. They must not contradict each other. |
| **190 / 191** `B-VENUE-RESTING-EXITS` | CC-A | venue-side protective orders if our server dies (live) | **KEPT, bound:** it must follow this batch's live policy (a limit with a floor, never a market stop into a thin book). Named so it cannot drift. |
| **79** `B-TRADING-ENGINE-REMOVAL` (+157, 68) | CC-A / CC-C | the legacy engine, including the venue-side `stop-loss` with a 5% buffer that Langston found | **KEPT:** it is the home for that disposition. This batch states that the legacy path is NOT the live design. |
| **59** `B-ENTRY-LEVEL-RECHECK` (P1a) | CC-B | re-check a signal's levels against the current price before the fill | **KEPT:** levels against price, not book realism. No overlap. |
| **3** `B-VTS-MARK-SIDE`, **4c** shadow hold clock, **134** maker vs taker review | CC-C / CC-B | VTS sides; shadow hold during closure; exit geometry | **KEPT:** prerequisite, or a different question |

## The merged batch — proposed shape (one batch, keeping row 2's id so its history and alert stay attached)
**Name:** `B-XSTOCK-BID-TRIGGER-RELAND`, row 2, retitled *"xStock trades open and close only where a real trade could"*. **Pre-sprint, stage 2**, after rows 64 (crypto leg) and 65.
**Increments, in order:**
1. **Book plausibility** (was row 66 + 3a's `spread_blown`): the ring-independent bound, the spread arm, and the refusal-duration report. Applies to ENTRY as well (was row 41), without seeding the comparator at entry.
2. **Transactable side and size** (was 3b + row 64's xStock leg + row 189's xStock leg): stops and targets trigger on the bid and buys use the ask, from the same book at the same moment as the fill, with a size-for-book test (top-of-book size, or the subscribed book, decided at Step 1). One shared module for the engine and the VTS.
3. **The venue-transition pause** (4:14-4:35 pm and 8:14-8:35 pm ET; the Sunday 20:00 ET reopen covered; none on Friday 8:15 pm), via `getETParts`, with a retirement criterion.
4. **The VTS half** rides increments 2 and 3 through the shared module; the VTS 7-day max-hold stays.
**Plan edits on approval:** row 66 and row 41 are struck as FOLDED, pointing to row 2. Row 64 keeps its crypto leg only. Row 189 is folded or split per your ruling. §0a stages 2 and P1b are updated. The census table above goes into the scope.

## Ask (one gate)
Rule on the merge: (a) fold 66 and 41 into row 2; (b) row 189 — fold the whole row, or only its xStock leg; (c) top-of-book size vs subscribing the xStock book, now or left to Step 1; (d) anything in the census I have mis-classified.
