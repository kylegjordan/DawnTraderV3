# BRIEF FOR THE CODEX REVIEWER — DawnTrader pricing architecture

> **⛔ THIS IS THE BRIEF, NOT THE DOCUMENT UNDER REVIEW.** The document under review is
> **`1-system-manual/PRICING_DATA_ARCHITECTURE.md`**. This file tells you what it is, what we
> want from you, and what we are asking you to do with it.
>
> **STATUS: COMPLETE and ready to dispatch.** *(A "what to distrust" section was drafted and then
> REMOVED on the owner's instruction — pointing the reviewer at our own suspected weak points
> would steer his search toward what we already doubt. The general evidence standards survive in
> §3; the specific pointers are deliberately absent.)*

---

## 1. WHAT YOU ARE LOOKING AT

**`1-system-manual/PRICING_DATA_ARCHITECTURE.md`** is a governance document describing **every source of price data in an automated trading system, what each is used for, and what we think should change.**

It is being written because we kept fixing pieces of the pricing path one at a time, and repeatedly went back and undid earlier fixes — because **nobody had ever written down the whole path in one place.** Its own opening records the owner's framing: *"we're not getting to a final design state that is the best possible setup for our system."*

**It is intended to become canonical** — a tier-governed document, updated whenever the pricing design changes. **That is why its accuracy matters more than its completeness.**

### THE SYSTEM, IN ONE PARAGRAPH
It trades cryptocurrency spot pairs and tokenized equities ("xStocks") on Kraken, fully automatically. It runs three lanes: **VTS** (a wide telemetry-only simulation), **paper** (a realistic simulation with venue-vetted internal fills), and **live** (real orders, not yet enabled). A scanner sweeps the tradeable universe, a filter chain and a market-context engine admit candidates, a signal orchestrator sets entry, stop and target levels, and an execution engine evaluates exits every cycle.

---

## 2. THE OBJECTIVE WE ARE ASKING YOU TO SERVE

> ⭐ **Find the best way for this system to function so that it trades as profitably as possible, and as fast as possible, within the risk limits its owner has set.**

**The risk limits are hard boundaries, not dials.** If growth and risk tolerance conflict, risk tolerance wins. Do not recommend anything that loosens a risk control to improve returns.

**Two things follow from that objective and should shape every recommendation you make:**
1. **Signals must be generated from the best available price data.**
2. **Simulated entries and exits — stops and targets alike — must use whichever price most realistically reproduces what live trading would actually do.** A simulation that flatters us is worse than useless, because we size real capital from it.

---

## 3. ⛔ WHAT WE NEED YOU TO DO — VERIFY, DO NOT ACCEPT

**The document makes factual claims about where every price currently comes from. We want those claims checked against the code, not taken on trust.**

**You have the repository. Use it.** Where the document cites a file and line, open it. Where it states a census ("N call sites", "nothing reads this"), re-run the search yourself and satisfy yourself the search could have found a counterexample. **Where it asserts an absence, ask what the instrument's reach was.**

⚠️ **We are telling you this because the authors have a measured track record of getting MECHANISM claims wrong while their MEASUREMENTS hold up.** ⛔ **We are deliberately NOT listing which claims we suspect.** The owner's reasoning, and we think he is right: naming them would steer your search, and a search steered by our own doubts can only find what we already doubt. **Check what the code tells you, not what we flag.**

**Two standards we hold ourselves to and ask you to apply:**
- **An asserted absence needs presence-evidence.** Before accepting "nothing does X", satisfy yourself the search could have found an X.
- ⛔ **A zero with more than one sufficient cause is not evidence for any one of them.** If a thing never happens and there are three independent reasons it could never happen, the observation discriminates between none of them — cite the mechanism, not the zero.

**Three asks, in order:**

**(a) CONFIRM OR CORRECT THE CURRENT STATE.** Is the document's description of where prices come from today accurate? Name anything it gets wrong, anything it misses, and anything it asserts more confidently than its evidence supports.

**(b) GIVE YOUR OWN VIEW OF THE BEST POSSIBLE STATE.** Which feed should serve which job — setting levels, ranking candidates, triggering a stop or target, simulating a fill, marking an open position, recording a result, sizing — and **why, in terms of what makes that data trustworthy for that specific job.** We want the reasoning, not the verdict; a recommendation we cannot re-derive is one we cannot maintain.

**(c) TELL US WHERE YOU DISAGREE WITH US.** The document carries proposals from two reviewers. **Where you think we are wrong, say so plainly and say what you would do instead.** A review that only confirms is a review we wasted.

---

## 4. CONTEXT THAT WILL SAVE YOU TIME

- **Kraken publishes no barrier to broad subscription.** Its FAQ states all-pairs streaming is possible on one connection; the book channel states no symbol limit. **The binding constraint is our own message processing, not a venue cap.**
- **The order book is never persisted.** It exists in memory only, only while the process runs. Any comparison against it has to be taken live.
- **Asset class matters everywhere.** Several claims are true for crypto and false for xStocks, or the reverse. **Treat any unqualified statement about "the candles" or "the ticker" as suspect until you have checked both classes.**
- **Trading lane matters too** — VTS, paper and live do not all read the same things.

---

## 5. HOW TO RETURN YOUR REVIEW

Address each of the three asks in §3 separately. **For every factual correction, cite the file and line you checked** so we can re-derive it. Where you are uncertain, say so — **an explicit "I could not establish this" is more useful to us than a confident guess**, and that standard applies to us as much as to you.
