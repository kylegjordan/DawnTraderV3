# B-XSTOCK-SESSION-TRANSITION — ⛔⛔ WITHDRAWN 2026-08-31, SAME DAY, BY ITS AUTHOR

## THIS SCOPE WAS A REDISCOVERY. THE ANSWER WAS ALREADY ESTABLISHED — IN THIS BATCH'S OWN STEP-1 SCOPE, FOUR DAYS EARLIER, BY ME.

**THE REAL DOCUMENT: `B_XSTOCK_FEED_SANITY_SCOPE.md` (`#943`, plan row 3b.b).** It is 35 KB, it carries `OBJ-1`, `OBJ-2` and `OBJ-3` **ANSWERED DURING STEP 1**, and every question this file spent two reader rounds re-deriving is settled there with a larger population.

⛔ **KYLE CAUGHT IT: *"All this was researched and conclusions formed days ago… the answer was already determined."*** He was right, and I had cited that file's ISSUE (`#943`) repeatedly while never opening the SCOPE.

---

## WHAT WAS ALREADY ESTABLISHED, AND WHICH THIS FILE RE-DERIVED WORSE

**§9.2 — THE MECHANISM, ESTABLISHED: *"THE BID COLLAPSES TO A STUB AND THE MID FOLLOWS IT."*** Each bad mark is **EXACTLY the symbol's MINIMUM mid** over the retained window, to four decimals, on two independent symbols:
| symbol | bid | ask | **mid = THE MARK** | spread | `last` (CORRECT) |
|---|---|---|---|---|---|
| `NOW/USD` | ⛔ **92.50** | 145.00 | **118.7500** | 44.21% | 143.20 |
| `TGT/USD` | ⛔ **48.45** | 163.70 | **106.0750** | ⛔ **108.65%** | 163.18 |
| `WEN/USD` | 7.57 | ⛔ **19.05** | **13.3100** | 86.25% | 8.21 |
⇒ **One side stubs, the other stays near true, both are `> 0` so the mid arm fires, and `(bid+ask)/2` on a 44-109% spread is a number nobody would trade at.** ✅ **`last` is correct throughout.**
★ **This is exactly Kyle's hypothesis — and it was on file before he restated it.**

**§9.4 — SIMULTANEITY:** all three carry their stub book at the same sweep ⇒ **feed-wide, not per-symbol.** Eliminates per-symbol liquidity, staleness and subscription faults.
**§9.5 — THE VALUE IS REAL:** genuinely quoted two-sided book, faithfully archived, faithfully averaged. **The writer, the feed and the arithmetic are all correct.**
**§9.6 — DISPOSITION: rule-24 outcome (2), WORKING AS DESIGNED, DECISION MISSING.** *"Nobody ever decided what the mark should be when the book is not a market."*
**§10 — BOTH row-level identifiers FAIL** (`spread > 20%` catches 29%, `divergence > 5%` catches 26%) — **"a missing-observation problem wearing a threshold problem's clothes."**
**§11 — OBJ-3: IT IS NOT ONE MINUTE.** ⛔ **ZERO stub books in 8,172,799 snaps across the five hours the US market is open.** They appear **only when the underlying is shut** and peak in the hour after extended hours end ⇒ **a structural property of the tokenized book with no arbitrage anchor.**
**§12 — THE `00:15` CONCENTRATION: at that minute 389 of 476 symbols — 82% of the book — go stub at once.** The survivor hypothesis was tested (28.6%) and **superseded**.

---

## WHAT THIS FILE CONTRIBUTED THAT WAS GENUINELY NEW — CARRIED ACROSS, NOT LOST

1. ✅ **KYLE'S DECISION, 2026-08-31** — all four sessions stay open; the anomaly gets handled. **Answers `XSTOCK_PRICING_DECISION_PATH` Q3.** ⇒ folded into `B_XSTOCK_FEED_SANITY_SCOPE.md` §13.
2. ✅ **`#911`'s BLOCKER HAS LIFTED.** §10.2 recorded OBJ-2 as blocked on instrumentation coverage at *"6 xStock rows out of 232"*. **Measured today: 8 of 11 post-deploy closes = 72.7%, against 0 of 234 pre-deploy.** The old figure mixed two eras.
3. ✅ **A harm cut the file did not have:** of 18 xStock `stop_hit` closes inside `00:15`, **16 fill ABOVE their own stop, median +4%** — against a median of **−0.004%** outside it. **No scheduler can make a stop fill above itself**, so this survives the artifact objection the other statistics cannot.

## ⛔ WHAT I GOT WRONG IN THE TWO ROUNDS, RECORDED SO THE COST IS VISIBLE
- **Two false-absence claims in one document** — *"no venue-side four-session enumeration exists"* (it is `SYSTEM_MANUAL.md:12074-12092`, mine, Kyle-directed) and *"no session awareness exists anywhere"* (15 live call sites).
- **A headline true on 1 night of 11**, because I controlled only forward and never backward.
- **A manufactured conflict with audit §14**, resolved with a dilution factor wrong by >10×.
- **"NOT THE SAME STREAM" in capitals**, when `#958` already had it right as one stream sampled twice and `depth-source.ts:96-101` says so in its own header.
- ★★ **AND THE ONE THAT MATTERS: I ran the `§9.5(b-ii)` ledger search and it returned `#943` — I read the ISSUE and never opened the SCOPE FILE OF THE BATCH I WAS RE-SCOPING.** ⇒ **the search is not "does an issue exist"; it is "has this been WORKED".**

**DISPOSITION: §9.4 (5) — WITHDRAWN, carrying the citation that dissolves it. No new batch, no new issue. `#943` / row 3b.b stands unchanged and is the live work.**
