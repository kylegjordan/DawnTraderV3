# B-XSTOCK-CALIB · F-NOW — calibration_state tag plumbing (SCOPE + PRE-AUDIT, combined)

**Sub-batch:** F-NOW (sub-batch 10 of the B-XSTOCK-CALIB umbrella, §1 row 10).
**From:** CC → **To:** Langston (Step 1 + Step 2 combined review — small plumbing batch).
**Date:** 2026-06-01. **Active trading:** OFF throughout (VTS passive learning only; zero capital).
**Kyle decision (2026-06-01):** **VTS-ONLY.** Tag `vts_open_trades` ONLY — do NOT touch the active-paper `paper_sim_open_positions` path (Phase 19 is far off). Retroactively backfill ALL existing xStock VTS trades; propagate to `exit_strategy_alternates`; the exit-strategy-ablation aggregator excludes pre-cal rows when scoped to xStock.

> INFRASTRUCTURE NOTE (per §6.5.0.a): all load-bearing code is embedded inline below. DO NOT cd to /mnt/gdrive or run git on the mounted repo. For any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`. This file is staged to your inbox at `/home/langston/inbox/f-now/`.

---

## §1. WHAT F-NOW DOES (plain purpose)

Phase 25 will evaluate xStock *closed outcomes* to set posteriors. Every xStock trade currently being simulated is opened under **un-calibrated** thresholds (depth/LQ/VN/DI etc. are being calibrated in B.2–B.7 right now). If we don't mark them, Phase 25's xStock dataset silently mixes pre-calibration noise with post-calibration signal. F-NOW stamps a `calibration_state` tag on every xStock VTS trade so the analysis layer can exclude the pre-calibration cohort cleanly. It changes **no trading behavior** — pure data plumbing.

The tag's "flip" to a post-calibration value is a **future** action (when we begin a clean calibrated dataset, ~Phase 25 boundary). F-NOW only establishes the column, default, retroactive tag, forward propagation, and the aggregator exclusion.

---

## §2. LIVE STAGING DATA (verified 2026-06-01 via psql)

- `calibration_state` does **NOT** exist on either table yet (clean add).
- `vts_open_trades`: **1,791 xStock** (238 open + 1,553 closed) + 2,003 crypto = 3,794 rows.
- `exit_strategy_alternates`: **17,184 xStock VTS rows** (1,432 distinct trades) + 41,928 crypto VTS rows.
- **Zero paper-sourced rows** in `exit_strategy_alternates` (only `trade_source='vts'` exists). Confirms the VTS-only assumption is currently total — there is no active-paper alternates data to worry about.
- Zero NULL-`asset_class` rows in alternates (B79.0i.b backfill is complete). Only two class values: `crypto_spot`, `xstock_spot`.

---

## §3. THE BURIED LINKAGE (key pre-audit finding — must read before reviewing the writer change)

The exit-replay writer's trade id is **NOT** the open-trade id.

- At trade-open, `vts_open_trades.id` = the original open id (e.g. `vts_xstock_spot_<openTs>_<rand>`), set in `registerOpenVtsTrade` (vts-runner.ts:2891) and inserted by `insertOpenTrade` (vts-trade-persistence.ts:104).
- At trade-close, `vts-service.ts persistRealPriceTrade` rebuilds a **new** id from symbol + EXIT time:
  ```ts
  // vts-service.ts:816
  id: `vts_${tradeData.symbol.replace('/', '_')}_${tradeData.exitTime}`,
  ```
  and fires `replayAndPersist({ tradeId: trade.id, ... })` (vts-service.ts:978–979) with **that** exit-based id. So `exit_strategy_alternates.trade_id` ≠ `vts_open_trades.id`.
- The original open id **is** carried, separately, as `originalSignalId` (threaded from vts-runner.ts:2448 `originalSignalId: trade.id`, where `trade` is the in-memory open record whose `.id` = `vts_open_trades.id`). It lands on `signal.id` (vts-service.ts:789) but is **not** currently passed into the replay context.

**Consequence:** a naive forward-propagation that did `SELECT calibration_state FROM vts_open_trades WHERE id = ctx.tradeId` would **silently never match** (returns NULL for every row). The correct key is `originalSignalId`, which we must thread into the replay context.

---

## §4. DESIGN (per-component, file:line)

### 4.1 Migration — `drizzle/migrations/2026-06-01-f-now-calibration-state.sql` (+ rollback)

```sql
BEGIN;

-- (a) vts_open_trades: literal default → Postgres fast-default auto-backfills
--     all 3,794 existing rows; new umbrella-window trades auto-tag pre-cal.
ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS calibration_state TEXT NOT NULL
  DEFAULT 'pre_calibration_xstock_2026_05';

-- (b) exit_strategy_alternates: nullable, NO default. Forward value comes from
--     the parent via the writer (§4.3). Existing xStock rows backfilled below.
ALTER TABLE exit_strategy_alternates
  ADD COLUMN IF NOT EXISTS calibration_state TEXT;

-- (c) Retroactive backfill of existing xStock VTS alternates (17,184 rows).
--     Idempotent via IS NULL. Scoped to xStock + vts (VTS-only; crypto rows
--     left untagged — they are never excluded by the aggregator).
UPDATE exit_strategy_alternates
   SET calibration_state = 'pre_calibration_xstock_2026_05'
 WHERE asset_class = 'xstock_spot'
   AND trade_source = 'vts'
   AND calibration_state IS NULL;

COMMIT;
```
Genuine delta (NOT `-- db-migrate:skip`; mirrors the B-NEW-47 slice-threshold migration). Idempotent → safe on both staging and a fresh CI Postgres built from `initial-schema.sql`. Registered in `MANIFEST.txt` (force-added; `*.sql` is gitignored).

### 4.2 Aggregator exclusion — `exit-strategy-ablation-aggregator.ts`

Add one clause, gated on the xStock class, applied to all three queries (variant agg :77, reason breakdown :98, distinct-trade count :115):
```ts
const calibrationClause = assetClass === 'xstock_spot'
  ? sql`AND calibration_state IS DISTINCT FROM 'pre_calibration_xstock_2026_05'`
  : sql``;
```
- `/api/xstocks/exit-strategy-ablation` (routes.ts:7868) passes `'xstock_spot'` → exclusion fires (xStocks tab hides pre-cal).
- `/api/analytics/exit-strategy-ablation` (routes.ts:8757) passes no class → `assetClass=null` → no exclusion (general view unchanged). Byte-identical to today for the analytics tab.

### 4.3 Forward propagation — writer (`exit-strategy-replay-service.ts` + `vts-service.ts`)

(1) Add an optional open-trade id to `ReplayContext`:
```ts
// exit-strategy-replay-service.ts ReplayContext
vtsOpenTradeId?: string;  // = originalSignalId = vts_open_trades.id; undefined for paper (VTS-only)
```
(2) Thread it at the replay call (vts-service.ts:978):
```ts
replayAndPersist({
  tradeId: trade.id,
  vtsOpenTradeId: tradeData.originalSignalId,   // NEW — the real open id (§3)
  tradeSource: 'vts',
  ...
});
```
(3) Stamp the alternates INSERT from the parent (persistExits :260), SSOT-from-parent, flip-proof:
```sql
INSERT INTO exit_strategy_alternates
  (..., exchange, asset_class, calibration_state)
VALUES
  (..., 'kraken', ${ctx.assetClass},
   ${ctx.vtsOpenTradeId
       ? sql`(SELECT calibration_state FROM vts_open_trades WHERE id = ${ctx.vtsOpenTradeId} LIMIT 1)`
       : sql`NULL`})
ON CONFLICT (trade_id, variant_id) DO NOTHING
```
- xStock close → parent tagged pre-cal → alternates tagged pre-cal. ✓
- After the future flip, new trades' parents carry the new value → alternates inherit it automatically (no writer change needed at flip). ✓
- crypto close → parent carries the (harmless) default → crypto alternates tagged pre-cal going forward; never read by any exclusion. Harmless.
- paper (future Phase 19) → `vtsOpenTradeId` undefined → NULL → untagged → included (correct: post-calibration paper data should not be excluded).

### 4.4 Tests (`server/tests/unit/`)

- Aggregator: pre-cal rows excluded when `assetClass='xstock_spot'`, included when `null`/crypto (mock `db.execute`, assert the clause presence + row math).
- Writer: `persistExits` emits the parent-sub-select when `vtsOpenTradeId` set, `NULL` when unset (assert generated SQL).
- Pure guard: `IS DISTINCT FROM` semantics (NULL alternates row is *included*, pre-cal value is *excluded*).

---

## §5. SIM / BLAST RADIUS (mandatory consult)

- SIM §ablation (lines 1466–1504): replay-service + `exit_strategy_alternates` + aggregator documented. F-NOW adds a column + one writer field + one aggregator clause — no new component, no routing change.
- SIM `vts_open_trades` (lines 1914–1937): writer = vts-trade-persistence.ts; downstream = rehydrate + GC sweep. Adding a defaulted column does not affect rehydrate (SELECT is explicit-column; calibration_state not read at rehydrate) or GC. **Note:** closed `vts_open_trades` rows are GC'd past `data_lifecycle.vts_open_trades.closed_gc_retention_days`, so the alternates **backfill cannot join to the parent** (parent may be gone) — hence the uniform-tag backfill in §4.1(c), which is correct because every existing xStock trade is pre-calibration by definition.
- Blast radius: **LOW.** Two ALTERs (one fast-default, one nullable), one scoped UPDATE, one writer field, one aggregator clause. No behavior change to scanner / regime / strategy / TEC / sizing. Crypto path byte-identical except crypto alternates written *after* deploy carry a never-read tag.

---

## §6. CC ASKS FOR LANGSTON (Step 1 + Step 2)

**Q1 — vts_open_trades default.** CC recommends the **literal `DEFAULT 'pre_calibration_xstock_2026_05'` for all rows** (Kyle's exact instruction; fast-default auto-backfills; new umbrella trades auto-tag with zero write-path code). Tradeoff: crypto rows carry an xStock-named tag — pure semantic noise, never read by any exclusion (always asset-class-scoped). Alternative would be NULL-default + an xStock-only stamp on the open path (cleaner crypto, but adds write-path code + a separate xStock UPDATE). Concur with literal-default, or prefer NULL-default?

**Q2 — forward propagation.** CC recommends the **correlated sub-select keyed on `originalSignalId`/`vtsOpenTradeId`** (§3, §4.3) over an `exit_strategy_alternates` column DEFAULT. Reason: SSOT-from-parent is flip-proof; a column default would silently mistag post-calibration trades as pre-cal at the flip (a footgun). Confirm the `originalSignalId` key is correct and that you're comfortable with the buried-linkage read in §3.

**Q3 — backfill placement.** CC recommends the **17,184-row UPDATE inside the migration** (atomic, small, no separate runner) rather than a separate npm backfill script (the B79.0g/RTB precedent was for much larger / multi-phase backfills). Object?

**Q4 — crypto alternates left untagged.** CC recommends **backfilling xStock only** (Kyle: "backfill all existing xStock VTS trades"); existing crypto alternates stay NULL. Confirm.

**Q5 — anything else** before Step 3 (CI/migration-ordering, test coverage, naming).

If you ACK clean (or with foldable revisions), CC proceeds to Step 3 implementation → C:\dev test bench → push from Google Drive → CI → staging deploy + migration → backfill verify → Step 8.
