# Q3 — cost hurdles against the tape

## Contract and limits

Object: the account-confirmed ladder transcribed in `1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md`, cross-checked against all 19 rows in `fee_ladder.csv`, and forward price paths in the two supplied minute-bar files. **No fee came from engine configuration, trade costs or derived outcomes. No trades were joined to tape for this question. No strategy net-EV ranking was computed, even as an intermediate.**

There are two different questions: a **fee-only hurdle**, identified by the supplied ladder under its applicable fee group; and **all-in realizable cost**, which also needs contemporaneous sides, order size/depth, order type, queue/fill evidence, and timing. Only the former and descriptive quoted spreads are identified here. Do not substitute their sum at a median historical spread for an actual execution cost.

**Instrument fee-group assignment is itself incomplete.** The crypto tape includes **USDC/USD and USDT/USD**; the `crypto_spot` trade labels also include EUR/USD. Kraken's current public contract assigns stablecoins in the base currency and FX pairs a separate schedule. The supplied fee reference also names a selected-pair maker-rebate program whose eligible-pair list was not captured. Class is not a complete venue fee-group key. Thus the per-instrument clearance CSVs are labelled **conditional fee scenarios**, not confirmed charges for every listed symbol. The reference's account confirmation establishes the shown product/rung examples, not every historical pair's special eligibility. Request a timestamped instrument-to-fee-group map before calling this an exact venue hurdle per instrument. This unanswered part is **INSUFFICIENT**, not filled with a proxy. No additional public fee rates were substituted for the supplied ladder. [Kraken fee-group contract](https://www.kraken.com/features/fee-schedule)

## Identified fee arithmetic

For a long position of unchanged base quantity, fees in quote currency, entry price P0 and exit price P1, zero net cashflow requires:

`P1/P0 = (1 + entryFeeRate) / (1 − exitFeeRate)`.

The exact required price return is this ratio minus 1. The common additive `(f_entry + f_exit)` bps is only the equal-notional shorthand. Both are in `q3_fee_hurdles.csv` for **57 combinations: 17 crypto rungs + 2 xStock rungs, each TT/MT/MM**. Future-rung scenarios do not imply the account qualifies. “MT” specifically means maker entry, taker exit; reversed legs have a slightly different exact hurdle.

| Population: current rung-1 fee scenarios, per filled round trip | Taker/taker | Maker/taker | Maker/maker |
|---|---:|---:|---:|
| Standard crypto spot — exact fee-only hurdle | 161.290 bps | 120.968 bps | 80.321 bps |
| Pro xStocks — exact fee-only hurdle | 20.020 bps | 8.008 bps | −3.999 bps |
| Standard crypto spot — equal-notional fee sum | 160 bps | 120 bps | 80 bps |
| Pro xStocks — equal-notional fee sum | 20 bps | 8 bps | −4 bps |

A negative maker/maker hurdle is the rebate on **two actually filled maker orders**. It is not a riskless income stream, an immediate crossing opportunity or evidence the market will fill both orders at these prices. Futures have no tape in this package and are outside these measurements; their cheaper stated fees do not answer a spot-market opportunity question.

## Tape population, method and results

Actual window, independently read rather than borrowed from “7 days” in the manifest:

- Crypto: **814,356 rows / 571 instruments**, September 1 00:00Z–September 6 09:13Z. **420 invalid OHLC rows** excluded; **813,936** valid unique rows remain. 359,043 source rows have high=low; 420 have zero volume.
- xStock: **807,914 rows / 480 instruments**, September 1 00:00Z–September 5 00:00Z. **807,914** valid unique rows remain; 198,531 source rows have high=low; none has zero volume.

Both have zero duplicate (symbol,interval_begin) keys. Positive controls are the nonzero valid rows and nonflat bars in each, plus independent raw-row checks. Quote coverage is smaller: 528/467 observed instruments, so the full tape universe cannot inherit a measured spread indiscriminately. The date ranges and sparse minute coverage do not establish seven complete days per symbol. Nonpositive/invalid OHLC is a quality exclusion, not an invented zero return.

Horizons: **5, 15, 60, 240 minutes**. Origin = an observed minute's close. Require that origin plus **every intervening minute through the horizon** exists exactly once with valid OHLC. Do not forward-fill absent minutes or equate the next h rows to h minutes. Future upside excursion = max high in minutes t+1…t+h divided by origin close, minus one; future downside excursion and signed/absolute endpoint returns are also retained. No current-bar high leaks into the forward excursion. These are retrospective bar-price descriptions with overlapping origins, not independent trials and not an executable entry/exit simulation.

| Population: valid contiguous origins in each supplied class window | Horizon | Origins / instruments | Median absolute endpoint move | Fraction with future upside excursion above rung-1 **TT fee-only** hurdle |
|---|---:|---:|---:|---:|
| Crypto; conditional standard fee scenario | 5 min | 214,070 / 379 | 14.41 bps | 4.845% |
| Crypto; conditional standard fee scenario | 15 min | 120,006 / 200 | 19.69 bps | 9.636% |
| Crypto; conditional standard fee scenario | 60 min | 67,388 / 75 | 24.48 bps | 12.471% |
| Crypto; conditional standard fee scenario | 240 min | 46,022 / 19 | 31.99 bps | 14.630% |
| xStock; conditional Pro fee scenario | 5 min | 483,172 / 476 | 8.71 bps | 19.926% |
| xStock; conditional Pro fee scenario | 15 min | 354,332 / 455 | 16.15 bps | 39.679% |
| xStock; conditional Pro fee scenario | 60 min | 200,790 / 329 | 33.07 bps | 65.886% |
| xStock; conditional Pro fee scenario | 240 min | 57,562 / 154 | 72.46 bps | 83.670% |

Rows are **bar-origin weighted within each class**, not equal-symbol and not cross-class matched windows. The instrument composition shrinks sharply with horizon: for example only 19 crypto instruments support 240-minute origins. These rows must not be read as a causal curve of “hold longer and get this improvement.” Gaps may mean no trades, missing capture or market closure; without a contract they remain gaps. The comparison denominator also conditions on a fully observed future path, favouring continuously observed instruments. The per-instrument files expose every excluded/eligible count, including zero-origin rows.

For the **60-minute** rows only, the same forward-upside fractions under **maker entry/taker exit** are **15.991% (crypto, 67,388 origins/75 instruments)** and **83.628% (xStock, 200,790 origins/329 instruments)**. Under **maker/maker** they are **24.015% / 99.547%**, same respective populations. The very high xStock rebate-scenario fraction illustrates precisely why price paths cannot stand in for maker fill probability. The files also report the fraction whose **signed endpoint return**, rather than a hindsight high, clears each hurdle; an absolute move is never counted as a profitable long merely because it is large.

**STRUCTURAL CONSTRAINT — NOT A DEFECT:** on a market to which the confirmed standard crypto Tier-1 schedule applies, fees alone require about 1.613% price appreciation for an unchanged-quantity taker round trip. That is a substantial economic barrier to frequent small-move trading. The measured tape describes how often price moves exceed that threshold in explicitly bounded windows, not whether the system can predict or capture them. The barrier becomes movable with a genuinely earned/qualified cheaper tier, a different applicable fee group, execution that actually earns maker rates, or different venue/product conditions. Each changes eligibility, capital exposure, fill risk or the traded opportunity; none is a free software improvement. xStock's materially lower correct fee floor is also real, but its spread tails and limited execution evidence remain independent constraints.

**FINDING — market movement is necessary evidence, not alpha.** The package supports conditional price-move distributions and fee arithmetic. **INSUFFICIENT — attainable all-in per-instrument hurdle, capture probability, optimal holding horizon, profitability, and superiority to other trading systems.** Better-looking numbers after correcting fees cannot identify the counterfactual rejected population. The old xStock fee error is acknowledged in-flight work (#1010), not rediscovered here.

Evidence against overclaiming a cost wall: some observed moves do exceed fees; favorable maker schedules and higher tiers materially change the floor; a large move may still have occurred after an adverse stop or without executable depth. Evidence against optimism: prices/highs alone cannot establish fill prices, queue position, adverse selection, stable liquidity, capture timing or a predictive edge; special fee groups are unmapped and windows/symbols are incomplete. Confidence high in the conditional arithmetic and reproducible bar observations, insufficient in strategy or realizable-return implications. Falsifiers: corrected bars/fee-group metadata, executable matched order-book and order-lifecycle evidence, or an independent forward population demonstrating capture after all costs. No fabricated net-EV, no selection ranking and no design proposal is offered.
