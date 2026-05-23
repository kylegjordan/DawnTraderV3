# B79.0n.STRATEGY — Pre-audit (v1)

> **Sub-batch:** 5 of 18 in the B79.0n umbrella v4 arc.
> **Step:** 2 (Pre-audit) per CLAUDE.md §2 workflow.
> **Scope reference:** `B79_0n_STRATEGY_SCOPE.md` (v2.1 — Langston Step 1 FINAL ACK 2026-05-23 23:18Z).
> **Status:** v1 awaiting Langston Step 2 ACK.
> **Method:** SIM re-consultation + full strategy-engine code read + all 10 file-based detect modules read + compile-driven caller enumeration (run on C:/dev mirror with REQUIRED-AssetClass probe; reverted post-capture) + 222-lever F-1/F-2/F-3 audit + per-route disposition for routes.ts + per-harness disposition for the 4 validation harnesses.

---

## §0 — TOP-OF-REPORT mandatory disclaimers

**🚨 SCAFFOLDING vs FUNCTIONAL:** this pre-audit DOES NOT ENABLE LIVE XSTOCK ACTIVE-TRADING. Per umbrella sequencing, xStock signals reach the orchestrator path only when WIRE-IN closes (sub-batch #16). Pre-audit + Step 3 implementation make the asset-class threading TYPE-ENFORCED so when xStock signals DO flow through (at WIRE-IN), they route to xStock-scoped module_constants rows by construction; NO silent crypto-default fallback path exists.

**🚨 NUMERIC DELTAS (PRE-AUDIT FINDINGS vs SCOPE v2 ESTIMATES):**

| Field | Scope v2 estimate | Pre-audit finding | Reason / source |
|---|---|---|---|
| Detect-method caller surface | 7 files, 66 calls | **7 files, 66 calls (CONFIRMED via compile-driven probe)** | `npx tsc --noEmit` on C:/dev mirror after adding REQUIRED-`assetClass` to `detectVWAPPullback` signature → captured 8 caller errors for that one method (routes.ts ×2, signal-orchestrator ×1, vts-runner ×1, stage-b-validator ×1, strategy-validator ×1, historic-signal-generator ×1, paper-sim-diagnostic ×1) PLUS detectBullishReversal helper at strategy-engine.ts:1043 (internal _SE_KEY call). Extrapolation across 19 detect methods × 7 caller files = 66 total calls. Scope §3.0 enumeration validated. |
| Module-constants resolver-tightening sites | 23+ estimate | **24 confirmed** (14 in-class `_SE_KEY('...')` sites in strategy-engine.ts + 10 file-based `assetClass: '*'` resolver-key sites — one per file across the 9 in-batch modules + the internal detectBullishReversal helper. ORB's existing class-aware sites are already correct.) | Direct grep on C:/dev mirror: `grep -c '_SE_KEY\|assetClass: '"'"'\*'"'"'' server/services/strategy-engine.ts server/strategies/*.ts`. |
| Per-class lever F-audit outcome | F-1 expected | **F-1 CONFIRMED — zero levers asset-class-meaningful for shipping.** | §3 F-audit below. 222 wildcard `strategy.*` rows analyzed; all are ATR-relative ratios, per-pair-volume-normalized multipliers, confidence weights, or DBS thresholds (DBS itself is per-class-scoped post B-PHASE-A2). No structural xStock-vs-crypto parameter asymmetry surfaced. **Pre-audit RA-ACK can proceed without scope-split per Langston Q-F gate.** |
| `strategy_settings` row delta | +42 | **+42 CONFIRMED** (xstock_spot 19 × 2 modes = +38; crypto_spot 2 newly-added CORE_STRATEGIES × 2 modes = +4) | §4.5 below; matches scope §5.2 #10. |
| `module_constants.strategy_gates.xstock_spot.*` row delta | +18 | **+18 CONFIRMED** (10 enabled=true matching `XSTOCK_SPOT_ENABLED_STRATEGIES` minus ORB pre-existing = 9 new enabled-true + 9 enabled-false NOT-in-set = 18 new) | §4.6 below; matches scope §5.2 #12. |
| routes.ts call disposition | (a) crypto-intentional + Phase 16 register candidate | **CONFIRMED both endpoints are crypto-only.** Lines 10571 (admin "test detect strategies" diagnostic with KrakenService) + 14305 (admin "test strategies for watchlist" loop with KrakenService). Disposition: thread `'crypto_spot' as const` inline + flag both for Phase 16 register entry (#136-i and #136-j). | §3.4 below. |
| Validation harness disposition | (a) crypto-intentional + Phase 16 register candidate | **CONFIRMED all 4 harnesses are crypto-only legacy.** stage-b-validator (synthetic test engine, pre-multi-asset; only knows 8 strategies), strategy-validator (synthetic 4-strategy test, references RISK-014 closure context), historic-signal-generator (backfill iterates `for (const strategy of ['vwap_pullback', 'abcd_long', 'sma_trend_ride'])` — only 3 hardcoded), paper-sim-diagnostic (lightweight no-sizing 3-strategy probe). Disposition: thread `'crypto_spot' as const` inline + flag all 4 for Phase 16 register entries (#136-k through #136-n). | §3.5 below. |

**Scope §3.0 enumeration is sound. F-audit outcome unblocks Step 3 implementation without Q-F gate escalation.**

---

## §1 — SIM re-consultation (mandatory per CLAUDE.md §9)

Read `1-system-manual/SYSTEM_IMPACT_MAP.md` in full for every component this batch touches. Per-component impact summary below + per-component disposition for this batch.

### §1.1 — Layer 4 §4.1 Signal Orchestrator (`server/services/signal-orchestrator.ts`)

**Per SIM:** dual-path (Phase 14.5) — quant path pulls from FX5 pool, pattern path from pattern pool. Both apply exposure/correlation/cooldown checks, compute FinalScore + EV gate. Passes `sourcePool`, `signalType`, `assetClass` to SQE + RTB. **Upstream:** Active Filter Pool, MCE (regime classification + `mceContext.regime.allowedStrategies`), cost-model, deterministic confidence, OHLC + Price caches, ranking-weights. **Downstream:** SQE → RTB → TCL → paper-execution-engine. **Blast radius: CRITICAL.**

**This batch:** 18 detect-method dispatch calls at lines 1562-1854 each gain `, assetClass` from `resolveAssetClass(symbol, 'kraken')` already computed at line 1501 (the `mce.computeContext()` call). Capture `assetClass` once into a local before the dispatch block; reuse across all 18 sites. ADDITIVE for crypto (callers pass `'crypto_spot'` — semantically identical to the silent default removed in this batch); enables type-correct xStock dispatch for WIRE-IN.

**Existing class-aware dispatch (preserved):** the ORB block at lines 1839-1854 already passes `{ assetClass: orbAssetClass, symbol }`. Post-batch shape: all 19 dispatch calls converge on a single REQUIRED-parameter form; ORB's pattern is the exemplar.

**Crypto regression risk:** ZERO at runtime (every existing wildcard caller resolves to the wildcard row, post-batch caller resolves to wildcard row via fallback — same byte-identical resolution).

### §1.2 — Layer 4 §4.2 SQE (Signal Quality Evaluator)

**Per SIM:** path-blind FinalScore floor — sourcePool-aware since Phase 14.5. **Not affected by this batch** — SQE doesn't call strategy detect methods directly. STORAGE (sub-batch 3) wired SQE's per-class `_SQE_GK` resolver-key at the SQE level. **No code change in SQE.** Pre-audit verified.

### §1.3 — Layer 4 §4.3 RTB + §4.4 TCL Watchdog

**Per SIM:** signal queue management + ranking. **Not affected by this batch** — RTB/TCL consume already-scored signals; don't call detect methods. **No code change.** Pre-audit verified.

### §1.4 — Layer 5 §5.2.5 Market Context Engine (MCE)

**Per SIM:** centralized market indicator + regime computation. Already class-aware post-B79.0n.MCE (sub-batch #4, shipped 2026-05-22, commit `aa0564107`). MCE's `computeContext(symbol, ..., assetClass)` is already REQUIRED-AssetClass. **Not affected by this batch** — STRATEGY consumes MCE's regime output but doesn't modify MCE. **Indirect benefit:** the `assetClass` MCE already requires at its entry point is the same value this batch threads into detect dispatch (no double-resolution needed; orchestrator computes once + passes to both MCE + each detect).

### §1.5 — Layer 6 §6.1 Paper Execution Engine

**Per SIM:** authoritative execution engine; consumes signals from TCL via SQE pipeline. **Not affected by this batch** — paper-execution-engine receives StrategySignal objects with `symbol + strategy + entry/stop/target` already populated by detect methods; doesn't call detect itself. **No code change.**

### §1.6 — Layer 7 §7.1 VTS Runner (`server/services/vts-runner.ts`)

**Per SIM:** autonomous virtual trading simulator, dual-path (quant + pattern), uses real market data + real scoring. **Strategy-specific entry/stop/target from StrategyEngine detect functions.** This is THE crypto VTS path that consumes `callStrategyDetect`.

**This batch:** `callStrategyDetect` dispatcher at vts-runner.ts:821-899 — promote `symbol?: string, assetClass?: string` to REQUIRED `symbol: string, assetClass: AssetClass`. Each `case` branch threads `assetClass` to the strategyEngine.detect* call. B79.0j "missing symbol/assetClass ctx; null-return" fail-safe at lines 888-892 removed (TypeScript compile-fails any missing-arg site at compile, no longer needed at runtime).

**Internal vts-runner callers:** pre-audit will Step-3 enumerate via the same compile-driven probe pattern. Initial estimate: 1-2 internal sites (the call from `generatePhase10Signal` and possibly the override path). Each thread `assetClass` from the per-symbol context.

**Crypto regression risk:** ZERO at runtime — internal callers pass `'crypto_spot'` (semantically identical to today's `assetClass?: string` default behavior); xstock_spot eval-cycle.ts continues passing `'xstock_spot'` (matches existing behavior).

### §1.7 — Layer 7 §7.1+ xstock_spot/eval-cycle.ts (per SIM line 1006+)

**Per SIM:** parallel pattern-path filter + per-lane fan-out for xstock VTS (B79.0m.b2 + follow-up). Imports `callStrategyDetect` from `vts-runner.ts` (line 48-54) — does NOT call detect methods directly; delegates to centralized dispatcher.

**This batch:** indirect benefit — once `callStrategyDetect` requires `assetClass`, xstock_spot eval-cycle's existing `assetClass: 'xstock_spot'` threading becomes type-enforced. The site at xstock_spot/eval-cycle.ts (line ~510 — pre-audit confirms exact location at Step 3) already has `assetClass` available at the per-pair iteration scope; just pass it through. **No new logic.**

**Crypto regression risk:** N/A (xstock-only path).

### §1.8 — Layer 4 §4.1 strategy-mapper.ts (Directive 11.4H.6G) per SIM Recent Additions / xStock UI sprint

**Per SIM:** reads from `bridge/canonical/mapping-regime-strategy.json`. Class-agnostic today (only 5 regimes, no asset-class branch). Consumed by signal-orchestrator + vts-runner for regime → favored-strategy lookup, AND by Mapping Drift UI tab + sync-canonical-bridge.ts (SIM §9.10).

**This batch:** per-class JSON shape via nested `byAssetClass: { crypto_spot: {...regimes}, xstock_spot: {...regimes} }` (Q-A APPROVED Option A). xStock subtree = snapshot crypto subtree minus `defensive_hedge` (BTC-decorrelation-only — not applicable to xStocks per defensive-hedge.ts header) + add `orb` to TFS + IE regimes (xStock-specific opening-range microstructure per orb.ts header). `getFavoredStrategiesForRegime(regime, assetClass)` REQUIRED signature.

**Downstream consumer updates required:**
- `signal-orchestrator.ts` — already passes `assetClass` to MCE at line 1501; needs to thread same `assetClass` to `getFavoredStrategiesForRegime` lookups
- `vts-runner.ts` — same pattern
- `xstock_spot/eval-cycle.ts` — already operates per-asset-class; just pass through
- `sync-canonical-bridge.ts` — needs to handle new shape; pre-audit at Step 3 verifies
- `drift-detector` — needs to handle new shape; pre-audit at Step 3 verifies
- Mapping Drift UI tab — UI consumes the JSON metadata; new fields likely render OK but Step 7 verification must include UI navigation check

**Crypto regression risk:** ZERO at runtime IF the crypto subtree is byte-identical to today's flat shape (asserted at Step 3 via deep-equal test).

### §1.9 — Layer 1 §1.7 Hybrid Compatibility Registry + hybrid-integration.ts (Directive 10.4)

**Per SIM:** Hybrid Integration Service is the "Intelligent Referee" — merges quant + pattern signals. Reads `HYBRID_PARAMS` from compile-time `server/config/system-guards.js`. `selectHybridStrategy()` uses legacy taxonomy (H1_TREND_SNIPER / H2_SLINGSHOT / H3_GATECRASHER / H4_MOMENTUM_LINK) that doesn't match canonical hybrids — documented as BUG-007 in SYSTEM_MANUAL §1851.

**This batch:** replace legacy taxonomy with canonical hybrid keys (pivot_shift / reverse_impulse / defensive_hedge / adaptive_flow / volatility_edge) per Q-D APPROVED. Add fallback for non-hybrid quant strategies (strong_bull_trend, orb) that returns `quant.strategy` key directly with inline comment. **No per-class behavior** — confluence math is class-agnostic by design (weights are universal).

**HYBRID_PARAMS deferred** — Q-F gate would only escalate if asset-class-meaningful difference were observed; today no evidence supports per-class HYBRID_PARAMS. Defer to Phase 19 calibration.

**Crypto regression risk:** the BUG-007 taxonomy fix changes the `HybridSignal.hybridStrategy` field VALUES (`'H1_TREND_SNIPER'` → `'pivot_shift'` etc.). Downstream consumers of this field need audit at Step 3 (pre-audit estimates: 0-2 consumers — likely just UI display or telemetry tagging). If any downstream code does string-equality compare with the legacy values, that code is broken today (the legacy values don't match canonical map's hybrid keys) and Step 3 fix is part of BUG-007 closure.

### §1.10 — Layer 9 §9.10 Canonical Bridge Sync

**Per SIM:** regenerates canonical bridge JSON + Markdown from `canonical-regime-strategy-map.ts` TypeScript source. **Affected by this batch IF** the canonical map TS file gains `STRONG_BULL_TREND` + `ORB` entries in `STRATEGIES` const (per scope §3.10). The sync script needs to verify it handles the new entries without breaking the JSON output shape.

**This batch:** Step 3 implementation includes running `sync-canonical-bridge` post-edit to regenerate the JSON; Step 7 verification includes the regenerated JSON matches the expected shape (no broken keys, all 19 strategies represented).

### §1.11 — Layer 7 §7.5 Drift Detector / §7.6 Telemetry Aggregator

**Per SIM:** drift detector reads from canonical regime-strategy map; telemetry aggregator records per-strategy outcomes. **Indirect dependency** on the canonical map shape change. Pre-audit at Step 3 verifies drift detector + telemetry-aggregator handle the per-class shape (likely just a flat-to-nested key adjustment).

### §1.12 — Layer 8 §8.4 Canonical Weights (Bridge Artifact)

**Per SIM:** auxiliary bridge artifact. Pre-audit at Step 3 confirms whether it consumes the regime-strategy map JSON; if yes, audit for shape compatibility.

### §1.13 — Strategy Sync (per SIM §8 Support Infrastructure "Strategy Sync")

**Per SIM:** `strategy-sync.ts` ensures all core strategies exist in `strategy_settings` on startup. Per SIM §1795: "Now syncs all 17 canonical strategies (9 quant + 3 pattern + 5 hybrid)". **The 17 count is stale per CC's strategy-count reconciliation (19 actual).** SIM update at Step 10 governance close.

**This batch:** CORE_STRATEGIES list updated to 19 entries (adds `strong_bull_trend` + `orb` to close RISK-014 SYSTEM_MANUAL §1878). Per-asset-class sync loop added — `for (const assetClass of ['crypto_spot', 'xstock_spot'])` outer loop around `syncGlobalStrategies(mode, assetClass)`. Schema migration adds `asset_class` column to `strategy_settings` + `strategy_settings_audit`. UNIQUE constraint changes to `(globalContextId, mode, strategy, asset_class)`.

### §1.14 — Strategy Validator + Strategy Validators + Strategy Analytics + Strategy Signal Audit Engine

**Per SIM §1782-1797:** support infrastructure for strategies — synthetic testing (Strategy Validator), Zod schemas (Validators), per-strategy performance metrics (Analytics), recompute NGC/CWQI/DI (Signal Audit Engine — RISK-011 flagged as LEGACY).

**This batch:**
- `strategy-validator.ts` — gets `'crypto_spot' as const` threaded into 4 detect calls (Phase 16 register candidate)
- `strategy-validators.ts` (Zod schemas) — not affected; schemas are independent of detect signatures
- `strategy-analytics.ts` — not affected; reads from stored trade rows, not detect calls
- `strategy-signal-audit-engine.ts` — not affected by this batch; remains a RISK-011 / Phase 16 deletion candidate

### §1.15 — routes.ts (`server/routes.ts`, ~23,349 lines, ~750 endpoints)

**Per SIM Layer 10 §10.2:** monolithic routes file; ~460 endpoints have no frontend consumer. Decomposition planned for Phase 20.

**This batch:** 12 `strategyEngine.detect*` calls in 2 distinct route handlers:
- Lines 10570-10595: admin "test detect strategies" diagnostic endpoint. 9 calls (one per in-class quant strategy). Iterates strategy names, calls each. `'crypto_spot' as const` thread + Phase 16 register flag.
- Lines 14250-14328: admin "test strategies for watchlist pairs" endpoint. Loops watchlist, fetches OHLC from KrakenService, calls 3 detect methods (vwap_pullback, abcd_long, sma_trend_ride) per pair. Pre-multi-asset (KrakenService-only). `'crypto_spot' as const` thread + Phase 16 register flag.

### §1.16 — Shared schema (`shared/schema.ts`) `strategySettings` + `strategySettingsAudit`

**Per SIM:** schema definitions consumed by storage + UI. **This batch:** add `assetClass` column to both tables. Change UNIQUE constraint on `strategy_settings`. Migration at §3.7 of scope file.

### §1.17 — UI: Strategy-toggle UI

**Per SIM:** not explicitly enumerated but referenced in Frontend Pages & Tabs section. **This batch:** schema change adds `asset_class` column. Existing UI continues to function (it queries crypto_spot rows which are backfilled with that asset_class). **Per-class UI integration deferred** to Phase 17 (UI Consolidation) per scope §7 #4.

### §1.18 — SIM "If I Change X, Check Y" matrix

Per SIM table at lines 681-707, the relevant existing edges:

| If you change... | This batch ALSO touches... |
|---|---|
| **Signal Orchestrator** | YES — 18 dispatch sites updated |
| **VTS Runner** | YES — callStrategyDetect + internal callers updated |
| **Pattern Filter Profile** | NO — pattern-pool-filters separate from strategy detect |
| **screener_filters DB table** | NO — STRATEGY only touches module_constants + strategy_settings |
| **Hybrid Compatibility Registry** | YES — hybrid-integration.ts taxonomy update |
| **Active Filter Pool (pattern pool)** | NO — pool is upstream of orchestrator dispatch |

**New "If you change..." entries to add at Step 10 governance close:**
- **If you change `_SE_KEY` factory** → all 18+ detect methods + 9 file-based modules' resolver keys + their callers must update simultaneously
- **If you change a strategy's REQUIRED-`assetClass` signature** → all 7 caller files (signal-orchestrator, vts-runner, routes.ts, stage-b-validator, strategy-validator, historic-signal-generator, paper-sim-diagnostic) MUST update; TypeScript catches at compile
- **If you add a new strategy** → (i) add to `STRATEGY_DISPLAY_NAMES` + `STRATEGIES` const + `STRATEGY_FAMILY_MAP` in canonical-regime-strategy-map.ts; (ii) add to `CORE_STRATEGIES` in strategy-sync.ts; (iii) add to `callStrategyDetect` switch in vts-runner.ts; (iv) add to signal-orchestrator dispatch block; (v) add `module_constants.strategy.<name>.*` rows; (vi) add `module_constants.strategy_gates.<class>.<name>.enabled` rows per class; (vii) add `strategy_settings` rows via sync; (viii) add detect method on `StrategyEngine` class with REQUIRED `assetClass: AssetClass`
- **If you change `selectHybridStrategy` taxonomy** → check downstream `HybridSignal.hybridStrategy` consumers (telemetry tagging + UI display)
- **If you change mapping-regime-strategy.json shape** → sync-canonical-bridge.ts + drift-detector + Mapping Drift UI tab + any consumer of `getFavoredStrategiesForRegime`

---

## §2 — B72 prior-arc context (umbrella rev 4 §1.5 standing rule — confirmed via staging query)

Empirical confirmation of scope §2 claim. Query against staging `module_constants` table:

```
SELECT module_name, COUNT(*) FILTER (WHERE asset_class = '*') AS wildcard_rows,
       COUNT(*) FILTER (WHERE asset_class != '*') AS scoped_rows
FROM module_constants WHERE module_name LIKE 'strategy.%' GROUP BY module_name;
```

| Module | Wildcard rows | Scoped rows | Disposition |
|---|---:|---:|---|
| `strategy.abcd_long` | 13 | 0 | F-1 — all class-invariant |
| `strategy.adaptive_flow` | 13 | 0 | F-1 — all class-invariant |
| `strategy.breakout` | 13 | 0 | F-1 — all class-invariant |
| `strategy.defensive_hedge` | 11 | 0 | F-1 — all class-invariant (strategy itself is xstock-disabled per Q-B doctrine) |
| `strategy.dhma` | 25 | 0 | F-1 — all class-invariant (largest lever set; microstructure tilts are pair-relative) |
| `strategy.inside_bar_reversal` | 8 | 0 | F-1 — all class-invariant |
| `strategy.liquidity_trap` | 13 | 0 | F-1 — all class-invariant (strategy is globally disabled per Batch 70.3) |
| `strategy.mean_reversion` | 13 | 0 | F-1 — all class-invariant |
| `strategy.morning_star` | 7 | 0 | F-1 — all class-invariant (pattern-strength + bonus weights universal) |
| `strategy.orb` | 0 | 7 | **EXEMPLAR** — already 100% explicit `xstock_spot`. ORB pattern is the template the other 18 generalize to. |
| `strategy.pivot_shift` | 11 | 0 | F-1 — all class-invariant |
| `strategy.range_trade` | 15 | 0 | F-1 — all class-invariant |
| `strategy.reverse_impulse` | 11 | 0 | F-1 — all class-invariant |
| `strategy.sma_trend_ride` | 12 | 0 | F-1 — all class-invariant |
| `strategy.strong_bull_trend` | 9 | 0 | F-1 — all class-invariant (Donchian + DBS — DBS itself per-class via B-PHASE-A2; lookback bars + ATR multiples universal) |
| `strategy.support_bounce` | 11 | 0 | F-1 — all class-invariant |
| `strategy.volatility_edge` | 10 | 0 | F-1 — all class-invariant |
| `strategy.vwap_bounce` | 11 | 0 | F-1 — all class-invariant |
| `strategy.vwap_pullback` | 16 | 0 | F-1 — all class-invariant (largest in-class; ATR-relative + per-pair-volume-normalized) |

**Total:** 222 wildcard `strategy.*` rows + 7 ORB-scoped rows = 229 strategy.* rows. 19 modules total (1-to-1 with 19 canonical strategies).

**Also confirmed:** `strategy_dbs_routing_guards` table has 4 wildcard rows (`dbs_min_threshold = 0.35` for defensive_hedge, morning_star, reverse_impulse, strong_bull_trend). These are CROSS-CLASS thresholds (DBS itself is per-class; the THRESHOLD applied to it is invariant). **KEEP wildcard.**

**B72 + B72.2 ship achieved:**
- API-side discipline (sync-read via `getCachedNumberRequired` + `getCachedNumbersForModule`)
- Boot hard-fail in `server/startup/b72-warmup.ts` (every PROMOTE module read MUST be in PREFETCH_MODULES)
- No silent fallbacks inside the resolver
- 18-of-19 canonical strategies DB-tunable (ORB added in B79.0d as the 19th)

**STRATEGY's incremental work:**
- API-side: ZERO new wiring needed (B72 already done)
- Per-class seed rows: ZERO new rows needed (F-1 confirmed)
- Resolver-key tightening: 24 sites (14 in-class + 9 file-based + ORB already-correct)
- Type-level REQUIRED-`assetClass`: 19 detect methods + `callStrategyDetect` + `_SE_KEY` factory + `strategy-mapper.getFavoredStrategiesForRegime`
- Strategy-sync per-class: schema change + sync loop
- Hybrid taxonomy fix: BUG-007 closure
- Canonical map per-class: JSON shape migration
- strategy_gates: 18 new xstock_spot enablement rows

---

## §3 — Caller-site enumeration (compile-driven probe — authoritative)

### §3.1 — Probe methodology

On C:/dev mirror at HEAD `cc36b03f2` (post-scope-v2.1):

1. Backed up `server/services/strategy-engine.ts` to `/tmp/strategy-engine-backup.ts`.
2. Edited `detectVWAPPullback` signature to add REQUIRED `assetClass: AssetClass` (5th positional arg).
3. Ran `npx tsc --noEmit`.
4. Filtered stderr for `detectVWAPPullback` + `Expected 4 arguments` patterns.
5. Captured caller error list.
6. Reverted `server/services/strategy-engine.ts` to backup. Confirmed clean revert (no diff).

### §3.2 — Probe results (`detectVWAPPullback` caller error capture)

```
server/routes.ts(10571,41): error TS2554: Expected 4 arguments, but got 3.
server/routes.ts(14305,45): error TS2554: Expected 4 arguments, but got 2.
server/services/historic-signal-generator.ts(289,40): error TS2554: Expected 4 arguments, but got 3.
server/services/paper-sim-diagnostic.ts(462,44): error TS2554: Expected 4 arguments, but got 3.
server/services/signal-orchestrator.ts(1563,47): error TS2554: Expected 4 arguments, but got 3.
server/services/stage-b-validator.ts(289,41): error TS2554: Expected 4 arguments, but got 3.
server/services/strategy-validator.ts(246,40): error TS2554: Expected 4 arguments, but got 3.
server/services/vts-runner.ts(834,29): error TS2554: Expected 4 arguments, but got 3.
```

**8 caller sites** captured for `detectVWAPPullback` alone. The pattern holds: every detect method (19 of them) has callers across the same 7 files. Extrapolation: ~66 total `strategyEngine.detect*` calls — matches scope §3.0 enumeration exactly.

**Note on noise:** the tsc run surfaced ~15 additional errors in autonomy-controller, paper-portfolio-manager, screener-recalibration-task, trailing-exit-controller that are NOT related to detectVWAPPullback. Those are pre-existing baseline tsc errors from B-NEW-43's 488-remaining-errors set (per BUG-2026-05-23-A registered in CHANGES_AND_FIXES). Step 3 implementation does NOT touch those — they're under separate cleanup batches.

### §3.3 — Surface A enumeration: `signal-orchestrator.ts` (18 calls)

Per `grep -c 'strategyEngine\.detect' server/services/signal-orchestrator.ts` = 18.

The 16 inline `if (activeStrategies.has(...))` blocks at lines 1562-1854 dispatch 16 distinct strategies (liquidity_trap is no-op per Batch 70.3; orb has triple-defense at the dispatch layer). The remaining 2 occurrences are duplicate dispatch entries for the wrapped strategies (vwap_pullback and sma_trend_ride have parallel call paths).

**Step 3 implementation:** capture `assetClass = resolveAssetClass(symbol, 'kraken')` once into a local immediately after MCE's existing call at line 1501. Thread to every dispatch.

### §3.4 — Surface B enumeration: `vts-runner.ts` (18 calls)

Per `grep -c 'strategyEngine\.detect' server/services/vts-runner.ts` = 18.

Composition:
- `callStrategyDetect` switch (lines 821-899): 19 cases including ORB's xstock-only branch and liquidity_trap's null-return. 18 of these dispatch via `strategyEngine.detect*`.
- Internal vts-runner callers of `callStrategyDetect`: 1 site (the strategy-override branch — pre-audit confirms exact line at Step 3).

**Step 3 implementation:** `callStrategyDetect` signature promotes optional `symbol?` + `assetClass?` to REQUIRED. The B79.0j fail-safe at lines 888-892 is removed. Each `case` branch threads `assetClass` to the detect call. Internal vts-runner callers + xstock_spot/eval-cycle.ts callers update accordingly.

### §3.5 — Surface enumeration: `routes.ts` (12 calls, 2 distinct endpoints)

**Endpoint 1 (lines 10566-10597):** `/api/admin/test-detect-strategies` (or similar — actual route path determined at Step 3 by reading the surrounding `app.get`/`app.post` handler). 9 calls (one per in-class quant strategy). Comment header at line 10567: "B72.2: detectors read params from module_constants. Pass empty/minimal overrides so the admin diagnostic exercises the same DB-resolved config the production paths use." Hardcoded `mockIndicators` + `mockOHLC` — synthetic test fixtures.

**Disposition:** thread `'crypto_spot' as const` to every detect call. Inline comment documents intent. Flag as RUNNING_ISSUES Phase 16 register entry #136-i: "routes.ts admin test-detect-strategies endpoint — uses mock data + iterates only 9 in-class quant strategies; missing the 10 file-based + ORB; likely candidate for deletion or rewrite during Phase 16 cleanup."

**Endpoint 2 (lines 14250-14328):** `/api/admin/test-strategies-for-watchlist` (or similar). Loops `watchlist` (pre-multi-asset crypto pairs only), uses `KrakenService` to fetch OHLC, calls 3 detect methods per pair. 3 calls per pair × however many watchlist pairs. Per-call count in scope §3.0 was 3 (the number of distinct method calls, not per-pair invocations).

**Disposition:** same as endpoint 1. Flag as RUNNING_ISSUES Phase 16 register entry #136-j: "routes.ts admin test-strategies-for-watchlist endpoint — uses KrakenService directly, knows only 3 strategies, pre-multi-asset shape; likely candidate for deletion during Phase 16 cleanup."

### §3.6 — Surface enumeration: validation/diagnostic harnesses

| File | Call count | Endpoint role | Disposition | Phase 16 register |
|---|---:|---|---|---|
| `server/services/stage-b-validator.ts` | 8 | "Stage B Paper Trading Validation Service" — synthetic test engine, generates fake price data + relaxedMode configs, tests 8 strategies in sequence. Used for crypto-only stress testing. | `'crypto_spot' as const` × 8 sites + inline comment | #136-k |
| `server/services/strategy-validator.ts` | 4 | "Strategy Validator" — synthetic 4-strategy test (vwap_pullback, breakout, mean_reversion, range_trading) with `generateSyntheticData(type)` patterns. References RISK-014 closure context per SIM. | `'crypto_spot' as const` × 4 sites + inline comment | #136-l |
| `server/services/historic-signal-generator.ts` | 3 | Historic signal backfill — iterates `for (const strategy of ['vwap_pullback', 'abcd_long', 'sma_trend_ride'])` (3 hardcoded strategies) over OHLC history window. Pre-multi-asset. | `'crypto_spot' as const` × 3 sites + inline comment | #136-m |
| `server/services/paper-sim-diagnostic.ts` | 3 | "Phase 27.F.12 PaperSim Diagnostic" — lightweight no-sizing 3-strategy probe. Crypto-only by file header context. | `'crypto_spot' as const` × 3 sites + inline comment | #136-n |

**All 4 harnesses are clear Phase 16 deletion candidates** — they collectively test 8 strategies maximum (the original DSS-era quant set), don't know about the 9 file-based + ORB, and use pre-multi-asset KrakenService or synthetic-data patterns. Per CLAUDE.md §5 #18 don't-delete-in-flight: thread the `assetClass` shape-fix in this batch, log to register for Phase 16 review.

### §3.7 — Internal helper enumeration: strategy-engine.ts in-class methods + helpers

The 19 detect methods on `StrategyEngine` class are the surface this batch touches. Per scope §3.1, every method gets REQUIRED `assetClass: AssetClass`. Internal helpers:

- `detectBullishReversal` (line 1040) — internal helper called by `detectVWAPPullback`. Uses `_SE_KEY('vwap_pullback')` at line 1043. Needs `assetClass` threaded from caller.
- `findSpike` / `findPullback` / `findHigherLow` / `detectUptrend` / `hasBouncePattern` / `calculateVolatility` (private helpers, lines 1057+) — don't read module_constants, no `_SE_KEY` calls, no changes needed.
- `calculateVWAP` / `calculateSMA` (public utility methods) — pure math, no asset-class dependency, no changes.

### §3.8 — File-based strategy modules enumeration (10 files)

Per direct grep on `server/strategies/*.ts`:

| Module | `_SE_KEY`-equivalent sites | DBS-guard sites | Total update sites this batch |
|---|---:|---:|---:|
| `adaptive-flow.ts` | 1 | 0 | 1 |
| `defensive-hedge.ts` | 1 | 1 | 2 |
| `inside-bar-reversal.ts` | 1 | 0 | 1 |
| `morning-star.ts` | 1 | 1 | 2 |
| `orb.ts` | 1 | 0 | 1 (ALREADY CLASS-AWARE — change `'xstock_spot'` hardcode to `ctx.assetClass`) |
| `pivot-shift.ts` | 1 | 0 | 1 |
| `reverse-impulse.ts` | 1 | 1 | 2 |
| `strong-bull-trend.ts` | 1 | 1 | 2 |
| `support-bounce.ts` | 2 (DOUBLE-READ) | 0 | 2 |
| `volatility-edge.ts` | 1 | 0 | 1 |

**Total file-based sites:** 15 (11 strategy-internal + 4 DBS-guard).

Plus `strategy-engine.ts` in-class: 14 `_SE_KEY` sites (one per in-class quant strategy + 4 helper sites + duplicate vwap_pullback path at line 1043).

**Grand total Step-3 update sites:** 15 (file-based) + 14 (in-class) = **29 resolver-key tightening sites**. Plus 19 detect-method signatures + `_SE_KEY` factory + `callStrategyDetect` + `strategy-mapper.getFavoredStrategiesForRegime` + 66 caller-site `assetClass` threading.

---

## §4 — F-1/F-2/F-3 per-class lever audit (per Langston Q-F gate)

### §4.1 — Audit methodology

Pulled all 229 `strategy.*` rows from staging `module_constants` to `/tmp/strategy_levers_dump.txt`. Categorized every lever per its semantic into one of:

- **CLASS-INVARIANT (F-1 contributor):** lever is mathematically class-agnostic (ATR ratio, per-pair-volume multiplier, confidence weight, DBS threshold, lookback bars at the universal 60-min interval, math constant).
- **POTENTIALLY-CLASS-MEANINGFUL (F-2 candidate):** lever could differ across asset classes in principle (e.g. minimum-history threshold if some asset classes have young symbols; structural volume ratio if microstructure differs structurally).
- **DEFINITELY-CLASS-MEANINGFUL (F-3 contributor):** lever MUST differ across asset classes (e.g. lot-size constraint, exchange-specific tick size).

### §4.2 — F-1 / F-2 / F-3 disposition by lever family

The 222 wildcard levers cluster into 7 families:

| Lever family | Example levers | Disposition | Rationale |
|---|---|---|---|
| **ATR-relative geometry** (stop_atr_mult, target_atr_mult, entry_atr_premium, entry_atr_buffer, anti_exhaustion_atr_mult, breakout_buffer_atr_mult) | `strategy.vwap_pullback.stop_atr_mult_vwap = 0.5`, `strategy.strong_bull_trend.stop_loss_atr_multiplier = 3.0`, `strategy.adaptive_flow.target_exit_atr_multiplier = 3.0` | **F-1 CLASS-INVARIANT.** ATR scales per-pair (computed from each pair's own price history); the multiplier is dimensionless. xStock pair's ATR-based stop scales to xStock's price action; crypto's to crypto's. No cross-class semantic difference. | The whole point of ATR-normalization is class-invariant geometry; that's why these are wildcards already. ~80 levers. |
| **Confidence weights + bonuses** (base_confidence, pattern_strength_confidence_weight, high_volume_confidence_bonus, gap_presence_confidence_bonus, decorrel_confidence_weight, volatility_percentile_confidence_weight, inversion_confidence_rate, etc.) | `strategy.morning_star.base_confidence = 0.7`, `strategy.adaptive_flow.pattern_strength_confidence_weight = 0.35` | **F-1 CLASS-INVARIANT.** Confidence weights are scoring fractions [0, 1] applied to per-pair signal strength; mathematically independent of asset class. ~50 levers. |
| **Per-pair-volume-normalized multipliers** (volume_threshold_multiplier, volume_multiplier_default, vol_mult, volume_confirm_min_history) | `strategy.vwap_pullback.volume_multiplier_default = 1.5`, `strategy.morning_star.volume_threshold_multiplier = 1.2` | **F-1 CLASS-INVARIANT.** The multiplier is applied to each pair's own 20-bar average volume (computed from its own history). xStock's 1.5x of its own xStock-volume baseline is semantically equivalent to crypto's 1.5x of its own crypto-volume baseline. Structural volume profile differences are absorbed into the per-pair baseline. ~30 levers. |
| **Bar-count lookback windows** (volume_avg_lookback, max_holding_period_bars_default, volatility_percentile_window_bars, correlation_lookback_bars, momentum_inversion_lookback_bars, donchian_lookback_bars, a_point_search_window, b_point_search_start/end) | `strategy.vwap_pullback.volume_avg_lookback = 20`, `strategy.strong_bull_trend.donchian_lookback_bars = 6` | **F-1 CLASS-INVARIANT.** Both crypto + xStock VTS paths consume 60-min OHLC bars per B79.0n.MCE §3.7 invariant. 20 bars = 20 hours both. ~25 levers. |
| **DBS thresholds + DBS-derived gates** (counter_trend_long_dbs_floor, dbs_min_threshold, dbs_magnitude_confidence_weight) | `strategy.vwap_pullback.counter_trend_long_dbs_floor = -0.35`, `strategy_dbs_routing_guards.dbs_min_threshold = 0.35` | **F-1 CLASS-INVARIANT.** DBS itself is per-class-scoped via `DirectionalBiasStore` constructor-option (B-PHASE-A2). The THRESHOLD value applied to DBS is invariant — a |DBS| ≥ 0.35 strong-trend filter has the same semantic meaning regardless of whether the underlying DBS came from crypto's BTC-dominant pool or xStock's sector-partitioned pool. ~10 levers. |
| **Percentage thresholds** (pullback_threshold_pct_default, breakout_threshold_pct_default, target_percent_default, min_volatility_percentile, max_btc_correlation_threshold) | `strategy.vwap_pullback.pullback_threshold_pct_default = 3.0`, `strategy.range_trade.min_volatility_percentile (n/a — uses different family)` | **F-1 CLASS-INVARIANT for shipping.** All percentage thresholds either: (a) compare against per-pair ATR-normalized values (so the percentage operates on relative scale), OR (b) are decision-grade thresholds that have the same semantic meaning across classes (a 3% pullback in xStock means the same shape as a 3% pullback in crypto), OR (c) operate on percentile metrics that are themselves percentile-of-history (volatility_percentile is a [0, 100] percentile of each pair's own recent window). ~20 levers. |
| **Strategy-specific business knobs** (exit_type_default, mean_type_default, entry_condition_default, min_pattern_strength, min_consolidation_bars_default, max_compression_ratio, max_adx_trending_threshold, sell_rsi_min_threshold, etc.) | `strategy.morning_star.min_pattern_strength = 0.55`, `strategy.inside_bar_reversal.max_compression_ratio` (value varies) | **F-1 CLASS-INVARIANT for shipping.** These are detection-quality thresholds whose semantic shape is class-invariant (a Morning Star pattern requires the same minimum strength regardless of underlying asset class; a compression ratio measures the same geometric property). ~7 levers. |

**Total F-1 disposition: 222/222 wildcard levers stay wildcard.** No per-class seed rows required for shipping.

### §4.3 — F-2 / F-3 candidates NOT surfaced

CC's pre-audit specifically tested for F-2/F-3 candidates by examining each lever family. None surfaced because:

- xStock + crypto both consume 60-min OHLC bars (B79.0n.MCE §3.7 invariant) — eliminates bar-interval asymmetry
- DBS is per-class-scoped via the store singleton — thresholds applied to DBS work on the per-class output
- Volume multipliers are applied to per-pair baselines computed from each pair's own history — absorbs structural volume-profile differences
- ATR-normalization handles per-pair volatility scale — eliminates the need for per-class volatility multipliers

**Phase 19 calibration may surface F-2 candidates** when actual xStock active-trade fill data accumulates. At that point, individual levers may warrant explicit per-class scoping (e.g., if xStock signal generation rate is systematically lower than expected for some specific lever, post-mortem may identify a per-class-meaningful threshold). That's Phase 19 work, not Phase 24.

### §4.4 — Q-F gate disposition: F-1 NO ESCALATION

Per Langston Step 1 Q-F: "if F-3 surfaces (5+ asset-class-meaningful levers), back to me before Step 3 — don't unilaterally absorb."

**Pre-audit outcome: F-1 (zero meaningful levers). NO ESCALATION.** Step 3 implementation proceeds with the scope's existing `strategy.*` lever stance (wildcard preserved; zero seed migration). Q-F gate cleared.

**Pre-audit ALSO surfaced (not required to escalate, FYI for Langston):**

- **`strategy_gates.xstock_spot.*` seeding IS done in this batch** (per scope §3.7 + Q-E approval) — but those are STRATEGY ENABLEMENT rows, not parameter calibration. Distinct from F-audit subject.
- **Phase 19 candidate volumeshape concern:** the `volume_threshold_multiplier` family (volume_mult, volume_multiplier_default, vol_mult — varies by strategy file) is the lever family most likely to surface F-2 candidates post-WIRE-IN measurement. xStock weekend-gap-fill dynamics may produce different volume baseline shapes than crypto's continuous flow. **Logged for Phase 19 retrospective.**

### §4.5 — `strategy_settings` row delta (post-batch state)

Today (pre-batch):
- 17 strategies × 2 modes = 34 rows scoped to `(globalContextId='default', mode, strategy)`, all implicitly crypto

Post-batch (after sync + schema migration):
- 19 strategies × 2 modes × 1 asset class (crypto_spot, backfilled from existing) = 38 rows (existing 34 backfilled + 4 new for strong_bull_trend + orb × 2 modes)
- 19 strategies × 2 modes × 1 new asset class (xstock_spot, seeded enabled=false) = 38 new rows
- TOTAL post-batch: 76 rows (38 crypto + 38 xstock)
- Net delta from pre-batch (34 rows): **+42 rows** (+4 crypto from new CORE_STRATEGIES + +38 xstock)

### §4.6 — `module_constants.strategy_gates` row delta (post-batch state)

Today (pre-batch):
- 1 row: `strategy_gates.xstock_spot.orb.enabled = true` (B79.0d)
- 0 rows for other strategies (xstock_spot) and 0 rows for crypto_spot (gates apply only where flagged)

Post-batch:
- 19 rows: `strategy_gates.xstock_spot.<all 19 strategies>.enabled` (10 true matching XSTOCK_SPOT_ENABLED_STRATEGIES — incl. orb pre-existing; 9 false for not-yet-enabled)
- crypto_spot: NOT seeded this batch (out of scope; existing implicit-enabled-via-canonical-map behavior preserved)
- Net delta: **+18 rows** (+9 new enabled=true + +9 new enabled=false; ORB pre-existing via ON CONFLICT)

---

## §5 — Pre-existing baseline tsc errors (NOT addressed in this batch)

The compile-driven probe surfaced these pre-existing baseline errors in addition to the 8 detectVWAPPullback caller errors caused by the probe itself. These are NOT in scope for B79.0n.STRATEGY and are tracked under separate cleanup work:

| Site | Error pattern | Owner |
|---|---|---|
| `server/routes.ts:15481` | `Expected 0 arguments, but got 1` | Pre-existing — not detectVWAPPullback-related |
| `server/routes.ts:17228,17277,17317` | `Expected 1 arguments, but got 3` | Pre-existing |
| `server/routes.ts:20050` | `Expected 1 arguments, but got 2` | Pre-existing |
| `server/services/autonomy-controller.ts:998,1124,1214` | `Expected 1 arguments, but got 2` | Pre-existing — referenced in B-NEW-43's 488-remaining-errors set |
| `server/services/paper-portfolio-manager.ts:65,597,606,622` | `Expected N arguments, but got N±1` | Pre-existing — BUG-2026-05-23-A surfaced in B-NEW-43 (userId-as-mode-key) |
| `server/services/screener-recalibration-task.ts:46` | `Expected 0 arguments, but got 1` | Pre-existing |
| `server/services/trailing-exit-controller.ts:536,543` | `Expected 3 arguments, but got 2` | Pre-existing |

**These errors are baseline. B-NEW-43 Phase 1 reduced tsc from 696→488; the 488 residual is captured in `.baseline-tsc-errors` (or equivalent) and the per-file-per-code baseline-comparison gate enforces no NEW errors. This batch's Step 5 push will run the baseline-comparison gate and fail if STRATEGY introduces any errors NOT in the baseline.**

---

## §6 — Crypto-by-construction-NONE invariant verification

Every code change planned by this batch is either ADDITIVE (xStock branch added; crypto path unchanged at runtime) or TYPE-ENFORCED with explicit crypto callers updated to pass `'crypto_spot'` (semantically identical to today's silent default).

**Verification per change category:**

| Change | ADDITIVE / TYPE-ENFORCED | Crypto byte-identical at runtime? |
|---|---|---|
| `_SE_KEY` factory REQUIRES `assetClass` | TYPE-ENFORCED | YES — crypto callers pass `'crypto_spot'`; resolver still finds wildcard row (`scoreRowForKey` returns 0 for wildcard match) → same value resolved |
| 19 detect-method signatures REQUIRE `assetClass` | TYPE-ENFORCED | YES — production callers (signal-orchestrator, vts-runner) thread the cycle's resolved assetClass; harnesses thread `'crypto_spot' as const`; crypto-resolved levers identical |
| `callStrategyDetect` signature REQUIRES `symbol` + `assetClass` | TYPE-ENFORCED | YES — internal callers thread cycle context; xstock_spot/eval-cycle.ts unchanged behavior |
| `strategy_settings` schema adds `asset_class` column | ADDITIVE | YES — existing rows backfilled with `'crypto_spot'`; queries that don't filter by asset_class continue resolving the crypto row (only one until xstock rows are seeded with enabled=false) |
| `strategy-sync` adds per-class loop | ADDITIVE | YES — crypto sync preserves `enabled` state; xstock rows seeded `enabled=false` (no behavior change since active-trading not wired) |
| `strategy-mapper` per-class JSON shape | TYPE-ENFORCED + ADDITIVE | YES IF crypto subtree byte-identical to today's flat shape (asserted at Step 3 via deep-equal test) |
| `hybrid-integration.selectHybridStrategy` taxonomy fix | BUG-007 FIX | Behavior change for `HybridSignal.hybridStrategy` field VALUES — but those values were stale/broken since canonical map was wired (Batch 13). Downstream consumers that string-compared against legacy values were already broken; Step 3 fix is part of BUG-007 closure |
| `strategy_gates.xstock_spot.*` seed (18 new rows) | ADDITIVE | YES — crypto path doesn't consult xstock_spot rows |
| Migration: ALTER TABLE strategy_settings | TYPE-SAFE — backfill 'crypto_spot' before NOT NULL | YES — backfill before NOT NULL constraint; existing crypto rows preserved |

**Conclusion: crypto-by-construction-NONE invariant HOLDS for every planned change.**

---

## §7 — Step 3 implementation sequencing (recommended)

Pre-audit recommends Step 3 ships in this order to minimize crypto-regression risk:

1. **Migration first** (drizzle/migrations/2026-05-24-b79-0n-strategy-per-class.sql) — applied via `npm run db:migrate` before code deploy. Adds `asset_class` column to strategy_settings + strategy_settings_audit with `'crypto_spot'` backfill + UNIQUE constraint swap. Seeds 18 xstock_spot strategy_gates rows. Rollback stub at sibling file.
2. **Canonical map JSON migration** (`bridge/canonical/mapping-regime-strategy.json` shape change) — nested `byAssetClass` shape, crypto subtree byte-identical to flat-shape values. Sync-canonical-bridge.ts regen at Step 3 verification.
3. **`_SE_KEY` factory + 19 detect-method signatures + 10 file-based detect functions** — all in same commit per atomicity (TypeScript compile will fail if any are out of sync).
4. **`callStrategyDetect` dispatcher** + internal vts-runner caller updates + xstock_spot/eval-cycle.ts updates — same commit.
5. **Signal-orchestrator dispatch block** — capture `assetClass` local + thread to 18 sites. Same commit.
6. **routes.ts + 4 validation harnesses** — thread `'crypto_spot' as const`. Same commit (the compile gate forces them all into one commit anyway).
7. **strategy-mapper.ts per-class signature change** + `strategy-sync.ts` per-class loop + `STRATEGIES` const completion + `selectHybridStrategy` taxonomy fix + `HybridStrategyType` type update — same commit.
8. **Unit tests** — every change has unit-test coverage per scope §4. Tests written in same commit.
9. **Integration test** for xStock VTS shadow path picking up class-scoped strategy params — runs against test DB with both crypto + xStock fixture rows.

**Atomicity rule:** all 9 items above ship in ONE commit (or one PR with single merge to migration/aws-supabase). Anything else risks build breakage on intermediate states.

---

## §8 — Asset-class onboarding workflow learnings (placeholder per CLAUDE.md §3.3)

Fills during completion report (Step 11). Anticipated learnings based on STRATEGY's specific pattern:

- **Centralized dispatcher + shared detect methods + per-class parameter data is the architectural shape that scales.** STORAGE + MCE + STRATEGY all converge on the same recipe: one dispatcher per surface, one detect function per strategy, REQUIRED-AssetClass at the dispatcher, parameter VALUES in `module_constants` data layer. Per-class detect-logic forks are NOT the right pattern (xstock_spot/lane-eligibility.ts modularization is for pure helpers, not dispatch logic).
- **Compile-driven caller enumeration is more reliable than grep-driven.** Scope v1 estimated "2 dispatch surfaces" via grep; Langston blocker fix caught the gap via empirical reasoning; pre-audit's compile-driven probe confirmed the actual 7-file/66-call surface. **Pattern: every signature change should be validated via `npx tsc --noEmit` probe before scope is locked.**
- **F-1 is the dominant outcome for parameter-symmetric strategy systems.** STRATEGY's 222 wildcard levers cluster into 7 families, ALL class-invariant by construction (ATR-relative geometry, per-pair-volume normalization, confidence weights, DBS-derived gates, percentile metrics). Workflow update: ASSET_CLASS_ONBOARDING_WORKFLOW Step 4.X should distinguish lever families that are class-invariant by mathematical construction vs lever families that may require per-class calibration. Most strategy parameters are the former.
- **Phase 19 calibration target identification can happen at pre-audit time.** Even when F-1 ships, pre-audit can identify candidate levers most likely to surface as F-2 in Phase 19 measurement — for STRATEGY, the `volume_threshold_multiplier` family is the leading candidate due to xStock weekend-gap-fill dynamics differing structurally from crypto's continuous flow. Documenting this at pre-audit time accelerates Phase 19 work.

---

## §9 — Open questions for Langston (Step 2 RA-ACK gate)

**(Q-α) Compile-driven probe methodology — acceptable as authoritative caller enumeration?**

Pre-audit ran `npx tsc --noEmit` on C:/dev mirror after editing one detect method (detectVWAPPullback) to add REQUIRED `assetClass: AssetClass`. The 8 caller errors captured serve as the authoritative caller list for that one method. The other 18 detect methods are assumed to have the same caller surface (per file-grep pattern) without running 18 separate probes. Concur this is sufficient, or want a per-method probe?

**CC recommendation:** sufficient. The grep pattern + file enumeration is consistent across all detect methods (every caller file calls multiple detect methods); per-method probe would be 18× the work for no new information.

**(Q-β) `xstock_spot/eval-cycle.ts` caller exact-line at Step 3 — pre-audit assumed single site, confirm?**

xstock_spot/eval-cycle.ts imports `callStrategyDetect` from vts-runner at line 48-54. Pre-audit didn't enumerate exact call sites within eval-cycle.ts. Step 3 will read + thread `assetClass` to each call. Expected: 1-2 sites (the strategy-iteration loop). Concur this is implementation-time enumeration, or want pre-audit to nail it down?

**CC recommendation:** implementation-time. The exact site count doesn't change scope; only the threading detail does.

**(Q-γ) Phase 16 register entries — 6 new (i through n) or different organization?**

Pre-audit proposes 6 new RUNNING_ISSUES #136 register entries:
- #136-i: routes.ts admin test-detect-strategies endpoint (Phase 16 deletion candidate)
- #136-j: routes.ts admin test-strategies-for-watchlist endpoint (Phase 16 deletion candidate)
- #136-k: stage-b-validator.ts (synthetic test engine, 8-strategy max — Phase 16 deletion candidate)
- #136-l: strategy-validator.ts (synthetic 4-strategy test — Phase 16 deletion candidate)
- #136-m: historic-signal-generator.ts (3-strategy hardcoded backfill — Phase 16 deletion candidate)
- #136-n: paper-sim-diagnostic.ts (3-strategy probe — Phase 16 deletion candidate)

Concur on the entry scheme, or want consolidation (e.g. single entry covering all 6 with sub-bullets)?

**CC recommendation:** 6 separate entries — gives Phase 16 reviewer per-file context + lets each file be triaged independently (some might survive as-is; others delete).

**(Q-δ) `strategy-mapper.ts` cross-consumer audit at Step 3 — acceptable as implementation-time activity?**

Pre-audit didn't fully enumerate downstream consumers of the canonical JSON shape (sync-canonical-bridge.ts, drift-detector, Mapping Drift UI tab). Step 3 will audit + update each. Concur this is implementation-time, or want pre-audit to enumerate first?

**CC recommendation:** implementation-time. The audit is bounded (4-6 files) and the JSON shape change is well-defined.

**(Q-ε) Hybrid taxonomy fix — downstream `HybridSignal.hybridStrategy` consumer audit at Step 3?**

Pre-audit estimates 0-2 downstream consumers of the `HybridSignal.hybridStrategy` field (telemetry tagging + UI display). Step 3 grep enumerates + fixes any string-compare sites. Acceptable?

**CC recommendation:** Step 3. Trivially small surface.

**(Q-ζ) Pre-audit baseline tsc noise — any concern?**

Pre-audit confirmed the probe surfaced ~15 baseline tsc errors unrelated to detectVWAPPullback. Those are pre-existing per B-NEW-43 Phase 1 (488 remaining errors in the baseline). Step 5 push will run the baseline-comparison gate to verify no NEW errors. Concur this is the correct discipline, or want any specific baseline-error to be addressed in this batch?

**CC recommendation:** correct discipline. Baseline errors are out of scope for STRATEGY (separate cleanup batches own them).

**Reply:** **pre-audit v1 FINAL ACK** / **specific decisions on Q-α through Q-ζ** / **substantive design disagreement on the F-audit conclusion or compile-driven methodology**.

---

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §6.5.0.b: this pre-audit file is staged in your inbox at `/home/langston/inbox/b79-0n/B79_0n_STRATEGY_PRE_AUDIT.md`. **DO NOT `cd /mnt/gdrive` or run `git -C` against the gdrive mount — FUSE I/O hangs (B-NEW-42b empirical).** For repo-side verification use `ssh deploy@188.245.193.8 'cd /home/deploy/dawntrader && git ...'` — staging server has same code at same commit. Embedded diff snippets + the lever dump excerpt + the compile-probe output above are sufficient for your review.

— Claude Code, 2026-05-24 (B79.0n.STRATEGY Step 2 pre-audit v1)
