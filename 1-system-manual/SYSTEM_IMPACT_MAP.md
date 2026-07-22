# DawnTrader System Impact Map
> **🔑 P19-B-RENAME NAME KEY (2026-07-03) — the paper→active rename shipped.** The LIVING sections below use the NEW names; DATED history entries (the archive from "# Change History" down / any pre-2026-07-03 per-batch note) keep the names of their era — translate via: paper-execution-engine→**active-execution-engine** · paper-sim-service→**active-engine-service** · paper-portfolio-manager→**active-portfolio-manager** · paper-position-sizing→**active-position-sizing** · paper-session-reset→**active-session-reset** · paper_sim_heartbeat→**active-engine-heartbeat** · paper-sim-diagnostic (server)→**active-scan-diagnostic** · tables: paper_sim_trades→**closed_trades** · paper_sim_open_positions→**active_open_positions** · paper_sim_sessions→**active_engine_sessions** · paper_sim_trade_logs→**active_trade_logs** · routes /api/paper-sim/*→**/api/active-engine/*** · events paper_sim_*→**active_engine_*** · module keys paper_execution/paper_sizing→**active_execution/active_sizing**. Deliberate old-name survivors: the persisted `'paper_sim'` discriminator (#405 keep-as-data), legacy `paper_trades`+paper-metrics (OPEN-2), the `'paper'|'live'` mode axis, shipped migrations.


> **Author**: Claude Code (System Cartographer)
> **Created**: 2026-02-19
> **Last Updated**: 2026-06-15 (P19-B4b D1 — **reorganized for navigability**: added a Table of Contents + the "Cross-Cutting Runtime State, Singletons & Liveness Registry" near the top, and moved ALL per-batch history into the "Change History & Per-Batch Additions" archive at the bottom so the stable reference is read top-to-bottom without wading through changelog. No content was removed in the reorg — every prior section is preserved (history sections are at the bottom). The archive holds the per-batch trail current through the B79.0n REQUIRED-assetClass umbrella, B.4 15-minute foundation, and the B70.2 / B-NEW-53 decision-provenance work.)
> **Purpose**: Component dependency reference for directive authoring. Before writing any directive, consult this map to identify all upstream, downstream, and shared-state impacts of the proposed change.
> **Usage**: Claude Code looks up every affected component BEFORE writing a directive. The directive's Impact Analysis section must reference this map.

---


## Table of Contents

**Stable reference — this document's primary content (read top-to-bottom):**

- [How to Use This Map](#how-to-use-this-map)
- [Cross-Cutting Runtime State, Singletons & Liveness Registry (the "who-shares-what" map)](#cross-cutting-runtime-state-singletons-liveness-registry-the-who-shares-what-map)
- [Layer 1: Core Math & Scoring](#layer-1-core-math-scoring)
- [Layer 2: Market Data & Price Feeds](#layer-2-market-data-price-feeds)
- [Layer 3: Scanning & Filtering](#layer-3-scanning-filtering)
- [Layer 4: Signal Generation & Qualification](#layer-4-signal-generation-qualification)
- [Layer 5: Regime Classification](#layer-5-regime-classification)
- [Layer 6: Execution](#layer-6-execution)
- [Layer 7: Learning & Calibration](#layer-7-learning-calibration)
- [Layer 8: Predictive Learning Stack](#layer-8-predictive-learning-stack)
- [Layer 9: Infrastructure & Monitoring](#layer-9-infrastructure-monitoring)
- [Layer 10: Frontend & Communication](#layer-10-frontend-communication)
- [Layer 11: Legacy (Active but Pending Removal)](#layer-11-legacy-active-but-pending-removal)
- [Quick Lookup: "If I Change X, Check Y"](#quick-lookup-if-i-change-x-check-y)
- [Infrastructure Dependencies (Batch 40 — Post-Replit Migration)](#infrastructure-dependencies-batch-40-post-replit-migration)
- [Rename invariants (added 2026-05-14 — B83 post-mortem governance)](#rename-invariants-added-2026-05-14-b83-post-mortem-governance)

**[Change History & Per-Batch Additions](#change-history--per-batch-additions-archive)** — the chronological audit trail, moved to the bottom so it doesn't block the reference above. Fold still-live component docs from there up into the Layer maps over time.

---

## How to Use This Map

1. Identify which component(s) the directive will modify
2. Look up each component below
3. Check all UPSTREAM dependencies (will they still feed correct data?)
4. Check all DOWNSTREAM consumers (will they still receive what they expect?)
5. Check SHARED STATE (will config/state changes ripple elsewhere?)
6. Check BACKGROUND EXECUTION (does the change affect timers, intervals, or startup?)
7. Check RELATED TESTS (which tests validate this behavior?)
8. Note the BLAST RADIUS rating in the directive's Impact Analysis

### Blast Radius Ratings

| Rating | Meaning |
|--------|---------|
| **LOW** | Change is isolated. Few or no downstream consumers. Safe to modify independently. |
| **MEDIUM** | Change affects 2-5 other components. Moderate testing required. |
| **HIGH** | Change affects many components or a critical pipeline path. Thorough testing required. |
| **CRITICAL** | Change affects the core trading signal path. Every downstream component must be verified. |

---

## Cross-Cutting Runtime State, Singletons & Liveness Registry (the "who-shares-what" map)

> **Read this first if you are new, or before ANY change that touches paper/live mode, the trading engines, or shared in-memory state.** This registry exists because the file-by-file layer maps below do NOT capture *runtime shared state* — the process-global and module-singleton objects that many components read and write at once. That shared state is where the worst, hardest-to-see bugs live (one mode corrupting another's risk budget; a stale "is trading on?" flag). Built from the P19-B4b D1 split-brain audit + independent re-verification (2026-06-15); every entry is code-verified with file:line.
>
> **MAINTENANCE DISCIPLINE (governance rule):** any batch that adds, removes, or re-keys a process-global / module-singleton / `static` field / mode-keyed map MUST update this registry in the same batch (this is the SIM's existing "cross-cutting state" charter, now made explicit). A new shared singleton that is not listed here is a governance gap. When you isolate or delete one, update its row + note the batch.

### Two-axis model the system runs on
Two **orthogonal** axes (see CLAUDE.md rule 20): **mode** = `paper` | `live`; **active-trading** = ON | OFF. Phase 21 will run paper AND live **simultaneously**. Therefore every piece of mutable runtime state must be either (a) genuinely mode-invariant (market data — safe to share) or (b) **keyed by mode** (trade state — must be separated). State that is shared-but-should-be-mode-keyed is a **SPLIT-BRAIN risk** and a hard blocker for the Phase-21 co-run (P19-B4b Objective-3 gate).

> **★ P19-B4b D5 ISOLATION STATUS (2026-06-15 — the Phase-21 co-run precondition shipped).** **S1** (portfolio-manager cluster + the per-mode manager that holds the heat ceilings) → now `Map<'paper'|'live',Manager>` behind mode-aware accessors (the vestigial busy-flag/operation-lock cluster was deleted — see DELETED_COMPONENTS_LOG). **S4** (risk-concentration) → `Map<mode,Map<symbol,…>>`, mode threaded (required). **S6** (RTB refresh latch) → key mode-prefixed `${mode}:${signalId}`. **Liveness** → DB SSOT + write-then-broadcast-on-commit + the settling-guarded `LIVENESS_SPLIT` invariant-witness (see model below). **S2** confirmed shared-safe (market-return-derived). **S13/S8** left shared by design (S13 witnessed by the liveness check + VTS only needs any-active; S8 a load-knob shadowed per-mode for decisions). **S3** (Kraken limiter) **DEFERRED** to a follow-up batch — `kraken.ts` is a 🔒 LOCKED module + S3 is a *fragmentation* fix not a hard blocker (account-wide lockout is correctly shared on the single key; key by CREDENTIAL identity not mode — RUNNING_ISSUES #296). `global.tradingEngines` removal stays deferred (#297).

> **★ P19-B4b.1 FILL-FIDELITY STATE (2026-06-16 — depth-walked paper fill + 24/5 depth-sufficiency gate, DORMANT til B7b).** Three new pieces of process/module state, all **mode-INVARIANT** (feed/telemetry/config — NOT split-brain, like S2/S5): **(a)** `KrakenWebSocketAdapter.bookUpdatedAt: Map<symbol,ms>` — per-symbol book-update freshness for the fill warmth gate (market-data-derived, both modes share the same book — safe); **(b)** `depth-source.ts` `_gateBlocks: Map<'assetClass:reasonKind',count>` — observable depth-gate block counter (telemetry, `getDepthGateBlockStats()`); **(c)** `depth-gate-config.ts` `_cache: Map<AssetClass,config>` — per-class DB-resolved `fill_depth_gate` config cache (mode-invariant; fail-closed). None require mode-keying. The depth-walked fill itself is per-mode only via the engine's existing `mode` field; the placer is stateless.

> **★ P19-B5c CONTINUOUS Q-D PROBE CRON (2026-06-16 — always-on telemetry singleton, #86).** New always-on background singleton: `xstock-qd-probe-cron.ts` `_cronTask` (the node-cron handle + idempotent double-register guard) registers `xstock_qd_probe_cron` in the B-NEW-49 `cronRegistry` (so the boot smoke-test + 15-min fire-evidence verifier auto-cover it) and writes a `scheduled_tasks_audit` fire-evidence row on every fire (meta: `{market_open, universe_size, rows_written, symbols_skipped_no_snap, symbols_stale}`). **Mode-INVARIANT** (telemetry/feed-derived — like S2/S5; NOT split-brain, no trade state, no per-mode keying): every ~5 min it reads the shared `xstock_spot_ticker_snap` archive + the `XSTOCK_SPOT_SYMBOLS` universe set and writes the NEW `xstock_qd_probe_history` table (compact derived bid/ask spread + top-of-book depth + freshness per active xStock). Cadence + freshness-ceiling are `module_constants`-resolved (`qd_probe.*`) + cached at registration (cadence must divide 60; changing it = constant bump + restart). Retention is owned by the **B75 sweep's new plain-table age-delete pass** (90d, no cold-offload — `data_lifecycle.xstock_qd_probe_history.hot_retention_days`). **CAPTURE-ONLY** — nothing consumes the table this batch (friction-extraction → B81/Phase-25). Weekend signature = `market_open=false` + `symbols_stale≈universe` (Friday's snaps persist + write `stale=true`), NOT `rows_written=0` — a future breakage alert must NOT key off row counts.

> **★ P19-B6.5d ASSET-CLASS CARRY-THE-STAMP INVARIANT (2026-06-18 — a cross-cutting data-flow rule, NOT a singleton).** The asset class is a **carried property of a trading pair as it flows through the active pipeline**, not something to be re-derived at each step. It is STAMPED ONCE at pipe entry — **crypto** = `signal-orchestrator` builds `SizingContext.assetClass`; **xStock** = `active-dispatch` stamps at the dispatch seam — and CARRIED with the pair through SQE → RTB → TEC → execution. **The invariant: never re-derive the class from the symbol string at a downstream active-path site.** Re-deriving (`resolveAssetClass`/`safeResolveAssetClass` from the bare symbol) hardcodes `exchange='kraken'` and mishandles the 9 USD / 8 EUR `XSTOCK_SPOT_KRAKEN_COLLISIONS` tickers + single-letter bases — which is exactly the structural defect behind the live `A/EUR@kraken` classify fall-through (alert `58367b27`). P19-B6.5d converted **26 of 35** resolve sites that were re-deriving to **prefer the carried stamp** (~12 active-path: SQE gate, signal-orchestrator ×4 reusing `sizingContext.assetClass`, routes P/L ×2, paper-engine AMR ×2, pre-exec-validator, RTB AMR-shadow ×2); the **14 passive/VTS sites are left resolve-once-at-entry BY DESIGN** (see §9.13 — intentionally-retained, not a missed sweep). **Cross-cutting alert state:** the classify fall-through hook (`setClassifyFallthroughHook`, §9.13) now dedupes per-pair with the key `classify-fallthrough-active:${symbol}@${exchange}` (`server/index.ts`) — so a recurring fall-through fires ONE active-path alert per pair, not a flood. An active-path `[STAMP_MISSING_ACTIVE]` log (kept un-throttled intentionally so the P19-B6.5e dry-run can measure its rate — RUNNING_ISSUES JC#4) is the tripwire for any residual carry gap. **No process-global / singleton is added by this batch** — it is a stamping-discipline + alert-keying rule, recorded here because the data flow is cross-cutting across SQE/RTB/TEC/execution.

> **★ P19-B6.5f RECOGNITION QUOTE-SET SLOT (2026-06-19 — a cross-layer liveness dependency, mode-INVARIANT).** Symbol RECOGNITION (`resolveAssetClass` / `toCanonical` + the raw-form regexes in `shared/asset-classes.ts`) now reads the quote-currency set from a module-level SLOT `_discoveredQuotes` (set via `setDiscoveredQuotes()`), fed by the server from `kraken-asset-pairs-service.dynamicQuotes`. **Layering:** the SERVER pushes into the slot (mirrors `setClassifyFallthroughHook`); `shared/` never imports `server/`. **Liveness:** `setDiscoveredQuotes()` fires at the TAIL of EVERY kraken-asset-pairs `refresh()` (NOT just boot) + rebuilds the raw-form regexes, so a newly-listed Kraken quote is recognized without a restart (self-healing). **Fallback is COMPLETE, never narrow:** slot null (pre-first-refresh / refresh-failure / size-0) → recognition uses the curated complete `KNOWN_QUOTE_CURRENCIES` (23 legs, live-enumerated 2026-06-19; max quote length 5 = EUROP/PYUSD/RLUSD). **Mode-INVARIANT** (vocabulary, not trade state — like S2/S5/S15/S16; do NOT mode-key). **Recognition ≠ eligibility:** classifying a quote ≠ trading it — the `universe-loader` `allowedQuotes`=[USD,USDT,USDC] filter stays the downstream trade-gate. See S17 below + the SYSTEM_MANUAL recognition-path note.

> **★ reorg-B2.3 PER-STRATEGY minRR + UNKNOWN-STRATEGY TRIPWIRE SINGLETONS (2026-06-27, mode-INVARIANT).** The per-class target gate `getPerClassTargetGate(assetClass)` → `getPerClassTargetGate(assetClass, strategy)` (`strategy` REQUIRED) now resolves `min_rr` per-(strategy×class) and canonicalizes its strategy token at a **single chokepoint** — it calls the existing SSOT `normalizeStrategy` via a new thin fail-closed wrapper **`resolveCanonicalStrategy`** (`canonical-regime-strategy-map.ts`, null-on-miss; NOT a duplicate canonicalizer). An unrecognized token fails CLOSED to `min_rr_unknown_floor` (max-per-class). **New module-singleton cross-cutting state in `server/core/observability/unknown-strategy-counter.ts`:** `_counts: Map<assetClass,number>` (the queryable `dawntrader_gate_unknown_strategy_total{asset_class}` metric, read via `getUnknownStrategyCounts()`), `_alerted: Set<assetClass>` (throttles the §13 `unknown_strategy_at_gate` tripwire to once per class per process), `_lastWarnAtMs: number` (≤1/30s loud-log throttle). **Mode-INVARIANT** (code-drift observability — NOT trade state, do NOT mode-key; the §13 alert hardcodes `mode:'paper'` for its envelope but `metadata.firesOnAllModes=true` records that it fires on the live gate path too). Safety (the fail-closed floor substitution) is independent of these singletons — a missed count/alert can't open the gate. Also reorg-B2.3: the guard-eval tracker (`guard-eval-tracker.ts` `_stats` map) gains `rrSumSq` + `rrSumSqEvals` per record (Phase-25 25-20 σ; restore-seam = RUNNING_ISSUES #399). See SYSTEM_MANUAL "reorg-B2.3" subsection.

> **★ P19-B6.8 GUARDRAILS-TAB = `CoreFourGuardrails`→`guardrails_v2` (per-mode SoT) + STRANDED-DEAD GuardrailsTab §15-REMOVED (2026-06-29; NO new singleton/cross-cutting state).** The user-facing guardrails tab is the LIVE `client/src/components/goals/core-four-guardrails.tsx` mounted at `goals-engine.tsx:71` — reads+writes `/api/guardrails-v2` (GET+PUT) per current mode; the per-mode (paper+live) `guardrails_v2` rows are the source of truth (the active F1 gate `guardrail-policy.checkGuardrailRisk` + `daily-loss-budget.ts` read them). B6.8 surfaced the 2 daily-loss warning tiers (`dailyLossWarning1/2Pct`) as user controls — wiring touches 4 places (UI param list + client coherency; PUT `/api/guardrails-v2` extraction/validation/update; RULE_011 in `guardrail-policy.ts`; AND the `upsertGuardrailsV2` UPDATE merge-map in `storage.ts` — the persistence place a Step-8 DB-cross-check caught was dropping them). **§15 removal:** `guardrails-tab.tsx` (the OLD pre-v2 tab, imported-never-rendered) + its orphaned `copy-to-live-modal.tsx` deleted (DELETED_COMPONENTS_LOG). **NOT removed (P19-B6.10):** the old `guardrails` TABLE + `PUT /api/guardrails` + `upsertGuardrails` throw-stub — live callers `reasoning-orchestrator.ts:500` (stale-read) + `intent-executor.ts:418` (throw) must migrate to v2 first (RUNNING_ISSUES #400). No process-global/singleton added by B6.8. See SYSTEM_MANUAL Ch4 §2. **★ P19-B6.8a (2026-06-30):** `CoreFourGuardrails` now takes a **REQUIRED `mode: 'paper' | 'live'` prop** and is PINNED to it (no longer reads the ambient `useTradingMode` toggle, which defaults to `'live'`). `goals-engine.tsx` renders `<CoreFourGuardrails mode="paper" />` under the renamed "Paper Guardrails" tab; the future "Live Guardrails" tab is `<CoreFourGuardrails mode="live" />` (deferred → RUNNING_ISSUES #401 + roadmap §21.3 21-3a). The header now shows a big bold "{Paper|Live} Mode" derived from the prop. `mode-indicator.tsx` retained (consumed by 7 other tabs; the 2 imports removed here leave no stub — §15 clean). Pure UI/prop change — no endpoint/DB/singleton impact; the per-mode `/api/guardrails-v2?mode=` wiring is unchanged.

> **★ reorg-B2.2 GUARD-EVAL-TRACKER DURABLE SINGLETON (2026-06-23 — telemetry, mode-INVARIANT; now per-(strategy,assetClass)-keyed + on-disk-backed).** `server/strategies/guard-eval-tracker.ts` holds a module-singleton `_stats: Map<string,GuardEvalRecord>` of shared-guard suppression counters. **OBJ-A** made it DURABLE: an atomic tmp+rename checkpoint to the **on-disk artifact `logs/guard-eval-checkpoint.json`** (~60s unref'd timer) + reload-on-module-load, so a process restart pauses+resumes the window instead of zeroing it; `_startedAt` (`getGuardEvalStartedAt()`) is the #373 wipe-detection stamp. **OBJ-B re-keyed it** from strategy-only to the composite `${strategy}::${assetClass}` (the suppression window is now per asset class) — the checkpoint carries a `keySchema='strategy::assetClass/v1'` and reload DISCARDS-and-loud-logs on any mismatch (incl. an unversioned legacy file) so a future key-cardinality change can never silently load orphan buckets. **Mode-INVARIANT** (telemetry, no trade state — like S2/S5/S15/S16/S17; do NOT mode-key). **Serial-pipeline-safe** (the active + VTS eval pipelines are strictly serial; if guard eval ever becomes concurrent, make it eval-local). Readers: `getGuardEvalStats` (strategy aggregate — `/api/diagnostics/guard-eval-stats` v3) + `getGuardEvalStatsByClass`/`getGuardEvalStatsPerClass` (per-class — the two VTS Filter-Diagnostics endpoints + the v3 `statsByClass`). Writers: `recordGuardEval` (18 strategy guard sites) + the checkpoint timer.

> **★ reorg-B4 SHADOW-TRADE TELEMETRY LAYER (2026-06-25 — a NEW runtime singleton `openShadowTrades` (S19) + a NEW persisted sink `rtb_shadow_pairings`, both telemetry-only / DORMANT until paper-active turn-on).** The selection-quality data engine opens a counterfactual "shadow" trade for EVERY RTB-pool member each promotion cycle (the promoted pick AND the non-promoted alternatives), prices it through the SAME `evaluateTECExit` service the real VTS resolver uses, and records the decision-time ranking inputs + realized outcome — so reorg-B5 can measure whether the ranker picked the best of the field. **By-construction isolation (the whole point — it must NEVER perturb the live trading path or the VTS learning path):** **(1)** shadows live in a SEPARATE module Map `openShadowTrades` (`vts-runner.ts`), NEVER `openVirtualTrades` — so every existing reader of the live Map (cap gates, dup/lane guards, `getStats`, ranking) is shadow-free with no predicate to forget (registry **S19**); **(2)** the close path is an ALLOWLIST `shadowClose` that writes ONLY the isolated `rtb_shadow_pairings` sink (+ the shadow's own `vts_open_trades` backing row + `clearTrailingState`) — it NEVER calls a learning sink (`outcomeFeedbackStore.updateEma` / `telemetry.recordPairTelemetry` / `updateRollingAverages` / the exit-decision archive / `closed_trades`); **(3)** shadow rows ALSO persist into the shared `vts_open_trades` table (tagged `context.shadow=true`), so EVERY non-shadow read of that table excludes them via the single shared predicate `VTS_OPEN_TRADES_EXCLUDE_SHADOW` (`vts-trade-persistence.ts`) — applied at the factor-replay/ablation learning feed (`factor-replay-core.ts loadClosedVtsTradesFromDb`), the xStock 24h telemetry count (`routes.ts`), and the bootstrap boot-gate count; **(4)** boot rehydration routes `context.shadow===true` rows back into `openShadowTrades` (the split). **Exit math is REUSED, not forked** (a drift-guard test pins that the shadow resolver calls the same `evaluateTECExit`): only `maxHoldMs=SHADOW_MAX_HOLD_MS` (6h) + the close-action differ. **Population bound:** dedupe by `(mode,signalId)` via a single `shadowDedupeKey` helper at open/rehydrate/close (one live shadow per pool member → ~pool-size); `SHADOW_CAP=10000` (reject-new + drop-counter + alert) + the 6h TTL are TRUE backstops. **cycleKey** is one-per-promotion-cycle today (`checkRtbPromotion` calls `getRankedSignals` with no assetClass); a future per-class promotion makes it per-(cycle×class) — bounded + internally consistent (a B5 consumer must NOT read it as globally-unique-per-cycle). **GC-DELETE intentional-reap (Langston Step-4 call-out):** `sweepClosedOpenTrades`'s `DELETE FROM vts_open_trades` reaps CLOSED shadow backing rows by age along with real ones — INTENTIONAL/desirable, since the shadow OUTCOME already lives durably in `rtb_shadow_pairings` by then; the unfiltered DELETE is NOT a missed shadow-exclusion sweep. **DORMANT today** (rtb_total=0 → no promotions → no shadow rows; §9.1 forward-instrumentation; lights up at paper-active turn-on ~B9). Two B9-gated hardening items: RUNNING_ISSUES **#388** (rehydration fail-direction → make `rtb_shadow_pairings` authoritative on restart) + **#389** (capture-path guard). The sink `rtb_shadow_pairings` has NO learning consumer EVER — pure reorg-B5/B6 analysis sink.
>
> **★ reorg-B4.1 (2026-06-26) — per-cycle pool-membership record + the Shadows visibility tab.** Adds a SECOND isolated sink `rtb_shadow_pool_members` (EVENT grain: one row per promotion-cycle × pool member) alongside `rtb_shadow_pairings` (the trade ENTITY grain: one per signal, resolves once). reorg-B4 stamped rank/`promoted` only at a signal's FIRST appearance, so a signal promoted on a LATER cycle (or whose rank drifts while it lingers in the pool) couldn't be reconstructed; `rtb_shadow_pool_members` is written EVERY cycle for every member (NOT deduped) to capture rank + promoted + the decision-time score snapshot per cycle, while the resolving shadow TRADE stays deduped one-per-signal. **FK is LOGICAL, not enforced (Langston Step-4 F3):** `shadow_trade_id` is `NOT NULL` and points at `rtb_shadow_pairings.id`, but there is **no DB `REFERENCES`/CASCADE constraint** — referential integrity is guaranteed by the capture ORDERING (resolve-the-trade-id-FIRST → only write the member row when non-null → dangling FK impossible by construction), chosen so a fire-and-forget member-write can't fail on a hard constraint. **Capture-boundary tolerance:** a member-write failure is logged + tolerated, so a persisted cycle can hold FEWER member rows than the pool had → readers use the stamped `pool_size`, NEVER `COUNT(*)`. **`registerOpenShadowTrade` dedupe return widened null→existing-id** (the one live-engine behavior change; sole caller discards the return, verified) so the member row can FK the existing trade. **Read path:** `GET /api/shadow-trades/by-cycle` (read-only) + the "Shadows" UI tab (`active-trades.tsx` + `shadow-trades-tab.tsx`, after Trade History) — the selection-quality summary ("did the ranker pick the best?") is a SQL aggregate over ALL FULLY-CLOSED cycles (`bool_and(p.closed)` gate + `percentile_cont` median), so it never scores a still-resolving field and isn't page-scoped. NO new shared-state singleton (both are DB sinks; S19 `openShadowTrades` unchanged). DORMANT (rtb_total=0 → §9.1). Retention: RUNNING_ISSUES #390 (B9). Still pure reorg-B5/B6 analysis sinks — no learning consumer reads either table.

> **★ P19-B7.1 RANKING FIX (2026-06-30 — the live-picker ranker construct change + the selection-IC proof harness; deployed `0dacd34f2`, dormant until paper-active).** Replaces the friction-blind `finalScore` sort in `getRankedSignals` (`ready_to_buy_service.ts`, the SOLE live picker, called once per promotion cycle by `checkRtbPromotion`) with a **pluggable ranker defaulting to the expected R-multiple** `R = netEV ÷ risk_price` (risk-normalized, net-of-cost, cross-asset-comparable). **Construct/SoT:** the active ranker is DB-governed at `module_constants.rtb_ranking.active_ranker` (fail-hard via the NEW `getCachedStringRequired` reader — no hidden default, §5 r15); arms = `r_multiple`(default) | `confidence`(the old finalScore sort) | `ranking_score`(inert VTS). **UPSTREAM:** R is the kernel's own `netRewardToRisk` surfaced through `evaluateTradeExpectancy` (NEW `pWinFloored` + `netRewardToRisk` fields on `TradeExpectancyResult`); rank-time REUSES that wrapper in `quiet` mode — so the rank-time number == the gate's number, and the EV-input calibration sample (recorded ONLY at the open path, `active-execution-engine.ts`) is NOT double-fired (no-double-sample by construction). **DOWNSTREAM/telemetry (3 NEW cols on BOTH shadow grains `rtb_shadow_pairings` + `rtb_shadow_pool_members`):** `predicted_r_multiple` (decision-time R), `pwin_floored` (kernel-output-derived `pWin ≤ minPWin`, complete across all floor paths), `cross_class_promotion` (rank0-class ≠ rank1-class). **NEW pure component `server/core/metrics/selection-ic.ts`** (per-cycle cross-sectional Spearman IC + window-clustered SE + per-regime + min-N; period-equal point estimate) — the Phase-25 ranker-validation GO/NO-GO harness; no I/O, no shared state. **OBJ-3 reject/floor:** degenerate near-zero-stop signals are rejected from ranking (pure `computeRankRiskFloor`, `max(min_atr_fraction×ATR, min_abs_risk_fraction×entry)`, capital-independent; DB knobs `rtb_ranking.min_atr_fraction_floor`/`min_abs_risk_fraction`). Defense-in-depth with the emit-stage GUARD-1 (`strategy-helpers.ts MIN_STOP_DISTANCE_BPS=30`) — different stage/basis, NOT a same-gate split-brain (single-source-the-bps is a considered Phase-25 cleanup, #399). **OBJ-5 sizing-coherence (`active-position-sizing.ts` + `rtb-metrics-service.ts`):** the sizer returns `effectiveRiskFractionRatio` (sized-risk ÷ intended-risk, absorbing the notional clamp AND the `correlationScale` covariance modulator that never flips `wasClamped`) + asserts the ≤R upper-bound invariant; the open path records it per actually-SIZED signal into a NEW bounded `rtbMetricsService.sizingClampSamples` buffer (`getSizingClampProof` boundRate = the Phase-25 input that decides R-rank vs realized-$EV). NO new runtime singleton (the clamp buffer lives on the existing `rtbMetricsService` instance; bounded 500, cleared on session reset). **DORMANT** (active trading OFF → the picker doesn't run live; §9.1 forward-instrumentation). Phase-25 homes = RUNNING_ISSUES #399. The §4.3 RTB Service entry's ranking surface is now this construct.

> **★ P19-B7.2 MAKER/TAKER BEST-OF-BOTH ENTRY DECISION (2026-07-01 — the structural crypto opener; deployed `c595d987e`, dormant until paper-active).** A per-signal maker-vs-taker ENTRY decision, computed ONCE at the SHARED build convergence `signal-orchestrator.buildSizedSignalForStrategy` (the point ALL emit paths funnel through — quant via `evaluateSymbol`, hybrid, pattern via the pattern pool, xStock via `dispatchExternalSignal`; the `[HF9]` NetEV filter is QUANT-path-only and the pattern path bypasses it, so the shared convergence — NOT `[HF9]` — is the correct home). **NEW pure `server/core/math/maker-taker-decision.ts`** (`decideMakerTaker`): both taker-EV and maker-EV via the SAME `computeNetExpectancyKernel` (only `totalFriction` differs; maker saves the entry-leg fee-delta+spread+slippage, fee delta single-sourced `feeRateTaker−feeRateMaker` from `getFrictionForAssetClass`); conservatism = ONE per-class DB haircut `pFill·(makerNetEV−A) − (1−pFill)·C` (non-fill an opportunity-cost LOSS, A↑strength, C↑continuation, hard taker floor, urgency endogenous via the continuation/reversal family prior). **NEW `server/services/maker-taker-config.ts`** resolves the per-class `module_constants.maker_taker` knobs (fail-hard; warmed by b72-warmup). **UPSTREAM**: `getCachedCostMetrics` (per-symbol taker costs) + `getFrictionForAssetClass` (fee pair) + the at-queue DI/DBS basis (F2 single-basis with the `di_at_queue` snapshot). **DOWNSTREAM**: 4 NEW typed `rtb_signals` columns (`chosen_entry_mode`/`chosen_net_ev`/`taker_net_ev`/`maker_net_ev_adjusted`) — the `[11.8B]` open-gate (`active-execution-engine`) + the B7.1 ranker BOTH read `chosen_net_ev` (single-consistent-number; never the raw maker EV). **CONVERT-SAFETY (OBJ-4)** lives in `ready_to_buy_service.refreshSingleSignal`/`processMakerPending`: honest trade-through fill (`livePricingAdapter`) + on-expiry taker re-check via the **KERNEL** (`evaluateTradeExpectancy`, NOT `computeNetGeometry` — the gross-vs-net field-name landmine) + atomic re-snapshot. **NEW telemetry**: `rtbMetricsService.getMakerPickProof()` (maker-pick-rate monitor). **Active-path gate topology**: the SQE ROI gate is DORMANT (guarded `if(entry&&target&&regime)`, unset on the active sqeInput `signal-orchestrator.ts:669`) → `[11.8B]` is the sole active taker-EV gate; if ever activated, best-of-both moves before it. **DORMANT** (§9.1; real Kraken resting-order lifecycle = Phase-21). #330 SPLIT→P19-B7.2a; #410 (haircut calibration Phase-21/25); #411 (pattern gen-time gate, measured at B8).
>
> **★ CROSS-CUTTING STATE — the in-queue `maker_pending` ladder was REMOVED (P19-B7.2b, 2026-07-01 — wrong-stage; `a9480e4f8`).** The B7.2 make-then-take ladder state (`maker_pending`/`maker_posted_at`/`maker_limit_price`/`maker_budget_expires_at`, the `processMakerPending`/`markMakerPending` methods, the `refreshSingleSignal` early-branch, the `getRankedSignals` mutual-exclusion filter, the promotion-loop maker-POST branch) is **STRIPPED** (never populated in prod — active trading OFF; DELETED_COMPONENTS_LOG §15; migration drops the 4 `rtb_signals` cols). **Corrected model (Kyle 2026-07-01):** a signal in the RTBQ carries a maker/taker **DECISION only** (works NO order); the maker ORDER is placed only AT PROMOTION. So there is NO in-queue resting-order state to register. The maker-order FILL lifecycle (a promoted maker order holding a PENDING slot until filled) is post-promotion — **simulated for paper + VTS in B7.2c (build-now)**, a real Kraken resting order in **Phase-21**. The decision-snapshot columns (`chosen_entry_mode`/`chosen_net_ev`/`taker_net_ev`/`maker_net_ev_adjusted`) STAY on `rtb_signals` — they are the correct in-queue artifact (the live decision the `[11.8B]` gate + B7.1 ranker read).
>
> **★ P19-B7.2b (2026-07-01, `a9480e4f8`+`8dc63772a`; dormant until paper-active) — completes the shared maker/taker service + fee-mode visibility.** **(1) VTS now calls the shared `decideMakerTaker`** (`vts-runner`, before its Net-EV gate — gates on best-of-both `chosenNetEV`), so the learning substrate prices maker-vs-taker with the SAME kernel the active path uses (best-of-both parity — expect a small VTS volume tick-up as taker-marginal/maker-better signals it previously skipped now pass; call out at B8, not a regression). **(2) Active-path placement:** the `signal-orchestrator` decision runs standalone BEFORE the SQE (the SQE stays calculation-free — Kyle) — proven pure-reorder (signalStrength = finalScore computed before the SQE evaluate). **(3) RTB refresh re-decides** (`ready_to_buy_service.refreshSingleSignal`): re-runs `decideMakerTaker` on CURRENT data AFTER the decayed `refreshedFinalScore` (score-timing) and writes the decision + decayed score in a SINGLE atomic `updateRtbSignal` (no split-brain; `distStop` is invariant on this path → the ranker's `r = chosen_net_ev/distStop` has an atomic numerator + invariant denominator). Both the RTB refresh + the VTS decision canonicalize the strategy key (`normalizeStrategy`) so the urgency family lookup is same-vintage with the orchestrator's gen-time `_canonicalStrategy` (`range_trading`→`range_trade`). **(4) Fee-mode persistence:** `chosen_entry_mode`+`entry_fee_rate` (entry-leg, NULL-not-guessed) carried onto ALL 4 trade stores — `active_open_positions` + `closed_trades` (typed cols, written at `createPaperSim*`), `vts_open_trades` (typed cols, promoted out of the `context` jsonb → single home; rehydrate reads col w/ legacy-context fallback), `vts_trades_*.json` (via `persistRealPriceTrade`→`getClosedVTSTradesFromLogs`). **(5) UI:** ONE shared `client/src/lib/utils.formatEntryFeeMode()` renders a uniform "Entry Fee Mode" column (Maker/Taker + fee %, NULL→em-dash) on 4 surfaces — RTB (`ready-to-buy-table`), paper open/closed (`active-trades-v2`/`trade-history-tab`), VTS open+closed (`machine-learning.tsx`; the VTS per-trade UI surface — NOT `shadow-trades-tab`, which is the selection-quality layer). APIs: `/api/trading-signals` (spread), `/api/paper-sim/active-trades` (whitelist +2), `/api/paper-sim/trades` (raw rows), `/api/vts/ml/open`+`/ml/closed` (explicit map).
> **★ P19-B8.5a UPDATE (2026-07-13 — the switch-on prep; SUPERSEDES the two entries above on gate topology).** (1) **Net-EV admission moved INTO the SQE**: `SQEInput.chosenNetEv` (+`chosenEntryMode`) added; a pure sign-check gate in BOTH evaluate variants; FED at all 3 call sites (gen `signal-orchestrator.ts:772-area`, refresh `ready_to_buy_service.ts:909-area`, batch-refresh `:1163-area`); fail-open-if-absent (the `[11.8B]` taker-leg fallback nets legacy rows). `[11.8B]` = STILL-BLOCKS drift backstop; `EV_REJECT` = the GATES-DRIFTED alarm. (2) **`signalStrength` de-tinted at ALL FOUR `decideMakerTaker` sites** (gen/refresh/crypto-VTS/xstock eval-cycle) → per-class `module_constants scoring_base.flat_pwin_base` (crypto 0.295/xstock 0.317/`*` 0.307; b72-warmup PREFETCH fail-hard; the finalScore tint on `chosen_net_ev` is gone). (3) **finalScore SQE gate RETIRED → shadow-log** (`FINALSCORE_SHADOW`; evidence surface gated on #499 stdout restoration). (4) **confidence→sizing SEVERED** (`active-execution-engine.ts:3120` fallback leg deleted; AMR=shadow verified ⇒ the legacy path was live). (5) **VTS honest-capture fields** (`realDiAtOpen`/`kernelDiInputAtOpen`/`netEvAtOpen`/`predictedPwinAtOpen`) both lanes via record→`vts_open_trades.context` jsonb + the closed-trade JSON store (no schema change; typed promotion = Phase-25's call). DOWNSTREAM WATCH: maker/taker picks shift with the flat strength (intended); MIN_SCORE call-site + maker-pick-rate + the behavioral gate proof are NAMED B8.5 switch-on obligations (§9.1). Code: `signal_quality_evaluator.ts`, `signal-orchestrator.ts`, `ready_to_buy_service.ts`, `vts-runner.ts`, `active-execution-engine.ts`, `xstock_spot/eval-cycle.ts`, `b72-warmup.ts`.

> **★ B-RTB-REFRESH-CONSOLIDATE (2026-07-18/19 — THE TRANSPLANT; deployed + verified, `b514fbc73`). SUPERSEDES the refresh-behavior claims in the B7.2b and B8.5a entries above.** **THE DEFECT (audit `1-system-manual/RTB_REFRESH_AUDIT_2026-07-18.md`): TWO refresh mechanisms ran CONCURRENTLY over ONE queue for ~7 months, double-processing every queued signal into the SQE.** **Mechanism A** — per-signal, Central-Clock-driven (~30s), `refreshSingleSignal` — was the ONLY one re-reading market state, and was **UNDOCUMENTED**. **Mechanism B** — the bucketed service (15s micro / 120s macro / 8 buckets / Adaptive Concurrency Tuner), `refreshAndRank` — had the right scheduling/concurrency engineering and **replayed the FROZEN queue-time snapshot** into the SQE (stored `volatility`, stored `chosen_net_ev`, no geometry re-read, no maker/taker re-decide), and was the one FULLY DOCUMENTED. **★ AND IT WAS SELF-PERPETUATING: Mechanism B wrote NONE of the freshness fields back, so each cycle re-read its own stale values forever.** Load-bearing consequence: NetEV is the BINDING admission gate (#501 fee wall), so a signal whose net expectancy had gone NEGATIVE since queueing was RECONFIRMED on the old number. **WHY TWO AUDITS MISSED IT (governance lesson, now CLAUDE.md §9.5): both traced FORWARD from ONE entry point and read only CURRENT code + CURRENT docs. Path-tracing is satisfied by the FIRST SUFFICIENT EXPLANATION at each hop — reaching the queue it asks "what refreshes a signal?", finds *a* mechanism, and the narrative closes. Nothing prompts "is there a SECOND?". A complete narrative is not an exhaustive inventory.** The census question that surfaces it instantly is **"who DELETES here?"** — both mechanisms delete queued signals. **THE FIX (extract-then-share, NOT a rewrite):** NEW shared private `acquireRefreshedInputs(signal, normalizedSymbol, metadata, confidence, hybridScore, regimeWeight)` on `ready_to_buy_service.ts` returns `{currentVol, currentSpread, netExpectedEdge, geometryRefreshed, decayPenalty, refreshedFinalScore, refreshedMT, refreshedRegimeWeight}`; **BOTH mechanisms now call it** (exactly 2 call sites, pinned by test) so there is ONE acquisition path and no copy-paste drift. **Survivor rewired:** `chosenNetEv: _acq.refreshedMT?.chosenNetEV ?? (stored)` (re-decide FIRST, stored only as fallback), `volatility: _acq.currentVol` (live, not the `metadata ?? 0.3` default), `regimeWeight: _acq.refreshedRegimeWeight`. **Loop broken:** `bulkUpdate` now WRITES BACK `netExpectedEdge`/`volatility`/`spread` + the maker/taker columns, with `lastCostRefresh: _acq.geometryRefreshed ? Date.now() : (metadata.lastCostRefresh ?? 0)` — conditional, so advancing it cannot defeat `shouldRecalculateGeometry`'s age branch. **Score-timing invariant PRESERVED (Langston B7.2b gate): geometry → decayed score → `decideMakerTaker`, pinned by ordinal test.** **HONESTY PIN — the regimeWeight recompute is NOT a repair:** `calculateRegimeWeight = trendScore×0.70 + (1−min(1,vol))×0.30`, and `trendStrength` is hardcoded 0.5 with no honest source, so **70% of the output is INERT to the fabricated axis and the entire live range is 0.35–0.65**; three tests assert `trendSwing`(0.70) > `volSwing`(0.30) so nobody can later describe this gate as "fed honest data". **Telemetry:** `active-funnel-tracker.ts` gains a `droppedError` bucket + `rtbRefreshPassResidual()` pinning the pass identity `refreshedAttempted === reconfirmed + rejectedInRefresh + droppedError` (narrowed after a Langston BLOCK: the first cut conflated QUEUE-LIFECYCLE exits with REFRESH-PASS outcomes — two buckets were REMOVED rather than wired; `promoted` does NOT enter the identity). **⚠️ MECHANISM A IS STILL LIVE — its retirement is staging STEP 2 and the gate is NOT cleared:** it requires observing BOTH `chosen_net_ev` AND `regime_weight` actually moving on the survivor's path in staging. Until then BOTH mechanisms run, now over one shared acquisition. **Deploy proof:** post-deploy logs read "NetEV-only **batch-refresh** failure" — the batch (survivor) path is now producing real re-decided netEV rejections, which it structurally could not before. **Provenance (CLAUDE.md §9.5(b) — read, and it REVERSED CC-A's first disposition):** `bridge/canonical/` documents only ONE of the two mechanisms; both were built Dec-2025 in one Replit session; R9.3-A ordered a REPLACEMENT and a new service violated §7 two days later — i.e. the duplication is an unfinished migration, not a designed redundancy. Tests: `server/tests/unit/b-rtb-refresh-consolidate.test.ts` (14) + `p19-b8-4-active-funnel-tracker.test.ts` (15).
>
> **★ B-REGIME-REFRESH-PIPE (2026-07-21 — deployed + LIVE-VERIFIED both classes, `86d39e00d`+`c4010f538`+`eaf0d98cf`; follows B-REGIME-INPUTS-LIVE `6d22a9b63`). SUPERSEDES the "HONESTY PIN — the regimeWeight recompute is NOT a repair" claim in the B-RTB-REFRESH-CONSOLIDATE entry above — the refresh's regime input is now HONEST, computed from live price-math.** **THE DEFECT:** the refresh read the MCE's per-pair regime via `readRegimeInputs → getCachedContext`, a PASSIVE read of the survivor-populated 60s-TTL cache. But the MCE computes context ONLY for FX5-scanner + xStock SURVIVORS, and the scanner DELIBERATELY EXCLUDES queued/traded pairs from the survivor set (`market-scanner.ts:773` — avoids re-signaling a pair already in the pool/open). So the moment a pair is queued or traded it cycles OUT of the survivor set → the MCE stops computing it → its cache goes cold → the refresh's passive read misses → reject. **Live: 54 of 55 queued pairs missed → rejected.** The two purposes conflict on one engine: the survivor path WANTS to exclude queued pairs; the refresh NEEDS fresh regime for exactly those queued pairs. **Provenance (git + `bridge/canonical/`):** the refresh (2025-12-14) predated the MCE (2026-03-03); the MCE's own commit wired only the orchestrator + VTS, never the refresh; the refresh's regime inputs were unfinished placeholder constants (0.015 vol / 0.5 trend) whose data-filler `updateVolatilityData` (written 2026-01-08) had ZERO callers ever — **the regime gate could NEVER reject in its ~6-month history.** **THE FIX (Langston-ruled A1 — a NEW PURE METHOD, not a warm-via-`computeContext`):** `MarketContextEngine.computeRegimeInputsOnly(symbol, ohlcData, propagatedDbs, assetClass): {volatility, adx} | null` reuses the MCE's OWN per-pair config assembly (private `regimeLookbacksByClass` merge + `getMacroConfigForClass`) and calls the PURE `calculatePairRegime` (`market-regime.ts:231`) directly, returning only `{volatility, adx}`. It carries **ZERO of `computeContext`'s FIVE side-effects** — `regimePhaseStore.tick`, `this.cache.set` (split-brain vs the 60s MCE cycle that owns the cache), `directionalBiasStore.updatePair` (persistent DBS-store corruption), `emitMceTelemetry`, `archivePairScan` (~155k rows/day). Warming via `computeContext` + a `skipArchive` flag was REJECTED (§8 #11 — a 3+-flag patch on a hot core fn). **`server/core/metrics/regime-inputs.ts` gains `computeRefreshRegimeInputs(symbol, assetClass, dbsScoreAtQueue)`** — dispatches OHLC by class (xStock → `xstockOhlcCache`, crypto → `ohlcCache`), carries the queue-time DBS, calls the pure method, builds `RegimeInputsResult`. **`readRegimeInputs` (the B-REGIME-INPUTS-LIVE cache-router) is UNTOUCHED.** **`ready_to_buy_service.ts` `acquireRefreshedInputs` made async;** the cold `getCachedContext` read replaced with `await computeRefreshRegimeInputs(...)`; both call sites awaited. **DBS-carry is regimeWeight-SAFE (verified at code):** `regimeWeight = trendStrength(=adx/50)×0.70 + (1−min(1,vol))×0.30` — both price-math from `{volatility, adx}`; DBS only satisfies the B63 run-contract (`mce:1179` THROWS for crypto without DBS) + sets the regime LABEL/routing — it is NOT a `regimeWeight` input (confirmed SIM line ~500 "RegimeWeight signal-level vol only"), so a stale-by-minutes DBS cannot move the gated number. **#546-CLEAN:** sparse bars → `null` → reject (never scores on `computeATR`'s degraded 0). **Sparse-bars floor is `adxPeriod + 1`** (NOT `max(atr,adx,momentum)` — momentum/ATR aren't in the `{vol,adx}` output set; the over-strict floor silently rejected every xStock until hotfix `c4010f538`). **LIVE PROOF (warm window):** refresh rejections **58→0**, **0 COMPUTE_MISS**, **33 distinct regimeWeight values**, xStock computing fresh (OKTA 0.49/ADBE 0.65/DDOG 0.47/PYPL 0.46). **#441 (xStock stale 60m snapshot) was falsified as a blocker here** — xStock rides the fresh 1m-overlay aggregation (≥57 hourly bars once warm); the 60m snapshot stall remains a real SEPARATE defect homed to B-XSTOCK-FRESHNESS-MONITOR. **CENSUS (§9.5):** the refresh now has its OWN regime-compute entry (the pure method), independent of the survivor cache — it does NOT re-enter the scanner/pool, so no pool-drain. Tests: `server/tests/unit/b-rtb-refresh-consolidate.test.ts` (async-signature pins updated).
>
> **★ P19-B7.2c POST-PROMOTION PENDING-MAKER STATE + VTS TWINS (2026-07-02 — a NEW cross-cutting position lifecycle STATE, not a new singleton; dormant on paper until paper-active, LIVE immediately on VTS).** The Kyle-simplified model: a maker-chosen promotion opens as **`state='pending'`** — a resting order that HOLDS A SLOT but has NO fill; it fills ONLY on honest side-aware trade-through of the real price, or is DROPPED at the `maker_max_pending_ms` hard deadline (~1h; no convert re-evaluation). **The state lives in the DB rows, not a new in-memory global:** `active_open_positions.state` (+ `maker_limit_price`/`maker_deadline`) and `vts_open_trades.state='pending'` (CHECK amended; maker cols; VTS pendings survive restart via rehydrate). **BOTH position-monitor loops now branch on it:** paper `checkOpenPositions` runs the `_processPendingMaker` pre-pass then `continue`s (a pending NEVER enters TEC exit evaluation); the VTS resolve loop runs the same pre-pass. Decision logic is the SHARED PURE `server/core/trading/pending-maker-logic.ts` (both engines import it — parity by construction; FILL WINS over deadline same-tick; a ≤0/absent price can never fill; xStock drops wait for the first open tick). **VTS TWINS mutate an EXISTING registry item's semantics — S-note on `openVirtualTrades`:** when twinning is on (`maker_taker.twin_enabled`), the not-chosen entry mode is opened as a TAGGED twin (`mtTwin=true`/`mtPairId`, carried in `context` jsonb + restored by the rehydrate context-spread). Every capacity/learning consumer of `openVirtualTrades` MUST use the typed predicate `mtTwin !== true`: the slot cap counts NON-twins only, the per-underlying gate skips twins, the close cascade SHORT-CIRCUITS twins to a JSON-only record (`countsInAggregates=false`, `fillRateCaveat='trade_through_floor'`) — twins NEVER reach closedTrades/metrics/ML. **Paper never-filled typed guard:** `storage.getPaperSimTrades`/`Global`/`BySymbol` EXCLUDE `closeReason='never_filled'` at the SQL level BY DEFAULT (`includeNeverFilled` opt-in; the paginated UI list passes them explicitly) — visible ≠ counted enforced at the storage chokepoint, not per-reader. New `maker_taker` knobs: `maker_max_pending_ms` (hard drop), `maker_late_fill_haircut_pct` (INERT, arity-pinned), `twin_enabled` (kill-knob); `maker_time_budget_ms` RE-PURPOSED to soft telemetry boundary only (see ADJUSTMENT_FRAMEWORK).
>
> **★ P19-B8.5f (2026-07-22, landing commit `58d8f8f94`) — THE SIZED-SIGNAL METADATA TRANSIT CONTRACT IS NOW TYPE-ENFORCED (#549 + #550, one root).** `signal-orchestrator.ts` (`buildSizedSignalForStrategy`) builds the sized signal's `metadata` as a **FRESH object from an explicit whitelist** — `..._displayContext` is the ONLY spread and **`rawSignal.metadata` is never spread**. That is a **deliberate** whitelist, not an oversight: `sourcePool` and `signalType` are hand-re-picked out of `rawSignal.metadata` in the same construction, and `assetClass` is resolver-only behind the B4a `STAMP_MISSING` throw (the B6.5d carry-the-stamp invariant, this file's §76). **Consequence documented here because it is CROSS-CUTTING and cost seven months of a dormant exit:** anything a strategy builder or a central stamp puts on the RAW signal dies at that boundary unless the whitelist names it. `maxHoldingMs` (stamped centrally) and `atr` both died there; `regime` survived because it rides `_displayContext`. **⇒ TWO transit paths through one block — an asymmetry that reads as flaky data quality and is not.** **CHANGE:** `SQESignalInput.metadata` is no longer `Record<string, unknown>` (which accepts ANY object, making an omission legal and silent) — it is now **`SQESignalMetadata`, which REQUIRES `maxHoldingMs`**, so dropping an enforcement-critical key is a **COMPILE error**. A runtime `MAXHOLD_STAMP_MISSING` throw backstops the `as any`/JSON boundary only, mirroring the B4a pattern. **Scope of the required set is deliberately NARROW:** `atr` is NOT required (B6.5b's floor governs its absence; requiring it would silently re-activate trailing that has never run — #556, a Kyle decision) and the genesis display fields stay absent-is-absent (no fabrication). **Downstream is unchanged and needs no plumbing:** `active-execution-engine.ts` spreads `...signal.metadata` onto the position row at open, so a whitelisted key reaches `active_open_positions.metadata` unmodified. **Also landed:** the `max_holding_period` close reason maps to `MAX_HOLD` instead of `'UNKNOWN'` (SysManual RISK-035, which was rated LOW only because the exit had never fired). **⚠️ MAINTENANCE RULE for anyone editing that literal:** adding a field there is additive and safe; REMOVING one silently breaks whatever downstream logic is gated on its presence — and at least four instances of that exact failure are on record (#530, #549, #550, and the RTB `insertData` omission).

> **★ P19-B8.12 (2026-07-19, landing commit `d090178d6`) — CROSS-CUTTING CARRY:** the scanner's per-pair `poolType` (`ideal|rotational`, stamped for EVERY pair at `collectAdaptiveBatch`, `market-scanner.ts:502/:604`) now PROPAGATES THE ACTIVE PATH. It was previously dropped at `activeFilterPool.addSurvivors`' narrow input type (the 3rd transit-drop instance after DBS #530 and patternType B8.10). Chain: scanner stamp → `{...s}` spreads through classifiedSurvivors/familyQualifiedUnion → `addSurvivors` (both intakes accept `poolType`) → `ActiveFilteredPair.pool` → `getFX5DataForSymbol` (return type widened) → signal-orchestrator genesis `_displayContext.pool` → queue metadata → trade-table adapter. **Consumers:** both shared trade tables (Pool (I/R) column, unconditional again — B8.11's `hidePoolColumn` prop DELETED per rule 18). **Verified** by a pre/post-deploy split (pre-deploy rows carry no pool; all post-deploy rows carry it).

> **★ P19-B8.11 (2026-07-19, `a561ce5eb`) — display surfaces:** `computeCalendarEarnings` RENAMED `computeRollingEarnings` (`dashboard-metrics.ts`; rolling 24h/7d/30d, fields `last24h/last7d/last30d`; 3 routes call sites; sole consumer = mode-dashboard-tab); both shared trade tables gained `hidePoolColumn` (default OFF — VTS unchanged; paper mounts pass it, hiding the VTS-only Pool (I/R) axis).

> **★ P19-B8.10 (2026-07-18, `8b13fe0b8`) — TRADE-TABLE TRUTHFULNESS: genesis capture + Rank honesty + the Phase-8 metrics purge.** FIVE registry-relevant changes: **(1) SLAL DELETED (§15):** `server/core/audit/signal_lifecycle_audit.ts` + the `GET/POST /api/diagnostics/signal-lifecycle*` endpoints + ~15 write-only `record*` call sites (signal-orchestrator ×4, RTB service ×2, active-execution-engine ×2, trade-safety ×2 + `mapCodeToSLALReason`) — sole reader was the ALSO-DELETED Ready-tab `ExecutionMetricsPanel` (`execution-metrics.tsx`, unmounted from both mode pages). **LOAD-BEARING RELOCATION: the active-path signal-ID mint `generateSignalId` now lives at `server/utils/signal-id.ts`** (verbatim format, pinned by `signal-id-format.test.ts`) — anything tracing signalId provenance starts THERE. `/api/diagnostics/rtb-metrics` + rtb-metrics-service KEPT. **(2) Genesis display-context capture:** `SizingContext` gained `regime`/`pairDbsCategory`/`pairDbsScore` carriers (the reorg-B2 `atr` single-point-feed pattern; crypto quant stamps at the MCE site, the pattern pass RE-stamps per pattern, xStock threads via `XstockActiveDispatchInput.regime/pairDbs*`); `buildSizedSignalForStrategy` builds a fail-open `_displayContext` stamp (regime/globalRegime/pairFriction/globalFriction/pair+global DBS/patternType/entryLiquidity) into the queue metadata from the SAME helpers the VTS capture reads; `computePairFrictionIndex` EXTRACTED to `core/math/cost-model.ts` (vts-runner refactored onto it — one formula, two callers). KEEP-AS-DATA: no decision-path consumer; absent-stays-absent; no backfill. **(3) Rank honesty:** the engine promote loop stamps `rankAtPromote` (via `getDisplayRankKey`, the ranker's own display key) onto the in-memory signal metadata pre-execution → rides the `:2249` spread into `active_open_positions.metadata`; the queue-enrich `?? finalScore` fallback REMOVED (#525 fence — shadow-pool rankingScore columns now honestly null); the DEAD legacy ranker pair `getTopSignal`+`checkForPromotion` §15-DELETED (June-2026 park DISCHARGED: getRankedSignals won). **(4) Shared-table props:** open table gained `afterSymbolHeaders`/`renderAfterSymbolCells` (paper Slot at position 2) + `rankHeaderLabel/Title` (paper = "Promote R", VTS default "Rank" — distinct labels for distinct quantities); closed table LOST the Regime Wt column (Kyle; affects the VTS closed tab too — flagged; the 0.5-constant finding is a #529 rider); the `globalDirectionalBias || "pending"` placeholder replaced with the em-dash convention in BOTH tables. **(5) RTB freeze panes:** sticky thead + frozen Rank(w-14)/Symbol(left-14) columns (B-NEW-31 recipe); container overflow-auto + max-h. Adapter re-keys: Rank cell ← `rankAtPromote`; Edge ← `netExpectedEdge ?? netEvAtAdmit` (deliberately NOT the VTS retired-finalScore Edge formula); glbl-context cells ← the genesis-capture keys. Verified live post-deploy: first post-deploy queued signal carried regime/patternType/frictions/DBS/liquidity (Supabase read 19:57Z).

> **★ P19-B8.7 Step-9 (2026-07-17, `a8dc548de`) — SHARED trade tables + the pattern-pool DBS carry that REVIVED a dead signal lane (#530).** FOUR registry-relevant changes: **(1) UI re-key:** the paper Open/Closed tabs now MOUNT the shared VTS tables — `vts-open-trades-table.tsx`/`vts-closed-trades-table.tsx` (gained optional `extraHeaders`/`renderExtraCells`/`emptyLabel` props, default OFF = VTS mounts unchanged) fed by the NEW pure `client/src/lib/paper-trade-adapter.ts` (paper row → VTS wire shape; 13-test suite pins format parity + no-fabrication + the #525 retired-metric fence); NEW `paper-open-trades-tab.tsx` = the paper shell (IntegrityBanner/mutations/WS-refresh preserved; the hardcoded 0.10%/0.15% client P/L recompute DELETED — server-authoritative + 3s-throttled invalidation); `active-trades-v2.tsx` **§15-DELETED** (DELETED_COMPONENTS_LOG 2026-07-17). Both tables consume the SERVER `priceVenueQuiet` boolean (B8.9 single predicate). **(2) Cost 5-col:** friction COMPONENTS (`costFee/Slippage/SpreadFraction`) captured at VTS open (both crypto build sites + xstock eval-cycle passthrough → `vts_open_trades.context` jsonb, no migration) + derived split in the open serializer (`buildOpenTradeRow`) and closed serializer (`getClosedVTSTradesFromLogs`); spread allocated HALF per slip leg (sums exactly to `costs`); pre-capture rows em-dash, NO backfill ever (Langston-ratified). **RULE-23 BEHAVIORAL NOTE (Langston flag):** the xstock eval-cycle's leaked crypto `const spread = 0.001` was DELETED for `costMetrics.spread` (measured-with-fallback; xStock static default 0.0012) — xStock VTS-lane friction RISES ≥2bps → expectedEdge/Net-EV admission shifts (telemetry-only, no money path). **(3) THE PATTERN-POOL CARRY (#530):** `addPatternPoolSurvivors` + its fx5-scanner caller now carry the scanner-computed B63 `dbsScore/dbsCategory/dbsSlope/DI` onto pattern-pool entries (parity with `addSurvivors`) — which un-suppressed the ACTIVE pattern-pool signal loop: the orchestrator (`:1742`) feeds the MCE's B63 hard contract FROM the pool entry, so entries without DBS made every pattern-pool evaluation throw-and-be-swallowed (592 catches on 07-17 alone; ZERO post-deploy). Candidate FLOW change only — all admission gates unchanged. VTS lanes verified CLEAN (pair-object DBS, zero contract throws). **(4) RTB table:** header/cell alignment fix, S.Wgt column removed (#529 owns the L9/L10 kill-or-keep, its own batch BEFORE the #522 audit), Duration (queue-age) column added.
>
> **★ P19-B7.2d (2026-07-03) — the xStock VTS lane joined the SAME lifecycle, and crypto's twin open now routes through the SHARED `maybeOpenTwin` (a NARROW touch on crypto's hot path under a Langston lock-lift).** Two registry-relevant changes: (1) the xstock eval-cycle (`asset_classes/xstock_spot/eval-cycle.ts`) now runs `decideMakerTaker` at its open seam and passes `chosenEntryMode`/`entryFeeRate`/`state='pending'`/maker cols through a WIDENED `RegisterOpenVtsTradeInput` — xStock pendings/twins land in the SAME `openVirtualTrades` Map + `vts_open_trades` rows, covered by the SAME resolve pre-pass/rehydrate/typed-predicate discipline above (tag-based, class-agnostic — verified at the B7.2d Step-7 grep). (2) crypto's inline twin block inside `generatePhase10Signal` was EXTRACTED into the exported `maybeOpenTwin` (vts-runner, below `registerOpenVtsTrade`; decision half = pure `planTwin` in `pending-maker-logic.ts`, both-branches regression-pinned) — the B79.0m.b "vts-runner untouched on crypto's hot path" lock was LIFTED for this twin sub-block ONLY (crypto's primary open stays inline; the general retrofit through `registerOpenVtsTrade` remains B79.0n+ future work). Twins are NEVER routed through `registerOpenVtsTrade` (derived `${id}_twin` + direct insert — its dup-guard + default-resolution semantics are for chosen legs). The B-NEW-36 weekend suspend/restore predicates (`state='open'` / `state='weekend_suspended'`) are now documented LOAD-BEARING: they exclude `state='pending'` by construction — widening either would convert unfilled resting orders into open positions (guard comments in `vts-trade-persistence.ts`).
>
> **★ P19-B-RENAME W3 residue (2026-07-03) — the active-engine LIVENESS SINGLETONS renamed (symbols only, lifecycle/keying unchanged):** the cross-run mutex/flag family guarding engine reset — `globalActiveEngineBusyFlag` (was globalPaperSimBusyFlag), `globalActiveEngineOperationLock` (was globalPaperSimOperationLock), `isResettingActiveEngine`/`isActiveEngineRunning` (were *PaperSim forms) — and the reset call chain: `hardResetActiveEngine` (service orchestrator, active-session-reset.ts) CALLS `storage.hardResetActiveEngineTables` (was storage.hardResetPaperSim — the DB-layer method; ONE chain across two layers, NOT a merged reset path — Langston-verified at the W3 plan review). Wave-1 already removed the `paperValidationEngine` singleton (M5 harness deleted) and the mode-registry `PaperExecutionServiceLegacy` runtime guard; this note records both removals in the registry.

> **★ P19-B8.2 BALANCE-POLICY STATE (2026-07-05, deployed `71c9d81bd`) — the anchor-version ledger, the Kraken-mirror start, and the friction-divergence auto re-anchor.** The paper/live balance is now governed by ANCHOR EVENTS: `portfolio_state.anchor_version` (int, monotonic per mode) + the append-only `portfolio_anchor_events` ledger (reason ∈ start_new | auto_divergence | launch_snap; unique (mode, anchor_version)). The ONLY writers are `portfolio-anchor-service.executeReanchor` (transactional: ledger row + balance + version together) and its `reanchorToLive` wrapper (fetches the mirror; used by the start-new flow, the auto-divergence trigger, and Phase-21's launch snap — the hook is BUILT and was synthetically proven on the live-mode row 2026-07-05: v0→1, learning counts byte-identical). **The mirror figure** (`kraken-mirror-balance.getKrakenMirrorBalance`, module-scoped KrakenService instance per S3 discipline): free USD + the USD-pegged stablecoins the universe admits as quotes (USDT/USDC — allowedQuotes parity; REVISED from ZUSD-only at Step-7 when the live account proved to be 100% USDC — RUNNING_ISSUES #435); THROWS on any failure — the start flow refuses, `mode='continue'` never calls Kraken. **Ghost defaults are GONE:** `portfolio_state.balance` + `active_engine_sessions.starting_balance` have NO defaults (NOT NULL; inserts are compile-required to supply them) and BOTH resume seams refuse loudly on absent/NULL/unparseable balance (`resumeActiveEngines` validation + `ActivePortfolioManager.getStartingCapitalOrThrow` — which also killed the hardcoded $10k exposure/drawdown denominators). **The at-open ratio stamp** (`balance_ratio_at_open` + `anchor_balance_at_open` + `anchor_version_at_open` on active_open_positions → carried to closed_trades; VTS = NULL-by-absence, no columns): computed once at the active-execution-engine open seam from `getRatioStampInputs`; honest NULLs pre-B8.2/no-anchor. **The divergence evaluator** (`friction-divergence-evaluator.evaluateDivergenceAtOpen`, fire-and-forget at the open seam, B3b never-throws) feeds the pure `core/math/friction-divergence` estimator; knobs = `module_constants friction_divergence` (b72-warmed, per-class). DORMANT until paper-active opens trades (B8.4); C6 soak item: watch `getDivergenceStats()` evalSkips/evalErrors + the per-60s Kraken private-call cadence at switch-on.
> **★ P19-B8.6 + the B8.5 structural-cut engine state (2026-07-15, deployed `06560c299`) — maker TARGET-exit rest lifecycle; venue-only actionable pricing; single-writer balance; measurement-override anchor.** `active-execution-engine.checkOpenPositions` (paper): exit-rest seam — place at target-touch (fields `exit_limit_price`/`exit_rest_placed_at`/`exit_deadline` on `active_open_positions`; knob `maker_taker.exit_maker_max_pending_ms`), evaluate live rests FIRST via the shared `pending-maker-logic` (sell side); `closePosition` gains `options.makerExitFill` (fill=limit, per-class maker fee, slippage 0) + `options.exitRest` (the EXPLICIT stamp payload — stamps `exit_fee_mode`/`exit_rest_outcome`/`exit_rested_at_price`/`exit_rest_duration_ms` on `closed_trades` never reconstructed from the re-fetched row). Stop precedence structural (tec-evaluator floor order + TARGET-only placement guard). VTS parity deferred → #513. ALSO in this deploy (the B8.5 engine leg, previously verified-at-source but uncommitted — caught at B8.6 Step-4): the exit monitor's actionable price chain is kraken_ws → direct kraken_rest → skip-this-tick (`_recordPriceSkip` streak map → §10.5 alert at `exit_integrity.max_consecutive_price_skips`=40); the C prong-2 fallback sanity gate + arbiter DELETED (knob rows removed in the shipped venue-only migration; b72 still warms the `exit_integrity` MODULE for the two live knobs); ANCHOR_ASSERT (read-and-verify session-vs-ledger, never writes portfolio_state) replaced the REB 2.8.11 write in the engine leg. Balance writers: `portfolio-anchor-service.executeReanchor` is the SOLE `portfolio_state.balance` writer (AnchorReason += `measurement_override`, paper-only + note≥20ch rails; ledger `note` column); the $2,400 measurement sizing (guardrails paper max_position 20% / risk 1.95% after the measured tune-2) pins ~$150/position.

> **★ P19-B8.7 admissions safe-degrade + display re-key (2026-07-16, deployed `bf9a67a2b`).** CROSS-CUTTING DEGRADE BEHAVIOR: `buildSettingsFromGuardrails.maxOpenTrades` no longer carries a fallback (`||5` deleted — raw Number, NaN when the DB field is absent/unparseable); BOTH engine promotion sites (`active-execution-engine.ts` promotion-interval + `checkRtbPromotion`) guard with `Number()` + `!isFinite||<=0` → `[P19-B8.7][GUARDRAIL_READ_FAIL]` error + RETURN — **admissions/promotion halt for that tick only, the loop stays alive and retries next tick; never a throw, never a fabricated concurrency cap.** Display slots re-keyed at both API sites (active-trades row + the TopBar summary) to the SAME `guardrails_v2.max_open_positions` the engine enforces (NaN → client em-dash; `count > NaN` false → no false OVER LIMIT). `maxExposurePercent` hardcode '50.00' → the DB `maxTotalExposurePct` (reporting consumers). `dynamic-slots.ts` DELETED (rule 18, zero consumers; m5e private copy noted #515). Sizing-side fallback cluster ('25.00'/'30.00'/'10.00'/lpcp 25.00) deliberately NOT touched → #516 = named batch P19-B8.8 (fail-loud design for sizers differs — a sizer cannot skip-a-tick). Trade tables: paper open +8 / closed +5 VTS-mirror columns; capture gaps #515; live-mode tables = guarded stubs, #517 (Phase-21).

> **★ B-STAGING-LIVENESS-WATCH boot-lifecycle + watchdog components (2026-07-16, deployed `2d163cf08`).** BOOT SESSION DISPOSITION now has ONE owner: `resumeActiveEngines` (index.ts :437) — the `initializeQueues` DB session sweep is DELETED (rule 18, DELETED_COMPONENTS_LOG; it orphan-closed every `running` session BEFORE resume ran, silently halting the engine on every restart — #520). Resume RE-ATTACHES the same session row; a REFUSED session (B8.2 untrustworthy-balance gate) is now marked `stopped` (+runForMs) so it never re-refuses; flag-true-but-no-session → dedupe-keyed breakage alert (post-fix unreachable). NEW COMPONENTS: `server/scripts/staging-liveness-watchdog.mjs` (plain-node out-of-process watchdog, systemd 5-min timer as deploy; http/pm2/engine checks, 2-tick debounce, CLI-w/`--dedupe-key` primary + CI-shape-pinned direct-append fallback, OnFailure self-fail, weekly heartbeat) + public `GET /api/health/liveness` (routes/health.ts — engineExpected/engineRunning booleans) + the Helsinki-side `helsinki-staging-probe.sh` (host-down leg → Discord phone-notify; the on-box alert file dies with the box by construction). Unit files in `server/scripts/systemd/`. **[11.8B] shadow conversion rides the same evening (#523, Kyle override):** the netEV open-backstop observes-never-blocks in PAPER (EV_REJECT_SHADOW + first-fire alert); LIVE keeps the block pending Kyle's #522 pre-live ratification; NULL-snapshot → EV_SNAPSHOT_MISSING integrity refusal; routing fenced by the pure `ev-block-disposition.ts`.


| ID | Singleton / state · file:line | Holds | Keying today | Verdict | Readers / writers (verified) |
|---|---|---|---|---|---|
| **S1** | `global.globalPaperPortfolioManager` · `active-engine-service.ts:247` (decl), getter `:256`, setter `:260` | the single active `PaperPortfolioManager` (owns orchestrator, watchlist refresh, and the **per-instance** heat ceilings `MAX_OPEN_POSITIONS=10` / `MAX_PORTFOLIO_EXPOSURE_PERCENT=80` / `MAX_DRAWDOWN_PERCENT=20`, `active-portfolio-manager.ts:57-59`) | **single global slot; creation hardcodes `mode='paper'` (`:444,558`)** | 🔴 **SPLIT-BRAIN (worst)** | W: `setGlobalPaperSimManager:260`, `intent-executor.ts:211`, `active-engine-service.ts:512/602/1163`. R: `trade-safety.ts:664`, `active-session-reset.ts:161`, `active-engine-heartbeat.ts:66`, `state-awareness.ts:307`, `routes.ts:12610/12648/12666/11667`. Isolation → `Map<'paper'\|'live',Manager>`. |
| **S1-lock** | `globalPaperSimOperationLock` + `globalPaperSimBusyFlag` · `active-engine-service.ts:44-61` | concurrency guards serializing paper-sim start/stop/reset | single global (not mode-keyed) | 🟠 **S1 cluster** | W: `routes.ts:11198/11202/11235`, `active-session-reset.ts:296-297`. Belong to S1; if live shares this service path they'd serialize/collide across modes. Isolate with S1. |
| **S3** | `KrakenService.rateLimitStates` · `kraken.ts:75` | per-`userId` REST lockout (120s `Temporary lockout`) | **instance field** (per-`new KrakenService()`); key defaults to literal `'default'` (`:197`) | 🟠 **FRAGMENTED → O-2** | **36 `new KrakenService()` across 30 files.** Risk is the INVERSE of split-brain: ~36 independent cooldown trackers vs ONE account-level Kraken budget, no coordination. Isolation → one shared `${userId}:${mode}` limiter (P19-B4b D5 builds it; migrates ~12 active-pipeline sites, rest → #296). |
| **S4** | `riskConcentrationAnalyzer` · `risk-concentration.ts:377` (singleton); maps `:57-58` | symbol-keyed `positionWeights` + `concentrationScores` (pre-trade concentration guard) | **symbol-keyed module singleton** | 🔴 **SPLIT-BRAIN** | W: `trade-safety.ts:804` (`updatePositionWeights` — weights built from mode-scoped `getActivePositions(mode):797` but written into the mode-agnostic global → modes **clobber each other**). R: `active-position-sizing.ts:194`, `active-execution-engine.ts:405`. Isolation → `Map<mode,Map<symbol,…>>`. |
| **S6** | RTB `signalRefreshStates` · `ready_to_buy_service.ts:360` | per-signal refresh latch | keyed by `signalId` | 🟡 **SAFE (statistical, not structural)** | `signalId` = `` `${symbol}-${strategy}-${Date.now()}-${rand6}` `` (`server/utils/signal-id.ts` — relocated P19-B8.10, was signal_lifecycle_audit.ts:108) — **does NOT include mode**; collision astronomically unlikely but not structurally namespaced. The OTHER 4 RTB maps ARE `Map<mode,…>` (`:357/358/361/362`). **D5: mode-prefix the key to make it structural.** |
| **S8** | `currentPoolSize` · `tcl_watchdog.ts:31` + `ready_to_buy_service.ts:60` | Active-Filtered-Pool size (CPU-load concurrency knob) | module-global scalar (bus not mode-tagged) | 🟢 **SHARED-BENIGN** | In tcl_watchdog the global is **shadowed by a per-mode local** (`:211/230`) for actual TCL decisions; it's a system-wide load knob, not per-mode trade state. Low correctness risk; optional `Map<mode,number>`. |
| **S2** | `covarianceEngine.returnHistory` · `covariance-engine.ts:40` | rolling per-symbol return history | symbol-keyed | 🟢 **PER-MODE-SAFE** | Fed **market-price-derived returns** (`updateFromPrices:74` → `calculateReturns`) → mode-invariant. **Do NOT key by mode** — would be forbidden 2× compute (anti-backpressure rule §8 #11). Mode-specific use is the portfolio-weighted query in S4. |
| **S5/S14** | `restRateLimiter`, `UnifiedPriceCache` | market-data throttle + price cache | symbol/endpoint | 🟢 **PER-MODE-SAFE** | Feed, not trade-state; both modes mark off identical prices. Intentionally shared. |
| **S7/S9/S10/S11/S12** | `tclWatchdog.states`, `activeFilterPool`, `ModeRegistry`, `globalLive/PaperEngine`, `MicroExecutionService.symbolCooldowns` | TCL state / active pools / engine + micro registries / micro cooldown | **mode (or per-mode instance)** | 🟢 **PER-MODE-SAFE** | Already correctly separated — reference patterns for the right design. (`tcl_watchdog.ts:53`, `active-filter-pool.ts:59`, `mode-registry.ts:36`, `routes.ts:102-103`, `micro-execution-service.ts:47`.) |
| **S15** | `xstock-qd-probe-cron.ts` `_cronTask` + double-register guard · `:27` | the node-cron handle for the always-on Q-D friction probe (`xstock_qd_probe_cron`, every ~5 min) | single module-global (not mode-keyed) | 🟢 **MODE-INVARIANT (telemetry)** | P19-B5c (#86). Telemetry-only, NO trade state: reads shared `xstock_spot_ticker_snap` + `XSTOCK_SPOT_SYMBOLS`, writes the NEW `xstock_qd_probe_history` (CAPTURE-ONLY; consumption → B81/Phase-25). Registered in the B-NEW-49 `cronRegistry` (smoke-test + fire-evidence verifier cover it); fire-evidence → `scheduled_tasks_audit`. Retention via the B75 plain-table age-delete pass. Like S2/S5/S8 — intentionally shared, NOT split-brain; do NOT mode-key. Component detail: see the `qd-probe-service.ts` entry below + the §"★ P19-B5c" callout above. |
| **S17** | `_discoveredQuotes` slot · `shared/asset-classes.ts` (setter `setDiscoveredQuotes`, reader `getRecognitionQuotes`) | the recognition quote-currency SET (feeds the canonicalizer compact-split + the raw-form regexes + the unknown-quote name) | single module-global (not mode-keyed) | 🟢 **MODE-INVARIANT (vocabulary)** | P19-B6.5f (reorg-B1). W: `kraken-asset-pairs-service.refresh()` at the TAIL of EVERY refresh (self-healing) via `setDiscoveredQuotes`. R: `getRecognitionQuotes()` (canonicalizer Pattern-2, the `_quoteAlternation` raw-regex rebuild, the `safeResolveAssetClass` unknown-quote name). Null → complete curated `KNOWN_QUOTE_CURRENCIES` fallback. Like S2/S5/S15/S16 — intentionally shared, NOT split-brain; do NOT mode-key. Recognition≠eligibility (universe-loader `allowedQuotes` is the trade-gate). |
| **S16** | `rtb-metrics-service.ts` `RtbMetricsService` (singleton getInstance) | the in-memory RTB I3 accounting: `attemptsTotal / openedTotal / blockedTotal / blockedByReason` + **P19-B6.5e NEW `openFailedTotal` / `openFailedByStage`** + the I5 `blockEventBuffer` | single global counter (not mode-keyed) | 🟢 **MODE-INVARIANT (telemetry)** | P19-B6.5e (#325). Telemetry-only, NOT trade state — like S2/S5/S8/S15. **The I3 invariant is now `attemptsTotal === openedTotal + blockedTotal + openFailedTotal`** (post-guardrail open-stage failures recorded via `recordOpenFailed(symbol,strategy,stage,reason)` — was previously a silent bare-`return`, the #325 root cause). `recordDepthGateBlock` (`depth-source._gateBlocks`) remains the fine-grained per-class counter underneath. **HOME (Phase-21):** single global comingles paper+live I3 counters at co-run — telemetry-only, not split-brain, but mode-key it (like S7/S9) before the Phase-21 paper+live co-run. |
| **S18** | xStock weekend pause state: `xstockSpotScanner.isPaused` · `xstock_spot/scanner.ts:163` (iface field `:106`) + the lifecycle re-entrancy mutex `session-lifecycle-controller.ts:173` `inFlight` | the SSOT weekend-shutdown **pause flag** that gates BOTH the VTS scan loop AND active-dispatch, plus the poll-reconcile concurrency mutex | single module-global / instance field (NOT mode-keyed) | 🟢 **MODE-INVARIANT (control, not trade state)** | Surfaced 2026-06-25 (CC-A, during the #349 weekend-staleness confirm — was documented in the weekend-controller section below but never in THIS registry). `scanner.isPaused` is the canonical pause SSOT: when set, the scanner no-ops every tick → both VTS and active xStock dispatch stop. Reconciled by boot + the 30s poll (B-NEW-52; the node-cron was retired). W: `runWeekendShutdownCore`/`runWeekendRestartCore` via `xstockSpotScanner.pause()`/`.resume()`; `inFlight` set/cleared (finally) by the poll/boot reconcile. R: scanner `handleTick`. Like S2/S5/S15/S17 — intentionally shared, NOT split-brain; do NOT mode-key. **Note:** the Sunday-reopen path re-warms the OHLC price snapshot but NOT the TEC config snapshot → cold-cache-at-reopen fail-closed (RUNNING_ISSUES #349). |
| **S19** | `openShadowTrades` Map · `vts-runner.ts` (+ `shadowOpenBySignal` dedupe Map, `_shadowCycleSeq`, `shadowDropCount`) | the reorg-B4 shadow-trade telemetry Map — one open counterfactual sim per RTB-pool member each promotion cycle, segregated from `openVirtualTrades` | single module-global Map keyed by shadow id (mode carried IN the record + cycleKey + the `rtb_shadow_pairings` row, NOT a Map key) | 🟢 **MODE-INVARIANT (telemetry, segregated-by-construction)** | reorg-B4 (2026-06-25). Telemetry-only, NEVER read by any learning / risk / cap / dup / lane / ranking consumer (those ALL read `openVirtualTrades` only → shadow-free by construction). W: `registerOpenShadowTrade` (the single `getRankedSignals` capture hook), `resolveOpenShadowTrades`/`shadowClose`, the boot rehydration split. R: `resolveOpenShadowTrades` only. Persists to the shared `vts_open_trades` (`context.shadow=true`, excluded from every non-shadow read via `VTS_OPEN_TRADES_EXCLUDE_SHADOW`) + the isolated `rtb_shadow_pairings` sink (no learning reader EVER). Bound: `(mode,signalId)` dedupe ~pool-size + `SHADOW_CAP=10000` (reject-new) + 6h TTL. DORMANT (rtb_total=0 → §9.1 forward-instrumentation). Like S2/S5/S15/S17/S18 — intentionally shared, NOT split-brain; do NOT mode-key. B9 hardening: RUNNING_ISSUES #388 (rehydration fail-direction) + #389 (capture-path guard). |
| **S20** | `price-liveness._cache` config singleton · `xstock_spot/price-liveness.ts` (`let _cache`) | the resolved `PriceLivenessConfig` (`window_ms`/`min_moves`/`min_snaps`/`query_timeout_ms`/`enabled`) for the B6.6 xStock price-discovery-liveness gate, with TTL (60s on a hit, 5s on a fail-closed null) | single module-global slot (NOT mode-keyed; the config is per-asset-class `xstock_spot`, exchange/strategy/regime = `*`) | 🟢 **MODE-INVARIANT (config cache, not trade state)** | P19-B6.6 (#236, 2026-06-26). A config cache that lives in the OPEN PATH (read by `resolvePriceLivenessConfig` → `evaluateXstockPriceLiveness` at `active-execution-engine.ts` open seam, AFTER the depth gate). Fail-CLOSED: a missing/mistyped `module_constants price_discovery_liveness` row set caches `null` (5s TTL) and the gate blocks. Mode-invariant like S5 (`UnifiedPriceCache`) / S16 (RtbMetrics) — the config is a DB-resolved knob, not per-mode trade state; do NOT mode-key. DORMANT until B7b (the open seam runs only when active-paper opens a position → §9.1 forward-instrumentation). The gate's PURE assessor (`assessPriceLiveness`) + windowed `last`-move read (`getRecentLastMoveStats`, index-bounded + Promise.race timeout-fail-closed) are stateless. Telemetry: a liveness block records via `recordDepthGateBlock` (`depth-source._gateBlocks`, distinct reason-bucket) + `recordOpenFailed(...,'LIVENESS_GATE',...)` into S16's I3 invariant. |
| **S21** | `FeedIntegrityMonitorService` mutable fields · `feed-integrity-monitor.ts:97-101` (`xstockWasOpen`, `xstockOpenedAtMs`, `lastReconnectAttempts`) | the boot-started feed-health ALARM's per-cycle state: the xStock market-open warmup-grace anchor + the cumulative-reconnect delta baseline | single module singleton (NOT mode-keyed; feed health is mode-invariant) | 🟢 **MODE-INVARIANT (monitoring, not trade state)** | P19-B6.7 (#301, 2026-06-26). The alarm was re-pointed off the **§15-removed** vestigial 2nd WS (`market-data-ws.ts`/`market-data-coordinator.ts`) onto the PRIMARY `krakenWebSocketAdapter` per-symbol tick-age (`gradePerClassFeedLiveness` in the NEW pure module `server/services/market-data/feed-health-aggregate.ts`). `xstockOpenedAtMs` anchors the post-open warmup grace (suppress the xStock-class critical for `feed_health.warmup_grace_ms` after the `isXstockMarketOpenUTC` closed→open edge); **on RESTART it resets to null → the grace RE-APPLIES on the first post-restart cycle that sees xStock open** (benign/desirable — avoids a stale-at-boot false critical, NOT a bug). `lastReconnectAttempts` baselines the primary adapter's CUMULATIVE `reconnectAttempts` to derive the per-cycle interval delta. Mode-invariant like S2/S5/S15–S20 — do NOT mode-key. Boot: `feed-integrity-auto-check.ts` cron `*/5`. Per-class thresholds + grace = DB `module_constants 'feed_health'` (read defensively via `getCachedNumberRequired`; unwarmed → skip grade, never false-fire). **Phase-21 home (RUNNING_ISSUES #396 → P19-B6.9):** parity-gate's `assessWsReadiness` uptime derives from the same CUMULATIVE `reconnectAttempts` / fixed-120 denominator → a long-lived process accretes reconnects and could spuriously fail the go-live WS gate even on a fresh feed; re-base/window it before Phase-21 go-live. |
| **S22** | `active-funnel-tracker` module singleton `_stats` Map + `_startedAt` · `server/core/observability/active-funnel-tracker.ts` | the ACTIVE trading path's per-`(mode,assetClass)` funnel counters (signalsGenerated denominator; strategyAttrition upstream bucket; preSqeRejects{+byStrategy}; sqeGateRejects + sqeEvaluated/Passed; postSqeRejects; rtbRefresh{cyclesRun,refreshedAttempted,reconfirmed,rejectedInRefresh,promoted}; sqeAttempts{atGeneration,atRefresh}) that feed the Paper/Live Filter-Diagnostics `/api/active-engine/diagnostics/funnel` endpoint | **mode+class-keyed** `${mode}::${assetClass}` (paper/live × crypto_spot/xstock_spot); durable — atomic tmp+rename checkpoint to gitignored `logs/active-funnel-checkpoint.json` every 60s + reload-on-load; `keySchema='mode::assetClass/funnel-v3'` discard-and-loud-log guard + per-bucket orphan-key guard; `_startedAt` "since" stamp restored across restarts | 🟢 **TELEMETRY-ONLY (no trade state — a missed/double count can never affect an order; the safety gates are independent)** | P19-B8.4b (2026-07-08). Mirrors the guard-eval-tracker durable-singleton pattern. **Writers** (all reached ONLY from the active path, DORMANT until the B8.5 switch-on): `recordActiveSignalsGenerated`/`recordActivePreSqeReject`/`recordActivePostSqeReject`/`recordActiveStrategyAttrition`/`recordActiveSqeEvaluation` in `signal-orchestrator.buildSizedSignalForStrategy` (+ the `evaluateSymbol` family-filter loop for attrition); `recordActiveRtbRefresh` cyclesRun in `rtb-refresh-service.refreshModeSignals` (anchor-a — dormant→active discriminator via `hasActiveFunnelActivity`) + refreshedAttempted/reconfirmed/rejectedInRefresh + SQE-at-refresh in `ready_to_buy_service.refreshAndRank` + promoted (single home) in `active-execution-engine.checkRtbPromotion`. **Invariant:** `strategyAttrition` (family-filter strategy drops, UPSTREAM of signal build) is a SEPARATE bucket so `preSqeRejects ⊆ signalsGenerated` holds by construction (Langston B8.4b anchor-b). **Concurrency:** every writer is a synchronous Map read-modify-write with NO await between read and write → race-free under the `Promise.all` refresh chunks (single-threaded atomicity; ⚠️ do not introduce an await inside a writer). Envelope contract = `shared/active-funnel-envelope.ts` (`active-funnel/v3`, produced by BOTH the endpoint and consumed by the client FD panel). SERIALIZATION safe (active + VTS eval pipelines strictly serial). Open: #419 (refreshAndRank error-path adds an `error` outcome bucket) → B8.5. |

> **★ P19-B8.1 MODULE-CONSTANTS CACHE SEMANTICS — SWAP-ON-SUCCESS + SWR (2026-07-04, deployed `111b9d349`; the shared-in-memory-state change EVERY module_constants consumer inherits).** The 60s background refresher's `prefetchModule` previously did `cache.delete()` BEFORE its async DB read — a per-refresh window where ANY sync reader of the in-flight module threw "is not warm" (observed live ~hourly on `dbs_calculation` + `amr_friction_sample`, widening with Supabase latency; also the origin of the xStock panel's stale Last Error banner). NEW semantics (`module-constants-service.ts`): (1) **swap-on-success** — read fresh FIRST, then atomic `cache.set`; a failed refresh leaves the previous entry serving (**stale-while-revalidate**); post-boot, sync readers can no longer hit `!cached` except true cold-start. (2) **Bounded+logged staleness** — `maybeWarnStaleServe` (`[module-constants][STALE_SERVE]`) fires on serves >5min past the last successful refresh, rate-limited 1/min/module, in **ALL THREE sync readers** (`getCachedConstant`; `getCachedNumberRequired` transitively; `getCachedNumbersForModule` — the bulk per-strategy lever path) — a wedged refresher is visible, never silently masked. (3) `invalidateModuleCache` = **expire-not-delete**; the admin write path (`setConstant`) re-warms via `await prefetchModule`. Boot hard-fail UNCHANGED (b72-warmup still refuses to start on zero rows — §5 no-silent-fallback intact: this is refresh resilience, not a DB-governed-value fallback). Secondary: the xStock scanner `diag.lastError` is now an ACTIVE alarm (clear-on-success) with `lastErrorAt`/`errorCount` history (scanner + `/api/xstocks/filter-diagnostics` emission + panel).

> **★ P19-B8.1 THREE MODE PAGES — the trading-UI client architecture (2026-07-04; Kyle locked design 07-03).** The single 6-tab Trading page (`pages/active-trades.tsx`, **§15-DELETED**) is replaced by ONE parameterized shell `pages/mode-trading.tsx` + three thin manifest pages `live-trading.tsx`/`paper-trading.tsx`/`virtual-simulations.tsx` (nav Live→Paper→VTS; `/active-trades` redirects to Paper; `/insights` + FilterInsights page/tab/component §15-DELETED). **The manifests ARE the mode-axis contract:** active-path tabs read `/api/active-engine/*` + `/api/trading-signals` + `/api/shadow-trades/by-cycle?mode=`; VTS tabs read `/api/vts/ml/*` + `/api/vts/filter-diagnostics` + `/api/xstocks/*` — no tab assumes the other family's tables (post-B-RENAME they differ). Shared tab components: `components/vts/` (`vts-shared` types/helpers, `vts-open-trades-table`, `vts-closed-trades-table`, `vts-filter-diagnostics-panel`, self-fetching `vts-tabs.tsx` w/ refresh+CSV) + `active-trades-v2` + `trade-history-tab` + `ready-to-buy-table`/`execution-metrics` + `shadow-trades-tab` + `machine-learning/xstocks-tab`. **Controls:** toggle + SimulationStartup/ConfirmBalance modals live in `components/trading/paper-trading-controls.tsx` ON the Paper page; top-bar = mode-neutral display only (metrics strip stays there until B8.3 moves it with the three-balances labeling; LIVE/PAPER selector retired — mode is the page; live confirm modals unmounted until the Phase-21 live-controls build). **ML page** = learning/calibration home (Predictive Adjustments + Regime Archive + DBS Pair Tracking; its `/api/vts/filter-diagnostics` fetch RETAINED for the DBS panel). Deletion trace + corrected KEEP set (pattern-pool dispatcher/filters stay — SQE/sizing/diagnostic consumers): `DELETED_COMPONENTS_LOG.md` 2026-07-04 + `P19_B8_1_PRE_AUDIT.md` §1. Blast radius: client + 2 display endpoints (`/api/pattern-pool` deleted; `/api/vts/filter-diagnostics` +tradesOpened24h v1.6); zero engine-behavior change.

> **★ P19-B8.3 PER-MODE DASHBOARDS + MODE-HONEST FD TABS (2026-07-06, head `6ba933708`).** Extends the B8.1 manifests with a **Dashboard landing tab on all three mode pages** and makes the ONE shared FD panel disposition-aware. **New/changed components:** (1) `server/services/dashboard-metrics.ts` — PURE metric math for `/api/active-engine/trades/analytics` (calendar earnings over the ALL-TIME valid set — range-independent; feeDrag / makerTakerMix / avgNetR / maxDrawdownUsd / byAssetClass — window-scoped; `profitFactorOrNull` — null on no-losses, never Infinity→0); unit-tested (`p19-b8-3-dashboard-metrics.test.ts`), consumed ONLY by the routes.ts analytics handler. (2) `/api/active-engine/trades/analytics` + `/portfolio-summary` are **mode-parameterized** (`?mode=paper|live`, default paper); `netPnlPercent`/drawdown-% divide by the B8.2 `getAnchorState(mode).balance` (null-honest — no anchor → null, never fake 0; the pre-B8.3 always-0 root-fixed). The engine-not-running `session` case no longer early-returns a hardcoded zero shape — it flows through (unreachable window floor) so calendar earnings stay REAL on an empty window. (3) NEW `/api/active-engine/balance-curve` (realized basis: `portfolio_anchor_events` resets + closed-trade cumulative netPnl; `never_filled` excluded; #416 = unused carrier field → B8.3b). (4) NEW `/api/active-engine/pipeline-tail` (staged v1 — pool size via `activeFilterPool.getPoolSize(mode)` + `rtb_signals` queue depth + `rtbMetricsService.getSummary()` + open-positions count; NO scanner instrumentation — the per-stage active-path funnel = B8.3b, pre-declared architecture class). (5) NEW `/api/vts/analytics` (typed exclusions IN the row filter: `countsInAggregates!==false`, mtTwin, shadow, never_filled — `excludedCount` surfaced; `virtual: true`). (6) `client/src/components/dashboard/mode-dashboard-tab.tsx` (the Kyle-template widget cards + recharts realized-balance curve w/ anchor dots + byStrategy/byAssetClass breakdowns; VTS variant = learning-throughput framing). (7) **Metrics strip re-homed**: `client/src/components/trading/portfolio-metrics-strip.tsx` (NEW, `?mode=`-scoped, three-balance labels) renders on the Paper/Live pages; `top-bar.tsx` portfolio query + BOTH I10-FIX WS listeners (trade_closed invalidate, throttled price_updated) MOVED there — top-bar keeps only trading_state_changed/trading_data_updated + clocks (zero orphaned listeners, Langston HARD-check 2). (8) **FD panel disposition model**: `vts-filter-diagnostics-panel.tsx` props `gateDisposition: 'enforce'|'tag'` (default 'tag') + `modeTail`; the gate table's aggregate columns come from the pure `client/src/components/vts/gate-columns.ts` (**'tag' structurally cannot yield a "Rejected" column** — Dropped=stop+atr / Tagged=rr+reach per reorg-B3.3; enforce Rejected = Evals−Passed, identity test-pinned against the real `applyGlobalGuards`); VTS-only sections gate on 'tag'; enforce renders the shared-scanner banner + `ActivePipelineTail`. Paper/Live manifests pass `enforce`+`modeTail`; VTS passes nothing (default). (9) OBJ-8 visible fetch-failure states on VTS open/closed/FD tabs + strip + dashboard (a failed fetch NEVER renders as an empty table — the 2026-07-06 zero-trades scare). Blast radius: client + the analytics/summary endpoints + 3 new read-only endpoints; zero engine-behavior change. Residuals → B8.3b: #417 (VTS-side funnel sub-blocks inside shared scanner tables still render on Paper/Live — banner-explained, replaced when per-path counters land), #415 (denominator/basis reconciliation), #416.

> **★ P19-B8.3b — the fast-follow (2026-07-07, heads `9e91245ab`+`23047f291`; class `non_architecture`; #415/#416/#417 all RESOLVED).** (1) **`scanDiag.destinationCount` + `totalDestinationCount` RETIRED** (DELETED_COMPONENTS_LOG 2026-07-07) — a mislabeled serialized-but-unrendered scan-diagnostic field (set to the VTS survivor count even on `active_pool`); removed from the fx5-scanner type/init/assign/aggregate, both `getLastScanDiagnostics`/`getRolling24hDiagnostics` return shapes, the `vts-shared.tsx:154` client mirror, and two trace tokens. **A RESPONSE-SHAPE narrowing** of `/api/vts/filter-diagnostics` (`lastScan`/`rolling24h`) — safe, proven zero-reader by two qualified repo-wide greps + tsc-baseline. **Survivor (do NOT confuse):** the FD-response top-level `destinationCount` at `routes.ts:7809/:7853` (`familyFanOutSum+patternFanOut`) is a DIFFERENT field, untouched. (2) **The FD panel's #417 display separation is now honest on enforce (Option A — the scanner is MODE-MULTIPLEXED, keyed on `isEngineActive`, so it BECOMES the active funnel at the B8.4 switch-on; no dual-funnel build).** All three VTS-runner downstream blocks — Table-1 VTS Evaluation Metrics (already gated in B8.3), the Last-Scan "VTS Signal Funnel (Last Cycle)", and the Table-2 "VTS Evaluation (24h rolling — VTS-side counters)" (the second one caught by the §9.3 walk, not the diff review) — gate to `gateDisposition === 'tag'`; on Paper/Live an honest "Active-path … populates at B8.4" placeholder renders. The three "→ VTS Destination" rows relabel to "→ Survivors (post-benchmark; shared scan feed)" on enforce (the COUNT is real shared-feed data — the scanner genuinely feeds VTS with active off — only the noun was the mislabel). (3) analytics headline `netPnl` standardized on the canonical net basis `num(t.netPnl ?? t.pnl)` (#415 gross→net; reconciles Σ byAssetClass by construction). (4) balance-curve `startLevel` carrier seeded as the chart left-edge point (#416). ON-state (active-trading-on) enforce funnel render → verification-homed to B8.4 §13. B8.4 forward-condition #418 (closer must populate `net_pnl`).

### Trading liveness model — FIVE readers of "is (paper\|live) trading active right now?"
The SSOT is the **DB flag** `system_context.isEngineActive` per mode. The other four are derived/cached and **can diverge** — the **root cause is a deferred write**: `setEngineActive` (`trading-state-sync.ts:251-293`) broadcasts the new state synchronously (`:251-266`) while deferring the DB write AND the cluster-bus emit via `setTimeout(…,0)` (`:274-279`).

| # | Reader · file:line | Type | Divergence |
|---|---|---|---|
| 1 (SSOT) | DB `getSystemContext(mode).isEngineActive` — active-pipeline gate (`fx5-scanner.ts:544`, `xstock_spot/active-dispatch.ts:124`) | DB per-mode | written one tick LATE (the `setTimeout` deferral) |
| 2 | engine/orchestrator presence `getEngine`/`getOrchestratorByMode` (`active-dispatch.ts:128`, its `:18-20` comment names this split-brain) | in-memory | present-but-flag-not-flipped, or vice-versa |
| 3 | `tradingStateSync.currentMode` cache `Map<userId,mode>` (`trading-state-sync.ts:25,143`) | in-memory by userId | lags on cross-process change |
| 4 | `vtsModeAudit.tradingActive` (`vts-mode-audit.ts:67-126`) | single global bool | collapses both modes into one bool; sticks if a bus event drops |
| 5 | `getGlobalSession()` → `globalSimulationSession` (`routes.ts:5774`) — single global, NOT mode-keyed; read by `context-refresh-coordinator.ts:194/300`, `system-health-service.ts:60`, `routes.ts:4260/5836/11668` | in-memory global | not mode-separated |

**Consolidation target (P19-B4b D5 / issue #214) — ✅ SHIPPED 2026-06-15:** the DB flag is the sole SSOT; `setEngineActive` (`trading-state-sync.ts`) now **awaits the DB write FIRST and only then broadcasts** (H1 — the `setTimeout(…,0)` deferral that was the divergence root is gone; if the write throws, nothing is broadcast); the 30s reconciliation guard now runs `checkLivenessInvariants` (H2) — a per-mode `DB == engine-presence == orchestrator-presence` check + a global `vtsAudit == anyActive` check, **gated by a 15s settling window** (`lastEngineFlipAt`) so in-flight start/stop transitions don't false-positive — and increments an observable **`LIVENESS_SPLIT`** counter (`getLivenessSplitStats()`) on any disagreement. **The witness reading 0 for every key during a co-run dry-run is the NUMBERED hard precondition for the Phase-21 paper+live flip** (PHASE_19_PLAN §5). Readers 2–5 remain present but are now witnessed for divergence rather than fully rewritten; reader-#5 (`getGlobalSession`) is deliberately excluded from the hard equality invariant (it tracks the sim-session lifecycle, not engine-active). Unit-tested: `p19-b4b-d5-isolation.test.ts`.

### Per-asset-class active gate (P19-B6.5a — the SECOND axis on top of `isEngineActive`)
`isEngineActive(mode)` (above) is the per-MODE master switch — "is active trading on AT ALL for this mode." **P19-B6.5a adds an orthogonal per-(mode, asset_class) axis** so a single class can be active while another stays dormant under the same master flag. **SSOT:** the additive JSONB column `system_context.active_asset_classes` (e.g. `{"crypto_spot": true, "xstock_spot": false}`); a **missing key = inactive = FAIL-CLOSED**, default `'{}'` (both classes OFF). **The gate is ADDITIONAL, never a replacement:** a class trades iff `isEngineActive(mode) === true AND isAssetClassActive(mode, class) === true`. **Single typed read:** `isAssetClassActiveInContext(context, class)` (`trading-state-sync.ts`, pure, `=== true` no coercion) — the two active-path entry gates call it with the SystemContext they already hold (no extra query, no raw JSONB at the call site); the async `isAssetClassActive(mode,class)` method delegates (try/catch → fail-closed). **Setter:** `setAssetClassActive(userId,mode,class,bool)` mirrors `setEngineActive`'s H1 (await DB write FIRST, then broadcast; read-merge-write never clobbers a sibling class). **Gate sites:** crypto = `fx5-scanner.ts:543-555` (`crypto_spot` OFF → `tradingActive=false` → falls to passive/VTS scan); xStock = `xstock_spot/active-dispatch.ts:122-133` (`xstock_spot` OFF → `_classDormantSkips++` early-return). RTB (`ready_to_buy_service.ts:593/792`) is entry-gate-protected (a gated-OFF class emits no signal that reaches the queue) — defense-in-depth deferred to B6.5b (#320). **Witness (Q-D):** `recordAssetClassGateDecision`/`getAssetClassGateStats` (per-class allow/skip — the provable-xStock-silence positive witness) + `witnessAssetClassEmissionWhileInactive` → `recordLivenessSplit('asset-class-gate:…')` (hard-breach hook, currently uncalled → wire/delete in B6.5b, #321). **DORMANT by construction** (both classes default OFF). B7b crypto-first = master ON + `crypto_spot` ON + `xstock_spot` OFF. Unit-tested: `p19-b6-5a-per-class-active-gate.test.ts` (incl. the xStock-isolation acceptance test = PHASE_19_PLAN §6 gate-10 precondition). **Known edge (B6.5b notes, #321):** `fx5-scanner` reads only the resolved active mode's context for the crypto gate (fine while one mode is active at a time; live+paper-both-ON would consult only the live-resolved context).

### Vestigial / legacy shared globals (do NOT assume removable — verify, then schedule)
- **`global.tradingEngines`** — referenced in 6 files (`intent-executor.ts`, `health-monitor.ts:444`, `context-refresh-coordinator.ts:198/304`, `state-awareness.ts:317`, `routes.ts:4059`, `operation-queue.ts:324`) but **NEVER assigned anywhere** → always `undefined`. Most readers guard via `?.`; `intent-executor.ts:234/239/281/282` writers are **UNGUARDED** (would throw if those dormant paths ran). Part of the legacy "live-engine / agent-intent" subsystem (further evidence: `intent-executor.ts:208` calls `new PaperPortfolioManager(userId)` with the args in the wrong order vs the `(mode, userId?)` constructor — a stale call site). **Removal is NOT a clean cut → RUNNING_ISSUES #297** (investigate subsystem liveness first). This entry is the canonical example of *why this registry exists*: a grep said "no writers," but the truth needed hand-verification.

### Kill-switch / daily-loss (confirmed safe)
Kill-switch is **DB-backed per-mode**: `isKillSwitchTripped(mode)` (`guardrail-policy.ts:567`) reads the per-mode `killSwitchTripped` DB column; `dailyLossKillSwitchPct` (+ P19-B6 `dailyLossWarning1Pct`/`2Pct`, % of kill threshold) is a per-mode guardrail. **P19-B6: the automatic daily-loss evaluator now EXISTS** (was previously absent) — `server/services/daily-loss-budget.ts` (`evaluateDailyLossBudgetOnClose`, a `setImmediate` post-close hook off `active-execution-engine`'s `tradeClosedHandler`) holds a small in-memory per-mode state (the `killInProgress` re-entrancy latch + the two warning-tier arm flags, keyed to `engineSessionStart`); it computes the session-anchored rolling-24h realized loss and auto-trips `tripKillSwitch` on breach (which flattens via the existing stop sequence — no separate close). Gated on `isEngineActive` (dormant in VTS/passive). `resetKillSwitch → resetDailyLossBudgetState` clears the latch + re-arms on restart. Warnings + kill surface on BOTH the user-facing `system_alerts` banner AND the operational `.jsonl` queue.

---

## Layer 1: Core Math & Scoring

### 1.1 FinalScore Kernel
- **File**: `server/services/signal-orchestrator.ts` (scoring section) <!-- path corrected P19-B4a: the orchestrator lives under server/services/, not server/core/ -->

- **What**: Computes FinalScore using `SCORE_WEIGHTS.FINAL_SCORE` adaptive weights. Volatility-adjusted via `adjustWeightsForVolatility()`.
- **Upstream**: HybridScore, PredictiveConfidence, DecayPenalty, RegimeWeight, PatternStrength
- **Downstream**: SQE (FinalScore threshold), RTB (ranking), TCL (selection), Paper Execution Engine, VTS Runner (mirrors this logic)
- **Shared State**: `SCORE_WEIGHTS` config object
- **Execution**: Synchronous — computed per signal during orchestration
- **Blast Radius**: **CRITICAL** — FinalScore is THE ranking authority for every trade decision
- **Contamination**: Receives simulated inputs from VTS (BUG-001). Real in active trading path.
- **Tests**: `finalScore-kernel.test.ts`, `signal-scoring.test.ts`, `runtime_signal_consistency.test.ts`

### 1.2 Net Expectancy Kernel
- **File**: `server/services/signal-orchestrator.ts` (`computeNetExpectancyKernel()`), mirrored in `active-execution-engine.ts` <!-- path corrected P19-B4a -->

- **What**: EV gate. Computes Net Expected Value using Pwin, reward/risk ratio, and friction. Trades with negative NetEV are blocked.
- **Upstream**: DI (Directional Integrity), cost-model friction, reward/risk estimates
- **Downstream**: Paper Execution Engine (EV gate), VTS Runner (mirrors gate)
- **Shared State**: DI calculation (~~BUG-004~~ **RESOLVED** — Directive 12.1.1)
- **Execution**: Synchronous — computed per signal
- **Blast Radius**: **CRITICAL** — blocks or allows every trade
- **Contamination**: ~~DI derived from NGC (BUG-004)~~ **RESOLVED** — DI now sourced from geometric price data via `calculateDirectionalIntegrity(closePrices)`
- **Tests**: `expectancy-kernel.test.ts`, `net-ev-validation.test.ts`

### 1.2a Target Normalizer + Per-Class ROI Gate (reorg-B2, 2026-06-20)
- **File**: `server/core/calculations/signal-target-normalizer.ts` (`normalizeAndGateTarget`, pure); per-class resolution in `server/core/calculations/expectancy.ts` (`getPerClassTargetGate` + `assetClass`-threaded ROI fns); seeded by `drizzle/migrations/2026-06-20-reorg-b2-per-class-roi-target.sql`; fail-closed boot assertion in `server/startup/b72-warmup.ts`.
- **What**: Governs the target SETTING (the actual opener) before the EV gate. LIFT target to `max(native, entry×(1+floorPct))` → UNIVERSAL RR gate (`rr<minRR` → drop, never co-moves the stop) → REACHABILITY gate (`atrsToTarget=(target−entry)/ATR ≤ reachAtrMax`; ATR≤0 → LOUD `invalid_atr`, never coerced to 0). Per-class knobs from `module_constants` (`expectancy_gates` + `roi_gating`), keyed `crypto_spot`/`xstock_spot`.
- **Upstream**: strategy `entry/stop/target`; the per-pipe ATR (`mceContext.indicators.atr`, carried on `SizingContext.atr` for the active path / `marketContext.atr` for xStock active-dispatch); per-class `module_constants` rows.
- **Downstream**: feeds the (possibly lifted) target into the Net Expectancy Kernel + sizing; drop-reasons surface by-reason (active `console.warn`/`console.error`; VTS `logSkippedSignal` + `setNullReason` — `Target_Unreachable`/`Target_RR_Gate`/`Target_Invalid_ATR`).
- **Shared State**: applied at BOTH convergence points (active `buildSizedSignalForStrategy` + VTS `vts-runner`) so sim-to-live gate identically; the pure helper holds NO state. Per-class DB rows are process-cached via the module-constants resolver (warmed at boot).
- **Execution**: Synchronous — per signal, pre-geometry.
- **Blast Radius**: **CRITICAL** — gates/reshapes the target on every active AND VTS signal, both classes.
- **friction MODEL vs MARGIN (architecture)**: the 6 ROI knobs + per-regime `min_roi` are per-class (global `'*'` rows DELETED — no silent fallback); `friction_safety_buffer` is a DELIBERATE single global `'*'` row — a uniform safety MARGIN on top of the already-per-class friction MODEL (`fee_model` + per-class spreads carry the crypto-vs-xStock differences), not a missed split. Phase-25 revisit: roadmap 25-18 / RUNNING_ISSUES #337.
- **Tests**: `p19-reorg-b2-target-normalizer.test.ts` (8 — lift, dispersion, universal RR, unreachable, `invalid_atr`-distinct, geometry).

### 1.2a-1 Gate RELOCATION into the strategies' shared guard (reorg-B2.1, 2026-06-21) — ⚠️ PARTIALLY SUPERSEDES 1.2a
- **What changed (Kyle's placement question):** the RR + reachability gates moved OUT of the post-hoc normalizer (1.2a) INTO the strategies' shared guard `server/strategies/strategy-helpers.ts::applyGlobalGuards`, which now runs at SIGNAL-GEN inside each strategy (the place the signal is actually made), and the **floor-LIFT was DROPPED entirely** (it was a target MUTATION redundant with the 11.8B Net-Expectancy gate that already judges cost-coverage). `applyGlobalGuards` now returns `GuardResult{pass, rr, atrsToTarget, dropReason}` (stays a PURE leaf — type-only import of `GuardDropReason`); `validateRR(minRR injected)` + new `validateReachability(reachAtrMax)`; `clampEffectiveATR` value-form of `getEffectiveATR`.
- **One per-class SSOT:** the per-class `minRR`/`reachAtrMax` come from `getPerClassTargetGate(assetClass)` (reads `expectancy_gates` via `getCachedNumberRequired`, throws on missing) — killing the prior live split-brain (file-based `MIN_RR_RATIO=1.5` vs normalizer 2.5; 1.5 demoted to a seed).
- **Wiring:** 18 guard-eligible strategies — 8 file-based (`adaptive-flow`, `defensive-hedge`, `inside-bar-reversal`, `morning-star`, `pivot-shift`, `reverse-impulse`, `support-bounce`, `volatility-edge`) + 10 in-class/`orb`/`strong_bull_trend` at the verified dominance lines in `strategy-engine.ts`/`orb.ts`. `liquidity_trap` SKIPPED (disabled, inverted geometry). The 3 non-ATR strategies (`sma_trend_ride`, `vwap_bounce`, `dhma`) feed reachability a `computeATR(priceHistory)` pair-ATR (reachability is a path-invariant PAIR property).
- **Normalizer status:** `signal-target-normalizer.ts` KEPT as a NET-NEUTRAL downstream bridge (no longer lifts; RR/reachability there are now redundant double-gates), to be RETIRED in reorg-B2.2 OBJ-C once the #371 guard-vs-normalizer ATR-source divergence is measured (#373 3-condition gate).
- **NEW component `server/strategies/guard-eval-tracker.ts`:** suppression counters (`recordGuardEval`; evals/passes/atr·stop·rr·reach drops/rrEvals/rrSum) — the #372 minRR-calibration precursor — exposed by `GET /api/diagnostics/guard-eval-stats`. COUNTERS not logs (hot-path safe); serial-pipeline safe.
  - **reorg-B2.2 OBJ-A (PERSISTENCE):** atomic tmp+rename checkpoint `logs/guard-eval-checkpoint.json` (~60s timer, unref'd) + reload-on-boot, so a restart pauses+resumes the window (Kyle 2026-06-21); `getGuardEvalStartedAt()` wipe-stamp on the endpoint. Non-ENOENT reload errors loud-logged (a torn/corrupt file = a real wipe).
  - **reorg-B2.2 OBJ-B (PER-CLASS RE-KEY, 2026-06-23):** `_stats` re-keyed to the composite `${strategy}::${assetClass}`; `recordGuardEval` gains a required `assetClass` 5th arg (all 18 call sites). `getGuardEvalStats()` folds the per-class buckets back to the strategy aggregate by SUMMING raw fields + RE-deriving the ratios (the #372 read is byte-preserved — never averages per-class ratios). New `getGuardEvalStatsByClass(assetClass)` + `getGuardEvalStatsPerClass()`. Checkpoint carries `keySchema='strategy::assetClass/v1'` and reload DISCARDS-and-loud-logs on any mismatch incl. an unversioned legacy checkpoint (prevents stale-cardinality orphan buckets — #373/#372 corruption guard). The two VTS Filter-Diagnostics endpoints feed per-class `guardDrops`: **`GET /api/vts/filter-diagnostics`** (`server/routes/vts.ts`, schema `filter-diagnostics/v1.5`, crypto_spot) + **`GET /api/xstocks/filter-diagnostics`** (`server/routes.ts`, schema `xstocks-filter-diagnostics/v2.1`, xstock_spot); the raw `/api/diagnostics/guard-eval-stats` adds an additive `statsByClass` (schema v2→v3). The shared **`client/src/pages/machine-learning.tsx` `FilterDiagnosticsPanel`** (reused by the crypto AND xStock tabs — `xstocks-tab.tsx`) renders a "Reward-vs-Risk / Reachability Gate" card: by-reason rows (`rr_below_min`/`unreachable`/`stop_distance`/`invalid_atr` via `formatFilterName`) + meanRR + suppression, with a distinct no-evaluations state per class. **Latent (#376):** `rrMin/rrMax` Infinity sentinels serialize to `null` over JSON — reload restores them, residual is the unused-by-UI wire field; fix folds into OBJ-C.
- **CI honesty note:** the OBJ-4b wiring (`8beb34181`) exposed 2 strategy unit tests that did not warm/mock the new `expectancy_gates` sync read → Test Suite RED until the TEST-ONLY fix `7bef81fd7`; production unaffected (boot warms it). CI 4-green confirmed `7bef81fd7`.

### 1.2a-2 Per-PATH gate DISPOSITION — VTS tag-don't-drop (reorg-B3.2 + reorg-B3.3, 2026-06-24)
- **What changed:** the RR/reachability guard (1.2a-1) now DISPOSES of a failed QUALITY gate per-path. **`'enforce'` (active/live):** drop on any fail (unchanged). **`'tag'` (VTS):** `rr_below_min`/`unreachable` are LABELLED + simulated-to-close (capture the counterfactual outcome) instead of dropped; `invalid_atr`/`stop_distance`/`invalid_geometry` still drop on every path. This un-strangles the VTS learning engine (staging-proven collapse: 1 signal / 136,779 evals) and un-circularizes the reorg-B2.3 minRR baseline.
- **Two points, two batches:** **reorg-B3.2** = tag-don't-drop at the downstream normalizer (`vts-runner.ts::normalizeAndGateTarget`, ~:1189), which sets `vtsGateVerdict ∈ {passed, rr_below_min, unreachable}` on the opened VTS trade record. **reorg-B3.3** = the SAME disposition at the strategies' shared guard (SSOT `strategy-helpers.ts::guardForcesDrop(gr, disposition)`, `VTS_TAGGABLE_GUARD_REASONS={rr_below_min, unreachable}`), because reorg-B2.1 had moved the gate INTO the strategies at signal-gen → each strategy dropped the signal FIRST, upstream of the normalizer, making B3.2 inert on the live path.
- **Wiring (cross-cutting, but a THREADED PARAM — see registry note):** a trailing-optional `gateDisposition: GateDisposition = 'enforce'` added to all 18 detect signatures (8 in-class `strategy-engine` detectors + 10 file-based strategies + their wrapper methods) and threaded through the VTS dispatch `callStrategyDetect`/`callStrategyDetectRaw`. ONLY the crypto VTS path (`vts-runner.ts:1182`) passes `'tag'`; every other caller (orchestrator/active, xStock eval-cycle, routes, validators, historic-signal-generator, scripts, tests) OMITS it → default `'enforce'` → byte-identical. xStock VTS un-strangle is **reorg-B3.3x** (RUNNING_ISSUES #382 — eval-cycle has a different gate chain).
- **★ SIM cross-cutting-state REGISTRY applicability (explicit, per Langston §16):** `gateDisposition` is a **stack-threaded function parameter**, NOT shared in-memory state, a singleton, or a liveness flag → it is **NOT** a "Cross-Cutting Runtime State / Singletons & Liveness Registry" entry. It is documented here as a signal-pipeline data-flow change only. The `vtsGateVerdict` field rides on the in-memory `OpenVirtualTrade` record (no DB column — re-derivable from geometry, B3.2 no-migration). Known-benign clamped-vs-raw reach-ATR divergence between the guard and the normalizer: RUNNING_ISSUES #382.
- **reorg-B3.3y (2026-06-24, #383):** `normalizeAndGateTarget`'s geometry guard made SYMMETRIC — added `nativeTarget <= entryPrice` (a valid long needs `stop < entry < target`), so a reward≤0 long drops as `invalid_geometry` (validity, every path) instead of tag-and-simulating on VTS as `rr_below_min`. Both callers traced (active `signal-orchestrator.ts:1232` drops on any `!ok` → unchanged outcome, label-only; VTS `vts-runner.ts:1203` → tag→validity-drop). No new component/state.
- **reorg-B3.3x (2026-06-24, #382):** the xStock VTS path (`xstock_spot/eval-cycle.ts`) is UNIFIED onto the shared `normalizeAndGateTarget` (it had none — build-history gap, B79.0m). eval-cycle now opts its dispatch (`:526`) into `'tag'` + runs the normalizer after detect, before the Net-EV floor (orthogonal + sequential): quality TAG, validity DROP — so the normalizer's tag-don't-drop is now the ONE shared VTS gate for **both** classes. `vtsGateVerdict` threads onto the shared `OpenVirtualTrade` record via `registerOpenVtsTrade` — its input interface (`RegisterOpenVtsTradeInput`) gained the field + it's copied onto the record (in-memory-only, no DB column; the historical-persistence gap is shared crypto+xStock, homed #384 → reorg-B4). xStock ACTIVE path (orchestrator, own normalizer `:1227`) untouched. Still NOT a SIM cross-cutting-state registry entry (the normalizer is a pure helper; `vtsGateVerdict` rides an existing in-memory record).

### 1.3 Cost Model
- **File**: `server/core/cost-model.ts`
- **What**: Computes real round-trip trading costs (spread + slippage + Kraken fees). Single source of truth for friction.
- **Upstream**: Kraken spread data (via Price Cache / Cost Cache), fee schedule
- **Downstream**: Signal Orchestrator (friction in EV gate), Paper Execution Engine, FX5 Scanner (cost filtering)
- **Shared State**: None — self-contained calculation
- **Execution**: Synchronous — called per signal/trade
- **Blast Radius**: **HIGH** — affects EV calculations and filter thresholds
- **Contamination**: ~~Bypassed by `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` in some paths (RISK-009)~~ **RESOLVED** — Directive 12.1.2. All friction consumers now use `getCachedCostMetrics()` + `computeTotalRoundTripCost()`.
- **Tests**: `cost-model.test.ts`

### 1.4 DI Calculation (Directional Integrity)
- **File**: `server/services/signal-orchestrator.ts` (line ~1127)
- **What**: Computes DI from price geometry. `DI = calculateDirectionalIntegrity(closePrices)` — geometric ratio of net price movement to total path length (0-100).
- **Upstream**: OHLC close prices (via `ohlcData.map(c => parseFloat(c.close))`)
- **Downstream**: Net Expectancy Kernel (Pwin), Paper Execution Engine, VTS Runner
- **Blast Radius**: **CRITICAL** — DI feeds into every EV calculation
- **Contamination**: ~~BUG-004~~ **RESOLVED** — Directive 12.1.1 (2026-02-22). NGC-derived DI eliminated.
- **Tests**: `analysis-utils.test.ts` validates `calculateDirectionalIntegrity()` function

### 1.5 rankingScore — NEW (Phase 14.5, Batch 19)
- **File**: `server/config/ranking-weights.ts` (~110 lines)
- **What**: Cross-family signal desirability score for RTB queue ordering. Formula: `rankingScore = FinalScore * qualityWeight + normalizedNetReturn * returnWeight - frictionPenalty * frictionWeight + contextBonus`. Three weight profiles: QUANT (quality-heavy), PATTERN (context-heavy, higher friction penalty), HYBRID (balanced). FinalScore gap safety rule: if quality gap > 0.10, FinalScore wins. **⚠️ B-4.7 (2026-06-11) intent-vs-wiring correction: the contextBonus term is DECLARED-NEVER-WIRED** — CONTEXT_BONUS rules (pair-global regime agreement ±0.06/0.04, BTC confirmation ±0.03/0.02) exist in ranking-weights.ts but NOTHING computes them; signal-orchestrator imports without dereferencing and vts-runner passes literal 0. Effective formula has contextBonus = 0 everywhere. Wire-or-remove homed to AMR scoping (RUNNING_ISSUES #217). Net return normalized to 0-1 (5% ceiling).
- **Upstream**: FinalScore (from SQE), net return (from cost model), friction (from cost model), regime data (from MCE global regime)
- **Downstream**: RTB `getTopSignal()` (queue ordering), RTB metadata persistence
- **Shared State**: RANKING_WEIGHTS config object, CONTEXT_BONUS config
- **Execution**: Synchronous — computed per signal during RTB insertion
- **Blast Radius**: **HIGH** — determines which signal gets selected for execution when multiple are queued
- **Tests**: None yet (new component, validated via integration)

### 1.6 Pattern Filter Profile — (Phase 14.5, Batch 19; updated Batch 19C; partially superseded Batch 19G)
- **File**: `server/asset_classes/crypto_spot/pattern-pool-filters.ts` (~120 lines; B78 — moved + renamed from `server/config/pattern-filter-profile.ts`. Old path may exist as untracked re-export shim until B81 removal.)
- **What**: Configuration for the pattern pool pipeline. Defines: PATTERN_POOL_GUARDRAILS (elevated FinalScore floor 0.45, max position 15%), PATTERN_POOL_STRATEGIES (3 pattern + 5 hybrid = 8 strategies), SourcePool/AssetClass types. **Batch 19G**: PATTERN_POOL_THRESHOLDS and REGIME_PATTERN_THRESHOLDS are now **superseded by DB** — `screener_filters` table rows with `filter_path='active_pattern'` and `filter_path='vts_pattern'` provide these values. The file still exports guardrails and strategy list constants (not in DB). `getPatternPoolThresholds()` function may still be called as fallback but DB is primary source.
- **Upstream**: None — static configuration (guardrails/strategies), DB `screener_filters` table (thresholds — Batch 19G)
- **Downstream**: FX5 Scanner (pattern pool filtering — now via DB since Batch 19G), SQE (elevated FinalScore floor), Paper Position Sizing (15% cap), Signal Orchestrator (strategy list), VTS Runner (PATTERN_POOL_STRATEGIES for dual-path — Batch 19C)
- **Shared State**: None — exported constants and pure function
- **Execution**: Synchronous — imported at module load
- **Blast Radius**: **MEDIUM** — affects pattern pool pipeline thresholds and constraints

### 1.7 Hybrid Compatibility Registry — NEW (Phase 14.5, Batch 19G)
- **File**: `server/config/hybrid-compatibility-registry.ts`
- **What**: Shared registry mapping hybrid strategy names to their required quant + pattern constituent strategies. Used by both signal orchestrator (active trading) and VTS runner (passive learning) for hybrid confluence detection.
- **Upstream**: None — static configuration
- **Downstream**: Signal Orchestrator (hybrid confluence checking), VTS Runner (hybrid confluence buffer)
- **Shared State**: None — exported constants
- **Execution**: Synchronous — imported at module load
- **Blast Radius**: **LOW** — configuration only, consumed by two services

---

## Layer 2: Market Data & Price Feeds

### 2.1 Kraken WebSocket Adapter
- **File**: `server/exchanges/kraken/kraken.ts` (B78 — moved from `server/services/kraken.ts`) (REST section); `server/exchanges/kraken/kraken-websocket-adapter.ts` (B78.1 — moved from `server/services/kraken-websocket-adapter.ts`; cycle with `live-pricing-adapter.ts` broken via EventEmitter inversion); `server/services/live-pricing-adapter.ts` (subscribes to ws-adapter `priceTick` events at module-load post-B78.1)
- **What**: Real-time price feed from Kraken exchange. Maintains persistent WebSocket connection with heartbeat (30s) and staleness detection (2s threshold).
- **Upstream**: Kraken exchange (external)
- **Downstream**: Price Cache (primary data source), MicroExecutionService, frontend WebSocket layer
- **Shared State**: WebSocket connection state, subscription list
- **Execution**: **Persistent connection** — event-driven, always running while server is up
- **Blast Radius**: **HIGH** — all real-time pricing depends on this
- **Tests**: None specific (external integration)

### 2.1.1 Feed-Health Monitoring (P19-B6.7 / #301)
- **Files**: `server/services/feed-integrity-monitor.ts` (the boot-started ALARM, `feed-integrity-auto-check.ts` cron `*/5`) + **NEW pure module** `server/services/market-data/feed-health-aggregate.ts` (`freshestSymbolAgeMs` / `proportionFresh` / `gradeFeedAliveness` / `assessWsReadiness` / `gradePerClassFeedLiveness`).
- **What**: feed-health grading + the SOLE operator `feed_health` alert path. **P19-B6.7 re-pointed all consumers off the §15-REMOVED vestigial 2nd WS** (`market-data-ws.ts` + `market-data-coordinator.ts` — deleted; they had delivered 0 ticks / 0 successful subs since Apr and live-spammed `[MD-WS] Data stale` every 30s) **onto the PRIMARY `krakenWebSocketAdapter`** (§2.1).
- **Aggregates (3-axis, opposite by design)**: ALARM = per-class FEED-LEVEL aliveness (freshest-symbol age; xStock per-symbol `isXstockMarketOpenUTC` gate + post-open warmup grace; crypto 24/7); go-live GATE (`parity-gate`) = conservative proportion-of-symbols-fresh; status/display (`system-health-monitor`, `health-monitor`) = freshest-symbol. Per-class thresholds + grace = DB `module_constants 'feed_health'`. Architecture detail: SYSTEM_MANUAL feed-health alarm section.
- **Upstream**: primary `krakenWebSocketAdapter` (`getStatus`/`getI8EWsHealth`/`getDiagnostics`/`getHealthMetrics`). **Downstream**: `AlertsService.createAlert(feed_health)` (suppressed in dormant mode = active-trading OFF). **Shared State**: S21 (the warmup-grace + reconnect-baseline fields). **Blast Radius**: MEDIUM (monitoring/alerting; not in the trade path). **Tests**: `p19-b6-7-feed-health-aggregate.test.ts` (37 as of B6.9, incl. the OBJ-3 pos/neg/silent/market-closed/half-day/warmup matrix + the parity-gate dead-feed-false-PASS guard + the B6.9 rolling-window suite).
- **★ P19-B6.9 (#398) — parity-gate ↔ feed-integrity-monitor rolling-window consumption (cumulative → rolling-1h).** The go-live **`parity-gate.assessWsReadiness`** WS-uptime axis NO LONGER derives from the primary adapter's CUMULATIVE `reconnectAttempts` / fixed-120 denominator (which drifted a healthy long-lived process below the 99% floor and spuriously failed the Phase-21 go-live gate). It now consumes **`feedIntegrityMonitor.getRollingWindowReadiness()`** → the new pure `computeRollingWindowReadiness(reconnectsPerInterval[], minSamples)` in `feed-health-aggregate.ts`, which sums the feed-integrity ring's per-interval `reconnectsSinceLastCheck` deltas over the snapshots **PRESENT** (denominator = ring length, capped at `MAX_HISTORY=12` ≈ 1h; NOT intervals-since-boot → a bad hour ages out = self-healing). Below `MIN_READINESS_SAMPLES=6` (30 min) it returns `uptimePercent:null` → `assessWsReadiness` fails-closed (`warmingUp`, gate not-ready). New cross-cutting edge: **parity-gate now depends on feed-integrity-monitor's ring** (previously read only the adapter status directly). `calculateTimeBasedUptime()` (cumulative-since-boot) is untouched + unreused (different purpose). `ParityCheckResult.checks.wsUptime.actual` widened to `number|null` (null = warming up). DORMANT until Phase-21. The 99%-floor-vs-12-snapshot-granularity calibration is homed at POST_AUDIT_ROADMAP §3.5 item 21-3b. #396 PARKED (telemetry-silent; re-trigger on `[#396] SHORT UNIVERSE`).

### 2.1.2 Price-source model — VENUE-ONLY at-source (P19-B8.9, 2026-07-17)
- **Files**: `server/services/live-pricing-adapter.ts` (source unions, `fetchLivePrice` chain, the xstock class-gate, `peekCachedPrice`); consumers `server/routes.ts` (Open Trades `/active-engine/active-trades` + RTB `/trading-signals` payloads) + `server/services/active-portfolio-manager.ts` (valuation fallback); client `client/src/components/trading/venue-quiet-price-cell.tsx`.
- **What changed**: the DISPLAY price chain went venue-only at-source (the ACTIONABLE chain already was, since 347e9534b). **The third-party fetchers are RETIRED** (`fetchFromBinance`/`fetchFromCoinGecko`/`binanceSymbolFor` — DELETED_COMPONENTS_LOG 2026-07-17): `fetchLivePrice` is now **Kraken-REST-or-nothing**, and the `source` unions on both `PriceQuote` and `CachedPrice` drop `'binance'`/`'coingecko'` (typed honesty — a source that can no longer occur is not representable). The display fallback venue now MATCHES the execution venue (no UI showing a Binance number for a position Kraken prices+exits).
- **xstock class-gate (OBJ-2)**: for an `xstock_spot` symbol, `fetchLivePrice` SKIPS the Kraken-REST ask entirely (Kraken spot REST carries no tokenized equities — KNOWN_NONEXISTENT_NAMES) and answers venue-quiet directly (`last_known_good` if held, else `no_reliable_price`). Log marker `[P19-B8.9][XSTOCK_REST_GATE]`. This removed the structurally-wasted xstock REST asks that drove the measured peak.
- **Venue-quiet display (OBJ-5) — ONE server-side notion**: the server computes `priceVenueQuiet = !isKrakenVenueSource(source) || ageMs > 60_000` and ships it on BOTH the Open Trades and RTB payloads, so the two display surfaces cannot drift (the client renders the presentational `VenueQuietPrice` off the boolean; it never re-decides quiet). `peekCachedPrice` = a TTL-free read-only cache peek that is the display substrate (never fetches). The 5 duplicated inline `restFallbackSources` lists folded to one shared `isRestFallbackSource` predicate.
- **Cross-cutting**: source-tag readers across routes/APM/engine now see a SMALLER, honest source set; the engine's actionable gate (`isKrakenVenueSource`) is unchanged (it already rejected the retired sources). **Blast Radius**: MEDIUM (display + fallback; the actionable venue chain was already correct). **Also folds the B8.9a source-tag-honesty findings** (updateCache true-source stamping; the fifth broadcast-ternary mislabel fixed here). **Tests**: `p19-b8-9-venue-only-source.test.ts` (membership/gate-zero-fetch/peek) + `p19-b8-9a-source-tag-honesty.test.ts`.

### 2.2 Price Cache
- **File**: `server/services/price-cache.ts` (~448 lines)
- **What**: Multi-bucket unified price management. Separate buckets for regular trading, paper simulation, VTS simulation. 2-second stale threshold with REST fallback. Signal Orchestrator migrated from per-symbol `getTicker()` to `getCachedPrice()` (Batch 18 — eliminates ~4,800 redundant API calls/hr).
- **Upstream**: Kraken WebSocket (primary), Kraken REST API (fallback)
- **Downstream**: Paper Execution Engine, VTS Runner, Signal Orchestrator (ticker data via `getCachedPrice()` — Batch 18), Dynamic Sizing Engine, MicroExecutionService, frontend price display
- **Shared State**: In-memory price map with bucket isolation
- **Execution**: **Event-driven** — updates on WebSocket messages, polled on REST fallback
- **Blast Radius**: **CRITICAL** — every component that uses price data reads from this cache
- **Tests**: None specific

### 2.3 Symbol Normalization
- **File**: `server/exchanges/kraken/kraken.ts` (B78 — moved from `server/services/kraken.ts`) (symbol resolution functions)
- **What**: Translates between DawnTrader internal format and Kraken formats (REST: `XAVAXZUSD`, WebSocket: `AVAX/USD`). BTC ↔ XBT translation.
- **Upstream**: None — utility functions
- **Downstream**: FX5 Scanner, Cost Cache, WebSocket subscriptions, all Kraken API calls
- **Shared State**: None — stateless translation
- **Execution**: Synchronous — on-demand
- **Blast Radius**: **HIGH** — incorrect symbol translation breaks all Kraken communication
- **Tests**: Symbol resolution tests

### 2.4 Market Data REST Polling
- **File**: `server/exchanges/kraken/kraken.ts` (B78 — moved from `server/services/kraken.ts`) (REST API section)
- **What**: Periodic REST calls for ticker, OHLC, asset pairs, depth, trades. Tier A symbols (BTC, ETH, SOL, XRP) updated every 30 seconds. Cache TTLs: 60s (most), 24h (history), 5min (cost metrics).
- **Upstream**: Kraken REST API (external)
- **Downstream**: Volume cache, cost cache, OHLC data for regime classification and analysis
- **Execution**: **Timer-based** — 30s for Tier A, on-demand with caching for others
- **Blast Radius**: **MEDIUM** — affects data freshness but has fallback caching

### 2.5 Cost Cache — (consumer table refreshed B-5.1, 2026-06-12; grep-exhaustive per Langston Step-8; **CHARTER NARROWED P19-B7.2a 2026-07-02**)
- **File**: `server/core/cache/cost-cache.ts` (path corrected B-5.1 — the old `server/services/cost-cache.ts` reference was stale)
- **What**: Per-symbol MEASURED-microstructure cache (spread + slippage), TTL 5 minutes. `setCostMetrics` merges partial writes onto existing entries; `getOrSetCostMetrics` creates a defaults entry on miss (DEFAULT_SPREAD ≥ 0).
- **★ P19-B7.2a (#330) — THE FEE NO LONGER LIVES HERE.** `CostMetrics` dropped `fee`; `resolveCryptoTakerFee()` DELETED (DELETED_COMPONENTS_LOG 2026-07-02); `getCacheStats` reports measured stats only. Every fee consumer composes at READ time from the B-4.5 merge site (`cost-model.getFrictionForAssetClass`), class from each site's own context (market-indicators = fn param; telemetry-aggregator = at-write entry stamp; display readers + the cost-model crypto lane = literal, justified by the cache being structurally crypto-lane-only). The fee-bearing stats shape the 4 production stat readers consume = `cost-model.getCostCacheStatsWithFee` (this file cannot import cost-model — circular). Consequences: the governed fee is un-clampable by construction (MAX_COST_BOUND bounds measurements only), has no TTL (a `fee_model` change is live on the next read), and the cost-drift monitor's fee-delta fires only on a real `fee_model` move. **B81 re-key forward-coupling:** the wrapper's single-class `avgFee` + the telemetry-aggregator two-class ternary must widen at the B81 asset-class re-key (RUNNING_ISSUES #330 pointers).
- **B-5.1 write guard (#223):** negative `data.spread` (crossed/stale book = non-measurement) is dropped at the FIELD level — existing entry keeps prior good spread while sibling fields update; NO existing entry → `setCostMetrics` returns `null`, nothing fabricated (a cache miss is the honest state; a defaults-stamped entry would inflate the friction sampler's n). Zero spread (locked book) accepted. Rejection logged once-per-symbol-per-5min on **stderr → `error.log`** (NOT out.log — Step-8 evidence lesson).
- **Upstream (writers)**: Market Scanner (crypto per-pair prefetch), FX5 Scanner — both via the `setCostMetrics` chokepoint
- **Downstream (readers — all 7 call sites proven miss-safe at call-site level, B-5.1 pre-audit ADDENDUM + Langston independent grep)**:
  | Reader | Site | Miss handling |
  |---|---|---|
  | market-indicators (friction sampler) | :281 | `if (metrics && metrics.spread >= 0)` — skip symbol (B-5 read guard) |
  | telemetry-aggregator | :1402-1410 | null → canonical-symbol retry → `getOrSetCostMetrics` defaults |
  | fx5-scanner (spread audit log) | :1775 | `cachedMetrics?.spread ?? 0.001` — debug only |
  | tec-costs diagnostics | :43-58 | explicit `if (metrics)` else labeled defaults branch |
  | tec-costs diagnostics (2nd site) | :86 | `getOrSetCostMetrics` — never-null defaults path (added to this table per Langston Step-8) |
  | routes diagnostics ×2 | :8508-8523, :8559 | explicit defaults branch / `getOrSetCostMetrics` |
  | cost-model | :179 | `getOrSetCostMetrics` — never-null (cost-model.ts:205 `getCostMetricsCache` is cost-model's OWN map, NOT this cache) |
- **Execution**: **Passive** — populated by scanners, read on-demand
- **Blast Radius**: **MEDIUM** (raised from LOW at B-5.1: the friction sampler that feeds AMR weather reads it — no longer "fallback-only")

### 2.6 OHLC Cache (Batch 18 — NEW)
- **File**: `server/services/ohlc-cache.ts`
- **What**: Centralized OHLC data cache with 5-minute TTL. Wraps `KrakenService.getOHLCData()` with in-memory cache keyed by `symbol:interval`. Bypasses cache for paginated/historical fetches. Periodic cleanup every 10 minutes.
- **Upstream**: Kraken REST API (via KrakenService)
- **Downstream**: Signal Orchestrator (OHLC for regime/indicator computation; `60`-min keys for active-TF classification + `240`-min keys for B68.1 multi-TF agreement higher-TF), VTS Runner (OHLC for strategy detection + BTC candles for defensive_hedge + B68.3 pair correlation reference + B68.1 240-min higher-TF)
- **Shared State**: In-memory cache map, singleton instance (`ohlcCache`)
- **Execution**: **Passive** — populated on first fetch, cached for 5 minutes
- **Blast Radius**: **MEDIUM** — all OHLC consumers route through this cache. Cache miss falls through to Kraken API transparently.
- **Tests**: None specific (validated via integration through signal-orchestrator and VTS)
- **B68.1 update (2026-05-03):** Now serves a SECOND interval per pair (60-min and 240-min keys coexist). 240-min keys consumed by B68.1 multi-tf-agreement emit hooks. ~177 pairs × ~720 candles × 80 bytes ≈ 10MB additional in-memory state. Same 5-min TTL. No code change in `ohlc-cache.ts` itself — the existing `${symbol}_${interval}` cache key generalizes; B68.1 is the first consumer of the 4h interval. Other Kraken-supported intervals available (1, 5, 15, 30, 60, 240, 1440, 10080, 21600 minutes) for future batches without code change.

### 2.7 Asset-Name Resolver (B-NAMES — 2026-06-15, #298 crypto backfill)
- **File**: `server/services/asset-name-resolver.ts` (+ `asset_names` table; `shared/asset-names.ts` overlay; `GET /api/crypto/asset-names` + `/api/internal/asset-name-resolver/stats`)
- **What**: Last-resort backfill of the human-readable crypto token NAME for the Open/Closed Simulated Trades Symbol column, for symbols whose curated `CRYPTO_NAMES` map MISSES or ticker-echoes. **Display-only — NO trading-path impact.** TIER-0 pinned id (`SYMBOL_TO_COINGECKO_ID`, exported from `market-data.ts`) → TIER-1 `/coins/list` symbol→id + NAMED market-cap-gap disambiguation (`DISAMBIGUATION_DOMINANCE_MULTIPLE=5`× + `DISAMBIGUATION_MIN_MCAP_FLOOR_USD=$10M`; lone-candidate accept-on-identity; else skip→hide) → `/coins/markets` name.
- **Upstream**: CoinGecko REST (`/coins/list`, `/coins/markets`; tier-aware auth + B69.3 429-backoff + 1.5s throttle + 24h list cache — shares the env config pattern with `external-macro-feed.ts`); `vts_open_trades` (sweep source = DISTINCT crypto symbols, open + soft-deleted historical); `CRYPTO_NAMES` curated map (skip-if-covered).
- **Downstream**: `asset_names` overlay table (write-through positive + negative-cache with `next_retry_at` backoff) → `GET /api/crypto/asset-names` → client `setCryptoNameOverlay` → `getAssetName` (curated map FIRST, overlay SECOND, hide on miss).
- **Shared State**: module-level `_coinsListIndex` (24h TTL), `_lastCgCallAt` throttle gate, `_stats` two-way counter (ambiguous vs hard_miss + resolved/pinned/errors), `_sweepRunning` guard, `_sweepTimer`.
- **Execution**: **Background** — `startAssetNameResolver()` at boot (`index.ts`, after the universe-discovery cron), first sweep +90s then every 6h. Off the request hot path. **Fail-graceful**: any failure leaves the name hidden; errors do NOT negative-cache (retry next sweep).
- **Blast Radius**: **LOW** — cosmetic display backfill; isolated new table + new endpoints; no trading-path coupling. A TIER-0 pin bypasses the negative-cache backoff so a freshly-pinned id takes effect on the next sweep (Langston Step-4 condition).
- **Tests**: `server/tests/unit/b-names-asset-name-resolver.test.ts` (10 — pure disambiguation accept/skip cases + `getCuratedCryptoName`).
- **Sibling (LANDED 2026-06-15)**: B-NAMES.1 (xStock half of #298) — root-caused the discovery ticker-echo (`XstockSpotEntry.name` now `string|null`; discoverer stores `?? null` not the bare ticker; `xstock_spot_universe.name` dropped NOT NULL) + `CURATED_XSTOCK_NAMES` static map (33 Backed-ETF/foreign-equity symbols Finnhub's profile endpoint misses) wired into the discoverer fallback `override → Finnhub → curated → null`; backfilled the 33 existing rows (`scripts/b-names-1-xstock-name-backfill.ts`). **#298 CLOSED (both halves).**

---

## Layer 3: Scanning & Filtering

### 3.1 Central Clock
- **File**: Core infrastructure (referenced in Phase 3 / Phase 7)
- **What**: 1-second tick source. Emits `ClockTick` events with monotonic counter, timestamp, and drift measurement.
- **Upstream**: System timer
- **Downstream**: FX5 Scanner (every 30 ticks), RTB Refresh (every tick), TCL Watchdog
- **Execution**: **Continuous 1-second interval**
- **Blast Radius**: **HIGH** — all time-dependent subsystems synchronize to this

### 3.2 FX5 Scanner
- **File**: `server/services/market-scanner.ts` (`collectAdaptiveBatch()` function) + `server/services/fx5-scanner.ts`
- **What**: Always-on 30-second market scanner. Multi-stage filtering pipeline: Stage 1 (volume/price), Stage 2 (cost/liquidity), Stage 3 (IMF adaptive), Stage 4 (regime compatibility). Drives pair selection. **Phase 14.5**: Pairs rejected by quant metric filters are re-evaluated against relaxed pattern thresholds and routed to the pattern pool via `activeFilterPool.addPatternPoolSurvivors()`. **Batch 19G**: All filter thresholds now read from DB `screener_filters` table (8 rows: active_quant, active_pattern, vts_quant, vts_pattern per mode). Hardcoded `PATTERN_POOL_THRESHOLDS` config and `pattern-global-filters.ts` no longer used as primary source. **Batch 19G HF1**: Pre-fetches OHLC data for pattern-only pairs that lack cached data, fixing DI=0 rejection at pattern IMF stage.
- **Upstream**: Central Clock (trigger), Kraken REST API (market data), Price Cache, Telemetry Aggregator (performance data for adaptive ratio), DB `screener_filters` table (4-path filter thresholds — Batch 19G), OHLC Cache (pattern-only pair pre-fetch — Batch 19G HF1)
- **Downstream**: Active Filter Pool (quant qualifying pairs + pattern pool pairs — Phase 14.5), Signal Orchestrator (indirectly via both pools), Cost Cache (populates during scan), Stage-3 Emitter (WebSocket events), Data Aggregator (async logging)
- **Shared State**: Screener filter thresholds (from DB `screener_filters` table — 8 rows with columns: filter_path, lq_min, vn_max, corr_max, di_min — Batch 19G)
- **Execution**: **30-second interval** — triggered by Central Clock
- **Blast Radius**: **CRITICAL** — determines which pairs enter the trading pipeline
- **Tests**: Scanner-related tests, filter validation tests

### 3.3 Active Filter Pool
- **File**: `server/services/active-filter-pool.ts` (rewritten in Phase 14.5, Batch 19)
- **What**: In-memory dual-pool staging area. **Quant pool**: pairs passing all FX5 metric filters (5-minute temporal windowing). **Pattern pool** (Phase 14.5): pairs rejected by quant metrics but passing relaxed PATTERN_POOL_THRESHOLDS (volume $250K, LQ≥20, VN≤0.98, DI≥30). Methods: `addSurvivors()` (quant), `addPatternPoolSurvivors()` (pattern), `getPatternPool()`, `getPatternPoolSize()`. Only populated when trading engine is active.
- **Upstream**: FX5 Scanner (populates both pools — quant via `addSurvivors()`, pattern via `addPatternPoolSurvivors()`), Adaptive Ratio Manager (pool split logic)
- **Downstream**: Signal Orchestrator (pulls quant pairs via `getFilteredPairs()`, pattern pairs via `getPatternPool()`)
- **Execution**: **Event-driven** — updated on each scan cycle
- **Blast Radius**: **HIGH** — controls what the Signal Orchestrator can see for both quant and pattern evaluation

### 3.4 IMF Metrics (Adaptive Filters)
- **File**: Computed within FX5 Scanner pipeline
- **What**: Liquidity Quality (LQ), Volume Noise (VN), Correlation, Directional Integrity (DI) metrics. Stage 3 filtering. LQ uses Formula B (log10-based, per-candle OHLC volume — Batch 18G/18J). **Batch 19G**: Filter thresholds now DB-driven — 4 paths per mode (active_quant, active_pattern, vts_quant, vts_pattern) with distinct lq_min, vn_max, corr_max, di_min columns. Previous hardcoded three-tier thresholds in system-guards.ts are DEPRECATED. Pattern IMF uses hybrid architecture: DB defaults for base thresholds + code-driven regime overrides for dynamic adjustment. `system-guards.ts` constants (ACTIVE_IMF_THRESHOLDS, VTS_IMF_THRESHOLDS, PASSIVE_IMF_THRESHOLDS) retained as guardrails only, not primary filter source. **Batch 19G VN**: `calculateVolNoise()` in `analysis-utils.ts` revised from absolute-diff CV (stddev/mean of |close[i]-close[i-1]|) to log-returns MAD/median (median absolute deviation / median of |ln(close[i]/close[i-1])|). VN distribution shifted from ~0.15 center (non-discriminating) to ~0.64 center (meaningful spread). Thresholds calibrated empirically from 300-pair scan: active_quant 0.60, active_pattern 0.68, vts_quant 0.72, vts_pattern 0.80 (updated in DB). VN is compute-time only — not persisted in trade records. Frontend hardcoded VN values removed from diagnostics-tab.tsx and filter-insights.tsx (now read from DB). Downstream consumers (Kalman filter, trailing exit, expectancy kernel) all call the same `calculateVolNoise()` function, so they now receive values on the new 0.5-0.8 scale instead of the old 0.1-0.25 scale.
- **Upstream**: Market data (volume, spread, trading activity), OHLC Cache (per-candle volume for LQ), DB `screener_filters` table (threshold values — Batch 19G)
- **Downstream**: FX5 Stage 3 filtering gate (LQ ≥ threshold, VN ≤ threshold, DI ≥ threshold)
- **Execution**: Synchronous — per-pair during scan
- **Blast Radius**: **MEDIUM** — affects pair eligibility

### 3.5 Adaptive Ratio Manager
- **File**: `server/services/adaptive-ratio-manager.ts` (~298 lines)
- **What**: Dual-pool scheduling — ideal pool (top VTS performers) vs rotational pool (exploration). Typically 60/40 split.
- **Upstream**: Telemetry Aggregator (VTS performance data)
- **Downstream**: Active Filter Pool (pool composition)
- **Execution**: Runs during FX5 scan cycles
- **Blast Radius**: **MEDIUM** — affects pair selection bias

### 3.6 Pair Failure Tracker
- **File**: `server/services/adaptive-ratio-manager.ts`
- **What**: Cooldown blacklist for pairs that failed filters. Normal and extended cooldowns.
- **Upstream**: FX5 filter failure events
- **Downstream**: FX5 scan cycle (excluded pairs)
- **Execution**: Updated on failures, consulted on scans
- **Blast Radius**: **LOW** — affects individual pair eligibility

---

## Layer 4: Signal Generation & Qualification

### 4.1 Signal Orchestrator
- **File**: `server/services/signal-orchestrator.ts`
- **What**: Primary signal generation engine. **Dual-path** (Phase 14.5): (1) Quant path — pulls pairs from Active Filter Pool quant pool, generates signals using all regime-compatible strategies. (2) Pattern path — pulls pairs from Active Filter Pool pattern pool, evaluates PATTERN + HYBRID strategies only via PatternRecognizer.scanPatterns(). Both paths apply exposure/correlation/cooldown checks, compute FinalScore and EV gate. Passes `sourcePool`, `signalType`, `assetClass` to SQE and RTB.
- **Upstream**: Active Filter Pool (quant pairs + pattern pairs — Phase 14.5), Market Regime (regime classification via `calculatePairRegime()`), Cost Model (friction), quality_index (deterministic confidence — NGC replaced), SYSTEM_GUARDS config, OHLC Cache (60-min candles via `ohlcCache.getOHLCData()` — Batch 18), Price Cache (ticker data via `priceCache.getCachedPrice()` — Batch 18), PATTERN_POOL_STRATEGIES config (Phase 14.5), ranking-weights.ts (Phase 14.5)
- **Downstream**: SQE (scored signals with sourcePool metadata), RTB Queue (qualified signals with rankingScore + identity tuple), VTS Runner (mirrors scoring logic), Telemetry (signal metadata)
- **Shared State**: SYSTEM_GUARDS config, DI calculation (~~BUG-004~~ **RESOLVED**), deterministic confidence (~~NGC contamination~~ **RESOLVED** — Directive 12.3.3)
- **Execution**: **Event-driven** — triggered when pairs enter Active Filter Pool
- **Blast Radius**: **CRITICAL** — every signal in the system flows through here
- **Contamination**: ~~NGC→DI (BUG-004)~~ **RESOLVED**, ~~dual friction (RISK-009)~~ **RESOLVED**, ~~legacy DSS routing (BUG-006)~~ **RESOLVED** (Directive 12.3.1)
- **Tests**: `signal-scoring.test.ts`, `runtime_signal_consistency.test.ts`, `finalScore-kernel.test.ts`
- **Batch 57**: Pattern-strategy mismatch fixed — `buildPatternInputForStrategy()` ensures each strategy receives only its matching pattern instead of the global best. Previously all strategies received the single globally-strongest pattern, causing massive "No Pattern Detected" nulls.
- **P19-B4a (2026-06-14):** three new responsibilities at the `buildSizedSignalForStrategy` chokepoint — see the dedicated "Recent Additions (P19-B4a)" section below. (1) **Stamp-at-source (C1):** `SizingContext.assetClass` is now a REQUIRED field and the SINGLE source of truth for asset class on the active build path; the ~9 symbol-derived sites in `buildSizedSignalForStrategy` read `sizingContext.assetClass` instead of re-deriving via `resolveAssetClass(symbol)` (wrong-by-construction for the 17 collision tickers). (2) **External-dispatch seam (C2):** new public `dispatchExternalSignal(rawSignal, strategyId, sizingContext, marketContext)` wraps the private build for the xStock active path. (3) **Strategy gate (C5):** a DB-resolved per-class `isStrategyEnabledForAssetClass` gate fires at the chokepoint right after the stamp-missing throw; the old hardcoded `enabledStrategies` Set + its two public methods were disposed (DELETED_COMPONENTS_LOG).
- **P19-B6.5c (2026-06-17, pattern-pool strategy naming):** the pattern-pool emitter now resolves a detected pattern to its CANONICAL consuming strategy via `resolvePatternConsumingStrategy(regime, detectedPattern, assetClass)` (`canonical-regime-strategy-map.ts`) — **EXACT-MATCH-OR-DROP**: the pattern routes to the canonical strategy whose declared `patternType` matches it in the current regime + asset class; if no consuming PATTERN/HYBRID strategy exists there, the pattern signal is DROPPED (counted via `getPatternNoMatchDropStats()`, logged `[PATTERN_NOMATCH_DROPS]`) rather than mislabeled. **This REPLACED the prior bug** where the recognizer fabricated invalid `pattern_<name>` strategy strings (e.g. `pattern_abcd`) — not valid `strategy_type` enum values — that were rejected at the RTB insert (the 8,503-drop pattern-pool break). The resolution is **regime-dependent** (e.g. PINBAR→`reverse_impulse` in HIGH_VOLATILITY_UNSTABLE, →`support_bounce` in RANGE_BOUND_STABLE; ABCD→`volatility_edge` in IMPULSE_EXPANSION, dropped elsewhere — note ABCD feeds `volatility_edge`, NOT the `abcd_long` quant strategy). It is strictly ADDITIVE — the shared `selectContextAwareStrategy` fallback resolver (VTS + xStock) is UNCHANGED. **Redundant pattern-emission loop REMOVED:** a duplicate pattern-emission loop in the orchestrator was deleted — the `activeStrategies` dispatch already evaluates every pattern-consuming strategy via its `detect*()` + `buildPatternInputForStrategy`, so the second path was dead duplication.

### 4.2 Signal Quality Evaluator (SQE)
- **File**: `server/core/filters/signal_quality_evaluator.ts`
- **What**: Final signal gatekeeper before RTB. Evaluates FinalScore, RegimeWeight (≥ 0.30), regime-aware ROI check, and confidence floor (Phase 14.1 HF8). **Phase 14.5**: FinalScore threshold is now sourcePool-aware — quant signals use 0.35 (default), pattern-pool signals use elevated 0.45 (PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR). `sourcePool` field added to SQEInput interface. VTS signals skip confidence floor via `skipConfidenceFloor` option (cold-start bypass). SQE is sole FinalScore authority.
- **Upstream**: Signal Orchestrator (scored signals with `sourcePool` metadata — Phase 14.5), PATTERN_POOL_GUARDRAILS config
- **Downstream**: RTB Service (only passing signals enter queue)
- **Execution**: Synchronous — per signal
- **Blast Radius**: **HIGH** — controls which signals can become trades

### 4.3 RTB Service (Ready-to-Buy Queue)
- **File**: `server/core/rtb/ready_to_buy_service.ts`
- **What**: Signal queue with 30-second TTL. Refreshes every 1 second to check TTL expiration. Promotes ready signals to TCL. **Phase 14.5**: `getTopSignal()` now ranks by `rankingScore` (from metadata) instead of FinalScore alone. FinalScore gap safety rule: if gap > 0.10 between two signals, FinalScore wins (prevents return-magnitude gaming). Signal insertion enriches metadata with `sourcePool`, `signalType`, `assetClass`, `rankingScore` identity tuple. SQESignalInput interface extended with Phase 14.5 fields. **P19-B3b (2026-06-14, landmine #2):** `SQESignalInput` now REQUIRES `riskScore` + `profitRate` (the orchestrator never set them → `queueSQESignal` threw on `.toString()` → the orchestrator's fire-and-forget `.catch` swallowed it → EVERY SQE-qualified signal silently dropped when active-paper turns on). `queueSQESignal` reads `confidence` (NGC retired, Directive 12.3.3); the dead `ngc:` insert removed (`rtb_signals` has no ngc column). NEW observable surface: `recordQueueFailure()`/`getQueueFailureStats()` — a non-zero `count` means qualified signals are being dropped before the queue (the orchestrator catch increments it + logs `[RTB_QUEUE_DROP][CRITICAL]`); exposed for health/diagnostics so the next regression of this silent-drop shape is caught by a metric. **P19-B6.5c (2026-06-17, schema reconciliation):** the `rtb_signals` table no longer has a `cwqi` column. The column had been removed from code long ago (documented in `legacy/metrics_archive.ts`; absent from `shared/schema.ts`) but a leftover NOT-NULL-no-default `cwqi` (numeric) still existed on the staging DB — so every Drizzle insert (which no longer sends `cwqi`) was rejected by the DB, dropping 100% of crypto signals at the ready-to-buy insert. DROPPED via migration `2026-06-17-p19-b6-5c-drop-rtb-cwqi.sql` (tested rollback + MANIFEST + DELETED_COMPONENTS_LOG). Written as a migration (not a one-box `ALTER`) so the drift reconciles on any environment. **Per-class crypto isolation holds at this insert:** xStock signals do not leak into a `crypto_spot` active run — proven in the B6.5c gate-10 crypto-only dry-run. **reorg-B3 (#233, 2026-06-24 — EV-input thread, cross-cutting):** the Net-Expectancy kernel inputs `DI` + `dbsScore` are now carried as **typed `rtb_signals` columns `di_at_queue` / `dbs_score_at_queue`** (DECIMAL(8,4) nullable; migration `2026-06-24-p19-reorg-b3-rtb-ev-inputs.sql`), NOT in `metadata`. Data-flow (cross-cutting state, three hops): **(1) `active-filter-pool.ts` `ActiveFilteredPair`** now carries `di` alongside the existing `dbsScore` (both the routing-time FX5 survivor snapshot; `addSurvivors` accepts `DI`, `getFX5DataForSymbol` exposes both — additive); **(2) `signal-orchestrator.ts buildSizedSignalForStrategy`** reads the pool entry once + writes the two scalars to the new columns via `SQESignalInput.diAtQueue/dbsScoreAtQueue` → `queueSQESignal` persists them; **(3) `active-execution-engine.ts checkRtbPromotion`** carries them (parsed string→number) **+ `sourcePool`** onto the promoted `StrategySignal` (FIND 1: the conversion previously DROPPED `sourcePool`, so the kernel strong-trend branch never fired for promoted signals — see CHANGES_AND_FIXES FIX-2026-06-24-A), and the open-gate `evaluateTradeExpectancy` reads `signal.diAtQueue/dbsScoreAtQueue ?? undefined` (no metadata fallback, no coerce → kernel documented defaults on null). OBSERVABILITY: `rtb-metrics-service` gains the `evInputThreadProof` EV-input proof surface on `GET /api/diagnostics/rtb-metrics` (forward-instrumentation, empty until paper-active turns on). xStock writes NULL (no crypto FX5 source → kernel floor; #377). The endpoint subset-map drop (#379) + the `di_at_open` const-50 (#378) are homed.
- **Upstream**: SQE (qualified signals), Central Clock (1-second refresh), ranking-weights.ts (FINAL_SCORE_GAP_OVERRIDE — Phase 14.5)
- **Downstream**: TCL (promoted signals with enriched metadata)
- **Execution**: **1-second interval** via Central Clock
- **Blast Radius**: **MEDIUM** — affects signal aging, selection timing, and cross-family ranking

### 4.4 TCL Watchdog (Trade Candidate List)
- **File**: `server/startup/trading-bootstrap.ts`
- **What**: Ranks candidates by FinalScore. Triggers on 2-minute timeout or 15-signal accumulation. 1.5-second monitoring loop.
- **Upstream**: RTB Service (promoted signals), TRADE_CLOSED events
- **Downstream**: Paper Execution Engine (ranked candidates)
- **Execution**: **1.5-second loop** + event-driven + 2-minute failsafe
- **Blast Radius**: **MEDIUM** — affects trade selection timing

---

## Layer 5: Regime Classification

### 5.1 calculatePairRegime() — CANONICAL (ACTIVE, redesigned B62; xstock_spot validated B-XSTOCK-CALIB B.1 2026-05-28)
<!-- B-XSTOCK-CALIB B.1 (2026-05-28): archive-replay against 2,658 xStock bars / 260 symbols confirmed
     regime distribution within design envelope (HVU 25.0% / IE 11.6% / RBS 8.8% / ST 36.5% / TFS 18.2%).
     TFS confidence p95=0.70 compression near floor is multiplicative-formula design intent. No
     threshold adjustments to `regime-thresholds.ts` or `module_constants.regime_classifier.xstock_spot.*`.
     See `Claude Comms and Packages/Cross-Session Briefs/B_1A_DISTRIBUTION_ANALYSIS.md`. -->

- **File**: `server/core/metrics/market-regime.ts`
- **What**: Canonical pair-level regime classification. **B62 Design B:** `calculatePairRegime()` now accepts `dbsScore` parameter as primary classification input. DBS-integrated classifier eliminates drift contamination (RBS 70% → 0%). 5 regimes (TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION). Uses DBS score + volatility + momentum + DX. DX thresholds recalibrated for crypto in HF7 (25 to 45/50/55/60).
- **Upstream**: OHLC price data (60-min candles from both VTS and orchestrator — aligned in HF8), **DBS score (from directional-bias.ts via MCE — B62, new upstream feeder)**
- **Downstream**: VTS Runner (heavy use via MCE), Signal Orchestrator (via MCE — **WIRED**, Phase 13 Batch 14)
- **Execution**: Synchronous — called per pair via MCE. **MCE computes DBS before regime (B62 ordering swap).**
- **Blast Radius**: **HIGH** — regime determines strategy selection
- **Status**: **ACTIVE** — sole pair-level regime authority for both VTS and active trading (~~BUG-006~~ RESOLVED, Batch 13). DX thresholds recalibrated for crypto in HF7 (`64014bd2`). **Code freeze LIFTED (B62).** DBS-integrated classifier deployed to staging and **verified 2026-04-19** across 174k MCE samples: RBS drift contamination 0.00%, TFS+IE 46.19%, RBS 14.4%, IE 3.2%. Primary B62 objective met.
- **⚠ Phase 15b audit finding (2026-04-14):** The pre-B62 classifier used vol + ADX + momentum thresholds but had **no directional drift check**. Result: 54.5% of pairs labeled `RANGE_BOUND_STABLE` while only ~8% had truly neutral momentum — the other 47% were drift-contaminated false ranges, bleeding `range_trade` (76% loss rate). **B62 fix:** DBS score is now the primary classification input, eliminating drift contamination. RBS drift contamination 70% → 0%. TFS+IE share 14% → 36.5%.

### 5.1b calculateDBS() / getPairDirectionalBias() / getGlobalDirectionalBias() — LIVE (consumed by regime classifier, B62)
- **File**: `server/core/metrics/directional-bias.ts`, `server/types/directional-bias.types.ts`
- **What**: Directional Bias Score (DBS) — composite formula `0.40×slope + 0.35×return + 0.25×EMA_alignment`, ATR-normalized. 7 categories (UP_STRONG through DOWN_STRONG). Per-pair DBS plus global DBS (weighted median of pair DBS by 24h volume). `biasConfidenceModifier` defined in types file (aligned 1.05–1.15×, opposing 0.70–0.85×, neutral 1.0×).
- **Upstream**: OHLC candles (60-min), ATR (from MCE), EMA chain (from MCE)
- **Downstream consumer sites (corrected 2026-04-15 post-Phase-3a-grep, B61):** Two source references exist. Both were originally claimed as "orphan" but were re-classified by the Phase 3a consumer grep as **dormant wire** and **no-op half-wire**. Neither has ever applied DBS to a captured decision.
   - **`server/services/signal-orchestrator.ts:454` — DORMANT CONSUMER WIRE.** Imports `computeBiasConfidenceModifier` at L89. At L448–467 the code computes `dbsModifier`, multiplies `extendedMetrics.confidence` by it, and recomputes `finalScore`. Shipped 2026-03-05 22:08 UTC in commit `c28f0df`, same day as DBS module creation (commit `5bfa63b`, 11:56 UTC). **Never executed against any captured cycle** — active trading has been continuously OFF since at least 2026-01-12 (verified against zero rows in `trades`, `paper_trades`, `closed_trades` and audit_log latest timestamp 2026-01-12 19:05 UTC, seven weeks before DBS integration). The L448 comment `// (parity with VTS path)` is doubly incorrect: VTS has no applying behavior to achieve parity with, and the orchestrator path has not run at all. See burial-pattern note below.
   - **`server/services/vts-runner.ts:877` — HALF-WIRED DEAD CODE.** Imports `computeBiasConfidenceModifier` at L67. At L875–877 computes `biasModifier = computeBiasConfidenceModifier(biasCategory)`; the result is never referenced again anywhere in the file. Every VTS-emitted trade across the 15-day B61 audit window has `biasModifier` computed and immediately discarded.
- **Other DBS references (pre-B62 Phase 3a grep, SUPERSEDED — see post-B63 status below):** `directional-bias.ts` + `directional-bias.types.ts` (emitters/types); `market-context-engine.ts` (PRE-B63: computed DBS; POST-B63: CONSUMES propagated DBS, no longer computes); `market-indicators.ts` L291–305 (reads MCE DBS, caches `globalDBS` category); `vts-runner.ts` (writes `pairDirectionalBias`/`globalDirectionalBias` into trade metadata — passthrough); `telemetry-repository.ts` (passthrough); `routes.ts`, `analytics.tsx`, `machine-learning.tsx` (UI display); `export-csv.ts`, `shared/schema.ts`, `frictionColor.ts` (metadata helpers).
- **B62 UPDATE (CONFIRMED LIVE):** Regime classifier (`calculatePairRegime(ohlcData, dbsScore)`) CONSUMES DBS as primary input. RBS requires |DBS|<0.10, TFS admits |DBS|≥0.30, IE admits |DBS|≥0.50 + vol. Prior "NOT consumed by regime classifier" text was pre-B62 and stale.
- **B63 UPDATE (CONFIRMED LIVE 2026-04-20):** DBS computation MOVED from MCE to FX5 scanner pre-filter. DBS is now a HARD PIPELINE CONTRACT — no fallback, no recompute. DBS is a ROUTING key (|DBS|≥0.35 positive routes exclusively to quant-strong_trend family / path 6). DBS is a STRATEGY entry gate (strong_bull_trend requires DBS≥0.35 + slope rising). DBS is a STRATEGY exclusion gate (morning_star, reverse_impulse, volatility_edge, defensive_hedge, vwap_pullback all self-exclude when dbs≥0.35 — belt-and-braces for Path D routing). DBS is a PATH-AWARE NET EV input (pWin = 0.40 + |DBS|/2 for quant-strong_trend sourcePool, replacing DI-based formula). **Not consumed by:** SQE FinalScore floor (path-blind confirmed in score-chain audit), PredictiveConfidence (regime×strategy winRate only), RegimeWeight (signal-level vol only), RTB ranking (pure FinalScore descending).
- **B63 Items 10-14 + 16 UPDATE (CONFIRMED LIVE 2026-04-21):** Five additional layers added on top of B63 core.
  - **Item 10 (counter-trend LONG guard)** — mirror of Item 6's positive-DBS exclusion. All 5 LONG-only strategies (morning_star, reverse_impulse, defensive_hedge, sma_trend_ride, vwap_pullback) now return null with reason `b63b_counter_trend_long_exclusion` when `dbsScore <= -0.35`. Eliminates the 94-trade mirror defect identified in BATCH_63_COUNTERFACTUAL_AUDIT.
  - **Item 11 (`vwap_pullback` strong-trend lane promotion + lane arbitration)** — NEW `MULTI_FAMILY_ELIGIBILITY` map in `server/config/canonical-regime-strategy-map.ts` makes `vwap_pullback` eligible in both `trend` (primary) and `strong_trend` (additional) families. Family-eligibility gate in vts-runner OR's primary + additional membership. First-claim-wins lane arbitration added in vts-runner (above Batch 19G duplicate guard): when `sourcePool === 'quant-strong_trend'` and another strong-trend-lane strategy already has a trade open on this pair, return null with reason `strong_trend_lane_conflict`.
  - **Item 12 (strong-trend geometry override plumbing)** — NEW optional `strongTrendGeometryOverride: { stopAtrMultiplier, targetAsRMultiple }` field on `TechnicalIndicators`. `vts-runner.ts` attaches `{ 4.0, 3.0 }` (Variant E per audit) at call site when `sourcePool === 'quant-strong_trend'`. `detectVWAPPullback` consumes the override to produce 4×ATR stop and 3R target. `strong_bull_trend` ignores the field (uses locked native constants). Contract test: `server/tests/unit/b63-item12-geometry-override.test.ts` (4 tests passing in CI).
  - **Item 14 (mode-overlay lane bypass)** — `vts-runner.ts` (~L1086) and `active-execution-engine.ts` (~L2165) both now conditionally skip mode-overlay multipliers when `sourcePool === 'quant-strong_trend'`, using native stop/target distances. Fixes silent 2:1 → 1.33:1 (DEFENSIVE) or 0.8 (SURVIVAL) RR destruction on every pre-fix strong-trend trade. Reversal/continuation archetypes retain mode-overlay as designed — bypass is scoped to the strong-trend lane only.
  - **Item 16 (global DBS persistent store + atomic snapshot)** — see new §5.1c below. Pre-B63 computeGlobalBias (opportunistic cache read + 70% coverage gate) replaced with deterministic per-pair store + end-of-cycle atomic snapshot + fixed 20-pair floor + explicit 5-row behavior spec. MCE `computeGlobalBias()` now delegates to the store.
- **Execution**: Synchronous — `calculateDBS()` called per pair per MCE cycle (60s). Consumer sites execute only when their host paths run (signal-orchestrator: never during B61; vts-runner: every VTS strategy evaluation, result discarded).
- **Blast Radius**: **CURRENTLY ZERO applied.** Potential HIGH — once any consumer path is actually exercised with an applied modifier, DBS touches regime classification, strategy selection, filter layer, entry gates, exit triggers.
- **Status**: **LIVE — consumed by regime classifier (B62).** DBS is now the primary input to `calculatePairRegime()` via MCE. Both dead code paths removed: signal-orchestrator.ts:454 dormant wire REMOVED, vts-runner.ts:877 half-wire REMOVED. `sentinelZero` field added to DBS output (flags zero-volume pairs for coverage gating). VTS benchmark exclusion filter removed. Previously DORMANT-WIRE + HALF-WIRE through B61. Re-classified during Phase 3a codebase consumer grep (2026-04-15, B61). B62 completed the integration that B61 validated.
- **⚠ Governance framing (corrected 2026-04-15):** Not "DBS is orphaned" (ambiguous and partly false — imports existed). Not "DBS has been silently shaping signals" (also false — active trading has been off). The correct framing is **"dormant wire on orchestrator, no-op half-wire on VTS, both buried under ambiguous orphan language."** The governance failure is that the prior SIM entry said "NONE" and "never imported anywhere" — operationally true for captured decisions during the DBS era, but false as a code-path inventory claim. Every future review must check both runtime consumer behavior AND source-level imports, not conflate them.
- **⚠ Burial pattern — false parity claim (case study for future reviews).** The `signal-orchestrator.ts:448` comment `// (parity with VTS path)` asserts consistency with a sibling path that is itself dead code. The sibling (`vts-runner.ts:877`) computes the modifier and discards the result, so there is no "parity" to achieve — the parity claim is fictional. Future reviews should specifically flag comments that assert consistency with another code path without verifying the other path actually does what the comment claims. This is a named burial pattern: **false parity claim between two broken paths.**
- **Code freeze:** LIFTED (B62). `directional-bias.ts` and `market-regime.ts` both modified in B62 as part of DBS-integrated classifier redesign. Previous freeze was in effect through B61 audit.
- **Simulation evidence (2026-04-14):** DBS-based classifier redesign produces `TREND_FRIENDLY_STABLE` 19.3% → 55.7%, `RANGE_BOUND_STABLE` 54.5% → 3.4%. Live DBS distribution: 55.7% of pairs UP_MODERATE or stronger, only 4.5% NEUTRAL. See `Claude Comms and Packages/Scope Files/REGIME_DBS_STRATEGY_AUDIT_SCOPE_2026-04-14.md`.
- **✅ Operational takeaway:** The 15-day VTS audit window (2026-03-31 → 2026-04-14, ~960 closed VTS trades) is DBS-clean. No captured trade has been modified by DBS. The B59 `range_trade` investigation and the planned B61 A.1/A.2/A.4 Final measurements run against uncontaminated data. B61 measurement integrity is intact.

### 5.1c Directional Bias Store — (NEW, B63 Item 16, shipped 2026-04-21)
- **File**: `server/core/metrics/directional-bias-store.ts` (NEW, ~200 lines), singleton export `directionalBiasStore` + convenience accessor `getLatestGlobalDbsSnapshot()`.
- **What**: Persistent per-pair DBS store + end-of-cycle atomic snapshot + fixed 20-pair floor. Replaces the pre-B63 opportunistic-cache-read approach (MCE walked its own cache each call and applied a 70% coverage gate that could silently flip between NEUTRAL and computed values within a cycle).
- **Types**: `PairStoreEntry { score, timestamp, sentinelZero, volume }`; exported `GlobalDbsSnapshot { value, snapshotTime, coverage, isStale }`.
- **Constants**: `GLOBAL_DBS_MIN_SAMPLE_COUNT = 20` (exported); `PAIR_HARD_EXPIRY_MS = 5 * 60 * 1000` (internal).
- **Methods**:
  - `updatePair(symbol, score, sentinelZero, volume)` — called by MCE inside `computeContext` each time a pair's DBS is computed.
  - `publishSnapshot()` — sweeps hard-expired entries, applies 20-pair floor, computes + caches atomic snapshot. Implements all 5 behavior-spec rows. Returns `GlobalDbsSnapshot | null`.
  - `getLatestSnapshot()` — returns cached snapshot; `null` on cold start. Returns same object REFERENCE across multiple reads until next `publishSnapshot()`.
  - `getStoreSize()` — diagnostic.
  - `clear()` — tests only.
- **5-row behavior spec (exact semantics):**
  1. Empty store + no prior snapshot → `null` + log `[GlobalDBS][coldStart] snapshot unavailable, store has 0 pairs, floor 20; returning null`
  2. Below floor + prior snapshot exists → last good snapshot with `isStale: true` + log `[GlobalDBS][degradedCoverage] serving stale snapshot, liveStore=N, floor=20`
  3. Below floor + no prior snapshot (store has 1..19 pairs) → `null` + log `[GlobalDBS][noSnapshot] store below floor (N) and no prior snapshot; returning null`
  4. Non-finite compute (NaN) + prior snapshot → stale prior + log `[GlobalDBS][invalidCompute] kept prior snapshot (current compute produced non-finite score=X)`. Non-finite + no prior → `null` + same log family.
  5. Happy path (≥ 20 pairs + valid compute) → fresh snapshot with `isStale: false`; no log (normal operation).
- **Upstream**: MCE `computeContext` writes via `updatePair`.
- **Downstream consumers**: MCE `computeGlobalBias()` (reads via `publishSnapshot()`), `market-indicators.ts` (transitively through MCE), future UI endpoints exposing global DBS + stale flag.
- **Execution**: Per scan-cycle. `updatePair` is O(1) per pair. `publishSnapshot` sweeps expired entries + calls `computeGlobalDirectionalBias` under the hood.
- **Blast Radius**: **HIGH** — all global-DBS consumers read from this single source. But behavior is deterministic and explicitly fails (`null` / `isStale: true`) rather than silently degrading.
- **Status**: **LIVE** — shipped 2026-04-21 in commit `a4f5dbe0` (Stage 16). PM2 #81 restart. Cold-start log at T+3s; first valid snapshot at T+63s (pairs=33). Zero `degradedCoverage` / `noSnapshot` / `invalidCompute` / `Serving STALE` lines observed in 15+ minutes of normal operation post-warm-up.
- **In-memory only for B63** — DB-backed persistence deferred to B64+ per Langston's pre-audit resolution. Cold-start warmup is acceptable.
- **Tests**: `server/tests/unit/b63-item16-dbs-store.test.ts` — 11 contract tests, all passing. Includes fake-timer-driven Row 2 test (populate → publish → advance 6min → repopulate below floor → assert stale carry-forward with exact prior value + coverage + snapshotTime).
- **Governance principle**: `null` and `isStale: true` are DIFFERENT states. Consumers that need to distinguish "no snapshot available" from "stale snapshot" must handle both. Never substitute zero/default for `null`.
- **Reference**: `BATCH_63_SCOPE.md` Item 16; `BATCH_63_PRE_AUDIT.md` §13 Item 16; CHANGES_AND_FIXES `DBS-B63-ITEM16-001`.

### ~~5.2 DSS~~ — **DELETED** (Batch 17, HF9 `f9fa56c6`)
- **File**: ~~`server/services/dynamic-strategy-selector.ts`~~ **FILE DELETED**
- **What**: ~~Legacy classifier.~~ Was rewired to canonical map in Batch 13, then **fully deleted** in Batch 17 (HF9). Superseded by MCE regime filtering + StrategyEngine detect functions.
- ~~**Upstream**: OHLC price data~~
- ~~**Downstream**: Signal Orchestrator~~
- **Blast Radius**: **ZERO** — completely removed. Signal orchestrator uses inline NetEV > 0 filter. All DSS imports purged from signal-orchestrator, telemetry-aggregator, market-events.
- **Status**: **DELETED** — ~~BUG-006~~ RESOLVED (Batch 13 rewire → Batch 17 deletion)

### 5.2.5 Market Context Engine (MCE) — (Phase 13, Batch 14; updated Phase 14.5, Batch 19)
- **Files**: `server/services/market-context-engine.ts` (~320 lines), `server/types/market-context.ts` (~80 lines)
- **What**: Centralized market indicator and regime computation service. Computes VWAP, SMA, ATR, volatility, momentum, ADX and regime classification in a single pass per symbol. Singleton with 60-second cache TTL. Does NOT fetch data — callers provide OHLC. **B-4.7 (2026-06-11)**: the Phase-14.5 mixed-class `getDominantRegime()` is DELETED — replaced by `getDominantRegimeForClass(assetClass)`: majority vote over cache entries whose `${symbol}:${assetClass}` key matches the class, MIN_CLASS_VOTE_PAIRS = 5, **null below threshold** (CLASS_IDLE — weekend boundary / US holiday / cold start; xStocks trade 24/5). `getAllowedStrategies(assetClass, regime)` reads the per-class canonical tree. market-indicators.ts consumes per class with voteStatus LIVE|IDLE_OR_WARMING. ⚠️ `getGlobalFriction(assetClass)` in market-indicators serves a cached value with NO staleness marker — after a class goes NO_SAMPLE the cache holds the pre-idle value; bounded today (no opens while idle + 30s recompute on resume) but a silent stale-hold for any future out-of-band consumer (Langston diff-A note).
- **Upstream**: OHLC data (provided by callers), `calculatePairRegime()` from market-regime.ts, `CANONICAL_REGIME_STRATEGY_MAP`
- **Downstream**: Signal Orchestrator (active trading path — indicators + regime + allowed strategies + pattern pool evaluation — Phase 14.5), VTS Runner (passive learning path — regime + raw Z-score data), market-indicators.ts `getMarketIndicators()` (global dominant regime — Phase 14.5)
- **Shared State**: Per-symbol context cache (60s TTL), singleton instance
- **Execution**: Synchronous — called per symbol per cycle by orchestrator (60s) and VTS (60s). `getDominantRegime()` iterates cache on-demand.
- **Blast Radius**: **HIGH** — all regime classification and indicator data flows through MCE. Global regime now derived from MCE cache population.
- **Status**: **ACTIVE** — installed Batch 14 (`8f26369a`), extended Batch 19 (`getDominantRegime()`), extended B62 (DBS-before-regime ordering, `getCachedVolumes()`, coverage gate). Resolves RISK-002 (indicator duplication).
- **Tests**: Zero direct MCE test files yet. Validated via integration through signal-orchestrator and VTS.
- **B62 updates (2026-04-16):** MCE now computes DBS before regime classification (ordering swap). New `getCachedVolumes()` method provides 24h volume data for global DBS computation. Coverage gate added — global DBS requires minimum pair coverage before being treated as decision-grade. DBS score passed as parameter to `calculatePairRegime()`.
- **B63 Item 16 update (2026-04-21):** MCE no longer walks its own cache to compute global DBS. Instead: (a) `computeContext()` now calls `directionalBiasStore.updatePair(symbol, score, sentinelZero, volume24h)` after computing each pair's directionalBias. (b) `computeGlobalBias()` delegates to `directionalBiasStore.publishSnapshot()` and returns `snapshot.value` (or NEUTRAL/pairCount=0 on `null` for backward compat with legacy callers). Pre-B63 70%-coverage-gate constant renamed to `GLOBAL_DBS_MIN_COVERAGE_PCT_DEPRECATED` as rollback marker; no longer consulted. Legacy `volumes` parameter on `computeGlobalBias` retained as `_volumes` for back-compat (now ignored — volumes are tracked INSIDE the store via `updatePair`). See §5.1c for store details.
- **B61 Instrumentation (2026-04-15):** Three observational telemetry emitters added, feature-flagged on `DT_PHASE15B_DBS_TELEMETRY=1`: (1) MCE cycle-sampled emitter writes per-pair DBS + regime + indicators to `logs/phase15b_dbs_telemetry/YYYY-MM-DD.jsonl` every 60s cycle. (2) Signal-orchestrator dormant-wire emitter at L454 — **REMOVED in B62** (dead code path deleted). (3) VTS half-wire emitter at `vts-runner.ts:877` — **REMOVED in B62** (dead code path deleted). MCE cycle emitter (1) remains active.

### 5.3 ~~MCP/ARE~~ — **REMOVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Files**: ~~`server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`~~ DELETED
- **What**: ~~Predecessor regime system. Own T1-C1 taxonomy, strategy mix matrix, exposure/risk multipliers. Feeds 14+ services.~~ Removed along with all 14+ L12-L20 consumer services. Replaced by MCE.
- **Blast Radius**: **NONE** — completely removed
- **Status**: COMPLETE — entire L12-L20 cluster deleted (17 services + 9 routes + 2 utilities)

### 5.4 getNormalizedRegime() — Advisory
- **File**: `server/core/metrics/market-regime.ts` (same file as 5.1)
- **What**: Z-score normalized regime classification. Advisory only, not used for routing. Preserved for future ML.
- **Downstream**: VTS Runner (advisory logging)
- **Blast Radius**: **LOW** — advisory only

### 5.5 getMarketIndicators() — Global Regime Sourcing (Updated Phase 14.5, Batch 19)
- **File**: `server/services/market-indicators.ts`
- **What**: Returns current market indicators including dominant regime. **Phase 14.5**: Now mode-aware — uses MCE `getDominantRegime()` when MCE cache has ≥5 pairs (active mode or warm cache), falls back to VTS telemetry `getDominantRegime()` when MCE is cold (passive mode). Previously always used VTS telemetry.
- **Upstream**: MCE singleton (Phase 14.5 — primary), Telemetry Aggregator (fallback)
- **Downstream**: Signal Orchestrator (market indicators), ranking context bonus computation. **B-XSTOCK-GLOBALS (2026-06-18):** the per-class cache `getMarketIndicators()` populates each cycle (`cachedGlobalRegime/Friction/DBSCategory/Score`, read via `getCurrentRegime / getGlobalFriction / getLastGlobalDBSCategory / getLastGlobalDBSScore`) is now ALSO consumed by the **xStock VTS open-path** — `xstock_spot/eval-cycle.ts` xOpenTrade reads these AT OPEN to stamp the trade's at-open global regime/friction/DBS, mirroring the crypto inline stamp at `vts-runner.ts:1561-1576`. Previously the xStock caller never passed them (B-4.7 made `registerOpenVtsTrade` caller-pass-only) → xStock VTS rows persisted blank globals. Telemetry-completeness, non-architecture. The blank-while-LIVE guardrail tripwire is a §13 follow-up (a centralized witness in `registerOpenVtsTrade`).
- **Blast Radius**: **MEDIUM** — affects global regime determination which influences ranking context bonuses

---

## Layer 6: Execution

### 6.1 Paper Execution Engine — PRIMARY
- **File**: `server/services/active-execution-engine.ts` (~2,308 lines)
- **What**: Authoritative execution engine. Handles order lifecycle, position management, exit logic (trailing stop, target, stop loss, max hold). **Batch 19E**: Persists `sourcePool` from signal metadata on trade creation and position opening (written to `closed_trades.source_pool` and `active_open_positions.source_pool` DB columns).
- **Upstream**: TCL (ranked candidates), Price Cache (current prices), Guardrails V2, Pre-Execution Validator, Net Expectancy Kernel, Signal metadata (sourcePool — Batch 19E)
- **Downstream**: Portfolio state (DB — including sourcePool column, Batch 19E), trade history (DB — including sourcePool column, Batch 19E), Telemetry, WebSocket broadcasts, TRADE_CLOSED events
- **Shared State**: Portfolio position tracking, open trade state
- **Execution**: **1.5-second monitoring loop** + signal-driven entry
- **Blast Radius**: **CRITICAL** — this executes every paper trade

### 6.2 Trading Engine (Live) — DORMANT
- **File**: `server/services/trading-engine.ts` (~766 lines)
- **What**: Live-capable engine with placeholder code. Contains simulated fills (Math.random), goal alignment, legacy signal orchestration.
- **Status**: DORMANT — defer rebuild until paper mode stable
- **Blast Radius**: **LOW** (currently not executing trades)

### 6.3 Dynamic Sizing Engine (DSE) / Paper Position Sizing
- **Files**: Referenced throughout Phase 5; `server/services/active-position-sizing.ts` (concrete implementation)
- **What**: Position sizing based on edge, confidence, ATR, volatility. Hard cap: MAX_POSITION_RISK = 0.02 (2%). **Phase 14.5**: Pattern-pool signals capped per class via `getPatternPoolGuardrailsForAssetClass`. sourcePool read from signal metadata.
- **P19-B8.8 DEGRADE CONTRACT (2026-07-16)**: the three DB-governed sizing inputs (`portfolioRiskPerTradePct`, `maxPositionPercentPct`, `maxTotalExposurePct`) are read RAW — the historical hardcoded fallbacks ('1.50'/'10.00'/null→100, plus a second `safe*` re-default layer) are DELETED. Any missing/unparseable/non-positive input → the sizer logs `[P19-B8.8][SIZING_GUARDRAIL_READ_FAIL field=… mode=…]`, records the refusal on `rtbMetricsService.recordSizingGuardrailReadFail`, and returns `invalidResult` (zero-size) → the engine's `SIZING_INVALID` refusal path. Never a substituted number, never NaN downstream, loop intact. **Rail**: 10 consecutive refusals → ONE `breakage` system alert (dedupe_key `sizing-guardrail-read-fail`, latch + counter reset on any successful read; state visible via `getSizingReadFailRail()`). Same-family sweeps landed with it: `buildSettingsFromGuardrails` field fallbacks retired to raw (throw-on-missing-row remains the loud gate); `trade-safety` `checkPositionSizeCap`/`checkMaxTotalExposure` fail-closed (`GUARDRAIL_READ_FAIL` result code); `goal-feasibility` unreadable limits → loud BLOCK; the legacy `/guardrails` GET phantom-row fabrication → honest 404; m5e `getDynamicSlots` → null-refuse. Dormant LPCP fallbacks → #518; runtime kill-switch trip confirm → #519.
- **Upstream**: guardrails_v2 (full-row-or-null via `storage.getGuardrailsV2`), VTS learning repository, Price Cache, volatility metrics, per-class pattern-pool guardrails dispatch
- **Downstream**: Active Execution Engine + signal orchestrator (size determination); rtb-metrics (refusal rail); system-alerts (rail threshold)
- **Blast Radius**: **HIGH** — determines how much capital is at risk per trade

### 6.4 Pre-Execution Validator / Trade Safety
- **File**: `server/services/pre-execution-validator.ts`, `server/services/trade-safety.ts`
- **What**: Final gate before trade execution. Currently a three-gate system (guardrails + EV + goal alignment). Goal alignment to be removed (Wave 4.5) → becomes two-gate.
- **Upstream**: Guardrails V2 policies, portfolio state, position history
- **Downstream**: Paper Execution Engine (allow/deny)
- **Blast Radius**: **HIGH** — blocks or allows every trade

### 6.5 Trailing Exit Controller
- **File**: Referenced in Phase 5 (Directive 9.2.A)
- **What**: Two-stage latch: Break-Even → Target Lock. Cost-aware floors (Directive 11.3A). Dynamic trailing: K' from DI + VolNoise.
- **Upstream**: DI calculation, VolNoise, cost model
- **Downstream**: Paper Execution Engine (exit decisions)
- **Blast Radius**: **MEDIUM** — affects exit timing and P&L

### 6.6 MicroExecutionService — EXPERIMENTAL
- **File**: `server/services/micro-execution-service.ts`
- **What**: Paper-mode only high-frequency check between monitoring cycles. 8s recheck, 0.30% delta trigger. `triggerSymbolCheck()` is TODO stub.
- **Upstream**: Price Cache (1-second forwarding loop)
- **Downstream**: None (cannot act — TODO stub)
- **Execution**: **1-second price updates**, 8-second recheck loop
- **Blast Radius**: **LOW** — cannot execute trades (incomplete)
- **Status**: Experimental, dormant per Kyle acceptance

---

## Layer 7: Learning & Calibration

### 7.1 VTS Runner
- **File**: `server/services/vts-runner.ts` (~1,850 lines)
- **What**: Autonomous virtual trading simulator. 60-second cycles. **Dual-path** (Batch 19C, extended Batch 19E, improved Batch 19G): (1) Quant path — evaluates FX5 quant-pool pairs with all regime-compatible strategies. (2) Pattern path — fetches pattern pool pairs via `activeFilterPool.getPatternPool('paper')` alongside quant pool (Batch 19E), evaluates with PATTERN + HYBRID strategies only (filtered via `PATTERN_POOL_STRATEGIES`). `sourcePool` metadata tagged on VTS trade records. Uses real market data with real scoring pipeline. **Batch 19G**: Hybrid confluence buffer integrated (via hybrid-compatibility-registry.ts) for cross-signal detection. Dedup changed from 3 to 1 per symbol+strategy combination. Pattern path parity — scanPatterns now drives strategy selection instead of regime, matching the signal orchestrator's active trading behavior.
- **Upstream**: Price Cache (VTS bucket), MCE (regime + indicators via `computeContext()`), Pattern Recognition, OHLC Cache (60-min candles, 100-candle lookback via `ohlcCache.getOHLCData()` — Batch 18), BTC OHLC via OHLC Cache (for defensive_hedge Spearman correlation — HF8), Active Filter Pool (quant pool + pattern pool pairs — Batch 19C/19E), PATTERN_POOL_STRATEGIES config (Batch 19C), hybrid-compatibility-registry.ts (Batch 19G)
- **Downstream**: VTS Service (trade storage), Telemetry Aggregator (M70: only VTS writes telemetry), ML Calibration (trade outcomes)
- **Execution**: **60-second interval** (passive learning mode)
- **Blast Radius**: **HIGH** — all learning data flows through VTS
- **Contamination**: ~~`simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()` — BUG-001 (CRITICAL)~~ **REPLACED** (HF6) with real score computation: `computeRealHybridScore()`, `getPredictiveConfidence()`, `computeRealDecayPenalty()`. Strategy-specific entry/stop/target from StrategyEngine detect functions. BUG-001 PARTIALLY RESOLVED.
- **Batch 44**: Quant-pool pairs no longer sprayed against pattern strategies. Pattern routing uses normalizePatternToCanonical() as single source of truth. Duplicate scanPatterns() removed for pattern-pool pairs. FX5 scan diagnostics persist to `logs/fx5_diagnostics/`.
- **Batch 45**: Bearish strategies disabled in long-only VTS: `liquidity_trap` (bearish by design), `DHMA` short branch, `inside_bar_reversal` SELL path. 5-min post-close re-entry cooldown prevents runaway loops. `sourcePool` propagated to closed trades. `expectedEdge` stored on open trade and used in API (replaces `predictiveConfidence` default).
- **Batch 46**: Governance state persistence loaded via import (`governance-persistence.ts`).
- **Batch 57**: Pattern-strategy mismatch fixed — per-strategy pattern routing matches VTS behavior to signal-orchestrator fix. Pool-split null reason tracking added (quant pool vs pattern pool breakdown in null reason counters). adaptive-flow.ts THREE_SOLDIERS/MORNING_STAR canonicalization bug fixed.
- **B62**: Benchmark exclusion filter removed (VTS benchmarks unblocked). Half-wire at L877 (`biasModifier` computed and discarded) removed — dead code path deleted.
- **★ ITEM 4 Phase B step 1 (2026-06-09) — STANDALONE ALWAYS-ON**: the 3 `tradingActive` kill-guards REMOVED (cycle-skip / start-refusal / interval self-teardown) — **VTS lifecycle is now its OWN start/stop only; it runs THROUGH paper/live start-stop** (Gate-2 packet §3 O1; verified 14/14 beats at exact 60s incl. during an active paper session). Lifecycle guard added: re-entrancy no-op + overlap skip-tick (`vtsCycleOverlapSkips` counter = the O6 throughput-study starvation signal) + crash-containment catch (a cycle throw can no longer crash the shared process). **Entry-stamp**: every pair `sourceMode:'vts'` spread-stamped at the possession boundary (post-`getIdealPoolPairs()`); downstream consumer re-points = step 2 (D1/D9). **⚠️ #210 HARD GATE until step 2 deploys: no active-trading turn-on** — D1 (archivers' write-time `getCurrentMode()`), D1b (`hybrid-confluence-buffer` shared mutable cross-producer, no source dim — see its entry), D9 (`outcomeFeedbackStore` no source dim) are open contamination paths under concurrency.
- **Tests**: `vts-modernization.test.ts`, `vts-signal-generation.test.ts`

### 7.2 VTS Service
- **File**: `server/services/vts-service.ts` (~500+ lines)
- **What**: Trade storage (in-memory), calibration interface, ML trigger (every 10 HYBRID trades), session metrics.
- **Upstream**: VTS Runner (trade outcomes)
- **Downstream**: ML Calibration Service (trigger), calibration history
- **Blast Radius**: **MEDIUM** — data pipeline between VTS and calibration

### 7.3 ML Calibration Service
- **File**: `server/services/ml-calibration.ts` (~232 lines)
- **What**: Phase-10 ML training loop. Analyzes VTS outcomes, generates learning recommendations.
- **Upstream**: VTS Service (trade data, 10-HYBRID trigger)
- **Downstream**: predictive-adjustments log (`logPredictiveAdjustment`). **NOTE (B-NEW-54, 2026-06-08):** despite the name, this is pure TypeScript — it does NOT call the (now-retired) Python ML microservice. It is a decorative predictive-learning piece (observational only) → logged to the Phase-16 legacy register (RUNNING_ISSUES #136) as a teardown candidate.
- **Execution**: **Triggered** — every 10 HYBRID trades
- **Blast Radius**: **LOW** — observational; recommendations are logged, not applied

### 7.4 Python ML Microservice — ❌ RETIRED (B-NEW-54, 2026-06-08)
- **Status**: **REMOVED.** `services/ml_service.py` + `server/services/ml-service-client.ts` + `services/requirements.txt` deleted; boot-orchestrator spawn/health stripped; PM2 `dawntrader-ml` app removed; staging process killed + venvs/models cleaned. Was a decorative Phase-8-era predictive helper — its promotion/profit predictions were fetched fire-and-forget in the signal orchestrator, logged, and discarded (no decision consumer). The real ML is a fresh Phase 17/18 design, not a revival. See `B_NEW_54_REMOVAL_*` + the completion report.
- **Former role**: promotion-probability + profit-forecast predictions via HTTP on localhost:5001.

### 7.5 Drift Detector
- **File**: `server/services/drift-detector.ts` (~400-457 lines)
- **What**: Monitors calibration parameter drift (α, β, σ) per strategy. 10-snapshot rolling window. **B-NEW-54: `triggerRecalibration` is now a logged no-op** (it used to POST to the retired ML microservice's `/drift/retrain`); drift is still detected/logged/broadcast, but the retrain ACTION is retired.
- **Upstream**: VTS trade outcomes, parameter history
- **Downstream**: (none — the ML retrain target was removed B-NEW-54). Still feeds the drift dashboard (`vts.ts`) + health route.
- **Execution**: **15-minute interval**
- **Blast Radius**: **LOW** — observational (drift dashboard); recalibration action is a no-op

### 7.6 Telemetry Aggregator
- **File**: `server/services/telemetry-aggregator.ts` (~200+ lines)
- **What**: Per-pair/per-pool performance tracking. Single source of truth for win rates and average edge. M70 enforcement: only VTS writes. **Batch 46**: `cascadeHistory` and `poolAggregates` now persist to `logs/telemetry_state/aggregator_state.json` (60s cadence) and rehydrate on startup. `pairTelemetry` remains DB-backed only (NOT file-persisted).
- **Upstream**: VTS Runner (trade outcomes — exclusive writer)
- **Downstream**: Adaptive Ratio Manager (pool performance), FX5 scanning (pair ranking)
- **Blast Radius**: **MEDIUM** — affects pair selection bias

### 7.7 Retraining Freeze Controller
- **What**: Prevents calibration during stabilization. Auto-activates 1-hour freeze on restart (BUG-014).
- **Blast Radius**: **LOW** — gates calibration timing only

### 7.8 Learning Cooldown Governance
- **File**: `server/core/governance/learning-cooldown.ts` (~160+ lines)
- **What**: Regime-aware learning update gating. Prevents bursty parameter changes. **Batch 46**: `regimeHistory` (7-day flip rate) and governance counters now persist to `logs/governance_state/governance_state.json` via `governance-persistence.ts` (60s cadence). Rehydrated on startup — critical for regime stability classification continuity.
- **Blast Radius**: **LOW** — gates update frequency only

---

## Layer 8: Predictive Learning Stack

### 8.1 Predictive Adjustments (Micro/Fast)
- **What**: Short-horizon pattern → outcome learning. Modifies pattern confidence contributions to hybrid score. Does NOT change position sizing, stops, or entry logic.
- **Upstream**: Individual closed trades, pattern identifiers, win/loss outcomes
- **Downstream**: Hybrid score composition (pattern weight adjustments)
- **Status**: OBSERVATIONAL ONLY (as of Phase 11.8B-D1). Will become EXECUTABLE after Phase 11.8C (Authority Baseline).
- **Blast Radius**: **MEDIUM** (when executable) — affects signal scoring

### 8.2 Learning Calibration (Medium/Batch)
- **What**: Batch learning across many trades. Produces recommendations for canonical weight changes. Does not mutate live weights directly.
- **Upstream**: Groups of closed trades, aggregated performance
- **Downstream**: Canonical Weights (recommendations), learning audit trail
- **Status**: Recommendations only — no direct mutation
- **Blast Radius**: **LOW** (currently) — becomes MEDIUM when executable

### 8.3 Regime Archive (Long-Horizon Memory)
- **What**: Historical regime × strategy × outcome snapshots. Immutable (checksummed). Does not change anything directly.
- **Upstream**: VTS trade outcomes per regime/strategy (via VTS Telemetry Aggregator — `vts-telemetry.ts`)
- **Downstream**: Future ML training data, drift analysis, rollback checkpoints, B60 Evidence Collector
- **Execution**: Weekly archive (scheduled), manual archive (on-demand)
- **B59 Fix**: `vts-telemetry.ts:148` field name mismatch fixed (netProfit → netProfitPercent conversion). Pre-existing pnl double-scaling at line 158 also fixed (Langston catch). Archive now receives real VTS win rates and P&L.
- **Blast Radius**: **LOW** — memory and audit, not action

### 8.4 Canonical Weights (Bridge Artifact)
- **File**: `bridge/canonical/phase9_predictive-learning.json`
- **What**: Authoritative snapshot of learned knowledge across patterns, regimes, confidence modifiers.
- **Upstream**: Learning Calibration (produces), Predictive Adjustments (consumes)
- **Downstream**: Predictive model baseline
- **Blast Radius**: **MEDIUM** — represents current learned state

---

## Layer 9: Infrastructure & Monitoring

### 9.1 Boot Orchestrator
- **File**: `server/core/boot_orchestrator.ts` (~140 lines)
- **What**: Initializes the VTS Runner during startup (pattern-history warmup → `initVTSRunner` → autonomous-sim auto-start in passive mode) + manages graceful shutdown (`stopVTSRunner`). **B-NEW-54 (2026-06-08): the Python ML microservice lifecycle (spawn / health-polling / metrics) was REMOVED** — the helper was retired; the orchestrator boots VTS only. Degraded-mode-first (VTS init errors logged, never hard-stop boot).
- **Execution**: During server startup
- **Blast Radius**: **HIGH** — controls VTS service initialization order

### 9.2 Startup Sequence (server/index.ts)
- **File**: `server/index.ts` (~1,260 lines, monolithic)
- **What**: Single async IIFE boot sequence. ~40+ service initializations. Degraded-mode-first (all try/catch). Only hard-stop: single-tenant DB invariant.
- **Blast Radius**: **HIGH** — controls what starts and in what order
- **Note**: Any new service needs initialization wired here

### 9.3 Lazy Loader
- **File**: `server/startup/lazy-loader.ts` (~189 lines)
- **What**: Loads non-critical services after main startup. Parallel Promise.all for critical, setTimeout for low-priority.
- **Blast Radius**: **MEDIUM** — controls deferred service loading
- **Note**: Walter/Cortex services removed from lazy loader (Phases 12-13, HF9). Remaining deferred loads are non-legacy utility services.

### 9.4 Trading Bootstrap
- **File**: `server/startup/trading-bootstrap.ts` (~99 lines)
- **What**: Reinitializes trading engines on restart if they were active. Restarts RTB + TCL.
- **Blast Radius**: **MEDIUM** — controls trading engine recovery

### 9.5 FX5 Scanner Bootstrap
- **File**: `server/startup/fx5-scanner-bootstrap.ts` (~33 lines)
- **What**: Subscribes FX5 to Central Clock. Prevents double-initialization.
- **Blast Radius**: **MEDIUM** — controls scanner lifecycle

### 9.6 System Health Monitor (3-Tier)
- **Files**: `system-health.ts` (~147 lines), `system-health-monitor.ts` (~437 lines), `health-monitor.ts` (~1,495 lines)
- **What**: CPU load, memory, event loop lag, uptime, scheduler health. Ring buffer of 250 heartbeats (~21 min).
- **Execution**: **5-second heartbeat** + 1-minute logging
- **Blast Radius**: **LOW** — monitoring only, no control actions

### 9.7 Circuit Breaker
- **File**: `server/services/circuit-breaker.ts` (~336 lines)
- **What**: Prevents cascading failures. CLOSED → OPEN → HALF_OPEN state transitions.
- **Downstream**: Trading engine gating
- **Blast Radius**: **MEDIUM** — can halt trading on sustained failures

### 9.8 Scheduler Registry
- **File**: `server/services/scheduler-registry.ts` (~134 lines)
- **What**: Registry for all scheduled tasks. Manages task queues and health.
- **Blast Radius**: **LOW** — administrative tracking

### 9.9 Stage-3 Emitter
- **File**: `server/services/stage3-emitter.ts` (~100+ lines)
- **What**: WebSocket events during scanning: `scan_tick`, `scanner_breakdown`.
- **Downstream**: Frontend (Filter Insights widget)
- **Blast Radius**: **LOW** — diagnostic/display only

### 9.10 Canonical Bridge Sync (Batch 59, updated B.1.5 redeploy unblocker 2026-05-31)
- **File**: `server/scripts/sync-canonical-bridge.ts` + `server/services/autonomy-scheduler.ts` (daily task)
- **What**: Regenerates canonical bridge JSON and Markdown files from TypeScript source. **B59**: Added daily auto-sync scheduler task. Fixed ESM compatibility (`require.main === module` → typeof guard). Fixed hard-coded `updatedAt` timestamp — now uses fresh date on every sync. **B.1.5 redeploy unblocker 2026-05-31 (BUG-2026-05-31-A):** rewrote `generateBridgeJSON()` to derive both per-class subtrees from new `ASSET_CLASS_OVERRIDES` const encoding the hand-authored deltas. Output now matches `getClassMap` (`server/core/strategy-mapper.ts:43`) byAssetClass consumer contract — previously emitted flat-shape JSON that silently drifted from the consumer since B79.0n.STRATEGY `af99bd5` (2026-05-24). New `server/tests/unit/sync-canonical-bridge.test.ts` (9 tests) locks the producer-consumer contract in CI.
- **Upstream**: `canonical-regime-strategy-map.ts` (TypeScript source of truth, still flat-per-regime; per-class deltas encoded in sync script's `ASSET_CLASS_OVERRIDES`)
- **Downstream**: `bridge/canonical/mapping-regime-strategy.json` (consumer = `getClassMap` byAssetClass-nested read at boot), Mapping Drift UI tab (reads bridge JSON metadata), regime-strategy documentation
- **Blast Radius**: **HIGH** if generator drifts from consumer (boot-time module-init crash; observed BUG-2026-05-31-A); **LOW** otherwise. Unit-test contract lock mitigates drift recurrence.
- **Producer-consumer contract** (NEW invariant 2026-05-31): `generateBridgeJSON()` output MUST satisfy `getClassMap(assetClass)` for both `crypto_spot` AND `xstock_spot`. Asserted by `sync-canonical-bridge.test.ts` in CI.

### 9.10.b B-NEW-36 Weekend-Lifecycle Controller + Poll-Reconcile SSOT (B-NEW-36 2026-05-20, poll-reconcile 2026-05-31, **weekend-cron RETIRED B-NEW-52 2026-06-06**)
- **Files**: `server/services/session-lifecycle-controller.ts` (shared core + poll entries + boot reconcile) + `server/asset_classes/xstock_spot/scanner.ts` (centralClock-tick reconcile hook, in `handleTick()`)
- **What**: xStock weekend window (Fri 8PM ET → Sun 8PM ET) shutdown/restart automation. **As of B-NEW-52 there are TWO independent fire paths** (the node-cron path was RETIRED — see below) converging on the same shared core (`runWeekendShutdownCore` / `runWeekendRestartCore`) which performs: (a) trade-state mutation via `markAllXstockWeekendSuspended` / `unmarkAllXstockWeekendSuspended`, (b) scanner pause/resume via `xstockSpotScanner.pause()` / `.resume()`, (c) audit-row write to `scheduled_tasks_audit` with `meta.trigger_source: 'poll' | 'boot'`.
- **Fire paths:**
  1. ~~**node-cron**~~ **RETIRED B-NEW-52 (2026-06-06).** The Fri/Sun `0 20 * * 5`/`0 20 * * 0` weekly alarms went stale a 3rd time (a fire-once-a-week in-process alarm doesn't survive the app's frequent mid-week restarts). `registerTimers()` + the two cron callbacks + `writeMissedCronAlert` + the node-cron/cronRegistry imports were removed; poll + boot are now the SSOT. The CRON-FIRE-VERIFIER auto-deregistered the two weekend jobs (dynamic registry). `TriggerSource` is now `'poll' | 'boot'`.
  2. **Boot reconciliation** (called from `server/index.ts` after scanner.start + rehydrate): on every process boot, compute `insideWeekendWindow` via `isXstockMarketOpenUTC()` predicate and reconcile trade-state + scanner-pause state to match. Closes the "PM2 restart mid-weekend → scanner resumes against closed market" mode AND the "long restart gap straddling Sun-restart → trades stuck suspended" mode.
  3. **Poll-reconcile** (NEW 2026-05-31; **PRIMARY since B-NEW-52**): `xstockSpotScanner` clock-tick → `handleTick()` invokes `reconcileWindowState()` every 30 ticks (= 30s) regardless of `isPaused` (the reconcile block runs ABOVE the `if(isPaused)return` early-out — the Sunday-reopen invariant). Compares `isXstockMarketOpenUTC()` vs `scanner.isPaused`; on drift, invokes `runShutdownFromPoll`/`runRestartFromPoll` entries on `sessionLifecycleController` which share the same core. **B-NEW-52 flipped these to `runPrewarm:true`** (poll is now the normal path, so it folds in the boundary OHLC pre-warm that keeps 60m+15m snapshots warm for DBS at Sunday reopen) and removed the missed-cron alert (poll is no longer a "fallback"). `[B-NEW-36][POLL_RECONCILE_CHECK]` heartbeat log every 10 min provides positive proof-of-life when state matches.
- **SSOT**: `scanner.isPaused` is the canonical signal. Both remaining paths pair pause/resume with trade-state mutation via the shared core, so independent drift between scanner state and trade table is closed. A continuous self-correcting reconcile loop is strictly more reliable than a fire-once alarm and cannot be knocked out by a restart (the B-NEW-52 thesis).
- **Mutex**: `inFlight` boolean on `sessionLifecycleController`, atomic check+set (no awaits between guard and assignment), cleared in `finally` block. Tests `b-new-36-poll-reconciliation.test.ts` #8 (unlock-on-throw) + `b-new-52-reconcile-ordering.test.ts` (restart-while-paused + idempotency).
- **Upstream**: centralClock (poll path), `isXstockMarketOpenUTC()` predicate from `xstock_spot/market-hours.ts` (node-cron no longer a dependency of this controller)
- **Downstream**: `xstock_spot_ticker_snap` consumers (paused/resumed via scanner), `vts_open_trades` xStock rows (state flipped to/from `weekend_suspended`), `scheduled_tasks_audit` (every fire writes a row, `trigger_source` poll|boot)
- **Blast Radius**: **HIGH for xStock VTS path** (controls whether xStock signals fire + whether 244+ open trades are suspended); **ZERO for crypto** (crypto scanner + trades untouched); **ZERO for active trading** (Phase 19 unchanged)

### 9.10.c B-NEW-49 — node-cron observability layer (cron-registry + arm-logger + scheduled-jobs-audit + smoke-test + fire-evidence-verifier) [2026-05-31]
- **Files**: `server/services/cron-registry.ts` + `server/services/cron-arm-logger.ts` + `server/services/scheduled-jobs-audit.ts` + `server/services/cron-arm-smoke-test.ts` + `server/services/cron-fire-evidence-verifier.ts` (all NEW); 5 schedule sites modified to wire in.
- **Why**: BUG-2026-05-31-B audit found 4 of 5 OTHER node-cron schedules (besides B-NEW-36 weekend-lifecycle) silently failed during the same ~31h window May 29-31, with no observability. RUNNING_ISSUES #164 closed via this observability + safety-net layer.
- **Two failure modes covered (mandatory framing per Langston Step-1 ACK):**
  - **Mode A — arming failed:** schedule registered but `getNextRun()` returns null or past-timestamp. Caught by `cron-arm-smoke-test.ts` at boot AND boot+5min (via `setTimeout`). Writes system-alert (severity=warning, category=breakage) on any PAST_DUE / TOO_FAR_FUTURE / NULL_NEXT_RUN status.
  - **Mode B — armed correctly but tick-loop died mid-lifetime:** schedule fired N times then silently stopped firing. Caught by `cron-fire-evidence-verifier.ts` running every 15 min via `setInterval` (NOT node-cron — independent of monitored mechanism so it survives node-cron failures). Queries `MAX(fired_at)` from `scheduled_tasks_audit` per registered job; alerts when stale beyond `intervalSeconds × 1.5` grace window (boot-grace = `intervalSeconds + grace` = 2.5x interval to avoid false-positives before first fire).
- **Pattern**: each cron registration site calls `cronRegistry.register({...})` immediately after `cron.schedule(...)`, followed by `logCronArm(...)` for the `[CRON-REGISTRATION]` log line with computed `next_fire`. Each cron callback wraps the work in try/finally that calls `scheduledJobsAudit.writeFireRow({...})` for both success and error paths. Reuses existing `scheduled_tasks_audit` table from B-NEW-36 (no new migration — pre-audit found schema shape-compatible).
- **Coverage**: 7 schedules total registered at boot (5 new sites + B-NEW-36's 2). Each gets `[CRON-REGISTRATION]` log + 2 smoke-test classifications (boot + boot+5min) + verifier monitoring every 15 min.
- **B-GOV-INTEGRITY-1 UPDATE (2026-07-10): the alert SCHEMA + resolve path + delivery gate + category type all changed.** SystemAlert gains four resolve-provenance fields — resolved_at, resolved_by_claimed (CALLER-supplied, UNAUTHENTICATED), resolved_by_transport (ResolveTransport enum, CODE-stamped by the call site, never a flag), resolution_evidence (hard-gated by isValidResolutionEvidence: a reference token path:line|sha|uuid|section-ref OR a sanctioned sentinel {NO-EVIDENCE-GIVEN, provenance-unknown-pre-F3b}). resolveAlert(id, by, evidence, transport) enforces the gate on ALL paths (CLI/dispatcher/api/checker). **Category is a SINGLE SOURCE:** the as-AlertCategory cast is DELETED; AlertCategory is DERIVED from the ALERT_CATEGORIES const (7 creatable; GRANDFATHERED_ALERT_CATEGORIES accepted on read only); addAlert validates via assertCategoryCreatable (throws on off-SSOT); routes.ts category filter imports the SSOT. **Delivery is CLASS-driven** (shouldDeliverToDiscord): warning/critical always deliver; info delivers iff category in ALWAYS_DELIVER_CATEGORIES={governance,breakage}. **Cross-batch SEAM:** the governance-checker (B-GOV-INTEGRITY-0, poller.mjs) resolves via the CLI passing --evidence <graded-ref-sha> (or NO-EVIDENCE-GIVEN on fetch-fail) -> resolved_by_claimed=governance-checker + resolved_by_transport=cli. One-shot honest backfill scripts/b-gov-integrity-1-backfill-resolve-provenance.ts (reuses withLock+atomic write, id-set-conservation, idempotent). Resolves #447; absorbs #38. 
- **B-GOV-INTEGRITY-0 UPDATE (2026-07-10): the checker's READ path is now ref-correct + fail-loud, and it self-detects code staleness.** (F0, #449) `poller.mjs` reads `GOVERNANCE_EXCEPTIONS.md` at the graded ref via `readGovernedExceptions()` = `git show ${BRANCH}:<path>` (was `readFileSync` on the frozen local clone worktree, ~388 commits stale -> false alarms), and THROWS on an empty/unreadable rulebook (raises a critical `gov-exceptions-unreadable` alert + refuses to grade) instead of returning `{}`. (F9, #490) `checkerCodeDrift()` compares the LOADED-code files {poller.mjs, checker.mjs, config.mjs} at `HEAD` vs `${BRANCH}` (narrowed 2026-07-11 from the whole subtree, Langston Step-4 — README/tests/.service-timer units excluded: not the enforcer) each tick and raises a warning `gov-code-drift` alert when the deployed box's checker CODE SUBTREE diverges from origin (auto-resolves on match) -> silent recurrence is impossible; scoped to the checker's own code so doc pushes never trip it. (OBJ-1) the resolve seam (`--evidence <graded-ref sha>`) is the B-GOV-INTEGRITY-1 UPDATE above. (OBJ-0) auto-redeploy DONE 2026-07-11: systemd drop-in `governance-checker.service.d/20-auto-redeploy.conf` runs NON-FATAL (`-`) `git fetch` + `git merge --ff-only origin/migration/aws-supabase` as ExecStartPre before each tick, so the box self-heals its OWN checker code every cycle (deploy-owned repo; state.json is outside the repo so a pull can't touch it). ff-only = can never diverge/merge-commit (a hand-commit in the clone fails loud); non-fatal = a delivery failure never aborts enforcement (tick runs prior code; F9 drift canary / gov-fetch-failed flag the lag). Plus poller.mjs emits a per-tick `poller running at deployed HEAD <sha>` line (positive auditability). Fail-loud + auto-recovery acceptance-tested live. Code: `scripts/governance-checker/poller.mjs`.
- **B-GOV-ORPHAN-CLASS UPDATE (2026-07-13): the checker now READS confirmed class-overrides, grades the orphan-sweep class-aware, and self-reconciles its dedup cache against the store.** (OBJ-1) `loadExceptions` parses `class-override` rows -> `classOverride:Map<batchId,class>` (shared `isConfirmed` predicate, VALID_CLASSES-gated, fail-closed); an apply loop (after loadExceptions, before decideAlerts) sets `declaredClass/classDeclared` with OVERRIDE-WINS precedence over the scope header (+ durable supersede log); `confirmedOverride` injected into `decideAlerts` suppresses `gov-underdeclared` at the OPEN condition (no flap). (OBJ-2) `decideOrphanSweep` re-evaluates `gov-classundeclared:` orphans (resolve when class declared via header OR confirmed override), not only `gov-docgap:`. (OBJ-3) the orphan `verifyDoc` is class-aware — resolves an aged-out doc-gap when the doc is NOT in `checkBatchDocset(...).required` (effectiveRequired = class.required U REQUIRED_IF), keeps genuinely-missing required docs (no cry-silence). (OBJ-4) NEW pure `decideStaleOpenAlertDrops` + `alertSink.liveAlertIds()` (active+acknowledged+scheduled; FAIL-OPEN on read error) reconcile `state.openAlerts` against the store SSOT each tick (pre-decide snapshot) — fixes the #352 fail-quiet where externally-resolved keys sat open forever. (OBJ-5) `readDeclaredClass` uses a posix `sjoin` for the git object path. Resolves #497 + #352. Code: `scripts/governance-checker/{poller,checker}.mjs`.
- **Alerting path**: smoke-test + verifier both write via existing `addAlert()` → `system-alerts.jsonl` → §10.5 per-turn check by CC/Langston + dispatcher auto-push to Telegram (B-NEW-45) + dispatcher auto-invoke Langston via SSH (B-NEW-46). Silent failures now detectable within their schedule period + with forensic trail.
- **B-GOV UPDATE (2026-06-17): the governance-checker is a NEW writer to this alerting path — and the FIRST that lives OUTSIDE the app process.** It runs as a systemd TIMER on **STAGING** (`188.245.193.8`, NOT the dawntrader node process — isolated to avoid the event-loop stall; **B-GOV-2 moved it here from the Langston box** — the alert queue lives on staging, so the CLI is local with no per-alert ssh, a single clock, and a reliable always-on host), reads git history + the governance docs from a DEDICATED LOCAL clone `/opt/governance-checker/DawnTraderV3` (deploy user; NOT the gdrive FUSE mount, NOT the live app checkout), and writes/resolves `governance`-category alerts into `system-alerts.jsonl` via the LOCAL `system-alerts` CLI (`add` / `resolve <id>`, no ssh) — reusing `addAlert`/`resolveAlert`, the dispatcher Telegram-push, and the §10.5 per-turn surfacing (it does NOT build a parallel alert path). New `AlertCategory` member `'governance'` (`system-alerts.ts:52`). It dedupes via its OWN state file (logical-key → alert-id) and carries the logical key in `--metadata`. The 4 self-declared inputs it keys off (batch-id, change-class, open-state, umbrella-namespace) fail-closed to the strict default and are audited in `1-system-manual/GOVERNANCE_EXCEPTIONS.md`. Code: `scripts/governance-checker/`. **B-GOV-2 UPDATE (2026-06-19, `ec37b2990`):** change-class declaration (OBJ-1 `readDeclaredClass`) + dead-man heartbeat (OBJ-3, a SEPARATE `governance-checker-heartbeat` service+timer) + shadow mode shipped; the checker is now **INSTALLED on staging + activated-in-shadow, but currently PAUSED** (both timers disabled) after its first tick flooded the §10.5 queue with 88 activation-day backfill entries (all resolved). **2 follow-ups gate live-paging** (RUNNING_ISSUES): (a) seed `GOVERNANCE_EXCEPTIONS.md` so the first live tick flags only genuine gaps; (b) the **shadow-surfacing fix** — `info`-severity shadow entries STILL surface in the §10.5 read (which doesn't filter by severity), so shadow must be made genuinely non-surfacing before `GOV_SHADOW=0`. Honest ceiling unchanged: detects + drives the fix, does NOT block a push.
- **B-NEW-50 UPDATE (2026-06-01, RUNNING_ISSUES #165):** Mode-A next-fire is now computed by **`server/services/cron-next-fire.ts` `computeNextFire()` (cron-parser)** — NOT node-cron's `task.getNextRun()`, which is broken for day-of-week schedules ≥~2 days out (returns a future Jan-1st). `cron-arm-logger.ts` + `cron-arm-smoke-test.ts` import + classify on `computeNextFire`; node-cron's raw value is emitted ONLY as a labelled `raw_nodecron_next=… [UNTRUSTED ncv=4.2.1]` diagnostic, never driving warnings/alerts. Mode-B fire-evidence verifier (DB `MAX(fired_at)`) was already unaffected. `cron-parser` is a direct dep @4.9.0 — **must be default-imported** (CJS; named ESM import crashes the prod bundle — see RUNNING_ISSUES #168 / BUG-2026-06-01-A).
- **B-NEW-51 UPDATE (2026-06-02):** the **Mode-B fire-evidence verifier is now CADENCE-AWARE**. It no longer uses `lastFire + intervalSeconds × 1.5` (calendar-blind — it judged the weekly `0 20 * * 5` weekend timer "stale by Tuesday", spamming a stale alert every 15-min cycle). It now computes the schedule's ACTUAL most-recent occurrence via **`cron-next-fire.ts` `computePrevFire()` (cron-parser `.prev()`)** and flags stale only if `lastFire < prevOccurrence − FIRE_LATENCY_GRACE` (10-min). Process-level `BOOT_GRACE_MS` (5-min) replaces the old interval-derived boot-grace; the interval×1.5 model survives ONLY as a fallback when an expression is unparseable. **Plus root-level alert dedup:** `system-alerts.addAlert` gains an optional `dedupe_key` — a new alert is suppressed if a NON-terminal (scheduled/active/acknowledged) alert with the same key exists (`resolved` does not block; backward-compatible — callers without a key are unchanged; `SYSTEM_ALERTS_FILE` env-overridable for tests, staging path unchanged). The verifier passes `cron_stale:<job>:<prevOccurrence ISO>` → exactly ONE alert per genuinely-missed occurrence (auto-clears on next fire), instead of one per 15-min cycle. Documented contracts: resolve-while-broken re-surfaces (intentional); newly-registered-cron `no_fires_ever` fires once then dedups (RUNNING_ISSUES edge). Deploy `c7529f146`.
- **Upstream**: node-cron 4.2.1 (`task.getNextRun()` public API per `dist/cjs/tasks/scheduled-task.d.ts`), centralClock (none — verifier uses independent `setInterval`); cron-parser @4.9.0 (`computePrevFire`/`computeNextFire`).
- **Downstream**: `scheduled_tasks_audit` table (per-fire writes from all 5 sites + existing B-NEW-36 writes); `system-alerts.jsonl` (smoke + verifier alerts); operator queries via `SELECT task_name, MAX(fired_at) FROM scheduled_tasks_audit GROUP BY task_name` pattern.
- **Blast radius**: **LOW** for observability layer itself (read-only inspection of schedules + audit-row writes; failure-safe — audit-write failure swallowed, never blocks cron callback); **HIGH visibility** for failures it surfaces (every node-cron failure becomes a §10.5 alert within 15 min).
- **Known limitation surfaced on first deploy**: node-cron 4.2.1 `getNextRun()` for `0 20 * * 5` (Friday 8PM ET) in `America/New_York` timezone returns a date ~215 days off (Jan 2 2027 instead of June 5 2026). `0 20 * * 0` (Sunday) returns correct date. Smoke test correctly alerts as TOO_FAR_FUTURE. Logged as RUNNING_ISSUES #165 — unknown whether the bug is in `getNextRun()` only OR in the actual firing too. B-NEW-36 poll-reconcile makes weekend boundary robust regardless.

### 9.11 Adjustment Registry (Batch 58b, updated B59)
- **File**: `server/config/adjustment-registry.ts`
- **What**: Parameter bounds definitions, validation functions, audit logging for all Tier 1/2 adjustable parameters per ADJUSTMENT_FRAMEWORK.md.
- **Upstream**: Boot Orchestrator (startup validation), SCORE_WEIGHTS, EXECUTION_CONFIG
- **Downstream**: routes.ts `/api/filters-v2` PUT handler (log-only validation on filter writes)
- **Mode**: Log-only (warn but don't block). Switch to enforce mode via `setValidationMode('enforce')` after verification.
- **Blast Radius**: **LOW** — read-only validation, never blocks in log-only mode

### 9.12 Authority Baseline Loader (Batch 58b)
- **File**: `server/config/authority-baseline.ts`
- **What**: Loads V1.0 authority baseline from `1-system-manual/authority-baseline-v1.json`. Provides comparison utilities for drift detection.
- **Upstream**: `authority-baseline-v1.json` (file read at startup)
- **Downstream**: Boot Orchestrator (loaded during initialize()), drift comparison utilities (available to any consumer)
- **Read-only**: Never modifies any values. Provides getBaselineFilterValue(), getBaselineStrategyParam(), compareFiltersToBaseline().
- **Blast Radius**: **LOW** — read-only, non-blocking, graceful degradation if file missing

### 9.13 Asset-Class Registry & Resolver (B69)
- **File**: `shared/asset-classes.ts`
- **What**: 8-entry taxonomy registry (`crypto_spot`, `crypto_perp`, `xstock_spot`, `xstock_perp` + 4 reserved-future). `resolveAssetClass(symbol, exchange?)` uses exchange-first branching: `kraken-equities` → `xstock_spot`; `PF_<TICKER>XUSD` regex → `xstock_perp`; non-PF futures → `crypto_perp`; default → `crypto_spot`. `safeResolveAssetClass()` wraps with null-return for caller safety.
- **Upstream**: Exchange identity (WS connection context), symbol string
- **Downstream**: B74 passive archive pipeline (determines which table rows are written to), active-execution-engine (trade record `assetClass` field), factor-ablation-emitter (ablation row tagging), exit-strategy-replay-service (replay row tagging), UI badge component (`asset-class-badge.tsx`)
- **Shared State**: `ASSET_CLASSES` const (registry of valid values), `ASSET_CLASS_REGISTRY` (metadata per class)
- **Execution**: Synchronous — pure function, called per-row at insert time
- **Blast Radius**: **MEDIUM** — determines schema field values across all trade/archive tables. Incorrect resolution would tag data wrongly, affecting downstream asset-class-filtered queries.
- **B69 schema additions**: `exchange` + `asset_class` columns on `active_open_positions` (Drizzle), all 6 B74 archive tables (SQL ALTER), `exit_strategy_alternates` (SQL ALTER)
- **P19-B3a (#139, 2026-06-13)**: the crypto-spot base-length cap is now a SINGLE SSOT constant `CRYPTO_SPOT_BASE_MAX_LEN = 15` (widened from 10 — a finite tripwire); `CRYPTO_SPOT_CANONICAL` is BUILT from it AND imported by `server/utils/symbol-normalize.ts:74` (no two-literal drift — Langston C1). Rationale: the ceiling is a garbage/misclassification tripwire (the alarm fires on throw/null, NOT on confident-but-wrong), so it stays finite — a future legit long-ticker prompts a deliberate bump. `safeResolveAssetClass` now carries a CENTRALIZED fall-through alarm: a module counter (`getClassifyFallthroughCount`) + an escalation-hook slot (`setClassifyFallthroughHook` — registered server-side at P19-B4 for active-vs-passive system-alert escalation; null = passive WARN+counter) — every safe-call-site inherits it without a per-site edit. The 9 vts-runner throwing sites switched to `safeResolveAssetClass(...) ?? 'crypto_spot'` (alarms on null; VTS cycle survives). Homes: ~12 remaining active-path throwing sites → P19-B4 (#228); 4-module symbol-form consolidation → Phase 20 (#229); fallback-sample distinguishability → P19-B4 (#230).
- **P19-B6.5d (asset-class stamp integrity, 2026-06-18) — the matchable-universe MIN floor + the carry-the-stamp invariant**:
  - **Base-length FLOOR is now its own SSOT constant `TICKER_BASE_MIN_LEN = 1`** (`shared/asset-classes.ts`), feeding ALL 3 resolver regexes (`XSTOCK_PERP_RAW`, `XSTOCK_SPOT_DISPLAY`, and the crypto canonical built with `CRYPTO_SPOT_BASE_MAX_LEN`). It widens the implicit floor of 2 down to 1 so **single-letter bases classify** — the trigger was the live `A/EUR@kraken` classify fall-through (A = Vaulta, a real Kraken-spot crypto; alert `58367b27`, RUNNING_ISSUES A/EUR entry RESOLVED). Mirrors the MAX constant so the floor cannot drift between this classifier and `symbol-normalize.ts`. **Collision precedence is UNAFFECTED** — `resolveAssetClass` consults `XSTOCK_SPOT_DISPLAY` then `XSTOCK_SPOT_KRAKEN_COLLISIONS` BEFORE the widened crypto canonical (resolver order DISPLAY→COLLISIONS→SYMBOLS→CANONICAL→raw), so a single-letter crypto match can NEVER shadow an xStock collision ticker. Verified on the deployed resolver: `A/EUR`=crypto_spot, `T/USD`=crypto_spot (collision gate, drift-warn), `Tx/USD`=xstock_spot.
  - **CARRY-THE-STAMP invariant** (see the Cross-Cutting Runtime State registry callout near the top of this doc for the cross-cutting view): the asset class is STAMPED at pipe entry and CARRIED with the pair through SQE/RTB/TEC/execution — it is **NEVER re-derived from the symbol string at a downstream site**. Re-deriving hardcodes `exchange='kraken'` and mishandles the 9 USD / 8 EUR `XSTOCK_SPOT_KRAKEN_COLLISIONS` + single-letter bases. P19-B6.5d converted **26 of 35** resolve sites that were re-deriving to **prefer the carried stamp** (~12 active-path sites: SQE gate, signal-orchestrator ×4 reusing `sizingContext.assetClass`, routes P/L ×2, paper-engine AMR ×2, pre-exec-validator, RTB AMR-shadow ×2), threaded `assetClass` through `evaluateTradeExpectancy` + `feePercentFor`, and swapped 2 throwing-variant calls to the safe variant (market-context-engine:1442, vts-service:341). Active-path defaults are fail-closed; passive defaults are logged.
  - **The 14 passive/VTS resolve sites are LEFT-as-is BY DESIGN** (resolve-once-at-entry telemetry — correct-by-design): they call `safeResolveAssetClass(symbol, 'kraken')` once at function/loop entry into a local and reuse it (the capture-and-reuse pattern below), which is the intended VTS behavior for the passive learner. They are NOT a missed sweep — a future grep of `safeResolveAssetClass(...'kraken')` will hit these intentionally-retained passive sites (the bulk in `vts-runner.ts`, plus the already-safe `vts-service.ts:963`). Do NOT "fix" them to carried-stamp; the carry-the-stamp invariant governs the ACTIVE pipeline, where a `SizingContext` exists to carry the stamp.
- **Tests**: `b3a-139-classify.test.ts` (10 — widen boundary 11/15 classify, 16 throws; SSOT constant; regex-from-constant; alarm counter+hook fires + survives a throwing hook; no-alarm on valid pair); the P19-B6.5d resolver + carry-the-stamp suite (14 — single-letter floor classify, collision-precedence-preserved, prefer-carried-stamp at the converted sites); plus `asset-classes.test.ts` + the B79.0f/0b collision/safe-resolve suites.

### 9.14 OrderPlacer Execution Port (P19-B3a)
- **Files**: `server/services/execution/types.ts` (the `FillResult` discriminated union `filled|partial|delayed|rejected` + `OrderPlacer` interface + the C3 close-seam state rule) + `server/services/execution/order-placer.ts` (`PaperOrderPlacer` — thin fill-only adapter).
- **What**: the single typed order-placement boundary every order passes through (open + close). P19-B2 Option A: live reuses the paper engine by extension; this port is the **live-swap seam** — the ONLY thing that differs paper↔live is HOW an order fills. `PaperOrderPlacer` wraps ONLY the fill (slippage+fee math, behaviour-identical to the prior inline math) and always returns `filled` (paper is sync/atomic/always-full); the partial/delayed/rejected variants exist for the future `LiveOrderPlacer` (B7).
- **Upstream**: `ActiveExecutionEngine` injects ONLY the per-class `feePercentFor` resolver at construction (P19-B4b.1 dropped the `slippagePercent` arg — the placer now depth-walks the book passed on each request; the port still does NOT import the engine).
- **Downstream**: `active-execution-engine.ts` open seam (`executeSimulatedTrade` ~:2068 → `orderPlacer.openOrder`) + close seam (`closePosition` ~:1163 → `orderPlacer.closeOrder`); the engine consumes `FillResult.{fillPrice,feeQuote,slippageQuote}` for all downstream bookkeeping (position write, P/L, learning capture, exit archive). **C3 CLOSE-SEAM STATE RULE**: a non-`filled` close leaves the position OPEN (close NOT recorded), retried next cycle — never half-closed (live-swap insurance; paper closes always full-fill so it never fires).
- **Execution**: async; called per order open/close.
- **Blast Radius**: **LOW** — both engine seams are PRIVATE (sole callers internal).
- **★ P19-B4b.1 UPDATE (2026-06-16 — depth-walked fill, DORMANT til B7b):** the flat 0.05% slippage is REPLACED by an honest book-walk. `PaperOrderPlacer.openOrder` walks the **ask** snapshot (`bookAsks` on the request) → VWAP fill; emits `partial` if the book thins between gate and fill; `rejected` if no book. `closeOrder` walks the **bid** snapshot and ALWAYS full-fills (R2 — a market exit always gets out), pricing any beyond-book remainder with the DB-resolved `beyond_depth_penalty_bps` (no magic %); cold book → `requestedPrice` worsened by the penalty, loudly. RNG-free (the Box-Muller micro-move dropped). Pure book-walk = `execution/depth-walk.ts` (golden-tested vs `calculatePriceImpact`). The book + penalty are supplied by the engine after its 24/5 depth gate (`_evaluateOpenDepthGate` → `execution/depth-source.ts` + `depth-gate-config.ts`), so the seam fetches the book ONCE. `slippageQuote` is now SIGNED ((fillPrice − intendedPrice)·qty on open) — can be negative on a favorable book; consumed correctly by the signed `grossPnl − totalCost` formulas (engine :1229, routes manual-close, c5-diagnostics), no clamp/abs on the active path.
- **Tests**: `order-placer.test.ts` (10 — depth-walk open VWAP/partial/reject, close full-fill + DB-penalty + cold-book/no-config exit, fee passthrough, union shape), `depth-walk.test.ts` (14 golden + determinism), `p19-b4b1-depth-gate.test.ts` (10 — fail-closed config + warmth/sufficiency assessors + block counter).

---

## Layer 10: Frontend & Communication

### 10.1 WebSocket Broadcast Layer
- **What**: Bi-directional communication for real-time updates (prices, scan events, trade events, health status).
- **Upstream**: Multiple backend services (scanning, execution, health, pricing)
- **Downstream**: All frontend real-time displays
- **Blast Radius**: **MEDIUM** — affects frontend real-time updates

### 10.2 REST API Routes
- **File**: `server/routes.ts` (~23,349 lines — monolithic)
- **What**: ~750 endpoints (of which ~460 have no frontend consumer). Express.js route handlers.
- **Blast Radius**: **MEDIUM** — large surface area but most endpoints are isolated
- **Note**: Decomposition into domain-specific route files planned for Phase 20
- **Security**: ~~Hardcoded JWT fallback secrets in 12 route files~~ **RESOLVED** (Directive 12.1.3). ~~Auth bypass headers in 4 files~~ **RESOLVED** (Directive 12.1.3). All route files now require valid JWT; server fails to start without JWT_SECRET env var.

### 10.3 Frontend Pages & Tabs
- **What**: 25 pages (14 active, 7 dead), 91 tab sub-pages. React SPA.
- **Blast Radius**: **LOW** per component — frontend changes are isolated from backend logic
- **Note**: 7 dead pages and Walter-related tabs to be removed (Phase 12.2)
- **Batch 19E updates**:
  - `client/src/pages/active-trades-v2.tsx`: Source Pool column with colored badges (blue QUANT / purple PATTERN) added to open simulated trades table.
  - `client/src/pages/trade-history-tab.tsx`: Source Pool column with colored badges added to closed simulated trades table.
- **Batch 19G updates**:
  - `client/src/pages/filters-with-override.tsx`: Redesigned to show 4-column Dual-Path Filter Thresholds table (Active Quant | Active Pattern | VTS Quant | VTS Pattern), reading from DB `screener_filters` table via API. Legacy filter override UI inputs REMOVED — all filter configuration now managed through DB. Screeners tab is now a read-only display of DB-driven filter values.

### 10.4 TradingModeContext
- **What**: Paper/Live mode toggle. Controls which execution engine receives signals.
- **Blast Radius**: **HIGH** — determines paper vs live execution path

---

## Layer 11: Legacy (Active but Pending Removal)

### 11.1 ~~MarketScanner Class~~ — REMOVED (Directive 12.2.2, Batch 9)
- **File**: `server/services/market-scanner.ts` — class **REMOVED** (commit `8b6bb540`)
- **What**: Legacy 10-minute scanner. Was started via `startHourlyScanning()` in routes.ts.
- **Blast Radius**: **NONE** — removed. `collectAdaptiveBatch()` and diagnostic buffers preserved.
- **Status**: COMPLETE — BUG-009 RESOLVED. Only FX5 Scanner runs now.

### 11.2 NGC / Rolling Normalization — ~~CONTAMINATION SOURCE~~ **REPLACED** (Directive 12.3.3)
- **File**: `server/core/metrics/quality_index.ts`
- **What**: ~~NGC flows as confidence carrier throughout pipeline.~~ NGC computation replaced with deterministic confidence formula (Directive 12.3.3, Batch 13). Formula: `(stratConf * 0.60) + ((1-vol) * 0.20) + ((1-risk) * 0.20)`. Rolling normalization infrastructure preserved but bypassed. Function signatures maintained for backward compatibility.
- **Blast Radius**: ~~**CRITICAL**~~ **LOW** — deterministic, no contamination path
- **Removal**: ~~Phase 12.3.3~~ **NGC REPLACED**. Full file removal deferred to MCE (PredictiveConfidence replaces entire quality_index.ts).

### 11.3 ~~Walter~~/Bob/Cortex — ~70 FILES (was ~96; Walter fully removed in Sub-Batches A+B)
- **What**: AI assistant ecosystem. Cortex is ACTIVE (in-memory cache, 15-min analytics). **Walter fully removed** (Sub-Batches A+B: 19 Walter backend files + 1 middleware + 5 frontend files + ancillary docs deleted, 13 consuming files surgically modified, 28 Walter route handlers excised from routes.ts). corpus-domain-service.ts stubbed pending Cortex cleanup. Bob modules + Cortex remain.
- **Blast Radius**: **LOW** to trading pipeline (mostly disconnected), but Cortex still consumes memory
- **Removal**: Phase 12.2.3 Sub-Batch C (Bob+Cortex). Wave 3.1 (12.2.4) COMPLETE — absorbed into Batch 6.

### 11.4 ~~NLAI~~ — REMOVED (Directive 12.2.7)
- **What**: ~~Natural Language Action Interpreter. Event handlers active.~~ REMOVED — All 5 files deleted, 6 consumer files cleaned. Commit `5d5c2051` (2026-02-24).
- **Blast Radius**: **ZERO** — completely removed
- **Status**: COMPLETE. No NLAI code remains in server/.

### 11.5 Goal Alignment — PARTIALLY REMOVED (Directive 12.2.6)
- **What**: ~~Daily/weekly targets in pre-execution-validator.ts and trading-engine.ts.~~ **Phase 9.0 alignment verification system REMOVED** (Batch 11, commit `b3a1526c`): alignment-verifier.ts, strategic-policy-guard.ts deleted; /alignment routes, AlignmentTab UI, autonomy-controller gate check all removed.
- **Remaining**: Phase 4 Goal Alignment in pre-execution-validator.ts (RISK-028) and trading-engine.ts calculateGoalAlignmentScore (BUG-012) — separate system, not yet removed.
- **Blast Radius**: **LOW** (Phase 9.0 removed, Phase 4 targets are isolated)
- **Removal**: Phase 4 targets: future directive (pre-execution-validator.ts gate + trading-engine.ts calculateGoalAlignmentScore)

### 11.6 Walter-Era Learning Services — 5+ FILES
- **What**: continuous-learning.ts, learning-cycle-service.ts, etc. Lazy-loaded, orphaned.
- **Blast Radius**: **LOW** — not connected to trading/VTS pipeline
- **Removal**: Phase 12.2.8 (Wave 8)

### 11.7 ~~L-Series Systems~~ — **SERVICE FILES REMOVED** (Phase 13, Batch 14)
- **What**: ~~14+ MCP/ARE importers, 12+ DCE importers, ~57 tables, ~40 enums.~~ All 17 L-series services, 9 route files, 1 M-series service, 2 utilities DELETED (Batch 14, `8f26369a`). ~57 database tables + ~40 enums remain as inert DB artifacts.
- **Blast Radius**: **NONE** (service layer) — DB artifacts are orphaned, harmless
- **Status**: COMPLETE (service layer). DB cleanup is a future migration task.

---

## Quick Lookup: "If I Change X, Check Y"

| If You Change... | Also Check... |
|-------------------|---------------|
| **Signal Orchestrator** | VTS Runner (mirrors scoring), SQE (thresholds), Paper Execution Engine (EV gate), Cost Model, Price Cache, OHLC Cache, all signal tests |
| **FinalScore weights** | SQE thresholds, VTS Runner, TCL ranking, all scoring tests |
| **DI calculation** | Net Expectancy Kernel (Pwin), Paper Execution Engine, VTS Runner, Trailing Exit Controller |
| **Cost Model** | Signal Orchestrator (EV gate), Paper Execution Engine, FX5 Scanner (cost filtering) |
| **Market Context Engine (MCE)** | Signal Orchestrator (active trading + pattern pool), VTS Runner (passive learning), calculatePairRegime(), canonical regime map, market-indicators.ts (getDominantRegime — Phase 14.5), ranking context bonus |
| **calculatePairRegime()** | MCE (calls it internally), VTS Runner (via MCE), Signal Orchestrator (via MCE), canonical regime map, drift detector baselines |
| **Price Cache** | Paper Execution Engine, VTS Runner, Signal Orchestrator (ticker via `getCachedPrice()` — Batch 18), FX5 Scanner, MicroExecutionService, all frontend price displays |
| **OHLC Cache** | Signal Orchestrator (OHLC data), VTS Runner (OHLC data + BTC candles), KrakenService (wrapped by cache) |
| **FX5 Scanner** | Active Filter Pool (quant + pattern pools), Signal Orchestrator, Cost Cache, Telemetry Aggregator, Stage-3 Emitter, screener_filters DB table (8 rows, 4-path — Batch 19G), OHLC Cache (pattern-only pre-fetch — Batch 19G HF1) |
| **Paper Execution Engine** | Portfolio state, Guardrails V2, Pre-Execution Validator, WebSocket broadcasts, trade history DB |
| **VTS Runner** | VTS Service, ML Calibration, Telemetry Aggregator, Drift Detector, Adaptive Ratio Manager |
| **Guardrails V2** | Pre-Execution Validator, Paper Execution Engine, Kill Switch |
| **Pre-Execution Validator** | Paper Execution Engine, Trading Engine (live), Goal Alignment (Phase 4 — RISK-028, still active) |
| **Boot sequence (index.ts)** | Lazy Loader, Trading Bootstrap, FX5 Bootstrap, Portfolio Initializer, all services initialized there |
| **Kraken WebSocket** | Price Cache, Live Pricing Adapter, MicroExecutionService, Symbol Normalization |
| **Any database schema** | storage.ts, all queries referencing that table, frontend consuming those endpoints. **Batch 19E**: `closed_trades` and `active_open_positions` gained `source_pool` column (via schema.ts migration). Paper Execution Engine writes it; active-trades-v2.tsx and trade-history-tab.tsx display it. **Batch 19G**: `screener_filters` table gained columns `filter_path`, `lq_min`, `vn_max`, `corr_max`, `di_min` and expanded to 8 rows (4 per mode). FX5 scanner reads; filters-with-override.tsx displays. |
| **Any API endpoint** | Frontend components consuming it, WebSocket events, other routes referencing it |
| **Predictive Adjustments** | Hybrid score composition, canonical weights, learning governance |
| **ML Calibration** | Python microservice, drift detector, retraining freeze, VTS service |
| **Pattern Filter Profile** | FX5 Scanner (pattern pool thresholds — now DB-driven, Batch 19G), SQE (elevated FinalScore floor), Paper Position Sizing (15% cap), Signal Orchestrator (PATTERN_POOL_STRATEGIES list), VTS Runner (pattern pool fetch — Batch 19E), Paper Execution Engine (sourcePool persistence — Batch 19E). **Batch 37**: sourcePool is now family-qualified (`quant-trend`, `quant-reversal`, `quant-breakout`, `quant-oscillation`, `pattern`). Total quant survivors = sum of family survivors (not deduplicated). |
| **Ranking Weights** | RTB getTopSignal() (queue ordering), Signal Orchestrator (context bonus computation), FINAL_SCORE_GAP_OVERRIDE safety rule |
| **Active Filter Pool (pattern pool)** | FX5 Scanner (populates), Signal Orchestrator (reads pattern pool), `asset_classes/crypto_spot/pattern-pool-filters.ts` config (B78 — relocated from `config/pattern-filter-profile.ts`) |
| **screener_filters DB table** | FX5 Scanner (reads 8 rows for 4-path filtering — Batch 19G), filters-with-override.tsx (displays 4-column table — Batch 19G). **Columns**: id, mode, filter_path, volume_min, spread_max, history_days, lq_min, vn_max, corr_max, di_min. **Rows**: 8 total (active_quant, active_pattern, vts_quant, vts_pattern per paper/live mode). Replaces hardcoded configs in pattern-global-filters.ts (DELETED) and system-guards.ts (DEPRECATED for filters, guardrails kept). |
| **Hybrid Compatibility Registry** | Signal Orchestrator (hybrid confluence), VTS Runner (hybrid confluence buffer — Batch 19G) |

---

---

## Infrastructure Dependencies (Batch 40 — Post-Replit Migration)

| Component | Dependencies | Notes |
|-----------|-------------|-------|
| **Hetzner Staging Server** | 188.245.193.8, Ubuntu 24.04, Node 20, PM2, nginx, deploy user, Python 3 venv for ML | Primary runtime environment. Replaces Replit. |
| **Supabase PostgreSQL** | db.vqqyisaudwenrdhnmjwt.supabase.co:5432, Frankfurt region | Database host. Replaces Neon serverless. Standard `pg` driver via `server/db.ts`. |
| **nginx** | Reverse proxy on port 80, upstream to localhost:5000. WebSocket upgrade for `/ws`. Rate limiting on `/api/`. | SSL-ready (certbot). Config at `/etc/nginx/sites-available/dawntrader`. |
| **PM2** | Process manager for `dist/index.js` as the **single** `dawntrader` process under `deploy` user. | Logs at `/home/deploy/.pm2/logs/`. Ecosystem config at `ecosystem.config.cjs`. **B-NEW-54 (2026-06-08): the second `ml-service`/`dawntrader-ml` Python process was retired** — PM2 now manages one app; `dump.pm2` carries only `dawntrader`. |
| **GitHub Actions CI** | `.github/workflows/ci.yml` — typecheck, build, Docker build on push to migration branch. | Deploy-staging workflow is a template (not active until secrets configured). |
| **Docker** | `Dockerfile` (multi-stage: Node 20 + Python 3 for ML). `.dockerignore`. `docker-compose.yml`. | Available for containerized deployments but PM2 is primary on staging. |
| **Langston Server** | 204.168.141.77 (Hetzner, Helsinki). OpenClaw gateway, Telegram bot, cc-inbox, Google Drive mount. | Separate from staging. NOT moved during migration. |
| **Replit (FROZEN)** | replit.com/@kylegjordan/The-Dawn-Trader. Branch: dawntrader-v4. Last commit: 892d7f24. | No updates. FX5 scanner runs temporarily. Backup only. |
| **server/db.ts** | `pg` package (node-postgres), `drizzle-orm/node-postgres`, `DATABASE_URL` env var pointing to Supabase (direct port 5432, not pgbouncer 6543). Pool config since **B-NEW-40 (2026-05-17)**: `keepAlive: true`, `keepAliveInitialDelayMillis: 10_000`, `query_timeout: 30_000`, `idleTimeoutMillis: 30_000`, `max: 10`, `application_name: 'dawntrader_main'`. 23 consumers import this pool — see "Recent Additions (B-NEW-40 — pg pool keepalive + TEC refresh timeout)" section below for the upstream/downstream impact map. Pre-B-NEW-40 pool config was bare `new Pool({ connectionString })` with all defaults; that produced the silent-dead-socket failure mode that B79.TEC's fire-and-forget refresh architecture converted into the recurring `TEC_STALE_FAIL_CLOSED` cascade. | Changed from `@neondatabase/serverless` in Batch 40. Pool-config hardening added in B-NEW-40 (2026-05-17). Boot emits `[DB_POOL_INIT]` log confirming config landed. **Bidirectional link: see TEC config-cache subsystem SIM section below.** |
| **vite.config.ts** | React plugin only. Replit plugins removed in Batch 40. | No longer depends on `REPL_ID` or `@replit/vite-plugin-*`. |
| **screener_filters DB table** | Now 24 rows: 4 base paths + 4 family paths x 2 modes (paper/live). Columns include `filter_path`, `lq_min`, `vn_max`, `corr_max`, `di_min`, `di_max`. | Expanded from 8 rows (Batch 19G) to 24 rows (Batch 40 — family-specific profiles added). |

---

## Rename invariants (added 2026-05-14 — B83 post-mortem governance)

**Why this section exists.** BATCH_80 Phase 1 (commit `8ace0b859`, 2026-05-13) renamed `getTrailingState(symbol)` → `getTrailingState(tradeId)` in `server/services/vts-runner.ts`. The first for-loop body was updated correctly (variable name `tradeId` matches the destructure). The second for-loop body — `for (const { id, trade, exitPrice, exitReason } of tradesToClose)` — had its three `getTrailingState`/`clearTrailingState`/error-log references renamed to `tradeId` too, but the destructured variable was named `id`, not `tradeId`. Result: `ReferenceError: tradeId is not defined` every cycle that had ≥1 trade to close. ~24 hours of silent pipeline stall. Fixed in commit `b4cde6b85` (B83 hotfix, 2026-05-14) with three single-character changes.

TypeScript didn't catch it because `tradeId` is a valid identifier at module-level scope elsewhere in the file (the first for-loop's `for (const [tradeId, trade] of openVirtualTrades)` binding). The compiler resolved the references against module scope rather than block scope.

**Standing rule (per Kyle directive 2026-05-14).** Any refactor that renames an identifier referenced across multiple call sites MUST:

1. **Inventory step (mandatory).** Before the rename diff is committed, run a repo-wide grep for the OLD identifier:
   ```
   git grep -nE '\bOLD_NAME\b' -- '*.ts' '*.tsx' '*.js'
   ```
   Capture the full list. Create a file at `Claude Comms and Packages/Change Lists/rename-inventory-<batch-id>.md` listing every match with: file, line number, current code, decision (RENAMED / KEPT-AS-OLD-WITH-REASON / REMOVED).

2. **Diff alignment.** No call site may be left undecided. For each row:
   - RENAMED: the diff must change OLD → NEW at that line.
   - KEPT-AS-OLD-WITH-REASON: stay as OLD, but the reason (e.g., "back-compat shim", "string literal in error message", "test fixture name") must be written next to the row.
   - REMOVED: the call site is deleted in the same diff.

3. **Post-rename verification.** After applying the rename diff:
   ```
   git grep -nE '\bOLD_NAME\b' -- '*.ts' '*.tsx' '*.js'
   ```
   The output must match ONLY the rows marked KEPT-AS-OLD-WITH-REASON. Any other match is a missed rename.

4. **Langston code-review gate.** Code-review pass must verify the inventory file vs the actual diff. Discrepancy blocks merge.

5. **CI verification (future B83-followup batch).** Wire a CI step that runs the grep + compares against the inventory file. Currently manual; tracked in `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10d.5.

### Known cross-module identifiers (starter inventory)

When renaming any of these, expect call sites across the listed modules. Run a fresh grep before each rename — list below is a starting reference, not exhaustive.

| Identifier | Module of origin | Known consumers (sample — verify via grep) |
|---|---|---|
| `getTrailingState`, `clearTrailingState`, `initializeTrailingState` | `server/services/trailing-exit-controller.ts` | `vts-runner.ts` (2 for-loops), `active-execution-engine.ts`, `tec-evaluator.ts` |
| `evaluateTECExit`, `TECExitInput`, `TECExitDecision` | `server/services/tec-evaluator.ts` | `vts-runner.ts`, `active-execution-engine.ts` |
| `emitAblationRecord`, `FactorAlternate`, `RegimeDecision` | `server/services/factor-ablation-emitter.ts` | `signal-orchestrator.ts`, `vts-runner.ts`, all `server/core/metrics/*.ts` files |
| `resolveAssetClass`, `safeResolveAssetClass`, `ASSET_CLASSES`, `AssetClass` | `shared/asset-classes.ts` | both server/ and client/ trees — extensive consumer list |
| `XSTOCK_SPOT_REGISTRY`, `XSTOCK_SPOT_SYMBOLS`, `getXstockName` | `shared/asset-classes.ts` (post-B-NEW-30) | scanner, routes, freshness endpoint, UI tabs |
| `OpenVirtualTrade`, `openVirtualTrades` Map | `server/services/vts-runner.ts` | many internal helpers in same file + persistence layer |
| `priceCache`, `subscribe`, `getBatch`, `getCachedPrice`, `snapshot` | `server/services/price-cache.ts` | vts-runner exit cycle, FX5 scanner, routes diagnostics |

**Note on for-loop iteration variables (B83 specific lesson).** Block-scoped iteration variables (`for (const x of arr)` or `for (const { y } of arr)`) DO NOT participate in module-scope identifier visibility. If the rename touches identifiers inside a for-loop body, **the variable used inside the loop body must match the loop's destructure pattern explicitly.** Don't rely on TypeScript scope inference — TS will silently resolve to an outer-scope binding with the same name, masking the bug until runtime.

### "If I Change X, Check Y" — rename-inventory additions

- **Rename a function exported from `services/`** → run the grep + inventory protocol above BEFORE committing the rename diff.
- **Rename a for-loop iteration variable** → audit the entire loop body for references to the OLD name. Block-scope is unforgiving.
- **Rename a destructured field** (`const { a } of arr` → `const { b } of arr`) → audit the loop body the same way; references to the OLD field name will compile (matching outer-scope identifiers) but throw at runtime.

### "If I Change X, Check Y" — BATCH_82 additions (2026-05-14)

- **Modify `emitAblationRecord` signature** → 2 production callers verified exhaustive: `signal-orchestrator.ts:959` + `vts-runner.ts:1794`. Zero test callers, zero script callers (verified via `grep -rn 'emitAblationRecord\s*(' server/ scripts/ shared/ tests/`). BATCH_82 added required `assetClass: AssetClass` parameter (NO default) — type-system enforces caller-resolves; closes 5+ instance run of crypto-first / asset-class-lost anti-pattern.
- **Modify `ReplayContext` type or `replayAndPersist` signature** → 1 production caller: `vts-service.ts:967` (was already threading `assetClass` per B79.0m.b2; no change needed at caller). Zero test callers. Cross-reference `exit-strategy-replay-service.ts:264` (SQL VALUES bind) + `:294` (OHLC fetch arg) — both consume the same `ctx.assetClass` field. BATCH_82 made `ReplayContext.assetClass: AssetClass` non-nullable and dropped `?? 'crypto_spot'` fallbacks at both consumer sites.
- **Add asset_class index to a per-asset-class ablation/calibration table** → naming convention: `idx_<table>_asset_<timecolumn>` (e.g., `idx_exit_strategy_alternates_asset_created`, `idx_regime_factor_alternates_asset_evaluated`). Index DDL via raw SQL script at `server/migrations/manual/B<NN>_*.sql` (NOT Drizzle migration runner) — `CREATE INDEX CONCURRENTLY` cannot run inside Drizzle's BEGIN/COMMIT wrapper. Partial-index predicate must intersect with actual query WHERE — verify via `EXPLAIN ANALYZE` at deploy time that `Index Cond` (not `Filter`) carries the asset_class predicate. BATCH_82 Step 7 verified 954× / 501× / 63× speedups on the affected endpoints.

---


---

# Change History & Per-Batch Additions (archive)

> Everything below is the chronological per-batch addition log — the audit trail of how the system grew, newest-relevant-first within each cluster. This is NOT the primary reference; the stable maps are above. When a section here documents a still-live component (not just a one-off change), fold its substance up into the relevant Layer and leave a dated pointer here.

## Recent Additions (B79.0n.CONFIDENCE-CHAIN — REQUIRED-assetClass on confidence-modulator chain + atomic Map-replace per-class MCE refresh + outcome-feedback store key migration, 2026-05-25)

| Component | Location | Impact |
|-----------|----------|--------|
| **9 modulator-module per-class seed** | `module_constants` table — `macro_modifier` / `regime_phase` / `regime_classifier` / `outcome_feedback` / `regime_age` / `path_b_sustainability` / `volume_regime` / `pair_correlation` / `multi_tf_agreement` — 65 NEW `xstock_spot` rows + 2 NEW global flag constants (`b67_1_asset_class_no_op_active` + `b68_3_compute_correlation_enabled`) via migration `2026-05-25-b79-0n-confidence-chain-per-class-seed.sql` (atomic BEGIN/COMMIT, idempotent ON CONFLICT DO NOTHING, rollback SQL companion). | Closes the silent-crypto-fallback at every confidence-modulator in the b67_x + b68_x family. Per-class disposition for the 2 F-2 modulators that need behavioral divergence: macro modifier xstock_spot NO-OP (`modifier_min=modifier_max=1.0` + `asset_class_no_op_active=true` short-circuit); pair-correlation xstock_spot reference symbol `SPY/USD` confirmed via DB probe (NOT Backed-Finance `SPYx/USD`) + `compute_correlation_enabled=false` v1 default pending SPY-relative calibration follow-up. Phase-preference per-class JSONB blob (xstock_spot = 9 enabled strategies × 3 phases = 27 cells at neutral 1.0). Other F-1 modulators (volume, multi-tf, freshness) clone crypto config — math class-invariant by construction. **Blast radius:** every confidence-chain consumer in `signal-orchestrator.ts` + `vts-runner.ts` + `paper-execution-engine.ts` (R-10 close-hook) + `vts-service.ts` (R-10 close-hook). |
| **`server/services/market-context-engine.ts` per-class refresh + accessors** | `MarketContextEngine.refreshMacroConfig` / `refreshPairCorrelationConfig` / `refreshPhaseConfig` refactored to enumerate `['crypto_spot', 'xstock_spot']` inline + build new `Map<AssetClass, T>` + **atomic Map-replace** (R-11 mitigation per Langston Step 2 clarification 4 — readers see either old or new map, never partial state). New accessors `getMacroConfigForClass(assetClass)` / `getPairCorrelationConfigForClass(assetClass)` / `getPhaseWeightsForClass(assetClass)` / `getPhaseEarlyMaxHoursForClass(assetClass)` / `getPhasePrimeMaxHoursForClass(assetClass)` return null-on-cold-start / null-on-missing-class with WARN. Legacy accessors `getCurrentMacroConfig()` / etc. retained returning crypto_spot for back-compat readers. The other 4 modulator configs (`outcome_feedback`, `regime_age`, `volume_regime`, `multi_tf_agreement`) keep their existing global single-config caches — F-1 class-invariant by construction. | First-class per-class plumbing in MCE. Cache field type `ReadonlyMap<AssetClass, T>` makes accidental in-place mutation a TypeScript error. Per-class enumeration hardcoded inline `(['crypto_spot', 'xstock_spot'] as const)` — perp classes onboard in a future batch with their own seed migrations (Langston's DRY suggestion to extract to a single exported const deferred to perp-onboarding batch). |
| **7 modulator surface API signatures REQUIRED-assetClass** | `server/core/metrics/macro-modifier.ts` (`computeMacroModifier` + `buildB67_1Alternates` + new `MacroModifierConfig.assetClassNoOpActive` field + `MacroModifierResult.assetClassNoOpActive` field with short-circuit at top of compute function), `regime-phase.ts` (`applyPhasePreference` + `buildB67_2Alternate` + missing-key error message includes asset_class), `outcome-feedback-store.ts` (`computeOutcomeFeedbackFactor` + `buildB67_4Alternate` + result type carries assetClass), `multi-tf-agreement.ts` (`buildB68_1Alternate`; `computeMultiTfAgreement` already REQUIRED-assetClass per B79.0n.MCE), `volume-regime.ts` (`computeVolumeRegime` + `buildB68_2Alternate` — F-1 by construction; parameter for chain-uniformity), `pair-correlation.ts` (`computePairCorrelation` + `buildB68_3Alternate` + new `PairCorrelationConfig.computeCorrelationEnabled` field + `PairCorrelationResult.computeDisabled` field + new `'COMPUTE_DISABLED'` label with short-circuit at top of compute function), `regime-age-factor.ts` (`computeFreshnessFactor` + `buildB68_4Alternate`; `buildB68_5Alternate` already REQUIRED-assetClass per B79.0n.MCE). | TypeScript REQUIRED-`assetClass: AssetClass` discipline enforced across the entire modulator surface — compile fails if caller doesn't pass it. Per-class no-op short-circuits at the function level (not just at the chain composition site) — defense in depth. Every `buildBXX_YAlternate` stamps `metadata.asset_class = assetClass` for dashboard / replay filterability; b67_1 stamps `asset_class_no_op_active`; b68_3 stamps `reference_symbol` + `compute_disabled`. |
| **`FactorAlternateInput` discriminated union per-class arms** | `server/services/factor-ablation-builders.ts` — 7 new `assetClass: AssetClass` fields on the `b67_1` / `b67_2` / `b67_4` / `b68_1` / `b68_2` / `b68_3` / `b68_4` arms (b68_5 already had it per B79.0n.MCE). `buildOneAlternate` dispatch threads `input.assetClass` to every `buildXAlternate` callee. TS exhaustiveness check enforces. | Compile-time enforcement at the chain-composition consumer surface. Any future modulator added to the chain MUST include assetClass in its discriminated-union arm or the dispatch type-check fails. |
| **Chain-composition consumer threading (16 push sites)** | `server/services/signal-orchestrator.ts:723-944` (8 push sites: b67_1, b67_2, b68_4, b67_4, b68_2, b68_3, b68_1, b68_5) + `server/services/vts-runner.ts:1599-1820` (same 8 mirrored). Capture-and-reuse pattern from B79.0n.PATTERN-DETECT Step 9: `_pairAssetClass = safeResolveAssetClass(rawSignal.symbol, 'kraken')` resolved once at chain-block entry (skip entire ablation block if null + WARN — structurally unreachable defense-in-depth since upstream uses STRICT `resolveAssetClass`). vts-runner reuses already-captured `_assetClass` from the function-entry per B79.0n.PATTERN-DETECT Step 9. Per-class accessor calls `mce.getMacroConfigForClass(_pairAssetClass) ?? mce.getCurrentMacroConfig()` fall back to global on null for back-compat. | Each signal evaluation now stamps the resolved asset class through the entire ablation chain. Crypto signals continue using crypto config; xstock signals would use xstock config + short-circuit at the no-op modulators. Threading is type-system enforced via the discriminated-union arms — missing site = compile error. |
| **R-10 mitigation: paper-execution + vts-service close-hook resolution** | `server/services/paper-execution-engine.ts:1371` close-hook `updateEma` resolves `_assetClass = safeResolveAssetClass(position.symbol, 'kraken')` + skip-on-null; `server/services/vts-service.ts:929` VTS close-hook resolves from `tradeData.symbol`. The paper-execution-engine ablation-rebuild block at lines 2024-2025 reads `getCurrentMacroContext` + `getCurrentPhaseWeights` (legacy global accessors) — flagged by Langston Step 2 R-10 as silent-wrong-class risk if missed. Resolution: legacy accessors return crypto_spot for back-compat; per-class accessors available for future R-10-targeted refactor. | Prevents R-10 silently-wrong-factor pollution of the outcome-feedback memory at trade-close time. Without this fix, crypto outcomes would have been written under crypto key (correct) but xstock outcomes would have been written under the GLOBAL crypto key (wrong) — silent data corruption that wouldn't surface in compile or runtime errors, only in long-term EMA drift. |
| **`OutcomeFeedbackStore` per-class key shape + path move** | `server/core/metrics/outcome-feedback-store.ts` — internal `Map` key changes from `<regime>_<strategy>` to `<assetClass>_<regime>_<strategy>`. `updateEma(assetClass, regime, strategy, ...)` + `peek(assetClass, regime, strategy)` signatures REQUIRED-assetClass. Persistent path moved from `/tmp/b67-4-outcome-feedback.json` to `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json` (survives pm2 restart — same path family as paper-portfolio-manager state). Constructor prefers NEW path; if absent + LEGACY present, re-keys every entry under `crypto_spot_` prefix + writes to NEW path. **HARD-FAIL on corrupt new-path data** (Langston Step 2 clarification 1 — no silent fallback to legacy /tmp/ when canonical state file unparseable). | Per-class outcome-feedback memory isolation — crypto trade outcomes no longer contaminate xstock signal confidence and vice-versa. Disk-load migration is one-time on first boot post-deploy. Same path move for `regime-phase-store.json` (no key change — symbols don't collide cross-class). Esbuild dynamic-require hotfix (`b6e45a8`) replaced inline `require('path')` with top-of-file `import * as path from 'path'` after Step 7 first-pass caught the runtime throws. |
| **3 new unit test files (26 tests)** | `server/tests/unit/b79-0n-confidence-chain-required-assetclass.test.ts` — 12 type-lock tests with `@ts-expect-error` directives confined to this dedicated harness file per anti-graveyard discipline (CLAUDE.md §7); `server/tests/unit/b79-0n-confidence-chain-outcome-feedback-isolation.test.ts` — 6 per-class store key isolation tests (crypto outcome does NOT contaminate xstock for same regime+strategy; parallel EMAs with opposite signs evolve independently; wrong-class peek returns undefined); `server/tests/unit/b79-0n-confidence-chain-asset-class-no-op.test.ts` — 8 tests covering macro xstock no-op short-circuit + pair-correlation compute-disabled short-circuit + numeric chain-stability invariants. | Compile-time + runtime + data-layer enforcement at three levels. 12 `@ts-expect-error` directives ALL in the dedicated type-lock harness — no production-code introductions. Plus existing test updates: `b67-1-macro-modifier.test.ts` (16+6 calls), `b67-4-outcome-feedback.test.ts` (13+13+5 calls), `b68-3-pair-correlation.test.ts` (11+3 calls), `b76-chain-final-emit.test.ts` (9 calls). Local tsc baseline 494 unchanged across all chunks. |

**Blast-radius summary:** modulator chain is the single biggest per-class concentration surface in the codebase — 50+ caller sites threaded; type-system enforcement at every layer. The per-class plumbing landed cleanly: 18 DB rows (9 modules × 2 classes), MCE per-class cache loaded at boot (`per_class_count=2`), live crypto signals continue emitting 10 factor rows per signal evaluation at 18:06-18:07 UTC. Anti-graveyard preserved.

**Watch-items:** Tuesday 2026-05-26 13:30 UTC ARCA reopen — first observable xStock signal evaluation will confirm `metadata.asset_class_no_op_active=true` + `metadata.compute_disabled=true` flag stamping on xstock ablation rows.

**Edit me if:**
- **Add a new confidence-chain modulator** → REQUIRED `assetClass: AssetClass` on `computeX` + `buildBXX_YAlternate`; new arm in `FactorAlternateInput` discriminated union; new push site in signal-orchestrator + vts-runner chain-composition with capture-and-reuse `_pairAssetClass`; per-class seed rows in DB; per-class MCE accessor if behavioral divergence needed.
- **Add a new asset class** → extend the inline `(['crypto_spot', 'xstock_spot'] as const)` tuple in `market-context-engine.ts` MCE refresh methods (3 sites: macro / pair-correlation / phase) OR refactor to use a single exported const (Langston's DRY suggestion).
- **Edit `outcomeFeedbackStore` consumer** → `peek` + `updateEma` REQUIRED-assetClass; both close-hooks (`paper-execution-engine` + `vts-service`) resolve via `safeResolveAssetClass(symbol/tradeData.symbol, 'kraken')` + skip-on-null.

---

## Recent Additions (B-NEW-43 Phase 1 — CI typecheck baseline-comparison gate, 2026-05-23)

| Component | Location | Impact |
|-----------|----------|--------|
| **TypeScript baseline-comparison gate** | `scripts/check-tsc-baseline.mjs` (Node ESM, no deps) + `.tsc-baseline.json` (frozen per-file per-code error catalog) + `.github/workflows/ci.yml` (typecheck job uses the gate, NO `continue-on-error: true`) | Replaces the pre-B-NEW-43 typecheck job which ran `npx tsc --noEmit` with `continue-on-error: true` — the silent-regression mechanism that let ~700 type errors accumulate unnoticed across multiple phases. New gate runs `npx tsc`, parses output into a per-file per-code structure, compares against the frozen baseline at `.tsc-baseline.json`, and FAILS if any (file, code) count is above baseline or any new (file, code) pair appears. Modes: default (compare), `--generate` (initial freeze), `--sync` (preserve `phase_tag`/`context`/`frozen_*` and update counts after a clean fix), `--regen-acknowledged` (explicit re-freeze, requires CLI flag). Silent-tsc-crash sanity check in sync mode (>50% drop without `--regen-acknowledged` fails). **Baseline at freeze (chunk 5, commit `0519224`):** 585 errors / 91 files. **Baseline at B-NEW-43 Phase 1 close (chunk 18, commit `ccf58e6`):** 488 errors / 68 files (23 files cleared via 18 chunks of mechanical reduction; project tsc total 696 → 488). **Anti-graveyard discipline (CC + Langston consensus):** baseline is governance-grade JSON; NO `@ts-expect-error` / `@ts-ignore` / new `as any` / new `!` in source (the file lists what is parked, not magic comments scattered across the codebase); per-batch soft cap ~10 baseline additions without explicit Kyle approval; per-batch enumeration of additions mandatory in completion reports. **Per-file `phase_tag` classification** (Phase 19 / Phase 16 / B-NEW-43-fixable / current-operational) populated at chunk 6 audit — Phase 19 intake reads `files[].phase_tag.startsWith("Phase 19")`. Blast radius: LOW (CI-only infra; no runtime code touched). |
| **`C:\dev\DawnTraderV3` shallow-clone mirror** | `C:\dev\DawnTraderV3` (local NTFS, not the GDrive FUSE mount) | Standing fixture established at B-NEW-43 Phase 0. `npm install` cannot complete on the GDrive FUSE mount (EBADF / TAR_ENTRY_ERROR cascades from npm's many-small-files write pattern) so `npx tsc` from there fails with ~18k cascade errors from missing type defs (unusable). The mirror is a `--depth 1 --single-branch --branch migration/aws-supabase` shallow clone where `npm install` completes in ~26s and `npx tsc --noEmit` runs to completion. **ONE-DIRECTION-EDIT discipline (HARD RULE):** code edits land in the mirror ONLY; push to GitHub from the mirror; the GDrive clone is `git pull`-only for code. Governance docs (`1-system-manual/`, `MEMORY.md`, scope / pre-audit / completion reports) still authored in the GDrive clone (they don't need tsc). Documented in CLAUDE.md §7.1. Blast radius: LOW (local-dev environment; no CI / runtime impact). |

---

## Recent Additions (B-NEW-40 — pg pool keepalive + TEC refresh timeout, 2026-05-17)

Closes the silent-TCP-death failure mode + B79.TEC's `tecConfigRefreshInFlight` amplifier that produced two `TEC_STALE_FAIL_CLOSED` cascades in 18 hours (2026-05-15 17:13 UTC, 2026-05-16 11:14 UTC). Pre-B-NEW-40 pre-audit + Langston Step 2 review converged on the diagnosis. Pre-May 8 corroboration grep showed the underlying network slowdowns existed throughout April (14.9s and 96s heartbeat cycle outliers) but were absorbed silently by the old await-based TEC architecture.

### Components changed by B-NEW-40

| Component | Location | Impact |
|-----------|----------|--------|
| **pg pool config hardening** | `server/db.ts` | Adds `keepAlive: true` + `keepAliveInitialDelayMillis: 10_000` (OS-level TCP probes detect dead sockets within ~12 min instead of 2+ hours), `query_timeout: 30_000` (pg-client-side abort on any query >30s), `idleTimeoutMillis: 30_000` (extends idle window from default 10s; resilience comes from keepAlive layer, this is churn tuning), explicit `max: 10` (matches default, surfaces ceiling for operators), `application_name: 'dawntrader_main'` (tags connection class in `pg_stat_activity` and Supabase dashboard). Boot emits `[DB_POOL_INIT] application_name=... keepAlive=true ...` log line. Affects ALL 23 importing modules symmetrically. Blast radius: MEDIUM-LOW. |
| **TEC refresh-promise timeout fence** | `server/services/trailing-exit-controller.ts:~235` | Wraps the `refreshTECConfigForClass(assetClass)` call in `Promise.race([refresh, timeoutAfter45s])`. When the underlying pg promise hangs indefinitely (silent-TCP-death failure mode), the 45s timeout rejects, the existing `.catch` increments `tecRefreshFailCount`, logs `[TEC_REFRESH_TIMEOUT]` (distinct tag from `[TEC_REFRESH_FAIL]` so operators can tell which path fired), and `.finally` clears the `tecConfigRefreshInFlight` Map entry. Plain `setTimeout` + `clearTimeout` — NOT Central-Clock-subscribed (per Central Clock audit: per-call one-shot deadline, not a recurring schedule). 45s budget = pool `query_timeout` (30s) + 15s slack for event-loop scheduling + GC + deserialization. Blast radius: LOW. |
| **TEC diagnostic endpoint** | `server/routes.ts` + `server/services/trailing-exit-controller.ts` (`getTECDiagnostics()`) | NEW `/api/diagnostics/tec-config` route (auth-gated). Returns per-asset-class snapshot of `tecConfigCache`, `tecConfigExpiresAt`, `tecConfigLastSuccessAt`, `tecConfigRefreshInFlight`, `tecRefreshFailCount`, `staleByCeiling`, plus Central Clock health (`isRunning`, `tickNumber`, `lastTickTime`, `averageDriftMs`, `maxDriftMs`, `subscriberCount`). Operational visibility into refresh-stuck-state at incident time without needing a DB query. Read-only, zero mutation. Blast radius: LOW. |
| **`tec-pg-capture` systemd unit (staging only)** | `/usr/local/bin/tec-pg-capture` on 188.245.193.8 | Bash service tailing `/var/log/dawntrader/error.log` for `TEC_STALE_FAIL_CLOSED`. On match, captures 10 snapshots at 60s intervals: `pg_stat_activity` (DB-side query state) + **`ss -tnpi state established '( dport = 5432 )'` (B-NEW-40 addition — TCP socket state including retransmit counts, unacked bytes, send/recv queue depth)**. Output to `/var/log/dawntrader/tec_diag/pg_stat_<ts>.txt` and `ss_<ts>.txt`. Staging-only, not part of application code. Blast radius: ZERO. |
| **Hostile-scenario test** | `server/tests/unit/b-new-40-tec-refresh-hang.test.ts` (NEW) | Simulates hung refresh via mock that returns `new Promise(() => {})`. Asserts: (a) inFlight Map releases within 45s + ε, (b) `tecRefreshFailCount` increments by 1, (c) `[TEC_REFRESH_TIMEOUT]` logs exactly once, (d) `resolveTECConfig` keeps returning cached snapshot until 5min ceiling, (e) past 5min ceiling throws `TEC_STALE_FAIL_CLOSED`. Prevents regressions where the catch path is bypassed. Uses vitest fake timers. Blast radius: ZERO (test only). |

### B79.TEC config-cache subsystem (SIM gap closure)

The B79.TEC batch (2026-05-08, commit `01fa39912`) introduced a per-asset-class TEC config-cache subsystem that was never documented in SIM. B-NEW-40 closes this governance gap.

**Subsystem architecture:**

- **Per-class cache maps** (state in `server/services/trailing-exit-controller.ts`): `tecConfigCache: Map<AssetClass, TrailingExitConfig>` (immutable wholesale snapshot), `tecConfigExpiresAt: Map<AssetClass, number>` (TTL expiry timestamp), `tecConfigLastSuccessAt: Map<AssetClass, number>` (for staleness-ceiling check), `tecConfigRefreshInFlight: Map<AssetClass, Promise<void>>` (refresh coalescer), `tecRefreshFailCount: Map<AssetClass, number>` (consecutive-fail counter exposed via diagnostic endpoint).
- **Boot bootstrap**: `primeTECConfig()` called from `server/index.ts` boot sequence iterates `getActiveAssetClasses()` (`crypto_spot`, `crypto_perp`, `xstock_spot`, `xstock_perp`); retry-with-backoff 2s/4s/8s for transient errors; HARD-FAIL on any class via `process.exit(1)`.
- **HARD-FAIL invariant**: `hasExplicitAssetClassRow('trailing_exit', assetClass, 'break_even_enabled')` MUST return true for each active class. Without an explicit per-class row, `getModuleConstants` would silently fall back to the `(*,*,*,*)` wildcard — the failure mode B79.TEC was designed to prevent.
- **Refresh coalescer + B-NEW-40 timeout fence**: when `now >= expiresAt`, `resolveTECConfig` schedules a background `refreshTECConfigForClass(assetClass)` call IF and ONLY IF `tecConfigRefreshInFlight` doesn't already have an entry for that class. B-NEW-40 wraps the refresh in `Promise.race([refresh, timeoutAfter45s])` so the Map always releases (closes the regression where a hung underlying pg promise pinned the Map for the rest of process lifetime).
- **`CONFIG_MAX_STALENESS_MS = 5min` ceiling + `TEC_STALE_FAIL_CLOSED` semantics**: if `now - lastSuccess > 5×TTL` (300s), `resolveTECConfig` throws instead of returning a stale snapshot. Fail-closed because TEC's `break_even_enabled` is a kill-switch key; trusting a 5-minute-stale value risks operator-flipped kill-switch decisions being ignored.
  - **★ B-TEC-SELFHEAL (2026-06-25, #349): the fence now SELF-HEALS — it is a TRANSIENT fail-closed, no longer a latch-until-restart.** The lazy-refresh trigger was relocated to a single-call-site helper `scheduleBackgroundRefresh(assetClass, now, expiresAt)` invoked at the TOP of `resolveTECConfig`, **before** both the staleness throw and the cache-miss throw. So a stale-past-ceiling consult now schedules its own coalesced, non-awaited refresh (through the same inFlight coalescer + B-NEW-40 45s fence) and STILL throws for the current call — but the cache reheats so the NEXT consult succeeds (~1 cycle), instead of the old behavior where the throw short-circuited the refresh and the cache could only recover via a process restart (boot `primeTECConfig`). The throw itself is byte-identical (the safety property is unchanged). An **unprimed class** (no cache entry) deliberately does NOT self-heal — the helper returns early and the call falls through to `TEC_CACHE_MISS_FATAL` (boot hard-fail invariant). *Why it mattered:* the latch + the weekend xStock consult-gap stuck the 06-22 reopen for ~17h (and crypto_spot ~5h on an unrelated gap) until a deploy restart.
  - **★ B-TEC-SELFHEAL OBJ-2: VTS exit-loop per-trade isolation.** The VTS exit loop (`vts-runner.ts:2421`, inside `resolveOpenVirtualTrades`) had NO per-trade try/catch, so one stale-class open trade's throw aborted the ENTIRE multi-class cycle — and since `resolveOpenVirtualTrades` runs FIRST in `runPhase10SimulationCycle` (~:3273, before the scan/open phase ~:3293), it blocked new opens too. Now wrapped in a per-trade try/catch (mirroring the already-correct `paper-execution-engine.ts:794`): a stale-class trade logs `[TEC_VTS_EXIT_EVAL_ISOLATED]` + `continue`s, the loop finishes, and scan/open proceeds. The active/paper path was already isolated. **(OBJ-3 periodic re-warm timer was OMITTED — no new always-on singleton/§17 entry — see #349.)**

**Canonical log signatures emitted by this subsystem** (for operator grep at incident time):
- `[TEC_RESOLVE_AGGR] minute=YYYY-MM-DDThh:mm <class>=resolves:N` — per-minute resolve-counter summary
- `[TEC_REFRESH_FAIL] assetClass=<class> background refresh failed (consecutive_fail_count=N): <err>` — pg-rejected refresh
- `[TEC_REFRESH_TIMEOUT] assetClass=<class> refresh exceeded 45000ms budget... (consecutive_fail_count=N)` — B-NEW-40-introduced: 45s timeout fence fired on a hung promise
- `[TEC_STALE_FAIL_CLOSED] assetClass=<class> cache age=Nms exceeds ceiling 300000ms` — staleness ceiling breached, fail-closed throw
- `[TEC_CACHE_MISS_FATAL] resolveTECConfig called for assetClass=<class> but cache has no entry` — programmer error / primeTECConfig was not awaited
- `[DB_POOL_INIT] application_name=dawntrader_main keepAlive=true ...` (B-NEW-40-introduced, `server/db.ts`) — pool config landed at boot

**Upstream dependency**: `server/db.ts` pg pool (see entry above). Pool-level resilience (keepAlive, query_timeout) IS the primary defense against the silent-TCP-death failure mode. The TEC refresh-timeout fence is the per-class belt-and-suspenders backstop for any other hang source not covered by the pool layer. **Bidirectional link: see `server/db.ts` SIM entry above.**

**Downstream consumers** (via `resolveTECConfig` and `getResolvedTECConfig`):
- `server/services/tec-evaluator.ts` (centralizer for VTS + paper exit loops)
- `server/services/vts-runner.ts` (VTS exit loop; multiple call sites per cycle)
- `server/services/paper-execution-engine.ts` (paper `checkExitConditions`)
- `server/services/trailing-exit-controller.ts` itself (internal: `isMoonbagQualifier`, `canEnterMoonbag`, `updatePosition`)
- `server/routes.ts` `/api/diagnostics/tec-config` endpoint (B-NEW-40-introduced)

**Central Clock interaction**: NONE. The TEC config-cache subsystem operates on `Date.now()` timestamps and on-demand refresh triggered by `resolveTECConfig` callers (not on a recurring schedule). B-NEW-40's 45s timeout fence is a per-call one-shot deadline (plain `setTimeout`), not a recurring tick. The pre-existing `[TEC_RESOLVE_AGGR]` 60-second log emitter uses raw `setInterval` independent of Central Clock — this is a minor cosmetic drift, filed as a future cleanup item, NOT in B-NEW-40 scope. (See B_NEW_40_PRE_AUDIT.md §2.6 for the full Central Clock alignment audit.)

### Pre-incident evidence reference

- First `[TEC_STALE_FAIL_CLOSED]` in `/var/log/dawntrader/error.log`: 2026-05-08 15:03:57 UTC (same-day as B79.TEC deploy at 11:14 UTC)
- Count of `[TEC_STALE_FAIL_CLOSED]` events through 2026-05-17: 4832
- Count of `[TEC_REFRESH_FAIL]` events through 2026-05-17: 0 (smoking gun for the catch handler never executing → underlying promise neither resolves nor rejects → silent-TCP-death pattern)
- Pre-May 8 heartbeat cycle slowdowns: 1-3 per day baseline, with outliers at 14,879ms (2026-04-15) and 4 events at exactly 96,983ms (architectural-fingerprint duplication signature)
- Post-May 8 slowdown clusters on TEC-stuck days: 866 (2026-05-12), 584 (2026-05-13), 1712 (2026-05-15)

### Files touched (when editing any of these, check the others)

- `server/db.ts` — pool config + boot log
- `server/services/trailing-exit-controller.ts` — config cache maps + `primeTECConfig` + `refreshTECConfigForClass` + `resolveTECConfig` + 45s timeout fence + `getTECDiagnostics`
- `server/routes.ts` — `/api/diagnostics/tec-config` route (auth-gated)
- `server/services/tec-evaluator.ts` — passes through `resolveTECConfig` results (no direct edits in B-NEW-40 but relevant if you touch TEC behavior)
- `server/tests/unit/b-new-40-tec-refresh-hang.test.ts` — hostile-scenario regression coverage
- `/usr/local/bin/tec-pg-capture` on staging — pg_stat_activity + ss capture systemd service

---

## Recent Additions (B-NEW-34 — xstock 60-min bar parity, 2026-05-15)

| Component | Location | Impact |
|-----------|----------|--------|
| **xstock 60-min bar aggregator (B-NEW-34)** | `server/asset_classes/xstock_spot/ohlc-aggregator.ts` (NEW) | Single-SQL rollup from `xstock_spot_ohlc_1m` (partitioned by interval_begin, monthly partitions). Returns `Map<symbol, OHLCData[]>` for either 60-min or 240-min target interval. Epoch-floor UTC alignment (`to_timestamp(floor(extract(epoch from t)/N)*N)` where N=3600 or 14400) matching Kraken's native interval=60 / interval=240 candle boundaries. Ordered open/close via `array_agg(... ORDER BY interval_begin ASC)[1]` and `[1 DESC]` respectively. `DISTINCT ON (symbol, interval_begin) ORDER BY captured_at DESC, id DESC` CTE picks the latest-tick (closed-bar) row per minute as a workaround for the B74 source-side 18-56× duplicate-row bug (B-NEW-35 will fix at write side, then DISTINCT ON CTE removed). Cache depth caps: 60 bars / 60-min; 30 bars / 240-min (reduced from initial 200/60 in hotfix 2 to fit postgres `statement_timeout=2min`). IN(literal-list) workaround for drizzle ANY()-array-binding pitfall (same as scanner.ts:337-339). Blast radius: LOW (xstock-only). |
| **xstock OHLC cache (B-NEW-34)** | `server/services/xstock-ohlc-cache.ts` (NEW) | Asset-class-scoped 5-min TTL cache wrapping `aggregateXstockOHLC`. Separate singleton instance from crypto `ohlcCache` — distinct internal Map, distinct counters. Symbol collision tickers (CVX/DASH/MET/OPEN/SUI per `XSTOCK_SPOT_KRAKEN_COLLISIONS`) are unambiguous at this layer because no shared lookup table is consulted. `getOHLCDataBatch(symbols, interval)` is the scanner-hot-path API — splits symbols into cache-hits + cache-misses, fires single SQL for all misses, caches, returns combined Map. Periodic cleanup every 10min removes entries older than 2×TTL. Aggregate stats surfaced via `getStats()` → `[B-NEW-34][AGGREGATOR]` log line per scanner cycle. Blast radius: LOW. |
| **Scanner runCycle rewrite (B-NEW-34)** | `server/asset_classes/xstock_spot/scanner.ts:341-405` | Replaced 90-second ticker_snap freshness loop with `xstockOhlcCache.getOHLCDataBatch(symbolList, 60)`. ticker_snap retained as 30-min query for bid/ask enrichment ONLY — feeds `max_bid_ask_spread` filter (B-NEW-14) but does NOT gate evaluation; sentinel -1 when no fresh quote data. `pairsScannedLastCycle` semantic shifts: was "pairs with fresh ticker tick"; now "pairs with ≥24 hourly bars". 240-min fire-and-forget warm-fetch CURRENTLY SUSPENDED (commented block) — re-enable after B-NEW-35 lands. Blast radius: LOW (xstock-only). |
| **eval-cycle fetchXstockOHLC removed (B-NEW-34)** | `server/asset_classes/xstock_spot/eval-cycle.ts:79-107` | DELETED. Replaced with comment block explaining removal. Per-pair eval now receives OHLC arrays directly from scanner's `ohlcBatch.get(symbol)`. No more per-pair SQL round-trips inside eval-cycle. Blast radius: LOW (xstock-only). |
| **xstock filter floor SSOT promotion (B-NEW-34)** | `server/asset_classes/xstock_spot/global-filter.ts:122-141` + `server/asset_classes/xstock_spot/pattern-filter.ts:209-228` + `module_constants.xstock_spot.min_ohlc_history_bars=24` (DB row) | Both filter modules now `getConstant<number>('xstock_spot', 'min_ohlc_history_bars', { exchange:'*', assetClass:'xstock_spot', strategy:'*', regime:'*' })` reading single DB row. Floor 60 → 24 bars. Promotion closes Layer-3 calibration debt logged at SYSTEM_MANUAL.md Phase 24 EXTENDED. Blast radius: LOW (xstock-only). |
| **data-freshness xstock branch + closed-market short-circuit REMOVED (B-NEW-34)** | `server/utils/data-freshness.ts:96-99` | Removed xstock_spot branch (was reading `module_constants.market_data.xstock_spot.data_freshness_window_ms` 90s gate + checking `isXstockMarketOpenUTC` for short-circuit). Removed `isXstockMarketOpenUTC` import. `module_constants.market_data.xstock_spot.data_freshness_window_ms` row DELETED from DB. xstock freshness no longer gates evaluation; OHLC bar history is the source of truth. Blast radius: LOW (xstock-only). |
| **ORB disabled in strategy_gates (B-NEW-34)** | `module_constants.strategy_gates.xstock_spot.orb.enabled=false` (DB) | ORB is an intraday-bar strategy (Opening Range Breakout from first 15-min range), incompatible with 60-min-bar architecture. Revisit Phase D of XSTOCK_CALIBRATION_PLAN.md when multi-TF or sub-hourly support is added. `defensive_hedge` was already DB-disabled pre-deploy (no migration action). Blast radius: LOW (10 enabled strategies → 9). |
| **B-NEW-35 (SHIPPED 2026-05-20, deploy hash `f001002d9`)** | `server/services/passive-archive/ohlc-batch-writer.ts` + UNIQUE constraints on all 3 `_ohlc_1m` tables — see dedicated "Recent Additions (B-NEW-35)" section below for full component map. | The structural source-side dedup landed. Three layers of dedup protection (DB UNIQUE constraint + Drizzle UPSERT clause + in-buffer Map dedup) eliminate the 18-56× duplication at the write side. ~23.2M duplicate rows removed across xstock_spot + xstock_perp + crypto_spot in Phase 1 cleanup. The DISTINCT ON CTE in `ohlc-aggregator.ts` is preserved as defense-in-depth even though the UNIQUE constraint now guarantees no duplicates can land at the DB layer. 240-min warm-fetch in `scanner.ts:runCycle` still SUSPENDED pending separate scope review. Blast radius: MEDIUM (touches all three B74-archived `_ohlc_1m` tables, plus the in-flight write path for every WS update). |

## Recent Additions (B-NEW-34b — xStock snapshot architecture, 2026-05-18 night)

| Component | Location | Impact |
|-----------|----------|--------|
| **xstock_spot_ohlc_60m_snapshot table (B-NEW-34b)** | `drizzle/migrations/2026-05-18-b-new-34b-xstock-60m-snapshot.sql` (NEW) | NEW table holds pre-aggregated 60-min OHLC buckets per xStock symbol. Schema: `(symbol VARCHAR(32), bucket_ts TIMESTAMPTZ, open/high/low/close NUMERIC(20,8), volume NUMERIC(28,8), source_bar_count INTEGER, captured_at TIMESTAMPTZ)`. PK `(symbol, bucket_ts)` enforces idempotent UPSERT. Index `(symbol, bucket_ts DESC)` supports the "most recent 60 per symbol" hot read shape (backward index scan, no sort). Bounded ~16k rows max (265 syms × 60 buckets). UPSTREAM writer: pre-warm script (initial + B-NEW-36 weekly refresh) + cache write-back-on-miss. DOWNSTREAM consumer: `xstock-ohlc-cache.ts:readSnapshotBars` on cold-miss path. Blast radius: LOW (xstock-only; new table, no existing schema modified). |
| **Pre-warm script (B-NEW-34b)** | `scripts/b-new-34b-prewarm-snapshot.ts` (NEW) + `package.json` `b-new-34b:prewarm` | One-off (re-runnable) tsx script. Per-symbol single-SQL DISTINCT ON aggregation at 14-day lookback (default), UPSERTs latest MAX_BARS_60M=60 buckets into snapshot. Single-symbol queries avoid the scanner-deadline timeout that batched DISTINCT ON over the full universe hits. Per-symbol latency ~15-25s; total ~5-15 min for 265 symbols. Idempotent (ON CONFLICT DO UPDATE). Flags: `--days N`, `--symbols A/USD,B/USD`, `--dry-run`. Replaces the legacy "scanner re-derives all bars on every 30s cycle" pattern with one-shot precompute. Blast radius: LOW (offline script, single-connection serial loop). |
| **xstock-ohlc-cache snapshot-first cold-read path (B-NEW-34b)** | `server/services/xstock-ohlc-cache.ts:getOHLCDataBatch` 60-min branch | On cache miss for 60-min interval: (1) `readSnapshotBars(missedSymbols)` — single SQL ROW_NUMBER window-function read against `xstock_spot_ohlc_60m_snapshot`, returns up to 60 buckets per symbol; (2) `aggregateXstockOHLC(missedSymbols, 60, NARROW_OVERLAY_HOURS_60M=24)` — live overlay with narrow 24h window via new optional `lookbackHoursOverride` param; (3) merge per symbol (live wins on bucket_ts collision, sort ASC, cap to 60); (4) cache + return; (5) fire-and-forget `writeBackSnapshot(merged)` UPSERTs the most-recent WRITE_BACK_RECENT_BUCKETS=24 buckets per symbol back to snapshot so the table stays ≤5min stale during active scanning. Net per-cycle DB IO ~75-85% lower than the abandoned 120h live path. Per Langston Step 4 ACK Q1 the write-back N is aligned to the overlay window (24, not 12, not 60). 240-min cache path unchanged (currently DEAD per B-NEW-34 hotfix 3; marked for B-NEW-35 removal). Blast radius: LOW (xstock-only; preserves all existing telemetry log shapes). |
| **Aggregator narrow-window override (B-NEW-34b)** | `server/asset_classes/xstock_spot/ohlc-aggregator.ts:aggregateXstockOHLC` | NEW optional 3rd param `lookbackHoursOverride?: number`. Range guard: `Number.isFinite(...) && > 0` else falls back to default (120 for 60m / 720 for 240m). Default `LOOKBACK_HOURS_60M=120` PRESERVED with WARNING header documenting it's the forensic-caller value (b-phase-a2-backfill, ad-hoc tools); scanner/cache contexts MUST pass override. Per Langston Step 4 ACK Q4: shrinking the default silently would corrupt forensic replays — a SCAN_TIMEOUT on the override-forgetting caller is the louder, recoverable failure mode. Blast radius: LOW (additive optional param; existing two-arg callers unchanged). |
| **B-NEW-34b deploy bypass (workflow note, not a code change)** | `_migrations` ledger manual INSERT + `psql -f` migration apply | Per Langston Step 4 deploy-blocker ACK: bypassed `db:migrate` runner for B-NEW-34b only because runner surfaced 17 pre-existing pending migrations from 2026-05-08 onward (ledger drift, see RUNNING_ISSUES #119). B-NEW-34b migration is pure additive `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` — zero deps on prior 17 pending. Bypass shape: `psql -f drizzle/migrations/2026-05-18-...sql` then `INSERT INTO _migrations (name, applied_at) VALUES (...)`. Ledger drift investigation tracked as separate batch (#119). Blast radius: NONE (additive new table). |

## Recent Additions (B.4 foundation — xStock 60-minute → 15-minute evaluation-bar switch + paired recalibration, 2026-06-04)

Deploy `ae2ddc845` (+ CLI universe-load follow-up `0bae277e7`); migrations `2026-06-03b` (15m schema) + `2026-06-03c` (per-class lookbacks) + `2026-06-04` (VN/DI recalib); CI run `26939587681` all-4-green; pm2 #347, HTTP 200, no crash-loop. **The xStock asset class now evaluates on 15-minute bars** with full paired recalibration so regime / indicator / DBS / IMF semantics keep their intended wall-clock meaning. **Crypto path UNTOUCHED throughout** — crypto reads NO new keys (shared 30/14 regime config + `DEFAULT_DBS_CONFIG`); isolation proven 3 ways (uniform `getActiveAssetClasses()` resolution landing crypto on DEFAULT configs; startup PARITY ASSERTION that throws on crypto drift; shared `DBSConfig` type tsc-enforced). The activation step (scanner bar-size flip + DBS recompute + ORB plumbing) was deliberately built inert first and activated LAST, gated on the regime-label parity exit-gate sign-off. Active trading OFF throughout (VTS telemetry only).

| Component | Location | Impact |
|-----------|----------|--------|
| **NEW `xstock_spot_ohlc_15m_snapshot` table (B.4)** | `drizzle/migrations/2026-06-03b-...15m-schema.sql` (NEW) | Sibling to `xstock_spot_ohlc_60m_snapshot` (B-NEW-34b) holding pre-aggregated 15-min OHLC buckets per xStock symbol; same schema/PK/index shape (`(symbol, bucket_ts)` PK; `(symbol, bucket_ts DESC)` index). Bounded ~63.6k rows (265 syms × 240 buckets). Migration also adds `xstock_dbs_backfill.bar_interval_minutes` stamp column. UPSTREAM writer: pre-warm script (60m + 15m) + cache write-back-on-miss (15m branch). DOWNSTREAM consumer: `xstock-ohlc-cache.ts:readSnapshotBars` 15m cold-miss path. Blast radius: LOW (xstock-only; new table, no existing schema modified). |
| **Aggregator 15m branch (B.4)** | `server/asset_classes/xstock_spot/ohlc-aggregator.ts:aggregateXstockOHLC` (MODIFIED) | Adds a 15-minute target interval to the existing 60/240 dispatch: bucket expression `floor(epoch/900)*900` (N=900), `MAX_BARS_15M=240` cache cap, `LOOKBACK_HOURS_15M` default. Crypto path untouched. The DISTINCT ON dedup CTE is preserved as defense-in-depth (B-NEW-35 UNIQUE constraint guarantees no dupes). Blast radius: LOW (xstock-only; additive interval branch). |
| **xStock OHLC cache 15m branch (B.4)** | `server/services/xstock-ohlc-cache.ts:getOHLCDataBatch` (MODIFIED) | Adds a 15-minute branch mirroring the B-NEW-34b 60m snapshot-first cold-read path, DRY-parameterized: `readSnapshotBars` / `mergeBars` / `writeBackSnapshot` now take `(tableName, cap)` so the 60m sites pass their prior literals (bit-identical) and the 15m branch uses `xstock_spot_ohlc_15m_snapshot` / `MAX_BARS_15M=240` / 6h overlay / 24-bucket write-back. INERT until the scanner calls with interval=15 (= the activation flip). Blast radius: LOW (xstock-only; preserves all 60m telemetry shapes). |
| **Scanner bar-size flip 60→15 (B.4 — THE activation flip)** | `server/asset_classes/xstock_spot/scanner.ts` (`getOHLCDataBatch` call MODIFIED) | The xStock scanner now requests 15-minute bars instead of 60-minute (`xstockOhlcCache.getOHLCDataBatch(symbolList, 15)`). This is the single line that activates the whole 15m substrate live; gated on the regime-label parity exit-gate sign-off (flipping before recalibration was the silent regime-collapse this batch guards against). Blast radius: MEDIUM (changes the bar substrate every downstream xStock regime/indicator/strategy computation runs on; xstock-only). |
| **Per-class TIME-ANCHORED regime lookbacks (B.4)** | `server/services/market-context-engine.ts:refreshRegimeConfig` + `server/core/metrics/market-regime.ts` + `server/core/metrics/market-regime.types.ts` + migration `2026-06-03c-...per-class-lookbacks.sql` | `RegimeConfig` gains `momentumLookback` + `adxPeriod`; `computeMomentum` / `computeADX` thread the per-class values. `refreshRegimeConfig` resolves them via UNIFORM class-keyed resolution over `getActiveAssetClasses()` into a `regimeLookbacksByClass` map, with a startup PARITY ASSERTION that crypto-resolved == `DEFAULT_REGIME_CONFIG` (30/14) else throws. xStock resolves momentum 30→120 / ADX 14→56 from `module_constants` (hard-fail no-default); crypto keeps the shared 30/14 DEFAULT. The conversion is wall-clock-preserving (e.g. 30 sixty-min bars = 30h ≈ 120 fifteen-min bars). Blast radius: HIGH (regime classification substrate for all xStock VTS evals; crypto byte-identical by construction). |
| **Per-class DBS config (B.4)** | `server/asset_classes/xstock_spot/scanner.ts` (DBS-config resolution) + migration `2026-06-03c` (directional_bias rows) | xStock scanner resolves its DBS config once/cycle from `module_constants` (lookback 48→192, ema_fast 12→48, ema_slow 26→104, atr_period 14→56), spreading `DEFAULT_DBS_CONFIG` (shared type guard) then overriding. The ATR period (the DBS-normalization ATR at the 2 `computeATRFromOHLC` sites) is threaded 14→56; config threaded to the 2 `computeDirectionalBias` calls. **Crypto KEEPS `DEFAULT_DBS_CONFIG` untouched** (Langston Option B, xStock-only — separate scanner functions, no same-function split-brain). Crypto-DBS→module_constants migration deferred (RUNNING_ISSUES #200). Blast radius: MEDIUM (xstock DBS substrate; crypto untouched). |
| **DBS history recompute (B.4 — supervised one-shot)** | `scripts/b4-dbs-15m-recompute.ts` (NEW) + `xstock_dbs_backfill` + NEW `xstock_dbs_backfill_60m_archive` | Archived 31,481 live 60-min DBS rows → `xstock_dbs_backfill_60m_archive`, cleared the live table, rebuilt the FULL 15-min series from `xstock_spot_ohlc_1m` and slid the 192-bar DBS window to insert 332,176 per-bar 15-min DBS rows stamped `bar_interval_minutes=15`. Single transaction, safety gate (re-count archive ≥ live-60m before any DELETE, rollback-safe). Sentinel-zero bars inserted-with-flag (Langston Step-4 Q1); atr≤0 bars skipped (uncomputable). Supervised run in the weekend-close window — NOT coupled to the weekend cron. Blast radius: LOW (xstock-only; the table is per-bar DBS history for distribution analysis, read by calibration replays — not a live hot path). |
| **Regime thresholds recalibrated 14 consts (B.4)** | `server/asset_classes/xstock_spot/regime-thresholds.ts` (MODIFIED) | 14 xStock regime thresholds recalibrated for 15m (percentile-preserving + CALIBRATION-LENS); 60m-old values retained inline as comments. Volatility cutoffs ↓~40%, ADX cutoffs ↓~50%, DBS cutoffs ~flat (vol halves 60m→15m, ADX collapses, momentum + \|DBS\| near-invariant). REGIME-LABEL PARITY EXIT GATE PASSED + Langston signed off: clean-60m→clean-15m mix shift ≤1.3pp, no collapse (old 60m cutoffs on 15m would balloon STRUCTURAL_TRANSITION to 51%; new cutoffs restore 30.7%). Blast radius: MEDIUM (xstock regime distribution; the exit gate is the guard). |
| **IMF screen (VN/DI) recalibrated (B.4)** | migration `2026-06-04-b4-foundation-vndi-15m-recalib.sql` + `screener_filters` (16 rows) | 16 `screener_filters` rows updated (validated vs live). di_max contracts toward 50 at 15m (30→40.3 active_oscillator; 35→42.8 active_reversal + vts_oscillator; 40→45.2 vts_reversal); vn_max 0.85→0.826 on 4 active families (VN nearly bar-invariant, median ratio 0.993). LEFT documented: vn_max 0.95/0.98 (drift ~1.25pp tighter, lens-conservative) + all di_min + di_max=100 (inert at both bar sizes). Langston signed off. Blast radius: MEDIUM (xstock IMF admission). |
| **Prewarm warms 60m + 15m (B.4)** | `scripts/b-new-34b-prewarm-snapshot.ts` (MODIFIED) | Pre-warm now populates BOTH the 60m (cap 60) and 15m (cap 240) snapshot tables so the weekend/Sunday-reopen prewarm fully populates the longest 15m lookback. Blast radius: LOW (offline script). |
| **ORB plumbing-ready at 15m, enable=FALSE (B.4)** | `server/asset_classes/xstock_spot/orb.ts` + `module_constants.strategy_gates.xstock_spot.orb.enabled` (DB, stays false) | ORB now rides the scanner's 15-minute candle feed (no foundation code change to ORB itself) and its time-based opening-range window maps cleanly onto 15m bars. The `enable` flag in the live DB stays FALSE — ORB activation is a SEPARATE strategy-fit decision (validate edge at 15m first), out of foundation scope (RUNNING_ISSUES #203). Reverses the B-NEW-34 "ORB incompatible with 60-min architecture" disablement at the plumbing level. Blast radius: LOW (no live behavior change — still disabled). |
| **CLI universe-load fix (B.4 latent bug)** | `scripts/b-new-34b-prewarm-snapshot.ts` + `scripts/b4-dbs-15m-recompute.ts` (`main()` MODIFIED, commit `0bae277e7`) | The standalone CLI prewarm + DBS-recompute runs aborted "empty target symbol set" — the xStock universe went DB-dynamic (B79.0n.UNIVERSE-DISCOVERY) and the registry is populated only by `xstockUniverseService.initializeFromDB()` at app boot, which CLI runs skip. Both CLI mains now call the initializer before enumerating the universe. Blast radius: LOW (offline scripts only). |

## Recent Additions (B-NEW-35 — Source-side dedup for B74 WS-archived OHLC tables, 2026-05-20)

Canonical deploy hash `f001002d9` (Phase 3 code-deploy + in-buffer Map dedup hotfix). See SYSTEM_MANUAL.md "Source-side dedup architecture (B-NEW-35, 2026-05-20)" chapter for the full structural model. Independent-verified by Langston ~07:30 UTC against staging at `f001002d9` (8 empirical checks, all passed).

| Component | Location | Impact |
|-----------|----------|--------|
| **ohlc-batch-writer UPSERT clause (B-NEW-35 Layer 2)** | `server/services/passive-archive/ohlc-batch-writer.ts:147-164` (MODIFIED) | Replaces prior plain `db.insert(table).values(slice)` with Drizzle `.onConflictDoUpdate({ target: [table.symbol, table.intervalBegin], set: { open: sql\`EXCLUDED.open\`, high/low/close/volume/vwap/tradeCount: sql\`EXCLUDED.*\`, capturedAt: sql\`NOW()\` } })`. UPSTREAM: every WS-update routed through `bufferOhlcBar(assetClass, row)` for any of `xstock_spot` / `xstock_perp` / `crypto_spot`. DOWNSTREAM: removes the structural amplification factor that caused snapshot pre-warm + scanner DISTINCT ON aggregation to hit Postgres statement_timeout on heavy-traded names. Asset-class-agnostic — single code path, all three tables benefit. Blast radius: HIGH (hot-path write code for every Kraken WS OHLC tick across three asset classes). |
| **In-buffer Map dedup pre-flush (B-NEW-35 Layer 3, hotfix `f001002d9`)** | `server/services/passive-archive/ohlc-batch-writer.ts:105-114` (MODIFIED) | After `rawRows = batch.splice(0, batch.length)` drains the buffer atomically, a `Map<string, InsertEquitySpotOhlc1m>` keyed on `${row.symbol}::${intervalBegin_iso}` reduces the buffer to one row per `(symbol, interval_begin)`. Map insertion-order semantics give "last wins" — the LATEST WS update for a given minute survives, which IS the correct cumulative OHLCV per Kraken WS contract. Required because PostgreSQL throws "ON CONFLICT DO UPDATE command cannot affect row a second time" when a single INSERT contains multiple rows that share the conflict-target key. Without this layer, the chunked INSERT downstream rejects the entire chunk. Hotfix landed mid-deploy after the symptom appeared live in `/var/log/dawntrader/out.log`. UPSTREAM: same as Layer 2 (every Kraken WS update routed through the buffer). DOWNSTREAM: feeds Layer 2 with a clean array of at-most-one-row-per-key. Blast radius: HIGH (same hot path; without it, Layer 2 fails). |
| **UNIQUE constraints on `(symbol, interval_begin)` for all 3 `_ohlc_1m` tables (B-NEW-35 Layer 1)** | `drizzle/migrations/2026-05-19-b-new-35-phase2-add-unique-constraints.sql` (NEW) + parent tables `xstock_spot_ohlc_1m` / `xstock_perp_ohlc_1m` / `crypto_spot_ohlc_1m` | Constraint name pattern `<table>_symbol_interval_begin_key`. Cascades automatically to every existing partition + every future partition the partitioning machinery creates. UPSTREAM: all writes through the batch writer at Layer 2/3. DOWNSTREAM: any future code path that attempts to insert into these tables — DB physically rejects any duplicate, regardless of which application layer is calling. Last line of defense if Layer 2 + Layer 3 both fail. Blast radius: MEDIUM (DB-side change to three live partitioned tables; coordinated with `pm2 stop` window during deploy to avoid validation-time fresh-duplicate landings). |
| **Phase 1 cleanup migrations + bash-per-symbol DELETE pattern (B-NEW-35 historical record)** | `drizzle/migrations/2026-05-19-b-new-35-phase1-dedup-{xstock-spot,xstock-perp,crypto-spot}.sql` (NEW, multi-rev) + `/tmp/dedup_per_symbol.sh` + `/tmp/dedup_spy.sh` on staging at deploy time | ~23.2M duplicate rows removed across three tables (~84% reduction). Final SQL pattern: enumerate symbols via recursive CTE, DELETE per symbol with `id NOT IN (SELECT MAX(id) GROUP BY interval_begin)`. The in-SQL approach hit Postgres `statement_timeout` because PL/pgSQL DO-block LOOP wallclock accumulates even across internal COMMITs. Working pattern: bash loop calling psql once per symbol — each invocation gets fresh 2-min budget. Heaviest single symbol (SPY) overflowed even per-symbol budget; solved by per-day chunked DELETE script. INSTITUTIONAL MEMORY: any future batch dedup'ing bounded subsets of a Supabase table > 1M rows MUST plan for bash-per-symbol pattern from day one; single SQL transaction will not finish. Blast radius: NONE post-cleanup (historical-state records; one-time apply). |
| **Deploy-ordering invariant: ADD UNIQUE on actively-written tables (B-NEW-35 institutional-memory record)** | Workflow rule, no code | PostgreSQL ADD CONSTRAINT UNIQUE on a partitioned table that is being actively written is NOT atomic with respect to application-side writes. Validation acquires ACCESS EXCLUSIVE; during the lock-acquisition window, fresh writes can land and introduce new duplicates that the constraint then rejects. Working sequence for any future structural UNIQUE-constraint addition on an actively-written table: `pm2 stop dawntrader` → final dedup sweep DELETE → ADD CONSTRAINT in one transaction → `pm2 start dawntrader`. Documented here so future batches consulting SIM at Step 2 see the pattern without rediscovering it. Blast radius: NONE (governance record). |
| **Five-symbol snapshot gap (handoff to B-NEW-36 sub-batch c)** | `xstock_spot_ohlc_60m_snapshot` (260 of 265 registry symbols populated) + `shared/asset-classes.ts:XSTOCK_SPOT_REGISTRY` | BITF/HOLX/PARA/SAGE/WBA have ZERO rows in both April AND May source partitions (`xstock_spot_ohlc_1m_2026_04` + `_2026_05`). Empirical Kraken-side absence under our canonical symbol form — not a B-NEW-35 bug, not a snapshot-pipeline bug. Possible causes: Kraken delisted at some point, canonical symbol-form drift, never included in Kraken's xStock product. None of the five are in designated-24/7 set; scanner active universe unaffected (scanner reads 73-74 of 75 universe per cycle, 5-symbol delta does not bleed into scan output). To be traced + decided (retire-from-registry vs symbol-form-fix + log-non-existent per CLAUDE.md §5 #14) in B-NEW-36 sub-batch (c) xStock universe-split cleanup. Blast radius: LOW (xstock-only universe trim). |

## Recent Additions (B79.0n.MCE — REQUIRED-assetClass on MCE / cost-model surface APIs + per-class cache key + DBS seed migration, 2026-05-22)

Deploy commit `aa0564107` (PM2 #311 at 2026-05-22T~12:10Z; migration applied cleanly 1 pending → applied). Asset-class-correctness / type-safety batch — removes the silent `assetClass = 'crypto_spot'` default from three groups of MCE / cost-model surface APIs, making `assetClass: AssetClass` a REQUIRED type-checked parameter; perp / non-spot classes fail-hard via an exhaustive `switch`. MCE per-symbol context cache key extended `${symbol}` → `${symbol}:${assetClass}`. Two factor-ablation paths + `BackfillContext` threaded with assetClass. Seed migration retires the `dbs_calculation.min_sample_count` wildcard for explicit per-class rows (net +1). Dead `cost-metrics.ts` function chain removed (Q-VI option a). Sub-batch 4 of 18 in the B79.0n umbrella v4 arc. Langston Step 1 / Step 2 / Step 4 / Step 8 all ACK clean. CI red is verified pre-existing debt (owned by B-NEW-43 CI Recovery), NOT an MCE regression.

| Component | Location | Impact |
|-----------|----------|--------|
| **`calculatePairRegime` REQUIRED-assetClass** | `server/core/metrics/market-regime.ts` (`calculatePairRegime` signature MODIFIED) | Pre-batch: 6th param `assetClass: string = 'crypto_spot'` — any caller omitting it silently routed through the crypto branch. Post-batch: `assetClass: AssetClass` REQUIRED; `AssetClass` imported from `shared/asset-classes.ts`. TypeScript compile-error if any caller omits it. The xstock branch (B79.0m.b / B78) is UNCHANGED — this batch removes the silent default, not the branch logic. UPSTREAM: `signal-orchestrator.ts` (cycle), `vts-runner.ts` (per-symbol), `regime-phase.ts` backfill, `multi-tf-agreement.ts`, `regime-age-factor.ts` (B68.5 ablation), 2 diagnostic scripts. DOWNSTREAM: regime classification flows into FinalScore Kernel + the MCE context. Crypto-intentional callers pass explicit `'crypto_spot' as const`; asset-class-aware callers thread the cycle's `resolveAssetClass(symbol, 'kraken')`. Blast radius: **HIGH** — sole pair-level regime authority for both VTS and active trading. |
| **`MarketContextEngine.computeContext` REQUIRED-assetClass + cache key extension + CACHE_REFRESH probe** | `server/services/market-context-engine.ts` (`computeContext` signature MODIFIED + per-symbol cache MODIFIED + NEW probe) | `computeContext` 7th param `assetClass: string = 'crypto_spot'` → `assetClass: AssetClass` REQUIRED. **TS1016 fix:** the REQUIRED param could not legally follow optional `smaPeriod?` / `propagatedDbs?` — both changed to required-but-nullable (`: T \| undefined`); all callers already pass those positions so the change is signature-shape-only. **MCE per-symbol context cache key extended** `${symbol}` → `${symbol}:${assetClass}` at cache read + write + `getCachedContext(symbol, assetClass)`. This is a THIRD distinct MCE cache layer — separate from the `module-constants-service` rowset cache (`${moduleName}`-keyed, untouched) and the 9-group `refreshAllConfigs()` config orchestrator (in-memory typed fields, untouched). `regimePhaseStore.tick(...)` object literal gains `assetClass`. NEW `logDbsCalculationRowCoverage()` probe emits `[B79.0n.MCE][CACHE_REFRESH] picked up N module_constants rows ...` after the first config refresh (best-effort; probe failure logs but does not disrupt startup). UPSTREAM: `signal-orchestrator.ts` ×4, `vts-runner.ts` ×6, `xstock_spot/eval-cycle.ts` ×2 (`computeContext` callers) + 1 `getCachedContext` caller at `paper-execution-engine.ts:2022`. DOWNSTREAM: every consumer of MCE per-symbol context. Blast radius: **HIGH** — all regime + indicator data flows through MCE. |
| **`cost-model.ts` 3 functions REQUIRED-assetClass + perp fail-hard** | `server/core/math/cost-model.ts` (`getFrictionForAssetClass` + `getDefaultCostComponentsForAssetClass` + `getCachedCostMetrics` MODIFIED) | All three move `assetClass: string = 'crypto_spot'` → `assetClass: AssetClass` REQUIRED. The `_unknownAssetClassWarned` flag + warn-once-fallback DELETED entirely (NO PATCHES doctrine — fail-hard, do not silently degrade). `getFrictionForAssetClass` now an exhaustive `switch`: `crypto_spot` / `xstock_spot` return their friction models; every perp / non-spot class throws `[B79.0n.MCE][cost-model] assetClass='...' has no friction model wired` pointing to RUNNING_ISSUES; `default: { const _exhaustive: never = assetClass; throw ... }` compile-fails if `AssetClass` gains a new value. `getCachedCostMetrics` was the active footgun — all 9 production callers previously passed only `symbol`. UPSTREAM: expectancy kernel, RTB cost check, signal-orchestrator ×2, trailing-exit-controller, vts-runner ×3, vts-service, xstock_spot/eval-cycle — 8 of these now resolve via `resolveAssetClass(symbol, 'kraken')` (STORAGE-established interim, symbol-derived truth, visible commented), `eval-cycle.ts` via file-constant `ASSET_CLASS`, `trailing-exit-controller.ts` via in-scope `assetClass`. DOWNSTREAM: friction + cost components feed the Net Expectancy Kernel. Blast radius: **HIGH** (cost model is consumed by EV gating). |
| **Factor-ablation paths + `BackfillContext` threaded with assetClass** | `server/core/metrics/regime-age-factor.ts` (`buildB68_5Alternate` MODIFIED) + `server/core/metrics/multi-tf-agreement.ts` (`computeMultiTfAgreement` MODIFIED) + `server/core/metrics/regime-phase.ts` (`BackfillContext` type MODIFIED) | `buildB68_5Alternate` + `computeMultiTfAgreement` each gain a REQUIRED `assetClass: AssetClass` param (added at signature end), threaded to their internal `calculatePairRegime` call. `BackfillContext` gains a REQUIRED `assetClass` field. Pre-batch, xStock signals traversing these B68.5 / multi-TF ablation paths silently inherited crypto-tuned `DEFAULT_REGIME_CONFIG`. UPSTREAM: `factor-ablation-builders.ts` (`FactorAlternateInput.b68_5` variant gains `assetClass`), `signal-orchestrator.ts` + `vts-runner.ts` (ablation input construction + `computeMultiTfAgreement` call get `resolveAssetClass(symbol, 'kraken')`), `market-context-engine.ts` (`regimePhaseStore.tick` object literal). DOWNSTREAM: factor-ablation telemetry. Blast radius: **MEDIUM** (ablation paths; large Phase-19 surprise reduction). |
| **NEW: seed migration — per-class `dbs_calculation.min_sample_count` rows + wildcard retirement** | `drizzle/migrations/2026-05-22-b79-0n-mce-dbs-per-class.sql` (NEW) + `drizzle/migrations/2026-05-22-b79-0n-mce-dbs-per-class-rollback.sql` (NEW) | Atomic `BEGIN/COMMIT` 3-step: (1) add explicit `crypto_spot` row cloning the wildcard value `20`; (2) add explicit `xstock_spot` row (placeholder-clone of `20`); (3) `EXISTS`-gated `DELETE` of the `(*,*,*,*)` wildcard — fires only after both class-scoped rows are confirmed present (no orphan window). Idempotent (`ON CONFLICT DO NOTHING` + EXISTS-gated DELETE). Net `module_constants` row delta **+1**. Every WHERE clause scoped to `constant_name = 'min_sample_count'` exactly — **protects B-PHASE-A2's `dbs_calculation.sector_coverage_floor` xstock_spot row** from collateral retirement. Schema columns verified against `shared/schema.ts` — `updated_by` (not `set_by`); ON CONFLICT targets the 6-tuple unique index. The `-rollback.sql` companion re-inserts the wildcard + deletes the 2 class rows; manual-only, not auto-run by deploy. UPSTREAM: B72 seeded the original wildcard row. DOWNSTREAM: both `DirectionalBiasStore` instances (crypto + xStock, already per-class-keyed since B-PHASE-A2) now resolve their own explicit row instead of falling through the wildcard. Blast radius: **LOW** (value-identical for both classes; structural change — no more fall-through). |
| **DELETED: dead `cost-metrics.ts` function chain (Q-VI option a)** | `server/core/metrics/cost-metrics.ts` (3-function chain DELETED — file KEPT) | Deleted `getDefaultAvgReturn` + `updateCostData` + `getTransactionCostFactor` (zero production callers — test-only) + `updateSpreadCache` (zero consumers anywhere; its compile broke when `getCachedCostMetrics` became REQUIRED-assetClass) + now-unused imports / `CACHE_TTL_MS` / `DEFAULT_SLIPPAGE` / `DEFAULT_FEE` consts. **The file is NOT deleted** — Step 3 grep proved scope rev5's "delete the whole file" assumption wrong; `cost-metrics.ts` has 6+ live consumers (`computeMarketFriction` / `describeFriction` / `mapFrictionVisual` / `getCachedSpread` / `getCostCache` / `clearCostCache`). The `dynamic_sizing.test.ts` block that exclusively exercised the dead chain was deleted; the sibling `getCostClassification` test kept. The now-orphaned `module_constants` row `cost_model.default_avg_return` (its only consumer was `getDefaultAvgReturn`) is filed as a RUNNING_ISSUES Tier-3 cleanup rather than expanding the migration (would have violated the Langston C1 single-constant scoping gate). Blast radius: **NONE** (dead code; zero production callers). |
| **NEW: `countModuleRowsByAssetClass` helper** | `server/services/module-constants-service.ts` (NEW helper) | Counts raw `module_constants` rows grouped by EXACT `asset_class` (no resolver hierarchy) — a verification helper for the `[B79.0n.MCE][CACHE_REFRESH]` probe. Reuses the 60s-TTL `loadModule` cache. Blast radius: **LOW** (read-only helper). |
| **6 new unit-test files** | `server/tests/unit/b79-0n-mce-*.test.ts` (6 NEW files) | `b79-0n-mce-required-assetclass.test.ts` (`@ts-expect-error` type locks on `calculatePairRegime` / `computeContext` / `getFrictionForAssetClass`) + `b79-0n-mce-costmodel-perp-failhard.test.ts` (perp classes throw with `B79.0n.MCE` + `RUNNING_ISSUES` in message; spot classes do not) + `b79-0n-mce-cache-isolation.test.ts` (`${symbol}:${assetClass}` cache-key contract) + `b79-0n-mce-xstock-regime-routing.test.ts` (xstock_spot + crypto_spot raw metrics identical, only threshold comparisons differ) + `b79-0n-mce-required-assetclass-getcachedcostmetrics.test.ts` + `b79-0n-mce-ablation-path-assetclass.test.ts` (`buildB68_5Alternate` + `computeMultiTfAgreement` type locks). All 6 PASS. Blast radius: **LOW** (test files; lock contracts). |

### Modification risks ("things that break if X changes")

- **Re-introduce an `assetClass = 'crypto_spot'` default on `calculatePairRegime`, `computeContext`, or any of the 3 `cost-model.ts` functions** → the silent-fallback footgun returns; xStock cycles silently inherit crypto thresholds/friction post-WIRE-IN. REGRESSION LOCK: the `@ts-expect-error` type-lock tests fail (the no-assetClass call would no longer error, leaving the directive unused). CI rejects the change.
- **Remove the exhaustive `switch` / `const _exhaustive: never` in `getFrictionForAssetClass`** → a future `AssetClass` enum value silently routes to a wrong friction model instead of compile-failing. PRESERVE the exhaustive switch.
- **Remove a perp fail-hard `throw` from `cost-model.ts`** → perpetual-futures onboarding loses the forcing function that makes the missing friction-model work immediately visible. PRESERVE the throws (they are unreachable today by construction — no perp consumer).
- **Revert the MCE per-symbol cache key from `${symbol}:${assetClass}` to `${symbol}`** → crypto + xStock contexts for the same symbol string could collide. REGRESSION LOCK: `b79-0n-mce-cache-isolation.test.ts`.
- **Expand the seed migration's WHERE clause beyond `constant_name = 'min_sample_count'`** → risks collaterally retiring B-PHASE-A2's `dbs_calculation.sector_coverage_floor` xstock_spot row. PRESERVE the single-constant scoping (Langston C1 gate).
- **Re-wire the deleted `cost-metrics.ts` dead chain without governance** → re-introduces an orphan consumer of `cost_model.default_avg_return`. The orphan row + the `b72-warmup.ts` `cost_model` prefetch are tracked in RUNNING_ISSUES for clean removal.

### Telemetry

- `[B79.0n.MCE][CACHE_REFRESH] picked up N module_constants rows for asset_class=... (modules: dbs_calculation)` — emitted from MCE's first cache-refresh cycle post-boot; absence indicates the cache did not pick up the new per-class rows (escalates to investigation). At deploy this fired at 12:09:52Z showing `crypto_spot=1, xstock_spot=8`, confirming per-class resolution.
- `[B79.0n.MCE][cost-model] assetClass='...' has no friction model wired` — thrown (not logged) only if a perp / non-spot class reaches `getFrictionForAssetClass`; unreachable today.
- No other new console.log surface — this is an architecture / type-level / correctness batch.

### Cross-references

- Completion report: `Claude Comms and Packages/Batch Completion/B79_0n_MCE_COMPLETION_REPORT.md` (see §10 onboarding learnings + §2 B72 prior-arc context)
- Scope: `Claude Comms and Packages/Scope Files/B79_0n_MCE_SCOPE.md` (rev5)
- Pre-audit: `Claude Comms and Packages/Scope Files/B79_0n_MCE_PRE_AUDIT.md` (v2 — §1.5 3-cache-layer table + B-PHASE-A2 interaction)
- Change list: `Claude Comms and Packages/Change Lists/B79_0n_MCE_CHANGE_LIST.md` (embedded-diff Step 4 dispatch)
- SYSTEM_MANUAL.md — "Layer-2 `module_constants` wildcard-retirement migration pattern" + the 3-cache-layer table (added this batch)
- ASSET_CLASS_ONBOARDING_WORKFLOW.md — B79.0n.MCE Phase-24 learnings entry (added this batch)
- B-PHASE-A2 SIM entry (lines ~2131-2168) — xStock `DirectionalBiasStore` singleton; this batch's seed migration adds rows it already resolves per-class; `sector_coverage_floor` row protected.
- RUNNING_ISSUES: 2 new Tier-3 cleanup entries — orphan `module_constants` row `cost_model.default_avg_return` + `server/startup/b72-warmup.ts` `cost_model` prefetch-list cleanup.
- B72 prior arc: `BATCH_CATALOG.md` (B72/B72.1/B72.2 wired the API-side discipline for `regime_classifier` / `regime_age` / `dbs_calculation` / `cost_model` at wildcard scope).

---

## Recent Additions (B79.0n.STORAGE — REQUIRED-assetClass storage API + canonical-baseline helper + SQE per-class routing, 2026-05-21)

Deploy commit `ab3153ce5` (PM2 #310 at 2026-05-21T14:59:28Z). Codebase-wide silent-crypto-fallback audit + SQE production bug fix + storage API REQUIRED-assetClass refactor. Type-level enforcement at `storage.getScreenerFilters({mode, assetClass: AssetClass, filterPath?})` removes silent `'crypto_spot'` default; new `getCanonicalScreenerConfig({mode, filterPath?})` helper for UI/diagnostic display with banner-style NEVER-for-routing docstring. **38 caller sites updated** (pre-audit estimated 32; 6 additional surfaced via TypeScript compile-driven audit; ~19% pre-audit undercount). Sub-batch 3 of 18 in B79.0n umbrella v4 arc. Langston Step 4 ACK (post-BLOCKER fix) + Step 8 ACK clean.

| Component | Location | Impact |
|-----------|----------|--------|
| **`storage.getScreenerFilters` REQUIRED-assetClass signature** | `server/storage.ts:235` (interface) + `:950` (implementation) (MODIFIED) | Pre-batch: `params: { mode: 'live' \| 'paper'; filterPath?: string; assetClass?: string }` with silent `assetClass = params.assetClass \|\| 'crypto_spot'` default. Post-batch: `params: { mode: 'live' \| 'paper'; assetClass: AssetClass; filterPath?: string }` REQUIRED. TypeScript compile-error if any caller omits assetClass. The B79.0m.a backward-compat default was the silent-fallback footgun that routed all xStock SQE cycles to crypto thresholds. **Critical correctness fix:** every silent-routing footgun across the storage API is now structurally impossible. **UPSTREAM:** the 38 production call sites across server/. **DOWNSTREAM:** every code path that reads `screener_filters` rows now routes to the correct per-(mode, asset_class, filter_path) row. Blast radius: VERY HIGH (storage API surface; touches every consumer of screener configuration). |
| **NEW: `storage.getCanonicalScreenerConfig` helper** | `server/storage.ts:977-983` (NEW) | `async getCanonicalScreenerConfig(params: { mode: 'live' \| 'paper'; filterPath?: string }): Promise<ScreenerFilters \| null>` — internally calls `this.getScreenerFilters({...params, assetClass: 'crypto_spot'})`. Banner-style docstring at `:971` says "NEVER use this for runtime signal/screener/SQE routing — use `getScreenerFilters({mode, assetClass, ...})` with the explicit asset class derived from the signal/cycle context. The whole point of B79.0n.STORAGE is preventing the silent-fallback footgun this helper could become if misused." Designed for UI/diagnostic display + canonical-baseline reads where the intent is genuinely "show the crypto baseline" (e.g., Filter Diagnostics tab, Settings UI, boot config snapshot). 21 sites route through this helper post-refactor. UPSTREAM: 21 diagnostic/UI consumers. DOWNSTREAM: storage.getScreenerFilters({mode, assetClass: 'crypto_spot', filterPath?}). Blast radius: MEDIUM (helper is type-safe but misuse would reintroduce silent crypto routing for runtime decisions). |
| **NEW: `storage.upsertScreenerFilters` REQUIRED-assetClass on data shape + UPDATE WHERE 3-clause** | `server/storage.ts:247` (interface) + `:988-1015` (implementation) (MODIFIED — Langston Step 4 BLOCKER fix) | Pre-batch: `data: Omit<InsertScreenerFilters, 'userId'> & { lastUpdatedBy?; filterPath? }` with `(data.assetClass ?? 'crypto_spot') as AssetClass` papering-over + UPDATE WHERE was `(mode, filterPath)`-only. Post-batch: `data: ... & { assetClass: AssetClass; lastUpdatedBy?; filterPath? }` REQUIRED + UPDATE WHERE 3-clause `(mode, asset_class, filter_path)` matching the unique index. **Why the fix was load-bearing:** the same batch's seed migration creates 2 rows per (mode, filterPath) (crypto + xStock). A 2-clause WHERE would either violate the unique index OR silently cross-corrupt fields between asset classes. Langston caught this at Step 4. Single live caller at `server/routes.ts:2407` (UI edit endpoint) passes explicit `assetClass: 'crypto_spot' as const` with comment noting this is the canonical crypto baseline editor today (per-class UI editing is a future capability requiring request-body asset-class param + per-class UI surface). UPSTREAM: routes.ts:2407 UI edit. DOWNSTREAM: screener_filters table. Blast radius: HIGH (UPDATE operation that could silently corrupt rows; structurally fixed). |
| **`SQEInput.assetClass` REQUIRED field + plumb chain** | `server/core/filters/signal_quality_evaluator.ts:79` (NEW field) + `:124` (`getSQEThresholdsFromConfig(mode, assetClass)` REQUIRED) + `:237` (caller in `evaluateSignalQuality`) + `:521-532` (`SignalQualityEvaluatorService.getThresholds(mode, assetClass)` with cache key `${mode}:${assetClass}`) (MODIFIED) | **THE SQE PRODUCTION BUG FIX.** Pre-batch: `getSQEThresholdsFromConfig(mode)` at line 124 was reading `storage.getScreenerFilters({ mode })` with silent crypto default — xStock SQE cycles silently evaluated against crypto thresholds. Post-batch: assetClass plumbed from `SQEInput.assetClass` through every layer; cache key extended `${mode}` → `${mode}:${assetClass}` (4 max entries; trivial memory delta). Cache-isolation regression test at `b79-0n-storage-sqe-asset-class-routing.test.ts` warms `paper:crypto_spot` then reads `paper:xstock_spot` and asserts distinct fetches. **UPSTREAM:** 3 SQEInput-construction sites (signal-orchestrator:567 via `rawSignal.metadata?.assetClass ?? resolveAssetClass(symbol, 'kraken')`; RTB:646, 868 interim `resolveAssetClass(symbol, 'kraken')` only — RtbSignal DB schema gap tracked for RTB batch #11). **DOWNSTREAM:** SQE per-class row read from screener_filters. Blast radius: HIGH (gates which signals enter active trading; correctness-critical). |
| **38 caller-site updates across server/** | various (38 files modified) | Pre-audit estimated 32; compile-driven audit surfaced 6 additional sites (paper-sim-diagnostic, paper-sim-service, reb-2-12, reb-2-15, unified-filter-gateway x2). Final categorization: **(a) 10 crypto-intentional explicit `'crypto_spot'` literals** — 6 fx5-scanner.ts (the crypto scanner) + config-update-service.ts + 3 reclassified from (d) per Langston Step 4 (unified-filter-gateway x2 hydratePoolFromAPI/getUniverseCount + paper-sim-service empty-watchlist auto-populate — all runtime crypto-routing paths feeding krakenService.getEligiblePairs, not diagnostic display). **(c) 1 SQE production bug** — signal_quality_evaluator.ts:143 now reads per-class via SQEInput.assetClass. **(d) 21 diagnostic via getCanonicalScreenerConfig** — 12 routes/vts.ts UI Filter Diagnostics + 8 routes.ts settings/diagnostic + 2 index.ts boot + 3 paper-sim/reb-test/reb-cert. **(d) 1 CLI explicit literal** — scripts/diagnostic-11.4G-5.ts per Langston Step 2 RE-ACK wording. **Already-correct** — 6 xstock_spot/* sites (pattern-filter, imf-evaluator, global-filter, eval-cycle x3) from B79.0m.b2 era, no change needed. UPSTREAM: each caller's context determines assetClass (rawSignal.metadata, resolveAssetClass(symbol, exchange), explicit literal, or canonical-baseline helper). DOWNSTREAM: per-class row from screener_filters. Blast radius: VERY HIGH (any miscategorized caller would route signals to the wrong threshold row). |
| **NEW: Seed migration cloning 10 xStock screener_filters rows from crypto baseline** | `drizzle/migrations/2026-05-21-b79-0n-storage-xstock-screener-filters-seed.sql` (NEW) | Pre-deploy live query: xstock_spot/live had 7/12 filter_paths (missing vts_quant, vts_trend, vts_reversal, vts_breakout, vts_oscillator); xstock_spot/paper had 7/12 (missing active_breakout, active_oscillator, active_reversal, active_trend, vts_quant). Asymmetric set is B79.0m.b2 seeding artifact. Migration `INSERT INTO screener_filters ... SELECT s.* FROM screener_filters s WHERE s.asset_class = 'crypto_spot' AND ...` writes `'xstock_spot'` for asset_class, generates new `gen_random_uuid()` PK, copies all other columns. Idempotent via ON CONFLICT (mode, asset_class, filter_path) DO NOTHING. Post-deploy verification: 12/12 coverage on all 4 (asset_class, mode) combos. **Placeholder-cloned values per Langston Step 2 Q4 ACK** — Layer 3 calibration ticket (RUNNING_ISSUES at governance close) required before Phase 19 xStock active-trading enablement. UPSTREAM: pre-deploy live row count check during pre-audit §3 Q-S2-5 (Langston blocking-light ask). DOWNSTREAM: any caller passing `assetClass: 'xstock_spot'` now finds a row. Blast radius: LOW (additive only; zero crypto rows touched). |
| **2 new unit-test files** | `server/tests/unit/b79-0n-storage-required-assetclass.test.ts` (NEW, 3 tests) + `server/tests/unit/b79-0n-storage-sqe-asset-class-routing.test.ts` (NEW, 4 tests) | required-assetclass.test.ts: 3 `@ts-expect-error` TYPE LOCK tests asserting `getScreenerFilters({mode})` (no assetClass) fails to compile, `getScreenerFilters({mode, assetClass})` compiles, `getCanonicalScreenerConfig({mode, filterPath?})` compiles, AND the upsertScreenerFilters REQUIRED-assetClass type lock (Langston Step 4 BLOCKER fix regression coverage). sqe-asset-class-routing.test.ts: 4 vitest tests including the cache-isolation case per Langston Step 2 RE-ACK item 4 — warm `paper:crypto_spot`, read `paper:xstock_spot`, assert distinct storage calls (no cache hit cross-class). 8/8 tests PASS on staging. Blast radius: LOW (test files; lock contract). |

### Modification risks ("things that break if X changes")

- **Drop `AssetClass` import from server/storage.ts** → all 38 production callers fail to compile. Recovery would be re-adding the import; no data corruption risk.
- **Re-introduce `params.assetClass || 'crypto_spot'` default on `getScreenerFilters`** → silent-fallback footgun returns; SQE bug regression. REGRESSION LOCK: the `b79-0n-storage-required-assetclass.test.ts` TYPE LOCK fails because the `@ts-expect-error` directive becomes unused (the no-assetClass call would no longer error). CI rejects the change.
- **Remove `assetClass` from `upsertScreenerFilters` UPDATE WHERE clause** → silent cross-class row corruption when 2 rows share (mode, filter_path). PRESERVE 3-clause WHERE.
- **Misuse `getCanonicalScreenerConfig` for runtime SQE/screener routing** → silent crypto-routing returns for xStock cycles. PROTECTED BY: banner-style NEVER-for-routing docstring at `storage.ts:971` + Langston Step 4 reclassification protocol caught 3 such misuses already.
- **Remove `${mode}:${assetClass}` cache key from `SignalQualityEvaluatorService.getThresholds`** → crypto + xStock would share cached thresholds (race-condition between the two classes). REGRESSION LOCK: cache-isolation test in `b79-0n-storage-sqe-asset-class-routing.test.ts` warms paper:crypto then reads paper:xstock and asserts 2 storage calls; reverting the cache key shape causes 1 call (cache hit), test fails.
- **Re-introduce silent crypto-default at any new storage API method** → reverts the discipline. PROTECTED BY: pattern documented in ASSET_CLASS_ONBOARDING_WORKFLOW.md Step 4.9 standing rule.

### Telemetry

- No new console.log surface — this is an architecture/type-level batch, not a telemetry batch.
- New `[B79.0n.STORAGE]` log lines do NOT exist; all changes are silent at runtime.
- Cache misses on `${mode}:${assetClass}` extension may cause brief boot-time cold-cache TTL window per asset class (4 TTL fills max instead of 2 — negligible).

### Cross-references

- Completion report: `Claude Comms and Packages/Batch Completion/B79_0n_STORAGE_COMPLETION_REPORT.md` (see §10 onboarding learnings + §2 B72 prior-arc context)
- Scope: `Claude Comms and Packages/Scope Files/B79_0n_STORAGE_SCOPE.md`
- Pre-audit: `Claude Comms and Packages/Scope Files/B79_0n_STORAGE_PRE_AUDIT.md` (incl. Concerns A/B/C resolution)
- Change list: `Claude Comms and Packages/Change Lists/B79_0n_STORAGE_CHANGE_LIST.md` (embedded-diff Step 4 dispatch)
- Langston ACKs (6 docs): `Claude Comms and Packages/Langston Design Asks/B79_0n_STORAGE_STEP{1,2,2-REACK,4-REACK,7-VERIFICATION,8}_LANGSTON_REPLY.md`
- Umbrella v4: `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (§1.5 B72 prior-arc context per sub-batch)
- ASSET_CLASS_ONBOARDING_WORKFLOW.md Step 4.9 (NEW — REQUIRED-assetClass storage API canonical pattern landed this batch)
- RUNNING_ISSUES: #129 (sqe_config per-class deferred to SCORING) + #130 (RtbSignal DB row schema gap for RTB #11) + #131 (vts-runner/vts-service `assetClass?:` optional for STRATEGY #5) + #132 (tsconfig TS-hardening sweep)
- B72/B72.1/B72.2 prior arc: `BATCH_CATALOG.md` rows 212-214 (Layer 2 work; STORAGE works on Layer 1; distinct concerns)

---

## Recent Additions (B79.0n.UNIVERSE-DISCOVERY — dynamic xStock universe via three-service discovery chain, 2026-05-21)

Deploy commit `c97ceec81` (PM2 #308). Replaces hardcoded `XSTOCK_SPOT_REGISTRY` Map literal + deleted `server/config/xstocks-universe.json` with dynamic DB-backed universe populated by CoinGecko + Kraken WS subscription probe + Finnhub enrichment running daily at 06:00 UTC + on-demand POST endpoint. First live cycle: 260 hardcoded → 489 active universe (+229 previously-uncatalogued Kraken-traded xStock pairs). See `SYSTEM_MANUAL.md` "xStock dynamic universe discovery (B79.0n.UNIVERSE-DISCOVERY)" for the full architectural model. Step 8 Langston ACK 2026-05-21 PM (all 7 of 7 in-window gates reproduced independently via `ssh staging`).

| Component | Location | Impact |
|-----------|----------|--------|
| **Dynamic registry replacement in `shared/asset-classes.ts`** | `shared/asset-classes.ts:286-358` (Map literal MODIFIED) | Replaces the 265-entry hardcoded Map literal with `_xstockRegistryInternal = new Map<string, XstockSpotEntry>()` + `_xstockSymbolsInternal = new Set<string>()` initialized empty + `ReadonlyMap` / `ReadonlySet` exports (`XSTOCK_SPOT_REGISTRY` / `XSTOCK_SPOT_SYMBOLS`) preserving consumer API. Module-private `_replaceXstockUniverse(entries)` function clears + repopulates both. Added `UNCATEGORIZED` to `XstockSector` union + `_XSTOCK_SECTOR_VALUES_FOR_CHECK: ReadonlySet<string>` (15 values: 11 GICS SPDR + INDEX_PROXY + BROAD_ETF + INTL_ETF + UNCATEGORIZED). UPSTREAM: only `xstockUniverseService.initializeFromDB()` + Layer 4 bootstrap + Layer 5 fail-fast at boot call `_replaceXstockUniverse()`. DOWNSTREAM: every consumer (`xstock_spot/scanner.ts:43`, `ohlc-aggregator.ts:203`, `xstock-ohlc-cache.ts`, `price-discontinuity-detector.ts`, `passive-archive/universe-loader.ts`, `routes.ts`, `scripts/b-new-34b-prewarm-snapshot.ts`, `scripts/b-phase-a2-backfill.ts`, `scripts/b79-0a-load-test.ts`) reads the exports at-call-time (no startup snapshot caching). Blast radius: VERY HIGH (every xStock code path that enumerates the universe). Identity-mechanism invariant: asset identity = symbol string + Kraken WS-accept; industry classification = metadata sector label only. |
| **NEW: xStock universe discoverer service** | `server/services/xstock-universe-discoverer.ts` (NEW, ~700 lines) | Three-service orchestrator: `fetchCoinGeckoXstockUniverse()` (prime-mover, public `xstocks-ecosystem` category) → `probeKrakenWs(candidates)` (ground-truth chunked subscribe to `wss://ws-equities.kraken.com`, 100/batch + 500ms inter-chunk sleep + 15s collection window + 10s WS-open `openTimeoutHandle` guard) → `fetchFinnhubMetadata(symbols)` (enrichment, /stock/profile2 per-symbol at 60 req/min). `mapFinnhubIndustryToSector(industry)` runs ~75 substring patterns across 11 GICS SPDR sectors + 3 special buckets + UNCATEGORIZED with biotech-first ordering (CRITICAL substring-collision guard at lines 286-370 — "Biotechnology" includes "technology"). `runDiscovery(triggeredBy)` orchestrator wires: source-chain → override merge from `xstock_spot_universe_overrides` → upsert with `ON CONFLICT (symbol) DO UPDATE SET ... is_delisted=false` (re-discovery un-delists) → stale lifecycle (>7d log-only) → delisted lifecycle (>30d auto-UPDATE) → `discovery_runs` audit row. UPSTREAM: invoked from `xstock-universe-cron.ts` (daily 06:00 UTC) + `routes.ts` (POST /api/internal/universe-discovery/refresh). DOWNSTREAM: writes to `xstock_spot_universe` + `discovery_runs` + invokes `xstockUniverseService.initializeFromDB()` to refresh the in-memory registry. Blast radius: HIGH (defines what the system considers an xStock; cron + manual triggers can both regress the universe if the discovery chain breaks). |
| **NEW: xStock universe service (boot-time loader + 5-layer fallback)** | `server/asset_classes/xstock_spot/universe-service.ts` (NEW, ~190 lines) | `initializeFromDB()` returns `InitResult { ok, dbReachable, rowCount, source }` after SELECT from `xstock_spot_universe WHERE is_delisted=false` then calling `_replaceXstockUniverse(rows)`. `loadFromFileCache()` reads `${HOME}/.dawntrader-cache/xstock-universe-cache.json` (currently broken at `/var/lib/dawntrader` per RUNNING_ISSUES #126 — relocation queued). `loadBootstrap()` loads from `xstock_spot/universe-bootstrap.ts` (20-symbol mega-cap hand-curated fallback). `writeFileCache(entries)` writes atomic tmp+rename. UPSTREAM: boot wiring in `server/index.ts:51-90` calls `initializeFromDB()` first; on failure cascades Layer 3 → Layer 4 → Layer 5 `process.exit(1)`. Discoverer also calls `initializeFromDB()` post-cycle to refresh in-memory registry. DOWNSTREAM: `_replaceXstockUniverse()` mutates the module-private Map+Set; consumers see updated universe on next read. Blast radius: HIGH (boot-time correctness for entire xStock pipeline). |
| **NEW: xStock universe cron** | `server/services/xstock-universe-cron.ts` (NEW, ~50 lines) | `registerXstockUniverseCron()` registers node-cron `0 6 * * *` UTC schedule wrapping `runDiscovery('cron_daily')` in try/catch. Single failed cycle does NOT crash process; failures visible in `discovery_runs.error_log` + PM2 logs. UPSTREAM: registered from `server/index.ts:90` boot wiring. DOWNSTREAM: triggers full discovery cycle once per day. Blast radius: LOW (independent timer; failure does not block other systems). |
| **NEW: 3 DB tables — universe + overrides + discovery_runs** | `drizzle/migrations/2026-05-21-b79-0n-universe-discovery.sql` (NEW migration) | `xstock_spot_universe` (PK symbol; sector TEXT with CHECK constraint covering 15 valid values; is_delisted BOOLEAN; last_seen_at/first_seen_at TIMESTAMPTZ; crypto_adjacent + is_adr BOOLEAN; source_chain JSONB; 3 indexes on is_delisted/last_seen_at/sector). `xstock_spot_universe_overrides` (PK symbol → universe; explicit `override_*` columns NULL=no-override; reason/created_at/created_by). `discovery_runs` (BIGSERIAL run_id; triggered_by CHECK in 'cron_daily'/'manual_endpoint'/'boot_smoke'; duration_ms; symbols_discovered/stale/delisted; source_chain_status JSONB; error_log TEXT; indexed on started_at). Seeded with 260 universe rows + 56 override rows from prior `XSTOCK_SPOT_REGISTRY` via `ON CONFLICT (symbol) DO NOTHING` (idempotent). VARCHAR + CHECK constraint chosen over PostgreSQL ENUM to sidestep `ALTER TYPE ... ADD VALUE` same-transaction restriction; updating the CHECK constraint is `ALTER TABLE` with brief lock. UPSTREAM: discoverer + universe-service + cron all read/write these. DOWNSTREAM: SQL queries from manual ops + future analytics + soak verifications. Blast radius: MEDIUM (DB-side schema; needed by all xStock code paths via universe-service). |
| **NEW: 20-symbol bootstrap set** | `server/asset_classes/xstock_spot/universe-bootstrap.ts` (NEW, ~80 lines) | Hand-curated Layer 4 fallback covering 6+ sectors with mega-cap names (AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, BRK.B, JPM, V, JNJ, UNH, PG, KO, XOM, CVX, HD, MA, BAC, ABBV — exact set per file). Used ONLY when Layers 1-3 (live + DB + file-cache) all fail at boot. Designed to keep system alive through DB-down-during-deploy + file-cache-corrupted scenarios with minimum-viable universe. Blast radius: LOW (only loaded on cascading-failure path). |
| **NEW: 500-name S&P 500 backstop** | `server/asset_classes/xstock_spot/sp500-backstop.ts` (NEW, ~500 tickers) | Static S&P 500 ticker constants used to expand the Kraken WS subscription probe candidate set beyond CoinGecko's `xstocks-ecosystem` 126 entries. Goal: catch tokenizations Kraken supports that CoinGecko hasn't picked up yet. Total probe set: CoinGecko ∪ S&P 500 = 481 candidates in live first cycle, of which 479 accepted. Blast radius: LOW (discovery-cycle scope expansion only; pure data file). |
| **NEW: 2 API routes — refresh + health** | `server/routes.ts` (MODIFIED) | `POST /api/internal/universe-discovery/refresh` triggers `runDiscovery('manual_endpoint')` and returns the audit row JSON. `GET /api/internal/universe-discovery/health` returns `{ ok, last_successful_run, last_attempted_run, snapshot_size, registry_size, sectors_present, is_delisted_count, stale_warn_count, source_chain_completeness_pct, cache_state }`. Both bearer-authenticated. UPSTREAM: manual triggers from CC/Langston via curl. DOWNSTREAM: triggers full discovery cycle (refresh) or DB self-check (health). Blast radius: MEDIUM (refresh endpoint can trigger Finnhub rate-limit consumption + a 10-min cycle; rate-limit by ops convention not by code). |
| **Universe-loader downstream rewire** | `server/services/passive-archive/universe-loader.ts:loadXstockSpotUniverse()` (MODIFIED) | Refactored to read `XSTOCK_SPOT_SYMBOLS` Set (DB-backed via universe-service) instead of opening + parsing the deleted `xstocks-universe.json` file. Boot log: `[B74][universe] xstock_spot loaded: 489 symbols from XSTOCK_SPOT_SYMBOLS (DB-backed via B79.0n.UNIVERSE-DISCOVERY)`. UPSTREAM: invoked by passive-archive systems at boot. DOWNSTREAM: passive-archive scope-filter is now dynamic (auto-grows with universe). Blast radius: MEDIUM (passive-archive enumeration now follows discovery). |
| **DELETED: `server/config/xstocks-universe.json`** | (DELETED file) | The hand-maintained 260-symbol JSON catalog is now obsolete; universe is DB-backed. Any code referring to it would fail to import — caught at TypeScript compile time. Blast radius: NONE (verified no remaining callers; universe-loader was the only consumer). |
| **Stale → delisted lifecycle architecture** | Within `xstock-universe-discoverer.ts` `runDiscovery()` block | After source-chain completion: for each existing universe row, if `last_seen_at < NOW() - INTERVAL '30 days'` → `UPDATE is_delisted=true` AND `symbols_marked_delisted++`; else if `last_seen_at < NOW() - INTERVAL '7 days'` → log `[STALE_SYMBOL]` AND `symbols_marked_stale++` (no DB write — log-only signal). Re-discovery un-delists via ON CONFLICT clause. `last_seen_at` updates on every successful discovery cycle that includes the symbol. **The lifecycle anchors on data arrival (`last_seen_at`), NOT WS-accept** — because Kraken's WS accepts subscribes for symbols whose underlying has been delisted, but data never flows. PARA/USD reappeared in universe (Kraken WS-accept) but is data-dormant; will hit stale at d+7 and delisted at d+30 unless live data arrives. Blast radius: MEDIUM (defines how stale symbols are pruned; correctness affects active universe). |

### Modification risks ("things that break if X changes")

- **Change `_replaceXstockUniverse()` to NOT clear before insertion** → registry growth across discoveries (every cycle adds, never removes). Stale + delisted lifecycle becomes meaningless. PRESERVE clear-and-replace semantics.
- **Change `XSTOCK_SPOT_REGISTRY` or `XSTOCK_SPOT_SYMBOLS` exports from `ReadonlyMap`/`ReadonlySet`** → consumers may attempt direct mutation, bypassing the `_replaceXstockUniverse()` discipline. PRESERVE readonly exports.
- **Add a per-cycle Finnhub call for EVERY symbol every day** (current) vs. tier (monthly-stable, daily-fresh-only) → at universe=600 pushes cycle past 12min. RUNNING_ISSUES #127 tracks the architectural fix.
- **Remove the biotech-first ordering guard at `mapFinnhubIndustryToSector():286-370`** → MRNAX et al. mis-classify as XLK. Test `b79-0n-discoverer-sector-mapping.test.ts` 18-case regression-lock catches it on push. PRESERVE biotech-first.
- **Migrate `xstock_spot_universe.sector` from VARCHAR+CHECK to PostgreSQL ENUM** → loses idempotent `ALTER TABLE` migrations for new sector values; reintroduces same-transaction restriction. PRESERVE VARCHAR+CHECK.
- **Drop `last_seen_at` index on `xstock_spot_universe`** → stale/delisted lifecycle scan becomes table-scan over universe at cycle time. ~10ms today; cycles when universe grows large.
- **Make subscription probe SERIAL instead of chunked-parallel (100/batch + 500ms inter-chunk sleep)** → probe runs 20+ minutes serial vs. ~3s chunked. Already optimal; do NOT serialize.
- **Remove the 10s WS-open `openTimeoutHandle` guard at `probeKrakenWs:191-199`** → DNS/TLS handshake hang freezes cycle indefinitely. Langston Step 4 Concern B fix. PRESERVE the timeout.

### Telemetry

- `[B79.0n.UNIVERSE-DISCOVERY][universe-service] initializeFromDB OK — loaded N active symbols from xstock_spot_universe` — boot + post-discovery refresh.
- `[BOOT][B79.0n.UNIVERSE-DISCOVERY] universe loaded: N symbols (db_reachable=true|false, db_rows=N, source=db|file_cache|bootstrap|empty)` — boot-time decision tree result.
- `[B79.0n.UNIVERSE-DISCOVERY][cron] registered daily refresh at 06:00 UTC` — one-shot at boot.
- `[CRON][B79.0n.UNIVERSE-DISCOVERY] daily refresh started at <ISO> (triggered_by=...)` — per-cycle start.
- `[B79.0n.UNIVERSE-DISCOVERY] CoinGecko: fetched N coins from category=xstocks-ecosystem, mapped to N canonical symbols` — prime-mover step.
- `[B79.0n.UNIVERSE-DISCOVERY] Kraken WS probe: N candidates split into M chunks of <=100` — ground-truth step (with [PROBE_CHUNK] subordinate logs).
- `[B79.0n.UNIVERSE-DISCOVERY] Kraken WS probe complete: accepted=N rejected=M collected=K/N` — ground-truth result.
- `[B79.0n.UNIVERSE-DISCOVERY] Finnhub: enriched N/N symbols` — enrichment step.
- `[B79.0n.UNIVERSE-DISCOVERY] upsert: wrote/updated N rows in xstock_spot_universe` — DB write step.
- `[CRON][B79.0n.UNIVERSE-DISCOVERY] daily refresh completed in Xms; symbols=N; new=N; stale=N; delisted=N` — per-cycle summary.
- `[STALE_SYMBOL] symbol=... last_seen=...` — >7d data-dormant warn (log-only).
- `[B79.0n.UNIVERSE-DISCOVERY][universe-service] writeFileCache failed (non-fatal — DB is the canonical source): ...` — Layer 3 cache write failure (current EACCES per RUNNING_ISSUES #126).

### Cross-references

- Completion report: `Claude Comms and Packages/Batch Completion/B79_0n_UNIVERSE_DISCOVERY_COMPLETION_REPORT.md` (see §10 onboarding learnings)
- Scope: `Claude Comms and Packages/Scope Files/B79_0n_UNIVERSE_DISCOVERY_SCOPE.md` (esp. §2.10 forward-looking items)
- Pre-audit: `Claude Comms and Packages/Scope Files/B79_0n_UNIVERSE_DISCOVERY_PRE_AUDIT.md`
- Change list: `Claude Comms and Packages/Change Lists/B79_0n_UNIVERSE_DISCOVERY_CHANGE_LIST.md`
- Langston ACKs: Step 4 + Step 4 re-ACK + Step 7 verification + Step 8 ACK at `Claude Comms and Packages/Langston Design Asks/B79_0n_UD_STEP*.md`
- Onboarding workflow canonical pattern: `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 4.8 (NEW, this batch)
- RUNNING_ISSUES: #125 RESOLVED (was the tracking entry); #120 SUPERSEDED (universe-audit motivation rolled in); #126 OPEN (Layer 3 EACCES); #127 OPEN (Finnhub re-enrich); #128 OPEN (cron self-fire one-shot watch)

---

## Recent Additions (B-NEW-36 — Off-hours session-lifecycle controller + ledger reconciliation + universe-split cleanup, 2026-05-20)

Combined three-sub-batch ship: sub-batches (a) + (c) at commit `4dfe1deb6` (governance closure / SQL backfill / file edits) and sub-batch (b) at commit `4a997eae2` (the runtime lifecycle controller). See `SYSTEM_MANUAL.md` "Off-hours session-lifecycle architecture (B-NEW-36 sub-batch (b))" for the full structural model. Step 8 second-pass verification (Langston, 2026-05-20) confirmed all four focus areas via independent psql against Supabase.

| Component | Location | Impact |
|-----------|----------|--------|
| **`vts_open_trades.state` column with CHECK constraint** | `drizzle/migrations/2026-05-20-b-new-36-vts-open-trades-state.sql` (NEW) + production `vts_open_trades` table | Adds `state VARCHAR(32) NOT NULL DEFAULT 'open'` plus constraint `vts_open_trades_state_consistency` enforcing two invariants: (1) closed↔state consistency (`closed=false ⇒ state IN ('open','weekend_suspended')`; `closed=true ⇒ state='closed'`); (2) state↔asset_class consistency (`state='weekend_suspended' ⇒ asset_class='xstock_spot'`). Same-migration UPDATE backfills `state='closed'` for existing `closed=true` rows so the constraint is satisfied at activation. UPSTREAM: every trade-open + trade-close path. DOWNSTREAM: rehydrate path surfaces new column; sim cycle filters on it; lifecycle controller's bulk helpers update it. Blast radius: HIGH for the brief deploy window if migration order violated (every trade close would fail); ZERO post-deploy with markOpenTradeClosed extension landed atomically. |
| **`scheduled_tasks_audit` forensic table** | `drizzle/migrations/2026-05-20-b-new-36-scheduled-tasks-audit.sql` (NEW) | Schema: `id SERIAL PK, task_name VARCHAR(64), scheduled_for TIMESTAMPTZ, fired_at TIMESTAMPTZ, status VARCHAR(32), error_message TEXT, meta JSONB, created_at TIMESTAMPTZ DEFAULT NOW()`. Index `idx_scheduled_tasks_audit_name_status_fired` on `(task_name, status, fired_at DESC)`. UPSTREAM: lifecycle controller writes 3 task_name variants — `weekend_shutdown`, `weekend_restart`, `boot_state_reconciliation`. DOWNSTREAM: forensic-only, no production code reads. Bounded growth: 2 timers × ~52 weeks + N PM2 boots/year ≈ low hundreds of rows annually. Blast radius: LOW. |
| **Session lifecycle controller (NEW module)** *(node-cron timers RETIRED B-NEW-52 — see §9.10.b)* | `server/services/session-lifecycle-controller.ts` (NEW, ~350 lines) | ~~Two `node-cron@^4.2.1` scheduled tasks~~ **(RETIRED B-NEW-52 2026-06-06 — `registerTimers()` removed; weekend lifecycle now driven solely by boot reconciliation + the 30s poll-reconcile, which call the same `runWeekend*Core` hooks).** Originally registered `cron.schedule('0 20 * * 5', ...)` Fri 8PM ET shutdown + `cron.schedule('0 20 * * 0', ...)` Sun 8PM ET restart, `timezone: 'America/New_York'`. Public surface: `init()` (called from `server/index.ts` post-rehydrate post-scanner-start; performs boot-time affirmative state reconciliation per Q7+Q7.1; no longer registers timers post-B-NEW-52) and `shutdown()` (idempotent tear-down for tests). Pre-warm wrapped in `runPrewarmWithCircuitBreaker` so failure doesn't block lifecycle work (Q6). UPSTREAM: centralClock (indirect via scanner pause/resume); xstockSpotScanner instance methods; vts-trade-persistence bulk helpers; getOpenVirtualTradesMap accessor; b-new-34b-prewarm-snapshot.runPrewarm(). DOWNSTREAM: scheduled_tasks_audit rows; PM2 log lines (`[B-NEW-36][LIFECYCLE_INIT_OK]`, `[B-NEW-36][SCAN_PAUSED]`, `[B-NEW-36][WEEKEND_SHUTDOWN_*]`, `[B-NEW-36][WEEKEND_RESTART_*]`). Blast radius: MEDIUM (orchestrates scanner runtime behavior + open-trade state during a real-time window). |
| **xstockSpotScanner pause() / resume() / getIsPaused() (NEW methods)** | `server/asset_classes/xstock_spot/scanner.ts` (MODIFIED, lines ~133, ~155-172, ~209-220, ~268-322) | Adds `isPaused: boolean` to `XstockSpotScannerService` private state + `diag.isPaused` to `ScannerDiagnostics`. `pause()` sets `isPaused=true` without unsubscribing from centralClock or nulling clockTickHandler — graceful-drain semantics (in-flight cycle finishes, next tick observes flag and no-ops). `resume()` clears the flag; no resubscribe needed since the handler reference is retained. `stop()` still fully unsubscribes (distinct semantic; full teardown). UPSTREAM: lifecycle controller calls. DOWNSTREAM: per-tick handler short-circuit prevents per-cycle DB reads + DBS compute + eval-cycle dispatch during the weekend window. Low-frequency `[B-NEW-36][SCAN_PAUSED]` log line every 600 ticks (~10 min) keeps a stuck-paused state detectable without filling logs across a 48-hour weekend. Blast radius: MEDIUM (changes scanner runtime semantics — added a new state but preserved all existing state transitions). |
| **markOpenTradeClosed extension (CRITICAL guard)** | `server/services/vts-trade-persistence.ts` (MODIFIED, lines 124-138) | Extends the existing soft-delete UPDATE to also set `state='closed'` atomically with the `closed=true` flip. Required because the new CHECK constraint would otherwise reject EVERY trade close (row would land at `closed=true, state='open'`, violating the closed↔state clause). Pre-audit §4.1 flagged this as the most critical implementation guard. UPSTREAM: VTS sim cycle close paths (`resolveOpenVirtualTrades` after exit decision); any other code that closes a virtual trade. DOWNSTREAM: rehydrate path reads the now-consistent state; sim cycle's iteration filter correctly ignores closed rows (which never enter the in-memory Map anyway). Blast radius: HIGH if missed (every close fails); ZERO with the extension in place. |
| **rehydrateOpenTrades surfaces state column** | `server/services/vts-trade-persistence.ts` (MODIFIED, lines ~158-208) | SELECT now includes `state`; row mapper populates the `state` field on the `OpenVirtualTradeRecord` with `?? 'open'` defensive default. UPSTREAM: server boot path (`server/index.ts` calls `rehydrateOpenVtsTrades`). DOWNSTREAM: in-memory `openVirtualTrades` Map carries `state` field per trade; sim cycle's iteration filter reads it. Blast radius: LOW (additive SELECT field; default ensures pre-B-NEW-36 rows stay valid). |
| **Bulk helpers `markAllXstockWeekendSuspended` + `unmarkAllXstockWeekendSuspended`** | `server/services/vts-trade-persistence.ts` (NEW, lines ~155-235) | Scope strictly `asset_class='xstock_spot'`. Use a CTE (`WITH u AS (UPDATE ... RETURNING id) SELECT COUNT(*) FROM u`) to atomically perform the bulk-UPDATE and return the affected count. After the DB write, iterate the in-memory Map (passed by reference from the controller via `getOpenVirtualTradesMap()`) and mirror the state change so the sim cycle's iteration filter sees the new state on the next tick instead of waiting for the next rehydrate. UPSTREAM: lifecycle controller boot-init + Fri-shutdown + Sun-restart paths. DOWNSTREAM: vts_open_trades DB rows (xstock_spot scope only); in-memory Map records (xstock_spot scope only). Defense-in-depth: even if the helper drifted to a different asset_class, the CHECK constraint would physically reject the write. Blast radius: MEDIUM (touches up to all xstock_spot open trades in a single transaction; scoped). |
| **vts-runner sim cycle iteration filter + interface field + Map accessor** | `server/services/vts-runner.ts` (MODIFIED, lines ~515-590, ~2010-2030, ~2110) | `OpenVirtualTrade` interface gets `state?: VtsOpenTradeState` field (via type-import from vts-trade-persistence to avoid circular dependency). `resolveOpenVirtualTrades` adds `if (t.state === 'weekend_suspended') continue;` to BOTH the symbol-collection loop AND the main per-trade evaluation loop (defense-in-depth; both paths would otherwise route weekend-suspended trades into TEC eval). NEW exported `getOpenVirtualTradesMap()` accessor returns a narrow `Map<string, { assetClass; state? }>` view of the internal `openVirtualTrades` Map for the lifecycle controller to mirror state changes into. UPSTREAM: rehydrate path populates the Map. DOWNSTREAM: TEC config resolution skipped for xstock_spot during weekend window = closes RUNNING_ISSUES #116 by side-effect. Blast radius: LOW (filter is idempotent; accessor returns existing Map, no new allocation). |
| **runPrewarm() named export from b-new-34b-prewarm-snapshot.ts** | `scripts/b-new-34b-prewarm-snapshot.ts` (REFACTORED) | Extracts `runPrewarm({ lookbackDays, symbols, dryRun, connectionString })` as a named export returning `{ totalSeconds, symbolsProcessed, symbolsWithData, symbolsEmpty, symbolErrors, totalBuckets, totalUpserts, dryRun }`. CLI wrapper preserved via `import.meta.url`-based direct-invocation detection (`isDirectInvocation` boolean) — `npm run b-new-34b:prewarm` continues to work identically. UPSTREAM: lifecycle controller imports the named export for in-process invocation from the two scheduled hooks. DOWNSTREAM: same as before (xstock_spot_ohlc_60m_snapshot UPSERT writes). Per-call pg.Pool (no shared pool with controller; runs at most twice/week from lifecycle + ad-hoc CLI). Blast radius: LOW (functional refactor; semantic preserved). |
| **server/index.ts boot wiring** | `server/index.ts` (MODIFIED, after line ~700) | Inserts `sessionLifecycleController.init()` call AFTER `xstockSpotScanner.start()` (HARD-FAIL) and AFTER `rehydrateOpenVtsTrades` (Map populated) so the controller has both the running scanner and the in-memory Map available for boot reconciliation. Wrapped in try/catch with soft-fail per established degrade-and-continue posture: a controller init failure does NOT exit the process (scheduled timers still register so subsequent fires can recover). UPSTREAM: server boot path. DOWNSTREAM: lifecycle controller becomes active. Blast radius: MEDIUM (boot-path change). |
| **xStock universe-split cleanup (sub-batch c)** | `shared/asset-classes.ts` + `server/asset_classes/xstock_spot/{market-hours,scanner}.ts` + `server/routes.ts` + `server/strategies/orb.ts` + `client/src/components/machine-learning/xstocks-tab.tsx` + 2 test files + 1 deleted test (B79.0c per-symbol membership test) | Retired the `XSTOCK_SPOT_24_7_SYMBOLS` 10-name designation (AAPL/CRCL/GLD/GOOGL/HOOD/MSTR/NVDA/QQQ/SPY/TSLA). 199 insertions / 435 deletions across 7 production files + 2 tests + 1 deleted test. Empirical Q9 verified all 10 names have zero weekend bucket activity in the snapshot — the 10-name 24/7 designation was a stale Phase-1 launch artifact. `isXstockMarketOpenUTC(symbol, now?)` now returns `!isInXstockWeekendClose(now)` for every symbol (symbol param retained in signature for backward compat with all call sites). Scanner off-ARCA-hours universe expanded from ~10 to ~265 effective. UI banner simplified to "All xStocks share identical hours" copy. ORB strategy lost its dead 24/7 bypass branch. UPSTREAM: scanner runCycle universe-build (3-state → 2-state collapse); routes.ts `/api/xstocks/freshness` endpoint (drops `is24_7` field from response). DOWNSTREAM: client xStocks tab consumer (`xstocks-tab.tsx`) renders without the Ext/ARCA column + Class header. Blast radius: MEDIUM (off-ARCA-hours scanner universe scaling 26×; absorbed comfortably by B-NEW-34b snapshot architecture + B-NEW-35 source-side dedup giving median 530ms cycle wallclock). |
| **Migration ledger reconciliation (sub-batch a)** | `_migrations` table (data only) + `Claude Comms and Packages/Change Lists/B_NEW_36_a_LEDGER_RECONCILIATION.md` (NEW per-file verification log) | 17 rows backfilled into `_migrations`: 16 governance-batch migrations from 2026-05-08 → 2026-05-17 (B79.TEC / B79.0e / B79.0g / B79.0g-tx / B79.0m.a × 4 / B79.0m.b × 2 / B79.0m.b2 / B-NEW-1 / B-NEW-42b / B-PHASE-A2 × 2) plus the B-NEW-35 Phase 1 rev6 SQL. Each file's effects verified against live DB state (table existence, column existence, row counts/values, index presence) before INSERT. `npm run db:migrate` now reports `No pending migrations. Database is up to date.` — unblocks B-NEW-36 sub-batch (b)'s db:migrate step. RUNNING_ISSUES #119 → RESOLVED. UPSTREAM/DOWNSTREAM: none (purely bookkeeping). Blast radius: NONE (data-only). |
| **Langston dispatch-anchoring rule** | `/home/langston/CLAUDE.md` §12 (NEW) | Adds the rule that the dispatch prompt's explicit inbox-path reference is the AUTHORITATIVE batch context — overrides any "current batch" mention in Langston's MEMORY.md. Prevents Langston confabulating with prior-batch context after fresh-UUID SSH+claude-cli dispatches (observed failure mode 2026-05-20: Langston pulled B-NEW-34b code-review template from MEMORY when CC's dispatch was actually for B-NEW-36 sub-batch (c) Step 2 — caught via verification-anchor pattern, fixed structurally with this rule). UPSTREAM: every CC→Langston dispatch. DOWNSTREAM: Langston's review-anchor logic. Blast radius: NONE (governance rule). |

## Recent Additions (xStocks UI sprint, 2026-05-13)

| Component | Location | Impact |
|-----------|----------|--------|
| **Crypto-parity scanner defenses for xstock_spot** | `server/asset_classes/xstock_spot/scanner.ts` + `eval-cycle.ts` + `global-filter.ts` + `pattern-filter.ts` + `imf-evaluator.ts` | Three defenses missed in B79.0a → B79.0m.b2 ship: (1) cycle-scoped `XstockFilterConfigBundle` via `loadXstockFilterConfigs()` — pre-loads 7 screener_filters rows once per cycle, filter functions accept optional pre-loaded config (back-compat for unit tests). 1638 lookups/cycle → 7. (2) 25s `SCAN_TIMEOUT_MS` + `Promise.race` in `clockTickHandler` — force-resets isScanning on timeout, prevents wedge. (3) 75-pair round-robin rotation (70 rotated + 3 pinned benchmarks SPY/QQQ/GLD) with `rotationCursor` advancing per cycle. Cycle time 280s → 10-17s. Blast radius: LOW (xstock-only). **Pattern established: every dedicated scanner MUST implement these from day one** (Workflow Step 2b standing rules). |
| **Per-lane null-reason aggregates** | `server/asset_classes/xstock_spot/eval-cycle.ts` + `scanner.ts` | New `quantNullReasonAggregate` + `patternNullReasonAggregate` fields on `XstockEvalCycleCounters`. Incremented separately at family_filter_mismatch site (line 437) and strategy-null site (line 510). Lifetime accumulator in scanner sums both. Endpoint emits as `quant/patternNullReasonDetail`. Panel renders correct per-lane shares; previously the combined map was emitted in the quant slot causing > 100% sums. Blast radius: LOW (telemetry only). |
| **DB-backed 24h Trades Opened (xstock endpoint)** | `server/routes.ts` xstocks endpoint | Per-request DB query against `vts_open_trades` split by `signal_type` ('QUANT' vs 'PATTERN'). Replaces in-memory counter that reset on PM2 restart. Query indexed on `(asset_class, opened_at)`, <50ms expected. Per-cycle `lastCycleVtsEval` keeps in-memory counter (correct scope). Blast radius: LOW (single endpoint). |
| **xStocks tab UI: enriched byStrategy + section totals + per-pool null splits + scope-clarity relabel** | `client/src/pages/machine-learning.tsx` | Multiple changes: (a) pre-populate `byStrategy` with all 10 DB-enabled xstock strategies (zero-rows for dormant); (b) Setup Nulls "Section Total" row with drift indicator; (c) iteration filters `Object.entries(global).filter(([k,v]) => typeof v === 'number')` to skip the `applicable` object key (was rendering `[object Object]`); (d) Trades Opened reads `quant/patternTradesOpened` (post-gate) instead of `quant/patternSignalsGenerated` (post-detect); (e) labels honest about counter scope (in-memory since-process-start vs DB-backed 24h); (f) Pre-Eval Skips total includes all 6 pre-detect rejection sources + Last Scan list adds missing rows. Blast radius: LOW (UI only). |
| **Workflow doc Step 6b (Calibration cycle MANDATORY)** | `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` | Three sub-cycles required before declaring asset class production-ready: (1) regime classifier calibration, (2) filter threshold reality check, (3) strategy gate testing. Each has observation window + tuning surface + exit criteria. Distilled from crypto + xstock onboarding experience. Step 7b in procedural checklist; Section "Step 6b" body in detail. |
| **B-NEW-19: Possible Strategy Iterations row + subtractive pipeline flow (shared panel)** | `client/src/pages/machine-learning.tsx` `FilterDiagnosticsPanel` (shared by crypto + xstock tabs) + `server/routes.ts` xstock `lastCycleVtsEval` emit | New row "Possible Strategy Iterations" added between Pair-Pool Evaluations and Pre-Eval Skips across all three sections (Pipeline Summary 24h, Last Scan VTS Signal Funnel, 24-Hour Rolling Aggregates VTS Evaluation). Math: Possible Strategy Iterations = Pre-Eval Skips + Strategy Evaluations. Flow visually subtractive (parent − skips = evaluations). Resolves the conceptual confusion that Pre-Eval Skips count could exceed Pair-Pool Evaluations (different granularities: pair-lane vs pair-lane-strategy iteration). Last Scan VTS Signal Funnel had `colSpan={2}` total-only rendering; now per-lane Quant/Pattern split using `lc.quantNullReasonDetail` / `lc.patternNullReasonDetail`. 24-Hour Rolling Aggregates VTS Evaluation block previously rendered `pairsSkippedNoPrice` in quant col + `pairsSkippedInsufficientOHLC` in pattern col (semantically wrong); now real per-lane split. routes.ts xstock endpoint `lastCycleVtsEval` now emits `quantNullReasonDetail` + `patternNullReasonDetail` (was missing — crypto's `vts-runner.ts` `getLastVTSCycleSnapshot()` already included them). All leading `−` minus signs removed from Pre-Eval Skip displays. Applies to BOTH crypto and xstock tabs. Blast radius: LOW (UI math layout + 2 fields added to xstock endpoint emit). |

## Recent Additions (B52-B53)

| Component | Location | Impact |
|-----------|----------|--------|
| **Filter Diagnostics UI** | `client/src/components/vts/vts-filter-diagnostics-panel.tsx` (P19-B8.1: extracted from machine-learning.tsx; rendered by the self-fetching `vts-tabs.tsx` wrapper on ALL THREE mode pages — Live/Paper/Virtual Simulations — per the tab manifests; the ML page keeps only the FETCH for its DBS panel) | Displays VTS pipeline data: 24h Rolling Aggregates, Last Scan VTS Signal Funnel, By Strategy table, Pre-Evaluation Skips, Post-Signal Rejections, Setup Nulls, the reorg-B2.2 guardDrops gate, and (P19-B8.1) the DB-backed `tradesOpened24h` rows. Reads `/api/vts/filter-diagnostics` (v1.6). Family-Qualified reads BOTH response shapes (crypto top-level / xstock aggregated-nested — shim retired by #410). Blast radius: LOW (UI only). |
| **xStocks Observation Tab UI (B79.0i, final form rev2)** | `client/src/components/machine-learning/xstocks-tab.tsx` (NEW) + tab integration in `client/src/pages/machine-learning.tsx` (TabsTrigger + TabsContent block) + exports added to `client/src/pages/machine-learning.tsx` (FilterDiagnosticsPanel + FilterDiagnosticsData type) and `client/src/pages/analytics.tsx` (ExitStrategyAblationSection + FactorCalibrationSection with optional `endpointBase` prop). Sibling tab to "Filter Diagnostics" + "DBS Pair Tracking" (positioned LAST). VTS observation telemetry for xstock_spot. Phase 24 standing rule #10. **5 sections:** (1) Scanner Cycle Header — xstock-specific, reads `xstockSpotScanner.getDiagnostics()` via `/api/xstocks/filter-diagnostics` (xstockScanner field); (2) Per-Pair Fresh-Tick Latency — xstock-specific, reads `xstock_spot_ticker_snap` via `/api/xstocks/freshness`; (3) **FilterDiagnosticsPanel** REUSED via export — Pipeline Summary + Last Scan + 24h Rolling + VTS Eval Detail by-strategy + Setup Nulls + Pre-Eval Skips + Post-Signal Rejections + Filter Metric Ranges, scoped to xstock_spot via `/api/xstocks/filter-diagnostics`; (4) **ExitStrategyAblationSection** REUSED via export+endpointBase prop — same rich crypto B73 tables (window selectors, regime filter, per-variant breakdowns), endpointBase=`/api/xstocks/exit-strategy-ablation`; (5) **FactorCalibrationSection** REUSED via export+endpointBase prop — same rich crypto B67 tables (window selectors, tertile WR, predictive lift), endpointBase=`/api/xstocks/factor-calibration`. Cache-key isolation: every useQuery includes `{ asset_class: 'xstock_spot' }` in queryKey. Blast radius: LOW (UI only; no /api/vts/* or /api/analytics/* mods). **Pattern established (Phase 24 standing rule #6):** cross-asset-class UI component reuse via export+endpointBase prop with default preserving byte-identical legacy behavior. |
| **/api/xstocks/filter-diagnostics endpoint (B79.0i, rev2)** | `server/routes.ts` | Returns full `FilterDiagnosticsData v2.0` shape (lastScan, rolling24h, signalRejections, vtsEvaluation, lastCycleVtsEval, xstockScanner) so the existing `FilterDiagnosticsPanel` component renders verbatim. Populated from `signal_eval_archive` aggregations (real strategy/regime/null-reason data) + `xstock_spot_ticker_snap` (cycle counts) + `xstockSpotScanner.getDiagnostics()`. Funnel-rejection counters are zero because scanner doesn't track them yet — Day 1 = observability-only (line 260 TODO in scanner.ts); see RUNNING_ISSUES #92. Strategy-level + null-reason aggregates ARE real. Blast radius: LOW. |
| **/api/xstocks/freshness endpoint (B79.0i.a)** | `server/routes.ts` | Per-symbol `MAX(captured_at)` over last 24h via `LEFT JOIN VALUES` table-of-symbols → `xstock_spot_ticker_snap`. Returns `{symbol, lastTickAt, staleSeconds, state, is24_7}` rows sorted dead→stale→fresh, then by staleSeconds desc. Thresholds: fresh ≤90s, stale ≤600s, dead beyond. Schema `xstocks-freshness/v1.0`. Blast radius: LOW. Drives RUNNING_ISSUES #89 visibility (Kraken WS-equities weekend silence). |
| **/api/xstocks/exit-strategy-ablation + factor-calibration endpoints (B79.0i.b rev2)** | `server/routes.ts` | Sibling endpoints for the xStocks tab. Both call shared aggregators (`computeExitStrategyAblation` + `computeFactorCalibration`) with `assetClass='xstock_spot'`. Return same response shape as `/api/analytics/*` counterparts so reused UI sections render identically. Blast radius: LOW (sibling endpoints, no shared-endpoint mods). |
| **computeExitStrategyAblation (parameterized B79.0i.b)** | `server/services/exit-strategy-ablation-aggregator.ts` | Function signature gained optional `assetClass: string \| null = null` parameter. When null, no asset_class WHERE filter applied (preserves byte-identical pre-B79.0i.b legacy behavior — important: existing `/api/analytics/exit-strategy-ablation` route handler does NOT pass assetClass so behavior unchanged). When set (e.g., 'xstock_spot' from `/api/xstocks/exit-strategy-ablation`), SQL gains `AND asset_class = ${assetClass}` clause. Crypto regression invariant: any caller that omits the param gets byte-identical pre-change behavior. Blast radius: MEDIUM (cross-cutting aggregator) — but additive parameter, default-preserved. **Pattern established (Phase 24 standing rule #7):** shared-aggregator parameterization via optional asset_class. |
| **computeFactorCalibration (parameterized B79.0i.b)** | `server/services/drift-dashboard-aggregator.ts` | Function signature gained `assetClass: string = 'crypto_spot'` parameter at line 1034. Hardcoded `AND asset_class = 'crypto_spot'` literal at line 1055 replaced with parameterized `AND asset_class = ${assetClass}`. Default value preserves byte-identical pre-change behavior for `/api/analytics/factor-calibration`. When called with `'xstock_spot'` from `/api/xstocks/factor-calibration`, SQL filters xstock_spot rows. Crypto regression verified post-deploy: existing endpoint returns `factors: 10` unchanged. Blast radius: MEDIUM (cross-cutting aggregator) — but default-preserved. |
| **FilterDiagnosticsPanel + FactorCalibrationSection + ExitStrategyAblationSection exports (B79.0i.b)** | `client/src/pages/machine-learning.tsx` (line ~1820) + `client/src/pages/analytics.tsx` (lines ~1813 + ~2106) | Component functions converted from internal-only to `export function` so the xStocks tab can render them with xstock-scoped data. Both ablation sections gained optional `endpointBase` prop (default = existing crypto endpoint). Type `FilterDiagnosticsData` also exported. Blast radius: LOW (additive — no behavior change for existing internal callers). **Pattern (Phase 24 standing rule #6).** |
| **VTS Entry Validation Guard** | `server/services/vts-runner.ts` (B53 Fix 2) | Before opening a trade, verifies current market price is above stop and below target with minimum viable distance (2× friction). Prevents zero-duration trades. Logs `[B53][ENTRY_GUARD]`. Blast radius: MEDIUM (affects signal→trade conversion rate). |
| **VTS byStrategy Counters** | `server/services/vts-runner.ts`, `server/types/virtual-trade.interface.ts` | Per-strategy tracking of evaluated, nulls, signals, preRejectionSignals, rejected. Aggregated in 24h rolling window via `getVTSEvalRolling24h()`. Persisted to `logs/vts_eval_history/`. Blast radius: LOW (observability only). |
| **Null Reason Tracker** | `server/utils/null-reason-tracker.ts` | Global state: `setNullReason()` / `getNullReason()` / `resetNullReason()`. Reset before each strategy call. Used by all 19 canonical strategies (the `STRATEGY_DISPLAY_NAMES` key count; "17" was the pre-`strong_bull_trend`/pre-`orb` figure, corrected P19-B6.5c 2026-06-17) to classify why detect() returned null. Blast radius: LOW (diagnostic only). |
| **Pattern Recognizer** | `server/services/pattern-recognizer.ts` | Detects 6 pattern types: PINBAR, ENGULFING, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR, ABCD. Called by FX5 scanner (outer loop) and VTS (per-pair). B53: ABCD Fibonacci 0.350-0.820, min candles 12. B54: PINBAR wick 2×→1.5× body, INSIDE_BAR 0.1% tolerance, THREE_SOLDIERS 0.25% opens-in-body, MORNING_STAR body/range 0.4→0.3. **P19-B6.5c (2026-06-17):** `patternToTradeSignal` now returns **geometry/confidence only — no strategy name**. It no longer fabricates `pattern_<name>` strategy strings (those were invalid `strategy_type` enum values rejected at the RTB insert); the consuming canonical strategy is assigned downstream by the orchestrator via `resolvePatternConsumingStrategy` (see Signal Orchestrator entry + the B6.5c archive section). Patterns are triggers that feed the 19 canonical strategies, not strategies. Blast radius: MEDIUM (upstream of all pattern strategies). |
| **Strategy Threshold Constants** | `server/strategies/*.ts` | Each strategy file defines threshold constants at top. B53 relaxations: IB_MAX_COMPRESSION 0.80→0.85, SB_PROXIMITY 2.5%→3.5%, VE VWAP tolerance 1%, VE volume 1.5→1.3, RI_RSI_MAX 38→40. B57 Fix 4: support_bounce and reverse_impulse volume gate converted from hard 1.2-1.3x gate to graduated confidence factor (>=2.0x: bonus, >=1.2x: small bonus, >=0.8x: neutral, <0.8x: penalty). Breakout strategies keep hard gates. Blast radius: MEDIUM (affects signal generation rate). |
| **DI Threshold (DB-driven)** | `screener_filters` table (Supabase), `server/db/update-di-thresholds.ts` | DI_MIN for family filters. B54: active_trend and vts_trend 12→10. Breakout already at 10/8. DB is sole authority — app reads per scan cycle, no restart needed. Blast radius: MEDIUM (affects which pairs qualify for trend family). |
| **ai-analyst (REMOVED)** | `server/services/ai-analyst.ts` (dead code), `server/routes.ts` | B54: Legacy Walter/OpenAI service fully removed. 8 route handlers return 501. Service file retained for reference. No runtime impact — was already null-stubbed since migration. Blast radius: NONE (dead code removal). |

## Recent Additions (B63 — Strong Bull Trend + 19-item audit)

| Component | Location | Impact |
|-----------|----------|--------|
| **strong_bull_trend Strategy** | `server/strategies/strong-bull-trend.ts`, `server/services/strategy-engine.ts` | New strategy introduced in B63. Fires when: pairDBS ≥ 0.35, regime ∈ {TFS, IE}, sourcePool promoted to `quant-strong_trend`. Uses Variant E geometry (4× ATR stop, 3R target). Routes through strong-trend lane; `sourcePool === 'quant-strong_trend'` triggers geometry-override AND mode-overlay bypass downstream. Blast radius: MEDIUM (new signal source, affects open-book volume). |
| **MULTI_FAMILY_ELIGIBILITY Map** | `server/config/canonical-regime-strategy-map.ts` | NEW map `Record<string, StrategyFamily[]>`. Currently: `vwap_pullback: ['strong_trend']`. Allows a primary-family strategy to ALSO qualify for additional family lanes (B63 Item 11). Consumed by `server/services/vts-runner.ts` in the family-eligibility gate: `primaryFamilyMismatch && !additionalFamilyMatch` suppresses the signal. Blast radius: HIGH — adding entries here activates lane promotion for new strategies. Changes here affect signal routing downstream. |
| **Strong-Trend Geometry Override** | `server/services/vts-runner.ts` (L1060-ish), `server/services/paper-execution-engine.ts` (L2140-ish) | When `sourcePool === 'quant-strong_trend'`, signal carries `strongTrendGeometryOverride: { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 }`. Consumed by both VTS and paper engines. Upstream: `strategy-engine.ts` attaches on promotion; downstream: both execution engines read from signal. Blast radius: MEDIUM (affects trade geometry ONLY for strong-trend-lane trades). |
| **Mode-Overlay Lane Bypass** | `server/services/vts-runner.ts` (~L1086), `server/services/paper-execution-engine.ts` (~L2165) | When `sourcePool === 'quant-strong_trend'`, NORMAL/DEFENSIVE/SURVIVAL mode-overlay multipliers are bypassed; native geometry preserved. Prevents RR destruction on strong-trend trades during SURVIVAL mode. Mirrored across VTS + paper for parity. Blast radius: MEDIUM (geometry behavior differs from other lanes — any new lane must decide whether to honor or bypass). |
| **Counter-Trend LONG Guard (b63b)** | `server/strategies/morning-star.ts`, `server/strategies/reverse-impulse.ts`, `server/strategies/defensive-hedge.ts`, `server/services/strategy-engine.ts` (sma_trend_ride block) | When `dbsScore ≤ -0.35`, these 4 LONG strategies return null with null-reason `b63b_counter_trend_long_exclusion`. Upstream: `directional-bias-store` provides dbsScore via MCE. Downstream: null-reason tracker + strategy-engine skip. Blast radius: LOW (reduces signal generation in down-biased conditions; purely conservative). |
| **directional-bias-store** | `server/core/metrics/directional-bias-store.ts` (NEW) | Persistent Map<symbol, PairStoreEntry> with 5-row behavior spec: (1) cold-start, (2) below-floor-with-prior, (3) below-floor-no-prior, (4) invalid-compute, (5) happy-path. End-of-cycle atomic `publishSnapshot()`. Constants: `SNAPSHOT_HISTORY_MAX=96` (24h × 15-min cadence), `TRANSITION_HISTORY_MAX=50`, `GLOBAL_DBS_MIN_SAMPLE_COUNT=20`, `PAIR_HARD_EXPIRY_MS=300000` (5 min). Upstream: `market-context-engine.ts` calls `updatePair()` per MCE cycle then `publishSnapshot()` at cycle end. Downstream: `market-indicators.ts` reads `getLatestSnapshot()` + isStale flags; drift-dashboard-aggregator reads `getHistory()` + `getTransitions()`. Blast radius: HIGH (single source of truth for global DBS; 5-row spec governs what downstream gets). |
| **Global DBS isStale Surfacing** | `server/services/market-indicators.ts`, `client/src/pages/overview.tsx` (isStale badge) | `globalDBSIsStale: boolean` + `globalDBSSnapshotAgeSeconds: number` exposed on market-indicators response. UI badge on Overview tab renders when `isStale=true`. Upstream: directional-bias-store snapshot freshness check. Blast radius: LOW (observability). |

## Recent Additions (B64a — Regime & Strategy Drift Dashboard)

| Component | Location | Impact |
|-----------|----------|--------|
| **drift-dashboard-aggregator** | `server/services/drift-dashboard-aggregator.ts` (NEW) | Aggregates closed-trade performance from `logs/virtual_trades/` + regime telemetry from `logs/phase15b_dbs_telemetry/` + store history from `directional-bias-store`. 4 window modes: `rolling_24h`, `rolling_7d`, `rolling_30d`, `cohort_latest`. Produces per-regime strategy stats (N, Wins, WR, AvgNet$, AvgNet%, SumNet$, SumNet%), DBS distribution, family flicker %, RBS drift contamination %. Uses CANONICAL_REGIMES + REGIMES.* (no hardcoded regime strings — required for `regime_mapping_integrity.test.ts`). Blast radius: LOW (read-only analytics). |
| **Drift Dashboard Endpoint** | `server/routes.ts` (`/api/analytics/drift-dashboard`) | Exposes aggregator output with window query param. Blast radius: LOW (new endpoint). |
| **Drift Dashboard UI Tab** | `client/src/pages/analytics.tsx` (`DriftDashboardSection` + `GlobalDbsSparkline`) | 5th Analytics tab. Shows: trade counts, regime shares, DBS distribution, global DBS current + 24h sparkline + transitions, per-regime strategy performance table. Window toggle. Auto-refresh. Sparkline is inline-SVG (zero chart-lib dep). Blast radius: LOW (UI-only). |
| **24h Snapshot Ring Buffer** | `directional-bias-store.ts` internal | 96-entry ring buffer of `{timestamp, score, category, pairCount}` at 15-min cadence. Populated on every `publishSnapshot()`. Read by aggregator via `getHistory()`. Evicts oldest on push. Blast radius: LOW. |
| **Category Transitions Array** | `directional-bias-store.ts` internal | Last 50 category transitions of global DBS (from/to/timestamp). Populated only on FRESH snapshots (not degraded/stale). Read by aggregator via `getTransitions()`. Blast radius: LOW. |

## B63/B64a "If I Change X, Check Y" additions

- **If you edit `MULTI_FAMILY_ELIGIBILITY`** → check `vts-runner.ts` family-eligibility gate logic AND the canonical regime-strategy map narratives for the affected strategy. Adding a new entry activates lane promotion — verify the target lane's geometry and mode-overlay behavior is appropriate.
- **If you edit the strong-trend geometry override constants** → check BOTH `vts-runner.ts` AND `paper-execution-engine.ts` (mirrored). Also update System Manual §Strategy Geometry.
- **If you edit the mode-overlay bypass condition** → check sourcePool string matches exactly (`quant-strong_trend` — underscored). Any new lane that wants bypass must be added to both files.
- **If you edit `directional-bias-store` 5-row spec** → the spec is the authority over global DBS freshness/validity; changes cascade to `market-indicators.ts` isStale semantics AND to drift-dashboard-aggregator's freshness filters. Update System Manual §Global DBS Store.
- **If you edit the regime string constants** → ALL code paths must route through `CANONICAL_REGIMES` / `REGIMES.*` — no literals allowed. `regime_mapping_integrity.test.ts` enforces this. drift-dashboard-aggregator specifically was rewritten to satisfy this test.

---

*This map is a living document. Update it after any directive that changes component dependencies, adds new services, or removes legacy systems.*

---

## B65.1 — `module_constants` infrastructure (2026-04-23)

**New service:** `server/services/module-constants-service.ts`. 5-dim keying `(module_name, exchange, asset_class, strategy, regime, constant_name) → JSONB value`. Most-specific-wins resolution (regime weight 8, strategy 4, asset_class 2, exchange 1). 60s cache. Exports `getConstant`, `getModuleConstants`, `setConstant`, `invalidateModuleCache`, `clearModuleConstantsCache`.

**Schema additions:** `exchange` + `asset_class` columns on `watchlist_pairs`, `trading_signals`, `trades`, `paper_sim_trades`. `base_currency` NOT NULL on `trades` + `paper_sim_trades`.

**New deploy primitive:** `scripts/db-migrate.ts` + `npm run db:migrate`. Replaces drizzle-kit push (introspector breaks on PG ARRAY defaults — see CHANGES_AND_FIXES B65.1-FIX-001).

---

## B65.2 — Trailing-exit engine engaged (2026-04-23 + HF1-HF3 through 2026-04-24)

**Engaged:** `server/services/trailing-exit-controller.ts` was dormant since Phase 11; now called from BOTH the VTS exit loop and paper `checkExitConditions` via the new `server/services/tec-evaluator.ts` centralizer.

**Deleted (no deprecation):** `server/services/execution-controller.ts`, `server/config/execution-config.ts`, `server/types/trade-flow.ts`, 2 unit tests for those files.

**EXECUTION_CONFIG consumers migrated** to `module_constants` before deletion: dynamic-sizing-engine (`MAX_POSITION_RISK` → `risk_sizing.max_position_risk`), telemetry-aggregator (diagnostic mirror), boot-orchestrator + adjustment-registry (B65.2 version stamp), adaptive-manager (dead import removed), diagnostics-tab.tsx (narrative text).

**Schema:** `paper_sim_trades.trade_mode` column added (varchar 20, NOT NULL DEFAULT 'TARGET', CHECK `IN ('TARGET','TRAILING_TAKE')`).

**Stop writeback:** `paper_sim_open_positions.stop_loss` now updated on every engine ratchet (debounced 5s via `trade-safety.ts::persistTrailingStates`).

**SIGTERM handler:** `server/index.ts` shutdown handler synchronously flushes trailing-state persistence file.

**Engine state on UI:**
- `/api/vts/ml/open` extended with `tradeMode`, `breakEvenLatched`, `targetLatched`, `engineStopPrice`.
- `/api/vts/ml/closed` extended with `tradeMode` + raw `exitReason`.
- `client/src/pages/machine-learning.tsx` renders TEC State column on both Open + Closed Simulated Trades tables.
- `client/src/components/trading/trade-history-tab.tsx` renders updated close-reason badges (Trail / M.Cap / BE Protect / Stop / Target).

**Module-constants seed rows** (`trailing_exit` module): break_even_trigger_r=1.0, target_lock_r=1.5, trail_distance_atr_multiplier=1.0, persistence_debounce_ms=5000, moonbag_qualifying_strategies (4-strategy array), moonbag_qualifying_source_pools (vwap_pullback → quant-strong_trend only), moonbag_max_duration_ms=14400000, moonbag_cap_mode='reserved_slots', moonbag_reserved_slots=1. (`risk_sizing` module): max_position_risk=0.02.

**Exit-reason taxonomy after HF3:**
- `stop_hit` — entry-time stop hit, real loss
- `break_even_stop` — BE lock ratcheted stop hit before target. Near-breakeven protective exit.
- `target_hit` — static target hit, no trailing (non-qualifier or concurrency cap)
- `trailing_stop_hit` — moonbag (TRAILING_TAKE) trailing stop hit after target latch
- `moonbag_timeout` — moonbag held past 4h cap
- `timeout` / `stale_timeout` — VTS-only, MAX_HOLD_MS safety valve

**Cross-cutting impact:**
- **If you edit trailing-exit-controller.ts** → check tec-evaluator (caller), vts-runner exit loop, paper-execution-engine.checkExitConditions, parity test `b65-tec-parity.test.ts` + B80 test `b80-tec-per-trade-keying.test.ts`. PositionUpdate carries optional strategy/sourcePool/regime/callerMode/moonbagAllowed/moonbagQualified + **B80 (2026-05-13): required `tradeId` field**. Map is now **keyed by tradeId** (not symbol). All 5 entry points (`initializeTrailingState`, `getTrailingState`, `updateTrailingState`, `clearTrailingState`, `shouldClosePosition`) flip to tradeId. `getDiagnostics()` returns one row per trade; same symbol can appear N times. B79 xstock_spot market-hour freeze guard uses tradeId for state lookup, keeps symbol-keyed LOG line. `initializeTrailingState` accepts optional `seed: TrailingStateSeed` for Option C+ rehydrate (tradeMode + ladderRung + originalStopPrice). Engine-side defensive coercion enforces TRAILING_TAKE mode/rung invariant.
- **If you edit moonbag qualifier or caps** → values live in `module_constants` rows; engine reads via 60s cache. Tunable without redeploy. **B80 (2026-05-13): moonbag concurrency counter semantic shift — per-symbol → per-trade.** Pre-B80: three concurrent same-symbol trades transitioning to TRAILING_TAKE collapsed into ONE counter increment (shared-state bug). Post-B80: same scenario produces THREE increments (correct per-trade semantics). Effective cap enforcement: harder to fit N moonbag trades into `currentSlotTotal - moonbagReservedSlots`. The cap is now finally enforcing its declared semantics. Watch for moonbag entries that previously sneaked through getting correctly rejected; that is the cap working as designed, NOT a regression.
- **If you edit exit-reason mapping in vts-service.ts** → check `export-csv.ts::getClosedVTSTradesFromLogs` mapping priority. Raw exitReason now wins over legacy resultType for B65.2 reasons. Inverting that ordering re-introduces FIX-002.

---

## Adaptive Market Response — concept anchor (2026-04-25)

**Status:** concept-document only. Existing skeleton: `server/core/governance/strategy-modes.ts` (Directive 11.7S) maps `RegimeStability` → `StrategyMode` → mode-overlay multipliers. Currently mostly dormant. Concept doc at `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`. Conditional Phase 19.5 in roadmap.

---

## B65.4 — Ladder trailing model (2026-04-25)

**Engine state extension:** `TrailingState` interface in `server/services/trailing-exit-controller.ts` adds three fields:
- `ladderRung: number` — 0 = no targets hit; 1+ = N target hits in moonbag mode
- `currentRungTarget: number` — the active target being aimed at; advances on each rung event
- `currentRungFloor: number` — locked-in stop floor (cost-aware) from previous rung's target

**Engine semantic change:** `updatePosition()` now ratchets BOTH stop AND target on each rung event (was: only stop ratcheted via HWM dynamic trail in pure-trail design). Loop processes any further rung crossings within the same cycle for multi-rung price gaps. After ladder advances, dynamic HWM trail is preserved as a SECONDARY floor: `newStopPrice = max(currentRungFloor, dynamic_HWM_trail)`.

**Engine return extension:** `TrailingUpdateResult.ladderRungsHit: number` — propagated to all downstream consumers so the closed-trade record can capture how far up the ladder the trade climbed.

**Backward compatibility:** `importStates()` migrates pre-B65.4 persisted states. `targetLatched=true` → `ladderRung=1`, `currentRungTarget=targetPrice`, `currentRungFloor=0`. Logged.

**Schema:** `paper_sim_trades.ladder_rungs_hit INTEGER NOT NULL DEFAULT 0` column added (migration `2026-04-25-b65-4-add-ladder-rungs.sql`). `shared/schema.ts :: paperSimTrades` updated.

**Surface changes:**
- `tec-evaluator.ts::TECExitDecision` includes `ladderRungsHit`. All return paths in trailing branch propagate.
- `vts-runner.ts`: `OpenVirtualTrade` interface gains `ladderRungsHit`. Exit loop writes back from decision. `getOpenVirtualTradesForML` returns it on `/api/vts/ml/open`.
- `vts-service.ts::persistRealPriceTrade` accepts `ladderRungsHit`, writes to JSON log.
- `paper-execution-engine.ts::closePosition` reads engine state for `finalLadderRung`, writes to closed-trade row.
- `export-csv.ts::getClosedVTSTradesFromLogs` surfaces `ladderRungsHit` on `/api/vts/ml/closed`.

**UI changes:**
- `client/src/pages/machine-learning.tsx`: TEC State column on both Open + Closed Simulated Trades renders `🌙 MB×N` for trades with ladder rung count. Tooltip explains the ratchet count.
- `client/src/components/trading/trade-history-tab.tsx`: close-reason cell renders the same `MB×N` chip on moonbag-ended trades.

**Tests:** `server/tests/unit/b65-tec-parity.test.ts` extended with 9 new scenarios (12-20) covering rung 1/2/3, multi-rung gap in single cycle, qualifier/cap rejects (no ladder), HWM dynamic floor between rungs, duration cap at rung > 1, backward-compat persistence migration, Langston Q5 ordering test (rung target hit cleanly above prior HWM).

**Cross-cutting impact:**
- **If you edit the rung-step computation** in `updatePosition` → check that `rungStepPrice = state.targetPrice - state.entryPrice` is still calculated from ORIGINAL entry-to-target distance (not from currentStopPrice which can be ratcheted by then).
- **If you edit `computeNetTargetFloor`** → both Stage-1.5 BE-trailing AND ladder rung-floor computation use it. Behavior changes there cascade.
- **If you change `module_constants.trailing_exit.target_lock_r`** → controls when target latch fires (rung 0 → 1) but does NOT control the rung step size. Step size always = original target distance from entry.
- **If you persist new fields on `TrailingState`** → update `importStates` migration to handle missing fields with sensible defaults.

**Concurrency cap counter:** unchanged from B65.2. Counter increments on rung 1 entry (modeChanged from TARGET → TRAILING_TAKE), decrements on `clearTrailingState`. Subsequent rungs (2, 3, ...) do NOT re-increment — each trade occupies one moonbag slot regardless of rung count.

**Duration cap:** unchanged from B65.2. Timer starts at first target latch (rung 1), fires on cap exceed regardless of current rung. `ladderRungsHit` is captured on the `moonbag_timeout` close.

---

## B65.4.1 — Cost-aware floor formula change (2026-04-26 hotfix)

**Trigger:** B65.4 ladder counterfactual analysis showed the original `computeNetTargetFloor` formula (`target * (1 - totalCost/2)`) placed the rung floor BELOW the just-hit target, allowing reversals to exit below the original target value. Across the first 5 closed laddered trades, the ladder lost ~$11 vs the just-take-target counterfactual.

**Change:** new formula `target * (1 + slippage * bufferMultiplier)` places floor ABOVE the target by exactly the per-pair slippage estimate × multiplier. Multi-rung ratcheting still works unchanged.

**Module constant:** `trailing_exit.rung_floor_slippage_buffer_multiplier` (seed 1.0). Tunable per `(asset_class, exchange, regime, strategy)` without code redeploy. Migration `2026-04-26-b65-4-1-rung-floor-buffer-seed.sql`.

**Cross-cutting impact:**
- **If you edit `computeNetTargetFloor`** → both initial target-latch floor placement AND ladder rung-floor computation use it. Verify the function still receives the multiplier parameter and applies it correctly. BE-latch path uses `computeNetBreakeven` (separate function, NOT affected by this change).
- **If you change the multiplier seed** → `module_constants` DB update only; no code change required.

---

## B65.4.2 — Ladder observability columns (2026-04-28 hotfix)

**Trigger:** B65.4.1 verification 2026-04-28 showed counterfactual analysis was unreadable on "anomaly" rows because the closed-trade CSV didn't expose latch-trigger price, original stop, or per-rung target history. Analyst had to grep PM2 entry logs to recover original stops.

**Engine state extension:** `TrailingState` interface in `server/services/trailing-exit-controller.ts` adds three optional observability fields:
- `originalStopPrice` (number) — captured at `initializeTrailingState`, never modified.
- `latchTriggerPrice` (number) — set ONCE when `targetLatched` first flips false→true. Records actual latch-trigger price (which can differ from `state.targetPrice` due to `target_lock_r` interaction).
- `rungTargetHistory` (number[]) — appended at each ratchet. Index 0 = original target (rung 1).

**Propagation:** the 3 fields flow through `TrailingUpdateResult` → `tec-evaluator.ts:TECExitDecision` → `vts-runner.ts:OpenVirtualTrade` → `vts-service.ts:persistRealPriceTrade` → JSON log + `paper-execution-engine.ts:closePosition` → `paper_sim_trades` row. Also surfaced through `getOpenVirtualTradesForML` for the open-trades API serializer.

**Schema:** `paper_sim_trades` adds three columns (migration `2026-04-28-b65-4-2-ladder-observability-columns.sql`):
- `original_stop_price` decimal(20,8) nullable
- `latch_trigger_price` decimal(20,8) nullable
- `rung_target_history` jsonb nullable

**Backward compatibility:** `importStates` initializes `rungTargetHistory: []` on migrated states. `originalStopPrice` and `latchTriggerPrice` remain undefined for trades whose state was persisted before B65.4.2 (cannot reconstruct).

**Cross-cutting impact:**
- **If you edit the closed-trade CSV export schema** → 3 new columns appear in both open + closed exports (`server/utils/export-csv.ts` updated).
- **If you edit `getOpenVirtualTradesForML`** → 3 new fields added to the return type, read from engine state with `trade.*` fallback.
- **If you ever reconstruct old trades for backtest** → `originalStopPrice`/`latchTriggerPrice` will be null for trades closed before 2026-04-28; cannot be backfilled.

---

## Master planning doc reference (2026-04-27)

The regime classifier overhaul + external data integration plan lives at `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md`. **Required pre-work before any B67-related implementation.** §11 contains 12 decisions queued for Kyle.

**Architecture decisions (Kyle-pending) that affect SIM downstream:**
- B67 confidence-modifier architecture means the regime classifier formula stays unchanged; macroAdjustment (0.85-1.05x) modulates the confidence number, propagates through stability detector → existing mode overlay → throttle on entry.
- Phase dimension EARLY/PRIME/LATE on existing 5 regimes (no new top-level regimes). Naming locked 2026-04-28.
- B67 expanded to 6 sub-deliverables (~3-4 weeks). All 12 §11 decisions resolved 2026-04-28.

---

## B76 — Chain-Final Calibration Framework Refactor (2026-05-06, commit `235237ffd` + hotfix `c8b8709ed`)

**Architectural change to the B67.0 ablation framework — see B67.0 section below for the underlying emitter contract that B76 amends.**

**Two-pass stash-then-build pattern** added to both orchestrator emit paths (`signal-orchestrator.ts:682-995` + `vts-runner.ts:1456-1759`). PASS 1 at each factor's fire point pushes a `FactorAlternateInput` discriminated-union record onto a stash; PASS 2 after the post-floor clamp on `_modulatedConfChain` calls `buildAllAlternates(stash, chainFinalConfidence, regimeLabel)`. **`emitAblationRecord` contract amended (signature unchanged):** callers MUST pass chain-final `realDecision.confidence`. Raw classifier value preserved at `realDecision.metadata.predictiveConfidenceRaw`. Every row stamped `realDecision.metadata.calibrationFrameworkVersion = CALIBRATION_FRAMEWORK_VERSION` (exported TS const = `'b76_chain_final'`).

**New file:** `server/services/factor-ablation-builders.ts` (~210 LOC). Discriminated-union `FactorAlternateInput` (8 kinds: `b67_1`, `b67_2`, `b67_4`, `b68_1`, `b68_2`, `b68_3`, `b68_4`, `b68_5`). `buildAllAlternates(inputs, realConfidenceFinal, realRegimeLabel)` dispatcher with TS-exhaustiveness check. b67_1 expands to 3 alternates; others 1:1. B68.5 special-cases label-counterfactual (re-runs `calculatePairRegime` with gate disabled; chain-final reference attached for completeness but not used in divide-out math).

**New helper:** `buildB67_2Alternate` in `server/core/metrics/regime-phase.ts` (extracted from inline blocks duplicated in both orchestrators). Divide-by-weight semantics; metadata key rename `confidence_with_phase_pref` → `confidence_with_factor` for uniformity.

**Drift-dashboard-aggregator changes** (`server/services/drift-dashboard-aggregator.ts`): two `factor_name NOT IN ('b67_1_macro_modifier', 'b67_2_phase_dimension')` filters at L504 (computeAblationComparison) + L1052 (computeFactorCalibration) REMOVED. L1052 replaced with version-filter logic per Langston Step-1 §4 revision: keep row IF (factor not in 6 sensitive names) OR (has chain-final marker). Other 7 factors don't need the filter — predictive lift cancels first-order bias.

### Forward-couples (post-B76)

- **Edit `factor-ablation-emitter.ts` chain-final contract** → must update `emitAblationRecord` JSDoc + every `emitAblationRecord(...)` call site to maintain "callers pass chain-final" invariant. 2 call sites: `signal-orchestrator.ts:963` + `vts-runner.ts:1701`.
- **Edit `factor-ablation-builders.ts` discriminated union** → must update each orchestrator's `_alternateInputs.push({ kind: ..., ... })` site + `buildOneAlternate` switch arm. TS exhaustiveness check catches missing kinds at compile time.
- **Add a new factor producer post-B76** → (a) add `kind` to `FactorAlternateInput` union, (b) add dispatch arm in `buildOneAlternate`, (c) add `buildXAlternate` helper (positional first arg = realConfidenceFinal), (d) add stash push at fire point in BOTH orchestrators. Do NOT call build helper inline at fire point — that's the pre-B76 anti-pattern.
- **Edit `drift-dashboard-aggregator.ts:1052` factor calibration query** → if you add a new factor name, decide whether it needs the version filter. Rule: factors that are FIRST in chain (b67_1_*, b67_2_*) DO need it; later-chain factors typically don't.
- **Bump CALIBRATION_FRAMEWORK_VERSION** (future framework rev) → must (a) add the new value to the aggregator's accepted version set, (b) update unit-test fixtures, (c) document the cohort cutover in MEMORY + CHANGES_AND_FIXES.

### Blast radius

**MEDIUM-LOW.** Confined to calibration framework (1 emitter + 1 new dispatcher + 9 helpers + 2 orchestrator emit sites + 1 aggregator file). **Zero trading-path consumers** (live trading is OFF; even when ON, factor-ablation-emitter is observability infrastructure, not decision input). Reversibility: pure code revert (no schema migration). Risk to running positions = 0.

### Cohort distinguishability

Pre-B76 `regime_factor_alternates` rows: missing `realDecision.metadata.calibrationFrameworkVersion`. Post-B76 rows: present with value `'b76_chain_final'`. Use this marker to filter cohorts wherever the chain-final shift changes interpretation (b67_1_* + b67_2_* — first-in-chain factors). Aggregator `computeFactorCalibration` already enforces this filter for those 6 factor names. Other 7 factors (b67_4, b68_1, b68_2, b68_3, b68_4, b68_5) safe to mix cohorts because predictive lift (REAL spread − ALT spread) cancels first-order bias by construction.

### Verification (live)

```sql
-- All 10 factor names should appear within 24h post-deploy
SELECT factor_name, COUNT(*)
FROM regime_factor_alternates
WHERE real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final'
GROUP BY factor_name;
```

Expected: b67_1_btc_dominance, b67_1_funding_rates, b67_1_mcap_momentum, b67_2_phase_preference, b67_4_outcome_feedback, b68_1_multi_tf_agreement, b68_2_volume_regime, b68_3_pair_correlation, b68_4_regime_age, b68_5_path_b_sustainability.

Within 24-48h: drift-dashboard factor calibration table should show non-zero shift on `b67_1_*` + `b67_2_phase_preference` rows (was 0 by construction pre-B76). Predictive lift on B68.1 (+5.7), B68.2 (+4.1), B68.3 (+4.1), B67.4 (+3.0) should preserve sign + stay within ±1pp of pre-B76 values.

---

## B67.0 — Telemetry & Ablation Framework (2026-04-28, commit `105d2b53`)

**New service:** `server/services/factor-ablation-emitter.ts`. Fire-and-forget `emitAblationRecord(source, pairSymbol, realDecision, alternates)` API with discriminated `AblationSource = { kind: 'active_signal'; signalId: number } | { kind: 'vts_trade'; vtsTradeId: string }` union. Gated on `module_constants.ablation_framework.b67_0_ablation_emit_enabled` (default true). Bulk insert one row per (source, factor); empty alternates short-circuits to no-op. Errors caught + logged; classifier never blocks on emit.

**New script:** `server/scripts/replay-ablation.ts`. Nightly cron at 04:00 UTC (npm script `b67:replay-ablation`). Skeleton at B67.0 ship — counts pending rows by source_type, runs 90-day retention sweep on `evaluated_at`. Active-path replay outcome lookup gated until B67.5 produces ablation rows joinable to `paper_sim_trades`. VTS path JSONL outcome reader gated until first B67.1+ factor producer needs it. Exported `classifyTradeOutcome(pnlUsd)` and `AblationOutcome` type for downstream factor producers.

**New table:** `regime_factor_alternates` (12 columns). XOR CHECK constraint: exactly one of `signal_id` (integer, for active path) or `vts_trade_id` (text, for VTS path) populated; `source_type IN ('active_signal','vts_trade')` discriminator. JSONB `real_decision` and `alternate_decision` permissive for forward-compat. `replay_outcome` + `replay_completed_at` populated by nightly job. 4 indexes: (factor_name, evaluated_at DESC), (signal_id WHERE NOT NULL), (vts_trade_id WHERE NOT NULL), (pair_symbol, evaluated_at DESC).

**New module_constants seeds (`ablation_framework` module):**
- `b67_0_ablation_emit_enabled` (bool, default `true`)
- `b67_0_alternates_retention_days` (int, default `90`)
- `b67_0_paper_replay_capital_threshold_pct` (float, default `0.80`)

**Wire-in sites (call hooks for B67.1+ factor producers):**
- `server/services/signal-orchestrator.ts` — emit hook after `readyToBuyService.queueSQESignal()` in the active-trading path. Today fires with empty alternates (no-op). When B67.1+ ships, each producer adds its `FactorAlternate` to the array.
- `server/services/vts-runner.ts` — emit hook before `return { signal, tradeRecord }` in the VTS-mirror path. Same empty-alternates pattern.

**New API endpoint:** `GET /api/analytics/ablation-comparison?window=...` (`server/routes.ts`). Reads `regime_factor_alternates` via the aggregator, returns per-factor counterfactual stats. Empty until B67.1+ producers ship.

**Aggregator extension:** `server/services/drift-dashboard-aggregator.ts` adds `computeAblationComparison(window)` exported function. GROUP BY factor_name with conditional JSONB aggregations from `replay_outcome` for the four-quadrant taxonomy (admit/admit, admit/reject, reject/admit, reject/reject). Lazy-imports DB to avoid coupling the file's existing JSONL paths to Drizzle/pg at module load.

**UI:** `AblationComparisonSection` component in `client/src/pages/analytics.tsx` Drift Dashboard tab. Renders below existing `DriftDashboardSection`. 60s refetch. Window toggle (24h / 7d / 30d / since-restart). Empty-state explainer when `totalRows === 0`; 8-column table when populated.

**Cross-cutting impact:**
- **If you edit the emitter API signature** → check both call sites (`signal-orchestrator.ts`, `vts-runner.ts`) AND every B67.1+ factor producer that accumulates alternates. The discriminated `AblationSource` union enforces source-type at the type level — the wire-in sites cannot pass a raw integer.
- **If you change the four-quadrant taxonomy in `replay-ablation.ts`** → update the aggregator's SQL CASE conditions in `drift-dashboard-aggregator.ts` and the UI's column labels. The `notes` and `alternateOutcome` discriminator strings flow through three files.
- **If you flip `b67_0_ablation_emit_enabled = false`** → emit becomes no-op globally. Useful as kill-switch if storage growth is unexpected. No code change needed.
- **If you change the retention window** → update `b67_0_alternates_retention_days` in `module_constants`; nightly job picks it up next run.
- **If you migrate trade outcome storage off paper_sim_trades + JSONL** → the replay job's outcome-lookup queries (gated for B67.1+) need a corresponding update.

**Blast Radius:** **MEDIUM** at B67.0 ship time (no factor producers yet, observation-only). Becomes **HIGH** as factor producers ship and the framework's outputs feed live calibration decisions.

**Status:** **ACTIVE** — shipped 2026-04-28 in commit `105d2b53`. PM2 restart #101. HTTP 200. 0 rows in table (expected at ship time). Step-7 first-pass verification clean. Step-8 Langston second-pass + Kyle UI ack pending.

**B67.x cross-references "If I Change X, Check Y":**
- **Edit `factor-ablation-emitter.ts`** → check both wire-in sites + every factor producer
- **Edit `regime_factor_alternates` schema** → update `shared/schema.ts` Drizzle table, migration + rollback files, aggregator SQL queries
- **Edit `replay-ablation.ts` outcome taxonomy** → update aggregator SQL discriminators AND UI column labels
- **Edit aggregator window translation** → both `drift-dashboard-aggregator.ts` (existing) and the new B67.0 `WINDOW_TO_MS` constant must agree; mismatched window semantics produce confusing dashboards
- **Add a new B67.x factor producer** → add the alternate computation at the wire-in sites in signal-orchestrator + vts-runner; do NOT modify the emitter API; new factor name strings should be `b67_X_<descriptor>` for consistency

**Independent safety gap (separate from B67.0 scope) — ✅ RESOLVED by P19-B6 (2026-06-17):** B67.0 V2 pre-audit found the kill-switch `dailyLossKillSwitchPct` was configured but `tripKillSwitch()` was only called manually — no auto-trip code existed (Phase-19.4.5 item 9, BLOCKING for live activation). **P19-B6 RESTORED the deleted Phase-8 auto-trip** as `server/services/daily-loss-budget.ts` (re-homed `checkKillSwitch` + `calculate24hPL` from `594aad717^`), wired to a `setImmediate` post-close hook; auto-trips `tripKillSwitch` on a session-anchored rolling-24h loss breach + 2 warning tiers. DORMANT-in-effect until active paper turns on; force-trip-proven (gate 7). See the kill-switch/daily-loss note near the top of this map.

---

## B67.1 — Macro Confidence Modifier (2026-04-28, commit `828f6d92`)

**New service:** `server/services/external-macro-feed.ts`. Singleton polling CoinGecko `/global` (BTC dominance + total mcap) and Binance `/fapi/v1/premiumIndex` (BTC + ETH 8h funding rates, OI-weighted 0.6/0.4). 60s cache + 720-sample in-memory rolling window for z-score normalization. Partial-feed graceful (one upstream fails → snapshot.partialFeed=true; both fail → stale snapshot retained). Loud `[B67.1][feed]` PM2 logging per cycle. Lifecycle: `initExternalMacroFeed()` at boot; `getLatestMacroSnapshot()` + `getLatestMacroBaseline()` sync read API.

**New pure function:** `server/core/metrics/macro-modifier.ts`. `computeMacroModifier(snapshot, baseline, config)` returns `{value, btcDomZ, fundingZ, mcapZ, fallbackActive, staleDataFlag}`. Cold-start floor: when any baseline has < `b67_1_zscore_min_sample_count` (default 48) samples → modifier=1.0 + fallbackActive=true. Stale-data floor: snapshot.ageSeconds > staleSeconds → modifier=1.0 + staleDataFlag=true. Sign convention: rising BTC dominance penalizes (alt confidence drops on "BTC season"); crowded funding penalizes (mean-revert risk); rising mcap momentum reinforces (broad-breadth confirmation). Exports `buildB67_1Alternate()` helper that produces the B67.0 ablation alternate row from a modulated confidence + modifier result via reverse-derivation `confidence_without = modulated / modifier.value`.

**Modified:** `server/core/metrics/market-regime.ts` `calculatePairRegime(ohlcData, dbsScore=0, macroModifier=1.0)` — accepts optional 3rd `macroModifier` parameter applied PRE-clamp. Confidence clamp upper bound raised 0.95 → 1.0 to accommodate post-modifier 0.95×1.05=0.9975. Verified zero callers asserted on prior 0.95 ceiling. Default 1.0 preserves pre-B67.1 behavior for callers that don't pass the arg.

**Modified:** `server/services/market-context-engine.ts` MCE adds `refreshMacroContext()` async timer started in `start()` (interval = `cacheTTLMs`, default 60s). Reads `module_constants.macro_modifier.*` for config, reads snapshot + baseline from feed singleton, computes modifier, caches result on instance. Sync accessor `getCurrentMacroContext()` exposes cached `MacroContext = { snapshot, modifier: MacroModifierResult | null }` for downstream consumers. `computeContext()` reads cached macro context, threads `modifier?.value ?? 1.0` into `calculatePairRegime` 3rd arg, attaches macro context to returned `MarketContext.macro` field. **Refresh is async outside per-pair hot path** — no latency impact on per-pair classification.

**Modified:** `server/services/signal-orchestrator.ts` (line ~638 emit hook) and `server/services/vts-runner.ts` (line ~1374 emit hook) — push `buildB67_1Alternate()` row onto `emitAblationRecord` alternates array when MCE has non-null modifier. In shadow mode (`b67_1_enabled=false`), MCE returns `{snapshot, modifier: null}` and the hook does NOT emit a B67.1 alternate. After flip, every signal evaluation emits the alternate with the agreed JSONB shape.

**Modified:** `server/services/market-snapshot.ts` reconciled per pre-audit §3.5. Pre-existing stub returned hardcoded values (`btcDominance: 54.2`); now thin wrapper around `external-macro-feed.ts` `getLatestMacroSnapshot()`. Single existing caller (`ai-market-analyzer.ts`) transparently inherits real values. New `fundingRate?: number` field on the `MarketSnapshot` type.

**Modified:** `server/services/autonomy-scheduler.ts` adds `initExternalMacroFeed()` at boot, alongside the existing `initMarketContextEngine()`. Fire-and-forget; errors logged.

**Modified:** `server/types/market-context.ts` adds `MacroContext` interface + optional `macro?: MacroContext` field on `MarketContext` (back-compat).

**New module_constants seeds (`macro_modifier` module, 11 rows):**
- `b67_1_enabled` (bool, default `false` shadow)
- `b67_1_btc_dominance_weight` / `funding_weight` / `mcap_momentum_weight` (floats, 0.40 / 0.35 / 0.25)
- `b67_1_modifier_min` / `modifier_max` (floats, 0.85 / 1.05)
- `b67_1_external_feed_cache_seconds` (60) / `b67_1_external_feed_stale_seconds` (300)
- `b67_1_btc_dominance_zscore_lookback_days` / `b67_1_funding_zscore_lookback_days` (30 / 30)
- `b67_1_zscore_min_sample_count` (48 — cold-start floor per Langston cc-inbox #844)

**Cross-cutting impact:**
- **If you edit `calculatePairRegime` upper-clamp** → upper bound is 1.0 post-B67.1 (was 0.95 pre-B67.1). Anything reading regime.confidence and asserting on a strict 0.95 ceiling breaks.
- **If you edit the MCE refresh cadence** → both the constants-read and the modifier compute happen on this timer. Per-pair `computeContext` reads the CACHED context synchronously; cadence change affects refresh staleness, not per-pair accuracy.
- **If you flip `b67_1_enabled = true`** → MCE refresh sets `modifier` to a non-null value; `calculatePairRegime` starts applying modulation; ablation hooks at orchestrator + vts-runner start emitting B67.1 alternate rows. No code redeploy required.
- **If you change the BTC + ETH 0.6/0.4 OI weighting** → this is intentionally hardcoded in `external-macro-feed.ts` (NOT in `module_constants`) per Langston cc-inbox #845 — changing it requires understanding OI structure, not knob-tuning.
- **If you persist the rolling baseline to DB** (B67.4 future) → see `external-macro-feed.ts` header — currently in-memory only; promote to `macro_feed_history` table only if calibration check requires restart-surviving baselines.
- **If you add a new factor producer (B67.2+)** → follow B67.1's pattern: pure function, MCE refresh-loop wire-up if global, sync accessor, ablation hook at both orchestrator + vts-runner. Do NOT modify emitter API.
- **If you reconcile `market-snapshot.ts` further** → 1 caller today (`ai-market-analyzer.ts`); type already extended with `fundingRate?` field. Shape changes need to consider that caller.

**Blast Radius:** Currently **LOW** — confidence is decorative pre-B67.5 (no consumer reads it as a gate; verified `isHighConfidenceRegime()` has zero callers). Becomes **HIGH** at B67.5 when consumers wire in.

**Status:** **SHIPPED** 2026-04-28 in commit `828f6d92`. PM2 restart #103. HTTP 200. Migration `2026-04-28-b67-1-macro-modifier.sql` applied cleanly. Feed alive (`[B67.1][feed]` per 60s). All 11 seeds verified. Shadow mode (`b67_1_enabled=false`). 18 unit tests pass at `b67-1-macro-modifier.test.ts`. Step-7 first-pass verification clean. Step-8 Langston second-pass acknowledged via cc-inbox #847.

**B67.1 cross-references "If I Change X, Check Y":**
- **Edit `macro-modifier.ts` formula** → unit test cases need refresh; ablation row reverse-derivation in `buildB67_1Alternate` may need adjustment if value semantics change
- **Edit `external-macro-feed.ts` upstream API URLs** → confirm response shape parsers; partial-feed handling triggers gracefully
- **Edit MCE refresh interval** → impacts both modifier staleness and the constants-cache hit ratio
- **Add a fundingRate consumer outside `external-macro-feed.ts`** → re-read via `getLatestMacroSnapshot().fundingRate`; do NOT poll Binance directly elsewhere
- **Promote rolling baseline to DB** → migration + rollback + state class refactor; B67.4 dependency

**B67.1 V2 pre-audit findings carry forward:**
- **defensive-hedge BTC correlation:** orthogonal to B67.1 (per-pair Spearman vs macro dominance). No double-count. Different decision points (strategy entry filter vs system-wide regime confidence). Documented `BATCH_67_1_PRE_AUDIT.md` §3.4.
- **`market-snapshot.ts` stub:** reconciled inline per `BATCH_67_1_PRE_AUDIT.md` §3.5. Single caller transparently upgrades. No parallel `MarketSnapshot` type created.

---

## B67.x pre-calibration-window foundation work (2026-04-29, commits `ed9a1a08` → `8f417ca5`)

**Per-input ablation split** (`ed9a1a08`): single `b67_1_macro_modifier` factor row replaced with three per-input rows (`b67_1_btc_dominance`, `b67_1_funding_rates`, `b67_1_mcap_momentum`). Each emits per signal evaluation (3× row volume vs pre-split). `b67_2_phase_dimension` renamed `b67_2_phase_preference`. New `MarketContextEngine.getCurrentMacroConfig()` accessor. Pre-split rows preserved in DB but frozen — dashboard query filters them out.

**B67.2.1 trade record persistence** (commits `141ec3c3` + `41abd541` + `575dbca4`): 6 new nullable columns on `paper_sim_trades` (regime_confidence_raw, macro_modifier_value, phase, phase_age_seconds, strategy_phase_weight, regime_confidence_modulated) + CHECK constraint on phase. `OpenVirtualTrade` interface extended with same 6 fields + `pairIdHash`. Both active-trading path (`paper-execution-engine.ts:1850`) and VTS path (vts-runner trade-open + `persistRealPriceTrade` propagation to JSONL) populate from MCE cached state. UI renders all in same column as regime label; CSV exports auto-include via Object.keys generator.

**B67.0 replay logic** (commits `3d1a1e7f` + `5e1031a6` + `33df2380`): `replay-ablation.ts` actual outcome lookup wired (was stubbed). VTS JSONL reader indexes 14d of closed trades by `signal.id`; matches against ablation row `vts_trade_id` (which is = signal.id at emit time). Real bug fixed: persistRealPriceTrade was creating a NEW random `vs_*` id, threading original `vsig_p10_*` id through as `originalSignalId` field so join resolves. Active-path query implemented for forward-compat (currently no rows since active trading is OFF). Cron scheduled 04:00 UTC nightly in root crontab.

**Persistence: regime-phase store + macro feed** (`8f417ca5`):
- `server/core/metrics/regime-phase.ts` — `regimePhaseStore` reads `/tmp/regime-phase-store.json` on construction (24h hard-expiry on entries to drop ancient state). Saves on every regime-transition tick (always) + ~2% of stable-regime ticks (throttled). Pattern matches `server/services/trailing-exit-controller.ts`'s state file.
- `server/services/external-macro-feed.ts` — `restoreFeedState()` called on init before first poll; `persistFeedState()` called after every successful poll cycle (60s cadence; ~2KB JSON). Restores `lastSnapshot` + 3 rolling-window sample arrays + `prevTotalMarketCapUsd`.

**Net effect:** PM2 restarts no longer reset phase ages or z-score baselines. Pairs accrue regime age across deploys; modifier produces real z-score-driven values immediately on restart instead of the prior ~48 minutes of `fallbackActive=true`. Both findings root-caused investigation 2026-04-29 (16 closed VTS trades all phase=EARLY, modifier=1.0 — traced to 8 PM2 restarts within a few hours).

**Cross-cutting impact:**
- **If you edit `regime-phase.ts` tick semantics** → check the persistence write logic + the 24h expiry threshold + the throttled-save heuristic
- **If you edit `external-macro-feed.ts` state shape** → update `persistFeedState`/`restoreFeedState` field list + the JSON structure
- **If you reset by removing `/tmp/*.json` files** → expect the cold-start fallback for ~48 minutes for the macro feed; phase store starts empty + fills on next MCE cycle
- **If you migrate `/tmp` to ephemeral storage on a new host** → both files are recreated automatically but state is wiped (acceptable; same as a code redeploy)
- **If you scale horizontally (multiple instances)** → these files are local; need a shared store (DB or Redis) before any multi-instance deploy. Today single-instance, so not blocking.

**B67 dashboard cleanup** (`drift-dashboard-aggregator.ts`): aggregator SQL filters `factor_name NOT IN ('b67_1_macro_modifier', 'b67_2_phase_dimension')` so the dashboard shows only the 4 active per-input rows + `b67_2_phase_preference`. Legacy frozen rows preserved in DB.

**Pre-existing B62 confidence saturation finding** (resolved by B67.3.5 below): TFS branch in `market-regime.ts:177-184` saturated at 0.95 INPUT for any pair with positive momentum + |DBS| ≥ 0.30. Resolved 2026-04-29 in B67.3.5; HVU/RBS/IE/ST branches still use original step-function formulas (deferred per `RUNNING_ISSUES.md` #40).

**B67.3.5 — Pre-Window Hardening** (commits `49209eb4` + `d97d47d7`, PM2 #114, 2026-04-29):

*Phase backfill from OHLC history* (`server/core/metrics/regime-phase.ts`): new `backfillFromHistory` method walks 12 backward 60-min OHLC windows running `calculatePairRegime` to find the actual regime entry boundary. First-observation only (regime transitions handled by normal `tick()`). Uses CURRENT DBS as approximation. Insufficient-history (<30 candles) → structured warning + `enteredAt = now`. Walk-cap (no different regime within 12h) → pair lands in LATE phase. Persists via existing `/tmp/regime-phase-store.json`. New optional `BackfillContext` parameter on `tick()` is backwards-compatible.

*TFS branch desaturation* (`server/core/metrics/market-regime.ts:177-184`): step-function replaced with continuous mapping `confidence = min + (max - min) × (momentum_factor × dbs_strength × vol_inverse)`. Multiplicative — any weak input collapses score. Output [0.50, 0.90] via 5 module_constants in `regime_classifier` module (TFS-scoped): `b67_3_5_tfs_desat_min/max/momentum_scale/volatility_scale/dbs_scale`. Recalibrate via DB UPDATE; no code redeploy.

*New `RegimeConfig` type* (`server/types/market-regime.types.ts`): contract carries the 5 desat tunables. Required 4th param on `calculatePairRegime`. `DEFAULT_REGIME_CONFIG` exported for advisory paths (diagnostics, tests).

*MCE wiring* (`server/services/market-context-engine.ts`): `regimeConfig` field resolved in `refreshMacroContext` with hard-fail on missing keys. `getCurrentRegimeConfig()` accessor. Threaded as 4th param into `calculatePairRegime` AND as `BackfillContext` into `regimePhaseStore.tick`. Cleared on `MCE.stop()`.

**B67.3.5 cross-references "If I Change X, Check Y":**
- **Edit TFS desat formula** → b67-3-5-tfs-desat unit tests need refresh; multiplicative semantics encode "all three align" — replacing inputs requires re-thinking
- **Edit module_constants desat scales** → no code redeploy; `UPDATE module_constants SET value=...`
- **Edit walk depth** → 12 currently matches LATE phase; track `b67_2_prime_phase_max_hours` if it changes
- **Edit `regimePhaseStore.tick` signature** → 4 callers (3 tests + 1 MCE); `BackfillContext` optional so backwards-compatible
- **Add a new regime classification branch** → it gets the original step-function default; for desat pattern, extend `RegimeConfig` + migration

**Live evidence post-deploy:** First diversified macro modifier observed = 0.85 (clamped to min) with real z-scores (BTC -0.79, funding +1.90, mcap +0.08). Macro feed rolling windows survived restart (btc:78, fund:96, mcap:77 samples). RegimeConfig contract resolved cleanly. Backfill log lines + TFS distribution shift + phase mix shift deferred to ~24h verification.

**Status**: B67.3.5 LIVE on PM2 #114. All 7 pre-calibration-window foundation fixes complete. Calibration window starts when B67.4 cheap-tier bundle ships (the only remaining pre-window step).

---

## B73 — Exit-Strategy Ablation Framework (2026-04-29, commit `a747b646`, PM2 #115)

Observation-only framework parallel to B67.0. Records what 12 BE-stop / trailing-stop variants WOULD have done on every closed VTS trade. No exit-behavior changes; zero contamination with B67 calibration window.

**New components:**
- `server/services/exit-strategy-replay.ts` — 12 variant evaluators (BE A-F, Trail G-J, Combined K-L) with simplified trailing state machine (peak + level + ATR multiplier)
- `server/services/exit-strategy-replay-service.ts` — orchestrator: 1-min OHLC fetch via `ohlcCache.getOHLCData(symbol, 1, since)` (bypasses cache via since-param), bulk-insert into `exit_strategy_alternates`, error-swallowing `[B73][exit-replay]` logging
- `exit_strategy_alternates` table (parallel to `regime_factor_alternates`) — 12 rows per closed trade, indexed on (variant_id, created_at) and (regime, variant_id)
- 13 module_constants in new `exit_strategy_replay` module: variant params (snapshot baselines + variant-specific overrides) + global config (max_hold_ms=7d, ohlc_buffer=1h, min_n_total=200, min_n_per_regime=50, replay_enabled flag)

**Hook point (single — VTS only):**
- `server/services/vts-service.ts:persistRealPriceTrade` — async fire-and-forget `void import('./exit-strategy-replay-service').then(...)`. Trade-close path never blocked. ATR approximation `Math.abs(target - entry) / 1.5` (target_lock_r proxy) used for variant thresholds; consistent across all 12 so relative comparisons remain valid even if absolute thresholds drift.

**Paper-execution-engine intentionally NOT hooked** (Kyle directive 2026-04-29). Active trading is OFF; B73 is research-mode for multi-week observation. If active trading reactivates BEFORE B73 conclusion, the paper hook is a 5-line addition at that point. B67-style symmetry: neither framework needs a paper-execution-engine hook today.

**Variant A baseline isolation (Langston cc-inbox #862):** Variant A reads from `b73_baseline_be_trigger_r=1.0` and `b73_baseline_trail_distance_atr=1.0` snapshot constants — NOT live `trailing_exit` keys. This insulates the multi-week observation from TEC tuning that would otherwise drift the baseline mid-window and invalidate paired-diff Sharpe calculations.

**Selection criterion (pre-registered in scope):** `(mean_pnl_variant - mean_pnl_baseline) / std(pnl_variant - pnl_baseline) × sqrt(n)` per Langston cc-inbox #858. Penalizes variance, rewards consistency. n=200 total minimum for headline winner; n=50 per regime for regime-specific recommendations.

**B73 cross-references "If I Change X, Check Y":**
- **Edit a variant evaluator in exit-strategy-replay.ts** → unit tests pending tomorrow follow-up; verify variant produces correct VirtualExit on synthetic OHLC scenarios
- **Edit a `b73_baseline_*` constant** → DOES NOT take effect for already-replayed trades (each trade replays once). Affects new replays going forward. Document the change date for cohort partitioning during analysis.
- **Edit a `trailing_exit` constant (live TEC)** → does NOT affect Variant A in B73 (snapshot isolation). The actual trade behavior changes; ablation observation continues with the snapshot baseline reference. Note the TEC change in MEMORY/CHANGES so analysis can partition pre/post.
- **Add a new variant** → assign next letter (M, N, ...), implement evaluator, add to `replayAllVariants()`, add module_constants for params, add VARIANT_NAMES entry. No schema migration needed (variant_id is varchar).
- **Tomorrow's follow-up commits** (paper-execution-engine hook intentionally skipped):
  - API endpoint `GET /api/analytics/exit-strategy-ablation` for variant aggregations
  - UI panel "Exit Strategy Ablation" in machine-learning page (sortable by Sharpe, per-regime filter)
  - Unit tests for 12 variants + state machine

**Live evidence post-deploy:** `exit_strategy_alternates` table created cleanly with 13 module_constants seeded. PM2 #115 online. First VTS trade closure post-deploy will populate 12 rows. Verification SQL: `SELECT count(*), count(DISTINCT variant_id) FROM exit_strategy_alternates;`.

**Status**: B73 fully shipped same-day on PM2 #116:
- Data layer LIVE (commit `a747b646`)
- Governance pass complete (commit `778a1fe9`)
- API endpoint + UI panel LIVE (commit `a4bd0e6c`) — `GET /api/analytics/exit-strategy-ablation` and `ExitStrategyAblationSection` under Analytics → Drift Dashboard tab
- Unit tests passing (commits `49c711d2` + `f53b9d60`) — 12 variants + state machine + edge cases verified via CI run `25136181772`

**B73 Components added to SIM (full inventory):**

| # | Component | File | Status |
|---|---|---|---|
| 1 | Migration + table | `drizzle/migrations/2026-04-30-b73-exit-strategy-alternates.sql` | ✅ Applied to staging |
| 2 | Replay variant evaluators | `server/services/exit-strategy-replay.ts` | ✅ LIVE |
| 3 | Replay orchestrator | `server/services/exit-strategy-replay-service.ts` | ✅ LIVE |
| 4 | Aggregator | `server/services/exit-strategy-ablation-aggregator.ts` | ✅ LIVE (NEW since governance pass) |
| 5 | API endpoint | `server/routes.ts` (line ~7538 — sibling to ablation-comparison) | ✅ LIVE |
| 6 | UI panel | `client/src/pages/analytics.tsx:ExitStrategyAblationSection` | ✅ LIVE under drift tab |
| 7 | VTS trade-close hook | `server/services/vts-service.ts:persistRealPriceTrade` | ✅ LIVE |
| 8 | Module constants | 13 keys in `exit_strategy_replay` module | ✅ Seeded |
| 9 | Unit tests | `server/tests/unit/b73-exit-strategy-replay.test.ts` | ✅ CI passing |

Multi-week observation accumulates in parallel with B67.4 cheap-tier + calibration window.

### B73 addendum — F-NOW calibration-era tagging (B-XSTOCK-CALIB, 2026-06-01, commit `cdac422b9`, migration `2026-06-01-f-now-calibration-state.sql`)

Phase-24 plumbing so Phase 25 can exclude the **pre-calibration** xStock cohort from closed-outcome evaluation. **VTS-only** (Kyle 2026-06-01): tags `vts_open_trades` ONLY, not the active-paper path. No trading-behavior change. Active trading OFF throughout.

**New components / changes:**
- **`vts_open_trades.calibration_state`** TEXT NOT NULL DEFAULT `'pre_calibration_xstock_2026_05'` — fast-default back-stamps all existing rows; new trades auto-tag. **Upstream writers:** `insertOpenTrade` (named-col INSERT, default applies — no code change), weekend suspend/restore UPDATEs + `markOpenTradeClosed` + GC sweep (column-specific — unaffected). **Downstream readers:** `rehydrateOpenTrades` (named SELECT, does not read it), `resolveCalibrationState` (NEW — reads it). No `SELECT *` on the table anywhere (verified), so the new column is safe. CHECK constraint `vts_open_trades_state_consistency` is on different columns.
- **`exit_strategy_alternates.calibration_state`** TEXT nullable. **Sole writer** = `persistExits` (replay-service); **sole readers** = the 3 aggregator queries. No other writer/reader (replay-ablation.ts touches `regime_factor_alternates`, not this table). 17,184 existing xStock VTS rows backfilled in-migration (uniform tag; parents may be GC'd so no join). crypto rows left NULL (intended).
- **Writer linkage (buried):** `persistExits` resolves the parent's tag via `resolveCalibrationState(ctx.vtsOpenTradeId)` where `vtsOpenTradeId = originalSignalId = vts_open_trades.id` — NOT the exit-time-rebuilt `trade_id` (vts-service.ts:816). A `WHERE id=tradeId` would silently never match. Resolved once per close (not 12 sub-selects).
- **Aggregator OPT-IN exclusion** — `buildCalibrationClause(assetClass, excludePreCalibration)` fires ONLY on `(excludePreCalibration && xstock_spot)`. **DOWNSTREAM (the impact the v1 pre-audit MISSED):** the aggregator feeds TWO surfaces — `/api/analytics/exit-strategy-ablation` (assetClass=null) → Analytics Drift-Dashboard panel; and `/api/xstocks/exit-strategy-ablation` (xstock_spot) → the **xStocks-tab "Exit Strategy Ablation" panel** (`client/.../xstocks-tab.tsx:316` → `ExitStrategyAblationSection`). An unconditional xStock exclusion would have **emptied that live panel** (all 1,432 xStock trades are pre-cal). Kyle decision: keep the live panel; exclusion is opt-in default-off → both panels byte-identical to pre-F-NOW. **INERT until a Phase-25 caller passes `excludePreCalibration=true`** (scaffolding §9.1).
- **fail-open direction (Langston A3-2):** `IS DISTINCT FROM` keeps NULL/untagged rows INCLUDED; a `resolveCalibrationState` failure (DB error / missing parent / undefined id) writes NULL → row is included, not dropped. The Step-8 forward-path zero-NULL assertion is the detection net. **All `calibration_state` reads MUST stay asset-class-scoped** — crypto rows carry mixed NULL/tag noise; a future UNSCOPED `IS DISTINCT FROM` would silently fail-CLOSED and drop crypto.
- **flip stress-test note (Langston A3-3):** while every xStock parent shares the same default tag, a mis-linked-but-valid id still resolves to the same value — the `originalSignalId` linkage's precision only gets stress-tested at the actual Phase-25 calibration flip.

### B-CALSCORE — Calibration Scoreboard ledger (2026-06-02, commit `c6d73bb1d`, migration `2026-06-02-b-calscore-ledger.sql`)

NEW read-only display surface for the Phase-24 calibration arc; **additive — nothing existing modified except `client/src/pages/analytics.tsx` grid-cols-8→9**.
- **`calibration_ledger`** (NEW table): one row per calibrated setting at grain `(sub_batch, asset_class, setting_key, scope)` (UNIQUE idx). num/den are SSOT (NO stored pct — Langston C1.3); `planned_sub_batch` records who proposes the planned value (C1.1). Seeded 10 B.0 tunable rows (current side only; planned side NULL). **Writer:** the migration seed (idempotent `ON CONFLICT DO NOTHING`); future calibration sub-batches UPDATE the planned side via their own migrations (set `updated_at` explicitly). **Reader:** the endpoint only — no `SELECT *`, no production trade-path read. Pure display.
- **`GET /api/analytics/calibration-scoreboard?asset_class=`** (NEW endpoint, `server/routes.ts`): `authenticateToken` + direct `db.execute(sql)` read, ORDER BY sub_batch/setting_key/scope, returns raw num/den. pct DERIVED client-side via `shared/calscore-format.ts:fmtCalibrationResult` (Number()-coerces pg numeric/bigint string returns — C5; real 0-numerator → `0.00%`, missing/zero-den → em-dash).
- **Analytics "Calibration" tab** (`analytics.tsx:CalibrationScoreboardSection`): plain table, no selectors (static ledger). Tab id `calscore` (TabsTrigger + TabsContent value strings MATCH — Radix blank-tab guard, Langston C4); positioned after "Drift Dashboard". NO win/loss (Phase 25).
- **Blast radius:** additive. `activeTab` is local `useState`; nothing consumes the tab id; only shared edit = the grid-cols count. Staging-UI-verified (§9.3) + Langston Step-8 independent (DB 10/10, endpoint 200/count=10/num-den-match).
- **B-CALSCORE.b (2026-06-02, deploy `856936444`):** comprehensive re-seed → **64 rows / 8 categories** (B.1 regime / B.2 IMF / B.2 global gates / B.3 strategy gates / B.4-5 friction / B.6 TEC priors / B.7 sector / C macro; Phase-25 excluded). NEW `category` + `display_order` columns (migration `2026-06-02b-calscore-comprehensive.sql`, DELETE+reseed idempotent); endpoint adds both cols + `ORDER BY display_order`; UI groups by category (subheader rows). Analytics TabsList `grid-cols-9`→`flex flex-wrap h-auto` (wraps to 2 rows). Renames: Analytics tab → "xStock Calibration"; ML page tab `xstocks` → "xStocks Filter Diagnostics" (label only). 64/64 distinct grain (no silent drop), staging-UI-verified.

### B.2.UI — entry-liquidity field + "Volume / Order Book" column + Min Depth diagnostics (2026-06-02, commit `ae29735ec`, NO migration)

NEW per-VTS-trade observability field `entryLiquidityValue` (number) + `entryLiquidityKind` (`'depth_usd' | 'volume_qty'`), captured at trade-OPEN, displayed on BOTH Simulated Trades tables + the order-book-depth gate surfaced in xStocks Filter Diagnostics. **Additive, VTS-passive, display-only — no calibration/threshold/gate change. Rides `context` JSONB on `vts_open_trades` (no `ALTER TABLE`).**
- **Capture (open):** xStock — `eval-cycle.ts` registerOpenVtsTrade call sets `entryLiquidityValue=askDepthUsd` (≥0), `kind='depth_usd'`. Crypto — `vts-runner.ts` inline trade-open builder sets `entryLiquidityValue=priceData.volume24h`, `kind='volume_qty'`, class-guarded on `crypto_spot`.
- **5-site propagation chain** (same shape as the `ladderRungsHit` precedent above; missing any one silently degrades to "—" with NO tsc error because the persisted record is cast `as any`): (1) capture; (2) `vts-runner.OpenVirtualTrade` + `RegisterOpenVtsTradeInput` interfaces + `getOpenVirtualTradesForML` return-type + push (open feed `/api/vts/ml/open`); (3) `vts-runner` close-copy into `persistRealPriceTrade({...})`; (4) **`vts-service.persistRealPriceTrade` — param type + the explicit-field-map persisted `VirtualTrade` record (`?? null`) → `logTrade()` JSONL write** (load-bearing); (5) `export-csv.getClosedVTSTradesFromLogs` return-type + whitelist (closed feed `/api/vts/ml/closed`).
- **Frontend** (`machine-learning.tsx`): `OpenTrade`/`ClosedTrade` interfaces gain both fields; module-scope `formatEntryLiquidity(value, kind)` (xStock → `$<rounded> · OB`, crypto → `<n> QTY`, else `—`); NEW "Volume / Order Book" `<th>`+`<td>` after TEC State on both tables; empty-state colSpan 26→27 (Open) / 25→26 (Closed).
- **Diagnostics:** `failed_min_depth` (the `min_depth_usd` two-way gate counter from `global-filter.ts:139` + `pattern-filter.ts:228` — exact key, no rename) added to the 4 `routes.ts` builders (emptyGlobal/emptyPatternGlobal defaults + buildGlobalFromCounters/buildPatternGlobalFromCounters passthrough); `failed_min_depth → 'Min Depth'` label in `machine-learning.tsx:formatFilterName`. Tables iterate counter keys → last-scan + 24h auto-populate.
- **Blast radius:** LOW (display + additive passthrough; crypto + xStock both touched only at the per-class capture site). tsc 493=493 (0 net new); vitest failing-set identical before/after. §9.3 CC Chrome (both headers + both Min Depth rows) + Langston Step-8 data-layer (5 populated/234 null pre/post-deploy boundary, kind discrimination correct). Caveat: pre-deploy trades render "—" (no backfill); closed non-null populates as a fresh open closes.

## B70 — Unified Data Archive Pipeline (2026-05-04 → 2026-05-05, commits `516140bc` → `3796ae56`, PM2 #142 → #145)

5 partitioned archive tables capturing per-pair scan-state, signal evaluations, exit decisions, macro feed snapshots, plus a one-shot B62 retroactive-labels table. Mode-agnostic capture per Kyle directive 2026-05-04 (scope §M): every row carries `mode` (system-state from `getCurrentMode()` accessor) + `source` (per-hook origin, hardcoded). When system flips VTS → paper-sim → live, archive capture continues with no code change.

### B70 components inventory

| # | Component | Path | Status |
|---|---|---|---|
| 1 | Run-mode controller (sync getCurrentMode + 5s cache) | `server/services/run-mode-controller.ts` | ✅ LIVE |
| 2 | Archive batch writer (5s flush, 2-slot semaphore, 50k bounded queue, drop-OLDEST) | `server/services/data-archive/archive-batch-writer.ts` | ✅ LIVE |
| 3 | Archive config cache (60s refresh of 11 module_constants) | `server/services/data-archive/archive-config.ts` | ✅ LIVE |
| 4 | Macro feed archiver (hooked into external-macro-feed pollCycle, 60s) | `server/services/data-archive/macro-feed-archiver.ts` | ✅ LIVE — 17+ rows accumulating |
| 5 | Pair scan archiver (MCE setImmediate hook, ~255k/day) | `server/services/data-archive/pair-scan-archiver.ts` | ✅ LIVE — 196 rows in first 10min |
| 6 | Signal eval archiver (admitted-only in v1; reject_stage hooks → B70.1) | `server/services/data-archive/signal-eval-archiver.ts` | ✅ LIVE — admitted path. **⚠️ DECISION-PROVENANCE GAP (RUNNING_ISSUES #206, 2026-06-06):** `features` JSONB stores only SCORING metadata (hybridScore/predictiveConfidence/regimeWeight/macroModifier/patternType/sourcePool), NOT the engine's DETECTION inputs (the `ohlcData` array — settled + forming bar — or the resolved `module_constants`). So a row cannot be backward-replayed through the real detect fns to ≥99% parity (B.5 W2.0b proved this: vwap_pullback maxed 80%; the irreducible residual is the in-progress forming bar, never persisted). Third study to hit this (W2.0a Mode-A, RI-a stop-anchor, W2.0b). **FIX SHIPPED = B-NEW-53 (DEPLOYED staging 2026-06-07 commit `b1dbb2c43`, CI green, Langston Step-4+Step-8 PASS; roadmap 19-20).** xStock at launch; **crypto_spot ENABLED 2026-06-07 (Kyle directive, commit `0350cbc69`) — BOTH spot classes now capturing** (per-class flag `b_new_53_provenance_capture_enabled`; crypto hooks are the 3 in `vts-runner.ts` admitted/reject/net-EV via the shared `buildBarProvenance`; surfaced latent bug RUNNING_ISSUES #207 = B70.2 admitted-`features` hollow economics, fix = B-NEW-53.1 fast-follow). NEW components: (1) **`signal_eval_provenance`** — 1:1 sibling of `signal_eval_archive` keyed `(captured_at, archive_id)` (partitioned, 90d retention co-aligned), stores the forming bar BY VALUE + a settled-bar-set reference (settled bars already in `xstock_spot_ohlc_15m_snapshot` → referenced not duplicated) + the resolved stop/target LEVELS (RI-a checksum, unified — one layer); (2) **`module_constants_version`** — hash→resolved-constant-set store, upsert-on-novel; (3) **`server/services/data-archive/archive-id-allocator.ts`** — amortized block id from `signal_eval_archive_id_seq` (no hot-path DB round-trip; BLOCK_SIZE 3000 so a scan cycle never drains mid-cycle — Langston); (4) **`server/services/data-archive/decision-provenance.ts`** — re-resolve+hash constants + version recorder. WRITER: `archiveSignalEval` extended; the 4 xStock hooks are in **`server/asset_classes/xstock_spot/eval-cycle.ts`** (NOT vts-runner = the crypto path). The base archive row is never lost (batch-writer emits SQL `DEFAULT` for a missing app-id). CONSUMER (Phase-25): the W2.0b detect-replay harness reads provenance for exact replay; coverage% is reported SEPARATELY from parity% (independent drop-oldest buffers can desync — Langston C1). Also registered with b70-create-monthly-partitions / b70-retention-sweep (90d) / b70-table-export / drift-dashboard-aggregator. Runtime proof pending tonight's xStock reopen (alert `B-NEW-53 runtime proof`, 2026-06-08T01:30Z). **★ P19-B8.5b (2026-07-13, #206/#500/#498 — the B-NEW-53.3 defined exit, commit `3aab09d99`):** `signal_eval_provenance` gains 7 typed columns — `ind_vwap/ind_atr/ind_sma/ind_high24h/ind_low24h/ind_current_volume` (double precision) + `settled_window_hash` (text, versioned `swh1:` prefix; preimage = SETTLED bars only joined `;` — the prefix labels the OUTPUT, it is NOT hashed input) — the six decision-time scalars the 19-strategy read-surface enumeration proved the detect fns consume (avg-volume has ZERO scalar consumers → deliberately NOT persisted; CURRENT volume substituted) + the byte-parity oracle for array-fed reads. `buildBarProvenance` gains an optional 4th `indicators` param (backward-compatible); enqueue maps honest-NULL. Feed sites: `vts-runner.ts` provenance hook (from `stratDetectIndicators` = the SAME object the strategies read) + `eval-cycle.ts` `_provBase` (from `mceContext.indicators`). ALSO in B8.5b: kernel DI de-proxied BOTH lanes (`ScanBatchPair.di` carry + xstock `laneRealDi` hoist; proxy DELETED per DELETED_COMPONENTS_LOG 2026-07-13; SysManual DI section carries the two-formulas #502 flag) + both RTB refresh sqeInputs feed `sourcePool` (#498's sourcePool leg; regimeStability leg documented-deferred to its honest-source rewire, 25-4 rider). Consumer: the #501 backtest-baseline harness reads the typed columns directly. **★ P19-B8.5c (2026-07-14, #503):** the two STANDALONE VTS `computeNetExpectancyKernel` calls are DELETED (fraction-as-dollars friction units bug — DELETED_COMPONENTS_LOG 2026-07-14); the archived EV fields this row's family carries (`expectedEdge`, `netRewardToRisk`, reject-row `takerNetEv`, crypto attached `signal.netEV`) now source from the shared `decideMakerTaker` taker leg / `chosenNetEV` — the lane's SINGLE kernel site — and are honest price-unit dollars. THREE-REGIME COHORT on these fields: (a) pre-2026-07-01/03 mis-scaled-selected+recorded; (b) →2026-07-14 honest-gate/mis-scaled-recorded; (c) post honest both (FIX-2026-07-14-A). |
| 7 | Exit decision archiver (vts-runner exit-loop + paper-execution-engine.closePosition) | `server/services/data-archive/exit-decision-archiver.ts` | ✅ LIVE — pending first close event |
| 8 | Bootstrap (LAST in startup after B74) | `server/startup/data-archive-bootstrap.ts` | ✅ LIVE |
| 9 | Migration + rollback | `drizzle/migrations/2026-05-05-b70-data-archive-tables*.sql` | ✅ Applied |
| 10 | 5 tables + 48 monthly partitions | `pair_scan_archive`, `signal_eval_archive`, `exit_decision_archive`, `macro_feed_archive`, `b62_retroactive_labels` | ✅ LIVE |
| 11 | 11 module_constants in `data_archive` module | b70_*_capture_enabled × 4 + parquet/partition/retention/queue knobs + signal_eval kill-switch | ✅ Seeded |
| 12 | ~~Retention sweep cron (02:00 UTC daily)~~ | ~~`server/scripts/b70-retention-sweep.ts`~~ | **🗑 DELETED B-STORAGE-HARDEN Wave C (2026-07-08).** The DROP-only sweep violated the never-drop directive (#430 V1). The 5 B70 tables now tier **hot→warm→cold move-not-delete** via the B75 sweep (`b75-retention-sweep.ts` `B70_TABLES` inventory, cron `15 2 * * *`) + `b75-cold-rotator` — retention ownership consolidated onto ONE sweep. Per-table `data_lifecycle.<table>.hot_retention_days=90`. `b70_postgres_retention_days` now informational-only (Drift Dashboard display). See DELETED_COMPONENTS_LOG + SYSTEM_MANUAL "Retention + partition crons". |
| 13 | Partition creator cron (28th 02:30 UTC) | `server/scripts/b70-create-monthly-partitions.ts` + crontab | ✅ Installed |
| 14 | Drift Dashboard data-archive-status aggregator | `drift-dashboard-aggregator.ts:computeDataArchiveStatus` | ✅ LIVE |
| 15 | API endpoint | `GET /api/analytics/data-archive-status` | ✅ LIVE |
| 16 | UI panel | `client/src/pages/analytics.tsx:DataArchiveSection` | ✅ LIVE |
| 17 | **Switch-on evidence sink (B-EVIDENCE-SINK, 2026-07-14)** — durable tiered store for the 3 B8.5 switch-on behavioral proofs (FINALSCORE_SHADOW / EV_REJECT open-stage backstop / maker-taker pick+haircut), so they survive the weeks-long paper-validation window instead of aging out of the now-rotating stdout (#499 companion). | `server/services/data-archive/switch-on-evidence-sink.ts` (helper `registerSwitchOnEvidenceSink` + `emitSqeShadow`/`emitEvReject`/`emitMakerTaker`, each fire-and-forget through `enqueueArchiveRow` inside an internal try/catch that degrades, never throws into the decision) → table `switch_on_shadow_evidence` (partitioned `(captured_at, evidence_id)`, `proof_type` discriminator, 22 superset-nullable-by-type cols, 13 monthly partitions, `data_lifecycle.switch_on_shadow_evidence.hot_retention_days=90`, tiered via b75 `B70_TABLES` + b70 `PARTITIONED_TABLES` self-heal). Emit sites: `signal_quality_evaluator.ts` (SQE FINALSCORE_SHADOW, async+sync), `active-execution-engine.ts` (11.8B open-stage EV_BLOCK), `signal-orchestrator.ts` (`decideMakerTaker` snapshot; `maker-taker-decision.ts` now exposes the APPLIED `makerFillProbability`+`signalStrength`). Registered in `data-archive-bootstrap.ts` after the exit-decision archiver. **⚠️ §9.1: sink DEPLOYED+WIRED, 0 rows pre-flip (correct) — proof rows only accrue at the B8.5 switch-on (emitters on the active path).** | ✅ LIVE — 0 rows (pre-flip) |

### B70 hot-path hooks (all try/catch wrapped, never block host paths)

- `market-context-engine.ts:computeContext()` → `setImmediate` → `archivePairScan(...)` (mode='vts'/'paper_sim'/'live', source='mce-cycle')
- `vts-runner.ts:emit-ablation site (~L1726)` → `archiveSignalEval({rejectStage: 'admitted', ...})` (source='vts-runner')
- `vts-runner.ts:exit-loop (~L2161)` → `archiveExitDecision(...)` (source='vts-runner')
- `paper-execution-engine.ts:closePosition (~L1133)` → `archiveExitDecision(...)` (source='paper-execution-engine')
- `signal-orchestrator.ts:emit-ablation site (~L975)` → `archiveSignalEval({rejectStage: 'admitted', ...})` (source='signal-orchestrator', dormant until live trading activates)
- `external-macro-feed.ts:pollCycle (~L413)` → `archiveMacroSnapshot(...)` (source='coingecko-global')

### B70.2 (2026-05-05) — gap-fill + storage display + regime archive deprecation

- `exit_decision_archive.state_snapshot` JSONB expanded from 6 fields to 30+, mirroring every column in the closed-trades CSV export.
- `signal_eval_archive` admitted-row `features` JSONB expanded similarly, mirroring open-trades CSV. **⚠️ B-NEW-53.1 (2026-06-08, RUNNING_ISSUES #207):** on the CRYPTO path (`vts-runner.ts`) this expansion read 13 of those fields off the lean `tradeRecord` (`Phase10TradeRecord`) which never carried them → archived `undefined` (the documented behavior here was never actually realized on crypto admitted rows, 2026-05-05→2026-06-08). FIXED 2026-06-08 by repointing the 13 reads to the in-scope `persistedTrade` open-trade SSOT + declaring `expectedEdge?` on `OpenVirtualTrade`; this commit *realizes* the behavior described in this line. **Known-NULL window 2026-05-05→2026-06-08 — Phase-25 calibration queries MUST exclude it** (CHANGES_AND_FIXES). The xStock path (`eval-cycle.ts`) never had this at-entry block at all (scoring-metadata-only by design) → **REALIZED by B-NEW-53.2 (#208), deployed 2026-06-08 (commit `a6767cd75`):** a payload-hoist builds the open-trade record as a named const above the admitted archive hook, and the admitted `features` now mirror the crypto key set (+ `netRewardToRisk`); `expectedEdge` is the xStock kernel's price-space net-EV (units differ from crypto's score-space — NEVER pool cross-class; HCE partitions per `ac` in code). Provenance (`signal_eval_provenance`) is unaffected throughout.
- Drift Dashboard `DataArchiveSection` + `PassiveArchiveSection` now display per-table + total disk usage (B70=52.4MB / B74=5.12GB live).
- Regime archiver (legacy filesystem JSON, 136KB on disk) DEPRECATED — `archival-scheduler` bootstrap commented out. Reader endpoints retained for historical access. B70 supersedes via `pair_scan_archive` + `exit_decision_archive` + `regime_factor_alternates`.
- 4 silent-failure bugs caught + fixed (BUG-2026-05-05-A/B/C/D in CHANGES_AND_FIXES) — admit + exit hooks were non-functional from B70 deploy 2026-05-04 until 2026-05-05 12:24 UTC fix series.

### B70.3 (2026-05-05) — Path B momentum gate swap + liquidity_trap exclusion

- **Path B regime classification gate swapped:** in `market-regime.ts:209-210`, `(absDbs >= 0.30 && dbsSlope >= b68_5DbsSlopeMin)` → `(absDbs >= 0.30 && mom > b68_5PathBMomentumMin)` (new module_constant default 0.002). 7-day calibration showed -2.0pp predictive lift on the old slope gate; momentum is forward-looking + temporally coherent.
- **Updates SIM §5.1 `calculatePairRegime`:** the upstream `mom` reading is now consumed by Path B in addition to Path A. Counterfactual builder (`buildB68_5Alternate`) updated to disable momentum gate.
- **liquidity_trap iteration exclusion:** new `UNIVERSALLY_DISABLED_STRATEGIES` Set in `vts-runner.ts` skips at top of strategy iteration loop. Same in `signal-orchestrator.ts` (active-path block removed). Eliminates ~7,342 wasted evaluations/24h. Strategy DEFINITION retained.
- Updates SIM §4.1 + §7.1 — strategy iteration short-circuit before `detect()`.

### B70.3b (2026-05-05) — Post-composition floor drop for visibility

- `b67_5_post_composition_floor` module_constant: 0.45 → 0.20 via DB UPDATE. No code change.
- Updates SIM §5.1 `calculatePairRegime` terminal clamp behavior (floor at 0.20 instead of 0.45 until B67.5 lands and re-tunes based on real distribution data).
- Pure visibility — no consumer reads `regimeConfidenceModulated` until B67.5.

**B-NEW-37 update (2026-05-15/16) — modulation chain currently INVERSION-PRONE at top decile.** Per B-NEW-36 + B-NEW-37 forensic findings, the 0.20 floor (this entry) interacts with b68_5 Path-B sustainability gate's uniform -0.40 confidence haircut to produce a measurable inversion: trades with the highest `real_decision.confidence` (post-modulation) have the LOWEST realized win rate (decile 10 WR = 11%, decile 1 floor-pinned WR = 48%). 15.4% of trades are pinned at 0.200. **B67.5 consumer-gate design BLOCKED until B-NEW-39 reverts the floor + recalibrates b68_5 magnitude.** SIM consumers of `regimeConfidenceModulated` must read this entry before designing any gate that depends on the modulated chain output.

### B70 known limitations / deferred to B70.1

- ~~Reject-stage signal_eval capture (`pre_filter`/`sqe`/`rtb`/`tcl`)~~ — **active-path capture LANDED in P19-B5a (2026-06-16)**, see the B5a sub-entry below. (VTS-path reject capture already existed via `vts-runner.ts`.) **Still deferred:** active-path `strategy_internal` (orchestrator strategy-detect-null) — not in B5a scope. RUNNING_ISSUES #56.
- ~~B62 retroactive labels runner~~ — table created, runner script deferred. RUNNING_ISSUES #57.
- ~~Parquet exporter~~ — off-by-default toggle in place; script deferred. RUNNING_ISSUES #58.
- ~~Unit tests~~ — live integration verified; synthetic-event tests deferred. RUNNING_ISSUES #59.

### B70 forward-couples

- **Trend Mining Engine (Phase 17.6 / 18.5, post-launch)** — consumes `pair_scan_archive` + `signal_eval_archive` + `exit_decision_archive` joined to B74 OHLC by timestamp. JSONB schema_version field allows feature evolution without retroactive migration.
- **B67.5 consumer wiring (gated on calibration check ~2026-05-15)** — when active trading turns on, the signal-orchestrator's existing admitted-path archive hook fires automatically with `mode='live'`.
- **Phase 19 paper-sim activation** — `paper-execution-engine.closePosition` hook fires automatically with `mode='paper_sim'`. No code change.

### P19-B5a (2026-06-16, commit `1e119531a`) — active-path reject/admit data-capture hooks

Adds the active-pipeline reject/admit rows to `signal_eval_archive` (telemetry-only, fire-and-forget, **dormant until paper-active turns on** — live-verified zero rows while in VTS/passive). ZERO migration (the `reject_stage` enum + nullable `final_score`/`confidence_modulated` already existed).

- **New `SignalEvalSource` values:** `'market-scanner'`, `'fx5-scanner'` (pre_filter scanner sources), `'ready-to-buy'` (RTB reject source). Existing `'signal-orchestrator'` / `'paper-execution-engine'` reused for the sqe / tcl+admit hooks.
- **New centralized helper** `capturePreFilterReject()` in `signal-eval-archiver.ts` — the one place the pre_filter row shape lives (rejectStage='pre_filter', scores null, strategy defaults `'none'` / family name for family-IMF rows, label+detail in `gate_decision`).
- **Capture sites by stage:**
  - `pre_filter` — `market-scanner.ts` global filters (low_volume / low_price / wide_spread; pattern_low_price / pattern_high_price / pattern_low_volume / pattern_wide_spread) gated `if(!isPassiveLearning)`; `fx5-scanner.ts` family IMF (family_imf_lq/_vn/_di, `strategy`=family) + pattern-pool drop (pattern_imf) gated `if(isEngineActive)`. The gate reuses the existing canonical `isEngineActive` SoT (no new boolean).
  - `sqe` — `signal-orchestrator.ts` `!sqeResult.passed` chokepoint; captures the failing `final_score`.
  - `rtb` — `ready_to_buy_service.ts` `reEvaluateQueue` confidence-drop; captures `confidence_modulated` (the value tested at the drop).
  - `tcl` — `paper-execution-engine.ts` `duplicate_position` guard ONLY. **`max_open_trades` is a cycle-level promotion DEFER (signals stay queued), NOT a per-signal reject — deliberately NOT captured** (capturing it would be semantically-false telemetry).
  - `admitted` — `paper-execution-engine.ts` terminal open (position actually opened).
- **⚠️ DOUBLE-COUNT RULE (consumers MUST heed):** `reject_stage='admitted'` now appears at **TWO milestones**, disambiguated by `source`: `signal-orchestrator` (SQE-pass → queued) and `paper-execution-engine` (position actually opened). **Do NOT `SUM`/`COUNT` admitted rows without `GROUP BY source`** — orchestrator-admit minus paper-engine-admit = the queue→open leakage (RTB drops + TCL dups). Un-grouped, every opened position counts 2×.
- **Score-recovery by join:** `tcl` rows carry `confidence_modulated` but null `final_score` (finalScore isn't threaded to the paper engine). The failing/passing score is recoverable by joining to the upstream `sqe`/`admitted` row on `(symbol, mode, captured_at)` — all four key columns (`id`, `symbol`, `mode`, `captured_at`) confirmed present.
- **System Manual:** intentionally NOT updated — B5a is pure observe-only instrumentation with zero change to signal selection / regime / strategy math / pipeline control flow; the reject taxonomy is component/state metadata (SIM's lane).

---

### P19-B5b (2026-06-16, commit `c9f2e8285`) — #94 xStock decision-time macro snapshot

Every xStock decision record in `signal_eval_archive` now carries a `features.macro` object — the equity-macro backdrop AT decision time, captured for Phase-25 item 25-7 (the macro-modifier build; **capture-only**, the modifier itself stays Phase-25). **NOT DORMANT** — rides the xStock eval-cycle `archiveSignalEval` writes (`server/asset_classes/xstock_spot/eval-cycle.ts`, all 4 sites: strategy_internal / sqe / tcl / admitted), which fire every cycle in the VTS/passive path, so it began writing on merge (live-verified: vixZ + ageSeconds + raw vix populated on post-deploy xStock rows).
- **Field set:** `{ vixZ, dxyZ, vix, dxy, ageSeconds, partialFeed, vixObservedAt, dxyEcbDate }` — z-scores AND raw values (raw = baseline-independent ground truth; z depends on the rolling baseline 25-7 may recompute). Freshness via `ageSeconds` (`Infinity`/never-polled → explicit null) + per-source stamps. `partialFeed` disambiguates degraded-feed from below-min-obs. Straight-copy null-preserving (explicit `null` ≠ `0`).
- **Source:** `getLatestEquitySnapshot()` (`server/services/amr-equity-feed.ts`, sync in-mem, no DB/fetch) via the NEW `server/asset_classes/xstock_spot/macro-snapshot.ts` `buildMacroSnapshot()` helper (extracted for unit-testability; **xStock-only** — crypto records get no macro). **ZERO migration** (`features` JSONB).
- **Distinct from** the admitted block's existing `macroModifierValue` (the AMR class-level modifier scalar) — different key, different concept.
- **System Manual N/A** (telemetry enrichment; no signal/regime/strategy/pipeline-control change).

---

## B74 — Passive OHLC + Ticker Archive Pipeline (2026-04-30, commits `ce4a7e40` → `bd60add3` → `778cd4ed`, PM2 #119 → #122)

Continuous 1-min OHLC + per-update ticker snapshots captured to month-partitioned dump tables across three asset universes via persistent WebSocket connections. NO signal-pipeline integration; substrate accumulation only. Verified non-impact on FX5 / VTS / signal-orchestrator / B73 hooks per pre-audit §A.3.

### B74 components inventory

| # | Component | Path | Status |
|---|---|---|---|
| 1 | Equity-spot archiver (xStocks via WS v2) | `server/services/passive-archive/equity-spot-archiver.ts` | ✅ LIVE — 38 syms, 161 OHLC + 1,418 ticker rows in first 6min |
| 2 | Equity-perp archiver (PF_*XUSD via Kraken Futures WS) | `server/services/passive-archive/equity-perp-archiver.ts` | ✅ LIVE — 10 syms, 1,478 ticker; **OHLC at 0 rows pending RUNNING_ISSUES #41 (feed name)** |
| 3 | Crypto-spot archiver (USD/USDT/USDC ≥ $10k vol via WS v2, hash-mod sharding) | `server/services/passive-archive/crypto-spot-archiver.ts` | ✅ LIVE — 380 pairs in 2 shards (180/201 post-Murmur3 fix) |
| 4 | OHLC batch writer (5s flush, 2-slot semaphore) | `server/services/passive-archive/ohlc-batch-writer.ts` | ✅ LIVE |
| 5 | Ticker batch writer (5s flush, 1s/sym throttle) | `server/services/passive-archive/ticker-batch-writer.ts` | ✅ LIVE |
| 6 | Reconnect policy (exp backoff, 30s cap) | `server/services/passive-archive/reconnect-policy.ts` | ✅ LIVE |
| 7 | Universe loader (static equity, dynamic crypto) | `server/services/passive-archive/universe-loader.ts` | ✅ LIVE |
| 8 | Bootstrap (LAST in startup, partition self-heal) | `server/startup/passive-archive-bootstrap.ts` | ✅ LIVE |
| 9 | Symbol canonicalizer extension (`PF_*XUSD` → `<TICKER>/USD:PERP`) | `server/services/utils/symbol-canonicalizer.ts` (modified) | ✅ LIVE |
| 10 | Migration + rollback | `drizzle/migrations/2026-05-01-b74-passive-archive-tables*.sql` | ✅ Applied |
| 11 | 6 partitioned tables + 72 monthly partitions | `equity_spot_ohlc_1m`, `equity_perp_ohlc_1m`, `crypto_spot_ohlc_1m`, `equity_spot_ticker_snap`, `equity_perp_ticker_snap`, `crypto_spot_ticker_snap` | ✅ LIVE; current-month partition self-heal added post-deploy |
| 12 | 7 module_constants in `passive_archive` module | `b74_*_capture_enabled` × 3 + `b74_crypto_min_volume_24h_usd` + `b74_ws_reconnect_max_backoff_sec` + `b74_ticker_snapshot_min_interval_ms` + `b74_partition_lookhead_months` | ✅ Seeded |
| 13 | Universe-refresh cron (03:00 UTC daily) | `server/scripts/b74-refresh-universe.ts` + root crontab line | ✅ LIVE |
| 14 | Partition-creation cron (28th 02:00 UTC) | `server/scripts/b74-create-monthly-partitions.ts` + root crontab line | ✅ LIVE |
| 15 | Static universe configs | `server/config/{xstocks,equity-perp}-universe.json` + `crypto-universe-filter.json` | ✅ LIVE |
| 16 | Unit tests | `server/tests/unit/b74-symbol-canonicalizer-perp.test.ts` + `b74-universe-loader.test.ts` | ✅ CI passing |

### B74 forward-couples

- **B70 archival contract** — all 6 tables month-partitioned, no FK constraints, self-describing rows with `metadata.schema_version=1`. B70 will define hot/warm/cold tiering when it ships.
- **B68.1 multi-timeframe** — crypto_spot_ohlc_1m provides the 1-min crypto substrate B68.1 needs. B68.1 owns the signal-pipeline integration when it lands.
- **Phase 21.5 equity expansion** — 3 equity tables (spot OHLC, spot ticker, perp ticker) provide weeks-to-months of historical context when Phase 21.5 begins designing the equity strategy/admission logic.

### B74 known limitations (post-B74.1, RESOLVED)

- ~~xStocks universe currently 38 of 128.~~ **B74.1: expanded to 245 via WS-subscription probe.**
- ~~Equity perp OHLC at 0 rows.~~ **B74.1 RESOLVED:** Kraken Futures WS has no candle feed; switched to REST polling at `/api/charts/v1/trade/<sym>/1m` every 60s with per-symbol dedup.
- ~~NOT yet on UI surface.~~ **B74.1: PassiveArchiveSection UI panel rendered under Analytics → Drift Dashboard tab.**

### B74.1 added components (2026-04-30, commits `b8eba807` + `b9c4ebbb`)

| # | Component | Path | Status |
|---|---|---|---|
| 17 | Equity-perp REST polling | `equity-perp-archiver.ts` (rewritten) | ✅ LIVE — 20,030 OHLC rows / 10 syms post-deploy |
| 18 | Stats getters per archiver | `getEquitySpotStats()` / `getEquityPerpStats()` / `getCryptoSpotStats()` exports | ✅ LIVE |
| 19 | Passive archive aggregator | `drift-dashboard-aggregator.ts:computePassiveArchiveStatus` | ✅ LIVE |
| 20 | API endpoint | `GET /api/analytics/passive-archive-status` | ✅ LIVE |
| 21 | UI panel | `client/src/pages/analytics.tsx:PassiveArchiveSection` | ✅ LIVE |
| 22 | Chunked batch insert (1000 rows) | `ohlc-batch-writer.ts` + `ticker-batch-writer.ts` | ✅ LIVE — fixes Postgres 65,535-param bind limit |
| 23 | Expanded xStocks universe (245 syms) | `server/config/xstocks-universe.json` | ✅ LIVE |

---

## B67/B68 Confidence Modulation Chain — full series CLOSED 2026-05-03

**The 7-modulator confidence chain is the canonical post-classifier confidence transformation:**

```
raw × macro × phase × freshness × outcome × volume_regime × pair_correlation
    × multi_tf_agreement → clamp [b67_5_post_composition_floor (0.45), 1.0]
```

Each modulator is a pure function over OHLC + state, emits an ablation row per signal evaluation, and is resolved from `module_constants` at the MCE refresh timer cadence. **Active trading is OFF** — chain is observational pre-B67.5 consumer wiring (gated on calibration check ~2026-05-15). Per-trade persist hook deferred to B67.5 (RUNNING_ISSUES #44 #45).

### Chain factor module inventory

| # | Modulator | File | Batch | Range | Cold-start factor |
|---|---|---|---|---|---|
| 1 | macro modifier | `server/core/metrics/macro-modifier.ts` | B67.1 | [`b67_1_modifier_min`, `b67_1_modifier_max`] | 1.0 (fallbackActive=true when baseline n<48) |
| 2 | phase preference | `regime-phase.ts` + `applyPhasePreference()` helper | B67.2 | strategy-phase weights blob | per (strategy, phase) lookup; UNKNOWN → 1.0 |
| 3 | freshness (regime age) | `server/core/metrics/regime-age-factor.ts` | B68.4 | [0.92, 1.05] | 1.0 (when ageMs undefined) |
| 4 | outcome feedback | `server/core/metrics/outcome-feedback-store.ts` | B67.4 | [0.85, 1.05] | 1.0 (sample_count<5) |
| 5 | volume regime | `server/core/metrics/volume-regime.ts` | B68.2 | [0.92, 1.05] | 1.0 (ohlc<30) |
| 6 | pair correlation | `server/core/metrics/pair-correlation.ts` | B68.3 | [0.95, 1.05] (boost-only) | 1.0 (pair OR BTC ohlc<30; BTC=XBT/USD universal reference) |
| 7 | multi-TF agreement | `server/core/metrics/multi-tf-agreement.ts` | **B68.1 (final)** | [0.92, 1.05] | 1.0 (higher-TF samples<30) |

### MCE 9-group config orchestrator

`server/services/market-context-engine.ts:refreshAllConfigs()` resolves 9 config groups in parallel:

1. macro_modifier (B67.1)
2. regime_phase (B67.2)
3. regime_classifier (B67.3.5 + B67.5-prep — TFS desat scales + post-composition floor)
4. outcome_feedback (B67.4)
5. regime_age (B68.4)
6. path_b_sustainability (B68.5 — gate on TFS Path B, not a chain modulator)
7. volume_regime (B68.2)
8. pair_correlation (B68.3)
9. multi_tf_agreement (B68.1 — added 2026-05-03)

**First-refresh** uses `Promise.all` with try/catch — hard-fail-on-startup with retry on next timer tick. **Subsequent refreshes** use per-group try/catch — keep-prior-on-failure (one group's missing module_constant doesn't take down the entire MCE refresh). B67.4 hotfix-#2 wrapper inherited unchanged across all subsequent additions.

### B68.1 specifics (2026-05-03, commit `cb861176`)

- **Higher-TF source**: Kraken native 240-min via `ohlcCache.getOHLCData(symbol, 240)` — new cache key `${symbol}_240`. NOT the B74 DB archive at runtime.
- **Higher-TF classifier reuse**: `calculatePairRegime(higherTfOhlc, 0, 0, 1.0, regimeConfig)` — Path A only (DBS=0, slope=0 in v1).
- **Three-state classification**: CONFIRMED (labels match) → 1.05 / COMPATIBLE (same family or ST-tolerant) → 1.00 / CONFLICTED (cross-family) → 0.95.
- **Family map**: LOCAL to `multi-tf-agreement.ts` (5 regimes → 4 families: directional={TFS,IE} / range={RBS} / volatile={HVU} / transition={ST, universally COMPATIBLE}). Canonical regime map (`canonical-regime-strategy-map.ts`) untouched.
- **Refinement D.1 (Langston cc-inbox #887)**: explicit `higher_tf_dbs_score: 0` and `higher_tf_dbs_slope: 0` in ablation metadata. Schema-stable for v2 4h DBS upgrade.

### Floor engagement observability (post-B67.5-prep, post-B68.1)

Worst-case 7-modulator compound `0.85⁴ × 0.92² × 0.95 ≈ 0.419` engages the new 0.45 floor in worst case. **Intentional + observational** — floor-binding is signal in itself, captured in ablation metadata (`confidence_with_factor` reflects clamp; `confidence_without_factor` shows pre-clamp). Closed Trades UI shows `conf 0.450` widely on recent post-B68.1 trades.

### What's next

**B67.5 consumer wiring** — gated on B67.4 calibration check ~2026-05-15. Wires confidence into 7 consumers + deletes legacy `RegimeWeight` code path + handles deferred RUNNING_ISSUES #44 (active-path orchestrator emit hook OHLC any-cast across all 7 chain factors) + #45 (active-path persist hook). When B67.5 lands, the chain transitions from observational to operational.

---

## B75 — Data Lifecycle / Tiered Storage (2026-05-06, commits `f4e6a73f6` → `1ee802fd3` → `23865757e`, PM2 #172 → #175)

Tiered hot/warm/cold storage architecture per Kyle directive 2026-05-06: "we don't ever drop data, especially not now when we're not sure what data is going to be valuable and when." **Move-not-delete at every tier boundary**; full-fidelity historical data preserved indefinitely at ~$0.001/GB-month cold-tier cost.

| Tier | Storage | Retention | Cost / GB-month |
|---|---|---|---|
| HOT | Supabase disk (live SQL) | 30d ticker / 365d OHLC / 14d ctx-bridge | ~$0.125 |
| WARM | Supabase Storage `dt-archive` (JSONL.gz) | 365d, then rotated to cold | ~$0.021 |
| COLD | Backblaze B2 `dt-archive-cold` (JSONL.gz, B2 native API bearer auth) | indefinite — never deleted | ~$0.006 |

**Originally drafted as B73**; renumbered to B75 in Step 2 pre-audit after grep found B73 was already shipped 2026-04-29 (Exit-Strategy Ablation Framework + B73.1/.2/.3 + 5 source files using `b73-` prefix).

### B75 components inventory

| # | Component | Path | Status |
|---|---|---|---|
| 1 | data_archive_manifest table (single source of truth, state machine `pending → uploaded → verified → active → migrating → migrated`, UNIQUE on `(source_table, partition_label, tier)`) | `drizzle/migrations/2026-05-06-b75-data-lifecycle.sql` | ✅ LIVE |
| 2 | data_lifecycle module_constants (18 rows: per-table hot retention + warm retention + bucket config + sweep tunables + format) | `module_constants.module_name='data_lifecycle'` | ✅ Seeded |
| 3 | database_monitor module (3 rows: `plan_cap_mb=204800` against 200 GB Supabase Pro cap, `warning_threshold_pct=0.65`, `critical_threshold_pct=0.80`) | `module_constants.module_name='database_monitor'` | ✅ Seeded |
| 4 | Storage client (Supabase Storage warm via fetch + REST; Backblaze B2 cold via native bearer-auth API; 23h auth-token cache; B2_BUCKET_ID env override; 40 MB single-call threshold → TUS resumable, 5 GB HARD_CAP; **B-NEW-47 STREAMING `uploadWarmFile`/`downloadWarmFile` (file-path, 6 MiB chunks, never buffers whole object)**; SHA-256 + SHA-1 helpers) | `server/services/data-archive/storage-client.ts` | ✅ LIVE |
| 5 | Partition exporter (REPEATABLE READ READ ONLY snapshot + **keyset-paginated** streaming export → /tmp gzip → streamed SHA-256 of file) | `server/services/data-archive/partition-exporter.ts` | ✅ LIVE |
| 5b | **B-NEW-47 slicing helpers** (pure: `decideSliceMode`/`enumerateUtcDays`/`dayLabel`/`deriveModeFromLabels` — whole-vs-sliced + resume invariant guard) | `server/services/data-archive/sweep-slicing.ts` | ✅ LIVE |
| 6 | B74 export-then-drop sweep — **CODE live since B75 but the CRON WAS NEVER INSTALLED until B-NEW-47** (RI #161). B-NEW-47 adds: adaptive per-day slicing (partitions ≥ `slice_threshold_hot_bytes` exported as N `YYYY-MM-DD` warm objects), streamed I/O both directions, DROP-only-after-every-distinct-date-verified gate, atomic drop+state-flip tx, failure→system-alert. Cron installed in ROOT crontab `15 2 * * *`. | `server/scripts/b75-retention-sweep.ts` | ✅ LIVE (cron installed B-NEW-47) |
| 7 | context_bridge_log export-then-TTL+VACUUM (cron 02:30 UTC, month-grouped export + DELETE rounded to month-start → tail VACUUM no-FULL) | `server/scripts/context-bridge-log-ttl.ts` | ✅ LIVE |
| 8 | Rehydrate CLI (`--table X --from D1 --to D2 --out PATH [--restore-cold]`; tstzrange overlap query; SHA-256 verify on download; warm + cold paths) | `server/scripts/b75-rehydrate.ts` | ✅ LIVE |
| 9 | Cold rotator (cron 03:00 UTC monthly 1st, full Phase-2 wiring: download warm → upload cold → verify by re-download checksum match → INSERT cold manifest row → UPDATE warm to migrated → deleteWarm; dry-run when `cold_rotator_dry_run=true` OR cold creds missing) | `server/scripts/b75-cold-rotator.ts` | ✅ **LIVE + ACTIVATED B-STORAGE-HARDEN Wave A** (dry-run off; `--limit`/`--warm-retention-days` flags; DONE-on-every-exit-path; INSERT `$2` param bug fixed — see #430/CHANGES FIX-2026-07-08-A) |
| 9b | **Cold-path liveness canary** (B-STORAGE-HARDEN OBJ-1; weekly `0 4 * * 1`; upload→download→verify→delete a tiny `_liveness/` object; critical §10.5 alert on failure — dead-key detector) | `server/scripts/b75-cold-liveness.ts` | ✅ LIVE (2026-07-08) |
| 9c | **Archival-health watchdog** (B-STORAGE-HARDEN OBJ-5; daily `0 5 * * *`; STALE/INCOMPLETE/FAILED cron detection off log mtime + DONE-line parse → §10.5 warning deduped per-cron-per-reason; b70 skipped while paused) | `server/scripts/b-storage-archival-health.ts` | ✅ LIVE (2026-07-08) |
| 10 | DatabaseMonitor parameterized (reads `database_monitor.*` constants; **alarm CRITICAL→NORMAL**: 88.7% / 10 GiB stale → 5.2% / 200 GB plan cap, verified PM2 #172 logs) | `server/services/database-monitor.ts` | ✅ LIVE |
| 11 | b70-b62-relabel-runner header guard ("BEFORE RE-RUNNING confirm partitions hot or rehydrate first" — Langston Step-2 F4 ask) | `server/scripts/b70-b62-relabel-runner.ts` | ✅ LIVE |
| 12 | Supabase Storage `dt-archive` bucket (private, service-role write) | provisioned via Storage REST POST /bucket | ✅ LIVE |
| 13 | Backblaze B2 `dt-archive-cold` bucket (us-east-005, private, encryption enabled, keep-all-versions) | Kyle action 2026-05-06 | ✅ LIVE |
| 14 | B2 cold-tier round-trip smoke test (60-byte upload + download + checksum verify + delete) | `server/scripts/b75-b2-smoke.ts` | ✅ PASS 2026-05-06 |

### B75 hot-path / cron impact

- **Cron entries** — CORRECTION (B-NEW-47, 2026-06-01): the schedule below was the *intended* design but, prior to B-NEW-47, the ONLY archive cron actually installed (in ROOT's crontab, not `/etc/cron.d/dawntrader`) was `b70-retention-sweep` (`0 2 * * *`) + `b70-create-monthly-partitions`. `b75-retention-sweep`, `context-bridge-log-ttl`, and `b75-cold-rotator` were NEVER scheduled. **B-NEW-47 installs `b75-retention-sweep` in ROOT crontab `15 2 * * *`.** `context-bridge-log-ttl` + `b75-cold-rotator` remain UNSCHEDULED (cold stays dry-run for 365 d; ctx-bridge is a separate small-table sweep — RI #169).
  - `15 2 * * *` — `b75-retention-sweep.ts` (B74 6 tables, adaptive slicing) — **installed B-NEW-47**
  - `30 2 * * *` — `context-bridge-log-ttl.ts` — NOT installed (deferred)
  - `0 3 1 * *` — `b75-cold-rotator.ts` — **★ INSTALLED + cold tier ACTIVATED B-STORAGE-HARDEN Wave A (2026-07-08)** — `cold_rotator_dry_run` flipped false; proven end-to-end by a bounded real rotation (`context_bridge_log/2026-01` → cold, rehydrate-verify checksum match, warm→migrated). Buffered `downloadWarm`/`uploadCold` path (not the streaming `*File` path) loads a single warm object into memory during rotation — bounded today by per-day warm slicing (largest ~503 MB « the 3.7 GB box); revisit if a single object nears RAM. New optional CLI flags `--limit N` / `--warm-retention-days D` (non-persistent) for bounded controlled rotation. Rotator now emits a terminal `DONE` line on EVERY exit path (empty/dry-run/rotation) so the health watchdog can distinguish "nothing to do" from "crashed".
- **★ B-STORAGE-HARDEN Wave A cron + component additions (2026-07-08):**
  - `0 4 * * 1` — `b75-cold-liveness.ts` (NEW) — weekly cold round-trip canary (upload→download→verify→delete a tiny `_liveness/` object) → critical §10.5 alert on failure. Standing dead-key detector for the B2 creds that sit unexercised ~10 mo between real rotations.
  - `0 5 * * *` — `b-storage-archival-health.ts` (NEW) — daily cron-silence + `failed>0` watchdog for the archive sweeps (STALE via log mtime>cadence+grace, INCOMPLETE if no DONE line, FAILED on a DONE `failed>0`) → §10.5 warning, deduped per-cron-per-reason. B70 skipped while its DROP cron is paused; re-added at OBJ-2.
  - The B70 DROP cron (`b70-retention-sweep.ts`) stays PAUSED (commented in root crontab) through OBJ-2 — no B70 analytics data dropped in the interim (RUNNING_ISSUES #430).
  - **★ `0 1 * * *` — `b74-create-daily-partitions.ts` (NEW, B-STORAGE-HARDEN Wave D)** — daily creator for the DAILY-partitioned `xstock_spot_ticker_snap` (14-day forward window, self-heal current day, skip pre-cutover). Installed in ROOT crontab 2026-07-08.

**★ B-STORAGE-HARDEN Wave D (OBJ-3, 2026-07-08) — `xstock_spot_ticker_snap` MONTHLY→DAILY partition transition.** The #1 hot consumer moves to DAILY RANGE partitions at a **2026-08-01 month-boundary cutover** so the hot window is reclaimable one day at a time (true rolling ~30 d vs whole-month). Transition-forward: July + earlier stay monthly and age out; the ~63 GB live table is NEVER repartitioned. New/changed components:
- **`server/services/data-archive/daily-partition-cutover.ts` (NEW)** — single-source registry: which tables are daily-partitioned + the UTC cutover date. Consumed by both creators so they never overlap.
- **`server/scripts/b74-create-daily-partitions.ts` (NEW, cron `0 1 * * *`)** — makes `…_YYYY_MM_DD` children for a 14-day forward window from the cutover; idempotent (`CREATE … IF NOT EXISTS` + pg_class probe); self-heals current day.
- **`server/scripts/b74-create-monthly-partitions.ts`** — now EXCLUDES daily-partitioned tables at/after cutover (`isDailyPartitionedForMonth`) so it can't create an overlapping monthly. (Also #438: added `import 'dotenv/config'` — this cron had been silently failing on a missing `DATABASE_URL`.)
- **`server/services/data-archive/sweep-slicing.ts`** — NEW pure `classifyPartition()` (daily `_YYYY_MM_DD` regex tested BEFORE monthly, both anchored + calendar guard) + `isPartitionEligible()` (daily `rangeEnd<=cutoff` rolling; monthly `rangeStart<cutoffMonthStart` legacy). `b75-retention-sweep.ts` `listOldPartitions` uses them, threading the day-granular cutoff. Golden-locked (18 tests) incl. an adversarial mixed-shape single-pass + a daily↔month-machinery convergence test.
- **`server/scripts/b-storage-archival-health.ts`** — NEW independent daily-partition forward-coverage check (alerts if runway < 4 days ahead, or none at/after cutover; connect-inside-try so a DB-down degrades to inconclusive-OK).
- **`server/scripts/b75-cold-rotator.ts`** — optional per-table warm-window knob `data_lifecycle.<table>.warm_retention_days` (empty default = byte-identical).
- Migration drops the empty pre-created future monthlies at/after cutover + seeds Aug 1–16 dailies. **OBJ-4** (capture cadence `b74_ticker_snapshot_min_interval_ms`, bootstrap-cached → restart to change): flipped + live-measured per-symbol RTH → **crew-consensus 4000 ms** (8000 degraded 61 genuine symbols past the 15 s freshness gate vs 4000's 10). Aggregation-safety confirmed (OHLC bars throttle-independent). Separate xStock OHLC-channel stall = #439.
- **Hot-path side-effects:** ZERO new hot-path consumers. Sweeps run as off-hours batch crons; DELETE/DROP doesn't block concurrent INSERT writers; VACUUM is plain (no-FULL) so no exclusive locks. `database-monitor.ts` runs once at startup + every 24h (existing cadence) and **as of B-STORAGE-HARDEN OBJ-5 emits a §10.5 alert (deduped per level) when logical size crosses the `database_monitor` warning/critical thresholds — previously it only `console.warn`'d, so disk growth was invisible to the alert queue**.

### B75 forward-couples

- **Trend Mining Engine (Phase 17.6 / 18.5, post-launch)** — consumes B74 OHLC tables (1m candles). Hot retention (365d) + manifest+warm rehydration covers any analytical window. Trend Mining Engine queries the manifest first to know what's available where; pulls from warm (or rehydrates from cold) for older periods. **Schema-stable** via `archive_schema_version=1` in manifest rows.
- **Future ML/analytics scheduler (post-launch)** — wraps `b75-rehydrate.ts` CLI. Manifest is the rehydration seam: scheduler queries `data_archive_manifest` for "what exists, where" without needing to know storage layout. Cold-tier rehydration is the slow path (B2 download is sec-latency, not min-latency).
- **B70 retention sweep** — UNCHANGED. Continues running on `b70_postgres_retention_days=90` global knob. Migration of B70 sweep into per-table `data_lifecycle.<table>.hot_retention_days` registry deferred to a future B75.x.

### B75 known limitations / deferred to B75.x

- ~~**Keyset pagination**~~ — RESOLVED (partition-exporter uses a keyset timestamp cursor; the LIMIT/OFFSET O(N²) concern is gone).
- ~~**Multipart/TUS upload**~~ — RESOLVED (TUS resumable + B-NEW-47 streaming `uploadWarmFile`; 40 MB single-call threshold, 5 GB cap, per-day slicing for partitions above `slice_threshold_hot_bytes` so no single object approaches the Supabase 5 GB project cap).
- **B-NEW-47 day-grain limit** (RI #170) — no sub-day fallback: a single day-slice whose compressed size exceeds the 5 GB cap would stall that partition (alerts nightly). Not reachable at current ~300–500 MB/day; documented boundary.
- **Phase 2 cold rotator UNFAILED RECOVERY** — if upload completes but warm-delete fails, next run sees cold row exists + skips correctly. But if upload completes + warm-row UPDATE to migrated completes + warm-delete fails, next run still skips (NOT EXISTS … tier='cold' filter). **Manual cleanup needed** in that edge case (delete warm bucket object). Logged for future automation.

### B75 cron timing (full schedule on Hetzner staging)

```
0  2 * * * deploy ... b70-retention-sweep.ts ...      (B70 archive tables, unchanged)
15 2 * * * deploy ... b75-retention-sweep.ts ...      (B74 export-then-drop)
30 2 * * * deploy ... context-bridge-log-ttl.ts ...   (export-then-TTL+VACUUM)
45 2 * * * deploy ... pg_dump data_archive_manifest ... (manifest backup, deferred install)
0  3 1 * * deploy ... b75-cold-rotator.ts ...         (monthly warm→cold)
```

### B75 hotfix history (within batch close window)

- **commit `b2f9f531a`** — storage-client adds `apikey` header alongside `Authorization: Bearer` for Supabase's new `sb_secret_*` API key format (rolled out mid-2025; new keys aren't JWTs and Storage API rejects them as "Invalid Compact JWS" if sent only as Bearer).
- **commit `1ee802fd3`** — sha256OfFile pipeline bug fix (was hanging in broken `pipeline(src, async function*)` pattern); warm-tier upload guard relaxed 45 → 500 MB; cold tier Phase 2 implemented (uploadCold/downloadCold/deleteCold via B2 native API); cold rotator real rotation logic; rehydrate `--restore-cold` path.
- **commit `23865757e`** — B2 accountId capture from authorize response (was hacky regex returning invalid value); B2_BUCKET_ID env override.

### "If I Change X, Check Y" — B75 additions

- **`data_lifecycle.<table>.hot_retention_days` UPDATE** → next 02:15/02:30 UTC sweep uses new value. Affects which partitions get exported. Lower → more archived per night; higher → less. Does NOT affect rows already archived.
- **`data_lifecycle.cold_rotator_dry_run` UPDATE** → flips cold rotator between dry-run (logs candidates only) and real rotation. Cold rotator runs monthly so flip takes effect on next 03:00 UTC on 1st.
- **`database_monitor.plan_cap_mb` UPDATE** → DatabaseMonitor next 24h tick re-computes alarm against new cap. Should ONLY change if Supabase plan changes (Free 0.5GB / Pro 200GB / Team 1TB / Enterprise unlimited).
- **Add a new periodic table to retention** → INSERT one row in `data_lifecycle` (e.g. `mytable.hot_retention_days=N`) + add table spec to `B74_TABLES` array in `b75-retention-sweep.ts` if partitioned, or fold into `context-bridge-log-ttl.ts` pattern if unpartitioned. Otherwise no code change.
- **Move to S3 instead of B2** → swap `storage-client.ts` `uploadCold`/`downloadCold` to use `@aws-sdk/client-s3`. Manifest URI scheme changes from `b2://` to `s3://`. `b75-rehydrate.ts` URI parser already prefix-aware; one-line fix there too. UPDATE `data_lifecycle.cold_provider='s3'` for human-readable tracking.


---

## Recent additions (B79.0a — Phase 24 — 2026-05-08)

**B79.0a turns the dormant xstock_spot scaffold (B79 ship) into a LIVE observability scanner.** Per scope §0, signal-orchestrator wiring is deferred to B79.x post-Layer-3 — Day 1 = scanner runs, reads xstock prices from `equity_spot_ticker_snap` (single batched query), tracks per-pair freshness, increments xstock TelemetryAggregator instance counters. Comprehensive component impact:

> **★ SUPERSEDED P19-B4a (2026-06-14):** the "no signal-orchestrator wiring" / "deferred to B79.x" statements below are NOW STALE for the active path — the xStock eval-cycle reaches the active orchestrator via `dispatchExternalSignal` + `xstock_spot/active-dispatch.ts` (C2), DORMANT until B7b. See "Recent Additions (P19-B4a)" at the end of this doc.

### `server/asset_classes/xstock_spot/scanner.ts` (NEW, B79.0a)

**Layer:** 3 (Scanner)
**Purpose:** Live xstock_spot scanner subscribed to `centralClock` (NOT a parallel `setInterval` — same tick-source pattern as `Fx5ScannerService`). Per-cycle batched DB read of `equity_spot_ticker_snap` (single round-trip, last 5min recency window to avoid 13-partition statement-timeout); per-pair freshness gate via `isPairDataFresh`; market-open gate (`isXstockMarketOpenUTC`) bypassable via hostile-sim flags.
**Upstream:** centralClock (tick trigger); `xstocks-universe.json` symbol set via `XSTOCK_SPOT_SYMBOLS`; `equity_spot_ticker_snap` (DB table written by equity-spot-archiver); `getXstockSpotInstances()` factory.
**Downstream:** xstock TelemetryAggregator instance counters (in-memory only Day 1 per design); `/api/diagnostics/xstock-scanner` reads via `getDiagnostics()`.
**Shared state:** `_isScanning` mutex flag; `_clockTickHandler`; `diag` object; `_hostileSimActive`. NO writes to crypto globals.
**Background execution:** every 30 ticks (30s) via centralClock subscription; HARD-FAIL boot via `start()` throw → `process.exit(1)` in `server/index.ts`.
**Blast radius:** **HIGH** — live signal-source for xstock_spot. Day 1 scope-limited to observability (no signal-orchestrator wiring). Future B79.x batches add signal-pipeline wiring after Layer-3 evidence. <!-- ★ P19-B4a: the orchestrator wiring now EXISTS via xstock_spot/active-dispatch.ts → dispatchExternalSignal, DORMANT until B7b. -->

**Hostile-sim flags (Langston Q5 + staging-override):** `BACKPRESSURE_TEST_MODE=1` + `HOSTILE_SIM_OVERRIDE=1` (the latter is required when `NODE_ENV=production` — staging escape; double-flag prevents accidental enablement). Documented in scanner.ts header.

### `server/utils/data-freshness.ts` (NEW, B79.0a)

**Layer:** 9 (Utility)
**Purpose:** Asset-class-aware data-freshness helper. `isPairDataFresh(symbol, assetClass, lastTickMs, now): Promise<boolean>`. Resolves window from `module_constants.market_data.<assetClass>.data_freshness_window_ms`; closed-market for `xstock_spot` returns `true` (Langston Q2 belt-and-suspenders); 60s in-process per-class cache.
**Upstream:** `module_constants` table; `isXstockMarketOpenUTC()` predicate.
**Downstream:** scanner cycle path; future signal-pipeline freshness gates.
**Shared state:** `_windowCache: Map<AssetClass, CachedWindow>` (60s TTL).
**Blast radius:** **LOW** (pure async function with cache).

### `server/services/adaptive-ratio-manager.ts` (MODIFIED, B79.0a)

**Layer:** 4 (Adaptive)
**Change:** Constructor extended to `(config?: Partial<RatioConfig>, telemetry?: TelemetryAggregatorService)` — back-compat (default-arg `telemetry=undefined` preserves crypto path). `computeAdaptiveRatio` line 93 prefers `this.telemetry ?? getTelemetryAggregator()`.
**Blast radius:** **MEDIUM** — affects pair selection bias on xstock path; crypto path unchanged.
**B79 caveat closed:** SIM line 1432-1433 documented `_xstockSpotInstances` Day-1 in-memory-only; that's now the runtime path with explicit per-class telemetry injection.

### `server/services/asset-class-instances.ts` (MODIFIED, B79.0a)

**Layer:** 9 (Bootstrap)
**Change:** `bootstrapXstockSpotInstances` now constructs ARM via `new AdaptiveRatioManager({}, telemetry)` injecting xstock telemetry instance. B79 caveat block at lines 94-101 closed.
**Blast radius:** **LOW** (factory-only).

### `server/services/central-clock.ts` (MODIFIED, B79.0a)

**Change:** `ClockTick` interface explicitly `export interface` (was implicit; needed by scanner type import).
**Blast radius:** **ZERO** at runtime (type-only export).

### `server/index.ts` (MODIFIED, B79.0a)

**Change:** Boot sequence: `primeTECConfig → loadTrailingStates → xstockSpotScanner.start() → server.listen`. HARD-FAIL on `start()` throw via `process.exit(1)`. Matches B79.TEC pattern exactly.
**Blast radius:** **HIGH** (boot path).

### `server/routes.ts` (MODIFIED, B79.0a)

**Change:** New `GET /api/diagnostics/xstock-scanner` endpoint (no-auth public, mirrors tec-bootstrap pattern — NOT central-clock which uses `authenticateToken`).
**Blast radius:** **LOW** (read-only diagnostic).

### `drizzle/migrations/2026-05-08-b79-0a-data-freshness-window.sql` (NEW)

`(market_data, *, xstock_spot, *, *, data_freshness_window_ms) = 90000`. Empirical: p99 inter-tick max 77s on low-liq country ETFs (6h sample of `equity_spot_ticker_snap` 2026-05-08). Assertion includes `value IS NOT NULL` guard (Langston rev 1 #2).

### `drizzle/migrations/2026-05-08-b79-0a-sqe-wildcard-promotion.sql` (NEW)

N2 cleanup: 2 `sqe_config` wildcard rows (`min_final_score=0.35`, `min_regime_weight=0.30`) promoted to explicit per-class for crypto_spot + xstock_spot. Wildcards preserved (B79.0b removes after 48h gate). Value-comparison assertion explicit in SQL (Langston rev 1 #3).

### `scripts/b79-0a-qd-probe.ts` (NEW)

One-shot AAPLx-vs-AAPL diagnostic (basis = xStock vs underlying via Yahoo). Probe set per Langston Q1 (mega-caps + NVDA/TSLA + BHC/ARCT). **KEPT (P19-B5c D10, rule 18):** retained as the on-demand BASIS spot-check tool — NOT superseded by the B5c continuous QUOTE-DEPTH probe below (a different signal). The continuous-Q-D follow-on (#86) SHIPPED in **P19-B5c** (next entry).

### `server/asset_classes/xstock_spot/qd-probe-service.ts` + `xstock-qd-probe-cron.ts` + `xstock_qd_probe_history` (NEW — P19-B5c, #86)

Continuous on-venue **friction-evidence** probe. Every ~5 min (`module_constants` `qd_probe.cadence_minutes`, must divide 60; cron `xstock_qd_probe_cron`, registered in the B-NEW-49 `cronRegistry` → smoke-test + fire-evidence covered), per active xStock symbol (`XSTOCK_SPOT_SYMBOLS`), reads the latest `xstock_spot_ticker_snap` via a per-symbol `(symbol,captured_at)`-indexed `LIMIT 1` seek (NOT a DISTINCT-ON-no-WHERE full scan — that timed out at 30s; P19-B5c Step-7), computes spread/depth/staleness (pure `qd-probe-metrics.ts`; A1 degenerate classification `ok|crossed|zero_bid|zero_ask|nonpositive_mid|zero_depth|no_snap`), and writes one compact derived row per `(symbol, bucket_start)` (fire-grid floored, `ON CONFLICT DO NOTHING`) into the NEW plain table `xstock_qd_probe_history`. Retention = the B75 sweep's plain-table age-delete pass (90d, no cold-offload). **Upstream:** `xstock_spot_ticker_snap`, `XSTOCK_SPOT_SYMBOLS`, `module_constants` (`qd_probe.*` + `data_lifecycle.xstock_qd_probe_history.hot_retention_days`), `isXstockMarketOpenUTC`. **Downstream (this batch):** none — **CAPTURE-ONLY**; the friction-EXTRACTION consumer (per-pair `perPairOverrides`) is homed **B81/Phase-25** (#86; the RTH-gated basis is RUNNING_ISSUES R-D2 candidate there). Runtime singleton = registry **S15** (above). Blast radius LOW / additive. Live-verified P19-B5c (490 universe, 486 rows/fire, spread p50 ~15 bps).

### `scripts/b79-0a-load-test.ts` (NEW)

Pre-deploy sizing-gate (RUNNING_ISSUES #81 first execution). 20-cycle replay with 2-cycle warmup strip; surfaces: PM2 CPU/RSS/loadavg, Hetzner cores, Supabase pool utilization, per-cycle DB-roundtrip ms (Langston rev 2 #1). Decision-gate logic: SHIP / SHIP_AFTER_INFRA_UPGRADE / HALT. **First-run 2026-05-08: DECISION:SHIP** (steady-state cycles ~72ms, p95 well under 100ms gate, Supabase pool unproblematic).

### `server/tests/unit/b79-0a-arm-injection.test.ts` + `b79-0a-data-freshness.test.ts` (NEW)

Coverage for ARM constructor back-compat + data-freshness helper edge cases (closed-market belt-and-suspenders + window + Infinity sentinel + lastTick=0).

### "If I Change X, Check Y" — B79.0a additions

- **Modify scanner cycle frequency** → match `SCAN_INTERVAL_SECONDS` constant + verify HOSTILE_SIM_SLEEP_MS stays under tick anchor (preserves no-skip surface per Langston Step 4 #2)
- **Modify scanner DB query** → re-run load test (`scripts/b79-0a-load-test.ts`); p95 must stay under 100ms
- **Toggle hostile-sim** → BOTH `BACKPRESSURE_TEST_MODE=1` AND `HOSTILE_SIM_OVERRIDE=1` (when `NODE_ENV=production` for staging); never set in real prod
- **Adjust freshness window** → update `module_constants.market_data.<assetClass>.data_freshness_window_ms` row; `isPairDataFresh` 60s cache picks up automatically; xstock_spot closed-market always returns true
- **Add new asset class scanner** → mirror `xstock-spot/scanner.ts` shape; ASSET_CLASS_ONBOARDING_WORKFLOW.md §F captures the location rule (asset-class folder, not services/)

---

## Recent additions (B79 — Phase 24 — 2026-05-07 evening)

### `server/services/asset-class-instances.ts` (NEW, B79)

**Layer:** 9 (Infrastructure / Bootstrap)

**Purpose:** Per-asset-class telemetry / scanner / ratio-manager bootstrap factory. Exports `getAssetClassInstances(assetClass) | null` returning `{telemetry, ratioManager, failureTracker, scanManager, inMemoryOnly}`. Crypto_spot returns null (callers use existing global singletons; no-touch fence). Xstock_spot lazy-bootstraps a fresh in-memory triad on first call.

**Upstream:** none (factory; called by future xstock scanner loop in B79.0a).
**Downstream:** when invoked, instantiates `TelemetryAggregatorService` + `AdaptiveRatioManager` + `PairFailureTracker` + `AdaptiveScanManager` (the latter accepts injected telemetry + failureTracker via existing constructor signature).
**Shared state:** `_xstockSpotInstances` module-scoped cached triad (lazy singleton).
**Background execution:** none Day 1 (dormant). When B79.0a wires the live xstock scanner setInterval, that loop becomes the consumer.
**Blast radius:** LOW. Crypto path UNTOUCHED (returns null, callers use existing globals). xstock callers explicitly opt-in to new triad via `getXstockSpotInstances()`.
**Safety hazard documented:** `TelemetryAggregatorService` has a module-scoped disk-persist path at `server/services/telemetry-aggregator.ts:1600-1602`. Naive second instance would clash on disk write. Resolution Day 1: xstock instance runs in-memory only (no disk persist). Promote persistence in B79.x if Layer 3 evidence requires.

### `server/utils/symbol-normalize.ts` (NEW, B79)

**Layer:** 9 (Infrastructure / Utilities)

**Purpose:** Cross-asset/cross-exchange symbol-form normalization. `normalize(symbol, assetClass, opts?) → canonical`. Idempotent + fail-soft on unknown forms (warn-once and return input). Strict mode throws on unrecognized.

**Upstream:** consumed by future scanner / SQE / archiver call sites where multiple symbol forms can arrive.
**Downstream:** none directly; pure function.
**Shared state:** `_unknownFormWarnCount` warn-once counter module-scoped (cosmetic).
**Blast radius:** LOW (pure function, callers opt in).

### `server/strategies/orb.ts` (NEW, B79)

**Layer:** 4 (Signal Generation / Strategies)

**Purpose:** Opening Range Breakout strategy — equity-microstructure-targeting first-30min open-range breakout. **B79.0d ACTIVATION (2026-05-09):** dormant scaffold replaced with full ~210-line implementation. Calendar-fixed 14:30–15:00 UTC opening range (per Q1 lock); 15:00–17:00 UTC active breakout window (Q3); 0.15×ATR buffer (Q2); 1.5× volume multiple confirmation; R:R 2× rangeHeight target (label nit per RUNNING_ISSUES #90); confidence 0.55–0.90 with range/atr clamp at 3.0 (Q4 Langston nit).

**Upstream:** strategy-engine `detectORB` wrapper → file detect (B79.0d). Signal-orchestrator dispatch block at line 1786+ (gated by `resolveAssetClass(symbol,'kraken') === 'xstock_spot'`). Module_constants 7-row threshold set at `strategy.orb` scope. Module_constants gate row at `strategy_gates.xstock_spot.orb.enabled` (true post-B79.0d). XSTOCK_SPOT_24_7_SYMBOLS set imported for opening-bell guard.
**Downstream:** SQE filter (xstock_spot whitelist already includes 'orb' per B79); paper-execution-engine (active path dormant pending Phase 19); B73 exit-strategy ablation (auto-included — replay-service is strategy-agnostic).
**Shared state:** 3 module-scoped log-throttle counters (`_disabledLogCount`, `_no24_7LogCount`, `_outsideWindowLogCount`).
**Background execution:** invoked synchronously by signal-orchestrator on every evaluation tick when activeStrategies.has('orb') AND assetClass === 'xstock_spot'.
**Blast radius:** MEDIUM — fires only on xstock_spot 24/5 names (24/7 names skipped by detect's `XSTOCK_SPOT_24_7_SYMBOLS.has(symbol)` guard). Crypto path triple-defense: detect-internal asset_class guard + signal-orchestrator dispatch-guard + SQE whitelist.
**Rollback path:** DB-only — `UPDATE module_constants SET value='false'::jsonb WHERE module_name='strategy_gates' AND asset_class='xstock_spot' AND strategy='orb' AND constant_name='enabled'`. Cached sync API picks up on next tick. No code revert needed.
**First-fire expected:** Monday 2026-05-11 14:30 UTC (range formation start) → 15:00 UTC (first breakout candidates).

### `shared/asset-classes.ts` `XSTOCK_SPOT_KRAKEN_COLLISIONS` (NEW, B79.0f)

**Layer:** 0 (Shared / Asset-Class Registry)

**Purpose:** 17-entry set (9 USD + 8 EUR pre-emptive) of base symbols that exist BOTH in `XSTOCK_SPOT_SYMBOLS` (xStock equity universe) AND on Kraken's crypto-spot universe per `/0/public/AssetPairs`. Provenance comment cites Kraken `/AssetPairs` query 2026-05-10. **Why it matters:** without this gate the resolver's `XSTOCK_SPOT_SYMBOLS.has(symbol)` fast-path returns xstock_spot for canonical-form crypto signals like `SUI/USD` — silently misclassifying every crypto signal whose ticker matches an equity (e.g. SUI = Sui Network crypto vs Sun Communities equity).

**Upstream:** referenced only by `resolveAssetClass` in same file.
**Downstream:** behavior gating in resolver `kraken` exchange branch.
**Standing rule:** quarterly re-audit via live `/AssetPairs` intersection. Kraken adds tokens regularly; new collisions can emerge.
**Test coverage:** `b79-0f-asset-class-collisions.test.ts` 33 cases — collision-set integrity (size, contents, USD+EUR coverage, master-set parity), 9 USD + 8 EUR collision crypto-resolves, disambiguating-form (SUIx/USD) xstock-resolves, non-collision xStock fast-path, pure-crypto.

### `resolveAssetClass` `kraken` branch behavior change (B79.0f update to B69-era resolver)

**Layer:** 0 (Shared / Asset-Class Registry)

**Purpose update (B79.0f):** the historical `kraken`-spot branch returned `xstock_spot` for any symbol in `XSTOCK_SPOT_SYMBOLS`. This was correct for non-collision tickers but silently mis-tagged the 9 collision tickers as xstock_spot when in fact the regular `kraken` exchange path serves the crypto pair. New behavior: collision-set membership PRECEDES the xStock fast-path → routes to crypto_spot + emits `[B79.0f][COLLISION_RESOLVE]` WARN log so future drift in the data-ingestion invariant is observable. xStock signal DOES route to xstock_spot via the `kraken-equities` exchange branch OR via the `XSTOCK_SPOT_DISPLAY` x-suffix form (`SUIx/USD`).

**Backfill applied 2026-05-10:** 4862 mis-tagged rows in `signal_eval_archive` flipped `xstock_spot` → `crypto_spot` (DASH/USD 337 + MET/USD 1598 + OPEN/USD 44 + SUI/USD 2883). Other tables (trading_signals, regime_factor_alternates, exit_strategy_alternates, paper_sim_trades) had 0 mis-tagged rows.

### `vts_open_trades` table (NEW, B79.0g)

**Layer:** 8 (Persistence / Database)

**Purpose:** durable persistence of open VTS trades so they survive PM2 restarts and so downstream consumers can read `asset_class` from the row instead of re-resolving from canonical symbol form (which is fundamentally ambiguous post-canonicalization for the 9 collision tickers). Hybrid schema: 14 explicit columns (id, symbol, asset_class, prices, sizing, regime, signal_type, strategy, pool, opened_at) + jsonb `context` for the ~20 optional fields on `OpenVirtualTrade` interface.

**Upstream:** written by `vts-trade-persistence.ts` from vts-runner trade-open path (await INSERT before Map.set). Bootstrap-from-memory writer re-resolves asset_class via `safeResolveAssetClass` before INSERT — defeats stale legacy values.
**Downstream:** rehydrate-on-boot from `server/index.ts` after `loadTrailingStates` and BEFORE `xstockSpotScanner.start`. Rehydrated rows seed `openVirtualTrades` Map. TEC trailing states rejoin via existing `tec_trailing_states` rehydrate path.
**Indexes:** symbol, asset_class, opened_at, **plus partial index `vts_open_trades_open_filter_idx ON (id) WHERE closed=false` (B79.0g-tx)** supporting the rehydrate + bootstrap-COUNT hot read path as closed-history accrues pre-GC.

**B79.0g-tx soft-delete columns (added 2026-05-11):** `closed BOOLEAN NOT NULL DEFAULT false` + `closed_at TIMESTAMPTZ NULL`. Trade-close UPDATE flips `closed=true, closed_at=NOW()` via awaited single-row UPDATE in `markOpenTradeClosed` (replaced the B79.0g fire-and-log DELETE). UPDATE is idempotent via `WHERE closed=false`. Boot-time GC sweep DELETEs rows where `closed=true AND closed_at < NOW() - INTERVAL '<retention> days'`; retention sourced from `module_constants.data_lifecycle.vts_open_trades.closed_gc_retention_days` (default 90; HARD-FAIL semantics: missing row emits `[B79.0g-tx][CONFIG_MISSING]` log + skips sweep + does NOT halt boot).

**Close-time ordering invariant (CRITICAL, Langston pre-audit R1):** at the vts-runner close site (lines 2375-2402) `openVirtualTrades.delete(id)` runs FIRST (synchronous, can't fail), THEN awaited `markOpenTradeClosed(id)` in try/catch with NO re-throw. The Map gate is the correctness invariant against re-executing the non-idempotent close cascade (`persistRealPriceTrade` → `closedTrades.push` + session P&L + JSON ledger + B70 archive enqueue + B73 ablation replay + ML calibration). Soft-delete is observability + bounded-history; only Option C would make the cascade atomic, and Option C was rejected at scope time because there's no shared Postgres-tx surface with `logTrade`'s JSON write. If `markOpenTradeClosed` throws, the DB row stays `closed=false` and rehydrate-on-next-boot re-adds the trade to the Map; a subsequent close cycle retries cleanly (idempotent UPDATE).

**Blast radius:** MEDIUM — touches every trade-open path. INSERT failure aborts trade-open cleanly (no half-state). Rehydrate failure soft-fails (boot continues with empty Map). Sweep failure soft-fails with its own `[B79.0g-tx][SWEEP_FAIL]` label distinct from rehydrate.

### `server/services/vts-trade-persistence.ts` (NEW, B79.0g)

**Layer:** 8 (Persistence / Database)

**Purpose:** encapsulates the ops on `vts_open_trades`. After B79.0g-tx the surface is **5 functions**: `insertOpenTrade` / `markOpenTradeClosed` (replaced `deleteOpenTrade`) / `rehydrateOpenTrades` / `bootstrapOpenTradesFromMemory` / `sweepClosedOpenTrades`. Bootstrap path is one-shot first-deploy migration that snapshots in-memory `openVirtualTrades` Map into the empty table WITH RE-RESOLVE of `asset_class` via `safeResolveAssetClass(symbol, 'kraken')` — critical to defeat stale legacy values from any pre-B79.0f resolver state on the in-memory record (Langston Q4 add'l #1 lock). **Post-B79.0g-tx semantic:** bootstrap is gated on OPEN-only count (`WHERE closed=false`); closed-history soft-deleted rows do NOT block re-resolve bootstrap (Q4 preserved across soft-delete world).

**Upstream:** vts-runner imports + calls insert + markOpenTradeClosed. `server/index.ts` boot path calls rehydrate + sweep in separate try/catch blocks.
**Downstream:** writes (INSERT + UPDATE + DELETE) to `vts_open_trades` table; reads `module_constants.data_lifecycle.vts_open_trades.closed_gc_retention_days` for sweep.
**Test coverage:** `b79-0g-vts-trade-persistence.test.ts` 13 cases incl. bootstrap re-resolve regression-lock, markOpenTradeClosed idempotency, sweepClosedOpenTrades (config present + missing + invalid), bootstrap-with-closed-history-rows regression-lock.

### Archive tables namespace rename `equity_*` → `xstock_*` (B79.0e)

**Layer:** 8 (Persistence / Database)

**Purpose:** B69 retagged the asset_class field VALUES from `equity_spot` → `xstock_spot` but the actual DB tables retained legacy `equity_*` names. B79.0e completes the namespace migration: 4 parent tables (`equity_spot_ohlc_1m` / `equity_spot_ticker_snap` / `equity_perp_ohlc_1m` / `equity_perp_ticker_snap` → `xstock_*`) + 52 monthly partition children (DO block sweep) + 4 parent indexes + 108 partition indexes (DO block sweep) + 4 module_constants `data_lifecycle.equity_*.hot_retention_days` keys (UPDATE). **172 DB objects renamed in single transaction** (sub-second metadata-only ALTER RENAME).

**Code surface (15 files):** `shared/schema.ts` const exports renamed (`xstockSpotOhlc1m` etc; type aliases `EquitySpotOhlc1m` etc retained as transitional, queued for cosmetic modernization); `shared/asset-classes.ts` registry `archiveOhlcTable`/`archiveTickerTable` strings; `ohlc-batch-writer.ts` + `ticker-batch-writer.ts` import paths + tableForAssetClass map values; `xstock_spot/scanner.ts` + `data-freshness.ts` + `storage-client.ts` + `drift-dashboard-aggregator.ts` + `passive-archive-bootstrap.ts` + `b74-create-monthly-partitions.ts` + `b75-rehydrate.ts` + `b75-retention-sweep.ts` + `b79-0a-load-test.ts` + `b79-0a-qd-probe.ts` + `asset-classes.test.ts`.

**Reserved namespace.** `equity_*` is now reserved for FUTURE real (non-tokenized) US equity feeds (e.g. direct ARCA/NYSE feed). xStocks (tokenized representations) own `xstock_*`. Don't conflate.

**Rollback:** `2026-05-10-b79-0e-rename-equity-to-xstock-rollback.sql` — reverse-renames 172 objects via symmetric DO blocks + `UPDATE module_constants` reverse (Langston Step 4 F1 fix).

### `server/asset_classes/xstock_spot/market-hours.ts` (B79; B79.0c per-symbol)

**Layer:** 5 (Regime Classification / Asset-Class Config)

**Purpose:** Per-symbol market-hours predicate `isXstockMarketOpenUTC(symbol, now?)`. **B79.0c update (2026-05-09):** REQUIRED-symbol signature (Langston Q4 push-back vs original optional). 10 Kraken Phase-1 24/7 names (`XSTOCK_SPOT_24_7_SYMBOLS`: AAPL, CRCL, GLD, GOOGL, HOOD, MSTR, NVDA, QQQ, SPY, TSLA — canonical /USD form) bypass ARCA gate; all other xstocks apply ARCA 24/5 schedule. Internal `normalizeXstockSymbol` handles 3 input forms: canonical (`AAPL/USD`), canonical-with-x (`TSLAx/USD`), Kraken-pair (`TSLAxUSD`, `AAPLxUSDC`).

**Upstream:** `XSTOCK_SPOT_24_7_SYMBOLS` from `shared/asset-classes`. Single dependency — shared/* is leaf.
**Downstream (4 callsites):** `xstock_spot/scanner.ts` (universe filter), `core/filters/signal_quality_evaluator.ts:182` (weekend-pause gate), `utils/data-freshness.ts:97` (closed-market belt-and-suspenders), `services/trailing-exit-controller.ts:650` (stop-freeze guard).
**Shared state:** none.
**Blast radius:** MEDIUM (every xstock_spot signal evaluation passes through this; symbol arg now mandatory — TS catches no-arg callsites at compile). Crypto path doesn't import this.
**Limitations:** does NOT include US market holidays. Live-data flow for the 10 24/7 names blocked upstream (Kraken WS-equities silent on weekends regardless of 24/7 marker — RUNNING_ISSUES #89 for B79.x follow-up).
**Test coverage:** `b79-0b-market-hours.test.ts` (13 ARCA boundary cases), `b79-0c-market-hours-per-symbol.test.ts` (19 cases — membership integrity + 24/7 bypass + non-24/7 ARCA + 3-form normalization w/ F1 regression-lock + USDC quote NOT-in-set + unknown-symbol fallback).

### `server/asset_classes/types.ts` (NEW, B79)

**Layer:** 5 (Asset-Class Type Definitions)

**Purpose:** `AssetClassFrictionModel` interface — shared shape for per-asset-class friction modules. Decimal-fraction unit consistency (e.g. 0.0026 = 0.26%) per Langston B79 rev 1 callout.

**Upstream:** none (type-only).
**Downstream:** consumed by `crypto_spot/friction.ts`, `xstock_spot/friction.ts`, `cost-model.ts` `getFrictionForAssetClass`.
**Blast radius:** ZERO at runtime (types erased at build).

### Modified components (B79)

- **`server/core/metrics/market-regime.ts`** `calculatePairRegime` now accepts optional `assetClass: string = 'crypto_spot'`. Crypto path threshold dispatch UNCHANGED. xstock_spot dispatch added (vol/DX/momentum thresholds halved per scope §2.3 Layer 1; DBS scale-invariant).
- **`server/core/math/cost-model.ts`** new `getFrictionForAssetClass(assetClass)` + `getDefaultCostComponentsForAssetClass(assetClass, symbol?)` dispatch. `getCachedCostMetrics(symbol, assetClass='crypto_spot')` extends signature; crypto path unchanged.
- **`server/core/filters/signal_quality_evaluator.ts`** xstock_spot weekend-pause + strategy-whitelist gates added at top of `evaluateSignalQuality`. Crypto_spot signals bypass these gates entirely.
- **`server/services/trailing-exit-controller.ts`** TEC stop-freeze guard at top of `updatePosition` (Langston PIA Q5 placement). Returns no-op state preservation when xstock_spot market closed.
- **`server/config/canonical-regime-strategy-map.ts`** `XSTOCK_SPOT_ENABLED_STRATEGIES` set with 6 quant + 3 file pattern + ORB Q-D-gated.
- **`shared/asset-classes.ts`** `XSTOCK_SPOT_SYMBOLS` allow-list (275 syms, canonical `BASE/USD` form). `resolveAssetClass` dispatches xstock allow-list lookup BEFORE crypto regex (since canonical forms collide).

### "If I Change X, Check Y" — B79 additions

- **Add new xstock symbol** → INSERT into `xstocks-universe.json` + INSERT into `XSTOCK_SPOT_SYMBOLS` set in `shared/asset-classes.ts`. Both must stay in sync (TODO: dynamic load from JSON in B79.x).
- **Flip ORB activation** → UPDATE `module_constants` row `(module_name='strategy_gates', asset_class='xstock_spot', strategy='orb', constant_name='enabled')` value `true`. Requires Q-D probe outcome supports activation. Also requires registering ORB in strategy-engine dispatch (B79.x).
- **Enable xstock_spot equity macro modifier** → currently 1.0 placeholder. B79.3 ships VIX/S&P/sector-rotation/yield-curve composition + module_constants seed. UPDATE `mce_config.macro_modifier` xstock_spot row to flip from neutral.
- **Add new asset class** → walk `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` Section A through G. Add `server/asset_classes/<class>/` files + `getAssetClassInstances` switch case + `XSTOCK_SPOT_ENABLED_STRATEGIES`-equivalent set + schema migrations + module_constants seeds.
- **Tune xstock_spot regime thresholds** → currently TS constants in `server/asset_classes/xstock_spot/regime-thresholds.ts` (Layer 1 baseline). Layer 3 calibration may promote to module_constants in B79.1.

---

## Recent additions (B79.0m.b2 — Phase 24 extended — 2026-05-11)

### `server/asset_classes/xstock_spot/pattern-filter.ts` (NEW, B79.0m.b2)

**Layer:** 3 (Filtering).
**Purpose:** Parallel pattern-path filter for xstock_spot — mirrors crypto's pattern global+IMF gate from `fx5-scanner.ts:743-770 + 1242-1272`. Two-stage: (1) global filter (min_price/max_price/min_volume/60-bar history floor) then (2) pattern IMF gate (LQ/VN/DI band).
**Upstream:** `screener_filters` row at `(mode, asset_class='xstock_spot', filter_path='vts_pattern'|'active_pattern')` — seeded by `2026-05-11-b79-0m-b2-xstock-pattern-rows.sql`; OHLC bars from `eval-cycle.fetchXstockOHLC`.
**Downstream:** `eval-cycle.ts` only (single consumer).
**Shared state:** none.
**Execution:** synchronous per pair inside `evaluateXstockPairForVTS`.
**Blast radius:** **LOW** — leaf module, DB row + arithmetic. Failure → returns `passed: false` with diagnostic reason.
**Calibration debt (Layer 3):** the 60-bar floor matches `global-filter.ts:109` convention but is hardcoded; future migration target is `module_constants.pattern_pool_gates.min_bars_for_eval` per Langston Step 4 acknowledgement (PRE_AUDIT §-1.10).

### `server/asset_classes/xstock_spot/lane-eligibility.ts` (NEW, B79.0m.b2)

**Layer:** 4 (Adaptive / routing helper).
**Purpose:** Per-lane strategy eligibility check extracted from `eval-cycle.ts` for unit-test isolation (Langston Step 4 nit #1). Exports `EvalLane` type + `isStrategyEligibleForLane(strategyKey, lane)`. Mirrors crypto `fx5-scanner.ts:1607-1643` lane semantics: `quant-${family}` lane → primary OR hybrid (HYBRID_FAMILY_ELIGIBILITY) OR multi-family (MULTI_FAMILY_ELIGIBILITY) match; `pattern` lane → `STRATEGY_FAMILY_MAP[s] === 'pattern'` only.
**Upstream:** `STRATEGY_FAMILY_MAP`, `HYBRID_FAMILY_ELIGIBILITY`, `MULTI_FAMILY_ELIGIBILITY` from `canonical-regime-strategy-map.ts`.
**Downstream:** `eval-cycle.ts` (production), `b79-0m-b2-lane-eligibility.test.ts` (unit test).
**Blast radius:** **LOW** — pure-logic helper.

### `server/asset_classes/xstock_spot/eval-cycle.ts` (MODIFIED, B79.0m.b2 — heavy refactor)

**Layer:** 5 (Per-pair post-filter eval orchestrator).
**Change:** Replaced single-iteration strategy loop with **lane × strategy fan-out**. After family-IMF + parallel pattern-filter, builds `lanes: EvalLane[]` (one entry per qualifying family + one pattern entry if pattern-passed). Strategy iteration is nested `for (lane of lanes) { for (strategy of regimeStrategies) { ... } }` with `isStrategyEligibleForLane` gate. A pair passing N families + pattern produces up to `(N+1) × |regimeStrategies|` evaluation entries, with most collapsed to `family_filter_mismatch` counter increments by the per-lane gate.
**New counters added to `XstockEvalCycleCounters`:** `pairsPassedPattern`, `pairsFailedPattern`, `patternRejectByMinHistory` (Langston rev1 #7 tripwire for §-1.1 60-bar-floor implementation correctness), `patternFanOut`, `patternFilterCounters`, `patternPerMetric`, `archiveFailures` (Langston Step 4 #7).
**Upstream additions:** `pattern-filter.ts`, `lane-eligibility.ts`.
**Blast radius:** **HIGH** — every xstock signal flows through this file. Refactor changes data flow shape. Crypto path untouched (separate file `vts-runner.ts:runPhase10SimulationCycle`).

### `server/services/exit-strategy-replay-service.ts` (MODIFIED, B79.0m.b2)

**Change:** `ReplayContext` gains optional `assetClass?: string` (default `'crypto_spot'`). `fetchOhlcForReplay` gains `assetClass: string = 'crypto_spot'` parameter; branches on `xstock_spot` → Drizzle query against `xstock_spot_ohlc_1m` (EXPLAIN ANALYZE 1.035ms verified pre-deploy). Module-scoped `_b79XstockReplayErrors` counter + `[B73-REPLAY][XSTOCK] err=...` log surface async failures. Caller in `vts-service.persistRealPriceTrade:957` threads `tradeData.assetClass`; `vts-runner.ts:2336` threads `trade.assetClass`. Pre-existing log-line bug at line 339 (`ohlcBars.length` ReferenceError) NOT introduced this batch — filed RUNNING_ISSUES #99.
**Blast radius:** **MEDIUM** — wrong-asset OHLC lookup pre-fix returned empty bars silently for xstock trades (B73 ablation rows would never populate). Crypto path unchanged (default param preserves byte-identical behavior).

### `server/strategies/orb.ts` (MODIFIED, B79.0m.b2 — LONG-only fix)

**Change:** Down-break branch (`!upBreak`) replaced with `setNullReason('sell_disabled_long_only'); return null;` mirroring `inside-bar-reversal.ts:131-134`. ORB now strictly LONG-only. New import `setNullReason from '../utils/null-reason-tracker.js'`. Docstring updated `Direction: BUY only`.
**Blast radius:** **MEDIUM** — touches shared strategy file. Crypto impact verified zero (pre-deploy: crypto ORB admitted=0/24h, total=77,919 all strategy_internal — no down-break SELL trades ever leaked to admit on crypto). Real fix for xstock_spot where ORB is enabled and could have produced SHORT signals post-pattern-flow.

### `server/config/canonical-regime-strategy-map.ts` (MODIFIED, B79.0m.b2 — STRATEGY_FAMILY_MAP entry)

**Change:** Added `orb: 'breakout'` to `STRATEGY_FAMILY_MAP` (was previously absent → bypassed family-eligibility gate entirely). Comment cites Langston rev1 Q-L2 confirm. Rollback trigger §-1.7 documents two-condition revert (new crypto ORB admit + new reject_stage value) — neither expected.
**Blast radius:** **MEDIUM** — affects vts-runner and signal-orchestrator family-gate behavior. Crypto regression risk: minimal (ORB never fires admitted on crypto today). Monitor `signal_eval_archive` post-deploy.

### `drizzle/migrations/2026-05-11-b79-0m-b2-xstock-pattern-rows.sql` (NEW)

4 INSERT rows: `(paper|live, xstock_spot, vts_pattern|active_pattern)` cloned from crypto baseline. `ON CONFLICT DO NOTHING` for re-run safety. Rollback file present.

### `shared/schema.ts` `screenerFilters` (MODIFIED, B79.0m.b2 — drift fix)

Unique-index TS declaration changed from `(mode, filterPath)` → `(mode, assetClass, filterPath)` matching production index name `screener_filters_mode_class_path_idx`. No DB migration runs because production already has correct state (applied by B79.0m.a hotfix that bypassed drizzle-kit). RUNNING_ISSUES #100 tracks the drizzle-kit journal synchronization follow-up.

### "If I Change X, Check Y" — B79.0m.b2 additions

- **Modify pattern-pool gates** → UPDATE `module_constants.pattern_pool_gates.<class>.*` row(s); `pattern-filter.ts` reads via `getCachedNumberRequired` so no code change needed.
- **Add new pattern strategy** → ADD to `STRATEGY_FAMILY_MAP` with `'pattern'`, ADD `module_constants.strategy_gates.<class>.<strategy>.enabled` rows (default per-class), confirm `module_constants.strategy.<strategy>.*` wildcards or scoped rows exist, ADD detect function with LONG-only enforcement matching `inside-bar-reversal.ts:131-134` pattern.
- **Add new asset class to B73 replay** → extend `fetchOhlcForReplay` switch in `exit-strategy-replay-service.ts` with a new branch; add observation counter; confirm OHLC source table has `(symbol, interval_begin DESC)` index on all partitions.
- **Tune the 60-bar floor in pattern-filter** → for now hardcoded in `pattern-filter.ts`; Layer 3 migration target is `module_constants.pattern_pool_gates.min_bars_for_eval`. Same applies to `global-filter.ts:109`. Coordinate both files when promoting.

## B79.0m.b2 follow-up patches (2026-05-12)

After initial B79.0m.b2 ship, 6 follow-up commits closed Kyle's catalog of 9 diagnostic-visibility issues. The architectural shape from B79.0m.b2 is unchanged; these patches surface real numbers in the panel that were previously hardcoded to 0 or hidden by slow/broken DB queries.

### `server/asset_classes/xstock_spot/eval-cycle.ts` (MODIFIED, B79.0m.b2 follow-up)

**Change:** `XstockEvalCycleCounters` gains 10 new fields for per-lane (quant vs pattern) split + setup-hash-dedupe counter:
- `quantPairsEvaluated` / `patternPairsEvaluated`
- `quantStrategiesEvaluated` / `patternStrategiesEvaluated`
- `quantStrategyNulls` / `patternStrategyNulls`
- `quantSignalsGenerated` / `patternSignalsGenerated`
- `quantSignalsRejected` / `patternSignalsRejected`
- `setupHashDeduped` — fires when setup-hash dedupe path silently skips (was a `continue;` with no counter pre-fix)
- Also: `nullReasonAggregate['setup_hash_dedupe']++` so the null-reason aggregate surfaces this path

**Why:** Endpoint was hardcoding all pattern-path eval metrics to 0, making the panel show pattern path "dead after VTS destination." Per-lane increments in the strategy iteration loop branch on `lane.kind`.

### `server/asset_classes/xstock_spot/lane-eligibility.ts` (MODIFIED, B79.0m.b2 follow-up)

**Change:** `isStrategyEligibleForLane` now allows `stratFamily === 'pattern'` strategies in family lanes (was previously `return false`). Mirrors crypto's symbol-pool-union eligibility model where a pair in both quant + pattern pools produces duplicate VTS-batch entries and pattern strategies fire on family-lane entries too.

**Asymmetry preserved:** Quant + hybrid strategies still do NOT fire on the pattern lane.

**Blast radius:** **LOW** — single boolean flip in a pure-logic helper. Verified live: strategy iteration count tripled from 225 to 824 in the first cycle post-deploy.

### `server/asset_classes/xstock_spot/scanner.ts` (MODIFIED, B79.0m.b2 follow-up)

**Change:** Lifetime accumulator extended with all 10 new per-lane counters + `setupHashDeduped`. SCAN_EVAL_DONE log line gains `passed_pattern`, `failed_pattern`, `pattern_reject_min_history`, `pattern_fanout`, `family_fanout_sum`, `archive_failures` fields (was missing pattern path + fan-out telemetry).

### `server/routes.ts` `/api/xstocks/filter-diagnostics` (HEAVY REFACTOR, B79.0m.b2 follow-up)

**Three critical changes:**
1. **Dropped broken `signal_eval_archive` aggregation queries** — referenced 4 nonexistent columns (`regime`/`null_reason`/`signal_generated`/`trade_opened`); silently failed via try/catch leaving panel sections empty. Replaced with in-memory reads from `scanner.diag.evalCountersLifetime`.
2. **Dropped slow universe COUNT query** — `COUNT(DISTINCT date_trunc('second', captured_at))` over millions of `xstock_spot_ticker_snap` tick rows hit 60s statement timeout, causing the ~60s tab load Kyle reported. Replaced with `XSTOCK_SPOT_SYMBOLS.size` static lookup + `diag.cyclesCompleted` from scanner.
3. **Endpoint now surfaces real per-lane counters** — `vtsEvaluation.quantPairsEvaluated`, `patternPairsEvaluated`, `quantStrategyEvaluations`, `patternStrategyEvaluations`, `quantStrategyNulls`, `patternStrategyNulls`, `quantSignalsGenerated`, `patternSignalsGenerated`, `quantSignalsRejected`, `patternSignalsRejected`, `setupHashDeduped`. Same fields added to `lastCycleVtsEval` for last-cycle view.

**Plus:** `familyMismatchDenominatorTotal` field added — endpoint emits the correct denominator (`eligibility-pass + eligibility-fail`) for the family-mismatch % rendering. Pattern-path response now uses `applicable.path: true` with `buildPatternGlobalFromCounters` + `buildPatternImfFromCounters` helpers consuming the new counters. `buildFamilyPaths` returns full `{imf: {failedLQ/VN/DI/Corr/passed/total/benchmarkBypassed}, survivors}` shape per family + strips `vts_`/`active_` prefix from keys (panel iterates `['trend','reversal','breakout','oscillator','strong_trend']`).

**Blast radius:** **HIGH** — endpoint is the sole data source for the xStocks tab Filter Diagnostics panel. **Load time verified 60s → 0.94s (60× speedup).**

**B-DIAG-387 (#387, 2026-06-25) — Net-EV-floor reject counter + dead-scaffold removal (observability-only):**
- The endpoint's `vtsEvaluation.rejectedReasons.netEvBelowFloor` previously read `byReason['net_ev_below_floor'] || totalRejected` — `byReason`/`totalRejected` were permanently-empty "reference shape" scaffolding, so the tile reported **0 forever** (caused the retracted #386). NOW sourced from the lifetime accumulator: `lt.nullReasonAggregate['net_ev_rejected']`, written at the single eval-cycle reject site (`eval-cycle.ts:716`, `netEV ≤ VTS_NET_EV_FLOOR`) into `nullReasonAggregate` + the per-lane `quant/patternNullReasonAggregate` (key `net_ev_rejected`). Parity with the crypto vts-runner path (`vtsEvalCounters.rejectedReasons.netEvBelowFloor`). **In-memory key `net_ev_rejected` ↔ archive reason `net_ev_below_floor` (same event, two layers).**
- **Pre-open/TCL gate reasons now surfaced** (`nullReasons.reentryCooldown/pricePastStop/pricePastTarget`, from `checkPreOpenGates`) — previously in `nullReasonAggregate` but rendered nowhere (no-hidden-gates).
- **Dead scaffolding excised (§18, DELETED_COMPONENTS_LOG):** the `byStrategy`/`total*`/`byReason`/`byRegime` locals + the always-empty `signalRejections` response field. The xStock endpoint no longer emits `signalRejections` (no client reads it; crypto endpoint keeps its own). Client `FilterDiagnosticsData.signalRejections` relaxed to optional.
- **Verified EXACT:** live endpoint `netEvBelowFloor` == `signal_eval_archive` (`reject_stage='sqe'`, `net_ev_below_floor`, xstock_spot) over the matched since-restart window (25 == 25).

### `client/src/components/machine-learning/xstocks-tab.tsx` (MODIFIED, B79.0m.b2 follow-up)

**Change:** Per-Pair Fresh-Tick Latency panel (`<FreshnessPanel>`) removed from the render tree per Kyle directive 2026-05-12. The `useQuery` against `/api/xstocks/freshness` is left in place because the scanner-cycle header tooltip still consumes it. Description text above the Filter Pipeline Diagnostics panel updated to reflect post-B79.0m.b2 functional-crypto-parity state.

### "If I Change X, Check Y" — B79.0m.b2 follow-up additions

- **Add new per-lane counter** → ADD field to `XstockEvalCycleCounters` interface + initialize in `makeEmptyXstockCycleCounters` + increment in eval-cycle.ts at the appropriate site + ADD to scanner.ts lifetime accumulator's keys list + surface in routes.ts `/api/xstocks/filter-diagnostics`.
- **Modify a strategy's lane eligibility** → edit `lane-eligibility.ts`. Pattern lane reserved for `stratFamily === 'pattern'` only; family lanes admit pattern + family + hybrid (per HYBRID_FAMILY_ELIGIBILITY) + multi-family (per MULTI_FAMILY_ELIGIBILITY).
- **Add UI consumer of a per-lane counter** → the endpoint surfaces them under `vtsEvaluation.<field>` and `lastCycleVtsEval.<field>`. Pattern-lane fields available: `patternPairsEvaluated`, `patternStrategyEvaluations`, `patternStrategyNulls`, `patternSignalsGenerated`, `patternSignalsRejected`. Quant-lane equivalents with `quant` prefix.
- **Compute family-mismatch %** → divide `nullReasons.familyFilterMismatch` by `vtsEvaluation.familyMismatchDenominatorTotal` (NOT by `strategiesEvaluated`).
- **Surface a NEW reject reason on the panel (B-DIAG-387)** → write the reason into `counters.nullReasonAggregate[<key>]` (+ the per-lane `quant/patternNullReasonAggregate[<key>]` for accurate Quant/Pattern columns) at the reject site in `eval-cycle.ts`; the lifetime merge (`scanner.ts`) carries it into `lt`; then add it to the endpoint's structured `nullReasons`/`rejectedReasons` in `routes.ts`. NEVER reintroduce an always-empty `byReason`/`total*` fallback (that hard-zeroed the Net-EV tile and caused #386). The Net-EV-floor count is keyed `net_ev_rejected` in-memory (↔ archive reason `net_ev_below_floor`). Validate against `signal_eval_archive` over a since-restart window.

---

## Agent Bridges (Hetzner Helsinki, OUT-OF-REPO) — Added B-NEW-41 (2026-05-17)

These two Python bridges run on the Hetzner Helsinki agent box (`204.168.141.77`) and connect Telegram bots → Claude Code agents (CC, Langston). Code lives at `/usr/local/bin/`, NOT in this repo. Documented here for SIM visibility per Kyle directive 2026-05-17 — buried infrastructure is a governance failure.

| Component | Path | Upstream feeders | Downstream consumers | Blast radius |
|-----------|------|------------------|----------------------|--------------|
| `cc-comms-bridge` | `/usr/local/bin/cc-comms-bridge` on Helsinki | Telegram `getUpdates` poll on @CCDTCommsBot (token at `/etc/langston/ccdt-bot.env`) | `/var/log/cc-bridge-inbox.jsonl` (CC tails via SSH) | LOW — boundary only. Voice failure mode: archived to disk, fallback notice posted, text path unaffected. |
| `langston-bridge.py` | `/usr/local/bin/langston-bridge.py` on Helsinki | Telegram `getUpdates` poll on @LangstonDTBot (token at `/etc/langston/telegram-bot.env`) | claude-cli stdin (`/usr/bin/claude -p --session-id <stable-UUID> ...`); shared `/var/log/cc-bridge-inbox.jsonl` mirror | LOW — same surface as cc-comms-bridge. Single-claude-at-a-time invariant guaranteed via unified task_q (B-NEW-41 Step 2 Rev 1). |
| `whisper.cpp` binary + model | `/opt/whisper.cpp/build/bin/whisper-cli` + `/opt/whisper.cpp/models/ggml-small.en.bin` on Helsinki | Audio file subprocess invocation from either bridge | stdout transcription text → bridge inbox/claude-cli prompt | LOW — pure CPU subprocess, no network, no DB. Pinned v1.8.4 SHA `9386f239`. Model sha256 `c6138d6d58e...`. |
| Voice audio archive | `/var/log/cc-bridge-voice-archive/<YYYY-MM-DD>/<msg_id>.ogg` on Helsinki | Either bridge after successful getFile | Manual debugging, re-transcription | LOW — disk-only. 30-day logrotate + 5GB daily-prune cron. |
| Langston SSH path → staging | Helsinki `langston@204.168.141.77` → Frankfurt `deploy@188.245.193.8` | Langston claude-cli SSH invocations (read-only verify ops) | staging `/var/log/dawntrader/*`, `pm2 list`, localhost API curls | MEDIUM — boundary surface expansion. Mitigations: `deploy` user (NOT root), `from="204.168.141.77"` IP-restriction on authorized_keys, ed25519 keypair w/ pre-pinned hostkey. **Explicit escalation chain (must be visible):** Helsinki compromise → Langston SSH key → `deploy@staging` access → `.env` file → `DATABASE_URL` → DB read/write authorization (Supabase is internet-reachable so attacker IP doesn't constrain DB-access stage). Acceptable risk for this batch; ForceCommand wrapper follow-up tracked as RUNNING_ISSUES #110. |

### "If I Change X, Check Y" — B-NEW-41 additions

- **Modify bridge concurrency model** → MUST preserve single-claude-at-a-time invariant on langston-bridge (Step 2 Rev 1 critical). All inbound (text + voice) must route through the same FIFO queue consumed by a single worker thread. Two concurrent `claude --session-id <same UUID>` subprocesses would corrupt session state.
- **Change whisper.cpp binary path or version** → update both bridges' `WHISPER_CLI` constant, update SHA + sha256 pins in CHANGES_AND_FIXES, re-run smoke test (V1) before deploying.
- **Change `from="..."` IP on Langston's pubkey** → update both Helsinki box (via `curl ifconfig.me` check first) AND staging `/home/deploy/.ssh/authorized_keys` line in same atomic operation. Otherwise Langston SSH breaks.
- **Add new Telegram topic Kyle wants Langston/CC to monitor** → add explicit allowlist entry in both `should_handle*` / `is_allowed_voice` functions. Defaults-to-off design — no implicit topic expansion.
- **Modify `/var/log/cc-bridge-inbox.jsonl` schema** → both bridges write to this file; bump `schema_version` on all new entry shapes simultaneously and add migration logic if old entries need reformatting. CC and Langston both read it (tail) so both must understand the new shape.

---

## Discord Comms Fabric (Hetzner Helsinki) — Added B-DISCORD (2026-06-20)

**The LIVE comms backend (switched at cutover #333, 2026-06-25).** Replaces the Telegram fabric above as the day-to-day channel. **The win:** Discord delivers one bot's messages to another bot (bots receive each other's `MESSAGE_CREATE`), so **CC↔Langston is a native in-channel exchange** — the entire Telegram §6.5 SSH-deliver / file-first / hung-instance apparatus is obsoleted by a normal `on_message` handler. Telegram blocks bot-to-bot at the platform level; Discord does not.

**Status: LIVE / SOLE BACKEND.** `COMMS_BACKEND=discord` (in `/etc/dawntrader/comms-active.env`) since the 2026-06-25 cutover (#333) — all CC outbound (`cc-send` + §10.5 alerts) + the Langston bot-to-bot exchange run on Discord `#general`. **The Telegram bridges were DECOMMISSIONED 2026-07-02 (B-TELEGRAM-DECOMM, #348) after a clean 7-day bake** — stopped, unit files removed, scripts archived (Helsinki `/root/telegram-bridges-archive-2026-07-02/` + repo `_archive/deleted-code/*.removed`; `DELETED_COMPONENTS_LOG.md` entry). `cc-send`'s telegram leg now FAILS LOUDLY. Bridge source lives IN-REPO at `comms-infra/discord/` (unlike the Telegram bridges which are out-of-repo at `/usr/local/bin/`) and is deployed to Helsinki `/opt/discord-bridges/` (venv, discord.py 2.7.1).

| Component | Path | Upstream feeders | Downstream consumers | Blast radius |
|-----------|------|------------------|----------------------|--------------|
| `discord-cc-bridge.py` | repo `comms-infra/discord/` → Helsinki `/opt/discord-bridges/` | Discord gateway push (`on_message`) on the CC bot; whisper voice | `/var/log/cc-discord-inbox.jsonl`; `send` mode posts via REST or per-session webhook (display name) | LOW — boundary only; SEPARATE log from Telegram. |
| `discord-langston-bridge.py` | same | Discord gateway push on the Langston bot; whisper voice | claude-cli (`--session-id <UUID> --model claude-opus-4-8[1m]`); `/var/log/cc-discord-inbox.jsonl` mirror | LOW — single-claude-at-a-time preserved (single FIFO worker). Auto-leads reply with addressee name (wake-routing). |
| `langston_queue.py` | repo `comms-infra/discord/` → Helsinki `/opt/discord-bridges/` | the Langston bridge (enqueue review requests; apply markers) | bridge-tracked review queue `/home/langston/.langston-review-queue.json`; pure engine (priority pick, marker parse/apply, two-tier cap, staleness) — 56 unit tests | LOW — pure logic + one JSON file; all bridge calls try/except-wrapped so a queue bug can't break Langston's reply path. Added B-LANGSTON-QUEUE. |
| `discord_common.py` | repo `comms-infra/discord/` | — | shared helpers: config load, REST/webhook send (429 backoff), chunking, whisper transcribe, voice detect | LOW — library. |
| `cc-send` | repo `comms-infra/discord/` | reads `COMMS_BACKEND` from `comms-active.env` | dispatches CC outbound → the discord bridge (`telegram` = loud FATAL since the 2026-07-02 decommission) | LOW — switch indirection; CC always calls `cc-send`, never the underlying bridge. |
| `/var/log/cc-discord-inbox.jsonl` | Helsinki | both Discord bridges | wake watcher tail + (OBJ-5) §10.5 alert surfacing | LOW — SEPARATE from `cc-bridge-inbox.jsonl`; same JSONL schema + `transport:"discord"`. |
| `/etc/dawntrader/comms-active.env` | Helsinki | — | the `COMMS_BACKEND` single-source-of-truth switch (only `discord` is live; `telegram` fails loudly) | LOW (=discord since #333; Telegram decommissioned #348). |
| `discord-cc-bridge.service` / `discord-langston-bridge.service` | Helsinki systemd | — | run the two Discord bridges (the ONLY comms services since the Telegram decommission) | LOW. |
| `/etc/langston/discord-cc-bot.env` / `discord-langston-bot.env` | Helsinki | Kyle-provisioned bot tokens (MESSAGE_CONTENT intent on) | the two bridges | LOW — boundary credentials, same class as the Telegram bot tokens. |

### Cross-Cutting Runtime State (single-backend liveness — §17 registry; dual-backend era ENDED 2026-07-02 #348)
- **`COMMS_BACKEND` switch** (`/etc/dawntrader/comms-active.env`): = `discord`, the only live value. `telegram` makes `cc-send` fail loudly (decommissioned; restore = archive per `DELETED_COMPONENTS_LOG.md`).
- **One live inbox log:** `cc-discord-inbox.jsonl`. The CC wake watcher tails it (+ `langston-alert-invokes.log` + `cc-wake.log` — 3-source tail since the decommission). `cc-bridge-inbox.jsonl` is frozen history (no writers). A schema change bumps `schema_version` across the two Discord writers.
- **Display-name routing:** CC posts on Discord as per-session webhook display names **OLD Claude** (CC-A) / **NEW Claude** (CC-B). The wake filter `cc-wake-filter.py` routes by these names; the Langston bridge `resolve_recipient_name()` leads replies with them.
- **Langston self-advance loop (B-LANGSTON-QUEUE; hardened by #345, RE-ENABLED 2026-06-24).** `LANGSTON_SELF_ADVANCE=1` (systemd drop-in `discord-langston-bridge.service.d/self-advance.conf`) makes the Langston bridge re-invoke him on the next ready queue item after each reply, until the queue is empty. Queue state file `/home/langston/.langston-review-queue.json`. Marker syntax (`[[QUEUE id=X status=done|blocked|error|ready|noop]]`) is **control-only** (never carried by a fresh review request). **#345 hardening (deployed `907cd93db`, after a churn defect was found under sustained chatter):** (a) the enqueue gate `is_review_request` now requires a review-REQUEST verb (`_REQUEST_VERB_RE`) — a conversational reply that merely mentions "verified/agreed" no longer enqueues (the bare-`verif` over-match that drove the churn is gone); (b) the bridge AUTO-SETTLES an enqueued item on any reply — `done` if Langston rendered a review, else the new `noop` terminal status (never falsely `done`) — so an item never lingers `ready`; (c) a per-ITEM `self_advance_refires` counter, **persisted across save/load** in `_self_advance` (the `CapTracker` same-id tier is defeated by `_cap.reset()` on every inbound, so the durable per-item counter is what guarantees a stuck item PARKS after `SAME_ID_CAP` re-fires regardless of chatter); the counter clears on terminal settle (`done`/`noop`/`ready` un-park). The two-tier `CapTracker` stays as the distinct-advance backstop. Disable without rollback: remove the drop-in + `daemon-reload` + restart.
- **Gateway receive-liveness watchdog (B-DISCORD-INBOUND-LIVENESS, #462, LIVE 2026-07-13 — Kyle "please fix").** Closes the silent-inbound-death class (a zombied discord.py gateway: receive dead, process + worker-heartbeat green — confirmed ~95 min 07-11 and ~21 h 07-12, both bridges blind, only a human noticed). NEW shared module `comms-infra/discord/gateway_watchdog.py` (deployed to `/opt/discord-bridges/`; pure core unit-tested `gateway_watchdog_test.py` 29/29) wires onto BOTH bridges via `install_watchdog()`. Mechanism: a TRUE liveness signal `last_gateway_recv` advanced by every gateway frame — `on_socket_raw_receive` (needs `enable_debug_events=True`) incl. the ~41 s heartbeat ACK, so it is **decoupled from channel traffic**; a `WATCHDOG_CHECK_INTERVAL_S`=15 s asyncio loop. LAYERED recovery: (a) PRIMARY loud — on `now−last_gateway_recv > THRESHOLD` (=`max(120, 4×ws._keep_alive.interval)` ≈165 s, logged at startup) it persists+fsyncs a cooldown epoch, posts a loud alert `--notify` Kyle via the gateway-INDEPENDENT REST/webhook path (survives a dead gateway), best-effort time-boxed `ssh system-alerts` (optional, `WATCHDOG_SSH_ALERT_CMD`), then `os._exit(1)` → systemd `Restart=always` reconnects fresh; (b) BACKSTOP silent — `Type=notify`+`WatchdogSec=300` with `sd_notify(WATCHDOG=1)` pinged ONLY while receive is fresh → a full event-loop hang stops the pings → SIGABRT (`WatchdogSec 300 > threshold 165` so the loud path fires first). `TimeoutStartSec=infinity` (both units, harmless defense-in-depth — but INERT in practice: on a can't-connect outage discord.py 2.7.1 CRASHES at `client.py:787` (`self.ws is None`) and the process EXITS at ~63 s (DROP) / ~12 s/cycle (REFUSE, measured), before the 90 s start-timeout fires — #465). On `on_ready`: `READY=1`, `note_recovery` (one "recovered" line), and **backfill** — replays channel history missed during downtime through each bridge's own handler, deduped by `message_id` SCOPED to that bridge's own inbox `kinds` (CC={"",voice} / Langston={langston_inbound}) so a cross-bridge fanout row (#494) can't false-skip a real miss (errs toward re-deliver, never miss). New per-bridge cross-cutting state: `last_gateway_recv` (monotonic, in-proc) + the persisted cooldown-epoch marker (`/var/lib/discord-bridges/cc-gateway-alert-epoch` root; `/home/langston/.discord-bridge/langston-gateway-alert-epoch` langston). Live kill-test (gateway `.234` blocked, REST `.232/.233` alive): stall→alert→exit→wait-during-block→reconnect→recover all verified. **Crash-exit hardening (the second failure mode):** `StartLimitIntervalSec=60`/`Burst=5` lets a slow DROP/timeout outage (~73 s/cycle) restart forever under `Restart=always` → survives+recovers; a REFUSE/DNS fast-fail outage (~12 s/cycle) still latches `failed` — made LOUD by `OnFailure=discord-bridge-failed-notify@%n` (a oneshot that pages Kyle via `cc-send --notify`, so the latch is never silent). Durable root fix (wrap the initial connect so the library crash never exits the process) homed at #465 B-DISCORD-CONNECT-RESILIENCE. Comms-infra only — no engine/strategy/regime/signal-pipeline/math.
- **Queue + bridge durability hardening (B-LANGSTON-QUEUE-2, LIVE 2026-07-11 — Kyle "do it now").** Six defects on the live `langston_queue.py` + `discord-langston-bridge.py` closed, so the review queue can no longer silently lose or corrupt Langston's verdicts: (a) **singleton guard** — the bridge takes an abstract-UNIX-socket lock (`\0discord-langston-bridge-singleton`) + real `argparse` (a stray `--help` EXITS instead of spawning a second bridge — the 17-day root-owned ghost, #496) → cross-user single-instance; (b) **no truncation** — the `(summary or "")[:500]` slice DELETED (#488), reviews stored whole; (c) **move-not-delete** — `save_queue` appends terminal items beyond `keep_done` to an append-only `<path>.archive.jsonl` + `fsync` BEFORE `os.replace`, never deletes (#489 data-loss); (d) **lock across load→save** — a `queue_lock(path)` `fcntl.flock` contextmanager wraps ALL SIX mutation callsites (TOCTOU closed; `_self_advance` passes `_locked=True` to avoid self-deadlock, #495); (e) **fail-loud unknown-id** (#482) + **terminal-state guard** (`apply_marker` returns `dup-terminal`, a contradictory late verdict can't overwrite a settled item, #401). Files are OUT-OF-REPO comms infra at `/opt/discord-bridges/` (documentation-graded, not diff-graded — see RUNNING_ISSUES #463). This is a comms-infra hotfix — no engine/strategy/regime/signal-pipeline/math touched.
- **§10.5 alert closure guarantee + owner-routing (B-ALERT-PROTOCOL #340, LIVE 2026-06-23):** the dispatcher (`scripts/system-alerts.ts cmdFireDue`) now runs `processResurface()` every tick — a **delivery-gated** re-surface that re-posts any `active`/`acknowledged` alert past its two-tier TTL (`computeResurfaceStale()` in `server/services/system-alerts.ts`: active crit 2h / warn 6h, acknowledged crit 4h / warn 12h; clock measured from `fired_at`, ack does NOT reset it; back-off widens 1×→2×→4×, capped) through the FULL fire path (Telegram + Discord + Langston-invoke), and only advances the back-off (`markResurfaced`) when a sink actually delivered (`deliver()===true`) — so a diagnosed-but-unresolved alert can no longer silently rot. **Owner-routing:** Langston's triage reply carries `[[ALERT id=.. owner=<CC-A|CC-B|Kyle> action=".."]]`; `cc-wake-filter.py` `ALERT_OWNER_RE` wakes ONLY the named owner (the old broadcast "invoke DONE → both CCs" wake was REMOVED 2026-06-24 — it flooded both sessions on a backlog clear). `resolved`/`scheduled`/`info` never re-surface (state-guarded + unit-tested 10/10). Protocol doc: `1-system-manual/ALERT_HANDLING_PROTOCOL.md`.

- **★ Langston-dispatch CHUNK-GROUP REASSEMBLY (B-COMMS-CHUNK-FIX, #553, LIVE 2026-07-22) — in-memory buffer, cross-cutting.** Discord's 2000-char cap splits a long post into independent messages, and the Langston bridge's ANCHORED address gate runs **pre-enqueue** — so only chunk 0 carried the leading "Langston" and **chunks 2..N were discarded before becoming tasks** (silent; no error either side). `first_id` could not be the group key: it is captured in `_send_chunks` and returned once, so it is **sender-log-only and never reaches the wire**. **Now:** `discord_common.py` stamps an explicit group marker on every chunk of a multi-chunk Langston-addressed dispatch and cuts **only at whitespace** (`split_on_whitespace`, so a `file:line`/sha/path can never be split); `discord-langston-bridge.py` holds `_chunk_groups` (grp → parts/n/t0/base) and reassembles into ONE task **ABOVE the gate**. `GROUP_TIMEOUT_S=10` measures **silence since the last chunk** (`t0` refreshed per part), not group age; a stale group flushes **with an explicit `[INCOMPLETE CHUNK GROUP …]` note** — never a silent hold. **SCOPE IS NARROW — do not assume broader coverage:** only a CC post that **STARTS with "Langston" AND exceeds 2000 chars** is marked; Langston's own replies (led with "OLD Claude —"/"Kyle —"), all Kyle-facing traffic and the §10.5 alert webhook take the untouched path, byte-identical. **Also fixed same batch:** the `--notify` mention was prepended as `<@id> `, and `<` is not in the gate's allowed leading class ⇒ a notify-flagged dispatch to Langston was dropped **ENTIRELY**, not truncated. Mention is now applied AFTER the address token. **⚠️ The bridge sources are REPO-CANONICAL at `comms-infra/discord/` and pushed to Helsinki — an edit made only on Helsinki is reverted by the next `deploy.sh`.**

### "If I Change X, Check Y" — B-DISCORD additions
- **Flip `COMMS_BACKEND` to discord (cutover)** → confirm both Discord services active + the wake watcher is tailing the Discord log BEFORE flipping; Telegram stays running as rollback; follow `TEST_AND_SWITCH_RUNBOOK.md`.
- **Add/rename a CC session display name** → update the webhook username AND the wake-filter `NAMES`/`ALIAS_NAME` registry AND the Langston bridge `resolve_recipient_name` path — all three must agree or wake-routing breaks.
- **Change the address-Langston gate** → `ADDRESS_START_RE` in `discord-langston-bridge.py`; a CC post must START with "Langston" to engage him. The OBJ-5 alert always-engage exception is a narrow, explicit bypass keyed off the dispatcher's structured `category` marker (NOT sender-name / body substring).
- **Modify Discord bridge concurrency** → preserve the single-FIFO single-worker invariant (same critical rule as the Telegram Langston bridge).
- **Change the inbox-log schema** → two writers (the 2 Discord bridges); bump `schema_version` across both. (`cc-bridge-inbox.jsonl` is frozen — no writers since the 2026-07-02 decommission.)

---

## Price-Discontinuity Detector — Added B-NEW-42b (2026-05-17)

NEW component shipped with B-NEW-42b commit `d8e0f5885`. Closes the 3 structural TEC gaps surfaced by B-NEW-42's Phase 0 audit.

### Component definition

- **File**: `server/services/price-discontinuity-detector.ts` (483 lines)
- **What**: Sentinel module that watches every xStock price tick and flags structural discontinuities (splits, halts with resume gaps, known ex-dividends, cold-start post-restart) so TEC can defer its naive `currentPrice <= stop` and target-lock checks during those events.
- **Public API**: `isDiscontinuityActive(symbol, currentPrice, currentTs?)` → `{ active, kind?, details? }`. Four kinds: `halt_resume_gap` / `corp_action` / `ex_dividend` / `cold_start`.
- **State**: Detector-owned per-symbol `Map<string, SymbolEntry>` cache (state machine IDLE / DISCONTINUITY_ACTIVE / CLEARING). In-process only; PM2 restart discards cache; first call per symbol post-restart triggers `cold_start` fail-safe-skip.

### Upstream dependencies

- `shared/asset-classes.ts` — `XSTOCK_SPOT_SYMBOLS` Set determines whether the detector runs (xStock symbols only). Crypto symbols return inactive immediately.
- `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` — curated 60-entry ex-dividend calendar (15 div-paying symbols × Q3+Q4 2026 dates). Lazy-loaded on first ex-dividend check.
- `module_constants.price_discontinuity_detector.*` — 8 per-asset-class behavioral knobs seeded by `drizzle/migrations/2026-05-17-b-new-42b-...sql` (idempotent ON CONFLICT). **Currently READ ONLY hardcoded values matching the seeds**; DB-resolution deferred to Phase E calibration batch with B79.0a `_NO_WINDOW = Infinity` wildcard fallback pattern.

### Downstream consumers (load-bearing)

- **`server/services/tec-evaluator.ts`** — HOISTS the single detector consultation per logical tick (Langston Step 4 BLOCKER 2 fix). Threads the result down to both:
  - `tecUpdatePosition` via the new `discontinuity?: { active, kind? }` field on `PositionUpdate` → target-lock latch skip
  - `tecShouldClose` as the new 4th positional param → stop-check skip
- **`server/services/trailing-exit-controller.ts`** — `shouldClosePosition` + `updatePosition` target-lock gate consume the pre-resolved discontinuity. When `discontinuity` is omitted by a direct caller (e.g. b65/b80/b79 tests), no gate runs and pre-B-NEW-42b behavior is preserved.

### Blast radius

- **Crypto path**: ZERO by construction. First check in `isDiscontinuityActive` is `XSTOCK_SPOT_SYMBOLS.has(symbol)` → returns `{active: false}` immediately for non-xStock symbols. Crypto stop-check + target-lock behavior unchanged.
- **xStock entry path (scanner)**: NOT GATED. The detector is exit-side only. New positions can still be opened during a halt-resume gap or split-effected price. Entry-side gating accepted as out-of-scope per Kyle directive 2026-05-17 (Option A); Phase 19 live-trading prep adds the entry-side counterpart.
- **xStock exit path (open positions across VTS / paper / live)**: ALL THREE MODES PROTECTED. They all flow through `evaluateTECExit` which consults the detector. No code-path divergence between modes.

### Key invariants

- **Single-consultation-per-logical-tick**: `tec-evaluator.ts` is the ONE site that consults `isDiscontinuityActive` in production. Any future caller integrating the detector must ALSO consult once per logical tick and thread the result, NOT call independently. Pre-fix double-consultation collapsed the 2-tick deferral into 1-tick.
- **Cold-start fail-safe-skip**: first call per symbol when cache is empty returns `{active: true, kind: 'cold_start'}` (Langston pre-audit rev1 #1 non-negotiable). Protects against unfillable-fill during process-restart-during-halt blind window. Cost: one tick of stop-check delay per symbol per cold-start episode.
- **Lazy 24h eviction gated on IDLE state**: entries in DISCONTINUITY_ACTIVE / CLEARING must reach state-machine resolution; only IDLE entries evict by age.
- **Stateless HARD_CEILING**: no setTimeout. 5-minute auto-clear is `(now - state.activatedAt) > HARD_CEILING_MS` — evaluated only when a tick arrives.

### Modification risks ("things that break if X changes")

- **Move detector consultation OUT of tec-evaluator** → reintroduce the Step 4 BLOCKER 2 bug (double-consultation per logical tick collapsing 2-tick deferral).
- **Disable cold-start fail-safe-skip** → unfillable-fill exposure during process-restart-during-halt blind window returns. NEVER disable without an equivalent guard.
- **Change `XSTOCK_SPOT_SYMBOLS` Set without updating detector imports** → crypto path stops being no-op'd; detector starts running on crypto symbols where the curated dividend calendar is empty and the structural assumptions don't apply.
- **Change curated dividend calendar JSON schema** → detector's `loadDividendCalendar()` parses `entries[]`. Bump `_metadata.schema_version` on shape changes; detector currently tolerates missing `_metadata` (skips it).
- **Remove the `discontinuity` parameter from `PositionUpdate` or `shouldClosePosition`** → direct callers in tests would still work, but `tec-evaluator` threading breaks. Production xStock exits would lose detector protection. ALL three trading modes (VTS / paper / live) regress simultaneously.
- **Migrate detector to DB-resolved constants** → Phase E calibration concern. Must use `getModuleConstants('price_discontinuity_detector', ...)` with B79.0a-style `_NO_WINDOW = Infinity` wildcard fallback so missing rows degrade to "detector inactive" not "detector crash."

### Cross-references

- Scope: `Claude Comms and Packages/Scope Files/B_NEW_42B_SCOPE.md`
- Pre-audit (with the design refinement rationale): `Claude Comms and Packages/Scope Files/B_NEW_42B_PRE_AUDIT.md`
- Completion report: `Claude Comms and Packages/Batch Completion/B_NEW_42B_COMPLETION_REPORT.md`
- B-NEW-42 audit findings (the empirical evidence): `1-system-manual/audits/b-new-42/audit-report.md`
- ADJUSTMENT_FRAMEWORK Appendix A — 8 catalogued knobs
- CHANGES_AND_FIXES `BUG-2026-05-17-B` — fix entry
- POST_AUDIT_ROADMAP Phase 24 follow-ups (B79.x failure-mode taxonomy) — partial-address note + entry-side gap acceptance

---

## xStock Directional Bias Store + scanner DBS compute — Added B-PHASE-A2 (2026-05-17)

### Why this entry exists

B-PHASE-A2 ships the xStock-specific Directional Bias Score (DBS) foundation per the locked v2 Calibration Plan §A. Adds a second singleton instance of `DirectionalBiasStore` with `mode='xstock'` semantics (sector partition + dual floor), wires the xStock scanner to compute real per-pair DBS pre-cycle and thread it through MCE, replacing the prior synthesized-neutral fallback that left the regime classifier with no directional signal on xStocks.

### Component

- **Class**: `DirectionalBiasStore` in `server/core/metrics/directional-bias-store.ts` (extended; ~150 lines added for B-PHASE-A2)
- **Crypto singleton** (unchanged surface): `export const directionalBiasStore` — constructed with `{mode: 'crypto', assetClassForKnobs: 'crypto_spot'}`
- **xStock singleton** (NEW): `export const xstockDirectionalBiasStore` — constructed with `{mode: 'xstock', assetClassForKnobs: 'xstock_spot'}`
- **Convenience accessors**: `getLatestGlobalDbsSnapshot()` (crypto, unchanged) + `getLatestXstockGlobalDbsSnapshot()` (NEW)
- **Scanner pre-cycle compute**: `server/asset_classes/xstock_spot/scanner.ts` — pre-cycle block before eval loop (mirrors `fx5-scanner.ts:1098-1118`)
- **Eval-cycle threading**: `server/asset_classes/xstock_spot/eval-cycle.ts:265` — `evaluateXstockPairForVTS` signature gains `propagatedDbs?` param; threads to MCE at line 327
- **Backfill table**: `xstock_dbs_backfill` (component-aware schema; created by `2026-05-17-b-phase-a2-dbs-backfill-table.sql`)
- **Backfill script**: `scripts/b-phase-a2-backfill.ts` (npm script `b-phase-a2:backfill`)

### Upstream dependencies

- **`XSTOCK_SPOT_REGISTRY`** in `shared/asset-classes.ts` — every entry MUST have a `sector: XstockSector` field (TypeScript-required after B-PHASE-A2). 14 valid values: 11 GICS sectors (XLK / XLE / XLV / XLF / XLI / XLP / XLY / XLU / XLB / XLRE / XLC) + 3 special buckets (INDEX_PROXY / BROAD_ETF / INTL_ETF). Optional `adr?` + `cryptoAdjacent?` flags (Phase E factor work consumes).
- **`module_constants.dbs_calculation.*`** with `asset_class='xstock_spot'` — 8 explicit rows seeded by `2026-05-17-b-phase-a2-dbs-xstock-constants.sql`: `min_sample_count`=30, `sector_coverage_floor`=7 (NEW knob, xStock-only), plus 6 byte-identical-to-crypto component weights/periods (slope_weight, return_weight, ema_weight, lookback_period, ema_fast_period, ema_slow_period). Crypto wildcard rows untouched.
- **`xstockOhlcCache.getOHLCDataBatch(symbols, 60)`** in `server/services/xstock-ohlc-cache.ts` — supplies 60-minute aggregated OHLC bars (default interval=60) to the scanner pre-cycle compute. Already operational pre-B-PHASE-A2.
- **`computeDirectionalBias(ohlc, atr)`** in `server/core/metrics/directional-bias.ts` — shared math primitive; byte-identical between crypto and xStock (no fork).
- **`computeGlobalDirectionalBias(...)`** — shared aggregator; volume-weighted median; filtered by sentinel-flags; reused as-is.

### Downstream consumers

- **MCE `computeContext` non-crypto branch** (`server/services/market-context-engine.ts:889-916`) — reads `propagatedDbs` directly, builds `directionalBias` from real values when supplied (replaces synthesized-neutral fallback). Then `dbsSlope` (line 973) + regime classifier (line 974) + phase store (line 997) + `MarketContext` attachment (line 1048) all consume the real value end-to-end.
- **`calculatePairRegime`** in `server/core/metrics/market-regime.ts:209-289` — gates RBS (`|DBS| < 0.10`), admits TFS Path-B (`|DBS| >= 0.30`), admits IE (`|DBS| >= 0.50 + vol`). XSTOCK-suffixed threshold dispatch already exists from B79.0m.b (`market-regime.ts:227-249`). Once real DBS flows, these thresholds are exercised for real (today they're exercised against synthesized 0).
- **Phase store `regimePhaseStore.tick()`** in `server/core/metrics/regime-phase.ts` — cold-pair age inference reads `dbsScore` for backfill. Phase backfill accuracy improves for xStocks post-A.2.
- **B68.5 Path-B sustainability gate** — previously dead-code on xStocks (synth=0 never satisfied `|DBS| >= 0.30`); becomes ACTIVE for xStocks post-A.2.
- **`computeBiasConfidenceModifier`** — universe-agnostic; downstream consumers (RTB, SQE, ranking-weights, drift-dashboard) pick up real categories automatically.
- **A.3 verification queries (future)** + **Phase B calibration replay (future)** — both read `xstock_dbs_backfill` for component-level distribution analysis.

> **B.4 foundation UPDATE (2026-06-04):** the xStock substrate switched 60-min → 15-min bars (see the "Recent Additions (B.4 foundation ...)" section above). The xStock DBS config is now per-class `module_constants` (lookback 48→192, ema_fast 12→48, ema_slow 26→104, atr_period 14→56), and `xstock_dbs_backfill` was RECOMPUTED at 15m (31,481 old 60-min rows archived to NEW `xstock_dbs_backfill_60m_archive`, 332,176 new per-bar 15-min rows inserted, each stamped `bar_interval_minutes=15`). Crypto DBS still uses the in-code `DEFAULT_DBS_CONFIG` (Langston Option B, xStock-only — separate scanner functions; crypto→module_constants migration deferred, RUNNING_ISSUES #200). The "consider regenerating `xstock_dbs_backfill`" modification-risk below was exactly the action B.4 took.

### Blast radius

- **Crypto path**: ZERO. `directionalBiasStore` singleton keeps 4-arg `updatePair` signature and identical `publishSnapshot()` behavior (mode='crypto' branch is the pre-B-PHASE-A2 behavior). All 5 crypto-side consumer sites (market-indicators, drift-dashboard-aggregator x3, MCE x2 + 1 publish) read the same singleton with the same call signature. Pre-audit code-level audit verified zero crypto regression.
- **xStock entry side**: NOT GATED. Scanner pre-cycle DBS compute precedes the eval loop. Pairs with insufficient OHLC / ATR=0 / sector missing get `dbsBySymbol.get(symbol) === undefined`, which threads as `undefined` to MCE → synthesized neutral (preserves pre-A.2 behavior for thin pairs). Graceful degrade.
- **xStock exit side**: not affected by A.2 directly (TEC discontinuity detector from B-NEW-42b handles exit-side gating). A.2 affects entry decisions via regime classifier consuming real DBS.

### Key invariants

- **Mirror invariant**: DBS component weights (0.40 slope / 0.35 return / 0.25 ema), lookback (48 bars), EMA periods (12/26), category thresholds (UP_STRONG 0.60 etc), confidence modifier ranges all byte-identical to crypto. **No pre-emptive equity-tune.** Retune is post-A.3 evidence-gated per v2 plan §A.2.
- **Dual floor for xstock publish**: BOTH must clear — global ≥ `min_sample_count` (30) AND ≥ `sector_coverage_floor` (7) distinct GICS sectors with ≥1 non-sentinel entry each. Either failing → 5-row behavior spec applies (stale-prior or null).
- **GICS-only + non-sentinel counting**: only entries with `sector ∈ (XLK..XLC)` and `sentinelZero === false` count toward xstock floor. INDEX_PROXY / BROAD_ETF / INTL_ETF stored for own-use (their own eval-cycle reads back their own score) but excluded from floor count AND from weighted-median aggregation. Sentinel entries (ATR=0 / insufficient OHLC) don't count toward floor (stricter than crypto's mode='crypto' branch — see RUNNING_ISSUES #114).
- **Constructor-option discriminator**: `mode: 'crypto' | 'xstock'` is the single source of truth for behavioral branching in `publishSnapshot()`. Subclassing rejected per Langston Step 1 R4. Adding asset class 3 would add a third `mode` literal + branch (or refactor to registry-of-stores, ~15min).
- **Sector field REQUIRED on every registry entry**: TypeScript compile-fail on any future entry missing sector. Companion `xstock_sector_mappings_reference.md` documents rationale for high-judgment cases (GOOGL→XLC post-2018, AMZN→XLY despite AWS, MSTR→XLK + cryptoAdjacent, etc.).

### Modification risks ("things that break if X changes")

- **Change `DirectionalBiasStore` constructor signature** → both `directionalBiasStore` and `xstockDirectionalBiasStore` singleton-export sites must update. Existing test mocks reference singleton symbols by name (e.g. `b63-item16-dbs-store.test.ts`); rename the symbols at your peril.
- **Change `publishSnapshot()` mode-branch behavior** → cascades to: market-indicators isStale semantics, drift-dashboard-aggregator freshness filters, A.3 verification logic, Phase B calibration replay assumptions. Update System Manual §"Phase 14 — DBS extension to xStocks" + this SIM entry.
- **Add a new sector tag to `XstockSector` union** → must update GICS_SECTORS set in store (if it should count toward floor), the 265-entry registry (TypeScript compile-time enforced for new entries; existing entries unaffected), and the companion reference doc.
- **Change DBS component weights or lookback** → POST-A.3 only, evidence-gated. Touches `module_constants` for both `asset_class='*'` (crypto wildcard) AND `asset_class='xstock_spot'` rows. Cascades to all backfill data interpretations (consider regenerating xstock_dbs_backfill).
- **Remove `getCachedNumberRequired` calls in store** → silent-fallback regression (Langston Step 4 BLOCKER fix). CLAUDE.md §8 #10 violation. Restore loud-fail semantics.
- **Drop `sector?` field from `PairStoreEntry`** → mode='xstock' partition filter breaks; aggregation runs over INDEX_PROXY/BROAD_ETF/INTL_ETF entries; weighted-median degenerates.
- **Backfill table schema change** → `xstock_dbs_backfill` PK `(symbol, ts)` + sector/ts indexes assumed by A.3 verification queries + Phase B calibration replay. Migrate carefully; backfill script is idempotent ON CONFLICT DO NOTHING.

### Telemetry

- `[B-PHASE-A2][CYCLE_DBS_TIMING] tick=N dbs_compute_ms=M pairs_with_dbs=K universe=U` — per-cycle (every 30s during ARCA-open / 24/7-only-open windows).
- `[B-PHASE-A2][FIRST_FLOOR_CLEAR] tick=N pairs=K global_dbs=X.XXX category=Y` — one-shot per session (resets to false on PM2 restart).
- `[B-PHASE-A2][SECTOR_MISSING] symbol=...` — defense-in-depth warn for symbols not in registry (should never fire post-A.2; TypeScript-required).
- `[GlobalDBS-xstock][coldStart|degradedCoverage|noSnapshot|invalidCompute]` — 5-row behavior spec logs with `-xstock` suffix differentiating from crypto's `[GlobalDBS]`.

### Cross-references

- Design rev2 (LOCKED): `Claude Comms and Packages/Langston Design Asks/B_PHASE_A1_DBS_design_ask_rev2.md`
- Sector taxonomy reference doc (Langston spot-check ACK'd): `Claude Comms and Packages/Langston Design Asks/xstock_sector_mappings_reference.md`
- Scope rev2: `Claude Comms and Packages/Scope Files/B_PHASE_A2_DBS_SCOPE.md`
- Pre-audit rev2 (code-level deepened): `Claude Comms and Packages/Scope Files/B_PHASE_A2_DBS_PRE_AUDIT.md`
- Step 4 code review dispatch: `Claude Comms and Packages/Langston Design Asks/B_PHASE_A2_step4_code_review.md`
- Step 8 verification dispatch: `Claude Comms and Packages/Langston Design Asks/B_PHASE_A2_step8_verification.md`
- Completion report: `Claude Comms and Packages/Batch Completion/B_PHASE_A2_COMPLETION_REPORT.md`
- CHANGES_AND_FIXES `ENHANCE-2026-05-17-A` — fix entry
- RUNNING_ISSUES #114 (crypto sentinel-counting asymmetry, low-severity future hardening) + #115 (Langston Step 8 discovery — crypto wildcard rows sparseness, Tier 3 cleanup)
- B-PHASE-E-PRE-1 placeholder (SPDR offline-feed integration; queued from §3.3 11/11-missing escalation) in MULTI_ASSET_VTS_EXPANSION_PLAN + XSTOCK_CALIBRATION_PLAN Phase E sections

---

## B79.0n.STRATEGY (2026-05-24) — Per-asset-class strategy plumbing additions

Sub-batch 5 of 18 in the B79.0n umbrella v4 arc. Implementation commit `af99bd5` then `85ea78e` (Step 5 hotfix-2); CI all-4-green at run 26347883994; staging deployed at 85ea78e on 2026-05-24 around 00:55Z.

### Components touched (high-level)

- `_SE_KEY` factory at `server/services/strategy-engine.ts:23` — REQUIRED `assetClass: AssetClass` parameter (was wildcard). HIGH blast radius — every strategy detect resolves through this factory.
- 19 detect methods on `StrategyEngine` class + 10 file-based detect functions in `server/strategies/*.ts` — REQUIRED `assetClass` on every signature. HIGH blast radius.
- `callStrategyDetect` dispatcher at `server/services/vts-runner.ts:821-899` — symbol+assetClass promoted optional to REQUIRED. B79.0j fail-safe at lines 888-892 removed. HIGH blast radius.
- Caller surface — 7 files / 66 calls: signal-orchestrator (18) + vts-runner internal (1) + xstock_spot/eval-cycle (1) + routes.ts (12) + stage-b-validator (8) + strategy-validator (4) + historic-signal-generator (3) + paper-sim-diagnostic (3). Production callers thread cycle-resolved assetClass; legacy/diagnostic callers thread crypto_spot as const.
- `bridge/canonical/mapping-regime-strategy.json` schema — v2.0.0 (flat) to v3.0.0 (nested byAssetClass). Crypto subtree byte-identical to v2.0.0; xStock subtree = crypto minus defensive_hedge + add orb to TFS+IE. HIGH blast radius (consumed by strategy-mapper + sync-canonical-bridge + drift-detector + Mapping Drift UI).
- `server/core/strategy-mapper.ts` (Directive 11.4H.6G) — getFavoredStrategiesForRegime + getFavoredSignalTypesForRegime + getCanonicalRegimes all REQUIRE assetClass. NEW getCanonicalAssetClasses. HARD-FAIL on unknown asset class. HIGH blast radius.
- `server/utils/validate-canonical.ts` — per-(assetClass, regime) tuple iteration. LOW blast radius.
- `server/services/strategy-sync.ts` — CORE_STRATEGIES expanded 17 to 19 (added strong_bull_trend + orb). Per-asset-class outer loop adds SYNC_ASSET_CLASSES iteration. MEDIUM blast radius.
- `shared/schema.ts` `strategy_settings` + `strategy_settings_audit` tables — added asset_class column (NOT NULL after crypto_spot backfill); UNIQUE swapped. Schema migration `2026-05-24-b79-0n-strategy-per-class.sql`. HIGH blast radius.
- `shared/schema.ts` `strategyTypeEnum` — extended with orb. Separate migration `2026-05-24a-b79-0n-strategy-enum-orb.sql` runs first per MANIFEST.txt order. MEDIUM blast radius.
- `server/services/hybrid-integration.ts` `selectHybridStrategy` — BUG-007 closure: legacy taxonomy replaced with canonical hybrid keys via pattern-to-hybrid map + quant_fallback marker. MEDIUM blast radius.
- `server/types.ts` `HybridStrategyType` — union changed from legacy to canonical hybrid keys. LOW blast radius.
- `server/config/canonical-regime-strategy-map.ts` `STRATEGIES` const — was 17 entries; now 19 (RISK-014 closure). LOW blast radius.
- `server/strategies/inside-bar-reversal.ts` — SELL dead-code branches removed (TS2367 surfaced). LOW blast radius.
- `module_constants.strategy_gates.xstock_spot.<strategy>.enabled` rows — 18 NEW rows seeded. LOW blast radius.
- `module_constants.strategy.<name>.*` rows — ZERO changes (F-1 lever audit outcome). NONE blast radius.

### If I Change X, Check Y — B79.0n.STRATEGY additions

- If you change `_SE_KEY` factory in strategy-engine.ts then all 14 in-class `_SE_KEY` call sites + 10 file-based getCachedNumbersForModule resolver-key sites + every caller of every detect method (all 66 sites across 7 files) MUST update in same atomic commit. TS compile gate enforces.
- If you change a strategy REQUIRED-assetClass signature then the 7 caller files MUST all update. TS compile gate enforces.
- If you add a new strategy then (i) STRATEGY_DISPLAY_NAMES + STRATEGIES const + STRATEGY_FAMILY_MAP in canonical-regime-strategy-map.ts; (ii) CORE_STRATEGIES in strategy-sync.ts; (iii) callStrategyDetect switch in vts-runner.ts; (iv) signal-orchestrator dispatch block; (v) module_constants.strategy.<name>.* rows; (vi) module_constants.strategy_gates.<class>.<name>.enabled rows per class; (vii) strategy_settings rows via sync; (viii) detect method on StrategyEngine class with REQUIRED assetClass; (ix) strategyTypeEnum in shared/schema.ts + matching ALTER TYPE migration; (x) per-class entry in mapping-regime-strategy.json byAssetClass for every asset class.
- If you change selectHybridStrategy taxonomy then check downstream HybridSignal.hybridStrategy consumers (telemetry + UI display). Pre-batch B79.0n.STRATEGY verified no programmatic string-compare consumers.
- If you change mapping-regime-strategy.json shape then sync-canonical-bridge.ts + drift-detector + Mapping Drift UI tab + any consumer of getFavoredStrategiesForRegime must handle the shape.
- If you change strategy_settings schema then storage.ts methods + strategy-sync.ts + UI strategy-toggle.
- If you flip a module_constants.strategy_gates.xstock_spot.<strategy>.enabled value then UPDATE the row via psql; cached sync API picks up on next 60s refresh tick; no restart needed.

### Strategy count after B79.0n.STRATEGY

- Total canonical strategies: 19 (was 17 pre-batch; +2 = strong_bull_trend from B63 + orb from B79.0d).
- Composition: 9 in-class quant detect methods in strategy-engine.ts + 10 file-based detect functions in server/strategies/.
- SSOT: STRATEGY_DISPLAY_NAMES in canonical-regime-strategy-map.ts lines 384-406.
- xStock-enabled subset: 10 strategies per XSTOCK_SPOT_ENABLED_STRATEGIES set; 9 currently enabled=true on staging (ORB disabled per B-NEW-34).

---

## Recent Additions (B79.0n.PATTERN-DETECT — REQUIRED-assetClass on pattern-recognition layer + xstock pattern-pool gate naming convergence + vts-runner capture-and-reuse, 2026-05-24)

**Sub-batch 6 of 18 in the B79.0n umbrella v4 arc.** Pattern-recognition layer per-class plumbing — closes silent-crypto-fallback at every entry point UPSTREAM of B79.0n.STRATEGY's per-class detect plumbing.

### Components modified

- **Pattern Recognizer** (`server/services/pattern-recognizer.ts`, Directive 10.2 LOCKED) — TypeScript REQUIRED `assetClass: AssetClass` on `scanPatterns(candles, symbol, assetClass)` + all 6 internal detect functions (`detectPinbar`, `detectEngulfing`, `detectInsideBar`, `detectThreeSoldiers`, `detectMorningStar`, `detectABCD`) + `patternToTradeSignal(pattern, currentPrice, atr, assetClass)` + `PatternRecognizerService` class methods. Body branching NONE — all 11 hardcoded crypto-tuned thresholds (PINBAR wick 1.5×, INSIDE_BAR tolerance 0.001, THREE_SOLDIERS opens-in-prev-body 0.0025, MORNING_STAR body/range 0.3 + doji 0.3, ABCD Fib 0.350-0.820 + min candles 12, ATR multipliers 1.5×/2.5×) preserved byte-identical for crypto. Plumbing-only; per-class numeric tuning deferred to Layer-3 batch when xStock shadow-mode evidence accumulates. Blast radius: MEDIUM (5 production caller sites threaded — orchestrator x4, vts-runner x3, xstock eval-cycle x1 + 1 diagnostic + 3 test files).
- **`selectContextAwareStrategy`** (`server/config/canonical-regime-strategy-map.ts:637`) — added REQUIRED `assetClass: AssetClass` as 4th parameter (was 3-arg with optional symbolHash). Body UNCHANGED — still operates on `CANONICAL_REGIME_STRATEGY_MAP[regime]`. Future SCORING / ORCHESTRATOR batch may refactor body to route through v3.0.0 byAssetClass `getFavoredStrategiesForRegime(regime, assetClass)`; that refactor is OUT of PATTERN-DETECT scope per R-2(A) decision. Blast radius: LOW (2 callers: vts-runner.ts:982 + diagnostic-11.4G.ts:188).
- **`crypto_spot/pattern-pool-filters.ts:76` AssetClass type unification** — replaced `export type AssetClass = 'crypto_spot'` narrow literal (which shadowed the canonical shared type and gave consumers like `active-filter-pool.ts:24` a crypto-only guarantee) with `export type { AssetClass } from '@shared/asset-classes'` re-export. Ripple verified: `active-filter-pool.ts:24` now receives the full multi-class union for free. Blast radius: MEDIUM (TypeScript-only, no runtime change).
- **`xstock_spot/pattern-pool-filters.ts` file rewrite** — pre-batch was 44-line constants-only leaf with hardcoded TS literals (`XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR = 0.45` + `XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT = 0.50` + `Object.freeze({...})`). Post-batch is 108-line getter-shape mirroring crypto's `Object.defineProperty` pattern: `XSTOCK_PATTERN_POOL_THRESHOLDS` (`RSI_MIN` / `RSI_MAX` getters) + `XSTOCK_PATTERN_POOL_GUARDRAILS` (`FINAL_SCORE_FLOOR` / `MAX_POSITION_PCT` getters) all reading via `getCachedNumberRequired('pattern_pool_gates', 'pattern_*', _PATTERN_KEY)` with `_PATTERN_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: 'pattern', regime: '*' }`. Legacy literal exports preserved as `@deprecated` shim (Step 2 §-0 grep confirmed zero importers; Phase 16 removal via RUNNING_ISSUES #136(u)). Blast radius: LOW (zero pre-batch importers).
- **DB rows: `module_constants.pattern_pool_gates.xstock_spot.*` naming convergence** — migration `2026-05-24b-b79-0n-pattern-detect-naming-converge.sql` (BEGIN/COMMIT atomic, idempotent UPDATE 0-rows + ON CONFLICT DO NOTHING). Renamed `final_score_floor → pattern_final_score_min` (preserves value 0.45) + `max_position_pct → pattern_max_position_pct` (preserves value 0.50). Seeded 2 NEW rows: `pattern_rsi_min=15` + `pattern_rsi_max=85` (cloned from crypto defaults per Q-C(a)). Closes F-2 lever naming drift bug (same semantic levers were named differently across asset classes — per-class scoping belongs on `asset_class` column, not `constant_name` column). Paired rollback at `-rollback.sql`. Verified post-deploy: 4 rows updated_by='B79.0n.PATTERN-DETECT_naming_converge' + 2 rows updated_by='B79.0n.PATTERN-DETECT_clone_crypto_default'. Crypto rows UNCHANGED (still updated_by='b72-step3-commit-b' at 2026-05-05). Closes **BUG-008** per CHANGES_AND_FIXES.
- **vts-runner.ts capture-and-reuse refactor (Step 9 iteration)** — Langston Step 8 flagged a pre-existing fail-hard throw at H/USD (B79.0n.MCE-era `resolveAssetClass(symbol, 'kraken')` call at `vts-runner.ts:913` throws on B69-unregistered symbols, ~1 occurrence per 15 min). PATTERN-DETECT's 4 new resolveAssetClass call sites were architecturally shadowed by that pre-existing throw. Capture-and-reuse refactor at 2 scopes: `generatePhase10Signal` captures `_assetClass = safeResolveAssetClass(symbol, 'kraken')` once at function entry — null → return null (skip pair cleanly); reused for MCE call (was line 913), my scanPatterns (was 944), my selectContextAwareStrategy (was 977). Outer `for (const pair of pairs)` loop captures `_pairAssetClass` once at iteration entry; reused for MCE (was 3226), my outer scanPatterns (was 3262), my inner scanPatterns (was 3325). 6 throwing call sites consolidated to 2 capture calls. H/USD-style throws ELIMINATED post-iteration (0 stack-trace lines vs 3 in equivalent pre-iteration window). COLLISION_RESOLVE WARN amplification for DASH/SUI reduced ~33% (54/min → 36/min). Closes **ANOMALY-PROD-2026-05-24** per CHANGES_AND_FIXES.

### Phase 19 follow-up (out of PATTERN-DETECT scope)

- vts-runner.ts has 10+ OTHER pre-existing throwing `resolveAssetClass(...)` call sites (lines 1175, 1451, 1591, 1761, 1797, 1838, 1874, 3499, 3587) from B79.0n.MCE era. Same `safeResolveAssetClass` + skip-on-null pattern applies but exceeds PATTERN-DETECT "modest shrink" classification. RUNNING_ISSUES #139 entry filed for Phase 19 cleanup batch.

### Phase 16 register additions (RUNNING_ISSUES #136 r/s/t/u)

- **(r)** `PATTERN_POOL_STRATEGIES` const (crypto_spot/pattern-pool-filters.ts:53-64) — 8-strategy hardcoded list (3 pattern + 5 hybrid). Removed from vts-runner Batch 19G HF1; only routes.ts diagnostic endpoint + signal-orchestrator unused import remain. Superseded by STRATEGY's v3.0.0 byAssetClass JSON.
- **(s)** `PATTERN_POOL_THRESHOLDS` const — same file. Removed from fx5-scanner B54 Fix 4; only routes.ts diagnostic remains.
- **(t)** `pattern-recognition.ts` preloader (Directive 11.0E.1) — 66-line stub `setTimeout(100)` no-op + flag-set. Only consumer: boot_orchestrator + 1 test assertion. Phase 16 removal.
- **(u)** `xstock_spot/pattern-pool-filters.ts` deprecated literal exports (`XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR`, `XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT`, `XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS`) — kept as @deprecated belt-and-suspenders shim with zero importers; Phase 16 deletion.

### "If I Change X, Check Y" additions (B79.0n.PATTERN-DETECT)

- If you change `scanPatterns()` signature then all 8 production caller sites (4 sig-orch + 3 vts-runner + 1 xstock eval-cycle) + 1 diagnostic + 3 test files MUST update. TS compile gate enforces.
- If you change `patternToTradeSignal()` signature then class wrapper at `PatternRecognizerService` + 2 test assertions update. Only orphan-style consumer today (no production callers outside test).
- If you change one of the 11 hardcoded detect-function thresholds then crypto regression follows immediately (no module_constants resolver fronts them today). Future Layer-3 batch migrates these to `module_constants.pattern_pool_gates.<class>.<param>` resolver.
- If you change `selectContextAwareStrategy` signature then vts-runner.ts:982 + diagnostic-11.4G.ts:188 callers update. Body change risks crypto byte-identity — must include byte-identity regression test.
- If you change `module_constants.pattern_pool_gates.<class>.*` row names then BOTH the getter file (`<class>/pattern-pool-filters.ts`) AND any string-literal consumer of `getCachedNumberRequired('pattern_pool_gates', '<name>', ...)` must update in same batch.
- If you flip a `module_constants.pattern_pool_gates.xstock_spot.*` value then UPDATE the row via psql; cached resolver picks up on next 60s tick.
- If you add a new resolveAssetClass call site to vts-runner.ts use the capture-and-reuse pattern (read once at function/loop entry into a local `_assetClass`, reuse; null → skip pair cleanly via safeResolveAssetClass) — do NOT re-resolve at every consumer call (amplifies COLLISION_RESOLVE WARNs and creates new throw sites for unregistered symbols).

### F-1 lever audit confirmation (PATTERN_TO_CANONICAL + normalizePatternToCanonical)

- `PATTERN_TO_CANONICAL` map at `canonical-regime-strategy-map.ts:602-614` is CLASS-INVARIANT BY CONSTRUCTION. A PINBAR is a PINBAR regardless of asset class. F-1 invariance regression-locked via `b79-0n-pattern-detect-f1-invariance.test.ts`.
- `normalizePatternToCanonical` has no `assetClass` parameter and MUST NOT have one in the future.
- `CANONICAL_PATTERN_TYPES` exact-shape regression test locks the 6 types + null union.

---

## Recent Additions (B79.0n.SCORING + B79.0n.TEC, 2026-05-26)

### B79.0n.SCORING — SQE per-class threshold extension + predictive-confidence per-class cache key

**Subsystem:** Signal Quality Evaluator (SQE) — gate authority between Signal Orchestrator output and RTB queue entry.

- **`server/core/filters/signal_quality_evaluator.ts`** — `getSQEThresholdsFromConfig(mode, assetClass)` Layer 2 (`module_constants 'sqe_config'`) extended per-class (was wildcard-only pre-B79.0n.SCORING). New `getSQEStaticMirrorFallbackStats()` observability accessor + `_b79nScoringStaticMirrorFallbackCount` counter increments when `getSQEModuleDefaults()` catch handler fires (cache cold-start). SQE_EVAL log line at lines 354 + 458 now includes `assetClass=`, `thresholdFinalScoreMin=`, `thresholdRegimeWeightMin=` tags (R-5 schema; runtime dormant-test).
- **`server/core/utils/score-calculator.ts`** — `getPredictiveConfidence` signature changed from `(symbol, regime, strategy)` → `(assetClass: AssetClass, symbol, regime, strategy)`. Cache key extended from `${regime}:${strategy}` → `${assetClass}:${regime}:${strategy}`. F-2 fix per pre-audit §2.5: cross-class telemetry contamination (xstock + crypto VTS telemetry winRate collapsing to same cache slot) eliminated by per-class cache isolation. 3 callers threaded.

**Migration 1 (2026-05-26-b79-0n-scoring-perclass-seed.sql):** 8 new rows = 4 perp coverage for B79.0a-promoted `min_final_score`/`min_regime_weight` + 4 crypto_spot promotion of `adx_min/di_min_quant/di_min_pattern/momentum_min` (values verbatim per Langston D-4: 25/25/10/0.005). **B79.0n.SCORING.b** queued for Migration 2 (EXISTS-gated wildcard `DELETE` for `min_final_score` + `min_regime_weight`) + F-1 resolver hooks for `SCORE_WEIGHTS` + `RANKING_WEIGHTS` (Day-1 no-op surfaces).

**Blast radius:** CRITICAL — SQE is the final gate between signal generation and RTB queue. Predictive-confidence cache feeds the ROI gate (SQE) + RTB cost-aware ranking.

### B79.0n.TEC — All-keys per-class config + tec-evaluator consolidation + comment chronology fix

**Subsystem:** Trailing Exit Controller (TEC) — break-even latch + target lock + moonbag/ladder logic.

- **`server/services/trailing-exit-controller.ts`** — `refreshTECConfigForClass(assetClass)` extended per-class coverage from 1 key (`break_even_enabled` HARD-FAIL kill-switch) to 11 keys via `ALL_TEC_KEYS` SSOT. Kill-switch HARD-FAIL preserved on `break_even_enabled` via `hasExplicitAssetClassRow`. Other 10 keys SOFTENED from initially-drafted strict `requireKey<T>` throw back to observable `pick(key, TEC_DEFAULTS.x)` with per-key `[B79.0n.TEC][PICK_FALLBACK]` counter via `getTECPickFallbackStats()` (Langston ACK Option A — 7 test fixtures use mocked-db pattern incompatible with strict throw). `TEC_DEFAULTS` demoted to type-template-only at runtime (comment flag). Line 107 comment chronology updated with full citation of Kyle 2026-05-21 `disable-xstock-be` directive (D-1 root cause via DB probe).
- **`server/services/tec-evaluator.ts`** — `resolveTECConstants(context)` consolidated from async `getModuleConstants` round-trip + silent `catch → DEFAULTS` fallback to SYNC `resolveTECConfig(context.assetClass)` per-class cache lookup. Eliminates duplicate DB round-trip per exit-cycle + silent DEFAULTS fallback (anti-pattern). `evaluateTECExit` caller drops `await`. `getModuleConstants` import removed.

**Migration 1 (2026-05-26-b79-0n-tec-perclass-seed.sql):** 32 new rows (8 perp coverage for 4 hot keys + 24 moonbag/persistence × 4 active classes) + idempotent A.2 backfill block (8 spot rows) for CI's fresh-DB baseline. `moonbag_qualifying_strategies = []` ALL CLASSES per Kyle 2026-05-05 variant-K alignment.

**Migration 2 (2026-05-26-b79-0n-tec-wildcard-retire.sql):** EXISTS-gated `DELETE` for all 11 TEC keys. Single-batch confirmed safe via Langston D-4 pre-audit grep (zero consumers reading `assetClass='*'` directly).

### P19-B1 (2026-06-13) — TEC.b strict restore SHIPPED + test-infrastructure parity (supersedes the "SOFTENED" state above)

**Subsystem:** TEC config resolution + test infrastructure.

- **`server/services/trailing-exit-controller.ts`** — the B79.0n.TEC soft `pick(key, TEC_DEFAULTS.x)` path is GONE: all 11 keys now strict `requireKey<T>` (throws `[B79.0n.TEC.b][TEC_MISSING_KEY]` naming module/class/key/remediation; refresh fails loudly, prior cached snapshot intact — fail-loud, not fail-dead mid-session). Scaffolding DELETED (`_tecPickFallbackCount`, `TEC_PICK_FALLBACK_LOG_EVERY`, `getTECPickFallbackStats`) after a zero-external-consumer sweep — **any future log/dashboard grep for `PICK_FALLBACK` will find nothing; that signal no longer exists.** `ALL_TEC_KEYS` now EXPORTED (test SSOT). `hasExplicitAssetClassRow` BE kill-switch check unchanged (stricter than requireKey — wildcard does not satisfy it). UPSTREAM: module_constants `trailing_exit` rows (11 keys × per-class/wildcard) are now BOOT-REQUIRED for all 4 active classes. DOWNSTREAM unchanged (tec-evaluator, vts-runner exit loop, paper checkExitConditions). Edit-checklist addition: **every test priming TEC must mock the FULL 11-key set** — the new `b79-0n-tec-b-strict-hardfail.test.ts` test (e) is the 12th-key fixture-parity tripwire. Known edge (#226): JSONB `null`-valued row still passes (`=== undefined` check) — pre-existing semantics, flip to `== null` at next TEC touch.
- **`scripts/db-migrate.ts`** — `URL.pathname` → `fileURLToPath` (Windows `C:\C:\` doubling fix; behavior-identical on Linux CI/staging; also fixes percent-encoded paths).
- **NEW `docker-compose.test-db.yml`** (repo root) — CI-parity local test DB (pgvector/pg17 mirror of ci.yml:65-83 + runbook header incl. `COINGECKO_API_TIER=demo`). Image tag MUST track ci.yml in the same batch if either changes.
- **Test-suite state:** bench + CI both fully green (1880/1880, 0 skipped); the 7 parked-stale skips deleted with replacement coverage verified (universe-service tests + daily discovery health check); regime-scan test hardened (path-separator normalization + g-flag lastIndex statefulness fix, guard-the-guard verified).

**B79.0n.TEC.b** queued for strict 11-key HARD-FAIL restoration via `requireKey<T>` (7-day SLA per Langston Step 4 ACK condition #1).

**Blast radius:** CRITICAL — TEC owns exit-decision authority for every paper + live trade. The kill-switch HARD-FAIL preserved on `break_even_enabled` ensures operator-flip safety; other 10 keys' counter-based observability provides 48h verify-gate evidence before strict throw restoration.

### Modification risks ("things that break if X changes")

- **Re-enable strict `requireKey<T>` throw without first updating 7 TEC test fixtures**: tests break en masse. B79.0n.TEC.b must batch the fixture refactor + strict throw together.
- **Revert `getPredictiveConfidence` to 3-arg signature (drop assetClass)**: cross-class cache contamination returns. F-2 lock test at `b79-0n-scoring-predictive-confidence-isolation.test.ts` (queued for B79.0n.SCORING.b test additions).
- **Remove SQE_EVAL `assetClass=` tag from log line**: R-5 runtime probe loses its anchor; B79.0n.SCORING.b verify-gate close depends on this tag being present at first observed fire.
- **Delete wildcard rows for `sqe_config` before B79.0n.SCORING.b 48h verify-gate close**: removes resolver-correctness safety net during the gate window. Wait until counter confirmed zero across full gate window.

### Telemetry

- `[B79.0n.SCORING][SQE_STATIC_MIRROR_FALLBACK] count=N mode=... assetClass=...` — emitted from SQE `getSQEThresholdsFromConfig` catch handler when `getSQEModuleDefaults()` throws. Verify-gate target: 0 fires across 48h post-deploy.
- `[B79.0n.TEC][PICK_FALLBACK] assetClass=... key=... count=N` — emitted from `refreshTECConfigForClass` `pick(key, fallback)` when DB row is absent for both per-class AND wildcard. Verify-gate target: 0 fires per key across 48h.
- `[11.0B][SQE_EVAL] ... assetClass=<class> thresholdFinalScoreMin=<num> thresholdRegimeWeightMin=<num> ...` — R-5 schema; runtime dormant on staging (VTS-shadow has 0 candidates passing strategy detection in current regime). First-fire trigger: regime shift OR active-trading flip at sub-batch 18.

### Cross-references

- Completion reports: `Claude Comms and Packages/Batch Completion/B79_0n_SCORING_COMPLETION_REPORT.md` + `B79_0n_TEC_COMPLETION_REPORT.md`
- Scope + Pre-audit + Change-list documents in `Claude Comms and Packages/Scope Files/` + `Change Lists/`
- Onboarding patterns: `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.15 (promote-then-retire) + §4.16 (all-keys HARD-FAIL coverage) + §4.17 (deploy-SHA verification) + §4.18 (CI initial-schema divergence)
- RUNNING_ISSUES: #85 RESOLVED (deferred-from-B79.TEC HARD-FAIL extension); #141 DEFERRED (B79.0n.TEC.b); #142 DEFERRED (B79.0n.SCORING.b); #143 DEFERRED (R-5 runtime observation); #144 OPEN (perp-activation pre-flight); #146 OPEN (deploy-SHA verification routinization).

---

## Recent additions (B79.0n.TELEMETRY — Phase 24 — 2026-05-26)

Sub-batch 10 of 18 in the B79.0n umbrella v4 arc. Step 6 deploy commit `02bad33a6`, PM2 #323 at 18:01:48Z; CI all-4-green at run `26465795903`. Completes the B79.0a per-asset-class `TelemetryAggregator` instance pattern.

**Architecture summary.** Pre-batch the factory at `server/services/asset-class-instances.ts` covered only 2 of 4 active asset classes — `crypto_spot` via the no-touch fence (returns `null` so callers fall back to the global `telemetry-aggregator.ts` singleton at the 18mo+ live disk-persist state) and `xstock_spot` via a dedicated in-memory triad. `crypto_perp` + `xstock_perp` threw. RTB's Adaptive Ratio Manager (sub-batch #11) depends on all 4 active classes having per-class telemetry instances. Sub-batch #10 extends the factory to **4-of-4 active classes** (crypto_perp + xstock_perp gain dedicated in-memory triads of their own), adds 3 new bootstrap functions, adds compile-time `assertNever` exhaustive-switch enforcement, and adds explicit `[CLASS_NOT_WIRED]` throws for the 4 reserved-future classes (`forex_spot`/`forex_perp`/`equity_spot`/`equity_perp`) from ASSET_CLASS_REGISTRY. Adds a non-arming `peekTelemetryInstance()` read export to back the new `getTelemetryInstanceStats()` accessor that serves the 48h verify-gate signal (perp `recordCount === 0` invariant — perp VTS-writer per-class threading is deferred to WIRE-IN #16).

**Variant C in-memory-only invariant.** Per Langston AGREE on scope Q1, new instances are in-memory only **by construction** — direct `new TelemetryAggregatorService()` bypasses the global singleton's `setInterval(persist, 5min)` arm because the persist-timer arming is structurally gated INSIDE `getTelemetryAggregator()` (the global-singleton accessor) **only**. Direct construction is safe by structure, not by policy — no flag-check, no opt-out path. The 3 factory-managed instances never accidentally write disk state because the persist-timer construct never fires for them.

**crypto_spot asymmetry preserved.** The 18mo+ live disk-persist state at the global singleton is untouched. Crypto_spot continues routing VTS writes through the global singleton (no-touch fence returns null → callers fall back). The 3 new factory-managed instances (crypto_perp + xstock_perp + xstock_spot) stay in-memory.

### Components touched

- **`server/services/asset-class-instances.ts`** — factory extended:
  - Added 2 new lazy caches (`crypto_perp` + `xstock_perp` private instance refs).
  - Added 2 new bootstrap functions paired with the existing `xstock_spot` triad.
  - Replaced 2-of-4 switch with `assertNever`-terminated exhaustive switch over `AssetClass` union — TypeScript compile-fails if any active or reserved-future class is missed.
  - `[CLASS_NOT_WIRED]` throws for the 4 reserved-future classes (`forex_spot`/`forex_perp`/`equity_spot`/`equity_perp`) — clearly distinct from `[CLASS_INVALID]`.
  - New `getTelemetryInstanceStats(): { crypto_spot: null | InstanceStats; crypto_perp: InstanceStats; xstock_spot: InstanceStats; xstock_perp: InstanceStats }` accessor — calls `peekTelemetryInstance(class)` for each (non-arming read), returns recordCount + lastWriteAt per non-singleton instance, null for crypto_spot.
- **`server/services/telemetry-aggregator.ts`** — new exports + per-instance observability fields:
  - `peekTelemetryInstance(class: AssetClass): TelemetryAggregatorService | null` — non-arming-read companion that returns the module-level instance reference without triggering persist-timer construction. Reusable pattern (codified ASSET_CLASS_ONBOARDING_WORKFLOW §4.19).
  - 3 new read methods + 2 new instance fields on `TelemetryAggregatorService` for per-instance observability counters (`recordCount`, `lastWriteAt`, plus `getInstanceStats()` returning the pair).
  - Persist-timer arming code path unchanged — still gated inside `getTelemetryAggregator()` so direct construction (factory-managed instances) cannot accidentally arm it.
- **`server/index.ts`** — boot pre-warm of 3 factory-managed triads (crypto_perp + xstock_perp + xstock_spot). HARD-FAIL via `process.exit(1)` if any bootstrap raises (e.g., persist-timer arming detected via assertion).
- **4 production caller-site annotations** (routes/vts-runner/market-indicators/fx5-scanner) — non-routing comment-only annotations marking which call sites flow through the global singleton vs the factory. No behavioral change; documentary intent for the WIRE-IN #16 batch when per-class VTS-writer threading lands.

### Note on §7.6 existing entry

The existing **§7.6 Telemetry Aggregator** entry remains as-is for the legacy global singleton (`server/services/telemetry-aggregator.ts`'s `getTelemetryAggregator()`). B79.0n.TELEMETRY adds a NEW per-class wrapper layer above that singleton — `server/services/asset-class-instances.ts` factory dispatch. Both are live; crypto_spot routes to the global singleton via the no-touch fence; the other 3 active classes route to the factory's in-memory triads.

### Boot pre-warm + HARD-FAIL semantics

`server/index.ts` calls `getTelemetryAggregatorInstance('crypto_perp')`, `getTelemetryAggregatorInstance('xstock_perp')`, `getTelemetryAggregatorInstance('xstock_spot')` at boot — pre-warms all 3 factory-managed triads + smoke-tests that direct construction (Variant C invariant) succeeds without persist-timer arming. If any bootstrap raises, `process.exit(1)` per Kyle NO PATCHES policy — boot does not silently degrade to no-telemetry-for-class-X.

### Disposition: TELEMETRY.b is the persistence follow-up (no SLA today)

If a non-crypto_spot active class flips to active trading and the in-memory-only telemetry state needs to persist across PM2 restarts, the follow-up sub-batch (TELEMETRY.b) parameterizes the disk-path + persist-timer infrastructure at `telemetry-aggregator.ts:1600-1602` by `assetClass`. **No SLA today** — xstock_spot + xstock_perp + crypto_perp all in dormant or VTS-shadow mode, so cross-restart persistence is not required. TELEMETRY.b opens when the first non-crypto_spot active class actually persists telemetry across restarts in live trading.

### Verify-gate signal + 48h alert

`getTelemetryInstanceStats()` accessor exposes per-instance `recordCount`. 48h verify-gate (alert `1f34cf84-a37c-425c-a1c4-54924b053061`, triggers_at 2026-05-28T18:01:48Z) checks:
- `crypto_perp.recordCount === 0` (no VTS-writer threading yet — WIRE-IN #16)
- `xstock_perp.recordCount === 0` (same)
- `xstock_spot.recordCount` — observability TBD (xstock_spot writers wired pre-TELEMETRY, but in dormant pricing window today)
- `crypto_spot.recordCount` (via global singleton, NOT factory) — invariant: continues to grow normally; no-touch-fence held

### "If I Change X, Check Y" — B79.0n.TELEMETRY additions

- If you add a new `AssetClass` enum value, the `assertNever` switch in `asset-class-instances.ts` HARD-FAILs at compile. Add a bootstrap function + dedicated triad cache OR an explicit `[CLASS_NOT_WIRED]` throw before pushing.
- If you change `peekTelemetryInstance()` to actually arm persist (defeating Variant C), the `getTelemetryInstanceStats()` accessor will accidentally trigger persist-timer construction on every read. Keep `peek*` strictly non-arming; if you need an arm-then-read API, name it `getOrCreateTelemetryInstance()` distinctly.
- If you remove a `[CLASS_NOT_WIRED]` throw without adding a real triad, asset-class onboarding silently passes through the no-touch fence pattern (returns null) and reads of the new class hit the global singleton instead of a dedicated instance. Always pair removal with a real triad + bootstrap.
- If you wire per-class VTS writers (WIRE-IN #16), `crypto_perp` + `xstock_perp` recordCount will start growing — verify-gate invariant changes from `=== 0` to `> 0` post-WIRE-IN. Update the alert assertion shape at that batch.

### Phase 24 onboarding workflow cross-reference

- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.19 codifies the per-class-instance pattern + non-arming-read companion pattern as a reusable worked example with B79.0n.TELEMETRY's `peekTelemetryInstance()` as the canonical reference implementation.

### Cross-references

- Completion report: `Claude Comms and Packages/Batch Completion/B79_0n_TELEMETRY_COMPLETION_REPORT.md`
- Scope + Pre-audit + Change-list: `Claude Comms and Packages/Scope Files/B79_0n_TELEMETRY_SCOPE.md` + `B79_0n_TELEMETRY_PRE_AUDIT.md` + `Change Lists/B79_0n_TELEMETRY_STEP3_CHANGE_LIST.md`
- RUNNING_ISSUES: #143 DEFERRED (TELEMETRY.b persistence follow-up — no SLA today); #144 OPEN (pre-existing MarketDataHealthCheck EACCES on `/home/runner` path — unrelated finding from Step 7 error-log review).

---

## Recent additions (B79.0n.RTB — Phase 24 — 2026-05-27)

Sub-batch 11 of 18 in the B79.0n umbrella v4 arc. **Combines former sub-batch #11 RTB + former #12 RTB-REFRESH** per Kyle directive 2026-05-27. Step 6 deploy commit `6fd6bcac6`, PM2 #324 at 11:10:31Z; CI all-4-green at run `26507336347` on `a4ac36c`; backfill-dotenv hotfix `6fd6bca` rebased on `a4ac36c`. Per-class queue partitioning + cadence seed batch — extends RTB queue layer + cadence to first-class per-asset-class behavior using the same `assetClass: AssetClass` discipline as the rest of the B79.0n arc.

**Architecture summary.** Pre-batch the RTB layer was global: a single `signalBuckets: Map<number, Set<string>>` (10 buckets indexed 0-9) sharded by signal-key hash, with a single `REFRESH_INTERVAL_MS = 30000` constant and a single `rtb_signals` row schema with no asset-class column. Per-class queue depth was inferable only via `metadata.assetClass` jsonb extraction at read time — slow + non-indexable + cross-class pool sizing impossible without aggregation. This batch (a) adds `rtb_signals.asset_class VARCHAR(32)` as a first-class column with backfill via 4-phase production-safe migration; (b) refactors `signalBuckets` to nested per-class structure `Map<AssetClass, Map<number, Set<string>>>` (Langston C-1 Option A — global+tagging Option B starves xstock under shared CPU pressure); (c) seeds 4 module_constants `rtb_config.refresh_interval_ms = 30000ms` rows (uniform across crypto_spot/crypto_perp/xstock_spot/xstock_perp per Kyle directive — per-class plumbing exists so xstock value can change via DB-only update later without code change); (d) preserves shared global Adaptive Concurrency Tuner (ACT pool 3-10 default 5) per Langston C-2 (ACT measures process-level CPU, not asset-class metric; per-class isolation comes from Option A nested buckets, not from ACT split); (e) retires legacy `rtb_queue_refresher.ts` (zero production callers verified via Grep across server/client/shared).

**Caller surface 25 across 4 RTB component files (2,655 LOC total):**
- `server/core/rtb/ready_to_buy_service.ts` (1,809 LOC) — core queue + per-signal FSM refresh. Modified: `queueSQESignal` populates `assetClass: input.assetClass || 'crypto_spot'` on both `enrichedMetadata` jsonb and the new first-class column; N1 inline warn surfaces silent crypto_spot fallback. `getQueuedSignals(mode, assetClass?)` + `getRankedSignals(mode, limit, assetClass?)` gain optional asset-class filter. New `getQueueDepth(): Record<AssetClass, Record<TradingMode, number>>` per-class telemetry probe.
- `server/services/rtb-refresh-service.ts` (846 LOC) — **LOCKED-module** refactor per Kyle directive 2026-05-27 (override authorizes per-class bucket allocation + getBucketStats fix; algorithm/cadence/ACT scaler UNTOUCHED). `signalBuckets: Map<AssetClass, Map<number, Set<string>>>` nested per-class; `lastBucketAssignment: Map<string, { assetClass: AssetClass; bucketIndex: number }>` tracks per-signal assignment; `RTB_ACTIVE_CLASSES: readonly AssetClass[]` const + non-active-class warn path. `assignSignalsToBuckets` resolves assetClass from signal row column → `resolveAssetClass(symbol,'kraken')` fallback → non-active default-to-crypto_spot warn (N2 inline warn). `refreshModeSignals` aggregates per-class buckets at given index via `bucketKeysAtIndex` Set union. `getBucketStats()` bug surfaced via locked-module test (was `signalBuckets.get(i)` with number when keyed by AssetClass post-refactor) — fixed in same chunk to aggregate per-class sizes at each index.
- `server/core/rtb/tcl_watchdog.ts` — JSDoc on `checkSignalThresholdLive` documents NEW-Q1 (global count tiebreak — wait-then-promote semantics preserved) + NEW-Q2 (lock acquisition order — assetClass lock obtained AFTER mode lock per existing invariant).
- `server/core/rtb/rtb_queue_refresher.ts` — **DELETED** (zero production callers; `ReadyToBuyService.startRefreshCycle` is canonical via `PaperExecutionEngine` lifecycle). `server/index.ts` retired-comment block updated to reference the deletion.

**`_RTB_GK` wildcard resolver at 8 FSM-threshold read sites** (lines 149, 163, 186, 205, 212, 215, 218, 1090, 1458 in `ready_to_buy_service.ts`): `_RTB_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }` — all FSM thresholds class-invariant today per Langston C-8 §3.4 lock. Per-class divergence requires EXISTS-gated explicit-row evidence (e.g., xstock active-trading observability evidence) before promoting the wildcard to per-class seeds — bundled into B79.0n.OBSERVABILITY (#18) or sub-batch 18 active-trading flip.

**Schema migration (4-phase production-safe pattern, B-NEW-35 promote-then-retire precedent):**
- Phase 1 (`2026-05-27-b79-0n-rtb-phase1.sql`): `ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS asset_class VARCHAR(32) NULL` + 4 `INSERT INTO module_constants ... ON CONFLICT DO NOTHING` for refresh_interval_ms seeds + DO block fails-loud if seed count != 4.
- Phase 2 (`scripts/b79-0n-rtb-backfill-asset-class.ts`): dual-path backfill `WHERE asset_class IS NULL` — try `metadata->>'assetClass'` jsonb extraction first, fallback to `resolveAssetClass(symbol, 'kraken')` per row. Idempotent. Step 6 dotenv-import hotfix `6fd6bca` added `import 'dotenv/config'` so standalone npm script invocation loads .env.
- Phase 3 (`2026-05-27-b79-0n-rtb-phase3.sql`): precondition DO block fails-loud if any nulls remain → `ADD CONSTRAINT rtb_signals_asset_class_not_null_chk CHECK (asset_class IS NOT NULL)` + `CREATE INDEX rtb_signals_mode_asset_class_status_idx ON rtb_signals (mode, asset_class, status)` for hot per-class queue reads.
- Phase 4 (deferred): `SET NOT NULL` contingent on §6.4 48h zero-null gate.

**Boot pre-warm + HARD-FAIL semantics.** `server/index.ts` enumerates 4 active classes + cadence values at boot, calls `getModuleConstantsService().getConstant('rtb_config', { exchange: '*', assetClass, strategy: '*', regime: '*' }, 'refresh_interval_ms')` for each class, HARD-FAILs via `process.exit(1)` if any row missing. Log line: `[B79.0n.RTB][BOOT] 4-class refresh cadence loaded: crypto_spot=30000ms crypto_perp=30000ms xstock_spot=30000ms xstock_perp=30000ms`.

**Step 7 first-pass verification gates.** HTTP 200; boot pre-warm log at 11:10:31Z; HARD-FAIL gate held; retire-line `[B79.0n.RTB] rtb_queue_refresher.ts retired` at 11:10:34Z; `_migrations` ledger shows both Phase 1 + Phase 3 applied 11:09:21Z; `\d rtb_signals` confirms column + CHECK + index; 4 module_constants rows present; zero error-log hits on `fatal|uncaught|throw|asset_class.*null|B79.0n.RTB.*ERROR` grep; UI login screen renders cleanly. Backfill clean NO-OP against empty rtb_signals.

**Active-trading impact today ZERO.** paper_sim_trades + trades both empty; per-class buckets stay empty until scanner pipeline emits signals; structural pre-warm-only exercise. Active signal flow lands in WIRE-IN (#16). Per-class buckets become observable when scanner emits new SQE → RTB signals carrying assetClass.

### Components touched

- **`server/core/rtb/ready_to_buy_service.ts`** — queue accessors gain optional per-class filter; new `getQueueDepth()` per-class telemetry; queueSQESignal populates new column + jsonb metadata + N1 warn.
- **`server/services/rtb-refresh-service.ts`** — LOCKED-module override: nested per-class buckets, `RTB_ACTIVE_CLASSES` const, getBucketStats fix, `bucketKeysAtIndex` aggregation, N2 warn, shared ACT preserved.
- **`server/core/rtb/tcl_watchdog.ts`** — JSDoc documenting NEW-Q1 + NEW-Q2 decisions.
- **`server/core/rtb/rtb_queue_refresher.ts`** — DELETED (legacy file, zero callers).
- **`server/lib/event-bus.ts`** — `PromotionEvent.assetClass?: string` optional-additive field per Langston C-7.
- **`shared/schema.ts`** — `rtbSignals.assetClass = varchar('asset_class', { length: 32 })` + `modeAssetClassStatusIdx: index('rtb_signals_mode_asset_class_status_idx').on(table.mode, table.assetClass, table.status)`.
- **`server/storage.ts`** — `IStorage.getRtbSignals` filter type extended with optional `assetClass?: string`; `upsertRtbSignal` SET clause includes `assetClass: data.assetClass`.
- **`server/index.ts`** — boot pre-warm enumerates 4 active classes + cadence values + HARD-FAIL; retired-comment block at line 1329 references rtb_queue_refresher deletion.
- **`scripts/b79-0n-rtb-backfill-asset-class.ts`** — NEW ~170 LOC dual-path backfill with `import 'dotenv/config'`.
- **`drizzle/migrations/2026-05-27-b79-0n-rtb-phase1.sql`** + **`2026-05-27-b79-0n-rtb-phase3.sql`** + companion rollback files; MANIFEST.txt entries at positions 115-116.
- **`package.json`** — `b79-0n-rtb-backfill` npm script entry.
- **11 new unit test files in `server/tests/unit/`** — isolation + cadence + fsm-isolation + tcl-barrier (5-run determinism) + queue-depth + class-not-wired + locked-module + schema-legacy + schema-postcheck + promotion-event + cold-boot. 53 tests total, pass in 3.33s locally.

### Note on §4.3 existing entry

The existing **§4.3 RTB Service** entry remains accurate for the global queue surface. B79.0n.RTB extends it with per-class partitioning at every previously-global surface — column, buckets, queue-depth, cadence-rows-by-class — while preserving the global ACT pool + class-invariant FSM thresholds (`_RTB_GK` wildcard). When the §4.3 entry needs to mention asset-class behavior post-batch, refer to this Recent additions section for the architecture.

### "If I Change X, Check Y" — B79.0n.RTB additions

- If you add a new `AssetClass` to `ASSET_CLASS_REGISTRY`, the `RTB_ACTIVE_CLASSES` const in `rtb-refresh-service.ts` is the canonical "active for RTB partitioning" list. Adding to ASSET_CLASS_REGISTRY without adding to RTB_ACTIVE_CLASSES means the new class lands in the non-active-class warn path (defaults to crypto_spot). Add to both if the new class is meant to receive its own per-class bucket set.
- If you remove the `_RTB_GK` wildcard at any of the 8 FSM-threshold read sites and replace with `assetClass` parameter, you also need a per-class seed migration AND EXISTS-gated wildcard retirement (B79.0n.SCORING precedent at sub-batch #8) — single-touch breaks the class-invariant invariant currently relied on by Langston C-8.
- If you change `signalBuckets` topology (e.g., add a third nesting level), `getBucketStats()` aggregation logic + `refreshModeSignals` bucketKeysAtIndex union code must be updated together. The test `b79-0n-rtb-locked-module.test.ts` surfaced the original bug — keep its coverage when refactoring.
- If you wire scanner pipeline to actually emit signals (WIRE-IN #16), per-class bucket assignSignalsToBuckets will fire and the N2 warn path will become observable for any signal where assetClass column is null AND resolveAssetClass throws — investigate root cause rather than silently defaulting to crypto_spot.
- If you flip Phase 4 (`SET NOT NULL` on rtb_signals.asset_class), confirm zero-null gate at the 48h soak window first. The CHECK constraint already enforces NOT NULL for writes; Phase 4 is for ORM/Drizzle type-level enforcement (NOT NULL vs nullable VARCHAR).
- If you change the cadence value for any one class via `UPDATE module_constants SET value='<new>' WHERE module_name='rtb_config' AND asset_class='<class>'` (DB-only path), boot pre-warm logs will show the new value on next PM2 restart. No code change needed. Per-class divergence pathway is operationally live.

### Phase 24 onboarding workflow cross-reference

- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.20 codifies the 4-phase production-safe migration pattern (Phase 1 nullable ADD COLUMN + Phase 2 backfill script + Phase 3 CHECK + Phase 4 SET NOT NULL contingent) with B79.0n.RTB's `rtb_signals.asset_class` migration as the canonical reference implementation.
- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.21 codifies the LOCKED-module override pattern (Kyle-authorized per-class scope without algorithmic redesign) with B79.0n.RTB's `rtb-refresh-service.ts` `signalBuckets` refactor as the canonical reference implementation.

### Cross-references

- Completion report: `Claude Comms and Packages/Batch Completion/B79_0n_RTB_COMPLETION_REPORT.md`
- Scope + Pre-audit + Change-list: `Claude Comms and Packages/Scope Files/B79_0n_RTB_SCOPE.md` + `B79_0n_RTB_PRE_AUDIT.md` + `Change Lists/B79_0n_RTB_STEP3_CHANGE_LIST.md`
- Architectural synthesis (Step 1.a): `Claude Comms and Packages/Langston Design Asks/B79_0n_RTB_ARCHITECTURAL_SYNTHESIS.md`
- Step 4 R1 re-ACK + Step 8 verify dispatches: `Claude Comms and Packages/Langston Design Asks/B79_0n_RTB_STEP4_R1_REACK.md` + `B79_0n_RTB_STEP8_VERIFY.md`
- RUNNING_ISSUES: see #142 .b follow-ups for per-class cadence calibration when xstock active-trading evidence window opens.

---

## Recent additions (B79.0n.EXECUTION — Phase 24 — 2026-05-27)

Sub-batch 13 of 16 in the B79.0n umbrella v4 arc — **last per-class plumbing sub-batch before WIRE-IN (#14, Phase 19a)** per Kyle directive 2026-05-27 (proceed autonomously with Langston while he was away). Step 6 deploy commit `f283c2c`, PM2 #326 at 17:30:13Z; CI all-4-green at run `26527276989` 2m17s. **TradeClosedEvent additive assetClass + position-record SSOT cleanup + diagnostic endpoint v2 nested payload.**

**Architecture summary.** Prior batches (B79.TEC + B79.0n.STORAGE + B79.0n.CONFIDENCE-CHAIN + B79.0n.ORCHESTRATOR) absorbed most execution-layer per-class threading. What remained for EXECUTION was 3 surgical surfaces: (1) the TRADE_CLOSED event payload missing `assetClass` (so downstream consumers couldn't disambiguate same-symbol-across-classes once the structural possibility opened up post-B79.0n.RTB C-7); (2) one drift site at the outcomeFeedback hook re-resolving assetClass from symbol when the position record already carries it from entry; (3) the `/api/diagnostics/orchestrator-per-class-state` endpoint surfacing only the orchestrator layer with no execution-layer state visible.

**TradeClosedEvent additive field (CHUNK A, mirrors PromotionEvent C-7 from B79.0n.RTB).** `server/lib/event-bus.ts:24-51` adds optional `assetClass?: string` to the interface with doctrine comment. Emit site at `paper-execution-engine.ts:1545` populates `assetClass: position.assetClass` — read from the canonical SSOT (write at L2147 `createPaperSimOpenPosition` per B79.TEC Finding 2), NOT re-resolved from symbol. Canary log `[B79.0n.EXECUTION][EMIT_TRADE_CLOSED] mode=… class=… symbol=… tradeId=…` per Langston Step 2 B2 mitigation. All 3 listeners verified safe via Step 1.b A2 grep (zero JSON.stringify/structured-clone/telemetry-emit production hits): paper-execution-engine self-handler at L184-188 reads only `event.mode` filter, c13-validation-service at L103-107 pushes whole event into `session.tradeCloses` array, c14-validation-service at L123-127 identical to c13. Zero handler breakage. Same C-7 doctrine: consumers that need to disambiguate read this field, consumers that don't are unaffected.

**Position-record SSOT cleanup (CHUNK B).** `paper-execution-engine.ts:1376` outcomeFeedback hook switches from `safeResolveAssetClass(position.symbol, 'kraken')` re-resolve to `position.assetClass ?? safeResolveAssetClass(position.symbol, 'kraken')` belt-and-suspenders fallback. Per Langston Step 2 B2 reframe: the fallback is **defensive, NOT load-bearing** — line 922 B79.TEC NO_FALLBACK hard-fails on a position missing assetClass BEFORE flow reaches L1376, so the `??` short-circuits to record-read on the happy path and the fallback locks safe behavior against future caller paths that might bypass L922 invariants. Zero runtime cost on happy path. Comment annotates the SSOT discipline + Langston reframe inline.

**Diagnostic endpoint v2 nested-by-layer (CHUNK C).** `/api/diagnostics/orchestrator-per-class-state` URL retained per Langston Q3 ACK (continuity over misleading-URL cost; zero callers verified across client/server/scripts via Step 1.b A6 thorough grep, found ONLY in server/routes.ts definition site). Payload restructured to:

```jsonc
{
  "ts": "...",
  "batch": "B79.0n.ORCHESTRATOR+EXECUTION",
  "orchestrator": { /* crypto_spot, xstock_spot guardrails; perp CLASS_NOT_WIRED */ },
  "execution": {
    "crypto_spot": { "openPositions": 0, "recentCloses24h": 0, "feePercent": 0.26, "slippagePercent": 0.05 },
    "xstock_spot": { "openPositions": 0, "recentCloses24h": 0, "feePercent": 0.26, "slippagePercent": 0.05 },
    "crypto_perp": { "status": "CLASS_NOT_WIRED" },
    "xstock_perp": { "status": "CLASS_NOT_WIRED" }
  },
  "_meta": {
    "schemaVersion": 2,
    "coverage": ["orchestrator", "execution"],
    "lastReviewed": "2026-05-27",
    "knownGaps": [
      "fee/slippage dispatch is class-member wildcard (paper-execution-engine.ts:126-127); per-class dispatch deferred to Phase 25/26 calibration",
      "sizing-core risk-pct/max-position-pct mode-keyed not class-keyed (paper-position-sizing.ts:141-180); deferred to Phase 25/26",
      "narrative-feed TRADE_OPENED/TRADE_CLOSED payload lacks assetClass; dormant — re-review at narrative-feed activation or annual audit"
    ]
  }
}
```

Execution-layer compute reads `storage.getPaperSimOpenPositions('paper')` + `storage.getPaperSimTrades('paper', { closedOnly: true, limit: 500 })` then JS-filters for 24h cutoff. Fee/slippage values sourced from `server/config/exchange-defaults.ts` (`DEFAULT_TAKER_FEE` + `DEFAULT_SLIPPAGE`) — same wildcard the engine itself uses at lines 126-127. Try/catch graceful-degrade: storage failure on execution layer falls back to `CLASS_NOT_WIRED` for all classes rather than 500-erroring the whole endpoint (orchestrator-layer failure still 500-paths). Closing a `knownGaps` entry MUST remove from array + bump `lastReviewed` per new ASSET_CLASS_ONBOARDING_WORKFLOW §4.24 governance rule.

**Step 1.b probe outcomes (informational, drove scope):** (Q4-A) TRADE_OPENED has no production emit path — `TradeOpenedEvent` doesn't exist in eventBus; narrative-feed defines `TradeOpenedPayload` but `appendNarrativeEvent` called only from test fixtures — NO WORK; (Q4-B) position-record SSOT audit found 1 drift site at L1376 (CHUNK B) plus 1 already-correct fallback at L1219 plus 1 strict read at L922 (B79.TEC NO_FALLBACK); (Q4-C) fee/slippage class-member wildcard at lines 126-127 — defer to Phase 25/26 calibration per same logic as sizing-core defer (needs evidence not placeholders); (Q4-D) trading-engine + micro-execution-service dormancy holds (last touched in `384e48e` B-NEW-43 memory sync only — no production code change).

**Component-level analysis (Step 2 pre-audit):**

- **CRITICAL blast radius** — `server/services/paper-execution-engine.ts` (CHUNK A emit + CHUNK B SSOT cleanup): emit site at L1545 + SSOT cleanup at L1376; upstream feeders class-agnostic (1.5s monitoring loop + continuous promotion loop bound to TCL_ACTIVATED + TRADE_CLOSED); downstream consumers verified safe via Step 1.b CHUNK A audit; in-memory buffers symbol/mode-keyed not class-keyed (no per-class refactor needed); shared SLIPPAGE_PERCENT/FEE_PERCENT class members deferred to Phase 25/26.
- **MEDIUM blast radius** — `server/lib/event-bus.ts` (CHUNK A interface field): additive optional field, queue processor type-agnostic, no listener uses `keyof TradeClosedEvent` enumeration or exhaustive-switch on shape.
- **LOW blast radius** — `server/routes.ts` (CHUNK C payload restructure): zero existing callers, schemaVersion 2 self-describing, no client-side migration needed.
- **NONE** — c13-validation + c14-validation listeners (no change, verified safe); narrative-feed (dormant, no production emit); session-lifecycle-controller (informational A5 confirm — weekend-pause IS class-aware via `xstock_spot/market-hours.js` import, generalizes to future weekend-paused classes); trading-engine + micro-execution-service (OUT — dormant per SIM §6.2 + §6.6).

**Cross-cutting risk register:**
- **§3.1 Same-symbol-across-classes scenario** — post-B79.0n.RTB, structurally supports same symbol across classes (hypothetical xstock_perp AAPLx perpetual + xstock_spot AAPLx spot). Today theoretical (both perp classes return CLASS_NOT_WIRED) but TradeClosedEvent additive field future-proofs disambiguation without event-shape break.
- **§3.2 Legacy-position safety on CHUNK B SSOT cleanup** — `position.assetClass ?? safeResolveAssetClass(...)` fallback handles in-flight positions without populated assetClass field. Per Langston Step 2 B2 reframe: belt-and-suspenders, NOT load-bearing — L922 NO_FALLBACK throws first on missing assetClass before flow reaches L1376.
- **§3.3 ORCHESTRATOR diagnostic endpoint payload break** — v1 → v2 restructure technically breaking at endpoint contract level, but zero callers verified means operationally invisible.
- **§3.4 Test infrastructure reuse** — existing fixtures (`b79-0n-orchestrator-cascade.test.ts`) use key-aware DB mocks differentiating crypto_spot vs xstock_spot guardrails. CHUNK E tests extend the same pattern.

### Components touched

- **`server/services/paper-execution-engine.ts`** — emit site at L1545 populates `assetClass: position.assetClass` + canary log; SSOT cleanup at L1376 uses `position.assetClass ?? safeResolveAssetClass(...)` belt-and-suspenders fallback. Comments document Langston Step 2 B2 reframe (defensive not load-bearing) + Step 1.a Q4-B audit origin.
- **`server/lib/event-bus.ts`** — `TradeClosedEvent.assetClass?: string` optional-additive field per Langston Step 2 ACK + same C-7 doctrine as PromotionEvent. Comment documents 3 listeners verified safe with line refs.
- **`server/routes.ts`** — `/api/diagnostics/orchestrator-per-class-state` URL retained, payload restructured to v2 nested-by-layer with `_meta.schemaVersion: 2`, `coverage: ['orchestrator','execution']`, `lastReviewed: '2026-05-27'`, and 3-entry `knownGaps` array. Reads `storage.getPaperSimOpenPositions('paper')` + `storage.getPaperSimTrades('paper', { closedOnly: true, limit: 500 })` + JS-filter on 24h cutoff (future SQL-pushdown candidate per Langston C5 #2). Imports `DEFAULT_TAKER_FEE` + `DEFAULT_SLIPPAGE` from `exchange-defaults.js` for wildcard fee/slippage surfaces.
- **`server/tests/unit/b79-0n-execution-audit.test.ts`** — NEW 138 LOC / 12 source-file regression-lock tests covering CHUNK A (4) + CHUNK B (1 with no-throw skip semantics per Langston Step 2 B3) + CHUNK C (7 nested payload + knownGaps + perp CLASS_NOT_WIRED + exchange-defaults import).

### Note on §6.1 existing entry

The existing **§6.1 Paper Execution Engine** entry remains accurate. B79.0n.EXECUTION extends it with the TradeClosedEvent additive field at the emit site + outcomeFeedback hook SSOT cleanup + canary log — all surgical, no behavior change for any of 3 existing listeners. When the §6.1 entry needs to mention TradeClosedEvent.assetClass, refer to this Recent additions section for the C-7 additive doctrine + Step 1.b audit findings.

### "If I Change X, Check Y" — B79.0n.EXECUTION additions

- If you add a new TRADE_OPENED event path (eventBus interface + emit site + listeners), apply the same additive-optional `assetClass?: string` C-7 doctrine documented in ASSET_CLASS_ONBOARDING_WORKFLOW §4.23 — populate from `position.assetClass` at emit, NOT re-resolve.
- If you add a 3rd or 4th `(position as any).assetClass` cast site to paper-execution-engine.ts, extract a `readPositionAssetClass(p): string | undefined` helper per Langston Step 4 C1 guidance to centralize the cast.
- If you close a deferred gap surfaced in `_meta.knownGaps` (Phase 25/26 fee/slippage dispatch, sizing-core per-class risk-pct, or narrative-feed activation), the closure batch MUST remove the entry from the live endpoint payload AND bump `_meta.lastReviewed` per ASSET_CLASS_ONBOARDING_WORKFLOW §4.24. ANY per-class-state batch touching this endpoint should also bump `lastReviewed` even if knownGaps unchanged (Langston Step 4 C5 #1).
- If you optimize the recent-closes-24h query to SQL-pushdown (replacing JS-filter after getPaperSimTrades with `WHERE closed_at >= NOW() - INTERVAL '24 hours'`), update the `IStorage` interface with the new method signature + maintain backward-compat for the existing `getPaperSimTrades({ closedOnly, limit })` shape. Future Phase 19+ optimization candidate per Langston Step 4 C5 #2.
- If you gate the `[B79.0n.EXECUTION][EMIT_TRADE_CLOSED]` canary log behind an env flag (`B79_EXECUTION_CANARY=1`) post-WIRE-IN burn-in per Langston C5 #3, surround the `console.log(...)` at paper-execution-engine.ts:~1545 with an `if (process.env.B79_EXECUTION_CANARY === '1')` guard. Don't remove the log statement entirely — it stays as the operator-visible witness for per-class wiring across all 4 active classes.

### Phase 24 onboarding workflow cross-reference

- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.23 codifies the additive event-payload field pattern with B79.0n.EXECUTION's `TradeClosedEvent.assetClass?: string` as the canonical reference implementation (also see B79.0n.RTB §C-7 for the precedent on `PromotionEvent.assetClass?: string`).
- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.24 codifies the deferred-gap registry closure rule with B79.0n.EXECUTION's `_meta.knownGaps` 3-entry array as the canonical reference implementation.

### Cross-references

- Completion report: `Claude Comms and Packages/Batch Completion/B79_0n_EXECUTION_COMPLETION_REPORT.md`
- Scope + Pre-audit + Change-list: `Claude Comms and Packages/Scope Files/B79_0n_EXECUTION_SCOPE.md` (v1.1) + `B79_0n_EXECUTION_PRE_AUDIT.md` + `Change Lists/B79_0n_EXECUTION_STEP4_CHANGE_LIST.md`
- Architectural synthesis (Step 1.a): `Claude Comms and Packages/Langston Design Asks/B79_0n_EXECUTION_ARCHITECTURAL_SYNTHESIS.md`
- Step 8 verify dispatch: `Claude Comms and Packages/Langston Design Asks/B79_0n_EXECUTION_STEP8_VERIFY.md`
- RUNNING_ISSUES: see #155 (perp `reason` truncation cosmetic) + new entries #157-#159 (Langston Step 4 C5 follow-ups: line-number drift / JS-filter scale / canary log volume gating).

---

## Recent additions (B79.0n.ORCHESTRATOR — Phase 24 — 2026-05-27)

Sub-batch 12 of 16 in the B79.0n umbrella v4 arc — **renumbered from #13 after POOL (#12) SKIPPED 2026-05-27** per Kyle directive (POOL's selection-problem doesn't apply to xStock's 489-pair universe; perp classes are post-launch). Step 6 deploy commit `5e08568`, PM2 #325 at 13:17:34Z; CI all-4-green at run `26513242197`. **Per-class consumer-site swap pattern + POOL skip cleanup.**

**Architecture summary.** Pre-batch, 3 consumer files (`paper-position-sizing.ts:29+145`, `signal_quality_evaluator.ts:28+285`, `routes.ts:12645`) imported `PATTERN_POOL_GUARDRAILS` directly from `crypto_spot/pattern-pool-filters.js` — meaning xstock pattern signals were sized + evaluated against crypto's 0.15 cap / 0.45 floor regardless of their actual asset class. Each xstock module has its own equivalent (`XSTOCK_PATTERN_POOL_GUARDRAILS` with DB-resolved getters per B79.0n.PATTERN-DETECT) but the consumers never called it. This batch closes that gap with a domain-specific dispatcher.

**The pattern (canonical reference: B79.0n.MCE `getFrictionForAssetClass`).** New file `server/asset_classes/pattern-pool-dispatch.ts` (~80 LOC):

```typescript
export function getPatternPoolGuardrailsForAssetClass(
  assetClass: AssetClass,
): PatternPoolGuardrails {
  switch (assetClass) {
    case 'crypto_spot':  return PATTERN_POOL_GUARDRAILS;
    case 'xstock_spot':  return XSTOCK_PATTERN_POOL_GUARDRAILS;
    case 'crypto_perp':
    case 'xstock_perp':
    case 'equity_spot':
    case 'equity_futures':
    case 'commodity_futures':
    case 'fx_spot':
      throw new Error(`[B79.0n.ORCHESTRATOR][CLASS_NOT_WIRED] ...`);
    default: {
      const _exhaustive: never = assetClass;
      throw new Error(`[B79.0n.ORCHESTRATOR][dispatch] unreachable assetClass=${String(_exhaustive)}`);
    }
  }
}
```

**Discipline rules (Langston Step 1 §6 ACK):**
1. Exhaustive switch — all 8 AssetClass union members covered
2. `_exhaustive: never` in default — compile-time exhaustiveness lock
3. `[CLASS_NOT_WIRED]` throws for 6 non-spot classes with ASSET_CLASS_ONBOARDING_WORKFLOW §4.22 activation breadcrumbs in the error message
4. Return type explicitly `PatternPoolGuardrails` (not inferred) — locks shape contract

### Components touched

- **`server/asset_classes/pattern-pool-dispatch.ts`** — NEW dispatcher file (~80 LOC). Imports `PATTERN_POOL_GUARDRAILS` from `crypto_spot/pattern-pool-filters.js` + `XSTOCK_PATTERN_POOL_GUARDRAILS` from `xstock_spot/pattern-pool-filters.js` + `AssetClass` type from `shared/asset-classes.js`. Exports `getPatternPoolGuardrailsForAssetClass` function + `PatternPoolGuardrails` interface.

- **`server/services/paper-position-sizing.ts`** — import swap (line 29) + interface `PaperPositionSizingParams` gains REQUIRED `assetClass: AssetClass` field + usage swap at line 145 (`getPatternPoolGuardrailsForAssetClass(params.assetClass).MAX_POSITION_PCT`). Caller threading at 2 sites: `paper-execution-engine.ts:2529` + `signal-orchestrator.ts:432` — both pass `resolveAssetClass(signal.symbol, 'kraken')` deterministically per Langston Step 2 Probe 8 ACK (no-silent-fallback; throws on B69-unregistered symbols).

- **`server/core/filters/signal_quality_evaluator.ts`** — import swap (line 28) + usage swap at line 285 (`getPatternPoolGuardrailsForAssetClass(input.assetClass).FINAL_SCORE_FLOOR`). `input.assetClass` already REQUIRED per B79.0n.STORAGE.

- **`server/routes.ts`** — `/pattern-pool` endpoint (line 12645) gains optional `?assetClass=` query param + per-class dispatch with 400 on invalid class. NEW endpoint `GET /api/diagnostics/orchestrator-per-class-state` iterates 4 active classes returning either `{ patternPoolGuardrails: {...} }` (crypto_spot + xstock_spot) or `{ status: 'CLASS_NOT_WIRED', reason }` (crypto_perp + xstock_perp). No-auth public per B79.0a pattern. Step 8 verify-gate target.

- **`server/services/signal-orchestrator.ts:101`** — dead-import cleanup. Pre-batch imported 3 symbols from `crypto_spot/pattern-pool-filters.js`: `PATTERN_POOL_STRATEGIES + PATTERN_POOL_GUARDRAILS + DEFAULT_ASSET_CLASS`. Step 1.a probe confirmed first 2 are unused in file body. Cleaned to import `DEFAULT_ASSET_CLASS` only (still referenced at lines 670 + 1397 in the crypto-only path documented by docstring at lines 1377-1379 "Signal-orchestrator is the crypto active-trading path — class is crypto_spot by construction").

- **`server/services/asset-class-instances.ts`** — POOL skip cleanup. `ratioManager: AdaptiveRatioManager` field deleted from `AssetClassInstances` interface (line 92 pre-batch) + `AdaptiveRatioManager` import deleted (line 86) + 3 dead factory ARM constructions deleted (xstock_spot @ line 144 pre-batch, xstock_perp @ line 167, crypto_perp @ line 183). Crypto's module-level `adaptiveRatioManager` singleton at `adaptive-ratio-manager.ts:307` UNTOUCHED — live ARM for crypto's FX5 scanner.

- **3 test file dispositions:**
  - DELETE `server/tests/unit/b79-0n-telemetry-arm-injection.test.ts` (entire 95 LOC tested the now-removed contract)
  - REFACTOR `server/tests/unit/b79-0a-arm-injection.test.ts` (removed `new AdaptiveRatioManager({}, customTelemetry)` test; kept crypto singleton-fallback tests)
  - REFACTOR `server/tests/unit/b79-0b-asset-class-instances.test.ts` + `server/tests/unit/b79-0n-telemetry-factory.test.ts` (7 `.ratioManager` refs → `.failureTracker` / `.scanManager` / `.telemetry` assertions)

- **3 NEW test files (27 new tests):**
  - `server/tests/unit/b79-0n-orchestrator-dispatcher.test.ts` (11 tests: active classes + perp CLASS_NOT_WIRED + reserved-future CLASS_NOT_WIRED + return-type shape)
  - `server/tests/unit/b79-0n-orchestrator-consumer-swaps.test.ts` (7 tests: source-file structural assertions for import + interface contract)
  - `server/tests/integration/b79-0n-orchestrator-cascade.test.ts` (8 tests: sizing cascade with xstock 0.50 vs crypto 0.15 divergence; SQE cascade; dispatcher resilience). Key-aware DB mock at section §1 catches the wrong-value-threaded-correctly bug class (Langston Q1 refinement).

### "If I Change X, Check Y" — B79.0n.ORCHESTRATOR additions

- **Add a new `AssetClass` enum value** → `_exhaustive: never` in `pattern-pool-dispatch.ts` default branch HARD-FAILs at compile. Add a `case` returning the new class's PatternPoolGuardrails-shaped object OR an explicit `[CLASS_NOT_WIRED]` throw before pushing.
- **Add a new consumer of pattern-pool guardrails** → use `getPatternPoolGuardrailsForAssetClass(assetClass)` from `server/asset_classes/pattern-pool-dispatch.js` — NOT direct import from `crypto_spot/pattern-pool-filters.js` (anti-pattern; the consumer-site swap pattern §4.22 exists exactly to prevent this regression).
- **Remove the per-class plumbing** → if a future batch decides pattern pool guardrails should be wildcard again, the dispatcher must stay but every case returns the same source. Don't bypass the dispatcher.
- **Change the `PatternPoolGuardrails` interface shape** → update BOTH `crypto_spot/pattern-pool-filters.ts` and `xstock_spot/pattern-pool-filters.ts` to expose the new keys + the dispatcher's return type contract. Both modules use the `get`-property pattern; adding/renaming requires symmetric updates.
- **POOL re-opens as a sub-batch** (xStock universe grows past 1500 pairs or scanner cycle slows beyond 200ms p95) → revisit the AdaptiveRatioManager factory wiring. The 3 deleted bootstrap calls would need to be re-introduced; the `ratioManager` field re-added to `AssetClassInstances`; the test refactors reversed. See `MULTI_ASSET_VTS_EXPANSION_PLAN.md` POOL skip closure entry for re-evaluation triggers.

### Phase 24 onboarding workflow cross-reference

- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.22 codifies the **per-class consumer-site swap pattern (with-existing-module-shape)** with B79.0n.ORCHESTRATOR as the canonical reference implementation. This is the cheaper sibling pattern to the full F-1 resolver-with-EXISTS-gate pattern that lives at OBSERVABILITY (#16) for situations where the per-class module already exists and the consumer just needs to call it.

### Cross-references

- Completion report: `Claude Comms and Packages/Batch Completion/B79_0n_ORCHESTRATOR_COMPLETION_REPORT.md`
- Scope + Pre-audit + Change-list: `Claude Comms and Packages/Scope Files/B79_0n_ORCHESTRATOR_SCOPE.md` + `B79_0n_ORCHESTRATOR_PRE_AUDIT.md` + `Change Lists/B79_0n_ORCHESTRATOR_STEP3_CHANGE_LIST.md`
- Architectural synthesis (Step 1.a) + 2-round iteration + Step 8 verify: `Claude Comms and Packages/Langston Design Asks/B79_0n_ORCHESTRATOR_ARCHITECTURAL_SYNTHESIS.md` + `B79_0n_ORCHESTRATOR_STEP1A_REPLY_v1.md` + `B79_0n_ORCHESTRATOR_PREAUDIT_REPLY_v1.md` + `B79_0n_ORCHESTRATOR_STEP8_VERIFY.md`
- RUNNING_ISSUES: see new R-6 (xstock 0.50 vs crypto 0.15 cap behavioral correction — Phase 19 calibration validates xstock placeholder value when WIRE-IN #14 flips active trading).

## Recent Additions (ITEM 4 Phase B step 1 — VTS standalone decouple + entry-stamp, 2026-06-09)

### `server/services/hybrid-confluence-buffer.ts` — ★ CROSS-PRODUCER SHARED MUTABLE STATE (D1b, flagged item-4 step-1 review)
- **What**: singleton pattern-confluence buffer (`:86`), key `symbol_patternType` — **NO source/mode dimension**.
- **Writers+Readers (BOTH paths)**: vts-runner `addPatternSignal:3778` / `findCompatiblePatterns:3790` / `sweep:3849`; signal-orchestrator `addPatternSignal:1409` / `findCompatiblePatterns:1290` / `sweep:1332`.
- **Contamination modes once producers run concurrently** (post step-1 VTS-decouple): VTS-buffered patterns boost ACTIVE-path hybrid formation; same-key re-detections refresh each other's decay clocks (`getDecayFactor` inflation); active patterns leak into VTS training hybrids. The removed O1 guards were the only single-writer guarantee.
- **Fix (step 2, D1b)**: namespace the key by carried `sourceMode` (or filter at `findCompatiblePatterns`). **#210 HARD GATE: step 2 before any active-trading turn-on.**
- **Blast radius**: MEDIUM-HIGH (hybrid signal formation both paths; training-data independence).

### Mode-tag architecture (Kyle stamp-at-entry, step-1 first installment)
- `vts-runner.ts` stamps `sourceMode:'vts'` on every pair at the possession boundary (post-`getIdealPoolPairs()`). Target end-state: the tag rides the payload through selection→queue→storage; every mode-sensitive consumer reads the CARRIED tag, never `getCurrentMode()`. Paper path already carries mode (`SQESignalInput.mode` → `RtbSignal.mode` → TCL maps → engine ctor) — the B79.0n threading. Remaining re-points (step 2): 3 B70 archivers (drop write-time `getCurrentMode()`), 5 hardcoded VTS literals, `outcomeFeedbackStore` source-partitioned key, D1b buffer namespace.

## Recent Additions (ITEM 4 Phase B step 2 — D1/D1b/D9 contamination fixes + labeled learning substrate, 2026-06-10)

### B70 archive `mode` column — VALUE-SET ADDITION: `'shared'`
- The B70 vocabulary was `'vts' | 'paper_sim' | 'live'` (column TEXT NOT NULL, no constraint). **`pair_scan_archive` rows now stamp the literal `'shared'`** — the scan tier is the producer-agnostic substrate (sole writer = the MCE scan cycle, computed once for ALL producers; zero mode-filtered readers existed). Stamping a single producer's mode on shared rows becomes a lie under concurrency. `signal_eval_archive` + `exit_decision_archive` now take REQUIRED `mode` from the CALLER's carried tag (`getCurrentMode()` write-time lookup DELETED from all three archivers).
- **⚠️ Future-mis-stamp note (Langston step-2 review):** the four hardcoded `'vts'` stamps in `xstock_spot/eval-cycle.ts` are correct today because `evaluateXstockPairForVTS` is only invoked from the VTS xstock path. If a future batch routes ACTIVE xStock trading through that eval, the literal becomes a mis-stamp — that batch MUST thread a mode param instead.

### `server/core/metrics/outcome-feedback-store.ts` — D9 labeled multi-source substrate (re-architected)
- Key: `<source>_<assetClass>_<regime>_<strategy>`; `source` REQUIRED first param on updateEma/peek, type `LearningSource = RunMode` (ONE system-wide vocabulary — no store-vs-archive mapping seam). SOURCE-MATCHED reads (Gate-2 decision): every consumer reads its OWN partition. Welford triplet (w_count/w_mean/w_m2) + `epoch` maintained ALONGSIDE the retained EMA (zero factor-behavior change). 2-stage disk re-key: all pre-step-2 entries → `vts_` partition (verified on staging: 30/30). Writers: vts-service ('vts'), paper-execution-engine (own mode). Readers: vts-runner ('vts'), signal-orchestrator (own mode).

### `server/core/metrics/calibration-epoch.ts` (NEW) + `module_constants` module `calibration_epoch`
- `getCalibrationEpoch(source)` — sync read of the warmed B72 cache; fail-hard on missing row. Boot assertion in `b72-warmup.ts` requires ALL THREE per-source rows (partial seed = deploy-time failure, not silent mid-close outage). Governance rules in ADJUSTMENT_FRAMEWORK "CALIBRATION EPOCHS".

### `server/services/hybrid-confluence-buffer.ts` — D1b FIXED
- Key now `sourceMode_symbol_patternType`; `BufferedPatternSignal.sourceMode` REQUIRED; `findCompatiblePatterns(symbol, sourceMode)` filters per-source. The three cross-producer contamination vectors (active-path boost from VTS patterns, decay-clock cross-refresh, active→VTS training leak) are dead. RUNNING_ISSUES #210 gate satisfied by this step.

## Recent Additions (ITEM 4 Phase B steps 2b + 3 + 6 and item 4.6-A, 2026-06-10)

### `server/services/data-archive/would-admit-cache.ts` (NEW, step 2b) — paper-SQE threshold cache for the would_admit bridge
- `getPaperFinalScoreMinSync(assetClass)`: sync read, 60s stale-while-revalidate TTL, 10s failure cooldown (no per-row retry hammering of a degraded config path), never throws into the archive path. Upstream: `getSQEThresholdsFromConfig('paper', ...)`. Downstream (SOLE consumer): `signal-eval-archiver.ts` features build — `mode='vts'` rows get `would_admit_v0` + `would_admit_basis` (`final_score_vs_paper_finalScoreMin` / `thresholds_not_warm` / `no_final_score`) + `would_admit_threshold`. ONE stamp site by design (the archiver convergence point). Blast radius: telemetry-only (features JSONB).

### `server/routes.ts` `/api/trading/start` live branch — the Phase-21 live-engine gate (step 3)
- Fail-CLOSED read of `module_constants` `live_engine_gate`/`live_engine_enabled` (seeded `'0'::jsonb`, in `b72-warmup.ts` PREFETCH_MODULES); refuses **409 `LIVE_ENGINE_PHASE21_GATED`** unless strictly `=== 1`; gate sits BEFORE any `globalLiveEngine` reference; NO state flip on refusal. **⚠️ jsonb booleans are INVISIBLE to the B72 numeric resolver — the Phase-21 flip sets numeric `1` (roadmap 19-17b); never truthy-simplify the read.** UI: `client/src/hooks/use-trading.tsx` start-mutation onError surfaces the 409 with a Phase-21 message. Locks: `server/tests/unit/item4-step3-switch-cleave.test.ts` (gate presence/ordering/fail-closed/no-flip/strict-===1, stop-per-mode, VTS-handler no-coupling).
- **If you change X check Y:** changing the B72 constants resolver's type handling → re-verify the gate read (test 1e); changing `/trading/start` flow → the gate MUST stay ahead of any engine reference; building Phase-21 live → flip the constant to numeric 1, do NOT remove the gate.

### `server/services/market-context-engine.ts` — per-pair regime log line behind default-OFF `MCE_PER_PAIR_LOG` (item 4.6-A)
- The per-(symbol,cycle) `[Phase14][MCE] <symbol>: regime=...` console line (~98/min; the bulk of a 43GB out.log) is emitted only when env `MCE_PER_PAIR_LOG=1` (read once at module load; restart to flip; `=1` reproduces the historical format byte-identically). **With the line OFF, `pair_scan_archive` row count is the SOLE compute-once witness** (exactly one row per (symbol,cycle) — the throughput study verified the 1:1 exactly). Boot/lifecycle MCE lines are NOT gated.

### `server/services/health-monitor.ts` — ⚠️ ENGINE block reads legacy `global.tradingEngines` (#214, found by the step-6 study)
- `checkEngineHealth` scans the legacy per-user registry → reports `ok:true / isRunning:false` for an actively-trading paper engine, and provides ZERO paper liveness signal. The QUEUE block reads the real operation queues (correct). THREE globals currently answer "is paper running" (`global.tradingEngines` [lying] / `getGlobalSession()` [correct] / `globalPaperPortfolioManager`); fix = consolidate to ONE truth source, targeted Phase-19 prep (#214). Do not add new readers of `global.tradingEngines`.

### Throughput-study architectural resolution (step 6)
- VTS + paper concurrent **in-process = measured GO** (all 6 gates; `ITEM_4_THROUGHPUT_STUDY_RESULTS.md`). The packet §6 separate-VTS-process option: NOT needed pre-Phase-19; re-evaluate at Phase 21 with 3 real producers. The event-loop lag tail belongs to the 306-pair scan (item 4.6-B — must instrument with `perf_hooks.monitorEventLoopDelay` histograms), not to producer concurrency.
## Recent Additions (B-4.6-B chunk A — scan-stall instrument, 2026-06-10)

### `server/services/scan-stall-instrument.ts` (NEW) — measurement only; the 4.6-B spine
- `perf_hooks.monitorEventLoopDelay` histogram, **`reset()` per 60s interval** → `[4.6B][ELD]` METRIC line (interval-scoped p50/p95/p99/max — before/after soak windows compare like with like). Per-segment sync-span aggregates → `[4.6B][SEG]` lines with **max single atomic span per interval** (the chunk-B residual stall floor; decision rule: a pair materially >20–25ms becomes its own finding before yields ship). Lazy-armed on first record call; timer unref'd.
- **Wrap points (callers):** `market-scanner.ts` AdaptiveScan prefetch (`crypto_prefetch_pair` per-pair ATR/DBS spans + `crypto_prefetch_batch` = batch-of-10 sum, framed as the all-warm worst-case atomic span) · `xstock_spot/eval-cycle.ts` pre-fan-out block (`xstock_eval`) · `vts-runner.ts` post-fetch block (`vts_eval`). Deliberately UNWRAPPED (per-pair awaits inside their spans would pollute the sync reading): Loop 1's main filter + 19F pattern loops; xStock fan-out — all inherit the escalation rule (ELD hot + all 4 segments cold → next wrap candidates).
- **⚠️ GRANULARITY LOCK (Langston 4.6-B Step-2 R3 — binding on future batches):** the pre-audit's safety argument ("new yields add interleave frequency, not a new class") holds ONLY because chunk-B yields are strictly COARSER than the existing mid-pair awaits. **A future batch inserting a yield INSIDE a single pair's compute span does NOT inherit that argument** — that is exactly where read-coherence spans get split. Full derivation: `B_4_6B_PRE_AUDIT.md` §1–§3.
- **Mechanism on record (Langston-confirmed):** warm-cache `await`s resolve on the microtask queue only — timers/I-O (macrotasks) starve under an unbroken warm-hit chain; that is why the scan loops stall DESPITE containing per-pair awaits, and why chunk B uses `setImmediate`-class yields, not "more awaits".

## Recent Additions (B-4.5 — DB-governed Tier-1 fee model, 2026-06-11)

### `fee_model` (module_constants) — THE fee source; merged at ONE site
- **Rows:** `spot_taker_fee` 0.008 / `spot_maker_fee` 0.004 per asset_class (crypto_spot, xstock_spot — identical by construction: account-wide tier). Warmed by `b72-warmup` (PREFETCH + strict per-class boot assertion + (0,0.05] sanity rails — partial seed or fat-fingered value = refused boot).
- **Single merge site:** `cost-model.getFrictionForAssetClass` → `{...STATIC_FRICTION, ...resolveFeeRates(assetClass)}` — NEW object per call; the static friction modules (`crypto_spot/friction.ts`, `xstock_spot/friction.ts`) carry **NaN fee tombstones** and are imported ONLY by cost-model. A future direct static read poisons math loudly (NaN → netEV NaN → comparison-false → reject), never silently prices Tier 6.
- **Downstream consumers (all read the resolved value):** SQE ROI gate ×2 + vts-runner ROI gate (fee REQUIRED on `isSignalProfitable`/`getROIDetails` — no default), `slippage-fee-model` (`calculateFees`/`modelTradeRealism`/`getConfig` take REQUIRED assetClass; caller: pre-execution-validator — `realtime-paper-executor` DELETED P19-B4b.2/#300), `paper-execution-engine.feePercentFor(symbol)`, ~~`cost-cache.resolveCryptoTakerFee()`~~ (DELETED P19-B7.2a — the cache no longer stores fees; see §2.5), routes display ×2 + per-class diagnostic. RETIRED: `DEFAULT_TAKER_FEE`/`DEFAULT_MAKER_FEE`/`DEFAULT_COST_BUNDLE`/`computeDefaultTotalCost`/`DEFAULT_FEE` aliases (exchange-defaults, adaptive-thresholds, cost-model re-export), `updateCachedCostMetrics` (dead exported fee-writer through the clamp).
- **`MAX_COST_BOUND` 0.01→0.02:** the ONLY enforced per-component clamp (cost-cache.setCostMetrics, crypto lane). ⚠️ Soak-reading note (Langston): the raise also stops clamping scanner-written SPREADS in the 1-2% band — a second admit-rate mover alongside the fee change. Per-class `friction.maxCostBound` aligned 0.02 — still DECLARED-NOT-ENFORCED (B81 contract).
- **`system_context.maker_fee_pct/taker_fee_pct` = operator override ONLY** (B-4.5 R1): schema `.default()`s REMOVED + live values NULLed (they were auto-stamped Tier-6 residue — the THIRD copy). Semantics: NULL → fee_model fallback; explicit value INCLUDING 0 wins (`resolveValidatorFeeRates`, unit-locked 4 cases). Remaining legacy surface (`default_fee_mode`, `min_net_profit_threshold`, UI fee label) → Phase-16 register.
- **Tier automation:** DEFERRED to Phase-21 prep (account durably Tier 1 until live volume exists; manual DB update under ADJUSTMENT_FRAMEWORK is the mechanism).
- **Test substrate:** `_seedModuleCacheForTests` (module-constants-service, vitest-guarded) — in-memory cache seed for suites reaching the fail-hard merge; DB-backed path covered by CI db:migrate + the boot assertion.


## Recent Additions (B-5 — AMR body, interphase item 5, 2026-06-12)

**New components (per-component upstream / downstream / shared state / background execution / blast radius):**

1. **`server/services/amr-weather-report.ts` — THE aggregator.** Upstream: market-indicators per-class read (regime vote %, friction score+reason, DBS score+staleness), per-class flip tracker (internal), EV-gap window (fed by vts-service close hook), macro z-reads (crypto macro feed / amr-equity-feed), module_constants `amr_weather_rules` + `amr_runtime` (fail-hard). Downstream: amr_decision_ledger writes (90-day IN-SERVICE prune — NOT the B-NEW-47 sweep), getAmrWeatherReport/getActiveModeForClass/getCurrentModeForClass consumers (gates, panel endpoint, VTS stamps), strategy-modes resolver. Shared state: per-class tracker Map (epochs are LIVE cycles — A8a), 30s cycle via autonomy-scheduler boot block (deferred-retry 10x30s). Blast radius: trading-inert in disabled/shadow (A5: disabled = no compute); under ACTIVE the resolved mode feeds gates + overlays. M2 contract: classification IS the bucketed continuousScore; hard rules act as SCORE CAPS (quarantine -> 0.5 cap R2; FAVORABLE requires 5/5 weighted inputs — completeness cap favorable_min-0.001).
2. **`server/services/amr-equity-feed.ts` — xstock macro feed.** Upstream: CBOE delayed VIX JSON (owner-official; schema guard fail-loud; last_trade_time dedupe), frankfurter ECB rates -> ICE-formula DXY (no-new-date = no observation; eurofxref-daily.xml fallback), FRED VIXCLS keyed cross-check (trade-date keyed; pending is not mismatch). Downstream: getLatestEquitySnapshot (weather macro read + health cross-consistency). Shared state: ObservationWindow rings (z_baseline_observations knob, A1) persisted to /tmp/amr-equity-feed-state.json (restart-surviving — verified live, 74 obs preserved). Background: poll loop started at boot.
3. **`server/services/amr-input-health.ts` — sentinels (Obj-15b, R1-R5).** Upstream: AmrWeatherInputs per cycle + module_constants `amr_input_health` rails. Downstream: system-alerts queue (incident-deduped; incidents close on recovery and re-alert), health[] on the report/ledger/panel. R1: runs shadow+active only. R3 distinct-value-COUNT arming + stuck-at-zero fast-N (#219 class); OOB = quarantine-not-clamp; A-note: never-seeded inputs escalate.
4. **`server/core/governance/amr-gates.ts` — posture gates.** Upstream: getActiveModeForClass + slot caps (B1: count fetch isolated — verdict never swallowed). Downstream: SQE (F1 unconditional self-sourcing, B2 sourcePool), paper-execution-engine (B1; the dormant `realtime-paper-executor` AMR-gate consumer + its module-resolution-failure warns-and-skips asymmetry were DELETED P19-B4b.2/#300), RTB promotion re-check (defer-in-queue). F3 precedence: killSwitch > AMR > TCL as independent ANDs. Fail-closed under ACTIVE only; dry_run -> ledger would_blocks.
5. **`server/asset_classes/xstock_spot/friction-sample-store.ts` — measured xstock friction source.** Upstream: scanner capture hook (post-depthBySymbol; resume() resets warmup). Downstream: market-indicators computeXstockFrictionFromStore (reason-coded OK|NO_SOURCE|MARKET_CLOSED|LOW_VOLUME_THIN|WARMING), audit-dump friction samples. DB knobs `amr_friction_sample` fail-hard. Closed the structural NO_SOURCE gap (the old pool was crypto-fed on all 3 feeder paths).
6. **`server/services/amr-context-bonus-shadow.ts` (#217 wired-at-shadow).** Computed per ranked set AFTER selection (cannot alter it); regime-agreement + BTC-MCE-trend (crypto) / SPY 15m (xstock). WARNING: populate path = RTB/getTopSignal selection flow -> ALL values null in VTS passive mode (Langston Step-8; semantics confirmed). Evidence accrues only when Phase 19 turns the selection path on.
7. **`server/core/governance/strategy-modes.ts` extensions.** AGGRESSIVE exists per-class ONLY (class-less record access THROWS; legacy mapping never produces it — 11.7S suite asserts), resolveStrategyModeFromWeather brain seam (one-site swap for a learned brain), getModeOverlayForClass/getSlotCapForMode/meetsConfidenceFloorForClass (amr_response_dials + governance_modes, fail-hard, boot-asserted), per-class modeStats (F2).
8. **Audit surface (Obj-15a, PERMANENT): `/api/diagnostics/amr/audit-dump`** — one-pass per-class {vote pairs+winner (MCE collectClassRegimeEntries/tallyClassRegimeVote shared-collector refactor — consumer vote and dump winner provably same code), DBS entries+same-pass aggregate (DirectionalBiasStore.getAuditDump — read-only, same eligibility partition, no prune/publish), friction samples+result (FrictionAuditCollector threaded through the SAME sampling loops)} + offline independent-recompute script `scripts/b5-amr-correctness-audit.ts`.
9. **`/api/diagnostics/amr/current`** — weather + flag + mode + live per-mode dials (fail-soft dial enrichment only; weather read keeps the 500 envelope). **UI: AmrWeatherSection** top of Analytics Overview (analytics.tsx) — per-class cards, dial-templated descriptions (CALM conditional baseline copy; FAVORABLE conditional stop clause), health chips, 5-row legend, 30s stable-key refetch.
10. **`server/core/metrics/calibration-epoch.ts`** — class-aware getCalibrationEpoch(source, assetClass?) most-specific-wins; vts epochs now crypto_spot=4 / xstock_spot=5 (B-5 audit Finding-A2 bump), wildcard=3 (future classes).
11. **vts-runner / vts-service touchpoints:** at-open amrClassification/amrMode stamps BOTH lanes (inline crypto :1528 + registerOpenVtsTrade default-resolve — Finding-B fix), EV-gap close hook feedEvGapObservation(class, expectedEdge*100, pnl*100) (Finding-A2 units fix — pnl is the realized FRACTION; the old /notional understated ~100x and polluted the B67.4 outcome EMA since 05-01).
12. **Deleted:** TOP_100_FALLBACK_PAIRS (market-indicators); legacy wildcard `governance_modes */aggressive_mode_confidence_floor` DB row.

**Known cross-cutting facts recorded:** crypto DBS store equity contamination #222 (52.6% weight — PRE-EXISTING, exposed by the dump surface); negative-spread writer #223 (market-scanner crossed quotes; read guard live); restart-transient CALM #224 (Phase-19 design); session-boundary classification flapping with dwell-ladder damping (shadow-week quantifies).

### B-5.1 deltas (input-integrity fixes #222/#223/#224 — 2026-06-12, deployed 5737b1ddb at 01:01:56Z)

- **MCE → DirectionalBiasStore write is now class-allowlisted (#222).** `market-context-engine.ts:~1395` — the ONLY production `directionalBiasStore.updatePair` call site — wrapped in `if (assetClass === 'crypto_spot')`. The crypto store can no longer receive non-crypto symbols regardless of which class flows through `computeContext` (allowlist: any FUTURE class is excluded by default). Self-heal: PAIR_HARD_EXPIRY_MS=5min + in-memory store (restart = clean). Permanent lock: audit-script leg `probe_dbs_class_purity` (registry-based; empty store → SKIP, never vacuous-PASS) + class-generic unit regression. UPSTREAM unchanged; DOWNSTREAM consumers of crypto global DBS (AMR weather dbs input, market-indicators display, MCE bias modifier, VTS `globalDirectionalBias[Score]` stamps) all read the now-clean aggregate — **intra-epoch-4 boundary `2026-06-12T01:01:56Z`** (rows stamped before/after carry contaminated/clean aggregates respectively; no epoch bump — input cleanup, not a formula change).
- **Cost-cache write guard (#223)** — see refreshed §2.5 (field-level negative-spread drop at the `setCostMetrics` chokepoint; 18 live rejections in the first 10 min post-deploy, all −1 stale-ask sentinels; rejection log on stderr → error.log).
- **amr-weather-report IDLE extension (#224):** friction `null` with reason WARMING/NO_SOURCE → IDLE (staleness `friction_warming`/`friction_no_source`); LOW_VOLUME_THIN + MARKET_CLOSED remain LIVE (measured absence ≠ warm-up). Consequence: xstock weekends under ACTIVE = IDLE all weekend (correct by construction). **Friction source = a PREREQUISITE for AMR LIVE classification** — onboarding a new asset class without a friction sampler leaves its AMR permanently IDLE (recorded in ASSET_CLASS_ONBOARDING_WORKFLOW).
- **amr-gates `no_posture` fail-closed split (the Note-3 4th gap):** item 4's "Fail-closed under ACTIVE only" now extends to the null-mode branch — `enforce` + `mode === null` → `{allowed:false, gate:'no_posture'}` (previously allowed/skipped = ungated ACTIVE-restart window). `dry_run` + null → skipped, unchanged. Safety basis: all 4 gate sites are ENTRY-side (exits never gated); posture is in-memory-only (no persisted-posture hazard); restart sequence is always null → blocked-under-active → first LIVE ≤ NORMAL (post-IDLE cap).

### B-4.6-B chunk B (scan-stall fix — 2026-06-12, final deploy b35f7e5fe; FIX-2026-06-12-C)

1. **`server/services/scan-yield.ts` — ScanYielder (NEW).** Elapsed-gated (20ms CODE constant — deliberately not a DB knob: coupled to the instrument's decision rule and the acceptance gate; changes travel through reviewed diffs) `setImmediate` macrotask yield. **⚠ GRANULARITY LOCK (load-bearing, Langston R3):** callers invoke `maybeYield()` ONLY at pair boundaries or batch-of-10 boundaries, NEVER inside a single pair's compute span. The shared-state safety argument ("new yields add interleave FREQUENCY, not a new CLASS") holds because these yields are strictly COARSER than the existing mid-pair awaits — a future yield INSIDE a pair's span splits read-coherence spans and does NOT inherit that argument. UPSTREAM: none (pure scheduling). DOWNSTREAM: reports yield counts to the scan-stall instrument's 60s `[4.6B][YIELD]` METRIC lane. Blast radius: LOW (no behavioral change to scan outputs — counters/cadence verified byte-identical).
2. **Yield points (per loop):** market-scanner crypto prefetch — BATCH-of-10 boundary (the 10 callbacks' sync tails drain as one atomic span by design); xstock scanner DBS pre-loop + eval loop — SYMBOL boundaries, ONE yielder spans both (shared elapsed budget). **⚠ The xstock DBS pre-loop yield is a NEW INTERLEAVE CLASS, not frequency-of-existing (Langston iteration-4 documentation condition):** that loop had ZERO awaits before chunk B, so mid-loop observation of `xstockDirectionalBiasStore` becomes possible for the first time — a reader can see mixed-vintage per-pair scores (this cycle for processed symbols, last cycle for the rest). Mutation-harmless basis: 15-minute-bar inputs make per-cycle score drift tiny; the store's global publish floors (global ≥30, sector ≥7) and the existing 30s between-cycle staleness envelope bound it; `dbsBySymbol` is loop-local. vts-runner — EVAL-loop pair boundary only; the RESOLVE loop has NO yields (its `.state` weekend-suspend read-coherence spans stay atomic, pre-audit C1). Main filter + 19F pattern loops: NO yields (not proven hot; instrumented iteration-2 with whole-iteration spans, await-pollution caveat documented in the segment-key comment).
3. **`server/services/scan-stall-instrument.ts` extensions (PERMANENT — Langston-endorsed standing telemetry):** GC observer (`[4.6B][GC]` count/sum/max/kind per 60s) + **the 50ms STALL watchdog** (`[4.6B][STALL] gap_ms=… blocked_from=… blocked_until=…` for any ≥150ms event-loop block — the wall-clock-bracketing tripwire that attributed the Batch-44 root cause; any future blocker names itself via the out.log lines bracketing its window) + 2 added segments (`crypto_main_filter_pair`, `crypto_pattern_pair`, iteration-to-iteration spans with awaits INSIDE — read max with pollution in mind) + per-lane yield counts.
4. **fx5-scanner scan diagnostics — disk layer DELETED (Kyle legacy ruling 2026-06-12):** `persistDiagnostics`/`rehydrateDiagnostics`/DIAG_DIR/fs+path imports removed. The Batch-44 sync 20-30MB write every 30s cycle WAS the dominant scan stall + the cron-miss source; the disk files had NO consumer anywhere (grep-proven both sides). Diagnostics are IN-MEMORY ONLY: `lastScanDiagnostics` + 24h `scanDiagnosticsHistory` (restart-volatile by decision — panel trend refills over the day; last-scan refills in one cycle). Live consumers unchanged: `/api/vts/filter-diagnostics` (routes/vts.ts:1550), vts-runner trace stamps (:3172/:3288), Filter Diagnostics panel. **Telemetry note:** `dbs_compute_ms` (CYCLE_DBS_TIMING) now includes injected macrotask turns — post-chunk-B values are NOT comparable to B-PHASE-A2 historicals as pure sync compute; the line's `yields=` covers the DBS pre-loop only (full xstock count = the `[4.6B][YIELD] lane=xstock_cycle` aggregate).

---

## Recent Additions (P19-B4a — xStock active-path wire-in + feed-safety: stamp-at-source SSOT + dispatch seam + active-fill safety gates + classify hardening + per-class strategy gate, 2026-06-14)

The xStock active-dispatch path is wired but **DORMANT** — every gate, the seam, and the connector are BUILT and verified but INERT until P19-B7b flips the authoritative `system_context.isEngineActive` flag. This batch makes the wire-in + safety gates exist and be correct; it does NOT turn xStock active-paper trading on (CLAUDE.md §9.1).

| Component | Location | Impact |
|-----------|----------|--------|
| **`SizingContext.assetClass` SINGLE-SOURCE-OF-TRUTH contract (C1 stamp-at-source)** | `server/services/signal-orchestrator.ts` — `SizingContext.assetClass` is now a REQUIRED field (`AssetClass`, no `?`); stamped ONCE at the per-pipe entry chokepoint (crypto `evaluateMarket` ≈:1285 = `'crypto_spot'`, xStock dispatch = `'xstock_spot'`). The ~9 symbol-derived sites inside `buildSizedSignalForStrategy` (sizing, friction/EV, cache-context, RTB queue input) read `sizingContext.assetClass` — NOT `resolveAssetClass(rawSignal.symbol)`. A build-site fail-loud assert (names pipe+symbol+strategy) is the primary tripwire; the RTB write THROWS on missing as the backstop. | Closes the collision-mislabel class structurally: the 17 collision tickers (9 USD + 8 EUR — same canonical form as BOTH an xStock and a crypto pair) are wrong-by-construction under any re-derive-from-symbol path (`resolveAssetClass` always returns `crypto_spot` for them via the collision rule) — only the PIPE that built the signal knows the true class. One sizingContext = one class = one pipe. `resolveAssetClass` survives ONLY for stored-row / diagnostic re-resolution (the collision rule is intentionally kept there). **Blast radius: CRITICAL** — every active-path signal's friction/EV/sizing/RTB-tag partitions on this field; a wrong value silently mis-prices the EV gate (crypto friction on a collision xStock → wrong Net-EV). |
| **`SignalOrchestrator.dispatchExternalSignal` seam + the `getOrchestratorByMode → orchestrator` reachability chain (C2)** | NEW public `async dispatchExternalSignal(rawSignal, strategyId, sizingContext, marketContext)` on `SignalOrchestrator` (just before the private `buildSizedSignalForStrategy`) — delegates to the private build (sizes → SQE → queues RTB internally; no post-routing). The orchestrator is NOT a global singleton — it is instance-owned (`trading-engine.ts` + `paper-portfolio-manager.ts`); the active paper instance is reached via `getOrchestratorByMode('paper')` (`paper-sim-service.ts`). `onSignalCallback` is a **no-op in paper mode** — the dispatch path does NOT use it. | The single public boundary by which a decoupled boot-time scanner reaches the active orchestrator's per-signal pipeline. **Blast radius: HIGH** (it is the entry to the full active build path) but **currently DORMANT** — null-skip when the active instance is absent / `isEngineActive=false`. |
| **`server/asset_classes/xstock_spot/active-dispatch.ts` (NEW) — the xStock active connector** | NEW file. `dispatchXstockActiveSignal(...)` — called fire-and-forget from `eval-cycle.ts` after the VTS `registerOpenVtsTrade` terminus (VTS path UNAFFECTED). Gate order: (1) authoritative `storage.getSystemContext('paper').isEngineActive` — false → dormant + counted (NOT manager-presence, which can diverge → split-brain); (2) `getOrchestratorByMode('paper')` null-skip + counted; (3) `predictiveConfidence ∈ [0,1]` fail-loud assert BEFORE build (the build clamps 0-1, so a 0-100 value silently inflates to 1.0); (4) `strategyKey ∈ STRATEGY_DISPLAY_NAMES` or throw, then `range_trade → range_trading` alias for the `StrategySignal.strategy` field; (5) stamps `metadata.assetClass='xstock_spot'` + builds a `SizingContext` stamped `xstock_spot` (`getPortfolioBalanceV2('paper')` + `getGuardrailsV2({mode:'paper'})`) + `marketContext{atr,high24h,low24h}`. Observable counters `getXstockActiveDispatchStats`; errors caught-counted-logged-NOT-thrown (B3b discipline). | First-class xStock reach into the active orchestrator. **Blast radius: MEDIUM**, DORMANT until B7b. The 0-to-1 vs 0-to-100 confidence-scale mismatch at the build boundary is the load-bearing trap this gate guards. |
| **`eval-cycle.ts` xStock active dispatch** | `server/asset_classes/xstock_spot/eval-cycle.ts` — fire-and-forget call to `dispatchXstockActiveSignal` after the VTS register terminus, threading the in-scope eval-cycle locals (symbol / strategyKey / signalType / regime / entry / stop / target / `predictiveConfidence` (0-1) / `mceContext.indicators` atr+high24h+low24h / `sourcePool`). The VTS path is structurally unaffected (the dispatch is a sibling, not a reorder). | The xStock signal source now reaches the active pipeline. Was previously documented as "no orchestrator wiring yet" (`index.ts:816`) — that is now WIRED (correct the stale SIM line per Step-10). |
| **C3 active-fill safety gates + `xstock_fill_safety` config (NEW module) + `fill-safety-config.ts` resolver** | NEW `module_constants` module `xstock_fill_safety` (DB-resolved, fail-closed) read via new `server/asset_classes/xstock_spot/fill-safety-config.ts`. Three gates, all on the active path: (1) **freshness** — DB-resolved seconds-scale recency (15s, measured: RTH p99 8.75s); (2) **liquid-fill-window** — hard-block active FILLS outside US RTH 09:30–16:00 ET via NEW `isXstockLiquidFillWindowET` in `market-hours.ts` (token stays 24/5 for scan+VTS; fill-quality liquidity gate only); (3) **silent-stall watchdog** — on `equity-spot-archiver.ts`, two-tier DB threshold (rth 75s / off-rth 750s), gated on `!isInXstockWeekendClose` (now exported from `market-hours.ts`) so the 24/5 feed-live window is respected. | **Retires the old 90s freshness gate on the active path** — freshness is now DB-resolved seconds-scale, not a hardcoded 90s. Hard safety gate before any active xStock fill (audit-4 top risk). DORMANT until activation. **Blast radius: MEDIUM** — fail-closed (missing config blocks the fill, never silently fills). Holiday/half-day "hole" homed → #236 (B6.6, B7b hard-gated). |
| **C4 classify hardening — prefer-stamp + `asValidAssetClass` + escalation hook** | `safeResolveAssetClass` consumer sites (10 active-path `resolveAssetClass` sites) now prefer the upstream stamp via new `asValidAssetClass` helper (present-but-invalid → null → fallback → safe-skip). NEW escalation-hook slot `setClassifyFallthroughHook` (the B3a slot) registered server-side at boot in `index.ts` — active-only system-alert escalation; null = passive WARN+counter. #230 vts-runner fall-through is a hard-skip (all 5 sites reuse the function-entry non-null `_assetClass` → no mislabeled sample can form). | Defense-in-depth on the classify surface: prefer an upstream stamp over re-resolving at consumer sites; escalate (active) vs count (passive). **Blast radius: MEDIUM** — touches every safe-resolve call-site's behavior, but additive (prefer-stamp + safe-skip, no throw). |
| **C5 DB-resolved per-class strategy gate + disposed `enabledStrategies` machinery** | `isStrategyEnabledForAssetClass(canonicalStrategy, assetClass)` fires at the `buildSizedSignalForStrategy` chokepoint right after the stamp-missing throw (reverse-alias `range_trading → range_trade`); reads `module_constants.strategy_gates`. **DISPOSED:** 2 inline `enabledStrategies:[9]` literals + the orchestrator Set machinery (config field, Set+default, the 2 dead public methods `isStrategyEnabled` / `getEnabledStrategies` — zero live callers, sweep-verified) — DELETED_COMPONENTS_LOG entry. **Blast-radius catch:** the `/reb-2-12F/strategy-health` diagnostic (`routes.ts:10617`) was regex-parsing the orchestrator SOURCE TEXT for the deleted Set — re-pointed at `STRATEGY_DISPLAY_NAMES` (a fragile source-text coupling removed). | The DB resolver is now the sole strategy-enablement authority (default-open; throws on cold cache). Default-open (not explicit-allowlist) because an allowlist would black out ALL crypto until a crypto_spot seed migration (out of scope). **Blast radius: HIGH** — sits on the active build chokepoint; default-open keeps crypto behavior unchanged. |
| **C6 `calibration_state` column** | `paper_sim_trades` + `paper_sim_open_positions` — `calibration_state TEXT NOT NULL DEFAULT 'pre_calibration_xstock_2026_05'` (Postgres fast-default auto-backfills every row). Mirrors F-NOW's VTS-side tag. No write-path code. | Tags every paper-sim row with a calibration era. **INERT until a future write-path batch transitions rows** — today the NOT-NULL DEFAULT tags everything uniformly. **Blast radius: LOW** (schema-only). |

**Deferred (C7):** RTB `asset_class SET NOT NULL` DEFERRED to B7b post-activation (#237) — the 48h zero-null soak is vacuous while the only `rtb_signals` writer (the active orchestrator path) is dormant; the substantive deliverable (the resolver-backed write, C1) shipped.

**Edit me if:**
- **Add a new active-path consumer of asset class** → read `sizingContext.assetClass` (the stamp), NEVER re-derive via `resolveAssetClass(symbol)` (collision tickers are wrong-by-construction); the build-site assert + RTB-write throw are the tripwires.
- **Add a new asset class with an active-paper path** → build a `<class>/active-dispatch.ts` connector gated on the authoritative `isEngineActive` flag (not manager presence), reached via `getOrchestratorByMode(mode)` + `dispatchExternalSignal`; stamp `SizingContext.assetClass` at the connector; add a `<class>_fill_safety` config + freshness/liquid-window/stall gates if fills can occur outside a continuous-liquidity window.
- **Enable/disable a strategy per class** → it is a `module_constants.strategy_gates.<class>.<strategy>.enabled` DB row (the C5 gate reads it); there is no longer a hardcoded `enabledStrategies` list in the orchestrator.

## Recent Additions (P19-B6.5c — crypto signal→RTB repair: canonical pattern→strategy routing + `rtb_signals.cwqi` schema reconciliation, 2026-06-17)

The B6.5b crypto-only dry-run proved the front half of the active crypto pipeline works (scanner → pools → orchestrator → SQE all fire, no crash) but surfaced TWO breaks that dropped 100% of crypto signals at the ready-to-buy insert — ZERO reached the queue. B6.5c repairs both. Per-class crypto isolation at the insert was re-confirmed in the B6.5c gate-10 dry-run (xStock signals do not leak into a `crypto_spot` active run).

| Component | Location | Impact |
|-----------|----------|--------|
| **Canonical pattern→strategy resolution (exact-match-or-drop)** | `resolvePatternConsumingStrategy(regime, detectedPattern, assetClass)` in `server/config/canonical-regime-strategy-map.ts`; called from the pattern-pool emitter in `server/services/signal-orchestrator.ts` | Maps a detected pattern to the CANONICAL strategy whose declared `patternType` matches it, in the current regime + asset class. **No consumer in that regime+class → DROP** (counted `getPatternNoMatchDropStats()`, logged `[PATTERN_NOMATCH_DROPS]`) — never map-to-nearest (that would pollute the unrelated strategy's NetEV/win-rate). **REGIME-DEPENDENT**: e.g. PINBAR→`reverse_impulse` (HIGH_VOLATILITY_UNSTABLE) vs →`support_bounce` (RANGE_BOUND_STABLE); ABCD→`volatility_edge` (IMPULSE_EXPANSION) and DROPPED elsewhere — ABCD the pattern feeds `volatility_edge`, NOT the `abcd_long` quant strategy. **Patterns are triggers, not strategies — the 19 canonical strategies (`STRATEGY_DISPLAY_NAMES`) are fixed.** REPLACES the prior bug: the recognizer fabricated invalid `pattern_<name>` strategy strings (e.g. `pattern_abcd`) — not valid `strategy_type` enum values — that were rejected at the RTB insert (the 8,503-drop pattern-pool break). **Strictly ADDITIVE** — the shared `selectContextAwareStrategy` fallback resolver (VTS + xStock) is UNCHANGED. **Blast radius: HIGH** (sits on the crypto active pattern-pool path; gates which pattern signals reach RTB). |
| **`patternToTradeSignal` returns geometry/confidence only** | `server/services/pattern-recognizer.ts` | Naming authority moved out of the recognizer: `patternToTradeSignal` no longer stamps a `strategy:` field (was the source of the invalid `pattern_<name>` strings). It returns geometry + confidence; the orchestrator assigns the canonical consuming strategy via `resolvePatternConsumingStrategy`. **Blast radius: MEDIUM** (upstream of all pattern strategies; signal shape change — strategy now assigned downstream). |
| **Redundant pattern-emission loop removed (orchestrator)** | `server/services/signal-orchestrator.ts` | A duplicate pattern-emission loop in the orchestrator was deleted — the `activeStrategies` dispatch already evaluates every pattern-consuming strategy via its `detect*()` + `buildPatternInputForStrategy`, so the second emission path was dead duplication. **Blast radius: LOW** (dead-path removal; no behavior change beyond eliminating double-emission). |
| **`rtb_signals.cwqi` column DROPPED (schema reconciliation)** | `rtb_signals` table (Supabase); migration `2026-06-17-p19-b6-5c-drop-rtb-cwqi.sql` | The code removed `cwqi` long ago (documented in `legacy/metrics_archive.ts`; absent from `shared/schema.ts`), but a leftover NOT-NULL-no-default `cwqi` (numeric) still existed on the staging DB — so every Drizzle insert (which no longer sends `cwqi`) was rejected, dropping every row regardless of strategy (the 16,930-drop DB-drift break across all strategies incl. the quant `breakout`). Was the only drifted column of the 10 NOT-NULL-no-default columns. DROPPED via **migration** (not a one-box `ALTER`) so the drift reconciles on any environment; tested rollback + MANIFEST registration + DELETED_COMPONENTS_LOG entry. `rtb_signals` no longer has `cwqi`. **Blast radius: HIGH** (sat on the RTB insert path for every signal of every class; the all-strategies crypto break). |

**Strategy-count correction:** the canonical strategy count is **19** (the `STRATEGY_DISPLAY_NAMES` key count: `sma_trend_ride, vwap_pullback, morning_star, pivot_shift, mean_reversion, reverse_impulse, defensive_hedge, inside_bar_reversal, range_trade, support_bounce, abcd_long, adaptive_flow, breakout, vwap_bounce, volatility_edge, dhma, liquidity_trap, strong_bull_trend, orb`). "17" was the pre-`strong_bull_trend` (B63) / pre-`orb` (B79.0d) figure; corrected throughout this doc P19-B6.5c.

**Edit me if:**
- **Add/relabel a pattern→strategy route** → it is the canonical map's per-regime `patternType` declaration consumed by `resolvePatternConsumingStrategy`; never introduce a `pattern_<name>` pseudo-strategy and never map a pattern to a "nearest" canonical strategy (drop on no-match instead, so stats stay clean).
- **The pattern recognizer should NOT name strategies** → `patternToTradeSignal` returns geometry/confidence only; strategy assignment lives in the orchestrator.
