# B-DB-REGIME-ENUM-ALIGN (#1263) — STEP 4 CHANGE LIST (Langston code review)

## DISPATCH HEADER (workflow-04, three fields)

| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (scope header, verbatim) |
| ii | **DOC SET, ROW BY ROW** | see table below |
| iii | **STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_DB_REGIME_ENUM_ALIGN_PRE_AUDIT.md` at `9876582f9`; Langston Step-2 PROCEED with conditions (a)-(d) and 1-7, answered in §4 |

| document | class rule | state at this ref |
|---|---|---|
| SCOPE `B_DB_REGIME_ENUM_ALIGN_SCOPE.md` | REQUIRED | present |
| PRE_AUDIT `B_DB_REGIME_ENUM_ALIGN_PRE_AUDIT.md` | REQUIRED | present (`9876582f9`) |
| COMPLETION_REPORT | REQUIRED | absent — Step 11 |
| `BATCH_CATALOG.md` | REQUIRED | absent — Step 10 |
| `PHASE_HISTORY.md` | REQUIRED | absent — Step 10 |
| `SYSTEM_MANUAL.md` | REQUIRED | **present in this commit** (regime-name pass + ROI table source note, §6) |
| `SYSTEM_IMPACT_MAP.md` | REQUIRED | **present in this commit** (§7.6) |
| `CHANGES_AND_FIXES.md` | judged | Step 10 — will carry an entry (a real defect fixed) |
| `RUNNING_ISSUES.md` | judged | #1263 entry exists; updated at Step 10. (The +1 line in my worktree is NOT mine and is NOT in this commit.) |
| `POST_AUDIT_ROADMAP.md` | judged | N/A expected — no roadmap item changes; judged again at Step 10 |
| `DELETED_COMPONENTS_LOG.md` | judged | **present in this commit** (2026-11-22 entry; archive `_archive/deleted-code/telemetry-repository.toDBRegime.20261122-B-DB-REGIME-ENUM-ALIGN.ts.removed`) |
| `ADJUSTMENT_FRAMEWORK.md` | judged | N/A expected — no constant value changes (the ROI rows were already canonical, §6) |
| `PHASE_19_PLAN.md` | not P19-* | N/A — no row there |
| `SPRINT_TO_LIVE_PLAN.md` | row exists (CC-C list, line 46) | closed with report link at Step 11 |
| MEMORY files + task list | REQUIRED | Step 10 |

**Ref:** `origin/migration/aws-supabase` at the commit carrying this file (subject `B-DB-REGIME-ENUM-ALIGN Step 3: …`). All `path:line` below are at that ref.

---

## 1. WHAT THE BATCH FIXES (one paragraph)

`market_regime` (the PostgreSQL enum behind `telemetry_history.regime` and `adaptive_learning.regime`) was created with six pre-canonical labels (`2026-04-22-initial-schema.sql:534`, `2026-11-1A-persistent-intelligence.sql:38`) and never extended. `shared/schema.ts` declared twelve. The writer (`telemetry-aggregator.ts` → `saveTelemetryRecord`) always carries a canonical label, and `toDBRegime` cast it straight through, so every insert it attempts would be refused. The writer is gated by `shouldPersist()` (MODE=live, or FORCE_PERSIST=true), so paper mode loses nothing today; the first live-mode write would have failed. This batch: adds the five canonical values by migration, drops `HIGH_VOL_IMPULSE` from the declaration (never storable, no producer), derives the DB type from the pgEnum, types the write path canonical-only, normalizes+warns at the writer, deletes `toDBRegime` and the extended `MarketRegime` union.

## 2. CHANGE SET (tracked + untracked; `git status --porcelain` cross-checked for `??`)

Modified: `shared/schema.ts`, `server/services/telemetry-repository.ts`, `server/services/telemetry-aggregator.ts`, `server/services/adaptive-learning-repository.ts`, `server/core/risk/dynamic-sizing-engine.ts`, `server/tests/integration/telemetry_persistence_sql.test.ts`, `server/tests/integration/telemetry_provenance_patch.test.ts`, `drizzle/migrations/MANIFEST.txt` (line 263), `package.json` (npm script), `.tsc-baseline.json`, `1-system-manual/SYSTEM_MANUAL.md`, `1-system-manual/SYSTEM_IMPACT_MAP.md`, `1-system-manual/DELETED_COMPONENTS_LOG.md`.
New: `drizzle/migrations/2026-11-22-b-db-regime-enum-align.sql` (+ `-rollback.sql`, in git, NOT in MANIFEST), `scripts/b-db-regime-enum-align-proof.ts`, `server/tests/unit/b-db-regime-enum-align.test.ts`, `server/tests/unit/b-db-regime-enum-align-writer.test.ts`, the `.removed` archive.

## 3. LOAD-BEARING HUNKS

**3.1 Migration (forward)** — no BEGIN (enum ADD VALUE; precedent `2026-11-05-b-balance-session-pairing-block-reasons.sql`):
```sql
ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'TREND_FRIENDLY_STABLE';
ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'HIGH_VOLATILITY_UNSTABLE';
ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'RANGE_BOUND_STABLE';
ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'IMPULSE_EXPANSION';
ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'STRUCTURAL_TRANSITION';
```
Rollback deletes the `_migrations` row only (PG cannot drop an enum value; leaving five extra labels breaks no earlier sha).

**3.2 `shared/schema.ts:1013-1028`**
```diff
+// market_regime = the six original labels (2026-04-22-initial-schema.sql) + the canonical five
+// (2026-11-22-b-db-regime-enum-align.sql, B-DB-REGIME-ENUM-ALIGN #1263). Must equal what the migrations create:
+// server/tests/unit/b-db-regime-enum-align.test.ts. HIGH_VOL_IMPULSE is a ghost label normalized at the writer.
 export const marketRegimeEnum = pgEnum("market_regime", [
 ...
-  "STRUCTURAL_TRANSITION",
-  "HIGH_VOL_IMPULSE"
+  "STRUCTURAL_TRANSITION"
 ]);
```

**3.3 `server/services/telemetry-repository.ts` — DELETED + derived types**
```diff
-export type MarketRegimeDB = | 'EXTREME_NOISE' | ... | 'STRUCTURAL_TRANSITION' | 'HIGH_VOL_IMPULSE';
-export type MarketRegime = MarketRegimeDB | 'TRANSITION';
-export function toDBRegime(regime: MarketRegime): MarketRegimeDB {
-  if (regime === 'TRANSITION') return 'STRUCTURAL_TRANSITION';
-  return regime as MarketRegimeDB;
-}
+export type MarketRegimeDB = (typeof marketRegimeEnum.enumValues)[number];   // READ type
 ...
+export type TelemetryWriteEntry = Omit<TelemetryEntry, 'regime'> & { regime: CanonicalRegimeType };  // WRITE type
-export async function saveTelemetryRecord(entry: TelemetryEntry)
+export async function saveTelemetryRecord(entry: TelemetryWriteEntry)
-      regime: toDBRegime(entry.regime),
+      regime: entry.regime,
```
Same change on `saveTelemetryBatch` (`:249`; zero non-test callers — noted, not deleted, outside the nine). `loadRecentTelemetry(regime: MarketRegimeDB)` now `eq(telemetryHistory.regime, regime)` with no mapper. Header comment rewritten: the Phase-14 note claimed the canonical five were "now in DB enum" — false.

**3.4 `server/services/telemetry-aggregator.ts` — P3, the writer (`:278-291`)**
```diff
+      const rawRegime: string = entry.pairRegime ?? this.currentRegime;
+      const persistedRegime = normalizeRegime(rawRegime);
+      if (persistedRegime !== rawRegime) {
+        console.warn(`[B-DB-REGIME-ENUM-ALIGN][Telemetry] non-canonical regime normalized before persist: symbol=${symbol} raw=${rawRegime} persisted=${persistedRegime}`);
+      }
       this.persistTelemetryAsync({
-        regime: entry.pairRegime ?? REGIMES.TRANSITION,
+        regime: persistedRegime,
```
Plus: `pairRegime?: CanonicalRegimeType` at `:86` and `:195`; `currentRegime: CanonicalRegimeType` at `:133`; `persistTelemetryAsync(entry: TelemetryWriteEntry)` `:307`; `getCurrentMarketRegime(): CanonicalRegimeType`; `updateMarketRegime` normalizes (type-fix only, no caller); `getDominantRegimeForClass` returns `CanonicalRegimeType` with a READ cast at `:1268`.

## 4. ANSWERS TO YOUR STEP-2 CONDITIONS

- **Claim 3 — WITHDRAWN (yours).** `'UNKNOWN'` never reaches the writer: `vts-runner.ts:6147` is a `logSkippedSignal` argument in the Net_EV_Negative branch that `continue`s at `:6152`. The two `recordPairTelemetry` callers pass `pairRegime: trade.regime` (`:4447`) and `pairRegime: tradeRecord.regime` (`:6174`), both `MarketRegimeType = CanonicalRegimeType` (`:690`), from MCE at `:1648-1649`.
- **⚠️ DEVIATION ON P3 — please attack.** The plan would have WIDENED `pairRegime` to `string`, deleting the only compile-time guard. I NARROWED it to `CanonicalRegimeType` instead: both callers already pass canonical, tsc compiles. Runtime normalize+warn stays for the untyped path (cast / JSON). P3 kept, re-justified: belt (type) + braces (runtime).
- **(a)** normalize + warn, no refusal, no counter — done (3.4). Tested: `b-db-regime-enum-align-writer.test.ts`, 4 pass (canonical unchanged no warn; fallback = currentRegime; `HIGH_VOL_IMPULSE`→`IMPULSE_EXPANSION` and `TRANSITION`→`STRUCTURAL_TRANSITION`, each warning with `symbol=`/`raw=`/`persisted=`).
- **(b)** P11 proof script — `scripts/b-db-regime-enum-align-proof.ts`, npm `b-db-regime-enum-align:proof`. Two distinguishable symbols (`B1263-PROOF-CANON`, `B1263-PROOF-GHOST`, both expect `IMPULSE_EXPANSION`), build-sha assert (`dist/BUILD_SHA` AND `HEAD` = argument), refuses (exit 2) on wrong env or if the symbols already exist; grades 2 read-back rows (regime, mode=paper) and `count(*)` +≥2. **⚠️ DEVIATION:** `n_tup_ins` is printed, NOT graded — the stats view can lag the commit; count + rows already prove the insert. Rows left in place (rehydrate reads mode='live' only).
- **(c)** tsc **324 → 314**, file_count 43 → 42. Enumerated: `adaptive-learning-repository.ts` entry gone (TS2769 ×4 "No overload matches this call."; TS2322 `'MarketRegime'` ×1); aggregator loses TS2322 `string`→`MarketRegime | undefined` ×1, TS2339 `'TRANSITION'` ×1, TS2345 `string`→`MarketRegime` ×3.
- **(d)** the nine dead items, by path:symbol (§5).
- **1** mode `'system'` is not a `trading_mode` value — the only writer of it is `server/tests/integration/cost_telemetry.test.ts:56` (CI DB). Recorded for the Kyle proposal, not changed.
- **2** MarketRegime census, WRITE/READ: repository WRITE `:195`, `:249`; READ `:133`, `:300-330`. Aggregator WRITE `:86`/`:133`/`:195`/`:307`; READ cast `:1268`; `:1413` pre-existing READ. DSE `:49`/`:54`/`:77`/`:316` → `MarketRegimeDB` (READ); `:46` (`regime as any`) and `:248` (`regime as string`) are dead READ casts on dead paths. ALR type-only. Both integration tests (persistence_sql `:20`/`:183`, provenance_patch `:23`/`:155`) — their `validRegimes` lists hold only labels in both old and new sets, so they compile unchanged against `MarketRegimeDB`. `market-indicators.ts:53` and `market-events.ts:17` declare their OWN local regime types — untouched, not this enum. `getDominantRegimeForClass` callers: `routes.ts:734-735`, `market-indicators.ts:415/418`, `signal-orchestrator.ts:1504`, `vts-runner.ts:2618` — all accept the narrower return.
- **3** set EQUALITY (both directions) — `b-db-regime-enum-align.test.ts`, 5 pass, with a positive control (the original six read from BOTH CREATE TYPEs).
- **4** F12 = 14 sites — as in the pre-audit; unchanged by implementation.
- **5** P12 windows — the deploy will name every open window from the census at deploy time (`dt-obs-windows census`), as R7d did.
- **6** `executionBlockReasonEnum` 13 → 18 — corrected in the pre-audit; not touched here.
- **7** pgEnum at `schema.ts:1016-1028` (now `:1016-1027` after the HIGH_VOL_IMPULSE line).
- "§15" in the pre-audit means the dated DELETED_COMPONENTS_LOG entry (2026-11-22).

## 5. THE DEAD ITEMS — NINE, PLUS THREE REPOSITORY EXPORTS ADDED AT r2 (no caller; NOT deleted here — a deletion proposal for Kyle's list)

1. `server/services/telemetry-aggregator.ts:768` `updateMarketRegime`
2. `:788` method `rehydrateTelemetryState` (the module function `:1649`, called `:1673`, is LIVE — different symbol)
3. `:836` `rehydrateAdaptiveLearning`
4. `:870` `persistAdaptiveLearning`
5. `server/services/adaptive-learning-repository.ts:175` `saveAdaptiveWeightsBatch`
6. `:205` `getAdaptiveLearningStats`
7. `server/core/risk/dynamic-sizing-engine.ts:198` `computeDynamicSize`
8. `dynamic-sizing-engine.ts:42` `getAdaptiveWeights` + `adaptive-learning-repository.ts:80` `loadAdaptiveWeights`
9. `server/core/telemetry/cost-telemetry.ts:223` `startCostTelemetryLoop` + `:75` `persistCostSnapshot` (inserter `:97`)
10. `server/services/telemetry-repository.ts:249` `saveTelemetryBatch`
11. `telemetry-repository.ts:299` `getTelemetryStatsByRegime`
12. `telemetry-repository.ts:161` `loadTelemetryBySymbol`

Items 10-12 added at Step 4 r2 (Langston F2): zero callers outside the defining file across `server client shared scripts`, tests included (`grep -rn`); control: the same grep finds callers of `loadRecentTelemetry`. From F3: `adaptive-learning-repository.ts` `saveAdaptiveWeights` keeps the wide `MarketRegimeDB` write type with no normalize; its only caller `persistAdaptiveLearning` (item 4) is dead, so it rides the same delete-or-reconnect proposal — and if that limb is ever reconnected, its type narrows to `CanonicalRegimeType` (Langston rider).

F16 (cost telemetry): `startCostTelemetryLoop` and `startDriftMonitor` (`server/services/monitoring/cost-drift-monitor.ts:195`) have no callers, so `persistCostSnapshot` never runs; readers stay live (`getCostHistory` → `routes.ts:8695`; `getRecentAlerts` → `:8728/:8731`; `getRecentCostDrift` `:174` only by the dead DSE). Staging `telemetry_history` count = 0 (control query returned 1). **`NOT RE-READ`** — the no-callers absence claim feeds a Kyle proposal and changes nothing built in this batch.

## 5b. STEP 4 r2 — RESPONSE TO LANGSTON'S CHANGES-NEEDED (round 1 at `329cd825b`)

- **F1 (blocking) — fixed.** The P11 proof now passes `caller: 'vts'`; `recordPairTelemetry` returns at the M70 guard for any other caller, so the old value could never reach the writer. `caller` is not persisted; the `B1263-PROOF-*` symbols stay the discriminator, and the script's own service instance leaves the app's M70 counters untouched.
- **F5 — fixed.** `n_tup_ins` is nullable in the proof; a missing `pg_stat_user_tables` row prints `unavailable`, never a false zero, and stays ungraded.
- **F2 — fixed.** The deleted-components entry now names `getTelemetryStatsByRegime` (not `getRegimeStats`) and lists the three zero-caller repository exports under LEFT INTENTIONALLY; §5 above carries them as items 10-12.
- **F3, F4 — carried** to Step 10 (governance) and the Kyle deletion proposal before Step 11, as ruled.

## 6. SYSTEM MANUAL — the ROI table correction

The min-ROI table now shows the canonical names. I read `module_constants` (`roi_gating`/`min_roi`) on staging: the rows ALREADY carry the canonical names (`updated_by` reorg-b2), identical for crypto_spot and xstock_spot (TREND_FRIENDLY_STABLE 0.0125, RANGE_BOUND_STABLE 0.0175, STRUCTURAL_TRANSITION 0.0200, HIGH_VOLATILITY_UNSTABLE 0.0250, IMPULSE_EXPANSION 0.0300). So only the MANUAL's table was stale; the source note says so. No value changed. Rest of the pass: v1.4c section banner + name mapping, ghost table corrected to `GHOST_REGIME_NORMALIZATION`, strategy "Canonical Regime" lines renamed.

## 7. JUDGEMENT CALLS I WANT ATTACKED

1. Narrowing `pairRegime` instead of widening (§4) — does any untyped caller exist that I missed? (Census: two callers, both in `vts-runner.ts`.)
2. `MarketRegimeDB` as the READ type kept on DSE/ALR dead paths rather than `CanonicalRegimeType` — READ must admit the six legacy labels already stored.
3. `n_tup_ins` reported-not-graded in P11.
4. Not deleting the nine dead items in this batch (Kyle's 2026-10-19 list rule) — they go to him as one proposal.

## 8. TESTS

Unit: 9/9 pass locally (the two new files). CI to confirm 4/4 at this ref. tsc at 314 = baseline.

## 9. STEP 9 ITERATION — THE REAL-WRITER PROOF EXPOSED THE SEVEN-COLUMN MIGRATION GAP

The first deployed P11 run at `e3a96a8126f0280a9568bb1823b9210783f0afe0` reached both writer arms and
normalized `HIGH_VOL_IMPULSE` to `IMPULSE_EXPANSION`, then PostgreSQL refused both inserts because
`telemetry_history.source` did not exist. Live census: the table had 18 columns while `shared/schema.ts`
declared 25; the exact missing population was `source`, `global_regime`, `pair_friction`,
`global_friction`, `pair_directional_bias`, `global_directional_bias`, and `decay_penalty`.

Provenance settles this as a pre-existing migration gap, not a #1263 enum failure. Commit `5bfa63bd18`
added all seven writer fields on 2026-03-05 without a migration. The persistent-intelligence migration
still creates 15 columns; the 2026-04-22 baseline adds `pool`, `position_size`, and `size_multiplier` but
still omits the seven; repo-wide migration census finds no later addition. The canonical five enum values
are present on staging and the table remains empty.

Step-9 correction:

1. `2026-11-24-b-db-regime-enum-align-telemetry-columns.sql` adds the complete seven-column population,
   then refuses unless names, types, widths/precision, nullability, and the `source='unknown'` default are
   exact. Adding only the first failing `source` column is deliberately rejected as a partial fix.
2. The rollback is forward-only/ledger-only. Dropping the columns would recreate the writer failure on
   `e3a96a812` and every pre-#1263 app ref since March; all additions are nullable and backward-compatible.
3. P11 now preflights all seven live column shapes, types `id` as the UUID string it is, and grades
   `source='vts'` on both real-writer rows in addition to symbol, canonical regime, paper mode and count.
4. Fresh-reader result: CLEAN on cause and seven-column repair; HIT on any DROP rollback and on using the
   two inserted rows alone as proof of the six optional columns. The schema preflight is the independent
   evidence for that complete population.
