# Pricing Decisions — for consensus between CC-C, Langston and Coltrane

**Kyle, 2026-09-11:** these decisions are not his. CC-C, Langston and Coltrane iterate to consensus on the open pricing decisions, do only what is needed to settle them, then implement. No new batches or sub-batches. Move quickly.

**The test for every decision (Kyle, 2026-09-03):** fidelity to live trading, not better-looking results.

**How to respond.** For each numbered decision, give one of:
- **AGREE**
- **CHANGE** — your replacement wording, and the reason
- **NEEDS DATA** — the single measurement, and the rule that decides the question once it is in

"Look at it later" is not an answer this round. If you cannot agree, say what you would decide instead. CC-C reconciles, with a maximum of three rounds. The consensus table at the end is the record.

**Sources:**
- Coltrane's design report: `Claude Comms and Packages/Codex Audits/grouped-design-2026-09-11/REPORT.md`
- the grouped list: `Scope Files/CODEX_FINDINGS_BY_GROUP.md`
- the level-basis rule: `Scope Files/B_PRICE_SIDE_BY_JOB_LEVEL_CENSUS.md`

---

## Measured today — the one missing fact

**Does Kraken production accept a ticker that updates on every best-bid/offer change?** (`#1017`)

The ledger said this could only be settled by a live subscription, not by reading documentation. Probe: `scripts/analysis/bbo_trigger_ack_probe.mjs`, 2026-09-11 14:28Z, 15 s per arm, public endpoints only.

| arm | result |
|---|---|
| crypto `wss://ws.kraken.com/v2`, `event_trigger: bbo`, BTC/USD | ✅ **accepted** (`success: true`, echoed `event_trigger: bbo`); 289 updates |
| crypto, no `event_trigger` (control), ETH/USD | accepted; echoed `event_trigger: trades`, which confirms the default; 8 updates |
| xStock `wss://ws-equities.kraken.com`, `event_trigger: bbo`, AAPL/USD | ⛔ **rejected**: *"Unsupported field: 'event_trigger' for params type: 'ticker'"* |
| xStock, no `event_trigger` (control), MSFT/USD | accepted; 275 updates. The snapshot carried no timestamp field |

⚠️ The update counts are different symbols over one 15-second window. They show that each arm was live, not that one trigger rate is higher than the other.

---

## D1. Exit side for long positions — sells are decided and filled on the bid

**Proposed.** Split by order type, which answers Coltrane's order-type qualifier:
- **Taker exit (market sell):**
  - It triggers when the current valid bid is at or below the level.
  - It fills by walking the bid side of the book for our quantity, or at the touch bid where there is no book.
- **Maker exit (resting limit sell):**
  - It fills only when the bid reaches the limit, or when a trade prints at or through it.
  - The midpoint reaching the limit is not a fill.
- These are our engine's own triggers, in paper and in live, not Kraken native stop orders. The reference price is ours to set.

**Why:**
- The level-basis rule (ruled 2026-09-04) requires a transactable price.
- AU3 Stage B: a taker liquidation is most faithful on the current bid and depth.
- `XSTOCK_PRICING_PLAN.md` P2: a resting sell needs a buyer.
- Since the order-book fix of 22 August, 24 of 24 stop-outs filled below their stop (median 0.166%), because the decision read the midpoint while the sell filled at the bid.

**Data needed:** none. This is a fidelity decision. F-G-2's shadow window was measuring how big the change is, not which side is correct (see D10).

## D2. Entry side and maker fills — the mirror of D1

**Proposed:**
- **Taker entries** fill by walking the ask for our quantity.
- **Maker fills in either direction** need the opposite side to reach the limit (ask at or below a buy limit; bid at or above a sell limit), or a trade printed through it. A midpoint touch is not a fill.
- Otherwise the existing full-fill-at-limit baseline stays (see D8).

**Why:** active-paper taker fills already walk the book (AU3 §3). Coltrane Group 3: a midpoint reaching a maker limit, with no trade or quote evidence, must not count as a fill.

**Data needed:** none.

## D3. Ticker or order book — chosen by job, not either/or

**Proposed:**
- **Touch price (best bid/ask)** for triggers, spread checks and marks:
  - Use the order book's top where a valid book exists — checksum passed, in sync, and fresh.
  - Otherwise use the ticker's best bid/ask, with its age.
  - Both are the venue's best quote, so the choice is made on validity and age, not on a comparison study.
- **Crypto:** the ticker moves to Kraken's best-bid/offer trigger, which production accepted today.
- **xStock:**
  - Kraken rejected that field today, so keep the default ticker (it was live today: 275 updates on MSFT/USD).
  - Subscribe the xStock 20-level book for held and queued xStocks (`#949`), so that xStock exits and size estimates use depth.
- **Fill estimate for our size:** walk the book's depth. Use the ticker's touch size only where there is no book.

**Data needed:** the one missing fact was measured today (above).
- The ticker-versus-book comparison is **not** needed to make this decision. It only matters for trusting the ticker where no book exists, and D3 already uses the book wherever one exists.
- Keep the comparison as a check after landing: on the same symbol, a book top and a best-bid/offer ticker top that disagree beyond tolerance raise a feed-fault alert. It is not a gate.

## D4. Where the midpoint stays

**Proposed:**
- The midpoint is used only for value estimates: indicators, regime inputs, ranking features, and spread denominators.
- It is never a level, a trigger, a fill or a booked result.
- The crypto quant lane's entry, stop and target anchor on the ask (for entry), with its age. The smoothed series stays as a detection feature only.

**Why:** this is the level-basis rule ruled on 2026-09-04. Coltrane accepts the corrected rule.

**Data needed:** none.

## D5. Booking results

**Proposed:**
- **Active paper** books the simulated fill, unchanged.
- **VTS crypto exits** move from the observed mark to the D1 rule in the same landing, so VTS's calibration era changes once, not twice.
- **VTS xStock stop and target clamps stay**, until the `#943` bad-print guard covers the exit path.

**Data needed:** none.

## D6. How fresh a price must be, and which clock

**Proposed:**
- **Exits:** keep the risk-derived ceiling (Kyle, 2026-09-03). A stale price holds the exit rather than acting on it.
- **Entries:** keep the flat 15 s limit. Refusing an entry only costs an opportunity.
- **Age** is decision time minus the venue's timestamp where the message carries one, as the crypto ticker does. Otherwise it is decision time minus receipt time, flagged as "source age unknown" — the xStock ticker snapshot carried no timestamp today.
- **A re-served cached price** keeps its original age (`#951`, shipped).

**Data needed:** none.

## D7. Price caches and refresh timing

**Proposed:**
- **Keep both caches.** Do not merge them just to match the original diagram.
- **Open positions get enrolled in the 2-second refresh lane.** The design specified that line; it was never written (`#977`).
- **Queued and held symbols carry their own subscription reasons**, so the active lane never depends on VTS's 60-second schedule.
- **Put the rate limiter on the direct REST call path**, then stop re-served prices from triggering actions (3b.f-b, `#971`).
- **Store the true last trade separately**, and never overwrite it with the midpoint (`#952`).
- **The smoothed estimator advances once per new observation**, not once per repeated read of the same cached price, and its state survives or explicitly re-warms after a restart (PR-A6, SIM S26).

**Data needed:** none.

## D8. Do simulated exits always complete in full?

**Proposed:**
- **Keep full completion** — the ratified choice (P19-B4b.1).
- **Record walked versus extrapolated quantity** on every close path (walk, cold book, missing config). A missing config is recorded as an invalid estimate, not as zero slippage.
- **Revisit at live readiness (Phase 21)**, when real partial fills exist.

**Data needed:** none.

## D9. Pairs not quoted in US dollars

**Proposed:**
- Refuse admission, with a specific reason, for any pair not quoted in USD until a timestamped currency conversion exists.
- Positions already open stay monitored. (`#966`, broader than BTC quotes.)

**Data needed:** none.

## D10. The three observation windows that would otherwise block this landing

**Proposed:**
- **F-G-2** (VOID since 2026-09-05): retire it as a gate. D1 is decided on fidelity grounds, and its recorded counts become the before-record.
- **`#951`** (price age): close it at landing on the evidence already measured (975 re-served prices). The landing changes that path.
- **`#943`** (xStock 00:15): close it at landing, with the data to date as the before-cohort.

**Data needed:** none. This is a ruling on window rules — Langston's.

---

## Other items Coltrane left open

| item | proposed |
|---|---|
| **$0.25 minimum price** (`#967`) | **Keep** (Kyle, 2026-09-11). The `strong_trend` exception (`min_price 0.001`) stays. Revisit only if data argues for it |
| **DHMA** | Stays shelved. It has never traded, and fixing its units does not fix its geometry. Not in this landing |
| **Ranking objective** | Coltrane's proposal: the most net expected dollar profit per slot, under fixed-notional sizing, compared against holding cash. Build it after reachability |

---

## Implementation — one batch, not many

**One pricing batch**, through the normal workflow, with one rollback point. It uses the existing home **3n `B-PRICE-SIDE-BY-JOB`** and absorbs:
- 3c's exit switch (D1);
- 3b.d, the xStock book (D3);
- 3b.h-1, the crypto best-bid/offer trigger (D3);
- 3b.f-a, open-position enrolment (D7);
- 3b.f-b, the refusal plus the limiter (D7);
- `#952`, the true last-trade field (D7);
- `#966`, non-USD refusal (D9);
- VTS booking (D5);
- the close split field (D8).

Whether crypto and xStock deploy together or crypto first is decided at Step 2.

**Who implements (proposed):** CC-C implements, since it owns these rows. Coltrane checks each step against these decisions, and Langston does the code review. The alternative is that Coltrane implements a bounded part in his own repository, if you both prefer.

**Then:**
1. xStock fees — CC-B's `B-XSTOCK-FEE-CONTRACT` (2.4-FEE), its top item since 2026-09-06, including the startup check that refuses a negative fee.
2. The reachability batch — row 4 `F-5`, reachability ceilings per strategy.

---

## Consensus record

| # | CC-C | Langston | Coltrane | decided |
|---|---|---|---|---|
| D1 | AGREE (proposer) | | | |
| D2 | AGREE (proposer) | | | |
| D3 | AGREE (proposer) | | | |
| D4 | AGREE (proposer) | | | |
| D5 | AGREE (proposer) | | | |
| D6 | AGREE (proposer) | | | |
| D7 | AGREE (proposer) | | | |
| D8 | AGREE (proposer) | | | |
| D9 | AGREE (proposer) | | | |
| D10 | AGREE (proposer) | | | |
| floor / DHMA / ranking | AGREE (proposer) | | | |
| one batch, CC-C implements | AGREE (proposer) | | | |
