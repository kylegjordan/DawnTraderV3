# BATCH 62 — Pre-Implementation Audit

**Phase:** 15b Sub-Phase B — Regime Taxonomy Redesign
**Date:** 2026-04-16
**Author:** Claude Code
**SIM consulted:** Yes — all 7 affected components traced

---

## 1. Components affected (SIM consultation)

| # | File | SIM § | Blast radius | Change type |
|---|---|---|---|---|
| 1 | `server/core/metrics/market-regime.ts` | §5.1 | **HIGH** | MAJOR — classifier redesign |
| 2 | `server/core/metrics/directional-bias.ts` | §5.1b | LOW (currently) | MINOR — sentinel-zero boolean |
| 3 | `server/services/market-context-engine.ts` | §5.2.5 | **HIGH** | MODERATE — atomic snapshot + filter |
| 4 | `server/services/market-indicators.ts` | §5.5 | MEDIUM | MINOR — supply volume data |
| 5 | `server/config/canonical-regime-strategy-map.ts` | §9.10 | MEDIUM | CONDITIONAL — IE reassignment |
| 6 | `server/services/signal-orchestrator.ts` | §4.1 | CRITICAL (file), LOW (change) | MINOR — remove dormant wire |
| 7 | `server/services/vts-runner.ts` | §7.1 | HIGH (file), LOW (change) | MINOR — remove half-wire |

---

## 2. Upstream dependency trace

### 2.1 market-regime.ts — what feeds the classifier

| Upstream | Source | What it provides | B62 impact |
|---|---|---|---|
| OHLC data | `ohlc-cache.ts` via MCE caller | close/high/low/open for vol, mom, DX | **NEW: also needs DBS score from MCE cache** |
| ATR | MCE computation | Average True Range | No change |
| — | — | — | **NEW: pair-level DBS score must be passed as parameter or read from MCE cache** |

**Key change:** `calculatePairRegime()` currently takes only `ohlcData: OHLCData[]`. B62 must add a DBS score parameter (or read it from MCE cache). This changes the function signature — all callers must be updated.

**Callers of calculatePairRegime() (from SIM + grep):**
1. `market-context-engine.ts` — `computeContext()` calls it directly
2. Indirectly consumed by: signal-orchestrator.ts, vts-runner.ts, market-indicators.ts (all via MCE)

**Risk:** Signature change propagates to MCE. MCE calls `calculatePairRegime()` after computing DBS for the same pair, so DBS is available in MCE's local scope. Low-risk — the data is already there, just needs to be passed.

### 2.2 directional-bias.ts — what feeds DBS

| Upstream | What | B62 impact |
|---|---|---|
| OHLC data | 48-candle lookback | No change |
| ATR | Normalization denominator | No change |
| Config | `DEFAULT_DBS_CONFIG` weights/thresholds | No change (A.1 KEEP) |

**No upstream changes.** The sentinel-zero boolean is a new output field, not a new input.

### 2.3 market-context-engine.ts — what feeds MCE

| Upstream | What | B62 impact |
|---|---|---|
| OHLC data | Passed by callers | No change |
| `calculatePairRegime()` | Regime classification | Changed — now takes DBS |
| `computeDirectionalBias()` | DBS score + components | No change to DBS computation, but **DBS must be computed BEFORE regime** (ordering dependency) |

**Critical ordering constraint (CONFIRMED — previous CC session verified the code):** MCE `computeContext()` currently computes regime FIRST (line ~119: `calculatePairRegime(ohlcData)`) then DBS SECOND (line ~153: `computeDirectionalBias(ohlcData, atr)`). **B62 must swap this to DBS-then-regime** so the DBS score can be passed to the regime classifier. This is a confirmed code change at Step 15, not a risk to investigate.

### 2.4 market-indicators.ts — what feeds global indicators

| Upstream | What | B62 impact |
|---|---|---|
| MCE cache | `getDominantRegime()`, global DBS | No change to reads |
| Volume data | **Currently: not supplied** | **NEW: must source 24h volume from FX5 scanner or Kraken API** |

**Volume data source investigation needed.** The FX5 scanner (`fx5-scanner.ts`) fetches ticker data from Kraken which includes 24h volume. The `cost-cache.ts` (5-minute TTL) may already store volume. Need to verify the data path.

---

## 3. Downstream consumer trace

### 3.1 Regime classifier output consumers

Every component that reads `calculatePairRegime()` output (via MCE) is affected by the regime distribution shift:

| Consumer | What it reads | B62 impact |
|---|---|---|
| **VTS Runner** | Regime → strategy selection | **HIGH** — more pairs route to TFS/IE, fewer to RBS. Strategy capacity must be audited. |
| **Signal Orchestrator** | Regime → strategy selection | **HIGH** — same impact as VTS, but on the active trading path (currently dormant). |
| **market-indicators.ts** | `getDominantRegime()` majority vote | **MEDIUM** — dominant regime may shift if TFS grows from 12.5% toward 18–25%. |
| **ranking-weights.ts** | Global regime for context bonus (±0.06/0.04) | **LOW** — context bonus changes if dominant regime shifts, but it's a small effect. |
| **Frontend dashboards** | Regime distribution display | **LOW** — UI updates automatically from API. |
| **Telemetry aggregator** | Regime-keyed win rates | **MEDIUM** — historical regime-keyed stats will cover a period where the regime meaning changed mid-stream. B62 should note the boundary. |
| **Mapping Drift tab** | Regime distribution + drift score | **LOW** — reads from same `calculatePairRegime()`, auto-updates. |

### 3.2 Canonical regime-strategy map consumers

If IE is redefined or deleted:

| Consumer | Impact |
|---|---|
| MCE | Reads map for strategy filtering — must reflect new IE definition or removal |
| Signal Orchestrator | Strategy list per regime changes |
| VTS Runner | Strategy list per regime changes |
| Bridge sync (`sync-canonical-bridge.ts`) | Auto-regenerates daily — will pick up map changes |
| Mapping Drift UI | Auto-updates from bridge |

### 3.3 Global DBS consumers (after fixes)

| Consumer | What | Impact of fixes |
|---|---|---|
| market-indicators.ts | Calls `mce.computeGlobalBias()` | **Directly affected** — now receives volume-weighted median with full cache coverage |
| VTS trade metadata | `globalDirectionalBias` field | More stable value (less flicker from cache composition noise) |
| Frontend display | Global DBS on dashboards | More stable, meaningful value |

---

## 4. Shared state analysis

| Shared state | Who reads | Who writes | B62 risk |
|---|---|---|---|
| MCE per-symbol cache (60s TTL) | Signal orchestrator, VTS runner, market-indicators | MCE `computeContext()` | **MEDIUM** — atomic snapshot addition for global DBS must not break per-symbol cache reads. Separate data structure recommended. |
| `SYSTEM_GUARDS` config | Signal orchestrator, VTS runner | DB-driven (screener_filters table) | **NONE** — B62 doesn't modify SYSTEM_GUARDS. |
| Telemetry aggregator state | VTS runner (exclusive writer), market-indicators (reader) | VTS runner | **LOW** — regime-keyed aggregation will see distribution shift. No code change needed. |
| Active filter pool | FX5 scanner (writer), signal orchestrator + VTS (readers) | FX5 scanner | **NONE** — B62 doesn't modify filter logic. |
| Bridge JSON files | Frontend, docs | `sync-canonical-bridge.ts` (daily) | **LOW** — auto-regenerated. IE map changes will propagate. |

---

## 5. Background execution analysis

| Component | Execution model | B62 concern |
|---|---|---|
| MCE `computeContext()` | Per-pair, per-60s-cycle, synchronous | DBS-before-regime ordering must be enforced. Currently both computed in same call. |
| VTS Runner | 60s interval, dual-path (quant + pattern) | More pairs in TFS/IE = more strategy evaluations per cycle. Must not exceed cycle budget. |
| Signal Orchestrator | Event-driven (active filter pool) | Currently dormant. No B62 concern. |
| `sync-canonical-bridge.ts` | Daily scheduler task | Will auto-pick-up IE map changes. No concern. |
| Telemetry emitters | Fire-and-forget, feature-flagged | Keep running through B62 for comparison data. |

---

## 6. Risk summary

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `calculatePairRegime()` signature change breaks callers | §2.1 | LOW | HIGH | Only one direct caller (MCE). Grep for all call sites before changing. |
| DBS-before-regime ordering violation | §2.3 | LOW | HIGH | Verify MCE `computeContext()` computes DBS first. Add assert if needed. |
| VTS cycle budget exceeded under higher TFS flow | §5 | MEDIUM | MEDIUM | Capacity audit in Phase 1 §4.8. Measure cycle time pre/post deploy. |
| Global DBS atomic snapshot races with per-symbol cache | §4 | LOW | MEDIUM | Use separate Map for global snapshot, don't modify per-symbol cache. |
| Telemetry aggregator regime-keyed stats become inconsistent | §3.1 | HIGH (will happen) | LOW | Note the boundary timestamp in telemetry. No code fix needed. |
| IE strategy reassignment breaks strategy detection logic | §3.2 | LOW | MEDIUM | Test each reassigned strategy against its new regime's typical indicator values. |
| Dormant-wire removal triggers unexpected import errors | §3.1 | LOW | LOW | Check all import chains. The import is at line 89; removing the consumer at L454 still needs the import removed. |

---

## 7. Implementation plan (25 steps)

### Phase 0 — Counterfactual Routing Analysis (no code changes)

| Step | Description | Depends on | Deliverable |
|---|---|---|---|
| 1 | Pull latest telemetry from staging (~24h+ window by now) | — | Raw data |
| 1.5 | (Optional) Shadow telemetry: add `computeContext()` call for benchmark pairs in MCE scan, emit to telemetry without passing to VTS evaluation. Deploy to staging. | Step 1 | Benchmark DBS telemetry begins accumulating |
| 2 | Build counterfactual classifier script: apply Designs A, B, C to each cycle-sample | Step 1 | `scripts/phase15b/b62_phase0_replay.py` |
| 3 | Run counterfactual: regime distribution under each design | Step 2 | Per-design regime distribution table |
| 4 | Run counterfactual: per-strategy eligibility under each design (regime→strategy map lookup) | Step 3 | Per-strategy newly-eligible pair-cycle counts |
| 5 | Run proxy signal assessment: for newly-eligible tuples, estimate detect-function plausibility from telemetry fields (ADX, vol, mom, DBS) | Step 4 | Proxy signal estimates with confidence bounds |
| 6 | Run proxy gate survival: apply SQE/RTB/NetEV thresholds to proxy signals | Step 5 | Gate survival rates |
| 7 | Compute x/y split per strategy (regime-scarcity vs gate-rejection) | Step 6 | Failure-mode decomposition table |
| 8 | Write Phase 0 report with Path D decision | Steps 3–7 | `BATCH_62_PHASE0_REPLAY_ANALYSIS.md` |
| 9 | Langston reviews Phase 0 report | Step 8 | Written confirmation |
| 10 | Select classifier design (A, B, or C) based on Phase 0 data | Step 9 | Design selection with rationale |

### Phase 1 — Implementation (code changes begin, market-regime.ts freeze lifts)

| Step | Description | Depends on | Files |
|---|---|---|---|
| 11 | **Global DBS fix #3:** Add `sentinelZero` boolean to `DirectionalBiasResult` type | Step 10 | `directional-bias.ts`, `directional-bias.types.ts` |
| 12 | **Global DBS fix #2:** Implement atomic full-universe snapshot in MCE for global DBS computation | Step 11 | `market-context-engine.ts` |
| 13 | **Global DBS fix #1:** Source 24h volume from cost-cache/FX5 scanner, pass to `computeGlobalBias()` | Step 12 | `market-indicators.ts`, `market-context-engine.ts` |
| 14 | **Classifier redesign:** Modify `calculatePairRegime()` to accept DBS score parameter and implement selected design | Step 13 | `market-regime.ts` |
| 15 | **MCE wiring:** Update `computeContext()` to pass DBS score to `calculatePairRegime()`. Verify DBS-before-regime ordering. | Step 14 | `market-context-engine.ts` |
| 16 | **IE redefine Step 1:** Implement new IE criterion in classifier (initial candidate thresholds, subject to measurement) | Step 14 | `market-regime.ts` |
| 17 | **ST review:** Evaluate whether the default `else` fallback in classifier needs narrowing based on Phase 0 data | Step 14 | `market-regime.ts` (if changed) |
| 17.5 | **VTS benchmark unblock:** Remove Directive 11.6F benchmark exclusion filter at `vts-runner.ts` ~L1256-1257. Benchmarks join VTS trading universe. | Step 14 | `vts-runner.ts` |
| 18 | **Dormant-wire removal:** Remove dead code at signal-orchestrator.ts:448–467 + unused import at L89 | Step 14 | `signal-orchestrator.ts` |
| 19 | **Half-wire removal:** Remove dead code at vts-runner.ts:875–877 + unused import at L67 | Step 14 | `vts-runner.ts` |
| 19.5 | **Global DBS cap constant:** Add `GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT = 1.0` (configurable, effectively disabled) | Step 13 | `directional-bias.ts` or config |
| 20 | **Canonical map update:** If IE is redefined, update strategy assignments in canonical map | Step 16 | `canonical-regime-strategy-map.ts` |
| 21 | **CI check:** Run full CI suite. No new failures. TS Check unchanged at 654 baseline. | Steps 11–20 | CI output |
| 22 | **Langston code review:** Full git diff before push | Step 21 | Change list |
| 23 | **Push + deploy:** GitHub push, staging deploy (`git pull && npm run build && pm2 restart dawntrader`) | Step 22 | Staging live |
| 24 | **Post-deploy verification (≥72h after deploy — B62 cannot close before this).** Run A.2 scripts on ≥72h post-deploy telemetry on full universe (including benchmarks). Check: RBS drift < 30%, TFS+IE ≥ 15% floor, family flicker ≤ 2.0%, component-clamp saturation rates. Re-run A.0 for new classifier flicker baseline (mature-window A.0 1.56% is authoritative; original 1.37% superseded). Report BTC volume weight share in global DBS — if consistently > 40%, evaluate activating cap. | Step 23 | Verification report |
| 25 | **Governance + completion report:** Update System Manual Layer 1 (new classifier logic), SIM (new connections), Batch Catalog, Phase History. Write B62 completion report. | Step 24 | Governance files |

### Step ordering rationale

- **Steps 11–13 (global DBS fixes) before Step 14 (classifier):** Global DBS fixes are a mandatory B62 prerequisite chain for downstream global-bias consumers (market-indicators.ts, VTS trade metadata, frontend). They land first because they are an independent workstream with no dependency on the classifier redesign, and completing them early clears the prerequisite before any downstream consumer might read global DBS. The pair-level classifier redesign (Step 14) does NOT depend on global DBS — it depends on pair-level DBS only (per the dependency separation in scope §2).
- **Step 14 (classifier) before Steps 16–17 (IE/ST):** The base classifier redesign should land first, then IE and ST refinements are layered on top.
- **Steps 18–19 (dead code removal) after Step 14:** The dead code references `computeBiasConfidenceModifier`. If the selected design doesn't use it, removal is clean. If the design does use it (unlikely — all three designs consume DBS at classifier level), the wire would be refactored instead.
- **Step 24 requires 72h of post-deploy data:** Deploy early, verify later. The 72h wait is for the verification metrics, not for the deploy itself.

---

## 8. Benchmark decisions (Kyle locked 2026-04-16)

**Decision 1: Phase 0 on current 60-pair universe.** No VTS benchmark unblock before Phase 0.

**Decision 2: Unblock VTS benchmarks at Phase 1 start.** Remove Directive 11.6F filter. 72h post-deploy verification on full universe.

**Decision 3: Include BTC/ETH/SOL in global DBS.** Flow benchmark MCE contexts into `computeGlobalBias()`.

**Decision 4: No volume cap initially.** Add configurable `GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT = 1.0` (disabled). Report BTC weight share post-deploy. Activate cap at 20-25% only if BTC consistently > 40%.

**Implementation impact on the plan:**
- Step 1.5 (optional): Shadow telemetry for benchmarks — call `computeContext()` for benchmark pairs, emit telemetry, but don't pass to VTS evaluation. Provides benchmark DBS data for Phase 0 validation without delay.
- Step 13: Volume data now must include benchmark pairs. `computeGlobalBias()` reads benchmark + non-benchmark contexts.
- New Step 14.5: Remove Directive 11.6F benchmark exclusion in `vts-runner.ts` (~L1256-1257).
- Step 24: Verification metrics measured on full universe including benchmarks. Report BTC volume weight share.

---

*End of BATCH_62_PRE_AUDIT.md*
