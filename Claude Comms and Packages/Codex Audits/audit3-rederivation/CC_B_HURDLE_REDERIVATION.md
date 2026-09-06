# CC-B RE-DERIVATION — THE CRYPTO COST-HURDLE CURVE

> **Kyle asked for the crypto hurdle curve re-derived independently before any decision rests on it.** Langston had already narrowed the scope: *"the 4.8 → 14.6 % crypto hurdle curve is the one worth a real re-derivation, since the rung lever rides on it."*
> **This is that re-derivation, written from the estimand rather than by re-running the advisor's script.** `measure_q3.py` was deliberately not read or imported.

---

## 1. ✅ THE ADVISOR'S NUMBERS REPRODUCE EXACTLY

Independent implementation, same source file (`tape_1m_crypto.csv`, 813,936 usable bars / 571 symbols, 420 rows dropped as unparseable or non-positive).

| horizon | origins | symbols | up p50 | up p90 | **TT >161 bps** | MT >121 | MM >80 |
|---|---|---|---|---|---|---|---|
| 5 min | 214,070 | 379 | 11.2 | 89.2 | **4.8 %** | 7.0 % | 11.2 % |
| 15 min | 120,006 | 200 | 18.5 | 155.9 | **9.6 %** | 12.7 % | 18.3 % |
| 60 min | 67,388 | 75 | 27.5 | 218.4 | **12.5 %** | 16.0 % | 24.0 % |
| 240 min | 46,022 | 19 | 47.2 | 208.1 | **14.6 %** | 21.4 % | 34.4 % |

**Every cell matches the advisor's `q3_summary.json` to the decimal, including the origin and symbol counts.** ⇒ **the measurement is reproducible and the arithmetic is sound.**

★ **AND ITS HURDLE ARITHMETIC IS RIGHT, which is worth stating because the obvious version is wrong.** A round trip is **multiplicative, not additive**: breaking even buying at `P` and selling at `P(1+r)` requires `(1+r)(1−f_out) = (1+f_in)`, so `r = (1+f_in)/(1−f_out) − 1`. At `0.008 / 0.008` that is **161.29 bps, not 160**. It used the correct form.

⚠️ **POSITIVE CONTROL: at a hurdle of 0 bps, 88.9 % of 15-minute origins clear — NOT ~100 %.** The other 11.1 % never print a high above the origin close for a full fifteen minutes. **That is not a broken instrument; it is the inert tail showing up**, and it corroborates the separate finding that most of the scanned universe does not measurably move.

---

## 2. ⛔⛔ BUT THE CURVE COMPARES A DIFFERENT UNIVERSE AT EVERY ROW — AND THAT IS NOT DISCLOSED IN THE CONCLUSION

**Look at the symbol column: 379 → 200 → 75 → 19.**

A 240-minute window requires a symbol to print a bar **every single minute for four hours**. Only 19 crypto symbols do. ⇒ ★ **"longer horizons clear more often" is measured across a progressively more liquid population, so the reported curve cannot separate a HORIZON effect from a LIQUIDITY effect.**
*(The advisor DID publish `n_symbols` per row — the disclosure is present. It did not draw the consequence, and the consequence is what a reader takes away.)*

**THE TEST: hold the cohort fixed at the 19 symbols that survive the longest horizon, and re-run every row on that same set.**

| horizon | **all symbols** TT | **fixed 19** TT | all MM | fixed 19 MM |
|---|---|---|---|---|
| 5 min | 4.8 % | **3.2 %** | 11.2 % | 7.2 % |
| 15 min | 9.6 % | **6.0 %** | 18.3 % | 11.1 % |
| 60 min | 12.5 % | **8.6 %** | 24.0 % | 19.4 % |
| 240 min | 14.6 % | 14.6 % | 34.4 % | 34.4 % |

✅ **THE HORIZON EFFECT IS REAL. It is not a liquidity artefact — it SURVIVES the fixed cohort and gets STRONGER**: ×3.0 across the reported curve, **×4.6** on a constant population.
⛔ **AND THE SHORT-HORIZON NUMBERS WERE FLATTERED BY THE ILLIQUID TAIL.** On the symbols we could actually trade, 5-minute taker/taker clearance is **3.2 %, not 4.8 %** — thin names make large percentage jumps and inflated the reported figure.

---

## 3. ⭐ THE HONEST COHORT — AND TWO PEGGED PAIRS HAD TO COME OUT

The 19 include **`USDC/USD` and `USDT/USD`**. ⛔ **A pegged pair cannot express a directional move, so including it in an opportunity measure depresses the result for a reason that has nothing to do with tradeability.** Excluded, leaving **17**.

**FINAL — same 17 liquid, non-pegged symbols at every horizon:**

| horizon | origins | up p50 (bps) | **TT >161 bps** | **MT >121 bps** | **MM >80 bps** |
|---|---|---|---|---|---|
| 5 min | 82,560 | 9.8 | **3.8 %** | 5.5 % | 8.5 % |
| 15 min | 66,044 | 18.5 | **7.4 %** | 9.4 % | 13.6 % |
| 60 min | 48,319 | 36.8 | **10.9 %** | 14.7 % | 24.5 % |
| **240 min** | 36,368 | **67.4** | **18.5 %** | **27.1 %** | **43.5 %** |

*Cohort: ADA, AKE, ARB, BNB, BTC/USD, BTC/USDC, DASH, DOGE, DOT, ETH, HYPE, RUNE, SKR, SOL, USELESS, XRP, ZEC.*

⇒ ⭐⭐ **THE TWO LEVERS COMPOUND, AND THAT IS THE FINDING.** Short-horizon taker economics — **3.8 %** — is roughly where we have been operating. Four-hour maker-both-legs is **43.5 %**. **More than an order of magnitude, from two changes that are independent of each other.**

⚠️ **AND THE ONE THAT STOPS THIS BEING GOOD NEWS: THE MEDIAN FOUR-HOUR MOVE IS 67.4 bps AGAINST AN 80.3 bps MAKER/MAKER HURDLE.** ⇒ **even at our cheapest execution and our longest horizon, the TYPICAL move still does not pay.** The 43.5 % lives entirely in the upper half of the distribution, which is precisely the half a selector would have to find.

---

## 4. ⛔ WHAT THIS IS NOT

- ⛔⛔ **NOT AN OPPORTUNITY RATE. A move large enough to clear a hurdle is not a trade we could have captured.** It says nothing about whether we can predict it, enter before it, or exit at the top. **Capture requires a selector, a fill and an exit; none is measured here.**
- ⛔ **NOT a claim about maker fills.** The maker columns price the FEE only. Whether a resting order fills at all is unmeasured and is the binding constraint on that column. *(Langston's correction stands: an order AT the touch fills on incoming flow without price movement — queue position, not range — so the fill question is open in both directions.)*
- ⚠️ **7 days, one window, no deploy split.** No claim of stability over time.
- ⚠️ **Excursion uses the bar HIGH, so it is the best price available inside the window** — a hindsight maximum, not an achievable exit.
- ⚠️ **Overlapping windows** — origins are not independent observations, so no confidence interval is offered.

**Scripts: `rederive_hurdle.py`, `fixed_cohort.py` (both in this directory). Source: `C:\DawnTrader-Codex-Data\tape_1m_crypto.csv`, unmodified.**
