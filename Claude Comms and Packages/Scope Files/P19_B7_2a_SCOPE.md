# P19-B7.2a Scope — #330 fee-resolver consolidation (one road to the fee fact)

**Batch:** P19-B7.2a · **change-class: non_architecture** · **Drafted:** 2026-07-02, **REV 2** (Step-1 CHANGES folded — Langston caught the undercounted caller probe) · **Issue home:** RUNNING_ISSUES #330 (SPLIT out of B7.2 by CC-B + Langston consensus 2026-07-01)
**Reviewer:** Langston (Step-1 this document → Step-2 pre-audit → Step-4 diff)

> **§9.2 PREVIOUSLY-STATED-VS-NOW (rev 2):**
> - PREVIOUSLY STATED: "the only direct `getCostMetrics` reader touches only `.spread` (fx5-scanner:1786)"; blast radius = 2 source files. NOW: **FIVE direct cache readers; FOUR of them read `.fee` off the cache** — `telemetry-aggregator.ts:1410` and `market-indicators.ts:287/300/371/375` (both feed `computeMarketFriction` — **friction-scoring, load-bearing, not display**), `api/diagnostics/tec-costs.ts:43/58/86`, `routes.ts:8692-8758` (diagnostics display); blast radius = 6 source files. REASON: my probe grepped one consumer file and generalized — Langston's Step-1 independent probe caught it.
> - PREVIOUSLY STATED (objective 1): `getCacheStats` drops `avgFee`. NOW: `avgFee` KEPT in the stats shape, sourced from the merge site. REASON: four production readers of the stat (TEC-costs API, cost-telemetry persistence, routes endpoint, the cost-drift monitor) would break silently on a shape drop — pre-audit §1.

---

## 0. The problem, precisely (from the Step-1 architectural read — cost-model.ts + cost-cache.ts + SIM/SysManual B-4.5 sections + compile-driven caller probes)

`getFrictionForAssetClass` (cost-model.ts:73) is THE B-4.5 single fee merge site: DB `fee_model` rates merged over the static friction modules, fail-hard, new object per call. Every non-crypto path already flows through it. **The residual second road is the crypto_spot lane of `getCachedCostMetrics` (cost-model.ts:178):** it delegates to the per-symbol cost-cache (`getOrSetCostMetrics`), and that cache **stores and serves the FEE**:

1. **A second resolver exists:** `cost-cache.ts resolveCryptoTakerFee()` (:35) re-resolves `fee_model.spot_taker_fee` independently of the merge site — two code paths to one fact (the literal #330 statement). It also resolves ONLY the taker leg, hardcodes the crypto_spot key, and exists solely because the cache stores fees.
2. **A buried clamp on a DB-governed fee:** `setCostMetrics` (:113) clamps `fee` to `MAX_COST_BOUND` (0.02). No live divergence today (0.008 < 0.02), but a governed fee silently clamped is the exact anti-pattern B-4.5 killed on the write path (`updateCachedCostMetrics` retired for precisely this); the DEFAULT path still carries it.
3. **A staleness window:** the fee is stored per symbol with the 5-min cache TTL — a `fee_model` change propagates instantly to xStock (read-time merge) but is served stale for up to 5 min per crypto symbol. Minor, but an asymmetry with no reason to exist.
4. **Charter violation:** the cost-cache's purpose is per-symbol MEASURED microstructure (both production writers — `market-scanner.ts:762`, `fx5-scanner.ts:1036` — write ONLY `{ spread }`). The fee is a per-CLASS account-level fact; it does not belong in a per-symbol measurement cache at all.

**Caller probe (rev 2 — corrected per Langston Step-1):** production writers pass only spread; the only fee-into-cache flows are the cache's own defaults + tests. `.fee` consumers come in TWO groups: (a) via `getCachedCostMetrics` — expectancy kernel :634, RTB refresh :801, xstock eval-cycle :695; (b) **DIRECT cache readers bypassing it** — `telemetry-aggregator.ts:1402-1410` (`finalCostMetrics.fee` → `computeMarketFriction`), `market-indicators.ts:287/300/371/375` (`metrics.fee`/`defaults.fee` → `computeMarketFriction` + audit samples), `api/diagnostics/tec-costs.ts:43/58/86` (takerFee display), `routes.ts:8692-8758` (cost-diagnostics endpoint). Group (b) items 1-2 are on the **friction-scoring path** — "provenance not price" must be ASSERTED there (it holds: 0.008 either road), not assumed. fx5-scanner:1786 reads only `.spread` (unchanged).

## 1. Objectives (numbered, each with verification criteria)

1. **The fee never lives in the cost-cache.** `cost-cache.ts` `CostMetrics` drops `fee`; `setCostMetrics`/`getOrSetCostMetrics` neither accept, default, clamp, nor store a fee; `resolveCryptoTakerFee()` is DELETED (§15 — on-the-spot, zero external callers by construction after this change). `getCacheStats` KEEPS `avgFee` in its shape, sourced from the merge site (rev 2 — four production stat readers; the cost-drift monitor's fee-delta becomes strictly truthful: fires only on a real `fee_model` change, never a clamp/TTL artifact).
   *Verify:* grep `fee` in cost-cache.ts → zero storage/serve-from-cache sites; tsc-clean; the B-4.5 "single merge site" claim becomes literally true; the four stat readers' payload shapes identical.
2. **EVERY fee read composes at READ time from the single merge site** — `getCachedCostMetrics`'s crypto lane AND the four direct cache readers (rev 2): `telemetry-aggregator.ts`, `market-indicators.ts`, `api/diagnostics/tec-costs.ts`, `routes.ts:8692-8758` each compose `fee = getFrictionForAssetClass('crypto_spot').feeRateTaker` (the symbol cache is structurally crypto-lane-only — cost-cache.ts:32) + cache spread/slippage. Spread/slippage keep their TTL + clamp (measured quantities); the governed fee never enters the clamp — un-clampable BY CONSTRUCTION, not by ordering.
   *Verify:* named unit test — a cache entry carrying a poisoned/absent fee CANNOT affect the returned fee anywhere; the returned fee === `getFrictionForAssetClass().feeRateTaker` identically; a `fee_model` change is visible on the NEXT read (no TTL lag); **friction-path assertion** — `computeMarketFriction` inputs at telemetry-aggregator + market-indicators produce IDENTICAL scores before/after on identical spread/slippage (provenance not price, asserted).
3. **No behavior change to spread/slippage semantics** — the B-5.1 crossed-quote reject, TTL, clamp, and both scanner writers untouched.
   *Verify:* existing cost_cache + B-5.1 tests pass with only fee-shape edits; `computeTotalRoundTripCost` output identical for identical inputs.
4. **Tests + docs:** update the fee-asserting tests (cost_cache.test.ts, cost_telemetry.test.ts, b5-amr-body mocks if fee-shaped); SIM (cost-cache component entry — charter narrowed to measured microstructure) + SYSTEM_MANUAL B-4.5 supersession note gains one line ("B7.2a removed the cache's fee storage — the merge site is now the sole fee road"); CHANGES_AND_FIXES entry; #330 RESOLVED.
   *Verify:* completion report governance list; Langston Step-8.

## 2. Explicitly OUT of scope

- Any change to `getFrictionForAssetClass`, the fee values, `maker_taker`, or the B7.2c pending lifecycle.
- The B81 cost-cache asset-class-dimension refactor (cost-model.ts:176 note) — this batch narrows the cache's payload, it does not re-key it.
- The `MAX_COST_BOUND` value itself (stays, for measurements).

## 3. Blast radius (from the probes; pre-audit will re-verify per SIM)

`server/core/cache/cost-cache.ts` (shape + defaults + stats), `server/core/math/cost-model.ts` (crypto branch of `getCachedCostMetrics`), **`server/services/telemetry-aggregator.ts` + `server/services/market-indicators.ts` (friction-scoring direct readers — rev 2)**, **`server/api/diagnostics/tec-costs.ts` + `server/routes.ts:8692-8758` (diagnostics direct readers — rev 2)**, `server/config/exchange-defaults.ts` (comment), 3-4 test files. NO engine/strategy/UI files. All consumers see identical VALUES today (0.008 either road) — the change is provenance, not price, asserted on the friction path.

## 4. Risks

- The kernel + RTB refresh read `.fee` per evaluation; the read-time merge adds a `getCachedNumberRequired` map lookup per call — negligible (in-memory map, already how xStock works every call).
- Test fee assertions encode the old cache-serves-fee behavior — updated, not deleted (they become poisoned-fee-cannot-leak assertions).
