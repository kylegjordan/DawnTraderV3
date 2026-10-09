# B-XSTOCK-BID-TRIGGER-RELAND — the overnight xStock exit: what live mode would do, and the fastest honest paper copy of it (r1)

**For:** Langston and Coltrane, each independently. **Requested by Kyle, 2026-10-09**, who asked that both of you give your takes.
**Evidence:** `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_WINDOW_READ.md` (Langston APPROVED, numbers re-derived by him).

## Kyle's principle (2026-10-09, his words condensed; this is the test every option is graded on)
- Paper mode exists to learn what **live mode on Kraken** will do. **A paper xStock trade must close at the price, and at the time, that a real sell would have closed it, or as close to that as we can get.**
- *"If the mark just looks better because stuff is closing overnight, we don't use the mark. We stay on the bid."* He does not want paper trades closing overnight when, in reality, they would not close.
- If real positions get **stuck** overnight or for days, paper should show that too, so we learn which xStocks to avoid opening (he suspects thin volume, and wants order-book volume considered).
- **Build-time trade-off:** if two options are both close to reality, take the one that is quicker to build, even if the slower one is slightly more accurate.
- **Hard requirement:** no paper trade may close on the bad 4:15 pm / 8:15 pm ET handoff prices. Rows 64 (`B-EXIT-TRIGGER-FILL-PARITY`, *"exits fire on the price they would fill at"*) and 66 (`B-BOOK-STATE-RING-INDEPENDENT-BOUND`) are both pre-sprint and both CC-C's.

## A correction to the read's own wording, and it changes the question
The read labels the off-hours bid-only stops **FAKE**, meaning *"no trade printed at or below the stop."* **The bid itself is not fake. It is a real resting order, and a live market sell would fill against it.** For example, ALB at 00:15Z on 10-07 had bid 102 and ask 125 with a stop at 104.60, so a live market sell would have filled at about 102. ⇒ The question is not "is the bid real?" It is **"when the overnight book is that thin, what does LIVE mode send, and what fills?"** Paper must copy whatever live does, including when live is unable to close.

## What paper does today (at the code; CC-C to confirm line refs at Step 2)
- **Trigger:** the xStock stop/target trigger reads the **mark** (`8a-P4b` C1).
- **Fill:** the exit fill already **walks the order book's bid side** (`closed_trades.exit_fill_arm = walk`). The 00:15Z handoff closes on 10-07 and 10-08 filled at the bid: NWL stop 5.494 filled at 5.03, ARKK stop 90.20 filled at 85.62, INVH stop 26.07 filled at 25.66.
- ⇒ **The fill price is already realistic. What is not realistic is that a mark trigger decides when to sell, using a price no one can trade at.** The book-state guard refuses some of these (ALB and ABBV were held). Others go through, as above.

## The window's numbers, in one table (7 days, 327 episodes where the bid said "stop" and the mark did not)
| session | trade at/below stop within 90 s | bid only, quiet tape | no ticker data at all |
|---|---|---|---|
| cash hours | 24 of 33 | 9 | 0 |
| 4:15 pm handoff | 0 of 25 | 24 | 1 |
| 8:15 pm handoff | 0 of 34 | 34 | 0 |
| rest of overnight | 12 of 235 | 177 | 46 |
In cash hours the mark fired anyway in 31 of 33 cases, a median 78 s later. Bid versus mark recovered exactly **one** real stop the mark never fired (ROK, 10-07). **No ticker data at all** covers 11 symbols with zero snapshot rows in the window, while other symbols were writing normally.

## The candidate LIVE overnight policies (paper copies whichever is chosen)
| # | live overnight policy | what paper would do | build cost (CC-C's estimate, to be attacked) |
|---|---|---|---|
| **L1** | **Market sell on the bid, any hour.** | Trigger on the bid, fill by walking the bid. Realistic, and it books the stub-bid losses live would take. | Smallest: the trigger moves to the bid. Fill code exists. |
| **L2** | **Resting limit sell at the stop off-hours** (fills only if a buyer comes at or above the stop); market sell in cash hours. | Off-hours: fill only when the bid side holds **enough depth at or above the stop** for our size, otherwise the position stays open (it can be **stuck**). Cash: as L1. | Medium: a session switch plus a depth-at-price check. The depth data is the same book the fill walk already reads. |
| **L3** | **Hold off-hours, exit at the cash open.** | Off-hours triggers are recorded and not acted on; at 13:30Z the exit runs against the opening book. | Medium: needs an overnight gap-risk bound, which the risk envelope does not have today. |
| **L4** | Keep the **mark** trigger, fill on the bid (today). | As now. | None. ⛔ **Fails Kyle's principle**: no live order can be priced at the mark. |

★ **CC-C's lean: L2.** It is what a careful real trader does in a thin session, it uses the order-book depth Kyle asked about, and it lets "stuck" happen honestly in paper so we can learn which names to avoid. L1 is the fastest and also honest, but it means live mode deliberately sells into 10-20% spreads at the handoffs. ⚠️ **Under L2, the 11 no-ticker-data symbols are a live question in their own right:** do they have a book overnight at all? If not, L2 correctly reports them as stuck.

## What I am asking each of you (one gate: the design, not code)
1. **Which live overnight policy (L1-L4, or one we missed) is right for a small account trading xStocks on Kraken?** Industry practice for thin extended-hours sessions is welcome.
2. **Is the paper copy of your chosen policy faithful?** In particular, is "enough bid depth at or above the stop for our size" the right fill test for a resting limit, given that paper cannot see queue position?
3. **Rows 64 and 66:** does your choice change either one's scope? Row 64 is "exits fire on the price they would fill at"; row 66 is the plausibility bound behind the 4:15 pm protection.
4. **Fastest-honest check:** name any option that is nearly as faithful and clearly quicker to build.

---

## r2 — THE TWO ANSWERS (2026-10-09 06:45Z Coltrane, 06:47Z Langston) AND THE COLLAR MEASUREMENT

**They converge on one design, which neither L1 nor L2 was.** Langston calls it **L5**; Coltrane calls it a **triggered fill-or-kill limit sell with a floor F**:
- a valid **bid** stop event **latches an exit intent** (a later recovery above the stop does not erase it — Coltrane);
- the exit is a **taker** limit sell with floor `F = stop × (1 − k)`; it fills only if the bid side holds depth at or above F **for the whole size** (FOK); otherwise no fill, the position stays open and retries on the next tick under the same rules in paper and live;
- paper fills at the size-walked price the fill code already computes. Because we are a taker, **queue position does not arise**. Both reviewers rejected L2 as written (a resting maker limit), on fidelity (paper would fill early and often, the favourable bias) and on risk (it holds through a gap with no loss bound).
- **No session switch** (Langston); the refusal reason is recorded distinctly (`collar_refused` vs `book_state_refused`).
- **Row 66 becomes a hard PREDECESSOR** — the bid trigger must not ship without the collar and row 66 already live (Langston). **Row 64:** this batch IS its xStock leg — declare it so, or strike row 64's xStock leg.
- Coltrane's corrections, accepted: a mark trigger is implementable in live (a trigger price need not be an execution price), so L4 is rejected on Kyle's principle, not as unimplementable; an observed top bid of 102 does not prove the whole size would fill there.

**Langston's condition — size k from the data. MEASURED (`xstock-bid-only-stop-episodes.py --gaps`, same frozen corpus):** per episode, the top bid's distance below the stop, as a percentage.

| session | class | episodes | closest approach: min / p10 / p50 | first frame: p50 / p90 / max |
|---|---|---|---|---|
| cash | REAL | 24 | 0.000 / 0.001 / 0.007 | 0.020 / 0.077 / 0.147 |
| cash | FAKE | 9 | 0.002 / 0.002 / 0.010 | 0.015 / 0.034 / 0.077 |
| 4:15 pm | FAKE | 22 | 0.013 / 0.046 / 0.621 | 1.207 / 3.912 / 5.661 |
| 4:15 pm | no print | 3 | 2.125 / 2.125 / 4.684 | 4.684 / 4.684 / 5.727 |
| 8:15 pm | FAKE | 7 | 0.015 / 0.015 / 0.622 | 0.622 / 1.187 / 3.043 |
| 8:15 pm | no print | 27 | 0.015 / 0.036 / 1.062 | 1.569 / 9.713 / 15.992 |
| off | REAL | 12 | 0.003 / 0.004 / 0.008 | 0.014 / 0.072 / 0.180 |
| off | FAKE | 111 | 0.000 / 0.004 / 0.054 | 0.054 / 4.201 / 5.056 |
| off | no print | 112 | 0.004 / 0.046 / 0.199 | 0.291 / 4.974 / 5.056 |

⇒ **A collar CANNOT be sized to refuse all 59 handoff episodes.** Their closest approach goes down to 0.013%. Refusing them all needs k below that, and that k would also refuse about half the REAL cash stops (closest-approach median 0.007%). ⇒ **What the collar CAN do is bound the damage.** Every REAL stop in the window had its first frame within **0.18%** of the stop, while the stub fills that hurt sat **1-16%** below it (NWL 8.4%, ARKK 5.1%, INVH 1.57%). **A collar of a few tenths of a percent admits every real stop observed and refuses every one of those three handoff closes.** Under that collar, a handoff episode whose bid is a hair below the stop fills at a hair below the stop. That is a real trade against a resting order, at about the stop price, so it is not "a bad price".
⇒ **So the guarantee needs restating, and that is Kyle's call:** *"no paper xStock exit fills more than k below its stop, and none fills off an implausible book (row 66)"* — not *"nothing closes at the handoffs."*
- Top-of-book only: a size walk fills at or below these numbers, so FOK on depth is stricter still.
- **Book-state guard over these episodes:** an XS_FRAME line is emitted only on a tick that has already cleared the book-state guard (the method of `…3A_BLIND_TIME_INTERIM.md`, approved by Langston). So the guard passed **every** frame in these 327 episodes. Today's guard does not protect against them, which supports making row 66 a predecessor. ⚠️ The window spans three builds (deploy A 10-02, deploy B 10-06, `0c8ef5da2` 10-07). Staging has been on `0c8ef5da2` since 2026-10-07 15:56Z, and none of these builds carries row 66.

**Owed before Step 1 closes (Langston), §9.4 disposition 1, folded in:** (a) the five-way disposition of `trading-engine.ts` `placeStopAndTargetOrders` (a venue-side Kraken `stop-loss` with the stop pushed 5% further away, behind the Phase-21 gate). Two signs it is legacy are its 9-strategy union and its retired risk-based sizing. "Likely legacy" is not a disposition. (b) A `validate=true` `stop-loss` on an xStock pair, and FOK acceptance on the xStock route (Coltrane). (c) A Kraken book snapshot on the 11 no-ticker-data pairs, as a positive control before anything calls them untradeable.
