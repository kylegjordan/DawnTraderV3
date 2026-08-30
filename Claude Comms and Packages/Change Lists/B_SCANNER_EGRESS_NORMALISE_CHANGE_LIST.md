# B-SCANNER-EGRESS-NORMALISE — CHANGE LIST (Step 4)

**READY AT: `origin/migration/aws-supabase` @ `827ecb359`** · **1 file, +32 / −0** *(30 of the 32 lines are the comment)*
**change-class:** `architecture` *(declared up — see the scope's header; downgrade at will)* · **Owner:** CC-C · **Phase 19, plan row 5**
**Gate for this dispatch: the diff. One ask.**

> ⭐ **CI/tsc:** baseline **384 = 384**, no regressions.
> ⚠️ **Two second readers ran on this batch and both HIT. One of them stopped an edit to a LOCKED module. Their findings are in the scope §9 and §10 and are summarised below — please read them as part of the diff, because they changed what got built.**

---

## 1. THE WHOLE CHANGE
```ts
+ import { toCanonical } from './utils/symbol-canonicalizer.js';
…
+ batch = batch.map(p => ({ ...p, symbol: toCanonical(p.symbol) }));
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

1. ⛔ **PLACEMENT — one point, not eight.** `:658` is the only spot where `batch` is FINAL and UNCONSUMED. **Earlier breaks things:** the ticker/`pairInfo` join at `:600` and the refill dedupe at `:611` both key on the RAW wsname against `allPairs`. **Later means N call-site edits — a second convention to keep in step (`#641`).** ⛔ **If you think a per-site edit is safer despite that, say so — it is the one structural choice here.**
2. ⛔ **`toCanonical`, NOT `normalizeToInternalSymbol`, AND THE DIFFERENCE IS DOGECOIN.** The resolver's slashed branch (`kraken-symbol-resolver.ts:94-99`) short-circuits on a **one-entry** table `{XBT:BTC}` and never reads its own `mapByWsPair`, so it returns `XDG/USD` unchanged. `toCanonical` carries **both** `XBT→BTC` and `XDG→DOGE`.
3. ⛔ **AND THE RESOLVER IS A 🔒 LOCKED MODULE** — *"changes require a formal directive"* (`:1-6`), with its consolidation already homed to **Phase 20** by `#229`. **A reader caught me proposing to edit it. I have not.** ⇒ **Do you want a directive raised for it, or does it wait for `#229`?**
4. ⚠️ **ONE BEHAVIOUR DELTA, NAMED NOT ABSORBED:** the scanner's LOCAL benchmark list (`:658`… `['BTC/USD','ETH/USD','SOL/USD','XBT/USD','BTC/EUR','ETH/EUR']`) carries **`XBT/USD` AND `BTC/USD`**, but **`XBT/EUR` is absent while `BTC/EUR` is present.** ⇒ **after normalisation `XBT/EUR` matches as a benchmark where it did not before.** I judge that a strict improvement over a list that plainly intends it — **but it is a change and it is yours to accept.** *(It is also a FOURTH benchmark definition; `#229`-adjacent, not fixed here.)*

## 4. ✅ BLAST RADIUS — MEASURED, AND SMALLER THAN THE CALL-SITE COUNT SUGGESTS
- **`toCanonical`'s base table changes only `XBT` and `XDG`.** `XLM`/`XRP`/`XTZ` are **identity** entries; its quote entries are **Z-prefixed** forms that never appear in a wsname.
- **Idempotent** — `toCanonical(toCanonical(x)) === toCanonical(x)` for every slashed form *(replicated against the branch's logic, not called live — stated as such)*.
- **The raw form stays recoverable** at `pair.pairInfo.wsname`.
- ⚠️ **`evaluatedSymbols` LEAVES the function** (`:436` type, `:1070` return) into `fx5-24h-window.ts:196`, where it feeds a **deduplicated COUNT** (`uniqueEvaluated = evaluatedSet.size`), not a join. ⇒ **TRANSIENT, BOUNDED, COSMETIC: a 24-hour window spanning the deploy holds BOTH spellings for the two bases and counts them as two distinct symbols for ≤24h.** **Named so it is not later mistaken for a defect.**

## 5. ✅ WHAT THE SECOND READERS CHANGED — because it is material to reviewing this
- ⛔ **Reader 1 stopped an edit to a locked module**, and showed my §6/§7 "findings" were a **re-derivation of `#909` (2026-08-26)** — the same 8-of-130 census, the same `{XBT, XDG}` class, **including the correction I thought I was making.** ⇒ **Recorded as CROSS-REFERENCES, not findings.**
- ⛔ **Reader 1 also holed my safety measurement:** "130 pairs, 1 changes" silently picked the **static** map as the population, while the file's own siblings consult the **live AssetPairs fetch (~1,437 pairs)**. **Wrong-object on a denominator.**
- ⭐ **Reader 2 closed the causal chain and reconciled two contradictory records:** the history branches (`:826-836`, `:993-1002`) have **NO `capturePreFilterReject`** while the volume/price/spread branches beside them do ⇒ **a history rejection is never archived.** `#906` read the archive and saw zero; I read the log and saw the evaluation. **Both correct — different instruments, one with a hole exactly where the defect lives.**
- ⭐ **Reader 2 killed my own Dogecoin theory with evidence:** `recordScanResult` is a **no-op** (`adaptive-scan-manager.ts:306-308`, *"Batch 52: PairFailureTracker recording disabled"*) ⇒ the cooldown blacklist cannot be excluding anything.

## 6. ⛔ WHAT THIS DOES NOT DO
1. ⛔ **`OBJ-5` (the missing `capturePreFilterReject` on the history branches) IS NOT IN THIS DIFF.** It is the reason the defect stayed invisible and it is owed — **I want your call on whether it lands here or as its own change**, since it alters what gets archived.
2. ⛔ **It does not touch the LOCKED resolver, `BENCHMARK_SYMBOLS`, or any filter threshold.** A Bitcoin that is now evaluated and then rejected on **liquidity** is a **PASS** here — that is `#906` objective 1.
3. ⛔ **It does not explain Dogecoin's total absence from evaluation.** `XDG` fails the same venue call, but Dogecoin appears in **0 of 362** distinct evaluated pairs, so it is not reaching the scanner at all. **Stated as OPEN.**

## 7. ✅ VERIFICATION — FUNCTIONAL, SAME-DAY, NO SOAK
> **Kyle, 2026-08-30:** *"If we see the functionality works for a few, we see it for them all."* **Per-assertion test applied: both of these are code-path facts, not rates.**
- **`OBJ-1a` Bitcoin:** `XBT/USD` stops being rejected on `history failed`. **One log line settles it.**
- **`OBJ-1b` Dogecoin:** a `DOGE/`-base pair APPEARS in the evaluated set. **One line settles it.** ⚠️ **May FAIL — see §6.3; that would be a real result, not a delay.**
- **`OBJ-6` controls:** XRP, SUI, LINK, ADA still evaluated, and **still rejecting on VOLUME rather than history** — ⛔ **a control shifting to `history failed` is an unmistakable regression.**
- ⛔ **`OBJ-3` may NOT be verified from the `already_active` counter** — it reads a constant 0 (`routes.ts:7748-7758`, `#5415`).
