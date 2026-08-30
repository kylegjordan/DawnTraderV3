# B-SCANNER-EGRESS-NORMALISE — COMPLETION REPORT

**Batch:** `B-SCANNER-EGRESS-NORMALISE` (`#906`) · **Owner:** CC-C (Claude Analyst) · **Phase 19, plan row 5**
**change-class**: architecture
**Deployed:** `fd81ce18cf6cdec6feb23b44b1bbdd03a67d9630` at **2026-08-30T16:36:32Z**, restart #586 · **CI 4/4 green** (run `33322557313`) · **Langston APPROVED at the ref**
**Status:** ✅ **CLOSED same-day on functional verification — NO observation window** *(the reasoning for that is §6, and it is the part most worth arguing with)*

---

## 1. WHAT THIS BATCH WAS FOR

**Bitcoin and Dogecoin had never been traded.** Not "rarely" — never, in any lane, for the life of the scanner.

The market scanner built its candidate list from Kraken's own `wsname` field and passed that string, unchanged, all the way to the venue. **Kraken's OHLC endpoint rejects Kraken's own wsname for exactly two bases:**

| form sent | candles returned |
|---|---|
| `XBT/USD` | **0 — `EQuery:Unknown asset pair`** |
| `XDG/USD` | **0 — `EQuery:Unknown asset pair`** |
| `BTC/USD` · `DOGE/USD` · `ETH/USD` · `ADA/USD` | **721** |

The empty result cached as `null` (`kraken.ts:648-653`), `passesHistoryFilter` failed closed on null by design (*"be conservative & fail"*, `:380-381`), and both coins were rejected on every scan. **Universe-wide, 2 of 661 bases fail this way, and they are the two coins in this batch.**

---

## 2. WHY IT SURVIVED SO LONG — IT WAS INVISIBLE TWICE OVER

This is the part worth keeping, because the defect was not subtle; the *instrument* was.

1. **The history-filter branches carry no `capturePreFilterReject` at all**, while the volume, price and spread branches beside them do. **A history rejection is never archived.**
2. **Every capture call is gated `!isPassiveLearning`** (`:900`, `:907`, `:914`, `:1055`, `:1063`, `:1071`, `:1079`). **The VTS lane is never archived under any circumstance.**

⇒ `#906` read `signal_eval_archive`, correctly saw zero rows, and concluded *"never evaluated."* The runtime log correctly showed the evaluation happening. **Both readings were right, about different instruments — and one had a hole exactly where the defect lived.**

---

## 3. WHAT SHIPPED

**Two executable changes, in one file.**

**(a) The normalisation — `market-scanner.ts:712-715`,** at the one point where the batch is final and unconsumed:
```ts
batch = batch.map(p => ({
  ...p,
  symbol: p.symbol?.includes('/') ? toCanonical(p.symbol) : p.symbol,
}));
```
- **`toCanonical`, not the resolver.** `kraken-symbol-resolver.ts` is a 🔒 LOCKED MODULE, and its slashed branch short-circuits on a table holding only `{XBT:BTC}` — it would have fixed Bitcoin and left Dogecoin broken. Its consolidation is `#229`/Phase 20.
- **Slashed-only guard**, found by a second reader: `wsname` is optional (`kraken-pair-metadata-service.ts:15`), and the REST-key fallback would enter `toCanonical`'s non-slashed branch, which can mangle (`XTZUSD → T/USD`) or throw.
- **Placement.** Earlier is unsafe — the ticker/`pairInfo` join at `:600` and the refill dedupe at `:611` both key on the raw form. Later is insufficient: one edit at `server/exchanges/kraken/kraken.ts:296` *would* fix every venue caller, but a venue-boundary fix cannot repair the membership and archive legs (`poolSymbols`, the stablecoin regex, `benchmarkSet`, the `capturePreFilterReject` values, `evaluatedSymbols`), none of which reach that call.

**(b) The guard — `:889`.** The B63.3 strong-DBS bypass now additionally requires a non-BTC quote. §4 is why.

---

## 4. THE GUARD — THE RISK THIS BATCH CREATED, AND WHY IT IS THE MOST IMPORTANT THING HERE

`toCanonical` applies one translation map to **both** slots of a slashed pair (`:121-122`). The `// Base currencies` / `// Quote currencies` headings in that table are comments, not structure. **Census of the live AssetPairs payload (1,437 wsnames): 26 base + 31 quote − 1 overlap (`XDG/XBT`) = 56 changed** — not the 26 the scope claimed.

**The 31 are the BTC-quoted pairs `AAVE/XBT … ZRX/XBT`**, and they fail closed today exactly as `XBT/USD` does (`ADA/XBT` → `EQuery`, `ADA/BTC` → 721).

⛔ **The normalisation sits ABOVE the B63.3 DBS prefetch** (`getOHLCData` at `:789`). So post-fix those 31 gain OHLC, gain a DBS score, and **any score ≥ 0.35 routes onto `active_strong_trend` — whose live thresholds are `minVolume` 0.00, `minPrice` 0.001, `minHistoryDays` 5.**

**Measured: ≥8 of the 31 clear a 0.001 BTC price floor** — WBTC .9995, TBTC .98004, PAXG .0564, ETH .0318, XMR .0064, BCH .0032, AAVE .0016, SOL .00135. **`TBTC/XBT` carries ~0.001 BTC ≈ $110 of 24h volume against a volume floor of ZERO.**

**The guard is not a units fix.** It refuses a gate **bypass** to pairs whose money gates are denominated wrong: `:820` computes `volume24hCoins * currentPrice` where `currentPrice` is the price *in the quote currency*, and the comment two lines above states the invariant it breaks — *"All filter thresholds are in USD. Must compare like units."* **A zero-volume bypass is only safe if the thing bypassed was measuring the right quantity.**

**The predicate is exactly `{BTC, XBT}`, and that is provable rather than cautious:** the only entry that can appear in a slashed wsname's quote slot is `XBT → BTC`; every other quote entry is a Z/X-prefixed REST form that never appears slashed. **Broadening it would NOT have been conservative** — EUR alone is 534 distinct symbols / 554,317 rows already taking that path, so denying it to them is a live behaviour change with no measurement behind it. The general question is `#966`.

⇒ **Standing invariant, recorded as System Manual B63.6:** *a filter BYPASS may only be granted where the bypassed filter was measuring the quantity it claims to measure. Unlocking a code path introduces every action that path can take.*

---

## 5. VERIFICATION — TWO-SIDED, AT THE DEPLOY BOUNDARY

**The pre-side was captured at 16:34:14Z, BEFORE deploying — not reconstructed afterwards.** `source='market-scanner'` throughout.

| population | PRE (24h) | POST (`captured_at >` deploy) |
|---|---|---|
| `XBT/%` | 65,268 rows / 12 syms | **0** |
| **`BTC/%`** | **ABSENT** | **126 / 11** |
| `XDG/%` | 8,738 / 8 | **0** |
| **`DOGE/%`** | **ABSENT** | **16 / 8 — all eight wsnames** |
| `%/XBT` | 42,098 / 30 | **0** |
| **`%/BTC`** | **ABSENT** | **94 / 30** |
| `ETH/%` *(control)* | 51,546 / 11 | **present** |
| `SOL/%` *(control)* | 32,702 / 6 | **present** |

**Every internal form was cleanly absent pre-deploy, which is what makes this two-sided rather than a one-way appearance argument.**

**The leg the archive structurally cannot show:** zero `XBT/USD` history rejections post-deploy, and `BTC/USD` reaching the guardrail check **with a strategy assigned** — `[C5-GUARDRAIL-CHECK] OBSERVED {"symbol":"BTC/USD","strategy":"morning_star","mode":"paper"}` at 16:37:26.
⛔ **CORRECTED BY LANGSTON, AND THE WEAKER CLAIM IS THE TRUE ONE: I wrote *"zero history rejections for ANY symbol."* THAT IS FALSE.** His window held 7 (`DGAI/USD` ×4, `LIGHTER/USD` ×3); mine holds `LIGHTER/USD`. **They are genuine thin-history new listings — the filter working.** ✅ **The correct claim is *zero history rejections carrying an INTERNAL symbol form*, and the finding survives intact on it. I did not need the stronger version and should not have reached for it.**

**★ A SECOND, INDEPENDENT INSTRUMENT — which I failed to cite and Langston supplied.** The `[DIAG_PATTERN]` pass logged **`REJECTED XBT/USD: history failed` 73× pre-deploy**. Post-deploy that pass is **demonstrably alive** — 1,362 lines in my window, 10,623 / 1,437 distinct pairs in his, a **passing positive control** — and is now evaluating `BTC/USDT`, `BTC/JPY`, `BTC/CHF` with **zero `XBT/`-form pairs.** Two instruments, same flip, one of them with its liveness proven.

**The guard — and my first evidence for it was worthless, which is the most important correction in this report.**
⛔⛔ **I OFFERED *"`%/BTC` rows carrying `threshold = 0`: ZERO."* THAT MEASUREMENT IS UNPRODUCIBLE BY CONSTRUCTION.** `strong_trend.minVolume` is `0.00`, so `volume24h < 0` is never true and **no `low_volume` row can EVER carry threshold 0 — whether the guard works or not.** ★ **Zero was the only answer that instrument could return: a rule-29(b) positive-control failure, and precisely the pattern already in my own memory — *a control that cannot fire is the defect it guards.* I wrote the fence and then proved it with a check that could not fail.**
✅ **THE DISCRIMINATING MEASUREMENT RUNS THE OTHER WAY, and it is a PRESENCE claim, not an absence one:** a pair **on** the bypass has `activeMinVolume = 0` and therefore **cannot emit a 500000 row at all.** So a 500000 row is positive proof that symbol was on the STANDARD profile.
**Per-symbol census, re-derived here: `%/BTC` distinct symbols carrying a `low_volume` row at threshold 500000 = **31**. Total distinct `%/BTC` symbols = **31**. ⇒ 31 of 31, complete, producible, two-sided.** *(Langston's independent count agrees.)*
⛔ **AND WHAT THAT STILL DOES NOT SHOW — recorded so nobody claims it later: THE GUARD IS UNEXERCISED.** No BTC-quoted symbol reached DBS ≥ 0.35 post-deploy, so `!quoteIsNonUsdCrypto` **has never actually blocked anything.** It is accepted **on inspection** — one conjunct at `:889`, reached because `:714` runs above it. **Nobody may cite live silence as proof the guard fires; that is invocation, leg 3 of `#661`.**

**Dogecoin in the active lane** now dies at `pattern_low_price` / `low_volume` / `low_price` — the working 0.25 floor, which is `#967` and Kyle's decision.

⚠️ **Two residual `XBT/`-matching lines in my grep are `AIXBT/EUR` — a coin whose name CONTAINS "XBT". Substring, not residue.** *(A matching name is not a matching thing, in the batch that is about exactly that.)*
⚠️ **And one genuine `XBT/` line survives post-deploy: `[RotationAudit] First 10 rotational: … XBT/AUD, XBT/AUSD …` — `adaptive-scan-manager.ts:225`, which is UPSTREAM of the `:714` seam. Pre-seam by design, not residue.** Recorded because a future verifier will grep for `XBT/` and find it.

---

## 6. WHY THIS CLOSED WITHOUT AN OBSERVATION WINDOW

⛔ **NOT for the reason I first gave.** I argued *"a code path — a few examples settle it,"* and Langston refused to ratify that wording: **it is too loose a licence to hand yourself.**
✅ **THE ACTUAL REASON IS THAT THE PER-SYMBOL CENSUS IS SATURATED.** `%/BTC` **31 of 31** distinct symbols · `DOGE/` **8 of 8** wsnames · `BTC/` **11 of 11** · the pre-side **cleanly absent** · controls present on both sides · **and the same flip reproduced on a second instrument whose liveness passes its own control.**
⇒ ★★ **THERE IS NO MEMBER OF THE AFFECTED POPULATION LEFT UNOBSERVED. A window buys nothing because the population is EXHAUSTED — not because code paths are cheap to verify.**

⛔ **WHAT I AM NOT CLAIMING, and the instrument reason.** `vts_open_trades` showed **0 post-deploy opens for ANY symbol**, against a cadence of 39 opens / 24h across 27 distinct symbols from a ~660-pair universe. **That instrument had zero opportunity to show Dogecoin, so its silence is evidence of nothing and is cited in neither direction** (`#453`).

**Attaching a *"a Dogecoin VTS trade appears"* criterion would have been a RATE criterion bolted onto a code-path repair** — the exact over-strictness converted at F-G-1, and the thing Kyle objected to when he asked why everything needs a soak.

**Deferred and stated: `OBJ-5`.** History rejections are still never archived. ⇒ **nobody may cite the archive for or against the history leg until that lands.**

⚠️ **VERIFIER TRAP, recorded because it will bite someone:** `capturePreFilterReject` writes the **post-normalise** symbol (`:934`), so the `LIKE '%/XBT'` predicate that produced the pre-deploy baseline **returns ZERO after deploy — that is the batch working.** Always anchor on `'%/BTC' OR '%/XBT'` with the split at the deploy boundary.

---

## 7. FIVE OF MY OWN CLAIMS WERE KILLED IN REVIEW

Recorded in full because the pattern is more useful than the fix.

| # | I asserted | killed by |
|---|---|---|
| 1 | blast radius = 26 | `toCanonical`'s **second** lookup — one map, both slots ⇒ **56** |
| 2 | this repairs **INVARIANT T2** | `SELECT count(*) FROM trades` = **0** — the dedupe reads a table nothing writes |
| 3 | the 31 **become tradable** | their `low_volume` rows — 21,574 across 31/31, above the changed line |
| 4 | Bitcoin and Dogecoin are **one failure** | the `gate_decision` **label** on Dogecoin's own rows |
| 5 | this batch **does nothing for Dogecoin** | **the `!isPassiveLearning` gate on the instrument itself** |

★ **1-4 were queries I did not run. 5 is the one to remember: I ran a query the instrument STRUCTURALLY COULD NOT ANSWER and read its output as the answer.**
⇒ **Not one of the five would have been caught by re-reading my own work. Every one needed a different reader or a different instrument.**
**I also told Kyle (2) as the batch's headline justification and (4) as its simplification. Both were corrected to him directly, not only here.**

**MISTAKE: silence-not-evidence [B-SCANNER-EGRESS-NORMALISE]** — read a lane-gated archive as evidence about the lane it cannot observe.
**MISTAKE: wrong-object [B-SCANNER-EGRESS-NORMALISE]** — counted a symbol PREFIX and reported a COIN.

---

## 8. WHAT THIS BATCH SPAWNED — each named, owned and PLACED

| issue | batch | placed at | what it is |
|---|---|---|---|
| **`#965`** | `B-SCANNER-DEDUPE-DEAD-TABLE` | plan row **3b.j** | the already-active dedupe reads `trades`, which holds **0 rows**. **First job is to find where INVARIANT T2 is actually enforced — not to fix the dead check.** |
| **`#966`** | `B-NONFIAT-QUOTE-DENOMINATION` | plan row **5.a** | the volume and price gates are denominated in the **quote** currency against USD-shaped constants. **The error is NOT uniformly conservative: BTC overstates (fail-safe), a sub-dollar quote INVERTS and becomes far too permissive.** Must establish **survival per quote**, not just population. |
| **`#967`** | `B-PRICE-FLOOR-REVIEW` | plan row **5.b** | the active path's **$0.25** price floor excludes Dogecoin ($0.085) **and Cardano** ($0.201), while VTS's $0.05 admits both. **Kyle's decision — not a defect.** |
| **`#968`** | `B-CHANGE-CLASS-PARSER` | plan row **3b.k** | the governance checker's change-class marker needs the token to begin a line **and** the colon outside the bold. `**change-class:**` fails, `**change-class**:` parses, **and they render identically.** 17 of 329 scope files across three authors. |

---

## 9. GOVERNANCE FILES CHANGED

- `1-system-manual/SYSTEM_IMPACT_MAP.md` — cross-cutting carry entry (defect, chain, fix, guard, census, verifier trap)
- `1-system-manual/SYSTEM_MANUAL.md` — **new §B63.6**, the bypass invariant and the per-quote direction table
- `1-system-manual/BATCH_CATALOG.md` — batch entry
- `1-system-manual/PHASE_HISTORY.md` — Phase 19 entry
- `1-system-manual/PHASE_19_PLAN.md` — row 5 closed; rows **3b.j**, **3b.k**, **5.a**, **5.b** placed
- `1-system-manual/RUNNING_ISSUES.md` — `#906` closed; `#965`, `#966` (+2 amendments), `#967`, `#968` opened
- `Claude Comms and Packages/Scope Files/B_SCANNER_EGRESS_NORMALISE_SCOPE.md` — §13, §14 and in-place withdrawal stamps
- `Claude Comms and Packages/Change Lists/B_SCANNER_EGRESS_NORMALISE_CHANGE_LIST.md` — §9-§12 and the six inline stamps
- `Claude Comms and Packages/Batch Completion/B_SCANNER_EGRESS_NORMALISE_COMPLETION_REPORT.md` — this file
- `.claude/memory/MEMORY_CC_C.md` — working state

**Judged and deliberately NOT updated:** `ADJUSTMENT_FRAMEWORK`, `AUTHORITY_BASELINE`, `STORAGE_POLICY`, `MULTI_ASSET_VTS_EXPANSION_PLAN` — no parameter-governance, authority, retention or xStock-calibration surface was touched. `DELETED_COMPONENTS_LOG` — nothing was removed.
