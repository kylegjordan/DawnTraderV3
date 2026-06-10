# B-4.7 — Step-2 PRE-AUDIT (per-asset-class regime; #162 + #163) — code-level

> Scope `B_4_7_PER_CLASS_REGIME_SCOPE.md` (Langston ACK: Q1 one-batch-two-diffs, Q2 delete both votes, Q3 CONTEXT_BONUS docs-only, Q4 stamp-at-write; +2 pre-audit additions). SIM + System Manual consulted (SIM: MCE §"Market Context Engine", market-indicators §"getMarketIndicators", sync-canonical-bridge §entry incl. the 2026-05-31 producer-consumer contract, rankingScore §; SysManual: regime/strategy-mode ch., Directive 11.7S/11.7R-E passages). All claims below from direct reads + compile-driven greps, 2026-06-11.

## 0. PREVIOUSLY-STATED-VS-NOW (§9.2)
1. **PREVIOUSLY (#163, 2026-05-31): "56 files reference CANONICAL_REGIME_STRATEGY_MAP." NOW: 8 production importers + 1 route + 1 CLI diagnostic + the source file + tests.** REASON: today's compile-driven grep (`grep -rln`, non-test) finds: `vts-real-score.ts`, `routes/regime-map.ts`, `signal-orchestrator.ts`, `telemetry-aggregator.ts`, `vts-runner.ts`, `market-context-engine.ts`, `sync-canonical-bridge.ts`, `diagnostic-11.4G.ts`. The 56 figure evidently counted a broader pattern (or pre-B79.0n state). The REAL surface adds the **in-file helper web** (§3) — helpers are how most code consumes the flat shape.
2. **Langston's "ARCA close / nightly" framing (scope-ACK addition 1) corrected per §5.17:** xStocks trade **24/5** — the idle-cohort edge bites at the **weekend boundary (Fri close→Sun open, B-NEW-36 timers) + US market holidays**, not nightly. The semantics question stands, re-anchored (§5).

## 1. The two mixed-class votes (#162) — confirmed in code
- **MCE** `getDominantRegime()` (market-context-engine.ts:1724): majority vote over the whole cache (`${symbol}:${assetClass}` keys, both classes), expiry-filtered, no class filter. DELETE (Q2).
- **telemetry-aggregator** `getDominantRegime()` (:1254): same shape over `pairTelemetry` (latest record per symbol, `historyWindowMs` recency). DELETE (Q2).
- **`getMarketIndicators()`** (market-indicators.ts:265-289): prefers MCE vote when MCE cache ≥5 pairs, else telemetry vote, else `currentRegime` fallback. Becomes `getMarketIndicators(assetClass)` REQUIRED; the ≥5 threshold applies to pairs OF THAT CLASS.
- **Checked and ruled OUT of surface:** `regimeStability` (strategy-mode/governance gates, Directive 11.7S/11.7R-E) traces to `computeGlobalStability(volZ, …)` — z-score volatility math, NOT the dominant-regime vote. The SysManual phrase "global regime stability" describes the stability classifier, not this vote. No change.

## 2. Consumers (chunk-A re-point surface; all verified)
| Site | Today | Becomes |
|---|---|---|
| `vts-runner.ts:1522` `registerOpenVtsTrade` globalRegime stamp | telemetry mixed vote (`?? regime` fallback) | `getDominantRegimeForClass(tradeAssetClass)`; **null when class-idle/cold (§5)** |
| `vts-runner.ts:2990` outcome-path `resolvedGlobalRegime` | same | same per trade's class |
| `vts-runner.ts:~1530` `globalFriction` stamp ← `getGlobalFriction()` | **★ SAME-CLASS FINDING:** `computeGlobalFrictionWithDetails()` (market-indicators.ts:185) samples the **'paper' active filter pool first-100** — mixed-class. A second mixed-class aggregate stamped on the SAME learning rows. **Within objective 2 as written** ("that class's regime/indicator bundle") — global friction becomes per-class in the same pass. NOT scope expansion; calling it explicitly so the diff isn't a surprise. |
| `market-events.ts:295/330` transition tracking | one `lastRegime`/`lastFrictionBand` state | per-class tracker pair; events labeled with class; CLASS_IDLE suppresses transitions (§5) |
| `routes.ts:723-751` globalRegime panel payload | telemetry mixed vote | both classes in the payload; UI renders two values (+ idle marker) |
| `CONTEXT_BONUS` (ranking-weights.ts:60) | imported-never-dereferenced (orchestrator :108; vts literal-0 :4445) | **docs-only** (Q3): SIM rankingScore text corrected; RUNNING_ISSUES wire-or-remove item homed to AMR scoping; vts comment cites it. ZERO code change on this path — locked at diff A. |
| `PairTelemetry` (telemetry-aggregator.ts:62) | **no assetClass field** (confirmed) | field added; **stamped at write** (Q4) — write sites enumerated at build via the M70 single-writer invariant (VTS lanes) |

## 3. #163 surface (chunk B) — the helper web is the real consumer
Source const :149 flat `Record<CanonicalRegimeType, RegimeStrategyMapping>`; per-class deltas live ONLY in `sync-canonical-bridge.ts` `ASSET_CLASS_OVERRIDES` (:105 — crypto excludes strong_bull_trend/orb variants; xstock excludes defensive_hedge + adds orb to TFS).
**Design:** author a class-FREE base + the overrides IN the source module; materialize `CANONICAL_REGIME_STRATEGY_MAP_BY_CLASS: Record<AssetClassKey, Record<CanonicalRegimeType, RegimeStrategyMapping>>` at module init (single authoring point preserved — same mental model as today's bridge overrides, moved to the source of truth). Bridge then READS the materialized trees (ASSET_CLASS_OVERRIDES retired there); `sync-canonical-bridge.test.ts` (9 tests) proves generated JSON **byte-identical**.
**Helper split (the load-bearing design call):**
- **Class-AWARE (strategy lists — signature gains REQUIRED assetClass):** `getStrategiesForRegime` (callers: vts-runner:3356 crypto lane, xstock eval-cycle:428, MCE:1592 delegate), `selectRandomStrategy`, `selectPrimaryStrategy` (caller: telemetry-aggregator:1426), `getAllCanonicalStrategies`, `getAllStrategiesForSignalType`, `isValidCanonicalCombination`, `buildStrategyCache` (per-class caches), orchestrator `getRegimeAllowedStrategies` (:2049 — active-path; assetClass from the signal under evaluation).
- **Class-FREE (metrics/display/normalize — UNCHANGED signatures):** `REGIME_METRICS`, `getRegimeRiskMultiplier` + the `riskMultiplier` derefs in vts-real-score:176/185 (regime risk is class-independent — values identical across classes by construction), `normalizeRegime/Strategy`, display-name/narrative tables, `GHOST_REGIME_NORMALIZATION`, `getRegimeMinConfidence`, `getTypeForStrategy`/`getPatternForStrategy` (strategy-identity, not membership).
- `selectContextAwareStrategy` + `isStrategyEnabledForAssetClass` are ALREADY class-aware (B79.0n) — re-pointed internally, signatures unchanged.
- `routes/regime-map.ts` + `diagnostic-11.4G.ts`: per-class rendering/iteration (display/CLI).
- `vts-runner.ts:3411` `Object.values(REGIME_STRATEGY_MAP)` iteration: re-point to the caller's class tree.

## 4. Blast radius
- **Strategy ELIGIBILITY VALUES change for NO pair** — chunk B is shape-only (contract test = exit gate); chunk A changes which VOTE consumers read, not any admission gate. The EV gate, SQE thresholds, IMF, strategy gates: untouched.
- **Learning-feature semantics shift (intended):** `globalRegime` + `globalFriction` on NEW VTS rows become class-true; old rows keep the mixed-vote values. **Epoch ruling proposed: bump `vts` ONLY** (per-source rule — the feature flows through the VTS writer; paper_sim/live producers don't stamp these via this path). Completion report carries the statement either way.
- **UI:** global-regime panel shows two per-class values + idle marker — §9.3 Claude-in-Chrome verification required.
- **No DB schema change** (PairTelemetry is in-memory; trade-record globalRegime column already exists — **nullable-check at build**: if NOT NULL, idle/cold stamps need a decision (NULL preferred; sentinel only if schema forces it — surfaced at diff A).
- **No module_constants rows; no migration expected.** If the idle-threshold (≥5) earns DB governance, that's a follow-up, not this batch (static const + SIM note).

## 5. Idle + cold-start semantics (Langston additions, settled design)
ONE mechanism for both: `getDominantRegimeForClass(cls)` returns **null** when fewer than `MIN_CLASS_VOTE_PAIRS = 5` unexpired entries of that class exist (matches the existing ≥5 MCE-preferred threshold). Consumers handle null EXPLICITLY: market-events → `CLASS_IDLE` state (single log line on entry/exit, transitions suppressed — no false "regime flip" on Sunday reopen; the FIRST post-idle vote re-seeds `lastRegime` without an event); UI → "IDLE / WARMING" marker; VTS stamps → null (honest absence; xStock trades don't open while the cohort is idle, so volume is cold-start-only). Weekend boundary + US holidays (24/5 — §0.2) and cold start are the same code path. No stale-hold, no silent default — the old `?? regime` fallbacks at vts-runner:1522/2990 are REMOVED (they were silent per-pair-regime substitution).

## 6. Verification plan
Chunk A: unit locks (two-class seeded cache → different per-class winners; null at <5; idle re-seed without transition event) · staging: per-class regimes visibly independent in logs + UI (§9.3) · new VTS rows carry class-true globalRegime/globalFriction (psql spot-check both classes) · vts epoch bump statement. Chunk B: contract test byte-identical · crypto-isolation regression locks · grep-zero flat-map derefs outside the source module · CI 4-green. Bench tsc+vitest before each push; two Step-4 dispatches (Q1); Langston Step-8 second pass.
