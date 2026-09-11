# Codex Findings — Grouped for Coltrane

**What this is.** Every finding from Coltrane's five Codex reports, plus the pricing work that was in progress when it was paused. Findings are grouped by the part of the system they affect, so each group can be designed and fixed as one piece.

**Status:** r3, 2026-09-11, by CC-C at Kyle's direction. Langston gave it a quick look at r2 and asked for four fixes, which this revision makes. The detailed register, `1-system-manual/CODEX_FINDINGS_REGISTER.md`, stays as backing detail for the pricing review; this list is the complete view.

**The reports** — all in the repository under `Claude Comms and Packages/Codex Audits/`:

| tag | report |
|---|---|
| **AU1** | audit 1, full system — `audit1-full-system/FULL_SYSTEM_AUDIT_2026-09-05.md` |
| **AU2** | audit 2, fees and forward design — `audit2-fee-viability/CODEX_AUDIT_2_REPORT.md` |
| **AU3** | audit 3, what is stopping the system doing its job — `audit3/REPORT.md` (supporting files in the same folder) |
| **AS** | the independent "astra" audit — `astra-independent/REPORT.md` |
| **PR** | the pricing architecture review — `pricing-architecture-review/REPORT.md` |
| **Q** | the two question lists — `audit1-full-system/BLIND_SPOT_DELTA_audit1.md` and `astra-independent/BLIND_SPOT_DELTA_astra.md` (see the Appendix) |

**Other tags:**
- **REG** — a point from our findings register (Langston's or CC-C's re-check), not from the report itself.
- **ours** — our own issue ledger or plan.

Where a finding is already in our records, the issue number or plan row is given, so it is not rediscovered.

---

## How this experiment will run (Kyle, 2026-09-11)

This deliberately sits outside our normal batch workflow. **Nothing here is committed to — we want to see what Coltrane can do.**

1. **Coltrane reviews this list.** For each group: does it need fixing, or another look? What is missing?
2. **Coltrane writes a short design report, one section per group.** For each finding: what he believes the fix is, and how he would make it. Keep it high level — a scope per group, not our formal scope documents.
3. **A provenance read comes before every proposed fix.** Before proposing a change to anything, find out what it was built to do and why.
   - Sources: git history (`git log -S "<symbol>" --reverse`), `1-system-manual/RUNNING_ISSUES.md`, `1-system-manual/BATCH_CATALOG.md`, the batch completion reports, and `bridge/canonical/` for original intent.
   - Then say which it is:
     1. still right;
     2. right, but needs updating to today's intent;
     3. disconnected, and should be reconnected;
     4. connected, and should be removed;
     5. dead, and should stay dead or be deleted.
4. **We review the design report** and ask questions.
5. **Coltrane attempts the fixes in his own repository.**
   - Each group lands as its own unit.
   - Langston reviews it, and it is tested and verified.
   - It carries its own rollback point before anything reaches the review branch or staging.

**Boundaries every design keeps:**
- **Risk limits never loosen:** position size, exposure, daily loss, the kill switch.
- **The system stays long-only.**
- **No silent default** for a missing input.
- **Database-governed settings stay database-governed.**
- **Bar intervals stay put:** xStock signals on 15-minute bars, crypto on 60, unless a finding shows a reason to change.
- **One landing unit per group.** Each has its own commit, its own rollback, its own change-class and its own document set. A single rollback point for a change spanning pricing, fees, sizing, identity and risk is not a rollback point.
- **Open observation windows.** Three pricing batches sit in observation, or are waiting for a window to re-open: 3c `F-G-2`, 3b.f `#951` and 3b.b `#943`.
  - Nothing from this experiment deploys into an open window until that window's own split/void rule has been applied and the deploy record has been enumerated, with a positive control.
  - A change that moves the crypto level basis voids F-G-2's window outright; it does not split it (`Batch Completion/F_G_2_PROGRESS_REPORT.md`).
- **Work owned elsewhere.** Several groups overlap work that has a named owner and is in flight: 2.4-FEE and 2.4c (CC-B), 3b.b and 3c (CC-C). For each group, the design report says what Coltrane may touch and what stays with the owner.
- **Measurement gate.**
  - Every number names its object and its population.
  - Any zero or absence carries a positive control.
  - A mechanism is cited to the line, or labelled a hypothesis.

---

## Group 1 — Pricing: which price, from which feed, with which clock, for which job

### 1a. Our pricing work that was interrupted — part of this group's fix

Every item below was re-checked against its issue entry and plan row on 2026-09-11.

- **The level-basis rule — DECIDED on 4 September, partly built.**
  - **The rule:** a level's basis must be a price the market actually printed, carrying its age, or a price we could actually transact at. A midpoint is neither, because no trade happened there and nobody offered it. A smoothed midpoint is neither, and it also lags.
  - Because the rule admits prices the venue actually printed, bar closes pass. So only the crypto quant lane fails it: its basis is a smoothed midpoint. The crypto pattern lane (60-minute close) and xStock (1-minute closes, built into 15-minute bars) pass.
  - **Built:**
    - `server/core/calculations/level-basis.ts`, since extended with an implausible-spread check under `B-XSTOCK-FEED-SANITY`;
    - OBJ-3a, each leg expressed on the side that leg trades at (commit `884b9289e`).
  - **Held:** OBJ-3b, keeping the level basis and the trigger basis consistent. It waits for F-G-2's window to re-open.
  - **Not yet deployable:** changing the crypto quant lane's basis moves the crypto level basis, so it voids F-G-2's window (see Boundaries).
  - Each leg sits on its own side: entry on the ask, stop and target on the bid. AU3 puts the cost of that at (s0+s1)/2, which is one full spread only if the entry and exit spreads are equal.
  - ⚠️ **AU3 §3 caution:** the cost model already adds half a spread to entry, so moving entry to the ask would charge that friction twice unless the cost model changes with it.
  - Kyle's test for the rule is fidelity to live trading, not better-looking results.
  - *(ours: plan row 3n `B-PRICE-SIDE-BY-JOB`; rule and census in `Scope Files/B_PRICE_SIDE_BY_JOB_LEVEL_CENSUS.md`; cited as binding in `#927`)*
- **The crypto quant lane's smoothed price.**
  - It is an adaptive EMA with no noise model, kept per symbol in memory. It is not persisted and not evicted.
  - So after every restart it starts raw and jumps.
  - *(ours: System Impact Map row S26)*
- **Exit-side pricing.**
  - The exit decision reads the midpoint while a sell fills at the bid. Since the order-book fix of 22 August, 24 of 24 stop-outs filled below their stop (median 0.166%). Fills before that fix came from a different instrument and must not be pooled with these.
  - The crypto half, plus VTS cost booking, deployed on 2 September.
  - The shadow test of deciding exits on the bid was voided on 5 September. It re-opens after the level and reachability work.
  - The xStock legs wait on 3b.b and 3b.d.
  - *(ours: plan row 3c `F-G-2` `B-EXIT-TRANSACTABLE-SIDE`; `Batch Completion/F_G_2_PROGRESS_REPORT.md` §0)*
- **Exit trigger versus exit fill — withdrawn as a separate defect.**
  - The trigger reads the live midpoint. The fill reads the bid from the archive, which is sampled every 4 seconds.
  - The 14% average gap first reported came from five xStock trades in the 00:15 UTC minute. Outside that minute the gap is about 0.1%, and the fill equals the ticker bid.
  - It was folded into the 00:15 issue (next item) on 31 August.
  - *(ours: plan row 3b.c, `#959` amendments 1-2)*
- **The xStock 00:15 UTC bad print.**
  - On most days the xStock feed emits a bad price at 00:15 UTC, and the engine closes positions on it: 65 closes since 17 July, which is 27.1% of xStock stop-outs and 29.5% of target-hits. None on crypto.
  - The very wide overnight quotes around it are genuine thin markets, not a broken book: both sides widen evenly around the traded price.
  - It is in observation.
  - *(ours: plan row 3b.b `B-XSTOCK-FEED-SANITY`, `#943`)*
- **Last trade versus best bid/ask.**
  - Our ticker subscription uses Kraken's default trigger, which sends an update only when someone trades. On a quiet pair, the real quote can move with no update reaching us.
  - Kraken documents a trigger on every best-bid/offer change instead. Whether production accepts it has to be confirmed with a live subscription.
  - *(ours: plan row 3b.h-1 `B-TICKER-BBO-TRIGGER`, `#1017`, placed immediately before 3n)*
  - The feed's "last trade" field is overwritten with the midpoint, while two code comments call it a clean trade print. *(ours: `#952`)*
- **Ticker versus order book — the comparison is still owed.**
  - The first comparison (7 September) found the two agreeing exactly on 231 of 232 crypto evaluations. **It was withdrawn:** the "ticker" side read the shared price cache, which the book itself writes into, so in part it compared the book with itself.
  - The recorded fix is to tag each sample with the feed that wrote it, then re-run. That was added to 3n.
  - Langston's proposed test runs three arms on the same symbols at the same moments: the trade-triggered ticker, the best-bid/offer ticker and the book. Coltrane keeps the three arms but replaces the decision rule (see 1c).
  - *(ours: `1-system-manual/PRICING_DATA_ARCHITECTURE.md` §1.4. That document has been marked NOT CANONICAL since 8 September, because Coltrane's A1 overturned its §1.5.)*
- **The xStock order book.** The xStock feed offers a 20-level book, and we never subscribe to it. xStock fills use a single level built from the ticker. *(ours: plan row 3b.d, `#949`)*
- **Venue timestamp versus our receipt time.** Since 6 September the venue's own timestamp is parsed and carried beside our clock, so the gap between the two can be measured *(ours: commit `3f88e2e4a`, under 3n)*. Which clock each age check should use is still open.
- **Honest price age.**
  - When the rate limiter blocks a fresh request, a cached price is returned and stamped as a fresh venue read.
  - The fix that makes the true age recoverable shipped on 31 August. It is in observation, waiting for a close that went through the changed path. On REST-only crypto symbols, the re-served prices were a median 29 seconds old, and up to 59.
  - The follow-up, which stops such a price triggering an action, is gated on the two-cache question: the original design specified one rate-governed price cache, we have two, and nothing records why.
  - *(ours: plan rows 3b.f `#951`, 3b.f-b, 3b.l `#971`; `Batch Completion/B_PRICE_AGE_TRUTH_COMPLETION_REPORT.md`)*
- **Refresh cadence.**
  - The price cache has a 2-second refresh lane for open positions. The design specified the line that enrols a position in it, but that line was never written, so the lane is empty. This is a defect; its cost is not measured.
  - Separately, for symbols only VTS subscribed to, the active lane reads prices refreshed on VTS's 60-second schedule. That is how it was built, but nobody decided it, so it is Kyle's decision.
  - *(ours: `#977` amendments 4 and 6)*
- **Entry versus exit freshness.** Exits use a freshness limit derived from risk; xStock entries use a flat 15-second limit. Kyle's 3 September ruling covered exits only. *(ours: plan row 3b.f-c `B-XSTOCK-SESSION-FRESHNESS`)*
- **Quote currency.**
  - 31 BTC-quoted pairs became tradable as a side effect, while our money arithmetic assumes a fiat quote.
  - A BTC quote overstates the error. A sub-dollar quote inverts it, and the inverted side is far too permissive.
  - *(ours: `#966`)*
- **The xStock pricing plan:** six xStock price problems, a fix for each, and the order to do them in. *(ours: `1-system-manual/XSTOCK_PRICING_PLAN.md`)*
- **Already decided — do not re-open.** No exit-skip alert outside US regular trading hours (Kyle, 11 September). That is alerting, not pricing; it is CC-B's plan row 3b.f-d.

### 1b. Coltrane's pricing findings

- **Queue-time book (PR-A1).**
  - A crypto coin entering the queue is already subscribed to the ticker and the 10-level book, not only once held. *(REG §4: xStocks get nothing at queue time.)*
  - Our 6.8% figure is book presence in sampled evaluations, not subscription coverage.
- **Reconnect (PR-A1).** After a reconnect, held positions are restored, after a pending-subscription branch. A name that is only queued is not guaranteed to be restored.
- **Book integrity (PR-A2).**
  - The integrity check exists, but whether a book passed it does not travel with the book, and the check is skipped when precision is unknown.
  - The resync gap after the 500 ms wait has no finite bound. Resume only after a fresh valid snapshot.
- **Paper taker entry (PR-A4).**
  - It is priced from a snapshot taken at the gate and reused after other work, so the real delay needs measuring.
  - The notional actually filled can differ from the sizing notional, so recheck the limits against it.
  - A venue-validation result of "skipped" lets the paper open proceed.
- **Bars (PR-A5).**
  - The xStock bar includes the still-forming bucket, and a bar's start time is not the age of its information.
  - The 60-minute request belongs to regime refresh, a different job.
  - *(REG §1.4, Langston: the refresh re-grades on 60-minute bars.)*
  - *(Coltrane on Discord, 2026-09-11: the two intervals are different inputs, not evidence the difference is wrong, and not a reason to change the 15-minute interval.)*
- **Market-context cache (PR-A6).**
  - Its key ignores lane, input price and bar interval.
  - The pattern loop sends the latest 60-minute close to MCE unsmoothed.
  - The Kalman filter updates on every repeated read of the same cached price (see also the smoothed price in 1a).
- **Price-cache provenance (PR-A9).**
  - The cache loses where each price came from.
  - A WebSocket update can invent both quote sides from a single price.
  - One counter labels REST data as WebSocket.
  - The translator can fall back to the last trade.
  - The xStock mark path writes into the shared symbol-keyed cache without asset class.
- **Feed agreement (PR-A10).**
  - Withdrawing our conclusion was right: a producer field alone does not create two independent arms.
  - A zero count of "book with no ticker" proves no subset relation.
  - The samples carry no observation identity.
- **Subscription lifecycle (PR-A13).**
  - Unsubscribe covers the ticker only.
  - The v2 book handler ignores the subscribed-symbols guard.
  - The book unsubscribe inside the soft resubscribe is not protected.
  - The per-symbol watchdog is never armed; an aggregate archive watchdog exists.
- **Our census (PR-A14).**
  - It searched one spelling of the subscribe call and missed the futures feed.
  - REST OHLC returns at most 720 recent rows, so gaps cannot be backfilled from it.
  - Kraken's connection limits still apply to broad subscription.
- **Price side and clocks (AU3 §3).**
  - Source time, receipt time and decision time are different things. No ideal staleness ceiling was identified.
  - Local receipt age leaves out any delay before the stamp, so an old message that was just parsed looks fresh.
  - "Book age" means an archive row for xStocks and a mini-book for crypto.
  - The `#943` comparator is not a solved premise.
- **What each job should read (AU3 §3, Stage B).**
  - A taker liquidation trigger is most faithful on a valid current bid and depth. A last trade is an event record, not a liquidation price.
  - Maker orders need a resting-order model, not a swap of sides.
  - AU3 calls detecting setups on the midpoint a defensible, reviewed choice. PR does not accept a *smoothed* midpoint as proven for detection (1c). This is for Coltrane to reconcile.
  - AU3 names a best source per job, including the xStock ticker; the xStock book channel is unverified (`#949`).
  - A policy based only on receipt time must keep "source age unknown" as a state.
  - Ranking tradeable candidates needs feasible entry and exit economics and a fill probability; midpoint economics are not enough.
- **Spreads and ticks (AU3 Q1).**
  - Median spreads: crypto 6.67 bps by event and 25.4 bps across instruments; xStock 7.69 and 7.82.
  - About 92-94% of quotes have a spread at least as wide as the median 1-minute range.
  - The archive throttle is a deliberate trade-off, not a new defect.
  - Published crypto ticks were not exported, and xStock ticks are only inferred. Full tick resolution and latency are not established.

### 1c. Coltrane's own recommended pricing design (PR sections b and c)

- **Keep five things separate:** market observations, strategy features, order intent, execution estimates and accounting facts. PR gives a table of which price to use for each job, for both asset classes.
- **A minimum data contract.** Every price keeps its venue, channel, kind, sides, venue time, receipt time and decision time. A book also keeps its integrity and sync state.
- **Durable subscription membership** (queued, held, diagnostic), restored after a reconnect.
  - Releasing one reason for a subscription must not drop another owner's.
  - Pinning must not block a checksum resync.
- **Other design points in (b):**
  - The best-bid/offer ticker is the default touch price. It fires on price-level changes only, not on size-only updates.
  - Replay depth at the modelled arrival time, and keep a residual position when completion is unknown.
  - Keep a fair-value mark separate from a liquidation estimate.
  - Recheck sizing after rounding.
  - Record the signal level, the trigger, the fill estimate and the venue fill as separate fields.
  - Stop activation uses the order's own reference price.
  - The MCE cache must be aware of its inputs and its version.
- **He rejects:**
  - **A universal "every level, trigger or record must be a trade side" rule.** This is aimed at our superseded two-category wording. The 4 September rule already admits printed prices (1a), so treat this as converged ground, not an open disagreement.
  - "Entry on the ask, exits on the bid" without an order-type qualifier.
  - The prohibition on market information in ranking and sizing. Both may use a consistent cost snapshot.
  - The claims that "one-level depth cannot detect depletion" and that "a book cannot serve a lane without positions".
  - Our xStock stop-out prediction, even after correcting its arithmetic. An 11.8% spread puts the bid about 5.9% below the midpoint, not 11.8%.
- **He does not accept as proven:** that a smoothed midpoint is the best input for detecting signals.
- **He agrees:** the perpetual-futures archives stay archive-only.
- **The ticker/book test.**
  - He keeps the three comparisons (trade-triggered ticker, best-bid/offer ticker, book) and calls the idea useful.
  - He replaces the decision rule. The current rule:
    - compares cold best-bid/offer-versus-book error with hot trade-ticker-versus-book error, changing both population and treatment;
    - uses a `>=` crossing rule and throttled counts;
    - allows a "permanent" outcome.
  - His replacement is a bounded, paired, time-aligned comparison.
- His suggested order of work is in PR section (b).

---

## Group 2 — Trading costs and fees

- **xStock fees (ours `#1010`; AU2-1, AS-1, AU3).**
  - We charge xStocks the crypto schedule: taker 0.80%, maker 0.40%. Kraken Pro xStocks is flat: taker 0.10%, and makers get a 0.02% rebate.
  - Every xStock candidate has been graded against a 1.60% round trip instead of 0.20%.
  - **AU2-1 and AS-1 held the mismatch as a hypothesis** until the account's own fee evidence was available. Kyle supplied the in-account fee screens on 6 September, which confirmed it (`#1010` amendment). AU3 treats it as in-flight work.
  - The same screens showed a second defect. The tier is hardcoded, so once live volume builds, it goes stale in the other direction. The fee model must resolve a tier per product from a live measure.
  - ⚠️ **The server's start-up check refuses any fee outside (0, 5%].** Writing the real −0.02% maker rebate would stop the server starting (ours: `server/startup/b72-warmup.ts`; AS-1 noted only that zero is refused). That is why this is a batch, not a value edit.
  - *(ours: CC-B `B-XSTOCK-FEE-CONTRACT`, `PHASE_19_PLAN` row 2.4-FEE)*
- **Crypto fees.**
  - Our 0.40% maker and 0.80% taker match Tier 1 on the account (ours, `#1010` amendment).
  - The roughly 1.6% crypto round-trip break-even is a real hurdle, not a bug (AU3 Q3; Langston, 6 September).
  - **AU3 also says asset class is not a complete fee-group key.** USDC/USD, USDT/USD and EUR/USD sit on separate schedules, and the list of pairs in a selected-pair maker-rebate program was not captured.
- **The fee setting has no identity (AU2-1, AS-1; proposals AU2-A, AS-P1).**
  - Nothing ties it to a venue product, an account tier or an effective date, and it cannot hold a rebate.
  - AS-1 adds that the signal orchestrator sets level geometry to "mid". Dropping the spread charge just because a sided option exists would undercharge.
  - An account tier can qualify through assets held on the platform, so request the account's actual fee response for each pair.
- **Maker entry credit (AU1-3, hypothesis).**
  - A maker entry may be credited a full spread when it can only save half.
  - AU1 (unsettled item 3): measure where our limit actually sits in the spread, separately for quant signals (midpoint) and pattern signals (bar close).
- **Hurdles against real price paths (AU3 Q3).**
  - Hurdle = (1+fe)/(1−fx)−1.
  - xStock Pro: taker/taker 20.0 bps, maker/taker 8.0, maker/maker −4.0.
  - The share of price moves clearing the taker/taker hurdle, by horizon: crypto 4.8-14.6%, xStock 19.9-83.7%.
  - "Market movement is necessary evidence, not alpha."
  - INSUFFICIENT: per-instrument hurdles (a timestamped instrument-to-fee-group map is needed first), capture probability, horizon and profitability.
- **Whether long-only strategies clear real Kraken costs** is a HYPOTHESIS (AU2, unresolved list).

## Group 3 — Simulation realism: how paper and VTS fills and exits are modelled

- **Maker fills (AU2-4, AS-6; proposal AU2-D).**
  - A simulated maker order fills in full at its limit once a sampled price touches it, with no queue position and no partial fill.
  - If a sample both crosses and arrives after the deadline, the fill wins. AS-6 records that as deliberately ratified, not a newly discovered timeout bug.
- **The exit walk (PR-A3).**
  - The simulated exit completes even beyond the visible book, priced with a penalty. PR's probe used 100 bp.
  - PR: "Treat unobserved depth as uncertainty, not guaranteed completion at a convenient penalty."
  - *REG §1.6 adds three points:*
    - our penalty is 50 bps and was a reviewed choice;
    - the split between walked and extrapolated quantity is thrown away;
    - two of the three exit paths never walk the book.
  - PR-A3 also corrects our document: the entry walk does detect exhaustion and return partial fills. L2 still cannot show queue position.
- **Maker exits and VTS booking (PR-A12).**
  - A maker exit can fill on a midpoint no buyer was at. How often is unknown.
  - VTS does have a pending-maker lifecycle.
  - VTS books crypto exits at the observed mark but clamps xStock stops and targets (ours: F-G-2 OBJ-5; the xStock clamp stays until `#943`).
  - Count each cost exactly once.
- **Exit paths that cannot run today.**
  - Trailing (`trailing_enabled_active = false`) and moonbag (`moonbag_qualifying_strategies = []`) are both off on all four asset classes. The config is measured inert.
  - No latch has fired on the active lane (ours: `#677`; the F-G-2 progress report).
  - A design touching exits must not propose fixes to paths that cannot run.
- **Other favourable assumptions (AS-6):**
  - The ranking shadow charges zero friction, so its stored "net" is gross before fees.
  - Slippage is static and spreads are cached.
  - Trigger clamps ignore overshoot.
  - Exits are assumed possible outside sessions and through feed stalls.
  - The xStock witness shares its upstream, so it tests consistency, not truth.
  - A close with missing config books zero slippage.
  - Closed-only labels leave out waiting time and unresolved exposure. Capped holding times mean closed trades alone cannot show the right holding horizon.

## Group 4 — Strategy geometry: how entry, stop and target are set

- **DHMA (AS-2, AU3 §2.b).**
  - It mixes units: it adds a percentage to a price.
  - Even with the units fixed, it buys above the middle and sets stop and target the same distance either side, so it always risks more than it can win.
  - It has never traded.
  - Its $1.50 price ceiling depends on volatility (P < 1500σ).
  - The manual calls it a microstructure strategy, but the code uses candle approximations; AS-2 marks this FOUND-AND-LIVE.
  - AS-P2 proposes a units and price-scale experiment.
  - *(Langston, 6 September: a units fix alone will not cure it.)*
- **Target family (AU2-2, AS-3; proposal AU2-B).**
  - "Target family" does not decide how a target reacts to volatility. The final target depends on which branch actually runs: stop geometry, R-multiple, or min/max.
  - Our strategy fee-viability proposal needs redoing at that level.
  - Part of our concern survives: range_trade's target distance shrinks as ATR rises (AS-3).
  - AS-3 includes a geometry inventory of all 19 strategies.
- **The invented 2% target**, used when a strategy gives none, may not decide rank in every case. *(PR-A11; ours `#927`)*
- **The strong-trend lane (AU3 §2.b).**
  - It produces no trades, and the reason cannot be found from what we keep: the null-reason counters are held in memory, not persisted.
  - Separating eligibility from the favoured list is sound.
  - The old 2.5 global floor must not be presented as today's cause; 1.95 is seeded now.
- **Declines and never-traded strategies.** Their geometry cannot be inferred from what we store. *(AU2, unresolved list; ours `#648`)*
- **Seeded once and never revisited:** `strategy.dhma` (25 values) and `strategy.range_trade` (15). *(REG §6)*

## Group 5 — Decision maths: prediction, regime, ranking and sizing

- **The expected-value formula (AS-4; ours `#399`, `#502`).**
  - It is an uncalibrated stand-in. Win probability is not linked to target distance, time or exit policy, so pushing a target further out raises expected value with no change in the chance of reaching it.
  - The "pWin is flat" wording in B8.5a confuses signal strength with the kernel's pWin, which is 0.40/0.45/0.60 by DI at seed values.
  - The kernel drops the sign of DBS.
- **The ranking objective (AS-5; proposal AS-P6).**
  - R-multiple ranking and fixed-size positions optimise different things; R-multiple ranking can prefer the smaller expected dollar outcome. The objective needs an explicit decision.
  - Slots held by pending makers or long-lived positions carry a calendar opportunity cost that neither ranking captures.
- **Evidence discipline for ranking (AS-6).**
  - "Promoted" means selected, not executed.
  - Compare within a cycle.
  - A tie or a loss is INCONCLUSIVE.
  - Cost differences can reverse the gross ordering (HYPOTHESIS).
- **Regime (AU2-3, AS-7; proposal AU2-C).**
  - AU2-3: "regime" is three different numbers — the routing label, the SQE regime weight and the classifier's confidence. They share no contract, so a signal can pass one and fail another.
  - The mapping from ADX to trendStrength is interim, bound to Phase 25.
  - AU2-C's core point: signed direction must be an explicit long-only eligibility input, because `abs(DBS)` treats a strong down move like a strong up move.
- **What actually changes decisions (AS-7).**
  - Some confidence calculations are telemetry only; others change decisions.
  - finalScore is computed after queueing, and is used for analysis only.
  - VTS closes feed the AMR's EV-gap tracker, so VTS can indirectly affect AMR gates.
  - "Refreshed EV" reuses the queued geometry.
  - The IE regime admits strong down moves.
  - The TFS momentum replacement was deliberate.
  - "ADX" is really DX.
  - AS-7 lists the exact regime inequalities and the routing roster.
- **Does the AMR act?** Whether it enforces, runs in shadow or is disabled could not be read, because the database flags were unavailable. *(AU2, unresolved list)*
- **Sizing (PR-A7; REG §1.3).**
  - PR-A7 corrects our document: moving the stop does not shrink size; moving entry to the ask does, through the entry-price denominator.
  - Sizing has a branch that depends on mode.
  - Exposure limits must be re-verified on the quantity actually executed.
  - REG §1.3: the sizing code's header comment still describes stop-based sizing.

## Group 6 — Data identity and isolation

- **The ready-to-buy queue's identity (AU1-1; ours `#1006`, CC-B `B-RTB-SIGNAL-IDENTITY`, row 2.4c in CC-B's task list `1-system-manual/CLAUDE_NEW_PHASE_19_TASK_LIST.md`).**
  - Asset class is left out of the queue's identity, and its declared unique index does not match what the code upserts.
  - A batch (`BATCH_79_0m_a`) asked for a retrospective audit of every table that gained `asset_class` without updating its unique index. That audit was never done.
  - Promotion cleanup clears by symbol and mode only.
  - The upsert overwrites asset class, so a later writer can reclassify a row.
  - The R-multiple comparison can compare two different assets.
  - Langston's note: the deeper gap is that nothing compares the schema file with the live database.
- **The same ticker in two asset classes (REG §1b; ours `#1024`, plan row 3b.h-4).**
  - DASH the coin and DoorDash have traded under one identity, and the price cache and other caches are keyed by symbol alone.
  - Kyle ruled that identity is symbol plus asset class.
  - PR-A9 adds a site: the xStock mark path writes into the shared symbol-keyed cache.
- **Paper and live not separated (AU1-2; ours `#618`, `B-MODE-DELETE-SCOPE`).**
  - The positions table has no mode column, and the reset functions delete both modes.
  - The same positions are read under both paper and live in the server entry point, the Kraken adapter and the trailing-exit controller, so they can be processed twice.
  - Closed trades and trade logs share the destructive reset.
- **Open positions are unique by symbol alone, across asset classes.** This needs an explicit decision. *(AU1-1)*
- **A dead duplicate check.** The scanner's "already has an open position" check reads a table nothing writes. The real invariant is enforced elsewhere, so this is a dead, redundant second gate. *(ours: `#965`)*

## Group 7 — Risk envelope and live readiness

- **The daily-loss kill switch counts only closed-trade losses**, so open losses never trip it. *(AS-8; ours `#303`, homed to Phase 25)*
- **In live mode the kill switch would not flatten positions**; it logs that as future work. *(AS-8)*
- **Fail-open paths (AS-8):**
  - a missing cooldown state and the total-exposure catch let trading continue;
  - a non-finite P&L is cleaned to zero;
  - daily-loss evaluation failures are only logged (ours `#634`);
  - the reset anchor (ours `#632`) is not a rolling-loss guarantee;
  - a wider stop at the same notional raises the planned loss.
- **The live engine (PR-A8; REG §2b; ours `#578`, `#1022`, `#1023`).**
  - PR-A8: a gated route starts a live engine that holds a real order call. That is "not evidence that the gate is enabled or that this engine currently trades".
  - The active order placer has no live implementation. Settle engine ownership and execution-report handling before live.
  - *REG §2b (Langston's re-check):* the old engine can reach a real Kraken sell through the close-trade route, and today only an empty table stops it.
- **Live parity with paper** is not proven by counting mode checks. *(PR-A8)*
- **Not established (PR):** no durable full-L2 capture was found. A mock-price function and a test-trade route exist.

## Group 8 — Opportunity boundaries: what we never look at

- **Long-only boundaries (AS-9).**
  - Long-only rules and capture boundaries hide some opportunities.
  - "Defensive hedge" is a long position that diversifies, not a hedge.
  - The passive loader drops quotes outside its allowed set.
  - xStock has no decline recorder, so an empty capture does not mean zero declines.
- **The active-path price floor.** Is $0.25 the right floor? It excludes Dogecoin and Cardano. That is Kyle's decision. *(ours: `#967`)*
- **Filters on existing strategies — not new strategies (AS-P3, AS-P4, AS-P5).**
  - Each is tested against its existing strategy as the control:
    - P3 modifies the VWAP family and may choose cash;
    - P4's control is the frozen existing ORB;
    - P5's control is the existing strong_bull_trend.
  - All three are HYPOTHESIS, under one pre-registered protocol: a start time T0, 56 days of admissions, 84 days of observation, matched control books, and a PASS/FAIL/INSUFFICIENT verdict on net marked wealth.
  - All stay inside current risk limits.
- **AS §6:** no risk relaxation. The honest outcome may be "not viable under current conditions".

## Group 9 — Evidence: what stops us answering questions about our own results

- **Holding time (AU3 Q2).**
  - Refused, with three blockers:
    - no complete censor/risk set;
    - no enumerated deployment boundaries;
    - a chronology that needs reconciling. The 39 file-touch rows are 32 commits, not deployments; the deploy commit is timestamped after its claimed deploy time; the four July max-hold rows predate P19-B8.5j.
  - Survival analysis must keep everyone at risk.
  - AU2 adds that the holding horizon needs open positions and per-arm clocks, because closed-only durations are biased short.
- **Deployment boundaries have a home (ours: `#1001`, `#1002`).**
  - `#1001`: staging ran 55 commits behind the review branch. It has been redeployed since, but the gap is not closed.
  - `#1002`: every deploy instrument answers "was the deploy legitimate"; none answers "is staging behind".
  - So a finding that reads "the code says X" may not describe what was actually running — which is exactly the falsifier AU3 names.
- **The missing strong-trend trades (AU3).** Answering this needs routed-candidate lifecycle events, plus the resolved configuration and sink coverage.
- **Joined records (AU3).** Decision, order and fill records are not joined with meaningful timestamps, and per-instrument fee and tick identity is missing.
- **Data we do not export (AU2, unresolved list).** Ranking and horizon questions need within-cycle rank pairs, attempt-level maker records and never-filled attempts.
- **AU3's governing answer.**
  - Correcting fees cannot recover trades that were never taken.
  - The contaminated selection history must not be reused as market evidence.
  - There is no evidence the platform can beat competitors.
- **AS §4, the primary answer.**
  - Hours versus days is not established either way.
  - Four things must be reconciled first: fees, price units, what prediction and exit policy mean, and the allocation objective.
  - "Right decisions" should mean maximising net wealth, holding cash included, reported with full metrics.
  - "Red days after reset" as a cause is unsupported.
  - AS §4 sets out a six-step empirical method with date boundaries.
- **Unsupported claims in our brief (AU3):** full tick resolution, seven-day coverage and uniform behaviour.

## Group 10 — Document corrections only (the system is fine; our documents are wrong)

- **The pricing document (PR-A14 table and PR-A10; the register labels these A14a-d and A10b).**
  - REST does not cost one request per symbol.
  - The volume-floor "dial" is not wired to the database.
  - The archive, cache and subscription sets are not nested inside each other.
  - The perpetual tables have a dashboard reader.
  - A withdrawn conclusion still sits in the document.
  - The universe refresh script does not change live subscription membership.
  - "No usable xStock REST history" is not established.
- **PR-A5:** "MIDPOINT from the bar close" and "archived candles never reach trading" are both false.
- **PR-A3:** "always fills at the touch" is wrong.
- **PR-A13:** the soft resubscribe is described as "fixed by construction", but its book unsubscribe is not protected.
- **AU3 §3:**
  - "The venue has no timestamp" is stale; the timestamp is parsed now.
  - "The midpoint for every job" misses the active-paper bid/ask walks, maker-limit booking and VTS's separate policy.
- **AS-4:** the "pWin is flat" wording in B8.5a.
- **ours:** `1-system-manual/PRICING_DATA_ARCHITECTURE.md` needs all the Group 1 corrections. That repair is ours, not Coltrane's.
- **ours, done 2026-09-11:** plan rows 3n (superseded rule wording) and 3b.c (a withdrawn "CRITICAL" finding) now each carry a correction note.

---

## Keep — what the reports judge already right

These are listed so they are not "fixed" by accident. **Nothing here is pre-decided:** a provenance read still runs on anything a design touches.

- **AU3:**
  - separating fill accounting from telemetry;
  - depth walks and maker-limit booking;
  - the provenance and age fields;
  - keeping the two passive censor walls apart;
  - refusing to score the contaminated selector;
  - the archive throttle, a deliberate trade-off;
  - separating strong-trend eligibility from the favoured list;
  - the active max-hold being off, which is Kyle's decision, not a missed timer.
- **PR:**
  - preserve structural geometry (the code itself warns at `signal-orchestrator.ts:2529`);
  - use depth for taker estimates and venue fills for accounting;
  - the archives are intentional;
  - require evidence before changing xStock triggers or an ongoing experiment;
  - perpetual archives stay archive-only.
- **AS:**
  - the fill winning when a sample crosses after the deadline was deliberately ratified (AS-6);
  - the TFS momentum replacement was deliberate (AS-7).

---

## Appendix — the two question lists

Each file holds 15 questions and ends with a section comparing Coltrane's emphases with our brief's.

- `astra-independent/BLIND_SPOT_DELTA_astra.md` was frozen before the report's section 6, so it is a clean list.
- `audit1-full-system/BLIND_SPOT_DELTA_audit1.md` marks itself **CONTAMINATED**: it is not a clean pre-exposure measurement. Its delta section names four emphases our brief added and seven that Coltrane added.

Both lists are worth answering at the design stage. Examples from the audit 1 list:
- Does one objective survive from signal to fill?
- Are costs counted exactly once?
- Do risk limits still hold after rounding and delayed fills?
- Which timestamp does each age check use?
- Is the learning population the same as the trading population?
