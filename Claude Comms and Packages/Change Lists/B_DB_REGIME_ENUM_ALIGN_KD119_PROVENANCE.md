# B-DB-REGIME-ENUM-ALIGN (#1263) — KD-119 provenance and data-continuity pack

## Control record

- **Owner:** ANALYST Codex, standing in for ANALYST Claude (CC-C)
- **Workflow boundary:** Step 11 of 11
- **Decision recorded:** **ACK KD-119** — all twelve dormant entries are under a no-delete hold. Kyle has approved neither deletion nor a pre-live rebuild.
- **Runtime anchor measured:** staging app source/build `e3a96a8126f0280a9568bb1823b9210783f0afe0`; all nine mechanism files named in §4 have the same git blob at e3 and this investigation ref. Positive control: the same comparison finds many documentation/governance files changed between e3 and this ref.
- **Purpose:** distinguish a disconnected January prototype from the intended ML/AI system, determine what data is actually retained or lost, and give Coltrane an evidence-backed technical disposition. This pack authorizes no code deletion, reconnect, deployment, mode change, or restart.

## Executive finding

The twelve list rows are not the future ML/AI system. They are a January 2026 prototype chain: SQL persistence for a rolling telemetry map, timestamp-decayed strategy-weight persistence, a hand-written Dynamic Sizing Engine (DSE), and a five-minute cost-snapshot loop. The weight producer, DSE consumer, cost-loop starter, and most repository exports were never connected to production; `adaptive_learning` has zero current rows, and the current PostgreSQL statistics epoch reports zero inserts. Reconnecting that chain would not preserve a learned model — it would introduce an untrained, pre-governance sizing formula that conflicts with the current fixed-notional paper path and the separately designed future M1–M6/Feature-Store system.

The active system is not losing its main learning corpus on restart. At 2026-11-24 13:42–13:43Z it retained 277,671 VTS trade rows, 242,109 RTB shadow pairings, 2,136 paper/live closed-trade rows, and tens of millions of archive rows. What does reset is the in-memory 24-hour `pairTelemetry` view used by adaptive scanner ordering: the live API held 134 symbols / 246 samples, while the 57-byte restart file held only `cascadeHistory`. Cost-history is also absent: the 168-hour endpoint returned zero snapshots because its loop has no starter, and its writer would currently attempt invalid `mode='system'` data.

Technical recommendation for Coltrane to attack: retain the active file rehydrator; repair the *restart-continuity contract* and the *cost-history contract* only as separately scoped designs; isolate the disconnected adaptive-weight/DSE prototype from runtime and future-ML claims; eventually delete only the globally unsafe or redundant helpers after Kyle separately places that cleanup. No old adaptive or sizing path should be reconnected before live.

---

## 1. Original design and implementation provenance

| date / commit | original directive | what it intended | what was actually connected |
|---|---|---|---|
| 2026-01-08 · `d4227c5e37c5e8cfb83ed7487c0e0a32763428d3` | `attached_assets/Pasted--Directive-11-1A-Persistent-Intelligence-Contextual-Sta_1767873788550.txt` | Replace JSON telemetry history with live-only, SQL-backed, regime-tagged telemetry; rehydrate after restart; allow `FORCE_PERSIST=true` for tests; prevent split-brain storage. | The per-record repository writer is called from VTS telemetry, but `shouldPersist()` is false in staging paper mode. The class SQL rehydrator has no caller. A later, different file rehydrator restores only `cascadeHistory` and sets the same `rehydrated` flag. |
| 2026-01-08 · `99f75413b7fac6b4c04cfbc510f62034d04bb7f9` | `attached_assets/Pasted--Directive-11-1B-Updated-Revision-Adaptive-Learning-Wei_1767877855949.txt` | Persist per-strategy, per-regime adaptive weights with timestamps; apply exponential age decay on restart through `AdaptiveManager`. | The aggregator persistence and rehydration methods have no production callers. `AdaptiveManager` has no separate production producer. The table has never received a row. |
| 2026-01-08 · `9aa2d2a0b82228efcf1d4fe923ea38a5a8e12f8e` and `3825119fad195f92ab4f15798018fd5cd53de5a4` | `attached_assets/Pasted--Directive-11-3-Predictive-Risk-Cost-Modeling-Dynamic-S_1767882515730.txt` | Replace static TEC sizing with a 0.3–1.2 multiplier driven by expected edge, volatility, costs, confidence, and adaptive weights, bounded by a hard risk cap. | `computeDynamicSize` has no non-test caller. The adjacent `applyDSEMultiplier` helper also has no non-test caller. DSE diagnostics imports remain, but the route is mounted after an API-router catch-all and staging returns HTTP 404. |
| 2026-01-09 · `840c5226c97a857e9499c03c3f758cd150c815a2` | `attached_assets/Pasted--Directive-11-3C-Persistent-Cost-Telemetry-Drift-Monito_1767948051606.txt` | Persist a market-cost snapshot every five minutes for 72 hours, detect >50% drift, feed cost pressure to DSE, and expose diagnostics. | `startCostTelemetryLoop` and `startDriftMonitor` have no callers. The live reader endpoint is reachable but empty. `persistCostSnapshot` casts `system` into a paper/live enum, so starting it unchanged would fail its data contract. |
| 2026-04-01 · `b518ef43a4ed5de477cbe489617db68024231e3a` | Batch 46 state persistence | Preserve telemetry aggregate state through a local restart file. | This is the **active similarly named rehydrator** at module scope. It restores only `cascadeHistory`, writes every 60 seconds, and sets `instance.rehydrated=true`. It is not the class SQL method and must be preserved. |
| 2026-08-07 to 2026-09-30 · `213e162dca4d693def843a0bb44b1f7c4c9ad66c`, `7219de4c7287ff849cc707a13806935d361e2270`, `06fa8ba0457104375ac1d411d549cc242de6cc11` | B-SIZING-DEC-RESTORE | Replace inverse-stop-distance sizing with one fixed-notional formula for the active signal path. | The paper signal is born at `balance × exposure% × position% × 0.97 / entryPrice`; there is one non-test caller. The paper execution engine can then multiply that already-sized quantity by the AMR posture overlay. |

The January implementation therefore contains two unfinished contracts, not one coherent active learning system: (a) rolling scanner telemetry persistence/rehydration and (b) a speculative adaptive-weight-to-sizing chain. They must not be revived as a unit.

## 2. Why this is not the intended future ML/AI system

`Claude Comms and Packages/Cross-Session Briefs/ML_DESIGN_PRELIMINARY_2026-05-21.md` supersedes the January concept at the architecture level:

- one point-in-time-correct **Feature Store** consolidates raw evaluations, pair scans, outcomes, alternates, lineage, macro, ticker, and OHLC data;
- M1 predicts outcomes, M2 learns AMR posture, M3 optimizes sizing/growth, M4 mines trends, M5 provides a conversational layer, and M6 forecasts market state;
- the rule-based kernel remains the safe fallback;
- every model shadows before live, has bounded authority, and must beat the baseline;
- M3 progresses from contextual-bandit/Kelly work to offline RL and only later to bounded live authority.

The January limb instead stores arbitrary numeric maps keyed by strategy/regime, derives `expectedEdge` and `confidence` from loosely named keys or averages, and immediately maps them into a hard-coded sizing formula. It has no point-in-time feature set, label definition, training/validation split, versioned model, shadow comparison, drift fallback, or outcome-population boundary. Preserving its source for provenance is reasonable; calling it the future ML system or reconnecting it as such is not.

The intended current replacement boundaries are:

- **Paper base sizing:** `server/services/active-position-sizing.ts:sizeActivePositionForSignal`, one production caller in `signal-orchestrator.ts`; fixed notional, not January DSE.
- **Paper posture modulation:** `active-execution-engine.ts` multiplies pre-sized quantity/value by `modeOverlay.positionSizeMultiplier`; staging `amr_runtime.mode` is `shadow` for both `crypto_spot` and `xstock_spot`.
- **Separate live-engine prototype:** `TradingEngine('live')` still contains `riskAmount / stopDistance`, but staging `live_engine_gate.live_engine_enabled=0`. It is not the active paper replacement and must not be conflated with it.
- **Future sizing:** sprint row 148c is fractional Kelly after calibrated pWin and selection IC; post-live M3 is the ML sizing/growth optimizer. Both require validated outcomes rather than `adaptive_learning`'s empty generic weight maps.
- **Future AMR:** sprint row 124a repairs what the watch-only AMR observes; post-live row 25-6 trains the M2 brain on paper-active outcomes. The response body is reusable; January DSE is not the brain.

## 3. Current capture, loss, and restart behavior

### 3.1 Exact and estimated runtime measurements

Measured on staging at 2026-11-24 13:42–13:43Z, without a restart or state change:

| population | measured result | instrument / meaning |
|---|---:|---|
| telemetry API | 134 symbols / 246 samples | exact current in-memory `pairTelemetry` map via authenticated `GET /api/telemetry/summary` |
| restart state file | 57 bytes | exact file content: version, timestamp, empty `cascadeHistory`; no `pairTelemetry`, weights, cost history, or DSE history |
| app process | pid 2822823; restart count 715; uptime epoch 1795478578039 | current PM2 process; no restart during this read |
| `telemetry_history` | 2 total / 0 ordinary | exact count; both rows are #1263 proof rows |
| `adaptive_learning` | 0 total; 0 inserts in the current statistics epoch | exact row count plus table statistics |
| cost history | 0 snapshots over 168 hours | exact authenticated endpoint result |
| VTS trades | 277,671 total / 277,404 closed / 1,790 closed in trailing 24h | exact table counts |
| RTB shadow pairings | 242,109 total / 242,046 closed / 1,203 closed in trailing 24h | exact table counts |
| paper/live `closed_trades` | 2,136 total / 2,122 with `closed_at` / 50 closed in trailing 24h | exact table counts |

Partitioned archive totals below are PostgreSQL statistics estimates, not exact counts:

| archive family | relations | estimated live rows | cumulative inserts |
|---|---:|---:|---:|
| `signal_eval_archive*` | 31 | 34,859,192 | 34,895,378 |
| `signal_eval_provenance*` | 19 | 33,411,506 | 33,409,357 |
| `pair_scan_archive*` | 19 | 11,077,584 | 11,077,324 |
| `macro_feed_archive*` | 19 | 78,534 | 78,534 |
| `exit_strategy_alternates` | 1 | 364,356 | 366,688 |
| `regime_factor_alternates` | 1 | 56,852 | 154,168 |
| `filter_diagnostics` | 1 | 83,753 | 168,085 |
| `strategy_drive_metrics` | 1 | 54,191 | 78,319 |
| `telemetry_lineage` | 1 | 37,821 | 75,852 |
| `data_lineage` | 1 | 34,494 | 63,092 |

This proves that restart does **not** erase the main feature/outcome corpus. The unfinished January tables are not its only copy.

### 3.2 What the rolling telemetry adds, and what is reconstructible

Both production `recordPairTelemetry` callers are in `vts-runner.ts`. They record symbol/class, hybrid score, regime weight/score, predictive confidence, success, pool, source, regime, signal type, strategy, pattern, and sometimes vol/trend Z-scores. The durable `vts_open_trades` table stores symbol/class/regime/signal/strategy/pool directly and, in its JSON context, stores `hybridScore`, `regimeWeight`, `regimeScore`, `predictiveConfidence`, and `patternType` on all 1,790 trailing-24-hour closed rows measured. It stores no `finalScore`, `volZ`, or `trendZ` on those rows; `finalScore` is intentionally retired at this producer. Outcome economics are retained in the wider trade/outcome corpus, but the exact rolling scanner-map event is not a single durable replay record.

Consequences:

1. A restart loses the exact 24-hour derived ordering state used by `AdaptiveScanManager.getTopPairs`; it repopulates as VTS events arrive.
2. This is an operational continuity seam, not months of erased training data: the map itself has a 24-hour horizon and most inputs plus the underlying market/outcome corpus remain durable.
3. Directly enabling the January SQL path is unsafe. Staging has no `MODE`, `FORCE_PERSIST`, or `PERSIST_TELEMETRY` environment key (positive control: exactly one `DATABASE_URL` key), so the current writer is intentionally off in paper mode. The SQL rehydrator reads only `mode='live'`, only one global current regime, at most 100 rows, and does not restore the required asset-class stamp. The active file helper also sets the same `rehydrated` flag first, making the SQL method skip.

### 3.3 Cost capture

The current cost cache and per-decision trade contexts preserve some fee/spread/slippage evidence, but the intended *cost-environment time series* is absent. The 168-hour cost endpoint returned zero snapshots. Starting the existing loop unchanged is not an acceptable safeguard: it abuses score columns for costs, uses a three-value `system` mode against the two-value paper/live contract, has a 72-hour deletion horizon, and would feed a DSE path that is itself isolated. Cost history is valuable, but it needs its own schema/provenance and no sizing consumer until separately reviewed.

## 4. The twelve list rows: replacement, contract, and proposed disposition

The “twelve components” are twelve review rows, not twelve callable symbols: rows 8 and 9 each group multiple functions. The adjacent `applyDSEMultiplier`, DSE diagnostic exports/routes, cost readers, and drift monitor are outside the literal twelve but share the same future-capability boundary and are named here to prevent a partial cleanup.

Disposition terms in this pack mean: **RETAIN** = active and correct; **ISOLATE** = keep disconnected and clearly non-authoritative; **REPAIR** = preserve the duty/data contract but redesign it before connection; **DELETE** = no unique duty remains, technically safe to remove only after the KD-119 hold is lifted and Kyle places it.

| # | dormant row | unique intended duty | active replacement / retained contract | proposed technical disposition |
|---:|---|---|---|---|
| 1 | `telemetry-aggregator.ts:updateMarketRegime` | Set one global telemetry regime. | Runtime writers carry the canonical pair regime; MCE/telemetry expose per-class regime. A global setter would reintroduce mixed-class state. | **DELETE** after hold/placement. No reconnect. |
| 2 | class method `rehydrateTelemetryState` | Restore rolling pair telemetry after restart. | No safe replacement currently restores `pairTelemetry`; the module-level helper restores `cascadeHistory` only and stays active. | **REPAIR** the contract, not this body: separate flags, class stamp, mode/population semantics, bounded replay. Existing method remains isolated until reviewed. |
| 3 | `rehydrateAdaptiveLearning` | Load timestamped strategy weights into `AdaptiveManager`. | Future Feature Store/model registry; current active B67.4 outcome feedback is a different live system. No weight rows exist. | **ISOLATE** as historical prototype; do not reconnect to future ML by name alone. |
| 4 | `persistAdaptiveLearning` | Persist all in-memory adaptive weights. | No production producer updates this `AdaptiveManager`; future models require versioned features/labels/models. | **ISOLATE**. Reconnecting would persist arbitrary maps without a validated learner. |
| 5 | `saveAdaptiveWeightsBatch` | Batch wrapper over single-row weight upserts. | No caller and no unique data contract beyond item 4. | **DELETE** eventually with the old persistence limb, after hold/placement. |
| 6 | `getAdaptiveLearningStats` | Count old adaptive rows by strategy. | Zero-row table; future model observability must report model version, cohort, calibration, and drift, not generic row counts. | **DELETE** eventually after hold/placement. |
| 7 | `computeDynamicSize` | January edge/volatility/cost/confidence multiplier. | Active paper fixed-notional sizing + AMR shadow overlay; future sprint 148c fractional Kelly and post-live M3. | **ISOLATE**. Never reconnect pre-live; future design may reuse concepts, not this authority path. |
| 8 | private `getAdaptiveWeights` + repository `loadAdaptiveWeights` | Feed old weights to DSE. | Only production path is inside dormant `computeDynamicSize`; future M3 reads validated feature/model outputs. | **ISOLATE** with DSE; eventual deletion only after Phase 17/18 confirms no historical adapter need. |
| 9 | `startCostTelemetryLoop` + `persistCostSnapshot` | Durable cost-environment history. | Per-decision cost fields exist, but no aggregate time series. Reader endpoint is live and empty; DSE cost-pressure consumer is dormant. | **REPAIR** as capture-only, typed cost telemetry with provenance/retention; keep disconnected from sizing. Do not start old writer. |
| 10 | `saveTelemetryBatch` | Batch insert identical telemetry records. | Active writer uses `saveTelemetryRecord`; no caller needs batch semantics. | **DELETE** eventually after hold/placement. |
| 11 | `getTelemetryStatsByRegime` | Generic 24-hour average score by regime. | Active in-memory telemetry endpoints and future Feature Store queries; no caller. `finalScore` is being retired. | **DELETE** eventually after hold/placement. |
| 12 | `loadTelemetryBySymbol` | Generic symbol/time-window query. | No caller; future point-in-time features require class/source/build/epoch semantics beyond this query. | **DELETE** eventually after hold/placement. |

**Mandatory preservation outside the twelve:** module function `rehydrateTelemetryState(instance)` at the bottom of `telemetry-aggregator.ts` is **RETAIN**. It is invoked by `getTelemetryAggregator`, restores `cascadeHistory`, arms the 60-second state timer, and is not the dead class method. Its use of the class `rehydrated` flag is a defect to split if row 2 is repaired, not a reason to delete it.

**Adjacent boundary:** `applyDSEMultiplier` is dormant with non-test references only in the DSE integration test; DSE diagnostics source is mounted after the API catch-all and staging returns 404. Cost readers are reachable and currently empty. A later cleanup must treat these as explicit siblings rather than claiming the twelve rows remove the whole limb.

## 5. Existing sprint and after-live coverage

Search population: the complete current `1-system-manual/SPRINT_TO_LIVE_PLAN.md` and `Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md`, with the roadmap/design documents named below. This is the current plan coverage touching adaptive learning, AMR, learning columns/retention, predictive confidence, sizing, or AI/ML integration.

### 5.1 Sprint rows — capture and retention before tuning

- **1e** `B-TRADE-RECORD-RETENTION`: one-year trade retention and archive-policy governance; nothing expires before 2027-05.
- **4a** `B-VTS-TELEMETRY-AGGREGATES`: closed; fixed active VTS aggregate lookup/staleness defects and moved confidence-input hygiene to row 148a.
- **100** learning-record restart and **101m/101/101r** mechanics/observation/reconfirmation boundaries.
- **103–124c learning-data wave:** outcome corpus, excursion record, xStock correlation collection (closed), paper-lane provenance, replay parity, fee-basis stamp, remaining learning columns, entry-mode/regime/decision-quote/exit-rung/joinability fields, VPNL bound, VTS posture contamination, strategy error, frozen symbol set, archive lifecycle/outage hold/drain order/rollback epoch/calibration reset/provenance-loss census/ablation identity, AMR input-integrity arc, drought data defects, and news/alt-data capture.
- **125** accumulation gate: tuning consumes only adequately powered or explicitly underpowered cells.
- **141b–150 score/calibration wave:** paper-factor capture repair; xStock calibration; missing-DBS premise remeasure; regime and confidence modifiers; retired-score removal; calibrated pWin/model rebuild; selection IC; fractional-Kelly sizing; validated quality rank; hold-time default; SQE/DI recalibration.

These rows already separate *capture first* from *calibration and authority later*. Reconnecting the January limb would bypass that sequencing.

### 5.2 After-live ML/AI and adaptive work

- `B-AMR-CONTEXT-BONUS-REWIRE`; AMR switch-on remains after live while input integrity moved to sprint row 124a.
- Phase **17.1–17.6**: scope, touchpoint mapping, infrastructure, research/feature engineering, blueprint/policy/predictive adjustment/calibration/regime adaptation, and trend mining.
- Phase **18.1–18.5**: Feature Store/data pipeline, model training/validation, parallel integration, ML-primary operation, and trend mining.
- **19.6.4** ML/AI conversational API; periodic ML edge-scan job.
- **25-6** learned AMR M2 brain; **25-11** liquidity-aware sizing model; **25-22** edge-decay; **25-23** hidden-state regime; **25-24** weak-feature enrichment; **25-25** cross-instrument signals; **25-27** profitable-signal profile/pre-screen.
- `#1263 residue` remains a separate database-enum historical/rebuild decision; it is not authorization to delete these twelve functions.

Supporting current design/audit homes: `ML_DESIGN_PRELIMINARY_2026-05-21.md`, `LEARNING_AND_STORAGE_AUDIT_2026-08-07.md`, `P25_SCORING_STACK_PRESTUDY.md`, `POST_AUDIT_ROADMAP.md`, `SYSTEM_IMPACT_MAP.md`, and `SYSTEM_MANUAL.md`. The August audit already distinguishes the active B67.4 outcome-feedback store from the orphaned January adaptive repository and says the future AMR brain likely needs raw trade-level features.

## 6. Separate immediate safeguard proposal

### Proposal: `B-PAIR-TELEMETRY-RESTART-CAPTURE` — capture-only, no consumer switch

**Problem it would solve:** preserve the exact rolling VTS telemetry events that currently disappear at restart, so scanner-order continuity and later provenance can be replayed rather than rebuilt opportunistically.

**Narrow design boundary:**

1. append accepted VTS telemetry events to a typed, versioned, class/source/build/session-stamped store;
2. retain raw event fields, including explicit missing/defaulted flags; do not reuse score columns for unrelated values;
3. no DSE, AMR, confidence, rank, or scanner consumer change in the capture increment;
4. a separate reviewed increment may add bounded 24-hour replay after it proves class/mode/epoch semantics and does not double-count;
5. preserve the active `cascadeHistory` file helper; do not flip `FORCE_PERSIST`; do not start the old SQL rehydrator;
6. slot-check against sprint rows 103, 106–108, 114, 123, and 148 so it folds into an existing canonical event/corpus contract if one already owns the fields.

**Recommendation:** **do not insert this ahead of go-live merely because the old method exists.** The measured loss horizon is 24 hours and the main training corpus is durable; this is a small continuity improvement, not an emergency months-of-data rescue. PM/owners should first slot-check whether row 103 or 123 already captures the missing event identity. If it can be folded into one of those rows without moving the live sequence, do so; otherwise place it separately without blocking go-live.

### Cost-history sibling

If cost-environment history is judged more valuable than pair-ranking replay, scope a separate capture-only cost table with a real mode/scope enum and explicit fee/slippage/spread units. It must not start the old `mode='system'` writer or feed DSE. This is also non-blocking because per-decision cost evidence already exists and dedicated fee/provenance rows are in the sprint.

## 7. Static reachability and fresh-reader record

Main-session re-derivation across `server`, `client`, `shared`, and `scripts` TypeScript sources:

- zero production callers: items 1, class method 2, 3–7, 9 starter, 10–12, and adjacent `applyDSEMultiplier`;
- item 8 is reached only inside dormant item 7;
- `persistCostSnapshot` is reached by its dormant starter and tests only;
- positive controls: the same search finds the active module rehydrator invocation, `loadRecentTelemetry` use, the active fixed-notional sizing call, and active cost-reader route uses.

Fresh-reader pass:

`REVIEWER: claim-only · /root/b1263_dead_limb_fresh_reader · HIT · re-derived yes`

Hits folded into this pack:

1. “Fixed-notional replacement” needed paper-path scope because the separate gate-disabled live engine still has inverse-stop-distance sizing.
2. AMR can post-multiply the fixed-notional paper size.
3. The two same-named rehydrators have different duties, and the active helper's shared flag blocks the SQL method.
4. Twelve list rows contain more than twelve callable symbols; adjacent `applyDSEMultiplier` is dormant too.
5. DSE/cost modules have reader/diagnostic siblings even though their writers/compute path are dormant.
6. Zero-caller claims needed an exact source/ref scope and runtime/deployed-source check.

All six were re-derived against the e3-identical source and staging runtime. The diagnostics sibling is weaker than its source suggests: DSE routes are presently unreachable because the API catch-all precedes their mount.

## 8. Questions for Coltrane's technical ruling

Please independently attack and return an exact disposition for:

1. the row-by-row RETAIN / ISOLATE / REPAIR / DELETE classifications in §4;
2. whether row 2's restart duty is real enough to repair, or whether the 24-hour repopulation plus durable source corpus makes it unnecessary;
3. whether cost-environment history has a unique future-learning value not already covered by per-decision cost fields and sprint rows;
4. whether any item proposed DELETE carries an undocumented external/dynamic consumer or a data contract not named here;
5. whether `B-PAIR-TELEMETRY-RESTART-CAPTURE` should fold into an existing sprint row, be separately placed without blocking go-live, or be rejected;
6. the exact boundary around adjacent DSE/cost routes, tests, drift monitor, and `applyDSEMultiplier`.

Until that ruling and Kyle's later placement, **KD-119 means no deletion and no reconnection**.
