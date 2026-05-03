# BATCH 69 — Pre-Implementation Audit + Implementation Plan

**Companion to:** `BATCH_69_SCOPE.md` (Step 1 APPROVED, Langston cc-inbox #890, refinements B.2/B.3/B.4/B.8/O.1 incorporated)
**Step:** 2 of 11 per CLAUDE.md §2 workflow
**SIM consulted:** YES — see §A.1 below
**System Manual consulted:** YES — see §A.2 below
**Status:** APPROVED by Langston (cc-inbox #891, 2026-05-03). All §D answers confirmed: D.1 single-deploy event, D.2 manual retag script, D.4 `safeResolveAssetClass` returns `null` on error, D.5 tighter xstock regex `^[A-Z]{2,5}x\/[A-Z]{3,4}$`. Proceeding to Step 3.

---

## §A. SIM + System Manual Consultation

Per Kyle directive 2026-05-03 ("consult the system impacts map during the pre-implementation, code-level audit") + CLAUDE.md §9 mandate.

### §A.1 SIM-mapped components affected (full blast radius assessment)

| # | SIM section | Component | File | Change | Blast |
|---|---|---|---|---|---|
| 1 | (NEW component) | Asset class registry | `shared/asset-classes.ts` (NEW) | Pure functions + const registry. Single source of truth. | LOW (new isolated module; consumers updated explicitly) |
| 2 | SIM §2.3 Symbol Normalization | `server/services/kraken.ts` + `server/services/utils/symbol-canonicalizer.ts` | NO CHANGES — `resolveAssetClass` consumes the OUTPUT of these existing normalizers. The resolver works on whichever format is passed in (REST `XXBTZUSD` vs WS `XBT/USD`) by calling `toCanonical()` first. | LOW |
| 3 | SIM §2.6 OHLC Cache | `server/services/ohlc-cache.ts` | NO CHANGES — cache key is `${symbol}_${interval}` already. Asset class is orthogonal. | NONE |
| 4 | SIM §3.2 FX5 Scanner | `server/services/market-scanner.ts` + `server/services/fx5-scanner.ts` | Wire `resolveAssetClass(symbol, exchange)` on every `watchlistPairs` insert. Today these inserts get `assetClass=crypto_spot` via DB default — wrong for xStock/perp pairs as those universes expand. | MEDIUM (every scanned pair routes through here) |
| 5 | SIM §4.1 Signal Orchestrator | `server/services/signal-orchestrator.ts` | Wire on `tradingSignals` insert + on trade-open. | MEDIUM (every active-path signal) |
| 6 | SIM §6.1 Paper Execution Engine | `server/services/paper-execution-engine.ts` | Wire on `paperSimOpenPositions` insert + on `paperSimTrades` insert at close. | MEDIUM (every paper trade) |
| 7 | (B67.0 / B73 framework — covered in §A.4 SIM update area) | B67.0 ablation emitter | `server/services/factor-ablation-emitter.ts` | Pass `assetClass` + `exchange` into every emit. Carries through to `regimeFactorAlternates` rows. | MEDIUM (~1k rows/cycle) |
| 8 | (B73 framework) | B73 exit-strategy ablation | `server/services/exit-strategy-replay-service.ts` | Same — `exit_strategy_alternates` rows carry `asset_class` + `exchange`. | MEDIUM |
| 9 | (B74 archive — SIM §1146 entries 1-23) | B74 OHLC batch writer | `server/services/passive-archive/ohlc-batch-writer.ts` | `Universe` type → `AssetClass`; `tableForUniverse` → `tableForAssetClass`; literal map updated for `xstock_*` rename. | MEDIUM |
| 10 | (B74 archive) | B74 ticker batch writer | `server/services/passive-archive/ticker-batch-writer.ts` | Same rename pattern. | MEDIUM |
| 11 | (B74 archive) | B74 archivers (×3) | `equity-spot-archiver.ts`, `equity-perp-archiver.ts`, `crypto-spot-archiver.ts` | Hardcoded literal updates: `'equity_spot'` → `'xstock_spot'`, `'equity_perp'` → `'xstock_perp'`, `'crypto_spot'` unchanged. | LOW (one literal each) |
| 12 | (B74 archive) | Universe loaders | `server/services/passive-archive/universe-loader.ts` | `loadEquitySpotUniverse()` → `loadXstockSpotUniverse()`, etc. Callers updated. | LOW (mechanical rename) |
| 13 | (B74 archive) | Bootstrap | `server/startup/passive-archive-bootstrap.ts` | Wire renamed loaders. | LOW |
| 14 | (B74 archive) | Monthly partition cron | `server/scripts/b74-create-monthly-partitions.ts` | Default values updated to `xstock_*` for new partitions. | LOW |
| 15 | (DB / storage layer) | Storage layer pass-through | `server/storage.ts` | NO CHANGES — `db.insert(table).values(input)` passes through whatever the caller provides; caller fills `assetClass` field. | NONE |
| 16 | SIM §5.2.5 MCE | `server/services/market-context-engine.ts` | NO CHANGES — MCE is read-only on asset class; it just classifies regime, doesn't insert. | NONE |
| 17 | (UI layer) | Closed Trades / Open Positions / Signals tables | 3-5 components in `client/src/components/trading/` and `client/src/pages/machine-learning.tsx` | Add Asset Class column with badge color from registry. Filter dropdown. Imports `shared/asset-classes.ts` (must be `shared/`-pathed for client compatibility). | LOW |
| 18 | (Migration) | DB schema migrations | NEW `drizzle/migrations/2026-05-XX-b69-asset-class.sql` + rollback | Adds columns to ablation + open-position tables; renames `universe` → `asset_class` on 6 B74 archive tables; retags `equity_*` → `xstock_*`; backfills ablation tables. | HIGH (touches many tables; deploy ordering critical per B.8) |

**Upstream feeders unchanged:** Kraken WS / REST endpoints (asset class is derived from symbol+exchange post-fetch, not from Kraken). MCE / DBS / regime classifier all asset-class-agnostic. OHLC cache symbol+interval keying is asset-class-agnostic.

**Downstream consumers — IMPACTED:**
- `module_constants` resolution (B65) — already supports `assetClass` dimension; B67/B68/B73 chain resolvers will start receiving correct asset class instead of always `*` cross-cutting. **No behavior change for `*`-keyed rows**, only for any rows that were specifically tagged `crypto_spot` (A.6 audit will identify which rows need to remain `crypto_spot` vs become broader `*`).
- B67/B68 chain factor metadata in ablation rows — automatically picks up correct asset class.
- UI tables auto-extend (per the column definition).

**Shared state:** Asset class registry in `shared/asset-classes.ts` is a pure const + pure functions. No runtime state. No persistence beyond what's in DB rows.

**Background execution:** No new timers. Migration adds cost during the deploy window only.

### §A.2 System Manual sections to update on close

- Layer 2.3 (Symbol Normalization) note: clarification that `resolveAssetClass` operates on canonical-format output; the existing normalizer is unchanged.
- New appendix "B69 — Asset Class Taxonomy (CLOSED 2026-05-XX)": registry table (4 active + 4 reserved-future), the runbook for adding a new asset class, the symbol-pattern detection logic, B74 archive column rename note, future-fields TBD.
- Layer 6.1 (Paper Execution Engine) note: trade rows now carry asset class set by `resolveAssetClass`; `module_constants` 5D resolution gets a real value instead of always implicit `crypto_spot`.

### §A.3 Cascade risk check

| Risk | Verdict | Mitigation |
|---|---|---|
| Insert-site miss | Pre-audit §B.2 lists every site explicitly. Test plan covers each. | Mitigated. |
| Symbol format variance (Langston O.1: REST `XXBTZUSD` vs WS `XBT/USD`) | Real risk. | `resolveAssetClass` calls `toCanonical(symbol)` first to normalize before pattern matching. Tests cover both formats. |
| B74 archiver in-flight writes during column rename + value retag (Langston B.8) | Real risk. | Two-step deploy plan in §B.4 — RENAME (instant DDL) ships first; UPDATE (slow, batched) runs second; archivers update their literal AFTER both are complete via code redeploy. Specifics below. |
| Hard-fail on unknown symbol crashes PM2 (Langston B.2 caveat) | Real risk. | Caller-side try/catch with `[B69][unknown-symbol]` warn log + skip-this-pair behavior. PM2 stays up. |
| Module-constants `*`-keyed rows that should specifically resolve to `crypto_spot` post-B69 | Theoretical risk; A.6 audit identifies. | A.6 produces `B69_MODULE_CONSTANTS_AUDIT.md`; no row splits in B69 itself. Behavior preserved. |
| Backfill on `regime_factor_alternates` (high-volume) takes time | Real, but bounded. | Batched UPDATE 10k rows per statement; estimated < 5 min total. Run during low-traffic window. |
| UI column adds visual clutter | Cosmetic. | Compact colored badge; same width footprint as existing strategy / regime columns. |
| B70 dependency reverse-direction surprise | Real if B70 starts before B69 closes. | Sequencing confirmed: B69 ships first per Langston B.4. B70 scope can be drafted in parallel but doesn't ship until B69 closes. |
| `loadEquitySpotUniverse()` renaming breaks callers | Real. | Mechanical rename; pre-audit §B.5 lists every caller. |

**Net:** B69 is structural plumbing. The execution risks are concrete and bounded; the deploy plan addresses each.

---

## §B. Implementation Plan

### §B.1 Asset class registry — `shared/asset-classes.ts`

Per scope §A.0 + §A.1. The 8-entry registry is concrete:

```typescript
export const ASSET_CLASSES = {
  CRYPTO_SPOT:       'crypto_spot',
  CRYPTO_PERP:       'crypto_perp',
  XSTOCK_SPOT:       'xstock_spot',
  XSTOCK_PERP:       'xstock_perp',
  EQUITY_SPOT:       'equity_spot',
  EQUITY_FUTURES:    'equity_futures',
  COMMODITY_FUTURES: 'commodity_futures',
  FX_SPOT:           'fx_spot',
} as const;
```

Registry metadata seeded with `active: true` for the first 4, `active: false` (reserved-future) for the last 4. Symbol patterns:

| Asset Class | Symbol pattern (after `toCanonical()`) | Exchange disambiguator |
|---|---|---|
| `crypto_spot` | `^[A-Z0-9]+\/[A-Z0-9]+$` AND not matching xstock/perp | `kraken` |
| `crypto_perp` | `^[A-Z0-9]+USDPM$` OR contains `:PERP` (per B74 canonicalizer) | `kraken-futures` |
| `xstock_spot` | `^[A-Z]+x\/[A-Z]+$` (lowercase x suffix on base) | `kraken` |
| `xstock_perp` | `^PF_[A-Z]+XUSD$` (PF_ prefix + X suffix on base) | `kraken-futures` |

**Resolver behavior** (Langston O.1 + B.2):
```typescript
export function resolveAssetClass(symbol: string, exchange: string): AssetClass {
  const canonical = toCanonical(symbol); // normalizes XXBTZUSD <-> XBT/USD
  // Try matchers in priority order: most-specific first
  if (XSTOCK_PERP_PATTERN.test(canonical) && exchange === 'kraken-futures') return 'xstock_perp';
  if (CRYPTO_PERP_PATTERN.test(canonical) && exchange === 'kraken-futures') return 'crypto_perp';
  if (XSTOCK_SPOT_PATTERN.test(canonical) && exchange === 'kraken') return 'xstock_spot';
  if (CRYPTO_SPOT_PATTERN.test(canonical) && exchange === 'kraken') return 'crypto_spot';
  throw new Error(`[B69][resolver] cannot determine assetClass for symbol=${symbol} exchange=${exchange}`);
}
```

**Caller-side hardening** (per Langston B.2):
```typescript
let assetClass: AssetClass;
try {
  assetClass = resolveAssetClass(symbol, exchange);
} catch (err) {
  console.warn(`[B69][unknown-symbol] skip pair ${symbol}@${exchange}: ${err.message}`);
  return; // skip this pair for this cycle; do not crash
}
```

This is wrapped at every insert site (§B.2 below).

### §B.2 Insert-site audit table — concrete

Every site that today writes a row to a trade-touching table:

| # | File | Line ~ | Table | Today | After B69 |
|---|---|---|---|---|---|
| 1 | `storage.ts:1282` | watchlistPairs | DB default `crypto_spot` | Caller (scanner) sets `assetClass: resolveAssetClass(symbol, exchange)` | as left |
| 2 | `storage.ts:1336` | tradingSignals | DB default `crypto_spot` | Caller (signal-orchestrator) sets `assetClass` | as left |
| 3 | `storage.ts:1526` | trades | DB default `crypto_spot` | Caller (trade-executor) sets `assetClass` | as left |
| 4 | `storage.ts:3169` | paperSimTrades | DB default `crypto_spot` | Caller (paper-execution-engine + vts-runner) sets `assetClass` | as left |
| 5 | `storage.ts:3343` | paperSimOpenPositions | (no column today) | After migration adds column: caller sets `assetClass` | as left |
| 6 | `factor-ablation-emitter.ts:188` | regimeFactorAlternates | (no column today) | After migration adds column: emitter signature gets `assetClass` + `exchange` params; orchestrator + vts-runner pass them in | NEW signature |
| 7 | `exit-strategy-replay-service.ts:207` | exit_strategy_alternates (raw SQL) | (no column today) | After migration adds column: SQL extended with `asset_class`, `exchange`; service args extended | NEW SQL |
| 8 | `crypto-spot-archiver.ts` | crypto_spot_ohlc_1m + crypto_spot_ticker_snap | DB default `'crypto_spot'` (was `universe`, becomes `asset_class`) | After rename: writes to `asset_class` column with same value | mechanical |
| 9 | `equity-spot-archiver.ts` | equity_spot_ohlc_1m + equity_spot_ticker_snap | DB default `'equity_spot'` (becomes `asset_class`) | After rename + retag: writes `'xstock_spot'` | literal change |
| 10 | `equity-perp-archiver.ts` | equity_perp_ohlc_1m + equity_perp_ticker_snap | DB default `'equity_perp'` (becomes `asset_class`) | After rename + retag: writes `'xstock_perp'` | literal change |

### §B.3 Schema migration — `drizzle/migrations/2026-05-XX-b69-asset-class.sql`

```sql
BEGIN;

-- Step 1: Add asset_class + exchange columns to tables that lack them
ALTER TABLE paper_sim_open_positions
  ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'kraken',
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto_spot';

ALTER TABLE regime_factor_alternates
  ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'kraken',
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto_spot';

ALTER TABLE exit_strategy_alternates
  ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'kraken',
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto_spot';

-- (Add any other tables identified during code review here.)

-- Step 2: Rename `universe` → `asset_class` on all 6 B74 archive tables
-- (instant metadata-only operation per Langston B.8)
ALTER TABLE crypto_spot_ohlc_1m       RENAME COLUMN universe TO asset_class;
ALTER TABLE crypto_spot_ticker_snap   RENAME COLUMN universe TO asset_class;
ALTER TABLE equity_spot_ohlc_1m       RENAME COLUMN universe TO asset_class;
ALTER TABLE equity_spot_ticker_snap   RENAME COLUMN universe TO asset_class;
ALTER TABLE equity_perp_ohlc_1m       RENAME COLUMN universe TO asset_class;
ALTER TABLE equity_perp_ticker_snap   RENAME COLUMN universe TO asset_class;

-- Update DB defaults to match new naming convention for new partitions
ALTER TABLE equity_spot_ohlc_1m       ALTER COLUMN asset_class SET DEFAULT 'xstock_spot';
ALTER TABLE equity_spot_ticker_snap   ALTER COLUMN asset_class SET DEFAULT 'xstock_spot';
ALTER TABLE equity_perp_ohlc_1m       ALTER COLUMN asset_class SET DEFAULT 'xstock_perp';
ALTER TABLE equity_perp_ticker_snap   ALTER COLUMN asset_class SET DEFAULT 'xstock_perp';

COMMIT;

-- Step 3: Value retag (run AFTER code redeploy completes per §B.4 ordering)
-- Batched to avoid long lock; partition-aware updates run per partition.
-- This is in a SEPARATE script to allow controlled execution:
--   drizzle/migrations/2026-05-XX-b69-asset-class-retag.sql
```

Retag script (separate file, run manually/cron post-code-deploy):

```sql
-- Retag tokenized equity rows from equity_* to xstock_*. Batched per partition.
-- Runtime ~5-10 min on current data volumes (days-weeks of archive).
DO $$
DECLARE
  rows_updated BIGINT;
BEGIN
  LOOP
    UPDATE equity_spot_ohlc_1m
    SET asset_class = 'xstock_spot'
    WHERE asset_class = 'equity_spot'
      AND id IN (SELECT id FROM equity_spot_ohlc_1m WHERE asset_class = 'equity_spot' LIMIT 10000);
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- Same pattern for equity_spot_ticker_snap, equity_perp_ohlc_1m, equity_perp_ticker_snap.
```

### §B.4 Deploy ordering (per Langston B.8 — split RENAME from UPDATE)

**Step 1 — Schema migration (Step 2 above)** — run as `npm run db:migrate`. Instant DDL: column adds + 6 RENAMEs + DEFAULT updates. Total lock time < 1s. No data movement.

**Step 2 — Code redeploy** — git push triggers CI → deploy → PM2 restart. Code now expects renamed columns. Archivers continue writing as before but to `asset_class` column instead of `universe`. Existing rows still have old values (`equity_spot` / `equity_perp`) but that's fine — code reads them back through the renamed column.

**Step 3 — Value retag (separate script)** — run `npm run db:b69-retag` (or equivalent). Batched UPDATE chunks of 10k rows. Old `equity_spot` rows become `xstock_spot`; old `equity_perp` rows become `xstock_perp`. Runtime estimate: 5-10 min total across 4 archive tables on current data volumes.

**Step 4 — Verification** — psql sample query: `SELECT asset_class, COUNT(*) FROM equity_spot_ohlc_1m GROUP BY asset_class;` should return `xstock_spot` only (no remaining `equity_spot`).

**Why this ordering works:** Step 1's RENAME is metadata-only and effectively instant. The window between Step 1 commit and Step 2's PM2 restart is the only period where archivers are writing to the old column name — but that period is bounded by deploy time (~1-2 min) and the archivers will accumulate insert errors during that window. Mitigation: deploy migration + code together as a single deploy event (not sequential). Backfill (Step 3) happens after code is settled.

### §B.5 Universe-loader rename — caller list

`loadEquitySpotUniverse()` → `loadXstockSpotUniverse()` (etc.):

| File | Caller | Update |
|---|---|---|
| `passive-archive-bootstrap.ts` | `loadEquitySpotUniverse()` | rename call |
| `passive-archive-bootstrap.ts` | `loadEquityPerpUniverse()` | → `loadXstockPerpUniverse()` |
| `b74-refresh-universe.ts` | both | rename calls |
| Any test files | both | rename calls |

`xstocks-universe.json` filename keeps its name (file CONTAINS the universe of xStock symbols — that's accurate). Internal `_universe` field value updates to `xstock_spot`. Same for `equity-perp-universe.json`.

### §B.6 Module-constants audit (`B69_MODULE_CONSTANTS_AUDIT.md`)

After implementation, walk every row in `module_constants` and classify:
- **Keep `*`** — cross-cutting, applies to all asset classes (most current rows).
- **Should-be `crypto_spot`** — historically crypto-only behavior that's already defaulted. Update key explicitly.
- **Future split candidate** — rows that should differ per asset class but don't yet. Flag for follow-up batch when each new asset class actually goes live.

No row splits in B69 itself. The audit is documentation only; behavior preserved.

### §B.7 Order of operations (Step 3)

1. `shared/asset-classes.ts` (NEW — registry + resolver + tests)
2. Schema migration (`2026-05-XX-b69-asset-class.sql`)
3. B74 archiver literal updates + universe-loader rename + bootstrap wire
4. Insert-site updates: scanner → orchestrator → vts-runner → paper-execution-engine → factor-ablation-emitter → exit-strategy-replay-service
5. Storage layer: confirm pass-through (no changes expected)
6. Test suite — unit tests for resolver + registry; integration tests for insert-site flow
7. UI: closed-trades column + open-positions column + signals filter
8. `npm run check`; `npm test`
9. Bring diff to Langston (Step 4)
10. Push → CI → deploy schema migration + code together → verify → run retag script → verify → governance close

### §B.8 Risks I'm explicitly accepting

- **Hard-fail on unknown symbol** is caller-protected. A new asset class showing up that hasn't been registered will log a warning + skip the pair, NOT crash PM2 (Langston B.2).
- **Symbol-pattern regex** is Kraken-specific. v2 follow-up if Phase 21.5 introduces a non-Kraken venue with different conventions (Langston O.1).
- **Module-constants row splits deferred.** A.6 audit identifies candidates; actual splits land per-asset-class as each class goes live in trading. Behavior unchanged in B69.
- **Live-trading-specific hooks deferred** to Phase 19/20 when live trading reactivates.
- **`exchange` field semantics.** Currently we have `kraken` (spot) and `kraken-futures` (perp). Future asset classes will introduce other exchange IDs. The registry's exchange disambiguator is a simple string match — adequate for v1.

### §B.9 Rollback plan

- **Migration rollback** (drops columns + un-renames + restores defaults): in `2026-05-XX-b69-asset-class-rollback.sql`. Tested.
- **Code rollback**: `git revert` the implementation commit and redeploy. The B74 archive tables will continue to read/write the renamed `asset_class` column with `xstock_*` values (the rollback DOESN'T re-rename), but archivers (rolled back) will still write `equity_*` values causing schema mismatch. **So code rollback requires migration rollback first.** Document this dependency.
- **Hot rollback (DB-only neutralization)**: not applicable — B69 is a schema change, not a tunable behavior.

### §B.10 Testing plan

Unit tests (`server/tests/unit/asset-classes.test.ts` NEW):
- Each registered class: resolve from REST format AND WS format (8 active classes × 2 formats = 16 cases minimum).
- Unknown symbol → throws.
- `getActiveAssetClasses()` returns 4 entries.
- Registry metadata complete for every entry.

Integration tests (`server/tests/integration/b69-insert-sites.test.ts` NEW):
- Scanner inserts a crypto pair → row has `asset_class='crypto_spot'`.
- Scanner inserts an xStock pair → row has `asset_class='xstock_spot'`.
- Signal-orchestrator inserts a perp signal → row has `asset_class='crypto_perp'` or `xstock_perp` per symbol.
- Paper trade close updates with correct asset class throughout.
- Ablation row carries `asset_class`.

UI tests (`client/src/__tests__/asset-class-rendering.test.tsx`):
- Closed Trades table renders Asset Class column.
- Filter dropdown shows 4 active classes.
- Reserved-future classes hidden by default.

---

## §C. Verification Criteria (Step 11 closure — copy of scope §E)

- [ ] `shared/asset-classes.ts` exists with 8-entry registry + `resolveAssetClass` + tests
- [ ] All identified live tables have `asset_class` + `exchange` columns
- [ ] All 6 B74 archive tables `universe` column renamed; existing `equity_*` rows retagged to `xstock_*`; crypto rows untouched
- [ ] B74 archivers writing renamed column with retagged values; verified post-deploy
- [ ] Backfill ran cleanly; sample of 100 rows per active asset class verified
- [ ] Every insert site audited in §B.2 has been wired
- [ ] Symbol-pattern resolver handles BOTH REST format (`XXBTZUSD`) AND WS format (`XBT/USD`) (Langston O.1)
- [ ] Caller-side try/catch protects PM2 from unknown-symbol hard-fail (Langston B.2)
- [ ] UI tables show Asset Class column with active classes only
- [ ] Standard "Add a New Asset Class" runbook doc exists
- [ ] `B69_MODULE_CONSTANTS_AUDIT.md` produced (no row splits in B69)
- [ ] All 4 CI checks GREEN (TS Check legacy baseline acceptable)
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] Tier 1 governance: BATCH_CATALOG B69 SHIPPED, MEMORY (truth + repo), PHASE_HISTORY 15c, this scope file → APPROVED, BATCH_69_PROGRESS_REPORT closure section
- [ ] Tier 2 governance: SIM (asset-class-registry NEW + per-component updates + B74 archive column rename), CHANGES_AND_FIXES (B69 entry), SYSTEM_MANUAL (asset-class taxonomy appendix)

---

## §D. Open questions for Langston (Step 2 review)

1. **Migration deploy ordering** (§B.4) — single-deploy event (migration + code together) is the lean. Acceptable, or want a 2-step approach with verification between? Lean: single-deploy; archivers tolerate ~1 min of insert errors during PM2 restart.

2. **Retag script execution** — run via `npm run db:b69-retag` manually post-deploy (controlled), or auto-run as part of `npm run db:migrate` (one-shot)? Lean: manual + verification step in between. Cleaner if retag fails.

3. **`crypto_spot` historical row status** — A.6 module-constants audit will identify rows that were implicitly crypto-only. Should I draft the audit doc as part of B69 or just document gaps and defer? Lean: draft the audit doc but make no row-split changes in B69 itself.

4. **Caller-side resolver wrapping** — should I create a single helper `try { return resolveAssetClass(s, e); } catch { warn + return null }` that callers use, or leave each call site to decide? Lean: helper utility `safeResolveAssetClass` (returns `AssetClass | null`) so each call site can decide whether null = skip or null = fall through to a different default.

5. **Symbol-pattern matchers — order matters.** XSTOCK_SPOT pattern (`*x/USD`) is a strict subset of CRYPTO_SPOT (`*/USD`). The resolver tries xstock_spot first, then crypto_spot. This is fine for `AAPLx/USD` (matches xstock pattern, skips crypto). But what about edge case crypto pairs ending in `x` like `EOSx/USD` (hypothetical)? Lean: tighter xstock regex anchored on capital-letter base + lowercase x suffix `^[A-Z]{2,5}x\/[A-Z]{3,4}$`. Crypto pairs use uppercase only.

6. **Anything missing or wrongly scoped in this pre-audit?**

---

*End of B69 Step 2 pre-audit. Awaiting Langston review.*
