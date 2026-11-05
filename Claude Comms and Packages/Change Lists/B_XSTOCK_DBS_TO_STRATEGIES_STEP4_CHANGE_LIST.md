# B-XSTOCK-DBS-TO-STRATEGIES (#1235) — STEP 4 CHANGE LIST

**Code commit:** `e505232095db33261100c07e25a8c21aebd13893` (on `origin/migration/aws-supabase`) · **Scope:** r4a (`d2c12c731`) · **Pre-audit:** r4 (`c4a74898f`), Langston PROCEED on r2 with C-1..C-3 (folded in r4) · **change-class:** architecture

## Files (11)
| file | plan item | what |
|---|---|---|
| `server/asset_classes/xstock_spot/detect-indicators.ts` (NEW) | P1, P2 | `buildXstockDetectIndicators(mceIndicators, propagatedDbs)` returns a spread copy plus `dbsScore` / `dbsCategory` / `dbsSlope`; `detectDbsScoreOf()` returns a finite number or null |
| `server/asset_classes/xstock_spot/eval-cycle.ts` | P1, P2, P3, C-2 | builds `detectIndicators` once per pair after the MCE; passes it to `callStrategyDetect`; provenance scalars are read from it; `detectDbsScore` at all 8 archive sites; 3 coverage counters |
| `server/asset_classes/xstock_spot/scanner.ts` | P3 | `detect_evals` / `dbs_carried` / `dbs_ge_035` on the per-cycle summary line |
| `server/strategies/volatility-edge.ts` | P4 | `>= 0.35` becomes `>= getCachedNumberRequired('strategy_dbs_routing_guards','dbs_min_threshold',{exchange:'*',assetClass,strategy:STRATEGY_KEY,regime:'*'})`, with only the `>=` arm |
| `server/services/strong-trend-geometry.ts` (NEW) | P5 | `readStrongTrendGeometryOverride(assetClass)`, two `getCachedNumberRequired` reads from `strategy.vwap_pullback` keyed to `vwap_pullback` + the class |
| `server/services/vts-runner.ts` | P5 | `isStrongTrendLane ? readStrongTrendGeometryOverride(_assetClass) : undefined` (was the `{4.0, 3.0}` literal) |
| `drizzle/migrations/2026-11-05-b-xstock-dbs-to-strategies.sql` (+ `-rollback.sql`, MANIFEST) | P6 | 3 rows: `*/*/volatility_edge/*` = 0.35; `*/crypto_spot/vwap_pullback/*` stop 4.0, target 3.0. `ON CONFLICT DO NOTHING`, count-asserted = 3 |
| `server/tests/integration/b72-dbs-routing-guards-consistency.test.ts` | P8 | `volatility_edge` joins `STRATEGIES`; titles `:55`/`:72`/`:112` lose "all 4"; the header names the fifth member |
| `server/tests/unit/b-xstock-dbs-to-strategies.test.ts` (NEW) | P9 | 16 tests: builder carries / preserves / does not mutate / absent-not-0; `detectDbsScoreOf`; volatility_edge reads the setting (0.20 refuses at 0.25; 0.30 passes) with the key asserted, no mirror arm, a missing row throws; override returns the seeded values with the key asserted and throws if missing; source fences (detect gets `detectIndicators`; all 8 sites carry the key, comments stripped; attach only in the arm, no literals; no literal 0.35) |

## Load-bearing hunks
**eval-cycle.ts: the hand-off (after `const regime = …`)**
```ts
const detectIndicators = buildXstockDetectIndicators(mceContext.indicators, propagatedDbs);
const detectDbsScore = detectDbsScoreOf(detectIndicators);
…
counters.detectEvals++;
if (detectDbsScore !== null) { counters.dbsCarriedEvals++; if (detectDbsScore >= 0.35) counters.dbsGe035Evals++; }
strategySignal = callStrategyDetect(strategyKey, detectIndicators, ohlc as any, stratPatternInput as any, symbol, ASSET_CLASS, 'tag');
```
BEFORE: `callStrategyDetect(strategyKey, mceContext.indicators, …)`.

**volatility-edge.ts**
```ts
// BEFORE: if (((indicators as any).dbsScore ?? 0) >= 0.35) {
const dbsGuardThreshold = getCachedNumberRequired('strategy_dbs_routing_guards', 'dbs_min_threshold',
  { exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*' });
if (((indicators as any).dbsScore ?? 0) >= dbsGuardThreshold) {
```

**vts-runner.ts**
```ts
// BEFORE: strongTrendGeometryOverride: isStrongTrendLane ? { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 } : undefined,
strongTrendGeometryOverride: isStrongTrendLane ? readStrongTrendGeometryOverride(_assetClass) : undefined,
```

## Step-4 condition (Langston PROCEED 2026-11-05 ~06:30Z)
- **The coverage bucket is renamed, and it is NOT the guard's threshold.** `dbsStrongEvals` / `dbs_strong` become `dbsGe035Evals` / `dbs_ge_035`, a FIXED distribution bucket at 0.35. The guards read `dbs_min_threshold` / `counter_trend_long_dbs_floor` from the database, which can move by SQL; the bucket deliberately does not. The counter comment says so.
- **Step-7 report line, restated:** `dbs_carried / detect_evals` is per-detect-call coverage, strategy-weighted (one pair's score is counted once per strategy evaluated). That is a DIFFERENT population from (a′)'s archive-row matchability (93.9 % floor), so the two are never set beside each other as one number.

## Langston's second Step-4 ruling (stateless, on the original `e505232095`), folded 2026-11-05 ~06:00Z
- **C-1(a):** satisfied by the rename at `da796affa`, from his first ruling: `dbsGe035Evals` / `dbs_ge_035` is a fixed observation bucket, not the DB threshold.
- **C-1(b):** NOT a new counter, because that would mean another restart inside two live observation windows. **Stated instead: `dbs_ge_035` is the POSITIVE tail only. Evidence for the negative arm (the newly live counter-trend refusals on morning_star, vwap_pullback and sma_trend_ride) rests on Step-7 (a), the per-row bidirectional agreement test.** Early read 05:36-05:38Z: morning_star 19 `b63b` with 0 disagreements; sma_trend_ride 12 `b63b` with 0 disagreements.
- **C-2:** the `detect-indicators.ts` header no longer lists the provenance capture among the readers of `mceContext.indicators` (it reads `detectIndicators`). The B72 test header now states the group shares ONE VALUE, not one shape: `volatility_edge` is deliberately one-sided. Both are comment-only, in a follow-up commit that rides the next deploy.
- **R-1, re-land assertions, read at the DEPLOYED sha `8636040255`:**
  - **(i)** `git diff e505232095db 8636040255 --` over the 11 paths = `eval-cycle.ts` +10/−5 and `scanner.ts` +1/−1, which is exactly the C-1 rename at `da796affa`. Nothing else.
  - **(ii)** the fences ran AT THE HEAD: CI `41974716842` (sha `8636040255`) printed and passed the 4 `source fences` tests. `archiveSignalEval({` count at the sha = 8.
  - **(iii)** `server/startup/b72-warmup.ts` at the sha lists `strategy_dbs_routing_guards` (`:31`) and `strategy.vwap_pullback` (`:89`).

## Evidence
- **Unit:** `npx vitest run server/tests/unit/b-xstock-dbs-to-strategies.test.ts` → 16/16.
- **Mutations, each RED (the suite compiled each time):**
  - M1: the builder drops `dbsScore`.
  - M2: the loop passes the raw MCE object.
  - M3: one archive site loses the key. ⚠️ It first came back GREEN, because a comment on the same line named the key; the fence now strips comments, then RED.
  - M4: the literal 0.35 restored.
  - M5: the literals `{4.0, 3.0}` restored.
  - M6: the override key loses its asset class.
- **tsc baseline:** 329 = 329.
- **Full local suite:** 381 of 392 files pass. The 10 failing files are environmental:
  - 8 need a database that this laptop cannot reach (`pg-pool AggregateError`), including the B72 file, which runs in CI because CI sets `DATABASE_URL`;
  - 2 never load on Windows (`b-staging-liveness-watch`, `b-tsc-baseline-fix`, a SyntaxError on load, untouched by this batch).
- **CI 41963837291 at `e3a295e93`: 4/4 green** (Test Suite, Build, TypeScript Check (baseline gate), Docker Build). The run at `e50523209` was cancelled when the next push superseded it; it was not a failure.
  - **The B72 suite EXECUTED in CI and was not skipped** (Langston's record item): all five tests printed timings (3 / 2 / 2 / 0 / 1 ms) and passed against CI's fresh Postgres, including the fifth group row. The log shows `db-migrate` applying `2026-11-05-b-xstock-dbs-to-strategies.sql` (✓) and `2026-05-05-b72-dbs-routing-guards.sql` as a skip-marker ledger-only entry, as Langston noted.
  - Step 7 still runs the suite against STAGING.

## Pre-registered Step 7 (from pre-audit P10, §1.6, §1.8, §1.9)
- **(a) agreement test.** All xStock `mode='vts'` rows must agree with the guards; the 1 % floors apply to `gate='strategy_detect'` rows, bidirectional for morning_star, vwap_pullback and sma_trend_ride; plus the null arm.
- **(a′) equality and coverage.** Equality: ≥ 99 % of matched rows have `detectDbsScore = dbs_score`. Coverage: ≥ 93.9 % match (baseline 96.89 %, same or previous minute).
- **(b) strong_bull_trend.**
  - b-control: the `dbs_below_threshold` share falls;
  - b-observe: investigate at more than 10 paper opens, more than 50 % of xStock paper opens, any geometry mismatch, or any `EVAL_DETECT_FAIL`;
  - report how many evaluations clear the floor.
- **(c) crypto unchanged.**
- **Report:** the evaluation-level refusal share beside the 18.3 % trade figure.
- **(E) archive switch:** `pre_filter` is read twice.
- **P7:** the three carrier log counts, before against after.
- **(d) Filter Diagnostics in Chrome.** ⛔ Not the Drift Dashboard.
- **C-1:** `dd588f0d`'s day-21 verdict (2026-11-06T10:47:40Z) records the structural cause and restarts the window at this deploy.
