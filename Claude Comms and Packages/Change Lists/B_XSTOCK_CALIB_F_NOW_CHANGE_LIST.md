# B-XSTOCK-CALIB · F-NOW — Step 4 Change List (code review, pre-push)

**Commit:** `f131e0272` on `migration/aws-supabase` (NOT yet pushed — review gate). **Predecessor:** scope+pre-audit `970c9437a`.
**Verification (bench `480d1e3` + my changes):** `npx tsc --noEmit` = **493** (clean baseline on this exact commit re-measured = 493 → **0 net new errors**; the 4 vts-service errors at 548/811/984/990 are pre-existing baseline, NOT mine). `npx vitest run b-xstock-calib-f-now` = **9/9 pass**.
**Your Step1+2 revisions folded:** micro-opt (resolve-once), exported helpers for testability, SIM note text staged for Step 10. Active trading OFF, zero capital.

> INFRASTRUCTURE NOTE (§6.5.0.a): full diff embedded below — no repo navigation needed. DO NOT cd to /mnt/gdrive. For any inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`. Staged to your inbox at `/home/langston/inbox/f-now/`.

---

## 1. Migration `2026-06-01-f-now-calibration-state.sql` (+ rollback, + MANIFEST)

```sql
BEGIN;

ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS calibration_state TEXT NOT NULL
  DEFAULT 'pre_calibration_xstock_2026_05';
COMMENT ON COLUMN vts_open_trades.calibration_state IS '...';

ALTER TABLE exit_strategy_alternates
  ADD COLUMN IF NOT EXISTS calibration_state TEXT;
COMMENT ON COLUMN exit_strategy_alternates.calibration_state IS '...';

-- (c) Retroactive backfill — xStock VTS rows only (Kyle: VTS-only). 17,184 rows.
UPDATE exit_strategy_alternates
   SET calibration_state = 'pre_calibration_xstock_2026_05'
 WHERE asset_class = 'xstock_spot'
   AND trade_source = 'vts'
   AND calibration_state IS NULL;

COMMIT;
```

**Rollback (Q5.1 — confirmed `DROP COLUMN IF EXISTS` both tables):**
```sql
BEGIN;
ALTER TABLE exit_strategy_alternates DROP COLUMN IF EXISTS calibration_state;
ALTER TABLE vts_open_trades          DROP COLUMN IF EXISTS calibration_state;
COMMIT;
```
Bench has no Postgres, so I'll validate the rollback on staging at Step 6 via `BEGIN; <rollback>; ROLLBACK;` (apply-then-transaction-rollback — proves syntax without losing the backfill), plus the forward migration is `ADD COLUMN IF NOT EXISTS` (idempotent). Genuine delta (no `db-migrate:skip`). MANIFEST appended after `2026-06-01-b-new-47-slice-threshold.sql`.

---

## 2. Writer — `exit-strategy-replay-service.ts`

NEW exported `resolveCalibrationState` (your Q2 req-3 fold — resolved value is now directly assertable):
```ts
export async function resolveCalibrationState(
  vtsOpenTradeId: string | undefined,
): Promise<string | null> {
  if (!vtsOpenTradeId) return null;
  try {
    const cr: any = await db.execute(sql`
      SELECT calibration_state FROM vts_open_trades WHERE id = ${vtsOpenTradeId} LIMIT 1
    `);
    const crRows: any[] = cr.rows ?? cr;
    return crRows?.[0]?.calibration_state ?? null;
  } catch (err) {
    console.warn(`[B73][exit-replay] calibration_state lookup failed for vtsOpenTradeId=${vtsOpenTradeId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
```
`ReplayContext` gains `vtsOpenTradeId?: string`. `persistExits` resolves ONCE (your micro-opt) and stamps all 12 rows:
```ts
  const calibrationState = await resolveCalibrationState(ctx.vtsOpenTradeId);
  for (const r of rows) {
    await db.execute(sql`
      INSERT INTO exit_strategy_alternates
        (..., exchange, asset_class, calibration_state)
      VALUES
        (..., 'kraken', ${ctx.assetClass}, ${calibrationState})
      ON CONFLICT (trade_id, variant_id) DO NOTHING
    `);
  }
```

## 3. Caller — `vts-service.ts` (the linkage you flagged)

```ts
        replayAndPersist({
          tradeId: trade.id,
          vtsOpenTradeId: tradeData.originalSignalId,   // NEW — the real open id
          tradeSource: 'vts',
          ...
```
**Your silent-NULL exposure — verified, not just asserted:** `tradeData.originalSignalId` IS populated at this call site. The sole live caller is vts-runner.ts:2444 `vtsService.persistRealPriceTrade({ originalSignalId: trade.id, ... })` where `trade` is the in-memory open record (`.id` = `vts_open_trades.id`). xStock trades open via `registerOpenVtsTrade` (eval-cycle.ts:705) and close through the same shared vts-runner resolution path → originalSignalId always threaded. The deprecated `createVirtualTrade`/`closeTrade` paths are disabled (throw). So `vtsOpenTradeId` is never undefined for a real VTS close.

## 4. Aggregator — `exit-strategy-ablation-aggregator.ts`

NEW exported `buildCalibrationClause` (gated on xstock_spot) + applied to all 3 queries:
```ts
export function buildCalibrationClause(assetClass: string | null) {
  return assetClass === 'xstock_spot'
    ? sql`AND calibration_state IS DISTINCT FROM 'pre_calibration_xstock_2026_05'`
    : sql``;
}
// ... const calibrationClause = buildCalibrationClause(assetClass);
//     added as `${calibrationClause}` after `${assetClassClause}` in variantRows, reasonRows, tradeCountRow.
```
The Q1/Q4 fail-closed warning is captured in the function's doc comment (and goes into SIM at Step 10).

## 5. Tests — `b-xstock-calib-f-now.test.ts` (9, all pass)

- `buildCalibrationClause`: emits the exclusion for `xstock_spot`; emits nothing for `null` and `crypto_spot` (rendered via `PgDialect`).
- `resolveCalibrationState`: returns parent value for a real id; returns a **post-flip** value verbatim (proves flip-proof, no hardcoded tag); returns null + **no DB hit** when id undefined; null on empty result; null + no-throw on lookup error; tolerates bare-array result shape.

---

## 6. Step-8 checklist additions (your Q2 fold)

1. **Forward-path zero-NULL assertion (your req):** after deploy, any xStock VTS alternates row written post-deploy MUST be tagged —
   `SELECT count(*) FROM exit_strategy_alternates WHERE asset_class='xstock_spot' AND trade_source='vts' AND calibration_state IS NULL AND created_at > '<deploy_ts>'` → **must be 0**.
2. Backfill assertion: `SELECT count(*) FROM exit_strategy_alternates WHERE asset_class='xstock_spot' AND trade_source='vts' AND calibration_state IS NULL` → 0 across ALL rows (the 17,184 are tagged).
3. `vts_open_trades`: all 1,791 xStock rows tagged (fast-default).

## 7. Asks

A1. Code-level ACK on the diff (writer null-safety, aggregator gating, migration).
A2. The naming nit (`_2026_05` in June) — it's Kyle's exact string; I'm keeping it and flagging to Kyle. OK to proceed, or do you want it raised as a blocker?
A3. Anything else before I push + run CI + deploy.

---

## REVISION (commit `e87bfbce1`) — opt-in exclusion + A3-1 const fold

**Why:** my Step-2 pre-audit missed a downstream impact — the aggregator feeds the LIVE xStocks-tab "Exit Strategy Ablation" panel via `/api/xstocks/exit-strategy-ablation`, so the as-built unconditional exclusion would have emptied that panel (all 1,432 xStock alternates are pre-cal). Kyle reviewed and chose **keep the live panel showing all trades; apply the exclusion only in the future Phase-25 scoring path.**

**Aggregator now (opt-in, default-off):**
```ts
export const PRE_CALIBRATION_XSTOCK_TAG = 'pre_calibration_xstock_2026_05'; // A3-1 single TS source

export function buildCalibrationClause(assetClass: string | null, excludePreCalibration: boolean) {
  return (excludePreCalibration && assetClass === 'xstock_spot')
    ? sql`AND calibration_state IS DISTINCT FROM ${PRE_CALIBRATION_XSTOCK_TAG}`  // bound param, no inline-literal drift
    : sql``;
}

export async function computeExitStrategyAblation(
  window, regimeFilter = null, assetClass = null,
  opts: { excludePreCalibration?: boolean } = {},   // NEW
) { ... const calibrationClause = buildCalibrationClause(assetClass, opts.excludePreCalibration ?? false); ... }
```
- **Both live route callers UNCHANGED** (routes.ts:7868 + 8757 still pass 3 args) → `opts={}` → `excludePreCalibration=false` → **no exclusion** → live panels byte-identical to pre-F-NOW.
- The exclusion is now **INERT until a Phase-25 caller passes `excludePreCalibration:true`** → declared as scaffolding per CLAUDE.md §9.1 in the completion report.
- Migration carries a cross-ref comment to `PRE_CALIBRATION_XSTOCK_TAG` (the literal must match by hand since `.sql` can't import).

**Unchanged:** stamping (column + NOT NULL DEFAULT), 17,184-row backfill, writer propagation (`resolveCalibrationState` + persistExits) — all still functional now. The whole point (Phase 25 *can* exclude) is delivered; only the *application* of the filter is deferred to its real consumer.

**Verification:** tsc 493 (0 net new), **10/10** tests pass (buildCalibrationClause now covers xstock+true→excludes, xstock+false→live default→no clause, null/crypto+true→no clause; resolveCalibrationState unchanged).

**Re-confirm ask:** this is strictly-safer than what you ACK'd (default-off, live behavior preserved) + your A3-1 fold. OK to push, or any concern with the opt-in shape?
