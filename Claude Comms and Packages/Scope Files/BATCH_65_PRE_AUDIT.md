# Batch 65 — Pre-Implementation Audit

**Author:** Claude Code, 2026-04-23
**Status:** Phase 2 deliverable. Phase 1 scope approved by Langston 2026-04-23 with underlying-NOT-NULL-with-derivation refinement (applied to scope doc pre-audit).
**Mandatory per CLAUDE.md §9:** SIM consultation for every component affected.

---

## 1. Scope summary

B65 has 2 workstreams:
- **Workstream A — TEC wiring as shared service** (activate `trailing-exit-controller.ts` dormant module, refactor VTS + paper execution engines to delegate exit decisions to TEC)
- **Workstream B — Schema formalization** (add `exchange`, `asset_class` columns + create `module_constants` table infrastructure)

Both workstreams must land in the same batch because:
- Workstream A's TEC parameters go into `module_constants` from day one (Workstream B creates the table)
- Workstream B's schema changes do not require behavior changes (just threading parameters through code paths)

Single deploy. Not sub-staged.

---

## 2. Schema discovery (KEY FINDING for pre-audit)

Inspected `shared/schema.ts` to audit current pair metadata structure before writing migrations:

### 2.1 Existing columns that cover the "underlying" concept

**Good news: `baseCurrency` already exists on the critical tables.** This means we do NOT need to ADD an `underlying` column — we can USE `baseCurrency` as the underlying-equivalent.

| Table | Has `baseCurrency`? | Has `exchange`? | Has `asset_class`? |
|---|---|---|---|
| `watchlist_pairs` | ✅ Yes (varchar 10) | ❌ Missing | ❌ Missing |
| `trading_signals` | ✅ Yes (varchar 10) | ❌ Missing | ❌ Missing |
| `trades` | ❌ Missing (only `symbol`) | ❌ Missing | ❌ Missing |
| `paper_sim_trades` | (not verified in this pass — Phase 3 check) | ❌ Missing | ❌ Missing |
| `screener_filters` | N/A (not pair-level) | ❌ Missing (implicit kraken-only) | ❌ Missing |

**Refinement to Workstream B plan:**

Original proposal added `underlying TEXT NOT NULL` column everywhere. **Revised**: use `baseCurrency` as the underlying-equivalent on tables that already have it (`watchlist_pairs`, `trading_signals`). For tables without it (`trades`, `paper_sim_trades`), either:

- **Option A:** Add `baseCurrency` as NOT NULL with migration-time derivation (symbol.split('/')[0])
- **Option B:** Add an underlying view/join at query time without adding a column

**Recommendation: Option A** — consistency with other tables, makes per-underlying position limits (B66 scope) trivial without a JOIN at query time.

This refinement is an **architectural improvement over the original scope** — we're aligning with existing schema conventions rather than introducing a parallel concept.

### 2.2 Exchange + asset_class columns are NEW additions

Both columns do not exist on any table. Must be added via migration. Langston's approved defaults:
- `exchange TEXT NOT NULL DEFAULT 'kraken'`
- `asset_class TEXT NOT NULL DEFAULT 'crypto_spot'`

Backfill: all existing rows get the defaults. Future rows specify at insertion time.

### 2.3 `module_constants` table is NEW

Does not exist. Must be created per Modularization Synthesis §3.2 / §3.5 schema:
```sql
CREATE TABLE module_constants (
  module_name TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT '*',
  asset_class TEXT NOT NULL DEFAULT '*',
  strategy TEXT DEFAULT '*',
  regime TEXT DEFAULT '*',
  constant_name TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  PRIMARY KEY (module_name, exchange, asset_class, strategy, regime, constant_name)
);
```

Empty at migration time. B66 populates with its promoted formula constants.

---

## 3. Components affected + SIM consultation

### 3.1 `server/services/trailing-exit-controller.ts`

Current state: dormant module. Exports exit-decision functions. Not currently invoked by VTS or paper-execution paths.

**Upstream dependencies** (from reading file header + imports):
- `server/utils/analysis-utils.ts` (exit-math utilities: dynamic stop distance, trailing stop price, break-even trigger, target-lock trigger)
- `server/core/math/cost-model.ts` (cost-aware floors: netBreakeven, netTargetFloor)

**Downstream consumers (will be AFTER wiring):**
- `server/services/vts-runner.ts` — exit-check loop currently uses inline logic; will delegate to TEC
- `server/services/paper-execution-engine.ts` — similar refactor

**Blast radius:** MEDIUM. Touches exit decisions on both VTS (learning data) and paper mode (when active). Risk mitigation: TEC receives the same inputs as the current inline logic; behavior should be identical at the exit-decision level. Any divergence between old inline and new TEC-delegated decisions = bug.

### 3.2 `server/services/vts-runner.ts`

Current state: inline exit logic around L1460-1604 (stop/target/timeout check loop).

**Affected code:** the exit-reason determination block. Will be refactored to call TEC instead of inline comparisons.

**Blast radius:** MEDIUM. The `resolveVirtualTrades` function is invoked per 30-second VTS cycle; a subtle bug here could misattribute trade outcomes. Must preserve existing semantics exactly.

### 3.3 `server/services/paper-execution-engine.ts`

Current state: similar inline exit logic (not yet deeply inspected in this pre-audit — Phase 3 will read in full).

**Blast radius:** LOW (paper mode inactive). Any bug here won't affect production today, but will matter for Phase 19 go-live.

### 3.4 `shared/schema.ts` + Drizzle migration

Current state: 5+ tables affected by new columns (`watchlist_pairs`, `trading_signals`, `trades`, `paper_sim_trades`, `module_constants` new).

**Blast radius:** HIGH on migration (schema changes are hard to roll back quickly). LOW on runtime behavior (new columns default to values matching current-state; old queries don't break).

**Risk mitigation:** use Drizzle's migration format per `drizzle/migrations/` convention (date-prefixed SQL files). Test locally with `npm run db:push` or equivalent before pushing.

### 3.5 `server/services/moduleConstantsService.ts` (NEW, to be created)

**Purpose:** wraps DB reads for module_constants table with 60s cache + resolution-hierarchy logic per Modularization Synthesis §3.2.

**Upstream:** `module_constants` DB table.

**Downstream (future):** B66 will be the first consumer when it promotes the 6 P1 formula constants. For B65, service exists but no consumer code uses it yet.

**Blast radius:** LOW (infrastructure-only; no runtime decision consumer until B66).

### 3.6 SIM "If I Change X, Check Y" consultation

- **If you edit TEC** → check VTS + paper engines both delegate correctly. **Applicable — Workstream A.**
- **If you edit pair metadata schema** → check every consumer of the changed columns. **Applicable — Workstream B migration.**
- **If you edit regime string constants** → non-applicable (not changing regimes).
- **If you edit MULTI_FAMILY_ELIGIBILITY** → non-applicable (not touching this).

---

## 4. Migration ordering and rollback plan

### 4.1 Migration files to create

Following `drizzle/migrations/` naming convention (date-prefixed):

1. `2026-04-23-b65-add-exchange-asset-class.sql` — adds `exchange` + `asset_class` columns to watchlist_pairs, trading_signals, trades, paper_sim_trades. Defaults set; NOT NULL post-backfill.
2. `2026-04-23-b65-add-base-currency-to-trades.sql` — adds `baseCurrency` to `trades` and `paper_sim_trades` (the two tables missing it). NOT NULL with migration-time derivation from `symbol`.
3. `2026-04-23-b65-create-module-constants.sql` — creates `module_constants` table.

### 4.2 Rollback procedure

- Migrations are reversible via `DROP COLUMN` / `DROP TABLE` statements.
- Rollback migration files prepared alongside forward migrations.
- If a rollback is needed post-deploy: `npm run db:rollback` on staging, then cherry-pick reverting code commits.

### 4.3 Order of operations at deploy

1. Stop gateway (brief — maybe 30s).
2. Run migrations (atomic; either all apply or none).
3. Start gateway.
4. Verify `SELECT COUNT(*) FROM module_constants` returns 0 (table exists, empty).
5. Verify `SELECT COUNT(*) FROM watchlist_pairs WHERE exchange IS NULL` returns 0 (backfill successful).

If ANY verification fails, immediately rollback before continuing.

---

## 5. TEC wiring detailed plan (Workstream A)

### 5.1 TEC current interface (to be formalized)

Reading the existing `trailing-exit-controller.ts`:

- Core functions exported: stop/target computation, break-even trigger check, target-lock trigger check
- Persistence: debounced (5s) writes for mode state (TARGET vs TRAILING_TAKE)
- Cost-aware: consumes `getCachedCostMetrics`, `computeNetBreakeven`, `computeNetTargetFloor`

### 5.2 Proposed TEC invocation interface

```typescript
export interface TECExitDecision {
  shouldExit: boolean;
  exitReason: 'stop_hit' | 'target_hit' | 'timeout' | null;
  exitPrice: number;
  effectiveStop: number;    // may differ from trade.stopPrice due to trailing
  effectiveTarget: number;  // may differ from trade.targetPrice due to break-even lock
  newMode?: 'TARGET' | 'TRAILING_TAKE';  // if mode should change
}

export function evaluateTECExit(
  trade: OpenVirtualTrade | OpenPaperTrade,
  currentPrice: number,
  atr: number,
  costs: CostMetrics,
  holdDurationMs: number,
  maxHoldMs: number,
  context: { exchange: string; assetClass: string; strategy: string }
): TECExitDecision;
```

VTS and paper-execution both call this. Output determines whether to close the trade.

### 5.3 TEC parameters in `module_constants`

- `module_name='trailing_exit'`, `constant_name='trail_activation_pct'`
- `module_name='trailing_exit'`, `constant_name='break_even_trigger_r'`
- `module_name='trailing_exit'`, `constant_name='target_lock_r'`

Initial values seeded at migration-time to match current inline-logic defaults. B66 can tune without code deploy.

### 5.4 Refactor scope in VTS + paper

**VTS (`vts-runner.ts` ~L1460-1604):**
- Replace inline stop/target comparison with `evaluateTECExit()` call
- Keep the 7-day MAX_HOLD_MS safety valve at L1453 (unchanged from B64b)
- Preserve `setNullReason` / null-return patterns

**Paper execution (`paper-execution-engine.ts`):**
- Similar replacement (file not yet deeply inspected — Phase 3)
- Ensure mode-overlay bypass (B63 Item 14) still applies correctly

---

## 6. Tests affected

| Test | File | Expected impact |
|---|---|---|
| `regime_mapping_integrity.test.ts` | `server/tests/` | No change — not touching canonical map |
| `b63-item12-geometry-override.test.ts` | `server/tests/unit/` | No change — geometry override logic preserved |
| `b63-item16-dbs-store.test.ts` | `server/tests/unit/` | No change |
| NEW: `b65-tec-parity.test.ts` | to be created | Asserts TEC-delegated exit decisions match pre-B65 inline decisions for a set of canonical trade scenarios |
| NEW: `b65-module-constants-resolution.test.ts` | to be created | Asserts most-specific-wins hierarchy returns correct values for representative (exchange, asset_class, strategy, regime) combinations |
| NEW: `b65-migration-validation.test.ts` | to be created | Asserts post-migration: all existing rows have non-null backfilled values; module_constants table created and queryable; underlying derivation rule produces expected values for sample symbols |

---

## 7. Risk summary

| Risk | Likelihood | Mitigation |
|---|---|---|
| TEC refactor introduces subtle exit-decision drift from inline logic | Medium | New `b65-tec-parity.test.ts` asserting identical output for canonical scenarios. Integration test on staging post-deploy comparing last N trades' exit attribution with pre-B65 expected. |
| Migration fails or partial-applies, leaving DB in inconsistent state | Low | Migrations run atomically via Drizzle transactions. Rollback SQL prepared. Pre-flight verification queries before commit. |
| Missing `baseCurrency` on `trades` table breaks existing queries that `JOIN` on the assumed schema | Low | Grep all query sites referencing `trades.baseCurrency` (should be zero pre-B65); adding the column is additive. |
| `module_constants` resolution hierarchy has a corner case (e.g. conflicting most-specific rows) | Low | Unit tests cover wildcard fallback, most-specific-wins, missing-key paths. |
| TEC activation increases exit-decision latency (TEC does more work than inline) | Low | TEC functions are pure math; no DB reads per invocation. Cache TEC parameters per 60s (same pattern as MCE). |
| Gateway restart during deploy drops active positions' in-memory state | Low | Same risk as any staging restart; VTS state is already in-file (JSON log), not in-memory-only; paper positions are DB-backed. |

**Overall batch risk: MEDIUM.** DB migrations + exit-logic refactor are inherently higher risk than pure documentation (B64b). Mitigations above make it manageable. 

---

## 8. Phase 3 implementation task list

1. Read `paper-execution-engine.ts` in full to inventory exit-decision sites
2. Write migration 1 (exchange + asset_class on 4 tables)
3. Write migration 2 (baseCurrency on trades + paper_sim_trades with derivation)
4. Write migration 3 (create module_constants table)
5. Write rollback migrations for all 3
6. Test migrations locally (`npm run db:push` on local dev DB if available, or dry-run)
7. Update `shared/schema.ts` with new column definitions
8. Build `moduleConstantsService.ts` (read API + cache + resolution hierarchy)
9. Write `b65-module-constants-resolution.test.ts`
10. Refactor VTS exit logic to delegate to TEC
11. Refactor paper-execution exit logic to delegate to TEC
12. Write `b65-tec-parity.test.ts`
13. Write `b65-migration-validation.test.ts`
14. Thread `exchange` + `assetClass` parameters through pair-reading code paths (no behavior change; just pass-through for future use)
15. TypeScript check + full local test suite
16. Post Phase 4 code review to Langston
17. Push → CI → deploy → verify → governance → completion report

## 9. Estimated effort

~13 engineer-days per original scope. Pre-audit doesn't materially change the estimate — the `baseCurrency` reuse simplifies Workstream B but not enough to reduce total effort meaningfully.

## 10. Open questions for Langston Phase 2 review

1. **`baseCurrency` as underlying-equivalent** — does this approach satisfy your original NOT-NULL-with-derivation concern? The existing column already is NOT NULL on `watchlist_pairs` and `trading_signals`. New migration adds it to `trades` and `paper_sim_trades` with derivation + NOT NULL.
2. **`module_constants` initial contents** — empty at B65 completion, or should B65 seed it with the current hardcoded defaults so B66's first action is just "tune the values" rather than "insert the baseline rows"?
3. **TEC parity test coverage** — what canonical scenarios should the test assert? Proposal: 6 scenarios covering (a) simple stop hit, (b) simple target hit, (c) break-even lock, (d) target-lock trailing, (e) timeout via MAX_HOLD_MS, (f) cost-aware breakeven floor. Sufficient?

---

*End of B65 Pre-Audit. Phase 3 (Implementation) begins after Langston Phase 2 review.*
