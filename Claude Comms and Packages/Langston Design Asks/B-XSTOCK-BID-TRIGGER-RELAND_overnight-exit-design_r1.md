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
