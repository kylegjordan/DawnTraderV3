# Batch 65 — TEC Wiring + Asset Class + Exchange Schema

**Author:** Claude Code, 2026-04-22 (Langston review 2026-04-23, refinements applied)
**Status:** Phase 1 scope with Langston's B65 refinement applied (underlying column NOT NULL with derivation default). Ready for Phase 2 pre-audit.
**Phase:** 15c
**Prereq:** B64 (canonical map sync / residual UI alignment)
**Blocks:** B66 (SQE recalibration — needs the module_constants table schema), B67 (external data — needs asset-class routing dimension), Modularization Phase, Phase 21.5 asset-class expansion

---

## 1. Purpose

B65 has two concurrent workstreams that share scope because both touch pair metadata + DB schema:

1. **TEC (Trailing Exit Controller) wiring as a shared service** (original B65 scope, from `POST_B62_PRE_LAUNCH_PLAN.md`). Activate the dormant `trailing-exit-controller.ts` module so VTS and paper execution engines use the SAME trailing-exit logic. Prevents drift between learning and execution.

2. **Asset class + exchange schema formalization** (added 2026-04-22 per Kyle modularization directive). Add `asset_class` and `exchange` as first-class dimensions on pair metadata and on the `module_constants` table. Required before B66 can promote constants to a modularization-ready schema.

Both workstreams are pre-Phase-19 preparation. No immediate deploy during the observation window (runs through 2026-04-28). Implementation after the current observation + Item 13 decision gate closes.

---

## 2. Operating-Mode Context

**Active trading is OFF. Paper trading is OFF. Only VTS (passive learning) is running.** TEC wiring targets VTS path (where it enables better learning data) AND paper path (for when Phase 19 turns paper on). Schema changes are data-model only and don't affect current runtime behavior.

---

## 3. Workstream A — TEC wiring as shared service

### 3.1 Current state

- `server/services/trailing-exit-controller.ts` exists as a dormant module
- VTS path has minimal trailing-exit behavior (stop-loss at entry-time value, no trailing)
- Paper execution engine has its own duplicated trailing logic (slightly different from VTS)
- Net effect: VTS trades close at original stop or target; paper-mode trades have modestly better trailing exits
- Inconsistency means VTS learning data doesn't reflect paper-mode exit realities — a learning gap

### 3.2 Action

- Activate `trailing-exit-controller.ts` as a registered service
- Refactor VTS exit-checking loop to delegate to TEC
- Refactor paper-execution-engine exit logic to delegate to TEC
- Ensure both paths call TEC with the same parameter signature and receive the same decision (stop/target/trailing/timeout)
- Log TEC decisions for audit and telemetry

### 3.3 Constraints

- Do NOT change the TRAILING POLICY itself (that's a B66+ discussion). B65 just wires the existing TEC into both paths.
- TEC's configuration (trail distance, activation threshold) goes into `module_constants` from day one (see Workstream B)
- Asset-class-awareness: TEC parameters may differ per asset class (e.g. crypto can trail tighter than equity). The interface takes asset_class as a parameter even if the initial data has only one value.

### 3.4 Tests

- Unit tests confirming VTS and paper paths receive identical TEC decisions given identical inputs
- Integration test simulating a price path that SHOULD trigger trailing in both modes — verify identical outcomes
- Smoke test: deploy to staging, verify no regression in VTS trade rates, check TEC log output

---

## 4. Workstream B — Asset class + exchange schema formalization

### 4.1 Current state

- Pair metadata in `screener_filters` table has NO `asset_class` or `exchange` field — all current pairs are implicitly `crypto_spot` on Kraken
- Strategy / filter / constant code paths assume crypto-spot-on-Kraken without parameterization
- Multi-dimensional module_constants table from Modularization Synthesis does not exist yet

### 4.2 Action

**DB migrations:**

1. Add `exchange TEXT NOT NULL DEFAULT 'kraken'` column to pair metadata tables
2. Add `asset_class TEXT NOT NULL DEFAULT 'crypto_spot'` column to pair metadata tables
3. Add `underlying TEXT NOT NULL` column with derivation default populated at migration time (per Langston review 2026-04-23: was originally proposed nullable, changed to NOT NULL-with-derivation so B66's per-underlying position limit has guaranteed coverage). Derivation rule for crypto spot: `underlying = symbol.split('/')[0]` (e.g. `ETH/USDT` → `ETH`, `BTC/USD` → `BTC`). For pairs without a parseable `/`, fall back to `underlying = symbol` itself and log a warning for operator review. **No pair row may have a null underlying** — the migration fails and is rolled back if any row can't be derived.
4. Create `module_constants` table per Modularization Synthesis §3.2 / §3.5 (5-dimensional with most-specific-wins resolution)
5. Backfill existing rows: all pairs get `exchange='kraken', asset_class='crypto_spot'`, `underlying` derived from the symbol per the rule above. Verification step in the migration: `SELECT COUNT(*) FROM screener_filters WHERE underlying IS NULL` must return 0 before commit.

**Code changes:**

- Thread `exchange` and `asset_class` parameters through pair-fetching + pair-passing code paths. Default to the backfilled values (no behavior change initially).
- Add a `moduleConstantsService` with a read-only API: `getConstant(moduleName, exchange, assetClass, strategy, regime, constantName): value` with fallback resolution per the hierarchy.
- Add a write API (admin-only, API-keyed) for future adjustment-authority wiring: `setConstant(moduleName, exchange, assetClass, strategy, regime, constantName, value, updatedBy)`.
- Cache the constants per (module, exchange, asset_class) tuple with a 60s TTL (same pattern as MCE).

**No actual constants migrated yet.** B65 creates the table and service infrastructure. B66 does the first promotions (6 P1 formula constants).

### 4.3 Constraints

- Do NOT populate the table with current hardcoded constant values in B65. That's B66's first action. B65 creates the schema and service; B66 uses it.
- Do NOT change pair-lookup semantics. Adding columns with defaults must not change any current query behavior.
- Logging: when `moduleConstantsService.getConstant()` falls back (no specific value exists, using default), log at debug level. When the KEY doesn't exist at all, log a WARN (would catch typos).

### 4.4 Tests

- Unit tests for the resolution hierarchy: (a) most-specific match wins, (b) wildcard fallback works, (c) missing key returns undefined with warning
- Integration test: query the table via `moduleConstantsService`, verify cached reads don't hit DB for 60s
- Migration test: verify backfill populates all existing pair rows with the expected defaults

---

## 5. Sequencing within B65

B65 implements both workstreams in parallel-feasible order:

| Order | Action | Engineer-days |
|---|---|---|
| 1 | DB migration: add exchange + asset_class + underlying columns to pair metadata | 1 |
| 2 | DB migration: create module_constants table with 5D primary key | 0.5 |
| 3 | Implement `moduleConstantsService` with read API + 60s cache + resolution hierarchy | 2 |
| 4 | Write unit tests for resolution hierarchy | 1 |
| 5 | Activate `trailing-exit-controller.ts` as a registered service | 1 |
| 6 | Refactor VTS exit loop to call TEC | 1 |
| 7 | Refactor paper-execution exit logic to call TEC | 1 |
| 8 | Thread exchange + asset_class through pair-passing code paths | 2 |
| 9 | Unit tests for VTS-paper TEC parity + integration test for price path | 1.5 |
| 10 | Write API (admin-only) for module_constants | 1 |
| 11 | Governance + CI verification + deployment | 1 |
| **Total** | | **13 engineer-days** |

Actual calendar depends on review cadence.

---

## 6. Out of scope (deferred)

- **Actual constant promotion** (the 6 P1 formula constants, PredConf rolling window, per-underlying position limits, etc.) — these happen in B66, which depends on B65 finishing first
- **Module extraction / monolith refactor** — Modularization Phase, post-live
- **Exchange Adapter abstraction** — Modularization Phase; B65 threads parameters but does not abstract the data feed
- **Filter Module Family implementation** — Modularization Phase
- **Actual new exchange or asset class** — Phase 21.5
- **Changes to TEC's trailing policy** — B66 or later; B65 wires existing behavior, doesn't change it

---

## 7. Success criteria

1. VTS and paper execution engines both call `trailing-exit-controller.ts` for exit decisions. Identical input produces identical output across both paths.
2. `screener_filters` table (and/or whatever pair metadata table is primary) has `exchange`, `asset_class`, `underlying` columns populated for all existing pairs.
3. `module_constants` table exists and is queryable via `moduleConstantsService`. Resolution hierarchy (5D → wildcard → default) verified via unit tests.
4. `moduleConstantsService.getConstant()` cache hit rate > 90% on repeated queries.
5. No regression in VTS trade generation rate, no regression in paper-mode trailing exits, no new errors in PM2 logs post-deploy.
6. CI green: TypeScript Check, Test Suite, Build, Docker Build.

---

## 8. Governance

Per CLAUDE.md §3:
- `BATCH_CATALOG.md` — B65 entry
- `PHASE_HISTORY.md` — Phase 15c update
- `MEMORY.md` — state update
- `BATCH_65_SCOPE.md` — this doc
- `BATCH_65_PRE_AUDIT.md` — written pre-implementation post-review
- `BATCH_65_COMPLETION_REPORT.md` — written during closeout

Tier 2 (applicable):
- `SYSTEM_MANUAL.md` — new §B65 for TEC shared service + `module_constants` schema + `moduleConstantsService`
- `SYSTEM_IMPACT_MAP.md` — new components (TEC as registered service, moduleConstantsService, schema migrations)
- `CHANGES_AND_FIXES.md` — entries for schema migrations + TEC activation

---

## 9. Open questions for Langston / Kyle review

1. **Primary key for pair metadata** — should it be `(exchange, symbol)` now that same symbol can exist on multiple exchanges? Or keep `symbol` as key and add `exchange` as a non-unique column?
2. **Underlying derivation rule** — propose `ETH/USDT` → `ETH`, `BTC-PERP-KRAKEN` → `BTC`, `TSLA-KRAKEN-XSTOCK` → `TSLA`. Does this scale to perpetuals / FX?
3. **module_constants value type** — JSONB (flexible, good for structured values) vs NUMERIC + VARCHAR (typed but rigid). Proposal: JSONB.
4. **TEC trailing parameters default values** — align with current paper-execution values or pick new defaults? Propose align.
5. **B65 branch strategy** — single branch for both workstreams, or separate?

---

*End of B65 scope. Langston code-level review next, per the workflow in CLAUDE.md §2. Do not implement before current observation window closes (2026-04-28 Item 13 gate minimum).*
