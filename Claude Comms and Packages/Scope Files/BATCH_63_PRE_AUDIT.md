# BATCH 63 — Pre-Implementation Audit + Implementation Plan

**Phase:** 15b Sub-Phase C — Strong Bull Trend Strategy + Pre-Filter DBS Routing
**Date:** 2026-04-20
**Author:** Claude Code
**SIM consulted:** Yes — all affected components traced
**Langston consensus:** Reached 2026-04-20 (three rounds of iteration, final sign-off "no major pushback")
**Kyle final decisions:** Locked 2026-04-20 pre-implementation

---

## 0. Explicit invariants (Langston-requested, pinned up front)

These must not get blurred as implementation progresses:

1. **DBS is a HARD PIPELINE CONTRACT.** No fallback, no silent recompute, no default. If DBS computation fails pre-filter, the pair fails at the filter stage. MCE does not recompute.
2. **Path-aware pWin is CORE implementation**, not an optional tuning pass. The DI-based pWin formula penalizes Path D signals; the DBS-based replacement is required for correct Net EV math, not a nice-to-have.
3. **Exclusive routing is the STRUCTURAL FIX.** Path 6 is not "another candidate" — it is THE lane for |DBS|≥0.35 pairs. Those pairs do NOT enter the other 5 paths.
4. **Canonical regime-strategy map change is NAMED PLAINLY.** `strong_bull_trend` appears as an explicit entry, not implied.
5. **Filter Diagnostics UI update is IN SCOPE.** A new filter path that cannot be observed in the UI cannot be debugged when it misbehaves.
6. **VTS observation success criteria are PREDEFINED** in §8 of this doc, not invented after deploy.

---

## 1. Locked scope (9 items)

1. Move DBS computation from MCE to FX5 scanner (pre-filter).
2. Propagate DBS end-to-end as a pair-object field through: scanner → active filter pool → VTS runner / signal orchestrator → MCE → strategy detect → expectancy gate → trade.
3. Add `active_strong_trend` filter path — 2 DB rows in `screener_filters` (mode=paper + mode=live × 1 `filter_path` name). VTS uses `paper` mode row.
4. Route |DBS| ≥ 0.35 EXCLUSIVELY to path 6.
5. Add `strong_bull_trend` strategy (QUANT signalType, LONG-only). Register explicitly in canonical regime-strategy map.
6. Add `if (|DBS| ≥ 0.35) return null` detect()-level self-exclusion on 5 strategies (morning_star, reverse_impulse, volatility_edge, defensive_hedge, vwap_pullback) as belt-and-braces defense.
7. Path-aware Net EV kernel: for `sourcePool='quant-strong-trend'`, replace DI-based pWin with DBS-based `pWin = min(0.60, max(0.40, 0.40 + |DBS|/2))`.
8. Apply all changes to BOTH VTS and active-trading paths (active remains feature-flagged off; paper mode is the near-term observation vehicle).
9. SIM §5.1b governance update + Filter Diagnostics UI tab extension for path 6.

**Deferred to later batches:**
- TEC shared service wiring (B64+)
- Global DBS persistent store fix (B64 item)

---

## 2. Final strategy parameter set (Kyle + Langston locked)

| Param | Value | Source |
|---|---|---|
| N (Donchian lookback) | **12 bars** | Kyle final |
| DBS threshold | **≥ 0.35 (positive, LONG only)** | Evidence-based + Kyle + Langston |
| DBS slope lookback | 3 bars | Langston + me |
| Breakout buffer | **0.15 × ATR** | Langston ask |
| Anti-exhaustion | **body ≤ 1.5 × ATR** | Langston ask |
| Initial stop | **3.0 × ATR** | Kyle directive |
| Interim target | **6.0 × ATR (2:1 RR)** | Langston, pre-TEC |
| Direction | LONG only | Kyle + Langston |
| Regime = TFS check | **NOT required** | Langston: redundant with routing |
| Volume confirmation | **not added** | LQ floor already in filter |
| Next-bar engulf | **not added** | Langston: adds lag, breaks parity |
| Path D-specific guardrails | **none** | Kyle: one global set applies to all |

---

## 3. Components affected (SIM consultation)

| # | File | SIM § | Blast radius | Change type |
|---|---|---|---|---|
| 1 | `server/services/fx5-scanner.ts` | §3 scanner chapter | **HIGH** | MODERATE — add pre-filter DBS + path 6 routing |
| 2 | `server/services/market-context-engine.ts` | §5.2.5 | **HIGH** | MODERATE — remove DBS compute, read propagated, hard error if missing |
| 3 | `server/core/metrics/directional-bias.ts` | §5.1b | LOW | NONE (reused) |
| 4 | `server/core/metrics/market-regime.ts` | §5.1 | LOW | NONE (already takes DBS param) |
| 5 | `server/config/canonical-regime-strategy-map.ts` | §9.10 | MEDIUM | MODERATE — register strong_bull_trend + family + map |
| 6 | `server/db/seed-family-filters.ts` | §3 | LOW | MINOR — add seed for `active_strong_trend` + VTS variant |
| 7 | `server/services/active-filter-pool.ts` | §3 | MEDIUM | MINOR — extend `ActiveFilteredPair` with `dbsScore`, `dbsCategory` |
| 8 | `server/config/pattern-filter-profile.ts` | §3 | LOW | MINOR — extend `SourcePool` union with `quant-strong-trend` |
| 9 | `server/services/strategy-engine.ts` | §4.X | **HIGH** | MAJOR — new `detectStrongBullTrend` method + 3 self-exclusion guards on inline methods |
| 10 | `server/strategies/morning-star.ts` | §4 | LOW | MINOR — DBS guard |
| 11 | `server/strategies/reverse-impulse.ts` | §4 | LOW | MINOR — DBS guard |
| 12 | `server/strategies/volatility-edge.ts` | §4 | LOW | MINOR — DBS guard |
| 13 | `server/strategies/defensive-hedge.ts` | §4 | LOW | MINOR — DBS guard |
| 14 | `server/core/calculations/net-expectancy-kernel.ts` | §5.4 | **HIGH** | MODERATE — path-aware pWin branch |
| 15 | `server/core/calculations/expectancy.ts` | §5.4 | MEDIUM | MINOR — thread `sourcePool` + `dbsScore` through |
| 16 | `server/services/paper-execution-engine.ts` | §6.1 | MEDIUM | MINOR — pass sourcePool/DBS to expectancy |
| 17 | `server/services/signal-orchestrator.ts` | §4.1 | **HIGH** | MINOR — DBS propagation to MCE call sites (3 sites) |
| 18 | `server/services/vts-runner.ts` | §7.1 | **HIGH** | MINOR — DBS propagation to MCE call sites (2 sites) |
| 19 | `server/types/market-context.ts` | §5.2.5 | LOW | MINOR — optional `propagatedDBS` on input |
| 20 | `shared/schema.ts` | §11 | LOW | NONE (schema unchanged — new rows only) |
| 21 | `client/src/.../FilterDiagnostics.tsx` (or similar) | §8 UI | MEDIUM | MODERATE — surface new path in UI |
| 22 | `1-system-manual/SYSTEM_IMPACT_MAP.md` | governance | LOW | MINOR — fix stale §5.1b text, add §3 path 6 entry |
| 23 | `1-system-manual/SYSTEM_MANUAL.md` | governance | LOW | MINOR — document architectural change |

---

## 4. Upstream / downstream dependency traces

### 4.1 FX5 Scanner — pre-filter DBS

**Upstream:**
- OHLC pre-fetch loop (`fx5-scanner.ts:807-828`) already provides 60-min candles + ATR inputs needed for `computeDirectionalBias(ohlcPrices, atr)`.
- No new upstream data needed. DBS math is identical to MCE's current usage.

**Downstream:**
- `taggedVtsSurvivors` at L1375 already carries pair objects forward. Extension: pair object gains `dbsScore: number` and `dbsCategory: string` fields.
- `activeFilterPool.addSurvivors()` must accept the extended pair type.

**Key code change (fx5-scanner.ts ~L969 after σ/DI computation):**
```typescript
// B63: Compute DBS pre-filter. HARD CONTRACT — failure here = pair exits pipeline.
// NOTE: computeDirectionalBias requires full OHLC (not just closes) + ATR (not sigma).
// ATR must be computed from full OHLC within this scope.
const ohlcFullData: OHLCData[] = ohlc.map(c => ({
  open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low),
  close: parseFloat(c.close), volume: parseFloat(c.volume || '0'),
  timestamp: typeof c.time === 'number' ? c.time : Date.parse(c.time)
}));
const atr = computeATR(ohlcFullData, 14); // standard 14-period ATR
let dbsResult: DirectionalBiasResult;
try {
  dbsResult = computeDirectionalBias(ohlcFullData, atr);
} catch (err) {
  console.warn(`[B63][DBS_FAIL] ${normalizedSymbol}: DBS compute failed — pair dropped`, err);
  return null; // exit this pair — no fallback
}
// DBS slope: compare current DBS to DBS from 3 bars ago using same window
const priorOHLC = ohlcFullData.slice(0, -3);
const priorDbs = priorOHLC.length >= 20 ? computeDirectionalBias(priorOHLC, computeATR(priorOHLC, 14)).score : dbsResult.score;
const dbsSlope = dbsResult.score - priorDbs;
```
Corrected (Langston fix #1): **ATR, not Sigma**. ATR is computed from full OHLC via standard 14-period formula.

**Routing change (L1375):**
```typescript
// B63: Strong-DBS gate — route EXCLUSIVELY to path 6
if (Math.abs(dbsResult.score) >= 0.35 && dbsResult.score > 0) {
  taggedVtsSurvivors.push({ ...s, sourcePool: 'quant-strong-trend', dbsScore: dbsResult.score, dbsCategory: dbsResult.category });
  continue; // do NOT add to other pool entries
}
// Normal routing for |DBS| < 0.35 or negative DBS
```

Note: **LONG-only gating means negative strong-DBS pairs (bear trends) fall into normal routing**, not into path 6. Future batch can add path 7 for Strong Bear Trend if desired.

### 4.2 MCE — consume propagated DBS, no fallback

**Upstream:**
- `MCE.computeContext()` callers: vts-runner.ts:1823, signal-orchestrator.ts:459, 884, 1027. Each must now source DBS from the pair object and pass it in.

**Downstream:**
- `calculatePairRegime(ohlcData, dbsScore)` already takes DBS — no further change.
- MCE internal `computeDirectionalBias()` call (L142) DELETED.

**Key change (market-context-engine.ts):**
```typescript
computeContext(symbol, ohlcData, currentPrice, volume24h, smaLength, propagatedDbsScore: number) {
  // B63: DBS is a hard contract. No fallback.
  if (propagatedDbsScore === undefined || propagatedDbsScore === null || !Number.isFinite(propagatedDbsScore)) {
    throw new Error(`[B63][MCE] DBS not propagated for ${symbol} — hard contract violation`);
  }
  // ... existing logic continues with propagatedDbsScore passed to calculatePairRegime
  const regimeResult = calculatePairRegime(ohlcData, propagatedDbsScore);
  // DBS computation deleted — was at L142.
}
```

### 4.3 Canonical regime-strategy map — register strong_bull_trend

**Exclusivity mechanism (Langston fix #3 — explicit).** The existing routing architecture already supports exclusivity via family matching. VTS runner at `vts-runner.ts:1959` does: `if (stratFamily && !pairFams.has(stratFamily)) continue;` — so a strategy evaluates ONLY when the pair's family set includes the strategy's declared family.

Changes required to register `strong_bull_trend` with TRUE exclusivity:

1. **Extend `StrategyFamily` type** (`canonical-regime-strategy-map.ts:755`):
   ```typescript
   export type StrategyFamily = 'trend' | 'reversal' | 'breakout' | 'oscillator' | 'pattern' | 'hybrid' | 'strong_trend';  // B63 ADD
   ```

2. **Add to `FILTER_FAMILIES` array** (`canonical-regime-strategy-map.ts:787`):
   ```typescript
   export const FILTER_FAMILIES: readonly StrategyFamily[] = ['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'] as const;  // B63 ADD
   ```

3. **Register strategy→family** (`STRATEGY_FAMILY_MAP`, L757):
   ```typescript
   strong_bull_trend: 'strong_trend',  // B63 NEW
   ```

4. **Add to regime lists** — `TREND_FRIENDLY_STABLE` AND `IMPULSE_EXPANSION` strategies arrays (post-B62, |DBS|≥0.50 classifies to IE). Entry:
   ```typescript
   {
     strategy: 'Strong Bull Trend',
     strategyKey: 'strong_bull_trend',
     signalType: 'QUANT',
     patternType: null,
     secondaryMetrics: 'DBS ≥ 0.35 • DBS slope rising • N12 Donchian breakout + 0.15×ATR • body ≤ 1.5×ATR'
   }
   ```

5. **Ensure path 6 pairs get family={'strong_trend'}** in the sourcePool→family resolution logic. FX5 scanner currently builds `pairFams` via `symbolFamilyMap` at L1381 based on which filter families the pair survived. The new `active_strong_trend` / `vts_strong_trend` filter paths map to `strong_trend` family automatically via `FILTER_FAMILIES` inclusion.

**Why this enforces exclusivity:**
- A path 6 pair has family set = `{strong_trend}` (it survived ONLY the strong_trend path, per exclusive routing)
- `strong_bull_trend.family = strong_trend` → matches → evaluates ✓
- `morning_star.family = pattern` → pair's family set doesn't include 'pattern' → skipped ✓
- `vwap_pullback.family = trend` → pair's family set doesn't include 'trend' → skipped ✓

Conversely:
- A quant-trend pair has family set = `{trend}` (no strong_trend)
- `strong_bull_trend.family = strong_trend` → pair's family set doesn't include 'strong_trend' → skipped ✓

**The canonical regime list inclusion is safe** — regime match is only the first gate. Family match is the second gate, and it's the one that enforces routing exclusivity.

### 4.4 Path-aware Net EV kernel

**File:** `server/core/calculations/net-expectancy-kernel.ts`

**Before (L78):**
```typescript
const pWin = Math.min(MAX_PWIN, Math.max(MIN_PWIN, MIN_PWIN + (DI / DI_PWIN_FACTOR)));
```

**After:**
```typescript
let pWin: number;
if (sourcePool === 'quant-strong-trend') {
  // B63: DBS-based pWin for Path D. DBS supersedes DI for strong trends.
  const absDbs = Math.abs(dbsScore ?? 0);
  pWin = Math.min(MAX_PWIN, Math.max(MIN_PWIN, MIN_PWIN + (absDbs / 2)));
} else {
  // Existing DI-based formula for all other paths
  pWin = Math.min(MAX_PWIN, Math.max(MIN_PWIN, MIN_PWIN + (DI / DI_PWIN_FACTOR)));
}
```

**Threading:** `sourcePool` and `dbsScore` must be threaded through `evaluateTradeExpectancy()` (expectancy.ts) call chain from paper-execution-engine.ts:1581 (signal metadata already carries both).

### 4.5 Strategy detect() self-exclusion guards

Add to each of the 5 strategy detect functions:
```typescript
// B63: Belt-and-braces for Path D LONG-only leak. Guard fires ONLY on strong POSITIVE DBS.
// Strong negative DBS pairs (bear trends) remain in normal routing and are handled by
// existing strategies per B63 design. Bear-trend contamination is a separate concern
// addressed in a future batch (Strong Bear Trend or dedicated guard batch).
if ((indicators.dbsScore ?? 0) >= 0.35) return null;
```
Corrected (Langston fix #2): **LONG-only guard, not `abs(dbs)`**. Matches Path D's LONG-only design and routing scope.

Files:
- `server/strategies/morning-star.ts` — add at top of `detectMorningStar`
- `server/strategies/reverse-impulse.ts` — add at top of `detectReverseImpulse`
- `server/strategies/volatility-edge.ts` — add at top of `detectVolatilityEdge`
- `server/strategies/defensive-hedge.ts` — add at top of `detectDefensiveHedge`
- `server/services/strategy-engine.ts` — find `vwap_pullback` detection method, add guard

**Precondition:** `indicators` type extension — must include `dbsScore?: number`. Add to `TechnicalIndicators` type.

### 4.6 New detectStrongBullTrend

**Location:** New file `server/strategies/strong-bull-trend.ts` (follow morning-star pattern) + register in `strategy-engine.ts`.

**Pseudocode:**
```typescript
export function detectStrongBullTrend(
  indicators: TechnicalIndicators,
  candles: Candle[],
  patternSignal: PatternInput | null
): StrategySignal | null {
  const dbs = indicators.dbsScore ?? 0;
  const atr = indicators.atr;
  if (!atr || atr <= 0) return null;
  if (dbs < 0.35) return null;                           // LONG-only, magnitude + sign
  if ((indicators.dbsSlope ?? 0) <= 0) return null;      // rising DBS required
  
  // Donchian N=12 high (exclude current bar)
  const N = 12;
  if (candles.length < N + 1) return null;
  const nBarHigh = Math.max(...candles.slice(-N-1, -1).map(c => c.high));
  const current = candles[candles.length - 1];
  const breakoutBuffer = atr * 0.15;
  if (current.close <= nBarHigh + breakoutBuffer) return null;
  
  // Anti-exhaustion
  const barBody = Math.abs(current.close - current.open);
  if (barBody > atr * 1.5) return null;
  
  const entryPrice = current.close;
  const stopPrice = entryPrice - (atr * 3.0);
  const targetPrice = entryPrice + (atr * 6.0);
  
  return {
    strategy: 'strong_bull_trend',
    signalType: 'QUANT',
    patternType: null,
    entryPrice,
    stopPrice,
    targetPrice,
    confidence: Math.min(0.95, 0.70 + Math.abs(dbs) * 0.3),
    metadata: { dbsScore: dbs, nBarHigh, breakoutBuffer, barBody, atr }
  };
}
```

**DBS slope source:** Computed in fx5-scanner during pre-filter loop by running `computeDirectionalBias` on `ohlcPrices.slice(0, -3)` vs current full window. Propagated on pair object as `dbsSlope`. This avoids stateful history storage.

### 4.7 Filter Diagnostics UI

**Expected location:** `client/src/pages/machine-learning/FilterDiagnostics.tsx` or similar. Need to:
1. Add a column/section for `active_strong_trend` path
2. Show: pair count, survivors, failed-LQ/VN/DI counts, pool assignment
3. Backend route likely at `server/routes/vts.ts` or `server/routes.ts` — find the filter-diagnostics endpoint and add path 6 aggregation.

---

## 5. Tests affected

**Must update (prior tests):**
- `server/tests/integration/net_expectancy.test.ts` — add sourcePool=`quant-strong-trend` test case with DBS input
- `server/tests/unit/canonical-validation.test.ts` — include `strong_bull_trend` in expected strategy set
- Any tests that call `MCE.computeContext()` directly — must pass propagatedDbsScore

**New tests to add:**
- `server/strategies/__tests__/strong-bull-trend.test.ts` — entry logic unit tests (breakout + DBS gate + anti-exhaustion)
- Unit test: DBS hard-contract error in MCE when propagatedDbsScore is missing
- Unit test: path-aware pWin math (both branches)
- Integration test: high-DBS pair flows to `quant-strong-trend` pool exclusively, not to pattern/quant-trend pools

---

## 6. Implementation sequence (ordered)

Estimated time: 4-6h for code, 30-60m for tests, 30m for governance. Total ~6-8h.

1. **Types first (no logic):** extend `TechnicalIndicators` with `dbsScore?: number`, `dbsSlope?: number`. Extend `SourcePool` union with `'quant-strong-trend'`. Extend `ActiveFilteredPair` with DBS fields. → compile-clean but no behavior change yet.

2. **DB seed + schema touch:** add 2 rows to `screener_filters` (paper mode + live mode, `filter_path='active_strong_trend'`, relaxed thresholds). Update `seed-family-filters.ts`.

3. **Canonical map registration:** add `strong_bull_trend` entry to `TREND_FRIENDLY_STABLE` in canonical map. Add `strong_trend` family. Register strategy-to-family.

4. **FX5 scanner pre-filter DBS:** add `computeDirectionalBias` call + slope compute at ~L970. Thread into tagged survivors. Add path 6 routing at ~L1375.

5. **MCE contract change:** accept `propagatedDbsScore`, delete internal DBS compute, hard-error if missing. Update callers to pass DBS.

6. **Strategy detect() guards:** add 5 self-exclusion guards.

7. **strong_bull_trend detect():** new file + register in strategy-engine.

8. **Net EV kernel path-aware:** add branch for `quant-strong-trend` sourcePool.

9. **Expectancy gate threading:** pass sourcePool + DBS through expectancy.ts chain.

10. **Paper-execution-engine:** ensure sourcePool + DBS reach expectancy evaluation.

11. **Filter Diagnostics UI:** extend page to show path 6 stats.

12. **Tests:** new + updated.

13. **Governance:** update SIM §5.1b, add SIM §3 path 6 entry, minor System Manual note.

14. **TypeScript compile check** locally before commit.

---

## 7. Deploy + verification plan

- Commit with descriptive message referencing B63.
- Push to `migration/aws-supabase`. CI (4 checks) must all pass.
- SSH to staging, `git pull && npm run build && pm2 restart dawntrader`.
- Verify HTTP 200 on `/api/health`.
- Verify PM2 logs show `[B63][DBS_PREFILTER]` log lines.
- Verify no `[B63][MCE] DBS not propagated` errors (would indicate propagation bug).
- Verify at least 1 pair routed to `quant-strong-trend` pool within 5 scan cycles (~2.5min) via `/api/vts/filter-diagnostics`.

---

## 8. VTS observation success criteria (Langston-predefined)

**Monitor for several hours post-deploy, then report:**

| Metric | What to check | Pass threshold |
|---|---|---|
| Path D trade count | `strong_bull_trend` trades opened | ≥ 3 in first 2 hours (if zero, routing is broken) |
| Strong-DBS routing share | % of |DBS|≥0.35 pairs reaching `quant-strong-trend` sourcePool | ≥ 95% (occasional leak OK, systematic leak = bug) |
| Existing-strategy deflection | morning_star/reverse_impulse trades on |DBS|≥0.35 pairs | Should drop to ~0 (detect guards + routing = near-zero leak) |
| Path D profitable-close % | TP hit rate in first 2-4h | ≥ 30% (interim target 2:1 means lower WR acceptable) |
| Path D stop-out % | SL hit rate | ≤ 55% (3×ATR wide stops absorb normal volatility) |
| RTB burial check | Path D signals rank where in RTB queue? | Median rank top half (pWin fix should prevent burial) |
| Other-strategy side effects | vwap_pullback, morning_star trade counts vs pre-deploy baseline | No regression — they lose access to ~15-25% of prior trade universe (the |DBS|≥0.35 subset), but win rate on their remaining pairs should improve |

**Data sources:**
- `logs/virtual_trades/YYYY-MM-DD.json` (VTS trade records)
- Filter Diagnostics API (`/api/vts/filter-diagnostics`)
- PM2 logs (`[B63]` and `[EV_BLOCK]` patterns)

---

## 9. Governance update list (Tier 1 + Tier 2)

**Tier 1 (every batch):**
- `1-system-manual/BATCH_CATALOG.md` — add B63 entry
- `1-system-manual/PHASE_HISTORY.md` — update Phase 15b
- `.claude/memory/MEMORY.md` — update volatile state block
- `Claude Comms and Packages/Scope Files/BATCH_63_SCOPE.md` (parallel to this pre-audit)
- `Claude Comms and Packages/Batch Completion/BATCH_63_COMPLETION_REPORT.md` (post-implementation)

**Tier 2 (applicable):**
- `1-system-manual/SYSTEM_MANUAL.md` — document pre-filter DBS architecture + path 6
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — fix stale §5.1b, add §3 path 6 entry, update §5.4 (Net EV)
- `1-system-manual/CHANGES_AND_FIXES.md` — add entries for stale-SIM governance fix + net-EV path-aware fix

---

## 10. Known risks + mitigations

| Risk | Mitigation |
|---|---|
| DBS propagation breaks somewhere → MCE throws → pair evaluation fails | Hard error is intentional (Kyle directive). Monitoring will surface any systematic propagation failure within minutes. |
| Path D no signals fire (entry too restrictive) | Observation plan includes "Path D trade count" — if zero at 2h, tune breakout buffer or N. |
| Path D over-fires (too loose) | Observation plan includes "stop-out %" — if >55%, tighten. |
| Existing strategies over-excluded due to routing + detect guard overlap | Intentional belt-and-braces. Monitoring will check their win rate on remaining trades — should improve. |
| Path 6 signals still buried in RTB despite pWin fix | Monitoring includes "median rank" check. If buried, investigate other scoring leaks. |
| Filter Diagnostics UI breaks for legacy paths | Regression test: verify `/api/vts/filter-diagnostics` returns all 4 quant paths + pattern pool AND the new path 6. |

---

**End of Part 1 (Items 1-9).** Items 1-9 were implemented and deployed through 2026-04-20 (B63, B63.1, B63.2, B63.3 commits).

---

# PART 2 — Pre-Audit for Items 10-19 (Scope Expansion)

**Added:** 2026-04-21
**Trigger:** BATCH_63_COUNTERFACTUAL_AUDIT findings + Kyle's multi-lever adaptive framework directive + Langston review iterations
**Source scope doc:** `BATCH_63_SCOPE.md` items 10-19

---

## 11. Invariants for Items 10-19 (pinned up front)

1. **Mode-overlay bypass is a LANE property, not a strategy-name list.** `sourcePool === 'quant-strong_trend'` → native geometry. Any strategy promoted into the lane inherits the bypass automatically — do not add per-strategy code paths that duplicate this.
2. **No threshold or formula changes ship in Items 15, 18, or 19.** They are audit-only. Evidence → B64+.
3. **In-flight trades are NEVER mutated.** Open trades close under the geometry they were opened with. Fix applies to new signals only, from deploy forward.
4. **Cohort separation is mandatory** in the B63 completion report observation plan. Outcomes must not be blurred across internal versions (Items 1-9 cohort, post-10-14 cohort, post-16 cohort, vwap_pullback-in-strong-trend-lane cohort).
5. **Audit deliverables are explicit files**, not vague narrative: `B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md`, `B63_ITEM18_SQE_AUDIT.md`, `B63_ITEM19_CADENCE_LATENCY_AUDIT.md`.
6. **Items 15 / 18 / 19 audits must respect B62 classifier boundary** when blending historical data. Pre-B62 vs post-B62 behavior is labeled, not averaged.
7. **sma_trend_ride is NOT promoted into the strong-trend lane.** Per Langston: evidence too thin. It gets the Item 10 counter-trend LONG guard but no lane promotion.

---

## 12. Components affected (SIM consultation — Part 2)

For each component, blast-radius rating is High / Medium / Low and a one-line justification follows.

### Items 10-14 (Implementation) components

**`server/strategies/morning-star.ts`** — blast-radius **LOW**
- Single strategy file. Add `b63b_counter_trend_long_exclusion` null-reason guard at top of detect function. Guard is strictly gating (returns null earlier); cannot break downstream consumers because they already handle null. Well-tested null path.

**`server/strategies/reverse-impulse.ts`** — blast-radius **LOW**
- Same structure as morning-star. Identical guard shape.

**`server/strategies/defensive-hedge.ts`** — blast-radius **LOW-MEDIUM**
- Verify LONG-only assumption first (defensive_hedge historically had SHORT branches removed). Confirm before adding guard. If strategy is LONG-only, guard is identical to morning-star pattern.

**`server/strategies/sma-trend-ride.ts` OR `strategy-engine.ts` block** — blast-radius **LOW**
- Check whether `sma_trend_ride` lives in its own file or embedded in strategy-engine.ts. Grep shows embedded (similar to vwap_pullback). Add guard at same location as existing B63 Item 6 guards.

**`server/services/strategy-engine.ts` (vwap_pullback block ~L85-180)** — blast-radius **MEDIUM**
- vwap_pullback is currently embedded here, not in a separate .ts file. Item 11 requires restructuring: (a) REMOVE the existing B63 Item 6 `if dbsScore >= 0.35 skip` positive-DBS guard, (b) REPLACE with symmetric mirror-defect guard `if dbsScore <= -0.35 skip`, (c) ADD routing-context awareness to apply geometry override when invoked via strong-trend lane. Upstream: vts-runner's strategy dispatcher. Downstream: trade creation + SQE. Medium because we're swapping out an existing guard not just adding one.

**`server/config/canonical-regime-strategy-map.ts`** — blast-radius **MEDIUM-HIGH**
- Add `vwap_pullback` as eligible detector in `quant-strong_trend` sourcePool entry. This is the routing source-of-truth. Any consumer that reads this map for eligibility will now see vwap_pullback in two places (its original pool AND strong-trend). Need to ensure consumers don't double-evaluate. Verification required on every reader of this map.

**`server/services/vts-runner.ts`** — blast-radius **HIGH**
- Two concurrent changes:
  - Item 12: plumb `StrongTrendGeometryOverride` through the signal-building context, consumed at L1072-1077 where mode-overlay multipliers are applied.
  - Item 14: add lane-based bypass at the same location — if `sourcePool === 'quant-strong_trend'`, skip overlay multipliers entirely.
- These two interact. Item 14 bypass runs BEFORE Item 12 override; the override is what provides the native geometry that bypass preserves. Order matters: bypass first (does the trade skip the overlay at all?), then apply override or default native geometry.
- vts-runner changes ripple to every signal that opens a VTS trade. Regression surface wide — all strategies must still produce correct geometry on their default paths.

**`server/services/paper-execution-engine.ts`** — blast-radius **HIGH**
- Same mode-overlay bypass + geometry override plumbing required on the paper/active trading path. vts-runner and paper-execution-engine must have symmetric logic. Per Item 8 from core B63: all changes ship to both paths.

**`server/services/signal-orchestrator.ts`** — blast-radius **MEDIUM**
- Verify whether mode-overlay is also consumed here. If yes, bypass required. If no (mode-overlay only at vts-runner + paper-execution), no change needed. Pre-audit task: read and confirm.

### Item 16 (Global DBS architecture fix) components

**`server/core/metrics/directional-bias.ts`** — blast-radius **HIGH**
- Current computeGlobalDirectionalBias consumes live cache with coverage gate. Replace with: (a) new per-pair persistent store with (score, timestamp, staleness flags), (b) end-of-cycle snapshot publish API, (c) snapshot consumer. Fixed 20-pair floor replaces 70% coverage gate. Touches the core global DBS formula; any consumer downstream of global DBS is affected.
- Upstream: computePairDirectionalBias (unchanged contract, just its outputs land in a different store).
- Downstream: market-context-engine consumption, market-indicators consumption, any UI surface that reads global DBS.

**`server/services/market-context-engine.ts`** — blast-radius **MEDIUM-HIGH**
- Currently calls computeGlobalDirectionalBias with live cache. Must switch to reading published snapshot. Determinism guarantee flips — previously cycle-to-cycle variance was tolerated; now snapshot is stable within a cycle.

**`server/services/market-indicators.ts`** — blast-radius **MEDIUM**
- Reads getCachedVolumes() for global DBS weighting. After snapshot, volumes must be captured at snapshot time for determinism. Either snapshot includes the volume basket, or readers consistently use snapshot-time volumes. Pre-audit decides which.

**`server/types/directional-bias.types.ts`** — blast-radius **LOW**
- Add types for persistent store entry, snapshot structure, staleness flags.

**New DB table (possibly):** — blast-radius **MEDIUM**
- Decision point in pre-audit: persistent store is in-memory (process-lifetime) or DB-backed? In-memory simpler but loses state on restart. DB-backed preserves across restarts. Both are compatible with the scope doc; pre-audit must pick and justify. Recommendation: in-memory Map with periodic DB flush for crash recovery, or accept cold-start warmup period. Defer to implementation sequencing.

### Items 15 / 18 / 19 (Audit-only) components

**No code changes** in these items. Blast-radius for the AUDIT WORK is LOW — it's analysis, not code. Data sources used:

- Staging DB: telemetry_history, filter_diagnostics, trade tables
- Disk logs: `/home/deploy/dawntrader/logs/virtual_trades/*.json`, `/home/deploy/dawntrader/logs/phase15b_dbs_telemetry/*.jsonl`
- Code inspection: regime-stability.ts, mapping-drift-calculator.ts, signal_quality_evaluator.ts, ranking-weights.ts, strategy-modes.ts
- Historical output artifacts: previous batch completion reports, SIM §5.1b, System Manual Ch 3 (regime classifier), Ch 8 (SQE)

---

## 13. Per-item implementation plan (Items 10-14, 16)

### Item 10 — Counter-trend LONG guards

**Files:** morning-star.ts, reverse-impulse.ts, defensive-hedge.ts, strategy-engine.ts (sma_trend_ride block)
**Pattern (repeated per strategy):**
```ts
if ((indicators.dbsScore ?? 0) <= -0.35) {
  setNullReason('b63b_counter_trend_long_exclusion');
  return null;
}
```
Placed IMMEDIATELY AFTER the existing B63 Item 6 `dbsScore >= 0.35` guard. Both guards together cover `|dbs| >= 0.35` for LONG-only strategies.

**Verification:** grep for `b63b_counter_trend_long_exclusion` in logs post-deploy; count > 0 within minutes.

### Item 11 — vwap_pullback promotion (lane routing + mirror-defect guard + geometry override consumption + lane arbitration)

**Lane arbitration rule (implemented 2026-04-21, first-claim-wins):** in the strong-trend lane, both `strong_bull_trend` and the promoted `vwap_pullback` are eligible to fire on the same pair in the same cycle. When both trigger, the FIRST strategy whose signal opens a trade claims the pair; subsequent lane-eligible strategies on the same pair+cycle return null with reason `strong_trend_lane_conflict`. Uses the same first-claim-wins pattern as the existing per-strategy duplicate guard (Batch 19G). Implemented in `vts-runner.ts` immediately above the Batch 19G duplicate guard.

**Strict R-multiple arbitration deferred** as a future enhancement. Would require collecting all lane-eligible signals before opening any (larger refactor). Upgrade if post-deploy observation shows first-claim-wins produces wrong outcomes. Practically, entry conditions for the two strategies are distinct (vwap_pullback needs pullback-to-VWAP + reversal pattern; strong_bull_trend needs Donchian breakout + anti-exhaustion), so same-cycle conflicts should be uncommon.

Three sub-changes in `server/services/strategy-engine.ts` vwap_pullback block:
1. **Remove** the existing `if dbsScore >= 0.35 skip` positive-DBS guard (it currently blocks lane promotion).
2. **Add** mirror-defect guard: `if dbsScore <= -0.35 return null` with `b63b_counter_trend_long_exclusion` null-reason (same as Item 10 strategies).
3. **Add** routing-context awareness: read `routingContext.strongTrendGeometryOverride` if present and apply its multipliers instead of vwap_pullback's default geometry.

Plus in `canonical-regime-strategy-map.ts`: add `vwap_pullback` to the `quant-strong_trend` sourcePool's eligible detectors list.

### Item 12 — Strong-trend geometry override plumbing

**New type:** `server/types/routing-types.ts` (create if doesn't exist) — `StrongTrendGeometryOverride { stopAtrMultiplier, targetAsRMultiple }`.

**Producer:** the routing layer that builds the signal-evaluation context. Whenever sourcePool resolves to `quant-strong_trend`, attach `{ stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 }` to the context.

**Consumers:** vwap_pullback detect function (Item 11). Strong_bull_trend does NOT consume this — it uses its own locked constants.

**Contract test:** a unit test that verifies: (a) when vwap_pullback receives context with override, stop = entry - 4*ATR and target = entry + 3*(entry-stop); (b) when context has no override, vwap_pullback uses its default geometry.

### Item 13 — Observation decision gate (no code)

Pre-registered criteria from scope doc. Gate evaluated at end of 1-week observation window. Written into B63 completion report as "vwap_pullback lane observation outcome" with verdict KEEP / TUNE / BUILD_DEDICATED.

### Item 14 — Strong-trend lane mode-overlay bypass

Two file edits:

**`server/services/vts-runner.ts` near L1072:**
```ts
const STRONG_TREND_LANE = 'quant-strong_trend';
const useNativeGeometry = sourcePool === STRONG_TREND_LANE;
const adjustedStopDistance = useNativeGeometry
  ? stopDistance
  : stopDistance * modeOverlay.stopLossDistanceMultiplier;
const adjustedTargetDistance = useNativeGeometry
  ? targetDistance
  : targetDistance * modeOverlay.takeProfitDistanceMultiplier;
```

**`server/services/paper-execution-engine.ts`:** mirror the same bypass at whichever line applies mode-overlay multipliers to stop/target distances. If multiple locations exist in paper-execution-engine, all must be updated.

**Task:** find all mode-overlay consumption points via `grep -n "stopLossDistanceMultiplier\|takeProfitDistanceMultiplier" server/services/`. Every hit gets the bypass check.

### Item 16 — Global DBS architecture fix

**Sequencing (three sub-phases within the item, must ship together):**

**16a — Persistent per-pair store:**
- Add `PairDirectionalBiasStore` class to `directional-bias.ts` — Map<symbol, { score, timestamp, sentinelZero }> with setters/getters
- Soft staleness bound: 2 scan intervals (60s at 30s cycle)
- Hard expiry: 5 minutes (drop entries older than this)
- computePairDirectionalBias updates the store as a side effect when producing a pair-level DBS

**16b — End-of-cycle atomic snapshot:**
- New function `publishGlobalDirectionalBiasSnapshot()` called by FX5 scanner at the end of each cycle
- Reads the persistent store, applies 20-pair floor (see 16c), computes weighted median, publishes atomic snapshot
- Snapshot structure: `{ value, coverage: numPairs, snapshotTime, isStale: boolean }`
- Consumers get snapshot via `getLatestGlobalDirectionalBiasSnapshot()` — same value returned to any caller within a cycle

**16c — Fixed 20-pair floor:**
- Replace `GLOBAL_DBS_MIN_COVERAGE_PCT = 0.70` with `GLOBAL_DBS_MIN_SAMPLE_COUNT = 20`
- If store has fewer than 20 non-expired entries, do NOT compute a fresh snapshot — keep the last good snapshot, mark it `isStale: true`, log
- This is a clear floor: degraded global DBS is never computed from partial data

**Consumer changes:**
- MCE reads snapshot instead of calling computeGlobalDirectionalBias live
- market-indicators reads snapshot
- Any UI endpoint reads snapshot

**Persistence — in-memory only for B63 (Langston-confirmed 2026-04-21).** Store lives in process memory; no DB flush in this batch. Cold-start warmup acceptable. If operational evidence in observation shows cold-start warmup is unacceptably disruptive, add DB flush in B64+.

**Explicit behavior spec — must be preserved unambiguously in implementation (Langston-required):**

| Situation | Behavior | Logged? |
|---|---|---|
| Cold start: process just restarted, store is empty | Return `null` from `getLatestGlobalDirectionalBiasSnapshot()` until enough pair DBS computations populate the store to exceed the 20-pair floor. Consumers MUST handle `null` explicitly (do not silently default to 0). | Yes — log `[GlobalDBS][coldStart] snapshot unavailable, store has N pairs, floor 20` on each attempted read |
| Sample count below 20 AND a prior good snapshot exists | Return the LAST good snapshot with `isStale: true`. Do NOT recompute from degraded data. | Yes — log `[GlobalDBS][degradedCoverage] serving stale snapshot, liveStore=N, floor 20` |
| Sample count below 20 AND NO prior good snapshot exists | Return `null`. Never synthesize. | Yes — log `[GlobalDBS][noSnapshot] store below floor and no prior snapshot; returning null` |
| Sample count ≥ 20 but computed value is mathematically invalid (NaN, etc.) | Return the last good snapshot with `isStale: true`. Never publish NaN. | Yes — log `[GlobalDBS][invalidCompute] kept prior snapshot` with diagnostic detail |
| Sample count ≥ 20 and compute succeeds | Publish new fresh snapshot, `isStale: false`. This is the happy path. | No (normal operation) |

**Key principle:** `null` and `isStale:true` are DIFFERENT states. Consumers that cannot handle null should still get `isStale:true` as a flag, but `null` means "we have nothing at all to serve." Never substitute zero or any default for null.

**Test:** unit tests for every row in the behavior spec above, plus snapshot determinism within a cycle, floor enforcement, and cold-start path.

---

## 14. Per-audit methodology (Items 15, 18, 19)

### Item 15 — Multi-lever adaptive framework audit methodology

**Data sources:**
- Past 2-4 weeks of VTS trade records (virtual_trades/*.json on staging)
- MCE telemetry (phase15b_dbs_telemetry/*.jsonl)
- PM2 log captures of `[11.7R][Stability]` classifications + mode changes
- `regime-stability.ts` computation code
- `mapping-drift-calculator.ts` DRIFT_CANONICAL table
- `strategy-modes.ts` STRATEGY_MODE_OVERLAYS configuration

**Analysis steps (Level 1 — Framework question):**
1. Bucket trade outcomes by archetype family (trend/continuation, reversal/pullback, breakout, oscillator/defensive, pattern)
2. For each bucket, correlate win rate with active mode (NORMAL/DEFENSIVE/SURVIVAL) at trade entry time
3. Compute "did mode-overlay help?" by comparing trade-family outcomes in each mode to what a NORMAL-mode counterfactual would have produced (requires replaying the 2-4w trades with mode set to NORMAL)
4. Segment by market-condition label (stable / transitioning / unstable) from the historical mode classifications themselves
5. Produce ride-along table: n, win rate, avg R, for each (family × mode × condition) cell
6. Issue verdict: KEEP / MODIFY / REPLACE

**Analysis steps (Level 2 — Inputs review, if Level 1 = MODIFY or REPLACE):**
1. For each candidate input (current 4 + archetype-fit + global DBS + any other proposals), evaluate availability, responsiveness (cadence test with Item 19's data), historical signal quality
2. Prioritize inputs by (discriminative power × responsiveness)
3. Propose input set for the new framework

**Analysis steps (Level 3 — Calibration, if Level 1 = KEEP AND Level 2 confirms current inputs):**
1. For each of the 4 current inputs: pull multi-week distribution
2. Compare observed distribution to current thresholds (stable, transition, UNSTABLE cutoffs)
3. Identify where false-positive or false-negative rates are excessive
4. Recommend re-calibrated thresholds

**Deliverable:** `Claude Comms and Packages/Scope Files/B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md`

### Item 18 — Full SQE audit methodology

**Data sources:**
- SQE code: `server/core/filters/signal_quality_evaluator.ts`
- ranking-weights.ts, score-calculator.ts, expectancy.ts
- Past 2-4 weeks of VTS trade records (what SQE would have rejected if applied)
- Pattern-pool guardrails, confidence floors, governance gates
- skipped-signals-logger output to see SQE null-reasons historical distribution

**Analysis steps:**
1. **Threshold audit:** pull distribution of FinalScore and RegimeWeight on accepted and rejected signals over 2-4 weeks. Verify default 0.35 and 0.30 are discriminative post-B62 (they separate winners from losers).
2. **Formula audit:** read score-calculator.ts, trace FinalScore and RegimeWeight formulas. Identify any components that reference pre-B62 regime names or distributions. Flag stale references.
3. **rankingScore architecture evaluation (the 3 outcomes):**
   - For each of the three options (keep separation / add sanity floor / full collapse), back-test against 2-4 weeks of VTS signals
   - Option 1: current behavior, baseline
   - Option 2: filter with rankingScore < threshold; measure what's additionally rejected and whether those rejections would have lost money
   - Option 3: collapse rankingScore into SQE gate; measure full regression surface
   - Produce verdict with Langston's prior (sanity floor most likely) explicitly validated or overturned
4. **VTS-alignment gap:** for each losing-signal pattern VTS reveals in bulk (e.g., "morning_star at DBS < 0.20 in RANGE_BOUND_STABLE loses at 65% rate"), check whether SQE would have rejected it. Catalog gaps.
5. **Structural single-vs-multi-stage question:** evaluate whether splitting SQE into quality gate + economic gate + context gate would let B64+ tune selectively without regression risk.
6. **Governance gates review:** exposure, cooldown, eligibility — are their thresholds still calibrated?

**Deliverable:** `Claude Comms and Packages/Scope Files/B63_ITEM18_SQE_AUDIT.md`

### Item 19 — Classifier cadence / latency audit methodology

**Data sources:**
- Code: regime-stability.ts, mapping-drift-calculator.ts, fx5-scanner.ts (for cycle cadence)
- PM2 log captures of `[11.7R][Stability]` at 30s granularity
- MCE telemetry showing regimeConfidence per cycle
- Historical market-shift events (identified by sharp transitions in the observed regime mix)

**Per-input measurements:**
- **driftScore:** EMA alpha = 0.4 on VolZ and TrendZ histories. Given alpha=0.4, half-life ≈ 2 cycles (1 minute). Full convergence to new regime ≈ 10-15 cycles (~5-7 minutes). Verify by injecting step-change in synthetic data.
- **volZ:** compute volZ lookback window; measure response latency to market vol shift.
- **regimeConfidence:** trace classifier's confidence computation. Identify its effective lookback and responsiveness.
- **flipRate:** 7-day rolling count of regime changes. Structurally too slow for 2-6h shifts — confirm quantitatively.

**Full-loop latency measurement:**
- Identify a historical market-shift event (e.g., clear transition from range-bound to trending regime)
- Measure time from shift onset to (a) classifier changes stability verdict, (b) mode overlay changes, (c) trade outcomes reflect the shift
- Compute total adaptation lag

**Comparison:**
- Plot observed market-shift timescales (from streakiness data — 2-6h windows) vs classifier full-loop latency
- Identify inputs responsible for the worst lag (expected: flipRate + possibly driftScore tail drag)

**Deliverable:** `Claude Comms and Packages/Scope Files/B63_ITEM19_CADENCE_LATENCY_AUDIT.md`

---

## 15. Implementation sequence — Items 10-14, 16 (ordered)

Audit items (15, 18, 19) run in parallel, unordered — they don't block implementation.

**Ship order (Langston-confirmed 2026-04-21):**

Three stages, combining 10B + 10C into a single stage because Items 11/12/14 touch the same vts-runner + paper-execution-engine code region and are logically coupled (lane routing + geometry override + mode-overlay bypass all define the strong-trend-lane semantics together).

1. **Stage 10A — Counter-trend LONG guards (Item 10)**
   - Edits: morning-star.ts, reverse-impulse.ts, defensive-hedge.ts (LONG-only verify FIRST), sma_trend_ride block
   - Small, low-risk, can ship standalone
   - Verification: `b63b_counter_trend_long_exclusion` null-reason count > 0 within minutes

2. **Stage 10B+10C — vwap_pullback promotion + geometry override + mode-overlay lane bypass (Items 11, 12, 14)**
   - Edits: strategy-engine.ts (vwap_pullback block), canonical-regime-strategy-map.ts, new routing-types.ts, vts-runner.ts, paper-execution-engine.ts, **plus signal-orchestrator.ts if mode-overlay is also consumed there** (Langston: patch ALL mode-overlay consumption points, not just the obvious two)
   - Contract tests: geometry override consumption, lane bypass
   - Verification: vwap_pullback fires under sourcePool='quant-strong_trend' with Variant E geometry; sbt trades have ratio 2:1 consistently regardless of mode

3. **Stage 16 — Global DBS architecture fix**
   - Edits: directional-bias.ts (store + snapshot), market-context-engine.ts (consumer), market-indicators.ts (consumer), directional-bias.types.ts
   - In-memory only for B63 (per Langston — no DB persistence in this batch; cold-start warmup acceptable)
   - Unit + integration tests for store, snapshot, floor, staleness, cold-start
   - Verification: global DBS value deterministic within cycle; coverage-degraded events retain last snapshot with stale flag; cold-start behavior matches §13 Item 16 behavior spec

**Cohort separation:** each stage's deploy creates a new observation cohort in the completion-report's observation plan. If stages ship close together (same day), collapse adjacent cohorts per Langston's rule.

**Audit items (15/18/19):** started in parallel once Stage 10A is shipped (analysis doesn't require any implementation to be ready — works off existing 2-4w data).

---

## 16. Deploy + verification plan (extended)

**Pre-deploy (each stage):**
- CI all 4 checks GREEN
- Langston code-level review of diff
- Unit/contract tests passing

**Post-deploy verification (per stage):**
- PM2 restart confirmed
- Smoke test via `/api/vts/filter-diagnostics`
- Log grep for expected null-reasons (Item 10 guards firing) or sourcePool routing (Item 11 vwap_pullback in lane)
- 15-minute burn-in before declaring stage complete

**Observation windows for cohort analysis:**
- Minimum 48h post-deploy before first metric evaluation
- Minimum 1 week for Item 13 decision gate (vwap_pullback-in-strong-trend-lane)
- Continuous during audit-item work

---

## 17. Governance update list (Tier 1 + Tier 2, extended)

**Tier 1 (mandatory):**
- `BATCH_CATALOG.md` — B63 entry updated with expanded scope (19 items)
- `PHASE_HISTORY.md` — Phase 15b sub-C extended to cover full item list
- `.claude/memory/MEMORY.md` — updated (already done)
- `BATCH_63_SCOPE.md` — updated (already done)
- `BATCH_63_PRE_AUDIT.md` — this Part 2 extension
- `BATCH_63_COMPLETION_REPORT.md` — will list all 19 items' outcomes with cohort separation

**Tier 2 (required when applicable):**
- `SYSTEM_MANUAL.md` — new sub-sections for:
  - strong-trend lane as first-class routing concept
  - mode-overlay lane bypass (architecture principle)
  - global DBS persistent store + snapshot architecture
  - counter-trend LONG guard pattern
- `SYSTEM_IMPACT_MAP.md` — updates to:
  - §5.1b (regime classifier) — note that stability classifier is under Item 15 audit review
  - §5.2.5 (strategy engine) — list updated guards on morning_star, reverse_impulse, defensive_hedge, sma_trend_ride, vwap_pullback
  - §5.2 (strong-trend lane) — add vwap_pullback as additional eligible detector; note Variant E geometry override
  - §5.1 (global DBS) — rewrite to describe store + snapshot + 20-pair floor architecture
  - §7.1 (mode overlay) — add lane bypass
- `CHANGES_AND_FIXES.md` — new entries:
  - `DBS-B63B-001` Counter-trend LONG guard (mirror defect fix)
  - `DBS-B63B-002` vwap_pullback strong-trend lane promotion
  - `DBS-B63B-003` Strong-trend geometry override plumbing
  - `DBS-B63B-004` Strong-trend lane mode-overlay bypass
  - `DBS-B64-PREP-001` Global DBS persistent store + snapshot (originally planned for B64, implemented in B63)
- `RUNNING_ISSUES.md` — add audit items as open investigations (closed when audit deliverables land)

---

## 18. Known risks + mitigations (extended)

| Risk | Mitigation |
|---|---|
| Item 10 guards over-restrict on defensive_hedge if it was historically not LONG-only | Pre-audit task: verify defensive_hedge is LONG-only before adding guard. If not, audit shows we need to add a SHORT guard too or skip defensive_hedge from Item 10. |
| Item 11 double-evaluation — vwap_pullback now eligible in two pools, could fire twice on same pair | Canonical map change must make eligibility EXCLUSIVE: high-DBS pairs route to strong-trend lane ONLY (Item 4 unchanged). So vwap_pullback fires in strong-trend lane if pair has high DBS, or in its original pool if low DBS — never both. Test: grep log for same-pair same-cycle double vwap_pullback signals — should be zero. |
| Item 11 lane-conflict — vwap_pullback AND strong_bull_trend both fire on same high-DBS pair same cycle | Implemented first-claim-wins arbitration in vts-runner.ts above the Batch 19G duplicate guard. Null-reason `strong_trend_lane_conflict` logged when second lane-eligible strategy is blocked. Upgrade to strict R-multiple arbitration deferred pending observation. |
| Item 12 geometry override incorrectly applied to strong_bull_trend (which should use native constants) | Contract test verifies strong_bull_trend ignores override context. |
| Item 14 bypass incorrectly applied to non-strong-trend sourcePool | Unit test verifies only `sourcePool === 'quant-strong_trend'` triggers bypass; every other sourcePool value still applies mode overlay. |
| Item 16 persistent store leaks memory under long runtime | Hard expiry at 5 minutes enforces cap on store size. Periodic expiry sweep in scanner cycle. |
| Item 16 snapshot reads get stale data during FX5 scanner pauses | Consumers check snapshot.isStale and handle gracefully. UI surfaces stale flag visibly. |
| Audit items (15/18/19) become vague narrative despite predefined outputs | Explicit deliverable filenames + predefined output lists in scope doc. Langston review of each deliverable before B63 close. |
| Cohort separation fails because stages ship too close together | Langston's collapse rule: if same-day ship, collapse cohorts in report. Not a failure — just ensures attribution stays honest. |
| Rollback needed on any stage | Each stage is independently revertible. Items 10-14 are additive guards or lane-specific logic; revertible via git. Item 16 is larger but has clear before/after — revert to pre-B63 global DBS computation if snapshot architecture shows unexpected bugs. |
| Langston's 6 rotation risks from Item 15 audit — feedback loop, sample-size fraud, whipsaw, hysteresis, family definitions, long-only asymmetry | These are AUDIT OUTPUT concerns, not B63 implementation risks. Item 15's audit deliverable includes a risk register explicitly addressing each. No B63 implementation decision rides on them (audit is audit-only). |

---

## 19. Open questions — RESOLVED 2026-04-21 by Langston

| # | Question | Resolution |
|---|---|---|
| 1 | `defensive_hedge` LONG-only verification | Verify directionality FIRST before applying Item 10 guard. Grep the code for SHORT branches. If LONG-only, proceed. If mixed, skip defensive_hedge from Item 10 or add direction-conditional guard. |
| 2 | signal-orchestrator mode-overlay consumption check | Patch ALL mode-overlay consumption points, including signal-orchestrator if applicable. Grep `stopLossDistanceMultiplier\|takeProfitDistanceMultiplier` across server/services and patch every hit that applies the multipliers asymmetrically to stop and target distances. |
| 3 | Item 16 store persistence | In-memory only for B63. Cold-start warmup acceptable. DB persistence deferred to B64+ if operational evidence demands it. |
| 4 | Stage sequencing | **10A → (10B + 10C) → 16 → audits in parallel after 10A.** 10B and 10C combined into one stage because Items 11/12/14 touch the same vts-runner + paper-execution-engine code region. |

---

**End of Part 2.** Langston review complete + all four open questions resolved. Implementation clear to proceed per §15 staged sequence with audit items 15/18/19 starting in parallel after Stage 10A.
