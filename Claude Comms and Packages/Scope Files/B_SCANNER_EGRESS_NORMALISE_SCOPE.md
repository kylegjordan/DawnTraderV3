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


---

## 6. ⛔⛔ ROOT CAUSE MOVED ONE LEVEL DOWN — **THE RESOLVER SKIPS ITS OWN MAPS ON THE ONE INPUT FORM THE SCANNER PASSES IT** *(CC-C, 2026-08-30, at Kyle's direction to use the existing machinery)*

> **Kyle's instruction, verbatim:** *"make sure that you are utilizing the symbol resolver… Don't just put in something static that has to be fed in in multiple places in the code. We have a name resolver… and they should fit within that."*
> ⭐ **Following it changed the batch. The fix is smaller, deeper, and REMOVES a static table's load rather than extending it.**

### 6.1 THE MAPPING ALREADY EXISTS — IT IS NOT MISSING DATA
`kraken-symbol-map.ts:102` — **`{ internalSymbol: "DOGE/USD", krakenRestPair: "XDGUSD", krakenWsPair: "XDG/USD", baseAsset: "DOGE" }`** — and `kraken-symbol-resolver.ts:33` loads it: `mapByWsPair.set(entry.krakenWsPair.toUpperCase(), entry)`.
⇒ ✅ **`mapByWsPair` HOLDS `XDG/USD → DOGE/USD` TODAY.** Nothing needs adding.

### 6.2 ⛔ BUT `normalizeInternal` NEVER ASKS IT — FOR SLASHED INPUT ONLY
| input form | what `normalizeInternal` consults | result for Dogecoin |
|---|---|---|
| compact (`XDGUSD`) | ✅ `mapByRestPair` (`:102`), then `mapByCompact` (`:105`) — **the authoritative maps** | ✅ `DOGE/USD` |
| ⛔ **slashed (`XDG/USD`)** | ⛔ **`:94-99` SHORT-CIRCUITS on `REVERSE_ASSET_TRANSLATIONS[base] \|\| base` and returns before any map is read** | ⛔ **`XDG/USD` — UNCHANGED** |

⛔⛔ **AND THAT TABLE HAS EXACTLY ONE ENTRY: `{ 'XBT': 'BTC' }` (`:46-48`).**
⇒ ★★ **THAT IS THE WHOLE BTC-vs-DOGE ASYMMETRY, AT THE LINE.** Bitcoin is the one base in the hardcoded table, so it normalises. Dogecoin is not, so it does not — **even though its mapping is sitting in the map the function declined to read.** *(The `#906` ledger entry called the symbol-form mismatch a "STRONGEST LEAD, NOT YET PROVEN." This is the proof, and it is one level below where the lead pointed.)*
⚠️ **`mapKrakenPairToInternal(wsPair)` (`:192-196`) DOES read `mapByWsPair` and would return `DOGE/USD` correctly — so the resolver contains both a working path and a broken one for the same question.**

### 6.3 ✅ THE FIX — INSIDE THE EXISTING RESOLVER, AND IT DELETES A DEPENDENCY RATHER THAN ADDING ONE
**In `normalizeInternal`'s slashed branch, consult `mapByWsPair` (and `mapByInternal`) BEFORE falling back to `REVERSE_ASSET_TRANSLATIONS`.**
- ⛔ **NOT** `'XDG': 'DOGE'` added to the static table — that would create a **SECOND HOME** for data already in `kraken-symbol-map.ts`, which is the `#641` two-copies shape this project keeps paying for.
- ✅ **ONE authoritative source (`kraken-symbol-map.ts`), consulted on every input form.** Fixes `XDG`, `XBT`, and **every other WS-form pair the map already knows** — not two coins.
- ✅ **The static table survives only as a last-resort fallback for pairs absent from the map**, and its role becomes explicit instead of load-bearing-by-accident.

### 6.4 ⚠️ WHAT THIS CHANGES ABOUT THE BATCH — STATED, NOT BURIED
- ⛔ **BLAST RADIUS GROWS AND MUST BE CENSUSED AT STEP 2.** `normalizeToInternalSymbol` has many callers; a fix here reaches all of them. **That is the right fix and a wider one** — the §9.5(a) census now covers the resolver's callers, not just the scanner's egress.
- ✅ **The scanner egress work (§2, `OBJ-1`-`OBJ-5`) STILL STANDS** — passing a raw wsname where an internal symbol is expected is wrong independently of whether the resolver would have normalised it.
- ⚠️ **`OBJ-6`'s regression risk RISES with the wider fix**, and the four controls become more load-bearing, not less.
- ⚠️ **INSTRUMENT LIMIT, STATED: I could NOT confirm the live symbol forms from `signal_eval_archive` — the query hit the statement timeout.** The finding above rests on the CODE, which is sufficient for it; **no claim here rests on that unread table.**
