# BATCH_82 — Pre-audit

**Status:** rev 2 — addresses Langston rev-1-review (Q3 → explicit prop + concerns 1-4 closed in §9.a / §9.b / §6 / §7)
**Date:** 2026-05-14
**Predecessor:** `BATCH_82_SCOPE.md` rev 2 (Langston APPROVED 2026-05-14)
**Workflow step:** §2 of 11
**Rev history:**
- rev 1 (2026-05-14 11:08 UTC): initial pre-audit draft. Langston returned REVISE.
- rev 2 (2026-05-14 11:25 UTC): Q3 changed to explicit `assetClass` prop (URL-parse rejected). §6.4b regime_factor_alternates partial-index EXPLAIN added. §9.a deferred field-availability checks closed (verified all 3 caller sites). §9.b DBURL extraction mechanism concretized + staging-reachability verified. §6 deploy_timestamp capture protocol added. §7 SIM update paths + section names cited explicitly.

This pre-audit consumes the obligations from `BATCH_82_SCOPE.md` rev 2 §5 row "Step 2", plus Langston's two non-blocking notes from his rev-2 APPROVE message:
- Note 1: verify line numbers cited (`:236`, `:264`, `:294`, `:959`, `:1794`) against current `HEAD`.
- Note 2: downstream-consumer audit could surface scope expansion — flag before Step 3.a.

---

## §1. Line-number verification (Langston Note 1)

All scope-cited anchors verified against `HEAD` 2026-05-14:

| Scope cite | Current source line | Content at that line | Match |
|---|---|---|---|
| `factor-ablation-emitter.ts:236` | `assetClass: 'crypto_spot',` | hardcoded literal in row builder | ✓ |
| `exit-strategy-replay-service.ts:264` | `'kraken', 'crypto_spot')` | SQL VALUES literal for `(exchange, asset_class)` | ✓ |
| `exit-strategy-replay-service.ts:294` | `ctx.assetClass ?? 'crypto_spot',` | OHLC-fetch fallback (B79.0m.b2 anti-pattern) | ✓ |
| `signal-orchestrator.ts:959` | `emitAblationRecord(` | caller #1 | ✓ |
| `vts-runner.ts:1794` | `emitAblationRecord(` | caller #2 | ✓ |
| `vts-service.ts:967` | `replayAndPersist({` | sole replayAndPersist caller | ✓ |

No drift. Implementation hunks land on these lines as-cited.

---

## §2. Caller enumeration (Obligation a — exhaustive grep)

### `emitAblationRecord` callers (production code)

```
$ grep -rn 'emitAblationRecord\s*(' server/ scripts/ shared/
server/services/signal-orchestrator.ts:959:    emitAblationRecord(
server/services/vts-runner.ts:1794:  emitAblationRecord(
server/services/factor-ablation-emitter.ts:151:export function emitAblationRecord(    [definition]
server/services/factor-ablation-emitter.ts:268: *   emitAblationRecord(signalId, pair, realDecision, alternates);    [JSDoc]
```

**Production callers: 2.** No test callers (`server/tests/` clean). No script callers. The JSDoc example at `factor-ablation-emitter.ts:268` is a doc string, not a call. Both production callers must be updated in the same commit as the signature change.

### `replayAndPersist` callers (production code)

```
$ grep -rn 'replayAndPersist\s*(' server/ scripts/ shared/
server/services/vts-service.ts:967:        replayAndPersist({
server/services/exit-strategy-replay-service.ts:274:export async function replayAndPersist(ctx: ReplayContext): Promise<void> {    [definition]
```

**Production callers: 1.** No test callers. `vts-service.ts:967` is the only consumer. The single-caller surface dramatically reduces the blast radius of the `ReplayContext.assetClass` non-nullable change.

### Test-coverage note

`server/tests/unit/b73-exit-strategy-replay.test.ts` imports from `'../../services/exit-strategy-replay'` (no `-service` suffix). That file (`server/services/exit-strategy-replay.ts`) exists separately and contains the PURE REPLAY LOGIC (variant simulation, OHLC-bar math). The DB-writer + `replayAndPersist` lives in `exit-strategy-replay-service.ts` and is untested. **This coverage gap is pre-existing — not introduced or worsened by B82.** Documented for future test-recovery work; not blocking.

---

## §3. Table partition enumeration (Obligation b)

Queried staging Supabase (`db.vqqyisaudwenrdhnmjwt.supabase.co`) via `pg_inherits` + `pg_partitioned_table`:

```
=== Partitions of exit_strategy_alternates ===
 (0 rows)
=== Partitions of regime_factor_alternates ===
 (0 rows)
=== Partitioning method for both tables ===
 (0 rows)
=== Row counts ===
 regime_factor_alternates  | 39368  | 41 MB
 exit_strategy_alternates  | 24142  | 8912 kB
```

**Neither table is partitioned.** Both are plain tables. **This invalidates Langston's Q3 partition gotcha** (which assumed partitioning matching the `xstock_spot_ticker_snap` / `crypto_spot_ticker_snap` / `signal_eval_archive` family). The per-partition `CREATE INDEX CONCURRENTLY` dance is NOT required. Straight `CREATE INDEX CONCURRENTLY ON <table>` works.

**Provenance check:** Neither table was created as `PARTITION BY` in the original DDL (`shared/schema.ts:543` uses `pgTable` without partitioning markers; the DDL migration originated in B67.0 + B73 — both pre-date the partitioning patterns adopted in B74). Tables are small enough that partitioning was not warranted.

**Scope impact:** Obj 3 simplifies. Index DDL becomes a single statement per table.

---

## §4. Drizzle migration txn-mode (Obligation c)

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block per PostgreSQL spec. Drizzle's default migration runner wraps each migration file in BEGIN/COMMIT.

**Resolution:** Drizzle Kit supports a `--breakpoint` directive in migration SQL files via the `-- statement-breakpoint` comment marker, but txn-disable is handled differently. Two paths:

1. **In a `.sql` migration file:** prepend `-- breakpoint` marker between statements (Drizzle Kit splits at this marker). Each statement runs in its own implicit txn. For `CONCURRENTLY` to truly run outside txn, the migration file must contain ONLY the `CREATE INDEX CONCURRENTLY` statement (no other DDL) AND Drizzle Kit must be configured to skip the auto-txn wrap. Drizzle Kit v0.20+ honors a `-- @drizzle disable-transaction` directive at the top of the file.

2. **Outside Drizzle:** ship the DDL as a one-time `migrations/0NN_b82_asset_class_indexes.sql` script that's run manually via `psql` on staging (and later on production). The script is committed to the repo for paper-trail. This bypasses Drizzle's runner entirely.

**Recommended path: option 2** (raw SQL script outside Drizzle runner). Reasons:
- Most explicit; no ambiguity about txn-mode
- Smaller surface for Drizzle-version drift
- One-time index creation doesn't need to be in the migration history (it's idempotent — `CREATE INDEX IF NOT EXISTS`)
- Rollback is trivial (`DROP INDEX CONCURRENTLY IF EXISTS ...`)

**Implementation file plan:**
- `server/migrations/manual/B82_asset_class_indexes.sql` (forward DDL)
- `server/migrations/manual/B82_asset_class_indexes_rollback.sql` (rollback DDL)
- Both committed in Step 3.b. Applied manually to staging via `psql` after Step 5 (CI green) + before Step 7 (verification).

---

## §5. Downstream-consumer audit (Obligation f + Langston Note 2)

Goal: enumerate every reader of `regime_factor_alternates` and `exit_strategy_alternates`. For each, determine whether it has an implicit `WHERE asset_class='crypto_spot'` filter that would silently exclude or break on new xstock_spot rows.

### Consumers of `regime_factor_alternates`

| File | Operation | Asset-class handling | Risk |
|---|---|---|---|
| `server/services/factor-ablation-emitter.ts` | INSERT (writer) | Hardcoded `'crypto_spot'` — the bug we're fixing | **Subject of B82 Obj 1** |
| `server/services/drift-dashboard-aggregator.ts:501` (B67.1 lift computation) | SELECT | Accepts optional `assetClass` parameter, defaults to legacy crypto-spot path. **VERIFIED line 1056:** `AND asset_class = ${assetClass}` filter applied when assetClass passed. | ✓ Already asset-class-aware (B79.0i.b) |
| `server/services/drift-dashboard-aggregator.ts:1053` (B67.0 factor calibration) | SELECT | Same parameterization as above (line 1056). | ✓ Already asset-class-aware |
| `server/scripts/replay-ablation.ts:200-371` (B67.0 replay job) | SELECT (pending rows) + UPDATE (set replayOutcome + replayCompletedAt) | **No asset_class filter.** Processes ALL pending rows regardless of class. Looks up outcomes via signalId (active path) or JSON-file-by-date index (VTS path). VTS JSON files now include xstock trades per B-NEW-26/27. | ✓ Asset-class-agnostic; picks up xstock rows automatically |

**Conclusion:** No consumer of `regime_factor_alternates` has an implicit crypto-only filter that would break. drift-dashboard-aggregator accepts asset_class explicitly. replay-ablation.ts is agnostic.

### Consumers of `exit_strategy_alternates`

| File | Operation | Asset-class handling | Risk |
|---|---|---|---|
| `server/services/exit-strategy-replay-service.ts:253` | INSERT (writer) | Hardcoded `'crypto_spot'` SQL literal — the bug we're fixing | **Subject of B82 Obj 2** |
| `server/services/exit-strategy-ablation-aggregator.ts:88, 100, 117` (computeExitStrategyAblation) | SELECT (3 sub-queries) | Accepts optional `assetClass` parameter (added B79.0i.b). When non-null, adds `AND asset_class = ${assetClass}` clause. When null, no filter — preserves legacy crypto-default behavior. | ✓ Already asset-class-aware |

**Conclusion:** Single reader of `exit_strategy_alternates`. Already parameterized. No risk.

### Search for indirect consumers (ML training pipeline, weekly digest, training-data export)

Grepped for any module that:
- Imports `regimeFactorAlternates` or `exitStrategyAlternates` from `shared/schema.ts`
- References either table name in raw SQL
- Reads files like `ml_pipeline_*.ts`, `weekly_digest*.ts`, `training_export*.ts`, `*_export*.ts`

```
$ grep -rn 'regimeFactorAlternates\|exitStrategyAlternates\|FROM regime_factor_alternates\|FROM exit_strategy_alternates' server/ scripts/ shared/
```

Results: only the 5 files already enumerated above (writer × 2 + reader × 2 + replay-job × 1). **No ML pipeline, no weekly digest, no training-data export consumes these tables.** Langston's concern 4 closes clean — **no scope expansion required.**

---

## §6. Verification gates (Obligation d + e)

### Step 7 first-pass verification queries (CC owns)

Run all queries against staging Supabase at T+15min post-deploy:

```sql
-- 6.1 NEGATIVE CASE: no new crypto_spot rows for xstock pairs since deploy
SELECT asset_class, COUNT(*)
FROM regime_factor_alternates
WHERE pair_symbol IN (SELECT pair FROM vts_open_trades WHERE asset_class='xstock_spot')
  AND evaluated_at > '<deploy_timestamp>'
GROUP BY asset_class;
-- EXPECTED: xstock_spot rows only. Zero crypto_spot rows for xstock pairs.
-- FAIL CRITERIA: any crypto_spot row tagged for an xstock pair_symbol post-deploy.

-- 6.2 NEGATIVE CASE for exit_strategy_alternates
SELECT a.asset_class, COUNT(*)
FROM exit_strategy_alternates a
JOIN vts_open_trades t ON t.id = a.trade_id::text
WHERE t.asset_class = 'xstock_spot'
  AND a.created_at > '<deploy_timestamp>'
GROUP BY a.asset_class;
-- EXPECTED: xstock_spot rows only.

-- 6.3 REGRESSION CASE: crypto_spot rows still tag correctly
SELECT asset_class, COUNT(*)
FROM regime_factor_alternates
WHERE evaluated_at > '<deploy_timestamp>' - INTERVAL '15 minutes'
  AND evaluated_at > '<deploy_timestamp>'
  AND pair_symbol IN (SELECT pair FROM vts_open_trades WHERE asset_class='crypto_spot')
GROUP BY asset_class;
-- EXPECTED: crypto_spot rows only. Zero xstock_spot mis-tags.

-- 6.4 INDEX VERIFICATION (exit_strategy_alternates): EXPLAIN should now use the new index
EXPLAIN (ANALYZE, BUFFERS)
SELECT variant_id, COUNT(*)
FROM exit_strategy_alternates
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND virtual_pnl_pct IS NOT NULL
  AND asset_class = 'xstock_spot'
GROUP BY variant_id;
-- EXPECTED: Index Scan or Bitmap Heap Scan with Index Cond on (asset_class, created_at).
--           NOT a Filter post-scan.

-- 6.4b INDEX VERIFICATION (regime_factor_alternates) — partial-index predicate validation
-- (per Langston rev-1-review Q2 — partial index `WHERE replay_completed_at IS NOT NULL`
-- must intersect with actual query WHERE; otherwise the partial index silently no-ops)
EXPLAIN (ANALYZE, BUFFERS)
SELECT factor_name, COUNT(*)
FROM regime_factor_alternates
WHERE evaluated_at >= NOW() - INTERVAL '7 days'
  AND replay_completed_at IS NOT NULL
  AND asset_class = 'xstock_spot'
  AND real_decision->>'confidence' IS NOT NULL
  AND alternate_decision->>'confidence' IS NOT NULL
GROUP BY factor_name;
-- EXPECTED: Index Scan on idx_regime_factor_alternates_asset_evaluated
--           with Index Cond: (asset_class = 'xstock_spot' AND evaluated_at >= ...)
--           NOT a Filter post-scan.
-- FAIL CRITERIA: if EXPLAIN shows a sequential scan or filter without using the new
--           index, the partial-index predicate (`WHERE replay_completed_at IS NOT NULL`)
--           is mismatched with the query — must rebuild index without the partial
--           predicate OR rewrite the query to surface the predicate first.

-- 6.5 ENDPOINT TIMING: re-run the two endpoints
-- /api/xstocks/exit-strategy-ablation?window=rolling_7d → expect < 5s
-- /api/xstocks/factor-calibration?window=rolling_7d → expect < 5s
-- /api/analytics/exit-strategy-ablation?window=rolling_7d (crypto baseline) → expect no regression
-- /api/analytics/factor-calibration?window=rolling_7d (crypto baseline) → expect no regression
```

### deploy_timestamp capture protocol (per Langston rev-1-review concern 3)

At Step 6 (staging deploy), immediately AFTER `pm2 restart dawntrader` succeeds, capture the exact UTC timestamp via:
```bash
ssh root@188.245.193.8 'date -u +"%Y-%m-%dT%H:%M:%SZ"'
```
Record this as `<deploy_timestamp>` in the completion-report appendix table. All verification queries (§6.1-6.5) substitute this exact value. This gives reproducible post-hoc replay across the T+1h / T+6h / T+24h forward-watch and makes the verification SQL deterministic for any future audit.

### T+1h / T+6h / T+24h forward-watch schedule

After Step 11 closure, schedule re-runs of queries 6.1-6.5 at these intervals:

| Time | Owner | Action | Recorded in |
|---|---|---|---|
| T+1h post-deploy | CC | Re-run 6.1-6.5; record results in completion report appendix. | `BATCH_82_COMPLETION_REPORT.md` §X-Verification |
| T+6h post-deploy | CC | Re-run 6.1-6.3 (row tag verification). | Same appendix |
| T+24h post-deploy | CC | Re-run all queries. Confirm endpoint timings holding < 5s p99. | Same appendix |

Any failure at any checkpoint triggers immediate rollback (revert commit + redeploy + drop indexes).

### Step 8 second-pass verification (Langston owns)

Independent verification per CLAUDE.md §2 Step 8. Langston re-runs queries 6.1-6.5 from his own SSH path and confirms findings. Independent eye on the DB state and EXPLAIN plans.

---

## §7. SIM consultation (per CLAUDE.md §9 mandatory)

### Components touched by BATCH_82

| Component | Type | Upstream | Downstream | Shared state | Blast radius |
|---|---|---|---|---|---|
| `factor-ablation-emitter.ts` | Service (writer) | `signal-orchestrator.ts`, `vts-runner.ts` (the 2 callers) | `regime_factor_alternates` table | None (stateless) | **Medium** — signature change forces caller-update in same commit |
| `exit-strategy-replay-service.ts` | Service (writer + replay logic) | `vts-service.ts:967` (sole caller) | `exit_strategy_alternates` table; reads `xstock_spot_ohlc_1m` / `crypto_spot_ohlc_1m` | Module-level cached config | **Low** — single caller; ReplayContext non-nullable change is type-system enforced |
| `regime_factor_alternates` | DB table | Writer: factor-ablation-emitter | Readers: drift-dashboard-aggregator (2 sites), replay-ablation.ts | DB | **Low** — schema unchanged; only new asset_class values + 1 new index |
| `exit_strategy_alternates` | DB table | Writer: exit-strategy-replay-service | Readers: exit-strategy-ablation-aggregator (3 sites) | DB | **Low** — schema unchanged; only new asset_class values + 1 new index |
| `analytics.tsx` (UI) | React component | Backend endpoints `/api/xstocks/exit-strategy-ablation` + `/api/xstocks/factor-calibration` + crypto counterparts | User | None | **Low** — pure render-path empty-state branch |
| `signal-orchestrator.ts` | Service (caller) | upstream MCE, RTB queue | factor-ablation-emitter | OpenVirtualTrade state | **Low** — single line at `:959` adds `assetClass` argument |
| `vts-runner.ts` | Service (caller) | scanner, eval-cycle | factor-ablation-emitter, replayAndPersist (via vts-service) | openVirtualTrades Map | **Low** — single line at `:1794` adds `assetClass` argument |
| `vts-service.ts` | Service | vts-runner | exit-strategy-replay-service | None | **Low** — single line at `:967` adds `assetClass` to ReplayContext |

### SIM entry updates required (Step 10) — concrete paths + section names (per Langston rev-1-review concern 4)

All three entries land in `1-system-manual/SYSTEM_IMPACT_MAP.md` in the existing **"Rename invariants"** section (added 2026-05-14 in commit `32ed09cd9` for B83 governance) — specifically in the **"If I Change X, Check Y — rename-inventory additions"** sub-section near the end of that section. Adding the three new entries inline preserves the section's role as the canonical cross-module-identifier-change checklist.

Entries to add (verbatim wording for Step 10 commit):

1. **"Modify `emitAblationRecord` signature"** → 2 production callers (signal-orchestrator.ts:959, vts-runner.ts:1794). Zero test/script callers verified via `grep -rn 'emitAblationRecord\s*(' server/ scripts/ shared/ tests/`. Pre-rename inventory documents the closed-set caller list.

2. **"Modify `ReplayContext` type or `replayAndPersist` signature"** → 1 production caller (vts-service.ts:967). Zero test callers. Cross-reference `exit-strategy-replay-service.ts:264` (SQL VALUES bind) + `:294` (OHLC fetch arg) — both inside the same module are consumers of the same `ctx.assetClass` field.

3. **"Add asset_class index to a per-asset-class ablation/calibration table"** → naming convention: `idx_<table>_asset_<timecolumn>` (e.g., `idx_exit_strategy_alternates_asset_created`, `idx_regime_factor_alternates_asset_evaluated`). Index DDL via raw SQL script at `server/migrations/manual/B<NN>_*.sql` (NOT Drizzle migration runner) — CONCURRENTLY cannot run inside Drizzle's BEGIN/COMMIT wrapper. Partial-index predicate must intersect with actual query WHERE (verified via EXPLAIN ANALYZE at deploy time).

These entries are added in the SAME Step-10 commit that updates BATCH_CATALOG / PHASE_HISTORY / RUNNING_ISSUES / CHANGES_AND_FIXES / MEMORY.

---

## §8. Risk update from rev 2 scope

Two scope-rev-2 risk items update from pre-audit findings:

1. **Obj 3 risk DOWNGRADED to Low.** Partition concern doesn't apply (both tables plain). Straight `CREATE INDEX CONCURRENTLY` works. Drizzle txn-disable handled by option-2 raw-SQL-script path. No per-partition coordination.
2. **"Downstream-consumer risk" risk: CLOSED.** Audit shows no implicit-crypto-only filters anywhere. Scope expansion not required.

Both Obj 1 + Obj 2 risk levels (Medium) unchanged from rev 2 — type-system enforcement is the gate.

---

## §9. Implementation plan (Step 3 — sub-phase breakdown)

### §9.a — Writer-side asset_class threading (Obj 1 + 2)

**Caller-site field-availability verification (closes Langston rev-1-review concern 1, no deferred trust):**

| Call site | Variable holding asset class | Derivation method | Verified at line |
|---|---|---|---|
| `signal-orchestrator.ts:959` | `rawSignal: StrategySignal` (function param at line 384) | `resolveAssetClass(rawSignal.symbol, 'kraken')` — same pattern already used at line 990 (a few lines below the emit). Import already present. | Verified via `grep -n "resolveAssetClass" server/services/signal-orchestrator.ts` |
| `vts-runner.ts:1794` | `symbol: string` (function param, already in scope at line 1796) | `resolveAssetClass(symbol, 'kraken')` — same pattern already used at line 1828 (the open-trade INSERT a few lines below). Import already present. | Verified via `grep -n "resolveAssetClass" server/services/vts-runner.ts` |
| `vts-service.ts:967` | `tradeData.assetClass` (parameter on `persistRealPriceTrade`, ALREADY THREADED via B79.0m.b2 at line 973) | **No change needed — already passes** `assetClass: tradeData.assetClass`. | Read at lines 967-984. |

The pattern `resolveAssetClass(symbol, 'kraken')` is the canonical exchange-context derivation. It throws on unknown symbol patterns (no silent fallback). Both signal-orchestrator and vts-runner are committed to `kraken` exchange (spot-only) in current scope; xstock-spot uses `kraken-equities` only at the archiver layer, never at the VTS/signal-orchestrator layer. When perp wiring lands (B80), the exchange parameter becomes context-dependent — out of B82 scope.

**Files modified:**
1. `server/services/factor-ablation-emitter.ts`
   - Confirm `import { AssetClass } from '../../shared/asset-classes.js'` (already present in current source via `type AssetClass` export)
   - Change `emitAblationRecord(source, pairSymbol, realDecision, alternates, strategy?)` → add `assetClass: AssetClass` as REQUIRED parameter (per Langston Q1 — NO default)
   - Remove hardcoded `'crypto_spot'` at line 236; replace with `assetClass`
   - Update JSDoc example at line 268 to show the new signature
2. `server/services/signal-orchestrator.ts:959`
   - Pre-compute `const assetClass = resolveAssetClass(rawSignal.symbol, 'kraken');` at top of the emit block (before line 959)
   - Pass `assetClass` as the new emitAblationRecord parameter
3. `server/services/vts-runner.ts:1794`
   - Pre-compute `const assetClass = resolveAssetClass(symbol, 'kraken');` at top of the emit block (before line 1794) — OR hoist the existing line-1828 expression up
   - Pass `assetClass` as the new emitAblationRecord parameter
4. `server/services/exit-strategy-replay-service.ts`
   - Change `ReplayContext.assetClass?: AssetClass` → `assetClass: AssetClass` (drop `?`)
   - Drop `?? 'crypto_spot'` at line 264 SQL literal: bind `${ctx.assetClass}` directly
   - Drop `?? 'crypto_spot'` at line 294 OHLC fetch fallback: pass `ctx.assetClass` directly
5. `server/services/vts-service.ts:967`
   - **No code change — already passes `assetClass: tradeData.assetClass` per B79.0m.b2.** Confirm `persistRealPriceTrade.tradeData.assetClass` is non-null at call site (it is — populated at trade-open via resolveAssetClass per vts-runner:1828).

**Verification at end of §9.a:**
1. `npx tsc --noEmit` passes clean.
2. `grep -rn "?? 'crypto_spot'" server/services/` returns zero matches.
3. `grep -rn "assetClass: 'crypto_spot'" server/services/factor-ablation-emitter.ts` returns zero matches.

### §9.b — DB index migration (Obj 3)

**Files added:**
1. `server/migrations/manual/B82_asset_class_indexes.sql`
   ```sql
   -- BATCH_82 forward DDL: composite asset_class indexes
   -- Run manually via psql; CANNOT run inside transaction (CONCURRENTLY).
   -- Idempotent: IF NOT EXISTS guards.

   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exit_strategy_alternates_asset_created
   ON public.exit_strategy_alternates (asset_class, created_at DESC);

   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regime_factor_alternates_asset_evaluated
   ON public.regime_factor_alternates (asset_class, evaluated_at DESC)
   WHERE replay_completed_at IS NOT NULL;
   ```
2. `server/migrations/manual/B82_asset_class_indexes_rollback.sql`
   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS public.idx_exit_strategy_alternates_asset_created;
   DROP INDEX CONCURRENTLY IF EXISTS public.idx_regime_factor_alternates_asset_evaluated;
   ```

**Deployment sequence:**
- Commit both SQL files in Step 3.
- After Step 5 (CI green) + Step 6 (npm build + pm2 restart), run forward DDL via:
  ```bash
  scp server/migrations/manual/B82_asset_class_indexes.sql root@188.245.193.8:/tmp/
  ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && DBURL=\$(grep -E ^DATABASE_URL= .env | head -1 | cut -d= -f2-) && psql \"\$DBURL\" -f /tmp/B82_asset_class_indexes.sql'"
  ```
- **DBURL extraction mechanism (concretized per Langston rev-1-review concern 2):** the staging-app `.env` file at `/home/deploy/dawntrader/.env` contains `DATABASE_URL=postgresql://...`. The grep+cut command above extracts it. **Connection reachability verified:** this exact extraction pattern was used multiple times in B83 diagnostic queries (e.g., `_b82_partition.sql` partition enumeration) — all queries returned successfully. No DNS/firewall/connection issues from the Hetzner deploy box to Supabase.
- If rollback needed: equivalent psql call against the rollback file.

### §9.c — UI empty-state (Obj 4)

**Files modified:**
1. `client/src/pages/analytics.tsx` — add explicit `assetClass: AssetClass` prop to both `ExitStrategyAblationSection` + `FactorCalibrationSection` component signatures. Render empty-state branch using the prop.
2. `client/src/pages/analytics.tsx` (crypto callers) — parent component passes `assetClass="crypto_spot"` explicitly (these sections were already rendering crypto-by-default; now type-safe).
3. `client/src/components/machine-learning/xstocks-tab.tsx` — parent passes `assetClass="xstock_spot"` explicitly alongside the existing `endpointBase` prop.

**Implementation pattern (per Langston rev-1-review Q3 — explicit prop, NOT URL-string parsing):**
```tsx
// In analytics.tsx — section component signatures
export function ExitStrategyAblationSection({
  endpointBase,
  assetClass,  // NEW — explicit prop, type-safe
}: {
  endpointBase?: string;
  assetClass: AssetClass;  // REQUIRED
}) {
  // ... existing data-fetch logic ...
  const displayName = ASSET_CLASS_REGISTRY[assetClass].displayName;

  if (data.totalTrades === 0 && (!data.variants || data.variants.length === 0)) {
    return <EmptyState>
      No {displayName} data yet — accumulating. Panel populates as closed trades complete the ablation replay window.
    </EmptyState>;
  }
  // ... existing rendering ...
}

// Same pattern for FactorCalibrationSection with empty-copy:
// "No {displayName} data yet — accumulating. Panel populates as the factor replay pipeline evaluates new signals."
```

**Rationale for explicit prop over URL parsing (Langston rev-1-review Q3):** parent components ALREADY know which asset class they're rendering — that's the basis on which they chose the `endpointBase`. Encoding that knowledge twice (once in the URL, once derived back from the URL) is brittle. When B80 / B81 / future asset classes wire their own UI tabs, the explicit prop scales linearly; URL parsing requires touching the section component's URL-detection logic each time. Per CLAUDE.md §11 "per-asset-class configuration is the default" — explicit type-safe parameterization.

**Render-condition predicates:**
- Ablation: `data.totalTrades === 0 && (!data.variants || data.variants.length === 0)` (handles both null/empty array cases)
- Calibration: `(!data.factors || data.factors.length === 0) && data.totalReplayed === 0`

---

## §10. Step 4 code review packet

When implementation completes, the Langston code-review packet will contain:
- Full `git diff` between rev 2 scope baseline + Step 3 commits
- Line-by-line annotation of all 5 modified files + 2 new SQL files
- Pre-audit cross-reference (this doc) showing the implementation matches the agreed plan
- Verification queries (§6) ready to run post-deploy

---

## §11. Open questions — RESOLVED in rev 2

All three rev-1 open questions plus four rev-1-review concerns resolved:

| # | Topic | Rev-1 position | Langston call | Rev-2 resolution |
|---|---|---|---|---|
| Q1 | Partition finding invalidates Q3 gotcha #2 | APPROVE (CC) | APPROVE | §3 partition table updated to show 0 partitions; §6 risk simplified |
| Q2 | Manual SQL script path for index DDL | APPROVE (CC) | APPROVE + ask | §9.b psql command concretized with DBURL extraction + connection verification; §6.4b regime_factor_alternates partial-index EXPLAIN added |
| Q3 | Empty-state asset-class derivation | URL parse (CC) | REVISE → explicit prop | §9.c rewritten with `assetClass: AssetClass` prop pattern + parent passes explicit |
| C1 | §9.a deferred field-availability checks | "confirm in pre-implementation read" | Verify NOW | §9.a Caller-site verification table added — all 3 sites resolved (resolveAssetClass at 2 sites + already-threaded at 1) |
| C2 | DBURL concrete mechanism | placeholder | Concretize + verify reachability | §9.b explicit grep+cut command + Hetzner→Supabase reachability confirmed via prior B83 diagnostic usage |
| C3 | deploy_timestamp capture | implicit | Make explicit | §6 deploy_timestamp capture protocol added; ssh+date command specified |
| C4 | SIM update paths + section names | "SIM update entries" | Cite explicitly | §7 SIM updates section now specifies exact file (`SYSTEM_IMPACT_MAP.md`), exact section ("Rename invariants" / "If I Change X, Check Y — rename-inventory additions"), and verbatim wording for the 3 entries |

**Ready for Langston rev-2 APPROVE.** If approved, I proceed to Step 3 (implementation). If further revs needed, rev 3.

— CC
