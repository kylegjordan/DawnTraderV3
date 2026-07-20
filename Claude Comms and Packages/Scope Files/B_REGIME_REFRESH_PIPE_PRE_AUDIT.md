# B-REGIME-REFRESH-PIPE — PRE-AUDIT (Step 2)

**change-class: architecture** · Owner CC-A · 2026-07-21 · Co-audit: Langston
Design locked Step-1 (§5.5 of scope): **A1 = new PURE MCE method `computeRegimeInputsOnly`, called from the async refresh, carrying queue-time DBS, reject-on-sparse-bars.**

---

## 1. SIM CONSULTATION (§9 mandatory)

| Component | Role | This batch |
|---|---|---|
| **MCE** (`market-context-engine.ts`) | Computes regime context for FX5 survivors + xStock survivors ONLY; 60s-TTL per-symbol cache; §5.2.5 | **ADDS one pure read-only method** `computeRegimeInputsOnly`. No new singleton, no new cross-cutting state. Reuses private config-assembly + `getMacroConfigForClass`. |
| **RTB refresh** (`ready_to_buy_service.ts`) | 30s re-eval of queued signals | `acquireRefreshedInputs` sync→async; calls the new MCE method; reject on null (fail-loud). |
| **market-regime** (`calculatePairRegime`, :231) | PURE regime math (vol/momentum/adx + dispatch) | Called directly by the new MCE method. No change to it. |
| **calculateRegimeWeight** (`score-calculator.ts`) | `trend×0.70 + (1−vol)×0.30` | Unchanged; now fed live inputs on the refresh path. |
| **OHLC caches** (`ohlc-cache.ts` / `xstock-ohlc-cache.ts`) | Serve 60m bars | Refresh dispatches by asset class; both serve FRESH recent bars (crypto Kraken/DB; xStock live 24h 1m-overlay). |

**Cross-cutting-state registry (§9):** the MCE per-symbol cache is registered (B-REGIME-INPUTS-LIVE). **A1 does NOT write it** (that was the split-brain risk of A2). No new liveness-registry entry needed — the compute lives in the refresh loop that already iterates the signal (no new cadence/singleton).

## 2. THE DATA-FLOW TRACE — why queued pairs go cold (root cause, code-cited)

1. MCE `computeContext` runs ONLY for `activeFilterPool.getActivePool()` survivors (signal-orchestrator.ts:1620) + xStock eval-cycle survivors (eval-cycle.ts:368).
2. `market-scanner.ts:773` — `if (poolSymbols.has(sym) || activeTradeSymbols.has(sym)) skip` — **deliberately excludes queued/traded pairs** (don't re-signal). Pool TTL = 5 min, non-refreshing in place (active-filter-pool.ts:250, :290 "do NOT refresh TTL").
3. ⇒ once a pair is queued/traded, it cycles OUT of the survivor set → MCE stops computing it → its 60s cache expires → the refresh's `getCachedContext` (via `readRegimeInputs`) returns null → reject. **Live: 58 `mce_context_absent` rejects/window, 54/55 queued pairs cold.**
4. The exclusion is BY DESIGN for creation; the refresh has the opposite need. **A1 gives the refresh its own compute path** without touching the creation-side exclusion.

## 3. WHY A1, NOT A2 — the 5 side-effects of `computeContext` (enumerated, code-cited)

`computeContext` (mce:1155-1432) performs, per call: (1) `regimePhaseStore.tick` (~1310, mutates phase-age); (2) `this.cache.set` (:1373 — split-brain vs the 60s cycle that owns the cache); (3) `directionalBiasStore.updatePair` (:1393 — persistent DBS-store write); (4) `emitMceTelemetry`; (5) `archivePairScan` (:1432, ~155k rows/day at 54×2880). **Only (2) is desired; it is inseparable from (1)(3)(4)(5).** A2 (skipArchive) is a 3+-flag patch on a hot core fn (§8 #11). **A1 sidesteps all five**: `calculatePairRegime` is pure. Langston verified (1)-(5) at `origin`.

## 4. THE DBS-CARRY SAFETY (Q2) — verified at code

`regimeWeight = trendStrength×0.70 + (1−min(1,vol))×0.30`; `trendStrength = adx/50`; both from price-derived `raw.{volatility,adx}`. DBS ONLY populates `directionalBias` (label/routing) at mce:1179 and is NOT a `regimeWeight` input (SIM_IMPACT_MAP:500 "RegimeWeight (signal-level vol only)"; Langston re-verified at ref). **⇒ carrying queue-time DBS (metadata `dbsScore`/`dbsSlope`) cannot move the gated number.** It only satisfies the B63 hard-contract (mce:1179 THROWS for crypto without DBS) + sets a label A1 discards.

## 5. IMPLEMENTATION SHAPE (soup-to-nuts)

- **NEW** `MarketContextEngine.computeRegimeInputsOnly(symbol, ohlcData: OHLCData[], propagatedDbs, assetClass): { volatility:number; adx:number } | null`:
  - `if (ohlcData.length < atrPeriod) return null;` — **reject-on-sparse (Finding 3 / #546): absence stays absence, NEVER vol=0.**
  - assemble `regimeConfigForPair` via the EXISTING private lookback merge (`regimeLookbacksByClass.get(assetClass)`); macro via `getMacroConfigForClass(assetClass)` (public :554).
  - `const r = calculatePairRegime(ohlcData, dbs.score, dbs.slope, macroModifier, regimeConfigForPair, assetClass)`.
  - return `Number.isFinite(r.volatility) && Number.isFinite(r.adx) ? { volatility: r.volatility, adx: r.adx } : null`.
  - **ZERO side-effects** (no tick/cache/DBS-store/telemetry/archive).
- **`acquireRefreshedInputs` sync → async.** Both callers (`refreshSingleSignal` :969, batch `group.map(async…)` :1288) are ALREADY async → add `await`. Inside: dispatch OHLC fetch by class (`ohlcCache.getOHLCData(sym,60)` crypto / `xstockOhlcCache.getOHLCData(sym,60)` xStock); DBS from `metadata.{dbsScore,dbsSlope}`; call `mce.computeRegimeInputsOnly`; **null → reject the refresh (return {passed:false} / bare return), NEVER substitute.** Non-null → build the `RegimeInputs` and proceed (feeds `calculateRegimeWeight`, unchanged).
- `readRegimeInputs` (the pure cache-router) **UNTOUCHED** — B-REGIME-INPUTS-LIVE contract preserved. (The refresh no longer relies on it hitting; it computes fresh.)

## 6. BLAST RADIUS
| Surface | Effect |
|---|---|
| Refresh reject rate | 54/55 → near-zero (only genuinely dataless pairs) — **the intended fix** |
| MCE | +1 pure read-only method; **no** cache/store/archive writes; no new singleton/cadence |
| Creation path (orchestrator) | **none** — untouched; the survivor-exclusion stays as-designed |
| VTS | **none** |
| pair_scan_archive / DBS store / phase store | **none** — A1 writes none of them (the whole point vs A2) |
| Perf | +1 `calculatePairRegime` (pure math on cache-served OHLC) per queued pair per 30s (~54). Measure refresh cycle p50/p90 pre/post (VC-6). |
| Throttle | completes activation with real baselines (ship-1 consensus, already approved) |

## 7. RISKS
1. **xStock overlay under-fresh** → xStock pairs still reject. Mitigated: VC asserts an xStock queued pair gets FRESH VARYING vol/adx; snapshot-stall → #441. **VERIFY the overlay yields ≥atrPeriod fresh hourly buckets at Step-2 test before trusting.**
2. **Perf under 54×/30s** → refresh cycle slows. Mitigated: pure math on cached OHLC; measured VC-6; OHLC fetch is cache-read not network.
3. **A queued pair genuinely has no OHLC** → correctly rejects (fail-loud). This is the residual item-3 (retry-limit/kick-out) — out of scope, now rare.
4. **Label carried is stale** → only matters if a decision branches on the recomputed label; confirmed CLEAN (refresh reads STORED `meta.regime` :2169 for shadow-telemetry, A1 never overwrites it).

## 8. VERIFICATION (close conditions)
VC-1 reject rate `mce_context_absent` → near-zero. VC-2 refreshed regimeWeight stays a real spread AND ≥1 genuine below-floor (<0.30) admission-rejection observed. VC-3 no pool-drain; promotions resume. VC-4 NO path scores on 0.015/0.5; genuine no-data still rejects. VC-5 **xStock** queued pair shows fresh varying vol/adx (not just crypto). VC-6 refresh cycle p50/p90 not materially worse. VC-7 UI (§9.3) staging.
