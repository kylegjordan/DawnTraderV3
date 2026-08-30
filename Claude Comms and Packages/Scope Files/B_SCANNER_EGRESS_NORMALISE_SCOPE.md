# B-SCANNER-EGRESS-NORMALISE — SCOPE (Step 1)

**Batch:** `B-SCANNER-EGRESS-NORMALISE` (`#906`) · **change-class: `architecture`** · **Owner:** CC-C · **Phase 19, plan row 5**
**Created:** 2026-08-30 · **Kyle-directed this batch next, 2026-08-30.**

> ⚠️ **CHANGE-CLASS DECLARED `architecture` DELIBERATELY, AND I MAY BE OVER-DECLARING.** It adds no component and changes no routing — but it **changes WHICH PAIRS TRADE**, on a core engine path (the scanner). §3.0 says an under-declared class touching core engine paths gets cross-checked anyway; declaring up costs a doc set, declaring down costs a flag. **Langston may downgrade it.**

---

## 1. WHY — TWO PAIRS HAVE NEVER TRADED, AND ONE HAS NEVER TRADED IN ANY LANE, EVER

| base | paper closed | VTS | open |
|---|---:|---:|---:|
| **BTC / XBT** | **0** | 5 | **0** |
| **DOGE / XDG** | **0** | **0** | **0** |
| XRP *(control)* | 29 | — | — |
| SUI *(control)* | 17 | — | — |
| LINK *(control)* | 2 | — | — |
| ADA *(control)* | 1 | — | — |

⭐⭐ **THE ASYMMETRY IS THE CORROBORATION, AND NEITHER OF US DESIGNED THE TEST — IT FELL OUT.** Both bases carry the identical defect. **BTC is in `BENCHMARK_SYMBOLS` and got 5 VTS trades through the passive bypass while the engine was off. DOGE is not a benchmark, never got the waiver, and is therefore at ZERO in every lane for all time.** *(Langston's bypass mechanism predicted exactly this.)*

## 2. ⛔ THE DEFECT, RE-DERIVED AT THE CODE TODAY — NOT TAKEN FROM THE LEDGER

**`server/services/market-scanner.ts` DOES NOT IMPORT A SYMBOL NORMALISER AT ALL.** `pair.symbol` is the **RAW Kraken wsname** (`XBT/USD`, `XDG/USD`) and is used at every egress as though it were the internal symbol (`BTC/USD`, `DOGE/USD`).

⭐ **THE CLEANEST PROOF, and it is a JOIN, not an inference — `:630-631`:**
```ts
const activeTradeSymbols = new Set(activeTrades.map(t => t.symbol));   // INTERNAL (BTC/USD)
const poolSymbols = new Set(activeFilterPool.getSymbolsRaw(mode));      // INTERNAL (pool keys)
```
…joined at `:773` / `:782` against **RAW** `pair.symbol`. ⇒ **For BTC that is `XBT/USD` tested against `BTC/USD`: it can never match.**
⚠️ **`getSymbolsRaw` was checked, not assumed: it returns `Array.from(pool.keys())` (`active-filter-pool.ts:516-519`) — "Raw" means UNFILTERED, not raw-exchange-form.** *(A name is not a thing; here the name misleads in the harmless direction.)*

**THE FULL EGRESS CENSUS (Langston's, re-verified at the ref today — the file is unchanged since 2026-07-23 and every line still matches):**
| site | call |
|---|---|
| `:698` | `ohlcCache.getOHLCData(pair.symbol, 60)` — **inside a bare `catch {}`**, so a failure here is silent |
| `:762` | `setCostMetrics(pair.symbol, …)` — the RAW-vs-normalised **cost-cache key convention** |
| `:773`, `:782` | the two `.has()` **dedupe joins** (above) |
| `:809`, `:816`, `:823` | `capturePreFilterReject({ symbol: pair.symbol, … })` |
| `:831`, `:994` | `passesHistoryFilter(pair.symbol, …)` |
| `:854` | the surviving candidate carries **`symbol: pair.symbol`** onward, un-normalised |

---

## 3. OBJECTIVES

| # | objective | verification |
|---|---|---|
| **OBJ-1** | **BTC and DOGE are EVALUATED.** Normalise at the scanner's Kraken egress so the internal symbol is what leaves this file. | ⭐ **FUNCTIONAL, AND DELIBERATELY NOT A ROW COUNT (see §5):** ≥1 `signal_eval_archive` row for a BTC base **and** ≥1 for a DOGE base, post-deploy. **Evaluated ≠ traded — a REJECT row satisfies this**, because the defect is non-evaluation, not rejection. |
| **OBJ-2** | ⛔ **PER-SITE DISPOSITION — WHICH SITES WANT INTERNAL AND WHICH GENUINELY WANT RAW.** ⛔ **THE REAL RISK OF THIS BATCH IS NOT MISSING A SITE, IT IS NORMALISING ONE THAT WANTED THE EXCHANGE FORM.** Each of the eight sites gets a stated answer before any edit. | A table in the Step-2 document: site → consumer → which form that consumer expects → **evidence at the consumer**, not at the call. |
| **OBJ-3** | **The dedupe joins compare like with like.** | A BTC pair already in the pool or already open is DEDUPED, demonstrated. |
| **OBJ-4** | **The cost-cache key convention is ONE convention.** `:762` writes a key some other reader must find. | Writer and reader agree, cited at both ends. |
| **OBJ-5** | **The missing `capturePreFilterReject`** — a rejected pair that records nothing is invisible to every later audit. | The reject path archives under the internal symbol. |
| **OBJ-6** | ⛔⛔ **NO REGRESSION ON THE PAIRS THAT ALREADY WORK. THIS IS THE ONE THAT CAN GO BADLY.** | **XRP, SUI, LINK, ADA — the four controls — are still evaluated post-deploy at a rate consistent with pre-deploy.** ⛔ **A control that goes to zero is a STOP, not a footnote.** |

## 4. ⛔ WHAT THIS BATCH DOES NOT DO
1. ⛔ **It does not change any FILTER or THRESHOLD.** If BTC is evaluated and then rejected on liquidity, **that is a PASS here** and it belongs to `B-LIQUIDITY-UNIT-AUDIT` (`#906` objective 1 — the unit-vs-quote denominator).
2. ⛔ **It does not touch `BENCHMARK_SYMBOLS` or the bypass.** The bypass is how BTC got its 5 VTS rows; removing it is a separate decision.
3. ⛔ **It does not widen beyond the scanner.** Other un-normalised egresses may exist; this batch fixes the one that was censused.

## 5. ⭐ THE CLOSE CRITERION IS FUNCTIONAL, AND THAT IS A DELIBERATE CHOICE — KYLE, 2026-08-30
> *"If we see the functionality works for a few, we see it for them all… I don't know why we have to keep waiting."*

**Applying the PER-ASSERTION test (Langston, same day — a criterion can contain both kinds):**
- ✅ **`OBJ-1` is BINARY.** *"Does a BTC/DOGE row appear in the evaluation archive"* is a property of a code path. **One row each settles it. There is no failure mode that hides for 30 evaluations and then appears** — and unlike `F-G-1`'s `never_filled` slice, no sub-population here is enriched for the defect, because the defect is total: the count is **zero**, not low.
- ✅ **`OBJ-6` is BINARY PER PAIR.** Four named controls, each either still evaluated or not.
⇒ ⛔ **NO ROW COUNT, NO SOAK. This batch can close the same day it deploys**, and that is a property of the question, not a shortcut.
