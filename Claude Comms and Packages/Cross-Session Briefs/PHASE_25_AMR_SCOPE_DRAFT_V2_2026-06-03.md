# Phase 25 — Adaptive Market Response (AMR) body — SCOPE DRAFT v2 (asset-class-aware)

> **From:** CC session in active Kyle-facing conversation (2026-06-03).
> **To:** Kyle (decider) + Langston (Step-1 review) + the other CC session running B79.0n.CONFIDENCE-CHAIN.
> **Type:** Step-1 SCOPE DRAFT v2 — supersedes v1. v1 was global-only; **v2 is asset-class-aware end-to-end** (Kyle directive 2026-06-03: "Each asset class will have its own Global regime and Global DBS, so… its own weather patterns that need to be adjusted to").
> **Scope shape unchanged from v1:** AMR **body only** (weather-report aggregator + dial plumbing + AGGRESSIVE mode + new dial types + per-asset-class config). Brain = conservative operator-set thresholds. Brain becomes ML M2 post-launch.
> **Sequencing unchanged:** Phase 25, after Phase 24 (xStock calibration) closes, BEFORE Phase 19. The pre-Phase-19 placement gives Phase 19's paper-audit window double-duty as AMR's live tuning runway.
> **Per-class is structural, not optional.** Per CLAUDE.md §5 #15 (NO-PATCHES, per-asset-class as default for behavioral knobs), every AMR knob is DB-resolved with `asset_class` as a first-class dimension. There are no silent fallbacks that mix classes.

---

## §1 — What changed from v1 → v2

| Concept | v1 (global) | v2 (per-class) |
|---|---|---|
| Weather report | One global report | **One per active asset class** (`Map<AssetClass, AmrWeatherReport>`) |
| Strategy mode | One global mode | **One per active asset class** at any moment — crypto_spot can be SURVIVAL while xstock_spot is NORMAL |
| Aggressive dial defaults | Single set | Per-class seeds (crypto_spot and xstock_spot tuned independently) |
| Hard-pause | Global pause | **Per-class pause** — crypto can halt while xStock keeps trading |
| Slot caps | Global cap | Per-class cap (already aligns with how open-position tracking works) |
| Strategy-roster allowance | Global list | Per-class list |
| Diagnostic endpoint | Single report | Map keyed by class |
| Prerequisite refactors | None called out | **New §3 — convert today's pooled aggregators to per-class** (§3 is now a load-bearing block; survey found 7 currently-pooled functions) |

The single most important change: **§3 documents the prerequisite refactor block** that makes the current "global" aggregators per-class. Without this, AMR has no inputs to read; the global aggregates pool across classes today and would give every class the same weather report.

---

## §2 — Why this batch exists (unchanged from v1, kept for context)

The system currently sails at one speed regardless of conditions. The existing mode overlay (`server/core/governance/strategy-modes.ts`) has three defensive postures — NORMAL / DEFENSIVE / SURVIVAL — that turn five dials based on a single global stability classification. Two problems:

1. **The overlay is defensive-only.** No AGGRESSIVE mode for unusually favorable conditions.
2. **The single sensor almost never fires.** 2026-04-22 (`B65_5_PHASE_A0_WINDOW_CONTROL.md`) is the canonical hostile-day evidence: 239 closed trades, 18.8% WR, 100% classified TFS while the market disagreed catastrophically. The overlay never engaged.

The v2 adds a third: **the current overlay applies a single mode to all classes at once.** When xStock is in a hostile window but crypto is calm, the overlay can only protect both or neither. The mechanism that produces the hostile window (regime over-classification) doesn't fire identically across classes — Memorial Day 2026-05-25 is the trivial proof point (xStock OHLC silent, crypto unaffected). Per-class postures are required to respond correctly.

---

## §3 — Asset-class survey: what's already per-class, what's pooled, what AMR needs

A deep code survey found a mixed picture. **The per-class infrastructure for AMR's inputs is mostly already built** — the B79.0n.CONFIDENCE-CHAIN work landed the structural pattern (atomic `Map<AssetClass, T>` config maps, per-class MCE refresh, per-class accessor methods) and the DBS store has been per-class since B-PHASE-A2 (`directionalBiasStore` for crypto, `xstockDirectionalBiasStore` for xStock, each with its own floor and snapshot logic). What's missing is the **per-class aggregation surface** for AMR to read.

### §3.1 — Already per-class (AMR consumes as-is)

| Component | File | Status |
|---|---|---|
| Directional Bias Store (per class) | `directional-bias-store.ts` | Two singletons (crypto + xstock), each with own floor, own snapshot, own staleness. Per-class accessors `getLatestGlobalDbsSnapshot()` and `getLatestXstockGlobalDbsSnapshot()` already exist. |
| MCE macro modifier per class | `market-context-engine.ts` (`macroConfigByClass`) | Atomic `Map<AssetClass, MacroModifierConfig>` per B79.0n.CONFIDENCE-CHAIN. Accessor `getMacroConfigForClass(assetClass)`. |
| MCE phase weights per class | `market-context-engine.ts` (`phaseWeightsByClass`) | Same pattern. Accessor `getPhaseWeightsForClass(assetClass)`. |
| MCE pair-correlation config per class | `market-context-engine.ts` (`pairCorrelationConfigByClass`) | Same pattern. Accessor `getPairCorrelationConfigForClass(assetClass)`. |
| Regime lookbacks per class | `market-context-engine.ts` (`regimeLookbacksByClass`) | B.4 foundation; resolved at startup with parity assertion for crypto's known values. |
| Regime threshold constants per class | `server/asset_classes/{crypto_spot,xstock_spot}/regime-thresholds.ts` | Separate files, separate numeric values (crypto tuned for 60m bars, xStock for 15m per B.4). |
| Module-constants resolver | `module-constants-service.ts` | 5-dim key (exchange, asset_class, strategy, regime); `asset_class` is weight-2; explicit per-class rows beat global wildcard automatically. |
| Signal pipeline asset_class threading | signal-orchestrator → SQE → strategy-engine → paper-execution-engine | `assetClass` resolved once at entry via `resolveAssetClass(symbol, 'kraken')`, threaded to every config lookup, stamped on every record. StrategyEngine signatures require it (B79.0n.PATTERN-DETECT Step 9). |

**Reuse plan:** AMR's weather-aggregator reads from these existing per-class accessors directly — no rebuild required. The DBS-store pattern (one instance per class, separate floor + snapshot) is the structural template AMR copies for its own weather-report singleton.

### §3.2 — Currently pooled across classes (must convert to per-class)

| Component | File:Line | Today's signature | AMR-required signature |
|---|---|---|---|
| `getDominantRegime()` | `market-context-engine.ts:1713–1744` | Returns one global regime by iterating `cache.entries()` unfiltered | `getDominantRegime(assetClass?: AssetClass)` — filter cache iteration by class; AMR always passes a class |
| `computeGlobalBias()` MCE-side | `market-context-engine.ts:1486` | Calls only `directionalBiasStore.publishSnapshot()` (crypto); xStock snapshot is published by `xstock_spot/scanner.ts:868` separately | MCE-side reads both stores via per-class accessor; AMR reads `getLatestGlobalDbsSnapshot(assetClass)` |
| `computeGlobalStability()` | `regime-stability.ts:155–180` | Single classification from drift+vol+confidence, no class parameter | Add `assetClass` parameter; called twice (once per class) |
| Cost cache | `cost-cache.ts:43–78` | Symbol-only key (`Map<string, CacheEntry>`) | Key extended to `${symbol}:${assetClass}` — survey flagged this as a real collision risk for any symbol that exists in two classes |
| Telemetry-aggregator EV-gap reader | `telemetry-aggregator.ts` | Per-class instance factory exists (B79.0n.TELEMETRY) but only crypto reader for EV stats; vts-runner:2944 flags missing xStock reader | Add `getEvGapForClass(assetClass)` reader; both classes feed the per-class weather report |
| `getRegime(symbol)` / `getCurrentContext(symbol)` | `market-context-engine.ts:1547–1574` | Iterates the full `${symbol}:${assetClass}` cache without filtering, returns the first hit | Accept `assetClass` parameter; required for callers that need to disambiguate (AMR does) |
| Strategy-governance rules | `STRATEGY_GOVERNANCE`, `INFLUENCE_RULES` | Asset-class-independent | **Out of AMR scope.** Flag for the post-Phase-24 governance review; AMR works around by gating at the strategy-roster-allowance level (Objective 6) instead. |

The first six refactors are **prerequisite work inside this batch**, scoped under Objective 0 below. Each is small in isolation (signature change + filter expression); the discipline is the parity gate — every existing pooled-caller must either pass a class or use an explicit `'all'` overload that preserves today's behavior. The seventh (strategy-governance rules) is deliberately deferred.

### §3.3 — Strategy-modes plumbing (mixed)

`strategy-modes.ts` already reads confidence floors from the `governance_modes` module via the 5-dim resolver — but it uses a static `_GOV_MODES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }` wildcard, so today every class gets the same floor. This is an easy promotion: change the key to accept `assetClass` from the caller, seed per-class rows in `governance_modes`, and the resolver does the rest. `meetsConfidenceFloor()` and the overlay-application functions in paper-execution-engine and vts-runner already have `assetClass` in scope at the call site — they're already threading it for other purposes — so the change is signature-and-key-only.

---

## §4 — Numbered scope objectives (each with verification criteria)

### Objective 0 — Per-class aggregator refactor (prerequisite block, §3.2)

**What:** Convert the six pooled aggregators identified in §3.2 to per-class signatures with a parity-preserving overload. For each function, the AMR-required `assetClass` parameter is added; the legacy zero-arg form (where it exists) is preserved as `assetClass = undefined` which retains today's pooled behavior. Cost-cache changes key shape and adds a one-time migration sweep at boot.

**Per-component verification:**
- `getDominantRegime(assetClass?)`: legacy zero-arg call returns the same regime it did pre-batch on a fixed cache snapshot (parity); single-arg call returns class-filtered result; passing an inactive class returns null.
- `computeGlobalBias(assetClass)`: MCE-side wrapper returns crypto snapshot when called with `'crypto_spot'`, xStock snapshot when called with `'xstock_spot'`. Pre-batch global call (still wired through scanner publish) unaffected.
- `computeGlobalStability(assetClass, …)`: legacy callers without the parameter receive the existing pooled result via a `(driftScore, volZ, confidence)` no-class overload that internally treats inputs as cross-class. New AMR callers always pass a class.
- Cost cache: keyed by `(symbol, assetClass)` tuple; lookups without `assetClass` resolve via "find any class that has this symbol cached" fallback with a `[CC][cost-cache] missing assetClass on legacy lookup` warning so the legacy callers can be migrated incrementally without breaking. **Parity test: the symbol-only lookup returns the same value it did pre-batch when only one class has the symbol cached.**
- Telemetry EV-gap reader: `getEvGapForClass('crypto_spot')` returns a rolling 100-trade net-EV gap; same for `'xstock_spot'`. Insufficient-N returns null per the DBS-store stale-snapshot pattern.
- `getRegime(symbol, assetClass?)` and `getCurrentContext(symbol, assetClass?)`: per-class call returns only matching entries; zero-`assetClass` call returns the first match with a console warning identical to the cost-cache pattern.

**Parity gate (load-bearing):** A new test file `b25-amr-prerequisite-parity.test.ts` runs every existing call site against a frozen fixture and asserts pre-batch behavior is byte-identical when AMR is disabled.

### Objective 1 — AGGRESSIVE mode definition + per-class dial values

**What:** Extend `StrategyMode` to `'NORMAL' | 'DEFENSIVE' | 'SURVIVAL' | 'AGGRESSIVE'`. Define overlay constants for AGGRESSIVE matching the existing five-dial structure. Initial conservative operator-set defaults differ by class — crypto's higher volatility and 24/7 cadence get slightly tighter AGGRESSIVE limits than xStock (proposal — Langston confirms):

**Crypto_spot AGGRESSIVE seeds:**

| Dial | AGGRESSIVE | NORMAL | DEFENSIVE | SURVIVAL |
|---|---|---|---|---|
| positionSizeMultiplier | **1.25** | 1.0 | 0.6 | 0.25 |
| stopLossDistanceMultiplier | **0.9** | 1.0 | 1.2 | 1.5 |
| takeProfitDistanceMultiplier | **1.2** | 1.0 | 0.8 | 0.6 |
| confidenceFloor (governance_modes per-class) | **0.55** | 0.60 | 0.70 | 0.80 |
| entryCooldownMultiplier | **0.7** | 1.0 | 1.5 | 2.0 |

**xStock_spot AGGRESSIVE seeds:**

| Dial | AGGRESSIVE | NORMAL | DEFENSIVE | SURVIVAL |
|---|---|---|---|---|
| positionSizeMultiplier | **1.35** | 1.0 | 0.6 | 0.25 |
| stopLossDistanceMultiplier | **0.9** | 1.0 | 1.2 | 1.5 |
| takeProfitDistanceMultiplier | **1.25** | 1.0 | 0.8 | 0.6 |
| confidenceFloor (per-class) | **0.55** | 0.60 | 0.70 | 0.80 |
| entryCooldownMultiplier | **0.7** | 1.0 | 1.5 | 2.0 |

Rationale for the per-class delta: xStock has a known 24/5 calendar with deterministic off-hours risk and tighter regulatory structure, so the AGGRESSIVE size lift can be a touch larger; crypto's higher overnight gap risk justifies slightly tighter AGGRESSIVE size. **These are conservative defaults; Phase 19 calibrates.**

**Verification:**
- `getModeOverlay('AGGRESSIVE', 'crypto_spot')` returns crypto-seeded row.
- `getModeOverlay('AGGRESSIVE', 'xstock_spot')` returns xStock-seeded row (different).
- Existing regression test "AGGRESSIVE intentionally absent" is replaced with "AGGRESSIVE present per class, defensive trio unchanged on stability-mapped inputs."

### Objective 2 — Per-class dial promotion to `module_constants`

**What:** Promote positionSize / stopLossDistance / takeProfitDistance / entryCooldown from hardcoded literals to `module_constants` rows under a new module `amr_response_dials`, using the existing 5-dim resolution. Migration seeds rows per asset class (crypto_spot, crypto_perp, xstock_spot, xstock_perp) so each class is tuned independently per CLAUDE.md §5 #15. Confidence floor stays in `governance_modes` (already promoted by B72.1) but the resolver key changes from wildcard `assetClass: '*'` to caller-supplied `assetClass`. Migration adds per-class rows in `governance_modes` for each existing mode (4 modes × 2 active classes = 8 new rows; the wildcard rows remain as fallback for inactive classes).

**Verification:**
- `getCachedNumberRequired('amr_response_dials', 'aggressive_position_size_mult', { ..., assetClass: 'crypto_spot' })` returns 1.25.
- Same call with `assetClass: 'xstock_spot'` returns 1.35.
- A test confirms no hardcoded dial literal remains for any of the four DB-promoted dials.
- B79.TEC-style `hasExplicitAssetClassRow()` bootstrap check enforces the per-class rows exist for active classes; missing rows hard-fail at boot.

### Objective 3 — Per-class weather-report aggregator

**What:** A new service `server/services/amr-weather-report.ts` exposing `getLatestWeatherReportForClass(assetClass: AssetClass)`. Internally maintains a per-class snapshot map `Map<AssetClass, AmrWeatherReport>` published on the MCE 60s cycle, mirroring the per-class DBS-store pattern. Each class's report reads only its own per-class inputs — there is no cross-class contamination.

**Inputs per class:**

| Input | Per-class source | New code needed |
|---|---|---|
| Global regime | `mce.getDominantRegime(assetClass)` (Objective 0 makes this per-class) | None beyond Objective 0 |
| Regime stability | `computeGlobalStability(assetClass, …)` (Objective 0) | None beyond Objective 0 |
| Regime time-in-state | NEW per-class tracker on MCE: `Map<AssetClass, { regime, sinceTimestamp }>` | Small tracker |
| Global DBS | `getLatestGlobalDbsSnapshot()` for crypto / `getLatestXstockGlobalDbsSnapshot()` for xStock | None — already per-class |
| Global DBS trend | NEW in-memory rolling 6-snapshot buffer per class | Small buffer |
| Pair-regime distribution | MCE per-pair cache filtered by class, histogrammed | NEW per-class snapshot getter |
| Friction p50/p95/trend | Cost-cache extended to per-class (Objective 0); rolling 20-entry buffer per `(symbol, assetClass)` | NEW aggregator on extended cache |
| EV gap | `getEvGapForClass(assetClass)` (Objective 0); rolling 100-trade window per class | NEW aggregator on telemetry |

**Output (per class):**

```typescript
export interface AmrWeatherReport {
  assetClass: AssetClass;
  classification: 'CALM' | 'CHOPPY' | 'STORMY' | 'FAVORABLE';
  continuousScore: number;
  inputs: { /* per-class snapshot of every input that fed the decision */ };
  triggers: string[];
  snapshotTime: Date;
  staleness: { input: string; reason: string }[];
}

// Accessor pattern
getLatestWeatherReportForClass(assetClass: AssetClass): AmrWeatherReport | null;
getAllWeatherReports(): ReadonlyMap<AssetClass, AmrWeatherReport>;
```

**Classification rules (per-class operator-set, conservative, all DB-tunable in `amr_weather_rules` with `asset_class` dimension):** the same shape as v1 but every numeric threshold is per-class — so crypto's "DBS trend < −0.1/min" can have a different cutoff than xStock's, and the friction-baseline multipliers can differ because crypto's baseline spread sits much higher than xStock's.

**Verification:**
- A unit test feeds the 2026-04-22 xStock hostile-day signature into the xStock aggregator and asserts STORMY within the first 60-minute simulated window. Crypto's parallel aggregator on the same wall-clock window stays CALM (the 04-22 phenomenon was xStock-specific). **This is the canonical positive-case per-class acceptance test.**
- A test feeds a known calm-period snapshot per class and asserts CALM for both.
- A test confirms graceful staleness: each input can return null per class without crashing the aggregator.
- The aggregator runs once per MCE cycle; the per-class snapshots are exposed via a per-class getter and a diagnostic endpoint.

### Objective 4 — Per-class mode resolver + feature flag

**What:** Replace the current `resolveStrategyMode(stability)` single-input single-output function with a per-class resolver:

```typescript
// Legacy retained as fallback when AMR disabled (zero-class form preserved for parity)
export function resolveStrategyMode(stability: RegimeStability): StrategyMode { ... }

// NEW primary path
export function resolveStrategyModeFromWeather(
  report: AmrWeatherReport,         // already per-class via Objective 3
): StrategyMode {
  // CALM → NORMAL, FAVORABLE → AGGRESSIVE, CHOPPY → DEFENSIVE, STORMY → SURVIVAL
}

// At the consumer surface
export function getActiveModeForClass(assetClass: AssetClass): StrategyMode;
```

**Feature flag:** `amr_runtime.enabled` (DB-tunable, default `false` at ship). Flag-off → every consumer reads `resolveStrategyMode(stability)` via signal's class-resolved stability — bit-identical pre-batch behavior. Flag-on → consumer reads `getActiveModeForClass(signal.assetClass)`.

The batch ships AMR DISABLED. Enabling per class is even an option — the flag accepts `'all' | 'crypto_spot' | 'xstock_spot'` so Phase 19 can enable one class at a time for staged observation.

**Verification:**
- With flag off: crypto signal mode = legacy crypto-stability resolution; xStock signal mode = legacy xStock-stability resolution; both bit-identical to pre-batch on a frozen fixture. **Parity gate (mandatory).**
- With flag `'crypto_spot'`: crypto signals consume the new weather-driven resolver; xStock signals still use the legacy path.
- With flag `'all'` and CALM crypto + FAVORABLE xStock: crypto mode = NORMAL, xStock mode = AGGRESSIVE simultaneously. **The per-class divergence is the load-bearing test.**

### Objective 5 — Strategy-roster + source-pool allowance per (mode, class)

**What:** Two new overlay fields stored in `amr_response_dials` as JSONB per `(mode, asset_class)`:

```typescript
allowedStrategies: string[] | '*';
allowedSourcePools: string[] | '*';
```

Consumed at SQE admission BEFORE confidence-floor check. The signal already carries `assetClass` through the pipeline (§3.1); the gate reads the class-resolved mode + the class-resolved allowance list.

Initial operator-set:
- AGGRESSIVE / NORMAL allow `'*'` for both classes.
- DEFENSIVE: same restriction concept but the excluded-strategy list is per-class (crypto excludes `momentum_breakout`, `volatility_expansion`; xStock excludes a class-appropriate subset — Langston confirms list in Step-1, candidates include ORB if its 15m re-enable hasn't settled).
- SURVIVAL: per-class allow-list of only the high-conviction strategies for that class.

**Verification:**
- A crypto `momentum_breakout` signal under crypto-DEFENSIVE is rejected at SQE; a same-strategy xStock signal under xStock-NORMAL is admitted.
- A crypto-SURVIVAL signal for a not-allowed strategy is rejected even if confidence is at the AGGRESSIVE floor.

### Objective 6 — Per-class slot caps + per-class hard pause

**What:** Two new overlay fields, both per `(mode, asset_class)`:

```typescript
maxConcurrentOpenTrades: number | null;
hardPause: boolean;
```

Per-class slot tracking: existing open-trade counting partitions by asset class naturally (positions carry assetClass per B79.TEC SSOT). The cap check is `count_for(signal.assetClass) + 1 > overlay.maxConcurrentOpenTrades_for(signal.assetClass)`.

Hard-pause is **per-class**. Crypto under STORMY+hard-pause halts all new crypto entries; xStock continues under its own mode. Gated at three checkpoints (SQE / RTB / paper-execution-engine `createOrder`) — every gate reads the signal's class and resolves the class's flag.

Operator-set seeds: AGGRESSIVE 8 / NORMAL 6 / DEFENSIVE 4 / SURVIVAL 2 for both classes; hard_pause off everywhere except the explicit `STORMY:hard_pause` weather-rule trigger sets it true for that class only.

**Verification:**
- Crypto NORMAL with 6 open crypto positions + xStock NORMAL with 4 open xStock positions: a 7th crypto signal is rejected; a 5th xStock signal is admitted.
- Crypto hard-pause set: every crypto candidate rejected at SQE; xStock signals unaffected.
- Hard pause never affects exits (kept open positions can still close per their own rules — Kyle's "throttle entry, not exit" rule from concept §3.2).

### Objective 7 — Implement the entry-cooldown multiplier (currently defined but unused), per-class

**What:** Survey confirmed `entryCooldownMultiplier` is defined in the overlay but no code path applies it. This batch implements per-class per-strategy cooldown — tracker keyed by `(assetClass, strategy)`; at SQE admission, `effectiveCooldown = baseCooldown(assetClass, strategy) * mode(assetClass).entryCooldownMultiplier`. Base cooldowns live in `amr_response_dials` (`base_entry_cooldown_seconds` per strategy per class).

**Verification:**
- A crypto strong_bull_trend entry does not block a xStock strong_bull_trend entry — tracker is per-class.
- SURVIVAL mode (× 2.0) doubles the wait vs. NORMAL within the same class.
- AGGRESSIVE (× 0.7) shortens the wait.

### Objective 8 — Per-class diagnostic surface + alert wiring

**What:**
- Mode-transition log lines include the class: `[AMR][crypto_spot] mode_transition prev=NORMAL next=DEFENSIVE reason="DBS trend −0.12/min" …`. Per-class line, not pooled.
- Transitions write to `system-alerts.jsonl` per CLAUDE.md §10.5 with class in the metadata. Severity `info` for normal transitions, `warning` for any class transitioning into STORMY or SURVIVAL.
- Read-only endpoint `/api/diagnostics/amr/current` returns:

```json
{
  "byClass": {
    "crypto_spot": { "weather": { ... }, "mode": "NORMAL", "overlay": { ... } },
    "xstock_spot": { "weather": { ... }, "mode": "AGGRESSIVE", "overlay": { ... } }
  },
  "flagState": "all" | "crypto_spot" | "xstock_spot" | "disabled"
}
```

This is the surface §19.6's external-source-and-capacity dashboard will subscribe to in Phase 19.

**Verification:**
- After enabling AMR and forcing a synthetic transition on one class, the log line + alerts entry are present with the correct class tag; the endpoint reflects only that class's new state.

### Objective 9 — VTS-runner per-class mirror

**What:** VTS-runner consumes the per-class mode via the same flag and the signal's resolved `assetClass`. Because vts-runner already threads `assetClass` (B79.0n.PATTERN-DETECT), the change is a single resolver swap.

**Verification:**
- With AMR enabled `'all'`, vts-runner's mode selection for a crypto signal matches paper-execution-engine's mode selection for the same signal at the same minute. Same for xStock.

### Objective 10 — Governance updates

- BATCH_CATALOG entry for Phase 25 AMR body.
- PHASE_HISTORY closes Phase 25.
- SYSTEM_MANUAL section added — "Adaptive Market Response — Body (per-class)" — architecture, per-class weather-aggregator inputs, per-class mode-selection, dial taxonomy, the parity-with-legacy guarantee, the per-class divergence contract.
- SYSTEM_IMPACT_MAP new entries: `amr-weather-report.ts` (per-class), `amr_response_dials` module, `amr_weather_rules` module, the per-class regime time-in-state tracker, the per-class friction percentile aggregator, the per-class EV-gap aggregator, every refactored §3.2 aggregator signature, the cost-cache key-shape change with its migration sweep.
- MEMORY.md update (CC truth + persistence copy AND Langston's MEMORY).
- BATCH_25_COMPLETION_REPORT.md with the AGGRESSIVE parity result, the per-class divergence acceptance test result, the 2026-04-22 xStock canonical-positive-case test result, and confirmation that AMR ships DISABLED.

---

## §5 — Out of scope (deliberately deferred)

- **VTS-data-driven calibration of per-class weather thresholds.** Conservative operator-set ships; Phase 19's paper-audit data calibrates per class.
- **The M2 ML posture model** — Phase 17 designs, Phase 18 implements. AMR body is the per-class socket M2 plugs into.
- **Mid-trade position resize** — concept §7 noted; post-launch.
- **External weather inputs from B67** (BTC dominance, funding, DXY) — class-routed when B67 lands (BTC dom → crypto weather; DXY → xStock weather; funding → crypto_perp weather when perp comes online).
- **Per-class strategy-governance rules** (§3.2 item 7) — `STRATEGY_GOVERNANCE` / `INFLUENCE_RULES` remaining asset-class-independent is acceptable for AMR; AMR works around via the per-class strategy-roster allow-lists. Real per-class governance rule refactor is post-Phase-24 governance review.
- **§19.6 diagnostics dashboard UI** — backend exposes endpoint here; the React tab is Phase 19's §19.6 batch.

---

## §6 — Risks I want Langston + peer session pushback on

1. **Parity gate (Objective 0 + Objective 4).** Two parity gates now: the prerequisite refactor block must preserve zero-arg behavior (Objective 0), and the AMR-disabled state must preserve current mode behavior per class (Objective 4). Both are load-bearing. Step-2 pre-audit must walk every legacy caller and document the parity path for each.

2. **B79.0n.CONFIDENCE-CHAIN interaction (for the peer session).** The chain is already per-class. Two questions:
   - Does the per-class confidence-chain output want to be an AMR weather-aggregator input? My current v2 design does NOT include it (chain is still shadow; consuming pre-readiness adds risk). If you (peer session) think the chain will be production-ready before Phase 19 enable, raise it now so `AmrWeatherReport.inputs.confidenceChain` is reserved on the type from day one.
   - Are there SIM-surface collisions between AMR's per-class additions and the CONFIDENCE-CHAIN per-class plumbing? Specifically the MCE accessors — `getDominantRegime(assetClass)` is a new accessor on a class that you've been adding accessors to; we should not double-add or conflict on naming.

3. **Cost-cache key migration risk.** Changing `cache.get(symbol)` to `cache.get(`${symbol}:${assetClass}`)` ripples through every cost-cache caller. The fallback warning pattern in Objective 0 makes the migration incremental, but every legacy caller that hits the warning path should be enumerated in Step-2 and a migration plan committed. Otherwise the warning silently masks correctness regressions.

4. **The `(crypto, xStock)` per-class enumeration.** Three MCE refresh methods today inline-hardcode `['crypto_spot', 'xstock_spot']`. AMR adds at least three more places that enumerate active classes (weather-aggregator refresh, mode resolver, slot tracker). Should this batch lift the inline list to a shared `getActiveAssetClasses()` helper (one already exists per the survey — used by the B.4 regime-lookback refresh), or stay inline per Langston's deferred-DRY pattern? Recommend: use the existing helper.

5. **Conservative AGGRESSIVE values per class.** The per-class deltas (crypto 1.25× vs xStock 1.35×) are floors I picked from concept-doc reasoning. They are conservative on purpose. Empirical reason to push either knob in either direction should land now, not mid-batch.

6. **Per-class hard-pause and capital allocation.** Hard-pause halts entries for one class only — but if capital is fungible across classes, a crypto hard-pause might starve crypto signals while xStock signals continue eating the shared bankroll. This batch does NOT change capital allocation; the existing per-class slot caps + sizing dictate per-class capital. **Flag for review:** is the existing capital partitioning sufficient or is a separate "per-class capital budget" item needed? Recommend deferring to Phase 20 production hardening unless Langston sees an immediate concern.

---

## §7 — Pre-audit Step-2 checklist (Langston runs)

1. SIM read: every new entry in Objective 10's SIM updates — confirm no collision with B79.0n.CONFIDENCE-CHAIN's per-class surface (especially MCE accessors).
2. Telemetry-aggregator per-class EV-gap feasibility check (per §6 risk that the rolling-window infrastructure exists for crypto but not xStock).
3. Module-constants resolution audit for `amr_response_dials` + `amr_weather_rules` + `governance_modes` per-class additions: confirm the 5-dim resolver handles `(crypto_spot)` vs `(xstock_spot)` vs `(*)` precedence correctly when seeds collide.
4. SQE caller chain: confirm the new strategy-roster + slot-cap + hard-pause gates are ordered correctly relative to existing IMF / confidence-floor / EV gates per class. Proposal: AMR per-class gates fire FIRST so the cheapest rejections happen earliest.
5. Cost-cache extension: memory footprint per `(symbol, assetClass)` × universe size × 20-entry rolling buffer per class — confirm within CPX22 envelope.
6. Per-class regime time-in-state tracker location: MCE singleton vs new tracker file — Langston pick.
7. Migration script review: `amr_response_dials` + `amr_weather_rules` + `governance_modes` additions need to ship initial rows for every (asset class × mode × dial). Confirm seed count is finite and reviewable.
8. Cost-cache migration sweep: confirm every legacy caller hitting the `missing assetClass` warning path is enumerated and a migration plan committed before Step-3 wrap.
9. **NEW for v2:** confirm `getActiveAssetClasses()` helper is the source of truth for the per-class enumeration in the new aggregator, and that perp-class onboarding (when it eventually happens) requires only adding a row, not editing AMR code.

---

## §8 — Verification matrix summary

| Objective | Unit-test gate | Staging-UI gate | Parity gate |
|---|---|---|---|
| 0. Prerequisite per-class refactors | ✓ (per-component parity) | — | ✓ **(legacy-form bit-identical = LOAD-BEARING)** |
| 1. AGGRESSIVE mode per class | ✓ | — | — |
| 2. Per-class dials in module_constants | ✓ | — | ✓ (per-class seeds match concept) |
| 3. Per-class weather-report aggregator | ✓ (incl. 04-22 xStock canonical case + crypto-stays-calm cross-check) | ✓ (per-class diagnostic endpoint) | — |
| 4. Per-class mode resolver + flag | ✓ (per-class divergence test) | ✓ (transitions per class visible) | ✓ **(flag-off parity = LOAD-BEARING)** |
| 5. Strategy-roster allowance per class | ✓ | — | — |
| 6. Slot caps + hard-pause per class | ✓ | ✓ (per-class hard-pause demo) | — |
| 7. Entry cooldown per class | ✓ | — | — |
| 8. Diagnostic + alerts per class | — | ✓ (alerts.jsonl + endpoint) | — |
| 9. VTS-runner per-class mirror | ✓ | — | — |
| 10. Governance updates | — | — | — |

CI on `migration/aws-supabase` head commit: all 4 jobs GREEN.

---

## §9 — Estimated batch shape

- v1 estimated ~2–3 weeks. v2's prerequisite refactor block adds ~3–5 days. **Revised estimate: ~3–4 weeks.**
- ~18–22 files touched (v1 was 12–15; v2 adds the §3.2 refactors).
- 1 SQL migration with per-class seeds for `amr_response_dials` + `amr_weather_rules` + `governance_modes` additions (~40–60 rows depending on dial count × mode × class).
- No new partitioned tables; no DBS-style backfill recompute; no model retrain.
- Tier-1 + Tier-2 governance per Objective 10.

---

## §10 — Process notes for peer session

This v2 supersedes v1 (v1 was deleted to avoid drift). Two specific asks for the peer session running B79.0n.CONFIDENCE-CHAIN:

1. **§6 risk 2** — does the per-class confidence-chain output want to be an AMR weather-aggregator input, and on what timeline? If you think the chain will be production-ready before Phase 19 enable, raise it now so the `AmrWeatherReport.inputs.confidenceChain` slot is reserved on the type from day one (cheap to add now, expensive to retrofit).
2. **§7 pre-audit item 1** — flag any SIM-surface collision between AMR's per-class accessor additions (especially `getDominantRegime(assetClass)` and the new `getEvGapForClass(assetClass)`) and the per-class plumbing you're building. If there's a shared module name or a touched-file conflict, surface here before Step-2 starts.

Otherwise, no action required. Append a §11 below this line if either raises a real issue. Otherwise this stays a draft awaiting Kyle's Step-1 trigger.

— CC (Kyle session), 2026-06-03 (v2)
