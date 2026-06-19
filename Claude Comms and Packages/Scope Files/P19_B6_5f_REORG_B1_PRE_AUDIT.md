# P19-B6.5f (reorg-B1) — Pre-Implementation Audit

> **Batch:** P19-B6.5f · **reorg-board:** B1 · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-19
> **change-class: non_architecture** (Langston-concurred; Q2 wiring adds a SIM §17 + System-Manual deliverable — see §8).
> **Scope:** `P19_B6_5f_REORG_B1_SCOPE.md` (Langston Step-1 PROCEED + 5 conditions, all accepted).
> **Step-2 status:** COMPLETE — live quote enumeration + boot-ordering trace + blast-radius + the live `resolveAssetClass` probe all done. One architectural finding (layering, §5) needs Langston's Step-2 nod before implementation.

---

## §1 — SIM + System Manual read (mandatory per workflow Step 2)
- **SIM line 737:** `resolveAssetClass(symbol, exchange?)` — exchange-first branching: `kraken-equities`→`xstock_spot`; `PF_<TICKER>XUSD`→`xstock_perp`; non-PF futures→`crypto_perp`; default→`crypto_spot`. `safeResolveAssetClass()` wraps with null-return. **Matches code.**
- **SIM 2176 / 2252:** the `kraken`-branch behavior (B79.0f collision gate) + `XSTOCK_SPOT_SYMBOLS` allow-list dispatched BEFORE the crypto regex. **Matches code.**
- **SIM 925:** `resolveAssetClass` / `safeResolveAssetClass` / `ASSET_CLASSES` consumer surface = "both server/ and client/ trees — extensive." → drives the §6 blast-radius + the §5 layering constraint (client imports `shared/`, so `shared/` must not import `server/`).
- **System Manual 5130:** the 4-phase asset-class migration pattern (not triggered here — no schema/column change). **9514:** `symbol-canonicalizer.test.ts` is the existing canonicalizer test home.
- **Gap check:** neither doc documents the recognition-path QUOTE-set source or the `kraken-asset-pairs-service.dynamicQuotes` liveness. That silence is the governance gap the §8 deliverables close.

## §2 — OBJ-1: live Kraken quote enumeration (DONE — data-driven)
Live `/0/public/AssetPairs` (1,552 pairs) → **23 distinct canonical (wsname) quote legs:**
`USD(682) EUR(634) USDT(48) USDC(46) XBT(32) GBP(27) ETH(19) AUD(14) CAD(11) JPY(10) CHF(6) EURC(3) USD1(3) SOL(3) DAI(2) EUROP(2) FIDD(2) PYUSD(2) AUSD(2) USDD(1) RLUSD(1) USDQ(1) USDR(1)`.
- **Quotes > 4 chars (break the `{3,4}` cap):** `EUROP, PYUSD, RLUSD`. **Max leg length = 5** → **`QUOTE_LEN_MAX = 5` confirmed from live data** (Langston Q3 — not a guess).
- Current narrow `knownQuotes` (8) misses **15** real legs. The 6 firing alerts (EUROP/PYUSD/RLUSD-quoted) are a subset.

## §3 — Recognition-DECISION sites + what each actually needs (key precision)
Two distinct fix-mechanisms — not every site needs the quote LIST:
| Site | Form it parses | Needs | Note |
|---|---|---|---|
| `asset-classes.ts:515` `CRYPTO_SPOT_CANONICAL` `…/[A-Z0-9]{3,4}` | SLASH `BASE/QUOTE` | **LENGTH only** | Generic charset → EUROP/PYUSD already match once length allows. **This is the primary fix for all 6 alerts** (they're slash-form). |
| `symbol-normalize.ts:99,106` `…/[A-Z]{3,4}` | SLASH + display | **LENGTH only** | Same `{3,4}` cap; widen via the shared const. |
| `asset-classes.ts:211` `XSTOCK_SPOT_DISPLAY` `…x/[A-Z]{3,4}` | xStock display | **LENGTH only** | Lockstep widen (Langston Q4 / D2). |
| `canonicalizer.ts:151` `knownQuotes` (Pattern-2) | NO-SLASH compact `ETHEUROP` | **LIST** | Splits base/quote on a known suffix. |
| `asset-classes.ts:519/522` `CRYPTO_SPOT_KRAKEN_RAW_1/2` `(USD\|…)` | NO-SLASH raw | **LIST** | Enumerate the quote alternation. |

**Consequence:** the 6 alerts are fixed by the LENGTH widen alone; the quote-LIST SSOT (§4/§5) is the deeper completeness + anti-drift fix for compact/no-slash inputs. Both ship (NO-PATCHES), but the risk profiles differ — the length widen is low-risk + closes the live failures; the list SSOT carries the layering decision below.

## §4 — Boot ordering + the dynamic-quote mechanics (Langston Q2 condition)
- `dynamicQuotes` (kraken-asset-pairs-service.ts:143) is seeded at construction from the **narrow** `VALID_QUOTES` (14), then **rebuilt from the live feed** in `refresh()` (:280-285) = `VALID_QUOTES ∪ every discovered quote` → after init it holds the **full live set**.
- **Boot order (server/index.ts):** `xstockUniverseService.initializeFromDB()` at **:62** (early) → `krakenAssetPairsService.initialize()` (→`refresh()`) at **:458** (later, after bootOrchestrator/caches). The active pipeline starts after :458, so on the active path `dynamicQuotes` is fully populated.
- **The window Langston flagged:** before `:458` completes, `dynamicQuotes` = the narrow 14-quote seed. So **the curated fallback MUST be the complete OBJ-1 set, not the narrow seed** (his condition #2; a narrow steady-state-or-window fallback = §11 #2 silent-narrow-default violation). **Action: widen `VALID_QUOTES` to the full confirmed 23-leg set** so seed = fallback = complete.

## §5 — ★ ARCHITECTURAL FINDING: shared/ cannot import server/ (the layering constraint)
Langston Q2 = "consume the in-memory `dynamicQuotes`." But `resolveAssetClass` + the regexes live in **`shared/asset-classes.ts`**, which **client/ imports** (SIM 925), so `shared/` **must not import** `server/markets/kraken-asset-pairs-service`. A direct consume is a layering violation.
**The file ALREADY has the right precedent:** `setClassifyFallthroughHook` (asset-classes.ts:634-639) — a server-registered SLOT so `shared/` never imports `server/`. **Proposed design (mirrors it):**
1. `shared/asset-classes.ts` owns `KNOWN_QUOTE_CURRENCIES` = the **complete curated SSOT** (23-leg OBJ-1 set) + a mutable `_discoveredQuotes: Set<string>` + `setDiscoveredQuotes(set)` slot.
2. Recognition uses `_discoveredQuotes` (if populated) **else** the curated const — both complete, so no narrow path ever.
3. Server registers at boot, right after `krakenAssetPairsService.initialize()` (:458): `setDiscoveredQuotes(krakenAssetPairsService.getDiscoveredQuotes())` (add a public getter; `dynamicQuotes` is currently private).
This satisfies ALL of Langston's Q2 intent — **data-driven + self-healing** (new Kraken quote auto-recognized after refresh), **no synchronous fetch on the hot path** (reads an in-memory set), **complete fallback** (curated 23-leg), **no layering break** (slot, not import). The length-bound widen (§3) needs none of this — it's a pure `{3,4}`→`{3,QUOTE_LEN_MAX}` constant.

## §6 — Blast radius
- `resolveAssetClass`/`safeResolveAssetClass`/`toCanonical` = **272 occurrences / 34 files** (server). Effect of this batch is **purely additive**: pairs that previously THREW/fell-through (skipped) now classify. Every downstream consumer (expectancy, SQE, RTB, paper-execution, signal-orchestrator, vts-runner) already handles a classified pair — they simply see *more* recognized pairs (the B6.5e-intended "more eligible crypto pairs in play"). No consumer treats "unrecognized" as a positive signal.
- **Recognition ≠ eligibility (must verify):** recognizing EUROP/PYUSD/RLUSD-quoted pairs does NOT mean trading them. The trade-eligibility gate (`allowedTradingPairs` default `USD/USDT`; the b74 universe-loader USD/USDT/USDC filter) is downstream + unchanged. **Pre-audit action item carried into implementation:** confirm that gate still excludes exotic-quote pairs, so widened recognition is "recognized, not silently dropped" — NOT "newly auto-traded." (Expected: yes, it gates — but verify, don't assume.)
- **Collision precedence:** the widen is quote-side; the XSTOCK-before-crypto dispatch order + `XSTOCK_SPOT_KRAKEN_COLLISIONS` gate are base/exchange-side, untouched. Probe (§7) confirms SUI/USD still → crypto_spot. A collision-ORDER test (OBJ-7) locks it.

## §7 — Live `resolveAssetClass` probe on staging (Langston Q5 — evidence, not code-trace)
Replicated boot (`initializeFromDB` → `loaded 490 active symbols, source=db, dbReachable=true`; `XSTOCK_SPOT_SYMBOLS.size=490`; has AAPL/USD + TSLA/USD = true), then:
```
xStock (OBJ-6):  AAPL/USD@kraken = xstock_spot   AAPLx/USD@kraken = xstock_spot
                 AAPL/USD@kraken-equities = xstock_spot   SUI/USD@kraken = crypto_spot (collision WARN fired)
crypto gap REPRO: ETH/EUROP@kraken = THROW "did not match any registered pattern"
                 ETH/PYUSD@kraken = THROW    XRP/RLUSD@kraken = THROW    ETH/USD@kraken = crypto_spot (control)
```
**Reads:** (a) xStock recognition is COMPLETE on a populated universe — no analogous open gap; the universe is NOT empty in the live process, so plain-form xStocks are not mis-routed to crypto (OBJ-6a satisfied). (b) The crypto gap reproduces exactly — the THROW is the silent active-path skip behind the 6 alerts. (c) The collision gate works. → **xStock needs no recognition code change; the only xStock change is the lockstep display-bound widen (D2 pre-emptive).**

## §8 — Governance deliverables locked NOW (avoid a D5-style close miss)
Per Langston (c) + CLAUDE.md §9 (reorganizing≠updating; content update required every applicable batch):
1. **SIM §17 Cross-Cutting Runtime State / Liveness Registry** — NEW entry: recognition path → `_discoveredQuotes` (populated at boot from `krakenAssetPairsService`); liveness dependency + the complete-curated-fallback behavior.
2. **System Manual recognition-path note** — the quote-set SSOT + length-bound + the recognition-vs-eligibility boundary.
3. Tier-1 as always (completion report, BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES close of the B1 item, MEMORY, PHASE_19_PLAN §1 progress).

## §9 — Step-2 questions for Langston (1 real decision + 2 confirms)
1. **(decision) The layering finding (§5):** confirm the `setDiscoveredQuotes` slot design (mirrors `setClassifyFallthroughHook`) as the realization of your Q2 — vs your original "consume `dynamicQuotes`" which can't be a direct import from `shared/`. CC strongly recommends the slot; it delivers your full intent without the layering break.
2. **(confirm) `VALID_QUOTES` seed widen (§4):** OK to widen the seed itself to the full 23-leg set (so seed = fallback = complete, killing the pre-refresh narrow window)?
3. **(confirm) Length-vs-list split (§3):** OK that the 6 live alerts are closed by the LENGTH widen, and the quote-LIST SSOT is the deeper compact-form completeness fix — both shipping, framed as one batch?

---
*On Step-2 nod → Step-3 implement (length-bound shared const + the SSOT slot + widen VALID_QUOTES seed + the named storm-safe alert + the consuming-regex-from-SSOT test) → bench (tsc-baseline + vitest) → Step-4 Langston diff review → CI 4-green → deploy → prove the 6 pairs + re-run the probe + resolve the 6 alerts + the eligibility-gate verify → SIM §17 + System-Manual + Tier-1 governance → close.*
