# PART F — RESTRUCTURED AROUND THE GOAL (Kyle, 2026-08-23)

> **"I want this set of batches to make it so that we can have absolute confidence in the outcomes of
> our paper mode trades — that they're entering and exiting at the right prices, and that that's what's
> being reported. So that we know exactly what the best simulated trade can be. Meaning a simulation
> as close to reality as possible. That is the purpose of the series of batches since we discovered
> the order book issue. So everything needs to be folded into these batches."**

## THE STRUCTURAL PROBLEM WITH THE PLAN AS IT STOOD

**It has been REACTIVE.** Every piece was added the moment I tripped over something: F3 when I found the
exit source discarded, F3.5 when Langston found the stale re-serve, the entry widening when Kyle said
the word "enter". **A list built that way is complete only by luck**, and tonight's record argues
against luck — five separate findings arrived after I had already called a section finished.

**The stated goal cannot be delivered by a list. It needs a CENSUS** — §9.5(a) applied to the whole
trade lifecycle rather than to one component. That is the difference between *"the defects I found"*
and *"every place a price can be wrong."*

## ⇒ NEW **F0 — THE TRADE-LIFECYCLE PRICE CENSUS**, and it goes FIRST

Every point in a paper trade's life where a price is read and either a DECISION or a RECORD depends
on it. For each: **which producer · book-derived? · contaminated pre-fix? · recorded anywhere? · does
a NON-TRADE class exist?**

| # | lifecycle point | site | status going in |
|---|---|---|---|
| 1 | signal geometry — entry/stop/target | `signal.entryPrice/stopPrice/targetPrice` (`aee:2583-2584`, `:3370-3371`) | **UNEXAMINED — upstream of the engine; the whole trade's shape rests on it** |
| 2 | **admission depth gate** | `_evaluateOpenDepthGate` (`aee:3051`) | **BOOK-DERIVED, and `!pass` BLOCKS THE OPEN → non-trade, no record** |
| 3 | **maker/taker routing** | `_b72cBestAsk = _gate.snapshot.asks[0]` (`aee:3094`) | **BOOK-DERIVED → diverts to taker or DROPS → non-trade, no record** |
| 4 | entry fill price — taker | `walkBook(asks)` via `order-placer.ts:72` | **CONTAMINATED pre-fix; 18 of 48 taker entries below printed low, 299.7 bps** |
| 5 | entry fill price — maker | `_b72cLimit = signal.entryPrice` | clean at the price; **routed by (3)** |
| 6 | maker entry fill DECISION | `_processPendingMaker(currentPrice)` (`aee:1252`) | **CACHE-DERIVED — same poisoned `currentPrice`** |
| 7 | position sizing | — | **UNEXAMINED** |
| 8 | exit evaluation (stop/target) | `currentPrice` (`aee:1150-1230`) | **CACHE-DERIVED — the `#741` path** |
| 9 | maker exit rest + fill decision | `evaluatePendingMaker` (`aee:1358`) | **CACHE-DERIVED — 37 phantom target-hits** |
| 10 | exit fill price — taker | `walkBook(bids)` | **CONTAMINATED pre-fix; the original `#507`** |
| 11 | P&L, fees, slippage | `closePosition` | **UNEXAMINED as a whole** — `total_cost` basis assumed, not proven |
| 12 | what is RECORDED vs what was USED | `createClosedTrade` | **F3's subject** |

**★ ROWS 1, 7 AND 11 ARE UNEXAMINED AND I AM NAMING THEM RATHER THAN LETTING THEM SURFACE LATER.**
Row 1 matters most: if the signal's own prices came from a contaminated feed, then the stop and target
were wrong from the start and **every trade's geometry is off** — not merely its fill prices.

## ★★ THE TWO NON-TRADE CLASSES — A PERMANENT LIMIT ON "ABSOLUTE CONFIDENCE"

Rows 2 and 3 can **prevent a trade from existing**. A blocked open and a dropped maker leave **no
`closed_trades` row, no open position, nothing.** So pre-fix, any trade the contaminated book stopped
us taking — or pushed us into taking — is invisible to every measurement taken tonight and to every
measurement possible in future.

⇒ **"absolute confidence" is achievable for the trades we HAVE. It is not achievable for the trades we
DIDN'T take.** That boundary is real, it is permanent, and it belongs in the plan explicitly rather
than being discovered by someone later. **Everything F0 finds after this can be fixed; this cannot.**

## SEQUENCE

**F0 census → F3 provenance stamp (both legs) → F3.5 staleness bound → F1+F2 detector + disposition
(both legs, taker arm) → F4 divergence instrument → F5 per-strategy reach → F6 reset.**

F0 first because **it is what makes the rest exhaustive instead of reactive**, and because rows 1, 7
and 11 may add pieces that do not exist in the plan yet. **The reset gate (F6) cannot honestly close
until F0 has been answered in full** — a gate that certifies "zero contaminated" over a population we
have not finished enumerating is the unstated-population failure, one level up.
