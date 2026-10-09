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

---

## r3 — LANGSTON'S RULING ON THE COLLAR (2026-10-09 06:59Z, re-derived by him; supersedes r2's collar sizing)

**Q2 NO — r2 sized k on the wrong population.** The episode set is `bidWouldFire=stop AND markExit=n`, but the collar acts on **every** xStock stop exit. On the 82 `stop_hit` closes in the same 7 days: 29 filled at or above the stop · 28 within 0.18% below · 3 at 0.18-0.30% · 6 at 0.30-1.0% · **16 more than 1% below** (worst DLR 10.402%, 20:15:07Z). A k of 0.30% refuses 22 of 82, **including three cash-hours gap-throughs on healthy two-sided books** (STZ 0.400% with spread 0.280%; MSTR 1.327% with spread 0.074%; TER 2.084% with spread 0.316%). On those, the mark itself was already through the stop. ⇒ r2's line *"a collar of a few tenths admits every real stop observed"* is **withdrawn**. Also: `exit_price = exit_ticker_bid` on 82 of 82, so the size walk has never left top of book at our size, and the FOK depth test is **unexercised** (`#661` leg 3).

**THE DESIGN, REDIRECTED (Langston; consistent with Coltrane's "separate stop trigger S from acceptable execution F"):**
1. **The stop triggers on the bid, unconditionally** (row 64's xStock leg; Kyle's fidelity test).
2. **The gate is book PLAUSIBILITY, not distance below the stop. That is row 66's mechanism.** Of the 16 closes that slipped more than 1%, **12 had a spread above 1% (median 7.46%, max 20.2%) and 4 did not (min 0.074%)**. A spread-relative gate refuses the 12 stubs and admits the 4 genuine gap-throughs. A distance collar refuses all 16. It is the same comparator the live book-state guard already computes.
3. **Any collar shrinks to a loose catastrophe backstop**, set well above any observed cash gap and **denominated in stop distance, not price percent**. Stop distance ran from p10 0.059% to p90 3.341% (n=91), so a flat percent means wildly different risk on wide and tight stops.
4. **A latched-but-refused exit needs a TERMINAL PATH with a loss bound.** Without one, the design repeats L2's defect. Evidence of the cost: 12 of 295 open xStock VTS positions have printed through their stop and are still open, one of them (STX) for 695 minutes. **The bound is a risk-envelope setting, so it is Kyle's to set, at Step 1.**
5. **Error directions are asymmetric, and the harmful one is silent:** too loose books a fill below the stop and records it; too tight holds through a real move and announces nothing. ⇒ refusals must be counted and alerted on duration (row 66's duration item already covers this).

**Folded into increment 3's Step 1 (§9.4 disposition 1):** size on all stop exits · name the refused-latch terminal path · state the depth test as unexercised · denominate any backstop in stop distance. Plus r2's owed items (a)-(c).
**Sequencing:** row 66 lands FIRST; increment 3 is row 64's xStock leg.

MISTAKE: wrong-object [B-XSTOCK-BID-TRIGGER-RELAND] — collar k sized on bid-only stop episodes; the collar acts on all stop exits, where k=0.30% refuses 22 of 82 including healthy-book gap-throughs.

---

## r4 — KYLE'S DIRECTION (2026-10-09 ~07:45Z), recorded for increment 3's Step 1
**His words, condensed:** paper keeps trading xStocks around the clock, **both entries and exits, stops and targets**, whenever what we have built says it is realistically possible: the order book has the volume for our size and the bid (or, for a buy, the ask) is real. **Live mode will then show how realistic that simulation was.** He does not want overnight trading switched off for today's thin volume, because 24/7 trading is likely to grow. **For the 4:15 pm and 8:15 pm ET handoffs: a short no-xStock-trading window, about 10 minutes at each,** as the simplest protection. He asked to have holes poked in this.

**How it maps onto the converged design (r3):** it is the same design with no session switch, plus two additions.
1. **Entries get the same test as exits, on the other side of the book.** A buy is honest only if the ask is real and holds depth for our size. ⚠️ **One hole, and it is about EV, not fidelity:** an overnight entry into a 5-10% spread loses that spread at once (buy at the ask, value at the mark, sell at the bid). The EV gate must price the ACTUAL spread at the moment of entry, or overnight entries are a modelled loss. Step 2 checks what the friction model uses for xStock spread today.
2. **The handoff blackout, as a cheap belt beside row 66's plausibility gate, not instead of it.** Two cautions from the data: (a) **the length.** This window's bid-only stop episodes at the 4:15 pm handoff ran a median 89 s and p90 799 s (~13 min), so 10 minutes misses the tail. More importantly, a broken book can outlast any window: HUT stayed implausible for 17.8 h after 4:15 pm on 10-06. So the blackout catches the spike, and row 66 catches the aftermath. (b) **It must be ET-aware.** 4:15 pm ET is 20:15Z now and becomes 21:15Z when US clocks change on 2026-11-01. A UTC-hardcoded window would sit an hour off for five months of the year (Coltrane raised the same point).
- **Targets are naturally honest on the bid:** a target fires only when a real buyer is at or above it. The 108 frames where the MARK said "target" while the bid sat below the stop are exactly what a bid trigger would NOT fire.
- **Refused exits:** Kyle's "exit when realistically possible" reads as **no forced sale into a broken book**. The protection is the duration alarm (row 66) and the measured cost (HUT: $0.09 a share over 17.8 h, about 4 cents on the whole ~0.44-share position; corrected in r6). Kyle's call to confirm.

---

## r5 — KYLE'S ANSWERS (2026-10-09 ~07:55Z); Langston and CC-C to iterate to consensus and go
1. **No forced exit and no time limit.** Paper trades only where a real trade could happen; if live could not sell, paper does not sell, however long that lasts. *"I want this to work as close to how it will work when we go live."*
2. **No overnight alert flood.** Thin overnight books are EXPECTED. A position held because the book cannot fill it must not page the crew or Langston's queue. ⇒ **Row 66's duration item changes shape: record how long each refusal lasts (on the trade or in a report), and ALERT only on something unexpected** (for example, a broken book in cash hours, or our own feed impaired — the `#994` split). Kyle: *"it should basically only trade when there's certainty that it could be done in reality."*
3. **The handoff pause: whatever length protects us** (*"if it's 20 minutes, if it's 30 minutes"*). CC-C and Langston size it from the data, in Eastern time.
4. **The VTS gets the same overnight behaviour for xStocks:** a VTS xStock trade opens and closes only where the book could really fill it. It does NOT gain the SQE or the other paper gates; only the fill and exit realism carries over.
⇒ **Increment 3's Step 1 scope carries all four.** The VTS half joins the xStock VTS clamp that `8a-P4c` holds today.

**r5 data — sizing the pause** (`scripts/analysis/xstock-handoff-spread-minutes.py`, frozen corpus; share of XS_FRAME frames with spread > 1%, per minute, pooled over the window's weekdays):
- **4:15 pm ET (20:15Z):** 0.0% every minute 19:51-20:13 → **53.0% at 20:15**, 45% at 20:19, 35-39% to 20:31, then it settles to a new after-hours level of **~24-28%** from about 20:35 onward. **It never returns to the daytime 0%.** After-hours is a different book, not a spike that passes.
- **8:15 pm ET (00:15Z):** about 21-28% before → **54.4% at 00:16**, ~45% to 00:22, back to the earlier level by **~00:34**, then down to 7-18% after 00:36.
⇒ **The transition spike lasts about 20 minutes at both handoffs. CC-C proposes a pause of 4:14-4:35 pm and 8:14-8:35 pm ET** (about a minute of margin at each end). After the pause the per-trade book check governs, because the after-hours level itself is permanent, so no fixed window could cover it.

---

## r6 — CONSENSUS (Langston 2026-10-09 08:06Z, re-derived by him; CC-C agrees on every point). Kyle: *"you guys decide … iterate to consensus … and let's go with it."*
**(a) Row 66's duration item keeps its shape:** it was always REPORT, never alert. Record each refusal's duration on the trade and in a report, with its cost beside it. **The bound half is STRUCK** by Kyle's answer (1). ⛔ **What has to change is the ONSET paging, and it belongs to row 3a1 (CC-B):** `isQuietMarketReason` (`venue-quiet-alerting.ts:43`) covers only FEED staleness, so a book-state refusal on a symbol that is ticking fine (a thin overnight book) still pages (e.g. `c78e4dec` GLW, `f7238f9a` STZ). Increment 3's refusals would land in that same bucket. ⇒ **§9.4 disposition 2: an item on row 3a1, named as a dependency of increment 3.** The "unexpected" arms are positive predicates: (i) a book implausible INSIDE the US regular session; (ii) our own feed impaired (the `#994` split).
**(b) The pause, as agreed:**
- **Length:** ~20 min (4:14-4:35 pm and 8:14-8:35 pm ET). **Basis:** the spread data SIZES it but does not prove it is needed, because a per-frame plausibility gate does not care about the rate. The candidate mechanism is the seed/latch residual at a rollover (a hollow book at seed time makes later hollow frames read two-sided), which is NOT established. ⇒ If Step 2 cannot establish a mechanism, ship it as **an acknowledged belt with a retirement criterion**.
- **The venue's real transitions, not every weekday:** closed Fri 20:00 ET → Sun 20:00 ET (`market-hours.ts:81-87`). So there is no Friday 8:15 pm pause, and **the Sunday 20:00 ET weekly reopen IS covered** (the largest rollover; this window's corpus pooled weekdays and could not see it).
- **ET-aware by reuse:** `getETParts` (`market-hours.ts:53`, DST-aware). No fifth Eastern-time reader.
- **Holidays: not built** (`market-hours.ts:26-29`, Kyle's parked `#392`). Forward check: does Kraken's 16:15 rollover move on a US half-day? First candidate 2026-11-27.
- **Semantics:** the pause suppresses the DECISION (no trigger, no entry) and does **not** drop the increment-2 latch; events inside it evaluate at resume. It is recorded as **a deliberate fidelity deviation** (paper declining a trade live could make), with its cost measured from the ~59 handoff episodes a week it covers.
**(c) The VTS half:**
1. **One shared module** for the bid trigger, the floor and the latch, used by both the engine and `vts-runner.ts` (today the trigger exists twice: `_vtsTriggerPrice` and the engine's own path), on the `8a-P4c` P2 precedent, with a call-site-count fence.
2. **The VTS 7-day max-hold STAYS** (`max_hold_switch` `enabled_vts=true`, `b73_max_hold_ms` 7 days; it manages the VTS learning corpus and is not a paper gate). The paper lane already has no time limit (`enabled_paper=false`; `active-execution-engine.ts:3020`), so Kyle's answer (1) needs no code. **§9.4 disposition 5 for that leg.** Increment 3 will RAISE the `timeout_unpriced` rate, and reorg-B5 must exclude those trades, not `?? 0` them.
3. **Which increment:** the VTS half goes in **3b** (trigger to the bid), NOT 3a (`spread_blown` ON, held by Kyle until row 66 lands).
**Before increment 3's window opens:** close the deploy drift. Staging is on `0c8ef5da2` (10-07), so the corpus and the Step-7 verification would be on different builds.
