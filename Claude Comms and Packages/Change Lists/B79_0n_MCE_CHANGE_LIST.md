# B79.0n.MCE — Change List (Step 4 code review)

> **Sub-batch:** 4 of 18 in the B79.0n umbrella v4 arc.
> **For:** Langston Step 4 code-level review.
> **Predecessors closed:** scope rev5 + pre-audit v2 FINAL ACK (Q-VI option (a)).
> **Diff scope:** 26 files changed in `server/`, +328 / −158, plus 2 NEW migration files.

---

## ⚠ INFRASTRUCTURE NOTE — READ FIRST (CLAUDE.md §6.5.0.a + §6.5.0.b)

**DO NOT `cd /mnt/gdrive` or run `git -C "/mnt/gdrive/..."` / `git status` / `git log` against the GDrive-mounted repo.** It hangs on FUSE I/O — D-state stuck processes that can't be killed (this is the exact STORAGE Step 4 RE-ACK failure mode). Every load-bearing diff snippet is embedded INLINE below — you do not need to fetch repo content to review.

If you must inspect the repo beyond these snippets, use the staging server which has the same code: `ssh deploy@188.245.193.8 'cd /home/deploy/dawntrader && git ...'` — BUT note staging is at the PRIOR commit (this batch is not pushed yet). The authoritative source for THIS review is the embedded snippets + the inbox files below.

**Inbox files you can Read directly (local FS, fast):**
- `/home/langston/inbox/b79-0n/B79_0n_MCE_SCOPE.md` (rev5)
- `/home/langston/inbox/b79-0n/B79_0n_MCE_PRE_AUDIT.md` (v2)
- `/home/langston/inbox/b79-0n/B79_0n_MCE_CHANGE_LIST.md` (this file)

**A note on local typecheck:** the GDrive-mounted clone cannot complete `npm install` (FUSE EBADF on npm's many-small-files write pattern). A local `tsc` produces ~18k cascade errors from the incomplete `node_modules` — unusable. The ONLY reliable local signal was syntactic (TS1xxx); one such error surfaced (TS1016 parameter-ordering) and is FIXED (see §M3 below). The authoritative typecheck is GitHub CI's TypeScript Check at Step 5. Please review code-level correctness; the compile gate is CI.

---

## §1 — What this batch does (one paragraph)

Removes the silent `assetClass = 'crypto_spot'` default from three MCE surface APIs (`calculatePairRegime`, `MarketContextEngine.computeContext`, the three `cost-model.ts` functions), making the asset class a REQUIRED type-checked parameter everywhere. Adds a fail-hard exhaustive switch in `getFrictionForAssetClass`. Extends the MCE per-symbol context cache key to `(symbol, assetClass)`. Threads asset class through two ablation paths that previously inherited crypto's `DEFAULT_REGIME_CONFIG` silently. Ships a `module_constants` seed migration (per-class `dbs_calculation.min_sample_count` rows + wildcard retirement). Deletes a dead-code chain in `cost-metrics.ts` (Q-VI option a). Adds 6 unit tests.

---

## §2 — NEW files (2 migration + 6 tests)

### §2.1 — `drizzle/migrations/2026-05-22-b79-0n-mce-dbs-per-class.sql` (NEW)

Atomic `BEGIN/COMMIT` migration. 3 steps: (1) add explicit `crypto_spot` row cloning the wildcard value `20`; (2) add explicit `xstock_spot` row (placeholder-clone of `20`); (3) `EXISTS`-gated `DELETE` of the wildcard — fires only after both class-scoped rows confirmed present (no orphan window). Idempotent (`ON CONFLICT DO NOTHING` + EXISTS-gated DELETE).

**Langston C1 verification — confirmed:** every WHERE clause filters `constant_name = 'min_sample_count'` exactly. B-PHASE-A2's `dbs_calculation.sector_coverage_floor` xstock_spot row is NOT matched by any clause — protected. Schema columns verified against `shared/schema.ts:501-524`: `updated_by` (NOT `set_by` — scope rev5 SQL template had said `set_by`; corrected in the actual migration). ON CONFLICT targets the 6-tuple unique index `(module_name, exchange, asset_class, strategy, regime, constant_name)`.

Key DELETE step (embedded):
```sql
DELETE FROM module_constants w
WHERE w.module_name = 'dbs_calculation'
  AND w.asset_class = '*'
  AND w.constant_name = 'min_sample_count'
  AND EXISTS (SELECT 1 FROM module_constants r WHERE r.module_name = w.module_name
    AND r.asset_class = 'crypto_spot' AND r.constant_name = w.constant_name
    AND r.exchange = w.exchange AND r.strategy = w.strategy AND r.regime = w.regime)
  AND EXISTS (SELECT 1 FROM module_constants r WHERE r.module_name = w.module_name
    AND r.asset_class = 'xstock_spot' AND r.constant_name = w.constant_name
    AND r.exchange = w.exchange AND r.strategy = w.strategy AND r.regime = w.regime);
```

### §2.2 — `drizzle/migrations/2026-05-22-b79-0n-mce-dbs-per-class-rollback.sql` (NEW)

Manual-only rollback. Re-inserts the 1 wildcard row (value `20`) + deletes the 2 class-scoped rows. Not auto-run by deploy.

### §2.3 — 6 NEW unit tests in `server/tests/unit/`

| File | Asserts |
|---|---|
| `b79-0n-mce-required-assetclass.test.ts` | `@ts-expect-error` locks: `calculatePairRegime` / `computeContext` / `getFrictionForAssetClass` without assetClass are compile errors |
| `b79-0n-mce-costmodel-perp-failhard.test.ts` | `getFrictionForAssetClass('crypto_perp'|'xstock_perp')` throws with `B79.0n.MCE` + `RUNNING_ISSUES` in message; spot classes don't throw |
| `b79-0n-mce-cache-isolation.test.ts` | MCE cache-key shape `${symbol}:${assetClass}` contract (honest-minimal — no exported key helper exists; see §5 note) |
| `b79-0n-mce-xstock-regime-routing.test.ts` | `calculatePairRegime` runs for both `xstock_spot` + `crypto_spot`; raw metrics identical, only threshold comparisons differ |
| `b79-0n-mce-required-assetclass-getcachedcostmetrics.test.ts` | `@ts-expect-error` lock: `getCachedCostMetrics(symbol)` without assetClass is a compile error |
| `b79-0n-mce-ablation-path-assetclass.test.ts` | `@ts-expect-error` locks: `buildB68_5Alternate` + `computeMultiTfAgreement` require assetClass |

---

## §3 — MODIFIED: core surface APIs

### §M1 — `server/core/math/cost-model.ts` (3 functions REQUIRED-AssetClass + perp fail-hard)

`_unknownAssetClassWarned` flag + warn-once fallback DELETED. `getFrictionForAssetClass` now exhaustive:

```ts
export function getFrictionForAssetClass(assetClass: AssetClass): AssetClassFrictionModel {
  switch (assetClass) {
    case 'crypto_spot':  return CRYPTO_SPOT_FRICTION;
    case 'xstock_spot':  return XSTOCK_SPOT_FRICTION;
    case 'crypto_perp':
    case 'xstock_perp':
    case 'equity_spot':
    case 'equity_futures':
    case 'commodity_futures':
    case 'fx_spot':
      throw new Error(`[B79.0n.MCE][cost-model] assetClass='${assetClass}' has no friction model wired. ...`);
    default: {
      const _exhaustive: never = assetClass;  // compile-fails if AssetClass gains a value
      throw new Error(`[B79.0n.MCE][cost-model] unreachable assetClass=${String(_exhaustive)}`);
    }
  }
}
```

`getDefaultCostComponentsForAssetClass(assetClass: AssetClass, symbol?)` + `getCachedCostMetrics(symbol: string, assetClass: AssetClass)` — both `assetClass: string = 'crypto_spot'` → `assetClass: AssetClass` REQUIRED. Internal dispatch logic unchanged.

### §M2 — `server/core/metrics/market-regime.ts` (`calculatePairRegime` REQUIRED-AssetClass + bar-interval comments)

`assetClass: string = 'crypto_spot'` → `assetClass: AssetClass` (REQUIRED). xstock branch (B79.0m.b, line ~227) UNCHANGED — this batch removes the silent default, not the branch. Bar-interval invariant comment added at `computeMomentum` + `computeADX`; stale "15-min" → "60-min" comment fixed (Q-I — both crypto + xStock MCE consume 60-min bars).

### §M3 — `server/services/market-context-engine.ts` (computeContext REQUIRED + cache-key + CACHE_REFRESH probe)

- `computeContext` 7th param `assetClass: string = 'crypto_spot'` → `assetClass: AssetClass`.
- **TS1016 fix:** `assetClass` REQUIRED cannot follow optional `smaPeriod?`/`propagatedDbs?`. Both changed to `: T | undefined` (required-but-nullable). All callers already pass these positions (6-7 args), so signature-shape-only — no caller change. **This was the one real error the local syntactic check caught; fixed.**
- Per-symbol cache key `${symbol}` → `${symbol}:${assetClass}` at cache read + write + `getCachedContext(symbol, assetClass)`.
- `calculatePairRegime` call inside `computeContext` now passes `assetClass`.
- `regimePhaseStore.tick(...)` object literal gains `assetClass` (threaded into the backfill walk).
- NEW `logDbsCalculationRowCoverage()` probe (Langston C5) — emits `[B79.0n.MCE][CACHE_REFRESH] picked up N module_constants rows ...` after first config refresh. Best-effort (probe failure logs, doesn't disrupt startup).

### §M4 — `server/services/module-constants-service.ts` (NEW helper)

NEW `countModuleRowsByAssetClass(moduleName)` — counts raw rows grouped by EXACT `asset_class` (no resolver hierarchy). Verification helper for the CACHE_REFRESH probe. Reuses the 60s-TTL `loadModule` cache.

---

## §4 — MODIFIED: ablation paths (Q-II — in-batch fix)

`buildB68_5Alternate` (`regime-age-factor.ts`) + `computeMultiTfAgreement` (`multi-tf-agreement.ts`) each gain a REQUIRED `assetClass: AssetClass` param (added at END of signature), threaded to their internal `calculatePairRegime` call. `BackfillContext` type (`regime-phase.ts`) gains a REQUIRED `assetClass` field. Callers updated:
- `factor-ablation-builders.ts` — `FactorAlternateInput` `b68_5` variant gains `assetClass`; passed to `buildB68_5Alternate`.
- `signal-orchestrator.ts` + `vts-runner.ts` — the `b68_5` input construction + the `computeMultiTfAgreement` call each get `resolveAssetClass(<symbol>, 'kraken')`.
- `market-context-engine.ts` — `regimePhaseStore.tick` object literal gets `assetClass` (in-scope from computeContext).

---

## §5 — MODIFIED: caller updates (~22 production sites)

`getCachedCostMetrics` — 10 production callers. Disposition:
- `xstock_spot/eval-cycle.ts:585` → file constant `ASSET_CLASS` (xStock-intentional, clean cycle context).
- `trailing-exit-controller.ts:972` → in-scope `assetClass` variable (TEC already resolves it for `resolveTECConfig`).
- **8 other sites** (`expectancy.ts`, `ready_to_buy_service.ts`, `signal-orchestrator.ts` ×2, `vts-runner.ts` ×3, `vts-service.ts`) → **`resolveAssetClass(<symbol>, 'kraken')`** — symbol-derived resolution.

**Langston C2 — flagged interim:** the 8 `resolveAssetClass(symbol, 'kraken')` sites are the STORAGE-established interim pattern. `resolveAssetClass` is symbol-derived truth (xStock allow-list checked before crypto regex per SIM line 1868) — it routes correctly per the actual symbol, NOT a silent crypto default. `ready_to_buy_service.ts` specifically: RtbSignal DB rows lack an `asset_class` column (schema gap tracked for RTB batch #11), so symbol-resolution is the only available source — same interim STORAGE used for the RTB SQEInput sites. `expectancy.ts` `evaluateTradeExpectancy(symbol, tradeMeta)` has no asset-class param; resolution from symbol is interim until a future batch threads assetClass through the expectancy kernel. These are VISIBLE (commented `// B79.0n.MCE:` at every site), not silent.

`computeContext` callers — `signal-orchestrator.ts` ×2 + `vts-runner.ts` ×2 → `resolveAssetClass(<symbol>, 'kraken')`. `eval-cycle.ts:338` already passed `ASSET_CLASS` — unchanged.

`getCachedContext` callers — `signal-orchestrator.ts:727`, `vts-runner.ts:1584`, `paper-execution-engine.ts:2022` → `resolveAssetClass(<symbol>, 'kraken')`.

**`calculatePairRegime` non-MCE callers:**
- `market-regime.ts:~420` (`getDynamicRegimeScore`, advisory per SIM §5.4) → `'crypto_spot' as const` (advisory, no routing).
- `regime-phase.ts:~273` backfill → `ctx.assetClass` (threaded via BackfillContext).
- `diagnostic-11.4G.ts` + `b70-b62-relabel-runner.ts` (scripts) → `'crypto_spot' as const`.

**`signal-orchestrator.ts:~500` — semantic bug fix (umbrella §2.5 green-light).** The Phase-15b telemetry block called `mce.computeContext(rawSignal.symbol)` with ONLY a symbol — `computeContext` needs OHLC + price + volume, so this could never produce a real context; the `try/catch` silently swallowed the failure and the telemetry always emitted `'UNKNOWN'`. Fixed to the correct read-only API: `mce.getCachedContext(rawSignal.symbol, resolveAssetClass(rawSignal.symbol, 'kraken'))` + null-safe `mceCtx?.directionalBias`.

---

## §6 — DELETED: dead-code cleanup (Q-VI option a)

**`server/core/metrics/cost-metrics.ts` — 3-function dead chain deleted** (NOT the whole file — Step 3 grep found the file has LIVE consumers: `computeMarketFriction`/`describeFriction`/`mapFrictionVisual`/`getCachedSpread`/`getCostCache`/`clearCostCache` are used by trade-model, routes.ts, RTB service, dse.ts, market-indicators, telemetry-aggregator).

**Deleted:** `getDefaultAvgReturn` + `updateCostData` + `getTransactionCostFactor` (all zero production callers — test-only) + `updateSpreadCache` (zero consumers anywhere — its compile broke when `getCachedCostMetrics` became REQUIRED-assetClass; deleting it was forced + correct). Plus the now-unused `getCachedNumberRequired` + cost-model import aliases + `CACHE_TTL_MS` + `DEFAULT_SLIPPAGE`/`DEFAULT_FEE` consts.

**Test disposition (Q-VI gate):** `dynamic_sizing.test.ts` — the `it('should update and retrieve transaction cost factor')` block exclusively exercised the dead chain → deleted (the sibling `getCostClassification` test kept). Not a >50-line refactor — well within the "small contained absorb" justification.

**Δ vs scope rev5 §3.4.1 — flag for your review:** scope rev5 said "File to delete: `cost-metrics.ts` (entire file)." Step 3 grep proved that wrong — the file has 6+ live consumers. Q-VI(a)'s INTENT (delete the dead chain) is fully honored; only the "whole file" assumption was incorrect. Langston Q-VI(a) explicitly built the Step 3 gate "report the disposition in your Step 3 implementation diff" for exactly this — here it is.

**`cost_model.default_avg_return` row — NOT touched.** Its only consumer (`getDefaultAvgReturn`) is now deleted, so the row + the `b72-warmup.ts:43` `cost_model` prefetch are now orphan data. I did NOT add a `cost_model` DELETE to the migration — that would violate your C1 gate (migration scoped to `dbs_calculation.min_sample_count` only). Filing the orphan `cost_model` row as a RUNNING_ISSUES Tier-3 cleanup entry at Step 10 instead. **Concur, or do you want the migration expanded?**

---

## §7 — Collateral (forced, outside the named file list)

`server/tests/unit/b67-2-phase-dimension.test.ts` — adding the REQUIRED `assetClass` field to `BackfillContext` broke 4 `ctx` object literals in this test (~lines 139/155/167/183). Each got `assetClass: 'crypto_spot' as const`. This wasn't in the planned file list but the A2 type change directly forces it — leaving it broken would red CI.

---

## §8 — Mechanical test-fixture updates

`calculatePairRegime` test calls got `'crypto_spot' as const` appended in: `b67-3-5-tfs-desat.test.ts` (7), `vts-modernization.test.ts` (2), `b67-5-prep-floor.test.ts` (3), `b68-5-path-b-sustainability.test.ts` (6), `b68-1-multi-tf-agreement.test.ts` (15 `computeMultiTfAgreement` sites + a `DEFAULT_REGIME_CONFIG` import). Pure mechanical — no logic change.

---

## §9 — Crypto-by-construction-NONE invariant

Crypto path is byte-identical at runtime: every removed silent `'crypto_spot'` default became an explicit `'crypto_spot'` (or `resolveAssetClass(symbol)` which returns `'crypto_spot'` for crypto symbols). The migration's crypto_spot row holds the identical value (`20`) the wildcard held. The cache-key extension changes the key string but not cache content. The perp fail-hard branches are unreachable today (no perp consumer). Empirical confirmation at the 24h soak (alert created at Step 5 deploy).

---

## §10 — Review asks

1. **§6 Δ** — concur the dead-chain deletion (not whole-file) correctly honors Q-VI(a)? Concur the orphan `cost_model.default_avg_return` row → RUNNING_ISSUES (not migration expansion)?
2. **§5 C2** — concur the 8 `resolveAssetClass(symbol, 'kraken')` interim sites are acceptable + visible?
3. **§M3 TS1016 fix** — concur `smaPeriod`/`propagatedDbs` → required-but-nullable is the right resolution (vs. reordering params)?
4. **§5 signal-orchestrator:500** — concur the `computeContext`→`getCachedContext` semantic fix is correct + in-scope under §2.5 green-light?
5. Any code-level concerns on the surface APIs / migration / ablation threading.

Reply: **Step 4 ACK — clear to push** / **BLOCKER(s)** / **non-blocking nits**.

— Claude Code, 2026-05-21 PM (B79.0n.MCE Step 4 change list)
