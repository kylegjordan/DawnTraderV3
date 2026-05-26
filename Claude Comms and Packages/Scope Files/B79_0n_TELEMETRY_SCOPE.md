# B79.0n.TELEMETRY — Scope (v1)

**Sub-batch:** #10 of 18 in B79.0n umbrella v4
**Batch type:** Phase 24 — asset-class onboarding (active-trading wire-in for xStocks)
**Author:** Claude Code (CC)
**Date drafted:** 2026-05-26
**Status:** Step 1 draft, awaiting Langston ACK
**Parallel-eligibility:** SOLO (per umbrella v4 sequencing — TELEMETRY hard-pins ahead of RTB / RTB-REFRESH / ML-CALIBRATION / WIRE-IN)

---

## §0. Existing telemetry inventory (per Kyle directive 2026-05-26)

Before drafting objectives, this scope explicitly enumerates the telemetry surface that ALREADY exists. The intent is to make crystal clear what this sub-batch is NOT re-scoping. Every item below is in production today and works.

### 0.1 — UI telemetry surfaces (rendered live on staging at http://188.245.193.8)

**Trading page (`/active-trades`) — 5 tabs:**
- **Filter Insights** — rich Phase-6 telemetry: Kraken universe (1549 pairs), per-cycle scanner stats, last-scan eligible/ineligible counts, 24h filter activity aggregation, deduped active filtered pool table, filter-breakdown by reason (Min Price / Min Volume / Max Spread / Min Daily Range / Stablecoin exclusion / Already Active / History / Liquidity Guard / Noise Guard / Correlation Guard).
- **Ready to Buy** — signals queued for execution.
- **Open Trades** — live positions (paper + live modes).
- **Trade History** — closed-trade record.
- **Pattern Scanning** — pattern recognizer telemetry.

**Analytics & Diagnostics page (`/analytics`) — 8 tabs:**
- **Overview** — Global Market Regime, Favored Signal Types, Favored Strategies, Global Friction Score (sample-sized), Global Directional Bias (sample-sized), Definitions & Mapping Reference tables.
- **Governance** — regime transition state + mode stats (Directive 11.7S).
- **Predictive** — filter state, model drift, traced passive decisions (Directive 11.7G + 11.7P).
- **Mapping Drift** — canonical-vs-empirical regime comparison + force-sync (Directive 11.7F).
- **Drift Dashboard** — regime factor weights + confidence drift per symbol (B64a).
- **Top Pairs** — per-regime factor coefficients + calibration stats; **dual-class today** via two endpoints (B82 fix 2026-05-14).
- **Events** — regime/friction transitions + system alerts.
- **Benchmark** — exit-strategy factor contribution per regime (B73); **dual-class today** via two endpoints.

**Other top-nav pages with telemetry:** Dashboard (portfolio overview), Machine Learning (VTS open/closed + predictive adjustments + regime archive), Briefings (AI narrative), Reports (AI-generated reports), AI Transparency (orchestrator telemetry), System Monitoring (formula audit, feed health, VTS status), System Alerts (per-turn surfaceable queue), Settings.

### 0.2 — Backend API routes that feed the UI telemetry

| Route | Handler | UI consumer | Asset-class aware today? |
|---|---|---|---|
| `/api/market-indicators` | `market-indicators.ts` | Overview | NO — hardcoded crypto_spot |
| `/api/market-events` | `market-events.ts` | Events | NO — crypto-only |
| `/api/narrative-feed` | `narrative-feed.ts` | Overview + Events | NO — crypto-only |
| `/api/system/predictive-diagnostics` | `predictive-diagnostics` | Predictive | NO — crypto-only |
| `/api/system/mapping-drift` | `mapping-drift-check` | Mapping Drift | NO — crypto-only |
| `/api/system/canonical-map` | `canonical-regime-map` | Mapping Drift | NO — crypto-only |
| `/api/system/governance` | inline | Governance | NO — crypto-only |
| `/api/analytics/drift-dashboard` | `drift-dashboard-aggregator` | Drift Dashboard | NO — crypto-only |
| `/api/analytics/factor-calibration` | `drift-dashboard-aggregator` | Top Pairs (crypto) | YES — crypto-only endpoint, paired with xstock variant |
| `/api/xstocks/factor-calibration` | `drift-dashboard-aggregator` | Top Pairs (xstock) | YES — xstock-only endpoint (B79.0i.b) |
| `/api/analytics/exit-strategy-ablation` | `exit-strategy-ablation-aggregator` | Benchmark (crypto) | YES — paired with xstock variant |
| `/api/xstocks/exit-strategy-ablation` | `exit-strategy-ablation-aggregator` | Benchmark (xstock) | YES — xstock-only endpoint (B79.0i.b) |
| `/api/vts/ml/open`, `/closed`, `/passive-decisions`, `/skipped-signals`, `/regime-archive*`, `/predictive-adjustments*` | various | Machine Learning | NO — crypto-only |
| `/api/orchestrator/telemetry`, `/analysis`, `/learning-summary`, `/logs` | orchestrator | AI Transparency | NO — global (orchestrator is asset-class agnostic) |
| `/api/system-alerts`, `/system/error-logs`, `/system/formula-audit`, `/system/feed-health` | various | System Alerts + Monitoring | NO — global (intentionally) |

### 0.3 — Backend telemetry service files

| File | Lines | Role | Asset-class aware today? |
|---|---|---|---|
| `server/services/telemetry-aggregator.ts` | 1500+ | Core pair-telemetry aggregator (VTS-only writes per M70 / Directive 11.4C.1); rolling 24h window; pool-performance comparison; pair-ranking for AdaptiveScanManager + AdaptiveRatioManager | NO internally — `assetClass` literally appears ZERO times in this file |
| `server/services/asset-class-instances.ts` | 156 | B79 per-asset-class instance-factory (`getAssetClassInstances(assetClass)`) | YES — but crypto_spot routes to null (global singleton), xstock_spot returns a dedicated triad, **xstock_perp + crypto_perp THROW** |
| `server/services/adaptive-ratio-manager.ts` | 298 | Pool-ratio (ideal vs rotational) computation, consumed by RTB | PARTIAL — constructor accepts injected `telemetry` (B79.0a back-compat); xstock instance gets its own injection; crypto + perps still hit global |
| `server/services/adaptive-scan-manager.ts` | ~400 | Calls `telemetry.getTopPairs()` for scanner batch composition | PARTIAL — same constructor-injection pattern via factory |
| `server/services/telemetry-repository.ts` | ~400 | SQL persistence into `telemetry_history` table | NO — `assetClass` appears ZERO times; schema almost certainly has no `asset_class` column |
| `server/services/telemetry-compression.ts` | ~300 | Request sampling + gzip compression for log batches | N/A — class-agnostic by design (infrastructure) |
| `server/services/telemetry-service.ts` | ~200 | Real-time trade-lifecycle events + WebSocket broadcasting | NO |
| `server/services/telemetry-trace.ts` | ~150 | Distributed tracing | N/A — class-agnostic by design |
| `server/services/phase15b-dbs-telemetry.ts` | ~150 | Directional Bias Score telemetry | NO — crypto-only |
| `server/core/logging/vts-telemetry.ts` | ~300 | VTS outcome → regime archive bridge | NO — crypto-only |
| `server/core/logging/predictive-adjustments.ts` | ~300 | Adaptive weight adjustment logs | NO — crypto-only |
| `server/core/logging/skipped-signals-logger.ts` | ~200 | Rejected-signal persistence | NO — crypto-only |
| `server/core/telemetry/cost-telemetry.ts` | ~200 | Cost-model telemetry (slippage, fees) | NO — crypto-only |

### 0.4 — Critical finding from §0 inventory

**The B79.0a per-asset-class pattern is INCOMPLETE.** Today the factory supports exactly 2 of 4 active asset classes:
- `crypto_spot` — global singleton path (no-touch fence, returns null from factory)
- `xstock_spot` — dedicated isolated triad (in-memory only)
- `xstock_perp` — **NOT WIRED** (factory throws)
- `crypto_perp` — **NOT WIRED** (factory throws)

Per scope row #10 of umbrella v4: "Telemetry Aggregator per-asset-class buckets ... RTB's Adaptive Ratio Manager consumes telemetry, so RTB depends on TELEMETRY. Hard-pinned to ship before WIRE-IN." The dependency is real: when RTB activates xstock_perp signals, ARM needs a TelemetryAggregator instance scoped to xstock_perp — and today calling `getAssetClassInstances('xstock_perp')` throws.

The reason the factory throws (not falls back) is Langston's "bulletproof > elegant" pre-audit directive from B79: silent fallback would corrupt the wrong class's pool aggregates. Throwing surfaces mis-routing immediately. Therefore the right fix is to ADD the missing classes to the factory, NOT loosen the throw.

---

## §1. Motivation + scope statement

Per umbrella v4 row #10: **"Telemetry Aggregator per-asset-class buckets. Promoted from Tier 2 per Langston item 9 — RTB's Adaptive Ratio Manager consumes telemetry, so RTB depends on TELEMETRY. Hard-pinned to ship before WIRE-IN."**

**Interpretation (CC reading after §0 inventory):** the term "per-asset-class buckets" in the umbrella row was authored when B79.0a's per-class-instance pattern had not yet been established. With the pattern now in place (xstock_spot has its own TelemetryAggregator instance), "buckets" effectively means "instances." This sub-batch completes the per-class instance pattern by adding xstock_perp + crypto_perp instances to the factory, and resolves the disk-persist hazard documented in `asset-class-instances.ts` lines 22-39 + `telemetry-aggregator.ts` lines 1600-1602.

**The work is structural, not behavioral.** No new UI tabs, no new metric definitions, no changes to what telemetry is captured. The change is to ensure each active asset class has its own isolated TelemetryAggregator instance, and that the disk-persist machinery (currently hardcoded to one path, armed once at module load) handles the multi-class case cleanly.

**Why this hard-pins before WIRE-IN:** Sub-batch #16 (WIRE-IN) flips active xStock trading. Once flipped, RTB ingests live xstock signals + queries `getPoolPerformanceComparison()` on the xstock_spot ARM. The xstock ARM's injected telemetry (B79.0a) provides isolation for xstock_spot, but if xstock_perp ever needs a telemetry instance (which sub-batch #11 RTB will require for perp-aware ranking), the factory throws today. Fixing this AT WIRE-IN time would force a hot architectural change under deploy pressure. Better to ship the structural completeness now and let WIRE-IN consume a stable factory.

---

## §2. Numbered objectives

**OBJ-1.** Extend `server/services/asset-class-instances.ts` to support all 4 active asset classes — add `xstock_perp` + `crypto_perp` cases that return their own dedicated instance triads via lazy bootstrap (same shape as `getXstockSpotInstances`). The `crypto_spot` case stays unchanged (returns null → callers fall back to the global singleton; no-touch fence preserved).

**OBJ-2.** Resolve the disk-persist hazard documented at `telemetry-aggregator.ts:1600-1602` + `asset-class-instances.ts:22-39`. Two architectural alternatives presented in §3 — Langston picks before Step 2.

**OBJ-3.** Extend `getAssetClassInstances()`'s switch-exhaustiveness so the TypeScript compiler enforces that every active asset class has a case (use `assertNever` exhaustive-switch pattern matching the per-class precedent set by B79.0n.STRATEGY / B79.0n.MCE). Reserved-future classes from the `ASSET_CLASSES` registry (per `shared/asset-classes.ts`) explicitly throw with a CONFIG_MISSING-style error so adding a new class to the registry fails-loud here until wiring is added.

**OBJ-4.** Audit caller-site uses of `getTelemetryAggregator()` (15 files identified in §0.3 inventory): for each call site, decide whether it should (a) stay on the global singleton because the call is intrinsically crypto-specific (legacy crypto-only consumer), (b) resolve via `getAssetClassInstances(assetClass).telemetry` when an `assetClass` is in scope, or (c) accept REQUIRED-`assetClass` parameter threading at the consumer boundary. Explicit annotation in code comments at each site.

**OBJ-5.** Add observability counters: per-instance `recordPairTelemetry` call counts (by asset class) exposed via a new diagnostic accessor `getTelemetryInstanceStats(): Record<AssetClass, { recordCount: number; lastWriteAt: number | null; pairCount: number }>` (read-only, exported from `asset-class-instances.ts`). Provides the verify-gate signal for §6.

**OBJ-6.** Ensure the `xstock_perp` + `crypto_perp` instances respect the M70 invariant (only VTS may write telemetry — `recordPairTelemetry` rejects callers ≠ `'vts'`). Same guard exists today; the new instances inherit it via `new TelemetryAggregatorService()` construction.

**OBJ-7.** Test coverage: 6 new unit tests covering (a) factory dispatch for each of 4 classes returning the correct triad shape, (b) cross-class isolation guarantee (write to xstock_perp telemetry does NOT alter crypto_spot pool aggregates), (c) the new exhaustive-switch case throws on reserved-future class, (d) RTB-style end-to-end check that `getAssetClassInstances('xstock_perp').ratioManager.computeAdaptiveRatio()` reads from the right TelemetryAggregator instance, (e) `getTelemetryInstanceStats()` accessor accuracy, (f) disk-persist behavior chosen in OBJ-2 (test depends on §3 decision).

**OBJ-8.** Governance: update §0.3 component rows in `SYSTEM_IMPACT_MAP.md` to reflect that asset-class-instances.ts now covers 4 classes; add a new sub-section to `SYSTEM_MANUAL.md` Chapter 10 (Telemetry Aggregator) titled "B79.0n.TELEMETRY — Per-class instance bootstrap" documenting the disk-persist resolution + factory behavior; add §4.19 entry to `ASSET_CLASS_ONBOARDING_WORKFLOW.md` codifying the per-class-instance pattern as the canonical approach when a class owns persistent state.

---

## §3. Architectural decisions + open questions for Langston

**Q1 — Disk-persist resolution for non-crypto_spot instances.** Three options:

- **Variant A (per-class disk paths):** `logs/telemetry_state/aggregator_state_<assetClass>.json` for each class. Each instance arms its own setInterval @ 60s. Resolves the hazard cleanly with no shared-write contention. Cost: 4 setInterval timers + 4 files instead of 1.

- **Variant B (single shared file, per-class keys):** `logs/telemetry_state/aggregator_state.json` becomes a single JSON object keyed by assetClass at the top level. A single coordinator setInterval at module-load time iterates all instances + writes one file. Cost: requires moving the persist machinery OUT of the constructor and INTO a separate `multi-class-persist-coordinator` module; ~80 LOC infrastructure refactor.

- **Variant C (defer persistence for non-crypto_spot until empirically needed):** All non-crypto_spot instances remain in-memory only (matches B79.0a Day-1 resolution for xstock_spot). Pool aggregates rebuild from VTS feeds within 60-120s of restart. Cost: zero infrastructure work this batch, deferred to a later sub-batch (call it B79.0n.TELEMETRY.b) IF Layer 3 calibration evidence requires it.

**CC's recommendation: Variant C for this batch.** Rationale: the disk-persist hazard is real, but cross-class persistence is only valuable for production telemetry continuity across restarts. Today the 4 active classes are: crypto_spot (running live), xstock_spot (running but in BTS/passive-learning mode), xstock_perp (NOT TRADING — sub-batch 18 dependent), crypto_perp (NOT TRADING). For the three non-crypto_spot classes, no persistence loss across restarts has any practical effect today. Persistence can be a follow-up batch when one of the perp classes flips to active trading. This keeps this sub-batch tight (~150 LOC vs ~400 LOC for Variant B).

**Q2 — Exhaustive-switch enforcement for reserved-future classes.** The `ASSET_CLASSES` registry in `shared/asset-classes.ts` has 8 entries (4 active + 4 reserved-future). Should `getAssetClassInstances()` throw on the reserved-future classes (treating any call as a coding error) OR return null with a "deferred" log? **CC recommendation: throw.** Same logic as the existing default case — silently returning null would let downstream code silently use the global singleton for the wrong class. Throw with a clear `[B79.0n.TELEMETRY][CLASS_NOT_WIRED] asset class '<X>' has no telemetry instance yet — call sites must check ASSET_CLASS_REGISTRY[X].active before invoking the factory`.

**Q3 — Caller-site audit boundaries.** OBJ-4 says "decide whether each call site should stay global / resolve via factory / accept threaded assetClass." There are 15 caller files (per §0.3 inventory). Question: do you want CC to thread `assetClass` parameters through API-route call sites (e.g. `/api/market-indicators` should become per-class) — OR is that explicitly out of scope for this batch (the global-singleton crypto reads stay as-is, and the new instances are only consumed by RTB/ARM in sub-batches 11+)? **CC recommendation: out of scope.** This sub-batch ships the structural completeness; UI route per-class extensions happen in their own sub-batches (most likely WIRE-IN #16 + OBSERVABILITY #18). Adding API-route threading here would balloon the batch + collide with not-yet-shipped RTB work.

**Q4 — Telemetry-repository (SQL) per-class column.** `telemetry_history` table has no `asset_class` column today. Add it now (data migration: backfill all existing rows to `crypto_spot` since that's all the table has ever held)? Or defer to TELEMETRY.b when perps actually persist? **CC recommendation: defer.** Same logic as Q1 Variant C — no perp class persists today, so the column has no immediate consumer. When persistence comes, the schema migration ships as part of that batch.

**Q5 — `crypto_spot` factory case.** Today `getAssetClassInstances('crypto_spot')` returns null (callers fall back to global singleton). Should this batch promote `crypto_spot` to also return a proper triad (matching the other 3 classes), eliminating the asymmetry — OR keep the asymmetric pattern because crypto_spot has 18 months of disk-persisted state that we don't want to disturb? **CC recommendation: keep asymmetric.** Promoting crypto_spot to the factory pattern would require migrating the existing global singleton's state into a factory-managed instance, and that's an invasive change with a regression vector against live crypto trading. The asymmetry is documented + intentional (no-touch fence on crypto_spot). Add comments at the factory + at every caller site reinforcing this rule.

---

## §4. Test plan

| Test ID | What | File |
|---|---|---|
| T1 | Factory returns null for crypto_spot, valid triads for the other 3 active classes | `server/tests/unit/b79-0n-telemetry-factory.test.ts` |
| T2 | Cross-class isolation: write to `xstock_perp.telemetry`, assert crypto_spot global singleton's pool aggregates unchanged | `b79-0n-telemetry-isolation.test.ts` |
| T3 | Reserved-future classes throw with the expected `[CLASS_NOT_WIRED]` error message | `b79-0n-telemetry-factory.test.ts` |
| T4 | ARM injection: `getAssetClassInstances('xstock_perp').ratioManager` returns a fresh ARM with the per-class telemetry injected (NOT the global singleton) | `b79-0n-telemetry-arm-injection.test.ts` |
| T5 | `getTelemetryInstanceStats()` accessor returns the correct shape + counts for all 4 active classes | `b79-0n-telemetry-stats.test.ts` |
| T6 | M70 invariant: `xstock_perp.telemetry.recordPairTelemetry(symbol, {caller: 'fx5'})` is rejected with the `[11.4C.1][BLOCKED]` log line | `b79-0n-telemetry-m70.test.ts` |

All 6 new tests + verification that the 9 existing telemetry-aggregator-touching tests (per §0.3 grep) still pass unchanged (crypto_spot path untouched).

---

## §5. Risks

**R-1 (LOW)** — Test environment uses `new TelemetryAggregatorService()` directly + manipulates internal Maps. New tests must NOT pollute the global singleton; each test constructs its own instances + asserts isolation.

**R-2 (LOW)** — Disk-persist hazard resolved by Variant C (in-memory only for new classes). If Langston picks Variant A or B, scope expands by ~100-200 LOC.

**R-3 (LOW)** — Factory exhaustive-switch + reserved-future-throws is a compile-time + runtime guard. New active classes added to the registry without factory wiring will throw at first use. Acceptable failure mode.

**R-4 (MEDIUM)** — `crypto_spot` asymmetry (returns null from factory) is intentional per Q5 but creates a "two paths" cognitive load. Mitigation: add a CLAUDE.md-style header block to `asset-class-instances.ts` explaining the asymmetry + every caller site comment-annotates which path it's using. Already partially in place from B79.

**R-5 (MEDIUM)** — Caller-site audit (OBJ-4) for 15 files is the bulk of the work. Risk that one is missed → mis-routing. Mitigation: grep-based completeness check (per pattern in §0.3) is the compile-driven probe technique that worked for STRATEGY / PATTERN-DETECT / CONFIDENCE-CHAIN.

---

## §6. Verification criteria

**Step 7 first-pass (CC):**
- 4 ASSET_CLASSES.active instances bootstrapped at process boot with `[B79.0n.TELEMETRY][BOOT]` log line per class.
- `getAssetClassInstances('xstock_perp')` + `getAssetClassInstances('crypto_perp')` no longer throw — return valid triads.
- `getTelemetryInstanceStats()` returns 4 active-class rows immediately after boot (recordCount=0, lastWriteAt=null, pairCount=0).
- `xstockSpotScanner` boot path unchanged (legacy xstock_spot instance still bootstraps cleanly).
- No new errors in PM2 logs across a 5-minute window post-restart.
- `getTelemetryAggregator()` global singleton still rehydrates crypto_spot state from disk (no regression on the no-touch path).

**Step 8 second-pass (Langston):**
- Same checks, independent verification via `ssh staging`.
- Spot-check: VTS records crypto telemetry into the global singleton (still working as before). Verifies the no-touch fence held.

**48h verify-gate:**
- Per-class instance counter (`getTelemetryInstanceStats()`): expected zero `recordCount` on xstock_perp + crypto_perp instances over the full 48h window (no live VTS path writes to them yet — those wire in at sub-batches 11/16/18). Any non-zero count signals an early mis-routing → investigate.
- Crypto_spot global singleton `recordCount` increments normally over the 48h window (whatever the active VTS path produces).

---

## §7. Sequencing + sub-batch chunks (Step 3)

| Chunk | What | Files | Estimated LOC |
|---|---|---|---|
| A | Add xstock_perp + crypto_perp cases to `getAssetClassInstances` switch; new `bootstrapXstockPerpInstances` + `bootstrapCryptoPerpInstances` lazy-bootstrap functions; exhaustive-switch with `assertNever`-style helper. | `server/services/asset-class-instances.ts` | ~60 |
| B | Export new `getTelemetryInstanceStats()` accessor from `asset-class-instances.ts` aggregating per-instance counts. | `server/services/asset-class-instances.ts` | ~30 |
| C | Caller-site audit: annotate the 15 files identified in §0.3 with `// [B79.0n.TELEMETRY] global-singleton-by-design — crypto-only consumer` OR `// [B79.0n.TELEMETRY] factory-resolved via getAssetClassInstances(assetClass)` per OBJ-4. No behavioral changes. | 15 files | ~30 (comment-only) |
| D | Boot sequence: ensure all 3 lazy-bootstrap factory functions get pre-warmed at server startup so the [BOOT] log lines fire predictably (otherwise lazy-init defers to first call which may be hours later). | `server/index.ts` | ~10 |
| E | 6 new unit tests per §4. | `server/tests/unit/b79-0n-telemetry-*.test.ts` | ~250 |
| F | Local `npx tsc --noEmit` + `npx vitest run` from the C:\dev mirror per CLAUDE.md §7.1. Verify zero new TS errors + all tests pass. | local | — |

**Total estimated LOC: ~380** (most is test code). Implementation effort: 1-2 hours of focused work. No DB migration. No code-review-blocking surprises expected.

---

## §8. What this batch is NOT

- NOT adding new UI telemetry tabs.
- NOT changing what metrics are captured.
- NOT extending API routes to be per-class.
- NOT migrating the `telemetry_history` SQL table to have an `asset_class` column.
- NOT promoting crypto_spot to the factory pattern (asymmetry stays).
- NOT adding disk persistence for the 3 new instances (in-memory only per Q1 Variant C recommendation).
- NOT touching `vts-telemetry.ts` / `predictive-adjustments.ts` / `skipped-signals-logger.ts` / `cost-telemetry.ts` / `phase15b-dbs-telemetry.ts` — those are crypto-only by design today, deferred to per-batch sub-batches when the corresponding active-trading flip happens.
- NOT touching the AI Transparency / orchestrator telemetry — those are global by design.
- NOT touching System Alerts / Error Logs / Formula Audit / Feed Health — those are global by design.

---

## §9. Open questions for Langston (Step 1 ACK gate)

1. **Q1 disk-persist resolution:** confirm Variant C (in-memory only for new instances) OR direct to A/B.
2. **Q2 exhaustive-switch on reserved-future classes:** confirm throw-on-call OR null-with-deferred-log.
3. **Q3 caller-site audit boundary:** confirm comment-annotation-only (no API-route per-class threading) is the right scope.
4. **Q4 SQL `telemetry_history.asset_class` column:** confirm defer-to-TELEMETRY.b is the right call.
5. **Q5 crypto_spot factory asymmetry:** confirm keep-asymmetric (do NOT promote crypto_spot to factory pattern).
6. **Anything else** Langston flags from the §0 inventory or §2 objectives that's mis-scoped or missing.

Awaiting ACK before Step 2 pre-audit drafting.
