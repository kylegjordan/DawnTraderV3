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

**End of Pre-Audit + Implementation Plan.** Ready for Langston review + consensus. On approval, implementation proceeds per §6.
