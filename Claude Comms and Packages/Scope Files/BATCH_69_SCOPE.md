# BATCH 69 — Asset Class as First-Class Schema Dimension

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-05-03
**Status:** Step 1 — APPROVED by Langston (cc-inbox #890, 2026-05-03). Refinements noted: B.2 hard-fail with call-site catch (don't crash PM2 on a single bad symbol); B.3 migrate ablation tables in B69 (confirmed); B.4 B69 before B70 (confirmed); B.8 split RENAME (instant DDL) from UPDATE (slow) if needed; O.1 resolver must handle both Kraken REST format (`XXBTZUSD`) and WS format (`XBT/USD`). Proceeding to Step 2.
**Parent program:** Phase 15c — pre-Phase-16 buildout
**Predecessor:** B68.1 SHIPPED 2026-05-03; B68.x chain modulator series CLOSED.
**Successor:** B70 (Data archiving update — runs in parallel with B69 per Kyle directive 2026-05-03).
**Window dependency:** Runs in parallel with the four calibration observation windows (B67.4 Day 2 / B68.2 Day 1 / B68.3 Day 1 / B68.1 Day 0, all closing 2026-05-15-17). B69 is structural plumbing; no expected interaction with calibration data.

---

## Why this batch exists

B65 (2026-04-23) added `assetClass` as a 5th dimension to `module_constants` and a `text NOT NULL DEFAULT 'crypto_spot'` column to four live tables (`watchlist_pairs`, `trading_signals`, `trades`, `paper_sim_trades`). That established the foundation but stopped short of wiring it through the pipeline. **As of today, the field is dead everywhere outside `module_constants` resolution** — no scanner sets it, no consumer reads it, no UI shows it, no filter routes by it.

B74 (2026-04-30) shipped passive archive pipelines for three universes (`equity_spot` xStocks via Kraken WS, `equity_perp` PF_*XUSD via Kraken Futures REST, `crypto_spot`) with a `universe` field on the six archive tables. **Live tables and archive tables are now misaligned**: archive tables tag rows correctly by universe, but live trading tables silently default everything to `crypto_spot` regardless of source.

Going forward we want to scan and trade across multiple asset classes (xStocks, perpetual futures, FX, etc.). **Adding a new asset class today requires hunting through code paths and patching them one by one.** The goal of B69 is to make asset class a first-class registered dimension that flows through scan → signal → trade → exit → archive uniformly, with a single registration point so adding a new asset class is a one-line change + DB seed rather than a cross-cutting code change.

This is also a **prerequisite for B67.5 consumer wiring** (asset-class-aware confidence routing), **B70 data archiving** (unified archiver across asset classes), **Phase 21.5 exchange expansion** (XStocks + Perp Futures live trading), and **future asset-class-specific external data routing** (e.g., perp funding rates only meaningful for crypto_perp, equity earnings only meaningful for equity_spot).

---

## Scope summary

| Component | What it adds |
|---|---|
| **Canonical asset class registry** | `shared/asset-classes.ts` — enum/const + metadata (display name, default exchange, valid symbol pattern, archive table mapping, future fields documented). Single source of truth. **Initial registry: 4 current + 4 reserved-for-future asset classes (see §A.0).** |
| **B74 archive table column rename** | Six archive tables: `universe` → `asset_class`. "Universe" was our coined term in B74 (not Kraken's), and the per-row column value is identical to what `assetClass` would be. Single source of truth. **The broader concept of "universe of symbols" remains, just the per-row column name changes.** Plus value retag: existing `equity_spot` → `xstock_spot` and `equity_perp` → `xstock_perp` so the names "equity_spot" and "equity_perp" are preserved for real (non-tokenized) equities + real equity futures whenever those land. |
| **Schema extension to remaining live tables** | Add `assetClass` column (with `exchange` if missing) to: `paper_sim_open_positions`, `live_open_positions` (if exists), B67.0 `regime_factor_alternates`, B73 `exit_strategy_alternates`, any other trade-touching table that doesn't have it. Migration backfills `crypto_spot` for existing rows. |
| **Asset class derivation function** | `resolveAssetClass(symbol, exchange)` — single function called by scanner / orchestrator / VTS / paper engine that returns the correct asset class for a (symbol, exchange) pair. Replaces hardcoded `'crypto_spot'` literals. |
| **Insert-site wiring** | Update all `INSERT` sites (scanner, signal-orchestrator, VTS-runner, paper-execution-engine, trade close hooks, B74 archivers) to call `resolveAssetClass` and set the field correctly. Audit pass to find every insert. |
| **Standard "add a new asset class" runbook** | One-page doc capturing the exact steps to add a new entry — register in `shared/asset-classes.ts`, optionally seed `module_constants` keys, optionally add archive partition table, optionally add UI badge color. Goal: future asset classes are a one-page checklist, no architectural rethink required. |
| **UI surfacing** | Add `Asset Class` column to closed trades table, open positions table, signals table. Filter dropdown. Same column visible across paper-sim, VTS, and live views. |
| **Module-constants audit** | Walk every existing row. Identify cross-cutting `*` keys that should actually be asset-class-specific (or note current `*` is correct). Output: `B69_MODULE_CONSTANTS_AUDIT.md`. No row splits in B69 itself — deferred to per-asset-class follow-up batches when each new class actually starts trading. |
| **Backfill SQL** | Walk historical rows, derive asset class from (symbol, exchange) via `resolveAssetClass`, write back. One-time migration step bundled with the column-add migrations. |
| **Tests** | Unit tests for `resolveAssetClass` + registry. Integration tests confirming scanner → signal → trade → close all carry asset class correctly. UI rendering tests. |

---

## §A.0 — Approved asset class registry (Kyle directive 2026-05-03)

| ID | Display name | What it is | Status today | Venue |
|---|---|---|---|---|
| `crypto_spot` | Crypto Spot | Native crypto on spot (BTC/USD, ETH/USD, etc.) | ✅ TRADING | Kraken spot |
| `crypto_perp` | Crypto Perp | Native crypto perpetual swap (XBTUSDPM, etc.) | scanned only | Kraken Futures |
| `xstock_spot` | xStock Spot | Tokenized equity, spot (AAPLx/USD, TSLAx/USD) | scanned only — **renamed from B74's `equity_spot`** | Kraken spot |
| `xstock_perp` | xStock Perp | Tokenized equity, perpetual swap (PF_AAPLXUSD, etc.) | scanned only — **renamed from B74's `equity_perp`** | Kraken Futures |
| `equity_spot` | Equity Spot | Real (non-tokenized) equities on a real equity exchange | reserved for future | non-Kraken |
| `equity_futures` | Equity Futures | Real dated equity-index futures (E-mini ES) | reserved for future | non-Kraken |
| `commodity_futures` | Commodity Futures | Real commodity futures (CL, GC, etc.) | reserved for future | non-Kraken |
| `fx_spot` | FX Spot | Foreign exchange spot (EUR/USD, USD/JPY) | reserved for future | non-Kraken |

**Naming rationale:**
- Three orthogonal dimensions: underlying (crypto / equity / commodity / FX), wrapper (native / tokenized via Backed Finance / xWrapped), instrument shape (spot / perpetual swap / dated futures).
- `xstock_*` prefix preserves real-equity names for whenever real equities arrive — no name collision later.
- "Perp" is reserved for perpetual swap mechanics (crypto + tokenized derivatives). Real equity futures have expiries → `_futures` suffix.
- Each ID is `<asset>_<shape>` for readability and groupable sorting in UI.

**Adding a new asset class going forward** (per the runbook this batch ships):
1. Add ID + display name to `ASSET_CLASSES` const + `ASSET_CLASS_REGISTRY` in `shared/asset-classes.ts`.
2. Seed `resolveAssetClass()` symbol-pattern + exchange disambiguation rule.
3. (If archiving) Add archive partition table + register in B74 batch writer's `tableForAssetClass` map.
4. (Optional) Seed any per-asset-class `module_constants` keys.
5. (Optional) Add UI badge color in registry metadata.

Total surface for adding one new class: ~20 lines + a migration if archive needed. No core logic changes anywhere else.

---

## §A. Numbered Objectives

### A.1 Canonical asset class registry

`shared/asset-classes.ts` (new file):

```typescript
export const ASSET_CLASSES = {
  // Currently scanned / traded
  CRYPTO_SPOT:       'crypto_spot',
  CRYPTO_PERP:       'crypto_perp',
  XSTOCK_SPOT:       'xstock_spot',        // tokenized equity on Kraken spot
  XSTOCK_PERP:       'xstock_perp',        // tokenized equity perp on Kraken Futures
  // Reserved for future (registered now, no rows yet)
  EQUITY_SPOT:       'equity_spot',        // real equities on a real exchange
  EQUITY_FUTURES:    'equity_futures',     // real dated equity-index futures
  COMMODITY_FUTURES: 'commodity_futures',  // real commodity futures
  FX_SPOT:           'fx_spot',            // foreign exchange spot
} as const;

export type AssetClass = typeof ASSET_CLASSES[keyof typeof ASSET_CLASSES];

export interface AssetClassMeta {
  id: AssetClass;
  displayName: string;
  defaultExchange: string;
  symbolPattern: RegExp;            // e.g., /^[A-Z]+\/[A-Z]+$/ for crypto spot
  archiveTable: string | null;      // 'crypto_spot_ohlc_1m' etc.; null when no archiver yet
  active: boolean;                  // true if scanned/traded today; false for reserved-future entries
  badgeColor?: string;              // UI hint
  // Future fields (documented, not wired in B69):
  //   - frictionTier
  //   - defaultFeeModel
  //   - defaultSlippageModel
  //   - sessionHours (for non-24/7 markets)
}

export const ASSET_CLASS_REGISTRY: Record<AssetClass, AssetClassMeta>;

export function resolveAssetClass(symbol: string, exchange: string): AssetClass;
export function isValidAssetClass(value: string): value is AssetClass;
export function getActiveAssetClasses(): AssetClass[];  // filters .active === true
```

**Adding a new asset class = add one entry to `ASSET_CLASSES` + one entry to `ASSET_CLASS_REGISTRY`. No grep-and-patch.**

**A.1.1** Registry is the SINGLE source of truth. Server and client both import from `shared/asset-classes.ts`. No duplicated lists.

**A.1.2** `resolveAssetClass` decides asset class deterministically from (symbol, exchange). Examples:
- `('XBT/USD', 'kraken')` → `crypto_spot`
- `('PF_XBTUSD', 'kraken-futures')` → `crypto_perp`
- `('AAPLx/USD', 'kraken')` → `equity_spot` (xStock with `x` suffix convention)
- `('PF_AAPLXUSD', 'kraken-futures')` → `equity_perp`

Symbol-pattern matching is the primary signal; exchange is the disambiguator when the same symbol could mean different things on different venues. Open Q B.1 below.

### A.2 Schema completeness pass

Audit ALL tables that hold a row representing a trading entity (signal / position / trade / ablation / archive). Every such table must have `assetClass` AND `exchange` columns.

Tables that already have both (per B65 + B74):
- `module_constants` (5D key)
- `watchlist_pairs`
- `trading_signals`
- `trades`
- `paper_sim_trades`
- 6 B74 archive tables (have `universe`, equivalent semantically)

Tables that must be audited and migrated if missing:
- `paper_sim_open_positions` (open position table)
- `live_positions` / `live_open_positions` (if exists)
- `regime_factor_alternates` (B67.0 ablation rows — already has `strategy`; add `asset_class` + `exchange` for cross-cutting analysis)
- `exit_strategy_alternates` (B73 ablation rows)
- `paper_sim_signals` (if separate)
- `regime_phase_history` (if persisted)
- `regime_macro_snapshots` / `external_macro_feed_history` (if persisted)
- `cost_cache` / friction tracking tables
- Any DBS / regime telemetry tables

**A.2.1** Migration adds `assetClass TEXT NOT NULL DEFAULT 'crypto_spot'` and `exchange TEXT NOT NULL DEFAULT 'kraken'` (matching B65 conventions). Rollback drops the columns.

**A.2.2** Backfill walks each table once. For tables that already had pure crypto data, default `crypto_spot` is correct. For any rows where the underlying symbol is xStock/perp (mostly relevant on B74 archive tables which already have `universe`), backfill from `universe`. Conservative: use `resolveAssetClass(symbol, exchange)` to derive, and log any rows where derivation differs from existing value (none expected for live tables since today everything is `crypto_spot`).

### A.3 Insert-site wiring

Find every `INSERT INTO` (or Drizzle equivalent) that writes a row to one of the audited tables. Replace any hardcoded `'crypto_spot'` literal with `resolveAssetClass(symbol, exchange)`.

Expected sites to audit:
- `server/services/market-scanner.ts` (FX5 scanner)
- `server/services/fx5-scanner.ts`
- `server/services/signal-orchestrator.ts` (signal insert + trade open)
- `server/services/vts-runner.ts` (VTS signal insert + trade open + trade close)
- `server/services/paper-execution-engine.ts` (paper trade open + close)
- `server/services/factor-ablation-emitter.ts` (B67.0 emit hook)
- `server/services/exit-strategy-replay-service.ts` (B73 emit hook)
- B74 archivers (already correct via `universe`; verify alignment)
- Any cron / backfill scripts that insert

**A.3.1** Build a single audit table in the pre-audit (Step 2) listing every site, current behavior, and the change.

### A.4 B74 archive-table column rename + value retag

Migration step bundled with the schema-extension migration:

**A.4.1 Column rename.** All 6 B74 archive tables (`equity_spot_ohlc_1m`, `equity_perp_ohlc_1m`, `crypto_spot_ohlc_1m`, `equity_spot_ticker_snap`, `equity_perp_ticker_snap`, `crypto_spot_ticker_snap`) get `ALTER TABLE ... RENAME COLUMN universe TO asset_class`. Rename is metadata-only (instantaneous on partitioned tables); zero downtime.

**A.4.2 Value retag.** Existing rows where `asset_class = 'equity_spot'` → `'xstock_spot'`; rows where `asset_class = 'equity_perp'` → `'xstock_perp'`. Crypto rows unchanged. UPDATE in batches per partition. Volume is small (days-to-weeks of archive data).

**A.4.3 Code rename.** `Universe` type → `AssetClass` type in `server/services/passive-archive/ohlc-batch-writer.ts` and `ticker-batch-writer.ts`. `tableForUniverse` map → `tableForAssetClass` map. Per-archiver hardcoded values: archivers update their literal once each (e.g., `equity-spot-archiver.ts` literal `'equity_spot'` → `'xstock_spot'`).

**A.4.4 What stays "universe".** The broader codebase usage of "universe of symbols" (the SET of pairs we capture) is unchanged. `loadEquitySpotUniverse()` function name → `loadXstockSpotUniverse()` for naming consistency with the value retag, but the file `xstocks-universe.json` keeps its name (the file CONTAINS the universe of xStock symbols — that's accurate). `b74-refresh-universe.ts` script name unchanged. Any code reading "the universe" as a list/set of symbols stays unchanged.

**A.4.5 Default values.** New B74 partition pre-create script defaults are updated: `equity_spot_ohlc_1m` partition default `'xstock_spot'`, `equity_perp_*` default `'xstock_perp'`. Rollback restores `universe` column name and `equity_*` values.

**A.4.6 Risk: B70 dependency.** B70 (data archiving update) is being designed in parallel. If B70's draft references `universe` column or `equity_spot` value, those references update to the new names. Coordinate via shared scope review.

**No runtime invariant needed** — single column means single source of truth. Misalignment risk eliminated by construction.

### A.5 UI surfacing

Three UI sites to update:

1. **Closed Trades table** (Machine Learning page → Closed Trades tab + Trading page → Trade History tab) — add `Asset Class` column. Sortable.
2. **Open Positions table** (multiple consumers) — add `Asset Class` column.
3. **Trading Signals view** — add filter dropdown + display.

**A.5.1** UI imports asset class registry from `shared/asset-classes.ts` so display name + ordering is consistent.

**A.5.2** Color-coded badges per asset class for at-a-glance scanning. Defined in registry metadata.

### A.6 Module-constants audit

Walk every existing `module_constants` row. For each, decide:
- `assetClass = '*'` (cross-cutting, correct as-is) — no change.
- `assetClass = 'crypto_spot'` (was implicitly crypto-only, should be explicit) — UPDATE.
- Should be split per asset class — flag for follow-up batch (do NOT migrate in B69 unless trivial).

Output: `B69_MODULE_CONSTANTS_AUDIT.md` with current → target table.

### A.7 Tests

12+ cases:
- `resolveAssetClass` for each registered class — symbol pattern + exchange disambiguation.
- Unknown symbol pattern → throws or returns sentinel (decide in B.2).
- Registry: every entry has all required fields.
- Schema: migration adds columns idempotently; rollback drops cleanly.
- Backfill: a sample row gets correct asset class.
- Insert-site: a scanner-driven test inserts an xStock symbol and ends up with `assetClass='equity_spot'` not `'crypto_spot'`.
- Live ↔ archive alignment: simulated row pair across live + archive matches.
- UI: closed-trades table renders the column.

---

## §B. Open design questions for Langston (Step 1 review)

1. **Symbol pattern detection — how robust does it need to be in v1?** Kraken's symbol conventions are reasonably distinct (`PF_*` prefix for futures, `*x/USD` for xStocks, plain `*/USD` for crypto spot). Lean: ship with regex-based detection in v1; document the Kraken-specific convention; refactor to per-exchange resolver if Phase 21.5 adds another exchange with different conventions.

2. **Unknown symbol pattern → throw or sentinel?** If `resolveAssetClass` is called with a symbol that doesn't match any registered pattern, options: (a) throw (hard-fail at insert time, surfaces misconfiguration immediately), (b) return `crypto_spot` (default, masks misconfigs), (c) return a new `UNKNOWN` class (visible in UI, doesn't crash but flags). Lean (a) — hard-fail at insert is the §11 Kyle preference for DB-governed settings, and a brand-new asset class showing up should be a deliberate registration not a silent default.

3. **Migration scope of `regime_factor_alternates` and `exit_strategy_alternates` — full add or skip?** These ablation tables already exist and have many rows. Adding columns + backfilling = bigger migration. Alternative: leave them at the schema's existing implicit `crypto_spot` for now (no asset class field), document it, and migrate them in a future batch when the second asset class actually goes live in trading. Lean: ADD to all live tables NOW (per Kyle's "set up so we can add new asset class types easily over time" framing) but leave a clean toggle to skip backfill if it's expensive.

4. **B70 dependency or independence?** B70 is being designed in parallel per Kyle directive 2026-05-03. **A.4.6 flagged the dependency:** if B70's draft references the old `universe` column or `equity_*` values they update to the new names. Lean: B69 ships first (schema dimension foundation); B70 starts after B69 closes so it consumes the renamed columns from day one. Confirm sequencing.

5. **Live trading vs paper-only at v1?** Active live trading is OFF. Paper / VTS are live. Do we need any live-trading-specific hook in B69, or can we punt those to Phase 20/21.5? Lean: punt. Wire paper + VTS + scanner + archive now; add live hooks in the same shape when live trading reactivates.

6. **B67.5 dependency direction?** B67.5 consumer wiring may want asset-class-specific confidence behavior (e.g., different floors per asset class). Should B69 expose enough hooks for B67.5 to do that, or should B67.5 stay asset-class-agnostic at v1? Lean: B69 exposes hooks via `module_constants` 5D resolution (which already supports per-asset-class keys). B67.5 stays agnostic at v1 and per-asset-class tuning is a v2 follow-up.

7. **`exchange` field on tables that currently lack it — same migration or separate?** Some legacy tables may have `assetClass` without `exchange` or vice versa. Lean: same migration adds whichever is missing. Both are part of the modularization 5D key.

8. **`xstock_*` value retag during B74 in-flight production data — concurrent-write safety?** The B74 archivers write to the `equity_spot_ohlc_1m` / `equity_spot_ticker_snap` / `equity_perp_*` tables every few seconds during scan windows. The migration step that retags `equity_spot` → `xstock_spot` and renames the column must coordinate with running archivers. Mitigation options: (a) deploy code change first (archivers read new column name; for a moment values still match `equity_*` because rename hasn't run yet → fail closed); (b) deploy migration first, code second (column briefly missing during ALTER); (c) brief PM2 stop during the migration window. Lean: deploy migration during a known-low-archive-window (e.g., between FX5 cycles), use a single transaction for RENAME + UPDATE, target ~5s lock duration. Specific mitigation in pre-audit.

9. **Anything missing or wrongly scoped?**

---

## §C. Risks + Mitigations

**R1: Backfill on large tables takes time.** `regime_factor_alternates` is high-volume (~1k rows/cycle). On Supabase Micro tier, backfilling could lock the table for minutes. Mitigation: use partition-aware UPDATE in batches (1000 rows per statement) with NOWAIT lock semantics; document expected runtime; run during low-traffic window.

**R2: Insert-site audit miss.** If a single insert site is missed, that table will silently keep writing `crypto_spot` for non-crypto symbols. Mitigation: pre-audit Step 2 lists every insert site; runtime invariant check (A.4.2) catches misconfigurations within minutes of deploy.

**R3: Module-constants 5D key has `assetClass` already, but most rows are `*`.** Splitting some rows by asset class is a behavior change (different config for different asset classes). Mitigation: B69 does NOT split any existing rows by default; A.6 audit just identifies candidates, deferred as follow-up batches when the new asset class actually trades.

**R4: Symbol pattern regex misclassifies edge cases.** E.g., a crypto pair with `x` in the ticker (`USDX/USD`) could match the xStock pattern. Mitigation: tests cover edge cases; per-exchange resolver layer is the v2 fix if Kraken pattern detection isn't robust enough.

**R5: UI column adds visual clutter on already-dense tables.** Mitigation: column is hide-able by default behind a "Show Asset Class" toggle if the team prefers; or render as a compact colored badge that takes minimal space.

**R6: B74 in-flight archiver writes during column rename + value retag (B.8).** Mitigation: pre-audit Step 2 documents the exact deploy/migrate ordering with single-transaction `BEGIN; ALTER TABLE ... RENAME COLUMN; UPDATE ... SET asset_class = ...; COMMIT;` ~5s lock window during a known-quiet FX5 inter-cycle gap. Archivers continue writing post-COMMIT against the new column name.

**R7: B67.5 consumer wiring lands during/after B69.** If B67.5 hardcodes `crypto_spot` somewhere, it'll need to be patched once B69 is live. Mitigation: ship B69 first; B67.5 starts after B69 closes (calibration check ~2026-05-15 + B69 ship by then).

**R8: Naming-rename risk on `loadEquitySpotUniverse()` consumers.** Callers of the universe loaders need to be updated. Mitigation: pre-audit lists every caller; rename is mechanical.

**R9: Kraken xStock symbol convention not yet bulletproof.** Today's heuristic: equity-spot symbols on Kraken end with `x/USD` (AAPLx/USD, TSLAx/USD). If Kraken changes naming or adds tokenized non-equities with the same suffix, `resolveAssetClass` could misclassify. Mitigation: regex anchored on full pattern + per-exchange override hook in registry metadata. v2 if Phase 21.5 introduces a non-Kraken venue with different naming.

---

## §D. Out of Scope

- **Live trading hooks** — punt to Phase 19/20 when live trading reactivates.
- **Module-constants per-asset-class splits** — A.6 audits and identifies; actual splits deferred to follow-up batches per asset class.
- **Per-asset-class friction / fee / slippage models** — documented in registry metadata as future fields; not wired in B69.
- **Full xStock / perp trading pipeline** — Phase 21.5. B69 sets up the schema dimension only.
- **External-data routing** — future batch.
- **Historical re-tagging of CLOSED VTS trades** — B70 (data archiving update) handles retroactive re-labeling per its own scope.

---

## §E. Verification Criteria (Step 11 closure)

- [ ] `shared/asset-classes.ts` exists with registry (8 entries: 4 active + 4 reserved-future) + `resolveAssetClass` + tests
- [ ] All identified live tables have `asset_class` + `exchange` columns (audit list in pre-audit)
- [ ] All 6 B74 archive tables `universe` column renamed to `asset_class`; existing `equity_spot` rows retagged to `xstock_spot`; existing `equity_perp` rows retagged to `xstock_perp`; crypto rows untouched
- [ ] B74 archivers writing to renamed column with retagged values; verified post-deploy via psql
- [ ] Backfill ran cleanly; sample of 100 rows per active asset class verified
- [ ] Every insert site audited in Step 2 has been wired
- [ ] UI tables show Asset Class column with active asset classes rendered correctly
- [ ] Standard "Add a New Asset Class" runbook doc exists (`B69_NEW_ASSET_CLASS_RUNBOOK.md` or appendix in System Manual)
- [ ] `B69_MODULE_CONSTANTS_AUDIT.md` produced (current → target table; no row splits in B69 itself)
- [ ] All 4 CI checks GREEN (TS Check legacy baseline acceptable)
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] Tier 1 governance: BATCH_CATALOG B69 status flipped to SHIPPED, MEMORY (truth + repo), PHASE_HISTORY 15c entry, this scope file → APPROVED, `BATCH_69_PROGRESS_REPORT.md` closure section
- [ ] Tier 2 governance: SIM (asset-class-registry NEW component + per-table updates + B74 archive column rename), CHANGES_AND_FIXES (B69 entry), SYSTEM_MANUAL (asset-class architecture appendix), RUNNING_ISSUES if any deferrals surface

---

## §F. Architectural footprint (preview for Step 2 pre-audit)

| File | Change |
|---|---|
| `shared/asset-classes.ts` | NEW — registry + resolver + types |
| `server/types/asset-classes.ts` | (possibly) re-export thin server wrapper |
| `client/src/types/asset-classes.ts` | (possibly) re-export thin client wrapper or import directly from shared |
| `drizzle/migrations/2026-05-XX-b69-asset-class-extension.sql` + rollback | Schema additions + backfill |
| `server/services/market-scanner.ts` | wire `resolveAssetClass` on watchlist insert |
| `server/services/fx5-scanner.ts` | same |
| `server/services/signal-orchestrator.ts` | wire on signal + trade insert |
| `server/services/vts-runner.ts` | wire on signal + trade open + trade close |
| `server/services/paper-execution-engine.ts` | wire on position open + close |
| `server/services/factor-ablation-emitter.ts` | wire on emit |
| `server/services/exit-strategy-replay-service.ts` | wire on emit |
| `server/services/passive-archive/ohlc-batch-writer.ts` | rename `Universe` type → `AssetClass`; `tableForUniverse` → `tableForAssetClass` |
| `server/services/passive-archive/ticker-batch-writer.ts` | same rename |
| `server/services/passive-archive/equity-spot-archiver.ts` | hardcoded literal `'equity_spot'` → `'xstock_spot'` |
| `server/services/passive-archive/equity-perp-archiver.ts` | hardcoded literal `'equity_perp'` → `'xstock_perp'` |
| `server/services/passive-archive/crypto-spot-archiver.ts` | unchanged literal `'crypto_spot'`, plus updated type import |
| `server/services/passive-archive/universe-loader.ts` | rename `loadEquitySpotUniverse()` → `loadXstockSpotUniverse()`, etc.; consumers updated |
| `server/startup/passive-archive-bootstrap.ts` | wire renamed loaders |
| `server/scripts/b74-create-monthly-partitions.ts` | partition default values updated to `xstock_*` |
| `B69_NEW_ASSET_CLASS_RUNBOOK.md` (or System Manual appendix) | NEW — one-page runbook for adding a new asset class |
| `B69_MODULE_CONSTANTS_AUDIT.md` | NEW — audit of which existing rows could be per-asset-class-split |
| `client/src/components/trading/closed-trades-*.tsx` | UI column |
| `client/src/components/trading/open-positions-*.tsx` | UI column |
| `client/src/components/trading/signals-*.tsx` | UI filter + column |
| `server/tests/unit/asset-classes.test.ts` | NEW — resolver tests |
| `server/tests/integration/b69-insert-sites.test.ts` | NEW — insert-site coverage |

Estimated effort: **~1 week implementation + ~1 day governance**. Core logic is small (registry + resolver), bulk of work is the audit-and-wire pass across many files.

---

## §G. Workflow position

Step 1 of 11. After Langston review + sign-off:
- Step 2 — Pre-implementation audit (SIM consultation; insert-site audit table; backfill plan; module_constants audit).
- Step 3 — Implementation.
- Steps 4-11 — Code review, push, CI, deploy, verify, governance, completion.

---

*End of B69 Step 1 scope. Awaiting Langston review.*
