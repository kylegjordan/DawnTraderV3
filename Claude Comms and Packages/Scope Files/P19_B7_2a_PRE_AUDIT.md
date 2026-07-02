# P19-B7.2a Pre-Audit — #330 fee-resolver consolidation

**Step-2, CC-B, 2026-07-02.** Scope: `P19_B7_2a_SCOPE.md` (Langston Step-1 PROCEED, no changes, one pre-audit ask). change-class: non_architecture.

## 1. Langston's Step-1 ask, answered — `getCacheStats().avgFee` readers (the probe he wanted explicit)

**FINDING: avgFee is NOT log-line-only — four production readers exist.** Full enumeration (grep `getCacheStats|avgFee`, server-wide):

| Reader | File:line | What it does with avgFee | Breaks on shape-drop? |
|---|---|---|---|
| TEC-costs diagnostics API | `api/diagnostics/tec-costs.ts:114-130` | returns `avgFee`/`avgFeePct` + computes `avgTotalCost` from it | YES (undefined → NaN%) |
| Cost telemetry | `core/telemetry/cost-telemetry.ts:76-126,183,209` | snapshots avgFee, **PERSISTS it** (rides the `hybridScore` column) + reads it back | YES (persisted NaN) |
| Cost-cache API endpoint | `routes.ts:8779-8822` | exposes avgFee/avgFeePct/avgTotalCost per-symbol + aggregate | YES |
| **Cost-drift monitor** | `services/monitoring/cost-drift-monitor.ts:55-112` | **baselines avgFee + alerts on delta** | YES (delta vs undefined) |
| Observability log line | `cost-cache.ts:196-199` | the log line the scope assumed was the only reader | (in-file) |
| Tests | `cost_cache.test.ts:222`, `cost_telemetry.test.ts:57` | assert avgFee values | updated in-batch |

**SCOPE REFINEMENT (objective 1 amended — §9.2 delta):** PREVIOUSLY STATED: `getCacheStats` drops `avgFee`. NOW: `getCacheStats` **KEEPS `avgFee` in its shape, sourced from the merge site** (`getFrictionForAssetClass('crypto_spot').feeRateTaker` — the cache is structurally crypto-lane-only per its own header). REASON: four production readers would break silently on a shape drop (Langston's Step-1 instinct, confirmed). This is truthful — with the fee no longer stored per entry, the "average fee over cached symbols" IS the class fee — and it makes the cost-drift monitor STRICTLY better: its fee-delta now fires only on a real `fee_model` change, never on a clamp/TTL artifact. No reader signature changes; JSON payload shapes identical.

## 1b. Langston's Step-1 CHANGES (second review pass) — the four DIRECT `.fee` cache readers, verified + folded

Langston's independent probe found four direct readers of `getCostMetrics`/`getOrSetCostMetrics` that consume `.fee` off the cache, bypassing `getCachedCostMetrics` — **all four verified in code by CC-B** (grep `getCostMetrics|getOrSetCostMetrics`, server-wide, tests excluded):

1. `services/telemetry-aggregator.ts:1402-1410` — `finalCostMetrics.fee` → `computeMarketFriction` (**friction-scoring, load-bearing**).
2. `services/market-indicators.ts:287/300/371/375` — `metrics.fee`/`defaults.fee` → `computeMarketFriction` + audit samples (**friction-scoring, load-bearing**).
3. `api/diagnostics/tec-costs.ts:43/58/86` — `takerFee` diagnostics display.
4. `routes.ts:8692-8758` — cost-diagnostics endpoint display.

**Resolution (scope rev 2, objective 2):** each read site composes `fee = getFrictionForAssetClass('crypto_spot').feeRateTaker` at read time (the cache is structurally crypto-lane-only — cost-cache.ts:32) — identical fix, identical poisoned-fee-can't-leak guarantee, and "one road to the fee" becomes literally true rather than orchestrator-lane-only. The friction path gets an explicit before/after identity ASSERTION (provenance not price), not an assumption. My original probe grepped one consumer file and generalized — the miss is recorded in the scope's §9.2 block.

## 2. Component map (SIM discipline)

- **`core/cache/cost-cache.ts`** — UPSTREAM: module-constants cache (`resolveCryptoTakerFee` — DELETED this batch), exchange-defaults (spread/slippage defaults, MAX_COST_BOUND — kept), the two scanner writers (spread-only, untouched). DOWNSTREAM: `cost-model.getCachedCostMetrics` (crypto lane), fx5-scanner spread read, the four avgFee readers above. SHARED STATE: the module-level `cache` Map (mode-invariant market microstructure — stays; no keying change). BLAST: fee fields only.
- **`core/math/cost-model.ts`** — the crypto branch of `getCachedCostMetrics` composes `fee` at read time from `getFrictionForAssetClass`; xstock + default branches already do (via `getDefaultCostComponentsForAssetClass`). Consumers (expectancy kernel :634, RTB refresh :801, xstock eval-cycle :695) see identical VALUES today (0.008 both roads) — provenance change only.
- **The four direct readers (§1b)** — telemetry-aggregator + market-indicators (friction-scoring) and tec-costs + routes cost-diagnostics (display): each swaps its cache `.fee` read for the merge-site compose; spread/slippage reads unchanged.
- **No engine/strategy/UI/DB files.** No migration. No mode-keyed state. The SIM Cross-Cutting registry is unaffected (no singleton added/removed/re-keyed; the cache entry's charter note narrows at governance).

## 3. Invariants preserved (verified in code)

- **B-5.1 crossed-quote reject** — spread path untouched (`setCostMetrics` spread branch identical).
- **Clamp stays for MEASUREMENTS, never the fee** — `slippage`/`spread` keep `Math.min(..., MAX_COST_BOUND)`; the fee no longer passes through `setCostMetrics` at all (Langston Step-1 ask-2, agreed unequivocally).
- **Fail-hard discipline** — the read-time compose uses `getFrictionForAssetClass` → `getCachedNumberRequired` (throws on cold/missing; b72-warmup makes that deploy-time). No new fallback introduced.
- **TTL semantics** — unchanged for spread/slippage; the fee simply stops having a TTL (read-time = always current).

## 4. Test plan

1. NEW named guard: a cache entry pre-seeded with a poisoned fee (via the internal map or a legacy-shaped set) CANNOT affect `getCachedCostMetrics().fee` — the returned fee `===` `getFrictionForAssetClass().feeRateTaker`.
2. NEW: `fee_model` change visibility — bump the mocked constant → next `getCachedCostMetrics` read reflects it (no TTL lag).
3. UPDATED: `cost_cache.test.ts` fee assertions (cache no longer stores fee; `avgFee` === merge-site fee), `cost_telemetry.test.ts:57` (snapshot avgFee = merge-site fee).
4. UNCHANGED-must-pass: B-5.1 crossed-quote set, TTL tests, `computeTotalRoundTripCost` identity.

## 5. Risks (small)

- The `getCacheStats` empty-cache branch already returns `resolveCryptoTakerFee()` for avgFee — the replacement (merge-site fee) is value-identical; only the resolver path changes.
- `cost-telemetry` persists avgFee history — old persisted rows carry clamped-era values; harmless (same 0.008), noted for the drift monitor's baseline continuity.
