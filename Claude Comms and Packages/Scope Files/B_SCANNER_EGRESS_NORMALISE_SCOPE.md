# B-SCANNER-EGRESS-NORMALISE — SCOPE (Step 1)

**Batch:** `B-SCANNER-EGRESS-NORMALISE` (`#906`) · **change-class: `architecture`** · **Owner:** CC-C · **Phase 19, plan row 5**
**Created:** 2026-08-30 · **Kyle-directed this batch next, 2026-08-30.**
**change-class**: architecture
> ⚠️ **THIS LINE IS DELIBERATELY ON ITS OWN AND MUST STAY THAT WAY.** The class was declared in the header line above from the start, and the governance checker COULD NOT READ IT — its marker (`config.mjs:180`) requires the marker to BEGIN a line AND the colon to sit OUTSIDE the bold. `**change-class:** x` FAILS; `**change-class**: x` PARSES — one character's position, and the two render IDENTICALLY. **17 scope files across four authors are in that state; the parser fix is `#968`.** Until it lands: own line, colon outside the asterisks.

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


---

## 7. ⛔⛔ §6 OVERCLAIMED AND I AM CORRECTING IT BEFORE IT REACHES CODE — **THE TABLE *HANDLES* BITCOIN**

**§6 said the one-entry table *"is the whole BTC-vs-DOGE asymmetry, at the line."* THAT IS FALSE, and the measurement that refutes it is one I ran myself, ten minutes later.**

### 7.1 THE MEASUREMENT — 130 MAPPED PAIRS, **ONE** CHANGES ANSWER
| | |
|---|---:|
| pairs in `kraken-symbol-map.ts` | **130** |
| pairs whose **WS form differs** from the internal form | **8** |
| of those, base `XBT` *(already in `REVERSE_ASSET_TRANSLATIONS`)* | **7** |
| ⭐ **pairs whose ANSWER actually changes under the §6.3 fix** | ⭐ **1 — `XDG/USD → DOGE/USD`** |

⇒ ✅ **`normalizeInternal('XBT/USD')` RETURNS `BTC/USD` CORRECTLY TODAY** — base `XBT`, table hit, done. **Bitcoin was never broken in the resolver.**

### 7.2 ⇒ THERE ARE **TWO** DEFECTS, NOT ONE ROOT CAUSE, AND THEY EXPLAIN DIFFERENT COINS
| defect | who it breaks | why |
|---|---|---|
| **A — the SCANNER never calls a normaliser at all** (§2) | ⭐ **BOTH BTC and DOGE** | `pair.symbol` is the raw wsname at every egress and in both dedupe joins. **The resolver is not involved because it is never invoked.** |
| **B — `normalizeInternal`'s slashed branch skips its own maps** (§6) | ⛔ **DOGE ONLY** | `XBT` is in the static table so Bitcoin resolves; `XDG` is not. **This bites only where the resolver IS called** — 58 sites across 10 files. |

⇒ ⛔ **DEFECT A IS THE PRIMARY CAUSE AND IT IS THE ONE THIS BATCH WAS ALWAYS ABOUT.** Defect B is real, worth fixing, and **explains only the second coin, only in the other 58 places.**
⇒ ⚠️ **AND `#906`'s framing was right all along, where mine was not:** it filed *"the BTC-specific non-evaluation trace, which is a **different bug** and may survive (1)."* **Bitcoin still needs its own explanation, and defect B is not it.**

### 7.3 ★★ THE ERROR, NAMED — IT IS TODAY'S PATTERN FOR THE SIXTH TIME
**I found a mechanism that would produce the observed asymmetry, and did not test it against the case it was supposed to explain.** One line of arithmetic — *does the table already contain `XBT`?* — refutes it, and the table is FOUR LINES LONG.
⛔ **A story that fits the symptom is not a cause.** *(`CONDUCT` §8: a cause is a CLAIM, and a claim sends people to work — here, to the wrong file.)*
✅ **What survives is BETTER SCOPED, not smaller: the batch fixes A for both coins, fixes B for Dogecoin and every future map-only pair, and leaves Bitcoin's own trace explicitly OPEN rather than falsely closed by a fix that could never have reached it.**

### 7.4 ✅ WHAT THIS DOES TO THE RISK — IT COLLAPSES IT
**The 58-call-site blast radius was the right thing to worry about and the wrong denominator.** ⇒ **For 129 of 130 mapped pairs `normalizeInternal` returns a BYTE-IDENTICAL answer before and after.** **Only Dogecoin moves.**
⛔ **`OBJ-6`'s four controls (XRP, SUI, LINK, ADA) are all in the unchanged 129** — so the control set is now provably conservative rather than hopefully so, and **any control regression would indicate a defect-A error, not a defect-B one.** That is a sharper instrument than I had before.


---

## 8. ⛔⛔ MEASURED AT THE LIVE RUNTIME — **THE TWO COINS FAIL AT DIFFERENT PLACES, AND `#906`'s PREMISE IS STALE**

**Instrument: 3,000 lines of live PM2 log, 2026-08-30T14:15Z. 362 DISTINCT pairs evaluated, 328 rejections.** *(This is what the scanner is doing NOW — not what the ledger recorded on 08-25.)*

| coin | reaches evaluation? | outcome |
|---|---|---|
| ⭐ **BITCOIN — `XBT/USD`** | ✅ **YES. IT IS EVALUATED.** *(18 XBT-base pairs seen: `XBT/USD`, `/EUR`, `/GBP`, `/JPY`, `/CHF`, `/CAD`, `/AUD`, `/USDT`, `/USDC`, `/USDQ`, `/USDR`, `/EURC`, `/EUROP`, `/DAI`, `/FIDD`, `/PYUSD`, `/AUSD`, `/USD1`)* | ⛔ **`REJECTED XBT/USD: history failed`** |
| ⭐ **DOGECOIN — `XDG/` or `DOGE/`** | ⛔⛔ **NO. ZERO APPEARANCES IN 362 DISTINCT EVALUATED PAIRS.** | **never reaches a rejection either — it is not in the batch at all** |
| `BTC/` base | ⛔ never appears | consistent with the scanner seeing **raw venue names only** |

### 8.1 ⛔ `#906`'s PREMISE IS OUT OF DATE — SAID PLAINLY
`#906` records *"`XBT/USD` and `BTC/USD` produce ZERO rows. **Not rejected — never evaluated.**"* ⇒ ⛔ **`XBT/USD` IS EVALUATED TODAY AND IS REJECTED.** Something moved between 08-25 and now. **A batch built on "never evaluated" would have been aimed at the wrong hop.**

### 8.2 ⭐⭐ BITCOIN'S CAUSE — AND THE ARGUMENT IS ABOUT THE *WORLD*, NOT THE CODE
**`REJECTED XBT/USD: history failed`** comes from `passesHistoryFilter` (`market-scanner.ts:368-381`), which calls `krakenService.getPairHistoryDays(pair, mode)` → `getOHLCData(pair, 1440)` and, per its own comment, *"If we cannot determine history (null), **be conservative & fail**."*
⇒ ★★ **BITCOIN HAS THE LONGEST PRICE HISTORY OF ANY CRYPTO ASSET ON KRAKEN. A "not enough history" verdict for `XBT/USD` CANNOT BE A TRUE PROPERTY OF THE WORLD.** ⇒ **it is a LOOKUP returning null and a filter failing closed on null** — and the lookup is handed `pair.symbol`, the **raw venue name**, at `:831`/`:994`.
✅ **THIS IS DEFECT A, AT ONE SPECIFIC SITE, AND THE BATCH ALREADY COVERS IT.**
⚠️ **NOT YET PROVEN, and I am not asserting it: that `getOHLCData` cannot serve `XBT/USD`.** The discriminating test is direct — call it with the raw form and the internal form and compare. **That is the first task of Step 2, not a conclusion here.**
⚠️ **CONTROL, and it keeps me honest: 11 of the 18 XBT rejections are VOLUME, exactly like the ETH and SOL controls. Only 7 are history. So this is NOT a blanket symbol failure** — the history site is implicated, the whole path is not.

### 8.3 ⛔ DOGECOIN'S CAUSE IS **NOT** THE SAME BUG, AND IT IS EARLIER
> ⛔⛔ **THIS SECTION IS REFUTED BY MEASUREMENT — SEE §13.2. Dogecoin IS evaluated, 25,294 times in three days. Read §13.2, not this.**
**It never reaches evaluation at all.** ⇒ **the egress sites cannot explain it — a symbol never passed to them cannot be mangled by them.** Candidates, to eliminate rather than assume: absent from the venue universe fetch · dropped in the `pairInfo` join (`:577-586` already instruments a *"SHORT UNIVERSE / join-drops"* warning) · excluded by the **adaptive batch selection** · in the failure-tracker **cooldown blacklist** (`adaptive-scan-manager.ts:48-118`).
⚠️ **The cooldown lead is UNRESOLVED, not cleared: I searched 1,500 log lines for `FailureTracker` and found ZERO — but the CONTROL is the same string, so a zero cannot distinguish *"not firing"* from *"not logged in this window."* Silence is not evidence (`#453`).**

### 8.4 ✅ WHAT THIS DOES TO THE BATCH — IT SPLITS AN OBJECTIVE, IT DOES NOT KILL ONE
- **`OBJ-1` SPLITS: `OBJ-1a` Bitcoin — passes the history filter instead of failing it. `OBJ-1b` Dogecoin — REACHES evaluation at all.** ⛔ **They are different hops and must never again be verified as one.**
- ⭐ **The close criterion gets SHARPER, not looser: `XBT/USD` must stop being rejected on `history failed`, and `XDG/USD` must APPEAR in the evaluated set. Both are single-observation, both are visible in one log read.**
- ⛔ **`OBJ-6`'s controls stand and are now doubly earned** — ETH and SOL reject on VOLUME today, so a control shifting to `history failed` after this change is an unmistakable regression signal.


---

## 9. ⛔⛔ SECOND READER — **§6.3's FIX IS TO A PRODUCTION-LOCKED MODULE, AND §6/§7 ARE A RE-DERIVATION OF A FOUR-DAY-OLD LEDGER ENTRY. BOTH WITHDRAWN.**

> **REVIEWER:** `claim-only` · *"only one pair changes; the table already handles Bitcoin"* · **HIT** · re-derived **y**
> ⭐ **Kyle asked for a second reader on the load-bearing parts. It paid for itself on its first run — it stopped an edit to a locked file and caught me presenting a known finding as new.**

### 9.1 ⛔⛔ THE MODULE IS PRODUCTION-LOCKED. I PROPOSED EDITING IT.
**`server/markets/kraken-symbol-resolver.ts:1-6`, verbatim:**
> *"🔒 **LOCKED MODULE — DO NOT MODIFY.** Directive: 8.8.4-A4.R10R-4 (Core System Hardening). Owner: Dawn Trader Core. **This module is production-locked. Changes require a formal directive.**"*

⇒ ⛔ **§6.3 PROPOSED CHANGING `normalizeInternal` INSIDE THAT FILE. WITHDRAWN — it is not this batch's to edit.**
⚠️ **AND ITS HOME ALREADY EXISTS: `RUNNING_ISSUES:2427` (`#229`) names all four competing normalisers, homes their consolidation to PHASE 20, and NOTES THE LOCKED STATUS EXPLICITLY.** ⇒ **a state of the world consistent with every object: the divergence is known, deliberately NOT patched in place, and owned elsewhere.**

### 9.2 ⛔ §6 AND §7 ARE A RE-DERIVATION OF `#909` (2026-08-26) — INCLUDING ITS CORRECTION
**`RUNNING_ISSUES:4639-4657` already contains, four days before I "found" it:**
- *"**8 of 130 entries diverge, across exactly two bases: `XBT→BTC` and `XDG→DOGE`**"* — **my §7 census, identical, to the number.**
- A **live 661-distinct-base sweep** returning exactly those two — evidence I do not have.
- ⛔⛔ **AND MY §7 "CORRECTION" ITSELF:** *"`XDG/USD → DOGE/USD` is in `KRAKEN_SYMBOL_MAP` and never reaches the fallback ⇒ the class is {XBT, XDG}. **Dogecoin is affected identically and was missed by both of us.**"*
⇒ ★★ **I RE-DERIVED A FOUR-DAY-OLD FINDING, THEN RE-DERIVED ITS ALREADY-RECORDED CORRECTION, AND PRESENTED BOTH AS NEW — in a batch whose Step-1 skill mandates the ledger search precisely to prevent this.** *(§9.5(b-ii): a finding that fails the ledger check becomes a CROSS-REFERENCE, and any new insight is recorded ON the existing issue.)*
✅ **§6 AND §7 ARE HEREBY CROSS-REFERENCES TO `#909`, NOT FINDINGS.**

### 9.3 ⚠️ AND MY POPULATION MAY BE THE WRONG ONE
**The reader's sharpest point, which I had not considered at all:** the other consumer functions in that same file (`toKrakenRest:147`, `toKrakenWS:177`, `isMappable:223`, `getSymbolMappingDetails:349`) **consult `krakenAssetPairsService.resolveAny` — the LIVE AssetPairs fetch (~1,437 pairs, a 20-entry normalisation table that also normalises the QUOTE side)** — while `normalizeInternal` **never calls it**.
⇒ ⛔ **My "130 pairs, 1 changes" silently selected the STATIC map as the population. Nothing establishes that as the right denominator, and the file's own siblings use the other one.** **`wrong-object`, on a denominator, in a measurement I offered as the safety argument.**

### 9.4 ✅ WHAT SURVIVES, AND IT IS THE PART THE BATCH WAS ALWAYS FOR
1. ⭐ **DEFECT A STANDS AND IS UNAFFECTED BY THE LOCK.** `market-scanner.ts` is **not** a locked module. Passing a raw venue name where an internal symbol is expected is wrong at those eight sites regardless of what the resolver would have done.
2. ⭐ **§8's LIVE MEASUREMENTS ARE GENUINELY NEW** — they post-date `#906`/`#909` and one of them REFUTES `#906`: **`XBT/USD` is evaluated today and rejected on `history failed`; Dogecoin appears in ZERO of 362 distinct evaluated pairs.** *(Those came from the runtime, which no prior entry read.)*
3. ✅ **THE RESOLVER CHANGE IS RE-HOMED, NOT ABANDONED:** it needs a **formal directive** per the lock, and `#229` already places the four-normaliser consolidation in **Phase 20**. ⇒ **Langston rules whether this batch gets a directive or whether it waits for `#229`.**

★★ **THE LESSON, AND IT IS THE SAME ONE ALL DAY: I SEARCHED THE LEDGER FOR THE COMPONENT AND NOT FOR THE BEHAVIOUR.** `#909` is titled around the SWEEP, not around `normalizeInternal` — so a symbol-name grep missed it, exactly as `#174` was missed for seven weeks. **Search the behaviour, then the component.**

---

## 10. ✅ SECOND READER #2 — **THE PER-SITE SURVEY IS DONE, AND THE CAUSAL CHAIN NOW CLOSES END-TO-END**

> **REVIEWER:** per-site consumer survey, evidence taken AT THE RECEIVER · **HIT** · re-derived **y** · **all 12 line numbers still match.**

### 10.1 ⭐⭐ THE CHAIN, COMPLETE — AND IT RECONCILES `#906` WITH MY §8 LOG READ
**MEASURED AT `RUNNING_ISSUES:4571`, already in the ledger, against Kraken's live OHLC endpoint:**
| form sent | candles | result |
|---|---:|---|
| **`XBT/USD`** *(the exact wsname the scanner sends)* | **0** | ⛔ **`EQuery:Unknown asset pair`** |
| `BTC/USD` | **721** | ✅ ok |
| `ETH/USD` *(also a wsname)* | **721** | ✅ ok |

⇒ ★★ **KRAKEN'S OWN OHLC ENDPOINT REJECTS KRAKEN'S OWN WSNAME FOR BITCOIN, WHILE ACCEPTING IT FOR ETHEREUM.** **Universe-wide: 2 of 661 bases fail — `XBT` and `XDG`. The two coins in this batch, and only those.**

⇒ ⭐ **THE FULL CAUSAL CHAIN, EVERY LINK EVIDENCED:**
raw wsname sent → **Kraken rejects it** → `getOHLCData` returns 0 candles → `getPairHistoryDays` caches **null** (`kraken.ts:648-653`) → `passesHistoryFilter` **fails closed on null** (*"be conservative & fail"*, `:380-381`) → **`REJECTED XBT/USD: history failed`** *(which §8 observed live today)*.

### 10.2 ⭐⭐⭐ THIS RESOLVES THE CONTRADICTION I FLAGGED IN §8.1
**§8.1 said `#906`'s *"never evaluated"* was stale, because I saw `XBT/USD` evaluated. BOTH ARE TRUE, and the reader found why:**
⛔ **THE HISTORY BRANCHES (`:826-836`, `:993-1002`) HAVE NO `capturePreFilterReject` — while the volume, price and spread branches beside them DO.**
⇒ **A history rejection is NEVER ARCHIVED.** `#906` read `signal_eval_archive` and correctly saw zero rows; I read the runtime log and correctly saw the evaluation.
⇒ ★ **Bitcoin has been evaluated and rejected, INVISIBLY, the whole time. Neither of us was wrong — we read different instruments, and one has a hole exactly where the defect lives.**
⇒ ⛔ **`OBJ-5` IS THEREFORE NOT COSMETIC — the missing archive call is WHY this stayed unexplained for days.**

### 10.3 ✅ THE PER-SITE DISPOSITION — `OBJ-2` DISCHARGED
| site | form | evidence AT THE RECEIVER |
|---|---|---|
| `:698` OHLC prefetch | ⛔ **INTERNAL** | goes verbatim to Kraken REST (`kraken.ts:296`); raw is **measured broken** |
| `:831` / `:994` history | ⛔ **INTERNAL** | same endpoint, same measurement |
| `:762` `setCostMetrics` | ⛔ **INTERNAL** | cache stores the key verbatim (`cost-cache.ts:115`); **every reader looks up internal** |
| `:773` / `:782` dedupe joins | ⛔ **INTERNAL** | pool keys come from `fx5-scanner.ts:1123` `symbol: normalizedSymbol`; trades documented `BASE/QUOTE` |
| `:721`/`:797`/`:850` `dbsCache` | ✅ **EITHER** | function-local Map, **no external reader** |
| `:789` stablecoin regex | ✅ **EITHER** | **provably form-insensitive** — no base or quote in its alphabet has a Kraken alias |
| `:809`/`:816`/`:823` archive | ⚠️ **EITHER in principle** | the column **already holds mixed forms** ⇒ a CONSISTENCY choice |
| `:854` survivor | ⚠️ **tolerates either** | `fx5-scanner.ts:902`/`:989` normalise on arrival |
| `:872`/`:877` `recordScanResult` | ⛔ **N/A — DEAD** | body commented out (`adaptive-scan-manager.ts:306-308`, *"Batch 52: PairFailureTracker recording disabled"*) |

⇒ ✅ **NO SITE BREAKS IF NORMALISED, AND THE INTUITION INVERTS: the only sites that reach the venue are exactly the ones where RAW is measured broken.**

### 10.4 ✅ TWO OF MY OWN OPEN LEADS, CLOSED WITH EVIDENCE
- ⛔ **THE COOLDOWN-BLACKLIST HYPOTHESIS FOR DOGECOIN IS DEAD.** §8.3 left it *"UNRESOLVED, not cleared"*. **`recordScanResult` is a NO-OP — disabled at Batch 52** ⇒ it cannot exclude anything. ✅ *(My "zero FailureTracker lines" was right for the right reason — but the silence could never have shown that, which is why recording it as unresolved was correct.)*
- ⭐ **`:698`'s bare `catch {}` (`:723-725`) SWALLOWS the venue rejection**, so a rejected pair is indistinguishable from a genuinely thin one.

### 10.5 ⚠️ CARRIED FORWARD, NOT FIXED HERE
- **`:658`'s benchmark list is a FOURTH benchmark definition, hedged INCOMPLETELY:** it carries `XBT/USD` **and** `BTC/USD`, but **`XBT/EUR` is missing while `BTC/EUR` is present, and NO Dogecoin spelling appears at all.**
- **`fx5-scanner.ts:1267` spreads `...s` LAST, so the RAW symbol OVERWRITES the normalised one** — how the raw form survives into the pattern pool and the archive.
- ⛔ **`already_active` (`:774`/`:783`) reads a CONSTANT 0** (`routes.ts:7748-7758` never surfaces it, `#5415`) ⇒ **`OBJ-3` MAY NOT BE VERIFIED FROM THAT COUNTER.**

---

## 11. ⛔⛔ THIRD READER — **MY ONE-LINER WAS UNSAFE. GUARDED. And two of its other findings change the review.**

> **REVIEWER:** `object + claim` · the PLACEMENT claim at `827ecb359` · **HIT** · re-derived **y**

### 11.1 ⛔ THE DEFECT IN MY OWN CHANGE — `p.symbol` IS NOT ALWAYS SLASHED
**`market-scanner.ts:564` is `symbol: pairsObj[pairName]?.wsname || pairName`, and `wsname` is OPTIONAL (`kraken-pair-metadata-service.ts:15` `wsname?: string`).** ⇒ **when it is absent, `symbol` is the COMPACT REST KEY (`XXBTZUSD`), not a pair.**
**On non-slashed input `toCanonical` leaves the safe branch entirely:**
- ⛔ **Pattern 1 (`symbol-canonicalizer.ts:188-192`) splits on `lastIndexOf('Z')` ⇒ `XTZUSD` → base `T`, quote `USD` → `T/USD`. SILENTLY WRONG.**
- ⛔⛔ **the `PF_`/`PI_` branch (`:157-166`) can THROW — inside an unguarded `.map` on the scan path, that takes down the cycle.**
- ⛔ **AND MY "the raw form stays recoverable at `pair.pairInfo.wsname`" IS FALSE FOR EXACTLY THOSE ENTRIES** — `wsname` is undefined precisely when this bites.
✅ **FIXED: a slashed-only guard.** A non-slashed entry is now left **byte-identical**, i.e. exactly as it behaves today, so the compact-key path cannot regress. The two target bases are slashed in the venue's own wsname, so the fix still lands.

### 11.2 ⛔ A SECOND BEHAVIOUR DELTA, IN THE OPPOSITE DIRECTION FROM THE ONE I NAMED
**`:805`/`:814` (pool + active-trades membership) and `:698` (benchmark) were comparing a RAW string against INTERNAL-form sets** — `poolSymbols` from `fx5-scanner.ts:990/1418`, `activeTradeSymbols` from the `trades.symbol` DB column.
⇒ ⛔ **BEFORE this change, a Bitcoin pair WITH AN OPEN TRADE was never counted `already_active` and was RE-EVALUATED EVERY CYCLE. After it, that pair is SKIPPED.**
⚠️ **That is a real behaviour change the OHLC measurement cannot see, and my change list named only the benchmark delta. Both go to review.**

### 11.3 ⚠️ THE PLACEMENT ARGUMENT IS WEAKER THAN I WROTE IT — AND THE ALTERNATIVE IS BETTER THAN I ALLOWED
- **"The only point" is true of an INTERVAL, not a point.** The last raw-keyed read is `:614`; the first symbol-consuming read is `:658`. Everything between is comment. **Any line in `(614, 658)` behaves identically.**
- ⭐⭐ **AND THE STRONGER ALTERNATIVE I DID NOT CONSIDER: the VENUE BOUNDARY.** `kraken.ts:296` `const params: any = { pair, interval }` hands the string to Kraken **verbatim, with no resolver**. **One edit there fixes EVERY caller of `getOHLCData`/`getPairHistoryDays`, not just this scanner.** ⇒ **my *"later means N call-site edits"* was false — later at the RIGHT boundary means ONE.**
⛔ **THIS IS A REAL ARCHITECTURAL QUESTION FOR LANGSTON, NOT A DETAIL: fix at the scanner's egress, or at the venue adapter where the string actually leaves us?** *(The scanner fix also corrects the membership joins in 11.2, which a venue-boundary fix would NOT — so they are not equivalent.)*

### 11.4 ⚠️ TWO RESOLVERS ARE NOW CHAINED, AND NOTHING TESTS THE COMPOSITION
`fx5-scanner.ts:990` re-applies `normalizeToInternalSymbol` to output this change already ran `toCanonical` over ⇒ **the effective pipeline is `normalizeToInternalSymbol(toCanonical(x))`.** **The two have DIFFERENT tables and different quote handling** — the resolver leaves the quote untouched (`:73-79`), `toCanonical` maps it (`:122`). **They may agree on every live pair; nothing opened tests it.** ↔ `#229`.

### 11.5 ⚠️ AND THE SUITE DOES NOT GUARD THIS
**No test exercises `collectAdaptiveBatch`'s symbol form** — `server/tests/` references the call site only in a comment. ⇒ **the change is unguarded against regression**, which raises the weight on `OBJ-6`'s live controls.

### 11.6 ✅ WHAT THE READER CONFIRMED
**Exhaustive post-line consumer enumeration: no consumer after the line reads a raw venue field.** The only post-line read of one — `:778 const baseCurrency = pairInfo.base` — is **assigned and never read**. **Idempotency holds.** **The line cannot run twice** (`collectAdaptiveBatch` has exactly one call site). **`pairInfo` is non-undefined for every entry** (filtered at `:568`, `:608`, `:614`) — *the gap is `wsname`, not `pairInfo`.*

---

## 12. ✅ THE PROVENANCE READ — **THE ARCHITECTURE QUESTION IS ANSWERED FROM THE SYSTEM ITSELF. DECIDED, NOT ASKED.**

> ⛔ **Kyle, 2026-08-30: *"Don't put that decision to me… You are looking at the code. You should understand what's happening… You've got readers. You've got Langston. But this is our system. Figure this out."*** ✅ **Correct — an architecture call is not his. Here it is, decided, with citations.**
> ⚠️ **AND THE READ IS WHY I WAS THRASHING. `MANDATORY 1.b` / §9.5(b) require it BEFORE proposing a change; I skipped it and reversed myself five times on a small fix. The rule's own justification says exactly this: skipping the read does not save the cost, it defers it into a more expensive form.**

### 12.1 THE THREE DESIGNATIONS, AND WHY THEY LOOKED CONTRADICTORY
| document | designates | for |
|---|---|---|
| `bridge/canonical/Phase_8_Implementation_History.md` §5.3.7 | **`kraken-symbol-resolver.ts`** | *"Canonical Symbol Mapping (I7) — single authoritative symbol format BASE/QUOTE… dynamic resolution with fallback… bidirectional conversion Kraken ↔ Internal"* |
| `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` §3.1 | **`symbol-canonicalizer.ts`** | *"ensures consistent symbol naming **across all subsystems**, translating between Kraken's exchange format and the canonical BASE/QUOTE format"* |
| `server/utils/symbol-normalize.ts:1-9` *(B79, **"Langston rev 3 §G"**, the newest)* | **itself** | *"**This module is the SINGLE LOOKUP boundary for symbol-form translation**"* — and it names **the scanner** as a consumer |

⇒ ⛔ **THREE modules each designated authoritative, in three documents. That is `#229`'s four-module sprawl seen at its ROOT: the ambiguity is in the founding record, not only in the code.** ★ **And it is why every new fact moved me — I was choosing between boundaries without knowing any of them WAS one.**

### 12.2 ⭐⭐ THE TIE IS BROKEN BY THE NEWEST MODULE ITSELF, IN WRITING
**`symbol-normalize.ts:88-95`, `normalizeCryptoSpot`'s own fall-through:**
> *"Full normalization is in `server/services/utils/symbol-canonicalizer.ts` (legacy module)… For B79 **we don't duplicate the legacy logic — we recommend callers continue to use the legacy canonicalizer for crypto raw forms** while this utility covers display-form → canonical for xstocks."*
> …and its fail-soft message is literally **`'crypto_spot raw form not handled — use server/services/utils/symbol-canonicalizer.ts'`**.

⇒ ✅ **THE SELF-DECLARED SINGLE BOUNDARY EXPLICITLY DELEGATES CRYPTO RAW FORMS TO THE CANONICALIZER.** **That is not an inference — it is the module's own routing instruction, in a Langston-reviewed file.**
⚠️ **AND IT IS DECISIVE ON THE MECHANICS TOO: `XBT/USD` PASSES `CRYPTO_SPOT_CANONICAL` (uppercase `BASE/QUOTE`), so `normalize()` would return it UNCHANGED and NOT fix Bitcoin.** ⇒ **`normalize()` is the wrong tool here, exactly as its own comment says.**

### 12.3 ✅ THE DECISION
⭐ **`toCanonical` (`symbol-canonicalizer.ts`) IS CORRECT FOR THIS BATCH, on three converging citations:** the execution-flow doc designates it for cross-subsystem naming · the newest boundary module routes crypto raw forms to it by name · and it is the only one of the three that handles **both** `XBT→BTC` and `XDG→DOGE`.
⛔ **THE RESOLVER IS NOT THE RIGHT CALL HERE** — it is the Kraken↔internal **mapping** component, it is **LOCKED**, and its slashed branch cannot resolve `XDG`. **Its repair belongs to `#229`'s Phase-20 consolidation, which already owns it.**
✅ **THE IMPLEMENTATION AT `0b18ee530` STANDS UNCHANGED. What changes is that it now rests on cited intent rather than on convenience.**

### 12.4 ⛔⛔ AND THE READ PROMOTED A SIDE-EFFECT INTO AN INVARIANT REPAIR
> ⛔⛔ **WITHDRAWN — THE CITATION IS TO A DEAD LEG. SEE §13.1. The `trades` table holds ZERO rows, so that check never matches for ANY symbol. Do not carry this into the completion report.**
**`bridge/canonical/DawnTrader_System_Invariants_Design_Guarantees.md:30` — *"**INVARIANT T2:** Maximum one open position per symbol at any time. A new trade for symbol X cannot be opened if symbol X already has an open position."***
**The enforcing check is `activeTradeSymbols.has(pair.symbol)` — a RAW venue name tested against a set built from the `trades.symbol` DB column, which is internal form.**
⇒ ⛔⛔ **FOR `XBT` AND `XDG`, THAT TEST CAN NEVER MATCH ⇒ INVARIANT T2 IS CURRENTLY UNENFORCEABLE FOR BITCOIN AND DOGECOIN.**
⇒ ★★ **I had this written up as an incidental second behaviour delta (§11.2). It is not incidental — it is a FOUNDING INVARIANT not holding, and this batch repairs it.** **That is a materially stronger justification than *"two coins do not trade"*, and I only have it because Kyle made me do the read.**

### 12.5 ⚠️ ONE NEW FINDING THE READ SURFACED — RECORDED, NOT FIXED HERE
**The designated path for crypto RAW forms is `toCanonical`, whose non-slashed branch is the one the third reader showed can MANGLE (`XTZUSD → T/USD`) or THROW.** ⇒ **the recommended handler for raw forms is unsafe on exactly the raw forms it is recommended for.**
✅ **This batch is unaffected — the slashed-only guard at `0b18ee530` never enters that branch.** **§9.4 DISPOSITION: added to `#229`'s consolidation, which already owns all four modules.**


---

# 13. ⛔⛔ STEP-4 CORRECTIONS — **TWO OF THIS DOCUMENT'S CLAIMS ARE MEASURABLY FALSE**

> **Langston, at the ref. Appended, not rewritten — the false versions stay visible above with a pointer here, because a claim that is silently deleted teaches nobody and a reader of the old text would never know it moved.**

## 13.1 ⛔⛔ §12.4's INVARIANT-T2 ARGUMENT IS **WITHDRAWN** — IT RESTS ON A TABLE THAT IS EMPTY

`getActiveTrades` reads the **`trades`** table (`storage.ts:1535-1543`). **MEASURED on staging: `trades` = 0 rows** — against the positive controls **`active_open_positions` = 2** and **`closed_trades` = 665**, so the instrument can see rows where rows exist.
⇒ ⛔ **`activeTradeSymbols` is EMPTY FOR EVERY SYMBOL.** The check `activeTradeSymbols.has(pair.symbol)` fails to match for Ethereum exactly as it fails for Bitcoin. **NO SYMBOL-FORM FIX REPAIRS IT** — and there is no Bitcoin open position anywhere, so *"a Bitcoin pair with an open position has been re-evaluated every cycle"* describes nothing that has happened.
⛔⛔ **AND I GAVE THIS TO KYLE AS THE BATCH'S HEADLINE JUSTIFICATION — an invariant repair, *"materially stronger than two coins do not trade."* IT WAS NOT. Withdrawn to him directly, not only here.**
⚠️ **THE THIRD READER HAD FLAGGED IT and I did not act:** it wrote that this dedupe leg *"is fed by the legacy path and test endpoints only — worth establishing before drawing conclusions from it."* **Being told and not checking is worse than not being told.**
✅ **THE PLACEMENT CONCLUSION SURVIVES ON OTHER LEGS — the ones Langston verified independently:** `poolSymbols` (keyed on internal form from `fx5-scanner.ts:1123`), the stablecoin regex, `benchmarkSet`, the `capturePreFilterReject` values, and `evaluatedSymbols`. **None of those is reachable from a venue-boundary fix at `kraken.ts:296`.**
➕ **AND THE REAL FINDING IS BIGGER THAN THIS BATCH: THE SCANNER'S ALREADY-ACTIVE DEDUPE READS A TABLE THE ACTIVE PATH DOES NOT WRITE.** **§9.4 DISPOSITION: its own item — `B-SCANNER-DEDUPE-DEAD-TABLE`, owner CC-C, `RUNNING_ISSUES` #965, placed in `PHASE_19_PLAN.md` at row 3b.j, after 3b.i.**

## 13.2 ⭐⭐ §8.3 IS REFUTED — **DOGECOIN IS EVALUATED 25,294 TIMES IN THREE DAYS**
> ⛔⛔ **AND §13.2 IS ITSELF REFUTED — SEE §14. The 25,294 count is real, but it counts a PREFIX, not the coin: Dogecoin dies at a price floor and Bitcoin dies at the history filter. They are NOT one failure.**

**Population: `signal_eval_archive`, `captured_at > NOW() - '3 days'`, counted by symbol prefix.**
| prefix | rows | |
|---|---:|---|
| **`XDG%`** | **25,294** | ⇒ **Dogecoin reaches evaluation constantly** |
| `DOGE%` | **0** | ⇒ **the archive holds the RAW form ONLY — exactly what an un-normalised scanner writes** |
| `XBT%` *(control)* | 167,215 | |
| `ETH%` *(control)* | 208,584 | |

⇒ ⛔ **MY *"0 of 362 ⇒ Dogecoin never reaches the scanner"* WAS A ONE-ROTATION WINDOW READ AS A UNIVERSE.** `BATCH_SIZE` is 300 against ~660 tradable pairs with rotation, so any single batch misses more than half the universe **and its absence is uninformative.**
⇒ ⭐ **BITCOIN AND DOGECOIN ARE THE *SAME* FAILURE — both reach the venue call carrying a wsname the venue rejects.** **`OBJ-1a`/`OBJ-1b` COLLAPSE BACK INTO ONE OBJECTIVE and the single change covers both.**
✅ **AND THIS IS A STRONGER RESULT THAN THE SPLIT WAS:** one cause, one fix, one observation to verify.
⚠️ **`OBJ-1b`'s instrument is corrected with it — Langston's *"use the universe (`allSymbols` at `market-scanner.ts:589`), not the batch"* is right about the batch being the wrong denominator; the archive is better still, because it is three days deep instead of one cycle.**

## 13.3 ⛔ THE BLAST RADIUS IS **56**, AND `OBJ-6`'s CONTROLS COULD NOT HAVE SEEN THE OTHER 31

**`toCanonical` applies `krakenToStandard` to BOTH slots** (`symbol-canonicalizer.ts:121-122`). **Census of the live payload (1,437 wsnames): 26 base + 31 quote − 1 overlap = 56.** My *"the quote entries are Z-prefixed forms that never appear in a wsname"* is **FALSE** — `XBT` is a quote in 31 pairs.
**Venue-probed: `ADA/XBT` → 0 candles / `EQuery` · `ADA/BTC` → 721.** ⇒ **the 31 BTC-quoted pairs `AAVE/XBT … ZRX/XBT` fail closed today and PASS after this — a third behaviour delta, and the largest.**
✅ **`OBJ-6` AMENDED:** the four existing controls are **all `/USD`** and **structurally cannot observe the quote-slot class.** **`ADA/XBT` is added to the observed set.**
⛔ **AND THE OPEN QUESTION THIS RAISES IS NOT THIS BATCH'S:** nothing here checked whether sizing, friction, Net Expectancy or the guardrails are denominated correctly for a **non-fiat quote**. **§9.4 DISPOSITION: its own item — `B-NONFIAT-QUOTE-DENOMINATION`, owner CC-C, `RUNNING_ISSUES` #966, placed in `PHASE_19_PLAN.md` at row 5.a, after row 5.** ⛔ **Excluding the quote slot is NOT the alternative — it would re-emit a venue-rejecting form.**

## 13.4 ✅ §3.4's "ONE BEHAVIOUR DELTA" IS WRONG — **THERE ARE FOUR**
| # | delta | direction |
|---|---|---|
| **1** | `XBT`/`XDG` pass the history filter instead of failing closed | ✅ **the intended repair** |
| **2** | `:658`'s benchmark list starts matching on the internal form | ⚠️ **repair, but it changes which pairs are benchmarks** |
| **3** | ⭐ **31 BTC-quoted pairs become venue-resolvable for the first time** | ⚠️ **the largest, and unasked** |
| **4** | `setCostMetrics` (`:762`) re-keys the cost cache to internal form | ✅ **repair — every reader already looks up internal** |
➕ **AND A FIFTH THAT IS A CONSEQUENCE OF (1): with the prefetch now resolving, Bitcoin enters `dbsCache`, so it can route onto a different filter profile than it does today.** ⚠️ **That is correct behaviour arriving for the first time — but it IS new behaviour, and calling it "one delta" hid it.**


---

# 14. ⛔⛔ §13.2 IS ITSELF REFUTED — **BITCOIN AND DOGECOIN ARE NOT THE SAME FAILURE, AND I HAVE NOW GOT DOGECOIN WRONG TWICE**

> **Round-2 measurement, with controls. §13.2's collapse stood for one commit and is withdrawn here rather than edited away.**

## 14.1 THE TABLE THAT SETTLES IT — the missing column was the rejection LABEL, on rows I was already counting

**24h, `source='market-scanner'`, by EXACT symbol — not by prefix, which is what hid this:**

| symbol | archive rows | dies at | observed vs threshold |
|---|---:|---|---|
| **`XBT/USD`** | **0** | ⛔ **the history filter** — its branches carry no `capturePreFilterReject`, so the rejection is **never archived** | — |
| **`XDG/USD`** | **545** | ⛔ **`low_price`** | **0.0851 vs 0.25** |
| `ADA/USD` *(control)* | 546 | **`low_price` — the identical gate** | 0.2013 vs 0.25 |
| `ETH/USD` *(control)* | 1,995 | `family_imf_di` — reaches the strategy layer | — |
| `BTC/USD` · `DOGE/USD` | 0 · 0 | the internal forms are not written today — **the batch's premise, confirmed** | — |

⇒ ⛔ **PREFIX COUNTING IS WHAT MISLED ME.** §13.2's `XBT%` = 167,215 rows are `XBT/AUD`, `XBT/CHF`, `XBT/JPY`, `XBT/DAI` and friends — **`XBT/USD` itself contributes ZERO.** I counted a prefix and reported a coin.

## 14.2 ⛔ DOGECOIN IS EXCLUDED BY A **WORKING PRICE FLOOR** — outcome (2), not a defect
**Live `screener_filters`: the active path's `min_price` is `0.25` on every profile except `strong_trend` (`0.001`); VTS's is `0.05`.**
⇒ **Dogecoin at $0.085 clears the VTS floor and fails the active one** — which is exactly why it is everywhere in the learning population and nowhere in active trading.
⇒ **`ADA/USD` failing the same gate at $0.2013 is the control: a coin nobody has ever called broken, excluded by the same rule.**
⇒ ⛔⛔ **THIS BATCH DOES NOTHING FOR DOGECOIN EITHER WAY.** Normalising `XDG/USD` to `DOGE/USD` leaves the price at 0.0851 and the floor at 0.25.

✅ **`OBJ-1b` IS WITHDRAWN — §9.4 disposition 5, carrying the citation that dissolves it.** **`OBJ-1a` — Bitcoin — is the batch, alone and unchanged, and it is a genuine defect with a complete causal chain.**
➕ **REPLACED BY A DECISION, NOT A FIX: `#967` / `B-PRICE-FLOOR-REVIEW`, owner CC-C, placed at plan row 5.b.** ⛔ **Kyle asked for "the fix for Bitcoin and Doge" and half that request has no defect under it. He is told that directly, not left to read it here.**

## 14.3 ★★ THE PATTERN, STATED ONCE — three consequence-claims in one batch, each killed by a query I had not run
| # | I asserted | the query that killed it |
|---|---|---|
| 1 | blast radius = 26 | reading `toCanonical`'s **second** lookup |
| 2 | this repairs INVARIANT T2 | `SELECT count(*) FROM trades` = **0** |
| 3 | the 31 become tradable | their **`low_volume`** rows — 21,574 across 31 of 31 |
| 4 | Bitcoin and Dogecoin are one failure | the **`gate_decision` label** on Dogecoin's own rows |

⛔ **All four are the same move: I established a mechanism, then asserted what it CAUSED without checking the next gate.** ★ **The correction each time cost one query against data already in front of me.**
**MISTAKE: wrong-object [B-SCANNER-EGRESS-NORMALISE] — counted a symbol PREFIX and reported a COIN; the label column that distinguishes them was in the same rows.**
