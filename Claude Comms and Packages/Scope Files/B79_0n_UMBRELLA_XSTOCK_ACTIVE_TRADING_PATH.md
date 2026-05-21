# B79.0n — UMBRELLA tracker: xStock active-trading wire-in + systemic asset-class awareness (rev 4 — B72 prior-arc context added per sub-batch)

> **Status:** rev 4 drafted 2026-05-21 PM during B79.0n.STORAGE Step 4 review window per Kyle ask. **Sub-batch count unchanged at 18** — the arc is the same. What changes is the per-sub-batch *scope of remaining work*: B72 (shipped 2026-05-05) + B72.1 (2026-05-05) + B72.2 (2026-05-06) already did the API-side wiring (sync-read API, hard-fail discipline, module_constants resolver) for many of the systems this umbrella covers, so several sub-batches reduce in size to **per-class seed rows + resolver-key tightening + direct asset-class branching for non-lever code**.
> **rev 3 status (superseded):** drafted 2026-05-21 PM after HYGIENE close; UNIVERSE-DISCOVERY inserted as sub-batch #2.
> **rev 2 status (superseded):** Langston FINAL ACK 2026-05-20 PM (commit `6e9810171`). 17 sub-batches. v1 came back with 11 items from "prove-me-wrong" review; v2 absorbed 11 items, counter-proposed on 3 (items 2, 6, 13c); Langston concurred on all 3 counter-proposals.
> **Origin:** Kyle directive 2026-05-20 PM. Original rev3 of `B79_0n_SCOPE.md` (Langston rev3 FINAL ACK) was the seed; Kyle's subsequent review expanded scope into systemic asset-class awareness across the active-trading pipeline.
> **Phase:** Phase 24 (multi-asset onboarding).
> **Locked sequence position:** last item before Phase 19 live-trading gate.

> **Rev 4 changes (per Kyle directive 2026-05-21 PM during B79.0n.STORAGE Step 4 window):**
> - **No sub-batch count change.** Arc remains 18 sub-batches (16 Tier 1 + 2 Tier 2).
> - **Prior-arc context section added (§1.5 below).** Documents what B72 + B72.1 + B72.2 already did so each sub-batch's scope of remaining work is honest. Several sub-batches shrink materially: STRATEGY (#5), SCORING (#8), MCE (#4), EXECUTION (#15) all have their API-side wiring done already; remaining work is per-class seed rows + resolver-key tightening + direct asset-class branching for non-lever code. RTB (#11), ORCHESTRATOR (#14), PATTERN-DETECT (#6), OBSERVABILITY (#18) have modest wiring done. CONFIDENCE-CHAIN (#7), TEC (#9), TELEMETRY (#10), RTB-REFRESH (#12), POOL (#13), WIRE-IN (#16), ML-CALIBRATION (#17) have no B72 overlap.
> - **Stale stale-reference correction in tracking docs:** BATCH_CATALOG.md row 171 (the pre-shipping planning entry) was incorrectly marked QUEUED; corrected 2026-05-21 to point at the actual ship rows 212-214. POST_AUDIT_ROADMAP.md references at lines 970, 1146, 1319, 1344 corrected to past-tense.
> - **Discovery context:** Kyle pushed back on STORAGE pre-audit during Step 4 window — "are you sure B72 has not shipped?" — surfacing that I had read the stale catalog row 171 as authoritative. B72 absolutely shipped 2026-05-05 with extensive coverage (34 modules / ~163 rows / 18-of-18 canonical strategies DB-tunable). My STORAGE pre-audit was correctly scoped because B72 worked on **Layer 2 (`module_constants`)** while STORAGE works on **Layer 1 (`screener_filters` API surface + REQUIRED-assetClass type-level enforcement)**. Distinct concerns. But the downstream sub-batches in this umbrella all benefit from B72 work — hence this rev.
>
> **Rev 3 changes (per Kyle directive 2026-05-21 PM, mid-B79.0n.HYGIENE design conversation):**
> - **NEW sub-batch `B79.0n.UNIVERSE-DISCOVERY` inserted as #2** (between HYGIENE and STORAGE). Replaces the hardcoded `XSTOCK_SPOT_REGISTRY` (also `xstocks-universe.json`) with a dynamically-populated universe sourced from a three-service discovery chain. Rationale: crypto auto-discovers from Kraken REST `AssetPairs` endpoint live every cycle (~1,544 pairs), but Kraken's public REST API does not index xStock instruments at all (xStocks only stream through `wss://ws-equities.kraken.com` with no list-all message). Hand-maintained registry scales poorly as Kraken adds tokenized stocks; Kyle has zero visibility into newly-supported names without manual probe.
> - **Sub-batch count 17 → 18.** STORAGE shifts 2→3; all subsequent Tier 1 sub-batches shift +1 (MCE 4, STRATEGY 5, PATTERN-DETECT 6, CONFIDENCE-CHAIN 7, SCORING 8, TEC 9, TELEMETRY 10, RTB 11, RTB-REFRESH 12, POOL 13, ORCHESTRATOR 14, EXECUTION 15, WIRE-IN 16); Tier 2 also shifts (ML-CALIBRATION 17, OBSERVABILITY 18).
> - **Dependency graph:** UNIVERSE-DISCOVERY is independent of STORAGE (operates at a lower architectural layer — discovers WHAT symbols exist before STORAGE decides HOW to persist data for them). STORAGE depends on UNIVERSE-DISCOVERY because the dynamic registry shape (DB-backed snapshot table + accessor service) is established by UNIVERSE-DISCOVERY and consumed by STORAGE's silent-fallback audit. ORCHESTRATOR, EXECUTION, WIRE-IN all transitively depend on UNIVERSE-DISCOVERY.
> - **Sister-issue logging:** RUNNING_ISSUES #125 NEW (dynamic universe discovery — the issue that motivates this sub-batch); #120 PARTIALLY CLOSED with full-closure concern (Kraken-side xStock universe audit) ABSORBED into UNIVERSE-DISCOVERY rather than remaining as a separate deferred follow-up.

> **Rev 2 changes (per Langston v1 review):**
> - **§0 wording fix (Langston item 5):** Run-Mode Controller has 3 modes (vts | paper_sim | live). Routing is `vts vs (paper_sim | live)`. Active-trading path = paper_sim mode + live mode (both go through orchestrator).
> - **§1 Tier 1 promoted (Langston item 9):** TELEMETRY → Tier 1, hard-pinned to ship before WIRE-IN (RTB's ARM consumes telemetry → RTB depends on TELEMETRY, not reverse). Tier 1 grows from 14 to 15 batches.
> - **§1 dep graph corrected (Langston items 9 + 10):** RTB depends on TELEMETRY; ORCHESTRATOR adds CONFIDENCE-CHAIN; WIRE-IN hard-pinned after TELEMETRY.
> - **MCE scope (Langston item 2 — CC COUNTER-PROPOSE):** MCE keeps cost-model.ts (EV-side); slippage-fee-model.ts moves to EXECUTION (consumed by realtime-paper-executor.ts, execution-side concern).
> - **STRATEGY scope (Langston item 7):** strategy-mapper.ts (Directive 11.4H.6G) explicitly pinned with file:line.
> - **POOL scope (Langston item 1 — primary gate placement):** Primary market-hours gate at admission. Don't admit closed-market xStock pairs to activeFilterPool.
> - **ORCHESTRATOR scope (Langston item 1, 10):** Defense-in-depth market-hours check at evaluateSymbol entry; CONFIDENCE-CHAIN added to dep list.
> - **EXECUTION scope (Langston items 2, 3, 4, 6, 13c):** slippage-fee-model.ts + risk-concentration.ts + dynamic-slots.ts REQUIRED-assetClass + pre-audit enumeration of all 4 executor layers + tick-size/lot-size/whole-share enforcement for xStock.
> - **§2.2 per-metric regression-lock thresholds (Langston item 11):** FX5 pool / signal gen / VTS rate stay ±5% 24h; active trade-open rate is ±1-2 absolute trades/day OR ±15% over 7-day rolling.
> - **§2.4 scope-of-application (Langston item 12):** standing rule applies to "every Phase 24 batch" (not only this umbrella's sub-batches). CLAUDE.md §3.3 updated to match.
> - **§6 NEW Phase 19 readiness gaps (Langston item 13):** Cross-class portfolio P&L reconciliation + external macro feed per-class flagged as known follow-ups (post-umbrella).
> - **CC COUNTER-PROPOSE on 3 items (2, 6, 13c)** — described above; awaiting Langston FINAL ACK or further iteration.

---

## §0 — Why this is an umbrella, not a single batch

The original B79.0n was scoped as "wire xStock into active-trading dispatch" — a single batch. Kyle's Step 1 review and the subsequent code-level audit (`B79_0n_SCOPE.md` §2.5 Findings 1-3 + the comprehensive SIM/System-Manual enumeration 2026-05-20 PM) revealed that the wire-in by itself is impossible to ship cleanly because the entire active-trading pipeline has systemic asset-class-awareness gaps that would silently route xStock signals into crypto-calibrated logic at dozens of touch points. The right shape is a multi-sub-batch arc that audits + fixes one subsystem at a time, each with its own crypto-regression-lock and Phase-19-ready documentation.

**Active trading stays OFF** through this entire arc. We're building end-to-end-ready architecture; live-trading enablement is the Phase 19 gate.

**Kyle directive: mode-mutually-exclusive routing (rev 2 wording fix per Langston item 5).** The Run-Mode Controller (`server/services/run-mode-controller.ts`) documents three modes: `vts | paper_sim | live`. Routing is `vts vs (paper_sim | live)`. The active-trading path encompasses BOTH paper_sim mode and live mode — both flow through orchestrator → SQE → RTB → paper-execution-engine. The VTS path is the dedicated learning mode. xStock survivors get routed by the scanner based on the mode — `vts` mode keeps today's `eval-cycle.ts → registerOpenVtsTrade` path; `paper_sim` or `live` mode admits survivors to `activeFilterPool` for the orchestrator. Both paths exist in code; the mode determines which fires. Mirrors crypto's existing pattern at `fx5-scanner.ts:1390`.

---

## §1 — The 18 sub-batches (rev 3 — UNIVERSE-DISCOVERY inserted)

Two tiers. Tier 1 (16 batches) is the critical active-trading path; Tier 2 (2 batches) is the learning/observability adjacent systems that also cross asset-class boundaries and would otherwise drag into Phase 19.

### Tier 1 — Critical active-trading path (16 batches; was 15 in v2 — UNIVERSE-DISCOVERY inserted)

| # | Name | Canonical scope file | What it covers | Dependencies |
|---|---|---|---|---|
| 1 | **B79.0n.HYGIENE** ✅ CLOSED 2026-05-21 | `B79_0n_HYGIENE_SCOPE.md` + `B79_0n_HYGIENE_PRE_AUDIT.md` + `B79_0n_HYGIENE_CHANGE_LIST.md` + `B79_0n_HYGIENE_STEP_7_VERIFICATION.md` + `B79_0n_HYGIENE_COMPLETION_REPORT.md` | `setNullReason` ReferenceError fix (#121, RESOLVED — pre-audit found bug already self-resolved by current bundle; shipped structural fence instead) + 5-symbol Kraken-gap registry trim (#120, PARTIAL — full-closure concern absorbed into UNIVERSE-DISCOVERY below). Small, fast, cleared noise before bigger work. | None |
| 2 | **B79.0n.UNIVERSE-DISCOVERY** ← NEXT | `B79_0n_UNIVERSE_DISCOVERY_SCOPE.md` (pending) | **NEW per Kyle directive 2026-05-21 PM.** Replace hardcoded `XSTOCK_SPOT_REGISTRY` (`shared/asset-classes.ts:271-540`) + hardcoded `xstocks-universe.json` with a dynamically-populated universe sourced from a three-service discovery chain: (1) **CoinGecko tokenized-stocks category** for "what tokenized stocks does Backed Finance currently issue" (CoinGecko already wired in `external-macro-feed.ts:9-10` for `/global` endpoint; public endpoints no API key required); (2) **Kraken WebSocket subscription probe** to confirm which CoinGecko-listed symbols Kraken's xStock product currently accepts subscriptions for at `wss://ws-equities.kraken.com`; (3) **Finnhub** (already wired in `server/services/stocks.ts`; `FINNHUB_API_KEY` may need re-provisioning per BOOT log) for per-symbol sector / cryptoAdjacent / ADR flag lookup. DB-cached snapshot with daily refresh + ad-hoc trigger. Fallback chain on service unavailability: last-known-good snapshot → small hard-coded bootstrap set → fail-fast at boot. Convert exact-equality size asserts (`b-phase-a2-xstock-eval-cycle-dbs.test.ts:33` + `b79-0n-hygiene-registry-trim.test.ts`) to range asserts (`size >= MIN && size <= MAX`). **Supersedes RUNNING_ISSUES #120 full-closure** (the manual "Kraken xStock universe audit" mini-batch becomes obsolete — turned into a daily background job). **Crypto regression NONE by construction** — only `xstock_spot` registry shape changes; crypto's REST `AssetPairs` discovery in `market-scanner.ts:551-554` is untouched. | None (independent like HYGIENE — operates at a lower architectural layer than STORAGE) |
| 3 | **B79.0n.STORAGE** | `B79_0n_STORAGE_SCOPE.md` | Codebase-wide silent-crypto-fallback audit + SQE bug fix (`signal_quality_evaluator.ts:143`) + storage API REQUIRED-assetClass refactor (Langston rev2 §11.4). Root-cause fixes the systemic pattern before downstream batches inherit it. **Inherits dynamic registry from UNIVERSE-DISCOVERY.** | UNIVERSE-DISCOVERY |
| 4 | **B79.0n.MCE** | `B79_0n_MCE_SCOPE.md` | Market Context Engine asset-class plumbing: regime classifier, IMF metric weights, DBS computation, Directional Integrity, **cost-model.ts (EV-side cost model only — slippage-fee-model.ts moved to EXECUTION per CC counter-proposal item 2)**, friction estimates, macro modifier, indicator computations (VWAP / ATR / EMA / BB / RSI). | STORAGE |
| 5 | **B79.0n.STRATEGY** | `B79_0n_STRATEGY_SCOPE.md` | Strategy engine + every quant detector method + `_SE_KEY` resolver specificity + Hybrid Integration Service (quant+pattern ensemble) + Strategy Sync per-asset-class `strategy_settings` rows + **strategy-mapper.ts (Directive 11.4H.6G Canonical Regime-Strategy Enforcement) — per Langston item 7**. | STORAGE |
| 6 | **B79.0n.PATTERN-DETECT** | `B79_0n_PATTERN_DETECT_SCOPE.md` | Pattern recognition modules (candlestick detectors, chart-pattern recognizers, pattern strength scoring). Audit whether already asset-class-aware via xStock VTS usage; close gaps. | STORAGE |
| 7 | **B79.0n.CONFIDENCE-CHAIN** | `B79_0n_CONFIDENCE_CHAIN_SCOPE.md` | b67_1 through b67_4 + b68_1 through b68_5 modulator chain asset-class awareness. Pre-audit verifies whether modulators differ per asset class — could be no-op or could surface per-class parameter need. | STORAGE |
| 8 | **B79.0n.SCORING** | `B79_0n_SCORING_SCOPE.md` | FinalScore + RankingScore + HybridScore + PredictiveConfidence + Net Expectancy Kernel + Adaptive Goals Weight System + SQE finalScoreMin/regimeWeightMin thresholds + ranking-weights + normalization bounds. Architecture-only plumbing; values calibration deferred. | STORAGE |
| 9 | **B79.0n.TEC** | `B79_0n_TEC_SCOPE.md` | Trailing Exit Controller + TEC Evaluator + xStock Structural Discontinuity Detector (B-NEW-42 already asset-class-aware) + Exit Strategy Replay Service + crypto_perp+xstock_perp residual #116 background timer fix. | STORAGE |
| 10 | **B79.0n.TELEMETRY** | `B79_0n_TELEMETRY_SCOPE.md` | **Telemetry Aggregator per-asset-class buckets. Promoted from Tier 2 per Langston item 9 — RTB's Adaptive Ratio Manager consumes telemetry, so RTB depends on TELEMETRY (not reverse). Hard-pinned to ship before WIRE-IN.** | STORAGE |
| 11 | **B79.0n.RTB** | `B79_0n_RTB_SCOPE.md` | Ready-to-Buy queue management + Adaptive Ratio Manager + TCL (Trade Candidate List) watchdog + cross-asset top-signal selection + FinalScore gap safety rule. | STORAGE, SCORING, **TELEMETRY** |
| 12 | **B79.0n.RTB-REFRESH** | `B79_0n_RTB_REFRESH_SCOPE.md` | RTB Refresh Service (split per Kyle's flag — distinct subsystem with its own 1-second cycle). Verify whether per-asset-class refresh cadence is needed. | RTB |
| 13 | **B79.0n.POOL** | `B79_0n_POOL_SCOPE.md` | Active Filter Pool `addSurvivors` signature change — REQUIRED `assetClass: AssetClass` parameter. All existing callers (fx5-scanner, unified-filter-gateway) updated to pass `'crypto_spot'` explicitly. New `getActivePoolByAssetClass()` accessor for diagnostics. **Primary market-hours gate at admission per Langston item 1 — don't admit closed-market xStock pairs to activeFilterPool. Consults `xstock_spot/market-hours.ts` at admission time.** | STORAGE |
| 14 | **B79.0n.ORCHESTRATOR** | `B79_0n_ORCHESTRATOR_SCOPE.md` | Signal orchestrator `evaluateSymbol` asset-class branching at every strategy detect call site + B79.0d ORB inline hook reachability verification + per-strategy signal-count logging instrumentation + **defense-in-depth market-hours check at evaluateSymbol entry (Langston item 1)**. | MCE, STRATEGY, PATTERN-DETECT, CONFIDENCE-CHAIN, SCORING, POOL |
| 15 | **B79.0n.EXECUTION** | `B79_0n_EXECUTION_SCOPE.md` | Paper-execution-engine asset-class branching + Paper Position Sizing + Dynamic Sizing Engine + Pre-Execution Validator + Trade Safety + Guardrails V2 + log-only dry-run journal + side-door audit. Plus rev 2 additions per Langston items 2/3/4/6/13c (slippage-fee-model.ts + risk-concentration.ts + dynamic-slots.ts REQUIRED-assetClass + 4-executor-layer pre-audit + tick-size/lot-size/whole-share enforcement). | ORCHESTRATOR, TEC |
| 16 | **B79.0n.WIRE-IN** | `B79_0n_WIRE_IN_SCOPE.md` | The actual wire-in: xStock scanner mode-aware routing (gates on Run-Mode Controller mode — `vts` keeps eval-cycle path, `paper_sim`/`live` admits to activeFilterPool), survivor admission to `activeFilterPool` in active mode, Passive Archive Pipeline tag verification. | All Tier 1 prior **including TELEMETRY (hard-pinned per Langston item 9) and UNIVERSE-DISCOVERY (hard-pinned per rev 3)** |

### Tier 2 — Learning + observability (2 batches; unchanged from v2)

| # | Name | Canonical scope file | What it covers | Dependencies | Priority |
|---|---|---|---|---|---|
| 17 | **B79.0n.ML-CALIBRATION** | `B79_0n_ML_CALIBRATION_SCOPE.md` | ML Calibration Service stratification per asset class (separate 10-HYBRID counters + separate calibration cycles per class so crypto outcomes don't pollute xStock recalibration). | STORAGE, TELEMETRY | **HIGH** (impacts long-term learning correctness) |
| 18 | **B79.0n.OBSERVABILITY** | `B79_0n_OBSERVABILITY_SCOPE.md` | Drift Detector per-{strategy, assetClass} baselines + Regime Archiver assetClass tagging + Drift Dashboard asset-class filter. | STORAGE | MEDIUM (diagnostics, not critical path but useful before Phase 19) |

### Sub-batch dependency graph (rev 3 — UNIVERSE-DISCOVERY inserted as #2)

```
HYGIENE ✅ CLOSED                     (independent, sub-batch 1)
UNIVERSE-DISCOVERY ← NEXT             (independent, sub-batch 2 — NEW per Kyle 2026-05-21 PM)
   └─→ STORAGE                        (foundational; now depends on UNIVERSE-DISCOVERY)
         ├─→ MCE
         ├─→ STRATEGY
         ├─→ PATTERN-DETECT
         ├─→ CONFIDENCE-CHAIN
         ├─→ SCORING
         ├─→ TEC
         ├─→ POOL
         ├─→ TELEMETRY ─→ RTB ─→ RTB-REFRESH          (telemetry feeds RTB's ARM)
         │                ├─→ ML-CALIBRATION (T2)
         └─→ OBSERVABILITY (T2)
   └─→ ORCHESTRATOR (depends on MCE+STRATEGY+PATTERN+CONFIDENCE-CHAIN+SCORING+POOL)
         └─→ EXECUTION (depends on ORCHESTRATOR+TEC)
               └─→ WIRE-IN (depends on ALL T1 prior, INCLUDING TELEMETRY + UNIVERSE-DISCOVERY — hard-pin)
```

UNIVERSE-DISCOVERY and HYGIENE are both independent (no STORAGE dep) — they operate at lower architectural layers than the foundational asset-class-awareness work. STORAGE depends on UNIVERSE-DISCOVERY because the dynamic registry shape (DB-backed snapshot + accessor service) is established by UNIVERSE-DISCOVERY and consumed by STORAGE's silent-fallback audit (which now audits across whatever symbols the dynamic registry currently contains, not against a hardcoded list of 260). Middle batches (MCE, STRATEGY, PATTERN-DETECT, CONFIDENCE-CHAIN, SCORING, TEC, TELEMETRY, POOL) are independent of each other once STORAGE lands — could ship in any order; sequential probably gives cleaner reviews. **TELEMETRY must close before WIRE-IN** so ARM has per-asset-class telemetry buckets when xStock survivors enter the pool. **UNIVERSE-DISCOVERY must close before STORAGE** so the dynamic registry shape is the consumption target throughout the arc.

---

## §1.5 — B72 prior-arc context per sub-batch (rev 4)

**Recap of B72 + B72.1 + B72.2 (shipped 2026-05-05/06).** The comprehensive lever-to-`module_constants` sweep migrated **~180 inventoried levers across 34 modules** (~163 rows live in production sync-read paths) to a DB-tunable architecture with the following load-bearing pieces:

- **Sync-read API** in `module-constants-service.ts`: `prefetchModule()` + `getCachedConstant<T>()` + `getCachedNumberRequired()` + `getCachedNumbersForModule()`. 60-second background refresher propagates SQL UPDATEs without redeploy.
- **Boot hard-fail discipline** in `server/startup/b72-warmup.ts`: every PROMOTE module read from sync code MUST be in `PREFETCH_MODULES`. Server boot throws if any prefetch returns zero rows.
- **`getCachedNumberRequired` throws on cold cache, missing row, OR non-numeric value** — no silent fallbacks anywhere in B72-wired code.
- **Resolution-scope discipline** documented per row: default GLOBAL `(*, *, *, *)`; per-regime where regime-specific (`roi_gating`, `learning_governance`); per-strategy where strategy-internal (all 18 canonical strategies + DBS routing guards); per-exchange (`cost_model` kraken-only); **per-asset-class where asset-class-specific** (`pattern_pool_gates` crypto_spot, `trailing_exit` crypto_spot today).

**Critical distinction this umbrella's sub-batches preserve:** B72 wired the **API-side discipline** (read from DB, hard-fail on missing). It did NOT (and explicitly chose not to) seed per-asset-class rows for every module — most rows are at wildcard scope today. The umbrella sub-batches do the **per-asset-class seeding + resolver-key tightening** for the modules where xStock needs values different from crypto's wildcards. They also do the **direct code branching** for non-lever logic (friction model selection, market hours, sector-aware paths) that the module_constants pattern doesn't cover.

### Sub-batches that SHRINK materially (API-side wiring done by B72; remaining work is data + non-lever code)

| Sub-batch | What B72 already did | Remaining work in this umbrella sub-batch |
|---|---|---|
| **#4 MCE** | Wired `regime_classifier` (5 TFS fields from B67.3.5 era), `regime_age` (5 rows incl. B68.4), `dbs_calculation` (1 lever wildcard — see RUNNING_ISSUES #115), `cost_model` (1 lever kraken-only). | Per-class seed rows for thresholds where xStock differs (regime_classifier already has `xstock_spot` branch via `regime-thresholds.ts` from B78). Direct branching for: friction estimates, macro modifier per-class signal (RUNNING_ISSUES #123 — known follow-up post-arc), indicator computations (VWAP / ATR / EMA / BB / RSI) that aren't lever-driven. Resolver-key tightening where wildcards need per-class values. |
| **#5 STRATEGY** | **Wired all 18 canonical strategies to read from `module_constants` via `getCachedNumbersForModule('strategy.<key>', key)` (B72 Slices 3a-b + B72.2 Slices 1-5).** 18-of-18 DB-tunable today. `strategy_dbs_routing_guards` atomic group (B72 Commit A: 4 rows + integration test). `strategy_settings` table schema unchanged. | **No detect-method wiring needed** — done. Remaining: (a) per-class seed rows under `strategy.<key>` modules where xStock needs different parameters than crypto (often "none required" if behavior is parameter-symmetric); (b) `_SE_KEY` resolver specificity — currently wildcard, needs `assetClass: input.assetClass` per cycle; (c) Hybrid Integration Service per-asset-class composition; (d) Strategy Sync per-asset-class `strategy_settings` rows audit; (e) `strategy-mapper.ts` (Directive 11.4H.6G Canonical Regime-Strategy Enforcement) per Langston item 7. |
| **#8 SCORING** | **B72 Slice 4 wired the entire scoring chain:** 3-layer SQE precedence (`screener_filters → sqe_config → SQE_DEFAULT_THRESHOLDS static mirror`), net-expectancy-kernel caller-injection refactor (`expectancy_kernel.pwin_floor/ceiling` + `directional_integrity.di_pwin_factor`), `vts_scoring`, `goals_weighting`, `expectancy_tuning`, `expectancy_gates`, `cost_geometry`. | **`_SQE_GK` parameterization** (`assetClass: '*'` → `assetClass: input.assetClass`) — STORAGE deferred this to SCORING explicitly. Per-class seed rows for `sqe_config.{crypto_spot,xstock_spot}.min_final_score` + `.min_regime_weight` when xStock needs different thresholds (RUNNING_ISSUES entry filed at STORAGE close). Same for ranking-weights + normalization bounds. |
| **#15 EXECUTION** | **Wired `position_sizing` (11 levers — the biggest single migration in B72), `paper_sizing`, `paper_execution` (4 levers).** | Per-class seed rows for position sizing where xStock needs different (likely material — different leverage, different lot-size constraints, different friction). Direct asset-class branching at the 4 executor layers (paper-execution-engine, realtime-paper-executor, trade-executor, trading-engine — pre-audit per Langston item 13c). `slippage-fee-model.ts` + `risk-concentration.ts` + `dynamic-slots.ts` REQUIRED-assetClass refactor. Tick-size/lot-size/whole-share enforcement for xStock. |

### Sub-batches that SHRINK MODESTLY (small B72 footprint; most work remains)

| Sub-batch | What B72 already did | Remaining work |
|---|---|---|
| **#6 PATTERN-DETECT** | Wired `pattern_pool_gates` (1 lever at crypto_spot scope). B72 Slice 3b touched the 6 pattern strategy files (inside_bar_reversal, morning_star, pivot_shift, reverse_impulse, support_bounce, strong_bull_trend — these are pattern-DEPENDENT strategies, not the pattern-recognition primitives). | Pattern recognition modules themselves (candlestick detectors, chart-pattern recognizers, pattern strength scoring) — audit whether already asset-class-aware via xStock VTS usage; close gaps. Per-class seed for `pattern_pool_gates.xstock_spot.*` rows. |
| **#11 RTB** | Wired `rtb_ranking` (1 lever), `rtb_config` (1 lever), `queue_admission` (1 lever). | Adaptive Ratio Manager per-class telemetry consumption (depends on TELEMETRY first). TCL watchdog per-asset-class. Cross-asset top-signal selection logic. FinalScore gap safety rule per-class. Per-class seed for the 3 modules above. |
| **#14 ORCHESTRATOR** | Wired `signal_orchestrator` (4 levers). | Per-cycle asset-class branching at every strategy detect call site (the wildcard `_SE_KEY` use cases). B79.0d ORB inline hook reachability verification. Per-strategy signal-count logging instrumentation. Defense-in-depth market-hours check at `evaluateSymbol` entry (Langston item 1). |
| **#18 OBSERVABILITY (T2)** | Wired `drift_detector` (1 lever). | Drift Detector per-{strategy, assetClass} baseline shape. Regime Archiver `assetClass` tagging. Drift Dashboard asset-class filter UI. |

### Sub-batches that DO NOT CHANGE (no B72 overlap)

- **#3 STORAGE** (in flight) — B72 worked on Layer 2 (`module_constants`); this batch works on Layer 1 (`screener_filters` API + REQUIRED-assetClass type enforcement). Distinct concerns.
- **#7 CONFIDENCE-CHAIN** — b67_1 through b67_4 + b68_1 through b68_5 modulator chain. Pre-audit verifies whether modulators differ per asset class; could be no-op.
- **#9 TEC** — Trailing Exit Controller asset-class-aware via B65.x already; this sub-batch adds residual #116 background timer fix + Structural Discontinuity Detector verification.
- **#10 TELEMETRY** — Per-asset-class telemetry buckets; depends on knowing lazy-allocate pattern (from UNIVERSE-DISCOVERY learnings §10).
- **#12 RTB-REFRESH** — Distinct subsystem with 1-second cycle; per-class refresh cadence audit.
- **#13 POOL** — `activeFilterPool.addSurvivors()` signature change + primary market-hours gate at admission (Langston item 1).
- **#16 WIRE-IN** — The actual mode-aware routing + survivor admission; depends on all Tier 1 prior including TELEMETRY + UNIVERSE-DISCOVERY (hard-pinned).
- **#17 ML-CALIBRATION (T2)** — ML Calibration Service per-class stratification.

### Implication for sub-batch scope-file drafts

When each sub-batch's scope file is drafted (Step 1), it MUST include a **"B72 prior-arc context"** section that explicitly enumerates:

1. **Which `module_constants` modules B72 already wired for this subsystem** (with the row at `BATCH_CATALOG.md` row 214 as reference).
2. **Which of those wired modules need per-class seed rows** vs. which stay at wildcard scope.
3. **Which non-lever code paths need direct asset-class branching** (the things B72's pattern doesn't cover).
4. **What changes (if any) to the wired-module resolver keys** (`assetClass: '*'` → `assetClass: input.assetClass`).

This keeps the scope files honest about what work actually remains and prevents re-doing B72's API-side wiring. Sub-batch completion reports also get a "B72 prior-arc context" close-out section confirming what was wired vs. what was newly added.

### Where this came from

Discovered 2026-05-21 PM during B79.0n.STORAGE Step 4 review window. Kyle pushed back on the original STORAGE pre-audit text that incorrectly said B72 was queued: *"Are you sure B72 was not implemented?"* The push-back surfaced that I had read `BATCH_CATALOG.md` row 171 (the pre-shipping planning entry) as authoritative when the actual ship rows are 212-214. B72 absolutely shipped + B72.1 + B72.2. STORAGE pre-audit's scope was correctly framed because Layer 1 (storage API) and Layer 2 (module_constants) are distinct, but the umbrella's downstream sub-batches all benefit from B72's API-side work — hence this rev. Catalog row 171 + 4 POST_AUDIT_ROADMAP references corrected in the same governance pass.

---

## §2 — Standing rules for every sub-batch

Every sub-batch in this umbrella MUST follow all of the following, in addition to the standard 11-step workflow:

### §2.1 — Standard 11-step workflow (CLAUDE.md §2)
Scope → pre-audit (with SIM consultation per §9.1) → implementation → Langston Step 4 code review → push → deploy → CC Step 7 verification → Langston Step 8 second-pass → iterate → governance → completion report.

### §2.2 — Crypto regression-lock (MANDATORY acceptance criterion) — per-metric thresholds (rev 2 per Langston item 11)

Every sub-batch's Step 7 includes a 24h pre-deploy / 24h post-deploy comparison of crypto metrics. **Per-metric thresholds (not global ±5%):**

| Metric | Threshold | Window | Reasoning |
|---|---|---|---|
| FX5 pool size | ±5% | 24h | High-volume metric (~300 pairs); ±5% is statistically meaningful |
| Signal generation rate | ±5% | 24h | High-volume (dozens/hour); ±5% appropriate |
| VTS trade rate | ±5% | 24h | High-volume; ±5% appropriate |
| **Active trade-open rate** | **±1-2 absolute trades/day OR ±15% over 7-day rolling window** | 7-day rolling | Low-volume metric (3-8 trades/day pre-WIRE-IN). A single extra trade swings the rate 12-33%; ±5% would either falsely block (statistical noise) or falsely pass (large bias hidden in small-N). 7-day window aggregates enough trades for signal. |

Any deviation outside the per-metric threshold blocks Step 8 advancement.

**Rolling-window baseline reset clarification (Langston v2 FINAL ACK forward-tracking note 2):** for the 14 sub-batches PRE-WIRE-IN, the active-trade-open-rate metric measures crypto-only baseline (xStock active trades not yet flowing). For WIRE-IN itself + any post-WIRE-IN sub-batches, the 7-day rolling window starts FRESH from WIRE-IN deploy time, because the introduction of xStock active trades materially changes the baseline. WIRE-IN's scope file will re-state this explicitly.

### §2.3 — Crypto-by-construction-NONE invariant
Every code change in this arc must be either ADDITIVE (adds asset-class branch; crypto path unchanged at runtime) or TYPE-ENFORCED with explicit crypto callers updated to pass `'crypto_spot'` explicitly. Mid-arc combine/split decisions preserve this invariant.

### §2.4 — Asset-class onboarding learning-capture (CLAUDE.md §3.3 — Kyle directive 2026-05-20; rev 2 wording per Langston item 12)

**Scope-of-application (rev 2):** every Phase 24 batch (including this umbrella's sub-batches AND any other B79.x batches outside this umbrella, e.g., the end-of-arc workflow consolidation batch). Standing rule lives at the Phase level, not the umbrella level. Per Langston item 12, this matches Kyle's original 2026-05-20 phrasing more precisely than v1 did.

Every Phase 24 completion report MUST include a section titled **"Asset-class onboarding workflow learnings"** covering (a) what worked well + reusable for next asset class, (b) what surprised us + future pitfalls, (c) recurring structural patterns, (d) concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Empty section is acceptable — say "No new onboarding learnings this batch" explicitly; no filler. Workflow doc edits applied in the same governance turn.

### §2.5 — Green light to fix obvious bugs found during audit (Kyle directive 2026-05-20)
Each sub-batch's pre-audit surfaces findings under three categories: (a) in-scope (the asset-class-awareness fix the batch is about), (b) deferred / can wait, (c) **obvious bug found in passing that would otherwise hit us in Phase 19**. For (c), CC decides whether to absorb the fix into the current batch (when small, contained, reduces Phase 19 workload) or to spawn it as a separate task. Decisions documented in pre-audit + completion report. Where a bug is large or risky to bundle, flag back to Kyle for the call.

### §2.6 — Combine/split autonomy (Kyle directive 2026-05-20)
CC + Langston have autonomy to combine, split, or reorder sub-batches when one batch's pre-audit findings genuinely warrant it. Every refinement gets documented with reasoning + routed through standard Step 4 review. Default to the 17-batch shape unless evidence justifies otherwise.

### §2.7 — Phase 24 end-of-arc workflow consolidation
At end of Phase 24, a dedicated review batch consolidates every sub-batch's "Asset-class onboarding workflow learnings" section into a finalized `ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Target: 90-95% guesswork reduction for the next asset class onboarding (perpetual futures next, then others).

---

## §3 — Per-sub-batch scope-file template

Each sub-batch gets its own detailed scope file at `Claude Comms and Packages/Scope Files/B79_0n_<NAME>_SCOPE.md`. Required sections:

1. **Objective** — what asset-class-awareness gap the batch closes.
2. **Pre-audit checklist** — SIM consultation + Step 4.5 (writer/reader asset-class enumeration) + Step 4.6 (block-scope rename audit) + Step 4.7 (scan-cycle read-side data-completeness) + any batch-specific disciplines.
3. **Code changes** — every file:line modification with before/after where load-bearing.
4. **Unit tests** — every change has unit-test coverage.
5. **Acceptance criteria** — including crypto regression-lock + any operational soak gates.
6. **Crypto-regression invariant** — by-construction proof for this batch.
7. **Deferred follow-ups** — anything found in pre-audit that's deferred (with reasoning).
8. **Asset-class onboarding learnings section** (placeholder, fills during completion report).
9. **Open questions for Langston** — anything CC wants Langston to confirm before implementation.

The first sub-batch (B79.0n.HYGIENE) gets a detailed scope written immediately after this umbrella is locked.

---

## §4 — Status tracking

| Sub-batch | Scope file | Status | Notes |
|---|---|---|---|
| Sub-batch | Scope file | Status | B72 prior-arc | Notes |
|---|---|---|---|---|
| HYGIENE | `B79_0n_HYGIENE_SCOPE.md` (+ pre-audit + change list + Step 7 verification + completion report) | ✅ CLOSED 2026-05-21 | n/a | Deploy `6050165cf`; Langston Step 8 ACK all 8 checks PASS. Bug self-resolved + structural fence shipped. |
| UNIVERSE-DISCOVERY | `B79_0n_UNIVERSE_DISCOVERY_*.md` (scope + pre-audit + change list + Step 7 verification + Step 8 ACK + completion report) | ✅ CLOSED 2026-05-21 | n/a | Deploy `c97ceec81` PM2 #308. 479 symbols discovered, 489 active in DB, 15 sectors, 10.2% UNCATEGORIZED, 100% Finnhub enrichment. Step 8 Langston ACK all 7 in-window gates verified independently. |
| STORAGE | `B79_0n_STORAGE_*.md` (scope + pre-audit + change list + Step 4 review with BLOCKER fix-forward) | 🚧 STEP 4 RE-ACK in flight | none (Layer 1 vs B72's Layer 2 — distinct concerns) | Deploy commit pending Step 4 RE-ACK. 32 → 35 caller updates (3 additional via compile-driven audit); BLOCKER fix-forward addressed upsertScreenerFilters WHERE clause missing assetClass; 3 reclassifications (d→a) per Langston Step 4. |
| MCE | not yet drafted | NOT STARTED | **MATERIAL SHRINK** — B72 wired `regime_classifier` + `regime_age` + `dbs_calculation` + `cost_model`. Remaining: per-class seed + non-lever code branching (friction, indicators, macro modifier). |
| STRATEGY | not yet drafted | NOT STARTED | **MAJOR SHRINK** — B72 + B72.2 wired all 18 canonical strategies. Remaining: per-class seed (often none if symmetric) + `_SE_KEY` resolver tightening + Hybrid Integration + Strategy Sync + strategy-mapper. |
| PATTERN-DETECT | not yet drafted | NOT STARTED | modest — B72 wired `pattern_pool_gates`; pattern recognition primitives unchanged. |
| CONFIDENCE-CHAIN | not yet drafted | NOT STARTED | none — no B72 overlap. Pre-audit verifies whether modulators differ per asset class. |
| SCORING | not yet drafted | NOT STARTED | **MATERIAL SHRINK** — B72 Slice 4 wired SQE precedence + expectancy_kernel + vts_scoring + goals_weighting. Remaining: `_SQE_GK` parameterization (STORAGE deferred) + per-class seed. |
| TEC | not yet drafted | NOT STARTED | none — TEC was already asset-class-aware via B65.x. Sub-batch covers residual #116 + Structural Discontinuity Detector verification. |
| TELEMETRY | not yet drafted | NOT STARTED | none — telemetry aggregator per-class buckets are new infrastructure. Tier 1 HIGH (promoted in v2); consumed by RTB. |
| RTB | not yet drafted | NOT STARTED | modest — B72 wired `rtb_ranking` + `rtb_config` + `queue_admission`. Remaining: ARM (depends on TELEMETRY) + TCL watchdog + per-class seed. |
| RTB-REFRESH | not yet drafted | NOT STARTED | none — split from RTB per Kyle. |
| POOL | not yet drafted | NOT STARTED | none — `activeFilterPool.addSurvivors()` signature change is new work. |
| ORCHESTRATOR | not yet drafted | NOT STARTED | modest — B72 wired `signal_orchestrator` (4 levers). Remaining: per-cycle asset-class branching at strategy detect call sites + market-hours defense-in-depth. |
| EXECUTION | not yet drafted | NOT STARTED | **MATERIAL SHRINK** — B72 wired `position_sizing` (11 levers!) + `paper_sizing` + `paper_execution`. Remaining: per-class seed (likely meaningful for xStock — different leverage/lot/friction) + 4-executor-layer branching + tick/lot/whole-share enforcement. |
| WIRE-IN | not yet drafted | NOT STARTED | none — the actual mode-aware routing is new wiring. Last in dependency chain. |
| ML-CALIBRATION | not yet drafted | NOT STARTED | none — per-class ML stratification is new. T2 HIGH. |
| OBSERVABILITY | not yet drafted | NOT STARTED | modest — B72 wired `drift_detector` (1 lever). Remaining: per-{strategy, assetClass} baselines + Regime Archiver tagging + Dashboard filter UI. T2 MED. |

This tracker gets updated at every sub-batch's Step 1 (scope drafted), Step 4 (Langston ACK), Step 6 (deployed), Step 11 (closed).

---

## §5 — Estimated total time

Tier 1: 4-6 weeks sequential. Possibly faster with parallelization where dependencies allow.
Tier 2: additional 1-2 weeks (HIGH-priority batches TELEMETRY + ML-CALIBRATION should not lag T1 too far; OBSERVABILITY is lower priority and can backfill).

End-of-arc: Phase 24 workflow consolidation batch (~1 week).

**Realistic timeline:** 6-9 weeks total before umbrella closes and Phase 24 finishes.

---

## §5.5 — Phase 19 readiness gaps deferred from this umbrella (rev 2 NEW per Langston item 13)

Items Langston flagged as known-risk gaps that will NOT be fully closed by this umbrella; tracked for post-umbrella B79.x follow-up batches:

1. **Cross-class portfolio P&L reconciliation.** `fx-conversion-service.ts` (USD/USDT/EUR/JPY) exists for guardrail USD-normalization. It doesn't currently know about xStock USD-native pricing vs crypto USDT-quoted pricing as a class concern. Will surface the first time portfolio equity reports mix asset classes in Phase 19. Defer to B79.x follow-up.
2. **External macro feed (`external-macro-feed.ts`) per-class signal.** MCE has "macro modifier" but the upstream feed is class-agnostic today. Crypto-relevant macro (BTC dominance, ETF flows, funding resets) differs structurally from xStock-relevant macro (rates, earnings calendar). Defer to B79.x follow-up.

(Langston's third Phase-19-readiness suggestion — tick-size / lot-size / whole-share enforcement — was MOVED into EXECUTION scope per CC counter-proposal on item 13c. See EXECUTION (#14) in §1 above.)

**Forward-tracking note 1 from Langston v2 FINAL ACK:** these §5.5 items get logged into `1-system-manual/RUNNING_ISSUES.md` at the same time as this umbrella's Step 1 governance closure, so they don't get lost when this umbrella file closes at end-of-arc. Tracked as new RUNNING_ISSUES entries:

- #122 (NEW) — Cross-class portfolio P&L reconciliation (`fx-conversion-service.ts` USD-normalization doesn't know about xStock USD-native vs crypto USDT-quoted as a class concern)
- #123 (NEW) — External macro feed per-class signal (`external-macro-feed.ts` is class-agnostic; crypto-relevant macro vs xStock-relevant macro differ structurally)

Both logged with cross-references back to this umbrella + Langston v1 review item 13 origin.

**Forward-tracking note 3 from Langston v2 FINAL ACK (EXECUTION pre-audit):** EXECUTION's pre-audit on the 4 executor layers (paper-execution-engine, realtime-paper-executor, trade-executor, trading-engine) MUST surface findings to Langston at Step 2 review BEFORE finalizing implementation scope. If all 4 layers need branching and EXECUTION grows beyond a single-batch shape, CC and Langston jointly decide whether to split EXECUTION into two sub-batches at that gate (per §2.6 combine/split autonomy). Explicit conversation > silent absorption.

---

## §6 — Ask for Langston (Step 1 umbrella v2 FINAL ACK review)

Langston: this is a "prove-me-wrong" review. CC's responsibility is to find every module/service/function in the active-trading path that needs asset-class awareness. Langston's responsibility is to try to break this list — find anything missing, mis-grouped, or misframed.

Specific questions:

(a) **Completeness:** is there ANY module/service/function in the active-trading path (or learning/observability adjacent to it) that should be asset-class-aware but isn't in the 17-batch list? Specifically check: anything in `server/services/`, `server/core/`, `server/strategies/`, `server/asset_classes/` that operates in the post-filter pipeline.

(b) **Mis-grouping:** are any of the modules I've folded into a batch genuinely separate enough to warrant their own batch? (e.g., I folded Adaptive Ratio Manager into RTB; should it be standalone? I folded Dynamic Sizing Engine into EXECUTION; should it be standalone?)

(c) **Dependency graph:** are the dependencies in §1 correct? Anything that should ship before STORAGE? Any sub-batch that depends on more than what I've listed?

(d) **Crypto-regression-lock acceptance:** ±5% threshold reasonable, or too loose / too tight for any specific subsystem?

(e) **Tier 2 placement:** are TELEMETRY + ML-CALIBRATION genuinely Tier 2, or should they be Tier 1 because they affect routing decisions (FX5 Adaptive Ratio reads telemetry to decide what to scan)?

(f) **Phase 19 readiness check:** anything in the 17-batch list that, even after close, leaves a known gap that Phase 19 testing would surface? Flag it as a known risk now.

Reply: **umbrella v1 FINAL ACK** / **specific list additions/regroupings** / **substantive design disagreement**.

---

## §7 — Rev 2 FINAL ACK gate (NEW per Langston v1 review iteration)

This is the v2 reply gate. Of your 11 v1 items, **8 are accepted as-is, 3 have CC counter-proposals.** The accepted items are folded into §0, §1, §2.2, §2.4, §5.5 of rev 2. The counter-proposals are:

| Item | Your v1 ask | CC counter-proposal | Reasoning |
|---|---|---|---|
| 2 | Fold slippage-fee-model.ts into MCE | Move to EXECUTION instead | slippage-fee-model.ts is consumed by realtime-paper-executor.ts (execution-side concern). MCE handles cost-model.ts (EV-side input). Splitting MCE/EXECUTION ownership by consumer rather than module-name keeps batch boundaries clean. EXECUTION batch already touches the execution layer; folding this here is natural. |
| 6 | Pin scope: which of 4 executor layers need branching | Add explicit pre-audit deliverable to enumerate all 4 + determine delegation; scope adjusts based on findings | Pre-audit is the right place to enumerate. If all 4 layers need fixes, EXECUTION scope expands at Step 2. If there's clean delegation through paper-execution-engine, scope stays focused on that one entry point. Either outcome is documented in pre-audit. |
| 13c | Defer tick-size/lot-size to Phase 19 follow-up | Include in EXECUTION scope of this umbrella | xStock whole-share rounding silently zero-ing small positions is a real production bug we can prevent now. Defer-to-Phase-19 means we ship knowing the bug exists; in-arc means we ship fixed. Phase 19 already has plenty of work; reducing avoidable bug surface here is high-value. |

The other 10 items I either accepted exactly as you framed them (1, 3, 4, 5, 7, 9, 10, 11, 12, 13a, 13b) or you confirmed my v1 position (item 8 — ARM stays in RTB).

Reply: **rev2 FINAL ACK** if you concur on the 3 counter-proposals / **further iteration** if you want to push back on any of them.

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §12 dispatch-anchoring: this umbrella IS the inbox file. Do NOT `cd /mnt/gdrive`. For repo-side inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

— Claude Code, 2026-05-20 PM (umbrella rev 2)
