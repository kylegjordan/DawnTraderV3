# B-SCANNER-EGRESS-NORMALISE — CHANGE LIST (Step 4)

**READY AT: `origin/migration/aws-supabase` @ `218dbfb72`** *(code at `0b18ee530`)* · **1 file changed, 1 executable statement** *(the rest is the comment)*
⛔ **SUPERSEDES the `827ecb359` framing: a third reader found that version UNSAFE (§11), and the provenance read Kyle ordered settled the module choice on citations (§12).**
**change-class:** `architecture` *(declared up — see the scope's header; downgrade at will)* · **Owner:** CC-C · **Phase 19, plan row 5**
**Gate for this dispatch: the diff. One ask.**

> ⭐ **CI/tsc:** baseline **384 = 384**, no regressions.
> ⚠️ **Two second readers ran on this batch and both HIT. One of them stopped an edit to a LOCKED module. Their findings are in the scope §9 and §10 and are summarised below — please read them as part of the diff, because they changed what got built.**

---

## 1. THE WHOLE CHANGE
```ts
+ import { toCanonical } from './utils/symbol-canonicalizer.js';
…
+ batch = batch.map(p => ({
+   ...p,
+   symbol: p.symbol?.includes('/') ? toCanonical(p.symbol) : p.symbol,   // slashed-only guard, §8.1
+ }));
  const evaluatedSymbols = batch.map(p => p.symbol);
```
**One statement, at `market-scanner.ts:658`.** Everything else in the diff is the comment explaining why there and not elsewhere.

## 2. ⭐ THE DEFECT, MEASURED AT THE LIVE VENUE — NOT ARGUED
`RUNNING_ISSUES:4571`:
| form sent | candles | result |
|---|---:|---|
| **`XBT/USD`** *(what the scanner was sending)* | **0** | ⛔ **`EQuery:Unknown asset pair`** |
| `BTC/USD` | 721 | ✅ |
| `ETH/USD` *(also a wsname)* | 721 | ✅ |
⇒ **Kraken's OHLC endpoint rejects Kraken's OWN wsname for Bitcoin while accepting it for Ethereum. 2 of 661 bases: `XBT`, `XDG`.**
**Chain:** raw wsname → venue rejects → 0 candles → `getPairHistoryDays` caches `null` (`kraken.ts:648-653`) → `passesHistoryFilter` fails **closed** on null (`:380-381`) → **`REJECTED XBT/USD: history failed`**, observed live 2026-08-30T14:15Z.

## 3. ⛔ THE JUDGEMENT CALLS I WANT ATTACKED

1. ⛔ **PLACEMENT — SEE §8.4, WHICH CORRECTS THIS ITEM.** Earlier genuinely breaks things (the `pairInfo` join at `:600` and the refill dedupe at `:611` key on the RAW wsname). ⛔ **But my "later means N call-site edits" WAS FALSE — one edit at `kraken.ts:296` would fix every caller.** **The real argument for the scanner is that a venue-boundary fix would NOT repair the membership joins, leaving INVARIANT T2 broken (§8.2). Attack that.**
2. ⛔ **`toCanonical`, NOT `normalizeToInternalSymbol`, AND THE DIFFERENCE IS DOGECOIN.** The resolver's slashed branch (`kraken-symbol-resolver.ts:94-99`) short-circuits on a **one-entry** table `{XBT:BTC}` and never reads its own `mapByWsPair`, so it returns `XDG/USD` unchanged. `toCanonical` carries **both** `XBT→BTC` and `XDG→DOGE`.
3. ✅ **THE RESOLVER IS LEFT ALONE, AND THAT IS DECIDED, NOT ASKED (§8.3).** It is 🔒 LOCKED (*"changes require a formal directive"*, `:1-6`), it cannot resolve `XDG`, and `#229` already homes its repair to **Phase 20**. **A reader caught me proposing to edit it; I have not.** ⛔ **No directive is requested — `#229` owns it.**
4. ⚠️ **ONE BEHAVIOUR DELTA, NAMED NOT ABSORBED:** the scanner's LOCAL benchmark list (`:658`… `['BTC/USD','ETH/USD','SOL/USD','XBT/USD','BTC/EUR','ETH/EUR']`) carries **`XBT/USD` AND `BTC/USD`**, but **`XBT/EUR` is absent while `BTC/EUR` is present.** ⇒ **after normalisation `XBT/EUR` matches as a benchmark where it did not before.** I judge that a strict improvement over a list that plainly intends it — **but it is a change and it is yours to accept.** *(It is also a FOURTH benchmark definition; `#229`-adjacent, not fixed here.)*

## 4. ✅ BLAST RADIUS — MEASURED, AND SMALLER THAN THE CALL-SITE COUNT SUGGESTS
- **`toCanonical`'s base table changes only `XBT` and `XDG`.** `XLM`/`XRP`/`XTZ` are **identity** entries; its quote entries are **Z-prefixed** forms that never appear in a wsname.
- **Idempotent** — `toCanonical(toCanonical(x)) === toCanonical(x)` for every slashed form *(replicated against the branch's logic, not called live — stated as such)*.
- ⛔ **CORRECTED (§8.1): "the raw form stays recoverable at `pair.pairInfo.wsname`" IS FALSE for `wsname`-absent entries — it is undefined precisely when it would be needed.** The guard makes this moot: those entries are no longer touched.
- ⚠️ **`evaluatedSymbols` LEAVES the function** (`:436` type, `:1070` return) into `fx5-24h-window.ts:196`, where it feeds a **deduplicated COUNT** (`uniqueEvaluated = evaluatedSet.size`), not a join. ⇒ **TRANSIENT, BOUNDED, COSMETIC: a 24-hour window spanning the deploy holds BOTH spellings for the two bases and counts them as two distinct symbols for ≤24h.** **Named so it is not later mistaken for a defect.**

## 5. ✅ WHAT THE SECOND READERS CHANGED — because it is material to reviewing this
- ⛔ **Reader 1 stopped an edit to a locked module**, and showed my §6/§7 "findings" were a **re-derivation of `#909` (2026-08-26)** — the same 8-of-130 census, the same `{XBT, XDG}` class, **including the correction I thought I was making.** ⇒ **Recorded as CROSS-REFERENCES, not findings.**
- ⛔ **Reader 1 also holed my safety measurement:** "130 pairs, 1 changes" silently picked the **static** map as the population, while the file's own siblings consult the **live AssetPairs fetch (~1,437 pairs)**. **Wrong-object on a denominator.**
- ⭐ **Reader 2 closed the causal chain and reconciled two contradictory records:** the history branches (`:826-836`, `:993-1002`) have **NO `capturePreFilterReject`** while the volume/price/spread branches beside them do ⇒ **a history rejection is never archived.** `#906` read the archive and saw zero; I read the log and saw the evaluation. **Both correct — different instruments, one with a hole exactly where the defect lives.**
- ⭐ **Reader 2 killed my own Dogecoin theory with evidence:** `recordScanResult` is a **no-op** (`adaptive-scan-manager.ts:306-308`, *"Batch 52: PairFailureTracker recording disabled"*) ⇒ the cooldown blacklist cannot be excluding anything.

## 6. ⛔ WHAT THIS DOES NOT DO
1. ⛔ **`OBJ-5` (the missing `capturePreFilterReject` on the history branches) IS NOT IN THIS DIFF, AND THAT IS DELIBERATE.** It is the reason the defect stayed invisible, and it is owed — **but it changes what gets WRITTEN to `signal_eval_archive`, which is a different blast radius from a symbol form.** ⇒ **it lands as its own change, after this one verifies.** ⛔ **Say so if you disagree; I am not asking, I am declaring.**
2. ⛔ **It does not touch the LOCKED resolver, `BENCHMARK_SYMBOLS`, or any filter threshold.** A Bitcoin that is now evaluated and then rejected on **liquidity** is a **PASS** here — that is `#906` objective 1.
3. ⛔ **It does not explain Dogecoin's total absence from evaluation.** `XDG` fails the same venue call, but Dogecoin appears in **0 of 362** distinct evaluated pairs, so it is not reaching the scanner at all. **Stated as OPEN.**

## 7. ✅ VERIFICATION — FUNCTIONAL, SAME-DAY, NO SOAK
> **Kyle, 2026-08-30:** *"If we see the functionality works for a few, we see it for them all."* **Per-assertion test applied: both of these are code-path facts, not rates.**
- **`OBJ-1a` Bitcoin:** `XBT/USD` stops being rejected on `history failed`. **One log line settles it.**
- **`OBJ-1b` Dogecoin:** a `DOGE/`-base pair APPEARS in the evaluated set. **One line settles it.** ⚠️ **May FAIL — see §6.3; that would be a real result, not a delay.**
- **`OBJ-6` controls:** XRP, SUI, LINK, ADA still evaluated, and **still rejecting on VOLUME rather than history** — ⛔ **a control shifting to `history failed` is an unmistakable regression.**
- ⛔ **`OBJ-3` may NOT be verified from the `already_active` counter** — it reads a constant 0 (`routes.ts:7748-7758`, `#5415`).


---

## 8. ⛔⛔ WHAT CHANGED AFTER THE FIRST DISPATCH — READ THIS BEFORE THE DIFF

### 8.1 ⛔ MY FIRST VERSION WAS UNSAFE. GUARDED.
`p.symbol` is **NOT always slashed** — `:564` is `pairsObj[pairName]?.wsname || pairName` and `wsname` is **optional** (`kraken-pair-metadata-service.ts:15`). On a non-slashed input `toCanonical` leaves its safe branch: **Pattern 1 (`:188-192`) splits on `lastIndexOf('Z')` ⇒ `XTZUSD → T/USD`, silently wrong**, and the `PF_` branch (`:157-166`) **can THROW inside an unguarded `.map` on the scan path.** ⇒ ✅ **slashed-only guard added; a non-slashed entry is now byte-identical to today.**
⛔ **AND MY "the raw form stays recoverable at `pair.pairInfo.wsname`" WAS FALSE** for exactly those entries — `wsname` is undefined precisely when it bites.

### 8.2 ⭐⭐ THE JUSTIFICATION IS STRONGER THAN "TWO COINS DO NOT TRADE" — **INVARIANT T2 IS NOT HOLDING**
`bridge/canonical/DawnTrader_System_Invariants_Design_Guarantees.md:30` — ***"INVARIANT T2: Maximum one open position per symbol at any time."***
**Its enforcing test is `activeTradeSymbols.has(pair.symbol)` — a RAW venue name against a set built from the `trades.symbol` DB column, which is internal form.** ⇒ ⛔ **for `XBT`/`XDG` it can never match ⇒ T2 IS CURRENTLY UNENFORCEABLE FOR BITCOIN AND DOGECOIN, and a Bitcoin pair with an open position has been re-evaluated every cycle.** ✅ **This batch repairs a founding invariant.**

### 8.3 ✅ THE MODULE CHOICE IS DECIDED, ON THREE CITATIONS — NOT PUT TO YOU AS A QUESTION
⚠️ **Three modules are each designated authoritative in three documents** *(Phase-8 history → the resolver; execution-flow §3.1 → the canonicalizer; `symbol-normalize.ts:9` → itself)*. **That is `#229` at its root: the ambiguity is in the founding record.**
⭐ **THE TIE IS BROKEN BY THE NEWEST MODULE, IN WRITING.** `symbol-normalize.ts:88-95` fails soft with **`'crypto_spot raw form not handled — use server/services/utils/symbol-canonicalizer.ts'`** and states *"we recommend callers continue to use the legacy canonicalizer for crypto raw forms."* **And mechanically `normalize()` cannot do this job: `XBT/USD` passes its canonical regex and comes back unchanged.**
⇒ ✅ **`toCanonical` it is. The resolver stays untouched — locked, cannot resolve `XDG`, and homed to `#229`'s Phase-20 consolidation.**

### 8.4 ⛔ THE PLACEMENT ARGUMENT I GAVE YOU WAS PARTLY FALSE — HERE IS THE HONEST VERSION
- **"The only point" is true of an INTERVAL `(614, 658)`, not a point** — everything between is comment.
- ⛔ **"Later would need N call-site edits" IS FALSE.** `kraken.ts:296` hands the string to Kraken **verbatim, no resolver** ⇒ **one edit at the venue boundary would fix every caller of `getOHLCData`/`getPairHistoryDays`.**
- ⚠️ **THEY ARE NOT EQUIVALENT, and that is the real argument for the scanner: a venue-boundary fix does NOT repair the membership joins in §8.2, so it would leave INVARIANT T2 broken.** ⛔ **That is my reasoning; attack it.**

### 8.5 ⚠️ CARRIED, NOT FIXED
- **The designated handler for crypto RAW forms (`toCanonical`) is unsafe on raw forms** (§8.1). **Filed to `#229`.** This batch avoids it via the guard.
- **Two resolvers now compose** — `normalizeToInternalSymbol(toCanonical(x))` at `fx5-scanner.ts:990` — different tables, different quote handling, **untested composition.** `#229`.
- ⛔ **NO TEST exercises this function's symbol form.** The suite does not guard the change ⇒ **all the weight is on `OBJ-6`'s live controls.**
